'use strict';
// Собирает dist/roblox2web-<версия>.zip (без .git, dist, __pycache__).
const fs = require('fs'), path = require('path');
const JSZip = require('../vendor/jszip.min.js');
const { VERSION } = require('../rbx/convert');
const root = path.join(__dirname, '..');
const skip = new Set(['.git', 'dist', '__pycache__', 'node_modules', 'build']);
const z = new JSZip(); let n = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (skip.has(f) || f.endsWith('.pyc')) continue;
    const p = path.join(d, f), st = fs.statSync(p);
    if (st.isDirectory()) walk(p); else { z.file('roblox2web/' + path.relative(root, p).split(path.sep).join('/'), fs.readFileSync(p)); n++; }
  }
})(root);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then((b) => { const out = path.join(root, 'dist', `roblox2web-${VERSION}.zip`); fs.writeFileSync(out, b); console.log(out, n, 'files', b.length, 'bytes'); });
