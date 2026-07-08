// planning-project-include-toggle.js
// Project-schakelaar: project wel/niet meenemen in de planningweergave.
// Uren worden NIET verwijderd; alleen de projectstand wordt lokaal bewaard.
// Standaard: normale projecten aan, status 2 projecten uit.

const PROJECT_INCLUDE_KEY = "moldura_project_include_planning_v1";
let projectIncludePending = false;

function readProjectIncludeMap(){
  try { return JSON.parse(localStorage.getItem(PROJECT_INCLUDE_KEY) || "{}"); }
  catch { return {}; }
}

function writeProjectIncludeMap(map){
  localStorage.setItem(PROJECT_INCLUDE_KEY, JSON.stringify(map || {}));
}

function textOf(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function cssEsc(v){
  if (window.CSS && CSS.escape) return CSS.escape(String(v));
  return String(v).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function projectIdFromRow(row){
  return String(row?.querySelector(".expander[data-proj]")?.dataset?.proj || "").trim();
}

function isStatus2ProjectRow(row){
  const txt = textOf(row).toLowerCase();
  return row?.classList?.contains("status2-project-row") || /status\s*2/.test(txt);
}

function defaultIncludedForRow(row){
  return !isStatus2ProjectRow(row);
}

function isProjectIncluded(pid, row){
  const map = readProjectIncludeMap();
  if (Object.prototype.hasOwnProperty.call(map, String(pid))) return !!map[String(pid)];
  return defaultIncludedForRow(row);
}

window.__projectPlanningIncluded = function(pid){
  const row = document.querySelector(`tr.project-row .expander[data-proj="${cssEsc(pid)}"]`)?.closest("tr.project-row");
  return isProjectIncluded(pid, row);
};

function ensureStyle(){
  if (document.getElementById("projectIncludeToggleStyle")) return;
  const style = document.createElement("style");
  style.id = "projectIncludeToggleStyle";
  style.textContent = `
    .project-include-toggle-wrap{
      margin-top:3px;
      display:flex;
      align-items:center;
      gap:5px;
      font-size:10px;
      color:#64748b;
      line-height:1;
      user-select:none;
    }
    .project-include-toggle-wrap input{
      position:absolute;
      opacity:0;
      pointer-events:none;
    }
    .project-include-switch{
      width:26px;
      height:14px;
      border-radius:999px;
      background:#cbd5e1;
      position:relative;
      flex:0 0 auto;
      box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);
    }
    .project-include-switch::after{
      content:"";
      position:absolute;
      top:2px;
      left:2px;
      width:10px;
      height:10px;
      border-radius:50%;
      background:#fff;
      box-shadow:0 1px 2px rgba(15,23,42,.25);
      transition:left .12s ease;
    }
    .project-include-toggle-wrap input:checked + .project-include-switch{
      background:#22c55e;
    }
    .project-include-toggle-wrap input:checked + .project-include-switch::after{
      left:14px;
    }
    .project-include-label{
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    tr.project-planning-disabled > td.project-cell{
      background:#f8fafc !important;
      color:#64748b !important;
    }
    tr.project-planning-disabled .projline1,
    tr.project-planning-disabled .projline2,
    tr.project-planning-disabled .project-date-summary{
      opacity:.62;
    }
    tr.project-planning-disabled .project-include-label{
      color:#ef4444;
      font-weight:700;
    }
    tr.project-planning-disabled-row > td:not(.project-cell):not(.hourscol),
    tr.project-planning-disabled-row .cell:not(.hourscol){
      opacity:.28;
      filter:grayscale(1);
    }
    tr.project-planning-disabled-row .assign-chip,
    tr.project-planning-disabled-row .cap-cell-fillbar,
    tr.project-planning-disabled-row .bar,
    tr.project-planning-disabled-row [class*="assign"],
    tr.project-planning-disabled-row [class*="block"]{
      opacity:.35 !important;
      filter:grayscale(1) !important;
    }
  `;
  document.head.appendChild(style);
}

function ensureToggleForRow(row){
  const pid = projectIdFromRow(row);
  if (!pid) return;

  const textBox = row.querySelector(".projtext");
  if (!textBox) return;

  let wrap = textBox.querySelector(".project-include-toggle-wrap");
  if (!wrap) {
    wrap = document.createElement("label");
    wrap.className = "project-include-toggle-wrap";
    wrap.title = "Project wel/niet meenemen in de planning. Uren blijven bewaard.";
    wrap.innerHTML = `
      <input type="checkbox" class="project-include-toggle" />
      <span class="project-include-switch" aria-hidden="true"></span>
      <span class="project-include-label"></span>
    `;
    textBox.appendChild(wrap);

    wrap.addEventListener("click", (ev) => {
      ev.stopPropagation();
    }, true);

    wrap.querySelector("input")?.addEventListener("change", (ev) => {
      const map = readProjectIncludeMap();
      map[pid] = !!ev.target.checked;
      writeProjectIncludeMap(map);
      applyProjectIncludeState();
      window.dispatchEvent(new CustomEvent("planning:project-include-changed", { detail:{ projectId:pid, included:!!ev.target.checked } }));
    });
  }

  const input = wrap.querySelector("input");
  const label = wrap.querySelector(".project-include-label");
  const included = isProjectIncluded(pid, row);
  if (input) input.checked = included;
  if (label) label.textContent = included ? "planning aan" : "planning uit";
}

function markRowsForProject(pid, included){
  const projectRow = document.querySelector(`tr.project-row .expander[data-proj="${cssEsc(pid)}"]`)?.closest("tr.project-row");
  if (projectRow) {
    projectRow.classList.toggle("project-planning-disabled", !included);
    projectRow.dataset.planningIncluded = included ? "1" : "0";
  }

  document.querySelectorAll(`tr.section-row[data-parent="${cssEsc(pid)}"]`).forEach(row => {
    row.classList.toggle("project-planning-disabled-row", !included);
    row.dataset.planningIncluded = included ? "1" : "0";
  });
}

function applyProjectIncludeState(){
  ensureStyle();
  document.querySelectorAll("tr.project-row").forEach(row => {
    const pid = projectIdFromRow(row);
    if (!pid) return;
    ensureToggleForRow(row);
    markRowsForProject(pid, isProjectIncluded(pid, row));
  });
}

function scheduleApply(delay = 100){
  if (projectIncludePending) return;
  projectIncludePending = true;
  window.setTimeout(() => {
    projectIncludePending = false;
    applyProjectIncludeState();
  }, delay);
}

window.addEventListener("DOMContentLoaded", () => scheduleApply(500));
window.addEventListener("load", () => scheduleApply(500));
window.addEventListener("planning:all-time-hours-updated", () => scheduleApply(50));

const observer = new MutationObserver(() => scheduleApply(250));
observer.observe(document.body, { childList:true, subtree:true });
