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
  const { ENV, logs } = runProject(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v)])), { geo });
  ENV.simulate(+((/--\s*simulate:\s*(\d+)/.exec(src) || [])[1] || 5));
  let ok = 0, fail = 0, done = false;
  for (const l of logs) { const t = l.text; if (/^OK /.test(t)) ok++; else if (/^FAIL /.test(t)) { fail++; console.log('  ' + f + ': ' + t); } else if (/^DONE/.test(t)) done = true; else if (l.level === 'err' && !/EXPECTED/.test(t)) { fail++; console.log('  ' + f + ' script error: ' + t); } }
  total += ok + fail; bad += fail + (done ? 0 : 1);
  console.log(`${fail || !done ? 'FAIL' : 'ok  '} ${f}: ${ok} ok, ${fail} failed${done ? '' : ' (no DONE)'}`);
}
(async () => {
  const g = await require('./geo_cases')(); // geo.js unit tests (fetch chain, timeouts, parsing) with a fake fetch
  total += g.ok + g.fail; bad += g.fail;
  console.log(`${g.fail ? 'FAIL' : 'ok  '} geo_cases.js: ${g.ok} ok, ${g.fail} failed`);
  console.log(`${total} checks, ${bad} problems`);
  process.exit(bad ? 1 : 0);
})();
