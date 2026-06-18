from __future__ import annotations

import html
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DAILY_DIR = ROOT / "daily"
SNAPSHOT_PATH = DATA_DIR / "public-snapshot.json"
REPORT_SOURCE_PATH = DATA_DIR / "dotori-com-report.json"
REPORTS_HISTORY_PATH = DATA_DIR / "reports-history.json"
MANIFEST_PATH = DATA_DIR / "daily-market-history.json"
SITEMAP_PATH = ROOT / "sitemap.xml"

SITE_NAME = "오늘의 주식"
SITE_URL = "https://dotoristock.com"
KST = timezone(timedelta(hours=9))


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def parse_dt(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(text, fmt)
                break
            except ValueError:
                dt = None
        if dt is None:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)
    return dt.astimezone(KST)


def numeric(value: object) -> float:
    text = re.sub(r"[^0-9.\-]", "", str(value or ""))
    try:
        return float(text)
    except ValueError:
        return 0.0


def market_label(value: object) -> str:
    text = str(value or "").strip()
    if text in {"국내", "국내장", "KR"}:
        return "국내"
    if text in {"미국", "국외", "US"}:
        return "미국"
    return text or "미분류"


def price_text(value: object, market: str) -> str:
    price = numeric(value)
    if price <= 0:
        return "-"
    if market == "국내":
        return f"{round(price):,}원"
    return f"${price:,.2f}"


def latest_completed_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    current = (now or datetime.now(KST)).astimezone(KST)
    cutoff = current.replace(hour=6, minute=0, second=0, microsecond=0)
    if current < cutoff:
        cutoff -= timedelta(days=1)
    return cutoff - timedelta(days=1), cutoff


def rows_in_window(rows: list[dict], key_names: tuple[str, ...], start: datetime, end: datetime) -> list[dict]:
    matched: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        dt = None
        for key in key_names:
            dt = parse_dt(row.get(key))
            if dt is not None:
                break
        if dt is None or not (start <= dt <= end):
            continue
        matched.append(row)
    return matched


def top_scanner_rows(snapshot: dict, market: str, limit: int = 5) -> list[dict]:
    rows = [row for row in snapshot.get("scanner", []) if isinstance(row, dict) and market_label(row.get("market")) == market]
    rows.sort(key=lambda row: (numeric(row.get("score")), numeric(row.get("currentPrice"))), reverse=True)
    return rows[:limit]


def top_growth_rows(snapshot: dict, market: str, limit: int = 5) -> list[dict]:
    rows = [row for row in snapshot.get("growthDiscovery", []) if isinstance(row, dict) and market_label(row.get("market")) == market]
    rows.sort(key=lambda row: (numeric(row.get("score")), numeric(row.get("return20d"))), reverse=True)
    return rows[:limit]


def top_spike_rows(snapshot: dict, limit: int = 6) -> list[dict]:
    rows = [row for row in snapshot.get("spikes", []) if isinstance(row, dict)]
    rows.sort(key=lambda row: abs(numeric(row.get("change"))), reverse=True)
    return rows[:limit]


def top_ma_rows(snapshot: dict, limit: int = 6) -> list[dict]:
    rows = [row for row in snapshot.get("movingAverages", []) if isinstance(row, dict)]
    rows.sort(key=lambda row: numeric(row.get("score")), reverse=True)
    return rows[:limit]


def strong_buy_count(report_source: dict) -> int:
    reports = report_source.get("reports", {}) if isinstance(report_source, dict) else {}
    if not isinstance(reports, dict):
        return 0
    count = 0
    for report in reports.values():
        if not isinstance(report, dict):
            continue
        watch = report.get("watchlist", {}) if isinstance(report.get("watchlist"), dict) else {}
        scanner = report.get("scanner", {}) if isinstance(report.get("scanner"), dict) else {}
        signal = str(watch.get("signal") or scanner.get("signal") or "").strip()
        if signal == "강한 매수":
            count += 1
    return count


