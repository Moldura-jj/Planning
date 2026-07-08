// planning-week-overview-align.js
// Lijnt alleen het echte weekoverzicht-modal uit: 7 dagkolommen naast elkaar.
// Belangrijk: beschikbaarheidsmodal bevat ook "Week xx", maar heeft dagen onder elkaar en wordt genegeerd.

let weekAlignPending = false;

function isVisible(el){
  if (!el || !(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
}

function textOf(el){
  return String(el?.textContent || "").replace(/\s+/g, " ").trim();
}

function hasWeekTitle(el){
  return /\bWeek\s+\d+\b/i.test(textOf(el));
}

function isDayHeaderText(txt){
  return /^(Ma|Di|Wo|Do|Vr|Za|Zo)\s+\d{1,2}\s*-\s*\d{1,2}\b/i.test(String(txt || "").trim());
}

function clearOldAlignment(root = document){
  root.querySelectorAll(".week-align-day-col, .week-align-row-block").forEach(el => {
    el.classList.remove("week-align-day-col", "week-align-row-block");
    el.style.minHeight = "";
  });
}

function findWeekModalCandidates(){
  return Array.from(document.querySelectorAll(".modal, [role='dialog'], .modal-card, .week-overview-modal, .week-modal"))
    .filter(isVisible)
    .filter(hasWeekTitle);
}

function directDayColumns(modal){
  const selectors = [
    ".week-day-col",
    ".week-overview-day",
    ".week-day-card",
    ".week-day",
    ".week-col",
    "[data-week-day]"
  ];

  for (const sel of selectors) {
    const cols = Array.from(modal.querySelectorAll(sel)).filter(isVisible);
    if (cols.length >= 5) return cols.slice(0, 7);
  }

  return [];
}

function findDayColumnsByHeaders(modal){
  const all = Array.from(modal.querySelectorAll("*"));
  const headerEls = all.filter(el => {
    const own = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent)
      .join(" ");
    return isDayHeaderText(own || textOf(el));
  });

  const cols = [];
  for (const h of headerEls) {
    let cur = h;
    let best = null;
    for (let i = 0; i < 5 && cur && cur !== modal; i++, cur = cur.parentElement) {
      const r = cur.getBoundingClientRect();
      if (r.width >= 120 && r.width <= 360 && r.height >= 250) best = cur;
    }
    if (best && !cols.includes(best)) cols.push(best);
  }

  return cols.slice(0, 7);
}

function getDayColumns(modal){
  let cols = directDayColumns(modal);
  if (cols.length >= 5) return cols;

  cols = findDayColumnsByHeaders(modal);
  if (cols.length >= 5) return cols;

  const containers = Array.from(modal.querySelectorAll("div, section"))
    .filter(isVisible)
    .sort((a,b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);

  for (const c of containers) {
    const children = Array.from(c.children).filter(isVisible);
    const dayLike = children.filter(ch => Array.from(ch.querySelectorAll("*"))
      .some(x => isDayHeaderText(textOf(x))));
    if (dayLike.length >= 5) return dayLike.slice(0, 7);
  }

  return [];
}

function areHorizontalDayColumns(cols){
  if (!cols || cols.length < 5) return false;

  const rects = cols.map(c => c.getBoundingClientRect());
  const validWidths = rects.every(r => r.width >= 110 && r.width <= 420 && r.height >= 250);
  if (!validWidths) return false;

  // Echte weekoverzicht-kolommen staan naast elkaar: top-positie vrijwel gelijk.
  const tops = rects.map(r => Math.round(r.top));
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  if ((maxTop - minTop) > 45) return false;

  // En x-posities lopen duidelijk op. Bij beschikbaarheid staan ze onder elkaar en is dit niet zo.
  const lefts = rects.map(r => Math.round(r.left));
  let increasing = 0;
  for (let i = 1; i < lefts.length; i++) {
    if (lefts[i] > lefts[i - 1] + 40) increasing++;
  }
  return increasing >= Math.min(4, lefts.length - 1);
}

function findWeekModal(){
  const candidates = findWeekModalCandidates();

  for (const modal of candidates) {
    const cols = getDayColumns(modal);
    if (areHorizontalDayColumns(cols)) return modal;
  }

  return null;
}

function looksLikeDayHeaderBlock(el){
  const txt = textOf(el);
  return isDayHeaderText(txt) || /^\d{4}-\d{2}-\d{2}$/.test(txt) || txt.includes("Week ");
}

function preferredBlocks(col){
  const selectors = [
    ".week-employee-block",
    ".week-employee-row",
    ".week-person-block",
    ".week-person-row",
    ".week-concepts",
    ".week-concept-block"
  ];

  for (const sel of selectors) {
    const blocks = Array.from(col.querySelectorAll(sel)).filter(isVisible);
    if (blocks.length >= 4) return blocks;
  }

  return [];
}

function directBlocks(col){
  const children = Array.from(col.children).filter(isVisible);
  if (!children.length) return [];

  const blocks = children.filter(ch => !looksLikeDayHeaderBlock(ch));
  if (blocks.length >= 4) return blocks;

  for (const ch of children) {
    const nested = Array.from(ch.children).filter(isVisible).filter(x => !looksLikeDayHeaderBlock(x));
    if (nested.length >= 4) return nested;
  }

  return blocks;
}

function getBlocksForColumn(col){
  const preferred = preferredBlocks(col);
  return preferred.length ? preferred : directBlocks(col);
}

function resetAlignment(cols){
  cols.forEach(col => {
    col.classList.add("week-align-day-col");
    getBlocksForColumn(col).forEach(block => {
      block.classList.add("week-align-row-block");
      block.style.minHeight = "";
    });
  });
}

function alignWeekOverview(){
  clearOldAlignment();

  const modal = findWeekModal();
  if (!modal) return;

  const cols = getDayColumns(modal);
  if (!areHorizontalDayColumns(cols)) return;

  resetAlignment(cols);

  const blocksByCol = cols.map(getBlocksForColumn);
  const maxRows = Math.max(...blocksByCol.map(b => b.length));
  if (!Number.isFinite(maxRows) || maxRows < 4) return;

  for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
    let maxH = 0;
    for (const blocks of blocksByCol) {
      const block = blocks[rowIdx];
      if (!block) continue;
      block.style.minHeight = "";
      maxH = Math.max(maxH, Math.ceil(block.getBoundingClientRect().height));
    }

    if (maxH <= 0) continue;
    for (const blocks of blocksByCol) {
      const block = blocks[rowIdx];
      if (!block) continue;
      block.style.minHeight = `${maxH}px`;
    }
  }
}

function ensureWeekAlignStyle(){
  if (document.getElementById("weekOverviewAlignStyle")) return;
  const style = document.createElement("style");
  style.id = "weekOverviewAlignStyle";
  style.textContent = `
    .week-align-day-col{
      display:flex !important;
      flex-direction:column !important;
    }
    .week-align-row-block{
      box-sizing:border-box !important;
      flex:0 0 auto !important;
    }
  `;
  document.head.appendChild(style);
}

function scheduleWeekOverviewAlign(delay = 80){
  if (weekAlignPending) return;
  weekAlignPending = true;
  window.setTimeout(() => {
    weekAlignPending = false;
    ensureWeekAlignStyle();
    alignWeekOverview();
  }, delay);
}

window.addEventListener("resize", () => scheduleWeekOverviewAlign(150));
window.addEventListener("DOMContentLoaded", () => scheduleWeekOverviewAlign(500));
window.addEventListener("load", () => scheduleWeekOverviewAlign(500));

document.addEventListener("click", () => {
  scheduleWeekOverviewAlign(250);
  scheduleWeekOverviewAlign(900);
}, true);

const weekAlignObserver = new MutationObserver(() => scheduleWeekOverviewAlign(200));
weekAlignObserver.observe(document.body, { childList:true, subtree:true });
