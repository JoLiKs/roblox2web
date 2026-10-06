'use strict';
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
  ctl.motors = findMotors(m, ctl);
  ctl.rel = new Map();
  const inv = D.cfInverse(cf);
  for (const p of m.descendants()) if (p.isA('BasePart')) { p.charPart = true; const r = world.parts.get(p); if (r) r.inCtl = true; if (!r6 && p !== hrp) ctl.rel.set(p, D.cfMul(inv, p.props.CFrame)); }
  h.ctl = ctl; return ctl;
}
// R6 Motor6D joints (if present): limb = Part0 * C0 * anim * Transform * C1^-1 — scripts can tween C0 / set Transform.
function findMotors(m, ctl) {
  const out = {}; let n = 0;
  for (const d of m.descendants()) if (d.className === 'Motor6D' && d.props.Part1) { out[d.props.Name] = d; n++; }
  if (!out.RootJoint || !out['Right Shoulder']) return null;
  return n ? out : null;
}
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
function motorCF(j, base, ang) {
  const p = j.props; let t = p.C0;
  if (ang) t = D.cfMul(t, new CFrame(0, 0, 0, rotZ(ang)));
  if (p.Transform) t = D.cfMul(t, p.Transform);
  return D.cfMul(D.cfMul(base, t), D.cfInverse(p.C1));
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
  if (!ctl.motors && ((ctl.motorScan = (ctl.motorScan || 0) + 1) % 30 === 1)) ctl.motors = findMotors(ctl.m, ctl);
  const M = ctl.motors;
  if (M && !M.RootJoint.destroyed) {
    const a = swing * 0.9;
    const torsoCF = motorCF(M.RootJoint, root, 0);
    if (P.Torso) setPart(P.Torso, torsoCF);
    const joint = (name, ang) => { const j = M[name]; if (j && !j.destroyed && j.props.Part1 && !j.props.Part1.destroyed) setPart(j.props.Part1, motorCF(j, torsoCF, ang)); };
    joint('Neck', 0);
    joint('Right Shoulder', air ? 2.8 : -a); joint('Left Shoulder', air ? -2.8 : -a);
    joint('Right Hip', air ? -0.35 : a); joint('Left Hip', air ? -0.35 : a);
    return;
  }
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
