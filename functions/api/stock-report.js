const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const TXT = {
  domestic: "\uAD6D\uB0B4",
  us: "\uBBF8\uAD6D",
  observe: "\uAD00\uCC30",
  buyReview: "\uB9E4\uC218\uAC80\uD1A0",
  hold: "\uBCF4\uC720",
  risk: "\uC704\uD5D8\uAD00\uB9AC",
  wait: "\uB370\uC774\uD130 \uD655\uC778 \uD544\uC694",
  newsScanner: "\uB274\uC2A4 \uC2A4\uCE90\uB108",
  mockInvestment: "\uBAA8\uC758\uD22C\uC790",
  movingAverage: "\uC774\uD3C9\uC120",
  analysis: "\uBD84\uC11D",
  noPurchase: "\uAD6C\uC785\uAC00 \uBBF8\uC785\uB825"
};

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function tursoUrl(env) {
  const raw = String(env?.TURSO_DATABASE_URL || "").trim();
  if (!raw) return "";
  return raw.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "");
}

function tursoArg(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (Number.isInteger(value)) return { type: "integer", value: String(value) };
  if (typeof value === "number") return { type: "float", value: String(value) };
  return { type: "text", value: String(value) };
}

async function tursoExecute(env, sql, args = []) {
  const baseUrl = tursoUrl(env);
  const token = String(env?.TURSO_AUTH_TOKEN || "").trim();
  if (!baseUrl || !token) return null;
  const response = await fetch(`${baseUrl}/v2/pipeline`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(tursoArg) } },
        { type: "close" }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`turso_http_${response.status}: ${text.slice(0, 300)}`);
  const payload = JSON.parse(text);
  const result = payload?.results?.[0];
  if (result?.type === "error") throw new Error(result.error?.message || "turso_execute_error");
  return result?.response?.result || result;
}

function tursoValue(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell !== "object") return cell;
  if (cell.type === "null") return null;
  if ("value" in cell) return cell.value;
  if ("base64" in cell) return cell.base64;
  return null;
}

function tursoRows(result) {
  const cols = (result?.cols || []).map((col) => col.name || col);
  return (result?.rows || []).map((row) => {
    const out = {};
    row.forEach((cell, index) => { out[cols[index] || index] = tursoValue(cell); });
    return out;
  });
}

async function ensureTursoSchema(env) {
  if (!tursoUrl(env) || !env?.TURSO_AUTH_TOKEN) return false;
  await tursoExecute(env, "CREATE TABLE IF NOT EXISTS stock_reports (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at TEXT NOT NULL)");
  await tursoExecute(env, "CREATE TABLE IF NOT EXISTS stock_report_history (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL)");
  return true;
}

async function loadTursoReport(env, symbol) {
  if (!(await ensureTursoSchema(env))) return null;
  const result = await tursoExecute(env, "SELECT payload FROM stock_reports WHERE symbol = ? LIMIT 1", [symbol]);
  const rows = tursoRows(result);
  if (!rows.length || !rows[0].payload) return null;
  return JSON.parse(rows[0].payload);
}

