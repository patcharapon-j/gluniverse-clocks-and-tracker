# Weather System — Implementation Spec

> **Status:** Design locked, not yet implemented. This document is a complete handoff
> for an agent picking up cold. Every decision below was resolved in a grilling session
> against the source PDFs and the existing codebase. Read the whole thing before coding.

---

## 0. TL;DR

Add a **Weather** feature to the `gluniverse-clocks-and-tracker` Foundry VTT module. It is
built on a **generic Hex Flower Game Engine** (HFGE) from Goblin's Henchman's *Hex Flower
Cookbook*: a 19-hex "flower" of weather outcomes plus a "Navigation Hex" (a dice→direction
map) that walks a current position around the flower one step at a time. Weather is the
flagship preset of this engine.

The feature is **deeply wired into the module's existing time system**: the flower auto-walks
as in-game days pass (configurable), and behaves differently per **calendar season**.

It surfaces as:
1. A **weather chip on the existing top-bar time HUD** — a localized PixiJS "diorama"
   (animated rain/snow/lightning/etc.) with a **tint confined to the badge area only**
   (the rest of the HUD keeps the current-shift color), plus a hazard pulse for dangerous weather.
2. A **dedicated Hex Flower window** — the 19 hexes rendered, current position glowing,
   hex-to-hex walk animation on each step, a history strip, GM controls, and a **visual editor**.

Effects are **composable and freely tintable** so fantasy weather (acid rain, crimson
lightning, ashfall, arcane mist…) is just an archetype + tint, no new code.

**Opt-in:** ships disabled by default so existing calendar-only users are unaffected.

---

## 1. Source material

Two PDFs by Goblin's Henchman informed this design (already read during design; summarized
here so you don't need them):

### Hex Flower Game Engine (HFGE) — the mechanic
- A **Hex Flower (HF)** is 19 hexagons in a flower shape. Each hex = one game outcome
  (here: one weather condition). Adjacency matters — similar outcomes are grouped so the
  walk transitions smoothly (e.g. `cloudy` sits between `sunny` and `stormy`).
- A **Navigation Hex (NH)** defines the "rules": roll dice (default **2D6**) and the total
  maps to one of **6 hex-face directions** (loosely clock-face). The NH's mapping is where
  the **trend/bias** lives — e.g. making it harder to move "up" toward extreme weather than
  "down" toward calm.
  - Default 2D6 direction map (clock-face style, slight left skew): `12`→up, `2,3`→upper-right,
    `4,5`→lower-right, `6,7`→down, `8,9`→lower-left, `10,11`→upper-left. Tune per flower.
  - Alternative: **D6+D8** (symmetric, and a roll of `9` = "stay in current hex").
- **Edge rules ("wild-card jumps"):** if a move would leave the flower, **wrap around** to the
  opposite edge along the same row/column — injects chaos. Some faces are marked **disallowed**
  (the red `Ø` in the PDF) → **stay in current hex**. A face can also have a **divert** arrow to
  an alternative destination.
- **Secondary structures** (optional authoring aids, not enforced by code):
  - *Collar* — a ring of near-extreme outcomes around the most extreme hex (telegraphs it).
  - *Lobes* — upper-left / upper-right lobes given independent themes (e.g. arid vs wooded).
  - *Central hex* — often a rare "wildcard/other" outcome.
  - *Starting hex* — usually the calmest, farthest from the extreme (typically the bottom hex).
- **Classes:** Class I = infinite game (no terminal event) — **this is what weather is**.
  Classes II–VI add terminal events, competing flowers, hunters, etc. — **out of scope for
  weather**, but the engine should not actively prevent them.
- **Situational NHs:** the PDF swaps the NH based on circumstances. We apply this to
  **calendar seasons** (winter NH trends cold, summer NH trends hot).
- **Points:** players can spend points to nudge the NH direction. We **defer the UI** but keep
  the engine hook (see §5.8).

### In the Heart of the Unknown — usage context
A wilderness hex-crawl that uses three stacked HFGEs (Encounter, Terrain, Weather). Confirms
one step ≈ one day of travel, weather is global to the journey, and temperature interacts with
precipitation ("in cold weather the drops are snow, sleet or hail").

---

## 2. Existing codebase — what to reuse

The module already establishes every pattern Weather needs. **Mirror these, do not invent new ones.**

