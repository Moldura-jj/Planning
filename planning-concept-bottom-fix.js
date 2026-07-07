// planning-concept-bottom-fix.js
// Zet het status-2 conceptblok helemaal onderaan, ruim de oude placeholder 'Nieuwe order' op,
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

function readRowValues(row, dates){
  const out = makeZeroMap(dates);
  getDayCells(row).forEach(td => {
    const iso = String(td.dataset.workDate || "").trim();
    if (iso && iso in out) out[iso] = parseHours(td.textContent || "");
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

function recalcTotalConceptBalance(){
  const dates = getVisibleDates();
  if (!dates.length) return;

  const saldoProdMont = readRowValues(findRowByExactLabel("Saldo"), dates);
  const saldoWvb = readRowValues(findRowByExactLabel("Saldo WVB"), dates);
  const conceptProd = readRowValues(findConceptRowByExactLabel("Concept productie"), dates);
  const conceptMont = readRowValues(findConceptRowByExactLabel("Concept montage"), dates);
  const conceptWvb = readRowValues(findConceptRowByExactLabel("Concept WVB"), dates);

  const total = makeZeroMap(dates);
  for (const iso of dates) {
    total[iso] = Math.round((
      Number(saldoProdMont[iso] || 0) +
      Number(saldoWvb[iso] || 0) -
      Number(conceptProd[iso] || 0) -
      Number(conceptMont[iso] || 0) -
      Number(conceptWvb[iso] || 0)
    ) * 100) / 100;
  }

  const oldProdMontRow = findConceptRowByExactLabel("Saldo prod./mont. na concept");
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
