import { makeSupabaseClient } from "./auth.js";

// planning-delete-planned-hours.js
// Klik op een sectie/Productie/Montage-regel en kies om alle geplande
// Prod.+CNC en/of Mont.+Reis uren te verwijderen.

const sbDeletePlanned = makeSupabaseClient();
let deletePlannedContext = null;

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

function ensureDeletePlannedStyle(){
  if (document.getElementById("deletePlannedHoursStyle")) return;
  const style = document.createElement("style");
  style.id = "deletePlannedHoursStyle";
  style.textContent = `
    .delete-planned-backdrop{
      position:fixed;
      inset:0;
      z-index:99999;
      background:rgba(15,23,42,.35);
      display:none;
      align-items:center;
      justify-content:center;
      padding:18px;
    }
    .delete-planned-backdrop.show{ display:flex; }
    .delete-planned-modal{
      width:min(480px, calc(100vw - 36px));
      border-radius:14px;
      background:#fff;
      box-shadow:0 22px 70px rgba(15,23,42,.28);
      overflow:hidden;
      border:1px solid rgba(148,163,184,.45);
    }
    .delete-planned-hd{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:12px;
      padding:14px 16px;
      border-bottom:1px solid #e2e8f0;
    }
    .delete-planned-title{ font-weight:800; color:#0f172a; font-size:15px; }
    .delete-planned-sub{ color:#64748b; font-size:12px; margin-top:2px; line-height:1.35; }
    .delete-planned-close{
      border:1px solid #cbd5e1;
      background:#fff;
      border-radius:9px;
      width:32px;
      height:32px;
      cursor:pointer;
      font-size:16px;
      line-height:1;
    }
    .delete-planned-bd{ padding:14px 16px 16px; }
    .delete-planned-warning{
      margin-bottom:12px;
      padding:10px 12px;
      border-radius:10px;
      background:#fff7ed;
      border:1px solid #fed7aa;
      color:#9a3412;
      font-size:12px;
      line-height:1.35;
    }
    .delete-planned-actions{
      display:grid;
      gap:8px;
    }
    .delete-planned-actions button{
      width:100%;
      border:1px solid #cbd5e1;
      background:#f8fafc;
      border-radius:10px;
      padding:10px 12px;
      cursor:pointer;
      font-weight:700;
      text-align:left;
      color:#0f172a;
    }
    .delete-planned-actions button:hover{ background:#eef2ff; border-color:#93c5fd; }
    .delete-planned-actions button.danger{ background:#fff1f2; border-color:#fda4af; color:#9f1239; }
    .delete-planned-actions button.danger:hover{ background:#ffe4e6; }
    .delete-planned-small{ font-size:11px; color:#64748b; font-weight:500; display:block; margin-top:2px; }
    .section-cell .sectext.no-expander,
    tr.productie-summary-row .section-cell,
    tr.montage-summary-row .section-cell{
      cursor:pointer;
    }
  `;
  document.head.appendChild(style);
}

