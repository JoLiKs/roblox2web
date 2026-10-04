/* Мини-интерпретатор подмножества Luau (JS-порт r2w/luau.py). Работает в браузере и в Node.
   Читает «модули с данными»: таблицы, локальные функции-конструкторы, циклы, арифметику, Color3/Vector3/Enum.
   Roblox API (Instance, task, DataStore…) не выполняется: такие инструкции пропускаются с предупреждением. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Luau = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

class LuauError extends Error {}
class LuauSyntaxError extends LuauError {}
class LuauRuntimeError extends LuauError {}
class Unsupported extends LuauRuntimeError {}
class StepLimit extends LuauError {}

const isNum = v => typeof v === 'number';
const nk = k => k; // Map различает 1 и "1"; NaN не бывает ключом

class LTable {
  constructor() { this.d = new Map(); this.meta = null; }
  length() { let n = 0; while (this.d.has(n + 1)) n++; return n; }
  get(k) {
    if (this.d.has(k)) return this.d.get(k);
    if (this.meta) { const idx = this.meta.d.get('__index'); if (idx instanceof LTable) return idx.get(k); }
    return null;
  }
  set(k, v) {
    if (k === null || k === undefined) throw new LuauRuntimeError('table index is nil');
    if (v === null || v === undefined) this.d.delete(k); else this.d.set(k, v);
  }
}
class Struct { constructor(kind, f) { this.kind = kind; this.f = f; } }
class EnumPath { constructor(path) { this.path = path; } }
class RobloxApi { constructor(name) { this.name = name; } }
class InstNode {
  constructor(name, cls, source, path) {
    this.name = name; this.cls = cls || 'Folder'; this.source = source === undefined ? null : source; this.path = path || null;
    this.parent = null; this.children = new Map(); this.attrs = new Map(); this.value = null; this.state = 0;
  }
  add(c) { c.parent = this; this.children.set(c.name, c); return c; }
  fullName() { const p = []; let n = this; while (n && n.parent) { p.push(n.name); n = n.parent; } return p.reverse().join('.'); }
}
class LFunction { constructor(params, vararg, body, env, name) { this.params = params; this.vararg = vararg; this.body = body; this.env = env; this.name = name; } }
class Builtin { constructor(fn, name) { this.fn = fn; this.name = name; } }

/* ------------------------------------------------------------------ tokenizer */
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const OPS3 = ['...', '..=', '//='];
const OPS2 = ['==', '~=', '<=', '>=', '..', '::', '->', '+=', '-=', '*=', '/=', '%=', '^=', '//'];
const ESC = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '`': '`', '{': '{', '\n': '\n' };
const isAlpha = c => /[A-Za-z_\u00C0-\uFFFF]/.test(c);
const isAlnum = c => /[A-Za-z0-9_\u00C0-\uFFFF]/.test(c);
const isDigit = c => c >= '0' && c <= '9';

function tokenize(src, fname) {
  fname = fname || '?';
  const toks = []; let i = 0, line = 1; const n = src.length;
  const err = m => { throw new LuauSyntaxError(`${fname}:${line}: ${m}`); };
  if (src.startsWith('#!')) while (i < n && src[i] !== '\n') i++;
  const longBracket = pos => {
    let j = pos + 1, lvl = 0;
    while (j < n && src[j] === '=') { lvl++; j++; }
    return (j < n && src[j] === '[') ? [lvl, j + 1] : null;
  };
  const count = (a, b) => { let c = 0; for (let k = a; k < b; k++) if (src[k] === '\n') c++; return c; };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src.startsWith('--', i)) {
      i += 2;
      if (i < n && src[i] === '[') {
        const lb = longBracket(i);
        if (lb) {
          const close = ']' + '='.repeat(lb[0]) + ']', e = src.indexOf(close, lb[1]);
          if (e < 0) err('unfinished long comment');
          line += count(i, e); i = e + close.length; continue;
        }
      }
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (isAlpha(c)) {
      let j = i + 1; while (j < n && isAlnum(src[j])) j++;
      const w = src.slice(i, j); toks.push([KEYWORDS.has(w) ? 'kw' : 'name', w, line]); i = j; continue;
    }
    if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(src[i + 1]))) {
      const re = /0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?/y; re.lastIndex = i;
      const m = re.exec(src); const tt = m[0].replace(/_/g, '');
      let v;
      if (/^0[xX]/.test(tt)) v = parseInt(tt, 16); else if (/^0[bB]/.test(tt)) v = parseInt(tt.slice(2), 2); else v = parseFloat(tt);
      toks.push(['num', v, line]); i += m[0].length; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1; const buf = [];
      for (;;) {
        if (j >= n) err('unfinished string');
        const ch = src[j];
        if (ch === q) { j++; break; }
        if (ch === '\n') err('unfinished string');
        if (ch === '\\') {
          j++; const e = src[j] || '';
          if (Object.prototype.hasOwnProperty.call(ESC, e)) { buf.push(ESC[e]); if (e === '\n') line++; j++; }
          else if (e === 'z') { j++; while (j < n && ' \t\r\n'.includes(src[j])) { if (src[j] === '\n') line++; j++; } }
          else if (e === 'x') { buf.push(String.fromCharCode(parseInt(src.slice(j + 1, j + 3), 16))); j += 3; }
          else if (e === 'u') { const k = src.indexOf('}', j); buf.push(String.fromCodePoint(parseInt(src.slice(j + 2, k), 16))); j = k + 1; }
          else if (isDigit(e)) { let k = j; while (k < n && k < j + 3 && isDigit(src[k])) k++; buf.push(String.fromCharCode(parseInt(src.slice(j, k), 10))); j = k; }
          else err('bad escape');
        } else { buf.push(ch); j++; }
      }
      toks.push(['str', buf.join(''), line]); i = j; continue;
    }
    if (c === '`') {
      let j = i + 1; const parts = []; let buf = [];
      for (;;) {
        if (j >= n) err('unfinished interpolated string');
        const ch = src[j];
        if (ch === '`') { j++; break; }
        if (ch === '\\') { const e = src[j + 1] || ''; buf.push(Object.prototype.hasOwnProperty.call(ESC, e) ? ESC[e] : e); j += 2; continue; }
        if (ch === '{') {
          let depth = 1, k = j + 1;
          while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
          parts.push(['s', buf.join('')]); buf = []; parts.push(['e', src.slice(j + 1, k - 1)]); j = k; continue;
        }
        if (ch === '\n') line++;
        buf.push(ch); j++;
      }
      parts.push(['s', buf.join('')]);
      toks.push(['istr', parts, line]); i = j; continue;
    }
    if (c === '[') {
      const lb = longBracket(i);
      if (lb) {
        const close = ']' + '='.repeat(lb[0]) + ']', e = src.indexOf(close, lb[1]);
        if (e < 0) err('unfinished long string');
        let s = src.slice(lb[1], e);
        if (s.startsWith('\r\n')) s = s.slice(2); else if (s.startsWith('\n')) s = s.slice(1);
        toks.push(['str', s, line]); line += count(i, e); i = e + close.length; continue;
      }
    }
    if (OPS3.includes(src.slice(i, i + 3))) { toks.push(['op', src.slice(i, i + 3), line]); i += 3; continue; }
    if (OPS2.includes(src.slice(i, i + 2))) { toks.push(['op', src.slice(i, i + 2), line]); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.&|?~'.includes(c)) { toks.push(['op', c, line]); i++; continue; }
    err('unexpected character ' + JSON.stringify(c));
  }
  toks.push(['eof', null, line]);
  return toks;
}

