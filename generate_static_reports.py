from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "public-snapshot.json"
REPORT_SOURCE_PATH = ROOT / "data" / "dotori-com-report.json"
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

FINANCE_DOMAIN_WEIGHT = {
    "finance.naver.com": 18,
    "stock.naver.com": 18,
    "infostock.co.kr": 16,
    "alphabiz.co.kr": 14,
    "mk.co.kr": 14,
    "daylongs.com": 12,
    "www.ppomppu.co.kr": 4,
    "www.clien.net": 2,
}

NEGATIVE_NEWS_TERMS = ("야구", "축구", "농구", "배구", "스폰서", "경기", "선수", "구단")


def repair_mojibake(text: str) -> str:
    raw = text
    candidates = [raw]
    for encoding in ("cp949", "euc-kr", "latin1"):
        try:
            repaired = raw.encode(encoding).decode("utf-8")
        except Exception:
            continue
        if repaired and repaired not in candidates:
            candidates.append(repaired)

    def score(candidate: str) -> tuple[int, int, int]:
        hangul = sum(1 for ch in candidate if "\uac00" <= ch <= "\ud7a3")
        replacement = candidate.count("\ufffd") + candidate.count("?")
        cjk_noise = sum(1 for ch in candidate if 0x2E80 <= ord(ch) <= 0x9FFF and not ("\uac00" <= ch <= "\ud7a3"))
        return (hangul * 4 - replacement * 5 - cjk_noise * 3, hangul, -replacement)

    return max(candidates, key=score)


