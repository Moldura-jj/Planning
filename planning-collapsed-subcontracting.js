// planning-collapsed-subcontracting.js
// Toont onderaanneming uit verborgen sectieregels ook op de projectregel.

(() => {
  const CLONE_CLASS = "project-collapsed-subc";

  function isProjectOpen(projectRow) {
    const btn = projectRow.querySelector('.expander[data-proj]');
    return btn?.textContent?.trim() === "▼";
  }

  function clearProjectClones(projectRow) {
    projectRow.querySelectorAll(`.${CLONE_CLASS}`).forEach(el => el.remove());
  }

  function getProjectId(projectRow) {
    return String(projectRow.querySelector('.expander[data-proj]')?.dataset?.proj || "");
  }

  function addCloneToProjectCell(projectCell, sourceBar) {
    if (!projectCell || !sourceBar) return;

    let stack = projectCell.querySelector('.plan-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'plan-stack';

      // Bestaande losse balken eerst in dezelfde stack plaatsen.
      const existingBars = Array.from(projectCell.children).filter(el => el.classList?.contains('bar'));
      existingBars.forEach(el => stack.appendChild(el));
      projectCell.appendChild(stack);
    }

    const clone = sourceBar.cloneNode(true);
    clone.classList.add(CLONE_CLASS);
    clone.removeAttribute('draggable');
    clone.style.pointerEvents = 'none';

    // De projectcel kan zelf de klasse bar-prod/bar-mont hebben. Die regels
    // overschrijven anders de paarse kleur van onderaanneming met groen/geel.
    clone.style.setProperty('background', '#a955f767', 'important');
    clone.style.setProperty('background-image', 'none', 'important');
    clone.style.setProperty('color', '#0f172a', 'important');
    clone.style.setProperty('border', '1px dashed rgba(15,23,42,.35)', 'important');
    clone.style.setProperty('visibility', 'visible', 'important');
    clone.style.setProperty('opacity', '1', 'important');

    stack.appendChild(clone);
  }

  function syncProject(projectRow) {
    clearProjectClones(projectRow);
    if (isProjectOpen(projectRow)) return;

    const pid = getProjectId(projectRow);
    if (!pid) return;

    const projectCells = Array.from(projectRow.children);
    const sectionRows = Array.from(document.querySelectorAll(`tr.section-row[data-parent="${CSS.escape(pid)}"]`))
      .filter(row => !row.classList.contains('productie-summary-row') && !row.classList.contains('montage-summary-row'));

    sectionRows.forEach(sectionRow => {
      Array.from(sectionRow.children).forEach((sectionCell, index) => {
        const subBars = sectionCell.querySelectorAll('.bar-subc:not(.subc-ph)');
        subBars.forEach(bar => addCloneToProjectCell(projectCells[index], bar));
      });
    });
  }

  function syncAll() {
    document.querySelectorAll('tr.project-row').forEach(syncProject);
  }

  let pending = false;
  function scheduleSync() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      syncAll();
    });
  }

  document.addEventListener('click', event => {
    if (event.target.closest('.expander[data-proj], tr.project-row, #btnCollapseProjects')) {
      setTimeout(scheduleSync, 0);
    }
  }, true);

  window.addEventListener('DOMContentLoaded', scheduleSync);
  window.addEventListener('load', scheduleSync);
  setTimeout(scheduleSync, 500);
  setTimeout(scheduleSync, 1500);

  new MutationObserver(scheduleSync).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();