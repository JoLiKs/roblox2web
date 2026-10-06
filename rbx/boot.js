'use strict';
// Browser entry point: window.R2W
const C = require('../lua2js/core');
const { utf8dec } = require('../lua2js/lexer');
const I = require('./instance');
const { ENV } = I;
const D = require('./datatypes');
const { ENV: E2 } = require('./env');
require('./services'); require('./players'); require('./physics'); require('./net');
const input = require('./input');
const { GuiRenderer } = require('./gui');
const { World3D } = require('./world3d');
const layout = require('./layout');
const GEO = require('./geo');

// Demo chrome strings (splash, top bar). Language = same policy as LocalizationService-based games: geo country + LocaleId.
const UI_TEXT = {
  ru: { loading: 'Загрузка… Luau → JS', players: 'Игроки', console: 'Консоль', reset: 'Сброс', resetTitle: 'Удалить локальные сохранения и перезапустить', resetAsk: 'Удалить сохранения этой игры из localStorage и перезапустить?', premiumTitle: 'Эмуляция Roblox Premium', bootError: 'Ошибка запуска: ' },
  en: { loading: 'Loading… Luau → JS', players: 'Players', console: 'Console', reset: 'Reset', resetTitle: 'Delete local saves and restart', resetAsk: 'Delete this game\'s saves from localStorage and restart?', premiumTitle: 'Roblox Premium emulation', bootError: 'Startup error: ' },
};

const chunks = []; const errors = []; let game = null; let started = false;
const R2W = {
  version: '2.2.0',
  chunk(id, name, factory) { ENV.chunkFactories.set(id, factory); C.ST.chunks[id] = name; chunks.push(id); },
  chunkError(id, name, msg) { errors.push({ id, name, msg }); },
  setGame(g) { game = g; R2W.game = g; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => R2W.start()); else setTimeout(() => R2W.start(), 0); },
  ENV,
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// ?attr.Name=value -> Workspace attribute (number / boolean / string); only plain identifiers are accepted
const urlAttrs = () => {
  const out = {}; let n = 0;
  for (const [k, v] of new URLSearchParams(location.search)) {
    const m = /^attr[._]([A-Za-z][A-Za-z0-9_]{0,40})$/.exec(k); if (!m || n >= 16) continue;
    out[m[1]] = v === 'true' ? true : v === 'false' ? false : (v !== '' && isFinite(+v) ? +v : String(v).slice(0, 100)); n++;
  }
  return out;
};
const qs = (k) => { const m = new RegExp('[?&]' + k + '(=([^&]*))?').exec(location.search); return m ? (m[2] === undefined ? '1' : decodeURIComponent(m[2])) : null; };

