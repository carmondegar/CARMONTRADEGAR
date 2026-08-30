// ============================================================
// Carmon Tradegar · coinalyze-avizor.mjs  (v3)
// Capa "avizor": derivados AGREGADOS (varios exchanges) desde Coinalyze.
// Por activo: funding actual + OI, CVD y liquidaciones.
// Truco de eficiencia: pide la serie de 1H UNA vez por endpoint y deriva
// las ventanas 1H/4H/12H/D agregando (3× menos llamadas → cabe en el límite gratis).
// Escribe avizor.json que lee el escáner MAGO.
//
// Clave en variable de entorno COINALYZE_API_KEY (secreto de GitHub). Node 18+.
// ============================================================
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.COINALYZE_API_KEY;
if (!KEY) { console.error("Falta COINALYZE_API_KEY"); process.exit(1); }
const BASE = "https://api.coinalyze.net/v1";

const ASSETS = ["BTC","ETH","BCH","SOL","AAVE","LTC","LINK","AVAX","TON","XRP","SUI","APT","XLM","ADA","ARB","HBAR","ZEC","TAO","INJ","NEAR","RENDER","DOGE","QNT","VIRTUAL","IOTA","ENA","PEPE"];
const TF_LABELS = ["1H","4H","12H","D"];
const TF_HOURS = { "1H":1, "4H":4, "12H":12, "D":24 };
const MAX_SYMS = 6; // agregamos los ~6 exchanges mayores por activo

let calls = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jget(path, params, tries = 0) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  await sleep(1800);
  const r = await fetch(url, { headers: { api_key: KEY, accept: "application/json" } });
  calls++;
  if (r.status === 429) { if (tries < 5) { await sleep(45000); return jget(path, params, tries + 1); } throw new Error("429 tras reintentos en " + path); }
  if (!r.ok) throw new Error("HTTP " + r.status + " en " + path);
  return r.json();
}

const nowSec = () => Math.floor(Date.now() / 1000);
const sum = a => a.reduce((x, y) => x + (y || 0), 0);

// Suma por timestamp entre los símbolos agregados → serie [{t,v}] ascendente
function aggByT(resArr, valFn) {
  const acc = {};
  for (const s of (resArr || [])) for (const p of (s.history || [])) acc[p.t] = (acc[p.t] || 0) + (valFn(p) || 0);
  return Object.keys(acc).map(Number).sort((a, b) => a - b).map(t => ({ t, v: acc[t] }));
}

async function symbolMap() {
  const markets = await jget("/future-markets");
  const map = {};
  for (const m of markets) {
    if (!m.is_perpetual) continue;
    const base = (m.base_asset || "").toUpperCase();
    if (ASSETS.includes(base)) (map[base] ||= []).push(m.symbol);
  }
  return map;
}

async function avizorAsset(base, symbols) {
  const syms = symbols.slice(0, MAX_SYMS).join(",");
  const out = {};
  const to = nowSec(), from = to - 60 * 60 * 24 * 30; // 30 días de velas 1h

  try { const f = await jget("/funding-rate", { symbols: syms }); const v = f.map(x => x.value).filter(x => x != null); out.funding = v.length ? +(sum(v) / v.length).toFixed(4) : null; }
  catch (e) { out.fundingErr = e.message; }

  let oi = [], cvd = [], liqL = [], liqS = [];
  try { oi = aggByT(await jget("/open-interest-history", { symbols: syms, interval: "1hour", from, to, convert_to_usd: "true" }), p => p.c); } catch (e) { out.oiErr = e.message; }
  try { cvd = aggByT(await jget("/ohlcv-history", { symbols: syms, interval: "1hour", from, to }), p => (2 * (p.bv || 0) - (p.v || 0))); } catch (e) { out.cvdErr = e.message; }
  try { const lq = await jget("/liquidation-history", { symbols: syms, interval: "1hour", from, to, convert_to_usd: "true" }); liqL = aggByT(lq, p => (p.l ?? p.long ?? 0)); liqS = aggByT(lq, p => (p.s ?? p.short ?? 0)); } catch (e) { out.liqErr = e.message; }

  for (const key of TF_LABELS) {
    const h = TF_HOURS[key]; const tf = {};
    if (oi.length) { const last = oi[oi.length - 1].v; const prev = oi[Math.max(0, oi.length - 1 - h)].v; tf.oi = Math.round(last); tf.oiChg = prev ? +((last / prev - 1) * 100).toFixed(1) : null; }
    if (cvd.length) { const net = sum(cvd.slice(-h).map(p => p.v)); tf.cvd = Math.round(net); tf.cvdDir = net > 0 ? 1 : net < 0 ? -1 : 0; }
    if (liqL.length) { tf.liqLong = Math.round(sum(liqL.slice(-h).map(p => p.v))); tf.liqShort = Math.round(sum(liqS.slice(-h).map(p => p.v))); }
    out[key] = tf;
  }
  return out;
}

async function main() {
  const map = await symbolMap();
  const result = {}; const log = { ok: [], sinSimbolo: [], err: [] };
  for (const base of ASSETS) {
    const syms = map[base];
    if (!syms || !syms.length) { log.sinSimbolo.push(base); continue; }
    try { result[base] = await avizorAsset(base, syms); log.ok.push(base); }
    catch (e) { log.err.push(base + ": " + e.message); }
  }
  writeFileSync(join(ROOT, "avizor.json"), JSON.stringify({ updated: new Date().toISOString(), source: "Coinalyze (agregado)", tfs: TF_LABELS, data: result }));
  console.log("=== avizor ===");
  console.log("OK:", log.ok.length, "→", log.ok.join(", "));
  if (log.sinSimbolo.length) console.log("Sin símbolo en Coinalyze:", log.sinSimbolo.join(", "));
  if (log.err.length) log.err.forEach(e => console.log("  ⚠ " + e));
  console.log("Llamadas totales:", calls, "· avizor.json escrito");
}
main().catch(e => { console.error("ERROR avizor:", e); process.exit(1); });
