import { makeSupabaseClient } from "./auth.js";

// planning-block-edit.js
// Fase 1 + 2:
// - normale klik op gepland sectieblok = aaneengesloten blok openen
// - Shift + klik = alleen die losse dag openen
// - uren per dag aanpassen
// - medewerkers voor het hele blok aanpassen
// - concepturen ondersteunen zonder medewerkerkeuze
//
// Let op: verschuiven van het complete blok volgt in fase 3.

const sbBlockEdit = makeSupabaseClient();
const CONCEPT_EMP_ID = "999999";
const DUMMY_IDS = new Set([CONCEPT_EMP_ID, "9999999", "-1"]);
let blockCtx = null;
let employeesCache = null;

function textOf(el){
  return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseISODateLocal(iso){
  const m = String(iso || "").slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtDateShort(iso){
  const d = parseISODateLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString("nl-NL", { weekday:"short", day:"numeric", month:"numeric" });
}

function fmtHours(n){
  const v = Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  const s = (v % 1 === 0) ? String(v) : v.toFixed(2);
  return s.replace(".", ",").replace(/,00$/, "");
}

function parseHours(v){
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ensureStyle(){
  if (document.getElementById("blockEditStyle")) return;
  const style = document.createElement("style");
  style.id = "blockEditStyle";
  style.textContent = `
    .planner-table td.block-edit-selected{
      outline:2px solid #2563eb !important;
      outline-offset:-2px;
      background-color:#dbeafe !important;
    }
    .block-edit-backdrop{
      position:fixed;
      inset:0;
      z-index:100000;
      display:none;
      align-items:center;
      justify-content:center;
      background:rgba(15,23,42,.38);
      padding:18px;
    }
    .block-edit-backdrop.show{ display:flex; }
    .block-edit-modal{
      width:min(760px, calc(100vw - 36px));
      max-height:calc(100vh - 36px);
      overflow:hidden;
      border-radius:14px;
      background:#fff;
      border:1px solid rgba(148,163,184,.5);
      box-shadow:0 24px 80px rgba(15,23,42,.28);
      display:flex;
      flex-direction:column;
    }
    .block-edit-hd{
      padding:14px 16px;
      border-bottom:1px solid #e2e8f0;
      display:flex;
      justify-content:space-between;
      gap:12px;
    }
    .block-edit-title{ font-size:15px; font-weight:800; color:#0f172a; }
    .block-edit-sub{ margin-top:3px; color:#64748b; font-size:12px; line-height:1.35; white-space:pre-line; }
    .block-edit-close{
      width:32px;
      height:32px;
      border-radius:9px;
      border:1px solid #cbd5e1;
      background:#fff;
      cursor:pointer;
      font-size:16px;
    }
    .block-edit-bd{ padding:14px 16px; overflow:auto; }
    .block-edit-ft{
      padding:12px 16px;
      border-top:1px solid #e2e8f0;
      display:flex;
      justify-content:flex-end;
      gap:8px;
      background:#f8fafc;
    }
    .block-edit-grid{
      display:grid;
      grid-template-columns: 180px 1fr;
      gap:14px;
    }
    .block-edit-field label,
    .block-edit-emps-title{
      display:block;
      font-size:12px;
      font-weight:800;
      color:#334155;
      margin-bottom:5px;
    }
    .block-edit-field input,
    .block-edit-field select{
      width:100%;
      border:1px solid #cbd5e1;
      border-radius:8px;
      padding:8px 10px;
      font-size:13px;
    }
    .block-edit-help{
      margin-top:5px;
      color:#64748b;
      font-size:11px;
      line-height:1.35;
    }
    .block-edit-emps{
      display:grid;
      grid-template-columns:repeat(auto-fill, minmax(170px, 1fr));
      gap:6px 10px;
      max-height:260px;
      overflow:auto;
      padding:8px;
      border:1px solid #e2e8f0;
      border-radius:10px;
      background:#f8fafc;
    }
    .block-edit-emp{
      display:flex;
      align-items:center;
      gap:6px;
      font-size:12px;
      color:#0f172a;
      padding:5px 6px;
      border-radius:8px;
      background:#fff;
      border:1px solid #e5e7eb;
    }
    .block-edit-concept{
      border-color:#c4b5fd;
      background:#f5f3ff;
      color:#4c1d95;
      font-weight:800;
      margin-bottom:6px;
    }
    .block-edit-dates{
      margin-top:14px;
      border:1px solid #e2e8f0;
      border-radius:10px;
      overflow:hidden;
    }
    .block-edit-date-row{
      display:grid;
      grid-template-columns: 1fr 90px;
      gap:10px;
      align-items:center;
      padding:8px 10px;
      border-bottom:1px solid #e2e8f0;
      font-size:12px;
    }
    .block-edit-date-row:last-child{ border-bottom:none; }
    .block-edit-date-row input{
      border:1px solid #cbd5e1;
      border-radius:7px;
      padding:6px 8px;
      text-align:right;
    }
    .block-edit-warning{
      margin-top:12px;
      padding:9px 10px;
      border-radius:10px;
      border:1px solid #fde68a;
      background:#fffbeb;
      color:#92400e;
      font-size:12px;
      line-height:1.35;
    }
    .block-edit-btn{
      border:1px solid #cbd5e1;
      background:#fff;
      border-radius:9px;
      padding:8px 12px;
      cursor:pointer;
      font-weight:700;
    }
    .block-edit-btn.primary{
      background:#2563eb;
      border-color:#2563eb;
      color:#fff;
    }
    @media (max-width: 700px){
      .block-edit-grid{ grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

function ensureModal(){
  ensureStyle();
  let wrap = document.getElementById("blockEditBackdrop");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.id = "blockEditBackdrop";
  wrap.className = "block-edit-backdrop";
  wrap.innerHTML = `
    <div class="block-edit-modal" role="dialog" aria-modal="true">
      <div class="block-edit-hd">
        <div>
          <div class="block-edit-title" id="blockEditTitle">Blok aanpassen</div>
          <div class="block-edit-sub" id="blockEditSub"></div>
        </div>
        <button type="button" class="block-edit-close" aria-label="Sluiten">×</button>
      </div>
      <div class="block-edit-bd" id="blockEditBody"></div>
      <div class="block-edit-ft">
        <button type="button" class="block-edit-btn" data-action="cancel">Annuleren</button>
        <button type="button" class="block-edit-btn primary" data-action="save">Opslaan</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector(".block-edit-close")?.addEventListener("click", closeModal);
  wrap.querySelector("[data-action='cancel']")?.addEventListener("click", closeModal);
  wrap.querySelector("[data-action='save']")?.addEventListener("click", saveBlockEdit);
  wrap.addEventListener("click", (ev) => { if (ev.target === wrap) closeModal(); });
  return wrap;
}

function closeModal(){
  document.getElementById("blockEditBackdrop")?.classList.remove("show");
  clearSelection();
}

function clearSelection(){
  document.querySelectorAll("td.block-edit-selected").forEach(td => td.classList.remove("block-edit-selected"));
}

function getDatesFromHeader(){
  return Array.from(document.querySelectorAll(".dayhead-btn[data-iso], th[data-iso], .dayhead[data-iso]"))
    .map(el => String(el.dataset.iso || "").slice(0,10))
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function getDateForCell(row, cell){
  const cells = Array.from(row.children || []);
  const idx = cells.indexOf(cell);
  if (idx < 2) return "";
  return getDatesFromHeader()[idx - 2] || "";
}

function getCellForDate(row, dateISO){
  const dates = getDatesFromHeader();
  const idx = dates.indexOf(dateISO);
  if (idx < 0) return null;
  return row.children[idx + 2] || null;
}

function getSectionIdFromRow(row){
  return String(row?.querySelector(".sectname[data-sect]")?.dataset?.sect || "").trim();
}

function kindFromCell(cell){
  const t = textOf(cell).toLowerCase();
  const cls = String(cell?.className || "").toLowerCase();
  if (cls.includes("mont") || t.includes("mont") || cell.querySelector(".bar-mont, .cap-cell-fill.mont")) return "montage";
  if (cls.includes("prod") || t.includes("prod") || cell.querySelector(".bar-prod, .cap-cell-fill.prod")) return "productie";
  return "";
}

function typesForKind(kind){
  return kind === "montage" ? ["montage", "reis"] : ["productie", "cnc"];
}

function primaryType(kind){
  return kind === "montage" ? "montage" : "productie";
}

function dummyHoursFromNote(note){
  const m = String(note || "").match(/concept-hours:([0-9]+(?:[,.][0-9]+)?)/i);
  return m ? parseHours(m[1]) : 0;
}

function getEntry(ctx, sectionId, dateISO){
  return ctx?.assignMap?.get(String(sectionId))?.get(String(dateISO)) || null;
}

function entryHasConcept(entry, kind){
  if (!entry) return false;
  if (kind === "montage") return Number(entry.dummyMontHours || 0) > 0 || Number(entry.dummyReisHours || 0) > 0 || Number(entry.dummyMont || 0) > 0 || Number(entry.dummyReis || 0) > 0;
  return Number(entry.dummyProdHours || 0) > 0 || Number(entry.dummyCncHours || 0) > 0 || Number(entry.dummyProd || 0) > 0 || Number(entry.dummyCnc || 0) > 0;
}

function entryHasKind(entry, kind){
  if (!entry) return false;
  if (kind === "montage") {
    return Number(entry.montHours || 0) > 0 || Number(entry.reisHours || 0) > 0 || entryHasConcept(entry, "montage") || (entry.montage?.size || 0) > 0 || (entry.reis?.size || 0) > 0;
  }
  return Number(entry.prodHours || 0) > 0 || Number(entry.cncHours || 0) > 0 || entryHasConcept(entry, "productie") || (entry.productie?.size || 0) > 0 || (entry.cnc?.size || 0) > 0;
}

function entryHours(entry, kind){
  if (!entry) return 0;
  if (kind === "montage") {
    return Number(entry.montHours || 0) || Number(entry.reisHours || 0) || Number(entry.dummyMontHours || 0) || Number(entry.dummyReisHours || 0) || 7.5;
  }
  return Number(entry.prodHours || 0) || Number(entry.cncHours || 0) || Number(entry.dummyProdHours || 0) || Number(entry.dummyCncHours || 0) || 7.5;
}

function entryEmpSet(entry, kind){
  const set = new Set();
  if (!entry) return set;
  const groups = kind === "montage" ? [entry.montage, entry.reis] : [entry.productie, entry.cnc];
  for (const g of groups) for (const id of (g || [])) set.add(String(id));
  return set;
}

function contiguousDates(ctx, sectionId, dateISO, kind, single){
  if (single) return [dateISO];
  const all = getDatesFromHeader();
  const startIdx = all.indexOf(dateISO);
  if (startIdx < 0) return [dateISO];

  let a = startIdx;
  let b = startIdx;
  while (a > 0 && entryHasKind(getEntry(ctx, sectionId, all[a - 1]), kind)) a--;
  while (b < all.length - 1 && entryHasKind(getEntry(ctx, sectionId, all[b + 1]), kind)) b++;
  return all.slice(a, b + 1);
}

async function loadEmployees(){
  if (employeesCache) return employeesCache;
  const { data, error } = await sbBlockEdit.from("werknemers").select("*").limit(5000);
  if (error) {
    console.warn("Blok aanpassen: werknemers laden mislukt", error.message || error);
    employeesCache = [];
    return employeesCache;
  }
  employeesCache = (data || [])
    .map(r => ({
      id: String(r.id ?? r.werknemer_id ?? r.employee_id ?? "").trim(),
      name: String(r.naam ?? r.name ?? r.fullname ?? r.display_name ?? "").trim()
    }))
    .filter(x => x.id && x.name && !DUMMY_IDS.has(x.id))
    .sort((a,b) => a.name.localeCompare(b.name, "nl"));
  return employeesCache;
}

function sectionLabel(ctx, sectionId){
  const s = ctx?.sectById?.get(String(sectionId));
  const para = String(s?.[ctx.sectParaKey] ?? s?.paragraph ?? "").trim();
  const name = String(s?.[ctx.sectNameKey] ?? s?.name ?? "Sectie").trim();
  return [para, name].filter(Boolean).join(" ");
}

function getProjectLabel(ctx, sectionId){
  const s = ctx?.sectById?.get(String(sectionId));
  const pid = String(s?.[ctx.sectProjKey] || "").trim();
  const p = ctx?.projMetaById?.get(pid) || {};
  return [p.nr, p.nm].filter(Boolean).join(" - ");
}

function highlight(row, dates){
  clearSelection();
  for (const iso of dates) {
    const cell = getCellForDate(row, iso);
    if (cell) cell.classList.add("block-edit-selected");
  }
}

function chooseKindFromEntryAndCell(entry, cell){
  let kind = kindFromCell(cell);
  if (kind) return kind;
  const hasProd = entryHasKind(entry, "productie");
  const hasMont = entryHasKind(entry, "montage");
  if (hasProd && !hasMont) return "productie";
  if (hasMont && !hasProd) return "montage";
  if (hasProd && hasMont) return "productie";
  return "";
}

async function openBlockEditor({ row, cell, shiftKey }){
  const ctx = window.__plannerCtx;
  if (!ctx?.assignMap) return;

  const sectionId = getSectionIdFromRow(row);
  const dateISO = getDateForCell(row, cell);
  if (!sectionId || !dateISO) return;

  const entry = getEntry(ctx, sectionId, dateISO);
  const kind = chooseKindFromEntryAndCell(entry, cell);
  if (!kind || !entryHasKind(entry, kind)) return;

  const dates = contiguousDates(ctx, sectionId, dateISO, kind, !!shiftKey);
  const employees = await loadEmployees();
  const selected = new Set();
  const hoursByDate = {};
  let conceptSelected = false;

  for (const iso of dates) {
    const e = getEntry(ctx, sectionId, iso);
    entryEmpSet(e, kind).forEach(id => selected.add(String(id)));
    if (entryHasConcept(e, kind)) conceptSelected = true;
    hoursByDate[iso] = entryHours(e, kind);
  }

  blockCtx = { sectionId, dates, kind, row };
  highlight(row, dates);

  const wrap = ensureModal();
  wrap.querySelector("#blockEditTitle").textContent = `${kind === "montage" ? "Montageblok" : "Productieblok"} aanpassen`;
  wrap.querySelector("#blockEditSub").textContent = `${getProjectLabel(ctx, sectionId)}\n${sectionLabel(ctx, sectionId)}\n${dates.length} dag(en): ${fmtDateShort(dates[0])} t/m ${fmtDateShort(dates[dates.length - 1])}`;

  const body = wrap.querySelector("#blockEditBody");
  body.innerHTML = `
    <div class="block-edit-grid">
      <div>
        <div class="block-edit-field">
          <label>Uren per dag</label>
          <input id="blockEditHoursAll" type="text" value="${escapeHtml(fmtHours(hoursByDate[dates[0]] || 7.5))}" />
          <div class="block-edit-help">Deze waarde wordt op alle dagen gezet. Je kunt hieronder per dag nog afwijken.</div>
        </div>
      </div>
      <div>
        <div class="block-edit-emps-title">Concept / medewerker(s)</div>
        <div class="block-edit-emps">
          <label class="block-edit-emp block-edit-concept">
            <input type="checkbox" id="blockEditConcept" value="concept" ${conceptSelected || !selected.size ? "checked" : ""} />
            <span>Concept</span>
          </label>
          ${employees.map(emp => `
            <label class="block-edit-emp">
              <input type="checkbox" class="blockEditEmp" value="${escapeHtml(emp.id)}" ${selected.has(String(emp.id)) ? "checked" : ""} />
              <span>${escapeHtml(emp.name)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    </div>
    <div class="block-edit-dates">
      ${dates.map(iso => `
        <div class="block-edit-date-row">
          <div>${escapeHtml(fmtDateShort(iso))}</div>
          <input class="blockEditDateHours" data-date="${escapeHtml(iso)}" type="text" value="${escapeHtml(fmtHours(hoursByDate[iso] || 7.5))}" />
        </div>
      `).join("")}
    </div>
    <div class="block-edit-warning">
      Normale klik selecteert een aaneengesloten blok. Shift + klik selecteert één losse dag. Opslaan vervangt voor deze dagen de bestaande ${kind === "montage" ? "Mont.+Reis" : "Prod.+CNC"}-planning door Concept en/of gekozen medewerker(s) en uren.
    </div>
  `;

  const allHours = body.querySelector("#blockEditHoursAll");
  allHours?.addEventListener("change", () => {
    const val = allHours.value;
    body.querySelectorAll(".blockEditDateHours").forEach(inp => inp.value = val);
  });

  wrap.classList.add("show");
}

async function saveBlockEdit(){
  if (!blockCtx) return;
  const wrap = ensureModal();
  const body = wrap.querySelector("#blockEditBody");

  const conceptSelected = !!body.querySelector("#blockEditConcept")?.checked;
  const employees = Array.from(body.querySelectorAll(".blockEditEmp:checked"))
    .map(x => String(x.value || "").trim())
    .filter(Boolean);

  if (!conceptSelected && !employees.length) {
    alert("Kies Concept of minimaal één medewerker.");
    return;
  }

  const hoursByDate = new Map();
  for (const inp of body.querySelectorAll(".blockEditDateHours")) {
    const iso = String(inp.dataset.date || "").trim();
    const h = parseHours(inp.value);
    if (!iso || !(h > 0)) {
      alert("Vul geldige uren per dag in.");
      return;
    }
    hoursByDate.set(iso, h);
  }

  const types = typesForKind(blockCtx.kind);
  const rows = [];
  for (const iso of blockCtx.dates) {
    const h = hoursByDate.get(iso) || 0;

    if (conceptSelected) {
      rows.push({
        section_id: blockCtx.sectionId,
        work_date: iso,
        werknemer_id: Number(CONCEPT_EMP_ID),
        work_type: primaryType(blockCtx.kind),
        hours: h,
        note: `concept-hours:${h}`
      });
    }

    for (const empId of employees) {
      rows.push({
        section_id: blockCtx.sectionId,
        work_date: iso,
        werknemer_id: Number(empId),
        work_type: primaryType(blockCtx.kind),
        hours: h
      });
    }
  }

  for (const iso of blockCtx.dates) {
    const del = await sbBlockEdit
      .from("section_assignments")
      .delete()
      .eq("section_id", blockCtx.sectionId)
      .eq("work_date", iso)
      .in("work_type", types);

    if (del.error) {
      alert("Fout bij verwijderen oude blokplanning: " + del.error.message);
      return;
    }
  }

  if (rows.length) {
    const ins = await sbBlockEdit.from("section_assignments").insert(rows);
    if (ins.error) {
      alert("Fout bij opslaan blokplanning: " + ins.error.message);
      return;
    }
  }

  wrap.classList.remove("show");
  window.setTimeout(() => window.location.reload(), 250);
}

function isSectionPlanningCell(row, cell){
  if (!row?.classList?.contains("section-row")) return false;
  if (row.classList.contains("productie-summary-row") || row.classList.contains("montage-summary-row")) return false;
  const cells = Array.from(row.children || []);
  const idx = cells.indexOf(cell);
  return idx >= 2;
}

window.addEventListener("DOMContentLoaded", ensureStyle);

document.addEventListener("click", (ev) => {
  const cell = ev.target.closest("td.cell, td.plan-cell, td");
  const row = cell?.closest("tr.section-row");
  if (!cell || !row || !isSectionPlanningCell(row, cell)) return;

  const ctx = window.__plannerCtx;
  const sectionId = getSectionIdFromRow(row);
  const dateISO = getDateForCell(row, cell);
  const entry = getEntry(ctx, sectionId, dateISO);
  if (!entry) return;
  if (!entryHasKind(entry, "productie") && !entryHasKind(entry, "montage")) return;

  ev.preventDefault();
  ev.stopPropagation();
  openBlockEditor({ row, cell, shiftKey: ev.shiftKey });
}, true);
