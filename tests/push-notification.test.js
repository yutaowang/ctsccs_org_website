import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/send-push-notification.js";

function response() { return { code: 0, headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; return this; }, end(value) { this.body = JSON.parse(value); } }; }
async function run(role, audience = "families") {
  const originalFetch = globalThis.fetch; const oldUrl = process.env.SUPABASE_URL; const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; let messages = [];
  globalThis.fetch = async (url, options = {}) => {
    let data; let ok = true;
    if (url.endsWith("/auth/v1/user")) data = { id: "manager" };
    else if (url.includes("/user_roles?") && url.includes("user_id=eq.")) data = [{ user_id: "manager", role }];
    else if (url.endsWith("/announcements")) { assert.equal(options.method, "POST"); data = [{ id: 8, ...JSON.parse(options.body) }]; }
    else if (url.includes("/push_devices?")) data = [{ user_id: "family", expo_push_token: "ExponentPushToken[family]" }, { user_id: "teacher", expo_push_token: "ExponentPushToken[teacher]" }];
    else if (url.endsWith("/user_roles?select=user_id,role")) data = [{ user_id: "family", role: "sccs_family_role" }, { user_id: "teacher", role: "sccs_teacher_ta_role" }];
    else if (url.includes("exp.host")) { messages = JSON.parse(options.body); data = { data: [] }; }
    else { ok = false; data = { message: `Unexpected URL ${url}` }; }
    return { ok, text: async () => JSON.stringify(data) };
  };
  const res = response();
  try { await handler({ method: "POST", headers: { authorization: "Bearer token" }, body: { title: "School closed", body: "Snow day", audience } }, res); return { res, messages }; }
  finally { globalThis.fetch = originalFetch; if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl; if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; }
}

test("Admin Team can publish a family-only push notification", async () => {
  const { res, messages } = await run("sccs_admin_team_role");
  assert.equal(res.code, 200); assert.equal(res.body.sent, 1); assert.deepEqual(messages.map((message) => message.to), ["ExponentPushToken[family]"]);
});

test("teachers cannot publish school push notifications", async () => {
  const { res, messages } = await run("sccs_teacher_ta_role", "all");
  assert.equal(res.code, 403); assert.deepEqual(messages, []);
});
