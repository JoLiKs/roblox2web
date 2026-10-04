/* roblox2web 2.0 runtime — bundled from lua2js/ and rbx/ (MIT) */
(function(){var defs={},cache={};function req(id){if(cache[id])return cache[id].exports;var m=cache[id]={exports:{}};defs[id](m,m.exports,function(p){return req(res(id,p));});return m.exports;}
function res(from,p){var parts=from.split('/');parts.pop();p.split('/').forEach(function(s){if(s==='.'||s==='')return;if(s==='..')parts.pop();else parts.push(s);});var r=parts.join('/');if(!/\.js$/.test(r))r+='.js';return r;}
defs["rbx/boot.js"]=function(module,exports,require){'use strict';
// Browser entry point: window.R2W
const C = require('../lua2js/core');
const { utf8dec } = require('../lua2js/lexer');
const I = require('./instance');
const { ENV } = I;
const D = require('./datatypes');
const { ENV: E2 } = require('./env');
require('./services'); require('./players'); require('./physics'); require('./net');
const input = require('./input');
const { GuiRenderer } = require('./gui');
const { World3D } = require('./world3d');
const layout = require('./layout');

const chunks = []; const errors = []; let game = null; let started = false;
const R2W = {
  version: '2.0.0',
  chunk(id, name, factory) { ENV.chunkFactories.set(id, factory); C.ST.chunks[id] = name; chunks.push(id); },
  chunkError(id, name, msg) { errors.push({ id, name, msg }); },
  setGame(g) { game = g; R2W.game = g; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => R2W.start()); else setTimeout(() => R2W.start(), 0); },
  ENV,
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const qs = (k) => { const m = new RegExp('[?&]' + k + '(=([^&]*))?').exec(location.search); return m ? (m[2] === undefined ? '1' : decodeURIComponent(m[2])) : null; };

R2W.start = function (opts) {
  if (started) return; started = true;
  opts = opts || {};
  const d = document;
  let root = d.getElementById('r2w-root');
  if (!root) { root = d.createElement('div'); root.id = 'r2w-root'; d.body.appendChild(root); }
  root.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;overflow:hidden;background:#111;font-family:system-ui,Segoe UI,Roboto,sans-serif;user-select:none;-webkit-user-select:none;';
  const splash = d.createElement('div'); splash.id = 'r2w-splash'; splash.style.cssText = 'position:absolute;inset:0;background:#1b1d21;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200000;font-size:18px;';
  splash.innerHTML = `<div style="font-size:26px;font-weight:700;margin-bottom:8px">${esc(utf8dec(game.name || 'Game'))}</div><div style="color:#9aa">Загрузка… Luau → JS (roblox2web ${R2W.version})</div>`;
  root.appendChild(splash);
  const finishSplash = () => { splash.remove(); };

  // ----- UI chrome
  const bar = d.createElement('div'); bar.className = 'r2w-ui'; bar.id = 'r2w-bar';
  bar.style.cssText = 'position:absolute;left:0;top:0;right:0;height:36px;background:rgba(18,18,20,.72);color:#eee;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:13px;z-index:100001;pointer-events:auto;';
  bar.innerHTML = `<b id="r2w-title" style="margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(utf8dec(game.name || ''))}</b>
    <label style="display:flex;gap:4px;align-items:center;cursor:pointer" title="Эмуляция Roblox Premium"><input type="checkbox" id="r2w-premium"> Premium</label>
    <button id="r2w-btn-players">Игроки</button><button id="r2w-btn-console">Консоль <span id="r2w-errcount" style="display:none;background:#c0392b;border-radius:8px;padding:0 5px"></span></button><button id="r2w-btn-reset" title="Удалить локальные сохранения и перезапустить">Сброс</button>`;
  for (const b of bar.querySelectorAll('button')) b.style.cssText = 'background:#3a3d44;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;';
  root.appendChild(bar);
  const cons = d.createElement('div'); cons.className = 'r2w-ui'; cons.id = 'r2w-console';
  cons.style.cssText = 'position:absolute;left:8px;right:8px;bottom:8px;height:38%;background:rgba(10,10,12,.92);color:#ddd;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;overflow:auto;padding:8px;border:1px solid #444;border-radius:8px;z-index:100002;display:none;pointer-events:auto;user-select:text;white-space:pre-wrap;';
  root.appendChild(cons);
  const plist = d.createElement('div'); plist.className = 'r2w-ui'; plist.id = 'r2w-players';
  plist.style.cssText = 'position:absolute;right:8px;top:42px;min-width:200px;background:rgba(20,20,24,.85);color:#fff;border-radius:8px;padding:8px 10px;font-size:13px;z-index:100001;display:none;pointer-events:auto;';
  root.appendChild(plist);
  const stage = d.createElement('div'); stage.id = 'r2w-stage'; stage.style.cssText = 'position:absolute;inset:0;'; root.insertBefore(stage, bar);

  // ----- logging
  const COL = { out: '#ddd', warn: '#f5c242', err: '#ff6b5e', info: '#7fb3ff' };
  let nerr = 0;
  const addLine = (e) => {
    const line = d.createElement('div'); line.style.color = COL[e.level] || '#ddd';
    if (/\[unsupported\]/.test(e.text)) line.style.color = '#c792ea';
    line.textContent = `[${e.who}] ${e.text}`; cons.appendChild(line);
    while (cons.childNodes.length > 800) cons.removeChild(cons.firstChild);
    cons.scrollTop = cons.scrollHeight;
    if (e.level === 'err') { nerr++; const c = d.getElementById('r2w-errcount'); c.style.display = 'inline'; c.textContent = nerr; }
    const f = e.level === 'err' ? 'error' : e.level === 'warn' ? 'warn' : 'log';
    if (e.level !== 'out' || !qs('quiet')) console[f]('[r2w]', `[${e.who}]`, e.text);
  };
  ENV.onLog = addLine;
  for (const e of errors) addLine({ level: 'err', who: 'transpile', text: `${e.name}: ${e.msg}` });
  d.getElementById('r2w-btn-console').onclick = () => { cons.style.display = cons.style.display === 'none' ? 'block' : 'none'; };
  d.getElementById('r2w-btn-players').onclick = () => { plist.style.display = plist.style.display === 'none' ? 'block' : 'none'; };
  d.getElementById('r2w-btn-reset').onclick = () => { if (confirm('Удалить сохранения этой игры из localStorage и перезапустить?')) { ENV.storage.clearAll(); location.reload(); } };
  window.addEventListener('keydown', (e) => { if (e.code === 'F9') { e.preventDefault(); cons.style.display = cons.style.display === 'none' ? 'block' : 'none'; } if (e.code === 'Tab') { plist.style.display = plist.style.display === 'none' ? 'block' : 'none'; } });
  window.addEventListener('error', (e) => addLine({ level: 'err', who: 'js', text: String(e.message) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '') }));
  window.addEventListener('unhandledrejection', (e) => addLine({ level: 'err', who: 'js', text: 'unhandled rejection: ' + (e.reason && e.reason.stack || e.reason) }));
  d.getElementById('r2w-premium').checked = qs('premium') === '1';

  // ----- boot the emulator
  let w3;
  try {
    const cfg = game.config || {};
    ENV.boot({ tree: game.tree, persist: qs('persist') !== '0', seed: qs('seed') ? +qs('seed') : undefined, catalog: cfg.catalog, name: game.name, placeKey: cfg.placeKey || game.name, autoPurchase: qs('autobuy') === '1', latency: qs('latency') ? +qs('latency') : undefined });
    let maxId = 0; for (const id of chunks) maxId = Math.max(maxId, id); ENV.rt.chunkCount = Math.max(ENV.rt.chunkCount || 0, maxId);
    if (cfg.lighting) {/* reserved */}
    new GuiRenderer({ root: stage });
    w3 = new World3D({ THREE: window.THREE, container: stage, preserve: qs('preserve') === '1' });
    ENV.world3d = w3;
    ENV.start({ premium: d.getElementById('r2w-premium').checked, playerName: cfg.playerName || qs('name') || 'Player1', userId: cfg.userId });
  } catch (e) {
    addLine({ level: 'err', who: 'boot', text: 'Ошибка запуска: ' + (e && e.stack || e) });
    cons.style.display = 'block'; finishSplash(); console.error(e); return;
  }
  d.getElementById('r2w-premium').onchange = (e) => { if (ENV.localPlayer) ENV.setPremium(ENV.localPlayer, e.target.checked); };
  if (qs('premium') === '1' && ENV.localPlayer) ENV.setPremium(ENV.localPlayer, true);
  // ----- ProximityPrompt UI
  const pp = d.createElement('div'); pp.className = 'r2w-ui'; pp.id = 'r2w-prompt';
  pp.style.cssText = 'position:absolute;transform:translate(-50%,-50%);background:rgba(30,30,34,.92);color:#fff;border:2px solid #fff6;border-radius:10px;padding:6px 12px 6px 6px;display:none;align-items:center;gap:8px;z-index:90000;pointer-events:auto;cursor:pointer;font-size:14px;min-width:90px;';
  pp.innerHTML = '<div id="r2w-pk" style="width:30px;height:30px;border-radius:6px;background:#fff;color:#111;font-weight:800;display:flex;align-items:center;justify-content:center"></div><div><div id="r2w-pa" style="font-weight:700"></div><div id="r2w-po" style="font-size:11px;color:#bbb"></div></div><div id="r2w-ph" style="position:absolute;left:0;bottom:0;height:3px;background:#4fc3f7;width:0"></div>';
  stage.appendChild(pp);
  const pkeyOf = (p) => { const n = p.props.KeyboardKeyCode.name; return n === 'Unknown' ? '' : n; };
  pp.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (ENV.prompts.active) ENV.prompts.press(ENV.prompts.active); });
  pp.addEventListener('pointerup', (e) => { e.stopPropagation(); ENV.prompts.release(); });
  pp.addEventListener('pointerleave', () => { if (ENV.prompts.hold) ENV.prompts.release(); });
  function updatePrompt() {
    const a = ENV.prompts.active;
    if (!a || a.props.Style.name === 'Custom') { pp.style.display = 'none'; return; }
    const pos = a.parent && (a.parent.isA('BasePart') ? a.parent.props.CFrame : a.parent.className === 'Attachment' ? a.parent.lget('WorldPosition') : a.parent.isA('Model') ? I.modelPivot(a.parent) : null);
    if (!pos) { pp.style.display = 'none'; return; }
    const o = a.props.UIOffset; const pr = ENV.project({ x: pos.x, y: pos.y, z: pos.z });
    if (!pr[3]) { pp.style.display = 'none'; return; }
    pp.style.display = 'flex'; pp.style.left = (pr[0] + o.x) + 'px'; pp.style.top = (pr[1] + o.y) + 'px';
    const k = pkeyOf(a); d.getElementById('r2w-pk').textContent = k || '●';
    d.getElementById('r2w-pa').textContent = utf8dec(a.props.ActionText || ''); d.getElementById('r2w-po').textContent = utf8dec(a.props.ObjectText || '');
    d.getElementById('r2w-ph').style.width = ENV.prompts.hold ? Math.min(100, ENV.prompts.holdT / Math.max(0.01, a.props.HoldDuration) * 100) + '%' : '0';
  }
  // key 'E' etc. goes to the prompts through input.key; hold release handled there
  // ----- players list
  function updatePlayers() {
    if (plist.style.display === 'none') return;
    let h = '<div style="font-weight:700;margin-bottom:4px">Игроки</div>';
    for (const p of ENV.players) {
      const ls = p.findChild('leaderstats'); let st = '';
      if (ls) for (const v of ls.children) if (v.props.Value !== undefined) st += ` <span style="color:#9fd">${esc(utf8dec(v.props.Name))}: ${esc(utf8dec(String(v.props.Value)))}</span>`;
      h += `<div>${esc(utf8dec(p.props.DisplayName || p.props.Name))}${st}</div>`;
    }
    plist.innerHTML = h;
  }
  // ----- main loop
  let last = performance.now(), acc = 0, pl = 0, frames = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
    acc += dt;
    try {
      if (acc > 0.0001) {
        const sub = acc > 1 / 25 ? 2 : 1; for (let i = 0; i < sub; i++) ENV.frame(acc / sub); acc = 0;
      }
      ENV.gui.flush();
      w3.render(dt);
      updatePrompt();
      if ((pl += dt) > 0.5) { pl = 0; updatePlayers(); }
      if (++frames === 3) finishSplash();
    } catch (e) { addLine({ level: 'err', who: 'frame', text: String(e && e.stack || e) }); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => { try { ENV.shutdown(); } catch (e) { /* */ } });
  window.addEventListener('beforeunload', () => { try { ENV.shutdown(); } catch (e) { /* */ } });
  R2W.started = true;
};
if (typeof window !== 'undefined') window.R2W = R2W;
module.exports = R2W;

};
defs["lua2js/core.js"]=function(module,exports,require){'use strict';
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

};
defs["lua2js/lexer.js"]=function(module,exports,require){'use strict';
// Luau lexer. Source is a *byte string* (each char code < 256, UTF-8 encoded).
class LuauSyntaxError extends Error {
  constructor(msg, line) { super(msg); this.name = 'LuauSyntaxError'; this.line = line; }
}
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const OPS3 = ['...', '//=', '..='];
const OPS2 = ['==', '~=', '<=', '>=', '..', '//', '::', '->', '+=', '-=', '*=', '/=', '%=', '^='];
const ESC = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '`': '`', '{': '{' };

function utf8enc(s) { // JS string -> byte string
  let ascii = true;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) { ascii = false; break; }
  if (ascii) return s;
  let out = '';
  for (const ch of s) {
    let c = ch.codePointAt(0);
    if (c < 0x80) out += ch;
    else if (c < 0x800) out += String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out += String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out += String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function utf8dec(s) { // byte string -> JS string (lenient)
  let ascii = true;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) { ascii = false; break; }
  if (ascii) return s;
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return new TextDecoder('utf-8').decode(b);
}
function cpToUtf8(c) {
  if (c < 0x80) return String.fromCharCode(c);
  if (c < 0x800) return String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63));
  if (c < 0x10000) return String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  if (c < 0x200000) return String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  if (c < 0x4000000) return String.fromCharCode(0xF8 | (c >> 24), 0x80 | ((c >> 18) & 63), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  return String.fromCharCode(0xFC | (c >> 30), 0x80 | ((c >> 24) & 63), 0x80 | ((c >> 18) & 63), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
}
const isAlpha = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isDigit = c => c >= 48 && c <= 57;
const isAlnum = c => isAlpha(c) || isDigit(c);
const isHex = c => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

// tokenize(src, fname) -> tokens [{k, v, line}] ; kinds: name kw num str istr op eof
function tokenize(src, fname, startPos, startLine, stopAtBrace) {
  const toks = [];
  let i = startPos || 0, line = startLine || 1;
  const n = src.length;
  const err = (m) => { throw new LuauSyntaxError(`${fname}:${line}: ${m}`, line); };
  if (!startPos && src.startsWith('#!')) while (i < n && src[i] !== '\n') i++;
  const longBracket = (pos) => {
    let j = pos + 1, lvl = 0;
    while (j < n && src[j] === '=') { lvl++; j++; }
    return (j < n && src[j] === '[') ? [lvl, j + 1] : null;
  };
  const countNl = (a, b) => { let c = 0; for (let k = a; k < b; k++) if (src.charCodeAt(k) === 10) c++; return c; };
  let depth = 0;
  while (i < n) {
    const ch = src.charCodeAt(i);
    if (ch === 10) { line++; i++; continue; }
    if (ch === 32 || ch === 9 || ch === 13) { i++; continue; }
    if (ch === 45 && src.charCodeAt(i + 1) === 45) { // comment
      i += 2;
      if (src[i] === '[') {
        const lb = longBracket(i);
        if (lb) {
          const close = ']' + '='.repeat(lb[0]) + ']', e = src.indexOf(close, lb[1]);
          if (e < 0) err('unfinished long comment');
          line += countNl(i, e); i = e + close.length; continue;
        }
      }
      while (i < n && src.charCodeAt(i) !== 10) i++;
      continue;
    }
    if (isAlpha(ch)) {
      let j = i + 1; while (j < n && isAlnum(src.charCodeAt(j))) j++;
      const w = src.slice(i, j);
      toks.push({ k: KEYWORDS.has(w) ? 'kw' : 'name', v: w, line }); i = j; continue;
    }
    if (isDigit(ch) || (ch === 46 && isDigit(src.charCodeAt(i + 1)))) {
      let j = i, v;
      if (ch === 48 && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2; while (j < n && (isHex(src.charCodeAt(j)) || src[j] === '_')) j++;
        v = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16);
      } else if (ch === 48 && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        j = i + 2; while (j < n && (src[j] === '0' || src[j] === '1' || src[j] === '_')) j++;
        v = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 2);
      } else {
        while (j < n && (isDigit(src.charCodeAt(j)) || src[j] === '_')) j++;
        if (src[j] === '.') { j++; while (j < n && (isDigit(src.charCodeAt(j)) || src[j] === '_')) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          let k = j + 1; if (src[k] === '+' || src[k] === '-') k++;
          if (isDigit(src.charCodeAt(k))) { j = k; while (j < n && isDigit(src.charCodeAt(j))) j++; }
        }
        v = parseFloat(src.slice(i, j).replace(/_/g, ''));
      }
      if (j < n && isAlpha(src.charCodeAt(j))) err('malformed number');
      toks.push({ k: 'num', v, line }); i = j; continue;
    }
    if (ch === 34 || ch === 39) {
      const q = src[i]; let j = i + 1; const buf = [];
      for (;;) {
        if (j >= n) err('unfinished string');
        const c = src[j];
        if (c === q) { j++; break; }
        if (c === '\n') err('unfinished string');
        if (c === '\\') { j = readEscape(j, buf, true); } else { buf.push(c); j++; }
      }
      toks.push({ k: 'str', v: buf.join(''), line }); i = j; continue;
    }
    if (ch === 96) { // interpolated string
      const startLn = line;
      let j = i + 1; const parts = []; let buf = [];
      for (;;) {
        if (j >= n) err('unfinished interpolated string');
        const c = src[j];
        if (c === '`') { j++; break; }
        if (c === '\\') { j = readEscape(j, buf, false); continue; }
        if (c === '{') {
          if (src[j + 1] === '{') err("interpolated string cannot contain '{{'");
          parts.push(buf.join('')); buf = [];
          const sub = tokenize(src, fname, j + 1, line, true);
          parts.push(sub.toks); line = sub.line; j = sub.end; continue;
        }
        if (c === '\n') line++;
        buf.push(c); j++;
      }
      parts.push(buf.join(''));
      toks.push({ k: 'istr', v: parts, line: startLn }); i = j; continue;
    }
    if (ch === 91) {
      const lb = longBracket(i);
      if (lb) {
        const close = ']' + '='.repeat(lb[0]) + ']', e = src.indexOf(close, lb[1]);
        if (e < 0) err('unfinished long string');
        let s = src.slice(lb[1], e);
        if (s.startsWith('\r\n')) s = s.slice(2); else if (s.startsWith('\n')) s = s.slice(1);
        toks.push({ k: 'str', v: s.replace(/\r\n/g, '\n'), line }); line += countNl(i, e); i = e + close.length; continue;
      }
    }
    if (stopAtBrace) {
      if (ch === 123) depth++;
      else if (ch === 125) { if (depth === 0) { toks.push({ k: 'eof', v: null, line }); return { toks, end: i + 1, line }; } depth--; }
    }
    const s3 = src.slice(i, i + 3);
    if (OPS3.includes(s3)) { toks.push({ k: 'op', v: s3, line }); i += 3; continue; }
    const s2 = src.slice(i, i + 2);
    if (OPS2.includes(s2)) { toks.push({ k: 'op', v: s2, line }); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.&|?~@'.includes(src[i])) { toks.push({ k: 'op', v: src[i], line }); i++; continue; }
    err('unexpected character ' + JSON.stringify(src[i]));
  }
  if (stopAtBrace) err('unfinished interpolated string expression');
  toks.push({ k: 'eof', v: null, line });
  return toks;

  function readEscape(j, buf, allowNum) {
    j++; const e = src[j];
    if (e === undefined) err('unfinished string');
    if (Object.prototype.hasOwnProperty.call(ESC, e)) { buf.push(ESC[e]); return j + 1; }
    if (e === '\n') { buf.push('\n'); line++; return j + 1; }
    if (e === '\r') { buf.push('\n'); line++; return src[j + 1] === '\n' ? j + 2 : j + 1; }
    if (e === 'z') { j++; while (j < n && ' \t\r\n'.includes(src[j])) { if (src[j] === '\n') line++; j++; } return j; }
    if (e === 'x') {
      const h = src.slice(j + 1, j + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) err('hexadecimal digit expected');
      buf.push(String.fromCharCode(parseInt(h, 16))); return j + 3;
    }
    if (e === 'u') {
      if (src[j + 1] !== '{') err("missing '{' in \\u{xxxx}");
      const k = src.indexOf('}', j);
      if (k < 0) err("missing '}' in \\u{xxxx}");
      buf.push(cpToUtf8(parseInt(src.slice(j + 2, k), 16))); return k + 1;
    }
    if (isDigit(e.charCodeAt(0))) {
      let k = j; while (k < n && k < j + 3 && isDigit(src.charCodeAt(k))) k++;
      const v = parseInt(src.slice(j, k), 10);
      if (v > 255) err('decimal escape too large');
      buf.push(String.fromCharCode(v)); return k;
    }
    err('invalid escape sequence');
  }
}
module.exports = { tokenize, LuauSyntaxError, utf8enc, utf8dec, cpToUtf8 };

};
defs["rbx/instance.js"]=function(module,exports,require){'use strict';
// Instance system: classes, properties, children, signals, attributes.
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED } = C;
const { nat } = require('../lua2js/runtime');
const D = require('./datatypes');

const ENV = { rt: null, game: null, workspace: null, contexts: {}, listeners: { prop: [], attach: [], detach: [], destroy: [] }, ids: 0, warn: (s) => console.warn(s), unsupported: new Map() };
const noteUnsupported = (what) => { ENV.unsupported.set(what, (ENV.unsupported.get(what) || 0) + 1); };
const ctxOfCurrent = () => (CO.current ? CO.current.ctx : null);

/* ------------------------------ Signals ------------------------------ */
class Connection extends Userdata {
  constructor(signal, fn, ctx, once) { super(); this.sig = signal; this.fn = fn; this.ctx = ctx; this.once = once; this.connected = true; }
  get tname() { return 'RBXScriptConnection'; }
  lget(k) {
    if (k === 'Connected') return this.connected;
    if (k === 'Disconnect' || k === 'disconnect') return CONNM.Disconnect;
    throw rtError(`${tostr(k)} is not a valid member of RBXScriptConnection`);
  }
}
const CONNM = { Disconnect: nat((c) => { c.connected = false; const l = c.sig.conns; const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); return E; }, 'Disconnect') };
class Signal extends Userdata {
  constructor(name, owner) { super(); this.name = name; this.owner = owner; this.conns = []; this.waiters = []; this.onFirstConnect = null; }
  get tname() { return 'RBXScriptSignal'; }
  tostr() { return 'Signal ' + this.name; }
  lget(k) {
    switch (k) {
      case 'Connect': case 'connect': case 'ConnectParallel': return SIGM.Connect;
      case 'Once': return SIGM.Once;
      case 'Wait': return SIGM.Wait;
    }
    throw rtError(`${tostr(k)} is not a valid member of RBXScriptSignal`);
  }
  connect(fn, once) {
    if (typeof fn !== 'function') { try { fn = C.toCallable(fn); } catch (e) { throw rtError('Attempt to connect failed: Passed value is not a function'); } }
    const c = new Connection(this, fn, ctxOfCurrent(), once);
    this.conns.push(c);
    if (this.onFirstConnect) this.onFirstConnect(this);
    return c;
  }
  fire(...args) {
    if (this.conns.length) {
      const list = this.conns.slice();
      for (const c of list) {
        if (!c.connected) continue;
        if (c.once) { c.connected = false; const i = this.conns.indexOf(c); if (i >= 0) this.conns.splice(i, 1); }
        ENV.rt.spawn(c.fn, args, c.ctx);
      }
    }
    if (this.waiters.length) {
      const w = this.waiters; this.waiters = [];
      for (const co of w) { if (co.sleepEntry) co.sleepEntry.dead = true; ENV.rt.defer(co, args); }
    }
  }
  disconnectAll() { for (const c of this.conns) c.connected = false; this.conns = []; }
}
const SIGM = {
  Connect: nat((s, fn) => s.connect(fn, false), 'Connect'),
  Once: nat((s, fn) => s.connect(fn, true), 'Once'),
  Wait: function* (s) {
    const co = CO.current;
    s.waiters.push(co);
    return yield SCHED;
  },
};

/* ------------------------------ Class registry ------------------------------ */
const CLASSES = new Map();
class ClassDef {
  constructor(name, parent) {
    this.name = name; this.parent = parent ? CLASSES.get(parent) : null;
    if (parent && !this.parent) throw new Error('unknown parent class ' + parent);
    this.props = new Map(); this.methods = new Map(); this.events = new Set();
    this.chain = this.parent ? [this, ...this.parent.chain] : [this];
    this.names = new Set(this.chain.map((c) => c.name));
    this.creatable = true; this.service = false;
    this._pc = new Map(); this._mc = new Map(); this._ec = new Map();
  }
  prop(k) { let r = this._pc.get(k); if (r !== undefined) return r || undefined; for (const c of this.chain) { const p = c.props.get(k); if (p) { this._pc.set(k, p); return p; } } this._pc.set(k, null); return undefined; }
  method(k) { let r = this._mc.get(k); if (r !== undefined) return r || undefined; for (const c of this.chain) { const m = c.methods.get(k); if (m) { this._mc.set(k, m); return m; } } this._mc.set(k, null); return undefined; }
  event(k) { let r = this._ec.get(k); if (r !== undefined) return r; let f = false; for (const c of this.chain) if (c.events.has(k)) { f = true; break; } this._ec.set(k, f); return f; }
  isA(n) { return this.names.has(n); }
}
// defClass('Part','BasePart',{props:{Shape:Enum..}, events:[], methods:{}, noCreate:true})
function defClass(name, parent, spec) {
  const c = new ClassDef(name, parent);
  spec = spec || {};
  for (const [k, v] of Object.entries(spec.props || {})) {
    c.props.set(k, (v !== null && typeof v === 'object' && v.$p) ? v : { def: v });
  }
  for (const e of spec.events || []) c.events.add(e);
  for (const [k, f] of Object.entries(spec.methods || {})) {
    c.methods.set(k, f.constructor && f.constructor.name === 'GeneratorFunction' ? f : nat(f, k));
  }
  if (spec.noCreate) c.creatable = false;
  if (spec.service) { c.service = true; c.creatable = false; }
  c.init = spec.init || null;
  CLASSES.set(name, c);
  return c;
}
// property descriptor helper
const P = (def, o) => Object.assign({ $p: true, def }, o || {});
const RO = (def, o) => Object.assign({ $p: true, def, ro: true }, o || {});

/* ------------------------------ Instance ------------------------------ */
let nextInstId = 1;
class Instance extends Userdata {
  constructor(cls) {
    super();
    this.cls = cls; this.className = cls.name; this.id = nextInstId++;
    this.props = Object.create(null);
    this.children = []; this.parent = null; this.attrs = null; this.tags = null;
    this.sigs = null; this.psigs = null; this.destroyed = false; this.waiters = null; this.parentLocked = false;
    for (let i = cls.chain.length - 1; i >= 0; i--) for (const [k, p] of cls.chain[i].props) if (p.def !== undefined && !p.get) this.props[k] = p.def;
    this.props.Name = cls.name;
    this.dm = false; // part of game tree
  }
  get tname() { return 'Instance'; }
  tostr() { return this.props.Name; }
  signal(name) {
    if (this.sigs === null) this.sigs = Object.create(null);
    let s = this.sigs[name];
    if (!s) { s = this.sigs[name] = new Signal(name, this); }
    return s;
  }
  hasSignal(name) { return this.sigs !== null && this.sigs[name] !== undefined && (this.sigs[name].conns.length || this.sigs[name].waiters.length); }
  fireSignal(name, ...args) { if (this.sigs !== null) { const s = this.sigs[name]; if (s) s.fire(...args); } }
  isA(n) { return this.cls.names.has(n); }
  fullName() {
    const parts = []; let p = this;
    while (p && p !== ENV.game) { parts.push(p.props.Name); p = p.parent; }
    return parts.reverse().join('.');
  }
  lget(k) {
    const cls = this.cls;
    const pd = cls.prop(k);
    if (pd) {
      if (pd.get) return pd.get(this);
      return this.props[k];
    }
    const m = cls.method(k);
    if (m) return m;
    if (typeof k === 'string' && cls.event(k)) return this.signal(k);
    const ch = this.findChild(k);
    if (ch) return ch;
    if (typeof k !== 'string') throw rtError(`${tostr(k)} is not a valid member of ${this.className} "${this.fullName()}"`);
    throw rtError(`${k} is not a valid member of ${this.className} "${this.fullName()}"`);
  }
  lset(k, v) {
    const pd = this.cls.prop(k);
    if (!pd) throw rtError(`${tostr(k)} is not a valid member of ${this.className} "${this.fullName()}"`);
    if (pd.ro) throw rtError(`${k} is a read-only property of ${this.className}`);
    if (pd.check) v = pd.check(v, this, k);
    if (pd.set) { pd.set(this, v); return; }
    this.setProp(k, v);
  }
  setProp(k, v) {
    const old = this.props[k];
    if (old === v || (old !== undefined && old instanceof Userdata && typeof old.eq === 'function' && old.eq(v) && !(v instanceof Instance))) { return; }
    this.props[k] = v;
    this.changed(k);
  }
  changed(k) {
    if (this.sigs !== null) {
      const ch = this.sigs.Changed;
      if (ch) ch.fire(this.cls.isA('ValueBase') && k === 'Value' ? this.props.Value : k);
    }
    if (this.psigs !== null) { const s = this.psigs[k]; if (s) s.fire(); }
    const L = ENV.listeners.prop; for (let i = 0; i < L.length; i++) L[i](this, k);
  }
  propSignal(k) {
    if (this.psigs === null) this.psigs = Object.create(null);
    return this.psigs[k] || (this.psigs[k] = new Signal('Changed:' + k, this));
  }
  findChild(name) { const ch = this.children; for (let i = 0; i < ch.length; i++) if (ch[i].props.Name === name) return ch[i]; return undefined; }
  isAncestorOf(d) { for (let p = d.parent; p; p = p.parent) if (p === this) return true; return false; }
  descendants(out) {
    out = out || [];
    for (const c of this.children) { out.push(c); c.descendants(out); }
    return out;
  }
  setParent(np) {
    if (np === undefined) np = null;
    if (this.parent === np) return;
    if (this.destroyed || this.parentLocked && np !== null) {
      if (this.destroyed) throw rtError(`The Parent property of ${this.props.Name} is locked, current parent: NULL, new parent ${np ? np.props.Name : 'NULL'}`);
    }
    if (np !== null) {
      if (!(np instanceof Instance)) throw rtError(`Unable to assign property Parent. Instance expected, got ${C.tnameForErr(np)}`);
      if (np === this || this.isAncestorOf(np)) throw rtError(`Attempt to set ${this.fullName()} as its own descendant parent`);
    }
    const old = this.parent;
    const wasIn = this.dm;
    if (old) {
      const i = old.children.indexOf(this); if (i >= 0) old.children.splice(i, 1);
    }
    this.parent = np;
    if (np) np.children.push(this);
    const nowIn = !!(np && np.dm) || this === ENV.game;
    // events
    if (wasIn && !nowIn) { this.walkDm(false); }
    if (old) {
      old.fireSignal('ChildRemoved', this);
      for (let a = old; a; a = a.parent) a.fireSignal('DescendantRemoving', this);
    }
    this.fireSignal('AncestryChanged', this, np);
    for (const d of this.descendants()) d.fireSignal('AncestryChanged', this, np);
    if (np) {
      np.fireSignal('ChildAdded', this);
      for (let a = np; a; a = a.parent) a.fireSignal('DescendantAdded', this);
      if (np.waiters) np.resolveWaiters(this);
    }
    if (!wasIn && nowIn) this.walkDm(true);
    this.changed('Parent');
  }
  walkDm(inTree) {
    const list = [this, ...this.descendants()];
    for (const i of list) i.dm = inTree;
    const L = inTree ? ENV.listeners.attach : ENV.listeners.detach;
    for (const i of list) for (let j = 0; j < L.length; j++) L[j](i);
  }
  resolveWaiters(child) {
    const w = this.waiters; if (!w) return;
    for (let i = w.length - 1; i >= 0; i--) {
      if (w[i].name === child.props.Name) {
        const [e] = w.splice(i, 1);
        if (e.co.sleepEntry) e.co.sleepEntry.dead = true;
        ENV.rt.defer(e.co, [child]);
      }
    }
    if (!w.length) this.waiters = null;
  }
  destroy() {
    if (this.destroyed) return;
    this.fireSignal('Destroying');
    for (const c of this.children.slice()) c.destroy();
    this.setParent(null);
    this.destroyed = true;
    for (const L of ENV.listeners.destroy) L(this);
    if (this.sigs) for (const k of Object.keys(this.sigs)) this.sigs[k].disconnectAll();
  }
  clone() {
    if (this.props.Archivable === false) return undefined;
    const c = new Instance(this.cls);
    Object.assign(c.props, this.props);
    for (const k of Object.keys(c.props)) {
      const v = c.props[k];
      if (v instanceof LuaTable) c.props[k] = cloneTable(v);
    }
    if (this.attrs) c.attrs = new Map(this.attrs);
    if (this.tags) { c.tags = new Set(this.tags); }
    if (this.chunk) c.chunk = this.chunk;
    if (this.cls.cloneExtra) this.cls.cloneExtra(this, c);
    c.props.Parent = undefined;
    const map = new Map([[this, c]]);
    for (const ch of this.children) { const cc = ch.clone(); if (cc) { cc.parent = c; c.children.push(cc); } }
    // fix intra-tree object refs (PrimaryPart, Part0/Part1, Adornee, ObjectValue)
    const orig = [this, ...this.descendants()];
    const copy = [c, ...c.descendants()];
    const m = new Map(); orig.forEach((o, i) => m.set(o, copy[i]));
    for (const cp of copy) for (const k of Object.keys(cp.props)) { const v = cp.props[k]; if (v instanceof Instance && m.has(v)) cp.props[k] = m.get(v); }
    return c;
  }
}
function cloneTable(t) { const n = new LuaTable(t.arr.slice(), t.hash ? new Map(t.hash) : null); n.mt = t.mt; return n; }

function newInstance(className, parent, internal) {
  const cls = CLASSES.get(className);
  if (!cls || (!cls.creatable && !internal)) {
    if (!cls) noteUnsupported('Instance.new("' + className + '")');
    throw rtError(`Unable to create an Instance of type "${className}"`);
  }
  const inst = new Instance(cls);
  if (cls.init) cls.init(inst);
  if (parent !== undefined && parent !== null) inst.setParent(parent);
  return inst;
}

/* Methods of Instance */
const IM = {
  Destroy(self) { self.destroy(); return E; },
  Remove(self) { self.destroy(); return E; },
  ClearAllChildren(self) { for (const c of self.children.slice()) c.destroy(); return E; },
  Clone(self) { return self.clone(); },
  FindFirstChild(self, name, rec) {
    if (typeof name !== 'string') throw rtError(`invalid argument #2 to 'FindFirstChild' (string expected, got ${C.tnameForErr(name)})`);
    if (!rec) return self.findChild(name);
    const stack = self.children.slice();
    // breadth-first as in Roblox
    let q = self.children.slice();
    while (q.length) { const nq = []; for (const c of q) { if (c.props.Name === name) return c; nq.push(...c.children); } q = nq; }
    return undefined;
  },
  FindFirstChildOfClass(self, cn) { return self.children.find((c) => c.className === cn); },
  FindFirstChildWhichIsA(self, cn, rec) {
    const f = (list) => { for (const c of list) if (c.isA(cn)) return c; return undefined; };
    if (!rec) return f(self.children);
    return f(self.descendants());
  },
  FindFirstAncestor(self, name) { for (let p = self.parent; p; p = p.parent) if (p.props.Name === name) return p; return undefined; },
  FindFirstAncestorOfClass(self, cn) { for (let p = self.parent; p; p = p.parent) if (p.className === cn) return p; return undefined; },
  FindFirstAncestorWhichIsA(self, cn) { for (let p = self.parent; p; p = p.parent) if (p.isA(cn)) return p; return undefined; },
  GetChildren(self) { return new LuaTable(self.children.slice()); },
  GetDescendants(self) { return new LuaTable(self.descendants()); },
  GetFullName(self) { return self.fullName(); },
  IsA(self, cn) { return self.isA(cn); },
  IsAncestorOf(self, d) { return self.isAncestorOf(d); },
  IsDescendantOf(self, a) { return a instanceof Instance && a.isAncestorOf(self); },
  GetAttribute(self, n) { return self.attrs ? self.attrs.get(n) : undefined; },
  SetAttribute(self, n, v) {
    if (typeof n !== 'string') throw rtError('invalid attribute name');
    if (!self.attrs) self.attrs = new Map();
    const old = self.attrs.get(n);
    if (old === v) return E;
    if (v === undefined) self.attrs.delete(n); else self.attrs.set(n, v);
    self.fireSignal('AttributeChanged', n);
    if (self.attrSigs && self.attrSigs[n]) self.attrSigs[n].fire();
    return E;
  },
  GetAttributes(self) { const t = new LuaTable(); if (self.attrs) for (const [k, v] of self.attrs) t.set(k, v); return t; },
  GetAttributeChangedSignal(self, n) { if (!self.attrSigs) self.attrSigs = Object.create(null); return self.attrSigs[n] || (self.attrSigs[n] = new Signal('Attr:' + n, self)); },
  GetPropertyChangedSignal(self, n) { return self.propSignal(n); },
  WaitForChild: function* (self, name, timeout) {
    const c = self.findChild(name);
    if (c) return c;
    const co = CO.current;
    (self.waiters || (self.waiters = [])).push({ co, name });
    if (timeout !== undefined) ENV.rt.sleep(co, timeout, [undefined]);
    else ENV.rt.sleep(co, 5, [undefined]), (co.sleepEntry.infiniteWarn = true);
    let r = yield SCHED;
    const isNil = (x) => x === undefined || (x instanceof Array && x[0] === undefined);
    if (timeout === undefined && isNil(r)) {
      ENV.warn(`Infinite yield possible on '${self.fullName()}:WaitForChild("${name}")'`);
      r = yield SCHED;
    }
    if (isNil(r) && self.waiters) { self.waiters = self.waiters.filter((w) => w.co !== co); if (!self.waiters.length) self.waiters = null; }
    return r;
  },
  GetPivot(self) { return pivotOf(self); },
  AddTag(self, t) { ENV.collection.addTag(self, t); return E; },
  RemoveTag(self, t) { ENV.collection.removeTag(self, t); return E; },
  HasTag(self, t) { return !!(self.tags && self.tags.has(t)); },
  GetTags(self) { return new LuaTable(self.tags ? Array.from(self.tags) : []); },
  GetDebugId(self) { return String(self.id); },
  IsPropertyModified() { return false; },
  ResetPropertyToDefault() { return E; },
};
function pivotOf(self) {
  if (self.isA('BasePart')) return self.props.CFrame;
  if (self.isA('Model')) return self.cls.method('GetPivot') === undefined ? undefined : modelPivot(self);
  return new D.CFrame(0, 0, 0);
}
function modelPivot(m) {
  if (m.props.WorldPivot) return m.props.WorldPivot;
  const pp = m.props.PrimaryPart;
  if (pp) return pp.props.CFrame;
  const parts = m.descendants().filter((d) => d.isA('BasePart'));
  if (!parts.length) return new D.CFrame(0, 0, 0);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { const c = p.props.CFrame; mn = [Math.min(mn[0], c.x), Math.min(mn[1], c.y), Math.min(mn[2], c.z)]; mx = [Math.max(mx[0], c.x), Math.max(mx[1], c.y), Math.max(mx[2], c.z)]; }
  return new D.CFrame((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
}

defClass('Instance', null, {
  props: {
    Name: P('Instance', { set(i, v) { if (typeof v !== 'string') throw rtError('Unable to assign property Name. string expected, got ' + C.tnameForErr(v)); i.setProp('Name', v); } }),
    ClassName: P(undefined, { get: (i) => i.className, ro: true }),
    Parent: P(undefined, { get: (i) => i.parent || undefined, set: (i, v) => i.setParent(v) }),
    Archivable: P(true),
  },
  events: ['Changed', 'ChildAdded', 'ChildRemoved', 'DescendantAdded', 'DescendantRemoving', 'AncestryChanged', 'Destroying', 'AttributeChanged'],
  methods: IM, noCreate: true,
});

const IMF = {};
function defMethods(cn, obj) { const c = CLASSES.get(cn); for (const [k, f] of Object.entries(obj)) c.methods.set(k, f.constructor && f.constructor.name === 'GeneratorFunction' ? f : nat(f, k)); }

module.exports = { ENV, Signal, Connection, Instance, ClassDef, CLASSES, defClass, defMethods, P, RO, newInstance, noteUnsupported, ctxOfCurrent, cloneTable, pivotOf, modelPivot };

};
defs["lua2js/runtime.js"]=function(module,exports,require){'use strict';
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

};
defs["lua2js/lib_string.js"]=function(module,exports,require){'use strict';
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

};
defs["lua2js/codegen.js"]=function(module,exports,require){'use strict';
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

};
defs["lua2js/parser.js"]=function(module,exports,require){'use strict';
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

};
defs["rbx/datatypes.js"]=function(module,exports,require){'use strict';
// Roblox data types: Vector3, Vector2, CFrame, Color3, UDim, UDim2, Enum, TweenInfo, Random, BrickColor, ranges/sequences, DateTime...
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E } = C;
const { nat } = require('../lua2js/runtime');
const { fmtG } = C;

const n = (x) => { if (typeof x === 'number') return x; if (x === undefined) return 0; throw rtError(`invalid argument (number expected, got ${C.tnameForErr(x)})`); };
const fmt = (x) => { const s = fmtG(x, 7); return s; }; // roblox prints floats like %g
const mkTable = (obj) => { const t = new LuaTable(); for (const k of Object.keys(obj)) t.set(k, obj[k]); return t; };
const noMember = (tn, k) => rtError(`${tostr(k)} is not a valid member of ${tn}`);
const methodsOf = (obj) => { const m = {}; for (const k of Object.keys(obj)) m[k] = nat(obj[k], k); return m; };

/* ------------------------------ Vector3 ------------------------------ */
class Vector3 extends Userdata {
  constructor(x, y, z) { super(); this.x = x; this.y = y; this.z = z; }
  get tname() { return 'Vector3'; }
  tostr() { return `${fmt(this.x)}, ${fmt(this.y)}, ${fmt(this.z)}`; }
  eq(o) { return o instanceof Vector3 && o.x === this.x && o.y === this.y && o.z === this.z; }
  lget(k) {
    switch (k) {
      case 'X': case 'x': return this.x; case 'Y': case 'y': return this.y; case 'Z': case 'z': return this.z;
      case 'Magnitude': case 'magnitude': return Math.hypot(this.x, this.y, this.z);
      case 'Unit': case 'unit': { const m = Math.hypot(this.x, this.y, this.z); return m === 0 ? new Vector3(0, 0, 0) : new Vector3(this.x / m, this.y / m, this.z / m); }
    }
    const f = V3M[k]; if (f) return f;
    throw noMember('Vector3', k);
  }
  arith(op, a, b) {
    const va = a instanceof Vector3, vb = b instanceof Vector3;
    switch (op) {
      case 'add': if (va && vb) return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); break;
      case 'sub': if (va && vb) return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); break;
      case 'mul':
        if (va && vb) return new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
        if (va && typeof b === 'number') return new Vector3(a.x * b, a.y * b, a.z * b);
        if (vb && typeof a === 'number') return new Vector3(a * b.x, a * b.y, a * b.z); break;
      case 'div':
        if (va && vb) return new Vector3(a.x / b.x, a.y / b.y, a.z / b.z);
        if (va && typeof b === 'number') return new Vector3(a.x / b, a.y / b, a.z / b);
        if (vb && typeof a === 'number') return new Vector3(a / b.x, a / b.y, a / b.z); break;
      case 'idiv':
        if (va && typeof b === 'number') return new Vector3(Math.floor(a.x / b), Math.floor(a.y / b), Math.floor(a.z / b));
        if (va && vb) return new Vector3(Math.floor(a.x / b.x), Math.floor(a.y / b.y), Math.floor(a.z / b.z)); break;
      case 'unm': return new Vector3(-a.x, -a.y, -a.z);
    }
    throw rtError(`attempt to perform arithmetic (${op}) on ${C.tnameForErr(a)} and ${C.tnameForErr(b)}`);
  }
}
const v3 = (x, y, z) => new Vector3(x, y, z);
const V3M = methodsOf({
  Dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  Cross: (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x),
  Lerp: (a, b, t) => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
  Angle: (a, b) => { const d = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)); return Math.acos(Math.max(-1, Math.min(1, d))); },
  FuzzyEq: (a, b, eps) => { eps = eps === undefined ? 1e-5 : eps; return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps; },
  Min: (a, b) => v3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
  Max: (a, b) => v3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
  Abs: (a) => v3(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)),
  Ceil: (a) => v3(Math.ceil(a.x), Math.ceil(a.y), Math.ceil(a.z)),
  Floor: (a) => v3(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)),
  Sign: (a) => v3(Math.sign(a.x), Math.sign(a.y), Math.sign(a.z)),
});
const Vector3Lib = mkTable({
  new: nat((x, y, z) => v3(n(x), n(y), n(z)), 'new'),
  zero: v3(0, 0, 0), one: v3(1, 1, 1), xAxis: v3(1, 0, 0), yAxis: v3(0, 1, 0), zAxis: v3(0, 0, 1),
  FromNormalId: nat((e) => { const m = { Right: [1, 0, 0], Top: [0, 1, 0], Back: [0, 0, 1], Left: [-1, 0, 0], Bottom: [0, -1, 0], Front: [0, 0, -1] }[e && e.Name] || [0, 0, 0]; return v3(...m); }, 'FromNormalId'),
});

/* ------------------------------ Vector2 ------------------------------ */
class Vector2 extends Userdata {
  constructor(x, y) { super(); this.x = x; this.y = y; }
  get tname() { return 'Vector2'; }
  tostr() { return `${fmt(this.x)}, ${fmt(this.y)}`; }
  eq(o) { return o instanceof Vector2 && o.x === this.x && o.y === this.y; }
  lget(k) {
    switch (k) {
      case 'X': case 'x': return this.x; case 'Y': case 'y': return this.y;
      case 'Magnitude': case 'magnitude': return Math.hypot(this.x, this.y);
      case 'Unit': case 'unit': { const m = Math.hypot(this.x, this.y); return m === 0 ? new Vector2(0, 0) : new Vector2(this.x / m, this.y / m); }
    }
    const f = V2M[k]; if (f) return f;
    throw noMember('Vector2', k);
  }
  arith(op, a, b) {
    const va = a instanceof Vector2, vb = b instanceof Vector2;
    const o = { add: (p, q) => p + q, sub: (p, q) => p - q, mul: (p, q) => p * q, div: (p, q) => p / q, idiv: (p, q) => Math.floor(p / q) }[op];
    if (op === 'unm') return new Vector2(-a.x, -a.y);
    if (o) {
      if (va && vb) return new Vector2(o(a.x, b.x), o(a.y, b.y));
      if (va && typeof b === 'number') return new Vector2(o(a.x, b), o(a.y, b));
      if (vb && typeof a === 'number') return new Vector2(o(a, b.x), o(a, b.y));
    }
    throw rtError(`attempt to perform arithmetic (${op}) on ${C.tnameForErr(a)} and ${C.tnameForErr(b)}`);
  }
}
const V2M = methodsOf({
  Dot: (a, b) => a.x * b.x + a.y * b.y,
  Cross: (a, b) => a.x * b.y - a.y * b.x,
  Lerp: (a, b, t) => new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
  Min: (a, b) => new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y)),
  Max: (a, b) => new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y)),
  Abs: (a) => new Vector2(Math.abs(a.x), Math.abs(a.y)),
  FuzzyEq: (a, b, eps) => { eps = eps === undefined ? 1e-5 : eps; return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps; },
});
const Vector2Lib = mkTable({ new: nat((x, y) => new Vector2(n(x), n(y)), 'new'), zero: new Vector2(0, 0), one: new Vector2(1, 1), xAxis: new Vector2(1, 0), yAxis: new Vector2(0, 1) });

/* ------------------------------ CFrame ------------------------------ */
// rotation stored as row-major r = [r00,r01,r02, r10,r11,r12, r20,r21,r22]
class CFrame extends Userdata {
  constructor(x, y, z, r) { super(); this.x = x; this.y = y; this.z = z; this.r = r || [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
  get tname() { return 'CFrame'; }
  tostr() { const r = this.r; return [this.x, this.y, this.z, ...r].map(fmt).join(', '); }
  eq(o) { return o instanceof CFrame && o.x === this.x && o.y === this.y && o.z === this.z && o.r.every((v, i) => v === this.r[i]); }
  get pos() { return v3(this.x, this.y, this.z); }
  lget(k) {
    const r = this.r;
    switch (k) {
      case 'Position': case 'p': return v3(this.x, this.y, this.z);
      case 'X': case 'x': return this.x; case 'Y': case 'y': return this.y; case 'Z': case 'z': return this.z;
      case 'LookVector': case 'lookVector': return v3(-r[2], -r[5], -r[8]);
      case 'RightVector': case 'rightVector': return v3(r[0], r[3], r[6]);
      case 'UpVector': case 'upVector': return v3(r[1], r[4], r[7]);
      case 'XVector': return v3(r[0], r[3], r[6]);
      case 'YVector': return v3(r[1], r[4], r[7]);
      case 'ZVector': return v3(r[2], r[5], r[8]);
      case 'Rotation': return new CFrame(0, 0, 0, r.slice());
    }
    const f = CFM[k]; if (f) return f;
    throw noMember('CFrame', k);
  }
  arith(op, a, b) {
    if (op === 'mul') {
      if (a instanceof CFrame && b instanceof CFrame) return cfMul(a, b);
      if (a instanceof CFrame && b instanceof Vector3) return cfPoint(a, b);
    } else if (op === 'add' && a instanceof CFrame && b instanceof Vector3) return new CFrame(a.x + b.x, a.y + b.y, a.z + b.z, a.r);
    else if (op === 'sub' && a instanceof CFrame && b instanceof Vector3) return new CFrame(a.x - b.x, a.y - b.y, a.z - b.z, a.r);
    throw rtError(`attempt to perform arithmetic (${op}) on ${C.tnameForErr(a)} and ${C.tnameForErr(b)}`);
  }
}
function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const matT = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
function cfMul(a, b) {
  const r = a.r;
  return new CFrame(a.x + r[0] * b.x + r[1] * b.y + r[2] * b.z, a.y + r[3] * b.x + r[4] * b.y + r[5] * b.z, a.z + r[6] * b.x + r[7] * b.y + r[8] * b.z, matMul(a.r, b.r));
}
function cfPoint(a, p) { const r = a.r; return v3(a.x + r[0] * p.x + r[1] * p.y + r[2] * p.z, a.y + r[3] * p.x + r[4] * p.y + r[5] * p.z, a.z + r[6] * p.x + r[7] * p.y + r[8] * p.z); }
function cfInverse(a) { const rt = matT(a.r); return new CFrame(-(rt[0] * a.x + rt[1] * a.y + rt[2] * a.z), -(rt[3] * a.x + rt[4] * a.y + rt[5] * a.z), -(rt[6] * a.x + rt[7] * a.y + rt[8] * a.z), rt); }
function rotVec(r, v) { return v3(r[0] * v.x + r[1] * v.y + r[2] * v.z, r[3] * v.x + r[4] * v.y + r[5] * v.z, r[6] * v.x + r[7] * v.y + r[8] * v.z); }
function rotFromAxes(rx, ry, rz) { // intrinsic XYZ euler: R = Rx * Ry * Rz
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return matMul(matMul(Rx, Ry), Rz);
}
function rotFromYXZ(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return matMul(matMul(Ry, Rx), Rz);
}
function lookRot(from, to, up) {
  let zx = from.x - to.x, zy = from.y - to.y, zz = from.z - to.z;
  let zl = Math.hypot(zx, zy, zz); if (zl === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
  let xl = Math.hypot(xx, xy, xz);
  if (xl < 1e-9) { // parallel up
    xx = 1; xy = 0; xz = 0; if (Math.abs(zx) > 0.9) { xx = 0; xz = 1; }
    xx = zy * 0 - zz * 0; // fallback cross with (0,0,1)
    const ax = up.y > 0 ? [0, 0, -1] : [0, 0, 1];
    xx = ax[1] * zz - ax[2] * zy; xy = ax[2] * zx - ax[0] * zz; xz = ax[0] * zy - ax[1] * zx; xl = Math.hypot(xx, xy, xz) || 1;
  }
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, xy, yy, zy, xz, yz, zz];
}
function quatToRot(qx, qy, qz, qw) {
  const l = Math.hypot(qx, qy, qz, qw) || 1; qx /= l; qy /= l; qz /= l; qw /= l;
  return [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw), 2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw), 2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)];
}
function rotToQuat(r) {
  const t = r[0] + r[4] + r[8]; let qx, qy, qz, qw;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; qw = s / 4; qx = (r[7] - r[5]) / s; qy = (r[2] - r[6]) / s; qz = (r[3] - r[1]) / s; }
  else if (r[0] > r[4] && r[0] > r[8]) { const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2; qw = (r[7] - r[5]) / s; qx = s / 4; qy = (r[1] + r[3]) / s; qz = (r[2] + r[6]) / s; }
  else if (r[4] > r[8]) { const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2; qw = (r[2] - r[6]) / s; qx = (r[1] + r[3]) / s; qy = s / 4; qz = (r[5] + r[7]) / s; }
  else { const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2; qw = (r[3] - r[1]) / s; qx = (r[2] + r[6]) / s; qy = (r[5] + r[7]) / s; qz = s / 4; }
  return [qx, qy, qz, qw];
}
function eulerXYZ(r) { // returns rx, ry, rz such that rotFromAxes(rx,ry,rz) = r
  const sy = Math.max(-1, Math.min(1, r[2]));
  const ry = Math.asin(sy);
  if (Math.abs(sy) < 0.999999) return [Math.atan2(-r[5], r[8]), ry, Math.atan2(-r[1], r[0])];
  return [Math.atan2(r[7], r[4]), ry, 0];
}
function eulerYXZ(r) {
  const sx = Math.max(-1, Math.min(1, -r[5]));
  const rx = Math.asin(sx);
  if (Math.abs(sx) < 0.999999) return [rx, Math.atan2(r[2], r[8]), Math.atan2(r[3], r[4])];
  return [rx, Math.atan2(-r[6], r[0]), 0];
}
function cfLerp(a, b, t) {
  const qa = rotToQuat(a.r), qb = rotToQuat(b.r);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  const sgn = dot < 0 ? -1 : 1; dot = Math.abs(dot);
  let q;
  if (dot > 0.9995) q = qa.map((v, i) => v + (sgn * qb[i] - v) * t);
  else { const th = Math.acos(dot), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s * sgn; q = qa.map((v, i) => v * w1 + qb[i] * w2); }
  return new CFrame(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, quatToRot(...q));
}
const CFM = methodsOf({
  Inverse: (a) => cfInverse(a),
  Lerp: (a, b, t) => cfLerp(a, b, t),
  ToWorldSpace: (a, b) => cfMul(a, b),
  ToObjectSpace: (a, b) => cfMul(cfInverse(a), b),
  PointToWorldSpace: (a, p) => cfPoint(a, p),
  PointToObjectSpace: (a, p) => cfPoint(cfInverse(a), p),
  VectorToWorldSpace: (a, v) => rotVec(a.r, v),
  VectorToObjectSpace: (a, v) => rotVec(matT(a.r), v),
  ToEulerAnglesXYZ: (a) => eulerXYZ(a.r),
  ToEulerAngles: (a) => eulerXYZ(a.r),
  ToOrientation: (a) => eulerYXZ(a.r),
  ToEulerAnglesYXZ: (a) => eulerYXZ(a.r),
  GetComponents: (a) => [a.x, a.y, a.z, ...a.r],
  components: (a) => [a.x, a.y, a.z, ...a.r],
  ToAxisAngle: (a) => { const q = rotToQuat(a.r); const w = Math.max(-1, Math.min(1, q[3])); const ang = 2 * Math.acos(w); const s = Math.sqrt(1 - w * w) || 1; return [v3(q[0] / s, q[1] / s, q[2] / s), ang]; },
  FuzzyEq: (a, b, eps) => { eps = eps === undefined ? 1e-5 : eps; return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps && a.r.every((v, i) => Math.abs(v - b.r[i]) <= eps); },
  Orthonormalize: (a) => a,
});
const CFrameLib = mkTable({
  new: nat((...a) => {
    if (a.length === 0) return new CFrame(0, 0, 0);
    if (a.length === 1 && a[0] instanceof Vector3) return new CFrame(a[0].x, a[0].y, a[0].z);
    if (a.length === 2 && a[0] instanceof Vector3 && a[1] instanceof Vector3) return new CFrame(a[0].x, a[0].y, a[0].z, lookRot(a[0], a[1], v3(0, 1, 0)));
    if (a.length === 3) return new CFrame(n(a[0]), n(a[1]), n(a[2]));
    if (a.length === 7) return new CFrame(a[0], a[1], a[2], quatToRot(a[3], a[4], a[5], a[6]));
    if (a.length === 12) return new CFrame(a[0], a[1], a[2], a.slice(3));
    throw rtError('invalid arguments to CFrame.new');
  }, 'new'),
  Angles: nat((x, y, z) => new CFrame(0, 0, 0, rotFromAxes(n(x), n(y), n(z))), 'Angles'),
  fromEulerAnglesXYZ: nat((x, y, z) => new CFrame(0, 0, 0, rotFromAxes(n(x), n(y), n(z))), 'fromEulerAnglesXYZ'),
  fromEulerAnglesYXZ: nat((x, y, z) => new CFrame(0, 0, 0, rotFromYXZ(n(x), n(y), n(z))), 'fromEulerAnglesYXZ'),
  fromOrientation: nat((x, y, z) => new CFrame(0, 0, 0, rotFromYXZ(n(x), n(y), n(z))), 'fromOrientation'),
  lookAt: nat((at, target, up) => new CFrame(at.x, at.y, at.z, lookRot(at, target, up || v3(0, 1, 0))), 'lookAt'),
  fromMatrix: nat((pos, vx, vy, vz) => { vz = vz || v3(vx.y * vy.z - vx.z * vy.y, vx.z * vy.x - vx.x * vy.z, vx.x * vy.y - vx.y * vy.x); return new CFrame(pos.x, pos.y, pos.z, [vx.x, vy.x, vz.x, vx.y, vy.y, vz.y, vx.z, vy.z, vz.z]); }, 'fromMatrix'),
  fromAxisAngle: nat((axis, ang) => { const l = Math.hypot(axis.x, axis.y, axis.z) || 1; const s = Math.sin(ang / 2); return new CFrame(0, 0, 0, quatToRot(axis.x / l * s, axis.y / l * s, axis.z / l * s, Math.cos(ang / 2))); }, 'fromAxisAngle'),
  identity: new CFrame(0, 0, 0),
});

/* ------------------------------ Color3 ------------------------------ */
class Color3 extends Userdata {
  constructor(r, g, b) { super(); this.r = r; this.g = g; this.b = b; }
  get tname() { return 'Color3'; }
  tostr() { return `${fmt(this.r)}, ${fmt(this.g)}, ${fmt(this.b)}`; }
  eq(o) { return o instanceof Color3 && o.r === this.r && o.g === this.g && o.b === this.b; }
  lget(k) {
    switch (k) { case 'R': return this.r; case 'G': return this.g; case 'B': return this.b; }
    const f = C3M[k]; if (f) return f;
    throw noMember('Color3', k);
  }
  css() { const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${c(this.r)},${c(this.g)},${c(this.b)})`; }
  hex() { const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0'); return c(this.r) + c(this.g) + c(this.b); }
}
function hsv2rgb(h, s, v) {
  h = (h % 1 + 1) % 1; const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}
const C3M = methodsOf({
  Lerp: (a, b, t) => new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t),
  ToHSV: (c) => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), d = mx - mn; let h = 0; if (d) { if (mx === c.r) h = ((c.g - c.b) / d + 6) % 6; else if (mx === c.g) h = (c.b - c.r) / d + 2; else h = (c.r - c.g) / d + 4; h /= 6; } return [h, mx ? d / mx : 0, mx]; },
  ToHex: (c) => c.hex(),
});
const Color3Lib = mkTable({
  new: nat((r, g, b) => new Color3(n(r), n(g), n(b)), 'new'),
  fromRGB: nat((r, g, b) => new Color3(n(r) / 255, n(g) / 255, n(b) / 255), 'fromRGB'),
  fromHSV: nat((h, s, v) => new Color3(...hsv2rgb(n(h), n(s), n(v))), 'fromHSV'),
  fromHex: nat((h) => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const v = parseInt(h, 16); return new Color3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); }, 'fromHex'),
});

/* ------------------------------ UDim / UDim2 ------------------------------ */
class UDim extends Userdata {
  constructor(s, o) { super(); this.s = s; this.o = o; }
  get tname() { return 'UDim'; }
  tostr() { return `${fmt(this.s)}, ${fmt(this.o)}`; }
  eq(o) { return o instanceof UDim && o.s === this.s && o.o === this.o; }
  lget(k) { if (k === 'Scale') return this.s; if (k === 'Offset') return this.o; throw noMember('UDim', k); }
  arith(op, a, b) { if (op === 'add' && a instanceof UDim && b instanceof UDim) return new UDim(a.s + b.s, a.o + b.o); if (op === 'sub' && a instanceof UDim && b instanceof UDim) return new UDim(a.s - b.s, a.o - b.o); throw rtError('invalid UDim arithmetic'); }
}
class UDim2 extends Userdata {
  constructor(xs, xo, ys, yo) { super(); this.xs = xs; this.xo = xo; this.ys = ys; this.yo = yo; }
  get tname() { return 'UDim2'; }
  tostr() { return `{${fmt(this.xs)}, ${fmt(this.xo)}}, {${fmt(this.ys)}, ${fmt(this.yo)}}`; }
  eq(o) { return o instanceof UDim2 && o.xs === this.xs && o.xo === this.xo && o.ys === this.ys && o.yo === this.yo; }
  lget(k) {
    switch (k) {
      case 'X': return new UDim(this.xs, this.xo); case 'Y': return new UDim(this.ys, this.yo);
      case 'Width': return new UDim(this.xs, this.xo); case 'Height': return new UDim(this.ys, this.yo);
    }
    const f = U2M[k]; if (f) return f;
    throw noMember('UDim2', k);
  }
  arith(op, a, b) {
    if (a instanceof UDim2 && b instanceof UDim2) {
      if (op === 'add') return new UDim2(a.xs + b.xs, a.xo + b.xo, a.ys + b.ys, a.yo + b.yo);
      if (op === 'sub') return new UDim2(a.xs - b.xs, a.xo - b.xo, a.ys - b.ys, a.yo - b.yo);
    }
    throw rtError('invalid UDim2 arithmetic');
  }
}
const U2M = methodsOf({
  Lerp: (a, b, t) => new UDim2(a.xs + (b.xs - a.xs) * t, a.xo + (b.xo - a.xo) * t, a.ys + (b.ys - a.ys) * t, a.yo + (b.yo - a.yo) * t),
});
const UDimLib = mkTable({ new: nat((s, o) => new UDim(n(s), n(o)), 'new') });
const UDim2Lib = mkTable({
  new: nat((a, b, c, d) => {
    if (a instanceof UDim) return new UDim2(a.s, a.o, b.s, b.o);
    return new UDim2(n(a), n(b), n(c), n(d));
  }, 'new'),
  fromScale: nat((x, y) => new UDim2(n(x), 0, n(y), 0), 'fromScale'),
  fromOffset: nat((x, y) => new UDim2(0, n(x), 0, n(y)), 'fromOffset'),
});

/* ------------------------------ Rect / Ray / ranges ------------------------------ */
class Rect extends Userdata {
  constructor(a, b, c, d) { super(); this.minx = a; this.miny = b; this.maxx = c; this.maxy = d; }
  get tname() { return 'Rect'; }
  tostr() { return `${fmt(this.minx)}, ${fmt(this.miny)}, ${fmt(this.maxx)}, ${fmt(this.maxy)}`; }
  lget(k) {
    switch (k) { case 'Min': return new Vector2(this.minx, this.miny); case 'Max': return new Vector2(this.maxx, this.maxy); case 'Width': return this.maxx - this.minx; case 'Height': return this.maxy - this.miny; }
    throw noMember('Rect', k);
  }
}
const RectLib = mkTable({ new: nat((a, b, c, d) => (a instanceof Vector2 ? new Rect(a.x, a.y, b.x, b.y) : new Rect(a, b, c, d)), 'new') });
class Ray extends Userdata {
  constructor(o, d) { super(); this.o = o; this.d = d; }
  get tname() { return 'Ray'; }
  lget(k) {
    switch (k) {
      case 'Origin': return this.o; case 'Direction': return this.d;
      case 'Unit': { const m = Math.hypot(this.d.x, this.d.y, this.d.z) || 1; return new Ray(this.o, v3(this.d.x / m, this.d.y / m, this.d.z / m)); }
      case 'ClosestPoint': return nat((self, p) => { const m = self.d.x * self.d.x + self.d.y * self.d.y + self.d.z * self.d.z || 1; const t = Math.max(0, Math.min(1, ((p.x - self.o.x) * self.d.x + (p.y - self.o.y) * self.d.y + (p.z - self.o.z) * self.d.z) / m)); return v3(self.o.x + self.d.x * t, self.o.y + self.d.y * t, self.o.z + self.d.z * t); }, 'ClosestPoint');
      case 'Distance': return nat((self, p) => { const c = RAYM.cp(self, p); return Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z); }, 'Distance');
    }
    throw noMember('Ray', k);
  }
}
const RAYM = { cp: (self, p) => { const m = self.d.x * self.d.x + self.d.y * self.d.y + self.d.z * self.d.z || 1; const t = Math.max(0, Math.min(1, ((p.x - self.o.x) * self.d.x + (p.y - self.o.y) * self.d.y + (p.z - self.o.z) * self.d.z) / m)); return v3(self.o.x + self.d.x * t, self.o.y + self.d.y * t, self.o.z + self.d.z * t); } };
const RayLib = mkTable({ new: nat((o, d) => new Ray(o, d), 'new') });

class NumberRange extends Userdata {
  constructor(a, b) { super(); this.min = a; this.max = b; }
  get tname() { return 'NumberRange'; }
  tostr() { return `${fmt(this.min)} ${fmt(this.max)}`; }
  lget(k) { if (k === 'Min') return this.min; if (k === 'Max') return this.max; throw noMember('NumberRange', k); }
}
const NumberRangeLib = mkTable({ new: nat((a, b) => new NumberRange(n(a), b === undefined ? n(a) : n(b)), 'new') });
class Keypoint extends Userdata {
  constructor(kind, time, value, env) { super(); this.kind = kind; this.time = time; this.value = value; this.env = env || 0; }
  get tname() { return this.kind + 'Keypoint'; }
  tostr() { return `${fmt(this.time)} ${this.kind === 'Number' ? fmt(this.value) : this.value.tostr()}`; }
  lget(k) { if (k === 'Time') return this.time; if (k === 'Value') return this.value; if (k === 'Envelope') return this.env; throw noMember(this.tname, k); }
}
class Sequence extends Userdata {
  constructor(kind, kps) { super(); this.kind = kind; this.kps = kps; }
  get tname() { return this.kind + 'Sequence'; }
  tostr() { return this.kps.map((k) => k.tostr()).join(' '); }
  lget(k) { if (k === 'Keypoints') return new LuaTable(this.kps.slice()); throw noMember(this.tname, k); }
  at(t) {
    const k = this.kps;
    if (t <= k[0].time) return k[0].value;
    for (let i = 1; i < k.length; i++) if (t <= k[i].time) {
      const a = k[i - 1], b = k[i], f = (t - a.time) / ((b.time - a.time) || 1);
      if (this.kind === 'Number') return a.value + (b.value - a.value) * f;
      return new Color3(a.value.r + (b.value.r - a.value.r) * f, a.value.g + (b.value.g - a.value.g) * f, a.value.b + (b.value.b - a.value.b) * f);
    }
    return k[k.length - 1].value;
  }
}
const NumberSequenceLib = mkTable({
  new: nat((a, b) => {
    if (a instanceof LuaTable) return new Sequence('Number', a.arr.slice());
    if (b === undefined) return new Sequence('Number', [new Keypoint('Number', 0, a), new Keypoint('Number', 1, a)]);
    return new Sequence('Number', [new Keypoint('Number', 0, a), new Keypoint('Number', 1, b)]);
  }, 'new'),
});
const NumberSequenceKeypointLib = mkTable({ new: nat((t, v, e) => new Keypoint('Number', t, v, e), 'new') });
const ColorSequenceLib = mkTable({
  new: nat((a, b) => {
    if (a instanceof LuaTable) return new Sequence('Color', a.arr.slice());
    if (a instanceof Color3 && b === undefined) return new Sequence('Color', [new Keypoint('Color', 0, a), new Keypoint('Color', 1, a)]);
    return new Sequence('Color', [new Keypoint('Color', 0, a), new Keypoint('Color', 1, b)]);
  }, 'new'),
});
const ColorSequenceKeypointLib = mkTable({ new: nat((t, v) => new Keypoint('Color', t, v), 'new') });

/* ------------------------------ Enum ------------------------------ */
class EnumItem extends Userdata {
  constructor(type, name, value) { super(); this.type = type; this.name = name; this.value = value; }
  get tname() { return 'EnumItem'; }
  tostr() { return `Enum.${this.type.name}.${this.name}`; }
  lget(k) {
    if (k === 'Name') return this.name; if (k === 'Value') return this.value; if (k === 'EnumType') return this.type;
    if (k === 'IsA') return nat((self, nm) => nm === self.type.name || nm === 'EnumItem', 'IsA');
    throw noMember('EnumItem', k);
  }
}
class EnumType extends Userdata {
  constructor(name, items, lenient) { super(); this.name = name; this.items = new Map(); this.lenient = !!lenient; let i = 0; for (const it of items) { const [nm, v] = Array.isArray(it) ? it : [it, i]; this.items.set(nm, new EnumItem(this, nm, v)); i = (typeof v === 'number' ? v : i) + 1; } }
  get tname() { return 'Enum'; }
  tostr() { return this.name; }
  lget(k) {
    const it = this.items.get(k); if (it) return it;
    if (k === 'GetEnumItems') return nat(() => new LuaTable(Array.from(this.items.values())), 'GetEnumItems');
    if (k === 'FromName') return nat((self, nm) => self.items.get(nm), 'FromName');
    if (k === 'FromValue') return nat((self, v) => { for (const i of self.items.values()) if (i.value === v) return i; return undefined; }, 'FromValue');
    if (typeof k === 'string' && this.lenient) { const it2 = new EnumItem(this, k, this.items.size); this.items.set(k, it2); enumMisses.add(`Enum.${this.name}.${k}`); return it2; }
    throw rtError(`${tostr(k)} is not a valid member of Enum.${this.name}`);
  }
}
const enumMisses = new Set();
const enumTypes = new Map();
class EnumRoot extends Userdata {
  get tname() { return 'Enums'; }
  tostr() { return 'Enum'; }
  lget(k) {
    const t = enumTypes.get(k); if (t) return t;
    if (k === 'GetEnums') return nat(() => new LuaTable(Array.from(enumTypes.values())), 'GetEnums');
    if (typeof k === 'string') { const t2 = new EnumType(k, [], true); enumTypes.set(k, t2); enumMisses.add(`Enum.${k}`); return t2; }
    throw noMember('Enum', k);
  }
}
const defEnum = (name, items) => { enumTypes.set(name, new EnumType(name, items)); };
function seq(names, start = 0) { return names.map((nm, i) => [nm, start + i]); }
defEnum('Material', [['Plastic', 256], ['SmoothPlastic', 272], ['Neon', 288], ['Wood', 512], ['WoodPlanks', 528], ['Marble', 784], ['Basalt', 788], ['Slate', 800], ['CrackedLava', 804], ['Concrete', 816], ['Limestone', 820], ['Granite', 832], ['Pavement', 836], ['Brick', 848], ['Pebble', 864], ['Cobblestone', 880], ['Rock', 896], ['Sandstone', 912], ['CorrodedMetal', 1040], ['DiamondPlate', 1056], ['Foil', 1072], ['Metal', 1088], ['Grass', 1280], ['LeafyGrass', 1284], ['Sand', 1296], ['Fabric', 1312], ['Snow', 1328], ['Mud', 1344], ['Ground', 1360], ['Asphalt', 1376], ['Salt', 1392], ['Ice', 1536], ['Glacier', 1552], ['Glass', 1568], ['ForceField', 1584], ['Air', 1792], ['Water', 2048]]);
defEnum('PartType', ['Ball', 'Block', 'Cylinder', 'Wedge', 'CornerWedge']);
defEnum('UserInputType', ['MouseButton1', 'MouseButton2', 'MouseButton3', 'MouseWheel', 'MouseMovement', 'Touch', 'Keyboard', 'Focus', 'Accelerometer', 'Gyro', 'Gamepad1', 'TextInput', 'None']);
defEnum('UserInputState', ['Begin', 'Change', 'End', 'Cancel', 'None']);
const KEYS = ['Backspace:8', 'Tab:9', 'Return:13', 'Escape:27', 'Space:32', 'PageUp:280', 'PageDown:281', 'End:279', 'Home:278', 'Left:276', 'Up:273', 'Right:275', 'Down:274', 'Insert:277', 'Delete:127', 'LeftShift:304', 'RightShift:303', 'LeftControl:306', 'RightControl:305', 'LeftAlt:308', 'RightAlt:307', 'Backquote:96', 'Minus:45', 'Equals:61', 'Comma:44', 'Period:46', 'Slash:47', 'Semicolon:59', 'Quote:39', 'LeftBracket:91', 'RightBracket:93', 'BackSlash:92', 'Unknown:0', 'CapsLock:301'];
{
  const items = KEYS.map((s) => { const [a, b] = s.split(':'); return [a, +b]; });
  for (let c = 65; c <= 90; c++) items.push([String.fromCharCode(c), c + 32]);
  const dn = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  dn.forEach((d, i) => items.push([d, 48 + i]));
  for (let i = 1; i <= 12; i++) items.push(['F' + i, 281 + i]);
  dn.forEach((d, i) => items.push(['Keypad' + d, 256 + i]));
  items.push(['ButtonA', 1000], ['ButtonB', 1001], ['ButtonX', 1002], ['ButtonY', 1003], ['ButtonR1', 1004], ['ButtonL1', 1005], ['ButtonR2', 1006], ['ButtonL2', 1007], ['Thumbstick1', 1008], ['Thumbstick2', 1009], ['DPadUp', 1010], ['DPadDown', 1011], ['DPadLeft', 1012], ['DPadRight', 1013], ['ButtonStart', 1014], ['ButtonSelect', 1015]);
  defEnum('KeyCode', items);
}
defEnum('EasingStyle', ['Linear', 'Sine', 'Back', 'Quad', 'Quart', 'Quint', 'Bounce', 'Elastic', 'Exponential', 'Circular', 'Cubic']);
defEnum('EasingDirection', ['In', 'Out', 'InOut']);
defEnum('PlaybackState', ['Begin', 'Delayed', 'Playing', 'Paused', 'Completed', 'Cancelled']);
defEnum('TweenStatus', ['Canceled', 'Completed']);
defEnum('Font', ['Legacy', 'Arial', 'ArialBold', 'SourceSans', 'SourceSansBold', 'SourceSansSemibold', 'SourceSansLight', 'SourceSansItalic', 'Bodoni', 'Garamond', 'Cartoon', 'Code', 'Highway', 'SciFi', 'Arcade', 'Fantasy', 'Antique', 'Gotham', 'GothamMedium', 'GothamBold', 'GothamBlack', 'AmaticSC', 'Bangers', 'Creepster', 'DenkOne', 'Fondamento', 'FredokaOne', 'GrenzeGotisch', 'IndieFlower', 'JosefinSans', 'Jura', 'Kalam', 'LuckiestGuy', 'Merriweather', 'Michroma', 'Nunito', 'Oswald', 'PatrickHand', 'PermanentMarker', 'Roboto', 'RobotoCondensed', 'RobotoMono', 'Sarpanch', 'SpecialElite', 'TitilliumWeb', 'Ubuntu', 'BuilderSans', 'BuilderSansMedium', 'BuilderSansBold', 'BuilderSansExtraBold', 'Montserrat', 'Unknown']);
defEnum('TextXAlignment', ['Left', 'Right', 'Center']);
defEnum('TextYAlignment', ['Top', 'Center', 'Bottom']);
defEnum('TextTruncate', ['None', 'AtEnd']);
defEnum('FillDirection', ['Horizontal', 'Vertical']);
defEnum('HorizontalAlignment', ['Center', 'Left', 'Right']);
defEnum('VerticalAlignment', ['Center', 'Top', 'Bottom']);
defEnum('SortOrder', ['Name', 'Custom', 'LayoutOrder']);
defEnum('StartCorner', ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight']);
defEnum('ScaleType', ['Stretch', 'Slice', 'Tile', 'Fit', 'Crop']);
defEnum('SizeConstraint', ['RelativeXY', 'RelativeXX', 'RelativeYY']);
defEnum('AutomaticSize', ['None', 'X', 'Y', 'XY']);
defEnum('ZIndexBehavior', ['Global', 'Sibling']);
defEnum('ApplyStrokeMode', ['Contextual', 'Border']);
defEnum('LineJoinMode', ['Round', 'Bevel', 'Miter']);
defEnum('CameraType', ['Fixed', 'Watch', 'Attach', 'Track', 'Follow', 'Custom', 'Scriptable', 'Orbital']);
defEnum('HumanoidStateType', ['FallingDown', 'Running', 'RunningNoPhysics', 'Climbing', 'StrafingNoPhysics', 'Ragdoll', 'GettingUp', 'Jumping', 'Landed', 'Flying', 'Freefall', 'Seated', 'PlatformStanding', 'Dead', 'Swimming', 'Physics', 'None']);
defEnum('HumanoidDisplayDistanceType', ['Viewer', 'Subject', 'None']);
defEnum('NormalId', ['Right', 'Top', 'Back', 'Left', 'Bottom', 'Front']);
defEnum('Axis', ['X', 'Y', 'Z']);
defEnum('MembershipType', [['None', 0], ['BuildersClub', 1], ['TurboBuildersClub', 2], ['OutrageousBuildersClub', 3], ['Premium', 4]]);
defEnum('ProductPurchaseDecision', ['NotProcessedYet', 'PurchaseGranted']);
defEnum('InfoType', ['Asset', 'Product', 'GamePass', 'Subscription', 'Bundle']);
defEnum('ScrollingDirection', [['X', 1], ['Y', 2], ['XY', 4]]);
defEnum('RunContext', ['Legacy', 'Server', 'Client', 'Plugin']);
defEnum('SurfaceType', ['Smooth', 'Glue', 'Weld', 'Studs', 'Inlet', 'Universal', 'Hinge', 'Motor', 'SteppingMotor', 'SmoothNoOutlines']);
defEnum('RollOffMode', ['Inverse', 'Linear', 'LinearSquare', 'InverseTapered']);
defEnum('ProximityPromptStyle', ['Default', 'Custom']);
defEnum('ProximityPromptExclusivity', ['OnePerButton', 'OneGlobally', 'AlwaysShow']);
defEnum('RaycastFilterType', ['Exclude', 'Include', 'Blacklist', 'Whitelist']);
defEnum('CollisionFidelity', ['Default', 'Hull', 'Box', 'PreciseConvexDecomposition']);
defEnum('DominantAxis', ['Width', 'Height']);
defEnum('AspectType', ['FitWithinMaxSize', 'ScaleWithParentSize']);
defEnum('StudioStyleGuideColor', ['MainBackground']);
defEnum('ThumbnailType', ['HeadShot', 'AvatarBust', 'AvatarThumbnail']);
defEnum('ThumbnailSize', ['Size48x48', 'Size60x60', 'Size100x100', 'Size150x150', 'Size180x180', 'Size352x352', 'Size420x420']);
defEnum('Technology', ['Compatibility', 'Voxel', 'ShadowMap', 'Future']);
defEnum('ActionType', ['Nothing', 'Pause', 'Lose', 'Draw', 'Win']);
defEnum('AnimationPriority', ['Idle', 'Movement', 'Action', 'Core', 'Action2', 'Action3', 'Action4']);
defEnum('Platform', ['Windows', 'OSX', 'IOS', 'Android', 'XBoxOne', 'None']);
defEnum('DeviceType', ['Unknown', 'Desktop', 'Tablet', 'Phone']);
defEnum('TextInputType', ['Default', 'NoSuggestions', 'Number', 'Email', 'Phone', 'Password']);
defEnum('ButtonStyle', ['Custom', 'RobloxButtonDefault', 'RobloxButton', 'RobloxRoundButton', 'RobloxRoundDefaultButton', 'RobloxRoundDropdownButton']);
defEnum('TextureMode', ['Stretch', 'Wrap', 'Static']);
defEnum('CreatorType', ['User', 'Group']);
defEnum('PrivilegeType', ['Owner', 'Admin', 'Member', 'Visitor', 'Banned']);
defEnum('Genre', ['All']);
defEnum('JointCreationMode', ['All', 'Surface', 'None']);
defEnum('CustomCameraMode', ['Default', 'Classic', 'LockFirstPerson']);
defEnum('DevComputerMovementMode', ['UserChoice', 'KeyboardMouse', 'ClickToMove', 'Scriptable']);
defEnum('CoreGuiType', ['PlayerList', 'Health', 'Backpack', 'Chat', 'All', 'EmotesMenu', 'SelfView']);
defEnum('Limb', ['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg', 'Unknown']);
defEnum('R15CollisionType', ['OuterBox', 'InnerBox']);
defEnum('RigType', ['R6', 'R15']);
defEnum('OverrideMouseIconBehavior', ['None', 'ForceShow', 'ForceHide']);
defEnum('MouseBehavior', ['Default', 'LockCenter', 'LockCurrentPosition']);
defEnum('HumanoidRigType', ['R6', 'R15']);
defEnum('AssetType', ['Image', 'TeeShirt', 'Audio', 'Mesh', 'Lua', 'Hat', 'Place', 'Model', 'Shirt', 'Pants', 'Decal']);
defEnum('Status', ['Success', 'Failure']);
const EnumLib = new EnumRoot();

/* ------------------------------ TweenInfo ------------------------------ */
class TweenInfo extends Userdata {
  constructor(time, style, dir, repeat, reverses, delay) { super(); this.time = time; this.style = style; this.dir = dir; this.repeat = repeat; this.reverses = reverses; this.delay = delay; }
  get tname() { return 'TweenInfo'; }
  tostr() { return `TweenInfo`; }
  lget(k) {
    switch (k) { case 'Time': return this.time; case 'EasingStyle': return this.style; case 'EasingDirection': return this.dir; case 'RepeatCount': return this.repeat; case 'Reverses': return this.reverses; case 'DelayTime': return this.delay; }
    throw noMember('TweenInfo', k);
  }
}
const TweenInfoLib = mkTable({
  new: nat((t, s, d, r, rev, dl) => new TweenInfo(t === undefined ? 1 : n(t), s || EnumLib.lget('EasingStyle').lget('Quad'), d || EnumLib.lget('EasingDirection').lget('Out'), r === undefined ? 0 : r, !!rev, dl === undefined ? 0 : dl), 'new'),
});

/* ------------------------------ Random ------------------------------ */
class RandomObj extends Userdata {
  constructor(seed) { super(); this.s = (seed === undefined ? (Math.random() * 4294967296) : seed) >>> 0; if (!this.s) this.s = 1; }
  get tname() { return 'Random'; }
  next() { let t = (this.s += 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  lget(k) { const f = RNDM[k]; if (f) return f; throw noMember('Random', k); }
}
const RNDM = methodsOf({
  NextNumber: (r, a, b) => (a === undefined ? r.next() : a + r.next() * (b - a)),
  NextInteger: (r, a, b) => { if (a > b) throw rtError('invalid argument #2 to NextInteger (minimum must be less than or equal to maximum)'); return Math.floor(r.next() * (b - a + 1)) + a; },
  NextUnitVector: (r) => { const z = r.next() * 2 - 1, th = r.next() * Math.PI * 2, s = Math.sqrt(1 - z * z); return v3(s * Math.cos(th), s * Math.sin(th), z); },
  Shuffle: (r, t) => { for (let i = t.arr.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [t.arr[i], t.arr[j]] = [t.arr[j], t.arr[i]]; } return E; },
  Clone: (r) => { const c = new RandomObj(1); c.s = r.s; return c; },
});
const RandomLib = mkTable({ new: nat((seed) => new RandomObj(seed), 'new') });

/* ------------------------------ BrickColor ------------------------------ */
const BRICK = [[1, 'White', 242, 243, 243], [5, 'Brick yellow', 215, 197, 154], [9, 'Light reddish violet', 232, 186, 200], [18, 'Nougat', 204, 142, 105], [21, 'Bright red', 196, 40, 28], [23, 'Bright blue', 13, 105, 172], [24, 'Bright yellow', 245, 205, 48], [26, 'Black', 27, 42, 53], [28, 'Dark green', 40, 127, 71], [37, 'Bright green', 75, 151, 75], [38, 'Dark orange', 160, 95, 53], [45, 'Light blue', 180, 210, 228], [101, 'Medium red', 218, 134, 122], [102, 'Medium blue', 110, 153, 202], [104, 'Bright violet', 107, 50, 124], [105, 'Br. yellowish orange', 226, 155, 64], [106, 'Bright orange', 218, 133, 65], [119, 'Br. yellowish green', 164, 189, 71], [192, 'Reddish brown', 105, 64, 40], [194, 'Medium stone grey', 163, 162, 165], [199, 'Dark stone grey', 99, 95, 98], [208, 'Light stone grey', 229, 228, 223], [217, 'Brown', 124, 92, 70], [226, 'Cool yellow', 253, 234, 141], [1001, 'Institutional white', 248, 248, 248], [1002, 'Mid gray', 205, 205, 205], [1003, 'Really black', 17, 17, 17], [1004, 'Really red', 255, 0, 0], [1005, 'Deep orange', 255, 175, 0], [1006, 'Alder', 180, 128, 255], [1007, 'Dusty Rose', 163, 75, 75], [1008, 'Olive', 193, 190, 66], [1009, 'New Yeller', 255, 255, 0], [1010, 'Really blue', 0, 0, 255], [1011, 'Navy blue', 0, 32, 96], [1012, 'Deep blue', 33, 84, 185], [1013, 'Cyan', 4, 175, 236], [1014, 'CGA brown', 170, 85, 0], [1015, 'Magenta', 170, 0, 170], [1016, 'Pink', 255, 102, 204], [1017, 'Deep orange', 255, 175, 0], [1018, 'Teal', 18, 238, 212], [1019, 'Toothpaste', 0, 255, 255], [1020, 'Lime green', 0, 255, 0], [1021, 'Camo', 58, 125, 21], [1022, 'Grime', 127, 142, 100], [1023, 'Lavender', 140, 91, 159], [1024, 'Pastel light blue', 175, 221, 255], [1025, 'Pastel orange', 255, 201, 201], [1026, 'Pastel violet', 177, 167, 255], [1027, 'Pastel blue-green', 159, 243, 233], [1028, 'Pastel green', 204, 255, 204], [1029, 'Pastel yellow', 255, 255, 204], [1030, 'Pastel brown', 255, 204, 153], [1031, 'Royal purple', 98, 37, 209], [1032, 'Hot pink', 255, 0, 191]];
class BrickColor extends Userdata {
  constructor(entry) { super(); this.e = entry; }
  get tname() { return 'BrickColor'; }
  tostr() { return this.e[1]; }
  eq(o) { return o instanceof BrickColor && o.e[0] === this.e[0]; }
  color3() { return new Color3(this.e[2] / 255, this.e[3] / 255, this.e[4] / 255); }
  lget(k) {
    switch (k) { case 'Name': return this.e[1]; case 'Number': return this.e[0]; case 'Color': return this.color3(); case 'r': return this.e[2] / 255; case 'g': return this.e[3] / 255; case 'b': return this.e[4] / 255; }
    throw noMember('BrickColor', k);
  }
}
const brickByName = (nm) => BRICK.find((b) => b[1].toLowerCase() === String(nm).toLowerCase()) || BRICK.find((b) => b[1] === 'Medium stone grey');
const brickNearest = (c) => { let best = BRICK[0], bd = 1e9; for (const b of BRICK) { const d = (b[2] / 255 - c.r) ** 2 + (b[3] / 255 - c.g) ** 2 + (b[4] / 255 - c.b) ** 2; if (d < bd) { bd = d; best = b; } } return best; };
const BrickColorLib = mkTable({
  new: nat((a, g, b) => {
    if (typeof a === 'string') return new BrickColor(brickByName(a));
    if (typeof a === 'number' && g === undefined) return new BrickColor(BRICK.find((x) => x[0] === a) || BRICK[0]);
    if (a instanceof Color3) return new BrickColor(brickNearest(a));
    return new BrickColor(brickNearest(new Color3(a, g, b)));
  }, 'new'),
  random: nat(() => new BrickColor(BRICK[Math.floor(Math.random() * BRICK.length)]), 'random'),
  Random: nat(() => new BrickColor(BRICK[Math.floor(Math.random() * BRICK.length)]), 'Random'),
  palette: nat((i) => new BrickColor(BRICK[(i | 0) % BRICK.length]), 'palette'),
});
for (const [nm, key] of [['White', 'White'], ['Black', 'Black'], ['Red', 'Bright red'], ['Blue', 'Bright blue'], ['Yellow', 'Bright yellow'], ['Green', 'Dark green'], ['Gray', 'Medium stone grey']]) BrickColorLib.set(nm, nat(() => new BrickColor(brickByName(key)), nm));

/* ------------------------------ Misc ------------------------------ */
class DateTime extends Userdata {
  constructor(ms) { super(); this.ms = ms; }
  get tname() { return 'DateTime'; }
  tostr() { return new Date(this.ms).toISOString(); }
  lget(k) {
    switch (k) { case 'UnixTimestamp': return Math.floor(this.ms / 1000); case 'UnixTimestampMillis': return this.ms; }
    const f = DTM[k]; if (f) return f; throw noMember('DateTime', k);
  }
}
const DTM = methodsOf({
  ToUniversalTime: (d) => { const x = new Date(d.ms); return mkTable({ Year: x.getUTCFullYear(), Month: x.getUTCMonth() + 1, Day: x.getUTCDate(), Hour: x.getUTCHours(), Minute: x.getUTCMinutes(), Second: x.getUTCSeconds(), Millisecond: x.getUTCMilliseconds() }); },
  ToLocalTime: (d) => { const x = new Date(d.ms); return mkTable({ Year: x.getFullYear(), Month: x.getMonth() + 1, Day: x.getDate(), Hour: x.getHours(), Minute: x.getMinutes(), Second: x.getSeconds(), Millisecond: x.getMilliseconds() }); },
  FormatUniversalTime: (d, f) => { const x = new Date(d.ms); const p = (v, l = 2) => String(v).padStart(l, '0'); return String(f).replace(/YYYY|YY|MM|DD|HH|mm|ss|M|D|H|m|s/g, (t) => ({ YYYY: p(x.getUTCFullYear(), 4), YY: p(x.getUTCFullYear() % 100), MM: p(x.getUTCMonth() + 1), DD: p(x.getUTCDate()), HH: p(x.getUTCHours()), mm: p(x.getUTCMinutes()), ss: p(x.getUTCSeconds()), M: x.getUTCMonth() + 1, D: x.getUTCDate(), H: x.getUTCHours(), m: x.getUTCMinutes(), s: x.getUTCSeconds() }[t])); },
  FormatLocalTime: (d, f) => DTM.FormatUniversalTime.$n(d, f),
});
const DateTimeLib = mkTable({
  now: nat(() => new DateTime(DateTimeLib.clock ? DateTimeLib.clock() : Date.now()), 'now'),
  fromUnixTimestamp: nat((s) => new DateTime(s * 1000), 'fromUnixTimestamp'),
  fromUnixTimestampMillis: nat((ms) => new DateTime(ms), 'fromUnixTimestampMillis'),
  fromUniversalTime: nat((y, mo, d, h, mi, s, ms) => new DateTime(Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, s || 0, ms || 0)), 'fromUniversalTime'),
});
class FontObj extends Userdata {
  constructor(family, weight, style) { super(); this.family = family; this.weight = weight; this.style = style; }
  get tname() { return 'Font'; }
  lget(k) { if (k === 'Family') return this.family; if (k === 'Weight') return this.weight; if (k === 'Style') return this.style; if (k === 'Bold') return false; throw noMember('Font', k); }
}
const FontLib = mkTable({
  new: nat((f, w, s) => new FontObj(f, w, s), 'new'),
  fromEnum: nat((e) => new FontObj(e.name, undefined, undefined), 'fromEnum'),
  fromName: nat((nm) => new FontObj(nm), 'fromName'),
});
// parameter objects with free fields
class ParamsObj extends Userdata {
  constructor(name, fields) { super(); this.name = name; this.f = Object.assign({}, fields); }
  get tname() { return this.name; }
  lget(k) { if (k in this.f) return this.f[k]; const m = PARAMM[k]; if (m && this.name === 'RaycastParams') return m; throw noMember(this.name, k); }
  lset(k, v) { if (!(k in this.f)) throw noMember(this.name, k); this.f[k] = v; }
}
const PARAMM = methodsOf({ AddToFilter: (p, x) => { const cur = p.f.FilterDescendantsInstances; const arr = cur instanceof LuaTable ? cur.arr.slice() : []; if (x instanceof LuaTable) arr.push(...x.arr); else arr.push(x); p.f.FilterDescendantsInstances = new LuaTable(arr); return E; } });
const RaycastParamsLib = mkTable({ new: nat(() => new ParamsObj('RaycastParams', { FilterDescendantsInstances: new LuaTable(), FilterType: EnumLib.lget('RaycastFilterType').lget('Exclude'), IgnoreWater: false, CollisionGroup: 'Default', RespectCanCollide: false }), 'new') });
const OverlapParamsLib = mkTable({ new: nat(() => new ParamsObj('OverlapParams', { FilterDescendantsInstances: new LuaTable(), FilterType: EnumLib.lget('RaycastFilterType').lget('Exclude'), MaxParts: 0, CollisionGroup: 'Default', RespectCanCollide: false }), 'new') });
const PhysicalPropertiesLib = mkTable({ new: nat((d, f, e, fw, ew) => new ParamsObj('PhysicalProperties', { Density: d, Friction: f, Elasticity: e, FrictionWeight: fw, ElasticityWeight: ew }), 'new') });

module.exports = {
  Vector3, Vector2, CFrame, Color3, UDim, UDim2, Rect, Ray, NumberRange, Sequence, Keypoint, EnumItem, EnumType, TweenInfo, RandomObj, BrickColor, DateTime, FontObj, ParamsObj,
  v3, cfMul, cfInverse, cfPoint, rotVec, matT, matMul, rotFromAxes, rotFromYXZ, eulerXYZ, eulerYXZ, lookRot, cfLerp, quatToRot, rotToQuat, hsv2rgb, fmt, mkTable, methodsOf, enumMisses, enumTypes, EnumLib, brickByName, brickNearest, BRICK,
  libs: { Vector3: Vector3Lib, Vector2: Vector2Lib, CFrame: CFrameLib, Color3: Color3Lib, UDim: UDimLib, UDim2: UDim2Lib, Rect: RectLib, Ray: RayLib, NumberRange: NumberRangeLib, NumberSequence: NumberSequenceLib, NumberSequenceKeypoint: NumberSequenceKeypointLib, ColorSequence: ColorSequenceLib, ColorSequenceKeypoint: ColorSequenceKeypointLib, Enum: EnumLib, TweenInfo: TweenInfoLib, Random: RandomLib, BrickColor: BrickColorLib, DateTime: DateTimeLib, Font: FontLib, RaycastParams: RaycastParamsLib, OverlapParams: OverlapParamsLib, PhysicalProperties: PhysicalPropertiesLib },
};

};
defs["rbx/env.js"]=function(module,exports,require){'use strict';
// Environment glue: runtime, script contexts, globals, require, loading a project tree, frame loop.
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED, Coroutine , ST } = C;
const { utf8dec, utf8enc } = require('../lua2js/lexer');
const RT = require('../lua2js/runtime');
const { Runtime, makeGlobals, nat } = RT;
const { compile } = require('../lua2js/codegen');
const D = require('./datatypes');
const I = require('./instance');
const S = require('./services');
require('./players');
const physics = require('./physics');
const net = require('./net');
require('./input');
require('./layout');
const { ENV, Instance, newInstance, CLASSES, noteUnsupported, Signal } = I;
const { v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);

/* ------------------------------------------------------------------ value decoding (tree spec) */
function decodeValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v;
  const a = v.v;
  switch (v.t) {
    case 'V3': return v3(a[0], a[1], a[2]);
    case 'V2': return new D.Vector2(a[0], a[1]);
    case 'CF': return a.length === 3 ? new D.CFrame(a[0], a[1], a[2]) : new D.CFrame(a[0], a[1], a[2], a.slice(3, 12));
    case 'C3': return new D.Color3(a[0], a[1], a[2]);
    case 'UD2': return new D.UDim2(a[0], a[1], a[2], a[3]);
    case 'UD': return new D.UDim(a[0], a[1]);
    case 'En': return En(a[0], a[1]);
    case 'BC': return typeof a === 'number' ? D.libs.BrickColor.get('new').$n(a) : new D.BrickColor(D.brickByName(a));
    case 'NR': return new D.NumberRange(a[0], a[1]);
    case 'Rect': return new D.Rect(a[0], a[1], a[2], a[3]);
    case 'Str': return utf8enc(a);
    default: return undefined;
  }
}
// strings from JSON/specs are JS (UTF-16) strings; Lua strings are byte strings
const enc = (s) => (typeof s === 'string' && /[^\x00-\x7f]/.test(s) ? utf8enc(s) : s);

/* ------------------------------------------------------------------ logging */
ENV.logs = [];
ENV.log = function (level, who, msg) {
  const text = utf8dec(String(msg));
  const e = { level, who, text, t: ENV.rt ? ENV.rt.now : 0 };
  ENV.logs.push(e); if (ENV.logs.length > 2000) ENV.logs.splice(0, 500);
  if (ENV.onLog) ENV.onLog(e);
};
ENV.warn = (m) => ENV.log('warn', 'emu', m);

/* ------------------------------------------------------------------ chunk handling */
ENV.chunkFactories = new Map(); // chunkId -> factory(H,G)
function chunkFor(inst) {
  if (inst.chunk) return inst.chunk;
  const src = inst.props.Source;
  const name = inst.fullName();
  const id = ++ENV.rt.chunkCount;
  C.ST.chunks[id] = name;
  const { code, globals, indexed } = compile(typeof src === 'string' ? src : '', name, id);
  for (const [k, v] of globals) ENV.rt.coverage.globals.set(k, (ENV.rt.coverage.globals.get(k) || 0) + v);
  for (const p of indexed) ENV.rt.coverage.indexed.set(p, (ENV.rt.coverage.indexed.get(p) || 0) + 1);
  inst.chunk = (0, eval)(code);
  return inst.chunk;
}
function fnFor(inst, ctx) {
  const f = chunkFor(inst);
  if (!f.byCtx) f.byCtx = new Map();
  let fn = f.byCtx.get(ctx);
  if (!fn) { fn = f(ENV.rt.H, ctx.G); f.byCtx.set(ctx, fn); }
  return fn;
}

/* ------------------------------------------------------------------ script contexts */
function makeContext(name) {
  const rt = ENV.rt;
  const ctx = { name, G: null, modules: new Map(), shared: new LuaTable() };
  const G = ctx.G = makeGlobals(rt);
  const def = (k, f) => G.set(k, nat(f, k));
  G.set('game', ENV.game); G.set('workspace', ENV.workspace); G.set('Workspace', ENV.workspace);
  G.set('shared', ctx.shared);
  for (const k of Object.keys(D.libs)) G.set(k, D.libs[k]);
  const inst = new LuaTable();
  inst.set('new', nat((cn, parent) => { if (typeof cn !== 'string') throw rtError('Instance.new: string expected'); return newInstance(cn, parent); }, 'new'));
  G.set('Instance', inst);
  // task library
  const task = new LuaTable(); G.set('task', task);
  const mkThread = (f, args) => {
    if (f instanceof Coroutine) return f;
    if (typeof f !== 'function') { try { f = C.toCallable(f); } catch (e) { throw rtError('invalid argument #1 to \'spawn\' (function or thread expected)'); } }
    return new Coroutine(f, ctx);
  };
  task.set('spawn', nat((f, ...args) => {
    const co = mkThread(f, args);
    rt.resumeThread(co, args);
    return co;
  }, 'spawn'));
  task.set('defer', nat((f, ...args) => { const co = mkThread(f, args); rt.defer(co, args); return co; }, 'defer'));
  task.set('delay', nat((t, f, ...args) => { const co = mkThread(f, args); rt.sleep(co, Math.max(1e-9, typeof t === 'number' ? t : 0), args); return co; }, 'delay'));
  task.set('wait', function* (t) {
    const co = CO.current; const t0 = rt.now;
    if (!co) throw rtError('task.wait: cannot yield from the main thread');
    rt.sleep(co, Math.max(1e-9, typeof t === 'number' ? t : 0), []);
    yield SCHED;
    return rt.now - t0;
  });
  task.set('cancel', nat((co) => { if (co instanceof Coroutine) rt.cancel(co); return E; }, 'cancel'));
  task.set('synchronize', nat(() => E, 'synchronize')); task.set('desynchronize', nat(() => E, 'desynchronize'));
  G.set('wait', task.get('wait'));
  G.set('delay', nat((t, f) => { const co = mkThread(f, []); rt.sleep(co, Math.max(1e-9, t || 0), []); return E; }, 'delay'));
  G.set('spawn', nat((f, ...a) => { const co = mkThread(f, a); rt.defer(co, a); return co; }, 'spawn'));
  G.set('tick', nat(() => (ENV.epoch0 + rt.now * 1000) / 1000, 'tick'));
  G.set('time', nat(() => rt.now, 'time'));
  G.set('elapsedTime', nat(() => rt.now, 'elapsedTime'));
  G.set('version', nat(() => 'r2w-emulator 2.0', 'version'));
  G.set('settings', nat(() => ENV.settings || (ENV.settings = new LuaTable()), 'settings'));
  G.set('UserSettings', nat(() => new LuaTable(), 'UserSettings'));
  G.set('stats', nat(() => ENV.getService('Stats'), 'stats'));
  // print/warn with context prefix go to ENV.log
  G.set('print', nat((...a) => { ENV.log('out', name, a.map(tostr).join(' ')); return E; }, 'print'));
  G.set('warn', nat((...a) => { ENV.log('warn', name, a.map(tostr).join(' ')); return E; }, 'warn'));
  // require
  G.set('require', function* (m) {
    if (!(m instanceof Instance) || !m.isA('ModuleScript')) { noteUnsupported('require(non-ModuleScript)'); throw rtError('require: ModuleScript expected, got ' + (m instanceof Instance ? m.className : C.tnameForErr(m))); }
    let e = ctx.modules.get(m);
    if (e) {
      if (e.state === 'done') return e.value;
      if (e.state === 'error') throw new C.LuaError(e.err);
      if (e.owner === CO.current) throw rtError('Requested module was required recursively');
      // loaded by another thread: wait
      e.waiters.push(CO.current); yield SCHED;
      if (e.state === 'error') throw new C.LuaError(e.err);
      return e.value;
    }
    e = { state: 'loading', owner: CO.current, waiters: [], value: undefined };
    ctx.modules.set(m, e);
    try {
      const fn = fnFor(m, ctx);
      const r = yield* fn(m);
      if (r instanceof Array && r.length !== 1) throw rtError('Module code did not return exactly one value');
      e.value = r instanceof Array ? r[0] : r;
      if (e.value === undefined) throw rtError('Module code did not return exactly one value');
      e.state = 'done';
    } catch (err) {
      e.state = 'error'; e.err = C.errValue(err);
      for (const w of e.waiters) rt.defer(w, []);
      throw err;
    }
    for (const w of e.waiters) rt.defer(w, []);
    return e.value;
  });
  return ctx;
}
ENV.makeContext = makeContext;

/* ------------------------------------------------------------------ running scripts */
const underAny = (inst, roots) => { for (let p = inst; p; p = p.parent) if (roots.includes(p)) return true; return false; };
function scriptContext(inst) {
  if (!inst.dm) return null;
  const en = inst.props.Enabled !== false;
  if (!en) return null;
  const ws = ENV.workspace, sss = ENV.svcOrNull('ServerScriptService');
  const rc = inst.props.RunContext;
  if (inst.className === 'LocalScript' || (inst.className === 'Script' && rc && rc.name === 'Client')) {
    const lp = ENV.localPlayer;
    if (!lp) { const rf = ENV.svcOrNull('ReplicatedFirst'); if (rf && underAny(inst, [rf])) return ENV.contexts.client; return null; }
    const roots = [lp.findChild('Backpack'), lp.findChild('PlayerGui'), lp.findChild('PlayerScripts'), ENV.svcOrNull('ReplicatedFirst'), lp.props.Character].filter(Boolean);
    if (underAny(inst, roots)) return ENV.contexts.client;
    if (inst.className === 'Script' && underAny(inst, [ENV.svcOrNull('ReplicatedStorage'), ws])) return ENV.contexts.client;
    return null;
  }
  if (inst.className === 'Script') {
    if (underAny(inst, [ws, sss]) || (rc && rc.name === 'Server' && !underAny(inst, [ENV.svcOrNull('StarterGui'), ENV.svcOrNull('StarterPlayer'), ENV.svcOrNull('StarterPack')]))) {
      // a Script inside a player's character (clone of StarterCharacterScripts) also runs on the server
      return ENV.contexts.server;
    }
  }
  return null;
}
function startScript(inst) {
  if (inst.started || inst.destroyed) return;
  if (!inst.isA('BaseScript')) return;
  const ctx = scriptContext(inst); if (!ctx) return;
  inst.started = true;
  const co = new Coroutine(function* (...a) {
    let fn;
    try { fn = fnFor(inst, ctx); } catch (e) { ENV.log('err', ctx.name, `${inst.fullName()}: ${e && e.message ? e.message : e}`); return E; }
    return yield* fn(inst);
  }, ctx);
  co.script = inst;
  ENV.stats.scriptsStarted++;
  ENV.rt.resumeThread(co, []);
}
ENV.stats = { scriptsStarted: 0, frames: 0 };
ENV.startScript = startScript;
ENV.listeners.attach.push((inst) => {
  if (!inst.isA('BaseScript')) return;
  if (ENV.booting) return;
  ENV.rt.defer(new Coroutine(function* () { startScript(inst); return E; }, null), []);
});
ENV.listeners.prop.push((inst, k) => { if (inst.isA('BaseScript') && (k === 'Enabled' || k === 'Disabled') && !ENV.booting && inst.props.Enabled) startScript(inst); });

/* ------------------------------------------------------------------ tree loading */
function coerce(pd, v) {
  const def = pd.def;
  if (v && typeof v === 'object' && v.t === 'EnN') { if (def && def.type) { for (const it of def.type.items.values()) if (it.value === v.v) return it; } return undefined; }
  if (def instanceof D.EnumItem) {
    if (typeof v === 'string') return def.type.items.get(v) || def;
    if (typeof v === 'number') { for (const it of def.type.items.values()) if (it.value === v) return it; return def; }
  }
  if (Array.isArray(v)) {
    if (def instanceof D.Color3 && v.length === 3) return new D.Color3(v[0], v[1], v[2]);
    if (def instanceof D.Vector3 && v.length === 3) return v3(v[0], v[1], v[2]);
    if (def instanceof D.Vector2 && v.length === 2) return new D.Vector2(v[0], v[1]);
    if (def instanceof D.UDim2 && v.length === 4) return new D.UDim2(v[0], v[1], v[2], v[3]);
    if (def instanceof D.UDim && v.length === 2) return new D.UDim(v[0], v[1]);
    return undefined;
  }
  if (def instanceof D.BrickColor && typeof v === 'string') return new D.BrickColor(D.brickByName(v));
  return v;
}
function applyProps(inst, props, refs, pendingRefs) {
  if (!props) return;
  for (const k of Object.keys(props)) {
    let v = props[k];
    if (v && typeof v === 'object' && v.t === 'Ref') { pendingRefs.push([inst, k, v.v]); continue; }
    if (typeof v === 'string') v = enc(v);
    else if (!(v && typeof v === 'object' && v.t === 'EnN')) v = decodeValue(v);
    if (k === 'Name') { inst.props.Name = v; continue; }
    const pd = inst.cls.prop(k);
    if (!pd) { ENV.unknownProps.set(inst.className + '.' + k, 1); continue; }
    if (pd.ro) continue;
    if (v && typeof v === 'object' && v.t === 'EnN' || typeof v === 'string' || typeof v === 'number' || Array.isArray(v)) { const cv = coerce(pd, v); if (cv !== undefined) v = cv; }
    try { if (v !== undefined) inst.lset(k, v); } catch (e) { ENV.unknownProps.set(inst.className + '.' + k + ' (bad value)', 1); }
  }
}
ENV.unknownProps = new Map();
function buildNode(node, parent, refs, pendingRefs, top) {
  let inst;
  const cls = CLASSES.get(node.cls);
  if (cls && cls.service) inst = ENV.getService(node.cls);
  else if (node.cls === 'StarterPlayerScripts' || (parent && parent.className === 'StarterPlayer' && node.name === 'StarterPlayerScripts')) inst = ENV.svc('StarterPlayer').findChild('StarterPlayerScripts');
  else if (node.cls === 'StarterCharacterScripts' || (parent && parent.className === 'StarterPlayer' && node.name === 'StarterCharacterScripts')) inst = ENV.svc('StarterPlayer').findChild('StarterCharacterScripts');
  else {
    if (!cls) { noteUnsupported('Instance.new("' + node.cls + '")'); inst = newInstance('Folder'); ENV.unknownClasses.add(node.cls); inst.props.Name = node.name; }
    else {
      inst = new Instance(cls); if (cls.init) cls.init(inst);
    }
  }
  if (node.name !== undefined && !(cls && cls.service)) inst.props.Name = enc(node.name);
  if (node.id !== undefined) refs.set(node.id, inst);
  applyProps(inst, node.props, refs, pendingRefs);
  if (node.source !== undefined && inst.isA('LuaSourceContainer')) inst.props.Source = node.source;
  if (node.chunk !== undefined && ENV.chunkFactories.has(node.chunk)) inst.chunk = ENV.chunkFactories.get(node.chunk);
  if (node.attrs) for (const k of Object.keys(node.attrs)) { if (!inst.attrs) inst.attrs = new Map(); inst.attrs.set(enc(k), typeof node.attrs[k] === 'string' ? enc(node.attrs[k]) : decodeValue(node.attrs[k])); }
  if (node.tags) { inst.tags = new Set(node.tags.map(enc)); }
  if (parent && !(cls && cls.service && inst.parent === ENV.game)) inst.setParent(parent);
  else if (parent === null) { /* leave */ }
  for (const ch of node.children || []) buildNode(ch, inst, refs, pendingRefs, false);
  return inst;
}
ENV.unknownClasses = new Set();
ENV.loadTree = function (tree) {
  const refs = new Map(), pending = [];
  for (const n of tree) buildNode(n, ENV.game, refs, pending, true);
  for (const [inst, k, id] of pending) { const t = refs.get(id); if (t) { try { inst.lset(k, t); } catch (e) { /* */ } } }
};

/* ------------------------------------------------------------------ boot & frame */
ENV.boot = function (opts) {
  opts = opts || {};
  const t0 = Date.now();
  const rt = ENV.rt = new Runtime({
    out: (s) => ENV.log('out', 'rt', s), warn: (s) => ENV.log('warn', 'rt', s), err: (s) => ENV.log('err', 'rt', s),
  });
  rt.rngState = opts.seed !== undefined ? opts.seed : (Date.now() & 0x7fffffff);
  ENV.epoch0 = opts.epoch0 !== undefined ? opts.epoch0 : Date.now();
  // единое виртуальное время: os.clock / os.time / tick идут вместе с кадрами (детерминированные тесты, simulate())
  rt.clockFn = () => rt.now;
  rt.unixTime = () => ENV.epoch0 + rt.now * 1000;
  rt.onThreadError = (msg, co) => {
    const who = co && co.ctx ? co.ctx.name : 'server';
    ENV.log('err', who, msg + (co && co.script ? '' : ''));
    ENV.errorCount = (ENV.errorCount || 0) + 1;
  };
  if (opts.latency !== undefined) net.latency = opts.latency;
  ENV.placeKey = opts.placeKey || 'game';
  ENV.persist = opts.persist !== false;
  ENV.market.catalog = opts.catalog || ENV.market.catalog;
  ENV.market.autoPurchase = opts.autoPurchase !== false;
  ENV.errorCount = 0;
  ENV.makeDataModel({ name: opts.name, seed: opts.seed });
  ENV.contexts = { server: null, client: null };
  ENV.contexts.server = makeContext('server');
  ENV.contexts.client = makeContext('client');
  D.enumMisses.clear && D.enumMisses.clear();
  ENV.loadOwned();
  ENV.booting = true;
  if (opts.tree) ENV.loadTree(opts.tree);
  ENV.booting = false;
  ENV.bootMs = Date.now() - t0;
  ENV.frameNo = 0;
  return ENV;
};
// start server scripts, add the local player (+ extra bots/players for tests)
ENV.start = function (opts) {
  opts = opts || {};
  const order = [];
  const walk = (n) => { for (const c of n.children) { if (c.isA('BaseScript')) order.push(c); walk(c); } };
  for (const svc of ['ReplicatedFirst', 'Workspace', 'ServerScriptService']) { const s = ENV.svcOrNull(svc); if (s) walk(s); }
  // server scripts first
  for (const sc of order) if (sc.className === 'Script') startScript(sc);
  // local player joins
  if (opts.player !== false) {
    const nm = opts.playerName || 'Player1';
    ENV.addPlayer(nm, { isLocal: true, premium: !!opts.premium, userId: opts.userId });
  }
  // ReplicatedFirst local scripts
  const rf = ENV.svcOrNull('ReplicatedFirst');
  ENV.rt.runDeferred();
  if (rf) for (const sc of rf.descendants()) if (sc.className === 'LocalScript') startScript(sc);
  ENV.rt.runDeferred();
};
ENV.frame = function (dt) {
  ENV.frameNo++;
  const rt = ENV.rt;
  ENV.workspace.props.DistributedGameTime = rt.now;
  const run = ENV.svc('RunService');
  run.fireSignal('PreSimulation', dt);
  run.fireSignal('Stepped', rt.now, dt);
  physics.world.step(dt);
  S.tweenStep(dt);
  run.fireSignal('PostSimulation', dt);
  run.fireSignal('PreAnimation', dt);
  run.fireSignal('Heartbeat', dt);
  if (ENV.localPlayer || ENV.renderBinds.length) {
    run.fireSignal('PreRender', dt);
    for (const b of ENV.renderBinds.slice()) rt.spawn(b.fn, [dt], ENV.contexts.client);
    run.fireSignal('RenderStepped', dt);
  }
  if (ENV.prompts) ENV.prompts.update(dt);
  rt.step(dt);
};
ENV.shutdown = function () {
  if (ENV.shutDown) return; ENV.shutDown = true;
  const rt = ENV.rt;
  for (const p of ENV.players.slice()) ENV.removePlayer(p);
  for (const f of ENV.closeHandlers) rt.spawn(f, [], ENV.contexts.server);
  for (let i = 0; i < 400 && rt.hasPending(); i++) rt.step(0.01);
};
ENV.simulate = function (seconds, dt) { dt = dt || 1 / 30; const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) ENV.frame(dt); };
module.exports = { ENV, decodeValue, chunkFor };

};
defs["rbx/services.js"]=function(module,exports,require){'use strict';
// Roblox services: DataModel, Workspace, RunService, TweenService, Debris, CollectionService, HttpService, DataStore, Marketplace, ...
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED, Coroutine } = C;
const { utf8enc } = require('../lua2js/lexer');
const { nat } = require('../lua2js/runtime');
const D = require('./datatypes');
const I = require('./instance');
const CL = require('./classes');
require('./classes_gui');
const net = require('./net');
const { ENV, Signal, Instance, defClass, defMethods, P, RO, newInstance, noteUnsupported, CLASSES } = I;
const { Vector3, Vector2, CFrame, Color3, UDim2, UDim, v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);
const tbl = (arr) => new LuaTable(arr);
const rt = () => ENV.rt;
const ctxName = () => { const c = CO.current ? CO.current.ctx : null; return c ? c.name : 'server'; };

/* ------------------------------------------------------------------ service classes */
const SERVICE_NAMES = ['Workspace', 'Players', 'Lighting', 'ReplicatedStorage', 'ReplicatedFirst', 'ServerStorage', 'ServerScriptService', 'StarterGui', 'StarterPack', 'StarterPlayer', 'SoundService', 'Chat', 'Teams', 'TextChatService', 'RunService', 'TweenService', 'Debris', 'CollectionService', 'HttpService', 'DataStoreService', 'MemoryStoreService', 'MessagingService', 'MarketplaceService', 'PolicyService', 'UserInputService', 'ContextActionService', 'ProximityPromptService', 'GuiService', 'TextService', 'TeleportService', 'BadgeService', 'PathfindingService', 'PhysicsService', 'LocalizationService', 'GroupService', 'SocialService', 'VRService', 'AnalyticsService', 'ContentProvider', 'HapticService', 'AssetService', 'InsertService', 'Stats', 'LogService', 'ScriptContext', 'GamepadService', 'MaterialService', 'TestService', 'AvatarEditorService', 'VoiceChatService', 'StarterPlayerScripts', 'StarterCharacterScripts', 'NetworkClient', 'NetworkServer', 'PlayerGui', 'UserGameSettings', 'RbxAnalyticsService', 'CoreGui', 'Selection', 'ChangeHistoryService', 'ServiceProvider', 'TimerService', 'ExperienceService', 'CaptureService', 'MouseService', 'ReplicatedFirstX'];
const stubSvc = new Set();
for (const n of SERVICE_NAMES) {
  if (!CLASSES.has(n) && !['StarterPlayerScripts', 'StarterCharacterScripts', 'PlayerGui', 'ReplicatedFirstX'].includes(n)) { defClass(n, 'Instance', { service: true }); stubSvc.add(n); }
}
const svcFolder = (n) => defClass(n, 'Instance', { service: true });
defClass('DataModel', 'Instance', { noCreate: true, props: { PlaceId: 0, GameId: 0, JobId: '', CreatorId: 0, CreatorType: En('CreatorType', 'User'), PlaceVersion: 1, PrivateServerId: '', PrivateServerOwnerId: 0, Loaded: undefined, Workspace: P(undefined, { get: (i) => ENV.svc('Workspace'), ro: true }) }, events: ['Loaded', 'GraphicsQualityChangeRequest'],
  methods: {
    GetService(self, name) { return ENV.getService(name); },
    FindService(self, name) { return self.children.find((c) => c.className === name); },
    IsLoaded() { return true; },
    BindToClose(self, fn) { ENV.closeHandlers.push(fn); return E; },
    Shutdown() { return E; },
    GetObjects() { return new LuaTable(); },
    HttpGet() { throw rtError('HttpGet is not enabled in the browser demo'); },
    IsA(self, n) { return n === 'DataModel' || n === 'ServiceProvider' || n === 'Instance'; },
  } });
// containers
for (const n of ['ReplicatedStorage', 'ReplicatedFirst', 'ServerStorage', 'ServerScriptService', 'StarterPack', 'StarterGui', 'SoundService', 'Teams', 'Chat']) {
  const c = CLASSES.get(n); if (c) { c.service = true; c.creatable = false; }
}
defClass('StarterPlayerScripts', 'Instance', { noCreate: true });
defClass('StarterCharacterScripts', 'Instance', { noCreate: true });
defClass('PlayerScripts', 'Instance', { noCreate: true });
defClass('BasePlayerGui', 'Instance', { noCreate: true });
defClass('PlayerGui', 'BasePlayerGui', { noCreate: true });
defMethods('StarterGui', { SetCore() { return E; }, GetCore() { return undefined; }, SetCoreGuiEnabled() { return E; }, GetCoreGuiEnabled() { return true; } });
CLASSES.get('StarterGui').props.set('ShowDevelopmentGui', { def: true });
CLASSES.get('StarterGui').props.set('ResetPlayerGuiOnSpawn', { def: true });
CLASSES.get('StarterPlayer').props.set('CharacterWalkSpeed', { def: 16 });
CLASSES.get('StarterPlayer').props.set('CharacterJumpPower', { def: 50 });
CLASSES.get('StarterPlayer').props.set('CharacterJumpHeight', { def: 7.2 });
CLASSES.get('StarterPlayer').props.set('CharacterMaxHealth', { def: 100 });
CLASSES.get('StarterPlayer').props.set('EnableMouseLockOption', { def: true });
CLASSES.get('StarterPlayer').props.set('CameraMaxZoomDistance', { def: 128 });
CLASSES.get('StarterPlayer').props.set('CameraMinZoomDistance', { def: 0.5 });
CLASSES.get('StarterPlayer').props.set('LoadCharacterAppearance', { def: true });
CLASSES.get('StarterPlayer').props.set('AutoJumpEnabled', { def: true });
CLASSES.get('StarterPlayer').props.set('UserEmotesEnabled', { def: true });
CLASSES.get('Teams').methods.set('GetTeams', nat(() => new LuaTable(), 'GetTeams'));

/* Lighting */
const L = CLASSES.get('Lighting');
for (const [k, v] of Object.entries({ Ambient: new Color3(0.27, 0.27, 0.27), Brightness: 2, ClockTime: 14, TimeOfDay: '14:00:00', FogColor: new Color3(0.75, 0.75, 0.75), FogEnd: 100000, FogStart: 0, OutdoorAmbient: new Color3(0.5, 0.5, 0.5), GlobalShadows: true, ColorShift_Top: new Color3(0, 0, 0), ColorShift_Bottom: new Color3(0, 0, 0), EnvironmentDiffuseScale: 0, EnvironmentSpecularScale: 0, ExposureCompensation: 0, GeographicLatitude: 41.7, ShadowSoftness: 0.5, Technology: En('Technology', 'Compatibility') })) L.props.set(k, { def: v });
L.props.set('ClockTime', P(14, { set(i, v) { i.setProp('ClockTime', v); const h = ((v % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.floor(((h - hh) * 60 - mm) * 60); i.setProp('TimeOfDay', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`); } }));
L.props.set('TimeOfDay', P('14:00:00', { set(i, v) { const m = /^(\d+):(\d+)(?::(\d+))?$/.exec(v); if (m) i.lset('ClockTime', (+m[1]) + (+m[2]) / 60 + (+(m[3] || 0)) / 3600); i.setProp('TimeOfDay', v); } }));
L.methods.set('GetMinutesAfterMidnight', nat((self) => self.props.ClockTime * 60, 'GetMinutesAfterMidnight'));
L.methods.set('SetMinutesAfterMidnight', nat((self, m) => { self.lset('ClockTime', m / 60); return E; }, 'SetMinutesAfterMidnight'));
L.methods.set('GetMoonDirection', nat(() => v3(0, -1, 0), 'GetMoonDirection'));
L.methods.set('GetSunDirection', nat(() => v3(0, 1, 0), 'GetSunDirection'));
/* SoundService */
for (const [k, v] of Object.entries({ AmbientReverb: En('ReverbType', 'NoReverb'), DistanceFactor: 3.33, DopplerScale: 1, RolloffScale: 1, RespectFilteringEnabled: false })) CLASSES.get('SoundService').props.set(k, { def: v });
CLASSES.get('SoundService').methods.set('PlayLocalSound', nat(() => E, 'PlayLocalSound'));

/* ------------------------------------------------------------------ DataModel construction */
ENV.closeHandlers = [];
const svcCache = new Map();
ENV.getService = function (name) {
  if (typeof name !== 'string') throw rtError('invalid argument #1 to \'GetService\' (string expected, got ' + C.tnameForErr(name) + ')');
  const cls = CLASSES.get(name);
  if (!cls || !cls.service) throw rtError(`'${name}' is not a valid Service name`);
  // client cannot see server-only containers
  if (ctxName() === 'client' && (name === 'ServerStorage' || name === 'ServerScriptService')) {
    let p = ENV.hiddenSvc[name]; if (!p) p = ENV.hiddenSvc[name] = new Instance(cls); return p;
  }
  let s = svcCache.get(name);
  if (!s) {
    s = new Instance(cls); s.props.Name = name; svcCache.set(name, s);
    if (cls.svcInit) cls.svcInit(s);
    s.setParent(ENV.game);
  }
  return s;
};
ENV.hiddenSvc = {};
ENV.svc = (name) => { const s = svcCache.get(name); return s || ENV.getService(name); };
ENV.svcOrNull = (name) => svcCache.get(name);

ENV.makeDataModel = function (opts) {
  opts = opts || {};
  svcCache.clear(); ENV.hiddenSvc = {}; ENV.closeHandlers = [];
  const g = new Instance(CLASSES.get('DataModel'));
  g.props.Name = opts.name || 'Game'; g.dm = true;
  g.props.PlaceId = opts.placeId || 1818; g.props.GameId = opts.gameId || 1818; g.props.JobId = 'job-' + (opts.seed || 'local'); g.props.CreatorId = 1;
  ENV.game = g;
  for (const n of ['Workspace', 'Players', 'Lighting', 'ReplicatedStorage', 'ReplicatedFirst', 'ServerStorage', 'ServerScriptService', 'StarterGui', 'StarterPack', 'StarterPlayer', 'SoundService', 'Teams', 'RunService']) ENV.getService(n);
  const sp = ENV.svc('StarterPlayer');
  newInstance('StarterPlayerScripts', sp, true); newInstance('StarterCharacterScripts', sp, true);
  ENV.workspace = ENV.svc('Workspace');
  const cam = newInstance('Camera', ENV.workspace, true); cam.props.Name = 'Camera'; ENV.workspace.props.CurrentCamera = cam;
  newInstance('Terrain', ENV.workspace, true).props.Name = 'Terrain';
  return g;
};

/* ------------------------------------------------------------------ Workspace */
defMethods('Workspace', {
  Raycast(self, origin, dir, params) { return ENV.physics ? ENV.physics.raycast(origin, dir, params) : undefined; },
  FindPartOnRay(self, ray, ignore) { const r = ENV.physics && ENV.physics.raycast(ray.o, ray.d, null, ignore); return r ? [r.inst, r.pos, r.normal, r.mat] : [undefined, ray.o, v3(0, 1, 0), En('Material', 'Air')]; },
  FindPartOnRayWithIgnoreList(self, ray, ignore) { const r = ENV.physics && ENV.physics.raycast(ray.o, ray.d, null, ignore); return r ? [r.inst, r.pos, r.normal, r.mat] : [undefined, ray.o, v3(0, 1, 0), En('Material', 'Air')]; },
  GetPartBoundsInRadius(self, pos, rad, params) { return tbl(ENV.physics ? ENV.physics.inRadius(pos, rad, params) : []); },
  GetPartBoundsInBox(self, cf, size, params) { return tbl(ENV.physics ? ENV.physics.inBox(cf, size, params) : []); },
  GetPartsInPart(self, part, params) { return tbl(ENV.physics ? ENV.physics.inBox(part.props.CFrame, part.props.Size, params, part) : []); },
  GetServerTimeNow() { return Date.now() / 1000; },
  GetRealPhysicsFPS() { return 60; },
  SetInsertPoint() { return E; },
  BulkMoveTo(self, parts, cfs) { for (let i = 1; i <= parts.arr.length; i++) { parts.get(i).lset('CFrame', cfs.get(i)); } return E; },
  PGSIsEnabled() { return true; },
  ZoomToExtents() { return E; },
  UnjoinFromOutsiders() { return E; },
});
for (const [k, v] of Object.entries({ Gravity: 196.2, FallenPartsDestroyHeight: -500, StreamingEnabled: false, AllowThirdPartySales: false, FilteringEnabled: true, DistributedGameTime: 0, CurrentCamera: undefined, Terrain: P(undefined, { get: (i) => i.findChild('Terrain'), ro: true }), Retargeting: En('AnimatorRetargetingMode', 'Default'), Archivable: true, SignalBehavior: En('SignalBehavior', 'Immediate') })) {
  if (k !== 'Archivable') CLASSES.get('Workspace').props.set(k, v && v.$p ? v : { def: v });
}
CLASSES.get('Workspace').props.set('CurrentCamera', { def: undefined });
// RaycastResult is a read-only userdata
class RaycastResult extends Userdata {
  constructor(inst, pos, normal, mat, dist) { super(); this.inst = inst; this.pos = pos; this.normal = normal; this.mat = mat; this.dist = dist; }
  get tname() { return 'RaycastResult'; }
  lget(k) {
    switch (k) { case 'Instance': return this.inst; case 'Position': return this.pos; case 'Normal': return this.normal; case 'Material': return this.mat; case 'Distance': return this.dist; }
    throw rtError(`${tostr(k)} is not a valid member of RaycastResult`);
  }
}
ENV.RaycastResult = RaycastResult;

/* ------------------------------------------------------------------ RunService */
defClass('RunService', 'Instance', { service: true, events: ['Heartbeat', 'Stepped', 'RenderStepped', 'PreRender', 'PreAnimation', 'PreSimulation', 'PostSimulation'], methods: {
  IsServer: () => ctxName() === 'server', IsClient: () => ctxName() === 'client', IsStudio: () => false, IsRunning: () => true, IsRunMode: () => false, IsEdit: () => false,
  Run() { return E; }, Pause() { return E; }, Stop() { return E; },
  BindToRenderStep(self, name, prio, fn) { ENV.renderBinds.push({ name, prio, fn }); ENV.renderBinds.sort((a, b) => a.prio - b.prio); return E; },
  UnbindFromRenderStep(self, name) { ENV.renderBinds = ENV.renderBinds.filter((b) => b.name !== name); return E; },
  SetRobloxGuiFocused() { return E; },
} });
ENV.renderBinds = [];

/* ------------------------------------------------------------------ Debris */
defClass('Debris', 'Instance', { service: true, props: { MaxItems: 1000 }, methods: {
  AddItem(self, inst, life) {
    if (!(inst instanceof Instance)) return E;
    life = typeof life === 'number' ? life : 10;
    const co = new Coroutine(function* () { if (!inst.destroyed) inst.destroy(); return E; }, null);
    rt().sleep(co, life, []);
    return E;
  },
} });

/* ------------------------------------------------------------------ CollectionService */
const collection = ENV.collection = {
  byTag: new Map(), addedSigs: new Map(), removedSigs: new Map(),
  sig(map, tag) { let s = map.get(tag); if (!s) { s = new Signal(tag, null); map.set(tag, s); } return s; },
  addTag(inst, tag) {
    if (typeof tag !== 'string') throw rtError('invalid tag');
    if (!inst.tags) inst.tags = new Set();
    if (inst.tags.has(tag)) return;
    inst.tags.add(tag);
    if (inst.dm) collection.enter(inst, tag);
  },
  removeTag(inst, tag) {
    if (!inst.tags || !inst.tags.has(tag)) return;
    inst.tags.delete(tag);
    if (inst.dm) collection.leave(inst, tag);
  },
  enter(inst, tag) {
    let s = collection.byTag.get(tag); if (!s) collection.byTag.set(tag, s = new Set());
    if (s.has(inst)) return; s.add(inst);
    const sg = collection.addedSigs.get(tag); if (sg) sg.fire(inst);
  },
  leave(inst, tag) {
    const s = collection.byTag.get(tag); if (!s || !s.has(inst)) return; s.delete(inst);
    const sg = collection.removedSigs.get(tag); if (sg) sg.fire(inst);
  },
};
ENV.listeners.attach.push((inst) => { if (inst.tags) for (const t of inst.tags) collection.enter(inst, t); });
ENV.listeners.detach.push((inst) => { if (inst.tags) for (const t of inst.tags) collection.leave(inst, t); });
defClass('CollectionService', 'Instance', { service: true, methods: {
  AddTag(self, i, t) { collection.addTag(i, t); return E; }, RemoveTag(self, i, t) { collection.removeTag(i, t); return E; },
  HasTag(self, i, t) { return !!(i.tags && i.tags.has(t)); },
  GetTagged(self, t) { const s = collection.byTag.get(t); return tbl(s ? Array.from(s) : []); },
  GetTags(self, i) { return tbl(i.tags ? Array.from(i.tags) : []); },
  GetAllTags() { return tbl(Array.from(collection.byTag.keys())); },
  GetInstanceAddedSignal(self, t) { return collection.sig(collection.addedSigs, t); },
  GetInstanceRemovedSignal(self, t) { return collection.sig(collection.removedSigs, t); },
} });

/* ------------------------------------------------------------------ HttpService / JSON */
function toJsonVal(v, depth, seen) {
  if (v === undefined) return null;
  const t = typeof v;
  if (t === 'number') { if (!isFinite(v)) throw rtError('Cannot convert non-finite number to JSON'); return v; }
  if (t === 'string' || t === 'boolean') return v;
  if (v instanceof LuaTable) {
    if (depth > 100) throw rtError('JSON depth limit');
    if (seen.has(v)) throw rtError('Cannot convert cyclic table to JSON');
    seen.add(v);
    let out;
    if (v.hash === null || v.hash === undefined || v.hash.size === 0) out = v.arr.map((x) => toJsonVal(x, depth + 1, seen));
    else {
      out = {};
      for (let k = v.next(undefined); k; k = v.next(k[0])) {
        const key = k[0];
        if (typeof key !== 'string' && typeof key !== 'number') throw rtError('Cannot convert table with non-string keys to JSON');
        out[tostr(key)] = toJsonVal(k[1], depth + 1, seen);
      }
    }
    seen.delete(v);
    return out;
  }
  throw rtError(`Can't convert ${C.typeofx(v)} to JSON`);
}
function fromJsonVal(j) {
  if (j === null) return undefined;
  if (typeof j === 'string') return /[^\x00-\xff]/.test(j) ? utf8enc(j) : j;
  if (typeof j !== 'object') return j;
  if (Array.isArray(j)) { const t = new LuaTable(); j.forEach((x, i) => { const v = fromJsonVal(x); if (v !== undefined) t.set(i + 1, v); else if (i < j.length) { /* nil hole */ } }); return t; }
  const t = new LuaTable();
  for (const k of Object.keys(j)) { const v = fromJsonVal(j[k]); if (v !== undefined) t.set(/[^\x00-\xff]/.test(k) ? utf8enc(k) : k, v); }
  return t;
}
const jsonEncode = (v) => JSON.stringify(toJsonVal(v, 0, new Set()));
const jsonDecode = (s) => { try { return fromJsonVal(JSON.parse(s)); } catch (e) { throw rtError('Can\'t parse JSON: ' + e.message); } };
ENV.jsonEncode = jsonEncode; ENV.jsonDecode = jsonDecode;
let guidN = 0;
defClass('HttpService', 'Instance', { service: true, props: { HttpEnabled: false }, methods: {
  JSONEncode(self, v) { return jsonEncode(v); },
  JSONDecode(self, s) { if (typeof s !== 'string') throw rtError('JSONDecode: string expected'); return jsonDecode(s); },
  GenerateGUID(self, wrap) { const h = () => Math.floor(rt().rand() * 65536).toString(16).padStart(4, '0').toUpperCase(); const g = `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`; return wrap === false ? g : '{' + g + '}'; },
  UrlEncode(self, s) { return encodeURIComponent(s); },
  GetAsync() { throw rtError('Http requests are not enabled. Enable via Game Settings (browser demo has no network access)'); },
  PostAsync() { throw rtError('Http requests are not enabled. Enable via Game Settings (browser demo has no network access)'); },
  RequestAsync() { throw rtError('Http requests are not enabled. Enable via Game Settings (browser demo has no network access)'); },
} });

/* ------------------------------------------------------------------ TweenService */
const PI = Math.PI;
const bounceOut = (t) => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; };
const EASE = {
  Linear: { In: (t) => t },
  Sine: { In: (t) => 1 - Math.cos(t * PI / 2) },
  Quad: { In: (t) => t * t }, Cubic: { In: (t) => t ** 3 }, Quart: { In: (t) => t ** 4 }, Quint: { In: (t) => t ** 5 },
  Exponential: { In: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)) },
  Circular: { In: (t) => 1 - Math.sqrt(1 - t * t) },
  Back: { In: (t) => { const c1 = 1.70158; return (c1 + 1) * t ** 3 - c1 * t * t; } },
  Elastic: { In: (t) => (t === 0 ? 0 : t === 1 ? 1 : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * (2 * PI / 3))) },
  Bounce: { In: (t) => 1 - bounceOut(1 - t) },
};
function ease(style, dir, t) {
  if (t <= 0) return 0; if (t >= 1) return 1;
  const e = EASE[style] || EASE.Quad; const inF = e.In;
  switch (dir) {
    case 'In': return inF(t);
    case 'Out': return style === 'Linear' ? t : 1 - inF(1 - t);
    default: return t < 0.5 ? inF(t * 2) / 2 : 1 - inF((1 - t) * 2) / 2;
  }
}
ENV.ease = ease;
function lerpVal(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (a instanceof Vector3) return v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  if (a instanceof Vector2) return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  if (a instanceof Color3) return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  if (a instanceof UDim2) return new UDim2(a.xs + (b.xs - a.xs) * t, a.xo + (b.xo - a.xo) * t, a.ys + (b.ys - a.ys) * t, a.yo + (b.yo - a.yo) * t);
  if (a instanceof UDim) return new UDim(a.s + (b.s - a.s) * t, a.o + (b.o - a.o) * t);
  if (a instanceof CFrame) return D.cfLerp(a, b, t);
  return t >= 1 ? b : a; // booleans, enums, etc. snap at the end
}
ENV.lerpVal = lerpVal;
defClass('Tween', 'Instance', { noCreate: true, props: { Instance: undefined, TweenInfo: undefined, PlaybackState: En('PlaybackState', 'Begin') }, events: ['Completed'], methods: {
  Play(self) { tweenPlay(self); return E; },
  Pause(self) { if (self.tw.state === 'Playing') { self.tw.state = 'Paused'; self.setProp('PlaybackState', En('PlaybackState', 'Paused')); } return E; },
  Cancel(self) { tweenStop(self, 'Cancelled'); return E; },
} });
const tweens = ENV.tweens = new Set();
function tweenPlay(tw) {
  const s = tw.tw;
  if (s.state === 'Playing') return;
  if (s.state === 'Paused') { s.state = 'Playing'; tw.setProp('PlaybackState', En('PlaybackState', 'Playing')); tweens.add(tw); return; }
  s.state = 'Playing'; s.t = -s.info.delay; s.reps = 0; s.dir = 1; s.from = null;
  tw.setProp('PlaybackState', En('PlaybackState', 'Playing'));
  tweens.add(tw);
}
function tweenStop(tw, res) {
  const s = tw.tw;
  if (s.state !== 'Playing' && s.state !== 'Paused') { return; }
  s.state = 'Idle'; tweens.delete(tw);
  tw.setProp('PlaybackState', En('PlaybackState', res === 'Completed' ? 'Completed' : 'Cancelled'));
  tw.fireSignal('Completed', En('PlaybackState', res));
}
function tweenStep(dt) {
  for (const tw of Array.from(tweens)) {
    const s = tw.tw;
    if (s.state !== 'Playing') continue;
    s.t += dt;
    if (s.t < 0) continue;
    const inst = tw.props.Instance;
    if (inst.destroyed) { tweens.delete(tw); continue; }
    if (s.from === null) { s.from = {}; for (const k of Object.keys(s.goals)) s.from[k] = inst.lget(k); }
    const dur = Math.max(s.info.time, 1e-6);
    let a = Math.min(s.t / dur, 1);
    const rel = s.dir === 1 ? a : 1 - a;
    const e = ease(s.info.style.name, s.info.dir.name, rel);
    for (const k of Object.keys(s.goals)) {
      try { inst.lset(k, lerpVal(s.from[k], s.goals[k], e)); } catch (err) { ENV.warn('Tween: ' + (err && err.message)); tweens.delete(tw); s.state = 'Idle'; break; }
    }
    if (a >= 1 && s.state === 'Playing') {
      if (s.info.reverses && s.dir === 1) { s.dir = -1; s.t = 0; continue; }
      s.reps++;
      if (s.info.repeat < 0 || s.reps <= s.info.repeat) { s.dir = 1; s.t = 0; continue; }
      tweenStop(tw, 'Completed');
    }
  }
}
ENV.tweenStep = tweenStep;
function createTween(inst, info, goals) {
  if (!(inst instanceof Instance)) throw rtError('Argument 1 missing or nil');
  if (!(info instanceof D.TweenInfo)) throw rtError('Argument 2 missing or nil');
  const tw = new Instance(CLASSES.get('Tween'));
  tw.props.Instance = inst; tw.props.TweenInfo = info;
  const g = {};
  for (let k = goals.next(undefined); k; k = goals.next(k[0])) {
    if (!inst.cls.prop(k[0])) throw rtError(`${tostr(k[0])} is not a valid property name.`);
    g[k[0]] = k[1];
  }
  tw.tw = { state: 'Idle', t: 0, goals: g, info: { time: info.time, style: info.style, dir: info.dir, repeat: info.repeat, reverses: info.reverses, delay: info.delay }, dir: 1, reps: 0, from: null };
  return tw;
}
ENV.tweenProps = (inst, goals, time, style, dir, cb) => {
  const t = new LuaTable(); for (const k of Object.keys(goals)) t.set(k, goals[k]);
  const info = new D.TweenInfo(time, style || En('EasingStyle', 'Quad'), dir || En('EasingDirection', 'Out'), 0, false, 0);
  const tw = createTween(inst, info, t);
  if (cb) tw.signal('Completed').connect(cb, true);
  tweenPlay(tw);
};
defClass('TweenService', 'Instance', { service: true, methods: {
  Create(self, inst, info, goals) { return createTween(inst, info, goals); },
  GetValue(self, a, style, dir) { return ease(style.name, dir.name, a); },
} });

/* ------------------------------------------------------------------ DataStore (in-memory + localStorage) */
const storage = ENV.storage = {
  mem: new Map(),
  key(k) { return 'r2w:' + (ENV.placeKey || 'place') + ':' + k; },
  get(k) { try { if (typeof localStorage !== 'undefined' && ENV.persist !== false) return localStorage.getItem(storage.key(k)); } catch (e) { /* private mode */ } return storage.mem.has(k) ? storage.mem.get(k) : null; },
  set(k, v) { storage.mem.set(k, v); try { if (typeof localStorage !== 'undefined' && ENV.persist !== false) localStorage.setItem(storage.key(k), v); } catch (e) { /* quota */ } },
  del(k) { storage.mem.delete(k); try { if (typeof localStorage !== 'undefined') localStorage.removeItem(storage.key(k)); } catch (e) { /* */ } },
  clearAll() { storage.mem.clear(); try { if (typeof localStorage !== 'undefined') { for (const k of Object.keys(localStorage)) if (k.startsWith('r2w:' + (ENV.placeKey || 'place') + ':')) localStorage.removeItem(k); } } catch (e) { /* */ } },
};
function* netYield() { // simulate async DB latency: one frame
  const co = CO.current; if (!co) return;
  ENV.rt.sleep(co, 0.001, []); yield SCHED;
}
class DataStoreObj extends Userdata {
  constructor(name, scope, ordered) { super(); this.name = name; this.scope = scope || 'global'; this.ordered = !!ordered; this.prefix = `ds:${name}/${this.scope}/`; }
  get tname() { return this.ordered ? 'OrderedDataStore' : 'DataStore'; }
  lget(k) { const m = DSM[k]; if (m) return m; throw rtError(`${tostr(k)} is not a valid member of ${this.tname}`); }
  load(key) { const raw = storage.get(this.prefix + key); if (raw === null || raw === undefined) return undefined; return fromJsonVal(JSON.parse(raw)); }
  save(key, v) { if (v === undefined) storage.del(this.prefix + key); else storage.set(this.prefix + key, JSON.stringify(toJsonVal(v, 0, new Set()))); }
  keys() { const out = []; const pre = storage.key(this.prefix); const seen = new Set(); for (const k of storage.mem.keys()) if (k.startsWith(this.prefix)) { seen.add(k); out.push(k.slice(this.prefix.length)); } try { if (typeof localStorage !== 'undefined') for (const k of Object.keys(localStorage)) if (k.startsWith(pre)) { const kk = k.slice(pre.length); if (!out.includes(kk)) out.push(kk); } } catch (e) { /* */ } return out; }
}
const chkKey = (k) => { if (typeof k !== 'string' || k === '') throw rtError('DataStore: key must be a non-empty string'); if (k.length > 50) throw rtError('104: Key name exceeds 50 character limit'); return k; };
const DSM = {
  GetAsync: function* (self, key) { chkKey(key); yield* netYield(); return self.load(key); },
  SetAsync: function* (self, key, v) { chkKey(key); if (self.ordered && (typeof v !== 'number')) throw rtError('OrderedDataStore values must be integers'); yield* netYield(); self.save(key, v); return E; },
  UpdateAsync: function* (self, key, fn) {
    chkKey(key); yield* netYield();
    const cur = self.load(key);
    const r = yield* C.toCallable(fn)(cur);
    const nv = r instanceof Array ? r[0] : r;
    if (nv === undefined) return cur;
    self.save(key, nv); return self.load(key);
  },
  IncrementAsync: function* (self, key, d) { chkKey(key); yield* netYield(); const cur = self.load(key); const nv = (typeof cur === 'number' ? cur : 0) + (d === undefined ? 1 : d); self.save(key, nv); return nv; },
  RemoveAsync: function* (self, key) { chkKey(key); yield* netYield(); const cur = self.load(key); self.save(key, undefined); return cur; },
  GetSortedAsync: function* (self, asc, pageSize, mn, mx) {
    yield* netYield();
    const rows = self.keys().map((k) => ({ key: k, value: self.load(k) })).filter((r) => typeof r.value === 'number' && (mn === undefined || r.value >= mn) && (mx === undefined || r.value <= mx));
    rows.sort((a, b) => (asc ? a.value - b.value : b.value - a.value));
    return new Pages(rows, pageSize || 50);
  },
};
for (const k of Object.keys(DSM)) DSM[k].$name = k;
class Pages extends Userdata {
  constructor(rows, size) { super(); this.rows = rows; this.size = size; this.i = 0; }
  get tname() { return 'DataStorePages'; }
  lget(k) {
    switch (k) {
      case 'IsFinished': return this.i + this.size >= this.rows.length;
      case 'GetCurrentPage': return nat((s) => tbl(s.rows.slice(s.i, s.i + s.size).map((r) => { const t = new LuaTable(); t.set('key', r.key); t.set('value', r.value); return t; })), 'GetCurrentPage');
      case 'AdvanceToNextPageAsync': return nat((s) => { s.i += s.size; return E; }, 'AdvanceToNextPageAsync');
    }
    throw rtError(`${tostr(k)} is not a valid member of DataStorePages`);
  }
}
defClass('GlobalDataStore', 'Instance', { noCreate: true });
defClass('DataStoreService', 'Instance', { service: true, props: {}, methods: {
  GetDataStore(self, name, scope) { if (typeof name !== 'string') throw rtError('DataStore name must be a string'); return new DataStoreObj(name, scope, false); },
  GetOrderedDataStore(self, name, scope) { return new DataStoreObj(name, scope, true); },
  GetGlobalDataStore() { return new DataStoreObj('global', 'global', false); },
  GetRequestBudgetForRequestType() { return 100; },
  ListDataStoresAsync() { return new LuaTable(); },
} });

/* ------------------------------------------------------------------ MemoryStore / Messaging (local-only emulation) */
const mem = { maps: new Map(), queues: new Map() };
class MemMap extends Userdata {
  constructor(name) { super(); this.name = name; this.m = new Map(); }
  get tname() { return 'MemoryStoreSortedMap'; }
  lget(k) {
    switch (k) {
      case 'SetAsync': return nat((s, key, v, exp) => { s.m.set(key, { v: C.type(v) === 'table' ? fromJsonVal(toJsonVal(v, 0, new Set())) : v, exp: ENV.rt.now + (exp || 3600) }); return true; }, 'SetAsync');
      case 'GetAsync': return nat((s, key) => { const e = s.m.get(key); if (!e || e.exp < ENV.rt.now) return undefined; return e.v; }, 'GetAsync');
      case 'RemoveAsync': return nat((s, key) => { s.m.delete(key); return E; }, 'RemoveAsync');
      case 'UpdateAsync': return function* (s, key, exp, fn) { const e = s.m.get(key); const r = yield* C.toCallable(fn)(e && e.exp >= ENV.rt.now ? e.v : undefined); const nv = r instanceof Array ? r[0] : r; if (nv !== undefined) s.m.set(key, { v: nv, exp: ENV.rt.now + (exp || 3600) }); return nv; };
      case 'GetRangeAsync': return nat((s, dir, count) => { const rows = Array.from(s.m.entries()).filter(([, e]) => e.exp >= ENV.rt.now).sort((a, b) => (a[0] < b[0] ? -1 : 1)); if (dir && dir.name === 'Descending') rows.reverse(); return tbl(rows.slice(0, count).map(([key, e]) => { const t = new LuaTable(); t.set('key', key); t.set('value', e.v); return t; })); }, 'GetRangeAsync');
    }
    throw rtError(`${tostr(k)} is not a valid member of MemoryStoreSortedMap`);
  }
}
defClass('MemoryStoreService', 'Instance', { service: true, methods: {
  GetSortedMap(self, name) { if (!mem.maps.has(name)) mem.maps.set(name, new MemMap(name)); return mem.maps.get(name); },
  GetHashMap(self, name) { if (!mem.maps.has(name)) mem.maps.set(name, new MemMap(name)); return mem.maps.get(name); },
  GetQueue() { noteUnsupported('MemoryStoreService:GetQueue'); throw rtError('MemoryStoreService:GetQueue is not supported by the browser emulator'); },
} });
const topics = new Map();
defClass('MessagingService', 'Instance', { service: true, methods: {
  PublishAsync(self, topic, msg) { const subs = topics.get(topic) || []; const data = net.copyArgs([msg])[0]; for (const s of subs) { if (!s.connected) continue; const t = new LuaTable(); t.set('Data', data); t.set('Sent', Date.now() / 1000); net.later(() => { if (s.connected) ENV.rt.spawn(s.fn, [t], s.ctx); }); } return E; },
  SubscribeAsync(self, topic, fn) { const c = new I.Connection(null, fn, CO.current ? CO.current.ctx : null, false); c.sig = { conns: [] }; if (!topics.has(topic)) topics.set(topic, []); topics.get(topic).push(c); return c; },
} });

/* ------------------------------------------------------------------ MarketplaceService (demo purchases) */
const market = ENV.market = { owned: new Set(), catalog: { gamepasses: {}, products: {}, assets: {} }, autoPurchase: true, receipts: [], history: [] };
function loadOwned() { try { const raw = storage.get('market:owned'); if (raw) for (const x of JSON.parse(raw)) market.owned.add(x); } catch (e) { /* */ } }
function saveOwned() { storage.set('market:owned', JSON.stringify(Array.from(market.owned))); }
ENV.loadOwned = loadOwned;
function catalogInfo(kind, id) {
  const c = market.catalog[kind] && (market.catalog[kind][id] || market.catalog[kind][String(id)]);
  return c || { name: (kind === 'gamepasses' ? 'Game Pass #' : kind === 'products' ? 'Developer Product #' : 'Asset #') + id, price: 0, description: '' };
}
function askPurchase(info, cb) {
  market.history.push(info);
  if (ENV.purchaseUI) ENV.purchaseUI(info, cb); else net.later(() => cb(market.autoPurchase !== false));
}
function* getPlayerArg(p, what) { if (!(p instanceof Instance) || !p.isA('Player')) throw rtError(what + ': Player expected'); return p; }
defClass('MarketplaceService', 'Instance', { service: true, props: { ProcessReceipt: undefined }, events: ['PromptGamePassPurchaseFinished', 'PromptProductPurchaseFinished', 'PromptPurchaseFinished', 'PromptPremiumPurchaseFinished', 'PromptBulkPurchaseFinished', 'PromptSubscriptionPurchaseFinished'], methods: {
  PromptGamePassPurchase(self, player, id) {
    const info = catalogInfo('gamepasses', id);
    askPurchase({ kind: 'gamepass', id, name: info.name, price: info.price, description: info.description }, (ok) => {
      if (ok) { market.owned.add('gp:' + id); saveOwned(); }
      self.fireSignal('PromptGamePassPurchaseFinished', player, id, !!ok);
      self.fireSignal('PromptPurchaseFinished', player, id, !!ok);
    });
    return E;
  },
  PromptProductPurchase(self, player, id) {
    const info = catalogInfo('products', id);
    askPurchase({ kind: 'product', id, name: info.name, price: info.price, description: info.description }, (ok) => {
      if (ok) {
        const receipt = new LuaTable();
        receipt.set('PlayerId', player.props.UserId); receipt.set('PurchaseId', 'demo-' + (market.receipts.length + 1) + '-' + Math.floor(Date.now() / 1000)); receipt.set('ProductId', id); receipt.set('CurrencySpent', info.price); receipt.set('CurrencyType', En('CurrencyType', 'Robux')); receipt.set('PlaceIdWherePurchased', ENV.game.props.PlaceId);
        market.receipts.push(receipt);
        const cb = self.props.ProcessReceipt;
        if (cb) {
          const co = new Coroutine(function* () {
            try { const r = yield* C.toCallable(cb)(receipt); const d = r instanceof Array ? r[0] : r; market.lastDecision = d && d.name; if (d && d.name !== 'PurchaseGranted') ENV.warn('ProcessReceipt returned ' + d.name + ' (purchase would be retried in real Roblox)'); } catch (e) { ENV.warn('ProcessReceipt error: ' + tostr(C.errValue(e))); }
            return E;
          }, ENV.contexts.server);
          ENV.rt.resumeThread(co, []);
        } else ENV.warn('MarketplaceService.ProcessReceipt is not set: product purchase ' + id + ' was not granted');
      }
      self.fireSignal('PromptProductPurchaseFinished', player.props.UserId, id, !!ok);
      self.fireSignal('PromptPurchaseFinished', player, id, !!ok);
    });
    return E;
  },
  PromptPurchase(self, player, id) { askPurchase({ kind: 'asset', id, name: catalogInfo('assets', id).name, price: catalogInfo('assets', id).price }, (ok) => self.fireSignal('PromptPurchaseFinished', player, id, !!ok)); return E; },
  PromptPremiumPurchase(self, player) { askPurchase({ kind: 'premium', id: 0, name: 'Roblox Premium', price: 0 }, (ok) => { if (ok && ENV.setPremium) ENV.setPremium(player, true); self.fireSignal('PromptPremiumPurchaseFinished'); }); return E; },
  PromptSubscriptionPurchase() { noteUnsupported('MarketplaceService:PromptSubscriptionPurchase'); return E; },
  UserOwnsGamePassAsync: function* (self, uid, id) { yield* netYield(); return market.owned.has('gp:' + id); },
  PlayerOwnsAsset: function* (self, player, id) { yield* netYield(); return market.owned.has('asset:' + id); },
  PlayerOwnsBundle() { return false; },
  GetProductInfo: function* (self, id, infoType) {
    yield* netYield();
    const kind = infoType && infoType.name === 'GamePass' ? 'gamepasses' : infoType && infoType.name === 'Product' ? 'products' : 'assets';
    const c = catalogInfo(kind, id); const t = new LuaTable();
    t.set('Name', c.name); t.set('Description', c.description || ''); t.set('PriceInRobux', c.price); t.set('IsForSale', true); t.set('ProductId', id); t.set('AssetId', id); t.set('IsPublicDomain', false);
    const cr = new LuaTable(); cr.set('Name', 'Demo'); cr.set('Id', 1); t.set('Creator', cr);
    return t;
  },
  GetUserSubscriptionStatusAsync() { return new LuaTable(); },
  GetRobuxBalance() { return 0; },
} });

/* ------------------------------------------------------------------ PolicyService, misc stubs */
defMethods('PolicyService', { GetPolicyInfoForPlayerAsync: function* (self, p) { yield* netYield(); const t = new LuaTable(); t.set('ArePaidRandomItemsRestricted', false); t.set('IsPaidItemTradingAllowed', true); t.set('AllowedExternalLinkReferences', tbl(['Discord', 'YouTube'])); t.set('IsSubjectToChinaPolicies', false); t.set('AreAdsAllowed', true); return t; }, });
defMethods('TextService', { GetTextSize(self, text, size, font, bounds) { return ENV.textSize ? ENV.textSize(text, size, font, bounds ? bounds.x : 1e9) : new Vector2(text.length * size * 0.5, size * 1.2); }, FilterStringAsync: function* (self, text) { return { filtered: text }; }, });
defMethods('TeleportService', { Teleport() { noteUnsupported('TeleportService:Teleport'); ENV.warn('TeleportService is not supported in the browser demo (teleport ignored)'); return E; }, TeleportAsync() { noteUnsupported('TeleportService:TeleportAsync'); ENV.warn('TeleportService is not supported in the browser demo (teleport ignored)'); return E; }, GetLocalPlayerTeleportData() { return undefined; }, });
defMethods('BadgeService', { AwardBadge() { return true; }, UserHasBadgeAsync: function* () { return false; }, GetBadgeInfoAsync: function* () { return new LuaTable(); } });
defMethods('GuiService', { GetGuiInset() { return [new Vector2(0, 0), new Vector2(0, 0)]; }, IsTenFootInterface() { return false; }, GetScreenResolution() { return ENV.viewport ? ENV.viewport() : new Vector2(1280, 720); }, SetMenuIsOpen() { return E; } });
CLASSES.get('GuiService').props.set('MenuIsOpen', { def: false });
CLASSES.get('GuiService').props.set('SelectedObject', { def: undefined });
CLASSES.get('GuiService').props.set('TouchControlsEnabled', { def: true });
CLASSES.get('GuiService').props.set('AutoSelectGuiEnabled', { def: true });
CLASSES.get('GuiService').props.set('GuiNavigationEnabled', { def: true });
defMethods('LocalizationService', { GetCountryRegionForPlayerAsync() { return 'US'; }, });
CLASSES.get('LocalizationService').props.set('RobloxLocaleId', { def: 'en-us' });
CLASSES.get('LocalizationService').props.set('SystemLocaleId', { def: 'en-us' });
defMethods('ContentProvider', { PreloadAsync: function* () { return E; } });
CLASSES.get('ContentProvider').props.set('RequestQueueSize', { def: 0 });
defMethods('GroupService', { GetGroupInfoAsync() { return new LuaTable(); } });
defMethods('AnalyticsService', { LogEconomyEvent() { return E; }, LogOnboardingFunnelStepEvent() { return E; }, LogCustomEvent() { return E; }, LogFunnelStepEvent() { return E; } });
defMethods('SocialService', { PromptGameInvite() { return E; }, CanSendGameInviteAsync: function* () { return false; } });
defMethods('LogService', { GetLogHistory() { return new LuaTable(); } });
defMethods('HapticService', { IsVibrationSupported() { return false; }, SetMotor() { return E; } });
defMethods('AssetService', { CreatePlaceAsync() { return 0; } });
defMethods('Stats', { GetTotalMemoryUsageMb() { return 128; } });
CLASSES.get('Stats').props.set('HeartbeatTimeMs', { def: 16 });
CLASSES.get('Stats').props.set('PhysicsStepTimeMs', { def: 1 });
CLASSES.get('Stats').props.set('DataSendKbps', { def: 0 });
CLASSES.get('Stats').props.set('DataReceiveKbps', { def: 0 });
defMethods('PhysicsService', { RegisterCollisionGroup(self, n) { ENV.cgroups[n] = ENV.cgroups[n] || {}; return E; }, CreateCollisionGroup(self, n) { ENV.cgroups[n] = ENV.cgroups[n] || {}; return 1; }, CollisionGroupSetCollidable(self, a, b, c) { (ENV.cgroups[a] = ENV.cgroups[a] || {})[b] = c; (ENV.cgroups[b] = ENV.cgroups[b] || {})[a] = c; return E; }, CollisionGroupsAreCollidable(self, a, b) { const g = ENV.cgroups[a]; return !(g && g[b] === false); }, SetPartCollisionGroup(self, p, n) { p.lset('CollisionGroup', n); return E; }, GetCollisionGroupName(self, id) { return 'Default'; }, GetRegisteredCollisionGroups() { return new LuaTable(); }, });
ENV.cgroups = {};
// pathfinding: straight-line waypoints (no navmesh)
class PathObj extends Userdata {
  constructor(p) { super(); this.params = p; this.wps = []; this.status = 'NoPath'; }
  get tname() { return 'Path'; }
  lget(k) {
    switch (k) {
      case 'ComputeAsync': return function* (s, a, b) {
        yield* netYield();
        const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); const n = Math.max(1, Math.ceil(d / 4)); s.wps = [];
        for (let i = 0; i <= n; i++) { const t = i / n; const w = new LuaTable(); w.set('Position', v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)); w.set('Action', En('PathWaypointAction', 'Walk')); w.set('Label', ''); s.wps.push(w); }
        s.status = 'Success'; return E;
      };
      case 'GetWaypoints': return nat((s) => tbl(s.wps.slice()), 'GetWaypoints');
      case 'Status': return En('PathStatus', this.status);
      case 'Blocked': return new Signal('Blocked', this);
    }
    throw rtError(`${tostr(k)} is not a valid member of Path`);
  }
}
defMethods('PathfindingService', { CreatePath(self, p) { noteUnsupported('PathfindingService (straight-line only)'); return new PathObj(p); } });

/* ------------------------------------------------------------------ misc exports */
module.exports = { jsonEncode, jsonDecode, ease, lerpVal, tweenStep, collection, market, storage, createTween, ENV, tbl, ctxName, netYield, toJsonVal, fromJsonVal, DataStoreObj, RaycastResult };

};
defs["rbx/classes.js"]=function(module,exports,require){'use strict';
// Class definitions: Instance hierarchy (non-GUI, non-service).
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED } = C;
const { nat } = require('../lua2js/runtime');
const D = require('./datatypes');
const I = require('./instance');
const { ENV, defClass, defMethods, P, RO, Instance, Signal, newInstance } = I;
const { Vector3, Vector2, CFrame, Color3, v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);
const hasPos = (x) => x instanceof Vector3;

/* ---------------- plain containers & values ---------------- */
defClass('PVInstance', 'Instance', { noCreate: true });
defClass('Folder', 'Instance');
defClass('Configuration', 'Instance');
defClass('Camera', 'Instance', { props: {
  CFrame: new CFrame(0, 10, 20), FieldOfView: 70, CameraType: En('CameraType','Custom'), CameraSubject: undefined, Focus: new CFrame(0, 0, 0), ViewportSize: P(undefined, { get: () => (ENV.viewport ? ENV.viewport() : new Vector2(1280, 720)), ro: true }), NearPlaneZ: -0.5, HeadLocked: true, DiagonalFieldOfView: 80, MaxAxisFieldOfView: 70,
}, methods: {
  WorldToViewportPoint(self, p) { const r = ENV.project ? ENV.project(p) : [0, 0, 0, false]; return [new Vector3(r[0], r[1], r[2]), r[3]]; },
  WorldToScreenPoint(self, p) { const r = ENV.project ? ENV.project(p) : [0, 0, 0, false]; return [new Vector3(r[0], r[1], r[2]), r[3]]; },
  ViewportPointToRay(self, x, y) { return ENV.screenRay ? ENV.screenRay(x, y) : new D.Ray(v3(0, 0, 0), v3(0, 0, -1)); },
  ScreenPointToRay(self, x, y) { return ENV.screenRay ? ENV.screenRay(x, y) : new D.Ray(v3(0, 0, 0), v3(0, 0, -1)); },
  GetPartsObscuringTarget() { return new LuaTable(); },
  GetRenderCFrame(self) { return self.props.CFrame; },
} });

defClass('ValueBase', 'Instance', { noCreate: true });
for (const [cn, def] of [['StringValue', ''], ['NumberValue', 0], ['IntValue', 0], ['BoolValue', false], ['ObjectValue', undefined], ['Color3Value', new Color3(0, 0, 0)], ['Vector3Value', v3(0, 0, 0)], ['CFrameValue', new CFrame(0, 0, 0)], ['BrickColorValue', new D.BrickColor(D.brickByName('Medium stone grey'))], ['RayValue', undefined]]) {
  defClass(cn, 'ValueBase', { props: { Value: P(def, { check: cn === 'IntValue' ? (v) => (typeof v === 'number' ? Math.round(v) : v) : undefined }) } });
}

/* ---------------- Scripts & remotes ---------------- */
defClass('LuaSourceContainer', 'Instance', { noCreate: true });
defClass('BaseScript', 'LuaSourceContainer', { noCreate: true, props: { Enabled: true, Disabled: P(false, { set(i, v) { i.setProp('Disabled', v); i.setProp('Enabled', !v); } }), RunContext: En('RunContext','Legacy'), Source: '' } });
defClass('Script', 'BaseScript', { props: { LinkedSource: '' } });
defClass('LocalScript', 'BaseScript');
defClass('ModuleScript', 'LuaSourceContainer', { props: { Source: '' } });
defClass('RemoteEvent', 'Instance', { events: ['OnServerEvent', 'OnClientEvent'], methods: {
  FireServer(self, ...args) { ENV.net.fireServer(self, args); return E; },
  FireClient(self, player, ...args) { ENV.net.fireClient(self, player, args); return E; },
  FireAllClients(self, ...args) { ENV.net.fireAllClients(self, args); return E; },
} });
defClass('UnreliableRemoteEvent', 'RemoteEvent');
defClass('RemoteFunction', 'Instance', { props: { OnServerInvoke: P(undefined, { set(i, v) { i.setProp('OnServerInvoke', v); } }), OnClientInvoke: undefined }, methods: {
  InvokeServer: function* (self, ...args) { return yield* ENV.net.invokeServer(self, args); },
  InvokeClient: function* (self, player, ...args) { return yield* ENV.net.invokeClient(self, player, args); },
} });
defClass('BindableEvent', 'Instance', { events: ['Event'], methods: {
  Fire(self, ...args) { self.signal('Event').fire(...ENV.net.copyArgs(args)); return E; },
} });
defClass('BindableFunction', 'Instance', { props: { OnInvoke: undefined }, methods: {
  Invoke: function* (self, ...args) { const f = self.props.OnInvoke; if (!f) throw rtError('BindableFunction has no OnInvoke handler'); return yield* C.toCallable(f)(...ENV.net.copyArgs(args)); },
} });

/* ---------------- Parts ---------------- */
const surf = () => En('SurfaceType', 'Smooth');
function setCF(part, cf) {
  const old = part.props.CFrame;
  if (old === cf) return;
  part.props.CFrame = cf;
  part.changed('CFrame');
  if (part.psigs) { for (const k of ['Position', 'Orientation', 'Rotation']) if (part.psigs[k]) part.psigs[k].fire(); }
}
const EULER_DEG = (r) => { const e = D.eulerYXZ(r); return v3(e[0] * 180 / Math.PI, e[1] * 180 / Math.PI, e[2] * 180 / Math.PI); };
function volumeOf(p) { const s = p.props.Size; const sh = p.props.Shape; if (sh && sh.name === 'Ball') return Math.PI / 6 * s.x * s.y * s.z; return s.x * s.y * s.z; }
defClass('BasePart', 'PVInstance', { noCreate: true, events: ['Touched', 'TouchEnded'], props: {
  CFrame: P(new CFrame(0, 0, 0), { set: (i, v) => { if (!(v instanceof CFrame)) throw rtError('Unable to assign property CFrame. CFrame expected, got ' + C.tnameForErr(v)); setCF(i, v); } }),
  Position: P(undefined, { get: (i) => i.props.CFrame.pos, set: (i, v) => { const c = i.props.CFrame; setCF(i, new CFrame(v.x, v.y, v.z, c.r)); } }),
  Orientation: P(undefined, { get: (i) => EULER_DEG(i.props.CFrame.r), set: (i, v) => { const c = i.props.CFrame; const k = Math.PI / 180; setCF(i, new CFrame(c.x, c.y, c.z, D.rotFromYXZ(v.x * k, v.y * k, v.z * k))); } }),
  Rotation: P(undefined, { get: (i) => EULER_DEG(i.props.CFrame.r), set: (i, v) => { const c = i.props.CFrame; const k = Math.PI / 180; setCF(i, new CFrame(c.x, c.y, c.z, D.rotFromYXZ(v.x * k, v.y * k, v.z * k))); } }),
  Size: P(v3(4, 1, 2), { check: (v) => { if (!hasPos(v)) throw rtError('Unable to assign property Size. Vector3 expected, got ' + C.tnameForErr(v)); return v; } }),
  Color: new Color3(0.63, 0.635, 0.64),
  BrickColor: P(undefined, { get: (i) => new D.BrickColor(D.brickNearest(i.props.Color)), set: (i, v) => i.setProp('Color', v.color3()) }),
  Material: En('Material','Plastic'), Transparency: 0, Reflectance: 0, Anchored: false, CanCollide: true, CanTouch: true, CanQuery: true, CastShadow: true, Massless: false, Locked: false,
  Velocity: P(undefined, { get: (i) => i.props.AssemblyLinearVelocity, set: (i, v) => i.setProp('AssemblyLinearVelocity', v) }),
  AssemblyLinearVelocity: v3(0, 0, 0), AssemblyAngularVelocity: v3(0, 0, 0),
  RotVelocity: P(undefined, { get: (i) => i.props.AssemblyAngularVelocity, set: (i, v) => i.setProp('AssemblyAngularVelocity', v) }),
  Mass: P(undefined, { get: (i) => Math.max(0.001, volumeOf(i) * 0.7), ro: true }),
  AssemblyMass: P(undefined, { get: (i) => Math.max(0.001, volumeOf(i) * 0.7), ro: true }),
  CollisionGroup: 'Default', CollisionGroupId: 0, CustomPhysicalProperties: undefined, PivotOffset: new CFrame(0, 0, 0), RootPriority: 0,
  TopSurface: surf(), BottomSurface: surf, LeftSurface: surf, RightSurface: surf, FrontSurface: surf, BackSurface: surf, Shape: undefined,
  AudioCanCollide: true, EnableFluidForces: true,
}, methods: {
  GetMass: (self) => Math.max(0.001, volumeOf(self) * 0.7),
  ApplyImpulse(self, v) { const m = Math.max(0.001, volumeOf(self) * 0.7); const a = self.props.AssemblyLinearVelocity; self.setProp('AssemblyLinearVelocity', v3(a.x + v.x / m, a.y + v.y / m, a.z + v.z / m)); return E; },
  ApplyAngularImpulse() { return E; },
  GetTouchingParts(self) { return new LuaTable(ENV.physics ? ENV.physics.touching(self) : []); },
  GetConnectedParts() { return new LuaTable(); },
  GetJoints() { return new LuaTable(); },
  GetRootPart(self) { return self; },
  BreakJoints() { return E; }, MakeJoints() { return E; },
  SetNetworkOwner() { return E; }, SetNetworkOwnershipAuto() { return E; }, GetNetworkOwner() { return undefined; }, CanSetNetworkOwnership() { return [true]; },
  CanCollideWith() { return true; }, IsGrounded() { return false; },
  PivotTo(self, cf) { setCF(self, D.cfMul(cf, D.cfInverse(self.props.PivotOffset))); return E; },
  GetPivot(self) { return D.cfMul(self.props.CFrame, self.props.PivotOffset); },
  Resize() { return false; },
} });
defClass('Part', 'BasePart', { props: { Shape: En('PartType','Block') } });
defClass('WedgePart', 'BasePart'); defClass('CornerWedgePart', 'BasePart'); defClass('TrussPart', 'BasePart');
defClass('SpawnLocation', 'Part', { props: { Neutral: true, Duration: 10, Enabled: true, AllowTeamChangeOnTouch: false, TeamColor: undefined } });
defClass('Seat', 'Part', { props: { Disabled: false, Occupant: undefined } });
defClass('VehicleSeat', 'Part', { props: { Disabled: false, MaxSpeed: 25, Throttle: 0, Steer: 0, Torque: 10, TurnSpeed: 1, Occupant: undefined } });
defClass('MeshPart', 'BasePart', { props: { MeshId: '', TextureID: '', CollisionFidelity: En('CollisionFidelity','Default'), RenderFidelity: En('RenderFidelity','Automatic'), DoubleSided: false } });
defClass('UnionOperation', 'BasePart', { props: { UsePartColor: false } });
defClass('NegateOperation', 'BasePart');
defClass('Terrain', 'BasePart', { props: { WaterWaveSize: 0.15, WaterColor: new Color3(0.05, 0.33, 0.36) }, methods: { FillBlock() { return E; }, Clear() { return E; }, FillBall() { return E; }, WorldToCell() { return v3(0, 0, 0); } }, noCreate: true });
defClass('Model', 'PVInstance', { props: {
  PrimaryPart: undefined, WorldPivot: P(undefined, { get: (i) => i.props.WorldPivot, set: (i, v) => i.setProp('WorldPivot', v) }), ModelStreamingMode: En('ModelStreamingMode','Default'), LevelOfDetail: En('ModelLevelOfDetail','Automatic'),
}, methods: {
  GetPivot(self) { return I.modelPivot(self); },
  PivotTo(self, cf) { pivotModel(self, cf); return E; },
  MoveTo(self, pos) {
    const cur = I.modelPivot(self);
    const d = new CFrame(pos.x - cur.x, pos.y - cur.y, pos.z - cur.z);
    for (const p of self.descendants()) if (p.isA('BasePart')) { const c = p.props.CFrame; setCF(p, new CFrame(c.x + d.x, c.y + d.y, c.z + d.z, c.r)); }
    return E;
  },
  TranslateBy(self, d) { for (const p of self.descendants()) if (p.isA('BasePart')) { const c = p.props.CFrame; setCF(p, new CFrame(c.x + d.x, c.y + d.y, c.z + d.z, c.r)); } return E; },
  SetPrimaryPartCFrame(self, cf) { pivotModel(self, cf); return E; },
  GetBoundingBox(self) { const b = bboxOf(self); return [new CFrame(b.cx, b.cy, b.cz), v3(b.sx, b.sy, b.sz)]; },
  GetExtentsSize(self) { const b = bboxOf(self); return v3(b.sx, b.sy, b.sz); },
  BreakJoints() { return E; }, MakeJoints() { return E; },
  GetScale() { return 1; }, ScaleTo() { return E; },
} });
defClass('Actor', 'Model');
function pivotModel(self, cf) {
  const cur = I.modelPivot(self);
  const delta = D.cfMul(cf, D.cfInverse(cur));
  for (const d of self.descendants()) if (d.isA('BasePart')) setCF(d, D.cfMul(delta, d.props.CFrame));
  if (self.props.WorldPivot) self.props.WorldPivot = D.cfMul(delta, self.props.WorldPivot);
}
function bboxOf(m) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of m.descendants()) if (p.isA('BasePart')) {
    const c = p.props.CFrame, s = p.props.Size, r = c.r;
    const hx = (Math.abs(r[0]) * s.x + Math.abs(r[1]) * s.y + Math.abs(r[2]) * s.z) / 2, hy = (Math.abs(r[3]) * s.x + Math.abs(r[4]) * s.y + Math.abs(r[5]) * s.z) / 2, hz = (Math.abs(r[6]) * s.x + Math.abs(r[7]) * s.y + Math.abs(r[8]) * s.z) / 2;
    mn = [Math.min(mn[0], c.x - hx), Math.min(mn[1], c.y - hy), Math.min(mn[2], c.z - hz)]; mx = [Math.max(mx[0], c.x + hx), Math.max(mx[1], c.y + hy), Math.max(mx[2], c.z + hz)];
  }
  if (mn[0] === Infinity) return { cx: 0, cy: 0, cz: 0, sx: 0, sy: 0, sz: 0 };
  return { cx: (mn[0] + mx[0]) / 2, cy: (mn[1] + mx[1]) / 2, cz: (mn[2] + mx[2]) / 2, sx: mx[0] - mn[0], sy: mx[1] - mn[1], sz: mx[2] - mn[2] };
}
defClass('WeldConstraint', 'Instance', { props: { Part0: undefined, Part1: undefined, Enabled: true }, init(i) { } });
defClass('Weld', 'Instance', { props: { Part0: undefined, Part1: undefined, C0: new CFrame(0, 0, 0), C1: new CFrame(0, 0, 0), Enabled: true } });
defClass('Motor6D', 'Weld', { props: { MaxVelocity: 0.1, DesiredAngle: 0, CurrentAngle: 0, Transform: new CFrame(0, 0, 0) } });
defClass('Attachment', 'Instance', { props: {
  CFrame: new CFrame(0, 0, 0), Position: P(undefined, { get: (i) => i.props.CFrame.pos, set: (i, v) => i.setProp('CFrame', new CFrame(v.x, v.y, v.z, i.props.CFrame.r)) }),
  WorldPosition: P(undefined, { get: (i) => attWorld(i).pos, ro: true }), WorldCFrame: P(undefined, { get: (i) => attWorld(i), ro: true }), Visible: false,
  Axis: v3(1, 0, 0), SecondaryAxis: v3(0, 1, 0),
} });
function attWorld(a) { return a.parent && a.parent.isA('BasePart') ? D.cfMul(a.parent.props.CFrame, a.props.CFrame) : a.props.CFrame; }
for (const cn of ['BodyVelocity', 'BodyPosition', 'BodyGyro', 'BodyForce', 'BodyAngularVelocity', 'BodyThrust', 'AlignPosition', 'AlignOrientation', 'LinearVelocity', 'AngularVelocity', 'VectorForce', 'Torque', 'HingeConstraint', 'SpringConstraint', 'RodConstraint', 'RopeConstraint', 'BallSocketConstraint', 'PrismaticConstraint', 'NoCollisionConstraint', 'Beam', 'Trail', 'Fire', 'Smoke', 'Sparkles', 'Highlight', 'SelectionBox', 'SelectionSphere', 'Explosion', 'ForceField', 'Shirt', 'Pants', 'ShirtGraphic', 'BodyColors', 'CharacterMesh', 'Accessory', 'Hat', 'HumanoidDescription', 'Clouds', 'ColorCorrectionEffect', 'DepthOfFieldEffect', 'SunRaysEffect', 'BlurEffect', 'BloomEffect', 'Atmosphere', 'Sky', 'BlockMesh', 'SpecialMesh', 'CylinderMesh', 'FileMesh', 'Decal', 'Texture', 'SurfaceAppearance', 'Dialog', 'DialogChoice', 'ParticleEmitter', 'Handles', 'ArcHandles', 'Team', 'PathfindingModifier', 'PathfindingLink']) {
  if (!I.CLASSES.has(cn)) defClass(cn, cn === 'Hat' ? 'Accessory' : 'Instance', { props: genericProps(cn) });
}
function genericProps(cn) {
  const m = {
    BodyVelocity: { Velocity: v3(0, 0, 0), MaxForce: v3(4000, 4000, 4000), P: 1250 }, BodyPosition: { Position: v3(0, 0, 0), MaxForce: v3(4000, 4000, 4000), D: 1250, P: 10000 }, BodyGyro: { CFrame: new CFrame(0, 0, 0), MaxTorque: v3(4000, 4000, 4000), D: 500, P: 3000 },
    BodyForce: { Force: v3(0, 0, 0) }, BodyAngularVelocity: { AngularVelocity: v3(0, 0, 0), MaxTorque: v3(4000, 4000, 4000), P: 1250 },
    Highlight: { FillColor: new Color3(1, 0, 0), OutlineColor: new Color3(1, 1, 1), FillTransparency: 0.5, OutlineTransparency: 0, Adornee: undefined, Enabled: true, DepthMode: En('HighlightDepthMode','AlwaysOnTop') },
    Explosion: { BlastRadius: 4, BlastPressure: 500000, Position: v3(0, 0, 0), DestroyJointRadiusPercent: 1, Visible: true }, ForceField: { Visible: true },
    Atmosphere: { Density: 0.395, Color: new Color3(0.78, 0.78, 0.78), Decay: new Color3(0.36, 0.36, 0.36), Glare: 0, Haze: 0, Offset: 0 }, Sky: { SkyboxBk: '', SkyboxDn: '', SkyboxFt: '', SkyboxLf: '', SkyboxRt: '', SkyboxUp: '', StarCount: 3000, SunAngularSize: 21, MoonAngularSize: 11, CelestialBodiesShown: true },
    Decal: { Texture: '', Color3: new Color3(1, 1, 1), Transparency: 0, Face: En('NormalId','Front'), ZIndex: 1 }, Texture: { Texture: '', Color3: new Color3(1, 1, 1), Transparency: 0, StudsPerTileU: 2, StudsPerTileV: 2, OffsetStudsU: 0, OffsetStudsV: 0, Face: En('NormalId','Front') },
    SpecialMesh: { MeshId: '', TextureId: '', Scale: v3(1, 1, 1), Offset: v3(0, 0, 0), MeshType: En('MeshType','Brick'), VertexColor: v3(1, 1, 1) }, BlockMesh: { Scale: v3(1, 1, 1), Offset: v3(0, 0, 0) }, CylinderMesh: { Scale: v3(1, 1, 1), Offset: v3(0, 0, 0) },
    ColorCorrectionEffect: { Brightness: 0, Contrast: 0, Saturation: 0, TintColor: new Color3(1, 1, 1), Enabled: true }, BloomEffect: { Intensity: 0.4, Size: 24, Threshold: 0.95, Enabled: true }, BlurEffect: { Size: 24, Enabled: true }, SunRaysEffect: { Intensity: 0.25, Spread: 1, Enabled: true }, DepthOfFieldEffect: { FarIntensity: 0.75, FocusDistance: 0.05, InFocusRadius: 10, NearIntensity: 0.75, Enabled: true },
    ParticleEmitter: { Enabled: true, Rate: 20, Lifetime: new D.NumberRange(5, 10), Speed: new D.NumberRange(5, 5), Color: undefined, Size: undefined, Texture: '', Transparency: undefined, SpreadAngle: new Vector2(0, 0), Acceleration: v3(0, 0, 0), Rotation: new D.NumberRange(0, 0), RotSpeed: new D.NumberRange(0, 0), LightEmission: 0, EmissionDirection: En('NormalId','Top'), Drag: 0, ZOffset: 0, Orientation: En('ParticleOrientation','FacingCamera'), LockedToPart: false, TimeScale: 1, Shape: En('ParticleEmitterShape','Box') },
    Beam: { Attachment0: undefined, Attachment1: undefined, Color: undefined, Width0: 1, Width1: 1, Enabled: true, Transparency: undefined, FaceCamera: false, Segments: 10, LightEmission: 0 }, Trail: { Attachment0: undefined, Attachment1: undefined, Lifetime: 2, Color: undefined, Transparency: undefined, Enabled: true, LightEmission: 0, MinLength: 0.1 },
    Fire: { Color: new Color3(1, 0, 0), SecondaryColor: new Color3(1, 0.5, 0), Heat: 9, Size: 5, Enabled: true }, Smoke: { Color: new Color3(1, 1, 1), Opacity: 0.5, RiseVelocity: 1, Size: 1, Enabled: true }, Sparkles: { SparkleColor: new Color3(1, 1, 1), Enabled: true },
    Accessory: { AccessoryType: En('AccessoryType','Unknown'), AttachmentPoint: new CFrame(0, 0, 0) }, Team: { TeamColor: undefined, AutoAssignable: true }, Dialog: { InitialPrompt: '' }, DialogChoice: { UserDialog: '', ResponseDialog: '' },
    Shirt: { ShirtTemplate: '' }, Pants: { PantsTemplate: '' }, ShirtGraphic: { Graphic: '' },
  };
  return m[cn] || {};
}
defClass('Accessory', 'Instance', { props: { AccessoryType: En('AccessoryType','Unknown'), AttachmentPoint: new CFrame(0, 0, 0) } }); // overrides earlier simple generic
const lightProps = { Brightness: 1, Color: new Color3(1, 1, 1), Enabled: true, Shadows: false };
defClass('Light', 'Instance', { noCreate: true, props: lightProps });
defClass('PointLight', 'Light', { props: { Range: 8 } });
defClass('SpotLight', 'Light', { props: { Range: 16, Angle: 90, Face: En('NormalId','Front') } });
defClass('SurfaceLight', 'Light', { props: { Range: 16, Angle: 90, Face: En('NormalId','Front') } });
defClass('Sound', 'Instance', { props: { SoundId: '', Volume: 0.5, PlaybackSpeed: 1, Playing: false, Looped: false, TimePosition: 0, TimeLength: P(undefined, { get: () => 0, ro: true }), IsPlaying: P(undefined, { get: (i) => i.props.Playing, ro: true }), IsPaused: P(false), RollOffMaxDistance: 10000, RollOffMinDistance: 10, RollOffMode: En('RollOffMode','Inverse'), PlayOnRemove: false, SoundGroup: undefined, IsLoaded: P(undefined, { get: () => true, ro: true }) },
  events: ['Ended', 'Played', 'Paused', 'Resumed', 'Stopped', 'Loaded'],
  methods: { Play(self) { self.setProp('Playing', true); self.fireSignal('Played'); if (ENV.audio) ENV.audio.play(self); return E; }, Stop(self) { self.setProp('Playing', false); self.fireSignal('Stopped'); return E; }, Pause(self) { self.setProp('Playing', false); self.fireSignal('Paused'); return E; }, Resume(self) { self.setProp('Playing', true); self.fireSignal('Resumed'); return E; } } });
defClass('SoundGroup', 'Instance', { props: { Volume: 1 } });
defClass('Animation', 'Instance', { props: { AnimationId: '' } });
defClass('AnimationTrack', 'Instance', { noCreate: true, props: { Animation: undefined, Length: 1, Looped: false, Priority: En('AnimationPriority','Core'), Speed: 1, TimePosition: 0, WeightCurrent: 1, WeightTarget: 1, IsPlaying: P(false) }, events: ['Stopped', 'Ended', 'KeyframeReached', 'DidLoop'], methods: {
  Play(self) { self.setProp('IsPlaying', true); return E; },
  Stop(self) { if (self.props.IsPlaying) { self.setProp('IsPlaying', false); self.fireSignal('Stopped'); self.fireSignal('Ended'); } return E; },
  AdjustSpeed(self, s) { self.setProp('Speed', s); return E; }, AdjustWeight() { return E; }, GetMarkerReachedSignal(self) { return self.signal('Marker'); }, GetTimeOfKeyframe() { return 0; },
} });
defClass('Animator', 'Instance', { methods: { LoadAnimation(self, anim) { const t = newInstance('AnimationTrack'); t.props.Animation = anim; return t; }, GetPlayingAnimationTracks() { return new LuaTable(); } } });
defClass('Tool', 'Instance', { props: { CanBeDropped: true, Enabled: true, Grip: new CFrame(0, 0, 0), ManualActivationOnly: false, RequiresHandle: true, ToolTip: '', TextureId: '' }, events: ['Activated', 'Deactivated', 'Equipped', 'Unequipped'], methods: { Activate(self) { self.fireSignal('Activated'); return E; } } });
defClass('Backpack', 'Instance');
defClass('StarterGear', 'Instance');

/* ---------------- ClickDetector / ProximityPrompt ---------------- */
defClass('ClickDetector', 'Instance', { props: { MaxActivationDistance: 32, CursorIcon: '' }, events: ['MouseClick', 'RightMouseClick', 'MouseHoverEnter', 'MouseHoverLeave'] });
defClass('ProximityPrompt', 'Instance', { props: { ActionText: 'Interact', ObjectText: '', HoldDuration: 0, KeyboardKeyCode: En('KeyCode','E'), GamepadKeyCode: En('KeyCode','ButtonX'), MaxActivationDistance: 10, Enabled: true, RequiresLineOfSight: true, Exclusivity: En('ProximityPromptExclusivity','OnePerButton'), ClickablePrompt: true, UIOffset: new Vector2(0, 0), Style: En('ProximityPromptStyle','Default'), AutoLocalize: true, RootLocalizationTable: undefined },
  events: ['Triggered', 'TriggerEnded', 'PromptShown', 'PromptHidden', 'PromptButtonHoldBegan', 'PromptButtonHoldEnded'] });
defMethods('ProximityPrompt', { InputHoldBegin(self) { if (!self.props.Enabled) return E; self.fireSignal('Triggered', ENV.localPlayer); return E; }, InputHoldEnd(self) { self.fireSignal('TriggerEnded', ENV.localPlayer); return E; } });
defMethods('ParticleEmitter', { Emit(self, n) { if (ENV.fx) ENV.fx.emit(self, n === undefined ? 1 : n); return E; }, Clear() { return E; } });
defMethods('Explosion', {});

/* ---------------- Humanoid ---------------- */
defClass('Humanoid', 'Instance', { props: {
  Health: P(100, { set(i, v) {
    if (typeof v !== 'number') throw rtError('Unable to assign property Health. number expected, got ' + C.tnameForErr(v));
    const max = i.props.MaxHealth; v = Math.max(0, Math.min(max, v));
    if (v === i.props.Health) return;
    const wasAlive = i.props.Health > 0;
    i.setProp('Health', v);
    i.fireSignal('HealthChanged', v);
    if (v <= 0 && wasAlive) { i.fireSignal('Died'); i.state = 'Dead'; }
  } }),
  MaxHealth: P(100, { set(i, v) { i.setProp('MaxHealth', v); if (i.props.Health > v) i.lset('Health', v); } }),
  WalkSpeed: 16, JumpPower: 50, JumpHeight: 7.2, UseJumpPower: true, HipHeight: 2, AutoRotate: true, AutoJumpEnabled: true, PlatformStand: false, Sit: false, DisplayName: '',
  DisplayDistanceType: En('HumanoidDisplayDistanceType','Viewer'), HealthDisplayDistance: 100, NameDisplayDistance: 100, HealthDisplayType: En('HumanoidHealthDisplayType','DisplayWhenDamaged'), RigType: En('HumanoidRigType','R6'), BreakJointsOnDeath: true, RequiresNeck: true, NameOcclusion: En('NameOcclusion','OccludeAll'), CameraOffset: v3(0, 0, 0), MaxSlopeAngle: 89,
  Jump: P(false, { set(i, v) { i.setProp('Jump', v); if (v && ENV.character) ENV.character.jump(i); } }),
  MoveDirection: P(undefined, { get: (i) => i.moveDir || v3(0, 0, 0), ro: true }),
  RootPart: P(undefined, { get: (i) => (i.parent ? i.parent.findChild('HumanoidRootPart') : undefined), ro: true }),
  SeatPart: P(undefined, { get: () => undefined, ro: true }), FloorMaterial: P(undefined, { get: () => En('Material', 'Plastic'), ro: true }), TargetPoint: v3(0, 0, 0), WalkToPoint: v3(0, 0, 0), WalkToPart: undefined,
}, events: ['Died', 'HealthChanged', 'StateChanged', 'Running', 'Jumping', 'MoveToFinished', 'Seated', 'FreeFalling', 'Climbing', 'Swimming', 'Touched', 'FallingDown', 'GettingUp', 'PlatformStanding', 'Strafing', 'StateEnabledChanged'],
methods: {
  TakeDamage(self, n) { if (self.props.Health > 0) self.lset('Health', self.props.Health - n); return E; },
  MoveTo(self, pos, part) { self.moveTarget = pos; self.moveStart = ENV.rt.now; return E; },
  CancelMoveTo(self) { self.moveTarget = null; return E; },
  Move(self, dir, rel) { self.moveInput = dir; return E; },
  ChangeState(self, st) { self.state = st && st.name; return E; },
  GetState(self) { return En('HumanoidStateType', self.state || 'Running'); },
  SetStateEnabled() { return E; }, GetStateEnabled() { return true; },
  LoadAnimation(self) { return newInstance('AnimationTrack'); },
  GetPlayingAnimationTracks() { return new LuaTable(); },
  EquipTool(self, tool) { if (self.parent) tool.setParent(self.parent); return E; },
  UnequipTools() { return E; },
  AddAccessory() { return E; }, RemoveAccessories() { return E; }, GetAccessories() { return new LuaTable(); },
  ApplyDescription() { return E; }, GetAppliedDescription() { return undefined; }, BuildRigFromAttachments() { return E; },
  ReplaceBodyPartR15() { return false; },
} });

/* ---------------- Player ---------------- */
defClass('Player', 'Instance', { noCreate: true, props: {
  UserId: 0, DisplayName: '', Character: P(undefined, { set(i, v) { i.setProp('Character', v); } }), Team: undefined, Neutral: true, TeamColor: undefined, AccountAge: 365, MembershipType: En('MembershipType','None'), CharacterAppearanceId: 0, RespawnLocation: undefined,
  CameraMode: En('CameraMode','Classic'), CameraMaxZoomDistance: 128, CameraMinZoomDistance: 0.5, FollowUserId: 0, LocaleId: 'en-us', GameplayPaused: false, HealthDisplayDistance: 0, NameDisplayDistance: 0, Guest: false, HasVerifiedBadge: false, ReplicationFocus: undefined, AutoJumpEnabled: true, CanLoadCharacterAppearance: true, DevEnableMouseLock: true,
  DevComputerCameraMode: En('DevComputerCameraMovementMode','UserChoice'), DevTouchCameraMode: En('DevTouchCameraMovementMode','UserChoice'), DevComputerMovementMode: En('DevComputerMovementMode','UserChoice'), DevTouchMovementMode: En('DevTouchMovementMode','UserChoice'),
}, events: ['CharacterAdded', 'CharacterRemoving', 'Chatted', 'Idled', 'OnTeleport', 'CharacterAppearanceLoaded', 'FriendStatusChanged'],
methods: {
  LoadCharacter: function* (self) { ENV.character.load(self); return E; },
  LoadCharacterAsync: function* (self) { ENV.character.load(self); return E; },
  Kick(self, msg) { ENV.kick(self, msg); return E; },
  GetMouse(self) { return ENV.input ? ENV.input.mouse(self) : undefined; },
  IsFriendsWith(self, id) { return false; },
  IsFriendsWithAsync(self, id) { return false; },
  IsInGroup() { return false; }, GetRankInGroup() { return 0; }, GetRoleInGroup() { return 'Guest'; },
  GetJoinData() { return new LuaTable(); },
  DistanceFromCharacter(self, p) { const c = self.props.Character; const r = c && c.findChild('HumanoidRootPart'); if (!r) return 0; const q = r.props.CFrame; return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); },
  ClearCharacterAppearance() { return E; }, HasAppearanceLoaded() { return true; }, RequestStreamAroundAsync() { return E; },
  GetFriendsOnline() { return new LuaTable(); },
  SetAccountAge(self, n) { self.setProp('AccountAge', n); return E; },
  SetMembershipType(self, t) { self.setProp('MembershipType', t); return E; },
  Idled() { return E; },
} });

module.exports = { setCF, bboxOf };

};
defs["rbx/classes_gui.js"]=function(module,exports,require){'use strict';
// GUI class definitions (rendering is in gui.js)
const C = require('../lua2js/core');
const { LuaTable, rtError, E } = C;
const D = require('./datatypes');
const I = require('./instance');
const { ENV, defClass, defMethods, P } = I;
const { Vector2, Vector3, Color3, UDim, UDim2, CFrame } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);
const u2 = (a, b, c, d) => new UDim2(a, b, c, d);
const c3 = (r, g, b) => new Color3(r, g, b);
const ro = (f) => P(undefined, { get: f, ro: true });
const abs = (i) => i.abs || { x: 0, y: 0, w: 0, h: 0 };


defClass('GuiBase', 'Instance', { noCreate: true });
defClass('GuiBase2d', 'GuiBase', { noCreate: true, props: {
  AbsolutePosition: ro((i) => new Vector2(abs(i).x, abs(i).y)),
  AbsoluteSize: ro((i) => new Vector2(abs(i).w, abs(i).h)),
  AbsoluteRotation: ro((i) => i.props.Rotation || 0),
  AutoLocalize: true, Localize: true,
} });
defClass('LayerCollector', 'GuiBase2d', { noCreate: true, props: { Enabled: true, ResetOnSpawn: true, ZIndexBehavior: En('ZIndexBehavior', 'Sibling') } });
defClass('ScreenGui', 'LayerCollector', { props: { DisplayOrder: 0, IgnoreGuiInset: false, ScreenInsets: En('ScreenInsets', 'CoreUISafeInsets'), OnTopOfCoreBlur: false, SafeAreaCompatibility: En('SafeAreaCompatibility', 'FullscreenExtension'), ClipToDeviceSafeArea: true } });
defClass('SurfaceGui', 'LayerCollector', { props: { Adornee: undefined, Face: En('NormalId', 'Front'), CanvasSize: new Vector2(800, 600), PixelsPerStud: 50, AlwaysOnTop: false, LightInfluence: 1, SizingMode: En('SurfaceGuiSizingMode', 'PixelsPerStud'), ZOffset: 0, Brightness: 1 } });
defClass('BillboardGui', 'LayerCollector', { props: { Adornee: undefined, Size: u2(0, 100, 0, 100), StudsOffset: new Vector3(0, 0, 0), StudsOffsetWorldSpace: new Vector3(0, 0, 0), ExtentsOffset: new Vector3(0, 0, 0), SizeOffset: new Vector2(0, 0), AlwaysOnTop: false, MaxDistance: 3.4e38, LightInfluence: 1, Active: false, ClipsDescendants: false, PlayerToHideFrom: undefined, Brightness: 1 } });
defClass('GuiObject', 'GuiBase2d', { noCreate: true, props: {
  Position: u2(0, 0, 0, 0), Size: u2(0, 100, 0, 100), AnchorPoint: new Vector2(0, 0), Rotation: 0, Visible: true,
  BackgroundColor3: c3(0.639, 0.635, 0.647), BackgroundTransparency: 0, BorderSizePixel: 1, BorderColor3: c3(0.106, 0.165, 0.208), BorderMode: En('BorderMode', 'Outline'),
  ZIndex: 1, LayoutOrder: 0, ClipsDescendants: false, Active: false, Selectable: false, Interactable: true, SizeConstraint: En('SizeConstraint', 'RelativeXY'), AutomaticSize: En('AutomaticSize', 'None'),
  NextSelectionUp: undefined, NextSelectionDown: undefined, NextSelectionLeft: undefined, NextSelectionRight: undefined, SelectionOrder: 0, SelectionImageObject: undefined,
}, events: ['InputBegan', 'InputEnded', 'InputChanged', 'MouseEnter', 'MouseLeave', 'MouseMoved', 'MouseWheelForward', 'MouseWheelBackward', 'TouchTap', 'TouchLongPress', 'TouchPan', 'TouchPinch', 'TouchSwipe', 'SelectionGained', 'SelectionLost'],
methods: {
  TweenSize(self, size, dir, style, t, override, cb) { ENV.tweenProps(self, { Size: size }, t || 1, style, dir, cb); return true; },
  TweenPosition(self, pos, dir, style, t, override, cb) { ENV.tweenProps(self, { Position: pos }, t || 1, style, dir, cb); return true; },
  TweenSizeAndPosition(self, size, pos, dir, style, t, override, cb) { ENV.tweenProps(self, { Size: size, Position: pos }, t || 1, style, dir, cb); return true; },
} });
defClass('Frame', 'GuiObject', { props: { Style: En('FrameStyle', 'Custom') } });
defClass('CanvasGroup', 'Frame', { props: { GroupTransparency: 0, GroupColor3: c3(1, 1, 1) } });
const textProps = {
  Text: '', TextColor3: c3(0.106, 0.106, 0.106), TextSize: 14, Font: En('Font', 'SourceSans'), FontFace: undefined, TextXAlignment: En('TextXAlignment', 'Center'), TextYAlignment: En('TextYAlignment', 'Center'),
  TextWrapped: false, TextScaled: false, TextTransparency: 0, TextStrokeColor3: c3(0, 0, 0), TextStrokeTransparency: 1, RichText: false, LineHeight: 1, TextTruncate: En('TextTruncate', 'None'), MaxVisibleGraphemes: -1, TextDirection: En('TextDirection', 'Auto'),
  TextBounds: P(undefined, { get: (i) => { const a = i.abs; const m = ENV.layout.measure(i, a ? a.w : 0); return new Vector2(Math.ceil(m.w), Math.ceil(m.h)); }, ro: true }),
  TextFits: P(undefined, { get: () => true, ro: true }), ContentText: P(undefined, { get: (i) => i.props.Text, ro: true }),
};
defClass('TextLabel', 'GuiObject', { props: Object.assign({}, textProps, { Text: 'Label' }) });
defClass('GuiButton', 'GuiObject', { noCreate: true, props: { Active: true, AutoButtonColor: true, Modal: false, Style: En('ButtonStyle', 'Custom'), Selected: false }, events: ['Activated', 'MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up', 'MouseButton2Click', 'MouseButton2Down', 'MouseButton2Up'] });
defClass('TextButton', 'GuiButton', { props: Object.assign({}, textProps, { Text: 'Button' }) });
defClass('TextBox', 'GuiObject', { props: Object.assign({}, textProps, { Text: '', PlaceholderText: '', PlaceholderColor3: c3(0.7, 0.7, 0.7), ClearTextOnFocus: true, MultiLine: false, TextEditable: true, ShowNativeInput: true, CursorPosition: 1, SelectionStart: -1 }),
  events: ['FocusLost', 'Focused', 'ReturnPressed'],
  methods: { CaptureFocus(self) { if (ENV.gui) ENV.gui.focus(self); return E; }, ReleaseFocus(self) { if (ENV.gui) ENV.gui.blur(self); return E; }, IsFocused(self) { return !!(ENV.gui && ENV.gui.focused === self); } } });
const imgProps = { Image: '', ImageColor3: c3(1, 1, 1), ImageTransparency: 0, ScaleType: En('ScaleType', 'Stretch'), SliceCenter: new D.Rect(0, 0, 0, 0), SliceScale: 1, ImageRectOffset: new Vector2(0, 0), ImageRectSize: new Vector2(0, 0), ResampleMode: En('ResamplerMode', 'Default'), TileSize: u2(1, 0, 1, 0), IsLoaded: P(undefined, { get: () => true, ro: true }) };
defClass('ImageLabel', 'GuiObject', { props: imgProps });
defClass('ImageButton', 'GuiButton', { props: Object.assign({}, imgProps, { HoverImage: '', PressedImage: '' }) });
defClass('ViewportFrame', 'GuiObject', { props: { CurrentCamera: undefined, Ambient: c3(0.8, 0.8, 0.8), LightColor: c3(1, 1, 1), LightDirection: new Vector3(-1, -1, -1), ImageColor3: c3(1, 1, 1), ImageTransparency: 0 } });
defClass('VideoFrame', 'GuiObject', { props: { Video: '', Playing: false, Looped: false, Volume: 1 } });
defClass('ScrollingFrame', 'GuiObject', { props: {
  CanvasSize: u2(0, 0, 2, 0), CanvasPosition: new Vector2(0, 0), ScrollBarThickness: 12, ScrollingEnabled: true, ScrollBarImageColor3: c3(0, 0, 0), ScrollBarImageTransparency: 0,
  AutomaticCanvasSize: En('AutomaticSize', 'None'), ScrollingDirection: En('ScrollingDirection', 'XY'), VerticalScrollBarInset: En('ScrollBarInset', 'None'), HorizontalScrollBarInset: En('ScrollBarInset', 'None'),
  VerticalScrollBarPosition: En('VerticalScrollBarPosition', 'Right'), ElasticBehavior: En('ElasticBehavior', 'WhenScrollable'), TopImage: '', MidImage: '', BottomImage: '', ScrollBarImageColor: undefined,
  AbsoluteCanvasSize: P(undefined, { get: (i) => new Vector2(i.canvasW || 0, i.canvasH || 0), ro: true }), AbsoluteWindowSize: P(undefined, { get: (i) => new Vector2(abs(i).w, abs(i).h), ro: true }),
}, methods: { ScrollToTop(self) { self.lset('CanvasPosition', new Vector2(self.props.CanvasPosition.x, 0)); return E; }, ScrollToBottom(self) { self.lset('CanvasPosition', new Vector2(self.props.CanvasPosition.x, 1e9)); return E; } } });
defClass('UIBase', 'Instance', { noCreate: true });
defClass('UIComponent', 'UIBase', { noCreate: true });
defClass('UILayout', 'UIComponent', { noCreate: true, props: { HorizontalAlignment: En('HorizontalAlignment', 'Left'), VerticalAlignment: En('VerticalAlignment', 'Top'), SortOrder: En('SortOrder', 'LayoutOrder'), FillDirection: En('FillDirection', 'Vertical'), AbsoluteContentSize: P(undefined, { get: (i) => new Vector2(i.contentW || 0, i.contentH || 0), ro: true }) } });
defClass('UIListLayout', 'UILayout', { props: { Padding: new UDim(0, 0), Wraps: false, ItemLineAlignment: En('ItemLineAlignment', 'Automatic') } });
defClass('UIGridStyleLayout', 'UILayout', { noCreate: true });
defClass('UIGridLayout', 'UIGridStyleLayout', { props: { FillDirection: En('FillDirection', 'Horizontal'), CellPadding: u2(0, 5, 0, 5), CellSize: u2(0, 100, 0, 100), FillDirectionMaxCells: 0, StartCorner: En('StartCorner', 'TopLeft'), AbsoluteCellCount: P(undefined, { get: (i) => new Vector2(i.cellsX || 0, i.cellsY || 0), ro: true }), AbsoluteCellSize: P(undefined, { get: (i) => new Vector2(i.cellW || 0, i.cellH || 0), ro: true }) } });
defClass('UIPadding', 'UIComponent', { props: { PaddingTop: new UDim(0, 0), PaddingBottom: new UDim(0, 0), PaddingLeft: new UDim(0, 0), PaddingRight: new UDim(0, 0) } });
defClass('UICorner', 'UIComponent', { props: { CornerRadius: new UDim(0, 8) } });
defClass('UIStroke', 'UIComponent', { props: { Color: c3(0, 0, 0), Thickness: 1, Transparency: 0, Enabled: true, ApplyStrokeMode: En('ApplyStrokeMode', 'Contextual'), LineJoinMode: En('LineJoinMode', 'Round') } });
defClass('UIGradient', 'UIComponent', { props: { Color: undefined, Transparency: undefined, Rotation: 0, Offset: new Vector2(0, 0), Enabled: true } });
defClass('UIScale', 'UIComponent', { props: { Scale: 1 } });
defClass('UIAspectRatioConstraint', 'UIComponent', { props: { AspectRatio: 1, AspectType: En('AspectType', 'FitWithinMaxSize'), DominantAxis: En('DominantAxis', 'Width') } });
defClass('UISizeConstraint', 'UIComponent', { props: { MinSize: new Vector2(0, 0), MaxSize: new Vector2(Infinity, Infinity) } });
defClass('UITextSizeConstraint', 'UIComponent', { props: { MinTextSize: 1, MaxTextSize: 100 } });
defClass('UIFlexItem', 'UIComponent', { props: { FlexMode: En('UIFlexMode', 'None') } });
defClass('UIPageLayout', 'UIGridStyleLayout', { props: { Animated: true, Circular: false, EasingDirection: En('EasingDirection', 'Out'), EasingStyle: En('EasingStyle', 'Quad'), GamepadInputEnabled: true, Padding: new UDim(0, 0), ScrollWheelInputEnabled: true, TouchInputEnabled: true, TweenTime: 1 } });
defClass('UITableLayout', 'UIGridStyleLayout', { props: { FillEmptySpaceColumns: false, FillEmptySpaceRows: false, Padding: u2(0, 0, 0, 0) } });
module.exports = {};

};
defs["rbx/net.js"]=function(module,exports,require){'use strict';
// Server <-> client message passing (RemoteEvent / RemoteFunction / BindableEvent) with an async queue.
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, E, CO, SCHED, Coroutine } = C;
const I = require('./instance');
const { ENV } = I;

const net = {
  latency: 0.04, // seconds of simulated network delay
  stats: { fireServer: 0, fireClient: 0, invokeServer: 0, invokeClient: 0 },
};
ENV.net = net;

function copyValue(v, seen, depth) {
  if (v === undefined || v === null) return undefined;
  const t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (t === 'function') throw rtError('Attempted to send an unsupported value: function. Functions cannot be sent through remotes');
  if (v instanceof LuaTable) {
    if (depth > 100) throw rtError('table too deep to send through remote');
    if (seen.has(v)) return seen.get(v);
    const out = new LuaTable(); seen.set(v, out);
    for (let k = v.next(undefined); k; k = v.next(k[0])) {
      const key = k[0];
      if (typeof key !== 'number' && typeof key !== 'string') continue; // Roblox rejects other key types
      const val = copyValue(k[1], seen, depth + 1);
      if (val !== undefined) out.set(key, val);
    }
    return out;
  }
  if (v instanceof I.Instance) return v.destroyed ? undefined : v;
  if (v instanceof Userdata) {
    if (v instanceof I.Signal || v instanceof I.Connection) throw rtError('Attempted to send an unsupported value: ' + v.tname);
    return v; // Vector3, CFrame, Color3, Enum... are immutable value types
  }
  if (v instanceof Coroutine) throw rtError('Attempted to send an unsupported value: thread');
  return v;
}
function copyArgs(args) {
  const seen = new Map();
  return args.map((a) => copyValue(a, seen, 0));
}
net.copyArgs = copyArgs;

// schedule fn after latency (ordering preserved by the scheduler's sequence numbers)
function later(fn, ctx) {
  const co = new Coroutine(function* () { fn(); return E; }, ctx || null);
  ENV.rt.sleep(co, net.latency, []);
}
net.later = later;

function needCtx(want, what) {
  const cur = CO.current ? CO.current.ctx : null;
  if (cur && cur.name !== want) throw rtError(`${what} can only be called from ${want === 'server' ? 'a server Script' : 'a LocalScript'}`);
}

net.fireServer = (remote, args) => {
  needCtx('client', 'FireServer');
  net.stats.fireServer++;
  const player = ENV.localPlayer;
  const a = copyArgs(args);
  later(() => { remote.fireSignal('OnServerEvent', player, ...a); });
};
net.fireClient = (remote, player, args) => {
  needCtx('server', 'FireClient');
  if (!(player instanceof I.Instance) || !player.isA('Player')) throw rtError('FireClient: Player expected, got ' + C.tnameForErr(player));
  net.stats.fireClient++;
  const a = copyArgs(args);
  later(() => { if (player === ENV.localPlayer) remote.fireSignal('OnClientEvent', ...a); });
};
net.fireAllClients = (remote, args) => {
  needCtx('server', 'FireAllClients');
  net.stats.fireClient++;
  const a = copyArgs(args);
  later(() => { if (ENV.localPlayer) remote.fireSignal('OnClientEvent', ...a); });
};

function runHandler(handler, hargs, ctx, done) {
  const co = new Coroutine(function* () {
    try {
      const r = yield* C.toCallable(handler)(...hargs);
      done([true, ...(r instanceof Array ? r : [r])]);
    } catch (e) {
      done([false, C.errValue(e)]);
    }
    return E;
  }, ctx);
  ENV.rt.resumeThread(co, []);
}
function* invoke(remote, handlerProp, ctx, hargs, what) {
  const caller = CO.current;
  let res = null, waiting = false;
  const sendBack = (r) => {
    later(() => {
      res = r;
      if (waiting) ENV.rt.defer(caller, [r]);
    }, caller.ctx);
  };
  later(() => {
    const h = remote.props[handlerProp];
    if (!h) return sendBack([false, `${what}: ${handlerProp} callback not set (the remote ${remote.fullName()} has no handler)`]);
    runHandler(h, hargs, ctx, sendBack);
  }, ctx);
  if (res === null) {
    waiting = true;
    const r = yield SCHED;
    res = r instanceof Array && r.length === 1 && r[0] instanceof Array ? r[0] : r;
  }
  if (!res[0]) throw new C.LuaError(res[1]);
  return copyArgs(res.slice(1)).length <= 1 ? copyArgs(res.slice(1))[0] : copyArgs(res.slice(1));
}
net.invokeServer = function* (remote, args) {
  needCtx('client', 'InvokeServer');
  net.stats.invokeServer++;
  const player = ENV.localPlayer;
  return yield* invoke(remote, 'OnServerInvoke', ENV.contexts.server, [player, ...copyArgs(args)], 'InvokeServer');
};
net.invokeClient = function* (remote, player, args) {
  needCtx('server', 'InvokeClient');
  net.stats.invokeClient++;
  return yield* invoke(remote, 'OnClientInvoke', ENV.contexts.client, copyArgs(args), 'InvokeClient');
};
module.exports = net;

};
defs["rbx/players.js"]=function(module,exports,require){'use strict';
// Players, Player, Character (R6 blocky rig), PlayerGui/Backpack/PlayerScripts, Mouse
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED, Coroutine } = C;
const { nat } = require('../lua2js/runtime');
const D = require('./datatypes');
const I = require('./instance');
const S = require('./services');
const { ENV, Signal, Instance, defClass, defMethods, P, newInstance, noteUnsupported, CLASSES } = I;
const { Vector3, CFrame, Color3, v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);

function extend(cn, spec) {
  const c = CLASSES.get(cn);
  for (const [k, v] of Object.entries(spec.props || {})) c.props.set(k, v && v.$p ? v : { def: v });
  for (const e of spec.events || []) c.events.add(e);
  for (const [k, f] of Object.entries(spec.methods || {})) c.methods.set(k, f.constructor && f.constructor.name === 'GeneratorFunction' ? f : nat(f, k));
  c._pc.clear(); c._mc.clear(); c._ec.clear();
}
// subclass caches must be cleared too (Players has no subclasses)

extend('Players', {
  props: { CharacterAutoLoads: true, RespawnTime: 5, MaxPlayers: 50, PreferredPlayers: 12, BubbleChat: false, ClassicChat: false, LocalPlayer: P(undefined, { get: () => { const c = CO.current ? CO.current.ctx : null; if (c && c.name === 'server') return undefined; return ENV.localPlayer; }, ro: true }), NumPlayers: P(undefined, { get: (i) => i.children.filter((c) => c.isA('Player')).length, ro: true }) },
  events: ['PlayerAdded', 'PlayerRemoving', 'PlayerMembershipChanged', 'UserSubscriptionStatusChanged', 'PlayerChatted'],
  methods: {
    GetPlayers(self) { return new LuaTable(self.children.filter((c) => c.isA('Player'))); },
    GetPlayerFromCharacter(self, ch) { return self.children.find((p) => p.isA('Player') && p.props.Character === ch); },
    GetPlayerByUserId(self, id) { return self.children.find((p) => p.isA('Player') && p.props.UserId === id); },
    GetUserIdFromNameAsync: function* (self, name) { yield* S.netYield(); let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 1000 + (h % 90000000); },
    GetNameFromUserIdAsync: function* (self, id) { yield* S.netYield(); const p = self.children.find((c) => c.isA('Player') && c.props.UserId === id); return p ? p.props.Name : 'Player' + id; },
    GetHumanoidDescriptionFromUserId() { return newInstance('HumanoidDescription'); },
    GetCharacterAppearanceInfoAsync: function* () { return new LuaTable(); },
    CreateLocalPlayer() { return undefined; },
    Chat() { return E; }, SetChatStyle() { return E; },
  },
});

/* ------------------------------------------------------------------ Mouse */
defClass('PlayerMouse', 'Instance', { noCreate: true, props: {
  Hit: new CFrame(0, 0, 0), Target: undefined, X: 0, Y: 0, ViewSizeX: 1280, ViewSizeY: 720, Icon: '', TargetFilter: undefined, TargetSurface: En('NormalId', 'Top'), Origin: new CFrame(0, 0, 0), UnitRay: undefined,
}, events: ['Button1Down', 'Button1Up', 'Button2Down', 'Button2Up', 'Move', 'Idle', 'WheelForward', 'WheelBackward', 'KeyDown', 'KeyUp'] });
ENV.mouse = null;

/* ------------------------------------------------------------------ Player creation */
let nextUserId = 7000001;
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];
ENV.players = [];
ENV.localPlayer = null;
ENV.addPlayer = function (name, opts) {
  opts = opts || {};
  const playersSvc = ENV.getService('Players');
  const pl = new Instance(CLASSES.get('Player'));
  pl.props.Name = name || 'Player1'; pl.props.DisplayName = opts.displayName || pl.props.Name;
  pl.props.UserId = opts.userId || nextUserId++;
  pl.props.AccountAge = opts.accountAge === undefined ? 365 : opts.accountAge;
  pl.props.MembershipType = En('MembershipType', opts.premium ? 'Premium' : 'None');
  pl.shirt = SHIRTS[(pl.props.UserId) % SHIRTS.length];
  pl.isLocal = !!opts.isLocal;
  pl.setParent(playersSvc);
  newInstance('PlayerGui', pl, true).props.Name = 'PlayerGui';
  newInstance('Backpack', pl, true).props.Name = 'Backpack';
  newInstance('PlayerScripts', pl, true).props.Name = 'PlayerScripts';
  newInstance('StarterGear', pl, true).props.Name = 'StarterGear';
  ENV.players.push(pl);
  if (pl.isLocal) ENV.localPlayer = pl;
  // PlayerAdded (server) -> then client replication -> then character
  playersSvc.fireSignal('PlayerAdded', pl);
  ENV.rt.defer(new Coroutine(function* () {
    if (pl.isLocal) clientInit(pl);
    if (playersSvc.props.CharacterAutoLoads && !pl.destroyed && !pl.props.Character) ENV.character.load(pl);
    return E;
  }, null), []);
  return pl;
};
function clientInit(pl) {
  // replicate StarterPlayerScripts and StarterGui for the local player
  const sps = ENV.svc('StarterPlayer').findChild('StarterPlayerScripts');
  const ps = pl.findChild('PlayerScripts');
  if (sps) for (const c of sps.children.slice()) { const k = c.clone(); if (k) k.setParent(ps); }
  cloneStarterGui(pl, false);
  // ReplicatedFirst LocalScripts are started by the loader
}
function cloneStarterGui(pl, onRespawn) {
  const sg = ENV.svc('StarterGui'); const pg = pl.findChild('PlayerGui');
  if (!sg || !pg) return;
  if (onRespawn) {
    if (!sg.props.ResetPlayerGuiOnSpawn) return;
    for (const c of pg.children.slice()) if (c.isA('ScreenGui') && c.props.ResetOnSpawn) c.destroy();
  }
  for (const c of sg.children.slice()) {
    if (onRespawn && c.isA('ScreenGui') && !c.props.ResetOnSpawn) continue;
    const k = c.clone(); if (k) k.setParent(pg);
  }
}
ENV.kick = (pl, msg) => { ENV.warn(`Player ${pl.props.Name} was kicked: ${msg || ''}`); if (ENV.onKick) ENV.onKick(pl, msg); ENV.removePlayer(pl); };
ENV.removePlayer = function (pl) {
  if (pl.destroyed) return;
  const playersSvc = ENV.getService('Players');
  const ch = pl.props.Character;
  if (ch) { pl.fireSignal('CharacterRemoving', ch); }
  playersSvc.fireSignal('PlayerRemoving', pl);
  if (ch) ch.destroy();
  pl.setParent(null); pl.destroy();
  ENV.players = ENV.players.filter((p) => p !== pl);
  if (ENV.localPlayer === pl) ENV.localPlayer = null;
};
ENV.setPremium = (pl, on) => { pl.setProp('MembershipType', En('MembershipType', on ? 'Premium' : 'None')); ENV.getService('Players').fireSignal('PlayerMembershipChanged', pl); };

/* ------------------------------------------------------------------ Characters */
function mkPart(name, size, offset, color, parent, extra) {
  const p = newInstance('Part'); p.props.Name = name; p.props.Size = size; p.props.Color = color; p.props.Anchored = false; p.props.CanCollide = name !== 'HumanoidRootPart'; p.props.CFrame = new CFrame(offset.x, offset.y, offset.z);
  p.props.TopSurface = En('SurfaceType', 'Smooth'); p.props.BottomSurface = En('SurfaceType', 'Smooth');
  if (extra) Object.assign(p.props, extra);
  p.props.CanTouch = true; p.setParent(parent); return p;
}
const col = (h) => { const n = parseInt(h.slice(1), 16); return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
ENV.buildRig = function (name, shirt, skin) {
  const m = newInstance('Model'); m.props.Name = name;
  const sk = col(skin || '#f5cd30'), sh = col(shirt || '#3498db'), pants = col('#2c3e50');
  const hrp = mkPart('HumanoidRootPart', v3(2, 2, 1), v3(0, 0, 0), sh, m, { Transparency: 1 });
  mkPart('Torso', v3(2, 2, 1), v3(0, 0, 0), sh, m);
  mkPart('Head', v3(2, 1, 1), v3(0, 1.5, 0), sk, m);
  mkPart('Left Arm', v3(1, 2, 1), v3(-1.5, 0, 0), sk, m); mkPart('Right Arm', v3(1, 2, 1), v3(1.5, 0, 0), sk, m);
  mkPart('Left Leg', v3(1, 2, 1), v3(-0.5, -2, 0), pants, m); mkPart('Right Leg', v3(1, 2, 1), v3(0.5, -2, 0), pants, m);
  const h = newInstance('Humanoid'); h.props.HipHeight = 0; h.props.RigType = En('HumanoidRigType', 'R6'); h.setParent(m);
  m.props.PrimaryPart = hrp;
  return m;
};
ENV.character = {
  load(pl) {
    const players = ENV.getService('Players');
    const old = pl.props.Character;
    if (old) { pl.fireSignal('CharacterRemoving', old); pl.props.Character = undefined; old.destroy(); }
    const rig = ENV.buildRig(pl.props.Name, pl.shirt);
    const hum = rig.findChild('Humanoid');
    const sp = ENV.svc('StarterPlayer');
    hum.props.WalkSpeed = sp.props.CharacterWalkSpeed; hum.props.JumpPower = sp.props.CharacterJumpPower; hum.props.JumpHeight = sp.props.CharacterJumpHeight;
    hum.props.MaxHealth = sp.props.CharacterMaxHealth; hum.props.Health = sp.props.CharacterMaxHealth; hum.props.DisplayName = pl.props.DisplayName;
    // spawn position
    let at = v3(0, 5, 0);
    const spawns = [];
    for (const d of ENV.workspace.descendants()) if (d.className === 'SpawnLocation' && d.props.Enabled) spawns.push(d);
    if (spawns.length) {
      const pick = pl.props.RespawnLocation && !pl.props.RespawnLocation.destroyed ? pl.props.RespawnLocation : spawns[Math.floor(ENV.rt.rand() * spawns.length)];
      const c = pick.props.CFrame, s = pick.props.Size; at = v3(c.x, c.y + s.y / 2 + 3, c.z);
    }
    rig.lset('PrimaryPart', rig.findChild('HumanoidRootPart'));
    rig.cls.methods.get('MoveTo').$n(rig, at);
    pl.props.Character = rig; pl.changed('Character');
    // StarterCharacterScripts
    const scs = sp.findChild('StarterCharacterScripts');
    if (scs) for (const c of scs.children.slice()) { const k = c.clone(); if (k) k.setParent(rig); }
    rig.setParent(ENV.workspace);
    // backpack
    const bp = pl.findChild('Backpack'); if (bp) { for (const c of bp.children.slice()) c.destroy(); for (const t of ENV.svc('StarterPack').children) { const k = t.clone(); if (k) k.setParent(bp); } }
    if (old && pl.isLocal) cloneStarterGui(pl, true);
    hum.signal('Died').connect(nat(() => {
      if (!players.props.CharacterAutoLoads) return E;
      const co = new Coroutine(function* () { if (!pl.destroyed && pl.props.Character === rig) ENV.character.load(pl); return E; }, null);
      ENV.rt.sleep(co, players.props.RespawnTime, []);
      return E;
    }, 'respawn'), false);
    pl.fireSignal('CharacterAdded', rig);
    if (ENV.onCharacter) ENV.onCharacter(pl, rig);
    return rig;
  },
  jump(hum) { if (ENV.physics) ENV.physics.jump(hum); },
};
module.exports = { extend, cloneStarterGui };

};
defs["rbx/physics.js"]=function(module,exports,require){'use strict';
// Headless physics/world: part registry, spatial grid, raycasts, overlaps, humanoid controller, simple rigid bodies, Touched.
const C = require('../lua2js/core');
const { LuaTable, E, rtError } = C;
const D = require('./datatypes');
const I = require('./instance');
const S = require('./services');
const CL = require('./classes');
const { ENV, Instance, CLASSES } = I;
const { Vector3, CFrame, v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);

const CELL = 16, BIG = 96;
const world = ENV.physics = {
  parts: new Map(),     // inst -> rec
  grid: new Map(),      // cell key -> Set(rec)   (anchored parts)
  big: new Set(),       // large anchored parts
  dyn: new Set(),       // unanchored parts (recs)
  humanoids: new Set(), // humanoid instances with controllers
  touching: new Map(),  // moving part inst -> Map(other inst -> true)
  time: 0, dirty: new Set(), asmDirty: true, followers: [],
};
const gravity = () => (ENV.workspace && ENV.workspace.props.Gravity) || 196.2;

/* ------------------------------------------------ records */
function mkRec(p) { return { inst: p, c: [0, 0, 0], r: [1, 0, 0, 0, 1, 0, 0, 0, 1], h: [1, 1, 1], box: [0, 0, 0, 0, 0, 0], shape: 0, anch: true, cells: null, big: false, vel: [0, 0, 0], sleep: 0, grounded: false, kin: false, dirty: true }; }
function refresh(rec) {
  const p = rec.inst; const cf = p.props.CFrame, s = p.props.Size;
  rec.c[0] = cf.x; rec.c[1] = cf.y; rec.c[2] = cf.z;
  for (let i = 0; i < 9; i++) rec.r[i] = cf.r[i];
  rec.h[0] = s.x / 2; rec.h[1] = s.y / 2; rec.h[2] = s.z / 2;
  const r = rec.r, h = rec.h;
  const ex = Math.abs(r[0]) * h[0] + Math.abs(r[1]) * h[1] + Math.abs(r[2]) * h[2];
  const ey = Math.abs(r[3]) * h[0] + Math.abs(r[4]) * h[1] + Math.abs(r[5]) * h[2];
  const ez = Math.abs(r[6]) * h[0] + Math.abs(r[7]) * h[1] + Math.abs(r[8]) * h[2];
  rec.box = [rec.c[0] - ex, rec.c[1] - ey, rec.c[2] - ez, rec.c[0] + ex, rec.c[1] + ey, rec.c[2] + ez];
  const sh = p.props.Shape; rec.shape = sh && sh.name === 'Ball' ? 1 : 0;
  rec.dirty = false;
}
function cellRange(b) { return [Math.floor(b[0] / CELL), Math.floor(b[1] / CELL), Math.floor(b[2] / CELL), Math.floor(b[3] / CELL), Math.floor(b[4] / CELL), Math.floor(b[5] / CELL)]; }
const ck = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
function gridRemove(rec) {
  if (rec.big) { world.big.delete(rec); rec.big = false; }
  if (rec.cells) { for (const key of rec.cells) { const s = world.grid.get(key); if (s) { s.delete(rec); if (!s.size) world.grid.delete(key); } } rec.cells = null; }
}
function gridInsert(rec) {
  const b = rec.box;
  if (b[3] - b[0] > BIG || b[4] - b[1] > BIG || b[5] - b[2] > BIG) { rec.big = true; world.big.add(rec); return; }
  const [x0, y0, z0, x1, y1, z1] = cellRange(b);
  rec.cells = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const key = ck(x, y, z); let s = world.grid.get(key); if (!s) world.grid.set(key, s = new Set()); s.add(rec); rec.cells.push(key);
  }
}
function place(rec) {
  gridRemove(rec); world.dyn.delete(rec);
  refresh(rec);
  rec.anch = rec.inst.props.Anchored !== false && !rec.inst.free;
  if (rec.inst.props.Anchored === false) { rec.anch = false; world.dyn.add(rec); } else gridInsert(rec);
}
function addPart(p) {
  if (world.parts.has(p)) return;
  const rec = mkRec(p); world.parts.set(p, rec); place(rec); world.asmDirty = true;
}
function removePart(p) {
  const rec = world.parts.get(p); if (!rec) return;
  gridRemove(rec); world.dyn.delete(rec); world.parts.delete(p); world.touching.delete(p);
  for (const m of world.touching.values()) m.delete(p);
}
const inWorkspace = (i) => { for (let p = i; p; p = p.parent) if (p === ENV.workspace) return true; return false; };
ENV.listeners.attach.push((i) => {
  if (i.isA('BasePart') && i.className !== 'Terrain' && inWorkspace(i)) addPart(i);
  else if (i.className === 'Humanoid') registerHumanoid(i);
  else if (i.className === 'WeldConstraint' || i.className === 'Weld') world.asmDirty = true;
});
ENV.listeners.detach.push((i) => {
  if (i.isA('BasePart')) { if (!inWorkspace(i)) removePart(i); }
  else if (i.className === 'Humanoid') world.humanoids.delete(i);
  else if (i.className === 'WeldConstraint' || i.className === 'Weld') world.asmDirty = true;
});
ENV.listeners.destroy.push((i) => { if (i.isA('BasePart')) removePart(i); });
const GEO = new Set(['CFrame', 'Size', 'Shape']);
ENV.listeners.prop.push((i, k) => {
  if (!i.isA('BasePart')) { if ((i.className === 'WeldConstraint' || i.className === 'Weld') && (k === 'Part0' || k === 'Part1' || k === 'Enabled')) world.asmDirty = true; return; }
  const rec = world.parts.get(i); if (!rec) return;
  if (GEO.has(k)) { if (!rec.inCtl) { rec.dirty = true; world.dirty.add(rec); } rec.sleep = 0; }
  else if (k === 'Anchored') { place(rec); rec.vel = [0, 0, 0]; world.asmDirty = true; }
});
function flushDirty() {
  if (world.dirty.size) { for (const rec of world.dirty) { if (!world.parts.has(rec.inst)) continue; if (rec.anch) { gridRemove(rec); refresh(rec); gridInsert(rec); } else refresh(rec); } world.dirty.clear(); }
}

/* ------------------------------------------------ math helpers */
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function toLocal(rec, p) { const d = vsub(p, rec.c), r = rec.r; return [r[0] * d[0] + r[3] * d[1] + r[6] * d[2], r[1] * d[0] + r[4] * d[1] + r[7] * d[2], r[2] * d[0] + r[5] * d[1] + r[8] * d[2]]; }
function dirToLocal(rec, d) { const r = rec.r; return [r[0] * d[0] + r[3] * d[1] + r[6] * d[2], r[1] * d[0] + r[4] * d[1] + r[7] * d[2], r[2] * d[0] + r[5] * d[1] + r[8] * d[2]]; }
function dirToWorld(rec, d) { const r = rec.r; return [r[0] * d[0] + r[1] * d[1] + r[2] * d[2], r[3] * d[0] + r[4] * d[1] + r[5] * d[2], r[6] * d[0] + r[7] * d[1] + r[8] * d[2]]; }

function candidates(b, out) {
  out = out || [];
  const [x0, y0, z0, x1, y1, z1] = cellRange(b);
  const n = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
  if (n > 4000) { for (const rec of world.parts.values()) if (rec.anch) out.push(rec); return out; }
  const seen = new Set();
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const s = world.grid.get(ck(x, y, z)); if (s) for (const rec of s) if (!seen.has(rec)) { seen.add(rec); out.push(rec); }
  }
  for (const rec of world.big) out.push(rec);
  return out;
}
const aabbOverlap = (a, b) => a[0] <= b[3] && a[3] >= b[0] && a[1] <= b[4] && a[4] >= b[1] && a[2] <= b[5] && a[5] >= b[2];

/* ------------------------------------------------ OBB overlap (SAT on 15 axes) */
function obbOverlap(A, B, eps) {
  eps = eps || 0;
  const ra = A.r, rb = B.r, ha = A.h, hb = B.h;
  const t0 = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  // A's axes are columns of ra; express in A frame
  const t = [t0[0] * ra[0] + t0[1] * ra[3] + t0[2] * ra[6], t0[0] * ra[1] + t0[1] * ra[4] + t0[2] * ra[7], t0[0] * ra[2] + t0[1] * ra[5] + t0[2] * ra[8]];
  // R[i][j] = Ai . Bj
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    R[i][j] = ra[0 * 3 + i] * rb[0 * 3 + j] + ra[1 * 3 + i] * rb[1 * 3 + j] + ra[2 * 3 + i] * rb[2 * 3 + j];
    AR[i][j] = Math.abs(R[i][j]) + 1e-9;
  }
  for (let i = 0; i < 3; i++) { const rA = ha[i], rB = hb[0] * AR[i][0] + hb[1] * AR[i][1] + hb[2] * AR[i][2]; if (Math.abs(t[i]) > rA + rB + eps) return false; }
  for (let j = 0; j < 3; j++) { const rA = ha[0] * AR[0][j] + ha[1] * AR[1][j] + ha[2] * AR[2][j], rB = hb[j]; if (Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]) > rA + rB + eps) return false; }
  // cross axes
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3;
    const rA = ha[i1] * AR[i2][j] + ha[i2] * AR[i1][j], rB = hb[j1] * AR[i][j2] + hb[j2] * AR[i][j1];
    if (Math.abs(t[i2] * R[i1][j] - t[i1] * R[i2][j]) > rA + rB + eps) return false;
  }
  return true;
}
const sphereBox = (c, rad, rec) => { // sphere vs OBB
  const l = toLocal(rec, c); let d2 = 0;
  for (let i = 0; i < 3; i++) { const v = Math.max(0, Math.abs(l[i]) - rec.h[i]); d2 += v * v; }
  return d2 <= rad * rad;
};
function recOverlap(A, B, eps) {
  if (!aabbOverlap(eps ? A.box.map((v, i) => (i < 3 ? v - eps : v + eps)) : A.box, B.box)) return false;
  if (A.shape === 1 && B.shape === 0) return sphereBox(A.c, Math.min(A.h[0], A.h[1], A.h[2]) + (eps || 0), B);
  if (B.shape === 1 && A.shape === 0) return sphereBox(B.c, Math.min(B.h[0], B.h[1], B.h[2]) + (eps || 0), A);
  if (A.shape === 1 && B.shape === 1) { const d = Math.hypot(A.c[0] - B.c[0], A.c[1] - B.c[1], A.c[2] - B.c[2]); return d <= A.h[0] + B.h[0] + (eps || 0); }
  return obbOverlap(A, B, eps || 0);
}

/* ------------------------------------------------ query filters */
function filterFn(params, ignoreList) {
  const f = params && params.f;
  let list = null, include = false, respect = false;
  if (f) {
    const l = f.FilterDescendantsInstances; list = l instanceof LuaTable ? l.arr.filter((x) => x instanceof Instance) : [];
    const ft = f.FilterType; include = !!(ft && (ft.name === 'Include' || ft.name === 'Whitelist')); respect = !!f.RespectCanCollide;
  } else if (ignoreList instanceof LuaTable) list = ignoreList.arr.filter((x) => x instanceof Instance);
  else if (ignoreList instanceof Instance) list = [ignoreList];
  const inList = (i) => { if (!list) return false; for (const l of list) if (l === i || l.isAncestorOf(i)) return true; return false; };
  return (rec) => {
    const p = rec.inst;
    if (!p.props.CanQuery) return false;
    if (respect && !p.props.CanCollide) return false;
    if (f && f.CollisionGroup && ENV.cgroups[f.CollisionGroup] && ENV.cgroups[f.CollisionGroup][p.props.CollisionGroup] === false) return false;
    if (list === null || list.length === 0) return !include;
    return include ? inList(p) : !inList(p);
  };
}

/* ------------------------------------------------ ray */
function rayRec(o, d, maxT, rec) {
  if (rec.shape === 1) { // sphere
    const rad = Math.min(rec.h[0], rec.h[1], rec.h[2]);
    const m = vsub(o, rec.c); const b = dot(m, d), c = dot(m, m) - rad * rad;
    const disc = b * b - dot(d, d) * c; if (disc < 0) return null;
    const dd = dot(d, d); const t = (-b - Math.sqrt(disc)) / dd; const t2 = t < 0 ? (-b + Math.sqrt(disc)) / dd : t;
    if (t2 < 0 || t2 > maxT) return null;
    const p = [o[0] + d[0] * t2, o[1] + d[1] * t2, o[2] + d[2] * t2]; const n = vsub(p, rec.c); const l = Math.hypot(...n) || 1;
    return { t: t2, n: [n[0] / l, n[1] / l, n[2] / l] };
  }
  const lo = toLocal(rec, o), ld = dirToLocal(rec, d);
  let tmin = 0, tmax = maxT, axis = -1, sign = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-12) { if (Math.abs(lo[i]) > rec.h[i]) return null; continue; }
    let t1 = (-rec.h[i] - lo[i]) / ld[i], t2 = (rec.h[i] - lo[i]) / ld[i], s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) { // origin inside the box
    if (Math.abs(lo[0]) <= rec.h[0] && Math.abs(lo[1]) <= rec.h[1] && Math.abs(lo[2]) <= rec.h[2]) return { t: 0, n: [0, 1, 0], inside: true };
    return null;
  }
  const ln = [0, 0, 0]; ln[axis] = sign;
  return { t: tmin, n: dirToWorld(rec, ln) };
}
world.raycast = function (origin, dir, params, ignoreList) {
  flushDirty();
  const o = [origin.x, origin.y, origin.z], dl = Math.hypot(dir.x, dir.y, dir.z);
  if (dl === 0) return undefined;
  const d = [dir.x, dir.y, dir.z];
  const ff = filterFn(params, ignoreList);
  let best = null, bestRec = null;
  const end = [o[0] + d[0], o[1] + d[1], o[2] + d[2]];
  const bb = [Math.min(o[0], end[0]), Math.min(o[1], end[1]), Math.min(o[2], end[2]), Math.max(o[0], end[0]), Math.max(o[1], end[1]), Math.max(o[2], end[2])];
  const test = (rec) => {
    if (!aabbOverlap(bb, rec.box) || !ff(rec)) return;
    const h = rayRec(o, d, 1, rec);
    if (h && h.inside) return; // Roblox ignores parts the ray starts inside of
    if (h && (best === null || h.t < best.t)) { best = h; bestRec = rec; }
  };
  const span = Math.hypot(...d);
  if (span > 600) { for (const rec of world.parts.values()) test(rec); }
  else { for (const rec of candidates(bb)) test(rec); for (const rec of world.dyn) test(rec); }
  if (!best) return undefined;
  const p = v3(o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t);
  return new ENV.RaycastResult(bestRec.inst, p, v3(best.n[0], best.n[1], best.n[2]), bestRec.inst.props.Material, best.t * span);
};
// returns {inst, t, n, pos} style info for internal use (plain object)
world.rayRaw = function (o, d, maxT, ignoreFn) {
  flushDirty();
  const end = [o[0] + d[0] * maxT, o[1] + d[1] * maxT, o[2] + d[2] * maxT];
  const bb = [Math.min(o[0], end[0]), Math.min(o[1], end[1]), Math.min(o[2], end[2]), Math.max(o[0], end[0]), Math.max(o[1], end[1]), Math.max(o[2], end[2])];
  let best = null, bestRec = null;
  const test = (rec) => { if (!aabbOverlap(bb, rec.box) || !rec.inst.props.CanQuery) return; if (ignoreFn && ignoreFn(rec.inst)) return; const h = rayRec(o, d, maxT, rec); if (h && !h.inside && (best === null || h.t < best.t)) { best = h; bestRec = rec; } };
  for (const rec of candidates(bb)) test(rec);
  for (const rec of world.dyn) test(rec);
  return best ? { inst: bestRec.inst, t: best.t, n: best.n } : null;
};
function recFromBox(cf, size) {
  const rec = mkRec(null); rec.c = [cf.x, cf.y, cf.z]; rec.r = cf.r.slice(); rec.h = [size.x / 2, size.y / 2, size.z / 2];
  const r = rec.r, h = rec.h;
  const ex = Math.abs(r[0]) * h[0] + Math.abs(r[1]) * h[1] + Math.abs(r[2]) * h[2], ey = Math.abs(r[3]) * h[0] + Math.abs(r[4]) * h[1] + Math.abs(r[5]) * h[2], ez = Math.abs(r[6]) * h[0] + Math.abs(r[7]) * h[1] + Math.abs(r[8]) * h[2];
  rec.box = [rec.c[0] - ex, rec.c[1] - ey, rec.c[2] - ez, rec.c[0] + ex, rec.c[1] + ey, rec.c[2] + ez];
  return rec;
}
function queryOverlap(q, params, exclude) {
  flushDirty();
  const ff = filterFn(params); const out = [];
  const maxParts = params && params.f && params.f.MaxParts ? params.f.MaxParts : 0;
  const test = (rec) => { if (rec.inst === exclude || !ff(rec)) return; if (recOverlap(q, rec, 0)) out.push(rec.inst); };
  for (const rec of candidates(q.box)) test(rec);
  for (const rec of world.dyn) test(rec);
  return maxParts ? out.slice(0, maxParts) : out;
}
world.inRadius = function (pos, rad, params) { const q = recFromBox(new CFrame(pos.x, pos.y, pos.z), v3(rad * 2, rad * 2, rad * 2)); q.shape = 1; return queryOverlap(q, params); };
world.inBox = function (cf, size, params, exclude) { return queryOverlap(recFromBox(cf, size), params, exclude); };
world.touching = world.touching; // map used for Touched state
const touchMap = world.touching;
CLASSES.get('BasePart').methods.set('GetTouchingParts', require('../lua2js/runtime').nat((self) => { const rec = world.parts.get(self); if (!rec) return new LuaTable(); const out = []; for (const o of queryOverlap(recFromBox(self.props.CFrame, self.props.Size), null, self)) if (o.props.CanTouch !== false) out.push(o); return new LuaTable(out); }, 'GetTouchingParts'));
ENV.physics.touching = touchMap;

/* ------------------------------------------------ assemblies: welds (followers of anchored parts / rigid groups) */
function rebuildAssemblies() {
  world.asmDirty = false;
  const parent = new Map(); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const edges = [];
  for (const rec of world.parts.values()) {
    for (const ch of rec.inst.children) if ((ch.className === 'WeldConstraint' || ch.className === 'Weld') && ch.props.Enabled !== false) { const a = ch.props.Part0, b = ch.props.Part1; if (a && b && world.parts.has(a) && world.parts.has(b)) edges.push([a, b]); }
  }
  for (const p of world.parts.keys()) { p.free = false; world.parts.get(p).root = null; }
  for (const [a, b] of edges) { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); parent.set(find(a), find(b)); }
  const groups = new Map();
  for (const p of parent.keys()) { const r = find(p); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
  world.followers = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const anch = members.find((m) => m.props.Anchored !== false && !(m.charPart));
    const root = anch || members[0];
    for (const m of members) {
      if (m === root) continue;
      const rel = D.cfMul(D.cfInverse(root.props.CFrame), m.props.CFrame);
      world.followers.push({ root, part: m, rel, last: null });
      const rec = world.parts.get(m); rec.follower = true; rec.rootPart = root;
    }
  }
}
function updateFollowers() {
  for (const f of world.followers) {
    if (f.root.destroyed || f.part.destroyed) continue;
    const cf = f.root.props.CFrame;
    if (f.last === cf) continue;
    f.last = cf;
    const rec = world.parts.get(f.part); if (rec) rec.inCtl = true;
    const target = D.cfMul(cf, f.rel);
    f.part.props.CFrame = target; f.part.changed('CFrame');
    if (rec) { rec.inCtl = false; refresh(rec); if (rec.anch) { gridRemove(rec); gridInsert(rec); } }
  }
}

/* ------------------------------------------------ SAT push-out for a box (charbox / dynamic part) against OBB */
function mtv(A, B) { // A,B recs (OBB). returns {n:[x,y,z] pushing A out of B, d} or null; uses 6 face axes
  const axes = [];
  const ra = A.r, rb = B.r;
  axes.push([ra[0], ra[3], ra[6]], [ra[1], ra[4], ra[7]], [ra[2], ra[5], ra[8]], [rb[0], rb[3], rb[6]], [rb[1], rb[4], rb[7]], [rb[2], rb[5], rb[8]]);
  let bestD = Infinity, bestN = null;
  const d0 = [A.c[0] - B.c[0], A.c[1] - B.c[1], A.c[2] - B.c[2]];
  for (const ax of axes) {
    const pa = Math.abs(ax[0] * ra[0] + ax[1] * ra[3] + ax[2] * ra[6]) * A.h[0] + Math.abs(ax[0] * ra[1] + ax[1] * ra[4] + ax[2] * ra[7]) * A.h[1] + Math.abs(ax[0] * ra[2] + ax[1] * ra[5] + ax[2] * ra[8]) * A.h[2];
    const pb = Math.abs(ax[0] * rb[0] + ax[1] * rb[3] + ax[2] * rb[6]) * B.h[0] + Math.abs(ax[0] * rb[1] + ax[1] * rb[4] + ax[2] * rb[7]) * B.h[1] + Math.abs(ax[0] * rb[2] + ax[1] * rb[5] + ax[2] * rb[8]) * B.h[2];
    const dist = ax[0] * d0[0] + ax[1] * d0[1] + ax[2] * d0[2];
    const ov = pa + pb - Math.abs(dist);
    if (ov <= 0) return null;
    if (ov < bestD) { bestD = ov; bestN = dist >= 0 ? ax : [-ax[0], -ax[1], -ax[2]]; }
  }
  return { n: bestN, d: bestD };
}

/* ------------------------------------------------ Humanoid controller */
const CHAR_HW = 0.85;
function registerHumanoid(h) {
  if (world.humanoids.has(h) || !inWorkspace(h)) return;
  world.humanoids.add(h);
  h.ctl = null;
}
function setupCtl(h) {
  const m = h.parent; if (!m) return null;
  const hrp = m.findChild('HumanoidRootPart') || m.props.PrimaryPart; if (!hrp) return null;
  const left = m.findChild('Left Leg'), r6 = !!(left && m.findChild('Torso'));
  const cf = hrp.props.CFrame;
  const feet = h.props.HipHeight + hrp.props.Size.y / 2 + (r6 ? left.props.Size.y : 0);
  const ctl = { m, hrp, r6, feet, top: r6 ? 2 : hrp.props.Size.y / 2 + 1.5, pos: [cf.x, cf.y, cf.z], yaw: Math.atan2(-cf.r[2], cf.r[8]) || 0, vy: 0, vx: 0, vz: 0, grounded: false, lastCF: cf, floor: null, floorCF: null, t: 0, phase: 0, swing: 0, dead: false, deathT: 0, moveT: 0, jumpReq: false, rec: world.parts.get(hrp), parts: null, restPose: false, airT: 0 };
  if (cf.r) { const fy = D.eulerYXZ(cf.r); ctl.yaw = fy[1]; }
  ctl.parts = {}; for (const n of ['Torso', 'Head', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg']) { const p = m.findChild(n); if (p) ctl.parts[n] = p; }
  ctl.rel = new Map();
  const inv = D.cfInverse(cf);
  for (const p of m.descendants()) if (p.isA('BasePart')) { p.charPart = true; const r = world.parts.get(p); if (r) r.inCtl = true; if (!r6 && p !== hrp) ctl.rel.set(p, D.cfMul(inv, p.props.CFrame)); }
  h.ctl = ctl; return ctl;
}
function ctlBox(ctl) {
  const c = ctl; const cy = c.pos[1] - c.feet + (c.feet + c.top) / 2, hy = (c.feet + c.top) / 2;
  const rec = mkRec(null); rec.c = [c.pos[0], cy, c.pos[2]]; rec.h = [CHAR_HW, hy, CHAR_HW];
  rec.box = [rec.c[0] - CHAR_HW, rec.c[1] - hy, rec.c[2] - CHAR_HW, rec.c[0] + CHAR_HW, rec.c[1] + hy, rec.c[2] + CHAR_HW];
  return rec;
}
function rotY(yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
const mm = (a, b) => D.matMul(a, b);
function setPart(p, cf) {
  const rec = world.parts.get(p); if (rec) rec.inCtl = true;
  p.props.CFrame = cf; p.changed('CFrame');
  if (p.psigs) { for (const k of ['Position', 'Orientation', 'Rotation']) if (p.psigs[k]) p.psigs[k].fire(); }
  if (rec) { refresh(rec); }
}
function poseRig(ctl, swing, air, fall) {
  let root;
  if (fall) {
    const R = mm(rotY(ctl.yaw), rotX(-fall)); const off = D.rotVec(R, v3(0, ctl.feet, 0)); const feetY = ctl.pos[1] - ctl.feet;
    root = new CFrame(ctl.pos[0] + off.x, feetY + off.y, ctl.pos[2] + off.z, R);
  } else root = new CFrame(ctl.pos[0], ctl.pos[1], ctl.pos[2], rotY(ctl.yaw));
  setPart(ctl.hrp, root);
  if (!ctl.r6) { for (const [p, rel] of ctl.rel) if (!p.destroyed) setPart(p, D.cfMul(root, rel)); return; }
  const P = ctl.parts;
  const put = (name, cf) => { if (P[name]) setPart(P[name], D.cfMul(root, cf)); };
  put('Torso', new CFrame(0, 0, 0)); put('Head', new CFrame(0, 1.5, 0));
  const a = swing * 0.9;
  const arm = (x, ang) => { const R = rotX(ang); const o = D.rotVec(R, v3(0, -1, 0)); return new CFrame(x, 1 + o.y, o.z, R); };
  const leg = (x, ang) => { const R = rotX(ang); const o = D.rotVec(R, v3(0, -1, 0)); return new CFrame(x, -1 + o.y, o.z, R); };
  put('Left Arm', arm(-1.5, air ? 2.8 : a)); put('Right Arm', arm(1.5, air ? 2.8 : -a));
  put('Left Leg', leg(-0.5, air ? 0.35 : -a)); put('Right Leg', leg(0.5, air ? -0.35 : a));
}
function ctlStep(h, dt, ctl) {
  const hrp = ctl.hrp;
  const m = ctl.m;
  if (hrp.destroyed || !m.parent) { world.humanoids.delete(h); return; }
  const g = gravity();
  // external teleport / CFrame change detection
  if (hrp.props.CFrame !== ctl.lastCF) { const c = hrp.props.CFrame; ctl.pos = [c.x, c.y, c.z]; ctl.vy = 0; ctl.floor = null; ctl.teleported = true; const fy = D.eulerYXZ(c.r); if (Math.abs(fy[0]) < 0.3 && Math.abs(fy[2]) < 0.3) ctl.yaw = fy[1]; }
  if (h.props.Health <= 0 || ctl.dead) {
    if (!ctl.dead) { ctl.dead = true; ctl.deathT = 0; ctl.vx = ctl.vz = 0; }
    if (ctl.deathT < 0.6) { ctl.deathT += dt; poseRig(ctl, 0, false, Math.min(1, ctl.deathT / 0.5) * (Math.PI / 2)); ctl.lastCF = hrp.props.CFrame; }
    return;
  }
  if (hrp.props.Anchored || h.props.PlatformStand || h.props.Sit) { ctl.lastCF = hrp.props.CFrame; const c = hrp.props.CFrame; ctl.pos = [c.x, c.y, c.z]; return; }
  // move direction
  let mx = 0, mz = 0, jump = ctl.jumpReq || h.props.Jump;
  const pl = ENV.getService('Players').children.find((p) => p.isA('Player') && p.props.Character === m);
  if (pl && pl.isLocal && !h.moveTarget) { const mv = ENV.input ? ENV.input.moveVector() : [0, 0]; mx = mv[0]; mz = mv[1]; if (ENV.input && ENV.input.jumping()) jump = true; }
  else if (h.moveTarget) {
    const t = h.moveTarget, dx = t.x - ctl.pos[0], dz = t.z - ctl.pos[2], dist = Math.hypot(dx, dz);
    ctl.moveT += dt;
    if (dist < 1.2 || (Math.abs(t.y - (ctl.pos[1] - ctl.feet)) < 6 && dist < 1.6)) { h.moveTarget = null; ctl.moveT = 0; h.fireSignal('MoveToFinished', true); }
    else if (ctl.moveT > 8) { h.moveTarget = null; ctl.moveT = 0; h.fireSignal('MoveToFinished', false); }
    else { mx = dx / dist; mz = dz / dist; }
  } else if (h.moveInput) { mx = h.moveInput.x; mz = h.moveInput.z; }
  h.moveDir = v3(mx, 0, mz);
  const ws = h.props.WalkSpeed;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  // ride moving floors
  if (ctl.floor && ctl.floorCF && !ctl.floor.destroyed) {
    const cur = ctl.floor.props.CFrame;
    if (cur !== ctl.floorCF) {
      const delta = D.cfMul(cur, D.cfInverse(ctl.floorCF));
      const np = D.cfPoint(delta, v3(ctl.pos[0], ctl.pos[1], ctl.pos[2]));
      ctl.pos = [np.x, np.y, np.z];
      const dy = D.eulerYXZ(delta.r)[1]; if (Math.abs(dy) > 1e-6) ctl.yaw += dy;
      ctl.floorCF = cur;
    }
  }
  ctl.vx = mx * ws; ctl.vz = mz * ws;
  if (ml > 0.05 && h.props.AutoRotate) { const target = Math.atan2(-mx, -mz); let d = target - ctl.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); ctl.yaw += d * Math.min(1, dt * 14); }
  if (jump && ctl.grounded) { ctl.vy = h.props.UseJumpPower ? h.props.JumpPower : Math.sqrt(2 * g * h.props.JumpHeight); ctl.grounded = false; h.fireSignal('Jumping', true); h.fireSignal('StateChanged', En('HumanoidStateType', 'Running'), En('HumanoidStateType', 'Jumping')); }
  ctl.jumpReq = false;
  if (!h.props.Jump) { /* keep */ } else if (ctl.grounded === false) { /* wait */ } else h.props.Jump = false;
  ctl.vy -= g * dt; if (ctl.vy < -200) ctl.vy = -200;
  // integrate in small steps to avoid tunneling
  const sp = Math.max(Math.abs(ctl.vx), Math.abs(ctl.vz), Math.abs(ctl.vy)) * dt;
  const n = Math.max(1, Math.ceil(sp / 0.6));
  const sdt = dt / n;
  let groundedNow = false, floorPart = null;
  for (let s = 0; s < n; s++) {
    ctl.pos[0] += ctl.vx * sdt; ctl.pos[1] += ctl.vy * sdt; ctl.pos[2] += ctl.vz * sdt;
    for (let pass = 0; pass < 3; pass++) {
      const box = ctlBox(ctl); let hit = false;
      for (const rec of candidates(box.box)) {
        const p = rec.inst; if (!p.props.CanCollide || rec.charOwner) continue;
        if (rec.shape === 1 && false) continue;
        if (!aabbOverlap(box.box, rec.box)) continue;
        const res = mtv(box, rec); if (!res) continue;
        let { n: nn, d } = res;
        if (Math.abs(nn[1]) < 0.7) { // side hit: step up if low enough
          const top = rec.box[4]; const feetY = ctl.pos[1] - ctl.feet;
          if (top - feetY <= 2.1 && top - feetY > 0.05 && ctl.vy <= 1) { ctl.pos[1] += top - feetY + 0.01; groundedNow = true; floorPart = p; ctl.vy = Math.max(0, ctl.vy); hit = true; continue; }
        }
        ctl.pos[0] += nn[0] * (d + 0.001); ctl.pos[1] += nn[1] * (d + 0.001); ctl.pos[2] += nn[2] * (d + 0.001);
        if (nn[1] > 0.6) { groundedNow = true; floorPart = p; if (ctl.vy < 0) ctl.vy = 0; }
        else if (nn[1] < -0.6) { if (ctl.vy > 0) ctl.vy = 0; }
        else { const vd = ctl.vx * nn[0] + ctl.vz * nn[2]; if (vd < 0) { ctl.vx -= nn[0] * vd; ctl.vz -= nn[2] * vd; } }
        hit = true; break;
      }
      if (!hit) break;
    }
  }
  // ground probe (stick to ground)
  if (!groundedNow && ctl.vy <= 0.01) {
    const feetY = ctl.pos[1] - ctl.feet;
    const hit = world.rayRaw([ctl.pos[0], feetY + 0.3, ctl.pos[2]], [0, -1, 0], 0.5, (i) => !i.props.CanCollide || i.charPart);
    if (hit && hit.n[1] > 0.5) { groundedNow = true; floorPart = hit.inst; ctl.pos[1] = feetY + 0.3 - hit.t + ctl.feet; ctl.vy = 0; }
  }
  const was = ctl.grounded; ctl.grounded = groundedNow;
  if (groundedNow) { ctl.airT = 0; if (floorPart !== ctl.floor) { ctl.floor = floorPart; ctl.floorCF = floorPart.props.CFrame; } else ctl.floorCF = floorPart.props.CFrame;
    const fv = floorPart.props.AssemblyLinearVelocity; if (fv && (fv.x || fv.z)) { ctl.pos[0] += fv.x * dt; ctl.pos[2] += fv.z * dt; }
  } else { ctl.airT += dt; ctl.floor = null; }
  if (!was && groundedNow) h.fireSignal('StateChanged', En('HumanoidStateType', 'Freefall'), En('HumanoidStateType', 'Landed'));
  // void
  if (ctl.pos[1] < (ENV.workspace.props.FallenPartsDestroyHeight || -500)) { h.lset('Health', 0); return; }
  const speed = Math.hypot(ctl.vx, ctl.vz);
  ctl.phase += dt * Math.max(4, speed * 0.55) * (speed > 0.5 ? 1 : 0);
  const sw = speed > 0.5 && groundedNow ? Math.sin(ctl.phase) * Math.min(1, speed / 16) : 0;
  ctl.swing += (sw - ctl.swing) * Math.min(1, dt * 20);
  if (speed > 0.5 && groundedNow) h.fireSignal('Running', speed);
  poseRig(ctl, ctl.swing, !groundedNow && ctl.airT > 0.12, 0);
  ctl.lastCF = hrp.props.CFrame;
  ctl.speed = speed;
}
world.jump = (h) => { if (h.ctl) h.ctl.jumpReq = true; };
// R15/custom rigs: drag every part with the root
function rigidFollow(ctl) { }

/* ------------------------------------------------ dynamic (unanchored) bodies */
function dynStep(dt) {
  const g = gravity();
  for (const rec of Array.from(world.dyn)) {
    const p = rec.inst;
    if (p.charPart || rec.follower || p.destroyed) continue;
    if (rec.inCtl) continue;
    // external teleport
    if (p.props.CFrame !== rec.lastCF && rec.lastCF) { rec.sleep = 0; }
    // BodyVelocity / LinearVelocity support
    let bv = null;
    for (const ch of p.children) if (ch.className === 'BodyVelocity' || ch.className === 'LinearVelocity') { bv = ch; break; }
    const av = p.props.AssemblyLinearVelocity;
    rec.vel[0] = av.x; rec.vel[1] = av.y; rec.vel[2] = av.z;
    if (rec.sleep > 0.6 && !bv) { rec.lastCF = p.props.CFrame; continue; }
    if (bv) { const v = bv.className === 'BodyVelocity' ? bv.props.Velocity : (bv.props.VectorVelocity || v3(0, 0, 0)); rec.vel[0] = v.x; rec.vel[1] = v.y; rec.vel[2] = v.z; if (bv.className === 'BodyVelocity' && bv.props.MaxForce.y < 100) rec.vel[1] -= g * dt; }
    else rec.vel[1] -= g * dt;
    const sp = Math.hypot(rec.vel[0], rec.vel[1], rec.vel[2]) * dt; const n = Math.max(1, Math.ceil(sp / 1.0)); const sdt = dt / n;
    let grounded = false, floor = null;
    for (let s = 0; s < n; s++) {
      rec.c[0] += rec.vel[0] * sdt; rec.c[1] += rec.vel[1] * sdt; rec.c[2] += rec.vel[2] * sdt;
      refreshBox(rec);
      if (!p.props.CanCollide) continue;
      for (let pass = 0; pass < 2; pass++) {
        let hit = false;
        for (const o of candidates(rec.box)) {
          if (!o.inst.props.CanCollide || o.inst === p || !aabbOverlap(rec.box, o.box)) continue;
          if (ENV.cgroups && ENV.cgroups[p.props.CollisionGroup] && ENV.cgroups[p.props.CollisionGroup][o.inst.props.CollisionGroup] === false) continue;
          const res = mtv(rec, o); if (!res) continue;
          const nn = res.n; rec.c[0] += nn[0] * (res.d + 0.001); rec.c[1] += nn[1] * (res.d + 0.001); rec.c[2] += nn[2] * (res.d + 0.001);
          const vn = rec.vel[0] * nn[0] + rec.vel[1] * nn[1] + rec.vel[2] * nn[2];
          if (vn < 0) { const e = Math.abs(vn) > 30 ? 0.25 : 0; rec.vel[0] -= (1 + e) * vn * nn[0]; rec.vel[1] -= (1 + e) * vn * nn[1]; rec.vel[2] -= (1 + e) * vn * nn[2]; }
          const fr = Math.min(1, 6 * sdt); if (nn[1] > 0.6) { rec.vel[0] -= rec.vel[0] * fr; rec.vel[2] -= rec.vel[2] * fr; grounded = true; floor = o.inst; }
          hit = true; refreshBox(rec); break;
        }
        if (!hit) break;
      }
    }
    if (grounded && floor) { const fv = floor.props.AssemblyLinearVelocity; if (fv && (fv.x || fv.y || fv.z)) { rec.vel[0] += (fv.x - rec.vel[0]) * Math.min(1, 8 * dt); rec.vel[2] += (fv.z - rec.vel[2]) * Math.min(1, 8 * dt); } }
    // angular
    const aw = p.props.AssemblyAngularVelocity; let r = rec.r;
    if (aw.x || aw.y || aw.z) { const ang = Math.hypot(aw.x, aw.y, aw.z) * dt; const dr = D.libs.CFrame.get('fromAxisAngle'); }
    const cf = new CFrame(rec.c[0], rec.c[1], rec.c[2], rec.r);
    p.props.CFrame = cf; rec.lastCF = cf; p.changed('CFrame');
    if (p.psigs) { for (const k of ['Position', 'Orientation', 'Rotation']) if (p.psigs[k]) p.psigs[k].fire(); }
    const nv = v3(rec.vel[0], rec.vel[1], rec.vel[2]);
    p.props.AssemblyLinearVelocity = nv;
    rec.sleep = Math.hypot(...rec.vel) < 0.3 && grounded ? rec.sleep + dt : 0;
    if (rec.c[1] < (ENV.workspace.props.FallenPartsDestroyHeight || -500)) p.destroy();
  }
}
function refreshBox(rec) {
  const r = rec.r, h = rec.h;
  const ex = Math.abs(r[0]) * h[0] + Math.abs(r[1]) * h[1] + Math.abs(r[2]) * h[2], ey = Math.abs(r[3]) * h[0] + Math.abs(r[4]) * h[1] + Math.abs(r[5]) * h[2], ez = Math.abs(r[6]) * h[0] + Math.abs(r[7]) * h[1] + Math.abs(r[8]) * h[2];
  rec.box = [rec.c[0] - ex, rec.c[1] - ey, rec.c[2] - ez, rec.c[0] + ex, rec.c[1] + ey, rec.c[2] + ez];
}

/* ------------------------------------------------ Touched */
function hasTouchListeners(p) { return p.hasSignal('Touched') || p.hasSignal('TouchEnded'); }
function touchStep() {
  // moving parts: character parts and awake dynamic parts
  const movers = [];
  for (const h of world.humanoids) { const ctl = h.ctl; if (!ctl || ctl.dead) continue; for (const p of ctl.m.children) if (p.isA('BasePart')) { const rec = world.parts.get(p); if (rec) movers.push(rec); } }
  for (const rec of world.dyn) { if (rec.inst.charPart || rec.follower) continue; movers.push(rec); }
  const seenMovers = new Set();
  for (const M of movers) {
    const mp = M.inst; if (!mp.props.CanTouch) continue;
    seenMovers.add(mp);
    const prev = touchMap.get(mp);
    const now = new Map();
    const mHas = hasTouchListeners(mp);
    const ctlOwner = mp.charPart ? mp.parent : null;
    const cand = candidates([M.box[0] - 0.1, M.box[1] - 0.1, M.box[2] - 0.1, M.box[3] + 0.1, M.box[4] + 0.1, M.box[5] + 0.1]);
    for (const rec of world.dyn) if (rec !== M) cand.push(rec);
    for (const O of cand) {
      const op = O.inst; if (op === mp || !op.props.CanTouch) continue;
      if (ctlOwner && op.parent === ctlOwner) continue;
      if (!mHas && !hasTouchListeners(op)) continue;
      if (!recOverlap(M, O, 0.08)) continue;
      now.set(op, true);
      if (!prev || !prev.has(op)) {
        if (mHas) mp.fireSignal('Touched', op);
        if (op.hasSignal('Touched')) op.fireSignal('Touched', mp);
      }
    }
    if (prev) for (const op of prev.keys()) if (!now.has(op)) {
      if (mp.hasSignal('TouchEnded')) mp.fireSignal('TouchEnded', op);
      if (!op.destroyed && op.hasSignal('TouchEnded')) op.fireSignal('TouchEnded', mp);
    }
    if (now.size) touchMap.set(mp, now); else touchMap.delete(mp);
  }
  for (const mp of Array.from(touchMap.keys())) if (!seenMovers.has(mp)) { const prev = touchMap.get(mp); touchMap.delete(mp); for (const op of prev.keys()) { if (mp.hasSignal('TouchEnded')) mp.fireSignal('TouchEnded', op); if (op.hasSignal('TouchEnded')) op.fireSignal('TouchEnded', mp); } }
}

/* ------------------------------------------------ main step */
world.step = function (dt) {
  dt = Math.min(dt, 0.1);
  world.time += dt;
  if (world.asmDirty) rebuildAssemblies();
  flushDirty();
  updateFollowers();
  for (const h of Array.from(world.humanoids)) {
    if (h.destroyed) { world.humanoids.delete(h); continue; }
    let ctl = h.ctl; if (!ctl || ctl.m !== h.parent) ctl = setupCtl(h);
    if (!ctl) continue;
    const sub = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < sub; i++) ctlStep(h, dt / sub, ctl);
  }
  dynStep(dt);
  touchStep();
};
world.parts_ = world.parts;
ENV.pairs = null;
module.exports = { world, obbOverlap, recOverlap, flushDirty, addPart, registerHumanoid };

};
defs["rbx/input.js"]=function(module,exports,require){'use strict';
// UserInputService, ContextActionService, ProximityPrompt / ClickDetector interaction, Mouse.
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED, Coroutine } = C;
const { nat } = require('../lua2js/runtime');
const D = require('./datatypes');
const I = require('./instance');
const S = require('./services');
const P = require('./players');
const physics = require('./physics');
const { ENV, Instance, CLASSES, newInstance, noteUnsupported, Signal } = I;
const { Vector3, Vector2, v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);

class InputObject extends Userdata {
  constructor(type, state, key, pos, delta) { super(); this.type = type; this.state = state; this.key = key; this.pos = pos || v3(0, 0, 0); this.delta = delta || v3(0, 0, 0); }
  get tname() { return 'InputObject'; }
  lget(k) {
    switch (k) {
      case 'KeyCode': return this.key; case 'UserInputType': return this.type; case 'UserInputState': return this.state;
      case 'Position': return this.pos; case 'Delta': return this.delta;
      case 'IsModifierKeyDown': return nat((s, kc) => !!(ENV.input && ENV.input.keys.has(kc.name)), 'IsModifierKeyDown');
    }
    throw rtError(`${tostr(k)} is not a valid member of InputObject`);
  }
}
ENV.InputObject = InputObject;

const KEYMAP = { Space: 'Space', Enter: 'Return', NumpadEnter: 'KeypadEnter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', ControlRight: 'RightControl', AltLeft: 'LeftAlt', AltRight: 'RightAlt', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: 'Backquote', Minus: 'Minus', Equal: 'Equals', BracketLeft: 'LeftBracket', BracketRight: 'RightBracket', Semicolon: 'Semicolon', Quote: 'Quote', Comma: 'Comma', Period: 'Period', Slash: 'Slash', Backslash: 'BackSlash', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'CapsLock' };
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
function keyName(code) {
  if (KEYMAP[code]) return KEYMAP[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return DIGITS[+m[1]];
  m = /^Numpad(\d)$/.exec(code); if (m) return 'Keypad' + DIGITS[+m[1]];
  m = /^F(\d+)$/.exec(code); if (m) return 'F' + m[1];
  return null;
}

const input = ENV.input = {
  keys: new Set(), mouseButtons: new Set(), mousePos: new Vector2(0, 0), mouseDelta: new Vector2(0, 0),
  joy: [0, 0], jump: false, lastType: 'Keyboard', touchEnabled: false, focusedTextBox: null,
  actions: [],
  keyCode(name) { return En('KeyCode', name); },
  moveVector() {
    let f = 0, r = 0;
    const k = input.keys;
    if (!input.blockMove) {
      if (k.has('W') || k.has('Up')) f += 1; if (k.has('S') || k.has('Down')) f -= 1;
      if (k.has('D') || k.has('Right')) r += 1; if (k.has('A') || k.has('Left')) r -= 1;
    }
    f += -input.joy[1]; r += input.joy[0];
    if (!f && !r) return [0, 0];
    const yaw = ENV.cam ? ENV.cam.yaw : 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let x = fx * f + rx * r, z = fz * f + rz * r;
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    return [x, z];
  },
  jumping() { return !input.blockMove && input.keys.has('Space') || input.jump; },
  mouse(player) {
    if (!ENV.mouse) { ENV.mouse = new Instance(CLASSES.get('PlayerMouse')); ENV.mouse.props.Name = 'Mouse'; }
    return ENV.mouse;
  },
  // dispatch a raw input event. gpe = game processed event (a GUI consumed it)
  fire(kind, keyName, state, pos, gpe, delta) {
    const uis = ENV.svc('UserInputService');
    const typeName = kind;
    const obj = new InputObject(En('UserInputType', typeName), En('UserInputState', state), En('KeyCode', keyName || 'Unknown'), pos, delta);
    if (state === 'Begin') uis.fireSignal('InputBegan', obj, !!gpe);
    else if (state === 'End') uis.fireSignal('InputEnded', obj, !!gpe);
    else uis.fireSignal('InputChanged', obj, !!gpe);
    // context actions
    if (!gpe) input.runActions(obj, typeName, keyName, state);
    return obj;
  },
  runActions(obj, typeName, keyName, state) {
    for (let i = input.actions.length - 1; i >= 0; i--) {
      const a = input.actions[i];
      if (!a.inputs.some((x) => x === keyName || x === typeName)) continue;
      const co = new Coroutine(function* () {
        const r = yield* C.toCallable(a.fn)(a.name, obj.state, obj);
        return r;
      }, ENV.contexts.client);
      const r = ENV.rt.resumeThread(co, []);
      if (r[0] && r[1] && r[1].name === 'Sink') break;
    }
  },
  key(code, down, gpe) {
    const name = typeof code === 'string' && keyName(code) || code; if (!name) return;
    const had = input.keys.has(name);
    if (down === had) return;
    if (down) input.keys.add(name); else input.keys.delete(name);
    input.lastType = 'Keyboard';
    input.fire('Keyboard', name, down ? 'Begin' : 'End', v3(0, 0, 0), gpe || !!input.focusedTextBox);
    if (down && name === 'Space' && !gpe) ENV.svc('UserInputService').fireSignal('JumpRequest');
    // prompts
    if (!gpe && !input.focusedTextBox) {
      if (down) ENV.prompts.keyDown(name); else ENV.prompts.keyUp(name);
    }
  },
  mouseButton(btn, down, x, y, gpe) {
    const nm = btn === 0 ? 'MouseButton1' : btn === 2 ? 'MouseButton2' : 'MouseButton3';
    input.mousePos = new Vector2(x, y);
    if (down) input.mouseButtons.add(nm); else input.mouseButtons.delete(nm);
    input.lastType = 'MouseButton';
    input.fire(nm, 'Unknown', down ? 'Begin' : 'End', v3(x, y, 0), gpe);
    const m = ENV.mouse;
    if (m && !gpe) m.fireSignal(btn === 2 ? (down ? 'Button2Down' : 'Button2Up') : (down ? 'Button1Down' : 'Button1Up'));
    if (!gpe && btn === 0 && !down) ENV.clicks.click(x, y);
  },
  mouseMove(x, y, dx, dy, gpe) {
    input.mousePos = new Vector2(x, y); input.mouseDelta = new Vector2(dx, dy);
    input.fire('MouseMovement', 'Unknown', 'Change', v3(x, y, 0), gpe, v3(dx, dy, 0));
    if (ENV.mouse) ENV.mouse.fireSignal('Move');
    ENV.clicks.hover(x, y);
  },
  wheel(dy, gpe) { input.fire('MouseWheel', 'Unknown', 'Change', v3(0, dy, 0), gpe, v3(0, dy, 0)); if (ENV.mouse) ENV.mouse.fireSignal(dy > 0 ? 'WheelForward' : 'WheelBackward'); },
  touch(state, x, y, gpe) {
    input.lastType = 'Touch';
    input.fire('Touch', 'Unknown', state, v3(x, y, 0), gpe);
    const uis = ENV.svc('UserInputService');
    if (state === 'End' && !gpe) { uis.fireSignal('TouchTap', tbl1(new Vector2(x, y)), false); uis.fireSignal('TouchTapInWorld', new Vector2(x, y), false); ENV.clicks.click(x, y); }
  },
};
const tbl1 = (v) => new LuaTable([v]);

const extend = P.extend;
CLASSES.get('UserInputService').props.set('MouseEnabled', { def: true });
extend('UserInputService', {
  props: { KeyboardEnabled: true, TouchEnabled: P.extend && false, MouseBehavior: En('MouseBehavior', 'Default'), MouseIconEnabled: true, MouseDeltaSensitivity: 1, GamepadEnabled: false, AccelerometerEnabled: false, GyroscopeEnabled: false, VREnabled: false, ModalEnabled: false, OnScreenKeyboardVisible: false, MouseEnabled: true,
    TouchEnabled2: false },
  events: ['InputBegan', 'InputEnded', 'InputChanged', 'TouchTap', 'TouchTapInWorld', 'TouchStarted', 'TouchEnded', 'TouchMoved', 'TouchLongPress', 'TouchPan', 'TouchPinch', 'TouchRotate', 'TouchSwipe', 'JumpRequest', 'TextBoxFocused', 'TextBoxFocusReleased', 'LastInputTypeChanged', 'WindowFocused', 'WindowFocusReleased', 'PointerAction', 'DeviceAccelerationChanged', 'DeviceGravityChanged', 'DeviceRotationChanged', 'GamepadConnected', 'GamepadDisconnected', 'StatusBarTapped', 'UserCFrameChanged'],
  methods: {
    GetMouseLocation() { return input.mousePos; },
    GetMouseDelta() { return input.mouseDelta; },
    IsKeyDown(self, kc) { return input.keys.has(kc.name); },
    IsMouseButtonPressed(self, t) { return input.mouseButtons.has(t.name); },
    GetKeysPressed() { return new LuaTable(Array.from(input.keys).map((k) => { const o = new InputObject(En('UserInputType', 'Keyboard'), En('UserInputState', 'Begin'), En('KeyCode', k)); return o; })); },
    GetConnectedGamepads() { return new LuaTable(); },
    IsGamepadButtonDown() { return false; }, GetGamepadState() { return new LuaTable(); }, GetNavigationGamepads() { return new LuaTable(); },
    GetFocusedTextBox() { return input.focusedTextBox || undefined; },
    GetLastInputType() { return En('UserInputType', input.lastType); },
    GetStringForKeyCode(self, kc) { return kc.name; },
    GetDeviceAcceleration() { return new InputObject(En('UserInputType', 'Accelerometer'), En('UserInputState', 'None'), En('KeyCode', 'Unknown')); },
    GetPlatform() { return En('Platform', 'Windows'); },
    GetImageForKeyCode() { return ''; },
    SetNavigationGamepad() { return E; },
  },
});
CLASSES.get('UserInputService').props.set('TouchEnabled', { $p: true, def: false, get: () => !!input.touchEnabled, ro: true });
CLASSES.get('UserInputService').props.delete('TouchEnabled2');
CLASSES.get('UserInputService')._pc.clear();
for (const ev of ['PromptTriggered', 'PromptTriggerEnded', 'PromptButtonHoldBegan', 'PromptButtonHoldEnded', 'PromptShown', 'PromptHidden']) CLASSES.get('ProximityPromptService').events.add(ev);
CLASSES.get('ProximityPromptService').props.set('Enabled', { def: true });
CLASSES.get('ProximityPromptService')._ec.clear();

/* ContextActionService */
extend('ContextActionService', { methods: {
  BindAction(self, name, fn, touchBtn, ...keys) {
    input.actions = input.actions.filter((a) => a.name !== name);
    const inputs = []; for (const k of keys) { if (k && k.name) inputs.push(k.name); }
    input.actions.push({ name, fn, inputs });
    if (touchBtn && ENV.gui && ENV.gui.addActionButton) ENV.gui.addActionButton(name);
    return E;
  },
  BindActionAtPriority(self, name, fn, touchBtn, prio, ...keys) { input.actions = input.actions.filter((a) => a.name !== name); const inputs = []; for (const k of keys) if (k && k.name) inputs.push(k.name); input.actions.push({ name, fn, inputs }); return E; },
  UnbindAction(self, name) { input.actions = input.actions.filter((a) => a.name !== name); return E; },
  UnbindAllActions() { input.actions = []; return E; },
  GetAllBoundActionInfo() { return new LuaTable(); },
  SetTitle() { return E; }, SetPosition() { return E; }, SetImage() { return E; }, SetDescription() { return E; },
  GetButton() { return undefined; },
} });
CLASSES.get('ContextActionService').events.add('LocalToolEquipped'); CLASSES.get('ContextActionService').events.add('LocalToolUnequipped'); CLASSES.get('ContextActionService')._ec.clear();

/* ------------------------------------------------ ProximityPrompts */
const prompts = ENV.prompts = { list: new Set(), active: null, hold: null, holdT: 0 };
ENV.listeners.attach.push((i) => { if (i.className === 'ProximityPrompt') prompts.list.add(i); });
ENV.listeners.detach.push((i) => { if (i.className === 'ProximityPrompt') { prompts.list.delete(i); if (prompts.active === i) prompts.setActive(null); } });
function promptPos(pr) {
  const p = pr.parent; if (!p) return null;
  if (p.isA('BasePart')) { const c = p.props.CFrame; return [c.x, c.y, c.z]; }
  if (p.className === 'Attachment') { const w = p.lget('WorldPosition'); return [w.x, w.y, w.z]; }
  if (p.isA('Model')) { const c = I.modelPivot(p); return [c.x, c.y, c.z]; }
  return null;
}
prompts.setActive = function (pr) {
  const old = prompts.active; if (old === pr) return;
  if (prompts.hold) prompts.release();
  prompts.active = pr;
  const pps = ENV.svc('ProximityPromptService');
  const pl = ENV.localPlayer;
  if (old && !old.destroyed) { old.fireSignal('PromptHidden'); pps.fireSignal('PromptHidden', old, ENV.contexts.client ? undefined : undefined); }
  if (pr) { pr.fireSignal('PromptShown'); pps.fireSignal('PromptShown', pr); }
};
prompts.update = function (dt) {
  const pl = ENV.localPlayer; const ch = pl && pl.props.Character; const hrp = ch && ch.findChild('HumanoidRootPart');
  const hum = ch && ch.findChild('Humanoid');
  if (!hrp || !hum || hum.props.Health <= 0 || !ENV.svc('ProximityPromptService').props.Enabled) return prompts.setActive(null);
  const c = hrp.props.CFrame; let best = null, bd = Infinity;
  for (const pr of prompts.list) {
    if (!pr.props.Enabled) continue;
    const pos = promptPos(pr); if (!pos) continue;
    const d = Math.hypot(pos[0] - c.x, pos[1] - c.y, pos[2] - c.z);
    if (d > pr.props.MaxActivationDistance || d >= bd) continue;
    if (pr.props.RequiresLineOfSight) {
      const dir = [pos[0] - c.x, pos[1] - c.y, pos[2] - c.z]; const l = d || 1;
      const hit = physics.world.rayRaw([c.x, c.y, c.z], [dir[0] / l, dir[1] / l, dir[2] / l], Math.max(0, l - 0.5), (i) => (i.charPart || i.parent === ch || !i.props.CanCollide || (pr.parent && (i === pr.parent || (pr.parent.isA('Model') && pr.parent.isAncestorOf(i)) || (pr.parent.parent && pr.parent.parent.isA('Model') && pr.parent.parent.isAncestorOf(i))))));
      if (hit) continue;
    }
    best = pr; bd = d;
  }
  prompts.setActive(best);
  if (prompts.hold) {
    prompts.holdT += dt;
    const need = prompts.hold.props.HoldDuration;
    if (prompts.holdT >= need) { const pr = prompts.hold; prompts.hold = null; prompts.trigger(pr); }
  }
};
prompts.trigger = function (pr) {
  const pl = ENV.localPlayer; if (!pl) return;
  pr.fireSignal('Triggered', pl);
  ENV.svc('ProximityPromptService').fireSignal('PromptTriggered', pr, pl);
  prompts.lastTriggered = pr;
  setTimeoutEnd(pr);
};
function setTimeoutEnd(pr) { /* TriggerEnded is fired on release */ }
prompts.press = function (pr) {
  if (!pr || prompts.hold) return;
  const pl = ENV.localPlayer;
  if (pr.props.HoldDuration > 0) { prompts.hold = pr; prompts.holdT = 0; pr.fireSignal('PromptButtonHoldBegan', pl); ENV.svc('ProximityPromptService').fireSignal('PromptButtonHoldBegan', pr, pl); }
  else { prompts.trigger(pr); prompts.pressed = pr; }
};
prompts.release = function () {
  const pl = ENV.localPlayer;
  if (prompts.hold) { const pr = prompts.hold; prompts.hold = null; pr.fireSignal('PromptButtonHoldEnded', pl); ENV.svc('ProximityPromptService').fireSignal('PromptButtonHoldEnded', pr, pl); }
  if (prompts.pressed || prompts.lastTriggered) { const pr = prompts.pressed || prompts.lastTriggered; prompts.pressed = null; prompts.lastTriggered = null; if (!pr.destroyed) { pr.fireSignal('TriggerEnded', pl); ENV.svc('ProximityPromptService').fireSignal('PromptTriggerEnded', pr, pl); } }
};
prompts.keyDown = function (name) { const a = prompts.active; if (a && a.props.KeyboardKeyCode.name === name) prompts.press(a); };
prompts.keyUp = function (name) { const a = prompts.active; if ((a && a.props.KeyboardKeyCode.name === name) || prompts.hold || prompts.pressed || prompts.lastTriggered) { if (prompts.hold && prompts.hold.props.KeyboardKeyCode.name !== name) return; prompts.release(); } };

/* ------------------------------------------------ ClickDetectors and Mouse.Target */
const clicks = ENV.clicks = {
  hovered: null,
  rayAt(x, y) {
    if (!ENV.screenRay) return null;
    const ray = ENV.screenRay(x, y); const o = ray.o, d = ray.d;
    const ch = ENV.localPlayer && ENV.localPlayer.props.Character;
    const r = physics.world.rayRaw([o.x, o.y, o.z], [d.x, d.y, d.z], 1000, (i) => !!(ch && ch.isAncestorOf(i)) || i.props.Transparency >= 1 && !i.findFirstClickDetector);
    if (!r) return null;
    return { inst: r.inst, pos: v3(o.x + d.x * r.t, o.y + d.y * r.t, o.z + d.z * r.t), t: r.t, n: r.n };
  },
  detectorFor(part) {
    for (let p = part; p && p !== ENV.workspace; p = p.parent) {
      for (const ch of p.children) if (ch.className === 'ClickDetector') return ch;
    }
    return null;
  },
  inRange(cd) {
    const ch = ENV.localPlayer && ENV.localPlayer.props.Character; const hrp = ch && ch.findChild('HumanoidRootPart'); if (!hrp) return false;
    const pp = cd.parent && (cd.parent.isA('BasePart') ? cd.parent : cd.parent.isA('Model') ? cd.parent.props.PrimaryPart || cd.parent.descendants().find((d) => d.isA('BasePart')) : null);
    if (!pp) return true;
    const a = hrp.props.CFrame, b = pp.props.CFrame;
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= cd.props.MaxActivationDistance + Math.max(pp.props.Size.x, pp.props.Size.z) / 2;
  },
  click(x, y) {
    const hit = clicks.rayAt(x, y); if (!hit) return;
    const cd = clicks.detectorFor(hit.inst);
    if (cd && clicks.inRange(cd)) cd.fireSignal('MouseClick', ENV.localPlayer);
  },
  hover(x, y) {
    const hit = clicks.rayAt(x, y);
    const cd = hit ? clicks.detectorFor(hit.inst) : null;
    const m = ENV.mouse;
    if (m && hit) { m.props.Target = hit.inst; m.props.Hit = new D.CFrame(hit.pos.x, hit.pos.y, hit.pos.z); } else if (m) { m.props.Target = undefined; }
    if (m) { m.props.X = x; m.props.Y = y; }
    const now = cd && clicks.inRange(cd) ? cd : null;
    if (now !== clicks.hovered) {
      if (clicks.hovered && !clicks.hovered.destroyed) clicks.hovered.fireSignal('MouseHoverLeave', ENV.localPlayer);
      if (now) now.fireSignal('MouseHoverEnter', ENV.localPlayer);
      clicks.hovered = now;
      if (ENV.onHoverClick) ENV.onHoverClick(!!now);
    }
  },
};
module.exports = { input, InputObject, prompts, clicks, keyName };

};
defs["rbx/layout.js"]=function(module,exports,require){'use strict';
// GUI layout engine (pure JS, no DOM): computes absolute rectangles for GuiObjects, like Roblox's UDim2/AnchorPoint/UI*Layout system.
const I = require('./instance');
require('./classes'); require('./classes_gui');
const D = require('./datatypes');
const { ENV, CLASSES } = I;

const layout = ENV.layout = { dirty: new Set(), vw: 1280, vh: 720, inset: 36, version: 0 };

const isGui = (i) => i.isA('GuiObject');
const rootOf = (i) => { for (let p = i; p; p = p.parent) if (p.isA('LayerCollector')) return p; return null; };
layout.rootOf = rootOf;

// default text metrics (browser replaces ENV.measureText with canvas-based)
function measure(inst, maxW) {
  const p = inst.props, text = p.Text || '', size = p.TextSize || 14;
  if (ENV.textSizeFn) return ENV.textSizeFn(text, size, p.Font, p.TextWrapped && maxW > 0 ? maxW : 1e9, p.RichText);
  const lines = text.split('\n'); let w = 0;
  for (const l of lines) w = Math.max(w, l.length * size * 0.52);
  let h = lines.length * size * 1.15;
  if (p.TextWrapped && maxW > 0 && w > maxW) { const n = Math.ceil(w / maxW); h = n * size * 1.15 * lines.length; w = maxW; }
  return { w, h };
}
layout.measure = measure;
const udim = (u, base) => u.s * base + u.o;
function childList(parent) { return parent.children.filter((c) => c.isA('GuiObject')); }
function findChildOfClass(parent, cls) { for (const c of parent.children) if (c.isA(cls)) return c; return null; }

function resolveSize(g, pw, ph, ctx) {
  const s = g.props.Size;
  let w, h;
  const sc = g.props.SizeConstraint.name;
  if (sc === 'RelativeXX') { w = s.xs * pw + s.xo; h = s.ys * pw + s.yo; }
  else if (sc === 'RelativeYY') { w = s.xs * ph + s.xo; h = s.ys * ph + s.yo; }
  else { w = s.xs * pw + s.xo; h = s.ys * ph + s.yo; }
  return [w, h];
}
function applyConstraints(g, w, h) {
  for (const c of g.children) {
    if (c.className === 'UISizeConstraint') { const mn = c.props.MinSize, mx = c.props.MaxSize; w = Math.min(Math.max(w, mn.x), mx.x); h = Math.min(Math.max(h, mn.y), mx.y); }
    else if (c.className === 'UIAspectRatioConstraint') { const r = c.props.AspectRatio || 1; const dom = c.props.DominantAxis.name; if (dom === 'Height') w = h * r; else h = w / r; }
  }
  return [w, h];
}

// lay out `g` inside a parent content box. cb = {x,y,w,h} content box of parent (absolute coords), plus cp = canvas origin offset
function layoutObject(g, box, pos, size, scroll) {
  // pos/size: already resolved for this child (abs x,y,w,h)
  const rec = g.abs || (g.abs = { x: 0, y: 0, w: 0, h: 0 });
  rec.x = pos[0]; rec.y = pos[1]; rec.w = size[0]; rec.h = size[1];
  layoutChildren(g);
}
function paddingOf(g, w, h) {
  const pad = findChildOfClass(g, 'UIPadding');
  if (!pad) return [0, 0, 0, 0];
  const p = pad.props;
  return [udim(p.PaddingLeft, w), udim(p.PaddingTop, h), udim(p.PaddingRight, w), udim(p.PaddingBottom, h)];
}
function layoutChildren(g) {
  const abs = g.abs;
  const kids = childList(g);
  const isScroll = g.className === 'ScrollingFrame';
  let w = abs.w, h = abs.h;
  const pad = paddingOf(g, w, h);
  let cw = w - pad[0] - pad[2], ch = h - pad[1] - pad[3];
  let cx = abs.x + pad[0], cy = abs.y + pad[1];
  let canvasW = cw, canvasH = ch;
  let scrollX = 0, scrollY = 0;
  if (isScroll) {
    const cs = g.props.CanvasSize, thick = g.props.ScrollBarThickness || 0;
    const cp = g.props.CanvasPosition;
    scrollX = cp.x; scrollY = cp.y;
    const auto = g.props.AutomaticCanvasSize.name;
    canvasW = cs.xs * cw + cs.xo; canvasH = cs.ys * ch + cs.yo;
    if (cs.xs === 0 && cs.xo === 0) canvasW = cw;
    if (cs.ys === 0 && cs.yo === 0) canvasH = ch;
    if (auto === 'Y' || auto === 'XY') canvasH = ch;
    cw = Math.max(canvasW, 0); ch = Math.max(canvasH, 0);
  }
  const list = findChildOfClass(g, 'UIListLayout'), grid = list ? null : findChildOfClass(g, 'UIGridLayout');
  const vis = kids.filter((k) => k.props.Visible !== false);
  let maxRight = 0, maxBottom = 0;
  const place = (k, px, py, sw, sh) => {
    // px,py: top-left (absolute minus scroll) of the child
    const a = k.abs || (k.abs = { x: 0, y: 0, w: 0, h: 0 });
    a.x = px; a.y = py; a.w = sw; a.h = sh;
    k.rel = { x: px - abs.x, y: py - abs.y };
  };
  const sizeKid = (k, bw, bh) => {
    let [sw, sh] = resolveSize(k, bw, bh);
    const auto = k.props.AutomaticSize.name;
    if (auto !== 'None') {
      // measure content
      const m = contentSize(k, auto, sw, sh);
      if (auto === 'X' || auto === 'XY') sw = Math.max(m[0], k.props.Size.xo > 0 ? 0 : 0) || m[0];
      if (auto === 'Y' || auto === 'XY') sh = Math.max(m[1], 0);
      if (auto === 'X' || auto === 'XY') sw = Math.max(sw, 0);
    }
    [sw, sh] = applyConstraints(k, sw, sh);
    return [Math.max(0, sw), Math.max(0, sh)];
  };
  if (list) {
    const lp = list.props, vertical = lp.FillDirection.name === 'Vertical';
    const items = sortItems(vis, lp.SortOrder.name);
    const padPx = vertical ? udim(lp.Padding, ch) : udim(lp.Padding, cw);
    const sizes = items.map((k) => sizeKid(k, cw, ch));
    const ha = lp.HorizontalAlignment.name, va = lp.VerticalAlignment.name;
    // lines (for wrapping)
    const lines = []; let cur = { items: [], main: 0, cross: 0 };
    items.forEach((k, i) => {
      const [sw, sh] = sizes[i]; const main = vertical ? sh : sw, cross = vertical ? sw : sh;
      const limit = vertical ? ch : cw;
      if (lp.Wraps && cur.items.length && cur.main + padPx + main > limit + 0.01) { lines.push(cur); cur = { items: [], main: 0, cross: 0 }; }
      cur.main += (cur.items.length ? padPx : 0) + main; cur.cross = Math.max(cur.cross, cross); cur.items.push(i);
    });
    if (cur.items.length) lines.push(cur);
    const totalCross = lines.reduce((s, l) => s + l.cross, 0) + Math.max(0, lines.length - 1) * padPx;
    const maxMain = lines.reduce((s, l) => Math.max(s, l.main), 0);
    // block origin
    let crossPos = 0;
    for (const line of lines) {
      let mainPos;
      // alignment along main axis
      const mainAlign = vertical ? va : ha, crossAlign = vertical ? ha : va;
      const limitMain = vertical ? ch : cw, limitCross = vertical ? cw : ch;
      mainPos = mainAlign === 'Center' ? (limitMain - line.main) / 2 : (mainAlign === 'Bottom' || mainAlign === 'Right') ? limitMain - line.main : 0;
      const crossBase = crossAlign === 'Center' ? (limitCross - totalCross) / 2 : (crossAlign === 'Bottom' || crossAlign === 'Right') ? limitCross - totalCross : 0;
      for (const i of line.items) {
        const k = items[i]; const [sw, sh] = sizes[i];
        const ap = k.props.AnchorPoint;
        const cross = (vertical ? sw : sh);
        let off;
        // within line cross extent: items are aligned according to ItemLineAlignment (default start)
        off = 0;
        let x, y;
        if (vertical) { x = cx + crossBase + crossPos + off + ap.x * sw; y = cy + mainPos + ap.y * sh; }
        else { x = cx + mainPos + ap.x * sw; y = cy + crossBase + crossPos + off + ap.y * sh; }
        // for single-line vertical lists the cross axis alignment applies per item
        if (vertical && lines.length === 1) { const ca = ha; x = cx + (ca === 'Center' ? (cw - sw) / 2 : ca === 'Right' ? cw - sw : 0) + ap.x * sw; }
        if (!vertical && lines.length === 1) { const ca = va; y = cy + (ca === 'Center' ? (ch - sh) / 2 : ca === 'Bottom' ? ch - sh : 0) + ap.y * sh; }
        place(k, x - ap.x * sw, y - ap.y * sh, sw, sh);
        // children offset by the item's own Position offset is ignored in lists
        mainPos += (vertical ? sh : sw) + padPx;
      }
      crossPos += line.cross + padPx;
    }
    list.contentW = vertical ? Math.max(...sizes.map((s) => s[0]), 0) : maxMain;
    list.contentH = vertical ? maxMain : (lines.length ? totalCross : 0);
    if (lines.length > 1) { list.contentW = vertical ? totalCross : maxMain; list.contentH = vertical ? maxMain : totalCross; }
    maxRight = list.contentW; maxBottom = list.contentH;
    for (const k of items) layoutChildren(k);
  } else if (grid) {
    const gp = grid.props;
    const cellW = Math.max(0, udim({ s: gp.CellSize.xs, o: gp.CellSize.xo }, cw)), cellH = Math.max(0, udim({ s: gp.CellSize.ys, o: gp.CellSize.yo }, ch));
    const padX = gp.CellPadding.xs * cw + gp.CellPadding.xo, padY = gp.CellPadding.ys * ch + gp.CellPadding.yo;
    const horiz = gp.FillDirection.name === 'Horizontal';
    const items = sortItems(vis, gp.SortOrder.name);
    let perLine = horiz ? Math.max(1, Math.floor((cw + padX) / (cellW + padX) + 1e-6)) : Math.max(1, Math.floor((ch + padY) / (cellH + padY) + 1e-6));
    if (gp.FillDirectionMaxCells > 0) perLine = Math.min(perLine, gp.FillDirectionMaxCells);
    const n = items.length;
    const lines = Math.ceil(n / perLine) || 0;
    const cols = horiz ? Math.min(perLine, n) : lines, rows = horiz ? lines : Math.min(perLine, n);
    const usedW = cols * cellW + Math.max(0, cols - 1) * padX, usedH = rows * cellH + Math.max(0, rows - 1) * padY;
    const ha = gp.HorizontalAlignment.name, va = gp.VerticalAlignment.name;
    const ox = ha === 'Center' ? (cw - usedW) / 2 : ha === 'Right' ? cw - usedW : 0;
    const oy = va === 'Center' ? (ch - usedH) / 2 : va === 'Bottom' ? ch - usedH : 0;
    const corner = gp.StartCorner.name;
    items.forEach((k, i) => {
      let col = horiz ? i % perLine : Math.floor(i / perLine), row = horiz ? Math.floor(i / perLine) : i % perLine;
      if (corner === 'TopRight' || corner === 'BottomRight') col = cols - 1 - col;
      if (corner === 'BottomLeft' || corner === 'BottomRight') row = rows - 1 - row;
      const ap = k.props.AnchorPoint;
      const x = cx + ox + col * (cellW + padX), y = cy + oy + row * (cellH + padY);
      place(k, x + (ap.x ? 0 : 0), y, cellW, cellH);
    });
    grid.contentW = usedW; grid.contentH = usedH; grid.cellsX = cols; grid.cellsY = rows; grid.cellW = cellW; grid.cellH = cellH;
    maxRight = usedW; maxBottom = usedH;
    for (const k of items) layoutChildren(k);
  } else {
    for (const k of vis) {
      const [sw, sh] = sizeKid(k, cw, ch);
      const p = k.props.Position, ap = k.props.AnchorPoint;
      const x = cx + p.xs * cw + p.xo - ap.x * sw, y = cy + p.ys * ch + p.yo - ap.y * sh;
      place(k, x, y, sw, sh);
      maxRight = Math.max(maxRight, x - cx + sw); maxBottom = Math.max(maxBottom, y - cy + sh);
      layoutChildren(k);
    }
  }
  // hidden children still get a rect (cheap, avoids stale AbsoluteSize reads)
  for (const k of kids) if (k.props.Visible === false) { const [sw, sh] = sizeKid(k, cw, ch); const p = k.props.Position, ap = k.props.AnchorPoint; place(k, cx + p.xs * cw + p.xo - ap.x * sw, cy + p.ys * ch + p.yo - ap.y * sh, sw, sh); layoutChildren(k); }
  if (isScroll) {
    const auto = g.props.AutomaticCanvasSize.name;
    g.canvasW = cw; g.canvasH = ch;
    if (auto === 'Y' || auto === 'XY') g.canvasH = Math.max(maxBottom + pad[3], 0);
    if (auto === 'X' || auto === 'XY') g.canvasW = Math.max(maxRight + pad[2], 0) || cw;
    // scroll offset applied to absolute positions of descendants
    if (scrollX || scrollY) shift(g, -scrollX, -scrollY);
    g.contentBoxH = ch;
  }
  g.contentRight = maxRight; g.contentBottom = maxBottom;
}
function shift(g, dx, dy) {
  for (const k of g.children) {
    if (k.isA('GuiObject') && k.abs) { k.abs.x += dx; k.abs.y += dy; shift(k, dx, dy); }
  }
}
function sortItems(items, order) {
  const a = items.map((k, i) => ({ k, i }));
  if (order === 'Name') a.sort((p, q) => (p.k.props.Name < q.k.props.Name ? -1 : p.k.props.Name > q.k.props.Name ? 1 : p.i - q.i));
  else if (order === 'Custom') { /* keep order */ }
  else a.sort((p, q) => (p.k.props.LayoutOrder - q.k.props.LayoutOrder) || (p.i - q.i));
  return a.map((x) => x.k);
}
// content size for AutomaticSize
function contentSize(k, auto, sw, sh) {
  const cn = k.className;
  if (k.isA('TextLabel') || k.isA('TextButton') || k.isA('TextBox')) {
    const pad = paddingOf(k, sw, sh);
    const maxW = auto === 'Y' ? sw - pad[0] - pad[2] : 1e9;
    const m = measure(k, maxW);
    return [m.w + pad[0] + pad[2], m.h + pad[1] + pad[3]];
  }
  // frames: lay out the children with the provisional size and measure extents
  const keep = k.abs; k.abs = { x: 0, y: 0, w: sw, h: sh };
  layoutChildren(k);
  const pad = paddingOf(k, sw, sh);
  const r = [k.contentRight + pad[0] + pad[2], k.contentBottom + pad[1] + pad[3]];
  k.abs = keep || k.abs;
  return r;
}

// full layout for a ScreenGui (or other LayerCollector)
layout.run = function (root) {
  if (root.className === 'BillboardGui' || root.className === 'SurfaceGui') {
    const s = root.props.Size || new D.UDim2(0, 100, 0, 100);
    const w = root.className === 'BillboardGui' ? s.xo + s.xs * 50 : (root.props.CanvasSize ? root.props.CanvasSize.x : 800), h = root.className === 'BillboardGui' ? s.yo + s.ys * 50 : (root.props.CanvasSize ? root.props.CanvasSize.y : 600);
    root.abs = { x: 0, y: 0, w: root.billW || w, h: root.billH || h };
  } else {
    const inset = root.props.IgnoreGuiInset ? 0 : layout.inset;
    root.abs = { x: 0, y: inset, w: layout.vw, h: layout.vh - inset };
  }
  layoutChildren(root);
  root.layoutDirty = false; layout.dirty.delete(root);
  root.layoutVersion = ++layout.version;
};
layout.ensure = function (inst) {
  const r = rootOf(inst);
  if (r && (r.layoutDirty !== false)) layout.run(r);
  return r;
};
layout.markDirty = function (inst) {
  const r = rootOf(inst);
  if (r) { r.layoutDirty = true; layout.dirty.add(r); }
};
const LAYOUT_PROPS = new Set(['Size', 'Position', 'AnchorPoint', 'Visible', 'LayoutOrder', 'AutomaticSize', 'SizeConstraint', 'Text', 'TextSize', 'Font', 'TextWrapped', 'RichText', 'CanvasSize', 'CanvasPosition', 'AutomaticCanvasSize', 'ScrollBarThickness', 'Parent', 'Name', 'FillDirection', 'HorizontalAlignment', 'VerticalAlignment', 'SortOrder', 'Padding', 'Wraps', 'CellSize', 'CellPadding', 'FillDirectionMaxCells', 'StartCorner', 'PaddingTop', 'PaddingBottom', 'PaddingLeft', 'PaddingRight', 'AspectRatio', 'DominantAxis', 'MinSize', 'MaxSize', 'IgnoreGuiInset', 'Enabled', 'Scale', 'StudsOffset', 'Adornee', 'ZIndex']);
ENV.listeners.prop.push((inst, k) => {
  if (!LAYOUT_PROPS.has(k)) return;
  if (inst.isA('GuiBase2d') || inst.isA('UIBase')) layout.markDirty(inst);
});
ENV.listeners.attach.push((inst) => { if (inst.isA('GuiBase2d') || inst.isA('UIBase')) layout.markDirty(inst); });
ENV.listeners.detach.push((inst) => { if (inst.isA('GuiBase2d') || inst.isA('UIBase')) { const r = rootOf(inst); if (r) layout.markDirty(r); } });
// make Absolute* getters lay out on demand
for (const cn of ['GuiBase2d']) {
  const c = CLASSES.get(cn);
  const wrap = (name, f) => { const pd = c.props.get(name); const old = pd.get; pd.get = (i) => { layout.ensure(i); return f(i); }; };
  wrap('AbsolutePosition', (i) => { const a = i.abs || { x: 0, y: 0 }; return new D.Vector2(a.x, a.y); });
  wrap('AbsoluteSize', (i) => { const a = i.abs || { w: 0, h: 0 }; return new D.Vector2(a.w, a.h); });
}
for (const [cn, name, f] of [['UIListLayout', 'AbsoluteContentSize', (i) => { if (i.parent) layout.ensure(i.parent); return new D.Vector2(i.contentW || 0, i.contentH || 0); }], ['UIGridLayout', 'AbsoluteContentSize', (i) => { if (i.parent) layout.ensure(i.parent); return new D.Vector2(i.contentW || 0, i.contentH || 0); }]]) {
  const pd = CLASSES.get('UILayout').props.get('AbsoluteContentSize'); pd.get = f;
}
CLASSES.get('ScrollingFrame').props.get('AbsoluteCanvasSize').get = (i) => { layout.ensure(i); return new D.Vector2(i.canvasW || 0, i.canvasH || 0); };
CLASSES.get('ScrollingFrame').props.get('AbsoluteWindowSize').get = (i) => { layout.ensure(i); const a = i.abs || { w: 0, h: 0 }; return new D.Vector2(a.w, a.h); };
module.exports = { layout, layoutChildren };

};
defs["rbx/gui.js"]=function(module,exports,require){'use strict';
// DOM renderer for Roblox GUI (ScreenGui / GuiObjects / UI* modifiers), TextBox, purchase modal, output console, player list.
const C = require('../lua2js/core');
const { LuaTable, rtError, tostr, E } = C;
const { utf8dec, utf8enc } = require('../lua2js/lexer');
const D = require('./datatypes');
const I = require('./instance');
require('./layout');
const { ENV, CLASSES, Instance, noteUnsupported } = I;
const { layout } = ENV;
const { Vector2, v3 } = D;

const css = (c, a) => { const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255); return a === undefined || a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`; };
const FONT_CSS = {
  Legacy: 'Arial, sans-serif', Arial: 'Arial, sans-serif', ArialBold: 'Arial, sans-serif', SourceSans: '"Source Sans Pro","Segoe UI",system-ui,sans-serif', SourceSansBold: '"Source Sans Pro","Segoe UI",system-ui,sans-serif', SourceSansSemibold: '"Source Sans Pro","Segoe UI",system-ui,sans-serif', SourceSansLight: '"Source Sans Pro","Segoe UI",system-ui,sans-serif', SourceSansItalic: '"Source Sans Pro","Segoe UI",system-ui,sans-serif',
  Gotham: '"Gotham","Montserrat","Segoe UI",system-ui,sans-serif', GothamMedium: '"Gotham","Montserrat","Segoe UI",system-ui,sans-serif', GothamBold: '"Gotham","Montserrat","Segoe UI",system-ui,sans-serif', GothamBlack: '"Gotham","Montserrat","Segoe UI",system-ui,sans-serif', GothamSemibold: '"Gotham","Montserrat","Segoe UI",system-ui,sans-serif',
  Cartoon: '"Comic Sans MS","Chalkboard SE",cursive', Fantasy: 'Papyrus, fantasy', Arcade: '"Courier New", monospace', Code: '"Courier New", monospace', Highway: 'Impact, sans-serif', SciFi: '"Trebuchet MS", sans-serif', Bangers: 'Impact, sans-serif', FredokaOne: '"Arial Rounded MT Bold","Arial Black",sans-serif', Oswald: 'Impact, "Arial Narrow", sans-serif', Ubuntu: 'Ubuntu, sans-serif', Michroma: 'Verdana, sans-serif', Nunito: 'Nunito, "Segoe UI", sans-serif', Roboto: 'Roboto, "Segoe UI", sans-serif', RobotoMono: '"Roboto Mono","Courier New", monospace', BuilderSans: '"Segoe UI",system-ui,sans-serif', BuilderSansMedium: '"Segoe UI",system-ui,sans-serif', BuilderSansBold: '"Segoe UI",system-ui,sans-serif', BuilderSansExtraBold: '"Segoe UI",system-ui,sans-serif',
};
const BOLD = /Bold|Black|Semibold|Medium|ExtraBold|Bangers|Fredoka|Highway|Oswald/;
function fontInfo(fontItem) {
  const n = fontItem && fontItem.name || 'SourceSans';
  return { family: FONT_CSS[n] || FONT_CSS.SourceSans, weight: /Black|ExtraBold/.test(n) ? 900 : /Bold|Bangers|Fredoka|Highway|Oswald/.test(n) ? 700 : /Semibold|Medium/.test(n) ? 600 : 400, italic: /Italic/.test(n) };
}
// canvas-based text measurement
let mctx = null;
function measureText(text, size, fontItem, maxW, rich) {
  if (!mctx) { const cv = document.createElement('canvas'); mctx = cv.getContext('2d'); }
  const f = fontInfo(fontItem);
  mctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${size}px ${f.family}`;
  let t = utf8dec(text || '');
  if (rich) t = t.replace(/<[^>]+>/g, '');
  const lines = t.split('\n'); let w = 0, h = 0;
  for (const ln of lines) {
    const lw = mctx.measureText(ln).width;
    if (maxW < 1e8 && lw > maxW) {
      // wrap greedy by words
      const words = ln.split(' '); let cur = '', n = 1, mw = 0;
      for (const wd of words) { const test = cur ? cur + ' ' + wd : wd; if (mctx.measureText(test).width > maxW && cur) { mw = Math.max(mw, mctx.measureText(cur).width); cur = wd; n++; } else cur = test; }
      mw = Math.max(mw, mctx.measureText(cur).width); w = Math.max(w, mw); h += n * size * 1.15;
    } else { w = Math.max(w, lw); h += size * 1.15; }
  }
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

/* rich text (Roblox subset) -> safe HTML */
function richToHtml(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '', i = 0; const stack = [];
  const re = /<(\/?)(b|i|u|s|font|br|stroke|uppercase|smallcaps|mark)([^>]*)>|&(lt|gt|amp|quot|apos);/gi;
  let m, last = 0;
  src = utf8dec(src);
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index)); last = re.lastIndex;
    if (m[4]) { out += { lt: '&lt;', gt: '&gt;', amp: '&amp;', quot: '"', apos: "'" }[m[4].toLowerCase()]; continue; }
    const closing = !!m[1], tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (tag === 'br') { out += '<br>'; continue; }
    if (closing) { const t = stack.pop(); if (t) out += t; continue; }
    if (tag === 'b') { out += '<b>'; stack.push('</b>'); } else if (tag === 'i') { out += '<i>'; stack.push('</i>'); } else if (tag === 'u') { out += '<u>'; stack.push('</u>'); } else if (tag === 's') { out += '<s>'; stack.push('</s>'); }
    else if (tag === 'font') {
      let st = ''; const cm = /color\s*=\s*["']?(#[0-9a-fA-F]{3,8}|rgb\([^)]*\))["']?/.exec(attrs); if (cm) st += `color:${cm[1]};`;
      const sm = /size\s*=\s*["']?(\d+)/.exec(attrs); if (sm) st += `font-size:${sm[1]}px;`;
      out += `<span style="${st}">`; stack.push('</span>');
    } else if (tag === 'uppercase') { out += '<span style="text-transform:uppercase">'; stack.push('</span>'); }
    else { out += '<span>'; stack.push('</span>'); }
  }
  out += esc(src.slice(last)); while (stack.length) out += stack.pop();
  return out.replace(/\n/g, '<br>');
}

/* ------------------------------------------------------------------ renderer */
class GuiRenderer {
  constructor(opts) {
    this.root = opts.root; this.doc = this.root.ownerDocument;
    this.recs = new Map(); this.roots = new Map(); this.focused = null; this.renderDirty = new Set(); this.pending = new Set();
    this.layer = this.doc.createElement('div'); this.layer.className = 'r2w-guilayer'; this.root.appendChild(this.layer);
    this.layer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;z-index:2;';
    this.bbLayer = this.doc.createElement('div'); this.bbLayer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;z-index:1;'; this.root.insertBefore(this.bbLayer, this.layer);
    this.size();
    ENV.gui = this;
    ENV.textSizeFn = measureText;
    ENV.textSize = (text, size, font, w) => { const m = measureText(text, size, font, w, false); return new Vector2(m.w, m.h); };
    this.warnedImages = new Set();
    ENV.listeners.attach.push((i) => this.onAttach(i));
    ENV.listeners.detach.push((i) => this.onDetach(i));
    ENV.listeners.prop.push((i, k) => this.onProp(i, k));
    ENV.listeners.destroy.push((i) => this.onDetach(i));
    ENV.purchaseUI = (info, cb) => this.purchaseModal(info, cb);
  }
  size() {
    const r = this.root.getBoundingClientRect();
    layout.vw = Math.max(100, Math.round(r.width)); layout.vh = Math.max(100, Math.round(r.height));
    for (const root of this.roots.keys()) { root.layoutDirty = true; layout.dirty.add(root); }
    ENV.viewport = () => new Vector2(layout.vw, layout.vh);
  }
  isLocalRoot(r) {
    if (!r || !r.dm) return false;
    if (r.className === 'ScreenGui') { const pg = r.parent; return !!(pg && pg.className === 'PlayerGui' && pg.parent === ENV.localPlayer); }
    if (r.className === 'BillboardGui') { for (let p = r.parent; p; p = p.parent) { if (p === ENV.workspace) return true; if (p.className === 'PlayerGui') return p.parent === ENV.localPlayer; } }
    return false;
  }
  onAttach(i) {
    if (!i.isA('GuiBase2d') && !i.isA('UIBase')) return;
    const r = layout.rootOf(i);
    if (r && this.isLocalRoot(r)) { this.pending.add(r); r.layoutDirty = true; layout.dirty.add(r); }
    if (i.className === 'SurfaceGui' && !this.warnedImages.has('SurfaceGui')) { this.warnedImages.add('SurfaceGui'); noteUnsupported('SurfaceGui (not rendered)'); ENV.log('warn', 'r2w', '[unsupported] SurfaceGui is not rendered by the emulator'); }
  }
  onDetach(i) {
    const rec = this.recs.get(i);
    if (rec) { this.drop(i); }
    if (this.roots.has(i)) { const el = this.roots.get(i); el.remove(); this.roots.delete(i); if (this.bbs) this.bbs.delete(i); }
    if (i.isA('GuiBase2d')) for (const d of i.descendants()) { if (this.recs.has(d)) this.drop(d); }
    if (i.isA('GuiBase2d') || i.isA('UIBase')) { const r = i.parent && layout.rootOf(i.parent); if (r && this.roots.has(r)) { r.layoutDirty = true; layout.dirty.add(r); } }
  }
  onProp(i, k) {
    if (!(i.isA('GuiBase2d') || i.isA('UIBase'))) return;
    const r = layout.rootOf(i);
    if (r && this.roots.has(r)) this.renderDirty.add(i);
    if (r && !this.roots.has(r) && this.isLocalRoot(r)) { this.pending.add(r); }
    if (i.isA('UIBase') && i.parent) this.renderDirty.add(i.parent);
    if (k === 'Text' && this.focused === i) { /* from user typing */ }
  }
  drop(i) {
    const rec = this.recs.get(i); if (!rec) return;
    if (rec.el && rec.el.parentNode) rec.el.remove();
    this.recs.delete(i); this.renderDirty.delete(i);
  }
  /* create DOM element for a GuiObject */
  make(i) {
    const doc = this.doc; const el = doc.createElement('div');
    el.style.cssText = 'position:absolute;box-sizing:border-box;pointer-events:auto;user-select:none;-webkit-user-select:none;';
    el.dataset.n = i.props.Name;
    const rec = { inst: i, el, inner: el, text: null, img: null, input: null, last: {}, cls: i.className };
    if (i.className === 'ScrollingFrame') {
      el.style.overflow = 'auto';
      const inner = doc.createElement('div'); inner.style.cssText = 'position:absolute;left:0;top:0;'; el.appendChild(inner); rec.inner = inner;
      el.addEventListener('scroll', () => {
        const cp = i.props.CanvasPosition;
        if (Math.abs(cp.x - el.scrollLeft) > 0.5 || Math.abs(cp.y - el.scrollTop) > 0.5) { i.props.CanvasPosition = new Vector2(el.scrollLeft, el.scrollTop); i.changed('CanvasPosition'); this.shiftAbs(i, rec); }
      });
    }
    if (i.isA('TextLabel') || i.isA('TextButton') || i.isA('TextBox')) { const t = doc.createElement('div'); t.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;overflow:hidden;pointer-events:none;'; const s = doc.createElement('span'); s.style.cssText = 'display:block;width:100%;'; t.appendChild(s); el.appendChild(t); rec.text = t; rec.span = s; rec.textHost = t; }
    if (i.isA('TextBox')) { rec.input = null; }
    if (i.isA('ImageLabel') || i.isA('ImageButton')) { const im = doc.createElement('img'); im.draggable = false; im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;'; el.appendChild(im); rec.img = im; im.style.display = 'none'; }
    if (i.isA('GuiButton')) { el.style.cursor = 'pointer'; }
    this.wire(i, rec);
    this.recs.set(i, rec);
    return rec;
  }
  shiftAbs(i, rec) { i.layoutDirty = true; layout.dirty.add(i); const r = layout.rootOf(i); if (r) { r.layoutDirty = true; layout.dirty.add(r); } }
  wire(i, rec) {
    const el = rec.el; const S = this;
    const fire = (name, ...a) => { try { i.fireSignal(name, ...a); } catch (e) { /* */ } };
    const mk = (type, state, key, e) => new ENV.InputObject(D.EnumLib.lget('UserInputType').lget(type), D.EnumLib.lget('UserInputState').lget(state), D.EnumLib.lget('KeyCode').lget(key || 'Unknown'), v3(e.clientX - S.rootRect().left, e.clientY - S.rootRect().top, 0), v3(0, 0, 0));
    el.addEventListener('pointerdown', (e) => {
      if (i.props.Interactable === false) return;
      const type = e.pointerType === 'touch' ? 'Touch' : e.button === 2 ? 'MouseButton2' : e.button === 1 ? 'MouseButton3' : 'MouseButton1';
      fire('InputBegan', mk(type, 'Begin', null, e), false);
      if (i.isA('GuiButton')) { rec.down = true; fire(e.button === 2 ? 'MouseButton2Down' : 'MouseButton1Down', e.clientX - S.rootRect().left, e.clientY - S.rootRect().top); el.style.filter = 'brightness(0.85)'; }
      if (e.pointerType === 'touch') i.fireSignal('TouchTap');
    });
    el.addEventListener('pointerup', (e) => {
      if (i.props.Interactable === false) return;
      const type = e.pointerType === 'touch' ? 'Touch' : e.button === 2 ? 'MouseButton2' : 'MouseButton1';
      fire('InputEnded', mk(type, 'End', null, e), false);
      if (i.isA('GuiButton')) { rec.down = false; fire(e.button === 2 ? 'MouseButton2Up' : 'MouseButton1Up', e.clientX - S.rootRect().left, e.clientY - S.rootRect().top); el.style.filter = rec.hover && i.props.AutoButtonColor ? 'brightness(1.12)' : ''; }
    });
    el.addEventListener('click', (e) => {
      if (!i.isA('GuiButton') || i.props.Interactable === false) return;
      fire('MouseButton1Click'); fire('Activated', mk('MouseButton1', 'End', null, e), 1);
    });
    el.addEventListener('contextmenu', (e) => { if (i.isA('GuiButton')) { e.preventDefault(); fire('MouseButton2Click'); } });
    el.addEventListener('mouseenter', (e) => { rec.hover = true; if (i.isA('GuiButton') && i.props.AutoButtonColor) el.style.filter = 'brightness(1.12)'; fire('MouseEnter', e.clientX - S.rootRect().left, e.clientY - S.rootRect().top); fire('InputChanged', mk('MouseMovement', 'Change', null, e), false); });
    el.addEventListener('mouseleave', (e) => { rec.hover = false; if (i.isA('GuiButton')) el.style.filter = ''; fire('MouseLeave', e.clientX - S.rootRect().left, e.clientY - S.rootRect().top); });
    el.addEventListener('mousemove', (e) => { if (i.hasSignal('MouseMoved')) fire('MouseMoved', e.clientX - S.rootRect().left, e.clientY - S.rootRect().top); if (i.hasSignal('InputChanged')) fire('InputChanged', mk('MouseMovement', 'Change', null, e), false); });
    el.addEventListener('wheel', (e) => { if (e.deltaY < 0) fire('MouseWheelForward'); else fire('MouseWheelBackward'); }, { passive: true });
  }
  rootRect() { return this._rr || (this._rr = this.root.getBoundingClientRect()); }
  /* sync */
  flush() {
    this._rr = null;
    for (const r of this.pending) { if (r.dm && this.isLocalRoot(r) && !this.roots.has(r)) this.addRoot(r); }
    this.pending.clear();
    if (!layout.dirty.size && !this.renderDirty.size) return;
    const roots = Array.from(layout.dirty);
    for (const r of roots) {
      if (!this.roots.has(r)) { layout.dirty.delete(r); continue; }
      layout.run(r);
      this.syncRoot(r);
    }
    if (this.renderDirty.size) {
      for (const i of this.renderDirty) { const rec = this.recs.get(i); if (rec) this.style(i, rec); }
      this.renderDirty.clear();
    }
  }
  addRoot(r) {
    const div = this.doc.createElement('div'); div.style.cssText = 'position:absolute;pointer-events:none;';
    div.dataset.gui = r.props.Name;
    if (r.className === 'BillboardGui') { this.bbLayer.appendChild(div); (this.bbs || (this.bbs = new Map())).set(r, { div, w: 100, h: 100 }); }
    else this.layer.appendChild(div);
    this.roots.set(r, div);
    r.layoutDirty = true; layout.dirty.add(r);
  }
  syncRoot(r) {
    const div = this.roots.get(r); const a = r.abs;
    if (r.className === 'BillboardGui') {
      const rec = this.bbs.get(r); rec.w = a.w; rec.h = a.h; div.style.width = a.w + 'px'; div.style.height = a.h + 'px'; div.style.left = '0px'; div.style.top = '0px'; this.syncChildren(r, div); return;
    }
    const en = r.props.Enabled !== false;
    div.style.display = en ? 'block' : 'none';
    div.style.left = a.x + 'px'; div.style.top = a.y + 'px'; div.style.width = a.w + 'px'; div.style.height = a.h + 'px';
    div.style.zIndex = String(r.props.DisplayOrder || 0);
    this.syncChildren(r, div);
  }
  syncChildren(parent, host) {
    const kids = parent.children.filter((c) => c.isA('GuiObject'));
    let ref = null;
    // ensure order = child order
    for (let idx = 0; idx < kids.length; idx++) {
      const k = kids[idx]; let rec = this.recs.get(k);
      if (!rec) rec = this.make(k);
      if (rec.el.parentNode !== host) host.appendChild(rec.el);
      else if (host.children[idx + (host === rec.inner ? 0 : 0)] !== rec.el && false) host.appendChild(rec.el);
      this.style(k, rec);
      this.syncChildren(k, rec.inner);
    }
    // remove stale
    for (const ch of Array.from(host.children)) { /* keep text/img nodes */ }
  }
  style(i, rec) {
    const el = rec.el, p = i.props, a = i.abs; if (!a) return;
    const rel = i.rel || { x: 0, y: 0 };
    const st = el.style; const L = rec.last;
    const set = (k, v) => { if (L[k] !== v) { L[k] = v; st[k] = v; } };
    set('left', rel.x + 'px'); set('top', rel.y + 'px'); set('width', a.w + 'px'); set('height', a.h + 'px');
    set('display', p.Visible === false ? 'none' : (rec.input && false ? 'block' : 'block'));
    set('zIndex', String(p.ZIndex));
    const clip = p.ClipsDescendants || i.className === 'ScrollingFrame';
    if (i.className !== 'ScrollingFrame') set('overflow', clip ? 'hidden' : 'visible');
    // modifiers
    let radius = null, stroke = null, grad = null, scale = 1;
    for (const c of i.children) {
      if (c.className === 'UICorner') radius = c.props.CornerRadius;
      else if (c.className === 'UIStroke' && c.props.Enabled !== false) stroke = c.props;
      else if (c.className === 'UIGradient' && c.props.Enabled !== false) grad = c.props;
      else if (c.className === 'UIScale') scale = c.props.Scale;
    }
    const rpx = radius ? Math.min(radius.s * Math.min(a.w, a.h) + radius.o, Math.min(a.w, a.h) / 2 + 0.01 * 0 + 9999) : 0;
    set('borderRadius', rpx ? rpx + 'px' : '0px');
    const isText = i.isA('TextLabel') || i.isA('TextButton') || i.isA('TextBox');
    let bg = p.BackgroundColor3 ? css(p.BackgroundColor3, 1 - (p.BackgroundTransparency || 0)) : 'transparent';
    if ((p.BackgroundTransparency || 0) >= 1) bg = 'transparent';
    if (i.className === 'CanvasGroup' || i.isA('Frame') && i.className === 'ViewportFrame') bg = bg;
    let bgImage = 'none';
    if (grad && grad.Color) bgImage = gradientCss(grad, p);
    set('backgroundColor', bg); set('backgroundImage', bgImage);
    // border / stroke
    const shadows = [];
    const bs = p.BorderSizePixel || 0;
    if (bs > 0 && (p.BackgroundTransparency || 0) < 1 || bs > 0 && !isText && i.className !== 'ImageLabel') shadows.push(`0 0 0 ${bs}px ${css(p.BorderColor3, 1)}`);
    if (stroke && !(isText && stroke.ApplyStrokeMode.name === 'Contextual')) { const th = stroke.Thickness; shadows.length = 0; shadows.push(`0 0 0 ${th}px ${css(stroke.Color, 1 - stroke.Transparency)}`); }
    set('boxShadow', shadows.join(','));
    if (p.Rotation) set('transform', `rotate(${p.Rotation}deg)${scale !== 1 ? ` scale(${scale})` : ''}`); else set('transform', scale !== 1 ? `scale(${scale})` : 'none');
    set('transformOrigin', `${(p.AnchorPoint ? p.AnchorPoint.x * 100 : 0)}% ${(p.AnchorPoint ? p.AnchorPoint.y * 100 : 0)}%`);
    if (i.isA('GuiButton') || i.isA('TextBox')) set('cursor', i.isA('GuiButton') ? 'pointer' : 'text');
    if (i.className === 'ScrollingFrame') this.styleScroll(i, rec);
    if (isText) this.styleText(i, rec, stroke, rpx);
    if (i.isA('ImageLabel') || i.isA('ImageButton')) this.styleImage(i, rec);
    if (i.className === 'ViewportFrame' || i.className === 'VideoFrame') { if (!this.warnedImages.has(i.className)) { this.warnedImages.add(i.className); noteUnsupported(i.className + ' (placeholder only)'); ENV.log('warn', 'r2w', '[unsupported] ' + i.className + ' is rendered as a placeholder'); } }
    if (i.className === 'CanvasGroup') set('opacity', String(1 - (p.GroupTransparency || 0)));
    const act = !!(p.Active || i.isA('GuiButton') || i.isA('TextBox') || i.className === 'ScrollingFrame');
    const root = layout.rootOf(i); const inBB = root && root.className === 'BillboardGui';
    const solid = (p.BackgroundTransparency || 0) < 1 || (isText && p.Text) || (i.isA('ImageLabel') && p.Image) || ['InputBegan', 'MouseEnter', 'InputEnded', 'InputChanged'].some((n) => i.hasSignal(n));
    const pe = act || (!inBB && solid) ? 'auto' : 'none';
    set('pointerEvents', pe);
    el.dataset.active = (pe === 'auto' && !inBB) || act ? '1' : '';
  }
  styleScroll(i, rec) {
    const p = i.props, el = rec.el, st = el.style;
    const en = p.ScrollingEnabled !== false; const th = p.ScrollBarThickness;
    const dir = p.ScrollingDirection.name;
    st.overflowY = en && dir !== 'X' ? ((i.canvasH || 0) > i.abs.h + 1 ? 'auto' : 'hidden') : 'hidden';
    st.overflowX = en && dir !== 'Y' ? ((i.canvasW || 0) > i.abs.w + 1 ? 'auto' : 'hidden') : 'hidden';
    el.style.scrollbarWidth = th <= 0 ? 'none' : 'thin';
    el.style.scrollbarColor = `${css(p.ScrollBarImageColor3, 1 - (p.ScrollBarImageTransparency || 0))} transparent`;
    rec.inner.style.width = (i.canvasW || i.abs.w) + 'px'; rec.inner.style.height = (i.canvasH || i.abs.h) + 'px';
    const cp = p.CanvasPosition;
    if (Math.abs(el.scrollTop - cp.y) > 0.5 && (rec.lastCP !== cp)) { el.scrollTop = cp.y; }
    if (Math.abs(el.scrollLeft - cp.x) > 0.5 && (rec.lastCP !== cp)) { el.scrollLeft = cp.x; }
    rec.lastCP = cp;
  }
  styleText(i, rec, stroke, rpx) {
    const p = i.props, a = i.abs; const L = rec.last;
    const f = fontInfo(p.Font);
    let size = p.TextSize || 14;
    let text = p.Text || '';
    const pad = (() => { for (const c of i.children) if (c.className === 'UIPadding') return [c.props.PaddingLeft.s * a.w + c.props.PaddingLeft.o, c.props.PaddingTop.s * a.h + c.props.PaddingTop.o, c.props.PaddingRight.s * a.w + c.props.PaddingRight.o, c.props.PaddingBottom.s * a.h + c.props.PaddingBottom.o]; return [0, 0, 0, 0]; })();
    for (const c of i.children) if (c.className === 'UITextSizeConstraint') { /* applied below */ }
    if (p.TextScaled) {
      const aw = a.w - pad[0] - pad[2], ah = a.h - pad[1] - pad[3];
      const m = measureText(text, 100, p.Font, p.TextWrapped ? 1e9 : 1e9, p.RichText);
      size = Math.max(1, Math.min(100 * ah / Math.max(1, m.h), 100 * aw / Math.max(1, m.w), 100));
      for (const c of i.children) if (c.className === 'UITextSizeConstraint') size = Math.min(Math.max(size, c.props.MinTextSize), c.props.MaxTextSize);
    }
    const host = rec.textHost, span = rec.span;
    const set = (k, v) => { if (L['t' + k] !== v) { L['t' + k] = v; host.style[k] = v; } };
    const sset = (k, v) => { if (L['s' + k] !== v) { L['s' + k] = v; span.style[k] = v; } };
    set('padding', `${pad[1]}px ${pad[2]}px ${pad[3]}px ${pad[0]}px`);
    const xa = p.TextXAlignment.name, ya = p.TextYAlignment.name;
    set('alignItems', ya === 'Top' ? 'flex-start' : ya === 'Bottom' ? 'flex-end' : 'center');
    sset('textAlign', xa === 'Left' ? 'left' : xa === 'Right' ? 'right' : 'center');
    sset('fontFamily', f.family); sset('fontWeight', String(f.weight)); sset('fontStyle', f.italic ? 'italic' : 'normal');
    sset('fontSize', size + 'px'); sset('lineHeight', (size * 1.15) + 'px');
    sset('color', css(p.TextColor3, 1 - (p.TextTransparency || 0)));
    sset('whiteSpace', p.TextWrapped || p.TextScaled && false ? 'pre-wrap' : 'pre');
    sset('overflowWrap', p.TextWrapped ? 'anywhere' : 'normal');
    sset('textOverflow', p.TextTruncate && p.TextTruncate.name === 'AtEnd' ? 'ellipsis' : 'clip');
    const shadows = [];
    if ((p.TextStrokeTransparency === undefined ? 1 : p.TextStrokeTransparency) < 1) { const sc = css(p.TextStrokeColor3, 1 - p.TextStrokeTransparency); shadows.push(`1px 0 ${sc}`, `-1px 0 ${sc}`, `0 1px ${sc}`, `0 -1px ${sc}`); }
    if (stroke && stroke.ApplyStrokeMode.name === 'Contextual') { const sc = css(stroke.Color, 1 - stroke.Transparency), t = Math.max(1, stroke.Thickness); shadows.push(`${t}px 0 ${sc}`, `-${t}px 0 ${sc}`, `0 ${t}px ${sc}`, `0 -${t}px ${sc}`, `${t}px ${t}px ${sc}`, `-${t}px -${t}px ${sc}`, `${t}px -${t}px ${sc}`, `-${t}px ${t}px ${sc}`); }
    sset('textShadow', shadows.join(','));
    if (i.isA('TextBox')) { this.styleTextBox(i, rec, size, f); return; }
    const key = (p.RichText ? 'R' : 'T') + text;
    if (L.text !== key) { L.text = key; if (p.RichText) span.innerHTML = richToHtml(text); else span.textContent = utf8dec(text); }
  }
  styleTextBox(i, rec, size, f) {
    const p = i.props, a = i.abs;
    if (!rec.input) {
      const inp = this.doc.createElement(p.MultiLine ? 'textarea' : 'input'); if (!p.MultiLine) inp.type = 'text';
      inp.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;background:transparent;border:0;outline:0;margin:0;padding:0 4px;';
      rec.el.appendChild(inp); rec.input = inp;
      inp.addEventListener('focus', () => { this.focused = i; ENV.input.focusedTextBox = i; if (p.ClearTextOnFocus) { inp.value = ''; i.lset('Text', ''); } i.fireSignal('Focused'); ENV.svc('UserInputService').fireSignal('TextBoxFocused', i); });
      inp.addEventListener('blur', () => { const was = this.focused === i; if (was) { this.focused = null; ENV.input.focusedTextBox = null; } const enter = !!rec.enterPressed; rec.enterPressed = false; i.fireSignal('FocusLost', enter, new ENV.InputObject(D.EnumLib.lget('UserInputType').lget('Keyboard'), D.EnumLib.lget('UserInputState').lget('End'), D.EnumLib.lget('KeyCode').lget(enter ? 'Return' : 'Unknown'))); ENV.svc('UserInputService').fireSignal('TextBoxFocusReleased', i); });
      inp.addEventListener('input', () => { i.props.Text = utf8enc(inp.value); i.changed('Text'); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !p.MultiLine) { rec.enterPressed = true; i.fireSignal('ReturnPressed'); inp.blur(); } e.stopPropagation(); });
      inp.addEventListener('keyup', (e) => e.stopPropagation());
    }
    const inp = rec.input; const st = inp.style;
    st.fontFamily = f.family; st.fontSize = size + 'px'; st.fontWeight = String(f.weight); st.color = css(p.TextColor3, 1 - (p.TextTransparency || 0));
    st.textAlign = p.TextXAlignment.name === 'Left' ? 'left' : p.TextXAlignment.name === 'Right' ? 'right' : 'center';
    inp.placeholder = utf8dec(p.PlaceholderText || '');
    inp.readOnly = p.TextEditable === false;
    const want = utf8dec(p.Text || '');
    if (inp.value !== want && this.focused !== i) inp.value = want;
    else if (inp.value !== want && this.focused === i && utf8enc(inp.value) !== p.Text) inp.value = want;
    if (rec.span) rec.span.textContent = '';
  }
  styleImage(i, rec) {
    const p = i.props, im = rec.img; const src = p.Image || '';
    let url = null;
    if (/^(https?:|data:|\.\/|assets\/|blob:)/.test(src)) url = src;
    else if (src && !this.warnedImages.has(src)) { this.warnedImages.add(src); noteUnsupported('ImageLabel.Image ' + (src.startsWith('rbxassetid') ? 'rbxassetid://… (Roblox assets are not available offline)' : src)); ENV.log('warn', 'r2w', '[unsupported] image ' + src + ' cannot be loaded in the browser (shown as a placeholder)'); }
    if (url && rec.last.img !== url) { rec.last.img = url; im.src = url; }
    im.style.display = url ? 'block' : 'none';
    if (url) { im.style.opacity = String(1 - (p.ImageTransparency || 0)); im.style.objectFit = p.ScaleType && p.ScaleType.name === 'Fit' ? 'contain' : p.ScaleType && p.ScaleType.name === 'Crop' ? 'cover' : 'fill'; }
  }
  addActionButton(name) { /* touch action buttons are not rendered */ noteUnsupported('ContextActionService touch buttons'); }
  focus(i) { const rec = this.recs.get(i); if (rec && rec.input) rec.input.focus(); }
  blur(i) { const rec = this.recs.get(i); if (rec && rec.input) rec.input.blur(); }
  /* purchase modal (demo) */
  purchaseModal(info, cb) {
    const d = this.doc; const ov = d.createElement('div');
    ov.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100000;pointer-events:auto;font-family:system-ui,Segoe UI,sans-serif;';
    const box = d.createElement('div');
    box.style.cssText = 'background:#232527;color:#fff;border-radius:12px;padding:20px 24px;width:min(380px,90%);box-shadow:0 10px 40px #000a;text-align:center;border:1px solid #444;';
    const kind = { gamepass: 'Геймпасс', product: 'Покупка', asset: 'Предмет', premium: 'Roblox Premium' }[info.kind] || 'Покупка';
    const price = info.price ? `<div style="font-size:22px;margin:10px 0;color:#00b06f;font-weight:700">R$ ${info.price}</div>` : '';
    box.innerHTML = `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f5a623;font-weight:700">Демо · деньги не списываются</div><div style="font-size:13px;color:#aaa;margin-top:8px">${kind}</div><div style="font-size:19px;font-weight:700;margin:4px 0">${esc(utf8dec(info.name || ''))}</div>${info.description ? `<div style="font-size:13px;color:#bbb">${esc(utf8dec(info.description))}</div>` : ''}${price}`;
    const row = d.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:14px';
    const mk = (t, bg, fn, id) => { const b = d.createElement('button'); b.textContent = t; b.id = id; b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer;`; b.onclick = () => { ov.remove(); fn(); }; return b; };
    row.appendChild(mk('Отмена', '#555', () => cb(false), 'r2w-buy-cancel')); row.appendChild(mk('Купить (демо)', '#00a35c', () => cb(true), 'r2w-buy-ok'));
    box.appendChild(row); ov.appendChild(box); this.root.appendChild(ov);
  }
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function gradientCss(g, p) {
  const stops = [];
  const seq = g.Color; const tr = g.Transparency;
  for (const k of seq.kps) { const c = k.value; stops.push(`${css(c, 1)} ${(k.time * 100).toFixed(1)}%`); }
  const ang = 90 + (g.Rotation || 0);
  return `linear-gradient(${ang}deg, ${stops.join(',')})`;
}
module.exports = { GuiRenderer, measureText, richToHtml, fontInfo, css };

};
defs["rbx/world3d.js"]=function(module,exports,require){'use strict';
// three.js renderer: parts, lighting, orbit camera, character labels, billboards, controls (keyboard / mouse / touch joystick)
const D = require('./datatypes');
const I = require('./instance');
const { ENV, CLASSES } = I;
const { v3, CFrame, Vector3, Vector2 } = D;
const { utf8dec } = require('../lua2js/lexer');
const physics = require('./physics');

const MATS = {
  Plastic: [0.5, 0], SmoothPlastic: [0.35, 0], Neon: [0.4, 0], Glass: [0.1, 0.1], Metal: [0.35, 0.7], DiamondPlate: [0.35, 0.7], CorrodedMetal: [0.6, 0.5], Foil: [0.2, 0.9], Wood: [0.8, 0], WoodPlanks: [0.8, 0], Grass: [1, 0], Sand: [1, 0], Concrete: [0.95, 0], Brick: [0.9, 0], Cobblestone: [0.95, 0], Slate: [0.85, 0], Marble: [0.3, 0], Granite: [0.6, 0], Pebble: [0.95, 0], Ice: [0.1, 0.1], Fabric: [1, 0], Rock: [0.95, 0], Basalt: [0.95, 0], Snow: [0.9, 0], Mud: [1, 0], Ground: [1, 0], LeafyGrass: [1, 0], Salt: [0.9, 0], Limestone: [0.9, 0], Asphalt: [0.9, 0], Pavement: [0.9, 0], ForceField: [0.3, 0], Air: [1, 0],
};
function mkWedge(THREE) {
  // right-angle wedge: slope going up toward -Z? Roblox WedgePart: sloped face from the top-back to the bottom-front
  const g = new THREE.BufferGeometry();
  const v = [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5];
  // vertices: 0..3 bottom, 4,5 top-back edge
  const idx = [0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
  const pos = []; for (const i of idx) pos.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

class World3D {
  constructor(opts) {
    const THREE = this.THREE = opts.THREE || window.THREE;
    this.container = opts.container;
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(100, r.width); this.h = Math.max(100, r.height);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.w, this.h);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement; this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;';
    this.container.insertBefore(this.canvas, this.container.firstChild);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x87ceeb);
    this.camera = new THREE.PerspectiveCamera(70, this.w / this.h, 0.1, 2000);
    this.amb = new THREE.HemisphereLight(0xcfe8ff, 0x6b5b4b, 0.9); this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9); this.sun.position.set(60, 100, 40); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400; this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.meshes = new Map(); this.dirty = new Set(); this.geoms = {}; this.matCache = new Map();
    this.geoms.box = new THREE.BoxGeometry(1, 1, 1); this.geoms.sphere = new THREE.SphereGeometry(0.5, 20, 14);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); cyl.rotateZ(Math.PI / 2); this.geoms.cyl = cyl; this.geoms.wedge = mkWedge(THREE);
    this.cam = ENV.cam = { yaw: 0.0, pitch: 0.38, dist: 14, focus: new THREE.Vector3(0, 5, 0), minDist: 0.5, maxDist: 128, shake: 0 };
    this.labels = new Map(); this.labelLayer = document.createElement('div'); this.labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;'; this.container.appendChild(this.labelLayer);
    this.lights = new Map(); this.warned = new Set();
    this.faceTex = null;
    ENV.project = (p) => this.project(p);
    ENV.screenRay = (x, y) => this.screenRay(x, y);
    ENV.pxPerStud = (d) => this.h / (2 * Math.tan(this.camera.fov * Math.PI / 360) * Math.max(d, 0.1));
    ENV.listeners.attach.push((i) => this.onAttach(i));
    ENV.listeners.detach.push((i) => this.onDetach(i));
    ENV.listeners.destroy.push((i) => this.onDetach(i));
    ENV.listeners.prop.push((i, k) => this.onProp(i, k));
    this.setupControls();
    window.addEventListener('resize', () => this.resize());
    this.lastClock = null;
  }
  inWs(i) { for (let p = i; p; p = p.parent) if (p === ENV.workspace) return true; return false; }
  onAttach(i) {
    if (i.isA('BasePart') && i.className !== 'Terrain' && this.inWs(i)) { this.dirty.add(i); }
    else if (i.isA('Light') && this.inWs(i)) this.lights.set(i, null);
    else if (i.className === 'ParticleEmitter' || i.className === 'Beam' || i.className === 'Trail' || i.className === 'Decal' || i.className === 'Texture' || i.className === 'SpecialMesh' || i.className === 'Highlight' || i.className === 'Sky') {
      const key = i.className; if (!this.warned.has(key)) { this.warned.add(key); I.noteUnsupported(key + ' (not rendered)'); ENV.log('warn', 'r2w', `[unsupported] ${key} is accepted but not rendered by the 3D emulator`); }
    }
  }
  onDetach(i) {
    const m = this.meshes.get(i);
    if (m) { this.scene.remove(m.mesh); if (m.mesh.material && m.mesh.material.dispose && !m.shared) m.mesh.material.dispose(); this.meshes.delete(i); }
    this.dirty.delete(i);
    if (this.lights.has(i)) { const l = this.lights.get(i); if (l) this.scene.remove(l); this.lights.delete(i); }
  }
  onProp(i, k) {
    if (i.isA('BasePart')) { if (this.meshes.has(i) || this.dirty.has(i) || this.inWs(i)) this.dirty.add(i); }
    else if (i.isA('Light')) this.lightDirty = true;
    else if (i.className === 'Lighting' || i.className === 'Atmosphere') this.envDirty = true;
  }
  material(part) {
    const THREE = this.THREE, p = part.props;
    const c = p.Color; const mat = p.Material ? p.Material.name : 'Plastic';
    const key = `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}|${mat}|${p.Transparency}|${p.Reflectance}`;
    let m = this.matCache.get(key);
    if (m) return m;
    const [rough, metal] = MATS[mat] || MATS.Plastic;
    const color = new THREE.Color(c.r, c.g, c.b);
    if (mat === 'Neon') m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0 });
    else m = new THREE.MeshStandardMaterial({ color, roughness: Math.max(0, rough - p.Reflectance * 0.4), metalness: Math.min(1, metal + p.Reflectance * 0.5) });
    if (p.Transparency > 0 || mat === 'Glass' || mat === 'ForceField' || mat === 'Ice') { m.transparent = true; m.opacity = mat === 'Glass' && p.Transparency === 0 ? 0.45 : Math.max(0.02, 1 - p.Transparency); m.depthWrite = p.Transparency < 0.5; }
    this.matCache.set(key, m);
    return m;
  }
  geomFor(part) {
    const sh = part.props.Shape;
    if (part.className === 'WedgePart') return this.geoms.wedge;
    if (part.className === 'MeshPart' || part.className === 'UnionOperation') { if (!this.warned.has('mesh')) { this.warned.add('mesh'); I.noteUnsupported('MeshPart/UnionOperation geometry (drawn as a box)'); ENV.log('warn', 'r2w', '[unsupported] MeshPart/UnionOperation geometry is drawn as a box'); } return this.geoms.box; }
    if (sh && sh.name === 'Ball') return this.geoms.sphere;
    if (sh && sh.name === 'Cylinder') return this.geoms.cyl;
    return this.geoms.box;
  }
  syncPart(part) {
    const THREE = this.THREE;
    let m = this.meshes.get(part);
    if (!part.dm || !this.inWs(part)) { if (m) { this.scene.remove(m.mesh); this.meshes.delete(part); } return; }
    const p = part.props;
    if (p.Transparency >= 1) { if (m) { m.mesh.visible = false; } if (!m) return; }
    const geo = this.geomFor(part);
    if (!m) {
      const mesh = new THREE.Mesh(geo, this.material(part)); mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = part;
      this.scene.add(mesh); m = { mesh, key: null, geo }; this.meshes.set(part, m);
      if (part.name === 'Head' || part.props.Name === 'Head') this.addFace(mesh);
    }
    if (m.geo !== geo) { m.mesh.geometry = geo; m.geo = geo; }
    const key = `${p.Color.r},${p.Color.g},${p.Color.b},${p.Material && p.Material.name},${p.Transparency},${p.Reflectance}`;
    if (m.key !== key) { m.key = key; m.mesh.material = this.material(part); m.mesh.visible = p.Transparency < 1; m.mesh.castShadow = p.CastShadow !== false && p.Transparency < 0.5; }
    const cf = p.CFrame, s = p.Size, r = cf.r;
    m.mesh.matrix.set(r[0] * s.x, r[1] * s.y, r[2] * s.z, cf.x, r[3] * s.x, r[4] * s.y, r[5] * s.z, cf.y, r[6] * s.x, r[7] * s.y, r[8] * s.z, cf.z, 0, 0, 0, 1);
    m.mesh.matrixWorldNeedsUpdate = true;
    m.mesh.updateMatrixWorld(true);
  }
  addFace(mesh) {
    const THREE = this.THREE;
    if (!this.faceTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
      g.fillStyle = '#f5cd30'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#222'; g.beginPath(); g.arc(22, 26, 5, 0, 7); g.arc(42, 26, 5, 0, 7); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 3; g.beginPath(); g.arc(32, 36, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      this.faceTex = new THREE.CanvasTexture(cv);
    }
    const base = mesh.material; const faceMat = new THREE.MeshStandardMaterial({ map: this.faceTex, roughness: 0.5 });
    const mats = [base, base, base, base, base, base]; mats[5] = faceMat; // +Z face? Roblox front is -Z (index 5 is -Z in three BoxGeometry)
    mesh.material = mats; mesh.userData.face = true;
  }
  resize() {
    const r = this.container.getBoundingClientRect(); this.w = Math.max(100, r.width); this.h = Math.max(100, r.height);
    this.renderer.setSize(this.w, this.h); this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
    if (ENV.gui) { ENV.gui.size(); }
  }
  /* ---------- environment (Lighting) ---------- */
  syncEnv() {
    const THREE = this.THREE; const L = ENV.svcOrNull('Lighting'); if (!L) return;
    const p = L.props; const clock = p.ClockTime;
    const h = ((clock % 24) + 24) % 24;
    const sunAng = (h - 6) / 12 * Math.PI; // 6h sunrise, 18h sunset
    const day = Math.max(0, Math.sin(sunAng));
    const sunDir = new THREE.Vector3(Math.cos(sunAng) * 0.6, Math.max(0.1, Math.sin(sunAng)), 0.5).normalize();
    const mix = (a, b, t) => a + (b - a) * t;
    const dayCol = new THREE.Color(0x87ceeb), nightCol = new THREE.Color(0x0b1026), dusk = new THREE.Color(0xff9a5a);
    let sky = nightCol.clone().lerp(dayCol, Math.min(1, day * 1.6));
    if (day > 0 && day < 0.25) sky.lerp(dusk, (0.25 - day) * 1.5);
    this.scene.background = sky;
    const atm = ENV.svcOrNull('Lighting') && ENV.svcOrNull('Lighting').children.find((c) => c.className === 'Atmosphere');
    const fogEnd = p.FogEnd && p.FogEnd < 90000 ? p.FogEnd : (atm ? 600 / (0.2 + atm.props.Density) : 700);
    this.scene.fog = new THREE.Fog(p.FogEnd < 90000 ? new THREE.Color(p.FogColor.r, p.FogColor.g, p.FogColor.b) : sky.clone(), p.FogStart || 60, fogEnd);
    const br = p.Brightness / 2;
    this.sun.intensity = 0.15 + day * 0.95 * br + 0.0;
    this.sun.color.setRGB(1, 0.92 + day * 0.08, 0.8 + day * 0.2);
    this.amb.intensity = 0.25 + day * 0.65;
    this.amb.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.6);
    this.sunDir = sunDir;
    if (day <= 0.02) { this.sun.intensity = 0.18; this.sun.color.setRGB(0.5, 0.6, 1); this.sunDir = new THREE.Vector3(-0.4, 0.8, 0.3).normalize(); this.amb.intensity = 0.35; this.amb.color.setRGB(0.35, 0.4, 0.7); }
    this.envDirty = false; this.lastClock = clock;
  }
  syncLights() {
    const THREE = this.THREE; let n = 0;
    for (const [inst, l] of this.lights) {
      if (n >= 10) break;
      let light = l;
      if (!light) {
        if (inst.className === 'SpotLight') light = new THREE.SpotLight(0xffffff, 1, 40, Math.PI / 4); else light = new THREE.PointLight(0xffffff, 1, 20, 2);
        this.scene.add(light); this.lights.set(inst, light);
      }
      const pt = inst.parent && inst.parent.isA('BasePart') ? inst.parent : null;
      light.visible = !!pt && inst.props.Enabled !== false;
      if (!pt) continue;
      light.color.setRGB(inst.props.Color.r, inst.props.Color.g, inst.props.Color.b);
      light.intensity = inst.props.Brightness * 1.5; light.distance = inst.props.Range * 1.5;
      const c = pt.props.CFrame; light.position.set(c.x, c.y, c.z); n++;
    }
  }
  /* ---------- camera ---------- */
  project(p) {
    const THREE = this.THREE; const v = new THREE.Vector3(p.x, p.y, p.z);
    const cam = this.camera; cam.updateMatrixWorld(); const d = v.distanceTo(cam.position);
    v.project(cam);
    const vis = v.z < 1 && v.z > -1;
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, d, vis];
  }
  screenRay(x, y) {
    const THREE = this.THREE; const cam = this.camera; cam.updateMatrixWorld();
    const nx = (x / this.w) * 2 - 1, ny = -(y / this.h) * 2 + 1;
    const p = new THREE.Vector3(nx, ny, 0.5).unproject(cam);
    const o = cam.position; const d = p.sub(o).normalize();
    return new D.Ray(v3(o.x, o.y, o.z), v3(d.x, d.y, d.z));
  }
  updateCamera(dt) {
    const THREE = this.THREE; const cam = this.cam; const rc = ENV.workspace.props.CurrentCamera;
    const pl = ENV.localPlayer; const ch = pl && pl.props.Character; const hrp = ch && ch.findChild('HumanoidRootPart');
    if (rc && rc.props.CameraType && rc.props.CameraType.name === 'Scriptable') {
      const cf = rc.props.CFrame; const r = cf.r;
      this.camera.position.set(cf.x, cf.y, cf.z);
      const m = new THREE.Matrix4().set(r[0], r[1], r[2], cf.x, r[3], r[4], r[5], cf.y, r[6], r[7], r[8], cf.z, 0, 0, 0, 1);
      this.camera.quaternion.setFromRotationMatrix(m);
      this.camera.fov = rc.props.FieldOfView; this.camera.updateProjectionMatrix();
      return;
    }
    if (hrp) { const c = hrp.props.CFrame; const t = new THREE.Vector3(c.x, c.y + 1.5, c.z); cam.focus.lerp(t, Math.min(1, dt * 16)); if (cam.focus.distanceTo(t) > 30) cam.focus.copy(t); }
    const hum = ch && ch.findChild('Humanoid');
    const cy = Math.cos(cam.pitch), sy = Math.sin(cam.pitch);
    let dist = cam.dist;
    // camera collision
    const dir = [Math.sin(cam.yaw) * cy, sy, Math.cos(cam.yaw) * cy];
    if (hrp && dist > 1) {
      const hit = physics.world.rayRaw([cam.focus.x, cam.focus.y, cam.focus.z], dir, dist + 0.5, (i) => i.charPart || !i.props.CanCollide || i.props.Transparency > 0.6);
      if (hit) dist = Math.max(0.8, hit.t - 0.4);
    }
    if (dist < 1.2 && hrp) { /* first person: hide character */ this.firstPerson = true; } else this.firstPerson = false;
    cam.cur = dist;
    this.camera.position.set(cam.focus.x + dir[0] * dist, cam.focus.y + dir[1] * dist, cam.focus.z + dir[2] * dist);
    this.camera.lookAt(cam.focus.x, cam.focus.y, cam.focus.z);
    if (rc) { rc.props.FieldOfView === undefined || (this.camera.fov = rc.props.FieldOfView); this.camera.updateProjectionMatrix(); }
    if (this.firstPerson) { this.camera.position.set(cam.focus.x, cam.focus.y, cam.focus.z); this.camera.lookAt(cam.focus.x - dir[0], cam.focus.y - dir[1], cam.focus.z - dir[2]); }
    // publish to workspace.CurrentCamera
    if (rc) {
      const q = this.camera.matrixWorld.elements; this.camera.updateMatrixWorld();
      const e = this.camera.matrixWorld.elements;
      const cf = new CFrame(e[12], e[13], e[14], [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]]);
      rc.props.CFrame = cf; rc.props.Focus = new CFrame(cam.focus.x, cam.focus.y, cam.focus.z);
    }
  }
  /* ---------- labels: character names, health bars, billboards ---------- */
  updateLabels(dt) {
    const THREE = this.THREE;
    // humanoid name tags
    const seen = new Set();
    for (const h of physics.world.humanoids) {
      const ctl = h.ctl; if (!ctl || h.props.DisplayDistanceType.name === 'None') continue;
      const m = ctl.m; const isLocal = ENV.localPlayer && m === ENV.localPlayer.props.Character;
      if (isLocal) continue;
      const head = m.findChild('Head') || ctl.hrp; const c = head.props.CFrame;
      const pr = this.project(v3(c.x, c.y + head.props.Size.y / 2 + 1.2, c.z));
      let L = this.labels.get(h);
      if (!L) { const el = document.createElement('div'); el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;font:600 13px system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;'; el.innerHTML = '<div class="n"></div><div class="hb" style="width:60px;height:6px;background:#0008;border-radius:3px;margin:2px auto 0;overflow:hidden"><div style="height:100%;background:#3fd76b"></div></div>'; this.labelLayer.appendChild(el); L = { el, n: el.firstChild, hb: el.lastChild, hf: el.lastChild.firstChild }; this.labels.set(h, L); }
      seen.add(h);
      const name = h.props.DisplayName || m.props.Name;
      if (L.name !== name) { L.name = name; L.n.textContent = utf8dec(name); }
      const show = pr[3] && pr[2] < (h.props.NameDisplayDistance || 100);
      L.el.style.display = show ? 'block' : 'none';
      if (show) {
        L.el.style.left = pr[0].toFixed(1) + 'px'; L.el.style.top = pr[1].toFixed(1) + 'px';
        const frac = Math.max(0, h.props.Health / Math.max(1, h.props.MaxHealth));
        const dispHB = h.props.HealthDisplayType.name === 'AlwaysOn' || (h.props.HealthDisplayType.name === 'DisplayWhenDamaged' && frac < 1);
        L.hb.style.display = dispHB ? 'block' : 'none'; L.hf.style.width = (frac * 100).toFixed(0) + '%';
      }
    }
    for (const [h, L] of this.labels) if (!seen.has(h)) { L.el.remove(); this.labels.delete(h); }
    // billboards
    const gui = ENV.gui;
    if (gui && gui.bbs) {
      for (const [bb, rec] of gui.bbs) {
        let ad = bb.props.Adornee; if (!ad && bb.parent && (bb.parent.isA('BasePart') || bb.parent.className === 'Attachment')) ad = bb.parent;
        if (!ad && bb.parent && bb.parent.isA('Model')) ad = bb.parent.props.PrimaryPart;
        if (!ad || !bb.dm || bb.props.Enabled === false) { rec.div.style.display = 'none'; continue; }
        let pos;
        if (ad.isA('BasePart')) { const c = ad.props.CFrame; pos = v3(c.x, c.y, c.z); } else if (ad.className === 'Attachment') pos = ad.lget('WorldPosition'); else if (ad.isA('Model')) { const c = I.modelPivot(ad); pos = v3(c.x, c.y, c.z); } else { rec.div.style.display = 'none'; continue; }
        const so = bb.props.StudsOffset, sw = bb.props.StudsOffsetWorldSpace, eo = bb.props.ExtentsOffset;
        let ex = 0, ey = 0, ez = 0; if (ad.isA('BasePart')) { ex = eo.x * ad.props.Size.x / 2; ey = eo.y * ad.props.Size.y / 2; ez = eo.z * ad.props.Size.z / 2; }
        pos = v3(pos.x + so.x + sw.x + ex, pos.y + so.y + sw.y + ey, pos.z + so.z + sw.z + ez);
        const pr = this.project(pos);
        const maxd = Math.min(bb.props.MaxDistance, 400);
        if (!pr[3] || pr[2] > maxd) { rec.div.style.display = 'none'; continue; }
        const s = bb.props.Size; const w = rec.w, h = rec.h;
        const scale = (s.xs || s.ys) ? Math.max(0.05, ENV.pxPerStud(pr[2]) / 50) : 1;
        rec.div.style.display = 'block';
        rec.div.style.transform = `translate(${(pr[0] - w * scale / 2).toFixed(1)}px,${(pr[1] - h * scale / 2).toFixed(1)}px) scale(${scale.toFixed(3)})`;
        rec.div.style.transformOrigin = '0 0';
        rec.div.style.zIndex = String(10000 - Math.floor(pr[2]));
      }
    }
  }
  /* ---------- frame ---------- */
  render(dt) {
    if (this.envDirty !== false || ENV.svcOrNull('Lighting') && ENV.svcOrNull('Lighting').props.ClockTime !== this.lastClock) this.syncEnv();
    if (this.dirty.size) { const list = Array.from(this.dirty); this.dirty.clear(); for (const p of list) this.syncPart(p); }
    if (this.lights.size) this.syncLights();
    this.updateCamera(dt);
    // hide own character in first person
    const own = ENV.localPlayer && ENV.localPlayer.props.Character;
    if (own) for (const c of own.children) { const m = this.meshes.get(c); if (m && c.props.Transparency < 1) m.mesh.visible = !this.firstPerson; }
    // sun follows camera
    const f = this.cam.focus; if (this.sunDir) { this.sun.position.set(f.x + this.sunDir.x * 120, f.y + this.sunDir.y * 120, f.z + this.sunDir.z * 120); this.sun.target.position.set(f.x, f.y, f.z); this.sun.target.updateMatrixWorld(); }
    this.updateLabels(dt);
    this.renderer.render(this.scene, this.camera);
    this.frames = (this.frames || 0) + 1;
  }
  /* ---------- controls ---------- */
  setupControls() {
    const el = this.container, input = ENV.input, cam = this.cam; const self = this;
    const touch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || /[?&]touch=1/.test(location.search);
    input.touchEnabled = touch;
    const rr = () => el.getBoundingClientRect();
    const guiTarget = (e) => { let t = e.target; while (t && t !== el) { if (t.dataset && t.dataset.active === '1') return true; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return true; t = t.parentElement; } return false; };
    let drag = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.r2w-ui')) return;
      const r = rr(), x = e.clientX - r.left, y = e.clientY - r.top;
      const gpe = guiTarget(e);
      if (e.pointerType === 'touch') { input.touch('Begin', x, y, gpe); }
      else input.mouseButton(e.button, true, x, y, gpe);
      if (!gpe && (e.button === 2 || e.pointerType === 'touch' || e.button === 0)) {
        if (e.pointerType === 'touch' && drag) return;
        drag = { x: e.clientX, y: e.clientY, id: e.pointerId, btn: e.button, moved: 0, startX: x, startY: y, touch: e.pointerType === 'touch' };
        try { el.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      }
    });
    el.addEventListener('pointermove', (e) => {
      const r = rr(), x = e.clientX - r.left, y = e.clientY - r.top;
      const dx = drag ? e.clientX - drag.x : e.movementX || 0, dy = drag ? e.clientY - drag.y : e.movementY || 0;
      input.mouseMove(x, y, e.movementX || 0, e.movementY || 0, false);
      if (drag && e.pointerId === drag.id) {
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.btn === 2 || drag.touch || drag.moved > 4) {
          if (!ENV.cameraLocked) { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.3, Math.min(1.45, cam.pitch + dy * 0.005)); }
        }
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const up = (e) => {
      const r = rr(), x = e.clientX - r.left, y = e.clientY - r.top;
      const gpe = guiTarget(e);
      const wasDrag = drag && e.pointerId === drag.id;
      if (e.pointerType === 'touch') { input.touch('End', x, y, gpe || (wasDrag && drag.moved > 8)); }
      else input.mouseButton(e.button, false, x, y, gpe || (wasDrag && drag.moved > 6 && e.button === 0));
      if (wasDrag) drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { drag = null; });
    el.addEventListener('wheel', (e) => { if (guiTarget(e)) return; e.preventDefault(); if (!ENV.cameraLocked) cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); input.wheel(-Math.sign(e.deltaY), false); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      input.key(e.code, true, false);
    });
    window.addEventListener('keyup', (e) => { const tag = e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return; input.key(e.code, false, false); });
    window.addEventListener('blur', () => { for (const k of Array.from(input.keys)) input.key(k, false, true); input.joy = [0, 0]; });
    if (touch) this.touchControls();
  }
  touchControls() {
    const el = this.container, input = ENV.input; const d = document;
    const mk = (css) => { const x = d.createElement('div'); x.className = 'r2w-ui'; x.style.cssText = css; el.appendChild(x); return x; };
    const pad = mk('position:absolute;left:24px;bottom:28px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.35);touch-action:none;z-index:50;pointer-events:auto;');
    const knob = d.createElement('div'); knob.style.cssText = 'position:absolute;left:35px;top:35px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.55);'; pad.appendChild(knob);
    const jump = mk('position:absolute;right:30px;bottom:50px;width:84px;height:84px;border-radius:50%;background:rgba(255,255,255,.25);border:2px solid rgba(255,255,255,.5);color:#fff;font:700 15px system-ui;display:flex;align-items:center;justify-content:center;touch-action:none;z-index:50;pointer-events:auto;');
    jump.textContent = 'Прыжок';
    let pid = null;
    const upd = (e) => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left - 65) / 50, y = (e.clientY - r.top - 65) / 50; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } input.joy = [x, y]; knob.style.left = (35 + x * 35) + 'px'; knob.style.top = (35 + y * 35) + 'px'; };
    pad.addEventListener('pointerdown', (e) => { pid = e.pointerId; pad.setPointerCapture(pid); upd(e); e.stopPropagation(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) upd(e); });
    const end = (e) => { if (e.pointerId === pid) { pid = null; input.joy = [0, 0]; knob.style.left = '35px'; knob.style.top = '35px'; } };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    jump.addEventListener('pointerdown', (e) => { input.jump = true; ENV.svc('UserInputService').fireSignal('JumpRequest'); e.stopPropagation(); });
    jump.addEventListener('pointerup', () => { input.jump = false; }); jump.addEventListener('pointercancel', () => { input.jump = false; });
  }
}
module.exports = { World3D };

};
var entry=req("rbx/boot.js");})();