import nodemailer from "nodemailer";

const ALLOWED_ROLES = new Set(["admin", "sccs_admin_team_role", "sccs_teacher_ta_role"]);
const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function config() {
  const values = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    smtpHost: process.env.GOOGLE_SMTP_HOST,
    smtpPort: Number(process.env.GOOGLE_SMTP_PORT || 587),
    smtpUser: process.env.GOOGLE_SMTP_USER,
    smtpPassword: process.env.GOOGLE_SMTP_APP_PASSWORD?.replace(/\s/g, ""),
    fromName: process.env.MAIL_FROM_NAME || "SCCS",
    fromAddress: process.env.MAIL_FROM_ADDRESS,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("Student email service is not fully configured.");
  }
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const response = await fetch(`${configuration.url.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: configuration.serviceKey,
      Authorization: `Bearer ${options.token || configuration.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.profile ? { "Accept-Profile": options.profile, "Content-Profile": options.profile } : {}),
    },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  return { ok: response.ok, data };
}

async function requireStaffAccess(request, configuration) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const userResult = await supabaseRequest(configuration, "/auth/v1/user", { token });
  if (!userResult.ok || !userResult.data?.id) return null;
  const roleResult = await supabaseRequest(
    configuration,
    `/rest/v1/user_roles?select=role,teacher_id&user_id=eq.${encodeURIComponent(userResult.data.id)}`,
    { profile: "sccs" },
  );
  const roleRecord = roleResult.data?.[0];
  if (!ALLOWED_ROLES.has(roleRecord?.role)) return null;
  return { user: userResult.data, role: roleRecord.role, teacherId: roleRecord.teacher_id, token };
}

function validEmail(value) {
  const email = String(value || "").trim();
  return EMAIL_PATTERN.test(email) && !email.includes("..") ? email : "";
}

function plain(value, maxLength) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = config();
    const staff = await requireStaffAccess(request, configuration);
    if (!staff) return json(response, 403, { error: "Staff access required." });

    const recipients = Array.from(new Set(
      (Array.isArray(request.body?.recipients) ? request.body.recipients : [])
        .map(validEmail)
        .filter(Boolean),
    ));
    const teacherEmail = validEmail(request.body?.teacherEmail);
    const teacherName = plain(request.body?.teacherName || "SCCS Teacher", 100);
    const subject = plain(request.body?.subject, 160);
    const message = plain(request.body?.message, 10000);

    if (!recipients.length) return json(response, 400, { error: "Please choose at least one valid recipient." });
    if (!teacherEmail) return json(response, 400, { error: "This class does not have a valid teacher email." });
    if (!subject) return json(response, 400, { error: "Title is required." });
    if (!message) return json(response, 400, { error: "Content is required." });

    const transport = nodemailer.createTransport({
      host: configuration.smtpHost,
      port: configuration.smtpPort,
      secure: configuration.smtpPort === 465,
      requireTLS: configuration.smtpPort !== 465,
      auth: { user: configuration.smtpUser, pass: configuration.smtpPassword },
    });

    await transport.sendMail({
      from: { name: teacherName || configuration.fromName, address: configuration.fromAddress },
      replyTo: teacherEmail,
      to: recipients,
      cc: teacherEmail,
      subject,
      text: message,
    });

    return json(response, 200, { message: `Email sent to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.` });
  } catch (error) {
    console.error("Student email failed.", error?.message || error);
    return json(response, 500, { error: error?.message || "Student email failed." });
  }
}
