/**
 * TimeEngine — the bridge between Foundry's native GameTime/CalendarData and
 * the module's Year Zero–style shift/stretch presentation.
 *
 * worldTime (seconds) is the single source of truth. Date fields come from the
 * native calendar components; the shift/stretch breakdown is derived from the
 * intra-day seconds so the two can never drift.
 */

import * as M from "./time-math.js";
import { WATCHES, DEFAULT_SHIFT_NAMES, SETTINGS, MODULE_ID } from "./const.js";

function getSetting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); }
  catch { return fallback; }
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export class TimeEngine {
  static get worldTime() { return game.time.worldTime; }
  static get calendar() { return game.time.calendar; }
  static get components() { return game.time.components; }

  /** Customizable watch names, falling back to defaults. */
  static get shiftNames() {
    const custom = getSetting(SETTINGS.shiftNames, null);
    if (Array.isArray(custom) && custom.length === WATCHES.length) return custom;
    return DEFAULT_SHIFT_NAMES;
  }

  /** Day-of-year (0-based) for a calendar position, using month lengths. */
  static dayOfYear(monthIndex, dayOfMonth0) {
    const months = this.calendar?.months?.values ?? [];
    let doy = 0;
    for (let i = 0; i < monthIndex && i < months.length; i++) doy += months[i].days ?? 0;
    return doy + dayOfMonth0;
  }

  static get daysPerYear() {
    return this.calendar?.days?.daysPerYear
      ?? (this.calendar?.months?.values ?? []).reduce((a, m) => a + (m.days ?? 0), 0)
      ?? 365;
  }

  /** Full HUD state snapshot at the current world time. */
  static getState() {
    return this.getStateAt(this.worldTime);
  }

  /** Full HUD state snapshot at an arbitrary world time (used for animation tweens). */
  static getStateAt(worldTime) {
    const c = this.calendar?.timeToComponents?.(worldTime) ?? this.components;
    const cal = this.calendar;
    const second = c.second ?? 0;
    const secOfDay = (c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60 + second;
    const t = M.decompose(secOfDay); // intra-day shift/stretch (dayOffset always 0 here)

    const watch = WATCHES[t.shiftIndex] ?? WATCHES[0];
    const names = this.shiftNames;

    const months = cal?.months?.values ?? [];
    const days = cal?.days?.values ?? [];
    const seasons = cal?.seasons?.values ?? [];
    const month = months[c.month] ?? null;
    const weekday = days[c.dayOfWeek] ?? null;
    const season = seasons[c.season] ?? null;

    const dayNum = (c.dayOfMonth ?? 0) + 1;
    const absDay = Math.floor(worldTime / M.SECONDS_PER_DAY);
    const moonPhase = ((Math.floor(((absDay % 28) / 28) * 8)) % 8 + 8) % 8;

    return {
      worldTime,
      isGM: game.user?.isGM ?? false,
      inCombat: !!game.combat?.started,

      shiftIndex: t.shiftIndex,
      stretchOfDay: t.stretchOfDay,
      stretchInShift: t.stretchInShift,
      hourOfShift: t.hourOfShift,
      stretchInHour: t.stretchInHour,
      stretchesLeftInShift: t.stretchesLeftInShift,
      shiftProgress: t.shiftProgress,
      clock: M.formatClock(t),

      watch: { key: watch.key, name: names[t.shiftIndex] ?? watch.key, ...watch },

      date: {
        day: dayNum,
        ordinal: ordinal(dayNum),
        weekday: weekday?.name ?? "",
        monthName: month?.name ?? "",
        monthAbbr: month?.abbreviation ?? month?.name ?? "",
        year: c.year,
        yearLabel: getSetting(SETTINGS.yearLabel, ""),
        dayOfYear: c.day
      },
      seasonName: season?.name ?? "",
      moonPhase,

      events: this.resolveEvents(c)
    };
  }

  /** Resolve today's events and the nearest upcoming one for the viewer. */
  static resolveEvents(components) {
    const all = getSetting(SETTINGS.events, []) ?? [];
    const isGM = game.user?.isGM ?? false;
    const visible = all.filter(e => isGM || e.visibleToPlayers);

    const curMonth = components.month;
    const curDay = (components.dayOfMonth ?? 0) + 1;
    const curDOY = components.day;
    const yearLen = this.daysPerYear;

    const today = [];
    let next = null;

    for (const e of visible) {
      const isToday = this.matchesToday(e, curMonth, curDay);
      if (isToday) { today.push(e); continue; }

      // distance (in days) to this event's start, wrapping across the year
      const startDOY = this.dayOfYear(e.month ?? 0, (e.day ?? 1) - 1);
      const delta = ((startDOY - curDOY) % yearLen + yearLen) % yearLen;
      if (delta > 0 && (!next || delta < next.days)) next = { name: e.name, days: delta };
    }

    return { today, next };
  }

  static matchesToday(e, curMonth, curDay) {
    switch (e.scope) {
      case "month": return e.month === curMonth;
      case "range": {
        if (e.month === e.endMonth) return curMonth === e.month && curDay >= e.day && curDay <= e.endDay;
        if (curMonth === e.month) return curDay >= e.day;
        if (curMonth === e.endMonth) return curDay <= e.endDay;
        return curMonth > e.month && curMonth < e.endMonth;
      }
      case "day":
      default: return e.month === curMonth && e.day === curDay;
    }
  }

  /* ----------------------------- mutations ----------------------------- */

  /** Advance (or rewind) by a named step, snapped to clean stretch boundaries. */
  static async advanceStep(step, { rewind = false } = {}) {
    let seconds = M.stepToSeconds(step);
    if (!seconds) return this.worldTime;
    if (rewind) seconds = -seconds;
    return game.time.advance(seconds);
  }

  /** Advance an arbitrary number of seconds (kept on a stretch boundary). */
  static async advanceSeconds(seconds) {
    return game.time.advance(Math.round(seconds / M.SECONDS_PER_STRETCH) * M.SECONDS_PER_STRETCH);
  }

  /** Jump forward to the start of the next watch/shift. */
  static async nextShift() {
    return game.time.advance(M.secondsToNextShift(this.worldTime));
  }

  /** Set an absolute time from calendar components (used by the set-time dialog). */
  static async setExact(components) {
    const cal = this.calendar;
    // Resolve components (year/month/dayOfMonth/hour/minute) to an absolute
    // world time via the calendar — matching CalendarView — instead of handing
    // a raw components object to game.time.set, which expects a number of
    // seconds and would otherwise silently fail to change the date.
    const time = (typeof cal?.componentsToTime === "function")
      ? cal.componentsToTime(components)
      : components;
    return game.time.set(time);
  }
}
