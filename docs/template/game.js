/* Браузерная демо-симуляция «Pet Collector»-подобной игры.
   Все данные (питомцы, яйца, миры, апгрейды, баланс) приходят из data.js, который генерирует roblox2web
   из Luau-исходников. Формулы ниже повторяют Formulas.lua / Economy.lua / PetService.lua оригинала. */
(function () {
'use strict';
const D = window.GAME_DATA;
const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
if (!D) { document.body.prepend(el('p', { class: 'disclaimer' }, window.I18N.ru.errData)); return; }

/* ---------------------------------------------------------------- i18n */
let lang = 'ru';
const t = (k, v) => {
  let s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  if (v) for (const p in v) s = s.split('{' + p + '}').join(v[p]);
  return s;
};

/* ---------------------------------------------------------------- данные */
const C = D.config || {};
const cn = (k, d) => (typeof C[k] === 'number' ? C[k] : d);
const PE = C.PASS_EFFECTS || {};
const pe = (k, d) => (typeof PE[k] === 'number' ? PE[k] : d);
const PETS = D.pets, EGGS = D.eggs, ZONES = D.zones, UPS = D.upgrades.list, UCONST = D.upgrades.consts;
const PET = {}; PETS.forEach(p => PET[p.Id] = p);
const EGG = {}; EGGS.forEach(e => EGG[e.Id] = e);
const ZONE = {}; ZONES.forEach(z => ZONE[z.Id] = z);
const UP = {}; UPS.forEach(u => UP[u.Id] = u);
const RAR = D.rarities || {};
const rarOrder = r => (RAR[r] && RAR[r].Order) || 1;
const rarColor = r => (RAR[r] && RAR[r].Color) || '#bebec8';
const rarScale = r => (RAR[r] && RAR[r].Scale) || 1;
const PLATFORM = D.platformSize || 180;
const GAME = D.meta.gameName;
const SAVE_KEY = 'r2w:' + (D.meta.projectName || GAME) + ':save:v1';
const DAY = 86400000;
const GP_ORDER = C.GAMEPASS_ORDER || Object.keys(C.GAMEPASSES || {});
const PR_ORDER = C.PRODUCT_ORDER || Object.keys(C.PRODUCTS || {});
const HATCH_COUNTS = Array.isArray(C.HATCH_COUNTS) ? C.HATCH_COUNTS : [1, 3];
const DAILY = Array.isArray(C.DAILY_REWARDS) ? C.DAILY_REWARDS : [];

/* ---------------------------------------------------------------- формулы (Formulas.lua) */
const F = {
  rebirthCost: r => Math.floor(Math.min(cn('REBIRTH_BASE_COST', 50000) * Math.pow(cn('REBIRTH_COST_GROWTH', 4), r), cn('MAX_COINS', 1e15))),
  rebirthMult: r => 1 + cn('REBIRTH_MULT_PER', 0.5) * r,
  rebirthGems: r => cn('REBIRTH_GEMS_BASE', 20) + cn('REBIRTH_GEMS_PER', 5) * r,
  upgradeCost(id, lvl) {
    const d = UP[id];
    if (!d || lvl >= d.MaxLevel) return null;
    if (d.Costs) return d.Costs[lvl] == null ? null : d.Costs[lvl];
    return Math.floor(d.BaseCost * Math.pow(d.Growth, lvl));
  },
  petSlots: (s, vip) => cn('BASE_PET_SLOTS', 3) + s + (vip ? pe('VIP_EXTRA_SLOTS', 1) : 0),
  bagSize: l => cn('BASE_BAG_SIZE', 30) + l * UCONST.BAG_PER_LEVEL,
  clickBase: l => 1 + l * UCONST.CLICK_PER_LEVEL,
  upgradeLuck: l => 1 + l * UCONST.LUCK_PER_LEVEL,
  walkSpeed(l, dbl) {
    let s = cn('BASE_WALKSPEED', 16) + l * UCONST.SPEED_PER_LEVEL;
    if (dbl) s *= pe('SPEED_MULT_DOUBLE', 2);
    return Math.min(s, cn('MAX_WALKSPEED', 56));
  },
};

/* ---------------------------------------------------------------- состояние */
const newState = () => {
  const up = {}; UPS.forEach(u => up[u.Id] = 0);
  const zn = {}; zn[ZONES[0].Id] = true;
  return { v: 1, coins: 0, gems: 0, totalCoins: 0, totalClicks: 0, totalHatched: 0, rebirths: 0, upgrades: up, zones: zn,
    currentZone: ZONES[0].Id, pets: {}, nextPetId: 1, equipped: [], daily: { lastDay: 0, streak: 0 },
    boosts: { Luck2: 0, Luck5: 0 }, passes: {}, premium: false, autoCollect: true, lang: 'ru', dayShift: 0, tab: 'pets' };
};
let S = newState();
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return;
    const base = newState();
    for (const k in base) if (o[k] !== undefined && typeof o[k] === typeof base[k]) base[k] = o[k];
    for (const id in base.upgrades) if (typeof base.upgrades[id] !== 'number') base.upgrades[id] = 0;
    UPS.forEach(u => { if (typeof base.upgrades[u.Id] !== 'number') base.upgrades[u.Id] = 0; });
    for (const uid in base.pets) if (!PET[base.pets[uid].id]) delete base.pets[uid];
    base.equipped = base.equipped.filter(u => base.pets[u]);
    if (!ZONE[base.currentZone] || !base.zones[base.currentZone]) base.currentZone = ZONES[0].Id;
    S = base;
  } catch (e) { /* битое сохранение игнорируем */ }
}
let dirty = false, lastSave = 0;
const touch = () => { dirty = true; };
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); dirty = false; lastSave = Date.now(); } catch (e) { /* приватный режим */ }
}

/* ---------------------------------------------------------------- экономика (Economy.lua) */
const hasPass = k => !!S.passes[k];
const isVip = () => hasPass('VIP');
const petPower = (p) => { const d = PET[p.id]; return d ? d.Power * (p.gold ? cn('GOLD_POWER_MULT', 2) : 1) : 0; };
const equippedPower = () => S.equipped.reduce((a, u) => a + (S.pets[u] ? petPower(S.pets[u]) : 0), 0);
const slots = () => F.petSlots(S.upgrades.Slots || 0, isVip());
const bagSize = () => F.bagSize(S.upgrades.Bag || 0);
const petCount = () => Object.keys(S.pets).length;
function bonusMult() {
  let m = 1;
  if (hasPass('DOUBLE_COINS')) m *= pe('COIN_MULT_DOUBLE', 2);
  if (hasPass('VIP')) m *= 1 + pe('VIP_COIN_BONUS', 0.25);
  if (S.premium) m *= 1 + pe('PREMIUM_COIN_BONUS', 0.1);
  return m;
}
function perClick() {
  const zone = ZONE[S.currentZone] || ZONES[0];
  const v = F.clickBase(S.upgrades.Click || 0) * (1 + equippedPower()) * zone.Multiplier * F.rebirthMult(S.rebirths) * bonusMult();
  return Math.max(1, Math.floor(Math.min(v, cn('MAX_COINS', 1e15))));
}
function luckBoost() {
  const now = Date.now();
  if (S.boosts.Luck5 > now) return [5, S.boosts.Luck5];
  if (S.boosts.Luck2 > now) return [2, S.boosts.Luck2];
  return [1, 0];
}
function luck() {
  let l = F.upgradeLuck(S.upgrades.Luck || 0) * luckBoost()[0];
  if (isVip()) l *= 1 + pe('VIP_LUCK_BONUS', 0.1);
  return l;
}
const walkSpeed = () => F.walkSpeed(S.upgrades.Speed || 0, hasPass('DOUBLE_SPEED'));
function addCoins(n, countTotal) {
  n = Math.floor(n); if (!(n > 0)) return;
  S.coins = Math.min(S.coins + n, cn('MAX_COINS', 1e15));
  if (countTotal !== false) S.totalCoins = Math.min(S.totalCoins + n, cn('MAX_COINS', 1e15));
  touch();
}
const addGems = n => { n = Math.floor(n); if (n > 0) { S.gems = Math.min(S.gems + n, cn('MAX_GEMS', 1e9)); touch(); } };
function trySpend(cur, n) {
  if (cur === 'Gems') { if (S.gems < n) return false; S.gems -= n; } else { if (S.coins < n) return false; S.coins -= n; }
  touch(); return true;
}
const canAfford = (cur, n) => (cur === 'Gems' ? S.gems : S.coins) >= n;

