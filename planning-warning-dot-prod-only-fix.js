// planning-warning-dot-prod-only-fix.js
// Correctielaag voor rood bolletje:
// alleen tonen bij Prod./Prod.+CNC: sectie-uren > 0 en gepland = 0.
// WVB en Montage mogen dit bolletje nooit triggeren.

function parseNlNumber(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function getProdCncFromHoursCell(projectRow){
  const hoursCell = projectRow.querySelector("td.hourscol, .hourscol");
  if (!hoursCell) return { required: 0, planned: 0 };

  const text = String(hoursCell.innerText || hoursCell.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  // Accepteer o.a.:
  // Prod.+CNC 8 0
  // Prod + CNC 8 0
  // Prod. + CNC 8 0
  // Productie 8 0
  const match = text.match(/(?:^|\s)(?:prod(?:uctie)?\s*\.?\s*(?:\+\s*cnc)?|prod\s*\+\s*cnc)\D*(-?\d+(?:[,.]\d+)?)\D+(-?\d+(?:[,.]\d+)?)/i);

  if (!match) return { required: 0, planned: 0 };

  return {
    required: parseNlNumber(match[1]),
    planned: parseNlNumber(match[2])
  };
}

function applyProdOnlyWarningDots(){
  document.querySelectorAll("tr.project-row:not(.concept-status2-row)").forEach(projectRow => {
    const nameLine = projectRow.querySelector(".projline2");
    if (!nameLine) return;

    const prod = getProdCncFromHoursCell(projectRow);
    const shouldShow = prod.required > 0 && prod.planned <= 0.0001;
    const existing = nameLine.querySelector(".project-prod-hours-warning-dot");

    if (shouldShow && !existing) {
      const dot = document.createElement("span");
      dot.className = "project-prod-hours-warning-dot";
      dot.title = "Productie-uren in secties aanwezig, maar nog 0 uur productie gepland";
      dot.setAttribute("aria-label", "Geen productie gepland");
      nameLine.prepend(dot);
    }

    if (!shouldShow && existing) existing.remove();
  });
}

let prodOnlyPending = false;
function scheduleProdOnlyWarningDots(){
  if (prodOnlyPending) return;
  prodOnlyPending = true;
  requestAnimationFrame(() => {
    prodOnlyPending = false;
    applyProdOnlyWarningDots();
  });
}

window.addEventListener("DOMContentLoaded", scheduleProdOnlyWarningDots);
window.addEventListener("load", scheduleProdOnlyWarningDots);

const prodOnlyObserver = new MutationObserver(scheduleProdOnlyWarningDots);
prodOnlyObserver.observe(document.body, { childList: true, subtree: true });
