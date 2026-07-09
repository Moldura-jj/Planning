// planning-capacity-sticky-bottom.js
// Zet het capaciteit-/beschikbaarheidblok vast onderaan het scherm.
// De rijen blijven onderdeel van dezelfde planningtabel, dus horizontaal scrollen blijft gelijk lopen.

let capacityStickyTimer = null;
let capacityStickyRunning = false;

function stickyText(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function isHiddenRow(row){
  if (!row) return true;
  if (row.classList.contains("hidden")) return true;
  const cs = window.getComputedStyle(row);
  return cs.display === "none" || cs.visibility === "hidden";
}

function isCapacityHeaderRow(row){
  const txt = stickyText(row).toLowerCase();
  return txt === "capaciteit";
}

function isNewOrderCapacityRow(row){
  const txt = stickyText(row).toLowerCase();
  return txt.includes("capaciteit met nieuwe order") || txt.includes("nieuwe order");
}

function ensureCapacityStickyStyle(){
  document.getElementById("capacityStickyBottomStyle")?.remove();
  const style = document.createElement("style");
  style.id = "capacityStickyBottomStyle";
  style.textContent = `
    .planner-table tr.capacity-sticky-row > th,
    .planner-table tr.capacity-sticky-row > td{
      position:sticky !important;
      bottom:var(--cap-sticky-bottom, 0px) !important;
      z-index:120 !important;
      background:#fff !important;
      box-shadow:0 -1px 0 #cbd5e1, 0 1px 0 #e5e7eb !important;
    }

    .planner-table tr.capacity-sticky-row.capacity-sticky-header > th,
    .planner-table tr.capacity-sticky-row.capacity-sticky-header > td{
      background:#f8fafc !important;
      z-index:123 !important;
      font-weight:800 !important;
      box-shadow:0 -2px 8px rgba(15,23,42,.10), 0 -1px 0 #94a3b8 !important;
    }

    .planner-table tr.capacity-sticky-row > .sticky-left,
    .planner-table tr.capacity-sticky-row > .rowhdr.sticky-left{
      left:0 !important;
      z-index:130 !important;
      background:#fff !important;
    }

    .planner-table tr.capacity-sticky-row.capacity-sticky-header > .sticky-left,
    .planner-table tr.capacity-sticky-row.capacity-sticky-header > .rowhdr.sticky-left{
      background:#f8fafc !important;
      z-index:133 !important;
    }

    .planner-table tr.capacity-sticky-row > .sticky-left2,
    .planner-table tr.capacity-sticky-row > .hourscol.sticky-left2{
      left:var(--left-w, 380px) !important;
      z-index:131 !important;
      background:#fff !important;
    }

    .planner-table tr.capacity-sticky-row.capacity-sticky-header > .sticky-left2,
    .planner-table tr.capacity-sticky-row.capacity-sticky-header > .hourscol.sticky-left2{
      background:#f8fafc !important;
      z-index:134 !important;
    }

    .planner-table tr.capacity-sticky-row .wknd{
      background:#dbeafe !important;
    }

    .planner-table tr.capacity-sticky-row .balance-cell.pos{ background:#bbf7d0 !important; }
    .planner-table tr.capacity-sticky-row .balance-cell.zero{ background:#fde68a !important; }
    .planner-table tr.capacity-sticky-row .balance-cell.neg{ background:#fecaca !important; }
  `;
  document.head.appendChild(style);
}

function collectCapacityRows(table){
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const startIndex = rows.findIndex(isCapacityHeaderRow);
  if (startIndex < 0) return [];

  const out = [];
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (i > startIndex && isNewOrderCapacityRow(row)) break;
    out.push(row);
  }
  return out;
}

function applyCapacityStickyBottom(){
  if (capacityStickyRunning) return;
  capacityStickyRunning = true;
  try {
    ensureCapacityStickyStyle();

    document.querySelectorAll("tr.capacity-sticky-row").forEach(row => {
      row.classList.remove("capacity-sticky-row", "capacity-sticky-header");
      row.style.removeProperty("--cap-sticky-bottom");
    });

    const table = document.querySelector(".planner-table");
    if (!table) return;

    const rows = collectCapacityRows(table);
    if (!rows.length) return;

    const visibleRows = rows.filter(row => !isHiddenRow(row));
    let bottom = 0;

    for (let i = visibleRows.length - 1; i >= 0; i--) {
      const row = visibleRows[i];
      const h = Math.ceil(row.getBoundingClientRect().height || row.offsetHeight || 20);
      row.classList.add("capacity-sticky-row");
      row.style.setProperty("--cap-sticky-bottom", `${bottom}px`);
      if (isCapacityHeaderRow(row) || stickyText(row).toLowerCase() === "werkvoorbereiding") {
        row.classList.add("capacity-sticky-header");
      }
      bottom += h;
    }

    document.documentElement.style.setProperty("--capacity-sticky-height", `${bottom}px`);
  } finally {
    capacityStickyRunning = false;
  }
}

function scheduleCapacitySticky(delay = 250){
  window.clearTimeout(capacityStickyTimer);
  capacityStickyTimer = window.setTimeout(applyCapacityStickyBottom, delay);
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleCapacitySticky(700);
  scheduleCapacitySticky(1800);
});
window.addEventListener("load", () => scheduleCapacitySticky(700));
window.addEventListener("resize", () => scheduleCapacitySticky(150));
window.addEventListener("planning:project-include-changed", () => scheduleCapacitySticky(250));
window.addEventListener("planning:all-time-hours-updated", () => scheduleCapacitySticky(250));

// Na expand/collapse van capaciteit opnieuw offsets berekenen.
document.addEventListener("click", (ev) => {
  if (ev.target.closest(".cap-expander, #btnPrev, #btnNext, #btnSettingsSave, #amSave")) {
    scheduleCapacitySticky(500);
    scheduleCapacitySticky(1200);
  }
}, true);

const capacityStickyObserver = new MutationObserver(() => scheduleCapacitySticky(700));
capacityStickyObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class", "style"] });
