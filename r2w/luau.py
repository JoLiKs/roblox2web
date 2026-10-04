"""Мини-интерпретатор подмножества Luau для чтения «модулей с данными».

Что умеет: полный синтаксис Luau (аннотации типов, `::`, if-выражения, составные
присваивания, интерполированные строки) и выполнение чистых вычислений: таблицы,
локальные функции-конструкторы (`local function pet(...) return {...} end`), циклы,
арифметику, минимум math/table/string, `require(script.Parent.X)`, Color3/Vector3/Enum
как значения-данные.

Чего НЕ умеет (и не пытается): Roblox API (Instance, task, DataStore, события).
Такие инструкции пропускаются с предупреждением. Это не VM Roblox, а безопасный
вычислитель данных с лимитом шагов.
"""
from __future__ import annotations

import functools
import math
import re


class LuauError(Exception):
    pass


class LuauSyntaxError(LuauError):
    pass


class LuauRuntimeError(LuauError):
    pass


class Unsupported(LuauRuntimeError):
    pass


class StepLimit(LuauError):
    pass


class LTable:
    """Таблица Lua. Ключи нормализованы: целые float -> int."""

    __slots__ = ("d", "meta")

    def __init__(self):
        self.d = {}
        self.meta = None

    def length(self):
        n = 0
        d = self.d
        while (n + 1) in d:
            n += 1
        return n

    def get(self, k):
        k = _nk(k)
        d = self.d
        if k in d:
            return d[k]
        m = self.meta
        if m is not None:
            idx = m.d.get("__index")
            if isinstance(idx, LTable):
                return idx.get(k)
        return None

    def set(self, k, v):
        k = _nk(k)
        if k is None:
            raise LuauRuntimeError("table index is nil")
        if v is None:
            self.d.pop(k, None)
        else:
            self.d[k] = v


def _nk(k):
    if isinstance(k, bool):
        return ("bool", k)
    if isinstance(k, float) and not math.isinf(k) and not math.isnan(k) and k == int(k):
        return int(k)
    return k


class Struct:
    """Color3 / Vector3 / Vector2 ... — значения-данные."""

    __slots__ = ("kind", "f")

    def __init__(self, kind, fields):
        self.kind = kind
        self.f = fields


class RobloxApi:
    """Заглушка глобала Roblox API (task, Instance, Random…): любое обращение -> Unsupported."""

    __slots__ = ("name",)

    def __init__(self, name):
        self.name = name


class EnumPath:
    __slots__ = ("path",)

    def __init__(self, path):
        self.path = path


class InstNode:
    """Узел виртуального дерева Roblox (Script/ModuleScript/Folder/сервис)."""

    def __init__(self, name, cls="Folder", source=None, path=None, parent=None):
        self.name = name
        self.cls = cls
        self.source = source
        self.path = path
        self.parent = parent
        self.children = {}
        self.attrs = {}
        self.value = None
        self.state = 0  # 0 - не грузили, 1 - грузится, 2 - готов

    def add(self, child):
        child.parent = self
        self.children[child.name] = child
        return child

    def full_name(self):
        parts = []
        n = self
        while n is not None and n.parent is not None:
            parts.append(n.name)
            n = n.parent
        return ".".join(reversed(parts))


class LFunction:
    __slots__ = ("params", "vararg", "body", "env", "name")

    def __init__(self, params, vararg, body, env, name="?"):
        self.params = params
        self.vararg = vararg
        self.body = body
        self.env = env
        self.name = name


class Builtin:
    __slots__ = ("fn", "name")

    def __init__(self, fn, name="builtin"):
        self.fn = fn
        self.name = name


KEYWORDS = {
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
    "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
}
_OPS3 = ("...", "..=", "//=")
_OPS2 = ("==", "~=", "<=", ">=", "..", "::", "->", "+=", "-=", "*=", "/=", "%=", "^=", "//")
_ESC = {"n": "\n", "t": "\t", "r": "\r", "a": "\a", "b": "\b", "f": "\f", "v": "\v",
        "\\": "\\", '"': '"', "'": "'", "`": "`", "{": "{", "\n": "\n"}
_NUM_RE = re.compile(r"0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?")


