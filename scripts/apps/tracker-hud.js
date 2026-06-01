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

  _rows = new Map();   // id -> { el, paint, flash, vsig }
  _sig = null;         // last structural signature array

  /** Compact ("playing-card") mode is a per-client preference. */
  get compact() {
    try { return !!game.settings.get(MODULE_ID, SETTINGS.trackerHudCompact); } catch { return false; }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, { isGM: game.user?.isGM ?? false, compact: this.compact });
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

    const compact = this.compact;
    for (const t of list) {
      const rec = this._rows.get(t.id);
      if (!rec) continue;
      const vsig = this._valueSig(t);
      const changed = rec.vsig !== undefined && rec.vsig !== vsig;
      rec.vsig = vsig;
      // While collapsed, a value change pops the card out to its full row first,
      // then plays the change once it has finished expanding, so the two motions
      // don't fight. The row keeps showing its previous value until then.
      if (changed && compact && t.type !== "separator") {
        rec.flash();
        rec.paintAfterExpand(t);
      } else {
        rec.paint(t);
      }
    }

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
      t.size, t.count, t.discard, t.playerRoll, t.bad, t.visibleToPlayers].join("|");
  }

  /** The live value that, when it changes, should pop a compact card open. */
  _valueSig(t) {
    if (t.type === "pool") return String(Math.trunc(Number(t.current) || 0));
    return String(Math.trunc(Number(t.value) || 0));
  }

  _buildRows(list) {
    const host = this.element.querySelector("[data-rows]");
    if (!host) return;
    this._rows.forEach(r => r.cancelPop?.());   // clear any pop-out timers/placeholders first
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
    // A clock flagged `bad` (a hazard clock whose completion is bad news) wears
    // the same red dread treatment as a hazard tracker.
    const badClock = t.type === "clock" && t.bad;
    const row = this._el("div", "trow type-" + t.type + (t.type === "hazard" ? " hazard" : "") + (badClock ? " badclock" : "") + (t.type === "separator" ? " sep" : ""));
    row.dataset.id = t.id;
    if (isGM && !t.visibleToPlayers) row.classList.add("hiddenfromplayers");
    if (t.type === "hazard" || badClock) row.appendChild(this._el("div", "haz-scan"));

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
      eye.innerHTML = t.visibleToPlayers ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
      eye.title = game.i18n.localize("GLCT.tracker.toggleVis");
      eye.addEventListener("click", e => { e.stopPropagation(); TrackerStore.setVisibility(t.id, !t.visibleToPlayers); });
      const edit = this._el("button"); edit.innerHTML = '<i class="fa-solid fa-gear"></i>'; edit.title = game.i18n.localize("GLCT.tracker.edit");
      edit.addEventListener("click", e => { e.stopPropagation(); this._editTracker(t.id); });
      const del = this._el("button"); del.innerHTML = '<i class="fa-solid fa-xmark"></i>'; del.title = game.i18n.localize("GLCT.tracker.delete");
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

    // Compact "playing-card" face — shown only while the dock is collapsed.
    const mini = this._buildMini(t);
    row.appendChild(mini.el);

    this._wireRowInteractions(row, body.content, t.type);

    // --- compact pop-out -------------------------------------------------
    // While the dock is collapsed, a value change lifts this card out of the
    // grid (leaving a placeholder so neighbours don't shift), morphs it into a
    // full-width row, dwells, then morphs back into the card. JS sets the
    // geometry; CSS eases between the values for a smooth transition.
    const DWELL = 2400;
    const EXPAND = 430;
    let popTimer = null, paintTimer = null, popActive = false;

    const placeholder = () => row.parentElement?.querySelector(`.tcard-ph[data-for="${t.id}"]`);

    const cleanup = () => {
      popActive = false;
      clearTimeout(popTimer); popTimer = null;
      clearTimeout(paintTimer); paintTimer = null;
      row.classList.remove("popping", "expanded");
      row.style.cssText = "";
      placeholder()?.remove();
    };

    const settle = () => {
      const host = row.parentElement;
      if (!host) return cleanup();
      const ph = placeholder();
      const hostRect = host.getBoundingClientRect();
      row.classList.remove("expanded");             // cross-fade content back to the mini
      if (ph) {
        const r = ph.getBoundingClientRect();
        // round to whole pixels — sub-pixel offsets render text blurry at rest
        row.style.left = `${Math.round(r.left - hostRect.left)}px`;
        row.style.top = `${Math.round(r.top - hostRect.top)}px`;
        row.style.width = `${Math.round(r.width)}px`;
        row.style.height = `${Math.round(r.height)}px`;
      }
      popTimer = setTimeout(cleanup, 460);          // after the morph-back, drop to in-flow
    };

    const flash = () => {
      const host = row.parentElement;
      if (!host || !this.compact) return;
      if (popActive) { clearTimeout(popTimer); popTimer = setTimeout(settle, DWELL); return; } // extend dwell
      popActive = true;

      const hostRect = host.getBoundingClientRect();
      const cardRect = row.getBoundingClientRect();

      const ph = document.createElement("div");
      ph.className = "tcard-ph";
      ph.dataset.for = t.id;
      ph.style.width = `${cardRect.width}px`;
      ph.style.height = `${cardRect.height}px`;
      row.after(ph);

      // pin the card exactly where it sits, then expand on the next frame.
      // Round to whole pixels so the resting text isn't blurred by sub-pixels.
      const cx = Math.round(cardRect.left - hostRect.left);
      const cy = Math.round(cardRect.top - hostRect.top);
      row.classList.add("popping");
      row.style.left = `${cx}px`;
      row.style.top = `${cy}px`;
      row.style.width = `${Math.round(cardRect.width)}px`;
      row.style.height = `${Math.round(cardRect.height)}px`;
      void row.offsetWidth;

      row.classList.add("expanded");
      row.style.left = "5px";                                // match the compact .trk-rows padding
      row.style.top = `${cy}px`;                             // stay on its own band, just stretch wide
      row.style.width = `${host.clientWidth - 10}px`;
      row.style.height = "28px";

      popTimer = setTimeout(settle, DWELL);
    };

    const paint = (tr) => { body.paint(tr); mini.paint(tr); };
    // Defer the change animation until the card has finished expanding.
    const paintAfterExpand = (tr) => {
      clearTimeout(paintTimer);
      paintTimer = setTimeout(() => { if (this.rendered) paint(tr); }, EXPAND);
    };
    return { el: row, paint, paintAfterExpand, flash, cancelPop: cleanup, vsig: undefined };
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

  /** Read an optional point bound (min/max): blank/null stays unset (null). */
  _bound(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? n : null;
  }

  /* ---- POINT (slot-reel digit) ---- */
  _bodyPoint(t) {
    const c = this._el("div", "t-point");
    const chev = this._el("div", "chev");
    const nm = this._el("div", "nm", t.name ?? "");
    const val = this._el("div", "pval");
    const reel = this._el("div", "reeldig");
    const maxlbl = this._el("div", "reelmax");      // faint "/max" suffix, only when a max is set
    val.append(reel, maxlbl);
    c.append(chev, nm, val);
    let last = null, sig = null;
    const paint = (tr) => {
      nm.textContent = tr.name ?? "";
      const lo = this._bound(tr.min), hi = this._bound(tr.max);
      const v = Math.trunc(Number(tr.value) || 0);
      this._renderReel(reel, v, last);
      maxlbl.textContent = hi !== null ? `/${hi}` : "";
      maxlbl.style.display = hi !== null ? "" : "none";
      val.classList.toggle("at-max", hi !== null && v >= hi);
      val.classList.toggle("at-min", lo !== null && v <= lo);
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

  /** Build a segmented clock pie at the given pixel size; returns {svg, segs}. */
  _makePie(slices, size) {
    const s = this._svg("svg", { viewBox: "0 0 104 104", width: size, height: size, class: "pie" });
    const segs = [];
    for (let i = 0; i < slices; i++) {
      const a0 = (i / slices) * 360 - 90, a1 = ((i + 1) / slices) * 360 - 90;
      const [x0, y0] = this._polar(52, 52, 42, a0), [x1, y1] = this._polar(52, 52, 42, a1);
      const lg = (a1 - a0) <= 180 ? 0 : 1;
      const seg = this._svg("path", { d: `M52 52 L${x0.toFixed(2)} ${y0.toFixed(2)} A42 42 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`, class: "seg" });
      s.appendChild(seg); segs.push(seg);
    }
    s.appendChild(this._svg("circle", { cx: 52, cy: 52, r: 42, class: "ring" }));
    return { svg: s, segs };
  }

  /* ---- CLOCK (segmented pie) ---- */
  _bodyClock(t) {
    const c = this._el("div", "t-clock");
    const slices = Math.max(1, Math.trunc(Number(t.slices) || 6));
    const { svg: s, segs } = this._makePie(slices, 26);
    const pie = this._el("div", "piewrap"); pie.appendChild(s);
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
      // A bad clock filling up is an ominous event — a red "doom" stamp rather
      // than the usual green "filled".
      const bad = !!tr.bad;
      this._setOverlay(c, done ? (bad ? "doom" : "done") : null,
        game.i18n.localize(bad ? "GLCT.tracker.doom" : "GLCT.tracker.filled"));
      last = v;
    };
    return { content: c, paint };
  }

  /* ---- POOL (point-style remaining count; 3D roll handled by Dice So Nice in chat) ---- */
  // Reads like a point tracker: the number of dice remaining is the hero, and
  // the die size is a faint "d?" cap — no per-die chips. A down-chevron flicks
  // on a discard, an up-chevron on a refill, mirroring the point readout.
  _bodyPool(t) {
    const c = this._el("div", "t-pool");
    const chev = this._el("div", "chev");
    const nm = this._el("div", "nm", t.name ?? "");
    const val = this._el("div", "pval");
    const reel = this._el("div", "reeldig");
    const sizelbl = this._el("div", "reelmax");     // faint "d?" cap, mirroring point's "/max"
    val.append(reel, sizelbl);
    c.append(chev, nm, val);
    if (t.playerRoll) { const p = this._el("div", "play"); p.innerHTML = '<i class="fa-solid fa-play"></i>'; p.title = game.i18n.localize("GLCT.tracker.playersMayRoll"); c.append(p); }
    let last = null;
    const paint = (tr) => {
      nm.textContent = tr.name ?? "";
      const cur = Math.max(0, Math.trunc(Number(tr.current) || 0));
      const size = Math.max(2, Math.trunc(Number(tr.size) || 6));
      this._renderReel(reel, cur, last);
      sizelbl.textContent = `d${size}`;
      val.classList.toggle("at-min", cur === 0);     // empty pool reads red, like a point at its floor
      if (last !== null && cur !== last) {
        const dir = cur > last ? "up" : "down";
        chev.textContent = cur > last ? "▲" : "▼";
        chev.className = "chev";
        void chev.offsetWidth;
        chev.className = "chev " + dir;
      }
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

  /* ---- COMPACT MINI (vertical "playing-card" face for collapsed mode) ---- */
  _buildMini(t) {
    const el = this._el("div", "tmini t-" + t.type);
    const name = this._el("div", "tm-name");
    const core = this._el("div", "tm-core");
    el.append(name, core);

    let paint;
    switch (t.type) {
      case "clock": {
        const slices = Math.max(1, Math.trunc(Number(t.slices) || 6));
        const { svg, segs } = this._makePie(slices, 24);
        core.appendChild(svg);
        const sub = this._el("div", "tm-sub"); el.appendChild(sub);
        paint = (tr) => {
          name.textContent = tr.name ?? "";
          const v = Math.max(0, Math.min(slices, Math.trunc(Number(tr.value) || 0)));
          segs.forEach((sg, i) => sg.classList.toggle("fill", i < v));
          sub.textContent = `${v}/${slices}`;
          el.classList.toggle("complete", v >= slices);
        };
        break;
      }
      case "pool": {
        // Like the point card: the remaining count is the hero, the die size a faint cap.
        const val = this._el("div", "tm-val big");
        const sizelbl = this._el("div", "tm-max");
        core.append(val, sizelbl);
        paint = (tr) => {
          name.textContent = tr.name ?? "";
          const cur = Math.max(0, Math.trunc(Number(tr.current) || 0));
          const size = Math.max(2, Math.trunc(Number(tr.size) || 6));
          val.textContent = String(cur);
          sizelbl.textContent = `d${size}`;
          el.classList.toggle("at-min", cur === 0);
        };
        break;
      }
      case "task":
      case "hazard": {
        const boxes = Math.max(1, Math.trunc(Number(t.boxes) || (t.type === "hazard" ? 8 : 6)));
        const val = this._el("div", "tm-val");
        core.appendChild(val);
        paint = (tr) => {
          name.textContent = tr.title ?? "";
          const v = Math.max(0, Math.min(boxes, Math.trunc(Number(tr.value) || 0)));
          val.innerHTML = `<b>${v}</b><i>/${boxes}</i>`;
          el.classList.toggle("full", v >= boxes);
        };
        break;
      }
      case "separator": {
        el.classList.add("sep");
        paint = (tr) => { name.textContent = (tr.label ?? "").trim(); };
        break;
      }
      default: { // point
        const val = this._el("div", "tm-val big");
        const maxlbl = this._el("div", "tm-max");
        core.append(val, maxlbl);
        paint = (tr) => {
          name.textContent = tr.name ?? "";
          const lo = this._bound(tr.min), hi = this._bound(tr.max);
          const v = Math.trunc(Number(tr.value) || 0);
          val.textContent = String(v);
          maxlbl.textContent = hi !== null ? `/${hi}` : "";
          maxlbl.style.display = hi !== null ? "" : "none";
          el.classList.toggle("at-max", hi !== null && v >= hi);
          el.classList.toggle("at-min", lo !== null && v <= lo);
        };
      }
    }
    return { el, paint };
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
    if (head) {
      head.addEventListener("pointerdown", this._onDragDock.bind(this));
      // Double-tap the header to switch standard <-> compact (mirrors the calendar HUD).
      head.addEventListener("dblclick", ev => {
        if (ev.target.closest("button")) return;
        ev.preventDefault();
        this._onToggleCompact();
      });
    }
    // While collapsed, double-tapping a card expands the whole dock again.
    this.element.querySelector("[data-rows]")?.addEventListener("dblclick", ev => {
      if (!this.compact || !ev.target.closest(".tmini")) return;
      ev.preventDefault();
      this._onToggleCompact();
    });
  }

  async _onToggleCompact() {
    const next = !this.compact;
    try { await game.settings.set(MODULE_ID, SETTINGS.trackerHudCompact, next); } catch { /* ignore */ }
    // Tear down any in-flight pop-outs (timers, placeholders, inline geometry)
    // so the dock lands in a clean state on either side of the toggle.
    this._rows.forEach(r => r.cancelPop?.());
    this.element.querySelector("[data-dock]")?.classList.toggle("compact", next);
    this.update();   // reconcile every row to its current value after the toggle
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
