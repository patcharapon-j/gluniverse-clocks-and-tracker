# GLUniverse — Clocks & Tracker

A premium, tactile in-game **calendar and time HUD** for Foundry VTT, built on Foundry's native time system. Define your own calendar (fantasy or real-world), track time with a Year Zero–style shift/stretch clock, advance time with animated passage, and manage events & holidays — all from a compact top-bar HUD.

> Compatible with **Foundry VTT v13–v14**. Time is driven through Foundry's native `game.time`, so advancing time propagates to all clients and expires PF2e / D&D 5e effects automatically.

---

## Features

- **Module Configuration** — one settings menu (**Game Settings → Configure Settings → GLUniverse Clocks & Tracker → Configure Modules**) to enable or disable **every module and sub-module** the package ships. Some games don't need the time tracker, the resource tracker, or even individual pieces of either — turn off exactly what yours doesn't use. The toggles are a tree: switching off a module (e.g. *Time Tracker*) takes everything nested under it (calendar, events, mission countdown, watch toggle, scene tint, GM controls) offline too, and your sub-toggles are remembered for when you switch it back on. Disabled features drop their HUD pieces, scene-control buttons, and keyboard shortcuts.
- **Top-bar HUD** — a polished, hideable bar anchored to the top of the screen. Drag to reposition, click the grip to collapse to a compact dual-ring readout.
- **Year Zero–style time model** — each day is 4 **shifts** (*Night / Dawn / Day / Dusk Watch*) of 6 hours; each hour is 6 **stretches** of 10 minutes. The HUD shows the active shift, the current hour, and stretch progress as tactile pips and a dual ring.
- **Shift-level (watch) mode** — when stretch-by-stretch detail is more than your table needs, the GM flips a world-wide toggle on the HUD dock: the HH:MM clock and stretch meter step aside and a 4-quadrant **watch dial** promotes the current shift to hero, with a light sweep and a sweeping pointer animating the change. Time still advances and stores in stretches under the hood (so effect expiry and other modules are unaffected); only the display changes, and players see the simpler view too. The **GM keeps a compact exact-time readout** (clock + a slim stretch-progress bar) beside the dial, so nothing is lost. Set the default in module settings.
- **Mission mode** — pin a deadline and the stretch meter becomes a countdown. The GM sets a target either as a number of **stretches from now** or an **exact date & time** (with an optional label like *"Reach the gate"*). Inactive hours stop collapsing into a single dot — every stretch stays individually visible as a thin vertical rectangle, with the stretches still to go before the target lit in an amber accent (so players can literally count them), the target stretch flagged as a finish line, and a prominent *"N stretches to go"* readout. The active hour keeps its full pips. Players see the same adapted meter; the GM clears it from the same **🎯 Mission** dock button.
- **Slot-reel clock** — digits spin into place like a slot machine when time changes.
- **Animated time passage** — advancing an hour or a shift visibly *ticks* forward one stretch at a time; day-or-larger jumps snap instantly.
- **Custom calendars** — GM-editable calendar config supporting any month/weekday/season layout, leap years, and intercalary months. Ships with **Gregorian**, **Golarion** (Pathfinder), and **Harptos** (Forgotten Realms) presets. Import/export as JSON.
- **Events & holidays** — single day, day range, or whole month. Mark each event visible or hidden to players, or pin one to always show its countdown on the HUD. Players get a read-only calendar view.
- **Combat aware** — reflects combat state on the HUD (time only advances when the GM advances it).
- **Per-shift theming** — subtle color tint and an optional full-scene glow that shifts with the time of day.
- **Tracker dock** — a *separate* compact floating HUD where the GM keeps live, at-a-glance trackers and shows them to players (read-only). Six types, each a single tidy row:
  - **Point** — a prominent numeral with a bold label; left-click the number +1, right-click it −1. Optional **min** and **max** bounds clamp the value; when a max is set it shows a faint `/max` after the numeral, and the numeral recolours when the value reaches the ceiling (green) or floor (red, the min itself stays hidden).
  - **Clock** — a Blades-in-the-Dark segmented progress clock; left-click the dial advances a slice, right-click steps back. Flag it **ominous (bad clock)** and it turns hazard-red with a dread glow — filling it stamps a red **DOOM** instead of the usual green **FILLED**.
  - **Resource Pool** — a pool of dice; clicking rolls them and drops any die at or below the discard range, posting a compact chat card and rolling real 3D dice via **Dice So Nice** when installed (the dock count holds until the 3D dice settle). The dock reads like a Point tracker — the **dice remaining** is the hero numeral with a faint `d?` size cap, and a chevron flicks up on a refill, down on a discard. Empty the pool and it shows a bold **EMPTY**. Optionally lets players roll it.
  - **Task** — a row of boxes that fill toward **COMPLETED**, with a title & subtitle.
  - **Hazard** — a doom clock in danger-red with a persistent dread glow & ember flicker.
  - **Separator** — a slim, label-bearing divider to group the dock into sections (purely visual).
  - Full CRUD per tracker (incl. **player visibility**) from a **right-click context menu** on a row's name/label area — its value stays click-to-step; drag the grip to reorder — changes sync to players instantly.
  - **Private trackers on PC sheets (PF2e)** — an opt-in feature that adds a dedicated **Trackers tab** to each PF2e character sheet for trackers *private to that PC*. They live in the actor's flags — **only the actor's owner(s) and the GM** can see or edit them, never the rest of the party — and use the same six row types and visuals as the dock. The owning player manages and rolls their own (no GM round-trip needed, since they own the actor); a rolled **Resource Pool** whispers its result card to the owner + GM only. Ships **off**; enable it under **Game Settings → Configure Settings → GLUniverse Clocks & Tracker → Configure Modules → Resource Trackers → Private trackers on PC sheets**.
