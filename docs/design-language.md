# GL Universe — Design Language Reference ("Etched Glass")

**Status:** Canonical reference — v1.0 (2026-06-12)
**Applies to:** All GL Universe Foundry VTT modules. Currently:
- `gluniverse-clocks-and-tracker` (Clocks & Tracker — HUD, tracker dock, weather, delving, support)
- `gluniverse-initiative` (Initiative — combat rail, round splash, break gauge)

New GL Universe modules MUST reference this document for theming. The two existing
modules converge on it incrementally (see §9 Adoption).

---

## 1. Identity — what "Etched Glass" is

The GL Universe look is the marriage of two dialects that already exist in the family:

| Dialect | Module | Essence |
|---|---|---|
| **Arcane Glass** | Clocks & Tracker | Liquid glass *material* — frosted, blurred, beveled panels with inner light, tinted glow blooms, and tactile, springy motion. Warm, alive, atmospheric. |
| **Endfield Precision** | Initiative | Industrial *geometry* — notched corner cuts, L-bracket registration marks, 1px precision rules, sheen sweeps, etched-ghost numerals, micro-tracked uppercase labels. Architectural calm, restrained ceremony. (Explicitly inspired by *Arknights: Endfield* — Hypergryph's "industrial sci-fi": factory safety markings and print-press production artifacts elevated into a HUD, every screen behaving like a technical document.) |

**Etched Glass = liquid glass as the material, Endfield as the drafting layer on top of it.**

Think of every surface as a slab of dark frosted glass that a precision laser has
*etched*: a chamfered corner, a hairline registration bracket, a data label in
micro-type, a rule of light that sweeps across when state changes. The glass gives
warmth, depth and premium feel; the etching gives intent, hierarchy and that
industrial sci-fi edge.

### Design principles

1. **Glass is never flat.** Every panel is multi-layer: frosted blur, top light
   catch, bottom inset depth, hairline rim, outer bloom. No flat cards, ever.
2. **Light is information.** State changes are communicated by *light moving* —
   sheen sweeps, rule draws, glow blooms — not by elements jumping around.
3. **One cut corner.** The chamfer (diagonal corner cut) is the family signature.
   Large glass keeps soft radii on three corners and takes the cut on one;
   small chips and buttons go fully notched.
4. **Etched annotations.** Micro uppercase labels, tick marks, L-brackets and
   hairline rules annotate surfaces like technical drawings. They are quiet
   (low alpha) until the state they describe becomes important.
5. **Restrained ceremony.** Big moments (round splash, doom stamp, terminal
   stage) earn cinematic motion; everything else is tight and architectural.
   Selective overshoot for numerals only.
6. **Color is semantic and dynamic.** Surfaces are near-monochrome ink; meaning
   arrives through one accent channel (`--gl-accent`) that context sets — shift
   tint, disposition, weather, delve stage — plus a fixed semantic set
   (signal amber, hazard red, success green, mystery violet).
7. **Legibility wins.** Dioramas, portraits and effects always sit behind a
   scrim. Text glows use drop-shadow/text-shadow recipes that never bleed.
8. **Motion respects the player.** Every decorative loop and ceremony collapses
   under `prefers-reduced-motion` and the module's motion-tier setting.

---

## 2. Color tokens

Shared tokens use the `--gl-` prefix. Module-local tokens (e.g. `--gluni-*`,
`--glct-*`) should alias to these.

### 2.1 Ink ramp (surfaces)

```css
--gl-ink-0: #02070b;   /* deepest void — page scrims, splash decks            */
--gl-ink-1: #080b11;   /* glass body base — panel gradient terminus           */
--gl-ink-2: #0b0f17;   /* inputs, inset wells                                  */
--gl-ink-3: #161d2c;   /* raised rows, dock rows (tint-blended in practice)    */
```

### 2.2 Text

```css
--gl-text:        #eef1f7;                      /* primary                    */
--gl-text-bright: #f3fbff;                      /* hero numerals, active      */
--gl-text-dim:    #98a2b6;                      /* secondary, labels          */
--gl-text-faint:  rgba(243,251,255,.38);        /* etched ghosts, sub-strings */
```

### 2.3 Lines & rims

```css
--gl-hair:        rgba(255,255,255,.08);   /* hairline dividers              */
--gl-edge:        rgba(255,255,255,.13);   /* glass panel rim (1px)          */
--gl-line-strong: rgba(244,252,255,.55);   /* L-brackets, emphasized rules   */
```

### 2.4 Fixed semantic accents

```css
--gl-signal:  #ffd24a;   /* SIGNAL AMBER — the Endfield yellow. System ceremony,
                            mission/deadline, events, "look here". The premium
                            accent: use sparingly, at full saturation.          */
--gl-signal-hot: #ffe070; /* signal peak — flash sweeps, lit digits             */
--gl-cyan:    #5eeaff;   /* system/friendly accent (Initiative primary)        */
--gl-hazard:  #ff4a52;   /* unified danger (between glct #e0584f / gluni #ff335f) */
--gl-good:    #5fdb92;   /* success / completion / at-max                       */
--gl-violet:  #b497ff;   /* mystery / hidden / unknown                          */
--gl-mission: #37d99a;   /* mission/goal emerald (Clocks)                       */
```

> **Provenance.** Endfield's authentic signature is an aggressive safety yellow
> (`#FFFA01`, drifting to `#FFD802` amber under lighting), always used *opaque* —
> solid yellow fills with black text, or thin strokes — never tinted into
> backgrounds. `--gl-signal` is deliberately blended two steps warmer/softer so it
> sits on dark frosted glass without searing, and harmonizes with the family's
> existing event amber (`#ffc454`). The *usage rule* carries over intact: signal
> elements stay **opaque decals on top of the glass**, the sole saturated accent
> against frosted neutrals.

Soft/glow variants are always derived, never hand-picked:

```css
color-mix(in srgb, var(--gl-signal) 45%, transparent)   /* glow   */
color-mix(in srgb, var(--gl-signal) 18%, transparent)   /* bloom  */
```

### 2.5 The dynamic accent channel

Every component reads ONE variable for its contextual color:

```css
--gl-accent: /* set at render time by context */
```

| Context | Source of `--gl-accent` |
|---|---|
| Time-of-day (Clocks HUD) | shift tint: Night `#6b86d6` · Dawn `#e0a368` · Day `#6fb8d8` · Dusk `#b884d0` |
| Disposition (Initiative) | friendly `--gl-cyan` · neutral `#ffce6a` · hostile `--gl-hazard` · secret `--gl-violet` |
| Weather chip | per-condition tint (e.g. default `#cfe8ff`) |
| Delving stage | per-stage tint (e.g. torch `#ff9a3c`) |

Derived glows follow the same `color-mix` rule as §2.4.

### 2.6 Holographic ramp (premium highlight)

For the single most important live element on screen (active combatant edge,
featured terminal resource), a three-stop holo gradient may replace the flat accent:

```css
--gl-holo-a: var(--gl-accent);
--gl-holo-b: var(--gl-violet);
--gl-holo-c: #ff66b3;
background: linear-gradient(180deg, var(--gl-holo-a), var(--gl-holo-b) 50%, var(--gl-holo-c));
```

Never on more than one element at a time.

---

## 3. Material — the glass recipes

Three glass levels. All share: 1px `--gl-edge` rim, top inset highlight,
bottom inset depth, outer drop + bloom.

### 3.1 `glass-panel` — primary surfaces (HUD bar, rail deck, windows)

```css
background:
  linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,0) 34%),
  linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.20)),
  linear-gradient(98deg, color-mix(in srgb, var(--gl-accent) 14%, var(--gl-ink-1)), var(--gl-ink-1) 64%);
border: 1px solid var(--gl-edge);
box-shadow:
  0 26px 70px rgba(0,0,0,.6),                 /* far drop                */
  0 2px 0 rgba(0,0,0,.4),                     /* near hard rim           */
  inset 0 1px 0 rgba(255,255,255,.16),        /* top light catch         */
  inset 0 -12px 28px rgba(0,0,0,.38),         /* bottom depth            */
  0 0 46px color-mix(in srgb, var(--gl-accent) 18%, transparent);  /* bloom */
backdrop-filter: blur(16px) saturate(1.15);
```

Plus the inner radial light catch on `::before`:

```css
background: radial-gradient(70% 150% at 50% -50%,
  color-mix(in srgb, var(--gl-accent) 50%, transparent), transparent 66%);
opacity: .22;
```

### 3.2 `glass-chip` — badges, chips, small floating elements

Same anatomy, lighter: `backdrop-filter: blur(8px)`, drop `0 6px 16px rgba(0,0,0,.4)`,
inset top `rgba(255,255,255,.1)`, accent-tinted fill at 16%/5% alpha
(see the Clocks event badge for the canonical example).

### 3.3 `glass-deck` — ceremony backdrops (round splash, break splash)

Dark, masked, heavily vignetted:

```css
background: linear-gradient(180deg, rgba(10,22,30,.62), rgba(2,7,11,.78) 52%, rgba(2,6,10,.7));
box-shadow:
  inset 0 1px 0  color-mix(in srgb, var(--gl-accent) 30%, rgba(255,255,255,.22)),
  inset 0 -1px 0 rgba(0,0,0,.7),
  inset 0 0 0 1px color-mix(in srgb, var(--gl-accent) 22%, var(--gl-hair)),
  inset 0 0 38px color-mix(in srgb, var(--gl-accent) 12%, transparent),
  0 26px 70px rgba(0,0,0,.62);
mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent);
```

### 3.4 Edge refraction (localized tint wash)

When a sub-system owns one edge of a shared panel (weather = left, delving =
right), it paints a *masked* inner refraction instead of recoloring the panel:

```css
box-shadow:
  inset 0 0 0 1px  color-mix(in srgb, var(--gl-accent) 55%, transparent),
  inset 0 1px 0    color-mix(in srgb, var(--gl-accent) 62%, #fff),
  inset 0 0 14px -2px color-mix(in srgb, var(--gl-accent) 42%, transparent),
  inset 14px 0 26px -16px color-mix(in srgb, var(--gl-accent) 75%, transparent);
mask-image: linear-gradient(90deg, #000 0, #000 20%, transparent 38%);
```

(Mirror with `270deg` / negative x-offsets for the right edge.)

### 3.5 Legibility scrim

Anything painted behind text (diorama, portrait) gets a directional ink scrim:

```css
background: linear-gradient(95deg, rgba(2,5,8,.95), rgba(2,5,8,.48) 50%, rgba(2,5,8,0));
```

---

## 4. Geometry — the etching

### 4.1 The chamfer (signature silhouette)

- **Large glass panels** keep `border-radius: 14px` on three corners and take a
  **diagonal cut on one corner** (default: top-right, 14px). Technique:
  `border-radius` + intersecting `clip-path` —

  ```css
  border-radius: 14px;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  ```

  A 1px accent hairline may trace the cut edge (drawn with a rotated `::after`).
- **Cards** (initiative): full notch, no radius —
  `polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)`.
- **Chips/buttons**: small notch at top-left —
  `polygon(4px 0, 100% 0, 100% 100%, 0 100%, 0 4px)` (6px for pill buttons).

Radius scale where radius applies: pills `99px` · panels `14–15px` · rows `11px` ·
buttons/inputs `7–9px` · pips `2–4px`.

### 4.2 Registration marks

- **L-bracket**: 8×8px, 1px stroke `--gl-line-strong`, top+left borders only,
  inset 6px from a corner. Brightens to `--gl-accent` when its element activates.
- **Tick mark**: 12–14px horizontal accent line preceding a ceremony label,
  with `box-shadow: 0 0 8px` accent glow.
- **Crop marks** (print-press registration, large windows only): small L-shaped
  1px strokes sitting 4px *outside* each corner at `--gl-hair`-to-`--gl-line-strong`
  alpha — the surface pretends to be a sheet on a press.
- **CMYK registration chips**: a tiny run of 4 squares (3–4px) — ink-black,
  cyan, magenta, signal — placed beside a serial or at the end of a footer
  rule. Pure provenance garnish; at most one per window.
- **Serial / metadata text**: fake technical designators in the technical voice,
  e.g. `GLU·TIME // 0042`, `SEC·04 / GRID·NW`. Dim gray, micro size.
- **Triangle bullet**: small `▲`/`▶` glyph as list/indicator marker instead of
  dots, accent-colored when its row is live.

### 4.3 Precision rule

The 1px line of light. Anatomy:

```css
height: 1px;
background: linear-gradient(90deg, transparent, var(--gl-accent) 24%, var(--gl-accent) 76%, transparent);
box-shadow: 0 0 14px color-mix(in srgb, var(--gl-accent) 70%, transparent);
```

Used as: hover sheen (scaleX 0→1 from leading edge), active-enter sweep,
splash reveal rule, section dividers (static, at 30% opacity).

### 4.4 Caution & hazard stripes (ceremony only — never decoration)

Two stripe registers, both 45°, both applied as thin ribbons (3–4px along one
edge) or ≤6% alpha full-surface washes behind a scrim:

```css
/* SIGNAL stripES — mission deadlines, loading/confirm edging (Endfield black×yellow) */
background: repeating-linear-gradient(45deg,
  var(--gl-ink-0) 0 8px, var(--gl-signal) 8px 16px);

/* HAZARD stripes — doom, terminal, dying */
background: repeating-linear-gradient(-45deg,
  color-mix(in srgb, var(--gl-hazard) 55%, transparent) 0 8px,
  transparent 8px 16px);
```

Signal stripes are opaque decals (per the signal rule, §2.4); hazard stripes are
translucent and pair with the dread pulse (§7.4).

### 4.5 Data strip (decorative texture, ≤ 1 per surface)

A barcode-like run of 1px vertical hairlines at varying gaps, 8px tall,
`--gl-hair` alpha, placed near a micro-label. Static garnish — omit only when
space is tight.

### 4.6 Blueprint grid (hero areas only)

A faint drafting grid behind hero/empty regions of large windows:

```css
background:
  linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
background-size: 28px 28px;
```

Always under the legibility scrim, never under body text.

---

## 5. Typography

Two voices, strict roles:

| Voice | Stack | Role |
|---|---|---|
| **Display** | `"Oxanium", "Segoe UI", system-ui, sans-serif` | Hero numerals, clocks, titles, names. Weights 600–800. |
| **Technical** | `"Bahnschrift", "Share Tech Mono", "JetBrains Mono", Consolas, monospace` | Micro-labels, kickers, sub-strings, annotations. Weight 950 (Bahnschrift) / 700 (mono). |

> **Provenance.** Endfield's UI typeface is *Novecento Sans* (wide-bold geometric,
> tight tracking); Oxanium is one of its recognized web stand-ins — the Clocks
> module's existing display voice is already authentically in-register. Endfield's
> "numbers are heroes" idiom (huge bold numeral + tiny stacked unit label, e.g.
> `42` / `LV.`) is the model for all hero-numeral lockups.

