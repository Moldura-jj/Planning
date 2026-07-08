import { makeSupabaseClient } from "./auth.js";

// planning-project-include-capacity-fix.js
// Als een project met het schakelaartje op "planning uit" staat, tellen de uren
// niet mee in de capaciteitsregels onder de planning. Uren blijven in Supabase staan.

const sb = makeSupabaseClient();
const INCLUDE_KEY = "moldura_project_include_planning_v1";
const DUMMY_SEC_ID = "999998";
const DUMMY_PROJECT_ID = "999999";
const DEFAULT_HOURS = 7.5;
let timer = null;
let running = false;
let cache = null;
let cacheAt = 0;

function textOf(el){ return String(el?.innerText || el?.textContent || "").replace(/\s+/g," ").trim(); }
function num(v){ const n = Number(String(v ?? "0").replace(",",".")); return Number.isFinite(n) ? n : 0; }
function fmt(v){ const n = Math.round((Number(v||0)+Number.EPSILON)*10)/10; return String(n).replace(".",","); }
function parseConcept(note, fallback = DEFAULT_HOURS){
  const m = String(note||"").match(/concept-hours:([0-9]+(?:[,.][0-9]+)?)/i);
  const h = m ? num(m[1]) : fallback;
  return h > 0 ? h : fallback;
}
function normKey(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,""); }
function pickKey(sample, keys){
  const cols = Object.keys(sample || {});
  for(const k of keys){
    const exact = cols.find(c => c === k);
    if(exact) return exact;
    const loose = cols.find(c => normKey(c) === normKey(k));
    if(loose) return loose;
  }
  return "";
}
function readIncludeMap(){
  try { return JSON.parse(localStorage.getItem(INCLUDE_KEY) || "{}"); }
  catch { return {}; }
}
function getPlanFactor(){
  const pf = Number(window.__plannerCtx?.settings?.planFactor || window.settings?.planFactor || 0.8);
  return Number.isFinite(pf) && pf > 0 ? pf : 0.8;
}
function getDates(){
  return Array.from(document.querySelectorAll(".dayhead-btn[data-iso], th[data-iso], .dayhead[data-iso]"))
    .map(el => String(el.dataset.iso || "").slice(0,10))
    .filter(Boolean)
    .filter((v,i,a)=>a.indexOf(v)===i);
}
function emptyDayMap(dates){
  const o = {};
  for(const d of dates) o[d] = 0;
  return o;
}
function add(o, d, h){ if(d && Object.prototype.hasOwnProperty.call(o,d)) o[d] = num(o[d]) + num(h); }
function isProdType(t){ return t === "productie" || t === "cnc"; }
function isMontType(t){ return t === "montage" || t === "reis"; }
function isWvbType(t){ return t === "wvb" || t === "werkvoorbereiding" || t.includes("werkvoor"); }

