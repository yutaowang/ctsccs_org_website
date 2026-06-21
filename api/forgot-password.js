import nodemailer from "nodemailer";

const GENERIC_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";
const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const attempts = new Map();

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function isRateLimited(request, email) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || request.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const key = `${ip}:${email}`;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < 15 * 60_000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 5;
}

function requiredEnvironment() {
  const values = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    smtpHost: process.env.GOOGLE_SMTP_HOST,
    smtpPort: Number(process.env.GOOGLE_SMTP_PORT || 587),
    smtpUser: process.env.GOOGLE_SMTP_USER,
    smtpPassword: process.env.GOOGLE_SMTP_APP_PASSWORD?.replace(/\s/g, ""),
    fromName: process.env.MAIL_FROM_NAME || "SCCS",
    fromAddress: process.env.MAIL_FROM_ADDRESS,
    siteUrl: process.env.SITE_URL,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("Password reset service is not fully configured.");
  }
  values.siteUrl = new URL(values.siteUrl).origin;
  return values;
}

function escapeHtml(value) {
  return value.replace(
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

function emailTemplate(actionLink) {
  const safeActionLink = escapeHtml(new URL(actionLink).toString());
  return {
    subject: "SCCS Password Reset / SCCS 密码重置",
    text: [
      "SCCS Password Reset",
      "",
      "Use the link below to set a new password:",
      actionLink,
      "",
      "If you did not request this change, you can ignore this email.",
      "",
      "SCCS 密码重置",
      "",
      "请使用以下链接设置新密码：",
      actionLink,
      "",
      "如果您没有申请重置密码，请忽略此邮件。",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#16294b">
        <h2 style="color:#0e2954">SCCS Password Reset</h2>
        <p>Use the button below to set a new password.</p>
        <p style="margin:28px 0">
          <a href="${safeActionLink}" style="background:#f0bf32;color:#0e2954;
            padding:12px 20px;text-decoration:none;font-weight:bold">
            Set a new password
          </a>
        </p>
        <p>If you did not request this change, you can ignore this email.</p>
        <hr style="border:0;border-top:1px solid #dce1e8;margin:28px 0">
        <h2 style="color:#0e2954">SCCS 密码重置</h2>
        <p>请点击下面的按钮设置新密码。</p>
        <p style="margin:28px 0">
          <a href="${safeActionLink}" style="background:#f0bf32;color:#0e2954;
            padding:12px 20px;text-decoration:none;font-weight:bold">
            设置新密码
          </a>
        </p>
        <p>如果您没有申请重置密码，请忽略此邮件。</p>
      </div>
    `,
  };
}

async function generateRecoveryLink(config, email) {
  const endpoint = new URL(
    "/auth/v1/admin/generate_link",
    config.supabaseUrl,
  );
  const result = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "recovery",
      email,
      redirect_to: `${config.siteUrl}/reset-password`,
    }),
  });

  if (!result.ok) {
    console.warn("Password reset link was not generated.", result.status);
    return null;
  }
  const data = await result.json();
  const tokenHash = data.properties?.hashed_token || data.hashed_token;
  if (!tokenHash) return null;

  const resetUrl = new URL("/reset-password", config.siteUrl);
  resetUrl.searchParams.set("type", "recovery");
  resetUrl.searchParams.set("token_hash", tokenHash);
  return resetUrl.toString();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  const email = String(request.body?.email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.includes("..")) {
    return json(response, 400, { error: "Please enter a valid email address." });
  }
  if (isRateLimited(request, email)) {
    return json(response, 429, { error: "Too many requests. Please try again later." });
  }

  try {
    const config = requiredEnvironment();
    const actionLink = await generateRecoveryLink(config, email);

    // Return the same response when the account does not exist.
    if (!actionLink) {
      return json(response, 200, { message: GENERIC_MESSAGE });
    }

    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      requireTLS: config.smtpPort !== 465,
      auth: { user: config.smtpUser, pass: config.smtpPassword },
    });
    const template = emailTemplate(actionLink);
    await transport.sendMail({
      from: { name: config.fromName, address: config.fromAddress },
      to: email,
      ...template,
    });

    return json(response, 200, { message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Password reset request failed.", error?.message || error);
    return json(response, 500, {
      error: "Password reset is temporarily unavailable. Please try again later.",
    });
  }
}
