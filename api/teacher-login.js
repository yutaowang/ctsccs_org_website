const TEACHER_ROLE = "sccs_teacher_ta_role";
const MANAGER_ROLES = new Set(["admin", "sccs_admin_team_role"]);
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
  };
  if (!values.url || !values.serviceKey) {
    throw new Error("Teacher login service is not configured.");
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

async function requireManager(request, configuration) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const userResult = await supabaseRequest(configuration, "/auth/v1/user", { token });
  if (!userResult.ok || !userResult.data?.id) return null;
  const roleResult = await supabaseRequest(
    configuration,
    `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userResult.data.id)}`,
    { profile: "sccs" },
  );
  if (!roleResult.ok) {
    throw new Error(roleResult.data?.message || "Could not verify admin role.");
  }
  const role = roleResult.data?.[0]?.role;
  return MANAGER_ROLES.has(role) ? { user: userResult.data, role, token } : null;
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

async function findAuthUser(configuration, email) {
  const users = await listAllAuthUsers(configuration);
  return users.find((user) => String(user.email || "").toLowerCase() === email) || null;
}

async function saveTeacherRole(configuration, userId, teacherId) {
  const result = await supabaseRequest(configuration, "/rest/v1/user_roles", {
    method: "POST",
    profile: "sccs",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      user_id: userId,
      role: TEACHER_ROLE,
      teacher_id: teacherId,
    },
  });
  if (!result.ok) throw new Error(result.data?.message || "Could not assign teacher role.");
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = config();
    const manager = await requireManager(request, configuration);
    if (!manager) return json(response, 403, { error: "Admin team access required." });

    const teacherId = Number(request.body?.teacherId);
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    if (!teacherId) throw new Error("Teacher record is required.");
    if (!EMAIL_PATTERN.test(email) || email.includes("..")) throw new Error("A valid teacher email is required.");
    if (password.length < 10) throw new Error("Temporary password must be at least 10 characters.");

    const existingUser = await findAuthUser(configuration, email);
    let userId = existingUser?.id;
    if (userId) {
      const updated = await supabaseRequest(configuration, `/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        body: {
          email,
          password,
          email_confirm: true,
          app_metadata: { portal: "teacher" },
        },
      });
      if (!updated.ok) throw new Error(updated.data?.message || "Could not update teacher login.");
    } else {
      const created = await supabaseRequest(configuration, "/auth/v1/admin/users", {
        method: "POST",
        body: {
          email,
          password,
          email_confirm: true,
          app_metadata: { portal: "teacher" },
        },
      });
      if (!created.ok) throw new Error(created.data?.message || "Could not create teacher login.");
      userId = created.data.id;
    }

    await saveTeacherRole(configuration, userId, teacherId);
    return json(response, 200, { message: "Teacher login saved." });
  } catch (error) {
    console.error("Teacher login operation failed.", error?.message || error);
    return json(response, 400, { error: error?.message || "Teacher login operation failed." });
  }
}
