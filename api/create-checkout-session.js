const SAFETY_PATROL_DEPOSIT_CENTS = 4000;
const STRIPE_API_VERSION = "2026-02-25.clover";

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function config() {
  const values = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    siteUrl: process.env.SITE_URL,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("Online payment service is not fully configured.");
  }
  values.siteUrl = new URL(values.siteUrl).origin;
  return values;
}

async function supabaseRequest(configuration, path, options = {}) {
  const response = await fetch(`${configuration.supabaseUrl.replace(/\/$/, "")}${path}`, {
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

async function loadFamilyForUser(configuration, user, token) {
  const byUser = await supabaseRequest(
    configuration,
    `/rest/v1/families?select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { profile: "sccs", token },
  );
  if (!byUser.ok) throw new Error(byUser.data?.message || "Could not load family profile.");
  if (byUser.data?.[0]) return byUser.data[0];

  const byEmail = await supabaseRequest(
    configuration,
    `/rest/v1/families?select=*&email=ilike.${encodeURIComponent(user.email)}&limit=2`,
    { profile: "sccs", token },
  );
  if (!byEmail.ok) throw new Error(byEmail.data?.message || "Could not load family profile.");
  const candidates = byEmail.data || [];
  return candidates.find((row) => row.user_id === user.id) || null;
}

function idsForRegistration(registration) {
  return [registration?.session_1, registration?.session_2, registration?.session_3]
    .map((value) => Number(value))
    .filter(Boolean);
}

function studentName(student) {
  return [student?.first_name, student?.last_name].filter(Boolean).join(" ") || `Student ${student?.id}`;
}

function encodeCheckoutParams(params, prefix = "") {
  const pairs = [];
  Object.entries(params).forEach(([key, value]) => {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          pairs.push(...encodeCheckoutParams(item, `${name}[${index}]`));
        } else if (item !== undefined && item !== null) {
          pairs.push([`${name}[${index}]`, String(item)]);
        }
      });
    } else if (value && typeof value === "object") {
      pairs.push(...encodeCheckoutParams(value, name));
    } else if (value !== undefined && value !== null) {
      pairs.push([name, String(value)]);
    }
  });
  return pairs;
}

async function createStripeCheckoutSession(configuration, params) {
  const form = new URLSearchParams(encodeCheckoutParams(params));
  const result = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: form,
  });
  const data = await result.json();
  if (!result.ok) {
    throw new Error(data?.error?.message || "Could not create Stripe Checkout session.");
  }
  return data;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }

  try {
    const configuration = config();
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json(response, 401, { error: "Please log in before paying online." });

    const userResult = await supabaseRequest(configuration, "/auth/v1/user", { token });
    if (!userResult.ok || !userResult.data?.id) {
      return json(response, 401, { error: "Please log in before paying online." });
    }
    const user = userResult.data;

    const family = await loadFamilyForUser(configuration, user, token);
    if (!family) {
      return json(response, 400, { error: "Please complete the family profile before paying online." });
    }

    const studentsResult = await supabaseRequest(
      configuration,
      `/rest/v1/students?select=id,first_name,last_name&family_id=eq.${encodeURIComponent(family.id)}`,
      { profile: "sccs", token },
    );
    if (!studentsResult.ok) throw new Error(studentsResult.data?.message || "Could not load students.");
    const students = studentsResult.data || [];
    if (!students.length) {
      return json(response, 400, { error: "Please add a student and register classes before paying online." });
    }

    const studentIds = students.map((student) => student.id);
    const registrationsResult = await supabaseRequest(
      configuration,
      `/rest/v1/class_registrations?select=student_id,session_1,session_2,session_3&student_id=in.(${studentIds.join(",")})`,
      { profile: "sccs", token },
    );
    if (!registrationsResult.ok) throw new Error(registrationsResult.data?.message || "Could not load registrations.");
    const registrations = registrationsResult.data || [];
    const classIds = Array.from(new Set(registrations.flatMap(idsForRegistration)));
    if (!classIds.length) {
      return json(response, 400, { error: "Please register at least one class before paying online." });
    }

    const classesResult = await supabaseRequest(
      configuration,
      `/rest/v1/classes?select=id,name,donation&id=in.(${classIds.join(",")})`,
      { profile: "sccs", token },
    );
    if (!classesResult.ok) throw new Error(classesResult.data?.message || "Could not load classes.");
    const classesById = new Map((classesResult.data || []).map((course) => [course.id, course]));
    const studentsById = new Map(students.map((student) => [student.id, student]));

    const courseLineItems = registrations.flatMap((registration) => (
      idsForRegistration(registration)
        .map((classId) => {
          const course = classesById.get(classId);
          const amount = Number(course?.donation || 0) * 100;
          if (!course || amount <= 0) return null;
          return {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${studentName(studentsById.get(registration.student_id))} - ${course.name || "Class Donation"}`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          };
        })
        .filter(Boolean)
    ));

    const lineItems = [
      ...courseLineItems,
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Safety Patrol Deposit" },
          unit_amount: SAFETY_PATROL_DEPOSIT_CENTS,
        },
        quantity: 1,
      },
    ];
    if (!lineItems.length) {
      return json(response, 400, { error: "No payment amount is due." });
    }

    const session = await createStripeCheckoutSession(configuration, {
      mode: "payment",
      client_reference_id: String(family.id),
      customer_email: family.email || user.email,
      payment_method_types: ["card"],
      branding_settings: {
        display_name: "SCCS Online Registration",
        button_color: "#f0bf32",
        background_color: "#fffefa",
        border_style: "rounded",
        logo: {
          type: "url",
          url: `${configuration.siteUrl}/favicon.png`,
        },
        icon: {
          type: "url",
          url: `${configuration.siteUrl}/favicon.png`,
        },
      },
      success_url: `${configuration.siteUrl}/account?payment=success`,
      cancel_url: `${configuration.siteUrl}/account?payment=cancelled`,
      metadata: {
        family_id: String(family.id),
        legacy_family_id: family.legacy_family_id ? String(family.legacy_family_id) : "",
        user_id: user.id,
      },
      line_items: lineItems,
    });

    return json(response, 200, { url: session.url });
  } catch (error) {
    console.error("Checkout session failed.", error?.message || error);
    return json(response, 500, {
      error: error?.message || "Online payment is temporarily unavailable.",
    });
  }
}
