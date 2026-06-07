/**
 * DelvingStore — the data layer + turn engine for Delving Mode (mirrors
 * WeatherStore / TrackerStore: a static class, one world-scope setting is the
 * source of truth, every mutation is GM-only and propagates to all clients via
 * the setting's onChange → repaint + HOOKS.delvingChanged pipeline).
 *
 * Delving is a presentation mode: while `data.active`, the HUD steps the clock
 * aside for a turn counter + the featured resource's degrading atmosphere, but
 * game.time keeps advancing under the hood. The GM presses "Pass Turn" to
 * advance time by the configured turn span; each turn rolls every resource's
 * current-stage pool (drop dice ≤ discard, exactly like the tracker pool) and —
 * every N turns — the weather. A resource whose pool empties shifts to its next,
 * worse stage and refills; the final stage clamps at 0 and persists.
 *
 * Delving is GM-authoritative (Pass Turn is a GM control), so unlike the tracker
 * pool there is no player round-trip: the GM rolls, persists, and posts the card.
 * The in-card 3D dice tumble animates client-side from the card's flags.
 */

import {
  MODULE_ID, SETTINGS, HOOKS, DELVING_UNITS, DELVING_TURN_COUNT_RANGE,
  DELVING_WEATHER_TURNS_RANGE, DELVING_DICE_SIZE_RANGE, DELVING_DICE_COUNT_RANGE,
  DELVING_STAGE_RANGE, DELVING_HISTORY_CAP, WEATHER_ARCHETYPES
} from "../const.js";
import {
  SECONDS_PER_STRETCH, STRETCHES_PER_HOUR, SECONDS_PER_SHIFT, SECONDS_PER_DAY
} from "../time-math.js";
import { TimeEngine } from "../engine.js";
import { WeatherStore } from "../weather/weather-store.js";
import { WeatherEngine } from "../weather/engine.js";
import { makeDefaultDelving, makeResource, makeStage } from "./presets.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const int = (v, fallback = 0) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : fallback; };
const hex6 = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : fallback);

export class DelvingStore {
  /* ------------------------------- reads ------------------------------- */

  static get enabled() {
    try { return !!game.settings.get(MODULE_ID, SETTINGS.delvingEnabled); } catch { return false; }
  }

