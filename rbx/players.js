'use strict';
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
  // Standard R6 joints (same names / C0 / C1 as a real Roblox R6 character): scripts can animate limbs via Motor6D.C0 / Transform.
  const torso = m.findChild('Torso');
  const R = (a) => a; const cf = (x, y, z, r) => new CFrame(x, y, z, r);
  const RS = [0, 0, 1, 0, 1, 0, -1, 0, 0], LS = [0, 0, -1, 0, 1, 0, 1, 0, 0], NK = [-1, 0, 0, 0, 0, 1, 0, 1, 0];
  const motor = (name, parent, p0, p1, c0, c1) => { const j = newInstance('Motor6D'); j.props.Name = name; j.props.Part0 = p0; j.props.Part1 = p1; j.props.C0 = c0; j.props.C1 = c1; j.setParent(parent); return j; };
  motor('RootJoint', hrp, hrp, torso, cf(0, 0, 0, NK), cf(0, 0, 0, NK));
  motor('Right Shoulder', torso, torso, m.findChild('Right Arm'), cf(1, 0.5, 0, R(RS)), cf(-0.5, 0.5, 0, RS));
  motor('Left Shoulder', torso, torso, m.findChild('Left Arm'), cf(-1, 0.5, 0, LS), cf(0.5, 0.5, 0, LS));
  motor('Right Hip', torso, torso, m.findChild('Right Leg'), cf(1, -1, 0, RS), cf(0.5, 1, 0, RS));
  motor('Left Hip', torso, torso, m.findChild('Left Leg'), cf(-1, -1, 0, LS), cf(-0.5, 1, 0, LS));
  motor('Neck', torso, torso, m.findChild('Head'), cf(0, 1, 0, NK), cf(0, -0.5, 0, NK));
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
