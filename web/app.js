'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const C = window.R2WConv;
  let lastSite = null, lastName = 'site';
  $('ver').textContent = C.convert.VERSION;
  const setStatus = (t, err) => { const s = $('status'); s.textContent = t; s.className = 'status' + (err ? ' err' : ''); };
  async function readFiles(name, buf) {
    const u8 = new Uint8Array(buf);
    if (!u8.length) throw new C.project.ConvertError('empty', 'Файл пустой.');
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      let zip; try { zip = await JSZip.loadAsync(u8); } catch (e) { throw new C.project.ConvertError('broken', 'Архив повреждён: ' + e.message); }
      const out = []; for (const n of Object.keys(zip.files)) { const f = zip.files[n]; if (!f.dir) out.push([n, await f.async('uint8array')]); }
      return C.project.normalizeFiles(out);
    }
    if (u8[0] === 0x1f && u8[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new C.project.ConvertError('unsupported', 'Браузер не умеет распаковывать gzip — используйте .zip.');
      let raw; try { raw = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); } catch (e) { throw new C.project.ConvertError('broken', 'Архив повреждён (gzip).'); }
      return C.project.normalizeFiles(C.project.parseTar(raw));
    }
    if (/\.rbxlx$/i.test(name)) return C.project.normalizeFiles([[name, u8]]);
    if (/\.rbxl$/i.test(name)) throw new C.project.ConvertError('binary_rbxl', 'Бинарный .rbxl не поддерживается — сохраните место как .rbxlx.');
    if (u8.length > 262 && String.fromCharCode(...u8.slice(257, 262)) === 'ustar') return C.project.normalizeFiles(C.project.parseTar(u8));
    throw new C.project.ConvertError('unknown', 'Неизвестный формат: нужен .zip, .tar.gz/.tgz или .rbxlx');
  }
  async function assets() {
    const get = async (p, bin) => { const r = await fetch(p); if (!r.ok) throw new Error(p + ': ' + r.status); return r.text(); };
    return { 'runtime.js': await get('runtime.js'), 'vendor/three.min.js': await get('vendor/three.min.js'), 'vendor/LICENSE-three.txt': await get('vendor/LICENSE-three.txt') };
  }
  async function handle(name, buf) {
    $('result').classList.add('hidden'); $('preview').classList.add('hidden'); $('preview').removeAttribute('src');
    setStatus('Читаю архив…');
    try {
      const files = await readFiles(name, buf);
      setStatus('Транспилирую Luau → JS…');
      await new Promise((r) => setTimeout(r, 20));
      const prj = C.project.loadProject(files);
      if (!prj.scripts().length) throw new C.project.ConvertError('no_scripts', 'В проекте нет скриптов.');
      const { files: site, result } = C.site.buildSite(prj, await assets());
      const rep = result.report;
      if (rep.scripts.failed.length === rep.scripts.total) throw new C.project.ConvertError('transpile', 'Ни один скрипт не удалось транспилировать:\n' + rep.scripts.failed.map((f) => f.path + ': ' + f.error).join('\n'));
      lastSite = site; lastName = (prj.name || 'site').replace(/[^\w.-]+/g, '_');
      $('verdict').className = 'verdict' + (rep.scripts.failed.length ? ' bad' : '');
      $('verdict').textContent = `«${prj.name}» (${prj.kind}): ${rep.scripts.transpiled}/${rep.scripts.total} скриптов транспилировано, ${rep.scripts.lines} строк Luau.` + (rep.scripts.failed.length ? ' Есть ошибки парсинга (см. отчёт).' : ' Сайт готов.');
      $('report').textContent = C.convert.reportText(rep);
      $('result').classList.remove('hidden'); setStatus('Готово.');
    } catch (e) {
      lastSite = null;
      if (e instanceof C.project.ConvertError) setStatus('Ошибка: ' + e.userMessage, true); else { console.error(e); setStatus('Внутренняя ошибка: ' + (e && e.message), true); }
    }
  }
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  function assetUrls(site) { // картинки "assets" конфига -> data:URL (предпросмотр открыт из blob:, относительные пути не работают)
    const out = {};
    for (const k of Object.keys(site)) {
      if (!/^assets\//.test(k)) continue; const v = site[k]; const u8 = typeof v === 'string' ? new TextEncoder().encode(v) : v;
      let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      out[k] = 'data:' + (MIME[(k.split('.').pop() || '').toLowerCase()] || 'application/octet-stream') + ';base64,' + btoa(bin);
    }
    return out;
  }
  function previewHtml(site) {
    // single-file HTML: inline all scripts
    const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#111;overflow:hidden}</style></head><body><div id="r2w-root"></div><script>window.R2W_ASSET_URLS=${esc(JSON.stringify(assetUrls(site)))};</script><script>${esc(site['vendor/three.min.js'])}</script><script>${esc(site['runtime.js'])}</script><script>${esc(site['game.bundle.js'])}</script></body></html>`;
  }
  $('previewBtn').onclick = () => {
    if (!lastSite) return; const f = $('preview'); f.classList.remove('hidden');
    f.src = URL.createObjectURL(new Blob([previewHtml(lastSite)], { type: 'text/html' }));
    f.scrollIntoView({ behavior: 'smooth' });
  };
  $('dlBtn').onclick = async () => {
    if (!lastSite) return; const z = new JSZip(); for (const k of Object.keys(lastSite)) z.file(k, lastSite[k]);
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = lastName + '-web.zip'; document.body.appendChild(a); a.click(); a.remove();
  };
  const drop = $('drop'), file = $('file');
  drop.onclick = () => file.click(); drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') file.click(); };
  file.onchange = async () => { const f = file.files[0]; if (f) handle(f.name, await f.arrayBuffer()); };
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async (e) => { const f = e.dataTransfer.files[0]; if (f) handle(f.name, await f.arrayBuffer()); });
  for (const b of document.querySelectorAll('.sample')) b.onclick = async () => {
    setStatus('Загружаю пример…'); try { const r = await fetch('sample/' + b.dataset.s + '.zip'); if (!r.ok) throw new Error(r.status); handle(b.dataset.s + '.zip', await r.arrayBuffer()); } catch (e) { setStatus('Не удалось загрузить пример: ' + e.message, true); }
  };
  window.__r2wHandle = handle;
})();