async function optionalSelect(table, select){
  const res = await sb.from(table).select(select).limit(200000);
  if(res.error){ console.warn(`Project include capaciteit: ${table} overgeslagen`, res.error.message); return []; }
  return res.data || [];
}
async function loadData(force=false){
  const now = Date.now();
  if(!force && cache && (now-cacheAt)<30000) return cache;

  const projectsRes = await sb.from("projecten").select("*").limit(50000);
  if(projectsRes.error) throw projectsRes.error;
  const projects = projectsRes.data || [];
  const sampleP = projects[0] || {};
  const projectIdKey = pickKey(sampleP, ["id","project_id"]);
  const statusKey = pickKey(sampleP, ["salesstatus","projectstatus","project_status","status","status_id","sales_status"]);
  const status2 = new Set();
  for(const p of projects){
    const pid = String(p?.[projectIdKey] ?? "").trim();
    if(pid && String(p?.[statusKey] ?? "").trim() === "2") status2.add(pid);
  }

  const sectionsRes = await sb.from("secties").select("*").limit(50000);
  if(sectionsRes.error) throw sectionsRes.error;
  const sections = sectionsRes.data || [];
  const sampleS = sections[0] || {};
  const sectIdKey = pickKey(sampleS, ["id","section_id"]);
  const sectProjKey = pickKey(sampleS, ["project_id","projectid","project","project_ref"]);

  const sectionPid = new Map();
  const alias = new Map();
  for(const s of sections){
    const canon = String(s?.id ?? s?.[sectIdKey] ?? s?.section_id ?? "").trim();
    const old = String(s?.section_id ?? "").trim();
    const pid = String(s?.[sectProjKey] ?? "").trim();
    if(canon && pid) sectionPid.set(canon, pid);
    if(canon) alias.set(canon, canon);
    if(old && canon) alias.set(old, canon);
  }

  const sectionAssigns = await optionalSelect("section_assignments", "section_id, work_date, werknemer_id, work_type, hours, note");
  let projectAssigns = [];
  for(const table of ["project_assignments", "projecten_planner", "project_assignments_planner"]){
    const rows = await optionalSelect(table, "project_id, work_date, werknemer_id, work_type, hours, note");
    if(rows.length){ projectAssigns = rows; break; }
  }

  cache = { status2, alias, sectionPid, sectionAssigns, projectAssigns };
  cacheAt = now;
  return cache;
}
function projectIncluded(pid, data){
  const map = readIncludeMap();
  const key = String(pid || "").trim();
  if(!key) return true;
  if(Object.prototype.hasOwnProperty.call(map, key)) return !!map[key];
  return !data.status2.has(key);
}
function computePlanned(dates, data){
  const pf = getPlanFactor();
  const prod = emptyDayMap(dates);
  const mont = emptyDayMap(dates);
  const wvb = emptyDayMap(dates);

  for(const r of data.sectionAssigns || []){
    const rawSid = String(r.section_id ?? "").trim();
    const sid = data.alias.get(rawSid) || rawSid;
    const pid = data.sectionPid.get(sid);
    if(pid && !projectIncluded(pid, data)) continue;

    const iso = String(r.work_date || "").slice(0,10);
    if(!Object.prototype.hasOwnProperty.call(prod, iso)) continue;
    const wt = String(r.work_type || "").toLowerCase().trim();
    const emp = String(r.werknemer_id ?? "").trim();
    const note = String(r.note || "");
    const isConcept = emp === DUMMY_SEC_ID;
    const isInhuur = note.startsWith("inhuur:");

    let h = 0;
    if(isConcept && isWvbType(wt)) h = parseConcept(note) / pf;
    else if(isConcept) h = parseConcept(note) * pf;
    else if(isInhuur) h = DEFAULT_HOURS;
    else h = num(r.hours || 0) / pf;

    if(isProdType(wt)) add(prod, iso, h);
    else if(isMontType(wt)) add(mont, iso, h);
    else if(isWvbType(wt)) add(wvb, iso, h);
  }

  for(const r of data.projectAssigns || []){
    const pid = String(r.project_id ?? "").trim();
    if(pid && !projectIncluded(pid, data)) continue;

    const iso = String(r.work_date || "").slice(0,10);
    if(!Object.prototype.hasOwnProperty.call(prod, iso)) continue;
    const wt = String(r.work_type || "").toLowerCase().trim();
    const emp = String(r.werknemer_id ?? "").trim();
    const note = String(r.note || "");
    const isConcept = emp === DUMMY_PROJECT_ID;
    const isInhuur = note.startsWith("inhuur:");
    const h = isConcept ? parseConcept(note) : isInhuur ? DEFAULT_HOURS : num(r.hours || DEFAULT_HOURS);

    if(isProdType(wt)) add(prod, iso, h);
    else if(isMontType(wt)) add(mont, iso, h);
    else if(isWvbType(wt)) add(wvb, iso, h);
  }

  return { prod, mont, wvb };
}
function findRow(label, requiredClass=""){
  const rows = Array.from(document.querySelectorAll(".planner-table tbody tr"));
  const l = String(label).toLowerCase();
  return rows.find(row => {
    if(requiredClass && !row.classList.contains(requiredClass)) return false;
    const first = row.querySelector("td.rowhdr, th.rowhdr, td:first-child, th:first-child");
    return textOf(first).toLowerCase().includes(l);
  }) || null;
}
function rowValues(row, dates){
  const out = emptyDayMap(dates);
  if(!row) return out;
  const cells = Array.from(row.children).slice(2);
  dates.forEach((d,i)=> out[d] = num(textOf(cells[i])));
  return out;
}
function updateRow(row, dates, values){
  if(!row) return;
  const cells = Array.from(row.children).slice(2);
  dates.forEach((d,i)=>{ if(cells[i]) cells[i].textContent = fmt(values[d] || 0); });
}
async function apply(force=false){
  if(running) return;
  running = true;
  try{
    const dates = getDates();
    if(!dates.length) return;
    const data = await loadData(force);
    const planned = computePlanned(dates, data);

    const prodRow = findRow("Gepland productie", "planned-prod") || findRow("Gepland productie");
    const montRow = findRow("Gepland montage", "planned-mont") || findRow("Gepland montage");
    const wvbRow = findRow("Gepland WVB", "planned-wvb") || findRow("Gepland WVB");
    updateRow(prodRow, dates, planned.prod);
    updateRow(montRow, dates, planned.mont);
    updateRow(wvbRow, dates, planned.wvb);

    const capRow = findRow("Uren beschikbaar");
    const verlofRow = findRow("Verlof", "planned-absence") || findRow("Verlof");
    const saldoRow = findRow("Saldo");
    const cap = rowValues(capRow, dates);
    const verlof = rowValues(verlofRow, dates);
    const saldo = emptyDayMap(dates);
    dates.forEach(d => saldo[d] = Math.round((num(cap[d]) - num(planned.prod[d]) - num(planned.mont[d]) - num(verlof[d])) * 10) / 10);
    updateRow(saldoRow, dates, saldo);

    const wvbCapRow = findRow("Uren beschikbaar WVB");
    const wvbVerlofRow = findRow("Verlof WVB");
    const wvbSaldoRow = findRow("Saldo WVB");
    const wvbCap = rowValues(wvbCapRow, dates);
    const wvbVerlof = rowValues(wvbVerlofRow, dates);
    const wvbSaldo = emptyDayMap(dates);
    dates.forEach(d => wvbSaldo[d] = Math.round((num(wvbCap[d]) - num(planned.wvb[d]) - num(wvbVerlof[d])) * 10) / 10);
    updateRow(wvbSaldoRow, dates, wvbSaldo);
  }catch(e){
    console.warn("Project include capaciteit corrigeren mislukt:", e?.message || e);
  }finally{
    running = false;
  }
}
function schedule(delay=600, force=false){
  window.clearTimeout(timer);
  timer = window.setTimeout(()=>apply(force), delay);
}

window.addEventListener("DOMContentLoaded", ()=>{ schedule(1200,true); schedule(2600,false); });
window.addEventListener("load", ()=>schedule(1000,true));
window.addEventListener("planning:project-include-changed", ()=>{ cache=null; schedule(200,true); schedule(1200,true); });

document.addEventListener("click", ev => {
  if(ev.target.closest("#btnPrev, #btnNext, #amSave, #btnSettingsSave")) { cache=null; schedule(1800,true); }
}, true);

const obs = new MutationObserver(()=>schedule(900,false));
obs.observe(document.body, { childList:true, subtree:true });
