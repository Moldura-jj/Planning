// planning-warning-dot.js
// Toont een rood bolletje bij projecten met wel een leverdatum, maar zonder ingevulde productie-uren.

function parseNlNumber(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function hasFilledDeliveryDate(projectRow){
  const summary = projectRow.querySelector(".project-date-summary");
  const deliveryText = String(summary?.querySelector("span")?.textContent || "").trim();
  if (!deliveryText) return false;

  const value = deliveryText.replace(/^Lever\s*/i, "").trim();
  return !!value && value !== "-";
}

function getRequiredProductionHours(projectRow){
  const rows = projectRow.querySelectorAll(".mini-hours .mh-row");
  for (const row of rows) {
    const label = String(row.querySelector(".mh-l")?.textContent || "").trim().toLowerCase();
    if (!label.includes("prod")) continue;
    return parseNlNumber(row.querySelector(".mh-v")?.textContent || "");
  }
  return 0;
}

function ensureStyle(){
  if (document.getElementById("planningWarningDotStyle")) return;

  const style = document.createElement("style");
  style.id = "planningWarningDotStyle";
  style.textContent = `
    .project-prod-hours-warning-dot{
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

function applyProjectWarningDots(){
  ensureStyle();

  document.querySelectorAll("tr.project-row").forEach((projectRow) => {
    const nameLine = projectRow.querySelector(".projline2");
    if (!nameLine) return;

    const shouldShow = hasFilledDeliveryDate(projectRow) && getRequiredProductionHours(projectRow) <= 0;
    const existing = nameLine.querySelector(".project-prod-hours-warning-dot");

    if (shouldShow && !existing) {
      const dot = document.createElement("span");
      dot.className = "project-prod-hours-warning-dot";
      dot.title = "Leverdatum ingevuld, maar geen productie-uren ingevuld";
      dot.setAttribute("aria-label", "Geen productie-uren ingevuld");
      nameLine.prepend(dot);
    }

    if (!shouldShow && existing) existing.remove();
  });
}

let pending = false;
function scheduleApply(){
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    applyProjectWarningDots();
  });
}

window.addEventListener("DOMContentLoaded", scheduleApply);
window.addEventListener("load", scheduleApply);

const observer = new MutationObserver(scheduleApply);
observer.observe(document.body, { childList: true, subtree: true });
