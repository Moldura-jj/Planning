// project.js
import { makeSupabaseClient, requireSession, signOut } from "./auth.js";
import { DB } from "./config.js";
import { el, escapeHtml, fmtDate, setStatus, valFrom, sumNums } from "./utils.js";

const sb = makeSupabaseClient();

const EDITABLE_PROJECT_COLS = new Set([
  "offerno",
  "projectname",

  "salesstatus",
  "entrydate",
  "offerdate",
  "orderdate",
  "proddate",
  "deliverydate",
  "completiondate",
  "salesemployee",
  "offeremployee",

  "deliveryname",
  "deliveryfullname",
  "deliveryadress",
  "deliveryzipcode",
  "deliverycity",
  "deliveryphone",
  "deliveryemail",
]);

const NUMBER_PROJECT_COLS = new Set([
  "salesstatus",
  "total_wvb",
  "total_prod",
  "total_mont",
  "total_reis"
]);

const DATE_PROJECT_COLS = new Set([
  "entrydate",
  "offerdate",
  "orderdate",
  "proddate",
  "deliverydate",
  "completiondate"
]);

function toDateInputValue(value){
  if(!value) return "";
  const s = String(value);
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

document.addEventListener("DOMContentLoaded", init);

async function init(){
  const session = await requireSession(sb);
  if(!session) return;

  el("btnLogout").addEventListener("click", ()=>signOut(sb));

  const id = new URL(location.href).searchParams.get("id");
  if(!id){
    setStatus(el("status"), "Geen project-id meegegeven.", "error");
    return;
  }

  await loadProject(id);
}

async function loadProject(id){
  setStatus(el("status"), "Project laden...");
  el("cardMain").style.display = "none";
const tProj = DB.tables.projects;
const tSec  = DB.tables.sections;

// Project laden
const a = await sb
  .from(tProj)
  .select("*")
  .eq(DB.projectPkCol, id)
  .maybeSingle();

if (a.error) {
  setStatus(el("status"), a.error.message, "error");
  return;
}

const project = a.data;

if (!project) {
  setStatus(el("status"), "Project niet gevonden.", "error");
  return;
}

// In jouw database staan klantgegevens direct in projecten.
// Daarom gebruiken we project zelf ook als klant-object.
project.klant = project;

  // Secties
  const b = await sb
    .from(tSec)
    .select("*")
    .eq(DB.sectionProjectFk, id)
    .order(DB.sectionPkCol, { ascending: true });

  if(b.error){
    setStatus(el("status"), b.error.message, "error");
    return;
  }

  const sections = sortSections(b.data || []);

    

// Orders tijdelijk uitgeschakeld.
// section_orders.section_id lijkt UUID te verwachten, terwijl secties.section_id een nummer is.
let orders = [];

  // Map: section_id -> orders[]
  const ordersBySection = new Map();
  for (const r of orders) {
    const sid = String(r.section_id || "");
    if (!sid) continue;
    if (!ordersBySection.has(sid)) ordersBySection.set(sid, []);
    ordersBySection.get(sid).push(r);
  }


  // Render header
  const projectNo = project?.[DB.projectNoCol] ?? "";
  const projectName = project?.[DB.projectNameCol] ?? "";
  const klantName = project?.klant?.[DB.customerNameCol] ?? "";
  el("title").textContent = projectNo ? `${projectNo}` : "Project";
  el("chipHead").textContent = `${projectNo} - ${klantName} - ${projectName}`;
  el("pillStatus").textContent = project.salesstatus ?? "";
  el("pillMeta").textContent = `ID: ${project?.[DB.projectPkCol] ?? ""}`;

  ensureProjectSaveButton(id);
  ensureAddSectionButton(id);

  // Render blocks
  renderBlock("blkProject", DB.projectBlocks.project, project, project.klant);
  renderBlock("blkCustomer", DB.projectBlocks.customer, project.klant || {}, project.klant || {});
  renderBlock("blkDelivery", DB.projectBlocks.delivery, project, project.klant);
  renderBlock("blkOrder", DB.projectBlocks.order, project, project.klant);

  // Totals: use project totals if present, else compute from sections
  // Kolomnamen van uren kunnen per omgeving verschillen; we volgen config.js
const totalsObj = {
  total_wvb: sumNums(sections, "uren_wvb"),
  total_prod: sumNums(sections, "uren_prod"),
  total_mont: sumNums(sections, "uren_montage") || sumNums(sections, "uren_mont"),
  total_reis: sumNums(sections, "uren_reis"),
};

renderBlock("blkTotals", DB.projectBlocks.totals, totalsObj, totalsObj);
  // Render sections table
  el("secMeta").textContent = `${sections.length} secties`;

  el("secHead").innerHTML =
    DB.sectionRowCols.map(c=> `<th>${escapeHtml(c.label)}</th>`).join("")
    + `<th style="width:170px">In planning</th>`
    + `<th style="width:70px"></th>`;
    
  el("secBody").innerHTML = sections.map((s, idx)=>{
    const sid = String(s?.[DB.sectionPkCol] ?? "");

    const cols = DB.sectionRowCols.map(c=>{
      const v = Array.isArray(c.col)
        ? c.col.map(k => valFrom(s, k)).find(x => x !== null && x !== undefined && x !== "")
        : valFrom(s, c.col);

      return `<td>${escapeHtml(v ?? "")}</td>`;
    }).join("");

// ===== detail opsplitsen: tekst/beschrijving boven, uren links =====
const detailText = DB.sectionDetailCols
  .filter(d => !String(Array.isArray(d.col) ? d.col[0] : d.col).includes("uren_"))
  .map(d => {
    const col = Array.isArray(d.col) ? d.col[0] : d.col;

    const raw = Array.isArray(d.col)
      ? d.col.map(c => valFrom(s, c)).find(v => v !== null && v !== undefined && v !== "")
      : valFrom(s, d.col);

    const v = raw ?? "";

    return `
      <div class="fieldgrid" style="grid-template-columns:220px 1fr; margin-top:8px">
        <div class="label">${escapeHtml(d.label)}</div>
        <input
          class="value section-edit"
          data-sid="${escapeHtml(sid)}"
          data-col="${escapeHtml(col)}"
          type="text"
          value="${escapeHtml(v)}"
        >
      </div>
    `;
  }).join("");

const detailHours = DB.sectionDetailCols
  .filter(d => String(Array.isArray(d.col) ? d.col[0] : d.col).includes("uren_"))
  .map(d => {
    const col = Array.isArray(d.col) ? d.col[0] : d.col;

    const raw = Array.isArray(d.col)
      ? d.col.map(c => valFrom(s, c)).find(v => v !== null && v !== undefined && v !== "")
      : valFrom(s, d.col);

    const v = raw ?? 0;

    return `
      <div class="fieldgrid" style="grid-template-columns:190px 1fr; margin-top:8px">
        <div class="label">${escapeHtml(d.label)}</div>
        <input
          class="value section-edit"
          data-sid="${escapeHtml(sid)}"
          data-col="${escapeHtml(col)}"
          type="number"
          step="0.25"
          value="${escapeHtml(v)}"
        >
      </div>
    `;
  }).join("");


// ===== Orders HTML voor deze sectie (accordion per bestel_nummer) =====
const ords = ordersBySection.get(sid) || [];

const ordersHtml = `
  <div class="muted" style="font-weight:800; margin:14px 0 8px">Bestellingen</div>
  ${renderOrdersAccordionHtml(ords)}
`;


const includeInPlanning = getIncludePlanningValue(s);
return `
  <tr class="accordion-row" data-i="${idx}">
    ${cols}

    <td>
      <label class="row" style="gap:8px; justify-content:flex-start" title="Sectie opnemen in planning">
        <input type="checkbox" class="js-include-planning" data-sid="${escapeHtml(sid)}" ${includeInPlanning ? "checked" : ""}>
        <span class="muted" style="font-size:12px">Opnemen</span>
      </label>
    </td>

    <td style="text-align:right"><span class="pill">▾</span></td>
  </tr>
      <tr class="section-details" data-i="${idx}" style="display:none">
        <td colspan="${DB.sectionRowCols.length + 2}">
          <div class="inner">
            <div class="inner">
              <div class="muted" style="font-weight:800; margin-bottom:8px">Sectie details</div>

              <!-- 1) Tekst/beschrijving boven (volledige breedte) -->
              ${detailText}

              <!-- 2) Uren links + Bestellingen rechts -->
              <div class="sec-split" style="display:grid; grid-template-columns: 260px 1fr; gap:16px; margin-top:14px;">
                <div class="sec-left">
                  ${detailHours}

                  <button
                    type="button"
                    class="btn primary js-save-section"
                    data-sid="${escapeHtml(sid)}"
                    style="margin-top:14px"
                  >
                    Sectie opslaan
                  </button>
                </div>

                <div class="sec-right">
                  ${ordersHtml}
                </div>
              </div>
            </div>

        </td>
      </tr>
    `;
  }).join("");

  // Accordion behavior
  [...el("secBody").querySelectorAll(".accordion-row")].forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const i = tr.getAttribute("data-i");
      const detailRow = el("secBody").querySelector(`.section-details[data-i="${i}"]`);
      const open = detailRow.style.display !== "none";
      detailRow.style.display = open ? "none" : "table-row";
      tr.querySelector(".pill").textContent = open ? "▾" : "▴";
    });
  });

  // Checkbox: opnemen in planning
  [...el("secBody").querySelectorAll(".js-include-planning")].forEach(cb => {
    cb.addEventListener("click", (e) => e.stopPropagation()); // voorkomt sectie open/dicht
    cb.addEventListener("change", async (e) => {
      e.stopPropagation();
      const sectionId = cb.getAttribute("data-sid");
      const checked = cb.checked;

      cb.disabled = true;
      const ok = await saveIncludeInPlanning(sectionId, checked);
      cb.disabled = false;

      if (!ok) cb.checked = !checked; // revert bij fout
    });
  });

  // Sectie opslaan
