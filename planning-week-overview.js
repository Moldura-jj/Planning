// planning-week-overview.js
// Klik op weeknummer => weekoverzicht per dag/medewerker + concepten + verlof.
// Beschikbaarheid wordt nu meegenomen, zodat 'Beschikbaar' alleen wordt getoond bij uren > 0.

(function(){
  const DAY_NAMES = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
  let sbPromise = null;

  function esc(s){
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseISODate(iso){
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function toISODate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function addDays(d, n){
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function startOfISOWeek(d){
    const x = new Date(d);
    const day = x.getDay() || 7;
    x.setDate(x.getDate() - day + 1);
    x.setHours(0,0,0,0);
    return x;
  }

  function isoWeekNumber(d){
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil((((x - yearStart) / 86400000) + 1) / 7);
  }

  function fmtDate(iso){
    const d = parseISODate(iso);
    if (!d) return iso;
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()}-${d.getMonth()+1}`;
  }

  function fmtHours(n){
    const v = Math.round(Number(n || 0) * 100) / 100;
    const s = (v % 1 === 0) ? String(v) : v.toFixed(2);
    return s.replace(".", ",").replace(/,00$/, "");
  }

  async function getSupabase(){
    if (!sbPromise) sbPromise = import("./auth.js").then(m => m.makeSupabaseClient());
    return sbPromise;
  }

  function ensureStyle(){
    document.getElementById("weekOverviewStyle")?.remove();
    const style = document.createElement("style");
    style.id = "weekOverviewStyle";
    style.textContent = `
      .week-overview-backdrop{
        position:fixed; inset:0; z-index:9999; background:rgba(15,23,42,.35);
        display:none; align-items:center; justify-content:center; padding:18px;
      }
      .week-overview-backdrop.show{ display:flex; }
      .week-overview-modal{
        width:min(96vw, 1560px); max-height:92vh; background:#fff; border-radius:18px;
        box-shadow:0 24px 70px rgba(15,23,42,.28); overflow:hidden; display:flex; flex-direction:column;
        border:1px solid #dbe3ef;
      }
      .week-overview-hd{
        display:flex; justify-content:space-between; gap:16px; align-items:flex-start;
        padding:16px 18px 12px; border-bottom:1px solid #e5e7eb;
      }
      .week-overview-title{ font-weight:800; font-size:18px; color:#0f172a; }
      .week-overview-sub{ margin-top:2px; font-size:12px; color:#64748b; }
      .week-overview-close{
        width:34px; height:34px; border:1px solid #cbd5e1; border-radius:10px; background:#fff;
        cursor:pointer; font-size:18px; line-height:1;
      }
      .week-overview-body{ overflow:auto; padding:14px; background:#f8fafc; }
      .week-overview-grid{ display:grid; gap:10px; min-width:0; }
      .week-day-col{ background:#fff; border:1px solid #dbe3ef; border-radius:14px; overflow:hidden; min-width:210px; }
      .week-day-head{ padding:10px 10px 8px; border-bottom:1px solid #e5e7eb; background:#f1f5f9; }
      .week-day-name{ font-weight:800; color:#0f172a; }
      .week-day-date{ font-size:11px; color:#64748b; margin-top:1px; }
      .week-emp-block{ padding:9px 10px; border-bottom:1px solid #eef2f7; }
      .week-emp-name{ font-weight:800; font-size:12px; color:#0f172a; margin-bottom:6px; }
      .week-card{
        border-radius:10px; padding:7px 9px; margin:5px 0; font-size:12px; line-height:1.25;
        border:1px solid #bfdbfe; background:#dff3ff; color:#0f172a;
      }
      .week-card.prod{ background:#dcfce7; border-color:#bbf7d0; }
      .week-card.mont{ background:#fef9c3; border-color:#fde68a; }
      .week-card.wvb{ background:#dbeafe; border-color:#bfdbfe; }
      .week-card.reis{ background:#fef3c7; border-color:#fde68a; }
      .week-card.absence{ background:#fed7aa; border-color:#fb923c; }
      .week-card.concept{ background:#f5f3ff; border-color:#c4b5fd; }
      .week-card-type{ display:block; font-size:10px; color:#64748b; margin-bottom:2px; font-weight:700; text-transform:uppercase; letter-spacing:.02em; }
      .week-empty{ font-size:12px; color:#64748b; padding:4px 0; }
      .week-unavailable{ font-size:12px; color:#94a3b8; padding:4px 0; }
      .week-concepts{ padding:10px; background:#faf5ff; border-top:2px solid #ddd6fe; }
      .week-concepts-title{ font-weight:900; color:#5b21b6; font-size:12px; margin-bottom:6px; }
      .week-clickable-week{ cursor:pointer !important; }
      .week-clickable-week:hover{ background:#e0f2fe !important; }
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    ensureStyle();
    let backdrop = document.getElementById("weekOverviewBackdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "weekOverviewBackdrop";
    backdrop.className = "week-overview-backdrop";
    backdrop.innerHTML = `
      <div class="week-overview-modal" role="dialog" aria-modal="true">
        <div class="week-overview-hd">
          <div>
            <div class="week-overview-title" id="weekOverviewTitle">Weekoverzicht</div>
            <div class="week-overview-sub" id="weekOverviewSub"></div>
          </div>
          <button class="week-overview-close" id="weekOverviewClose" type="button">×</button>
        </div>
        <div class="week-overview-body" id="weekOverviewBody"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) closeModal(); });
    backdrop.querySelector("#weekOverviewClose").addEventListener("click", closeModal);
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });
    return backdrop;
  }

  function closeModal(){
    document.getElementById("weekOverviewBackdrop")?.classList.remove("show");
  }

  function getVisibleWeekDaysForWeekNo(weekNo){
    const days = Array.from(document.querySelectorAll(".dayhead[data-iso], .dayhead-btn[data-iso]"))
      .map(el => String(el.dataset.iso || ""))
      .filter(Boolean)
      .map(iso => ({ iso, date: parseISODate(iso) }))
      .filter(x => x.date && isoWeekNumber(x.date) === Number(weekNo));

    const seen = new Set();
    const unique = days.filter(x => {
      if (seen.has(x.iso)) return false;
      seen.add(x.iso);
      return true;
    }).sort((a,b) => a.date - b.date);

    if (unique.length) {
      const start = startOfISOWeek(unique[0].date);
      return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
    }
    return [];
  }

  function buildEmployeeMap(){
    const map = new Map();
    document.querySelectorAll(".cap-emp-click[data-emp-id]").forEach(el => {
      const id = String(el.dataset.empId || "").trim();
      const name = String(el.dataset.empName || el.textContent || "").trim();
      if (id && name && !map.has(id)) map.set(id, name);
    });
    return map;
  }

  function normalizeType(t){
    const x = String(t || "").toLowerCase().trim();
    if (x.includes("werkvoor") || x === "wvb") return "wvb";
    if (x === "cnc" || x === "productie") return "prod";
    if (x === "montage") return "mont";
    if (x === "reis") return "reis";
    return x || "prod";
  }

  function normalizeDiscipline(t){
    const x = String(t || "").toLowerCase().trim();
    if (x === "geen" || x === "none" || x === "0") return "geen";
    if (x === "wvb" || x.includes("werkvoor")) return "wvb";
    return "prod_mont";
  }

  function typeLabel(t){
    if (t === "wvb") return "WVB";
    if (t === "prod") return "Productie";
    if (t === "mont") return "Montage";
    if (t === "reis") return "Reis";
    if (t === "absence") return "Verlof";
    if (t === "concept") return "Concept";
    return t;
  }

  function projectLabel(ctx, pid){
    const p = ctx?.projMetaById?.get?.(String(pid)) || {};
    const nr = String(p.nr || p.number || "").trim();
    const nm = String(p.nm || p.name || "").trim();
    return [nr, nm].filter(Boolean).join(" - ") || String(pid || "Project");
  }

  function sectionLabel(ctx, sid){
    const s = ctx?.sectById?.get?.(String(sid)) || {};
    const para = String(s?.[ctx.sectParaKey] || s?.paragraph || "").trim();
    const name = String(s?.[ctx.sectNameKey] || s?.name || "").trim();
    return [para, name].filter(Boolean).join(" ");
  }

  function pushUnique(list, item){
    const key = `${item.type}|${item.text}|${item.empId || ""}`;
    if (list.some(x => `${x.type}|${x.text}|${x.empId || ""}` === key)) return;
    list.push(item);
  }

  async function loadAbsences(days, employees){
    const ids = Array.from(employees.keys()).map(Number).filter(Number.isFinite);
    if (!ids.length || !days.length) return [];
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from("employee_absences")
        .select("id, werknemer_id, work_date, hours, all_day, title, note")
        .in("werknemer_id", ids)
        .gte("work_date", days[0])
        .lte("work_date", days[days.length - 1])
        .limit(5000);
      if (error) {
        console.warn("Weekoverzicht verlof laden mislukt:", error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn("Weekoverzicht verlof laden mislukt:", e);
      return [];
    }
  }

  async function loadCapacity(days, employees){
    const ids = Array.from(employees.keys()).map(Number).filter(Number.isFinite);
    const out = new Map();
    for (const id of employees.keys()) out.set(String(id), new Map());
    if (!ids.length || !days.length) return out;

    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from("capacity_entries")
        .select("werknemer_id, work_date, hours, type")
        .in("werknemer_id", ids)
        .gte("work_date", days[0])
        .lte("work_date", days[days.length - 1])
        .limit(5000);
      if (error) {
        console.warn("Weekoverzicht beschikbaarheid laden mislukt:", error.message);
        return out;
      }

      for (const r of data || []) {
        const empId = String(r.werknemer_id ?? "").trim();
        const iso = String(r.work_date || "").slice(0,10);
        const hours = normalizeDiscipline(r.type) === "geen" ? 0 : Number(r.hours || 0);
        if (!empId || !iso || !out.has(empId)) continue;
        out.get(empId).set(iso, (out.get(empId).get(iso) || 0) + Math.max(0, hours));
      }
    } catch (e) {
      console.warn("Weekoverzicht beschikbaarheid laden mislukt:", e);
    }
    return out;
  }

  async function collectWeekData(days){
    const ctx = window.__plannerCtx || {};
    const employees = buildEmployeeMap();
    const availability = await loadCapacity(days, employees);
    const byDay = new Map(days.map(iso => [iso, { employees: new Map(), concepts: [] }]));

    for (const iso of days) {
      for (const [empId, name] of employees) {
        const availableHours = Number(availability.get(String(empId))?.get(iso) || 0);
        byDay.get(iso).employees.set(empId, { name, availableHours, items: [] });
      }
    }

    const handleRows = (sid, pid, dm, isProjectLevel = false) => {
      if (!dm) return;
      for (const iso of days) {
        const entry = dm.get?.(iso);
        if (!entry) continue;
        const baseText = [projectLabel(ctx, pid), isProjectLevel ? "" : sectionLabel(ctx, sid)].filter(Boolean).join("\n");

        for (const r of (entry.rows || [])) {
          const empId = String(r.werknemer_id ?? "").trim();
          const wt = normalizeType(r.work_type);
          const isRealEmployee = employees.has(empId);
          const note = String(r.note || "").trim();

          if (isRealEmployee) {
            pushUnique(byDay.get(iso).employees.get(empId).items, { type: wt, text: baseText || "Planning" });
          } else if (!note.startsWith("inhuur:")) {
            pushUnique(byDay.get(iso).concepts, {
              type: "concept",
              text: `${baseText || "Concept"}${r.hours ? `\n${String(r.hours).replace(".", ",")} uur` : ""}`
            });
          }
        }
      }
    };

    for (const [sid, dm] of (ctx.assignMap || new Map())) {
      const s = ctx.sectById?.get?.(String(sid)) || {};
      const pid = String(s?.[ctx.sectProjKey] || "").trim();
      handleRows(String(sid), pid, dm, false);
    }

    for (const [pid, dm] of (ctx.projectAssignMap || new Map())) {
      handleRows("", String(pid), dm, true);
    }

    let absRows = [];
    if (ctx.absenceByEmp instanceof Map) {
      for (const [empId, dm] of ctx.absenceByEmp) {
        for (const iso of days) {
          for (const r of (dm.get?.(iso) || [])) absRows.push({ ...r, werknemer_id: empId, work_date: iso });
        }
      }
    } else {
      absRows = await loadAbsences(days, employees);
    }

    for (const r of absRows || []) {
      const empId = String(r.werknemer_id ?? "").trim();
      const iso = String(r.work_date || "").slice(0, 10);
      if (!employees.has(empId) || !byDay.has(iso)) continue;
      const h = Number(r.hours || 0);
      const title = String(r.title || "Verlof").trim() || "Verlof";
      const line2 = h > 0 ? `${fmtHours(h)} uur${r.all_day ? " • hele dag" : ""}` : (r.all_day ? "Hele dag" : "");
      pushUnique(byDay.get(iso).employees.get(empId).items, {
        type: "absence",
        text: [title, line2].filter(Boolean).join("\n")
      });
    }

    return { byDay, employees };
  }

  function cardHtml(item){
    return `<div class="week-card ${esc(item.type)}"><span class="week-card-type">${esc(typeLabel(item.type))}</span>${esc(item.text).replace(/\n/g, "<br>")}</div>`;
  }

  function dayHasContent(day){
    if (!day) return false;
    if ((day.concepts || []).length) return true;
    for (const emp of day.employees.values()) {
      if (emp?.items?.length) return true;
    }
    return false;
  }

  async function renderWeekOverview(weekNo, days){
    const modal = ensureModal();
    const title = modal.querySelector("#weekOverviewTitle");
    const sub = modal.querySelector("#weekOverviewSub");
    const body = modal.querySelector("#weekOverviewBody");

    title.textContent = `Week ${weekNo}`;
    sub.textContent = `${days[0]} t/m ${days[6]}`;
    body.innerHTML = `<div class="muted" style="padding:18px;">Weekoverzicht laden...</div>`;
    modal.classList.add("show");

    const { byDay, employees } = await collectWeekData(days);
    const employeeIds = Array.from(employees.keys());

    const visibleDays = days.filter(iso => {
      const d = parseISODate(iso);
      const isWeekend = d && (d.getDay() === 0 || d.getDay() === 6);
      return !isWeekend || dayHasContent(byDay.get(iso));
    });

    const cols = Math.max(1, visibleDays.length);
    body.innerHTML = `
      <div class="week-overview-grid" style="grid-template-columns:repeat(${cols}, minmax(210px, 1fr)); min-width:${Math.max(210 * cols, 210)}px;">
        ${visibleDays.map(iso => {
          const day = byDay.get(iso);
          return `
            <div class="week-day-col">
              <div class="week-day-head">
                <div class="week-day-name">${esc(fmtDate(iso))}</div>
                <div class="week-day-date">${esc(iso)}</div>
              </div>
              ${employeeIds.map(empId => {
                const emp = day.employees.get(empId);
                const available = Number(emp?.availableHours || 0);
                const emptyHtml = available > 0
                  ? `<div class="week-empty">Beschikbaar</div>`
                  : `<div class="week-unavailable">Niet beschikbaar</div>`;
                return `
                  <div class="week-emp-block">
                    <div class="week-emp-name">${esc(emp?.name || empId)}</div>
                    ${emp?.items?.length ? emp.items.map(cardHtml).join("") : emptyHtml}
                  </div>
                `;
              }).join("")}
              <div class="week-concepts">
                <div class="week-concepts-title">Concepten</div>
                ${day.concepts.length ? day.concepts.map(cardHtml).join("") : `<div class="week-empty">Geen concepten</div>`}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function findWeekHeaderTarget(target){
    const el = target.closest("th,td,div,button,span");
    if (!el) return null;
    const candidates = [];
    let cur = el;
    for (let i=0; cur && i<4; i++, cur = cur.parentElement) candidates.push(cur);
    return candidates.find(c => /^\s*Wk\s+\d+\s*$/i.test(String(c.textContent || "").trim())) || null;
  }

  function markWeekHeaders(){
    document.querySelectorAll("th,td,div,span,button").forEach(el => {
      const txt = String(el.textContent || "").trim();
      if (/^Wk\s+\d+$/i.test(txt)) {
        el.classList.add("week-clickable-week");
        el.title = "Weekoverzicht openen";
      }
    });
  }

  document.addEventListener("click", (ev) => {
    const header = findWeekHeaderTarget(ev.target);
    if (!header) return;

    const m = String(header.textContent || "").match(/Wk\s+(\d+)/i);
    if (!m) return;

    const weekNo = Number(m[1]);
    const days = getVisibleWeekDaysForWeekNo(weekNo);
    if (!days.length) return;

    ev.preventDefault();
    ev.stopPropagation();
    renderWeekOverview(weekNo, days);
  }, true);

  window.addEventListener("DOMContentLoaded", () => setTimeout(markWeekHeaders, 800));
  window.addEventListener("load", () => setTimeout(markWeekHeaders, 800));
  const obs = new MutationObserver(() => setTimeout(markWeekHeaders, 250));
  obs.observe(document.body, { childList:true, subtree:true });
})();