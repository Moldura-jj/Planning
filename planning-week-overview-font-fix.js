// planning-week-overview-font-fix.js
// Maakt de tekst in het weekoverzicht groter en duidelijker.

(function(){
  function applyWeekOverviewFontFix(){
    document.getElementById("weekOverviewFontFixStyle")?.remove();
    const style = document.createElement("style");
    style.id = "weekOverviewFontFixStyle";
    style.textContent = `
      .week-overview-title{
        font-size:20px !important;
        font-weight:900 !important;
      }
      .week-overview-sub{
        font-size:13px !important;
        color:#475569 !important;
      }
      .week-day-head{
        padding:12px 12px 10px !important;
      }
      .week-day-name{
        font-size:17px !important;
        font-weight:900 !important;
        color:#0f172a !important;
        line-height:1.15 !important;
      }
      .week-day-date{
        font-size:12px !important;
        color:#475569 !important;
      }
      .week-emp-block{
        padding:10px 12px !important;
      }
      .week-emp-name{
        font-size:13.5px !important;
        font-weight:900 !important;
        color:#0f172a !important;
        margin-bottom:7px !important;
        line-height:1.25 !important;
      }
      .week-card{
        font-size:13.5px !important;
        line-height:1.35 !important;
        padding:9px 10px !important;
        color:#0f172a !important;
      }
      .week-card-type{
        font-size:11px !important;
        font-weight:900 !important;
        color:#334155 !important;
        margin-bottom:3px !important;
      }
      .week-empty,
      .week-unavailable{
        font-size:13px !important;
        line-height:1.35 !important;
      }
      .week-empty{
        color:#475569 !important;
      }
      .week-unavailable{
        color:#64748b !important;
      }
      .week-concepts-title{
        font-size:13.5px !important;
        font-weight:900 !important;
      }
      .week-overview-grid{
        gap:12px !important;
      }
      .week-day-col{
        min-width:230px !important;
      }
    `;
    document.head.appendChild(style);
  }

  window.addEventListener("DOMContentLoaded", applyWeekOverviewFontFix);
  window.addEventListener("load", applyWeekOverviewFontFix);
  document.addEventListener("click", (ev) => {
    if (String(ev.target?.textContent || "").match(/Wk\s+\d+/i) || ev.target.closest?.(".week-clickable-week")) {
      setTimeout(applyWeekOverviewFontFix, 250);
      setTimeout(applyWeekOverviewFontFix, 900);
    }
  }, true);

  const obs = new MutationObserver(() => {
    if (document.getElementById("weekOverviewBackdrop")) applyWeekOverviewFontFix();
  });
  obs.observe(document.body, { childList:true, subtree:true });
})();
