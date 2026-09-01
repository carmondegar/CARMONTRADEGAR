#!/usr/bin/env node
/* Carmon Tradegar · build.mjs (layout PLANO: todo en la raíz del repo)
   Reconstruye index.html autocontenido, con pestañas Panel / Escáner MAGO.
   Uso: node build.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(join(ROOT, p), "utf8");
const escScript = (s) => s.replace(/<\/script/g, "<\\/script");
const escStyle = (s) => s.replace(/<\/style/g, "<\\/style");

const cssFiles = ["styles.css", "stylePro.css", "mago-tab.css"];
const libs = ["react.production.min.js", "react-dom.production.min.js", "babel.min.js"];
const plainJs = ["data.js", "engine.js", "glossary.js", "btc_real.js", "eth_real.js", "history.js", "cycle.js", "extras.js", "live.js"];
const babelJs = [
  "tweaks-panel.jsx", "components.jsx", "charts2.jsx", "sectionsCore.jsx", "sectionsMore.jsx",
  "sectionsHist.jsx", "sectionsCycle.jsx", "sectionsBlog.jsx", "sectionsMarket.jsx",
  "sectionsOnchainHeat.jsx", "sectionsCartera.jsx", "sectionsDecision.jsx", "sectionsReport.jsx",
  "sectionsGuia.jsx", "chartsS.jsx", "dcaS.jsx", "appPro.jsx",
];

// Barra de pestañas + contenedor del escáner (marcado aislado, ver mago-tab.css / mago-tab.js)
const TABBAR = '<div id="carmon-tabbar"><button id="tab-panel" class="active">Panel</button><button id="tab-scan">Escáner MAGO</button></div>';
const SCANNER = [
  '<div id="mago-scanner" hidden>',
  '  <div class="wrap">',
  '    <header>',
  '      <div class="logo"><svg width="22" height="22" viewBox="0 0 32 32" fill="none"><path d="M13 8v16M19 8v16" stroke="#EDE7D2" stroke-width="2.4" stroke-linecap="round"/><path d="M13 13h6M13 18h6" stroke="#EAD98A" stroke-width="2.4" stroke-linecap="round"/></svg></div>',
  '      <div class="brand">TABLA MAGO<span class="badge">Escáner</span></div>',
  '    </header>',
  '    <div class="sub">Confluencia multi-TF · S · D · 4H · 1H · datos Binance (gratis)</div>',
  '    <div class="bar">',
  '      <button class="btn" id="mago-scan">Escanear ahora</button>',
  '      <span class="status" id="mago-status">Abriendo el escáner… (se carga al entrar y se actualiza cada hora)</span>',
  '      <span class="legend">Veredicto: <b>LONG</b> · <span class="s">SHORT</span> · <span class="w">ESPERAR</span> · marco dorado = canta</span>',
  '    </div>',
  '    <div id="mago-list"></div>',
  '  </div>',
  '</div>',
].join("\n");
const TABLOGIC = [
  '<script>',
  '(function(){',
  '  var panel=document.getElementById("root"), scan=document.getElementById("mago-scanner");',
  '  var bP=document.getElementById("tab-panel"), bS=document.getElementById("tab-scan");',
  '  function show(which){',
  '    var s=which==="scan";',
  '    scan.hidden=!s; panel.hidden=s;',
  '    bS.classList.toggle("active",s); bP.classList.toggle("active",!s);',
  '    if(s && window.__magoInit) window.__magoInit();',
  '    try{ history.replaceState(null,"", s?"#escaner":"#panel"); }catch(e){}',
  '    window.scrollTo(0,0);',
  '  }',
  '  bP.addEventListener("click",function(){show("panel");});',
  '  bS.addEventListener("click",function(){show("scan");});',
  '  show(location.hash==="#escaner"?"scan":"panel");',
  '})();',
  '</script>',
].join("\n");

const head = [
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '<title>Carmon Tradegar · Decisión de capital</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">',
  ...cssFiles.map((c) => "<style>\n" + escStyle(R(c)) + "\n</style>"),
];
const body = [
  TABBAR,
  '<div id="root"></div>',
  SCANNER,
  ...libs.map((l) => "<script>\n" + escScript(R(l)) + "\n</script>"),
  ...plainJs.map((p) => "<script>\n" + escScript(R(p)) + "\n</script>"),
  ...babelJs.map((p) => '<script type="text/babel">\n' + escScript(R(p)) + "\n</script>"),
  "<script>\n" + escScript(R("mago-tab.js")) + "\n</script>",
  TABLOGIC,
];
const html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n' + head.join("\n") + "\n</head>\n<body>\n" + body.join("\n") + "\n</body>\n</html>\n";
writeFileSync(join(ROOT, "index.html"), html);
console.log(`OK · index.html reconstruido (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB)`);
