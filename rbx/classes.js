'use strict';
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
  GetScale(self) { return self.scaleFactor || 1; },
  ScaleTo(self, s) { scaleModel(self, s); return E; },
} });
// Model:ScaleTo — as in Roblox: sizes/positions of parts around the pivot, joint offsets (Motor6D/Weld C0/C1),
// attachments and Humanoid.HipHeight scale by newScale / currentScale. Character controllers re-read the rig.
function scaleModel(self, s) {
  if (typeof s !== 'number' || !(s > 0) || !isFinite(s)) throw rtError('Model:ScaleTo() expects a positive number');
  const k = s / (self.scaleFactor || 1);
  if (Math.abs(k - 1) < 1e-9) return;
  const piv = I.modelPivot(self);
  const sc = (c) => new CFrame(c.x * k, c.y * k, c.z * k, c.r);
  for (const d of self.descendants()) {
    if (d.isA('BasePart')) {
      const c = d.props.CFrame, z = d.props.Size;
      d.setProp('Size', v3(z.x * k, z.y * k, z.z * k));
      setCF(d, new CFrame(piv.x + (c.x - piv.x) * k, piv.y + (c.y - piv.y) * k, piv.z + (c.z - piv.z) * k, c.r));
    } else if (d.className === 'Motor6D' || d.className === 'Weld' || d.className === 'ManualWeld' || d.className === 'Snap') {
      if (d.props.C0) d.setProp('C0', sc(d.props.C0));
      if (d.props.C1) d.setProp('C1', sc(d.props.C1));
    } else if (d.className === 'Attachment' && d.props.CFrame) {
      d.setProp('CFrame', sc(d.props.CFrame));
    } else if (d.className === 'Humanoid') {
      d.setProp('HipHeight', (d.props.HipHeight || 0) * k);
      d.ctl = null; // physics re-reads feet height / joints on the next step
    }
  }
  self.scaleFactor = s;
}
defClass('Actor', 'Model');
// Roblox держит поворот CFrame ортонормированным; без этого cf * inverse(cur) * cur копит ошибку
// (inverse = транспонирование) и после тысяч PivotTo матрица «взрывается».
function orthoCF(c) {
  const r = c.r;
  let ax = r[0], ay = r[3], az = r[6], bx = r[1], by = r[4], bz = r[7];
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), dab = ax * bx + ay * by + az * bz;
  if (Math.abs(la - 1) < 1e-9 && Math.abs(lb - 1) < 1e-9 && Math.abs(dab) < 1e-9) return c;
  if (!(la > 1e-12) || !isFinite(la)) return new D.CFrame(c.x, c.y, c.z);
  ax /= la; ay /= la; az /= la;
  const d = ax * bx + ay * by + az * bz; bx -= d * ax; by -= d * ay; bz -= d * az;
  const lb2 = Math.hypot(bx, by, bz);
  if (!(lb2 > 1e-12) || !isFinite(lb2)) return new D.CFrame(c.x, c.y, c.z);
  bx /= lb2; by /= lb2; bz /= lb2;
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return new D.CFrame(c.x, c.y, c.z, [ax, bx, cx, ay, by, cy, az, bz, cz]);
}
function pivotModel(self, cf) {
  const cur = orthoCF(I.modelPivot(self));
  const delta = orthoCF(D.cfMul(cf, D.cfInverse(cur)));
  for (const d of self.descendants()) if (d.isA('BasePart')) setCF(d, orthoCF(D.cfMul(delta, d.props.CFrame)));
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
defClass('Tool', 'Instance', { props: { CanBeDropped: true, Enabled: true, Grip: new CFrame(0, 0, 0), ManualActivationOnly: false, RequiresHandle: true, ToolTip: '', TextureId: '' }, events: ['Activated', 'Deactivated', 'Equipped', 'Unequipped'], methods: { Activate(self) { self.fireSignal('Activated'); return E; }, Deactivate(self) { self.fireSignal('Deactivated'); return E; } } });
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
  EquipTool(self, tool) { if (self.parent && tool && tool.className === 'Tool') tool.setParent(self.parent); return E; },
  UnequipTools(self) { const ch = self.parent; if (!ch) return E; const pl = ENV.svc('Players').children.find((p) => p.props.Character === ch); const bp = pl && pl.findChild('Backpack'); for (const c of ch.children.slice()) if (c.className === 'Tool') { if (bp) c.setParent(bp); } return E; },
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
