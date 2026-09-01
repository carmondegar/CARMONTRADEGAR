// ============================================================
// Carmon Tradegar · coinalyze-avizor.mjs  (v5 · llamadas AGRUPADAS)
// Capa "avizor": derivados agregados desde Coinalyze.
// Por activo: precio ref · funding actual + por TF · OI abs + %Δ · CVD (Spot/Fut.coin/Fut.stable)
//             con total acumulado · liquidaciones L/S.
// CLAVE DE VELOCIDAD: en vez de 7 llamadas por activo (×27 ≈ 190), se piden los símbolos de
// TODOS los activos juntos en tandas de 20 por endpoint (≈ 65 llamadas) → corridas ~8 min.
// BTC agrega más exchanges (OI preciso ~24B); el resto van ligeros.
// Clave en env COINALYZE_API_KEY (secreto GitHub). Node 18+.
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
const SYMS_BTC  = 20;               // BTC: agrega ~todos los exchanges (OI preciso)
const SYMS_REST = 6;                // ETH y demás: ligero
const capFor = base => base === "BTC" ? SYMS_BTC : SYMS_REST;
const CHUNK = 20;                   // máx. símbolos por llamada en Coinalyze
const STABLES = new Set(["USDT","USDC","BUSD","USDE","FDUSD","DAI"]);
const LOOKBACK_D = 10;              // días de velas 1h (suficiente para totales + ventanas; menos peso)

let calls = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jget(path, params, tries = 0) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  await sleep(2000);
  const r = await fetch(url, { headers: { api_key: KEY, accept: "application/json" } });
  calls++;
  if (r.status === 429) { if (tries < 4) { await sleep(30000); return jget(path, params, tries + 1); } throw new Error("429 tras reintentos en " + path); }
  if (!r.ok) throw new Error("HTTP " + r.status + " en " + path);
  return r.json();
}
async function jgetRetry(path, params, n = 3) {
  for (let i = 0; i < n; i++) { try { return await jget(path, params); } catch (e) { if (i === n - 1) throw e; await sleep(4000); } }
}

const nowSec = () => Math.floor(Date.now() / 1000);
const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

// Agrega por timestamp una lista de {history:[{t,...}]} → serie [{t,v}] ascendente
function aggByT(resArr, valFn) {
  const acc = {};
  for (const s of (resArr || [])) for (const p of (s.history || [])) acc[p.t] = (acc[p.t] || 0) + (valFn(p) || 0);
  return Object.keys(acc).map(Number).sort((a, b) => a - b).map(t => ({ t, v: acc[t] }));
}
function aggAvgByT(resArr, valFn) {
  const accV = {}, accN = {};
  for (const s of (resArr || [])) for (const p of (s.history || [])) { const v = valFn(p); if (v == null || isNaN(v)) continue; accV[p.t] = (accV[p.t] || 0) + v; accN[p.t] = (accN[p.t] || 0) + 1; }
  return Object.keys(accV).map(Number).sort((a, b) => a - b).map(t => ({ t, v: accV[t] / accN[t] }));
}
function lastCloseAvg(resArr) {
  let s = 0, n = 0;
  for (const sym of (resArr || [])) { const h = sym.history || []; const last = h[h.length - 1]; if (last && last.c != null) { s += last.c; n++; } }
  return n ? s / n : null;
}

