"""Извлечение игровых данных из дерева скриптов и распознавание жанра."""
from __future__ import annotations

import math

from .luau import (Interp, LTable, LFunction, LuauError, StepLimit, to_json)

VERSION = "1.0.0"

# Значения по умолчанию шаблона (взяты из Config.lua исходного Pet Collector Simulator).
# Применяются, ТОЛЬКО если в проекте не нашли соответствующее поле; каждое такое применение попадает в отчёт.
DEFAULTS = {
    "BASE_PET_SLOTS": 3, "BASE_BAG_SIZE": 30, "BASE_WALKSPEED": 16, "MAX_WALKSPEED": 56,
    "GOLD_CHANCE": 0.02, "GOLD_POWER_MULT": 2, "SELL_VALUE_PER_POWER": 40, "MAX_COINS": 1e15, "MAX_GEMS": 1e9,
    "HATCH_COUNTS": [1, 3], "MAX_CLICKS_PER_SECOND": 12,
    "REBIRTH_BASE_COST": 50000, "REBIRTH_COST_GROWTH": 4, "REBIRTH_MULT_PER": 0.5,
    "REBIRTH_GEMS_BASE": 20, "REBIRTH_GEMS_PER": 5,
}
UPGRADE_DEFAULT_CONSTS = {"CLICK_PER_LEVEL": 1, "SPEED_PER_LEVEL": 1.5, "LUCK_PER_LEVEL": 0.03, "BAG_PER_LEVEL": 10}


def is_arr(t):
    return isinstance(t, LTable) and t.length() > 0 and t.length() == len(t.d)


def arr_items(t):
    return [t.d[i] for i in range(1, t.length() + 1)]


def tget(t, k):
    return t.get(k) if isinstance(t, LTable) else None


def classify(value):
    """По структуре возвращённой таблицы определяем роль модуля. -> (role, score)."""
    if not isinstance(value, LTable):
        return None, 0
    roles = []
    pets, eggs = tget(value, "Pets"), tget(value, "Eggs")
    if is_arr(pets) and is_arr(eggs):
        p0, e0 = tget(pets, 1), tget(eggs, 1)
        if isinstance(p0, LTable) and isinstance(e0, LTable) and tget(p0, "Power") is not None and is_arr(tget(e0, "Pets")):
            roles.append(("petdata", 10))
    lst = tget(value, "List")
    if is_arr(lst):
        first = tget(lst, 1)
        if isinstance(first, LTable):
            if tget(first, "Multiplier") is not None and tget(first, "UnlockCost") is not None:
                roles.append(("zonedata", 10))
            if tget(first, "MaxLevel") is not None and (tget(first, "BaseCost") is not None or tget(first, "Costs") is not None):
                roles.append(("upgradedata", 10))
    score = sum(1 for k in ("GAMEPASSES", "PRODUCTS", "DAILY_REWARDS", "REBIRTH_BASE_COST", "PASS_EFFECTS",
                            "GAME_NAME", "BASE_PET_SLOTS", "GOLD_CHANCE", "HATCH_COUNTS") if tget(value, k) is not None)
    if score >= 2:
        roles.append(("config", score))
    if isinstance(tget(value, "rebirthCost"), LFunction) or isinstance(tget(value, "upgradeCost"), LFunction):
        roles.append(("formulas", 5))
    if not roles:
        return None, 0
    roles.sort(key=lambda r: -r[1])
    return roles[0]


class Extraction:
    def __init__(self):
        self.log = []
        self.modules = {}   # role -> (node, value)
        self.found = {}     # fullname -> role/None
        self.dumps = []     # для generic-отчёта: {module, keys, preview}
        self.interp = None


def evaluate_project(prj):
    ex = Extraction()
    interp = Interp(game=prj.root, logger=ex.log.append)
    ex.interp = interp
    for node in prj.all_scripts():
        if node.cls != "ModuleScript":
            continue
        interp.steps = 0
        try:
            value = interp.load_module(node)
        except StepLimit:
            ex.log.append("%s: лимит шагов" % node.full_name())
            continue
        except LuauError as e:
            ex.log.append("%s: не вычислен (%s)" % (node.full_name(), e))
            continue
        role, score = classify(value)
        ex.found[node.full_name()] = role
        if role:
            prev = ex.modules.get(role)
            if prev is None or score > prev[2]:
                ex.modules[role] = (node, value, score)
        if isinstance(value, LTable) and len(ex.dumps) < 40:
            keys = [str(k) for k in list(value.d.keys())[:25]]
            ex.dumps.append({"module": node.full_name(), "role": role, "keys": keys,
                             "preview": _preview(value)})
    return ex


