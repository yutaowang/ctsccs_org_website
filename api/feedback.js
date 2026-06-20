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
    feedbackTo: process.env.FEEDBACK_TO_ADDRESS || "info@ctsccs.org",
    ...mailConfig("Feedback email service"),
  };
  if (!values.supabaseUrl || !values.serviceRoleKey) {
    throw new Error("Feedback service is not fully configured.");
  }
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const response = await fetch(`${configuration.supabaseUrl.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  return { ok: response.ok, status: response.status, data };
}

function feedbackTemplate({ name, email, phone, message }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || "Not provided");
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  return {
    subject: `SCCS Website Feedback from ${name}`,
    text: [
      "SCCS Website Feedback",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      "",
      message,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#16294b">
        <h2 style="color:#0e2954">SCCS Website Feedback</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <hr style="border:0;border-top:1px solid #dce1e8;margin:24px 0">
        <p>${safeMessage}</p>
      </div>
    `,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  const name = String(request.body?.name || "").trim();
  const email = String(request.body?.email || "").trim().toLowerCase();
  const phone = String(request.body?.phone || "").trim();
  const message = String(request.body?.message || "").trim();

  if (!name || name.length > 100) {
    return json(response, 400, { error: "Please enter your name." });
  }
  if (!EMAIL_PATTERN.test(email) || email.includes("..")) {
    return json(response, 400, { error: "Please enter a valid email address." });
  }
  if (phone.length > 50) {
    return json(response, 400, { error: "Phone number is too long." });
  }
  if (!message || message.length > 5000) {
    return json(response, 400, { error: "Please enter feedback up to 5000 characters." });
  }
  if (isRateLimited(request, email)) {
    return json(response, 429, { error: "Too many requests. Please try again later." });
  }

  try {
    const configuration = config();
    const insert = await supabaseRequest(configuration, "/rest/v1/feedback", {
      method: "POST",
      prefer: "return=minimal",
      body: { name, email, phone: phone || null, message },
    });
    if (!insert.ok) throw new Error(insert.data?.message || "Could not save feedback.");

    await sendMail(configuration, {
      to: configuration.feedbackTo,
      replyTo: email,
      ...feedbackTemplate({ name, email, phone, message }),
    });
    return json(response, 200, { message: "Thank you for your feedback." });
  } catch (error) {
    console.error("Feedback submission failed.", error?.message || error);
    return json(response, 400, {
      error: error?.message || "Feedback submission failed. Please try again later.",
    });
  }
}