// --- Mercados: clasifica y CAPA por activo, y guarda mapa símbolo→activo + listas globales ---
async function buildUniverse() {
  const groups = {};                                    // base → {spot,coin,stable,perps} (ya capados)
  const raw = {};                                       // base → mismas listas SIN capar (para elegir las mayores)
  const ensure = (o, b) => (o[b] ||= { spot: [], coin: [], stable: [], perps: [] });
  const fut = await jgetRetry("/future-markets");
  if (!Array.isArray(fut)) throw new Error("/future-markets no devolvió una lista");
  for (const m of fut) {
    const base = (m.base_asset || "").toUpperCase(); if (!ASSETS.includes(base) || !m.is_perpetual) continue;
    const q = (m.quote_asset || "").toUpperCase(); const r = ensure(raw, base);
    r.perps.push(m.symbol);
    if (q === "USD") r.coin.push(m.symbol); else if (STABLES.has(q)) r.stable.push(m.symbol);
  }
  try {
    const spot = await jgetRetry("/spot-markets");
    for (const m of spot) {
      const base = (m.base_asset || "").toUpperCase(); if (!ASSETS.includes(base)) continue;
      const q = (m.quote_asset || "").toUpperCase();
      if (STABLES.has(q) || q === "USD") ensure(raw, base).spot.push(m.symbol);
    }
  } catch (e) { console.error("aviso: /spot-markets no disponible (" + e.message + ") → CVD spot vacío"); }

  const sym2base = {};
  const lists = { perps: [], spot: [], coin: [], stable: [] };
  for (const base of ASSETS) {
    const r = raw[base]; if (!r || !r.perps.length) continue;
    const cap = capFor(base);
    const g = ensure(groups, base);
    for (const k of ["perps", "spot", "coin", "stable"]) {
      g[k] = r[k].slice(0, cap);
      for (const s of g[k]) { sym2base[s] = base; }        // el símbolo pertenece a este activo
      lists[k].push(...g[k]);
    }
  }
  // quitamos duplicados por si un símbolo cayó en dos listas del mismo canal
  for (const k in lists) lists[k] = [...new Set(lists[k])];
  return { groups, sym2base, lists };
}

// --- Fetch AGRUPADO: pide una lista de símbolos en tandas de CHUNK y devuelve todo junto ---
async function batch(endpoint, symList, extra) {
  const out = [];
  for (const c of chunk(symList, CHUNK)) {
    try { const r = await jget(endpoint, { symbols: c.join(","), ...(extra || {}) }); if (Array.isArray(r)) out.push(...r); }
    catch (e) { console.error("  ⚠ " + endpoint + " (tanda): " + e.message); }
  }
  return out;
}
// agrupa resultados [{symbol,history}] por activo
function byBase(resArr, sym2base) {
  const m = {};
  for (const s of (resArr || [])) { const b = sym2base[s.symbol]; if (!b) continue; (m[b] ||= []).push(s); }
  return m;
}

