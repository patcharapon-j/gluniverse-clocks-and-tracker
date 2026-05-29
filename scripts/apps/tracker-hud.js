/**
 * TrackerHud — the floating Tracker dock as a frameless ApplicationV2.
 *
 * Mirrors GlctHud's strategy: the Handlebars template provides the panel
 * skeleton; the per-tracker rows are built imperatively in _buildRows so that
 * value/roll changes mutate the existing DOM (keeping reel/fill animations
 * continuous) instead of forcing a full re-render. A structural signature
 * decides between a cheap repaint (value changed) and a rebuild (a tracker was
 * added/removed/reordered or its shape edited).
 *
 * GM controls everything; players see a read-only dock — except a resource
 * pool whose `playerRoll` flag is set, which they may click to roll.
 */

import { MODULE_ID, SETTINGS } from "../const.js";
import { TrackerStore } from "../trackers/trackers.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const NS = "http://www.w3.org/2000/svg";

export class TrackerHud extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static async open() {
    if (!this.instance) this.instance = new this();
    await this.instance.render(true);
    return this.instance;
  }

  /** Repaint from current tracker state (no full re-render unless structure changed). */
  static refresh() { this.instance?.update(); }

  /** Force a structural rebuild (e.g. when isGM context changes). */
  static async refreshStructure() {
    if (this.instance?.rendered) await this.instance.render();
  }

  static DEFAULT_OPTIONS = {
    id: "glct-tracker-hud",
    classes: ["glct"],
    tag: "div",
    window: { frame: false, positioned: false, minimizable: false, resizable: false },
    actions: {
      addTracker: TrackerHud.prototype._onAddTracker
    }
  };

  static PARTS = {
    hud: { template: `modules/${MODULE_ID}/templates/tracker-hud.hbs` }
  };

  _rows = new Map();   // id -> { el, paint, last }
  _sig = null;         // last structural signature array

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, { isGM: game.user?.isGM ?? false });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._rows.clear();
    this._sig = null;
    this._applyPosition();
    this._wireDockChrome();
    this.update();
  }

  /* ------------------------------ painting ------------------------------ */

  update() {
    if (!this.rendered) return;
    const list = TrackerStore.visible();
    const sig = list.map(t => this._structuralSig(t));

    const same = this._sig && sig.length === this._sig.length && sig.every((s, i) => s === this._sig[i]);
    if (!same) { this._buildRows(list); this._sig = sig; }

    for (const t of list) this._rows.get(t.id)?.paint(t);

    // header count + empty hint + dock auto-hide for players with nothing to see
    const root = this.element;
    root.querySelector("[data-count]")?.replaceChildren(document.createTextNode(String(list.length)));
    const empty = root.querySelector("[data-empty]");
    if (empty) empty.style.display = list.length ? "none" : "block";

    const dock = root.querySelector("[data-dock]");
    if (dock) dock.style.display = (!game.user.isGM && list.length === 0) ? "none" : "";
  }

  _structuralSig(t) {
    return [t.id, t.order, t.type, t.name, t.title, t.subtitle, t.label, t.slices, t.boxes,
      t.size, t.count, t.discard, t.playerRoll, t.visibleToPlayers].join("|");
  }

  _buildRows(list) {
    const host = this.element.querySelector("[data-rows]");
    if (!host) return;
    host.replaceChildren();
    this._rows.clear();
    for (const t of list) {
      const built = this._buildRow(t);
      host.appendChild(built.el);
      this._rows.set(t.id, built);
    }
    if (game.user.isGM) this._wireReorder(host);
  }

  /* ------------------------------ row builders ------------------------------ */

  _el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  _svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  _polar(cx, cy, r, deg) { const a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

  /** Shared row shell: grip (GM) · type body · GM tools · overlay. */
  _buildRow(t) {
    const isGM = game.user.isGM;
    const row = this._el("div", "trow type-" + t.type + (t.type === "hazard" ? " hazard" : "") + (t.type === "separator" ? " sep" : ""));
    row.dataset.id = t.id;
    if (isGM && !t.visibleToPlayers) row.classList.add("hiddenfromplayers");
    if (t.type === "hazard") row.appendChild(this._el("div", "haz-scan"));

    if (isGM) {
      const grip = this._el("div", "grip");
      for (let i = 0; i < 6; i++) grip.appendChild(this._el("i"));
      row.appendChild(grip);
    }

    const body = this._buildBody(t);
    row.appendChild(body.content);

    if (isGM) {
      const tools = this._el("div", "tools");
      const eye = this._el("button", "eye" + (t.visibleToPlayers ? "" : " off"));
      eye.innerHTML = t.visibleToPlayers ? "&#128065;" : "&#128584;";
      eye.title = game.i18n.localize("GLCT.tracker.toggleVis");
      eye.addEventListener("click", e => { e.stopPropagation(); TrackerStore.setVisibility(t.id, !t.visibleToPlayers); });
      const edit = this._el("button"); edit.innerHTML = "&#9881;"; edit.title = game.i18n.localize("GLCT.tracker.edit");
      edit.addEventListener("click", e => { e.stopPropagation(); this._editTracker(t.id); });
      const del = this._el("button"); del.innerHTML = "&#10005;"; del.title = game.i18n.localize("GLCT.tracker.delete");
      del.addEventListener("click", e => { e.stopPropagation(); this._deleteTracker(t.id); });
      tools.append(eye, edit, del);
      row.appendChild(tools);
    }

    if (t.type !== "hazard" && t.type !== "separator") {
      const ovl = this._el("div", "rovl");
      ovl.appendChild(this._el("div", "ot"));
      row.appendChild(ovl);
      body.overlay = ovl;
    }

    this._wireRowInteractions(row, body.content, t.type);
    return { el: row, paint: body.paint, last: undefined };
  }

  _buildBody(t) {
    switch (t.type) {
      case "point": return this._bodyPoint(t);
      case "clock": return this._bodyClock(t);
      case "pool": return this._bodyPool(t);
      case "task": return this._bodyTask(t);
      case "hazard": return this._bodyHazard(t);
      case "separator": return this._bodySeparator(t);
      default: return this._bodyPoint(t);
    }
  }

  /* ---- POINT (slot-reel digit) ---- */
  _bodyPoint(t) {
    const c = this._el("div", "t-point");
    const chev = this._el("div", "chev");
    const nm = this._el("div", "nm", t.name ?? "");
    const reel = this._el("div", "reeldig");
    c.append(chev, nm, reel);
    let last = null, sig = null;
    const paint = (tr) => {
      nm.textContent = tr.name ?? "";
      const v = Math.trunc(Number(tr.value) || 0);
      this._renderReel(reel, v, last);
      if (last !== null && v !== last) {
        const dir = v > last ? "up" : "down";
        chev.textContent = v > last ? "▲" : "▼";
        // Clear then re-add the direction class (with a reflow between) so the
        // float animation replays on every step — even repeats in one direction.
        chev.className = "chev";
        void chev.offsetWidth;
        chev.className = "chev " + dir;
      }
      last = v;
    };
    return { content: c, paint };
  }

  /** Render an integer as per-digit reels; animates when the digit layout is stable. */
  _renderReel(host, value, prev) {
    const str = String(value);
    const layout = str.replace(/[0-9]/g, "#");          // sign/structure fingerprint
    if (host._layout !== layout) {
      host.replaceChildren();
      host._wheels = [];
      for (const ch of str) {
        if (ch >= "0" && ch <= "9") {
          const reel = this._el("span", "reel");
          const strip = this._el("span", "strip");
          for (let n = 0; n <= 9; n++) strip.appendChild(this._el("span", null, String(n)));
          reel.appendChild(strip);
          host.appendChild(reel);
          host._wheels.push(strip);
        } else {
          host.appendChild(this._el("span", "sign", ch));
        }
      }
      host._layout = layout;
      // set without transition on first lay-out
      host._wheels.forEach((strip, i) => {
        strip.style.transition = "none";
        strip.style.transform = `translateY(-${Number(str.replace(/[^0-9]/g, "")[i]) * 10}%)`;
      });
      void host.offsetWidth;
      host._wheels.forEach(strip => strip.style.transition = "");
      return;
    }
    const digits = str.replace(/[^0-9]/g, "");
    host._wheels.forEach((strip, i) => {
      strip.style.transform = `translateY(-${Number(digits[i]) * 10}%)`;
    });
  }

  /* ---- CLOCK (segmented pie) ---- */
  _bodyClock(t) {
    const c = this._el("div", "t-clock");
    const slices = Math.max(1, Math.trunc(Number(t.slices) || 6));
    const s = this._svg("svg", { viewBox: "0 0 104 104", width: 30, height: 30, class: "pie" });
    const segs = [];
    for (let i = 0; i < slices; i++) {
      const a0 = (i / slices) * 360 - 90, a1 = ((i + 1) / slices) * 360 - 90;
      const [x0, y0] = this._polar(52, 52, 42, a0), [x1, y1] = this._polar(52, 52, 42, a1);
      const lg = (a1 - a0) <= 180 ? 0 : 1;
      const seg = this._svg("path", { d: `M52 52 L${x0.toFixed(2)} ${y0.toFixed(2)} A42 42 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`, class: "seg" });
      s.appendChild(seg); segs.push(seg);
    }
    s.appendChild(this._svg("circle", { cx: 52, cy: 52, r: 42, class: "ring" }));
    const pie = this._el("div", "pie"); pie.appendChild(s);
    const nm = this._el("div", "nm", t.name ?? "");
    const frac = this._el("div", "frac");
    c.append(pie, nm, frac);
    let last = -1;
    const paint = (tr) => {
      nm.textContent = tr.name ?? "";
      const v = Math.max(0, Math.min(slices, Math.trunc(Number(tr.value) || 0)));
      segs.forEach((sg, i) => {
        const fill = i < v;
        sg.classList.toggle("fill", fill);
        if (fill && i >= last && last >= 0) { sg.classList.remove("justfilled"); void sg.getBoundingClientRect().width; sg.classList.add("justfilled"); }
      });
      frac.innerHTML = `<b>${v}</b>/${slices}`;
      const done = v >= slices;
      c.classList.toggle("complete", done);
      this._setOverlay(c, done ? "done" : null, game.i18n.localize("GLCT.tracker.filled"));
      last = v;
    };
    return { content: c, paint };
  }

  /* ---- POOL (remaining-dice chips; 3D roll handled by Dice So Nice in chat) ---- */
  _bodyPool(t) {
    const c = this._el("div", "t-pool");
    const nm = this._el("div", "nm", t.name ?? "");
    const dice = this._el("div", "dice");
    const cnt = this._el("div", "cnt");
    c.append(nm, dice, cnt);
    if (t.playerRoll) { const p = this._el("div", "play"); p.innerHTML = "&#9654;"; p.title = game.i18n.localize("GLCT.tracker.playersMayRoll"); c.append(p); }
    let last = -1;
    const paint = (tr) => {
      nm.textContent = tr.name ?? "";
      const cur = Math.max(0, Math.trunc(Number(tr.current) || 0));
      const size = Math.max(2, Math.trunc(Number(tr.size) || 6));
      if (cur !== last) {
        dice.replaceChildren();
        for (let i = 0; i < Math.min(cur, 8); i++) {
          const d = this._el("div", "die");
          d.appendChild(this._el("span", "dot"));
          dice.appendChild(d);
        }
        if (cur > 8) dice.appendChild(this._el("span", "more", `+${cur - 8}`));
      }
      cnt.innerHTML = `<b>${cur}</b>d${size}`;
      this._setOverlay(c, cur === 0 ? "empty" : null, game.i18n.localize("GLCT.tracker.empty"));
      last = cur;
    };
    return { content: c, paint };
  }

  /* ---- TASK (discrete boxes) ---- */
  _bodyTask(t) {
    const c = this._el("div", "t-task");
    const titles = this._el("div", "titles");
    const tt = this._el("div", "tt", t.title ?? "");
    const st = this._el("div", "st", t.subtitle ?? "");
    titles.append(tt, st);
    const boxes = Math.max(1, Math.trunc(Number(t.boxes) || 6));
    const br = this._el("div", "boxrow");
    const cells = [];
    for (let i = 0; i < boxes; i++) { const b = this._el("div", "box"); br.appendChild(b); cells.push(b); }
    this._sizeBoxes(br, cells, boxes);
    c.append(titles, br);
    let last = -1;
    const paint = (tr) => {
      tt.textContent = tr.title ?? ""; st.textContent = tr.subtitle ?? "";
      const v = Math.max(0, Math.min(boxes, Math.trunc(Number(tr.value) || 0)));
      cells.forEach((cl, i) => {
        const fill = i < v;
        cl.classList.toggle("fill", fill);
        if (fill && i >= last && last >= 0) { cl.classList.remove("justfill"); void cl.offsetWidth; cl.classList.add("justfill"); }
      });
      this._setOverlay(c, v >= boxes ? "done" : null, game.i18n.localize("GLCT.tracker.completed"));
      last = v;
    };
    return { content: c, paint };
  }

  /** Shrink box cells as the count grows so a long task/hazard stays one tidy row. */
  _sizeBoxes(br, cells, boxes) {
    const sz = boxes <= 10 ? 14 : boxes <= 16 ? 11 : boxes <= 22 ? 8 : 6;
    const gap = sz >= 11 ? 3 : sz >= 8 ? 2 : 1;
    br.style.gap = `${gap}px`;
    for (const b of cells) { b.style.width = `${sz}px`; b.style.height = `${sz}px`; }
  }

  /* ---- HAZARD (red dread boxes; no overlay) ---- */
  _bodyHazard(t) {
    const c = this._el("div", "t-task haz");
    const titles = this._el("div", "titles");
    const tt = this._el("div", "tt", t.title ?? "");
    const st = this._el("div", "st", t.subtitle ?? "");
    titles.append(tt, st);
    const boxes = Math.max(1, Math.trunc(Number(t.boxes) || 8));
    const br = this._el("div", "boxrow");
    const cells = [];
    for (let i = 0; i < boxes; i++) { const b = this._el("div", "box"); br.appendChild(b); cells.push(b); }
    this._sizeBoxes(br, cells, boxes);
    c.append(titles, br);
    let last = -1;
    const paint = (tr) => {
      tt.textContent = tr.title ?? ""; st.textContent = tr.subtitle ?? "";
      const v = Math.max(0, Math.min(boxes, Math.trunc(Number(tr.value) || 0)));
      cells.forEach((cl, i) => {
        const fill = i < v;
        cl.classList.toggle("fill", fill);
        cl.classList.toggle("head", fill && i === v - 1 && v < boxes);
        if (fill && i >= last && last >= 0) { cl.classList.remove("justfill"); void cl.offsetWidth; cl.classList.add("justfill"); }
      });
      c.closest(".trow")?.classList.toggle("full", v >= boxes);
      last = v;
    };
    return { content: c, paint };
  }

  /* ---- SEPARATOR (purely visual divider with optional centered label) ---- */
  _bodySeparator(t) {
    const c = this._el("div", "t-sep");
    const lab = this._el("span", "lab", t.label ?? "");
    c.appendChild(lab);
    const paint = (tr) => {
      const txt = (tr.label ?? "").trim();
      lab.textContent = txt;
      lab.style.display = txt ? "" : "none";
    };
    return { content: c, paint };
  }

  _setOverlay(bodyEl, kind, txt) {
    const ovl = bodyEl.closest(".trow")?.querySelector(".rovl");
    if (!ovl) return;
    ovl.className = "rovl " + (kind || "");
    ovl.querySelector(".ot").textContent = kind ? txt : "";
    if (kind) ovl.classList.add("show");
  }

  /* ------------------------------ interactions ------------------------------ */

  _wireRowInteractions(row, body, type) {
    if (type === "separator") { body.style.cursor = "default"; return; }  // purely decorative
    const isGM = game.user.isGM;
    // Players only ever interact with a pool they're allowed to roll; everything
    // else is read-only, so don't tease them with a clickable cursor.
    const interactive = isGM || (type === "pool" && TrackerStore.get(row.dataset.id)?.playerRoll);
    if (!interactive) body.style.cursor = "default";
    body.addEventListener("click", () => {
      if (type === "pool") { TrackerStore.rollPool(row.dataset.id); return; }
      if (!isGM) return;
      TrackerStore.step(row.dataset.id, +1);
    });
    body.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      if (!isGM) return;
      if (type === "pool") { TrackerStore.resetPool(row.dataset.id); return; }
      TrackerStore.step(row.dataset.id, -1);
    });
  }

  _wireReorder(host) {
    host.querySelectorAll(".trow .grip").forEach(grip => {
      grip.addEventListener("pointerdown", ev => {
        ev.preventDefault();
        const row = grip.closest(".trow");
        row.classList.add("dragging");
        const move = e => {
          const after = [...host.querySelectorAll(".trow:not(.dragging)")].find(c => {
            const r = c.getBoundingClientRect();
            return e.clientY < r.top + r.height / 2;
          });
          if (after) host.insertBefore(row, after); else host.appendChild(row);
        };
        const up = async () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          row.classList.remove("dragging");
          const ids = [...host.querySelectorAll(".trow")].map(r => r.dataset.id);
          await TrackerStore.reorder(ids);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
    });
  }

  _wireDockChrome() {
    const head = this.element.querySelector("[data-drag]");
    if (head) head.addEventListener("pointerdown", this._onDragDock.bind(this));
  }

  _onDragDock(ev) {
    if (ev.button !== 0 || ev.target.closest("button")) return;
    ev.preventDefault();
    const el = this.element;
    const rect = el.getBoundingClientRect();
    const ox = ev.clientX - rect.left, oy = ev.clientY - rect.top;
    const start = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const move = e => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
        moved = true; el.style.right = "auto";
      }
      if (moved) { el.style.left = `${e.clientX - ox}px`; el.style.top = `${e.clientY - oy}px`; }
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) return;
      const r = el.getBoundingClientRect();
      try { await game.settings.set(MODULE_ID, SETTINGS.trackerHudPosition, { left: Math.round(r.left), top: Math.round(r.top) }); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  _applyPosition() {
    const el = this.element;
    el.style.position = "fixed";
    el.style.zIndex = "69";
    let pos = {};
    try { pos = game.settings.get(MODULE_ID, SETTINGS.trackerHudPosition) ?? {}; } catch { /* ignore */ }
    if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      el.style.left = `${pos.left}px`; el.style.top = `${pos.top}px`; el.style.right = "auto";
    } else {
      el.style.right = "14px"; el.style.top = "96px"; el.style.left = "auto";
    }
  }

  /* ------------------------------ CRUD entry points ------------------------------ */

  async _onAddTracker() {
    if (!game.user.isGM) return;
    const { TrackerEditor } = await import("./tracker-editor.js");
    TrackerEditor.create();
  }

  async _editTracker(id) {
    const { TrackerEditor } = await import("./tracker-editor.js");
    TrackerEditor.edit(id);
  }

  async _deleteTracker(id) {
    const t = TrackerStore.get(id);
    const label = t?.name ?? t?.title ?? game.i18n.localize("GLCT.tracker.title");
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("GLCT.tracker.delete") },
      content: `<p>${game.i18n.format("GLCT.tracker.confirmDelete", { name: foundry.utils.escapeHTML(label) })}</p>`
    });
    if (confirmed) await TrackerStore.delete(id);
  }
}
