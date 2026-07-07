// planning-status2-toggle-fix.js
// Laat het pijltje van status-2 projecten hetzelfde doen als klikken op de projectregel.
// De normale plannerlogica blijft daardoor leidend.

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.status2-project-row .expander[data-proj]');
  if (!btn) return;

  const projectRow = btn.closest('tr.status2-project-row');
  const projectText = projectRow?.querySelector('.projtext') || projectRow?.querySelector('td.project-cell, td.rowhdr');
  if (!projectRow || !projectText) return;

  ev.preventDefault();
  ev.stopPropagation();

  projectText.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  }));
}, true);
