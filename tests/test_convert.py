import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from common import (data_from_js, example_files, luau_count, make_targz, make_zip, read_example)
from r2w.build import convert, make_zip as pack
from r2w.project import ConvertError, read_archive


def conv(files_or_bytes, name="x.zip", **kw):
    data = files_or_bytes if isinstance(files_or_bytes, bytes) else make_zip(files_or_bytes)
    return convert(data, name, **kw)


class PositiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = example_files()
        cls.res = convert(read_example(), "PetCollectorSimulator.zip")
        cls.data = data_from_js(cls.res.files["data.js"].decode())

    def test_status_and_genre(self):
        self.assertEqual(self.res.status, "game")
        self.assertEqual(self.res.report["genre"], "pet-simulator")

    def test_counts_match_luau_source(self):
        # независимая проверка: считаем вызовы pet(/egg( регулярками в исходнике
        pd = "src/ReplicatedStorage/PetData.lua"
        self.assertEqual(len(self.data["pets"]), luau_count(self.files, pd, r"^\tpet\("))
        self.assertEqual(len(self.data["eggs"]), luau_count(self.files, pd, r"^\tegg\("))
        self.assertEqual(len(self.data["pets"]), 35)
        self.assertEqual(len(self.data["eggs"]), 6)
        self.assertEqual(len(self.data["zones"]), 5)
        self.assertEqual(len(self.data["upgrades"]["list"]), 5)

    def test_values_match_source(self):
        pets = {p["Id"]: p for p in self.data["pets"]}
        self.assertEqual(pets["nebuladrake"]["Power"], 70000)
        self.assertEqual(pets["nebuladrake"]["Rarity"], "Mythic")
        self.assertEqual(pets["bunbun"]["Look"]["Body"], "#faf0e1")   # c3(250, 240, 225)
        self.assertEqual(pets["chirpy"]["Power"], 1.5)
        eggs = {e["Id"]: e for e in self.data["eggs"]}
        self.assertEqual(eggs["GemEgg"]["Currency"], "Gems")
        self.assertEqual(eggs["GemEgg"]["Price"], 75)
        self.assertEqual([p["Weight"] for p in eggs["MeadowEgg"]["Pets"]], [40, 30, 18, 8, 3.5, 0.5])
        for e in self.data["eggs"]:
            self.assertAlmostEqual(sum(p["Weight"] for p in e["Pets"]), 100.0, places=6, msg=e["Id"])
        zones = {z["Id"]: z for z in self.data["zones"]}
        self.assertEqual([zones[k]["Multiplier"] for k in ("Meadow", "Forest", "Desert", "Frost", "Volcano")], [1, 3, 9, 27, 81])
        self.assertEqual(zones["Volcano"]["RequiresRebirths"], 1)
        self.assertEqual(zones["Volcano"]["UnlockCost"], 60000000)
        ups = {u["Id"]: u for u in self.data["upgrades"]["list"]}
        self.assertEqual(ups["Slots"]["Costs"], [100, 300, 800, 2000])
        self.assertEqual(ups["Click"]["Growth"], 1.45)
        c = self.data["config"]
        self.assertEqual(c["REBIRTH_BASE_COST"], 50000)
        self.assertEqual(len(c["DAILY_REWARDS"]), 7)
        self.assertEqual(c["PRODUCTS"]["LUCK_5X_10M"]["Multiplier"], 5)
        self.assertNotIn("GAMEPASS_IDS", c)

    def test_formula_check_passes(self):
        self.assertIn("совпали", self.res.report["formulaCheck"])
        self.assertFalse([w for w in self.res.report["warnings"] if "Formulas" in w])

    def test_formula_mismatch_is_reported(self):
        files = dict(self.files)
        files["src/ReplicatedStorage/Formulas.lua"] = files["src/ReplicatedStorage/Formulas.lua"].replace(
            b"1 + Config.REBIRTH_MULT_PER * rebirths", b"1 + 2 * Config.REBIRTH_MULT_PER * rebirths")
        res = conv(files)
        self.assertEqual(res.status, "game")
        self.assertIn("РАСХОЖДЕНИЯ", res.report["formulaCheck"])
        self.assertTrue(any("отличаются" in w for w in res.report["warnings"]))

    def test_changed_data_is_reflected(self):
        files = dict(self.files)
        files["src/ReplicatedStorage/ZoneData.lua"] = files["src/ReplicatedStorage/ZoneData.lua"].replace(b"Multiplier = 81", b"Multiplier = 100")
        res = conv(files)
        d = data_from_js(res.files["data.js"].decode())
        self.assertEqual([z for z in d["zones"] if z["Id"] == "Volcano"][0]["Multiplier"], 100)

    def test_output_files(self):
        for n in ("index.html", "style.css", "game.js", "i18n.js", "data.js", "CONVERSION_REPORT.txt", "conversion-report.json"):
            self.assertIn(n, self.res.files)
        self.assertIn("НЕ перевод", self.res.report["verdict"])
        self.assertIn("НЕ транслируется", self.res.text_report())

    def test_tar_gz_input(self):
        res = convert(make_targz(self.files), "p.tar.gz")
        self.assertEqual(res.status, "game")
        self.assertEqual(data_from_js(res.files["data.js"].decode()), self.data)

    def test_wrapped_in_top_folder(self):
        res = conv({"MyGame/" + k: v for k, v in self.files.items()})
        self.assertEqual(res.status, "game")

    def test_rbxlx_only_input(self):
        # только .rbxlx без Rojo: скрипты берутся из XML
        rbx = self.files["PetCollectorSimulator.rbxlx"]
        res = conv({"place.rbxlx": rbx})
        self.assertEqual(res.status, "game")
        self.assertEqual(res.report["sourceKind"], "rbxlx")
        d = data_from_js(res.files["data.js"].decode())
        self.assertEqual(len(d["pets"]), 35)
        self.assertEqual([p["Power"] for p in d["pets"]], [p["Power"] for p in self.data["pets"]])

    def test_loose_lua_files(self):
        files = {k: v for k, v in self.files.items() if k.startswith("src/ReplicatedStorage/") and k.endswith(".lua")}
        res = conv(files)
        self.assertEqual(res.status, "game")
        self.assertEqual(res.report["sourceKind"], "loose")
        self.assertTrue(any("default.project.json" in w for w in res.report["warnings"]))

    def test_partial_data_uses_defaults_with_warnings(self):
        files = {"default.project.json": json.dumps({"name": "P", "tree": {"$className": "DataModel", "ReplicatedStorage": {"$className": "ReplicatedStorage", "$path": "src"}}}),
                 "src/PetData.lua": self.files["src/ReplicatedStorage/PetData.lua"].decode().replace("local Config = require(script.Parent.Config)", "")}
        res = conv(files)
        self.assertEqual(res.status, "game")
        w = " ".join(res.report["warnings"])
        self.assertIn("ZoneData не найден", w)
        self.assertIn("UpgradeData не найден", w)
        self.assertIn("Config не найден", w)

    def test_bad_egg_reference_is_dropped_with_warning(self):
        src = self.files["src/ReplicatedStorage/PetData.lua"].replace(b'{ Id = "mossy", Weight = 18 }', b'{ Id = "ghost", Weight = 18 }')
        files = dict(self.files)
        files["src/ReplicatedStorage/PetData.lua"] = src
        res = conv(files)
        self.assertEqual(res.status, "game")
        self.assertTrue(any("ghost" in w for w in res.report["warnings"]))

    def test_does_not_leak_ids_or_tokens(self):
        self.assertNotIn(b"GAMEPASS_IDS", self.res.files["data.js"])
        self.assertNotIn(b"PRODUCT_IDS", self.res.files["data.js"])


