// Shippo: live shipping rates at checkout, and paid orders sent to your Shippo Orders list.

import crypto from "node:crypto";
import { BAGS, BOXES, PACKING_OZ, MAX_BAGS_PER_ORDER } from "./packaging.js";
export { MAX_BAGS_PER_ORDER };

const env = process.env;
const TOKEN = env.SHIPPO_API_TOKEN || "";
const BASE = (env.SHIPPO_API_BASE || "https://api.goshippo.com").replace(/\/$/, "");
// Optional allow-list of service tokens, e.g. "usps_ground_advantage,usps_priority". Blank = any.
const SERVICES = (env.SHIPPO_SERVICES || "").split(",").map(s => s.trim()).filter(Boolean);
const RATE_TTL_MS = 30 * 60 * 1000;

export const FROM_ADDRESS = {
  name: env.SHIP_FROM_NAME || "",
  company: env.SHIP_FROM_COMPANY || "Big Cheese Kettle Co.",
  street1: env.SHIP_FROM_STREET1 || "",
  street2: env.SHIP_FROM_STREET2 || "",
  city: env.SHIP_FROM_CITY || "",
  state: env.SHIP_FROM_STATE || "",
  zip: env.SHIP_FROM_ZIP || "",
  country: "US",
  phone: env.SHIP_FROM_PHONE || "",
  email: env.SHIP_FROM_EMAIL || "",
};

export const SHIPPO_ON = Boolean(TOKEN && FROM_ADDRESS.street1 && FROM_ADDRESS.city && FROM_ADDRESS.state && FROM_ADDRESS.zip);
if (TOKEN && !SHIPPO_ON) {
  console.warn("SHIPPO_API_TOKEN is set but your ship-from address is incomplete. Fill in SHIP_FROM_STREET1, SHIP_FROM_CITY, SHIP_FROM_STATE and SHIP_FROM_ZIP in .env.");
}

export class ShippingError extends Error {}

// ---------- packing ----------
// How much of one box this order fills (1 = exactly full). Infinity = a bag doesn't fit that box.
export function boxFill(box, counts) {
  let fill = 0;
  for (const [kind, qty] of Object.entries(counts)) {
    if (!qty) continue;
    const per = box.fits[kind] || 0;
    if (per <= 0) return Infinity;
    fill += qty / per;
  }
  return Math.round(fill * 1e6) / 1e6; // avoid 0.9999999 / 1.0000001 rounding noise
}

export function buildParcels(lines) {
  const counts = { small: 0, resealable: 0, large: 0 };
  let itemOz = 0;
  for (const l of lines) {
    const bag = BAGS[l.size];
    if (!bag) throw new ShippingError("One of your items can't be shipped. Choose event pickup instead.");
    counts[bag.packAs] += l.qty;
    itemOz += bag.oz * l.qty;
  }
  const largest = BOXES[BOXES.length - 1];
  const fits = BOXES.find(b => boxFill(b, counts) <= 1);
  const box = fits || largest;
  const count = fits ? 1 : Math.ceil(boxFill(largest, counts));
  const each = box.oz + PACKING_OZ + itemOz / count;
  const parcel = {
    length: String(box.length), width: String(box.width), height: String(box.height), distance_unit: "in",
    weight: each.toFixed(1), mass_unit: "oz",
  };
  return { parcels: Array.from({ length: count }, () => ({ ...parcel })), totalOz: +(each * count).toFixed(1), boxName: box.name, count };
}

// ---------- address + fingerprint ----------
export function normalizeAddress(a) {
  const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return {
    street1: s(a?.line1, 100), street2: s(a?.line2, 100), city: s(a?.city, 60),
    state: s(a?.state, 2).toUpperCase(), zip: s(a?.zip, 10),
  };
}
export function addressComplete(a) {
  return Boolean(a.street1 && a.city && /^[A-Z]{2}$/.test(a.state) && /^\d{5}$/.test(a.zip));
}
// Ties a rate to the exact cart and address it was quoted for.
export function fingerprint(lines, addr) {
  const cartKey = lines.map(l => `${l.id}:${l.size}:${l.qty}`).sort().join("|");
  const addrKey = [addr.street1, addr.street2, addr.city, addr.state, addr.zip].join("|").toLowerCase();
  return crypto.createHash("sha256").update(cartKey + "#" + addrKey).digest("hex");
}

