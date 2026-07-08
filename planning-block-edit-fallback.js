import { makeSupabaseClient } from "./auth.js";

// planning-block-edit-fallback.js
// Fallback voor geplande sectiecellen die de normale blokeditor mist.
// Leest de planning direct uit section_assignments.

const sbFallback = makeSupabaseClient();
const CONCEPT_EMP_ID = "999998";
const HIDE_IDS = new Set(["999998", "999999", "9999999", "-1"]);
let fbEmployees = null;
let fbCtx = null;

function txt(el){ return String(el?.innerText || el?.textContent || "").replace(/\s+/g," ").trim(); }
function esc(s){ return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function parseH(v){ const n = Number(String(v ?? "").replace(",",".").trim()); return Number.isFinite(n) ? n : 0; }
function fmtH(n){ const v=Math.round((Number(n||0)+Number.EPSILON)*100)/100; return (v%1===0?String(v):v.toFixed(2)).replace(".",",").replace(/,00$/,""); }
function parseConcept(note){ const m=String(note||"").match(/concept-hours:([0-9]+(?:[,.][0-9]+)?)/i); return m ? parseH(m[1]) : 0; }
function parseISO(iso){ const m=String(iso||"").slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
function fmtD(iso){ const d=parseISO(iso); return d ? d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"numeric"}) : iso; }

function ensureStyle(){
  if(document.getElementById("blockEditFallbackStyle")) return;
  const s=document.createElement("style");
  s.id="blockEditFallbackStyle";
  s.textContent=`
    .fallback-block-selected{outline:2px solid #2563eb!important;outline-offset:-2px;background:#dbeafe!important}
    .fallback-block-backdrop{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.38);padding:18px}
    .fallback-block-backdrop.show{display:flex}
    .fallback-block-modal{width:min(760px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:hidden;border-radius:14px;background:#fff;border:1px solid rgba(148,163,184,.5);box-shadow:0 24px 80px rgba(15,23,42,.28);display:flex;flex-direction:column}
    .fallback-block-hd{padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px}.fallback-block-title{font-size:15px;font-weight:800;color:#0f172a}.fallback-block-sub{margin-top:3px;color:#64748b;font-size:12px;line-height:1.35;white-space:pre-line}.fallback-block-close{width:32px;height:32px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:16px}
    .fallback-block-bd{padding:14px 16px;overflow:auto}.fallback-block-ft{padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;background:#f8fafc}
    .fallback-grid{display:grid;grid-template-columns:180px 1fr;gap:14px}.fallback-field label,.fallback-emps-title{display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:5px}.fallback-field input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px}.fallback-help{margin-top:5px;color:#64748b;font-size:11px;line-height:1.35}
    .fallback-emps{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px 10px;max-height:260px;overflow:auto;padding:8px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}.fallback-emp{display:flex;align-items:center;gap:6px;font-size:12px;color:#0f172a;padding:5px 6px;border-radius:8px;background:#fff;border:1px solid #e5e7eb}.fallback-concept{border-color:#c4b5fd;background:#f5f3ff;color:#4c1d95;font-weight:800}
    .fallback-dates{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}.fallback-date-row{display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}.fallback-date-row:last-child{border-bottom:none}.fallback-date-row input{border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;text-align:right}.fallback-warning{margin-top:12px;padding:9px 10px;border-radius:10px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:12px;line-height:1.35}.fallback-btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 12px;cursor:pointer;font-weight:700}.fallback-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}
  `;
  document.head.appendChild(s);
}
function ensureModal(){
  ensureStyle();
  let w=document.getElementById("fallbackBlockBackdrop");
  if(w) return w;
  w=document.createElement("div");
  w.id="fallbackBlockBackdrop";
  w.className="fallback-block-backdrop";
  w.innerHTML=`<div class="fallback-block-modal"><div class="fallback-block-hd"><div><div class="fallback-block-title" id="fallbackBlockTitle">Blok aanpassen</div><div class="fallback-block-sub" id="fallbackBlockSub"></div></div><button class="fallback-block-close" type="button">×</button></div><div class="fallback-block-bd" id="fallbackBlockBody"></div><div class="fallback-block-ft"><button class="fallback-btn" data-act="cancel">Annuleren</button><button class="fallback-btn primary" data-act="save">Opslaan</button></div></div>`;
  document.body.appendChild(w);
  w.querySelector(".fallback-block-close").onclick=closeModal;
  w.querySelector("[data-act='cancel']").onclick=closeModal;
  w.querySelector("[data-act='save']").onclick=saveFallback;
  w.addEventListener("click",e=>{ if(e.target===w) closeModal(); });
  return w;
}
function closeModal(){ document.getElementById("fallbackBlockBackdrop")?.classList.remove("show"); document.querySelectorAll(".fallback-block-selected").forEach(x=>x.classList.remove("fallback-block-selected")); }

