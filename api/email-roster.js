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

function number(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function color({ r, g, b }) {
  return `${number(r)} ${number(g)} ${number(b)}`;
}

function fillRect(x, y, width, height, fill) {
  return `q ${color(fill)} rg ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f Q`;
}

function strokeRect(x, y, width, height, stroke, lineWidth = 0.8) {
  return `q ${color(stroke)} RG ${number(lineWidth)} w ${number(x)} ${number(y)} ${number(width)} ${number(height)} re S Q`;
}

function line(x1, y1, x2, y2, stroke, lineWidth = 0.6) {
  return `q ${color(stroke)} RG ${number(lineWidth)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S Q`;
}

function fitCell(value, width, fontSize) {
  const text = safeText(value);
  const maxCharacters = Math.max(4, Math.floor(width / (fontSize * 0.52)));
  return text.length > maxCharacters ? `${text.slice(0, maxCharacters - 1)}.` : text;
}

function text(x, y, size, value, options = {}) {
  const font = options.font || "F1";
  const fill = options.fill || { r: 0.04, g: 0.15, b: 0.32 };
  return `BT /${font} ${number(size)} Tf ${color(fill)} rg ${number(x)} ${number(y)} Td (${pdfEscape(value)}) Tj ET`;
}

function drawInfoBox(commands, x, y, width, label, value) {
  const border = { r: 0.84, g: 0.88, b: 0.93 };
  commands.push(fillRect(x, y, width, 42, { r: 0.98, g: 0.99, b: 1 }));
  commands.push(strokeRect(x, y, width, 42, border, 0.7));
  commands.push(text(x + 12, y + 25, 7.5, label.toUpperCase(), { font: "F2", fill: { r: 0.42, g: 0.48, b: 0.58 } }));
  commands.push(text(x + 12, y + 11, 10.5, fitCell(value || "-", width - 24, 10.5), { font: "F2" }));
}

function addPageHeader(commands, { course, pageIndex, totalPages, totalStudents }) {
  const navy = { r: 0.04, g: 0.16, b: 0.34 };
  const gold = { r: 0.94, g: 0.75, b: 0.2 };
  const slate = { r: 0.35, g: 0.42, b: 0.52 };

  commands.push(fillRect(0, 574, 792, 38, navy));
  commands.push(fillRect(36, 568, 168, 6, gold));
  commands.push(text(36, 588, 13, "SCCS Class Roster", { font: "F2", fill: { r: 1, g: 1, b: 1 } }));
  commands.push(text(692, 588, 8, `Page ${pageIndex + 1} of ${totalPages}`, { fill: { r: 0.9, g: 0.94, b: 1 } }));
  commands.push(text(36, 539, 21, course.name || "Class", { font: "F2", fill: navy }));
  commands.push(text(36, 520, 9, "Current registration list for teacher reference", { fill: slate }));

  const gap = 12;
  const boxWidth = (720 - gap * 3) / 4;
  const y = 464;
  drawInfoBox(commands, 36, y, boxWidth, "Time", course.time || "-");
  drawInfoBox(commands, 36 + (boxWidth + gap), y, boxWidth, "Teacher", course.teacher || "-");
  drawInfoBox(commands, 36 + (boxWidth + gap) * 2, y, boxWidth, "Room", course.room || "-");
  drawInfoBox(commands, 36 + (boxWidth + gap) * 3, y, boxWidth, "Students", String(totalStudents));
}

function buildRosterPdf({ course, rows }) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 36;
  const tableWidth = pageWidth - margin * 2;
  const tableTop = 430;
  const headerHeight = 27;
  const rowHeight = 19;
  const tableBottom = 46;
  const rowsPerPage = Math.max(1, Math.floor((tableTop - tableBottom - headerHeight) / rowHeight));
  const columns = [
    { label: "Family ID", key: "family_id", width: 72 },
    { label: "Student", key: "student", width: 150 },
    { label: "Parent", key: "parent", width: 150 },
    { label: "Email", key: "email", width: 238 },
    { label: "Phone", key: "phone", width: 110 },
  ];
  const navy = { r: 0.04, g: 0.16, b: 0.34 };
  const goldPale = { r: 0.98, g: 0.91, b: 0.56 };
  const border = { r: 0.84, g: 0.88, b: 0.93 };
  const zebra = { r: 0.95, g: 0.96, b: 1 };
  const pages = [];
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const totalPages = Math.max(1, Math.ceil(normalizedRows.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const slice = normalizedRows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    const commands = [];
    addPageHeader(commands, { course, pageIndex, totalPages, totalStudents: normalizedRows.length });

    commands.push(fillRect(margin, tableTop - headerHeight, tableWidth, headerHeight, goldPale));
    commands.push(strokeRect(margin, tableTop - headerHeight, tableWidth, headerHeight, border, 0.8));

    let x = margin;
    columns.forEach((column) => {
      commands.push(text(x + 10, tableTop - 17, 8.5, column.label, { font: "F2", fill: navy }));
      x += column.width;
    });

    slice.forEach((row, index) => {
      const rowY = tableTop - headerHeight - (index + 1) * rowHeight;
      if (index % 2 === 0) commands.push(fillRect(margin, rowY, tableWidth, rowHeight, zebra));
      commands.push(line(margin, rowY, margin + tableWidth, rowY, border, 0.5));
      let cellX = margin;
      columns.forEach((column) => {
        commands.push(text(cellX + 10, rowY + 6, 8.3, fitCell(row[column.key], column.width - 18, 8.3), { fill: { r: 0.19, g: 0.28, b: 0.44 } }));
        cellX += column.width;
      });
    });

    if (slice.length === 0) {
      commands.push(text(margin + 10, tableTop - headerHeight - 26, 9, "No students are currently registered for this class.", { fill: { r: 0.35, g: 0.42, b: 0.52 } }));
    }

    commands.push(strokeRect(margin, tableTop - headerHeight - Math.max(slice.length, 1) * rowHeight, tableWidth, headerHeight + Math.max(slice.length, 1) * rowHeight, border, 0.8));
    commands.push(text(margin, 24, 7.5, `Generated by SCCS Admin Portal`, { fill: { r: 0.42, g: 0.48, b: 0.58 } }));
    pages.push(commands.join("\n"));
  }

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((content, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
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
