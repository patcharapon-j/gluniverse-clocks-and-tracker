/** GM editor for events & holidays (single day, day range, or whole month). */

import { MODULE_ID, SETTINGS } from "../const.js";
import { GlctHud } from "./hud.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class EventsEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static async show() {
    if (!game.user.isGM) return;
    if (!this.instance) this.instance = new this();
    await this.instance.render(true);
    return this.instance;
  }

  static DEFAULT_OPTIONS = {
    id: "glct-events",
    classes: ["glct", "glct-events"],
    tag: "div",
    window: { title: "GLCT.events.title", icon: "fa-solid fa-star", resizable: true },
    position: { width: 520, height: "auto" },
    actions: {
      addEvent: EventsEditor.prototype._onAdd,
      editEvent: EventsEditor.prototype._onEdit,
      deleteEvent: EventsEditor.prototype._onDelete,
      toggleVis: EventsEditor.prototype._onToggleVis
    }
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/events-editor.hbs` } };

  static getEvents() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.events) ?? []);
  }
  static async setEvents(events) {
    await game.settings.set(MODULE_ID, SETTINGS.events, events);
    GlctHud.refreshState();
  }

  _months() { return game.time.calendar?.months?.values ?? []; }

  _describe(e) {
    const months = this._months();
    const mn = i => months[i]?.name ?? `M${(i ?? 0) + 1}`;
    switch (e.scope) {
      case "month": return `All of ${mn(e.month)}`;
      case "range": return `${mn(e.month)} ${e.day} – ${mn(e.endMonth)} ${e.endDay}`;
      default: return `${mn(e.month)} ${e.day}`;
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const events = EventsEditor.getEvents().map(e => ({ ...e, when: this._describe(e) }));
    return Object.assign(context, { events });
  }

  /** Build the create/edit dialog form HTML. */
  _formContent(e = {}) {
    const months = this._months();
    const opts = (sel) => months.map((m, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${m.name}</option>`).join("");
    return `
      <div class="glct-evform" style="display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;">
        <label>${game.i18n.localize("GLCT.events.name")}</label>
        <input type="text" name="name" value="${foundry.utils.escapeHTML?.(e.name ?? "") ?? (e.name ?? "")}">
        <label>Scope</label>
        <select name="scope">
          <option value="day"   ${e.scope === "day"   || !e.scope ? "selected" : ""}>${game.i18n.localize("GLCT.events.scope.day")}</option>
          <option value="range" ${e.scope === "range" ? "selected" : ""}>${game.i18n.localize("GLCT.events.scope.range")}</option>
          <option value="month" ${e.scope === "month" ? "selected" : ""}>${game.i18n.localize("GLCT.events.scope.month")}</option>
        </select>
        <label>Start month</label>  <select name="month">${opts(e.month ?? 0)}</select>
        <label>Start day</label>    <input type="number" name="day" min="1" value="${e.day ?? 1}">
        <label>End month</label>    <select name="endMonth">${opts(e.endMonth ?? e.month ?? 0)}</select>
        <label>End day</label>      <input type="number" name="endDay" min="1" value="${e.endDay ?? e.day ?? 1}">
        <label>${game.i18n.localize("GLCT.events.visibleToPlayers")}</label>
        <input type="checkbox" name="visibleToPlayers" ${e.visibleToPlayers ? "checked" : ""}>
      </div>`;
  }

  async _promptEvent(existing) {
    try {
      return await this._promptEventInner(existing);
    } catch { return null; }   // dialog dismissed
  }

  async _promptEventInner(existing) {
    const result = await DialogV2.prompt({
      window: { title: existing ? game.i18n.localize("GLCT.events.title") : game.i18n.localize("GLCT.events.add") },
      content: this._formContent(existing ?? {}),
      ok: {
        label: game.i18n.localize("GLCT.editor.save"),
        callback: (event, button) => {
          const f = button.form;
          return {
            name: f.name.value.trim() || "Event",
            scope: f.scope.value,
            month: Number(f.month.value),
            day: Math.max(1, Number(f.day.value)),
            endMonth: Number(f.endMonth.value),
            endDay: Math.max(1, Number(f.endDay.value)),
            visibleToPlayers: f.visibleToPlayers.checked
          };
        }
      }
    });
    return result ?? null;
  }

  async _onAdd() {
    const data = await this._promptEvent();
    if (!data) return;
    const events = EventsEditor.getEvents();
    events.push({ id: foundry.utils.randomID(), ...data });
    await EventsEditor.setEvents(events);
    this.render();
  }

  async _onEdit(ev, target) {
    const id = target.closest("[data-event-id]")?.dataset.eventId;
    const events = EventsEditor.getEvents();
    const existing = events.find(e => e.id === id);
    if (!existing) return;
    const data = await this._promptEvent(existing);
    if (!data) return;
    Object.assign(existing, data);
    await EventsEditor.setEvents(events);
    this.render();
  }

  async _onDelete(ev, target) {
    const id = target.closest("[data-event-id]")?.dataset.eventId;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("GLCT.events.title") },
      content: `<p>Delete this event?</p>`
    });
    if (!confirmed) return;
    await EventsEditor.setEvents(EventsEditor.getEvents().filter(e => e.id !== id));
    this.render();
  }

  async _onToggleVis(ev, target) {
    const id = target.closest("[data-event-id]")?.dataset.eventId;
    const events = EventsEditor.getEvents();
    const e = events.find(x => x.id === id);
    if (!e) return;
    e.visibleToPlayers = !e.visibleToPlayers;
    await EventsEditor.setEvents(events);
    this.render();
  }
}