async function saveTursoReport(env, symbol, payload) {
  if (!(await ensureTursoSchema(env))) return false;
  const saved = JSON.stringify(payload);
  const savedAt = payload.savedAt || new Date().toISOString();
  await tursoExecute(
    env,
    "INSERT INTO stock_reports (symbol, payload, saved_at) VALUES (?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at",
    [symbol, saved, savedAt]
  );
  await tursoExecute(
    env,
    "INSERT INTO stock_report_history (symbol, payload, saved_at) VALUES (?, ?, ?)",
    [symbol, saved, savedAt]
  );
  return true;
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(value) {
  const text = cleanHtml(value);
  return text && text !== "N/A" && text !== "&nbsp;" ? text : "";
}

function matchHtmlValue(html, pattern) {
  const match = String(html || "").match(pattern);
  return textValue(match?.[1] || "");
}

function cleanName(value, symbol) {
  let text = cleanHtml(value);
  if (!text) return "";
  text = text
    .replace(/\s*:\s*\uB124\uC774\uBC84\uD398\uC774\s*\uC99D\uAD8C.*$/i, "")
    .replace(/\s*-\s*Toss Invest.*$/i, "")
    .replace(/\s*\|\s*Toss Invest.*$/i, "")
    .replace(/\s*\|\s*\uD1A0\uC2A4\uC99D\uAD8C.*$/i, "")
    .trim();
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\s*\\(?${escaped}\\)?\\s*$`, "i"), "").trim();
}

function valuationJudgment(metrics) {
  const per = Number(String(metrics?.per || "").replace(/,/g, ""));
  const pbr = Number(String(metrics?.pbr || "").replace(/,/g, ""));
  const psr = Number(String(metrics?.psr || "").replace(/,/g, ""));
  const debt = Number(String(metrics?.debtRatio || "").replace(/,/g, ""));
  const flags = [];
  if (Number.isFinite(pbr) && pbr > 0) {
    if (pbr <= 1) flags.push("매수 지표 PBR 낮음");
    else if (pbr >= 3) flags.push("매수 지표 PBR 부담");
  }
  if (Number.isFinite(psr) && psr > 0) {
    if (psr >= 8) flags.push("매도 지표 PSR 과열");
    else if (psr >= 4) flags.push("매도 지표 PSR 주의");
    else if (psr <= 1) flags.push("매도 지표 PSR 낮음");
  } else {
    flags.push("매도 지표 PSR 확인 필요");
  }
  if (Number.isFinite(per) && per > 0) {
    if (per >= 25) flags.push("PER 보조 고평가");
    else if (per <= 10) flags.push("PER 보조 저평가");
  }
  if (Number.isFinite(debt) && debt > 0) {
    if (debt >= 150) flags.push("부채비율 주의");
    else if (debt <= 50) flags.push("재무부담 낮음");
  }
  if (!flags.length) return "매수는 PBR, 매도는 PSR을 우선 확인";
  return flags.join(" / ");
}

function valuationFocus(metrics) {
  const pbr = Number(String(metrics?.pbr || "").replace(/,/g, ""));
  const psr = Number(String(metrics?.psr || "").replace(/,/g, ""));
  let buyFocus = "매수 판단: PBR 확인 필요";
  let sellFocus = "매도 판단: PSR 확인 필요";
  if (Number.isFinite(pbr) && pbr > 0) {
    if (pbr <= 1) buyFocus = "매수 판단: PBR 저평가권";
    else if (pbr >= 3) buyFocus = "매수 판단: PBR 부담권";
    else buyFocus = "매수 판단: PBR 중립권";
  }
  if (Number.isFinite(psr) && psr > 0) {
    if (psr >= 8) sellFocus = "매도 판단: PSR 과열권";
    else if (psr >= 4) sellFocus = "매도 판단: PSR 주의권";
    else sellFocus = "매도 판단: PSR 부담 낮음";
  }
  return { buyFocus, sellFocus };
}

function extractLatestAnalystRowValue(html, rowLabel) {
  const escaped = rowLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowMatch = String(html || "").match(new RegExp(`<tr[^>]*>[\\s\\S]*?<strong>${escaped}<\\/strong>[\\s\\S]*?<\\/tr>`, "i"));
  if (!rowMatch) return "";
  const cells = [...rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => textValue(match[1]))
    .filter(Boolean);
  return cells[cells.length - 1] || "";
}

function lookupDomesticValuationFromHtml(html) {
  const metrics = {
    per: matchHtmlValue(html, /<em[^>]+id=["']_per["'][^>]*>([^<]+)<\/em>/i),
    estimatedPer: matchHtmlValue(html, /<em[^>]+id=["']_cns_per["'][^>]*>([^<]+)<\/em>/i),
    pbr: matchHtmlValue(html, /<em[^>]+id=["']_pbr["'][^>]*>([^<]+)<\/em>/i),
    psr: "",
    industryPer: matchHtmlValue(html, /동일업종 PER[\s\S]*?<em>([^<]+)<\/em>\s*배/i),
    debtRatio: extractLatestAnalystRowValue(html, "부채비율"),
    fcf: "",
    evEbitda: "",
    source: "Naver Finance",
  };
  return {
    ...metrics,
    ...valuationFocus(metrics),
    summary: valuationJudgment(metrics),
    note: "매수 판단은 PBR, 매도 판단은 PSR을 우선합니다. PER, PBR, 부채비율은 네이버 금융 공개값 기준이며 PSR, FCF, EV/EBITDA는 별도 재무 API 연결 후 확정합니다."
  };
}

function emptyValuation(source = "") {
  const metrics = {
    per: "",
    estimatedPer: "",
    pbr: "",
    psr: "",
    industryPer: "",
    fcf: "",
    debtRatio: "",
    evEbitda: "",
    source,
  };
  return {
    ...metrics,
    ...valuationFocus(metrics),
    summary: valuationJudgment(metrics),
    note: "매수 판단은 PBR, 매도 판단은 PSR을 우선합니다. PER, FCF, 부채비율, EV/EBITDA는 보조 지표입니다."
  };
}

function formatPriceByMarket(value, market) {
  return market === TXT.us ? formatDollar(value) : formatWon(value);
}

function fairValueAnalysis(currentPrice, valuation, market) {
  const current = Number(String(currentPrice || "").replace(/[^0-9.]/g, ""));
  const pbr = Number(String(valuation?.pbr || "").replace(/,/g, ""));
  if (!current || !pbr) {
    return {
      method: "PBR 기준 적정주가",
      summary: "PBR 또는 현재가 확인 필요",
      conservative: "",
      neutral: "",
      growth: "",
      note: "매수 판단은 PBR을 우선 보되, 업종 평균과 실적 훼손 여부를 함께 확인합니다."
    };
  }
  const bps = current / pbr;
  const conservative = bps * 1.0;
  const neutral = bps * 1.5;
  const growth = bps * 2.5;
  let summary = "현재가가 PBR 중립 범위 안에 있습니다.";
  if (current <= conservative) summary = "현재가가 PBR 보수 기준 아래입니다.";
  else if (current >= growth) summary = "현재가가 PBR 성장 기준 위라 과열 확인이 필요합니다.";
  else if (current >= neutral) summary = "현재가가 PBR 중립 기준 위입니다.";
  return {
    method: "PBR 기준 적정주가",
    bps: formatPriceByMarket(bps, market),
    conservative: formatPriceByMarket(conservative, market),
    neutral: formatPriceByMarket(neutral, market),
    growth: formatPriceByMarket(growth, market),
    summary,
    note: "보수 PBR 1.0배, 중립 1.5배, 성장 2.5배를 적용한 참고 범위입니다."
  };
}

function technicalAnalysis(series) {
  const closes = Array.isArray(series?.closes) ? series.closes : [];
  const highs = Array.isArray(series?.highs) ? series.highs : [];
  const lows = Array.isArray(series?.lows) ? series.lows : [];
  const volumes = Array.isArray(series?.volumes) ? series.volumes : [];
  if (closes.length < 14 || highs.length < 14 || lows.length < 14) {
    return {
      stochastic: { k: "", d: "", signal: "스토캐스틱 확인 필요" },
      volume: { latest: "", average20: "", ratio: "", signal: "거래량 확인 필요" },
      summary: "스토캐스틱과 거래량 이력 확인 필요"
    };
  }
  const recentHigh = Math.max(...highs.slice(-14));
  const recentLow = Math.min(...lows.slice(-14));
  const lastClose = closes[closes.length - 1];
  const kValues = closes.slice(-3).map((close, index) => {
    const end = closes.length - 3 + index + 1;
    const windowHigh = Math.max(...highs.slice(Math.max(0, end - 14), end));
    const windowLow = Math.min(...lows.slice(Math.max(0, end - 14), end));
    return windowHigh > windowLow ? ((close - windowLow) / (windowHigh - windowLow)) * 100 : 50;
  });
  const k = recentHigh > recentLow ? ((lastClose - recentLow) / (recentHigh - recentLow)) * 100 : 50;
  const d = average(kValues);
  let stochasticSignal = "중립";
  if (k >= 80 && d >= 80) stochasticSignal = "과열권";
  else if (k <= 20 && d <= 20) stochasticSignal = "침체권";
  else if (k > d) stochasticSignal = "단기 반등";
  else if (k < d) stochasticSignal = "단기 둔화";
  const latestVolume = Number(volumes[volumes.length - 1] || 0);
  const avgVolume = average(volumes.slice(-20).filter((value) => typeof value === "number" && value > 0));
  const ratio = latestVolume > 0 && avgVolume > 0 ? latestVolume / avgVolume : 0;
  let volumeSignal = "거래량 중립";
  if (ratio >= 2) volumeSignal = "거래량 급증";
  else if (ratio >= 1.3) volumeSignal = "거래량 증가";
  else if (ratio > 0 && ratio <= 0.7) volumeSignal = "거래량 부족";
  return {
    stochastic: { k: k.toFixed(1), d: d.toFixed(1), signal: stochasticSignal },
    volume: {
      latest: latestVolume ? Math.round(latestVolume).toLocaleString() : "",
      average20: avgVolume ? Math.round(avgVolume).toLocaleString() : "",
      ratio: ratio ? `${ratio.toFixed(2)}배` : "",
      signal: volumeSignal
    },
    summary: `스토캐스틱 ${stochasticSignal} / 거래량 ${volumeSignal}`
  };
}

function oilRiskJudgment(current, previous) {
  const currentNumber = Number(current || 0);
  const previousNumber = Number(previous || 0);
  const changePct = currentNumber > 0 && previousNumber > 0 ? ((currentNumber / previousNumber) - 1) * 100 : 0;
  let direction = "유가 확인 필요";
  if (changePct >= 2) direction = "유가 상승 압력";
  else if (changePct <= -2) direction = "유가 하락 완화";
  else if (currentNumber > 0) direction = "유가 보합권";
  return {
    current: formatDollar(currentNumber),
    changePct: currentNumber > 0 && previousNumber > 0 ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "",
    direction,
    chain: "유가상승 > 인플레이션 우려 > 금리상승 > 주가부담",
    summary: `${direction} / 유가상승은 인플레이션 우려와 금리상승 부담을 통해 주식 밸류에이션을 낮출 수 있습니다.`,
    source: currentNumber > 0 ? "Yahoo Finance CL=F" : ""
  };
}

async function lookupOilMarketRisk() {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=5d&interval=1d", {
      headers: { "user-agent": "Mozilla/5.0 DotoriWeb/1.0" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter((value) => typeof value === "number");
    const meta = result?.meta || {};
    const current = Number(meta.regularMarketPrice || closes[closes.length - 1] || 0);
    const previous = Number(closes[closes.length - 2] || 0);
    return oilRiskJudgment(current, previous);
  } catch (_) {
    return oilRiskJudgment(0, 0);
  }
}

async function lookupMacroQuote(symbol) {
  const yahoo = await lookupYahoo(symbol).catch(() => null);
  const current = Number(yahoo?.current || 0);
  const previousClose = Number(yahoo?.previousClose || 0);
  const changePct = current > 0 && previousClose > 0 ? ((current / previousClose) - 1) * 100 : 0;
  return {
    symbol,
    current,
    previousClose,
    changePct,
    text: current > 0 ? `${symbol} ${formatDollar(current)} ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : `${symbol} 확인필요`
  };
}