async function main() {
  let uni;
  try { uni = await buildUniverse(); }
  catch (e) { console.error("No se pudieron cargar los mercados (" + e.message + "). Se mantiene el avizor.json anterior."); process.exit(0); }
  const { groups, sym2base, lists } = uni;
  const to = nowSec(), from = to - 3600 * 24 * LOOKBACK_D;

  // Todas las descargas AGRUPADAS (pocas llamadas)
  const oiByBase   = byBase(await batch("/open-interest-history",  lists.perps,  { interval: "1hour", from, to, convert_to_usd: "true" }), sym2base);
  const fhByBase   = byBase(await batch("/funding-rate-history",   lists.perps,  { interval: "1hour", from, to }), sym2base);
  const liqByBase  = byBase(await batch("/liquidation-history",    lists.perps,  { interval: "1hour", from, to, convert_to_usd: "true" }), sym2base);
  const spotByBase = byBase(await batch("/ohlcv-history",          lists.spot,   { interval: "1hour", from, to }), sym2base);
  const coinByBase = byBase(await batch("/ohlcv-history",          lists.coin,   { interval: "1hour", from, to }), sym2base);
  const stbByBase  = byBase(await batch("/ohlcv-history",          lists.stable, { interval: "1hour", from, to }), sym2base);
  // Funding actual (media por activo)
  const fCur = {};
  { const fr = await batch("/funding-rate", lists.perps, {}); const acc = {}, cnt = {};
    for (const x of fr) { const b = sym2base[x.symbol]; if (!b || x.value == null) continue; acc[b] = (acc[b] || 0) + x.value; cnt[b] = (cnt[b] || 0) + 1; }
    for (const b in acc) fCur[b] = +(acc[b] / cnt[b]).toFixed(4); }

  const result = {}; const log = { ok: [], sinSimbolo: [] };
  for (const base of ASSETS) {
    if (!groups[base] || !groups[base].perps.length) { log.sinSimbolo.push(base); continue; }
    const out = {};
    const oi = oiByBase[base] ? aggByT(oiByBase[base], p => p.c) : [];
    out.oi = oi.length ? Math.round(oi[oi.length - 1].v) : null;
    const fundSer = fhByBase[base] ? aggAvgByT(fhByBase[base], p => (p.c ?? p.value ?? p.o)) : [];
    out.funding = (fCur[base] != null) ? fCur[base] : (fundSer.length ? +fundSer[fundSer.length - 1].v.toFixed(4) : null);
    const liqL = liqByBase[base] ? aggByT(liqByBase[base], p => (p.l ?? p.long ?? 0)) : [];
    const liqS = liqByBase[base] ? aggByT(liqByBase[base], p => (p.s ?? p.short ?? 0)) : [];

    let price = null; const cvdSer = { spot: null, coin: null, stable: null };
    for (const [gk, src] of [["spot", spotByBase], ["coin", coinByBase], ["stable", stbByBase]]) {
      const arr = src[base]; if (!arr || !arr.length) continue;
      cvdSer[gk] = aggByT(arr, p => (2 * (p.bv || 0) - (p.v || 0)));
      const px = lastCloseAvg(arr); if (px != null && (gk === "stable" || price == null)) price = px;
    }
    out.price = price != null ? +price.toPrecision(8) : null;
    out.cvdTotSpot   = cvdSer.spot   ? Math.round(sum(cvdSer.spot.map(p => p.v)))   : null;
    out.cvdTotCoin   = cvdSer.coin   ? Math.round(sum(cvdSer.coin.map(p => p.v)))   : null;
    out.cvdTotStable = cvdSer.stable ? Math.round(sum(cvdSer.stable.map(p => p.v))) : null;

    for (const key of TF_LABELS) {
      const h = TF_HOURS[key]; const tf = {};
      if (oi.length) { const last = oi[oi.length - 1].v, prev = oi[Math.max(0, oi.length - 1 - h)].v; tf.oi = Math.round(last); tf.oiChg = prev ? +((last / prev - 1) * 100).toFixed(1) : null; }
      if (fundSer.length) { const w = fundSer.slice(-h).map(p => p.v); tf.funding = w.length ? +(sum(w) / w.length).toFixed(4) : null; }
      for (const gk of ["spot", "coin", "stable"]) { const ser = cvdSer[gk]; tf["cvd" + gk[0].toUpperCase() + gk.slice(1)] = (ser && ser.length) ? Math.round(sum(ser.slice(-h).map(p => p.v))) : null; }
      if (liqL.length) { tf.liqLong = Math.round(sum(liqL.slice(-h).map(p => p.v))); tf.liqShort = Math.round(sum(liqS.slice(-h).map(p => p.v))); }
      out[key] = tf;
    }
    result[base] = out; log.ok.push(base);
  }

  console.log("=== avizor v5 (agrupado) ===");
  console.log("OK:", log.ok.length, "de", ASSETS.length, "· llamadas:", calls);
  if (log.sinSimbolo.length) console.log("Sin símbolo:", log.sinSimbolo.join(", "));
  const b = result.BTC || {};
  console.log("BTC precio", b.price, "funding", b.funding, "oi", b.oi, "| 4H:", JSON.stringify(b["4H"] || {}));

  const sane = log.ok.length >= 15 && (b.oi != null || b.price != null);
  if (!sane) { console.error("Datos insuficientes (ok=" + log.ok.length + "). NO se sobrescribe avizor.json."); process.exit(0); }
  writeFileSync(join(ROOT, "avizor.json"), JSON.stringify({ updated: new Date().toISOString(), source: "Coinalyze (agregado)", tfs: TF_LABELS, data: result }));
  console.log("avizor.json escrito ✅");
}
main().catch(e => { console.error("ERROR avizor (no fatal):", e); process.exit(0); });
