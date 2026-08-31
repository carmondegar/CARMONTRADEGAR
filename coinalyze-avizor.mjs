// ============================================================
// Carmon Tradegar · coinalyze-avizor.mjs  (v4)
// Capa "avizor": derivados AGREGADOS (varios exchanges) desde Coinalyze.
// Por activo:
//   · precio de referencia (último cierre)
//   · funding actual + funding por TF (media de la ventana)
//   · OI absoluto + %Δ por TF
//   · CVD partido en 3: Spot / Futuros coin-margin / Futuros stablecoin-margin
//   · liquidaciones long/short por TF
// Eficiencia: se piden series de 1H y se derivan las ventanas 1H/4H/12H/D.
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
const MAX_SYMS = 6;                 // nº de mercados mayores que agregamos por grupo
const STABLES = new Set(["USDT","USDC","BUSD","USDE","FDUSD","DAI"]);

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

// Suma por timestamp entre símbolos → serie [{t,v}] ascendente
function aggByT(resArr, valFn) {
  const acc = {};
  for (const s of (resArr || [])) for (const p of (s.history || [])) acc[p.t] = (acc[p.t] || 0) + (valFn(p) || 0);
  return Object.keys(acc).map(Number).sort((a, b) => a - b).map(t => ({ t, v: acc[t] }));
}
// Media por timestamp entre símbolos (para funding)
function aggAvgByT(resArr, valFn) {
  const accV = {}, accN = {};
  for (const s of (resArr || [])) for (const p of (s.history || [])) { const v = valFn(p); if (v == null || isNaN(v)) continue; accV[p.t] = (accV[p.t] || 0) + v; accN[p.t] = (accN[p.t] || 0) + 1; }
  return Object.keys(accV).map(Number).sort((a, b) => a - b).map(t => ({ t, v: accV[t] / accN[t] }));
}
// Precio de referencia: media del último cierre de los símbolos (grupo lineal)
function lastCloseAvg(resArr) {
  let s = 0, n = 0;
  for (const sym of (resArr || [])) { const h = sym.history || []; const last = h[h.length - 1]; if (last && last.c != null) { s += last.c; n++; } }
  return n ? s / n : null;
}

// Clasifica mercados de cada activo en spot / coin-margin / stable-margin / todos-los-perps
async function buildGroups() {
  const g = {};
  const ensure = b => (g[b] ||= { spot: [], coin: [], stable: [], perps: [] });
  const fut = await jget("/future-markets");
  for (const m of fut) {
    const base = (m.base_asset || "").toUpperCase(); if (!ASSETS.includes(base)) continue;
    if (!m.is_perpetual) continue;                    // solo perpetuos
    const q = (m.quote_asset || "").toUpperCase();
    const grp = ensure(base); grp.perps.push(m.symbol);
    if (q === "USD") grp.coin.push(m.symbol);          // inverso = coin-margin
    else if (STABLES.has(q)) grp.stable.push(m.symbol); // lineal = stablecoin-margin
  }
  try {
    const spot = await jget("/spot-markets");
    for (const m of spot) {
      const base = (m.base_asset || "").toUpperCase(); if (!ASSETS.includes(base)) continue;
      const q = (m.quote_asset || "").toUpperCase();
      if (STABLES.has(q) || q === "USD") ensure(base).spot.push(m.symbol);
    }
  } catch (e) { console.error("aviso: /spot-markets no disponible (" + e.message + ") → CVD spot vacío"); }
  return g;
}

async function ohlcv(list) {                            // devuelve la respuesta cruda (para net + precio)
  const syms = list.slice(0, MAX_SYMS).join(",");
  const to = nowSec(), from = to - 3600 * 24 * 30;
  return jget("/ohlcv-history", { symbols: syms, interval: "1hour", from, to });
}

