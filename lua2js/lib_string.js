'use strict';
const C = require('./core');
const { LuaTable, LuaError, rtError, tostr, numStr, tonum, first, E, fmtG, cpToUtf8 } = Object.assign({}, C, require('./lexer'));

/* ---------------- Lua patterns (port of lstrlib.c) ---------------- */
const L_ESC = 37; // '%'
const CAP_UNFINISHED = -1, CAP_POSITION = -2, MAXCAPTURES = 32, MAXCCALLS = 200;
class MS { constructor(src, pat) { this.src = src; this.pat = pat; this.level = 0; this.capture = []; this.depth = 0; } }
function perr(msg) { return rtError(msg); }
function classEnd(ms, p) {
  const pat = ms.pat;
  if (p >= pat.length) throw perr('malformed pattern (ends with \'%\')');
  const c = pat.charCodeAt(p++);
  if (c === L_ESC) {
    if (p >= pat.length) throw perr("malformed pattern (ends with '%')");
    return p + 1;
  }
  if (c === 91) { // '['
    if (pat.charCodeAt(p) === 94) p++;
    do {
      if (p >= pat.length) throw perr("malformed pattern (missing ']')");
      const cc = pat.charCodeAt(p++);
      if (cc === L_ESC && p < pat.length) p++;
    } while (pat.charCodeAt(p) !== 93);
    return p + 1;
  }
  return p;
}
const isalpha = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isdigit = (c) => c >= 48 && c <= 57;
const islower = (c) => c >= 97 && c <= 122;
const isupper = (c) => c >= 65 && c <= 90;
const isspace = (c) => c === 32 || (c >= 9 && c <= 13);
const iscntrl = (c) => c < 32 || c === 127;
const ispunct = (c) => (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
const isalnum = (c) => isalpha(c) || isdigit(c);
const isxdigit = (c) => isdigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
const isgraph = (c) => c > 32 && c < 127;
function matchClass(c, cl) {
  let res;
  switch (cl | 32) {
    case 97: res = isalpha(c); break;
    case 99: res = iscntrl(c); break;
    case 100: res = isdigit(c); break;
    case 103: res = isgraph(c); break;
    case 108: res = islower(c); break;
    case 112: res = ispunct(c); break;
    case 115: res = isspace(c); break;
    case 117: res = isupper(c); break;
    case 119: res = isalnum(c); break;
    case 120: res = isxdigit(c); break;
    default: return cl === c;
  }
  if (isupper(cl)) res = !res;
  return res;
}
function matchBracketClass(ms, c, p, ec) {
  const pat = ms.pat;
  let sig = true;
  if (pat.charCodeAt(p + 1) === 94) { sig = false; p++; }
  while (++p < ec) {
    const pc = pat.charCodeAt(p);
    if (pc === L_ESC) { p++; if (matchClass(c, pat.charCodeAt(p))) return sig; }
    else if (pat.charCodeAt(p + 1) === 45 && p + 2 < ec) {
      p += 2;
      if (pc <= c && c <= pat.charCodeAt(p)) return sig;
    } else if (pc === c) return sig;
  }
  return !sig;
}
function singleMatch(ms, s, p, ep) {
  if (s >= ms.src.length) return false;
  const c = ms.src.charCodeAt(s), pc = ms.pat.charCodeAt(p);
  switch (pc) {
    case 46: return true;
    case L_ESC: return matchClass(c, ms.pat.charCodeAt(p + 1));
    case 91: return matchBracketClass(ms, c, p, ep - 1);
    default: return pc === c;
  }
}
function matchBalance(ms, s, p) {
  if (p + 1 >= ms.pat.length) throw perr("malformed pattern (missing arguments to '%b')");
  if (s >= ms.src.length || ms.src.charCodeAt(s) !== ms.pat.charCodeAt(p)) return -1;
  const b = ms.pat.charCodeAt(p), e = ms.pat.charCodeAt(p + 1);
  let cont = 1;
  while (++s < ms.src.length) {
    const c = ms.src.charCodeAt(s);
    if (c === e) { if (--cont === 0) return s + 1; }
    else if (c === b) cont++;
  }
  return -1;
}
function maxExpand(ms, s, p, ep) {
  let i = 0;
  while (singleMatch(ms, s + i, p, ep)) i++;
  while (i >= 0) { const res = doMatch(ms, s + i, ep + 1); if (res !== -1) return res; i--; }
  return -1;
}
function minExpand(ms, s, p, ep) {
  for (;;) {
    const res = doMatch(ms, s, ep + 1);
    if (res !== -1) return res;
    if (singleMatch(ms, s, p, ep)) s++; else return -1;
  }
}
function startCapture(ms, s, p, what) {
  if (ms.level >= MAXCAPTURES) throw perr('too many captures');
  ms.capture[ms.level] = { init: s, len: what };
  ms.level++;
  const res = doMatch(ms, s, p);
  if (res === -1) ms.level--;
  return res;
}
function endCapture(ms, s, p) {
  let l = -1;
  for (let level = ms.level - 1; level >= 0; level--) if (ms.capture[level].len === CAP_UNFINISHED) { l = level; break; }
  if (l < 0) throw perr('invalid pattern capture');
  ms.capture[l].len = s - ms.capture[l].init;
  const res = doMatch(ms, s, p);
  if (res === -1) ms.capture[l].len = CAP_UNFINISHED;
  return res;
}
function matchCapture(ms, s, l) {
  l = checkCapture(ms, l);
  const cap = ms.capture[l];
  const len = cap.len;
  if (ms.src.length - s >= len && ms.src.substr(cap.init, len) === ms.src.substr(s, len)) return s + len;
  return -1;
}
function checkCapture(ms, l) {
  l -= 49;
  if (l < 0 || l >= ms.level || ms.capture[l].len === CAP_UNFINISHED) throw perr('invalid capture index %' + (l + 1));
  return l;
}
function doMatch(ms, s, p) {
  if (ms.depth++ > MAXCCALLS) { ms.depth--; throw perr('pattern too complex'); }
  try {
    const pat = ms.pat, plen = pat.length;
    for (;;) {
      if (p >= plen) return s;
      const pc = pat.charCodeAt(p);
      switch (pc) {
        case 40: // '('
          if (pat.charCodeAt(p + 1) === 41) return startCapture(ms, s, p + 2, CAP_POSITION);
          return startCapture(ms, s, p + 1, CAP_UNFINISHED);
        case 41: return endCapture(ms, s, p + 1);
        case 36: // '$'
          if (p + 1 === plen) return s === ms.src.length ? s : -1;
          break;
        case L_ESC: {
          const nc = pat.charCodeAt(p + 1);
          if (nc === 98) { // %b
            s = matchBalance(ms, s, p + 2);
            if (s !== -1) { p += 4; continue; }
            return -1;
          }
          if (nc === 102) { // %f
            p += 2;
            if (pat.charCodeAt(p) !== 91) throw perr("missing '[' after '%f' in pattern");
            const ep = classEnd(ms, p);
            const prev = s === 0 ? 0 : ms.src.charCodeAt(s - 1);
            const cur = s < ms.src.length ? ms.src.charCodeAt(s) : 0;
            if (!matchBracketClass(ms, prev, p, ep - 1) && matchBracketClass(ms, cur, p, ep - 1)) { p = ep; continue; }
            return -1;
          }
          if (nc >= 48 && nc <= 57) {
            s = matchCapture(ms, s, nc);
            if (s !== -1) { p += 2; continue; }
            return -1;
          }
          break;
        }
      }
      // default
      const ep = classEnd(ms, p);
      const epc = pat.charCodeAt(ep);
      if (!singleMatch(ms, s, p, ep)) {
        if (epc === 42 || epc === 63 || epc === 45) { p = ep + 1; continue; }
        return -1;
      }
      switch (epc) {
        case 63: { // '?'
          const res = doMatch(ms, s + 1, ep + 1);
          if (res !== -1) return res;
          p = ep + 1; continue;
        }
        case 43: return maxExpand(ms, s + 1, p, ep); // '+'
        case 42: return maxExpand(ms, s, p, ep);
        case 45: return minExpand(ms, s, p, ep);
        default: s++; p = ep; continue;
      }
    }
  } finally { ms.depth--; }
}
function getOneCapture(ms, i, s, e) {
  if (i >= ms.level) {
    if (i === 0) return ms.src.slice(s, e);
    throw perr('invalid capture index');
  }
  const cap = ms.capture[i];
  if (cap.len === CAP_UNFINISHED) throw perr('unfinished capture');
  if (cap.len === CAP_POSITION) return cap.init + 1;
  return ms.src.substr(cap.init, cap.len);
}
function pushCaptures(ms, s, e, wholeIfNone) {
  const n = (ms.level === 0 && wholeIfNone) ? 1 : ms.level;
  const out = [];
  for (let i = 0; i < n; i++) out.push(getOneCapture(ms, i, s, e));
  return out;
}
const SPECIALS = /[\^$*+?.(\[%-]/;

function argErr(i, fname, msg) { return C.lerr(`invalid argument #${i} to '${fname}' (${msg})`); }
function checkStr(v, i, fname) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numStr(v);
  throw argErr(i, fname, `string expected, got ${C.tnameForErr(v)}`);
}
function checkInt(v, i, fname, def) {
  if (v === undefined && def !== undefined) return def;
  let n = v;
  if (typeof n === 'string') n = C.str2num(n);
  if (typeof n !== 'number') throw argErr(i, fname, `number expected, got ${C.tnameForErr(v)}`);
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}
function posrelat(pos, len) { return pos >= 0 ? pos : (-pos > len ? 0 : len + pos + 1); }

function strFindAux(s, pat, init, plain, find, fname) {
  s = checkStr(s, 1, fname); pat = checkStr(pat, 2, fname);
  let i = posrelat(checkInt(init, 3, fname, 1), s.length);
  if (i < 1) i = 1;
  if (i > s.length + 1) return undefined;
  if (find && (C.truthy(plain) || !SPECIALS.test(pat))) {
    const idx = s.indexOf(pat, i - 1);
    return idx < 0 ? undefined : [idx + 1, idx + pat.length];
  }
  const anchor = pat.charCodeAt(0) === 94;
  let p = anchor ? 1 : 0;
  let s1 = i - 1;
  do {
    const ms = new MS(s, pat);
    const e = doMatch(ms, s1, p);
    if (e !== -1) {
      if (find) return [s1 + 1, e, ...pushCaptures(ms, null, null, false)];
      return pushCaptures(ms, s1, e, true);
    }
    s1++;
  } while (s1 <= s.length && !anchor);
  return undefined;
}
function find(s, pat, init, plain) {
  const r = strFindAux(s, pat, init, plain, true, 'find');
  return r === undefined ? undefined : r;
}
function match(s, pat, init) {
  const r = strFindAux(s, pat, init, false, false, 'match');
  if (r === undefined) return undefined;
  return r.length === 1 ? r[0] : r;
}
function gmatch(s, pat) {
  s = checkStr(s, 1, 'gmatch'); pat = checkStr(pat, 2, 'gmatch');
  let src = 0;
  const f = function* () {
    for (; src <= s.length; src++) {
      const ms = new MS(s, pat);
      const e = doMatch(ms, src, 0);
      if (e !== -1) {
        const caps = pushCaptures(ms, src, e, true);
        src = (e === src) ? e + 1 : e;
        return caps.length === 1 ? caps[0] : caps;
      }
    }
    src = s.length + 2;
    return undefined;
  };
  return f;
}
function* gsub(s, pat, repl, maxS) {
  s = checkStr(s, 1, 'gsub'); pat = checkStr(pat, 2, 'gsub');
  const tr = typeof repl;
  if (!(tr === 'string' || tr === 'number' || tr === 'function' || repl instanceof LuaTable)) {
    throw argErr(3, 'gsub', `string/function/table expected, got ${repl === undefined ? 'no value' : C.tnameForErr(repl)}`);
  }
  if (tr === 'number') repl = numStr(repl);
  const srcl = s.length;
  const max = maxS === undefined ? srcl + 1 : checkInt(maxS, 4, 'gsub');
  const anchor = pat.charCodeAt(0) === 94;
  const p = anchor ? 1 : 0;
  let src = 0, n = 0, lastmatch = -1;
  const out = [];
  while (n < max) {
    const ms = new MS(s, pat);
    const e = doMatch(ms, src, p);
    if (e !== -1) {
      n++;
      // add value
      let val;
      const whole = s.slice(src, e);
      if (typeof repl === 'string') {
        let r = '';
        for (let i = 0; i < repl.length; i++) {
          const c = repl.charCodeAt(i);
          if (c !== L_ESC) { r += repl[i]; continue; }
          i++;
          const d = repl.charCodeAt(i);
          if (d === L_ESC) r += '%';
          else if (isdigit(d)) {
            if (d === 48) r += whole;
            else { const v = getOneCapture(ms, d - 49, src, e); r += typeof v === 'number' ? numStr(v) : v; }
          } else throw perr("invalid use of '%' in replacement string");
        }
        val = r;
      } else {
        const caps = pushCaptures(ms, src, e, true);
        let v;
        if (typeof repl === 'function') v = first(yield* repl(...caps));
        else v = C.idx(repl, caps[0]);
        if (v === undefined || v === false) val = whole;
        else if (typeof v === 'string') val = v;
        else if (typeof v === 'number') val = numStr(v);
        else throw perr('invalid replacement value (a ' + C.tnameForErr(v) + ')');
      }
      out.push(val);
    }
    if (e !== -1 && e > src) src = e;
    else if (src < srcl) out.push(s[src++]);
    else break;
    if (anchor) break;
  }
  if (src < srcl) out.push(s.slice(src));
  return [out.join(''), n];
}

/* ---------------- string.format ---------------- */
function toFixedC(x, p) { // like C printf %.pf (round-half-even on exact ties)
  const s = x.toFixed(p);
  if (p > 70) return s;
  const t = x.toFixed(p + 25);
  const dot = t.indexOf('.');
  const tail = t.slice(dot + 1 + p);
  if (tail[0] === '5' && /^50*$/.test(tail)) {
    const trunc = t.slice(0, dot + 1 + p).replace(/\.$/, '');
    const last = trunc.charCodeAt(trunc.length - 1) - 48;
    if (last % 2 === 0) return trunc;
  }
  return s;
}
function format(fmt, ...args) {
  fmt = checkStr(fmt, 1, 'format');
  let out = '', ai = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%') { out += c; continue; }
    i++;
    if (fmt[i] === '%') { out += '%'; continue; }
    let flags = '';
    while ('-+ #0'.includes(fmt[i]) && i < fmt.length) flags += fmt[i++];
    let width = '';
    while (isdigit(fmt.charCodeAt(i))) width += fmt[i++];
    let prec = null;
    if (fmt[i] === '.') { i++; prec = ''; while (isdigit(fmt.charCodeAt(i))) prec += fmt[i++]; prec = prec === '' ? 0 : parseInt(prec, 10); }
    const conv = fmt[i];
    if (conv === undefined) throw rtError("invalid option '%' to 'format'");
    const argn = ai + 2;
    const w = width === '' ? 0 : parseInt(width, 10);
    const left = flags.includes('-'), zero = flags.includes('0') && !left, plus = flags.includes('+'), space = flags.includes(' '), alt = flags.includes('#');
    const pad = (body, numeric) => {
      if (body.length >= w) return body;
      if (left) return body + ' '.repeat(w - body.length);
      if (zero && numeric) { const m = /^([+\- ]?(?:0[xX])?)(.*)$/.exec(body); return m[1] + '0'.repeat(w - body.length) + m[2]; }
      return ' '.repeat(w - body.length) + body;
    };
    const sign = (neg, s) => (neg ? '-' : plus ? '+' : space ? ' ' : '') + s;
    const needArg = () => { if (ai >= args.length) throw rtError(`missing argument #${argn}`); return args[ai++]; };
    const needNum = () => {
      const v = needArg(); const n = tonum(v);
      if (n === undefined) throw argErr(argn, 'format', `number expected, got ${C.tnameForErr(v)}`);
      return n;
    };
    switch (conv) {
      case 'd': case 'i': {
        const n = needNum();
        const an = Math.abs(Math.trunc(n)); let s = an >= 1e21 ? BigInt(an).toString() : String(an);
        if (prec !== null) s = s.padStart(prec, '0');
        out += pad(sign(n < 0, s), prec === null); break;
      }
      case 'u': { const n = needNum(); out += pad(String(n < 0 ? Number(BigInt.asUintN(64, BigInt(Math.trunc(n)))) : Math.trunc(n)), true); break; }
      case 'c': { out += pad(String.fromCharCode(needNum() & 255), false); break; }
      case 'x': case 'X': case 'o': {
        let n = needNum(); if (!Number.isInteger(n)) throw argErr(argn, 'format', 'number has no integer representation');
        const base = conv === 'o' ? 8 : 16;
        let s = (n < 0 ? BigInt.asUintN(64, BigInt(n)) : BigInt(n)).toString(base);
        if (conv === 'X') s = s.toUpperCase();
        if (prec !== null) s = s.padStart(prec, '0');
        if (alt && n !== 0) s = (conv === 'o' ? '0' : conv === 'x' ? '0x' : '0X') + s;
        out += pad(s, prec === null); break;
      }
      case 'e': case 'E': case 'f': case 'F': case 'g': case 'G': {
        const n = needNum();
        let s;
        const p = prec === null ? 6 : prec;
        if (!Number.isFinite(n)) s = n !== n ? 'nan' : 'inf';
        else if (conv === 'f' || conv === 'F') { s = Math.abs(n) >= 1e21 ? BigInt(Math.abs(n)).toString() + (p ? '.' + '0'.repeat(p) : '') : toFixedC(Math.abs(n), Math.min(p, 100)); if (alt && p === 0) s += '.'; }
        else if (conv === 'e' || conv === 'E') {
          s = Math.abs(n).toExponential(Math.min(p, 100)).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase();
        } else { s = fmtG(Math.abs(n), p, alt, conv === 'G'); if (s.startsWith('-')) s = s.slice(1); }
        const neg = n < 0 || (n === 0 && 1 / n < 0);
        out += pad(sign(neg && s !== 'nan', s), Number.isFinite(n)); break;
      }
      case 's': {
        const v = needArg();
        if (typeof v !== 'string' && typeof v !== 'number') throw argErr(argn, 'format', `string expected, got ${C.tnameForErr(v)}`);
        let s = tostr(v);
        if (prec !== null) s = s.slice(0, prec);
        out += pad(s, false); break;
      }
      case 'q': {
        const v = needArg(); let s = tostr(v);
        if (typeof v !== 'string') { out += s; break; }
        out += '"' + s.replace(/[\\"\n\r\0]/g, (m) => (m === '\n' ? '\\\n' : m === '\r' ? '\\r' : m === '\0' ? '\\0' : '\\' + m)) + '"'; break;
      }
      case 'a': case 'A': { out += pad(needNum().toString(16), false); break; }
      default: throw rtError(`invalid option '%${conv}' to 'format'`);
    }
  }
  return out;
}

/* ---------------- other string functions ---------------- */
const S = {
  len: (s) => checkStr(s, 1, 'len').length,
  sub: (s, i, j) => {
    s = checkStr(s, 1, 'sub'); const l = s.length;
    let a = posrelat(checkInt(i, 2, 'sub', 1), l), b = posrelat(checkInt(j, 3, 'sub', -1), l);
    if (a < 1) a = 1; if (b > l) b = l;
    return a > b ? '' : s.slice(a - 1, b);
  },
  upper: (s) => checkStr(s, 1, 'upper').replace(/[a-z]+/g, (m) => m.toUpperCase()),
  lower: (s) => checkStr(s, 1, 'lower').replace(/[A-Z]+/g, (m) => m.toLowerCase()),
  rep: (s, n, sep) => {
    s = checkStr(s, 1, 'rep'); n = checkInt(n, 2, 'rep'); sep = sep === undefined ? '' : checkStr(sep, 3, 'rep');
    if (n <= 0) return '';
    if (s.length * n > 1e9) throw rtError('resulting string too large');
    return s.repeat(n);
  },
  reverse: (s) => checkStr(s, 1, 'reverse').split('').reverse().join(''),
  byte: (s, i, j) => {
    s = checkStr(s, 1, 'byte'); const l = s.length;
    const a = posrelat(checkInt(i, 2, 'byte', 1), l); let b = j === undefined ? a : posrelat(checkInt(j, 3, 'byte'), l);
    const lo = Math.max(a, 1), hi = Math.min(b, l);
    const r = []; for (let k = lo; k <= hi; k++) r.push(s.charCodeAt(k - 1));
    return r.length === 1 ? r[0] : r;
  },
  char: (...a) => a.map((c, i) => { const n = checkInt(c, i + 1, 'char'); if (n < 0 || n > 255) throw argErr(i + 1, 'char', 'invalid value'); return String.fromCharCode(n); }).join(''),
  split: (s, sep) => {
    s = checkStr(s, 1, 'split'); sep = sep === undefined ? ',' : checkStr(sep, 2, 'split');
    const t = new LuaTable();
    if (sep === '') { for (let i = 0; i < s.length; i++) t.set(i + 1, s[i]); return t; }
    const parts = s.split(sep);
    t.arr = parts; return t;
  },
  find, match, format,
};

module.exports = { S, gsub, gmatch, checkStr, checkInt, argErr, posrelat, doMatch, MS };
