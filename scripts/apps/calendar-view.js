/** Read-only month calendar with today + events, viewable by everyone. */

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
    position: { width: 460, height: "auto" },
    actions: {
      prevMonth: CalendarView.prototype._onPrev,
      nextMonth: CalendarView.prototype._onNext,
      today: CalendarView.prototype._onToday,
      manageEvents: CalendarView.prototype._onManageEvents
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/calendar-view.hbs` }
  };

  _viewYear = null;
  _viewMonth = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const cal = game.time.calendar;
    const weekdays = cal?.days?.values ?? [];
    const months = cal?.months?.values ?? [];
    const wdCount = Math.max(1, weekdays.length);

    const year = this._viewYear, monthIdx = this._viewMonth;
    const month = months[monthIdx] ?? months[0];
    const isLeap = cal?.isLeapYear?.(year) ?? false;
    const dayCount = (isLeap && month?.leapDays) ? month.leapDays : (month?.days ?? 30);

    // weekday of the first day of the viewed month
    let firstWeekday = 0;
    try {
      const t0 = cal.componentsToTime({ year, month: monthIdx, dayOfMonth: 0, hour: 0, minute: 0, second: 0 });
      firstWeekday = cal.timeToComponents(t0).dayOfWeek ?? 0;
    } catch { firstWeekday = 0; }

    const now = game.time.components;
    const isCurrentMonth = now.year === year && now.month === monthIdx;
    const todayNum = (now.dayOfMonth ?? 0) + 1;

    const events = (game.settings.get(MODULE_ID, SETTINGS.events) ?? [])
      .filter(e => game.user.isGM || e.visibleToPlayers);

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ inMonth: false });
    for (let d = 1; d <= dayCount; d++) {
      cells.push({
        inMonth: true,
        day: d,
        isToday: isCurrentMonth && d === todayNum,
        events: events.filter(e => TimeEngine.matchesToday(e, monthIdx, d))
      });
    }
    while (cells.length % wdCount !== 0) cells.push({ inMonth: false });

    return Object.assign(context, {
      isGM: game.user?.isGM ?? false,
      monthName: month?.name ?? "",
      year,
      yearLabel: game.settings.get(MODULE_ID, SETTINGS.yearLabel) || "",
      weekdayNames: weekdays.map(w => w.abbreviation ?? w.name),
      wdCount,
      cells
    });
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

  _months() { return game.time.calendar?.months?.values ?? []; }

  async _onPrev() {
    const n = this._months().length;
    this._viewMonth--;
    if (this._viewMonth < 0) { this._viewMonth = n - 1; this._viewYear--; }
    this.render();
  }
  async _onNext() {
    const n = this._months().length;
    this._viewMonth++;
    if (this._viewMonth >= n) { this._viewMonth = 0; this._viewYear++; }
    this.render();
  }
  async _onToday() {
    const c = game.time.components;
    this._viewYear = c.year; this._viewMonth = c.month;
    this.render();
  }
}
