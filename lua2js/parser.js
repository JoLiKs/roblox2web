'use strict';
const { tokenize, LuauSyntaxError, utf8enc } = require('./lexer');

const BINPRI = { or: [1, 1], and: [2, 2], '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3], '..': [5, 4], '+': [6, 6], '-': [6, 6], '*': [7, 7], '/': [7, 7], '//': [7, 7], '%': [7, 7], '^': [10, 9] };
const UNARY_PRI = 8;
const COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^', '..=': '..', '//=': '//' };
const BLOCK_END = new Set(['end', 'else', 'elseif', 'until']);

class Parser {
  constructor(toks, fname) { this.t = toks; this.p = 0; this.fname = fname; }
  err(msg, tok) {
    const t = tok || this.t[Math.min(this.p, this.t.length - 1)];
    throw new LuauSyntaxError(`${this.fname}:${t.line}: ${msg}${t.k === 'eof' ? ' near <eof>' : ' near \'' + (typeof t.v === 'string' ? t.v : String(t.v)) + '\''}`, t.line);
  }
  peek(k) { return this.t[Math.min(this.p + (k || 0), this.t.length - 1)]; }
  isOp(v, k) { const t = this.peek(k); return t.k === 'op' && t.v === v; }
  isKw(v, k) { const t = this.peek(k); return t.k === 'kw' && t.v === v; }
  acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  acceptKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
  expectOp(v) { if (!this.acceptOp(v)) this.err(`expected '${v}'`); }
  expectKw(v, openTok) {
    if (!this.acceptKw(v)) {
      if (openTok && openTok.line !== this.peek().line) this.err(`expected '${v}' (to close '${openTok.v}' at line ${openTok.line})`);
      this.err(`expected '${v}'`);
    }
  }
  name() { const t = this.peek(); if (t.k !== 'name') this.err('expected identifier'); this.p++; return t.v; }

  /* ---------- types (parsed and discarded) ---------- */
  skipType() {
    if (this.isOp('|') || this.isOp('&')) this.p++;
    this.skipSimpleType();
    for (;;) {
      if (this.isOp('?')) { this.p++; continue; }
      if (this.isOp('|') || this.isOp('&')) { this.p++; this.skipSimpleType(); continue; }
      break;
    }
  }
  skipGenericList() { // after '<'
    let depth = 1;
    while (depth) {
      const t = this.peek();
      if (t.k === 'eof') this.err('unfinished generic');
      if (t.k === 'op') {
        if (t.v === '<') depth++; else if (t.v === '>') depth--;
        else if (t.v === '->') { /* fine */ }
      }
      this.p++;
    }
  }
  skipTypeList() { // inside (...) of function type or pack
    while (!this.isOp(')')) {
      if (this.peek().k === 'name' && this.isOp(':', 1)) this.p += 2;
      if (this.isOp('...')) this.p++;
      this.skipType();
      if (this.isOp('...')) this.p++;
      if (!this.acceptOp(',')) break;
    }
    this.expectOp(')');
  }
  skipSimpleType() {
    const t = this.peek();
    if (t.k === 'name') {
      if (t.v === 'typeof' && this.isOp('(', 1)) { this.p += 2; this.expr(); this.expectOp(')'); return; }
      this.p++;
      while (this.isOp('.') && this.peek(1).k === 'name') { this.p += 2; }
      if (this.isOp('<')) { this.p++; this.skipGenericList(); }
      if (this.isOp('...')) this.p++;
      return;
    }
    if (t.k === 'kw' && (t.v === 'nil' || t.v === 'true' || t.v === 'false')) { this.p++; return; }
    if (t.k === 'str') { this.p++; return; }
    if (t.k === 'op' && t.v === '{') {
      this.p++;
      while (!this.isOp('}')) {
        if (this.isOp('[')) { this.p++; this.skipType(); this.expectOp(']'); this.expectOp(':'); this.skipType(); }
        else if (this.peek().k === 'name' && this.isOp(':', 1)) { this.p += 2; this.skipType(); }
        else if (this.peek().k === 'name' && (this.peek().v === 'read' || this.peek().v === 'write') && this.peek(1).k === 'name' && this.isOp(':', 2)) { this.p += 3; this.skipType(); }
        else this.skipType();
        if (!(this.acceptOp(',') || this.acceptOp(';'))) break;
      }
      this.expectOp('}'); return;
    }
    if (t.k === 'op' && (t.v === '<' || t.v === '(')) {
      if (t.v === '<') { this.p++; this.skipGenericList(); }
      this.expectOp('(');
      this.skipTypeList();
      if (this.acceptOp('->')) this.skipReturnType();
      return;
    }
    this.err('malformed type annotation');
  }
  skipReturnType() {
    if (this.isOp('(') ) {
      // could be a pack "(A, B)" or start of function type "(A) -> B"; skipSimpleType handles both
      this.skipType(); return;
    }
    this.skipType();
  }

  /* ---------- expressions ---------- */
  expr(limit) {
    limit = limit || 0;
    const t = this.peek(); let left;
    if ((t.k === 'kw' && t.v === 'not') || (t.k === 'op' && (t.v === '-' || t.v === '#'))) {
      this.p++; const a = this.expr(UNARY_PRI);
      left = { type: 'Unop', op: t.v, e: a, line: t.line };
    } else left = this.simpleExp();
    for (;;) {
      const tk = this.peek();
      const op = (tk.k === 'op' || (tk.k === 'kw' && (tk.v === 'and' || tk.v === 'or'))) ? tk.v : null;
      if (op !== null && Object.prototype.hasOwnProperty.call(BINPRI, op)) {
        const [lp, rp] = BINPRI[op];
        if (lp <= limit) break;
        this.p++; const right = this.expr(rp);
        left = { type: 'Binop', op, l: left, r: right, line: tk.line };
      } else break;
    }
    return left;
  }
  simpleExp() {
    let e = this.simpleExpInner();
    while (this.isOp('::')) { this.p++; this.skipType(); }
    return e;
  }
  simpleExpInner() {
    const t = this.peek(), k = t.k, v = t.v, line = t.line;
    if (k === 'num') { this.p++; return { type: 'Num', v, line }; }
    if (k === 'str') { this.p++; return this.suffixes({ type: 'Str', v, line }, true); }
    if (k === 'istr') {
      this.p++; const parts = [];
      for (const part of v) {
        if (typeof part === 'string') parts.push(part);
        else { const sp = new Parser(part, this.fname); const e = sp.expr(); if (sp.peek().k !== 'eof') sp.err('malformed interpolated expression'); parts.push(e); }
      }
      return { type: 'Interp', parts, line };
    }
    if (k === 'kw') {
      if (v === 'nil') { this.p++; return { type: 'Nil', line }; }
      if (v === 'true') { this.p++; return { type: 'True', line }; }
      if (v === 'false') { this.p++; return { type: 'False', line }; }
      if (v === 'function') { this.p++; return this.funcBody(false, null, line); }
      if (v === 'if') {
        this.p++; const c = this.expr(); this.expectKw('then'); const a = this.expr(); let b;
        if (this.isKw('elseif')) { this.t[this.p] = { k: 'kw', v: 'if', line: this.t[this.p].line }; b = this.simpleExpInner(); }
        else { this.expectKw('else'); b = this.expr(); }
        return { type: 'IfExp', c, a, b, line };
      }
    }
    if (k === 'op') {
      if (v === '...') { this.p++; return { type: 'Vararg', line }; }
      if (v === '{') return this.table();
      if (v === '@') { this.skipAttributes(); return this.simpleExpInner(); }
    }
    return this.suffixes(this.primary());
  }
  skipAttributes() {
    while (this.isOp('@')) { this.p++; if (this.peek().k === 'name') this.p++; else if (this.acceptOp('[')) { while (!this.isOp(']')) this.p++; this.p++; } }
  }
  primary() {
    const t = this.peek();
    if (t.k === 'name') { this.p++; return { type: 'Name', name: t.v, line: t.line }; }
    if (this.isOp('(')) { this.p++; const e = this.expr(); this.expectOp(')'); return { type: 'Paren', e, line: t.line }; }
    this.err('unexpected symbol');
  }
  suffixes(e, afterStr) {
    for (;;) {
      const t = this.peek();
      if (t.k === 'op') {
        const v = t.v;
        if (v === '.') { this.p++; const nm = this.name(); e = { type: 'Index', obj: e, key: { type: 'Str', v: nm, line: t.line }, dot: true, line: t.line }; continue; }
        if (v === '[') { this.p++; const key = this.expr(); this.expectOp(']'); e = { type: 'Index', obj: e, key, line: t.line }; continue; }
        if (v === ':') { this.p++; const nm = this.name(); const args = this.callArgs(); e = { type: 'Method', obj: e, name: nm, args, line: t.line }; continue; }
        if (v === '(') {
          if (this.t[this.p - 1] && this.t[this.p - 1].line !== t.line && e.type !== 'Paren') { /* ambiguous syntax in Lua 5.1; Luau accepts */ }
          e = { type: 'Call', fn: e, args: this.callArgs(), line: t.line }; continue;
        }
        if (v === '{') { e = { type: 'Call', fn: e, args: [this.table()], line: t.line }; continue; }
      } else if (t.k === 'str') { this.p++; e = { type: 'Call', fn: e, args: [{ type: 'Str', v: t.v, line: t.line }], line: t.line }; continue; }
      else if (t.k === 'istr' && false) { break; }
      break;
    }
    return e;
  }
  callArgs() {
    const t = this.peek();
    if (t.k === 'str') { this.p++; return [{ type: 'Str', v: t.v, line: t.line }]; }
    if (t.k === 'op' && t.v === '{') return [this.table()];
    this.expectOp('(');
    const args = [];
    if (!this.isOp(')')) { args.push(this.expr()); while (this.acceptOp(',')) args.push(this.expr()); }
    this.expectOp(')');
    return args;
  }
  table() {
    const open = this.peek(); this.expectOp('{'); const items = [];
    while (!this.isOp('}')) {
      if (this.isOp('[')) { this.p++; const k = this.expr(); this.expectOp(']'); this.expectOp('='); items.push({ kind: 'kv', k, v: this.expr() }); }
      else if (this.peek().k === 'name' && this.isOp('=', 1)) { const t = this.peek(); this.p += 2; items.push({ kind: 'kv', k: { type: 'Str', v: t.v, line: t.line }, v: this.expr() }); }
      else items.push({ kind: 'pos', v: this.expr() });
      if (!(this.acceptOp(',') || this.acceptOp(';'))) break;
    }
    this.expectOp('}');
    return { type: 'Table', items, line: open.line };
  }
  funcBody(isMethod, name, line) {
    if (this.isOp('<')) { this.p++; this.skipGenericList(); }
    this.expectOp('(');
    const params = isMethod ? ['self'] : []; let vararg = false;
    while (!this.isOp(')')) {
      if (this.acceptOp('...')) { vararg = true; if (this.acceptOp(':')) this.skipType(); break; }
      params.push(this.name());
      if (this.acceptOp(':')) this.skipType();
      if (!this.acceptOp(',')) break;
    }
    this.expectOp(')');
    if (this.acceptOp(':')) this.skipReturnType();
    const body = this.block(); const endTok = this.peek(); this.expectKw('end');
    return { type: 'Func', params, vararg, body, name: name || null, line, endLine: endTok.line };
  }

  /* ---------- statements ---------- */
  block() {
    const stmts = [];
    for (;;) {
      const t = this.peek();
      if (t.k === 'eof' || (t.k === 'kw' && BLOCK_END.has(t.v))) break;
      if (t.k === 'kw' && t.v === 'return') {
        this.p++; let exprs = []; const t2 = this.peek();
        if (!(t2.k === 'eof' || (t2.k === 'kw' && BLOCK_END.has(t2.v)) || this.isOp(';'))) exprs = this.exprlist();
        this.acceptOp(';'); stmts.push({ type: 'Return', exprs, line: t.line });
        const t3 = this.peek();
        if (!(t3.k === 'eof' || (t3.k === 'kw' && BLOCK_END.has(t3.v)))) this.err("'return' must be the last statement of a block");
        break;
      }
      const s = this.statement();
      if (s) stmts.push(s);
      this.acceptOp(';');
    }
    return stmts;
  }
  exprlist() { const es = [this.expr()]; while (this.acceptOp(',')) es.push(this.expr()); return es; }
  statement() {
    const t = this.peek(), line = t.line, k = t.k; let v = t.v;
    if (k === 'op' && v === '@') { this.skipAttributes(); return this.statement(); }
    if (k === 'kw') {
      if (v === 'local') {
        this.p++;
        if (this.acceptKw('function')) { const nm = this.name(); const f = this.funcBody(false, nm, line); return { type: 'LocalFunction', name: nm, func: f, line }; }
        const names = [];
        for (;;) {
          names.push(this.name());
          if (this.isOp('<') && this.peek(1).k === 'name' && this.isOp('>', 2)) this.p += 3; // attribs
          if (this.acceptOp(':')) this.skipType();
          if (!this.acceptOp(',')) break;
        }
        const exprs = this.acceptOp('=') ? this.exprlist() : [];
        return { type: 'Local', names, exprs, line };
      }
      if (v === 'function') {
        this.p++; let target = { type: 'Name', name: this.name(), line }, fname = target.name, isMethod = false;
        for (;;) {
          if (this.acceptOp('.')) { const nm = this.name(); target = { type: 'Index', obj: target, key: { type: 'Str', v: nm, line }, dot: true, line }; fname += '.' + nm; }
          else if (this.acceptOp(':')) { const nm = this.name(); target = { type: 'Index', obj: target, key: { type: 'Str', v: nm, line }, dot: true, line }; fname += ':' + nm; isMethod = true; break; }
          else break;
        }
        return { type: 'Assign', targets: [target], exprs: [this.funcBody(isMethod, fname, line)], line, isFunctionStat: true };
      }
      if (v === 'if') {
        this.p++; const clauses = []; let c = this.expr(); this.expectKw('then'); clauses.push({ cond: c, body: this.block() }); let els = null;
        for (;;) {
          if (this.acceptKw('elseif')) { c = this.expr(); this.expectKw('then'); clauses.push({ cond: c, body: this.block() }); }
          else if (this.acceptKw('else')) { els = this.block(); break; }
          else break;
        }
        this.expectKw('end', t); return { type: 'If', clauses, else: els, line };
      }
      if (v === 'while') { this.p++; const c = this.expr(); this.expectKw('do'); const b = this.block(); this.expectKw('end', t); return { type: 'While', cond: c, body: b, line }; }
      if (v === 'do') { this.p++; const b = this.block(); this.expectKw('end', t); return { type: 'Do', body: b, line }; }
      if (v === 'repeat') { this.p++; const b = this.block(); this.expectKw('until', t); return { type: 'Repeat', body: b, cond: this.expr(), line }; }
      if (v === 'for') {
        this.p++; const n1 = this.name();
        if (this.acceptOp(':')) this.skipType();
        if (this.acceptOp('=')) {
          const a = this.expr(); this.expectOp(','); const b = this.expr(); const st = this.acceptOp(',') ? this.expr() : null;
          this.expectKw('do'); const body = this.block(); this.expectKw('end', t);
          return { type: 'NumFor', name: n1, start: a, limit: b, step: st, body, line };
        }
        const names = [n1];
        while (this.acceptOp(',')) { names.push(this.name()); if (this.acceptOp(':')) this.skipType(); }
        this.expectKw('in'); const es = this.exprlist(); this.expectKw('do'); const body = this.block(); this.expectKw('end', t);
        return { type: 'GenFor', names, exprs: es, body, line };
      }
      if (v === 'break') { this.p++; return { type: 'Break', line }; }
    }
    if (k === 'name') {
      if (v === 'continue') {
        const n = this.peek(1);
        if (!(n.k === 'op' && ['(', '=', '.', ':', '[', ',', '+=', '-=', '*=', '/=', '..=', '%=', '^=', '//='].includes(n.v)) && !(n.k === 'str')) { this.p++; return { type: 'Continue', line }; }
      }
      if (v === 'export' && this.peek(1).k === 'name' && this.peek(1).v === 'type' && this.peek(2).k === 'name') { this.p++; v = 'type'; }
      if (v === 'type' && this.peek(1).k === 'name' && (this.isOp('=', 2) || this.isOp('<', 2))) {
        this.p++; this.name(); if (this.isOp('<')) { this.p++; this.skipGenericList(); } this.expectOp('='); this.skipType(); return null;
      }
    }
    const e = this.suffixes(this.primary());
    if (this.isOp('=') || this.isOp(',')) {
      const targets = [e];
      while (this.acceptOp(',')) targets.push(this.suffixes(this.primary()));
      this.expectOp('='); const exprs = this.exprlist();
      for (const tg of targets) if (tg.type !== 'Name' && tg.type !== 'Index') this.err('syntax error: cannot assign to expression');
      return { type: 'Assign', targets, exprs, line };
    }
    const t2 = this.peek();
    if (t2.k === 'op' && Object.prototype.hasOwnProperty.call(COMPOUND, t2.v)) {
      if (e.type !== 'Name' && e.type !== 'Index') this.err('syntax error: cannot assign to expression');
      this.p++; const rhs = this.expr(); return { type: 'Compound', op: COMPOUND[t2.v], target: e, e: rhs, line };
    }
    if (e.type !== 'Call' && e.type !== 'Method') this.err('syntax error: expected statement');
    return { type: 'CallStat', call: e, line };
  }
}

function parse(source, chunkname) {
  const fname = chunkname || '?';
  const src = utf8enc(source);
  const toks = tokenize(src, fname);
  const p = new Parser(toks, fname);
  const body = p.block();
  if (p.peek().k !== 'eof') p.err('unexpected token');
  return { type: 'Chunk', body, source: src };
}
module.exports = { parse, Parser, LuauSyntaxError };
