/**
 * TrackerStore — the data layer for the Tracker HUD.
 *
 * Trackers live in a single world-scope setting (`trackers`), so every GM
 * edit, reorder, roll, or visibility change propagates to all clients via the
 * setting's onChange → TrackerHud.refresh() pipeline (same model the calendar
 * HUD uses). Players read the array but never write it: player-initiated pool
 * rolls are routed to a GM over a socket so the GM stays authoritative over
 * world state and the dice roll (and its Dice So Nice animation + chat card).
 */

import { MODULE_ID, SETTINGS, SOCKET, HOOKS, TRACKER_TYPES } from "../const.js";

/** Per-type factory defaults for newly created trackers. */
const DEFAULTS = {
  point: { name: "Points", value: 0, min: null, max: null },
  clock: { name: "Clock", slices: 6, value: 0, bad: false },
  pool:  { name: "Pool", size: 6, count: 5, discard: 2, current: 5, playerRoll: false },
  task:  { title: "Task", subtitle: "", boxes: 6, value: 0 },
  hazard:{ title: "Hazard", subtitle: "", boxes: 8, value: 0 },
  separator: { label: "" }
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const int = (v, fallback = 0) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : fallback; };
/** Optional integer bound: blank/null/undefined stays unset (null); otherwise an int. */
const optInt = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
};

export class TrackerStore {
  /* ------------------------------- reads ------------------------------- */

