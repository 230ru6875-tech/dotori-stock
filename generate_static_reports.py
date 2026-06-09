from __future__ import annotations

import html
import json
import re
from datetime import datetime
from datetime import timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "public-snapshot.json"
REPORT_DIR = ROOT / "reports"
SITE_URL = "https://dotoristock.com"


def clean_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def esc(value: object) -> str:
    return html.escape(clean_text(value), quote=True)


def slug(symbol: object) -> str:
    text = clean_text(symbol).upper()
    text = re.sub(r"[^0-9A-Z._-]+", "-", text)
    return text.strip("-") or "UNKNOWN"


def valuation_text(item: dict, key: str) -> str:
    valuation = item.get("valuation") if isinstance(item.get("valuation"), dict) else {}
    value = clean_text(valuation.get(key) or "")
    return value or "확인 필요"


def valuation_summary(item: dict) -> str:
    valuation = item.get("valuation") if isinstance(item.get("valuation"), dict) else {}
    return clean_text(valuation.get("summary") or valuation.get("note") or "매수는 PBR, 매도는 PSR을 우선 확인합니다.")


def valuation_focus_text(item: dict, key: str, fallback: str) -> str:
    valuation = item.get("valuation") if isinstance(item.get("valuation"), dict) else {}
    return clean_text(valuation.get(key) or fallback)


def nested_text(item: dict, section: str, key: str, fallback: str = "확인 필요") -> str:
    data = item.get(section) if isinstance(item.get(section), dict) else {}
    value = clean_text(data.get(key) or "")
    return value or fallback


def nested_nested_text(item: dict, section: str, subsection: str, key: str, fallback: str = "확인 필요") -> str:
    data = item.get(section) if isinstance(item.get(section), dict) else {}
    sub = data.get(subsection) if isinstance(data.get(subsection), dict) else {}
    value = clean_text(sub.get(key) or "")
    return value or fallback


def market_risk_summary(item: dict) -> str:
    risk = item.get("marketRisk") if isinstance(item.get("marketRisk"), dict) else {}
    current = clean_text(risk.get("current") or "")
    change = clean_text(risk.get("changePct") or "")
    chain = clean_text(risk.get("chain") or "유가상승 > 인플레이션 우려 > 금리상승 > 주가부담")
    summary = clean_text(risk.get("summary") or "유가 상승은 인플레이션 우려와 금리상승 부담을 통해 주식 밸류에이션을 낮출 수 있습니다.")
    parts = [part for part in (f"WTI {current}" if current else "", change, chain, summary) if part]
    return " / ".join(parts)


def crash_risk_summary(item: dict) -> str:
    risk = item.get("crashRisk") if isinstance(item.get("crashRisk"), dict) else {}
    level = clean_text(risk.get("level") or "주의보 없음")
    if level == "주의보 없음":
        return "주의보 없음"
    change = clean_text(risk.get("changePct") or "")
    from_high = clean_text(risk.get("fromHighPct") or "")
    reasons = risk.get("reasons") if isinstance(risk.get("reasons"), list) else []
    reason_text = " / ".join(clean_text(row) for row in reasons if clean_text(row))
    parts = [level, f"전일대비 {change}" if change else "", f"고점대비 {from_high}" if from_high else "", reason_text]
    return " / ".join(part for part in parts if part)


def is_excluded_product(name: str) -> bool:
    lowered = name.lower()
    banned = [
        "tiger",
        "kodex",
        "sol ",
        "ace ",
        "etf",
        "etn",
        "레버리지",
        "인버스",
        "선물",
        "합성",
    ]
    return any(word in lowered for word in banned)


def normalize_name(item: dict) -> str:
    name = clean_text(item.get("name") or item.get("symbol") or "종목")
    symbol = clean_text(item.get("symbol"))
    if symbol and symbol not in name:
        return f"{name} ({symbol})"
    return name


