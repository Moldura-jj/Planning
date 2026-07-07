// planning-concept-bottom-fix.js
// Zet het status-2 conceptblok helemaal onderaan, ruim de oude placeholder 'Nieuwe order' op,
// haalt status-2 concepturen uit de gewone capaciteitsregels,
// en rekent de onderste regel uit als totaalcapaciteit - geplande uren - status-2 concepturen.

let conceptBottomFixPending = false;
let conceptBottomFixRunning = false;

function rowText(row){
  return String(row?.textContent || "").replace(/\s+/g, " ").trim();
}

function parseHours(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatHours(value){
  const n = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  if (Math.abs(n) < 0.0001) return "";
  return String(n).replace(".", ",");
}

function getVisibleDates(){
  return Array.from(document.querySelectorAll(".dayhead-btn[data-iso]"))
    .map(btn => String(btn.dataset.iso || "").trim())
    .filter(Boolean);
}

function makeZeroMap(dates){
  return Object.fromEntries((dates || []).map(iso => [iso, 0]));
}

function getDayCells(row){
  return Array.from(row?.querySelectorAll("td.cell[data-work-date]") || [])
    .filter(td => !td.classList.contains("hourscol"));
}

function findRowByExactLabel(label){
  const wanted = String(label || "").trim().toLowerCase();
  return Array.from(document.querySelectorAll("tr:not(.concept-status2-row)")).find(row => {
    const txt = String(row.querySelector("td.rowhdr")?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return txt === wanted;
  }) || null;
}

function findConceptRowByExactLabel(label){
  const wanted = String(label || "").trim().toLowerCase();
  return Array.from(document.querySelectorAll("tr.concept-status2-row")).find(row => {
    const txt = String(row.querySelector("td.rowhdr")?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return txt === wanted;
  }) || null;
}

function getCellBaseValue(td){
  if (!td) return 0;
  if (td.dataset.status2BaseValue === undefined) {
    td.dataset.status2BaseValue = String(parseHours(td.textContent || ""));
  }
  return Number(td.dataset.status2BaseValue || 0);
}

function readRowValues(row, dates, useBase = false){
  const out = makeZeroMap(dates);
  getDayCells(row).forEach(td => {
    const iso = String(td.dataset.workDate || "").trim();
    if (!iso || !(iso in out)) return;
    out[iso] = useBase ? getCellBaseValue(td) : parseHours(td.textContent || "");
  });
  return out;
}

function applyValuesToRow(row, dates, values){
  if (!row) return;

  getDayCells(row).forEach(td => {
    const iso = String(td.dataset.workDate || "").trim();
    if (!iso || !(iso in values)) return;

    const n = Number(values[iso] || 0);
    td.textContent = formatHours(n);
    td.classList.toggle("bad", n < 0);
    td.classList.toggle("ok", n > 0);
    td.classList.toggle("zero", Math.abs(n) < 0.0001);
  });
}

function addMaps(dates, ...maps){
  const out = makeZeroMap(dates);
  for (const iso of dates) {
    out[iso] = Math.round(maps.reduce((sum, m) => sum + Number(m?.[iso] || 0), 0) * 100) / 100;
  }
  return out;
}

function subtractMaps(dates, base, ...subtracts){
  const out = makeZeroMap(dates);
  for (const iso of dates) {
    out[iso] = Math.round((Number(base?.[iso] || 0) - subtracts.reduce((sum, m) => sum + Number(m?.[iso] || 0), 0)) * 100) / 100;
  }
  return out;
}

function readConceptValues(dates){
  return {
    wvb: readRowValues(findConceptRowByExactLabel("Concept WVB"), dates),
    prod: readRowValues(findConceptRowByExactLabel("Concept productie"), dates),
    mont: readRowValues(findConceptRowByExactLabel("Concept montage"), dates),
  };
}

function correctMainCapacityRows(){
  const dates = getVisibleDates();
  if (!dates.length) return null;

  const concept = readConceptValues(dates);
  const conceptProdMont = addMaps(dates, concept.prod, concept.mont);

  const plannedProdRow = findRowByExactLabel("Gepland productie");
  const plannedMontRow = findRowByExactLabel("Gepland montage");
  const plannedWvbRow = findRowByExactLabel("Gepland WVB");
  const saldoRow = findRowByExactLabel("Saldo");
  const saldoWvbRow = findRowByExactLabel("Saldo WVB");

  const plannedProdBase = readRowValues(plannedProdRow, dates, true);
  const plannedMontBase = readRowValues(plannedMontRow, dates, true);
  const plannedWvbBase = readRowValues(plannedWvbRow, dates, true);
  const saldoBase = readRowValues(saldoRow, dates, true);
  const saldoWvbBase = readRowValues(saldoWvbRow, dates, true);

  // Status 2 zat nog in de normale geplande uren. Haal die daar uit.
  applyValuesToRow(plannedProdRow, dates, subtractMaps(dates, plannedProdBase, concept.prod));
  applyValuesToRow(plannedMontRow, dates, subtractMaps(dates, plannedMontBase, concept.mont));
  applyValuesToRow(plannedWvbRow, dates, subtractMaps(dates, plannedWvbBase, concept.wvb));

  // En geef die uren terug aan de normale saldi. Zo toont de hoofdplanning alleen status 3/4/5.
  const correctedSaldo = addMaps(dates, saldoBase, conceptProdMont);
  const correctedSaldoWvb = addMaps(dates, saldoWvbBase, concept.wvb);
  applyValuesToRow(saldoRow, dates, correctedSaldo);
  applyValuesToRow(saldoWvbRow, dates, correctedSaldoWvb);

  return { dates, concept, correctedSaldo, correctedSaldoWvb };
}

function recalcTotalConceptBalance(){
  const correction = correctMainCapacityRows();
  const dates = correction?.dates || getVisibleDates();
  if (!dates.length) return;

  const concept = correction?.concept || readConceptValues(dates);
  const saldoProdMont = correction?.correctedSaldo || readRowValues(findRowByExactLabel("Saldo"), dates);
  const saldoWvb = correction?.correctedSaldoWvb || readRowValues(findRowByExactLabel("Saldo WVB"), dates);

  const total = makeZeroMap(dates);
  for (const iso of dates) {
    total[iso] = Math.round((
      Number(saldoProdMont[iso] || 0) +
      Number(saldoWvb[iso] || 0) -
      Number(concept.prod[iso] || 0) -
      Number(concept.mont[iso] || 0) -
      Number(concept.wvb[iso] || 0)
    ) * 100) / 100;
  }

  const oldProdMontRow = findConceptRowByExactLabel("Saldo prod./mont. na concept") || findConceptRowByExactLabel("Totaal saldo na status 2");
  if (oldProdMontRow) {
    const label = oldProdMontRow.querySelector("td.rowhdr");
    if (label) label.textContent = "Totaal saldo na status 2";
    oldProdMontRow.classList.add("concept-total-balance-row");
    applyValuesToRow(oldProdMontRow, dates, total);
  }
}

function removeLegacyNewOrderRows(tbody){
  if (!tbody) return;

  Array.from(tbody.querySelectorAll("tr")).forEach((row) => {
    const txt = rowText(row).toLowerCase();

    const isNewOrderPlaceholder = txt.includes("nieuwe order") && txt.includes("koppelen");
    const isOldCapacityHeader = txt === "capaciteit met nieuwe order";

    if (isNewOrderPlaceholder || isOldCapacityHeader) {
      row.remove();
    }
  });
}

function moveConceptBlockToBottom(){
  if (conceptBottomFixRunning) return;

  const tbody = document.querySelector(".planner-table tbody");
  if (!tbody) return;

  conceptBottomFixRunning = true;
  try {
    removeLegacyNewOrderRows(tbody);

    const conceptRows = Array.from(tbody.querySelectorAll("tr.concept-status2-row"));
    if (!conceptRows.length) return;

    recalcTotalConceptBalance();

    const fragment = document.createDocumentFragment();
    conceptRows.forEach((row) => fragment.appendChild(row));
    tbody.appendChild(fragment);
  } finally {
    conceptBottomFixRunning = false;
  }
}

function scheduleConceptBottomFix(){
  if (conceptBottomFixPending || conceptBottomFixRunning) return;
  conceptBottomFixPending = true;

  requestAnimationFrame(() => {
    conceptBottomFixPending = false;
    moveConceptBlockToBottom();
  });
}

window.addEventListener("DOMContentLoaded", scheduleConceptBottomFix);
window.addEventListener("load", scheduleConceptBottomFix);

const conceptBottomObserver = new MutationObserver(scheduleConceptBottomFix);
conceptBottomObserver.observe(document.body, { childList: true, subtree: true });