Rules:

- All numerals: `font-variant-numeric: tabular-nums`.
- All technical labels: UPPERCASE with tracked spacing —
  kicker `0.18–0.24em` · ceremony label `0.45–0.55em` · tiny chrome `0.12–0.16em`.
- Hero gradient text: `linear-gradient(180deg, #fff, #cdd6e8)` clipped to text.
- Glow on numerals: `text-shadow: 0 0 16px <accent-soft>, 0 1px 0 rgba(0,0,0,.35)`
  (use `filter: drop-shadow(...)` instead when the text is masked/clipped).
- Etched ghost (pre-reveal state): same glyphs at `opacity: .18`, lit to 1 by a
  passing rule (§6.3).

Scale (reference, px): ceremony number `clamp(108, 17vw, 230)` · hero numeral
22–34 · title 16 · body 12–14 · label 9–11 · kicker 8 · micro 6.5–7.5.

---

## 6. Motion

### 6.1 Tokens

```css
--gl-ease: cubic-bezier(0.16, 1, 0.3, 1);    /* default premium decel        */
--gl-snap: cubic-bezier(0.2, 1.35, 0.22, 1); /* slight overshoot — numerals  */
--gl-pop:  cubic-bezier(0.34, 1.56, 0.5, 1); /* tactile pop — pips, fills    */
--gl-exit: cubic-bezier(0.55, 0, 0.84, 0);   /* sharp accelerated exit       */

--gl-d-quick:  180ms;   /* hover, control state     */
--gl-d-move:   420ms;   /* layout FLIP, grow/shrink */
--gl-d-reveal: 620ms;   /* active-enter composite   */
--gl-d-splash: 720ms;   /* ceremony reveal          */
--gl-breathe:  2.6s;    /* idle pulse loops         */
--gl-dread:    3.2s;    /* hazard dread loops       */
```