def tokenize(src, fname="?"):
    toks = []
    i = 0
    n = len(src)
    line = 1
    if src.startswith("#!"):
        while i < n and src[i] != "\n":
            i += 1

    def err(msg):
        raise LuauSyntaxError("%s:%d: %s" % (fname, line, msg))

    def long_bracket(pos):
        j = pos + 1
        lvl = 0
        while j < n and src[j] == "=":
            lvl += 1
            j += 1
        if j < n and src[j] == "[":
            return lvl, j + 1
        return None

    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c in " \t\r":
            i += 1
            continue
        if c == "-" and src.startswith("--", i):
            i += 2
            if i < n and src[i] == "[":
                lb = long_bracket(i)
                if lb:
                    lvl, st = lb
                    close = "]" + "=" * lvl + "]"
                    e = src.find(close, st)
                    if e < 0:
                        err("unfinished long comment")
                    line += src.count("\n", i, e)
                    i = e + len(close)
                    continue
            while i < n and src[i] != "\n":
                i += 1
            continue
        if c.isalpha() or c == "_":
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            w = src[i:j]
            toks.append(("kw" if w in KEYWORDS else "name", w, line))
            i = j
            continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            m = _NUM_RE.match(src, i)
            tt = m.group(0).replace("_", "")
            if tt[:2] in ("0x", "0X"):
                v = int(tt, 16)
            elif tt[:2] in ("0b", "0B"):
                v = int(tt[2:], 2)
            elif re.fullmatch(r"\d+", tt):
                v = int(tt)
            else:
                v = float(tt)
            toks.append(("num", v, line))
            i = m.end()
            continue
        if c in "\"'":
            q = c
            j = i + 1
            buf = []
            while True:
                if j >= n:
                    err("unfinished string")
                ch = src[j]
                if ch == q:
                    j += 1
                    break
                if ch == "\n":
                    err("unfinished string")
                if ch == "\\":
                    j += 1
                    e = src[j] if j < n else ""
                    if e in _ESC:
                        buf.append(_ESC[e])
                        if e == "\n":
                            line += 1
                        j += 1
                    elif e == "z":
                        j += 1
                        while j < n and src[j] in " \t\r\n":
                            if src[j] == "\n":
                                line += 1
                            j += 1
                    elif e == "x":
                        buf.append(chr(int(src[j + 1:j + 3], 16)))
                        j += 3
                    elif e == "u":
                        k = src.index("}", j)
                        buf.append(chr(int(src[j + 2:k], 16)))
                        j = k + 1
                    elif e.isdigit():
                        k = j
                        while k < n and k < j + 3 and src[k].isdigit():
                            k += 1
                        buf.append(chr(int(src[j:k])))
                        j = k
                    else:
                        err("bad escape")
                else:
                    buf.append(ch)
                    j += 1
            toks.append(("str", "".join(buf), line))
            i = j
            continue
        if c == "`":
            j = i + 1
            parts = []
            buf = []
            while True:
                if j >= n:
                    err("unfinished interpolated string")
                ch = src[j]
                if ch == "`":
                    j += 1
                    break
                if ch == "\\":
                    e = src[j + 1] if j + 1 < n else ""
                    buf.append(_ESC.get(e, e))
                    j += 2
                    continue
                if ch == "{":
                    depth = 1
                    k = j + 1
                    while k < n and depth:
                        if src[k] == "{":
                            depth += 1
                        elif src[k] == "}":
                            depth -= 1
                        k += 1
                    parts.append(("s", "".join(buf)))
                    buf = []
                    parts.append(("e", src[j + 1:k - 1]))
                    j = k
                    continue
                if ch == "\n":
                    line += 1
                buf.append(ch)
                j += 1
            parts.append(("s", "".join(buf)))
            toks.append(("istr", parts, line))
            i = j
            continue
        if c == "[":
            lb = long_bracket(i)
            if lb:
                lvl, st = lb
                close = "]" + "=" * lvl + "]"
                e = src.find(close, st)
                if e < 0:
                    err("unfinished long string")
                s = src[st:e]
                if s.startswith("\r\n"):
                    s = s[2:]
                elif s.startswith("\n"):
                    s = s[1:]
                toks.append(("str", s, line))
                line += src.count("\n", i, e)
                i = e + len(close)
                continue
        if src[i:i + 3] in _OPS3:
            toks.append(("op", src[i:i + 3], line))
            i += 3
            continue
        if src[i:i + 2] in _OPS2:
            toks.append(("op", src[i:i + 2], line))
            i += 2
            continue
        if c in "+-*/%^#<>=(){}[];:,.&|?~":
            toks.append(("op", c, line))
            i += 1
            continue
        err("unexpected character %r" % c)
    toks.append(("eof", None, line))
    return toks


_BINPRI = {
    "or": (1, 1), "and": (2, 2),
    "<": (3, 3), ">": (3, 3), "<=": (3, 3), ">=": (3, 3), "~=": (3, 3), "==": (3, 3),
    "..": (5, 4),
    "+": (6, 6), "-": (6, 6),
    "*": (7, 7), "/": (7, 7), "//": (7, 7), "%": (7, 7),
    "^": (10, 9),
}
_UNARY_PRI = 8
_COMPOUND = {"+=": "+", "-=": "-", "*=": "*", "/=": "/", "%=": "%", "^=": "^", "..=": "..", "//=": "//"}
_BLOCK_END = ("end", "else", "elseif", "until")


