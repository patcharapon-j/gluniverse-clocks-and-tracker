/** World/client settings registration. */

import { MODULE_ID, SETTINGS, DEFAULT_SHIFT_NAMES } from "./const.js";
import { PRESETS, DEFAULT_PRESET } from "./calendar/presets.js";
import { applyCalendar } from "./calendar/calendar.js";
import { GlctHud } from "./apps/hud.js";
import { TrackerHud } from "./apps/tracker-hud.js";
import { registerCalendarMenu } from "./apps/calendar-editor.js";

export function registerSettings() {
  const choices = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name]));

  registerCalendarMenu();

  game.settings.register(MODULE_ID, SETTINGS.calendarId, {
    name: "GLCT.settings.calendar.name",
    hint: "GLCT.settings.calendar.hint",
    scope: "world", config: true, type: String,
    choices, default: DEFAULT_PRESET,
    onChange: () => { applyCalendar({ reinitialize: true }); GlctHud.refreshState(); }
  });

  game.settings.register(MODULE_ID, SETTINGS.calendarConfig, {
    scope: "world", config: false, type: Object, default: null,
    onChange: () => { applyCalendar({ reinitialize: true }); GlctHud.refreshState(); }
  });

  game.settings.register(MODULE_ID, SETTINGS.events, {
    name: "GLCT.settings.events.name", hint: "GLCT.settings.events.hint",
    scope: "world", config: false, type: Array, default: [],
    onChange: () => GlctHud.refreshState()
  });

  game.settings.register(MODULE_ID, SETTINGS.shiftNames, {
    scope: "world", config: false, type: Array, default: DEFAULT_SHIFT_NAMES,
    onChange: () => GlctHud.refreshState()
  });

  game.settings.register(MODULE_ID, SETTINGS.yearLabel, {
    scope: "world", config: false, type: String, default: "A.S.",
    onChange: () => GlctHud.refreshState()
  });

  game.settings.register(MODULE_ID, SETTINGS.sceneTint, {
    name: "GLCT.settings.sceneLight.name", hint: "GLCT.settings.sceneLight.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => GlctHud.refreshState()
  });

  // World-wide display granularity: when on, the HUD focuses on the current
  // shift (watch) and tucks away the HH:MM clock + stretch meter. Time still
  // advances/stores in stretches; this only changes presentation. The on-HUD
  // toggle writes this same setting, so the value below is just the default.
  game.settings.register(MODULE_ID, SETTINGS.shiftLevelMode, {
    name: "GLCT.settings.shiftMode.name", hint: "GLCT.settings.shiftMode.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => GlctHud.applyShiftMode()
  });

  game.settings.register(MODULE_ID, SETTINGS.hudCollapsed, {
    scope: "client", config: false, type: Boolean, default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.hudPosition, {
    scope: "client", config: false, type: Object, default: {}
  });

  // GM-managed trackers (world). Changes broadcast to all clients → repaint the dock.
  game.settings.register(MODULE_ID, SETTINGS.trackers, {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => TrackerHud.refresh()
  });

  game.settings.register(MODULE_ID, SETTINGS.trackerHudPosition, {
    scope: "client", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.trackerHudHidden, {
    scope: "client", config: false, type: Boolean, default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.trackerHudCompact, {
    scope: "client", config: false, type: Boolean, default: false
  });
}
