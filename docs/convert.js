/* roblox2web (JS-версия): тот же алгоритм, что и в Python-пакете r2w, но целиком в браузере/Node.
   Вход: Map/obj путь -> Uint8Array (уже распакованный архив). Выход: файлы веб-версии + отчёт. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./luau.js'));
  else root.Convert = factory(root.Luau);
})(typeof self !== 'undefined' ? self : this, function (L) {
'use strict';
const { Interp, InstNode, LTable, LFunction, toJson, LuauError, StepLimit } = L;
const VERSION = '1.0.0';

class ConvertError extends Error { constructor(code, message) { super(message); this.code = code; this.userMessage = message; } }

const DEFAULTS = { BASE_PET_SLOTS: 3, BASE_BAG_SIZE: 30, BASE_WALKSPEED: 16, MAX_WALKSPEED: 56, GOLD_CHANCE: 0.02, GOLD_POWER_MULT: 2, SELL_VALUE_PER_POWER: 40, MAX_COINS: 1e15, MAX_GEMS: 1e9, HATCH_COUNTS: [1, 3], MAX_CLICKS_PER_SECOND: 12, REBIRTH_BASE_COST: 50000, REBIRTH_COST_GROWTH: 4, REBIRTH_MULT_PER: 0.5, REBIRTH_GEMS_BASE: 20, REBIRTH_GEMS_PER: 5 };
const UPGRADE_DEFAULT_CONSTS = { CLICK_PER_LEVEL: 1, SPEED_PER_LEVEL: 1.5, LUCK_PER_LEVEL: 0.03, BAG_PER_LEVEL: 10 };
const LIMITATIONS = [
  'Luau-логика НЕ транслируется. Конвертер читает только данные (таблицы значений и чистые функции-конструкторы вида `local function pet(...) return {...} end`), выполняя их в песочнице с лимитом шагов.',
  'Геймплей — готовый шаблон «pet / clicker simulator», параметризованный вашими данными (питомцы, яйца, миры, апгрейды, баланс). Если ваша игра устроена иначе (другие механики, тайкун, обби, шутер) — шаблон не подойдёт, будет страница-отчёт.',
  'Формулы экономики зашиты в шаблон (как в Pet Collector Simulator). Если в проекте есть модуль Formulas, конвертер сверяет его ответы с шаблоном и сообщает о расхождениях; остальные расчёты (Economy/Services) не проверяются.',
  'Графика — упрощённый 2D-канвас; 3D-модели, текстуры, звуки, GUI из .rbxlx не переносятся.',
  'Сервер, DataStore, лидерборд и покупки — демо (localStorage, вымышленные игроки, без платежей).',
];
const GAME_FILES = ['index.html', 'style.css', 'game.js', 'i18n.js'];

const dec = (u8) => {
  if (typeof u8 === 'string') return u8;
  let s = new TextDecoder('utf-8', { fatal: false }).decode(u8);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
};
const dirname = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const basename = p => p.slice(p.lastIndexOf('/') + 1);
function normJoin(base, rel) {
  const parts = (base ? base + '/' + rel : rel).split('/'); const out = [];
  for (const p of parts) { if (p === '' || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
  return out.join('/');
}

/* ---------------------------------------------------------------- архив (после распаковки) */
function safeName(name) {
  name = name.replace(/\\/g, '/'); const parts = name.split('/').filter(p => p !== '' && p !== '.');
  if (!parts.length || parts.includes('..') || name.startsWith('/') || /^[A-Za-z]:$/.test(parts[0])) return null;
  return parts.join('/');
}
function normalizeFiles(entries) {
  // entries: [[name, Uint8Array], ...]
  let files = {}; let total = 0;
  for (const [n, blob] of entries) {
    const p = safeName(n); if (p === null) continue;
    total += blob.length;
    if (blob.length > 64 * 2 ** 20 || total > 300 * 2 ** 20 || Object.keys(files).length >= 20000) throw new ConvertError('too_big', 'Архив слишком большой.');
    files[p] = blob;
  }
  for (const k of Object.keys(files)) if (k.startsWith('__MACOSX/') || k.endsWith('.DS_Store')) delete files[k];
  if (!Object.keys(files).length) throw new ConvertError('empty', 'Архив пустой: в нём нет ни одного файла.');
  for (;;) {
    const keys = Object.keys(files); const tops = new Set(keys.map(k => k.split('/')[0]));
    if (tops.size === 1 && keys.every(k => k.includes('/'))) { const nf = {}; for (const k of keys) nf[k.slice(k.indexOf('/') + 1)] = files[k]; files = nf; } else return files;
  }
}
/* tar (ustar) после gunzip */
function parseTar(u8) {
  const out = []; let off = 0; const td = new TextDecoder();
  while (off + 512 <= u8.length) {
    const h = u8.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    let name = td.decode(h.subarray(0, 100)).replace(/\0.*$/, '');
    const prefix = td.decode(h.subarray(345, 500)).replace(/\0.*$/, ''); if (prefix) name = prefix + '/' + name;
    const size = parseInt(td.decode(h.subarray(124, 136)).replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    if (Number.isNaN(size)) throw new ConvertError('broken', 'Архив повреждён (tar-заголовок).');
    off += 512;
    if (type === '0' || type === '\0') out.push([name, u8.slice(off, off + size)]);
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}

/* ---------------------------------------------------------------- проект */
function scriptInfo(filename) {
  const base = basename(filename); let stem = null;
  for (const ext of ['.lua', '.luau']) if (base.endsWith(ext)) { stem = base.slice(0, -ext.length); break; }
  if (stem === null) return null;
  if (stem.endsWith('.server')) return [stem.slice(0, -7), 'Script'];
  if (stem.endsWith('.client')) return [stem.slice(0, -7), 'LocalScript'];
  return [stem, 'ModuleScript'];
}
class Project {
  constructor() { this.root = new InstNode('game', 'DataModel'); this.name = 'Project'; this.kind = 'unknown'; this.warnings = []; this.scripts = []; }
  allScripts() { const out = []; const walk = n => { for (const c of n.children.values()) { if (c.source !== null) out.push(c); walk(c); } }; walk(this.root); return out; }
}
function parseXml(s) {
  // минимальный XML-парсер для .rbxlx: элементы, атрибуты, текст, CDATA, комментарии, сущности
  const ent = t => t.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e]);
  const root = { tag: '#root', attrs: {}, children: [], text: '' }; const stack = [root]; let i = 0; const n = s.length;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += ent(s.slice(i, lt));
    if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt); if (e < 0) throw new Error('bad CDATA'); stack[stack.length - 1].text += s.slice(lt + 9, e); i = e + 3; continue; }
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt); if (e < 0) throw new Error('bad comment'); i = e + 3; continue; }
    if (s.startsWith('<?', lt) || s.startsWith('<!', lt)) { const e = s.indexOf('>', lt); if (e < 0) throw new Error('bad decl'); i = e + 1; continue; }
    const gt = s.indexOf('>', lt); if (gt < 0) throw new Error('unterminated tag');
    const body = s.slice(lt + 1, gt);
    if (body[0] === '/') { if (stack.length < 2) throw new Error('unbalanced'); stack.pop(); i = gt + 1; continue; }
    const selfClose = body.endsWith('/'); const inner = selfClose ? body.slice(0, -1) : body;
    const m = /^([^\s/]+)/.exec(inner); const el = { tag: m[1], attrs: {}, children: [], text: '' };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let am;
    while ((am = re.exec(inner.slice(m[0].length)))) el.attrs[am[1]] = ent(am[3] !== undefined ? am[3] : am[4]);
    stack[stack.length - 1].children.push(el);
    if (!selfClose) stack.push(el);
    i = gt + 1;
  }
  if (stack.length !== 1) throw new Error('unclosed tags');
  return root.children[0];
}
function findProjectJson(files) {
  const cands = Object.keys(files).filter(k => k.endsWith('.project.json') && (k.split('/').length - 1) <= 2);
  if (!cands.length) return null;
  cands.sort((a, b) => ((basename(a) === 'default.project.json' ? 0 : 1) - (basename(b) === 'default.project.json' ? 0 : 1)) || (a.split('/').length - b.split('/').length) || (a < b ? -1 : a > b ? 1 : 0));
  return [dirname(cands[0]), cands[0]];
}
function loadProject(files) {
  const prj = new Project();
  const pj = findProjectJson(files);
  if (pj) {
    const [base, path] = pj; let spec;
    try { spec = JSON.parse(dec(files[path])); } catch (e) { throw new ConvertError('bad_project', 'default.project.json не читается как JSON: ' + e.message); }
    if (!spec || typeof spec !== 'object' || !spec.tree || typeof spec.tree !== 'object') throw new ConvertError('bad_project', 'В default.project.json нет раздела "tree" — это не проект Rojo.');
    prj.kind = 'rojo'; prj.name = String(spec.name || 'Project'); buildRojo(prj, files, base, spec.tree);
  } else {
    const rbx = Object.keys(files).filter(k => k.toLowerCase().endsWith('.rbxlx'));
    if (rbx.length) {
      prj.kind = 'rbxlx'; rbx.sort((a, b) => (a.split('/').length - b.split('/').length) || (a < b ? -1 : 1));
      prj.name = basename(rbx[0]).replace(/\.[^.]*$/, ''); buildRbxlx(prj, files[rbx[0]]);
    } else if (Object.keys(files).some(k => k.toLowerCase().endsWith('.rbxl'))) {
      throw new ConvertError('binary_rbxl', 'Найден бинарный .rbxl — он не поддерживается. Сохраните место как .rbxlx (File → Save As… → Roblox XML) или используйте Rojo-проект.');
    } else {
      const luas = Object.keys(files).filter(k => /\.luau?$/i.test(k));
      if (!luas.length) throw new ConvertError('no_scripts', 'В архиве нет ни default.project.json, ни .rbxlx, ни .lua/.luau файлов — это не похоже на исходники Roblox-проекта.');
      prj.kind = 'loose'; prj.warnings.push('Нет default.project.json / .rbxlx: скрипты взяты «как лежат» по папкам, пути require могут не совпасть с Roblox.');
      buildLoose(prj, files);
    }
  }
  prj.scripts = prj.allScripts().map(s => [s.fullName(), s.cls, (s.source || '').length]);
  return prj;
}
function buildRojo(prj, files, base, tree) {
  const keys = Object.keys(files);
  const fsNode = (name, path, parent, clsHint) => {
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      const info = scriptInfo(path); if (!info) return null;
      return parent.add(new InstNode(name, info[1], dec(files[path]), path));
    }
    const prefix = path + '/'; const entries = keys.filter(k => k.startsWith(prefix));
    if (!entries.length) return null;
    let init = null;
    for (const c of ['init.lua', 'init.luau', 'init.server.lua', 'init.server.luau', 'init.client.lua', 'init.client.luau']) if (Object.prototype.hasOwnProperty.call(files, prefix + c)) { init = c; break; }
    const n = init ? new InstNode(name, scriptInfo(init)[1], dec(files[prefix + init]), prefix + init) : new InstNode(name, clsHint || 'Folder');
    parent.add(n);
    const seen = new Set();
    for (const k of entries.slice().sort()) {
      const rest = k.slice(prefix.length); const top = rest.split('/')[0];
      if (seen.has(top) || top.startsWith('.') || top.startsWith('init.')) continue;
      seen.add(top);
      if (rest.includes('/')) fsNode(top, prefix + top, n);
      else {
        const info = scriptInfo(top);
        if (!info || top.endsWith('.spec.lua') || top.endsWith('.spec.luau')) continue;
        if (n.children.has(info[0])) continue;
        n.add(new InstNode(info[0], info[1], dec(files[k]), k));
      }
    }
    return n;
  };
  const make = (name, spec, parent) => {
    const cls = spec.$className; let path = spec.$path;
    if (path && typeof path === 'object') path = path.optional;
    let node = null;
    if (typeof path === 'string') {
      node = fsNode(name, normJoin(base, path), parent, cls);
      if (!node) prj.warnings.push(`$path "${path}" (узел ${name}) не найден в архиве.`);
    }
    if (!node) { node = new InstNode(name, cls || 'Folder'); parent.add(node); }
    else if (cls && node.cls === 'Folder') node.cls = cls;
    for (const k of Object.keys(spec)) if (!k.startsWith('$') && spec[k] && typeof spec[k] === 'object' && !Array.isArray(spec[k])) make(k, spec[k], node);
    return node;
  };
  for (const name of Object.keys(tree)) { if (name.startsWith('$') || !tree[name] || typeof tree[name] !== 'object') continue; make(name, tree[name], prj.root); }
  if (!prj.allScripts().length) prj.warnings.push('Rojo-проект прочитан, но в нём не найдено ни одного .lua/.luau скрипта по путям $path.');
}
function buildLoose(prj, files) {
  for (const k of Object.keys(files).sort()) {
    const info = scriptInfo(k); if (!info) continue;
    let node = prj.root;
    for (const p of k.split('/').slice(0, -1)) { if (!node.children.has(p)) node.add(new InstNode(p, 'Folder')); node = node.children.get(p); }
    node.add(new InstNode(info[0], info[1], dec(files[k]), k));
  }
}
function buildRbxlx(prj, blob) {
  let root;
  try { root = parseXml(dec(blob)); } catch (e) { throw new ConvertError('bad_rbxlx', '.rbxlx повреждён (XML не читается): ' + e.message); }
  if (!root || root.tag !== 'roblox') throw new ConvertError('bad_rbxlx', 'Файл не похож на .rbxlx (корневой тег не <roblox>).');
  const walk = (item, parent) => {
    const cls = item.attrs.class || 'Folder'; let name = cls, source = null;
    const props = item.children.find(c => c.tag === 'Properties');
    if (props) for (const p of props.children) { if (p.attrs.name === 'Name') name = p.text || cls; else if (p.attrs.name === 'Source') source = p.text || ''; }
    const isScript = cls === 'Script' || cls === 'LocalScript' || cls === 'ModuleScript';
    const n = isScript ? new InstNode(name, cls, source || '', name) : new InstNode(name, cls);
    if (parent.children.has(name)) { let i = 2; while (parent.children.has(`${name}_${i}`)) i++; n.name = `${name}_${i}`; }
    parent.add(n);
    for (const ch of item.children) if (ch.tag === 'Item') walk(ch, n);
  };
  for (const item of root.children) if (item.tag === 'Item') walk(item, prj.root);
}

