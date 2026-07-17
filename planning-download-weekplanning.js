// Downloadt het bestaande weekoverzicht voor de huidige en volgende week als één PDF.
(() => {
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function isoWeekNumber(date){
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function weekKey(date){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    return `${d.getFullYear()}-${String(isoWeekNumber(date)).padStart(2, "0")}`;
  }

  function addDays(date, days){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  function ownText(el){
    return Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(el){
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function findWeekTrigger(weekNumber){
    const root = document.getElementById("plannerGrid") || document;
    const exact = new RegExp(`^Week\\s+${weekNumber}$`, "i");
    const candidates = Array.from(root.querySelectorAll("button, [role='button'], th, td, div, span"))
      .filter(isVisible)
      .filter(el => exact.test(ownText(el) || String(el.textContent || "").trim()));

    return candidates.find(el =>
      el.matches("button, [role='button']") ||
      typeof el.onclick === "function" ||
      getComputedStyle(el).cursor === "pointer"
    ) || candidates[0] || null;
  }

  function findVisibleWeekModal(weekNumber){
    const titleRe = new RegExp(`\\bWeek\\s+${weekNumber}\\b`, "i");
    const candidates = Array.from(document.querySelectorAll(".modal, [role='dialog'], .modal-card, .week-overview-modal, .week-modal"))
      .filter(isVisible)
      .filter(el => titleRe.test(String(el.textContent || "")));

    return candidates.find(el => {
      const txt = String(el.textContent || "");
      const dayCount = ["Ma ", "Di ", "Wo ", "Do ", "Vr "].filter(day => txt.includes(day)).length;
      return dayCount >= 4;
    }) || candidates[0] || null;
  }

  async function openWeekModal(weekNumber){
    const trigger = findWeekTrigger(weekNumber);
    if (!trigger) throw new Error(`Week ${weekNumber} is niet zichtbaar in de planning.`);

    trigger.scrollIntoView({ block: "center", inline: "center" });
    trigger.click();

    for (let i = 0; i < 30; i++) {
      await wait(100);
      const modal = findVisibleWeekModal(weekNumber);
      if (modal) return modal;
    }
    throw new Error(`Het overzicht van week ${weekNumber} kon niet worden geopend.`);
  }

  function closeWeekModal(modal){
    const close = Array.from(modal.querySelectorAll("button, [role='button']"))
      .find(btn => /^(x|sluiten|close)$/i.test(String(btn.textContent || "").trim()) || /sluiten|close/i.test(btn.getAttribute("aria-label") || ""));
    if (close) close.click();
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  function prepareClone(modal, pageIndex){
    const clone = modal.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    clone.querySelectorAll("button").forEach(btn => {
      if (/^(x|sluiten|close)$/i.test(String(btn.textContent || "").trim())) btn.remove();
    });

    Object.assign(clone.style, {
      display: "block",
      position: "static",
      inset: "auto",
      transform: "none",
      width: "100%",
      maxWidth: "none",
      height: "auto",
      maxHeight: "none",
      overflow: "visible",
      margin: "0",
      boxShadow: "none",
      background: "white"
    });

    clone.querySelectorAll("*").forEach(el => {
      const style = el.style;
      if (style) {
        if (style.maxHeight) style.maxHeight = "none";
        if (style.overflow === "auto" || style.overflow === "scroll") style.overflow = "visible";
      }
    });

    const page = document.createElement("section");
    page.className = "weekplanning-pdf-page";
    if (pageIndex > 0) page.style.pageBreakBefore = "always";
    page.appendChild(clone);
    return page;
  }

  async function ensureHtml2Pdf(){
    if (window.html2pdf) return;
    throw new Error("De PDF-module is nog niet geladen. Vernieuw de pagina en probeer opnieuw.");
  }

  async function downloadTwoWeeks(){
    const button = document.getElementById("btnDownloadWeekplanning");
    const oldText = button?.textContent || "Download weekplanning";
    if (button) {
      button.disabled = true;
      button.textContent = "PDF maken...";
    }

    const today = new Date();
    const dates = [today, addDays(today, 7)];
    const weeks = dates.map(d => isoWeekNumber(d));
    const filename = `weekplanning-${weekKey(dates[0])}-tm-${weekKey(dates[1])}.pdf`;
    const pdfRoot = document.createElement("div");
    pdfRoot.id = "weekplanningPdfRoot";
    Object.assign(pdfRoot.style, {
      position: "fixed",
      left: "-20000px",
      top: "0",
      width: "1500px",
      background: "white",
      zIndex: "-1"
    });
    document.body.appendChild(pdfRoot);

    try {
      await ensureHtml2Pdf();

      for (let i = 0; i < weeks.length; i++) {
        const modal = await openWeekModal(weeks[i]);
        await wait(350); // uitlijning en inhoud laten afronden
        pdfRoot.appendChild(prepareClone(modal, i));
        closeWeekModal(modal);
        await wait(250);
      }

      await window.html2pdf()
        .set({
          margin: [5, 5, 5, 5],
          filename,
          image: { type: "jpeg", quality: 0.97 },
          html2canvas: { scale: 1.35, useCORS: true, logging: false, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a3", orientation: "landscape" },
          pagebreak: { mode: ["css", "legacy"], before: ".weekplanning-pdf-page + .weekplanning-pdf-page" }
        })
        .from(pdfRoot)
        .save();
    } catch (error) {
      console.error("Weekplanning PDF:", error);
      alert(error?.message || "De PDF kon niet worden gemaakt.");
    } finally {
      pdfRoot.remove();
      if (button) {
        button.disabled = false;
        button.textContent = oldText;
      }
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("btnDownloadWeekplanning");
    if (button) button.addEventListener("click", downloadTwoWeeks);
  });
})();