R2W.start = function (opts) {
  if (started) return; started = true;
  opts = opts || {};
  const d = document;
  // ----- geolocation / locale (runs in parallel with loading; GetCountryRegionForPlayerAsync waits for it)
  const geo = GEO.create({ search: location.search, navigatorLanguage: (navigator.languages && navigator.languages[0]) || navigator.language, fetch: typeof fetch === 'function' ? fetch.bind(window) : null });
  ENV.geo = geo; R2W.geo = geo;
  geo.start();
  const tx = (k) => (UI_TEXT[geo.lang()] || UI_TEXT.en)[k];
  let root = d.getElementById('r2w-root');
  if (!root) { root = d.createElement('div'); root.id = 'r2w-root'; d.body.appendChild(root); }
  root.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;overflow:hidden;background:#111;font-family:system-ui,Segoe UI,Roboto,sans-serif;user-select:none;-webkit-user-select:none;';
  const splash = d.createElement('div'); splash.id = 'r2w-splash'; splash.style.cssText = 'position:absolute;inset:0;background:#1b1d21;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200000;font-size:18px;';
  splash.innerHTML = `<div style="font-size:26px;font-weight:700;margin-bottom:8px">${esc(utf8dec(game.name || 'Game'))}</div><div style="color:#9aa"><span id="r2w-loading">${tx('loading')}</span> (roblox2web ${R2W.version})</div>`;
  root.appendChild(splash);
  const finishSplash = () => { splash.remove(); };

  // ----- UI chrome
  const bar = d.createElement('div'); bar.className = 'r2w-ui'; bar.id = 'r2w-bar';
  bar.style.cssText = 'position:absolute;left:0;top:0;right:0;height:36px;background:rgba(18,18,20,.72);color:#eee;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:13px;z-index:100001;pointer-events:auto;';
  bar.innerHTML = `<b id="r2w-title" style="margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(utf8dec(game.name || ''))}</b>
    <label id="r2w-premium-l" style="display:flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" id="r2w-premium"> Premium</label>
    <button id="r2w-btn-players"></button><button id="r2w-btn-console"><span id="r2w-console-t"></span> <span id="r2w-errcount" style="display:none;background:#c0392b;border-radius:8px;padding:0 5px"></span></button><button id="r2w-btn-reset"></button>`;
  for (const b of bar.querySelectorAll('button')) b.style.cssText = 'background:#3a3d44;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;';
  root.appendChild(bar);
  const applyChromeLang = () => {
    d.documentElement.lang = geo.lang();
    const set = (id, k, attr) => { const el = d.getElementById(id); if (el) { if (attr) el.setAttribute(attr, tx(k)); else el.textContent = tx(k); } };
    set('r2w-loading', 'loading'); set('r2w-btn-players', 'players'); set('r2w-console-t', 'console'); set('r2w-btn-reset', 'reset');
    set('r2w-btn-reset', 'resetTitle', 'title'); set('r2w-premium-l', 'premiumTitle', 'title');
  };
  applyChromeLang();
  geo.onDone(() => { applyChromeLang(); if (ENV.onLog) ENV.onLog({ level: 'info', who: 'geo', text: `country=${geo.country || '?'} (${geo.source}${geo.tried.length ? ': ' + geo.tried.map((t) => t.name + (t.ok ? ' ok' : ' ' + (t.error || 'no country')) + ' ' + t.ms + 'ms').join(', ') : ''}), LocaleId=${geo.localeId}` }); });
  const cons = d.createElement('div'); cons.className = 'r2w-ui'; cons.id = 'r2w-console';
  cons.style.cssText = 'position:absolute;left:8px;right:8px;bottom:8px;height:38%;background:rgba(10,10,12,.92);color:#ddd;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;overflow:auto;padding:8px;border:1px solid #444;border-radius:8px;z-index:100002;display:none;pointer-events:auto;user-select:text;white-space:pre-wrap;';
  root.appendChild(cons);
  const plist = d.createElement('div'); plist.className = 'r2w-ui'; plist.id = 'r2w-players';
  plist.style.cssText = 'position:absolute;right:8px;top:42px;min-width:200px;background:rgba(20,20,24,.85);color:#fff;border-radius:8px;padding:8px 10px;font-size:13px;z-index:100001;display:none;pointer-events:auto;';
  root.appendChild(plist);
  const stage = d.createElement('div'); stage.id = 'r2w-stage'; stage.style.cssText = 'position:absolute;inset:0;'; root.insertBefore(stage, bar);

  // ----- logging
  const COL = { out: '#ddd', warn: '#f5c242', err: '#ff6b5e', info: '#7fb3ff' };
  let nerr = 0;
  const addLine = (e) => {
    const line = d.createElement('div'); line.style.color = COL[e.level] || '#ddd';
    if (/\[unsupported\]/.test(e.text)) line.style.color = '#c792ea';
    line.textContent = `[${e.who}] ${e.text}`; cons.appendChild(line);
    while (cons.childNodes.length > 800) cons.removeChild(cons.firstChild);
    cons.scrollTop = cons.scrollHeight;
    if (e.level === 'err') { nerr++; const c = d.getElementById('r2w-errcount'); c.style.display = 'inline'; c.textContent = nerr; }
    const f = e.level === 'err' ? 'error' : e.level === 'warn' ? 'warn' : 'log';
    if (e.level !== 'out' || !qs('quiet')) console[f]('[r2w]', `[${e.who}]`, e.text);
  };
  ENV.onLog = addLine;
  for (const e of errors) addLine({ level: 'err', who: 'transpile', text: `${e.name}: ${e.msg}` });
  d.getElementById('r2w-btn-console').onclick = () => { cons.style.display = cons.style.display === 'none' ? 'block' : 'none'; };
  d.getElementById('r2w-btn-players').onclick = () => { plist.style.display = plist.style.display === 'none' ? 'block' : 'none'; };
  d.getElementById('r2w-btn-reset').onclick = () => { if (confirm(tx('resetAsk'))) { ENV.storage.clearAll(); location.reload(); } };
  window.addEventListener('keydown', (e) => { if (e.code === 'F9') { e.preventDefault(); cons.style.display = cons.style.display === 'none' ? 'block' : 'none'; } if (e.code === 'Tab') { plist.style.display = plist.style.display === 'none' ? 'block' : 'none'; } });
  window.addEventListener('error', (e) => addLine({ level: 'err', who: 'js', text: String(e.message) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '') }));
  window.addEventListener('unhandledrejection', (e) => addLine({ level: 'err', who: 'js', text: 'unhandled rejection: ' + (e.reason && e.reason.stack || e.reason) }));
  d.getElementById('r2w-premium').checked = qs('premium') === '1';

  // ----- boot the emulator
  let w3;
  try {
    const cfg = game.config || {};
    ENV.boot({ tree: game.tree, persist: qs('persist') !== '0', seed: qs('seed') ? +qs('seed') : undefined, catalog: cfg.catalog, name: game.name, placeKey: cfg.placeKey || game.name, autoPurchase: qs('autobuy') === '1', latency: qs('latency') ? +qs('latency') : undefined });
    let maxId = 0; for (const id of chunks) maxId = Math.max(maxId, id); ENV.rt.chunkCount = Math.max(ENV.rt.chunkCount || 0, maxId);
    if (cfg.lighting) {/* reserved */}
    new GuiRenderer({ root: stage });
    w3 = new World3D({ THREE: window.THREE, container: stage, preserve: qs('preserve') === '1' });
    ENV.world3d = w3;
    ENV.start({ premium: d.getElementById('r2w-premium').checked, playerName: cfg.playerName || qs('name') || 'Player1', userId: cfg.userId, localeId: geo.localeId, attrs: urlAttrs() });
  } catch (e) {
    addLine({ level: 'err', who: 'boot', text: tx('bootError') + (e && e.stack || e) });
    cons.style.display = 'block'; finishSplash(); console.error(e); return;
  }
  d.getElementById('r2w-premium').onchange = (e) => { if (ENV.localPlayer) ENV.setPremium(ENV.localPlayer, e.target.checked); };
  if (qs('premium') === '1' && ENV.localPlayer) ENV.setPremium(ENV.localPlayer, true);
  // ----- ProximityPrompt UI
  const pp = d.createElement('div'); pp.className = 'r2w-ui'; pp.id = 'r2w-prompt';
  pp.style.cssText = 'position:absolute;transform:translate(-50%,-50%);background:rgba(30,30,34,.92);color:#fff;border:2px solid #fff6;border-radius:10px;padding:6px 12px 6px 6px;display:none;align-items:center;gap:8px;z-index:90000;pointer-events:auto;cursor:pointer;font-size:14px;min-width:90px;';
  pp.innerHTML = '<div id="r2w-pk" style="width:30px;height:30px;border-radius:6px;background:#fff;color:#111;font-weight:800;display:flex;align-items:center;justify-content:center"></div><div><div id="r2w-pa" style="font-weight:700"></div><div id="r2w-po" style="font-size:11px;color:#bbb"></div></div><div id="r2w-ph" style="position:absolute;left:0;bottom:0;height:3px;background:#4fc3f7;width:0"></div>';
  stage.appendChild(pp);
  const pkeyOf = (p) => { const n = p.props.KeyboardKeyCode.name; return n === 'Unknown' ? '' : n; };
  pp.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (ENV.prompts.active) ENV.prompts.press(ENV.prompts.active); });
  pp.addEventListener('pointerup', (e) => { e.stopPropagation(); ENV.prompts.release(); });
  pp.addEventListener('pointerleave', () => { if (ENV.prompts.hold) ENV.prompts.release(); });
  function updatePrompt() {
    const a = ENV.prompts.active;
    if (!a || a.props.Style.name === 'Custom') { pp.style.display = 'none'; return; }
    const pos = a.parent && (a.parent.isA('BasePart') ? a.parent.props.CFrame : a.parent.className === 'Attachment' ? a.parent.lget('WorldPosition') : a.parent.isA('Model') ? I.modelPivot(a.parent) : null);
    if (!pos) { pp.style.display = 'none'; return; }
    const o = a.props.UIOffset; const pr = ENV.project({ x: pos.x, y: pos.y, z: pos.z });
    if (!pr[3]) { pp.style.display = 'none'; return; }
    pp.style.display = 'flex'; pp.style.left = (pr[0] + o.x) + 'px'; pp.style.top = (pr[1] + o.y) + 'px';
    const k = pkeyOf(a); d.getElementById('r2w-pk').textContent = k || '●';
    d.getElementById('r2w-pa').textContent = utf8dec(a.props.ActionText || ''); d.getElementById('r2w-po').textContent = utf8dec(a.props.ObjectText || '');
    d.getElementById('r2w-ph').style.width = ENV.prompts.hold ? Math.min(100, ENV.prompts.holdT / Math.max(0.01, a.props.HoldDuration) * 100) + '%' : '0';
  }
  // key 'E' etc. goes to the prompts through input.key; hold release handled there
  // ----- players list
  function updatePlayers() {
    if (plist.style.display === 'none') return;
    let h = `<div style="font-weight:700;margin-bottom:4px">${tx('players')}</div>`;
    for (const p of ENV.players) {
      const ls = p.findChild('leaderstats'); let st = '';
      if (ls) for (const v of ls.children) if (v.props.Value !== undefined) st += ` <span style="color:#9fd">${esc(utf8dec(v.props.Name))}: ${esc(utf8dec(String(v.props.Value)))}</span>`;
      h += `<div>${esc(utf8dec(p.props.DisplayName || p.props.Name))}${st}</div>`;
    }
    plist.innerHTML = h;
  }
  // ----- main loop
  let last = performance.now(), acc = 0, pl = 0, frames = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
    acc += dt;
    try {
      if (ENV.paused) acc = 0; // R2W.ENV.paused = true — заморозить симуляцию (рендер продолжается; для скриншотов/отладки)
      if (acc > 0.0001) {
        const sub = acc > 1 / 25 ? 2 : 1; for (let i = 0; i < sub; i++) ENV.frame(acc / sub); acc = 0;
      }
      ENV.gui.flush();
      w3.render(dt);
      updatePrompt();
      if ((pl += dt) > 0.5) { pl = 0; updatePlayers(); }
      if (++frames === 3) finishSplash();
    } catch (e) { addLine({ level: 'err', who: 'frame', text: String(e && e.stack || e) }); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => { try { ENV.shutdown(); } catch (e) { /* */ } });
  window.addEventListener('beforeunload', () => { try { ENV.shutdown(); } catch (e) { /* */ } });
  R2W.started = true;
};
if (typeof window !== 'undefined') window.R2W = R2W;
module.exports = R2W;