### 6.2 Vocabulary

| Gesture | Recipe | Used for |
|---|---|---|
| **Sheen sweep** | precision rule scaleX 0→1 across the element; things it crosses light up | active enter, splash reveal, hover |
| **Slot reel** | digit strips translate on `cubic-bezier(.2,.85,.22,1)` .52s, staggered | clock digits, dice reveals |
| **Tactile pop** | `--gl-pop`, scale .5→1.22→1 with white flash | pip fill, counter tick |
| **Ghost exit** | clone → translate toward play area, scale .86, blur 8px, fade, `--gl-exit` | card leaving |
| **Stamp** | scale-in overshoot `.55s cubic-bezier(.34,1.6,.5,1)` | COMPLETED / DOOM / EMPTY |
| **Breathe** | opacity .4↔1 sine, `--gl-breathe` | pulse dots, idle accents |
| **Dread** | slow glow/brightness pulse, `--gl-dread` | hazard, ominous, dying |
| **Press** | `translateY(1px)` / `scale(.97)` 120ms | every button |
| **Deny shake** | ±6px lateral 220ms `cubic-bezier(.36,.07,.19,.97)` | rejected action |
| **Diagonal wipe** | panel reveals via 45°-edged `clip-path` mask sliding in, 120–180ms `--gl-ease` | window/section open |
| **Cascade stagger** | list items enter 30–50ms apart, each sliding a few px along the diagonal axis | rails, rosters |
| **Signal flash** | quick `--gl-signal` fill sweep that recedes to outline | confirm / commit |
| **Decode text** | label resolves from scrambled glyphs or counts up | cinematic tier only |

