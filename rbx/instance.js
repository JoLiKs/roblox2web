'use strict';
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
