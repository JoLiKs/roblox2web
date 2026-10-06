'use strict';
// Bundles lua2js/ + rbx/ into browser scripts using a tiny CommonJS wrapper.
//   runtime.js   — game runtime (entry: rbx/boot.js, defines window.R2W)
//   converter.js — converter (entry: rbx/convert.js + project.js, defines window.R2WConv)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function collect(entry) {
  const mods = new Map();
  const visit = (file) => {
    file = path.resolve(file); if (mods.has(file)) return;
    const src = fs.readFileSync(file, 'utf8'); mods.set(file, src);
    const re = /require\('(\.[^']+)'\)/g; let m;
    while ((m = re.exec(src))) { let p = path.resolve(path.dirname(file), m[1]); if (!p.endsWith('.js')) p += '.js'; if (fs.existsSync(p)) visit(p); }
  };
  visit(entry); return mods;
}
function bundle(entry, post) {
  const mods = collect(entry); const out = [];
  out.push('(function(){var defs={},cache={};function req(id){if(cache[id])return cache[id].exports;var m=cache[id]={exports:{}};defs[id](m,m.exports,function(p){return req(res(id,p));});return m.exports;}');
  out.push("function res(from,p){var parts=from.split('/');parts.pop();p.split('/').forEach(function(s){if(s==='.'||s==='')return;if(s==='..')parts.pop();else parts.push(s);});var r=parts.join('/');if(!/\\.js$/.test(r))r+='.js';return r;}");
  for (const [file, src] of mods) {
    const id = path.relative(root, file).replace(/\\/g, '/');
    out.push(`defs[${JSON.stringify(id)}]=function(module,exports,require){${src}\n};`);
  }
  out.push(`var entry=req(${JSON.stringify(path.relative(root, path.resolve(entry)).replace(/\\/g, '/'))});${post || ''}})();`);
  return out.join('\n');
}
function build(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const rt = bundle(path.join(root, 'rbx/boot.js'));
  const cv = bundle(path.join(root, 'rbx/site.js'), 'window.R2WConv={site:entry,convert:req("rbx/convert.js"),project:req("rbx/project.js")};');
  const hdr = (n) => `/* roblox2web 2.2 ${n} — bundled from lua2js/ and rbx/ (MIT) */\n`;
  fs.writeFileSync(path.join(outDir, 'runtime.js'), hdr('runtime') + rt);
  fs.writeFileSync(path.join(outDir, 'converter.js'), hdr('converter') + cv);
  return { runtime: rt.length, converter: cv.length };
}
module.exports = { build, bundle };
if (require.main === module) console.log(build(process.argv[2] || path.join(root, 'build')));
