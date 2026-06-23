import { EMAIL_PATTERN, escapeHtml, mailConfig, sendMail } from "./mail.js";

const attempts = new Map();
const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
]);
const ZIP_PATTERN = /^[0-9]{5}$/;
const PHONE_PATTERN = /^[0-9]{3}-[0-9]{3}-[0-9]{4}$/;
const SIMPLE_EMAIL_PATTERN = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;

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

function clean(value) {
  const text = String(value || "").trim();
  return text || null;
}

function validateProfile(body) {
  const profile = body.profile || {};
  const payload = {
    family_name: clean(profile.family_name),
    parent_first_name: clean(profile.parent_first_name),
    parent_last_name: clean(profile.parent_last_name),
    parent_chinese_name: clean(profile.parent_chinese_name),
    address: clean(profile.address),
    city: clean(profile.city),
    state: clean(profile.state) || "CT",
    zip: clean(profile.zip),
    phone: clean(profile.phone),
    wechat: clean(profile.wechat),
    pfizer_employee: Boolean(profile.pfizer_employee),
  };
  const missing = [
    ["parent_first_name", "Parent First Name"],
    ["parent_last_name", "Parent Last Name"],
    ["address", "Address"],
    ["city", "City"],
    ["state", "State"],
    ["zip", "Zip"],
    ["phone", "Phone"],
  ].filter(([field]) => !payload[field]).map(([, label]) => label);
  if (missing.length) {
    throw new Error(`Please complete required fields: ${missing.join(", ")}.`);
  }
  if (!STATE_CODES.has(payload.state)) {
    throw new Error("Please select a valid state.");
  }
  if (!ZIP_PATTERN.test(payload.zip)) {
    throw new Error("Zip must be exactly 5 digits.");
  }
  if (!PHONE_PATTERN.test(payload.phone)) {
    throw new Error("Phone must use ###-###-#### format.");
  }
  return payload;
}

async function supabaseRequest(configuration, path, options = {}) {
  const result = await fetch(`${configuration.supabaseUrl.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.profile ? { "Accept-Profile": options.profile, "Content-Profile": options.profile } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
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

async function findAuthUserId(configuration, email) {
  for (let page = 1; ; page += 1) {
    const result = await supabaseRequest(configuration, `/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!result.ok) throw new Error(result.data?.message || "Could not find created account.");
    const users = result.data?.users || [];
    const user = users.find((candidate) => String(candidate.email || "").toLowerCase() === email);
    if (user) return user.id;
    if (users.length < 1000) return null;
  }
}

async function saveFamilyProfile(configuration, email, userId, profile) {
  const existing = await supabaseRequest(
    configuration,
    `/rest/v1/families?select=id&or=(user_id.eq.${encodeURIComponent(userId)},email.eq.${encodeURIComponent(email)})&limit=1`,
    { profile: "sccs" },
  );
  if (!existing.ok) throw new Error(existing.data?.message || "Could not check family profile.");

  const row = existing.data?.[0];
  const result = await supabaseRequest(configuration, row ? `/rest/v1/families?id=eq.${encodeURIComponent(row.id)}` : "/rest/v1/families", {
    method: row ? "PATCH" : "POST",
    profile: "sccs",
    prefer: "return=minimal",
    body: {
      ...profile,
      email,
      user_id: userId,
    },
  });
  if (!result.ok) {
    throw new Error(result.data?.message || "Could not save family profile.");
  }
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
  const tokenHash = data?.hashed_token || data?.properties?.hashed_token;
  const userId = data?.user?.id || data?.properties?.user?.id || data?.id || null;
  if (tokenHash) {
    const validationUrl = new URL("/login", configuration.siteUrl);
    validationUrl.searchParams.set("type", "signup");
    validationUrl.searchParams.set("token_hash", tokenHash);
    return { actionLink: validationUrl.toString(), userId };
  }
  throw new Error("Could not create account validation link.");
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
  let profile;
  if (!SIMPLE_EMAIL_PATTERN.test(email) || !EMAIL_PATTERN.test(email) || email.includes("..")) {
    return json(response, 400, { error: "Email must contain @ and ." });
  }
  if (password.length < 8) {
    return json(response, 400, { error: "Password must be at least 8 characters." });
  }
  if (isRateLimited(request, email)) {
    return json(response, 429, { error: "Too many requests. Please try again later." });
  }
  try {
    profile = validateProfile(request.body || {});
  } catch (error) {
    return json(response, 400, { error: error.message });
  }

  try {
    const configuration = config();
    const signup = await generateSignupLink(configuration, email, password);
    const userId = signup.userId || await findAuthUserId(configuration, email);
    if (!userId) throw new Error("Could not find created account.");
    await saveFamilyProfile(configuration, email, userId, profile);
    await sendMail(configuration, {
      to: email,
      ...validationTemplate(signup.actionLink),
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
