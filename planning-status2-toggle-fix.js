// planning-status2-toggle-fix.js
// Herstelt het open-/dichtklappen van status-2 projecten nadat ze onderaan zijn geplaatst.

function getProjectId(projectRow){
  return String(projectRow?.querySelector('.expander[data-proj]')?.dataset?.proj || '').trim();
}

function getProjectChildren(tbody, pid){
  if (!tbody || !pid) return [];
  return Array.from(tbody.querySelectorAll(`tr[data-parent="${CSS.escape(pid)}"]`));
}

function setOpen(projectRow, open){
  const tbody = projectRow?.closest('tbody');
  const pid = getProjectId(projectRow);
  if (!tbody || !pid) return;

  const btn = projectRow.querySelector('.expander[data-proj]');
  if (btn) {
    btn.textContent = open ? '▼' : '▶';
    btn.classList.toggle('open', open);
  }
  projectRow.classList.toggle('is-open', open);

  getProjectChildren(tbody, pid).forEach(row => {
    row.style.display = '';
    row.classList.remove('planning-status-hidden');
    row.classList.toggle('hidden', !open);
  });
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.status2-project-row .expander[data-proj]');
  if (!btn) return;

  const projectRow = btn.closest('tr.status2-project-row');
  if (!projectRow) return;

  ev.preventDefault();
  ev.stopPropagation();

  const isOpen = btn.textContent === '▼' || projectRow.classList.contains('is-open');
  setOpen(projectRow, !isOpen);
}, true);