async function ppiSemiconductorRisk() {
  const nowMs = Date.now();
  const releaseMs = Date.parse("2026-06-11T12:30:00Z");
  const usOpenMs = Date.parse("2026-06-11T13:30:00Z");
  const dangerCheckEndMs = Date.parse("2026-06-11T14:10:00Z");
  const watchStartMs = releaseMs - 24 * 60 * 60 * 1000;
  const symbols = ["SOXX", "SMH", "NVDA", "AVGO", "MU", "QQQ"];
  if (nowMs < watchStartMs || nowMs > dangerCheckEndMs + 12 * 60 * 60 * 1000) {
    return {
      level: "대기",
      title: "PPI 반도체 이벤트 대기",
      summary: "다음 PPI 이벤트 감시 시간이 아닙니다.",
      active: false,
      source: "BLS/Yahoo Finance"
    };
  }
  const quotes = await Promise.all(symbols.map((symbol) => lookupMacroQuote(symbol)));
  const bySymbol = Object.fromEntries(quotes.map((quote) => [quote.symbol, quote]));
  const etfWeak = (bySymbol.SOXX?.changePct || 0) <= -1.5 || (bySymbol.SMH?.changePct || 0) <= -1.5;
  const chipsWeak = ["NVDA", "AVGO", "MU"].every((symbol) => (bySymbol[symbol]?.changePct || 0) < 0);
  const qqqWeak = (bySymbol.QQQ?.changePct || 0) <= -0.8;
  const afterRelease = nowMs >= releaseMs;
  const afterOpen = nowMs >= usOpenMs;
  const inDangerWindow = nowMs >= releaseMs && nowMs <= dangerCheckEndMs;
  let level = "PPI 발표 대기";
  if (afterRelease) level = "PPI 반응 감시";
  if (inDangerWindow && etfWeak && chipsWeak && qqqWeak) level = "23시 추가 급락주의";
  else if (inDangerWindow && afterOpen && [etfWeak, chipsWeak, qqqWeak].filter(Boolean).length >= 2) level = "반도체 변동성 경계";
  const conditionText = [
    `SOXX/SMH -1.5% 조건 ${etfWeak ? "충족" : "미충족"}`,
    `NVDA·AVGO·MU 동반 약세 ${chipsWeak ? "충족" : "미충족"}`,
    `QQQ -1% 근처 조건 ${qqqWeak ? "충족" : "미충족"}`
  ].join(" / ");
  return {
    level,
    title: "PPI 반도체 급락주의",
    eventTimeKst: "2026-06-11 21:30 KST",
    usOpenKst: "2026-06-11 22:30 KST",
    checkUntilKst: "2026-06-11 23:10 KST",
    active: inDangerWindow,
    afterRelease,
    afterOpen,
    conditions: { etfWeak, chipsWeak, qqqWeak },
    quotes: Object.fromEntries(quotes.map((quote) => [quote.symbol, { current: formatDollar(quote.current), changePct: `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` }])),
    summary: `${level} / ${conditionText} / ${quotes.map((quote) => quote.text).join(" / ")}`,
    source: "BLS/Yahoo Finance"
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
      "accept": "application/json",
      "referer": "https://finance.naver.com"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function cleanPrice(value) {
  return String(value || "").replace(/,/g, "").trim();
}

function numericPrice(value) {
  const number = Number(String(value || "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatWon(value) {
  const number = numericPrice(value);
  if (number <= 0) return "";
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

function formatDollar(value) {
  const number = numericPrice(value);
  if (number <= 0) return "";
  return `$${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tossCredentials(env = {}) {
  const clientId = env.TOSS_INVEST_CLIENT_ID || env.TOSS_CLIENT_ID || "";
  const clientSecret = env.TOSS_INVEST_CLIENT_SECRET || env.TOSS_CLIENT_SECRET || "";
  return { clientId, clientSecret };
}

async function tossAccessToken(env = {}) {
  const { clientId, clientSecret } = tossCredentials(env);
  if (!clientId || !clientSecret) throw new Error("toss_credentials_missing");
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  const payload = await fetchJsonWithTimeout(
    "https://openapi.tossinvest.com/oauth2/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    },
    2500
  );
  const token = payload?.access_token || "";
  if (!token) throw new Error("toss_token_missing");
  return token;
}

async function fetchTossOpenApi(path, env = {}) {
  const token = await tossAccessToken(env);
  return await fetchJsonWithTimeout(
    `https://openapi.tossinvest.com${path}`,
    {
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${token}`
      }
    },
    3000
  );
}

async function lookupTossQuote(symbol, env = {}) {
  const encoded = encodeURIComponent(symbol);
  const [pricePayload, stockPayload] = await Promise.all([
    fetchTossOpenApi(`/api/v1/prices?symbols=${encoded}`, env),
    fetchTossOpenApi(`/api/v1/stocks?symbols=${encoded}`, env).catch(() => null)
  ]);
  const priceRows = Array.isArray(pricePayload?.result) ? pricePayload.result : [];
  const stockRows = Array.isArray(stockPayload?.result) ? stockPayload.result : [];
  const price = priceRows.find((row) => normalizeSymbol(row?.symbol) === symbol) || priceRows[0] || {};
  const stock = stockRows.find((row) => normalizeSymbol(row?.symbol) === symbol) || stockRows[0] || {};
  const current = Number(price.lastPrice || 0);
  if (!Number.isFinite(current) || current <= 0) throw new Error("toss_price_missing");
  const currency = String(price.currency || stock.currency || "").toUpperCase();
  const isDomestic = /^\d{6}$/.test(symbol) || currency === "KRW";
  const calendarPayload = await fetchTossOpenApi(`/api/v1/market-calendar/${isDomestic ? "KR" : "US"}`, env).catch(() => null);
  const marketCalendar = calendarPayload && typeof calendarPayload.result === "object" ? calendarPayload.result : {};
  return {
    name: cleanName(stock.name || stock.englishName || symbol, symbol) || symbol,
    currentPrice: isDomestic ? formatWon(current) : formatDollar(current),
    market: isDomestic ? TXT.domestic : TXT.us,
    source: "Toss OpenAPI",
    marketStats: {
      marketStatus: marketCalendar.marketStatus || marketCalendar.status || marketCalendar.session || ""
    },
    marketCalendar,
    valuation: emptyValuation("Toss OpenAPI")
  };
}

function naverRealtimePrice(payload) {
  const rows = Array.isArray(payload?.datas) ? payload.datas : [];
  const item = rows.find((row) => row && typeof row === "object") || {};
  const overInfo = item.overMarketPriceInfo && typeof item.overMarketPriceInfo === "object" ? item.overMarketPriceInfo : {};
  if (String(overInfo.overMarketStatus || "").toUpperCase() === "OPEN") {
    const overPrice = Number(cleanPrice(overInfo.overPrice));
    if (overPrice > 0) return formatWon(overPrice);
  }
  const closePrice = Number(cleanPrice(item.closePriceRaw || item.closePrice));
  return closePrice > 0 ? formatWon(closePrice) : "";
}

async function lookupDomesticRealtime(symbol) {
  const payload = await fetchJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${symbol}`);
  const row = Array.isArray(payload?.datas) ? payload.datas[0] : null;
  return {
    name: cleanName(row?.stockName || "", symbol),
    currentPrice: naverRealtimePrice(payload),
    market: TXT.domestic,
    source: "Naver Finance Realtime"
  };
}

async function lookupDomestic(symbol, env = {}) {
  try {
    const toss = await lookupTossQuote(symbol, env);
    return { ...toss, valuation: emptyValuation("Toss OpenAPI") };
  } catch (_) {}
  let realtime = {};
  try {
    realtime = await lookupDomesticRealtime(symbol);
  } catch (_) {}
  const html = realtime.currentPrice && realtime.name ? "" : await fetchText(`https://finance.naver.com/item/main.naver?code=${symbol}`);
  const valuationHtml = html || await fetchText(`https://finance.naver.com/item/main.naver?code=${symbol}`);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h2Match = html.match(/<div[^>]+class=["']wrap_company["'][\s\S]*?<h2[^>]*>([^<]+)<\/h2>/i);
  const priceMatch = html.match(/<p[^>]+class=["']no_today["'][\s\S]*?<span[^>]+class=["']blind["']>([^<]+)<\/span>/i);
  return {
    name: realtime.name || cleanName(h2Match?.[1] || titleMatch?.[1], symbol),
    currentPrice: realtime.currentPrice || formatWon(cleanHtml(priceMatch?.[1] || "")),
    market: TXT.domestic,
    source: realtime.currentPrice ? (realtime.source || "Naver Finance Realtime") : "Naver Finance",
    valuation: lookupDomesticValuationFromHtml(valuationHtml)
  };
}

async function lookupTossName(symbol) {
  const urls = [
    `https://www.tossinvest.com/stocks/${encodeURIComponent(symbol)}`,
    `https://www.tossinvest.com/stocks/US/${encodeURIComponent(symbol)}`
  ];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      const name = cleanName(ogMatch?.[1] || titleMatch?.[1], symbol);
      if (name) return name;
    } catch (_) {}
  }
  return "";
}

async function lookupYahoo(symbol) {
  const [dailyResponse, intradayResponse] = await Promise.all([
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`, {
      headers: { "user-agent": "Mozilla/5.0 DotoriWeb/1.0" }
    }),
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`, {
      headers: { "user-agent": "Mozilla/5.0 DotoriWeb/1.0" }
    })
  ]);
  if (!dailyResponse.ok) throw new Error(`HTTP ${dailyResponse.status}`);
  const dailyPayload = await dailyResponse.json();
  const intradayPayload = intradayResponse.ok ? await intradayResponse.json() : null;
  const dailyResult = dailyPayload?.chart?.result?.[0];
  const intradayResult = intradayPayload?.chart?.result?.[0];
  const dailyQuote = dailyResult?.indicators?.quote?.[0] || {};
  const dailyCloses = (dailyQuote.close || []).filter((value) => typeof value === "number");
  const dailyHighs = (dailyQuote.high || []).filter((value) => typeof value === "number");
  const dailyLows = (dailyQuote.low || []).filter((value) => typeof value === "number");
  const dailyVolumes = (dailyQuote.volume || []).filter((value) => typeof value === "number");
  const intradayQuote = intradayResult?.indicators?.quote?.[0] || {};
  const intradayCloses = (intradayQuote.close || []).filter((value) => typeof value === "number");
  const intradayHighs = (intradayQuote.high || []).filter((value) => typeof value === "number");
  const meta = intradayResult?.meta || dailyResult?.meta || {};
  const current = Number(meta.regularMarketPrice || intradayCloses[intradayCloses.length - 1] || dailyCloses[dailyCloses.length - 1] || 0);
  const previousClose = Number(meta.previousClose || dailyCloses[dailyCloses.length - 2] || 0);
  const dayHigh = Number(meta.regularMarketDayHigh || Math.max(...intradayHighs, 0));
  const lowCandidates = intradayCloses.filter((value) => value > 0);
  const dayLow = Number(meta.regularMarketDayLow || (lowCandidates.length ? Math.min(...lowCandidates) : 0));
  const changePct = current > 0 && previousClose > 0 ? ((current / previousClose) - 1) * 100 : 0;
  const fromHighPct = current > 0 && dayHigh > 0 ? ((current / dayHigh) - 1) * 100 : 0;
  return {
    current,
    closes: dailyCloses,
    highs: dailyHighs,
    lows: dailyLows,
    volumes: dailyVolumes,
    previousClose,
    dayHigh,
    dayLow,
    changePct,
    fromHighPct
  };
}

function crashWarning(base, moving, valuation, oilRisk) {
  const current = Number(base?.current || 0);
  const previousClose = Number(base?.previousClose || 0);
  const dayHigh = Number(base?.dayHigh || 0);
  const changePct = Number(base?.changePct || 0);
  const fromHighPct = Number(base?.fromHighPct || 0);
  const ma20 = Number(moving?.ma20 || 0);
  const per = Number(String(valuation?.per || "").replace(/,/g, ""));
  const pbr = Number(String(valuation?.pbr || "").replace(/,/g, ""));
  const oilText = `${oilRisk?.direction || ""} ${oilRisk?.changePct || ""}`;
  const reasons = [];
  let score = 0;
  if (changePct <= -7) {
    score += 4;
    reasons.push(`전일 대비 ${changePct.toFixed(2)}% 급락`);
  } else if (changePct <= -4) {
    score += 2;
    reasons.push(`전일 대비 ${changePct.toFixed(2)}% 하락`);
  }
  if (fromHighPct <= -7) {
    score += 4;
    reasons.push(`장중 고점 대비 ${fromHighPct.toFixed(2)}% 이탈`);
  } else if (fromHighPct <= -5) {
    score += 3;
    reasons.push(`장중 고점 대비 ${fromHighPct.toFixed(2)}% 하락`);
  }
  if (current > 0 && ma20 > 0 && current < ma20) {
    score += 2;
    reasons.push("20일선 이탈");
  }
  const psr = Number(String(valuation?.psr || "").replace(/,/g, ""));
  if ((Number.isFinite(psr) && psr >= 4) || (Number.isFinite(per) && per >= 25) || (Number.isFinite(pbr) && pbr >= 3)) {
    score += 1;
    reasons.push(Number.isFinite(psr) && psr >= 4 ? "PSR 매도 부담" : "밸류에이션 부담");
  }
  if (/유가 상승/.test(oilText)) {
    score += 1;
    reasons.push("유가상승발 금리 부담");
  }
  let level = "";
  if (score >= 6) level = "폭락주의보";
  else if (score >= 3) level = "급락경계";
  else if (score >= 1) level = "변동성 주의";
  else level = "주의보 없음";
  return {
    level,
    score,
    current: formatDollar(current),
    previousClose: formatDollar(previousClose),
    dayHigh: formatDollar(dayHigh),
    dayLow: formatDollar(base?.dayLow),
    changePct: current > 0 && previousClose > 0 ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "",
    fromHighPct: current > 0 && dayHigh > 0 ? `${fromHighPct >= 0 ? "+" : ""}${fromHighPct.toFixed(2)}%` : "",
    reasons,
    summary: reasons.length ? `${level} / ${reasons.join(" / ")}` : "폭락 징후 없음"
  };
}

async function lookupYahooLegacy(symbol) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`, {
    headers: { "user-agent": "Mozilla/5.0 DotoriWeb/1.0" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((value) => typeof value === "number");
  const meta = result?.meta || {};
  const current = Number(meta.regularMarketPrice || closes[closes.length - 1] || 0);
  return { current, closes };
}

async function lookupUs(symbol, env = {}) {
  const [toss, name, yahoo] = await Promise.all([
    lookupTossQuote(symbol, env).catch(() => null),
    lookupTossName(symbol).catch(() => ""),
    lookupYahoo(symbol).catch(() => ({ current: 0, closes: [] }))
  ]);
  return {
    name: toss?.name || name || symbol,
    currentPrice: toss?.currentPrice || formatDollar(yahoo.current),
    market: TXT.us,
    source: toss?.currentPrice ? "Toss OpenAPI/Yahoo Chart" : "Toss/Yahoo",
    closes: yahoo.closes,
    highs: yahoo.highs,
    lows: yahoo.lows,
    volumes: yahoo.volumes,
    marketStats: {
      previousClose: yahoo.previousClose || 0,
      dayHigh: yahoo.dayHigh || 0,
      dayLow: yahoo.dayLow || 0,
      changePct: yahoo.changePct || 0,
      fromHighPct: yahoo.fromHighPct || 0
    },
    valuation: emptyValuation(toss?.currentPrice ? "Toss OpenAPI" : "Yahoo Finance")
  };
}

async function lookupNews(query) {
  try {
    const html = await fetchText(`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(query)}`);
    const titles = [];
    const re = /<a[^>]+class=["'][^"']*news_tit[^"']*["'][^>]+title=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = re.exec(html)) && titles.length < 3) {
      const title = cleanHtml(match[1]);
      if (title && !titles.includes(title)) titles.push(title);
    }
    return titles;
  } catch (_) {
    return [];
  }
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function movingSignal(closes) {
  if (!Array.isArray(closes) || closes.length < 20) return { ma20: "", ma60: "", decision: TXT.wait };
  const last = closes[closes.length - 1];
  const ma20 = average(closes.slice(-20));
  const ma60 = closes.length >= 60 ? average(closes.slice(-60)) : 0;
  let decision = TXT.observe;
  if (last > ma20 && (!ma60 || last > ma60)) decision = TXT.buyReview;
  if (last < ma20 && ma60 && last < ma60) decision = TXT.risk;
  return {
    ma20: ma20 ? ma20.toFixed(2) : "",
    ma60: ma60 ? ma60.toFixed(2) : "",
    decision
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  const purchasePrice = Number(url.searchParams.get("purchasePrice") || 0);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const localOnly = url.searchParams.get("localOnly") === "1";
  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: "symbol_required" }), { status: 400, headers: JSON_HEADERS });
  }
  try {
    const cached = forceRefresh || localOnly ? null : await loadTursoReport(context.env, symbol).catch(() => null);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, storage: "turso" }), { headers: JSON_HEADERS });
    }
    const isDomestic = /^\d{6}$/.test(symbol);
    const base = isDomestic ? await lookupDomestic(symbol, context.env) : await lookupUs(symbol, context.env);
    const oilRisk = await lookupOilMarketRisk();
    const macroEventRisk = await ppiSemiconductorRisk();
    const news = await lookupNews(`${base.name || symbol} ${symbol}`);
    const moving = isDomestic ? { ma20: "", ma60: "", decision: TXT.wait } : movingSignal(base.closes || []);
    const valuation = base.valuation || emptyValuation(base.source);
    const fairValue = fairValueAnalysis(base.currentPrice, valuation, base.market);
    const technical = isDomestic
      ? technicalAnalysis({})
      : technicalAnalysis({ closes: base.closes || [], highs: base.highs || [], lows: base.lows || [], volumes: base.volumes || [] });
    const crashRisk = isDomestic
      ? crashWarning({}, moving, valuation, oilRisk)
      : crashWarning({ current: numericPrice(base.currentPrice), ...(base.marketStats || {}) }, moving, valuation, oilRisk);
    const watchSignal = /폭락주의보|급락경계/.test(crashRisk.level) ? crashRisk.level : TXT.observe;
    const currentNumber = numericPrice(base.currentPrice);
    const mock = purchasePrice > 0 && currentNumber > 0
      ? `${TXT.mockInvestment}: ${(((currentNumber / purchasePrice) - 1) * 100).toFixed(2)}%`
      : `${TXT.mockInvestment}: ${TXT.noPurchase}`;
    const payload = {
      ok: true,
      symbol,
      name: base.name || symbol,
      market: base.market,
      currentPrice: base.currentPrice || "-",
      valuation,
      fairValue,
      technical,
      marketRisk: oilRisk,
      macroEventRisk,
      crashRisk,
      savedAt: new Date().toISOString(),
      scanner: {
        title: base.name || symbol,
        summary: news.length ? news.join(" / ") : TXT.wait,
        sentiment: TXT.observe,
        risk: news.length ? TXT.newsScanner : TXT.wait
      },
      watchlist: {
        symbol,
        name: base.name || symbol,
        market: base.market,
        currentPrice: base.currentPrice || "-",
        signal: watchSignal,
        movingAverage: moving.decision,
        memo: news[0] || TXT.wait,
        valuation,
        fairValue,
        technical,
        marketRisk: oilRisk,
        macroEventRisk,
        crashRisk
      },
      learning: {
        topic: `${TXT.mockInvestment} - ${symbol}`,
        lesson: mock
      },
      moving: {
        name: base.name || symbol,
        symbol,
        ma20: formatPriceByMarket(moving.ma20, base.market) || TXT.wait,
        ma60: formatPriceByMarket(moving.ma60, base.market) || TXT.wait,
        decision: moving.decision
      },
      analysis: {
        title: `${TXT.analysis} - ${base.name || symbol}`,
        body: news.length ? news.join(" / ") : TXT.wait,
        valuation,
        fairValue,
        technical,
        marketRisk: oilRisk,
        macroEventRisk,
        crashRisk
      },
      sources: [base.source, oilRisk.source, "Naver News Search"].filter(Boolean)
    };
    if (!localOnly) {
      await saveTursoReport(context.env, symbol, payload).catch((error) => {
        console.error("turso_save_failed", error);
      });
    }
    return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), { status: 502, headers: JSON_HEADERS });
  }
}
