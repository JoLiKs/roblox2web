'use strict';
// "assets" в roblox2web.config.json: картинки проекта для rbxassetid://<id> (loadProject -> buildSite -> game.assets).
const P = require('../../rbx/project');
const { buildSite } = require('../../rbx/site');
const { runProject } = require('../../rbx/headless');
module.exports = function () {
  let ok = 0, fail = 0;
  const check = (c, m) => { if (c) ok++; else { fail++; console.log('  asset_cases.js: FAIL ' + m); } };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const files = {
    'game/default.project.json': Buffer.from(JSON.stringify({ name: 'A', tree: { $className: 'DataModel', ServerScriptService: { $className: 'ServerScriptService', $path: 'src' } } })),
    'game/src/Main.server.lua': Buffer.from('print("hi")'),
    'game/assets/icon_512.png': png,
    'game/roblox2web.config.json': Buffer.from(JSON.stringify({ assets: { '920001': 'assets/icon_512.png', '920002': 'assets/missing.png', 'logo': 'assets/icon_512.png', '920003': '../secret.png' } })),
  };
  const prj = P.loadProject(P.normalizeFiles(Object.entries(files)));
  check(prj.assetMap && prj.assetMap['920001'] === 'assets/icon_512.png', 'id 920001 -> assets/icon_512.png: ' + JSON.stringify(prj.assetMap));
  check(!prj.assetMap['920002'] && prj.warnings.some((w) => /missing\.png/.test(w)), 'отсутствующий файл -> предупреждение');
  check(prj.warnings.some((w) => /не числовой/.test(w)), 'нечисловой ключ -> предупреждение');
  check(!prj.assetMap['920003'] && prj.warnings.some((w) => /secret/.test(w)), 'путь с .. отклонён');
  const { files: site } = buildSite(prj, {});
  check(site['assets/icon_512.png'] && site['assets/icon_512.png'].length === png.length, 'картинка скопирована в сайт');
  check(/"assets":\{"920001":"assets\/icon_512\.png"\}/.test(site['game.bundle.js']), 'карта ассетов в game.bundle.js');
  // ReplicatedFirst: LocalScript оттуда запускается у клиента, RemoveDefaultLoadingScreen/IsFinishedReplicating есть
  const rf = {
    'default.project.json': JSON.stringify({ name: 'RF', tree: { $className: 'DataModel', ReplicatedFirst: { $className: 'ReplicatedFirst', $path: 'first' }, ServerScriptService: { $className: 'ServerScriptService', $path: 'srv' } } }),
    'srv/S.server.lua': '',
    'first/Loading.client.lua': 'local RF = game:GetService("ReplicatedFirst")\nRF:RemoveDefaultLoadingScreen()\nlocal gui = Instance.new("ScreenGui")\ngui.Name = "LoadingScreen"\ngui.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")\nprint("RF " .. tostring(RF:IsFinishedReplicating()) .. " " .. script.Parent.ClassName)',
  };
  const r = runProject(Object.fromEntries(Object.entries(rf).map(([k, v]) => [k, Buffer.from(v)])), {});
  r.ENV.simulate(1);
  check(r.logs.some((l) => l.text === 'RF true ReplicatedFirst'), 'LocalScript из ReplicatedFirst запущен: ' + r.logs.map((l) => l.text).slice(0, 4).join(' | '));
  check(!r.logs.some((l) => l.level === 'err'), 'ReplicatedFirst без ошибок');
  return { ok, fail };
};
