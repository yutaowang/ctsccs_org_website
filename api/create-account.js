import { EMAIL_PATTERN, escapeHtml, mailConfig, sendMail } from "./mail.js";

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

function config() {
  const values = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...mailConfig("Account validation email service"),
  };
  if (!values.supabaseUrl || !values.serviceRoleKey) {
    throw new Error("Account validation service is not fully configured.");
  }
  return values;
}

async function generateSignupLink(configuration, email, password) {
  const endpoint = new URL("/auth/v1/admin/generate_link", configuration.supabaseUrl);
  const result = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "signup",
      email,
      password,
      redirect_to: `${configuration.siteUrl}/account`,
      data: { portal: "family" },
    }),
  });

  const text = await result.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!result.ok) {
    throw new Error(data?.msg || data?.message || "Could not create account validation link.");
  }
  const actionLink = data?.action_link || data?.properties?.action_link;
  if (!actionLink) throw new Error("Could not create account validation link.");
  return actionLink;
}

function validationTemplate(actionLink) {
  const safeActionLink = escapeHtml(new URL(actionLink).toString());
  return {
    subject: "Validate your SCCS account",
    text: [
      "Validate your SCCS account",
      "",
      "Please use the link below to validate your email address and finish creating your account:",
      actionLink,
      "",
      "If you did not request this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#16294b">
        <h2 style="color:#0e2954">Validate your SCCS account</h2>
        <p>Please use the button below to validate your email address and finish creating your account.</p>
        <p style="margin:24px 0">
          <a href="${safeActionLink}" style="background:#f0bf32;color:#0e2954;
            padding:12px 20px;text-decoration:none;font-weight:bold">
            Validate email
          </a>
        </p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${safeActionLink}">${safeActionLink}</a></p>
        <p>If you did not request this account, you can ignore this email.</p>
      </div>
    `,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  if (!EMAIL_PATTERN.test(email) || email.includes("..")) {
    return json(response, 400, { error: "Please enter a valid email address." });
  }
  if (password.length < 8) {
    return json(response, 400, { error: "Password must be at least 8 characters." });
  }
  if (isRateLimited(request, email)) {
    return json(response, 429, { error: "Too many requests. Please try again later." });
  }

  try {
    const configuration = config();
    const actionLink = await generateSignupLink(configuration, email, password);
    await sendMail(configuration, {
      to: email,
      ...validationTemplate(actionLink),
    });
    return json(response, 200, {
      message: "Please check your email and validate your account before signing in.",
    });
  } catch (error) {
    console.error("Account creation failed.", error?.message || error);
    return json(response, 400, {
      error: error?.message || "Account creation failed. Please try again later.",
    });
  }
}
