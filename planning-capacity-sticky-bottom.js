// planning-capacity-sticky-bottom.js
// Zet het capaciteit-/beschikbaarheidblok vast onderaan het scherm.
// V5: vaste kopie met linkerkolommen vast en dagkolommen horizontaal scrollend.

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
    #capacityStickyBottomClone .capacity-sticky-layout{
      display:grid !important;
      grid-template-columns:var(--cap-left-w, 340px) 1fr !important;
      width:100% !important;
      overflow:hidden !important;
      background:#fff !important;
    }
    #capacityStickyBottomClone .capacity-sticky-left{
      position:relative !important;
      z-index:3 !important;
      background:#fff !important;
      box-shadow:2px 0 0 #cbd5e1 !important;
      overflow:hidden !important;
    }
    #capacityStickyBottomClone .capacity-sticky-right-wrap{
      overflow:hidden !important;
      min-width:0 !important;
      background:#fff !important;
    }
    #capacityStickyBottomClone .capacity-sticky-right-inner{
      width:max-content !important;
      will-change:transform !important;
    }
    #capacityStickyBottomClone table{
      margin:0 !important;
      border-collapse:collapse !important;
      table-layout:fixed !important;
      box-shadow:none !important;
      border-radius:0 !important;
      font-size:11px !important;
    }
    #capacityStickyBottomClone th,
    #capacityStickyBottomClone td{
      height:20px !important;
      min-height:20px !important;
      padding:1px 4px !important;
      border:1px solid #dbe3ef !important;
      background:#fff !important;
      box-shadow:none !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      box-sizing:border-box !important;
    }
    #capacityStickyBottomClone tr.capacity-clone-header > th,
    #capacityStickyBottomClone tr.capacity-clone-header > td{
      background:#f8fafc !important;
      font-weight:800 !important;
      height:24px !important;
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
    document.body.appendChild(shell);
  }
  return shell;
}

function cellWidth(cell, fallback = 34){
  return Math.ceil(cell?.getBoundingClientRect?.().width || cell?.offsetWidth || fallback);
}

function sourceColumnWidths(sourceTable){
  const firstRow = sourceTable.querySelector("tr");
  const cells = Array.from(firstRow?.children || []);
  return cells.map((cell, idx) => cellWidth(cell, idx < 2 ? 170 : 34));
}

function makeColgroup(widths){
  const cg = document.createElement("colgroup");
  widths.forEach(w => {
    const col = document.createElement("col");
    col.style.width = `${Math.max(18, Math.ceil(w))}px`;
    cg.appendChild(col);
  });
  return cg;
}

function cloneCell(cell){
  const c = cell.cloneNode(true);
  c.classList.remove("sticky-left", "sticky-left2");
  c.style.position = "static";
  c.style.left = "auto";
  c.style.zIndex = "auto";
  c.querySelectorAll("button, input, select, textarea").forEach(el => {
    el.disabled = true;
    el.tabIndex = -1;
  });
  return c;
}

function buildSplitCloneTables(sourceTable, rows){
  const widths = sourceColumnWidths(sourceTable);
  const leftWidths = widths.slice(0, 2);
  const rightWidths = widths.slice(2);
  const leftW = leftWidths.reduce((a,b) => a + b, 0);
  const rightW = rightWidths.reduce((a,b) => a + b, 0);

  const layout = document.createElement("div");
  layout.className = "capacity-sticky-layout";
  layout.style.setProperty("--cap-left-w", `${leftW}px`);

  const leftPane = document.createElement("div");
  leftPane.className = "capacity-sticky-left";
  const rightWrap = document.createElement("div");
  rightWrap.className = "capacity-sticky-right-wrap";
  const rightInner = document.createElement("div");
  rightInner.className = "capacity-sticky-right-inner";

  const leftTable = document.createElement("table");
  leftTable.className = sourceTable.className;
  leftTable.style.width = `${leftW}px`;
  leftTable.style.minWidth = `${leftW}px`;
  leftTable.appendChild(makeColgroup(leftWidths));

  const rightTable = document.createElement("table");
  rightTable.className = sourceTable.className;
  rightTable.style.width = `${rightW}px`;
  rightTable.style.minWidth = `${rightW}px`;
  rightTable.appendChild(makeColgroup(rightWidths));

  const leftBody = document.createElement("tbody");
  const rightBody = document.createElement("tbody");

  rows.forEach(row => {
    const cells = Array.from(row.children);
    const leftRow = document.createElement("tr");
    const rightRow = document.createElement("tr");
    leftRow.className = row.className;
    rightRow.className = row.className;
    leftRow.classList.remove("hidden");
    rightRow.classList.remove("hidden");
    if (isCapacityHeaderRow(row) || stickyText(row).toLowerCase() === "werkvoorbereiding") {
      leftRow.classList.add("capacity-clone-header");
      rightRow.classList.add("capacity-clone-header");
    }

    cells.slice(0, 2).forEach(cell => leftRow.appendChild(cloneCell(cell)));
    cells.slice(2).forEach(cell => rightRow.appendChild(cloneCell(cell)));

    // Zorg dat header-rijen met colspan niet de split breken.
    if (!leftRow.children.length) {
      const td = document.createElement("td");
      td.textContent = stickyText(row);
      leftRow.appendChild(td);
    }

    leftBody.appendChild(leftRow);
    rightBody.appendChild(rightRow);
  });

  leftTable.appendChild(leftBody);
  rightTable.appendChild(rightBody);
  leftPane.appendChild(leftTable);
  rightInner.appendChild(rightTable);
  rightWrap.appendChild(rightInner);
  layout.appendChild(leftPane);
  layout.appendChild(rightWrap);

  return { layout, rightInner };
}

function syncFixedCapacityHorizontal(){
  const shell = document.getElementById("capacityStickyBottomClone");
  const rightInner = shell?.querySelector(".capacity-sticky-right-inner");
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
  const { layout } = buildSplitCloneTables(sourceTable, rows);
  shell.appendChild(layout);
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
