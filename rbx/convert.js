'use strict';
// Project -> bundle: transpile all Luau scripts to JS, analyse API usage, emit bundle text.
const { compile } = require('../lua2js/codegen');
const { tokenize } = require('../lua2js/lexer');
const P = require('./project');
const D = require('./datatypes');
const I = require('./instance');
const { CLASSES } = I;
const VERSION = '2.0.0';

const SVC_LIBS = new Set(['string', 'table', 'math', 'os', 'bit32', 'utf8', 'coroutine', 'debug', 'task']);
let supportedCache = null;
function supported() {
  if (supportedCache) return supportedCache;
  const { ENV } = require('./env');
  ENV.boot({ persist: false, tree: [] });
  const G = ENV.contexts.client.G;
  const globals = new Set(), libs = new Map();
  for (let k = G.next(undefined); k; k = G.next(k[0])) {
    globals.add(k[0]);
    if (k[1] instanceof C().LuaTable) { const s = new Set(); for (let kk = k[1].next(undefined); kk; kk = k[1].next(kk[0])) s.add(String(kk[0])); libs.set(k[0], s); }
  }
  const methods = new Set();
  for (const c of CLASSES.values()) { for (const m of c.methods.keys()) methods.add(m); }
  for (const m of ['Connect', 'Once', 'Wait', 'Disconnect', 'ConnectParallel', 'IsA', 'GetEnumItems', 'FromName', 'FromValue', 'Lerp', 'Dot', 'Cross', 'ToWorldSpace', 'ToObjectSpace', 'PointToWorldSpace', 'PointToObjectSpace', 'VectorToWorldSpace', 'Inverse', 'ToEulerAnglesXYZ', 'GetComponents', 'ToHSV', 'ToHex', 'NextInteger', 'NextNumber', 'NextUnitVector', 'Clone', 'Magnitude', 'Unit', 'Angle', 'FuzzyEq', 'Min', 'Max', 'Abs', 'Floor', 'Ceil', 'Sign', 'UnixTimestamp', 'ToIsoDate', 'FormatLocalTime', 'FormatUniversalTime', 'ToLocalTime', 'ToUniversalTime', 'AddToFilter', 'GetCurrentPage', 'AdvanceToNextPageAsync', 'ComputeAsync', 'GetWaypoints', 'GetPropertyChangedSignal', 'format', 'gsub', 'gmatch', 'match', 'find', 'sub', 'upper', 'lower', 'rep', 'len', 'byte', 'reverse', 'split', 'pack', 'unpack', 'GetAsync', 'SetAsync', 'UpdateAsync', 'IncrementAsync', 'RemoveAsync', 'GetSortedAsync', 'GetRangeAsync', 'IsFinished', 'LoadCharacterAsync']) methods.add(m);
  const services = new Set(Array.from(CLASSES.values()).filter((c) => c.service).map((c) => c.name));
  supportedCache = { globals, libs, methods, services };
  return supportedCache;
}
const C = () => require('../lua2js/core');