### 6.3 The reveal contract

State-change ceremony always follows: **anticipation (≤80ms) → rule/light moves →
content lights as the light crosses it → settle with selective overshoot.**
Etched ghosts (§5) + sheen sweep is the canonical implementation.

### 6.4 Motion tiers

Three tiers, set by module setting and force-clamped by `prefers-reduced-motion`:

- **reduced** — FLIP at ~240ms, no sheens, ceremonies become straight fades.
- **default** — values as specified here.
- **cinematic** — durations ×1.4, sheens gain a 28px trailing flare, ceremony
  rules gain a 1px echo rule 60ms behind, holds linger.

Decorative infinite loops (`breathe`, `dread`, holo drift, scanlines) must be
disabled (not merely slowed) under `prefers-reduced-motion`.

---

## 7. Component states

### 7.1 Idle / inactive
Near-monochrome. Accent only on: edge bar (3px), L-bracket at `--gl-line-strong`,
data labels at dim alpha.

### 7.2 Hover
Top precision rule draws (180ms), surface lightens `rgba(255,255,255,.025–.08)`,
content brightness 1.06. Never scale on hover.

### 7.3 Active / featured
Edge bar 3→4px with doubled glow (or holo ramp §2.6), L-bracket → accent,
kicker tag fades in, accent rim `inset 0 0 0 1px` at 70% mix, outer bloom
`0 0 32px` accent at 34%.

