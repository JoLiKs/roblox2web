import contextlib, http.server, socketserver, threading, functools, os
from playwright.sync_api import sync_playwright

ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

@contextlib.contextmanager
def serve(directory):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(H, directory=directory)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h)
    t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
    try:
        yield 'http://127.0.0.1:%d/' % srv.server_address[1]
    finally:
        srv.shutdown()

@contextlib.contextmanager
def browser(width=1280, height=760, touch=False):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        ctx = b.new_context(viewport={'width': width, 'height': height}, has_touch=touch, is_mobile=touch)
        try:
            yield ctx
        finally:
            b.close()

def collect(page):
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: %s' % e))
    page.on('console', lambda m: errs.append('console.error: %s' % m.text) if m.type == 'error' else None)
    return errs
