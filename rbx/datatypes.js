'use strict';
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