[...el("secBody").querySelectorAll(".js-save-section")].forEach(btn => {
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const sectionId = btn.getAttribute("data-sid");
    if (!sectionId) return;

    await saveSection(sectionId);
  });
});

  // Bestellingen accordion (binnen sectie-details) - delegated
  el("secBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-order-toggle]");
    if (!btn) return;

    e.stopPropagation(); // voorkomt togglen van sectie zelf

    const card = btn.closest("[data-order-card]");
    if (!card) return;

    const body = card.querySelector(".order-body");
    const arrow = card.querySelector(".order-arrow");
    if (!body) return;

    const isOpen = !body.hasAttribute("hidden");

    if (isOpen) {
      body.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      if (arrow) arrow.textContent = "▾";
    } else {
      body.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      if (arrow) arrow.textContent = "▴";
    }
  });




  setStatus(el("status"), "");
  el("cardMain").style.display = "block";
}

function getIncludePlanningValue(section){
  const raw = section?.in_planning;
  if (raw === null || raw === undefined) return true; // default: aan
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    return !["0","false","nee","no","off"].includes(v);
  }
  return Boolean(raw);
}

async function saveIncludeInPlanning(sectionId, includeInPlanning){
  if (!sectionId) return false;
  const tSec = DB.tables.sections;

  const res = await sb
    .from(tSec)
    .update({ in_planning: includeInPlanning })
    .eq(DB.sectionPkCol, sectionId);

  if (res.error) {
    console.warn("Sectie planning-toggle opslaan mislukt:", res.error.message);
    setStatus(el("status"), `Opslaan mislukt: ${res.error.message}`, "error");
    return false;
  }

  setStatus(el("status"), "Sectie bijgewerkt.");
  return true;
}

