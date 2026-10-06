'use strict';
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
// Country: real IP-geolocation started by boot.js (ENV.geo, see geo.js); headless/no geo -> 'US'.
defMethods('LocalizationService', {
  GetCountryRegionForPlayerAsync: function* (self, player) {
    const g = ENV.geo;
    if (!g) return 'US';
    const co = CO.current;
    const wallLimit = Date.now() + (g.budgetMs || 2000) + 1500; // geo.js enforces its own budget; this is a safety net
    while (g.status === 'pending' && co && Date.now() < wallLimit) { ENV.rt.sleep(co, 0.05, []); yield SCHED; }
    if (g.country) return g.country;
    throw rtError('LocalizationService:GetCountryRegionForPlayerAsync() failed: country is unavailable (' + (g.source || g.status) + ')');
  },
});
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
