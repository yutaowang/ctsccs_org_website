const ADMIN_ROLES = new Set(["sccs_superadmin_role", "sccs_admin_team_role"]);
const STAFF_ROLES = new Set(["sccs_superadmin_role", "sccs_admin_team_role", "sccs_teacher_ta_role"]);

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
    throw new Error("Supabase family account service is not configured.");
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
  return { ok: response.ok, status: response.status, data };
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
    { profile: "sccs", token },
  );
  const role = roleResult.data?.[0]?.role;
  return ADMIN_ROLES.has(role) ? { user: userResult.data, token } : null;
}

async function listAllAuthUsers(configuration) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const result = await supabaseRequest(
      configuration,
      `/auth/v1/admin/users?page=${page}&per_page=1000`,
    );
    if (!result.ok) throw new Error(result.data?.message || "Could not load Auth users.");
    const pageUsers = result.data.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) return users;
  }
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = config();
    const admin = await requireAdmin(request, configuration);
    if (!admin) return json(response, 403, { error: "Administrator access required." });

    const [users, rolesResult, familiesResult] = await Promise.all([
      listAllAuthUsers(configuration),
      supabaseRequest(configuration, "/rest/v1/user_roles?select=user_id,role", { profile: "sccs", token: admin.token }),
      supabaseRequest(configuration, "/rest/v1/families?select=id,user_id,email", { profile: "sccs", token: admin.token }),
    ]);
    if (!rolesResult.ok) throw new Error(rolesResult.data?.message || "Could not load user roles.");
    if (!familiesResult.ok) throw new Error(familiesResult.data?.message || "Could not load family profiles.");

    const roleByUser = new Map((rolesResult.data || []).map((row) => [row.user_id, row.role]));
    const familyByUser = new Map((familiesResult.data || []).filter((row) => row.user_id).map((row) => [row.user_id, row]));
    const familyEmailSet = new Set((familiesResult.data || []).map((row) => String(row.email || "").toLowerCase()).filter(Boolean));

    const accounts = users
      .filter((user) => !STAFF_ROLES.has(roleByUser.get(user.id)))
      .filter((user) => user.app_metadata?.portal === "family" || !roleByUser.get(user.id))
      .map((user) => {
        const family = familyByUser.get(user.id);
        return {
          id: user.id,
          email: user.email || "",
          created_at: user.created_at || null,
          confirmed_at: user.email_confirmed_at || user.confirmed_at || null,
          last_sign_in_at: user.last_sign_in_at || null,
          family_id: family?.id || null,
          has_family_profile: Boolean(family || familyEmailSet.has(String(user.email || "").toLowerCase())),
        };
      });

    return json(response, 200, { accounts });
  } catch (error) {
    console.error("Family account search failed.", error?.message || error);
    return json(response, 400, { error: error?.message || "Could not load family accounts." });
  }
}
