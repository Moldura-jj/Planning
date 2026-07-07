import { makeSupabaseClient } from "./auth.js";

// planning-warning-dot.js
// Extra planninggedrag:
// - rood bolletje bij leverdatum zonder productie-uren
// - sticky-kolom fixes
// - hoofdplanning filtert op status 3, 4 en 5
// - status 2 projecten worden als apart conceptblok onder de planning getoond

const sbStatusFilter = makeSupabaseClient();
const allowedPlanningStatuses = new Set(["3", "4", "5"]);
const conceptPlanningStatuses = new Set(["2"]);
let allowedPlanningProjectIds = null;
let conceptPlanningProjectIds = new Set();
let statusFilterLoading = false;
let buildingConceptBlock = false;

function parseNlNumber(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatHours(value){
  const n = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  if (Math.abs(n) < 0.0001) return "";
  return String(n).replace(".", ",");
}

function pickObjectKey(sample, candidates){
  const keys = Object.keys(sample || {});
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const wanted of candidates) {
    const exact = keys.find(k => k === wanted);
    if (exact) return exact;
    const wantedNorm = norm(wanted);
    const loose = keys.find(k => norm(k) === wantedNorm);
    if (loose) return loose;
  }
  return "";
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

async function loadAllowedPlanningProjectIds(){
  if (allowedPlanningProjectIds || statusFilterLoading) return;
  statusFilterLoading = true;

  try {
    const { data, error } = await sbStatusFilter
      .from("projecten")
      .select("*")
      .limit(10000);

    if (error) {
      console.warn("Projectstatus-filter laden mislukt:", error.message || error);
      allowedPlanningProjectIds = null;
      conceptPlanningProjectIds = new Set();
      return;
    }

    const rows = data || [];
    const sample = rows[0] || {};
    const idKey = pickObjectKey(sample, ["project_id", "id"]);
    const statusKey = pickObjectKey(sample, [
      "salesstatus",
      "projectstatus",
      "project_status",
      "status",
      "status_id",
      "sales_status"
    ]);

    if (!idKey || !statusKey) {
      console.warn("Projectstatus-filter: id/status kolom niet gevonden", { idKey, statusKey, sample });
      allowedPlanningProjectIds = null;
      conceptPlanningProjectIds = new Set();
      return;
    }

    allowedPlanningProjectIds = new Set(
      rows
        .filter(p => allowedPlanningStatuses.has(String(p?.[statusKey] ?? "").trim()))
        .map(p => String(p?.[idKey] ?? "").trim())
        .filter(Boolean)
    );

    conceptPlanningProjectIds = new Set(
      rows
        .filter(p => conceptPlanningStatuses.has(String(p?.[statusKey] ?? "").trim()))
        .map(p => String(p?.[idKey] ?? "").trim())
        .filter(Boolean)
    );
  } finally {
    statusFilterLoading = false;
    applyProjectStatusFilter();
  }
}

function setRowHidden(row, hidden){
  if (!row) return;
  row.classList.toggle("planning-status-hidden", hidden);
  row.style.display = hidden ? "none" : "";
}

function getProjectIdFromRow(projectRow){
  return String(projectRow?.querySelector(".expander[data-proj]")?.dataset?.proj || "").trim();
}

function getVisibleDates(){
  return Array.from(document.querySelectorAll(".dayhead-btn[data-iso]"))
    .map(btn => String(btn.dataset.iso || "").trim())
    .filter(Boolean);
}

function makeEmptyTotals(dates){
  return Object.fromEntries((dates || []).map(iso => [iso, 0]));
}

function addToTotals(totals, iso, value){
  if (!iso || !(iso in totals)) return;
  totals[iso] = Math.round((Number(totals[iso] || 0) + Number(value || 0)) * 100) / 100;
}

function getDayCells(row){
  return Array.from(row?.querySelectorAll("td.cell[data-work-date]") || [])
    .filter(td => !td.classList.contains("hourscol"));
}

function sumConceptHoursFromStatus2Projects(dates){
  const totals = {
    wvb: makeEmptyTotals(dates),
    prod: makeEmptyTotals(dates),
    mont: makeEmptyTotals(dates),
  };

  document.querySelectorAll("tr.project-row:not(.concept-status2-row)").forEach(row => {
    const pid = getProjectIdFromRow(row);
    if (!conceptPlanningProjectIds.has(pid)) return;

    getDayCells(row).forEach(td => {
      const iso = String(td.dataset.workDate || "").trim();
      td.querySelectorAll(".bar").forEach(bar => {
        const isConcept = bar.classList.contains("bar-concept") || bar.classList.contains("dummy-hatch");
        if (!isConcept) return;

        const h = parseNlNumber(bar.textContent || "");
        if (!(h > 0)) return;

        if (bar.classList.contains("bar-wvb")) addToTotals(totals.wvb, iso, h);
        else if (bar.classList.contains("bar-mont")) addToTotals(totals.mont, iso, h);
        else if (bar.classList.contains("bar-prod")) addToTotals(totals.prod, iso, h);
      });
    });
  });

  return totals;
}

function findBalanceRow(label){
  const wanted = String(label || "").trim().toLowerCase();
  return Array.from(document.querySelectorAll("tr:not(.concept-status2-row)")).find(tr => {
    const first = String(tr.querySelector("td.rowhdr")?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return first === wanted;
  }) || null;
}

function readBalanceByDay(label, dates){
  const out = makeEmptyTotals(dates);
  const row = findBalanceRow(label);
  if (!row) return out;

  const cells = getDayCells(row);
  cells.forEach(td => {
    const iso = String(td.dataset.workDate || "").trim();
    if (!iso || !(iso in out)) return;
    out[iso] = parseNlNumber(td.textContent || "");
  });
  return out;
}

function sumByDay(...maps){
  const dates = Object.keys(maps[0] || {});
  const out = makeEmptyTotals(dates);
  for (const iso of dates) {
    out[iso] = Math.round(maps.reduce((sum, m) => sum + Number(m?.[iso] || 0), 0) * 100) / 100;
  }
  return out;
}

function subtractByDay(base, ...maps){
  const dates = Object.keys(base || {});
  const out = makeEmptyTotals(dates);
  for (const iso of dates) {
    out[iso] = Math.round((Number(base?.[iso] || 0) - maps.reduce((sum, m) => sum + Number(m?.[iso] || 0), 0)) * 100) / 100;
  }
  return out;
}

function createConceptCell(iso, value, cls = "concept-saldo-cell"){
  const td = document.createElement("td");
  td.className = `cell ${cls}`.trim();
  td.dataset.workDate = iso;
  const n = Number(value || 0);
  td.textContent = formatHours(n);
  if (n < 0) td.classList.add("bad");
  else if (n > 0) td.classList.add("ok");
  else td.classList.add("zero");
  return td;
}

function createConceptSummaryRow(label, dates, values, extraClass = ""){
  const tr = document.createElement("tr");
  tr.className = `concept-status2-row concept-summary-row ${extraClass}`.trim();

  const left = document.createElement("td");
  left.className = "rowhdr sticky-left concept-summary-label";
  left.textContent = label;
  tr.appendChild(left);

  const hours = document.createElement("td");
  hours.className = "cell hourscol sticky-left2";
  hours.style.left = "380px";
  tr.appendChild(hours);

  dates.forEach(iso => tr.appendChild(createConceptCell(iso, values?.[iso] || 0)));
  return tr;
}

function createConceptHeaderRow(dates){
  const tr = document.createElement("tr");
  tr.className = "concept-status2-row concept-block-header-row";

  const left = document.createElement("td");
  left.className = "rowhdr sticky-left concept-block-header";
  left.textContent = "Concept opdrachten / status 2";
  tr.appendChild(left);

  const hours = document.createElement("td");
  hours.className = "cell hourscol sticky-left2 concept-block-header-hours";
  hours.style.left = "380px";
  hours.textContent = "Concept";
  tr.appendChild(hours);

  dates.forEach(iso => {
    const td = document.createElement("td");
    td.className = "cell concept-block-header-day";
    td.dataset.workDate = iso;
    tr.appendChild(td);
  });

  return tr;
}

function cloneProjectGroupForConcept(pid){
  const rows = [];
  const sourceProject = Array.from(document.querySelectorAll("tr.project-row:not(.concept-status2-row)")).find(r => getProjectIdFromRow(r) === pid);
  if (!sourceProject) return rows;

  const sourceRows = [
    sourceProject,
    ...Array.from(document.querySelectorAll(`tr[data-parent="${CSS.escape(pid)}"]:not(.concept-status2-row)`))
  ];

  sourceRows.forEach((source, idx) => {
    const clone = source.cloneNode(true);
    clone.classList.add("concept-status2-row");
    clone.classList.remove("planning-status-hidden");
    clone.style.display = "";

    if (idx === 0) {
      clone.classList.add("concept-project-row");
      clone.classList.remove("project-plan-hidden", "is-open");
      const exp = clone.querySelector(".expander[data-proj]");
      if (exp) {
        exp.textContent = "▶";
        exp.classList.remove("open");
        exp.addEventListener("click", ev => {
          ev.stopPropagation();
          const open = exp.textContent !== "▼";
          exp.textContent = open ? "▼" : "▶";
          rows.slice(1).forEach(r => {
            if (r.classList.contains("section-row")) r.classList.toggle("hidden", !open);
            else r.classList.add("hidden");
          });
        });
      }
    } else {
      clone.classList.add("hidden");
      clone.dataset.conceptParent = pid;
    }

    rows.push(clone);
  });

  return rows;
}

function findConceptInsertBefore(tbody){
  const rows = Array.from(tbody?.querySelectorAll("tr") || []);
  return rows.find(tr =>
    tr.classList.contains("cap-total-row") ||
    tr.classList.contains("wvb-cap-total-row") ||
    String(tr.textContent || "").includes("Capaciteit")
  ) || null;
}

function buildConceptPlanningBlock(){
  if (buildingConceptBlock || !conceptPlanningProjectIds || !conceptPlanningProjectIds.size) return;
  const table = document.querySelector(".planner-table");
  const tbody = table?.querySelector("tbody");
  if (!tbody) return;

  buildingConceptBlock = true;
  try {
    tbody.querySelectorAll("tr.concept-status2-row").forEach(r => r.remove());

    const dates = getVisibleDates();
    if (!dates.length) return;

    const fragment = document.createDocumentFragment();
    fragment.appendChild(createConceptHeaderRow(dates));

    const conceptPids = Array.from(conceptPlanningProjectIds).filter(pid =>
      !!Array.from(document.querySelectorAll("tr.project-row:not(.concept-status2-row)")).find(r => getProjectIdFromRow(r) === pid)
    );

    if (!conceptPids.length) return;

    conceptPids.forEach(pid => {
      cloneProjectGroupForConcept(pid).forEach(row => fragment.appendChild(row));
    });

    const concept = sumConceptHoursFromStatus2Projects(dates);
    const conceptProdMont = sumByDay(concept.prod, concept.mont);

    const saldoProdMont = readBalanceByDay("Saldo", dates);
    const saldoWvb = readBalanceByDay("Saldo WVB", dates);
    const saldoNaConceptProdMont = subtractByDay(saldoProdMont, conceptProdMont);
    const saldoNaConceptWvb = subtractByDay(saldoWvb, concept.wvb);

    fragment.appendChild(createConceptSummaryRow("Concept WVB", dates, concept.wvb, "concept-hours-row"));
    fragment.appendChild(createConceptSummaryRow("Concept productie", dates, concept.prod, "concept-hours-row"));
    fragment.appendChild(createConceptSummaryRow("Concept montage", dates, concept.mont, "concept-hours-row"));
    fragment.appendChild(createConceptSummaryRow("Saldo WVB na concept", dates, saldoNaConceptWvb, "concept-balance-row"));
    fragment.appendChild(createConceptSummaryRow("Saldo prod./mont. na concept", dates, saldoNaConceptProdMont, "concept-balance-row"));

    tbody.insertBefore(fragment, findConceptInsertBefore(tbody));
  } finally {
    buildingConceptBlock = false;
  }
}

function applyProjectStatusFilter(){
  if (!allowedPlanningProjectIds) return;

  document.querySelectorAll("tr.project-row:not(.concept-status2-row)").forEach(projectRow => {
    const pid = getProjectIdFromRow(projectRow);
    if (!pid) return;

    const hide = !allowedPlanningProjectIds.has(pid);
    setRowHidden(projectRow, hide);

    document.querySelectorAll(`tr[data-parent="${CSS.escape(pid)}"]:not(.concept-status2-row)`).forEach(childRow => {
      setRowHidden(childRow, hide);
    });
  });

  buildConceptPlanningBlock();
}

function ensureStyle(){
  if (document.getElementById("planningWarningDotStyle")) return;

  const style = document.createElement("style");
  style.id = "planningWarningDotStyle";
  style.textContent = `
    .planning-status-hidden{ display:none !important; }

    .project-prod-hours-warning-dot{
      display:inline-block; width:9px; height:9px; margin-right:6px; border-radius:999px;
      background:#ef4444; box-shadow:0 0 0 2px rgba(239,68,68,.18);
      vertical-align:middle; transform:translateY(-1px);
    }

    .concept-block-header-row > td{
      background:#eef2ff !important;
      border-top:3px solid #334155 !important;
      border-bottom:2px solid #94a3b8 !important;
      font-weight:700;
      height:30px;
    }
    .concept-block-header{ font-size:13px; }
    .concept-project-row > td{ background:#fbfdff !important; }
    .concept-summary-row > td{ background:#f8fafc !important; font-size:12px; }
    .concept-summary-label{ font-weight:700; }
    .concept-saldo-cell{ text-align:center; font-variant-numeric:tabular-nums; }
    .concept-saldo-cell.ok{ background:#dcfce7 !important; }
    .concept-saldo-cell.bad{ background:#fecaca !important; color:#7f1d1d; font-weight:700; }
    .concept-saldo-cell.zero{ background:#f8fafc !important; color:#64748b; }
    .concept-balance-row > td{ border-bottom:1px solid #cbd5e1 !important; }

    .planner-scroll, .planner-scroll-sticky, .planner-table{ isolation:isolate; }

    .planner-table tbody td.plan-cell,
    .planner-table tbody td.cell:not(.sticky-left):not(.sticky-left2):not(.hourscol){
      position:relative !important; z-index:1 !important;
    }
    .planner-table tbody td.plan-cell .bar,
    .planner-table tbody td.plan-cell .plan-stack,
    .planner-table tbody td.plan-cell .marker-row{ position:relative; z-index:1; }

    .planner-table tbody td.project-cell.sticky-left,
    .planner-table tbody td.section-cell.sticky-left{
      position:sticky !important; left:0 !important; z-index:1000 !important; isolation:isolate !important;
      background:#fff !important; background-color:#fff !important; background-image:none !important;
      background-clip:border-box !important; overflow:hidden !important;
    }
    .planner-table tbody td.project-cell.sticky-left::before,
    .planner-table tbody td.section-cell.sticky-left::before{
      content:"" !important; position:absolute !important; inset:-4px !important; background:inherit !important;
      z-index:0 !important; pointer-events:none !important;
    }
    .planner-table tbody td.project-cell.sticky-left > *,
    .planner-table tbody td.section-cell.sticky-left > *{ position:relative !important; z-index:2 !important; }

    .planner-table tbody td.rowhdr.sticky-left,
    .planner-table tbody td.cap-name.sticky-left,
    .planner-table tbody td.sum-label.sticky-left,
    .planner-table tbody td.balance-label.sticky-left{
      position:sticky !important; left:0 !important; z-index:900 !important;
      background-clip:border-box !important; overflow:visible !important;
    }
    .planner-table tbody td.rowhdr.sticky-left::before,
    .planner-table tbody td.cap-name.sticky-left::before,
    .planner-table tbody td.sum-label.sticky-left::before,
    .planner-table tbody td.balance-label.sticky-left::before{ content:none !important; display:none !important; }

    .planner-table tbody td.hourscol.sticky-left2,
    .planner-table tbody td.cell.hourscol.sticky-left2{
      position:sticky !important; left:380px !important; z-index:990 !important; isolation:isolate !important;
      background:#fff !important; background-color:#fff !important; background-image:none !important;
      background-clip:border-box !important; overflow:hidden !important;
      border-left:1px solid #cbd5e1 !important; border-right:1px solid #e6e8ef !important; box-shadow:none !important;
    }
    .planner-table tbody td.hourscol.sticky-left2::before,
    .planner-table tbody td.cell.hourscol.sticky-left2::before{
      content:"" !important; position:absolute !important; inset:-4px !important; background:inherit !important;
      z-index:0 !important; pointer-events:none !important;
    }
    .planner-table tbody td.hourscol.sticky-left2 > *,
    .planner-table tbody td.cell.hourscol.sticky-left2 > *{ position:relative !important; z-index:2 !important; }

    .planner-table td.hourscol.sticky-left2::after,
    .planner-table th.hourscol.sticky-left2::after{ content:none !important; display:none !important; background:transparent !important; width:0 !important; }
    .planner-table .hourscol{ border-left:1px solid #cbd5e1 !important; border-right:1px solid #e6e8ef !important; box-shadow:none !important; }

    .planner-table tbody tr.zebra > td.rowhdr.sticky-left,
    .planner-table tbody tr.zebra > td.project-cell.sticky-left,
    .planner-table tbody tr.zebra > td.section-cell.sticky-left,
    .planner-table tbody tr.zebra > td.hourscol.sticky-left2{ background:#f5f6f8 !important; background-color:#f5f6f8 !important; }

    .planner-table tbody tr.project-row.is-open > td.rowhdr.sticky-left,
    .planner-table tbody tr.project-row.is-open > td.hourscol.sticky-left2{ background:#eef4ff !important; background-color:#eef4ff !important; }

    .planner-table tbody tr.project-row > td,
    .planner-table tbody tr.project-row > th,
    .planner-table tbody tr.project-topline > td,
    .planner-table tbody tr.project-topline > th,
    .planner-table tbody tr.project-bottomline > td,
    .planner-table tbody tr.project-bottomline > th{ background-image:none !important; box-shadow:none !important; }

    .planner-table tbody tr.project-row > td,
    .planner-table tbody tr.project-row > th,
    .planner-table tbody tr.project-topline > td,
    .planner-table tbody tr.project-topline > th{ border-top:2px solid #626262 !important; border-bottom:1px solid #e6e8ef !important; }

    .planner-table tbody tr.project-bottomline > td,
    .planner-table tbody tr.project-bottomline > th{ border-bottom:2px solid #626262 !important; }
    .planner-table tbody tr.project-row.project-bottomline > td,
    .planner-table tbody tr.project-row.project-bottomline > th{ border-bottom:2px solid #626262 !important; }

    .planner-table thead th.sticky-left,
    .planner-table thead th.sticky-left2,
    .planner-table thead th.sticky-top,
    .planner-table thead th.sticky-top2,
    .planner-table thead th.sticky-top3{ z-index:2000 !important; }
  `;
  document.head.appendChild(style);
}

function applyProjectWarningDots(){
  ensureStyle();

  document.querySelectorAll("tr.project-row:not(.concept-status2-row)").forEach((projectRow) => {
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

  applyProjectStatusFilter();
}

let pending = false;
function scheduleApply(){
  if (pending || buildingConceptBlock) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    applyProjectWarningDots();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleApply();
  loadAllowedPlanningProjectIds();
});
window.addEventListener("load", scheduleApply);

const observer = new MutationObserver(scheduleApply);
observer.observe(document.body, { childList: true, subtree: true });
