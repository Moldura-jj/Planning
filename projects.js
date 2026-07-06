// projects.js
import { makeSupabaseClient, requireSession, signOut } from "./auth.js";
import { DB } from "./config.js";
import { el, escapeHtml, setStatus } from "./utils.js";

const sb = makeSupabaseClient();

let rows = [];
let sortState = { key: "projectNo", dir: "desc" };

document.addEventListener("DOMContentLoaded", init);

async function init(){
  const session = await requireSession(sb);
  if(!session) return;

  el("btnLogout").addEventListener("click", ()=>signOut(sb));
  el("btnReload").addEventListener("click", load);
  el("q").addEventListener("input", render);
  document.querySelectorAll(".projects-sort").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState = { key, dir: key === "projectNo" ? "desc" : "asc" };
      }
      render();
    });
  });

  // Nieuw project modal
  el("btnAddProject")?.addEventListener("click", openProjectModal);
  el("btnProjectModalClose")?.addEventListener("click", closeProjectModal);
  el("btnProjectCancel")?.addEventListener("click", closeProjectModal);
  el("projectModalBackdrop")?.addEventListener("click", closeProjectModal);
  el("btnProjectSave")?.addEventListener("click", saveNewProject);

  await load();
}

async function load(){
  setStatus(el("status"), "Laden...");
  el("tbody").innerHTML = "";

  const tProj = DB.tables.projects;

  const { data, error } = await sb
    .from(tProj)
    .select(`
      id:${DB.projectPkCol},
      ${DB.projectNoCol},
      ${DB.projectNameCol},
      name_kl,
      deliveryname,
      deliverydate,
      salesstatus
    `)
    .order(DB.projectNoCol, { ascending: false })
    .limit(500);

  if(error){
    setStatus(el("status"), error.message, "error");
    return;
  }

  rows = data || [];

  setStatus(el("status"), "");
  render();
}

function render(){
  const q = (el("q").value || "").trim().toLowerCase();

  const filtered = !q ? rows : rows.filter(r=>{
    const no = (r[DB.projectNoCol] ?? "").toString().toLowerCase();
    const pr = (r[DB.projectNameCol] ?? "").toString().toLowerCase();
    const kn = (r.name_kl ?? "").toString().toLowerCase();

    return no.includes(q) || pr.includes(q) || kn.includes(q);
  });

  const sorted = filtered.slice().sort(compareProjects);

  el("meta").textContent = `${sorted.length} / ${rows.length}`;
  updateSortHeaders();

  el("tbody").innerHTML = sorted.map(r=>{
    const id = r.id;
    const projectNo = escapeHtml(r[DB.projectNoCol] ?? "");
    const projectName = escapeHtml(r[DB.projectNameCol] ?? "");
    const klant = escapeHtml(r.name_kl ?? "");
    const deliverydate = escapeHtml(formatDateNL(r.deliverydate));
    const status = escapeHtml(r.salesstatus ?? "");
    const href = `project.html?id=${encodeURIComponent(id)}`;

    return `
      <tr class="projects-row" data-href="${href}">
        <td><a class="pill" href="${href}">${projectNo}</a></td>
        <td>${klant}</td>
        <td>${projectName}</td>
        <td>${deliverydate}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");

  el("tbody").querySelectorAll(".projects-row").forEach(row => {
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("a, button, input, select, textarea")) return;
      window.location.href = row.dataset.href;
    });
  });
}

function compareProjects(a, b){
  const dir = sortState.dir === "desc" ? -1 : 1;
  const key = sortState.key;

  let av;
  let bv;

  if (key === "projectNo") {
    av = numericOrText(a[DB.projectNoCol]);
    bv = numericOrText(b[DB.projectNoCol]);
  } else if (key === "customer") {
    av = String(a.name_kl ?? "").toLowerCase();
    bv = String(b.name_kl ?? "").toLowerCase();
  } else if (key === "deliverydate") {
    av = dateValue(a.deliverydate);
    bv = dateValue(b.deliverydate);
  } else if (key === "status") {
    av = Number(a.salesstatus ?? 0);
    bv = Number(b.salesstatus ?? 0);
  } else {
    av = "";
    bv = "";
  }

  if (typeof av === "number" && typeof bv === "number") {
    return (av - bv) * dir;
  }

  return String(av).localeCompare(String(bv), "nl", { numeric:true, sensitivity:"base" }) * dir;
}

function numericOrText(value){
  const text = String(value ?? "").trim();
  const num = Number(text);
  return Number.isFinite(num) && text !== "" ? num : text.toLowerCase();
}

function dateValue(value){
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function formatDateNL(value){
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function updateSortHeaders(){
  document.querySelectorAll(".projects-sort").forEach(btn => {
    const active = btn.dataset.sort === sortState.key;
    btn.classList.toggle("is-active", active);
    btn.classList.toggle("asc", active && sortState.dir === "asc");
    btn.classList.toggle("desc", active && sortState.dir === "desc");
  });
}

function openProjectModal(){
  el("pmProjectNr").value = "";
  el("pmKlant").value = "";
  el("pmProjectNaam").value = "";
  el("pmStatus").value = "2";

  el("projectModalBackdrop").hidden = false;
  el("projectModal").hidden = false;

  setTimeout(() => el("pmProjectNr")?.focus(), 0);
}

function closeProjectModal(){
  el("projectModalBackdrop").hidden = true;
  el("projectModal").hidden = true;
}

async function saveNewProject(){
  const btn = el("btnProjectSave");

  const projectNo = String(el("pmProjectNr").value || "").trim();
  const klantNaam = String(el("pmKlant").value || "").trim();
  const projectName = String(el("pmProjectNaam").value || "").trim();
  const salesstatus = Number(el("pmStatus").value || 2);

  if (!projectNo) {
    alert("Vul een projectnummer in.");
    return;
  }

  if (!klantNaam) {
    alert("Vul een klantnaam in.");
    return;
  }

  if (!projectName) {
    alert("Vul een projectnaam in.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Opslaan…";

  try {
    const tProj = DB.tables.projects;

    const projectRow = {
      [DB.projectNoCol]: projectNo,
      [DB.projectNameCol]: projectName,
      name_kl: klantNaam,
      salesstatus: salesstatus
    };

    const { error } = await sb
      .from(tProj)
      .insert(projectRow);

    if (error) {
      throw new Error("Project aanmaken mislukt: " + error.message);
    }

    closeProjectModal();
    await load();

  } catch (e) {
    console.warn("Project toevoegen mislukt:", e);
    alert(e.message || String(e));
  } finally {
    btn.disabled = false;
    btn.textContent = "Opslaan";
  }
}
