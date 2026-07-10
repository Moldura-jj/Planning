// planning-capacity-sticky-bottom.js
// Zet het capaciteit-/beschikbaarheidblok vast onderaan het scherm.
// V10: split-view: links vaste labels/medewerkers, rechts scrollende dagkolommen.

let capacityStickyTimer = null;
let capacityStickySyncTimer = null;
let capacityStickyWatchdog = null;
let capacityStickyBootTries = 0;

const FIXED_COLS = 2;

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

function getHeaderRows(sourceTable){
  const theadRows = Array.from(sourceTable.querySelectorAll("thead tr"));
  if (theadRows.length) return theadRows;

  const rows = Array.from(sourceTable.querySelectorAll("tbody tr"));
  const headRows = [];
  for (const row of rows) {
    if (row.classList.contains("project-row") || isCapacityHeaderRow(row)) break;
    const txt = stickyText(row).toLowerCase();
    if (txt.includes("wk") || txt.includes("ma") || txt.includes("di") || txt.includes("juli") || txt.includes("augustus") || row.querySelector("[data-iso]")) {
      headRows.push(row);
    }
  }
  return headRows;
}

function firstSizingRow(sourceTable){
  return sourceTable.querySelector("thead tr:last-child") || sourceTable.querySelector("tbody tr") || sourceTable.querySelector("tr");
}

function cellWidth(cell){
  return Math.ceil(cell?.getBoundingClientRect?.().width || cell?.offsetWidth || 32);
}

