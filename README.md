# GLUniverse — Clocks & Tracker

A premium, tactile in-game **calendar and time HUD** for Foundry VTT, built on Foundry's native time system. Define your own calendar (fantasy or real-world), track time with a Year Zero–style shift/stretch clock, advance time with animated passage, and manage events & holidays — all from a compact top-bar HUD.

> Compatible with **Foundry VTT v13–v14**. Time is driven through Foundry's native `game.time`, so advancing time propagates to all clients and expires PF2e / D&D 5e effects automatically.

---

## Features

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
| Open the calendar | `Alt+C`, or click the event chip |
| Manage events (GM) | From the calendar view → Manage Events |
| Toggle the tracker dock | `Alt+R`, or the checklist button in the scene controls |
| Add a tracker (GM) | The **+** on the dock header |
| Advance / rewind a tracker (GM) | **Left-click** the value to advance, **right-click** the value to step back (pool: left-click rolls, right-click resets) |
| Tracker controls (GM) | **Right-click** a row's **name / label area** for a context menu: edit, show or hide from players, delete |
| Reorder trackers (GM) | Drag a row's grip |

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
