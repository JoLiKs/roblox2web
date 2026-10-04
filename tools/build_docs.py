"""Собирает docs/ (статическая онлайн-версия для GitHub Pages) из исходников репозитория."""
import os, shutil
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = os.path.join(R, "docs")
os.makedirs(os.path.join(D, "template"), exist_ok=True)
os.makedirs(os.path.join(D, "sample"), exist_ok=True)
for src, dst in [("web/index.html", "index.html"), ("web/app.js", "app.js"), ("web/app.css", "app.css"),
                 ("js/luau.js", "luau.js"), ("js/convert.js", "convert.js"),
                 ("examples/PetCollectorSimulator.zip", "sample/PetCollectorSimulator.zip")]:
    shutil.copy(os.path.join(R, src), os.path.join(D, dst))
for n in ("index.html", "style.css", "game.js", "i18n.js", "report.html"):
    shutil.copy(os.path.join(R, "template", n), os.path.join(D, "template", n))
open(os.path.join(D, ".nojekyll"), "w").close()
print("docs/ собран")