function getOdds(eggId, lk) {
  const egg = EGG[eggId]; let total = 0; const w = [];
  egg.Pets.forEach(e => { let x = e.Weight; if (rarOrder(PET[e.Id].Rarity) >= (D.luckMinOrder || 3)) x *= Math.max(lk, 1); w.push(x); total += x; });
  return egg.Pets.map((e, i) => ({ Id: e.Id, Chance: w[i] / total * 100 }));
}
function roll(eggId, lk, r) {
  const odds = getOdds(eggId, lk); let acc = 0;
  for (const o of odds) { acc += o.Chance / 100; if (r < acc) return o.Id; }
  return odds.length ? odds[odds.length - 1].Id : null;
}

/* ---------------------------------------------------------------- форматирование */
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString(t('locale'));
  let i = 0, x = n;
  while (x >= 1000 && i < SUF.length - 1) { x /= 1000; i++; }
  return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, '') + SUF[i];
}
const fmtP = n => (n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(2)).replace(/\.?0+$/, '');
const fmtT = ms => {
  let s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); s %= 60;
  const p = x => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
};
const cur = c => (c === 'Gems' ? '💎' : '🪙');
const price = (c, n) => `${cur(c)} ${fmt(n)}`;

/* ---------------------------------------------------------------- уведомления */
function toast(msg, kind) {
  const box = $('#toasts'); const e = el('div', { class: 'toast ' + (kind || '') }, msg); box.append(e);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => e.remove(), 2800);
}

/* ---------------------------------------------------------------- рисование питомцев */
function drawPet(g, def, cx, base, size, tm, opt) {
  opt = opt || {};
  const L = def.Look || {}; const body = L.Body || '#ccc', acc = L.Accent || '#888';
  const shape = L.Shape || 'Round', ears = L.Ears || 'None', ex = L.Extras || [];
  const dir = opt.dir || 1;
  const k = size / 100; // 100 = высота эскиза
  const sw = shape === 'Wide' ? 40 : shape === 'Tall' ? 28 : 34, sh = shape === 'Tall' ? 44 : shape === 'Wide' ? 28 : 36;
  const by = base - (sh + 6) * k; // центр тела
  const bob = Math.sin(tm * 6 + (opt.ph || 0)) * 1.5 * k * (opt.moving ? 1.5 : 0.6);
  g.save(); g.translate(cx, by + bob); g.scale(dir, 1);
  const has = x => ex.indexOf(x) >= 0;
  const E = (x, y, rx, ry, c, st) => { g.beginPath(); g.ellipse(x * k, y * k, rx * k, ry * k, 0, 0, 7); g.fillStyle = c; g.fill(); if (st) { g.lineWidth = 1.5 * k; g.strokeStyle = st; g.stroke(); } };
  const P = (pts, c) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0] * k, p[1] * k) : g.moveTo(p[0] * k, p[1] * k)); g.closePath(); g.fillStyle = c; g.fill(); };
  if (opt.gold) { g.shadowColor = '#ffd046'; g.shadowBlur = 14 * k; }
  if (has('Halo')) { g.beginPath(); g.ellipse(0, (-sh - 8) * k, 16 * k, 5 * k, 0, 0, 7); g.lineWidth = 3 * k; g.strokeStyle = '#ffe680'; g.stroke(); }
  if (has('Wings')) { const w = Math.sin(tm * 9) * 5; P([[-sw + 6, -4], [-sw - 18, -14 - w], [-sw - 8, 10]], acc); P([[sw - 6, -4], [sw + 18, -14 - w], [sw + 8, 10]], acc); }
  if (has('Fins')) { P([[-sw + 4, 2], [-sw - 12, 14], [-sw + 6, 14]], acc); P([[sw - 4, 2], [sw + 12, 14], [sw - 6, 14]], acc); }
  if (has('Tail')) { E(-sw - 6, 8, 11, 7, acc); }
  if (has('Flame')) { P([[-sw + 2, 6], [-sw - 14, -6 + Math.sin(tm * 12) * 3], [-sw - 4, 16]], '#ff8a2a'); P([[-sw + 2, 8], [-sw - 8, 2], [-sw - 2, 14]], '#ffd24a'); }
  if (ears !== 'None') {
    const ey = -sh + 4;
    [-1, 1].forEach(s => {
      if (ears === 'Round') E(s * (sw * .6), ey, 9, 9, body, acc);
      else if (ears === 'Long') E(s * (sw * .5), ey - 14, 7, 20, body, acc);
      else P([[s * (sw * .6 - 8), ey + 6], [s * (sw * .6), ey - 20], [s * (sw * .6 + 8), ey + 6]], body);
    });
  }
  E(0, 0, sw, sh, body, 'rgba(0,0,0,.25)');
  E(0, sh * .35, sw * .62, sh * .5, acc);
  g.shadowBlur = 0;
  if (has('Horn')) P([[-6, -sh + 2], [0, -sh - 20], [6, -sh + 2]], '#fff0c8');
  if (has('Antenna')) { g.strokeStyle = acc; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(-6 * k, -sh * k + 2 * k); g.lineTo(-12 * k, (-sh - 14) * k); g.moveTo(6 * k, -sh * k + 2 * k); g.lineTo(12 * k, (-sh - 14) * k); g.stroke(); E(-12, -sh - 14, 3.5, 3.5, acc); E(12, -sh - 14, 3.5, 3.5, acc); }
  if (has('Leaf')) { E(0, -sh - 6, 5, 11, '#4fc25a'); }
  if (has('Crown')) P([[-12, -sh + 2], [-12, -sh - 12], [-6, -sh - 5], [0, -sh - 14], [6, -sh - 5], [12, -sh - 12], [12, -sh + 2]], '#ffd24a');
  E(-sw * .38, -sh * .15, 5, 6, '#fff'); E(sw * .38, -sh * .15, 5, 6, '#fff');
  E(-sw * .38 + 1, -sh * .15, 2.6, 3.4, '#222'); E(sw * .38 + 1, -sh * .15, 2.6, 3.4, '#222');
  if (has('Beak')) P([[-4, 0], [10, 3], [-4, 8]], '#ff9a2a');
  g.restore();
}
function petCanvas(id, gold, px) {
  const c = el('canvas', { width: px * 2, height: px * 2 }); c.style.width = px + 'px'; c.style.height = px + 'px';
  drawPet(c.getContext('2d'), PET[id], px, px * 2 - 10, px * 1.5, 0, { gold });
  return c;
}
function eggArt(egg, w, h) {
  const c = el('canvas', { width: w, height: h });
  drawEgg(c.getContext('2d'), egg, w / 2, h - 10, h * 0.85, 0);
  return c;
}
function drawEgg(g, egg, cx, base, h, tm) {
  const w = h * 0.38, y = base - h / 2;
  g.save(); g.translate(cx, y); g.rotate(Math.sin(tm * 3) * 0.04);
  g.beginPath(); g.ellipse(0, 0, w, h / 2, 0, 0, 7); g.fillStyle = egg.Color; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.3)'; g.stroke();
  g.fillStyle = egg.Pattern;
  [[-.4, -.2, .16], [.35, .05, .14], [-.1, .3, .18], [.15, -.45, .1], [-.35, .15, .1]].forEach(s => { g.beginPath(); g.ellipse(s[0] * w, s[1] * h / 2, s[2] * w, s[2] * w, 0, 0, 7); g.fill(); });
  g.restore();
}

