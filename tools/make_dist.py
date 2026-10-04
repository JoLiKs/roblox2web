"""Собирает dist/roblox2web-<версия>.zip (дистрибутив без служебных файлов)."""
import os, sys, zipfile
R = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, R)
from r2w.extract import VERSION
INCLUDE = ["roblox2web.py", "README.md", "LICENSE", ".gitignore", "r2w", "template", "js", "web", "docs", "examples", "tests", "tools"]
os.makedirs(os.path.join(R, "dist"), exist_ok=True)
out = os.path.join(R, "dist", "roblox2web-%s.zip" % VERSION)
n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for item in INCLUDE:
        p = os.path.join(R, item)
        if os.path.isfile(p):
            z.write(p, "roblox2web/" + item); n += 1
            continue
        for d, dirs, files in os.walk(p):
            dirs[:] = [x for x in dirs if x != "__pycache__"]
            for f in sorted(files):
                if f.endswith(".pyc"): continue
                fp = os.path.join(d, f)
                z.write(fp, "roblox2web/" + os.path.relpath(fp, R).replace(os.sep, "/")); n += 1
print(out, n, "files")