function ensureProjectSaveButton(projectId) {
  let btn = document.getElementById("btnSaveProject");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btnSaveProject";
    btn.className = "btn";
    btn.textContent = "Opslaan";

    const head = document.querySelector(".topbar, .header, .row");
    const target = document.getElementById("cardMain")?.parentElement || document.body;

    // Bij voorkeur naast de bestaande knoppen zetten
    const logoutBtn = document.querySelector("button, .btn");
    if (logoutBtn?.parentElement) {
      logoutBtn.parentElement.appendChild(btn);
    } else {
      target.prepend(btn);
    }
  }

  btn.onclick = async () => {
    await saveProject(projectId);
  };
}
async function saveSection(sectionId) {
  const inputs = [...document.querySelectorAll(`.section-edit[data-sid="${CSS.escape(sectionId)}"]`)];

  const payload = {};

  for (const inp of inputs) {
    const col = inp.dataset.col;
    if (!col) continue;
    if (String(col).startsWith("total_")) continue;

    let value = String(inp.value ?? "").trim();

    if (value === "") {
      payload[col] = null;
      continue;
    }

    if ([
      "aantal",
      "uren_wvb",
      "uren_prod",
      "uren_montage",
      "uren_mont",
      "uren_reis"
    ].includes(col)) {
      value = value.replace(",", ".");
      payload[col] = Number(value);
      continue;
    }

    payload[col] = value;
  }

  console.log("SECTION SAVE", { sectionId, payload });

  const { error } = await sb
    .from(DB.tables.sections)
    .update(payload)
    .eq(DB.sectionPkCol, sectionId);

  if (error) {
    console.error("Sectie opslaan mislukt:", error);
    setStatus(el("status"), "Sectie opslaan mislukt: " + error.message, "error");
    alert("Sectie opslaan mislukt: " + error.message);
    return;
  }

  setStatus(el("status"), "Sectie opgeslagen.");
  alert("Sectie opgeslagen.");

  const projectId = new URL(location.href).searchParams.get("id");
  await loadProject(projectId);
}

