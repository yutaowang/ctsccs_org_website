import test from "node:test";
import assert from "node:assert/strict";
import { hasFreeWaterfordSeat, isChineseCourse, patrolDepositFromBilling, tuitionAfterWaterfordDiscount, tuitionForRegistrations } from "../lib/tuition.js";
import checkout from "../api/create-checkout-session.js";

const classes = [
  { id: 1, name: "Grade 1", type: "CHN", donation: 290 },
  { id: 2, name: "Mandarin", type: "CHN", donation: 150 },
  { id: 3, name: "Chinese Painting", type: "CC", donation: 290 },
  { id: 4, name: "SAT", type: "SAT", donation: 290 },
  { id: 5, name: "Maliping 6", type: "CHN", donation: 370 },
];
const seat = { student_id: 10, class_id: 1, seat_number: 20, released_at: null };
const registration = { student_id: 10, session_1: 1, session_2: 3, session_3: 4 };

test("only Chinese language course types qualify", () => {
  assert.equal(isChineseCourse(classes[0]), true);
  assert.equal(isChineseCourse({ type: " chn2 " }), true);
  assert.equal(isChineseCourse(classes[2]), false);
  assert.equal(isChineseCourse(classes[3]), false);
  assert.equal(isChineseCourse({ name: "Chinese" }), false);
});

test("deposit amounts come from the database and are scoped to the household", () => {
  assert.equal(patrolDepositFromBilling(1, [{ family_id: 1, amount: 40 }]), 40);
  assert.equal(patrolDepositFromBilling(1, [{ family_id: 1, amount: 0 }]), 0);
  assert.equal(patrolDepositFromBilling(1, [{ family_id: 2, amount: 0 }]), null);
  assert.equal(patrolDepositFromBilling(1, [{ family_id: 1, amount: -40 }]), null);
});

test("saved awards, rather than equal tuition prices, identify the free course", () => {
  assert.equal(tuitionForRegistrations([registration], classes, [seat]), 580);
  assert.equal(tuitionForRegistrations([registration], classes, []), 870);
  assert.equal(tuitionForRegistrations([registration], classes, [{ ...seat, seat_number: null }]), 870);
  assert.equal(tuitionForRegistrations([registration], classes, [{ ...seat, released_at: "2026-09-13" }]), 870);
  assert.equal(hasFreeWaterfordSeat(classes[0], 11, [seat]), false);
});

test("two Chinese courses use two awards; duplicate session IDs count once", () => {
  const registrations = [{ ...registration, session_2: 2, session_3: 1 }];
  assert.equal(tuitionForRegistrations(registrations, classes, [seat]), 150);
  assert.equal(tuitionForRegistrations(registrations, classes, [seat, { ...seat, class_id: 2, seat_number: 19 }]), 0);
});

async function runCheckout(awards, failSeats = false, deposit = 40, billingRegistrations = [registration]) {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "SITE_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "test", STRIPE_SECRET_KEY: "test", SITE_URL: "https://school.test" });
  let stripeForm;
  globalThis.fetch = async (url, options) => {
    let data;
    let ok = true;
    if (url.includes("/auth/v1/user")) data = { id: "user", email: "parent@example.com" };
    else if (url.includes("/families?")) data = [{ id: 1, city: "Waterford", waterford_resident: true }];
    else if (url.includes("/students?")) data = [{ id: 10, first_name: "Student" }];
    else if (url.includes("/rpc/waterford_billing_snapshot")) {
      assert.deepEqual(JSON.parse(options.body), { target_family_id: 1 });
      data = { seats: awards, registrations: billingRegistrations, classes, usage: { used: 20, waiting: 0 }, deposits: [{ family_id: 1, amount: deposit }] };
      ok = !failSeats;
    }
    else if (url.endsWith("/customers")) data = { id: "cus_test" };
    else if (url.endsWith("/checkout/sessions")) {
      stripeForm = options.body;
      data = { url: "https://checkout.test" };
    } else throw new Error(`Unexpected request: ${url}`);
    return { ok, status: ok ? 200 : 500, text: async () => JSON.stringify(data), json: async () => data };
  };
  const response = { status(code) { this.code = code; return this; }, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  try {
    await checkout({ method: "POST", headers: { authorization: "Bearer test" } }, response);
    return { response, stripeForm };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("Stripe charges art + SAT + exactly one $40 deposit for an awarded family", async () => {
  const { response, stripeForm } = await runCheckout([seat]);
  assert.equal(response.code, 200);
  const amounts = [...stripeForm].filter(([key]) => key.endsWith("[unit_amount]")).map(([, value]) => Number(value));
  assert.deepEqual(amounts, [29000,29000,4000]);
  assert.equal(stripeForm.get("metadata[waterford_seat_ids]"), "10:1");
});

test("Stripe charges full tuition when the resident has no allocated seat", async () => {
  const { response, stripeForm } = await runCheckout([{ ...seat, seat_number: null }]);
  assert.equal(response.code, 200);
  const amounts = [...stripeForm].filter(([key]) => key.endsWith("[unit_amount]")).map(([, value]) => Number(value));
  assert.deepEqual(amounts, [29000,29000,29000,4000]);
});

test("Stripe charges the $80 book fee for an awarded Maliping course", async () => {
  const malipingSeat = { ...seat, class_id: 5 };
  const malipingRegistration = { student_id: 10, session_1: 5, session_2: null, session_3: null };
  const { response, stripeForm } = await runCheckout([malipingSeat], false, 40, [malipingRegistration]);
  assert.equal(response.code, 200);
  assert.deepEqual([...stripeForm].filter(([key]) => key.endsWith("[unit_amount]")).map(([, value]) => Number(value)), [8000,4000]);
});

test("allocation lookup errors stop checkout instead of guessing a discount", async () => {
  const { response, stripeForm } = await runCheckout([], true);
  assert.equal(response.code, 500);
  assert.equal(stripeForm, undefined);
});

test("an awarded Maliping course keeps the $80 book fee", () => {
  const malipingSeat = { ...seat, class_id: 5 };
  const malipingRegistration = { student_id: 10, session_1: 5, session_2: null, session_3: null };
  assert.equal(tuitionAfterWaterfordDiscount(classes[4], 10, [malipingSeat]), 80);
  assert.equal(tuitionForRegistrations([malipingRegistration], classes, [malipingSeat]), 80);
  assert.equal(tuitionForRegistrations([malipingRegistration], classes, []), 370);
});

test("an eligible member pays tuition but no deposit", async () => {
  const { response, stripeForm } = await runCheckout([seat], false, 0);
  assert.equal(response.code, 200);
  assert.deepEqual([...stripeForm].filter(([key]) => key.endsWith("[unit_amount]")).map(([, value]) => Number(value)), [29000,29000]);
});

test("missing deposit decision stops checkout", async () => {
  const { response, stripeForm } = await runCheckout([seat], false, null);
  assert.equal(response.code, 500);
  assert.equal(stripeForm, undefined);
});
