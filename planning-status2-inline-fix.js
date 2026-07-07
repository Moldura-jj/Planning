import { makeSupabaseClient } from "./auth.js";

// planning-status2-inline-fix.js
// Niet-invasief: alleen status-2 projectgroepen onderaan zetten en paars kleuren.
// Geen MutationObserver en geen klikhandlers, zodat de normale plannerlogica blijft werken.

const sb = makeSupabaseClient();
const status2ProjectIds = new Set();
let loaded = false;
let running = false;

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
  if (loaded) return;
  loaded = true;

  const { data, error } = await sb.from("projecten").select("*").limit(10000);
  if (error) {
    console.warn("Status 2 projecten laden mislukt:", error.message || error);
    return;
  }

  const rows = data || [];
  const sample = rows[0] || {};
  const idKey = pickKey(sample, ["project_id", "id"]);
  const statusKey = pickKey(sample, ["salesstatus", "projectstatus", "project_status", "status", "status_id", "sales_status"]);
  if (!idKey || !statusKey) return;

  rows.forEach(row => {
    if (String(row?.[statusKey] ?? "").trim() === "2") {
      const id = String(row?.[idKey] ?? "").trim();
      if (id) status2ProjectIds.add(id);
    }
  });
}

function getProjectId(row){
  return String(row?.querySelector(".expander[data-proj]")?.dataset?.proj || "").trim();
}

function findCapacityStart(tbody){
  return Array.from(tbody.querySelectorAll("tr")).find(row => {
    const txt = String(row.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
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
      border:1px solid #8b5cf6;
      background:#f5f3ff;
      color:#5b21b6;
      font-size:10px;
      font-weight:700;
      line-height:1.35;
      vertical-align:middle;
    }

    .planner-table tbody tr.status2-project-row > td,
    .planner-table tbody tr.status2-project-row > th{
      background-color:#f5f3ff !important;
      background-image:none !important;
    }

    .planner-table tbody tr.status2-project-row > td.project-cell,
    .planner-table tbody tr.status2-project-row > td.rowhdr{
      outline:1px solid rgba(139,92,246,.45);
      outline-offset:-1px;
    }

    .planner-table tbody tr.status2-child-row > td,
    .planner-table tbody tr.status2-child-row > th{
      background-color:#faf5ff !important;
      background-image:none !important;
    }

    .planner-table tbody tr.project-row > td,
    .planner-table tbody tr.project-row > th,
    .planner-table tbody tr.project-topline > td,
    .planner-table tbody tr.project-topline > th,
    .planner-table tbody tr.project-bottomline > td,
    .planner-table tbody tr.project-bottomline > th,
    .planner-table tbody tr.project-row.project-bottomline > td,
    .planner-table tbody tr.project-row.project-bottomline > th{
      border-top:1px solid #d7dde7 !important;
      border-bottom:1px solid #d7dde7 !important;
      box-shadow:none !important;
    }
  `;
  document.head.appendChild(style);
}

async function applyStatus2PositionAndStyle(){
  if (running) return;
  running = true;
  try {
    ensureStyle();
    await loadStatus2Ids();
    if (!status2ProjectIds.size) return;

    const tbody = document.querySelector(".planner-table tbody");
    if (!tbody) return;

    // Oude conceptblok-rijen opruimen, maar verder geen normale plannerlogica aanpassen.
    tbody.querySelectorAll("tr.concept-status2-row").forEach(row => row.remove());

    const insertBefore = findCapacityStart(tbody);
    if (!insertBefore) return;

    const fragment = document.createDocumentFragment();

    Array.from(tbody.querySelectorAll("tr.project-row:not(.concept-status2-row)")).forEach(projectRow => {
      const pid = getProjectId(projectRow);
      if (!status2ProjectIds.has(pid)) return;

      projectRow.classList.add("status2-project-row");
      projectRow.dataset.projectStatus = "2";
      addBadge(projectRow);
      fragment.appendChild(projectRow);

      Array.from(tbody.querySelectorAll(`tr[data-parent="${CSS.escape(pid)}"]:not(.concept-status2-row)`)).forEach(childRow => {
        childRow.classList.add("status2-child-row");
        childRow.dataset.projectStatus = "2";
        fragment.appendChild(childRow);
      });
    });

    if (fragment.childNodes.length) tbody.insertBefore(fragment, insertBefore);
  } finally {
    running = false;
  }
}

function scheduleApply(delay = 350){
  window.setTimeout(applyStatus2PositionAndStyle, delay);
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleApply(250);
  scheduleApply(1000);
});
window.addEventListener("load", () => scheduleApply(250));

// Na maandwissel opnieuw toepassen, maar alleen éénmalig na de klik.
document.addEventListener("click", (ev) => {
  if (ev.target.closest("#btnPrev, #btnNext")) {
    scheduleApply(700);
    scheduleApply(1500);
  }
});
