// projects.js
import { makeSupabaseClient, requireSession, signOut } from "./auth.js";
import { DB } from "./config.js";
import { el, escapeHtml, setStatus } from "./utils.js";

const sb = makeSupabaseClient();

let rows = [];

document.addEventListener("DOMContentLoaded", init);

async function init(){
  const session = await requireSession(sb);
  if(!session) return;

  el("btnLogout").addEventListener("click", ()=>signOut(sb));
  el("btnReload").addEventListener("click", load);
  el("q").addEventListener("input", render);

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
      deliveryname,
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
    const kn = (r.deliveryname ?? "").toString().toLowerCase();

    return no.includes(q) || pr.includes(q) || kn.includes(q);
  });

  el("meta").textContent = `${filtered.length} / ${rows.length}`;

  el("tbody").innerHTML = filtered.map(r=>{
    const id = r.id;
    const projectNo = escapeHtml(r[DB.projectNoCol] ?? "");
    const projectName = escapeHtml(r[DB.projectNameCol] ?? "");
    const klant = escapeHtml(r.deliveryname ?? "");
    const status = escapeHtml(r.salesstatus ?? "");

    return `
      <tr>
        <td><a class="pill" href="project.html?id=${encodeURIComponent(id)}">${projectNo}</a></td>
        <td>${klant}</td>
        <td>${projectName}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");
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
      deliveryname: klantNaam,
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