// planning-project-row-cleanup.js
// Verbergt de project-pijltjes links, schuift projectgegevens naar links
// en maakt de volledige projectcel klikbaar om secties te openen/sluiten.
// Projecttekst + datumvelden vullen nu de volledige hoogte van de projectregel.

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
      position:sticky !important;
      left:0 !important;
      overflow:hidden !important;
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
      position:absolute !important;
      left:6px !important;
      right:82px !important;
      top:0 !important;
      bottom:0 !important;
      margin:0 !important;
      padding:0 !important;
      display:flex !important;
      flex-direction:column !important;
      justify-content:center !important;
      align-items:flex-start !important;
      min-height:100% !important;
      max-width:none !important;
      overflow:hidden !important;
      box-sizing:border-box !important;
    }

    tr.project-row > td.project-cell .project-date-summary{
      position:absolute !important;
      top:0 !important;
      right:6px !important;
      bottom:0 !important;
      width:74px !important;
      display:flex !important;
      flex-direction:column !important;
      justify-content:center !important;
      align-items:flex-end !important;
      height:auto !important;
      margin:0 !important;
      padding:0 !important;
      box-sizing:border-box !important;
      overflow:hidden !important;
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
      line-height:1.15 !important;
      max-width:100% !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      white-space:nowrap !important;
    }

    tr.project-row > td.project-cell:hover{
      background-color:rgba(37,99,235,.06) !important;
    }
  `;
  document.head.appendChild(style);
}

function bindProjectRowCellClicks(){
  ensureProjectRowCleanupStyle();

  const grid = document.getElementById("plannerGrid") || document;
  if (grid.dataset.projectRowCleanupBound === "1") return;
  grid.dataset.projectRowCleanupBound = "1";

  grid.addEventListener("click", (ev) => {
    const cell = ev.target.closest("tr.project-row > td.project-cell, tr.project-row > td.rowhdr.project-cell");
    if (!cell) return;

    // Laat klikken op echte controls met rust.
    if (ev.target.closest("button:not(.expander), input, select, textarea, a")) return;

    // Als de verborgen expander zelf het event veroorzaakte: niet dubbel togglen.
    if (ev.target.closest(".expander[data-proj]")) return;

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
  bindProjectRowCellClicks();
});
projectRowCleanupObserver.observe(document.body, { childList:true, subtree:true });