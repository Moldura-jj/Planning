// planning-week-overview-coworkers.js
// Toont in het weekoverzicht welke collega's op dezelfde dag op dezelfde planningkaart staan.

(function(){
  function esc(s){
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyle(){
    if (document.getElementById("weekOverviewCoworkersStyle")) return;
    const style = document.createElement("style");
    style.id = "weekOverviewCoworkersStyle";
    style.textContent = `
      .week-card-coworkers{
        margin-top:6px;
        padding-top:5px;
        border-top:1px solid rgba(15,23,42,.12);
        font-size:12px;
        line-height:1.25;
        color:#334155;
        font-weight:700;
      }
      .week-card-coworkers span{
        font-weight:800;
        color:#0f172a;
      }
    `;
    document.head.appendChild(style);
  }

  function cardType(card){
    if (card.classList.contains("prod")) return "prod";
    if (card.classList.contains("mont")) return "mont";
    if (card.classList.contains("wvb")) return "wvb";
    if (card.classList.contains("reis")) return "reis";
    return "other";
  }

  function cleanCardText(card){
    const clone = card.cloneNode(true);
    clone.querySelectorAll(".week-card-type, .week-card-coworkers").forEach(el => el.remove());
    return String(clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function applyCoworkers(){
    ensureStyle();

    const modal = document.getElementById("weekOverviewBackdrop");
    if (!modal || !modal.classList.contains("show")) return;

    modal.querySelectorAll(".week-card-coworkers").forEach(el => el.remove());

    modal.querySelectorAll(".week-day-col").forEach(dayCol => {
      const groups = new Map();

      dayCol.querySelectorAll(".week-emp-block").forEach(empBlock => {
        const empName = String(empBlock.querySelector(".week-emp-name")?.textContent || "").trim();
        if (!empName) return;

        empBlock.querySelectorAll(".week-card").forEach(card => {
          if (card.classList.contains("absence") || card.classList.contains("concept")) return;

          const text = cleanCardText(card);
          if (!text) return;

          const key = `${cardType(card)}||${text}`;
          if (!groups.has(key)) groups.set(key, { names: new Set(), cards: [] });
          groups.get(key).names.add(empName);
          groups.get(key).cards.push(card);
        });
      });

      for (const group of groups.values()) {
        const names = Array.from(group.names);
        if (names.length < 2) continue;

        const html = `<div class="week-card-coworkers">Samen: <span>${esc(names.join(", "))}</span></div>`;
        group.cards.forEach(card => card.insertAdjacentHTML("beforeend", html));
      }
    });
  }

  let pending = false;
  function schedule(){
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      applyCoworkers();
    });
  }

  document.addEventListener("click", () => setTimeout(schedule, 250), true);
  window.addEventListener("load", () => setTimeout(schedule, 1000));

  const obs = new MutationObserver(schedule);
  obs.observe(document.body, { childList:true, subtree:true });
})();
