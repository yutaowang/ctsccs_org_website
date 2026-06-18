const ADMIN_USERNAME = "admin";
const STAFF_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@ctsccs\.org$/i;

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
    throw new Error("Supabase admin service is not configured.");
  }
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const profile = options.profile;
  const response = await fetch(`${configuration.url.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: configuration.serviceKey,
      Authorization: `Bearer ${options.token || configuration.serviceKey}`,
      "Content-Type": "application/json",
      ...(profile ? { "Accept-Profile": profile, "Content-Profile": profile } : {}),
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

async function getAdminProfile(configuration) {
  const result = await supabaseRequest(
    configuration,
    `/rest/v1/admins?select=user_id,username,email&username=eq.${encodeURIComponent(ADMIN_USERNAME)}&limit=1`,
    { profile: "sccs" },
  );
  if (!result.ok) throw new Error(result.data?.message || "Could not load admin profile.");
  return result.data?.[0] || null;
}

async function requireRootAdmin(request, configuration) {
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
  if (!roleResult.ok || roleResult.data?.[0]?.role !== "admin") return null;
  return { user: userResult.data, token };
}

async function updateAdminEmail(configuration, administrator, email) {
  const authResult = await supabaseRequest(
    configuration,
    `/auth/v1/admin/users/${administrator.user.id}`,
    {
      method: "PUT",
      body: { email, email_confirm: true },
    },
  );
  if (!authResult.ok) throw new Error(authResult.data?.message || "Could not update admin Auth email.");

  const profileResult = await supabaseRequest(configuration, "/rest/v1/admins", {
    method: "POST",
    profile: "sccs",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      user_id: administrator.user.id,
      username: ADMIN_USERNAME,
      email,
      must_change_password: false,
    },
  });
  if (!profileResult.ok) throw new Error(profileResult.data?.message || "Could not update admin profile email.");
  return profileResult.data?.[0] || { email };
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = config();
    const administrator = await requireRootAdmin(request, configuration);
    if (!administrator) return json(response, 403, { error: "Administrator access required." });

    if (request.method === "GET") {
      const username = String(request.query?.username || request.body?.username || ADMIN_USERNAME).trim().toLowerCase();
      if (username !== ADMIN_USERNAME) return json(response, 404, { error: "Admin profile not found." });
      const profile = await getAdminProfile(configuration);
      return json(response, 200, {
        username: ADMIN_USERNAME,
        email: profile?.email || administrator.user.email || "",
      });
    }

    const email = String(request.body?.email || "").trim().toLowerCase();
    if (!STAFF_EMAIL.test(email)) {
      return json(response, 400, { error: "Admin recovery email must end with @ctsccs.org." });
    }

    const profile = await updateAdminEmail(configuration, administrator, email);
    return json(response, 200, {
      message: "Admin recovery email updated.",
      email: profile.email,
    });
  } catch (error) {
    console.error("Admin profile operation failed.", error?.message || error);
    return json(response, 400, { error: error?.message || "Admin profile operation failed." });
  }
}
