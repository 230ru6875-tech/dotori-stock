const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: "symbol_required" }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }
  try {
    if (!(await ensureTursoSchema(context.env))) {
      return new Response(JSON.stringify({ ok: false, symbol, error: "turso_not_configured" }), {
        status: 501,
        headers: JSON_HEADERS
      });
    }
    const result = await tursoExecute(context.env, "SELECT payload FROM stock_reports WHERE symbol = ? LIMIT 1", [symbol]);
    const rows = tursoRows(result);
    if (!rows.length || !rows[0].payload) {
      return new Response(JSON.stringify({ ok: false, symbol, error: "not_found" }), {
        status: 404,
        headers: JSON_HEADERS
      });
    }
    return new Response(rows[0].payload, { headers: JSON_HEADERS });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), {
      status: 501,
      headers: JSON_HEADERS
    });
  }
}
