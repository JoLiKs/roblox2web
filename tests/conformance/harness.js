'use strict';
// Differential conformance runner: transpiler (node) vs recorded real-Luau output.
//   node harness.js            -> compare against *.expected
//   node harness.js --record   -> (re)record *.expected using the real `luau` binary
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { Runtime, makeGlobals } = require('../../lua2js/runtime');
const DIR = __dirname;
const LUAU = process.env.LUAU || path.join('/workspace/roblox-game/tools_dl/luau');
const record = process.argv.includes('--record');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function runTranspiled(file) {
  let out = '';
  const rt = new Runtime({ out: (s) => { out += s + '\n'; } });
  const G = makeGlobals(rt);
  rt.onThreadError = (msg) => { out += '[ERROR] ' + msg + '\n'; };
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  let fn;
  try { fn = rt.compileChunk(src, './' + file, G); } catch (e) { return '[ERROR] ' + e.message + '\n'; }
  rt.spawn(fn, [undefined], null);
  rt.runUntilIdle(100);
  return out;
}
function runLuau(file) {
  const r = cp.spawnSync(LUAU, [file], { cwd: DIR, encoding: 'latin1' });
  let out = r.stdout;
  if (r.stderr) out += '[ERROR] ' + r.stderr.replace(/\n$/, '').replace(/^[^]*?(\.\/)/, '$1').split('\n')[0] + '\n';
  return out;
}
let pass = 0, fail = 0, cases = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.lua')).sort()) {
  if (only.length && !only.some((o) => f.includes(o))) continue;
  const expFile = path.join(DIR, f.replace(/\.lua$/, '.expected'));
  if (record) fs.writeFileSync(expFile, runLuau(f), 'latin1');
  const expected = fs.readFileSync(expFile, 'latin1');
  let actual;
  try { actual = Buffer.from(runTranspiled(f), 'latin1').toString('latin1'); } catch (e) { actual = 'CRASH: ' + e.stack; }
  const n = (fs.readFileSync(path.join(DIR, f), 'utf8').match(/^T\(/gm) || []).length;
  cases += n;
  if (actual === expected) { pass++; console.log('ok   ' + f + ' (' + n + ' cases)'); }
  else {
    fail++; console.log('FAIL ' + f);
    const a = actual.split('\n'), e = expected.split('\n');
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, e.length) && shown < 60; i++) if (a[i] !== e[i]) { console.log(`  line ${i + 1}\n    expected: ${JSON.stringify(e[i])}\n    actual:   ${JSON.stringify(a[i])}`); shown++; }
  }
}
console.log(`\n${pass} files passed, ${fail} failed, ${cases} cases`);
process.exit(fail ? 1 : 0);
