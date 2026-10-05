import assert from "node:assert/strict";
import test from "node:test";

import { validateStaffPayload } from "../api/admin-users.js";
import { validateProfile } from "../api/create-account.js";

const familyRequest = (phone) => ({
  profile: {
    parent_first_name: "Test",
    parent_last_name: "Parent",
    address: "1 Main Street",
    city: "Waterford",
    state: "CT",
    zip: "06385",
    phone,
  },
});

const adminRequest = (phone) => ({
  email: "admin@ctsccs.org",
  password: "temporary-password",
  role: "sccs_admin_team_role",
  phone,
});

test("new family accounts require exactly 10 consecutive phone digits", () => {
  assert.equal(validateProfile(familyRequest("8605551234")).phone, "8605551234");
  for (const phone of ["860-555-1234", "860555123", "86055512345", "860555123x"]) {
    assert.throws(() => validateProfile(familyRequest(phone)), /exactly 10 digits/);
  }
});

test("new admin accounts accept an empty phone or exactly 10 digits", () => {
  assert.doesNotThrow(() => validateStaffPayload(adminRequest("")));
  assert.doesNotThrow(() => validateStaffPayload(adminRequest("8605551234")));
  assert.throws(() => validateStaffPayload(adminRequest("860-555-1234")), /exactly 10 digits/);
});

test("editing an existing admin does not block a legacy formatted phone", () => {
  assert.doesNotThrow(() => validateStaffPayload(adminRequest("860-555-1234"), true));
});
