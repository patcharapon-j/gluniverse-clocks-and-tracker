/** Read-only month calendar with today + events, viewable by everyone.
 *  Events show their names directly in the grid (multi-day events render as a
 *  connected band); clicking a day opens an in-window detail panel with the
 *  day's events and notes. GMs can edit, delete or add events/notes from there. */

import { MODULE_ID, SETTINGS } from "../const.js";
import { TimeEngine } from "../engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CalendarView extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static async show() {
    if (!this.instance) this.instance = new this();
    const c = game.time.components;
    this.instance._viewYear ??= c.year;
    this.instance._viewMonth ??= c.month;
    await this.instance.render(true);
    return this.instance;
  }

  static DEFAULT_OPTIONS = {
    id: "glct-calendar",
    classes: ["glct", "glct-calendar"],
    tag: "div",
    window: { title: "GLCT.calendarView.title", icon: "fa-solid fa-calendar-days", resizable: false },
    position: { width: 480, height: "auto" },
    actions: {
      prevMonth: CalendarView.prototype._onPrev,
      nextMonth: CalendarView.prototype._onNext,
      today: CalendarView.prototype._onToday,
      manageEvents: CalendarView.prototype._onManageEvents,
      selectDay: CalendarView.prototype._onSelectDay,
      closeDetail: CalendarView.prototype._onCloseDetail,
      editEvent: CalendarView.prototype._onEditEvent,
      deleteEvent: CalendarView.prototype._onDeleteEvent,
      addEventForDay: CalendarView.prototype._onAddForDay
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/calendar-view.hbs` }
  };

  _viewYear = null;
  _viewMonth = null;
  _selectedDay = null;

  _months() { return game.time.calendar?.months?.values ?? []; }

  _visibleEvents() {
    return (game.settings.get(MODULE_ID, SETTINGS.events) ?? [])
      .filter(e => game.user.isGM || e.visibleToPlayers);
  }

  _describe(e) {
    const months = this._months();
    const mn = i => months[i]?.name ?? `M${(i ?? 0) + 1}`;
    switch (e.scope) {
      case "month": return game.i18n.format?.("GLCT.calendarView.allOf", { month: mn(e.month) }) ?? `All of ${mn(e.month)}`;
      case "range": return `${mn(e.month)} ${e.day} – ${mn(e.endMonth)} ${e.endDay}`;
      default: return `${mn(e.month)} ${e.day}`;
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isGM = game.user?.isGM ?? false;
    const cal = game.time.calendar;
    const weekdays = cal?.days?.values ?? [];
    const months = cal?.months?.values ?? [];
    const wdCount = Math.max(1, weekdays.length);

    const year = this._viewYear, monthIdx = this._viewMonth;
    const month = months[monthIdx] ?? months[0];
    const isLeap = cal?.isLeapYear?.(year) ?? false;
    const dayCount = (isLeap && month?.leapDays) ? month.leapDays : (month?.days ?? 30);

    // Weekday (0-based) of the first day of the viewed month, computed so that
    // intercalary days don't drift the cycle (see TimeEngine.weekdayOf).
    const firstWeekday = TimeEngine.weekdayOf(year, monthIdx, 0);

    const now = game.time.components;
    const isCurrentMonth = now.year === year && now.month === monthIdx;
    const todayNum = (now.dayOfMonth ?? 0) + 1;

    const events = this._visibleEvents();
    const onDay = (e, d) => d >= 1 && d <= dayCount && TimeEngine.matchesToday(e, monthIdx, d);

    // Multi-day events (range/month) that touch this month get a fixed "lane"
    // so their bands line up vertically from cell to cell; single-day events
    // fill in beneath. This keeps spanning events reading as one continuous bar.
    const spanning = events.filter(e =>
      (e.scope === "range" || e.scope === "month") &&
      Array.from({ length: dayCount }, (_, i) => i + 1).some(d => onDay(e, d))
    );

    const band = (e, d, column) => {
      const continuesLeft = (d > 1)
        ? onDay(e, d - 1)
        : (e.scope === "range" && monthIdx > (e.month ?? 0)) || e.scope === "month";
      const continuesRight = (d < dayCount)
        ? onDay(e, d + 1)
        : (e.scope === "range" && monthIdx < (e.endMonth ?? 0)) || e.scope === "month";
      return {
        id: e.id,
        name: e.name,
        continuesLeft,
        continuesRight,
        // Re-label the band at the start of each week row for readability.
        showLabel: !continuesLeft || column === 0,
        hasNote: !!(e.notePublic || (isGM && e.notePrivate))
      };
    };

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ inMonth: false });
    for (let d = 1; d <= dayCount; d++) {
      const wd = TimeEngine.weekdayOf(year, monthIdx, d - 1);
      const column = (firstWeekday + d - 1) % wdCount;

      // Lane row for each spanning event (empty spacer when it isn't today),
      // with trailing empties trimmed so cells don't grow needlessly.
      const lanes = spanning.map(e => onDay(e, d) ? band(e, d, column) : { empty: true });
      while (lanes.length && lanes[lanes.length - 1].empty) lanes.pop();

      const singles = events
        .filter(e => e.scope !== "range" && e.scope !== "month" && onDay(e, d))
        .map(e => band(e, d, column));

      cells.push({
        inMonth: true,
        day: d,
        isToday: isCurrentMonth && d === todayNum,
        isWeekend: !!weekdays[wd]?.isRestDay,
        isSelected: this._selectedDay === d,
        events: [...lanes, ...singles]
      });
    }
    while (cells.length % wdCount !== 0) cells.push({ inMonth: false });

    return Object.assign(context, {
      isGM,
      monthName: month?.name ?? "",
      year,
      yearLabel: game.settings.get(MODULE_ID, SETTINGS.yearLabel) || "",
      weekdayNames: weekdays.map(w => ({ label: w.abbreviation ?? w.name, rest: !!w.isRestDay })),
      wdCount,
      cells,
      detail: this._buildDetail(year, monthIdx, isGM)
    });
  }

  /** Build the detail-panel context for the currently selected day, if any. */
  _buildDetail(year, monthIdx, isGM) {
    const d = this._selectedDay;
    if (!d) return null;
    const months = this._months();
    const month = months[monthIdx];
    const cal = game.time.calendar;
    const weekdays = cal?.days?.values ?? [];
    const wd = TimeEngine.weekdayOf(year, monthIdx, d - 1);
    const weekday = weekdays[wd];

    const dayEvents = this._visibleEvents()
      .filter(e => TimeEngine.matchesToday(e, monthIdx, d))
      .map(e => ({
        id: e.id,
        name: e.name,
        when: this._describe(e),
        notePublic: e.notePublic || "",
        notePrivate: isGM ? (e.notePrivate || "") : "",
        visibleToPlayers: !!e.visibleToPlayers
      }));

    return {
      isGM,
      day: d,
      dateLabel: `${month?.name ?? ""} ${d}`,
      weekdayName: weekday?.name ?? "",
      isWeekend: !!weekday?.isRestDay,
      events: dayEvents
    };
  }

  async _onManageEvents() {
    const { EventsEditor } = await import("./events-editor.js");
    EventsEditor.show();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const grid = this.element.querySelector(".cal-grid");
    if (grid) grid.style.gridTemplateColumns = `repeat(${context.wdCount}, 1fr)`;
  }

  /* ----------------------------- day detail ----------------------------- */

  async _onSelectDay(ev, target) {
    const d = Number(target?.dataset?.day);
    if (!d) return;
    this._selectedDay = (this._selectedDay === d) ? null : d;
    this.render();
  }

  async _onCloseDetail() {
    this._selectedDay = null;
    this.render();
  }

  async _onEditEvent(ev, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-event-id]")?.dataset.eventId;
    const { EventsEditor } = await import("./events-editor.js");
    if (await EventsEditor.editEvent(id)) this.render();
  }

  async _onDeleteEvent(ev, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-event-id]")?.dataset.eventId;
    const { EventsEditor } = await import("./events-editor.js");
    if (await EventsEditor.deleteEvent(id)) this.render();
  }

  async _onAddForDay() {
    if (!game.user.isGM || !this._selectedDay) return;
    const { EventsEditor } = await import("./events-editor.js");
    const d = this._selectedDay, m = this._viewMonth;
    const created = await EventsEditor.createEvent({
      scope: "day", month: m, day: d, endMonth: m, endDay: d
    });
    if (created) this.render();
  }

  async _onPrev() {
    const n = this._months().length;
    this._selectedDay = null;
    this._viewMonth--;
    if (this._viewMonth < 0) { this._viewMonth = n - 1; this._viewYear--; }
    this.render();
  }
  async _onNext() {
    const n = this._months().length;
    this._selectedDay = null;
    this._viewMonth++;
    if (this._viewMonth >= n) { this._viewMonth = 0; this._viewYear++; }
    this.render();
  }
  async _onToday() {
    const c = game.time.components;
    this._selectedDay = null;
    this._viewYear = c.year; this._viewMonth = c.month;
    this.render();
  }
}
