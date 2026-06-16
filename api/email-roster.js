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
    throw new Error("Roster email service is not fully configured.");
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
    `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userResult.data.id)}`,
    { profile: "sccs", token },
  );
  const role = roleResult.data?.[0]?.role;
  return ALLOWED_ROLES.has(role) ? { user: userResult.data, role, token } : null;
}

function safeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value) {
  return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fit(value, width) {
  const text = safeText(value);
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}.` : text.padEnd(width, " ");
}

function contentLine(x, y, size, text) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`;
}

function buildRosterPdf({ course, rows }) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 36;
  const rowHeight = 14;
  const rowsPerPage = 31;
  const pages = [];
  const normalizedRows = Array.isArray(rows) ? rows : [];

  for (let pageIndex = 0; pageIndex === 0 || pageIndex * rowsPerPage < normalizedRows.length; pageIndex += 1) {
    const yStart = pageHeight - margin;
    const slice = normalizedRows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    const lines = [
      contentLine(margin, yStart, 16, `SCCS Class Roster: ${course.name || ""}`),
      contentLine(margin, yStart - 22, 10, [
        course.time ? `Time: ${course.time}` : "",
        course.teacher ? `Teacher: ${course.teacher}` : "",
        course.room ? `Room: ${course.room}` : "",
      ].filter(Boolean).join("    ")),
      contentLine(margin, yStart - 44, 8, `${fit("Family ID", 10)} ${fit("Student", 22)} ${fit("Parent", 22)} ${fit("Email", 34)} ${fit("Phone", 14)}`),
      contentLine(margin, yStart - 56, 8, "-".repeat(108)),
    ];
    slice.forEach((row, index) => {
      lines.push(contentLine(margin, yStart - 72 - index * rowHeight, 8, [
        fit(row.family_id, 10),
        fit(row.student, 22),
        fit(row.parent, 22),
        fit(row.email, 34),
        fit(row.phone, 14),
      ].join(" ")));
    });
    lines.push(contentLine(margin, 24, 8, `Page ${pageIndex + 1}`));
    pages.push(lines.join("\n"));
  }

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((content, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
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

    const teacherEmail = String(request.body?.teacherEmail || "").trim();
    if (!EMAIL_PATTERN.test(teacherEmail) || teacherEmail.includes("..")) {
      return json(response, 400, { error: "This class does not have a valid teacher email." });
    }

    const course = request.body?.course || {};
    const rows = Array.isArray(request.body?.rows) ? request.body.rows : [];
    const pdf = buildRosterPdf({ course, rows });
    const subject = `SCCS Roster - ${safeText(course.name || "Class")}`;

    const transport = nodemailer.createTransport({
      host: configuration.smtpHost,
      port: configuration.smtpPort,
      secure: configuration.smtpPort === 465,
      requireTLS: configuration.smtpPort !== 465,
      auth: { user: configuration.smtpUser, pass: configuration.smtpPassword },
    });
    await transport.sendMail({
      from: { name: configuration.fromName, address: configuration.fromAddress },
      to: teacherEmail,
      subject,
      text: [
        `Attached is the current roster for ${safeText(course.name || "this class")}.`,
        course.time ? `Time: ${safeText(course.time)}` : "",
        course.teacher ? `Teacher: ${safeText(course.teacher)}` : "",
        course.room ? `Room: ${safeText(course.room)}` : "",
      ].filter(Boolean).join("\n"),
      attachments: [{
        filename: `${safeText(course.name || "class").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "class"}-roster.pdf`,
        content: pdf,
        contentType: "application/pdf",
      }],
    });

    return json(response, 200, { message: "Roster PDF sent to teacher." });
  } catch (error) {
    console.error("Roster email failed.", error?.message || error);
    return json(response, 500, { error: error?.message || "Roster email failed." });
  }
}
