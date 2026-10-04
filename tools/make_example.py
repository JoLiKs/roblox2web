"""Собирает examples/PetCollectorSimulator.zip из исходников проекта (без бинарников и скачанных инструментов)."""
import os, sys, zipfile
src = sys.argv[1] if len(sys.argv) > 1 else "/workspace/roblox-game"
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "examples", "PetCollectorSimulator.zip")
SKIP_DIRS = {"tools_dl", "build", "dist", ".git", "node_modules"}
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for f in sorted(files):
            p = os.path.join(root, f)
            if f.endswith((".zip", ".exe", ".dll", ".so")) or os.path.getsize(p) > 2_000_000:
                continue
            with open(p, "rb") as fh:
                head = fh.read(2048)
            if b"\0" in head:  # бинарный файл
                continue
            z.write(p, os.path.relpath(p, src))
print("wrote", out)
