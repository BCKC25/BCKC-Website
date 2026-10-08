// Big Cheese Kettle Co. checkout server.
// Takes the cart from the website, prices it here, creates the order in Square,
// and charges the card token from Square's payment form.
// Start with: node --env-file=.env server.js

import express from "express";
import crypto from "node:crypto";
import { MENU, MAX_QTY_PER_LINE } from "./menu.js";

// ---------- settings (from .env) ----------
const env = process.env;
const ENVIRONMENT = env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
const ACCESS_TOKEN = env.SQUARE_ACCESS_TOKEN || "";
const APPLICATION_ID = env.SQUARE_APPLICATION_ID || "";
const LOCATION_ID = env.SQUARE_LOCATION_ID || "";
const SQUARE_VERSION = env.SQUARE_VERSION || ""; // blank = your app's default API version
const SQUARE_BASE = env.SQUARE_API_BASE ||
  (ENVIRONMENT === "production" ? "https://connect.squareup.com/v2" : "https://connect.squareupsandbox.com/v2");
const PORT = Number(env.PORT || 3000);
const ALLOWED_ORIGINS = list(env.ALLOWED_ORIGINS);

const DELIVERY_FEE = money(env.DELIVERY_FEE);           // blank = local delivery turned off
const FREE_DELIVERY_MINIMUM = money(env.FREE_DELIVERY_MINIMUM);
const DELIVERY_ZIPS = list(env.DELIVERY_ZIPS);
const SHIPPING_FEE = money(env.SHIPPING_FEE);           // blank = shipping turned off
const FREE_SHIPPING_MINIMUM = money(env.FREE_SHIPPING_MINIMUM);
const SHIP_STATES = list(env.SHIP_STATES).map(s => s.toUpperCase()); // blank = any US state
const INCLUSIVE_TAX_PERCENT = env.INCLUSIVE_TAX_PERCENT?.trim() || ""; // recorded inside prices, never added on top

const DELIVERY_ON = DELIVERY_FEE !== null && DELIVERY_ZIPS.length > 0;
const SHIPPING_ON = SHIPPING_FEE !== null;

if (!ACCESS_TOKEN || !APPLICATION_ID || !LOCATION_ID) {
  console.warn("Square settings are missing. Fill in SQUARE_ACCESS_TOKEN, SQUARE_APPLICATION_ID and SQUARE_LOCATION_ID in .env.");
}

function list(v) { return (v || "").split(",").map(s => s.trim()).filter(Boolean); }
function money(v) {
  if (v === undefined || String(v).trim() === "") return null;
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Simple per-visitor limit on checkout attempts.
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip + req.path;
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: "Too many tries. Wait a minute and try again." });
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

class UserError extends Error {}

app.get("/api/health", (req, res) => res.json({ ok: true, environment: ENVIRONMENT }));

app.get("/api/config", (req, res) => {
  res.json({
    environment: ENVIRONMENT,
    applicationId: APPLICATION_ID,
    locationId: LOCATION_ID,
    ready: Boolean(ACCESS_TOKEN && APPLICATION_ID && LOCATION_ID),
    pickup: { enabled: true },
    delivery: { enabled: DELIVERY_ON, fee: DELIVERY_FEE, freeMinimum: FREE_DELIVERY_MINIMUM, zips: DELIVERY_ZIPS },
    shipping: { enabled: SHIPPING_ON, fee: SHIPPING_FEE, freeMinimum: FREE_SHIPPING_MINIMUM, states: SHIP_STATES },
  });
});

app.post("/api/quote", rateLimit(60, 60_000), (req, res) => {
  try {
    res.json(publicQuote(priceCart(req.body)));
  } catch (e) { sendError(res, e); }
});

