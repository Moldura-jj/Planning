// planning-warning-dot-prod-only-fix.js
// Correctielaag voor rood bolletje:
// alleen tonen bij Prod./Prod.+CNC: sectie-uren > 0 en gepland = 0.
// WVB en Montage mogen dit bolletje nooit triggeren.
// Gebruikt een eigen class, zodat oude warning-logica dit bolletje niet kan verwijderen.

function parseNlNumber(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ensureProdOnlyDotStyle(){
  if (document.getElementById("prodOnlyWarningDotStyle")) return;
  const style = document.createElement("style");
  style.id = "prodOnlyWarningDotStyle";
  style.textContent = `
    .project-prod-only-warning-dot{
      display:inline-block;
      width:9px;
      height:9px;
      margin-right:6px;
      border-radius:999px;
      background:#ef4444;
      box-shadow:0 0 0 2px rgba(239,68,68,.18);
      vertical-align:middle;
      transform:translateY(-1px);
    }
  `;
  document.head.appendChild(style);
}

function getProdCncFromHoursCell(projectRow){
  const hoursCell = projectRow.querySelector("td.hourscol, .hourscol");
  if (!hoursCell) return { required: 0, planned: 0 };

  const text = String(hoursCell.innerText || hoursCell.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  // Accepteer o.a.:
  // Wvb 0 | 0 Prod.+CNC 8 | 0 Mont.+Reis 0 | 0
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

function findNameLine(projectRow){
  return projectRow.querySelector(".projline2") ||
    projectRow.querySelector(".projline1") ||
    projectRow.querySelector(".projtext") ||
    projectRow.querySelector("td.project-cell, td.rowhdr");
}

function applyProdOnlyWarningDots(){
  ensureProdOnlyDotStyle();

  document.querySelectorAll("tr.project-row:not(.concept-status2-row)").forEach(projectRow => {
    const nameLine = findNameLine(projectRow);
    if (!nameLine) return;

    const prod = getProdCncFromHoursCell(projectRow);
    const shouldShow = prod.required > 0 && prod.planned <= 0.0001;
    const existing = nameLine.querySelector(".project-prod-only-warning-dot");

    if (shouldShow && !existing) {
      const dot = document.createElement("span");
      dot.className = "project-prod-only-warning-dot";
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
setTimeout(scheduleProdOnlyWarningDots, 500);
setTimeout(scheduleProdOnlyWarningDots, 1500);
setTimeout(scheduleProdOnlyWarningDots, 3000);

const prodOnlyObserver = new MutationObserver(scheduleProdOnlyWarningDots);
prodOnlyObserver.observe(document.body, { childList: true, subtree: true });
