---
name: weather-hexflower-author
description: Author importable JSON "climates" for the GL Universe — Clocks & Tracker Foundry VTT weather system (a Goblin's Henchman Hex Flower engine). Use when a user wants to design, generate, or validate a weather Hex Flower — a 19-hex flower of weather conditions, its Navigation Hex dice rules, edge/blocked-face rules, per-season variants, and the particle effect of each condition — to import via the module's Weather Editor.
---

# Weather Hex Flower — JSON Authoring Skill

This skill teaches an LLM to generate a **valid `climate` JSON file** that imports
into the **GL Universe — Clocks & Tracker** Foundry module's Weather Editor
(Settings → *Edit Weather* → the **Import** ⬆ button). The weather engine is a
Goblin's Henchman **Hex Flower Game Engine (HFGE)**: a fixed 19-hex "flower" of
weather outcomes, plus a **Navigation Hex (NH)** that rolls dice and walks a
marker one hex per period of in-game time.

Produce **one climate object** (the unit the Import button accepts). Output it as
a single JSON file the user can save and import. Nothing else is required.

---

## 1. The mental model (read this first)

- The **flower** is **19 hexes** in a diamond. Each hex = **one weather
  condition** (label, icon, description, temperature, particle effect).
- Conditions are arranged so **severity rises toward the top** and **calms toward
  the bottom**. Similar weather sits adjacent, so the walk drifts smoothly
  (clear → cloudy → rain → storm), never teleporting from sun to blizzard.
- Each period (default: one in-game day) the **Navigation Hex** rolls dice; the
  total maps to one of **6 directions**; the marker steps one hex that way.
- The **bias lives entirely in the NH's `directionMap`** — make "down" (toward
  calm) common and "up" (toward extreme) rare for a gentle climate; invert for a
  harsh one.
- **Edges:** if a step would leave the flower it **wraps** to the opposite edge
  (a little chaos), unless that face is **blocked** (`stay`) or **diverted** to a
  chosen hex.
- A climate can be **seasonal** (a different flower + NH per calendar season) or a
  **single flower for all time** (`seasonal: false`).

---

## 2. The 19-hex topology (fixed — never changes)

Indices `0..18` are **canonical and fixed**. They identify the same cell across
every season and the live position. You author the *contents* of each index, not
the geometry. The diamond, by index (top = severe, bottom = calm):

```
                [7]                  ← top tip: the EXTREME hazard
            [3]     [12]
        [0]     [8]     [16]
            [4]     [13]
        [1]     [9]     [17]         ← [9] = dead-centre WILDCARD ("other") hex
            [5]     [14]
        [2]     [10]     [18]
            [6]     [15]
                [11]                 ← bottom tip: the START hex (calmest)
```

**Severity tiers by index** (a good default gradient — you may retune):

| Tier | Indices | Meaning |
| --- | --- | --- |
| extreme | 7 | the single worst condition (storm, blizzard…) |
| strong | 0, 3, 8, 12, 16 | near-extreme (heavy rain, high wind…) |
| moderate | 1, 4, 13, 17 | middling (rain, fog…) |
| mild | 2, 5, 10, 14, 18 | light (clouds, drizzle…) |
| calm | 6, 11, 15 | gentle/clear |
| wildcard | 9 | rare "other" (centre) — a twist not on the main scale |

- **Start hex = 11** (bottom tip): the walk begins here and "reset" returns here.
- **Extreme hex = 7** (top tip): often ring-fenced by a "collar" of `strong`
  hexes (8, 12, 3) so the worst weather is telegraphed, not abrupt.
- **Centre hex = 9**: a wildcard — a rare odd event (e.g. eerie calm, freak fog,
  an omen) distinct from the main severity scale.

### The 6 directions

`up, upperRight, lowerRight, down, lowerLeft, upperLeft`