def top_themes(snapshot: dict, limit: int = 5) -> list[str]:
    counter: Counter[str] = Counter()
    for row in snapshot.get("growthDiscovery", []):
        if not isinstance(row, dict):
            continue
        theme = str(row.get("theme", "") or "").strip()
        if theme:
            counter[theme] += 1
    return [name for name, _count in counter.most_common(limit)]


def report_batches_in_window(start: datetime, end: datetime) -> list[dict]:
    manifest = load_json(REPORTS_HISTORY_PATH, [])
    if not isinstance(manifest, list):
        return []
    return rows_in_window(manifest, ("generatedAt", "date"), start, end)


def build_digest_payload(now: datetime | None = None) -> dict:
    snapshot = load_json(SNAPSHOT_PATH, {})
    report_source = load_json(REPORT_SOURCE_PATH, {})
    start, end = latest_completed_window(now)
    news_rows = rows_in_window(snapshot.get("newsList", []) if isinstance(snapshot, dict) else [], ("asOf", "updatedAt"), start, end)
    if not news_rows:
        news_rows = [row for row in snapshot.get("newsList", []) if isinstance(row, dict)][:10]
    scanner_kr = top_scanner_rows(snapshot, "국내")
    scanner_us = top_scanner_rows(snapshot, "미국")
    growth_kr = top_growth_rows(snapshot, "국내")
    growth_us = top_growth_rows(snapshot, "미국")
    spikes = top_spike_rows(snapshot)
    moving = top_ma_rows(snapshot)
    watchlist = [row for row in snapshot.get("watchlist", []) if isinstance(row, dict)]
    morning = [row for row in snapshot.get("morningNote", []) if isinstance(row, dict)]
    deep = [row for row in snapshot.get("deepAnalysis", []) if isinstance(row, dict)]
    sector = [row for row in snapshot.get("sectorOverview", []) if isinstance(row, dict)]
    batches = report_batches_in_window(start, end)
    exchange = snapshot.get("exchangeRate", {}) if isinstance(snapshot.get("exchangeRate"), dict) else {}
    return {
        "generatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "windowStart": start.isoformat(timespec="seconds"),
        "windowEnd": end.isoformat(timespec="seconds"),
        "windowLabel": f"{start:%Y-%m-%d %H:%M} ~ {end:%Y-%m-%d %H:%M} KST",
        "title": f"오늘시황 {end:%Y-%m-%d}",
        "slug": end.strftime("%Y-%m-%d"),
        "snapshotUpdatedAt": str(snapshot.get("updatedAt", "") or ""),
        "exchangeRate": {
            "value": str(exchange.get("value", "") or "-"),
            "change": str(exchange.get("change", "") or "-"),
        },
        "counts": {
            "watchlist": len(watchlist),
            "scanner": len(snapshot.get("scanner", []) or []),
            "growthDiscovery": len(snapshot.get("growthDiscovery", []) or []),
            "spikes": len(snapshot.get("spikes", []) or []),
            "movingAverages": len(snapshot.get("movingAverages", []) or []),
            "news": len(news_rows),
            "strongBuyReports": strong_buy_count(report_source),
            "reportBatches": len(batches),
        },
        "topThemes": top_themes(snapshot),
        "watchlist": watchlist[:8],
        "morningNote": morning[:4],
        "deepAnalysis": deep[:4],
        "sectorOverview": sector[:3],
        "scannerDomestic": scanner_kr,
        "scannerUs": scanner_us,
        "growthDomestic": growth_kr,
        "growthUs": growth_us,
        "spikes": spikes,
        "movingAverages": moving,
        "news": news_rows[:10],
        "reportBatches": batches[:12],
    }