- **Weather (Hex Flower)** — an opt-in weather engine built on Goblin's Henchman's *Hex Flower Game Engine*: a 19-hex "flower" of weather conditions that a current-position marker walks around one step at a time, driven by a **Navigation Hex** (roll dice → hex-face direction) whose mapping carries the trend. It is wired into the time system — the flower **auto-walks as in-game days pass** (configurable) and uses a **different flower + Navigation Hex per calendar season**, remapping your position by coordinate when the season turns.
  - **Weather chip on the HUD** — a localized PixiJS "diorama" (animated rain / snow / lightning / fog / embers…) with the tint confined to the chip only (the rest of the bar keeps its shift colour), the condition label & temperature, and a hazard dread-pulse for ominous weather. Click it to open the flower window.
  - **Hex Flower window** — the 19 hexes rendered with the current cell glowing and the marker animating hex-to-hex on each step, a player-visible history strip, and GM controls (Roll-now / right-click rewind / reset / reveal-to-players). Players see the current condition + history; the full flower is GM-only unless revealed.
  - **Composable effects** — every condition is a *motion archetype × two tints*, so fantasy weather (acid rain, crimson lightning, ashfall, arcane mist, ember storms…) is just an archetype plus a colour — no new code. Effects pause when the HUD is collapsed or the tab is backgrounded, and respect `prefers-reduced-motion`.
  - **Visual editor** — click a hex to edit its label/icon/description/temperature/effect with a live preview; edit each season's Navigation Hex with a live trend/probability preview and per-face edge rules; pick the **Temperate** (4-season) or **Homage** (single-flower) preset, or import/export JSON.
  - Ships **disabled by default**, so calendar-only worlds are unaffected.
