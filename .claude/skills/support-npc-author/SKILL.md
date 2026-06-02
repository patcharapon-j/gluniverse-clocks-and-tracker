---
name: support-npc-author
description: Author importable JSON for a "support NPC" in the GL Universe — Clocks & Tracker Foundry VTT module's Mission Support System (the Comms-Coin HUD + support roster). Use when a user wants to design, generate, or validate a support NPC — a party asset with a level, an availability pool, four ability cards (passive / radio / field-combat / field-exploration), and a bundled PF2e passive Effect item — to import via the Support Editor's Import JSON button. The NPC's numbers compute from its level via PF2e creature-building benchmarks, so you never hand-pick attack/DC values.
---

# Support NPC — JSON Authoring Skill

This skill teaches an LLM to generate a **valid support bundle JSON** that imports
into the **GL Universe — Clocks & Tracker** module's Support Editor
(Settings → *Open Support Editor* → the **Import JSON** button). A "support" is a
party asset — a contact on the radio, a field medic, an extraction driver — that
the GM keeps on a roster and activates one-per-mission. It is **not** a Foundry
actor: it has no sheet, no tokens of its own. Instead it carries:

- a **level** + per-ability **proficiency tiers** → all numbers are computed from
  PF2e's *Building Creatures* benchmark tables (so you never pick a raw `+17`);
- an **availability pool** of d6s that Field Calls burn down;
- **four ability cards** (passive, radio, field-combat, field-exploration);
- a **passive PF2e Effect item**, bundled in the same JSON, that auto-applies to
  every party member while the support is active (icon swapped to its portrait).

Produce **one bundle object** (the unit the Import button accepts). Output it as a
single JSON file/block the user can paste. Nothing else is required.

---

## 1. The mental model (read this first)

- A support **fires actions** that post a chat card. The card's numbers are
  **resolved from the support's level** at fire time, via authoring **tokens** you
  write in the card text (e.g. `@atk[high]`, `@check[reflex|high]`, `{level}`).
  You choose the *tier* (how good they are at it); the *level* fills in the math.
- This means **you never write raw bonuses**. Write `@atk[high]`, not `+17`. If
  the table uses PF2e's *Proficiency Without Level* variant, the resolver
  subtracts the level automatically — your JSON is the same either way.
- The **passive** is different: it's a real **PF2e Effect item** (flat status /
  circumstance bonuses via rule elements). It is bundled in the JSON; on import
  the module **creates it** in an Items folder and **links** it to the support.
- A support has an **availability pool** (`basePool` d6, modified by a faction
  track). **Field Calls** (combat & exploration) roll the pool and discard low
  dice; when it empties the support is **Downed** (fully offline — even the
  passive drops). The **radio** is free (soft 1/round in combat); the **passive**
  is always-on while active and not Downed.

---

## 2. The bundle envelope (what you output)

Two accepted shapes — the importer **auto-detects** which you sent. Prefer the
**single-NPC** shape unless the user explicitly wants several at once.

### 2a. Single NPC (preferred)

```jsonc
{
  "glctSupport": 1,                 // format marker (optional but nice to include)
  "support": { /* §3 the support object */ },
  "passiveEffect": { /* §7 a PF2e Effect item — optional but recommended */ }
}
```

The importer links `passiveEffect` to this support automatically (it matches the
support's passive ability **name** to the effect's **name** — so keep them equal,
see §7).

### 2b. Roster (several NPCs at once)

```jsonc
{
  "glctSupport": 1,
  "roster":  [ { /* support */ }, { /* support */ } ],
  "effects": [ { /* PF2e Effect */ }, { /* PF2e Effect */ } ]
}
```

Each effect links to the support whose **passive ability name equals the effect
name** (or set `"passiveEffectRef": "<effect name or slug>"` on the support to be
explicit).

> On **non-PF2e** systems the Effect item can't be created (the `effect` item type
> is PF2e-only); the passive degrades to a plain image marker. Still author the
> `passiveEffect` — it's just skipped where unsupported.

---

## 3. The support object

```jsonc
{
  "name": "Vega",                       // REQUIRED, ≤60 chars
  "role": "Static Choir signalwright · the voice that never drops",  // flavour subtitle
  "level": 7,                           // -1..25 — drives ALL computed numbers
  "accent": "#7fb4ff",                  // #rrggbb — the coin/card theme colour
  "basePool": 5,                        // 1..20 — base availability d6 (before faction)
  "faction": 3,                         // 0..5 faction track → pool modifier (table below)
  "discard": 2,                         // 0..5 — pool dice ≤ this are discarded on a Field Call
  "playerInvoke": true,                 // may players fire this support's actions?
  "downFloor": false,                   // true = Downed→unavailable until Recover (else half pool next mission)
  "img": "",                            // optional portrait path (GM usually sets in-app)
  "tokenImg": "",                       // optional; the passive icon on party tokens (defaults to img)
  "passiveEffectRef": "Open Channel",   // optional explicit link to an effect by name/slug
  "abilities": { /* §5 — the four cards */ }
}
```

