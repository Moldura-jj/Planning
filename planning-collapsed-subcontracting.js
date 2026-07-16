// planning-collapsed-subcontracting.js
// Toont onderaanneming uit verborgen sectieregels ook op de projectregel.
// Onderaanneming krijgt een eigen gereserveerde regel onder de bestaande planning,
// zodat productie, montage en conceptblokken nooit worden bedekt of verborgen.

(() => {
  const CLONE_CLASS = "project-collapsed-subc";
  const CELL_CLASS = "project-collapsed-subc-cell";
  const ROW_CLASS = "project-collapsed-subc-row";

  function ensureStyle() {
    if (document.getElementById("projectCollapsedSubcStyle")) return;

    const style = document.createElement("style");
    style.id = "projectCollapsedSubcStyle";
    style.textContent = `
      tr.project-row.${ROW_CLASS} > td.plan-cell {
        min-height: 34px !important;
      }

      tr.project-row td.${CELL_CLASS} {
        position: relative !important;
        padding-bottom: 16px !important;
      }

      tr.project-row td.${CELL_CLASS} > .${CLONE_CLASS} {
        position: absolute !important;
        left: 1px !important;
        right: 1px !important;
        bottom: 1px !important;
        width: auto !important;
        height: 14px !important;
        min-height: 14px !important;
        line-height: 12px !important;
        margin: 0 !important;
        padding: 0 2px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
        text-align: center !important;
        font-size: 9px !important;
        font-weight: 500 !important;
        border-radius: 4px !important;
        background: rgba(168, 85, 247, .42) !important;
        background-image: none !important;
        color: #312e81 !important;
        border: 1px solid rgba(126, 34, 206, .52) !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 20 !important;
        pointer-events: none !important;
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

  function clearManaged(projectRow) {
    projectRow.querySelectorAll(`.${CLONE_CLASS}`).forEach(el => el.remove());
    projectRow.querySelectorAll(`td.${CELL_CLASS}`).forEach(cell => {
      cell.classList.remove(CELL_CLASS);
      cell.style.removeProperty('padding-bottom');
      cell.style.removeProperty('position');
    });
    projectRow.classList.remove(ROW_CLASS);
  }

  function makeClone(sourceBars) {
    const clone = sourceBars[0].cloneNode(true);
    clone.classList.add(CLONE_CLASS);
    clone.classList.remove('subc-ph', 'placeholder', 'bar-start', 'bar-end');
    clone.removeAttribute('draggable');

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

  function syncProject(projectRow) {
    clearManaged(projectRow);
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
        const bars = Array.from(sectionCell.querySelectorAll('.bar-subc:not(.subc-ph)'));
        if (!bars.length) return;
        if (!subcByCellIndex.has(index)) subcByCellIndex.set(index, []);
        subcByCellIndex.get(index).push(...bars);
      });
    });

    if (!subcByCellIndex.size) return;
    projectRow.classList.add(ROW_CLASS);

    subcByCellIndex.forEach((bars, index) => {
      const cell = projectCells[index];
      if (!cell) return;
      cell.classList.add(CELL_CLASS);
      cell.appendChild(makeClone(bars));
    });
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