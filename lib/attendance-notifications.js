import { createTransport, escapeHtml, EMAIL_PATTERN, mailConfig } from "./mail.js";

const ADMIN_ROLES = new Set(["sccs_superadmin_role", "sccs_admin_team_role"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function config() {
  const values = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!values.url || !values.serviceKey) {
    throw new Error("Attendance notification service is not fully configured.");
  }
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const result = await fetch(`${configuration.url.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: configuration.serviceKey,
      Authorization: `Bearer ${options.token || configuration.serviceKey}`,
      "Content-Type": "application/json",
      "Accept-Profile": "sccs",
      "Content-Profile": "sccs",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await result.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }
  return { ok: result.ok, status: result.status, data };
}

async function requireAdmin(request, configuration) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const userResult = await supabaseRequest(configuration, "/auth/v1/user", { token });
  if (!userResult.ok || !userResult.data?.id) return null;
  const roleResult = await supabaseRequest(
    configuration,
    `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userResult.data.id)}`,
    { token },
  );
  return ADMIN_ROLES.has(roleResult.data?.[0]?.role) ? { user: userResult.data } : null;
}

export function validDate(value) {
  const text = String(value || "");
  if (!DATE_PATTERN.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : "";
}

function validEmail(value) {
  const email = String(value || "").trim();
  return EMAIL_PATTERN.test(email) && !email.includes("..") ? email : "";
}

function name(row, prefix = "") {
  return [row?.[`${prefix}first_name`], row?.[`${prefix}last_name`]].filter(Boolean).join(" ").trim();
}

export function chineseDate(value) {
  const [year, month, day] = value.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

export function messageFor({ classDate, courseName }) {
  const subject = `尊敬的家长，您小孩今天缺席${courseName}课程，提请注意`;
  const text = [
    `尊敬的家长，您小孩今天${chineseDate(classDate)}，缺席${courseName}课程，被老师标记为 Absent。如果您知晓此事，请忽略此邮件；如果您确认您小孩今天来了学校，请联系 SCCS 管理团队：https://ctsccs.org/administration`,
    "谢谢您的配合。",
    "SCCS 管理团队",
    "https://ctsccs.org/administration",
  ].join("\n");
  const link = "https://ctsccs.org/administration";
  const html = `
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#16294b">
      <p>尊敬的家长，您小孩今天${escapeHtml(chineseDate(classDate))}，缺席${escapeHtml(courseName)}课程，被老师标记为 Absent。如果您知晓此事，请忽略此邮件；如果您确认您小孩今天来了学校，请联系 SCCS 管理团队：<a href="${link}">${link}</a></p>
      <p>谢谢您的配合。</p>
      <p>SCCS 管理团队<br><a href="${link}">${link}</a></p>
    </div>`;
  return { subject, text, html };
}

function idsFilter(values) {
  return `in.(${Array.from(new Set(values)).map((value) => Number(value)).filter(Number.isFinite).join(",")})`;
}

async function loadLatestReport(configuration, classDate, token) {
  const runResult = await supabaseRequest(
    configuration,
    `/rest/v1/attendance_notification_runs?select=*&class_date=eq.${classDate}&order=created_at.desc&limit=1`,
    { token },
  );
  if (!runResult.ok) throw new Error(runResult.data?.message || "Could not load the notification report.");
  const run = runResult.data?.[0];
  if (!run) return null;
  const recipientResult = await supabaseRequest(
    configuration,
    `/rest/v1/attendance_notification_recipients?select=*&notification_run_id=eq.${run.id}&order=student_name.asc,course_name.asc`,
    { token },
  );
  if (!recipientResult.ok) throw new Error(recipientResult.data?.message || "Could not load notification recipients.");
  return { ...run, recipients: recipientResult.data || [] };
}

async function buildRecipients(configuration, classDate) {
  const attendanceResult = await supabaseRequest(
    configuration,
    `/rest/v1/attendance?select=id,class_id,student_id&class_date=eq.${classDate}&status=eq.absent`,
  );
  if (!attendanceResult.ok) throw new Error(attendanceResult.data?.message || "Could not load absent students.");
  const attendance = attendanceResult.data || [];
  if (!attendance.length) return [];

  const [studentResult, classResult] = await Promise.all([
    supabaseRequest(configuration, `/rest/v1/students?select=id,family_id,first_name,last_name,chinese_name&id=${idsFilter(attendance.map((row) => row.student_id))}`),
    supabaseRequest(configuration, `/rest/v1/classes?select=id,name,short_name&id=${idsFilter(attendance.map((row) => row.class_id))}`),
  ]);
  if (!studentResult.ok || !classResult.ok) throw new Error("Could not load student or class details.");
  const students = new Map((studentResult.data || []).map((row) => [row.id, row]));
  const classes = new Map((classResult.data || []).map((row) => [row.id, row]));
  const familyIds = (studentResult.data || []).map((row) => row.family_id).filter(Boolean);
  const familyResult = familyIds.length
    ? await supabaseRequest(configuration, `/rest/v1/families?select=id,parent_first_name,parent_last_name,parent_chinese_name,family_name,email,phone&id=${idsFilter(familyIds)}`)
    : { ok: true, data: [] };
  if (!familyResult.ok) throw new Error(familyResult.data?.message || "Could not load family contacts.");
  const families = new Map((familyResult.data || []).map((row) => [row.id, row]));

  return attendance.map((record) => {
    const student = students.get(record.student_id) || {};
    const family = families.get(student.family_id) || {};
    const course = classes.get(record.class_id) || {};
    const courseName = course.name || course.short_name || `Class ${record.class_id}`;
    const template = messageFor({ classDate, courseName });
    return {
      attendance_id: record.id,
      class_id: record.class_id,
      student_id: record.student_id,
      family_id: family.id || null,
      student_name: [name(student), student.chinese_name].filter(Boolean).join(" · ") || `Student ${record.student_id}`,
      parent_name: [name(family, "parent_"), family.parent_chinese_name || family.family_name].filter(Boolean).join(" · ") || null,
      email: validEmail(family.email) || null,
      phone: String(family.phone || "").trim() || null,
      course_name: courseName,
      subject: template.subject,
      template,
    };
  });
}

