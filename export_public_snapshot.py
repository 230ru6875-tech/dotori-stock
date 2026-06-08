from __future__ import annotations

import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DOTORI_DIR = Path(__file__).resolve().parent
PREDICTIONS_PATH = BASE_DIR / "logs" / "latest_stock_predictions.json"
INVESTMENT_ANALYSIS_PATH = BASE_DIR / "logs" / "investment_analysis_latest.json"
MORNING_NOTE_PATH = BASE_DIR / "logs" / "morning_note_latest.json"
EXTERNAL_SIGNALS_PATH = BASE_DIR / "logs" / "external_signals" / "latest.json"
PUBLIC_SNAPSHOT_PATH = DOTORI_DIR / "data" / "public-snapshot.json"
SYMBOL_DIRECTORY_PATH = DOTORI_DIR / "data" / "symbol-directory.json"
KST = timezone(timedelta(hours=9))


def _score_from_reasons(item: dict) -> float:
    text = " ".join(str(reason) for reason in item.get("reasons", []) if reason)
    match = re.search(r"기술 점수\s*([0-9.]+)", text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return 0.0
    return 0.0


def _clean_text(value: object, fallback: str = "-") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def _scanner_row(item: dict, rank: int) -> dict:
    symbol = _clean_text(item.get("symbol"))
    name = _clean_text(item.get("display_name"), symbol)
    current = _clean_text(item.get("current_price_text"))
    signal = _clean_text(item.get("trade_signal"), "관찰")
    low = _clean_text(item.get("pred_low_text"))
    high = _clean_text(item.get("pred_high_text"))
    hint = _clean_text(item.get("analysis_hint"), "시장 데이터 확인")
    market = _clean_text(item.get("market"))
    return {
        "rank": rank,
        "market": market,
        "symbol": symbol,
        "name": name,
        "currentPrice": current,
        "signal": signal,
        "predRange": f"{low} ~ {high}",
        "summary": f"{hint} | 현재 {current} | 예측 {low} ~ {high}",
        "sentiment": signal,
        "risk": hint,
        "source": "도토리 PC 저장자료",
        "score": round(_score_from_reasons(item), 2),
    }


def _top_items(items: list[dict], market_text: str, limit: int = 50) -> list[dict]:
    filtered = [
        item for item in items
        if isinstance(item, dict)
        and str(item.get("market", "")).strip() == market_text
        and str(item.get("symbol", "")).strip()
    ]
    filtered.sort(
        key=lambda item: (
            _score_from_reasons(item),
            float(item.get("purchase_return_pct", -999.0) or -999.0),
        ),
        reverse=True,
    )
    return [_scanner_row(item, index + 1) for index, item in enumerate(filtered[:limit])]


def _supplement_from_investment(market_text: str, used_symbols: set[str], start_rank: int, limit: int) -> list[dict]:
    if limit <= 0 or not INVESTMENT_ANALYSIS_PATH.exists():
        return []
    try:
        payload = json.loads(INVESTMENT_ANALYSIS_PATH.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return []
    positions = payload.get("positions", []) if isinstance(payload, dict) else []
    if not isinstance(positions, list):
        return []
    rows: list[dict] = []
    for position in positions:
        if not isinstance(position, dict):
            continue
        symbol = _clean_text(position.get("symbol"))
        if not symbol or symbol in used_symbols:
            continue
        display_name = _clean_text(position.get("display_name"), symbol)
        current_price = position.get("current_price", 0.0)
        expected = position.get("expected_return_pct", 0.0)
        score = position.get("last_score", 0)
        rows.append(
            {
                "rank": start_rank + len(rows),
                "market": market_text,
                "symbol": symbol,
                "name": f"{display_name}({symbol})" if symbol not in display_name else display_name,
                "currentPrice": f"${float(current_price):,.2f}" if market_text == "미국" else f"{float(current_price):,.0f}",
                "signal": _clean_text(position.get("last_action"), "관찰"),
                "predRange": f"예상수익 {float(expected or 0.0):+.2f}%",
                "summary": _clean_text(position.get("profit_engine_note"), "모의투자 저장자료 기준 보조 표시"),
                "sentiment": _clean_text(position.get("last_action"), "관찰"),
                "risk": _clean_text(position.get("profit_engine_label"), "확인 필요"),
                "source": "도토리 모의투자 저장자료",
                "score": float(score or 0),
            }
        )
        used_symbols.add(symbol)
        if len(rows) >= limit:
            break
    return rows


def _first_spike_reason(item: dict) -> str:
    for reason in item.get("reasons", []) or []:
        text = str(reason or "").strip()
        if "6\ud30c\ud2b8" in text or "\uae09\ub4f1\uc8fc" in text:
            return text
    return ""


def _pct_from_text(text: str) -> float:
    matches = re.findall(r"([+-]?\d+(?:\.\d+)?)%", text or "")
    if not matches:
        return 0.0
    try:
        return max(float(value) for value in matches)
    except ValueError:
        return 0.0


def _is_excluded_product(item: dict) -> bool:
    text = f"{item.get('symbol', '')} {item.get('display_name', '')}".upper()
    blocked = ["ETF", "ETN", "TIGER", "KODEX", "KBSTAR", "ACE", "SOL ", "ARIRANG", "HANARO", "LEVERAGE", "INVERSE"]
    korean_blocked = ["\ub808\ubc84\ub9ac\uc9c0", "\uc778\ubc84\uc2a4", "\uc120\ubb3c", "\uc120\ubb3c\uc778\ubc84\uc2a4"]
    return any(token in text for token in blocked) or any(token in str(item.get('display_name', '')) for token in korean_blocked)


def _spike_rows(items: list[dict], limit: int = 50) -> list[dict]:
    rows: list[tuple[float, dict]] = []
    for item in items:
        if not isinstance(item, dict) or _is_excluded_product(item):
            continue
        reason = _first_spike_reason(item)
        if not reason:
            continue
        pct = _pct_from_text(reason)
        symbol = _clean_text(item.get("symbol"), "")
        if not symbol:
            continue
        display_name = _clean_text(item.get("display_name"), symbol)
        name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        note = reason
        note = re.sub(r"^.*?(?:6|7)\ud30c\ud2b8\s*", "", note)
        note = note.replace("6\ud30c\ud2b8 ", "").replace("7\ud30c\ud2b8 ", "")
        if len(note) > 120:
            note = note[:117].rstrip() + "..."
        rows.append((pct, {
            "name": name,
            "symbol": symbol,
            "market": _clean_text(item.get("market")),
            "range": "6\ud30c\ud2b8 \uae09\ub4f1\uc8fc",
            "change": f"+{pct:.1f}%" if pct > 0 else "-",
            "currentPrice": _clean_text(item.get("current_price_text"), ""),
            "signal": _clean_text(item.get("trade_signal"), ""),
            "note": note,
            "score": round(_score_from_reasons(item), 2),
        }))
    rows.sort(key=lambda pair: (pair[0], pair[1].get("score", 0)), reverse=True)
    return [row for _, row in rows[:limit]]


def _first_matching_reason(item: dict, keywords: tuple[str, ...]) -> str:
    for reason in item.get("reasons", []) or []:
        text = str(reason or "").strip()
        if any(keyword in text for keyword in keywords):
            return text
    return ""


def _shorten(text: str, limit: int = 110) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


def _ma20_label(item: dict) -> str:
    reason = _first_matching_reason(item, ("20\uc77c", "\uc774\ud3c9", "\ucd94\uc138"))
    match = re.search(r"20\uc77c\s*([+-]?\d+(?:\.\d+)?)%", reason)
    if match:
        return f"20\uc77c {float(match.group(1)):+.1f}%"
    hint = _clean_text(item.get("analysis_hint"), "")
    return hint or "\ud68c\ubcf5 \ud655\uc778"


def _ma60_label(item: dict) -> str:
    reason = _first_matching_reason(item, ("\uc774\ud3c9", "\ucd94\uc138", "\uc911\uae30", "\uc2dc\uc7a5 \uc694\uc57d"))
    if "\ucd94\uc138 \uc6b0\uc704" in reason or "\uc0c1\uc2b9" in reason:
        return "\uc911\uae30 \ucd94\uc138 \uc6b0\uc704"
    if "\ubcc0\ub3d9\uc131" in _clean_text(item.get("analysis_hint"), ""):
        return "\uc911\uae30 \ucd94\uc138 \uc810\uac80"
    return "\uc911\uae30 \uc120 \ud655\uc778"


def _moving_average_rows(items: list[dict], limit: int = 30) -> list[dict]:
    rows: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        symbol = _clean_text(item.get("symbol"), "")
        if not symbol:
            continue
        display_name = _clean_text(item.get("display_name"), symbol)
        name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        note = _first_matching_reason(item, ("\uc774\ud3c9", "20\uc77c", "\ucd94\uc138", "\ub370\ub4dc", "\uace8\ub4e0"))
        if not note:
            note = _clean_text(item.get("analysis_hint"), "")
        rows.append({
            "name": name,
            "symbol": symbol,
            "market": _clean_text(item.get("market")),
            "currentPrice": _clean_text(item.get("current_price_text"), ""),
            "ma20": _ma20_label(item),
            "ma60": _ma60_label(item),
            "decision": _clean_text(item.get("trade_signal"), "\uad00\ucc30"),
            "note": _shorten(note),
            "score": round(_score_from_reasons(item), 2),
        })
    rows.sort(key=lambda row: ("\ub370\ub4dc" in row.get("note", ""), row.get("score", 0)), reverse=True)
    return rows[:limit]


def _clean_public_line(value: object) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return ""
    blocked = ("\ud1a0\ub9ac", "tori", "Tori", "\uc218\uc9d1\uc790\ub8cc", "\uc790\ub3d9\ud6c4\ubcf4")
    if any(token in text for token in blocked):
        return ""
    noise = ("\uad6d\ub0b4\uc99d\uc2dc \uc120\ud0dd\ub428", "\uc0c8\ub85c\uc6b4 \uc99d\uad8c \ubcf4\uae30", "KRX \uc8fc\uc694\uc2dc\uc138")
    if any(token in text for token in noise):
        return ""
    return text


def _clean_public_lines(values: object, limit: int = 5) -> list[str]:
    if not isinstance(values, list):
        return []
    rows: list[str] = []
    for value in values:
        cleaned = _clean_public_line(value)
        if cleaned and cleaned not in rows:
            rows.append(cleaned)
        if len(rows) >= limit:
            break
    return rows


def _public_analysis_reports() -> list[dict]:
    reports: list[dict] = []
    if MORNING_NOTE_PATH.exists():
        try:
            note = json.loads(MORNING_NOTE_PATH.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            note = {}
        if isinstance(note, dict):
            sections = [
                {"heading": "\ubc24\uc0ac\uc774 \ud575\uc2ec \ub274\uc2a4", "items": _clean_public_lines(note.get("overnight_developments"), 5)},
                {"heading": "\uad00\uc2ec\uc885\ubaa9 \uc601\ud5a5", "items": _clean_public_lines(note.get("holding_impacts"), 5)},
                {"heading": "\uc139\ud130\uc640 \ub9e4\ud06c\ub85c", "items": _clean_public_lines(note.get("sector_macro_context"), 5)},
                {"heading": "\uc624\ub298 \ud655\uc778\ud560 \uc77c", "items": _clean_public_lines(note.get("key_events_today"), 5)},
                {"heading": "\uc704\ud5d8 \uc694\uc778", "items": _clean_public_lines(note.get("risks"), 5)},
            ]
            top_call = _clean_public_line(note.get("top_call"))
            reports.append({
                "title": "\ubaa8\ub2dd\ub178\ud2b8",
                "kind": "morning-note",
                "updatedAt": _clean_text(note.get("updated_at"), ""),
                "summary": top_call or "\uc624\ub298 \uc2dc\uc7a5\uc5d0\uc11c \ud655\uc778\ud560 \ud575\uc2ec \ub274\uc2a4\uc640 \uc704\ud5d8 \uc694\uc778\uc744 \uc815\ub9ac\ud569\ub2c8\ub2e4.",
                "sections": [section for section in sections if section["items"]],
            })
    if not reports:
        reports.append({
            "title": "\ubaa8\ub2dd\ub178\ud2b8",
            "kind": "morning-note",
            "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
            "summary": "\ubc24\uc0ac\uc774 \ub274\uc2a4\uc640 \uc8fc\uac00 \ud750\ub984\uc744 \uc694\uc57d\ud569\ub2c8\ub2e4.",
            "sections": [],
        })
    return reports


def _public_sector_overview_reports(items: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        sector = _clean_public_line(item.get("sector_label")) or "\uc5c5\uc885 \ud655\uc778"
        if "?" in sector or len(sector) > 60:
            sector = "\uc5c5\uc885 \ud750\ub984 \uc810\uac80"
        groups.setdefault(sector, []).append(item)
    sections: list[dict] = []
    for sector, rows in sorted(groups.items(), key=lambda pair: len(pair[1]), reverse=True)[:6]:
        lines: list[str] = []
        for item in sorted(rows, key=_score_from_reasons, reverse=True)[:6]:
            symbol = _clean_text(item.get("symbol"), "")
            name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", _clean_public_line(item.get("display_name")) or symbol).strip() or symbol
            current = _clean_text(item.get("current_price_text"), "")
            signal = _clean_public_line(item.get("trade_signal")) or "\uad00\ucc30"
            hint = _clean_public_line(item.get("analysis_hint"))
            line = f"{name}({symbol}) | \ud604\uc7ac {current} | {signal}"
            if hint:
                line += f" | {hint}"
            if _clean_public_line(line):
                lines.append(line)
        if lines:
            sections.append({"heading": sector, "items": lines})
    return [{
        "title": "\uc139\ud130\uc624\ubc84\ubdf0",
        "kind": "sector-overview",
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "summary": "\uad00\uc2ec\uc885\ubaa9\uacfc \ucd5c\uc2e0 \uc608\uce21 \uc885\ubaa9\uc744 \uc5c5\uc885\ubcc4\ub85c \ubb36\uc5b4 \uc0b0\uc5c5 \ud750\ub984\uacfc \uac1c\ubcc4 \uc2e0\ud638\ub97c \ud655\uc778\ud569\ub2c8\ub2e4.",
        "sections": sections,
    }]


def _public_deep_analysis_reports(items: list[dict], limit: int = 12) -> list[dict]:
    scored = [item for item in items if isinstance(item, dict) and _clean_text(item.get("symbol"), "")]
    scored.sort(key=lambda item: (_score_from_reasons(item), abs(float(item.get("purchase_return_pct", 0) or 0))), reverse=True)
    lines: list[str] = []
    risk_lines: list[str] = []
    for item in scored[:limit]:
        symbol = _clean_text(item.get("symbol"), "")
        name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", _clean_text(item.get("display_name"), symbol)).strip() or symbol
        current = _clean_text(item.get("current_price_text"), "")
        signal = _clean_text(item.get("trade_signal"), "\uad00\ucc30")
        pred = f"{_clean_text(item.get('pred_low_text'), '-')} ~ {_clean_text(item.get('pred_high_text'), '-')}"
        hint = _clean_text(item.get("analysis_hint"), "")
        lines.append(f"{name}({symbol}) | \ud604\uc7ac {current} | \uc608\uce21 {pred} | {signal}")
        if hint:
            risk_lines.append(f"{name}({symbol}) | {hint}")
    sections = [
        {"heading": "\uc8fc\uc694 \uc885\ubaa9 \uc2ec\uce35 \uc810\uac80", "items": lines},
        {"heading": "\uc704\ud5d8\uacfc \ud655\uc778\ud560 \uc810", "items": risk_lines[:limit]},
    ]
    return [{
        "title": "\uc2ec\uce35\ubd84\uc11d",
        "kind": "deep-analysis",
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "summary": "\ud604\uc7ac\uac00, \uc608\uce21 \ubc94\uc704, \uc218\uc775\ub960, \uc2e0\ud638\ub97c \uac19\uc774 \ubcf4\uba74\uc11c \uc885\ubaa9\ubcc4 \ud655\uc778 \ud3ec\uc778\ud2b8\ub97c \uc815\ub9ac\ud569\ub2c8\ub2e4.",
        "sections": [section for section in sections if section["items"]],
    }]


def _public_news_list(limit: int = 30) -> list[dict]:
    if not EXTERNAL_SIGNALS_PATH.exists():
        return []
    try:
        payload = json.loads(EXTERNAL_SIGNALS_PATH.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return []
    items = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(items, list):
        return []
    rows: list[dict] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = _clean_public_line(item.get("name"))
        if not title or title in seen:
            continue
        details = _clean_public_line(item.get("details"))
        if not details:
            details = ""
        summary_parts = [part.strip() for part in details.split("/") if part.strip()]
        clean_parts = []
        for part in summary_parts:
            if "Copyright" in part or "?? ??" in part or "AI??" in part:
                continue
            clean_parts.append(part)
        summary = " / ".join(clean_parts[:2]) if clean_parts else ""
        if len(summary) > 140:
            summary = summary[:137].rstrip() + "..."
        raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
        url = _clean_text(raw.get("url"), "")
        rows.append({
            "title": title,
            "summary": summary,
            "asOf": _clean_text(item.get("as_of"), ""),
            "url": url,
        })
        seen.add(title)
        if len(rows) >= limit:
            break
    return rows


def build_snapshot() -> dict:
    previous: dict = {}
    if PUBLIC_SNAPSHOT_PATH.exists():
        try:
            previous = json.loads(PUBLIC_SNAPSHOT_PATH.read_text(encoding="utf-8"))
        except Exception:
            previous = {}
    predictions = json.loads(PREDICTIONS_PATH.read_text(encoding="utf-8", errors="replace"))
    items = predictions.get("items", []) if isinstance(predictions, dict) else []
    if not isinstance(items, list):
        items = []
    scanner_limit_each = 50
    domestic = _top_items(items, "국내", scanner_limit_each)
    us = _top_items(items, "미국", scanner_limit_each)
    if len(domestic) < scanner_limit_each:
        domestic.extend(_supplement_from_investment("국내", {row["symbol"] for row in domestic}, len(domestic) + 1, scanner_limit_each - len(domestic)))
    if len(us) < scanner_limit_each:
        us.extend(_supplement_from_investment("미국", {row["symbol"] for row in us}, len(us) + 1, scanner_limit_each - len(us)))
    scanner = domestic + us
    previous["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    previous["scannerUpdatedAt"] = predictions.get("saved_at", previous["updatedAt"])
    previous["scanner"] = scanner
    spike_rows = _spike_rows(items, 50)
    if spike_rows:
        previous["spikes"] = spike_rows
    previous["movingAverages"] = _moving_average_rows(items)
    previous["morningNote"] = _public_analysis_reports()
    previous["sectorOverview"] = _public_sector_overview_reports(items)
    previous["deepAnalysis"] = _public_deep_analysis_reports(items)
    previous["newsList"] = _public_news_list()
    previous["analysis"] = previous["morningNote"]
    previous["scannerGroups"] = {
        "domestic": domestic,
        "us": us,
    }
    previous.setdefault(
        "exchangeRate",
        {
            "label": "오늘의 환율",
            "value": "-",
            "change": "-",
            "note": "도토리 PC 저장자료 기준 공개용 데이터입니다.",
        },
    )
    return previous


def build_symbol_directory() -> dict:
    predictions = json.loads(PREDICTIONS_PATH.read_text(encoding="utf-8", errors="replace"))
    items = predictions.get("items", []) if isinstance(predictions, dict) else []
    directory: dict[str, dict] = {}
    if not isinstance(items, list):
        items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        symbol = _clean_text(item.get("symbol"), "").upper()
        if not symbol:
            continue
        display_name = _clean_text(item.get("display_name"), symbol)
        clean_name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        directory[symbol] = {
            "symbol": symbol,
            "name": clean_name,
            "market": _clean_text(item.get("market")),
            "currentPrice": _clean_text(item.get("current_price_text"), ""),
            "signal": _clean_text(item.get("trade_signal"), "관찰"),
            "movingAverage": _clean_text(item.get("analysis_hint"), ""),
            "predRange": f"{_clean_text(item.get('pred_low_text'))} ~ {_clean_text(item.get('pred_high_text'))}",
            "memo": _clean_text(item.get("analysis_hint"), "도토리웹 저장소 기준 종목 정보"),
        }
    return {
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "symbols": directory,
    }


def main() -> None:
    PUBLIC_SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = build_snapshot()
    PUBLIC_SNAPSHOT_PATH.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    SYMBOL_DIRECTORY_PATH.write_text(
        json.dumps(build_symbol_directory(), ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    print(f"exported {PUBLIC_SNAPSHOT_PATH}")


if __name__ == "__main__":
    main()