async function saveProject(projectId) {
  const inputs = [...document.querySelectorAll(".project-edit[data-col]")];

  const payload = {};

  for (const inp of inputs) {
    const col = inp.dataset.col;
    if (!col) continue;

    let value = String(inp.value ?? "").trim();

    // Lege velden als null opslaan
    if (value === "") {
      payload[col] = null;
      continue;
    }

    // Getallen goed opslaan
    if (NUMBER_PROJECT_COLS.has(col)) {
      value = value.replace(",", ".");
      payload[col] = Number(value);
      continue;
    }

    // Datums blijven yyyy-mm-dd
    if (DATE_PROJECT_COLS.has(col)) {
      payload[col] = value;
      continue;
    }

    payload[col] = value;
  }

  console.log("PROJECT SAVE", { projectId, payload });

  const { error } = await sb
    .from(DB.tables.projects)
    .update(payload)
    .eq(DB.projectPkCol, projectId);

  if (error) {
    console.error("Project opslaan mislukt:", error);
    setStatus(el("status"), "Project opslaan mislukt: " + error.message, "error");
    alert("Project opslaan mislukt: " + error.message);
    return;
  }

  setStatus(el("status"), "Project opgeslagen.");
  alert("Project opgeslagen.");

  await loadProject(projectId);
}