def collect_items(data: dict) -> list[dict]:
    merged: dict[str, dict] = {}
    for section in ("watchlist", "movingAverages", "spikes", "scanner"):
        for item in data.get(section, []) or []:
            symbol = slug(item.get("symbol"))
            if not symbol or symbol == "UNKNOWN":
                continue
            target = merged.setdefault(symbol, {"symbol": symbol, "sections": set()})
            target.update({k: v for k, v in item.items() if v not in (None, "")})
            target["sections"].add(section)

    rows = []
    for item in merged.values():
        name = normalize_name(item)
        if is_excluded_product(name):
            continue
        item["displayName"] = name
        item["sectionList"] = ", ".join(sorted(item.pop("sections", [])))
        rows.append(item)

    def score(item: dict) -> tuple[int, str]:
        section_score = 0
        if "watchlist" in item.get("sectionList", ""):
            section_score += 100
        if "movingAverages" in item.get("sectionList", ""):
            section_score += 30
        if "spikes" in item.get("sectionList", ""):
            section_score += 20
        return (-section_score, item["displayName"])

    return sorted(rows, key=score)[:24]


def page_shell(title: str, description: str, canonical: str, body: str, schema: dict | None = None) -> str:
    schema_html = ""
    if schema:
        schema_html = "\n  <script type=\"application/ld+json\">\n  " + json.dumps(schema, ensure_ascii=False, indent=2).replace("\n", "\n  ") + "\n  </script>"
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{esc(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="도토리 주식분석 RSS" href="{SITE_URL}/rss.xml">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:site_name" content="도토리 주식분석">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <link rel="stylesheet" href="../styles.css">
  {schema_html}
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a class="brand" href="../">도토리 주식분석</a>
      <div class="nav-links">
        <a href="../">홈</a>
        <a href="./">종목 리포트</a>
        <a href="../about.html">사이트 정보</a>
        <a href="../disclaimer.html">투자 고지</a>
      </div>
    </nav>
  </header>
  <main class="plain-page">
    {body}
  </main>
  <footer class="site-footer">
    <div class="footer-inner">
      <p>(c) 2026 도토리 주식분석</p>
      <div><a href="../privacy.html">개인정보처리방침</a><a href="../terms.html">이용약관</a><a href="../disclaimer.html">투자 고지</a></div>
    </div>
  </footer>
</body>
</html>
"""


def report_body(item: dict, data: dict) -> str:
    name = item["displayName"]
    symbol = item["symbol"]
    current = clean_text(item.get("currentPrice") or "-")
    signal = clean_text(item.get("signal") or item.get("decision") or "-")
    summary = clean_text(item.get("summary") or item.get("memo") or item.get("note") or "-")
    market = clean_text(item.get("market") or "-")
    pred = clean_text(item.get("predRange") or "-")
    ma20 = clean_text(item.get("ma20") or "-")
    ma60 = clean_text(item.get("ma60") or "-")
    risk = clean_text(item.get("risk") or item.get("movingAverage") or "-")
    updated = clean_text(data.get("updatedAt") or "-")
    exchange = data.get("exchangeRate") or {}
    related_news = (data.get("newsList") or [])[:5]

    news_html = "".join(
        f"""<li><a href="{esc(news.get('url'))}" rel="nofollow noopener" target="_blank">{esc(news.get('title'))}</a><br><span>{esc(news.get('summary'))}</span></li>"""
        for news in related_news
    )
    if not news_html:
        news_html = "<li>표시할 공개 뉴스가 없습니다.</li>"

    return f"""<article>
      <p class="breadcrumb"><a href="./">종목 리포트</a> / {esc(symbol)}</p>
      <h1>{esc(name)} 리포트</h1>
      <p class="notice">이 페이지는 정보 제공 목적의 공개 리포트입니다. 특정 종목의 매수나 매도를 권유하지 않습니다.</p>

      <h2>요약</h2>
      <table class="plain-table">
        <tbody>
          <tr><th>종목</th><td>{esc(name)}</td></tr>
          <tr><th>시장</th><td>{esc(market)}</td></tr>
          <tr><th>현재가</th><td>{esc(current)}</td></tr>
          <tr><th>상태 표시</th><td>{esc(signal)}</td></tr>
          <tr><th>예상 범위</th><td>{esc(pred)}</td></tr>
          <tr><th>갱신 시각</th><td>{esc(updated)}</td></tr>
        </tbody>
      </table>

      <h2>가격과 추세 점검</h2>
      <p>{esc(summary)}</p>
      <ul>
        <li>20일선: {esc(ma20)}</li>
        <li>60일선: {esc(ma60)}</li>
        <li>위험 또는 확인 요소: {esc(risk)}</li>
      </ul>

      <h2>폭락주의보</h2>
      <p>{esc(crash_risk_summary(item))}</p>

      <h2>밸류에이션 점검</h2>
      <table class="plain-table">
        <tbody>
          <tr><th>적정주가 방식</th><td>{esc(nested_text(item, "fairValue", "method", "PBR 기준 적정주가"))}</td></tr>
          <tr><th>적정주가 보수</th><td>{esc(nested_text(item, "fairValue", "conservative"))}</td></tr>
          <tr><th>적정주가 중립</th><td>{esc(nested_text(item, "fairValue", "neutral"))}</td></tr>
          <tr><th>적정주가 성장</th><td>{esc(nested_text(item, "fairValue", "growth"))}</td></tr>
          <tr><th>매수 판단</th><td>{esc(valuation_focus_text(item, "buyFocus", "PBR 확인 필요"))}</td></tr>
          <tr><th>매도 판단</th><td>{esc(valuation_focus_text(item, "sellFocus", "PSR 확인 필요"))}</td></tr>
          <tr><th>PBR</th><td>{esc(valuation_text(item, "pbr"))}</td></tr>
          <tr><th>PSR</th><td>{esc(valuation_text(item, "psr"))}</td></tr>
          <tr><th>PER 보조</th><td>{esc(valuation_text(item, "per"))}</td></tr>
          <tr><th>FCF</th><td>{esc(valuation_text(item, "fcf"))}</td></tr>
          <tr><th>부채비율</th><td>{esc(valuation_text(item, "debtRatio"))}</td></tr>
          <tr><th>EV/EBITDA</th><td>{esc(valuation_text(item, "evEbitda"))}</td></tr>
        </tbody>
      </table>
      <p>{esc(valuation_summary(item))}</p>

      <h2>스토캐스틱과 거래량</h2>
      <table class="plain-table">
        <tbody>
          <tr><th>스토캐스틱 판단</th><td>{esc(nested_nested_text(item, "technical", "stochastic", "signal"))}</td></tr>
          <tr><th>%K</th><td>{esc(nested_nested_text(item, "technical", "stochastic", "k"))}</td></tr>
          <tr><th>%D</th><td>{esc(nested_nested_text(item, "technical", "stochastic", "d"))}</td></tr>
          <tr><th>거래량 판단</th><td>{esc(nested_nested_text(item, "technical", "volume", "signal"))}</td></tr>
          <tr><th>20일 평균 대비</th><td>{esc(nested_nested_text(item, "technical", "volume", "ratio"))}</td></tr>
        </tbody>
      </table>

      <h2>시장 참고 지표</h2>
      <p>오늘의 환율은 {esc(exchange.get("value") or "-")}이며, 변동 표시는 {esc(exchange.get("change") or "-")}입니다. 환율은 국내 투자자가 미국 주식과 수출주를 함께 볼 때 확인해야 하는 핵심 변수입니다.</p>
      <p>유가 변수는 {esc(market_risk_summary(item))}</p>

      <h2>관련 뉴스</h2>
      <ul>{news_html}</ul>

      <h2>읽는 방법</h2>
      <p>상태 표시는 가격, 이평선, 뉴스 흐름을 함께 보도록 돕는 참고 정보입니다. 실제 매매 전에는 증권사 현재가, 공시, 기업 실적, 환율, 시장 전체 흐름을 다시 확인해야 합니다.</p>
    </article>"""


def build_reports() -> list[str]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    REPORT_DIR.mkdir(exist_ok=True)
    items = collect_items(data)
    generated = []
    cards = []

    for item in items:
        symbol = slug(item["symbol"])
        filename = f"{symbol}.html"
        title = f"{item['displayName']} 주식 리포트 | 도토리 주식분석"
        description = f"{item['displayName']}의 현재가, 이평선, 상태 표시, 관련 뉴스를 정리한 공개 주식 리포트입니다."
        schema = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": title,
            "description": description,
            "mainEntityOfPage": f"{SITE_URL}/reports/{filename}",
            "author": {"@type": "Organization", "name": "도토리 주식분석"},
            "publisher": {"@type": "Organization", "name": "도토리 주식분석"},
            "about": item["displayName"],
            "inLanguage": "ko-KR",
            "datePublished": "2026-06-08",
            "dateModified": datetime.now(timezone.utc).date().isoformat(),
        }
        html_text = page_shell(
            title,
            description,
            f"{SITE_URL}/reports/{filename}",
            report_body(item, data),
            schema,
        )
        (REPORT_DIR / filename).write_text(html_text, encoding="utf-8", newline="\n")
        generated.append(filename)
        cards.append(
            f"""<article class="info-card"><h2><a href="./{esc(filename)}">{esc(item['displayName'])}</a></h2><p>현재가: {esc(item.get('currentPrice') or '-')}</p><p>상태 표시: {esc(item.get('signal') or item.get('decision') or '-')}</p></article>"""
        )

    index_body = f"""<article>
      <h1>종목 리포트</h1>
      <p>도토리 주식분석에서 공개 가능한 종목 데이터를 기준으로 생성한 색인용 리포트입니다. 각 페이지는 정보 제공 목적이며 특정 종목의 매매를 권유하지 않습니다.</p>
      <div class="info-grid report-index-grid">{''.join(cards)}</div>
    </article>"""
    index_schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "종목 리포트",
        "description": "도토리 주식분석 공개 종목 리포트 목록",
        "url": f"{SITE_URL}/reports/",
        "inLanguage": "ko-KR",
    }
    (REPORT_DIR / "index.html").write_text(
        page_shell(
            "종목 리포트 | 도토리 주식분석",
            "관심종목과 주요 후보의 공개 주식 리포트 목록입니다.",
            f"{SITE_URL}/reports/",
            index_body,
            index_schema,
        ),
        encoding="utf-8",
        newline="\n",
    )
    return generated


def update_sitemap(generated: list[str]) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    urls = [
        (f"{SITE_URL}/", "daily", "1.0"),
        (f"{SITE_URL}/stock-analysis.html", "weekly", "0.8"),
        (f"{SITE_URL}/reports/", "daily", "0.8"),
        (f"{SITE_URL}/about.html", "monthly", "0.7"),
        (f"{SITE_URL}/seo.html", "monthly", "0.7"),
        (f"{SITE_URL}/privacy.html", "monthly", "0.5"),
        (f"{SITE_URL}/terms.html", "monthly", "0.5"),
        (f"{SITE_URL}/disclaimer.html", "monthly", "0.5"),
    ]
    urls.extend((f"{SITE_URL}/reports/{name}", "daily", "0.6") for name in generated)
    body = "\n".join(
        f"  <url><loc>{loc}</loc><lastmod>{today}</lastmod><changefreq>{changefreq}</changefreq><priority>{priority}</priority></url>"
        for loc, changefreq, priority in urls
    )
    (ROOT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n',
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    generated = build_reports()
    update_sitemap(generated)
    print(json.dumps({"generated": len(generated), "updatedAt": datetime.now().isoformat(timespec="seconds")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
