import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { ApiError } from "./error";
import { requireUser } from "./auth";
import {
  stripeGet,
  stripePostForm,
  verifyWebhookSignature,
  type StripeList,
  type StripeProduct,
  type StripePrice,
  type StripeCheckoutSession,
} from "./stripe";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return err.toResponse();
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// Health
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Session
app.get("/api/session", async (c) => {
  const user = await requireUser(c);
  return c.json({ userId: user.userId });
});

// Stripe: List products
app.get("/api/stripe/products", async (c) => {
  const list = await stripeGet<StripeList<StripeProduct>>(
    c.env.STRIPE_SECRET_KEY,
    "products",
    { active: "true", "expand[]": ["data.default_price"], limit: "100" },
  );

  const products = list.data.map((p) => {
    const defaultPriceId =
      typeof p.default_price === "string"
        ? p.default_price
        : p.default_price?.id ?? null;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      defaultPriceId,
    };
  });

  return c.json(products);
});

// Stripe: List prices
app.get("/api/stripe/prices", async (c) => {
  const list = await stripeGet<StripeList<StripePrice>>(
    c.env.STRIPE_SECRET_KEY,
    "prices",
    { active: "true", type: "recurring", "expand[]": ["data.product"], limit: "100" },
  );

  const prices = list.data.map((p) => {
    const productId =
      typeof p.product === "string"
        ? p.product
        : p.product?.id ?? "";
    return {
      id: p.id,
      productId,
      unitAmount: p.unit_amount ?? 0,
      currency: p.currency ?? "usd",
      interval: p.recurring?.interval ?? null,
      trialPeriodDays: p.recurring?.trial_period_days ?? null,
    };
  });

  return c.json(prices);
});

// Stripe: Create checkout session
app.post("/api/stripe/checkout/sessions", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<{ priceId?: string }>();

  if (!body.priceId) {
    return c.json({ error: "priceId is required" }, 400);
  }

  const baseUrl = c.env.APP_BASE_URL ?? "http://localhost:5285";
  const successUrl = `${baseUrl}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/pricing`;

  const session = await stripePostForm<StripeCheckoutSession>(
    c.env.STRIPE_SECRET_KEY,
    "checkout/sessions",
    {
      "payment_method_types[]": "card",
      "line_items[0][price]": body.priceId,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.userId,
      allow_promotion_codes: "true",
      "subscription_data[trial_period_days]": "14",
    },
  );

  return c.json({ url: session.url });
});

// Stripe: Billing portal (not yet implemented)
app.post("/api/stripe/billing-portal/sessions", async (c) => {
  await requireUser(c);
  // TODO: Look up stripe_customer_id from user's profile in database,
  // then create a billing portal session.
  return c.json({ error: "Billing portal not yet implemented" }, 500);
});

// Stripe: Webhook
app.post("/api/webhooks/stripe", async (c) => {
  const sig = c.req.header("stripe-signature") ?? "";
  const payload = await c.req.text();

  const valid = await verifyWebhookSignature(
    payload,
    sig,
    c.env.STRIPE_WEBHOOK_SECRET,
  );
  if (!valid) {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(payload) as { type: string; data: { object: unknown } };

  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // TODO: Update subscription status in database
      console.log(`Stripe webhook: ${event.type} processed`);
      break;
    default:
      console.log(`Stripe webhook: unhandled event type ${event.type}`);
      break;
  }

  return c.json({ received: true });
});

export default app;
