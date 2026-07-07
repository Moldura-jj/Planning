// planning-warning-dot.js
// Toont een rood bolletje bij projecten met wel een leverdatum, maar zonder ingevulde productie-uren.
// Bevat ook een sticky-kolom fix zodat planningcellen niet door de projectregels heen zichtbaar zijn bij horizontaal scrollen.

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

    .planner-scroll,
    .planner-scroll-sticky,
    .planner-table{
      isolation:isolate;
    }

    /* Kalendercellen bewust laag houden. */
    .planner-table tbody td.plan-cell,
    .planner-table tbody td.cell:not(.sticky-left):not(.sticky-left2):not(.hourscol){
      position:relative !important;
      z-index:1 !important;
    }

    .planner-table tbody td.plan-cell .bar,
    .planner-table tbody td.plan-cell .plan-stack,
    .planner-table tbody td.plan-cell .marker-row{
      position:relative;
      z-index:1;
    }

    /* Linker projectkolom: echte ondoorzichtige maskerlaag boven de planning. */
    .planner-table tbody td.rowhdr.sticky-left,
    .planner-table tbody td.project-cell.sticky-left,
    .planner-table tbody td.section-cell.sticky-left{
      position:sticky !important;
      left:0 !important;
      z-index:1000 !important;
      isolation:isolate !important;
      background:#fff !important;
      background-color:#fff !important;
      background-image:none !important;
      background-clip:border-box !important;
      overflow:hidden !important;
    }

    .planner-table tbody td.rowhdr.sticky-left::before,
    .planner-table tbody td.project-cell.sticky-left::before,
    .planner-table tbody td.section-cell.sticky-left::before{
      content:"" !important;
      position:absolute !important;
      inset:-4px !important;
      background:inherit !important;
      z-index:0 !important;
      pointer-events:none !important;
    }

    .planner-table tbody td.rowhdr.sticky-left > *,
    .planner-table tbody td.project-cell.sticky-left > *,
    .planner-table tbody td.section-cell.sticky-left > *{
      position:relative !important;
      z-index:2 !important;
    }

    /* Urenkolom ook als masker, maar zonder zwarte rechterlijn. */
    .planner-table tbody td.hourscol.sticky-left2,
    .planner-table tbody td.cell.hourscol.sticky-left2{
      position:sticky !important;
      left:380px !important;
      z-index:990 !important;
      isolation:isolate !important;
      background:#fff !important;
      background-color:#fff !important;
      background-image:none !important;
      background-clip:border-box !important;
      overflow:hidden !important;
      border-left:1px solid #cbd5e1 !important;
      border-right:1px solid #e6e8ef !important;
      box-shadow:none !important;
    }

    .planner-table tbody td.hourscol.sticky-left2::before,
    .planner-table tbody td.cell.hourscol.sticky-left2::before{
      content:"" !important;
      position:absolute !important;
      inset:-4px !important;
      background:inherit !important;
      z-index:0 !important;
      pointer-events:none !important;
    }

    .planner-table tbody td.hourscol.sticky-left2 > *,
    .planner-table tbody td.cell.hourscol.sticky-left2 > *{
      position:relative !important;
      z-index:2 !important;
    }

    /* Oude zwarte lijn na de urenkolom uit styles.css uitschakelen. */
    .planner-table td.hourscol.sticky-left2::after,
    .planner-table th.hourscol.sticky-left2::after{
      content:none !important;
      display:none !important;
      background:transparent !important;
      width:0 !important;
    }

    .planner-table .hourscol{
      border-left:1px solid #cbd5e1 !important;
      border-right:1px solid #e6e8ef !important;
      box-shadow:none !important;
    }

    /* Zebra/open achtergronden moeten ook ondoorzichtig blijven. */
    .planner-table tbody tr.zebra > td.rowhdr.sticky-left,
    .planner-table tbody tr.zebra > td.project-cell.sticky-left,
    .planner-table tbody tr.zebra > td.section-cell.sticky-left,
    .planner-table tbody tr.zebra > td.hourscol.sticky-left2{
      background:#f5f6f8 !important;
      background-color:#f5f6f8 !important;
    }

    .planner-table tbody tr.project-row.is-open > td.rowhdr.sticky-left,
    .planner-table tbody tr.project-row.is-open > td.hourscol.sticky-left2{
      background:#eef4ff !important;
      background-color:#eef4ff !important;
    }

    /* Projectscheidingslijnen over de volledige breedte van links tot alle dagkolommen. */
    .planner-table tbody tr.project-row > td,
    .planner-table tbody tr.project-row > th{
      border-top:2px solid #626262 !important;
      border-bottom:2px solid #626262 !important;
      box-shadow:none !important;
    }

    .planner-table tbody tr.project-topline > td,
    .planner-table tbody tr.project-topline > th{
      border-top:2px solid #626262 !important;
    }

    .planner-table tbody tr.project-bottomline > td,
    .planner-table tbody tr.project-bottomline > th{
      border-bottom:2px solid #626262 !important;
    }

    /* Header blijft boven body. */
    .planner-table thead th.sticky-left,
    .planner-table thead th.sticky-left2,
    .planner-table thead th.sticky-top,
    .planner-table thead th.sticky-top2,
    .planner-table thead th.sticky-top3{
      z-index:2000 !important;
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
