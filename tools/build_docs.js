'use strict';
// Builds docs/ (online converter for GitHub Pages) and examples/*.zip
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const bundler = require('./bundle');
const JSZip = (() => { const m = { exports: {} }; new Function('module', 'exports', 'window', 'self', fs.readFileSync(path.join(root, 'vendor/jszip.min.js'), 'utf8'))(m, m.exports, undefined, undefined); return m.exports; })();
async function zipDir(dir, out, include) {
  const z = new JSZip();
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); const rel = path.relative(dir, p).replace(/\\/g, '/'); if (fs.statSync(p).isDirectory()) { if (!['.git', 'node_modules', 'tools_dl', 'dist', 'docs', 'build', 'out', '__pycache__'].includes(f)) walk(p); } else if (!include || include(rel)) z.file(rel, fs.readFileSync(p), { date: new Date(Date.UTC(2026, 9, 5)) }); } };
  walk(dir);
  fs.writeFileSync(out, await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
(async () => {
  const ex = path.join(root, 'examples');
  for (const n of ['obby', 'tycoon', 'guiapp']) await zipDir(path.join(ex, n), path.join(ex, n + '.zip'));
  const gameDir = process.env.GAME_DIR || '/workspace/roblox-game';
  if (fs.existsSync(gameDir)) await zipDir(gameDir, path.join(ex, 'PetCollectorSimulator.zip'), (r) => /^(src\/|default\.project\.json$|roblox2web\.config\.json$|README|assets\/icon_512\.png$)/.test(r));
  const D = path.join(root, 'docs');
  fs.rmSync(D, { recursive: true, force: true });
  fs.mkdirSync(path.join(D, 'vendor'), { recursive: true }); fs.mkdirSync(path.join(D, 'sample'), { recursive: true });
  for (const f of ['index.html', 'app.js', 'app.css']) fs.copyFileSync(path.join(root, 'web', f), path.join(D, f));
  bundler.build(D);
  fs.copyFileSync(path.join(root, 'vendor/three.min.js'), path.join(D, 'vendor/three.min.js'));
  fs.copyFileSync(path.join(root, 'vendor/LICENSE-three.txt'), path.join(D, 'vendor/LICENSE-three.txt'));
  fs.copyFileSync(path.join(root, 'vendor/jszip.min.js'), path.join(D, 'vendor/jszip.min.js'));
  for (const n of ['obby', 'tycoon', 'guiapp', 'PetCollectorSimulator']) if (fs.existsSync(path.join(ex, n + '.zip'))) fs.copyFileSync(path.join(ex, n + '.zip'), path.join(D, 'sample', n + '.zip'));
  fs.writeFileSync(path.join(D, '.nojekyll'), '');
  console.log('docs built');
})();
