/**
 * Dice3D — genuine, physically-simulated 3D dice for the delving Turn card.
 *
 * This is the "Dice So Nice" technology — three.js for rendering + cannon-es for
 * rigid-body physics — but contained INSIDE the chat card instead of a
 * full-screen overlay (the original decision). Each die is a real box body that
 * is thrown into a small walled arena, bounces, collides with its siblings and
 * the floor, and tumbles to a natural rest under gravity. Nothing is scripted or
 * faked: the motion is a live simulation, so every roll looks different.
 *
 * The *result* is honoured without rigging the simulation: we let the dice fall
 * however they fall, then once they settle we read which face landed up on each
 * die and paint the rolled value onto that face (the standard predetermined-
 * outcome trick). So the physics stays 100% real and the card still shows the
 * authoritative numbers the server rolled.
 *
 * Both libraries are loaded on demand from a CDN (the module already pulls a
 * webfont from a CDN, so this is consistent) and cached on `globalThis`. The
 * whole thing is best-effort: if either library can't load (offline / CSP), or
 * WebGL is unavailable, or the user prefers reduced motion, `mount` resolves to
 * null and the caller falls back to the Pixi tumble, then the baked static spans.
 *
 * Lifecycle hygiene matters here because chat re-renders constantly and browsers
 * cap live WebGL contexts: the capability probe runs once (and frees its own
 * context), and `destroy` calls `renderer.forceContextLoss()` + disposes every
 * geometry / material / texture — so repeated rolls never exhaust the context
 * pool (the cause of the old "only the first roll animated" bug).
 */

const CAP = 14;            // max dice simulated; extras stay as static spans
const THREE_URL  = "https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.js";
const CANNON_URL = "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

const MAX_SIM = 3.2;       // hard cap (s) on the live simulation before we force a rest
const CALM_T  = 0.22;      // seconds of low motion that counts as "settled"
const CALM_V  = 0.45;      // per-die speed below which a die is considered calm
const HOLD    = 0.7;       // seconds resting (showing the result) before the fade
const FADE    = 0.45;      // seconds to fade the canvas out, revealing the static spans

const rand = (a, b) => a + Math.random() * (b - a);
const hexCss = s => (/^#?[0-9a-f]{6}$/i.test(String(s ?? "")) ? (String(s)[0] === "#" ? s : "#" + s) : "#ff9a3c");

/* --------------------------- on-demand CDN loaders --------------------------- */

const _libP = {};
function loadLib(key, url) {
  const gk = "__GLCT_" + key;
  if (globalThis[gk]) return Promise.resolve(globalThis[gk]);
  if (_libP[key]) return _libP[key];
  _libP[key] = import(/* webpackIgnore: true */ url)
    .then(m => { const lib = m.default ?? m; globalThis[gk] = lib; return lib; })
    .catch(err => { _libP[key] = null; throw err; });
  return _libP[key];
}
const loadThree  = () => loadLib("THREE", THREE_URL);
const loadCannon = () => loadLib("CANNON", CANNON_URL);

let _webgl = null;
/** Probe WebGL once, releasing the probe's own context so it doesn't leak. */
function hasWebGL() {
  if (_webgl !== null) return _webgl;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    _webgl = !!gl;
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
  } catch { _webgl = false; }
  return _webgl;
}

// BoxGeometry material-group order → outward face normal (local space).
const FACE_NORMALS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
];

export class Dice3D {
  /**
   * Simulate a real-physics roll over a `.glct-cc-dice` host. Resolves to the
   * instance, or null when it can't run (the caller then tries the Pixi tumble).
   * `host.dataset.tumbled` is only set once we actually commit, and cleared again
   * on failure, so a null result leaves the host free for the fallback.
   */
  static async mount(host, { faces = [], size = 6, discard = 0, tint = "#ff9a3c" } = {}) {
    if (!host || host.dataset.tumbled || !faces.length) return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return null;
    if (!hasWebGL()) return null;

    let THREE, CANNON;
    try { [THREE, CANNON] = await Promise.all([loadThree(), loadCannon()]); }
    catch (err) { console.warn("gluniverse-clocks-and-tracker | 3D dice libs failed to load; using fallback", err); return null; }

    // The card may have been removed / already claimed while the libs loaded.
    if (!host.isConnected || host.dataset.tumbled) return null;
    host.dataset.tumbled = "1";
    try { return new Dice3D(THREE, CANNON, host, { faces, size, discard, tint }); }
    catch (err) {
      console.warn("gluniverse-clocks-and-tracker | Dice3D init failed", err);
      delete host.dataset.tumbled;   // let the Pixi fallback take over
      return null;
    }
  }

