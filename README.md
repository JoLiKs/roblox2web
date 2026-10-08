# roblox2web 2.3

Конвертер Roblox-проекта (Rojo-дерево, `.rbxlx`, zip/tar.gz, каталог) в **статическую веб-версию**, которая запускает **исходный Luau-код** игры в браузере.

* **Luau → JavaScript транспилятор** (`lua2js/`): собственный парсер Luau (типы, `continue`, составные присваивания, `if`-выражения, interp-строки, генерики, атрибуты) и генератор JS. Корутины Lua = JS-генераторы, строки байтовые, многозначные возвраты, метатаблицы, `pcall/error`, `string.format/pack-less` подмножество, `table.*`, `math.*`, `os.*`, `utf8`, `task.*`.
* **Эмулятор Roblox** (`rbx/`): дерево Instance, свойства и сигналы, `Players/Workspace/ReplicatedStorage/ServerScriptService/StarterGui…`, RemoteEvent/RemoteFunction (клиент ↔ «сервер» в одной вкладке, с задержкой), DataStore (localStorage), MarketplaceService (демо-покупки), TweenService, ProximityPrompt, физика упрощённая (OBB), 3D через three.js, GUI на DOM (Frame/TextLabel/TextButton/ScrollingFrame/UIListLayout/UIGridLayout/UIScale/…), BillboardGui, `Tool` (хотбар-инструменты: Equipped/Activated, RightGrip), `Model:ScaleTo/GetScale` (размеры, позиции, Motor6D/Weld C0/C1, Attachment, HipHeight), NPC-риги на `Humanoid:MoveTo`, ввод мыши/клавиатуры/тач (динамический джойстик и кнопка прыжка, как в мобильном Roblox).
* **Конвертор**: CLI (`roblox2web.js`, Node ≥ 18) и онлайн-версия (<https://joliks.github.io/roblox2web/>, всё выполняется в браузере).

Пример: игра Pet Collector Simulator v2.5 (русский/английский по стране игрока, HUD как в Roblox-симуляторах с хотбаром из настоящих `Tool`, событие «Суперсила» с ботами-игроками) — <https://joliks.github.io/pet-collector-sim/> (её Luau-код исполняется эмулятором; это не шаблон, а те же скрипты).

## Использование

```bash
node roblox2web.js путь/к/проекту_или.zip -o out/            # папка out/
node roblox2web.js game.rbxlx -o out/ --zip out.zip        # + zip
node roblox2web.js game.zip -o out/ --strict               # ошибка, если встретились неподдерживаемые API
```

Результат: `index.html`, `runtime.js`, `game.bundle.js`, `vendor/three.min.js`, `CONVERSION_REPORT.txt/json` (статический анализ: какие API использует проект и что эмулятор не знает).
Коды выхода: 0 — успех, 2 — ошибка входа, 3 — `--strict` и есть неподдерживаемое.

Параметры URL готовой страницы: `?quiet=1` (без шумных логов), `persist=0` (не сохранять), `seed=N`, `latency=сек` (задержка Remote), `premium=1`, `touch=1`, `autobuy=1` (демо-покупки без диалога).
Атрибуты: `attr.Имя=значение` (или `attr_Имя=`) — до 16 атрибутов `Workspace` до запуска серверных скриптов (число, `true/false` или строка), например `?attr.SuperpowerTimeScale=6` — удобно для переключателей отладки и ускорения игровых циклов.
Язык и страна: `country=RU` (страна для `LocalizationService:GetCountryRegionForPlayerAsync` без сетевого запроса), `lang=en` (`Player.LocaleId` = `en-us`, гео-запрос не делается, если не задан `country`), `geo=0` (не определять страну).

### LocalizationService и язык страницы

* `GetCountryRegionForPlayerAsync` возвращает **реальную страну по IP**: при старте страницы эмулятор по очереди опрашивает бесплатные сервисы без ключей, которые отдают CORS-заголовок `Access-Control-Allow-Origin: *`: `https://www.cloudflare.com/cdn-cgi/trace` (поле `loc=`) → `https://get.geojs.io/v1/ip/country` → `https://api.country.is/` → `https://ipapi.co/country/` (у последнего жёсткий лимит запросов). Общий бюджет ~2 с (на сервис ≤1.2 с); вызов из Luau ждёт результата. Если ни один не ответил — вызов **бросает ошибку**, как на Roblox при сбое (игры оборачивают его в `pcall` и берут `LocaleId`).
* `Player.LocaleId`, `LocalizationService.RobloxLocaleId/SystemLocaleId` — из `navigator.language` (`ru-RU` → `ru-ru`).
* Сплэш, верхняя панель и диалог демо-покупки показываются на языке по тому же правилу (страны СНГ из списка RU/BY/KZ/KG/AM/AZ/MD/TJ/UZ/TM → русский; UA — русский только при русском языке браузера; иначе английский; страна неизвестна → язык браузера). В консоли эмулятора (F9) пишется строка `[geo]` с результатом и временем каждого сервиса.
* В headless-режиме (node, тесты) сети нет: страна `US`, если тест не передал свой `geo` (`runProject(files, { geo })`).

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
node tests/emulator/run.js                  # 185 проверок эмулятора (Instance, Remote, GUI-раскладка, физика, DataStore, Motor6D-риг R6, LocalizationService/гео-IP, ScaleTo, NPC MoveTo, ?attr., DescendantAdded поддерева, Tool, PivotTo без дрейфа, …)
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

## Что нового в 2.3
* **`Tool`**: `Equipped`/`Unequipped` при смене родителя (Backpack ↔ персонаж), в руке только один инструмент, `RightGrip` + `Handle` в правой руке (с учётом `Grip`), `Activated`/`Deactivated` по клику/тапу в мир (не по GUI), `Humanoid:UnequipTools()`, `Tool:Deactivate()`; `GuiService:GetGuiInset()` = высота верхней панели (тест `12_tools`, директива `-- input:`).
* **Сенсорное управление как в мобильном Roblox**: динамический джойстик появляется под пальцем в левой нижней зоне, кнопка прыжка со стрелкой справа снизу (70/120 px по размеру экрана), более заметная на светлом фоне.
* **`PivotTo` / `SetPrimaryPartCFrame` без дрейфа**: поворот переортонормируется — после тысяч перемещений модели матрица не «раздувается» (раньше это могло подвесить пространственную сетку, тест `13_pivot_drift`).
* **`TextScaled` + `TextWrapped`**: как в Roblox, длинный текст переносится на строки и подбирается наибольший кегль, при котором он помещается (раньше кегль считался по одной строке и длинные подписи становились мелкими или обрезались).
* Шрифты: для `Enum.Font.FredokaOne` сначала пробуется одноимённый шрифт (если установлен в системе), затем округлые системные аналоги.

## Что нового в 2.2
* `Model:ScaleTo(s)` / `Model:GetScale()`: масштаб вокруг pivot — размеры и позиции частей, `C0/C1` у Motor6D/Weld/ManualWeld/Snap, `Attachment.CFrame`, `Humanoid.HipHeight`; `ScaleTo(0)` бросает ошибку, как в Roblox.
* Серверные NPC-риги (R6 с Motor6D) ходят через `Humanoid:MoveTo` (тест `10_scale_npc`).
* `?attr.Имя=значение` → атрибуты `Workspace` до старта серверных скриптов (тест-директива `-- attrs:`).
* `DescendantAdded` / `DescendantRemoving` теперь приходят для каждого потомка вставляемого поддерева, как в Roblox (раньше — только для корня; из-за этого локализаторы не видели TextLabel внутри BillboardGui, вставленного целиком).

## Честные ограничения

* Это эмулятор подмножества Roblox API, а не полноценный движок. Неизвестные API пишутся в консоль страницы как `[r2w][unsupported]`, а часть — в `CONVERSION_REPORT`; игра, активно использующая то, чего нет, будет вести себя иначе.
* Нет репликации с фильтрацией: клиент и «сервер» работают в одной вкладке; скрытие `ServerStorage/ServerScriptService` от клиентских скриптов эмулируется, Signals срабатывают сразу (Immediate).
* Только один локальный игрок. Мультиплеер, настоящая сеть, MessagingService/MemoryStore (урезаны), HttpService (отключён) недоступны.
* Графика: `MeshPart`/`UnionOperation` рисуются как коробки; нет `rbxassetid://` (текстуры, звук, анимации, частицы); `SurfaceGui`/`ViewportFrame` — заглушки; освещение и тени упрощены.
* Физика упрощена (столкновения OBB; колёса, шарниры, наклонные Wedge — приближённо), Pathfinding — по прямой.
* Нет `string.pack/unpack`, `buffer`; `loadstring` минимален; скрипты не прерываются при `Destroy`.
* Время в эмуляторе виртуальное (идёт по кадрам) — `os.time()/os.clock()/tick()` детерминированы.
* Покупки и DataStore — демо (localStorage), настоящих платежей нет.
* Страна для `LocalizationService` берётся у сторонних бесплатных гео-IP-сервисов (Cloudflare, geojs.io, country.is, ipapi.co): они видят IP посетителя, могут ограничивать частоту, блокироваться расширениями/корпоративными сетями и ошибаться для VPN; тогда используется язык браузера. Отключить — `?geo=0`.
* Проверено в Chromium (headless, swiftshader); Firefox/Safari и реальные мобильные устройства вручную не проверялись.

Лицензия: MIT (three.js — MIT, JSZip — MIT/GPL, используется как MIT).
