// planning-capacity-sticky-bottom.js
// Zet het capaciteit-/beschikbaarheidblok vast onderaan het scherm.
// V6: 1-op-1 kopie van de originele beschikbaarheid/capaciteitstabelindeling, maar sticky onderaan.

let capacityStickyTimer = null;
let capacityStickySyncTimer = null;
let capacityStickyWatchdog = null;
let capacityStickyBootTries = 0;

function stickyText(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function getPlannerScroll(){
  return document.getElementById("plannerScroll") || document.querySelector(".planner-scroll");
}

function getPlannerTable(){
  return document.querySelector("#plannerGrid table:not(#capacityStickyBottomClone table)") ||
    document.querySelector(".planning-grid table:not(#capacityStickyBottomClone table)") ||
    document.querySelector("#plannerScroll table:not(#capacityStickyBottomClone table)") ||
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

function collectCapacityRows(table){
  const rows = Array.from(table?.querySelectorAll("tbody tr") || []);
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
      position:fixed !important;
      bottom:0 !important;
      z-index:450 !important;
      background:#fff !important;
      border-top:2px solid #94a3b8 !important;
      box-shadow:0 -8px 22px rgba(15,23,42,.16) !important;
      overflow:hidden !important;
      max-height:46vh !important;
      pointer-events:none !important;
    }
    #capacityStickyBottomClone .capacity-sticky-inner{
      position:relative !important;
      width:max-content !important;
      min-width:100% !important;
      will-change:transform !important;
    }
    #capacityStickyBottomClone table{
      margin:0 !important;
      box-shadow:none !important;
      border-radius:0 !important;
    }
    #capacityStickyBottomClone tbody tr > th,
    #capacityStickyBottomClone tbody tr > td{
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
  if (!sourceFirstRow) return;

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

function cloneRow(row){
  const r = row.cloneNode(true);
  r.classList.remove("hidden");
  if (isCapacityHeaderRow(row) || stickyText(row).toLowerCase() === "werkvoorbereiding") {
    r.classList.add("capacity-clone-header");
  }
  r.querySelectorAll("button, input, select, textarea").forEach(el => {
    el.disabled = true;
    el.tabIndex = -1;
  });
  r.querySelectorAll(".sticky-left, .sticky-left2").forEach(el => {
    el.style.position = "static";
    el.style.left = "auto";
    el.style.zIndex = "auto";
  });
  return r;
}

function buildCloneTable(sourceTable, rows){
  const cloneTable = document.createElement("table");
  cloneTable.className = sourceTable.className;
  const w = Math.ceil(sourceTable.getBoundingClientRect().width || sourceTable.scrollWidth || 1200);
  cloneTable.style.width = `${w}px`;
  cloneTable.style.minWidth = `${w}px`;

  const tbody = document.createElement("tbody");
  rows.forEach(row => tbody.appendChild(cloneRow(row)));
  cloneTable.appendChild(tbody);
  copyColWidths(sourceTable, cloneTable);
  return cloneTable;
}

function syncFixedCapacityHorizontal(){
  const shell = document.getElementById("capacityStickyBottomClone");
  const inner = shell?.querySelector(".capacity-sticky-inner");
  const scroll = getPlannerScroll();
  const table = getPlannerTable();
  if (!shell || !inner || !table) return;

  const rect = (scroll || table).getBoundingClientRect();
  shell.style.left = `${Math.max(0, Math.round(rect.left))}px`;
  shell.style.width = `${Math.round(rect.width || window.innerWidth)}px`;
  shell.style.right = "auto";

  const scrollLeft = scroll ? scroll.scrollLeft : 0;
  inner.style.transform = `translateX(${-Math.round(scrollLeft)}px)`;
}

function applyCapacityStickyBottom(){
  const sourceTable = getPlannerTable();
  if (!sourceTable) return false;

  const rows = collectCapacityRows(sourceTable);
  const shell = ensureCapacityFixedShell();
  const inner = shell.querySelector(".capacity-sticky-inner");
  if (!inner) return false;

  if (!rows.length) {
    scheduleCapacitySticky(700);
    return false;
  }

  shell.hidden = false;
  inner.innerHTML = "";
  inner.appendChild(buildCloneTable(sourceTable, rows));
  syncFixedCapacityHorizontal();

  const h = Math.ceil(shell.getBoundingClientRect().height || 180);
  document.documentElement.style.setProperty("--capacity-sticky-height", `${h}px`);
  document.body.classList.add("has-capacity-sticky-clone");
  return true;
}

function scheduleCapacitySticky(delay = 250){
  window.clearTimeout(capacityStickyTimer);
  capacityStickyTimer = window.setTimeout(applyCapacityStickyBottom, delay);
}

function scheduleHorizontalSync(){
  window.clearTimeout(capacityStickySyncTimer);
  capacityStickySyncTimer = window.setTimeout(syncFixedCapacityHorizontal, 20);
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
  capacityStickyWatchdog = window.setInterval(() => {
    applyCapacityStickyBottom();
  }, 5000);
}

window.addEventListener("DOMContentLoaded", startCapacityStickyBootLoop);
window.addEventListener("load", startCapacityStickyBootLoop);
window.addEventListener("resize", () => scheduleCapacitySticky(150));
window.addEventListener("scroll", scheduleHorizontalSync, { passive:true });

function bindPlannerScroll(){
  const scroll = getPlannerScroll();
  if (scroll && scroll.dataset.capacityStickyBound !== "1") {
    scroll.dataset.capacityStickyBound = "1";
    scroll.addEventListener("scroll", scheduleHorizontalSync, { passive:true });
  }
}
window.setTimeout(bindPlannerScroll, 800);
window.setTimeout(bindPlannerScroll, 2000);
window.setTimeout(bindPlannerScroll, 4000);

window.addEventListener("planning:project-include-changed", () => scheduleCapacitySticky(250));
window.addEventListener("planning:all-time-hours-updated", () => scheduleCapacitySticky(250));

document.addEventListener("click", (ev) => {
  if (ev.target.closest(".cap-expander, #btnPrev, #btnNext, #btnSettingsSave, #amSave")) {
    scheduleCapacitySticky(500);
    scheduleCapacitySticky(1200);
  }
}, true);

const capacityStickyObserver = new MutationObserver(() => {
  bindPlannerScroll();
  scheduleCapacitySticky(700);
});
capacityStickyObserver.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class", "style"] });
