import { makeSupabaseClient, requireSession } from "./auth.js";
import { DB } from "./config.js";

const sb = makeSupabaseClient();

const DUMMY_EMP_ID = 999999;
const DUMMY_SEC_ID = 999998;
const HOURS_PER_DAY = 7.5;

document.addEventListener("DOMContentLoaded", initProjectPlanning);

async function initProjectPlanning(){
  const root = document.getElementById("projectPlanning");
  const meta = document.getElementById("projectPlanningMeta");
  if (!root || !meta) return;

  const session = await requireSession(sb);
  if (!session) return;

  const projectId = new URLSearchParams(location.search).get("id");
  if (!projectId) {
    meta.textContent = "Geen project-id gevonden.";
    return;
  }

  try {
    meta.textContent = "Planning laden...";
    const data = await loadProjectPlanning(projectId);
    renderProjectPlanning(root, meta, data);
  } catch (e) {
    console.warn("Projectplanning laden mislukt:", e);
    meta.textContent = "Planning laden mislukt: " + (e?.message || e);
    root.innerHTML = "";
  }
}

async function loadProjectPlanning(projectId){
  const [projectRes, sectionRes] = await Promise.all([
    sb.from(DB.tables.projects).select("*").eq(DB.projectPkCol, projectId).single(),
    sb.from(DB.tables.sections).select("*").eq(DB.sectionProjectFk, projectId),
  ]);

  if (projectRes.error) throw projectRes.error;
  if (sectionRes.error) throw sectionRes.error;

  const project = projectRes.data || {};
  const sections = (sectionRes.data || []).filter(sectionIsIncludedInPlanning);
  const sectionIds = sections.map(s => String(s?.[DB.sectionPkCol] ?? s?.id ?? "")).filter(Boolean);

  const sectionAssignPromise = sectionIds.length
    ? sb
        .from("section_assignments")
        .select("section_id, work_date, work_type, hours, werknemer_id, note")
        .in("section_id", sectionIds)
        .order("work_date", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const projectAssignPromise = sb
    .from("project_assignments")
    .select("project_id, work_date, work_type, werknemer_id, note")
    .eq("project_id", projectId)
    .order("work_date", { ascending: true });

  const [sectionAssignRes, projectAssignRes] = await Promise.all([
    sectionAssignPromise,
    projectAssignPromise,
  ]);

  if (sectionAssignRes.error) throw sectionAssignRes.error;
  if (projectAssignRes.error) throw projectAssignRes.error;

  return {
    project,
    sections,
    sectionAssignments: sectionAssignRes.data || [],
    projectAssignments: projectAssignRes.data || [],
  };
}

function renderProjectPlanning(root, meta, data){
  const { project, sections, sectionAssignments, projectAssignments } = data;
  const dates = buildDateRange(project, sectionAssignments, projectAssignments);

  if (!dates.length) {
    meta.textContent = "Geen planning gevonden voor dit project.";
    root.innerHTML = `<div class="muted project-planning-empty">Nog geen planningregels voor dit project.</div>`;
    return;
  }

  const sectionById = new Map();
  for (const s of sections) {
    const sid = String(s?.[DB.sectionPkCol] ?? s?.id ?? "");
    if (sid) sectionById.set(sid, s);
  }

  const sectionAgg = new Map();
  for (const row of sectionAssignments) {
    const sid = String(row.section_id || "");
    if (!sid) continue;
    addAgg(sectionAgg, sid, row.work_date, assignmentType(row), assignmentHours(row), isConceptAssignment(row));
  }

  const projectLevelAgg = new Map();
  for (const row of projectAssignments) {
    addAgg(projectLevelAgg, "project", row.work_date, assignmentType(row), assignmentHours(row), isConceptAssignment(row));
  }

  const totalAgg = new Map();
  for (const row of sectionAssignments) {
    addAgg(totalAgg, "project", row.work_date, assignmentType(row), assignmentHours(row), isConceptAssignment(row));
  }
  for (const row of projectAssignments) {
    addAgg(totalAgg, "project", row.work_date, assignmentType(row), assignmentHours(row), isConceptAssignment(row));
  }

  const rows = [];
  rows.push({
    cls: "project-main",
    title: projectTitle(project),
    sub: projectDates(project),
    agg: totalAgg.get("project") || new Map(),
  });

  const sortedSections = sections.slice().sort(compareSections);
  for (const s of sortedSections) {
    const sid = String(s?.[DB.sectionPkCol] ?? s?.id ?? "");
    rows.push({
      cls: "section",
      title: sectionTitle(s),
      sub: sectionTotals(s),
      agg: sectionAgg.get(sid) || new Map(),
    });
  }

  const projectProductie = filterAggTypes(projectLevelAgg.get("project"), ["productie", "cnc"]);
  const projectMontage = filterAggTypes(projectLevelAgg.get("project"), ["montage", "reis"]);
  if (hasAggValues(projectProductie)) rows.push({ cls: "summary", title: "Project - Productie", sub: "", agg: projectProductie });
  if (hasAggValues(projectMontage)) rows.push({ cls: "summary", title: "Project - Montage", sub: "", agg: projectMontage });

  const deliveryISO = asISODate(project?.deliverydate || project?.deliverydate_d);
  const completionISO = asISODate(project?.completiondate || project?.completiondate_d);
  const tableWidth = 360 + (dates.length * 30);
  meta.textContent = `${rows.length} regels • ${formatDateNL(toISODate(dates[0]))} t/m ${formatDateNL(toISODate(dates[dates.length - 1]))}`;

  root.innerHTML = `
    <table class="project-planning-table" style="width:${tableWidth}px; min-width:${tableWidth}px;">
      <colgroup>
        <col class="pp-col-label" />
        ${dates.map(() => `<col class="pp-col-day" />`).join("")}
      </colgroup>
      <thead>
        <tr>
          <th class="pp-label">Regel</th>
          ${dates.map(d => `<th>${dayHead(d)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => renderPlanningRow(row, dates, deliveryISO, completionISO)).join("")}
      </tbody>
    </table>
  `;
}

function renderPlanningRow(row, dates, deliveryISO, completionISO){
  return `
    <tr class="pp-row pp-${escapeAttr(row.cls)}">
      <td class="pp-label">
        <div class="pp-title">${escapeHtml(row.title)}</div>
        ${row.sub ? `<div class="pp-sub">${escapeHtml(row.sub)}</div>` : ""}
      </td>
      ${dates.map(d => {
        const iso = toISODate(d);
        const day = row.agg?.get(iso);
        const cls = [
          "pp-day",
          isWeekend(d) ? "wknd" : "",
          deliveryISO && iso === deliveryISO ? "pp-delivery-col" : "",
          completionISO && iso === completionISO ? "pp-completion-col" : "",
        ].filter(Boolean).join(" ");
        return `<td class="${cls}">${renderDayChips(day)}</td>`;
      }).join("")}
    </tr>
  `;
}

function renderDayChips(day){
  if (!day) return "";
  const chips = [];
  for (const type of ["wvb", "productie", "cnc", "montage", "reis", "onderaanneming"]) {
    const item = day[type];
    if (!item || !(item.hours > 0)) continue;
    const cls = type === "wvb" ? "wvb" : (type === "montage" || type === "reis" ? "mont" : type === "onderaanneming" ? "subc" : "prod");
    const label = type === "onderaanneming" ? "OA" : fmtHours(item.hours);
    chips.push(`<span class="pp-chip ${cls}${item.concept ? " concept" : ""}" title="${escapeAttr(type)}">${escapeHtml(label)}</span>`);
  }
  return chips.join("");
}

function addAgg(map, rowKey, dateISO, type, hours, concept){
  const iso = String(dateISO || "").slice(0, 10);
  if (!rowKey || !iso || !type || !(hours > 0)) return;
  if (!map.has(rowKey)) map.set(rowKey, new Map());
  const byDate = map.get(rowKey);
  if (!byDate.has(iso)) byDate.set(iso, {});
  const day = byDate.get(iso);
  if (!day[type]) day[type] = { hours: 0, concept: false };
  day[type].hours = roundHours(day[type].hours + hours);
  day[type].concept = day[type].concept || concept;
}

function filterAggTypes(agg, types){
  const out = new Map();
  if (!agg) return out;
  for (const [iso, day] of agg.entries()) {
    const next = {};
    for (const type of types) {
      if (day[type]) next[type] = { ...day[type] };
    }
    if (Object.keys(next).length) out.set(iso, next);
  }
  return out;
}

function hasAggValues(agg){
  return !!agg && Array.from(agg.values()).some(day => Object.values(day).some(v => Number(v.hours || 0) > 0));
}

function assignmentType(row){
  const raw = String(row?.work_type || "").toLowerCase().trim();
  if (raw === "werkvoorbereiding" || raw.includes("werkvoor")) return "wvb";
  if (raw === "prod") return "productie";
  if (raw === "mont") return "montage";
  return raw || "productie";
}

function assignmentHours(row){
  const explicit = Number(row?.hours || 0);
  if (explicit > 0) return roundHours(explicit);

  const note = String(row?.note || "");
  const concept = note.match(/(?:^|[;\s])concept-hours:([0-9]+(?:[.,][0-9]+)?)/i);
  if (concept) {
    const n = Number(String(concept[1]).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return roundHours(n);
  }

  return HOURS_PER_DAY;
}

function isConceptAssignment(row){
  const emp = String(row?.werknemer_id ?? "").trim();
  return emp === String(DUMMY_EMP_ID) || emp === String(DUMMY_SEC_ID) || String(row?.note || "").includes("concept-hours:");
}

function buildDateRange(project, sectionAssignments, projectAssignments){
  const values = [];
  for (const row of [...sectionAssignments, ...projectAssignments]) {
    const d = parseISODate(row.work_date);
    if (d) values.push(d);
  }
  for (const key of ["deliverydate", "deliverydate_d", "completiondate", "completiondate_d"]) {
    const d = parseISODate(project?.[key]);
    if (d) values.push(d);
  }
  if (!values.length) return [];

  let start = startOfISOWeek(addDays(new Date(Math.min(...values.map(d => d.getTime()))), -7));
  let end = addDays(startOfISOWeek(addDays(new Date(Math.max(...values.map(d => d.getTime()))), 7)), 6);
  const minEnd = addDays(start, 34);
  if (end < minEnd) end = minEnd;

  const days = [];
  for (let d = start; d <= end && days.length < 140; d = addDays(d, 1)) days.push(d);
  return days;
}

function sectionIsIncludedInPlanning(section){
  const keys = DB.sectionIncludeInPlanningCols || ["in_planning", "include_in_planning", "show_in_planning", "planning_visible"];
  const key = keys.find(k => Object.prototype.hasOwnProperty.call(section || {}, k));
  if (!key) return true;
  const raw = section[key];
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const v = String(raw).trim().toLowerCase();
  return !["0", "false", "nee", "no", "off"].includes(v);
}

function compareSections(a, b){
  const pa = sectionNumber(a);
  const pb = sectionNumber(b);
  if (pa !== pb) return pa - pb;
  return sectionTitle(a).localeCompare(sectionTitle(b), "nl", { sensitivity: "base" });
}

function sectionNumber(s){
  const raw = String(pick(s, ["paragraph", "paragraaf", "sectienr", "sectie_nr"]) || "");
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

function projectTitle(project){
  const nr = String(project?.[DB.projectNoCol] ?? "").trim();
  const customer = String(project?.[DB.customerNameCol] ?? project?.deliveryname ?? "").trim();
  const name = String(project?.[DB.projectNameCol] ?? "").trim();
  return [nr, customer, name].filter(Boolean).join(" - ") || "Project";
}

function projectDates(project){
  const delivery = formatDateNL(project?.deliverydate || project?.deliverydate_d);
  const completion = formatDateNL(project?.completiondate || project?.completiondate_d);
  return [`Lever ${delivery || "-"}`, `Oplever ${completion || "-"}`].join(" • ");
}

function sectionTitle(section){
  const para = String(pick(section, ["paragraph", "paragraaf", "sectienr", "sectie_nr"]) || "").trim();
  const name = String(pick(section, ["description", "omschrijving", "sectienaam", "name", "naam", "section_name", "salestextrtf"]) || "").trim();
  return [para, name].filter(Boolean).join(" ") || "Sectie";
}

function sectionTotals(section){
  const parts = [
    ["WVB", pickNumber(section, ["uren_wvb", "uren_prep", "uren_werkvoorbereiding"])],
    ["Prod", pickNumber(section, ["uren_prod"]) + pickNumber(section, ["uren_cnc", "uren_cnc_prod", "cnc_uren"])],
    ["Mont", pickNumber(section, ["uren_montage", "uren_mont"]) + pickNumber(section, ["uren_reis", "reis_uren"])],
  ].filter(([, value]) => value > 0);
  return parts.map(([label, value]) => `${label} ${fmtHours(value)}`).join(" • ");
}

function pick(obj, keys){
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return "";
}

function pickNumber(obj, keys){
  const value = Number(String(pick(obj, keys) || "0").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

function parseISODate(value){
  if (!value) return null;
  const match = String(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function asISODate(value){
  const d = parseISODate(value);
  return d ? toISODate(d) : "";
}

function startOfISOWeek(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function addDays(date, amount){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + amount);
  return d;
}

function toISODate(date){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isWeekend(date){
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dayHead(date){
  const names = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  return `${names[date.getDay()]}<br>${date.getDate()}-${date.getMonth() + 1}`;
}

function formatDateNL(value){
  const d = parseISODate(value);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function fmtHours(value){
  return String(Math.round(Number(value || 0) * 10) / 10).replace(".", ",");
}

function roundHours(value){
  return Math.round(Number(value || 0) * 100) / 100;
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[ch]));
}

function escapeAttr(value){
  return escapeHtml(value);
}