  /** The full config object (deep-cloned), guaranteed structurally valid. */
  static get data() {
    let raw = null;
    try { raw = game.settings.get(MODULE_ID, SETTINGS.delving); } catch { /* ignore */ }
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.resources)) return makeDefaultDelving();
    return foundry.utils.deepClone(raw);
  }

  /** True when delving display is live (feature on AND the GM has it switched on). */
  static get active() {
    if (!this.enabled) return false;
    try { return !!game.settings.get(MODULE_ID, SETTINGS.delving)?.active; } catch { return false; }
  }

  /** While delving is live, the weather's time-period auto-cadence is suspended
   *  (weather is turn-driven instead). Read by WeatherEngine without importing us. */
  static get suspendsWeatherCadence() { return this.active; }

  static get turn() {
    const t = this.data.turn ?? {};
    return {
      unit: DELVING_UNITS.includes(t.unit) ? t.unit : "stretch",
      count: clamp(int(t.count, 1), DELVING_TURN_COUNT_RANGE.min, DELVING_TURN_COUNT_RANGE.max),
      label: String(t.label ?? "Turn").slice(0, 24) || "Turn"
    };
  }

  static get weatherEveryTurns() {
    return clamp(int(this.data.weatherEveryTurns, 0), DELVING_WEATHER_TURNS_RANGE.min, DELVING_WEATHER_TURNS_RANGE.max);
  }

  static resources(data = this.data) { return data.resources ?? []; }

  static get(id, data = this.data) { return this.resources(data).find(r => r.id === id) ?? null; }

  /** The resource that drives the HUD atmosphere: the featured one, else the first. */
  static featured(data = this.data) {
    const list = this.resources(data);
    return list.find(r => r.id === data.featuredId) ?? list[0] ?? null;
  }

  /** Resources the current viewer may see (GM sees all; players see visible ones). */
  static visibleResources(data = this.data) {
    const isGM = game.user?.isGM ?? false;
    return this.resources(data).filter(r => isGM || r.visibleToPlayers);
  }

  /** The live effect spec of a resource's current stage (feeds the EffectField). */
  static stageEffect(resource) {
    const st = resource?.stages?.[resource.stageIndex] ?? resource?.stages?.[0] ?? null;
    return st?.effect ?? null;
  }

  /* ------------------------------- writes (GM) ------------------------------- */

  static async save(data, { payload = null } = {}) {
    if (!game.user.isGM) return;
    this._sanitize(data);
    await game.settings.set(MODULE_ID, SETTINGS.delving, data);
    Hooks.callAll(HOOKS.delvingChanged, payload ?? { reason: "save", data });
  }

  /** Read → mutate → save convenience. `mutator(data)` may return a payload. */
  static async update(mutator, opts = {}) {
    if (!game.user.isGM) return;
    const data = this.data;
    const payload = mutator(data) ?? null;
    await this.save(data, { payload, ...opts });
  }

  /**
   * Toggle delving display on/off (the GM may flip this mid-session). The delve
   * SESSION (counters + resource state) persists across toggles — turning off
   * just restores the clock view. Turning off hands the weather cadence back to
   * its time-period engine, re-seeded to "now" so it doesn't retroactively walk.
   */
  static async setActive(on) {
    if (!game.user.isGM) return;
    await this.update(data => { data.active = !!on; return { reason: on ? "activate" : "deactivate" }; });
    if (!on) { try { await WeatherEngine.reseedCadence(); } catch { /* ignore */ } }
  }

  /** Zero the counters and refill every resource to its first stage (a fresh delve). */
  static async resetDelve() {
    await this.update(data => {
      data.turnsElapsed = 0;
      data.turnsSinceWeather = 0;
      data.history = [];
      for (const r of data.resources ?? []) {
        r.stageIndex = 0;
        r.current = int(r.stages?.[0]?.count, 0);
      }
      return { reason: "reset" };
    });
  }

  static async setFeatured(id) {
    await this.update(data => { if (this.get(id, data)) data.featuredId = id; return { reason: "featured" }; });
  }

  /** GM nudge a resource's remaining dice ±delta (clamped to 0..max). */
  static async editDice(id, delta) {
    await this.update(data => {
      const r = this.get(id, data);
      if (!r) return null;
      r.current = clamp(int(r.current) + delta, DELVING_DICE_COUNT_RANGE.min, DELVING_DICE_COUNT_RANGE.max);
      return { reason: "dice" };
    });
  }

  /** GM jump a resource's current stage by ±delta, refilling to the new stage's count. */
  static async stepStage(id, delta) {
    await this.update(data => {
      const r = this.get(id, data);
      if (!r) return null;
      const last = (r.stages?.length ?? 1) - 1;
      r.stageIndex = clamp(int(r.stageIndex) + delta, 0, last);
      r.current = int(r.stages?.[r.stageIndex]?.count, 0);
      return { reason: "stage" };
    });
  }

  /** GM set a resource's current stage directly (used by the context menu). */
  static async setStage(id, index) {
    await this.update(data => {
      const r = this.get(id, data);
      if (!r) return null;
      const last = (r.stages?.length ?? 1) - 1;
      r.stageIndex = clamp(int(index), 0, last);
      r.current = int(r.stages?.[r.stageIndex]?.count, 0);
      return { reason: "stage" };
    });
  }

  /** Refill a resource's pool to its current stage's full count. */
  static async refill(id) {
    await this.update(data => {
      const r = this.get(id, data);
      if (!r) return null;
      r.current = int(r.stages?.[r.stageIndex]?.count, 0);
      return { reason: "refill" };
    });
  }

  static async setVisibility(id, visible) {
    await this.update(data => { const r = this.get(id, data); if (r) r.visibleToPlayers = !!visible; return { reason: "vis" }; });
  }

  /* --------------------------- resource CRUD (editor) --------------------------- */

  static async addResource(resource = null) {
    let newId = null;
    await this.update(data => {
      const r = resource ?? makeResource();
      newId = r.id;
      data.resources.push(r);
      if (!data.featuredId) data.featuredId = r.id;
      return { reason: "resourceAdd" };
    });
    return newId;
  }

  static async deleteResource(id) {
    await this.update(data => {
      data.resources = (data.resources ?? []).filter(r => r.id !== id);
      if (data.featuredId === id) data.featuredId = data.resources[0]?.id ?? null;
      return { reason: "resourceDelete" };
    });
  }

  /** Persist a whole resource object from the editor (replaces by id). */
  static async saveResource(resource) {
    await this.update(data => {
      const i = (data.resources ?? []).findIndex(r => r.id === resource.id);
      if (i >= 0) data.resources[i] = resource; else data.resources.push(resource);
      return { reason: "resourceSave" };
    });
  }

  /* ------------------------------- turn math ------------------------------- */

  /** Days per calendar week (the weekday cycle length), defaulting to 7. */
  static _daysPerWeek() {
    return TimeEngine.calendar?.days?.values?.length || 7;
  }

  /** Seconds spanned by `count` whole months from the current position (calendar-relative). */
  static _monthSpanSeconds(count, rewind) {
    const months = TimeEngine.calendar?.months?.values ?? [];
    if (!months.length) return count * 30 * SECONDS_PER_DAY;
    let m = TimeEngine.components?.month ?? 0;
    let days = 0;
    for (let i = 0; i < count; i++) {
      if (rewind) { m = (m - 1 + months.length) % months.length; days += months[m]?.days ?? 30; }
      else { days += months[m]?.days ?? 30; m = (m + 1) % months.length; }
    }
    return days * SECONDS_PER_DAY;
  }

  /** Seconds one turn advances/rewinds, per the configured unit × count. */
  static turnSeconds(rewind = false) {
    const { unit, count } = this.turn;
    switch (unit) {
      case "hour":  return count * STRETCHES_PER_HOUR * SECONDS_PER_STRETCH;
      case "shift": return count * SECONDS_PER_SHIFT;
      case "day":   return count * SECONDS_PER_DAY;
      case "week":  return count * this._daysPerWeek() * SECONDS_PER_DAY;
      case "month": return this._monthSpanSeconds(count, rewind);
      default:      return count * SECONDS_PER_STRETCH;   // stretch
    }
  }

  /* ------------------------------- the turn ------------------------------- */

  /**
   * Pass one turn (GM, delving active). Rolls every resource, advances game.time,
   * optionally rolls the weather, bumps the counters, and posts the Turn card.
   * `rewind` undoes the last turn from the snapshot history (state + time + a
   * weather step, if one fired).
   */
  static async advanceTurn({ rewind = false } = {}) {
    if (!game.user.isGM || !this.active) return;
    const data = this.data;

    if (rewind) return this._rewindTurn(data);

    // 1) snapshot current state so the turn can be rewound later
    const seconds = this.turnSeconds(false);
    const snap = {
      seconds,
      turnsElapsed: data.turnsElapsed,
      turnsSinceWeather: data.turnsSinceWeather,
      weatherStepped: false,
      resources: (data.resources ?? []).map(r => ({ id: r.id, stageIndex: r.stageIndex, current: r.current }))
    };

    // 2) roll every resource (mutates each in place)
    const rolls = [];
    for (const r of data.resources ?? []) rolls.push(await this._rollResource(r));

    // 3) weather coupling — turn-driven; suspends the time-period cadence
    let weatherStepped = false;
    const wTurns = clamp(int(data.weatherEveryTurns, 0), 0, DELVING_WEATHER_TURNS_RANGE.max);
    if (wTurns > 0 && WeatherStore.enabled && WeatherStore.configured) {
      data.turnsSinceWeather = int(data.turnsSinceWeather) + 1;
      if (data.turnsSinceWeather >= wTurns) { data.turnsSinceWeather = 0; weatherStepped = true; }
    }

    // 4) bump the turn counter + record the snapshot
    data.turnsElapsed = int(data.turnsElapsed) + 1;
    snap.weatherStepped = weatherStepped;
    data.history = data.history ?? [];
    data.history.push(snap);
    if (data.history.length > DELVING_HISTORY_CAP) data.history.shift();

    await this.save(data, { payload: { reason: "turn", rolls } });

    // 5) advance time (HUD repaints; weather auto-cadence is suspended while active)
    await game.time.advance(seconds);

    // 6) fire the weather step (its own setting + announcement card)
    if (weatherStepped) { try { await WeatherEngine.step({ manual: true }); } catch (err) { console.warn(`${MODULE_ID} | Delving weather step failed`, err); } }

    // 7) announce the turn
    await this._postTurnCard({ turn: data.turnsElapsed, label: this.turn.label, rolls, featuredId: data.featuredId });
  }

  static async _rewindTurn(data) {
    const snap = (data.history ?? []).pop();
    if (snap) {
      data.turnsElapsed = int(snap.turnsElapsed);
      data.turnsSinceWeather = int(snap.turnsSinceWeather);
      for (const s of snap.resources ?? []) {
        const r = this.get(s.id, data);
        if (r) { r.stageIndex = int(s.stageIndex); r.current = int(s.current); }
      }
      await this.save(data, { payload: { reason: "rewind" } });
      await game.time.advance(-int(snap.seconds, this.turnSeconds(true)));
      if (snap.weatherStepped) { try { await WeatherEngine.rewind(1); } catch { /* ignore */ } }
    } else {
      // no recorded turn — just step time back and ease the counters down
      data.turnsElapsed = Math.max(0, int(data.turnsElapsed) - 1);
      data.turnsSinceWeather = Math.max(0, int(data.turnsSinceWeather) - 1);
      await this.save(data, { payload: { reason: "rewind" } });
      await game.time.advance(-this.turnSeconds(true));
    }
  }

  /**
   * Roll one resource's current-stage pool, drop dice ≤ discard, and apply the
   * outcome (refill into the next stage on a wipe, clamp at 0 on the final stage).
   * Mutates the resource in place; returns a render record for the Turn card.
   */
  static async _rollResource(r) {
    const stages = r.stages ?? [];
    const stage = stages[r.stageIndex] ?? stages[0] ?? {};
    const size = clamp(int(stage.size, 6), DELVING_DICE_SIZE_RANGE.min, DELVING_DICE_SIZE_RANGE.max);
    const discard = clamp(int(stage.discard, 2), 0, size);
    const n = clamp(int(r.current), 0, DELVING_DICE_COUNT_RANGE.max);
    const isFinal = r.stageIndex >= stages.length - 1;

    if (n <= 0) {
      return { id: r.id, name: r.name, icon: r.icon, faces: [], kept: 0, dropped: 0, size, discard,
        stageName: stage.name ?? "", stageShift: false, terminal: isFinal, empty: true,
        ominous: !!stage.effect?.ominous, visibleToPlayers: !!r.visibleToPlayers, tint: stage.effect?.tintGlow };
    }

    const roll = await new Roll(`${n}d${size}`).evaluate();
    const faces = roll.dice[0]?.results?.map(x => x.result) ?? [];
    const kept = faces.filter(v => v > discard).length;

    let stageShift = false, terminal = false;
    const prevStageName = stage.name ?? "";
    if (kept === 0) {
      if (!isFinal) { r.stageIndex += 1; r.current = int(r.stages[r.stageIndex]?.count, 0); stageShift = true; }
      else { r.current = 0; terminal = true; }
    } else {
      r.current = kept;
    }
    const newStage = r.stages[r.stageIndex] ?? stage;

    return {
      id: r.id, name: r.name, icon: r.icon, faces, kept, dropped: faces.length - kept, size, discard,
      remaining: r.current, prevStageName, stageName: newStage.name ?? "", stageShift, terminal,
      empty: kept === 0, ominous: !!newStage.effect?.ominous, visibleToPlayers: !!r.visibleToPlayers,
      tint: newStage.effect?.tintGlow
    };
  }

  /* ------------------------------- chat card ------------------------------- */

  /** Post the consolidated Turn card. Player-visible resources go to everyone;
   *  hidden resources are whispered to the GMs. The featured resource's row in
   *  whichever card carries the 3D-tumble payload that animates client-side. */
  static async _postTurnCard({ turn, label, rolls, featuredId }) {
    if (!game.user.isGM) return;
    const pub = rolls.filter(r => r.visibleToPlayers);
    const hidden = rolls.filter(r => !r.visibleToPlayers);

    // Public card: always carries the turn header (the counter is public).
    const pubFeatured = pub.some(r => r.id === featuredId) ? featuredId : null;
    await this._post(this._cardHtml({ turn, label, rolls: pub, featuredId: pubFeatured, header: true }), { whisper: false });

    if (hidden.length) {
      const hidFeatured = hidden.some(r => r.id === featuredId) ? featuredId : null;
      await this._post(this._cardHtml({ turn, label, rolls: hidden, featuredId: hidFeatured, header: true, gmTag: true }),
        { whisper: true });
    }
  }

  static _cardHtml({ turn, label, rolls, featuredId, header, gmTag = false }) {
    const esc = foundry.utils.escapeHTML;
    const rowsHtml = rolls.map(r => this._rowHtml(r, r.id === featuredId)).join("") ||
      `<div class="dx-row dx-empty">${esc(game.i18n.localize("GLCT.delving.card.noResources"))}</div>`;
    const head = header
      ? `<div class="glct-cc-head">
           <span class="glct-cc-ico"><i class="fa-solid fa-hourglass-half"></i></span>
           <span class="glct-cc-title"><span class="n">${esc(label)} ${turn}</span>` +
           `<span class="s">${esc(game.i18n.localize(gmTag ? "GLCT.delving.card.gmSub" : "GLCT.delving.card.sub"))}</span></span>
         </div>` : "";
    return `<div class="glct-chatcard glct-delvecard">${head}<div class="glct-cc-body">${rowsHtml}</div></div>`;
  }

  static _rowHtml(r, isFeatured) {
    const esc = foundry.utils.escapeHTML;
    const tint = hex6(r.tint, "#ff9a3c");
    const dice = r.faces.map(v => `<span class="glct-cc-d${v <= r.discard ? " drop" : ""}">${v}</span>`).join("");
    // The featured row carries the tumble payload; the static spans below it are
    // the baked result that remains after the animation fades (and what scrollback
    // / non-featured rows always show).
    const tumble = isFeatured && r.faces.length
      ? ` data-tumble="1" data-faces="${r.faces.join(",")}" data-size="${r.size}" data-discard="${r.discard}" data-tint="${tint}"`
      : "";
    const stageBadge = r.stageShift
      ? `<span class="dx-shift"><i class="fa-solid fa-angles-down"></i> ${esc(r.stageName)}</span>`
      : `<span class="dx-stage">${esc(r.stageName)}</span>`;
    const sum = r.empty
      ? `<span class="dx-sum ${r.terminal ? "terminal" : "wipe"}">${esc(game.i18n.localize(r.terminal ? "GLCT.delving.card.terminal" : "GLCT.delving.card.wipe"))}</span>`
      : `<span class="dx-sum"><b>${r.remaining}</b> ${esc(game.i18n.localize("GLCT.delving.card.left"))}</span>`;
    return `<div class="dx-row${r.ominous ? " ominous" : ""}" style="--dxtint:${tint}">
        <div class="dx-row-head"><i class="${esc(r.icon || "fa-solid fa-hourglass-half")}"></i>` +
        `<span class="dx-name">${esc(r.name || "")}</span>${stageBadge}</div>
        <div class="glct-cc-dice"${tumble}>${dice || "&nbsp;"}</div>
        <div class="dx-row-foot">${sum}</div>
      </div>`;
  }

  static _post(content, { whisper = false } = {}) {
    const speaker = ChatMessage.implementation.getSpeaker({ alias: game.i18n.localize("GLCT.delving.card.alias") });
    const data = { speaker, content, flags: { [MODULE_ID]: { delvingCard: true } } };
    if (whisper) data.whisper = game.users.filter(u => u.isGM).map(u => u.id);
    return ChatMessage.implementation.create(data);
  }

  /* ------------------------------- sanitize ------------------------------- */

  static _sanitize(data) {
    if (!data || typeof data !== "object") return;
    data.schemaVersion = 1;
    data.active = !!data.active;
    data.turnsElapsed = Math.max(0, int(data.turnsElapsed));
    data.turnsSinceWeather = Math.max(0, int(data.turnsSinceWeather));
    data.weatherEveryTurns = clamp(int(data.weatherEveryTurns, 0), DELVING_WEATHER_TURNS_RANGE.min, DELVING_WEATHER_TURNS_RANGE.max);
    if (!Array.isArray(data.history)) data.history = [];
    if (data.history.length > DELVING_HISTORY_CAP) data.history = data.history.slice(-DELVING_HISTORY_CAP);

    const t = data.turn ?? (data.turn = {});
    t.unit = DELVING_UNITS.includes(t.unit) ? t.unit : "stretch";
    t.count = clamp(int(t.count, 1), DELVING_TURN_COUNT_RANGE.min, DELVING_TURN_COUNT_RANGE.max);
    t.label = String(t.label ?? "Turn").slice(0, 24) || "Turn";

    if (!Array.isArray(data.resources)) data.resources = [];
    for (const r of data.resources) this._sanitizeResource(r);
    if (!this.get(data.featuredId, data)) data.featuredId = data.resources[0]?.id ?? null;
  }

  static _sanitizeResource(r) {
    if (!r || typeof r !== "object") return;
    if (typeof r.id !== "string" || !r.id) r.id = foundry.utils.randomID(12);
    r.name = String(r.name ?? "Resource").slice(0, 60);
    r.icon = String(r.icon ?? "fa-solid fa-hourglass-half");
    r.visibleToPlayers = r.visibleToPlayers !== false;
    if (!Array.isArray(r.stages) || !r.stages.length) r.stages = [makeStage("Stage 1")];
    if (r.stages.length > DELVING_STAGE_RANGE.max) r.stages = r.stages.slice(0, DELVING_STAGE_RANGE.max);
    r.stages.forEach(s => this._sanitizeStage(s));
    r.stageIndex = clamp(int(r.stageIndex), 0, r.stages.length - 1);
    r.current = clamp(int(r.current, r.stages[r.stageIndex]?.count ?? 0), DELVING_DICE_COUNT_RANGE.min, DELVING_DICE_COUNT_RANGE.max);
  }

  static _sanitizeStage(s) {
    if (!s || typeof s !== "object") return;
    s.name = String(s.name ?? "Stage").slice(0, 40);
    s.size = clamp(int(s.size, 6), DELVING_DICE_SIZE_RANGE.min, DELVING_DICE_SIZE_RANGE.max);
    s.count = clamp(int(s.count, 6), DELVING_DICE_COUNT_RANGE.min, DELVING_DICE_COUNT_RANGE.max);
    s.discard = clamp(int(s.discard, 2), 0, s.size);
    const e = s.effect ?? (s.effect = {});
    e.archetype = WEATHER_ARCHETYPES.includes(e.archetype) ? e.archetype : "embers";
    e.intensity = clamp(Number(e.intensity ?? 0.5), 0, 1);
    e.tintParticle = hex6(e.tintParticle, "#ff9a3c");
    e.tintGlow = hex6(e.tintGlow, "#ffd27a");
    e.drift = ["fall", "rise", "left", "right", "still"].includes(e.drift) ? e.drift : "rise";
    e.ominous = !!e.ominous;
  }
}
