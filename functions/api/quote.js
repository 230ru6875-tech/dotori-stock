const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

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

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
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

function cleanPrice(value) {
  return String(value || "").replace(/,/g, "").trim();
}

function naverRealtimePrice(payload) {
  const rows = Array.isArray(payload?.datas) ? payload.datas : [];
  const item = rows.find((row) => row && typeof row === "object") || {};
  const overInfo = item.overMarketPriceInfo && typeof item.overMarketPriceInfo === "object" ? item.overMarketPriceInfo : {};
  if (String(overInfo.overMarketStatus || "").toUpperCase() === "OPEN") {
    const overPrice = Number(cleanPrice(overInfo.overPrice));
    if (overPrice > 0) return String(Math.round(overPrice));
  }
  const closePrice = Number(cleanPrice(item.closePriceRaw || item.closePrice));
  return closePrice > 0 ? String(Math.round(closePrice)) : "";
}

async function quoteDomesticRealtime(symbol) {
  const payload = await fetchJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${symbol}`);
  const row = Array.isArray(payload?.datas) ? payload.datas[0] : null;
  return {
    name: cleanName(row?.stockName || "", symbol),
    currentPrice: naverRealtimePrice(payload),
    source: "Naver Finance Realtime"
  };
}

async function quoteDomestic(symbol) {
  let realtime = {};
  try {
    realtime = await quoteDomesticRealtime(symbol);
  } catch (_) {}
  const html = realtime.currentPrice && realtime.name ? "" : await fetchText(`https://finance.naver.com/item/main.naver?code=${symbol}`);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const priceMatch = html.match(/<p[^>]+class=["']no_today["'][\s\S]*?<span[^>]+class=["']blind["']>([^<]+)<\/span>/i);
  return {
    symbol,
    name: realtime.name || naverCompanyName(html, symbol) || cleanName(titleMatch?.[1], symbol) || symbol,
    market: "\uAD6D\uB0B4",
    currentPrice: realtime.currentPrice || cleanHtml(priceMatch?.[1] || ""),
    source: realtime.currentPrice ? (realtime.source || "Naver Finance Realtime") : "Naver Finance"
  };
}

async function quoteYahoo(symbol) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`, {
    headers: { "user-agent": "Mozilla/5.0 DotoriWeb/1.0" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).filter((value) => typeof value === "number");
  const current = Number(meta.regularMarketPrice || closes[closes.length - 1] || 0);
  return {
    symbol,
    name: cleanName(meta.longName || meta.shortName || symbol, symbol) || symbol,
    market: "\uD574\uC678",
    currentPrice: current > 0 ? `$${current.toFixed(2)}` : "",
    source: "Yahoo Finance"
  };
}

function parseDollar(value) {
  const text = String(value || "").replace(/[^0-9.\-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function quoteNasdaq(symbol) {
  const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`, {
    headers: {
      "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
      "accept": "application/json",
      "origin": "https://www.nasdaq.com",
      "referer": "https://www.nasdaq.com/"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const data = payload?.data || {};
  const primary = data.primaryData || {};
  const secondary = data.secondaryData || {};
  const priceText = primary.lastSalePrice || secondary.lastSalePrice || "";
  const price = parseDollar(priceText);
  if (!price) throw new Error("nasdaq_price_missing");
  return {
    symbol,
    name: cleanName(data.companyName || symbol, symbol) || symbol,
    market: "\uD574\uC678",
    currentPrice: `$${price.toFixed(2)}`,
    source: primary.isRealTime ? "Nasdaq Real-Time" : "Nasdaq"
  };
}

async function quoteUs(symbol) {
  try {
    return await quoteNasdaq(symbol);
  } catch (_) {
    return await quoteYahoo(symbol);
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: "symbol_required" }), { status: 400, headers: JSON_HEADERS });
  }
  try {
    const quote = /^\d{6}$/.test(symbol) ? await quoteDomestic(symbol) : await quoteUs(symbol);
    return new Response(JSON.stringify({ ok: true, ...quote, quotedAt: new Date().toISOString() }), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), { status: 502, headers: JSON_HEADERS });
  }
}
