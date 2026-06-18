const ADMIN_USERNAME = "admin";

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function config() {
  const values = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (!values.url || !values.serviceKey || !values.publishableKey) {
    throw new Error("Supabase admin login service is not configured.");
  }
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const profile = options.profile;
  const response = await fetch(`${configuration.url.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: options.apikey || configuration.serviceKey,
      Authorization: `Bearer ${options.token || configuration.serviceKey}`,
      "Content-Type": "application/json",
      ...(profile ? { "Accept-Profile": profile, "Content-Profile": profile } : {}),
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

async function getRootAdminProfile(configuration) {
  const result = await supabaseRequest(
    configuration,
    `/rest/v1/admins?select=user_id,email&username=eq.${encodeURIComponent(ADMIN_USERNAME)}&limit=1`,
    { profile: "sccs" },
  );
  if (!result.ok) throw new Error(result.data?.message || "Could not load admin profile.");
  const profile = result.data?.[0];
  if (!profile?.email || !profile?.user_id) {
    throw new Error("Root admin profile is not configured.");
  }
  return profile;
}

async function signInWithPassword(configuration, email, password) {
  const result = await supabaseRequest(configuration, "/auth/v1/token?grant_type=password", {
    method: "POST",
    apikey: configuration.publishableKey,
    token: configuration.publishableKey,
    body: { email, password },
  });
  if (!result.ok) throw new Error(result.data?.msg || result.data?.message || "Invalid login credentials.");
  return result.data;
}

async function verifyRootAdminRole(configuration, userId, accessToken) {
  const result = await supabaseRequest(
    configuration,
    `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { profile: "sccs", token: accessToken },
  );
  if (!result.ok || result.data?.[0]?.role !== "admin") {
    throw new Error("Administrator access required.");
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const username = String(request.body?.username || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    if (username !== ADMIN_USERNAME) {
      return json(response, 400, { error: "Administrator must sign in with username admin." });
    }
    if (!password) return json(response, 400, { error: "Password is required." });

    const configuration = config();
    const profile = await getRootAdminProfile(configuration);
    const session = await signInWithPassword(configuration, profile.email, password);
    if (session.user?.id !== profile.user_id) {
      throw new Error("Administrator access required.");
    }
    await verifyRootAdminRole(configuration, session.user.id, session.access_token);

    return json(response, 200, {
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    });
  } catch (error) {
    console.error("Admin login failed.", error?.message || error);
    return json(response, 401, { error: error?.message || "Admin sign in failed." });
  }
}