async function avizorAsset(base, grp) {
  const out = {};
  const to = nowSec(), from = to - 3600 * 24 * 30;
  const perpSyms = grp.perps.slice(0, MAX_SYMS).join(",");

  // Funding actual (media exchanges)
  try { const f = await jget("/funding-rate", { symbols: perpSyms }); const v = f.map(x => x.value).filter(x => x != null); out.funding = v.length ? +(sum(v) / v.length).toFixed(4) : null; }
  catch (e) { out.fundingErr = e.message; }

  // Funding histórico (para media por TF)
  let fundSer = [];
  try { const fh = await jget("/funding-rate-history", { symbols: perpSyms, interval: "1hour", from, to }); fundSer = aggAvgByT(fh, p => (p.c ?? p.value ?? p.o)); }
  catch (e) { out.fundHistErr = e.message; }

  // OI (USD)
  let oi = [];
  try { oi = aggByT(await jget("/open-interest-history", { symbols: perpSyms, interval: "1hour", from, to, convert_to_usd: "true" }), p => p.c); } catch (e) { out.oiErr = e.message; }
  out.oi = oi.length ? Math.round(oi[oi.length - 1].v) : null;

  // Liquidaciones (USD)
  let liqL = [], liqS = [];
  try { const lq = await jget("/liquidation-history", { symbols: perpSyms, interval: "1hour", from, to, convert_to_usd: "true" }); liqL = aggByT(lq, p => (p.l ?? p.long ?? 0)); liqS = aggByT(lq, p => (p.s ?? p.short ?? 0)); } catch (e) { out.liqErr = e.message; }

  // CVD por grupo (spot / coin / stable) + precio de referencia
  // net = Σ(2·bv − v). Volumen lineal (spot y stablecoin) va en unidad base → ×precio = USD.
  // Volumen inverso (coin-margin) ya viene en USD → sin escalar.
  let price = null;
  const cvd = { spot: null, coin: null, stable: null };
  for (const [gk, scaleByPrice, list] of [["spot", true, grp.spot], ["coin", false, grp.coin], ["stable", true, grp.stable]]) {
    if (!list || !list.length) continue;
    try {
      const raw = await ohlcv(list);
      cvd[gk] = { series: aggByT(raw, p => (2 * (p.bv || 0) - (p.v || 0))), scale: scaleByPrice };
      const px = lastCloseAvg(raw);
      if (px != null && (gk === "stable" || price == null)) price = px;   // preferimos el precio del perp lineal
    } catch (e) { out["cvd_" + gk + "Err"] = e.message; }
  }
  out.price = price != null ? +price.toPrecision(8) : null;

  for (const key of TF_LABELS) {
    const h = TF_HOURS[key]; const tf = {};
    if (oi.length) { const last = oi[oi.length - 1].v, prev = oi[Math.max(0, oi.length - 1 - h)].v; tf.oi = Math.round(last); tf.oiChg = prev ? +((last / prev - 1) * 100).toFixed(1) : null; }
    if (fundSer.length) { const w = fundSer.slice(-h).map(p => p.v); tf.funding = w.length ? +(sum(w) / w.length).toFixed(4) : null; }
    for (const gk of ["spot", "coin", "stable"]) {
      const g = cvd[gk];
      if (g && g.series.length) { let net = sum(g.series.slice(-h).map(p => p.v)); if (g.scale && price) net *= price; tf["cvd" + gk[0].toUpperCase() + gk.slice(1)] = Math.round(net); }
      else tf["cvd" + gk[0].toUpperCase() + gk.slice(1)] = null;
    }
    if (liqL.length) { tf.liqLong = Math.round(sum(liqL.slice(-h).map(p => p.v))); tf.liqShort = Math.round(sum(liqS.slice(-h).map(p => p.v))); }
    out[key] = tf;
  }
  return out;
}

async function main() {
  const groups = await buildGroups();
  const result = {}; const log = { ok: [], sinSimbolo: [], err: [] };
  for (const base of ASSETS) {
    const grp = groups[base];
    if (!grp || !grp.perps.length) { log.sinSimbolo.push(base); continue; }
    try { result[base] = await avizorAsset(base, grp); log.ok.push(base); }
    catch (e) { log.err.push(base + ": " + e.message); }
  }
  writeFileSync(join(ROOT, "avizor.json"), JSON.stringify({ updated: new Date().toISOString(), source: "Coinalyze (agregado)", tfs: TF_LABELS, data: result }));
  console.log("=== avizor v4 ===");
  console.log("OK:", log.ok.length, "→", log.ok.join(", "));
  if (log.sinSimbolo.length) console.log("Sin símbolo:", log.sinSimbolo.join(", "));
  if (log.err.length) log.err.forEach(e => console.log("  ⚠ " + e));
  // muestra de campos por si algún grupo viene vacío
  const b = result.BTC || {};
  console.log("BTC precio", b.price, "funding", b.funding, "oi", b.oi, "| 4H:", JSON.stringify(b["4H"] || {}));
  console.log("Llamadas totales:", calls, "· avizor.json escrito");
}
main().catch(e => { console.error("ERROR avizor:", e); process.exit(1); });
