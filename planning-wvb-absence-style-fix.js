import { makeSupabaseClient } from "./auth.js";

// planning-wvb-absence-style-fix.js
// Zorgt dat vrije dagen/verlof in de WVB-capaciteitsregels hetzelfde zichtbaar worden
// als in het bovenste capaciteitsblok.

const sbWvbAbs = makeSupabaseClient();
let wvbAbsPending = false;
let wvbAbsRunning = false;
let employeesByNameCache = null;

function parseISODateLocal(iso){
  const m = String(iso || "").slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toISODateLocal(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function employeeName(row){
  return String(row?.naam ?? row?.name ?? row?.fullname ?? row?.display_name ?? "").replace(/\s+/g, " ").trim();
}

function employeeId(row){
  return String(row?.id ?? row?.werknemer_id ?? row?.employee_id ?? row?.user_id ?? "").trim();
}

function fmtHours(n){
  const v = Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  const s = (v % 1 === 0) ? String(v) : v.toFixed(2);
  return s.replace(".", ",").replace(/,00$/, "");
}

function getVisibleDates(){
  const dates = Array.from(document.querySelectorAll(".dayhead-btn[data-iso], .dayhead[data-iso]"))
    .map(el => String(el.dataset.iso || "").slice(0,10))
    .filter(Boolean);

  return [...new Set(dates)];
}

async function loadEmployeesByName(){
  if (employeesByNameCache) return employeesByNameCache;

  const { data, error } = await sbWvbAbs
    .from("werknemers")
    .select("*")
    .limit(5000);

  if (error) {
    console.warn("WVB verlof styling: werknemers laden mislukt", error.message || error);
    employeesByNameCache = new Map();
    return employeesByNameCache;
  }

  const map = new Map();
  for (const row of data || []) {
    const name = employeeName(row);
    const id = employeeId(row);
    if (name && id) map.set(name.toLowerCase(), id);
  }
  employeesByNameCache = map;
  return map;
}

async function loadAbsencesByEmpDate(startISO, endISO){
  const { data, error } = await sbWvbAbs
    .from("employee_absences")
    .select("werknemer_id, work_date, hours, title, note, all_day")
    .gte("work_date", startISO)
    .lte("work_date", endISO)
    .limit(200000);

  if (error) {
    console.warn("WVB verlof styling: verlof laden mislukt", error.message || error);
    return new Map();
  }

  const map = new Map();
  for (const r of data || []) {
    const emp = String(r.werknemer_id ?? "").trim();
    const date = String(r.work_date || "").slice(0,10);
    if (!emp || !date) continue;
    const key = `${emp}||${date}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

function ensureWvbAbsStyle(){
  if (document.getElementById("wvbAbsenceStyleFix")) return;

  const style = document.createElement("style");
  style.id = "wvbAbsenceStyleFix";
  style.textContent = `
    .planner-table tr.wvb-cap-emp-row td.cap-cell.cap-absence{
      background:#fff !important;
    }
    .planner-table tr.wvb-cap-emp-row td.cap-cell.cap-absence .cap-cell-fill.absence{
      background:rgba(245,158,11,.32) !important;
    }
    .planner-table tr.wvb-cap-emp-row td.cap-cell .wvb-absence-chip{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:18px;
      height:12px;
      padding:0 3px;
      border-radius:999px;
      background:#f59e0b;
      color:#111827;
      font-size:10px;
      font-weight:700;
      line-height:12px;
      position:relative;
      z-index:2;
    }
  `;
  document.head.appendChild(style);
}

function ensureFillbar(cell){
  let fillbar = cell.querySelector(".cap-cell-fillbar");
  if (!fillbar) {
    fillbar = document.createElement("div");
    fillbar.className = "cap-cell-fillbar";
    cell.prepend(fillbar);
  }
  return fillbar;
}

function ensureValueContainer(cell){
  let stack = cell.querySelector(".cap-cell-stack");
  if (stack) return stack;

  let value = cell.querySelector(".cap-cell-value");
  if (!value) {
    value = document.createElement("div");
    value.className = "cap-cell-value";
    cell.appendChild(value);
  }

  stack = document.createElement("div");
  stack.className = "cap-cell-stack";
  while (value.firstChild) stack.appendChild(value.firstChild);
  value.appendChild(stack);
  return stack;
}

function markWvbAbsenceCell(cell, absRows){
  const absH = absRows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
  if (!(absH > 0)) return;

  cell.classList.add("cap-absence");
  const title = absRows
    .map(r => `${String(r.title || "Verlof")} ${fmtHours(Number(r.hours || 0))}u`)
    .join("\n");
  cell.dataset.tip = title;
  cell.title = title;

  const fillbar = ensureFillbar(cell);
  fillbar.querySelectorAll(".wvb-absence-fill").forEach(el => el.remove());

  const fill = document.createElement("span");
  fill.className = "cap-cell-fill absence wvb-absence-fill";
  const base = Math.max(7.5, absH);
  const pct = Math.max(0, Math.min(100, (absH / base) * 100));
  fill.style.flex = `0 0 ${pct}%`;
  fillbar.appendChild(fill);

  const stack = ensureValueContainer(cell);
  stack.querySelectorAll(".wvb-absence-chip").forEach(el => el.remove());
  const chip = document.createElement("span");
  chip.className = "wvb-absence-chip cap-absence-chip";
  chip.textContent = fmtHours(absH);
  stack.appendChild(chip);
}

async function applyWvbAbsenceStyle(){
  if (wvbAbsRunning) return;
  wvbAbsRunning = true;

  try {
    ensureWvbAbsStyle();

    const dates = getVisibleDates();
    if (!dates.length) return;

    const startISO = dates[0];
    const endISO = dates[dates.length - 1];
    if (!parseISODateLocal(startISO) || !parseISODateLocal(endISO)) return;

    const employeesByName = await loadEmployeesByName();
    const absByEmpDate = await loadAbsencesByEmpDate(startISO, endISO);

    document.querySelectorAll("tr.wvb-cap-emp-row").forEach(row => {
      const name = String(row.querySelector("td.cap-name")?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const empId = employeesByName.get(name);
      if (!empId) return;

      const cells = Array.from(row.querySelectorAll("td.cap-cell"));
      dates.forEach((dateISO, idx) => {
        const cell = cells[idx];
        if (!cell) return;
        const absRows = absByEmpDate.get(`${empId}||${dateISO}`) || [];
        if (absRows.length) markWvbAbsenceCell(cell, absRows);
      });
    });
  } finally {
    wvbAbsRunning = false;
  }
}

function scheduleWvbAbsenceStyle(delay = 350){
  if (wvbAbsPending) return;
  wvbAbsPending = true;
  window.setTimeout(() => {
    wvbAbsPending = false;
    applyWvbAbsenceStyle();
  }, delay);
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleWvbAbsenceStyle(500);
  scheduleWvbAbsenceStyle(1500);
});
window.addEventListener("load", () => scheduleWvbAbsenceStyle(500));

const wvbAbsObserver = new MutationObserver(() => scheduleWvbAbsenceStyle(800));
wvbAbsObserver.observe(document.body, { childList:true, subtree:true });