- **Omit `img`/`tokenImg`** unless the user gave you art paths — the GM picks
  portraits in the editor, and the bundle is cleaner without guessed paths.
- **Do not** author `current`, `downed`, pool state, `id`, or `frames` — those are
  live state / assigned by the module. Anything you include is reset on import.

### Faction track → pool modifier

| `faction` | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| pool mod | −1d6 | −1d6 | ±0 | ±0 | +1d6 | +2d6 |

Final pool = `basePool + mod` (min 0). A faction-3 support with `basePool: 5`
rolls **5d6** on a Field Call. Pick `faction` for how connected/resourced they
are; lean 2–3 for a neutral contact.

---

## 4. Levels, tiers & the benchmark resolver (where numbers come from)

You give a **level** and, per number, a **tier**. At fire time the module looks up
PF2e's *Building Creatures* table for that stat + level + tier. You write the tier
inside a token (§6); you never write the number.

**Tiers, strongest → weakest:** `extreme · high · moderate · low · terrible`.
(Not every stat table has all five — `dc`/`spellAttack` cap at `moderate`; if you
name a tier a table lacks, the resolver clamps to the nearest. When unsure, use
`high` for "this is their signature thing", `moderate` for "competent".)

Rule of thumb for a support's *signature* action: **`high`**. For a secondary
effect: **`moderate`**. Reserve **`extreme`** for a true specialist's one trick.

---

## 5. The four abilities (every support has all four)

Each key in `abilities` is `{ name, costLabel, traits[], cardText, effectUuids[] }`.

| Key | What it is | Default `costLabel` | Burns pool? | Notes |
| --- | --- | --- | --- | --- |
| `passive` | always-on aura while active | `"Passive"` | no | The real bonus lives in the bundled **Effect item** (§7). `cardText` is just the readable description. |
| `radio` | free call, soft 1/round in combat | `"Free · 1/rd"` | no | A small reliable nudge — a reroll, −1 condition, minor buff. |
| `fieldCombat` | 1-action combat field call | `"1 action"` | **yes** | The big combat moment. Rolls the pool. |
| `fieldExplore` | exploration/downtime field call | `"Field · explore"` | **yes** | Bypass a hazard, save a survivor, defuse a crisis. Rolls the pool. |

- `traits` is an array of PF2e-style trait words (display only): e.g.
  `["concentrate","fortune","support"]`, `["healing","manipulate","support"]`,
  `["exploration","support"]`, `["aura","support"]`. Keep them flavour-accurate.
- `effectUuids` is almost always `[]` for authored NPCs — it's for the GM to drag
  extra Effect items onto an ability later. Leave it empty.
- Write the **passive's** `cardText` as a plain-English summary of the Effect's
  bonuses (it should describe exactly what the §7 rule elements do).

---

## 6. Card-text authoring tokens (the DSL)

Write these inside any ability's `cardText`. They resolve to interactive PF2e
inline buttons (and degrade to core inline rolls off-PF2e). **All numbers use
these — never type a raw bonus or DC.**

| Token | Meaning | Example |
| --- | --- | --- |
| `{level}` | the support's level | `@heal[2d8+{level}]` |
| `{half}` | floor(level / 2) | `grant {half} temporary HP` |
| `{pool}` | current pool (rarely used in text) | |
| `@check[type|tier]` | the **target** rolls a save/check vs the support's DC | `@check[reflex|high]` |
| `@roll[stat|tier]` | a d20 check the **support** makes | `@roll[athletics|high]` |
| `@atk[tier]` | a **Strike** attack roll | `@atk[high]` |
| `@dmg[tier]` | benchmark **Strike damage** dice | `@dmg[moderate]` |
| `@damage[formula]` | a custom damage formula | `@damage[2d6+{level}]` |
| `@heal[formula]` | healing | `@heal[2d8+{level}]` |
| `@dc[stat|tier]` | a bare DC **number** (inline, no roll) | `DC @dc[dc|high]` |
| `@effect[n]` | link the ability's Nth dropped Effect (`effectUuids[n]`) | `@effect[0]` |

**`type` / `stat` words:** saves `fortitude|reflex|will`; `perception`; any skill
name (`athletics`, `acrobatics`, `stealth`, …); `dc`, `ac`, `spell`/`spellAttack`,
`attack`/`strike`. Tier defaults to `moderate` if you omit `|tier`.