def _preview(value):
    try:
        j = to_json(value)
    except Exception:
        return None
    import json
    s = json.dumps(j, ensure_ascii=False)
    if len(s) > 1200:
        s = s[:1200] + " …"
    return s


def detect_genre(prj, ex):
    names = " ".join(n.name.lower() for n in prj.all_scripts())
    roles = set(ex.modules)
    if "petdata" in roles:
        return "pet-simulator", "Найден модуль с таблицами Pets+Eggs (питомцы и яйца)."
    if any(w in names for w in ("dropper", "conveyor", "tycoon", "collector", "upgrader")) and ("zonedata" in roles or "upgradedata" in roles or "config" in roles):
        return "tycoon", "Похоже на тайкун (скрипты %s), но шаблон для тайкунов не реализован." % "/".join(
            w for w in ("dropper", "conveyor", "tycoon", "collector", "upgrader") if w in names)
    if "zonedata" in roles or "upgradedata" in roles:
        return "simulator-unknown", "Есть данные миров/апгрейдов, но нет питомцев и яиц — шаблону не хватает данных."
    return "unknown", "Не найдено ни одного распознаваемого модуля с данными (PetData / ZoneData / UpgradeData / Config)."


# ---------------------------------------------------------------- сборка данных для шаблона


def _num(v, d=0):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else d


