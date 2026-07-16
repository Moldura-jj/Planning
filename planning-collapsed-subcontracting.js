// planning-collapsed-subcontracting.js
// Toont onderaanneming uit verborgen sectieregels ook op de projectregel.

(() => {
  const CLONE_CLASS = "project-collapsed-subc";
  const PLACEHOLDER_CLASS = "project-collapsed-subc-placeholder";
  const TARGET_LANE = 3; // regel 1 normaal, regel 2 concept, regel 3 onderaanneming

  function isProjectOpen(projectRow) {
    const btn = projectRow.querySelector('.expander[data-proj]');
    return btn?.textContent?.trim() === "▼";
  }

  function clearProjectClones(projectRow) {
    projectRow
      .querySelectorAll(`.${CLONE_CLASS}, .${PLACEHOLDER_CLASS}`)
      .forEach(el => el.remove());
  }

  function getProjectId(projectRow) {
    return String(projectRow.querySelector('.expander[data-proj]')?.dataset?.proj || "");
  }

  function ensureStack(projectCell) {
    let stack = projectCell.querySelector(':scope > .plan-stack');
    if (stack) return stack;

    stack = document.createElement('div');
    stack.className = 'plan-stack';

    // Eventuele losse balken en markers in dezelfde normale flow plaatsen.
    Array.from(projectCell.children)
      .filter(el => el.classList?.contains('bar') || el.classList?.contains('marker'))
      .forEach(el => stack.appendChild(el));

    projectCell.appendChild(stack);
    return stack;
  }

  function isVisibleLaneItem(el) {
    if (!el?.classList) return false;
    if (el.classList.contains(CLONE_CLASS)) return false;
    if (el.classList.contains(PLACEHOLDER_CLASS)) return false;
    if (el.classList.contains('placeholder')) return false;
    if (el.classList.contains('subc-ph')) return false;
    if (el.classList.contains('bar-subc')) return false;
    if (!el.classList.contains('bar') && !el.classList.contains('marker')) return false;

    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function ensureLaneBeforeSubcontracting(stack) {
    const existingLaneCount = Array.from(stack.children).filter(isVisibleLaneItem).length;
    const missing = Math.max(0, (TARGET_LANE - 1) - existingLaneCount);

    for (let i = 0; i < missing; i++) {
      const placeholder = document.createElement('div');
      placeholder.className = `bar placeholder ${PLACEHOLDER_CLASS}`;
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.style.pointerEvents = 'none';
      placeholder.style.visibility = 'hidden';
      stack.appendChild(placeholder);
    }
  }

  function addCloneToProjectCell(projectCell, sourceBar) {
    if (!projectCell || !sourceBar) return;

    const stack = ensureStack(projectCell);
    ensureLaneBeforeSubcontracting(stack);

    const clone = sourceBar.cloneNode(true);
    clone.classList.add(CLONE_CLASS);
    clone.classList.remove('subc-ph', 'placeholder', 'bar-start', 'bar-end');
    clone.removeAttribute('draggable');
    clone.style.pointerEvents = 'none';

    // Expliciet terug naar normale document-flow; zo kan hij nooit over
    // productie of conceptmontage heen liggen.
    clone.style.setProperty('position', 'relative', 'important');
    clone.style.removeProperty('left');
    clone.style.removeProperty('right');
    clone.style.removeProperty('bottom');
    clone.style.setProperty('width', '100%', 'important');
    clone.style.setProperty('height', '18px', 'important');
    clone.style.setProperty('line-height', '18px', 'important');
    clone.style.setProperty('margin', '0', 'important');
    clone.style.setProperty('padding', '0 3px', 'important');
    clone.style.setProperty('z-index', '1', 'important');
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

    stack.appendChild(clone);
  }

  function syncProject(projectRow) {
    clearProjectClones(projectRow);
    if (isProjectOpen(projectRow)) return;

    const pid = getProjectId(projectRow);
    if (!pid) return;

    const projectCells = Array.from(projectRow.children);
    const sectionRows = Array.from(
      document.querySelectorAll(`tr.section-row[data-parent="${CSS.escape(pid)}"]`)
    ).filter(row =>
      !row.classList.contains('productie-summary-row') &&
      !row.classList.contains('montage-summary-row')
    );

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