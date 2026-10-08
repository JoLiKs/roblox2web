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
            # 2.4: "assets" конфига — rbxassetid://<id> показывает картинку проекта и в предпросмотре (data:URL)
            page.set_input_files('#file', {'name': 'img.zip', 'mimeType': 'application/zip', 'buffer': asset_zip()})
            page.wait_for_selector('#result:not(.hidden)', timeout=30000)
            page.click('#previewBtn')
            fr = page.frame_locator('#preview')
            fr.locator('[data-n="Logo"] img').wait_for(state='attached', timeout=20000)
            page.wait_for_timeout(500)
            info = fr.locator('[data-n="Logo"] img').evaluate('(im) => [im.src.slice(0, 22), im.naturalWidth]')
            self.assertEqual(info[0], 'data:image/png;base64,')
            self.assertEqual(info[1], 4)

def asset_zip():
    import io, json, zipfile, struct, zlib
    def png(w, h):
        raw = b''.join(b'\x00' + b'\xff\x80\x00\xff' * w for _ in range(h))
        ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
    b = io.BytesIO(); z = zipfile.ZipFile(b, 'w')
    z.writestr('img/default.project.json', json.dumps({'name': 'Img', 'tree': {'$className': 'DataModel', 'StarterGui': {'$className': 'StarterGui', '$path': 'gui'}}}))
    z.writestr('img/gui/Show.client.lua', 'local g = Instance.new("ScreenGui")\nlocal i = Instance.new("ImageLabel")\ni.Name = "Logo"\ni.Size = UDim2.fromOffset(128, 128)\ni.Image = "rbxassetid://920001"\ni.Parent = g\ng.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")\n')
    z.writestr('img/assets/logo.png', png(4, 4))
    z.writestr('img/roblox2web.config.json', json.dumps({'assets': {'920001': 'assets/logo.png'}}))
    z.close(); return b.getvalue()
if __name__ == '__main__': unittest.main()
