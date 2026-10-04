'use strict';
// Project loading: archive normalisation, Rojo projects (default.project.json + $path, init.*, .meta.json, .model.json) and .rbxlx.
// Produces a plain tree: [{name, cls, props, source, children, attrs, tags, id}]
const D = require('./datatypes');
const I = require('./instance');
require('./classes'); require('./classes_gui');
const { CLASSES } = I;

class ConvertError extends Error { constructor(code, message) { super(message); this.code = code; this.userMessage = message; } }
const dec = (u8) => {
  if (typeof u8 === 'string') return u8;
  let s = new TextDecoder('utf-8', { fatal: false }).decode(u8);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
};
const dirname = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
function normJoin(base, rel) {
  const parts = (base ? base + '/' + rel : rel).split('/'); const out = [];
  for (const p of parts) { if (p === '' || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
  return out.join('/');
}
function safeName(name) {
  name = name.replace(/\\/g, '/'); const parts = name.split('/').filter((p) => p !== '' && p !== '.');
  if (!parts.length || parts.includes('..') || name.startsWith('/') || /^[A-Za-z]:$/.test(parts[0])) return null;
  return parts.join('/');
}
function normalizeFiles(entries) {
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
    const keys = Object.keys(files); const tops = new Set(keys.map((k) => k.split('/')[0]));
    if (tops.size === 1 && keys.every((k) => k.includes('/'))) { const nf = {}; for (const k of keys) nf[k.slice(k.indexOf('/') + 1)] = files[k]; files = nf; } else return files;
  }
}
function parseTar(u8) {
  const out = []; let off = 0; const td = new TextDecoder();
  let longName = null;
  while (off + 512 <= u8.length) {
    const h = u8.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    let name = td.decode(h.subarray(0, 100)).replace(/\0.*$/, '');
    const prefix = td.decode(h.subarray(345, 500)).replace(/\0.*$/, ''); if (prefix) name = prefix + '/' + name;
    const size = parseInt(td.decode(h.subarray(124, 136)).replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    if (Number.isNaN(size)) throw new ConvertError('broken', 'Архив повреждён (tar-заголовок).');
    off += 512;
    if (type === 'L') { longName = td.decode(u8.subarray(off, off + size)).replace(/\0.*$/, ''); }
    else if (type === '0' || type === '\0') { out.push([longName || name, u8.slice(off, off + size)]); longName = null; }
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}

/* ---------------------------------------------------------------- script naming */
function scriptInfo(filename) {
  const base = basename(filename); let stem = null;
  for (const ext of ['.lua', '.luau']) if (base.endsWith(ext)) { stem = base.slice(0, -ext.length); break; }
  if (stem === null) return null;
  if (stem.endsWith('.server')) return [stem.slice(0, -7), 'Script'];
  if (stem.endsWith('.client')) return [stem.slice(0, -7), 'LocalScript'];
  return [stem, 'ModuleScript'];
}

/* ---------------------------------------------------------------- Rojo property values */
function rojoValue(v) {
  // {"Vector3":[1,2,3]} style
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const k = Object.keys(v);
    if (k.length === 1) {
      const t = k[0], a = v[t];
      switch (t) {
        case 'Vector3': return { t: 'V3', v: a }; case 'Vector2': return { t: 'V2', v: a };
        case 'Color3': return { t: 'C3', v: a }; case 'Color3uint8': return { t: 'C3', v: a.map((x) => x / 255) };
        case 'UDim2': return { t: 'UD2', v: [a[0][0], a[0][1], a[1][0], a[1][1]] }; case 'UDim': return { t: 'UD', v: a };
        case 'Enum': return { t: 'EnN', v: a };
        case 'CFrame': return { t: 'CF', v: [...a.position, ...[].concat(...a.orientation)] };
        case 'String': return a; case 'Bool': return a; case 'Float32': case 'Float64': case 'Int32': case 'Int64': return a;
        case 'BrickColor': return { t: 'BC', v: a };
        case 'NumberRange': return { t: 'NR', v: a };
        case 'Rect': return { t: 'Rect', v: [a[0][0], a[0][1], a[1][0], a[1][1]] };
        default: return undefined;
      }
    }
    return undefined;
  }
  return v; // number / string / bool / bare array (coerced later by property type)
}
function rojoProps(obj) { const out = {}; for (const k of Object.keys(obj || {})) { const v = rojoValue(obj[k]); if (v !== undefined) out[k] = v; } return out; }

/* ---------------------------------------------------------------- project container */
class Node {
  constructor(name, cls, source, path) { this.name = name; this.cls = cls; this.source = source === undefined ? undefined : source; this.path = path; this.props = {}; this.children = []; this.attrs = null; this.tags = null; this.id = undefined; }
  get(name) { return this.children.find((c) => c.name === name); }
  add(n) { this.children.push(n); return n; }
}
class Project {
  constructor() { this.tree = []; this.name = 'Project'; this.kind = 'unknown'; this.warnings = []; this.config = {}; }
  scripts() { const out = []; const walk = (n, p) => { const path = p ? p + '.' + n.name : n.name; if (n.source !== undefined && /Script$/.test(n.cls)) out.push({ node: n, path }); for (const c of n.children) walk(c, path); }; for (const n of this.tree) walk(n, ''); return out; }
}
function findProjectJson(files) {
  const cands = Object.keys(files).filter((k) => k.endsWith('.project.json') && (k.split('/').length - 1) <= 2);
  if (!cands.length) return null;
  cands.sort((a, b) => ((basename(a) === 'default.project.json' ? 0 : 1) - (basename(b) === 'default.project.json' ? 0 : 1)) || (a.split('/').length - b.split('/').length) || (a < b ? -1 : a > b ? 1 : 0));
  return [dirname(cands[0]), cands[0]];
}
function readJson(files, path, prj, what) {
  try { return JSON.parse(dec(files[path])); } catch (e) { prj.warnings.push(`${what || path}: не читается как JSON (${e.message})`); return null; }
}
function loadProject(files) {
  const prj = new Project();
  const cfgKey = Object.keys(files).find((k) => basename(k) === 'roblox2web.config.json');
  if (cfgKey) { const c = readJson(files, cfgKey, prj, 'roblox2web.config.json'); if (c && typeof c === 'object') prj.config = c; }
  const pj = findProjectJson(files);
  if (pj) {
    const [base, path] = pj;
    let spec;
    try { spec = JSON.parse(dec(files[path])); } catch (e) { throw new ConvertError('bad_project', 'default.project.json не читается как JSON: ' + e.message); }
    if (!spec || typeof spec !== 'object' || !spec.tree || typeof spec.tree !== 'object') throw new ConvertError('bad_project', 'В default.project.json нет раздела "tree" — это не проект Rojo.');
    prj.kind = 'rojo'; prj.name = String(spec.name || 'Project');
    buildRojo(prj, files, base, spec.tree);
  } else {
    const rbx = Object.keys(files).filter((k) => k.toLowerCase().endsWith('.rbxlx'));
    if (rbx.length) {
      prj.kind = 'rbxlx'; rbx.sort((a, b) => (a.split('/').length - b.split('/').length) || (a < b ? -1 : 1));
      prj.name = basename(rbx[0]).replace(/\.[^.]*$/, ''); buildRbxlx(prj, files[rbx[0]]);
    } else if (Object.keys(files).some((k) => k.toLowerCase().endsWith('.rbxl'))) {
      throw new ConvertError('binary_rbxl', 'Найден бинарный .rbxl — он не поддерживается. Сохраните место как .rbxlx (File → Save As… → Roblox XML) или используйте Rojo-проект.');
    } else {
      const luas = Object.keys(files).filter((k) => /\.luau?$/i.test(k));
      if (!luas.length) throw new ConvertError('no_scripts', 'В архиве нет ни default.project.json, ни .rbxlx, ни .lua/.luau файлов — это не похоже на исходники Roblox-проекта.');
      prj.kind = 'loose'; prj.warnings.push('Нет default.project.json / .rbxlx: скрипты взяты «как лежат» по папкам (в ReplicatedStorage/ServerScriptService/StarterGui).');
      buildLoose(prj, files);
    }
  }
  return prj;
}
function buildRojo(prj, files, base, tree) {
  const keys = Object.keys(files);
  const metaFor = (path) => { const m = path.replace(/\.(server|client)?\.?(lua|luau)$/, '') + '.meta.json'; return Object.prototype.hasOwnProperty.call(files, m) ? readJson(files, m, prj) : null; };
  const applyMeta = (node, meta) => {
    if (!meta) return;
    if (meta.className) node.cls = meta.className;
    if (meta.properties) Object.assign(node.props, rojoProps(meta.properties));
    if (meta.attributes) { node.attrs = node.attrs || {}; for (const k of Object.keys(meta.attributes)) { const v = rojoValue(meta.attributes[k]); if (v !== undefined) node.attrs[k] = v; } }
  };
  const modelJson = (j, name) => {
    const n = new Node(j.Name || name, j.ClassName || 'Folder'); n.props = rojoProps(j.Properties); if (j.Attributes) { n.attrs = {}; for (const k of Object.keys(j.Attributes)) { const v = rojoValue(j.Attributes[k]); if (v !== undefined) n.attrs[k] = v; } }
    for (const c of j.Children || []) n.add(modelJson(c, c.Name));
    return n;
  };
  const fsNode = (name, path, clsHint) => {
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      const info = scriptInfo(path);
      if (info) { const n = new Node(name, info[1], dec(files[path]), path); applyMeta(n, metaFor(path)); return n; }
      if (path.endsWith('.model.json')) { const j = readJson(files, path, prj); return j ? modelJson(j, name) : null; }
      if (path.endsWith('.json') && !path.endsWith('.meta.json') && !path.endsWith('.project.json')) { return new Node(name, 'ModuleScript', 'return game:GetService("HttpService"):JSONDecode([==[' + dec(files[path]) + ']==])', path); }
      if (path.endsWith('.txt')) { const n = new Node(name, 'StringValue'); n.props.Value = dec(files[path]); return n; }
      if (/\.rbxmx?$/.test(path)) { prj.warnings.push(`Модель ${path} (.rbxm/.rbxmx) не поддерживается — пропущена.`); return null; }
      return null;
    }
    const prefix = path + '/';
    const entries = keys.filter((k) => k.startsWith(prefix));
    if (!entries.length) return null;
    let init = null;
    for (const c of ['init.lua', 'init.luau', 'init.server.lua', 'init.server.luau', 'init.client.lua', 'init.client.luau']) if (Object.prototype.hasOwnProperty.call(files, prefix + c)) { init = c; break; }
    const n = init ? new Node(name, scriptInfo(init)[1], dec(files[prefix + init]), prefix + init) : new Node(name, clsHint || 'Folder');
    if (Object.prototype.hasOwnProperty.call(files, prefix + 'init.meta.json')) applyMeta(n, readJson(files, prefix + 'init.meta.json', prj));
    const seen = new Set();
    for (const k of entries.slice().sort()) {
      const rest = k.slice(prefix.length); const top = rest.split('/')[0];
      if (seen.has(top) || top.startsWith('.') || top.startsWith('init.')) continue;
      if (top.endsWith('.meta.json')) continue;
      if (rest.includes('/')) { seen.add(top); const c = fsNode(top, prefix + top); if (c) n.add(c); }
      else {
        const info = scriptInfo(top);
        if (top.endsWith('.spec.lua') || top.endsWith('.spec.luau')) continue;
        seen.add(top);
        const nm = info ? info[0] : top.replace(/\.(model\.json|json|txt)$/, '');
        const c = fsNode(nm, k); if (c) n.add(c);
      }
    }
    return n;
  };
  const make = (name, spec) => {
    const cls = spec.$className; let path = spec.$path;
    if (path && typeof path === 'object') path = path.optional;
    let node = null;
    if (typeof path === 'string') {
      node = fsNode(name, normJoin(base, path), cls);
      if (!node) prj.warnings.push(`$path "${path}" (узел ${name}) не найден в архиве.`);
    }
    if (!node) node = new Node(name, cls || 'Folder');
    else if (cls && (node.cls === 'Folder')) node.cls = cls;
    if (spec.$properties) Object.assign(node.props, rojoProps(spec.$properties));
    if (spec.$attributes) { node.attrs = node.attrs || {}; for (const k of Object.keys(spec.$attributes)) { const v = rojoValue(spec.$attributes[k]); if (v !== undefined) node.attrs[k] = v; } }
    for (const k of Object.keys(spec)) if (!k.startsWith('$') && spec[k] && typeof spec[k] === 'object' && !Array.isArray(spec[k])) {
      const child = make(k, spec[k]);
      const ex = node.children.findIndex((c) => c.name === k);
      if (ex >= 0) { // merge: project-file node overrides a same-named fs child
        const old = node.children[ex]; for (const cc of old.children) if (!child.children.some((x) => x.name === cc.name)) child.children.push(cc); node.children[ex] = child;
      } else node.add(child);
    }
    return node;
  };
  for (const name of Object.keys(tree)) { if (name.startsWith('$') || !tree[name] || typeof tree[name] !== 'object') continue; prj.tree.push(make(name, tree[name])); }
  if (!prj.scripts().length) prj.warnings.push('Rojo-проект прочитан, но в нём не найдено ни одного .lua/.luau скрипта по путям $path.');
}
function buildLoose(prj, files) {
  const rs = new Node('ReplicatedStorage', 'ReplicatedStorage'), sss = new Node('ServerScriptService', 'ServerScriptService'), sg = new Node('StarterGui', 'StarterGui');
  for (const k of Object.keys(files).sort()) {
    const info = scriptInfo(k); if (!info) continue;
    const root = info[1] === 'Script' ? sss : info[1] === 'LocalScript' ? sg : rs;
    let node = root;
    for (const p of k.split('/').slice(0, -1)) { let c = node.get(p); if (!c) c = node.add(new Node(p, 'Folder')); node = c; }
    node.add(new Node(info[0], info[1], dec(files[k]), k));
  }
  prj.tree.push(rs, sss, sg);
}

/* ---------------------------------------------------------------- XML / rbxlx */
function parseXml(s) {
  const ent = (t) => t.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e]);
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
function b64decode(s) { s = s.replace(/\s+/g, ''); if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64'); const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function buildRbxlx(prj, blob) {
  let root;
  try { root = parseXml(dec(blob)); } catch (e) { throw new ConvertError('bad_rbxlx', '.rbxlx повреждён (XML не читается): ' + e.message); }
  if (!root || root.tag !== 'roblox') throw new ConvertError('bad_rbxlx', 'Файл не похож на .rbxlx (корневой тег не <roblox>).');
  const num = (el, tag) => { const c = el.children.find((x) => x.tag === tag); return c ? parseFloat(c.text) : 0; };
  const walk = (item) => {
    const cls = item.attrs.class || 'Folder'; let name = cls;
    const n = new Node(cls, cls);
    if (item.attrs.referent) n.id = item.attrs.referent;
    const props = item.children.find((c) => c.tag === 'Properties');
    const cdef = CLASSES.get(cls);
    if (props) for (const p of props.children) {
      const pn = p.attrs.name; if (!pn) continue;
      if (pn === 'Name') { n.name = p.text || cls; continue; }
      if (pn === 'Source') { n.source = p.text || ''; continue; }
      let v;
      switch (p.tag) {
        case 'string': case 'ProtectedString': case 'Content': case 'url': v = p.text; if (p.tag === 'Content') { const u = p.children.find((c) => c.tag === 'url'); v = u ? u.text : p.text; } break;
        case 'bool': v = p.text.trim() === 'true'; break;
        case 'int': case 'int64': case 'float': case 'double': v = parseFloat(p.text); break;
        case 'token': { const pd = cdef && cdef.prop(pn); if (pd && pd.def && pd.def.type) { const et = pd.def.type; const item = [...et.items.values()].find((it) => it.value === parseInt(p.text, 10)); if (item) v = { t: 'En', v: [et.name, item.name] }; } break; }
        case 'Color3': if (p.children.length) v = { t: 'C3', v: [num(p, 'R'), num(p, 'G'), num(p, 'B')] }; else { const u = parseInt(p.text, 10) >>> 0; v = { t: 'C3', v: [((u >> 16) & 255) / 255, ((u >> 8) & 255) / 255, (u & 255) / 255] }; } break;
        case 'Color3uint8': { const u = parseInt(p.text, 10) >>> 0; v = { t: 'C3', v: [((u >> 16) & 255) / 255, ((u >> 8) & 255) / 255, (u & 255) / 255] }; break; }
        case 'Vector3': v = { t: 'V3', v: [num(p, 'X'), num(p, 'Y'), num(p, 'Z')] }; break;
        case 'Vector2': v = { t: 'V2', v: [num(p, 'X'), num(p, 'Y')] }; break;
        case 'CoordinateFrame': case 'CFrame': v = { t: 'CF', v: [num(p, 'X'), num(p, 'Y'), num(p, 'Z'), num(p, 'R00'), num(p, 'R01'), num(p, 'R02'), num(p, 'R10'), num(p, 'R11'), num(p, 'R12'), num(p, 'R20'), num(p, 'R21'), num(p, 'R22')] }; break;
        case 'UDim2': v = { t: 'UD2', v: [num(p, 'XS'), num(p, 'XO'), num(p, 'YS'), num(p, 'YO')] }; break;
        case 'UDim': v = { t: 'UD', v: [num(p, 'S'), num(p, 'O')] }; break;
        case 'BrickColor': v = { t: 'BC', v: parseInt(p.text, 10) }; break;
        case 'Ref': if (p.text && p.text !== 'null') v = { t: 'Ref', v: p.text.trim() }; break;
        case 'BinaryString': if (pn === 'Tags') { try { n.tags = Buffer.from(b64decode(p.text)).toString('utf8').split('\0').filter(Boolean); } catch (e) { /* ignore */ } } break;
        default: break;
      }
      if (v !== undefined) n.props[pn] = v;
    }
    for (const ch of item.children) if (ch.tag === 'Item') n.add(walk(ch));
    return n;
  };
  for (const item of root.children) if (item.tag === 'Item') prj.tree.push(walk(item));
}
module.exports = { ConvertError, normalizeFiles, parseTar, loadProject, scriptInfo, Node, Project, dec, basename, dirname, parseXml };