class Parser:
    def __init__(self, src, fname="?"):
        self.fname = fname
        self.t = tokenize(src, fname)
        self.p = 0

    def err(self, msg):
        t = self.t[min(self.p, len(self.t) - 1)]
        raise LuauSyntaxError("%s:%d: %s (near %r)" % (self.fname, t[2], msg, t[1]))

    def peek(self, k=0):
        return self.t[min(self.p + k, len(self.t) - 1)]

    def is_op(self, v, k=0):
        t = self.peek(k)
        return t[0] == "op" and t[1] == v

    def is_kw(self, v, k=0):
        t = self.peek(k)
        return t[0] == "kw" and t[1] == v

    def accept_op(self, v):
        if self.is_op(v):
            self.p += 1
            return True
        return False

    def accept_kw(self, v):
        if self.is_kw(v):
            self.p += 1
            return True
        return False

    def expect_op(self, v):
        if not self.accept_op(v):
            self.err("expected '%s'" % v)

    def expect_kw(self, v):
        if not self.accept_kw(v):
            self.err("expected '%s'" % v)

    def name(self):
        t = self.peek()
        if t[0] != "name":
            self.err("expected name")
        self.p += 1
        return t[1]

    # ---- типы: разбираются и отбрасываются
    def skip_type(self):
        if not (self.accept_op("|") or self.accept_op("&")):
            pass
        self.skip_simple_type()
        while self.is_op("|") or self.is_op("&") or self.is_op("?"):
            optional = self.is_op("?")
            self.p += 1
            if optional:
                continue
            self.skip_simple_type()

    def skip_generic_args(self):
        depth = 1
        while depth:
            t = self.peek()
            if t[0] == "eof":
                self.err("unfinished generic")
            if t[0] == "op":
                if t[1] == "<":
                    depth += 1
                elif t[1] == ">":
                    depth -= 1
            self.p += 1

    def skip_simple_type(self):
        t = self.peek()
        if t[0] == "name":
            if t[1] == "typeof" and self.is_op("(", 1):
                self.p += 2
                self.expr()
                self.expect_op(")")
                return
            self.p += 1
            while self.accept_op("."):
                self.name()
            if self.accept_op("<"):
                self.skip_generic_args()
            return
        if t[0] == "kw" and t[1] in ("nil", "true", "false"):
            self.p += 1
            return
        if t[0] == "str":
            self.p += 1
            return
        if t[0] == "op" and t[1] == "{":
            self.p += 1
            while not self.is_op("}"):
                if self.is_op("["):
                    self.p += 1
                    self.skip_type()
                    self.expect_op("]")
                    self.expect_op(":")
                    self.skip_type()
                elif self.peek()[0] == "name" and self.is_op(":", 1):
                    self.p += 2
                    self.skip_type()
                else:
                    if self.peek()[0] == "name" and self.peek()[1] in ("read", "write") and self.peek(1)[0] == "name":
                        self.p += 1
                    self.skip_type()
                if not (self.accept_op(",") or self.accept_op(";")):
                    break
            self.expect_op("}")
            return
        if t[0] == "op" and t[1] == "<":
            self.p += 1
            self.skip_generic_args()
        if self.is_op("("):
            self.p += 1
            while not self.is_op(")"):
                if self.is_op("..."):
                    self.p += 1
                if self.peek()[0] == "name" and self.is_op(":", 1):
                    self.p += 2
                self.skip_type()
                if not self.accept_op(","):
                    break
            self.expect_op(")")
            if self.accept_op("->"):
                self.skip_type()
            return
        self.err("bad type")

    # ---- выражения
    def expr(self, limit=0):
        t = self.peek()
        if (t[0] == "kw" and t[1] == "not") or (t[0] == "op" and t[1] in ("-", "#")):
            self.p += 1
            a = self.expr(_UNARY_PRI)
            left = ("un", t[1], a)
        else:
            left = self.simple_exp()
        while True:
            t = self.peek()
            op = t[1] if t[0] in ("op", "kw") else None
            if op in _BINPRI and (t[0] == "op" or op in ("and", "or")):
                lp, rp = _BINPRI[op]
                if lp <= limit:
                    break
                self.p += 1
                right = self.expr(rp)
                left = ("bin", op, left, right)
            else:
                break
        return left

    def simple_exp(self):
        e = self.simple_exp_inner()
        while self.is_op("::"):
            self.p += 1
            self.skip_type()
        return e

    def simple_exp_inner(self):
        t = self.peek()
        k, v = t[0], t[1]
        if k == "num":
            self.p += 1
            return ("num", v)
        if k == "str":
            self.p += 1
            return self.suffixes(("str", v))
        if k == "istr":
            self.p += 1
            parts = []
            for kind, txt in v:
                if kind == "s":
                    parts.append(("s", txt))
                else:
                    parts.append(("e", Parser(txt, self.fname).expr()))
            return ("istr", parts)
        if k == "kw":
            if v == "nil":
                self.p += 1
                return ("nil",)
            if v == "true":
                self.p += 1
                return ("true",)
            if v == "false":
                self.p += 1
                return ("false",)
            if v == "function":
                self.p += 1
                return self.func_body()
            if v == "if":
                self.p += 1
                c = self.expr()
                self.expect_kw("then")
                a = self.expr()
                if self.is_kw("elseif"):
                    self.t[self.p] = ("kw", "if", self.t[self.p][2])
                    b = self.simple_exp_inner()
                else:
                    self.expect_kw("else")
                    b = self.expr()
                return ("ifexp", c, a, b)
        if k == "op":
            if v == "...":
                self.p += 1
                return ("vararg",)
            if v == "{":
                return self.table()
        return self.suffixes(self.primary())

    def primary(self):
        t = self.peek()
        if t[0] == "name":
            self.p += 1
            return ("name", t[1])
        if self.accept_op("("):
            e = self.expr()
            self.expect_op(")")
            return ("paren", e)
        self.err("unexpected symbol")

    def suffixes(self, e):
        while True:
            t = self.peek()
            if t[0] == "op":
                v = t[1]
                if v == ".":
                    self.p += 1
                    e = ("index", e, ("str", self.name()))
                    continue
                if v == "[":
                    self.p += 1
                    k = self.expr()
                    self.expect_op("]")
                    e = ("index", e, k)
                    continue
                if v == ":":
                    self.p += 1
                    nm = self.name()
                    e = ("method", e, nm, self.call_args())
                    continue
                if v == "(":
                    e = ("call", e, self.call_args())
                    continue
                if v == "{":
                    e = ("call", e, [self.table()])
                    continue
            elif t[0] == "str":
                self.p += 1
                e = ("call", e, [("str", t[1])])
                continue
            break
        return e

    def call_args(self):
        t = self.peek()
        if t[0] == "str":
            self.p += 1
            return [("str", t[1])]
        if t[0] == "op" and t[1] == "{":
            return [self.table()]
        self.expect_op("(")
        args = []
        if not self.is_op(")"):
            args.append(self.expr())
            while self.accept_op(","):
                args.append(self.expr())
        self.expect_op(")")
        return args

    def table(self):
        self.expect_op("{")
        items = []
        while not self.is_op("}"):
            if self.is_op("["):
                self.p += 1
                k = self.expr()
                self.expect_op("]")
                self.expect_op("=")
                items.append(("named", k, self.expr()))
            elif self.peek()[0] == "name" and self.is_op("=", 1):
                nm = self.name()
                self.p += 1
                items.append(("named", ("str", nm), self.expr()))
            else:
                items.append(("pos", self.expr()))
            if not (self.accept_op(",") or self.accept_op(";")):
                break
        self.expect_op("}")
        return ("table", items)

    def func_body(self, is_method=False, name="?"):
        if self.accept_op("<"):
            self.skip_generic_args()
        self.expect_op("(")
        params = ["self"] if is_method else []
        vararg = False
        while not self.is_op(")"):
            if self.accept_op("..."):
                vararg = True
                if self.accept_op(":"):
                    self.skip_type()
                break
            params.append(self.name())
            if self.accept_op(":"):
                self.skip_type()
            if not self.accept_op(","):
                break
        self.expect_op(")")
        if self.accept_op(":"):
            self.skip_type()
        body = self.block()
        self.expect_kw("end")
        return ("func", params, vararg, body, name)

    # ---- инструкции
    def block(self):
        stmts = []
        while True:
            t = self.peek()
            if t[0] == "eof" or (t[0] == "kw" and t[1] in _BLOCK_END):
                break
            if t[0] == "kw" and t[1] == "return":
                self.p += 1
                exprs = []
                t2 = self.peek()
                if not (t2[0] == "eof" or (t2[0] == "kw" and t2[1] in _BLOCK_END) or self.is_op(";")):
                    exprs = self.exprlist()
                self.accept_op(";")
                stmts.append(("return", exprs, t[2]))
                break
            s = self.statement()
            if s is not None:
                stmts.append(s)
            self.accept_op(";")
        return stmts

    def exprlist(self):
        es = [self.expr()]
        while self.accept_op(","):
            es.append(self.expr())
        return es

    def statement(self):
        t = self.peek()
        line = t[2]
        k, v = t[0], t[1]
        if k == "kw":
            if v == "local":
                self.p += 1
                if self.accept_kw("function"):
                    nm = self.name()
                    f = self.func_body(name=nm)
                    return ("localfunc", nm, f, line)
                names = []
                while True:
                    names.append(self.name())
                    if self.accept_op("<"):
                        self.name()
                        self.expect_op(">")
                    if self.accept_op(":"):
                        self.skip_type()
                    if not self.accept_op(","):
                        break
                exprs = self.exprlist() if self.accept_op("=") else []
                return ("local", names, exprs, line)
            if v == "function":
                self.p += 1
                target = ("name", self.name())
                fname = target[1]
                is_method = False
                while True:
                    if self.accept_op("."):
                        nm = self.name()
                        target = ("index", target, ("str", nm))
                        fname += "." + nm
                    elif self.accept_op(":"):
                        nm = self.name()
                        target = ("index", target, ("str", nm))
                        fname += ":" + nm
                        is_method = True
                        break
                    else:
                        break
                f = self.func_body(is_method, fname)
                return ("assign", [target], [f], line)
            if v == "if":
                self.p += 1
                clauses = []
                c = self.expr()
                self.expect_kw("then")
                clauses.append((c, self.block()))
                els = None
                while True:
                    if self.accept_kw("elseif"):
                        c = self.expr()
                        self.expect_kw("then")
                        clauses.append((c, self.block()))
                    elif self.accept_kw("else"):
                        els = self.block()
                        break
                    else:
                        break
                self.expect_kw("end")
                return ("if", clauses, els, line)
            if v == "while":
                self.p += 1
                c = self.expr()
                self.expect_kw("do")
                b = self.block()
                self.expect_kw("end")
                return ("while", c, b, line)
            if v == "do":
                self.p += 1
                b = self.block()
                self.expect_kw("end")
                return ("do", b, line)
            if v == "repeat":
                self.p += 1
                b = self.block()
                self.expect_kw("until")
                return ("repeat", b, self.expr(), line)
            if v == "for":
                self.p += 1
                n1 = self.name()
                if self.accept_op(":"):
                    self.skip_type()
                if self.accept_op("="):
                    a = self.expr()
                    self.expect_op(",")
                    b = self.expr()
                    st = self.expr() if self.accept_op(",") else None
                    self.expect_kw("do")
                    body = self.block()
                    self.expect_kw("end")
                    return ("fornum", n1, a, b, st, body, line)
                names = [n1]
                while self.accept_op(","):
                    names.append(self.name())
                    if self.accept_op(":"):
                        self.skip_type()
                self.expect_kw("in")
                es = self.exprlist()
                self.expect_kw("do")
                body = self.block()
                self.expect_kw("end")
                return ("forin", names, es, body, line)
            if v == "break":
                self.p += 1
                return ("break", line)
        if k == "name":
            if v == "continue" and not (self.is_op("(", 1) or self.is_op("=", 1) or self.is_op(".", 1)
                                        or self.is_op(":", 1) or self.is_op("[", 1)):
                self.p += 1
                return ("continue", line)
            if v == "export" and self.peek(1)[0] == "name" and self.peek(1)[1] == "type":
                self.p += 1
                v = "type"
            if v == "type" and self.peek(1)[0] == "name" and (self.is_op("=", 2) or self.is_op("<", 2)):
                self.p += 1  # 'type'
                self.name()
                if self.accept_op("<"):
                    self.skip_generic_args()
                self.expect_op("=")
                self.skip_type()
                return None
        e = self.suffixes(self.primary())
        if self.is_op("=") or self.is_op(","):
            targets = [e]
            while self.accept_op(","):
                targets.append(self.suffixes(self.primary()))
            self.expect_op("=")
            exprs = self.exprlist()
            for tg in targets:
                if tg[0] not in ("name", "index"):
                    self.err("cannot assign")
            return ("assign", targets, exprs, line)
        t = self.peek()
        if t[0] == "op" and t[1] in _COMPOUND:
            self.p += 1
            rhs = self.expr()
            return ("compound", _COMPOUND[t[1]], e, rhs, line)
        if e[0] not in ("call", "method"):
            self.err("syntax error")
        return ("callstmt", e, line)