def build_game_data(prj, ex):
    """-> (data, warnings, errors). errors непустые = играбельная версия невозможна."""
    warns, errs = [], []
    pd_node, pd, _ = ex.modules["petdata"]
    pj = to_json(pd)
    rarities = pj.get("Rarities") if isinstance(pj.get("Rarities"), dict) else {}
    pets_raw = pj.get("Pets") or []
    eggs_raw = pj.get("Eggs") or []

    if not rarities:
        rarities = {"Common": {"Order": 1, "Color": "#bebec8", "Scale": 1}}
        warns.append("PetData.Rarities не найдена: все питомцы будут считаться редкостью Common.")
    pets, ids = [], set()
    for p in pets_raw:
        if not isinstance(p, dict) or not isinstance(p.get("Id"), str) or p.get("Power") is None:
            warns.append("Пропущен некорректный питомец: %r" % (str(p)[:60],))
            continue
        if p["Id"] in ids:
            warns.append("Дубликат питомца %s пропущен." % p["Id"])
            continue
        ids.add(p["Id"])
        look = p.get("Look") if isinstance(p.get("Look"), dict) else {}
        rar = p.get("Rarity") if p.get("Rarity") in rarities else None
        if rar is None:
            rar = sorted(rarities, key=lambda r: rarities[r].get("Order", 0))[0]
            warns.append("У питомца %s неизвестная редкость, принята %s." % (p["Id"], rar))
        pets.append({"Id": p["Id"], "Name": str(p.get("Name") or p["Id"]), "Rarity": rar, "Power": _num(p["Power"]),
                     "Look": {"Body": look.get("Body", "#cccccc"), "Accent": look.get("Accent", "#888888"),
                              "Shape": look.get("Shape", "Round"), "Ears": look.get("Ears", "None"),
                              "Extras": look.get("Extras") if isinstance(look.get("Extras"), list) else []}})
    eggs = []
    for e in eggs_raw:
        if not isinstance(e, dict) or not isinstance(e.get("Id"), str) or not isinstance(e.get("Pets"), list):
            warns.append("Пропущено некорректное яйцо: %r" % (str(e)[:60],))
            continue
        entries = []
        for ep in e["Pets"]:
            if isinstance(ep, dict) and ep.get("Id") in ids and _num(ep.get("Weight")) > 0:
                entries.append({"Id": ep["Id"], "Weight": ep["Weight"]})
            else:
                warns.append("В яйце %s пропущена запись %r (нет такого питомца или вес ≤ 0)." % (e["Id"], str(ep)[:50]))
        if not entries:
            warns.append("Яйцо %s пропущено: нет валидных питомцев." % e["Id"])
            continue
        eggs.append({"Id": e["Id"], "Name": str(e.get("Name") or e["Id"]), "Zone": str(e.get("Zone") or ""),
                     "Currency": "Gems" if e.get("Currency") == "Gems" else "Coins", "Price": _num(e.get("Price"), 100),
                     "Color": e.get("Color", "#f5f0d8"), "Pattern": e.get("Pattern", "#78c864"), "Pets": entries})
    if not pets:
        errs.append("В PetData нет ни одного корректного питомца.")
    if not eggs:
        errs.append("В PetData нет ни одного корректного яйца.")
    if errs:
        return None, warns, errs

    # --- зоны
    if "zonedata" in ex.modules:
        zl = to_json(ex.modules["zonedata"][1]).get("List") or []
        zones = []
        for z in zl:
            if isinstance(z, dict) and isinstance(z.get("Id"), str):
                zones.append({"Id": z["Id"], "Name": str(z.get("Name") or z["Id"]), "Multiplier": _num(z.get("Multiplier"), 1),
                              "UnlockCost": _num(z.get("UnlockCost")), "RequiresRebirths": _num(z.get("RequiresRebirths")),
                              "Floor": z.get("Floor", "#68be54"), "Accent": z.get("Accent", "#ffd65a"),
                              "Sky": z.get("Sky", "#96cdff"), "Decor": z.get("Decor", "Trees")})
        ps = to_json(ex.modules["zonedata"][1]).get("PLATFORM_SIZE")
        platform = ps if isinstance(ps, (int, float)) and ps > 20 else 180
    else:
        zones, platform = [], 180
    if not zones:
        warns.append("ZoneData не найден: создана одна зона «Home» (x1). Яйца привязаны к зонам по полю Zone.")
        zones = [{"Id": "Home", "Name": "Home", "Multiplier": 1, "UnlockCost": 0, "RequiresRebirths": 0,
                  "Floor": "#68be54", "Accent": "#ffd65a", "Sky": "#96cdff", "Decor": "Trees"}]
    zone_ids = {z["Id"] for z in zones}
    for e in eggs:
        if e["Zone"] not in zone_ids:
            warns.append("Яйцо %s: зона «%s» не найдена, привязано к «%s»." % (e["Id"], e["Zone"], zones[0]["Id"]))
            e["Zone"] = zones[0]["Id"]
    if _num(zones[0]["UnlockCost"]) != 0:
        warns.append("Первая зона платная (%s) — в демо она открыта сразу." % zones[0]["Id"])

    # --- апгрейды
    ups, consts = [], dict(UPGRADE_DEFAULT_CONSTS)
    if "upgradedata" in ex.modules:
        uj = to_json(ex.modules["upgradedata"][1])
        for k in consts:
            if isinstance(uj.get(k), (int, float)):
                consts[k] = uj[k]
            else:
                warns.append("UpgradeData.%s не найдена, взято значение шаблона %s." % (k, consts[k]))
        for u in uj.get("List") or []:
            if isinstance(u, dict) and isinstance(u.get("Id"), str):
                costs = u.get("Costs") if isinstance(u.get("Costs"), list) else None
                ups.append({"Id": u["Id"], "Name": str(u.get("Name") or u["Id"]), "Description": str(u.get("Description") or ""),
                            "MaxLevel": _num(u.get("MaxLevel"), 1), "Currency": "Gems" if u.get("Currency") == "Gems" else "Coins",
                            "BaseCost": _num(u.get("BaseCost")), "Growth": _num(u.get("Growth"), 1), "Costs": costs})
    if not ups:
        warns.append("UpgradeData не найден: апгрейдов не будет. Шаблон без них играбелен, но беднее.")
    known = {"Click", "Speed", "Luck", "Bag", "Slots"}
    for u in ups:
        if u["Id"] not in known:
            warns.append("Апгрейд «%s» неизвестен шаблону (эффект не реализован, он только покупается)." % u["Id"])

    # --- конфиг
    cfg = {}
    if "config" in ex.modules:
        cj = to_json(ex.modules["config"][1])
        for k, v in cj.items():
            if k in ("GAMEPASS_IDS", "PRODUCT_IDS") or k.startswith("DATASTORE") or k.startswith("LEADERBOARD_DATASTORE"):
                continue
            if isinstance(v, (int, float, str, bool, list, dict)):
                cfg[k] = v
    else:
        warns.append("Config не найден: баланс (ребёрт, слоты, мешок, золотые питомцы) взят из значений шаблона.")
    for k, d in DEFAULTS.items():
        if k not in cfg:
            cfg[k] = d
            if "config" in ex.modules:
                warns.append("Config.%s не найден, взято значение шаблона (%s)." % (k, d))
    for k in ("GAMEPASSES", "PRODUCTS", "DAILY_REWARDS", "PASS_EFFECTS", "GAMEPASS_ORDER", "PRODUCT_ORDER"):
        if k not in cfg:
            warns.append("Config.%s не найден: соответствующий раздел демо (магазин/ежедневная награда) будет пустым или упрощённым." % k)

    name = str(cfg.get("GAME_NAME") or prj.name)
    data = {
        "meta": {"gameName": name, "projectName": prj.name, "generator": "roblox2web " + VERSION, "genre": "pet-simulator",
                 "sourceKind": prj.kind},
        "config": cfg,
        "rarities": rarities,
        "luckMinOrder": _num(pj.get("LUCK_MIN_ORDER"), 3),
        "pets": pets, "eggs": eggs, "zones": zones, "platformSize": platform,
        "upgrades": {"consts": consts, "list": ups},
    }
    return data, warns, []


