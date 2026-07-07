// planning-concept-bottom-fix.js
// Zet het status-2 conceptblok helemaal onderaan en ruim de oude placeholder 'Nieuwe order' op.

let conceptBottomFixPending = false;
let conceptBottomFixRunning = false;

function rowText(row){
  return String(row?.textContent || "").replace(/\s+/g, " ").trim();
}

function removeLegacyNewOrderRows(tbody){
  if (!tbody) return;

  Array.from(tbody.querySelectorAll("tr")).forEach((row) => {
    const txt = rowText(row).toLowerCase();

    const isNewOrderPlaceholder = txt.includes("nieuwe order") && txt.includes("koppelen");
    const isOldCapacityHeader = txt === "capaciteit met nieuwe order";

    if (isNewOrderPlaceholder || isOldCapacityHeader) {
      row.remove();
    }
  });
}

function moveConceptBlockToBottom(){
  if (conceptBottomFixRunning) return;

  const tbody = document.querySelector(".planner-table tbody");
  if (!tbody) return;

  conceptBottomFixRunning = true;
  try {
    removeLegacyNewOrderRows(tbody);

    const conceptRows = Array.from(tbody.querySelectorAll("tr.concept-status2-row"));
    if (!conceptRows.length) return;

    const fragment = document.createDocumentFragment();
    conceptRows.forEach((row) => fragment.appendChild(row));
    tbody.appendChild(fragment);
  } finally {
    conceptBottomFixRunning = false;
  }
}

function scheduleConceptBottomFix(){
  if (conceptBottomFixPending || conceptBottomFixRunning) return;
  conceptBottomFixPending = true;

  requestAnimationFrame(() => {
    conceptBottomFixPending = false;
    moveConceptBlockToBottom();
  });
}

window.addEventListener("DOMContentLoaded", scheduleConceptBottomFix);
window.addEventListener("load", scheduleConceptBottomFix);

const conceptBottomObserver = new MutationObserver(scheduleConceptBottomFix);
conceptBottomObserver.observe(document.body, { childList: true, subtree: true });