async function updateRecipient(configuration, id, body) {
  const result = await supabaseRequest(
    configuration,
    `/rest/v1/attendance_notification_recipients?id=eq.${id}`,
    { method: "PATCH", body, prefer: "return=minimal" },
  );
  if (!result.ok) throw new Error(result.data?.message || "Could not update recipient result.");
}

export async function handleAttendanceNotifications(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return json(response, 405, { error: "Method not allowed." });
  }
  try {
    const configuration = config();
    const admin = await requireAdmin(request, configuration);
    if (!admin) return json(response, 403, { error: "Admin Team access required." });
    const classDate = validDate(request.method === "GET" ? request.query?.classDate : request.body?.classDate);
    if (!classDate) return json(response, 400, { error: "A valid attendance date is required." });
    if (request.method === "GET") {
      return json(response, 200, { report: await loadLatestReport(configuration, classDate, request.headers.authorization.slice(7)) });
    }

    const mailConfiguration = { ...configuration, ...mailConfig("Attendance notification service") };
    const recipients = await buildRecipients(configuration, classDate);
    if (!recipients.length) return json(response, 400, { error: "No absent students were found for this date." });
    const runResult = await supabaseRequest(configuration, "/rest/v1/attendance_notification_runs", {
      method: "POST",
      body: { class_date: classDate, requested_by: admin.user.id, recipient_count: recipients.length },
      prefer: "return=representation",
    });
    if (!runResult.ok) throw new Error(runResult.data?.message || "Could not create notification report.");
    const run = runResult.data?.[0];
    const rows = recipients.map(({ template, ...recipient }) => ({
      ...recipient,
      notification_run_id: run.id,
      delivery_status: recipient.email ? "pending" : "skipped",
      error_message: recipient.email ? null : "No valid family email address.",
    }));
    const insertResult = await supabaseRequest(configuration, "/rest/v1/attendance_notification_recipients", {
      method: "POST", body: rows, prefer: "return=representation",
    });
    if (!insertResult.ok) throw new Error(insertResult.data?.message || "Could not save notification recipients.");

    const transport = createTransport(mailConfiguration);
    const savedByAttendance = new Map((insertResult.data || []).map((row) => [row.attendance_id, row]));
    const sendable = recipients.filter((recipient) => recipient.email);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(5, sendable.length) }, async () => {
      while (nextIndex < sendable.length) {
        const recipient = sendable[nextIndex];
        nextIndex += 1;
        const saved = savedByAttendance.get(recipient.attendance_id);
        try {
          await transport.sendMail({
            from: { name: mailConfiguration.fromName, address: mailConfiguration.fromAddress },
            to: recipient.email,
            subject: recipient.template.subject,
            text: recipient.template.text,
            html: recipient.template.html,
          });
          await updateRecipient(configuration, saved.id, { delivery_status: "sent", sent_at: new Date().toISOString(), error_message: null });
        } catch (error) {
          await updateRecipient(configuration, saved.id, { delivery_status: "failed", error_message: String(error?.message || "Email delivery failed.").slice(0, 1000) });
        }
      }
    });
    await Promise.all(workers);
    const report = await loadLatestReport(configuration, classDate, request.headers.authorization.slice(7));
    const sent = report.recipients.filter((row) => row.delivery_status === "sent").length;
    const failed = report.recipients.filter((row) => row.delivery_status === "failed").length;
    const skipped = report.recipients.filter((row) => row.delivery_status === "skipped").length;
    const status = sent === recipients.length ? "completed" : sent ? "partial" : "failed";
    const finishResult = await supabaseRequest(configuration, `/rest/v1/attendance_notification_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: { status, sent_count: sent, failed_count: failed, skipped_count: skipped, completed_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
    if (!finishResult.ok) throw new Error(finishResult.data?.message || "Could not finalize notification report.");
    return json(response, 200, {
      message: `Attendance notifications finished: ${sent} sent, ${failed} failed, ${skipped} skipped.`,
      report: { ...report, status, sent_count: sent, failed_count: failed, skipped_count: skipped },
    });
  } catch (error) {
    console.error("Attendance notification failed.", error?.message || error);
    return json(response, 500, { error: error?.message || "Attendance notification failed." });
  }
}

export default handleAttendanceNotifications;
