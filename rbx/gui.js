'use strict';
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
  Cartoon: '"Comic Sans MS","Chalkboard SE",cursive', Fantasy: 'Papyrus, fantasy', Arcade: '"Courier New", monospace', Code: '"Courier New", monospace', Highway: 'Impact, sans-serif', SciFi: '"Trebuchet MS", sans-serif', Bangers: 'Impact, sans-serif', FredokaOne: '"Fredoka One","Fredoka","Arial Rounded MT Bold","Arial Black",sans-serif', LuckiestGuy: '"Luckiest Guy","Arial Black",Impact,sans-serif', Oswald: 'Impact, "Arial Narrow", sans-serif', Ubuntu: 'Ubuntu, sans-serif', Michroma: 'Verdana, sans-serif', Nunito: 'Nunito, "Segoe UI", sans-serif', Roboto: 'Roboto, "Segoe UI", sans-serif', RobotoMono: '"Roboto Mono","Courier New", monospace', BuilderSans: '"Segoe UI",system-ui,sans-serif', BuilderSansMedium: '"Segoe UI",system-ui,sans-serif', BuilderSansBold: '"Segoe UI",system-ui,sans-serif', BuilderSansExtraBold: '"Segoe UI",system-ui,sans-serif',
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
    if (bs > 0 && (p.BackgroundTransparency || 0) < 1) shadows.push(`0 0 0 ${bs}px ${css(p.BorderColor3, 1 - (p.BackgroundTransparency || 0))}`); // как в Roblox: рамка прозрачна вместе с фоном
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
    const ru = !ENV.geo || ENV.geo.lang() === 'ru'; // demo chrome language (geo.js); headless default: ru
    const T = ru ? { gamepass: 'Геймпасс', product: 'Покупка', asset: 'Предмет', demo: 'Демо · деньги не списываются', cancel: 'Отмена', buy: 'Купить (демо)' }
      : { gamepass: 'Game pass', product: 'Purchase', asset: 'Item', demo: 'Demo · no real money is charged', cancel: 'Cancel', buy: 'Buy (demo)' };
    const kind = { gamepass: T.gamepass, product: T.product, asset: T.asset, premium: 'Roblox Premium' }[info.kind] || T.product;
    const price = info.price ? `<div style="font-size:22px;margin:10px 0;color:#00b06f;font-weight:700">R$ ${info.price}</div>` : '';
    box.innerHTML = `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f5a623;font-weight:700">${T.demo}</div><div style="font-size:13px;color:#aaa;margin-top:8px">${kind}</div><div style="font-size:19px;font-weight:700;margin:4px 0">${esc(utf8dec(info.name || ''))}</div>${info.description ? `<div style="font-size:13px;color:#bbb">${esc(utf8dec(info.description))}</div>` : ''}${price}`;
    const row = d.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:14px';
    const mk = (t, bg, fn, id) => { const b = d.createElement('button'); b.textContent = t; b.id = id; b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer;`; b.onclick = () => { ov.remove(); fn(); }; return b; };
    row.appendChild(mk(T.cancel, '#555', () => cb(false), 'r2w-buy-cancel')); row.appendChild(mk(T.buy, '#00a35c', () => cb(true), 'r2w-buy-ok'));
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
