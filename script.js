const DATA_URL = "questions_cleaned_normal.txt";
const STORAGE_KEYS = {
  saved: "questions.saved.v1",
  theme: "questions.theme.v1",
  scale: "questions.scale.v1",
};

const state = {
  items: [],
  visible: [],
  saved: new Set(),
  filter: "all",
  scale: 1,
  toolsOpen: false,
  toastTimer: null,
};

const persianNumber = new Intl.NumberFormat("fa-IR");
const els = {
  root: document.documentElement,
  list: document.querySelector("#questionList"),
  template: document.querySelector("#questionTemplate"),
  search: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  readerTools: document.querySelector(".reader-tools"),
  toolsToggle: document.querySelector("#toolsToggle"),
  resultCount: document.querySelector("#resultCount"),
  savedCount: document.querySelector("#savedCount"),
  empty: document.querySelector("#emptyState"),
  jumpInput: document.querySelector("#jumpInput"),
  jumpButton: document.querySelector("#jumpButton"),
  segmented: document.querySelector(".segmented"),
  smallerText: document.querySelector("#smallerText"),
  largerText: document.querySelector("#largerText"),
  themeToggle: document.querySelector("#themeToggle"),
  progress: document.querySelector("#readingProgress"),
  toTop: document.querySelector("#toTop"),
  toast: document.querySelector("#toast"),
};

init();

async function init() {
  loadPreferences();
  bindEvents();

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Data file could not be loaded.");
    const text = await response.text();
    state.items = parseQuestions(text);
    state.visible = state.items;
    els.jumpInput.max = String(state.items.length);
    render();
    scrollToHash();
  } catch (error) {
    els.resultCount.textContent = "فایل پرسش‌ها بارگذاری نشد.";
    showToast("بارگذاری فایل پرسش‌ها ناموفق بود.");
    console.error(error);
  }
}

function bindEvents() {
  els.search.addEventListener("input", () => {
    els.clearSearch.hidden = els.search.value.length === 0;
    applyFilters();
  });

  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    els.clearSearch.hidden = true;
    applyFilters();
    els.search.focus();
  });

  els.segmented.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    document
      .querySelectorAll(".segmented button")
      .forEach((item) => item.classList.toggle("active", item === button));
    applyFilters();
  });

  els.jumpButton.addEventListener("click", jumpToNumber);
  els.jumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") jumpToNumber();
  });

  els.smallerText.addEventListener("click", () => updateScale(-0.06));
  els.largerText.addEventListener("click", () => updateScale(0.06));
  els.toolsToggle.addEventListener("click", () => setToolsOpen(!state.toolsOpen));
  els.themeToggle.addEventListener("click", toggleTheme);

  els.list.addEventListener("click", (event) => {
    const saveButton = event.target.closest(".save-button");
    const linkButton = event.target.closest(".link-button");
    if (saveButton) toggleSaved(Number(saveButton.dataset.number));
    if (linkButton) copyQuestionLink(Number(linkButton.dataset.number));
  });

  els.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.addEventListener("click", closeToolsFromOutside);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setToolsOpen(false);
  });
  window.addEventListener("scroll", updateScrollUi, { passive: true });
  window.addEventListener("hashchange", scrollToHash);
}

function parseQuestions(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  let current = null;

  for (const line of lines) {
    const questionMatch = line.match(/^([۰-۹0-9]+)[.)]\s*(.+)$/u);
    if (questionMatch) {
      if (current) items.push(current);
      current = {
        number: Number(toLatinDigits(questionMatch[1])),
        question: questionMatch[2].trim(),
        guide: "",
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("راهنما:")) {
      current.guide = appendText(current.guide, line.replace(/^راهنما:\s*/u, ""));
    } else if (current.guide) {
      current.guide = appendText(current.guide, line);
    } else {
      current.question = appendText(current.question, line);
    }
  }

  if (current) items.push(current);
  return items;
}

function appendText(base, next) {
  return [base, next.trim()].filter(Boolean).join(" ");
}

function applyFilters() {
  const query = normalizeText(els.search.value);
  const terms = query.split(/\s+/).filter(Boolean);

  state.visible = state.items.filter((item) => {
    const isSaved = state.saved.has(item.number);
    if (state.filter === "saved" && !isSaved) return false;
    if (!terms.length) return true;

    const haystack = normalizeText(`${item.number} ${item.question} ${item.guide}`);
    return terms.every((term) => haystack.includes(term));
  });

  render();
}

function render() {
  const fragment = document.createDocumentFragment();

  for (const item of state.visible) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const isSaved = state.saved.has(item.number);
    const numberText = persianNumber.format(item.number);

    node.id = `q-${item.number}`;
    node.dataset.number = String(item.number);
    node.querySelector(".number-badge").href = `#q-${item.number}`;
    node.querySelector(".number-badge").textContent = `پرسش ${numberText}`;
    node.querySelector(".question-text").textContent = item.question;
    node.querySelector(".guide-text b").textContent = item.guide || "راهنمایی برای این پرسش ثبت نشده است.";

    const saveButton = node.querySelector(".save-button");
    saveButton.dataset.number = String(item.number);
    saveButton.classList.toggle("is-saved", isSaved);
    saveButton.querySelector("span").textContent = isSaved ? "★" : "☆";
    saveButton.setAttribute(
      "aria-label",
      isSaved ? `حذف پرسش ${numberText} از نشانه‌دارها` : `نشانه‌گذاری پرسش ${numberText}`,
    );

    const linkButton = node.querySelector(".link-button");
    linkButton.dataset.number = String(item.number);
    linkButton.setAttribute("aria-label", `کپی لینک پرسش ${numberText}`);

    fragment.appendChild(node);
  }

  els.list.replaceChildren(fragment);
  els.empty.hidden = state.visible.length > 0;
  updateCounts();
  updateScrollUi();
}