def row_bullets(rows: list[dict], market_default: str = "") -> str:
    items: list[str] = []
    for row in rows:
        market = market_label(row.get("market") or market_default)
        name = str(row.get("name") or row.get("symbol") or "-").strip()
        symbol = str(row.get("symbol", "") or "").strip()
        signal = str(row.get("signal") or row.get("decision") or row.get("verdict") or "-").strip()
        price = price_text(row.get("currentPrice") or row.get("currentPriceText"), market)
        note = str(row.get("summary") or row.get("note") or row.get("reason") or row.get("memo") or "-").strip()
        label = f"{name}({symbol})" if symbol and symbol not in name else name
        items.append(f"<li><strong>{esc(label)}</strong> | {esc(price)} | {esc(signal)} | {esc(note[:140])}</li>")
    return "".join(items) or "<li>표시할 항목이 없습니다.</li>"


def news_bullets(rows: list[dict]) -> str:
    items: list[str] = []
    for row in rows:
        title = str(row.get("title", "") or "").strip()
        summary = str(row.get("summary", "") or "").strip()
        source = str(row.get("source", "") or "").strip() or "출처 미상"
        url = str(row.get("url", "") or "").strip()
        if not title:
            continue
        anchor = f'<a href="{esc(url)}" target="_blank" rel="noopener">{esc(title)}</a>' if url else esc(title)
        items.append(f"<li>{anchor} | {esc(source)} | {esc(summary[:180])}</li>")
    return "".join(items) or "<li>해당 구간에 정리된 뉴스가 없습니다.</li>"


def narrative(payload: dict) -> list[str]:
    counts = payload["counts"]
    themes = payload.get("topThemes", [])
    theme_text = ", ".join(themes) if themes else "테마 집중은 아직 뚜렷하지 않았습니다"
    lines = [
        f"이 문서는 {payload['windowLabel']} 동안 도토리웹 운영 데이터에 반영된 종목스캐너, 성장주찾기, 급등락, 이평선, 뉴스, 심층분석 메모를 다시 묶어 하루 단위로 저장한 기록입니다.",
        f"이번 구간에는 스캐너 {counts['scanner']}건, 성장 후보 {counts['growthDiscovery']}건, 급등락 {counts['spikes']}건, 관련 뉴스 {counts['news']}건이 반영됐고, 공개 종목 리포트 강한 매수 표시는 {counts['strongBuyReports']}건이었습니다.",
        f"시장 테마는 {theme_text} 쪽이 상대적으로 많이 잡혔습니다.",
    ]
    if payload["exchangeRate"]["value"] != "-":
        lines.append(f"환율 기준값은 {payload['exchangeRate']['value']}원이었고 변동은 {payload['exchangeRate']['change']}로 기록됐습니다.")
    if counts["reportBatches"] > 0:
        lines.append(f"같은 구간에 종목 리포트 생성 배치도 {counts['reportBatches']}회 누적돼, 개별 리포트 이력과 함께 비교할 수 있습니다.")
    else:
        lines.append("같은 구간의 종목 리포트 배치 기록은 많지 않았지만, 일일 문서는 계속 누적 저장됩니다.")
    return lines


