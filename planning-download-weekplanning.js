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

  function prepareClone(modal, pageIndex){
    const clone = modal.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("hidden");
    clone.setAttribute("aria-hidden", "false");

    clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    clone.querySelectorAll("[hidden]").forEach(el => el.removeAttribute("hidden"));
    clone.querySelectorAll("button").forEach(btn => {
      if (/^(x|sluiten|close)$/i.test(String(btn.textContent || "").trim())) btn.remove();
    });

    Object.assign(clone.style, {
      display: "block",
      visibility: "visible",
      position: "relative",
      left: "auto",
      right: "auto",
      top: "auto",
      bottom: "auto",
      inset: "auto",
      transform: "none",
      width: "100%",
      maxWidth: "none",
      minHeight: "1px",
      height: "auto",
      maxHeight: "none",
      overflow: "visible",
      margin: "0",
      opacity: "1",
      boxShadow: "none",
      background: "#ffffff"
    });

    clone.querySelectorAll("*").forEach(el => {
      el.removeAttribute("hidden");
      const style = el.style;
      if (!style) return;
      if (style.display === "none") style.display = "block";
      if (style.visibility === "hidden") style.visibility = "visible";
      if (style.maxHeight) style.maxHeight = "none";
      if (style.overflow === "auto" || style.overflow === "scroll" || style.overflow === "hidden") {
        style.overflow = "visible";
      }
    });

    const page = document.createElement("section");
    page.className = "weekplanning-pdf-page";
    Object.assign(page.style, {
      display: "block",
      width: "1470px",
      minHeight: "1px",
      padding: "12px",
      boxSizing: "border-box",
      background: "#ffffff",
      color: "#111827"
    });
    if (pageIndex > 0) page.style.pageBreakBefore = "always";
    page.appendChild(clone);
    return page;
  }

  function ensureHtml2Pdf(){
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
    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;

    const pdfRoot = document.createElement("div");
    pdfRoot.id = "weekplanningPdfRoot";
    Object.assign(pdfRoot.style, {
      position: "absolute",
      left: "0",
      top: `${previousScrollY}px`,
      width: "1500px",
      minHeight: "1px",
      display: "block",
      visibility: "visible",
      opacity: "1",
      overflow: "visible",
      pointerEvents: "none",
      background: "#ffffff",
      zIndex: "2147483647"
    });
    document.body.appendChild(pdfRoot);

    try {
      ensureHtml2Pdf();

      for (let i = 0; i < weeks.length; i++) {
        const modal = await openWeekModal(weeks[i]);
        await wait(350);
        pdfRoot.appendChild(prepareClone(modal, i));
        closeWeekModal(modal);
        await wait(250);
      }

      // Geef de browser tijd om alle gekloonde tabellen en lettertypes te tekenen.
      await wait(500);

      if (pdfRoot.scrollWidth < 10 || pdfRoot.scrollHeight < 10 || !pdfRoot.textContent.trim()) {
        throw new Error("Het weekoverzicht bevat geen renderbare inhoud.");
      }

      await window.html2pdf()
        .set({
          margin: [5, 5, 5, 5],
          filename,
          image: { type: "jpeg", quality: 0.97 },
          html2canvas: {
            scale: 1.2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            backgroundColor: "#ffffff",
            width: 1500,
            windowWidth: 1500,
            scrollX: 0,
            scrollY: -previousScrollY
          },
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