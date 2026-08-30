#!/usr/bin/env node
/* =====================================================================
   Carmon Tradegar · build.mjs
   Reconstruye el index.html autocontenido a partir de:
     - vendor/  (React, ReactDOM, Babel incrustados)
     - src/     (código de la app: JS plano + JSX + CSS)
   Uso:  node build.mjs
   Salida: ./index.html  (listo para GitHub Pages)
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(join(ROOT, p), "utf8");

// evita cierres de etiqueta dentro de <script>/<style>
const escScript = (s) => s.replace(/<\/script/g, "<\\/script");
const escStyle  = (s) => s.replace(/<\/style/g, "<\\/style");

// --- CSS (orden del index original) ---
const cssFiles = ["src/app/styles.css", "src/pro/stylePro.css"];

// --- Librerías incrustadas (versiones fijas vendorizadas) ---
const libs = [
  "vendor/react.production.min.js",
  "vendor/react-dom.production.min.js",
  "vendor/babel.min.js",
];

// --- JS plano (orden importa) ---
const plainJs = [
  "src/app/data.js", "src/app/engine.js", "src/app/glossary.js",
  "src/app/btc_real.js", "src/app/eth_real.js", "src/app/history.js",
  "src/app/cycle.js", "src/app/extras.js", "src/app/live.js",
];

// --- JSX (type=text/babel, orden importa) ---
const babelJs = [
  "src/app/tweaks-panel.jsx", "src/app/components.jsx", "src/app/charts2.jsx",
  "src/app/sectionsCore.jsx", "src/app/sectionsMore.jsx", "src/app/sectionsHist.jsx",
  "src/app/sectionsCycle.jsx", "src/app/sectionsBlog.jsx", "src/app/sectionsMarket.jsx",
  "src/app/sectionsOnchainHeat.jsx", "src/app/sectionsCartera.jsx", "src/app/sectionsDecision.jsx",
  "src/app/sectionsReport.jsx", "src/app/sectionsGuia.jsx",
  "src/sbambu/chartsS.jsx", "src/sbambu/dcaS.jsx", "src/pro/appPro.jsx",
];

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
  '<div id="root"></div>',
  ...libs.map((l) => "<script>\n" + escScript(R(l)) + "\n</script>"),
  ...plainJs.map((p) => "<script>\n" + escScript(R(p)) + "\n</script>"),
  ...babelJs.map((p) => '<script type="text/babel">\n' + escScript(R(p)) + "\n</script>"),
];

const html =
  "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n" +
  head.join("\n") +
  "\n</head>\n<body>\n" +
  body.join("\n") +
  "\n</body>\n</html>\n";

writeFileSync(join(ROOT, "index.html"), html);
const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`OK · index.html reconstruido (${mb} MB)`);
