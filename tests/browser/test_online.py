"""Chromium test of the online converter (docs/): upload an example, convert in the browser, run the preview."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
from common import serve, browser, collect
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

class TestOnline(unittest.TestCase):
    def test_online(self):
        with serve(os.path.join(ROOT, 'docs')) as url, browser() as ctx:
            page = ctx.new_page(); errs = collect(page)
            page.goto(url)
            page.set_input_files('#file', os.path.join(ROOT, 'examples', 'guiapp.zip'))
            page.wait_for_selector('#result:not(.hidden)', timeout=30000)
            self.assertIn('скриптов транспилировано', page.inner_text('#verdict'))
            self.assertIn('Покрытие API', page.inner_text('#report'))
            page.click('#previewBtn')
            fr = page.frame_locator('#preview')
            fr.locator('[data-n="Tab_Calc"]').wait_for(timeout=20000)
            fr.locator('[data-n="Tab_Calc"]').click(); fr.locator('[data-n="Key9"]').click()
            from playwright.sync_api import expect
            expect(fr.locator('[data-n="Display"]')).to_have_text('1', timeout=5000)
            # errors: empty/bad archive
            page.set_input_files('#file', {'name': 'bad.zip', 'mimeType': 'application/zip', 'buffer': b'PK\x03\x04garbage'})
            page.wait_for_function("document.getElementById('status').classList.contains('err')", timeout=10000)
            self.assertIn('повреждён', page.inner_text('#status'))
            page.set_input_files('#file', {'name': 'empty.zip', 'mimeType': 'application/zip', 'buffer': b''})
            page.wait_for_timeout(500)
            self.assertIn('пуст', page.inner_text('#status'))
            real = [e for e in errs if 'favicon' not in e and '404' not in e and 'Failed to load resource' not in e]
            self.assertEqual(real, [])
            # download zip
            page.set_input_files('#file', os.path.join(ROOT, 'examples', 'obby.zip'))
            page.wait_for_selector('#result:not(.hidden)', timeout=30000)
            with page.expect_download() as d: page.click('#dlBtn')
            self.assertTrue(d.value.suggested_filename.endswith('-web.zip'))
if __name__ == '__main__': unittest.main()