`up` moves toward the extreme (index 7); `down` toward calm (index 11). Diagonals
move between columns. You never compute neighbours yourself — just choose which
roll totals point which way.

---

## 3. The Navigation Hex (the dice rules)

```jsonc
{
  "dice": "2d6",            // "2d6" (default) or "d6+d8"
  "directionMap": {         // roll TOTAL (as a string) → a direction key, or "stay"
    "2": "down", "3": "down",
    "4": "lowerLeft", "5": "lowerLeft",
    "6": "lowerRight", "7": "lowerRight",
    "8": "upperLeft", "9": "upperLeft",
    "10": "upperRight", "11": "upperRight",
    "12": "up"
  },
  "edgeRules": {            // what happens when a step leaves the flower, per face
    "up": "wrap", "upperRight": "wrap", "lowerRight": "wrap",
    "down": "wrap", "lowerLeft": "stay", "upperLeft": "stay"
  }
}
```

- **`dice`**: `"2d6"` → totals **2–12** (bell curve: 7 most common). `"d6+d8"` →
  totals **2–14**, flatter; with d6+d8 a total of **9 commonly means "stay"**.
- **`directionMap`**: cover **every reachable total** for the chosen dice. A
  missing total defaults to `"stay"` (no move). **This is where the trend lives.**
  - *Gentle climate:* give the low/common totals (around 6–8) `down`/`lowerLeft`/
    `lowerRight`; reserve `up` for a rare extreme (2 or 12).
  - *Harsh climate:* point the common totals `up`/`upperLeft`/`upperRight`.
- **`edgeRules`** (per direction, only fires when a move exits the flower):
  - `"wrap"` — jump to the opposite edge along the same row/column (default;
    injects chaos).
  - `"stay"` — blocked; remain in the current hex.
  - `{ "divert": 9 }` — go to a specific hex index instead.

### Probability of 2d6 totals (for tuning the trend)
2→1/36, 3→2/36, 4→3/36, 5→4/36, 6→5/36, **7→6/36**, 8→5/36, 9→4/36, 10→3/36,
11→2/36, 12→1/36. Totals near 7 are far more likely — put the *intended common
drift* there.

---

## 4. Per-hex blocked faces (`disallow`) — the cookbook's red Ø

Any hex may **block specific faces**. Rolling a blocked direction = **stay in the
current hex** (it takes precedence over `edgeRules`). This caps the walk at the
extremes so it can't run away:

```jsonc
{ "index": 7,  "disallow": ["up", "upperRight", "upperLeft"], ... }  // extreme: can't escalate further
{ "index": 11, "disallow": ["down"], ... }                          // start/calm: can't fall off the gentle bottom
```

- `disallow` is an **array of direction keys** (subset of the six). Omit or use
  `[]` for none.
- **Recommended defaults:** block `up, upperRight, upperLeft` on **7**, and
  `down` on **11**. Add more if a region should have hard floors/ceilings.

---

## 5. A weather condition (one hex)

```jsonc
{
  "index": 7,                                   // 0..18 — REQUIRED, unique per season
  "label": "Thunderstorm",                      // shown on chip/window/card
  "icon": "fa-solid fa-cloud-bolt",             // a Font Awesome class (free solid set)
  "description": "Lightning splits the sky; thunder rolls close behind.",
  "temperature": "Cold",                        // free text (band or °) — display only
  "effectNote": "Disadvantage on ranged attacks; open flames gutter.",  // GM-only mechanical note (optional)
  "disallow": ["up", "upperRight", "upperLeft"],// blocked faces (optional)
  "effect": {                                   // the animated particle look (§6)
    "archetype": "flashes",
    "kind": "storm",
    "intensity": 0.82,
    "tintParticle": "#b3c0d8",
    "tintGlow": "#e6edff",
    "drift": "fall",
    "ominous": true
  }
}
```

`label`, `icon`, and `effect` are what players feel most. `description`/
`temperature` are flavour; `effectNote` is GM-facing.

