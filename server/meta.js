// Sends paid orders to Meta's Conversions API as Purchase events.
// The website's Meta Pixel sends the same Purchase with the same event ID (the Square
// order ID), so Meta counts each sale once and fills in sales the browser missed.
// Turned off unless META_PIXEL_ID and META_CAPI_TOKEN are set in .env.

import crypto from "node:crypto";

const env = process.env;
const PIXEL_ID = (env.META_PIXEL_ID || "").trim();
const TOKEN = (env.META_CAPI_TOKEN || "").trim();
const TEST_CODE = (env.META_TEST_EVENT_CODE || "").trim();
const API_VERSION = (env.META_API_VERSION || "v25.0").trim();

export const META_ON = Boolean(PIXEL_ID && TOKEN);

// Meta wants personal details lowercased, trimmed and SHA-256 hashed. Never sent in plain text.
const sha = v => v ? crypto.createHash("sha256").update(v).digest("hex") : undefined;
const norm = v => String(v ?? "").trim().toLowerCase();
const letters = v => norm(v).replace(/[^a-z]/g, "");

export async function sendPurchaseToMeta({ orderId, total, lines, customer, address, req, browser }) {
  if (!META_ON) return;
  const [first, ...rest] = norm(customer.name).split(/\s+/);
  const b = browser && typeof browser === "object" ? browser : {};
  const cookie = (v, prefix) => typeof v === "string" && v.startsWith(prefix) && v.length < 300 ? v : undefined;
  const url = typeof b.url === "string" && /^https:\/\//.test(b.url) ? b.url.slice(0, 500) : undefined;

  const user_data = {
    em: [sha(norm(customer.email))],
    ph: [sha(customer.phone.replace(/\D/g, ""))],
    fn: [sha(letters(first))],
    ln: rest.length ? [sha(letters(rest.at(-1)))] : undefined,
    ct: address?.city ? [sha(letters(address.city))] : undefined,
    st: address?.state ? [sha(norm(address.state))] : undefined,
    zp: address?.zip ? [sha(String(address.zip).slice(0, 5))] : undefined,
    country: [sha("us")],
    client_ip_address: req.ip,
    client_user_agent: req.get("user-agent") || undefined,
    fbp: cookie(b.fbp, "fb."),
    fbc: cookie(b.fbc, "fb."),
  };

  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(orderId),
      action_source: "website",
      event_source_url: url,
      user_data,
      custom_data: {
        currency: "USD",
        value: total / 100,
        content_type: "product",
        content_ids: lines.map(l => `${l.id}-${l.size}`),
        contents: lines.map(l => ({ id: `${l.id}-${l.size}`, quantity: l.qty, item_price: l.unit / 100 })),
        num_items: lines.reduce((n, l) => n + l.qty, 0),
        order_id: String(orderId),
      },
    }],
    ...(TEST_CODE ? { test_event_code: TEST_CODE } : {}),
  };

  const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta ${r.status}: ${j.error?.message || "unknown error"}`);
  return j;
}
