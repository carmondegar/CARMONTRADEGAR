// ============================================================
// Carmon Tradegar · build-datos.mjs
// Lee datos-hoy.json y AÑADE (o actualiza) la fila de hoy en
// ../src/app/btc_real.js y ../src/app/eth_real.js. Además fija
// window.BambuDataDate en ../src/app/history.js.  Node 18+.
// Uso:  node build-datos.mjs
// ============================================================
import { readFile, writeFile } from "node:fs/promises";

const APP = new URL("../src/app/", import.meta.url);
const fp = (n) => new URL(n, APP);

const hoy = JSON.parse(await readFile(new URL("datos-hoy.json", import.meta.url), "utf8"));

async function loadReal(file, type) {
  const src = await readFile(fp(file), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const R = sandbox.window.BambuRealData[type];
  return { FIELDS: R.fields, DATES: R.dates.slice(), COLS: R.cols };
}

function serialize(type, FIELDS, DATES, COLS, headerDate) {
  const arr = (a) => "[" + a.map((x) => (x === null || x === undefined ? "null" : x)).join(",") + "]";
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
  if (!day) { console.warn(`Sin datos para ${type}, se omite`); continue; }
  const { FIELDS, DATES, COLS } = await loadReal(file, type);

  if (DATES[DATES.length - 1] === day.iso) {
    FIELDS.forEach((f) => { if (day.values[f] != null) COLS[f][COLS[f].length - 1] = day.values[f]; });
    console.log(`${type}: fila de ${day.iso} actualizada`);
  } else {
    DATES.push(day.iso);
    FIELDS.forEach((f) => {
      const prev = COLS[f][COLS[f].length - 1];
      COLS[f].push(day.values[f] != null ? day.values[f] : prev); // forward-fill si falta
    });
    console.log(`${type}: fila de ${day.iso} añadida (${DATES.length} días)`);
  }
  lastIso = day.iso;
  await writeFile(fp(file), serialize(type, FIELDS, DATES, COLS, day.iso));
}

if (lastIso) {
  const hist = await readFile(fp("history.js"), "utf8");
  const patched = hist.replace(/window\.BambuDataDate\s*=\s*"[^"]*"/, `window.BambuDataDate = "${lastIso}"`);
  await writeFile(fp("history.js"), patched);
  console.log(`history.js: BambuDataDate = ${lastIso}`);
}
console.log("OK · datos actualizados");