function ensureAddSectionButton(projectId) {
  const secMeta = document.getElementById("secMeta");
  if (!secMeta) {
    console.warn("secMeta niet gevonden");
    return;
  }

  const secTitle = secMeta.parentElement;
  if (!secTitle) {
    console.warn("parent van secMeta niet gevonden");
    return;
  }

  let btn = document.getElementById("btnAddSection");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btnAddSection";
    btn.type = "button";
    btn.className = "btn primary";
    btn.textContent = "+ Sectie";
    btn.style.marginRight = "10px";

    secTitle.insertBefore(btn, secMeta);
  }

  // Belangrijk: altijd opnieuw koppelen, ook als de knop al bestond
  btn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("ADD SECTION CLICK", projectId);

    const paragraaf = prompt("Paragraaf / sectienummer:", "01.");
    if (paragraaf === null) return;

    const omschrijving = prompt("Omschrijving:", "");
    if (omschrijving === null) return;

    const row = {
      [DB.sectionProjectFk]: Number(projectId),
      paragraaf: paragraaf.trim(),
      omschrijving: omschrijving.trim(),
      aantal: 1,
      salestextrtf: "",
      uren_wvb: 0,
      uren_prod: 0,
      uren_montage: 0,
      uren_reis: 0,
      in_planning: true
    };

    console.log("INSERT SECTION", row);

    const { error } = await sb
      .from(DB.tables.sections)
      .insert(row);

    if (error) {
      console.error("Sectie toevoegen mislukt:", error);
      setStatus(el("status"), "Sectie toevoegen mislukt: " + error.message, "error");
      alert("Sectie toevoegen mislukt: " + error.message);
      return;
    }

    setStatus(el("status"), "Sectie toegevoegd.");
    await loadProject(projectId);
  };
}

async function addSection(projectId){
  const paragraaf = prompt("Paragraaf, bijvoorbeeld 01.");
  if(paragraaf === null) return;

  const omschrijving = prompt("Omschrijving sectie:");
  if(omschrijving === null) return;

  const row = {
    project_id: Number(projectId),
    paragraaf: paragraaf.trim(),
    omschrijving: omschrijving.trim(),
    aantal: 1,
    salestextrtf: "",
    uren_wvb: 0,
    uren_prod: 0,
    uren_montage: 0,
    uren_reis: 0,
    in_planning: true
  };

  console.log("ADD SECTION", row);

  const { error } = await sb
    .from(DB.tables.sections)
    .insert(row);

  if(error){
    console.error("Sectie toevoegen mislukt:", error);
    setStatus(el("status"), "Sectie toevoegen mislukt: " + error.message, "error");
    alert("Sectie toevoegen mislukt: " + error.message);
    return;
  }

  setStatus(el("status"), "Sectie toegevoegd.");
  await loadProject(projectId);
}

function renderBlock(targetId, fields, obj = {}, fallbackObj = {}) {
  const box = el(targetId);
  if (!box) return;

  box.innerHTML = fields.map(f => {
    const cols = Array.isArray(f.col) ? f.col : [f.col];

    // Alleen het eerste veld gebruiken om op te slaan
    const saveCol = cols[0];

    let value = "";
    for (const c of cols) {
      const v = valFrom(obj, c);
      if (v !== null && v !== undefined && v !== "") {
        value = v;
        break;
      }

      const fv = valFrom(fallbackObj, c);
      if (fv !== null && fv !== undefined && fv !== "") {
        value = fv;
        break;
      }
    }

    if (f.type === "date" && value) {
      value = String(value).slice(0, 10);
    }

    const inputType = f.type === "date" ? "date" : "text";

const isTotalField = String(saveCol || "").startsWith("total_");

if (isTotalField) {
  return `
    <div class="fieldgrid">
      <div class="label">${escapeHtml(f.label)}</div>
      <div class="value">${escapeHtml(value ?? 0)}</div>
    </div>
  `;
}

return `
  <div class="fieldgrid">
    <div class="label">${escapeHtml(f.label)}</div>
    <input 
      class="value project-edit"
      data-col="${escapeHtml(saveCol)}"
      type="${inputType}"
      value="${escapeHtml(value ?? "")}"
    >
  </div>
`;
  }).join("");
}