def parse(src, fname="?"):
    p = Parser(src, fname)
    body = p.block()
    if p.peek()[0] != "eof":
        p.err("unexpected token")
    return body


# =========================================================================== интерпретатор


class Env:
    __slots__ = ("vars", "parent")

    def __init__(self, parent=None):
        self.vars = {}
        self.parent = parent

    def lookup(self, name):
        e = self
        while e is not None:
            if name in e.vars:
                return e
            e = e.parent
        return None


def truthy(v):
    return v is not None and v is not False


def lua_type(v):
    if v is None:
        return "nil"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, LTable):
        return "table"
    if isinstance(v, (LFunction, Builtin)):
        return "function"
    return "userdata"


def tostr(v):
    if v is None:
        return "nil"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, float):
        if math.isnan(v):
            return "nan"
        if math.isinf(v):
            return "inf" if v > 0 else "-inf"
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        return "%.14g" % v
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return v
    return "<%s>" % lua_type(v)


def tonum(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        s = v.strip()
        try:
            if s[:2].lower() == "0x":
                return int(s, 16)
            if re.fullmatch(r"-?\d+", s):
                return int(s)
            return float(s)
        except Exception:
            return None
    return None


def first(lst):
    return lst[0] if lst else None


def _num(x, name="?"):
    v = tonum(x)
    if v is None:
        raise LuauRuntimeError("bad number argument to " + name)
    return v


def _floor(x=None, *a):
    v = _num(x, "floor")
    if isinstance(v, float) and (math.isinf(v) or math.isnan(v)):
        return [v]
    return [int(math.floor(v))]


def _ceil(x=None, *a):
    v = _num(x, "ceil")
    if isinstance(v, float) and (math.isinf(v) or math.isnan(v)):
        return [v]
    return [int(math.ceil(v))]


class Interp:
    MAX_STEPS = 3_000_000
    MAX_DEPTH = 120

    def __init__(self, game=None, logger=None):
        self.steps = 0
        self.depth = 0
        self.game = game
        self.log = logger or (lambda m: None)
        self.cur_module = None
        self.globals = Env()
        self._install_globals()

    # ------------------------------------------------------------ stdlib
    def _install_globals(self):
        G = self.globals.vars
        I = self

        def mk(d):
            t = LTable()
            for k, v in d.items():
                t.d[k] = Builtin(v, k) if callable(v) else v
            return t

        mathlib = mk({
            "floor": _floor, "ceil": _ceil,
            "round": lambda x=None, *a: [int(math.floor(_num(x) + 0.5))],
            "abs": lambda x=None, *a: [abs(_num(x))],
            "sqrt": lambda x=None, *a: [math.sqrt(_num(x))],
            "min": lambda *a: [min(_num(x) for x in a)],
            "max": lambda *a: [max(_num(x) for x in a)],
            "clamp": lambda x=None, lo=None, hi=None, *a: [max(_num(lo), min(_num(hi), _num(x)))],
            "sign": lambda x=None, *a: [(_num(x) > 0) - (_num(x) < 0)],
            "pow": lambda x=None, y=None, *a: [float(_num(x)) ** _num(y)],
            "log": lambda x=None, base=None, *a: [math.log(_num(x)) if base is None else math.log(_num(x), _num(base))],
            "log10": lambda x=None, *a: [math.log10(_num(x))],
            "exp": lambda x=None, *a: [math.exp(_num(x))],
            "sin": lambda x=None, *a: [math.sin(_num(x))],
            "cos": lambda x=None, *a: [math.cos(_num(x))],
            "tan": lambda x=None, *a: [math.tan(_num(x))],
            "rad": lambda x=None, *a: [math.radians(_num(x))],
            "deg": lambda x=None, *a: [math.degrees(_num(x))],
            "fmod": lambda x=None, y=None, *a: [math.fmod(_num(x), _num(y))],
            "randomseed": lambda *a: [],
        })

        def no_random(*a):
            raise Unsupported("math.random")
        mathlib.d["random"] = Builtin(no_random, "random")
        mathlib.d["pi"] = math.pi
        mathlib.d["huge"] = math.inf
        G["math"] = mathlib

        def t_insert(t=None, a=None, *rest):
            if not isinstance(t, LTable):
                raise LuauRuntimeError("table.insert: not a table")
            n = t.length()
            if rest:
                pos = int(a)
                for i in range(n, pos - 1, -1):
                    t.d[i + 1] = t.d[i]
                t.set(pos, rest[0])
            else:
                t.set(n + 1, a)
            return []

        def t_remove(t=None, pos=None, *a):
            n = t.length()
            if n == 0:
                return [None]
            pos = n if pos is None else int(pos)
            v = t.d.get(pos)
            for i in range(pos, n):
                t.d[i] = t.d[i + 1]
            t.d.pop(n, None)
            return [v]

        def t_sort(t=None, cmp=None, *a):
            n = t.length()
            items = [t.d[i] for i in range(1, n + 1)]
            if cmp is None:
                items.sort()
            else:
                def c(x, y):
                    if truthy(first(I.call(cmp, [x, y]))):
                        return -1
                    if truthy(first(I.call(cmp, [y, x]))):
                        return 1
                    return 0
                items.sort(key=functools.cmp_to_key(c))
            for i, v in enumerate(items, 1):
                t.d[i] = v
            return []

        def t_concat(t=None, sep="", i=1, j=None, *a):
            n = t.length() if j is None else int(j)
            return [(sep or "").join(tostr(t.d.get(k)) for k in range(int(i), n + 1))]

        def t_unpack(t=None, i=1, j=None, *a):
            n = t.length() if j is None else int(j)
            return [t.d.get(k) for k in range(int(i), n + 1)]

        def t_clone(t=None, *a):
            c = LTable()
            c.d = dict(t.d)
            c.meta = t.meta
            return [c]

        def t_find(t=None, v=None, init=1, *a):
            for k in range(int(init), t.length() + 1):
                if t.d.get(k) == v:
                    return [k]
            return [None]

        G["table"] = mk({
            "insert": t_insert, "remove": t_remove, "sort": t_sort, "concat": t_concat,
            "unpack": t_unpack, "clone": t_clone, "freeze": lambda t=None, *a: [t],
            "find": t_find,
        })
        G["unpack"] = G["table"].d["unpack"]

        def s_format(fmt=None, *args):
            args = list(args)
            idx = [0]

            def rep(m):
                spec = m.group(0)
                if spec == "%%":
                    return "%"
                a = args[idx[0]] if idx[0] < len(args) else None
                idx[0] += 1
                c = spec[-1]
                if c in "di":
                    return (spec[:-1] + "d") % int(_num(a))
                if c in "feEgG":
                    return spec % float(_num(a))
                if c in "xXo":
                    return spec % int(_num(a))
                if c == "s":
                    return spec % tostr(a)
                return spec
            return [re.sub(r"%[-+ #0]*\d*(?:\.\d+)?[a-zA-Z%]", rep, tostr(fmt))]

        def s_sub(s=None, i=1, j=-1, *a):
            s = tostr(s)
            n = len(s)
            i = int(i)
            j = int(j)
            if i < 0:
                i = max(n + i + 1, 1)
            if i == 0:
                i = 1
            if j < 0:
                j = n + j + 1
            return [s[i - 1:j]]

        G["string"] = mk({
            "format": s_format, "sub": s_sub,
            "rep": lambda s=None, n=0, sep="", *a: [(sep or "").join([tostr(s)] * max(int(n), 0))],
            "upper": lambda s=None, *a: [tostr(s).upper()],
            "lower": lambda s=None, *a: [tostr(s).lower()],
            "len": lambda s=None, *a: [len(tostr(s))],
            "reverse": lambda s=None, *a: [tostr(s)[::-1]],
        })

        def ipairs(t=None, *a):
            if not isinstance(t, LTable):
                raise LuauRuntimeError("ipairs: not a table")
            return [("iter", "ipairs", t), t, 0]

        def pairs(t=None, *a):
            if not isinstance(t, LTable):
                raise LuauRuntimeError("pairs: not a table")
            return [("iter", "pairs", t), t, None]

        def pcall(f=None, *args):
            try:
                return [True] + I.call(f, list(args))
            except StepLimit:
                raise
            except LuauError as e:
                return [False, str(e)]

        def err(msg=None, *a):
            raise LuauRuntimeError(tostr(msg))

        def assert_(v=None, msg=None, *a):
            if not truthy(v):
                raise LuauRuntimeError(tostr(msg) if msg is not None else "assertion failed!")
            return [v]

        def setmt(t=None, mt=None, *a):
            t.meta = mt
            return [t]

        def select(n=None, *a):
            if n == "#":
                return [len(a)]
            n = int(n)
            return list(a[n - 1:]) if n > 0 else list(a[n:])

        def typeof(v=None, *a):
            if isinstance(v, Struct):
                return [v.kind]
            if isinstance(v, InstNode):
                return ["Instance"]
            return [lua_type(v)]

        def tonumber(v=None, base=None, *a):
            if base:
                try:
                    return [int(tostr(v), int(base))]
                except ValueError:
                    return [None]
            return [tonum(v)]

        G["ipairs"] = Builtin(ipairs, "ipairs")
        G["pairs"] = Builtin(pairs, "pairs")
        G["pcall"] = Builtin(pcall, "pcall")
        G["error"] = Builtin(err, "error")
        G["assert"] = Builtin(assert_, "assert")
        G["setmetatable"] = Builtin(setmt, "setmetatable")
        G["getmetatable"] = Builtin(lambda t=None, *a: [t.meta if isinstance(t, LTable) else None], "getmetatable")
        G["select"] = Builtin(select, "select")
        G["type"] = Builtin(lambda v=None, *a: [lua_type(v)], "type")
        G["typeof"] = Builtin(typeof, "typeof")
        G["tostring"] = Builtin(lambda v=None, *a: [tostr(v)], "tostring")
        G["tonumber"] = Builtin(tonumber, "tonumber")
        G["rawget"] = Builtin(lambda t=None, k=None, *a: [t.d.get(_nk(k))], "rawget")
        G["print"] = Builtin(lambda *a: [], "print")
        G["warn"] = Builtin(lambda *a: [], "warn")
        G["require"] = Builtin(lambda m=None, *a: [I.require(m)], "require")
        G["os"] = mk({"time": lambda *a: [0], "clock": lambda *a: [0.0]})

        def color_rgb(r=0, g=0, b=0, *a):
            return [Struct("Color3", {"r": _num(r), "g": _num(g), "b": _num(b)})]

        def color_new(r=0, g=0, b=0, *a):
            return [Struct("Color3", {"r": int(math.floor(_num(r) * 255 + 0.5)), "g": int(math.floor(_num(g) * 255 + 0.5)),
                                      "b": int(math.floor(_num(b) * 255 + 0.5))})]

        def color_hex(h="#000000", *a):
            h = tostr(h).lstrip("#")
            return [Struct("Color3", {"r": int(h[0:2], 16), "g": int(h[2:4], 16), "b": int(h[4:6], 16)})]

        G["Color3"] = mk({"fromRGB": color_rgb, "new": color_new, "fromHex": color_hex})
        G["Vector3"] = mk({"new": lambda x=0, y=0, z=0, *a: [Struct("Vector3", {"x": _num(x), "y": _num(y), "z": _num(z)})]})
        G["Vector3"].d["zero"] = Struct("Vector3", {"x": 0, "y": 0, "z": 0})
        G["Vector2"] = mk({"new": lambda x=0, y=0, *a: [Struct("Vector2", {"x": _num(x), "y": _num(y)})]})
        G["Enum"] = EnumPath("Enum")
        G["game"] = self.game
        for nm in ("Random", "Instance", "task", "workspace", "script_", "CFrame", "UDim2", "UDim", "TweenInfo", "Ray",
                   "Region3", "BrickColor", "NumberSequence", "ColorSequence", "Rect", "DateTime", "RunService",
                   "Players", "HttpService", "DataStoreService", "MarketplaceService", "Debris", "TweenService",
                   "ReplicatedStorage", "ServerScriptService", "StarterGui", "Workspace", "Lighting", "coroutine",
                   "utf8", "buffer", "debug", "shared", "plugin", "settings", "tick", "time", "wait", "spawn", "delay"):
            G.setdefault(nm, RobloxApi(nm))

    def _ordered_keys(self, t):
        arr = []
        n = 1
        while n in t.d:
            arr.append(n)
            n += 1
        rest = [k for k in t.d if not (isinstance(k, int) and not isinstance(k, bool) and 1 <= k < n)]
        return arr + rest

    # ------------------------------------------------------------ require / модули
    def require(self, m):
        if not isinstance(m, InstNode):
            raise Unsupported("require of non-instance")
        if m.cls != "ModuleScript" or m.source is None:
            raise Unsupported("require of %s" % m.full_name())
        return self.load_module(m)

    def load_module(self, node):
        if node.state == 2:
            return node.value
        if node.state == 1:
            raise LuauRuntimeError("cyclic require: " + node.full_name())
        node.state = 1
        try:
            node.value = self.run_module(node)
        finally:
            node.state = 2
        return node.value

    def run_module(self, node):
        try:
            ast = parse(node.source, node.path or node.name)
        except LuauSyntaxError as e:
            self.log("%s: синтаксическая ошибка: %s" % (node.name, e))
            raise LuauRuntimeError("syntax error in %s" % node.name)
        env = Env(self.globals)
        env.vars["script"] = node
        prev = self.cur_module
        self.cur_module = node
        ret = None
        try:
            for st in ast:
                try:
                    sig = self.exec_stmt(st, env)
                except StepLimit:
                    self.log("%s: превышен лимит шагов, остальной код пропущен" % node.name)
                    break
                except Unsupported as e:
                    self.log("%s:%s пропущено (Roblox API: %s)" % (node.name, st[-1], e))
                    continue
                except LuauRuntimeError as e:
                    self.log("%s:%s ошибка выполнения: %s" % (node.name, st[-1], e))
                    continue
                except RecursionError:
                    self.log("%s: слишком глубокая рекурсия" % node.name)
                    continue
                if sig and sig[0] == "return":
                    ret = sig[1][0] if sig[1] else None
                    break
        finally:
            self.cur_module = prev
        return ret

    # ------------------------------------------------------------ выполнение
    def tick(self):
        self.steps += 1
        if self.steps > self.MAX_STEPS:
            raise StepLimit()

    def exec_block(self, body, env):
        for st in body:
            sig = self.exec_stmt(st, env)
            if sig:
                return sig
        return None

    def loop_body(self, body, env):
        """-> (stop, signal). stop=True если цикл надо прервать."""
        sig = self.exec_block(body, env)
        if sig:
            if sig[0] == "break":
                return True, None
            if sig[0] == "return":
                return True, sig
        return False, None

    def exec_stmt(self, st, env):
        self.tick()
        k = st[0]
        if k == "local":
            vals = self.eval_list(st[2], env, len(st[1]))
            for n, v in zip(st[1], vals):
                env.vars[n] = v
            return None
        if k == "assign":
            vals = self.eval_list(st[2], env, len(st[1]))
            for tg, v in zip(st[1], vals):
                self.assign(tg, v, env)
            return None
        if k == "compound":
            cur = self.eval(st[2], env)
            self.assign(st[2], self.binop(st[1], cur, self.eval(st[3], env)), env)
            return None
        if k == "callstmt":
            self.eval_multi(st[1], env)
            return None
        if k == "localfunc":
            env.vars[st[1]] = LFunction(st[2][1], st[2][2], st[2][3], env, st[1])
            return None
        if k == "return":
            return ("return", self.eval_multi_list(st[1], env))
        if k == "if":
            for cond, body in st[1]:
                if truthy(self.eval(cond, env)):
                    return self.exec_block(body, Env(env))
            if st[2] is not None:
                return self.exec_block(st[2], Env(env))
            return None
        if k == "do":
            return self.exec_block(st[1], Env(env))
        if k == "while":
            while truthy(self.eval(st[1], env)):
                self.tick()
                stop, sig = self.loop_body(st[2], Env(env))
                if stop:
                    return sig
            return None
        if k == "repeat":
            while True:
                self.tick()
                e2 = Env(env)
                stop, sig = self.loop_body(st[1], e2)
                if stop:
                    return sig
                if truthy(self.eval(st[2], e2)):
                    break
            return None
        if k == "fornum":
            a = tonum(self.eval(st[2], env))
            b = tonum(self.eval(st[3], env))
            s = tonum(self.eval(st[4], env)) if st[4] is not None else 1
            if a is None or b is None or s is None or s == 0:
                raise LuauRuntimeError("'for' limits must be numbers")
            i = a
            while (s > 0 and i <= b) or (s < 0 and i >= b):
                self.tick()
                e2 = Env(env)
                e2.vars[st[1]] = i
                stop, sig = self.loop_body(st[5], e2)
                if stop:
                    return sig
                i += s
            return None
        if k == "forin":
            vals = self.eval_multi_list(st[2], env)
            f = vals[0] if vals else None
            if isinstance(f, LTable):
                f, vals = ("iter", "pairs", f), [None, f, None]
            names = st[1]
            if isinstance(f, tuple) and f[0] == "iter":
                t = f[2]
                if f[1] == "ipairs":
                    seq = []
                    i = 1
                    while i in t.d:
                        seq.append((i, t.d[i]))
                        i += 1
                else:
                    seq = [(kk, t.d[kk]) for kk in self._ordered_keys(t)]
                for kk, vv in seq:
                    self.tick()
                    e2 = Env(env)
                    for idx, n in enumerate(names):
                        e2.vars[n] = (kk, vv)[idx] if idx < 2 else None
                    stop, sig = self.loop_body(st[3], e2)
                    if stop:
                        return sig
                return None
            state = vals[1] if len(vals) > 1 else None
            ctl = vals[2] if len(vals) > 2 else None
            while True:
                self.tick()
                rs = self.call(f, [state, ctl])
                if not rs or rs[0] is None:
                    break
                ctl = rs[0]
                e2 = Env(env)
                for idx, n in enumerate(names):
                    e2.vars[n] = rs[idx] if idx < len(rs) else None
                stop, sig = self.loop_body(st[3], e2)
                if stop:
                    return sig
            return None
        if k == "break":
            return ("break",)
        if k == "continue":
            return ("continue",)
        raise LuauRuntimeError("unknown statement " + k)

    def assign(self, tg, v, env):
        if tg[0] == "name":
            e = env.lookup(tg[1])
            if e is None:
                self.globals.vars[tg[1]] = v
            else:
                e.vars[tg[1]] = v
            return
        obj = self.eval(tg[1], env)
        key = self.eval(tg[2], env)
        if isinstance(obj, LTable):
            obj.set(key, v)
        elif isinstance(obj, InstNode):
            obj.attrs[key] = v
        else:
            raise Unsupported("assign to field of %s" % lua_type(obj))

    # ------------------------------------------------------------ выражения
    def eval_list(self, exprs, env, want):
        vals = self.eval_multi_list(exprs, env)
        if len(vals) < want:
            vals = vals + [None] * (want - len(vals))
        return vals[:want]

    def eval_multi_list(self, exprs, env):
        out = []
        for i, e in enumerate(exprs):
            if i == len(exprs) - 1:
                out.extend(self.eval_multi(e, env))
            else:
                out.append(self.eval(e, env))
        return out

    def eval_multi(self, e, env):
        k = e[0]
        if k == "call":
            fn = self.eval(e[1], env)
            return self.call(fn, self.eval_multi_list(e[2], env))
        if k == "method":
            obj = self.eval(e[1], env)
            return self.call_method(obj, e[2], self.eval_multi_list(e[3], env))
        if k == "vararg":
            va = env.lookup("...")
            return list(va.vars["..."]) if va else []
        return [self.eval(e, env)]

    def eval(self, e, env):
        self.tick()
        k = e[0]
        if k == "num" or k == "str":
            return e[1]
        if k == "name":
            en = env.lookup(e[1])
            return en.vars[e[1]] if en is not None else None
        if k == "index":
            return self.index(self.eval(e[1], env), self.eval(e[2], env))
        if k == "call" or k == "method" or k == "vararg":
            r = self.eval_multi(e, env)
            return r[0] if r else None
        if k == "bin":
            op = e[1]
            if op == "and":
                a = self.eval(e[2], env)
                return self.eval(e[3], env) if truthy(a) else a
            if op == "or":
                a = self.eval(e[2], env)
                return a if truthy(a) else self.eval(e[3], env)
            return self.binop(op, self.eval(e[2], env), self.eval(e[3], env))
        if k == "un":
            v = self.eval(e[2], env)
            if e[1] == "not":
                return not truthy(v)
            if e[1] == "-":
                n = tonum(v)
                if n is None or isinstance(v, bool):
                    raise LuauRuntimeError("attempt to negate non-number")
                return -n
            if isinstance(v, str):
                return len(v)
            if isinstance(v, LTable):
                return v.length()
            raise LuauRuntimeError("attempt to get length of %s" % lua_type(v))
        if k == "true":
            return True
        if k == "false":
            return False
        if k == "nil":
            return None
        if k == "paren":
            return self.eval(e[1], env)
        if k == "table":
            return self.make_table(e, env)
        if k == "func":
            return LFunction(e[1], e[2], e[3], env, e[4])
        if k == "ifexp":
            return self.eval(e[2], env) if truthy(self.eval(e[1], env)) else self.eval(e[3], env)
        if k == "istr":
            return "".join(p if kind == "s" else tostr(self.eval(p, env)) for kind, p in e[1])
        raise LuauRuntimeError("unknown expression " + k)

    def make_table(self, e, env):
        t = LTable()
        items = e[1]
        pos = 1
        for i, it in enumerate(items):
            try:
                if it[0] == "pos":
                    if i == len(items) - 1:
                        for v in self.eval_multi(it[1], env):
                            if v is not None:
                                t.d[pos] = v
                            pos += 1
                    else:
                        v = self.eval(it[1], env)
                        if v is not None:
                            t.d[pos] = v
                        pos += 1
                else:
                    t.set(self.eval(it[1], env), self.eval(it[2], env))
            except Unsupported as ex:
                self.log("%s: поле таблицы пропущено (Roblox API: %s)" % (self.cur_module.name if self.cur_module else "?", ex))
                if it[0] == "pos":
                    pos += 1
        return t

    def index(self, obj, key):
        if isinstance(obj, LTable):
            return obj.get(key)
        if isinstance(obj, EnumPath):
            return EnumPath(obj.path + "." + tostr(key))
        if isinstance(obj, Struct):
            kk = tostr(key)
            if kk in obj.f:
                return obj.f[kk]
            return obj.f.get(kk.lower())
        if isinstance(obj, InstNode):
            if key == "Parent":
                return obj.parent
            if key == "Name":
                return obj.name
            if key == "ClassName":
                return obj.cls
            if key in obj.children:
                return obj.children[key]
            raise Unsupported("%s.%s" % (obj.full_name() or obj.name, key))
        if isinstance(obj, str):
            return self.globals.vars["string"].d.get(key)
        if isinstance(obj, RobloxApi):
            raise Unsupported(obj.name)
        if obj is None:
            raise LuauRuntimeError("attempt to index nil with '%s'" % tostr(key))
        raise Unsupported("index of %s" % lua_type(obj))

    def binop(self, op, a, b):
        if op == "==":
            return self.eq(a, b)
        if op == "~=":
            return not self.eq(a, b)
        if op == "..":
            ok = lambda x: isinstance(x, (str, int, float)) and not isinstance(x, bool)
            if ok(a) and ok(b):
                return tostr(a) + tostr(b)
            raise LuauRuntimeError("attempt to concatenate")
        if op in ("<", ">", "<=", ">="):
            if not (isinstance(a, str) and isinstance(b, str)):
                a = tonum(a) if not isinstance(a, str) else None
                b = tonum(b) if not isinstance(b, str) else None
                if a is None or b is None:
                    raise LuauRuntimeError("attempt to compare")
            return {"<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b}[op]
        x, y = tonum(a), tonum(b)
        if x is None or y is None or isinstance(a, bool) or isinstance(b, bool):
            raise LuauRuntimeError("attempt to perform arithmetic on non-number")
        if op == "+":
            return x + y
        if op == "-":
            return x - y
        if op == "*":
            return x * y
        if op == "/":
            if y == 0:
                return math.nan if x == 0 else (math.inf if x > 0 else -math.inf)
            return x / y
        if op == "//":
            if y == 0:
                return math.inf if x > 0 else (-math.inf if x < 0 else math.nan)
            return int(math.floor(x / y)) if (isinstance(x, float) or isinstance(y, float)) else x // y
        if op == "%":
            return math.nan if y == 0 else x % y
        if op == "^":
            try:
                r = float(x) ** y
            except (OverflowError, ZeroDivisionError):
                return math.inf
            return r.real if isinstance(r, complex) else r
        raise LuauRuntimeError("bad operator " + op)

    def eq(self, a, b):
        if isinstance(a, bool) or isinstance(b, bool):
            return a is b
        if isinstance(a, (LTable, InstNode, LFunction, Builtin, Struct)):
            return a is b
        return a == b

    def call(self, fn, args):
        self.tick()
        if isinstance(fn, Builtin):
            r = fn.fn(*args)
            return r if isinstance(r, list) else ([] if r is None else [r])
        if isinstance(fn, LFunction):
            env = Env(fn.env)
            for i, p in enumerate(fn.params):
                env.vars[p] = args[i] if i < len(args) else None
            if fn.vararg:
                env.vars["..."] = args[len(fn.params):]
            self.depth += 1
            if self.depth > self.MAX_DEPTH:
                self.depth -= 1
                raise LuauRuntimeError("stack overflow")
            try:
                sig = self.exec_block(fn.body, env)
            finally:
                self.depth -= 1
            return sig[1] if sig and sig[0] == "return" else []
        if fn is None:
            raise LuauRuntimeError("attempt to call a nil value")
        if isinstance(fn, RobloxApi):
            raise Unsupported(fn.name)
        raise Unsupported("call of %s" % lua_type(fn))

    def call_method(self, obj, name, args):
        if isinstance(obj, str):
            fn = self.globals.vars["string"].d.get(name)
            if fn is None:
                raise Unsupported("string:%s" % name)
            return self.call(fn, [obj] + args)
        if isinstance(obj, LTable):
            return self.call(obj.get(name), [obj] + args)
        if isinstance(obj, InstNode):
            if name == "GetService":
                nm = tostr(args[0]) if args else ""
                if nm not in obj.children:
                    obj.add(InstNode(nm, "Service"))
                return [obj.children[nm]]
            if name in ("WaitForChild", "FindFirstChild"):
                ch = obj.children.get(tostr(args[0]) if args else "")
                if ch is None and name == "WaitForChild":
                    raise Unsupported("WaitForChild %s" % (args[0] if args else ""))
                return [ch]
            if name == "GetAttribute":
                return [obj.attrs.get(args[0] if args else None)]
            raise Unsupported("Instance:%s" % name)
        if isinstance(obj, RobloxApi):
            raise Unsupported("%s:%s" % (obj.name, name))
        raise Unsupported("method %s on %s" % (name, lua_type(obj)))


def to_json(v, depth=0, seen=frozenset()):
    """Luau-значение -> JSON-совместимый объект. Функции опускаются."""
    if depth > 24:
        return None
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, (int, float)):
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            if v == int(v) and abs(v) < 2 ** 53:
                return int(v)
        return v
    if isinstance(v, Struct):
        if v.kind == "Color3":
            return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(v.f[c])))) for c in "rgb")
        return dict(v.f)
    if isinstance(v, EnumPath):
        return v.path
    if isinstance(v, LTable):
        if id(v) in seen:
            return None
        seen = seen | {id(v)}
        n = v.length()
        if n and n == len(v.d):
            return [to_json(v.d[i], depth + 1, seen) for i in range(1, n + 1)]
        out = {}
        for k, val in v.d.items():
            if isinstance(val, (LFunction, Builtin, InstNode)):
                continue
            out[str(k[1] if isinstance(k, tuple) else k)] = to_json(val, depth + 1, seen)
        return out
    return None