  static get all() {
    try { return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.trackers) ?? []); }
    catch { return []; }
  }

  /** Trackers ordered for display, filtered to what the current viewer may see. */
  static visible() {
    const isGM = game.user?.isGM ?? false;
    return this.all
      .filter(t => isGM || t.visibleToPlayers)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  static get(id) { return this.all.find(t => t.id === id) ?? null; }

  /* ------------------------------- writes (GM) ------------------------------- */

  static async save(trackers) {
    if (!game.user.isGM) return;
    await game.settings.set(MODULE_ID, SETTINGS.trackers, trackers);
    // onChange handles the local + broadcast refresh; fire the public hook too.
    Hooks.callAll(HOOKS.trackersChanged, trackers);
  }

  /** Build a fresh tracker of `type`, optionally overriding default fields. */
  static makeNew(type, overrides = {}) {
    if (!TRACKER_TYPES.includes(type)) type = "point";
    const base = foundry.utils.deepClone(DEFAULTS[type]);
    const all = this.all;
    const order = all.reduce((m, t) => Math.max(m, t.order ?? 0), 0) + 1;
    return {
      id: foundry.utils.randomID(),
      type,
      order,
      visibleToPlayers: true,
      ...base,
      ...overrides
    };
  }

  static async create(type, overrides = {}) {
    if (!game.user.isGM) return null;
    const tracker = this.makeNew(type, overrides);
    const all = this.all;
    all.push(tracker);
    await this.save(all);
    return tracker;
  }

  /** Merge `patch` into an existing tracker, coercing numeric fields per type. */
  static async update(id, patch) {
    if (!game.user.isGM) return;
    const all = this.all;
    const t = all.find(x => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this._sanitize(t);
    await this.save(all);
  }

  static async delete(id) {
    if (!game.user.isGM) return;
    await this.save(this.all.filter(t => t.id !== id));
  }

  static async setVisibility(id, visible) {
    return this.update(id, { visibleToPlayers: !!visible });
  }

  /** Persist a new display order from an array of ids (drag-reorder result). */
  static async reorder(idsInOrder) {
    if (!game.user.isGM) return;
    const all = this.all;
    idsInOrder.forEach((id, i) => { const t = all.find(x => x.id === id); if (t) t.order = i; });
    await this.save(all);
  }

  /* ------------------------------- value mutations ------------------------------- */

  /** Step a point/clock/task/hazard up or down. Returns nothing; saves state. */
  static async step(id, delta) {
    if (!game.user.isGM) return;
    const all = this.all;
    const t = all.find(x => x.id === id);
    if (!t) return;
    switch (t.type) {
      case "point": {
        const lo = optInt(t.min), hi = optInt(t.max);
        let nv = int(t.value) + delta;
        if (lo !== null) nv = Math.max(lo, nv);
        if (hi !== null) nv = Math.min(hi, nv);
        t.value = nv;
        break;
      }
      case "clock":
        t.value = clamp(int(t.value) + delta, 0, int(t.slices, 6));
        break;
      case "task":
      case "hazard":
        t.value = clamp(int(t.value) + delta, 0, int(t.boxes, 6));
        break;
      default: return;
    }
    await this.save(all);
  }

  /** Refill a pool to its full count (GM right-click / reset). */
  static async resetPool(id) {
    if (!game.user.isGM) return;
    const all = this.all;
    const t = all.find(x => x.id === id);
    if (!t || t.type !== "pool") return;
    t.current = int(t.count, 0);
    await this.save(all);
  }

  /* ------------------------------- pool rolling ------------------------------- */

  /**
   * Roll a resource pool. GMs roll directly; players route the request to a GM
   * over the socket (so the roll, the world-state update, and the chat card all
   * originate from an authoritative client). Only enabled for players when the
   * pool's `playerRoll` flag is set.
   */
  static async rollPool(id) {
    const t = this.get(id);
    if (!t || t.type !== "pool") return;
    if (game.user.isGM) return this._doRollPool(id, game.user.id);
    if (!t.playerRoll) return;
    // Route to a GM over the socket. We only need *some* active GM to be present;
    // the receiving side decides which one actually handles it. (Don't gate on the
    // `activeGM` getter here — if it momentarily reads null the roll would be lost.)
    if (!game.users.some(u => u.isGM && u.active)) {
      ui.notifications?.warn(game.i18n.localize("GLCT.tracker.noGM"));
      return;
    }
    game.socket.emit(SOCKET, { action: "rollPool", id, userId: game.user.id });
  }

  /** Authoritative roll, executed on a GM client only. */
  static async _doRollPool(id, requestedBy) {
    if (!game.user.isGM) return;
    const all = this.all;
    const t = all.find(x => x.id === id);
    if (!t || t.type !== "pool") return;

    const n = int(t.current, 0);
    if (n <= 0) return;   // an exhausted pool stays empty until the GM resets it
    const size = int(t.size, 6);
    const discard = int(t.discard, 2);

    const roll = await new Roll(`${n}d${size}`).evaluate();
    const faces = roll.dice[0]?.results?.map(r => r.result) ?? [];
    const remaining = faces.filter(v => v > discard).length;

    // Roll the 3D dice for everyone and WAIT for them to finish before the dock
    // count changes or the result card lands. showForRoll(...synchronize=true)
    // broadcasts the animation to all clients and resolves when it settles; we
    // attribute it to the requesting user so the dice show in their colours.
    if (game.dice3d) {
      const author = game.users.get(requestedBy) ?? game.user;
      try { await game.dice3d.showForRoll(roll, author, true); }
      catch (err) { console.warn(`${MODULE_ID} | Dice So Nice roll failed`, err); }
    }

    // Post the result card (no Roll attached → Foundry won't also render its own
    // default dice box, which is what made the card look nested)…
    await this._postPoolCard({ tracker: t, faces, discard, size, remaining, requestedBy });
    // …and reveal the new pool count at the same moment.
    const fresh = this.all;
    const t2 = fresh.find(x => x.id === id);
    if (t2 && t2.type === "pool") { t2.current = remaining; await this.save(fresh); }
  }

  /** Compact, on-brand chat card listing kept vs discarded dice. */
  static async _postPoolCard({ tracker, faces, discard, size, remaining, requestedBy }) {
    const empty = remaining === 0;
    const keptCount = remaining;
    const goneCount = faces.length - keptCount;

    const dice = faces.map(v => {
      const drop = v <= discard;
      return `<span class="glct-cc-d${drop ? " drop" : ""}">${v}</span>`;
    }).join("");

    const summary = empty
      ? `<div class="glct-cc-empty">${game.i18n.localize("GLCT.tracker.poolEmpty")}</div>`
      : `<div class="glct-cc-sum"><span class="keep">${game.i18n.format("GLCT.tracker.kept", { n: keptCount })}</span>` +
        `<span class="gone">${game.i18n.format("GLCT.tracker.discarded", { n: goneCount })}</span></div>`;

    const content =
      `<div class="glct-chatcard${empty ? " empty" : ""}">
        <div class="glct-cc-head">
          <span class="glct-cc-ico"><i class="fa-solid fa-dice"></i></span>
          <span class="glct-cc-title"><span class="n">${foundry.utils.escapeHTML(tracker.name ?? "Pool")}</span>` +
          `<span class="s">${game.i18n.localize("GLCT.tracker.types.pool")} · d${size} · ${game.i18n.format("GLCT.tracker.dropLE", { n: discard })}</span></span>
        </div>
        <div class="glct-cc-body">
          <div class="glct-cc-dice">${dice}</div>
          ${summary}
        </div>
      </div>`;

    const speaker = ChatMessage.implementation.getSpeaker({ alias: tracker.name ?? "Resource Pool" });
    // The 3D dice were already shown via game.dice3d.showForRoll, so we post a
    // plain content message (no rolls) to avoid a duplicate default dice box.
    return ChatMessage.implementation.create({
      speaker, content,
      flags: { [MODULE_ID]: { poolRoll: true, requestedBy } }
    });
  }

  /* ------------------------------- internals ------------------------------- */

  static _sanitize(t) {
    switch (t.type) {
      case "point": {
        let lo = optInt(t.min), hi = optInt(t.max);
        if (lo !== null && hi !== null && lo > hi) { const tmp = lo; lo = hi; hi = tmp; }
        t.min = lo; t.max = hi;
        let v = int(t.value);
        if (lo !== null) v = Math.max(lo, v);
        if (hi !== null) v = Math.min(hi, v);
        t.value = v;
        break;
      }
      case "clock":
        t.slices = clamp(int(t.slices, 6), 1, 24);
        t.value = clamp(int(t.value), 0, t.slices);
        t.bad = !!t.bad;
        break;
      case "pool":
        t.size = clamp(int(t.size, 6), 2, 100);
        t.count = clamp(int(t.count, 5), 1, 50);
        t.discard = clamp(int(t.discard, 2), 0, t.size);
        t.current = clamp(int(t.current, t.count), 0, t.count);
        t.playerRoll = !!t.playerRoll;
        break;
      case "task":
      case "hazard":
        t.boxes = clamp(int(t.boxes, 6), 1, 30);
        t.value = clamp(int(t.value), 0, t.boxes);
        break;
      case "separator":
        t.label = String(t.label ?? "").trim();
        break;
    }
  }

  /** The one GM responsible for handling routed player requests: the active GM
   *  with the lowest id, computed explicitly so we don't depend on the `activeGM`
   *  getter (which can read null and would then drop the request on every GM). */
  static _isResponsibleGM() {
    if (!game.user?.isGM) return false;
    const gms = game.users.filter(u => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id));
    return gms[0]?.id === game.user.id;
  }

  /** Wire the GM socket listener once (called from the ready hook). */
  static registerSocket() {
    game.socket.on(SOCKET, async (data) => {
      if (!data) return;
      // Only the primary active GM acts, to avoid double-handling on multi-GM tables.
      if (!this._isResponsibleGM()) return;
      if (data.action === "rollPool") await this._doRollPool(data.id, data.userId);
    });
  }
}
