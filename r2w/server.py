"""Локальная веб-страница-загрузчик на стандартном http.server (без зависимостей).

Запуск:  python roblox2web.py --serve   (или python -m r2w.server)  ->  http://127.0.0.1:8765
Слушает только 127.0.0.1. Архив перетаскивается на страницу, результат скачивается как zip.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .build import convert, make_zip
from .extract import VERSION
from .project import ConvertError

MAX_UPLOAD = 120 * 1024 * 1024
RESULTS = {}  # token -> zip bytes (хранится в памяти, не более 8 штук)
LOCK = threading.Lock()

PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>roblox2web — локальный загрузчик</title>
<style>*{box-sizing:border-box}body{margin:0;background:#1c2030;color:#f5f7ff;font-family:system-ui,sans-serif;line-height:1.45}.w{max-width:860px;margin:0 auto;padding:16px}
.warn{background:#4a3a14;color:#ffe9a8;border-radius:12px;padding:12px;margin:12px 0}.drop{border:3px dashed #5a6490;border-radius:16px;padding:40px 16px;text-align:center;cursor:pointer;background:#2c324a}
.drop.over,.drop:hover{border-color:#ffd046}button,a.b{display:inline-block;font:inherit;font-weight:700;border:0;border-radius:10px;padding:10px 16px;background:#468cfa;color:#fff;cursor:pointer;text-decoration:none}
pre{background:#0007;padding:10px;border-radius:10px;white-space:pre-wrap;word-break:break-word;font-size:.82rem}.ok{background:#1d5a33;padding:8px;border-radius:8px}.bad{background:#6a4b10;padding:8px;border-radius:8px}.err{background:#6a2020;padding:8px;border-radius:8px}.hidden{display:none}</style></head>
<body><div class="w"><h1>roblox2web <small style="font-size:.5em;color:#aab4cd">локальный загрузчик v__VER__</small></h1>
<div class="warn"><b>Честно:</b> Luau-код произвольной игры не транслируется. Инструмент извлекает данные (питомцы, яйца, миры, апгрейды, баланс) и подставляет их в готовый шаблон «pet / clicker simulator». Для других проектов вы получите только страницу-отчёт.</div>
<div id="drop" class="drop">⬆ Перетащите архив .zip / .tar.gz с проектом Roblox сюда или нажмите, чтобы выбрать<input id="f" type="file" hidden accept=".zip,.tar,.gz,.tgz"></div>
<p id="st"></p><div id="res" class="hidden"><div id="verdict"></div><p><a class="b" id="dl" href="#">⬇ Скачать zip</a></p><pre id="rep"></pre></div></div>
<script>
const $=i=>document.getElementById(i),drop=$('drop'),f=$('f');
drop.onclick=()=>f.click();f.onchange=()=>send(f.files[0]);
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>send(e.dataTransfer.files[0]));
async function send(file){if(!file)return;$('res').classList.add('hidden');$('st').className='';$('st').textContent='Конвертирую…';
 try{const r=await fetch('/convert',{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name)},body:file});const j=await r.json();
  if(!j.ok){$('st').className='err';$('st').textContent='Ошибка ['+j.code+']: '+j.message;return}
  $('st').textContent='';$('res').classList.remove('hidden');$('verdict').className=j.status==='game'?'ok':'bad';$('verdict').textContent=j.verdict;
  $('rep').textContent=j.text;$('dl').href='/download/'+j.token;$('dl').download=(j.status==='game'?'web-demo':'report')+'.zip';
 }catch(e){$('st').className='err';$('st').textContent='Сбой: '+e}}
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "roblox2web/" + VERSION

    def log_message(self, fmt, *args):
        sys.stderr.write("[roblox2web] " + (fmt % args) + "\n")

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, PAGE.replace("__VER__", VERSION), "text/html; charset=utf-8")
        elif self.path.startswith("/download/"):
            tok = self.path[len("/download/"):]
            with LOCK:
                blob = RESULTS.get(tok)
            if blob is None:
                self._send(404, json.dumps({"ok": False, "message": "результат не найден"}))
            else:
                self._send(200, blob, "application/zip", {"Content-Disposition": 'attachment; filename="web-demo.zip"'})
        else:
            self._send(404, json.dumps({"ok": False, "message": "not found"}))

    def do_POST(self):
        if self.path != "/convert":
            return self._send(404, json.dumps({"ok": False, "message": "not found"}))
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = -1
        if n < 0 or n > MAX_UPLOAD:
            return self._send(413, json.dumps({"ok": False, "code": "too_big", "message": "Файл слишком большой (лимит %d МБ)." % (MAX_UPLOAD // 2 ** 20)}))
        data = self.rfile.read(n) if n else b""
        from urllib.parse import unquote
        name = unquote(self.headers.get("X-Filename", ""))
        try:
            res = convert(data, os.path.basename(name))
        except ConvertError as e:
            return self._send(400, json.dumps({"ok": False, "code": e.code, "message": e.message}, ensure_ascii=False))
        except Exception as e:  # непредвиденное — не роняем сервер и не показываем трейсбек
            sys.stderr.write("[roblox2web] internal error: %r\n" % (e,))
            return self._send(500, json.dumps({"ok": False, "code": "internal", "message": "Внутренняя ошибка конвертера: %s" % type(e).__name__}, ensure_ascii=False))
        tok = secrets.token_urlsafe(12)
        with LOCK:
            RESULTS[tok] = make_zip(res)
            while len(RESULTS) > 8:
                RESULTS.pop(next(iter(RESULTS)))
        self._send(200, json.dumps({"ok": True, "status": res.status, "verdict": res.report["verdict"], "text": res.text_report(), "token": tok}, ensure_ascii=False))


def make_server(host="127.0.0.1", port=8765):
    return ThreadingHTTPServer((host, port), Handler)


def serve(host="127.0.0.1", port=8765):
    srv = make_server(host, port)
    print("roblox2web: http://%s:%d  (Ctrl+C — остановить)" % (host, srv.server_address[1]))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nостановлено")
    finally:
        srv.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    serve(port=port)
