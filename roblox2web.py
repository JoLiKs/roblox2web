#!/usr/bin/env python3
"""roblox2web 2.0 — CLI. Пример: python roblox2web.py project.zip -o out/

Основной режим (по умолчанию): настоящий транспилятор Luau → JavaScript + браузерный эмулятор Roblox (запускает node ≥ 18, roblox2web.js).
Резервный режим --mode template: старый шаблонный конвертор v1 (вытаскивает данные pet-симулятора и подставляет в шаблон; без Luau-кода).

Коды выхода: 0 — собрана играбельная веб-демо; 3 — собрана только страница-отчёт (проект не распознан как поддерживаемая игра);
2 — ошибка (пустой/битый архив, нет скриптов и т.п.).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from r2w.build import convert, make_zip, write_dir  # noqa: E402
from r2w.extract import VERSION  # noqa: E402
from r2w.project import ConvertError  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="Конвертер Roblox-проекта (Rojo / .rbxlx) в статическую веб-демо. "
                                             "Работает для игр жанра pet/clicker simulator; Luau-код НЕ транслируется.")
    ap.add_argument("input", nargs="?", help="архив .zip / .tar.gz / .tgz с исходниками (не нужен с --serve)")
    ap.add_argument("--serve", action="store_true", help="запустить локальную страницу-загрузчик (http://127.0.0.1:8765)")
    ap.add_argument("--port", type=int, default=8765, help="порт для --serve")
    ap.add_argument("-o", "--out", default="out", help="папка результата (по умолчанию out/)")
    ap.add_argument("--zip", dest="zip_path", help="путь для zip результата (по умолчанию <out>.zip рядом с папкой)")
    ap.add_argument("--no-zip", action="store_true", help="не создавать zip")
    ap.add_argument("--strict", action="store_true", help="если игра не распознана — завершиться с ошибкой, ничего не создавая")
    ap.add_argument("--link", action="append", default=[], metavar="ТЕКСТ=URL", help="ссылка в подвале страницы (можно несколько)")
    ap.add_argument("--mode", choices=["auto", "transpile", "template"], default="auto",
                    help="transpile — Luau→JS (нужен node); template — резервный шаблон v1; auto — transpile, а если node нет, то template")
    ap.add_argument("--version", action="version", version="roblox2web 2.0.0 (template-режим v" + VERSION + ")")
    a = ap.parse_args(argv)
    if a.mode != "template" and not a.serve:
        import shutil, subprocess
        node = shutil.which("node") or shutil.which("nodejs")
        if node and a.input:
            cmd = [node, os.path.join(os.path.dirname(os.path.abspath(__file__)), "roblox2web.js"), a.input, "-o", a.out]
            if a.strict:
                cmd.append("--strict")
            if not a.no_zip:
                cmd += ["--zip", a.zip_path or (os.path.normpath(a.out) + ".zip")]
            return subprocess.call(cmd)
        if a.mode == "transpile":
            print("ОШИБКА: для режима transpile нужен node (>=18).", file=sys.stderr)
            return 2
        print("node не найден — используется резервный шаблонный режим v1.", file=sys.stderr)
    if a.serve:
        from r2w.server import serve
        serve(port=a.port)
        return 0
    if not a.input:
        ap.error("укажите архив с проектом или используйте --serve")
    links = []
    for l in a.link:
        title, _, url = l.partition("=")
        if url.startswith(("http://", "https://")):
            links.append({"title": title, "url": url})
    try:
        with open(a.input, "rb") as f:
            data = f.read()
    except OSError as e:
        print("ОШИБКА: не могу прочитать %s: %s" % (a.input, e), file=sys.stderr)
        return 2
    try:
        res = convert(data, os.path.basename(a.input), links=links, strict=a.strict)
    except ConvertError as e:
        print("ОШИБКА [%s]: %s" % (e.code, e.message), file=sys.stderr)
        return 2
    write_dir(res, a.out)
    if not a.no_zip:
        zp = a.zip_path or (os.path.normpath(a.out) + ".zip")
        with open(zp, "wb") as f:
            f.write(make_zip(res))
        print("zip:    %s" % zp)
    print(res.text_report())
    print("папка:  %s  (откройте %s в браузере)" % (a.out, os.path.join(a.out, "index.html")))
    if res.status == "game":
        print("ИТОГ: играбельная веб-демо собрана. Напоминание: это шаблон с вашими данными, а не перевод Luau-кода.")
        return 0
    print("ИТОГ: игра НЕ распознана — создана только страница-отчёт (код выхода 3).", file=sys.stderr)
    return 3


if __name__ == "__main__":
    sys.exit(main())
