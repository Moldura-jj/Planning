// planning-status2-inline-fix.js
// Alleen styling voor status-2 regels. De positie en kliklogica zitten in planning.js.

function ensureStyle(){
  if (document.getElementById("status2InlineFixStyle")) return;

  const style = document.createElement("style");
  style.id = "status2InlineFixStyle";
  style.textContent = `
    .status2-badge{
      display:inline-block;
      margin-left:6px;
      padding:1px 6px;
      border-radius:999px;
      border:1px solid #8b5cf6;
      background:#f5f3ff;
      color:#5b21b6;
      font-size:10px;
      font-weight:700;
      line-height:1.35;
      vertical-align:middle;
    }

    .planner-table tbody tr.status2-project-row > td,
    .planner-table tbody tr.status2-project-row > th{
      background-color:#f5f3ff !important;
      background-image:none !important;
    }

    .planner-table tbody tr.status2-project-row > td.project-cell,
    .planner-table tbody tr.status2-project-row > td.rowhdr{
      outline:1px solid rgba(139,92,246,.45);
      outline-offset:-1px;
    }

    .planner-table tbody tr.status2-child-row > td,
    .planner-table tbody tr.status2-child-row > th{
      background-color:#faf5ff !important;
      background-image:none !important;
    }

    .planner-table tbody tr.project-row > td,
    .planner-table tbody tr.project-row > th,
    .planner-table tbody tr.project-topline > td,
    .planner-table tbody tr.project-topline > th,
    .planner-table tbody tr.project-bottomline > td,
    .planner-table tbody tr.project-bottomline > th,
    .planner-table tbody tr.project-row.project-bottomline > td,
    .planner-table tbody tr.project-row.project-bottomline > th{
      border-top:1px solid #d7dde7 !important;
      border-bottom:1px solid #d7dde7 !important;
      box-shadow:none !important;
    }
  `;
  document.head.appendChild(style);
}

function addStatus2Badges(){
  document.querySelectorAll("tr.status2-project-row").forEach(projectRow => {
    const target = projectRow.querySelector(".projline2") || projectRow.querySelector(".projline1");
    if (!target || target.querySelector(".status2-badge")) return;

    const badge = document.createElement("span");
    badge.className = "status2-badge";
    badge.textContent = "Status 2";
    badge.title = "Mogelijke opdracht / status 2";
    target.appendChild(document.createTextNode(" "));
    target.appendChild(badge);
  });
}

function run(){
  ensureStyle();
  addStatus2Badges();
}

window.addEventListener("DOMContentLoaded", run);
window.addEventListener("load", run);
setTimeout(run, 250);
setTimeout(run, 1000);
