from __future__ import annotations

import html
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "public-snapshot.json"
REPORT_DIR = ROOT / "reports"
HISTORY_DIR = REPORT_DIR / "history"
HISTORY_MANIFEST_PATH = ROOT / "data" / "reports-history.json"
SITE_URL = "https://dotoristock.com"
SITE_NAME = "오늘의 주식"

MISSING_TOKENS = {
    "",
    "-",
    "조회 중",
    "데이터 대기",
    "확인 필요",
    "PBR 확인 필요",
    "PSR 확인 필요",
    "PER 확인 필요",
    "FCF 확인 필요",
    "부채비율 확인 필요",
    "EV/EBITDA 확인 필요",
}

SECTION_LABELS = {
    "watchlist": "관심종목",
    "movingAverages": "이평선",
    "spikes": "급등락",
    "scanner": "종목스캐너",
}


def clean_text(value: object) -> str:
    text = "" if value is None else str(value)
    return re.sub(r"\s+", " ", text).strip()


def esc(value: object) -> str:
    return html.escape(clean_text(value), quote=True)


def slug(symbol: object) -> str:
    text = clean_text(symbol).upper()
    text = re.sub(r"[^0-9A-Z._-]+", "-", text)
    return text.strip("-") or "UNKNOWN"


def is_meaningful(value: object) -> bool:
    text = clean_text(value)
    if not text:
        return False
    if text in MISSING_TOKENS:
        return False
    return "확인 필요" not in text


def numeric_price(value: object) -> float:
    text = re.sub(r"[^0-9.\-]", "", clean_text(value))
    try:
        return float(text)
    except ValueError:
        return 0.0


def is_domestic_market(item: dict) -> bool:
    market = clean_text(item.get("market"))
    symbol = clean_text(item.get("symbol"))
    return market == "국내" or bool(re.fullmatch(r"\d{6}", symbol))


def display_price(value: object, item: dict) -> str:
    raw = clean_text(value)
    if not is_meaningful(raw):
        return "-"
    price = numeric_price(raw)
    if price <= 0:
        return raw
    if is_domestic_market(item):
        return f"{round(price):,}원"
    decimals = 2 if "." in raw else 0
    return f"${price:,.{decimals}f}"


def display_price_range(value: object, item: dict) -> str:
    raw = clean_text(value)
    parts = [part.strip() for part in raw.split("~") if part.strip()]
    if len(parts) != 2:
        return display_price(raw, item) if is_meaningful(raw) else "-"
    return f"{display_price(parts[0], item)} ~ {display_price(parts[1], item)}"


def normalize_name(item: dict) -> str:
    name = clean_text(item.get("name") or item.get("symbol") or "종목")
    symbol = clean_text(item.get("symbol"))
    if symbol and symbol not in name:
        return f"{name} ({symbol})"
    return name


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
        "곱버스",
    ]
    return any(word in lowered for word in banned)


def section_labels(item: dict) -> str:
    names = []
    for raw in clean_text(item.get("sectionList")).split(","):
        raw = raw.strip()
        if not raw:
            continue
        names.append(SECTION_LABELS.get(raw, raw))
    return ", ".join(names)


def collect_items(data: dict) -> list[dict]:
    merged: dict[str, dict] = {}
    for section in ("watchlist", "movingAverages", "spikes", "scanner"):
        for item in data.get(section, []) or []:
            symbol = slug(item.get("symbol"))
            if symbol == "UNKNOWN":
                continue
            target = merged.setdefault(symbol, {"symbol": symbol, "sections": set()})
            for key, value in item.items():
                if value not in (None, "", [], {}):
                    target[key] = value
            target["sections"].add(section)

    rows = []
    for item in merged.values():
        name = normalize_name(item)
        if is_excluded_product(name):
            continue
        item["displayName"] = name
        item["sectionList"] = ", ".join(sorted(item.pop("sections", [])))
        rows.append(item)

    def score(row: dict) -> tuple[int, str]:
        section_score = 0
        section_list = row.get("sectionList", "")
        if "watchlist" in section_list:
            section_score += 100
        if "movingAverages" in section_list:
            section_score += 30
        if "spikes" in section_list:
            section_score += 20
        return (-section_score, row["displayName"])

    return sorted(rows, key=score)[:24]


