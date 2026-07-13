from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


WEB_DIR = Path(__file__).resolve().parent
ROOT = WEB_DIR.parent
DATA_DIR = WEB_DIR / "data"
SNAPSHOT_PATH = DATA_DIR / "public-snapshot.json"
LEARNING_PATH = DATA_DIR / "dotoristock-learning.json"
CACHE_DIR = ROOT / "learning_data" / "virtual_actual_chart_yfinance_cache"
BRIEF_PATH = ROOT / "learning_data" / "stock_emperor_candidate_selection_brief" / "latest.json"
MONITOR_PATH = ROOT / "learning_data" / "virtual_recommendation_monitor_status.json"
FORECAST_PATH = ROOT / "learning_data" / "daily_forecasts" / "latest_forecast.json"


def load(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return fallback


def save(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def number(value: Any) -> float | None:
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(value)))
    except (TypeError, ValueError):
        return None


def ema(values: list[float], period: int) -> float | None:
    if not values:
        return None
    alpha = 2.0 / (period + 1)
    result = values[0]
    for value in values[1:]:
        result = alpha * value + (1 - alpha) * result
    return round(result, 4)


def latest_chart(symbol: str) -> dict[str, Any] | None:
    payload = load(CACHE_DIR / f"{symbol}.json", {})
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    rows = [row for row in rows if isinstance(row, dict) and number(row.get("close")) is not None]
    if not rows:
        return None
    closes = [number(row.get("close")) for row in rows]
    closes = [value for value in closes if value is not None]
    last = rows[-1]
    return {
        "currentPrice": closes[-1],
        "quotedAt": last.get("recorded_at"),
        "ema5": ema(closes[-60:], 5),
        "ema20": ema(closes[-120:], 20),
        "ma20": round(sum(closes[-20:]) / min(20, len(closes)), 4),
        "ma60": round(sum(closes[-60:]) / min(60, len(closes)), 4),
        "ohlc": rows[-3:],
        "ohlcSource": payload.get("source") or "chart_cache",
    }


