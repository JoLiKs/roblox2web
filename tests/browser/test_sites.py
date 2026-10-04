"""Chromium/Playwright tests: converted synthetic projects (obby / tycoon / GUI app) actually run in the browser."""
import os, subprocess, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
from common import serve, browser, collect

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = tempfile.mkdtemp(prefix='r2w_sites_')

def convert(name):
    out = os.path.join(OUT, name)
    r = subprocess.run(['node', os.path.join(ROOT, 'roblox2web.js'), os.path.join(ROOT, 'examples', name), '-o', out], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    return out

def real_errors(errs):
    return [e for e in errs if 'favicon' not in e and '404' not in e]

class Base(unittest.TestCase):
    name = None
    @classmethod
    def setUpClass(cls):
        cls.dir = convert(cls.name)
    def open(self, ctx, q='?quiet=1&persist=0&autobuy=0'):
        page = ctx.new_page(); self.errs = collect(page)
        page.goto(self.url + q)
        page.wait_for_function('window.R2W && R2W.started && R2W.ENV.frameNo > 5', timeout=20000)
        return page

class TestObby(Base):
    name = 'obby'
    def test_obby(self):
        with serve(self.dir) as url, browser() as ctx:
            self.url = url; page = self.open(ctx)
            page.wait_for_timeout(2500)
            self.assertEqual(page.evaluate('R2W.ENV.errorCount'), 0)
            self.assertGreater(page.evaluate('R2W.ENV.world3d.meshes.size'), 15)
            self.assertIn('Stage 0 / 5', page.inner_text('[data-n="Stage"]'))
            for i in (1, 3, 5):
                page.evaluate("""(i)=>{const E=R2W.ENV;const cp=E.workspace.findChild('ObbyWorld').findChild('Checkpoint'+i);const hrp=E.localPlayer.props.Character.findChild('HumanoidRootPart');const c=cp.props.CFrame;hrp.lset('CFrame',c.mul?c:c);hrp.lset('CFrame',new c.constructor(c.x,c.y+3,c.z));}""", i)
                page.wait_for_timeout(1200)
            page.wait_for_function("document.querySelector('[data-n=\"Stage\"]').innerText.includes('Stage 5 / 5')", timeout=8000)
            self.assertTrue(page.is_visible('[data-n="Banner"]'))
            self.assertIn('finished', page.inner_text('[data-n="Banner"]'))
            # kill brick: die -> Deaths increases
            page.evaluate("""()=>{const h=R2W.ENV.localPlayer.props.Character.findChild('Humanoid');h.lset('Health',0);}""")
            page.wait_for_function("document.querySelector('[data-n=\"Deaths\"]').innerText.includes('Deaths: 1')", timeout=8000)
            # WASD moves the character
            page.keyboard.down('KeyW'); page.wait_for_timeout(1800)
            page.keyboard.up('KeyW')
            self.assertEqual(real_errors(self.errs), [])

class TestTycoon(Base):
    name = 'tycoon'
    def test_tycoon(self):
        with serve(self.dir) as url, browser() as ctx:
            self.url = url; page = self.open(ctx)
            page.wait_for_timeout(1500)
            cash = lambda: page.evaluate("R2W.ENV.localPlayer.findChild('leaderstats').findChild('Cash').props.Value")
            page.wait_for_function("R2W.ENV.localPlayer.findChild('leaderstats').findChild('Cash').props.Value > 0", timeout=40000)
            self.assertIn('$', page.inner_text('[data-n="Cash"]'))
            # buy with not enough cash -> message
            page.click('[data-n="Item_Dropper3"]')
            page.wait_for_timeout(500)
            self.assertIn('previous', page.inner_text('[data-n="Msg"]'))
            page.evaluate("R2W.ENV.localPlayer.findChild('leaderstats').findChild('Cash').lset('Value', 5000)")
            page.click('[data-n="Item_Dropper2"]'); page.wait_for_timeout(500)
            self.assertIn('Bought', page.inner_text('[data-n="Msg"]'))
            self.assertIn('✔', page.inner_text('[data-n="Item_Dropper2"]'))
            self.assertLess(cash(), 5000)
            # product purchase -> modal -> ProcessReceipt grants cash
            before = cash()
            page.click('[data-n="PackBtn"]'); page.wait_for_selector('#r2w-buy-ok', timeout=5000)
            page.click('#r2w-buy-ok'); page.wait_for_timeout(1500)
            self.assertGreaterEqual(cash(), before + 2000)
            # game pass
            page.click('[data-n="PassBtn"]'); page.wait_for_selector('#r2w-buy-ok', timeout=5000)
            page.click('#r2w-buy-ok')
            page.wait_for_function("document.querySelector('[data-n=\"PassBtn\"]').innerText.includes('✔')", timeout=5000)
            # proximity prompt: teleport next to pad, press E
            page.evaluate("""()=>{const E=R2W.ENV;const pad=E.workspace.findChild('Plot').findChild('Buy_Upgrade1');const hrp=E.localPlayer.props.Character.findChild('HumanoidRootPart');const c=pad.props.CFrame;hrp.lset('CFrame',new c.constructor(c.x,c.y+3,c.z+3));}""")
            page.wait_for_timeout(800)
            page.keyboard.press('KeyE'); page.wait_for_timeout(800)
            self.assertTrue(page.evaluate("R2W.ENV.workspace.findChild('Plot') && true"))
            self.assertEqual(real_errors(self.errs), [])

class TestGui(Base):
    name = 'guiapp'
    def test_gui(self):
        with serve(self.dir) as url, browser() as ctx:
            self.url = url; page = self.open(ctx)
            page.wait_for_timeout(800)
            self.assertIn('2 tasks', page.inner_text('[data-n="Count"]'))
            page.fill('[data-n="Input"] input', 'Write tests')
            page.click('[data-n="Add"]'); page.wait_for_timeout(300)
            self.assertIn('3 tasks', page.inner_text('[data-n="Count"]'))
            page.click('[data-n="Row3"] [data-n="Label"]'); page.wait_for_timeout(200)
            self.assertIn('1 done', page.inner_text('[data-n="Count"]'))
            page.click('[data-n="Row1"] [data-n="Del"]'); page.wait_for_timeout(200)
            self.assertIn('2 tasks', page.inner_text('[data-n="Count"]'))
            page.click('[data-n="Tab_Calc"]'); page.wait_for_timeout(300)
            for k in ['1', '2', '*', '(', '3', '+', '4', ')']:
                page.click('[data-n="Key%d"]' % ['7','8','9','/','4','5','6','*','1','2','3','-','0','.','C','+','(',')','^','='].index(k) .__add__(1))
            page.click('[data-n="Key20"]'); page.wait_for_timeout(200)
            self.assertEqual(page.inner_text('[data-n="Display"]').strip(), '84')
            page.click('[data-n="Tab_Timer"]'); page.click('[data-n="Start"]')
            page.wait_for_function("document.querySelector('[data-n=\"Clock\"]').innerText.startsWith('00:0')", timeout=8000)
            self.assertEqual(real_errors(self.errs), [])

if __name__ == '__main__':
    unittest.main()
