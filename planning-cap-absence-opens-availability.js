// planning-cap-absence-opens-availability.js
// Laat een klik op een verlof/vrije-dag cel in het capaciteitsblok hetzelfde doen
// als een normale capaciteitscel: het beschikbaarheidsmodal van die medewerker openen.
// planning.js opent nu voor .cap-absence nog het dag/verlofmodal. We halen die class
// heel kort weg vóór de bestaande click-handler draait, zodat planning.js de normale
// beschikbaarheidsroute gebruikt. Daarna zetten we de class terug voor de styling.

document.addEventListener("click", (ev) => {
  const cell = ev.target.closest("td.cap-cell-click.cap-absence");
  if (!cell) return;

  cell.classList.remove("cap-absence");
  window.setTimeout(() => {
    cell.classList.add("cap-absence");
  }, 0);
}, true);