# ---------------------------------------------------------------- проверка формул Luau против формул шаблона


def ref_formulas(data):
    """Эталон: те же формулы, что реализованы в template/game.js."""
    c, u = data["config"], data["upgrades"]
    consts = u["consts"]
    by = {x["Id"]: x for x in u["list"]}

    def rebirth_cost(r):
        return math.floor(min(c["REBIRTH_BASE_COST"] * (c["REBIRTH_COST_GROWTH"] ** r), c["MAX_COINS"]))

    def upgrade_cost(i, lvl):
        d = by[i]
        if lvl >= d["MaxLevel"]:
            return None
        if d.get("Costs"):
            return d["Costs"][lvl] if lvl < len(d["Costs"]) else None
        return math.floor(d["BaseCost"] * (d["Growth"] ** lvl))

    def walk(s, dbl):
        sp = c["BASE_WALKSPEED"] + s * consts["SPEED_PER_LEVEL"]
        if dbl:
            sp *= (c.get("PASS_EFFECTS") or {}).get("SPEED_MULT_DOUBLE", 2)
        return min(sp, c["MAX_WALKSPEED"])
    return {
        "rebirthCost": rebirth_cost,
        "rebirthMultiplier": lambda r: 1 + c["REBIRTH_MULT_PER"] * r,
        "rebirthGems": lambda r: c["REBIRTH_GEMS_BASE"] + c["REBIRTH_GEMS_PER"] * r,
        "upgradeCost": upgrade_cost,
        "bagSize": lambda l: c["BASE_BAG_SIZE"] + l * consts["BAG_PER_LEVEL"],
        "clickBase": lambda l: 1 + l * consts["CLICK_PER_LEVEL"],
        "upgradeLuck": lambda l: 1 + l * consts["LUCK_PER_LEVEL"],
        "walkSpeed": walk,
    }


def check_formulas(ex, data):
    """Вызывает чистые функции Formulas.* из Luau и сравнивает с формулами шаблона.
    -> (checked:list[str], mismatches:list[str], note)"""
    if "formulas" not in ex.modules:
        return [], [], "Модуль Formulas не найден — формулы шаблона не сверялись с вашим кодом."
    interp = ex.interp
    interp.steps = 0
    mod = ex.modules["formulas"][1]
    ref = ref_formulas(data)
    checked, bad = [], []

    def call(name, *args):
        fn = tget(mod, name)
        if not isinstance(fn, LFunction):
            return "missing"
        try:
            r = interp.call(fn, list(args))
            return r[0] if r else None
        except LuauError as e:
            return "err:%s" % e

    def same(a, b):
        if a is None or b is None:
            return a is b
        if isinstance(a, str):
            return False
        return abs(a - b) <= 1e-9 * max(1, abs(b))

    cases = {
        "rebirthCost": [(r,) for r in range(0, 8)],
        "rebirthMultiplier": [(r,) for r in range(0, 8)],
        "rebirthGems": [(r,) for r in range(0, 8)],
        "bagSize": [(l,) for l in range(0, 11)],
        "clickBase": [(l,) for l in range(0, 61, 5)],
        "upgradeLuck": [(l,) for l in range(0, 11)],
        "walkSpeed": [(s, d) for s in range(0, 9) for d in (False, True)],
    }
    for u in data["upgrades"]["list"]:
        cases.setdefault("upgradeCost", []).extend((u["Id"], l) for l in range(0, int(u["MaxLevel"]) + 1))
    for name, arglist in cases.items():
        got0 = call(name, *arglist[0])
        if got0 == "missing":
            continue
        n_bad = 0
        for args in arglist:
            got = call(name, *args)
            want = ref[name](*args)
            if not same(got, want):
                n_bad += 1
                if n_bad == 1:
                    bad.append("Formulas.%s%r: Luau=%r, шаблон=%r" % (name, args, got, want))
        checked.append(name)
    return checked, bad, None
