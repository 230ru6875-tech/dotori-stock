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
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.results?.[0]?.response?.result || payload?.results?.[0] || null;
}

function tursoValue(cell) {
  if (!cell || typeof cell !== "object") return cell || null;
  if (cell.type === "null") return null;
  return "value" in cell ? cell.value : null;
}

async function lookupTursoSymbol(env, symbol) {
  try {
    const result = await tursoExecute(env, "SELECT payload FROM stock_reports WHERE symbol = ? LIMIT 1", [symbol]);
    const payload = result?.rows?.[0]?.[0] ? JSON.parse(tursoValue(result.rows[0][0])) : null;
    if (payload?.name) return { symbol, name: payload.name, market: payload.market || "", source: "Turso" };
  } catch (_) {}
  return null;
}

function cleanName(value, symbol) {
  let text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
  if (!text) return "";
  text = text
    .replace(/\s*:\s*\uB124\uC774\uBC84\uD398\uC774\s*\uC99D\uAD8C.*$/i, "")
    .replace(/\s*:\s*Npay\s*\uC99D\uAD8C.*$/i, "")
    .replace(/\s*-\s*Toss Invest.*$/i, "")
    .replace(/\s*\|\s*Toss Invest.*$/i, "")
    .replace(/\s*\|\s*\uD1A0\uC2A4\uC99D\uAD8C.*$/i, "")
    .trim();
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\s*\\(?${escaped}\\)?\\s*$`, "i"), "").trim();
}

function naverCompanyName(html, symbol) {
  const wrapMatch = String(html || "").match(/<div[^>]+class=["']wrap_company["'][\s\S]*?<\/div>\s*<\/div>/i);
  const h2Match = (wrapMatch?.[0] || "").match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return cleanName(h2Match?.[1] || "", symbol);
}

async function lookupNaverDomestic(symbol) {
  if (!/^\d{6}$/.test(symbol)) return null;
  const url = `https://finance.naver.com/item/main.naver?code=${symbol}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8"
    }
  });
  if (!response.ok) return null;
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const name = naverCompanyName(html, symbol) || cleanName(titleMatch?.[1], symbol);
  return name ? { symbol, name, market: "\uAD6D\uB0B4", source: "Naver Finance" } : null;
}

async function lookupTossUs(symbol) {
  if (/^\d{6}$/.test(symbol)) return null;
  const candidates = [
    `https://www.tossinvest.com/stocks/${encodeURIComponent(symbol)}`,
    `https://www.tossinvest.com/stocks/US/${encodeURIComponent(symbol)}`
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 DotoriWeb/1.0",
          "accept-language": "ko-KR,ko;q=0.9,en;q=0.8"
        }
      });
      if (!response.ok) continue;
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      const name = cleanName(ogMatch?.[1] || titleMatch?.[1], symbol);
      if (name) return { symbol, name, market: "\uD574\uC678", source: "Toss Invest" };
    } catch (_) {
      continue;
    }
  }
  return null;
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
  let result = null;
  try {
    result = await lookupTursoSymbol(context.env, symbol);
    result = result || (/^\d{6}$/.test(symbol)
      ? await lookupNaverDomestic(symbol)
      : await lookupTossUs(symbol));
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, symbol, error: String(error?.message || error) }), {
      status: 502,
      headers: JSON_HEADERS
    });
  }
  if (!result) {
    return new Response(JSON.stringify({ ok: false, symbol, error: "not_found" }), {
      status: 404,
      headers: JSON_HEADERS
    });
  }
  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: JSON_HEADERS
  });
}
