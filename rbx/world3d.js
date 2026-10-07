'use strict';
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
      if (e.pointerType === 'touch' && !gpe && self.thumbStart && self.thumbZone(x, y) && self.thumbStart(e, x, y)) return;
      if (e.pointerType === 'touch') { input.touch('Begin', x, y, gpe); }
      else input.mouseButton(e.button, true, x, y, gpe);
      if (!gpe && (e.button === 2 || e.pointerType === 'touch' || e.button === 0)) {
        if (e.pointerType === 'touch' && drag) return;
        drag = { x: e.clientX, y: e.clientY, id: e.pointerId, btn: e.button, moved: 0, startX: x, startY: y, touch: e.pointerType === 'touch' };
        try { el.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (self.thumbMove && self.thumbMove(e)) return;
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
      if (self.thumbEnd && self.thumbEnd(e)) return;
      const r = rr(), x = e.clientX - r.left, y = e.clientY - r.top;
      const gpe = guiTarget(e);
      const wasDrag = drag && e.pointerId === drag.id;
      if (e.pointerType === 'touch') { input.touch('End', x, y, gpe || (wasDrag && drag.moved > 8)); }
      else input.mouseButton(e.button, false, x, y, gpe || (wasDrag && drag.moved > 6 && e.button === 0));
      if (wasDrag) drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => { if (self.thumbEnd) self.thumbEnd(e); drag = null; });
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
    // Как в Roblox (DynamicThumbstick + TouchJumpButton): джойстик появляется там, где палец коснулся
    // левой нижней части экрана (не GUI), кнопка прыжка — справа снизу (70 px на малых экранах, 120 px на больших).
    const el = this.container, input = ENV.input; const d = document;
    const mk = (css) => { const x = d.createElement('div'); x.className = 'r2w-ui'; x.style.cssText = css; el.appendChild(x); return x; };
    const ring = mk('position:absolute;left:0;top:0;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:rgba(255,255,255,.10);border:3px solid rgba(255,255,255,.45);z-index:50;pointer-events:none;display:none;');
    const knob = d.createElement('div'); knob.style.cssText = 'position:absolute;left:33px;top:33px;width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.6);'; ring.appendChild(knob);
    const jump = mk('position:absolute;border-radius:50%;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.55);touch-action:none;z-index:50;pointer-events:auto;display:flex;align-items:center;justify-content:center;');
    jump.innerHTML = '<svg viewBox="0 0 24 24" style="width:46%;height:46%"><path d="M12 4l7 8h-4v7H9v-7H5z" fill="rgba(255,255,255,.85)"/></svg>';
    jump.title = 'Jump';
    const placeJump = () => { const r = el.getBoundingClientRect(); const small = Math.min(r.width, r.height) <= 500; const sz = small ? 70 : 120; jump.style.width = jump.style.height = sz + 'px'; jump.style.right = (small ? 25 : 50) + 'px'; jump.style.bottom = (small ? 20 : 90) + 'px'; };
    placeJump(); window.addEventListener('resize', placeJump);
    let pid = null, cx = 0, cy = 0;
    const R = 50;
    const upd = (e) => { const r = el.getBoundingClientRect(); let x = (e.clientX - r.left - cx) / R, y = (e.clientY - r.top - cy) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } input.joy = [x, y]; knob.style.left = (33 + x * 36) + 'px'; knob.style.top = (33 + y * 36) + 'px'; };
    // зона джойстика: левая половина, нижние 60 % экрана; касание GUI сюда не попадает (у GUI свой обработчик)
    this.thumbZone = (x, y) => { const r = el.getBoundingClientRect(); return x < r.width * 0.5 && y > r.height * 0.4; };
    this.thumbStart = (e, x, y) => { if (pid !== null) return false; pid = e.pointerId; cx = x; cy = y; ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.style.display = 'block'; upd(e); try { el.setPointerCapture(pid); } catch (er) { /* */ } return true; };
    this.thumbMove = (e) => { if (e.pointerId !== pid) return false; upd(e); return true; };
    this.thumbEnd = (e) => { if (e.pointerId !== pid) return false; pid = null; input.joy = [0, 0]; ring.style.display = 'none'; knob.style.left = '33px'; knob.style.top = '33px'; return true; };
    jump.addEventListener('pointerdown', (e) => { input.jump = true; ENV.svc('UserInputService').fireSignal('JumpRequest'); e.stopPropagation(); });
    jump.addEventListener('pointerup', () => { input.jump = false; }); jump.addEventListener('pointercancel', () => { input.jump = false; });
  }
}
module.exports = { World3D };
