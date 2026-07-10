// planning-capacity-sticky-v2.js
// Alleen geladen op planning_v2.html.
// Doel: capaciteit onderaan vast tonen zonder planning.html te beïnvloeden.
// V2.5: één gekloonde tabel in een eigen scroll-container; linker kolommen blijven sticky.

let v2Timer = null;
let v2SyncTimer = null;
let v2BootTries = 0;
let v2Watchdog = null;

function v2Text(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function v2PlannerScroll(){
  return document.getElementById("plannerScroll") || document.querySelector(".planner-scroll");
}

function v2PlannerTable(){
  return document.querySelector("#plannerGrid table") ||
    document.querySelector(".planning-grid table") ||
    document.querySelector("#plannerScroll table") ||
    Array.from(document.querySelectorAll("table")).find(t => !t.closest("#capacityStickyV2"));
}

function v2Visible(row){
  if (!row) return false;
  if (row.classList.contains("hidden")) return false;
  const cs = window.getComputedStyle(row);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

function v2IsCapacityTitle(row){
  return v2Text(row).toLowerCase() === "capaciteit";
}

function v2IsNewOrderRow(row){
  const t = v2Text(row).toLowerCase();
  return t.includes("capaciteit met nieuwe order") || t.includes("nieuwe order");
}

function v2IsEmptyRow(row){
  const cells = Array.from(row?.children || []);
  return cells.length > 0 && cells.every(c => !v2Text(c));
}

function v2LooksLikeDateHeader(row){
  const txt = v2Text(row).toLowerCase();
  if (!txt) return false;
  if (txt === "planning" || txt.includes("+ project") || txt.includes("alles dicht")) return false;
  if (row.querySelector("button, input, select, textarea")) return false;

  const monthHit = /(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}/i.test(txt);
  const weekHit = /\bwk\s*\d+\b/i.test(txt);
  const isoHit = !!row.querySelector("[data-iso]");
  const dayHit = /\b(ma|di|wo|do|vr|za|zo)\b/.test(txt) && /\d{1,2}[-/]\d{1,2}/.test(txt);
  return monthHit || weekHit || isoHit || dayHit;
}

function v2HeaderRows(table){
  const theadRows = Array.from(table?.querySelectorAll("thead tr") || []).filter(v2Visible);
  if (theadRows.length) {
    const filtered = theadRows.filter(v2LooksLikeDateHeader);
    return (filtered.length ? filtered : theadRows.slice(-3)).slice(-3);
  }

  const bodyRows = Array.from(table?.querySelectorAll("tbody tr") || []);
  const out = [];
  for (const row of bodyRows) {
    if (row.classList.contains("project-row") || v2IsCapacityTitle(row)) break;
    if (v2Visible(row) && v2LooksLikeDateHeader(row)) out.push(row);
  }
  return out.slice(-3);
}

function v2CapacityRows(table){
  const rows = Array.from(table?.querySelectorAll("tbody tr") || []);
  const start = rows.findIndex(v2IsCapacityTitle);
  if (start < 0) return [];

  const out = [];
  for (let i = start + 1; i < rows.length; i++) {
    const row = rows[i];
    if (v2IsNewOrderRow(row)) break;
    if (!v2Visible(row)) continue;
    if (v2IsEmptyRow(row)) continue;
    out.push(row);
  }
  return out;
}

function v2SizingRow(table){
  const rows = Array.from(table?.querySelectorAll("thead tr, tbody tr") || []);
  const candidates = rows.filter(row => v2Visible(row) && Array.from(row.children || []).length > 2);
  candidates.sort((a,b) => Array.from(b.children || []).length - Array.from(a.children || []).length);
  return candidates[0] || table?.querySelector("tr");
}

function v2CellWidth(cell){
  return Math.ceil(cell?.getBoundingClientRect?.().width || cell?.offsetWidth || 32);
}

function v2ColumnWidths(table){
  const row = v2SizingRow(table);
  return Array.from(row?.children || []).map(v2CellWidth);
}

function v2LeftWidth(widths){
  return Math.max(240, Math.round((widths[0] || 280) + (widths[1] || 64)));
}

function v2EnsureShell(){
  document.getElementById("capacityStickyV2Style")?.remove();
  const style = document.createElement("style");
  style.id = "capacityStickyV2Style";
  style.textContent = `
    #capacityStickyV2{
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      z-index:600;
      background:#fff;
      border-top:2px solid #94a3b8;
      box-shadow:0 -10px 24px rgba(15,23,42,.16);
      max-height:45vh;
      overflow:hidden;
      pointer-events:none;
      font-size:11px;
      color:#0f172a;
    }
    #capacityStickyV2 .v2-viewport{
      overflow:hidden;
      width:100%;
      background:#fff;
    }
    #capacityStickyV2 table{
      border-collapse:separate;
      border-spacing:0;
      table-layout:fixed;
      margin:0;
      box-shadow:none;
      border-radius:0;
      font-weight:400;
      background:#fff;
    }
    #capacityStickyV2 th,
    #capacityStickyV2 td{
      border:1px solid #dbe3ef;
      height:18px;
      line-height:16px;
      padding:0 3px;
      box-sizing:border-box;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      font-weight:400 !important;
      background:#fff;
      vertical-align:middle;
    }
    #capacityStickyV2 thead th,
    #capacityStickyV2 thead td{
      background:#f8fafc !important;
      text-align:center;
      font-size:10px;
    }
    #capacityStickyV2 .sticky-left,
    #capacityStickyV2 .rowhdr.sticky-left,
    #capacityStickyV2 .v2-sticky-left{
      position:sticky !important;
      left:0 !important;
      z-index:20 !important;
      background:#fff !important;
    }
    #capacityStickyV2 .sticky-left2,
    #capacityStickyV2 .hourscol.sticky-left2,
    #capacityStickyV2 .v2-sticky-left2{
      position:sticky !important;
      left:var(--v2-first-col-width, 280px) !important;
      z-index:21 !important;
      background:#fff !important;
    }
    #capacityStickyV2 thead .sticky-left,
    #capacityStickyV2 thead .sticky-left2,
    #capacityStickyV2 thead .v2-sticky-left,
    #capacityStickyV2 thead .v2-sticky-left2{
      background:#f8fafc !important;
      z-index:30 !important;
    }
    #capacityStickyV2 .v2-title-cell{
      text-align:left !important;
      font-size:12px !important;
      color:#0f172a !important;
      background:#f8fafc !important;
    }
    #capacityStickyV2 .v2-section-row th,
    #capacityStickyV2 .v2-section-row td{
      background:#f8fafc !important;
    }
    #capacityStickyV2 .wknd{ background:#dbeafe !important; }
    #capacityStickyV2 .balance-cell.pos{ background:#bbf7d0 !important; }
    #capacityStickyV2 .balance-cell.zero{ background:#fde68a !important; }
    #capacityStickyV2 .balance-cell.neg{ background:#fecaca !important; }
    #capacityStickyV2 .week-clickable-week{ pointer-events:auto; cursor:pointer; }
    #capacityStickyV2 .week-clickable-week:hover{ background:#e0f2fe !important; }
    body.has-capacity-sticky-v2{ padding-bottom:var(--v2-sticky-height, 220px) !important; }
  `;
  document.head.appendChild(style);

  let shell = document.getElementById("capacityStickyV2");
  if (!shell) {
    shell = document.createElement("div");
    shell.id = "capacityStickyV2";
    document.body.appendChild(shell);
  }
  return shell;
}

function v2CloneCell(cell, tag="td"){
  const c = cell ? cell.cloneNode(true) : document.createElement(tag);
  c.style.position = "";
  c.style.left = "";
  c.style.right = "";
  c.style.transform = "";
  c.style.zIndex = "";
  c.querySelectorAll("button,input,select,textarea").forEach(el => {
    el.disabled = true;
    el.tabIndex = -1;
  });
  const txt = String(c.textContent || "").trim();
  if (/^Wk\s+\d+$/i.test(txt)) {
    c.classList.add("week-clickable-week");
    c.title = "Weekoverzicht openen";
  }
  return c;
}

function v2ApplyCellWidth(cell, width){
  const w = Math.max(1, Math.round(width || 32));
  cell.style.width = `${w}px`;
  cell.style.minWidth = `${w}px`;
  cell.style.maxWidth = `${w}px`;
}

function v2ApplyRowWidths(row, widths){
  let col = 0;
  Array.from(row.children || []).forEach(cell => {
    const span = Math.max(1, Number(cell.getAttribute("colspan") || 1));
    const w = widths.slice(col, col + span).reduce((a,b)=>a+(b||32),0) || v2CellWidth(cell);
    v2ApplyCellWidth(cell, w);
    col += span;
  });
}

function v2MakeHeaderClone(srcRows, widths){
  const thead = document.createElement("thead");
  srcRows.forEach((srcRow, idx) => {
    const tr = srcRow.cloneNode(false);
    tr.className = srcRow.className || "";
    Array.from(srcRow.children || []).forEach((srcCell, cellIdx) => {
      const c = v2CloneCell(srcCell, "th");
      if (idx === srcRows.length - 1 && cellIdx === 0) {
        c.textContent = "Capaciteit";
        c.classList.add("v2-title-cell", "v2-sticky-left");
      }
      if (cellIdx === 0) c.classList.add("v2-sticky-left");
      if (cellIdx === 1) c.classList.add("v2-sticky-left2");
      tr.appendChild(c);
    });
    v2ApplyRowWidths(tr, widths);
    thead.appendChild(tr);
  });
  return thead;
}

function v2MakeBodyClone(srcRows, widths){
  const tbody = document.createElement("tbody");
  srcRows.forEach(srcRow => {
    const tr = srcRow.cloneNode(false);
    tr.className = srcRow.className || "";
    const txt = v2Text(srcRow).toLowerCase();
    if (txt === "werkvoorbereiding") tr.classList.add("v2-section-row");
    Array.from(srcRow.children || []).forEach((srcCell, cellIdx) => {
      const c = v2CloneCell(srcCell, "td");
      if (cellIdx === 0) c.classList.add("v2-sticky-left");
      if (cellIdx === 1) c.classList.add("v2-sticky-left2");
      tr.appendChild(c);
    });
    v2ApplyRowWidths(tr, widths);
    tbody.appendChild(tr);
  });
  return tbody;
}

function v2BuildSticky(sourceTable){
  const widths = v2ColumnWidths(sourceTable);
  if (widths.length < 3) return null;

  const headers = v2HeaderRows(sourceTable);
  const bodyRows = v2CapacityRows(sourceTable);
  if (!headers.length || !bodyRows.length) return null;

  const viewport = document.createElement("div");
  viewport.className = "v2-viewport";
  viewport.style.setProperty("--v2-first-col-width", `${Math.round(widths[0] || 280)}px`);

  const table = document.createElement("table");
  table.className = sourceTable.className || "";
  const total = widths.reduce((a,b)=>a+(b||32),0);
  table.style.width = `${total}px`;
  table.style.minWidth = `${total}px`;

  table.appendChild(v2MakeHeaderClone(headers, widths));
  table.appendChild(v2MakeBodyClone(bodyRows, widths));

  viewport.appendChild(table);
  return viewport;
}

function v2OriginalCapacityVisible(){
  const table = v2PlannerTable();
  const row = Array.from(table?.querySelectorAll("tbody tr") || []).find(v2IsCapacityTitle);
  if (!row) return false;
  const rect = row.getBoundingClientRect();
  const shell = document.getElementById("capacityStickyV2");
  const stickyHeight = shell && !shell.hidden ? (shell.getBoundingClientRect().height || 0) : 0;
  return rect.top < window.innerHeight - stickyHeight + 24 && rect.bottom > 40;
}

function v2Sync(){
  const shell = document.getElementById("capacityStickyV2");
  const viewport = shell?.querySelector(".v2-viewport");
  const scroll = v2PlannerScroll();
  const table = v2PlannerTable();
  if (!shell || !viewport || !table) return;

  const rect = (scroll || table).getBoundingClientRect();
  shell.style.left = `${Math.max(0, Math.round(rect.left))}px`;
  shell.style.width = `${Math.round(rect.width || window.innerWidth)}px`;
  shell.style.right = "auto";

  viewport.scrollLeft = Math.round(scroll?.scrollLeft || 0);

  const hideBecauseOriginalVisible = v2OriginalCapacityVisible();
  shell.hidden = hideBecauseOriginalVisible;
  document.body.classList.toggle("has-capacity-sticky-v2", !hideBecauseOriginalVisible);
}

function v2Apply(){
  const table = v2PlannerTable();
  if (!table) return false;

  const shell = v2EnsureShell();
  const built = v2BuildSticky(table);
  if (!built) return false;

  shell.innerHTML = "";
  shell.appendChild(built);
  shell.hidden = false;
  v2Sync();

  const h = Math.ceil(shell.getBoundingClientRect().height || 220);
  document.documentElement.style.setProperty("--v2-sticky-height", `${h}px`);
  if (!shell.hidden) document.body.classList.add("has-capacity-sticky-v2");
  return true;
}

function v2Schedule(delay=250){
  window.clearTimeout(v2Timer);
  v2Timer = window.setTimeout(v2Apply, delay);
}

function v2ScheduleSync(){
  window.clearTimeout(v2SyncTimer);
  v2SyncTimer = window.setTimeout(v2Sync, 20);
}

function v2Boot(){
  v2BootTries = 0;
  const run = () => {
    v2BootTries += 1;
    const ok = v2Apply();
    if (!ok && v2BootTries < 40) window.setTimeout(run, 300);
  };
  run();

  window.clearInterval(v2Watchdog);
  v2Watchdog = window.setInterval(v2Apply, 5000);
}

window.addEventListener("DOMContentLoaded", v2Boot);
window.addEventListener("load", v2Boot);
window.addEventListener("resize", () => v2Schedule(150));
window.addEventListener("scroll", v2ScheduleSync, { passive:true });

const v2ScrollBind = () => {
  const s = v2PlannerScroll();
  if (s && !s.dataset.v2StickyBound) {
    s.dataset.v2StickyBound = "1";
    s.addEventListener("scroll", v2ScheduleSync, { passive:true });
  }
};
window.setInterval(v2ScrollBind, 1000);

window.addEventListener("planning:project-include-changed", () => v2Schedule(300));
window.addEventListener("planning:all-time-hours-updated", () => v2Schedule(300));

document.addEventListener("click", (ev) => {
  if (ev.target.closest("#btnPrev, #btnNext, #btnSettingsSave, #amSave, .cap-expander")) {
    v2Schedule(700);
    v2Schedule(1600);
  }
}, true);

const v2Obs = new MutationObserver(() => v2Schedule(900));
v2Obs.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class", "style"] });
