'use strict';
// Luau AST -> JavaScript (generator functions) code generator.
const { parse } = require('./parser');

const RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'await', 'async', 'arguments', 'eval', 'undefined', 'NaN', 'Infinity', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'of', 'get', 'set']);

function qstr(s) { // byte string -> JS string literal (ASCII only)
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) out += '\\"'; else if (c === 92) out += '\\\\';
    else if (c === 10) out += '\\n'; else if (c === 13) out += '\\r';
    else if (c >= 32 && c < 127) out += s[i];
    else out += '\\x' + c.toString(16).padStart(2, '0');
  }
  return out + '"';
}
const CMP = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };
const ARITH = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '^': 'pow', '//': 'idiv' };

class FuncCtx {
  constructor(parent, vararg) { this.parent = parent; this.vararg = vararg; this.ntemps = 0; this.loops = []; }
}

class CodeGen {
  constructor(chunkname, chunkId, opts) {
    this.chunkname = chunkname; this.chunkId = chunkId; this.opts = opts || {};
    this.scopes = []; this.names = new Map(); this.fc = null; this.uid = 0;
    this.globalsUsed = new Map(); // api coverage: name -> count
    this.indexed = [];            // "A.B" paths of called/indexed globals
  }
  push() { this.scopes.push(new Map()); }
  pop() { this.scopes.pop(); }
  declare(name) {
    let base = RESERVED.has(name) ? name + '$' : name;
    const n = this.names.get(base) || 0;
    this.names.set(base, n + 1);
    const js = n === 0 ? base : base + '$' + n;
    this.scopes[this.scopes.length - 1].set(name, js);
    return js;
  }
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) { const v = this.scopes[i].get(name); if (v !== undefined) return v; }
    return null;
  }
  temp() { return '$t' + (this.fc.ntemps++); }
  pos(line) { return `$S.p=${this.chunkId * 1000000 + (line || 0)};`; }

  /* ---------- chunk ---------- */
  chunk(ast) {
    this.fc = new FuncCtx(null, true);
    this.push();
    const scriptJs = this.declare('script');
    const body = this.block(ast.body, false);
    this.pop();
    const temps = this.fc.ntemps ? 'let ' + Array.from({ length: this.fc.ntemps }, (_, i) => '$t' + i).join(',') + ';' : '';
    return `function*(${scriptJs},...$va){${temps}${body}return $E;}`;
  }
  block(stmts, newScope = true) {
    if (newScope) this.push();
    let out = '';
    for (const s of stmts) out += this.stmt(s);
    if (newScope) this.pop();
    return out;
  }

  /* ---------- statements ---------- */
  stmt(s) {
    switch (s.type) {
      case 'Local': return this.localStmt(s);
      case 'LocalFunction': {
        const js = this.declare(s.name);
        return `${this.pos(s.line)}let ${js};${js}=${this.func(s.func)};`;
      }
      case 'Assign': return this.pos(s.line) + this.assign(s);
      case 'Compound': return this.pos(s.line) + this.compound(s);
      case 'CallStat': return this.pos(s.line) + this.callRaw(s.call) + ';';
      case 'Do': return `{${this.block(s.body)}}`;
      case 'If': {
        let out = this.pos(s.line);
        s.clauses.forEach((c, i) => {
          out += (i ? 'else ' : '') + `if(${this.cond(c.cond)}){${this.block(c.body)}}`;
        });
        if (s.else) out += `else{${this.block(s.else)}}`;
        return out;
      }
      case 'While': {
        this.fc.loops.push({ kind: 'while' });
        const out = `${this.pos(s.line)}while(${this.cond(s.cond)}){${this.block(s.body)}}`;
        this.fc.loops.pop(); return out;
      }
      case 'Repeat': {
        this.fc.loops.push({ kind: 'repeat', cond: s.cond, cg: this });
        this.push();
        let body = '';
        for (const st of s.body) body += this.stmt(st);
        const c = this.cond(s.cond);
        this.pop(); this.fc.loops.pop();
        return `${this.pos(s.line)}for(;;){${body}if(${c})break;}`;
      }
      case 'NumFor': return this.numFor(s);
      case 'GenFor': return this.genFor(s);
      case 'Return': return this.pos(s.line) + this.returnStmt(s);
      case 'Break': return 'break;';
      case 'Continue': {
        const l = this.fc.loops[this.fc.loops.length - 1];
        if (!l) throw new Error('continue outside loop');
        if (l.kind === 'repeat') return `if(${this.cond(l.cond)})break;continue;`;
        return 'continue;';
      }
    }
    throw new Error('unknown stmt ' + s.type);
  }
  localStmt(s) {
    const pos = this.pos(s.line);
    const n = s.names.length, exprs = s.exprs;
    if (exprs.length === 0) return `${pos}let ${s.names.map((nm) => this.declare(nm)).join(',')};`;
    const last = exprs[exprs.length - 1];
    const lastMulti = isMulti(last);
    if (n === 1 && exprs.length === 1) {
      const code = this.expr(exprs[0]); // evaluate before declaring
      return `${pos}let ${this.declare(s.names[0])}=${code};`;
    }
    if (lastMulti && exprs.length <= n) {
      // a, b, c = e1, f()
      const fixed = exprs.slice(0, -1).map((e) => this.expr(e));
      const rest = this.multi(last);
      const js = s.names.map((nm) => this.declare(nm));
      const t = '$r' + (this.uid++);
      let out = `${pos}let ${t}=[${fixed.join(',')}${fixed.length ? ',' : ''}...${rest}];`;
      out += `let ${js.map((j, i) => `${j}=${t}[${i}]`).join(',')};`;
      return out;
    }
    if (exprs.length <= n) {
      const vals = exprs.map((e) => this.expr(e));
      const js = s.names.map((nm) => this.declare(nm));
      return `${pos}let ${js.map((j, i) => (i < vals.length ? `${j}=${vals[i]}` : j)).join(',')};`;
    }
    const arr = '$r' + (this.uid++);
    const all = exprs.map((e, i) => (i === exprs.length - 1 && isMulti(e)) ? '...' + this.multi(e) : this.expr(e));
    const js = s.names.map((nm) => this.declare(nm));
    return `${pos}let ${arr}=[${all.join(',')}];let ${js.map((j, i) => `${j}=${arr}[${i}]`).join(',')};`;
  }
  assign(s) {
    const { targets, exprs } = s;
    if (targets.length === 1 && exprs.length === 1) {
      const e = exprs[0];
      let code = this.expr(e);
      return this.store(targets[0], code, true);
    }
    // general: evaluate target subexpressions, then rhs, then assign
    const pre = []; const tg = [];
    for (const t of targets) {
      if (t.type === 'Index') {
        const o = '$a' + (this.uid++), k = '$a' + (this.uid++);
        pre.push(`const ${o}=${this.expr(t.obj)},${k}=${this.expr(t.key)};`);
        tg.push({ t, o, k });
      } else tg.push({ t });
    }
    const n = targets.length, last = exprs[exprs.length - 1];
    const vname = '$v' + (this.uid++);
    let rhs;
    if (isMulti(last) && exprs.length <= n) {
      const fixed = exprs.slice(0, -1).map((e) => this.expr(e));
      rhs = `const ${vname}=[${fixed.join(',')}${fixed.length ? ',' : ''}...${this.multi(last)}];`;
    } else {
      rhs = `const ${vname}=[${exprs.map((e) => this.expr(e)).join(',')}];`;
    }
    let out = '{' + pre.join('') + rhs;
    tg.forEach((x, i) => {
      const val = `${vname}[${i}]`;
      if (x.o) out += `$setidx(${x.o},${x.k},${val});`;
      else out += this.store(x.t, val, false);
    });
    return out + '}';
  }
  store(t, code, stmt) {
    if (t.type === 'Name') {
      const js = this.lookup(t.name);
      if (js) return `${js}=${code};`;
      this.noteGlobal(t.name, true);
      return `$setidx($G,${qstr(t.name)},${code});`;
    }
    return `$setidx(${this.expr(t.obj)},${this.expr(t.key)},${code});`;
  }
  compound(s) {
    const op = ARITH[s.op] || 'concat';
    const t = s.target;
    if (t.type === 'Name') {
      const js = this.lookup(t.name);
      if (js) return `${js}=$${op}(${js},${this.expr(s.e)});`;
      return `$setidx($G,${qstr(t.name)},$${op}($idx($G,${qstr(t.name)}),${this.expr(s.e)}));`;
    }
    const o = '$a' + (this.uid++), k = '$a' + (this.uid++);
    return `{const ${o}=${this.expr(t.obj)},${k}=${this.expr(t.key)};$setidx(${o},${k},$${op}($idx(${o},${k}),${this.expr(s.e)}));}`;
  }
  returnStmt(s) {
    const ex = s.exprs;
    if (ex.length === 0) return 'return $E;';
    if (ex.length === 1) {
      const e = ex[0];
      if (e.type === 'Call' || e.type === 'Method') return `return ${this.callRaw(e)};`;
      if (e.type === 'Vararg') return 'return $va;';
      return `return ${this.expr(e)};`;
    }
    return `return ${this.arrayOf(ex)};`;
  }
  // [a, b, ...multi]
  arrayOf(list) {
    const parts = list.map((e, i) => (i === list.length - 1 && isMulti(e)) ? '...' + this.multi(e) : this.expr(e));
    return '[' + parts.join(',') + ']';
  }
  numFor(s) {
    const id = this.uid++;
    const a = '$fa' + id, b = '$fb' + id, st = '$fs' + id;
    const start = this.expr(s.start), limit = this.expr(s.limit), step = s.step ? this.expr(s.step) : null;
    this.fc.loops.push({ kind: 'for' });
    this.push();
    const v = this.declare(s.name);
    const body = this.block(s.body, false);
    this.pop(); this.fc.loops.pop();
    const stepLit = !s.step || (s.step.type === 'Num');
    const sv = s.step ? s.step.v : 1;
    if (stepLit && sv > 0) {
      return `${this.pos(s.line)}for(let ${a}=$fnum(${start},"initial"),${b}=$fnum(${limit},"limit"),${st}=${sv};${a}<=${b};${a}+=${st}){let ${v}=${a};${body}}`;
    }
    return `${this.pos(s.line)}for(let ${a}=$fnum(${start},"initial"),${b}=$fnum(${limit},"limit"),${st}=$fstep(${step});${st}>0?${a}<=${b}:${b}<=${a};${a}+=${st}){let ${v}=${a};${body}}`;
  }
  genFor(s) {
    const id = this.uid++, it = '$it' + id;
    const init = this.arrayOf(s.exprs);
    this.fc.loops.push({ kind: 'for' });
    this.push();
    const decl = s.names.map((nm, i) => {
      const js = this.declare(nm);
      return `${js}=${i === 0 ? it + '.k' : i === 1 ? it + '.v' : it + '.r[' + i + ']'}`;
    });
    const body = this.block(s.body, false);
    this.pop(); this.fc.loops.pop();
    return `${this.pos(s.line)}{const ${it}=$fp(${init});for(;;){if(${it}.fast){if(!${it}.step())break;}else if(!(yield* ${it}.stepG()))break;let ${decl.join(',')};${body}}}`;
  }

  /* ---------- functions ---------- */
  func(f) {
    const saved = this.fc;
    this.fc = new FuncCtx(saved, f.vararg);
    this.push();
    const ps = f.params.map((p) => this.declare(p));
    const body = this.block(f.body, false);
    this.pop();
    const temps = this.fc.ntemps ? 'let ' + Array.from({ length: this.fc.ntemps }, (_, i) => '$t' + i).join(',') + ';' : '';
    this.fc = saved;
    const va = f.vararg ? (ps.length ? ',' : '') + '...$va' : '';
    return `function*(${ps.join(',')}${va}){${temps}${body}return $E;}`;
  }

  /* ---------- expressions ---------- */
  noteGlobal(name, write) { this.globalsUsed.set(name, (this.globalsUsed.get(name) || 0) + 1); }
  // record dotted API path (e.g. "Instance.new", "game.Players") for coverage
  apiPath(e) {
    if (e.type === 'Name') return this.lookup(e.name) ? null : e.name;
    if (e.type === 'Index' && e.dot) { const p = this.apiPath(e.obj); return p ? p + '.' + e.key.v : null; }
    return null;
  }
  expr(e) { // single value
    switch (e.type) {
      case 'Nil': return 'undefined';
      case 'True': return 'true';
      case 'False': return 'false';
      case 'Num': return Number.isFinite(e.v) ? String(e.v) : '(1/0)';
      case 'Str': return qstr(e.v);
      case 'Vararg': return '$va[0]';
      case 'Func': return this.func(e);
      case 'Name': {
        const js = this.lookup(e.name);
        if (js) return js;
        this.noteGlobal(e.name);
        return `$idx($G,${qstr(e.name)})`;
      }
      case 'Index': {
        const p = this.apiPath(e); if (p) this.indexed.push(p);
        if (e.obj.type === 'Name' && !this.lookup(e.obj.name)) this.noteGlobal(e.obj.name);
        return `$idx(${this.expr(e.obj)},${this.expr(e.key)})`;
      }
      case 'Call': case 'Method': return `$1(${this.callRaw(e)})`;
      case 'Paren': return this.expr(e.e);
      case 'Table': return this.table(e);
      case 'Unop': return this.unop(e);
      case 'Binop': return this.binop(e);
      case 'IfExp': return `(${this.cond(e.c)}?${this.expr(e.a)}:${this.expr(e.b)})`;
      case 'Interp': {
        const parts = e.parts.map((p) => (typeof p === 'string' ? qstr(p) : `$ts(${this.expr(p)})`)).filter((x) => x !== '""');
        if (!parts.length) return '""';
        return '(' + (parts.length === 1 && parts[0][0] !== '"' ? '""+' : '') + parts.join('+') + ')';
      }
    }
    throw new Error('unknown expr ' + e.type);
  }
  multi(e) { // JS expression producing an array of values
    if (e.type === 'Vararg') return '$va';
    return `$m(${this.callRaw(e)})`;
  }
  callRaw(e) {
    if (e.type === 'Method') {
      const t = this.temp();
      return `(${t}=${this.expr(e.obj)},yield* $meth(${t},${qstr(e.name)})(${t}${e.args.length ? ',' : ''}${this.args(e.args)}))`;
    }
    const p = this.apiPath(e.fn); if (p) this.indexed.push(p + '()');
    let desc = '';
    const f = e.fn;
    if (f.type === 'Name' && !this.lookup(f.name)) this.noteGlobal(f.name);
    return `(yield* $nf(${this.expr(f)},${desc ? qstr(desc) : 'null'})(${this.args(e.args)}))`;
  }
  args(args) {
    return args.map((a, i) => (i === args.length - 1 && isMulti(a)) ? '...' + this.multi(a) : this.expr(a)).join(',');
  }
  table(e) {
    const pos = [], kv = [];
    const n = e.items.length;
    e.items.forEach((it, i) => {
      if (it.kind === 'pos') pos.push((i === n - 1 && isMulti(it.v)) ? '...' + this.multi(it.v) : this.expr(it.v));
      else kv.push(this.expr(it.k), this.expr(it.v));
    });
    if (!kv.length) return pos.length ? `$ta([${pos.join(',')}])` : '$tn()';
    return `$tkv([${pos.join(',')}],[${kv.join(',')}])`;
  }
  unop(e) {
    if (e.op === 'not') return `!${this.cond(e.e, true)}`;
    if (e.op === '-') { if (e.e.type === 'Num') return `(-${e.e.v})`; return `$unm(${this.expr(e.e)})`; }
    return `$len(${this.expr(e.e)})`;
  }
  binop(e) {
    const { op, l, r } = e;
    if (op === 'and' || op === 'or') {
      if (isBool(l)) return op === 'and' ? `(${this.cond(l)}?${this.expr(r)}:false)` : `(${this.cond(l)}?true:${this.expr(r)})`;
      const t = this.temp();
      return op === 'and' ? `((${t}=${this.expr(l)})===undefined||${t}===false?${t}:${this.expr(r)})` : `((${t}=${this.expr(l)})!==undefined&&${t}!==false?${t}:${this.expr(r)})`;
    }
    if (op === '==' || op === '~=') {
      const lit = (x) => x.type === 'Nil' || x.type === 'True' || x.type === 'False' || x.type === 'Str' || x.type === 'Num';
      const code = (lit(l) || lit(r)) ? `(${this.expr(l)}===${this.expr(r)})` : `$eq(${this.expr(l)},${this.expr(r)})`;
      return op === '==' ? code : `!${code}`;
    }
    if (CMP[op]) return `$${CMP[op]}(${this.expr(l)},${this.expr(r)})`;
    if (op === '..') return `$concat(${this.expr(l)},${this.expr(r)})`;
    return `$${ARITH[op]}(${this.expr(l)},${this.expr(r)})`;
  }
  // JS boolean expression for truthiness
  cond(e, asOperand) {
    let code;
    switch (e.type) {
      case 'True': code = 'true'; break;
      case 'False': case 'Nil': code = 'false'; break;
      case 'Num': case 'Str': code = 'true'; break;
      case 'Paren': return this.cond(e.e, asOperand);
      case 'Unop':
        if (e.op === 'not') code = `!${this.cond(e.e, true)}`; else code = this.truthy(e); break;
      case 'Binop':
        if (e.op === 'and') code = `(${this.cond(e.l)}&&${this.cond(e.r)})`;
        else if (e.op === 'or') code = `(${this.cond(e.l)}||${this.cond(e.r)})`;
        else if (isBool(e)) code = this.binop(e);
        else code = this.truthy(e);
        break;
      default: code = this.truthy(e);
    }
    return code;
  }
  truthy(e) {
    const c = this.expr(e);
    if (e.type === 'Name' && this.lookup(e.name)) return `(${c}!==undefined&&${c}!==false)`;
    const t = this.temp();
    return `((${t}=${c})!==undefined&&${t}!==false)`;
  }
}
function isMulti(e) { return e.type === 'Call' || e.type === 'Method' || e.type === 'Vararg'; }
function isBool(e) {
  if (e.type === 'True' || e.type === 'False') return true;
  if (e.type === 'Paren') return isBool(e.e);
  if (e.type === 'Unop') return e.op === 'not';
  if (e.type === 'Binop') {
    if (['==', '~=', '<', '<=', '>', '>='].includes(e.op)) return true;
    if (e.op === 'and' || e.op === 'or') return isBool(e.l) && isBool(e.r);
  }
  return false;
}

const HELPERS = ['E', 'ST', 'idx', 'setidx', 'add', 'sub', 'mul', 'div', 'mod', 'pow', 'idiv', 'unm', 'concat', 'len', 'eq', 'lt', 'le', 'gt', 'ge', 'nf', 'meth', 'm', 'first', 'ts', 'ta', 'tn', 'tkv', 'fnum', 'fstep', 'fp'];
const HELPER_ALIAS = { E: '$E', ST: '$S', first: '$1' };

// compile(source, chunkname, chunkId) -> { code, globals, indexed }
function compile(source, chunkname, chunkId) {
  const ast = parse(source, chunkname);
  const cg = new CodeGen(chunkname, chunkId || 0);
  const fn = cg.chunk(ast);
  const pre = HELPERS.map((h) => `$${HELPER_ALIAS[h] ? HELPER_ALIAS[h].slice(1) : h}=$R.${h}`).join(',');
  const code = `(function($R,$G){"use strict";const ${pre};return ${fn};})`;
  return { code, globals: cg.globalsUsed, indexed: cg.indexed };
}
module.exports = { compile, CodeGen, qstr };
