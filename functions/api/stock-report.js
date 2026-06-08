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

async function lookupDomestic(symbol) {
  const html = await fetchText(`https://finance.naver.com/item/main.naver?code=${symbol}`);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h2Match = html.match(/<div[^>]+class=["']wrap_company["'][\s\S]*?<h2[^>]*>([^<]+)<\/h2>/i);
  const priceMatch = html.match(/<p[^>]+class=["']no_today["'][\s\S]*?<span[^>]+class=["']blind["']>([^<]+)<\/span>/i);
  return {
    name: cleanName(h2Match?.[1] || titleMatch?.[1], symbol),
    currentPrice: cleanHtml(priceMatch?.[1] || ""),
    market: TXT.domestic,
    source: "Naver Finance"
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

async function lookupUs(symbol) {
  const [name, yahoo] = await Promise.all([
    lookupTossName(symbol).catch(() => ""),
    lookupYahoo(symbol).catch(() => ({ current: 0, closes: [] }))
  ]);
  return {
    name: name || symbol,
    currentPrice: yahoo.current > 0 ? `$${yahoo.current.toFixed(2)}` : "",
    market: TXT.us,
    source: "Toss/Yahoo",
    closes: yahoo.closes
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
  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: "symbol_required" }), { status: 400, headers: JSON_HEADERS });
  }
  try {
    const cached = forceRefresh ? null : await loadTursoReport(context.env, symbol).catch(() => null);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, storage: "turso" }), { headers: JSON_HEADERS });
    }
    const isDomestic = /^\d{6}$/.test(symbol);
    const base = isDomestic ? await lookupDomestic(symbol) : await lookupUs(symbol);
    const news = await lookupNews(`${base.name || symbol} ${symbol}`);
    const moving = isDomestic ? { ma20: "", ma60: "", decision: TXT.wait } : movingSignal(base.closes || []);
    const currentNumber = Number(String(base.currentPrice || "").replace(/[^0-9.]/g, ""));
    const mock = purchasePrice > 0 && currentNumber > 0
      ? `${TXT.mockInvestment}: ${(((currentNumber / purchasePrice) - 1) * 100).toFixed(2)}%`
      : `${TXT.mockInvestment}: ${TXT.noPurchase}`;
    const payload = {
      ok: true,
      symbol,
      name: base.name || symbol,
      market: base.market,
      currentPrice: base.currentPrice || "-",
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
        signal: TXT.observe,
        movingAverage: moving.decision,
        memo: news[0] || TXT.wait
      },
      learning: {
        topic: `${TXT.mockInvestment} - ${symbol}`,
        lesson: mock
      },
      moving: {
        name: base.name || symbol,
        symbol,
        ma20: moving.ma20 || TXT.wait,
        ma60: moving.ma60 || TXT.wait,
        decision: moving.decision
      },
      analysis: {
        title: `${TXT.analysis} - ${base.name || symbol}`,
        body: news.length ? news.join(" / ") : TXT.wait
      },
      sources: [base.source, "Naver News Search"].filter(Boolean)
    };
    await saveTursoReport(context.env, symbol, payload).catch((error) => {
      console.error("turso_save_failed", error);
    });
    return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), { status: 502, headers: JSON_HEADERS });
  }
}
