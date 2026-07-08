import { makeSupabaseClient } from "./auth.js";

// planning-block-edit-v3.js
// Blokeditor voor aaneengesloten sectieplanning.
// - gewone klik = heel aaneengesloten blok
// - Shift + klik = losse dag
// - Concept gebruikt dezelfde dummy-id als planning.js: 999998
// - Concept wordt opgeslagen als note concept-hours:<uren>, zodat arcering behouden blijft

const sb = makeSupabaseClient();
const CONCEPT_EMP_ID = "999998";
const HIDE_EMP_IDS = new Set(["999998", "999999", "9999999", "-1"]);
let employeesCache = null;
let ctxBlock = null;

function t(el){ return String(el?.innerText || el?.textContent || "").replace(/\s+/g," ").trim(); }
function esc(s){ return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function parseHours(v){ const n = Number(String(v ?? "").replace(",",".").trim()); return Number.isFinite(n) ? n : 0; }
function fmtHours(n){ const v = Math.round((Number(n||0)+Number.EPSILON)*100)/100; return (v % 1 === 0 ? String(v) : v.toFixed(2)).replace(".",",").replace(/,00$/,""); }
function parseISO(iso){ const m=String(iso||"").slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
function fmtDate(iso){ const d=parseISO(iso); return d ? d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"numeric"}) : iso; }

