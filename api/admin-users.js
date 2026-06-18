import { mailConfig, portalAccountTemplate, sendMail } from "./mail.js";

const STAFF_ROLE = "sccs_admin_team_role";
const SUPERADMIN_ROLE = "sccs_superadmin_role";
const STAFF_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@ctsccs\.org$/i;
const ROLE_ALIASES = {
  saas_admin_team_role: STAFF_ROLE,
};

function normalizeStaffRole(role) {
  return ROLE_ALIASES[role] || role;
}

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

async function requireAdministrator(request, configuration) {
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
  if (!roleResult.ok || roleResult.data?.[0]?.role !== SUPERADMIN_ROLE) return null;
  return { user: userResult.data, token };
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

async function listStaff(configuration, administratorToken) {
  const [users, rolesResult, teamResult] = await Promise.all([
    listAllAuthUsers(configuration),
    supabaseRequest(
      configuration,
      `/rest/v1/user_roles?select=user_id,role,teacher_id&role=eq.${STAFF_ROLE}`,
      { profile: "sccs", token: administratorToken },
    ),
    supabaseRequest(
      configuration,
      "/rest/v1/admin_team_members?select=*&order=last_name.asc",
      { profile: "sccs", token: administratorToken },
    ),
  ]);
  const failed = [rolesResult, teamResult].find((result) => !result.ok);
  if (failed) throw new Error(failed.data?.message || "Could not load staff users.");

  const teamByUser = new Map(teamResult.data.map((row) => [row.user_id, row]));
  return {
    users: rolesResult.data.map((role) => {
      const user = users.find((candidate) => candidate.id === role.user_id);
      return {
        id: role.user_id,
        email: user?.email || "",
        role: role.role,
        teacher_id: role.teacher_id,
        profile: teamByUser.get(role.user_id) || null,
        last_sign_in_at: user?.last_sign_in_at || null,
      };
    }),
  };
}

function validateStaffPayload(body, existing = false) {
  const email = String(body.email || "").trim().toLowerCase();
  const role = normalizeStaffRole(String(body.role || STAFF_ROLE));
  const password = String(body.password || "");

  if (!STAFF_EMAIL.test(email)) {
    throw new Error("Staff email is required and must end with @ctsccs.org.");
  }
  if (role !== STAFF_ROLE) {
    throw new Error("Staff only manages admin team member accounts.");
  }
  if (!existing && password.length < 10) {
    throw new Error("The temporary password must be at least 10 characters.");
  }
  if (existing && password && password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
  return { email, password };
}

async function saveTeamProfile(configuration, administratorToken, userId, email, body) {
  const profileResult = await supabaseRequest(configuration, "/rest/v1/admin_team_members", {
    method: "POST",
    profile: "sccs",
    token: administratorToken,
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      user_id: userId,
      email,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      phone: body.phone || null,
      title: body.title || null,
    },
  });
  if (!profileResult.ok) throw new Error(profileResult.data?.message || "Could not save team profile.");
}

async function saveStaffRole(configuration, userId) {
  const roleResult = await supabaseRequest(configuration, "/rest/v1/user_roles", {
    method: "POST",
    profile: "sccs",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { user_id: userId, role: STAFF_ROLE, teacher_id: null },
  });
  if (!roleResult.ok) throw new Error(roleResult.data?.message || "Could not assign role.");
}

async function createStaff(configuration, administratorToken, body) {
  const { email, password } = validateStaffPayload(body);
  const created = await supabaseRequest(configuration, "/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: { portal: "staff" },
    },
  });
  if (!created.ok) throw new Error(created.data?.message || "Could not create user.");
  const userId = created.data.id;

  try {
    await saveStaffRole(configuration, userId);
    await saveTeamProfile(configuration, administratorToken, userId, email, body);
    const emailConfig = mailConfig("Admin account email service");
    await sendMail(emailConfig, {
      to: email,
      ...portalAccountTemplate({
        title: "SCCS Admin Team Account",
        loginUrl: `${emailConfig.siteUrl}/admin`,
        email,
        password,
        roleName: "admin team",
      }),
    });
    return { id: userId };
  } catch (error) {
    await supabaseRequest(configuration, `/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    throw error;
  }
}

async function updateStaff(configuration, administratorToken, body) {
  const userId = String(body.id || "");
  const { email } = validateStaffPayload(body, true);
  if (!userId) throw new Error("Invalid staff account update.");

  const authBody = { email, email_confirm: true };
  if (body.password) authBody.password = String(body.password);
  const authResult = await supabaseRequest(configuration, `/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    body: authBody,
  });
  if (!authResult.ok) throw new Error(authResult.data?.message || "Could not update Auth user.");

  await saveStaffRole(configuration, userId);
  await saveTeamProfile(configuration, administratorToken, userId, email, body);
}

export default async function handler(request, response) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return json(response, 405, { error: "Method not allowed." });
  }
  try {
    const configuration = config();
    const administrator = await requireAdministrator(request, configuration);
    if (!administrator) return json(response, 403, { error: "Administrator access required." });

    if (request.method === "GET") {
      return json(response, 200, await listStaff(configuration, administrator.token));
    }
    if (request.method === "POST") {
      const created = await createStaff(
        configuration,
        administrator.token,
        request.body || {},
      );
      return json(response, 201, created);
    }
    if (request.method === "PATCH") {
      await updateStaff(configuration, administrator.token, request.body || {});
      return json(response, 200, { message: "Staff account updated." });
    }

    const userId = String(request.body?.id || "");
    if (!userId || userId === administrator.user.id) {
      return json(response, 400, { error: "Invalid user deletion." });
    }
    const roleResult = await supabaseRequest(
      configuration,
      `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}`,
      { profile: "sccs", token: administrator.token },
    );
    if (roleResult.data?.[0]?.role !== STAFF_ROLE) {
      return json(response, 400, { error: "Only admin team member accounts can be deleted here." });
    }
    const deleted = await supabaseRequest(configuration, `/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
    });
    if (!deleted.ok) throw new Error(deleted.data?.message || "Could not delete user.");
    return json(response, 200, { message: "Staff account deleted." });
  } catch (error) {
    console.error("Admin user operation failed.", error?.message || error);
    return json(response, 400, { error: error?.message || "Admin operation failed." });
  }
}
