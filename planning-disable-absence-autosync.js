import { makeSupabaseClient } from "./auth.js";

// planning-disable-absence-autosync.js
// Beveiliging: beschikbaarheid wijzigen mag géén verlofregels kopiëren naar andere medewerkers.
// De oude planning.js bevat nog een automatische sync. Deze guard verwijdert alleen verlofregels
// die tijdens het opslaan van beschikbaarheid nieuw zijn aangemaakt.

const sbAbsenceGuard = makeSupabaseClient();
let beforeAbsenceIds = null;
let guardActiveUntil = 0;
let cleanupTimer = null;

async function getAbsenceIds(){
  const { data, error } = await sbAbsenceGuard
    .from("employee_absences")
    .select("id")
    .limit(200000);

  if (error) {
    console.warn("Absence guard: verlofregels lezen mislukt", error.message || error);
    return null;
  }

  return new Set((data || []).map(r => String(r.id)).filter(Boolean));
}

async function cleanupNewAbsences(){
  if (!beforeAbsenceIds || Date.now() > guardActiveUntil) return;

  const afterIds = await getAbsenceIds();
  if (!afterIds) return;

  const newIds = [];
  for (const id of afterIds) {
    if (!beforeAbsenceIds.has(id)) newIds.push(id);
  }

  if (!newIds.length) return;

  const { error } = await sbAbsenceGuard
    .from("employee_absences")
    .delete()
    .in("id", newIds);

  if (error) {
    console.warn("Absence guard: automatisch gekopieerd verlof verwijderen mislukt", error.message || error);
  } else {
    console.warn("Absence guard: automatisch gekopieerd verlof verwijderd", newIds.length);
  }
}

async function startAbsenceGuard(){
  beforeAbsenceIds = await getAbsenceIds();
  guardActiveUntil = Date.now() + 15000;

  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(cleanupNewAbsences, 1800);
  window.setTimeout(cleanupNewAbsences, 4000);
  window.setTimeout(cleanupNewAbsences, 8000);
  window.setTimeout(() => {
    beforeAbsenceIds = null;
    guardActiveUntil = 0;
  }, 16000);
}

// Capture-phase: dit draait vóór de bestaande settings-save handler uit planning.js.
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("#btnSettingsSave, #settingsEmpApplyEven, #settingsEmpApplyOdd, #settingsEmpApplyAll");
  if (!btn) return;

  const modal = document.getElementById("settingsModal");
  if (!modal || modal.hidden) return;

  startAbsenceGuard();
}, true);
