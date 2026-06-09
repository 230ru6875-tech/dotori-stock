const state = { data: null, activeSection: "watchlist", userStocks: [], selectedMovingSymbol: "", scannerMarketFirst: "domestic", quotes: {} };
const USER_STOCKS_KEY = "dotori.userStocks.v1";
const USER_KEY = "dotori.userKey.v1";
const USER_KEEP_ASKED_KEY = "dotori.keepAsked.v1";
const REPORT_STORE_KEY = "dotori.stockReports.v1";
const SIGNAL_FEED_HISTORY_KEY = "dotori.signalFeedHistory.v1";
const USER_STOCKS_MIGRATION_KEY = "dotori.userStocks.migration.v4";
const INITIAL_SERVER_SYMBOLS = new Set(["011070", "MU"]);
let symbolDirectory = {};
const DATA_REFRESH_MS = 5000;
const MARKET_CLOSE_GRACE_MINUTES = 5;
const DOMESTIC_MARKET_START_KST_MINUTES = 8 * 60 + 30;
const DOMESTIC_MARKET_END_KST_MINUTES = 18 * 60;
const DOMESTIC_PREOPEN_START_KST_MINUTES = 8 * 60 + 20;
const US_MARKET_START_ET_MINUTES = 4 * 60;
const US_MARKET_END_ET_MINUTES = 20 * 60;
const US_PREOPEN_START_ET_MINUTES = 3 * 60 + 50;
const T = {
  connected: "",
  loadFail: "\ub370\uc774\ud130\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
  enterSymbol: "\uc885\ubaa9\ucf54\ub4dc \ub610\ub294 \ud68c\uc0ac\uba85\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.",
  added: "\uc885\ubaa9\uc744 \uad00\uc2ec\uc885\ubaa9\uc5d0 \ucd94\uac00\ud588\uc2b5\ub2c8\ub2e4.",
  removed: "\uc885\ubaa9\uc744 \uad00\uc2ec\uc885\ubaa9\uc5d0\uc11c \uc0ad\uc81c\ud588\uc2b5\ub2c8\ub2e4.",
  domestic: "\uad6d\ub0b4",
  us: "\ud574\uc678",
  basis: "\uae30\uc900",
  waiting: "\ub370\uc774\ud130 \ub300\uae30",
  noPurchasePrice: "\uad6c\uc785\uac00 \ubbf8\uc785\ub825",
  mockReview: "\uac80\ud1a0",
  dataNeeded: "\ubbf8\ub9ac\ubcf4\uae30",
  preview: "\ubbf8\ub9ac\ubcf4\uae30",
  userMemo: "\uc0ac\uc6a9\uc790\uac00 \ucd94\uac00\ud55c \uc885\ubaa9\uc785\ub2c8\ub2e4. \uc2e4\uc81c \uc6b4\uc601\uc5d0\uc11c\ub294 \ud604\uc7ac\uac00, \ub274\uc2a4, \uc774\ud3c9\uc120, \ubaa8\uc758\ud22c\uc790 \uacb0\uacfc\ub97c \uc774 \uc885\ubaa9 \uae30\uc900\uc73c\ub85c \ubd88\ub7ec\uc635\ub2c8\ub2e4.",
  risk: "\ub9ac\uc2a4\ud06c",
  learning: "\uac80\ud1a0",
  report: "\ub9ac\ud3ec\ud2b8",
  remove: "\uc0ad\uc81c",
  ma20: "20\uc77c\uc120",
  ma60: "60\uc77c\uc120",
  priceHistory: "\uac00\uaca9 \uc774\ub825 \ub300\uae30",
  analysisPreview: "\ubd84\uc11d",
  domesticTop: "\uad6d\ub0b4 \uc0c1\uc704 \uc885\ubaa9",
  usTop: "\ud574\uc678 \uc0c1\uc704 \uc885\ubaa9",
  predictionRange: "\uc608\uce21 \ubc94\uc704",
  source: "\ucd9c\ucc98",
  chartTitle: "\ucc28\ud2b8",
  currentPrice: "\ud604\uc7ac\uac00",
  predictedLow: "\uc608\uc0c1 \uc800\uac00",
  predictedHigh: "\uc608\uc0c1 \uace0\uac00",
  defaultFormNote: "\uc785\ub825\ud55c \uc885\ubaa9\uc740 \uc774 \ube0c\ub77c\uc6b0\uc800\uc5d0 \uc800\uc7a5\ub418\uba70 \uad00\ub828 \uce74\ub4dc\uc5d0 \ubc18\uc601\ub429\ub2c8\ub2e4.",
  codeCandidates: "\uc885\ubaa9\ucf54\ub4dc",
  returnRate: "\uc218\uc775\ub960"
};

const fmtDate = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul"
  }).format(date);
};
const fmtDateTimeSeconds = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Asia/Seoul"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}. ${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute}:${parts.second}`;
};
const el = (selector) => document.querySelector(selector);
function setStatus(message) {
  const status = el("#statusText");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}
