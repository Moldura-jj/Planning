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
  document.getElementById("projectIncludeToggleStyle")?.remove();

  const style = document.createElement("style");
  style.id = "projectIncludeToggleStyle";
  style.textContent = `
    .project-include-toggle-wrap{
      margin-top:4px !important;
      display:flex !important;
      align-items:center !important;
      gap:6px !important;
      font-size:10px !important;
      color:#64748b !important;
      line-height:1 !important;
      user-select:none !important;
      cursor:pointer !important;
      position:relative !important;
      z-index:5 !important;
    }
    .project-include-toggle-wrap input.project-include-toggle{
      display:none !important;
      appearance:none !important;
      -webkit-appearance:none !important;
      opacity:0 !important;
      width:0 !important;
      height:0 !important;
      margin:0 !important;
      padding:0 !important;
      border:0 !important;
      pointer-events:none !important;
    }
    .project-include-switch{
      width:38px !important;
      height:22px !important;
      border-radius:999px !important;
      background:#fb7185 !important;
      position:relative !important;
      flex:0 0 auto !important;
      box-shadow:inset 0 0 0 1px rgba(15,23,42,.14), 0 1px 2px rgba(15,23,42,.12) !important;
      transition:background .15s ease, box-shadow .15s ease !important;
      pointer-events:none !important;
      display:inline-block !important;
      box-sizing:border-box !important;
    }
    .project-include-switch::after{
      content:"" !important;
      position:absolute !important;
      top:2px !important;
      left:2px !important;
      width:18px !important;
      height:18px !important;
      border-radius:50% !important;
      background:#fff !important;
      box-shadow:0 1px 3px rgba(15,23,42,.28) !important;
      transition:left .15s ease !important;
    }
    .project-include-toggle-wrap.is-on .project-include-switch,
    .project-include-toggle-wrap input:checked + .project-include-switch{
      background:#22c55e !important;
    }
    .project-include-toggle-wrap.is-on .project-include-switch::after,
    .project-include-toggle-wrap input:checked + .project-include-switch::after{
      left:18px !important;
    }
    .project-include-toggle-wrap.is-off .project-include-switch{
      background:#fb7185 !important;
    }
    .project-include-toggle-wrap.is-off .project-include-switch::after{
      left:2px !important;
    }
    .project-include-toggle-wrap:hover .project-include-switch{
      box-shadow:inset 0 0 0 1px rgba(15,23,42,.18), 0 1px 4px rgba(15,23,42,.18) !important;
    }
    .project-include-label{
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      pointer-events:none !important;
    }
    tr.project-planning-disabled > td.project-cell{
      background:#f8fafc !important;
      color:#64748b !important;
    }
    tr.project-planning-disabled .projline1,
    tr.project-planning-disabled .projline2,
    tr.project-planning-disabled .project-date-summary{
      opacity:.62 !important;
    }
    tr.project-planning-disabled .project-include-label{
      color:#ef4444 !important;
      font-weight:700 !important;
    }
    tr.project-planning-disabled-row > td:not(.project-cell):not(.hourscol),
    tr.project-planning-disabled-row .cell:not(.hourscol){
      opacity:.28 !important;
      filter:grayscale(1) !important;
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

function applyInlineSwitchStyles(wrap, included){
  if (!wrap) return;
  const input = wrap.querySelector("input.project-include-toggle");
  const sw = wrap.querySelector(".project-include-switch");

  if (input) {
    input.style.setProperty("display", "none", "important");
    input.style.setProperty("appearance", "none", "important");
    input.style.setProperty("-webkit-appearance", "none", "important");
    input.style.setProperty("opacity", "0", "important");
    input.style.setProperty("width", "0", "important");
    input.style.setProperty("height", "0", "important");
    input.style.setProperty("margin", "0", "important");
    input.style.setProperty("padding", "0", "important");
    input.style.setProperty("border", "0", "important");
  }

  if (sw) {
    sw.style.setProperty("width", "38px", "important");
    sw.style.setProperty("height", "22px", "important");
    sw.style.setProperty("border-radius", "999px", "important");
    sw.style.setProperty("background", included ? "#22c55e" : "#fb7185", "important");
    sw.style.setProperty("position", "relative", "important");
    sw.style.setProperty("display", "inline-block", "important");
    sw.style.setProperty("flex", "0 0 auto", "important");
    sw.style.setProperty("box-shadow", "inset 0 0 0 1px rgba(15,23,42,.14), 0 1px 2px rgba(15,23,42,.12)", "important");
    sw.style.setProperty("pointer-events", "none", "important");
  }
}

function setProjectIncluded(pid, included){
  const map = readProjectIncludeMap();
  map[String(pid)] = !!included;
  writeProjectIncludeMap(map);
  applyProjectIncludeState();

  window.dispatchEvent(new CustomEvent("planning:project-include-changed", {
    detail:{ projectId:String(pid), included:!!included }
  }));

  if (typeof window.__applyProjectIncludeCapacity === "function") {
    window.__applyProjectIncludeCapacity(true);
  }
}

function ensureToggleForRow(row){
  const pid = projectIdFromRow(row);
  if (!pid) return;

  const textBox = row.querySelector(".projtext");
  if (!textBox) return;

  let wrap = textBox.querySelector(".project-include-toggle-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "project-include-toggle-wrap";
    wrap.title = "Project wel/niet meenemen in de capaciteit. Uren blijven bewaard.";
    wrap.innerHTML = `
      <input type="checkbox" class="project-include-toggle" tabindex="-1" />
      <span class="project-include-switch" aria-hidden="true"></span>
      <span class="project-include-label"></span>
    `;
    textBox.appendChild(wrap);

    wrap.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const input = wrap.querySelector("input");
      const current = !!input?.checked;
      setProjectIncluded(pid, !current);
    }, true);
  } else {
    // Herstel bestaande oude markup eventueel.
    if (!wrap.querySelector(".project-include-switch")) {
      const input = wrap.querySelector("input.project-include-toggle") || document.createElement("input");
      input.type = "checkbox";
      input.className = "project-include-toggle";
      input.tabIndex = -1;
      const label = wrap.querySelector(".project-include-label") || document.createElement("span");
      label.className = "project-include-label";
      wrap.innerHTML = "";
      wrap.appendChild(input);
      const sw = document.createElement("span");
      sw.className = "project-include-switch";
      sw.setAttribute("aria-hidden", "true");
      wrap.appendChild(sw);
      wrap.appendChild(label);
    }
  }

  const input = wrap.querySelector("input");
  const label = wrap.querySelector(".project-include-label");
  const included = isProjectIncluded(pid, row);
  wrap.classList.toggle("is-on", included);
  wrap.classList.toggle("is-off", !included);
  if (input) input.checked = included;
  if (label) label.textContent = included ? "planning aan" : "planning uit";
  applyInlineSwitchStyles(wrap, included);
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