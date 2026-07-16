// Toont onder het capaciteitblok per week hoeveel saldo-uren nog beschikbaar zijn.
// Voor de huidige week worden alleen vandaag en de resterende dagen meegeteld.
// Daaronder staat een cumulatieve optelling vanaf vandaag; verleden telt niet mee.
(() => {
  const ROW_CLASS = "weekly-available-total-row";
  const CUM_ROW_CLASS = "weekly-available-cumulative-row";
  const STYLE_ID = "weeklyAvailableTotalStyle";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .planner-table tr.${ROW_CLASS} > td,
      .planner-table tr.${CUM_ROW_CLASS} > td {
        height: 28px !important;
        background: #f8fafc !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        vertical-align: middle !important;
      }
      .planner-table tr.${ROW_CLASS} > td {
        border-top: 2px solid #94a3b8 !important;
      }
      .planner-table tr.${CUM_ROW_CLASS} > td {
        border-top: 1px solid #cbd5e1 !important;
        border-bottom: 2px solid #94a3b8 !important;
      }
      .planner-table tr.${ROW_CLASS} > td.weekly-available-label,
      .planner-table tr.${CUM_ROW_CLASS} > td.weekly-available-label {
        text-align: left !important;
        padding: 0 8px !important;
        color: #0f172a !important;
      }
      .planner-table tr.${ROW_CLASS} > td.weekly-available-hours,
      .planner-table tr.${CUM_ROW_CLASS} > td.weekly-available-hours {
        text-align: center !important;
        padding: 0 4px !important;
        color: #166534 !important;
        background: #dcfce7 !important;
      }
      .planner-table tr.${CUM_ROW_CLASS} > td.weekly-available-hours {
        background: #dbeafe !important;
        color: #1e3a8a !important;
      }
      .planner-table tr.${ROW_CLASS} > td.weekly-available-hours.negative,
      .planner-table tr.${CUM_ROW_CLASS} > td.weekly-available-hours.negative {
        color: #991b1b !important;
        background: #fee2e2 !important;
      }
      .planner-table tr.${ROW_CLASS} > td.weekly-available-hours.empty,
      .planner-table tr.${CUM_ROW_CLASS} > td.weekly-available-hours.empty {
        color: #94a3b8 !important;
        background: #f8fafc !important;
        font-weight: 500 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function parseNumber(value) {
    const text = String(value ?? "")
      .replace(/\s/g, "")
      .replace(/[^0-9,.-]/g, "")
      .replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }

  function formatHours(value) {
    const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10;
    return `${String(rounded).replace(".", ",")} u`;
  }

  function localTodayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isoWeekKey(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const weekYear = date.getFullYear();
    const week1 = new Date(weekYear, 0, 4);
    const week = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${weekYear}-${String(week).padStart(2, "0")}`;
  }

  function findSaldoRow(table) {
    const rows = Array.from(table.tBodies?.[0]?.rows || []);
    return rows.find(row => {
      const label = String(row.cells?.[0]?.textContent || "").trim().toLowerCase();
      return label === "saldo" || row.classList.contains("balance-row");
    }) || null;
  }

  function appendFixedColumns(row, saldoRow, labelText) {
    const label = document.createElement("td");
    label.className = "rowhdr sticky-left weekly-available-label";
    label.textContent = labelText;
    row.appendChild(label);

    const hoursCol = document.createElement("td");
    hoursCol.className = "cell hourscol sticky-left2";
    hoursCol.style.left = "380px";
    const referenceHoursCell = saldoRow.children[1];
    if (referenceHoursCell && getComputedStyle(referenceHoursCell).display === "none") {
      hoursCol.style.display = "none";
    }
    row.appendChild(hoursCol);
  }

  function render() {
    ensureStyle();
    const table = document.querySelector(".planner-table");
    if (!table) return;

    const dayHeaders = Array.from(table.querySelectorAll("thead tr.hdr-day th[data-iso]"));
    const saldoRow = findSaldoRow(table);
    if (!saldoRow || !dayHeaders.length) return;

    const dayCells = Array.from(saldoRow.children).slice(2, 2 + dayHeaders.length);
    if (dayCells.length !== dayHeaders.length) return;

    const todayISO = localTodayISO();
    const groups = [];

    dayHeaders.forEach((header, index) => {
      const iso = String(header.dataset.iso || "");
      const key = isoWeekKey(iso);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, start: iso, end: iso, span: 0, total: 0, countedDays: 0 };
        groups.push(group);
      }
      group.end = iso;
      group.span += 1;
      if (iso >= todayISO) {
        group.total += parseNumber(dayCells[index]?.textContent);
        group.countedDays += 1;
      }
    });

    let cumulative = 0;
    const cumulativeGroups = groups.map(group => {
      if (group.countedDays) cumulative += group.total;
      return { ...group, cumulative };
    });

    const signature = JSON.stringify(cumulativeGroups.map(g => [
      g.key,
      g.span,
      Math.round(g.total * 100),
      Math.round(g.cumulative * 100),
      g.countedDays
    ]));

    let weekRow = table.querySelector(`tbody tr.${ROW_CLASS}`);
    let cumRow = table.querySelector(`tbody tr.${CUM_ROW_CLASS}`);
    if (
      weekRow?.dataset.signature === signature &&
      cumRow?.dataset.signature === signature &&
      weekRow.previousElementSibling === saldoRow &&
      cumRow.previousElementSibling === weekRow
    ) return;

    weekRow?.remove();
    cumRow?.remove();

    weekRow = document.createElement("tr");
    weekRow.className = ROW_CLASS;
    weekRow.dataset.signature = signature;
    appendFixedColumns(weekRow, saldoRow, "Beschikbaar per week");

    cumulativeGroups.forEach(group => {
      const cell = document.createElement("td");
      cell.colSpan = group.span;
      cell.className = "weekly-available-hours";
      if (!group.countedDays) {
        cell.classList.add("empty");
        cell.textContent = "—";
        cell.title = "Deze week ligt volledig vóór vandaag";
      } else {
        if (group.total < 0) cell.classList.add("negative");
        cell.textContent = formatHours(group.total);
        const weekNo = Number(group.key.split("-")[1]);
        cell.title = `Week ${weekNo}: resterend saldo van ${group.start < todayISO ? todayISO : group.start} t/m ${group.end}`;
      }
      weekRow.appendChild(cell);
    });

    cumRow = document.createElement("tr");
    cumRow.className = CUM_ROW_CLASS;
    cumRow.dataset.signature = signature;
    appendFixedColumns(cumRow, saldoRow, "Totaal vanaf vandaag");

    cumulativeGroups.forEach(group => {
      const cell = document.createElement("td");
      cell.colSpan = group.span;
      cell.className = "weekly-available-hours";
      if (!group.countedDays) {
        cell.classList.add("empty");
        cell.textContent = "—";
        cell.title = "Verleden telt niet mee";
      } else {
        if (group.cumulative < 0) cell.classList.add("negative");
        cell.textContent = formatHours(group.cumulative);
        const weekNo = Number(group.key.split("-")[1]);
        cell.title = `Cumulatief beschikbaar vanaf vandaag t/m week ${weekNo}`;
      }
      cumRow.appendChild(cell);
    });

    saldoRow.insertAdjacentElement("afterend", weekRow);
    weekRow.insertAdjacentElement("afterend", cumRow);
  }

  let scheduled = false;
  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  window.addEventListener("DOMContentLoaded", scheduleRender);
  window.addEventListener("load", scheduleRender);
  document.addEventListener("click", () => setTimeout(scheduleRender, 0), true);
  new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(scheduleRender, 500);
  setTimeout(scheduleRender, 1500);
})();