### 7.4 Hazard / ominous
Accent channel → `--gl-hazard`, dread pulse loop, optional hazard-stripe ribbon
(§4.4), ember/scanline drift at low alpha.

### 7.5 Terminal / depleted
Intensified edge refraction (1.5px rim, 85% mix, wide bloom), terminal pulse
2.4s, skull/strike-through iconography, stripes allowed.

### 7.6 Defeated / spent
`filter: saturate(.18) brightness(.62); opacity: .65;` accent dims to 30%.
Brackets stay visible — the drafting layer never disappears.

---

## 8. Accessibility & performance

- `prefers-reduced-motion: reduce` → clamp to reduced tier, kill loops, keep
  functional transitions at ≤120ms.
- Text on glass must always sit on a scrim (§3.5); target ≥4.5:1 effective contrast.
- `backdrop-filter` only on panel-level elements (never chips inside panels —
  nested blurs are a GPU cliff in Foundry).
- WebGL dioramas pause when collapsed/backgrounded.
- Tabular numerals everywhere numbers update live (no layout shimmer).

---

## 9. Adoption — mapping the existing dialects

### 9.1 Clocks & Tracker (`--glct-*`)

Already canonical for: glass-panel recipe, edge refraction, scrims, slot reel,
tactile pop, shift-tint accent channel, reduced-motion discipline.

