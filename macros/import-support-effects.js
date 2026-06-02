/**
 * GLCT — Import Support Effects
 * =============================================================================
 * One-click setup for the shipped support passives (Razor · Tourniquet).
 *
 * HOW TO USE
 *   1. In Foundry, open the Macros bar → Create Macro → Type: "Script".
 *   2. Paste this whole file into the command box, save, and run it (GM only).
 *
 * WHAT IT DOES
 *   • Reads modules/gluniverse-clocks-and-tracker/data/support-effects.json
 *   • Creates the two PF2e Effect items in an Items folder "GLCT · Support Effects"
 *     (re-running updates the existing ones in place instead of duplicating).
 *   • Links each Effect to its support (matched by the passive ability's name) by
 *     setting that support's `passiveEffectUuid`, so the Comms-Coin HUD auto-applies
 *     it to the party — with the icon swapped to the support's portrait.
 *
 * Safe to re-run. Non-PF2e worlds: the items still import, but the rule elements
 * only do anything on PF2e.
 * =============================================================================
 */
(async () => {
  const MODULE_ID = "gluniverse-clocks-and-tracker";
  const FOLDER = "GLCT · Support Effects";

  if (!game.user.isGM) { ui.notifications.warn("Only a GM can import the support effects."); return; }

  const api = game.modules.get(MODULE_ID)?.api;
  const SupportStore = api?.SupportStore;
  if (!SupportStore) { ui.notifications.error(`${MODULE_ID} is not active — enable the module first.`); return; }

  // 1) Load the effect definitions shipped with the module.
  let defs;
  try {
    const res = await fetch(`modules/${MODULE_ID}/data/support-effects.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    defs = (await res.json())?.effects;
  } catch (err) {
    console.error(err);
    ui.notifications.error("Couldn't read data/support-effects.json — see console (F12).");
    return;
  }
  if (!Array.isArray(defs) || !defs.length) { ui.notifications.error("No effects found in the data file."); return; }

  // 2) Ensure the destination folder exists.
  let folder = game.folders.find(f => f.type === "Item" && f.name === FOLDER);
  if (!folder) folder = await Folder.create({ name: FOLDER, type: "Item", color: "#8fc7ff" });

  // 3) Create or update each Effect item.
  const created = [];
  for (const def of defs) {
    const data = foundry.utils.deepClone(def);
    data.folder = folder.id;
    const existing = folder.contents.find(i => i.name === data.name || i.system?.slug === data.system?.slug);
    let item;
    if (existing) { await existing.update(data); item = existing; }
    else { item = await Item.create(data); }
    if (item) created.push(item);
  }
  if (!created.length) { ui.notifications.error("No effect items were created."); return; }

  // 4) Link each effect to the support whose passive ability shares its name.
  const roster = SupportStore.data?.roster ?? [];
  const links = [];
  for (const item of created) {
    const match = roster.find(s => (s.abilities?.passive?.name || "").trim() === item.name.trim());
    if (match) {
      await SupportStore.updateSupport(match.id, { passiveEffectUuid: item.uuid });
      links.push(`${match.name} → ${item.name}`);
    }
  }

  // 5) Report.
  const lines = created.map(i => `<li><b>${i.name}</b> — <code>${i.uuid}</code></li>`).join("");
  const linkBlock = links.length
    ? `<p style="margin:.4em 0 0"><b>Linked:</b> ${links.join(" · ")}</p>`
    : `<p style="margin:.4em 0 0;color:#c98">No roster supports matched by passive name — open the support editor and paste the UUID above into each support's <i>Passive Effect</i> field.</p>`;
  ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    content: `<div class="glct-support-msg"><h3 style="margin:.2em 0">GLCT · Support effects imported</h3>
      <ul style="margin:.3em 0 0;padding-left:1.1em">${lines}</ul>${linkBlock}
      <p style="margin:.5em 0 0;font-size:.9em;opacity:.8">Items are in the "${FOLDER}" folder. Re-running updates them in place.</p></div>`
  });
  ui.notifications.info(`Imported ${created.length} support effect(s)${links.length ? `, linked ${links.length}` : ""}.`);
})();