---

## 6. The particle effect (`effect`)

The look is **composable**: a motion **archetype** × **two tint colours** ×
intensity × drift. Fantasy weather is just an archetype + tint — no new art.

```jsonc
{
  "archetype": "streaks",     // see table below — REQUIRED
  "kind": "acid-rain",        // optional: a named library preset this derives from (label only)
  "intensity": 0.7,           // 0..1 — particle density + speed
  "tintParticle": "#a6e22e",  // primary particle colour (#rrggbb)
  "tintGlow": "#3a5f00",      // secondary glow/accent colour (#rrggbb)
  "drift": "fall",            // fall | rise | left | right | still
  "ominous": false            // true → hazard dread pulse on chip/card/marker
}
```

### Archetypes (the only valid `archetype` values — 21)

The first nine are the core weather motions; the rest are an expanded shared set
(also used by Delving Mode) for fantasy/eldritch conditions. **Any** of the 21 is
valid here.

| Archetype | Motion | Good for (via tint) |
| --- | --- | --- |
| `clear` | faint shimmer / nothing | clear skies |
| `streaks` | fast diagonal falling lines | rain, heavy rain, **acid rain** (green), **blood rain** (red) |
| `flakes` | slow drifting crystals (`drift: fall`/`rise`) | snow, blizzard, **ashfall** (grey, rise), petals |
| `volume` | soft drifting banks/blobs | fog, cloud, smoke, **miasma**, **arcane mist** |
| `flashes` | strobe + lightning bolt (additive) | thunderstorm, **crimson lightning** |
| `motes` | floating sparkles, gentle brownian (additive) | spores, pollen, fireflies, **arcane dust** |
| `embers` | rising glowing sparks (additive) | **ember storm**, cinders, firestorm |
| `gusts` | horizontal driven streaks | wind, **sandstorm** (tan), driving rain |
| `shards` | fast hard falling chips | hail, sleet, debris, **meteor shower** |
| `shadow` | dark soft masses pulsing at the edges | gloom, closing dark, dread |
| `creep` | spreading rot rising from below | blight, corruption, encroaching mould |
| `spores` | glowing spores hanging in the air | fungal blooms, pollen storms |
| `miasma` | heavy sickly low haze | poison fog, plague wind, swamp gas |
| `static` | fast flickering speckle | unreality, signal-storm, wild magic |
| `swarm` | erratic drifting swarm | locusts, bats, biting insects |
| `drips` | slow oozing drips | wet caverns, rot, weeping skies |
| `bubbles` | rising bubbles | flooding, brine, geothermal vents |
| `runes` | glowing glyph-motes pulsing in place | arcane storms, ley surges |
| `void` | distant twinkling void / stars | aurora, starfall, eldritch night |
| `dust` | fine grains drifting sideways | dust storms, dry decay, drought haze |
| `ripples` | rising water lines | flood tides, rising water |

`drift` values: `fall, rise, left, right, still`. (Blend mode is automatic:
additive for the glowing archetypes — `flashes`/`motes`/`embers`/`spores`/
`runes`/`void` — normal otherwise.)

### Library "kinds" (handy presets — set `kind` + copy these defaults)

Mundane: `clear, clouds, fog, rain, heavy-rain, storm, wind, snow, blizzard,
hail, sand`.
Fantasy: `acid-rain, blood-rain, ashfall, ember-storm, arcane-mist, spore-bloom,
aurora, miasma, meteor-shower, crimson-lightning`.

`kind` is **optional metadata** (helps the UI label things). The actual visuals
come from `archetype` + tints + intensity + drift, so you can invent any
condition without a matching kind. Pick FA icons from the free **solid** set
(e.g. `fa-solid fa-cloud-rain`, `fa-solid fa-snowflake`, `fa-solid fa-wind`,
`fa-solid fa-meteor`, `fa-solid fa-volcano`, `fa-solid fa-hat-wizard`).

