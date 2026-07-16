// planning-collapsed-subcontracting.js
// Toont onderaanneming uit verborgen sectieregels ook op de projectregel.
// De paarse balk krijgt een eigen normale flow-regel onder de bestaande planning.

(() => {
  const WRAP_CLASS = "project-collapsed-subc-wrap";
  const CLONE_CLASS = "project-collapsed-subc";

  function ensureStyle() {
    if (document.getElementById("projectCollapsedSubcStyle")) return;

    const style = document.createElement("style");
    style.id = "projectCollapsedSubcStyle";
    style.textContent = `
      tr.project-row td.plan-cell > .${WRAP_CLASS} {
        display: block !important;
        width: 100% !important;
        height: 16px !important;
        min-height: 16px !important;
        margin: 1px 0 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }

      tr.project-row td.plan-cell > .${WRAP_CLASS} > .${CLONE_CLASS} {
        display: block !important;
        position: static !important;
        width: 100% !important;
        height: 15px !important;
        min-height: 15px !important;
        line-height: 13px !important;
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
    projectRow.querySelectorAll(`.${WRAP_CLASS}`).forEach(el => el.remove());
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

    subcByCellIndex.forEach((bars, index) => {
      const cell = projectCells[index];
      if (!cell?.classList?.contains('plan-cell')) return;

      const wrap = document.createElement('div');
      wrap.className = WRAP_CLASS;
      wrap.appendChild(makeClone(bars));
      cell.appendChild(wrap);
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