function groupOrdersByBestelnummer(rows){
  const by = new Map();
  for (const r of (rows || [])) {
    const key = String(r.bestel_nummer || "").trim() || "Onbekend";
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(r);
  }
  return by;
}

function renderOrdersAccordionHtml(rows){
  if (!rows || !rows.length) {
    return `<div class="muted" style="padding:8px 0;">Geen bestellingen</div>`;
  }

  const grouped = groupOrdersByBestelnummer(rows);

  // per bestelnummer 1 header + uitklapbare regels
  let html = `<div class="orders-acc">`;

  for (const [bn, items] of grouped) {
    // leverdatum op header: neem eerste niet-lege leverdatum
    const ld = items.map(x => x.leverdatum).find(Boolean);
    const ldTxt = ld ? fmtDate(ld) : "";

    const safeBn = escapeHtml(bn);
    const safeLd = escapeHtml(ldTxt);

    html += `
      <div class="order-card" data-order-card>
        <button class="order-head" type="button" data-order-toggle="1" aria-expanded="false">
          <div class="order-head-left">
            <span class="pill pill-soft">${safeBn}</span>
          </div>

          <div class="order-head-right">
            <span class="pill pill-soft">${safeLd || "-"}</span>
            <span class="order-arrow">▾</span>
          </div>
        </button>

        <div class="order-body" hidden>
          ${items.map(it=>{
            const oms = escapeHtml(it.omschrijving || "");
            const aant = escapeHtml(it.aantal ?? "");
            const lev = escapeHtml(it.leverancier || "");
            const soort = escapeHtml(it.soort || "");
            return `
              <div class="order-line">
                <div class="ol-aantal">${aant}</div>
                <div class="ol-oms">${oms}</div>
                <div class="ol-meta">${lev}${lev && soort ? " • " : ""}${soort}</div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }



  html += `</div>`;
  return html;
}


function sortSections(rows){
  return [...(rows || [])].sort((a,b)=>{
    const ka = sectionSortKey(a);
    const kb = sectionSortKey(b);

    // 1) normale secties eerst, M-secties onderaan
    if (ka.group !== kb.group) return ka.group - kb.group;

    // 2) binnen groep: numeriek op nummer (01,02,10...)
    if (ka.num !== kb.num) return ka.num - kb.num;

    // 3) fallback: string compare
    return ka.raw.localeCompare(kb.raw, "nl", { numeric:true });
  });
}

function sectionSortKey(section){
  // probeer de meest waarschijnlijke kolommen waar jouw "01." / "M05." in staat
  const candidates = [
    "paragraaf",
    "paragraph",
    "sectionno",
    "sectienr",
    "sectie",
    "code",
    "section_code",
    DB.sectionNoCol,            // als je dit in config hebt
  ].filter(Boolean);

  let raw = "";
  for (const k of candidates){
    const v = section?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== ""){
      raw = String(v).trim();
      break;
    }
  }

  // als we niets vonden: pak eventueel de eerste kolom uit DB.sectionRowCols
  if (!raw && DB?.sectionRowCols?.length){
    const firstCol = DB.sectionRowCols[0]?.col;
    const v = Array.isArray(firstCol)
      ? firstCol.map(k => section?.[k]).find(x => x !== null && x !== undefined && String(x).trim() !== "")
      : section?.[firstCol];
    raw = String(v ?? "").trim();
  }

  const s = raw.toUpperCase().replace(/\s+/g,""); // "M05." -> "M05."
  const isM = s.startsWith("M");

  // haal cijfers uit "01." / "M05." / "13" etc
  const digits = (isM ? s.slice(1) : s).match(/\d+/);
  const num = digits ? parseInt(digits[0], 10) : Number.MAX_SAFE_INTEGER;

  return {
    raw: s,
    group: isM ? 1 : 0,   // 0 = normaal, 1 = M onderaan
    num,
  };
}