function dates(){ return Array.from(document.querySelectorAll(".dayhead-btn[data-iso],th[data-iso],.dayhead[data-iso]")).map(e=>String(e.dataset.iso||"").slice(0,10)).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i); }
function dateFor(row,cell){ const idx=Array.from(row.children||[]).indexOf(cell); return idx>=2 ? dates()[idx-2]||"" : ""; }
function cellFor(row,iso){ const idx=dates().indexOf(iso); return idx>=0 ? row.children[idx+2] : null; }
function sectionId(row){ return String(row?.querySelector(".sectname[data-sect]")?.dataset?.sect||"").trim(); }
function visualKind(cell){ const s=(txt(cell)+" "+String(cell?.className||"")).toLowerCase(); if(s.includes("mont")) return "montage"; if(s.includes("prod") || s.includes("groen")) return "productie"; return ""; }
function types(kind){ return kind==="montage"?["montage","reis"]:["productie","cnc"]; }
function primary(kind){ return kind==="montage"?"montage":"productie"; }
function hasRows(rows,kind){ return rows.some(r=>types(kind).includes(String(r.work_type||"").toLowerCase())); }
function rowHours(rows,kind){ const r=rows.find(x=>types(kind).includes(String(x.work_type||"").toLowerCase())); if(!r) return 0; return Number(r.hours||0) || parseConcept(r.note) || 7.5; }
function rowConcept(rows,kind){ return rows.some(r=>types(kind).includes(String(r.work_type||"").toLowerCase()) && String(r.werknemer_id)===CONCEPT_EMP_ID); }
function rowEmps(rows,kind){ const s=new Set(); rows.filter(r=>types(kind).includes(String(r.work_type||"").toLowerCase())).forEach(r=>{ const id=String(r.werknemer_id); if(!HIDE_IDS.has(id)) s.add(id); }); return s; }

async function loadRows(sectionId,start,end){
  const {data,error}=await sb.from("section_assignments").select("section_id, work_date, werknemer_id, work_type, hours, note").eq("section_id",sectionId).gte("work_date",start).lte("work_date",end).limit(10000);
  if(error){ console.warn("Fallback blok rows laden mislukt", error.message); return []; }
  return data||[];
}
async function loadEmployees(){
  if(fbEmployees) return fbEmployees;
  const {data,error}=await sb.from("werknemers").select("*").limit(5000);
  if(error){ fbEmployees=[]; return fbEmployees; }
  fbEmployees=(data||[]).map(r=>({id:String(r.id??r.werknemer_id??r.employee_id??"").trim(),name:String(r.naam??r.name??r.fullname??r.display_name??"").trim()})).filter(x=>x.id&&x.name&&!HIDE_IDS.has(x.id)).sort((a,b)=>a.name.localeCompare(b.name,"nl"));
  return fbEmployees;
}
function rowsByDate(all){ const m=new Map(); all.forEach(r=>{const d=String(r.work_date||"").slice(0,10); if(!m.has(d)) m.set(d,[]); m.get(d).push(r);}); return m; }
function blockDates(map, iso, kind, single){ if(single) return [iso]; const all=dates(); const i=all.indexOf(iso); if(i<0)return[iso]; let a=i,b=i; while(a>0&&hasRows(map.get(all[a-1])||[],kind))a--; while(b<all.length-1&&hasRows(map.get(all[b+1])||[],kind))b++; return all.slice(a,b+1); }
function labelFor(row){ const s=txt(row.querySelector(".sectname")||row.querySelector("td.section-cell")||row.querySelector("td.rowhdr")); return s||"Sectie"; }

