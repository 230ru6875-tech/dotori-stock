const state = { data: null, dailyHistory: [], dotoriLearning: null, dotoriWeb: null, tossHoldings: null, sanghoe: null, todayCandidates: null, morningNotes: {}, activeSection: "watchlist", userStocks: [], selectedMovingSymbol: "", scannerMarketFirst: "domestic", scannerMarketFirstManual: false, scannerSectorFilter: "전체", growthSectorFilter: "전체", dailySearchQuery: "", dailyDateFrom: "", dailyDateTo: "", quotes: {}, liveQuoteCycle: 0, quoteRefreshInFlight: false, quoteRenderTimer: 0 };
const USER_STOCKS_KEY = "dotori.userStocks.v1";
const USER_KEY = "dotori.userKey.v1";
const USER_KEEP_ASKED_KEY = "dotori.keepAsked.v1";
const REPORT_STORE_KEY = "dotori.stockReports.v1";
const SIGNAL_FEED_HISTORY_KEY = "dotori.signalFeedHistory.v1";
const USER_STOCKS_MIGRATION_KEY = "dotori.userStocks.migration.v5";
const INITIAL_SERVER_SYMBOLS = new Set(["011070", "MU"]);
let symbolDirectory = {};
const DATA_REFRESH_MS = 5000;
const WATCHLIST_QUOTE_REFRESH_MS = 2000;
const DISPLAY_MARKET_LIMIT = 30;
const LIVE_QUOTE_BATCH_SIZE = 30;
const LIVE_QUOTE_MARKET_SPLIT = 15;
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
function setBrandUpdatedAt(iso) {
  const target = el("#brandUpdatedAt");
  if (!target) return;
  const text = fmtDateTimeSeconds(iso || new Date().toISOString());
  target.textContent = text && text !== "-" ? `(${text})` : "";
}
function latestUpdatedAt(...values) {
  let latest = "";
  let latestMs = 0;
  values.forEach((value) => {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = value;
    }
  });
  return latest;
}
function currentKstHourBuildLabel() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, timeZone: "Asia/Seoul"
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:00 / 1h-sync`;
}
function setBuildVersion() {
  const target = el("#buildVersion");
  if (!target) return;
  target.textContent = currentKstHourBuildLabel();
}
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function formatHermesPlanList(items) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 8).map((item) => {
    const name = String(item?.name || item?.symbol || "").trim();
    const symbol = String(item?.symbol || "").trim();
    if (!name && !symbol) return "";
    if (!symbol || name === symbol) return name || symbol;
    return `${name}(${symbol})`;
  }).filter(Boolean);
  return rows.length ? rows.join(", ") : "없음";
}
function renderHermesPlanLines() {
  const mount = el("#hermesPlanLines");
  if (!mount) return;
  const payload = state.todayCandidates || state.sanghoe || {};
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const buyRows = candidates.filter((item) => String(item?.sideRaw || "").toLowerCase() === "buy_candidate");
  const sellRows = candidates.filter((item) => String(item?.sideRaw || "").toLowerCase() === "sell_watch");
  const watchRows = candidates.filter((item) => {
    const side = String(item?.sideRaw || "").toLowerCase();
    return side && side !== "buy_candidate" && side !== "sell_watch";
  });
  mount.innerHTML = [
    `<p class="hero-plan-line"><span class="hero-plan-label">오늘의 매수 후보 :</span>${escapeHtml(formatHermesPlanList(buyRows))}</p>`,
    `<p class="hero-plan-line"><span class="hero-plan-label">오늘의 매도 후보 :</span>${escapeHtml(formatHermesPlanList(sellRows))}</p>`,
    `<p class="hero-plan-line"><span class="hero-plan-label">오늘의 관찰 후보 :</span>${escapeHtml(formatHermesPlanList(watchRows))}</p>`,
    payload.status === "BLOCKED" ? `<p class="hero-plan-note">최신 입력 무결성 검증 실패로 오늘 후보를 생성하지 않았습니다.</p>` : ""
  ].join("");
}
function setTabDebugState(section, count) {
  const target = el("#tabDebugState");
  if (!target) return;
  target.textContent = `${section || "-"} / ${Number(count || 0)}건`;
}
function renderCards(items, mapper) { return items.map(mapper).join(""); }
function renderMarketBrief() {}
function normalizeNewsText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function normalizeNewsUrl(value) {
  return String(value || "")
    .trim()
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}
function dedupeNewsItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const title = normalizeNewsText(item?.title);
    const summary = normalizeNewsText(item?.summary);
    const keys = [];
    if (title && summary) keys.push(`body:${title}||${summary}`);
    else if (title) keys.push(`title:${title}`);
    else if (summary) keys.push(`summary:${summary}`);
    if (!keys.length) return true;
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}
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
function normalizeSectorLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const normalized = raw.toLowerCase();
  const sectorMap = [
    ["ai software", "AI소프트웨어"], ["cyber security", "보안"], ["data center", "데이터센터"],
    ["ai semiconductor", "AI반도체"], ["ai chip", "AI반도체"], ["ai accelerator", "AI반도체"], ["gpu", "AI반도체"],
    ["semiconductor testing", "반도체검사"], ["semiconductor inspection", "반도체검사"],
    ["hbm", "메모리"], ["dram", "메모리"], ["nand", "메모리"], ["flash memory", "메모리"], ["memory", "메모리"],
    ["foundry", "파운드리"], ["fabless", "팹리스"], ["system semiconductor", "시스템반도체"],
    ["semiconductor equipment", "반도체장비"], ["semiconductor materials", "반도체소재"], ["semiconductor packaging", "반도체패키징"],
    ["반도체 장비", "반도체장비"], ["반도체 소재", "반도체소재"], ["반도체 패키징", "반도체패키징"], ["후공정", "반도체패키징"], ["전공정", "파운드리"],
    ["ai반도체", "AI반도체"], ["메모리반도체", "메모리"], ["메모리", "메모리"], ["파운드리", "파운드리"], ["팹리스", "팹리스"], ["시스템반도체", "시스템반도체"], ["반도체 검사", "반도체검사"],
    ["semiconductor", "반도체"], ["chip", "반도체"], ["llm", "인공지능"], ["machine learning", "인공지능"],
    ["investment bank", "증권"], ["brokerage", "증권"], ["capital markets", "증권"], ["asset management", "자산운용"], ["wealth management", "자산관리"],
    ["credit card", "카드"], ["consumer finance", "여신"], ["regional bank", "은행"], ["commercial bank", "은행"], ["internet bank", "인터넷은행"],
    ["life insurance", "생명보험"], ["property & casualty insurance", "손해보험"], ["손해보험", "손해보험"], ["생명보험", "생명보험"], ["인터넷은행", "인터넷은행"],
    ["자산운용", "자산운용"], ["자산관리", "자산관리"], ["여신", "여신"], ["카드", "카드"],
    ["finance", "금융"], ["financial", "금융"], ["bank", "은행"], ["insurance", "보험"], ["broker", "증권"], ["securities", "증권"],
    ["증권", "증권"], ["은행", "은행"], ["보험", "보험"], ["금융", "금융"],
    ["software as a service", "SaaS"], ["saas", "SaaS"], ["enterprise software", "소프트웨어"], ["security software", "보안"], ["semiconductor software", "반도체소프트웨어"],
    ["software", "소프트웨어"], ["cloud", "클라우드"], ["server", "서버"], ["network", "네트워크"], ["platform software", "플랫폼"], ["social media", "미디어플랫폼"], ["search engine", "인터넷플랫폼"], ["internet", "인터넷"], ["platform", "플랫폼"],
    ["e-commerce", "전자상거래"], ["marketplace", "전자상거래"], ["consumer staples", "필수소비재"], ["consumer discretionary", "경기관련소비재"], ["retail", "소매유통"], ["consumer", "소비재"],
    ["renewable", "신재생에너지"], ["solar", "태양광"], ["wind", "풍력"], ["nuclear", "원전"], ["power", "전력"], ["energy", "에너지"], ["oil", "정유"], ["gas", "가스"], ["utility", "유틸리티"],
    ["machinery", "기계"], ["factory automation", "공장자동화"], ["industrial", "산업재"], ["defence", "방산"], ["defense", "방산"], ["aerospace", "우주항공"], ["space", "우주항공"], ["robot", "로봇"], ["automation", "자동화"],
    ["diagnostics", "진단"], ["genomics", "유전체"], ["biosimilar", "바이오시밀러"], ["bio", "바이오"], ["biotech", "바이오"], ["pharma", "제약"], ["drug", "제약"], ["medical device", "의료기기"], ["healthcare", "헬스케어"], ["medical", "의료기기"], ["hospital", "의료"],
    ["wireless", "통신장비"], ["telecom", "통신"], ["communication", "통신"], ["advertising", "광고"], ["content", "콘텐츠"], ["streaming", "콘텐츠"], ["media", "미디어"], ["entertainment", "엔터테인먼트"],
    ["auto parts", "자동차부품"], ["mobility", "모빌리티"], ["autonomous driving", "자율주행"], ["automotive", "자동차"], ["auto", "자동차"], ["ev", "전기차"],
    ["cathode", "배터리소재"], ["anode", "배터리소재"], ["electrolyte", "배터리소재"], ["battery recycling", "배터리재활용"], ["battery equipment", "배터리장비"], ["battery material", "배터리소재"], ["battery", "배터리"], ["secondary battery", "2차전지"], ["lithium", "배터리소재"],
    ["chemical", "화학"], ["materials", "소재"], ["steel", "철강"], ["shipbuilding", "조선"], ["ship", "조선"], ["shipping", "해운"], ["logistics", "물류"], ["construction", "건설"], ["engineering", "건설엔지니어링"], ["real estate", "부동산"], ["reit", "리츠"],
    ["leisure", "레저"], ["travel", "여행"], ["hotel", "호텔"], ["airline", "항공"], ["restaurant", "외식"], ["food", "식품"], ["beverage", "음료"], ["cosmetic", "화장품"], ["fashion", "패션"], ["gaming", "게임"], ["game", "게임"], ["etf", "ETF"],
    ["보안", "보안"], ["클라우드", "클라우드"], ["서버", "서버"], ["네트워크", "네트워크"], ["소프트웨어", "소프트웨어"], ["플랫폼", "플랫폼"], ["전자상거래", "전자상거래"], ["미디어플랫폼", "미디어플랫폼"], ["데이터센터", "데이터센터"],
    ["필수소비재", "필수소비재"], ["경기관련소비재", "경기관련소비재"], ["정유", "정유"], ["가스", "가스"], ["전력", "전력"], ["원전", "원전"], ["태양광", "태양광"], ["풍력", "풍력"], ["신재생", "신재생에너지"], ["기계", "기계"], ["공장자동화", "공장자동화"],
    ["진단", "진단"], ["유전체", "유전체"], ["바이오시밀러", "바이오시밀러"], ["의료기기", "의료기기"], ["통신장비", "통신장비"], ["광고", "광고"], ["콘텐츠", "콘텐츠"], ["자동차부품", "자동차부품"], ["모빌리티", "모빌리티"], ["자율주행", "자율주행"],
    ["배터리소재", "배터리소재"], ["배터리장비", "배터리장비"], ["배터리재활용", "배터리재활용"], ["2차전지", "2차전지"], ["건설엔지니어링", "건설엔지니어링"], ["레저", "레저"], ["외식", "외식"]
  ];
  const found = sectorMap.find(([token]) => normalized.includes(token));
  return found ? found[1] : raw;
}
function normalizeSnapshotData(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const normalizeRow = (row) => {
    if (!row || typeof row !== "object") return row;
    const next = { ...row };
    if (next.sector) next.sector = normalizeSectorLabel(next.sector);
    if (next.sectorLabel) next.sectorLabel = normalizeSectorLabel(next.sectorLabel);
    if (next.theme) next.theme = normalizeSectorLabel(next.theme);
    if (Array.isArray(next.sections)) {
      next.sections = next.sections.map((section) => {
        if (!section || typeof section !== "object") return section;
        return { ...section, heading: section.heading ? normalizeSectorLabel(section.heading) : section.heading };
      });
    }
    return next;
  };
  const next = { ...payload };
  ["scanner", "watchlist", "movingAverages", "spikes", "growthDiscovery", "sectorOverview", "deepAnalysis", "morningNote", "newsList"].forEach((key) => {
    if (Array.isArray(next[key])) next[key] = next[key].map(normalizeRow);
  });
  return next;
}
function stripSymbolFromName(name, symbol) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const escaped = String(symbol || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`\\s*\\(?${escaped}\\)?\\s*$`, "i"), "").trim();
}
function hasHangul(value) {
  return /[가-힣]/.test(String(value || ""));
}
function staticSymbolNames() {
  return new Map([
    ["MRVL", "마벨 테크놀로지"],
    ["AVGO", "Broadcom"],
    ["MU", "\ub9c8\uc774\ud06c\ub860 \ud14c\ud06c\ub180\ub85c\uc9c0"],
    ["JPM", "제이피모건 체이스"],
    ["SNDK", "SanDisk"],
    ["ETN", "이튼"],
    ["GE", "GE Aerospace"],
    ["AMT", "American Tower"]
  ]);
}
function setPreferredName(map, symbol, name) {
  const normalized = normalizeSymbol(symbol);
  const cleanName = stripSymbolFromName(name || "", normalized);
  if (!normalized || !cleanName || cleanName === normalized) return;
  const current = map.get(normalized) || "";
  if (hasHangul(current) && !hasHangul(cleanName)) return;
  if (hasHangul(cleanName) || !current) map.set(normalized, cleanName);
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
    setPreferredName(map, symbol, item.name || "");
  });
  sources.forEach((item) => {
    if (!item || !item.symbol) return;
    const symbol = normalizeSymbol(item.symbol);
    setPreferredName(map, symbol, item.name || item.display_name || item.title || "");
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
function quoteMarketBucket(item) {
  const symbol = normalizeSymbol(item?.symbol);
  const market = displayMarket(item?.market || marketName(symbol));
  return /^\d{6}$/.test(symbol) || market === T.domestic ? "domestic" : "us";
}
function rotatingSlice(items, count) {
  if (!Array.isArray(items) || !items.length || count <= 0) return [];
  if (items.length <= count) return items.slice(0, count);
  const pageCount = Math.ceil(items.length / count);
  const page = state.liveQuoteCycle % pageCount;
  const start = page * count;
  return items.slice(start, start + count);
}
function pickLiveQuoteSymbols(active) {
  const prioritySymbols = uniqueSymbols(state.userStocks).slice(0, LIVE_QUOTE_BATCH_SIZE);
  if (prioritySymbols.length >= LIVE_QUOTE_BATCH_SIZE) return prioritySymbols;
  const remaining = (active || []).filter((item) => item && item.symbol);
  const seen = new Set(prioritySymbols);
  const addSymbol = (list, symbol) => {
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    list.push(symbol);
  };
  if (["scanner", "spikes"].includes(state.activeSection)) {
    const domestic = [];
    const us = [];
    const leftovers = [];
    remaining.forEach((item) => {
      const symbol = normalizeSymbol(item.symbol);
      if (!symbol || seen.has(symbol)) return;
      if (quoteMarketBucket(item) === "domestic") domestic.push(symbol);
      else us.push(symbol);
    });
    const activeBudget = LIVE_QUOTE_BATCH_SIZE - prioritySymbols.length;
    let domesticLimit = Math.min(domestic.length, Math.ceil(activeBudget / 2), LIVE_QUOTE_MARKET_SPLIT);
    let usLimit = Math.min(us.length, activeBudget - domesticLimit, LIVE_QUOTE_MARKET_SPLIT);
    if (domesticLimit + usLimit < activeBudget) {
      domesticLimit = Math.min(domestic.length, activeBudget - usLimit, LIVE_QUOTE_MARKET_SPLIT);
      usLimit = Math.min(us.length, activeBudget - domesticLimit, LIVE_QUOTE_MARKET_SPLIT);
    }
    rotatingSlice(domestic, domesticLimit).forEach((symbol) => addSymbol(leftovers, symbol));
    rotatingSlice(us, usLimit).forEach((symbol) => addSymbol(leftovers, symbol));
    [...domestic, ...us].forEach((symbol) => addSymbol(leftovers, symbol));
    return [...prioritySymbols, ...leftovers].slice(0, LIVE_QUOTE_BATCH_SIZE);
  }
  const activeSymbols = [];
  remaining.forEach((item) => addSymbol(activeSymbols, normalizeSymbol(item.symbol)));
  return [...prioritySymbols, ...activeSymbols].slice(0, LIVE_QUOTE_BATCH_SIZE);
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
function scheduleQuoteRender() {
  if (state.quoteRenderTimer) return;
  state.quoteRenderTimer = window.setTimeout(() => {
    state.quoteRenderTimer = 0;
    renderDashboard();
    updateSymbolHint();
  }, 120);
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
async function lookupQuoteBatch(symbols) {
  const normalized = Array.from(new Set((symbols || []).map((symbol) => normalizeSymbol(symbol)).filter(Boolean))).slice(0, LIVE_QUOTE_BATCH_SIZE);
  if (!normalized.length) return {};
  try {
    const response = await fetch(`/api/quote?symbols=${encodeURIComponent(normalized.join(","))}`, { cache: "no-store" });
    if (!response.ok) return {};
    if (!String(response.headers.get("content-type") || "").includes("application/json")) return {};
    const payload = await response.json();
    if (!payload || !payload.ok || !payload.batch || typeof payload.quotes !== "object") return {};
    return payload.quotes || {};
  } catch {
    return {};
  }
}
async function refreshExchangeRateOnAccess() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const value = Number(payload?.rates?.KRW);
    if (!Number.isFinite(value) || value <= 0) return;
    state.data.exchangeRate = {
      label: "오늘의 환율",
      value: `${value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`,
      change: "접속 시 실시간 기준",
      updatedAt: new Date().toISOString(),
      source: "ExchangeRate-API USD/KRW",
      note: "사용자 접속 시 환율을 추가 갱신했습니다."
    };
    renderDashboard();
  } catch {
    // Keep the last verified snapshot when the external rate endpoint is unavailable.
  }
}
async function saveWebWatchlistInterest(item, action = "add") {
  return Promise.resolve({ ok: true, localOnly: true, symbol: item?.symbol || "", action });
}
async function refreshUserStockReports() {
  if (!state.userStocks.length) return;
  const quoteMap = await lookupQuoteBatch(state.userStocks.map((item) => item.symbol));
  const refreshed = await Promise.all(state.userStocks.map(async (item) => {
    const quote = quoteMap[normalizeSymbol(item.symbol)] || await lookupQuote(item.symbol);
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
  if (state.quoteRefreshInFlight) return;
  const data = state.data || {};
  const sections = mergedSections(data);
  const active = sections[state.activeSection] || sections.watchlist || [];
  const symbols = pickLiveQuoteSymbols(active);
  if (!symbols.length) return;
  state.quoteRefreshInFlight = true;
  let changed = false;
  try {
    if (state.activeSection === "watchlist") {
      const watchSymbols = uniqueSymbols(state.userStocks).slice(0, LIVE_QUOTE_BATCH_SIZE);
      const quoteMap = await lookupQuoteBatch(watchSymbols);
      Object.entries(quoteMap).forEach(([symbol, quote]) => {
        if (!quote) return;
        state.quotes[normalizeSymbol(symbol)] = quote;
        changed = true;
      });
      if (changed) {
        scheduleQuoteRender();
      }
      return;
    }
    await Promise.allSettled(symbols.map(async (symbol) => {
      const quote = await lookupQuote(symbol);
      if (!quote) return;
      state.quotes[symbol] = quote;
      changed = true;
      if (state.activeSection === "watchlist") scheduleQuoteRender();
    }));
    if (["scanner", "spikes"].includes(state.activeSection)) state.liveQuoteCycle += 1;
    if (changed && state.activeSection !== "watchlist") {
      renderDashboard();
      updateSymbolHint();
    }
  } finally {
    state.quoteRefreshInFlight = false;
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
    card.innerHTML = `<h3>성장주 찾기</h3><p>실적·가격 흐름·거래량·뉴스 단서를 함께 보며 성장 후보를 나눕니다. 국내 후보에는 PER·ROE·시가총액·외국인 비중을 이용한 로컬 성장·가치 프록시를 표시합니다.</p>`;
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
function marketGroupLabel(item) {
  const symbol = normalizeSymbol(item?.symbol || "");
  const market = String(item?.market || marketName(symbol) || "").trim();
  if (/^\d{6}$/.test(symbol) || market === T.domestic || market === "\uad6d\ub0b4") return "\uad6d\ub0b4";
  return "\ubbf8\uad6d";
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
function withLabelPrefix(label, text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.startsWith(label) ? value : `${label} ${value}`;
}
function valuationSummaryText(item) {
  const valuation = valuationFromItem(item);
  if (!valuation) return "";
  const parts = [
    valuation.buyFocus || "매수 판단: PBR 확인 필요",
    valuation.sellFocus || "매도 판단: PSR 확인 필요",
    valuation.pbr ? `PBR ${valuation.pbr}` : "",
    valuation.psr ? `매도 지표 PSR ${valuation.psr}` : "매도 지표 PSR 확인 필요",
    valuation.per ? `PER ${valuation.per}` : "",
    valuation.fcf ? `FCF ${valuation.fcf}` : "",
    valuation.debtRatio ? `부채비율 ${valuation.debtRatio}%` : "",
    valuation.evEbitda ? `EV/EBITDA ${valuation.evEbitda}` : ""
  ].filter(Boolean);
  const summary = [valuation.summary, valuation.note].filter(Boolean).join(" / ");
  if (!parts.length && !summary) return "";
  return `${parts.join(" / ")}${parts.length && summary ? " / " : ""}${summary}`;
}
function valuationSummaryHtml(item) {
  const text = valuationSummaryText(item);
  return text ? `<p class="valuation-line"><strong>밸류에이션:</strong> ${escapeHtml(text)}</p>` : "";
}
function fairValueFromItem(item) {
  return item?.fairValue || item?.analysis?.fairValue || item?.watchlist?.fairValue || item?.report?.fairValue || item?.report?.watchlist?.fairValue || item?.report?.analysis?.fairValue || null;
}
function fairValueSummaryText(item) {
  const fair = fairValueFromItem(item);
  if (!fair) return "";
  const currentPrice = item?.watchlist?.currentPrice || item?.currentPrice || item?.report?.watchlist?.currentPrice || item?.report?.currentPrice || "";
  const hasBand = fair.conservative || fair.neutral || fair.growth;
  const parts = hasBand
    ? [
        fair.conservative ? `보수 ${formatDisplayPrice(fair.conservative, item)}` : "",
        fair.neutral ? `중립 ${formatDisplayPrice(fair.neutral, item)}` : "",
        fair.growth ? `성장 ${formatDisplayPrice(fair.growth, item)}` : "",
        currentPrice ? `현재가 ${formatDisplayPrice(currentPrice, item)}` : "",
        fair.summary || ""
      ].filter(Boolean)
    : [
        currentPrice ? `현재가 ${formatDisplayPrice(currentPrice, item)}` : "",
        "PBR 또는 현재가 확인 필요",
        fair.summary || ""
      ].filter(Boolean);
  return parts.join(" / ");
}
function fairValueSummaryHtml(item) {
  const text = fairValueSummaryText(item);
  return text ? `<p class="fair-line"><strong>적정주가:</strong> ${escapeHtml(text)}</p>` : "";
}
function technicalFromItem(item) {
  return item?.technical || item?.analysis?.technical || item?.watchlist?.technical || item?.report?.technical || item?.report?.watchlist?.technical || item?.report?.analysis?.technical || null;
}
function technicalSummaryText(item) {
  const tech = technicalFromItem(item);
  if (!tech) return "";
  const stochastic = tech.stochastic || {};
  const volume = tech.volume || {};
  const stochasticParts = [
    withLabelPrefix("스토캐스틱", stochastic.signal || "확인 필요"),
    stochastic.k ? `K ${stochastic.k}` : "",
    stochastic.d ? `D ${stochastic.d}` : ""
  ].filter(Boolean).join(" / ");
  const volumeParts = [
    withLabelPrefix("거래량", volume.signal || "확인 필요"),
    volume.ratio ? `20일평균대비 ${volume.ratio}` : "",
    volume.latest ? `최근 ${volume.latest}` : "",
    volume.average20 ? `평균 ${volume.average20}` : ""
  ].filter(Boolean).join(" / ");
  const parts = [
    stochasticParts,
    volumeParts
  ].filter(Boolean);
  return parts.join(" / ");
}
function technicalSummaryHtml(item) {
  const text = technicalSummaryText(item);
  return text ? `<p class="technical-line"><strong>기술지표:</strong> ${escapeHtml(text)}</p>` : "";
}
function bestFairValueText(item) {
  const fair = fairValueSummaryText(item);
  if (fair) return fair;
  const researchSummary = item?.researchRequest?.summary || item?.report?.researchRequest?.summary || "";
  const current = item?.currentPrice ? `현재가 ${formatDisplayPrice(item.currentPrice, item)}` : "";
  const predRange = item?.predRange ? `예측 ${formatDisplayPriceRange(item.predRange, item)}` : "";
  return [current, predRange, researchSummary || "PBR 또는 현재가 확인 필요"].filter(Boolean).join(" / ");
}
function bestTechnicalText(item) {
  const tech = technicalSummaryText(item);
  if (tech) return tech;
  const researchSummary = item?.researchRequest?.summary || item?.report?.researchRequest?.summary || "";
  const moving = item?.report?.moving || item?.moving || null;
  const current = item?.currentPrice ? `현재가 ${formatDisplayPrice(item.currentPrice, item)}` : "";
  const ma20 = moving?.ma20 ? `20일선 ${formatDisplayPrice(moving.ma20, item)}` : "";
  const ma60 = moving?.ma60 ? `60일선 ${formatDisplayPrice(moving.ma60, item)}` : "";
  const decision = moving?.decision ? `판단 ${moving.decision}` : "";
  const fallback = [current, ma20, ma60, decision].filter(Boolean);
  if (fallback.length) return `${fallback.join(" / ")} / ${researchSummary || "스토캐스틱 확인 필요 / 거래량 확인 필요"}`;
  return researchSummary || "스토캐스틱 확인 필요 / 거래량 확인 필요";
}
function bestValuationText(item) {
  const valuation = valuationSummaryText(item);
  if (valuation) return valuation;
  const researchSummary = item?.researchRequest?.summary || item?.report?.researchRequest?.summary || "";
  const current = item?.currentPrice ? `현재가 ${formatDisplayPrice(item.currentPrice, item)}` : "";
  return [current, researchSummary || "매수 판단: PBR 확인 필요 / 매도 판단: PSR 확인 필요 / 매도 지표 PSR 확인 필요"].filter(Boolean).join(" / ");
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
function macroEventRiskFromItem(item) {
  return item?.macroEventRisk || item?.analysis?.macroEventRisk || item?.watchlist?.macroEventRisk || item?.report?.macroEventRisk || item?.report?.watchlist?.macroEventRisk || item?.report?.analysis?.macroEventRisk || null;
}
function macroEventRiskSummaryText(item) {
  const risk = macroEventRiskFromItem(item);
  if (!risk || !risk.summary || risk.level === "대기") return "";
  return risk.summary;
}
function macroEventRiskSummaryHtml(item) {
  const risk = macroEventRiskFromItem(item);
  const text = macroEventRiskSummaryText(item);
  if (!text) return "";
  const cls = risk?.level === "23시 추가 급락주의" ? "crash-alert critical" : "macro-line";
  return `<p class="${cls}">PPI 이벤트: ${escapeHtml(text)}</p>`;
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
function spikeReasonFromItem(item) {
  const symbol = normalizeSymbol(item?.symbol || "");
  if (!symbol) return null;
  const data = state.data || {};
  const rows = [
    ...(data.spikes || []),
    ...(data.deepAnalysis || []),
    ...(data.scanner || []),
    ...(data.movingAverages || []),
    item?.report?.watchlist,
    item?.report
  ].filter((row) => normalizeSymbol(row?.symbol || "") === symbol);
  const risk = crashRiskFromItem(item);
  const reasons = [];
  const spike = rows.find((row) => row && (row.change || /급등|급락|하락|폭락|상승/.test(`${row.range || ""} ${row.note || ""}`)));
  if (spike) {
    const direction = spikeDirection(spike);
    const label = direction === "down" ? "급락" : "급등";
    const change = spike.change ? `등락률 ${spike.change}` : "";
    const note = String(spike.note || "").split(" / ").slice(0, 2).join(" / ");
    reasons.push(`${label} 감지${change ? `: ${change}` : ""}${note ? ` / ${note}` : ""}`);
  }
  if (risk && risk.level && risk.level !== "주의보 없음") {
    const riskReasons = Array.isArray(risk.reasons) ? risk.reasons.slice(0, 2).join(" / ") : (risk.summary || "");
    reasons.push(`하락 위험: ${risk.level}${riskReasons ? ` / ${riskReasons}` : ""}`);
  }
  const tech = technicalSummaryText(item);
  if (tech) reasons.push(`기술: ${tech}`);
  const macro = macroEventRiskSummaryText(item);
  if (macro) reasons.push(`이벤트: ${macro}`);
  const unique = [...new Set(reasons.filter(Boolean))].slice(0, 3);
  if (!unique.length) return null;
  return unique.join(" / ");
}
function spikeReasonHtml(item) {
  const text = spikeReasonFromItem(item);
  if (!text) return "";
  const direction = spikeDirection(item);
  const cls = direction === "down" ? "spike-reason down-reason" : "spike-reason up-reason";
  return `<p class="${cls}"><strong>급등락 분석:</strong> ${escapeHtml(text)}</p>`;
}
function analysisSummaryBlockHtml(item) {
  const lines = [
    {
      cls: `analysis-row spike-row ${spikeDirection(item) === "down" ? "down-reason" : "up-reason"}`,
      label: "급등락 분석",
      text: spikeReasonFromItem(item) || "기술: 스토캐스틱 확인 필요 / 거래량 확인 필요"
    },
    {
      cls: "analysis-row fair-row",
      label: "적정주가",
      text: bestFairValueText(item)
    },
    {
      cls: "analysis-row technical-row",
      label: "기술지표",
      text: bestTechnicalText(item)
    },
    {
      cls: "analysis-row valuation-row",
      label: "밸류에이션",
      text: bestValuationText(item)
    }
  ];
  return `<div class="analysis-summary-block">${lines.map((row) => `<div class="${row.cls}"><strong>${row.label}:</strong> ${escapeHtml(row.text)}</div>`).join("")}</div>`;
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
function spikeDirection(item) {
  const text = `${item?.change || ""} ${item?.range || ""} ${item?.signal || ""} ${item?.note || ""}`;
  const change = parseNumber(item?.change);
  if (change < 0 || /급락|하락|폭락|하한|약세|매도|위험|이탈/.test(text)) return "down";
  return "up";
}
function signalSide(value) {
  const text = String(value || "");
  if (/\ub9e4\ub3c4|\uc704\ud5d8|\uc774\ud0c8|\uc190\uc808|\uc8fc\uc758|\ud3ed\ub77d|\uae09\ub77d/i.test(text)) return "sell";
  if (/\ub9e4\uc218|\uc0c1\uc2b9|\uac15\ud55c|\uc9c4\uc785|\ud68c\ubcf5|\ubcf4\uc720|\uac80\ud1a0/i.test(text)) return "buy";
  return "";
}
function normalizedDisplayName(item, lookup = null) {
  const symbol = normalizeSymbol(item?.symbol || "");
  const raw = item?.name || item?.title || item?.displayName || symbol || "-";
  const lookupName = symbol && lookup ? lookup.get(symbol) : "";
  const stripped = lookupName || stripSymbolFromName(raw, symbol) || raw;
  return symbol ? `${stripped}(${symbol})` : stripped;
}
function signalLabelForItem(item, fallback = "\ub9e4\uc218") {
  const crashRisk = crashRiskFromItem(item);
  const macroRisk = macroEventRiskFromItem(item);
  if (macroRisk?.level === "23시 추가 급락주의") return "23시 추가 급락주의";
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
function holdingReturnPct(item) {
  const purchase = Number(item?.purchasePrice || 0);
  const current = parseNumber(item?.currentPrice);
  if (purchase <= 0 || current <= 0) return null;
  return ((current - purchase) / purchase) * 100;
}
function holdingSignalFeedActionLabel(item) {
  const pct = holdingReturnPct(item);
  const crashRisk = crashRiskFromItem(item);
  const riskLevel = String(crashRisk?.level || "");
  if (pct === null) return "";
  if (pct >= 12) return "매도/관찰";
  if (pct >= 5) return "부분매도/관찰";
  if (/폭락주의보|급락경계/.test(riskLevel)) return "보유/관찰";
  if (pct <= -10) return "보유/관찰";
  if (pct <= -4) return "보유/관찰";
  if (Math.abs(pct) <= 2) return "보유/변동성확대";
  return "보유/관찰";
}
function signalFeedActionLabel(item) {
  const crashRisk = crashRiskFromItem(item);
  const holdingLabel = holdingSignalFeedActionLabel(item);
  if (holdingLabel) return holdingLabel;
  if (crashRisk?.level === "폭락주의보") return "폭락주의보";
  if (crashRisk?.level === "급락경계") return "급락경계";
  const type = signalFeedType(item?.feedLabel);
  if (type === "sell") return "\ub9e4\ub3c4/\uc8fc\uc758";
  if (type === "hold") return Number(item?.purchasePrice || 0) > 0 ? "\ubcf4\uc720/\uad00\uc2ec" : "\uad00\uc2ec/\uad00\ucc30";
  return "\ub9e4\uc218";
}
function signalForPurchaseState(signal, hasPrice, fallback = "\uad00\uc2ec/\uad00\ucc30") {
  const text = String(signal || "").trim();
  if (hasPrice) return text || fallback;
  if (/\ubcf4\uc720|\ub9e4\ub3c4|\ube44\uc911\ucd95\uc18c/.test(text)) return fallback;
  return text || fallback;
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
function kstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
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
function isDomesticMarketOpen(date = new Date()) {
  const { weekday, minutes } = kstParts(date);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  return isWeekday && minutes >= DOMESTIC_MARKET_START_KST_MINUTES && minutes <= DOMESTIC_MARKET_END_KST_MINUTES + MARKET_CLOSE_GRACE_MINUTES;
}
function effectiveScannerMarketFirst() {
  if (!state.scannerMarketFirstManual) {
    state.scannerMarketFirst = isDomesticMarketOpen() ? "domestic" : "us";
  }
  return state.scannerMarketFirst;
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
  const displayNames = nameLookup();
  const body = items.map((item) => `${normalizedDisplayName(item, displayNames)} ${signalFeedActionLabel(item)}`).join(", ");
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

function scannerDataBySymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  const rows = Array.isArray(state.data?.scanner) ? state.data.scanner : [];
  return rows.find((row) => normalizeSymbol(row?.symbol) === normalized) || null;
}

function dedupeRowsBySymbol(rows) {
  const seen = new Set();
  const output = [];
  for (const row of rows || []) {
    const symbol = normalizeSymbol(row?.symbol || "");
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    output.push(row);
  }
  return output;
}

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
    return { ...base, name: resolvedName, market: displayMarket(base.market || marketName(item.symbol)), currentPrice: current, purchasePrice: price, signal: signalForPurchaseState(base.signal, hasPrice), crashRisk: base.crashRisk || directory?.crashRisk || report?.crashRisk, memo: memoParts.filter(Boolean).join(" / "), userAdded: true };
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

function tossHoldingToWatchlist(item) {
  const symbol = normalizeSymbol(item?.symbol || "");
  const name = stripSymbolFromName(item?.name, symbol) || symbol;
  const currentPrice = Number(item?.current_price);
  const purchasePrice = Number(item?.avg_price);
  if (!symbol || !name || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const quantity = Number(item?.quantity);
  const pnl = Number(item?.pnl);
  const pnlPct = Number(item?.pnl_pct);
  const memo = [
    Number.isFinite(quantity) ? `수량 ${quantity.toLocaleString("ko-KR")}주` : "",
    Number.isFinite(pnl) ? `평가손익 ${pnl >= 0 ? "+" : ""}${pnl.toLocaleString("ko-KR")} ${item.currency || ""}` : "",
    Number.isFinite(pnlPct) ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : ""
  ].filter(Boolean).join(" / ");
  return {
    symbol,
    name,
    market: marketName(symbol),
    currentPrice,
    purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : 0,
    signal: "보유",
    movingAverage: "토스 보유종목",
    memo,
    hasPrice: true,
    tossHolding: true,
    userAdded: false
  };
}

function userStockToScanner(item) {
  const price = Number(item.purchasePrice || 0);
  const report = item.report || directoryReport(item.symbol) || {};
  const liveScanner = scannerDataBySymbol(item.symbol) || {};
  const scanner = report.scanner || {};
  const watch = userStockToWatchlist(item);
  const resolvedName = stripSymbolFromName(item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
  const summary = liveScanner.summary || scanner.summary || watch.memo || "";
  const risk = liveScanner.risk || scanner.risk || watch.movingAverage || watch.memo || "";
  const evidence = liveScanner.evidence || {
    title: "근거 단서",
    clues: [summary || `${resolvedName} 관련 공개 데이터 확인 중입니다.`].filter(Boolean),
    confirmations: [risk || "현재가와 예측범위, 추세 신호를 함께 확인합니다."],
    stance: risk || "관찰 우선"
  };
  return {
    ...liveScanner,
    ...scanner,
    symbol: item.symbol,
    name: resolvedName,
    market: watch.market || liveScanner.market || scanner.market || marketName(item.symbol),
    currentPrice: watch.currentPrice || liveScanner.currentPrice || scanner.currentPrice || report.currentPrice || "",
    signal: signalForPurchaseState(liveScanner.signal || scanner.signal || watch.signal || T.preview, price > 0),
    sentiment: liveScanner.sentiment || scanner.sentiment || watch.signal || "",
    predRange: liveScanner.predRange || scanner.predRange || report.watchlist?.predRange || directoryReport(item.symbol)?.scanner?.predRange || "",
    summary,
    risk,
    evidence,
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
    const price = Number(item.purchasePrice || 0);
    return {
      currentPrice: directory.watchlist?.currentPrice || directory.currentPrice || "",
      note: directory.watchlist?.memo || directory.moving.note || "",
      ...directory.moving,
      decision: signalForPurchaseState(directory.moving.decision, price > 0, "\uad00\ucc30\ub300\uae30"),
    };
  }
  if (item.report && item.report.moving) {
    const price = Number(item.purchasePrice || 0);
    return {
      currentPrice: item.report.watchlist?.currentPrice || item.report.currentPrice || "",
      note: item.report.watchlist?.memo || item.report.moving.note || "",
      ...item.report.moving,
      decision: signalForPurchaseState(item.report.moving.decision, price > 0, "\uad00\ucc30\ub300\uae30"),
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
  const price = Number(item.purchasePrice || 0);
  const watch = userStockToWatchlist(item);
  const moving = userStockToMoving(item);
  const scanner = item.report?.scanner || directory?.scanner || {};
  const resolvedName = stripSymbolFromName(item.name, item.symbol) || nameLookup().get(item.symbol) || item.symbol;
  const baseAnalysis = item.report?.analysis || directory?.analysis || null;
  if (baseAnalysis && Array.isArray(baseAnalysis.sections)) {
    return {
      ...baseAnalysis,
      symbol: item.symbol,
      name: resolvedName,
      market: displayMarket(watch.market || marketName(item.symbol)),
      currentPrice: watch.currentPrice || item.report?.currentPrice || directory?.currentPrice || "",
      purchasePrice: price,
      title: `${resolvedName}(${item.symbol}) 분석결과`,
      kind: "watchlist-analysis",
      summary: baseAnalysis.summary || baseAnalysis.body || `${resolvedName} 관심종목의 분석 결과입니다.`,
      userAdded: true
    };
  }
  const current = watch.currentPrice || item.report?.currentPrice || directory?.currentPrice || "";
  const signal = watch.signal || scanner.signal || moving.decision || T.preview;
  const predRange = scanner.predRange || directory?.scanner?.predRange || directory?.watchlist?.predRange || watch.predRange || "-";
  const movingText = moving.decision || watch.movingAverage || moving.note || "-";
  const memo = [watch.memo, moving.note, scanner.summary].filter(Boolean).join(" / ");
  const purchaseLine = price > 0 ? `구입가 ${formatDisplayPrice(price, item)} 기준으로 현재가와 신호를 비교합니다.` : "구입가가 없으므로 현재가·신호·이평선 중심으로 관찰합니다.";
  const stance = /매수|진입|회복|보유/.test(`${signal} ${movingText}`)
    ? "정찰 또는 보유 관점은 가능하지만, 저점 방어와 거래량 확인 후 분할 접근합니다."
    : /매도|훼손|이탈|주의|위험/.test(`${signal} ${movingText}`)
      ? "신규 매수는 보류하고 손절선·이전 고점 회복 여부를 먼저 확인합니다."
      : "바로 매수하지 말고 다음 갱신에서 가격·거래량·이평선 변화를 확인합니다.";
  return {
    title: `${resolvedName}(${item.symbol}) 분석결과`,
    kind: "watchlist-analysis",
    symbol: item.symbol,
    name: resolvedName,
    market: displayMarket(watch.market || marketName(item.symbol)),
    currentPrice: current,
    purchasePrice: price,
    signal,
    summary: `${resolvedName} 관심종목의 현재가, 예측범위, 이평선 신호를 정리합니다.`,
    sections: [
      {
        heading: "현재 판단",
        items: [
          `현재가: ${formatDisplayPrice(current, item) || "-"}`,
          `신호: ${signal || "-"}`,
          `예측범위: ${formatDisplayPriceRange(predRange, item) || predRange || "-"}`,
          purchaseLine
        ]
      },
      {
        heading: "이평선·추세 확인",
        items: [
          `이평선 판단: ${movingText || "-"}`,
          `근거: ${memo || "도토리컴 수집 자료가 갱신되면 분석 근거가 보강됩니다."}`
        ]
      },
      {
        heading: "예측과 대응",
        items: [
          stance,
          "3파트 자동매매 후보로 넘기기 전에는 2파트 모의검증, 4파트 가격밴드, 7파트 이평선 신호를 함께 확인합니다."
        ]
      }
    ],
    userAdded: true
  };
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
  const realOhlc = Array.isArray(item.ohlc)
    ? item.ohlc.map((row) => ({
        date: row.date || "",
        open: parseNumber(row.open),
        high: parseNumber(row.high),
        low: parseNumber(row.low),
        close: parseNumber(row.close),
        volume: parseNumber(row.volume)
      })).filter((row) => row.close > 0 && row.high > 0 && row.low > 0)
    : [];
  const hasRealOhlc = realOhlc.length >= 5;
  const fallbackCloseSeries = Array.from({ length: 48 }, (_, index) => {
    const amp = current * 0.032;
    const wave = Math.sin((index + seed / 17) / 4) * amp + Math.cos(index / 7) * amp * 0.55;
    const trend = (index - 24) * -current * 0.0012;
    const dip = index > 16 && index < 29 ? -amp * 1.4 : 0;
    return current + wave + trend + dip;
  });
  const ohlcRows = hasRealOhlc ? realOhlc : fallbackCloseSeries.map((close, index) => {
    const prevClose = fallbackCloseSeries[Math.max(0, index - 1)];
    const open = index === 0 ? prevClose : (prevClose + close) / 2;
    return {
      date: "",
      open,
      high: Math.max(open, close) + current * (0.005 + ((index + seed) % 4) * 0.001),
      low: Math.min(open, close) - current * (0.005 + ((index + seed + 2) % 4) * 0.001),
      close,
      volume: 0
    };
  });
  const closeSeries = ohlcRows.map((row) => row.close);
  const rawLow = Math.min(...ohlcRows.map((row) => row.low), current);
  const rawHigh = Math.max(...ohlcRows.map((row) => row.high), current);
  const pad = Math.max((rawHigh - rawLow) * 0.08, current * 0.01, 1);
  const low = rawLow - pad;
  const high = rawHigh + pad;
  const toX = (index, count) => left + (plotWidth / Math.max(count - 1, 1)) * index;
  const toY = (value) => top + ((high - value) / Math.max(high - low, 1)) * plotHeight;
  const heikinRows = [];
  ohlcRows.forEach((row, index) => {
    const haClose = (row.open + row.high + row.low + row.close) / 4;
    const prevHa = index > 0 ? heikinRows[index - 1] : null;
    const haOpen = prevHa ? (prevHa.open + prevHa.close) / 2 : (row.open + row.close) / 2;
    heikinRows.push({
      open: haOpen,
      close: haClose,
      high: Math.max(row.high, haOpen, haClose),
      low: Math.min(row.low, haOpen, haClose)
    });
  });
  const candleStep = plotWidth / Math.max(heikinRows.length - 1, 1);
  const candleWidth = Math.max(3, candleStep * 0.52);
  const candleSkip = Math.max(1, Math.ceil(heikinRows.length / 34));
  const heikinCandles = heikinRows.map((row, index) => ({ row, sourceIndex: index })).filter(({ sourceIndex }) => sourceIndex % candleSkip === 0 || sourceIndex === heikinRows.length - 1).map(({ row, sourceIndex }) => {
    const x = toX(sourceIndex, heikinRows.length);
    const yHigh = toY(row.high);
    const yLow = toY(row.low);
    const yOpen = toY(row.open);
    const yClose = toY(row.close);
    const y = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(3, Math.abs(yClose - yOpen));
    const cls = row.close >= row.open ? "ha-up" : "ha-down";
    return `<line x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}" class="ha-wick ${cls}"/><rect x="${(x - candleWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="1.5" class="ha-body ${cls}"/>`;
  }).join("");
  const movingAveragePoints = (windowSize) => closeSeries.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = closeSeries.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / Math.max(slice.length, 1);
  }).map((value, index) => `${toX(index, closeSeries.length).toFixed(1)},${toY(value).toFixed(1)}`).join(" ");
  const dynamicPoints = closeSeries.map((value, index) => {
    const start = Math.max(0, index - 5);
    const slice = closeSeries.slice(start, index + 1);
    const avg = slice.reduce((sum, val) => sum + val, 0) / Math.max(slice.length, 1);
    return `${toX(index, closeSeries.length).toFixed(1)},${toY(avg).toFixed(1)}`;
  }).join(" ");
  const labels = [high, low + (high - low) * 0.75, low + (high - low) * 0.5, low + (high - low) * 0.25, low].map((value, index) => {
    const y = top + (plotHeight / 4) * index;
    return `<text x="12" y="${(y + 4).toFixed(1)}" class="ma-axis">${escapeHtml(formatDisplayPrice(value, item))}</text><line x1="${left}" y1="${y.toFixed(1)}" x2="${left + plotWidth}" y2="${y.toFixed(1)}" class="ma-grid"/>`;
  }).join("");
  const closePoints = closeSeries.map((value, index) => `${toX(index, closeSeries.length).toFixed(1)},${toY(value).toFixed(1)}`).join(" ");
  const sourceLabel = hasRealOhlc ? "OHLC" : "\ucd94\uc815";
  return `<svg class="ma-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="moving average and heikin ashi chart"><text x="54" y="18" class="ma-title">${escapeHtml(item.name || item.symbol)}(${escapeHtml(item.symbol || "")}) \uc774\ud3c9\uc120 + \ud558\uc774\ud0a8\uc544\uc2dc</text><g class="ma-legend"><text x="224" y="18">${escapeHtml(sourceLabel)}</text><text x="286" y="18">\uc885\uac00</text><text x="336" y="18">20\uc77c</text><text x="392" y="18">60\uc77c</text><text x="452" y="18">\ub3d9\uc801</text><text x="510" y="18">\ub370\ub4dc</text></g>${labels}<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="ma-border"/><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="ma-border"/><g class="ha-layer">${heikinCandles}</g><polyline points="${closePoints}" class="ma-close"/><polyline points="${movingAveragePoints(20)}" class="ma-line ma-fast"/><polyline points="${movingAveragePoints(60)}" class="ma-line ma-mid"/><polyline points="${dynamicPoints}" class="ma-line ma-slow"/><line x1="${(left + plotWidth * 0.38).toFixed(1)}" y1="${top}" x2="${(left + plotWidth * 0.38).toFixed(1)}" y2="${top + plotHeight}" class="ma-dead"/><line x1="${(left + plotWidth * 0.90).toFixed(1)}" y1="${top}" x2="${(left + plotWidth * 0.90).toFixed(1)}" y2="${top + plotHeight}" class="ma-dead"/><circle cx="${toX(closeSeries.length - 1, closeSeries.length).toFixed(1)}" cy="${toY(closeSeries[closeSeries.length - 1]).toFixed(1)}" r="4" class="ma-dot"/><text x="${(left + plotWidth * 0.39).toFixed(1)}" y="${toY(low + (high - low) * 0.85).toFixed(1)}" class="ma-dead-label">\ub370\ub4dc</text></svg>`;
}
function heikinAshiDecision(item) {
  const text = `${item.decision || ""} ${item.note || ""} ${item.movingAverage || ""}`;
  if (/\ub9e4\ub3c4|\ucd94\uc138\ud6fc\uc190|\uc774\ud0c8|\uc704\ud5d8|\uac10\uc810/i.test(text)) {
    return { label: "\ud558\uc774\ud0a8\uc544\uc2dc: \uc74c\ubd09 \uc6b0\uc138", memo: "\uc5f0\uc18d \uc74c\ubd09\uc73c\ub85c \ubcf4\uc774\ub294 \uad6c\uac04\uc740 \ubc18\ub4f1 \uc804\uae4c\uc9c0 \ucd94\uaca9 \uc9c4\uc785\uc744 \uc904\uc785\ub2c8\ub2e4." };
  }
  if (/\ub9e4\uc218|\uc9c4\uc785|\uc0c1\uc2b9|\ud68c\ubcf5|\ubcf4\uc720/i.test(text)) {
    return { label: "\ud558\uc774\ud0a8\uc544\uc2dc: \uc591\ubd09 \uc720\uc9c0", memo: "\uc591\ubd09 \uc720\uc9c0 \uad6c\uac04\uc740 \ub2e8\ud0c0 \uc9c4\uc785 \ud6c4 \uc190\uc808\uc120\ub9cc \uc9e7\uac8c \ud655\uc778\ud569\ub2c8\ub2e4." };
  }
  return { label: "\ud558\uc774\ud0a8\uc544\uc2dc: \uc804\ud658 \uad00\ucc30", memo: "\uc0c9\uc774 \uc790\uc8fc \ubc14\ub00c\ub294 \uad6c\uac04\uc740 \uc774\ud3c9\uc120 \uc704\uce58\uc640 \uac70\ub798\ub7c9\uc744 \uac19\uc774 \ud655\uc778\ud569\ub2c8\ub2e4." };
}
function movingDetailHtml(item) {
  if (!item) return "";
  const current = formatDisplayPrice(item.currentPrice, item) || "-";
  const ma20 = formatDisplayPrice(item.ma20, item) || "-";
  const ma60 = formatDisplayPrice(item.ma60, item) || "-";
  const decision = item.decision || "-";
  const note = item.note || item.movingAverage || "-";
  const ohlcCount = Array.isArray(item.ohlc) ? item.ohlc.length : 0;
  const ohlcSource = ohlcCount > 0 ? `${item.ohlcSource || "OHLC"} ${ohlcCount}봉` : "OHLC 대기";
  const heikin = heikinAshiDecision(item);
  const strategy = /\ub9e4\ub3c4|\uc704\ud5d8|\ubcf4\ub958|\ubcc0\ub3d9/.test(`${decision} ${note}`)
    ? "\ub2e8\ud0c0 \uc9c4\uc785\uc740 \ubcf4\ub958\ud558\uace0 20\uc77c\uc120 \ud68c\ubcf5\uacfc \uac70\ub798\ub7c9 \uc548\uc815\uc744 \uba3c\uc800 \ud655\uc778\ud569\ub2c8\ub2e4."
    : "20\uc77c\uc120 \uc9c0\uc9c0\uc640 60\uc77c\uc120 \uc774\ud0c8 \uc5ec\ubd80\ub97c \uac19\uc774 \ubcf4\uba74\uc11c \ubd84\ud560 \uc9c4\uc785\ub9cc \uac80\ud1a0\ud569\ub2c8\ub2e4.";
  return `<div class="moving-detail"><div class="moving-chart-box">${movingChartSvg(item)}</div><div class="moving-memo"><h3>[\uc774\ud3c9\uc120 + \ud558\uc774\ud0a8\uc544\uc2dc \ubcf4\uc870\ud310\ub2e8]</h3><p>- \uc885\ubaa9: ${escapeHtml(item.name || item.symbol)}(${escapeHtml(item.symbol || "-")})</p><p>- \ud604\uc7ac\uac00: ${escapeHtml(current)}</p><p>- OHLC: ${escapeHtml(ohlcSource)}</p><p>- 20\uc77c\uc120: ${escapeHtml(ma20)}</p><p>- 60\uc77c\uc120: ${escapeHtml(ma60)}</p><p>- \uc774\ud3c9\uc120 \ud310\ub2e8: <b>${escapeHtml(decision)}</b></p><p>- ${escapeHtml(heikin.label)}</p><p>- \uadfc\uac70: ${escapeHtml(note)}</p><h3>[\uc804\ub7b5 \uba54\ubaa8]</h3><p>- ${escapeHtml(heikin.memo)}</p><p>- ${escapeHtml(strategy)}</p><p>- \uc774\ud3c9\uc120 \ub2e8\ud0c0\uc804\ub7b5: 5\uc77c\uc120\uacfc 20\uc77c\uc120 \uc704\uce58\uac00 \uac19\uc774 \uac1c\uc120\ub420 \ub54c\ub9cc \uc810\uc218\ub97c \ub192\uc785\ub2c8\ub2e4.</p></div></div>`;
}
function morningNoteItems() {
  return ["KR", "US"].map((market) => state.morningNotes?.[market]).filter(Boolean).map((note) => {
    const quoteLine = (row) => `${row.name || row.symbol}: ${row.change_pct == null ? "변동률 확인불가" : `${row.change_pct >= 0 ? "+" : ""}${row.change_pct}%`}`;
    return {
      title: `${note.market} 모닝노트`,
      updatedAt: note.as_of || "",
      summary: note.status === "READY" ? note.summary : "최신 공개 데이터 일부를 확인할 수 없어 수치가 비어 있는 항목은 추정하지 않았습니다.",
      sections: [
        { heading: "밤사이 뉴스", items: (note.news || []).slice(0, 5).map((item) => item.title) },
        { heading: "지수·환율 점검", items: (note.indices || []).map(quoteLine) },
        { heading: "업종 흐름", items: (note.sector_flow || []).map(quoteLine) }
      ]
    };
  });
}
function mergedSections(data) {
  return {
    scanner: dedupeRowsBySymbol([...state.userStocks.map(userStockToScanner), ...(data.scanner || [])]).map(applyLiveQuote),
    watchlist: dedupeRowsBySymbol([
      ...(Array.isArray(state.tossHoldings?.positions) ? state.tossHoldings.positions.map(tossHoldingToWatchlist).filter(Boolean) : []),
      ...state.userStocks.map(userStockToWatchlist)
    ]).map(applyLiveQuote),
    learning: [...state.userStocks.map(userStockToLearning), ...data.learning],
    dailyDigest: state.dailyHistory || [],
    spikes: (data.spikes || []).map(applyLiveQuote),
    moving: [...state.userStocks.map(userStockToMoving), ...data.movingAverages].map(applyLiveQuote),
    growthDiscovery: (data.growthDiscovery || []).map(applyLiveQuote),
    morningNote: [...morningNoteItems(), ...(data.morningNote || data.analysis || [])],
    sectorOverview: data.sectorOverview || [],
    deepAnalysis: [...state.userStocks.map(userStockToAnalysis), ...(data.deepAnalysis || [])].map(applyLiveQuote),
    newsList: data.newsList || []
  };
}
function renderSectorOverviewCards() {
  const data = state.data || {};
  const sections = mergedSections(data);
  const source = [...(sections.scanner || []), ...(sections.watchlist || []), ...(data.sectorOverview || [])];
  const groups = new Map();
  source.forEach((item) => {
    const sector = sectorLabelFromItem(item);
    if (!sector || sector === "-") return;
    const market = marketGroupLabel(item);
    const key = `${market}|${sector}`;
    if (!groups.has(key)) groups.set(key, { market, sector, items: [], changes: [] });
    const group = groups.get(key);
    const symbol = String(item.symbol || "").trim();
    if (symbol && !group.items.some((row) => row.symbol === symbol)) group.items.push(item);
    const rawChange = item.changePct ?? item.change_percent ?? item.change;
    const change = parseNumber(rawChange);
    if (Number.isFinite(change)) group.changes.push(change);
  });
  const cards = [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.sector.localeCompare(b.sector, "ko"));
  if (!cards.length) return `<article class="data-card"><div class="card-top"><strong>섹터 데이터 없음</strong><em>업종 맥락</em></div><p>현재 공개 데이터에서 업종과 연결된 종목을 확인할 수 없습니다.</p></article>`;
  return cards.slice(0, 24).map((group) => {
    const average = group.changes.length ? group.changes.reduce((sum, value) => sum + value, 0) / group.changes.length : null;
    const trend = average == null ? "흐름 확인불가" : `구성 종목 평균 ${average >= 0 ? "+" : ""}${average.toFixed(2)}%`;
    const members = group.items.slice(0, 10).map((item) => `${item.name || item.symbol}(${item.symbol || "-"})`).join(", ");
    return `<article class="data-card sector-overview-card"><div class="card-top"><strong>${escapeHtml(group.sector)}</strong><em>${escapeHtml(group.market)}</em></div><p><b>${escapeHtml(trend)}</b> · 구성 종목 ${group.items.length}개</p><p>${escapeHtml(members || "구성 종목 없음")}</p><p class="muted">이 카드는 종목의 업종 소속과 공개된 가격 흐름을 묶은 참고용 요약이며, 업종 점수나 매매 신호를 새로 산출하지 않습니다.</p></article>`;
  }).join("");
}
function sectorLabelFromItem(item) {
  return normalizeSectorLabel(item?.sector || item?.sectorLabel || item?.theme || "");
}
function currentSectorFilter(section) {
  return section === "growthDiscovery" ? (state.growthSectorFilter || "전체") : (state.scannerSectorFilter || "전체");
}
function filteredDailyHistory(items) {
  const query = String(state.dailySearchQuery || "").trim().toLowerCase();
  const from = String(state.dailyDateFrom || "").trim();
  const to = String(state.dailyDateTo || "").trim();
  return (items || []).filter((item) => {
    const date = String(item?.date || "");
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (!query) return true;
    const haystack = [
      item?.title,
      item?.summary,
      item?.windowLabel,
      item?.date,
      item?.slug
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}
function sectorOptions(items, limit = 10) {
  const counts = new Map();
  (items || []).forEach((item) => {
    const sector = sectorLabelFromItem(item);
    if (!sector || sector === "-") return;
    counts.set(sector, (counts.get(sector) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, limit).map(([label]) => label);
}
function applySectorFilter(items, section) {
  const selected = currentSectorFilter(section);
  if (!selected || selected === "전체") return items;
  return (items || []).filter((item) => sectorLabelFromItem(item) === selected);
}
function sectorFilterControls(section, items) {
  const selected = currentSectorFilter(section);
  const options = ["전체", ...sectorOptions(items)];
  return `<div class="sector-filter-controls">${options.map((label) => `<button class="${selected === label ? "active" : ""}" data-sector-filter-section="${section}" data-sector-filter-value="${escapeHtml(label)}" type="button">${escapeHtml(label)}</button>`).join("")}</div>`;
}
function evidenceSummaryHtml(item) {
  const evidence = item?.evidence || {};
  const clues = Array.isArray(evidence.clues) ? evidence.clues.filter(Boolean) : [];
  const title = evidence.title || "근거 단서";
  const lines = clues.length ? clues.slice(0, 2) : [item.summary || "가격·예측·뉴스 흐름을 함께 확인합니다."];
  return `<div class="evidence-cell"><strong>${escapeHtml(title)}</strong>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`;
}
function confirmationSummaryHtml(item) {
  const evidence = item?.evidence || {};
  const confirmations = Array.isArray(evidence.confirmations) ? evidence.confirmations.filter(Boolean) : [];
  const stance = evidence.stance || "확인 조건 충족 전에는 정찰 또는 관찰 우선";
  const lines = confirmations.length ? confirmations.slice(0, 2) : [stance];
  return `<div class="confirm-cell">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<em>${escapeHtml(stance)}</em></div>`;
}
function dailyDigestControlsHtml(items) {
  const filtered = filteredDailyHistory(items);
  return `<div class="daily-controls">
    <div class="daily-control-group">
      <label for="dailySearchInput">검색</label>
      <input id="dailySearchInput" type="search" placeholder="제목, 요약, 날짜" value="${escapeHtml(state.dailySearchQuery || "")}">
    </div>
    <div class="daily-control-group">
      <label for="dailyDateFrom">시작일</label>
      <input id="dailyDateFrom" type="date" value="${escapeHtml(state.dailyDateFrom || "")}">
    </div>
    <div class="daily-control-group">
      <label for="dailyDateTo">종료일</label>
      <input id="dailyDateTo" type="date" value="${escapeHtml(state.dailyDateTo || "")}">
    </div>
    <div class="daily-control-group daily-control-summary">
      <span>결과 <b>${filtered.length}</b>건</span>
    </div>
  </div>`;
}
function dailyDigestCardHtml(item, featured = false) {
  const summary = String(item?.summary || "").trim();
  const path = String(item?.path || "").trim() || `/daily/${escapeHtml(item?.slug || "")}.html`;
  const metricLine = [
    `스캐너 ${Number(item?.scannerCount || 0)}건`,
    `뉴스 ${Number(item?.newsCount || 0)}건`,
    `강한 매수 ${Number(item?.strongBuyReports || 0)}건`
  ].join(" | ");
  return `<article class="daily-list-row${featured ? " featured" : ""}">
    <div class="daily-list-main">
      <div class="daily-list-title-row">
        <strong><a href="${path}" target="_blank" rel="noopener">${escapeHtml(item?.title || item?.date || "-")}</a></strong>
        <em>${escapeHtml(item?.date || "-")}</em>
      </div>
      <p class="daily-window">${escapeHtml(item?.windowLabel || "-")}</p>
      <p class="daily-list-summary">${escapeHtml(summary || "요약 대기")}</p>
    </div>
    <div class="daily-list-side">
      <p class="daily-metrics">${escapeHtml(metricLine)}</p>
      <p class="daily-links"><a href="${path}" target="_blank" rel="noopener">문서 열기</a></p>
    </div>
  </article>`;
}

function renderDailyDigestShowcase() {
  const mount = el("#dailyDigestShowcaseList");
  if (!mount) return;
  const items = filteredDailyHistory(state.dailyHistory || []);
  const latest = items[0] || null;
  if (!items.length) {
    mount.innerHTML = `<article class="data-card"><div class="card-top"><strong>오늘시황 기록 없음</strong><em>-</em></div><p>표시할 시황 문서가 아직 없습니다.</p></article>`;
    return;
  }
  mount.innerHTML = items.slice(0, 8).map((item) => dailyDigestCardHtml(item, latest && item.slug === latest.slug)).join("");
}

function formatDotoriNumber(value, suffix = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${suffix}`;
}

function renderDotoriLearningDashboard() {
  const payload = state.dotoriLearning || {};
  const koreaRows = (Array.isArray(payload?.korea?.rankings) ? payload.korea.rankings : []).map(applyLiveQuote);
  const usRows = (Array.isArray(payload?.us?.rankings) ? payload.us.rankings : []).map(applyLiveQuote);
  const usSummary = payload?.us?.summary || {};
  const updated = payload.generatedAt ? fmtDateTimeSeconds(payload.generatedAt) : "-";
  const selectedKr = Array.isArray(payload?.korea?.selectedSymbols) ? payload.korea.selectedSymbols.join(", ") : "-";
  const selectedUs = Array.isArray(payload?.us?.selectedSymbols) ? payload.us.selectedSymbols.join(", ") : "-";
  const summaryLine = [
    `미국 백테스트 ${formatDotoriNumber(usSummary.return_pct, "%")}`,
    `MDD ${formatDotoriNumber(usSummary.max_drawdown_pct, "%")}`,
    `거래 ${formatDotoriNumber(usSummary.trades)}`,
    `승률 ${formatDotoriNumber(Number(usSummary.win_rate) * 100, "%")}`
  ].join(" / ");
  const rowHtml = (item) => `<tr><td>${escapeHtml(item.rank || "-")}</td><td><strong>${escapeHtml(item.name || item.symbol || "-")}</strong> <span>(${escapeHtml(item.symbol || "-")})</span></td><td>${escapeHtml(item.sector || "-")}</td><td>${formatDotoriNumber(item.price)}</td><td><b>${formatDotoriNumber(item.score)}</b></td><td><b class="${signalClass(item.signal || "")}">${escapeHtml(item.signal || "-")}</b></td><td>${formatDotoriNumber(Number(item.confidence) * 100, "%")}</td><td>${escapeHtml(item.reason || "-")}</td></tr>`;
  const groupHtml = (title, rows) => `<tr class="market-group-row"><td colspan="8">${title}</td></tr>${rows.length ? rows.slice(0, DISPLAY_MARKET_LIMIT).map(rowHtml).join("") : `<tr><td colspan="8">${title} 데이터가 아직 없습니다.</td></tr>`}`;
  return `<div class="table-card"><table class="data-table"><thead><tr><th colspan="4">갱신 ${escapeHtml(updated)}</th><th colspan="4">${escapeHtml(summaryLine)}</th></tr><tr><th colspan="4">한국 선정 ${escapeHtml(selectedKr || "-")}</th><th colspan="4">미국 선정 ${escapeHtml(selectedUs || "-")}</th></tr><tr><th>순위</th><th>종목</th><th>섹터</th><th>현재가</th><th>점수</th><th>신호</th><th>신뢰도</th><th>사유</th></tr></thead><tbody>${groupHtml("한국 후보", koreaRows)}${groupHtml("미국 후보", usRows)}</tbody></table></div>`;
}

function publicDotoriRows(snapshot, kind) {
  if (!snapshot || snapshot.paper_trade !== true || snapshot.live_order_allowed !== false) return [];
  const candidates = Array.isArray(snapshot.candidates) ? snapshot.candidates : [];
  return candidates.map((row) => {
    const symbol = String(row?.symbol || "").trim();
    const name = String(row?.symbol_name || row?.display_name || "").trim();
    const price = Number(row?.current_price);
    if (!symbol || !name || !Number.isFinite(price) || price <= 0) return null;
    return {
      kind,
      symbol,
      name,
      market: String(row?.market || "").trim() || "-",
      currentPrice: price,
      score: Number.isFinite(Number(row?.score)) ? Number(row.score) : null,
      changePct: Number.isFinite(Number(row?.day_change_pct)) ? Number(row.day_change_pct) * 100 : null,
      volumeRatio: Number.isFinite(Number(row?.volume_ratio)) ? Number(row.volume_ratio) : null,
      tradingValue: Number.isFinite(Number(row?.trading_value)) ? Number(row.trading_value) : null,
      executionStrength: Number.isFinite(Number(row?.execution_strength)) ? Number(row.execution_strength) : null,
      updatedAt: snapshot.updated_at || ""
    };
  }).filter(Boolean);
}

function renderDotoriCandidates() {
  const payload = state.dotoriWeb || {};
  const buyRows = publicDotoriRows(payload.buy_candidates, "매수 후보");
  const bettingRows = publicDotoriRows(payload.betting_candidates, "종가 후보");
  const rows = [...buyRows, ...bettingRows].slice(0, 50);
  const updated = payload.updated_at ? fmtDateTimeSeconds(payload.updated_at) : "-";
  const rowHtml = (row) => `<tr><td>${escapeHtml(row.kind)}</td><td><strong>${escapeHtml(row.name)}</strong> <span>(${escapeHtml(row.symbol)})</span></td><td>${escapeHtml(row.market)}</td><td>${formatDotoriNumber(row.currentPrice)}</td><td>${formatDotoriNumber(row.score)}</td><td>${formatDotoriNumber(row.changePct, "%")}</td><td>${formatDotoriNumber(row.volumeRatio, "배")}</td><td>${formatDotoriNumber(row.tradingValue)}</td><td>${formatDotoriNumber(row.executionStrength)}</td></tr>`;
  const body = rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="9">현재 공개 가능한 종가 후보가 없습니다.</td></tr>`;
  return `<div class="table-card"><p class="status">갱신 ${escapeHtml(updated)} · PAPER 관찰 데이터 · 실제 주문 아님</p><table class="data-table"><thead><tr><th>구분</th><th>종목</th><th>시장</th><th>현재가</th><th>점수</th><th>등락률</th><th>거래량비율</th><th>거래대금</th><th>체결강도</th></tr></thead><tbody>${body}</tbody></table><p class="status">주문 수량·예산·주문유형·내부 패턴·실행 신호는 공개 화면에서 제외했습니다.</p></div>`;
}

function renderDashboard() {
  const data = state.data;
  if (!data) return;
  const updatedAt = el("#updatedAt");
  const exchangeRate = el("#exchangeRate");
  const exchangeNote = el("#exchangeNote");
  setBuildVersion();
  setBrandUpdatedAt(new Date().toISOString());
  const rate = data.exchangeRate || {};
  // The update label must describe the public market snapshot, not the UI build time.
  if (updatedAt) updatedAt.textContent = fmtDateTimeSeconds(data.updatedAt);
  if (exchangeRate) exchangeRate.textContent = [rate.value, rate.change].filter(Boolean).join(" ");
  if (exchangeNote) {
    const rateUpdatedAt = rate.updatedAt ? `환율 갱신 ${fmtDateTimeSeconds(rate.updatedAt)}` : "";
    const rateSource = rate.source ? `출처 ${rate.source}` : "";
    exchangeNote.textContent = [rate.note, rateUpdatedAt, rateSource].filter(Boolean).join(" | ") || "운영 데이터 기준으로 5초마다 화면을 갱신합니다.";
  }
  const sections = mergedSections(data);
  const active = sections[state.activeSection] || sections.watchlist;
  const grid = el("#contentGrid");
  setTabDebugState(state.activeSection, Array.isArray(active) ? active.length : 0);
  renderSignalFeed();
  renderMarketBrief();
  renderDailyDigestShowcase();
  if (state.activeSection === "watchlist") {
    grid.innerHTML = renderCards(active, (item) => {
      const displayName = !item.name || item.name === item.symbol ? item.symbol : `${item.name} <span>(${item.symbol})</span>`;
      const priceLine = item.currentPrice ? `<p class="price ${priceClassForItem(item)}"><span>${T.currentPrice}:</span> ${formatDisplayPrice(item.currentPrice, item)}</p>` : "";
      const marketLinks = item.symbol ? ` <a class="market-link" href="${tossStockUrl(item.symbol)}" target="_blank" rel="noopener">토스증권</a> <a class="market-link" href="${naverStockUrl(item)}" target="_blank" rel="noopener">네이버증권</a>` : "";
      return `<article class="data-card clickable-card watch-card ${priceBackgroundClassForItem(item)}" data-chart-symbol="${item.symbol}"><div class="card-top"><strong>${displayName}</strong><em>${displayMarket(item.market)}</em></div>${priceLine}<p><b class="${signalClass(item.signal)}">${item.signal}</b>${item.movingAverage ? ` / ${item.movingAverage}` : ""}</p>${analysisSummaryBlockHtml(item)}${crashRiskSummaryHtml(item)}${macroEventRiskSummaryHtml(item)}${marketRiskSummaryHtml(item)}<p>${marketLinks.trim()}</p><div class="watch-chart-popover">${watchlistMiniChartSvg(item)}</div>${item.userAdded ? `<button class="small-button" data-remove-symbol="${item.symbol}" type="button">${T.remove}</button>` : ""}</article>`;
    });
  } else if (state.activeSection === "scanner") {
    const filtered = applySectorFilter(active, "scanner");
    const marketRows = (marketLabel) => filtered.filter((item) => displayMarket(item.market || marketName(item.symbol)) === marketLabel);
    const rowHtml = (item) => `<tr><td class="scanner-rank-cell">${item.rank || "-"}</td><td class="scanner-name-cell"><strong>${item.name || item.title || item.symbol}</strong> <span>(${item.symbol || "-"})</span></td><td>${formatDisplayPrice(item.currentPrice, item) || "-"}</td><td><b class="${signalClass(item.signal || item.sentiment || "")}">${item.signal || item.sentiment || "-"}</b></td><td>${formatDisplayPriceRange(item.predRange, item) || "-"}</td><td>${evidenceSummaryHtml(item)}</td><td>${confirmationSummaryHtml(item)}</td></tr>`;
    const groupHtml = (marketLabel) => {
      const rows = marketRows(marketLabel).slice(0, DISPLAY_MARKET_LIMIT);
      const body = rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="7">\ud45c\uc2dc\ud560 \uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</td></tr>`;
      return `<tr class="market-group-row"><td colspan="7">${marketLabel}</td></tr>${body}`;
    };
    const scannerFirst = effectiveScannerMarketFirst();
    const first = scannerFirst === "us" ? T.us : T.domestic;
    const second = scannerFirst === "us" ? T.domestic : T.us;
    grid.innerHTML = `<div class="scanner-market-controls"><button class="${scannerFirst === "domestic" ? "active" : ""}" data-scanner-first="domestic" type="button">\uad6d\ub0b4 \uc6b0\uc120</button><button class="${scannerFirst === "us" ? "active" : ""}" data-scanner-first="us" type="button">\ud574\uc678 \uc6b0\uc120</button></div>${sectorFilterControls("scanner", active)}<div class="table-card"><table class="data-table scanner-table"><thead><tr><th>\uc21c\uc704</th><th>\uc885\ubaa9</th><th>\ud604\uc7ac\uac00</th><th>\uc2e0\ud638</th><th>\uc608\uce21\ubc94\uc704</th><th>\uadfc\uac70 \ub2e8\uc11c</th><th>\ud655\uc778 \uc870\uac74</th></tr></thead><tbody>${groupHtml(first)}${groupHtml(second)}</tbody></table></div>`;
  } else if (state.activeSection === "growthDiscovery") {
    const filtered = applySectorFilter(active, "growthDiscovery");
    const rowHtml = (item) => {
      const notes = Array.isArray(item.notes) ? item.notes.slice(0, 3) : [];
      const noteHtml = notes.length ? notes.map((line) => `<p>${escapeHtml(line)}</p>`).join("") : `<p>${escapeHtml(item.reason || "성장 단서 확인 필요")}</p>`;
      const links = item.symbol ? `<a class="market-link" href="${naverStockUrl(item)}" target="_blank" rel="noopener">네이버증권</a>${marketGroupLabel(item) === "\ubbf8\uad6d" ? ` <a class="market-link" href="${tossStockUrl(item.symbol)}" target="_blank" rel="noopener">토스증권</a>` : ""}` : "";
      const proxy = item.valuationProxy || {};
      const proxyHtml = item.growthValueScore != null
        ? `<div class="growth-proxy"><b>프록시 ${escapeHtml(String(item.growthValueScore))}</b><br>PER ${escapeHtml(String(proxy.per ?? "-"))} / ROE ${escapeHtml(String(proxy.roe ?? "-"))}%<br>외국인 ${escapeHtml(String(proxy.foreignPct ?? "-"))}%</div>`
        : "-";
      return `<tr><td>${item.rank || "-"}</td><td class="scanner-name-cell"><strong>${escapeHtml(item.name || item.symbol || "-")}</strong> <span>(${escapeHtml(item.symbol || "-")})</span></td><td><b>${escapeHtml(String(item.score ?? "-"))}</b></td><td><b class="${signalClass(item.verdict || "")}">${escapeHtml(item.verdict || "-")}</b></td><td>${escapeHtml(item.theme || "-")}</td><td>${escapeHtml(item.currentPriceText || formatDisplayPrice(item.currentPrice, item) || "-")}</td><td>${escapeHtml(item.return5d || "-")} / ${escapeHtml(item.return20d || "-")}</td><td>${escapeHtml(item.volumeRatio || "-")}</td><td>${proxyHtml}<div class="evidence-cell">${noteHtml}${links}</div></td></tr>`;
    };
    const groupHtml = (marketLabel) => {
      const rows = filtered.filter((item) => marketGroupLabel(item) === marketLabel).slice(0, DISPLAY_MARKET_LIMIT);
      return `<tr class="market-group-row"><td colspan="9">${marketLabel} 성장주 후보</td></tr>${rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="9">${marketLabel} 성장주 데이터가 아직 없습니다.</td></tr>`}`;
    };
    grid.innerHTML = `<div class="table-card"><table class="data-table growth-table"><thead><tr><th>순위</th><th>종목</th><th>성장점수</th><th>판정</th><th>성장축</th><th>현재가</th><th>5일/20일</th><th>거래량</th><th>성장 근거</th></tr></thead><tbody>${groupHtml("\uad6d\ub0b4")}${groupHtml("\ubbf8\uad6d")}</tbody></table></div>`;
    grid.innerHTML = `${sectorFilterControls("growthDiscovery", active)}${grid.innerHTML}`;
  } else if (state.activeSection === "dailyDigest") {
    const filtered = filteredDailyHistory(active);
    const rows = filtered.length
      ? filtered.map((item) => {
        const path = String(item?.path || "").trim() || `/daily/${escapeHtml(item?.slug || "")}.html`;
        const rawSummary = String(item?.summary || "").trim();
        const markerMatch = rawSummary.match(/\/\s*(이번\s+구간에는[\s\S]*)/);
        const focusSummary = markerMatch ? markerMatch[1].trim() : rawSummary;
        const content = [item?.windowLabel, focusSummary].filter(Boolean).join(" / ");
        return `<tr><td>${escapeHtml(item?.date || "-")}</td><td>${escapeHtml(content || "-")}</td><td><a href="${path}" target="_blank" rel="noopener">확인하기</a></td></tr>`;
      }).join("")
      : `<tr><td colspan="3">선택한 날짜 범위와 검색어에 맞는 오늘시황 문서가 없습니다.</td></tr>`;
    grid.innerHTML = `${dailyDigestControlsHtml(active)}<div class="table-card"><table class="data-table daily-digest-table"><thead><tr><th>일자</th><th>내용</th><th>확인하기</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else if (state.activeSection === "dotoriLearning") {
    grid.innerHTML = renderDotoriLearningDashboard();
  } else if (state.activeSection === "dotoriCandidates") {
    grid.innerHTML = renderDotoriCandidates();
  } else if (state.activeSection === "learning") {
    grid.innerHTML = renderCards(active, (item) => `<article class="data-card"><div class="card-top"><strong>${item.topic}</strong><em>${T.learning}</em></div><p>${item.lesson}</p></article>`);
  } else if (state.activeSection === "spikes") {
    const directionRows = (direction, marketLabel) => active
      .filter((item) => spikeDirection(item) === direction && marketGroupLabel(item) === marketLabel)
      .sort((a, b) => direction === "down" ? parseNumber(a.change) - parseNumber(b.change) : parseNumber(b.change) - parseNumber(a.change));
    const rowHtml = (item, index, direction) => {
      const changeClass = direction === "down" ? "down" : "up";
      const label = direction === "down" ? "급락" : "급등";
      return `<tr><td>${index + 1}</td><td>${label}</td><td><strong>${item.name || item.symbol}</strong> <span>(${item.symbol || "-"})</span></td><td>${displayMarket(item.market || marketName(item.symbol))}</td><td>${item.range || "-"}</td><td><b class="${changeClass}">${item.change || "-"}</b></td><td>${formatDisplayPrice(item.currentPrice, item) || "-"}</td><td><b class="${signalClass(item.signal || "")}">${item.signal || "-"}</b></td><td>${item.note || ""}</td></tr>`;
    };
    const groupHtml = (marketLabel, direction, title) => {
      const rows = directionRows(direction, marketLabel).slice(0, DISPLAY_MARKET_LIMIT);
      return `<tr class="market-group-row"><td colspan="9">${marketLabel} ${title}</td></tr>${rows.length ? rows.map((item, index) => rowHtml(item, index, direction)).join("") : `<tr><td colspan="9">${marketLabel} ${title} 종목이 없습니다.</td></tr>`}`;
    };
    grid.innerHTML = `<div class="table-card"><table class="data-table"><thead><tr><th>\uc21c\uc704</th><th>\uad6c\ubd84</th><th>\uc885\ubaa9</th><th>\uc2dc\uc7a5</th><th>\uad6c\uac04</th><th>\ub4f1\ub77d\ub960</th><th>\ud604\uc7ac\uac00</th><th>\uc2e0\ud638</th><th>\uadfc\uac70</th></tr></thead><tbody>${groupHtml("\uad6d\ub0b4", "up", "\uae09\ub4f1")}${groupHtml("\uad6d\ub0b4", "down", "\uae09\ub77d")}${groupHtml("\ubbf8\uad6d", "up", "\uae09\ub4f1")}${groupHtml("\ubbf8\uad6d", "down", "\uae09\ub77d")}</tbody></table></div>`;
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
    const uniqueNews = dedupeNewsItems(active);
    grid.innerHTML = `<div class="table-card"><table class="data-table"><thead><tr><th>\uc2dc\uac04</th><th>\uc81c\ubaa9</th><th>\uc694\uc57d</th><th>\ub9c1\ud06c</th></tr></thead><tbody>${uniqueNews.map((item) => `<tr><td>${item.asOf || "-"}</td><td><strong>${item.title || "-"}</strong></td><td>${item.summary || ""}</td><td>${item.url ? `<a href="${item.url}" target="_blank" rel="noopener">\uc5f4\uae30</a>` : "-"}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (state.activeSection === "sectorOverview") {
    grid.innerHTML = renderSectorOverviewCards();
  } else if (["morningNote", "deepAnalysis"].includes(state.activeSection)) {
    grid.innerHTML = renderCards(active, (item) => {
      const livePriceLine = item.currentPrice ? `<p class="price ${priceClassForItem(item)}"><span>${T.currentPrice}:</span> ${formatDisplayPrice(item.currentPrice, item)}${item.quotedAt ? ` <small>${fmtDateTimeSeconds(item.quotedAt)}</small>` : ""}</p>` : "";
      if (Array.isArray(item.sections)) {
        const sections = Array.isArray(item.sections) ? item.sections : [];
        const sectionHtml = sections.map((section) => `<section class="report-section"><h3>${section.heading}</h3><ul>${(section.items || []).map((line) => `<li>${line}</li>`).join("")}</ul></section>`).join("");
        return `<article class="report-card"><div class="report-head"><div><strong>${item.title}</strong><p>${item.updatedAt || ""}</p></div><em>${T.report}</em></div>${livePriceLine}<p class="report-summary">${item.summary || item.body || ""}</p>${analysisSummaryBlockHtml(item)}${crashRiskSummaryHtml(item)}${macroEventRiskSummaryHtml(item)}${marketRiskSummaryHtml(item)}${sectionHtml}</article>`;
      }
      return `<article class="data-card"><div class="card-top"><strong>${item.title}</strong><em>${T.report}</em></div>${livePriceLine}${crashRiskSummaryHtml(item)}${macroEventRiskSummaryHtml(item)}${fairValueSummaryHtml(item)}${technicalSummaryHtml(item)}${valuationSummaryHtml(item)}${marketRiskSummaryHtml(item)}<p>${item.body}</p></article>`;
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
      state.scannerMarketFirstManual = true;
      renderDashboard();
    });
  });
  document.querySelectorAll("[data-sector-filter-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.dataset.sectorFilterSection || "scanner";
      const value = button.dataset.sectorFilterValue || "전체";
      if (section === "growthDiscovery") state.growthSectorFilter = value;
      else state.scannerSectorFilter = value;
      renderDashboard();
    });
  });
  const dailySearchInput = document.querySelector("#dailySearchInput");
  if (dailySearchInput) {
    dailySearchInput.addEventListener("input", () => {
      state.dailySearchQuery = dailySearchInput.value || "";
      renderDashboard();
    });
  }
  const dailyDateFrom = document.querySelector("#dailyDateFrom");
  if (dailyDateFrom) {
    dailyDateFrom.addEventListener("change", () => {
      state.dailyDateFrom = dailyDateFrom.value || "";
      renderDashboard();
    });
  }
  const dailyDateTo = document.querySelector("#dailyDateTo");
  if (dailyDateTo) {
    dailyDateTo.addEventListener("change", () => {
      state.dailyDateTo = dailyDateTo.value || "";
      renderDashboard();
    });
  }
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
    const [snapshotResponse, dailyResponse, learningResponse, dotoriWebResponse, holdingsResponse, sanghoeResponse, todayCandidatesResponse, morningKrResponse, morningUsResponse] = await Promise.all([
      fetch("./data/public-snapshot.json", { cache: "no-store" }),
      fetch("./data/daily-market-history.json", { cache: "no-store" }).catch(() => null),
      fetch("./data/dotoristock-learning.json", { cache: "no-store" }).catch(() => null),
      fetch("./web/data/dotoriweb/latest.json", { cache: "no-store" }).catch(() => null),
      fetch("./web/data/dotoriweb/holdings.json", { cache: "no-store" }).catch(() => null),
      fetch("./data/dotori-sanghoe.json", { cache: "no-store" }).catch(() => null),
      fetch("./web/data/dotoriweb/today-candidates.json", { cache: "no-store" }).catch(() => null),
      fetch("./web/data/dotoriweb/morning-note-KR.json", { cache: "no-store" }).catch(() => null),
      fetch("./web/data/dotoriweb/morning-note-US.json", { cache: "no-store" }).catch(() => null)
    ]);
    if (!snapshotResponse.ok) throw new Error(`HTTP ${snapshotResponse.status}`);
    state.data = normalizeSnapshotData(await snapshotResponse.json());
    if (dailyResponse && dailyResponse.ok) {
      const dailyPayload = await dailyResponse.json();
      state.dailyHistory = Array.isArray(dailyPayload) ? dailyPayload : [];
    }
    if (learningResponse && learningResponse.ok) {
      state.dotoriLearning = await learningResponse.json();
    }
    if (dotoriWebResponse && dotoriWebResponse.ok) {
      state.dotoriWeb = await dotoriWebResponse.json();
    }
    if (holdingsResponse && holdingsResponse.ok) {
      state.tossHoldings = await holdingsResponse.json();
    }
    if (sanghoeResponse && sanghoeResponse.ok) {
      state.sanghoe = await sanghoeResponse.json();
    }
    if (todayCandidatesResponse && todayCandidatesResponse.ok) {
      state.todayCandidates = await todayCandidatesResponse.json();
    }
    if (morningKrResponse && morningKrResponse.ok) state.morningNotes.KR = await morningKrResponse.json();
    if (morningUsResponse && morningUsResponse.ok) state.morningNotes.US = await morningUsResponse.json();
    setStatus(T.connected);
    setBrandUpdatedAt(new Date().toISOString());
    renderHermesPlanLines();
    renderDashboard();
    refreshExchangeRateOnAccess();
    if (!options.silent) refreshVisibleQuotes();
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
          signal: signalForPurchaseState(base.watchlist?.signal || T.mockReview, purchasePrice > 0),
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
    refreshVisibleQuotes();
  });
});
document.querySelectorAll("[data-open-section]").forEach((link) => {
  link.addEventListener("click", (event) => {
    const section = link.dataset.openSection;
    if (!section) return;
    event.preventDefault();
    state.activeSection = section;
    document.querySelectorAll("[data-section]").forEach((item) => item.classList.toggle("active", item.dataset.section === section));
    renderDashboard();
    refreshVisibleQuotes();
    const dashboard = document.querySelector("#dashboard");
    if (dashboard) dashboard.scrollIntoView({ block: "start", behavior: "smooth" });
  });
});
setupBrowserStorageNotice();
loadUserStocks();
setupSymbolForm();
loadSymbolDirectory().finally(loadData);
setInterval(() => loadData({ silent: true }), DATA_REFRESH_MS);
setInterval(refreshVisibleQuotes, DATA_REFRESH_MS);
setInterval(() => {
  if (state.activeSection !== "watchlist") return;
  refreshVisibleQuotes();
}, WATCHLIST_QUOTE_REFRESH_MS);
setInterval(updateSymbolHint, DATA_REFRESH_MS);
