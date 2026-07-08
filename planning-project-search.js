// planning-project-search.js
// Zoekveld bovenin de capaciteitsplanning.
// Typ projectnummer, klantnaam of projectnaam: gevonden projectregels krijgen een highlight.

let projectSearchPending = false;

function normalizeSearchText(value){
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ensureProjectSearchStyle(){
  if (document.getElementById("planningProjectSearchStyle")) return;

  const style = document.createElement("style");
  style.id = "planningProjectSearchStyle";
  style.textContent = `
    .planning-project-search-wrap{
      display:flex;
      align-items:center;
      gap:6px;
      margin-left:8px;
      white-space:nowrap;
    }

    .planning-project-search-input{
      width:220px;
      height:32px;
      padding:6px 10px;
      border:1px solid #cbd5e1;
      border-radius:8px;
      background:#fff;
      color:#0f172a;
      font-size:13px;
      outline:none;
    }

    .planning-project-search-input:focus{
      border-color:#2563eb;
      box-shadow:0 0 0 3px rgba(37,99,235,.12);
    }

    .planning-project-search-count{
      min-width:54px;
      color:#64748b;
      font-size:11px;
    }

    .planner-table tbody tr.project-search-hit > td,
    .planner-table tbody tr.project-search-hit > th{
      background-color:#fff3bf !important;
      background-image:none !important;
      box-shadow:inset 0 0 0 2px rgba(245,158,11,.55) !important;
    }

    .planner-table tbody tr.project-search-hit > td.project-cell,
    .planner-table tbody tr.project-search-hit > td.rowhdr{
      background-color:#ffe8a3 !important;
    }

    .planner-table tbody tr.project-search-hit.status2-project-row > td,
    .planner-table tbody tr.project-search-hit.status2-project-row > th{
      background-color:#f5d0fe !important;
      box-shadow:inset 0 0 0 2px rgba(168,85,247,.55) !important;
    }

    @media (max-width: 900px){
      .planning-project-search-input{ width:150px; }
      .planning-project-search-count{ display:none; }
    }
  `;
  document.head.appendChild(style);
}

function getSearchInput(){
  return document.getElementById("planningProjectSearchInput");
}

function projectRowSearchText(row){
  const parts = [];
  parts.push(row.textContent || "");

  const proj = row.querySelector(".expander[data-proj]")?.dataset?.proj;
  if (proj) parts.push(proj);

  const projText = row.querySelector(".projtext, .projline1, .projline2, td.project-cell, td.rowhdr");
  if (projText) parts.push(projText.textContent || "");

  return normalizeSearchText(parts.join(" "));
}

function applyProjectSearch(){
  const input = getSearchInput();
  if (!input) return;

  const query = normalizeSearchText(input.value);
  const terms = query.split(/\s+/).filter(Boolean);
  let count = 0;

  document.querySelectorAll("tr.project-row").forEach(row => {
    const searchable = projectRowSearchText(row);
    const hit = terms.length > 0 && terms.every(t => searchable.includes(t));
    row.classList.toggle("project-search-hit", hit);
    if (hit) count++;
  });

  const countEl = document.getElementById("planningProjectSearchCount");
  if (countEl) {
    countEl.textContent = terms.length ? `${count} gevonden` : "";
  }
}

function scheduleProjectSearch(){
  if (projectSearchPending) return;
  projectSearchPending = true;
  requestAnimationFrame(() => {
    projectSearchPending = false;
    applyProjectSearch();
  });
}

function clearProjectSearch(){
  const input = getSearchInput();
  if (!input) return;
  input.value = "";
  applyProjectSearch();
}

function insertProjectSearchBox(){
  if (getSearchInput()) return;

  ensureProjectSearchStyle();

  const host = document.querySelector(".planning-topbar-period") || document.querySelector("#week-nav") || document.querySelector(".topbar-left");
  if (!host) return;

  const wrap = document.createElement("div");
  wrap.className = "planning-project-search-wrap";
  wrap.innerHTML = `
    <input id="planningProjectSearchInput" class="planning-project-search-input" type="search" placeholder="Zoek project..." autocomplete="off" />
    <span id="planningProjectSearchCount" class="planning-project-search-count"></span>
  `;

  host.appendChild(wrap);

  const input = getSearchInput();
  input.addEventListener("input", scheduleProjectSearch);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") clearProjectSearch();
  });
}

function initProjectSearch(){
  insertProjectSearchBox();
  scheduleProjectSearch();
}

window.addEventListener("DOMContentLoaded", () => setTimeout(initProjectSearch, 300));
window.addEventListener("load", () => setTimeout(initProjectSearch, 300));

const projectSearchObserver = new MutationObserver(() => {
  insertProjectSearchBox();
  scheduleProjectSearch();
});
projectSearchObserver.observe(document.body, { childList:true, subtree:true });
