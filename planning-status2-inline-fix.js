import { makeSupabaseClient } from "./auth.js";

// planning-status2-inline-fix.js
// Status 2:
// - blijft in de normale plannerlogica
// - wordt onderaan geplaatst en paars gekleurd
// - status-2 herkenning is gebaseerd op projectstatus uit Supabase, niet op geplande uren
// - in status-2 secties mag alleen Concept worden ingevuld, geen medewerkers
// - wordt na elke planning-rerender opnieuw toegepast

const sb = makeSupabaseClient();
const status2ProjectIds = new Set();
const status2ProjectNumbers = new Set();
let loaded = false;
let running = false;
let status2ModalModeUntil = 0;
let applyTimer = null;
let observerPaused = false;

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

async function loadStatus2Ids(force = false){
  if (loaded && !force) return;
  loaded = true;

  const { data, error } = await sb.from("projecten").select("*").limit(10000);
  if (error) {
    console.warn("Status 2 projecten laden mislukt:", error.message || error);
    return;
  }

  const rows = data || [];
  const sample = rows[0] || {};
  const idKey = pickKey(sample, ["project_id", "id"]);
  const numberKey = pickKey(sample, ["projectnummer", "project_number", "number", "nummer", "projectnr", "project_nr"]);
  const statusKey = pickKey(sample, ["salesstatus", "projectstatus", "project_status", "status", "status_id", "sales_status"]);
  if (!statusKey) return;

  status2ProjectIds.clear();
  status2ProjectNumbers.clear();

  rows.forEach(row => {
    if (String(row?.[statusKey] ?? "").trim() === "2") {
      const id = String(row?.[idKey] ?? "").trim();
      const nr = String(row?.[numberKey] ?? "").trim();
      if (id) status2ProjectIds.add(id);
      if (nr) status2ProjectNumbers.add(nr);
    }
  });
}

