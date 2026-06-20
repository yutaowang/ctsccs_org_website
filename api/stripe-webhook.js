import crypto from "crypto";

const STRIPE_API_VERSION = "2026-02-25.clover";

export const config = {
  api: {
    bodyParser: false,
  },
};

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function appConfig() {
  const values = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("Stripe webhook service is not fully configured.");
  }
  return values;
}

async function readRawBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body, "utf8");
  if (request.body && typeof request.body === "object" && !request.readable) {
    return Buffer.from(JSON.stringify(request.body), "utf8");
  }
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseStripeSignature(header) {
  return String(header || "").split(",").reduce((values, item) => {
    const [key, value] = item.split("=");
    if (!key || !value) return values;
    if (!values[key]) values[key] = [];
    values[key].push(value);
    return values;
  }, {});
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const signature = parseStripeSignature(signatureHeader);
  const timestamp = signature.t?.[0];
  const expectedSignatures = signature.v1 || [];
  if (!timestamp || !expectedSignatures.length) return false;

  const payload = Buffer.concat([
    Buffer.from(`${timestamp}.`, "utf8"),
    rawBody,
  ]);
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return expectedSignatures.some((candidate) => {
    const left = Buffer.from(candidate, "hex");
    const right = Buffer.from(digest, "hex");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  });
}

async function stripeRequest(configuration, path) {
  const result = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${configuration.stripeSecretKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data?.error?.message || "Could not load Stripe payment details.");
  return data;
}

async function supabaseRequest(configuration, path, options = {}) {
  const result = await fetch(`${configuration.supabaseUrl.replace(/\/$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: configuration.serviceKey,
      Authorization: `Bearer ${configuration.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.profile ? { "Accept-Profile": options.profile, "Content-Profile": options.profile } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await result.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!result.ok) throw new Error(data?.message || "Could not update payment records.");
  return data;
}

function paymentDetailsFromIntent(intent) {
  const charge = typeof intent?.latest_charge === "object" ? intent.latest_charge : null;
  const card = charge?.payment_method_details?.card || {};
  return {
    stripe_payment_intent_id: intent?.id || "",
    stripe_charge_id: charge?.id || "",
    card_brand: card.brand || "",
    card_last4: card.last4 || "",
    card_exp_month: card.exp_month || null,
    card_exp_year: card.exp_year || null,
  };
}

async function recordCheckoutPayment(configuration, session) {
  const familyId = Number(session.metadata?.family_id || session.client_reference_id || 0);
  if (!familyId || !session.id) return;

  let stripeDetails = {};
  if (session.payment_intent) {
    const intentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent.id;
    const intent = await stripeRequest(
      configuration,
      `/v1/payment_intents/${encodeURIComponent(intentId)}?expand[]=latest_charge`,
    );
    stripeDetails = paymentDetailsFromIntent(intent);
  }

  await supabaseRequest(configuration, "/rest/v1/payments?on_conflict=stripe_checkout_session_id", {
    method: "POST",
    profile: "sccs",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      family_id: familyId,
      method: "online",
      amount_cents: Number(session.amount_total || 0),
      currency: String(session.currency || "usd").toLowerCase(),
      paid_at: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      status: "paid",
      stripe_checkout_session_id: session.id,
      notes: "Stripe Checkout",
      ...stripeDetails,
    },
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = appConfig();
    const rawBody = await readRawBody(request);
    const signature = request.headers["stripe-signature"];
    if (!verifyStripeSignature(rawBody, signature, configuration.stripeWebhookSecret)) {
      return json(response, 400, { error: "Invalid Stripe signature." });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      await recordCheckoutPayment(configuration, event.data?.object || {});
    }

    return json(response, 200, { received: true });
  } catch (error) {
    console.error("Stripe webhook failed.", error?.message || error);
    return json(response, 500, { error: "Stripe webhook failed." });
  }
}