/* ------------------------------------------------------------------ parser */
const BINPRI = { or: [1, 1], and: [2, 2], '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3], '..': [5, 4], '+': [6, 6], '-': [6, 6], '*': [7, 7], '/': [7, 7], '//': [7, 7], '%': [7, 7], '^': [10, 9] };
const UNARY_PRI = 8;
const COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^', '..=': '..', '//=': '//' };
const BLOCK_END = new Set(['end', 'else', 'elseif', 'until']);

class Parser {
  constructor(src, fname) { this.fname = fname || '?'; this.t = tokenize(src, this.fname); this.p = 0; }
  err(msg) { const t = this.t[Math.min(this.p, this.t.length - 1)]; throw new LuauSyntaxError(`${this.fname}:${t[2]}: ${msg} (near ${JSON.stringify(t[1])})`); }
  peek(k) { return this.t[Math.min(this.p + (k || 0), this.t.length - 1)]; }
  isOp(v, k) { const t = this.peek(k); return t[0] === 'op' && t[1] === v; }
  isKw(v, k) { const t = this.peek(k); return t[0] === 'kw' && t[1] === v; }
  acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  acceptKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
  expectOp(v) { if (!this.acceptOp(v)) this.err(`expected '${v}'`); }
  expectKw(v) { if (!this.acceptKw(v)) this.err(`expected '${v}'`); }
  name() { const t = this.peek(); if (t[0] !== 'name') this.err('expected name'); this.p++; return t[1]; }

  skipType() {
    if (!this.acceptOp('|')) this.acceptOp('&');
    this.skipSimpleType();
    while (this.isOp('|') || this.isOp('&') || this.isOp('?')) {
      const optional = this.isOp('?'); this.p++;
      if (optional) continue;
      this.skipSimpleType();
    }
  }
  skipGenericArgs() {
    let depth = 1;
    while (depth) {
      const t = this.peek();
      if (t[0] === 'eof') this.err('unfinished generic');
      if (t[0] === 'op') { if (t[1] === '<') depth++; else if (t[1] === '>') depth--; }
      this.p++;
    }
  }
  skipSimpleType() {
    const t = this.peek();
    if (t[0] === 'name') {
      if (t[1] === 'typeof' && this.isOp('(', 1)) { this.p += 2; this.expr(); this.expectOp(')'); return; }
      this.p++;
      while (this.acceptOp('.')) this.name();
      if (this.acceptOp('<')) this.skipGenericArgs();
      return;
    }
    if (t[0] === 'kw' && (t[1] === 'nil' || t[1] === 'true' || t[1] === 'false')) { this.p++; return; }
    if (t[0] === 'str') { this.p++; return; }
    if (t[0] === 'op' && t[1] === '{') {
      this.p++;
      while (!this.isOp('}')) {
        if (this.isOp('[')) { this.p++; this.skipType(); this.expectOp(']'); this.expectOp(':'); this.skipType(); }
        else if (this.peek()[0] === 'name' && this.isOp(':', 1)) { this.p += 2; this.skipType(); }
        else {
          if (this.peek()[0] === 'name' && (this.peek()[1] === 'read' || this.peek()[1] === 'write') && this.peek(1)[0] === 'name') this.p++;
          this.skipType();
        }
        if (!(this.acceptOp(',') || this.acceptOp(';'))) break;
      }
      this.expectOp('}'); return;
    }
    if (t[0] === 'op' && t[1] === '<') { this.p++; this.skipGenericArgs(); }
    if (this.isOp('(')) {
      this.p++;
      while (!this.isOp(')')) {
        if (this.isOp('...')) this.p++;
        if (this.peek()[0] === 'name' && this.isOp(':', 1)) this.p += 2;
        this.skipType();
        if (!this.acceptOp(',')) break;
      }
      this.expectOp(')');
      if (this.acceptOp('->')) this.skipType();
      return;
    }
    this.err('bad type');
  }

  expr(limit) {
    limit = limit || 0;
    const t = this.peek(); let left;
    if ((t[0] === 'kw' && t[1] === 'not') || (t[0] === 'op' && (t[1] === '-' || t[1] === '#'))) {
      this.p++; const a = this.expr(UNARY_PRI); left = ['un', t[1], a];
    } else left = this.simpleExp();
    for (;;) {
      const tk = this.peek();
      const op = (tk[0] === 'op' || tk[0] === 'kw') ? tk[1] : null;
      if (op !== null && Object.prototype.hasOwnProperty.call(BINPRI, op) && (tk[0] === 'op' || op === 'and' || op === 'or')) {
        const [lp, rp] = BINPRI[op];
        if (lp <= limit) break;
        this.p++; const right = this.expr(rp); left = ['bin', op, left, right];
      } else break;
    }
    return left;
  }
  simpleExp() { const e = this.simpleExpInner(); while (this.isOp('::')) { this.p++; this.skipType(); } return e; }
  simpleExpInner() {
    const t = this.peek(), k = t[0], v = t[1];
    if (k === 'num') { this.p++; return ['num', v]; }
    if (k === 'str') { this.p++; return this.suffixes(['str', v]); }
    if (k === 'istr') {
      this.p++; const parts = [];
      for (const [kind, txt] of v) parts.push(kind === 's' ? ['s', txt] : ['e', new Parser(txt, this.fname).expr()]);
      return ['istr', parts];
    }
    if (k === 'kw') {
      if (v === 'nil') { this.p++; return ['nil']; }
      if (v === 'true') { this.p++; return ['true']; }
      if (v === 'false') { this.p++; return ['false']; }
      if (v === 'function') { this.p++; return this.funcBody(); }
      if (v === 'if') {
        this.p++; const c = this.expr(); this.expectKw('then'); const a = this.expr(); let b;
        if (this.isKw('elseif')) { this.t[this.p] = ['kw', 'if', this.t[this.p][2]]; b = this.simpleExpInner(); }
        else { this.expectKw('else'); b = this.expr(); }
        return ['ifexp', c, a, b];
      }
    }
    if (k === 'op') {
      if (v === '...') { this.p++; return ['vararg']; }
      if (v === '{') return this.table();
    }
    return this.suffixes(this.primary());
  }
  primary() {
    const t = this.peek();
    if (t[0] === 'name') { this.p++; return ['name', t[1]]; }
    if (this.acceptOp('(')) { const e = this.expr(); this.expectOp(')'); return ['paren', e]; }
    this.err('unexpected symbol');
  }
  suffixes(e) {
    for (;;) {
      const t = this.peek();
      if (t[0] === 'op') {
        const v = t[1];
        if (v === '.') { this.p++; e = ['index', e, ['str', this.name()]]; continue; }
        if (v === '[') { this.p++; const k = this.expr(); this.expectOp(']'); e = ['index', e, k]; continue; }
        if (v === ':') { this.p++; const nm = this.name(); e = ['method', e, nm, this.callArgs()]; continue; }
        if (v === '(') { e = ['call', e, this.callArgs()]; continue; }
        if (v === '{') { e = ['call', e, [this.table()]]; continue; }
      } else if (t[0] === 'str') { this.p++; e = ['call', e, [['str', t[1]]]]; continue; }
      break;
    }
    return e;
  }
  callArgs() {
    const t = this.peek();
    if (t[0] === 'str') { this.p++; return [['str', t[1]]]; }
    if (t[0] === 'op' && t[1] === '{') return [this.table()];
    this.expectOp('(');
    const args = [];
    if (!this.isOp(')')) { args.push(this.expr()); while (this.acceptOp(',')) args.push(this.expr()); }
    this.expectOp(')');
    return args;
  }
  table() {
    this.expectOp('{'); const items = [];
    while (!this.isOp('}')) {
      if (this.isOp('[')) { this.p++; const k = this.expr(); this.expectOp(']'); this.expectOp('='); items.push(['named', k, this.expr()]); }
      else if (this.peek()[0] === 'name' && this.isOp('=', 1)) { const nm = this.name(); this.p++; items.push(['named', ['str', nm], this.expr()]); }
      else items.push(['pos', this.expr()]);
      if (!(this.acceptOp(',') || this.acceptOp(';'))) break;
    }
    this.expectOp('}');
    return ['table', items];
  }
  funcBody(isMethod, name) {
    if (this.acceptOp('<')) this.skipGenericArgs();
    this.expectOp('(');
    const params = isMethod ? ['self'] : []; let vararg = false;
    while (!this.isOp(')')) {
      if (this.acceptOp('...')) { vararg = true; if (this.acceptOp(':')) this.skipType(); break; }
      params.push(this.name());
      if (this.acceptOp(':')) this.skipType();
      if (!this.acceptOp(',')) break;
    }
    this.expectOp(')');
    if (this.acceptOp(':')) this.skipType();
    const body = this.block(); this.expectKw('end');
    return ['func', params, vararg, body, name || '?'];
  }
  block() {
    const stmts = [];
    for (;;) {
      const t = this.peek();
      if (t[0] === 'eof' || (t[0] === 'kw' && BLOCK_END.has(t[1]))) break;
      if (t[0] === 'kw' && t[1] === 'return') {
        this.p++; let exprs = []; const t2 = this.peek();
        if (!(t2[0] === 'eof' || (t2[0] === 'kw' && BLOCK_END.has(t2[1])) || this.isOp(';'))) exprs = this.exprlist();
        this.acceptOp(';'); stmts.push(['return', exprs, t[2]]); break;
      }
      const s = this.statement();
      if (s) stmts.push(s);
      this.acceptOp(';');
    }
    return stmts;
  }
  exprlist() { const es = [this.expr()]; while (this.acceptOp(',')) es.push(this.expr()); return es; }
  statement() {
    const t = this.peek(), line = t[2], k = t[0]; let v = t[1];
    if (k === 'kw') {
      if (v === 'local') {
        this.p++;
        if (this.acceptKw('function')) { const nm = this.name(); const f = this.funcBody(false, nm); return ['localfunc', nm, f, line]; }
        const names = [];
        for (;;) {
          names.push(this.name());
          if (this.acceptOp('<')) { this.name(); this.expectOp('>'); }
          if (this.acceptOp(':')) this.skipType();
          if (!this.acceptOp(',')) break;
        }
        const exprs = this.acceptOp('=') ? this.exprlist() : [];
        return ['local', names, exprs, line];
      }
      if (v === 'function') {
        this.p++; let target = ['name', this.name()], fname = target[1], isMethod = false;
        for (;;) {
          if (this.acceptOp('.')) { const nm = this.name(); target = ['index', target, ['str', nm]]; fname += '.' + nm; }
          else if (this.acceptOp(':')) { const nm = this.name(); target = ['index', target, ['str', nm]]; fname += ':' + nm; isMethod = true; break; }
          else break;
        }
        return ['assign', [target], [this.funcBody(isMethod, fname)], line];
      }
      if (v === 'if') {
        this.p++; const clauses = []; let c = this.expr(); this.expectKw('then'); clauses.push([c, this.block()]); let els = null;
        for (;;) {
          if (this.acceptKw('elseif')) { c = this.expr(); this.expectKw('then'); clauses.push([c, this.block()]); }
          else if (this.acceptKw('else')) { els = this.block(); break; }
          else break;
        }
        this.expectKw('end'); return ['if', clauses, els, line];
      }
      if (v === 'while') { this.p++; const c = this.expr(); this.expectKw('do'); const b = this.block(); this.expectKw('end'); return ['while', c, b, line]; }
      if (v === 'do') { this.p++; const b = this.block(); this.expectKw('end'); return ['do', b, line]; }
      if (v === 'repeat') { this.p++; const b = this.block(); this.expectKw('until'); return ['repeat', b, this.expr(), line]; }
      if (v === 'for') {
        this.p++; const n1 = this.name();
        if (this.acceptOp(':')) this.skipType();
        if (this.acceptOp('=')) {
          const a = this.expr(); this.expectOp(','); const b = this.expr(); const st = this.acceptOp(',') ? this.expr() : null;
          this.expectKw('do'); const body = this.block(); this.expectKw('end'); return ['fornum', n1, a, b, st, body, line];
        }
        const names = [n1];
        while (this.acceptOp(',')) { names.push(this.name()); if (this.acceptOp(':')) this.skipType(); }
        this.expectKw('in'); const es = this.exprlist(); this.expectKw('do'); const body = this.block(); this.expectKw('end');
        return ['forin', names, es, body, line];
      }
      if (v === 'break') { this.p++; return ['break', line]; }
    }
    if (k === 'name') {
      if (v === 'continue' && !(this.isOp('(', 1) || this.isOp('=', 1) || this.isOp('.', 1) || this.isOp(':', 1) || this.isOp('[', 1))) { this.p++; return ['continue', line]; }
      if (v === 'export' && this.peek(1)[0] === 'name' && this.peek(1)[1] === 'type') { this.p++; v = 'type'; }
      if (v === 'type' && this.peek(1)[0] === 'name' && (this.isOp('=', 2) || this.isOp('<', 2))) {
        this.p++; this.name(); if (this.acceptOp('<')) this.skipGenericArgs(); this.expectOp('='); this.skipType(); return null;
      }
    }
    const e = this.suffixes(this.primary());
    if (this.isOp('=') || this.isOp(',')) {
      const targets = [e];
      while (this.acceptOp(',')) targets.push(this.suffixes(this.primary()));
      this.expectOp('='); const exprs = this.exprlist();
      for (const tg of targets) if (tg[0] !== 'name' && tg[0] !== 'index') this.err('cannot assign');
      return ['assign', targets, exprs, line];
    }
    const t2 = this.peek();
    if (t2[0] === 'op' && Object.prototype.hasOwnProperty.call(COMPOUND, t2[1])) { this.p++; const rhs = this.expr(); return ['compound', COMPOUND[t2[1]], e, rhs, line]; }
    if (e[0] !== 'call' && e[0] !== 'method') this.err('syntax error');
    return ['callstmt', e, line];
  }
}
function parse(src, fname) {
  const p = new Parser(src, fname); const body = p.block();
  if (p.peek()[0] !== 'eof') p.err('unexpected token');
  return body;
}

/* ------------------------------------------------------------------ interpreter */
class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
  lookup(n) { let e = this; while (e) { if (e.vars.has(n)) return e; e = e.parent; } return null; }
}
const truthy = v => v !== null && v !== undefined && v !== false;
function luaType(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (v instanceof LTable) return 'table';
  if (v instanceof LFunction || v instanceof Builtin) return 'function';
  return 'userdata';
}
function tostr(v) {
  if (v === null || v === undefined) return 'nil';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(Number(v.toPrecision(14)));
  }
  if (typeof v === 'string') return v;
  return '<' + luaType(v) + '>';
}
function tonum(v) {
  if (typeof v === 'boolean') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return null;
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
  }
  return null;
}
const first = l => (l.length ? l[0] : null);
function num(x, name) { const v = tonum(x); if (v === null) throw new LuauRuntimeError('bad number argument to ' + (name || '?')); return v; }
const floorDiv = (a, b) => Math.floor(a / b);

