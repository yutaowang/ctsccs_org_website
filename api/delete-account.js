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
    throw new Error("Account deletion service is not configured.");
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

function apiError(message, status, code, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

export async function deleteOwnFamilyAccount(configuration, token) {
  const userResult = await supabaseRequest(configuration, "/auth/v1/user", { token });
  if (!userResult.ok || !userResult.data?.id) {
    throw apiError("Please sign in again before deleting your account.", 401, "AUTH_REQUIRED");
  }
  const userId = userResult.data.id;

  const roleResult = await supabaseRequest(
    configuration,
    `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}`,
    { profile: "sccs" },
  );
  if (!roleResult.ok) throw new Error(roleResult.data?.message || "Could not verify account type.");
  if ((roleResult.data || []).some((row) => STAFF_ROLES.has(row.role))) {
    throw apiError("Only Family accounts can be deleted here.", 403, "FAMILY_ACCOUNT_REQUIRED");
  }

  const familyResult = await supabaseRequest(
    configuration,
    `/rest/v1/families?select=id,legacy_family_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { profile: "sccs" },
  );
  if (!familyResult.ok) throw new Error(familyResult.data?.message || "Could not load family profile.");
  const family = familyResult.data?.[0] || null;

  if (family?.id) {
    const familyFilter = family.legacy_family_id
      ? `or=(family_id.eq.${encodeURIComponent(family.id)},legacy_family_id.eq.${encodeURIComponent(family.legacy_family_id)})`
      : `family_id=eq.${encodeURIComponent(family.id)}`;
    const studentsResult = await supabaseRequest(
      configuration,
      `/rest/v1/students?select=id,legacy_student_id&${familyFilter}`,
      { profile: "sccs" },
    );
    if (!studentsResult.ok) throw new Error(studentsResult.data?.message || "Could not verify family students.");
    const students = studentsResult.data || [];

    if (students.length) {
      const studentIds = students.map((student) => encodeURIComponent(student.id)).join(",");
      const legacyStudentIds = students
        .filter((student) => student.legacy_student_id)
        .map((student) => encodeURIComponent(student.legacy_student_id))
        .join(",");
      const registrationFilter = legacyStudentIds
        ? `or=(student_id.in.(${studentIds}),legacy_student_id.in.(${legacyStudentIds}))`
        : `student_id=in.(${studentIds})`;
      const registrationsResult = await supabaseRequest(
        configuration,
        `/rest/v1/class_registrations?select=session_1,session_2,session_3,legacy_session_1,legacy_session_2,legacy_session_3&${registrationFilter}`,
        { profile: "sccs" },
      );
      if (!registrationsResult.ok) throw new Error(registrationsResult.data?.message || "Could not verify course registrations.");
      const hasRegistrations = (registrationsResult.data || []).some(
        (registration) => registration.session_1 || registration.session_2 || registration.session_3
          || registration.legacy_session_1 || registration.legacy_session_2 || registration.legacy_session_3,
      );
      throw apiError(
        "Cancel all registered courses, then delete every student before deleting the account.",
        409,
        "ACCOUNT_NOT_EMPTY",
        { hasStudents: true, hasRegistrations },
      );
    }
  }

  const deleteResult = await supabaseRequest(
    configuration,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  if (!deleteResult.ok && deleteResult.status !== 404) {
    throw new Error(deleteResult.data?.message || "Could not delete account.");
  }
}

export default async function handler(request, response) {
  if (request.method !== "DELETE") {
    response.setHeader("Allow", "DELETE");
    return json(response, 405, { error: "Method not allowed." });
  }

  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(response, 401, { error: "Authentication required.", code: "AUTH_REQUIRED" });

  try {
    await deleteOwnFamilyAccount(config(), token);
    return json(response, 200, { ok: true });
  } catch (error) {
    console.error("Family self-service account deletion failed.", error?.message || error);
    return json(response, error?.status || 400, {
      error: error?.message || "Could not delete account.",
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.details || {}),
    });
  }
}