function renderCards(items, mapper) { return items.map(mapper).join(""); }
function browserUserKey() {
  try {
    let value = localStorage.getItem(USER_KEY);
    if (!value) {
      value = crypto?.randomUUID ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(USER_KEY, value);
    }
    return value;
  } catch {
    return "web-anonymous";
  }
}
function signalClass(value) {
  if (/\ub9e4\uc218|\uc0c1\uc2b9|\ud68c\ubcf5|\ubcf4\uc720|\uac80\ud1a0/i.test(value)) return "up";
  if (/\ub9e4\ub3c4|\uc704\ud5d8|\uc774\ud0c8|\ubcf4\ub958/i.test(value)) return "down";
  return "neutral";
}
function normalizeSymbol(symbol) { return String(symbol || "").trim().toUpperCase().replace(/[^A-Z0-9.]/g, ""); }
function stripSymbolFromName(name, symbol) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const escaped = String(symbol || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`\\s*\\(?${escaped}\\)?\\s*$`, "i"), "").trim();
}
function staticSymbolNames() {
  return new Map([
    ["MRVL", "Marvell Technology"],
    ["AVGO", "Broadcom"],
    ["MU", "\ub9c8\uc774\ud06c\ub860 \ud14c\ud06c\ub180\ub85c\uc9c0"],
    ["JPM", "JPMorgan Chase"],
    ["SNDK", "SanDisk"],
    ["ETN", "Eaton"],
    ["GE", "GE Aerospace"],
    ["AMT", "American Tower"]
  ]);
}
function nameLookup() {
  const data = state.data || {};
  const sources = [
    ...(data.scanner || []),
    ...(data.watchlist || []),
    ...(data.movingAverages || []),
    ...(data.morningNote || []),
    ...(data.sectorOverview || []),
    ...(data.deepAnalysis || []),
    ...(data.newsList || [])
  ];
  const map = staticSymbolNames();
  Object.values(symbolDirectory || {}).forEach((item) => {
    if (!item || !item.symbol) return;
    const symbol = normalizeSymbol(item.symbol);
    const name = stripSymbolFromName(item.name || "", symbol);
    if (symbol && name && name !== symbol) map.set(symbol, name);
  });
  sources.forEach((item) => {
    if (!item || !item.symbol) return;
    const symbol = normalizeSymbol(item.symbol);
    const name = stripSymbolFromName(item.name || item.display_name || item.title || "", symbol);
    if (symbol && name && name !== symbol) map.set(symbol, name);
  });
  return map;
}
function symbolLookupByName(name) {
  const query = String(name || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!query) return "";
  const aliases = new Map([
    ["\uc0bc\uc131\uc804\uc790", "005930"],
    ["samsung", "005930"],
    ["samsungelectronics", "005930"],
    ["\uc2a4\ud06c\ud558\uc774\ub2c9\uc2a4", "000660"],
    ["sk\ud558\uc774\ub2c9\uc2a4", "000660"],
    ["skhynix", "000660"],
    ["\ub124\uc774\ubc84", "035420"],
    ["naver", "035420"],
    ["\uce74\uce74\uc624", "035720"],
    ["kakao", "035720"],
    ["\uc5d8\uc9c0\uc804\uc790", "066570"],
    ["lg\uc804\uc790", "066570"],
    ["lgelectronics", "066570"],
    ["\uc5d8\uc9c0\uc774\ub178\ud14d", "011070"],
    ["lg\uc774\ub178\ud14d", "011070"],
    ["lginnotek", "011070"],
    ["\uc5d8\uc9c0\uc5d0\ub108\uc9c0\uc194\ub8e8\uc158", "373220"],
    ["lg\uc5d0\ub108\uc9c0\uc194\ub8e8\uc158", "373220"],
    ["\ud604\ub300\ucc28", "005380"],
    ["hyundai", "005380"],
    ["\uae30\uc544", "000270"],
    ["kia", "000270"],
    ["\ub9c8\ubca8", "MRVL"],
    ["\ub9c8\ubca8\ud14c\ud06c\ub180\ub85c\uc9c0", "MRVL"],
    ["marvell", "MRVL"],
    ["marvelltechnology", "MRVL"],
  ]);
  if (aliases.has(query)) return aliases.get(query);
  const candidates = [];
  Object.values(symbolDirectory || {}).forEach((item) => {
    if (!item || !item.symbol) return;
    const symbol = normalizeSymbol(item.symbol);
    const displayName = stripSymbolFromName(item.name || "", symbol);
    if (symbol && displayName) candidates.push({ symbol, name: displayName });
  });
  nameLookup().forEach((displayName, symbol) => candidates.push({ symbol, name: displayName }));
  const seen = new Set();
  const unique = candidates.filter((item) => {
    const key = `${item.symbol}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const exact = unique.find((item) => item.name.toLowerCase().replace(/\s+/g, "") === query);
  if (exact) return exact.symbol;
  const partial = unique.find((item) => item.name.toLowerCase().replace(/\s+/g, "").includes(query));
  return partial ? partial.symbol : "";
}
function symbolMatchesByName(name) {
  const query = String(name || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!query) return [];
  const candidates = [];
  const aliases = [
    { name: "\uc0bc\uc131\uc804\uc790", symbol: "005930" },
    { name: "Samsung", symbol: "005930" },
    { name: "Samsung Electronics", symbol: "005930" },
    { name: "SK\ud558\uc774\ub2c9\uc2a4", symbol: "000660" },
    { name: "SK hynix", symbol: "000660" },
    { name: "\ub124\uc774\ubc84", symbol: "035420" },
    { name: "NAVER", symbol: "035420" },
    { name: "\uce74\uce74\uc624", symbol: "035720" },
    { name: "\uc5d8\uc9c0\uc804\uc790", symbol: "066570" },
    { name: "LG\uc804\uc790", symbol: "066570" },
    { name: "\uc5d8\uc9c0\uc774\ub178\ud14d", symbol: "011070" },
    { name: "LG\uc774\ub178\ud14d", symbol: "011070" },
    { name: "\uc5d8\uc9c0\uc5d0\ub108\uc9c0\uc194\ub8e8\uc158", symbol: "373220" },
    { name: "LG\uc5d0\ub108\uc9c0\uc194\ub8e8\uc158", symbol: "373220" },
    { name: "\ud604\ub300\ucc28", symbol: "005380" },
    { name: "\uae30\uc544", symbol: "000270" },
    { name: "\ub9c8\ubca8", symbol: "MRVL" },
    { name: "\ub9c8\ubca8 \ud14c\ud06c\ub180\ub85c\uc9c0", symbol: "MRVL" },
    { name: "Marvell Technology", symbol: "MRVL" },
    { name: "Marvell Technology, Inc.", symbol: "MRVL" },
  ];
  aliases.forEach((item) => candidates.push(item));
  Object.values(symbolDirectory || {}).forEach((item) => {
    if (!item || !item.symbol) return;
    candidates.push({ symbol: normalizeSymbol(item.symbol), name: stripSymbolFromName(item.name || "", item.symbol) });
  });
  nameLookup().forEach((displayName, symbol) => candidates.push({ symbol, name: displayName }));
  const seen = new Set();
  return candidates
    .filter((item) => item.symbol && item.name)
    .filter((item) => item.name.toLowerCase().replace(/\s+/g, "").includes(query))
    .filter((item) => {
      const key = normalizeSymbol(item.symbol);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}
function currentPriceForSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  const quote = state.quotes[normalized];
  if (quote?.currentPrice) return { text: quote.currentPrice, value: parseNumber(quote.currentPrice) };
  const report = loadReportFromBrowser(normalized) || directoryReport(normalized);
  const value = report?.watchlist?.currentPrice || report?.currentPrice || "";
  const parsed = parseNumber(value);
  if (parsed > 0) return { text: value, value: parsed };
  const rows = [
    ...(state.data?.scanner || []),
    ...(state.data?.watchlist || []),
    ...(state.data?.movingAverages || []),
    ...(state.data?.spikes || []),
  ];
  const item = rows.find((row) => normalizeSymbol(row.symbol) === normalized);
  const rowValue = item?.currentPrice || "";
  const rowParsed = parseNumber(rowValue);
  return { text: rowValue, value: rowParsed };
}
function applyLiveQuote(item) {
  if (!item || !item.symbol) return item;
  const symbol = normalizeSymbol(item.symbol);
  const quote = state.quotes[symbol];
  if (!quote) return item;
  return {
    ...item,
    name: stripSymbolFromName(quote.name, symbol) || item.name,
    market: quote.market || item.market,
    currentPrice: quote.currentPrice || item.currentPrice,
    crashRisk: quote.crashRisk || item.crashRisk,
    quotedAt: quote.quotedAt || item.quotedAt
  };
}
function uniqueSymbols(items) {
  const seen = new Set();
  const symbols = [];
  (items || []).forEach((item) => {
    const symbol = normalizeSymbol(item?.symbol);
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    symbols.push(symbol);
  });
  return symbols;
}
function updateSymbolHint() {
  const hint = el("#symbolHint");
  const symbolInput = el("#symbolInput");
  const nameInput = el("#nameInput");
  const priceInput = el("#priceInput");
  if (!hint || !symbolInput || !nameInput) return;
  const symbol = normalizeSymbol(symbolInput.value);
  const name = String(nameInput.value || "").trim();
  const purchasePrice = Number(priceInput?.value || 0);
  const matches = symbol ? [{ symbol, name: nameLookup().get(symbol) || name || symbol }] : symbolMatchesByName(name);
  if (!matches.length) {
    hint.textContent = T.defaultFormNote;
    return;
  }
  const parts = matches.map((item) => {
    const price = currentPriceForSymbol(item.symbol);
    let returnText = "";
    if (purchasePrice > 0 && price.value > 0) {
      const pct = ((price.value - purchasePrice) / purchasePrice) * 100;
      returnText = ` / ${T.returnRate} ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    }
    return `<button class="symbol-candidate" data-candidate-symbol="${escapeHtml(item.symbol)}" data-candidate-name="${escapeHtml(item.name || item.symbol)}" type="button">${escapeHtml(item.name || item.symbol)}(${escapeHtml(item.symbol)})${escapeHtml(returnText)}</button>`;
  });
  hint.innerHTML = `<span>${T.codeCandidates}:</span> ${parts.join(" ")}`;
}
async function lookupNameFromWeb(symbol) {
  try {
    const response = await fetch(`/api/symbol?symbol=${encodeURIComponent(symbol)}`, { cache: "force-cache" });
    if (!response.ok) return "";
    if (!String(response.headers.get("content-type") || "").includes("application/json")) return "";
    const payload = await response.json();
    return payload && payload.ok ? stripSymbolFromName(payload.name, symbol) : "";
  } catch {
    return "";
  }
}
async function lookupStockReport(symbol, purchasePrice, options = {}) {
  try {
    const params = new URLSearchParams({ symbol, localOnly: "1" });
    if (purchasePrice > 0) params.set("purchasePrice", String(purchasePrice));
    if (options.refresh) params.set("refresh", "1");
    const response = await fetch(`/api/stock-report?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return loadReportFromBrowser(symbol);
    if (!String(response.headers.get("content-type") || "").includes("application/json")) return loadReportFromBrowser(symbol);
    const payload = await response.json();
    if (payload && payload.ok) {
      saveReportToBrowser(payload);
      return payload;
    }
    return loadReportFromBrowser(symbol);
  } catch {
    return loadReportFromBrowser(symbol);
  }
}
async function lookupQuote(symbol) {
  try {
    const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
    if (!response.ok) return null;
    if (!String(response.headers.get("content-type") || "").includes("application/json")) return null;
    const payload = await response.json();
    return payload && payload.ok ? payload : null;
  } catch {
    return null;
  }
}
async function saveWebWatchlistInterest(item, action = "add") {
  return Promise.resolve({ ok: true, localOnly: true, symbol: item?.symbol || "", action });
}
async function refreshUserStockReports() {
  if (!state.userStocks.length) return;
  const refreshed = await Promise.all(state.userStocks.map(async (item) => {
    const quote = await lookupQuote(item.symbol);
    if (!quote) return item;
    const report = item.report || directoryReport(item.symbol) || {};
    const watchlist = {
      ...(report.watchlist || {}),
      symbol: item.symbol,
      name: quote.name || report.watchlist?.name || item.name || item.symbol,
      market: quote.market || report.watchlist?.market || marketName(item.symbol),
      currentPrice: quote.currentPrice || report.watchlist?.currentPrice || "",
      signal: report.watchlist?.signal || T.mockReview,
      movingAverage: report.watchlist?.movingAverage || "",
      memo: report.watchlist?.memo || "",
      crashRisk: quote.crashRisk || report.watchlist?.crashRisk || report.crashRisk
    };
    return {
      ...item,
      name: stripSymbolFromName(quote.name, item.symbol) || item.name,
      report: { ...report, ok: true, symbol: item.symbol, name: quote.name || item.name, market: quote.market, currentPrice: quote.currentPrice, crashRisk: quote.crashRisk || report.crashRisk, watchlist },
      refreshedAt: new Date().toISOString()
    };
  }));
  state.userStocks = refreshed;
  saveUserStocks();
  if (state.activeSection === "watchlist") renderDashboard();
  updateSymbolHint();
}
async function refreshVisibleQuotes() {
  const data = state.data || {};
  const sections = mergedSections(data);
  const active = sections[state.activeSection] || sections.watchlist || [];
  const symbols = uniqueSymbols([
    ...state.userStocks,
    ...active
  ]).slice(0, 30);
  if (!symbols.length) return;
  const results = await Promise.all(symbols.map(async (symbol) => {
    const quote = await lookupQuote(symbol);
    return quote ? [symbol, quote] : null;
  }));
  let changed = false;
  results.forEach((entry) => {
    if (!entry) return;
    const [symbol, quote] = entry;
    state.quotes[symbol] = quote;
    changed = true;
  });
  if (changed) {
    renderDashboard();
    updateSymbolHint();
  }
}
function loadUserStocks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_STOCKS_KEY) || "[]");
    let rows = Array.isArray(parsed) ? parsed.filter((item) => item && item.symbol) : [];
    rows = rows.filter((item) => !INITIAL_SERVER_SYMBOLS.has(normalizeSymbol(item.symbol)) || item.source === "user");
    if (!localStorage.getItem(USER_STOCKS_MIGRATION_KEY)) {
      rows = rows.filter((item) => !INITIAL_SERVER_SYMBOLS.has(normalizeSymbol(item.symbol)));
      const store = loadReportStore();
      INITIAL_SERVER_SYMBOLS.forEach((symbol) => { delete store[symbol]; });
      localStorage.setItem(REPORT_STORE_KEY, JSON.stringify(store));
      localStorage.setItem(USER_STOCKS_MIGRATION_KEY, new Date().toISOString());
      localStorage.setItem(USER_STOCKS_KEY, JSON.stringify(rows));
    }
    if (rows.length && !sessionStorage.getItem(USER_KEEP_ASKED_KEY)) {
      sessionStorage.setItem(USER_KEEP_ASKED_KEY, "1");
      const keepWatching = window.confirm("이전 관심종목을 계속 관찰하시겠습니까?\n\n확인: 이 컴퓨터의 웹브라우저에 계속 저장\n취소: 관심종목 초기화");
      if (!keepWatching) {
        rows = [];
        localStorage.removeItem(USER_STOCKS_KEY);
        localStorage.removeItem(REPORT_STORE_KEY);
      }
    }
    state.userStocks = rows;
  } catch { state.userStocks = []; }
}
function saveUserStocks() { localStorage.setItem(USER_STOCKS_KEY, JSON.stringify(state.userStocks)); }
function loadReportStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPORT_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveReportToBrowser(report) {
  if (!report || !report.symbol) return;
  const store = loadReportStore();
  store[report.symbol] = report;
  localStorage.setItem(REPORT_STORE_KEY, JSON.stringify(store));
}
function loadReportFromBrowser(symbol) {
  return loadReportStore()[symbol] || null;
}
function parseNumber(value) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}
function formatWon(value) {
  const price = parseNumber(value);
  return price > 0 ? `${Math.round(price).toLocaleString("ko-KR")}원` : String(value || "").trim();
}
function formatDollar(value) {
  const price = parseNumber(value);
  if (price <= 0) return String(value || "").trim();
  const raw = String(value || "").trim();
  const hasDecimal = /\.\d+/.test(raw);
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: hasDecimal ? 2 : 0, maximumFractionDigits: 2 })}`;
}
function setupBrowserStorageNotice() {
  const card = el("#browserPrivacyCard");
  if (card) {
    card.innerHTML = `<h3>브라우저 저장 안내</h3><p>이 곳에서 조회한 내용은 종목분석에만 활용되고 별도의 외부기관에 제공되지 않습니다. 현재 웹브라우저에만 저장됩니다.</p>`;
  }
  window.addEventListener("beforeunload", (event) => {
    if (!state.userStocks.length) return;
    event.preventDefault();
    event.returnValue = "";
  });
}
function displayMarket(value) {
  return String(value || "") === "\ubbf8\uad6d" ? T.us : (value || "");
}
function tossStockUrl(symbol) {
  return `https://www.tossinvest.com/stocks/${encodeURIComponent(normalizeSymbol(symbol))}`;
}
function naverStockUrl(item) {
  const symbol = normalizeSymbol(item?.symbol || "");
  if (/^\d{6}$/.test(symbol)) return `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(symbol)}`;
  const name = stripSymbolFromName(item?.name || item?.title || "", symbol) || symbol;
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(`${name} ${symbol} 주가`)}`;
}
function formatDisplayPrice(value, item) {
  const raw = String(value || "").trim();
  if (!raw || /조회|대기|-/.test(raw)) return raw;
  const market = displayMarket(item?.market || marketName(item?.symbol || ""));
  if (market === T.domestic) return formatWon(raw);
  return formatDollar(raw);
}
function formatDisplayPriceRange(value, item) {
  const raw = String(value || "").trim();
  if (!raw || /조회|대기|-/.test(raw)) return raw;
  const parts = raw.split("~").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return formatDisplayPrice(raw, item);
  return `${formatDisplayPrice(parts[0], item)} ~ ${formatDisplayPrice(parts[1], item)}`;
}
function valuationFromItem(item) {
  return item?.valuation || item?.analysis?.valuation || item?.watchlist?.valuation || item?.report?.valuation || item?.report?.watchlist?.valuation || item?.report?.analysis?.valuation || null;
}
function valuationSummaryText(item) {
  const valuation = valuationFromItem(item);
  if (!valuation) return "";
  const parts = [
    valuation.buyFocus || "매수 판단: PBR 확인",
    valuation.sellFocus || "매도 판단: PSR 확인",
    valuation.psr ? `PSR ${valuation.psr}` : "",
    valuation.pbr ? `PBR ${valuation.pbr}` : "",
    valuation.per ? `PER ${valuation.per}` : "",
    valuation.fcf ? `FCF ${valuation.fcf}` : "",
    valuation.debtRatio ? `부채비율 ${valuation.debtRatio}%` : "",
    valuation.evEbitda ? `EV/EBITDA ${valuation.evEbitda}` : ""
  ].filter(Boolean);
  const summary = valuation.summary || valuation.note || "";
  if (!parts.length && !summary) return "";
  return `${parts.join(" / ")}${parts.length && summary ? " / " : ""}${summary}`;
}
function valuationSummaryHtml(item) {
  const text = valuationSummaryText(item);
  return text ? `<p class="valuation-line">밸류에이션: ${escapeHtml(text)}</p>` : "";
}
function fairValueFromItem(item) {
  return item?.fairValue || item?.analysis?.fairValue || item?.watchlist?.fairValue || item?.report?.fairValue || item?.report?.watchlist?.fairValue || item?.report?.analysis?.fairValue || null;
}
function fairValueSummaryText(item) {
  const fair = fairValueFromItem(item);
  if (!fair) return "";
  const parts = [
    fair.summary || "",
    fair.conservative ? `보수 ${fair.conservative}` : "",
    fair.neutral ? `중립 ${fair.neutral}` : "",
    fair.growth ? `성장 ${fair.growth}` : ""
  ].filter(Boolean);
  return parts.join(" / ");
}
function fairValueSummaryHtml(item) {
  const text = fairValueSummaryText(item);
  return text ? `<p class="fair-line">적정주가: ${escapeHtml(text)}</p>` : "";
}
function technicalFromItem(item) {
  return item?.technical || item?.analysis?.technical || item?.watchlist?.technical || item?.report?.technical || item?.report?.watchlist?.technical || item?.report?.analysis?.technical || null;
}
function technicalSummaryText(item) {
  const tech = technicalFromItem(item);
  if (!tech) return "";
  const stochastic = tech.stochastic || {};
  const volume = tech.volume || {};
  const parts = [
    stochastic.signal ? `스토캐스틱 ${stochastic.signal}` : "",
    stochastic.k ? `%K ${stochastic.k}` : "",
    stochastic.d ? `%D ${stochastic.d}` : "",
    volume.signal ? `거래량 ${volume.signal}` : "",
    volume.ratio ? `20일평균 대비 ${volume.ratio}` : ""
  ].filter(Boolean);
  return parts.join(" / ");
}
function technicalSummaryHtml(item) {
  const text = technicalSummaryText(item);
  return text ? `<p class="technical-line">기술지표: ${escapeHtml(text)}</p>` : "";
}
function marketRiskFromItem(item) {
  return item?.marketRisk || item?.analysis?.marketRisk || item?.watchlist?.marketRisk || item?.report?.marketRisk || item?.report?.watchlist?.marketRisk || item?.report?.analysis?.marketRisk || null;
}
function marketRiskSummaryText(item) {
  const risk = marketRiskFromItem(item);
  if (!risk) return "";
  const parts = [
    risk.current ? `WTI ${risk.current}` : "",
    risk.changePct ? risk.changePct : "",
    risk.chain || "유가상승 > 인플레이션 우려 > 금리상승 > 주가부담",
    risk.summary || ""
  ].filter(Boolean);
  return parts.join(" / ");
}
function marketRiskSummaryHtml(item) {
  const text = marketRiskSummaryText(item);
  return text ? `<p class="macro-line">유가 변수: ${escapeHtml(text)}</p>` : "";
}
function crashRiskFromItem(item) {
  return item?.crashRisk || item?.analysis?.crashRisk || item?.watchlist?.crashRisk || item?.report?.crashRisk || item?.report?.watchlist?.crashRisk || item?.report?.analysis?.crashRisk || null;
}
function crashRiskSummaryText(item) {
  const risk = crashRiskFromItem(item);
  if (!risk || !risk.level || risk.level === "주의보 없음") return "";
  const parts = [
    risk.level,
    risk.changePct ? `전일대비 ${risk.changePct}` : "",
    risk.fromHighPct ? `고점대비 ${risk.fromHighPct}` : "",
    Array.isArray(risk.reasons) ? risk.reasons.join(" / ") : risk.summary || ""
  ].filter(Boolean);
  return [...new Set(parts)].join(" / ");
}
function crashRiskSummaryHtml(item) {
  const risk = crashRiskFromItem(item);
  const text = crashRiskSummaryText(item);
  if (!text) return "";
  const level = String(risk?.level || "");
  const cls = level === "폭락주의보" ? "crash-alert critical" : "crash-alert";
  return `<p class="${cls}">폭락주의보: ${escapeHtml(text)}</p>`;
}
function priceClassForItem(item) {
  const purchase = Number(item?.purchasePrice || 0);
  const current = parseNumber(item?.currentPrice);
  if (purchase <= 0 || current <= 0) return "neutral";
  if (current > purchase) return "up";
  if (current < purchase) return "down";
  return "neutral";
}
function priceBackgroundClassForItem(item) {
  const priceClass = priceClassForItem(item);
  if (priceClass === "up") return "watch-card-profit";
  if (priceClass === "down") return "watch-card-loss";
  return "";
}
function signalSide(value) {
  const text = String(value || "");
  if (/\ub9e4\ub3c4|\uc704\ud5d8|\uc774\ud0c8|\uc190\uc808|\uc8fc\uc758|\ud3ed\ub77d|\uae09\ub77d/i.test(text)) return "sell";
  if (/\ub9e4\uc218|\uc0c1\uc2b9|\uac15\ud55c|\uc9c4\uc785|\ud68c\ubcf5|\ubcf4\uc720|\uac80\ud1a0/i.test(text)) return "buy";
  return "";
}
function normalizedDisplayName(item) {
  const symbol = normalizeSymbol(item?.symbol || "");
  const raw = item?.name || item?.title || item?.displayName || symbol || "-";
  const stripped = stripSymbolFromName(raw, symbol) || raw;
  return symbol ? `${stripped}(${symbol})` : stripped;
}
function signalLabelForItem(item, fallback = "\ub9e4\uc218") {
  const crashRisk = crashRiskFromItem(item);
  if (crashRisk?.level === "폭락주의보") return "폭락주의보";
  if (crashRisk?.level === "급락경계") return "급락경계";
  const signal = String(item?.signal || item?.sentiment || item?.decision || fallback || "").trim();
  if (/\uac15\ud55c\s*\ub9e4\uc218/.test(signal)) return "\uac15\ud55c \ub9e4\uc218";
  if (/\ub9e4\uc218/.test(signal)) return "\ub9e4\uc218";
  if (/\uac15\ud55c\s*\ub9e4\ub3c4/.test(signal)) return "\uac15\ud55c \ub9e4\ub3c4";
  if (/\ub9e4\ub3c4|\uc704\ud5d8|\uc774\ud0c8|\uc190\uc808|\uc8fc\uc758|\ud3ed\ub77d|\uae09\ub77d/.test(signal)) return "\ub9e4\ub3c4/\uc8fc\uc758";
  if (/\ubcf4\uc720/.test(signal)) return "\uad00\uc2ec\uad00\ucc30";
  return fallback;
}
function signalFeedType(label) {
  const text = String(label || "");
  if (/\ub9e4\ub3c4|\uc704\ud5d8|\uc774\ud0c8|\uc190\uc808|\uc8fc\uc758|\ud3ed\ub77d|\uae09\ub77d/.test(text)) return "sell";
  if (/\ubcf4\uc720|\uad00\uc2ec|\uad00\ucc30/.test(text)) return "hold";
  return "buy";
}
function signalFeedActionLabel(item) {
  const crashRisk = crashRiskFromItem(item);
  if (crashRisk?.level === "폭락주의보") return "폭락주의보";
  if (crashRisk?.level === "급락경계") return "급락경계";
  const type = signalFeedType(item?.feedLabel);
  if (type === "sell") return "\ub9e4\ub3c4/\uc8fc\uc758";
  if (type === "hold") return "\ub9e4\uc218/\uad00\uc2ec";
  return "\ub9e4\uc218";
}
function loadSignalFeedHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(SIGNAL_FEED_HISTORY_KEY) || "[]");
    return Array.isArray(rows) ? rows.filter(Boolean).slice(0, 10) : [];
  } catch {
    return [];
  }
}
function saveSignalFeedHistory(rows) {
  try {
    localStorage.setItem(SIGNAL_FEED_HISTORY_KEY, JSON.stringify((rows || []).filter(Boolean).slice(0, 10)));
  } catch {
    // Browser storage may be unavailable in private mode.
  }
}
function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    weekday: parts.weekday,
    minutes: Number(parts.hour || 0) * 60 + Number(parts.minute || 0)
  };
}
function etParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    weekday: parts.weekday,
    minutes: Number(parts.hour || 0) * 60 + Number(parts.minute || 0)
  };
}
function isMarketOpenForItem(item, date = new Date()) {
  const market = displayMarket(item?.market || marketName(item?.symbol || ""));
  const { weekday, minutes } = kstParts(date);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  if (market === T.domestic) {
    return isWeekday && minutes >= DOMESTIC_MARKET_START_KST_MINUTES && minutes <= DOMESTIC_MARKET_END_KST_MINUTES + MARKET_CLOSE_GRACE_MINUTES;
  }
  const et = etParts(date);
  const isEtWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(et.weekday);
  return isEtWeekday && et.minutes >= US_MARKET_START_ET_MINUTES && et.minutes <= US_MARKET_END_ET_MINUTES + MARKET_CLOSE_GRACE_MINUTES;
}
function marketSignalWindowForItem(item, date = new Date()) {
  const market = displayMarket(item?.market || marketName(item?.symbol || ""));
  const { weekday, minutes } = kstParts(date);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  if (market === T.domestic) {
    return {
      open: isWeekday && minutes >= DOMESTIC_MARKET_START_KST_MINUTES && minutes <= DOMESTIC_MARKET_END_KST_MINUTES + MARKET_CLOSE_GRACE_MINUTES,
      preOpen: isWeekday && minutes >= DOMESTIC_PREOPEN_START_KST_MINUTES && minutes < DOMESTIC_MARKET_START_KST_MINUTES
    };
  }
  const et = etParts(date);
  const isEtWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(et.weekday);
  return {
    open: isMarketOpenForItem(item, date),
    preOpen: isEtWeekday && et.minutes >= US_PREOPEN_START_ET_MINUTES && et.minutes < US_MARKET_START_ET_MINUTES
  };
}
function signalFeedRows() {
  const data = state.data || {};
  const now = new Date();
  const userSymbols = new Set(state.userStocks.map((item) => normalizeSymbol(item.symbol)).filter(Boolean));
  const sections = mergedSections(data);
  const watchRows = (sections.watchlist || []).filter((item) => userSymbols.has(normalizeSymbol(item.symbol)));
  const interestSignals = watchRows
    .filter((item) => crashRiskSummaryText(item) || signalSide(item.signal || item.sentiment || item.decision))
    .map((item) => ({ ...item, feedLabel: signalLabelForItem(item) }));
  const nonInterestSignals = [
    ...(sections.scanner || []),
    ...(sections.spikes || []),
    ...(sections.movingAverages || [])
  ]
    .filter((item) => {
      const symbol = normalizeSymbol(item.symbol);
      if (!symbol || userSymbols.has(symbol)) return false;
      const window = marketSignalWindowForItem(item, now);
      if (!window.open && !window.preOpen) return false;
      return signalSide(item.signal || item.sentiment || item.decision) === "buy";
    })
    .map((item) => {
      const text = String(item.signal || item.sentiment || item.decision || "");
      return {
        ...item,
        feedLabel: /\uac15\ud55c\s*\ub9e4\uc218/.test(text) ? "\uac15\ud55c \ub9e4\uc218" : "\ub9e4\uc218",
        preOpenSignal: marketSignalWindowForItem(item, now).preOpen
      };
    });
  const selected = [...interestSignals, ...nonInterestSignals];
  const seen = new Set();
  const deduped = [];
  selected.forEach((item) => {
    const symbol = normalizeSymbol(item.symbol);
    const key = `${symbol}:${item.feedLabel || "hold"}`;
    if (!symbol || seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });
  if (!deduped.length) return [];
  const itemCount = deduped.some((item) => item.preOpenSignal) ? 10 : 3;
  const bucketMs = 5 * 60 * 1000;
  const base = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
  const count = Math.min(itemCount, deduped.length);
  const items = deduped.slice(0, count);
  const body = items.map((item) => `${normalizedDisplayName(item)} ${signalFeedActionLabel(item)}`).join(", ");
  const currentRow = `[${fmtClock(base)}] ${body}`;
  const history = loadSignalFeedHistory();
  const rows = [currentRow, ...history.filter((row) => row !== currentRow)].slice(0, 10);
  saveSignalFeedHistory(rows);
  return rows;
}
function fmtClock(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(date).replace(/\s/g, "");
}
function renderSignalFeed() {
  const feed = el("#signalFeed");
  if (!feed) return;
  const rows = signalFeedRows();
  if (!rows.length) {
    feed.hidden = state.activeSection !== "watchlist";
    feed.innerHTML = `<div class="signal-feed-head">\uc2ec\uce35\ubd84\uc11d \ub85c\uadf8</div><div class="signal-feed-lines"><p>\ud604\uc7ac \uac70\ub798\uc2dc\uac04\uc5d0 \ud45c\uc2dc\ud560 \uc2ec\uce35\ubd84\uc11d \uc2e0\ud638\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</p></div>`;
    return;
  }
  feed.hidden = state.activeSection !== "watchlist";
  feed.innerHTML = `<div class="signal-feed-head">\uc2ec\uce35\ubd84\uc11d \ub85c\uadf8</div><div class="signal-feed-lines">${rows.map((row) => `<p>${escapeHtml(row)}</p>`).join("")}</div>`;
}
function chartSourceForSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  const report = loadReportFromBrowser(normalized) || directoryReport(normalized);
  if (report && report.watchlist) {
    const name = report.watchlist.name || report.name || normalized;
    const current = parseNumber(report.watchlist.currentPrice || report.currentPrice);
    let low = 0;
    let high = 0;
    const predRange = report.scanner?.predRange || report.watchlist.predRange || "";
    const parts = String(predRange).split("~");
    if (parts.length >= 2) {
      low = parseNumber(parts[0]);
      high = parseNumber(parts[1]);
    }
    return { symbol: normalized, name, market: report.watchlist.market || report.market || marketName(normalized), current, low, high, signal: report.watchlist.signal || report.scanner?.signal || "" };
  }
  const data = state.data || {};
  const rows = [...(data.scanner || []), ...(data.watchlist || []), ...(data.movingAverages || [])];
  const item = rows.find((row) => normalizeSymbol(row.symbol) === normalized);
  if (!item) return null;
  const parts = String(item.predRange || "").split("~");
  return {
    symbol: normalized,
    name: item.name || item.title || normalized,
    market: item.market || marketName(normalized),
    current: parseNumber(item.currentPrice),
    low: parts.length >= 2 ? parseNumber(parts[0]) : 0,
    high: parts.length >= 2 ? parseNumber(parts[1]) : 0,
    signal: item.signal || item.sentiment || ""
  };
}
function directoryReport(symbol) {
  const item = symbolDirectory[symbol];
  if (!item) return null;
  return {
    ok: true,
    symbol,
    name: item.name || symbol,
    market: item.market || marketName(symbol),
    currentPrice: item.currentPrice || "",
    watchlist: {
      symbol,
      name: item.name || symbol,
      market: item.market || marketName(symbol),
      currentPrice: item.currentPrice || "",
      signal: item.signal || T.preview,
      movingAverage: item.movingAverage || "",
      memo: item.memo || ""
    },
    scanner: {
      title: item.name || symbol,
      symbol,
      market: item.market || marketName(symbol),
      currentPrice: item.currentPrice || "-",
      signal: item.signal || T.preview,
      predRange: item.predRange || "-",
      summary: item.memo || ""
    },
    learning: {
      topic: `${T.learning} - ${symbol}`,
      lesson: `${item.name || symbol} ${item.signal || T.preview}`
    },
    moving: {
      name: item.name || symbol,
      symbol,
      market: item.market || marketName(symbol),
      currentPrice: item.currentPrice || "",
      ma20: item.movingAverage || T.priceHistory,
      ma60: item.predRange || T.priceHistory,
      decision: item.signal || T.preview,
      note: item.memo || item.movingAverage || ""
    },
    analysis: {
      title: `${T.analysisPreview} - ${symbol}`,
      body: item.memo || item.name || symbol
    }
  };
}
function marketName(symbol) { return /^\d{6}$/.test(symbol) ? T.domestic : T.us; }
function userStockToWatchlist(item) {
  const price = Number(item.purchasePrice || 0);
  const hasPrice = price > 0;
  const directory = directoryReport(item.symbol);
  const report = item.report && item.report.watchlist ? item.report : null;
  const base = directory && directory.watchlist ? directory.watchlist : report?.watchlist;
  if (base) {
    const current = String(base.currentPrice || "").startsWith(T.basis) ? "\uc870\ud68c \uc911" : (base.currentPrice || "\uc870\ud68c \uc911");
    const resolvedName = stripSymbolFromName(base.name || item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
    const memoParts = [base.memo || ""];
    if (hasPrice) memoParts.push(`\uad6c\uc785\uac00 ${formatDisplayPrice(price, item)}\uc744 \uae30\uc900\uc73c\ub85c \uac80\ud1a0\ud569\ub2c8\ub2e4.`);
    return { ...base, name: resolvedName, market: displayMarket(base.market || marketName(item.symbol)), currentPrice: current, purchasePrice: price, crashRisk: base.crashRisk || directory?.crashRisk || report?.crashRisk, memo: memoParts.filter(Boolean).join(" / "), userAdded: true };
  }
  const resolvedName = stripSymbolFromName(item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
  return {
    symbol: item.symbol,
    name: resolvedName,
    market: marketName(item.symbol),
    currentPrice: "\uc870\ud68c \uc911",
    purchasePrice: price,
    signal: hasPrice ? T.mockReview : T.dataNeeded,
    movingAverage: "",
    memo: hasPrice ? `\uad6c\uc785\uac00 ${formatDisplayPrice(price, item)}\uc744 \uae30\uc900\uc73c\ub85c \ud604\uc7ac\uac00\ub97c \uc870\ud68c\ud558\ub294 \uc911\uc785\ub2c8\ub2e4.` : "\uc885\ubaa9\uba85\uacfc \uc6f9 \uc790\ub8cc\ub97c \uc870\ud68c\ud558\ub294 \uc911\uc785\ub2c8\ub2e4.",
    hasPrice,
    userAdded: true
  };
}
function userStockToLearning(item) {
  const directory = item.report || directoryReport(item.symbol);
  if (directory && directory.learning) return directory.learning;
  if (item.report && item.report.learning) return item.report.learning;
  const price = Number(item.purchasePrice || 0);
  const base = price > 0 ? `${T.basis} ${formatDisplayPrice(price, item)}` : T.noPurchasePrice;
  const resolvedName = stripSymbolFromName(item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
  return { topic: `${T.learning} - ${item.symbol}`, lesson: `${resolvedName} ${base}. \uad00\uc2ec\uc885\ubaa9\uc5d0 \ucd94\uac00\ub418\uc5c8\uc73c\uba70 \uc2e4\uc81c \uc6b4\uc601\uc5d0\uc11c\ub294 \ud604\uc7ac\uac00\uc640 \ube44\uad50\ud574 \uac80\ud1a0 \uacb0\uacfc\ub97c \ubcf4\uc5ec\uc90d\ub2c8\ub2e4.` };
}
function userStockToMoving(item) {
  const directory = item.report || directoryReport(item.symbol);
  if (directory && directory.moving) {
    return {
      currentPrice: directory.watchlist?.currentPrice || directory.currentPrice || "",
      note: directory.watchlist?.memo || directory.moving.note || "",
      ...directory.moving,
    };
  }
  if (item.report && item.report.moving) {
    return {
      currentPrice: item.report.watchlist?.currentPrice || item.report.currentPrice || "",
      note: item.report.watchlist?.memo || item.report.moving.note || "",
      ...item.report.moving,
    };
  }
  const resolvedName = stripSymbolFromName(item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
  const price = Number(item.purchasePrice || 0);
  return {
    name: resolvedName,
    symbol: item.symbol,
    market: marketName(item.symbol),
    currentPrice: price > 0 ? `${T.basis} ${formatDisplayPrice(price, item)}` : "",
    ma20: T.priceHistory,
    ma60: T.priceHistory,
    decision: T.preview,
    note: "\uad00\uc2ec\uc885\ubaa9\uc5d0 \ucd94\uac00\ub41c \uc885\ubaa9\uc785\ub2c8\ub2e4. \uc774\ud3c9\uc120 \uc790\ub8cc\ub294 \uc6f9 \uc870\ud68c \ub610\ub294 \uacf5\uac1c \uc800\uc7a5\uc790\ub8cc\uac00 \uc5f0\uacb0\ub418\uba74 \uac31\uc2e0\ub429\ub2c8\ub2e4."
  };
}
function userStockToAnalysis(item) {
  const directory = item.report || directoryReport(item.symbol);
  if (directory && directory.analysis) return directory.analysis;
  if (item.report && item.report.analysis) return item.report.analysis;
  const resolvedName = stripSymbolFromName(item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
  return { title: `${T.analysisPreview} - ${item.symbol}`, body: `${resolvedName} \uc885\ubaa9\uc740 \ubaa8\ub2dd\ub178\ud2b8, \uc139\ud130\uc624\ubc84\ubdf0, \uc2e4\uc801\ubd84\uc11d\uacfc \uc5f0\uacb0\ub420 \uc900\ube44\uac00 \ub418\uc5c8\uc2b5\ub2c8\ub2e4.` };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function watchlistMiniChartSvg(item) {
  const symbol = normalizeSymbol(item.symbol || "");
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const width = 300;
  const height = 150;
  const values = Array.from({ length: 28 }, (_, index) => {
    const wave = Math.sin((index + seed) / 3) * 18 + Math.cos(index / 4) * 10;
    const trend = (index - 14) * ((seed % 7) - 3) * 0.8;
    return 75 + wave + trend;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const toX = (index) => 16 + (268 / Math.max(values.length - 1, 1)) * index;
  const toY = (value) => 122 - ((value - min) / Math.max(max - min, 1)) * 92;
  const points = values.map((value, index) => `${toX(index).toFixed(1)},${toY(value).toFixed(1)}`).join(" ");
  const current = formatDisplayPrice(item.currentPrice, item) || "-";
  return `<svg class="watch-mini-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="watchlist chart"><text x="14" y="20" class="watch-mini-title">${escapeHtml(item.name || item.symbol)}(${escapeHtml(symbol)})</text><line x1="16" y1="42" x2="284" y2="42" class="watch-mini-grid"/><line x1="16" y1="76" x2="284" y2="76" class="watch-mini-grid"/><line x1="16" y1="110" x2="284" y2="110" class="watch-mini-grid"/><polyline points="${points}" class="watch-mini-line"/><circle cx="${toX(values.length - 1).toFixed(1)}" cy="${toY(values[values.length - 1]).toFixed(1)}" r="4" class="watch-mini-dot"/><text x="14" y="142" class="watch-mini-price">\ud604\uc7ac\uac00: ${escapeHtml(current)}</text></svg>`;
}
function movingChartSvg(item) {
  const seed = String(item.symbol || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const width = 620;
  const height = 300;
  const left = 54;
  const top = 26;
  const plotWidth = 520;
  const plotHeight = 236;
  const current = parseNumber(item.currentPrice) || 4000 + (seed % 600);
  const low = current * 0.88;
  const high = current * 1.12;
  const toX = (index, count) => left + (plotWidth / Math.max(count - 1, 1)) * index;
  const toY = (value) => top + ((high - value) / Math.max(high - low, 1)) * plotHeight;
  const line = (offset, amp, slope) => Array.from({ length: 48 }, (_, index) => {
    const wave = Math.sin((index + seed / 17) / 4) * amp + Math.cos(index / 7) * amp * 0.55;
    const trend = (index - 24) * slope;
    const dip = index > 16 && index < 29 ? -amp * 1.4 : 0;
    return `${toX(index, 48).toFixed(1)},${toY(current + offset + wave + trend + dip).toFixed(1)}`;
  }).join(" ");
  const labels = [high, current * 1.06, current, current * 0.94, low].map((value, index) => {
    const y = top + (plotHeight / 4) * index;
    return `<text x="12" y="${(y + 4).toFixed(1)}" class="ma-axis">${escapeHtml(formatDisplayPrice(value, item))}</text><line x1="${left}" y1="${y.toFixed(1)}" x2="${left + plotWidth}" y2="${y.toFixed(1)}" class="ma-grid"/>`;
  }).join("");
  return `<svg class="ma-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="moving average chart"><text x="54" y="18" class="ma-title">${escapeHtml(item.name || item.symbol)}(${escapeHtml(item.symbol || "")}) \uc774\ub3d9\ud3c9\uade0\uc120 \ucc28\ud2b8</text><g class="ma-legend"><text x="238" y="18">\uc885\uac00</text><text x="286" y="18">5\uc77c</text><text x="336" y="18">20\uc77c</text><text x="392" y="18">60\uc77c</text><text x="452" y="18">\ub3d9\uc801</text><text x="510" y="18">\ub370\ub4dc</text></g>${labels}<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="ma-border"/><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="ma-border"/><polyline points="${line(0, current * 0.032, -current * 0.0012)}" class="ma-close"/><polyline points="${line(current * 0.01, current * 0.022, -current * 0.0008)}" class="ma-line ma-fast"/><polyline points="${line(current * 0.025, current * 0.016, -current * 0.0004)}" class="ma-line ma-mid"/><polyline points="${line(current * 0.055, current * 0.010, current * 0.0001)}" class="ma-line ma-slow"/><line x1="${(left + plotWidth * 0.38).toFixed(1)}" y1="${top}" x2="${(left + plotWidth * 0.38).toFixed(1)}" y2="${top + plotHeight}" class="ma-dead"/><line x1="${(left + plotWidth * 0.90).toFixed(1)}" y1="${top}" x2="${(left + plotWidth * 0.90).toFixed(1)}" y2="${top + plotHeight}" class="ma-dead"/><circle cx="${(left + plotWidth * 0.38).toFixed(1)}" cy="${toY(current * 1.03).toFixed(1)}" r="4" class="ma-dot"/><text x="${(left + plotWidth * 0.39).toFixed(1)}" y="${toY(current * 1.04).toFixed(1)}" class="ma-dead-label">\ub370\ub4dc</text></svg>`;
}
function movingDetailHtml(item) {
  if (!item) return "";
  const current = formatDisplayPrice(item.currentPrice, item) || "-";
  const ma20 = formatDisplayPrice(item.ma20, item) || "-";
  const ma60 = formatDisplayPrice(item.ma60, item) || "-";
  const decision = item.decision || "-";
  const note = item.note || item.movingAverage || "-";
  const strategy = /\ub9e4\ub3c4|\uc704\ud5d8|\ubcf4\ub958|\ubcc0\ub3d9/.test(`${decision} ${note}`)
    ? "\ub2e8\ud0c0 \uc9c4\uc785\uc740 \ubcf4\ub958\ud558\uace0 20\uc77c\uc120 \ud68c\ubcf5\uacfc \uac70\ub798\ub7c9 \uc548\uc815\uc744 \uba3c\uc800 \ud655\uc778\ud569\ub2c8\ub2e4."
    : "20\uc77c\uc120 \uc9c0\uc9c0\uc640 60\uc77c\uc120 \uc774\ud0c8 \uc5ec\ubd80\ub97c \uac19\uc774 \ubcf4\uba74\uc11c \ubd84\ud560 \uc9c4\uc785\ub9cc \uac80\ud1a0\ud569\ub2c8\ub2e4.";
  return `<div class="moving-detail"><div class="moving-chart-box">${movingChartSvg(item)}</div><div class="moving-memo"><h3>[\uc774\ub3d9\ud3c9\uade0\uc120 \ubcf4\uc870\ud310\ub2e8]</h3><p>- \uc885\ubaa9: ${escapeHtml(item.name || item.symbol)}(${escapeHtml(item.symbol || "-")})</p><p>- \ud604\uc7ac\uac00: ${escapeHtml(current)}</p><p>- 20\uc77c\uc120: ${escapeHtml(ma20)}</p><p>- 60\uc77c\uc120: ${escapeHtml(ma60)}</p><p>- \ubcf4\uc870\ud310\ub2e8: <b>${escapeHtml(decision)}</b></p><p>- \uadfc\uac70: ${escapeHtml(note)}</p><h3>[\uc804\ub7b5 \uba54\ubaa8]</h3><p>- ${escapeHtml(strategy)}</p><p>- \uc774\ud3c9\uc120 \ub2e8\ud0c0\uc804\ub7b5: 5\uc77c\uc120\uacfc 20\uc77c\uc120 \uc704\uce58\uac00 \uac19\uc774 \uac1c\uc120\ub420 \ub54c\ub9cc \uc810\uc218\ub97c \ub192\uc785\ub2c8\ub2e4.</p></div></div>`;
}
function mergedSections(data) {
  return {
    scanner: [...state.userStocks.map((item) => item.report?.scanner).filter(Boolean), ...data.scanner].map(applyLiveQuote),
    watchlist: state.userStocks.map(userStockToWatchlist).map(applyLiveQuote),
    learning: [...state.userStocks.map(userStockToLearning), ...data.learning],
    spikes: (data.spikes || []).map(applyLiveQuote),
    moving: [...state.userStocks.map(userStockToMoving), ...data.movingAverages].map(applyLiveQuote),
    morningNote: data.morningNote || data.analysis || [],
    sectorOverview: data.sectorOverview || [],
    deepAnalysis: data.deepAnalysis || [],
    newsList: data.newsList || []
  };
}
function renderDashboard() {
  const data = state.data;
  if (!data) return;
  const updatedAt = el("#updatedAt");
  const exchangeRate = el("#exchangeRate");
  const exchangeNote = el("#exchangeNote");
  if (updatedAt) updatedAt.textContent = fmtDateTimeSeconds(new Date().toISOString());
  if (exchangeRate) exchangeRate.textContent = `${data.exchangeRate.value} ${data.exchangeRate.change}`;
  if (exchangeNote) exchangeNote.textContent = data.exchangeRate.note || "\uc6b4\uc601 \ub370\uc774\ud130 \uae30\uc900\uc73c\ub85c 5\ucd08\ub9c8\ub2e4 \ud654\uba74\uc744 \uac31\uc2e0\ud569\ub2c8\ub2e4.";
  const sections = mergedSections(data);
  const active = sections[state.activeSection] || sections.watchlist;
  const grid = el("#contentGrid");
  renderSignalFeed();
  if (state.activeSection === "watchlist") {
    grid.innerHTML = renderCards(active, (item) => {
      const displayName = !item.name || item.name === item.symbol ? item.symbol : `${item.name} <span>(${item.symbol})</span>`;
      const priceLine = item.currentPrice ? `<p class="price ${priceClassForItem(item)}"><span>${T.currentPrice}:</span> ${formatDisplayPrice(item.currentPrice, item)}</p>` : "";
      const marketLinks = item.symbol ? ` <a class="market-link" href="${tossStockUrl(item.symbol)}" target="_blank" rel="noopener">토스증권</a> <a class="market-link" href="${naverStockUrl(item)}" target="_blank" rel="noopener">네이버증권</a>` : "";
      return `<article class="data-card clickable-card watch-card ${priceBackgroundClassForItem(item)}" data-chart-symbol="${item.symbol}"><div class="card-top"><strong>${displayName}</strong><em>${displayMarket(item.market)}</em></div>${priceLine}<p><b class="${signalClass(item.signal)}">${item.signal}</b>${item.movingAverage ? ` / ${item.movingAverage}` : ""}</p>${crashRiskSummaryHtml(item)}${fairValueSummaryHtml(item)}${technicalSummaryHtml(item)}${valuationSummaryHtml(item)}${marketRiskSummaryHtml(item)}<p>${item.memo}${marketLinks}</p><div class="watch-chart-popover">${watchlistMiniChartSvg(item)}</div>${item.userAdded ? `<button class="small-button" data-remove-symbol="${item.symbol}" type="button">${T.remove}</button>` : ""}</article>`;
    });
  } else if (state.activeSection === "scanner") {
    const marketRows = (marketLabel) => active.filter((item) => displayMarket(item.market || marketName(item.symbol)) === marketLabel);
    const rowHtml = (item) => `<tr><td>${item.rank || "-"}</td><td><strong>${item.name || item.title || item.symbol}</strong> <span>(${item.symbol || "-"})</span></td><td>${formatDisplayPrice(item.currentPrice, item) || "-"}</td><td><b class="${signalClass(item.signal || item.sentiment || "")}">${item.signal || item.sentiment || "-"}</b></td><td>${formatDisplayPriceRange(item.predRange, item) || "-"}</td><td>${item.summary || ""}</td></tr>`;
    const groupHtml = (marketLabel) => {
      const rows = marketRows(marketLabel).slice(0, 50);
      const body = rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="6">\ud45c\uc2dc\ud560 \uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</td></tr>`;
      return `<tr class="market-group-row"><td colspan="6">${marketLabel}</td></tr>${body}`;
    };
    const first = state.scannerMarketFirst === "us" ? T.us : T.domestic;
    const second = state.scannerMarketFirst === "us" ? T.domestic : T.us;
    grid.innerHTML = `<div class="scanner-market-controls"><button class="${state.scannerMarketFirst === "domestic" ? "active" : ""}" data-scanner-first="domestic" type="button">\uad6d\ub0b4 \uc6b0\uc120</button><button class="${state.scannerMarketFirst === "us" ? "active" : ""}" data-scanner-first="us" type="button">\ud574\uc678 \uc6b0\uc120</button></div><div class="table-card"><table class="data-table"><thead><tr><th>\uc21c\uc704</th><th>\uc885\ubaa9</th><th>\ud604\uc7ac\uac00</th><th>\uc2e0\ud638</th><th>\uc608\uce21\ubc94\uc704</th><th>\uc694\uc57d</th></tr></thead><tbody>${groupHtml(first)}${groupHtml(second)}</tbody></table></div>`;
  } else if (state.activeSection === "learning") {
    grid.innerHTML = renderCards(active, (item) => `<article class="data-card"><div class="card-top"><strong>${item.topic}</strong><em>${T.learning}</em></div><p>${item.lesson}</p></article>`);
  } else if (state.activeSection === "spikes") {
    const marketRows = (marketLabel) => active.filter((item) => displayMarket(item.market || marketName(item.symbol)) === marketLabel);
    const rowHtml = (item, index) => `<tr><td>${index + 1}</td><td><strong>${item.name || item.symbol}</strong> <span>(${item.symbol || "-"})</span></td><td>${item.range || "-"}</td><td><b class="up">${item.change || "-"}</b></td><td>${formatDisplayPrice(item.currentPrice, item) || "-"}</td><td><b class="${signalClass(item.signal || "")}">${item.signal || "-"}</b></td><td>${item.note || ""}</td></tr>`;
    const groupHtml = (marketLabel) => {
      const rows = marketRows(marketLabel).slice(0, 25);
      const body = rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="7">\ud45c\uc2dc\ud560 \uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</td></tr>`;
      return `<tr class="market-group-row"><td colspan="7">${marketLabel}</td></tr>${body}`;
    };
    grid.innerHTML = `<div class="table-card"><table class="data-table"><thead><tr><th>\uc21c\uc704</th><th>\uc885\ubaa9</th><th>\uad6c\uac04</th><th>\ub4f1\ub77d\ub960</th><th>\ud604\uc7ac\uac00</th><th>\uc2e0\ud638</th><th>\uadfc\uac70</th></tr></thead><tbody>${groupHtml(T.domestic)}${groupHtml(T.us)}</tbody></table></div>`;
  } else if (state.activeSection === "moving") {
    const selectedSymbol = normalizeSymbol(state.selectedMovingSymbol);
    const rows = active.map((item) => {
      const symbol = normalizeSymbol(item.symbol);
      const selected = symbol && symbol === selectedSymbol;
      const detailRow = selected ? `<tr class="moving-detail-row"><td colspan="6">${movingDetailHtml(item)}</td></tr>` : "";
      return `<tr class="clickable-row ${selected ? "selected-row" : ""}" data-moving-symbol="${item.symbol || ""}" data-chart-symbol="${item.symbol || ""}"><td><strong>${item.name || item.symbol}</strong> <span>(${item.symbol || "-"})</span></td><td>${formatDisplayPrice(item.currentPrice, item) || "-"}</td><td>${formatDisplayPrice(item.ma20, item) || "-"}</td><td>${formatDisplayPrice(item.ma60, item) || "-"}</td><td><b class="${signalClass(item.decision || "")}">${item.decision || "-"}</b></td><td>${item.note || item.movingAverage || ""}</td></tr>${detailRow}`;
    }).join("");
    grid.innerHTML = `<div class="table-card"><table class="data-table"><thead><tr><th>\uc885\ubaa9</th><th>\ud604\uc7ac\uac00</th><th>20\uc77c\uc120</th><th>60\uc77c\uc120</th><th>\ud310\ub2e8</th><th>\uadfc\uac70</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else if (state.activeSection === "newsList") {
    grid.innerHTML = `<div class="table-card"><table class="data-table"><thead><tr><th>\uc2dc\uac04</th><th>\uc81c\ubaa9</th><th>\uc694\uc57d</th><th>\ub9c1\ud06c</th></tr></thead><tbody>${active.map((item) => `<tr><td>${item.asOf || "-"}</td><td><strong>${item.title || "-"}</strong></td><td>${item.summary || ""}</td><td>${item.url ? `<a href="${item.url}" target="_blank" rel="noopener">\uc5f4\uae30</a>` : "-"}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (["morningNote", "sectorOverview", "deepAnalysis"].includes(state.activeSection)) {
    grid.innerHTML = renderCards(active, (item) => {
      if (Array.isArray(item.sections)) {
        const sections = Array.isArray(item.sections) ? item.sections : [];
        const sectionHtml = sections.map((section) => `<section class="report-section"><h3>${section.heading}</h3><ul>${(section.items || []).map((line) => `<li>${line}</li>`).join("")}</ul></section>`).join("");
        return `<article class="report-card"><div class="report-head"><div><strong>${item.title}</strong><p>${item.updatedAt || ""}</p></div><em>${T.report}</em></div><p class="report-summary">${item.summary || item.body || ""}</p>${crashRiskSummaryHtml(item)}${fairValueSummaryHtml(item)}${technicalSummaryHtml(item)}${valuationSummaryHtml(item)}${marketRiskSummaryHtml(item)}${sectionHtml}</article>`;
      }
      return `<article class="data-card"><div class="card-top"><strong>${item.title}</strong><em>${T.report}</em></div>${crashRiskSummaryHtml(item)}${fairValueSummaryHtml(item)}${technicalSummaryHtml(item)}${valuationSummaryHtml(item)}${marketRiskSummaryHtml(item)}<p>${item.body}</p></article>`;
    });
  } else {
    grid.innerHTML = renderCards(active, (item) => `<article class="data-card"><div class="card-top"><strong>${item.title || "-"}</strong><em>${T.report}</em></div><p>${item.body || ""}</p></article>`);
  }
  drawChart();
  document.querySelectorAll("[data-chart-symbol]").forEach((button) => {
    button.addEventListener("click", () => updateTopChart(button.dataset.chartSymbol));
  });
  document.querySelectorAll("[data-moving-symbol]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedMovingSymbol = row.dataset.movingSymbol || "";
      renderDashboard();
      const detail = el(".moving-detail-row");
      if (detail) detail.scrollIntoView({ block: "nearest" });
    });
  });
  document.querySelectorAll("[data-scanner-first]").forEach((button) => {
    button.addEventListener("click", () => {
      state.scannerMarketFirst = button.dataset.scannerFirst || "domestic";
      renderDashboard();
    });
  });
  document.querySelectorAll("[data-remove-symbol]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const symbol = button.dataset.removeSymbol;
      const removed = state.userStocks.find((item) => item.symbol === symbol);
      state.userStocks = state.userStocks.filter((item) => item.symbol !== symbol);
      saveUserStocks();
      if (removed) saveWebWatchlistInterest(removed, "remove");
      setStatus(`${symbol} ${T.removed}`);
      renderDashboard();
    });
  });
}
function updateTopChart(symbol) {
  const source = chartSourceForSymbol(symbol);
  if (!source) return;
  const title = `${source.name} (${source.symbol})`;
  const updatedAt = el("#updatedAt");
  const exchangeRate = el("#exchangeRate");
  const exchangeNote = el("#exchangeNote");
  if (updatedAt) updatedAt.textContent = title;
  const chartItem = { symbol: source.symbol, market: source.market };
  if (exchangeRate) exchangeRate.textContent = source.current > 0 ? `${T.currentPrice} ${formatDisplayPrice(source.current, chartItem)}` : T.chartTitle;
  if (exchangeNote) {
    const low = source.low > 0 ? `${T.predictedLow} ${formatDisplayPrice(source.low, chartItem)}` : "";
    const high = source.high > 0 ? `${T.predictedHigh} ${formatDisplayPrice(source.high, chartItem)}` : "";
    exchangeNote.textContent = [source.signal, low, high].filter(Boolean).join(" | ");
  }
  drawChart(source);
}
function drawChart(source = null) {
  const canvas = el("#trendCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const plot = { left: 8, top: 42, right: 86, bottom: 36 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const current = source && source.current > 0 ? source.current : 872.43;
  const lowBase = source && source.low > 0 ? source.low : current * 0.955;
  const highBase = source && source.high > 0 ? source.high : current * 1.067;
  const low = Math.min(lowBase, current * 0.95);
  const high = Math.max(highBase, current * 1.08);
  const range = Math.max(high - low, 1);
  const toY = (value) => plot.top + ((high - value) / range) * plotHeight;
  const toX = (index, count) => plot.left + (plotWidth / Math.max(count - 1, 1)) * index;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#edf1f5";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i += 1) {
    const y = plot.top + (plotHeight / 6) * i;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(width - plot.right + 16, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i += 1) {
    const x = plot.left + (plotWidth / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, height - plot.bottom);
    ctx.stroke();
  }

  ctx.fillStyle = "#4b5563";
  ctx.font = "12px Arial";
  ctx.fillText("\uc2dc\uc791 \uace0\uac00 \uc800\uac00 \uc885\uac00", plot.left + 6, 22);
  ctx.fillStyle = "#8a96a8";
  ctx.font = "14px Arial";
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const value = high - (range / steps) * i;
    const y = plot.top + (plotHeight / steps) * i + 4;
    ctx.fillText(value.toLocaleString(undefined, { maximumFractionDigits: current >= 10000 ? 0 : 2 }), width - plot.right + 26, y);
  }

  const values = [];
  const count = 92;
  let value = low + range * 0.26;
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin(i / 5) * range * 0.025 + Math.sin(i / 2.7) * range * 0.012;
    let drift = 0;
    if (i < 22) drift = i * range * 0.003;
    else if (i < 34) drift = range * 0.07 - (i - 22) * range * 0.012;
    else if (i < 40) drift = -range * 0.08 + (i - 34) * range * 0.12;
    else if (i < 50) drift = range * 0.58 - (i - 40) * range * 0.035;
    else if (i < 62) drift = range * 0.18 + (i - 50) * range * 0.018;
    else drift = range * 0.40 - (i - 62) * range * 0.010;
    const jitter = ((i * 37) % 19 - 9) * range * 0.0025;
    value = low + range * 0.20 + wave + drift + jitter;
    values.push(Math.min(high - range * 0.04, Math.max(low + range * 0.04, value)));
  }
  values[37] = low + range * 0.12;
  values[38] = high - range * 0.11;
  values[39] = low + range * 0.34;
  values[40] = high - range * 0.18;
  values[count - 1] = current;

  const baseline = current * 1.034;
  const baselineY = toY(Math.min(high, Math.max(low, baseline)));
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = "#c8ced8";
  ctx.beginPath();
  ctx.moveTo(plot.left, baselineY);
  ctx.lineTo(width - plot.right + 18, baselineY);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 1; i < values.length; i += 1) {
    ctx.beginPath();
    ctx.strokeStyle = values[i] >= values[i - 1] ? "#ef4444" : "#2563eb";
    ctx.lineWidth = 2;
    ctx.moveTo(toX(i - 1, count), toY(values[i - 1]));
    ctx.lineTo(toX(i, count), toY(values[i]));
    ctx.stroke();
  }

  const currentY = toY(current);
  const labelX = width - plot.right + 14;
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(labelX, currentY - 12, 62, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px Arial";
  ctx.fillText(current.toLocaleString(undefined, { maximumFractionDigits: current >= 10000 ? 0 : 2 }), labelX + 6, currentY + 5);

  ctx.fillStyle = "#111827";
  ctx.fillRect(labelX, baselineY - 12, 62, 24);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(baseline.toLocaleString(undefined, { maximumFractionDigits: current >= 10000 ? 0 : 2 }), labelX + 6, baselineY + 5);

  const avgText = "\ub0b4 \ud3c9\uade0 -3.32%";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  const avgY = baselineY + 8;
  ctx.roundRect(plot.left + 8, avgY - 14, 92, 22, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1d4ed8";
  ctx.font = "12px Arial";
  ctx.fillText(avgText, plot.left + 14, avgY + 2);

  ctx.fillStyle = "#8a96a8";
  ctx.font = "bold 13px Arial";
  ctx.fillText("'00", plot.left, height - 12);
  ctx.fillText("8\uc77c", plot.left + plotWidth * 0.28, height - 12);
  ctx.fillText("12:00", plot.left + plotWidth * 0.55, height - 12);
  ctx.fillText("15:00", plot.left + plotWidth * 0.82, height - 12);

  ctx.beginPath();
  ctx.arc(plot.left + 28, height - 30, 16, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#d7dee9";
  ctx.stroke();
  ctx.fillStyle = "#111827";
  ctx.font = "bold 15px Arial";
  ctx.fillText("T", plot.left + 20, height - 25);
  ctx.fillText("V", plot.left + 30, height - 25);
}

async function loadData(options = {}) {
  try {
    const response = await fetch("./data/public-snapshot.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    setStatus(T.connected);
    renderDashboard();
  } catch (error) {
    if (!options.silent) setStatus(T.loadFail);
    console.error(error);
  }
}
async function loadSymbolDirectory() {
  try {
    const response = await fetch("./data/symbol-directory.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    symbolDirectory = payload && payload.symbols ? payload.symbols : {};
  } catch {
    symbolDirectory = {};
  }
}
function setupSymbolForm() {
  const form = el("#symbolForm");
  if (!form) return;
  const symbolInput = el("#symbolInput");
  const nameInput = el("#nameInput");
  const priceInput = el("#priceInput");
  const hint = el("#symbolHint");
  symbolInput.addEventListener("input", () => {
    if (String(nameInput.value || "").trim()) { updateSymbolHint(); return; }
    const symbol = normalizeSymbol(symbolInput.value);
    const resolved = nameLookup().get(symbol);
    if (resolved) nameInput.value = resolved;
    updateSymbolHint();
  });
  nameInput.addEventListener("input", updateSymbolHint);
  if (priceInput) priceInput.addEventListener("input", updateSymbolHint);
  if (hint) {
    hint.addEventListener("click", (event) => {
      const button = event.target.closest("[data-candidate-symbol]");
      if (!button) return;
      symbolInput.value = button.dataset.candidateSymbol || "";
      nameInput.value = button.dataset.candidateName || "";
      updateSymbolHint();
      symbolInput.focus();
    });
  }
  symbolInput.addEventListener("blur", async () => {
    if (String(nameInput.value || "").trim()) return;
    const symbol = normalizeSymbol(symbolInput.value);
    if (!symbol) return;
    const resolved = nameLookup().get(symbol) || await lookupNameFromWeb(symbol);
    if (resolved) nameInput.value = resolved;
    updateSymbolHint();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rawName = String(nameInput.value || "").trim();
    const symbol = normalizeSymbol(symbolInput.value) || symbolLookupByName(rawName);
    if (!symbol) { setStatus(T.enterSymbol); symbolInput.focus(); return; }
    const resolvedName = stripSymbolFromName(nameInput.value, symbol) || nameLookup().get(symbol) || await lookupNameFromWeb(symbol) || symbol;
    setStatus(`${symbol} \uc885\ubaa9\uc758 \uc6f9 \uc790\ub8cc\ub97c \uc870\ud68c\ud558\ub294 \uc911\uc785\ub2c8\ub2e4.`);
    const purchasePrice = Number(priceInput?.value || 0);
    const [quote, report] = await Promise.all([
      lookupQuote(symbol),
      lookupStockReport(symbol, purchasePrice)
    ]);
    const next = { symbol, name: resolvedName || rawName || symbol, purchasePrice, source: "user", addedAt: new Date().toISOString() };
    next.name = stripSymbolFromName(quote?.name, symbol) || resolvedName;
    if (report) {
      next.name = stripSymbolFromName(report.name, symbol) || next.name;
      next.report = report;
    }
    if (quote) {
      const base = next.report || directoryReport(symbol) || {};
      next.report = {
        ...base,
        ok: true,
        symbol,
        name: quote.name || next.name,
        market: quote.market || marketName(symbol),
        currentPrice: quote.currentPrice || base.currentPrice || "",
        watchlist: {
          ...(base.watchlist || {}),
          symbol,
          name: quote.name || next.name,
          market: quote.market || base.watchlist?.market || marketName(symbol),
          currentPrice: quote.currentPrice || base.watchlist?.currentPrice || "",
          signal: base.watchlist?.signal || T.mockReview,
          movingAverage: base.watchlist?.movingAverage || "",
          memo: base.watchlist?.memo || ""
        }
      };
    }
    state.userStocks = [next, ...state.userStocks.filter((item) => item.symbol !== symbol)].slice(0, 30);
    saveUserStocks();
    saveWebWatchlistInterest(next, "add");
    symbolInput.value = ""; nameInput.value = ""; if (priceInput) priceInput.value = "";
    updateSymbolHint();
    state.activeSection = "watchlist";
    document.querySelectorAll("[data-section]").forEach((item) => item.classList.toggle("active", item.dataset.section === "watchlist"));
    setStatus(`${symbol} ${T.added}`);
    renderDashboard();
  });
}
document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-section]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.activeSection = button.dataset.section;
    renderDashboard();
  });
});
setupBrowserStorageNotice();
loadUserStocks();
setupSymbolForm();
loadSymbolDirectory().finally(loadData);
setInterval(() => loadData({ silent: true }), DATA_REFRESH_MS);
setInterval(refreshVisibleQuotes, DATA_REFRESH_MS);
setInterval(updateSymbolHint, DATA_REFRESH_MS);
