import nodemailer from "nodemailer";

export const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character],
  );
}

export function mailConfig(serviceName = "Email service") {
  const values = {
    smtpHost: process.env.GOOGLE_SMTP_HOST,
    smtpPort: Number(process.env.GOOGLE_SMTP_PORT || 587),
    smtpUser: process.env.GOOGLE_SMTP_USER,
    smtpPassword: process.env.GOOGLE_SMTP_APP_PASSWORD?.replace(/\s/g, ""),
    fromName: process.env.MAIL_FROM_NAME || "SCCS",
    fromAddress: process.env.MAIL_FROM_ADDRESS,
    siteUrl: process.env.SITE_URL,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error(`${serviceName} is not fully configured.`);
  }
  values.siteUrl = new URL(values.siteUrl).origin;
  return values;
}

export function createTransport(config) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    requireTLS: config.smtpPort !== 465,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });
}

export async function sendMail(config, message) {
  const transport = createTransport(config);
  await transport.sendMail({
    ...message,
    from: { name: config.fromName, address: config.fromAddress },
  });
}

export function portalAccountTemplate({ title, loginUrl, email, password, roleName }) {
  const safeLoginUrl = escapeHtml(loginUrl);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safeRoleName = escapeHtml(roleName);
  return {
    subject: `SCCS ${roleName} Account`,
    text: [
      title,
      "",
      `Your SCCS ${roleName} account is ready.`,
      `Login: ${loginUrl}`,
      `Email: ${email}`,
      `Temporary password: ${password}`,
      "",
      "Please sign in and change your password.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#16294b">
        <h2 style="color:#0e2954">${escapeHtml(title)}</h2>
        <p>Your SCCS ${safeRoleName} account is ready.</p>
        <p style="margin:24px 0">
          <a href="${safeLoginUrl}" style="background:#f0bf32;color:#0e2954;
            padding:12px 20px;text-decoration:none;font-weight:bold">
            Log in to SCCS
          </a>
        </p>
        <p><strong>Login link:</strong> <a href="${safeLoginUrl}">${safeLoginUrl}</a></p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Temporary password:</strong> ${safePassword}</p>
        <p>Please sign in and change your password.</p>
      </div>
    `,
  };
}
