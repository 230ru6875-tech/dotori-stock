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
    .replace(/\s*-\s*Yahoo Finance.*$/i, "")
    .replace(new RegExp(`\\s*\\(?${escaped}\\)?\\s*$`, "i"), "")
    .trim();
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

async function quoteDomestic(symbol) {
  const html = await fetchText(`https://finance.naver.com/item/main.naver?code=${symbol}`);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h2Match = html.match(/<div[^>]+class=["']wrap_company["'][\s\S]*?<h2[^>]*>([^<]+)<\/h2>/i);
  const priceMatch = html.match(/<p[^>]+class=["']no_today["'][\s\S]*?<span[^>]+class=["']blind["']>([^<]+)<\/span>/i);
  return {
    symbol,
    name: cleanName(h2Match?.[1] || titleMatch?.[1], symbol) || symbol,
    market: "\uAD6D\uB0B4",
    currentPrice: cleanHtml(priceMatch?.[1] || ""),
    source: "Naver Finance"
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
    market: "\uBBF8\uAD6D",
    currentPrice: current > 0 ? `$${current.toFixed(2)}` : "",
    source: "Yahoo Finance"
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: "symbol_required" }), { status: 400, headers: JSON_HEADERS });
  }
  try {
    const quote = /^\d{6}$/.test(symbol) ? await quoteDomestic(symbol) : await quoteYahoo(symbol);
    return new Response(JSON.stringify({ ok: true, ...quote, quotedAt: new Date().toISOString() }), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), { status: 502, headers: JSON_HEADERS });
  }
}
