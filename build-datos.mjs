// Carmon Tradegar · build-datos.mjs (layout PLANO)
// Lee datos-hoy.json y añade/actualiza la fila de hoy en btc_real.js y eth_real.js,
// y fija window.BambuDataDate en history.js.  Uso: node build-datos.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const fp = (n) => join(ROOT, n);
const hoy = JSON.parse(readFileSync(fp("datos-hoy.json"), "utf8"));

function loadReal(file, type) {
  const sandbox = { window: {} };
  new Function("window", readFileSync(fp(file), "utf8"))(sandbox.window);
  const Rr = sandbox.window.BambuRealData[type];
  return { FIELDS: Rr.fields, DATES: Rr.dates.slice(), COLS: Rr.cols };
}
function serialize(type, FIELDS, DATES, COLS, headerDate) {
  const arr = (a) => "[" + a.map((x) => (x == null ? "null" : x)).join(",") + "]";
  const cols = FIELDS.map((f) => `${f}:${arr(COLS[f])}`).join(",");
  const dates = "[" + DATES.map((d) => `"${d}"`).join(",") + "]";
  return `/* Carmon Tradegar · Datos reales ${type} · ${headerDate} · ${DATES.length} días · build-datos.mjs */
(function () {
  "use strict";
  var FIELDS=${JSON.stringify(FIELDS)};var DATES=${dates};var COLS={${cols}};
  function rowAt(i){var v={};for(var f=0;f<FIELDS.length;f++){var c=COLS[FIELDS[f]][i];if(c!==null)v[FIELDS[f]]=c;}return v;}
  function labelEs(iso){var d=new Date(iso+"T00:00:00Z");return d.toLocaleDateString("es-ES",{day:"2-digit",month:"short",timeZone:"UTC"});}
  window.BambuRealData=window.BambuRealData||{};
  window.BambuRealData["${type}"]={type:"${type}",fields:FIELDS,dates:DATES,cols:COLS,count:DATES.length,rowAt:rowAt,labelEs:labelEs,iso:function(i){return DATES[i];},price:function(i){return COLS.price[i];},latest:rowAt(DATES.length-1),latestIso:DATES[DATES.length-1],lastDays:function(n){var r=[],s=Math.max(0,DATES.length-n);for(var i=s;i<DATES.length;i++)r.push({i:i,iso:DATES[i],label:labelEs(DATES[i]),values:rowAt(i)});return r;},indexOfIso:function(iso){return DATES.indexOf(iso);}};
})();
`;
}
let lastIso = null;
for (const [type, file] of [["BTC", "btc_real.js"], ["ETH", "eth_real.js"]]) {
  const day = hoy[type];
  if (!day) { console.warn(`Sin datos para ${type}`); continue; }
  const { FIELDS, DATES, COLS } = loadReal(file, type);
  if (DATES[DATES.length - 1] === day.iso) {
    FIELDS.forEach((f) => { if (day.values[f] != null) COLS[f][COLS[f].length - 1] = day.values[f]; });
    console.log(`${type}: fila ${day.iso} actualizada`);
  } else {
    DATES.push(day.iso);
    FIELDS.forEach((f) => { const prev = COLS[f][COLS[f].length - 1]; COLS[f].push(day.values[f] != null ? day.values[f] : prev); });
    console.log(`${type}: fila ${day.iso} añadida (${DATES.length} días)`);
  }
  lastIso = day.iso;
  writeFileSync(fp(file), serialize(type, FIELDS, DATES, COLS, day.iso));
}
if (lastIso) {
  const hist = readFileSync(fp("history.js"), "utf8");
  writeFileSync(fp("history.js"), hist.replace(/window\.BambuDataDate\s*=\s*"[^"]*"/, `window.BambuDataDate = "${lastIso}"`));
  console.log(`history.js: BambuDataDate = ${lastIso}`);
}
console.log("OK · datos actualizados");