| Concern | Existing implementation | Reuse for weather |
| --- | --- | --- |
| Constants / IDs | `scripts/const.js` (`MODULE_ID`, `SOCKET`, `HOOKS`, `SETTINGS`, type lists) | Add `HOOKS.weatherChanged`, `SETTINGS.weather*`, weather type/archetype consts |
| World state + reactivity | World-scope settings with `onChange` → `SomeHud.refresh()` (see `scripts/settings.js`) | Store weather state in a world setting; `onChange` → repaint chip + window |
| GM-authoritative + player requests | `scripts/trackers/trackers.js` `TrackerStore` + socket in `registerSocket()`; players route writes to `game.users.activeGM` over `SOCKET` | Weather writes are GM-only; same socket pattern if players ever nudge |
| Data store class | `TrackerStore` (static reads/writes, `deepClone`, sanitize, `save()` fires hook) | Build `WeatherStore` in the same shape |
| Time engine | `scripts/engine.js` `TimeEngine` (worldTime is source of truth; `getState()`; seasons via `cal.seasons.values[c.season]`; `advanceStep`/`advanceSeconds`) | Read season + day index from here; hook day rollover |
| Day rollover detection | `Hooks.on("updateWorldTime", …)` in `scripts/module.js` | Compare previous vs current absolute day index to fire weather steps |
| Top-bar HUD | `scripts/apps/hud.js` `GlctHud` + `templates/hud.hbs` + `styles/hud.css`; imperative repaint via `_buildRows`-style, structural signature to decide repaint vs rebuild; **per-shift CSS custom properties** drive theming | Add the weather chip into this HUD; **scope the weather tint to the chip element only** — do NOT touch the shift-driven HUD vars |
| Floating window app | `scripts/apps/tracker-hud.js` `TrackerHud` — frameless `ApplicationV2` + `HandlebarsApplicationMixin`, draggable, client-scoped position setting, compact mode | Model the Hex Flower window on this |
| Editor app + presets + JSON I/O | `scripts/apps/calendar-editor.js` + `scripts/calendar/presets.js` + `templates/calendar-editor.hbs`; `registerCalendarMenu()` adds a Settings menu button; Import/Export JSON | Model the weather editor + `weather/presets.js` + a `registerWeatherMenu()` |
| Settings menu registration | `registerCalendarMenu()`, `registerShiftNamesMenu()` called from `registerSettings()` | Add `registerWeatherMenu()` |
| Scene-control button + keybinding | `scripts/module.js` `getSceneControlButtons` hook + `game.keybindings.register` | Add a weather toggle button + `Alt+W` |
| Dice + Dice So Nice + chat card | `TrackerStore._doRollPool` / `_postPoolCard` — real `Roll`, `game.dice3d.showForRoll(roll, author, true)`, on-brand chat card tagged via `renderChatMessageHTML` | Reuse for the NH roll + weather-change announcement card |
| Scene tint precedent | `applySceneTint` in `scripts/module.js` (soft-light overlay) | Reference only — weather tint is **local to the chip**, not scene-wide |
| Hazard visual language | tracker `hazard`/`bad` clock: danger-red, dread glow, ember flicker (`styles/hud.css`) | Reuse the dread treatment for the weather **ominous/hazard** flag |
| i18n | `lang/en.json`, keys namespaced `GLCT.*`; `game.i18n.localize/format` | Add `GLCT.weather.*` keys; never hard-code user-facing strings |
| Public API | `mod.api = { TimeEngine, GlctHud, TrackerHud, TrackerStore, HOOKS }` in init | Add `WeatherEngine`, `WeatherStore`, `WeatherHud` |
| Hot reload | `module.json` flags watch `styles`, `templates`, `lang` | Put new templates/styles there so they hot-reload |

**Foundry version:** compat min 13, verified 14. Use `foundry.applications.api.{ApplicationV2,
HandlebarsApplicationMixin, DialogV2}`, `foundry.utils.{deepClone,randomID,escapeHTML,mergeObject}`.
PixiJS is bundled with Foundry (`PIXI` global / `globalThis.PIXI`) — **no new dependency**.

---

## 3. Resolved design decisions (the full tree)