// ---------- rates ----------
const rateCache = new Map();
function pruneCache() {
  const now = Date.now();
  for (const [k, v] of rateCache) if (v.expires < now) rateCache.delete(k);
}

export async function getShippingOptions(lines, addr, customer = {}) {
  const { parcels } = buildParcels(lines);
  const shipment = await shippo("/shipments/", {
    address_from: FROM_ADDRESS,
    address_to: { name: customer.name || "Customer", ...addr, country: "US", phone: customer.phone || "", email: customer.email || "" },
    parcels,
    async: false,
  });

  let rates = (shipment.rates || [])
    .map(r => ({
      id: r.object_id,
      amount: Math.round(Number(r.amount) * 100),
      currency: r.currency,
      carrier: r.provider,
      service: r.servicelevel?.name || "",
      token: r.servicelevel?.token || "",
      days: Number.isFinite(Number(r.estimated_days)) && r.estimated_days !== null ? Number(r.estimated_days) : null,
      terms: r.duration_terms || "",
    }))
    .filter(r => r.id && r.currency === "USD" && Number.isFinite(r.amount) && r.amount > 0);
  if (SERVICES.length) rates = rates.filter(r => SERVICES.includes(r.token));

  if (!rates.length) {
    const msg = (shipment.messages || []).map(m => m.text).filter(Boolean).join(" | ");
    if (msg) console.error("Shippo returned no rates:", msg);
    throw new ShippingError("We couldn't get shipping prices for that address. Double-check it and try again.");
  }

  const cheapest = rates.reduce((a, b) => (b.amount < a.amount ? b : a));
  const withDays = rates.filter(r => r.days !== null);
  const fastest = withDays.length
    ? withDays.reduce((a, b) => (b.days < a.days || (b.days === a.days && b.amount < a.amount) ? b : a))
    : null;
  const picks = [{ ...cheapest, cheapest: true }];
  if (fastest && fastest.id !== cheapest.id && (cheapest.days === null || fastest.days < cheapest.days)) {
    picks.push({ ...fastest, cheapest: false });
  }

  pruneCache();
  const fp = fingerprint(lines, addr);
  const expires = Date.now() + RATE_TTL_MS;
  for (const p of picks) rateCache.set(p.id, { ...p, fp, expires });
  return picks.map(({ id, amount, carrier, service, days, terms, cheapest }) => ({ id, amount, carrier, service, days, terms, cheapest }));
}

export function lookupRate(id, lines, addr) {
  const r = typeof id === "string" ? rateCache.get(id) : null;
  if (!r || r.expires < Date.now() || r.fp !== fingerprint(lines, addr)) return null;
  return r;
}

// ---------- orders ----------
export async function sendOrderToShippo({ orderNumber, lines, addr, customer, rate, shippingCost, total }) {
  const { totalOz } = buildParcels(lines);
  const money = c => (c / 100).toFixed(2);
  const body = {
    order_number: orderNumber,
    order_status: "PAID",
    placed_at: new Date().toISOString(),
    to_address: { name: customer.name, ...addr, country: "US", phone: customer.phone, email: customer.email },
    from_address: FROM_ADDRESS,
    line_items: lines.map(l => ({
      title: `${l.name} (${l.sizeLabel})`,
      sku: `${l.id}-${l.size}`,
      quantity: l.qty,
      total_price: money(l.total),
      currency: "USD",
      weight: String(BAGS[l.size].oz * l.qty),
      weight_unit: "oz",
    })),
    shipping_method: `${rate.carrier} ${rate.service}`.trim(),
    shipping_cost: money(shippingCost),
    shipping_cost_currency: "USD",
    subtotal_price: money(total - shippingCost),
    total_price: money(total),
    currency: "USD",
    weight: String(totalOz),
    weight_unit: "oz",
  };
  return shippo("/orders/", body);
}

// ---------- API ----------
async function shippo(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { Authorization: `ShippoToken ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`Shippo ${path} failed (${r.status})`, JSON.stringify(j).slice(0, 800));
      throw new ShippingError("We couldn't reach our shipping service. Try again in a moment, or choose event pickup.");
    }
    return j;
  } catch (e) {
    if (e instanceof ShippingError) throw e;
    console.error(`Shippo ${path} error`, e.message);
    throw new ShippingError("We couldn't reach our shipping service. Try again in a moment, or choose event pickup.");
  } finally {
    clearTimeout(timer);
  }
}
