'use strict';
// Core value model & operations for the Luau->JS runtime.
//   nil = undefined, booleans, numbers = JS numbers, strings = byte strings (char codes < 256),
//   tables = LuaTable, functions = JS generator functions (Lua) / wrapped natives, userdata = Userdata subclasses.
//   A call returns a single non-array value, or a JS Array for 0 / 2+ results.
const E = Object.freeze([]);
let idCounter = 0x1000;
const nextId = () => (idCounter += 8);

class LuaError {
  constructor(value, traceback) { this.value = value; this.traceback = traceback || ''; }
  toString() { return typeof this.value === 'string' ? this.value : tostr(this.value); }
}
// current position state (written by generated code)
const ST = { p: 0, lp: 0, chunks: [''], frames: 0 };
function posString() {
  const p = ST.p;
  if (p === 0) return '';
  const ci = Math.floor(p / 1000000), ln = p % 1000000;
  return (ST.chunks[ci] || '?') + ':' + ln + ':';
}
function rtError(msg) { const p = posString(); return new LuaError(p ? p + ' ' + msg : msg); }

function lerr(msg) { const sp = ST.p; if (!ST.p) ST.p = ST.lp; const e = rtError(msg); ST.p = sp; return e; }

class Userdata { // base for Instances / datatypes
  get tname() { return 'userdata'; }
  lget(k) { throw rtError(`attempt to index ${this.tname} with '${tostr(k)}'`); }
  lset(k, v) { throw rtError(`attempt to index ${this.tname} with '${tostr(k)}'`); }
  tostr() { return this.tname; }
}

class LuaTable {
  constructor(arr, hash) { this.arr = arr || []; this.hash = hash || null; this.mt = null; this.frozen = false; this.id = 0; this._it = null; }
  get(k) {
    if (typeof k === 'number') {
      const a = this.arr;
      if ((k | 0) === k && k > 0 && k <= a.length) return a[k - 1];
    }
    const h = this.hash;
    return h === null ? undefined : h.get(k);
  }
  getStr(k) { const h = this.hash; return h === null ? undefined : h.get(k); }
  set(k, v) {
    if (this.frozen) throw rtError('attempt to modify a readonly table');
    if (typeof k === 'number') {
      if ((k | 0) === k && k > 0) {
        const a = this.arr, n = a.length;
        if (k <= n) {
          if (v === undefined && k === n) { a.pop(); while (a.length && a[a.length - 1] === undefined) a.pop(); }
          else a[k - 1] = v;
          return;
        }
        if (k === n + 1) {
          if (v === undefined) { if (this.hash !== null) this.hash.delete(k); return; }
          a.push(v);
          const h = this.hash;
          if (h !== null && h.size) {
            if (h.has(k)) h.delete(k);
            let nk = k + 1, nv;
            while ((nv = h.get(nk)) !== undefined) { a.push(nv); h.delete(nk); nk++; }
          }
          return;
        }
      } else if (k !== k) throw rtError('table index is NaN');
      else if (k === 0) k = 0;
    } else if (k === undefined) throw rtError('table index is nil');
    if (v === undefined) { if (this.hash !== null) this.hash.delete(k); return; }
    if (this.hash === null) this.hash = new Map();
    this.hash.set(k, v);
  }
  length() { return this.arr.length; }
  // raw next: returns [k,v] or null. k undefined => first.
  next(k) {
    const a = this.arr;
    let i = 0;
    if (k !== undefined) {
      if (typeof k === 'number' && (k | 0) === k && k > 0 && k <= a.length) i = k;
      else {
        i = -1;
        const h = this.hash;
        if (h === null || !h.has(k)) throw rtError("invalid key to 'next'");
        // linear scan for the following key
        let found = false;
        for (const [hk, hv] of h) {
          if (found) return [hk, hv];
          if (hk === k) found = true;
        }
        return null;
      }
    }
    for (; i < a.length; i++) if (a[i] !== undefined) return [i + 1, a[i]];
    const h = this.hash;
    if (h !== null) for (const e of h) return e;
    return null;
  }
}

