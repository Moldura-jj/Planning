// planning-capacity-sticky-v2.js
// Alleen geladen op planning_v2.html.
// Doel: capaciteit onderaan vast tonen zonder planning.html te beïnvloeden.
// V2.4: sticky kopie verbergen zodra het originele capaciteitblok zelf in beeld is.

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

function v2Visible(row){
  if (!row) return false;
  if (row.classList.contains("hidden")) return false;
  const cs = window.getComputedStyle(row);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

function v2AllBodyRows(table){
  return Array.from(table?.querySelectorAll("tbody tr") || []);
}

function v2CapacityTitleRow(table){
  return v2AllBodyRows(table).find(v2IsCapacityTitle) || null;
}

function v2CapacityRows(table){
  const rows = v2AllBodyRows(table);
  const start = rows.findIndex(v2IsCapacityTitle);
  if (start < 0) return [];

  const out = [];
  // Sla de losse titelrij "Capaciteit" over. Die zetten we linksboven in de sticky header.
  for (let i = start + 1; i < rows.length; i++) {
    const row = rows[i];
    if (v2IsNewOrderRow(row)) break;
    if (!v2Visible(row)) continue;
    if (v2IsEmptyRow(row)) continue;
    out.push(row);
  }
  return out;
}

function v2OriginalCapacityVisible(table){
  const rows = [v2CapacityTitleRow(table), ...v2CapacityRows(table)].filter(Boolean);
  if (!rows.length) return false;

  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  // Als het echte capaciteitblok in de onderste 75% van het scherm zichtbaar is,
  // verbergen we de sticky kopie om dubbele tabellen te voorkomen.
  return rows.some(row => {
    const r = row.getBoundingClientRect();
    return r.bottom > 80 && r.top < (vh - 40);
  });
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
  const theadRows = Array.from(table?.querySelectorAll("thead tr") || []);
  if (theadRows.length) {
    const filtered = theadRows.filter(v2LooksLikeDateHeader);
    return (filtered.length ? filtered : theadRows.slice(-3)).slice(-3);
  }

  const bodyRows = v2AllBodyRows(table);
  const out = [];
  for (const row of bodyRows) {
    if (row.classList.contains("project-row") || v2IsCapacityTitle(row)) break;
    if (v2LooksLikeDateHeader(row)) out.push(row);
  }
  return out.slice(-3);
}

function v2CellWidth(cell){
  return Math.ceil(cell?.getBoundingClientRect?.().width || cell?.offsetWidth || 32);
}

function v2SizingRow(table){
  const allRows = Array.from(table?.querySelectorAll("thead tr, tbody tr") || []);
  const candidates = allRows.filter(row => v2Visible(row) && Array.from(row.children || []).length > 2);
  candidates.sort((a,b) => Array.from(b.children || []).length - Array.from(a.children || []).length);
  return candidates[0] || table?.querySelector("tr");
}

function v2ColumnWidths(table){
  const row = v2SizingRow(table);
  return Array.from(row?.children || []).map(v2CellWidth);
}

function v2LeftWidth(widths){
  return Math.max(260, (widths[0] || 280) + (widths[1] || 64));
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
    #capacityStickyV2[hidden]{ display:none !important; }
    #capacityStickyV2 .v2-bar{
      display:grid;
      grid-template-columns:var(--v2-left-width, 360px) 1fr;
      width:100%;
      overflow:hidden;
      background:#fff;
    }
    #capacityStickyV2 .v2-left,
    #capacityStickyV2 .v2-right{
      overflow:hidden;
      background:#fff;
    }
    #capacityStickyV2 .v2-left{
      border-right:2px solid #cbd5e1;
      z-index:2;
    }
    #capacityStickyV2 .v2-right-inner{
      width:max-content;
      will-change:transform;
    }
    #capacityStickyV2 table{
      border-collapse:separate;
      border-spacing:0;
      table-layout:fixed;
      margin:0;
      box-shadow:none;
      border-radius:0;
      font-weight:400;
    }
    #capacityStickyV2 tr{ height:18px; }
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
    #capacityStickyV2 .week-clickable-week{
      pointer-events:auto;
      cursor:pointer;
    }
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
  c.classList.remove("sticky-left", "sticky-left2");
  c.style.position = "";
  c.style.left = "";
  c.style.transform = "";
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

function v2SetWidth(cell, width){
  const w = Math.max(1, Math.round(width || 32));
  cell.style.width = `${w}px`;
  cell.style.minWidth = `${w}px`;
  cell.style.maxWidth = `${w}px`;
}