  constructor(THREE, CANNON, host, { faces, size, discard, tint }) {
    this.THREE = THREE;
    this.CANNON = CANNON;
    this.host = host;
    // Add the class first so the host grows to its taller "arena" height before we
    // measure — the reads below force the reflow that applies it.
    host.classList.add("dx-tumbling");
    const w = Math.max(48, host.clientWidth || 200);
    const h = Math.max(72, host.clientHeight || 104);

    const n = Math.min(faces.length, CAP);
    const tintCol = new THREE.Color(hexCss(tint));

    /* ---- arena dimensions (die edge = 1 world unit) ---- */
    this.arenaHalfW = Math.max(2.4, n * 0.78 + 0.7);
    this.arenaHalfD = 1.25;

    /* ---- renderer ---- */
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    const view = this.renderer.domElement;
    Object.assign(view.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "2" });
    host.appendChild(view);

    /* ---- scene + camera (tilted ortho: see each die's top + a side face) ---- */
    this.scene = new THREE.Scene();
    const aspect = w / h;
    let viewW = this.arenaHalfW * 2 + 1.4;
    let viewH = viewW / aspect;
    const needH = this.arenaHalfD * 2 + 3.0;     // depth band + die height + headroom
    if (viewH < needH) { viewH = needH; viewW = viewH * aspect; }
    this.cam = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, -50, 50);
    this.cam.position.set(0, 7.5, 4.4);
    this.cam.lookAt(0, 0.4, 0);

    /* ---- lights ---- */
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.92));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(2.5, 7, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(tintCol.getHex(), 0.65); rim.position.set(-3, 2.5, -2); this.scene.add(rim);

    /* ---- physics world ---- */
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    this.world.allowSleep = true;
    if (this.world.solver) this.world.solver.iterations = 12;
    const groundMat = new CANNON.Material("g");
    const diceMat = new CANNON.Material("d");
    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMat, diceMat, { friction: 0.35, restitution: 0.3 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.2, restitution: 0.25 }));
    this._buildArena(CANNON, groundMat);

    /* ---- shared assets ---- */
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.shadowTex = this._shadowTexture();

    /* ---- the dice (mesh + body) ---- */
    this.dice = [];
    for (let i = 0; i < n; i++) {
      const val = faces[i];
      const dropped = val <= discard;
      const mesh = this._makeDie(size, dropped, tintCol);
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 1, material: diceMat,
        shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
        allowSleep: true, sleepSpeedLimit: 0.32, sleepTimeLimit: 0.2,
        angularDamping: 0.12, linearDamping: 0.01
      });
      // spread the throw across the arena, drop from above, hurl in with spin
      const sx = rand(-this.arenaHalfW + 0.9, this.arenaHalfW - 0.9);
      const sz = rand(-this.arenaHalfD + 0.55, this.arenaHalfD - 0.55);
      body.position.set(sx, rand(2.7, 4.3), sz);
      body.quaternion.setFromEuler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
      body.velocity.set(-sx * 1.1 + rand(-2.5, 2.5), rand(-2, 0), rand(-2, 2));
      body.angularVelocity.set(rand(-15, 15), rand(-15, 15), rand(-15, 15));
      this.world.addBody(body);

      const shadow = this._shadowMesh();
      this.scene.add(shadow);

      this.dice.push({ mesh, body, shadow, val, dropped, painted: false });
    }

    this._t = 0;
    this._calm = 0;
    this._settled = false;
    this._settleAt = 0;
    this._done = false;
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  /** Floor + four inward-facing walls + a high ceiling, so dice stay in frame. */
  _buildArena(CANNON, groundMat) {
    const W = this.arenaHalfW, D = this.arenaHalfD;
    const add = (pos, euler) => {
      const b = new CANNON.Body({ mass: 0, material: groundMat, shape: new CANNON.Plane() });
      b.quaternion.setFromEuler(euler[0], euler[1], euler[2]);
      b.position.set(pos[0], pos[1], pos[2]);
      this.world.addBody(b);
    };
    add([0, 0, 0], [-Math.PI / 2, 0, 0]);          // floor (normal +Y)
    add([-W, 0, 0], [0, Math.PI / 2, 0]);          // left  (normal +X)
    add([ W, 0, 0], [0, -Math.PI / 2, 0]);         // right (normal -X)
    add([0, 0, -D], [0, 0, 0]);                    // back  (normal +Z)
    add([0, 0,  D], [0, Math.PI, 0]);              // front (normal -Z)
    add([0, 7, 0], [Math.PI / 2, 0, 0]);           // ceiling (normal -Y)
  }

  _makeDie(size, dropped, tintCol) {
    const THREE = this.THREE;
    const base = dropped ? "#2a2230" : "#14141c";
    const ink = dropped ? "#b48b8b" : "#ffffff";
    const ring = dropped ? "rgba(255,120,110,.55)" : "rgba(255,255,255,.16)";
    // start with plausible random pips on every face; the rolled value is painted
    // onto whichever face lands up once the simulation settles.
    const mats = [];
    for (let f = 0; f < 6; f++) {
      const v = 1 + Math.floor(Math.random() * size);
      const tex = new THREE.CanvasTexture(this._face(v, base, ink, ring));
      tex.anisotropy = 4;
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.12 });
      m.emissive = tintCol.clone(); m.emissiveIntensity = dropped ? 0.0 : 0.12;
      mats.push(m);
    }
    return new THREE.Mesh(this.geo, mats);
  }

  /** Repaint the up-facing face of a settled die with its true rolled value. */
  _paintResult(d) {
    const THREE = this.THREE;
    const up = new THREE.Vector3(0, 1, 0);
    let best = -Infinity, top = 2;
    for (let i = 0; i < 6; i++) {
      const nrm = new THREE.Vector3(...FACE_NORMALS[i]).applyQuaternion(d.mesh.quaternion);
      const dot = nrm.dot(up);
      if (dot > best) { best = dot; top = i; }
    }
    const base = d.dropped ? "#2a2230" : "#14141c";
    const ink = d.dropped ? "#b48b8b" : "#ffffff";
    const ring = d.dropped ? "rgba(255,120,110,.7)" : "rgba(255,255,255,.22)";
    const mat = d.mesh.material[top];
    mat.map?.dispose?.();
    const tex = new THREE.CanvasTexture(this._face(d.val, base, ink, ring));
    tex.anisotropy = 4;
    mat.map = tex; mat.needsUpdate = true;
    d.painted = true;
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
    return new this.THREE.CanvasTexture(c);
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

    if (!this._settled) {
      // live rigid-body simulation
      this.world.step(1 / 60, dt, 4);
      let maxSpeed = 0;
      for (const d of this.dice) {
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
        const spd = d.body.velocity.length() + d.body.angularVelocity.length();
        if (spd > maxSpeed) maxSpeed = spd;
        // contact shadow firms up as the die nears the floor
        const closeness = 1 - Math.min(1, (d.body.position.y - 0.5) / 4);
        d.shadow.position.set(d.body.position.x, 0.01, d.body.position.z);
        d.shadow.material.opacity = 0.5 * Math.max(0, closeness);
        d.shadow.scale.setScalar(0.72 + 0.28 * Math.max(0, closeness));
      }
      this._calm = maxSpeed < CALM_V ? this._calm + dt : 0;
      if (this._calm >= CALM_T || this._t >= MAX_SIM) this._settle();
    } else if (this._t <= this._settleAt + HOLD) {
      // resting: nothing to integrate; the result is shown
    } else {
      const fp = (this._t - this._settleAt - HOLD) / FADE;
      const a = Math.max(0, 1 - fp);
      for (const d of this.dice) {
        for (const m of d.mesh.material) { m.transparent = true; m.opacity = a; }
        d.shadow.material.opacity = Math.min(d.shadow.material.opacity, 0.5 * a);
      }
      if (fp >= 1) { this.destroy(); return; }
    }

    this.renderer.render(this.scene, this.cam);
    this._raf = requestAnimationFrame(this._loop);
  }

  /** Freeze the dice where they landed, then paint each one's rolled value up-top. */
  _settle() {
    this._settled = true;
    this._settleAt = this._t;
    for (const d of this.dice) {
      d.body.velocity.setZero(); d.body.angularVelocity.setZero(); d.body.sleep();
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
      this._paintResult(d);
      if (d.dropped) {
        d.mesh.scale.setScalar(0.86);
        for (const m of d.mesh.material) m.emissiveIntensity = 0;
      }
    }
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
      this.renderer?.forceContextLoss?.();   // actually free the WebGL context
      this.renderer?.domElement?.remove();
    } catch { /* ignore */ }
    this.renderer = null; this.scene = null; this.world = null; this.dice = [];
  }
}
