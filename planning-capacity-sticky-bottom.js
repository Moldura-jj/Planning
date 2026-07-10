// planning-capacity-sticky-bottom.js
// Zet de originele capaciteit-/beschikbaarheidsrijen sticky onderaan.
// V11: geen clone meer; de bestaande tabelindeling blijft exact behouden.

let capacityStickyTimer = null;
let capacityStickyBootTries = 0;
let capacityStickyWatchdog = null;
let capacityStickyRunning = false;

function stickyText(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function getPlannerTable(){
  return document.querySelector("#plannerGrid table") ||
    document.querySelector(".planning-grid table") ||
    document.querySelector("#plannerScroll table") ||
    Array.from(document.querySelectorAll("table")).find(t => !t.closest("#capacityStickyBottomClone"));
}

function isHiddenRow(row){
  if (!row) return true;
  if (row.classList.contains("hidden")) return true;
  const cs = window.getComputedStyle(row);
  return cs.display === "none" || cs.visibility === "hidden";
}

function isCapacityHeaderRow(row){
  return stickyText(row).toLowerCase() === "capaciteit";
}

function isNewOrderCapacityRow(row){
  const txt = stickyText(row).toLowerCase();
  return txt.includes("capaciteit met nieuwe order") || txt.includes("nieuwe order");
}

function isMeaninglessSpacerRow(row){
  if (!row) return true;
  const txt = stickyText(row);
  if (txt) return false;
  const cells = Array.from(row.children || []);
  return cells.length && cells.every(c => !stickyText(c));
}

function collectCapacityRows(table){
  const rows = Array.from(table?.querySelectorAll("tbody tr") || []);
  const startIndex = rows.findIndex(isCapacityHeaderRow);
  if (startIndex < 0) return [];

  const out = [];
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (i > startIndex && isNewOrderCapacityRow(row)) break;
    if (isHiddenRow(row)) continue;
    if (i > startIndex && isMeaninglessSpacerRow(row)) continue;
    out.push(row);
  }
  return out;
}

function ensureCapacityStickyStyle(){
  document.getElementById("capacityStickyBottomStyle")?.remove();
  const style = document.createElement("style");
  style.id = "capacityStickyBottomStyle";
  style.textContent = `
    #capacityStickyBottomClone{ display:none !important; }
    body.has-capacity-sticky-clone{ padding-bottom:0 !important; }

    tr.capacity-sticky-row > th,
    tr.capacity-sticky-row > td{
      position:sticky !important;
      bottom:var(--capacity-sticky-bottom, 0px) !important;
      z-index:300 !important;
      box-shadow:0 -1px 0 #cbd5e1, 0 1px 0 #e5e7eb !important;
    }

    tr.capacity-sticky-row.capacity-sticky-title > th,
    tr.capacity-sticky-row.capacity-sticky-title > td,
    tr.capacity-sticky-row.capacity-sticky-section > th,
    tr.capacity-sticky-row.capacity-sticky-section > td{
      z-index:320 !important;
      background:#f8fafc !important;
      font-weight:400 !important;
    }

    tr.capacity-sticky-row > .sticky-left,
    tr.capacity-sticky-row > td:first-child,
    tr.capacity-sticky-row > th:first-child{
      z-index:340 !important;
    }

    tr.capacity-sticky-row > .sticky-left2,
    tr.capacity-sticky-row > td:nth-child(2),
    tr.capacity-sticky-row > th:nth-child(2){
      z-index:341 !important;
    }

    tr.capacity-sticky-row.capacity-sticky-title > .sticky-left,
    tr.capacity-sticky-row.capacity-sticky-title > td:first-child,
    tr.capacity-sticky-row.capacity-sticky-section > .sticky-left,
    tr.capacity-sticky-row.capacity-sticky-section > td:first-child{
      z-index:350 !important;
      background:#f8fafc !important;
    }

    tr.capacity-sticky-row .balance-cell.pos{ background:#bbf7d0 !important; }
    tr.capacity-sticky-row .balance-cell.zero{ background:#fde68a !important; }
    tr.capacity-sticky-row .balance-cell.neg{ background:#fecaca !important; }
  `;
  document.head.appendChild(style);
}

function clearCapacityStickyRows(){
  document.querySelectorAll("tr.capacity-sticky-row").forEach(row => {
    row.classList.remove("capacity-sticky-row", "capacity-sticky-title", "capacity-sticky-section");
    row.style.removeProperty("--capacity-sticky-bottom");
  });
  document.getElementById("capacityStickyBottomClone")?.remove();
  document.body.classList.remove("has-capacity-sticky-clone");
  document.documentElement.style.removeProperty("--capacity-sticky-height");
}

function rowHeight(row){
  return Math.ceil(row?.getBoundingClientRect?.().height || row?.offsetHeight || 20);
}

function applyCapacityStickyBottom(){
  if (capacityStickyRunning) return true;
  capacityStickyRunning = true;
  try {
    ensureCapacityStickyStyle();
    clearCapacityStickyRows();

    const table = getPlannerTable();
    if (!table) return false;

    const rows = collectCapacityRows(table);
    if (!rows.length) return false;

    let bottom = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const txt = stickyText(row).toLowerCase();
      row.classList.add("capacity-sticky-row");
      if (txt === "capaciteit") row.classList.add("capacity-sticky-title");
      if (txt === "werkvoorbereiding") row.classList.add("capacity-sticky-section");
      row.style.setProperty("--capacity-sticky-bottom", `${bottom}px`);
      bottom += rowHeight(row);
    }

    return true;
  } finally {
    capacityStickyRunning = false;
  }
}

function scheduleCapacitySticky(delay = 250){
  window.clearTimeout(capacityStickyTimer);
  capacityStickyTimer = window.setTimeout(applyCapacityStickyBottom, delay);
}

function startCapacityStickyBootLoop(){
  capacityStickyBootTries = 0;
  const run = () => {
    capacityStickyBootTries += 1;
    const ok = applyCapacityStickyBottom();
    if (!ok && capacityStickyBootTries < 40) window.setTimeout(run, 300);
  };
  run();

  window.clearInterval(capacityStickyWatchdog);
  capacityStickyWatchdog = window.setInterval(() => applyCapacityStickyBottom(), 5000);
}

window.addEventListener("DOMContentLoaded", startCapacityStickyBootLoop);
window.addEventListener("load", startCapacityStickyBootLoop);
window.addEventListener("resize", () => scheduleCapacitySticky(150));
window.addEventListener("planning:project-include-changed", () => scheduleCapacitySticky(250));
window.addEventListener("planning:all-time-hours-updated", () => scheduleCapacitySticky(250));

document.addEventListener("click", (ev) => {
  if (ev.target.closest(".cap-expander, #btnPrev, #btnNext, #btnSettingsSave, #amSave")) {
    scheduleCapacitySticky(500);
    scheduleCapacitySticky(1200);
  }
}, true);

const capacityStickyObserver = new MutationObserver(() => scheduleCapacitySticky(700));
capacityStickyObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class", "style"] });