function ensureDeletePlannedModal(){
  ensureDeletePlannedStyle();
  let wrap = document.getElementById("deletePlannedHoursBackdrop");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.id = "deletePlannedHoursBackdrop";
  wrap.className = "delete-planned-backdrop";
  wrap.innerHTML = `
    <div class="delete-planned-modal" role="dialog" aria-modal="true" aria-labelledby="deletePlannedTitle">
      <div class="delete-planned-hd">
        <div>
          <div class="delete-planned-title" id="deletePlannedTitle">Geplande uren verwijderen</div>
          <div class="delete-planned-sub" id="deletePlannedSub"></div>
        </div>
        <button class="delete-planned-close" type="button" aria-label="Sluiten">×</button>
      </div>
      <div class="delete-planned-bd">
        <div class="delete-planned-warning">
          Deze actie verwijdert planningregels uit de database. Dit kun je niet automatisch terugzetten.
        </div>
        <div class="delete-planned-actions">
          <button type="button" data-delete-kind="prod">
            Verwijder Prod.+CNC
            <span class="delete-planned-small">Productie en CNC planning verwijderen.</span>
          </button>
          <button type="button" data-delete-kind="mont">
            Verwijder Mont.+Reis
            <span class="delete-planned-small">Montage en reisuren verwijderen.</span>
          </button>
          <button type="button" class="danger" data-delete-kind="both">
            Verwijder Prod.+CNC én Mont.+Reis
            <span class="delete-planned-small">Alle productie-, CNC-, montage- en reisplanning verwijderen.</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  wrap.querySelector(".delete-planned-close")?.addEventListener("click", closeDeletePlannedModal);
  wrap.addEventListener("click", (ev) => {
    if (ev.target === wrap) closeDeletePlannedModal();
    const btn = ev.target.closest("button[data-delete-kind]");
    if (btn) deletePlannedHours(btn.dataset.deleteKind);
  });
  return wrap;
}

function closeDeletePlannedModal(){
  document.getElementById("deletePlannedHoursBackdrop")?.classList.remove("show");
}

function findContextFromClick(target){
  if (target.closest("button, input, select, textarea, a")) return null;

  const row = target.closest("tr.section-row");
  if (!row) return null;

  const leftCell = target.closest("td.section-cell, td.rowhdr");
  if (!leftCell) return null;

  const projectId = String(row.dataset.parent || "").trim();
  const label = textOf(leftCell) || "regel";

  if (row.classList.contains("productie-summary-row")) {
    return { scope:"project", summaryType:"productie", projectId, label:"Productie" };
  }

  if (row.classList.contains("montage-summary-row")) {
    return { scope:"project", summaryType:"montage", projectId, label:"Montage" };
  }

  const sectionId = String(row.querySelector(".sectname[data-sect]")?.dataset?.sect || "").trim();
  if (sectionId) {
    return { scope:"section", sectionId, projectId, label };
  }

  return null;
}

function openDeletePlannedModal(ctx){
  deletePlannedContext = ctx;
  const wrap = ensureDeletePlannedModal();
  const sub = wrap.querySelector("#deletePlannedSub");
  if (sub) {
    const scopeText = ctx.scope === "section"
      ? `Sectie: ${ctx.label}`
      : `Projectregel: ${ctx.label}`;
    sub.innerHTML = escapeHtml(scopeText);
  }
  wrap.classList.add("show");
}

function workTypesFor(kind){
  if (kind === "prod") return ["productie", "cnc"];
  if (kind === "mont") return ["montage", "reis"];
  return ["productie", "cnc", "montage", "reis"];
}

function kindLabel(kind){
  if (kind === "prod") return "Prod.+CNC";
  if (kind === "mont") return "Mont.+Reis";
  return "Prod.+CNC en Mont.+Reis";
}

async function deleteFromSectionAssignments(ctx, types){
  if (ctx.scope === "section") {
    return await sbDeletePlanned
      .from("section_assignments")
      .delete()
      .eq("section_id", ctx.sectionId)
      .in("work_type", types);
  }

  // Project-summary regels: verwijder sectieplanning van alle secties binnen dit project niet zomaar.
  // Dit verwijdert projectniveau-planning. Sectieniveau kun je per sectie verwijderen door de sectie zelf te klikken.
  return { data:null, error:null };
}

async function deleteFromProjectAssignments(ctx, types){
  if (!ctx.projectId) return { data:null, error:null };
  return await sbDeletePlanned
    .from("project_assignments")
    .delete()
    .eq("project_id", ctx.projectId)
    .in("work_type", types);
}

async function deletePlannedHours(kind){
  const ctx = deletePlannedContext;
  if (!ctx) return;
  const types = workTypesFor(kind);

  const msg = ctx.scope === "section"
    ? `${kindLabel(kind)} verwijderen voor sectie:\n${ctx.label}?`
    : `${kindLabel(kind)} verwijderen op projectniveau voor:\n${ctx.label}?`;

  if (!window.confirm(msg)) return;

  const resSection = await deleteFromSectionAssignments(ctx, types);
  if (resSection.error) {
    alert("Fout bij verwijderen sectieplanning: " + resSection.error.message);
    return;
  }

  const resProject = await deleteFromProjectAssignments(ctx, types);
  if (resProject.error) {
    alert("Fout bij verwijderen projectplanning: " + resProject.error.message);
    return;
  }

  closeDeletePlannedModal();

  // Beste beschikbare refresh zonder planning.js intern aan te roepen.
  // De app luistert ook via realtime; extra reload maakt het directer.
  window.setTimeout(() => window.location.reload(), 250);
}

window.addEventListener("DOMContentLoaded", ensureDeletePlannedStyle);

document.addEventListener("click", (ev) => {
  const ctx = findContextFromClick(ev.target);
  if (!ctx) return;

  ev.preventDefault();
  ev.stopPropagation();
  openDeletePlannedModal(ctx);
}, true);