---

## 7. The full climate object (what you output)

```jsonc
{
  "id": "custom",                 // "custom" for hand-authored climates
  "name": "Stormcoast",           // climate name (shown in the editor)
  "seasonal": true,               // true = per-season flowers (below); false = single flower for all time
  "startHexIndex": 11,            // where the walk begins / resets (usually 11)
  "defaultNav": { /* §3 NH */ },  // used by any season lacking its own "nav"
  "seasons": {
    // Keys are the world calendar's SEASON INDEX as a string.
    // The shipped Temperate calendar order is: "0":Winter, "1":Spring, "2":Summer, "3":Autumn.
    "0": { "name": "Winter", "nav": { /* §3 */ }, "hexes": [ /* exactly 19 hexes, §5 */ ] },
    "1": { "name": "Spring", "nav": { /* §3 */ }, "hexes": [ /* 19 */ ] },
    "2": { "name": "Summer", "nav": { /* §3 */ }, "hexes": [ /* 19 */ ] },
    "3": { "name": "Autumn", "nav": { /* §3 */ }, "hexes": [ /* 19 */ ] }
  }
}
```

**Seasonal vs single-flower:**
- `seasonal: true` → provide one entry in `seasons` **per calendar season** you
  want to differ. A season without its own `nav` falls back to `defaultNav`. A
  season with no entry falls back to the first defined season's flower.
- `seasonal: false` → provide **one** season entry (e.g. `"0": { "name": "All
  Year", ... }`). The calendar season is ignored; that single flower is always
  used. Ideal for "this region's weather doesn't change with the seasons".

> **Regions:** the module supports multiple weather **regions**, each with its own
> climate, swappable in the GM HUD. You author **one climate** here; the GM imports
> it into whichever region they're editing. You do not need to produce a regions
> wrapper.

---

## 8. Hard rules — a climate is INVALID unless all hold

1. **Exactly 19 hexes** in every season's `hexes` array.
2. Every hex `index` is an **integer 0–18, unique** within its season (cover all
   of 0..18 exactly once).
3. Every `effect.archetype` is one of the §6 archetypes.
4. Every direction in any `directionMap` value is one of the six keys **or**
   `"stay"`.
5. Every `disallow` entry (if present) is one of the six direction keys.
6. `tintParticle` / `tintGlow` are `#rrggbb` hex strings.
7. `intensity` is a number 0–1; `drift` is one of `fall|rise|left|right|still`.
8. `edgeRules` values are `"wrap"`, `"stay"`, or `{ "divert": <0..18> }`.
9. `startHexIndex` is 0–18 (use 11 unless you have a reason).

(The importer also sanitises on load, but generate valid data — don't rely on it.)

---

## 9. Design guidance (make it *good*, not just valid)

- **Lay severity along the vertical axis:** extreme at 7, calm at 6/11/15, mild
  mid-low, strong mid-high. Keep neighbours similar so transitions read naturally.
- **Collar the extreme:** make 8, 12, 3 a ring of `strong` weather around 7 so a
  storm builds before it breaks.
- **Use the wildcard (9)** for a memorable rare event — an unnatural calm, a freak
  fog, an omen — not just "more of tier moderate".
- **Tune the trend with the NH, not the flower.** A calm climate's NH sends the
  common totals (6–8) toward `down`/`lower*`; a harsh one sends them `up`/`upper*`.
- **Block the extremes** so the walk can't escape: `disallow ["up","upperRight",
  "upperLeft"]` on 7 and `["down"]` on 11. Add `divert`/`stay` edge rules to fence
  off jarring wrap jumps.
- **Seasonal climates:** shift the whole palette — Winter's "moderate" might be
  snow where Summer's is a dry haze. Reuse indices; change labels/effects/tints.
- **Tints:** pick a particle colour and a darker/brighter glow that read at a
  glance (e.g. rain `#9cc0e6`/`#3a5f8a`; snow `#ffffff`/`#bcd4e6`; acid `#a6e22e`/
  `#3a5f00`). Set `ominous: true` only for genuinely dangerous hexes.

