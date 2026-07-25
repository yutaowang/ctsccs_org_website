import { randomBytes, randomInt } from "node:crypto";
import { mailConfig, sendMail } from "../lib/mail.js";

const STAFF_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@ctsccs\.org$/i;
const PASSWORD_EMAIL_FROM = "ywang@ctsccs.org";
const GENERIC_MESSAGE =
  "If an account exists, a new password has been sent to that ctsccs.org email address.";
const attempts = new Map();

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function configuration() {
  const values = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!values.url || !values.serviceKey) {
    throw new Error("Admin password service is not configured.");
  }
  return values;
}

async function supabaseRequest(config, path, options = {}) {
  const result = await fetch(`${config.url.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.profile
        ? { "Accept-Profile": options.profile, "Content-Profile": options.profile }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  return { ok: result.ok, status: result.status, data };
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  return (Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || request.socket?.remoteAddress || "unknown").split(",")[0]
  ).trim();
}

function addAttempt(key, now, windowMs) {
  const recent = (attempts.get(key) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  recent.push(now);
  attempts.set(key, recent);
  return recent.length;
}

function isRateLimited(request, email) {
  const now = Date.now();
  const windowMs = 60 * 60_000;
  const ipCount = addAttempt(`ip:${clientIp(request)}`, now, windowMs);
  const accountCount = addAttempt(`account:${email}`, now, windowMs);
  return ipCount > 10 || accountCount > 3;
}

export async function findAuthUser(config, email) {
  for (let page = 1; ; page += 1) {
    const result = await supabaseRequest(
      config,
      `/auth/v1/admin/users?page=${page}&per_page=1000`,
    );
    if (!result.ok) {
      throw new Error(result.data?.message || "Could not load Auth users.");
    }
    const users = result.data?.users || [];
    const match = users.find(
      (user) => String(user.email || "").toLowerCase() === email,
    );
    if (match || users.length < 1000) return match || null;
  }
}

export async function isKnownPortalEmail(config, email, userId) {
  const encodedEmail = encodeURIComponent(email);
  const encodedUserId = encodeURIComponent(userId);
  const [teacher, administrator, adminTeam, superAdministrator] =
    await Promise.all([
      supabaseRequest(
        config,
        `/rest/v1/teachers?select=id&email_1=ilike.${encodedEmail}&limit=1`,
        { profile: "sccs" },
      ),
      supabaseRequest(
        config,
        `/rest/v1/admins?select=user_id&email=ilike.${encodedEmail}&limit=1`,
        { profile: "sccs" },
      ),
      supabaseRequest(
        config,
        `/rest/v1/admin_team_members?select=user_id&email=ilike.${encodedEmail}&limit=1`,
        { profile: "sccs" },
      ),
      supabaseRequest(
        config,
        `/rest/v1/user_roles?select=user_id&user_id=eq.${encodedUserId}&role=eq.sccs_superadmin_role&limit=1`,
        { profile: "sccs" },
      ),
    ]);
  const failed = [teacher, administrator, adminTeam, superAdministrator].find(
    (result) => !result.ok,
  );
  if (failed) {
    throw new Error(
      failed.data?.message || "Could not verify the portal email address.",
    );
  }
  return [teacher, administrator, adminTeam, superAdministrator].some(
    (result) => result.data?.length > 0,
  );
}

function shuffle(value) {
  const characters = [...value];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters.join("");
}

export function generateTemporaryPassword() {
  const required = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)],
    "abcdefghijkmnopqrstuvwxyz"[randomInt(25)],
    "23456789"[randomInt(8)],
    "!@#$%*+-?"[randomInt(9)],
  ];
  const remainder = randomBytes(12)
    .toString("base64url")
    .slice(0, 12);
  return shuffle(required.join("") + remainder);
}

function passwordEmail({ username, password }) {
  const loginUrl = "https://ctsccs.org/admin";
  const text = [
    `SCCS Admin Portal: ${loginUrl}`,
    `Username: ${username}`,
    `Password: ${password}`,
  ].join("\n");
  return {
    subject: "SCCS Admin Portal Password",
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#16294b;line-height:1.7">
      <p><strong>SCCS Admin Portal:</strong> <a href="${loginUrl}">${loginUrl}</a><br>
      <strong>Username:</strong> ${username}<br>
      <strong>Password:</strong> ${password}</p>
    </div>`,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  const username = String(request.body?.email || "").trim().toLowerCase();
  if (!STAFF_EMAIL.test(username) || username.includes("..")) {
    return json(response, 400, {
      error: "Please enter a valid ctsccs.org email address.",
    });
  }
  if (isRateLimited(request, username)) {
    return json(response, 429, {
      error: "Too many requests. Please try again later.",
    });
  }

  try {
    const config = configuration();
    const user = await findAuthUser(config, username);
    if (!user) {
      console.info("Admin password request did not match an Auth user.");
      return json(response, 200, { message: GENERIC_MESSAGE });
    }

    const knownPortalEmail = await isKnownPortalEmail(config, username, user.id);
    if (!knownPortalEmail) {
      console.info("Admin password request did not match a portal directory email.");
      return json(response, 200, { message: GENERIC_MESSAGE });
    }

    const password = generateTemporaryPassword();
    const updated = await supabaseRequest(
      config,
      `/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
      { method: "PUT", body: { password } },
    );
    if (!updated.ok) {
      throw new Error(updated.data?.message || "Could not update staff password.");
    }

    const emailConfig = mailConfig("Admin password email service");
    const delivery = await sendMail(emailConfig, {
      from: { name: "SCCS", address: PASSWORD_EMAIL_FROM },
      to: username,
      ...passwordEmail({ username, password }),
    });
    console.info("Admin password email accepted by SMTP.", {
      accepted: delivery.accepted.length,
      rejected: delivery.rejected.length,
    });
    return json(response, 200, { message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Admin password request failed.", error?.message || error);
    return json(response, 500, {
      error: "Password service is temporarily unavailable. Please try again later.",
    });
  }
}