function getColumnWidths(sourceTable){
  const row = firstSizingRow(sourceTable);
  const cells = Array.from(row?.children || []);
  return cells.map(cellWidth);
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
    }
    #capacityStickyBottomClone .capacity-sticky-split{
      display:flex !important;
      align-items:stretch !important;
      width:100% !important;
      overflow:hidden !important;
      background:#fff !important;
    }
    #capacityStickyBottomClone .capacity-left-pane{
      flex:0 0 var(--capacity-left-width, 380px) !important;
      width:var(--capacity-left-width, 380px) !important;
      min-width:var(--capacity-left-width, 380px) !important;
      max-width:var(--capacity-left-width, 380px) !important;
      overflow:hidden !important;
      background:#fff !important;
      z-index:3 !important;
      box-shadow:2px 0 0 #cbd5e1 !important;
    }
    #capacityStickyBottomClone .capacity-right-pane{
      flex:1 1 auto !important;
      min-width:0 !important;
      overflow:hidden !important;
      background:#fff !important;
    }
    #capacityStickyBottomClone .capacity-right-inner{
      width:max-content !important;
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
      box-shadow:none !important;
      border:1px solid #dbe3ef !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      box-sizing:border-box !important;
      height:18px !important;
      line-height:16px !important;
      font-size:11px !important;
    }
    #capacityStickyBottomClone thead th,
    #capacityStickyBottomClone thead td{
      background:#f8fafc !important;
      font-size:10px !important;
      font-weight:400 !important;
      text-align:center !important;
    }
    #capacityStickyBottomClone .capacity-sticky-title-cell{
      text-align:left !important;
      padding-left:8px !important;
      font-size:12px !important;
      color:#0f172a !important;
      background:#f8fafc !important;
    }
    #capacityStickyBottomClone tbody tr.capacity-clone-section > th,
    #capacityStickyBottomClone tbody tr.capacity-clone-section > td{
      background:#f8fafc !important;
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
    #capacityStickyBottomClone .week-clickable-week:hover{ background:#e0f2fe !important; }
    body.has-capacity-sticky-clone{
      padding-bottom:var(--capacity-sticky-height, 210px) !important;
    }
  `;
  document.head.appendChild(style);

  let shell = document.getElementById("capacityStickyBottomClone");
  if (!shell) {
    shell = document.createElement("div");
    shell.id = "capacityStickyBottomClone";
    document.body.appendChild(shell);
  }
  return shell;
}

function cloneCell(cell, fallbackTag = "td"){
  if (!cell) return document.createElement(fallbackTag);
  const c = cell.cloneNode(true);
  c.classList.remove("sticky-left", "sticky-left2");
  c.style.position = "";
  c.style.left = "";
  c.style.transform = "";
  c.querySelectorAll("button, input, select, textarea").forEach(el => {
    el.disabled = true;
    el.tabIndex = -1;
  });
  return c;
}

function setCellWidth(cell, width){
  cell.style.width = `${width}px`;
  cell.style.minWidth = `${width}px`;
  cell.style.maxWidth = `${width}px`;
}

function buildRowPart(sourceRow, start, end, widths, rowIndex, isHeader, isLeft){
  const tr = document.createElement("tr");
  tr.className = sourceRow.className || "";
  tr.classList.remove("hidden", "capacity-clone-header");
  const txt = stickyText(sourceRow).toLowerCase();
  if (txt === "werkvoorbereiding") tr.classList.add("capacity-clone-section");

  const sourceCells = Array.from(sourceRow.children || []);
  const tag = isHeader ? "th" : "td";
  for (let i = start; i < end; i++) {
    const cell = cloneCell(sourceCells[i], tag);
    setCellWidth(cell, widths[i] || 32);

    if (isHeader && isLeft && rowIndex === -1 && i === 0) {
      cell.textContent = "Capaciteit";
      cell.classList.add("capacity-sticky-title-cell");
      cell.title = "Capaciteit";
    }

    const cellTxt = String(cell.textContent || "").trim();
    if (/^Wk\s+\d+$/i.test(cellTxt)) {
      cell.classList.add("week-clickable-week");
      cell.title = "Weekoverzicht openen";
    }

    tr.appendChild(cell);
  }
  return tr;
}

function buildTablePart(sourceRows, start, end, widths, isHeaderOnlyLeftTitle = false){
  const table = document.createElement("table");
  const totalW = widths.slice(start, end).reduce((a,b) => a + (b || 32), 0);
  table.style.width = `${totalW}px`;
  table.style.minWidth = `${totalW}px`;

  const headerRows = sourceRows.headers || [];
  if (headerRows.length) {
    const thead = document.createElement("thead");
    headerRows.forEach((row, idx) => {
      const marker = idx === headerRows.length - 1 ? -1 : idx;
      thead.appendChild(buildRowPart(row, start, end, widths, marker, true, isHeaderOnlyLeftTitle));
    });
    table.appendChild(thead);
  }

  const tbody = document.createElement("tbody");
  (sourceRows.body || []).forEach((row, idx) => tbody.appendChild(buildRowPart(row, start, end, widths, idx, false, false)));
  table.appendChild(tbody);
  return table;
}

function buildStickySplit(sourceTable, rows){
  const widths = getColumnWidths(sourceTable);
  const headers = getHeaderRows(sourceTable);
  const sourceRows = { headers, body: rows };
  const fixedCols = Math.min(FIXED_COLS, widths.length);
  const leftWidth = widths.slice(0, fixedCols).reduce((a,b) => a + (b || 32), 0);

  const split = document.createElement("div");
  split.className = "capacity-sticky-split";
  split.style.setProperty("--capacity-left-width", `${leftWidth}px`);

  const leftPane = document.createElement("div");
  leftPane.className = "capacity-left-pane";
  leftPane.appendChild(buildTablePart(sourceRows, 0, fixedCols, widths, true));

  const rightPane = document.createElement("div");
  rightPane.className = "capacity-right-pane";
  const rightInner = document.createElement("div");
  rightInner.className = "capacity-right-inner";
  rightInner.appendChild(buildTablePart(sourceRows, fixedCols, widths.length, widths, false));
  rightPane.appendChild(rightInner);

  split.appendChild(leftPane);
  split.appendChild(rightPane);
  return split;
}

function syncFixedCapacityHorizontal(){
  const shell = document.getElementById("capacityStickyBottomClone");
  const rightInner = shell?.querySelector(".capacity-right-inner");
  const scroll = getPlannerScroll();
  const table = getPlannerTable();
  if (!shell || !rightInner || !table) return;

  const rect = (scroll || table).getBoundingClientRect();
  shell.style.left = `${Math.max(0, Math.round(rect.left))}px`;
  shell.style.width = `${Math.round(rect.width || window.innerWidth)}px`;
  shell.style.right = "auto";

  const scrollLeft = scroll ? scroll.scrollLeft : 0;
  rightInner.style.transform = `translateX(${-Math.round(scrollLeft)}px)`;
}

function applyCapacityStickyBottom(){
  const sourceTable = getPlannerTable();
  if (!sourceTable) return false;

  const rows = collectCapacityRows(sourceTable);
  const shell = ensureCapacityFixedShell();
  if (!shell) return false;

  if (!rows.length) {
    scheduleCapacitySticky(700);
    return false;
  }

  shell.hidden = false;
  shell.innerHTML = "";
  shell.appendChild(buildStickySplit(sourceTable, rows));
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
  capacityStickyWatchdog = window.setInterval(() => applyCapacityStickyBottom(), 5000);
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
