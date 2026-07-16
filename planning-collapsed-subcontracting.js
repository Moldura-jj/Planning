// planning-collapsed-subcontracting.js
// Toont onderaanneming uit verborgen sectieregels ook op de projectregel.
// De ingeklapte projectregel gebruikt een compacte vaste indeling:
// 1) normale planning
// 2) conceptplanning
// 3) onderaanneming

(() => {
  const CLONE_CLASS = "project-collapsed-subc";
  const PH_NORMAL_CLASS = "project-collapsed-ph-normal";
  const PH_CONCEPT_CLASS = "project-collapsed-ph-concept";
  const CELL_CLASS = "project-collapsed-lanes";

  function ensureStyle() {
    if (document.getElementById("projectCollapsedLanesStyle")) return;

    const style = document.createElement("style");
    style.id = "projectCollapsedLanesStyle";
    style.textContent = `
      tr.project-row td.${CELL_CLASS} > .plan-stack {
        gap: 1px !important;
        padding: 1px 0 !important;
      }

      tr.project-row td.${CELL_CLASS} > .plan-stack > .bar,
      tr.project-row td.${CELL_CLASS} > .plan-stack > .marker {
        height: 15px !important;
        min-height: 15px !important;
        line-height: 15px !important;
        margin: 0 !important;
        padding: 0 2px !important;
        border-radius: 4px !important;
        font-size: 9px !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }

      tr.project-row td.${CELL_CLASS} .${CLONE_CLASS} {
        background: rgba(168, 85, 247, .38) !important;
        background-image: none !important;
        color: #312e81 !important;
        border: 1px solid rgba(126, 34, 206, .48) !important;
        font-weight: 500 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isProjectOpen(projectRow) {
    const btn = projectRow.querySelector('.expander[data-proj]');
    return btn?.textContent?.trim() === "▼";
  }

  function getProjectId(projectRow) {
    return String(projectRow.querySelector('.expander[data-proj]')?.dataset?.proj || "");
  }

  function ensureStack(projectCell) {
    let stack = projectCell.querySelector(':scope > .plan-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'plan-stack';

      Array.from(projectCell.children)
        .filter(el => el.classList?.contains('bar') || el.classList?.contains('marker'))
        .forEach(el => stack.appendChild(el));

      projectCell.appendChild(stack);
    }
    return stack;
  }

  function clearManagedItems(projectRow) {
    projectRow.querySelectorAll(
      `.${CLONE_CLASS}, .${PH_NORMAL_CLASS}, .${PH_CONCEPT_CLASS}`
    ).forEach(el => el.remove());

    projectRow.querySelectorAll(`td.${CELL_CLASS}`).forEach(cell => {
      cell.classList.remove(CELL_CLASS);
    });
  }

  function isManaged(el) {
    return el.classList?.contains(CLONE_CLASS)
      || el.classList?.contains(PH_NORMAL_CLASS)
      || el.classList?.contains(PH_CONCEPT_CLASS);
  }

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity) !== 0;
  }

  function isSubcontracting(el) {
    return !!el?.classList?.contains('bar-subc');
  }

  function isConcept(el) {
    return !!el?.classList?.contains('dummy-hatch');
  }

  function isNormalLaneItem(el) {
    if (!el || isManaged(el) || !isVisible(el)) return false;
    if (isSubcontracting(el) || isConcept(el)) return false;
    return el.classList.contains('bar') || el.classList.contains('marker');
  }

  function isConceptLaneItem(el) {
    if (!el || isManaged(el) || !isVisible(el)) return false;
    if (isSubcontracting(el)) return false;
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

  function makeSubcontractingClone(sourceBars) {
    const first = sourceBars[0];
    const clone = first.cloneNode(true);
    clone.classList.add(CLONE_CLASS);
    clone.classList.remove('subc-ph', 'placeholder', 'bar-start', 'bar-end');
    clone.removeAttribute('draggable');
    clone.style.pointerEvents = 'none';

    // Meerdere onderaannemingen op dezelfde dag compact in één balk tonen.
    const labels = sourceBars
      .map(bar => String(bar.textContent || '').trim())
      .filter(Boolean);
    const uniqueLabels = [...new Set(labels)];

    if (uniqueLabels.length > 1) {
      clone.textContent = uniqueLabels.join(' + ');
      clone.title = uniqueLabels.join('\n');
    }

    return clone;
  }

  function rebuildCell(projectCell, subcBars) {
    if (!projectCell || !subcBars?.length) return;

    projectCell.classList.add(CELL_CLASS);
    const stack = ensureStack(projectCell);
    const items = Array.from(stack.children).filter(el => !isManaged(el));

    const normalItems = items.filter(isNormalLaneItem);
    const conceptItems = items.filter(el => !normalItems.includes(el) && isConceptLaneItem(el));

    stack.innerHTML = "";

    if (normalItems.length) normalItems.forEach(el => stack.appendChild(el));
    else stack.appendChild(makePlaceholder(PH_NORMAL_CLASS));

    if (conceptItems.length) conceptItems.forEach(el => stack.appendChild(el));
    else stack.appendChild(makePlaceholder(PH_CONCEPT_CLASS));

    stack.appendChild(makeSubcontractingClone(subcBars));
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

    subcByCellIndex.forEach((bars, index) => rebuildCell(projectCells[index], bars));
  }

  function syncAll() {
    ensureStyle();
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