---

## 10. Minimal worked example (single-flower, abbreviated)

A non-seasonal "English weather" climate. (Shown with 4 of the 19 hexes for
brevity — **a real file must list all 19.**)

```json
{
  "id": "custom",
  "name": "Drizzly Isles",
  "seasonal": false,
  "startHexIndex": 11,
  "defaultNav": {
    "dice": "2d6",
    "directionMap": {
      "2": "down", "3": "down", "4": "lowerLeft", "5": "lowerLeft",
      "6": "lowerRight", "7": "lowerRight", "8": "upperLeft", "9": "upperLeft",
      "10": "upperRight", "11": "upperRight", "12": "up"
    },
    "edgeRules": {
      "up": "wrap", "upperRight": "wrap", "lowerRight": "wrap",
      "down": "wrap", "lowerLeft": "stay", "upperLeft": "stay"
    }
  },
  "seasons": {
    "0": {
      "name": "All Year",
      "hexes": [
        { "index": 7, "label": "Thunderstorm", "icon": "fa-solid fa-cloud-bolt",
          "description": "Lightning splits the sky.", "temperature": "Cold",
          "effectNote": "Open flames gutter.", "disallow": ["up","upperRight","upperLeft"],
          "effect": { "archetype": "flashes", "kind": "storm", "intensity": 0.82,
                      "tintParticle": "#b3c0d8", "tintGlow": "#e6edff", "drift": "fall", "ominous": true } },
        { "index": 9, "label": "Eerie Calm", "icon": "fa-solid fa-smog",
          "description": "An unnatural stillness settles in.", "temperature": "Cool", "effectNote": "",
          "disallow": [],
          "effect": { "archetype": "volume", "kind": "fog", "intensity": 0.7,
                      "tintParticle": "#dde2e9", "tintGlow": "#9aa3b0", "drift": "left", "ominous": false } },
        { "index": 10, "label": "Drizzle", "icon": "fa-solid fa-cloud-rain",
          "description": "A fine rain beads on everything.", "temperature": "Cool", "effectNote": "",
          "disallow": [],
          "effect": { "archetype": "streaks", "kind": "rain", "intensity": 0.45,
                      "tintParticle": "#9cc0e6", "tintGlow": "#3a5f8a", "drift": "fall", "ominous": false } },
        { "index": 11, "label": "Clear", "icon": "fa-solid fa-sun",
          "description": "Open skies; excellent visibility.", "temperature": "Mild", "effectNote": "",
          "disallow": ["down"],
          "effect": { "archetype": "clear", "kind": "clear", "intensity": 0.3,
                      "tintParticle": "#cfe8ff", "tintGlow": "#7fb4e6", "drift": "still", "ominous": false } }
        /* … indices 0,1,2,3,4,5,6,8,12,13,14,15,16,17,18 — fill ALL 19 … */
      ]
    }
  }
}
```

---

## 11. Output checklist (run before returning the JSON)

- [ ] One climate object; valid JSON (no comments, no trailing commas).
- [ ] `seasonal` set; `seasons` has the right entries (1 if not seasonal).
- [ ] **Each** season's `hexes` has **all 19** indices 0–18, unique.
- [ ] Every hex has `label`, `icon`, and a valid `effect` (archetype + 2 hex tints).
- [ ] `directionMap` covers every reachable dice total; values are valid directions/`stay`.
- [ ] `disallow` arrays (incl. defaults on 7 and 11) use valid direction keys.
- [ ] Severity gradient is coherent and neighbours are similar.
- [ ] `startHexIndex` present (11 unless intentional).

Return the file as a single fenced ```json block the user can save as
`my-climate.json` and import via **Edit Weather → Import**.
