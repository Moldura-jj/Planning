// planning-project-row-cleanup.js
// Verbergt de project-pijltjes links, schuift projectgegevens naar links
// en maakt de volledige projectcel klikbaar om secties te openen/sluiten.
// Geen absolute positionering meer: dat maakte de datums rommelig.

function ensureProjectRowCleanupStyle(){
  if (document.getElementById("projectRowCleanupStyle")) return;
  const style = document.createElement("style");
  style.id = "projectRowCleanupStyle";
  style.textContent = `
    tr.project-row > td.project-cell,
    tr.project-row > td.rowhdr.project-cell{
      padding:0 6px !important;
      cursor:pointer !important;
      vertical-align:middle !important;
      height:100% !important;
      min-height:44px !important;
      overflow:hidden !important;
      box-sizing:border-box !important;
      white-space:normal !important;
    }

    tr.project-row > td.project-cell .project-cell-inner{
      display:flex !important;
      align-items:stretch !important;
      justify-content:space-between !important;
      gap:8px !important;
      width:100% !important;
      height:100% !important;
      min-height:44px !important;
      box-sizing:border-box !important;
    }

    tr.project-row > td.project-cell .expander[data-proj]{
      display:none !important;
      width:0 !important;
      min-width:0 !important;
      margin:0 !important;
      padding:0 !important;
      border:0 !important;
    }

    tr.project-row > td.project-cell .projtext{
      margin:0 !important;
      padding:0 !important;
      flex:1 1 auto !important;
      min-width:0 !important;
      max-width:none !important;
      display:flex !important;
      flex-direction:column !important;
      justify-content:center !important;
      align-items:flex-start !important;
      align-self:stretch !important;
      overflow:hidden !important;
      box-sizing:border-box !important;
    }

    tr.project-row > td.project-cell .project-date-summary{
      flex:0 0 112px !important;
      width:112px !important;
      max-width:112px !important;
      display:flex !important;
      flex-direction:column !important;
      justify-content:center !important;
      align-items:flex-end !important;
      align-self:stretch !important;
      height:auto !important;
      margin:0 !important;
      padding:0 !important;
      box-sizing:border-box !important;
      overflow:hidden !important;
      text-align:right !important;
    }

    tr.project-row > td.project-cell .projline1,
    tr.project-row > td.project-cell .projline2{
      line-height:1.15 !important;
      max-width:100% !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      white-space:nowrap !important;
    }

    tr.project-row > td.project-cell .project-date-summary span{
      display:block !important;
      line-height:1.15 !important;
      max-width:100% !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      white-space:nowrap !important;
      font-size:10px !important;
    }

    tr.project-row > td.project-cell:hover{
      background-color:rgba(37,99,235,.06) !important;
    }
  `;
  document.head.appendChild(style);
}

function normalizeProjectCells(){
  document.querySelectorAll("tr.project-row > td.project-cell, tr.project-row > td.rowhdr.project-cell").forEach(cell => {
    if (cell.querySelector(":scope > .project-cell-inner")) return;

    const btn = cell.querySelector(":scope > .expander[data-proj]");
    const text = cell.querySelector(":scope > .projtext");
    const dates = cell.querySelector(":scope > .project-date-summary");
    if (!text || !dates) return;

    const wrap = document.createElement("div");
    wrap.className = "project-cell-inner";

    if (btn) wrap.appendChild(btn);
    wrap.appendChild(text);
    wrap.appendChild(dates);

    cell.prepend(wrap);
  });
}

function bindProjectRowCellClicks(){
  ensureProjectRowCleanupStyle();
  normalizeProjectCells();

  const grid = document.getElementById("plannerGrid") || document;
  if (grid.dataset.projectRowCleanupBound === "1") return;
  grid.dataset.projectRowCleanupBound = "1";

  grid.addEventListener("click", (ev) => {
    const cell = ev.target.closest("tr.project-row > td.project-cell, tr.project-row > td.rowhdr.project-cell");
    if (!cell) return;

    // Laat klikken op het project-schakelaartje volledig met rust.
    if (ev.target.closest(".project-include-toggle-wrap, .project-include-toggle, .project-include-switch, .project-include-label")) return;

    // Laat klikken op echte controls met rust.
    if (ev.target.closest("button:not(.expander), input, select, textarea, a")) return;

    const btn = cell.querySelector(".expander[data-proj]");
    if (!btn) return;

    ev.preventDefault();
    ev.stopPropagation();
    btn.click();
  }, true);
}

window.addEventListener("DOMContentLoaded", bindProjectRowCellClicks);
window.addEventListener("load", bindProjectRowCellClicks);

const projectRowCleanupObserver = new MutationObserver(() => {
  ensureProjectRowCleanupStyle();
  normalizeProjectCells();
  bindProjectRowCellClicks();
});
projectRowCleanupObserver.observe(document.body, { childList:true, subtree:true });