function textOf(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function getProjectId(row){
  return String(row?.querySelector(".expander[data-proj]")?.dataset?.proj || row?.dataset?.projectId || row?.dataset?.proj || "").trim();
}

function getProjectNumberFromRow(row){
  const line = textOf(row?.querySelector(".projline1") || row?.querySelector(".projtext") || row);
  const m = line.match(/\b(?:PR-)?\d{5,}\b/i);
  return m ? m[0].trim() : "";
}

function isStatus2ProjectRow(row){
  const pid = getProjectId(row);
  if (pid && status2ProjectIds.has(pid)) return true;

  const nr = getProjectNumberFromRow(row);
  if (nr && status2ProjectNumbers.has(nr)) return true;

  return false;
}

function findCapacityStart(tbody){
  return Array.from(tbody.querySelectorAll("tr")).find(row => {
    const txt = textOf(row).toLowerCase();
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

    body.status2-concept-modal-active #amListWvb .assign-item:not(.assign-item-concept),
    body.status2-concept-modal-active #amListProd .assign-item:not(.assign-item-concept),
    body.status2-concept-modal-active #amListMont .assign-item:not(.assign-item-concept),
    body.status2-concept-modal-active #amListSubc{
      display:none !important;
    }

    .status2-concept-note{
      margin:6px 0 10px;
      padding:8px 10px;
      border:1px solid rgba(139,92,246,.35);
      border-radius:8px;
      background:#f5f3ff;
      color:#5b21b6;
      font-size:12px;
      font-weight:600;
    }
  `;
  document.head.appendChild(style);
}

function clearOldStatus2Classes(tbody){
  tbody.querySelectorAll("tr.status2-project-row, tr.status2-child-row").forEach(row => {
    row.classList.remove("status2-project-row", "status2-child-row");
    if (row.dataset.projectStatus === "2") delete row.dataset.projectStatus;
  });
}

async function applyStatus2PositionAndStyle({ refreshIds = false } = {}){
  if (running) return;
  running = true;
  observerPaused = true;

  try {
    ensureStyle();
    await loadStatus2Ids(refreshIds);
    if (!status2ProjectIds.size && !status2ProjectNumbers.size) return;

    const tbody = document.querySelector(".planner-table tbody");
    if (!tbody) return;

    tbody.querySelectorAll("tr.concept-status2-row").forEach(row => row.remove());

    const insertBefore = findCapacityStart(tbody);
    if (!insertBefore) return;

    clearOldStatus2Classes(tbody);

    const fragment = document.createDocumentFragment();
    let moved = false;

    Array.from(tbody.querySelectorAll("tr.project-row:not(.concept-status2-row)")).forEach(projectRow => {
      if (!isStatus2ProjectRow(projectRow)) return;

      const pid = getProjectId(projectRow);
      projectRow.classList.add("status2-project-row");
      projectRow.dataset.projectStatus = "2";
      addBadge(projectRow);
      fragment.appendChild(projectRow);
      moved = true;

      if (pid) {
        Array.from(tbody.querySelectorAll(`tr[data-parent="${CSS.escape(pid)}"]:not(.concept-status2-row)`)).forEach(childRow => {
          childRow.classList.add("status2-child-row");
          childRow.dataset.projectStatus = "2";
          fragment.appendChild(childRow);
        });
      }
    });

    if (moved) tbody.insertBefore(fragment, insertBefore);
  } finally {
    running = false;
    window.setTimeout(() => { observerPaused = false; }, 300);
  }
}

function scheduleApply(delay = 350, opts = {}){
  window.clearTimeout(applyTimer);
  applyTimer = window.setTimeout(() => applyStatus2PositionAndStyle(opts), delay);
}

function modalIsOpen(){
  const saveBtn = document.getElementById("amSave");
  return !!(saveBtn && saveBtn.offsetParent !== null);
}

function enterStatus2ConceptMode(){
  status2ModalModeUntil = Date.now() + 30000;
  document.body.classList.add("status2-concept-modal-active");
  enforceStatus2ConceptOnly();
  window.setTimeout(enforceStatus2ConceptOnly, 100);
  window.setTimeout(enforceStatus2ConceptOnly, 300);
  window.setTimeout(enforceStatus2ConceptOnly, 800);
}

function leaveStatus2ConceptMode(){
  status2ModalModeUntil = 0;
  document.body.classList.remove("status2-concept-modal-active");
  document.querySelectorAll(".status2-concept-note").forEach(n => n.remove());
}

function enforceStatus2ConceptOnly(){
  if (Date.now() > status2ModalModeUntil) {
    if (!modalIsOpen()) leaveStatus2ConceptMode();
    return;
  }

  document.body.classList.add("status2-concept-modal-active");

  const lists = ["amListWvb", "amListProd", "amListMont"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const firstList = lists[0] || document.getElementById("amListProd") || document.getElementById("amListMont");
  if (firstList && !document.querySelector(".status2-concept-note")) {
    const note = document.createElement("div");
    note.className = "status2-concept-note";
    note.textContent = "Status 2: alleen concepturen invullen. Medewerkers kunnen pas gepland worden zodra het project geen status 2 meer heeft.";
    firstList.parentElement?.insertBefore(note, firstList);
  }

  for (const list of lists) {
    list.querySelectorAll(".assign-item:not(.assign-item-concept)").forEach(row => {
      row.style.display = "none";
      row.querySelectorAll("input").forEach(inp => {
        if (inp.type === "checkbox" && inp.checked) {
          inp.checked = false;
          inp.dispatchEvent(new Event("change", { bubbles:true }));
        }
        inp.disabled = true;
      });
    });

    list.querySelectorAll(".assign-item-concept input").forEach(inp => {
      inp.disabled = false;
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleApply(250, { refreshIds:true });
  scheduleApply(1000);
  scheduleApply(2500);
});
window.addEventListener("load", () => scheduleApply(250, { refreshIds:true }));
window.addEventListener("planning:project-include-changed", () => scheduleApply(150));
window.addEventListener("planning:all-time-hours-updated", () => scheduleApply(150));

// Na een volledige tabel-rerender opnieuw toepassen, maar gedebounced.
const status2Observer = new MutationObserver((mutations) => {
  if (observerPaused || running) return;

  const relevant = mutations.some(m =>
    Array.from(m.addedNodes || []).some(n =>
      n.nodeType === 1 && (
        n.matches?.(".planner-table, tbody, tr.project-row") ||
        n.querySelector?.(".planner-table, tr.project-row")
      )
    )
  );

  if (relevant) scheduleApply(900);
});
status2Observer.observe(document.body, { childList:true, subtree:true });

// Bij status-2 sectiecellen: modal direct in concept-only zetten.
document.addEventListener("click", (ev) => {
  const status2Cell = ev.target.closest("tr.status2-child-row td.section-click, tr.status2-child-row td.section-concept-click");
  if (status2Cell) {
    enterStatus2ConceptMode();
    return;
  }

  if (ev.target.closest("#btnPrev, #btnNext")) {
    loaded = false;
    scheduleApply(900, { refreshIds:true });
    scheduleApply(1800, { refreshIds:true });
  }

  if (ev.target.closest("#amSave")) {
    loaded = false;
    scheduleApply(1000, { refreshIds:true });
    scheduleApply(2200, { refreshIds:true });
    scheduleApply(4000, { refreshIds:true });
    leaveStatus2ConceptMode();
  }

  if (ev.target.closest("#amCancel, #amClose, .modal-backdrop")) {
    leaveStatus2ConceptMode();
  }
}, true);

// Korte, lichte controle zolang het status-2 modal open is.
window.setInterval(() => {
  if (Date.now() <= status2ModalModeUntil) enforceStatus2ConceptOnly();
}, 500);