class NegativeTests(unittest.TestCase):
    def assertConvertError(self, data, code, name="x.zip"):
        with self.assertRaises(ConvertError) as cm:
            convert(data, name)
        self.assertEqual(cm.exception.code, code, cm.exception.message)
        self.assertTrue(cm.exception.message)
        return cm.exception

    def test_zero_bytes(self):
        self.assertConvertError(b"", "empty")

    def test_empty_zip(self):
        self.assertConvertError(make_zip({}), "empty")

    def test_zip_with_only_dirs_or_junk_entries(self):
        self.assertConvertError(make_zip({"__MACOSX/x": b"1", ".DS_Store": b"1"}), "empty")

    def test_garbage_bytes(self):
        self.assertConvertError(b"this is not an archive at all", "format")

    def test_truncated_zip(self):
        data = read_example()
        self.assertConvertError(data[: len(data) // 2], "broken")

    def test_corrupted_zip_header(self):
        self.assertConvertError(b"PK\x03\x04" + b"\x00" * 40, "broken")

    def test_truncated_targz(self):
        data = make_targz({"a.lua": "return {}" * 5000})
        self.assertConvertError(data[:40], "broken", "a.tar.gz")

    def test_no_scripts_at_all(self):
        e = self.assertConvertError(make_zip({"readme.txt": "hello", "img.png": b"\x89PNG"}), "no_scripts")
        self.assertIn("не похоже", e.message)

    def test_binary_rbxl(self):
        self.assertConvertError(make_zip({"game.rbxl": b"<roblox!\x89\xff\r\n\x1a\n"}), "binary_rbxl")

    def test_broken_rbxlx(self):
        self.assertConvertError(make_zip({"game.rbxlx": "<roblox><Item"}), "bad_rbxlx")
        self.assertConvertError(make_zip({"game.rbxlx": "<html></html>"}), "bad_rbxlx")

    def test_bad_project_json(self):
        self.assertConvertError(make_zip({"default.project.json": "{ not json"}), "bad_project")
        self.assertConvertError(make_zip({"default.project.json": '{"name":"x"}'}), "bad_project")

    def test_path_traversal_entries_ignored(self):
        data = make_zip({"../evil.lua": "return 1", "/abs.lua": "return 1", "ok/a.lua": "return {}"})
        files = read_archive(data, "x.zip")
        self.assertEqual(list(files), ["a.lua"])
        self.assertFalse([k for k in files if ".." in k or k.startswith("/")])

    def test_no_data_modules_gives_report_not_game(self):
        res = convert(make_zip({"default.project.json": json.dumps({"name": "Obby", "tree": {"$className": "DataModel", "ServerScriptService": {"$path": "src"}}}),
                                "src/Main.server.lua": 'print("hi")\nlocal part = Instance.new("Part")',
                                "src/Util.lua": "return { add = function(a, b) return a + b end }"}), "obby.zip")
        self.assertEqual(res.status, "report")
        self.assertIn("НЕ ИГРА", res.report["verdict"])
        self.assertIn("index.html", res.files)
        self.assertNotIn("game.js", res.files)
        self.assertIn(b"R2W_REPORT", res.files["report.js"])
        self.assertTrue(any("Main" in s[0] for s in res.report["scripts"]))
        self.assertIn("НЕ транслируется", res.text_report())

    def test_strict_mode_raises_for_unknown_project(self):
        with self.assertRaises(ConvertError) as cm:
            convert(make_zip({"a.lua": "return { x = 1 }"}), "x.zip", strict=True)
        self.assertEqual(cm.exception.code, "not_a_game")

    def test_tycoon_like_project_is_not_faked(self):
        res = convert(make_zip({"default.project.json": json.dumps({"name": "T", "tree": {"$className": "DataModel", "ServerScriptService": {"$path": "src"}}}),
                                "src/Dropper.lua": "return {}", "src/Config.lua": "return { GAME_NAME = 'T', REBIRTH_BASE_COST = 5 }"}), "t.zip")
        self.assertEqual(res.status, "report")
        self.assertEqual(res.report["genre"], "tycoon")

    def test_syntax_error_in_data_module_does_not_crash(self):
        res = convert(make_zip({"a.lua": "return { oops = = }", "b.lua": "return { x = 1 }"}), "x.zip")
        self.assertEqual(res.status, "report")
        self.assertTrue(any("синтакс" in m for m in res.report["log"]))

    def test_petdata_without_valid_pets_is_an_error_report(self):
        res = convert(make_zip({"p.lua": 'return { Pets = { { Id = "a", Power = 1 } }, Eggs = { { Id = "e", Pets = { { Id = "zzz", Weight = 1 } } } } }'}), "x.zip")
        self.assertEqual(res.status, "report")
        self.assertTrue(any("яйц" in w for w in res.report["warnings"]))


if __name__ == "__main__":
    unittest.main()
