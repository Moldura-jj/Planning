// planning-collapsed-subcontracting.js
// Toont onderaanneming uit verborgen sectieregels ook op de projectregel,
// altijd op een vaste 3e regel:
// 1) normale planning
// 2) conceptplanning
// 3) onderaanneming

(() => {
  const CLONE_CLASS = "project-collapsed-subc";
  const PH_NORMAL_CLASS = "project-collapsed-ph-normal";
  const PH_CONCEPT_CLASS = "project-collapsed-ph-concept";

  function isProjectOpen(projectRow) {
    const btn = projectRow.querySelector('.expander[data-proj]');
    return btn?.textContent?.trim() === "▼";
  }

  function getProjectId(projectRow) {
    return String(projectRow.querySelector('.expander[data-proj]')?.dataset?.proj || "");
  }

  function ensureStack(projectCell) {
    let stack = projectCell.querySelector('.plan-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'plan-stack';

      const existingItems = Array.from(projectCell.children).filter(el =>
        el.classList?.contains('bar') || el.classList?.contains('marker')
      );

      existingItems.forEach(el => stack.appendChild(el));
      projectCell.appendChild(stack);
    }
    return stack;
  }

  function clearManagedItems(projectRow) {
    projectRow.querySelectorAll(
      `.${CLONE_CLASS}, .${PH_NORMAL_CLASS}, .${PH_CONCEPT_CLASS}`
    ).forEach(el => el.remove());
  }

  function isManaged(el) {
    return el.classList?.contains(CLONE_CLASS)
      || el.classList?.contains(PH_NORMAL_CLASS)
      || el.classList?.contains(PH_CONCEPT_CLASS);
  }

  function isSubc(el) {
    return !!el?.classList?.contains('bar-subc');
  }

  function isConcept(el) {
    return !!el?.classList?.contains('dummy-hatch');
  }

  function isMarker(el) {
    return !!el?.classList?.contains('marker');
  }

  function isBar(el) {
    return !!el?.classList?.contains('bar');
  }

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity) !== 0;
  }

  function isNormalLaneItem(el) {
    if (!el || isManaged(el) || !isVisible(el)) return false;
    if (isSubc(el)) return false;
    if (isConcept(el)) return false;
    return isMarker(el) || isBar(el);
  }

  function isConceptLaneItem(el) {
    if (!el || isManaged(el) || !isVisible(el)) return false;
    if (isSubc(el)) return false;
    return isConcept(el);
  }

  function makePlaceholder(cls) {
    const ph = document.createElement('div');
    ph.className = `bar placeholder ${cls}`;
    ph.setAttribute('aria-hidden', 'true');
    ph.style.pointerEvents = 'none';
    ph.style.visibility = 'hidden';
    ph.style.opacity = '0';
    return ph;
  }

  function makeSubcClone(sourceBar) {
    const clone = sourceBar.cloneNode(true);
    clone.classList.add(CLONE_CLASS);
    clone.classList.remove('subc-ph', 'placeholder');
    clone.removeAttribute('draggable');
    clone.style.pointerEvents = 'none';

    clone.style.setProperty('background', '#a955f767', 'important');
    clone.style.setProperty('background-image', 'none', 'important');
    clone.style.setProperty('color', '#0f172a', 'important');
    clone.style.setProperty('border', '1px dashed rgba(15,23,42,.35)', 'important');
    clone.style.setProperty('visibility', 'visible', 'important');
    clone.style.setProperty('opacity', '1', 'important');

    return clone;
  }

  function rebuildCell(projectCell, subcBars) {
    if (!projectCell || !subcBars?.length) return;

    const stack = ensureStack(projectCell);
    const items = Array.from(stack.children).filter(el => !isManaged(el));

    const normalItems = items.filter(isNormalLaneItem);
    const conceptItems = items.filter(el => !normalItems.includes(el) && isConceptLaneItem(el));

    stack.innerHTML = "";

    if (normalItems.length) {
      normalItems.forEach(el => stack.appendChild(el));
    } else {
      stack.appendChild(makePlaceholder(PH_NORMAL_CLASS));
    }

    if (conceptItems.length) {
      conceptItems.forEach(el => stack.appendChild(el));
    } else {
      stack.appendChild(makePlaceholder(PH_CONCEPT_CLASS));
    }

    subcBars.forEach(bar => {
      stack.appendChild(makeSubcClone(bar));
    });
  }

  function syncProject(projectRow) {
    clearManagedItems(projectRow);
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

    const subcByCellIndex = new Map();

    sectionRows.forEach(sectionRow => {
      Array.from(sectionRow.children).forEach((sectionCell, index) => {
        const subBars = Array.from(sectionCell.querySelectorAll('.bar-subc:not(.subc-ph)'));
        if (!subBars.length) return;

        if (!subcByCellIndex.has(index)) subcByCellIndex.set(index, []);
        subcByCellIndex.get(index).push(...subBars);
      });
    });

    subcByCellIndex.forEach((bars, index) => {
      rebuildCell(projectCells[index], bars);
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