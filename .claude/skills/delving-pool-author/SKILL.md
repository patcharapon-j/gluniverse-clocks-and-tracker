---
name: delving-pool-author
description: Author importable JSON for "Delving Mode" in the GL Universe — Clocks & Tracker Foundry VTT module — a turn-based exploration mode whose HUD trades the clock for a turn counter and a degrading atmosphere. Use when a user wants to design, generate, or validate a delving config — one or more resources (torches, corruption, air, sanity…), each a chain of worsening stages, every stage owning a dwindling dice pool and a particle "diorama" effect, plus the turn cadence and weather coupling — to import via the module's Delving Editor.
---

# Delving Pool — JSON Authoring Skill

This skill teaches an LLM to generate a **valid delving config JSON** that imports
into the **GL Universe — Clocks & Tracker** module's Delving Editor
(Settings → *Edit Delving* → the **Import** button). **Delving Mode** is a
presentation mode for dungeon crawls, long marches, sieges — any tense passage
counted in *turns* rather than the wall clock. While it's live the HUD swaps the
clock for a **turn counter** and the **featured resource's degrading
atmosphere** (a particle diorama that worsens as the party burns the resource
down). Game time still advances under the hood; each turn the GM presses *Pass
Turn* and every resource's pool is rolled.

Produce **one config object** (the unit the Import button accepts). Output it as a
single JSON file the user can save and import. Nothing else is required.

---

## 1. The mental model (read this first)

- A **resource** is something the party spends down over a delve — torchlight,
  air, sanity, a creeping corruption, the structural integrity of a sinking ship.
  A config holds **one or more** resources rolled together each turn.
- A resource is an **ordered chain of stages**, each *worse* than the last (Lit →
  Guttering → Smothered → Darkness). The party starts on stage 0.
- **Each stage owns its own dice pool** `{ size, count, discard }` and a visual
  **effect** (the particle look the HUD paints while that stage is current).
- **Every turn the current stage's pool is rolled** (`count` dice of `dN`). Dice
  that land **≤ discard are dropped**; the survivors become the new pool. When the
  pool is **wiped to zero**, the resource **shifts to the next, worse stage** and
  refills to that stage's `count`. On the **final** stage a wipe just clamps at 0
  and the resource is **ended** (see §7) — its worst atmosphere persists.
- So the dice pool is a **dread timer**: it drifts down, occasionally collapses a
  whole stage at once, and the diorama darkens with it. `discard` is the dial —
  higher discard = faster collapse.
- One resource is **featured**: it drives the HUD's big readout and the
  full-width atmospheric diorama. The others ride along as small chips.