def clean_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = repair_mojibake(text)
    text = text.replace("\u200b", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def esc(value: object) -> str:
    return html.escape(clean_text(value), quote=True)


def slug(symbol: object) -> str:
    text = clean_text(symbol).upper()
    text = re.sub(r"[^0-9A-Z._-]+", "-", text)
    return text.strip("-") or "UNKNOWN"


def is_meaningful(value: object) -> bool:
    text = clean_text(value)
    if not text or text in MISSING_TOKENS:
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
    decimals = 2 if "." in re.sub(r"[^0-9.]", "", raw) else 0
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


def name_without_symbol(name: str) -> str:
    return re.sub(r"\([^)]*\)", "", clean_text(name)).strip()


def is_excluded_product(name: str) -> bool:
    lowered = name.lower()
    banned = [
        "tiger",
        "kodex",
        "koact",
        "ace ",
        "sol ",
        "plus ",
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
        key = raw.strip()
        if not key:
            continue
        names.append(SECTION_LABELS.get(key, key))
    return ", ".join(names)


def pick_summary_text(item: dict) -> str:
    for key in ("summary", "memo", "note", "risk"):
        value = clean_text(item.get(key))
        if is_meaningful(value):
            return value
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    for key in ("summary", "predRange"):
        value = clean_text(analysis.get(key))
        if is_meaningful(value):
            return value
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    clues = evidence.get("clues") if isinstance(evidence.get("clues"), list) else []
    for clue in clues:
        if is_meaningful(clue):
            return clean_text(clue)
    return "가격과 거래량, 뉴스와 재무 조건을 함께 다시 확인해야 합니다."


def collect_items(snapshot: dict, report_source: dict) -> list[dict]:
    merged: dict[str, dict] = {}
    reports = (report_source or {}).get("reports") if isinstance(report_source, dict) else {}
    reports = reports if isinstance(reports, dict) else {}

    for section in ("watchlist", "movingAverages", "spikes", "scanner"):
        for row in snapshot.get(section, []) or []:
            if not isinstance(row, dict):
                continue
            symbol = slug(row.get("symbol"))
            if symbol == "UNKNOWN":
                continue
            target = merged.setdefault(symbol, {"symbol": symbol, "sections": set()})
            for key, value in row.items():
                if value not in (None, "", [], {}):
                    target[key] = value
            target["sections"].add(section)

    for symbol, report in reports.items():
        key = slug(symbol)
        if key == "UNKNOWN" or not isinstance(report, dict):
            continue
        target = merged.setdefault(key, {"symbol": key, "sections": set()})
        for base_key in ("name", "market", "currentPrice", "source", "quotedAt", "savedAt"):
            if report.get(base_key) not in (None, "", [], {}):
                target[base_key] = report[base_key]
        if isinstance(report.get("watchlist"), dict):
            target.setdefault("watchlist", {}).update(report["watchlist"])
        if isinstance(report.get("scanner"), dict):
            target.setdefault("scanner", {}).update(report["scanner"])
        if isinstance(report.get("analysis"), dict):
            target.setdefault("analysis", {}).update(report["analysis"])
        if isinstance(report.get("valuation"), dict):
            target["valuation"] = report["valuation"]
        if isinstance(report.get("technical"), dict):
            target["technical"] = report["technical"]

    rows = []
    for item in merged.values():
        item["displayName"] = normalize_name(item)
        if is_excluded_product(item["displayName"]):
            continue
        item["sectionList"] = ", ".join(sorted(item.pop("sections", [])))
        rows.append(item)

    def score(row: dict) -> tuple[int, int, str]:
        section_score = 0
        sections = row.get("sectionList", "")
        if "watchlist" in sections:
            section_score += 100
        if "scanner" in sections:
            section_score += 30
        if "spikes" in sections:
            section_score += 20
        if "movingAverages" in sections:
            section_score += 15
        current = numeric_price(row.get("currentPrice"))
        return (-section_score, -int(current), row["displayName"])

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


def valuation_rows(item: dict) -> list[tuple[str, str]]:
    valuation = item.get("valuation") if isinstance(item.get("valuation"), dict) else {}
    rows: list[tuple[str, str]] = []
    label_map = [
        ("PER", "per"),
        ("추정 PER", "estimatedPer"),
        ("PBR", "pbr"),
        ("PSR", "psr"),
        ("업종 PER", "industryPer"),
        ("FCF", "fcf"),
        ("부채비율", "debtRatio"),
        ("EV/EBITDA", "evEbitda"),
        ("매수 판단", "buyFocus"),
        ("매도 판단", "sellFocus"),
        ("기준 출처", "source"),
    ]
    for label, key in label_map:
        value = clean_text(valuation.get(key))
        if is_meaningful(value):
            rows.append((label, value))
    return rows


def technical_rows(item: dict) -> list[tuple[str, str]]:
    technical = item.get("technical") if isinstance(item.get("technical"), dict) else {}
    rows: list[tuple[str, str]] = []
    stochastic = technical.get("stochastic") if isinstance(technical.get("stochastic"), dict) else {}
    volume = technical.get("volume") if isinstance(technical.get("volume"), dict) else {}

    if is_meaningful(stochastic.get("signal")):
        rows.append(("스토캐스틱", clean_text(stochastic.get("signal"))))
    if is_meaningful(stochastic.get("k")):
        rows.append(("스토캐스틱 K", clean_text(stochastic.get("k"))))
    if is_meaningful(stochastic.get("d")):
        rows.append(("스토캐스틱 D", clean_text(stochastic.get("d"))))
    if is_meaningful(volume.get("signal")):
        rows.append(("거래량 판단", clean_text(volume.get("signal"))))
    if is_meaningful(volume.get("ratio")):
        rows.append(("20일 평균 대비", clean_text(volume.get("ratio"))))
    if is_meaningful(volume.get("latest")):
        rows.append(("최근 거래량", clean_text(volume.get("latest"))))
    if is_meaningful(volume.get("average20")):
        rows.append(("20일 평균 거래량", clean_text(volume.get("average20"))))
    return rows


def trend_paragraph(item: dict) -> str:
    signals = [
        clean_text(item.get("signal")),
        clean_text(item.get("decision")),
        nested_value(item, "watchlist", "signal"),
        nested_value(item, "watchlist", "movingAverage"),
    ]
    summary = pick_summary_text(item)
    parts = [signal for signal in signals if is_meaningful(signal)]
    if parts:
        lead = " / ".join(dict.fromkeys(parts))
        return f"{lead}. {summary}"
    return summary


def valuation_paragraph(item: dict, rows: list[tuple[str, str]]) -> str:
    valuation = item.get("valuation") if isinstance(item.get("valuation"), dict) else {}
    summary = clean_text(valuation.get("summary"))
    note = clean_text(valuation.get("note"))
    if is_meaningful(summary):
        return summary
    if rows and is_meaningful(note):
        return note
    if rows:
        return "공개된 가치 지표 중 확인 가능한 값만 추렸습니다. 숫자 하나보다 현재 가격이 어느 구간에 있는지와 과열 여부를 함께 봐야 합니다."
    return "가치 지표는 아직 비어 있습니다. 도토리연구소 수집값이 들어오기 전까지는 가격과 뉴스, 실적 흐름을 우선 확인해야 합니다."


def technical_paragraph(item: dict, rows: list[tuple[str, str]]) -> str:
    technical = item.get("technical") if isinstance(item.get("technical"), dict) else {}
    summary = clean_text(technical.get("summary"))
    if is_meaningful(summary):
        return summary
    if rows:
        return "스토캐스틱과 거래량 중 현재 공개된 값만 정리했습니다. 단기 타이밍은 이 값 하나보다 가격 위치와 거래량 회복 여부를 같이 봐야 합니다."
    return "기술 지표는 아직 비어 있습니다. 도토리연구소 수집값이 들어오기 전까지는 이평선과 당일 거래 흐름을 우선 확인해야 합니다."


def missing_checks(item: dict) -> list[str]:
    checks: list[str] = []
    if not valuation_rows(item):
        checks.append("가치지표")
    if not technical_rows(item):
        checks.append("기술지표")
    if not is_meaningful(item.get("predRange")) and not is_meaningful(nested_value(item, "analysis", "predRange")):
        checks.append("예상 범위")
    if not is_meaningful(item.get("industry")):
        checks.append("업종 분류")
    return checks


def missing_checks_paragraph(item: dict) -> str:
    checks = missing_checks(item)
    if not checks:
        return "현재 공개된 데이터 기준으로 기본 점검 항목은 채워져 있습니다. 실제 판단 전에는 공시와 당일 체결 흐름을 다시 확인해야 합니다."
    return "아직 더 확인해야 할 항목은 " + ", ".join(checks) + "입니다. 값이 비어 있는 구간은 단정 판단보다 관찰 우선으로 보는 편이 안전합니다."


def market_note(snapshot: dict) -> str:
    exchange = snapshot.get("exchangeRate") if isinstance(snapshot.get("exchangeRate"), dict) else {}
    parts = []
    if is_meaningful(exchange.get("value")):
        parts.append(f"환율 {clean_text(exchange.get('value'))}")
    if is_meaningful(exchange.get("change")):
        parts.append(f"변동 {clean_text(exchange.get('change'))}")
    if not parts:
        return "환율 데이터는 아직 준비 중입니다."
    return " / ".join(parts)


def token_candidates(item: dict) -> list[str]:
    tokens = set()
    symbol = clean_text(item.get("symbol")).upper()
    if symbol:
        tokens.add(symbol)
    display_name = clean_text(item.get("displayName"))
    base_name = name_without_symbol(display_name)
    if base_name:
        tokens.add(base_name)
    for source in (display_name, base_name):
        for token in re.findall(r"[A-Za-z]{2,}|[가-힣]{2,}", source):
            tokens.add(token.upper() if re.fullmatch(r"[A-Za-z]{2,}", token) else token)
    return sorted(tokens, key=len, reverse=True)


def news_relevance_score(item: dict, news: dict) -> int:
    title = clean_text(news.get("title"))
    summary = clean_text(news.get("summary"))
    combined = f"{title} {summary}".upper()
    score = 0
    for token in token_candidates(item):
        token_upper = token.upper()
        if token_upper == clean_text(item.get("symbol")).upper() and re.search(rf"(?<![A-Z0-9]){re.escape(token_upper)}(?![A-Z0-9])", combined):
            score += 110
            continue
        if token and token_upper in combined:
            score += max(18, min(len(token) * 6, 48))
    domain = clean_text(news.get("sourceDomain")).lower()
    score += FINANCE_DOMAIN_WEIGHT.get(domain, 0)
    if any(term in f"{title} {summary}" for term in NEGATIVE_NEWS_TERMS):
        score -= 25
    if clean_text(news.get("source")).lower() == "dotori-com":
        score += 6
    return score


def related_news_html(item: dict, snapshot: dict) -> str:
    scored_rows: list[tuple[int, dict]] = []
    for news in snapshot.get("newsList", []) or []:
        if not isinstance(news, dict):
            continue
        title = clean_text(news.get("title"))
        url = clean_text(news.get("url"))
        if not title or not url:
            continue
        score = news_relevance_score(item, news)
        if score <= 0:
            continue
        scored_rows.append((score, news))

    scored_rows.sort(key=lambda row: (-row[0], clean_text(row[1].get("title"))))
    selected = scored_rows[:5]
    if not selected:
        return "<p>현재 공개 뉴스 중 이 종목과 직접 연결되는 항목이 충분하지 않습니다. 관련 공시와 업종 뉴스, 실적 발표 일정을 함께 확인해야 합니다.</p>"

    rows = []
    for score, news in selected:
        title = clean_text(news.get("title"))
        url = clean_text(news.get("url"))
        summary = clean_text(news.get("summary"))
        source = clean_text(news.get("sourceDomain") or news.get("source"))
        as_of = clean_text(news.get("asOf"))
        meta = " | ".join(part for part in (source, as_of, f"관련도 {score}") if part)
        block = f'<li><a href="{esc(url)}" rel="nofollow noopener" target="_blank">{esc(title)}</a>'
        if meta:
            block += f'<br><span>{esc(meta)}</span>'
        if summary:
            block += f"<br><span>{esc(summary)}</span>"
        block += "</li>"
        rows.append(block)
    return "<ul>" + "".join(rows) + "</ul>"


def table_html(rows: list[tuple[str, str]]) -> str:
    if not rows:
        return ""
    body = "".join(f"<tr><th>{esc(label)}</th><td>{esc(value)}</td></tr>" for label, value in rows)
    return f'<table class="plain-table"><tbody>{body}</tbody></table>'


def report_body(item: dict, snapshot: dict, *, reports_home_href: str = "./") -> str:
    name = item["displayName"]
    symbol = item["symbol"]
    market = clean_text(item.get("market") or ("국내" if is_domestic_market(item) else "미국"))
    current = display_price(item.get("currentPrice"), item)
    pred = display_price_range(item.get("predRange") or nested_value(item, "analysis", "predRange"), item)
    signal = clean_text(item.get("signal") or item.get("decision") or nested_value(item, "watchlist", "signal") or "관찰")
    updated = clean_text(snapshot.get("updatedAt") or item.get("savedAt") or item.get("quotedAt") or "-")
    sections = section_labels(item)
    val_rows = valuation_rows(item)
    tech_rows = technical_rows(item)
    pred_row = f"<tr><th>예상 범위</th><td>{esc(pred)}</td></tr>" if pred != "-" else ""
    section_row = f"<tr><th>반영 화면</th><td>{esc(sections)}</td></tr>" if sections else ""
    evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
    clues = evidence.get("clues") if isinstance(evidence.get("clues"), list) else []
    clue_list = "".join(f"<li>{esc(clue)}</li>" for clue in clues[:5] if is_meaningful(clue))
    confirmations = evidence.get("confirmations") if isinstance(evidence.get("confirmations"), list) else []
    confirmation_list = "".join(f"<li>{esc(row)}</li>" for row in confirmations[:4] if is_meaningful(row))

    extra_sections = ""
    if clue_list:
        extra_sections += f"<h2>근거 단서</h2><ul>{clue_list}</ul>"
    if confirmation_list:
        extra_sections += f"<h2>추가 확인 조건</h2><ul>{confirmation_list}</ul>"

    return f"""<article>
      <p class="breadcrumb"><a href="{esc(reports_home_href)}">종목 리포트</a> / {esc(symbol)}</p>
      <h1>{esc(name)} 분석결과</h1>
      <p class="notice">이 페이지는 정보 제공 목적의 공개 리포트입니다. 특정 종목의 매수, 매도, 보유를 권유하지 않으며 실제 판단 전에는 원문 뉴스와 공시를 다시 확인해야 합니다.</p>

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

      <h2>가격과 추세</h2>
      <p>{esc(trend_paragraph(item))}</p>

      <h2>밸류에이션</h2>
      <p>{esc(valuation_paragraph(item, val_rows))}</p>
      {table_html(val_rows)}

      <h2>기술지표와 거래량</h2>
      <p>{esc(technical_paragraph(item, tech_rows))}</p>
      {table_html(tech_rows)}

      <h2>시장 참고 지표</h2>
      <p>{esc(market_note(snapshot))}. 환율과 지수 흐름이 큰 날은 같은 가격대라도 체감 리스크가 달라질 수 있습니다.</p>

      <h2>관련 뉴스</h2>
      {related_news_html(item, snapshot)}

      <h2>남은 확인 항목</h2>
      <p>{esc(missing_checks_paragraph(item))}</p>

      {extra_sections}

      <h2>읽는 방법</h2>
      <p>이 리포트는 점수표가 아니라 점검표에 가깝습니다. 상태 표시가 강하게 보이더라도 재무지표, 기술지표, 뉴스, 환율, 공시를 함께 확인해야 실제 판단의 질이 올라갑니다.</p>
    </article>"""


def load_history_manifest() -> list[dict]:
    if not HISTORY_MANIFEST_PATH.exists():
        return []
    try:
        payload = json.loads(HISTORY_MANIFEST_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            return []
        for row in payload:
            if not isinstance(row, dict):
                continue
            if clean_text(row.get("date")):
                continue
            generated_at = clean_text(row.get("generatedAt"))
            if len(generated_at) >= 10 and re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", generated_at):
                row["date"] = generated_at[:10]
        return payload
    except Exception:
        return []


def build_report_index(cards: list[str]) -> str:
    return f"""<article>
      <h1>종목 리포트</h1>
      <p>{SITE_NAME}에서 공개 가능한 종목 데이터를 기준으로 만든 리포트 목록입니다. 가격과 신호만이 아니라, 왜 후보로 남아 있는지와 어떤 값이 아직 부족한지를 함께 확인할 수 있게 정리했습니다.</p>
      <p><a href="./history/">이전 생성 자료 목록 보기</a></p>
      <div class="info-grid report-index-grid">{''.join(cards)}</div>
    </article>"""


def write_history_snapshot(batch_id: str, generated_meta: list[dict], now_local: datetime) -> None:
    batch_dir = HISTORY_DIR / batch_id
    batch_dir.mkdir(exist_ok=True)

    snapshot_summary = {
        "batchId": batch_id,
        "generatedAt": now_local.isoformat(timespec="seconds"),
        "date": now_local.strftime("%Y-%m-%d"),
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
      <p>이 페이지는 해당 시점에 생성된 종목 리포트를 묶어 둔 아카이브입니다. 과거 판단과 현재 판단을 비교할 때 참고용으로 보시면 됩니다.</p>
      <div class="info-grid report-index-grid">{cards}</div>
    </article>"""
    (batch_dir / "index.html").write_text(
        page_shell(
            f"종목 리포트 생성 이력 {now_local.strftime('%Y-%m-%d %H:%M:%S')} | {SITE_NAME}",
            "과거 시점의 종목 리포트 생성 결과를 모아 둔 아카이브입니다.",
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

    manifest = [row for row in load_history_manifest() if row.get("batchId") != batch_id]
    manifest.insert(
        0,
        {
            "batchId": batch_id,
            "generatedAt": now_local.isoformat(timespec="seconds"),
            "date": now_local.strftime("%Y-%m-%d"),
            "count": len(generated_meta),
            "path": f"/reports/history/{batch_id}/",
            "topItems": generated_meta[:5],
        },
    )
    HISTORY_MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    write_history_index(manifest)


def write_history_index(manifest: list[dict]) -> None:
    HISTORY_DIR.mkdir(exist_ok=True)
    available_dates = sorted({clean_text(entry.get("date")) for entry in manifest if clean_text(entry.get("date"))}, reverse=True)
    filter_buttons = ['<button type="button" class="history-filter-button active" data-filter-date="all">전체</button>']
    filter_buttons.extend(
        f'<button type="button" class="history-filter-button" data-filter-date="{esc(date)}">{esc(date)}</button>'
        for date in available_dates
    )

    sections = []
    for entry in manifest:
        top_items = entry.get("topItems") or []
        top_lines = "".join(
            f"<li>{esc(row.get('name'))} | {esc(row.get('price'))} | {esc(row.get('signal'))}</li>"
            for row in top_items
        )
        entry_date = clean_text(entry.get("date"))
        sections.append(
            f"""<article class="info-card history-entry" data-history-date="{esc(entry_date)}"><h2><a href="./{esc(entry.get('batchId'))}/">{esc(entry.get('generatedAt'))}</a></h2><p>생성 종목 수: {esc(entry.get('count'))}</p><p>기준 날짜: {esc(entry_date)}</p><ul>{top_lines}</ul></article>"""
        )

    filter_ui = f"""
      <div class="history-filter-wrap">
        <strong>날짜 필터</strong>
        <div class="history-filter-buttons">{''.join(filter_buttons)}</div>
      </div>
    """
    script = """
      <script>
      document.addEventListener('DOMContentLoaded', function () {
        const buttons = Array.from(document.querySelectorAll('[data-filter-date]'));
        const cards = Array.from(document.querySelectorAll('[data-history-date]'));
        buttons.forEach(function (button) {
          button.addEventListener('click', function () {
            const target = button.getAttribute('data-filter-date');
            buttons.forEach(function (other) { other.classList.remove('active'); });
            button.classList.add('active');
            cards.forEach(function (card) {
              const cardDate = card.getAttribute('data-history-date');
              card.style.display = target === 'all' || target === cardDate ? '' : 'none';
            });
          });
        });
      });
      </script>
    """
    body = f"""<article>
      <h1>종목 리포트 생성 이력</h1>
      <p>생성 시점별로 보관한 종목 리포트 목록입니다. 최신 리포트와 별도로, 날짜를 골라 이전 결과를 비교할 수 있게 구성했습니다.</p>
      {filter_ui}
      <div class="info-grid report-index-grid">{''.join(sections) or '<p>아직 저장된 이력이 없습니다.</p>'}</div>
    </article>{script}"""

    (HISTORY_DIR / "index.html").write_text(
        page_shell(
            f"종목 리포트 생성 이력 | {SITE_NAME}",
            "과거 생성 리포트 목록을 날짜별로 확인하는 아카이브 페이지입니다.",
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


def build_reports() -> list[str]:
    snapshot = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    report_source = json.loads(REPORT_SOURCE_PATH.read_text(encoding="utf-8")) if REPORT_SOURCE_PATH.exists() else {}
    REPORT_DIR.mkdir(exist_ok=True)
    HISTORY_DIR.mkdir(exist_ok=True)
    items = collect_items(snapshot, report_source)
    now_local = datetime.now().astimezone()
    batch_id = now_local.strftime("%Y%m%d-%H%M%S")
    generated: list[str] = []
    cards: list[str] = []
    generated_meta: list[dict] = []

    for item in items:
        symbol = slug(item["symbol"])
        filename = f"{symbol}.html"
        title = f"{item['displayName']} 분석결과 | {SITE_NAME}"
        description = f"{item['displayName']}의 현재가, 추세, 가치지표, 기술지표, 관련 뉴스, 남은 확인 조건을 정리한 공개 리포트입니다."
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
            "datePublished": now_local.date().isoformat(),
            "dateModified": datetime.now(timezone.utc).date().isoformat(),
        }
        current_html = page_shell(
            title,
            description,
            f"{SITE_URL}/reports/{filename}",
            report_body(item, snapshot, reports_home_href="./"),
            schema,
        )
        (REPORT_DIR / filename).write_text(current_html, encoding="utf-8", newline="\n")

        archive_html = page_shell(
            title,
            description,
            f"{SITE_URL}/reports/{filename}",
            report_body(item, snapshot, reports_home_href="./"),
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
        batch_dir = HISTORY_DIR / batch_id
        batch_dir.mkdir(exist_ok=True)
        (batch_dir / filename).write_text(archive_html, encoding="utf-8", newline="\n")

        current_price = display_price(item.get("currentPrice"), item)
        current_signal = clean_text(item.get("signal") or item.get("decision") or nested_value(item, "watchlist", "signal") or "관찰")
        current_summary = pick_summary_text(item)
        cards.append(
            f"""<article class="info-card"><h2><a href="./{esc(filename)}">{esc(item['displayName'])}</a></h2><p>현재가: {esc(current_price)}</p><p>상태 표시: {esc(current_signal)}</p><p>{esc(current_summary)}</p></article>"""
        )
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
        generated.append(filename)

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
            "국내주식과 미국주식 주요 후보의 현재가, 추세, 가치지표, 기술지표, 관련 뉴스, 남은 확인 조건을 모은 공개 리포트 목록입니다.",
            f"{SITE_URL}/reports/",
            build_report_index(cards),
            index_schema,
        ),
        encoding="utf-8",
        newline="\n",
    )

    write_history_snapshot(batch_id, generated_meta, now_local)
    return generated


def update_sitemap(generated: list[str]) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    urls = [
        (f"{SITE_URL}/", "daily", "1.0"),
        (f"{SITE_URL}/stock-analysis.html", "weekly", "0.8"),
        (f"{SITE_URL}/methodology.html", "weekly", "0.8"),
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