def page_shell(
    title: str,
    description: str,
    canonical: str,
    body: str,
    schema: dict | None = None,
    *,
    asset_prefix: str = "../",
    home_href: str = "../",
    reports_href: str = "./",
    about_href: str = "../about.html",
    disclaimer_href: str = "../disclaimer.html",
    privacy_href: str = "../privacy.html",
    terms_href: str = "../terms.html",
    robots_content: str = "index, follow, max-image-preview:large",
) -> str:
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
  <meta name="robots" content="{esc(robots_content)}">
  <link rel="canonical" href="{esc(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="{esc(SITE_NAME)} RSS" href="{SITE_URL}/rss.xml">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:site_name" content="{esc(SITE_NAME)}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <link rel="stylesheet" href="{esc(asset_prefix)}styles.css">
  {schema_html}
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a class="brand" href="{esc(home_href)}">{esc(SITE_NAME)}</a>
      <div class="nav-links">
        <a href="{esc(home_href)}">홈</a>
        <a href="{esc(reports_href)}">종목 리포트</a>
        <a href="{esc(about_href)}">사이트 정보</a>
        <a href="{esc(disclaimer_href)}">투자 고지</a>
      </div>
    </nav>
  </header>
  <main class="plain-page">
    {body}
  </main>
  <footer class="site-footer">
    <div class="footer-inner">
      <p>(c) 2026 {esc(SITE_NAME)}</p>
      <div><a href="{esc(privacy_href)}">개인정보처리방침</a><a href="{esc(terms_href)}">이용약관</a><a href="{esc(disclaimer_href)}">투자 고지</a></div>
    </div>
  </footer>
