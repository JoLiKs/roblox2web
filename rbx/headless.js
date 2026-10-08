'use strict';
// Node-side helper: load a project (files map) and run it headless (used by tests and the CLI "--run" check)
const P = require('./project');
const { ENV } = require('./env');
function inlineTree(nodes) {
  const conv = (n) => {
    const o = { name: n.name, cls: n.cls };
    if (n.id !== undefined) o.id = n.id;
    if (Object.keys(n.props).length) o.props = n.props;
    if (n.source !== undefined) o.source = n.source;
    if (n.attrs) o.attrs = n.attrs;
    if (n.tags && n.tags.length) o.tags = n.tags;
    if (n.children.length) o.children = n.children.map(conv);
    return o;
  };
  return nodes.map(conv);
}
function runProject(files, opts) {
  opts = opts || {};
  const prj = P.loadProject(files);
  const logs = [];
  ENV.onLog = (e) => { logs.push(e); if (opts.echo) console.log(`[${e.who}] ${e.level}: ${e.text}`); };
  ENV.boot({ tree: inlineTree(prj.tree), persist: false, seed: opts.seed === undefined ? 12345 : opts.seed, latency: opts.latency, catalog: (prj.config && prj.config.catalog) || undefined, assets: prj.assetMap || undefined, name: prj.name, placeKey: prj.name });
  ENV.geo = opts.geo || null; // geo.js object (browser boot creates one); null -> GetCountryRegionForPlayerAsync returns 'US'
  ENV.start({ playerName: opts.playerName, premium: opts.premium, localeId: opts.localeId || (opts.geo && opts.geo.localeId) || undefined, attrs: opts.attrs });
  return { ENV, prj, logs };
}
module.exports = { runProject, inlineTree };
