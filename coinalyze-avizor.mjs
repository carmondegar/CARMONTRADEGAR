// ============================================================
// Carmon Tradegar · coinalyze-avizor.mjs
// Capa "avizor": derivados AGREGADOS (todos los exchanges) desde Coinalyze.
// Por activo y por temporalidad (4H, 12H, D): funding, open interest, CVD, liquidaciones.
// Escribe avizor.json que lee el escáner MAGO.
//
// La clave va en la variable de entorno COINALYZE_API_KEY (secreto de GitHub, nunca en el código).
// A prueba de fallos: si algo no responde, se omite y se anota en el log.
// Node 18+.  Uso:  COINALYZE_API_KEY=xxx node coinalyze-avizor.mjs
// ============================================================
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.COINALYZE_API_KEY;
if (!KEY) { console.error("Falta COINALYZE_API_KEY"); process.exit(1); }
const BASE = "https://api.coinalyze.net/v1";

// Activos (base asset) — mismos que el escáner MAGO
const ASSETS = ["BTC","ETH","BCH","SOL","AAVE","LTC","LINK","AVAX","TON","XRP","SUI","APT","XLM","ADA","ARB","HBAR","ZEC","TAO","INJ","NEAR","RENDER","DOGE","QNT","VIRTUAL","IOTA","ENA","PEPE"];
const TFS = [["1hour","1H"], ["4hour","4H"], ["12hour","12H"], ["daily","D"]];

const MAX_SYMS = 6;   // agregamos los ~6 exchanges mayores por activo (≈90% del volumen)
let calls = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jget(path, params, tries = 0) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  await sleep(2000); // ritmo base
  const r = await fetch(url, { headers: { api_key: KEY, accept: "application/json" } });
  calls++;
  if (r.status === 429) { // límite: esperar el reset de la ventana y reintentar
    if (tries < 5) { await sleep(45000); return jget(path, params, tries + 1); }
    throw new Error("429 tras reintentos en " + path);
  }
  if (!r.ok) throw new Error("HTTP " + r.status + " en " + path);
  return r.json();
}

// 1) Descubrir símbolos de perpetuos por activo base (agregando todos los exchanges)
async function symbolMap() {
  const markets = await jget("/future-markets");
  const map = {};
  for (const m of markets) {
    if (!m.is_perpetual) continue;
    const base = (m.base_asset || "").toUpperCase();
    if (!ASSETS.includes(base)) continue;
    (map[base] ||= []).push(m.symbol);
  }
  return map;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// Agrega una serie histórica sumando por timestamp entre varios símbolos.
function aggByT(resArr, valFn) {
  const acc = {}; // t -> valor sumado
  for (const series of resArr) {
    for (const p of (series.history || [])) { acc[p.t] = (acc[p.t] || 0) + (valFn(p) || 0); }
  }
  const ts = Object.keys(acc).map(Number).sort((a, b) => a - b);
  return ts.map(t => ({ t, v: acc[t] }));
}

async function avizorAsset(base, symbols) {
  const syms = symbols.slice(0, MAX_SYMS).join(","); // top exchanges (agregado)
  const out = {};
  // Funding actual (media entre exchanges)
  try {
    const f = await jget("/funding-rate", { symbols: syms });
    const vals = f.map(x => x.value).filter(v => v != null);
    out.funding = vals.length ? +(sum(vals) / vals.length).toFixed(4) : null;
  } catch (e) { out.fundingErr = e.message; }

  for (const [itv, key] of TFS) {
    const to = nowSec(), from = to - 60 * 60 * 24 * 30; // 30 días
    const tf = {};
    // Open Interest (agregado, en USD)
    try {
      const oi = await jget("/open-interest-history", { symbols: syms, interval: itv, from, to, convert_to_usd: "true" });
      const agg = aggByT(oi, p => p.c); // cierre de OI por vela
      if (agg.length >= 2) { tf.oi = agg[agg.length - 1].v; tf.oiChg = +((agg[agg.length - 1].v / agg[0].v - 1) * 100).toFixed(1); }
    } catch (e) { tf.oiErr = e.message; }
    // CVD (de ohlcv: buy - sell = 2*bv - v), acumulado en la ventana
    try {
      const oh = await jget("/ohlcv-history", { symbols: syms, interval: itv, from, to });
      const agg = aggByT(oh, p => (2 * (p.bv || 0) - (p.v || 0)));
      let cum = 0; const cvd = agg.map(p => (cum += p.v, cum));
      if (cvd.length) { tf.cvd = Math.round(cvd[cvd.length - 1]); tf.cvdDir = cvd[cvd.length - 1] > (cvd[Math.max(0, cvd.length - 6)] || 0) ? 1 : -1; }
    } catch (e) { tf.cvdErr = e.message; }
    // Liquidaciones (long/short en la última vela)
    try {
      const lq = await jget("/liquidation-history", { symbols: syms, interval: itv, from, to, convert_to_usd: "true" });
      const longs = aggByT(lq, p => p.l), shorts = aggByT(lq, p => p.s);
      tf.liqLong = longs.length ? Math.round(longs[longs.length - 1].v) : 0;
      tf.liqShort = shorts.length ? Math.round(shorts[shorts.length - 1].v) : 0;
    } catch (e) { tf.liqErr = e.message; }
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
  const payload = { updated: new Date().toISOString(), source: "Coinalyze (agregado)", tfs: TFS.map(t => t[1]), data: result };
  writeFileSync(join(ROOT, "avizor.json"), JSON.stringify(payload));
  console.log("=== avizor ===");
  console.log("OK:", log.ok.length, log.ok.join(", "));
  if (log.sinSimbolo.length) console.log("Sin símbolo en Coinalyze:", log.sinSimbolo.join(", "));
  if (log.err.length) log.err.forEach(e => console.log("  ⚠ " + e));
  console.log("Llamadas:", calls, "· avizor.json escrito");
}
main().catch(e => { console.error("ERROR avizor:", e); process.exit(1); });
