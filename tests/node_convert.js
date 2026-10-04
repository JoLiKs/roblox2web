// Запуск JS-версии конвертера в Node (тот же код, что и в браузере). Использование: node node_convert.js archive [name]
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const C = require('../js/convert.js');
const JSZip = require('../docs/vendor/jszip.min.js');
(async () => {
  const file = process.argv[2], name = process.argv[3] || path.basename(file);
  const out = { ok: false };
  try {
    const buf = new Uint8Array(fs.readFileSync(file));
    if (!buf.length) throw new C.ConvertError('empty', 'Файл пустой');
    let entries;
    try {
      if (buf[0] === 0x50 && buf[1] === 0x4B) {
        const z = await JSZip.loadAsync(buf); entries = [];
        for (const f of Object.values(z.files)) if (!f.dir) entries.push([f.name, await f.async('uint8array')]);
      } else if ((buf[0] === 0x1f && buf[1] === 0x8b) || /\.(tar|tgz|tar\.gz)$/i.test(name)) {
        const raw = buf[0] === 0x1f ? new Uint8Array(zlib.gunzipSync(buf)) : buf; entries = C.parseTar(raw);
      } else throw new C.ConvertError('format', 'Неизвестный формат');
    } catch (e) { if (e instanceof C.ConvertError) throw e; throw new C.ConvertError('broken', 'Архив повреждён: ' + e.message); }
    const files = C.normalizeFiles(entries);
    const T = {}; for (const n of ['index.html', 'style.css', 'game.js', 'i18n.js', 'report.html']) T[n] = fs.readFileSync(path.join(__dirname, '..', 'template', n), 'utf8');
    const r = C.convertFiles(files, T, {});
    out.ok = true; out.status = r.status; out.verdict = r.report.verdict; out.genre = r.report.genre; out.data = r.gameData; out.files = Object.keys(r.files).sort();
    out.warnings = r.report.warnings; out.formulaCheck = r.report.formulaCheck;
  } catch (e) {
    if (e instanceof C.ConvertError) { out.code = e.code; out.message = e.userMessage; } else { out.code = 'internal'; out.message = String(e && e.stack || e); }
  }
  process.stdout.write(JSON.stringify(out));
})();
