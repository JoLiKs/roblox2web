// usage: node run.js file.lua  (runs a Luau file via the transpiler, plain Luau libs)
'use strict';
const fs = require('fs');
const { Runtime, makeGlobals } = require('./runtime');
const f = process.argv[2];
const rt = new Runtime();
const G = makeGlobals(rt);
let errored = false;
rt.onThreadError = (msg) => { process.stderr.write(msg + '\n'); errored = true; };
const fn = rt.compileChunk(fs.readFileSync(f, 'utf8'), f.replace(/\.lua$/, ''), G);
rt.spawn(fn, [undefined], null);
rt.runUntilIdle(10);
process.exit(errored ? 1 : 0);
