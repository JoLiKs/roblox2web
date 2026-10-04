import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from r2w.luau import (InstNode, Interp, LuauSyntaxError, parse, to_json)


def run(src):
    """Выполняет модуль, возвращает JSON-представление результата и список предупреждений."""
    root = InstNode("game", "DataModel")
    node = root.add(InstNode("M", "ModuleScript", src, "M.lua"))
    log = []
    it = Interp(root, log.append)
    return to_json(it.load_module(node)), log


class LuauTests(unittest.TestCase):
    def test_literals_and_comments(self):
        v, _ = run('''-- comment
--[[ long
comment ]] --[==[ x ]==]
return { a = 1, b = 2.5, c = "s\\n\\"q\\" \\65\\x41\\u{41}", d = true, e = false, f = nil, g = 0xFF, h = 1e3, i = 1_000,
  [[long
string]], 'single', nested = { 1, 2, { x = 1 } }, ["key with space"] = 7; 99 }''')
        self.assertEqual(v["a"], 1)
        self.assertEqual(v["b"], 2.5)
        self.assertEqual(v["c"], 's\n"q" AAA')
        self.assertIs(v["d"], True)
        self.assertIs(v["e"], False)
        self.assertNotIn("f", v)
        self.assertEqual((v["g"], v["h"], v["i"]), (255, 1000, 1000))
        self.assertEqual(v["nested"], [1, 2, {"x": 1}])
        self.assertEqual(v["key with space"], 7)
        self.assertEqual(v["1"], "long\nstring")

    def test_array_vs_dict(self):
        v, _ = run("return { {1,2,3}, {a=1}, {} }")
        self.assertEqual(v, [[1, 2, 3], {"a": 1}, {}])

    def test_types_casts_and_compound(self):
        v, _ = run('''--!strict
export type Look = { Body: Color3, Extras: { string }, F: (number, string?) -> boolean, [string]: number }
type Gen<T> = { T }
local function f(a: number, b: string?, ...: any): (number, string)
  local x: number = a * 2
  x += 1; x *= 3
  return x, "z"
end
local t = { r = f(2) } :: { [string]: any }
local s = "a"
s ..= "b"
return { t = t.r, s = s, c = (5 :: number) // 2, m = -7 % 3, p = 2 ^ 10, e = 7 // 2 }''')
        self.assertEqual(v, {"t": 15, "s": "ab", "c": 2, "m": 2, "p": 1024, "e": 3})

    def test_constructor_helpers_like_petdata(self):
        v, _ = run('''
local c3 = Color3.fromRGB
local function pet(id, name, power, col) return { Id = id, Name = name, Power = power, Look = { Body = col } } end
return { Pets = { pet("a","A",1,c3(255,0,128)), pet("b","B",2.5,c3(0,0,0)) }, Z = Vector3.new(1,2,3), M = Enum.Material.Grass }''')
        self.assertEqual(v["Pets"][0], {"Id": "a", "Name": "A", "Power": 1, "Look": {"Body": "#ff0080"}})
        self.assertEqual(v["Z"], {"x": 1, "y": 2, "z": 3})
        self.assertEqual(v["M"], "Enum.Material.Grass")

    def test_control_flow_and_ifexp(self):
        v, _ = run('''
local out = {}
for i = 1, 5 do if i % 2 == 0 then continue end table.insert(out, i) end
local k = 0
while true do k += 1 if k >= 3 then break end end
for _, w in ipairs({"x","y"}) do out[#out + 1] = w end
local n = 0
for key, val in pairs({a=1,b=2}) do n += val end
local label = if k == 3 then "three" elseif k == 4 then "four" else "other"
repeat k -= 1 until k <= 0
return { out = out, k = k, n = n, label = label, f = string.format("%d-%s-%.1f", 5, "q", 2.25) }''')
        self.assertTrue(v.pop("f").startswith("5-q-2."))
        self.assertEqual(v, {"out": [1, 3, 5, "x", "y"], "k": 0, "n": 3, "label": "three"})

    def test_roblox_api_is_skipped_not_fatal(self):
        v, log = run('''
local Players = game:GetService("Players")
local rng = Random.new()
task.spawn(function() while true do end end)
local part = Instance.new("Part")
return { ok = 1, x = Players.LocalPlayer, y = 2 }''')
        self.assertEqual(v, {"ok": 1, "y": 2})
        self.assertTrue(log)

    def test_infinite_loop_is_bounded(self):
        v, log = run("local n = 0\nwhile true do n += 1 end\nreturn {a=1}")
        self.assertIsNone(v)
        self.assertTrue(any("лимит" in m for m in log))

    def test_syntax_error(self):
        with self.assertRaises(LuauSyntaxError):
            parse("local = = 1", "x")
        with self.assertRaises(LuauSyntaxError):
            parse("return { 1, 2", "x")
        with self.assertRaises(LuauSyntaxError):
            parse('return "unfinished', "x")

    def test_require_between_modules(self):
        root = InstNode("game", "DataModel")
        shared = root.add(InstNode("Shared", "Folder"))
        shared.add(InstNode("Config", "ModuleScript", "return { N = 5 }", "Config.lua"))
        m = shared.add(InstNode("Data", "ModuleScript", 'local C = require(script.Parent.Config)\nreturn { v = C.N * 2 }', "Data.lua"))
        v = to_json(Interp(root).load_module(m))
        self.assertEqual(v, {"v": 10})

    def test_metatable_index_and_methods(self):
        v, _ = run('''
local Base = {}
Base.__index = Base
function Base.new(x) return setmetatable({ x = x }, Base) end
function Base:double() return self.x * 2 end
return { r = Base.new(21):double(), s = ("ab"):rep(3), u = ("Hi"):upper() }''')
        self.assertEqual(v, {"r": 42, "s": "ababab", "u": "HI"})


if __name__ == "__main__":
    unittest.main()
