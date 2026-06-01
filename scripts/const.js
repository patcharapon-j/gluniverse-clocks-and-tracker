/** Shared constants for GLUniverse — Clocks & Tracker. */

export const MODULE_ID = "gluniverse-clocks-and-tracker";

/** Namespaced hooks other modules / macros can listen to. */
export const HOOKS = {
  /** Fired (callAll) after the HUD recomputes state: (state) => void */
  timeChanged: `${MODULE_ID}.timeChanged`,
  /** Fired when the active calendar definition changes: (config) => void */
  calendarChanged: `${MODULE_ID}.calendarChanged`,
  /** Fired when events/holidays are edited: (events) => void */
  eventsChanged: `${MODULE_ID}.eventsChanged`,
  /** Fired when trackers are created/edited/reordered/deleted: (trackers) => void */
  trackersChanged: `${MODULE_ID}.trackersChanged`,
  /** Fired (callAll) after the weather walk advances/rewinds/resets: (payload) => void */
  weatherChanged: `${MODULE_ID}.weatherChanged`
};

/** World-setting keys. */
export const SETTINGS = {
  calendarId: "calendarId",        // String: which preset/custom calendar is active
  calendarConfig: "calendarConfig",// Object: the stored CalendarConfig (custom edits)
  events: "events",                // Array: events & holidays
  shiftNames: "shiftNames",        // Array<string>: customizable watch names
  shiftLevelMode: "shiftLevelMode",// Boolean (world): track/display at shift granularity only
  mission: "mission",              // Object (world): {active,target,label} stretch-countdown to a target time
  hudCollapsed: "hudCollapsed",    // Boolean (client)
  hudPosition: "hudPosition",      // Object {top,cx} centre-anchored (client; legacy {top,left} migrated)
  sceneTint: "sceneTint",          // Boolean: tint canvas with the active shift
  yearLabel: "yearLabel",          // String: era suffix shown after the year, e.g. "AR"
  trackers: "trackers",            // Array: GM-managed tracker definitions (world)
  trackerHudPosition: "trackerHudPosition", // Object {top,left} (client)
  trackerHudHidden: "trackerHudHidden",     // Boolean (client): dock hidden on this screen
  trackerHudCompact: "trackerHudCompact",   // Boolean (client): dock collapsed to playing-card minis

  // ---- Weather (Hex Flower Game Engine) ----
  weatherEnabled: "weatherEnabled",                   // Boolean (world): master opt-in (default false)
  weather: "weather",                                 // Object (world): full config + live walk state (§4.5)
  weatherCadenceMode: "weatherCadenceMode",           // String (world): "auto" | "manual"
  weatherCadencePeriod: "weatherCadencePeriod",       // String (world): "day" | "days:N" | "shift"
  weatherPlayerFlowerVisible: "weatherPlayerFlowerVisible", // Boolean (world): reveal the flower to players
  weatherShowDice: "weatherShowDice",                 // Boolean (world): animate Dice So Nice 3D dice on weather rolls
  weatherCardVisibility: "weatherCardVisibility",     // String (world): "public" | "gm" — who sees the weather-change chat card
  weatherHudPosition: "weatherHudPosition",           // Object (client): Hex Flower window position
  weatherHudHidden: "weatherHudHidden"                // Boolean (client): window hidden on this screen
};

/** The tracker types the dock can render. */
export const TRACKER_TYPES = ["point", "clock", "pool", "task", "hazard", "separator"];

/**
 * The four daily watches (YZE shifts), chronological from midnight.
 * Names are defaults; the GM may override them via the shiftNames setting.
 * Colours drive the per-shift HUD theming (CSS custom properties).
 */
export const WATCHES = [
  { key: "night", tint: "#6b86d6", tint2: "#1a2233", glow: "rgba(120,150,225,.5)", soft: "rgba(120,150,225,.18)" },
  { key: "dawn",  tint: "#e0a368", tint2: "#2f2316", glow: "rgba(230,170,100,.5)", soft: "rgba(230,170,100,.18)" },
  { key: "day",   tint: "#6fb8d8", tint2: "#162a36", glow: "rgba(110,184,216,.5)", soft: "rgba(110,184,216,.18)" },
  { key: "dusk",  tint: "#b884d0", tint2: "#241430", glow: "rgba(184,132,208,.5)", soft: "rgba(184,132,208,.18)" }
];

/** Default watch display names (overridable per world). */
export const DEFAULT_SHIFT_NAMES = ["Night Watch", "Dawn Watch", "Day Watch", "Dusk Watch"];

/** Step names usable by GM controls / keybindings. */
export const STEPS = ["stretch", "hour", "shift", "day"];

/* ============================================================
   Weather — Hex Flower Game Engine constants.
   The flower is a fixed 19-hex topology (see weather/hex-geometry.js).
   Weather outcomes are a composable "motion archetype × style (tints)";
   shipped "kinds" are named archetype+tint presets (see weather/presets.js).
   ============================================================ */

/** The 6 hex-face directions, clockwise from the top (matches HEX_LAYOUT). */
export const WEATHER_DIRECTIONS = ["up", "upperRight", "lowerRight", "down", "lowerLeft", "upperLeft"];

/** Human display order for the Navigation-Hex editor (clock-face). */
export const WEATHER_DIRECTION_LABELS = {
  up: "GLCT.weather.dir.up",
  upperRight: "GLCT.weather.dir.upperRight",
  lowerRight: "GLCT.weather.dir.lowerRight",
  down: "GLCT.weather.dir.down",
  lowerLeft: "GLCT.weather.dir.lowerLeft",
  upperLeft: "GLCT.weather.dir.upperLeft"
};

/** Pixi motion archetypes the effects engine implements (decision #8, §4.6). */
export const WEATHER_ARCHETYPES = [
  "clear", "streaks", "flakes", "volume", "flashes", "motes", "embers", "gusts", "shards"
];

/** Archetypes that read better with additive blending (glowing particles). */
export const WEATHER_ADDITIVE_ARCHETYPES = ["flashes", "motes", "embers"];

/** Drift directions an archetype may honour. */
export const WEATHER_DRIFTS = ["fall", "rise", "left", "right", "still"];

/** Supported Navigation-Hex dice systems (extensible). */
export const WEATHER_DICE = ["2d6", "d6+d8"];

/** Number of history steps retained on the walk (decision #4). */
export const WEATHER_HISTORY_CAP = 60;

/** Maximum auto-steps executed for one big time skip (decision #3). */
export const WEATHER_STEP_CAP = 60;