Worked card text (Razor's combat field call):

```
Razor rips through the field on his bike. Choose one —
<b>Extract:</b> drag 1 willing ally up to 25 ft to safe open space; the ally
loses off-guard, grabbed, and prone.
<b>Disrupt:</b> @atk[high] Whip Strike, then @roll[athletics|high] versus the
target's Fortitude DC — on a success, knock the target prone and pull it 10 ft.
```

You may use light HTML (`<b>`, `<i>`, `<em>`) for emphasis.

---

## 7. The passive — a PF2e Effect item

The passive's mechanical bonus is a **PF2e Effect item** you bundle as
`passiveEffect` (single) or an entry in `effects` (roster). It is created on
import and auto-applied to the whole party while the support is active. **Keep its
`name` equal to the support's `abilities.passive.name`** so it links automatically.

```jsonc
{
  "name": "Open Channel",          // MUST match the support's passive ability name
  "type": "effect",                // REQUIRED — the PF2e Effect item type
  "img": "icons/svg/sound.svg",    // fallback icon (the module swaps in the portrait)
  "system": {
    "description": { "value": "<p>+1 status to Recall Knowledge and to Perception to find hidden creatures while in radio range.</p>" },
    "rules": [ /* rule elements — see below */ ],
    "traits": { "value": ["aura"], "rarity": "common" },
    "level": { "value": 7 },                       // match the support's level
    "duration": { "value": -1, "unit": "unlimited", "sustained": false, "expiry": null },
    "tokenIcon": { "show": true },                 // show the aura icon on tokens (module setting can hide)
    "slug": "open-channel"                          // kebab-case of the name
  }
}
```

### Rule elements — keep them simple and flat

A passive should be a **small, always-fair, flat bonus**. The workhorse is
**`FlatModifier`**:

```jsonc
{ "key": "FlatModifier", "selector": "reflex", "type": "status", "value": 1, "label": "Last Safe Road" }
```

- **`selector`** — what it applies to. Common ones:
  `reflex` · `fortitude` · `will` · `saving-throw` (all saves) · `perception` ·
  `ac` · `skill-check` (all skills) · `<skill>` (e.g. `athletics`) ·
  `attack` / `damage` · `recovery-check` (dying recovery flat check).
- **`type`** — the bonus stacking type: usually `status` (most support buffs) or
  `circumstance`. Avoid `item`/`untyped`. Two **same-type** bonuses don't stack —
  that's the point of `status`/`circumstance`.
- **`value`** — keep it **+1** (or +2 for a single narrow case). See §8.
- **`predicate`** — optional array that gates *when* it applies. Use it to scope a
  broad selector down:
  ```jsonc
  // only Escape / Balance / Tumble Through actions:
  "predicate": [ { "or": ["action:escape", "action:balance", "action:tumble-through"] } ]
  // only vs disease or poison:
  "predicate": [ { "or": ["disease", "poison"] } ]
  // only Recall Knowledge:
  "predicate": ["action:recall-knowledge"]
  ```

> **Selector caveat:** PF2e selector slugs occasionally differ by build/version
> (e.g. `recovery-check`). If a bonus doesn't fire in-world, the selector name is
> the usual culprit — it's a one-word fix in the created Effect item.

Stick to `FlatModifier`. Don't reach for `DamageDice`, `Note`, `GrantItem`, or
roll-twist rules in an auto-applied party aura — they're easy to make
over-strong or noisy across a whole party.

---

## 8. Balance rules — a passive/ability is OVERPOWERED unless these hold

A support buffs the **entire party, every round, for free** (passive) or on a
cheap economy (radio/field). Power-budget accordingly:

1. **Passive aura = +1, almost always `status`.** A party-wide always-on bonus is
   strong. +1 to one save + a narrow scoped skill rider is the *ceiling* for a
   signature passive. Use **+2 only** for a single, situational selector (e.g.
   `recovery-check` while dying). Never stack multiple broad +1s.
2. **No "until end of encounter" lockouts from one action.** Reducing a condition
   *value by 1* is fine; **suppressing/removing** a condition for the whole fight
   from a single action is not. (This is the exact nerf the shipped Tourniquet
   received — copy that pattern.)
3. **Field calls cost the pool.** The big effects (`fieldCombat`/`fieldExplore`)
   already burn d6s and can Down the support — that's their balance. Don't also
   make them swingy *and* free of opportunity cost.
4. **Radio is a nudge, not a nuke.** A reroll (fortune), −1 to one condition,
   `{half}` temp HP, or +1 to one save. Not raw damage, not big healing.
5. **Healing/damage scale with `{level}`/dice, not flat tier numbers**, and live
   on the *field* (pool-gated) cards — never on the passive or radio.
6. **Fiction-gate the strong bits.** "While they can hear the radio", "if dying",
   "if frightened" — conditions that won't always be true keep an always-on aura
   honest.

When in doubt, **undertune**. A support should feel like a reliable friend, not a
second party member's worth of numbers.

---

## 9. Full worked example (single NPC, complete & valid)

```json
{
  "glctSupport": 1,
  "support": {
    "name": "Vega",
    "role": "Static Choir signalwright · the voice that never drops",
    "level": 7,
    "accent": "#7fb4ff",
    "basePool": 5,
    "faction": 3,
    "discard": 2,
    "playerInvoke": true,
    "downFloor": false,
    "abilities": {
      "passive": {
        "name": "Open Channel",
        "costLabel": "Passive",
        "traits": ["aura", "support"],
        "cardText": "While they can hear Vega on the channel, each ally gains a +1 status bonus to Recall Knowledge checks and to Perception checks to Seek hidden creatures.",
        "effectUuids": []
      },
      "radio": {
        "name": "Say Again",
        "costLabel": "Free · 1/rd",
        "traits": ["concentrate", "fortune", "support"],
        "cardText": "Choose 1 ally: reroll a failed check to Recall Knowledge, Seek, or Sense Motive and take the better result (fortune).",
        "effectUuids": []
      },
      "fieldCombat": {
        "name": "Mark the Target",
        "costLabel": "1 action",
        "traits": ["support", "concentrate"],
        "cardText": "Vega calls the firing solution. @atk[high] vs the target — on a hit, the next ally to attack it before your next turn gains a +1 circumstance bonus to that attack and the target is off-guard to them.",
        "effectUuids": []
      },
      "fieldExplore": {
        "name": "Triangulate",
        "costLabel": "Field · explore",
        "traits": ["exploration", "support"],
        "cardText": "Choose one: pinpoint a hidden route, contact, or signal source the party is hunting; or shave one step off a search or investigation clock.",
        "effectUuids": []
      }
    }
  },
  "passiveEffect": {
    "name": "Open Channel",
    "type": "effect",
    "img": "icons/svg/sound.svg",
    "system": {
      "description": { "value": "<p>While in radio range, each ally gains a <strong>+1 status bonus to Recall Knowledge</strong> and to <strong>Perception to Seek hidden creatures</strong>.</p>" },
      "rules": [
        { "key": "FlatModifier", "selector": "skill-check", "type": "status", "value": 1, "label": "Open Channel", "predicate": ["action:recall-knowledge"] },
        { "key": "FlatModifier", "selector": "perception", "type": "status", "value": 1, "label": "Open Channel", "predicate": ["action:seek"] }
      ],
      "traits": { "value": ["aura"], "rarity": "common" },
      "level": { "value": 7 },
      "duration": { "value": -1, "unit": "unlimited", "sustained": false, "expiry": null },
      "tokenIcon": { "show": true },
      "slug": "open-channel"
    }
  }
}
```

---

## 10. Output checklist (run before returning the JSON)

- [ ] One bundle object; **valid JSON** (no comments, no trailing commas).
- [ ] Single shape `{ support, passiveEffect }` (preferred) or roster
      `{ roster, effects }` — not a bare mix.
- [ ] `support.name` and `support.level` present; `level` in −1..25.
- [ ] `accent` is `#rrggbb`; `faction` 0–5; `basePool` 1–20; `discard` 0–5.
- [ ] **All four** abilities present (`passive`, `radio`, `fieldCombat`,
      `fieldExplore`), each with `name`, `costLabel`, `traits[]`, `cardText`.
- [ ] Every number in card text uses a **token** (`@atk[…]`, `@check[…|…]`,
      `{level}`…) — **no raw bonuses or DCs** typed in.
- [ ] `passiveEffect.type === "effect"`; `name` **equals** the passive ability's
      name; `slug` is the kebab-case name.
- [ ] Passive rules are **`FlatModifier`** only, **+1** (rare narrow +2),
      `status`/`circumstance`, with `predicate` scoping broad selectors.
- [ ] `duration` is unlimited (`value:-1, unit:"unlimited"`); `level.value`
      matches the support level.
- [ ] Balance §8 respected — no whole-encounter condition removal, no free big
      damage/heal, strong bits fiction-gated.
- [ ] No `id`, `current`, `downed`, or `frames` authored (module-owned).

Return the file as a single fenced ```json block the user can save (e.g.
`vega.json`) and bring in via **Open Support Editor → Import JSON** (paste it, or
*Load file…*). The passive Effect is created and linked automatically; then the GM
sets a portrait and **Set Active**.
