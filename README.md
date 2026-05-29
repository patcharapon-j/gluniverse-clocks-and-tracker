# GLUniverse — Clocks & Tracker

A premium, tactile in-game **calendar and time HUD** for Foundry VTT, built on Foundry's native time system. Define your own calendar (fantasy or real-world), track time with a Year Zero–style shift/stretch clock, advance time with animated passage, and manage events & holidays — all from a compact top-bar HUD.

> Compatible with **Foundry VTT v13–v14**. Time is driven through Foundry's native `game.time`, so advancing time propagates to all clients and expires PF2e / D&D 5e effects automatically.

---

## Features

- **Top-bar HUD** — a polished, hideable bar anchored to the top of the screen. Drag to reposition, click the grip to collapse to a compact dual-ring readout.
- **Year Zero–style time model** — each day is 4 **shifts** (*Night / Dawn / Day / Dusk Watch*) of 6 hours; each hour is 6 **stretches** of 10 minutes. The HUD shows the active shift, the current hour, and stretch progress as tactile pips and a dual ring.
- **Slot-reel clock** — digits spin into place like a slot machine when time changes.
- **Animated time passage** — advancing an hour or a shift visibly *ticks* forward one stretch at a time; day-or-larger jumps snap instantly.
- **Custom calendars** — GM-editable calendar config supporting any month/weekday/season layout, leap years, and intercalary months. Ships with **Gregorian**, **Golarion** (Pathfinder), and **Harptos** (Forgotten Realms) presets. Import/export as JSON.
- **Events & holidays** — single day, day range, or whole month. Mark each event visible or hidden to players. Players get a read-only calendar view.
- **Combat aware** — reflects combat state on the HUD (time only advances when the GM advances it).
- **Per-shift theming** — subtle color tint and an optional full-scene glow that shifts with the time of day.

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
| Advance one stretch (GM) | `Alt+]` |
| Set an exact date/time (GM) | Set-time button on the dock |
| Open the calendar | `Alt+C`, or click the event chip |
| Manage events (GM) | From the calendar view → Manage Events |

### Configuring a calendar (GM)

Open **Game Settings → Configure Settings → GLUniverse Clocks & Tracker → Edit Calendar**. Pick a preset, or edit the JSON directly, then **Save** to apply it live. The config follows Foundry's native `CalendarData` schema (`days`, `months`, `seasons`, `years`). Use **Export** to back up your calendar and **Import** to load one.

### Events & holidays

Each event has a name, a scope (single **day**, **day range**, or whole **month**), a date, and a **visible to players** toggle. Today's events show on the HUD; the next upcoming visible event shows its countdown.

---

## Releasing (for maintainers)

Releases are automated by [`.github/workflows/release.yml`](.github/workflows/release.yml). There are three ways to cut a release:

**Recommended — auto-increment from the Actions tab:**

1. Go to **Actions → Release → Run workflow**.
2. Pick the bump type: **patch** (`0.1.0 → 0.1.1`), **minor** (`0.1.0 → 0.2.0`), or **major** (`0.1.0 → 1.0.0`).
3. The workflow reads the current `version` in `module.json`, increments it, commits the bump back, creates the matching tag, zips the module, and publishes a GitHub Release with `module.json` + `module.zip` attached.

**Manual alternatives** (still supported):

- Push a version tag like `0.2.0` or `v0.2.0`; the tag becomes the version.
- Create a **GitHub Release** with such a tag.

In all cases the workflow stamps the version and URLs into `module.json`. The `manifest` field always points at `releases/latest/download/module.json`, so existing installs see and apply updates automatically.

---

## License

See repository for license details.