app.post("/api/checkout", rateLimit(10, 60_000), async (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b.token !== "string" || !b.token) throw new UserError("Payment details are missing. Re-enter your card and try again.");
    if (typeof b.idempotencyKey !== "string" || b.idempotencyKey.length < 8 || b.idempotencyKey.length > 100) throw new UserError("Refresh the page and try again.");

    const quote = priceCart(b);
    const customer = cleanCustomer(b.customer);
    const fulfillment = buildFulfillment(quote.fulfillment, b.fulfillment, customer);

    // Same cart + same checkout attempt = same Square order, so retries never double up.
    const orderKey = hash(b.idempotencyKey + JSON.stringify([quote.lines, quote.fulfillment, customer])).slice(0, 40);
    const order = {
      location_id: LOCATION_ID,
      reference_id: orderKey.slice(0, 12),
      source: { name: "bigcheesekettleco.com" },
      line_items: quote.lines.map(l => ({
        name: l.name,
        variation_name: l.sizeLabel,
        quantity: String(l.qty),
        base_price_money: { amount: l.unit, currency: "USD" },
      })),
      fulfillments: [fulfillment],
    };
    if (quote.fee > 0) {
      order.service_charges = [{
        name: quote.feeLabel,
        amount_money: { amount: quote.fee, currency: "USD" },
        calculation_phase: "TOTAL_PHASE",
      }];
    }
    if (INCLUSIVE_TAX_PERCENT) {
      order.taxes = [{ uid: "sales-tax", name: "Sales tax (included)", percentage: INCLUSIVE_TAX_PERCENT, type: "INCLUSIVE", scope: "ORDER" }];
    }

    const created = await square("/orders", { idempotency_key: orderKey, order });
    const sqOrder = created.order;
    const total = Number(sqOrder?.total_money?.amount);
    if (!Number.isFinite(total) || total !== quote.total) {
      console.error("Total mismatch", { ours: quote.total, square: total, order: sqOrder?.id });
      throw new UserError("We couldn't confirm your total. You have not been charged. Please try again.");
    }

    const payKey = hash(orderKey + b.token).slice(0, 40);
    const paid = await square("/payments", {
      source_id: b.token,
      idempotency_key: payKey,
      amount_money: { amount: total, currency: "USD" },
      order_id: sqOrder.id,
      location_id: LOCATION_ID,
      buyer_email_address: customer.email,
      note: `Online order ${sqOrder.id}`,
      ...(typeof b.verificationToken === "string" && b.verificationToken ? { verification_token: b.verificationToken } : {}),
    });

    res.json({
      ok: true,
      orderId: sqOrder.id,
      total,
      receiptUrl: paid.payment?.receipt_url || null,
    });
  } catch (e) { sendError(res, e); }
});

// ---------- pricing ----------
function priceCart(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) throw new UserError("Your cart is empty.");
  if (items.length > 30) throw new UserError("That's a lot of different items. Please call or email us for large orders.");

  const merged = new Map();
  for (const it of items) {
    const item = MENU[it?.id];
    const size = item?.sizes[it?.size];
    const qty = Number(it?.qty);
    if (!item || !size) throw new UserError("Something in your cart is no longer on the menu. Remove it and try again.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) throw new UserError(`Quantities must be between 1 and ${MAX_QTY_PER_LINE}.`);
    const key = `${it.id}:${it.size}`;
    const prev = merged.get(key);
    merged.set(key, { id: it.id, size: it.size, name: item.name, sizeLabel: size.label, unit: size.price, qty: (prev?.qty || 0) + qty });
  }
  const lines = [...merged.values()].map(l => ({ ...l, qty: Math.min(l.qty, MAX_QTY_PER_LINE), total: l.unit * Math.min(l.qty, MAX_QTY_PER_LINE) }));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  const type = body?.fulfillment?.type;
  let fee = 0, feeLabel = "";
  if (type === "pickup") {
    // free
  } else if (type === "delivery") {
    if (!DELIVERY_ON) throw new UserError("Local delivery isn't available yet. Choose event pickup instead.");
    const zip = String(body.fulfillment.zip || body.fulfillment.address?.zip || "").trim();
    if (zip && !DELIVERY_ZIPS.includes(zip)) throw new UserError(`We don't deliver to ${zip} yet.${SHIPPING_ON ? " Choose shipping instead." : ""}`);
    fee = FREE_DELIVERY_MINIMUM !== null && subtotal >= FREE_DELIVERY_MINIMUM ? 0 : DELIVERY_FEE;
    feeLabel = "Local delivery";
  } else if (type === "shipping") {
    if (!SHIPPING_ON) throw new UserError("Shipping isn't available yet. Choose event pickup instead.");
    fee = FREE_SHIPPING_MINIMUM !== null && subtotal >= FREE_SHIPPING_MINIMUM ? 0 : SHIPPING_FEE;
    feeLabel = "Shipping";
  } else {
    throw new UserError("Choose event pickup, local delivery, or shipping.");
  }
  return { lines, subtotal, fee, feeLabel, total: subtotal + fee, fulfillment: type };
}

function publicQuote(q) {
  return {
    lines: q.lines.map(({ id, size, name, sizeLabel, unit, qty, total }) => ({ id, size, name, sizeLabel, unit, qty, total })),
    subtotal: q.subtotal, fee: q.fee, feeLabel: q.feeLabel, total: q.total,
  };
}

// ---------- customer + fulfillment ----------
function cleanCustomer(c) {
  const name = str(c?.name, 80);
  const email = str(c?.email, 120);
  const digits = String(c?.phone || "").replace(/\D/g, "");
  if (!name) throw new UserError("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Enter a valid email address so we can send your receipt.");
  const phone = digits.length === 10 ? "+1" + digits : digits.length === 11 && digits[0] === "1" ? "+" + digits : "";
  if (!phone) throw new UserError("Enter a 10-digit phone number so we can reach you about your order.");
  return { name, email, phone };
}