function type(v) {
  switch (typeof v) {
    case 'undefined': return 'nil';
    case 'boolean': return 'boolean';
    case 'number': return 'number';
    case 'string': return 'string';
    case 'function': return 'function';
  }
  if (v instanceof LuaTable) return 'table';
  if (v instanceof Coroutine) return 'thread';
  if (v instanceof Userdata) return v.luaType || 'userdata';
  return 'userdata';
}
function typeofx(v) {
  if (v instanceof Userdata) return v.tname;
  return type(v);
}
const tnameForErr = (v) => (v instanceof Userdata ? v.tname.toLowerCase() === 'instance' ? 'Instance' : v.tname : type(v));

/* ---------- number formatting ---------- */
function fmtG(x, prec, alt, upper) {
  if (x !== x) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (prec === 0) prec = 1;
  if (x === 0) return (1 / x < 0 ? '-0' : '0') + (alt ? '.' + '0'.repeat(prec - 1) : '');
  const ex = x.toExponential(prec - 1);
  const e = parseInt(ex.slice(ex.indexOf('e') + 1), 10);
  let s;
  if (e < -4 || e >= prec) {
    let [m, ee] = ex.split('e');
    if (!alt && m.indexOf('.') >= 0) m = m.replace(/0+$/, '').replace(/\.$/, '');
    const en = parseInt(ee, 10);
    s = m + (upper ? 'E' : 'e') + (en < 0 ? '-' : '+') + String(Math.abs(en)).padStart(2, '0');
  } else {
    s = x.toFixed(Math.max(0, prec - 1 - e));
    if (!alt && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s;
}
function numStr(n) {
  if (n !== n) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (n === 0) return 1 / n < 0 ? '-0' : '0';
  const s = String(n);
  const e = s.indexOf('e');
  if (e < 0) return s;
  const sign = s[e + 1], digits = s.slice(e + 2);
  return s.slice(0, e + 2) + (digits.length < 2 ? '0' + digits : digits);
}

/* ---------- tostring / tonumber ---------- */
const mtOfStr = { current: null }; // string metatable set by stdlib
function getmt(v) {
  if (v instanceof LuaTable) return v.mt;
  if (typeof v === 'string') return mtOfStr.current;
  if (v instanceof Userdata) return v.mt || null;
  return null;
}
function tostr(v) {
  switch (typeof v) {
    case 'string': return v;
    case 'number': return numStr(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'undefined': return 'nil';
    case 'function': return 'function: 0x' + fnId(v).toString(16).padStart(8, '0');
  }
  if (v instanceof LuaTable) {
    const mt = v.mt;
    if (mt !== null) {
      const f = mt.getStr('__tostring');
      if (f !== undefined) {
        const r = first(callSync(f, [v]));
        if (typeof r !== 'string') { if (typeof r === 'number') return numStr(r); throw rtError("'__tostring' must return a string"); }
        return r;
      }
      const nm = mt.getStr('__type');
      if (typeof nm === 'string') return nm + ': 0x' + tid(v).toString(16).padStart(8, '0');
    }
    return 'table: 0x' + tid(v).toString(16).padStart(8, '0');
  }
  if (v instanceof Coroutine) return 'thread: 0x' + tid(v).toString(16).padStart(8, '0');
  if (v instanceof Userdata) return v.tostr();
  return String(v);
}
const fnIds = new WeakMap();
function fnId(f) { let i = fnIds.get(f); if (!i) { i = nextId(); fnIds.set(f, i); } return i; }
function tid(t) { if (!t.id) t.id = nextId(); return t.id; }

function str2num(s) {
  s = s.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
  if (s === '') return undefined;
  let m;
  if ((m = /^([+-]?)0[xX]([0-9a-fA-F]+)$/.exec(s))) { const v = parseInt(m[2], 16); return m[1] === '-' ? -v : v; }
  if ((m = /^([+-]?)0[bB]([01]+)$/.exec(s))) { const v = parseInt(m[2], 2); return m[1] === '-' ? -v : v; }
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
  return undefined;
}
function tonum(v) { // coercion for arithmetic
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return str2num(v);
  return undefined;
}

/* ---------- synchronous calling (metamethods, sort comparators, iterators) ---------- */
const first = (r) => (r instanceof Array ? r[0] : r);
const toArr = (r) => (r instanceof Array ? r : [r]);
function callSync(f, args) {
  if (typeof f !== 'function') f = toCallable(f, 'value');
  const g = f(...args);
  if (g !== null && typeof g === 'object' && typeof g.next === 'function' && g[Symbol.toStringTag] === 'Generator') {
    const r = g.next();
    if (!r.done) throw new LuaError('attempt to yield across metamethod/C-call boundary');
    return r.value;
  }
  return g;
}
function toCallable(f, desc) {
  if (typeof f === 'function') return f;
  const mt = getmt(f);
  if (mt) {
    const c = mt.getStr('__call');
    if (c !== undefined) { const cf = toCallable(c, desc); return function* (...a) { return yield* cf(f, ...a); }; }
  }
  if (f instanceof Userdata && typeof f.lcall === 'function') return function* (...a) { return f.lcall(...a); };
  throw rtError(`attempt to call a ${tnameForErr(f)} value${desc ? ' (' + desc + ')' : ''}`);
}

/* ---------- indexing ---------- */
function idx(o, k) {
  if (o instanceof LuaTable) {
    const v = o.get(k);
    if (v !== undefined || o.mt === null) return v;
    return idxMeta(o, k);
  }
  return idxSlow(o, k);
}
function idxMeta(o, k) {
  for (let loop = 0; loop < 100; loop++) {
    const mt = o.mt;
    if (mt === null) return undefined;
    const h = mt.getStr('__index');
    if (h === undefined) return undefined;
    if (typeof h === 'function') return first(callSync(h, [o, k]));
    if (h instanceof LuaTable) { const v = h.get(k); if (v !== undefined || h.mt === null) return v; o = h; continue; }
    return idx(h, k);
  }
  throw rtError("'__index' chain too long; possible loop");
}
function idxSlow(o, k) {
  if (typeof o === 'string') {
    const m = mtOfStr.current;
    if (m) { const h = m.getStr('__index'); if (h instanceof LuaTable) return h.get(k); }
    return undefined;
  }
  if (o instanceof Userdata) {
    const mt = o.mt;
    if (mt) { const v = o.lget(k); return v; }
    return o.lget(k);
  }
  if (o instanceof LuaTable) return idx(o, k);
  throw rtError(`attempt to index ${tnameForErr(o)} with ${k === undefined ? 'nil' : "'" + tostr(k) + "'"}`);
}
function setidx(o, k, v) {
  if (o instanceof LuaTable) {
    if (o.mt === null) { o.set(k, v); return; }
    const h = o.mt.getStr('__newindex');
    if (h === undefined || o.get(k) !== undefined) { o.set(k, v); return; }
    if (typeof h === 'function') { callSync(h, [o, k, v]); return; }
    setidx(h, k, v); return;
  }
  if (o instanceof Userdata) { o.lset(k, v); return; }
  throw rtError(`attempt to index ${tnameForErr(o)} with ${k === undefined ? 'nil' : "'" + tostr(k) + "'"}`);
}

/* ---------- arithmetic / comparison ---------- */
const ARITH = { add: '__add', sub: '__sub', mul: '__mul', div: '__div', mod: '__mod', pow: '__pow', idiv: '__idiv', unm: '__unm' };
function arithMeta(op, a, b) {
  const ev = ARITH[op];
  let f;
  const m1 = getmt(a); if (m1) f = m1.getStr(ev);
  if (f === undefined) { const m2 = getmt(b); if (m2) f = m2.getStr(ev); }
  if (f !== undefined) return first(callSync(f, [a, b]));
  if (a instanceof Userdata && a.arith) { const r = a.arith(op, a, b); if (r !== undefined) return r; }
  if (b instanceof Userdata && b.arith) { const r = b.arith(op, a, b); if (r !== undefined) return r; }
  // string -> number coercion
  const x = tonum(a), y = tonum(b);
  if (x !== undefined && y !== undefined && (typeof a === 'string' || typeof b === 'string' || typeof a === 'number' || typeof b === 'number') && !(a instanceof LuaTable) && !(b instanceof LuaTable)) {
    return arithNum(op, x, y);
  }
  if (op === 'unm') throw rtError(`attempt to perform arithmetic (unm) on ${tnameForErr(a)}`);
  throw rtError(`attempt to perform arithmetic (${op}) on ${tnameForErr(a)} and ${tnameForErr(b)}`);
}
function arithNum(op, x, y) {
  switch (op) {
    case 'add': return x + y;
    case 'sub': return x - y;
    case 'mul': return x * y;
    case 'div': return x / y;
    case 'mod': return x - Math.floor(x / y) * y;
    case 'pow': return Math.pow(x, y);
    case 'idiv': return Math.floor(x / y);
    case 'unm': return -x;
  }
}
const mod = (a, b) => { if (b === Infinity) return a >= 0 ? a : (a === -Infinity ? NaN : b); if (b === -Infinity) return a <= 0 ? a : b; const r = a % b; return (r !== 0 && (r ^ b) < 0 !== (r < 0) !== (b < 0)) ? r + b : (r !== 0 && (r < 0) !== (b < 0) ? r + b : r); };
function modf(a, b) { const r = a % b; return (r !== 0 && (r < 0) !== (b < 0)) ? r + b : r; }
const add = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a + b : arithMeta('add', a, b);
const sub = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : arithMeta('sub', a, b);
const mul = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a * b : arithMeta('mul', a, b);
const div = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a / b : arithMeta('div', a, b);
const mod_ = (a, b) => (typeof a === 'number' && typeof b === 'number') ? a - Math.floor(a / b) * b : arithMeta('mod', a, b);
function modf2(a, b) {
  if (b === Infinity) return a >= 0 ? a : (a === -Infinity ? NaN : b);
  if (b === -Infinity) return a <= 0 ? a : (a === Infinity ? NaN : b);
  const r = a % b; return (r !== 0 && (r < 0) !== (b < 0)) ? r + b : r;
}
const pow = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.pow(a, b) : arithMeta('pow', a, b);
const idiv = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.floor(a / b) : arithMeta('idiv', a, b);
const unm = (a) => (typeof a === 'number') ? -a : arithMeta('unm', a, a);

function concat(a, b) {
  const ta = typeof a, tb = typeof b;
  if ((ta === 'string' || ta === 'number') && (tb === 'string' || tb === 'number')) return (ta === 'string' ? a : numStr(a)) + (tb === 'string' ? b : numStr(b));
  const m1 = getmt(a); let f; if (m1 && !(typeof a === 'string')) f = m1.getStr('__concat');
  if (f === undefined) { const m2 = getmt(b); if (m2 && typeof b !== 'string') f = m2.getStr('__concat'); }
  if (f !== undefined) return first(callSync(f, [a, b]));
  throw rtError(`attempt to concatenate ${tnameForErr(a)} with ${tnameForErr(b)}`);
}
function len(v) {
  if (typeof v === 'string') return v.length;
  if (v instanceof LuaTable) {
    if (v.mt !== null) { const f = v.mt.getStr('__len'); if (f !== undefined) return first(callSync(f, [v])); }
    return v.arr.length;
  }
  if (v instanceof Userdata && typeof v.len === 'function') return v.len();
  throw rtError(`attempt to get length of a ${tnameForErr(v)} value`);
}
function eq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (a instanceof LuaTable && b instanceof LuaTable) {
    const f = a.mt ? a.mt.getStr('__eq') : undefined;
    if (f !== undefined && b.mt && b.mt.getStr('__eq') === f) return truthy(first(callSync(f, [a, b])));
    return false;
  }
  if (a instanceof Userdata && typeof a.eq === 'function') return a.eq(b);
  return false;
}
const truthy = (v) => v !== undefined && v !== false;
function cmpErr(a, b, op) { return rtError(`attempt to compare ${tnameForErr(a)} ${op} ${tnameForErr(b)}`); }
function lt(a, b) {
  const ta = typeof a, tb = typeof b;
  if (ta === 'number' && tb === 'number') return a < b;
  if (ta === 'string' && tb === 'string') return a < b;
  let f; const m1 = getmt(a); if (m1 && ta !== 'string') f = m1.getStr('__lt');
  if (f === undefined) { const m2 = getmt(b); if (m2 && tb !== 'string') f = m2.getStr('__lt'); }
  if (f !== undefined) return truthy(first(callSync(f, [a, b])));
  throw cmpErr(a, b, '<');
}
function le(a, b) {
  const ta = typeof a, tb = typeof b;
  if (ta === 'number' && tb === 'number') return a <= b;
  if (ta === 'string' && tb === 'string') return a <= b;
  let f; const m1 = getmt(a); if (m1 && ta !== 'string') f = m1.getStr('__le');
  if (f === undefined) { const m2 = getmt(b); if (m2 && tb !== 'string') f = m2.getStr('__le'); }
  if (f !== undefined) return truthy(first(callSync(f, [a, b])));
  throw cmpErr(a, b, '<=');
}

/* ---------- coroutines ---------- */
class Coroutine {
  constructor(fn, ctx) { this.fn = fn; this.gen = null; this.status = 'suspended'; this.ctx = ctx || null; this.id = 0; this.ownerSched = false; }
}
const SCHED = Object.freeze({ sched: true });
const CO = { current: null, onError: null };
function resume(co, args) {
  if (co.status === 'dead') return [false, 'cannot resume dead coroutine'];
  if (co.status !== 'suspended') return [false, co.status === 'running' ? 'cannot resume running coroutine' : 'cannot resume non-suspended coroutine'];
  const prev = CO.current, savedP = ST.p;
  if (prev) prev.status = 'normal';
  co.status = 'running'; CO.current = co;
  try {
    let r;
    if (co.gen === null) {
      const f = co.fn;
      const g = f(...args);
      if (!(g && g[Symbol.toStringTag] === 'Generator')) { co.status = 'dead'; return [true, ...toArr(g)]; }
      co.gen = g;
      r = g.next();
    } else r = co.gen.next(args);
    if (r.done) { co.status = 'dead'; return [true, ...toArr(r.value)]; }
    co.status = 'suspended';
    return r.value === SCHED ? [true] : [true, ...r.value];
  } catch (e) {
    co.status = 'dead';
    return [false, errValue(e)];
  } finally {
    CO.current = prev; if (prev) prev.status = 'running';
  }
}
function errValue(e) {
  if (e instanceof LuaError) return e.value;
  if (e instanceof RangeError && /call stack/i.test(e.message)) return posString() + ' stack overflow';
  if (e && e.luaStopThread) throw e;
  const msg = 'internal error: ' + (e && e.message ? e.message : String(e));
  if (typeof console !== 'undefined' && CO.debug) console.error(e);
  return msg;
}
function mkTable(arr, hash) { return new LuaTable(arr, hash); }
function newTableFromObject(o) { const t = new LuaTable(); for (const k of Object.keys(o)) t.set(k, o[k]); return t; }

module.exports = {
  E, LuaError, ST, posString, rtError, lerr, Userdata, LuaTable, type, typeofx, tnameForErr, fmtG, numStr, tostr, str2num, tonum, mtOfStr, getmt,
  first, toArr, callSync, toCallable, idx, setidx, add, sub, mul, div, mod: mod_, pow, idiv, unm, concat, len, eq, lt, le, truthy,
  Coroutine, SCHED, CO, resume, errValue, mkTable, newTableFromObject, fnId, tid, arithNum, modf: modf2,
};
