const STRIPE_API_VERSION = "2026-02-25.clover";

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
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("Payment sync service is not fully configured.");
  }
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const result = await fetch(`${configuration.supabaseUrl.replace(/\/$/, "")}${path}`, {
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
  const text = await result.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!result.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
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
  if (!familyId || !session.id) throw new Error("Stripe session is missing family metadata.");
  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw new Error("Stripe session is not paid yet.");
  }

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
    prefer: "resolution=merge-duplicates,return=representation",
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
  return familyId;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = appConfig();
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json(response, 401, { error: "Please log in before syncing payment." });

    const sessionId = String(request.body?.session_id || "").trim();
    if (!sessionId.startsWith("cs_")) {
      return json(response, 400, { error: "Invalid checkout session." });
    }

    const user = await supabaseRequest(configuration, "/auth/v1/user", { token });
    if (!user?.id) return json(response, 401, { error: "Please log in before syncing payment." });

    const session = await stripeRequest(
      configuration,
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge`,
    );
    const familyId = Number(session.metadata?.family_id || session.client_reference_id || 0);
    const familyRows = await supabaseRequest(
      configuration,
      `/rest/v1/families?select=id,user_id&id=eq.${encodeURIComponent(familyId)}&limit=1`,
      { profile: "sccs" },
    );
    const family = familyRows?.[0];
    if (!family || String(family.user_id) !== String(user.id)) {
      return json(response, 403, { error: "This payment does not belong to the logged-in family." });
    }

    await recordCheckoutPayment(configuration, session);
    return json(response, 200, { ok: true });
  } catch (error) {
    console.error("Payment sync failed.", error?.message || error);
    return json(response, 400, { error: error?.message || "Could not sync payment." });
  }
}