def page_shell(title: str, description: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)} | {esc(SITE_NAME)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{SITE_URL}/daily/">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:site_name" content="{esc(SITE_NAME)}">
  <meta property="og:title" content="{esc(title)} | {esc(SITE_NAME)}">
  <meta property="og:description" content="{esc(description)}">
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a class="brand" href="../">{esc(SITE_NAME)}</a>
      <div class="nav-links">
        <a href="../">홈</a>
        <a href="../reports/">종목 리포트</a>
        <a href="./">오늘시황</a>
        <a href="../stock-analysis.html">주식분석 가이드</a>
        <a href="../about.html">사이트 정보</a>
      </div>
    </nav>
  </header>
  <main class="plain-page">
    {body}
  </main>
</body>
</html>
"""


def render_digest_page(payload: dict) -> str:
    intro_paragraphs = "".join(f"<p>{esc(line)}</p>" for line in narrative(payload))
    morning_blocks = "".join(
        f"<li><strong>{esc(str(row.get('title', '') or '-'))}</strong> | {esc(str(row.get('summary', '') or '-')[:180])}</li>"
        for row in payload.get("morningNote", [])
    ) or "<li>모닝노트 요약이 아직 없습니다.</li>"
    deep_blocks = "".join(
        f"<li><strong>{esc(str(row.get('title', '') or '-'))}</strong> | {esc(str(row.get('summary', '') or '-')[:180])}</li>"
        for row in payload.get("deepAnalysis", [])
    ) or "<li>심층분석 요약이 아직 없습니다.</li>"
    sector_blocks = "".join(
        f"<li><strong>{esc(str(row.get('title', '') or '-'))}</strong> | {esc(str(row.get('summary', '') or '-')[:180])}</li>"
        for row in payload.get("sectorOverview", [])
    ) or "<li>섹터오버뷰 요약이 아직 없습니다.</li>"
    batch_blocks = "".join(
        f"<li>{esc(str(row.get('generatedAt', '') or '-'))} | 생성 종목 {esc(row.get('count', '-'))}건</li>"
        for row in payload.get("reportBatches", [])
    ) or "<li>같은 구간의 종목 리포트 배치 기록이 없습니다.</li>"
    return f"""<article>
      <p class="breadcrumb"><a href="../">홈</a> / <a href="./">오늘시황</a> / {esc(payload['slug'])}</p>
      <h1>{esc(payload['title'])}</h1>
      <p class="notice">이 문서는 매일 오전 6시에 전일 6시부터 누적된 운영 데이터를 기준으로 정리하는 일일 시황 기록입니다. 특정 종목의 매수·매도를 권유하지 않으며, 실제 판단 전에는 증권사 화면과 공시를 다시 확인해야 합니다.</p>
      <p><strong>기준 구간</strong> {esc(payload['windowLabel'])} | <strong>웹 데이터 갱신</strong> {esc(payload.get('snapshotUpdatedAt') or '-')}</p>

      <h2>1. 오늘 시황 요약</h2>
      {intro_paragraphs}

      <h2>2. 국내 스캐너 상위</h2>
      <ul>{row_bullets(payload.get('scannerDomestic', []), '국내')}</ul>

      <h2>3. 미국 스캐너 상위</h2>
      <ul>{row_bullets(payload.get('scannerUs', []), '미국')}</ul>

      <h2>4. 성장 후보 상위</h2>
      <p>국내와 미국 성장 후보를 따로 보관해 두면, 같은 테마가 어느 시장에서 더 강하게 잡혔는지 비교하기 쉬워집니다.</p>
      <h3>국내 성장 후보</h3>
      <ul>{row_bullets(payload.get('growthDomestic', []), '국내')}</ul>
      <h3>미국 성장 후보</h3>
      <ul>{row_bullets(payload.get('growthUs', []), '미국')}</ul>

      <h2>5. 급등락과 추세 보조 신호</h2>
      <h3>급등락 상위</h3>
      <ul>{row_bullets(payload.get('spikes', []))}</ul>
      <h3>이평선 상위</h3>
      <ul>{row_bullets(payload.get('movingAverages', []))}</ul>

      <h2>6. 모닝노트와 심층분석 메모</h2>
      <h3>모닝노트</h3>
      <ul>{morning_blocks}</ul>
      <h3>심층분석 메모</h3>
      <ul>{deep_blocks}</ul>
      <h3>섹터오버뷰 메모</h3>
      <ul>{sector_blocks}</ul>

      <h2>7. 관련 뉴스</h2>
      <p>뉴스는 당일 체결가를 대신하지 않지만, 종목이 왜 후보로 남았는지와 무엇을 다시 확인해야 하는지를 설명하는 재료가 됩니다.</p>
      <ul>{news_bullets(payload.get('news', []))}</ul>

      <h2>8. 종목 리포트 생성 이력</h2>
      <p>같은 구간에 생성된 종목 리포트 배치 수를 함께 저장해 두면, 하루 요약과 개별 종목 리포트를 나란히 비교할 수 있습니다.</p>
      <ul>{batch_blocks}</ul>
    </article>"""


def render_index_page(entries: list[dict]) -> str:
    cards = []
    for entry in entries:
        cards.append(
            f"""<article class="info-card">
  <h2><a href="./{esc(entry.get('slug', ''))}.html">{esc(entry.get('title', '-'))}</a></h2>
  <p><strong>기준 구간</strong> {esc(entry.get('windowLabel', '-'))}</p>
  <p>{esc(entry.get('summary', '-'))}</p>
  <p>스캐너 {esc(entry.get('scannerCount', '-'))}건 | 뉴스 {esc(entry.get('newsCount', '-'))}건 | 강한 매수 {esc(entry.get('strongBuyReports', '-'))}건</p>
</article>"""
        )
    body = f"""<article>
      <h1>오늘시황 목록</h1>
      <p>매일 오전 6시에 전일 6시부터 누적된 도토리웹 운영 데이터를 하루 단위로 정리한 기록입니다. 리포트와 정책 문서만으로는 부족한 설명층을 보완하기 위해 날짜별 문서를 계속 쌓습니다.</p>
      <div class="info-grid report-index-grid">{''.join(cards) or '<p>아직 생성된 오늘시황 문서가 없습니다.</p>'}</div>
    </article>"""
    return page_shell("오늘시황 목록", "매일 오전 6시에 생성되는 오늘의 주식 일일 시황 문서 목록입니다.", body)


def update_sitemap(entries: list[dict]) -> None:
    if not SITEMAP_PATH.exists():
        return
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    ET.register_namespace("", ns["sm"])
    tree = ET.parse(SITEMAP_PATH)
    root = tree.getroot()
    existing = {loc.text for loc in root.findall("sm:url/sm:loc", ns) if loc.text}

    def add_url(loc: str, lastmod: str, changefreq: str, priority: str) -> None:
        if loc in existing:
            return
        url = ET.SubElement(root, "{http://www.sitemaps.org/schemas/sitemap/0.9}url")
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}loc").text = loc
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod").text = lastmod
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}changefreq").text = changefreq
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}priority").text = priority

    today = datetime.now(KST).date().isoformat()
    add_url(f"{SITE_URL}/daily/", today, "daily", "0.7")
    for entry in entries[:60]:
        slug = str(entry.get("slug", "") or "").strip()
        date = str(entry.get("date", today) or today)
        if slug:
            add_url(f"{SITE_URL}/daily/{slug}.html", date, "daily", "0.6")
    tree.write(SITEMAP_PATH, encoding="utf-8", xml_declaration=True)


def write_digest(now: datetime | None = None) -> dict:
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    payload = build_digest_payload(now)
    html_path = DAILY_DIR / f"{payload['slug']}.html"
    html_path.write_text(
        page_shell(
            payload["title"],
            f"{payload['windowLabel']} 동안의 스캐너, 성장 후보, 급등락, 뉴스, 심층분석 메모를 정리한 일일 시황 문서입니다.",
            render_digest_page(payload),
        ),
        encoding="utf-8",
        newline="\n",
    )

    manifest = load_json(MANIFEST_PATH, [])
    if not isinstance(manifest, list):
        manifest = []
    entry = {
        "slug": payload["slug"],
        "date": payload["slug"],
        "title": payload["title"],
        "windowStart": payload["windowStart"],
        "windowEnd": payload["windowEnd"],
        "windowLabel": payload["windowLabel"],
        "path": f"/daily/{payload['slug']}.html",
        "summary": " / ".join(narrative(payload)[:2])[:320],
        "scannerCount": payload["counts"]["scanner"],
        "newsCount": payload["counts"]["news"],
        "strongBuyReports": payload["counts"]["strongBuyReports"],
        "generatedAt": payload["generatedAt"],
    }
    manifest = [row for row in manifest if isinstance(row, dict) and str(row.get("slug", "")) != payload["slug"]]
    manifest.insert(0, entry)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    (DAILY_DIR / "index.html").write_text(render_index_page(manifest), encoding="utf-8", newline="\n")
    update_sitemap(manifest)
    return entry


if __name__ == "__main__":
    entry = write_digest()
    print(json.dumps({"ok": True, "slug": entry["slug"], "path": entry["path"]}, ensure_ascii=False))
