import { internal } from "./error";

export type StripeList<T> = {
  data: T[];
};

export type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  default_price: StripePrice | string | null;
};

export type StripePrice = {
  id: string;
  product: StripeProduct | string | null;
  unit_amount: number | null;
  currency: string | null;
  recurring: {
    interval: string | null;
    trial_period_days: number | null;
  } | null;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  client_reference_id: string | null;
};

export async function stripeGet<T>(
  secretKey: string,
  path: string,
  params: Record<string, string | string[]>,
): Promise<T> {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        url.searchParams.append(key, v);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (resp.status >= 400) {
    const txt = await resp.text();
    throw internal(`Stripe GET ${path} failed: ${resp.status} ${txt}`);
  }

  return resp.json() as Promise<T>;
}

export async function stripePostForm<T>(
  secretKey: string,
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const form = new URLSearchParams(body);

  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (resp.status >= 400) {
    const txt = await resp.text();
    throw internal(`Stripe POST ${path} failed: ${resp.status} ${txt}`);
  }

  return resp.json() as Promise<T>;
}

export async function verifyWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of sigHeader.split(",")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("t=")) {
      timestamp = trimmed.slice(2);
    } else if (trimmed.startsWith("v1=")) {
      signatures.push(trimmed.slice(3));
    }
  }

  if (!timestamp) {
    throw internal("Missing timestamp in webhook signature");
  }
  if (signatures.length === 0) {
    throw internal("Missing signature in webhook header");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(secret, signedPayload);

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }

  return signatures.some((sig) => timingSafeEqual(expected, sig));
}

async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
