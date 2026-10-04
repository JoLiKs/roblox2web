"""Проверка в настоящем Chromium (Playwright): сгенерированная игра играбельна, онлайн-конвертор работает."""
import functools
import http.server
import json
import os
import socketserver
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from common import ROOT, chrome_path, data_from_js, example_files, make_zip, read_example

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

CHROME = chrome_path()
SKIP = None if (sync_playwright and CHROME) else "нужны playwright и Chrome/Chromium (можно указать R2W_CHROME=/path/to/chrome)"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve_dir(directory):
    handler = functools.partial(QuietHandler, directory=directory)
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


@unittest.skipIf(SKIP, SKIP)
class GameInBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="r2w_game_")
        subprocess.run([sys.executable, os.path.join(ROOT, "roblox2web.py"), os.path.join(ROOT, "examples", "PetCollectorSimulator.zip"), "-o", cls.tmp, "--no-zip"],
                       check=True, capture_output=True)
        cls.url = "file://" + os.path.join(cls.tmp, "index.html")
        with open(os.path.join(cls.tmp, "data.js"), encoding="utf-8") as f:
            cls.data = data_from_js(f.read())
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def open(self, **ctx):
        ctx.setdefault("viewport", {"width": 1280, "height": 800})
        self.ctx = self.browser.new_context(**ctx)
        self.addCleanup(self.ctx.close)
        self.errors = []
        page = self.ctx.new_page()
        page.set_default_timeout(8000)
        page.on("pageerror", lambda e: self.errors.append("pageerror: %s" % e))
        page.on("console", lambda m: self.errors.append("console.%s: %s" % (m.type, m.text)) if m.type in ("error", "warning") else None)
        page.goto(self.url)
        page.wait_for_function("window.__game && document.querySelector('#hud b')")
        return page

    def st(self, page, expr):
        return page.evaluate("(() => { const s = __game.state; return %s })()" % expr)

    def tearDown(self):
        self.assertEqual(self.errors, [], "ошибки в консоли браузера")

    def test_01_loads_with_real_data(self):
        p = self.open()
        self.assertIn("Pet Collector Simulator", p.title())
        self.assertEqual(p.inner_text("#gameName"), "Pet Collector Simulator")
        self.assertIn("не сама Roblox-игра", p.inner_text("#disclaimer"))
        self.assertIn("ДЕМО", p.inner_text("#demoBadge"))
        self.assertEqual(self.st(p, "s.coins"), 0)
        box = p.eval_on_selector("#scene", "e => [e.clientWidth, e.clientHeight, e.width, e.height]")
        self.assertTrue(all(v > 100 for v in box), box)
        # canvas не пустой: на нём много разных цветов
        colors = p.evaluate("""() => { const c = document.querySelector('#scene'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add(d[i] << 16 | d[i+1] << 8 | d[i+2]); return set.size; }""")
        self.assertGreater(colors, 8)

    def test_02_collect_hold_respects_rate_limit(self):
        p = self.open()
        pc = p.evaluate("__game.perClick()")
        self.assertEqual(pc, 1)
        box = p.locator("#collectBtn").bounding_box()
        p.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        p.mouse.down()
        p.wait_for_timeout(1500)
        p.mouse.up()
        coins = self.st(p, "s.coins")
        self.assertGreater(coins, 5)
        self.assertLessEqual(coins, 6 + 12 * 1.6 + 2, "лимит 12 кликов/с + всплеск 6")
        self.assertEqual(coins, self.st(p, "s.totalClicks"))

    def test_03_full_loop_hatch_equip_upgrade(self):
        p = self.open()
        p.click("[data-tab=demo]")
        p.click("#demoCoinsBig")                       # +1000
        self.assertEqual(self.st(p, "s.coins"), 1000)
        # идём к яйцу клавишами (реальное движение): spawn (0,18) -> яйцо Meadow на (-13,-10)
        p.keyboard.down("ArrowUp"); p.wait_for_timeout(1150); p.keyboard.up("ArrowUp")
        p.keyboard.down("ArrowLeft"); p.wait_for_timeout(850); p.keyboard.up("ArrowLeft")
        p.wait_for_selector("#eggPrompt:not(.hidden)")
        self.assertIn("Meadow Egg", p.inner_text("#eggPrompt"))
        p.keyboard.press("e")
        p.wait_for_selector("#modal .odds")
        rows = p.eval_on_selector_all("#modal .odds tr", "rs => rs.map(r => r.innerText)")
        self.assertEqual(len(rows), 6)
        total = sum(float(r.split("\t")[-1].strip().rstrip("%")) for r in rows)
        self.assertAlmostEqual(total, 100.0, delta=0.05)
        p.click("#modal .btns button >> nth=1")        # x3 = 450 монет
        p.wait_for_selector("#hatchEquipBest", timeout=6000)
        self.assertEqual(self.st(p, "s.coins"), 1000 - 450)
        self.assertEqual(self.st(p, "Object.keys(s.pets).length"), 3)
        self.assertEqual(self.st(p, "s.totalHatched"), 3)
        names = {pt["Name"] for pt in self.data["pets"] if pt["Id"] in {"bunbun", "chirpy", "mossy", "bumblet", "sunfox", "dandy"}}
        shown = p.eval_on_selector_all("#modal .res b", "es => es.map(e => e.innerText.replace('★ ', ''))")
        self.assertEqual(len(shown), 3)
        self.assertTrue(all(n in names for n in shown), shown)
        p.click("#hatchEquipBest")
        self.assertEqual(self.st(p, "s.equipped.length"), 3)
        p.wait_for_timeout(600)
        # питомцы бегут за игроком: их экранные позиции отличаются от нуля и друг от друга
        # апгрейд за монеты
        p.click("[data-tab=upgrades]")
        before = self.st(p, "s.coins")
        p.click("[data-up=Click] button")
        self.assertEqual(self.st(p, "s.upgrades.Click"), 1)
        self.assertEqual(self.st(p, "s.coins"), before - 20)   # BaseCost 20
        # сила кликов выросла, множитель питомцев учтён
        power = p.evaluate("__game.state.equipped.reduce((a,u)=>a+ (%s)[__game.state.pets[u].id].Power * (__game.state.pets[u].gold?2:1), 0)" % json.dumps({x["Id"]: x for x in self.data["pets"]}))
        self.assertEqual(p.evaluate("__game.perClick()"), int((1 + 1) * (1 + power) * 1 * 1 * 1))

    def test_04_pets_follow_player(self):
        p = self.open()
        p.evaluate("""() => { const s = __game.state; s.pets = {p1:{id:'bunbun',gold:false},p2:{id:'chirpy',gold:false},p3:{id:'mossy',gold:true}}; s.equipped = ['p1','p2','p3']; }""")
        p.wait_for_timeout(300)
        shot1 = p.screenshot(clip={"x": 0, "y": 0, "width": 1280, "height": 700})
        p.keyboard.down("ArrowRight"); p.wait_for_timeout(700); p.keyboard.up("ArrowRight")
        # за игроком (идущим вправо) питомцы оказываются слева от него (сзади)
        px = p.evaluate("__game.player.x")
        self.assertGreater(px, 5)
        p.wait_for_timeout(500)
        self.assertGreater(len(shot1), 5000)

    def test_05_worlds_rebirth_daily_shop_persistence(self):
        p = self.open()
        p.evaluate("__game.state.coins = 1e9; __game.state.gems = 3000; document.querySelector('[data-tab=worlds]').click()")
        p.click("[data-zone=Forest] button")          # открыть за 5000
        self.assertTrue(self.st(p, "!!s.zones.Forest"))
        self.assertEqual(self.st(p, "s.coins"), 1e9 - 5000)
        p.click("[data-zone=Forest] button")          # телепорт
        self.assertEqual(self.st(p, "s.currentZone"), "Forest")
        self.assertIn("Whispering Forest", p.inner_text("#hud"))
        self.assertIn("×3", p.inner_text("#hud"))
        # Volcano требует ребёрт
        self.assertTrue(p.is_disabled("[data-zone=Volcano] button"))
        p.click("[data-tab=rebirth]")
        p.click("#rebirthBtn")
        self.assertEqual(self.st(p, "s.rebirths"), 1)
        self.assertEqual(self.st(p, "s.coins"), 0)
        self.assertEqual(self.st(p, "s.gems"), 3020)   # 20 + 5*0
        self.assertAlmostEqual(p.evaluate("__game.F.rebirthMult(1)"), 1.5)
        # ежедневная награда
        p.click("[data-tab=daily]")
        p.click("#claimDaily")
        self.assertEqual(self.st(p, "s.daily.streak"), 1)
        self.assertEqual(self.st(p, "s.gems"), 3030)   # день 1: 10 гемов
        self.assertIn("Уже получено", p.inner_text("#panel"))
        p.click("#skipDay")
        p.click("#claimDaily")
        self.assertEqual(self.st(p, "s.daily.streak"), 2)
        self.assertEqual(self.st(p, "s.gems"), 3045)   # день 2: 15 гемов
        # магазин (демо) — геймпасс VIP и продукт
        p.click("[data-tab=shop]")
        self.assertIn("ДЕМО", p.inner_text("#panel"))
        self.assertIn("настоящих платежей нет", p.inner_text("#panel"))
        slots_before = p.evaluate("__game.slots()")
        p.click("[data-pass=VIP] button")
        self.assertEqual(p.evaluate("__game.slots()"), slots_before + 1)
        g0 = self.st(p, "s.gems")
        p.click("[data-product=GEMS_SMALL] button")
        self.assertEqual(self.st(p, "s.gems"), g0 + 100)
        p.click("[data-product=LUCK_5X_10M] button")
        self.assertIn("Буст удачи ×5", p.inner_text("#hud") + p.inner_text("#boostLine"))
        # топ (демо)
        p.click("[data-tab=top]")
        self.assertIn("ДЕМО", p.inner_text("#panel"))
        self.assertIn("Вымышленные", p.inner_text("#panel"))
        # сохранение: перезагрузка
        p.evaluate("__game.save()")
        p.reload()
        p.wait_for_function("window.__game")
        self.assertEqual(self.st(p, "s.rebirths"), 1)
        self.assertEqual(self.st(p, "s.currentZone"), "Forest")
        self.assertTrue(self.st(p, "!!s.passes.VIP"))

    def test_06_language_toggle_persists(self):
        p = self.open()
        p.click("#langEn")
        self.assertIn("not the actual Roblox game", p.inner_text("#disclaimer"))
        self.assertEqual(p.inner_text("#collectBtn").strip().split()[-1], "COLLECT")
        p.evaluate("__game.save()")
        p.reload()
        p.wait_for_function("window.__game")
        self.assertIn("COLLECT", p.inner_text("#collectBtn"))
        p.click("#langRu")
        self.assertIn("СОБРАТЬ", p.inner_text("#collectBtn"))

    def test_07_mobile_layout_and_touch(self):
        p = self.open(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        self.assertLessEqual(p.evaluate("document.documentElement.scrollWidth"), 391)
        box = p.locator("#collectBtn").bounding_box()
        self.assertGreater(box["width"], 150)
        p.tap("#collectBtn")
        self.assertGreaterEqual(self.st(p, "s.coins"), 1)
        # тап по земле двигает игрока
        c = p.locator("#scene").bounding_box()
        x0 = p.evaluate("__game.player.x")
        p.touchscreen.tap(c["x"] + c["width"] * 0.85, c["y"] + c["height"] * 0.6)
        p.wait_for_timeout(700)
        self.assertGreater(p.evaluate("__game.player.x"), x0 + 1)

    def test_08_reset_and_corrupt_save_tolerated(self):
        p = self.open()
        p.evaluate("localStorage.setItem('r2w:PetCollectorSimulator:save:v1', '{broken json')")
        p.reload()
        p.wait_for_function("window.__game")
        self.assertEqual(self.st(p, "s.coins"), 0)


@unittest.skipIf(SKIP, SKIP)
class ReportPageAndOnlineConverter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_docs.py")], check=True, capture_output=True)
        cls.srv = serve_dir(os.path.join(ROOT, "docs"))
        cls.base = "http://127.0.0.1:%d/" % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        cls.tmp = tempfile.mkdtemp(prefix="r2w_up_")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.srv.shutdown()
        cls.srv.server_close()

    def page(self):
        ctx = self.browser.new_context(accept_downloads=True, viewport={"width": 1200, "height": 900})
        self.addCleanup(ctx.close)
        self.errors = []
        p = ctx.new_page()
        p.set_default_timeout(15000)
        p.on("pageerror", lambda e: self.errors.append(str(e)))
        p.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        p.goto(self.base)
        return p

    def upload(self, p, name, blob):
        path = os.path.join(self.tmp, name)
        with open(path, "wb") as f:
            f.write(blob)
        p.set_input_files("#file", path)

    def test_sample_button_converts_and_downloads_identical_data(self):
        p = self.page()
        p.click("#sampleBtn")
        p.wait_for_selector("#result:not(.hidden)")
        self.assertIn("играбельная веб-демо", p.inner_text("#verdict"))
        self.assertIn("pets=35", p.inner_text("#report"))
        with p.expect_download() as dl:
            p.click("#dlBtn")
        out = os.path.join(self.tmp, "dl.zip")
        dl.value.save_as(out)
        with zipfile.ZipFile(out) as z:
            names = set(z.namelist())
            self.assertTrue({"index.html", "game.js", "data.js", "style.css", "i18n.js", "CONVERSION_REPORT.txt"} <= names)
            web_data = data_from_js(z.read("data.js").decode())
        from r2w.build import convert
        py = data_from_js(convert(read_example(), "x.zip").files["data.js"].decode())
        self.assertEqual(web_data, py)
        # предпросмотр запускает игру
        p.click("#previewBtn")
        fr = p.frame_locator("#preview")
        fr.locator("#collectBtn").wait_for()
        fr.locator("#collectBtn").click()
        self.assertEqual(p.frames[-1].evaluate("__game.state.coins"), 1)
        self.assertEqual(self.errors, [])

    def test_upload_real_zip_and_targz(self):
        from common import make_targz
        for name, blob in (("project.zip", read_example()), ("project.tar.gz", make_targz(example_files()))):
            p = self.page()
            self.upload(p, name, blob)
            p.wait_for_selector("#result:not(.hidden)")
            self.assertIn("pets=35", p.inner_text("#report"), name)
            self.assertIn("ok", p.get_attribute("#status", "class"))

    def test_non_game_project_gives_report_page(self):
        p = self.page()
        self.upload(p, "obby.zip", make_zip({"default.project.json": json.dumps({"name": "Obby", "tree": {"$className": "DataModel", "ServerScriptService": {"$path": "src"}}}),
                                              "src/Main.server.lua": "print('hi')"}))
        p.wait_for_selector("#result:not(.hidden)")
        self.assertIn("НЕ ИГРА", p.inner_text("#verdict"))
        self.assertIn("warn", p.get_attribute("#status", "class"))
        p.click("#previewBtn")
        fr = p.frame_locator("#preview")
        fr.locator("#verdict").wait_for()
        self.assertIn("НЕ ИГРА", fr.locator("#verdict").inner_text())
        self.assertIn("Main", fr.locator("#scripts").inner_text())

    def test_online_negative_cases(self):
        cases = [("empty.zip", b"", "empty"), ("broken.zip", read_example()[:3000], "broken"), ("junk.zip", b"hello hello", "format"),
                 ("text.zip", make_zip({"a.txt": "x"}), "no_scripts"), ("emptyzip.zip", make_zip({}), "empty")]
        for name, blob, code in cases:
            with self.subTest(name):
                p = self.page()
                self.upload(p, name, blob)
                p.wait_for_function("document.querySelector('#status').className.includes('err')")
                self.assertIn("[%s]" % code, p.inner_text("#status"))
                self.assertTrue(p.is_hidden("#result"))

    def test_direct_report_page_for_python_output(self):
        from r2w.build import convert, write_dir
        res = convert(make_zip({"a.lua": "return { Hello = 'world' }"}), "x.zip")
        d = tempfile.mkdtemp(prefix="r2w_rep_")
        write_dir(res, d)
        p = self.browser.new_page()
        errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto("file://" + os.path.join(d, "index.html"))
        p.wait_for_selector("#verdict")
        self.assertIn("НЕ ИГРА", p.inner_text("#verdict"))
        self.assertIn("Hello", p.inner_text("#found"))
        self.assertEqual(errs, [])
        p.close()


if __name__ == "__main__":
    unittest.main()