/* ---------------------------------------------------------------- действия (серверная логика оригинала) */
let tokens = cn('CLICK_BURST', 6), lastRefill = performance.now();
const floaters = [];
function collect(n, fromAuto) {
  n = n || 1;
  if (!fromAuto) {
    const now = performance.now();
    tokens = Math.min(cn('CLICK_BURST', 6), tokens + (now - lastRefill) / 1000 * cn('MAX_CLICKS_PER_SECOND', 12)); lastRefill = now;
    if (tokens < 1) return false;
    tokens -= 1;
  }
  const pc = perClick();
  addCoins(pc * n); S.totalClicks += n;
  floaters.push({ x: player.x + (Math.random() - .5) * 4, z: player.z, y: 7, vy: 9, life: 0.9, text: '+' + fmt(pc * n), color: '#ffd046' });
  return true;
}
function nearestEgg(maxDist) {
  let best = null, bd = maxDist;
  eggSlots().forEach(s => { const d = Math.hypot(s.x - player.x, s.z - player.z); if (d <= bd) { bd = d; best = s; } });
  return best;
}
function hatch(eggId, n) {
  const egg = EGG[eggId];
  if (!egg || HATCH_COUNTS.indexOf(n) < 0) return toast('Bad request', 'error'), null;
  if (!S.zones[egg.Zone]) return toast(t('unlockFirst'), 'error'), null;
  if (S.currentZone !== egg.Zone || !nearestEggFor(eggId, cn('EGG_MAX_DISTANCE', 45))) return toast(t('tooFar'), 'error'), null;
  if (bagSize() - petCount() < n) return toast(t('bagFull'), 'error'), null;
  if (!trySpend(egg.Currency, egg.Price * n)) return toast(t(egg.Currency === 'Gems' ? 'notEnoughGems' : 'notEnoughCoins'), 'error'), null;
  const lk = luck(), res = [];
  for (let i = 0; i < n; i++) {
    const id = roll(egg.Id, lk, Math.random());
    if (!id) continue;
    const gold = Math.random() < cn('GOLD_CHANCE', 0.02);
    const uid = 'p' + (S.nextPetId++);
    S.pets[uid] = { id, gold }; S.totalHatched++;
    res.push({ uid, id, gold });
  }
  touch(); refreshAll();
  return res;
}
function nearestEggFor(eggId, maxDist) {
  const s = eggSlots().find(x => x.egg.Id === eggId);
  return !!s && Math.hypot(s.x - player.x, s.z - player.z) <= maxDist;
}
function equip(uid) {
  if (!S.pets[uid]) return toast(t('petNotFound'), 'error');
  if (S.equipped.indexOf(uid) >= 0) return;
  if (S.equipped.length >= slots()) return toast(t('noFreeSlot'), 'error');
  S.equipped.push(uid); touch(); refreshAll();
}
function unequip(uid) { const i = S.equipped.indexOf(uid); if (i >= 0) { S.equipped.splice(i, 1); touch(); refreshAll(); } }
function equipBest() {
  const list = Object.keys(S.pets).map(u => ({ u, p: petPower(S.pets[u]) }));
  list.sort((a, b) => a.p !== b.p ? b.p - a.p : (a.u < b.u ? -1 : a.u > b.u ? 1 : 0));
  S.equipped = list.slice(0, Math.min(slots(), list.length)).map(x => x.u); touch(); refreshAll();
}
const sellValue = p => Math.floor(petPower(p) * cn('SELL_VALUE_PER_POWER', 40));
function sell(uid) {
  const p = S.pets[uid];
  if (!p) return toast(t('petNotFound'), 'error');
  if (S.equipped.indexOf(uid) >= 0) return toast(t('unequipFirst'), 'error');
  const v = sellValue(p); delete S.pets[uid]; addCoins(v, false); touch(); toast(t('sold', { v: fmt(v) }), 'success'); refreshAll();
}
function buyUpgrade(id) {
  const d = UP[id]; if (!d) return;
  const lvl = S.upgrades[id] || 0, cost = F.upgradeCost(id, lvl);
  if (cost == null) return;
  if (!trySpend(d.Currency, cost)) return toast(t(d.Currency === 'Gems' ? 'notEnoughGems' : 'notEnoughCoins'), 'error');
  S.upgrades[id] = lvl + 1; touch(); toast(t('upgradeBought', { name: d.Name, l: lvl + 1 }), 'success'); refreshAll();
}
function unlockZone(id) {
  const z = ZONE[id]; if (!z || S.zones[id]) return;
  if (S.rebirths < z.RequiresRebirths) return toast(t('requiresRebirth', { n: z.RequiresRebirths }), 'error');
  if (!trySpend('Coins', z.UnlockCost)) return toast(t('notEnoughCoins'), 'error');
  S.zones[id] = true; touch(); toast(t('worldUnlocked', { name: z.Name }), 'success'); refreshAll();
}
function teleport(id) {
  const z = ZONE[id]; if (!z || !S.zones[id]) return toast(t('worldLocked'), 'error');
  S.currentZone = id; spawnPlayer(); touch(); toast(t('teleported', { name: z.Name }), 'success'); refreshAll();
}
function rebirth() {
  const cost = F.rebirthCost(S.rebirths);
  if (S.coins < cost) return toast(t('notEnoughCoins'), 'error');
  const gems = F.rebirthGems(S.rebirths);
  S.coins = 0; S.upgrades.Click = 0; S.rebirths++; addGems(gems); touch();
  toast(t('rebirthDone', { n: S.rebirths, m: fmtP(F.rebirthMult(S.rebirths)), g: gems }), 'reward'); refreshAll();
}
const today = () => Math.floor((Date.now() + S.dayShift * DAY) / DAY);
function dailyInfo() {
  const td = today(), d = S.daily, can = d.lastDay < td;
  let streak = d.lastDay === td - 1 ? d.streak + 1 : 1;
  if (!can) streak = d.streak + 1;
  const n = DAILY.length || 1;
  return { can, day: ((streak - 1) % n) + 1, streak: d.streak, left: (td + 1) * DAY - (Date.now() + S.dayShift * DAY) };
}
function claimDaily() {
  if (!DAILY.length) return;
  const td = today();
  if (S.daily.lastDay >= td) return toast(t('dailyClaimed'), 'error');
  const streak = S.daily.lastDay === td - 1 ? S.daily.streak + 1 : 1;
  const day = ((streak - 1) % DAILY.length) + 1, r = DAILY[day - 1];
  S.daily.lastDay = td; S.daily.streak = streak;
  const mult = isVip() ? pe('VIP_DAILY_MULT', 2) : 1;
  let gems = (r.Gems || 0) * mult;
  if (S.premium) gems += pe('PREMIUM_DAILY_GEMS', 5);
  const coins = perClick() * (r.Clicks || 0) * mult;
  addGems(gems); addCoins(coins, false);
  if (r.Luck2Minutes) {
    S.boosts.Luck2 = Math.max(S.boosts.Luck2, Date.now()) + r.Luck2Minutes * 60000 * mult;
  }
  touch(); toast(t('dailyDone', { d: day, g: gems }), 'reward'); refreshAll();
}
function grantPass(key, on) { if (on) S.passes[key] = true; else delete S.passes[key]; touch(); refreshAll(); }
function grantProduct(key) {
  const d = (C.PRODUCTS || {})[key]; if (!d) return;
  if (d.Kind === 'Gems') { addGems(d.Amount); toast(t('gotGems', { n: fmt(d.Amount) }), 'reward'); }
  else if (d.Kind === 'Coins') { const a = Math.max(d.Min || 0, perClick() * (d.Clicks || 0)); addCoins(a); toast(t('gotCoins', { n: fmt(a) }), 'reward'); }
  else if (d.Kind === 'Luck') {
    S.boosts[d.Boost] = Math.max(S.boosts[d.Boost] || 0, Date.now()) + d.Seconds * 1000; touch();
    toast(t('gotLuck', { m: d.Multiplier, min: Math.round(d.Seconds / 60) }), 'reward');
  }
  refreshAll();
}

