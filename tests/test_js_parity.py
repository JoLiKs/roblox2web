"""JS-версия конвертера (та же, что в браузере) должна давать то же, что и Python-версия."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from common import ROOT, data_from_js, example_files, make_targz, make_zip, read_example
from r2w.build import convert
from r2w.project import ConvertError

NODE = shutil.which("node")


def run_node(data, name="x.zip"):
    with tempfile.NamedTemporaryFile(suffix="_" + name, delete=False) as f:
        f.write(data)
        p = f.name
    try:
        out = subprocess.run([NODE, os.path.join(ROOT, "tests", "node_convert.js"), p, name], capture_output=True, timeout=120)
        return json.loads(out.stdout.decode() or "{}"), out.stderr.decode()
    finally:
        os.unlink(p)


@unittest.skipUnless(NODE, "node не найден")
class Parity(unittest.TestCase):
    def check_same(self, data, name="x.zip"):
        js, err = run_node(data, name)
        try:
            py = convert(data, name)
        except ConvertError as e:
            self.assertFalse(js.get("ok"), err)
            self.assertEqual(js["code"], e.code, js.get("message"))
            return
        self.assertTrue(js.get("ok"), js.get("message", "") + err)
        self.assertEqual(js["status"], py.status)
        self.assertEqual(js["genre"], py.report["genre"])
        self.assertEqual(sorted(js["files"]), sorted(py.files))
        if py.status == "game":
            self.assertEqual(js["data"], data_from_js(py.files["data.js"].decode()))
            self.assertEqual(js["formulaCheck"], py.report["formulaCheck"])
        self.assertEqual(js["warnings"], py.report["warnings"])

    def test_example_zip(self):
        self.check_same(read_example(), "ex.zip")

    def test_example_targz(self):
        self.check_same(make_targz(example_files()), "ex.tar.gz")

    def test_rbxlx_only(self):
        self.check_same(make_zip({"place.rbxlx": example_files()["PetCollectorSimulator.rbxlx"]}))

    def test_loose(self):
        self.check_same(make_zip({k: v for k, v in example_files().items() if k.startswith("src/ReplicatedStorage/") and k.endswith(".lua")}))

    def test_changed_formula(self):
        f = example_files()
        f["src/ReplicatedStorage/Formulas.lua"] = f["src/ReplicatedStorage/Formulas.lua"].replace(b"rebirths", b"(rebirths + 1)", 1)
        self.check_same(make_zip(f))

    def test_report_projects(self):
        self.check_same(make_zip({"a.lua": "return { x = 1 }", "b.server.lua": "print(1)"}))

    def test_negative_cases(self):
        for data, name in [(b"", "x.zip"), (make_zip({}), "x.zip"), (b"garbage garbage", "x.zip"), (read_example()[:5000], "x.zip"),
                           (make_zip({"readme.txt": "x"}), "x.zip"), (make_zip({"g.rbxl": b"xx"}), "x.zip"),
                           (make_zip({"default.project.json": "{bad"}), "x.zip"), (make_zip({"g.rbxlx": "<roblox><Item"}), "x.zip"),
                           (make_zip({"__MACOSX/a": b"1"}), "x.zip")]:
            with self.subTest(name=name, size=len(data), head=data[:8]):
                self.check_same(data, name)


if __name__ == "__main__":
    unittest.main()
