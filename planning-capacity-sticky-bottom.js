// planning-capacity-sticky-bottom.js
// Zet het capaciteit-/beschikbaarheidblok vast onderaan het scherm.
// V9: sticky capaciteit met dag/weekkoppen en vaste linkerkolommen bij horizontaal scrollen.

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
  for (let i = startIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isNewOrderCapacityRow(row)) break;
    if (isHiddenRow(row)) continue;
    if (isMeaninglessSpacerRow(row)) continue;
    out.push(row);
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
      max-height:52vh !important;
      pointer-events:none !important;
      --cap-scroll-left:0px;
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
      border-collapse:separate !important;
      border-spacing:0 !important;
      table-layout:fixed !important;
      font-weight:400 !important;
    }
    #capacityStickyBottomClone th,
    #capacityStickyBottomClone td{
      font-weight:400 !important;
    }
    #capacityStickyBottomClone thead th,
    #capacityStickyBottomClone thead td{
      background:#f8fafc !important;
      font-size:10px !important;
      font-weight:400 !important;
      text-align:center !important;
      border:1px solid #dbe3ef !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      box-shadow:none !important;
    }
    #capacityStickyBottomClone .capacity-sticky-title-cell{
      text-align:left !important;
      padding-left:8px !important;
      font-size:12px !important;
      font-weight:400 !important;
      color:#0f172a !important;
      background:#f8fafc !important;
    }
    #capacityStickyBottomClone tbody tr > th,
    #capacityStickyBottomClone tbody tr > td{
      box-shadow:none !important;
      border:1px solid #dbe3ef !important;
      font-weight:400 !important;
    }
    #capacityStickyBottomClone tbody tr.capacity-clone-section > th,
    #capacityStickyBottomClone tbody tr.capacity-clone-section > td{
      background:#f8fafc !important;
      font-weight:400 !important;
    }

    /* De hele clone-tabel schuift horizontaal mee. Deze cellen krijgen een tegentransform,
       zodat medewerkers/rijlabels links zichtbaar blijven. */
    #capacityStickyBottomClone .sticky-left,
    #capacityStickyBottomClone .sticky-left2{
      position:relative !important;
      z-index:30 !important;
      transform:translateX(var(--cap-scroll-left, 0px)) !important;
      will-change:transform !important;
      box-shadow:2px 0 0 #dbe3ef !important;
    }
    #capacityStickyBottomClone .sticky-left{
      background:#fff !important;
    }
    #capacityStickyBottomClone .sticky-left2{
      background:#fff !important;
      z-index:31 !important;
    }
    #capacityStickyBottomClone thead .sticky-left,
    #capacityStickyBottomClone thead .sticky-left2,
    #capacityStickyBottomClone tbody tr.capacity-clone-section .sticky-left,
    #capacityStickyBottomClone tbody tr.capacity-clone-section .sticky-left2{
      background:#f8fafc !important;
      z-index:35 !important;
    }
    #capacityStickyBottomClone .wknd{ background:#dbeafe !important; }
    #capacityStickyBottomClone .balance-cell.pos{ background:#bbf7d0 !important; }
    #capacityStickyBottomClone .balance-cell.zero{ background:#fde68a !important; }
    #capacityStickyBottomClone .balance-cell.neg{ background:#fecaca !important; }
    #capacityStickyBottomClone .week-clickable-week{
      pointer-events:auto !important;
      cursor:pointer !important;
      font-weight:400 !important;
    }
    #capacityStickyBottomClone .week-clickable-week:hover{
      background:#e0f2fe !important;
    }
    body.has-capacity-sticky-clone{
      padding-bottom:var(--capacity-sticky-height, 210px) !important;
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

function firstSizingRow(sourceTable){
  return sourceTable.querySelector("thead tr:last-child") || sourceTable.querySelector("tbody tr") || sourceTable.querySelector("tr");
}

function copyColWidths(sourceTable, cloneTable){
  const sourceRow = firstSizingRow(sourceTable);
  if (!sourceRow) return;

  const srcCells = Array.from(sourceRow.children);
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
  r.classList.remove("hidden", "capacity-clone-header");
  r.querySelectorAll("button, input, select, textarea").forEach(el => {
    el.disabled = true;
    el.tabIndex = -1;
  });
  const txt = stickyText(row).toLowerCase();
  if (txt === "werkvoorbereiding") r.classList.add("capacity-clone-section");
  return r;
}

function cloneHeader(sourceTable){
  const thead = sourceTable.querySelector("thead")?.cloneNode(true);
  let header = thead;

  if (!header) {
    const rows = Array.from(sourceTable.querySelectorAll("tbody tr"));
    const headRows = [];
    for (const row of rows) {
      if (row.classList.contains("project-row") || isCapacityHeaderRow(row)) break;
      const txt = stickyText(row).toLowerCase();
      if (txt.includes("wk") || txt.includes("ma") || txt.includes("di") || txt.includes("juli") || txt.includes("augustus") || row.querySelector("[data-iso]")) {
        headRows.push(row);
      }
    }
    if (headRows.length) {
      header = document.createElement("thead");
      headRows.forEach(row => header.appendChild(cloneRow(row)));
    }
  }

  if (!header) return null;

  header.querySelectorAll("button, input, select, textarea").forEach(el => {
    el.disabled = true;
    el.tabIndex = -1;
  });

  const lastHeaderRow = Array.from(header.querySelectorAll("tr")).at(-1);
  const firstCell = lastHeaderRow?.children?.[0];
  if (firstCell) {
    firstCell.textContent = "Capaciteit";
    firstCell.classList.add("capacity-sticky-title-cell", "sticky-left");
    firstCell.title = "Capaciteit";
  }

  header.querySelectorAll("th,td,div,span,button").forEach(el => {
    const txt = String(el.textContent || "").trim();
    if (/^Wk\s+\d+$/i.test(txt)) {
      el.classList.add("week-clickable-week");
      el.title = "Weekoverzicht openen";
    }
  });

  return header;
}

function buildCloneTable(sourceTable, rows){
  const cloneTable = document.createElement("table");
  cloneTable.className = sourceTable.className;
  const w = Math.ceil(sourceTable.getBoundingClientRect().width || sourceTable.scrollWidth || 1200);
  cloneTable.style.width = `${w}px`;
  cloneTable.style.minWidth = `${w}px`;

  const header = cloneHeader(sourceTable);
  if (header) cloneTable.appendChild(header);

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
  shell.style.setProperty("--cap-scroll-left", `${Math.round(scrollLeft)}px`);
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

  const h = Math.ceil(shell.getBoundingClientRect().height || 210);
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
