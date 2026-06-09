const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function cleanText(value, limit = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
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
  await tursoExecute(env, [
    "CREATE TABLE IF NOT EXISTS web_watchlist_interests (",
    "user_key TEXT NOT NULL,",
    "symbol TEXT NOT NULL,",
    "display_name TEXT,",
    "market TEXT,",
    "purchase_price REAL,",
    "source TEXT,",
    "active INTEGER NOT NULL DEFAULT 1,",
    "add_count INTEGER NOT NULL DEFAULT 1,",
    "last_quote TEXT,",
    "last_report TEXT,",
    "created_at TEXT NOT NULL,",
    "updated_at TEXT NOT NULL,",
    "last_seen_at TEXT NOT NULL,",
    "PRIMARY KEY (user_key, symbol)",
    ")"
  ].join(" "));
  await tursoExecute(env, "CREATE INDEX IF NOT EXISTS idx_web_watchlist_interests_symbol ON web_watchlist_interests(symbol, active, updated_at)");
  await tursoExecute(env, [
    "CREATE TABLE IF NOT EXISTS web_watchlist_interest_history (",
    "id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "user_key TEXT NOT NULL,",
    "symbol TEXT NOT NULL,",
    "display_name TEXT,",
    "market TEXT,",
    "action TEXT NOT NULL,",
    "payload TEXT,",
    "created_at TEXT NOT NULL",
    ")"
  ].join(" "));
  return true;
}

function safeJsonText(value, limit = 5000) {
  if (!value) return "";
  try {
    return JSON.stringify(value).slice(0, limit);
  } catch {
    return "";
  }
}

export async function onRequestGet(context) {
  try {
    if (!(await ensureTursoSchema(context.env))) {
      return new Response(JSON.stringify({ ok: false, error: "turso_not_configured" }), { status: 501, headers: JSON_HEADERS });
    }
    const url = new URL(context.request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 50), 200));
    const result = await tursoExecute(context.env, [
      "SELECT symbol,",
      "COALESCE(MAX(NULLIF(display_name, '')), symbol) AS display_name,",
      "COALESCE(MAX(NULLIF(market, '')), '') AS market,",
      "COUNT(DISTINCT user_key) AS user_count,",
      "SUM(add_count) AS add_count,",
      "MAX(updated_at) AS updated_at,",
      "MAX(last_seen_at) AS last_seen_at",
      "FROM web_watchlist_interests",
      "WHERE active = 1",
      "GROUP BY symbol",
      "ORDER BY user_count DESC, add_count DESC, last_seen_at DESC",
      "LIMIT ?"
    ].join(" "), [limit]);
    return new Response(JSON.stringify({ ok: true, items: tursoRows(result), generatedAt: new Date().toISOString() }), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), { status: 501, headers: JSON_HEADERS });
  }
}

export async function onRequestPost(context) {
  try {
    if (!(await ensureTursoSchema(context.env))) {
      return new Response(JSON.stringify({ ok: false, error: "turso_not_configured" }), { status: 501, headers: JSON_HEADERS });
    }
    const body = await context.request.json().catch(() => ({}));
    const symbol = normalizeSymbol(body.symbol);
    const userKey = cleanText(body.userKey, 80);
    if (!symbol || !userKey) {
      return new Response(JSON.stringify({ ok: false, error: "symbol_or_user_required" }), { status: 400, headers: JSON_HEADERS });
    }
    const now = new Date().toISOString();
    const action = cleanText(body.action || "add", 20) === "remove" ? "remove" : "add";
    const displayName = cleanText(body.name || body.displayName || symbol);
    const market = cleanText(body.market || (/^\d{6}$/.test(symbol) ? "국내" : "해외"), 20);
    const purchasePrice = Number(body.purchasePrice || 0);
    const active = action === "remove" ? 0 : 1;
    const payloadText = safeJsonText(body);

    await tursoExecute(context.env, [
      "INSERT INTO web_watchlist_interests",
      "(user_key, symbol, display_name, market, purchase_price, source, active, add_count, last_quote, last_report, created_at, updated_at, last_seen_at)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      "ON CONFLICT(user_key, symbol) DO UPDATE SET",
      "display_name = excluded.display_name,",
      "market = excluded.market,",
      "purchase_price = excluded.purchase_price,",
      "source = excluded.source,",
      "active = excluded.active,",
      "add_count = web_watchlist_interests.add_count + CASE WHEN excluded.active = 1 THEN 1 ELSE 0 END,",
      "last_quote = excluded.last_quote,",
      "last_report = excluded.last_report,",
      "updated_at = excluded.updated_at,",
      "last_seen_at = excluded.last_seen_at"
    ].join(" "), [
      userKey,
      symbol,
      displayName,
      market,
      Number.isFinite(purchasePrice) ? purchasePrice : 0,
      cleanText(body.source || "web", 40),
      active,
      safeJsonText(body.quote, 2000),
      safeJsonText(body.report, 3000),
      now,
      now,
      now
    ]);
    await tursoExecute(
      context.env,
      "INSERT INTO web_watchlist_interest_history (user_key, symbol, display_name, market, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [userKey, symbol, displayName, market, action, payloadText, now]
    );
    return new Response(JSON.stringify({ ok: true, symbol, action, savedAt: now }), { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), { status: 501, headers: JSON_HEADERS });
  }
}
