// planning-capacity-sticky-bottom.js
// Zet het capaciteit-/beschikbaarheidblok vast onderaan het scherm.
// V2: gebruikt een vaste kopie onderaan, omdat sticky bottom op tabelrijen niet betrouwbaar werkt.

let capacityStickyTimer = null;
let capacityStickySyncTimer = null;

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
  return stickyText(row).toLowerCase() === "capaciteit";
}

function isNewOrderCapacityRow(row){
  const txt = stickyText(row).toLowerCase();
  return txt.includes("capaciteit met nieuwe order") || txt.includes("nieuwe order");
}

function collectCapacityRows(table){
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const startIndex = rows.findIndex(isCapacityHeaderRow);
  if (startIndex < 0) return [];

  const out = [];
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (i > startIndex && isNewOrderCapacityRow(row)) break;
    if (!isHiddenRow(row)) out.push(row);
  }
  return out;
}

function ensureCapacityFixedShell(){
  document.getElementById("capacityStickyBottomStyle")?.remove();
  const style = document.createElement("style");
  style.id = "capacityStickyBottomStyle";
  style.textContent = `
    #capacityStickyBottomClone{
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      z-index:450;
      background:#fff;
      border-top:2px solid #94a3b8;
      box-shadow:0 -8px 22px rgba(15,23,42,.16);
      overflow:hidden;
      max-height:45vh;
      pointer-events:none;
    }
    #capacityStickyBottomClone .capacity-sticky-inner{
      position:relative;
      width:max-content;
      min-width:100%;
      will-change:transform;
    }
    #capacityStickyBottomClone table{
      margin:0 !important;
      box-shadow:none !important;
      border-radius:0 !important;
    }
    #capacityStickyBottomClone tbody tr > th,
    #capacityStickyBottomClone tbody tr > td{
      background:#fff !important;
      box-shadow:none !important;
    }
    #capacityStickyBottomClone tbody tr.capacity-clone-header > th,
    #capacityStickyBottomClone tbody tr.capacity-clone-header > td{
      background:#f8fafc !important;
      font-weight:800 !important;
    }
    #capacityStickyBottomClone .sticky-left,
    #capacityStickyBottomClone .sticky-left2{
      position:static !important;
      left:auto !important;
      z-index:auto !important;
    }
    #capacityStickyBottomClone .wknd{ background:#dbeafe !important; }
    #capacityStickyBottomClone .balance-cell.pos{ background:#bbf7d0 !important; }
    #capacityStickyBottomClone .balance-cell.zero{ background:#fde68a !important; }
    #capacityStickyBottomClone .balance-cell.neg{ background:#fecaca !important; }
    body.has-capacity-sticky-clone{
      padding-bottom:var(--capacity-sticky-height, 180px) !important;
    }
  `;
  document.head.appendChild(style);

  let shell = document.getElementById("capacityStickyBottomClone");
  if (!shell) {
    shell = document.createElement("div");
    shell.id = "capacityStickyBottomClone";
    shell.innerHTML = `<div class="capacity-sticky-inner"></div>`;
    document.body.appendChild(shell);
  }
  return shell;
}

function copyColWidths(sourceTable, cloneTable){
  const sourceFirstRow = sourceTable.querySelector("tr");
  const cloneFirstRow = cloneTable.querySelector("tr");
  if (!sourceFirstRow || !cloneFirstRow) return;

  const srcCells = Array.from(sourceFirstRow.children);
  const colgroup = document.createElement("colgroup");
  srcCells.forEach(cell => {
    const col = document.createElement("col");
    const w = Math.ceil(cell.getBoundingClientRect().width || cell.offsetWidth || 32);
    col.style.width = `${w}px`;
    colgroup.appendChild(col);
  });
  cloneTable.prepend(colgroup);
}

function buildCloneTable(sourceTable, rows){
  const cloneTable = document.createElement("table");
  cloneTable.className = sourceTable.className;
  cloneTable.style.width = `${Math.ceil(sourceTable.getBoundingClientRect().width || sourceTable.scrollWidth)}px`;
  cloneTable.style.minWidth = cloneTable.style.width;

  const tbody = document.createElement("tbody");
  rows.forEach(row => {
    const r = row.cloneNode(true);
    r.classList.remove("hidden");
    if (isCapacityHeaderRow(row) || stickyText(row).toLowerCase() === "werkvoorbereiding") {
      r.classList.add("capacity-clone-header");
    }
    r.querySelectorAll("button, input, select, textarea").forEach(el => {
      el.disabled = true;
      el.tabIndex = -1;
    });
    tbody.appendChild(r);
  });
  cloneTable.appendChild(tbody);
  copyColWidths(sourceTable, cloneTable);
  return cloneTable;
}

function syncFixedCapacityHorizontal(){
  const shell = document.getElementById("capacityStickyBottomClone");
  const inner = shell?.querySelector(".capacity-sticky-inner");
  const table = document.querySelector(".planner-table");
  if (!shell || !inner || !table) return;

  const rect = table.getBoundingClientRect();
  const x = Math.round(rect.left);
  inner.style.transform = `translateX(${x}px)`;
}

function applyCapacityStickyBottom(){
  const sourceTable = document.querySelector(".planner-table");
  if (!sourceTable) return;

  const rows = collectCapacityRows(sourceTable);
  const shell = ensureCapacityFixedShell();
  const inner = shell.querySelector(".capacity-sticky-inner");
  if (!inner) return;

  if (!rows.length) {
    shell.hidden = true;
    document.body.classList.remove("has-capacity-sticky-clone");
    return;
  }

  shell.hidden = false;
  inner.innerHTML = "";
  inner.appendChild(buildCloneTable(sourceTable, rows));
  syncFixedCapacityHorizontal();

  const h = Math.ceil(shell.getBoundingClientRect().height || 180);
  document.documentElement.style.setProperty("--capacity-sticky-height", `${h}px`);
  document.body.classList.add("has-capacity-sticky-clone");
}

function scheduleCapacitySticky(delay = 250){
  window.clearTimeout(capacityStickyTimer);
  capacityStickyTimer = window.setTimeout(applyCapacityStickyBottom, delay);
}

function scheduleHorizontalSync(){
  window.clearTimeout(capacityStickySyncTimer);
  capacityStickySyncTimer = window.setTimeout(syncFixedCapacityHorizontal, 20);
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleCapacitySticky(700);
  scheduleCapacitySticky(1800);
});
window.addEventListener("load", () => scheduleCapacitySticky(700));
window.addEventListener("resize", () => scheduleCapacitySticky(150));
window.addEventListener("scroll", scheduleHorizontalSync, { passive:true });
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