class Interp {
  constructor(game, logger) {
    this.steps = 0; this.depth = 0; this.game = game || null; this.log = logger || (() => {}); this.curModule = null;
    this.MAX_STEPS = 3000000; this.MAX_DEPTH = 120;
    this.globals = new Env(); this.installGlobals();
  }
  installGlobals() {
    const G = this.globals.vars, I = this;
    const mk = obj => { const t = new LTable(); for (const k of Object.keys(obj)) { const v = obj[k]; t.d.set(k, typeof v === 'function' ? new Builtin(v, k) : v); } return t; };
    const mathlib = mk({
      floor: x => [Math.floor(num(x))], ceil: x => [Math.ceil(num(x))], round: x => [Math.floor(num(x) + 0.5)],
      abs: x => [Math.abs(num(x))], sqrt: x => [Math.sqrt(num(x))],
      min: (...a) => [Math.min(...a.map(x => num(x)))], max: (...a) => [Math.max(...a.map(x => num(x)))],
      clamp: (x, lo, hi) => [Math.max(num(lo), Math.min(num(hi), num(x)))], sign: x => [Math.sign(num(x))],
      pow: (x, y) => [Math.pow(num(x), num(y))], log: (x, b) => [b == null ? Math.log(num(x)) : Math.log(num(x)) / Math.log(num(b))],
      log10: x => [Math.log10(num(x))], exp: x => [Math.exp(num(x))], sin: x => [Math.sin(num(x))], cos: x => [Math.cos(num(x))], tan: x => [Math.tan(num(x))],
      rad: x => [num(x) * Math.PI / 180], deg: x => [num(x) * 180 / Math.PI], fmod: (x, y) => [num(x) % num(y)], randomseed: () => [],
    });
    mathlib.d.set('random', new Builtin(() => { throw new Unsupported('math.random'); }, 'random'));
    mathlib.d.set('pi', Math.PI); mathlib.d.set('huge', Infinity);
    G.set('math', mathlib);

    const tInsert = (t, a, ...rest) => {
      if (!(t instanceof LTable)) throw new LuauRuntimeError('table.insert: not a table');
      const n = t.length();
      if (rest.length) { const pos = Math.trunc(a); for (let i = n; i >= pos; i--) t.d.set(i + 1, t.d.get(i)); t.set(pos, rest[0]); }
      else t.set(n + 1, a);
      return [];
    };
    const tRemove = (t, pos) => {
      const n = t.length(); if (n === 0) return [null];
      pos = pos == null ? n : Math.trunc(pos); const v = t.d.has(pos) ? t.d.get(pos) : null;
      for (let i = pos; i < n; i++) t.d.set(i, t.d.get(i + 1));
      t.d.delete(n); return [v];
    };
    const tSort = (t, cmp) => {
      const n = t.length(); const items = []; for (let i = 1; i <= n; i++) items.push(t.d.get(i));
      if (cmp == null) items.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      else items.sort((x, y) => (truthy(first(I.call(cmp, [x, y]))) ? -1 : truthy(first(I.call(cmp, [y, x]))) ? 1 : 0));
      items.forEach((v, i) => t.d.set(i + 1, v)); return [];
    };
    const tUnpack = (t, i, j) => { const n = j == null ? t.length() : j; const out = []; for (let k = (i == null ? 1 : i); k <= n; k++) out.push(t.d.has(k) ? t.d.get(k) : null); return out; };
    G.set('table', mk({
      insert: tInsert, remove: tRemove, sort: tSort, unpack: tUnpack,
      concat: (t, sep, i, j) => { const n = j == null ? t.length() : j; const out = []; for (let k = (i == null ? 1 : i); k <= n; k++) out.push(tostr(t.d.get(k))); return [out.join(sep || '')]; },
      clone: t => { const c = new LTable(); c.d = new Map(t.d); c.meta = t.meta; return [c]; },
      freeze: t => [t],
      find: (t, v, init) => { for (let k = (init == null ? 1 : init); k <= t.length(); k++) if (t.d.get(k) === v) return [k]; return [null]; },
    }));
    G.set('unpack', G.get('table').d.get('unpack'));

    const sFormat = (fmt, ...args) => {
      let idx = 0;
      return [tostr(fmt).replace(/%([-+ #0]*)(\d*)(?:\.(\d+))?([a-zA-Z%])/g, (m, flags, width, prec, c) => {
        if (c === '%') return '%';
        const a = args[idx++]; let out;
        if (c === 'd' || c === 'i') out = String(Math.trunc(num(a)));
        else if (c === 'f') out = num(a).toFixed(prec == null ? 6 : +prec);
        else if (c === 'e' || c === 'E') out = num(a).toExponential(prec == null ? 6 : +prec);
        else if (c === 'g' || c === 'G') out = String(Number(num(a).toPrecision(prec == null ? 6 : (+prec || 1))));
        else if (c === 'x') out = Math.trunc(num(a)).toString(16); else if (c === 'X') out = Math.trunc(num(a)).toString(16).toUpperCase();
        else if (c === 'o') out = Math.trunc(num(a)).toString(8);
        else if (c === 's') out = tostr(a);
        else return m;
        if (width) out = flags.includes('-') ? out.padEnd(+width) : out.padStart(+width, flags.includes('0') && c !== 's' ? '0' : ' ');
        return out;
      })];
    };
    const sSub = (s, i, j) => {
      s = tostr(s); const n = s.length; i = i == null ? 1 : Math.trunc(i); j = j == null ? -1 : Math.trunc(j);
      if (i < 0) i = Math.max(n + i + 1, 1); if (i === 0) i = 1; if (j < 0) j = n + j + 1;
      return [s.slice(i - 1, j)];
    };
    G.set('string', mk({
      format: sFormat, sub: sSub, rep: (s, n, sep) => [new Array(Math.max(Math.trunc(n || 0), 0)).fill(tostr(s)).join(sep || '')],
      upper: s => [tostr(s).toUpperCase()], lower: s => [tostr(s).toLowerCase()], len: s => [tostr(s).length], reverse: s => [[...tostr(s)].reverse().join('')],
    }));
    const B = (fn, name) => new Builtin(fn, name);
    G.set('ipairs', B(t => { if (!(t instanceof LTable)) throw new LuauRuntimeError('ipairs: not a table'); return [['iter', 'ipairs', t], t, 0]; }, 'ipairs'));
    G.set('pairs', B(t => { if (!(t instanceof LTable)) throw new LuauRuntimeError('pairs: not a table'); return [['iter', 'pairs', t], t, null]; }, 'pairs'));
    G.set('pcall', B((f, ...args) => { try { return [true, ...I.call(f, args)]; } catch (e) { if (e instanceof StepLimit) throw e; if (e instanceof LuauError) return [false, e.message]; throw e; } }, 'pcall'));
    G.set('error', B(m => { throw new LuauRuntimeError(tostr(m)); }, 'error'));
    G.set('assert', B((v, m) => { if (!truthy(v)) throw new LuauRuntimeError(m != null ? tostr(m) : 'assertion failed!'); return [v]; }, 'assert'));
    G.set('setmetatable', B((t, mt) => { t.meta = mt; return [t]; }, 'setmetatable'));
    G.set('getmetatable', B(t => [t instanceof LTable ? t.meta : null], 'getmetatable'));
    G.set('select', B((n, ...a) => { if (n === '#') return [a.length]; n = Math.trunc(n); return n > 0 ? a.slice(n - 1) : a.slice(n); }, 'select'));
    G.set('type', B(v => [luaType(v)], 'type'));
    G.set('typeof', B(v => [v instanceof Struct ? v.kind : v instanceof InstNode ? 'Instance' : luaType(v)], 'typeof'));
    G.set('tostring', B(v => [tostr(v)], 'tostring'));
    G.set('tonumber', B((v, base) => { if (base) { const r = parseInt(tostr(v), Math.trunc(base)); return [Number.isNaN(r) ? null : r]; } return [tonum(v)]; }, 'tonumber'));
    G.set('rawget', B((t, k) => [t.d.has(k) ? t.d.get(k) : null], 'rawget'));
    G.set('print', B(() => [], 'print')); G.set('warn', B(() => [], 'warn'));
    G.set('require', B(m => [I.require(m)], 'require'));
    G.set('os', mk({ time: () => [0], clock: () => [0] }));
    G.set('Color3', mk({
      fromRGB: (r, g, b) => [new Struct('Color3', { r: num(r || 0), g: num(g || 0), b: num(b || 0) })],
      new: (r, g, b) => [new Struct('Color3', { r: Math.floor(num(r || 0) * 255 + 0.5), g: Math.floor(num(g || 0) * 255 + 0.5), b: Math.floor(num(b || 0) * 255 + 0.5) })],
      fromHex: h => { h = tostr(h).replace(/^#/, ''); return [new Struct('Color3', { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) })]; },
    }));
    const v3 = mk({ new: (x, y, z) => [new Struct('Vector3', { x: num(x || 0), y: num(y || 0), z: num(z || 0) })] });
    v3.d.set('zero', new Struct('Vector3', { x: 0, y: 0, z: 0 })); G.set('Vector3', v3);
    G.set('Vector2', mk({ new: (x, y) => [new Struct('Vector2', { x: num(x || 0), y: num(y || 0) })] }));
    G.set('Enum', new EnumPath('Enum')); G.set('game', this.game);
    for (const nm of ['Random', 'Instance', 'task', 'workspace', 'CFrame', 'UDim2', 'UDim', 'TweenInfo', 'Ray', 'Region3', 'BrickColor', 'NumberSequence', 'ColorSequence', 'Rect', 'DateTime', 'RunService', 'Players', 'HttpService', 'DataStoreService', 'MarketplaceService', 'Debris', 'TweenService', 'ReplicatedStorage', 'ServerScriptService', 'StarterGui', 'Workspace', 'Lighting', 'coroutine', 'utf8', 'buffer', 'debug', 'shared', 'plugin', 'settings', 'tick', 'time', 'wait', 'spawn', 'delay'])
      if (!G.has(nm)) G.set(nm, new RobloxApi(nm));
  }
  orderedKeys(t) {
    const arr = []; let n = 1; while (t.d.has(n)) { arr.push(n); n++; }
    const rest = []; for (const k of t.d.keys()) if (!(typeof k === 'number' && Number.isInteger(k) && k >= 1 && k < n)) rest.push(k);
    return arr.concat(rest);
  }
  require(m) {
    if (!(m instanceof InstNode)) throw new Unsupported('require of non-instance');
    if (m.cls !== 'ModuleScript' || m.source === null) throw new Unsupported('require of ' + m.fullName());
    return this.loadModule(m);
  }
  loadModule(node) {
    if (node.state === 2) return node.value;
    if (node.state === 1) throw new LuauRuntimeError('cyclic require: ' + node.fullName());
    node.state = 1;
    try { node.value = this.runModule(node); } finally { node.state = 2; }
    return node.value;
  }
  runModule(node) {
    let ast;
    try { ast = parse(node.source, node.path || node.name); }
    catch (e) { if (e instanceof LuauSyntaxError) { this.log(`${node.name}: синтаксическая ошибка: ${e.message}`); throw new LuauRuntimeError('syntax error in ' + node.name); } throw e; }
    const env = new Env(this.globals); env.vars.set('script', node);
    const prev = this.curModule; this.curModule = node; let ret = null;
    try {
      for (const st of ast) {
        let sig;
        try { sig = this.execStmt(st, env); }
        catch (e) {
          if (e instanceof StepLimit) { this.log(`${node.name}: превышен лимит шагов, остальной код пропущен`); break; }
          if (e instanceof Unsupported) { this.log(`${node.name}:${st[st.length - 1]} пропущено (Roblox API: ${e.message})`); continue; }
          if (e instanceof LuauRuntimeError) { this.log(`${node.name}:${st[st.length - 1]} ошибка выполнения: ${e.message}`); continue; }
          if (e instanceof RangeError) { this.log(`${node.name}: слишком глубокая рекурсия`); continue; }
          throw e;
        }
        if (sig && sig[0] === 'return') { ret = sig[1].length ? sig[1][0] : null; break; }
      }
    } finally { this.curModule = prev; }
    return ret;
  }
  tick() { if (++this.steps > this.MAX_STEPS) throw new StepLimit(); }
  execBlock(body, env) { for (const st of body) { const sig = this.execStmt(st, env); if (sig) return sig; } return null; }
  loopBody(body, env) {
    const sig = this.execBlock(body, env);
    if (sig) { if (sig[0] === 'break') return [true, null]; if (sig[0] === 'return') return [true, sig]; }
    return [false, null];
  }
  execStmt(st, env) {
    this.tick(); const k = st[0];
    switch (k) {
      case 'local': { const vals = this.evalList(st[2], env, st[1].length); st[1].forEach((n, i) => env.vars.set(n, vals[i])); return null; }
      case 'assign': { const vals = this.evalList(st[2], env, st[1].length); st[1].forEach((tg, i) => this.assign(tg, vals[i], env)); return null; }
      case 'compound': { const cur = this.evalx(st[2], env); this.assign(st[2], this.binop(st[1], cur, this.evalx(st[3], env)), env); return null; }
      case 'callstmt': this.evalMulti(st[1], env); return null;
      case 'localfunc': env.vars.set(st[1], new LFunction(st[2][1], st[2][2], st[2][3], env, st[1])); return null;
      case 'return': return ['return', this.evalMultiList(st[1], env)];
      case 'if':
        for (const [cond, body] of st[1]) if (truthy(this.evalx(cond, env))) return this.execBlock(body, new Env(env));
        return st[2] !== null ? this.execBlock(st[2], new Env(env)) : null;
      case 'do': return this.execBlock(st[1], new Env(env));
      case 'while':
        while (truthy(this.evalx(st[1], env))) { this.tick(); const [stop, sig] = this.loopBody(st[2], new Env(env)); if (stop) return sig; }
        return null;
      case 'repeat':
        for (;;) { this.tick(); const e2 = new Env(env); const [stop, sig] = this.loopBody(st[1], e2); if (stop) return sig; if (truthy(this.evalx(st[2], e2))) break; }
        return null;
      case 'fornum': {
        const a = tonum(this.evalx(st[2], env)), b = tonum(this.evalx(st[3], env)), s = st[4] !== null ? tonum(this.evalx(st[4], env)) : 1;
        if (a === null || b === null || s === null || s === 0) throw new LuauRuntimeError("'for' limits must be numbers");
        for (let i = a; (s > 0 && i <= b) || (s < 0 && i >= b); i += s) {
          this.tick(); const e2 = new Env(env); e2.vars.set(st[1], i);
          const [stop, sig] = this.loopBody(st[5], e2); if (stop) return sig;
        }
        return null;
      }
      case 'forin': {
        let vals = this.evalMultiList(st[2], env); let f = vals.length ? vals[0] : null; const names = st[1];
        if (f instanceof LTable) { const t = f; f = ['iter', 'pairs', t]; vals = [null, t, null]; }
        if (Array.isArray(f) && f[0] === 'iter') {
          const t = f[2]; let seq;
          if (f[1] === 'ipairs') { seq = []; let i = 1; while (t.d.has(i)) { seq.push([i, t.d.get(i)]); i++; } }
          else seq = this.orderedKeys(t).map(kk => [kk, t.d.get(kk)]);
          for (const kv of seq) {
            this.tick(); const e2 = new Env(env);
            names.forEach((n, idx) => e2.vars.set(n, idx < 2 ? kv[idx] : null));
            const [stop, sig] = this.loopBody(st[3], e2); if (stop) return sig;
          }
          return null;
        }
        const state = vals.length > 1 ? vals[1] : null; let ctl = vals.length > 2 ? vals[2] : null;
        for (;;) {
          this.tick(); const rs = this.call(f, [state, ctl]);
          if (!rs.length || rs[0] === null) break;
          ctl = rs[0]; const e2 = new Env(env);
          names.forEach((n, idx) => e2.vars.set(n, idx < rs.length ? rs[idx] : null));
          const [stop, sig] = this.loopBody(st[3], e2); if (stop) return sig;
        }
        return null;
      }
      case 'break': return ['break'];
      case 'continue': return ['continue'];
    }
    throw new LuauRuntimeError('unknown statement ' + k);
  }
  assign(tg, v, env) {
    if (tg[0] === 'name') { const e = env.lookup(tg[1]); if (e === null) this.globals.vars.set(tg[1], v); else e.vars.set(tg[1], v); return; }
    const obj = this.evalx(tg[1], env), key = this.evalx(tg[2], env);
    if (obj instanceof LTable) obj.set(key, v);
    else if (obj instanceof InstNode) obj.attrs.set(key, v);
    else throw new Unsupported('assign to field of ' + luaType(obj));
  }
  evalList(exprs, env, want) {
    const vals = this.evalMultiList(exprs, env);
    while (vals.length < want) vals.push(null);
    return vals.slice(0, want);
  }
  evalMultiList(exprs, env) {
    const out = [];
    exprs.forEach((e, i) => { if (i === exprs.length - 1) out.push(...this.evalMulti(e, env)); else out.push(this.evalx(e, env)); });
    return out;
  }
  evalMulti(e, env) {
    const k = e[0];
    if (k === 'call') { const fn = this.evalx(e[1], env); return this.call(fn, this.evalMultiList(e[2], env)); }
    if (k === 'method') { const obj = this.evalx(e[1], env); return this.callMethod(obj, e[2], this.evalMultiList(e[3], env)); }
    if (k === 'vararg') { const va = env.lookup('...'); return va ? va.vars.get('...').slice() : []; }
    return [this.evalx(e, env)];
  }
  evalx(e, env) {
    this.tick(); const k = e[0];
    switch (k) {
      case 'num': case 'str': return e[1];
      case 'name': { const en = env.lookup(e[1]); return en ? en.vars.get(e[1]) : null; }
      case 'index': return this.index(this.evalx(e[1], env), this.evalx(e[2], env));
      case 'call': case 'method': case 'vararg': { const r = this.evalMulti(e, env); return r.length ? r[0] : null; }
      case 'bin': {
        const op = e[1];
        if (op === 'and') { const a = this.evalx(e[2], env); return truthy(a) ? this.evalx(e[3], env) : a; }
        if (op === 'or') { const a = this.evalx(e[2], env); return truthy(a) ? a : this.evalx(e[3], env); }
        return this.binop(op, this.evalx(e[2], env), this.evalx(e[3], env));
      }
      case 'un': {
        const v = this.evalx(e[2], env);
        if (e[1] === 'not') return !truthy(v);
        if (e[1] === '-') { const n = tonum(v); if (n === null || typeof v === 'boolean') throw new LuauRuntimeError('attempt to negate non-number'); return -n; }
        if (typeof v === 'string') return v.length;
        if (v instanceof LTable) return v.length();
        throw new LuauRuntimeError('attempt to get length of ' + luaType(v));
      }
      case 'true': return true; case 'false': return false; case 'nil': return null;
      case 'paren': return this.evalx(e[1], env);
      case 'table': return this.makeTable(e, env);
      case 'func': return new LFunction(e[1], e[2], e[3], env, e[4]);
      case 'ifexp': return truthy(this.evalx(e[1], env)) ? this.evalx(e[2], env) : this.evalx(e[3], env);
      case 'istr': return e[1].map(([kind, p]) => (kind === 's' ? p : tostr(this.evalx(p, env)))).join('');
    }
    throw new LuauRuntimeError('unknown expression ' + k);
  }
  makeTable(e, env) {
    const t = new LTable(), items = e[1]; let pos = 1;
    items.forEach((it, i) => {
      try {
        if (it[0] === 'pos') {
          if (i === items.length - 1) { for (const v of this.evalMulti(it[1], env)) { if (v !== null) t.d.set(pos, v); pos++; } }
          else { const v = this.evalx(it[1], env); if (v !== null) t.d.set(pos, v); pos++; }
        } else t.set(this.evalx(it[1], env), this.evalx(it[2], env));
      } catch (ex) {
        if (!(ex instanceof Unsupported)) throw ex;
        this.log(`${this.curModule ? this.curModule.name : '?'}: поле таблицы пропущено (Roblox API: ${ex.message})`);
        if (it[0] === 'pos') pos++;
      }
    });
    return t;
  }
  index(obj, key) {
    if (obj instanceof LTable) return obj.get(key);
    if (obj instanceof EnumPath) return new EnumPath(obj.path + '.' + tostr(key));
    if (obj instanceof Struct) { const kk = tostr(key); if (kk in obj.f) return obj.f[kk]; const l = kk.toLowerCase(); return l in obj.f ? obj.f[l] : null; }
    if (obj instanceof InstNode) {
      if (key === 'Parent') return obj.parent; if (key === 'Name') return obj.name; if (key === 'ClassName') return obj.cls;
      if (obj.children.has(key)) return obj.children.get(key);
      throw new Unsupported(`${obj.fullName() || obj.name}.${key}`);
    }
    if (typeof obj === 'string') { const f = this.globals.vars.get('string').d.get(key); return f === undefined ? null : f; }
    if (obj instanceof RobloxApi) throw new Unsupported(obj.name);
    if (obj === null || obj === undefined) throw new LuauRuntimeError(`attempt to index nil with '${tostr(key)}'`);
    throw new Unsupported('index of ' + luaType(obj));
  }
  eq(a, b) {
    if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
    if (a === undefined) a = null; if (b === undefined) b = null;
    return a === b;
  }
  binop(op, a, b) {
    if (op === '==') return this.eq(a, b);
    if (op === '~=') return !this.eq(a, b);
    if (op === '..') {
      const ok = x => (typeof x === 'string' || typeof x === 'number');
      if (ok(a) && ok(b)) return tostr(a) + tostr(b);
      throw new LuauRuntimeError('attempt to concatenate');
    }
    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
      if (!(typeof a === 'string' && typeof b === 'string')) {
        a = typeof a === 'string' ? null : tonum(a); b = typeof b === 'string' ? null : tonum(b);
        if (a === null || b === null) throw new LuauRuntimeError('attempt to compare');
      }
      return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    }
    const x = tonum(a), y = tonum(b);
    if (x === null || y === null || typeof a === 'boolean' || typeof b === 'boolean') throw new LuauRuntimeError('attempt to perform arithmetic on non-number');
    switch (op) {
      case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y;
      case '//': return floorDiv(x, y);
      case '%': return y === 0 ? NaN : x - Math.floor(x / y) * y;
      case '^': return Math.pow(x, y);
    }
    throw new LuauRuntimeError('bad operator ' + op);
  }
  call(fn, args) {
    this.tick();
    if (fn instanceof Builtin) { const r = fn.fn(...args); return Array.isArray(r) ? r : (r === undefined || r === null ? [] : [r]); }
    if (fn instanceof LFunction) {
      const env = new Env(fn.env);
      fn.params.forEach((p, i) => env.vars.set(p, i < args.length ? args[i] : null));
      if (fn.vararg) env.vars.set('...', args.slice(fn.params.length));
      if (++this.depth > this.MAX_DEPTH) { this.depth--; throw new LuauRuntimeError('stack overflow'); }
      let sig; try { sig = this.execBlock(fn.body, env); } finally { this.depth--; }
      return sig && sig[0] === 'return' ? sig[1] : [];
    }
    if (fn === null || fn === undefined) throw new LuauRuntimeError('attempt to call a nil value');
    if (fn instanceof RobloxApi) throw new Unsupported(fn.name);
    throw new Unsupported('call of ' + luaType(fn));
  }
  callMethod(obj, name, args) {
    if (typeof obj === 'string') {
      const fn = this.globals.vars.get('string').d.get(name);
      if (fn === undefined) throw new Unsupported('string:' + name);
      return this.call(fn, [obj, ...args]);
    }
    if (obj instanceof LTable) return this.call(obj.get(name), [obj, ...args]);
    if (obj instanceof InstNode) {
      if (name === 'GetService') { const nm = args.length ? tostr(args[0]) : ''; if (!obj.children.has(nm)) obj.add(new InstNode(nm, 'Service')); return [obj.children.get(nm)]; }
      if (name === 'WaitForChild' || name === 'FindFirstChild') {
        const ch = obj.children.get(args.length ? tostr(args[0]) : '');
        if (ch === undefined && name === 'WaitForChild') throw new Unsupported('WaitForChild ' + (args[0] || ''));
        return [ch === undefined ? null : ch];
      }
      if (name === 'GetAttribute') return [obj.attrs.has(args[0]) ? obj.attrs.get(args[0]) : null];
      throw new Unsupported('Instance:' + name);
    }
    if (obj instanceof RobloxApi) throw new Unsupported(`${obj.name}:${name}`);
    throw new Unsupported(`method ${name} on ${luaType(obj)}`);
  }
}

function toJson(v, depth, seen) {
  depth = depth || 0; seen = seen || new Set();
  if (depth > 24) return null;
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Struct) {
    if (v.kind === 'Color3') return '#' + ['r', 'g', 'b'].map(c => Math.max(0, Math.min(255, Math.round(v.f[c]))).toString(16).padStart(2, '0')).join('');
    return Object.assign({}, v.f);
  }
  if (v instanceof EnumPath) return v.path;
  if (v instanceof LTable) {
    if (seen.has(v)) return null;
    const s2 = new Set(seen); s2.add(v);
    const n = v.length();
    if (n && n === v.d.size) { const out = []; for (let i = 1; i <= n; i++) out.push(toJson(v.d.get(i), depth + 1, s2)); return out; }
    const out = {};
    for (const [k, val] of v.d) { if (val instanceof LFunction || val instanceof Builtin || val instanceof InstNode) continue; out[String(k)] = toJson(val, depth + 1, s2); }
    return out;
  }
  return null;
}

return { LuauError, LuauSyntaxError, LuauRuntimeError, Unsupported, StepLimit, LTable, Struct, EnumPath, InstNode, LFunction, Builtin, Interp, parse, tokenize, toJson, tostr };
});