/* ---------------------------------------------------------------- извлечение */
const isArr = t => t instanceof LTable && t.length() > 0 && t.length() === t.d.size;
const tget = (t, k) => (t instanceof LTable ? t.get(k) : null);
const isNum = v => typeof v === 'number';
function classify(value) {
  if (!(value instanceof LTable)) return [null, 0];
  const roles = [];
  const pets = tget(value, 'Pets'), eggs = tget(value, 'Eggs');
  if (isArr(pets) && isArr(eggs)) {
    const p0 = tget(pets, 1), e0 = tget(eggs, 1);
    if (p0 instanceof LTable && e0 instanceof LTable && tget(p0, 'Power') !== null && isArr(tget(e0, 'Pets'))) roles.push(['petdata', 10]);
  }
  const lst = tget(value, 'List');
  if (isArr(lst)) {
    const f = tget(lst, 1);
    if (f instanceof LTable) {
      if (tget(f, 'Multiplier') !== null && tget(f, 'UnlockCost') !== null) roles.push(['zonedata', 10]);
      if (tget(f, 'MaxLevel') !== null && (tget(f, 'BaseCost') !== null || tget(f, 'Costs') !== null)) roles.push(['upgradedata', 10]);
    }
  }
  const score = ['GAMEPASSES', 'PRODUCTS', 'DAILY_REWARDS', 'REBIRTH_BASE_COST', 'PASS_EFFECTS', 'GAME_NAME', 'BASE_PET_SLOTS', 'GOLD_CHANCE', 'HATCH_COUNTS'].filter(k => tget(value, k) !== null).length;
  if (score >= 2) roles.push(['config', score]);
  if (tget(value, 'rebirthCost') instanceof LFunction || tget(value, 'upgradeCost') instanceof LFunction) roles.push(['formulas', 5]);
  if (!roles.length) return [null, 0];
  roles.sort((a, b) => b[1] - a[1]);
  return roles[0];
}
function preview(value) {
  let s; try { s = JSON.stringify(toJson(value)); } catch (e) { return null; }
  if (s === undefined) return null;
  return s.length > 1200 ? s.slice(0, 1200) + ' …' : s;
}
function evaluateProject(prj) {
  const ex = { log: [], modules: {}, found: {}, dumps: [], interp: null };
  const interp = new Interp(prj.root, m => ex.log.push(m)); ex.interp = interp;
  for (const node of prj.allScripts()) {
    if (node.cls !== 'ModuleScript') continue;
    interp.steps = 0; let value;
    try { value = interp.loadModule(node); }
    catch (e) {
      if (e instanceof StepLimit) { ex.log.push(`${node.fullName()}: лимит шагов`); continue; }
      if (e instanceof LuauError) { ex.log.push(`${node.fullName()}: не вычислен (${e.message})`); continue; }
      throw e;
    }
    const [role, score] = classify(value);
    ex.found[node.fullName()] = role;
    if (role) { const prev = ex.modules[role]; if (!prev || score > prev[2]) ex.modules[role] = [node, value, score]; }
    if (value instanceof LTable && ex.dumps.length < 40) ex.dumps.push({ module: node.fullName(), role, keys: [...value.d.keys()].slice(0, 25).map(String), preview: preview(value) });
  }
  return ex;
}
function detectGenre(prj, ex) {
  const names = prj.allScripts().map(n => n.name.toLowerCase()).join(' '); const roles = new Set(Object.keys(ex.modules));
  if (roles.has('petdata')) return ['pet-simulator', 'Найден модуль с таблицами Pets+Eggs (питомцы и яйца).'];
  const tw = ['dropper', 'conveyor', 'tycoon', 'collector', 'upgrader'].filter(w => names.includes(w));
  if (tw.length && (roles.has('zonedata') || roles.has('upgradedata') || roles.has('config'))) return ['tycoon', `Похоже на тайкун (скрипты ${tw.join('/')}), но шаблон для тайкунов не реализован.`];
  if (roles.has('zonedata') || roles.has('upgradedata')) return ['simulator-unknown', 'Есть данные миров/апгрейдов, но нет питомцев и яиц — шаблону не хватает данных.'];
  return ['unknown', 'Не найдено ни одного распознаваемого модуля с данными (PetData / ZoneData / UpgradeData / Config).'];
}
const nz = (v, d) => (isNum(v) ? v : (d === undefined ? 0 : d));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const short = v => JSON.stringify(v).slice(0, 60);
function buildGameData(prj, ex) {
  const warns = [], errs = [];
  const pj = toJson(ex.modules.petdata[1]);
  let rarities = isObj(pj.Rarities) ? pj.Rarities : {};
  const petsRaw = pj.Pets || [], eggsRaw = pj.Eggs || [];
  if (!Object.keys(rarities).length) { rarities = { Common: { Order: 1, Color: '#bebec8', Scale: 1 } }; warns.push('PetData.Rarities не найдена: все питомцы будут считаться редкостью Common.'); }
  const pets = [], ids = new Set();
  for (const p of petsRaw) {
    if (!isObj(p) || typeof p.Id !== 'string' || p.Power === undefined || p.Power === null) { warns.push(`Пропущен некорректный питомец: ${short(p)}`); continue; }
    if (ids.has(p.Id)) { warns.push(`Дубликат питомца ${p.Id} пропущен.`); continue; }
    ids.add(p.Id);
    const look = isObj(p.Look) ? p.Look : {};
    let rar = Object.prototype.hasOwnProperty.call(rarities, p.Rarity) ? p.Rarity : null;
    if (rar === null) { rar = Object.keys(rarities).sort((a, b) => ((rarities[a].Order || 0) - (rarities[b].Order || 0)))[0]; warns.push(`У питомца ${p.Id} неизвестная редкость, принята ${rar}.`); }
    pets.push({ Id: p.Id, Name: String(p.Name || p.Id), Rarity: rar, Power: nz(p.Power), Look: { Body: look.Body || '#cccccc', Accent: look.Accent || '#888888', Shape: look.Shape || 'Round', Ears: look.Ears || 'None', Extras: Array.isArray(look.Extras) ? look.Extras : [] } });
  }
  const eggs = [];
  for (const e of eggsRaw) {
    if (!isObj(e) || typeof e.Id !== 'string' || !Array.isArray(e.Pets)) { warns.push(`Пропущено некорректное яйцо: ${short(e)}`); continue; }
    const entries = [];
    for (const ep of e.Pets) { if (isObj(ep) && ids.has(ep.Id) && nz(ep.Weight) > 0) entries.push({ Id: ep.Id, Weight: ep.Weight }); else warns.push(`В яйце ${e.Id} пропущена запись ${short(ep).slice(0, 50)} (нет такого питомца или вес ≤ 0).`); }
    if (!entries.length) { warns.push(`Яйцо ${e.Id} пропущено: нет валидных питомцев.`); continue; }
    eggs.push({ Id: e.Id, Name: String(e.Name || e.Id), Zone: String(e.Zone || ''), Currency: e.Currency === 'Gems' ? 'Gems' : 'Coins', Price: nz(e.Price, 100), Color: e.Color || '#f5f0d8', Pattern: e.Pattern || '#78c864', Pets: entries });
  }
  if (!pets.length) errs.push('В PetData нет ни одного корректного питомца.');
  if (!eggs.length) errs.push('В PetData нет ни одного корректного яйца.');
  if (errs.length) return [null, warns, errs];

  let zones = [], platform = 180;
  if (ex.modules.zonedata) {
    const zj = toJson(ex.modules.zonedata[1]);
    for (const z of (zj.List || [])) if (isObj(z) && typeof z.Id === 'string') zones.push({ Id: z.Id, Name: String(z.Name || z.Id), Multiplier: nz(z.Multiplier, 1), UnlockCost: nz(z.UnlockCost), RequiresRebirths: nz(z.RequiresRebirths), Floor: z.Floor || '#68be54', Accent: z.Accent || '#ffd65a', Sky: z.Sky || '#96cdff', Decor: z.Decor || 'Trees' });
    if (isNum(zj.PLATFORM_SIZE) && zj.PLATFORM_SIZE > 20) platform = zj.PLATFORM_SIZE;
  }
  if (!zones.length) { warns.push('ZoneData не найден: создана одна зона «Home» (x1). Яйца привязаны к зонам по полю Zone.'); zones = [{ Id: 'Home', Name: 'Home', Multiplier: 1, UnlockCost: 0, RequiresRebirths: 0, Floor: '#68be54', Accent: '#ffd65a', Sky: '#96cdff', Decor: 'Trees' }]; }
  const zoneIds = new Set(zones.map(z => z.Id));
  for (const e of eggs) if (!zoneIds.has(e.Zone)) { warns.push(`Яйцо ${e.Id}: зона «${e.Zone}» не найдена, привязано к «${zones[0].Id}».`); e.Zone = zones[0].Id; }
  if (nz(zones[0].UnlockCost) !== 0) warns.push(`Первая зона платная (${zones[0].Id}) — в демо она открыта сразу.`);

  const ups = [], consts = Object.assign({}, UPGRADE_DEFAULT_CONSTS);
  if (ex.modules.upgradedata) {
    const uj = toJson(ex.modules.upgradedata[1]);
    for (const k of Object.keys(consts)) { if (isNum(uj[k])) consts[k] = uj[k]; else warns.push(`UpgradeData.${k} не найдена, взято значение шаблона ${consts[k]}.`); }
    for (const u of (uj.List || [])) if (isObj(u) && typeof u.Id === 'string') ups.push({ Id: u.Id, Name: String(u.Name || u.Id), Description: String(u.Description || ''), MaxLevel: nz(u.MaxLevel, 1), Currency: u.Currency === 'Gems' ? 'Gems' : 'Coins', BaseCost: nz(u.BaseCost), Growth: nz(u.Growth, 1), Costs: Array.isArray(u.Costs) ? u.Costs : null });
  }
  if (!ups.length) warns.push('UpgradeData не найден: апгрейдов не будет. Шаблон без них играбелен, но беднее.');
  const known = new Set(['Click', 'Speed', 'Luck', 'Bag', 'Slots']);
  for (const u of ups) if (!known.has(u.Id)) warns.push(`Апгрейд «${u.Id}» неизвестен шаблону (эффект не реализован, он только покупается).`);

  const cfg = {};
  if (ex.modules.config) {
    const cj = toJson(ex.modules.config[1]);
    for (const k of Object.keys(cj)) {
      if (k === 'GAMEPASS_IDS' || k === 'PRODUCT_IDS' || k.startsWith('DATASTORE') || k.startsWith('LEADERBOARD_DATASTORE')) continue;
      const v = cj[k]; if (v !== null && v !== undefined) cfg[k] = v;
    }
  } else warns.push('Config не найден: баланс (ребёрт, слоты, мешок, золотые питомцы) взят из значений шаблона.');
  for (const k of Object.keys(DEFAULTS)) if (!(k in cfg)) { cfg[k] = DEFAULTS[k]; if (ex.modules.config) warns.push(`Config.${k} не найден, взято значение шаблона (${Array.isArray(DEFAULTS[k]) ? '[' + DEFAULTS[k].join(', ') + ']' : DEFAULTS[k]}).`); }
  for (const k of ['GAMEPASSES', 'PRODUCTS', 'DAILY_REWARDS', 'PASS_EFFECTS', 'GAMEPASS_ORDER', 'PRODUCT_ORDER']) if (!(k in cfg)) warns.push(`Config.${k} не найден: соответствующий раздел демо (магазин/ежедневная награда) будет пустым или упрощённым.`);

  const data = {
    meta: { gameName: String(cfg.GAME_NAME || prj.name), projectName: prj.name, generator: 'roblox2web ' + VERSION, genre: 'pet-simulator', sourceKind: prj.kind },
    config: cfg, rarities, luckMinOrder: nz(pj.LUCK_MIN_ORDER, 3), pets, eggs, zones, platformSize: platform, upgrades: { consts, list: ups },
  };
  return [data, warns, []];
}
function refFormulas(data) {
  const c = data.config, u = data.upgrades, consts = u.consts; const by = {}; u.list.forEach(x => { by[x.Id] = x; });
  const pe = c.PASS_EFFECTS || {};
  return {
    rebirthCost: r => Math.floor(Math.min(c.REBIRTH_BASE_COST * Math.pow(c.REBIRTH_COST_GROWTH, r), c.MAX_COINS)),
    rebirthMultiplier: r => 1 + c.REBIRTH_MULT_PER * r,
    rebirthGems: r => c.REBIRTH_GEMS_BASE + c.REBIRTH_GEMS_PER * r,
    upgradeCost: (i, lvl) => { const d = by[i]; if (lvl >= d.MaxLevel) return null; if (d.Costs && d.Costs.length) return lvl < d.Costs.length ? d.Costs[lvl] : null; return Math.floor(d.BaseCost * Math.pow(d.Growth, lvl)); },
    bagSize: l => c.BASE_BAG_SIZE + l * consts.BAG_PER_LEVEL,
    clickBase: l => 1 + l * consts.CLICK_PER_LEVEL,
    upgradeLuck: l => 1 + l * consts.LUCK_PER_LEVEL,
    walkSpeed: (s, dbl) => { let sp = c.BASE_WALKSPEED + s * consts.SPEED_PER_LEVEL; if (dbl) sp *= (isNum(pe.SPEED_MULT_DOUBLE) ? pe.SPEED_MULT_DOUBLE : 2); return Math.min(sp, c.MAX_WALKSPEED); },
  };
}
function checkFormulas(ex, data) {
  if (!ex.modules.formulas) return [[], [], 'Модуль Formulas не найден — формулы шаблона не сверялись с вашим кодом.'];
  const interp = ex.interp; interp.steps = 0; const mod = ex.modules.formulas[1]; const ref = refFormulas(data); const checked = [], bad = [];
  const call = (name, ...args) => {
    const fn = tget(mod, name); if (!(fn instanceof LFunction)) return 'missing';
    try { const r = interp.call(fn, args); return r.length ? r[0] : null; } catch (e) { if (e instanceof LuauError) return 'err:' + e.message; throw e; }
  };
  const same = (a, b) => { if (a === null || b === null) return a === b; if (typeof a === 'string') return false; return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)); };
  const range = (a, b, s) => { const o = []; for (let i = a; i < b; i += (s || 1)) o.push(i); return o; };
  const cases = {
    rebirthCost: range(0, 8).map(r => [r]), rebirthMultiplier: range(0, 8).map(r => [r]), rebirthGems: range(0, 8).map(r => [r]),
    bagSize: range(0, 11).map(r => [r]), clickBase: range(0, 61, 5).map(r => [r]), upgradeLuck: range(0, 11).map(r => [r]),
    walkSpeed: range(0, 9).flatMap(s => [false, true].map(d => [s, d])),
  };
  for (const u of data.upgrades.list) { cases.upgradeCost = cases.upgradeCost || []; for (let l = 0; l <= Math.trunc(u.MaxLevel); l++) cases.upgradeCost.push([u.Id, l]); }
  const fmtArgs = a => '(' + a.map(x => (typeof x === 'string' ? `'${x}'` : x)).join(', ') + (a.length === 1 ? ',' : '') + ')';
  for (const name of Object.keys(cases)) {
    const list = cases[name]; if (call(name, ...list[0]) === 'missing') continue;
    let nBad = 0;
    for (const args of list) { const got = call(name, ...args), want = ref[name](...args); if (!same(got, want)) { nBad++; if (nBad === 1) bad.push(`Formulas.${name}${fmtArgs(args)}: Luau=${got}, шаблон=${want}`); } }
    checked.push(name);
  }
  return [checked, bad, null];
}

