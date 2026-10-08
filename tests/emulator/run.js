'use strict';
// Emulator tests: each .lua in cases/ runs as a server Script (and optional *.client.lua as LocalScript).
// A script reports with print("OK name") / print("FAIL name: msg"); the file passes if all lines are OK and an "DONE" line appears.
const fs = require('fs'), path = require('path');
const { runProject } = require('../../rbx/headless');
const GEO = require('../../rbx/geo');
const dir = path.join(__dirname, 'cases');
let total = 0, bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.lua')).sort()) {
  const files = {
    'default.project.json': JSON.stringify({ name: 'T', tree: { $className: 'DataModel', Workspace: { $className: 'Workspace', $ignoreUnknownInstances: true }, ReplicatedStorage: { $className: 'ReplicatedStorage', $path: 'shared' }, ServerScriptService: { $className: 'ServerScriptService', $path: 'server' }, StarterGui: { $className: 'StarterGui', $path: 'gui' } } }),
    'shared/Shared.lua': 'return {answer = 42}',
  };
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const kind = f.includes('.client.') ? 'gui/Test.client.lua' : 'server/Test.server.lua';
  files[kind] = src;
  if (f.includes('.client.')) files['server/Srv.server.lua'] = fs.existsSync(path.join(dir, f.replace('.client.', '.srv.'))) ? fs.readFileSync(path.join(dir, f.replace('.client.', '.srv.')), 'utf8') : '';
  if (f.includes('.srv.')) continue;
  // -- geo: ?country=RU&lang=ru   -> browser-like geo object (geo.js) built from that query string, navigator.language = en-US
  const geoQ = (/--\s*geo:\s*(\S+)/.exec(src) || [])[1];
  let geo = null;
  if (geoQ) { geo = GEO.create({ search: geoQ, navigatorLanguage: (/--\s*navlang:\s*(\S+)/.exec(src) || [])[1] || 'en-US' }); geo.start(); }
  // -- attrs: Fast=3,Mode=bot   -> Workspace attributes as from ?attr.Fast=3&attr.Mode=bot
  const attrQ = (/--\s*attrs:\s*(\S+)/.exec(src) || [])[1];
  const attrs = attrQ ? Object.fromEntries(attrQ.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, isFinite(+v) ? +v : v]; })) : undefined;
  const { ENV, logs } = runProject(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v)])), { geo, attrs });
  const total_t = +((/--\s*simulate:\s*(\d+)/.exec(src) || [])[1] || 5);
  // -- input: 3=down,3.2=up,4=tdown,4.1=tup,5=gdown   -> world mouse/touch input at virtual times (g = over GUI, game processed)
  const inQ = (/--\s*input:\s*(\S+)/.exec(src) || [])[1];
  if (inQ) {
    let now = 0;
    for (const ev of inQ.split(',').map((kv) => kv.split('=')).sort((a, b) => a[0] - b[0])) {
      const t = +ev[0]; if (t > now) { ENV.simulate(t - now); now = t; }
      const k = ev[1], gpe = k[0] === 'g', kk = gpe ? k.slice(1) : k;
      if (kk === 'down' || kk === 'up') ENV.input.mouseButton(0, kk === 'down', 100, 100, gpe);
      else if (kk === 'tdown' || kk === 'tup') ENV.input.touch(kk === 'tdown' ? 'Begin' : 'End', 100, 100, gpe);
    }
    if (total_t > now) ENV.simulate(total_t - now);
  } else ENV.simulate(total_t);
  let ok = 0, fail = 0, done = false;
  for (const l of logs) { const t = l.text; if (/^OK /.test(t)) ok++; else if (/^FAIL /.test(t)) { fail++; console.log('  ' + f + ': ' + t); } else if (/^DONE/.test(t)) done = true; else if (l.level === 'err' && !/EXPECTED/.test(t)) { fail++; console.log('  ' + f + ' script error: ' + t); } }
  total += ok + fail; bad += fail + (done ? 0 : 1);
  console.log(`${fail || !done ? 'FAIL' : 'ok  '} ${f}: ${ok} ok, ${fail} failed${done ? '' : ' (no DONE)'}`);
}
(async () => {
  const g = await require('./geo_cases')(); // geo.js unit tests (fetch chain, timeouts, parsing) with a fake fetch
  total += g.ok + g.fail; bad += g.fail;
  console.log(`${g.fail ? 'FAIL' : 'ok  '} geo_cases.js: ${g.ok} ok, ${g.fail} failed`);
  const a = require('./asset_cases')(); total += a.ok + a.fail; bad += a.fail;
  console.log(`${a.fail ? 'FAIL' : 'ok  '} asset_cases.js: ${a.ok} ok, ${a.fail} failed`);
  console.log(`${total} checks, ${bad} problems`);
  process.exit(bad ? 1 : 0);
})();