function updateCounts() {
  const shown = persianNumber.format(state.visible.length);
  const total = persianNumber.format(state.items.length);
  const saved = persianNumber.format(state.saved.size);

  els.resultCount.textContent = state.visible.length === state.items.length ? `${total} پرسش` : `${shown} پرسش از ${total}`;
  els.savedCount.textContent = state.saved.size ? `${saved} نشانه‌دار` : "بدون نشانه‌دار";
}

function jumpToNumber() {
  const number = Number(toLatinDigits(els.jumpInput.value));
  if (!number || number < 1 || number > state.items.length) {
    showToast("شماره پرسش معتبر نیست.");
    return;
  }

  if (els.search.value || state.filter !== "all") {
    els.search.value = "";
    els.clearSearch.hidden = true;
    state.filter = "all";
    document
      .querySelectorAll(".segmented button")
      .forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
    applyFilters();
  }

  requestAnimationFrame(() => {
    const target = document.querySelector(`#q-${number}`);
    if (!target) return;
    history.replaceState(null, "", `#q-${number}`);
    setToolsOpen(false);
    focusCard(target);
  });
}

function scrollToHash() {
  const id = window.location.hash.replace("#", "");
  if (!id) return;
  const target = document.getElementById(id);
  if (target) focusCard(target);
}

function focusCard(target) {
  document.querySelectorAll(".question-card.is-focused").forEach((card) => card.classList.remove("is-focused"));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("is-focused");
  setTimeout(() => target.classList.remove("is-focused"), 1800);
}

function toggleSaved(number) {
  if (state.saved.has(number)) {
    state.saved.delete(number);
    showToast("از نشانه‌دارها حذف شد.");
  } else {
    state.saved.add(number);
    showToast("پرسش نشانه‌گذاری شد.");
  }

  localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify([...state.saved]));
  applyFilters();
}

async function copyQuestionLink(number) {
  const url = new URL(window.location.href);
  url.hash = `q-${number}`;
  url.search = "";

  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("لینک پرسش کپی شد.");
  } catch {
    window.location.hash = `q-${number}`;
    showToast("لینک در نوار آدرس آماده است.");
  }
}

function loadPreferences() {
  const savedItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.saved) || "[]");
  state.saved = new Set(savedItems.map(Number).filter(Boolean));

  const theme = localStorage.getItem(STORAGE_KEYS.theme) || getPreferredTheme();
  els.root.dataset.theme = theme;

  state.scale = Number(localStorage.getItem(STORAGE_KEYS.scale) || "1");
  state.scale = clamp(state.scale, 0.88, 1.24);
  els.root.style.setProperty("--reader-scale", String(state.scale));
}

function getPreferredTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const next = els.root.dataset.theme === "dark" ? "light" : "dark";
  els.root.dataset.theme = next;
  localStorage.setItem(STORAGE_KEYS.theme, next);
}

function updateScale(delta) {
  state.scale = clamp(Number((state.scale + delta).toFixed(2)), 0.88, 1.24);
  els.root.style.setProperty("--reader-scale", String(state.scale));
  localStorage.setItem(STORAGE_KEYS.scale, String(state.scale));
}

function updateScrollUi() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const percent = max > 0 ? (window.scrollY / max) * 100 : 0;
  els.progress.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  els.toTop.classList.toggle("is-visible", window.scrollY > 520);

  const shouldCompact = window.scrollY > 180;
  els.readerTools.classList.toggle("is-compact", shouldCompact);
  if (!shouldCompact) setToolsOpen(false);
}

function setToolsOpen(open) {
  state.toolsOpen = open;
  els.readerTools.classList.toggle("is-open", open);
  els.toolsToggle.setAttribute("aria-expanded", String(open));
  els.toolsToggle.setAttribute("aria-label", open ? "بستن ابزارهای بیشتر" : "نمایش ابزارهای بیشتر");
  els.toolsToggle.title = open ? "بستن ابزارها" : "ابزارهای بیشتر";
  els.toolsToggle.querySelector("span").textContent = open ? "×" : "⋯";
}

function closeToolsFromOutside(event) {
  if (!state.toolsOpen || !els.readerTools.classList.contains("is-compact")) return;
  if (!els.readerTools.contains(event.target)) setToolsOpen(false);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function normalizeText(value) {
  return toLatinDigits(String(value))
    .replace(/[ك]/g, "ک")
    .replace(/[يى]/g, "ی")
    .replace(/[‌\u200c]/g, " ")
    .replace(/[\u064b-\u065f]/g, "")
    .toLowerCase()
    .trim();
}

function toLatinDigits(value) {
  const map = {
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };

  return String(value).replace(/[۰-۹٠-٩]/g, (digit) => map[digit] || digit);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