function ensureStyle(){
  if(document.getElementById("blockEditV3Style")) return;
  const st=document.createElement("style");
  st.id="blockEditV3Style";
  st.textContent=`
    .planner-table td.block-edit-selected{outline:2px solid #2563eb!important;outline-offset:-2px;background:#dbeafe!important}
    .block-edit-backdrop{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.38);padding:18px}
    .block-edit-backdrop.show{display:flex}
    .block-edit-modal{width:min(760px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:hidden;border-radius:14px;background:#fff;border:1px solid rgba(148,163,184,.5);box-shadow:0 24px 80px rgba(15,23,42,.28);display:flex;flex-direction:column}
    .block-edit-hd{padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px}
    .block-edit-title{font-size:15px;font-weight:800;color:#0f172a}.block-edit-sub{margin-top:3px;color:#64748b;font-size:12px;line-height:1.35;white-space:pre-line}
    .block-edit-close{width:32px;height:32px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:16px}
    .block-edit-bd{padding:14px 16px;overflow:auto}.block-edit-ft{padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;background:#f8fafc}
    .block-edit-grid{display:grid;grid-template-columns:180px 1fr;gap:14px}.block-edit-field label,.block-edit-emps-title{display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:5px}
    .block-edit-field input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px}.block-edit-help{margin-top:5px;color:#64748b;font-size:11px;line-height:1.35}
    .block-edit-emps{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px 10px;max-height:260px;overflow:auto;padding:8px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
    .block-edit-emp{display:flex;align-items:center;gap:6px;font-size:12px;color:#0f172a;padding:5px 6px;border-radius:8px;background:#fff;border:1px solid #e5e7eb}.block-edit-concept{border-color:#c4b5fd;background:#f5f3ff;color:#4c1d95;font-weight:800;margin-bottom:6px}
    .block-edit-dates{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}.block-edit-date-row{display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}.block-edit-date-row:last-child{border-bottom:none}.block-edit-date-row input{border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;text-align:right}
    .block-edit-warning{margin-top:12px;padding:9px 10px;border-radius:10px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:12px;line-height:1.35}.block-edit-btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 12px;cursor:pointer;font-weight:700}.block-edit-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}
    @media(max-width:700px){.block-edit-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

function ensureModal(){
  ensureStyle();
  let w=document.getElementById("blockEditBackdrop");
  if(w) return w;
  w=document.createElement("div");
  w.id="blockEditBackdrop";
  w.className="block-edit-backdrop";
  w.innerHTML=`<div class="block-edit-modal" role="dialog" aria-modal="true"><div class="block-edit-hd"><div><div class="block-edit-title" id="blockEditTitle">Blok aanpassen</div><div class="block-edit-sub" id="blockEditSub"></div></div><button type="button" class="block-edit-close" aria-label="Sluiten">×</button></div><div class="block-edit-bd" id="blockEditBody"></div><div class="block-edit-ft"><button type="button" class="block-edit-btn" data-action="cancel">Annuleren</button><button type="button" class="block-edit-btn primary" data-action="save">Opslaan</button></div></div>`;
  document.body.appendChild(w);
  w.querySelector(".block-edit-close").addEventListener("click", closeModal);
  w.querySelector("[data-action='cancel']").addEventListener("click", closeModal);
  w.querySelector("[data-action='save']").addEventListener("click", saveBlock);
  w.addEventListener("click", e => { if(e.target===w) closeModal(); });
  return w;
}
function closeModal(){ document.getElementById("blockEditBackdrop")?.classList.remove("show"); clearSelection(); }
function clearSelection(){ document.querySelectorAll("td.block-edit-selected").forEach(td=>td.classList.remove("block-edit-selected")); }

function datesFromHeader(){ return Array.from(document.querySelectorAll(".dayhead-btn[data-iso],th[data-iso],.dayhead[data-iso]")).map(e=>String(e.dataset.iso||"").slice(0,10)).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i); }
function dateForCell(row,cell){ const i=Array.from(row.children||[]).indexOf(cell); return i>=2 ? (datesFromHeader()[i-2]||"") : ""; }
function cellForDate(row,iso){ const i=datesFromHeader().indexOf(iso); return i>=0 ? row.children[i+2] : null; }
function sectionId(row){ return String(row?.querySelector(".sectname[data-sect]")?.dataset?.sect||"").trim(); }
function entry(ctx,sid,iso){ return ctx?.assignMap?.get(String(sid))?.get(String(iso)) || null; }

function isConcept(e,kind){
  if(!e) return false;
  return kind === "montage"
    ? Number(e.dummyMontHours||0)>0 || Number(e.dummyReisHours||0)>0 || Number(e.dummyMont||0)>0 || Number(e.dummyReis||0)>0
    : Number(e.dummyProdHours||0)>0 || Number(e.dummyCncHours||0)>0 || Number(e.dummyProd||0)>0 || Number(e.dummyCnc||0)>0;
}
function hasKind(e,kind){
  if(!e) return false;
  return kind === "montage"
    ? Number(e.montHours||0)>0 || Number(e.reisHours||0)>0 || (e.montage?.size||0)>0 || (e.reis?.size||0)>0 || isConcept(e,"montage")
    : Number(e.prodHours||0)>0 || Number(e.cncHours||0)>0 || (e.productie?.size||0)>0 || (e.cnc?.size||0)>0 || isConcept(e,"productie");
}
function hoursOf(e,kind){
  if(!e) return 7.5;
  return kind === "montage"
    ? Number(e.montHours||0) || Number(e.reisHours||0) || Number(e.dummyMontHours||0) || Number(e.dummyReisHours||0) || 7.5
    : Number(e.prodHours||0) || Number(e.cncHours||0) || Number(e.dummyProdHours||0) || Number(e.dummyCncHours||0) || 7.5;
}
function empSet(e,kind){
  const s=new Set(); if(!e) return s;
  const groups = kind === "montage" ? [e.montage,e.reis] : [e.productie,e.cnc];
  for(const g of groups) for(const id of (g||[])) if(!HIDE_EMP_IDS.has(String(id))) s.add(String(id));
  return s;
}
function kindFrom(cell,e){
  const txt=t(cell).toLowerCase(); const cls=String(cell?.className||"").toLowerCase();
  if(cls.includes("mont") || txt.includes("mont") || cell.querySelector(".bar-mont,.cap-cell-fill.mont")) return "montage";
  if(cls.includes("prod") || txt.includes("prod") || cell.querySelector(".bar-prod,.cap-cell-fill.prod")) return "productie";
  const hp=hasKind(e,"productie"), hm=hasKind(e,"montage");
  if(hp && !hm) return "productie"; if(hm && !hp) return "montage"; if(hp) return "productie"; return "";
}
function contiguous(ctx,sid,iso,kind,single){
  if(single) return [iso];
  const all=datesFromHeader(); const i=all.indexOf(iso); if(i<0) return [iso];
  let a=i,b=i; while(a>0 && hasKind(entry(ctx,sid,all[a-1]),kind)) a--; while(b<all.length-1 && hasKind(entry(ctx,sid,all[b+1]),kind)) b++;
  return all.slice(a,b+1);
}

async function loadEmployees(){
  if(employeesCache) return employeesCache;
  const {data,error}=await sb.from("werknemers").select("*").limit(5000);
  if(error){ console.warn("Blokeditor werknemers laden mislukt", error.message); employeesCache=[]; return employeesCache; }
  employeesCache=(data||[]).map(r=>({id:String(r.id??r.werknemer_id??r.employee_id??"").trim(), name:String(r.naam??r.name??r.fullname??r.display_name??"").trim()})).filter(x=>x.id&&x.name&&!HIDE_EMP_IDS.has(x.id)).sort((a,b)=>a.name.localeCompare(b.name,"nl"));
  return employeesCache;
}
function sectionLabel(ctx,sid){ const s=ctx?.sectById?.get(String(sid)); const p=String(s?.[ctx.sectParaKey]??s?.paragraph??"").trim(); const n=String(s?.[ctx.sectNameKey]??s?.name??"Sectie").trim(); return [p,n].filter(Boolean).join(" "); }
function projectLabel(ctx,sid){ const s=ctx?.sectById?.get(String(sid)); const pid=String(s?.[ctx.sectProjKey]||"").trim(); const p=ctx?.projMetaById?.get(pid)||{}; return [p.nr,p.nm].filter(Boolean).join(" - "); }
function highlight(row,dates){ clearSelection(); dates.forEach(d=>cellForDate(row,d)?.classList.add("block-edit-selected")); }

async function openEditor(row,cell,shiftKey){
  const ctx=window.__plannerCtx; if(!ctx?.assignMap) return;
  const sid=sectionId(row), iso=dateForCell(row,cell); if(!sid||!iso) return;
  const e=entry(ctx,sid,iso); if(!e) return;
  const kind=kindFrom(cell,e); if(!kind || !hasKind(e,kind)) return;
  const dates=contiguous(ctx,sid,iso,kind,!!shiftKey);
  const employees=await loadEmployees();
  const selected=new Set(); const hours={}; let concept=false;
  for(const d of dates){ const en=entry(ctx,sid,d); empSet(en,kind).forEach(id=>selected.add(id)); if(isConcept(en,kind)) concept=true; hours[d]=hoursOf(en,kind); }
  ctxBlock={sid,dates,kind,row}; highlight(row,dates);
  const w=ensureModal();
  w.querySelector("#blockEditTitle").textContent=`${kind==="montage"?"Montageblok":"Productieblok"} aanpassen`;
  w.querySelector("#blockEditSub").textContent=`${projectLabel(ctx,sid)}\n${sectionLabel(ctx,sid)}\n${dates.length} dag(en): ${fmtDate(dates[0])} t/m ${fmtDate(dates[dates.length-1])}`;
  const body=w.querySelector("#blockEditBody");
  body.innerHTML=`<div class="block-edit-grid"><div><div class="block-edit-field"><label>Uren per dag</label><input id="blockEditHoursAll" type="text" value="${esc(fmtHours(hours[dates[0]]||7.5))}"/><div class="block-edit-help">Deze waarde wordt op alle dagen gezet. Je kunt hieronder per dag nog afwijken.</div></div></div><div><div class="block-edit-emps-title">Concept / medewerker(s)</div><div class="block-edit-emps"><label class="block-edit-emp block-edit-concept"><input type="checkbox" id="blockEditConcept" ${concept||!selected.size?"checked":""}/> <span>Concept</span></label>${employees.map(emp=>`<label class="block-edit-emp"><input type="checkbox" class="blockEditEmp" value="${esc(emp.id)}" ${selected.has(emp.id)?"checked":""}/> <span>${esc(emp.name)}</span></label>`).join("")}</div></div></div><div class="block-edit-dates">${dates.map(d=>`<div class="block-edit-date-row"><div>${esc(fmtDate(d))}</div><input class="blockEditDateHours" data-date="${esc(d)}" type="text" value="${esc(fmtHours(hours[d]||7.5))}"/></div>`).join("")}</div><div class="block-edit-warning">Normale klik selecteert een aaneengesloten blok. Shift + klik selecteert één losse dag. Opslaan vervangt voor deze dagen de bestaande ${kind==="montage"?"Mont.+Reis":"Prod.+CNC"}-planning door Concept en/of gekozen medewerker(s) en uren.</div>`;
  body.querySelector("#blockEditHoursAll")?.addEventListener("change",ev=>body.querySelectorAll(".blockEditDateHours").forEach(inp=>inp.value=ev.target.value));
  w.classList.add("show");
}

async function saveBlock(){
  if(!ctxBlock) return;
  const w=ensureModal(), body=w.querySelector("#blockEditBody");
  const concept=!!body.querySelector("#blockEditConcept")?.checked;
  const employees=Array.from(body.querySelectorAll(".blockEditEmp:checked")).map(x=>String(x.value||"").trim()).filter(Boolean);
  if(!concept && !employees.length){ alert("Kies Concept of minimaal één medewerker."); return; }
  const hours=new Map();
  for(const inp of body.querySelectorAll(".blockEditDateHours")){ const iso=String(inp.dataset.date||"").trim(); const h=parseHours(inp.value); if(!iso || !(h>0)){ alert("Vul geldige uren per dag in."); return; } hours.set(iso,h); }
  const types=ctxBlock.kind==="montage"?["montage","reis"]:["productie","cnc"];
  const primary=ctxBlock.kind==="montage"?"montage":"productie";
  const rows=[];
  for(const iso of ctxBlock.dates){ const h=hours.get(iso)||0;
    if(concept) rows.push({section_id:ctxBlock.sid, work_date:iso, werknemer_id:Number(CONCEPT_EMP_ID), work_type:primary, note:`concept-hours:${h}`});
    for(const emp of employees) rows.push({section_id:ctxBlock.sid, work_date:iso, werknemer_id:Number(emp), work_type:primary, hours:h});
  }
  for(const iso of ctxBlock.dates){
    const del=await sb.from("section_assignments").delete().eq("section_id",ctxBlock.sid).eq("work_date",iso).in("work_type",types);
    if(del.error){ alert("Fout bij verwijderen oude blokplanning: "+del.error.message); return; }
  }
  if(rows.length){ const ins=await sb.from("section_assignments").insert(rows); if(ins.error){ alert("Fout bij opslaan blokplanning: "+ins.error.message); return; } }
  w.classList.remove("show"); setTimeout(()=>window.location.reload(),250);
}

function sectionCell(row,cell){ if(!row?.classList?.contains("section-row")) return false; if(row.classList.contains("productie-summary-row")||row.classList.contains("montage-summary-row")) return false; return Array.from(row.children||[]).indexOf(cell)>=2; }
function handleClick(ev){
  const cell=ev.target.closest("td.cell,td.plan-cell,td"); const row=cell?.closest("tr.section-row");
  if(!cell||!row||!sectionCell(row,cell)) return;
  const ctx=window.__plannerCtx, sid=sectionId(row), iso=dateForCell(row,cell), e=entry(ctx,sid,iso);
  if(!e || (!hasKind(e,"productie")&&!hasKind(e,"montage"))) return;
  ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  openEditor(row,cell,ev.shiftKey);
}

ensureStyle();
document.addEventListener("click", handleClick, true);
