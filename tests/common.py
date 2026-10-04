import io
import json
import os
import re
import shutil
import tarfile
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXAMPLE = os.path.join(ROOT, "examples", "PetCollectorSimulator.zip")


def read_example():
    with open(EXAMPLE, "rb") as f:
        return f.read()


def make_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def make_targz(files):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, data in files.items():
            if isinstance(data, str):
                data = data.encode("utf-8")
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            t.addfile(ti, io.BytesIO(data))
    return buf.getvalue()


def example_files():
    with zipfile.ZipFile(EXAMPLE) as z:
        return {n: z.read(n) for n in z.namelist() if not n.endswith("/")}


def data_from_js(text):
    """data.js -> dict"""
    return json.loads(text[text.index("= ") + 2:].rstrip().rstrip(";"))


def chrome_path():
    for p in (os.environ.get("R2W_CHROME"), shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chromium-browser")):
        if p and os.path.exists(p):
            return p
    return None


def luau_count(files, path, pattern):
    return len(re.findall(pattern, files[path].decode("utf-8"), re.M))
