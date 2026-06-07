/**
 * Dice3D — genuine 3D dice for the delving Turn card, rendered with three.js.
 *
 * The earlier in-card roll was a flat PixiJS pseudo-tumble; this replaces it with
 * real 3D geometry: lit, bevelled cubes that fall, tumble and settle showing the
 * rolled value on top, with a soft contact shadow — the "Dice So Nice" technology
 * (three.js + WebGL) but contained INSIDE the chat card instead of a full-screen
 * overlay (the original decision).
 *
 * three.js isn't bundled with Foundry, so it's loaded on demand from a CDN (the
 * module already pulls a webfont from a CDN, so this is consistent). The whole
 * thing is best-effort: if three.js can't load (offline / CSP), `mount` returns
 * null and the caller falls back to the Pixi tumble, then to the baked static
 * result spans. Reduced-motion and missing-WebGL also bail to the static result.
 *
 * Landing is scripted, not physically simulated: each die is built with its rolled
 * value on the +Y face and random other faces, then tumbled with decaying angular
 * velocity and slerped to "value-up" over the final stretch — so it always reads
 * the correct result while still looking like a real, chaotic roll.
 */

const CAP = 14;            // max dice rendered; extras stay as static spans
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.js";

const SETTLE = 1.25;       // seconds of fall + tumble
const HOLD = 0.55;         // seconds resting before the canvas fades
const FADE = 0.4;          // seconds to fade out, revealing the static result

