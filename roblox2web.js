#!/usr/bin/env node
'use strict';
// roblox2web 2.2 CLI (node): Rojo project / .rbxlx archive -> static web site running the real (transpiled) Luau code
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const P = require('./rbx/project');
const { buildSite } = require('./rbx/site');
const { reportText, VERSION } = require('./rbx/convert');
const bundler = require('./tools/bundle');

function readJSZip() { try { return require('jszip'); } catch (e) { /* */ } const f = path.join(__dirname, 'vendor', 'jszip.min.js'); const m = { exports: {} }; new Function('module', 'exports', 'window', 'self', fs.readFileSync(f, 'utf8'))(m, m.exports, undefined, undefined); return m.exports; }
async function readArchive(file) {
  const st = fs.existsSync(file) && fs.statSync(file);
  if (!st) throw new P.ConvertError('missing', `Файл не найден: ${file}`);
  if (st.isDirectory()) {
    const out = []; const skip = new Set(['.git', 'node_modules', 'tools_dl', 'dist', 'docs']);
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) { if (!skip.has(f)) walk(p); } else out.push([path.relative(file, p).replace(/\\/g, '/'), fs.readFileSync(p)]); } };
    walk(file); return P.normalizeFiles(out);
  }
  const buf = fs.readFileSync(file);
  if (buf.length === 0) throw new P.ConvertError('empty', 'Архив пустой (0 байт).');
  const name = file.toLowerCase();
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    let zip; try { zip = await readJSZip().loadAsync(buf); } catch (e) { throw new P.ConvertError('broken', 'Архив повреждён: ' + e.message); }
    const out = []; for (const n of Object.keys(zip.files)) { const f = zip.files[n]; if (!f.dir) out.push([n, new Uint8Array(await f.async('uint8array'))]); }
    return P.normalizeFiles(out);
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    let raw; try { raw = zlib.gunzipSync(buf); } catch (e) { throw new P.ConvertError('broken', 'Архив повреждён (gzip): ' + e.message); }
    return P.normalizeFiles(P.parseTar(new Uint8Array(raw)));
  }
  if (name.endsWith('.rbxlx')) return P.normalizeFiles([[path.basename(file), new Uint8Array(buf)]]);
  if (name.endsWith('.rbxl')) throw new P.ConvertError('binary_rbxl', 'Бинарный .rbxl не поддерживается — сохраните как .rbxlx.');
  if (buf.length > 262 && buf.slice(257, 262).toString() === 'ustar') return P.normalizeFiles(P.parseTar(new Uint8Array(buf)));
  throw new P.ConvertError('unknown', 'Неизвестный формат: ожидается .zip, .tar.gz/.tgz, .rbxlx или каталог.');
}
function assetsFor(root) {
  const a = {};
  const b = bundler.bundle(path.join(root, 'rbx/boot.js'));
  a['runtime.js'] = `/* roblox2web ${VERSION} runtime (MIT) */\n` + b;
  a['vendor/three.min.js'] = fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8');
  a['vendor/LICENSE-three.txt'] = fs.readFileSync(path.join(root, 'vendor/LICENSE-three.txt'), 'utf8');
  return a;
}
function writeFiles(dir, files) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(files)) { const p = path.join(dir, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, v); }
}
async function zipFiles(files, outFile) {
  const JSZip = readJSZip(); const z = new JSZip();
  for (const [k, v] of Object.entries(files)) z.file(k, v);
  fs.writeFileSync(outFile, await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
async function main(argv) {
  const args = { out: 'out', zip: null }; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--zip') args.zip = argv[++i];
    else if (a === '--strict') args.strict = true;
    else if (a === '--version') { console.log('roblox2web ' + VERSION); return 0; }
    else if (a === '-h' || a === '--help') { console.log('usage: roblox2web.js <project.zip|.tar.gz|.rbxlx|dir> [-o out] [--zip file.zip] [--strict]'); return 0; }
    else pos.push(a);
  }
  if (!pos.length) { console.error('usage: roblox2web.js <project.zip|.tar.gz|.rbxlx|dir> [-o out] [--zip file.zip]'); return 2; }
  let files, prj;
  try { files = await readArchive(pos[0]); prj = P.loadProject(files); }
  catch (e) { if (e instanceof P.ConvertError) { console.error('Ошибка: ' + e.userMessage); return 2; } throw e; }
  const { files: site, result } = buildSite(prj, assetsFor(__dirname));
  const rep = result.report;
  if (!prj.scripts().length) { console.error('Ошибка: в проекте не найдено ни одного скрипта.'); return 2; }
  if (rep.scripts.failed.length === rep.scripts.total) { console.error('Ошибка: ни один скрипт не удалось транспилировать.'); for (const f of rep.scripts.failed) console.error('  ' + f.path + ': ' + f.error); return 2; }
  writeFiles(args.out, site);
  if (args.zip) await zipFiles(site, args.zip);
  console.log(reportText(rep));
  console.log(`\nГотово: ${path.resolve(args.out)}${args.zip ? ' и ' + path.resolve(args.zip) : ''}`);
  const bad = rep.globals.unsupported.length + rep.instanceClasses.unsupported.length + rep.services.unsupported.length + rep.libraryFunctions.unsupported.length;
  if (rep.scripts.failed.length) return 3;
  return 0;
}
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e && e.stack || e); process.exit(2); });
module.exports = { readArchive, assetsFor, writeFiles, zipFiles, main };
