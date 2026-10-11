import assert from "node:assert/strict";
import test from "node:test";

import handler from "../api/delete-account.js";

function response() {
  return {
    code: 0,
    headers: {},
    status(code) { this.code = code; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; },
    end(value) { this.body = JSON.parse(value); },
  };
}

async function run({ role = "sccs_family_role", students = [], registrations = [] } = {}) {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://db.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  let authDeleteCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    let data;
    let ok = true;
    let status = 200;
    if (url.endsWith("/auth/v1/user")) {
      assert.equal(options.headers.Authorization, "Bearer access-token");
      data = { id: "family-user" };
    } else if (url.includes("/user_roles?")) data = role ? [{ role }] : [];
    else if (url.includes("/families?")) data = [{ id: 42 }];
    else if (url.includes("/students?")) data = students;
    else if (url.includes("/class_registrations?")) data = registrations;
    else if (url.endsWith("/auth/v1/admin/users/family-user")) {
      assert.equal(options.method, "DELETE");
      assert.equal(options.headers.Authorization, "Bearer service");
      authDeleteCalls += 1;
      data = {};
    } else {
      ok = false; status = 404; data = { message: `Unexpected URL ${url}` };
    }
    return { ok, status, text: async () => JSON.stringify(data) };
  };
  const res = response();
  try {
    await handler({ method: "DELETE", headers: { authorization: "Bearer access-token" } }, res);
    return { res, authDeleteCalls };
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
}

test("an empty Family account can delete itself", async () => {
  const { res, authDeleteCalls } = await run();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(authDeleteCalls, 1);
});

test("a Family account with registered courses must clean up first", async () => {
  const { res, authDeleteCalls } = await run({
    students: [{ id: 7 }],
    registrations: [{ session_1: 11, session_2: null, session_3: null }],
  });
  assert.equal(res.code, 409);
  assert.equal(res.body.code, "ACCOUNT_NOT_EMPTY");
  assert.equal(res.body.hasStudents, true);
  assert.equal(res.body.hasRegistrations, true);
  assert.equal(authDeleteCalls, 0);
});

test("a Family account must delete students even after courses are cancelled", async () => {
  const { res, authDeleteCalls } = await run({
    students: [{ id: 7 }],
    registrations: [{ session_1: null, session_2: null, session_3: null }],
  });
  assert.equal(res.code, 409);
  assert.equal(res.body.hasRegistrations, false);
  assert.equal(authDeleteCalls, 0);
});

test("staff accounts cannot use Family self-service deletion", async () => {
  const { res, authDeleteCalls } = await run({ role: "sccs_teacher_ta_role" });
  assert.equal(res.code, 403);
  assert.equal(res.body.code, "FAMILY_ACCOUNT_REQUIRED");
  assert.equal(authDeleteCalls, 0);
});