/* ---------------------------------------------------------------- мир (сцена) */
const canvas = $('#scene'), g = canvas.getContext('2d');
const player = { x: 0, z: 18, fx: 0, fz: -1, moving: false, tx: null, tz: null, step: 0 };
const camera = { x: 0, z: 18 };
let renderPets = []; // {x,z,uid,id,gold,ph}
function spawnPlayer() {
  player.x = (Math.random() - .5) * 8; player.z = 18; player.fx = 0; player.fz = -1; player.tx = null; camera.x = player.x; camera.z = player.z;
  renderPets = [];
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let decorCache = {};
function decorFor(zone) {
  if (decorCache[zone.Id]) return decorCache[zone.Id];
  const r = rng(hash(zone.Id)), out = [], half = PLATFORM / 2 - 6;
  for (let i = 0; i < 46; i++) {
    const x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
    if (Math.abs(x) < 62 && z > -26 && z < 40 && r() < .96) continue; // центр свободен
    out.push({ x, z, kind: zone.Decor, s: .8 + r() * .7, v: r() });
  }
  return decorCache[zone.Id] = out;
}
function eggSlots() {
  const zone = ZONE[S.currentZone], list = EGGS.filter(e => e.Zone === zone.Id), n = list.length, out = [];
  list.forEach((egg, i) => out.push({ egg, x: (i - (n - 1) / 2) * 26, z: -10 }));
  return out;
}
const boardPos = () => ({ x: -40, z: -12 });
let view = { W: 960, H: 540, s: 18 };
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(280, Math.round(r.width)), H = Math.max(200, Math.round(r.height));
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = { W, H, s: Math.max(W / 52, 9) };
}
const K = 0.6;
const px = x => view.W / 2 + (x - camera.x) * view.s;
const pz = (z, y) => view.H * 0.58 + (z - camera.z) * view.s * K - (y || 0) * view.s;
const keys = {};
function inputVec() {
  let x = 0, z = 0;
  if (keys.ArrowLeft || keys.a || keys.KeyA) x -= 1; if (keys.ArrowRight || keys.d || keys.KeyD) x += 1;
  if (keys.ArrowUp || keys.w || keys.KeyW) z -= 1; if (keys.ArrowDown || keys.s || keys.KeyS) z += 1;
  return [x, z];
}
function stepWorld(dt) {
  const half = PLATFORM / 2 - 3;
  let [ix, iz] = inputVec(), mv = false;
  if (ix || iz) { const l = Math.hypot(ix, iz); ix /= l; iz /= l; player.tx = null; mv = true; }
  else if (player.tx != null) {
    const dx = player.tx - player.x, dz = player.tz - player.z, d = Math.hypot(dx, dz);
    if (d < 0.6) player.tx = null; else { ix = dx / d; iz = dz / d; mv = true; }
  }
  player.moving = mv;
  if (mv) {
    const sp = walkSpeed(); // студов в секунду, как Humanoid.WalkSpeed
    player.x = Math.max(-half, Math.min(half, player.x + ix * sp * dt)); player.z = Math.max(-half, Math.min(half, player.z + iz * sp * dt));
    player.fx = ix; player.fz = iz; player.step += dt * 9;
  }
  camera.x += (player.x - camera.x) * (1 - Math.exp(-dt * 6)); camera.z += (player.z - camera.z) * (1 - Math.exp(-dt * 6));
  // питомцы (PetFollower.client.lua)
  const eq = S.equipped.filter(u => S.pets[u]).slice(0, 8), alpha = 1 - Math.exp(-dt * 9), cnt = eq.length;
  renderPets = renderPets.filter(r => eq.indexOf(r.uid) >= 0);
  eq.forEach((uid, idx) => {
    let r = renderPets.find(q => q.uid === uid);
    if (!r) { r = { uid, x: null, z: 0, ph: idx * 1.7 }; renderPets.push(r); }
    r.id = S.pets[uid].id; r.gold = S.pets[uid].gold; r.idx = idx + 1;
    let ox = 0, oz = 4;
    if (cnt > 1) {
      const radius = 4.5 + Math.floor((cnt - 1) / 4) * 1.5, spread = Math.min(150, 40 + cnt * 18) * Math.PI / 180;
      const a = -spread / 2 + spread * idx / (cnt - 1); ox = Math.sin(a) * radius; oz = Math.cos(a) * radius;
    }
    // CFrame: +X = вправо от взгляда, +Z локальный = назад
    const lx = player.fx, lz = player.fz, rx = -lz, rz = lx;
    const tx = player.x + rx * ox - lx * oz, tz = player.z + rz * ox - lz * oz;
    if (r.x == null || Math.hypot(r.x - tx, r.z - tz) > 40) { r.x = tx; r.z = tz; } else { r.x += (tx - r.x) * alpha; r.z += (tz - r.z) * alpha; }
    r.dir = lx >= 0 ? 1 : -1;
  });
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94; if (f.life <= 0) floaters.splice(i, 1); }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = n >> 8 & 255, b = n & 255;
  const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(gg)},${c(b)})`;
}
function drawDecor(d, zone) {
  const x = px(d.x), y = pz(d.z), s = view.s * d.s;
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y, s * 1.6, s * .6, 0, 0, 7); g.fill();
  if (d.kind === 'Cacti') { g.fillStyle = '#4fa857'; g.fillRect(x - s * .5, y - s * 5, s, s * 5); g.fillRect(x - s * 1.7, y - s * 3.4, s * 1.2, s * .8); g.fillRect(x - s * 1.7, y - s * 4.4, s * .7, s * 1.8); g.fillRect(x + s * .5, y - s * 3.0, s * 1.2, s * .8); g.fillRect(x + s * 1.0, y - s * 4.0, s * .7, s * 1.8); }
  else if (d.kind === 'Crystals') { g.fillStyle = zone.Accent; [[0, 6, 1.1], [-1.4, 4, .8], [1.4, 3.6, .8]].forEach(c => { g.beginPath(); g.moveTo(x + (c[0] - c[2]) * s, y); g.lineTo(x + c[0] * s, y - c[1] * s); g.lineTo(x + (c[0] + c[2]) * s, y); g.fill(); }); }
  else if (d.kind === 'Rocks') { g.fillStyle = '#5c4a4a'; g.beginPath(); g.ellipse(x, y - s * .8, s * 1.8, s * 1.1, 0, 0, 7); g.fill(); g.fillStyle = zone.Accent; g.fillRect(x - s * .3, y - s * 1.3, s * .6, s * .15); }
  else { g.fillStyle = '#7a5230'; g.fillRect(x - s * .35, y - s * 3, s * .7, s * 3); g.fillStyle = shade(zone.Floor.length === 7 ? zone.Floor : '#68be54', 0.78 + d.v * .2); g.beginPath(); g.arc(x, y - s * 4, s * 1.7, 0, 7); g.arc(x - s, y - s * 3.3, s * 1.2, 0, 7); g.arc(x + s, y - s * 3.3, s * 1.2, 0, 7); g.fill(); }
}
function drawPlayer(tm) {
  const x = px(player.x), y = pz(player.z), s = view.s;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y, s * 1.3, s * .5, 0, 0, 7); g.fill();
  const sw = player.moving ? Math.sin(player.step) * .9 : 0;
  g.fillStyle = '#3c5aa8'; g.fillRect(x - s * .75, y - s * 2.2 + sw * s * .2, s * .65, s * 2.2); g.fillRect(x + s * .1, y - s * 2.2 - sw * s * .2, s * .65, s * 2.2);
  g.fillStyle = '#e0453c'; g.fillRect(x - s * 1.0, y - s * 4.4, s * 2.0, s * 2.3);
  g.fillStyle = '#f2c28a'; g.fillRect(x - s * 1.55, y - s * 4.3 + sw * s * .25, s * .5, s * 1.9); g.fillRect(x + s * 1.05, y - s * 4.3 - sw * s * .25, s * .5, s * 1.9);
  g.fillRect(x - s * .8, y - s * 6.4, s * 1.6, s * 1.9);
  g.fillStyle = '#222'; g.fillRect(x - s * .45, y - s * 5.7, s * .22, s * .3); g.fillRect(x + s * .25, y - s * 5.7, s * .22, s * .3);
  if (isVip()) { g.fillStyle = '#ffd046'; g.font = `700 ${s * 1.1}px sans-serif`; g.textAlign = 'center'; g.fillText('[VIP]', x, y - s * 7.0); }
}
function drawBoard(tm) {
  const b = boardPos(), x = px(b.x), y = pz(b.z), s = view.s;
  g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x, y, s * 2.4, s * .7, 0, 0, 7); g.fill();
  g.fillStyle = '#5b3c22'; g.fillRect(x - s * 2, y - s * 3, s * .5, s * 3); g.fillRect(x + s * 1.5, y - s * 3, s * .5, s * 3);
  g.fillStyle = '#243052'; g.fillRect(x - s * 3, y - s * 7, s * 6, s * 4.2); g.strokeStyle = '#ffd046'; g.lineWidth = 2; g.strokeRect(x - s * 3, y - s * 7, s * 6, s * 4.2);
  g.fillStyle = '#ffd046'; g.textAlign = 'center'; g.font = `800 ${Math.max(9, s * .85)}px sans-serif`; g.fillText('TOP', x, y - s * 5.8);
  g.fillStyle = '#fff'; g.font = `700 ${Math.max(8, s * .7)}px sans-serif`; g.fillText(t('sceneBoard'), x, y - s * 4.3);
}
function drawEggSlot(slot, tm, near) {
  const x = px(slot.x), y = pz(slot.z), s = view.s;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y, s * 2.2, s * .8, 0, 0, 7); g.fill();
  g.fillStyle = '#6b6f86'; g.beginPath(); g.ellipse(x, y - s * .3, s * 2, s * .7, 0, 0, 7); g.fill();
  if (near) { g.strokeStyle = '#ffd046'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y - s * .3, s * 2.6, s * .95, 0, 0, 7); g.stroke(); }
  if (slot.egg.Currency === 'Gems') { g.shadowColor = '#7fe8ff'; g.shadowBlur = 16; }
  drawEgg(g, slot.egg, x, y - s * .6, s * 5.2, tm + slot.x);
  g.shadowBlur = 0;
  g.textAlign = 'center'; g.font = `700 ${Math.max(9, s * .72)}px sans-serif`;
  const label = slot.egg.Name, w = g.measureText(label).width + 10;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - w / 2, y - s * 7.4, w, s * 1.1 + 4);
  g.fillStyle = '#fff'; g.fillText(label, x, y - s * 6.5 + 2);
  g.fillStyle = slot.egg.Currency === 'Gems' ? '#64dcff' : '#ffd046'; g.fillText(price(slot.egg.Currency, slot.egg.Price), x, y - s * 5.6 + 4);
}
function drawScene(tm) {
  const { W, H } = view, zone = ZONE[S.currentZone] || ZONES[0];
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, zone.Sky); sky.addColorStop(1, shade(zone.Sky.length === 7 ? zone.Sky : '#96cdff', 0.55));
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const half = PLATFORM / 2, x0 = px(-half), x1 = px(half), y0 = pz(-half), y1 = pz(half);
  g.fillStyle = shade(zone.Floor, .55); g.fillRect(x0, y1, x1 - x0, view.s * 3); // боковая грань
  g.fillStyle = zone.Floor; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = 'rgba(0,0,0,.06)';
  const cell = 10;
  for (let gx = -half; gx < half; gx += cell) for (let gz = -half; gz < half; gz += cell) if (((gx / cell + gz / cell) & 1) === 0) g.fillRect(px(gx), pz(gz), cell * view.s + 1, cell * view.s * K + 1);
  g.strokeStyle = zone.Accent; g.lineWidth = 3; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // сортировка по глубине
  const items = [];
  decorFor(zone).forEach(d => items.push({ z: d.z, f: () => drawDecor(d, zone) }));
  const near = nearestEgg(14);
  eggSlots().forEach(s => items.push({ z: s.z, f: () => drawEggSlot(s, tm, near === s) }));
  if (zone.Id === ZONES[0].Id) items.push({ z: boardPos().z, f: () => drawBoard(tm) });
  renderPets.forEach(r => items.push({ z: r.z, f: () => {
    const def = PET[r.id], sc = rarScale(def.Rarity), sz = view.s * 3.3 * sc;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(px(r.x), pz(r.z), sz * .35, sz * .12, 0, 0, 7); g.fill();
    drawPet(g, def, px(r.x), pz(r.z, 0.6 + Math.sin(tm * 3 + r.ph) * .25), sz, tm, { gold: r.gold, dir: r.dir, ph: r.ph, moving: player.moving });
  } }));
  items.push({ z: player.z, f: () => drawPlayer(tm) });
  items.sort((a, b) => a.z - b.z).forEach(i => i.f());
  if (player.tx != null) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.ellipse(px(player.tx), pz(player.tz), view.s * .8, view.s * .4, 0, 0, 7); g.stroke(); }
  g.textAlign = 'center';
  floaters.forEach(f => { g.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5)); g.fillStyle = f.color; g.strokeStyle = '#000'; g.lineWidth = 3; g.font = `800 ${Math.max(14, view.s * 1.2)}px sans-serif`; const x = px(f.x), y = pz(f.z, f.y + 6); g.strokeText(f.text, x, y); g.fillText(f.text, x, y); g.globalAlpha = 1; });
  if (near) { const w = near; $('#eggPrompt').classList.remove('hidden'); const txt = t('openEgg') + ' [E] — ' + w.egg.Name; if ($('#eggPrompt').textContent !== txt) $('#eggPrompt').textContent = txt; $('#eggPrompt').dataset.egg = w.egg.Id; }
  else $('#eggPrompt').classList.add('hidden');
}

/* ---------------------------------------------------------------- UI */
const TABS = ['pets', 'upgrades', 'worlds', 'rebirth', 'daily', 'shop', 'top', 'stats', 'demo'];
const TABKEY = { pets: 'tabPets', upgrades: 'tabUpgrades', worlds: 'tabWorlds', rebirth: 'tabRebirth', daily: 'tabDaily', shop: 'tabShop', top: 'tabTop', stats: 'tabStats', demo: 'tabDemo' };
let hudEls = null;
function buildHud() {
  const hud = $('#hud'); hud.innerHTML = ''; hudEls = {};
  [['coins', 'c-coin', '🪙'], ['gems', 'c-gem', '💎'], ['perClick', '', '👆'], ['rebirths', 'c-reb', '♻️'], ['world', '', '🌍'], ['multiplier', '', '✖️']].forEach(([k, cls, ic]) => {
    const b = el('b'); hudEls[k] = b; hud.append(el('div', { class: 'st ' + cls }, el('small', { 'data-k': k }, ic + ' ' + t(k)), b));
  });
}
function updateHud() {
  if (!hudEls) return;
  const z = ZONE[S.currentZone] || ZONES[0];
  const vals = { coins: fmt(S.coins), gems: fmt(S.gems), perClick: fmt(perClick()), rebirths: String(S.rebirths), world: z.Name, multiplier: '×' + fmtP(z.Multiplier * F.rebirthMult(S.rebirths) * bonusMult()) };
  for (const k in vals) if (hudEls[k].textContent !== vals[k]) hudEls[k].textContent = vals[k];
  const [m, until] = luckBoost();
  let bs = $('#boostLine');
  if (m > 1) { if (!bs) { bs = el('div', { id: 'boostLine', class: 'hint' }); $('#hud').after(bs); } bs.textContent = '🍀 ' + t('boost', { m, t: fmtT(until - Date.now()) }); } else if (bs) bs.remove();
  // доступность кнопок с ценой
  document.querySelectorAll('#panel [data-cost]').forEach(b => { b.disabled = !canAfford(b.dataset.cur, +b.dataset.cost); });
  const ab = $('#autoBtn');
  const auto = hasPass('AUTO_COLLECT');
  const txt = auto ? (S.autoCollect ? t('autoOn') : t('autoOff')) : t('autoNeed');
  if (ab.textContent !== txt) ab.textContent = txt;
  ab.classList.toggle('on', auto && S.autoCollect);
  ab.disabled = !auto;
  const dt = $('#dailyTimer'); if (dt) dt.textContent = t('dailyNext', { t: fmtT(dailyInfo().left) });
}
function renderTabs() {
  const nav = $('#tabs'); nav.innerHTML = '';
  TABS.forEach(k => nav.append(el('button', { type: 'button', role: 'tab', 'data-tab': k, class: S.tab === k ? 'on' : '', onclick: () => { S.tab = k; touch(); renderTabs(); renderPanel(); } }, t(TABKEY[k]))));
}
function demoTag() { return el('span', { class: 'demoTag' }, t('demoBadge')); }
function rarSpan(r) { return el('span', { class: 'rar', style: 'color:' + rarColor(r) }, r); }
function costBtn(label, curr, cost, fn, cls) {
  return el('button', { type: 'button', class: cls || '', 'data-cost': cost, 'data-cur': curr, onclick: fn, disabled: !canAfford(curr, cost) }, label);
}
function renderPanel() {
  const p = $('#panel'); p.innerHTML = '';
  ({ pets: panelPets, upgrades: panelUpgrades, worlds: panelWorlds, rebirth: panelRebirth, daily: panelDaily, shop: panelShop, top: panelTop, stats: panelStats, demo: panelDemo }[S.tab] || panelPets)(p);
  updateHud();
}
function refreshAll() { updateHud(); renderPanel(); }
function panelPets(p) {
  const ids = Object.keys(S.pets);
  p.append(el('div', { class: 'note' }, `${t('slots')}: ${S.equipped.length}/${slots()} · ${t('bag')}: ${ids.length}/${bagSize()} · ` + t('petsBonus', { p: fmt(equippedPower()), m: fmtP(1 + equippedPower()) })));
  p.append(el('div', { class: 'btns' }, el('button', { type: 'button', class: 'green', id: 'equipBest', onclick: equipBest }, t('equipBest'))));
  if (!ids.length) { p.append(el('p', { class: 'note' }, t('noPets'))); return; }
  ids.sort((a, b) => petPower(S.pets[b]) - petPower(S.pets[a]) || (a < b ? -1 : 1));
  const grid = el('div', { class: 'petGrid' });
  ids.forEach(uid => {
    const o = S.pets[uid], d = PET[o.id], eq = S.equipped.indexOf(uid) >= 0;
    grid.append(el('div', { class: 'pet' + (eq ? ' eq' : ''), 'data-uid': uid },
      o.gold ? el('span', { class: 'goldTag' }, '★ ' + t('gold')) : null,
      petCanvas(o.id, o.gold, 72), el('b', null, d.Name), el('small', null, rarSpan(d.Rarity), ` · ${t('power')} ${fmt(petPower(o))}`),
      el('div', { class: 'row' },
        eq ? el('button', { type: 'button', class: 'ghost', onclick: () => unequip(uid) }, t('unequip')) : el('button', { type: 'button', class: 'green', onclick: () => equip(uid) }, t('equip')),
        el('button', { type: 'button', class: 'red', onclick: () => sell(uid), title: t('sellFor', { v: fmt(sellValue(o)) }) }, t('sell') + ' ' + fmt(sellValue(o))))));
  });
  p.append(grid);
}
function upEffect(id, lvl) {
  if (id === 'Click') return `${t('perClick')}: ${F.clickBase(lvl)}`;
  if (id === 'Speed') return `WalkSpeed: ${F.walkSpeed(lvl, false)}`;
  if (id === 'Luck') return `${t('luckNow', { luck: fmtP(F.upgradeLuck(lvl)) })}`;
  if (id === 'Bag') return `${t('bag')}: ${F.bagSize(lvl)}`;
  if (id === 'Slots') return `${t('slots')}: ${F.petSlots(lvl, false)}`;
  return '';
}
function panelUpgrades(p) {
  UPS.forEach(u => {
    const lvl = S.upgrades[u.Id] || 0, cost = F.upgradeCost(u.Id, lvl);
    p.append(el('div', { class: 'card', 'data-up': u.Id }, el('div', { class: 'meta' }, el('b', null, u.Name + ' — ' + t('level', { l: lvl, max: u.MaxLevel })), el('small', null, u.Description), el('small', null, upEffect(u.Id, lvl) + (cost != null ? ' → ' + upEffect(u.Id, lvl + 1) : ''))),
      cost == null ? el('button', { disabled: true, type: 'button' }, t('maxed')) : costBtn(t('buy') + ' ' + price(u.Currency, cost), u.Currency, cost, () => buyUpgrade(u.Id), 'gold')));
  });
}
function panelWorlds(p) {
  ZONES.forEach(z => {
    const owned = !!S.zones[z.Id], here = S.currentZone === z.Id;
    let act;
    if (here) act = el('button', { disabled: true, type: 'button' }, t('current'));
    else if (owned) act = el('button', { class: 'green', type: 'button', onclick: () => teleport(z.Id) }, t('teleport'));
    else if (S.rebirths < z.RequiresRebirths) act = el('button', { disabled: true, type: 'button' }, t('requiresRebirth', { n: z.RequiresRebirths }));
    else act = costBtn(t('unlock') + ' ' + price('Coins', z.UnlockCost), 'Coins', z.UnlockCost, () => unlockZone(z.Id), 'gold');
    p.append(el('div', { class: 'card', 'data-zone': z.Id, style: `border-left:8px solid ${z.Floor}` }, el('div', { class: 'meta' }, el('b', null, z.Name), el('small', null, `${t('multiplier')} ×${z.Multiplier}` + (z.RequiresRebirths ? ` · ${t('requiresRebirth', { n: z.RequiresRebirths })}` : '')), el('small', null, owned ? t('owned') : t('unlockCost', { c: fmt(z.UnlockCost) }))), act));
  });
}
function panelRebirth(p) {
  const cost = F.rebirthCost(S.rebirths), pct = Math.round(cn('REBIRTH_MULT_PER', 0.5) * 100);
  p.append(el('h3', null, t('rebirthTitle')), el('p', { class: 'note' }, t('rebirthText', { pct })),
    el('div', { class: 'card' }, el('div', { class: 'meta' }, el('b', null, `${t('rebirthNow')}: ×${fmtP(F.rebirthMult(S.rebirths))}`), el('small', null, `${t('rebirthNext')}: ×${fmtP(F.rebirthMult(S.rebirths + 1))}`), el('small', null, `${t('rebirthGems')}: 💎 ${F.rebirthGems(S.rebirths)}`), el('small', null, `${t('rebirthCost')}: ${price('Coins', cost)}`)),
      costBtn(t('rebirthDo'), 'Coins', cost, rebirth, 'gold')));
  p.querySelector('.card button').id = 'rebirthBtn';
}
function panelDaily(p) {
  p.append(el('h3', null, t('dailyTitle')));
  if (!DAILY.length) { p.append(el('p', { class: 'note' }, '—')); return; }
  const info = dailyInfo();
  p.append(el('p', { class: 'note' }, t('dailyStreak', { n: S.daily.streak })));
  DAILY.forEach((r, i) => {
    const cur = i + 1 === info.day;
    p.append(el('div', { class: 'card', style: cur ? 'outline:2px solid var(--gold)' : '' }, el('div', { class: 'meta' }, el('b', null, t('dailyDay', { d: i + 1 })), el('small', null, `💎 ${r.Gems}` + (r.Clicks ? ` · 🪙 ${r.Clicks} ${t('perClick').toLowerCase()}` : '') + (r.Luck2Minutes ? ` · 🍀 ×2 ${r.Luck2Minutes}m` : '')))));
  });
  p.append(el('div', { class: 'btns' }, info.can ? el('button', { type: 'button', id: 'claimDaily', class: 'gold', onclick: claimDaily }, t('dailyClaim') + ` (${t('dailyDay', { d: info.day })})`) : el('button', { disabled: true, type: 'button' }, t('dailyClaimed')),
    el('button', { type: 'button', class: 'ghost', id: 'skipDay', onclick: () => { S.dayShift++; touch(); refreshAll(); } }, t('dailySkip'))));
  p.append(el('p', { class: 'note', id: 'dailyTimer' }, t('dailyNext', { t: fmtT(info.left) })));
}
function panelShop(p) {
  p.append(el('h3', null, t('shopTitle')), el('p', { class: 'note' }, t('shopNote')));
  p.append(el('h3', null, t('passes'), ' ', demoTag()));
  const gp = C.GAMEPASSES || {};
  GP_ORDER.filter(k => gp[k]).forEach(k => {
    const d = gp[k], on = hasPass(k);
    p.append(el('div', { class: 'card', 'data-pass': k }, el('div', { class: 'meta' }, el('b', null, d.Name, ' ', demoTag()), el('small', null, d.Description), el('small', null, t('suggested', { p: d.SuggestedPrice }))),
      on ? el('button', { type: 'button', class: 'ghost', onclick: () => grantPass(k, false) }, t('ownedDemo') + ' · ' + t('revoke')) : el('button', { type: 'button', class: 'green', onclick: () => grantPass(k, true) }, t('getDemo'))));
  });
  p.append(el('div', { class: 'card' }, el('div', { class: 'meta' }, el('b', null, t('premium', { pct: Math.round(pe('PREMIUM_COIN_BONUS', .1) * 100) }), ' ', demoTag())),
    el('button', { type: 'button', class: S.premium ? 'ghost' : 'green', id: 'premiumBtn', onclick: () => { S.premium = !S.premium; touch(); refreshAll(); } }, S.premium ? t('ownedDemo') + ' · ' + t('revoke') : t('getDemo'))));
  p.append(el('h3', null, t('products'), ' ', demoTag()));
  const pr = C.PRODUCTS || {};
  PR_ORDER.filter(k => pr[k]).forEach(k => {
    const d = pr[k];
    p.append(el('div', { class: 'card', 'data-product': k }, el('div', { class: 'meta' }, el('b', null, d.Name, ' ', demoTag()), el('small', null, d.Kind === 'Gems' ? `💎 ${fmt(d.Amount)}` : d.Kind === 'Coins' ? `🪙 ≥ ${fmt(d.Min || 0)}` : `🍀 ×${d.Multiplier} · ${Math.round(d.Seconds / 60)}m`), el('small', null, t('suggested', { p: d.SuggestedPrice }))),
      el('button', { type: 'button', class: 'green', onclick: () => grantProduct(k) }, t('getDemo'))));
  });
}
const FAKE = [['MiloTheBuilder', 8.4e11], ['PixelPanda', 2.9e10], ['LunaHatcher', 4.2e9], ['xX_Cloverfan_Xx', 6.1e8], ['PetWizard77', 9.5e7], ['SleepyFox', 1.4e7], ['CoinCollector9', 2.2e6], ['NoobMaster', 3.8e5], ['Tiny_Tim', 4.1e4], ['GuestPlayer', 3.2e3]];
function panelTop(p) {
  p.append(el('h3', null, t('topTitle'), ' ', demoTag()), el('p', { class: 'note' }, t('topNote')));
  const rows = FAKE.map(([n, v]) => ({ n, v, me: false })); rows.push({ n: t('you'), v: S.totalCoins, me: true });
  rows.sort((a, b) => b.v - a.v);
  const tb = el('table', { class: 'table' });
  rows.slice(0, 11).forEach((r, i) => tb.append(el('tr', { class: r.me ? 'me' : '' }, el('td', null, '#' + (i + 1)), el('td', null, r.n), el('td', null, '🪙 ' + fmt(r.v)))));
  p.append(tb);
}
function panelStats(p) {
  const seen = new Set(Object.values(S.pets).map(x => x.id));
  const rows = [[t('totalCoins'), fmt(S.totalCoins)], [t('totalClicks'), fmt(S.totalClicks)], [t('totalHatched'), fmt(S.totalHatched)], [t('petsOwned'), petCount()], [t('discovered'), `${seen.size}/${PETS.length}`], [t('rebirths'), S.rebirths]];
  p.append(el('h3', null, t('statsTitle')), el('table', { class: 'table' }, rows.map(r => el('tr', null, el('td', null, r[0]), el('td', null, r[1])))), el('p', { class: 'note' }, t('saved')));
}
function panelDemo(p) {
  p.append(el('h3', null, t('demoTitle')), el('p', { class: 'note' }, t('demoNote')));
  const b = (id, label, fn, cls) => el('button', { type: 'button', id, class: cls || 'ghost', style: 'margin:0 6px 6px 0', onclick: fn }, label);
  p.append(b('demoCoins', t('demoCoins'), () => { addCoins(perClick() * 100); S.totalClicks += 0; refreshAll(); }), b('demoCoinsBig', t('demoCoinsBig'), () => { addCoins(Math.max(1000, S.coins * 9)); refreshAll(); }),
    b('demoGems', t('demoGems'), () => { addGems(1000); refreshAll(); }), b('demoReset', t('demoReset'), () => { if (confirm(t('demoResetAsk'))) { S = newState(); S.lang = lang; save(); spawnPlayer(); renderTabs(); refreshAll(); } }, 'red'));
}

/* ---------------------------------------------------------------- модальные окна */
function openModal(content) { const m = $('#modal'); m.innerHTML = ''; m.append(el('div', { class: 'box' }, content)); m.classList.remove('hidden'); }
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });
function openEggModal(eggId) {
  const egg = EGG[eggId]; if (!egg) return;
  const lk = luck(), odds = getOdds(eggId, lk);
  const tb = el('table', { class: 'odds' });
  odds.slice().sort((a, b) => b.Chance - a.Chance).forEach(o => { const d = PET[o.Id]; tb.append(el('tr', null, el('td', null, d.Name), el('td', null, rarSpan(d.Rarity)), el('td', { style: 'text-align:right' }, fmtP(o.Chance) + '%'))); });
  const btns = el('div', { class: 'btns' });
  HATCH_COUNTS.forEach(n => btns.append(costBtn(t('hatchN', { n }) + ' · ' + price(egg.Currency, egg.Price * n), egg.Currency, egg.Price * n, () => doHatch(eggId, n), 'gold')));
  btns.append(el('button', { type: 'button', class: 'ghost', onclick: closeModal }, t('close')));
  openModal([el('h3', null, egg.Name), (() => { const c = eggArt(egg, 120, 150); c.className = 'eggArt'; return c; })(),
    el('p', { class: 'note' }, `${t('eggPrice', { price: price(egg.Currency, egg.Price) })} · ${t('luckNow', { luck: fmtP(lk) })}. ${t('luckNote')} ${t('goldenChance', { p: fmtP(cn('GOLD_CHANCE', .02) * 100), m: cn('GOLD_POWER_MULT', 2) })}`), tb, btns]);
  document.querySelectorAll('#modal [data-cost]').forEach(b => { b.disabled = !canAfford(b.dataset.cur, +b.dataset.cost); });
}
function doHatch(eggId, n) {
  const res = hatch(eggId, n); if (!res) return;
  const egg = EGG[eggId], art = eggArt(egg, 120, 150); art.className = 'eggArt shake';
  openModal([el('h3', null, egg.Name), art]);
  setTimeout(() => {
    const box = el('div', { class: 'results' });
    res.forEach(r => { const d = PET[r.id]; box.append(el('div', { class: 'res', 'data-pet': r.id, style: `border:2px solid ${rarColor(d.Rarity)}` }, petCanvas(r.id, r.gold, 96), el('b', null, (r.gold ? '★ ' : '') + d.Name), el('div', null, rarSpan(d.Rarity)), el('small', null, `${t('power')} ${fmt(petPower(r)) }`))); });
    openModal([el('h3', null, t('hatched')), box, el('div', { class: 'btns' }, el('button', { type: 'button', class: 'green', id: 'hatchEquipBest', onclick: () => { equipBest(); closeModal(); } }, t('equipBest')), el('button', { type: 'button', class: 'gold', id: 'hatchAgain', onclick: () => openEggModal(eggId) }, t('hatchN', { n: res.length })), el('button', { type: 'button', class: 'ghost', id: 'hatchClose', onclick: closeModal }, t('close')))]);
    refreshAll();
  }, 900);
}
function openNearEgg() { const s = nearestEgg(14); if (s) openEggModal(s.egg.Id); }

/* ---------------------------------------------------------------- ввод */
function bindInput() {
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    keys[e.code] = true; keys[e.key] = true;
    if (e.code === 'KeyF' || e.code === 'Space') { if (e.target.tagName !== 'BUTTON' || e.code === 'KeyF') { collect(1); e.preventDefault(); } }
    if (e.code === 'KeyE') openNearEgg();
    if (e.code === 'Escape') closeModal();
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; keys[e.key] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let hold = null;
  const cb = $('#collectBtn');
  const startHold = e => { e.preventDefault(); collect(1); clearInterval(hold); hold = setInterval(() => collect(1), 85); };
  const stopHold = () => { clearInterval(hold); hold = null; };
  cb.addEventListener('pointerdown', startHold); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => cb.addEventListener(ev, stopHold));
  cb.addEventListener('keydown', e => { if (e.code === 'Enter') collect(1); });
  $('#autoBtn').addEventListener('click', () => { S.autoCollect = !S.autoCollect; touch(); updateHud(); });
  $('#eggPrompt').addEventListener('click', openNearEgg);
  let down = false;
  const toWorld = e => { const r = canvas.getBoundingClientRect(); const sx = (e.clientX - r.left) * view.W / r.width, sy = (e.clientY - r.top) * view.H / r.height; return { x: camera.x + (sx - view.W / 2) / view.s, z: camera.z + (sy - view.H * 0.58) / (view.s * K) }; };
  canvas.addEventListener('pointerdown', e => {
    const w = toWorld(e); down = true;
    const b = boardPos();
    if (S.currentZone === ZONES[0].Id && Math.hypot(w.x - b.x, w.z - b.z + 3) < 7) { S.tab = 'top'; touch(); renderTabs(); renderPanel(); return; }
    const slot = eggSlots().find(s => Math.hypot(w.x - s.x, w.z - s.z + 3) < 5);
    if (slot) { if (Math.hypot(slot.x - player.x, slot.z - player.z) <= 14) openEggModal(slot.egg.Id); else { player.tx = slot.x; player.tz = slot.z + 8; } return; }
    player.tx = w.x; player.tz = w.z;
  });
  canvas.addEventListener('pointermove', e => { if (down && e.pointerType !== 'mouse') { const w = toWorld(e); player.tx = w.x; player.tz = w.z; } });
  window.addEventListener('pointerup', () => { down = false; });
}

/* ---------------------------------------------------------------- язык и статические тексты */
function applyLang() {
  document.documentElement.lang = lang; S.lang = lang;
  document.title = GAME + ' — ' + (lang === 'ru' ? 'веб-демо' : 'web demo');
  $('#gameName').textContent = GAME; $('#demoBadge').textContent = t('demoBadge');
  $('#disclaimer').textContent = t('disclaimer', { name: D.meta.projectName || GAME });
  $('#collectBtn').textContent = '👆 ' + t('collect'); $('#collectHint').textContent = t('collectHint');
  $('#sceneHint').textContent = t('moveHint');
  $('#footerGen').textContent = t('generatedBy') + ' · ' + (D.meta.generator || '');
  const fl = $('#footerLinks'); fl.innerHTML = '';
  (D.meta.links || []).forEach(l => fl.append(' · ', el('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.title || t('sourceLink'))));
  $('#langRu').classList.toggle('on', lang === 'ru'); $('#langEn').classList.toggle('on', lang === 'en');
  buildHud(); renderTabs(); renderPanel(); touch();
}

/* ---------------------------------------------------------------- главный цикл */
let last = performance.now(), autoAcc = 0, uiAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  resize(); stepWorld(dt);
  if (hasPass('AUTO_COLLECT') && S.autoCollect) {
    autoAcc += dt; const per = 1 / pe('AUTO_CLICKS_PER_SECOND', 2);
    while (autoAcc >= per) { autoAcc -= per; const pc = perClick(); addCoins(pc); S.totalClicks++; }
  }
  drawScene(now / 1000);
  uiAcc += dt; if (uiAcc > 0.15) { uiAcc = 0; updateHud(); }
  if (dirty && Date.now() - lastSave > 2000) save();
  requestAnimationFrame(frame);
}
function init() {
  load();
  lang = (S.lang === 'en' || S.lang === 'ru') ? S.lang : 'ru';
  $('#langRu').addEventListener('click', () => { lang = 'ru'; applyLang(); });
  $('#langEn').addEventListener('click', () => { lang = 'en'; applyLang(); });
  bindInput(); spawnPlayer(); applyLang();
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  requestAnimationFrame(frame);
}
// Хуки для автотестов (не часть игровой логики)
window.__game = { get state() { return S; }, F, perClick, luck, getOdds, collect, hatch, equip, equipBest, sell, buyUpgrade, unlockZone, teleport, rebirth, claimDaily, grantPass, grantProduct, save, player, nearestEgg, eggSlots, slots, bagSize, walkSpeed, openEggModal };
init();
})();
