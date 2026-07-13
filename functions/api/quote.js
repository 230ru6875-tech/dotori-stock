const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
const DOMESTIC_FETCH_TIMEOUT_MS = 1600;
const US_FETCH_TIMEOUT_MS = 2200;
const DOMESTIC_TOSS_TIMEOUT_MS = 1700;
const US_TOSS_TIMEOUT_MS = 2400;
const BATCH_SYMBOL_LIMIT = 30;

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
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

function cleanName(value, symbol) {
  let text = cleanHtml(value);
  if (!text) return "";
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(/\s*:\s*\uB124\uC774\uBC84\uD398\uC774\s*\uC99D\uAD8C.*$/i, "")
    .replace(/\s*:\s*Npay\s*\uC99D\uAD8C.*$/i, "")
    .replace(/\s*-\s*Yahoo Finance.*$/i, "")
    .replace(new RegExp(`\\s*\\(?${escaped}\\)?\\s*$`, "i"), "")
    .trim();
}

function naverCompanyName(html, symbol) {
  const wrapMatch = String(html || "").match(/<div[^>]+class=["']wrap_company["'][\s\S]*?<\/div>\s*<\/div>/i);
  const h2Match = (wrapMatch?.[0] || "").match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return cleanName(h2Match?.[1] || "", symbol);
}

async function fetchText(url, timeoutMs = US_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = US_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
        "accept": "application/json",
        "referer": "https://finance.naver.com"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = US_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {})
      }
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

function formatWon(value) {
  const number = Number(cleanPrice(String(value || "").replace(/[^0-9.\-]/g, "")));
  if (!Number.isFinite(number) || number <= 0) return "";
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

function formatDollar(value) {
  const number = Number(String(value || "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "";
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
  const isDomesticPath = /market-calendar\/KR|\/prices\?symbols=\d|\/stocks\?symbols=\d/i.test(path);
  return await fetchJsonWithTimeout(
    `https://openapi.tossinvest.com${path}`,
    {
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${token}`
      }
    },
    isDomesticPath ? DOMESTIC_TOSS_TIMEOUT_MS : US_TOSS_TIMEOUT_MS
  );
}

async function quoteToss(symbol, env = {}) {
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
    symbol,
    name: cleanName(stock.name || stock.englishName || symbol, symbol) || symbol,
    market: isDomestic ? "\uAD6D\uB0B4" : "\uD574\uC678",
    currentPrice: isDomestic ? formatWon(current) : formatDollar(current),
    source: "Toss OpenAPI",
    tossQuotedAt: price.timestamp || "",
    marketStatus: marketCalendar.marketStatus || marketCalendar.status || marketCalendar.session || "",
    marketCalendar
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

async function quoteDomesticRealtime(symbol) {
  const payload = await fetchJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${symbol}`, DOMESTIC_FETCH_TIMEOUT_MS);
  const row = Array.isArray(payload?.datas) ? payload.datas[0] : null;
  return {
    name: cleanName(row?.stockName || "", symbol),
    currentPrice: naverRealtimePrice(payload),
    source: "Naver Finance Realtime"
  };
}

async function quoteDomestic(symbol, env = {}) {
  try {
    return await quoteToss(symbol, env);
  } catch (_) {}
  let realtime = {};
  try {
    realtime = await quoteDomesticRealtime(symbol);
  } catch (_) {}
  const html = realtime.currentPrice && realtime.name ? "" : await fetchText(`https://finance.naver.com/item/main.naver?code=${symbol}`, DOMESTIC_FETCH_TIMEOUT_MS);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const priceMatch = html.match(/<p[^>]+class=["']no_today["'][\s\S]*?<span[^>]+class=["']blind["']>([^<]+)<\/span>/i);
  return {
    symbol,
    name: realtime.name || naverCompanyName(html, symbol) || cleanName(titleMatch?.[1], symbol) || symbol,
    market: "\uAD6D\uB0B4",
    currentPrice: realtime.currentPrice || formatWon(cleanHtml(priceMatch?.[1] || "")),
    source: realtime.currentPrice ? (realtime.source || "Naver Finance Realtime") : "Naver Finance"
  };
}

async function quoteYahoo(symbol) {
  const payload = await fetchJsonWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`,
    { headers: { "user-agent": "Mozilla/5.0 DotoriWeb/1.0" } }
    ,
    US_FETCH_TIMEOUT_MS
  );
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).filter((value) => typeof value === "number");
  const highs = (quote.high || []).filter((value) => typeof value === "number");
  const lows = (quote.low || []).filter((value) => typeof value === "number");
  const current = Number(meta.regularMarketPrice || closes[closes.length - 1] || 0);
  const previousClose = Number(meta.previousClose || 0);
  const dayHigh = Number(meta.regularMarketDayHigh || (highs.length ? Math.max(...highs) : 0));
  const dayLow = Number(meta.regularMarketDayLow || (lows.length ? Math.min(...lows) : 0));
  return {
    symbol,
    name: cleanName(meta.longName || meta.shortName || symbol, symbol) || symbol,
    market: "\uD574\uC678",
    currentPrice: formatDollar(current),
    previousClose: formatDollar(previousClose),
    dayHigh: formatDollar(dayHigh),
    dayLow: formatDollar(dayLow),
    crashRisk: crashRiskFromQuote({ current, previousClose, dayHigh, dayLow }),
    source: "Yahoo Finance"
  };
}

function parseDollar(value) {
  const text = String(value || "").replace(/[^0-9.\-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function crashRiskFromQuote(stats) {
  const current = Number(stats?.current || 0);
  const previousClose = Number(stats?.previousClose || 0);
  const dayHigh = Number(stats?.dayHigh || 0);
  const changePct = current > 0 && previousClose > 0 ? ((current / previousClose) - 1) * 100 : Number(stats?.changePct || 0);
  const fromHighPct = current > 0 && dayHigh > 0 ? ((current / dayHigh) - 1) * 100 : 0;
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
  let level = "주의보 없음";
  if (score >= 6) level = "폭락주의보";
  else if (score >= 3) level = "급락경계";
  else if (score >= 1) level = "변동성 주의";
  return {
    level,
    score,
    previousClose: formatDollar(previousClose),
    dayHigh: formatDollar(dayHigh),
    dayLow: formatDollar(stats?.dayLow),
    changePct: current > 0 && previousClose > 0 ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "",
    fromHighPct: current > 0 && dayHigh > 0 ? `${fromHighPct >= 0 ? "+" : ""}${fromHighPct.toFixed(2)}%` : "",
    reasons,
    summary: reasons.length ? `${level} / ${reasons.join(" / ")}` : "폭락 징후 없음"
  };
}

async function quoteNasdaq(symbol) {
  const payload = await fetchJsonWithTimeout(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`,
    {
      headers: {
        "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
        "accept": "application/json",
        "origin": "https://www.nasdaq.com",
        "referer": "https://www.nasdaq.com/"
      }
    },
    US_FETCH_TIMEOUT_MS
  );
  const data = payload?.data || {};
  const primary = data.primaryData || {};
  const secondary = data.secondaryData || {};
  const priceText = primary.lastSalePrice || secondary.lastSalePrice || "";
  const price = parseDollar(priceText);
  if (!price) throw new Error("nasdaq_price_missing");
  const netChange = parseDollar(primary.netChange || secondary.netChange || "");
  const pctText = String(primary.percentageChange || secondary.percentageChange || "").replace(/[^0-9.\-]/g, "");
  const changePct = Number(pctText);
  const previousClose = netChange ? price - netChange : (Number.isFinite(changePct) && changePct !== 0 ? price / (1 + changePct / 100) : 0);
  const crashRisk = crashRiskFromQuote({ current: price, previousClose, changePct });
  return {
    symbol,
    name: cleanName(data.companyName || symbol, symbol) || symbol,
    market: "\uD574\uC678",
    currentPrice: formatDollar(price),
    previousClose: formatDollar(previousClose),
    changePct: Number.isFinite(changePct) ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "",
    crashRisk,
    source: primary.isRealTime ? "Nasdaq Real-Time" : "Nasdaq"
  };
}

async function quoteUs(symbol, env = {}) {
  try {
    const toss = await quoteToss(symbol, env);
    const yahoo = await quoteYahoo(symbol).catch(() => null);
    if (!yahoo?.crashRisk) return toss;
    return {
      ...toss,
      previousClose: yahoo.previousClose,
      dayHigh: yahoo.dayHigh,
      dayLow: yahoo.dayLow,
      crashRisk: yahoo.crashRisk,
      source: "Toss OpenAPI/Yahoo Chart"
    };
  } catch (_) {}
  try {
    const nasdaq = await quoteNasdaq(symbol);
    const yahoo = await quoteYahoo(symbol).catch(() => null);
    if (!yahoo?.crashRisk) return nasdaq;
    return {
      ...nasdaq,
      dayHigh: yahoo.dayHigh || nasdaq.dayHigh,
      dayLow: yahoo.dayLow || nasdaq.dayLow,
      crashRisk: crashRiskFromQuote({
        current: parseDollar(nasdaq.currentPrice),
        previousClose: parseDollar(nasdaq.previousClose || yahoo.previousClose),
        dayHigh: parseDollar(yahoo.dayHigh),
        dayLow: parseDollar(yahoo.dayLow),
        changePct: parseDollar(nasdaq.changePct)
      }),
      source: `${nasdaq.source}/Yahoo Chart`
    };
  } catch (_) {
    return await quoteYahoo(symbol);
  }
}

function parseSymbolsParam(url) {
  const raw = url.searchParams.get("symbols");
  if (!raw) return [];
  const seen = new Set();
  return raw
    .split(",")
    .map((item) => normalizeSymbol(item))
    .filter((symbol) => {
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    })
    .slice(0, BATCH_SYMBOL_LIMIT);
}

async function quoteSingle(symbol, env = {}) {
  return /^\d{6}$/.test(symbol) ? await quoteDomestic(symbol, env) : await quoteUs(symbol, env);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbols = parseSymbolsParam(url);
  if (symbols.length) {
    const settled = await Promise.allSettled(symbols.map(async (symbol) => [symbol, await quoteSingle(symbol, context.env)]));
    const quotes = {};
    const errors = {};
    settled.forEach((entry, index) => {
      const symbol = symbols[index];
      if (entry.status === "fulfilled") {
        const quote = Array.isArray(entry.value) ? entry.value[1] : entry.value;
        quotes[symbol] = { ...quote, quotedAt: new Date().toISOString() };
      } else {
        errors[symbol] = String(entry.reason?.message || entry.reason || "quote_failed");
      }
    });
    return new Response(JSON.stringify({
      ok: true,
      batch: true,
      requested: symbols.length,
      succeeded: Object.keys(quotes).length,
      failed: Object.keys(errors).length,
      quotes,
      errors,
      quotedAt: new Date().toISOString()
    }), { headers: JSON_HEADERS });
  }
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: "symbol_required" }), { status: 400, headers: JSON_HEADERS });
  }
  try {
    const quote = await quoteSingle(symbol, context.env);
    return new Response(JSON.stringify({ ok: true, ...quote, quotedAt: new Date().toISOString() }), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), { status: 502, headers: JSON_HEADERS });
  }
}
