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

  function elementMentionsWeek(el, weekNumber){
    const text = `${ownText(el)} ${String(el.textContent || "")}`.replace(/\s+/g, " ").trim();
    const patterns = [
      new RegExp(`\\bWeek\\s*${weekNumber}\\b`, "i"),
      new RegExp(`\\bWk\\.?\\s*${weekNumber}\\b`, "i"),
      new RegExp(`\\bW\\s*${weekNumber}\\b`, "i")
    ];
    if (patterns.some(re => re.test(text))) return true;

    return Object.entries(el.dataset || {}).some(([key, value]) => {
      const k = String(key || "").toLowerCase();
      const v = String(value || "").trim();
      return k.includes("week") && (v === String(weekNumber) || v.endsWith(`-${String(weekNumber).padStart(2, "0")}`));
    });
  }

  function clickableAncestor(el){
    if (!el) return null;
    const direct = el.closest("button, [role='button'], a, [data-week], [data-week-number], .week-header, .week-label, .week-number, th, td");
    if (direct) return direct;

    let cur = el;
    for (let i = 0; i < 5 && cur; i++, cur = cur.parentElement) {
      if (typeof cur.onclick === "function" || getComputedStyle(cur).cursor === "pointer") return cur;
    }
    return el;
  }

  function findWeekTrigger(weekNumber){
    const root = document.getElementById("plannerGrid") || document;
    const all = Array.from(root.querySelectorAll("button, [role='button'], a, th, td, div, span"))
      .filter(isVisible)
      .filter(el => elementMentionsWeek(el, weekNumber));

    const clickables = all
      .map(clickableAncestor)
      .filter(Boolean)
      .filter((el, index, arr) => arr.indexOf(el) === index);

    return clickables.find(el =>
      el.matches("button, [role='button'], a") ||
      typeof el.onclick === "function" ||
      getComputedStyle(el).cursor === "pointer"
    ) || clickables[0] || null;
  }

  function findVisibleWeekModal(weekNumber){
    const titleRe = new RegExp(`\\b(?:Week|Wk\\.?|W)\\s*${weekNumber}\\b`, "i");
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
    const alreadyOpen = findVisibleWeekModal(weekNumber);
    if (alreadyOpen) return alreadyOpen;

    const trigger = findWeekTrigger(weekNumber);
    if (!trigger) throw new Error(`Week ${weekNumber} is niet zichtbaar in de planning.`);

    trigger.scrollIntoView({ block: "center", inline: "center" });
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    for (let i = 0; i < 40; i++) {
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

  function ensurePdfModules(){
    if (typeof window.html2canvas !== "function") {
      throw new Error("De schermafbeeldingsmodule is nog niet geladen. Vernieuw de pagina en probeer opnieuw.");
    }
    if (!window.jspdf?.jsPDF) {
      throw new Error("De PDF-module is nog niet geladen. Vernieuw de pagina en probeer opnieuw.");
    }
  }

  function hideModalControls(modal){
    const changed = [];
    modal.querySelectorAll("button, [role='button']").forEach(el => {
      const text = String(el.textContent || "").trim();
      const aria = el.getAttribute("aria-label") || "";
      if (/^(x|sluiten|close)$/i.test(text) || /sluiten|close/i.test(aria)) {
        changed.push([el, el.style.visibility]);
        el.style.visibility = "hidden";
      }
    });
    return () => changed.forEach(([el, old]) => { el.style.visibility = old; });
  }

  async function captureModal(modal){
    const restoreControls = hideModalControls(modal);
    const previousOverflow = modal.style.overflow;
    const previousMaxHeight = modal.style.maxHeight;
    const previousHeight = modal.style.height;

    modal.style.overflow = "visible";
    modal.style.maxHeight = "none";
    modal.style.height = "auto";

    modal.querySelectorAll(".modal-body, .bd, [style*='overflow']").forEach(el => {
      if (!el.dataset.pdfOldOverflow) el.dataset.pdfOldOverflow = el.style.overflow || "__empty__";
      if (!el.dataset.pdfOldMaxHeight) el.dataset.pdfOldMaxHeight = el.style.maxHeight || "__empty__";
      el.style.overflow = "visible";
      el.style.maxHeight = "none";
    });

    try {
      await wait(250);
      const rect = modal.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10 || !modal.textContent.trim()) {
        throw new Error("Het geopende weekoverzicht bevat geen zichtbare inhoud.");
      }

      return await window.html2canvas(modal, {
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#ffffff",
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(rect.width)),
        windowHeight: Math.max(document.documentElement.clientHeight, Math.ceil(rect.height))
      });
    } finally {
      restoreControls();
      modal.style.overflow = previousOverflow;
      modal.style.maxHeight = previousMaxHeight;
      modal.style.height = previousHeight;
      modal.querySelectorAll("[data-pdf-old-overflow]").forEach(el => {
        el.style.overflow = el.dataset.pdfOldOverflow === "__empty__" ? "" : el.dataset.pdfOldOverflow;
        el.style.maxHeight = el.dataset.pdfOldMaxHeight === "__empty__" ? "" : el.dataset.pdfOldMaxHeight;
        delete el.dataset.pdfOldOverflow;
        delete el.dataset.pdfOldMaxHeight;
      });
    }
  }

  function addCanvasToPdf(pdf, canvas, addPage){
    if (addPage) pdf.addPage("a3", "landscape");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    const x = (pageWidth - width) / 2;
    const y = margin;

    pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", x, y, width, height, undefined, "FAST");
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
    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;

    try {
      ensurePdfModules();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a3", orientation: "landscape", compress: true });

      for (let i = 0; i < weeks.length; i++) {
        const modal = await openWeekModal(weeks[i]);
        await wait(350);
        const canvas = await captureModal(modal);
        addCanvasToPdf(pdf, canvas, i > 0);
        closeWeekModal(modal);
        await wait(250);
      }

      pdf.save(filename);
    } catch (error) {
      console.error("Weekplanning PDF:", error);
      alert(error?.message || "De PDF kon niet worden gemaakt.");
    } finally {
      window.scrollTo(previousScrollX, previousScrollY);
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