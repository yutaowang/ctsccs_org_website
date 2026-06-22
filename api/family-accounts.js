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
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.profile ? { "Accept-Profile": options.profile, "Content-Profile": options.profile } : {}),
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

async function deleteFamilyAccount(configuration, body) {
  const familyId = body.familyId ? String(body.familyId) : "";
  const accountId = body.accountId ? String(body.accountId) : "";
  if (!familyId && !accountId) throw new Error("Family or account id is required.");

  const roleGuard = accountId
    ? await supabaseRequest(
      configuration,
      `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(accountId)}`,
      { profile: "sccs" },
    )
    : { ok: true, data: [] };
  if (!roleGuard.ok) throw new Error(roleGuard.data?.message || "Could not verify account role.");
  if ((roleGuard.data || []).some((row) => STAFF_ROLES.has(row.role))) {
    throw new Error("Staff/admin accounts cannot be deleted from Family Search.");
  }

  let family = null;
  if (familyId) {
    const familyResult = await supabaseRequest(
      configuration,
      `/rest/v1/families?select=id,user_id,email,legacy_family_id&id=eq.${encodeURIComponent(familyId)}&limit=1`,
      { profile: "sccs" },
    );
    if (!familyResult.ok) throw new Error(familyResult.data?.message || "Could not load family profile.");
    family = familyResult.data?.[0] || null;
  }
  if (!family && accountId) {
    const familyResult = await supabaseRequest(
      configuration,
      `/rest/v1/families?select=id,user_id,email,legacy_family_id&user_id=eq.${encodeURIComponent(accountId)}&limit=1`,
      { profile: "sccs" },
    );
    if (!familyResult.ok) throw new Error(familyResult.data?.message || "Could not load family profile.");
    family = familyResult.data?.[0] || null;
  }

  if (family?.id) {
    const legacyFamilyId = family.legacy_family_id || family.id;
    const [paidResult, legacyPaymentResult] = await Promise.all([
      supabaseRequest(
        configuration,
        `/rest/v1/payments?select=id&family_id=eq.${encodeURIComponent(family.id)}&status=eq.paid&limit=1`,
        { profile: "sccs" },
      ),
      supabaseRequest(
        configuration,
        `/rest/v1/family_registrations?select=pay_1_cash,pay_1_check,pay_2_cash,pay_2_check,pay_3_cash,pay_3_check,pay_4_cash,pay_4_check,pay_5_cash,pay_5_check&or=(family_id.eq.${encodeURIComponent(family.id)},legacy_family_id.eq.${encodeURIComponent(legacyFamilyId)})&limit=1`,
        { profile: "sccs" },
      ),
    ]);
    if (!paidResult.ok) throw new Error(paidResult.data?.message || "Could not verify payment history.");
    if (!legacyPaymentResult.ok) throw new Error(legacyPaymentResult.data?.message || "Could not verify legacy payment history.");
    const legacyPaid = (legacyPaymentResult.data || []).some((row) => [
      row.pay_1_cash, row.pay_1_check, row.pay_2_cash, row.pay_2_check,
      row.pay_3_cash, row.pay_3_check, row.pay_4_cash, row.pay_4_check,
      row.pay_5_cash, row.pay_5_check,
    ].some((value) => Number(value || 0) > 0));
    if ((paidResult.data || []).length || legacyPaid) {
      const error = new Error("This family has payment records and cannot be deleted.");
      error.status = 409;
      throw error;
    }
  }

  const targetUserId = family?.user_id || accountId;
  if (family?.id) {
    const deleteFamily = await supabaseRequest(
      configuration,
      `/rest/v1/families?id=eq.${encodeURIComponent(family.id)}`,
      { method: "DELETE", profile: "sccs", prefer: "return=minimal" },
    );
    if (!deleteFamily.ok) throw new Error(deleteFamily.data?.message || "Could not delete family profile.");
  }

  if (targetUserId) {
    const deleteUser = await supabaseRequest(
      configuration,
      `/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`,
      { method: "DELETE" },
    );
    if (!deleteUser.ok && deleteUser.status !== 404) {
      throw new Error(deleteUser.data?.message || "Could not delete login account.");
    }
  }
}

export default async function handler(request, response) {
  if (!["GET", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "GET, DELETE");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = config();
    const admin = await requireAdmin(request, configuration);
    if (!admin) return json(response, 403, { error: "Administrator access required." });

    if (request.method === "DELETE") {
      await deleteFamilyAccount(configuration, request.body || {});
      return json(response, 200, { ok: true });
    }

    const [users, rolesResult, familiesResult] = await Promise.all([
      listAllAuthUsers(configuration),
      supabaseRequest(configuration, "/rest/v1/user_roles?select=user_id,role", { profile: "sccs", token: admin.token }),
      supabaseRequest(configuration, "/rest/v1/families?select=id,user_id,email", { profile: "sccs", token: admin.token }),
    ]);
    if (!rolesResult.ok) throw new Error(rolesResult.data?.message || "Could not load user roles.");
    if (!familiesResult.ok) throw new Error(familiesResult.data?.message || "Could not load family profiles.");

    const roleByUser = new Map((rolesResult.data || []).map((row) => [row.user_id, row.role]));
    const familyByUser = new Map((familiesResult.data || []).filter((row) => row.user_id).map((row) => [row.user_id, row]));
    const familyByEmail = new Map((familiesResult.data || [])
      .filter((row) => row.email)
      .map((row) => [String(row.email).toLowerCase(), row]));
    const familyEmailSet = new Set((familiesResult.data || []).map((row) => String(row.email || "").toLowerCase()).filter(Boolean));

    const accounts = users
      .filter((user) => !STAFF_ROLES.has(roleByUser.get(user.id)))
      .filter((user) => user.app_metadata?.portal === "family" || !roleByUser.get(user.id))
      .map((user) => {
        const family = familyByUser.get(user.id) || familyByEmail.get(String(user.email || "").toLowerCase());
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
    return json(response, error?.status || 400, { error: error?.message || "Could not load family accounts." });
  }
}
