// planning-capacity-sticky-bottom.js
// Tijdelijk uitgeschakeld.
// De eerdere sticky/clone-oplossingen verstoorden de planningtabel-layout.
// Dit bestand ruimt resten op en doet daarna niets, zodat de planning weer normaal wordt weergegeven.

(function cleanupBrokenCapacitySticky(){
  try {
    document.getElementById("capacityStickyBottomClone")?.remove();
    document.getElementById("capacityStickyBottomStyle")?.remove();
    document.body?.classList?.remove("has-capacity-sticky-clone");
    document.documentElement?.style?.removeProperty("--capacity-sticky-height");

    document.querySelectorAll("tr.capacity-sticky-row, tr.capacity-sticky-header").forEach(row => {
      row.classList.remove("capacity-sticky-row", "capacity-sticky-header");
      row.style.removeProperty("--cap-sticky-bottom");
      row.style.removeProperty("position");
      row.style.removeProperty("bottom");
      row.style.removeProperty("z-index");
    });

    document.querySelectorAll("#plannerGrid td, #plannerGrid th, #plannerGrid tr").forEach(el => {
      el.style.removeProperty("bottom");
      el.style.removeProperty("z-index");
      el.style.removeProperty("transform");
    });
  } catch (e) {
    console.warn("Sticky capaciteit cleanup mislukt:", e);
  }
})();