To adopt from this spec:
- Chamfer the HUD bar's top-right corner (§4.1) + hairline on the cut.
- Add L-bracket + micro-kicker to the tracker dock and weather/delving windows.
- Re-point ambers (`#ffc454`, mission countdown) at `--gl-signal`.
- Unify `--danger: #e0584f` → `--gl-hazard` (and derive glows via color-mix).
- Adopt technical voice (Bahnschrift/mono) for `.lbl`-class micro-labels
  (currently Oxanium); Oxanium stays for all numerals/titles.

### 9.2 Initiative (`--gluni-*`)

Already canonical for: notch geometry, L-bracket, precision rule, sheen sweep,
etched ghosts, motion tiers, ceremony splashes, technical voice.

To adopt from this spec:
- Upgrade card surfaces and splash decks to the full glass-panel material
  (§3.1) — today they're ink fills with glass *layers*; add the
  `backdrop-filter` blur + bloom at panel level (rail deck), keeping cards lighter.
- Adopt Oxanium as the display voice for splash numbers and initiative
  numerals (technical voice stays for labels).
- Re-point `--gluni-red #ff335f` → `--gl-hazard`; neutral amber `#ffce6a`
  stays as the disposition value but ceremony ambers use `--gl-signal`.

### 9.3 New modules

1. Copy the `--gl-*` token block (§2, §6.1).
2. Build every surface from a §3 glass level + §4 etching.
3. Set `--gl-accent` from your domain context; derive all glows via `color-mix`.
4. Implement the reveal contract (§6.3) for your hero state change.
5. Ship the three motion tiers and the reduced-motion clamp.

---

## 10. Source-of-truth pointers

| Recipe | Reference implementation |
|---|---|
| Glass panel, shift tints, slot reel | `gluniverse-clocks-and-tracker/styles/hud.css` |
| Edge refraction, scrims, hex bevel | `styles/weather.css`, `styles/delving.css` |
| Notch, bracket, sheen, motion tiers, splash | `gluniverse-initiative/styles/gluniverse-initiative.css` |
| Endfield direction rationale | `gluniverse-initiative/docs/superpowers/specs/2026-05-22-visual-overhaul-design.md` |
| Original glass mockup | `gluniverse-clocks-and-tracker/mockups/arcane-glass.html` |
| **Etched Glass visual specimen** | `gluniverse-clocks-and-tracker/mockups/design-language.html` |