const rand = (a, b) => a + Math.random() * (b - a);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
const hexCss = s => (/^#?[0-9a-f]{6}$/i.test(String(s ?? "")) ? (String(s)[0] === "#" ? s : "#" + s) : "#ff9a3c");

let THREE_PROMISE = null;
function loadThree() {
  if (THREE_PROMISE) return THREE_PROMISE;
  if (globalThis.__GLCT_THREE) { THREE_PROMISE = Promise.resolve(globalThis.__GLCT_THREE); return THREE_PROMISE; }
  THREE_PROMISE = import(/* webpackIgnore: true */ THREE_URL)
    .then(m => { const T = m.default ?? m; globalThis.__GLCT_THREE = T; return T; })
    .catch(err => { THREE_PROMISE = null; throw err; });
  return THREE_PROMISE;
}

export class Dice3D {
  /**
   * Animate a real-3D roll over a `.glct-cc-dice` host. Resolves to the instance,
   * or null when it can't run (caller should then try the Pixi fallback). Sets
   * `host.dataset.tumbled` only once it actually starts, so a null result leaves
   * the host free for the fallback.
   */
  static async mount(host, { faces = [], size = 6, discard = 0, tint = "#ff9a3c" } = {}) {
    if (!host || host.dataset.tumbled || !faces.length) return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return null;
    // Cheap WebGL capability probe before committing to the CDN fetch.
    try {
      const probe = document.createElement("canvas");
      if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
    } catch { return null; }

    let THREE;
    try { THREE = await loadThree(); }
    catch (err) { console.warn("gluniverse-clocks-and-tracker | three.js load failed; using fallback dice", err); return null; }

    // The card may have been removed while three.js loaded.
    if (!host.isConnected || host.dataset.tumbled) return null;
    host.dataset.tumbled = "1";
    try { return new Dice3D(THREE, host, { faces, size, discard, tint }); }
    catch (err) { console.warn("gluniverse-clocks-and-tracker | Dice3D init failed", err); return null; }
  }

  constructor(THREE, host, { faces, size, discard, tint }) {
    this.THREE = THREE;
    this.host = host;
    // Add the class first so the host grows to its taller "tumbling" height before
    // we measure — the reads below force the reflow that applies it.
    host.classList.add("dx-tumbling");
    const w = Math.max(48, host.clientWidth || 160);
    const h = Math.max(48, host.clientHeight || 56);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    const view = this.renderer.domElement;
    Object.assign(view.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "2" });
    host.appendChild(view);

    this.scene = new THREE.Scene();

    const n = Math.min(faces.length, CAP);
    const SP = 1.32;                       // spacing between dice (die size = 1)
    const rowHalf = (n - 1) * SP / 2;
    const floorY = 0.5;                     // resting die-centre height (cube sits on y=0)

    // Tilted orthographic camera: predictable framing for a row + a clean iso 3D
    // read (we see each die's top + two side faces).
    const aspect = w / h;
    // Fit the row across the width; a generous floor keeps single/few dice from
    // rendering oversized. viewH follows the aspect so cubes never distort, and a
    // gentle tilt shows each die's top (the value) plus two side faces.
    const viewW = Math.max(4.6, rowHalf * 2 + 2.6);
    const viewH = viewW / aspect;
    this.cam = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, -50, 50);
    this.cam.position.set(0.0, 3.6, 5.0);
    this.cam.lookAt(0, floorY, 0);

    const tintHex = hexCss(tint);
    const tintCol = new THREE.Color(tintHex);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(2.5, 6, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(tintCol.getHex(), 0.7); rim.position.set(-3, 2, -2); this.scene.add(rim);

    // Shared cube geometry + a reusable contact-shadow texture. Crisp faces with
    // the per-face number textures and the lighting below read clearly as 3D dice.
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.shadowTex = this._shadowTexture();

    this.dice = [];
    for (let i = 0; i < n; i++) {
      const val = faces[i];
      const dropped = val <= discard;
      const slotX = -rowHalf + i * SP;
      const die = this._makeDie(val, size, dropped, tintCol);

      const target = new THREE.Quaternion();       // value-up rest pose + random yaw
      target.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-Math.PI, Math.PI));

      const mesh = die.mesh;
      mesh.position.set(slotX + rand(-0.25, 0.25), rand(3.4, 5.2), rand(-0.2, 0.2));
      mesh.quaternion.copy(new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28))));
      this.scene.add(mesh);

      const shadow = this._shadowMesh();
      shadow.position.set(slotX, 0.01, 0.05);
      this.scene.add(shadow);

      this.dice.push({
        mesh, shadow, dropped, slotX, floorY, target,
        startQuat: mesh.quaternion.clone(),
        startY: mesh.position.y,
        angVel: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        delay: i * 0.04
      });
    }

    this._t = 0;
    this._done = false;
    this._raf = null;
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  _makeDie(val, size, dropped, tintCol) {
    const THREE = this.THREE;
    const base = dropped ? "#2a2230" : "#14141c";
    const ink = dropped ? "#b48b8b" : "#ffffff";
    const ring = dropped ? "rgba(255,120,110,.55)" : "rgba(255,255,255,.16)";
    // +Y (index 2) carries the rolled value; other faces get plausible siblings.
    const others = this._siblings(val, size, 5);
    const order = [others[0], others[1], val, others[2], others[3], others[4]];
    const mats = order.map((v, idx) => {
      const tex = new THREE.CanvasTexture(this._face(v, base, ink, ring));
      tex.anisotropy = 4;
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.12 });
      m.emissive = tintCol.clone(); m.emissiveIntensity = dropped ? 0.0 : 0.12;
      return m;
    });
    const mesh = new THREE.Mesh(this.geo, mats);
    return { mesh };
  }

  /** Random distinct face values around `val` within 1..size (for the side faces). */
  _siblings(val, size, count) {
    const pool = [];
    for (let v = 1; v <= size; v++) if (v !== val) pool.push(v);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = pool.slice(0, count);
    while (out.length < count) out.push(1 + Math.floor(Math.random() * size));
    return out;
  }

  _face(value, base, ink, ring) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = base; this._round(g, 6, 6, 116, 116, 22); g.fill();
    g.lineWidth = 5; g.strokeStyle = ring; this._round(g, 10, 10, 108, 108, 18); g.stroke();
    g.fillStyle = ink; g.font = "700 74px Signika, 'Segoe UI', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(value), 64, 70);
    return c;
  }

  _round(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  _shadowTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grd.addColorStop(0, "rgba(0,0,0,.5)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const tex = new this.THREE.CanvasTexture(c);
    return tex;
  }

  _shadowMesh() {
    const THREE = this.THREE;
    const mat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  _loop(now) {
    if (this._done) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._t += dt;
    const THREE = this.THREE;

    if (this._t <= SETTLE) {
      for (const d of this.dice) {
        const lt = Math.max(0, this._t - d.delay);
        const p = Math.min(1, lt / (SETTLE - d.delay));
        // drop with a bounce
        d.mesh.position.y = d.floorY + (d.startY - d.floorY) * (1 - easeOutBounce(p));
        d.mesh.position.x += (d.slotX - d.mesh.position.x) * Math.min(1, dt * 6);
        d.mesh.position.z += (0 - d.mesh.position.z) * Math.min(1, dt * 6);
        // tumble, decaying; slerp toward value-up over the final stretch
        if (p < 0.72) {
          const e = new THREE.Euler(d.angVel.x * dt, d.angVel.y * dt, d.angVel.z * dt);
          d.mesh.quaternion.multiply(new THREE.Quaternion().setFromEuler(e));
          d.angVel.multiplyScalar(0.985);
        } else {
          const k = (p - 0.72) / 0.28;
          d.mesh.quaternion.slerp(d.target, Math.min(1, k * 0.35));
        }
        // contact shadow firms up as the die nears the floor
        const closeness = 1 - Math.min(1, (d.mesh.position.y - d.floorY) / 4);
        d.shadow.material.opacity = 0.5 * closeness;
        d.shadow.scale.setScalar(0.7 + 0.3 * closeness);
      }
    } else if (this._t <= SETTLE + HOLD) {
      for (const d of this.dice) {
        d.mesh.quaternion.slerp(d.target, Math.min(1, dt * 12));
        d.mesh.position.y += (d.floorY - d.mesh.position.y) * Math.min(1, dt * 12);
        if (d.dropped) {
          d.mesh.scale.lerp(new THREE.Vector3(0.86, 0.86, 0.86), Math.min(1, dt * 8));
          for (const m of d.mesh.material) { m.transparent = true; m.opacity = 0.6 + 0.4 * (1 - (this._t - SETTLE) / HOLD); }
        }
      }
    } else {
      const fp = (this._t - SETTLE - HOLD) / FADE;
      const a = Math.max(0, 1 - fp);
      for (const d of this.dice) {
        for (const m of d.mesh.material) { m.transparent = true; m.opacity = a; }
        d.shadow.material.opacity = 0.5 * a;
      }
      if (fp >= 1) { this.destroy(); return; }
    }

    this.renderer.render(this.scene, this.cam);
    this._raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    if (this._done) return;
    this._done = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.host?.classList.remove("dx-tumbling");
    try {
      this.geo?.dispose?.();
      for (const d of this.dice) {
        for (const m of d.mesh.material) { m.map?.dispose?.(); m.dispose?.(); }
        d.shadow.material.dispose?.(); d.shadow.geometry.dispose?.();
      }
      this.shadowTex?.dispose?.();
      this.renderer?.dispose?.();
      this.renderer?.domElement?.remove();
    } catch { /* ignore */ }
    this.renderer = null; this.scene = null; this.dice = [];
  }
}
