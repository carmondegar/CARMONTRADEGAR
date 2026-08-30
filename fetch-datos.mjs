// Carmon Tradegar · fetch-datos.mjs (layout PLANO)
// Genera datos-hoy.json: precio (Binance) + técnicos (compute-tech) + on-chain (BRK, solo BTC).
// A prueba de fallos: si una on-chain no responde, se omite (forward-fill) y se lista al final.
// Node 18+.  Uso: node fetch-datos.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { technicalsFor } from "./compute-tech.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const fp = (n) => join(ROOT, n);
const TIMEOUT = 15000;

async function jget(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function loadReal(file, type) {
  const sandbox = { window: {} };
  new Function("window", readFileSync(fp(file), "utf8"))(sandbox.window);
  const Rr = sandbox.window.BambuRealData[type];
  return { dates: Rr.dates.slice(), price: Rr.cols.price.slice() };
}
// Precio de hoy — resistente a geobloqueo de Binance en servidores de GitHub.
// 1) data-api.binance.vision (datos públicos de Binance, sin geobloqueo)
// 2) CoinGecko de respaldo.
async function priceToday(symbol, cgId) {
  try {
    const j = await jget(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&limit=1`);
    const k = j[j.length - 1];
    return { iso: new Date(k[0]).toISOString().slice(0, 10), close: parseFloat(k[4]) };
  } catch (e1) {
    const g = await jget(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
    if (!g[cgId] || g[cgId].usd == null) throw new Error("precio no disponible (Binance y CoinGecko fallaron)");
    return { iso: new Date().toISOString().slice(0, 10), close: g[cgId].usd };
  }
}
const BRK_MAP = {
  nuplSTH: "sth_nupl", nuplLTH: "lth_nupl",
  sthSopr: "sth_sopr_24h", lthSopr: "lth_sopr_24h", asopr: "sopr_24h", // SOPR diario = variantes _24h
  puell: "puell_multiple",
  rpSTH: "sth_realized_price", rpLTH: "lth_realized_price",
  // mvrvZ: BRK no publica MVRV Z-score → se mantiene el último valor (forward-fill)
};
const BRK = "https://bitview.space/api/series";
async function brkLatest(id) {
  const j = await jget(`${BRK}/${id}/day1/latest`);
  if (typeof j === "number") return j;
  if (Array.isArray(j)) return Number(j[j.length - 1]);
  if (j && typeof j === "object") return Number(j.value ?? j.v ?? Object.values(j).pop());
  return null;
}
// CDD como oscilador = vocdd de hoy (24h) ÷ media diaria del último año.
// Usa dos series ya calculadas por BRK (sin rangos): vocdd_sum_24h y vocdd_sum_1y.
async function brkCdd() {
  const s24 = await brkLatest("vocdd_sum_24h");
  const s1y = await brkLatest("vocdd_sum_1y");
  if (s24 == null || s1y == null || !s1y || isNaN(s24) || isNaN(s1y)) return null;
  return +(s24 / (s1y / 365)).toFixed(3);
}
async function block(file, type, symbol, cgId, full) {
  const base = loadReal(file, type);
  const p = await priceToday(symbol, cgId);
  const prices = base.price.slice(), dates = base.dates.slice();
  if (dates[dates.length - 1] === p.iso) prices[prices.length - 1] = p.close;
  else { prices.push(p.close); dates.push(p.iso); }
  const tech = technicalsFor(prices, dates);
  const values = { price: +p.close.toFixed(2), ...tech };
  const log = [];
  if (full) {
    for (const [field, id] of Object.entries(BRK_MAP)) {
      try { const v = await brkLatest(id); if (v != null && !isNaN(v)) values[field] = v; else throw new Error("vacío"); }
      catch (e) { log.push(`${field} (${id}) · ${e.message}`); }
    }
    try { const c = await brkCdd(); if (c != null) values.cdd = c; else log.push("cdd (vocdd) · vacío"); }
    catch (e) { log.push("cdd · " + e.message); }
  }
  return { iso: p.iso, values, log };
}
async function main() {
  const btc = await block("btc_real.js", "BTC", "BTCUSDT", "bitcoin", true);
  const eth = await block("eth_real.js", "ETH", "ETHUSDT", "ethereum", false);
  writeFileSync(fp("datos-hoy.json"), JSON.stringify({ BTC: { iso: btc.iso, values: btc.values }, ETH: { iso: eth.iso, values: eth.values } }, null, 2));
  console.log("=== fetch-datos ===");
  console.log("BTC", btc.iso, btc.values.price, "| ETH", eth.iso, eth.values.price);
  if (btc.log.length) { console.log("On-chain en forward-fill (ajustar ID en BRK_MAP):"); btc.log.forEach((x) => console.log("   ⚠ " + x)); }
  else console.log("On-chain: todas las métricas trajeron dato fresco ✅");
  console.log("OK · datos-hoy.json escrito");
}
main().catch((e) => { console.error("ERROR fetch-datos:", e); process.exit(1); });
