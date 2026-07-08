// planning-refresh-cap-modal-after-absence.js
// Als je vanuit het beschikbaarheidsmodal een verlofregel opslaat/verwijdert,
// wordt het beschikbaarheidsmodal daarna automatisch opnieuw opgebouwd.

let lastCapacityCellKey = null;
let refreshTimer = null;

function isVisible(el){
  if (!el || !(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
}

function textOf(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function rememberCapacityCell(cell){
  if (!cell) return;
  const empId = String(cell.dataset.empId || "").trim();
  const workDate = String(cell.dataset.workDate || "").trim();
  if (!empId || !workDate) return;
  lastCapacityCellKey = { empId, workDate };
}

function isAbsenceEditModal(modal){
  if (!modal || !isVisible(modal)) return false;
  const txt = textOf(modal);
  return /\bVerlof\b/i.test(txt) && /\bUren\b/i.test(txt) && (/Hele dag/i.test(txt) || /Verwijderen/i.test(txt));
}

function clickedAbsenceSaveOrDelete(target){
  const btn = target.closest("button");
  if (!btn) return false;

  const btnText = textOf(btn);
  if (!/^(Opslaan|Verwijderen)$/i.test(btnText)) return false;

  // Niet reageren op instellingen/capaciteit opslaan.
  if (btn.id === "btnSettingsSave" || btn.id === "capSave") return false;
  if (btn.closest("#settingsModal")) return false;

  const modal = btn.closest(".modal, [role='dialog'], .modal-card, .modal-backdrop") ||
    Array.from(document.querySelectorAll(".modal, [role='dialog'], .modal-card, .modal-backdrop")).find(isAbsenceEditModal);

  return isAbsenceEditModal(modal);
}

function findOriginalCapacityCell(){
  if (!lastCapacityCellKey) return null;
  const { empId, workDate } = lastCapacityCellKey;
  return document.querySelector(`td.cap-cell-click[data-emp-id="${CSS.escape(empId)}"][data-work-date="${CSS.escape(workDate)}"]`);
}

function refreshAvailabilityModal(){
  const cell = findOriginalCapacityCell();
  if (!cell) return;

  // Zorg dat planning.js niet weer het aparte verlofmodal opent.
  const hadAbsence = cell.classList.contains("cap-absence");
  if (hadAbsence) cell.classList.remove("cap-absence");

  cell.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window
  }));

  if (hadAbsence) {
    window.setTimeout(() => cell.classList.add("cap-absence"), 0);
  }
}

function scheduleRefreshAfterAbsenceChange(){
  window.clearTimeout(refreshTimer);

  // meerdere pogingen omdat planning.js eerst database + hoofdplanning refresht
  const delays = [400, 900, 1600, 2600];
  for (const delay of delays) {
    window.setTimeout(refreshAvailabilityModal, delay);
  }
}

document.addEventListener("click", (ev) => {
  const capCell = ev.target.closest("td.cap-cell-click[data-emp-id][data-work-date]");
  if (capCell) rememberCapacityCell(capCell);

  if (clickedAbsenceSaveOrDelete(ev.target)) {
    scheduleRefreshAfterAbsenceChange();
  }
}, true);