Every one of these was deliberately chosen. Do not silently deviate.

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Abstraction | **Generic Hex Flower engine**, weather as flagship preset |
| 2 | Cadence | **Configurable** per world: auto-advance (period) **or** manual-only; GM always has Roll-now + rewind |
| 3 | Time skips (auto) | **One step per elapsed period, capped (~60)**, single compact chat **digest** for big jumps |
| 4 | State model | **Stateful walk + bounded history log** (~last 60 steps); advance pushes, rewind pops |
| 5 | UI surface | **Weather chip on top-bar HUD** + **dedicated Hex Flower window** |
| 6 | Effects reach | **Chat announcement card** + **localized badge tint** + **localized PixiJS weather effect**. NOT scene-wide. Rest of HUD keeps shift color. |
| 7 | Effect tech | **Dedicated PixiJS mini-canvas in the badge** (WebGL, bundled Pixi, never touches scene canvas) |
| 8 | Effect model | **Composable: motion archetype × style (tints)**; shipped "kinds" are named archetype+style presets |
| 9 | Seasons | **Per-season flower AND Navigation Hex** |
| 10 | Season swap | On season change, **map current position by hex coordinate** to the new flower |
| 11 | NH dice | **Configurable, 2D6 default**, D6+D8 alternative; roll→direction map holds the trend |
| 12 | Hex payload | **Label + icon + description**, **temperature reading**, **free-form GM effect note** |
| 13 | Editor | **Visual hex editor** (click hex; visual NH editor per season w/ live trend preview; per-face edge-rule toggles) **+ JSON import/export + presets** |
| 14 | Presets | **Temperate (full 4-season climate)** + **Goblin's Henchman classic homage** (single-flower, no-seasons example) |
| 15 | Player agency | **Engine hook only** (step accepts ±N direction modifier); **no player points UI in v1** |
| 16 | Visibility | Players see **current condition + announcement + recent history**; **flower/NH GM-only by default**, world setting to reveal read-only flower |
| 17 | Scope | **Single global world weather**; state stored under a keyed `regions` map (`default` entry) so per-region is a future, migration-free add |
| 18 | Roll feel | **Real Foundry `Roll`**; **Dice So Nice on manual rolls**, silent on auto-ticks/digests |
| 19 | Tint depth | **Two-color tint (particle + glow/accent)** + auto blend mode + **per-hex ominous/hazard flag** (dread treatment on badge + chip + card) |

### Default calls (vetoable, but implement as stated)
- **D1** Opt-in: world setting **`weatherEnabled`** default **`false`**. Chip hidden until enabled AND a flower is configured.
- **D2** New plumbing matching existing patterns: `HOOKS.weatherChanged`; scene-control button + **`Alt+W`** keybinding to open the flower window; a **"Weather" settings menu** alongside Edit Calendar / Events / Shift Names.
- **D3** Announcement card: visibility is a GM choice via the **`weatherCardVisibility`** world setting — **`public`** (posted to everyone, default) or **`gm`** (whispered to GMs only, so players discover the weather in-fiction). Posts **only when the condition actually changes** (not on a no-op "stay").
- **D4** Performance: badge Pixi canvas **pauses** (stop ticker) when the HUD is collapsed/hidden or the tab is backgrounded (`document.hidden` / `visibilitychange`).
- **D5** Each flower defines a **start hex** (first-run state + reset target).

---

## 4. Data model

All weather state lives in **world-scope settings** (GM-authoritative, broadcast to clients via
`onChange`). Use `foundry.utils.deepClone` on reads, sanitize on writes, fire `HOOKS.weatherChanged`
from `WeatherStore.save()` — exactly like `TrackerStore`.