/* token-level static scan: Instance.new("X"), GetService("X"), Enum.A.B, :method( calls, function definitions */
function scan(source, out) {
  let toks;
  try { toks = tokenize(source); } catch (e) { return; }
  const T = (i) => toks[i] || {};
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'name' || t.type === 'ident' || t.t === 'name') {
      const v = t.value !== undefined ? t.value : t.v;
      const prev = T(i - 1), next = T(i + 1);
      const pv = prev.value !== undefined ? prev.value : prev.v;
      const nv = next.value !== undefined ? next.value : next.v;
      if (pv === ':' && nv === '(') out.methods.add(v);
      if (pv === ':' && (next.type === 'string' || next.t === 'string')) out.methods.add(v);
    }
  }
}
function simpleScan(source, out) {
  // regex-based and robust to tokenizer shape
  let m;
  const rxSvc = /GetService\s*\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
  while ((m = rxSvc.exec(source))) out.services.add(m[1]);
  const rxNew = /Instance\.new\s*\(\s*["']([A-Za-z0-9_]+)["']/g;
  while ((m = rxNew.exec(source))) out.classes.add(m[1]);
  const rxEnum = /\bEnum\.([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?/g;
  while ((m = rxEnum.exec(source))) out.enums.add(m[2] ? m[1] + '.' + m[2] : m[1]);
  const rxMeth = /:([A-Za-z_][A-Za-z0-9_]*)\s*[("'{\[]/g;
  while ((m = rxMeth.exec(source))) out.methods.add(m[1]);
  const rxDef = /function\s+(?:[A-Za-z_][A-Za-z0-9_]*[.:])*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  while ((m = rxDef.exec(source))) out.defs.add(m[1]);
  const rxDef2 = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\b/g;
  while ((m = rxDef2.exec(source))) out.defs.add(m[1]);
  const rxFld = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:function|[A-Za-z_])/g;
  while ((m = rxFld.exec(source))) out.defs.add(m[1]);
}

function convertProject(prj, opts) {
  opts = opts || {};
  const sup = supported();
  const scripts = prj.scripts();
  let id = 0;
  const chunks = [], failed = [];
  const globalsUsed = new Map(), indexed = new Map();
  const an = { services: new Set(), classes: new Set(), enums: new Set(), methods: new Set(), defs: new Set() };
  let lines = 0;
  for (const { node, path } of scripts) {
    const src = node.source || '';
    lines += src.split('\n').length;
    simpleScan(src, an);
    id++;
    try {
      const r = compile(src, path, id);
      chunks.push({ id, name: path, code: r.code });
      node.chunk = id;
      for (const [k, v] of r.globals) globalsUsed.set(k, (globalsUsed.get(k) || 0) + v);
      for (const p of r.indexed) indexed.set(p, (indexed.get(p) || 0) + 1);
    } catch (e) {
      failed.push({ path, error: (e && e.message) || String(e) });
      chunks.push({ id, name: path, error: (e && e.message) || String(e) });
      node.chunk = id;
    }
    node.sourceLen = src.length;
  }
  // API coverage
  const unsupportedGlobals = [], okGlobals = [];
  for (const [g, n] of globalsUsed) { (sup.globals.has(g) ? okGlobals : unsupportedGlobals).push([g, n]); }
  const libFns = { ok: [], bad: [] };
  for (const p of indexed.keys()) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(\(\))?$/.exec(p);
    if (!m || m[3]) continue;
    const lib = sup.libs.get(m[1]);
    if (lib && m[1] !== 'Enum' && m[1] !== 'game' && m[1] !== 'workspace') (lib.has(m[2]) ? libFns.ok : libFns.bad).push(p);
  }
  const svcOk = [], svcBad = [];
  for (const s of an.services) (sup.services.has(s) ? svcOk : svcBad).push(s);
  const clsOk = [], clsBad = [];
  for (const c of an.classes) { const k = CLASSES.get(c); (k && k.creatable ? clsOk : clsBad).push(c); }
  const enOk = [], enBad = [];
  for (const e of an.enums) { const [t, n] = e.split('.'); const et = D.EnumLib.lget(t); (et && (!n || !et.lenient || et.items.has(n)) ? enOk : enBad).push(e); }
  // enumMisses polluted by lazy lookups: recompute strictly
  const enumBad = [];
  for (const e of an.enums) { const [t, n] = e.split('.'); if (!D.enumTypes || !D.enumTypes.has(t)) enumBad.push(e); else if (n && !D.enumTypes.get(t).items.has(n)) enumBad.push(e); }
  const methodsBad = [];
  for (const m of an.methods) if (!sup.methods.has(m) && !an.defs.has(m)) methodsBad.push(m);
  const report = {
    version: VERSION,
    project: { name: prj.name, kind: prj.kind },
    scripts: { total: scripts.length, transpiled: scripts.length - failed.length, failed, lines },
    globals: { used: okGlobals.length + unsupportedGlobals.length, supported: okGlobals.map((x) => x[0]).sort(), unsupported: unsupportedGlobals.map((x) => x[0]).sort() },
    libraryFunctions: { supported: libFns.ok.sort(), unsupported: libFns.bad.sort() },
    services: { supported: svcOk.sort(), unsupported: svcBad.sort() },
    instanceClasses: { supported: clsOk.sort(), unsupported: clsBad.sort() },
    enums: { supported: enOk.filter((e) => !enumBad.includes(e)).sort(), unsupported: enumBad.sort() },
    methodsNotFound: methodsBad.sort(),
    warnings: prj.warnings.slice(),
  };
  report.stubbedServices = svcOk.filter((s) => ['TeleportService', 'PathfindingService', 'MemoryStoreService', 'LocalizationService', 'GroupService', 'SocialService', 'AnalyticsService', 'VRService', 'HapticService', 'MaterialService', 'TextChatService', 'Chat', 'AvatarEditorService', 'VoiceChatService', 'InsertService', 'AssetService'].includes(s)).sort();
  return { chunks, report, an, tree: prj.tree };
}

/* tree -> serialisable spec (drops sources, keeps chunk ids) */
function treeSpec(nodes) {
  const conv = (n) => {
    const o = { name: n.name, cls: n.cls };
    if (n.id !== undefined) o.id = n.id;
    if (Object.keys(n.props).length) o.props = n.props;
    if (n.chunk !== undefined) o.chunk = n.chunk;
    if (n.attrs) o.attrs = n.attrs;
    if (n.tags && n.tags.length) o.tags = n.tags;
    if (n.children.length) o.children = n.children.map(conv);
    return o;
  };
  return nodes.map(conv);
}

function reportText(r) {
  const L = [];
  const sec = (title, arr) => { L.push(`${title}: ${arr.length ? arr.join(', ') : '—'}`); };
  L.push(`roblox2web ${r.version} — отчёт о конвертации`);
  L.push(`Проект: ${r.project.name} (${r.project.kind})`);
  L.push(`Скрипты: ${r.scripts.transpiled}/${r.scripts.total} транспилированы в JS, ${r.scripts.lines} строк Luau`);
  for (const f of r.scripts.failed) L.push(`  ✗ ${f.path}: ${f.error}`);
  L.push('');
  L.push('=== Покрытие API (статический анализ исходников) ===');
  sec('Глобальные API — поддержаны', r.globals.supported);
  sec('Глобальные API — НЕ найдены в эмуляторе', r.globals.unsupported);
  sec('Функции библиотек — НЕ поддержаны', r.libraryFunctions.unsupported);
  sec('Сервисы — поддержаны', r.services.supported);
  sec('Сервисы — НЕ поддержаны', r.services.unsupported);
  sec('Сервисы-заглушки (вызовы логируются, функциональность урезана)', r.stubbedServices);
  sec('Instance.new — поддержаны', r.instanceClasses.supported);
  sec('Instance.new — НЕ поддержаны', r.instanceClasses.unsupported);
  sec('Enum — НЕ поддержаны', r.enums.unsupported);
  sec('Методы вызываются, но не найдены ни в эмуляторе, ни в проекте', r.methodsNotFound);
  if (r.warnings.length) { L.push(''); L.push('Предупреждения:'); for (const w of r.warnings) L.push('  - ' + w); }
  L.push('');
  L.push('Во время работы страницы неподдержанные обращения (свойства/методы/классы) попадают в консоль страницы: [r2w][unsupported] …');
  return L.join('\n');
}

function bundleJs(result, prj, meta) {
  const parts = [];
  parts.push(`/* generated by roblox2web ${VERSION} — transpiled Luau → JavaScript. Do not edit. */`);
  parts.push('(function(R){');
  for (const c of result.chunks) {
    if (c.error) parts.push(`R.chunkError(${c.id},${JSON.stringify(c.name)},${JSON.stringify(c.error)});`);
    else parts.push(`R.chunk(${c.id},${JSON.stringify(c.name)},${c.code});`);
  }
  const game = { name: prj.name, kind: prj.kind, tree: treeSpec(result.tree), config: prj.config || {}, report: result.report, meta: meta || {} };
  parts.push(`R.setGame(${JSON.stringify(game)});`);
  parts.push('})(window.R2W);');
  return parts.join('\n');
}
module.exports = { convertProject, bundleJs, treeSpec, reportText, VERSION, supported };