function v2BuildPart(rows, colStart, colEnd, widths, isLeft){
  const table = document.createElement("table");
  const total = widths.slice(colStart, colEnd).reduce((a,b)=>a+(b||32),0);
  table.style.width = `${total}px`;
  table.style.minWidth = `${total}px`;

  const thead = document.createElement("thead");
  rows.headers.forEach((srcRow, rIdx) => {
    const tr = document.createElement("tr");
    Array.from(srcRow.children || []).slice(colStart, colEnd).forEach((srcCell, offset) => {
      const sourceIndex = colStart + offset;
      const c = v2CloneCell(srcCell, "th");
      v2SetWidth(c, widths[sourceIndex]);
      if (isLeft && rIdx === rows.headers.length - 1 && sourceIndex === 0) {
        c.textContent = "Capaciteit";
        c.classList.add("v2-title-cell");
      }
      tr.appendChild(c);
    });
    thead.appendChild(tr);
  });
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.body.forEach(srcRow => {
    const tr = document.createElement("tr");
    tr.className = srcRow.className || "";
    const txt = v2Text(srcRow).toLowerCase();
    if (txt === "werkvoorbereiding") tr.classList.add("v2-section-row");

    Array.from(srcRow.children || []).slice(colStart, colEnd).forEach((srcCell, offset) => {
      const sourceIndex = colStart + offset;
      const c = v2CloneCell(srcCell, "td");
      v2SetWidth(c, widths[sourceIndex]);
      tr.appendChild(c);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function v2BuildSticky(table){
  const widths = v2ColumnWidths(table);
  if (widths.length < 3) return null;

  const headers = v2HeaderRows(table);
  const body = v2CapacityRows(table);
  if (!headers.length || !body.length) return null;

  const rows = { headers, body };
  const fixedCols = 2;
  const shell = document.createElement("div");
  shell.className = "v2-bar";
  shell.style.setProperty("--v2-left-width", `${v2LeftWidth(widths)}px`);

  const left = document.createElement("div");
  left.className = "v2-left";
  left.appendChild(v2BuildPart(rows, 0, fixedCols, widths, true));

  const right = document.createElement("div");
  right.className = "v2-right";
  const rightInner = document.createElement("div");
  rightInner.className = "v2-right-inner";
  rightInner.appendChild(v2BuildPart(rows, fixedCols, widths.length, widths, false));
  right.appendChild(rightInner);

  shell.appendChild(left);
  shell.appendChild(right);
  return shell;
}

function v2EqualizeRowHeights(){
  const shell = document.getElementById("capacityStickyV2");
  if (!shell || shell.hidden) return;
  const leftRows = Array.from(shell.querySelectorAll(".v2-left tr"));
  const rightRows = Array.from(shell.querySelectorAll(".v2-right tr"));
  const count = Math.min(leftRows.length, rightRows.length);

  for (let i = 0; i < count; i++) {
    const l = leftRows[i];
    const r = rightRows[i];
    l.style.height = "";
    r.style.height = "";
    l.querySelectorAll("th,td").forEach(c => { c.style.height = ""; c.style.lineHeight = ""; });
    r.querySelectorAll("th,td").forEach(c => { c.style.height = ""; c.style.lineHeight = ""; });
  }

  shell.getBoundingClientRect();

  for (let i = 0; i < count; i++) {
    const l = leftRows[i];
    const r = rightRows[i];
    const h = Math.max(18, Math.ceil(l.getBoundingClientRect().height || 18), Math.ceil(r.getBoundingClientRect().height || 18));
    for (const row of [l, r]) {
      row.style.height = `${h}px`;
      row.style.minHeight = `${h}px`;
      row.querySelectorAll("th,td").forEach(c => {
        c.style.height = `${h}px`;
        c.style.minHeight = `${h}px`;
        c.style.lineHeight = `${Math.max(12, h - 2)}px`;
      });
    }
  }
}

function v2Sync(){
  const shell = document.getElementById("capacityStickyV2");
  const scroll = v2PlannerScroll();
  const table = v2PlannerTable();
  const rightInner = shell?.querySelector(".v2-right-inner");
  if (!shell || !rightInner || !table) return;

  if (v2OriginalCapacityVisible(table)) {
    shell.hidden = true;
    document.body.classList.remove("has-capacity-sticky-v2");
    return;
  }

  shell.hidden = false;
  const rect = (scroll || table).getBoundingClientRect();
  shell.style.left = `${Math.max(0, Math.round(rect.left))}px`;
  shell.style.width = `${Math.round(rect.width || window.innerWidth)}px`;
  shell.style.right = "auto";

  const x = Math.round(scroll?.scrollLeft || 0);
  rightInner.style.transform = `translateX(${-x}px)`;
}

function v2Apply(){
  const table = v2PlannerTable();
  if (!table) return false;

  const shell = v2EnsureShell();
  const built = v2BuildSticky(table);
  if (!built) return false;

  shell.innerHTML = "";
  shell.appendChild(built);
  v2Sync();
  v2EqualizeRowHeights();
  window.setTimeout(() => { v2EqualizeRowHeights(); v2Sync(); }, 60);

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

const v2Scroll = () => {
  const s = v2PlannerScroll();
  if (s && !s.dataset.v2StickyBound) {
    s.dataset.v2StickyBound = "1";
    s.addEventListener("scroll", v2ScheduleSync, { passive:true });
  }
};
window.setInterval(v2Scroll, 1000);

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
