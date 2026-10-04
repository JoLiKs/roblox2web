'use strict';
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
