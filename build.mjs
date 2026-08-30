#!/usr/bin/env node
/* Carmon Tradegar · build.mjs (layout PLANO: todo en la raíz del repo)
   Reconstruye index.html autocontenido.  Uso: node build.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(join(ROOT, p), "utf8");
const escScript = (s) => s.replace(/<\/script/g, "<\\/script");
const escStyle = (s) => s.replace(/<\/style/g, "<\\/style");

const cssFiles = ["styles.css", "stylePro.css"];
const libs = ["react.production.min.js", "react-dom.production.min.js", "babel.min.js"];
const plainJs = ["data.js", "engine.js", "glossary.js", "btc_real.js", "eth_real.js", "history.js", "cycle.js", "extras.js", "live.js"];
const babelJs = [
  "tweaks-panel.jsx", "components.jsx", "charts2.jsx", "sectionsCore.jsx", "sectionsMore.jsx",
  "sectionsHist.jsx", "sectionsCycle.jsx", "sectionsBlog.jsx", "sectionsMarket.jsx",
  "sectionsOnchainHeat.jsx", "sectionsCartera.jsx", "sectionsDecision.jsx", "sectionsReport.jsx",
  "sectionsGuia.jsx", "chartsS.jsx", "dcaS.jsx", "appPro.jsx",
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
const html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n' + head.join("\n") + "\n</head>\n<body>\n" + body.join("\n") + "\n</body>\n</html>\n";
writeFileSync(join(ROOT, "index.html"), html);
console.log(`OK · index.html reconstruido (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB)`);
