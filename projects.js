// projects.js
import { makeSupabaseClient, requireSession, signOut } from "./auth.js";
import { DB } from "./config.js";
import { el, escapeHtml, setStatus } from "./utils.js";

const sb = makeSupabaseClient();

let rows = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const session = await requireSession(sb);
  if (!session) return;

  el("btnLogout").addEventListener("click", () => signOut(sb));
  el("btnReload").addEventListener("click", load);
  el("q").addEventListener("input", render);

  await load();
}

function hasCustomerTable() {
  return !!(
    DB.tables.customers &&
    DB.projectCustomerFk &&
    DB.customerPkCol
  );
}

function buildProjectSelect({ includeCustomerFk = false, includeProjectCustomerName = false }) {
  const cols = [
    `id:${DB.projectPkCol}`,
    DB.projectNoCol,
    DB.projectNameCol,
    "salesstatus",
  ];

  if (includeCustomerFk && DB.projectCustomerFk) {
    cols.push(DB.projectCustomerFk);
  }

  if (includeProjectCustomerName && DB.customerNameCol) {
    cols.push(DB.customerNameCol);
  }

  return cols.filter(Boolean).join(", ");
}

async function load() {
  setStatus(el("status"), "Laden...");
  el("tbody").innerHTML = "";

  const tProj = DB.tables.projects;
  const tCust = DB.tables.customers;
  const useCustomerTable = hasCustomerTable();

  // GEEN aparte klantentabel -> klantnaam gewoon uit projecten lezen
  if (!useCustomerTable) {
    const selectCols = buildProjectSelect({
      includeCustomerFk: false,
      includeProjectCustomerName: true,
    });

    const { data, error } = await sb
      .from(tProj)
      .select(selectCols)
      .order(DB.projectNoCol, { ascending: false })
      .limit(500);

    if (error) {
      setStatus(el("status"), error.message, "error");
      return;
    }

    rows = data || [];
    setStatus(el("status"), "");
    render();
    return;
  }

  // WEL aparte klantentabel -> eerst join proberen
  const joinName = "klant";
  const joinSelect =
    `${buildProjectSelect({ includeCustomerFk: true, includeProjectCustomerName: false })}, ` +
    `${joinName}:${tCust}(id:${DB.customerPkCol}, ${DB.customerNameCol})`;

  const { data, error } = await sb
    .from(tProj)
    .select(joinSelect)
    .order(DB.projectNoCol, { ascending: false })
    .limit(500);

  if (error) {
    console.warn("Join query failed, fallback to 2-step", error.message);

    const a = await sb
      .from(tProj)
      .select(buildProjectSelect({ includeCustomerFk: true, includeProjectCustomerName: false }))
      .order(DB.projectNoCol, { ascending: false })
      .limit(500);

    if (a.error) {
      setStatus(el("status"), a.error.message, "error");
      return;
    }

    const custIds = [
      ...new Set((a.data || []).map(r => r[DB.projectCustomerFk]).filter(Boolean)),
    ];

    const custMap = new Map();

    if (custIds.length) {
      const b = await sb
        .from(tCust)
        .select(`id:${DB.customerPkCol}, ${DB.customerNameCol}`)
        .in(DB.customerPkCol, custIds);

      if (b.error) {
        setStatus(el("status"), b.error.message, "error");
        return;
      }

      (b.data || []).forEach(c => custMap.set(c.id, c));
    }

    rows = (a.data || []).map(p => ({
      ...p,
      klant: custMap.get(p[DB.projectCustomerFk]) || null,
    }));
  } else {
    rows = data || [];
  }

  setStatus(el("status"), "");
  render();
}

function render() {
  const q = (el("q").value || "").trim().toLowerCase();
  const useCustomerTable = hasCustomerTable();

  const filtered = !q
    ? rows
    : rows.filter(r => {
        const no = (r[DB.projectNoCol] ?? "").toString().toLowerCase();
        const pr = (r[DB.projectNameCol] ?? "").toString().toLowerCase();
        const kn = useCustomerTable
          ? (r.klant?.[DB.customerNameCol] ?? "").toString().toLowerCase()
          : (r[DB.customerNameCol] ?? "").toString().toLowerCase();

        return no.includes(q) || pr.includes(q) || kn.includes(q);
      });

  el("meta").textContent = `${filtered.length} / ${rows.length}`;

  el("tbody").innerHTML = filtered
    .map(r => {
      const id = r.id;
      const projectNo = escapeHtml(r[DB.projectNoCol] ?? "");
      const projectName = escapeHtml(r[DB.projectNameCol] ?? "");
      const klant = escapeHtml(
        useCustomerTable
          ? (r.klant?.[DB.customerNameCol] ?? "")
          : (r[DB.customerNameCol] ?? "")
      );
      const status = escapeHtml(r.salesstatus ?? "");

      return `
        <tr>
          <td><a class="pill" href="project.html?id=${encodeURIComponent(id)}">${projectNo}</a></td>
          <td>${klant}</td>
          <td>${projectName}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join("");
}
