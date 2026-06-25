const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const RANGE_MAP = {
  "6mo": "6mo",
  "1y": "1y",
  "2y": "2y",
  "5y": "5y"
};

const RANGE_DAYS = {
  "6mo": 210,
  "1y": 420,
  "2y": 820,
  "5y": 1900
};

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function parseSymbols(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[,\s]+/)
    .map(normalizeSymbol)
    .filter((symbol) => {
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    })
    .slice(0, 12);
}

function yahooCandidates(symbol) {
  if (/^\d{6}$/.test(symbol)) return [`${symbol}.KS`, `${symbol}.KQ`];
  return [symbol];
}

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function dashedDate(value) {
  const text = String(value || "");
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
}

async function fetchNaverName(symbol) {
  try {
    const response = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${symbol}`, {
      headers: {
        "accept": "application/json",
        "referer": `https://finance.naver.com/item/main.naver?code=${symbol}`,
        "user-agent": "Mozilla/5.0 DotoriWeb/1.0"
      }
    });
    if (!response.ok) return "";
    const payload = await response.json();
    return payload?.datas?.[0]?.stockName || "";
  } catch (_) {
    return "";
  }
}

async function fetchNaverDaily(symbol, range) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (RANGE_DAYS[range] || RANGE_DAYS["2y"]));
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(symbol)}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`;
  const response = await fetch(url, {
    headers: {
      "accept": "*/*",
      "referer": `https://finance.naver.com/item/sise_day.naver?code=${symbol}`,
      "user-agent": "Mozilla/5.0 DotoriWeb/1.0"
    }
  });
  if (!response.ok) throw new Error(`naver_http_${response.status}`);
  const text = await response.text();
  const rows = [];
  const rowPattern = /\["(\d{8})"\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/g;
  let match;
  while ((match = rowPattern.exec(text))) {
    rows.push({
      date: dashedDate(match[1]),
      open: Number(match[2]),
      high: Number(match[3]),
      low: Number(match[4]),
      close: Number(match[5]),
      volume: Number(match[6] || 0)
    });
  }
  if (rows.length < 80) throw new Error("naver_not_enough_daily_rows");
  const name = await fetchNaverName(symbol);
  return {
    ok: true,
    symbol,
    yahooSymbol: "",
    name: name || symbol,
    currency: "KRW",
    rows,
    source: "Naver Finance Chart"
  };
}

async function fetchYahooChart(yahooSymbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${encodeURIComponent(range)}&interval=1d&events=history`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 DotoriWeb/1.0"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0] || {};
  const timestamps = result?.timestamp || [];
  const rows = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    open: Number(quote.open?.[index]),
    high: Number(quote.high?.[index]),
    low: Number(quote.low?.[index]),
    close: Number(quote.close?.[index]),
    volume: Number(quote.volume?.[index] || 0)
  })).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite));
  if (rows.length < 80) throw new Error("not_enough_daily_rows");
  return {
    yahooSymbol,
    name: result?.meta?.longName || result?.meta?.shortName || yahooSymbol,
    currency: result?.meta?.currency || "",
    rows
  };
}

async function fetchOne(symbol, range) {
  const errors = [];
  if (/^\d{6}$/.test(symbol)) {
    try {
      return await fetchNaverDaily(symbol, range);
    } catch (error) {
      errors.push(`Naver:${String(error?.message || error)}`);
    }
  }
  for (const yahooSymbol of yahooCandidates(symbol)) {
    try {
      const data = await fetchYahooChart(yahooSymbol, range);
      return { ok: true, symbol, ...data, source: "Yahoo Finance Chart" };
    } catch (error) {
      errors.push(`${yahooSymbol}:${String(error?.message || error)}`);
    }
  }
  return { ok: false, symbol, error: errors.join(" / ") || "fetch_failed" };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbols = parseSymbols(url.searchParams.get("symbols") || url.searchParams.get("symbol"));
  const range = RANGE_MAP[url.searchParams.get("range")] || "2y";
  if (!symbols.length) {
    return new Response(JSON.stringify({ ok: false, error: "symbols_required" }), { status: 400, headers: JSON_HEADERS });
  }
  const results = await Promise.all(symbols.map((symbol) => fetchOne(symbol, range)));
  return new Response(JSON.stringify({
    ok: true,
    range,
    requested: symbols.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
    generatedAt: new Date().toISOString()
  }), { headers: JSON_HEADERS });
}
