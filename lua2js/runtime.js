'use strict';
const C = require('./core');
const { LuaTable, LuaError, Userdata, rtError, tostr, numStr, first, toArr, E, ST, CO, Coroutine, SCHED } = C;
const LS = require('./lib_string');
const { compile } = require('./codegen');
const { utf8enc, utf8dec, cpToUtf8 } = require('./lexer');

const GenProto = Object.getPrototypeOf(function* () {});
const isGenFn = (f) => Object.getPrototypeOf(f) === GenProto;

/* ----- helpers used by generated code ----- */
const H = {
  E, ST, idx: C.idx, setidx: C.setidx, add: C.add, sub: C.sub, mul: C.mul, div: C.div, mod: C.mod, pow: C.pow, idiv: C.idiv, unm: C.unm,
  concat: C.concat, len: C.len, eq: C.eq, lt: C.lt, le: C.le,
  gt: (a, b) => C.lt(b, a), ge: (a, b) => C.le(b, a),
  nf: (f, desc) => (typeof f === 'function' ? f : C.toCallable(f, desc)),
  meth(o, name) {
    const f = C.idx(o, name);
    if (typeof f === 'function') return f;
    if (f === undefined) throw rtError(`attempt to call missing method '${name}' of ${C.tnameForErr(o)}`);
    return C.toCallable(f, null);
  },
  m: (r) => (r instanceof Array ? r : [r]),
  first: C.first,
  ts: tostr,
  ta(arr) { let n = arr.length; while (n > 0 && arr[n - 1] === undefined) n--; if (n !== arr.length) arr.length = n; return new LuaTable(arr); },
  tn: () => new LuaTable(),
  tkv(arr, kv) { const t = H.ta(arr); for (let i = 0; i < kv.length; i += 2) { if (kv[i] === undefined) throw rtError('table index is nil'); t.set(kv[i], kv[i + 1]); } return t; },
  fnum(v, what) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = C.str2num(v); if (n !== undefined) return n; }
    throw rtError(`invalid 'for' ${what} value (a ${C.tnameForErr(v)})`);
  },
  fstep(v) {
    if (typeof v !== 'number') { const n = typeof v === 'string' ? C.str2num(v) : undefined; if (n === undefined) throw rtError(`invalid 'for' step value (a ${C.tnameForErr(v)})`); v = n; }
    return v;
  },
  fp: forprep,
};

class TableIter {
  constructor(t) { this.t = t; this.i = 0; this.mi = null; this.k = undefined; this.v = undefined; this.r = null; this.fast = true; }
  step() {
    const t = this.t, a = t.arr;
    while (this.i < a.length) { const v = a[this.i++]; if (v !== undefined) { this.k = this.i; this.v = v; return true; } }
    if (this.mi === null) { if (t.hash === null) return false; this.mi = t.hash.entries(); }
    const r = this.mi.next();
    if (r.done) return false;
    this.k = r.value[0]; this.v = r.value[1]; return true;
  }
}
class IpairsIter {
  constructor(t) { this.t = t; this.i = 0; this.k = undefined; this.v = undefined; this.fast = true; }
  step() {
    const t = this.t;
    const i = ++this.i;
    const v = t.mt === null ? t.get(i) : C.idx(t, i);
    if (v === undefined) return false;
    this.k = i; this.v = v; return true;
  }
}
class GeneralIter {
  constructor(f, s, c) { this.f = f; this.s = s; this.c = c; this.k = undefined; this.v = undefined; this.r = E; this.fast = false; }
  * stepG() {
    const r = yield* this.f(this.s, this.c);
    if (r instanceof Array) { this.r = r; this.k = r[0]; this.v = r[1]; } else { this.r = [r]; this.k = r; this.v = undefined; }
    if (this.k === undefined) return false;
    this.c = this.k; return true;
  }
}
let nextFn, ipairsAux;
function forprep(a) {
  const f = a[0], s = a[1], c = a[2];
  if (f === nextFn && s instanceof LuaTable && c === undefined) return new TableIter(s);
  if (f === ipairsAux && s instanceof LuaTable && c === 0) return new IpairsIter(s);
  if (f instanceof LuaTable) {
    const mt = f.mt;
    const it = mt && mt.getStr('__iter');
    if (it !== undefined && it !== null) { const r = toArr(C.callSync(it, [f])); return new GeneralIter(C.toCallable(r[0]), r[1], r[2]); }
    if (!(mt && mt.getStr('__call') !== undefined)) return new TableIter(f);
  }
  if (typeof f !== 'function') {
    if (f instanceof Userdata && typeof f.lcall === 'function') return new GeneralIter(C.toCallable(f), s, c);
    if (f !== undefined && C.getmt(f) && C.getmt(f).getStr('__call') !== undefined) return new GeneralIter(C.toCallable(f), s, c);
    throw rtError(`attempt to iterate over a ${C.tnameForErr(f)} value`);
  }
  return new GeneralIter(f, s, c);
}