- Optionally, **weather steps every N turns** (delving drives the weather Hex
  Flower instead of the time-of-day cadence while it's live).

---

## 2. The config object (what you output)

The Import button reads exactly these four keys (it requires `resources` to be an
array; the rest are optional and fall back to sane defaults):

```jsonc
{
  "turn": { "unit": "stretch", "count": 1, "label": "Turn" },  // §3 — the turn cadence
  "weatherEveryTurns": 0,        // §4 — roll weather every N turns (0 = never)
  "featuredId": "torches",       // §5 — which resource drives the HUD (a resource id)
  "resources": [ /* §5 one or more resources */ ]
}
```

> The editor's **Export** produces this exact shape, so a round-trip is lossless.
> Live session state (turn counter, history, the `active` flag) is **not** part of
> an authored file — the module owns it. Don't include `active`, `turnsElapsed`,
> `turnsSinceWeather`, or `history`.

---

## 3. The turn cadence (`turn`)

Each *Pass Turn* advances game time by `count × unit` and rolls every resource.

```jsonc
{ "unit": "stretch", "count": 1, "label": "Turn" }
```

- **`unit`** — one of `stretch · hour · shift · day · week · month`. A *stretch* is
  the module's sub-hour beat (≈ a "dungeon turn"); pick `stretch` or `hour` for a
  classic crawl, `day` for an overland march, `week`/`month` for a long siege.
- **`count`** — `1..99` units per turn.
- **`label`** — what the HUD calls a turn (≤24 chars): `"Turn"`, `"Watch"`,
  `"Stretch"`, `"League"`, `"Day"`. Display only.

---

## 4. Weather coupling (`weatherEveryTurns`)

```jsonc
"weatherEveryTurns": 3   // step the weather Hex Flower once every 3 turns
```

- `0` (default) = delving never touches the weather.
- `> 0` (`1..99`) = every N turns, *Pass Turn* also advances the world's weather
  one hex (and posts the weather card). Only fires if a weather climate is
  configured and enabled. Use it to make long delves drift through conditions.

---

## 5. A resource

```jsonc
{
  "id": "torches",                 // stable id; referenced by featuredId (keep it kebab-ish & unique)
  "name": "Torches",               // ≤60 chars — shown on HUD + card
  "icon": "fa-solid fa-fire",      // a Font Awesome free-solid class
  "endName": "Pitch Black",        // §7 — the name of the depleted/ended state (optional)
  "visibleToPlayers": true,        // false = GM-only (whispered card, hidden from player HUD)
  "stageIndex": 0,                 // starting stage (0 = the first/best). Usually 0.
  "current": 6,                    // starting dice in the pool (usually = stages[stageIndex].count)
  "stages": [ /* 1..12 stages, worst last — §6 */ ]
}
```

- **`id`**: any unique string. Simple slugs (`"torches"`, `"air"`,
  `"corruption"`) are fine and make `featuredId` readable. (If omitted the module
  assigns a random one — but then you can't point `featuredId` at it, so set it.)
- **`current`** should equal the starting stage's `count` for a fresh delve.
- Set **`featuredId`** (top level) to the `id` of the resource that should drive
  the HUD's atmosphere — usually the most evocative one (light, corruption).
- Author **2–5 resources** at most for a readable HUD; one is perfectly fine.

---

## 6. A stage (the pool + the look)

```jsonc
{
  "name": "Guttering",     // ≤40 chars — this stage's name (shown when current)
  "size": 6,               // die size dN — 2..100 (6 is classic)
  "count": 5,              // dice in the pool when this stage begins — 0..50
  "discard": 2,            // dice landing ≤ this are DROPPED each roll — 0..size
  "effect": { /* the particle diorama — §6a */ }
}
```

### The dice mechanic (exactly how a stage burns down)

Each turn, for the **current** stage: roll `current` dice of `d size`; **keep only
dice with a value strictly greater than `discard`**; the kept count becomes the new
pool. With `d6, discard 2` each die survives on a 3–6 (a 4-in-6 ≈ 67% keep rate);
`discard 3` drops on 1–3 (a 50% keep rate, much faster). When the pool hits **0**
the resource advances to the next stage and refills to *its* `count`.

- **Tune the descent with `discard`** (the dread dial), then `count`/`size`:
  - *Slow, grinding burn:* low discard (e.g. `d8 discard 2` ≈ 75% keep).
  - *Fast collapse near the end:* raise discard (`d6 discard 3`) and/or shrink
    `count` on later stages.
- **Stages should get worse as they descend:** later stages typically have
  **smaller `count`**, **higher `discard`**, and a **darker/`ominous` effect**.

### 6a. The effect (the particle diorama)

Identical shape to a weather hex's effect — the look is **archetype × two tint
colours × intensity × drift**, so any atmosphere is just composition, no art.

```jsonc
{
  "archetype": "embers",      // motion archetype — REQUIRED (table below)
  "intensity": 0.5,           // 0..1 — particle density + speed
  "tintParticle": "#ff9a3c",  // primary particle colour (#rrggbb)
  "tintGlow": "#ffd27a",      // secondary glow/accent colour (#rrggbb)
  "drift": "rise",            // fall | rise | left | right | still
  "ominous": false            // true → dread pulse on HUD/card (use for bad stages)
}
```

> `tintGlow` doubles as the resource's **accent** on the chat card dice, so pick a
> colour that reads against dark chat. Crank `intensity` and set `ominous:true` as
> stages worsen.

#### Archetypes (the only valid `archetype` values — 21)

| Archetype | Motion / look | Good for (via tint) |
| --- | --- | --- |
| `clear` | faint shimmer / nothing | safe, untouched |
| `streaks` | fast diagonal falling lines | rain, leaks, bleeding |
| `flakes` | slow drifting crystals | snow, ash, falling debris |
| `volume` | soft drifting banks/blobs | fog, smoke, gas |
| `flashes` | strobe + bolt (additive) | lightning, arcane surges, alarms |
| `motes` | floating sparkles (additive) | dust, spores, fireflies |
| `embers` | rising glowing sparks (additive) | **torchlight**, cinders, firelight |
| `gusts` | horizontal driven streaks | wind, draughts |
| `shards` | fast hard falling chips | hail, falling rock, shrapnel |
| `shadow` | dark soft masses pulsing at the edges | **gloom**, closing dark, dread |
| `creep` | spreading rot rising from below | **corruption**, mould, blight |
| `spores` | glowing spores hanging in the air | fungal caves, infestation |
| `miasma` | heavy sickly low haze | poison gas, swamp air, plague |
| `static` | fast flickering speckle | **signal loss**, interference, unreality |
| `swarm` | erratic drifting swarm | insects, bats, vermin |
| `drips` | slow oozing drips | wet caverns, blood, sap |
| `bubbles` | rising bubbles | flooding, the deep, brewing |
| `runes` | glowing glyph-motes pulsing in place | wards, magic, eldritch script |
| `void` | distant twinkling void / stars | the abyss, deep space, oblivion |
| `dust` | fine grains drifting sideways | dry ruins, sand, decay |
| `ripples` | rising water lines | **rising water**, tides |

`drift` values: `fall · rise · left · right · still`. Blend mode is automatic
(additive for the glowing archetypes). Pick FA icons from the free **solid** set
(`fa-solid fa-fire`, `fa-solid fa-skull`, `fa-solid fa-lungs`, `fa-solid fa-brain`,
`fa-solid fa-water`, `fa-solid fa-radiation`, `fa-solid fa-ghost`).

---

## 7. The ended / terminal state (`endName`)

When a resource is on its **final** stage and the pool empties, it's **ended** —
no more dice to roll. It still sets the mood (the worst stage's atmosphere
persists, intensified), and the HUD/card label it with **`endName`**:

```jsonc
"endName": "Pitch Black"   // Torches → total darkness;  Corruption → "Beyond Saving"
```

- `endName` ≤40 chars. **Optional** — if blank, the ended state falls back to the
  final stage's own `name`. Set it when "the end" deserves its own dreadful title
  ("Pitch Black", "Suffocated", "Lost to Madness", "Sunk").
- You don't author "ended" as a stage — it's the automatic floor of the **last**
  stage. So make your last stage the worst playable state, and let `endName` name
  the point of no return beyond it.

---

## 8. Hard rules — a config is INVALID unless all hold

1. `resources` is a **non-empty array**; each resource has at least **one stage**
   (max **12**).
2. Each resource `id` is a **unique non-empty string**; `featuredId` (if set)
   equals one of them.
3. Every stage `effect.archetype` is one of the **21 §6a archetypes**.
4. `effect.drift` ∈ `fall|rise|left|right|still`; `effect.intensity` is `0..1`;
   `tintParticle` / `tintGlow` are `#rrggbb`.
5. `size` is `2..100`; `count` is `0..50`; `discard` is `0..size` (≤ the die size).
6. `turn.unit` ∈ `stretch|hour|shift|day|week|month`; `turn.count` `1..99`;
   `turn.label` ≤24 chars.
7. `weatherEveryTurns` is `0..99`.
8. `stageIndex` is a valid index into `stages`; `current` is `0..50` (use the
   starting stage's `count`).
9. No live-state keys (`active`, `turnsElapsed`, `turnsSinceWeather`, `history`).

(The importer also sanitises on load, but generate valid data — don't rely on it.)

---

## 9. Design guidance (make it *good*, not just valid)

- **Descend the severity:** name stages as a clear slide (Lit → Guttering →
  Smothered → Darkness). Shrink `count`, raise `discard`, darken the effect, and
  flip `ominous:true` on the back half.
- **Pick the right archetype per beat.** Light → `embers` (warm) fading to
  `shadow`/`void` (cold dark). Taint → `motes`/`spores` → `miasma`/`creep`. Water
  → `drips`/`ripples` → `bubbles`. Match `drift`: `rise` for heat/spores, `fall`
  for ash/rain, `still` for dread, `left/right` for gas.
- **Feature the most cinematic resource** (light or corruption usually). Keep
  secondary resources visually distinct so their chips read at a glance.
- **Calibrate the burn to your turn unit.** A `stretch`-per-turn crawl can afford
  4 stages of ~5–6 dice; a `day`-per-turn march might want fewer, fatter stages.
- **Use `endName` for a gut-punch finish** and reserve the most extreme effect
  (`intensity:1`, `ominous:true`) for the final stage — the ended state pushes it
  further automatically.
- **Hide GM-only pressure** with `visibleToPlayers:false` (a doom the players feel
  but can't see ticking).

---

## 10. Minimal worked example (two resources, complete & valid)

```json
{
  "turn": { "unit": "stretch", "count": 1, "label": "Turn" },
  "weatherEveryTurns": 0,
  "featuredId": "torches",
  "resources": [
    {
      "id": "torches",
      "name": "Torches",
      "icon": "fa-solid fa-fire",
      "endName": "Pitch Black",
      "visibleToPlayers": true,
      "stageIndex": 0,
      "current": 6,
      "stages": [
        { "name": "Lit",       "size": 6, "count": 6, "discard": 2,
          "effect": { "archetype": "embers", "intensity": 0.5,  "tintParticle": "#ff9a3c", "tintGlow": "#ffd27a", "drift": "rise",  "ominous": false } },
        { "name": "Guttering", "size": 6, "count": 5, "discard": 2,
          "effect": { "archetype": "embers", "intensity": 0.42, "tintParticle": "#d8632a", "tintGlow": "#ff9a3c", "drift": "rise",  "ominous": false } },
        { "name": "Smothered", "size": 6, "count": 4, "discard": 3,
          "effect": { "archetype": "shadow", "intensity": 0.55, "tintParticle": "#2a2330", "tintGlow": "#0d0b12", "drift": "still", "ominous": true } },
        { "name": "Darkness",  "size": 6, "count": 4, "discard": 3,
          "effect": { "archetype": "void",   "intensity": 0.8,  "tintParticle": "#1a1626", "tintGlow": "#000000", "drift": "still", "ominous": true } }
      ]
    },
    {
      "id": "corruption",
      "name": "Corruption",
      "icon": "fa-solid fa-skull",
      "endName": "Beyond Saving",
      "visibleToPlayers": true,
      "stageIndex": 0,
      "current": 6,
      "stages": [
        { "name": "Untainted", "size": 8, "count": 6, "discard": 2,
          "effect": { "archetype": "motes",  "intensity": 0.3,  "tintParticle": "#bfe6c0", "tintGlow": "#6fae73", "drift": "rise",  "ominous": false } },
        { "name": "Tainted",   "size": 8, "count": 5, "discard": 2,
          "effect": { "archetype": "spores", "intensity": 0.55, "tintParticle": "#9be15d", "tintGlow": "#2f6b1f", "drift": "rise",  "ominous": false } },
        { "name": "Corrupted", "size": 8, "count": 4, "discard": 3,
          "effect": { "archetype": "miasma", "intensity": 0.7,  "tintParticle": "#8fae5d", "tintGlow": "#3a4a1f", "drift": "left",  "ominous": true } },
        { "name": "Consumed",  "size": 8, "count": 4, "discard": 3,
          "effect": { "archetype": "creep",  "intensity": 0.75, "tintParticle": "#a04bd6", "tintGlow": "#3a0f4a", "drift": "rise",  "ominous": true } }
      ]
    }
  ]
}
```

---

## 11. Output checklist (run before returning the JSON)

- [ ] One config object; valid JSON (no comments, no trailing commas).
- [ ] `resources` non-empty; each has a **unique string `id`** and **1–12 stages**.
- [ ] `featuredId` (if set) matches a resource `id`.
- [ ] Every stage has `name`, `size` (2–100), `count` (0–50), `discard` (0–size),
      and a valid `effect` (one of the 21 archetypes + two `#rrggbb` tints +
      `drift` + `intensity` 0–1).
- [ ] Stages **descend** in severity (count↓ / discard↑ / effect darkens /
      `ominous` on the worst); the last stage is the worst playable state.
- [ ] `turn.unit`/`count`/`label` valid; `weatherEveryTurns` 0–99.
- [ ] `stageIndex` valid; `current` = starting stage's `count`.
- [ ] `endName` set where the ending deserves a title (else omitted/blank).
- [ ] No live-state keys (`active`, `turnsElapsed`, `turnsSinceWeather`, `history`).

Return the file as a single fenced ```json block the user can save as
`my-delve.json` and import via **Edit Delving → Import**.
