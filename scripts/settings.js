/** World/client settings registration. */

import { MODULE_ID, SETTINGS, DEFAULT_SHIFT_NAMES } from "./const.js";
import { PRESETS, DEFAULT_PRESET } from "./calendar/presets.js";
import { applyCalendar } from "./calendar/calendar.js";
import { GlctHud } from "./apps/hud.js";
import { TrackerHud } from "./apps/tracker-hud.js";
import { registerCalendarMenu } from "./apps/calendar-editor.js";
import { registerShiftNamesMenu } from "./apps/shift-names-editor.js";
import { registerWeatherMenu } from "./apps/weather-editor.js";
import { WeatherHud } from "./apps/weather-hud.js";
import { WeatherEngine } from "./weather/engine.js";
import { makeDefaultWeather } from "./weather/presets.js";
import { registerSupportMenu } from "./apps/support-editor.js";
import { SupportHud } from "./apps/support-hud.js";
import { makeDefaultSupports, SupportStore } from "./support/support-store.js";
import { registerDelvingMenu } from "./apps/delving-editor.js";
import { makeDefaultDelving } from "./delving/presets.js";

export function registerSettings() {
  const choices = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name]));

  registerCalendarMenu();
  registerShiftNamesMenu();
  registerWeatherMenu();
  registerSupportMenu();
  registerDelvingMenu();

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

  // Mission countdown (world). GM-set via the HUD dock; players see the same
  // adapted meter. Stored as {active,target,label}; target is an absolute,
  // stretch-snapped world time. Repaint the HUD on any change.
  game.settings.register(MODULE_ID, SETTINGS.mission, {
    scope: "world", config: false, type: Object,
    default: { active: false, target: 0, label: "" },
    onChange: () => GlctHud.refreshState()
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

  /* ---------------------------- Weather ---------------------------- */

  // Master opt-in (decision D1). Ships off so calendar-only worlds are untouched.
  game.settings.register(MODULE_ID, SETTINGS.weatherEnabled, {
    name: "GLCT.weather.settings.enabled.name",
    hint: "GLCT.weather.settings.enabled.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => {
      GlctHud.refreshWeather();
      WeatherHud.refresh();
      if (game.user?.isGM) WeatherEngine.evaluate();
    }
  });

  // Full config + live walk state (§4.5). Config:false — edited via the menu.
  game.settings.register(MODULE_ID, SETTINGS.weather, {
    scope: "world", config: false, type: Object, default: makeDefaultWeather(),
    onChange: () => { GlctHud.refreshWeather(); WeatherHud.refresh(); }
  });

  game.settings.register(MODULE_ID, SETTINGS.weatherCadenceMode, {
    name: "GLCT.weather.settings.cadenceMode.name",
    hint: "GLCT.weather.settings.cadenceMode.hint",
    scope: "world", config: true, type: String, default: "auto",
    choices: { auto: "GLCT.weather.settings.cadenceMode.auto", manual: "GLCT.weather.settings.cadenceMode.manual" }
  });

  game.settings.register(MODULE_ID, SETTINGS.weatherCadencePeriod, {
    name: "GLCT.weather.settings.cadencePeriod.name",
    hint: "GLCT.weather.settings.cadencePeriod.hint",
    scope: "world", config: true, type: String, default: "day",
    choices: {
      day: "GLCT.weather.settings.cadencePeriod.day",
      "days:2": "GLCT.weather.settings.cadencePeriod.days2",
      "days:3": "GLCT.weather.settings.cadencePeriod.days3",
      "days:7": "GLCT.weather.settings.cadencePeriod.days7",
      shift: "GLCT.weather.settings.cadencePeriod.shift"
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.weatherPlayerFlowerVisible, {
    name: "GLCT.weather.settings.playerFlower.name",
    hint: "GLCT.weather.settings.playerFlower.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => WeatherHud.refresh()
  });

  // Roll real 3D dice (Dice So Nice) when the weather walk rolls its Navigation
  // Hex — manual steps and single-period auto advances. Multi-day skips stay
  // silent (no animation flood). Honoured only if Dice So Nice is installed.
  game.settings.register(MODULE_ID, SETTINGS.weatherShowDice, {
    name: "GLCT.weather.settings.showDice.name",
    hint: "GLCT.weather.settings.showDice.hint",
    scope: "world", config: true, type: Boolean, default: true
  });

  // Who sees the weather-change announcement card: posted to everyone, or
  // whispered to the GMs only (so players discover the weather in-fiction).
  game.settings.register(MODULE_ID, SETTINGS.weatherCardVisibility, {
    name: "GLCT.weather.settings.cardVisibility.name",
    hint: "GLCT.weather.settings.cardVisibility.hint",
    scope: "world", config: true, type: String, default: "public",
    choices: {
      public: "GLCT.weather.settings.cardVisibility.public",
      gm: "GLCT.weather.settings.cardVisibility.gm"
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.weatherHudPosition, {
    scope: "client", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.weatherHudHidden, {
    scope: "client", config: false, type: Boolean, default: false
  });

  /* ---------------------------- Mission Support ---------------------------- */

  // Master opt-in. Ships off so worlds that don't use support NPCs are untouched.
  game.settings.register(MODULE_ID, SETTINGS.supportEnabled, {
    name: "GLCT.support.settings.enabled.name",
    hint: "GLCT.support.settings.enabled.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: (on) => {
      if (on) SupportHud.open();
      else SupportHud.instance?.close?.({ animate: false });
    }
  });

  // Roster + active id + per-support live state. Config:false — edited via the menu.
  game.settings.register(MODULE_ID, SETTINGS.supports, {
    scope: "world", config: false, type: Object, default: makeDefaultSupports(),
    onChange: () => SupportHud.refresh()
  });

  // GM show/hide the coin for players (e.g. off-mission). World-scope so it
  // reveals/hides on every client at once.
  game.settings.register(MODULE_ID, SETTINGS.supportHudVisibleToPlayers, {
    scope: "world", config: false, type: Boolean, default: false,
    onChange: () => SupportHud.refresh()
  });

  game.settings.register(MODULE_ID, SETTINGS.supportHudPosition, {
    scope: "client", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.supportHudHidden, {
    scope: "client", config: false, type: Boolean, default: false
  });

  // Show the active support's passive Effect icon on party tokens. World-scope so
  // the choice is consistent for everyone; re-seats the aura live when toggled.
  game.settings.register(MODULE_ID, SETTINGS.supportPassiveTokenIcon, {
    name: "GLCT.support.settings.passiveTokenIcon.name",
    hint: "GLCT.support.settings.passiveTokenIcon.hint",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => SupportStore.applyPassive()
  });

  /* ---------------------------- Delving Mode ---------------------------- */

  // Master opt-in. Ships off so worlds that don't delve are untouched. Toggling
  // it re-renders the HUD structure so the GM's delving dock controls appear/vanish.
  game.settings.register(MODULE_ID, SETTINGS.delvingEnabled, {
    name: "GLCT.delving.settings.enabled.name",
    hint: "GLCT.delving.settings.enabled.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => { GlctHud.refreshStructure(); GlctHud.refreshDelving(); }
  });

  // Full config + live delve state. Config:false — edited via the menu / HUD.
  game.settings.register(MODULE_ID, SETTINGS.delving, {
    scope: "world", config: false, type: Object, default: makeDefaultDelving(),
    onChange: () => GlctHud.refreshDelving()
  });
}