/* ----- natives ----- */
// run fn with runtime-op errors carrying no position (like errors raised inside C functions)
function np(fn) { return (...a) => { const sp = ST.p; ST.lp = sp; ST.p = 0; try { return fn(...a); } finally { ST.p = sp; } }; }
function nat(fn, name) { const g = function* (...a) { return fn(...a); }; g.$n = fn; g.$name = name; return g; }
const argErr = LS.argErr;
function checkTable(v, i, fname) { if (!(v instanceof LuaTable)) throw argErr(i, fname, `table expected, got ${C.tnameForErr(v)}`); return v; }
function checkNum(v, i, fname, def) {
  if (v === undefined && def !== undefined) return def;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = C.str2num(v); if (n !== undefined) return n; }
  throw argErr(i, fname, `number expected, got ${C.tnameForErr(v)}`);
}

class Runtime {
  constructor(opts) {
    opts = opts || {};
    this.out = opts.out || ((s) => { if (typeof process !== 'undefined' && process.stdout) process.stdout.write(Buffer.from(s + '\n', 'latin1')); else console.log(utf8dec(s)); });
    this.warnOut = opts.warn || ((s) => this.out(s));
    this.errOut = opts.err || ((s) => this.out(s));
    this.now = 0; this.realTime = opts.realTime !== undefined ? opts.realTime : null;
    this.sleepers = []; this.deferred = []; this.seq = 0; this.threadCount = 0;
    this.chunkCount = 0; this.compiled = new Map();
    this.H = H;
    this.rngState = 0x2545F491;
    this.onThreadError = null;
    this.coverage = { globals: new Map(), indexed: new Map() };
  }
  /* ----- compile & run ----- */
  compileChunk(source, chunkname, G) {
    const id = ++this.chunkCount;
    ST.chunks[id] = chunkname;
    const { code, globals, indexed } = compile(source, chunkname, id);
    for (const [k, v] of globals) this.coverage.globals.set(k, (this.coverage.globals.get(k) || 0) + v);
    for (const p of indexed) this.coverage.indexed.set(p, (this.coverage.indexed.get(p) || 0) + 1);
    const factory = (0, eval)(code);
    return factory(H, G);
  }
  /* ----- threads & scheduler ----- */
  newThread(fn, ctx) { return new Coroutine(fn, ctx); }
  resumeThread(co, args) {
    const r = C.resume(co, args);
    if (!r[0]) this.reportError(r[1], co);
    return r;
  }
  reportError(v, co) {
    const msg = typeof v === 'string' ? v : (v instanceof LuaTable || v instanceof Userdata ? tostr(v) : tostr(v));
    if (this.onThreadError) this.onThreadError(msg, co); else this.errOut(msg);
  }
  spawn(fn, args, ctx) {
    const co = new Coroutine(fn, ctx !== undefined ? ctx : (CO.current ? CO.current.ctx : null));
    this.resumeThread(co, args || []);
    return co;
  }
  defer(fn, args, ctx) {
    const co = typeof fn === 'object' && fn instanceof Coroutine ? fn : new Coroutine(fn, ctx !== undefined ? ctx : (CO.current ? CO.current.ctx : null));
    this.deferred.push({ co, args: args || [] });
    return co;
  }
  sleep(co, secs, args) {
    const e = { at: this.now + Math.max(0, secs), co, args: args || [secs], seq: this.seq++, dead: false };
    const a = this.sleepers;
    let lo = 0, hi = a.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid].at < e.at || (a[mid].at === e.at && a[mid].seq < e.seq)) lo = mid + 1; else hi = mid; }
    a.splice(lo, 0, e);
    co.sleepEntry = e;
    return e;
  }
  cancel(co) {
    if (co.sleepEntry) { co.sleepEntry.dead = true; }
    for (const d of this.deferred) if (d.co === co) d.dead = true;
    if (co.status === 'suspended' && co.gen) { try { co.gen.return(); } catch (e) { /* ignore */ } }
    co.status = 'dead';
  }
  runDeferred() {
    let guard = 0;
    while (this.deferred.length && guard++ < 100000) {
      const d = this.deferred.shift();
      if (!d.dead) this.resumeThread(d.co, d.args);
    }
  }
  // advance virtual time by dt and run everything that is due
  step(dt) {
    const start = this.now;
    this.now += dt;
    this.runDeferred();
    const a = this.sleepers;
    while (a.length && a[0].at <= this.now) {
      const e = a.shift();
      if (e.dead) continue;
      e.co.sleepEntry = null;
      const waited = this.now - (e.at - (e.args && e.args.waitArg !== undefined ? e.args.waitArg : 0));
      this.resumeThread(e.co, e.args.length ? e.args : [dt]);
      this.runDeferred();
    }
  }
  hasPending() { return this.sleepers.some((s) => !s.dead) || this.deferred.length > 0; }
  // run until idle or limit (for tests)
  runUntilIdle(maxTime, dt) {
    dt = dt || 1 / 30; maxTime = maxTime === undefined ? 3600 : maxTime;
    const end = this.now + maxTime;
    this.runDeferred();
    while (this.hasPending() && this.now < end) this.step(dt);
  }
  /* ----- random ----- */
  rand() { // mulberry32
    let t = (this.rngState += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/* ----- standard library ----- */
function makeGlobals(rt) {
  const G = new LuaTable();
  const def = (t, name, fn, opts) => { t.set(name, (opts && opts.gen) ? fn : nat(fn, name)); };
  const lib = (name) => { const t = new LuaTable(); G.set(name, t); return t; };
  G.set('_G', G); G.set('_VERSION', 'Luau');

  /* base */
  def(G, 'print', (...a) => { rt.out(a.map(tostr).join('\t')); return E; });
  def(G, 'warn', (...a) => { rt.warnOut(a.map(tostr).join(' ')); return E; });
  def(G, 'type', (...a) => { if (a.length === 0) throw argErr(1, 'type', 'value expected'); return C.type(a[0]); });
  def(G, 'typeof', (...a) => { if (a.length === 0) throw argErr(1, 'typeof', 'value expected'); return C.typeofx(a[0]); });
  def(G, 'tostring', (...a) => { if (a.length === 0) throw argErr(1, 'tostring', 'value expected'); return tostr(a[0]); });
  def(G, 'tonumber', (v, base) => {
    if (base === undefined) {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return C.str2num(v);
      return undefined;
    }
    base = checkNum(base, 2, 'tonumber');
    if (base < 2 || base > 36) throw argErr(2, 'tonumber', 'base out of range');
    if (typeof v !== 'string') throw argErr(1, 'tonumber', `string expected, got ${C.tnameForErr(v)}`);
    const s = v.trim().toLowerCase();
    let m = /^(-?)([0-9a-z]+)$/.exec(s);
    if (!m) return undefined;
    let r = 0;
    for (const ch of m[2]) { const d = parseInt(ch, 36); if (d >= base) return undefined; r = r * base + d; }
    return m[1] ? 18446744073709551616 - r : r;
  });
  def(G, 'rawget', (t, k) => checkTable(t, 1, 'rawget').get(k));
  def(G, 'rawset', (t, k, v) => { checkTable(t, 1, 'rawset').set(k, v); return t; });
  def(G, 'rawequal', (a, b) => a === b);
  def(G, 'rawlen', (t) => (typeof t === 'string' ? t.length : checkTable(t, 1, 'rawlen').arr.length));
  def(G, 'setmetatable', (t, mt) => {
    checkTable(t, 1, 'setmetatable');
    if (mt !== undefined && !(mt instanceof LuaTable)) throw argErr(2, 'setmetatable', 'nil or table expected');
    if (t.mt && t.mt.getStr('__metatable') !== undefined) throw rtError('cannot change a protected metatable');
    if (t.frozen) throw rtError('attempt to modify a readonly table');
    t.mt = mt === undefined ? null : mt; return t;
  });
  def(G, 'getmetatable', (v) => {
    const mt = C.getmt(v);
    if (!mt) return undefined;
    const p = mt.getStr('__metatable');
    return p !== undefined ? p : mt;
  });
  const next = (t, k) => { checkTable(t, 1, 'next'); const r = t.next(k); return r === null ? undefined : r; };
  def(G, 'next', next); nextFn = G.get('next');
  def(G, 'pairs', (t) => {
    if (t instanceof LuaTable) {
      const mt = t.mt;
      if (mt) { const p = mt.getStr('__pairs'); if (p !== undefined) { const r = toArr(C.callSync(p, [t])); return [r[0], r[1], r[2]]; } }
      return [nextFn, t, undefined];
    }
    if (t instanceof Userdata) return [nextFn, t, undefined];
    throw argErr(1, 'pairs', `table expected, got ${C.tnameForErr(t)}`);
  });
  const ipairsFn = nat((t, i) => { i++; const v = C.idx(t, i); return v === undefined ? undefined : [i, v]; }, 'ipairs_aux');
  ipairsAux = ipairsFn;
  def(G, 'ipairs', (t) => { if (t === undefined) throw argErr(1, 'ipairs', 'table expected, got nil'); return [ipairsFn, t, 0]; });
  def(G, 'select', (n, ...a) => {
    if (n === '#') return a.length;
    n = checkNum(n, 1, 'select'); n = Math.trunc(n);
    if (n < 0) { n = a.length + n; if (n < 0) throw argErr(1, 'select', 'index out of range'); return a.slice(n); }
    if (n === 0) throw argErr(1, 'select', 'index out of range');
    return a.slice(n - 1);
  });
  def(G, 'assert', (...a) => {
    if (a.length === 0) throw argErr(1, 'assert', 'value expected');
    if (a[0] === undefined || a[0] === false) { const m = a.length > 1 && a[1] !== undefined ? a[1] : 'assertion failed!'; if (typeof m === 'string' || typeof m === 'number') { const p = C.posString(); throw new LuaError(p ? p + ' ' + tostr(m) : tostr(m)); } throw argErr(2, 'assert', 'string expected, got ' + C.tnameForErr(m)); }
    return a;
  });
  def(G, 'error', (v, level) => {
    level = level === undefined ? 1 : level;
    if ((typeof v === 'string' || typeof v === 'number') && level > 0) { const p = C.posString(); v = (p ? p + ' ' : '') + tostr(v); }
    throw new LuaError(v);
  });
  def(G, 'pcall', function* (f, ...args) {
    if (f === undefined && arguments.length === 0) throw argErr(1, 'pcall', 'value expected');
    const sp = ST.p;
    try { if (typeof f !== 'function' || f.$n) { ST.p = 0; ST.lp = 0; } const r = yield* C.toCallable(f)(...args); return [true, ...toArr(r)]; }
    catch (e) { ST.p = sp; return [false, C.errValue(e)]; }
  }, { gen: true });
  def(G, 'xpcall', function* (f, h, ...args) {
    const sp = ST.p;
    try { if (typeof f !== 'function' || f.$n) { ST.p = 0; ST.lp = 0; } const r = yield* C.toCallable(f)(...args); return [true, ...toArr(r)]; }
    catch (e) {
      const ev = C.errValue(e); ST.p = sp;
      try { const hr = yield* C.toCallable(h)(ev); return [false, ...toArr(hr)]; } catch (e2) { return [false, C.errValue(e2)]; }
    }
  }, { gen: true });
  def(G, 'unpack', (t, i, j) => tableUnpack(t, i, j));
  def(G, 'collectgarbage', (opt) => (opt === 'count' ? 1024 : 0));
  def(G, 'newproxy', (addMeta) => { const p = new Proxy_(); if (addMeta) p.mt = new LuaTable(); return p; });
  def(G, 'loadstring', (src, name) => {
    if (typeof src !== 'string') throw argErr(1, 'loadstring', 'string expected');
    try { const f = rt.compileChunk(src, name || '=(loadstring)', G); return nat(null) && function* (...a) { return yield* f(undefined, ...a); }; }
    catch (e) { return [undefined, e && e.message]; }
  });

  /* string */
  const str = lib('string');
  for (const k of Object.keys(LS.S)) def(str, k, LS.S[k]);
  def(str, 'gsub', LS.gsub, { gen: true });
  def(str, 'gmatch', (s, p) => { const f = LS.gmatch(s, p); return f; }, { gen: false });
  {
    // gmatch returns a generator function already
    str.set('gmatch', nat((s, p) => LS.gmatch(s, p), 'gmatch'));
  }
  const smt = new LuaTable(); smt.set('__index', str); C.mtOfStr.current = smt;

  /* table */
  const tbl = lib('table');
  function tableUnpack(t, i, j) {
    checkTable(t, 1, 'unpack');
    i = i === undefined ? 1 : i; j = j === undefined ? t.arr.length : j;
    if (j - i >= 1e7) throw rtError('too many results to unpack');
    const out = []; for (let k = i; k <= j; k++) out.push(t.mt ? C.idx(t, k) : t.get(k));
    return out;
  }
  def(tbl, 'unpack', tableUnpack);
  def(tbl, 'pack', (...a) => { const t = H.ta(a.slice()); t.set('n', a.length); return t; });
  def(tbl, 'insert', np((...a) => {
    const t = checkTable(a[0], 1, 'insert');
    if (a.length === 2) { t.set(t.arr.length + 1, a[1]); return E; }
    if (a.length !== 3) throw C.lerr("wrong number of arguments to 'insert'");
    const n = t.arr.length, pos = checkNum(a[1], 2, 'insert');
    if (pos < 1 || pos > n + 1) { t.set(pos, a[2]); return E; }
    if (t.frozen) throw rtError('attempt to modify a readonly table');
    if (t.hash === null || !t.hash.size) { t.arr.splice(pos - 1, 0, a[2]); if (a[2] === undefined) { while (t.arr.length && t.arr[t.arr.length - 1] === undefined) t.arr.pop(); } }
    else { for (let i = n; i >= pos; i--) t.set(i + 1, t.get(i)); t.set(pos, a[2]); }
    return E;
  }));
  def(tbl, 'remove', (t, pos) => {
    checkTable(t, 1, 'remove');
    const n = t.arr.length;
    if (pos === undefined) { if (n === 0) return E; const v = t.arr[n - 1]; t.set(n, undefined); return v; }
    pos = checkNum(pos, 2, 'remove');
    if (n === 0 && (pos === 0 || pos === n)) return t.get(pos);
    if (n + 1 === pos) { const v = t.get(pos); t.set(pos, undefined); return v; }
    if (pos < 1 || pos > n + 1) throw argErr(2, 'remove', 'position out of bounds');
    if (t.frozen) throw rtError('attempt to modify a readonly table');
    const v = t.arr[pos - 1]; t.arr.splice(pos - 1, 1);
    while (t.arr.length && t.arr[t.arr.length - 1] === undefined) t.arr.pop();
    return v;
  });
  def(tbl, 'concat', (t, sep, i, j) => {
    checkTable(t, 1, 'concat'); sep = sep === undefined ? '' : LS.checkStr(sep, 2, 'concat');
    i = i === undefined ? 1 : i; j = j === undefined ? t.arr.length : j;
    const parts = [];
    for (let k = i; k <= j; k++) {
      const v = t.get(k);
      if (typeof v === 'string') parts.push(v); else if (typeof v === 'number') parts.push(numStr(v));
      else throw rtError(`invalid value (${C.tnameForErr(v)}) at index ${k} in table for 'concat'`);
    }
    return parts.join(sep);
  });
  def(tbl, 'sort', np((t, cmp) => {
    checkTable(t, 1, 'sort');
    if (t.frozen) throw rtError('attempt to modify a readonly table');
    const a = t.arr;
    for (let i = 0; i < a.length; i++) if (a[i] === undefined) throw rtError('invalid order function for sorting');
    let less;
    if (cmp === undefined) less = C.lt;
    else { if (typeof cmp !== 'function') throw argErr(2, 'sort', 'function expected'); less = (x, y) => C.truthy(first(C.callSync(cmp, [x, y]))); }
    a.sort((x, y) => (less(x, y) ? -1 : less(y, x) ? 1 : 0));
    return E;
  }));
  def(tbl, 'find', (t, v, init) => {
    checkTable(t, 1, 'find'); const n = t.arr.length;
    for (let i = (init === undefined ? 1 : init); i <= n; i++) if (C.eq(t.get(i), v)) return i;
    return undefined;
  });
  def(tbl, 'create', (n, v) => { const a = []; n = checkNum(n, 1, 'create'); for (let i = 0; i < n; i++) a.push(v); return new LuaTable(v === undefined ? [] : a); });
  def(tbl, 'clear', (t) => { checkTable(t, 1, 'clear'); if (t.frozen) throw rtError('attempt to modify a readonly table'); t.arr.length = 0; t.hash = null; return E; });
  def(tbl, 'clone', (t) => { checkTable(t, 1, 'clone'); const n = new LuaTable(t.arr.slice(), t.hash ? new Map(t.hash) : null); n.mt = t.mt; return n; });
  def(tbl, 'freeze', (t) => { checkTable(t, 1, 'freeze'); t.frozen = true; return t; });
  def(tbl, 'isfrozen', (t) => checkTable(t, 1, 'isfrozen').frozen);
  def(tbl, 'move', (a1, f, e, t, a2) => {
    checkTable(a1, 1, 'move'); a2 = a2 === undefined ? a1 : a2;
    if (e >= f) {
      if (t > e || t <= f || a1 !== a2) for (let i = 0; i <= e - f; i++) a2.set(t + i, a1.get(f + i));
      else for (let i = e - f; i >= 0; i--) a2.set(t + i, a1.get(f + i));
    }
    return a2;
  });
  def(tbl, 'getn', (t) => checkTable(t, 1, 'getn').arr.length);

  /* math */
  const mth = lib('math');
  mth.set('pi', Math.PI); mth.set('huge', Infinity);
  mth.set('maxinteger', 9007199254740991); mth.set('mininteger', -9007199254740991);
  const m1 = (name, f) => def(mth, name, (x) => f(checkNum(x, 1, name)));
  m1('abs', Math.abs); m1('ceil', Math.ceil); m1('floor', Math.floor); m1('sqrt', Math.sqrt);
  m1('sin', Math.sin); m1('cos', Math.cos); m1('tan', Math.tan); m1('asin', Math.asin); m1('acos', Math.acos);
  m1('sinh', Math.sinh); m1('cosh', Math.cosh); m1('tanh', Math.tanh); m1('exp', Math.exp);
  m1('deg', (x) => x * 180 / Math.PI); m1('rad', (x) => x * Math.PI / 180);
  m1('sign', (x) => (x > 0 ? 1 : x < 0 ? -1 : 0));
  m1('round', (x) => (x < 0 ? -Math.round(-x) : Math.round(x)));
  def(mth, 'atan', (y, x) => Math.atan2(checkNum(y, 1, 'atan'), x === undefined ? 1 : checkNum(x, 2, 'atan')));
  def(mth, 'atan2', (y, x) => Math.atan2(checkNum(y, 1, 'atan2'), checkNum(x, 2, 'atan2')));
  def(mth, 'pow', (x, y) => Math.pow(checkNum(x, 1, 'pow'), checkNum(y, 2, 'pow')));
  def(mth, 'log', (x, b) => { x = checkNum(x, 1, 'log'); if (b === undefined) return Math.log(x); b = checkNum(b, 2, 'log'); return b === 2 ? Math.log2(x) : b === 10 ? Math.log10(x) : Math.log(x) / Math.log(b); });
  def(mth, 'log10', (x) => Math.log10(checkNum(x, 1, 'log10')));
  def(mth, 'fmod', (a, b) => { a = checkNum(a, 1, 'fmod'); b = checkNum(b, 2, 'fmod'); return a % b; });
  def(mth, 'modf', (x) => { x = checkNum(x, 1, 'modf'); const i = x < 0 ? Math.ceil(x) : Math.floor(x); return [i, Number.isFinite(x) ? x - i : 0]; });
  def(mth, 'frexp', (x) => { x = checkNum(x, 1, 'frexp'); if (x === 0 || !Number.isFinite(x)) return [x, 0]; let e = Math.max(-1023, Math.floor(Math.log2(Math.abs(x))) + 1); let m = x * Math.pow(2, -e); while (Math.abs(m) < 0.5) { m *= 2; e--; } while (Math.abs(m) >= 1) { m /= 2; e++; } return [m, e]; });
  def(mth, 'ldexp', (m, e) => checkNum(m, 1, 'ldexp') * Math.pow(2, checkNum(e, 2, 'ldexp')));
  def(mth, 'min', (...a) => { if (!a.length) throw argErr(1, 'min', 'number expected, got no value'); let r = checkNum(a[0], 1, 'min'); for (let i = 1; i < a.length; i++) { const v = checkNum(a[i], i + 1, 'min'); if (v < r) r = v; } return r; });
  def(mth, 'max', (...a) => { if (!a.length) throw argErr(1, 'max', 'number expected, got no value'); let r = checkNum(a[0], 1, 'max'); for (let i = 1; i < a.length; i++) { const v = checkNum(a[i], i + 1, 'max'); if (v > r) r = v; } return r; });
  def(mth, 'clamp', (x, lo, hi) => { x = checkNum(x, 1, 'clamp'); lo = checkNum(lo, 2, 'clamp'); hi = checkNum(hi, 3, 'clamp'); if (lo > hi) throw rtError('max must be greater than min'); return x < lo ? lo : x > hi ? hi : x; });
  def(mth, 'lerp', (a, b, t) => a + (b - a) * t);
  def(mth, 'random', (m, n) => {
    const r = rt.rand();
    if (m === undefined) return r;
    m = checkNum(m, 1, 'random');
    if (n === undefined) { if (m < 1) throw argErr(1, 'random', 'interval is empty'); return Math.floor(r * m) + 1; }
    n = checkNum(n, 2, 'random');
    if (m > n) throw argErr(2, 'random', 'interval is empty');
    return Math.floor(r * (n - m + 1)) + m;
  });
  def(mth, 'randomseed', (s) => { rt.rngState = (checkNum(s, 1, 'randomseed') | 0) || 1; return E; });
  def(mth, 'noise', (x, y, z) => perlin(x || 0, y || 0, z || 0));

  /* os */
  const os = lib('os');
  def(os, 'time', (t) => {
    if (t instanceof LuaTable) {
      const g = (k, d) => { const v = t.get(k); if (v === undefined) { if (d === undefined) throw rtError(`field '${k}' missing in date table`); return d; } return v; };
      return Math.floor(Date.UTC(g('year'), g('month') - 1, g('day'), g('hour', 12), g('min', 0), g('sec', 0)) / 1000);
    }
    return Math.floor((rt.unixTime ? rt.unixTime() : Date.now()) / 1000);
  });
  def(os, 'clock', () => (rt.clockFn ? rt.clockFn() : (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000)));
  def(os, 'difftime', (a, b) => a - (b || 0));
  def(os, 'date', (fmt, t) => osDate(fmt, t, rt));

  /* bit32 */
  const b32 = lib('bit32');
  const u = (x) => (checkNum(x, 1, 'bit32') >>> 0);
  const toI = (x) => Math.floor(checkNum(x, 1, 'bit32')) >>> 0;
  def(b32, 'band', (...a) => a.reduce((r, v) => (r & toI(v)) >>> 0, 0xFFFFFFFF));
  def(b32, 'bor', (...a) => a.reduce((r, v) => (r | toI(v)) >>> 0, 0));
  def(b32, 'bxor', (...a) => a.reduce((r, v) => (r ^ toI(v)) >>> 0, 0));
  def(b32, 'bnot', (x) => (~toI(x)) >>> 0);
  def(b32, 'btest', (...a) => a.reduce((r, v) => (r & toI(v)) >>> 0, 0xFFFFFFFF) !== 0);
  def(b32, 'lshift', (x, n) => { n = Math.floor(n); if (n >= 32 || n <= -32) return 0; return n >= 0 ? (toI(x) << n) >>> 0 : toI(x) >>> -n; });
  def(b32, 'rshift', (x, n) => { n = Math.floor(n); if (n >= 32 || n <= -32) return 0; return n >= 0 ? toI(x) >>> n : (toI(x) << -n) >>> 0; });
  def(b32, 'arshift', (x, n) => { n = Math.floor(n); const v = toI(x) | 0; if (n >= 32) return v < 0 ? 0xFFFFFFFF : 0; if (n <= -32) return 0; return n >= 0 ? (v >> n) >>> 0 : (v << -n) >>> 0; });
  def(b32, 'lrotate', (x, n) => { n = ((Math.floor(n) % 32) + 32) % 32; const v = toI(x); return ((v << n) | (v >>> (32 - n))) >>> 0; });
  def(b32, 'rrotate', (x, n) => { n = ((Math.floor(n) % 32) + 32) % 32; const v = toI(x); return ((v >>> n) | (v << (32 - n))) >>> 0; });
  def(b32, 'extract', (x, f, w) => { w = w === undefined ? 1 : w; if (f < 0 || f + w > 32) throw rtError('trying to access non-existent bits'); return (toI(x) >>> f) & (w === 32 ? 0xFFFFFFFF : ((1 << w) - 1)) >>> 0; });
  def(b32, 'replace', (x, v, f, w) => { w = w === undefined ? 1 : w; if (f < 0 || f + w > 32) throw rtError('trying to access non-existent bits'); const mask = (w === 32 ? 0xFFFFFFFF : ((1 << w) - 1)) >>> 0; return ((toI(x) & ~(mask << f)) | ((toI(v) & mask) << f)) >>> 0; });
  def(b32, 'countlz', (x) => Math.clz32(toI(x)));
  def(b32, 'countrz', (x) => { x = toI(x); if (x === 0) return 32; let n = 0; while (!(x & 1)) { x >>>= 1; n++; } return n; });
  def(b32, 'byteswap', (x) => { x = toI(x); return (((x & 0xFF) << 24) | ((x & 0xFF00) << 8) | ((x >>> 8) & 0xFF00) | (x >>> 24)) >>> 0; });

  /* utf8 */
  const u8 = lib('utf8');
  u8.set('charpattern', '[\x00-\x7F\xC2-\xFD][\x80-\xBF]*');
  def(u8, 'char', (...a) => a.map((c) => cpToUtf8(checkNum(c, 1, 'char'))).join(''));
  function decodeAt(s, i) { // i: 0-based; returns [codepoint, nextIndex] or null
    const c = s.charCodeAt(i);
    if (c < 0x80) return [c, i + 1];
    if (c < 0xC0) return null;
    let n = c >= 0xFC ? 5 : c >= 0xF8 ? 4 : c >= 0xF0 ? 3 : c >= 0xE0 ? 2 : 1;
    let cp = c & (0x3F >> n);
    for (let k = 1; k <= n; k++) { const cc = s.charCodeAt(i + k); if (!(cc >= 0x80 && cc < 0xC0)) return null; cp = cp * 64 + (cc & 63); }
    return [cp, i + n + 1];
  }
  def(u8, 'len', (s, i, j) => {
    s = LS.checkStr(s, 1, 'len'); const l = s.length;
    let a = LS.posrelat(i === undefined ? 1 : i, l), b = LS.posrelat(j === undefined ? -1 : j, l);
    let n = 0, p = a - 1;
    while (p < b) { const d = decodeAt(s, p); if (!d) return [undefined, p + 1]; p = d[1]; n++; }
    return n;
  });
  def(u8, 'codepoint', (s, i, j) => {
    s = LS.checkStr(s, 1, 'codepoint'); const l = s.length;
    const a = LS.posrelat(i === undefined ? 1 : i, l), b = j === undefined ? a : LS.posrelat(j, l);
    if (a < 1) throw argErr(2, 'codepoint', 'out of bounds'); if (b > l) throw argErr(3, 'codepoint', 'out of bounds');
    const out = []; let p = a - 1;
    while (p < b) { const d = decodeAt(s, p); if (!d) throw rtError('invalid UTF-8 code'); out.push(d[0]); p = d[1]; }
    return out;
  });
  def(u8, 'offset', (s, n, i) => {
    s = LS.checkStr(s, 1, 'offset'); const l = s.length;
    let p = LS.posrelat(i === undefined ? (n > 0 ? 1 : l + 1) : i, l) - 1;
    const iscont = (q) => (s.charCodeAt(q) & 0xC0) === 0x80;
    if (n === 0) { while (p > 0 && p < l && iscont(p)) p--; return p + 1; }
    if (iscont(p)) throw rtError('initial position is a continuation byte');
    if (n < 0) { while (n < 0 && p > 0) { do { p--; } while (p > 0 && iscont(p)); n++; } }
    else { n--; while (n > 0 && p < l) { do { p++; } while (iscont(p)); n--; } }
    return n === 0 ? p + 1 : undefined;
  });
  def(u8, 'codes', (s) => {
    s = LS.checkStr(s, 1, 'codes');
    const f = nat((str, i) => {
      let p = i; // i is previous 1-based start; advance
      if (p > 0) { p--; const d0 = decodeAt(s, p); p = d0 ? d0[1] : p + 1; }
      if (p >= s.length) return undefined;
      const d = decodeAt(s, p); if (!d) throw rtError('invalid UTF-8 code');
      return [p + 1, d[0]];
    }, 'codes_iter');
    return [f, s, 0];
  });

  /* coroutine */
  const co = lib('coroutine');
  def(co, 'create', (f) => { if (typeof f !== 'function') throw argErr(1, 'create', 'function expected, got ' + C.tnameForErr(f)); return new Coroutine(f, CO.current ? CO.current.ctx : null); });
  def(co, 'resume', (c, ...a) => { if (!(c instanceof Coroutine)) throw argErr(1, 'resume', 'thread expected, got ' + C.tnameForErr(c)); const r = C.resume(c, a); return r; });
  def(co, 'yield', function* (...a) { if (!CO.current) throw rtError('attempt to yield from outside a coroutine'); return yield a; }, { gen: true });
  def(co, 'status', (c) => c.status);
  def(co, 'isyieldable', () => !!CO.current);
  def(co, 'running', () => CO.current || mainCo);
  const mainCo = new Coroutine(null, null); mainCo.status = 'running';
  def(co, 'wrap', (f) => {
    if (typeof f !== 'function') throw argErr(1, 'wrap', 'function expected');
    const c = new Coroutine(f, CO.current ? CO.current.ctx : null);
    return function* (...a) {
      const r = C.resume(c, a);
      if (!r[0]) throw new LuaError(r[1]);
      r.shift(); return r;
    };
  });
  def(co, 'close', (c) => {
    if (c.status === 'suspended' || c.status === 'dead') {
      if (c.gen && c.status === 'suspended') { try { c.gen.return(); } catch (e) { c.status = 'dead'; return [false, C.errValue(e)]; } }
      c.status = 'dead'; return true;
    }
    throw rtError('cannot close a ' + c.status + ' coroutine');
  });

  /* debug */
  const dbg = lib('debug');
  def(dbg, 'traceback', (msg) => (msg === undefined ? 'stack traceback:\n\t[JS]' : (typeof msg === 'string' ? msg + '\nstack traceback:\n\t[JS]' : msg)));
  def(dbg, 'info', (...a) => [C.posString().split(':')[1] | 0, '?']);
  def(dbg, 'getinfo', () => new LuaTable());

  return G;
}

class Proxy_ extends Userdata { get tname() { return 'userdata'; } lget(k) { return undefined; } lset() {} }

function perlin(x, y, z) {
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const p = perlin.p || (perlin.p = (() => { const a = []; let s = 1337; for (let i = 0; i < 256; i++) a.push(i); for (let i = 255; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a.concat(a); })());
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const grad = (h, x, y, z) => { h &= 15; const a = h < 8 ? x : y, b = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -a : a) + ((h & 2) ? -b : b); };
  const lerp = (t, a, b) => a + t * (b - a);
  const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
  return lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
    lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function osDate(fmt, t, rt) {
  fmt = fmt === undefined ? '%c' : fmt;
  t = t === undefined ? Math.floor((rt.unixTime ? rt.unixTime() : Date.now()) / 1000) : t;
  let utc = false;
  if (fmt[0] === '!') { utc = true; fmt = fmt.slice(1); }
  const d = new Date(t * 1000);
  const f = utc ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() }
    : { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), wd: d.getDay() };
  const yday = Math.floor((Date.UTC(f.y, f.mo, f.d) - Date.UTC(f.y, 0, 1)) / 86400000) + 1;
  if (fmt.startsWith('*t')) {
    const r = new LuaTable();
    r.set('year', f.y); r.set('month', f.mo + 1); r.set('day', f.d); r.set('hour', f.h); r.set('min', f.mi); r.set('sec', f.s); r.set('wday', f.wd + 1); r.set('yday', yday); r.set('isdst', false);
    return r;
  }
  const p2 = (n) => String(n).padStart(2, '0');
  return fmt.replace(/%(.)/g, (m, c) => {
    switch (c) {
      case 'Y': return String(f.y); case 'y': return p2(f.y % 100); case 'm': return p2(f.mo + 1); case 'd': return p2(f.d);
      case 'H': return p2(f.h); case 'M': return p2(f.mi); case 'S': return p2(f.s);
      case 'I': return p2(f.h % 12 || 12); case 'p': return f.h < 12 ? 'AM' : 'PM';
      case 'A': return DAYS[f.wd]; case 'a': return DAYS[f.wd].slice(0, 3); case 'B': return MONTHS[f.mo]; case 'b': return MONTHS[f.mo].slice(0, 3);
      case 'j': return String(yday).padStart(3, '0'); case 'w': return String(f.wd);
      case 'x': return `${p2(f.mo + 1)}/${p2(f.d)}/${p2(f.y % 100)}`; case 'X': return `${p2(f.h)}:${p2(f.mi)}:${p2(f.s)}`;
      case 'c': return `${DAYS[f.wd].slice(0, 3)} ${MONTHS[f.mo].slice(0, 3)} ${String(f.d).padStart(2, ' ')} ${p2(f.h)}:${p2(f.mi)}:${p2(f.s)} ${f.y}`;
      case '%': return '%';
      default: throw rtError("invalid conversion specifier '%" + c + "'");
    }
  });
}

module.exports = { Runtime, makeGlobals, nat, H, isGenFn, checkNum, checkTable, Proxy_, argErr };
