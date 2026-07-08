import { makeSupabaseClient } from "./auth.js";

// planning-general-absence-names.js
// Toont bij "Algemene vrije dag" welke medewerkers onder een gegroepeerde verlofregel vallen.
// Leest de namen primair uit het geopende modal zelf, zodat dit ook werkt als de databasekoppeling
// of datum-parsing niet exact genoeg is.

const sbGeneralAbsNames = makeSupabaseClient();
let generalAbsPending = false;
let employeesByIdCache = null;

function isVisible(el){
  if (!el || !(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
}

function textOf(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function norm(s){
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseNlNumber(value){
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmtHours(n){
  const v = Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  const s = (v % 1 === 0) ? String(v) : v.toFixed(2);
  return s.replace(".", ",").replace(/,00$/, "");
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function employeeName(row){
  return String(row?.naam ?? row?.name ?? row?.fullname ?? row?.display_name ?? "").replace(/\s+/g, " ").trim();
}

function employeeId(row){
  return String(row?.id ?? row?.werknemer_id ?? row?.employee_id ?? row?.user_id ?? "").trim();
}

function findGeneralAbsenceModal(){
  const candidates = Array.from(document.querySelectorAll(".modal, [role='dialog'], .modal-card, .modal-backdrop"))
    .filter(isVisible)
    .filter(el => /Algemene vrije dag/i.test(textOf(el)));

  return candidates.sort((a,b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return (br.width * br.height) - (ar.width * ar.height);
  })[0] || null;
}

function parseCurrentYearForMonth(monthNr){
  const label = textOf(document.querySelector("#current-week-label"));
  const yearMatches = Array.from(label.matchAll(/\b(20\d{2})\b/g)).map(m => Number(m[1]));
  if (yearMatches.length) return yearMatches[0];
  return new Date().getFullYear();
}

function parseModalDateISO(modal){
  const txt = textOf(modal);
  const m = txt.match(/(?:^|\s)(\d{1,2})-(\d{1,2})(?:\s|$)/);
  if (!m) return "";

  const day = Number(m[1]);
  const month = Number(m[2]);
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return "";

  const year = parseCurrentYearForMonth(month);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function loadEmployeesById(){
  if (employeesByIdCache) return employeesByIdCache;

  const { data, error } = await sbGeneralAbsNames
    .from("werknemers")
    .select("*")
    .limit(5000);

  if (error) {
    console.warn("Algemene vrije dag namen: werknemers laden mislukt", error.message || error);
    employeesByIdCache = new Map();
    return employeesByIdCache;
  }

  const map = new Map();
  for (const row of data || []) {
    const id = employeeId(row);
    const name = employeeName(row);
    if (id && name) map.set(id, name);
  }

  employeesByIdCache = map;
  return map;
}

async function loadAbsencesForDate(dateISO){
  if (!dateISO) return [];

  const { data, error } = await sbGeneralAbsNames
    .from("employee_absences")
    .select("id, werknemer_id, work_date, title, hours, all_day, note")
    .eq("work_date", dateISO)
    .limit(200000);

  if (error) {
    console.warn("Algemene vrije dag namen: verlof laden mislukt", error.message || error);
    return [];
  }

  return data || [];
}

function parseGeneralRow(row){
  const txt = textOf(row);
  const m = txt.match(/^(.+?)\s*\(\s*(-?\d+(?:[,.]\d+)?)\s*u\s*[x×]\s*(\d+)\s*\)/i);
  if (!m) return null;

  return {
    title: String(m[1] || "").trim(),
    hours: parseNlNumber(m[2]),
    count: Number(m[3] || 0)
  };
}

function findGeneralRows(modal){
  const buttons = Array.from(modal.querySelectorAll("button"))
    .filter(btn => /Bewerken/i.test(textOf(btn)));

  const rows = [];
  for (const btn of buttons) {
    let cur = btn.parentElement;
    let best = null;

    for (let i = 0; i < 6 && cur && cur !== modal; i++, cur = cur.parentElement) {
      if (/\(.+?[x×]\s*\d+\)/i.test(textOf(cur)) && /Verwijderen/i.test(textOf(cur))) {
        best = cur;
      }
    }

    if (best && !rows.includes(best)) rows.push(best);
  }

  return rows;
}

function ensureStyle(){
  if (document.getElementById("generalAbsenceNamesStyle")) return;
  const style = document.createElement("style");
  style.id = "generalAbsenceNamesStyle";
  style.textContent = `
    .general-absence-names{
      margin-top:3px;
      color:#475569;
      font-size:11px;
      line-height:1.25;
      max-width:260px;
    }
    .general-absence-names b{
      color:#334155;
      font-weight:700;
    }
  `;
  document.head.appendChild(style);
}

function sameHours(a, b){
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.01;
}

function lineLooksLikeEmployeeName(line){
  const s = String(line || "").trim();
  if (!s) return false;
  if (/^(Donderdag|Maandag|Dinsdag|Woensdag|Vrijdag|Zaterdag|Zondag)$/i.test(s)) return false;
  if (/^\d{1,2}-\d{1,2}$/.test(s)) return false;
  if (/^(Algemene vrije dag|Verlof|Uren|Hele dag|Opslaan|Bewerken|Verwijderen|Beschikbaar)$/i.test(s)) return false;
  if (/Wordt opgeslagen/i.test(s)) return false;
  if (/\(.+?[x×]\s*\d+\)/i.test(s)) return false;
  if (/uur$/i.test(s)) return false;
  return /[A-Za-zÀ-ÿ]/.test(s);
}

function namesFromVisibleModalRows(modal, parsed){
  const lines = String(modal.innerText || modal.textContent || "")
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);

  const titleNorm = norm(parsed.title || "Verlof");
  const hourText = fmtHours(parsed.hours);
  const hourVariants = new Set([
    `${hourText} uur`,
    `${hourText}u`,
    `${String(parsed.hours).replace(".", ",")} uur`,
    `${String(parsed.hours).replace(".", ",")}u`
  ].map(norm));

  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const maybeName = lines[i];
    if (!lineLooksLikeEmployeeName(maybeName)) continue;

    const next1 = norm(lines[i + 1] || "");
    const next2 = norm(lines[i + 2] || "");
    const next3 = norm(lines[i + 3] || "");

    const hasTitle = next1 === titleNorm || next2 === titleNorm;
    const hasHours = hourVariants.has(next1) || hourVariants.has(next2) || hourVariants.has(next3);

    if (hasTitle && hasHours && !out.includes(maybeName)) out.push(maybeName);
  }

  return out;
}

function insertNames(rowEl, names){
  rowEl.querySelectorAll(".general-absence-names").forEach(el => el.remove());
  if (!names.length) return;

  const nameLine = document.createElement("div");
  nameLine.className = "general-absence-names";
  nameLine.innerHTML = `<b>Medewerkers:</b> ${escapeHtml(names.join(", "))}`;

  const firstTextBlock = Array.from(rowEl.children).find(ch => !/button/i.test(ch.tagName) && textOf(ch));
  if (firstTextBlock) {
    firstTextBlock.appendChild(nameLine);
  } else {
    rowEl.insertBefore(nameLine, rowEl.firstChild?.nextSibling || null);
  }
}

async function applyGeneralAbsenceNames(){
  ensureStyle();

  const modal = findGeneralAbsenceModal();
  if (!modal) return;

  const rows = findGeneralRows(modal);
  if (!rows.length) return;

  const dateISO = parseModalDateISO(modal);
  const employeesById = await loadEmployeesById();
  const absences = await loadAbsencesForDate(dateISO);

  for (const rowEl of rows) {
    const parsed = parseGeneralRow(rowEl);
    if (!parsed) continue;

    let names = namesFromVisibleModalRows(modal, parsed);

    if (!names.length && absences.length) {
      const matches = absences.filter(a =>
        norm(a.title || "Verlof") === norm(parsed.title || "Verlof") &&
        sameHours(a.hours, parsed.hours)
      );

      names = matches
        .map(a => employeesById.get(String(a.werknemer_id)) || String(a.werknemer_id || ""))
        .filter(Boolean);
    }

    names = [...new Set(names)].sort((a,b) => a.localeCompare(b, "nl"));
    insertNames(rowEl, names);
  }
}

function scheduleGeneralAbsenceNames(delay = 180){
  if (generalAbsPending) return;
  generalAbsPending = true;
  window.setTimeout(() => {
    generalAbsPending = false;
    applyGeneralAbsenceNames();
  }, delay);
}

window.addEventListener("DOMContentLoaded", () => scheduleGeneralAbsenceNames(500));
window.addEventListener("load", () => scheduleGeneralAbsenceNames(500));

document.addEventListener("click", () => {
  scheduleGeneralAbsenceNames(250);
  scheduleGeneralAbsenceNames(900);
}, true);

const generalAbsObserver = new MutationObserver(() => scheduleGeneralAbsenceNames(300));
generalAbsObserver.observe(document.body, { childList:true, subtree:true });
