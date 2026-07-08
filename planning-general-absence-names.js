// planning-general-absence-names.js
// Toont bij "Algemene vrije dag" welke medewerkers onder een gegroepeerde verlofregel vallen.
// Werkt op basis van de zichtbare inhoud van het geopende modal.

let generalAbsPending = false;

function isVisible(el){
  if (!el || !(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
}

function textOf(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
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

function parseGeneralRow(row){
  const txt = textOf(row);
  const m = txt.match(/(.+?)\s*\(\s*(-?\d+(?:[,.]\d+)?)\s*u\s*[x×]\s*(\d+)\s*\)/i);
  if (!m) return null;

  return {
    title: String(m[1] || "").trim(),
    hours: parseNlNumber(m[2]),
    count: Number(m[3] || 0)
  };
}

function findGeneralRows(modal){
  const all = Array.from(modal.querySelectorAll("*"));
  return all.filter(el => {
    const txt = textOf(el);
    if (!/\(.+?[x×]\s*\d+\)/i.test(txt)) return false;
    if (!/Bewerken/i.test(txt) || !/Verwijderen/i.test(txt)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 150 && r.height > 20;
  }).filter((el, idx, arr) => !arr.some(other => other !== el && other.contains(el)));
}

function ensureStyle(){
  if (document.getElementById("generalAbsenceNamesStyle")) return;
  const style = document.createElement("style");
  style.id = "generalAbsenceNamesStyle";
  style.textContent = `
    .general-absence-names{
      margin-top:4px;
      color:#475569;
      font-size:11px;
      line-height:1.25;
      max-width:280px;
    }
    .general-absence-names b{
      color:#334155;
      font-weight:700;
    }
  `;
  document.head.appendChild(style);
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

function namesFromLines(modal, parsed){
  const lines = String(modal.innerText || modal.textContent || "")
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);

  const hour = fmtHours(parsed.hours);
  const hourRegex = new RegExp(`^${hour.replace(",", "[,.]")}\\s*uur$`, "i");
  const titleRegex = new RegExp(`^${String(parsed.title || "Verlof").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

  const names = [];
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i];
    if (!lineLooksLikeEmployeeName(name)) continue;

    const next = lines.slice(i + 1, i + 5);
    const hasTitle = next.some(x => titleRegex.test(x));
    const hasHours = next.some(x => hourRegex.test(x) || new RegExp(`^${String(parsed.hours).replace(".", "[,.]")}\\s*uur$`, "i").test(x));
    if (hasTitle && hasHours && !names.includes(name)) names.push(name);
  }
  return names;
}

function namesFromCompactText(modal, parsed){
  const txt = String(modal.innerText || modal.textContent || "").replace(/\s+/g, " ").trim();
  const title = String(parsed.title || "Verlof").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const h1 = fmtHours(parsed.hours).replace(",", "[,.]");
  const h2 = String(parsed.hours).replace(".", "[,.]");

  const re = new RegExp(`([A-ZÀ-Ý][A-Za-zÀ-ÿ.' -]{2,40}?)\\s+${title}\\s+(?:${h1}|${h2})\\s*uur`, "g");
  const names = [];
  let m;
  while ((m = re.exec(txt))) {
    const raw = String(m[1] || "").trim();
    const parts = raw.split(/\s+/);
    const name = parts.slice(Math.max(0, parts.length - 4)).join(" ").trim();
    if (lineLooksLikeEmployeeName(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

function namesFromVisibleCards(modal, parsed){
  const cardCandidates = Array.from(modal.querySelectorAll("div, span"))
    .filter(isVisible)
    .filter(el => {
      const t = textOf(el);
      return new RegExp(`\\b${String(parsed.title || "Verlof").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t) &&
        new RegExp(`\\b${fmtHours(parsed.hours).replace(",", "[,.]")}\\s*uur\\b|\\b${String(parsed.hours).replace(".", "[,.]")}\\s*uur\\b`, "i").test(t) &&
        !/\(.+?[x×]\s*\d+\)/i.test(t);
    });

  const names = [];
  for (const card of cardCandidates) {
    let cur = card.previousElementSibling;
    let found = "";
    for (let i = 0; i < 5 && cur; i++, cur = cur.previousElementSibling) {
      const t = textOf(cur);
      if (lineLooksLikeEmployeeName(t)) { found = t; break; }
    }

    if (!found) {
      let parent = card.parentElement;
      for (let depth = 0; depth < 4 && parent && parent !== modal; depth++, parent = parent.parentElement) {
        const maybe = Array.from(parent.children).map(textOf).find(lineLooksLikeEmployeeName);
        if (maybe) { found = maybe; break; }
      }
    }

    if (found && !names.includes(found)) names.push(found);
  }
  return names;
}

function insertNames(rowEl, names){
  rowEl.querySelectorAll(".general-absence-names").forEach(el => el.remove());
  if (!names.length) return;

  const nameLine = document.createElement("div");
  nameLine.className = "general-absence-names";
  nameLine.innerHTML = `<b>Medewerkers:</b> ${escapeHtml(names.join(", "))}`;

  const buttons = Array.from(rowEl.querySelectorAll("button"));
  const firstButton = buttons[0];
  if (firstButton?.parentElement && firstButton.parentElement !== rowEl) {
    rowEl.insertBefore(nameLine, firstButton.parentElement);
    return;
  }

  rowEl.appendChild(nameLine);
}

function applyGeneralAbsenceNames(){
  ensureStyle();
  const modal = findGeneralAbsenceModal();
  if (!modal) return;

  const rows = findGeneralRows(modal);
  if (!rows.length) return;

  for (const rowEl of rows) {
    const parsed = parseGeneralRow(rowEl);
    if (!parsed) continue;

    let names = namesFromLines(modal, parsed);
    if (!names.length) names = namesFromVisibleCards(modal, parsed);
    if (!names.length) names = namesFromCompactText(modal, parsed);

    names = [...new Set(names)].slice(0, parsed.count || undefined).sort((a,b) => a.localeCompare(b, "nl"));
    insertNames(rowEl, names);
  }
}

function scheduleGeneralAbsenceNames(delay = 120){
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
  scheduleGeneralAbsenceNames(150);
  scheduleGeneralAbsenceNames(700);
  scheduleGeneralAbsenceNames(1500);
}, true);

const generalAbsObserver = new MutationObserver(() => scheduleGeneralAbsenceNames(250));
generalAbsObserver.observe(document.body, { childList:true, subtree:true });
