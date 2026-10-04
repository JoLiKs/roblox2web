"""Чтение архива с Roblox-проектом и построение виртуального дерева Instance.

Поддерживается: Rojo-структура (default.project.json + src/**.lua|luau) и текстовый .rbxlx.
Бинарный .rbxl не поддерживается (нужен внешний инструмент) — выдаётся понятная ошибка.
"""
from __future__ import annotations

import io
import json
import posixpath
import tarfile
import zipfile
import xml.etree.ElementTree as ET

from .luau import InstNode

MAX_FILES = 20000
MAX_TOTAL = 300 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024


class ConvertError(Exception):
    """Ошибка, которую нужно показать пользователю как есть (без трейсбека)."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _safe(name):
    name = name.replace("\\", "/")
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts) or name.startswith("/") or (len(parts[0]) == 2 and parts[0][1] == ":"):
        return None
    return "/".join(parts)


def read_archive(data: bytes, filename: str = ""):
    """bytes -> {relative_posix_path: bytes}. Бросает ConvertError."""
    if not data:
        raise ConvertError("empty", "Файл пустой (0 байт). Загрузите .zip или .tar.gz с проектом Roblox.")
    files = {}
    total = 0

    def add(name, blob):
        nonlocal total
        p = _safe(name)
        if p is None:
            return  # небезопасные пути молча пропускаем
        total += len(blob)
        if len(blob) > MAX_FILE or total > MAX_TOTAL or len(files) >= MAX_FILES:
            raise ConvertError("too_big", "Архив слишком большой (лимиты: %d файлов, %d МБ)." % (MAX_FILES, MAX_TOTAL // 2 ** 20))
        files[p] = blob

    low = filename.lower()
    try:
        if data[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                for info in z.infolist():
                    if info.is_dir():
                        continue
                    if info.file_size > MAX_FILE:
                        raise ConvertError("too_big", "Файл %s в архиве слишком большой." % info.filename)
                    add(info.filename, z.read(info))
        elif data[:2] == b"\x1f\x8b" or low.endswith((".tar", ".tar.gz", ".tgz")):
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as t:
                for m in t:
                    if not m.isfile():
                        continue
                    f = t.extractfile(m)
                    if f is None:
                        continue
                    if m.size > MAX_FILE:
                        raise ConvertError("too_big", "Файл %s в архиве слишком большой." % m.name)
                    add(m.name, f.read())
        else:
            raise ConvertError("format", "Неизвестный формат файла. Нужен .zip, .tar.gz или .tgz.")
    except ConvertError:
        raise
    except (zipfile.BadZipFile, tarfile.TarError, EOFError, OSError, ValueError, KeyError, RuntimeError) as e:
        raise ConvertError("broken", "Архив повреждён или не читается (%s: %s)." % (type(e).__name__, e))
    if not files:
        raise ConvertError("empty", "Архив пустой: в нём нет ни одного файла.")
    files = _strip_common_root(files)
    if not files:
        raise ConvertError("empty", "Архив пустой: в нём остались только служебные файлы (__MACOSX, .DS_Store).")
    return files


def _strip_common_root(files):
    # убираем единственную обёртку-папку (project/…), игнорируя __MACOSX
    files = {k: v for k, v in files.items() if not k.startswith("__MACOSX/") and not k.endswith(".DS_Store")}
    while files:
        tops = {k.split("/")[0] for k in files}
        if len(tops) == 1 and all("/" in k for k in files):
            files = {k.split("/", 1)[1]: v for k, v in files.items()}
        else:
            break
    return files


def _decode(b):
    for enc in ("utf-8-sig", "utf-16", "cp1251", "latin-1"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("utf-8", "replace")


SCRIPT_EXT = (".lua", ".luau")


def _script_info(filename):
    """'Foo.server.lua' -> ('Foo','Script'); 'Foo.lua' -> ('Foo','ModuleScript')."""
    base = posixpath.basename(filename)
    for ext in SCRIPT_EXT:
        if base.endswith(ext):
            stem = base[: -len(ext)]
            break
    else:
        return None
    if stem.endswith(".server"):
        return stem[:-7], "Script"
    if stem.endswith(".client"):
        return stem[:-7], "LocalScript"
    return stem, "ModuleScript"


class Project:
    def __init__(self):
        self.root = InstNode("game", "DataModel")
        self.name = "Project"
        self.kind = "unknown"  # rojo | rbxlx | loose
        self.warnings = []
        self.scripts = []  # (full_path, class, size)
        self.files = {}

    def all_scripts(self):
        out = []

        def walk(n):
            for c in n.children.values():
                if c.source is not None:
                    out.append(c)
                walk(c)
        walk(self.root)
        return out


def load_project(files):
    prj = Project()
    prj.files = files
    pj = _find_project_json(files)
    if pj is not None:
        base, path = pj
        try:
            spec = json.loads(_decode(files[path]))
        except Exception as e:
            raise ConvertError("bad_project", "default.project.json не читается как JSON: %s" % e)
        if not isinstance(spec, dict) or not isinstance(spec.get("tree"), dict):
            raise ConvertError("bad_project", "В default.project.json нет раздела \"tree\" — это не проект Rojo.")
        prj.kind = "rojo"
        prj.name = str(spec.get("name") or "Project")
        _build_rojo(prj, files, base, spec["tree"])
    else:
        rbx = [k for k in files if k.lower().endswith(".rbxlx")]
        if rbx:
            prj.kind = "rbxlx"
            rbx.sort(key=lambda k: (k.count("/"), k))
            prj.name = posixpath.splitext(posixpath.basename(rbx[0]))[0]
            _build_rbxlx(prj, files[rbx[0]])
        elif any(k.lower().endswith(".rbxl") for k in files):
            raise ConvertError("binary_rbxl", "Найден бинарный .rbxl — он не поддерживается. Сохраните место как .rbxlx "
                                              "(File → Save As… → Roblox XML) или используйте Rojo-проект.")
        else:
            luas = [k for k in files if k.lower().endswith(SCRIPT_EXT)]
            if not luas:
                raise ConvertError("no_scripts", "В архиве нет ни default.project.json, ни .rbxlx, ни .lua/.luau файлов — "
                                                 "это не похоже на исходники Roblox-проекта.")
            prj.kind = "loose"
            prj.warnings.append("Нет default.project.json / .rbxlx: скрипты взяты «как лежат» по папкам, "
                                "пути require могут не совпасть с Roblox.")
            _build_loose(prj, files)
    prj.scripts = [(s.full_name(), s.cls, len(s.source or "")) for s in prj.all_scripts()]
    return prj


def _find_project_json(files):
    cands = [k for k in files if k.endswith(".project.json") and k.count("/") <= 2]
    if not cands:
        return None
    cands.sort(key=lambda k: (0 if posixpath.basename(k) == "default.project.json" else 1, k.count("/"), k))
    path = cands[0]
    return posixpath.dirname(path), path


def _join(base, rel):
    return posixpath.normpath(posixpath.join(base, rel)) if base else posixpath.normpath(rel)


def _build_rojo(prj, files, base, tree):
    def make(name, spec, parent):
        cls = spec.get("$className")
        path = spec.get("$path")
        if path is not None and isinstance(path, dict):
            path = path.get("optional")
        node = None
        if isinstance(path, str):
            node = fs_node(name, _join(base, path), parent, cls)
            if node is None:
                prj.warnings.append("$path \"%s\" (узел %s) не найден в архиве." % (path, name))
        if node is None:
            node = InstNode(name, cls or "Folder")
            parent.add(node)
        elif cls and node.cls == "Folder":
            node.cls = cls
        for k, v in spec.items():
            if not k.startswith("$") and isinstance(v, dict):
                make(k, v, node)
        return node

    def fs_node(name, path, parent, cls_hint=None):
        if path in files:
            info = _script_info(path)
            if info is None:
                return None
            n = InstNode(name, info[1], _decode(files[path]), path)
            parent.add(n)
            return n
        prefix = path + "/"
        entries = [k for k in files if k.startswith(prefix)]
        if not entries:
            return None
        init = None
        for cand in ("init.lua", "init.luau", "init.server.lua", "init.server.luau", "init.client.lua", "init.client.luau"):
            if prefix + cand in files:
                init = cand
                break
        if init:
            cls = _script_info(init)[1]
            n = InstNode(name, cls, _decode(files[prefix + init]), prefix + init)
        else:
            n = InstNode(name, cls_hint or "Folder")
        parent.add(n)
        seen = {}
        for k in sorted(entries):
            rest = k[len(prefix):]
            top = rest.split("/")[0]
            if top in seen or top.startswith(".") or top.startswith("init."):
                continue
            seen[top] = True
            child_path = prefix + top
            if "/" in rest:
                fs_node(top, child_path, n)
            else:
                info = _script_info(top)
                if info is None or top.endswith((".spec.lua", ".spec.luau")):
                    continue
                if info[0] in n.children:
                    continue
                n.add(InstNode(info[0], info[1], _decode(files[k]), k))
        return n

    for name, spec in tree.items():
        if name.startswith("$") or not isinstance(spec, dict):
            continue
        make(name, spec, prj.root)
    # дерево верхнего уровня
    if tree.get("$path") or any(not k.startswith("$") for k in tree) is False:
        pass
    if not prj.all_scripts():
        prj.warnings.append("Rojo-проект прочитан, но в нём не найдено ни одного .lua/.luau скрипта по путям $path.")


def _build_loose(prj, files):
    for k in sorted(files):
        info = _script_info(k)
        if info is None:
            continue
        parts = k.split("/")[:-1]
        node = prj.root
        for p in parts:
            if p not in node.children:
                node.add(InstNode(p, "Folder"))
            node = node.children[p]
        node.add(InstNode(info[0], info[1], _decode(files[k]), k))


def _build_rbxlx(prj, blob):
    try:
        root = ET.fromstring(blob)
    except ET.ParseError as e:
        raise ConvertError("bad_rbxlx", ".rbxlx повреждён (XML не читается): %s" % e)
    if root.tag != "roblox":
        raise ConvertError("bad_rbxlx", "Файл не похож на .rbxlx (корневой тег не <roblox>).")

    def walk(item, parent):
        cls = item.get("class", "Folder")
        props = item.find("Properties")
        name = cls
        source = None
        if props is not None:
            for p in props:
                if p.get("name") == "Name":
                    name = p.text or cls
                elif p.get("name") == "Source":
                    source = p.text or ""
        if cls in ("Script", "LocalScript", "ModuleScript"):
            n = InstNode(name, cls, source or "", name)
        else:
            n = InstNode(name, cls)
        if name in parent.children:  # дубликаты имён: добавляем суффикс
            i = 2
            while "%s_%d" % (name, i) in parent.children:
                i += 1
            n.name = "%s_%d" % (name, i)
        parent.add(n)
        for ch in item.findall("Item"):
            walk(ch, n)

    for item in root.findall("Item"):
        walk(item, prj.root)