def symbol_map(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for key in ("scanner", "growthDiscovery"):
        for row in snapshot.get(key, []) or []:
            if isinstance(row, dict) and row.get("symbol"):
                result[str(row["symbol"]).upper()] = row
    return result


def refresh_moving_averages(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for symbol, base in symbol_map(snapshot).items():
        chart = latest_chart(symbol)
        if not chart:
            continue
        row = {
            "rank": len(rows) + 1,
            "market": base.get("market") or ("국내" if symbol.isdigit() else "미국"),
            "symbol": symbol,
            "name": base.get("name") or symbol,
            "currentPrice": chart["currentPrice"],
            "quotedAt": chart["quotedAt"],
            "ma20": chart["ma20"],
            "ma60": chart["ma60"],
            "ema5": chart["ema5"],
            "ema20": chart["ema20"],
            "ohlc": chart["ohlc"],
            "ohlcSource": chart["ohlcSource"],
            "decision": "상승 이평선 관찰" if chart["ema5"] and chart["ema20"] and chart["ema5"] >= chart["ema20"] else "하락 이평선 관찰",
            "movingAverage": f"EMA5 {chart['ema5']} / EMA20 {chart['ema20']} / MA20 {chart['ma20']} / MA60 {chart['ma60']}",
            "note": "차트 캐시 최근봉 기준. 주문 전 증권사 현재가·호가 재확인",
        }
        rows.append(row)
    return rows


def refresh_learning_prices(learning: dict[str, Any], snapshot: dict[str, Any]) -> None:
    names = symbol_map(snapshot)
    for market in ("korea", "us"):
        section = learning.get(market)
        if not isinstance(section, dict):
            continue
        for row in section.get("rankings", []) or []:
            if not isinstance(row, dict):
                continue
            symbol = str(row.get("symbol") or "").upper()
            chart = latest_chart(symbol)
            if chart:
                row["price"] = chart["currentPrice"]
                row["quotedAt"] = chart["quotedAt"]
                row["priceSource"] = chart["ohlcSource"]
            elif symbol in names and names[symbol].get("currentPrice"):
                row["price"] = number(names[symbol]["currentPrice"])
                row["priceSource"] = "public_snapshot_last_quote"
    learning["generatedAt"] = datetime.now(timezone.utc).isoformat()
    learning["priceDataNote"] = "종목별 최신 차트 캐시 기준. 실시간 주문 전 브로커 호가 재확인"


def make_analysis_sections(snapshot: dict[str, Any], brief: dict[str, Any], monitor: dict[str, Any], forecast: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    signal_symbols = monitor.get("signal_symbols", []) if isinstance(monitor.get("signal_symbols"), list) else []
    summary = brief.get("summary", {}) if isinstance(brief.get("summary"), dict) else {}
    market_view = str(forecast.get("market_view") or "시장 흐름 자료를 수집 중입니다.").strip()
    snapshot["morningNote"] = [{
        "title": "모닝노트",
        "kind": "morning-note",
        "updatedAt": now,
        "summary": market_view,
        "sections": [
            {"heading": "시장 체크", "items": [f"모니터 신호 {len(signal_symbols)}건", "장 시작 추격보다 첫 방향과 거래량을 확인"]},
            {"heading": "오늘의 관찰", "items": signal_symbols[:10] or ["실시간 신호 대기"]},
        ],
    }]
    snapshot["sectorOverview"] = [{
        "title": "섹터오버뷰",
        "kind": "sector-overview",
        "updatedAt": now,
        "summary": "후보를 섹터별로 묶어 자금 집중과 동조 흐름을 점검합니다.",
        "sections": [
            {"heading": "국내 후보", "items": summary.get("kr_runtime_buy_ready_symbols", []) or ["실전 준비 후보 없음"]},
            {"heading": "미국 후보", "items": summary.get("us_runtime_buy_ready_symbols", []) or ["실전 준비 후보 없음"]},
            {"heading": "리스크", "items": ["단일 섹터 집중과 시장폭 축소 여부를 확인"]},
        ],
    }]
    candidates = (brief.get("all_trade_candidates", []) if isinstance(brief.get("all_trade_candidates"), list) else [])[:10]
    detail_items = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").upper()
        chart = latest_chart(symbol)
        price = chart.get("currentPrice") if chart else item.get("currentPrice")
        detail_items.append(f"{item.get('name') or symbol}: 현재가 {price or '-'} / 이유 {item.get('reason') or '-'}")
    snapshot["deepAnalysis"] = [{
        "title": "심층분석",
        "kind": "deep-analysis",
        "updatedAt": now,
        "summary": "후보별 가격·전략·진입근거를 분리해 검증합니다.",
        "sections": [
            {"heading": "후보별 검증", "items": detail_items or ["후보 자료 대기"]},
            {"heading": "판단 기준", "items": ["차트·거래량·호가·섹터 동조·실적을 함께 확인"]},
        ],
    }]


def fetch_news() -> list[dict[str, Any]]:
    query = urllib.parse.quote("주식 시장 증시")
    url = f"https://news.google.com/rss/search?q={query}&hl=ko&gl=KR&ceid=KR:ko"
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "DotoriWeb/1.0"})
        root = ET.fromstring(urllib.request.urlopen(request, timeout=15).read())
    except Exception:
        return []
    rows: list[dict[str, Any]] = []
    for item in root.findall("./channel/item")[:20]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not title or not link:
            continue
        rows.append({
            "title": title,
            "url": link,
            "summary": (item.findtext("description") or "").strip(),
            "asOf": (item.findtext("pubDate") or "").strip(),
            "source": "Google News RSS",
        })
    return rows


def make_morning_note_from_news(snapshot: dict[str, Any]) -> None:
    news_rows = [row for row in snapshot.get("newsList", []) if isinstance(row, dict)]
    titles = [str(row.get("title") or "").strip() for row in news_rows if str(row.get("title") or "").strip()]
    primary_titles = titles[:6]
    market_titles = [
        title for title in titles
        if any(keyword in title for keyword in ("코스피", "코스닥", "증시", "시장", "주식", "환율", "금리"))
    ][:5]
    if not market_titles:
        market_titles = primary_titles[:3]
    exchange = snapshot.get("exchangeRate", {}) if isinstance(snapshot.get("exchangeRate"), dict) else {}
    market_checks = list(market_titles)
    if exchange.get("value"):
        market_checks.append(f"USD/KRW {exchange.get('value')} - {exchange.get('source') or '환율 데이터'}")
    snapshot["morningNote"] = [{
        "title": "모닝노트",
        "kind": "morning-note",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": f"Google News RSS 기준 주요 경제·증시 뉴스 {len(news_rows)}건을 모아 오늘 장 전에 확인할 흐름을 정리합니다.",
        "sections": [
            {
                "heading": "주요 경제뉴스",
                "items": primary_titles or ["경제 뉴스 수집 대기 중"],
            },
            {
                "heading": "시장 체크",
                "items": market_checks or ["증시·환율·금리 관련 뉴스 확인 대기"],
            },
            {
                "heading": "확인할 흐름",
                "items": [
                    "뉴스 제목과 실제 가격 반응이 같은 방향인지 확인",
                    "장 시작 직후 추격보다 거래대금과 지수 방향 먼저 확인",
                    "급락·급등 뉴스는 분할 접근과 손절 기준을 먼저 점검",
                ],
            },
        ],
    }]


def refresh_exchange(snapshot: dict[str, Any]) -> None:
    try:
        request = urllib.request.Request("https://open.er-api.com/v6/latest/USD", headers={"User-Agent": "DotoriWeb/1.0"})
        payload = json.loads(urllib.request.urlopen(request, timeout=15).read().decode("utf-8"))
        value = number(payload.get("rates", {}).get("KRW"))
    except Exception:
        value = None
    if value is None:
        return
    updated = datetime.now(timezone.utc).isoformat()
    snapshot["exchangeRate"] = {
        "label": "오늘의 환율",
        "value": f"{value:,.2f}원",
        "change": "실시간 기준",
        "updatedAt": updated,
        "source": "ExchangeRate-API USD/KRW",
        "note": "오늘 수집된 최신 기준환율입니다.",
    }


def main() -> dict[str, Any]:
    snapshot = load(SNAPSHOT_PATH, {})
    learning = load(LEARNING_PATH, {})
    brief = load(BRIEF_PATH, {})
    monitor = load(MONITOR_PATH, {})
    forecast = load(FORECAST_PATH, {})
    snapshot["movingAverages"] = refresh_moving_averages(snapshot)
    refresh_learning_prices(learning, snapshot)
    make_analysis_sections(snapshot, brief, monitor, forecast)
    snapshot["newsList"] = fetch_news()
    refresh_exchange(snapshot)
    make_morning_note_from_news(snapshot)
    snapshot["updatedAt"] = snapshot.get("exchangeRate", {}).get("updatedAt") or datetime.now(timezone.utc).isoformat()
    snapshot.setdefault("webDataStatus", {})["newsCount"] = len(snapshot["newsList"])
    snapshot["webDataStatus"]["movingAveragesCount"] = len(snapshot["movingAverages"])
    save(SNAPSHOT_PATH, snapshot)
    save(LEARNING_PATH, learning)
    return {"ok": True, "movingAverages": len(snapshot["movingAverages"]), "news": len(snapshot["newsList"]), "exchange": snapshot.get("exchangeRate", {}).get("value")}


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=False))
