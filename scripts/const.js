/** Shared constants for GLUniverse — Clocks & Tracker. */

export const MODULE_ID = "gluniverse-clocks-and-tracker";

/** Socket channel for GM-authoritative actions requested by players. */
export const SOCKET = `module.${MODULE_ID}`;

/** Namespaced hooks other modules / macros can listen to. */
export const HOOKS = {
  /** Fired (callAll) after the HUD recomputes state: (state) => void */
  timeChanged: `${MODULE_ID}.timeChanged`,
  /** Fired when the active calendar definition changes: (config) => void */
  calendarChanged: `${MODULE_ID}.calendarChanged`,
  /** Fired when events/holidays are edited: (events) => void */
  eventsChanged: `${MODULE_ID}.eventsChanged`,
  /** Fired when trackers are created/edited/reordered/deleted: (trackers) => void */
  trackersChanged: `${MODULE_ID}.trackersChanged`
};

/** World-setting keys. */
export const SETTINGS = {
  calendarId: "calendarId",        // String: which preset/custom calendar is active
  calendarConfig: "calendarConfig",// Object: the stored CalendarConfig (custom edits)
  events: "events",                // Array: events & holidays
  shiftNames: "shiftNames",        // Array<string>: customizable watch names
  shiftLevelMode: "shiftLevelMode",// Boolean (world): track/display at shift granularity only
  hudCollapsed: "hudCollapsed",    // Boolean (client)
  hudPosition: "hudPosition",      // Object {top,cx} centre-anchored (client; legacy {top,left} migrated)
  sceneTint: "sceneTint",          // Boolean: tint canvas with the active shift
  yearLabel: "yearLabel",          // String: era suffix shown after the year, e.g. "AR"
  trackers: "trackers",            // Array: GM-managed tracker definitions (world)
  trackerHudPosition: "trackerHudPosition", // Object {top,left} (client)
  trackerHudHidden: "trackerHudHidden",     // Boolean (client): dock hidden on this screen
  trackerHudCompact: "trackerHudCompact"    // Boolean (client): dock collapsed to playing-card minis
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