/* ---------------------------------------------------------------- сборка результата */
function jsAssign(v, obj) { return `/* generated by roblox2web ${VERSION} */\nwindow.${v} = ${JSON.stringify(obj, null, 1)};\n`; }
function textReport(r) {
  const out = [`roblox2web ${VERSION} — отчёт`, `Проект: ${r.project} (${r.sourceKind})`, `Жанр: ${r.genre} — ${r.genreReason}`, `Итог: ${r.verdict}`, ''];
  if (r.stats) out.push('Данные: ' + Object.entries(r.stats).map(([k, v]) => `${k}=${v}`).join(', '));
  if (r.formulaCheck) out.push('Сверка формул: ' + r.formulaCheck);
  if (r.warnings.length) { out.push('', 'Предупреждения:'); r.warnings.forEach(w => out.push('  - ' + w)); }
  out.push('', 'Ограничения:'); r.limitations.forEach(w => out.push('  - ' + w));
  return out.join('\n') + '\n';
}
/** files: {path: Uint8Array}; templates: {name: string}; -> {status, files:{name:string}, report, text} */
function convertFiles(files, templates, opts) {
  opts = opts || {};
  const prj = loadProject(files), ex = evaluateProject(prj), [genre, reason] = detectGenre(prj, ex);
  const warnings = prj.warnings.slice();
  const report = { generator: 'roblox2web ' + VERSION, project: prj.name, sourceKind: prj.kind, genre, genreReason: reason, scripts: prj.scripts, limitations: LIMITATIONS, modules: ex.dumps.slice(0, 25), recognized: Object.fromEntries(Object.entries(ex.modules).map(([r, v]) => [r, v[0].fullName()])) };
  const log = ex.log.filter(Boolean).slice(0, 60);
  let gd = null;
  if (genre === 'pet-simulator') { const [d, w2, errs] = buildGameData(prj, ex); warnings.push(...w2); if (errs.length) { warnings.push(...errs); gd = null; } else gd = d; }
  const out = {}; let status;
  if (gd) {
    if (opts.links && opts.links.length) gd.meta.links = opts.links;
    const [checked, bad, note] = checkFormulas(ex, gd); let fc;
    if (note) fc = note;
    else if (bad.length) { fc = 'РАСХОЖДЕНИЯ: ' + bad.slice(0, 6).join(' | '); warnings.push('Формулы вашего Formulas.lua отличаются от формул шаблона — поведение демо может не совпасть с игрой. ' + bad.slice(0, 3).join(' | ')); }
    else fc = `формулы ${checked.join(', ')} совпали с шаблоном на тестовых значениях`;
    report.formulaCheck = fc;
    const cc = gd.config;
    report.stats = { pets: gd.pets.length, eggs: gd.eggs.length, zones: gd.zones.length, upgrades: gd.upgrades.list.length, gamepasses: Object.keys(cc.GAMEPASSES || {}).length, products: Object.keys(cc.PRODUCTS || {}).length };
    report.verdict = 'Сгенерирована играбельная веб-демо (жанр pet-simulator). Это шаблон, наполненный вашими данными, а НЕ перевод вашего Luau-кода.';
    status = 'game';
    for (const n of GAME_FILES) out[n] = templates[n];
    out['data.js'] = jsAssign('GAME_DATA', gd);
  } else {
    if (opts.strict) throw new ConvertError('not_a_game', 'Не удалось распознать игру, которую умеет собирать конвертер: ' + reason);
    report.verdict = `НЕ ИГРА: сгенерирована только страница-отчёт. ${reason} Конвертер не транслирует произвольный Luau-код, поэтому играбельную версию для этого проекта сделать нельзя.`;
    status = 'report';
    out['index.html'] = templates['report.html']; out['style.css'] = templates['style.css'];
  }
  report.warnings = warnings; report.log = log;
  if (status === 'report') out['report.js'] = jsAssign('R2W_REPORT', report);
  out['conversion-report.json'] = JSON.stringify(report, null, 1);
  const text = textReport(report); out['CONVERSION_REPORT.txt'] = text;
  return { status, files: out, report, text, gameData: gd };
}
return { VERSION, ConvertError, normalizeFiles, parseTar, loadProject, evaluateProject, detectGenre, buildGameData, checkFormulas, convertFiles, parseXml, GAME_FILES };
});
