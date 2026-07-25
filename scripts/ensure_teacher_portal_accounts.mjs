import { generateTemporaryPassword } from "../api/admin-forgot-password.js";
import { mailConfig, sendMail } from "../lib/mail.js";

const TEACHER_ROLE = "sccs_teacher_ta_role";
const LOGIN_URL = "https://ctsccs.org/admin";
const FROM_ADDRESS = "ywang@ctsccs.org";
const EMAILS = [
  "lxsun@ctsccs.org",
  "ylzhang@ctsccs.org",
  "zngao@ctsccs.org",
  "yqli_teacher@ctsccs.org",
  "wyhua@ctsccs.org",
  "yzhuang@ctsccs.org",
  "cmji@ctsccs.org",
  "zyliu_teacher@ctsccs.org",
  "jsun@ctsccs.org",
  "lluo@ctsccs.org",
  "mho@ctsccs.org",
  "ali@ctsccs.org",
  "jfeng@ctsccs.org",
  "jhorst@ctsccs.org",
  "ewang@ctsccs.org",
  "mnoe@ctsccs.org",
  "xcli_teacher@ctsccs.org",
  "jwang@ctsccs.org",
  "msimpson@ctsccs.org",
  "yjzhai@ctsccs.org",
  "kchen@ctsccs.org",
  "rsit@ctsccs.org",
  "rderksen@ctsccs.org",
  "edong@ctsccs.org",
];

const applyChanges = process.argv.includes("--yes");
const repairExisting = process.argv.includes("--repair-existing");

function configuration() {
  const config = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!config.url || !config.serviceKey) {
    throw new Error("Supabase production environment is not configured.");
  }
  config.url = config.url.replace(/\/$/, "");
  return config;
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.profile
        ? { "Accept-Profile": options.profile, "Content-Profile": options.profile }
        : {}),
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
  if (!response.ok) {
    throw new Error(data?.message || `Supabase request failed (${response.status}).`);
  }
  return data;
}

async function listAuthUsers(config) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const data = await supabaseRequest(
      config,
      `/auth/v1/admin/users?page=${page}&per_page=1000`,
    );
    const pageUsers = data.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) return users;
  }
}

function teacherMatches(teachers, email) {
  return teachers.filter((teacher) =>
    [teacher.email_1, teacher.email_2]
      .map((value) => String(value || "").trim().toLowerCase())
      .includes(email),
  );
}

function normalizeUuid(value) {
  return String(value || "").replaceAll("-", "").toLowerCase();
}

function credentialsEmail(email, password) {
  const text = [
    `SCCS Admin Portal: ${LOGIN_URL}`,
    `Username: ${email}`,
    `Password: ${password}`,
  ].join("\n");
  return {
    from: { name: "SCCS", address: FROM_ADDRESS },
    to: email,
    subject: "SCCS Admin Portal Password",
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#16294b;line-height:1.7">
      <p><strong>SCCS Admin Portal:</strong> <a href="${LOGIN_URL}">${LOGIN_URL}</a><br>
      <strong>Username:</strong> ${email}<br>
      <strong>Password:</strong> ${password}</p>
    </div>`,
  };
}

async function assignTeacherRole(config, userId, teacherId) {
  await supabaseRequest(config, "/rest/v1/user_roles", {
    method: "POST",
    profile: "sccs",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      user_id: userId,
      role: TEACHER_ROLE,
      teacher_id: teacherId,
    },
  });
}

async function createAccount(config, email, teacherId, emailConfig) {
  const password = generateTemporaryPassword();
  const user = await supabaseRequest(config, "/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: { portal: "teacher" },
    },
  });
  try {
    await assignTeacherRole(config, user.id, teacherId);
    await sendMail(emailConfig, credentialsEmail(email, password));
  } catch (error) {
    await supabaseRequest(config, `/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
    }).catch(() => {});
    throw error;
  }
}

async function repairUnlinkedAccount(config, userId, email, teacherId, emailConfig) {
  const password = generateTemporaryPassword();
  await assignTeacherRole(config, userId, teacherId);
  await supabaseRequest(config, `/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    body: {
      password,
      email_confirm: true,
      app_metadata: { portal: "teacher" },
    },
  });
  await sendMail(emailConfig, credentialsEmail(email, password));
}

async function main() {
  const config = configuration();
  const [teachers, users] = await Promise.all([
    supabaseRequest(
      config,
      "/rest/v1/teachers?select=id,email_1,email_2",
      { profile: "sccs" },
    ),
    listAuthUsers(config),
  ]);
  const userByEmail = new Map(
    users.map((user) => [String(user.email || "").toLowerCase(), user]),
  );
  const relevantUserIds = EMAILS
    .map((email) => userByEmail.get(email)?.id)
    .filter(Boolean);
  const roles = relevantUserIds.length
    ? await supabaseRequest(
      config,
      `/rest/v1/user_roles?select=user_id,role,teacher_id&user_id=in.(${relevantUserIds.join(",")})`,
      { profile: "sccs" },
    )
    : [];
  const roleByUser = new Map(
    roles.map((role) => [normalizeUuid(role.user_id), role]),
  );
  const plan = [];

  for (const email of EMAILS) {
    const matches = teacherMatches(teachers, email);
    const user = userByEmail.get(email);
    const role = user ? roleByUser.get(normalizeUuid(user.id)) : null;
    if (matches.length !== 1) {
      plan.push({
        email,
        action: "conflict",
        detail: `${matches.length} matching teacher records`,
      });
    } else if (!user) {
      plan.push({ email, teacherId: matches[0].id, action: "create" });
    } else if (!role) {
      plan.push({ email, teacherId: matches[0].id, userId: user.id, action: "repair" });
    } else if (role.role === TEACHER_ROLE && role.teacher_id === matches[0].id) {
      plan.push({ email, teacherId: matches[0].id, action: "unchanged" });
    } else {
      plan.push({
        email,
        action: "conflict",
        detail: `existing role ${role.role}`,
      });
    }
  }

  console.table(
    plan.map(({ email, teacherId, action, detail }) => ({
      email,
      teacher_id: teacherId || "",
      action,
      detail: detail || "",
    })),
  );

  if (!applyChanges) {
    console.log(
      "Dry run only. Use --yes to create missing accounts; add --repair-existing only with explicit approval.",
    );
    return;
  }

  const emailConfig = mailConfig("Teacher portal provisioning email service");
  let failures = 0;
  for (const item of plan) {
    if (item.action !== "create" && !(repairExisting && item.action === "repair")) {
      continue;
    }
    try {
      if (item.action === "create") {
        await createAccount(config, item.email, item.teacherId, emailConfig);
      } else {
        await repairUnlinkedAccount(
          config,
          item.userId,
          item.email,
          item.teacherId,
          emailConfig,
        );
      }
      console.log(`${item.email}: ${item.action} completed; credentials emailed.`);
    } catch (error) {
      failures += 1;
      console.error(`${item.email}: ${item.action} failed: ${error.message}`);
    }
  }
  if (failures) {
    throw new Error(`${failures} account operation(s) failed.`);
  }
}

await main();