- **Delving Mode** — a turn-driven mode of play for dungeon crawls, hauntings, descents — anywhere the *passage* of time matters but the wall-clock reading doesn't. Toggle it on from the HUD dock at any time; `game.time` keeps advancing under the hood (so effects still expire and the weather still walks), but the clock readout steps aside for a **turn counter** and the featured resource's atmosphere.
  - **Configurable turn** — the GM defines what one turn represents: a count × a unit (stretch / hour / shift / day / week / month) plus a label. Pressing **Pass Turn** advances time by that span; **right-click** rewinds a whole turn (state, time, and any weather roll). The granular step buttons stay available in a compact GM affordance.
  - **Turn-driven weather** — set how many turns pass before the weather rolls again; while delving, the normal time-based weather cadence is suspended and handed back (re-seeded to *now*) when you exit.
  - **Delving resources** — staged dice pools (torches, corruption, signal, air…). Each turn rolls every resource's current-stage pool (drop dice ≤ the discard range, exactly like the Tracker's Resource Pool) and posts one **consolidated Turn card**; the featured resource's roll plays as a **slot-machine reveal *inside the chat card*** — each die is a reel that spins up and decelerates onto its rolled value, the reels landing left-to-right in a cascade (pure CSS/DOM, no dependencies). **Discards are only revealed after the result is shown**: every reel lands looking live, then the dropped dice (≤ the discard range) dim and strike through. The overlay then fades to the baked static result for scrollback, and **the HUD's pool readout only updates once the animation finalises** — so the bar catches up to the new count after the table has watched the dice resolve. The card also **won't spoil the outcome** — the "N left" / stage-shift badge stays hidden until the reels land. When a pool empties, the resource **shifts to its next, worse stage** and refills; emptying on the **final (worst) stage ends it** — the pool is depleted and shown with its **own configurable end name** (e.g. *Pitch Black*; falls back to the final stage's name) beside a skull + crossed-out marker, glowing red on the HUD, and takes on its **own intensified terminal atmosphere** (a maxed-out diorama with a much more prominent, pulsing liquid-glass edge-glow), and is then skipped by future turn rolls (and can't be manually rolled) so it never re-announces its demise.
  - **Manual rolls** — between turns the GM can **Roll** the featured pool on demand (a dock button) for an ad-hoc check, or right-click any resource → *Roll this pool now* — same dice, stage-shift and card, without advancing the turn or the clock.
  - **Degrading atmosphere** — the featured resource's current stage drives the time HUD's tint, colour, animation, and a **WebGL diorama** that washes the bar's **right edge** (with the same liquid-glass refraction as the weather wash on the left, so weather and delving show side by side), with a dread pulse that intensifies as the stages worsen. The diorama uses the same engine as weather, now with a much larger shared archetype library — shadow, creeping rot, spores, miasma, signal static, swarms, drips, depth bubbles, runes, void, dust, rising water… Other resources show as compact stage chips.
  - **Inline GM controls** — left/right-click the featured dice to add/remove a die, a ‹ › stepper to jump stages, click a chip to feature it, and a right-click menu (feature / roll / refill / stage / hide / edit). Players see the stage + atmosphere; dice counts and cards are gated by each resource's player-visibility flag. While delving is live the dock collapses its clock controls to a short, focused row (Pass · Roll · New Delve · exit · edit).
  - **Visual editor** — configure the turn, the weather cadence, and full CRUD on resources & their stages (pool + look) with a live preview; ships **Torches** and **Corruption** presets and import/export JSON. **Disabled by default.**

---

## Installation

In Foundry: **Add-on Modules → Install Module**, then paste this **Manifest URL**:

```
https://github.com/patcharapon-j/gluniverse-clocks-and-tracker/releases/latest/download/module.json
```

This always installs the latest release. Then enable **GLUniverse — Clocks & Tracker** in your world's module settings.

---

## Usage

| Action | How |
| --- | --- |
| Toggle the HUD | `Alt+T`, or the hourglass button in the scene controls |
| Collapse / expand | Click the grip on the left of the bar |
| Reposition | Drag the grip |
| Advance time (GM) | Click a step button on the HUD dock |
| Rewind a step (GM) | **Right-click** the same step button |
| Jump to next shift (GM) | Next-shift button on the dock |
| Toggle watch / stretch view (GM) | The **Watch view / Stretch view** button on the dock (or set the default in module settings) |
| Advance one stretch (GM) | `Alt+]` |
| Set an exact date/time (GM) | Set-time button on the dock |
| Start / clear a mission countdown (GM) | The **🎯 Mission** button on the dock |
| Open the calendar | `Alt+C`, **click the date** on the HUD, or click the event chip |
| Manage events (GM) | From the calendar view → Manage Events |
| Toggle the tracker dock | `Alt+R`, or the checklist button in the scene controls |
| Add a tracker (GM) | The **+** on the dock header |
| Advance / rewind a tracker (GM) | **Left-click** the value to advance, **right-click** the value to step back (pool: left-click rolls, right-click resets) |
| Tracker controls (GM) | **Right-click** a row's **name / label area** for a context menu: edit, show or hide from players, delete |
| Reorder trackers (GM) | Drag a row's grip |
| Toggle the weather flower | `Alt+W`, or the cloud-bolt button in the scene controls (once weather is enabled) |
| Roll the weather (GM) | **Roll Weather** in the flower window — **right-click** it to rewind a step |
| Force a condition (GM) | Click any hex in the flower window |
| Toggle Delving Mode (GM) | `Alt+G`, the **Delving** dock button, or the dungeon button in the scene controls (once delving is enabled) |
| Pass a turn (GM) | `Alt+.`, or the **Pass Turn** dock button — **right-click** it to rewind a turn |
| Roll a pool now (GM) | The **Roll** dock button (featured pool), or right-click a resource → *Roll this pool now* — no turn passes |
| Adjust a resource (GM) | Left/right-click the featured dice (±1 die); the ‹ › stepper jumps stages; right-click a resource for more |
| Edit delving (GM) | The sliders button on the dock, or **Game Settings → Edit Delving** |

### Weather (GM)

Weather ships **off**. Turn it on in **Game Settings → Configure Settings → GLUniverse Clocks & Tracker → Configure Modules → Weather**, then the **Edit Weather** menu opens the visual editor (or apply the **Temperate** preset and Save). Once enabled and configured, a weather chip appears on the HUD (a separate sub-toggle, *Weather chip on the HUD*, can hide just the chip while keeping the flower) and the Hex Flower window can be opened with `Alt+W`.

- **Cadence** — choose **Auto** (the weather walks forward as in-game time passes) or **Manual** (only your Roll-now control advances it), and the **step period** (every day / N days / watch). A big time skip walks several steps at once (capped) and posts a single digest chat card instead of one per step.
- **Seasons** — each season has its own flower and Navigation Hex. When the calendar season turns, your position is kept by coordinate and the new season's flower takes over.
- **Player visibility** — players always see the current condition + recent history on the HUD. The weather-change **announcement card** can be posted **publicly** or whispered to **GM only** via the **Weather Card Visibility** setting (so players discover the weather in-fiction). Reveal the full flower (read-only) with the eye toggle in the window or the **Reveal Flower to Players** setting.

### Configuring a calendar (GM)

Open **Game Settings → Configure Settings → GLUniverse Clocks & Tracker → Edit Calendar**. Pick a preset, or edit the JSON directly, then **Save** to apply it live. The config follows Foundry's native `CalendarData` schema (`days`, `months`, `seasons`, `years`). Use **Export** to back up your calendar and **Import** to load one.

### Events & holidays

Each event has a name, a scope (single **day**, **day range**, or whole **month**), a date, and a **visible to players** toggle. Today's events show on the HUD; the next upcoming visible event shows its countdown. When there's nothing to show, the badge hides itself entirely rather than displaying a placeholder.

The GM can also flag an event as **Always show on HUD** (a pin). Pinned events keep their countdown on the badge no matter how far off they are, so an important date stays trackable even when it isn't the nearest one — toggle the pin from the create/edit form or the 📌 button in the events list.

Events also carry two optional notes: a **public note** every player can read and a **private note** only the GM sees. Event names appear directly in the calendar grid — multi-day events render as a single connected band across the days they span. **Click any day** to open a detail panel listing that day's events and notes; the GM can edit, delete, or add an event/note for that day right there. Rest days (weekends) are highlighted in the grid.

---

## Releasing (for maintainers)

Releases are cut **manually from GitHub** by [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Go to **Actions → Release → Run workflow**.
2. Pick the bump type: **patch** (`0.1.0 → 0.1.1`), **minor** (`0.1.0 → 0.2.0`), or **major** (`0.1.0 → 1.0.0`).
3. The workflow reads the current `version` in `module.json`, increments it, commits the bump back, creates the matching `vX.Y.Z` tag, zips the module, and publishes a GitHub Release with `module.json` + `module.zip` attached.

The `manifest` field always points at `releases/latest/download/module.json`, so existing installs see and apply updates automatically.

---

## License

See repository for license details.
