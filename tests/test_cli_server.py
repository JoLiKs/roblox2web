import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from common import EXAMPLE, ROOT, make_zip, read_example

CLI = [sys.executable, os.path.join(ROOT, "roblox2web.py")]


def cli(*args, cwd=None):
    return subprocess.run(CLI + list(args), capture_output=True, text=True, cwd=cwd, timeout=120)


class CliTests(unittest.TestCase):
    def test_success_exit_0_and_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "site")
            r = cli(EXAMPLE, "-o", out)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(os.path.exists(os.path.join(out, "index.html")))
            self.assertTrue(os.path.exists(out + ".zip"))
            with zipfile.ZipFile(out + ".zip") as z:
                self.assertIn("data.js", z.namelist())
            self.assertIn("НЕ перевод", r.stdout)
            self.assertIn("НЕ транслируется", r.stdout)

    def test_error_exit_2_for_bad_inputs(self):
        with tempfile.TemporaryDirectory() as d:
            cases = {"empty.zip": b"", "broken.zip": read_example()[:2000], "none.zip": make_zip({"x.txt": "1"}), "junk.zip": b"abc"}
            for name, blob in cases.items():
                p = os.path.join(d, name)
                with open(p, "wb") as f:
                    f.write(blob)
                r = cli(p, "-o", os.path.join(d, "o_" + name))
                self.assertEqual(r.returncode, 2, name + r.stdout)
                self.assertIn("ОШИБКА", r.stderr)
                self.assertNotIn("Traceback", r.stderr)
                self.assertFalse(os.path.exists(os.path.join(d, "o_" + name)), "при ошибке ничего не создаём")
            r = cli(os.path.join(d, "missing.zip"))
            self.assertEqual(r.returncode, 2)
            self.assertNotIn("Traceback", r.stderr)

    def test_unknown_project_exit_3_and_report(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.zip")
            with open(p, "wb") as f:
                f.write(make_zip({"a.lua": "return { x = 1 }"}))
            r = cli(p, "-o", os.path.join(d, "o"), "--no-zip")
            self.assertEqual(r.returncode, 3)
            self.assertIn("НЕ распознана", r.stderr)
            self.assertTrue(os.path.exists(os.path.join(d, "o", "index.html")))
            self.assertFalse(os.path.exists(os.path.join(d, "o", "game.js")))
            r = cli(p, "-o", os.path.join(d, "o2"), "--strict")
            self.assertEqual(r.returncode, 2)
            self.assertFalse(os.path.exists(os.path.join(d, "o2")))

    def test_links_in_footer_data(self):
        with tempfile.TemporaryDirectory() as d:
            r = cli(EXAMPLE, "-o", os.path.join(d, "o"), "--no-zip", "--link", "Src=https://example.com/x", "--link", "bad=javascript:alert(1)")
            self.assertEqual(r.returncode, 0)
            with open(os.path.join(d, "o", "data.js"), encoding="utf-8") as f:
                js = f.read()
            self.assertIn("https://example.com/x", js)
            self.assertNotIn("javascript:", js)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from r2w.server import make_server
        cls.srv = make_server(port=0)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def post(self, data, name="p.zip"):
        req = urllib.request.Request("http://127.0.0.1:%d/convert" % self.port, data=data, method="POST", headers={"X-Filename": name})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_index_page(self):
        with urllib.request.urlopen("http://127.0.0.1:%d/" % self.port) as r:
            html = r.read().decode()
        self.assertIn("Перетащите архив", html)
        self.assertIn("не транслируется", html)

    def test_convert_and_download(self):
        code, j = self.post(read_example())
        self.assertEqual(code, 200)
        self.assertTrue(j["ok"])
        self.assertEqual(j["status"], "game")
        with urllib.request.urlopen("http://127.0.0.1:%d/download/%s" % (self.port, j["token"])) as r:
            blob = r.read()
            self.assertEqual(r.headers["Content-Type"], "application/zip")
        import io
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            self.assertIn("game.js", z.namelist())

    def test_errors_are_json_not_tracebacks(self):
        for data, code in ((b"", "empty"), (b"zzz", "format"), (read_example()[:1500], "broken"), (make_zip({"a.txt": "1"}), "no_scripts")):
            status, j = self.post(data)
            self.assertEqual(status, 400)
            self.assertFalse(j["ok"])
            self.assertEqual(j["code"], code)

    def test_unknown_paths(self):
        for path in ("/nope", "/download/xyz", "/download/../../etc/passwd"):
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen("http://127.0.0.1:%d%s" % (self.port, path))
            self.assertEqual(cm.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
