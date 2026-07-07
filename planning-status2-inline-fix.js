import { makeSupabaseClient } from "./auth.js";

// planning-status2-inline-fix.js
// Nieuwe aanpak: status 2 projecten gewoon in de planner tonen,
// maar onderaan plaatsen en visueel markeren. De oude onderste concepttabel wordt verwijderd.

const sb = makeSupabaseClient();
const status2ProjectIds = new Set();
let status2Loaded = false;
let busy = false;
let pending = false;

function normKey(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickKey(sample, candidates){
  const keys = Object.keys(sample || {});
  for (const wanted of candidates) {
    const exact = keys.find(k => k === wanted);
    if (exact) return exact;
    const loose = keys.find(k => normKey(k) === normKey(wanted));
    if (loose) return loose;
  }
  return "";
}

async function loadStatus2Ids(){
  if (status2Loaded) return;
  status2Loaded = true;

  const { data, error } = await sb.from("projecten").select("*").limit(10000);
  if (error) {
    console.warn("Status 2 projecten laden mislukt:", error.message || error);
    return;
  }

  const rows = data || [];
  const sample = rows[0] || {};
  const idKey = pickKey(sample, ["project_id", "id"]);
  const statusKey = pickKey(sample, ["salesstatus", "projectstatus", "project_status", "status", "status_id", "sales_status"]);
  if (!idKey || !statusKey) {
    console.warn("Status 2 projecten: id/status kolom niet gevonden", { idKey, statusKey, sample });
    return;
  }

  rows.forEach(row => {
    if (String(row?.[statusKey] ?? "").trim() === "2") {
      const id = String(row?.[idKey] ?? "").trim();
      if (id) status2ProjectIds.add(id);
    }
  });

  schedule();
}

function rowText(row){
  return String(row?.textContent || "").replace(/\s+/g, " ").trim();
}

function getProjectId(row){
  return String(row?.querySelector(".expander[data-proj]")?.dataset?.proj || "").trim();
}

function removeOldConceptRows(tbody){
  tbody.querySelectorAll("tr.concept-status2-row").forEach(row => row.remove());

  Array.from(tbody.querySelectorAll("tr")).forEach(row => {
    const txt = rowText(row).toLowerCase();
    if (
      (txt.includes("concept opdrachten") && txt.includes("status 2")) ||
      (txt.includes("nieuwe order") && txt.includes("koppelen")) ||
      txt === "capaciteit met nieuwe order"
    ) {
      row.remove();
    }
  });
}

function findCapacityStart(tbody){
  return Array.from(tbody.querySelectorAll("tr")).find(row => {
    const txt = rowText(row).toLowerCase();
    return row.classList.contains("cap-total-row") ||
      row.classList.contains("wvb-cap-total-row") ||
      txt === "capaciteit" ||
      txt.includes("uren beschikbaar");
  }) || null;
}

function addBadge(projectRow){
  const target = projectRow.querySelector(".projline2") || projectRow.querySelector(".projline1");
  if (!target || target.querySelector(".status2-badge")) return;

  const badge = document.createElement("span");
  badge.className = "status2-badge";
  badge.textContent = "Status 2";
  badge.title = "Mogelijke opdracht / status 2";
  target.appendChild(document.createTextNode(" "));
  target.appendChild(badge);
}

function stretchProjectDetails(projectRow){
  const leftCell = projectRow.querySelector("td.project-cell, td.rowhdr.sticky-left, td.sticky-left");
  if (!leftCell) return;

  leftCell.classList.add("project-details-fullheight");
  Array.from(leftCell.children || []).forEach(child => {
    child.classList.add("project-details-fullheight-child");
  });
}

function moveAndStyleStatus2Projects(){
  if (!status2ProjectIds.size) return;

  const tbody = document.querySelector(".planner-table tbody");
  if (!tbody) return;

  removeOldConceptRows(tbody);

  const insertBefore = findCapacityStart(tbody);
  if (!insertBefore) return;

  const fragment = document.createDocumentFragment();

  Array.from(tbody.querySelectorAll("tr.project-row")).forEach(projectRow => {
    stretchProjectDetails(projectRow);

    const pid = getProjectId(projectRow);
    if (!status2ProjectIds.has(pid)) return;

    projectRow.style.display = "";
    projectRow.classList.remove("planning-status-hidden");
    projectRow.classList.add("status2-project-row");
    projectRow.dataset.projectStatus = "2";
    addBadge(projectRow);

    fragment.appendChild(projectRow);

    Array.from(tbody.querySelectorAll(`tr[data-parent="${CSS.escape(pid)}"]`)).forEach(childRow => {
      childRow.style.display = "";
      childRow.classList.remove("planning-status-hidden");
      childRow.classList.add("status2-child-row");
      childRow.dataset.projectStatus = "2";
      fragment.appendChild(childRow);
    });
  });

  if (fragment.childNodes.length) tbody.insertBefore(fragment, insertBefore);
}

function ensureStyle(){
  if (document.getElementById("status2InlineFixStyle")) return;

  const style = document.createElement("style");
  style.id = "status2InlineFixStyle";
  style.textContent = `
    .status2-badge{
      display:inline-block;
      margin-left:6px;
      padding:1px 6px;
      border-radius:999px;
      border:1px solid #b45309;
      background:#fffbeb;
      color:#92400e;
      font-size:10px;
      font-weight:700;
      line-height:1.35;
      vertical-align:middle;
    }

    .planner-table tbody tr.status2-project-row > td,
    .planner-table tbody tr.status2-project-row > th{
      background-color:#fff7ed !important;
      background-image:repeating-linear-gradient(135deg, rgba(251,146,60,.22) 0, rgba(251,146,60,.22) 6px, rgba(255,247,237,.95) 6px, rgba(255,247,237,.95) 14px) !important;
    }

    .planner-table tbody tr.status2-project-row > td.project-cell,
    .planner-table tbody tr.status2-project-row > td.rowhdr{
      outline:2px solid rgba(245,158,11,.40);
      outline-offset:-2px;
    }

    .planner-table tbody tr.status2-child-row > td,
    .planner-table tbody tr.status2-child-row > th{
      background-color:#fffbeb !important;
    }

    /* Projectonderlijn niet meer dubbel/dik: gelijk aan de planninglijn rechts. */
    .planner-table tbody tr.project-row > td,
    .planner-table tbody tr.project-row > th,
    .planner-table tbody tr.project-bottomline > td,
    .planner-table tbody tr.project-bottomline > th,
    .planner-table tbody tr.project-row.project-bottomline > td,
    .planner-table tbody tr.project-row.project-bottomline > th{
      border-bottom:1px solid #626262 !important;
      box-shadow:none !important;
    }

    .planner-table tbody tr.project-row > td.project-cell,
    .planner-table tbody tr.project-row > td.rowhdr,
    .planner-table tbody tr.project-row > td.sticky-left{
      height:100% !important;
      padding-top:0 !important;
      padding-bottom:0 !important;
      vertical-align:stretch !important;
      background-clip:border-box !important;
    }

    .planner-table tbody tr.project-row > td.project-cell > *,
    .planner-table tbody tr.project-row > td.rowhdr > *,
    .planner-table tbody tr.project-row > td.sticky-left > *{
      min-height:100% !important;
      box-sizing:border-box !important;
    }

    .project-details-fullheight{
      height:100% !important;
      min-height:100% !important;
    }

    .project-details-fullheight-child{
      box-sizing:border-box !important;
    }
  `;
  document.head.appendChild(style);
}

function run(){
  if (busy) return;
  busy = true;
  try {
    ensureStyle();
    moveAndStyleStatus2Projects();
  } finally {
    busy = false;
  }
}

function schedule(){
  if (pending || busy) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    run();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  ensureStyle();
  loadStatus2Ids();
  schedule();
});
window.addEventListener("load", schedule);

const observer = new MutationObserver(schedule);
observer.observe(document.body, { childList:true, subtree:true });
