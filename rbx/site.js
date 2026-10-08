'use strict';
// Builds the static site file map {path: string|Uint8Array}. Works in node and in the browser.
const { convertProject, bundleJs, reportText, VERSION } = require('./convert');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function indexHtml(title, opts) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${esc(title)}</title>
<meta name="generator" content="roblox2web ${VERSION}">
<link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#111;overflow:hidden}button{font-family:inherit}</style>
</head><body>
<div id="r2w-root"></div>
<noscript>Нужен JavaScript и WebGL.</noscript>
<script src="vendor/three.min.js"></script>
<script src="runtime.js"></script>
<script src="game.bundle.js"></script>
</body></html>
`;
}
function buildSite(prj, assets, opts) {
  opts = opts || {};
  const result = convertProject(prj);
  const meta = { generator: 'roblox2web ' + VERSION, built: opts.built || undefined };
  const files = {};
  files['index.html'] = indexHtml(prj.name);
  files['game.bundle.js'] = bundleJs(result, prj, meta);
  files['CONVERSION_REPORT.txt'] = reportText(result.report) + '\n';
  files['conversion_report.json'] = JSON.stringify(result.report, null, 2) + '\n';
  files['.nojekyll'] = '';
  files['README.txt'] = `Веб-версия «${prj.name}», собранная roblox2web ${VERSION}.\n\nLuau-скрипты игры транспилированы в JavaScript (game.bundle.js) и выполняются в браузерном эмуляторе Roblox (runtime.js, three.js в vendor/).\nЗапуск: любой статический сервер, например  python3 -m http.server  и открыть http://localhost:8000/ (файл по file:// тоже обычно работает).\nПодробности и список неподдержанных API: CONVERSION_REPORT.txt.\n`;
  for (const k of Object.keys(prj.assetFiles || {})) files[k] = prj.assetFiles[k]; // картинки из "assets" конфига
  for (const k of Object.keys(assets || {})) files[k] = assets[k];
  return { files, result };
}
module.exports = { buildSite, indexHtml };
