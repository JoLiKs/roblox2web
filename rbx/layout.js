'use strict';
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
    const w = root.className === 'BillboardGui' ? s.xo : (root.props.CanvasSize ? root.props.CanvasSize.x : 800), h = root.className === 'BillboardGui' ? s.yo : (root.props.CanvasSize ? root.props.CanvasSize.y : 600);
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
