/**
 * GlctHud — the Arcane Glass top-bar HUD as a frameless ApplicationV2.
 *
 * Rendering strategy: the Handlebars template provides the skeleton; the
 * dynamic children (stretch pips, shift cells, dual-ring, slot-reel clocks)
 * are built once in _onRender. Time updates call update() which *mutates* the
 * existing DOM — never a full re-render — so reel/pip animations stay
 * continuous, exactly like the approved mockup.
 */

import { MODULE_ID, SETTINGS } from "../const.js";
import { TimeEngine } from "../engine.js";
import {
  STRETCHES_PER_SHIFT, STRETCHES_PER_HOUR, HOURS_PER_SHIFT, SHIFTS_PER_DAY,
  STRETCHES_PER_DAY, SECONDS_PER_STRETCH
} from "../time-math.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const NS = "http://www.w3.org/2000/svg";

export class GlctHud extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  /** Open (or focus) the singleton HUD. */
  static async open() {
    if (!this.instance) this.instance = new this();
    await this.instance.render(true);
    return this.instance;
  }

  /** Repaint the live HUD from current world time (no full re-render). */
  static refreshState() { this.instance?.update(); }

  /** Force a structural re-render (e.g. after isGM/collapse template changes). */
  static async refreshStructure() {
    if (this.instance?.rendered) { this.instance._built = false; await this.instance.render(); }
  }

  static DEFAULT_OPTIONS = {
    id: "glct-hud",
    classes: ["glct"],
    tag: "div",
    window: { frame: false, positioned: false, minimizable: false, resizable: false },
    actions: {
      advance: GlctHud.prototype._onAdvance,
      nextShift: GlctHud.prototype._onNextShift,
      setTime: GlctHud.prototype._onSetTime,
      openCalendar: GlctHud.prototype._onOpenCalendar,
      toggleCollapse: GlctHud.prototype._onToggleCollapse
    }
  };

  static PARTS = {
    hud: { template: `modules/${MODULE_ID}/templates/hud.hbs` }
  };

  _built = false;
  _prevShift = null;
  _reels = [];
  _ringPies = [];
  _ringSqs = [];
  _displayTime = null;  // world time currently painted on the HUD
  _anim = null;         // active step-animation interval id

  get collapsed() {
    try { return game.settings.get(MODULE_ID, SETTINGS.hudCollapsed); } catch { return false; }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      isGM: game.user?.isGM ?? false,
      collapsed: this.collapsed
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._buildDynamic();
    this._applyPosition();
    this._activateInteractions();
    this.update();
  }

  /* --------------------------- DOM construction --------------------------- */

  _buildDynamic() {
    if (this._built) return;
    const root = this.element;

    // stretch meter: 6 hour-groups x 6 pips
    const track = root.querySelector("[data-track]");
    if (track) {
      track.replaceChildren();
      for (let h = 0; h < HOURS_PER_SHIFT; h++) {
        const g = document.createElement("div"); g.className = "hourgrp";
        for (let p = 0; p < STRETCHES_PER_HOUR; p++) {
          const e = document.createElement("div"); e.className = "pip"; g.appendChild(e);
        }
        track.appendChild(g);
      }
    }

    // shift cells
    const shiftsRow = root.querySelector("[data-shifts]");
    if (shiftsRow) {
      shiftsRow.replaceChildren();
      for (let i = 0; i < SHIFTS_PER_DAY; i++) {
        const d = document.createElement("span"); d.className = "s"; shiftsRow.appendChild(d);
      }
    }

    // dual-ring (inner 4-quadrant shift pie + outer hour-gapped stretch squares)
    const ringHost = root.querySelector("[data-ring]");
    this._ringPies = []; this._ringSqs = [];
    if (ringHost) {
      ringHost.replaceChildren();
      const svg = this._svg("svg", { viewBox: "0 0 40 40", width: 34, height: 34, class: "ring" });
      for (let i = 0; i < SHIFTS_PER_DAY; i++) {
        const p = this._svg("path", { d: this._wedge(20, 20, 8, i * 90 - 45, (i + 1) * 90 - 45), class: "pie" });
        svg.appendChild(p); this._ringPies.push(p);
      }
      svg.appendChild(this._svg("circle", { cx: 20, cy: 20, r: 2.3, class: "hub" }));
      const dpu = 360 / 42, off = -90 + dpu;
      for (let i = 0; i < STRETCHES_PER_SHIFT; i++) {
        const ang = off + (i + Math.floor(i / 6)) * dpu;
        const g = this._svg("g", { transform: `translate(20 20) rotate(${ang})` });
        const rect = this._svg("rect", { x: -1.15, y: -13, width: 2.3, height: 3, rx: 0.6, class: "sq" });
        g.appendChild(rect); svg.appendChild(g); this._ringSqs.push(rect);
      }
      ringHost.appendChild(svg);
    }

    // slot-reel clocks
    this._reels = [...root.querySelectorAll("[data-reelclock]")].map(host => this._buildClock(host));

    this._built = true;
  }

  _svg(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  _polar(cx, cy, r, deg) { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  _wedge(cx, cy, r, a0, a1) {
    const [x0, y0] = this._polar(cx, cy, r, a0), [x1, y1] = this._polar(cx, cy, r, a1);
    const lg = a1 - a0 <= 180 ? 0 : 1;
    return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${lg} 1 ${x1} ${y1} Z`;
  }

  _buildClock(host) {
    host.replaceChildren();
    const reels = [];
    for (let i = 0; i < 4; i++) {
      if (i === 2) { const c = document.createElement("span"); c.className = "colon"; c.textContent = ":"; host.appendChild(c); }
      const r = document.createElement("span"); r.className = "reel";
      const s = document.createElement("span"); s.className = "strip";
      for (let n = 0; n <= 10; n++) { const d = document.createElement("span"); d.textContent = n % 10; s.appendChild(d); }
      r.appendChild(s); r.dataset.cur = "0"; r.style.setProperty("--rd", `${i * 0.045}s`);
      host.appendChild(r); reels.push(r);
    }
    return { host, reels };
  }

  _setReel(reel, d) {
    const strip = reel.firstChild;
    let cur = +reel.dataset.cur;
    // If a prior forward-wrap left us parked on the duplicate 0 (index 10),
    // collapse to the real 0 and cancel its pending snap before retargeting —
    // otherwise that stale timeout fires mid-tween and resets the digit to 0.
    if (cur === 10) {
      clearTimeout(reel._t);
      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      void strip.offsetWidth;
      strip.style.transition = "";
      cur = 0;
      reel.dataset.cur = "0";
    }
    if (d === cur) return;
    const target = (d === 0) ? 10 : d;   // roll forward through the duplicate 0
    strip.style.transform = `translateY(-${target * (100 / 11)}%)`;
    reel.dataset.cur = String(target);
    if (target === 10) {
      clearTimeout(reel._t);
      reel._t = setTimeout(() => {
        strip.style.transition = "none";
        strip.style.transform = "translateY(0)";
        reel.dataset.cur = "0";
        void strip.offsetWidth;
        strip.style.transition = "";
      }, 760);
    }
  }

  _setClock(clockObj, str) {
    const ds = str.replace(":", "").split("").map(Number);
    clockObj.reels.forEach((r, i) => this._setReel(r, ds[i]));
  }

  /* ------------------------------ painting ------------------------------- */

  /**
   * Entry point for all repaints. Jumps larger than one stretch are tweened —
   * the displayed time steps one stretch at a time toward the real world time,
   * so advancing an hour/shift/day visibly "ticks" rather than snapping.
   */
  update() {
    if (!this.rendered || !this._built) return;
    const target = TimeEngine.worldTime;

    if (this._displayTime === null) { this._paintAt(target); return; }

    const steps = Math.round(Math.abs(target - this._displayTime) / SECONDS_PER_STRETCH);
    // Snap directly for ≤1 stretch and for day-or-larger jumps (too long to tween).
    if (steps <= 1 || steps >= STRETCHES_PER_DAY) { this._cancelAnim(); this._paintAt(target); return; }
    this._animateTo(target, steps);
  }

  _paintAt(t, quiet = false) {
    this._displayTime = t;
    this._paint(TimeEngine.getStateAt(t), quiet);
  }

  _cancelAnim() {
    if (this._anim) { clearInterval(this._anim); this._anim = null; }
  }

  /** Tween the displayed time from the current paint to `to`, one stretch per tick. */
  _animateTo(to, steps) {
    this._cancelAnim();
    const from = this._displayTime;
    const dir = Math.sign(to - from);
    const interval = Math.max(16, Math.min(80, 700 / steps));
    let i = 0;
    this._anim = setInterval(() => {
      if (!this.rendered || !this._built) { this._cancelAnim(); return; }
      i++;
      const last = i >= steps;
      this._paintAt(last ? to : from + i * SECONDS_PER_STRETCH * dir, !last);
      if (last) this._cancelAnim();
    }, interval);
  }

  _paint(st, quiet = false) {
    const root = this.element;

    // per-shift theming
    root.style.setProperty("--tint", st.watch.tint);
    root.style.setProperty("--tint2", st.watch.tint2);
    root.style.setProperty("--glow", st.watch.glow);
    root.style.setProperty("--glowsoft", st.watch.soft);

    // light sweep on shift change
    if (this._prevShift !== null && st.shiftIndex !== this._prevShift) {
      const bar = root.querySelector("[data-bar]");
      if (bar) { bar.classList.remove("swept"); void bar.offsetWidth; bar.classList.add("swept"); }
    }
    this._prevShift = st.shiftIndex;

    // text fields
    this._setText("[data-watch]", st.watch.name);
    this._setText("[data-wd]", st.date.weekday);
    this._setText("[data-dy]", st.date.day);
    this._setText("[data-ord]", st.date.ordinal);
    this._setText("[data-moshort]", st.date.monthAbbr);
    this._setText("[data-mo]", `${st.date.monthName} · ${st.date.year}${st.date.yearLabel ? " " + st.date.yearLabel : ""}`);
    this._setText("[data-pilldate]", `· ${st.date.weekday} ${st.date.day}`);
    this._setText("[data-season]", st.seasonName);
    this._setText("[data-rem]", game.i18n.format("GLCT.hud.stretchesLeft", { n: st.stretchesLeftInShift }));

    // slot-reel clocks
    this._reels.forEach(c => this._setClock(c, st.clock));

    // moon phase shadow
    const sh = root.querySelector("[data-moon]");
    if (sh) sh.style.left = `${(st.moonPhase / 7) * 14 - 7}px`;

    // shift cells
    root.querySelectorAll("[data-shifts] .s").forEach((d, i) => {
      d.classList.toggle("on", i === st.shiftIndex);
      d.classList.toggle("done", i < st.shiftIndex);
      if (i === st.shiftIndex) d.style.setProperty("--fill", `${st.shiftProgress * 100}%`);
    });

    // stretch meter pips
    let headPip = null;
    root.querySelectorAll(".hourgrp .pip").forEach((p, idx) => {
      const dist = Math.abs(idx - st.stretchInShift);
      p.style.transitionDelay = `${Math.min(dist, 8) * 22}ms`;
      p.classList.toggle("fill", idx < st.stretchInShift);
      const isHead = idx === st.stretchInShift;
      p.classList.toggle("head", isHead);
      if (isHead) headPip = p;
    });
    if (headPip) { headPip.classList.remove("pop"); void headPip.offsetWidth; headPip.classList.add("pop"); }
    root.querySelectorAll(".hourgrp").forEach((g, h) => g.classList.toggle("curr", h === st.hourOfShift));

    // dual-ring
    this._ringPies.forEach((p, i) => p.classList.toggle("on", i === st.shiftIndex));
    this._ringSqs.forEach((rect, idx) => {
      const inHour = Math.floor(idx / 6) === st.hourOfShift;
      const passed = idx < st.stretchInShift, head = idx === st.stretchInShift;
      let k = 1, fill = "rgba(255,255,255,.14)", filt = "none";
      if (head) { k = 2.9; fill = "#fff"; filt = "drop-shadow(0 0 3.2px rgba(255,255,255,1))"; }
      else if (inHour) { k = 1.55; fill = passed ? "var(--tint)" : "rgba(255,255,255,.22)"; }
      else if (passed) { k = 1; fill = "var(--tint)"; }
      rect.style.transform = `scaleY(${k})`; rect.style.fill = fill; rect.style.filter = filt;
    });

    // event chip
    const chip = root.querySelector("[data-event]");
    if (chip) {
      const today = st.events.today?.[0];
      if (today) {
        chip.classList.add("today");
        this._setText("[data-eventtxt]", game.i18n.format("GLCT.events.today", { name: today.name }));
      } else {
        chip.classList.remove("today");
        const txt = st.events.next
          ? game.i18n.format("GLCT.events.next", { name: st.events.next.name, days: st.events.next.days })
          : "—";
        this._setText("[data-eventtxt]", txt);
      }
    }

    if (!quiet) Hooks.callAll(`${MODULE_ID}.timeChanged`, st);
  }

  _setText(sel, txt) {
    this.element.querySelectorAll(sel).forEach(e => { e.textContent = txt; });
  }

  /* ---------------------------- interactions ----------------------------- */

  _activateInteractions() {
    const root = this.element;
    // right-click any step button to rewind that step
    root.querySelectorAll('.c[data-action="advance"]').forEach(c => {
      c.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        if (!game.user.isGM) return;
        TimeEngine.advanceStep(c.dataset.step, { rewind: true });
        c.classList.add("rw"); setTimeout(() => c.classList.remove("rw"), 420);
      });
    });
    // drag to reposition via the grip
    const grip = root.querySelector(".grip");
    if (grip) grip.addEventListener("pointerdown", this._onDragStart.bind(this));
  }

  _applyPosition() {
    const el = this.element;
    el.style.position = "fixed";
    el.style.zIndex = "70";
    let pos = {};
    try { pos = game.settings.get(MODULE_ID, SETTINGS.hudPosition) ?? {}; } catch { /* ignore */ }
    if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      el.style.left = `${pos.left}px`; el.style.top = `${pos.top}px`; el.style.transform = "none";
    } else {
      el.style.left = "50%"; el.style.top = "6px"; el.style.transform = "translateX(-50%)";
    }
  }

  _onDragStart(ev) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const el = this.element;
    const rect = el.getBoundingClientRect();
    const ox = ev.clientX - rect.left, oy = ev.clientY - rect.top;
    const start = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const move = e => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
        moved = true; el.style.transform = "none";
      }
      if (moved) { el.style.left = `${e.clientX - ox}px`; el.style.top = `${e.clientY - oy}px`; }
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) { this._onToggleCollapse(); return; }   // a click, not a drag
      const r = el.getBoundingClientRect();
      try { await game.settings.set(MODULE_ID, SETTINGS.hudPosition, { left: Math.round(r.left), top: Math.round(r.top) }); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* --------------------------- action handlers --------------------------- */

  async _onAdvance(ev, target) {
    if (!game.user.isGM) return;
    await TimeEngine.advanceStep(target.dataset.step);
  }
  async _onNextShift() {
    if (!game.user.isGM) return;
    await TimeEngine.nextShift();
  }
  async _onToggleCollapse() {
    const next = !this.collapsed;
    try { await game.settings.set(MODULE_ID, SETTINGS.hudCollapsed, next); } catch { /* ignore */ }
    this.element.querySelector("[data-bar]")?.classList.toggle("collapsed", next);
    this.element.querySelector(".hud-root")?.classList.toggle("is-collapsed", next);
  }
  async _onSetTime() {
    if (!game.user.isGM) return;
    const { SetTimeDialog } = await import("./set-time-dialog.js");
    SetTimeDialog.show();
  }
  async _onOpenCalendar() {
    const { CalendarView } = await import("./calendar-view.js");
    CalendarView.show();
  }
}