</body>
</html>
"""


def nested_value(item: dict, section: str, key: str) -> str:
    data = item.get(section) if isinstance(item.get(section), dict) else {}
    return clean_text(data.get(key))


def nested_nested_value(item: dict, section: str, subsection: str, key: str) -> str:
    data = item.get(section) if isinstance(item.get(section), dict) else {}
    sub = data.get(subsection) if isinstance(data.get(subsection), dict) else {}
    return clean_text(sub.get(key))


def valuation_rows(item: dict) -> list[tuple[str, str]]:
    rows = []
    fair_value = item.get("fairValue") if isinstance(item.get("fairValue"), dict) else {}
    if is_meaningful(fair_value.get("method")):
        rows.append(("적정주가 방식", clean_text(fair_value.get("method"))))
    for label, key in (("적정주가 보수", "conservative"), ("적정주가 중립", "neutral"), ("적정주가 성장", "growth")):
        value = clean_text(fair_value.get(key))
        if is_meaningful(value):
            rows.append((label, value))

    valuation = item.get("valuation") if isinstance(item.get("valuation"), dict) else {}
    for label, key in (
        ("매수 판단", "buyFocus"),
        ("매도 판단", "sellFocus"),
        ("PBR", "pbr"),
        ("PSR", "psr"),
        ("PER", "per"),
        ("FCF", "fcf"),
        ("부채비율", "debtRatio"),
        ("EV/EBITDA", "evEbitda"),
    ):
        value = clean_text(valuation.get(key))
        if is_meaningful(value):
            rows.append((label, value))
    return rows


def technical_rows(item: dict) -> list[tuple[str, str]]:
    rows = []
    for label, value in (
        ("스토캐스틱 판단", nested_nested_value(item, "technical", "stochastic", "signal")),
        ("%K", nested_nested_value(item, "technical", "stochastic", "k")),
        ("%D", nested_nested_value(item, "technical", "stochastic", "d")),
        ("거래량 판단", nested_nested_value(item, "technical", "volume", "signal")),
        ("20일 평균 대비", nested_nested_value(item, "technical", "volume", "ratio")),
    ):
        if is_meaningful(value):
            rows.append((label, value))
    return rows


def table_html(rows: list[tuple[str, str]]) -> str:
    if not rows:
        return ""
    body = "".join(f"<tr><th>{esc(label)}</th><td>{esc(value)}</td></tr>" for label, value in rows)
    return f'<table class="plain-table"><tbody>{body}</tbody></table>'


def pick_summary_text(item: dict) -> str:
    for key in ("summary", "memo", "note", "reason", "sectionReason"):
        value = clean_text(item.get(key))
        if is_meaningful(value):
            return value
    return "현재 공개 데이터 기준으로 가격 흐름과 보조 신호를 우선 점검해야 하는 종목입니다."


def trend_paragraph(item: dict) -> str:
    current = display_price(item.get("currentPrice"), item)
    ma20 = display_price(item.get("ma20"), item)
    ma60 = display_price(item.get("ma60"), item)
    signal = clean_text(item.get("signal") or item.get("decision"))
    parts = [f"현재가는 {current}입니다."] if current != "-" else []
    if ma20 != "-" or ma60 != "-":
        ma_parts = []
        if ma20 != "-":
            ma_parts.append(f"20일선은 {ma20}")
        if ma60 != "-":
            ma_parts.append(f"60일선은 {ma60}")
        parts.append(", ".join(ma_parts) + " 기준으로 추세를 확인합니다.")
    if signal:
        parts.append(f"현재 상태 표시는 {signal}입니다.")
    parts.append(pick_summary_text(item))
    return " ".join(parts)


def valuation_paragraph(item: dict, rows: list[tuple[str, str]]) -> str:
    if rows:
        summary = clean_text((item.get("valuation") or {}).get("summary") if isinstance(item.get("valuation"), dict) else "")
        if is_meaningful(summary):
            return summary
        return "공개된 밸류에이션 데이터 중 확인 가능한 값만 정리했습니다. 숫자는 절대 기준이 아니라 현재 가격이 어떤 구간에 있는지 비교하는 보조 자료로 봐야 합니다."
    return "현재 공개 데이터 기준으로 밸류에이션 값은 아직 충분하지 않습니다. 실적 발표, 재무지표, 업종 평균과 함께 추가 확인이 필요합니다."


def technical_paragraph(item: dict, rows: list[tuple[str, str]]) -> str:
    if rows:
        return "스토캐스틱과 거래량 중 공개 데이터로 확인 가능한 항목만 정리했습니다. 타이밍 판단은 이 값 하나보다 가격 위치와 뉴스 흐름을 함께 봐야 합니다."
    return "기술 보조지표는 아직 공개 데이터가 충분하지 않습니다. 현재가와 이평선, 장중 거래량 흐름을 우선 확인하는 편이 낫습니다."


def missing_checks(item: dict) -> list[str]:
    checks = []
    if not valuation_rows(item):
        checks.append("재무지표")
    if not technical_rows(item):
        checks.append("기술 보조지표")
    if not is_meaningful(item.get("predRange")):
        checks.append("예상 범위")
    if not is_meaningful(item.get("industry")):
        checks.append("업종 분류")
    return checks


def missing_checks_paragraph(item: dict) -> str:
    checks = missing_checks(item)
    if not checks:
        return "현재 공개 데이터 기준으로 핵심 확인 항목은 대부분 채워져 있습니다. 실제 주문 전에는 증권사 현재가와 공시를 다시 확인하면 됩니다."
    return "아직 더 확인해야 할 항목은 " + ", ".join(checks) + "입니다. 값이 비어 있는 구간은 확정 판단보다 관찰 우선으로 보는 편이 안전합니다."


def related_news_html(data: dict) -> str:
    news_rows = []
    for news in (data.get("newsList") or [])[:5]:
        title = clean_text(news.get("title"))
        url = clean_text(news.get("url"))
        summary = clean_text(news.get("summary"))
        if not title or not url:
            continue
        block = f'<li><a href="{esc(url)}" rel="nofollow noopener" target="_blank">{esc(title)}</a>'
        if summary:
            block += f"<br><span>{esc(summary)}</span>"
        block += "</li>"
        news_rows.append(block)
    if not news_rows:
        return "<p>현재 공개된 관련 뉴스가 많지 않아 가격과 추세를 우선 확인해야 합니다.</p>"
    return "<ul>" + "".join(news_rows) + "</ul>"


def report_body(item: dict, data: dict, *, reports_home_href: str = "./") -> str:
    name = item["displayName"]
    symbol = item["symbol"]
    market = clean_text(item.get("market") or ("국내" if is_domestic_market(item) else "미국"))
    current = display_price(item.get("currentPrice"), item)
    pred = display_price_range(item.get("predRange"), item)
    signal = clean_text(item.get("signal") or item.get("decision") or "관찰")
    updated = clean_text(data.get("updatedAt") or "-")
    exchange = data.get("exchangeRate") or {}
    exchange_value = clean_text(exchange.get("value") or "-")
    exchange_change = clean_text(exchange.get("change") or "-")
    sections = section_labels(item)

    val_rows = valuation_rows(item)
    tech_rows = technical_rows(item)

    pred_row = f'<tr><th>예상 범위</th><td>{esc(pred)}</td></tr>' if pred != "-" else ""
    section_row = f'<tr><th>반영 화면</th><td>{esc(sections)}</td></tr>' if sections else ""

    market_note_parts = []
    if exchange_value != "-":
        market_note_parts.append(f"환율은 {exchange_value}")
    if exchange_change != "-":
        market_note_parts.append(f"변동 표시는 {exchange_change}")
    market_note = " / ".join(market_note_parts) if market_note_parts else "환율 데이터는 대기 중입니다."

    return f"""<article>
      <p class="breadcrumb"><a href="{esc(reports_home_href)}">종목 리포트</a> / {esc(symbol)}</p>
      <h1>{esc(name)} 분석결과</h1>
      <p class="notice">이 페이지는 정보 제공 목적의 공개 리포트입니다. 특정 종목의 매수, 매도, 보유를 권유하지 않으며 실제 주문 전에는 증권사 현재가와 공시를 다시 확인해야 합니다.</p>

      <h2>요약</h2>
      <table class="plain-table">
        <tbody>
          <tr><th>종목</th><td>{esc(name)}</td></tr>
          <tr><th>시장</th><td>{esc(market)}</td></tr>
          <tr><th>현재가</th><td>{esc(current)}</td></tr>
          <tr><th>상태 표시</th><td>{esc(signal)}</td></tr>
          {pred_row}
          {section_row}
          <tr><th>갱신 시각</th><td>{esc(updated)}</td></tr>
        </tbody>
      </table>

      <h2>가격과 추세 점검</h2>
      <p>{esc(trend_paragraph(item))}</p>

      <h2>밸류에이션 점검</h2>
      <p>{esc(valuation_paragraph(item, val_rows))}</p>
      {table_html(val_rows)}

      <h2>기술지표와 거래량</h2>
      <p>{esc(technical_paragraph(item, tech_rows))}</p>
      {table_html(tech_rows)}

      <h2>추가 확인 조건</h2>
      <p>{esc(missing_checks_paragraph(item))}</p>

      <h2>시장 참고 지표</h2>
      <p>{esc(market_note)}입니다. 환율과 지수 흐름은 특히 미국주식과 수출주를 볼 때 같이 확인해야 하는 변수입니다.</p>

      <h2>관련 뉴스</h2>
      {related_news_html(data)}

      <h2>읽는 방법</h2>
      <p>이 리포트는 점수표가 아니라 점검표에 가깝습니다. 상태 표시가 강하게 보이더라도 재무지표, 기술지표, 뉴스, 환율, 공시, 장중 거래 가능 수량을 함께 확인해야 실제 판단의 질이 올라갑니다.</p>
    </article>"""


def build_reports() -> list[str]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    REPORT_DIR.mkdir(exist_ok=True)
    HISTORY_DIR.mkdir(exist_ok=True)
    items = collect_items(data)
    generated = []
    cards = []
    generated_meta = []
    now_local = datetime.now().astimezone()
    batch_id = now_local.strftime("%Y%m%d-%H%M%S")
    batch_dir = HISTORY_DIR / batch_id
    batch_dir.mkdir(exist_ok=True)

    for item in items:
        symbol = slug(item["symbol"])
        filename = f"{symbol}.html"
        title = f"{item['displayName']} 분석결과 | {SITE_NAME}"
        description = f"{item['displayName']}의 현재가, 추세, 밸류에이션, 기술지표, 뉴스 확인 조건을 정리한 공개 리포트입니다."
        schema = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": title,
            "description": description,
            "mainEntityOfPage": f"{SITE_URL}/reports/{filename}",
            "author": {"@type": "Organization", "name": SITE_NAME},
            "publisher": {"@type": "Organization", "name": SITE_NAME},
            "about": item["displayName"],
            "inLanguage": "ko-KR",
            "datePublished": "2026-06-18",
            "dateModified": datetime.now(timezone.utc).date().isoformat(),
        }
        current_body = report_body(item, data, reports_home_href="./")
        html_text = page_shell(
            title,
            description,
            f"{SITE_URL}/reports/{filename}",
            current_body,
            schema,
        )
        (REPORT_DIR / filename).write_text(html_text, encoding="utf-8", newline="\n")

        archive_body = report_body(item, data, reports_home_href="./")
        archive_html = page_shell(
            title,
            description,
            f"{SITE_URL}/reports/{filename}",
            archive_body,
            schema,
            asset_prefix="../../../",
            home_href="../../../",
            reports_href="../../",
            about_href="../../../about.html",
            disclaimer_href="../../../disclaimer.html",
            privacy_href="../../../privacy.html",
            terms_href="../../../terms.html",
            robots_content="noindex, follow",
        )
        (batch_dir / filename).write_text(archive_html, encoding="utf-8", newline="\n")

        generated.append(filename)

        current_price = display_price(item.get("currentPrice"), item)
        current_signal = clean_text(item.get("signal") or item.get("decision") or "관찰")
        current_summary = pick_summary_text(item)
        generated_meta.append(
            {
                "symbol": symbol,
                "name": item["displayName"],
                "price": current_price,
                "signal": current_signal,
                "summary": current_summary,
                "filename": filename,
            }
        )

        cards.append(
            f"""<article class="info-card"><h2><a href="./{esc(filename)}">{esc(item['displayName'])}</a></h2><p>현재가: {esc(current_price)}</p><p>상태 표시: {esc(current_signal)}</p><p>{esc(current_summary)}</p></article>"""
        )

    index_body = f"""<article>
      <h1>종목 리포트</h1>
      <p>{SITE_NAME}에서 공개 가능한 종목 데이터를 기준으로 생성한 리포트 목록입니다. 각 페이지는 가격과 신호만이 아니라 왜 이 종목을 보는지, 어떤 값이 부족한지, 실제로 무엇을 더 확인해야 하는지까지 함께 정리합니다.</p>
      <p><a href="./history/">이전 생성 자료 목록 보기</a></p>
      <div class="info-grid report-index-grid">{''.join(cards)}</div>
    </article>"""

    index_schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "종목 리포트",
        "description": f"{SITE_NAME} 공개 종목 리포트 목록",
        "url": f"{SITE_URL}/reports/",
        "inLanguage": "ko-KR",
    }

    (REPORT_DIR / "index.html").write_text(
        page_shell(
            f"종목 리포트 | {SITE_NAME}",
            "국내주식과 미국주식 주요 후보의 공개 리포트 목록입니다.",
            f"{SITE_URL}/reports/",
            index_body,
            index_schema,
        ),
        encoding="utf-8",
        newline="\n",
    )

    write_history_snapshot(batch_id, generated_meta, now_local)
    return generated


def load_history_manifest() -> list[dict]:
    if not HISTORY_MANIFEST_PATH.exists():
        return []
    try:
        data = json.loads(HISTORY_MANIFEST_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def write_history_snapshot(batch_id: str, generated_meta: list[dict], now_local: datetime) -> None:
    batch_dir = HISTORY_DIR / batch_id
    snapshot_summary = {
        "batchId": batch_id,
        "generatedAt": now_local.isoformat(timespec="seconds"),
        "count": len(generated_meta),
        "items": generated_meta,
    }
    (batch_dir / "summary.json").write_text(json.dumps(snapshot_summary, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    cards = "".join(
        f"""<article class="info-card"><h2><a href="./{esc(row['filename'])}">{esc(row['name'])}</a></h2><p>현재가: {esc(row['price'])}</p><p>상태 표시: {esc(row['signal'])}</p><p>{esc(row['summary'])}</p></article>"""
        for row in generated_meta
    )
    snapshot_body = f"""<article>
      <p class="breadcrumb"><a href="../">생성 이력</a> / {esc(batch_id)}</p>
      <h1>종목 리포트 생성 이력 {esc(now_local.strftime("%Y-%m-%d %H:%M:%S"))}</h1>
      <p>이 페이지는 해당 시점에 생성된 종목 리포트를 보관하는 스냅샷입니다. 과거 자료 비교용이며 검색 노출 대상은 아닙니다.</p>
      <div class="info-grid report-index-grid">{cards}</div>
    </article>"""
    (batch_dir / "index.html").write_text(
        page_shell(
            f"종목 리포트 생성 이력 {now_local.strftime('%Y-%m-%d %H:%M:%S')} | {SITE_NAME}",
            "과거 시점의 종목 리포트 생성 결과를 보관하는 아카이브입니다.",
            f"{SITE_URL}/reports/history/{batch_id}/",
            snapshot_body,
            None,
            asset_prefix="../../../",
            home_href="../../../",
            reports_href="../../",
            about_href="../../../about.html",
            disclaimer_href="../../../disclaimer.html",
            privacy_href="../../../privacy.html",
            terms_href="../../../terms.html",
            robots_content="noindex, follow",
        ),
        encoding="utf-8",
        newline="\n",
    )

    manifest = load_history_manifest()
    manifest = [row for row in manifest if row.get("batchId") != batch_id]
    manifest.insert(
        0,
        {
            "batchId": batch_id,
            "generatedAt": now_local.isoformat(timespec="seconds"),
            "count": len(generated_meta),
            "path": f"/reports/history/{batch_id}/",
            "topItems": generated_meta[:5],
        },
    )
    HISTORY_MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    write_history_index(manifest)


def write_history_index(manifest: list[dict]) -> None:
    HISTORY_DIR.mkdir(exist_ok=True)
    sections = []
    for entry in manifest:
        top_items = entry.get("topItems") or []
        top_lines = "".join(
            f"<li>{esc(row.get('name'))} | {esc(row.get('price'))} | {esc(row.get('signal'))}</li>"
            for row in top_items
        )
        sections.append(
            f"""<article class="info-card"><h2><a href="./{esc(entry.get('batchId'))}/">{esc(entry.get('generatedAt'))}</a></h2><p>생성 종목 수: {esc(entry.get('count'))}</p><ul>{top_lines}</ul></article>"""
        )

    body = f"""<article>
      <h1>종목 리포트 생성 이력</h1>
      <p>생성 시점마다 보관한 종목 리포트 목록입니다. 최신 리포트와 별도로 이전 결과를 비교할 수 있도록 유지합니다.</p>
      <div class="info-grid report-index-grid">{''.join(sections) or '<p>아직 저장된 이력이 없습니다.</p>'}</div>
    </article>"""

    (HISTORY_DIR / "index.html").write_text(
        page_shell(
            f"종목 리포트 생성 이력 | {SITE_NAME}",
            "과거 생성 리포트 목록을 확인하는 아카이브 페이지입니다.",
            f"{SITE_URL}/reports/history/",
            body,
            None,
            asset_prefix="../../",
            home_href="../../",
            reports_href="../",
            about_href="../../about.html",
            disclaimer_href="../../disclaimer.html",
            privacy_href="../../privacy.html",
            terms_href="../../terms.html",
            robots_content="noindex, follow",
        ),
        encoding="utf-8",
        newline="\n",
    )


def update_sitemap(generated: list[str]) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    urls = [
        (f"{SITE_URL}/", "daily", "1.0"),
        (f"{SITE_URL}/stock-analysis.html", "weekly", "0.8"),
        (f"{SITE_URL}/reports/", "daily", "0.8"),
        (f"{SITE_URL}/reports/history/", "weekly", "0.4"),
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
