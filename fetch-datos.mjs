// ============================================================
// Carmon Tradegar · fetch-datos.mjs
// Genera datos-hoy.json con los valores de HOY:
//   - Precio: Binance (klines diarios, sin clave)  BTC y ETH
//   - Técnicos: calculados desde el precio (compute-tech.mjs)  BTC y ETH
//   - On-chain: BRK (Bitcoin Research Kit, gratis sin clave)   solo BTC
// A prueba de fallos: si una métrica on-chain no responde, se omite y
// build-datos.mjs mantiene el último valor (forward-fill). Al final imprime
// un resumen de qué campos trajeron dato fresco y cuáles no.
// Node 18+ (fetch nativo).
// ============================================================
import { readFile, writeFile } from "node:fs/promises";
import { technicalsFor } from "./compute-tech.mjs";

const APP = new URL("../src/app/", import.meta.url);
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

// --- cargar el histórico de precios existente (para técnicos y append) ---
async function loadReal(file, type) {
  const src = await readFile(new URL(file, APP), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const R = sandbox.window.BambuRealData[type];
  return { dates: R.dates.slice(), price: R.cols.price.slice() };
}

// --- precio de hoy desde Binance (kline diario más reciente) ---
async function priceToday(symbol) {
  const j = await jget(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=1`);
  const k = j[j.length - 1];
  const iso = new Date(k[0]).toISOString().slice(0, 10); // openTime UTC → YYYY-MM-DD
  const close = parseFloat(k[4]);
  return { iso, close };
}

// ---- BRK: mapa campo Carmon -> id de serie BRK ----
// CONFIRMADOS por búsqueda: sth_nupl, lth_nupl, sth_sopr, lth_sopr, sopr, puell_multiple.
// POR VERIFICAR en 1ª ejecución (el log lo dirá): realized price por cohorte y mvrv z-score.
const BRK_MAP = {
  nuplSTH: "sth_nupl",
  nuplLTH: "lth_nupl",
  sthSopr: "sth_sopr",
  lthSopr: "lth_sopr",
  asopr:   "sopr",
  puell:   "puell_multiple",
  rpSTH:   "sth_realized_price",   // por verificar
  rpLTH:   "lth_realized_price",   // por verificar
  mvrvZ:   "mvrv_zscore",          // por verificar (probar tb: mvrv_z_score)
};
const BRK_BASE = "https://bitview.space/api/series";

async function brkLatest(id) {
  const j = await jget(`${BRK_BASE}/${id}/day1/latest`);
  // respuesta "unwrapped": puede ser número, [valor] o {date,value}
  if (typeof j === "number") return j;
  if (Array.isArray(j)) return Number(j[j.length - 1]);
  if (j && typeof j === "object") return Number(j.value ?? j.v ?? Object.values(j).pop());
  return null;
}

// CDD como oscilador = vocdd_hoy / media(vocdd, 365d)
async function brkCddOsc() {
  const j = await jget(`${BRK_BASE}/vocdd/day1?limit=365&format=json`);
  const vals = (Array.isArray(j) ? j : (j.values || j.data || []))
    .map((x) => (typeof x === "number" ? x : Number(x.value ?? x.v))).filter((n) => !isNaN(n));
  if (vals.length < 30) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg ? +(vals[vals.length - 1] / avg).toFixed(3) : null;
}

async function main() {
  const log = { fresco: [], forwardFill: [] };

  // --- BTC ---
  const btc = await loadReal("btc_real.js", "BTC");
  const pB = await priceToday("BTCUSDT");
  const pricesB = btc.price.slice(); const datesB = btc.dates.slice();
  if (datesB[datesB.length - 1] === pB.iso) { pricesB[pricesB.length - 1] = pB.close; }
  else { pricesB.push(pB.close); datesB.push(pB.iso); }
  const techB = technicalsFor(pricesB, datesB);
  const valuesB = { price: +pB.close.toFixed(2), ...techB };
  Object.keys(techB).forEach((f) => log.fresco.push("BTC." + f));
  log.fresco.push("BTC.price");

  // on-chain BTC (BRK)
  for (const [field, id] of Object.entries(BRK_MAP)) {
    try {
      const v = await brkLatest(id);
      if (v != null && !isNaN(v)) { valuesB[field] = v; log.fresco.push(`BTC.${field} (${id})`); }
      else throw new Error("vacío");
    } catch (e) { log.forwardFill.push(`BTC.${field} (${id}) · ${e.message}`); }
  }
  try {
    const cdd = await brkCddOsc();
    if (cdd != null) { valuesB.cdd = cdd; log.fresco.push("BTC.cdd (vocdd)"); }
    else log.forwardFill.push("BTC.cdd (vocdd) · vacío");
  } catch (e) { log.forwardFill.push("BTC.cdd · " + e.message); }

  // --- ETH (solo precio + técnicos; on-chain se queda como está) ---
  const eth = await loadReal("eth_real.js", "ETH");
  const pE = await priceToday("ETHUSDT");
  const pricesE = eth.price.slice(); const datesE = eth.dates.slice();
  if (datesE[datesE.length - 1] === pE.iso) { pricesE[pricesE.length - 1] = pE.close; }
  else { pricesE.push(pE.close); datesE.push(pE.iso); }
  const techE = technicalsFor(pricesE, datesE);
  const valuesE = { price: +pE.close.toFixed(2), ...techE };

  const out = {
    BTC: { iso: pB.iso, values: valuesB },
    ETH: { iso: pE.iso, values: valuesE },
  };
  await writeFile(new URL("datos-hoy.json", import.meta.url), JSON.stringify(out, null, 2));

  console.log("=== RESUMEN fetch-datos ===");
  console.log("Fecha BTC:", pB.iso, "precio:", pB.close, "| ETH:", pE.iso, pE.close);
  console.log("Frescos:", log.fresco.length, "→", log.fresco.join(", "));
  console.log("Forward-fill (ajustar ID si aparece):", log.forwardFill.length);
  log.forwardFill.forEach((x) => console.log("   ⚠ " + x));
  console.log("OK · datos-hoy.json escrito");
}

main().catch((e) => { console.error("ERROR fetch-datos:", e); process.exit(1); });
