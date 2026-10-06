# roblox2web 2.0

Конвертер Roblox-проекта (Rojo-дерево, `.rbxlx`, zip/tar.gz, каталог) в **статическую веб-версию**, которая запускает **исходный Luau-код** игры в браузере.

* **Luau → JavaScript транспилятор** (`lua2js/`): собственный парсер Luau (типы, `continue`, составные присваивания, `if`-выражения, interp-строки, генерики, атрибуты) и генератор JS. Корутины Lua = JS-генераторы, строки байтовые, многозначные возвраты, метатаблицы, `pcall/error`, `string.format/pack-less` подмножество, `table.*`, `math.*`, `os.*`, `utf8`, `task.*`.
* **Эмулятор Roblox** (`rbx/`): дерево Instance, свойства и сигналы, `Players/Workspace/ReplicatedStorage/ServerScriptService/StarterGui…`, RemoteEvent/RemoteFunction (клиент ↔ «сервер» в одной вкладке, с задержкой), DataStore (localStorage), MarketplaceService (демо-покупки), TweenService, ProximityPrompt, физика упрощённая (OBB), 3D через three.js, GUI на DOM (Frame/TextLabel/TextButton/ScrollingFrame/UIListLayout/UIGridLayout/UIScale/…), BillboardGui, ввод мыши/клавиатуры/тач.
* **Конвертор**: CLI (`roblox2web.js`, Node ≥ 18) и онлайн-версия (<https://joliks.github.io/roblox2web/>, всё выполняется в браузере).

Пример: игра Pet Collector Simulator v2 — <https://joliks.github.io/pet-collector-sim/> (её Luau-код исполняется эмулятором; это не шаблон, а те же скрипты).

## Использование

```bash
node roblox2web.js путь/к/проекту_или.zip -o out/            # папка out/
node roblox2web.js game.rbxlx -o out/ --zip out.zip        # + zip
node roblox2web.js game.zip -o out/ --strict               # ошибка, если встретились неподдерживаемые API
```

Результат: `index.html`, `runtime.js`, `game.bundle.js`, `vendor/three.min.js`, `CONVERSION_REPORT.txt/json` (статический анализ: какие API использует проект и что эмулятор не знает).
Коды выхода: 0 — успех, 2 — ошибка входа, 3 — `--strict` и есть неподдерживаемое.

Параметры URL готовой страницы: `?quiet=1` (без шумных логов), `persist=0` (не сохранять), `seed=N`, `latency=сек` (задержка Remote), `premium=1`, `touch=1`, `autobuy=1` (демо-покупки без диалога).

### roblox2web.config.json (необязательно, в корне проекта)

```json
{
  "placeKey": "my-game",
  "patches": [
    { "script": "Shared.Config", "regex": "(\\bVIP\\s*=\\s*)0,", "replace": "$1900004," },
    { "script": "Shared.Config", "find": "DEBUG = false", "replace": "DEBUG = true" }
  ],
  "catalog": {
    "gamepasses": { "900004": { "name": "VIP", "price": 599, "description": "..." } },
    "products": {}
  }
}
```

* `patches` — правки исходников **только в веб-версии** (подстановка демо-ID геймпассов и т. п.), оригинал не меняется; в отчёте предупреждение, если ничего не нашлось.
* `catalog` — названия/цены для демо-диалога покупок.

## Тесты

```bash
cd tests/conformance && node harness.js     # 528 кейсов, 9 файлов — результаты сверяются с эталонным интерпретатором luau
node tests/emulator/run.js                  # 129 проверок эмулятора (Instance, Remote, GUI-раскладка, физика, DataStore, Motor6D-риг R6, …)
python3 tests/browser/test_sites.py         # Chromium: 3 синтетических проекта (obby, tycoon, GUI-приложение)
python3 tests/browser/test_online.py        # Chromium: онлайн-конвертор
```

Пересборка: `node tools/build_docs.js` (онлайн-версия `docs/` и `examples/*.zip`).

## Структура

```
lua2js/     парсер, генератор JS, рантайм Lua
rbx/        эмулятор Roblox (instance, services, gui, layout, physics, world3d, convert, project, boot…)
web/        онлайн-конвертор;  docs/ — собранная версия (GitHub Pages)
examples/   obby, tycoon, guiapp (синтетические проекты) + zip
vendor/     three.min.js r149, jszip
tests/      conformance, emulator, browser
roblox2web.py   резервный конвертор v1 (шаблонный, только pet-sim): --mode template
```

## Честные ограничения

* Это эмулятор подмножества Roblox API, а не полноценный движок. Неизвестные API пишутся в консоль страницы как `[r2w][unsupported]`, а часть — в `CONVERSION_REPORT`; игра, активно использующая то, чего нет, будет вести себя иначе.
* Нет репликации с фильтрацией: клиент и «сервер» работают в одной вкладке; скрытие `ServerStorage/ServerScriptService` от клиентских скриптов эмулируется, Signals срабатывают сразу (Immediate).
* Только один локальный игрок. Мультиплеер, настоящая сеть, MessagingService/MemoryStore (урезаны), HttpService (отключён) недоступны.
* Графика: `MeshPart`/`UnionOperation` рисуются как коробки; нет `rbxassetid://` (текстуры, звук, анимации, частицы); `SurfaceGui`/`ViewportFrame` — заглушки; освещение и тени упрощены.
* Физика упрощена (столкновения OBB; колёса, шарниры, наклонные Wedge — приближённо), Pathfinding — по прямой.
* Нет `string.pack/unpack`, `buffer`; `loadstring` минимален; скрипты не прерываются при `Destroy`.
* Время в эмуляторе виртуальное (идёт по кадрам) — `os.time()/os.clock()/tick()` детерминированы.
* Покупки и DataStore — демо (localStorage), настоящих платежей нет.
* Проверено в Chromium (headless, swiftshader); Firefox/Safari и реальные мобильные устройства вручную не проверялись.

Лицензия: MIT (three.js — MIT, JSZip — MIT/GPL, используется как MIT).