function buildFulfillment(type, f, customer) {
  const recipient = { display_name: customer.name, email_address: customer.email, phone_number: customer.phone };
  const note = str(f?.note, 300);

  if (type === "pickup") {
    const date = String(f?.event?.date || "");
    const eventName = str(f?.event?.name, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !eventName) throw new UserError("Choose the event where you'll pick up.");
    // Event start time in Aiken (Eastern), or midday if none given. Name and hours go in the note.
    const start = /^\d{2}:\d{2}$/.test(String(f?.event?.start || "")) ? f.event.start : "12:00";
    const pickupAt = easternTime(date, start);
    if (Number.isNaN(pickupAt.getTime()) || pickupAt < startOfToday()) throw new UserError("That event has already happened. Choose an upcoming one.");
    return {
      type: "PICKUP",
      state: "PROPOSED",
      pickup_details: {
        recipient,
        schedule_type: "SCHEDULED",
        pickup_at: pickupAt.toISOString(),
        note: [`Pick up at: ${eventName}`, str(f?.event?.where, 120), str(f?.event?.time, 60), note].filter(Boolean).join(" · ").slice(0, 500),
      },
    };
  }

  const a = f?.address || {};
  const address = {
    address_line_1: str(a.line1, 100),
    address_line_2: str(a.line2, 100) || undefined,
    locality: str(a.city, 60),
    administrative_district_level_1: str(a.state, 2).toUpperCase(),
    postal_code: str(a.zip, 10),
    country: "US",
  };
  if (!address.address_line_1 || !address.locality || !/^[A-Z]{2}$/.test(address.administrative_district_level_1) || !/^\d{5}$/.test(address.postal_code)) {
    throw new UserError("Enter your full street address, city, 2-letter state, and 5-digit ZIP.");
  }

  if (type === "delivery") {
    if (!DELIVERY_ZIPS.includes(address.postal_code)) throw new UserError(`We don't deliver to ${address.postal_code} yet.`);
    return {
      type: "DELIVERY",
      state: "PROPOSED",
      delivery_details: { recipient: { ...recipient, address }, schedule_type: "ASAP", note: note || undefined },
    };
  }

  if (type === "shipping") {
    if (SHIP_STATES.length && !SHIP_STATES.includes(address.administrative_district_level_1)) {
      throw new UserError(`We only ship to ${SHIP_STATES.join(", ")} right now.`);
    }
    return {
      type: "SHIPMENT",
      state: "PROPOSED",
      shipment_details: { recipient: { ...recipient, address }, shipping_note: note || undefined },
    };
  }
  throw new UserError("Choose event pickup, local delivery, or shipping.");
}

function str(v, max) { return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max); }
function hash(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
// Converts a date + time on the clock in Aiken (handles daylight saving) to a real moment.
function easternTime(date, hhmm) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  if (Number.isNaN(guess.getTime())) return guess;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess).map(p => [p.type, p.value]));
  const shownAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() + (guess.getTime() - shownAsUtc));
}
function startOfToday() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }

// ---------- Square ----------
async function square(path, body) {
  const headers = { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" };
  if (SQUARE_VERSION) headers["Square-Version"] = SQUARE_VERSION;
  const r = await fetch(SQUARE_BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`Square ${path} failed (${r.status})`);
    err.square = j.errors || [];
    throw err;
  }
  return j;
}

const CARD_MESSAGES = {
  CARD_DECLINED: "Your card was declined. Try another card.",
  GENERIC_DECLINE: "Your card was declined. Try another card.",
  INSUFFICIENT_FUNDS: "Your card was declined for insufficient funds. Try another card.",
  CVV_FAILURE: "The security code (CVV) didn't match. Check it and try again.",
  ADDRESS_VERIFICATION_FAILURE: "The billing ZIP didn't match your card. Check it and try again.",
  INVALID_EXPIRATION: "The expiration date isn't valid. Check it and try again.",
  INVALID_CARD: "That card number isn't valid. Check it and try again.",
  CARD_EXPIRED: "That card has expired. Try another card.",
  VERIFY_CVV_FAILURE: "The security code (CVV) didn't match. Check it and try again.",
  VERIFY_AVS_FAILURE: "The billing ZIP didn't match your card. Check it and try again.",
};

function sendError(res, e) {
  if (e instanceof UserError) return res.status(400).json({ error: e.message });
  if (e.square) {
    console.error(e.message, JSON.stringify(e.square));
    const code = e.square.find(x => CARD_MESSAGES[x.code])?.code;
    if (code) return res.status(402).json({ error: CARD_MESSAGES[code] });
    return res.status(502).json({ error: "We couldn't complete your payment. Please try again. You won't be charged twice." });
  }
  console.error(e);
  res.status(500).json({ error: "Something went wrong on our end. Please try again. You won't be charged twice." });
}

if (!env.NO_LISTEN) {
  app.listen(PORT, "127.0.0.1", () => console.log(`Checkout server on http://127.0.0.1:${PORT} (${ENVIRONMENT})`));
}

export { app, priceCart };
