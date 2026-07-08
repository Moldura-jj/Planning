import { makeSupabaseClient } from "./auth.js";

// planning-all-time-hours-column.js
// Correctie voor de uren-kolom links naast de planning.
// De bestaande planning.js berekent 'gepland' op basis van de zichtbare periode.
// Deze helper vult de kolom opnieuw met totalen uit alle planningregels in Supabase,
// ongeacht welke maand zichtbaar is.

const sbAllTimeHours = makeSupabaseClient();
const DEFAULT_HOURS = 7.5;
let allTimePending = false;
let allTimeRunning = false;
let allTimeCache = null;
let allTimeCacheAt = 0;

function txt(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function esc(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function num(v){
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmt(n){
  const v = Math.round((Number(n || 0) + Number.EPSILON) * 10) / 10;
  return String(v).replace(".", ",");
}

function parseConceptHours(note, fallback = DEFAULT_HOURS){
  const m = String(note || "").match(/concept-hours:([0-9]+(?:[,.][0-9]+)?)/i);
  if (!m) return fallback;
  const h = num(m[1]);
  return h > 0 ? h : fallback;
}

function canonicalSectionId(section){
  return String(section?.id ?? section?.section_id ?? "").trim();
}

function addAlias(map, key, canon){
  const k = String(key ?? "").trim();
  const c = String(canon ?? "").trim();
  if (k && c) map.set(k, c);
}

function emptyTotals(){
  return { prep:0, prod:0, cnc:0, mont:0, reis:0 };
}

function addTotals(a, b){
  a.prep += num(b.prep);
  a.prod += num(b.prod);
  a.cnc  += num(b.cnc);
  a.mont += num(b.mont);
  a.reis += num(b.reis);
  return a;
}

function requiredFromSection(s){
  return {
    prep: num(s?.uren_wvb ?? s?.uren_prep ?? s?.uren_werkvoorbereiding),
    prod: num(s?.uren_prod),
    cnc:  num(s?.uren_cnc ?? s?.uren_cnc_prod ?? s?.cnc_uren),
    mont: num(s?.uren_montage ?? s?.uren_mont),
    reis: num(s?.uren_reis ?? s?.reis_uren),
  };
}

function plannedFromAssignmentRows(rows, planFactor){
  const out = emptyTotals();
  const pf = Number(planFactor || 1) || 1;

  for (const r of rows || []) {
    const wt = String(r.work_type || "").toLowerCase().trim();
    const emp = String(r.werknemer_id ?? "").trim();
    const note = String(r.note || "");
    const isConcept = emp === "999998" || emp === "999999";
    const isInhuur = note.startsWith("inhuur:");

    let h;
    if (isConcept) h = parseConceptHours(note, DEFAULT_HOURS) * pf;
    else if (isInhuur) h = DEFAULT_HOURS * pf;
    else h = num(r.hours || DEFAULT_HOURS) / pf;

    if (!(h > 0)) continue;

    if (wt === "wvb" || wt === "werkvoorbereiding" || wt.includes("werkvoor")) out.prep += h;
    else if (wt === "productie") out.prod += h;
    else if (wt === "cnc") out.cnc += h;
    else if (wt === "montage") out.mont += h;
    else if (wt === "reis") out.reis += h;
  }

  return out;
}

function miniHoursHtml(req, planned){
  return `
    <div class="alltime-hours-mini">
      <div class="alltime-hours-row"><span>Wvb</span><b>${esc(fmt(req.prep))}</b><i>|</i><strong>${esc(fmt(planned.prep))}</strong></div>
      <div class="alltime-hours-row"><span>Prod.+CNC</span><b>${esc(fmt(num(req.prod) + num(req.cnc)))}</b><i>|</i><strong>${esc(fmt(num(planned.prod) + num(planned.cnc)))}</strong></div>
      <div class="alltime-hours-row"><span>Mont.+Reis</span><b>${esc(fmt(num(req.mont) + num(req.reis)))}</b><i>|</i><strong>${esc(fmt(num(planned.mont) + num(planned.reis)))}</strong></div>
    </div>
  `;
}

function ensureStyle(){
  if (document.getElementById("allTimeHoursColumnStyle")) return;
  const style = document.createElement("style");
  style.id = "allTimeHoursColumnStyle";
  style.textContent = `
    .alltime-hours-mini{
      width:100%;
      font-size:11px;
      line-height:1.15;
      color:#0f172a;
      padding:1px 2px;
      box-sizing:border-box;
    }
    .alltime-hours-row{
      display:grid;
      grid-template-columns:minmax(48px,1fr) 28px 7px 30px;
      gap:2px;
      align-items:center;
      white-space:nowrap;
    }
    .alltime-hours-row span{ overflow:hidden; text-overflow:ellipsis; color:#334155; }
    .alltime-hours-row b,
    .alltime-hours-row strong{ font-weight:500; text-align:right; }
    .alltime-hours-row i{ font-style:normal; color:#94a3b8; text-align:center; }
  `;
  document.head.appendChild(style);
}

async function loadAllTimeData(force = false){
  const now = Date.now();
  if (!force && allTimeCache && (now - allTimeCacheAt) < 30000) return allTimeCache;

  const [sectionsRes, sectionAssignRes, projectAssignRes] = await Promise.all([
    sbAllTimeHours.from("secties").select("*").limit(50000),
    sbAllTimeHours.from("section_assignments").select("section_id, work_date, werknemer_id, work_type, hours, note").limit(200000),
    sbAllTimeHours.from("project_assignments").select("project_id, work_date, werknemer_id, work_type, hours, note").limit(200000),
  ]);

  if (sectionsRes.error) throw sectionsRes.error;
  if (sectionAssignRes.error) throw sectionAssignRes.error;
  if (projectAssignRes.error) throw projectAssignRes.error;

  const sections = sectionsRes.data || [];
  const sectionAssigns = sectionAssignRes.data || [];
  const projectAssigns = projectAssignRes.data || [];

  const alias = new Map();
  const sectionByCanon = new Map();
  const sectionIdsByProject = new Map();

  for (const s of sections) {
    const canon = canonicalSectionId(s);
    if (!canon) continue;
    sectionByCanon.set(canon, s);
    addAlias(alias, s.id, canon);
    addAlias(alias, s.section_id, canon);

    const pid = String(s.project_id ?? s.projectid ?? s.project ?? s.project_ref ?? "").trim();
    if (pid) {
      if (!sectionIdsByProject.has(pid)) sectionIdsByProject.set(pid, []);
      sectionIdsByProject.get(pid).push(canon);
    }
  }

  const rowsBySection = new Map();
  for (const r of sectionAssigns) {
    const sid = alias.get(String(r.section_id ?? "").trim()) || String(r.section_id ?? "").trim();
    if (!sid) continue;
    if (!rowsBySection.has(sid)) rowsBySection.set(sid, []);
    rowsBySection.get(sid).push(r);
  }

  const rowsByProject = new Map();
  for (const r of projectAssigns) {
    const pid = String(r.project_id ?? "").trim();
    if (!pid) continue;
    if (!rowsByProject.has(pid)) rowsByProject.set(pid, []);
    rowsByProject.get(pid).push(r);
  }

  allTimeCache = { sections, alias, sectionByCanon, sectionIdsByProject, rowsBySection, rowsByProject };
  allTimeCacheAt = now;
  return allTimeCache;
}

function getPlanFactor(){
  const ctx = window.__plannerCtx;
  const pf = Number(ctx?.settings?.planFactor || window.settings?.planFactor || 1);
  return Number.isFinite(pf) && pf > 0 ? pf : 1;
}

function getSectionTotals(data, sectionId){
  const sid = data.alias.get(String(sectionId || "").trim()) || String(sectionId || "").trim();
  const s = data.sectionByCanon.get(sid);
  const req = s ? requiredFromSection(s) : emptyTotals();
  const planned = plannedFromAssignmentRows(data.rowsBySection.get(sid) || [], getPlanFactor());
  return { req, planned };
}

function getProjectTotals(data, projectId){
  const pid = String(projectId || "").trim();
  const req = emptyTotals();
  const planned = emptyTotals();

  for (const sid of data.sectionIdsByProject.get(pid) || []) {
    const s = data.sectionByCanon.get(sid);
    if (s) addTotals(req, requiredFromSection(s));
    addTotals(planned, plannedFromAssignmentRows(data.rowsBySection.get(sid) || [], getPlanFactor()));
  }

  addTotals(planned, plannedFromAssignmentRows(data.rowsByProject.get(pid) || [], getPlanFactor()));
  return { req, planned };
}

function updateVisibleHoursCells(data){
  ensureStyle();

  document.querySelectorAll("tr.project-row").forEach(row => {
    const pid = row.querySelector(".expander[data-proj]")?.dataset?.proj;
    const cell = row.querySelector("td.hourscol");
    if (!pid || !cell) return;
    const { req, planned } = getProjectTotals(data, pid);
    cell.innerHTML = miniHoursHtml(req, planned);
  });

  document.querySelectorAll("tr.section-row:not(.productie-summary-row):not(.montage-summary-row)").forEach(row => {
    const sid = row.querySelector(".sectname[data-sect]")?.dataset?.sect;
    const cell = row.querySelector("td.hourscol");
    if (!sid || !cell) return;
    const { req, planned } = getSectionTotals(data, sid);
    cell.innerHTML = miniHoursHtml(req, planned);
  });
}

async function applyAllTimeHours(force = false){
  if (allTimeRunning) return;
  allTimeRunning = true;
  try {
    const data = await loadAllTimeData(force);
    updateVisibleHoursCells(data);
    window.dispatchEvent(new CustomEvent("planning:all-time-hours-updated"));
  } catch (err) {
    console.warn("Alle geplande uren laden mislukt:", err?.message || err);
  } finally {
    allTimeRunning = false;
  }
}

function scheduleAllTimeHours(delay = 350, force = false){
  if (allTimePending) return;
  allTimePending = true;
  window.setTimeout(() => {
    allTimePending = false;
    applyAllTimeHours(force);
  }, delay);
}

window.addEventListener("DOMContentLoaded", () => {
  scheduleAllTimeHours(800, true);
  scheduleAllTimeHours(2200, false);
});
window.addEventListener("load", () => scheduleAllTimeHours(800, true));

const observer = new MutationObserver(() => scheduleAllTimeHours(900, false));
observer.observe(document.body, { childList:true, subtree:true });

// Na opslaan/verwijderen in modals snel opnieuw uit Supabase laden.
document.addEventListener("click", (ev) => {
  const label = txt(ev.target.closest("button"));
  if (/^(Opslaan|Verwijderen|Bijwerken)$/i.test(label)) {
    allTimeCache = null;
    scheduleAllTimeHours(1500, true);
  }
}, true);
