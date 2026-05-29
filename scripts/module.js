/** GLUniverse — Clocks & Tracker : module entry point. */

import { MODULE_ID, SETTINGS, STEPS, HOOKS } from "./const.js";
import { registerSettings } from "./settings.js";
import { applyCalendar } from "./calendar/calendar.js";
import { TimeEngine } from "./engine.js";
import { GlctHud } from "./apps/hud.js";

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); } catch { return fallback; }
}

Hooks.once("init", () => {
  registerSettings();
  // Install the active calendar before GameTime is constructed.
  applyCalendar();
  registerKeybindings();

  // Public API for macros / other modules.
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { TimeEngine, GlctHud, HOOKS };
});

Hooks.once("ready", async () => {
  await GlctHud.open();
  applySceneTint(TimeEngine.getState());
});

Hooks.on("updateWorldTime", () => {
  GlctHud.refreshState();
  applySceneTint(TimeEngine.getState());
});

// Combat awareness: reflect combat state on the HUD (no auto-advance — a combat
// round is far shorter than a stretch, so time only moves when the GM advances).
for (const hook of ["combatStart", "deleteCombat", "combatTurn", "combatRound"]) {
  Hooks.on(hook, () => GlctHud.refreshState());
}

// v13+ scene controls: controls/tools are keyed objects; handlers use onChange.
Hooks.on("getSceneControlButtons", controls => {
  const group = controls.tokens ?? controls.notes ?? Object.values(controls)[0];
  if (!group?.tools) return;
  group.tools["glct-toggle"] = {
    name: "glct-toggle",
    title: "GLCT.keybindings.toggleHud",
    icon: "fa-solid fa-hourglass-half",
    button: true,
    onChange: () => toggleHud()
  };
});

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleHud", {
    name: "GLCT.keybindings.toggleHud",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    onDown: () => { toggleHud(); return true; },
    restricted: false
  });

  game.keybindings.register(MODULE_ID, "advanceStretch", {
    name: "GLCT.keybindings.advanceStretch",
    editable: [{ key: "BracketRight", modifiers: ["Alt"] }],
    onDown: () => { if (game.user.isGM) TimeEngine.advanceStep("stretch"); return true; },
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "openCalendar", {
    name: "GLCT.keybindings.openCalendar",
    editable: [{ key: "KeyC", modifiers: ["Alt"] }],
    onDown: async () => { const { CalendarView } = await import("./apps/calendar-view.js"); CalendarView.show(); return true; },
    restricted: false
  });
}

async function toggleHud() {
  if (!GlctHud.instance?.rendered) { await GlctHud.open(); return; }
  await GlctHud.instance.close();
}

/** Subtle full-board tint matching the current watch (opt-in). */
function applySceneTint(state) {
  const enabled = setting(SETTINGS.sceneTint, false);
  let overlay = document.getElementById("glct-scene-tint");
  if (!enabled) { overlay?.remove(); return; }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "glct-scene-tint";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", pointerEvents: "none", zIndex: "1",
      mixBlendMode: "soft-light", transition: "background 1.4s ease", opacity: "0.5"
    });
    (document.getElementById("board") ?? document.body).after(overlay);
  }
  overlay.style.background = `radial-gradient(120% 90% at 50% 0%, ${state.watch.glow}, transparent 70%)`;
}