async function openFallback(row,cell,shiftKey){
  const sid=sectionId(row), iso=dateFor(row,cell); if(!sid||!iso) return;
  const allDates=dates(); if(!allDates.length)return;
  const allRows=await loadRows(sid,allDates[0],allDates[allDates.length-1]);
  const map=rowsByDate(allRows);
  const initial=map.get(iso)||[];
  let kind=visualKind(cell);
  if(!kind){ if(hasRows(initial,"productie")&&!hasRows(initial,"montage")) kind="productie"; else if(hasRows(initial,"montage")) kind="montage"; }
  if(!kind || !hasRows(initial,kind)) return;
  const bDates=blockDates(map,iso,kind,!!shiftKey);
  const emps=await loadEmployees();
  const selected=new Set(); const hours={}; let concept=false;
  bDates.forEach(d=>{ const rs=map.get(d)||[]; rowEmps(rs,kind).forEach(id=>selected.add(id)); if(rowConcept(rs,kind))concept=true; hours[d]=rowHours(rs,kind)||7.5; cellFor(row,d)?.classList.add("fallback-block-selected"); });
  fbCtx={sid,dates:bDates,kind,row};
  const w=ensureModal();
  w.querySelector("#fallbackBlockTitle").textContent=`${kind==="montage"?"Montageblok":"Productieblok"} aanpassen`;
  w.querySelector("#fallbackBlockSub").textContent=`${labelFor(row)}\n${bDates.length} dag(en): ${fmtD(bDates[0])} t/m ${fmtD(bDates[bDates.length-1])}`;
  const body=w.querySelector("#fallbackBlockBody");
  body.innerHTML=`<div class="fallback-grid"><div><div class="fallback-field"><label>Uren per dag</label><input id="fallbackHoursAll" type="text" value="${esc(fmtH(hours[bDates[0]]||7.5))}"><div class="fallback-help">Deze waarde wordt op alle dagen gezet.</div></div></div><div><div class="fallback-emps-title">Concept / medewerker(s)</div><div class="fallback-emps"><label class="fallback-emp fallback-concept"><input id="fallbackConcept" type="checkbox" ${concept||!selected.size?"checked":""}> <span>Concept</span></label>${emps.map(e=>`<label class="fallback-emp"><input class="fallbackEmp" type="checkbox" value="${esc(e.id)}" ${selected.has(e.id)?"checked":""}> <span>${esc(e.name)}</span></label>`).join("")}</div></div></div><div class="fallback-dates">${bDates.map(d=>`<div class="fallback-date-row"><div>${esc(fmtD(d))}</div><input class="fallbackDateHours" data-date="${esc(d)}" type="text" value="${esc(fmtH(hours[d]||7.5))}"></div>`).join("")}</div><div class="fallback-warning">Fallback-blokeditor: opslaan vervangt de bestaande ${kind==="montage"?"Mont.+Reis":"Prod.+CNC"}-planning voor deze dagen.</div>`;
  body.querySelector("#fallbackHoursAll")?.addEventListener("change",e=>body.querySelectorAll(".fallbackDateHours").forEach(i=>i.value=e.target.value));
  w.classList.add("show");
}
async function saveFallback(){
  if(!fbCtx)return;
  const w=ensureModal(), body=w.querySelector("#fallbackBlockBody");
  const concept=!!body.querySelector("#fallbackConcept")?.checked;
  const emps=Array.from(body.querySelectorAll(".fallbackEmp:checked")).map(x=>String(x.value||"").trim()).filter(Boolean);
  if(!concept&&!emps.length){ alert("Kies Concept of minimaal één medewerker."); return; }
  const rows=[];
  for(const inp of body.querySelectorAll(".fallbackDateHours")){ const iso=String(inp.dataset.date||""); const h=parseH(inp.value); if(!iso||!(h>0)){alert("Vul geldige uren per dag in.");return;} if(concept) rows.push({section_id:fbCtx.sid,work_date:iso,werknemer_id:Number(CONCEPT_EMP_ID),work_type:primary(fbCtx.kind),note:`concept-hours:${h}`}); emps.forEach(emp=>rows.push({section_id:fbCtx.sid,work_date:iso,werknemer_id:Number(emp),work_type:primary(fbCtx.kind),hours:h})); }
  for(const iso of fbCtx.dates){ const del=await sb.from("section_assignments").delete().eq("section_id",fbCtx.sid).eq("work_date",iso).in("work_type",types(fbCtx.kind)); if(del.error){alert("Fout bij verwijderen: "+del.error.message);return;} }
  const ins=await sb.from("section_assignments").insert(rows); if(ins.error){alert("Fout bij opslaan: "+ins.error.message);return;}
  w.classList.remove("show"); setTimeout(()=>window.location.reload(),250);
}

ensureStyle();
document.addEventListener("click",ev=>{
  const cell=ev.target.closest("td"); const row=cell?.closest("tr.section-row");
  if(!cell||!row||row.classList.contains("productie-summary-row")||row.classList.contains("montage-summary-row"))return;
  const idx=Array.from(row.children||[]).indexOf(cell); if(idx<2)return;
  // wacht v3 af: als v3 het event stopte komt deze handler niet meer aan de beurt.
  openFallback(row,cell,ev.shiftKey).then(()=>{});
}, true);