### 4.1 Hex topology (constant)
19 hexes in a flower. Use **axial coordinates** with a fixed canonical index `0..18` so flowers,
NHs, and position all share one topology (required by decision #10, "map by coordinate").
Define a single source-of-truth table `HEX_LAYOUT` in `scripts/weather/hex-geometry.js`:
- For each index: axial `{q, r}` (or column/row), pixel center for rendering, and the
  **6 neighbor indices by direction** (`up, upperRight, lowerRight, down, lowerLeft, upperLeft`),
  with `null` where that direction leaves the flower (→ triggers edge rule).
- Also precompute, per index per off-edge direction, the **wrap-around target index** (opposite
  edge, same row/column) per the PDF's wild-card-jump rule.

Suggested layout (columns of a pointy-top flower), 5 columns of heights 3-4-5-4-3 = 19:
```
        H   H   H            (top row)
      H   H   H   H
    H   H   H   H   H        (center hex = index 9, the middle)
      H   H   H   H
        H   H   H            (bottom row)
```
Pick one concrete indexing and document it in code comments with an ASCII map. **The exact
indices don't matter as long as they're stable and consistent across flower/NH/position.**

### 4.2 Effect spec (per hex visual)
```jsonc
{
  "archetype": "streaks",      // streaks|flakes|volume|flashes|motes|embers|gusts|shards|clear
  "kind": "acid-rain",         // optional named library preset this derives from (for UI/labels)
  "intensity": 0.7,            // 0..1 — particle density + speed
  "tintParticle": "#a6e22e",   // primary particle color
  "tintGlow": "#3a5f00",       // secondary glow/accent color
  "drift": "fall",             // fall|rise|left|right|still — archetype-dependent
  "ominous": false             // hazard flag → dread pulse on badge + chip + card
}
// blend mode is auto-derived: additive for flashes/motes/embers, normal otherwise.
```

### 4.3 Hex (one weather outcome)
```jsonc
{
  "index": 9,                  // 0..18, position in HEX_LAYOUT
  "label": "Heavy Rain",
  "icon": "fa-solid fa-cloud-showers-heavy",   // FA class or image path
  "description": "Sheets of rain reduce visibility to a few yards.",
  "temperature": "Cold",       // free string or band; shown beside condition (decision #12)
  "effectNote": "Disadvantage on ranged attacks; open flames gutter.",  // GM-facing, optional player reveal
  "effect": { /* §4.2 effect spec */ }
}
```

### 4.4 Navigation Hex (per season)
```jsonc
{
  "dice": "2d6",               // "2d6" | "d6+d8" (extensible)
  "directionMap": {            // roll total → direction key | "stay"
    "12": "up", "2": "upperRight", "3": "upperRight",
    "4": "lowerRight", "5": "lowerRight", "6": "down", "7": "down",
    "8": "lowerLeft", "9": "lowerLeft", "10": "upperLeft", "11": "upperLeft"
  },
  "edgeRules": {               // per direction when move leaves flower: "wrap"|"stay"|{divert:index}
    "up": "wrap", "upperRight": "wrap", "lowerRight": "wrap",
    "down": "wrap", "lowerLeft": "stay", "upperLeft": "stay"
  }
}
```
Note: trend lives entirely in `directionMap`. `disadvantage` (2d6-keep-lowest) is a 100%
equivalent of 2d6 per the PDF — expose as a cosmetic flavor toggle if cheap, else skip.

### 4.5 Flower / climate / full weather config
```jsonc
{
  "schemaVersion": 1,
  "regions": {                          // decision #17 — keyed for future per-region; v1 uses only "default"
    "default": {
      "activePresetId": "temperate",    // or "custom"
      "climate": {
        "id": "temperate",
        "name": "Temperate",
        "startHexIndex": 14,            // decision D5
        "defaultNav": { /* §4.4 NH used when a season has no override */ },
        "seasons": {                    // keyed by season index OR season name from the active calendar
          "0": { "name": "Spring", "hexes": [ /* 19 §4.3 hexes */ ], "nav": { /* §4.4 */ } },
          "1": { "name": "Summer", "hexes": [ /* 19 */ ], "nav": { /* */ } },
          "2": { "name": "Autumn", "hexes": [ /* 19 */ ], "nav": { /* */ } },
          "3": { "name": "Winter", "hexes": [ /* 19 */ ], "nav": { /* */ } }
        }
      },
      "state": {                        // the live walk (decision #4)
        "currentIndex": 14,
        "lastSeasonKey": "3",           // detect season changes for coordinate remap (decision #10)
        "lastDayIndex": 0,              // absolute in-game day index of last step (cadence/skip math)
        "history": [                    // bounded ~60, newest last
          { "worldTime": 0, "from": 14, "to": 11, "roll": 7, "dir": "down", "seasonKey": "3" }
        ]
      }
    }
  }
}
```
**Season keying:** prefer keying seasons by the **season index** Foundry reports
(`TimeEngine.getState().…` / `game.time.components.season`). Store the name for display only.
A climate that has no per-season entry for the current season falls back to `defaultNav` +
the nearest defined season's hexes (document the fallback). The "homage" preset uses a single
season entry / no seasonal variation.

### 4.6 Motion archetypes (the Pixi engine implements these few)
| Archetype | Motion | Default blend | Fantasy examples via tint |
| --- | --- | --- | --- |
| `clear` | none / faint shimmer | normal | clear skies |
| `streaks` | fast diagonal lines falling | normal | rain, heavy-rain, **acid rain** (green), **blood rain** (red) |
| `flakes` | slow drifting particles, `drift: fall\|rise` | normal | snow, blizzard, **ashfall** (grey, rise), petals |
| `volume` | soft drifting blobs/banks | normal | fog, cloud, smoke, **miasma** (sickly), **arcane mist** |
| `flashes` | intermittent full-canvas strobe + bolt | **additive** | storm/lightning, **crimson lightning** (crimson+rose) |
| `motes` | floating sparkles, gentle brownian | **additive** | spores, pollen, fireflies, **arcane dust** |
| `embers` | rising glowing sparks | **additive** | **ember storm / firestorm**, cinders |
| `gusts` | horizontal streaks/lines | normal | wind, **sandstorm** (tan), driving rain |
| `shards` | fast hard falling chips | normal | hail, sleet, debris |

Shipped **library "kinds"** are just named `(archetype, default tints, drift, intensity)` presets:
`clear, clouds, fog, rain, heavy-rain, snow, blizzard, storm, wind, sand, hail` + a fantasy set
(`acid-rain, blood-rain, ashfall, ember-storm, arcane-mist, spore-bloom, aurora, miasma, meteor-shower`).
The editor lets a GM pick a kind then retint freely, or start from a bare archetype.

---

## 5. Engine behavior (the rules)

Implement in `scripts/weather/engine.js` as a static `WeatherEngine` (mirror `TimeEngine`).

### 5.1 A single step
1. Resolve the **active NH** for the current season (season override → else climate `defaultNav`).
2. Roll the NH dice as a **real Foundry `Roll`** (decision #18). Map total → direction (or `stay`).
3. If `stay` → no move (and if auto, **do not** post a card per decision D3).
4. Else compute neighbor in that direction from `HEX_LAYOUT`. If off-edge, apply the NH's
   **edge rule** for that direction: `wrap` → precomputed wrap target; `stay` → no move;
   `divert` → the diversion index.
5. Apply optional **direction modifier** (±N faces, decision #15) before resolving the neighbor —
   default 0; the parameter exists so future player-nudge can pass it.
6. Push a history entry; clamp history to ~60 (drop oldest). Update `currentIndex`,
   `lastDayIndex`, `lastSeasonKey`. Save (GM only) → `onChange` repaints + fires `weatherChanged`.
7. On a **manual** GM roll: trigger `game.dice3d.showForRoll(...)` if present, then the
   hex-to-hex walk animation in the window, then post the announcement card. On **auto** ticks:
   skip 3D dice; post card only if the condition changed; for multi-step skips post **one digest**.

### 5.2 Cadence / day rollover (decision #2, #3)
- In `module.js` `updateWorldTime` handler, compute current absolute in-game **day index**
  (e.g. `Math.floor(worldTime / SECONDS_PER_DAY)` via `time-math.js`, or from calendar components
  to honor variable day length — prefer the calendar-aware value).
- If `weatherEnabled` and mode is **auto**: `elapsed = currentDayIndex - state.lastDayIndex`.
  If `elapsed >= period`, run `floor(elapsed / period)` steps, **capped at ~60**. Each step is a
  full §5.1 walk (so the memory walk is preserved). Backwards movement (`elapsed < 0`, i.e. GM
  rewound time across a boundary) **pops** that many steps from history and restores positions.
- **Manual mode:** never auto-step; GM uses Roll-now / rewind buttons in the window/chip.
- Period setting: `every day` / `every N days` / `every shift` (a "shift" = quarter day; reuse
  YZE shift math from `time-math.js`/`engine.js`).
- Only the **primary active GM** executes auto-steps (guard `game.users.activeGM?.id === game.user.id`)
  to avoid double-stepping on multi-GM tables — same guard `TrackerStore.registerSocket` uses.

### 5.3 Season change + coordinate remap (decision #9, #10)
- On each evaluation, compare current season key to `state.lastSeasonKey`. If changed and the new
  season has a different flower, keep `currentIndex` (map by coordinate) and update `lastSeasonKey`.
  No extra roll. The new season's hex at that index becomes the current condition.

### 5.4 Rewind
- Right-click the Roll-now control (matching the module's "left-click advance / right-click rewind"
  idiom) **pops** the last history entry and restores `currentIndex`/keys. Also triggered by
  backward day rollover (§5.2).

### 5.5 Current condition resolver
- `WeatherEngine.getCurrent()` → `{ hex, seasonKey, regionKey }` for the active region/season,
  used by the chip and window. Players get the same (current condition is always visible).

### 5.6 Announcement card (decision D3, #6)
- Reuse `TrackerStore._postPoolCard` styling conventions: a compact `glct-chatcard`, tagged with a
  module flag so `renderChatMessageHTML` can style it. Show icon, label, temperature, (optionally)
  effect note; hazard styling when `ominous`. Whisper to GM if weather not player-visible.

### 5.7 Hooks / API
- Add `HOOKS.weatherChanged` to `const.js`; fire from `WeatherStore.save()`.
- Extend `mod.api` with `WeatherEngine`, `WeatherStore`, `WeatherHud`.

### 5.8 Deferred player-nudge hook (decision #15)
- `WeatherEngine.step({ directionModifier = 0 } = {})` already supports the nudge; no UI, no socket
  path, no point economy in v1. Document the extension point in a code comment.

---

## 6. UI

### 6.1 Weather chip (on the existing top-bar HUD) — decision #5, #6, #7, #19
- Add a chip element into `templates/hud.hbs` next to the event chip; build/repaint it from
  `GlctHud` using the same imperative repaint approach (don't full-rerender on every tick).
- Contents: small **PixiJS canvas** (the diorama), the condition **icon + label**, optional temp.
- **Localized tint:** apply `tintParticle`/`tintGlow` as a background/box-shadow **scoped to the
  chip element only** via chip-local CSS custom properties (e.g. `--glct-weather-tint`). **Do not**
  modify the shift-driven HUD variables — the rest of the bar stays shift-colored.
- **Hazard:** when `ominous`, add a class that reuses the hazard dread pulse (see `styles/hud.css`
  hazard/bad-clock rules) + a small hazard marker.
- **Pixi lifecycle (decision D4):** one `PIXI.Application` (or shared renderer) sized to the chip;
  swap the particle emitter when `kind/archetype/tints/intensity` change; **stop the ticker** when
  the HUD is collapsed/hidden or `document.hidden`; destroy on HUD close. Keep particle counts
  small (it's a tiny canvas) and respect `prefers-reduced-motion`.
- Click the chip → open the Hex Flower window.
- Hidden entirely when `!weatherEnabled` or no flower configured (decision D1).

### 6.2 Hex Flower window — decision #5, #16
- New frameless/positioned `ApplicationV2` modeled on `TrackerHud` (draggable; client-scoped
  position setting `weatherHudPosition`). Opened via chip click, `Alt+W`, or a scene-control button.
- Renders the 19 hexes (SVG or a Pixi/canvas surface) using `HEX_LAYOUT`. Current hex **glows**;
  on a step, **animate the marker hex-to-hex** along the chosen direction.
- **History strip** of recent conditions (icons) — visible to players.
- **GM controls:** Roll now (right-click = rewind), force-set current hex, open editor, toggle
  player flower visibility.
- **Player view:** read-only; shows the **full flower only if** the world setting
  `weatherPlayerFlowerVisible` is on, otherwise just current condition + history.

### 6.3 Visual editor + presets + JSON I/O — decision #13, #14
- New editor `ApplicationV2` + Settings menu (`registerWeatherMenu()`), modeled on
  `calendar-editor.js` / `calendar-editor.hbs`.
- **Per-hex editing:** click a hex in a rendered flower → form for label/icon/description/
  temperature/effectNote + the **effect spec** (archetype/kind dropdown, intensity slider, two
  color pickers for particle+glow, drift, ominous toggle) with a **live preview** of the Pixi effect.
- **NH editor (per season):** assign each roll-total to a direction; per-face **edge-rule** toggles
  (wrap/stay/divert); dice-system selector (2d6 / d6+d8); a **live trend/probability preview**
  (compute the % per direction from the dice distribution — see the Cookbook's probability section).
- **Season tabs:** edit each season's flower + NH; set the climate's `defaultNav` and `startHexIndex`.
- **Presets dropdown** (Temperate, Homage) + **Import/Export JSON** (reuse calendar editor's I/O).
- Validate on import: 19 hexes per season, indices `0..18` unique, valid direction keys, colors.

---

## 7. Settings to register (`scripts/settings.js`, keys in `const.js` `SETTINGS`)

| Key | Scope | Type | Default | Purpose | onChange |
| --- | --- | --- | --- | --- | --- |
| `weatherEnabled` | world | Boolean | **false** | master opt-in (config:true) | repaint chip/window |
| `weather` | world | Object | `{schemaVersion:1, regions:{default:{…}}}` | full config + live state (§4.5), config:false | `WeatherHud.refresh()` + chip repaint + fire hook |
| `weatherCadenceMode` | world | String | `"auto"` | `auto`\|`manual` (config:true) | — |
| `weatherCadencePeriod` | world | String | `"day"` | `day`\|`days:N`\|`shift` (config:true or in menu) | — |
| `weatherPlayerFlowerVisible` | world | Boolean | false | reveal flower to players (config:true) | `WeatherHud.refresh()` |
| `weatherHudPosition` | client | Object | `{}` | window position | — |
| `weatherHudHidden` | client | Boolean | false | window hidden on this client | — |

Register a **Weather settings menu** (`registerWeatherMenu()`) that opens the visual editor,
alongside the existing calendar/events/shift-names menus.

---

## 8. File plan (new + touched)

```
scripts/
  const.js                      (EDIT: + HOOKS.weatherChanged, + SETTINGS.weather*, + WEATHER consts/archetypes)
  settings.js                   (EDIT: register weather settings + registerWeatherMenu())
  module.js                     (EDIT: open WeatherHud on ready; day-rollover auto-step in updateWorldTime;
                                        scene-control button; Alt+W keybinding; api += weather; tag weather chat msg)
  weather/
    hex-geometry.js             (NEW: HEX_LAYOUT — 19 indices, neighbors per direction, wrap targets, pixel centers)
    presets.js                  (NEW: TEMPERATE + HOMAGE climates; PRESETS map + DEFAULT)
    engine.js                   (NEW: WeatherEngine — step, cadence math, season remap, rewind, getCurrent, card)
    weather-store.js            (NEW: WeatherStore — reads/writes/sanitize/save→hook, GM-authoritative)
    effects.js                  (NEW: Pixi archetype emitters; create/update/destroy; ticker pause; tinting+blend)
  apps/
    weather-hud.js              (NEW: the Hex Flower window — render flower, walk animation, history, GM controls)
    weather-editor.js           (NEW: visual editor + NH editor + presets + JSON I/O + registerWeatherMenu)
templates/
  weather-hud.hbs               (NEW)
  weather-editor.hbs            (NEW)
  hud.hbs                       (EDIT: add the weather chip slot)
styles/
  hud.css                       (EDIT: weather chip, local tint vars, hazard reuse, window + editor styles)
  weather.css                   (OPTIONAL NEW: if you prefer to keep weather styles separate; add to module.json styles[])
lang/
  en.json                       (EDIT: + GLCT.weather.* keys — chip, window, editor, settings, card, presets)
module.json                     (EDIT if adding weather.css to styles[]; templates/lang already hot-reload)
docs/
  weather-system-spec.md        (THIS FILE)
```

---

## 9. Build order (suggested vertical slices)

Each slice should leave the module loadable and the existing calendar/tracker features untouched.

1. **Topology + data + store.** `hex-geometry.js`, `const.js` consts, `weather-store.js`,
   `settings.js` registration (feature still invisible). Unit-reason the neighbor/wrap tables.
2. **Engine core.** `engine.js`: `getCurrent`, single `step` (real Roll, direction map, edge
   rules, history push/pop), season remap. Drive it from a temporary macro/console to verify walks.
3. **Cadence wiring.** `module.js` day-rollover auto-step (period, cap, digest, rewind, primary-GM
   guard, manual mode).
4. **Chip (static first).** Render condition icon/label/temp + local tint + hazard on the HUD;
   then add the **Pixi effects** (`effects.js`) with archetypes + two-color tint + ticker pause.
5. **Flower window.** `weather-hud.js` + template: render flower, glow, walk animation, history,
   GM controls, `Alt+W`, scene-control button, player read-only mode + visibility setting.
6. **Announcement card.** Change-only posts, digest for skips, hazard styling, whisper logic.
7. **Editor + presets + JSON I/O.** `weather-editor.js`, `presets.js` (Temperate + Homage),
   `registerWeatherMenu()`, validation.
8. **Polish.** `prefers-reduced-motion`, performance pass, i18n sweep, README section,
   `mockups/` optional concept page (the repo keeps HTML mockups).

---

## 10. Acceptance checklist

- [ ] With `weatherEnabled = false`, the module behaves exactly as today (no chip, no window, no hooks firing).
- [ ] Enabling weather + applying the Temperate preset shows a weather chip with a live, tinted Pixi effect.
- [ ] Advancing the in-game day (auto mode) walks the flower once and updates chip + window + posts a card on change.
- [ ] Advancing several days at once walks N steps (capped) and posts a single digest, not N cards.
- [ ] Rewinding time across a day boundary pops history and restores the prior condition.
- [ ] Manual mode: no auto-steps; Roll-now rolls (Dice So Nice shows), right-click rewinds.
- [ ] Crossing into a new season swaps to that season's flower+NH, keeping the position by coordinate.
- [ ] Acid rain (streaks + green) and crimson lightning (flashes + crimson, additive bloom) render correctly via tint alone.
- [ ] Ominous hexes show the dread pulse on the badge and a hazard marker on the chip + card.
- [ ] Players see current condition + history but NOT the flower, unless `weatherPlayerFlowerVisible` is on.
- [ ] Editor: edit a hex, edit the NH per season with live trend preview, import/export JSON round-trips.
- [ ] Pixi canvas stops its ticker when the HUD is collapsed/hidden or the tab is backgrounded.
- [ ] All user-facing strings are `GLCT.weather.*` i18n keys; works on Foundry v13 and v14.
- [ ] Multi-GM table: only the primary active GM executes auto-steps (no double-stepping).

---

## 11. Explicit non-goals (v1)

- Per-scene / per-region weather (state is keyed for it, but only `default` is used).
- Player-facing nudge-points economy/UI (engine hook exists; UI deferred).
- Scene-wide weather FX, canvas particle layers, or ambient audio (effect is **chip-local only**).
- Terminal events / competing flowers / hunter minigames (engine shouldn't forbid, but weather is Class I infinite).
- Structured wind/visibility simulation fields (temperature + free-form note only).
- A second climate-pack of presets (Arid/Arctic/Tropical) — community can author via JSON import.

---

## 12. Post-v1 additions (schemaVersion 2)

Three features were added after the initial build, re-verified against the *Hex
Flower Cookbook v2* (the disallowed-face / wild-card-jump / diversion rules).
The `weather` setting migrates automatically on first sanitise.

### 12.1 Per-hex blocked faces (`disallow`) — the cookbook's red Ø
- Each hex gains an optional `disallow: [<direction>...]` array. Rolling a blocked
  direction **stays in the current hex** — it **takes precedence over `edgeRules`**
  and fires whether or not the face leaves the flower (the cookbook draws the red
  Ø per-hex-per-face, so this is hex-scoped, unlike the NH's global `edgeRules`).
- Applied in `WeatherEngine.resolveStep` (looks up the *from* hex's `disallow`).
- Defaults (set in `presets.js`, retunable in the editor): hex **7** (extreme top)
  blocks `up, upperRight, upperLeft`; hex **11** (start/bottom) blocks `down`.
- Editor: per-hex face checkboxes + a red **Ø** badge on blocking tiles. Import is
  validated (`invalidDisallow`). Sanitised in `WeatherStore._sanitizeHex`.

### 12.2 Multiple regions (independent ticking)
- The `regions` map (already keyed in v1) now holds **many** regions; a top-level
  `activeRegion` key names the one that drives the HUD + chat. `WeatherStore`
  resolves `region()` via `activeRegionKey()` (validated, falls back to the first).
- **All regions tick independently** in `WeatherEngine._evaluate` (one
  `_evaluateRegion` per region, mutating in-memory, a single save). **Only the
  active region announces** in chat; the rest evolve silently, so a swap reveals
  that locale's own weather. Manual `step`/`setCurrent`/`rewind` act on the active
  region.
- Store API: `regionList`, `regionByKey`, `regionConfigured`, `setActiveRegion`,
  `addRegion`, `duplicateRegion`, `renameRegion`, `deleteRegion` (never the last).
- UI: GM region switcher in the Hex Flower window header (`[data-regionbar]`,
  select + quick-add); a region-management bar in the editor (select + new /
  duplicate / rename / delete). The editor edits one region at a time
  (`_regionKey`), independent of which region is active; switching commits valid
  pending edits first.

### 12.3 Per-region seasonal toggle (`climate.seasonal`)
- `climate.seasonal` (boolean) — `true`: follow the calendar season (per-season
  flower + NH, with season remap on change); `false`: a **single flower for all
  time** (calendar season ignored; `WeatherEngine.seasonKeyForRegion` pins the
  first season key, and season remap is skipped). Migration defaults it by whether
  the climate defines >1 season (`presets.isClimateSeasonal`).
- Shipped presets: Temperate `seasonal: true`, Homage `seasonal: false`.
- Editor: a "Follows seasons" checkbox + a live hint; round-trips through JSON
  export/import.

### 12.4 Authoring skill
- `.claude/skills/weather-hexflower-author/SKILL.md` — a self-contained reference
  (topology, NH dice rules, edge/blocked/divert rules, seasonal/regions, the full
  `climate` JSON schema, archetypes/kinds, validation checklist) so an LLM can
  generate a valid importable climate.

### 12.5 3D dice on weather rolls (`weatherShowDice`)
- World setting **"Roll 3D Dice for Weather"** (Boolean, default **on**). When on
  and the **Dice So Nice!** module is installed, the Navigation-Hex roll is thrown
  as real, synchronized 3D dice so the whole table sees the weather roll.
- Scope: **manual** steps and **single-period auto advances** only. A multi-day
  skip (`steps > 1`) and any **background (non-active) region** roll stay silent —
  the engine never plays a flood of sequential animations.
- The NH formula drives the dice: `2d6` (default) or `1d6 + 1d8`. Implemented in
  `WeatherEngine.rollDie({ show })`, gated by `WeatherStore.showDice`; callers pass
  `show` (manual: `step()`; auto: `isActive && steps === 1`). Roll totals/topology
  are unchanged — this is presentation only.
