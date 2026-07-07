import { makeSupabaseClient } from "./auth.js";

// planning-warning-dot.js
// Extra planninggedrag:
// - rood bolletje bij productie-uren in secties, maar 0 productie gepland
// - projectstatus-filter: status 2, 3, 4 en 5 worden in de normale planner getoond
// - oude losse status-2/conceptblokken worden verwijderd

const sbStatusFilter = makeSupabaseClient();
const allowedPlanningStatuses = new Set(["2", "3", "4", "5"]);
let allowedPlanningProjectIds = null;
let statusFilterLoading = false;
let pending = false;

function parseNlNumber(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
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

function getProjectProductionHours(projectRow){
  const rows = projectRow.querySelectorAll(".mini-hours .mh-row");
  for (const row of rows) {
    const label = String(row.querySelector(".mh-l")?.textContent || "").trim().toLowerCase();
    if (!label.includes("prod")) continue;

    const values = Array.from(row.querySelectorAll(".mh-v")).map(v => parseNlNumber(v.textContent || ""));
    return {
      required: values[0] || 0,
      planned: values[1] || 0,
      remaining: values[2] || 0
    };
  }
  return { required: 0, planned: 0, remaining: 0 };
}

function getProjectIdFromRow(projectRow){
  return String(projectRow?.querySelector(".expander[data-proj]")?.dataset?.proj || "").trim();
}

function setRowHidden(row, hidden){
  if (!row) return;
  row.classList.toggle("planning-status-hidden", hidden);
  row.style.display = hidden ? "none" : "";
}

function removeOldConceptRows(){
  document.querySelectorAll("tr.concept-status2-row").forEach(row => row.remove());

  document.querySelectorAll(".planner-table tbody tr").forEach(row => {
    const txt = String(row.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (
      (txt.includes("concept opdrachten") && txt.includes("status 2")) ||
      (txt.includes("nieuwe order") && txt.includes("koppelen")) ||
      txt === "capaciteit met nieuwe order"
    ) {
      row.remove();
    }
  });
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
      return;
    }

    allowedPlanningProjectIds = new Set(
      rows
        .filter(p => allowedPlanningStatuses.has(String(p?.[statusKey] ?? "").trim()))
        .map(p => String(p?.[idKey] ?? "").trim())
        .filter(Boolean)
    );
  } finally {
    statusFilterLoading = false;
    applyProjectStatusFilter();
  }
}

function applyProjectStatusFilter(){
  removeOldConceptRows();
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

    const prod = getProjectProductionHours(projectRow);
    const shouldShow = prod.required > 0 && prod.planned <= 0;
    const existing = nameLine.querySelector(".project-prod-hours-warning-dot");

    if (shouldShow && !existing) {
      const dot = document.createElement("span");
      dot.className = "project-prod-hours-warning-dot";
      dot.title = "Productie-uren in secties aanwezig, maar nog 0 uur productie gepland";
      dot.setAttribute("aria-label", "Geen productie gepland");
      nameLine.prepend(dot);
    }

    if (!shouldShow && existing) existing.remove();
  });

  applyProjectStatusFilter();
}

function scheduleApply(){
  if (pending) return;
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
