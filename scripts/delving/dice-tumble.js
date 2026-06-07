/**
 * DiceTumble — a self-contained, in-chat-card 3D-ish dice roll for delving turns.
 *
 * Decision: rather than Dice So Nice's full-screen overlay (which crowds the UI),
 * the delving pool animates a contained tumble INSIDE the Turn card, reusing
 * Foundry's bundled PixiJS — no new dependency. Only the newest card animates
 * live; the card already contains the baked static result spans, so once the
 * tumble settles and fades, the permanent result is what remains (and scrollback
 * / older cards never animate). If Pixi/WebGL is unavailable or the user prefers
 * reduced motion, we simply leave the static spans in place.
 *
 * Each die is a rounded-cube sprite that drops in, tumbles (rotation + a face
 * cycling through random values), then locks to its rolled value and settles into
 * a row; dice that were discarded (≤ the drop range) dim out. Real rigid-body 3D
 * is intentionally out of scope — this reads as a 3D tumble without N live
 * physics canvases (browsers cap WebGL contexts, and chat re-renders constantly).
 */

const CAP = 12;                 // max dice animated; extras are shown by the static spans
const FACE_LOCK = 0.78;         // fraction of the tumble after which the value locks
const SETTLE = 1.15;            // seconds of tumbling
const HOLD = 0.5;               // seconds held settled before the canvas fades
const FADE = 0.34;              // seconds to fade the canvas out

const rand = (a, b) => a + Math.random() * (b - a);
const ease = t => 1 - Math.pow(1 - t, 3);   // easeOutCubic
const hexInt = (s, fb = 0xffffff) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s ?? "")); return m ? parseInt(m[1], 16) : fb; };

export class DiceTumble {
  /**
   * Animate a tumble over a `.glct-cc-dice` host. `faces` are the rolled values,
   * `discard` the drop threshold (≤ = discarded), `size` the die size, `tint` the
   * stage glow colour. No-ops (leaving the static spans) when it can't run.
   */
  static mount(host, { faces = [], size = 6, discard = 0, tint = "#ff9a3c" } = {}) {
    const PIXI = globalThis.PIXI;
    if (!host || host.dataset.tumbled || !PIXI || !faces.length) return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return null;
    host.dataset.tumbled = "1";
    try { return new DiceTumble(host, { faces, size, discard, tint }); }
    catch (err) { console.warn("gluniverse-clocks-and-tracker | DiceTumble init failed", err); return null; }
  }

  constructor(host, { faces, size, discard, tint }) {
    const PIXI = globalThis.PIXI;
    this.host = host;
    host.classList.add("dx-tumbling");     // grows the host + hides the static spans
    const w = Math.max(40, host.clientWidth || 120);
    const h = Math.max(48, host.clientHeight || 56);

    this.app = new PIXI.Application({
      width: w, height: h, backgroundAlpha: 0, antialias: true,
      autoStart: false, resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    const view = this.app.view ?? this.app.canvas;
    Object.assign(view.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "2" });
    host.appendChild(view);

    const n = Math.min(faces.length, CAP);
    const gap = 3;
    const d = Math.max(12, Math.min(22, Math.floor((w - gap * (n + 1)) / n), h - 4));
    const totalW = n * d + (n - 1) * gap;
    const x0 = (w - totalW) / 2 + d / 2;
    const slotY = h / 2;

    this.glow = hexInt(tint, 0xff9a3c);
    this.size = size;
    this.dice = [];
    for (let i = 0; i < n; i++) {
      const val = faces[i];
      const dropped = val <= discard;
      const die = this._makeDie(d, val, dropped);
      die.x = x0 + i * (d + gap);
      die.y = -d - rand(0, h);            // start above the card
      this.app.stage.addChild(die.cont);
      Object.assign(die, { slotX: die.x, slotY, startY: die.y, startRot: rand(-Math.PI * 3, Math.PI * 3), spin: rand(-10, 10), dropped, val });
      this.dice.push(die);
    }

    this._t = 0;
    this._done = false;
    this.app.ticker.add(this._tick, this);
    this.app.ticker.start();
  }

  _makeDie(d, val, dropped) {
    const PIXI = globalThis.PIXI;
    const cont = new PIXI.Container();
    const body = new PIXI.Graphics();
    const r = Math.max(2, d * 0.18);
    body.beginFill(dropped ? 0x3a3a42 : 0x101016, 0.96);
    body.lineStyle(Math.max(1, d * 0.06), dropped ? 0x6a6a72 : this.glow, 0.95);
    body.drawRoundedRect(-d / 2, -d / 2, d, d, r);
    body.endFill();
    cont.addChild(body);
    const label = new PIXI.Text(String(val), {
      fontFamily: "Signika, sans-serif",
      fontSize: Math.round(d * 0.6),
      fontWeight: "700",
      fill: dropped ? 0x9a9aa2 : 0xffffff
    });
    label.anchor.set(0.5);
    cont.addChild(label);
    return { cont, body, label, x: 0, y: 0 };
  }

  _tick() {
    if (this._done) return;
    const dt = Math.min(0.05, (this.app?.ticker?.deltaMS ?? 16.6) / 1000);
    this._t += dt;
    const t = this._t;

    if (t <= SETTLE) {
      const p = ease(t / SETTLE);
      const locking = (t / SETTLE) >= FACE_LOCK;
      for (const die of this.dice) {
        die.cont.y = die.startY + (die.slotY - die.startY) * p;
        die.cont.x = die.slotX;
        die.cont.rotation = die.startRot * (1 - p) + die.spin * (1 - p) * 0.2;
        // a little tumble "depth": squash/stretch the cube as it spins
        const s = 0.82 + 0.18 * Math.abs(Math.cos(die.cont.rotation));
        die.cont.scale.set(1, s);
        if (!locking) {
          if ((die._fc = (die._fc ?? 0) + dt) > 0.05) { die._fc = 0; die.label.text = String(1 + Math.floor(Math.random() * this.size)); }
        } else if (die.label.text !== String(die.val)) {
          die.label.text = String(die.val);
        }
      }
      return;
    }

    // settled: snap upright, then dim the discarded dice
    if (t <= SETTLE + HOLD) {
      const p = Math.min(1, (t - SETTLE) / 0.18);
      for (const die of this.dice) {
        die.cont.rotation *= (1 - p);
        die.cont.scale.set(1, 1);
        die.label.text = String(die.val);
        if (die.dropped) die.cont.alpha = 1 - 0.6 * p;
      }
      return;
    }

    // fade the whole canvas out, revealing the baked static spans beneath
    const fp = (t - SETTLE - HOLD) / FADE;
    this.app.stage.alpha = Math.max(0, 1 - fp);
    if (fp >= 1) this.destroy();
  }

  destroy() {
    if (this._done) return;
    this._done = true;
    this.host?.classList.remove("dx-tumbling");
    try { this.app?.ticker?.remove(this._tick, this); } catch { /* ignore */ }
    try { this.app?.destroy(true, { children: true, texture: true, baseTexture: true }); } catch { /* ignore */ }
    this.app = null;
  }
}
