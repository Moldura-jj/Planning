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

    // De paarse balk wordt los van de bestaande plan-stack geplaatst.
    // Daardoor staat hij in iedere projectcel exact op dezelfde verticale positie,
    // ongeacht productie, montage, markers of verborgen placeholders.
    projectCell.style.position = 'relative';

    const cloneIndex = projectCell.querySelectorAll(`.${CLONE_CLASS}`).length;
    const clone = sourceBar.cloneNode(true);
    clone.classList.add(CLONE_CLASS);
    clone.classList.remove('subc-ph', 'placeholder', 'bar-start', 'bar-end');
    clone.removeAttribute('draggable');
    clone.style.pointerEvents = 'none';

    clone.style.setProperty('position', 'absolute', 'important');
    clone.style.setProperty('left', '0', 'important');
    clone.style.setProperty('right', '0', 'important');
    clone.style.setProperty('bottom', `${cloneIndex * 18}px`, 'important');
    clone.style.setProperty('width', '100%', 'important');
    clone.style.setProperty('height', '18px', 'important');
    clone.style.setProperty('line-height', '18px', 'important');
    clone.style.setProperty('margin', '0', 'important');
    clone.style.setProperty('padding', '0 3px', 'important');
    clone.style.setProperty('z-index', '8', 'important');
    clone.style.setProperty('background', '#a955f767', 'important');
    clone.style.setProperty('background-image', 'none', 'important');
    clone.style.setProperty('color', '#0f172a', 'important');
    clone.style.setProperty('border', '1px dashed rgba(15,23,42,.35)', 'important');
    clone.style.setProperty('border-radius', '6px', 'important');
    clone.style.setProperty('visibility', 'visible', 'important');
    clone.style.setProperty('opacity', '1', 'important');
    clone.style.setProperty('overflow', 'hidden', 'important');
    clone.style.setProperty('white-space', 'nowrap', 'important');
    clone.style.setProperty('text-overflow', 'ellipsis', 'important');

    projectCell.appendChild(clone);
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