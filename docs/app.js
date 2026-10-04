(function () {
'use strict';
const $ = id => document.getElementById(id);
$('ver').textContent = Convert.VERSION;
let lastZip = null, lastRes = null;
const TPL = ['index.html', 'style.css', 'game.js', 'i18n.js', 'report.html'];
let templates = null;
async function loadTemplates() {
  if (templates) return templates;
  templates = {};
  await Promise.all(TPL.map(async n => { const r = await fetch('template/' + n); if (!r.ok) throw new Error('Не удалось загрузить шаблон ' + n); templates[n] = await r.text(); }));
  return templates;
}
const setStatus = (msg, cls) => { const s = $('status'); s.textContent = msg; s.className = 'status ' + (cls || ''); };
async function gunzip(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Convert.ConvertError('format', 'Ваш браузер не умеет распаковывать .tar.gz (нет DecompressionStream). Используйте .zip или локальный CLI.');
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readArchive(buf, name) {
  const u8 = new Uint8Array(buf);
  if (!u8.length) throw new Convert.ConvertError('empty', 'Файл пустой (0 байт). Выберите .zip или .tar.gz с проектом Roblox.');
  try {
    if (u8[0] === 0x50 && u8[1] === 0x4B) {
      const z = await JSZip.loadAsync(u8); const entries = [];
      for (const f of Object.values(z.files)) if (!f.dir) entries.push([f.name, await f.async('uint8array')]);
      return Convert.normalizeFiles(entries);
    }
    if ((u8[0] === 0x1f && u8[1] === 0x8b) || /\.(tar|tgz|tar\.gz)$/i.test(name)) {
      const raw = (u8[0] === 0x1f && u8[1] === 0x8b) ? await gunzip(u8) : u8;
      return Convert.normalizeFiles(Convert.parseTar(raw));
    }
  } catch (e) {
    if (e instanceof Convert.ConvertError) throw e;
    throw new Convert.ConvertError('broken', 'Архив повреждён или не читается (' + (e && e.message || e) + ').');
  }
  throw new Convert.ConvertError('format', 'Неизвестный формат файла. Нужен .zip, .tar.gz или .tgz.');
}
async function run(buf, name) {
  $('result').classList.add('hidden'); $('preview').classList.add('hidden');
  setStatus('Читаю архив…');
  try {
    const files = await readArchive(buf, name);
    setStatus('Анализирую Luau-скрипты…');
    await new Promise(r => setTimeout(r, 20));
    const tpl = await loadTemplates();
    const res = Convert.convertFiles(files, tpl, {});
    lastRes = res;
    const zip = new JSZip();
    for (const [n, c] of Object.entries(res.files)) zip.file(n, c);
    lastZip = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    $('verdict').textContent = res.report.verdict; $('verdict').className = 'verdict ' + (res.status === 'game' ? 'ok' : 'bad');
    $('report').textContent = res.text;
    $('result').classList.remove('hidden');
    setStatus(res.status === 'game' ? 'Готово: собрана играбельная веб-демо.' : 'Игра не распознана: собрана только страница-отчёт (не игра).', res.status === 'game' ? 'ok' : 'warn');
  } catch (e) {
    lastZip = null; lastRes = null;
    if (e instanceof Convert.ConvertError) setStatus('Ошибка [' + e.code + ']: ' + e.userMessage, 'err');
    else setStatus('Непредвиденная ошибка: ' + (e && e.message || e), 'err');
  }
}
function handleFile(f) { if (!f) return; const r = new FileReader(); r.onload = () => run(r.result, f.name); r.onerror = () => setStatus('Не удалось прочитать файл.', 'err'); r.readAsArrayBuffer(f); }
const drop = $('drop'), inp = $('file');
drop.addEventListener('click', () => inp.click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') inp.click(); });
inp.addEventListener('change', () => handleFile(inp.files[0]));
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
$('sampleBtn').addEventListener('click', async () => {
  setStatus('Загружаю пример…');
  try { const r = await fetch('sample/PetCollectorSimulator.zip'); if (!r.ok) throw new Error(r.status); run(await r.arrayBuffer(), 'PetCollectorSimulator.zip'); }
  catch (e) { setStatus('Не удалось загрузить пример: ' + e.message, 'err'); }
});
$('dlBtn').addEventListener('click', () => {
  if (!lastZip) return; const a = document.createElement('a'); a.href = URL.createObjectURL(lastZip); a.download = (lastRes && lastRes.status === 'game' ? 'web-demo' : 'report') + '.zip'; document.body.append(a); a.click(); a.remove();
});
$('previewBtn').addEventListener('click', () => {
  if (!lastRes) return; const f = lastRes.files;
  let html = f['index.html'];
  html = html.replace(/<link rel="stylesheet" href="style.css">/, () => '<style>' + (f['style.css'] || '') + '</style>');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => (f[src] !== undefined ? '<script>' + String(f[src]).replace(/<\/script/gi, '<\\/script') + '<\/script>' : m));
  const fr = $('preview'); fr.classList.remove('hidden'); fr.srcdoc = html; fr.scrollIntoView({ behavior: 'smooth' });
});
})();
