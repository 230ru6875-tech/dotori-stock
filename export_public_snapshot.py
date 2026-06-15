from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parents[1]
DOTORI_DIR = Path(__file__).resolve().parent
PREDICTIONS_PATH = BASE_DIR / "logs" / "latest_stock_predictions.json"
UNIFIED_SYMBOL_STATE_PATH = BASE_DIR / "logs" / "unified_symbol_state.json"
INVESTMENT_ANALYSIS_PATH = BASE_DIR / "logs" / "investment_analysis_latest.json"
MORNING_NOTE_PATH = BASE_DIR / "logs" / "morning_note_latest.json"
EXTERNAL_SIGNALS_PATH = BASE_DIR / "logs" / "external_signals" / "latest.json"
AUTONOMOUS_RESEARCH_PATH = BASE_DIR / "logs" / "autonomous_research" / "latest.json"
MANUAL_FUNDAMENTAL_NOTES_PATH = BASE_DIR / "logs" / "manual_fundamental_notes.json"
DISCOVERY_PART10_PATH = BASE_DIR / "logs" / "discovery_part10_latest.json"
TORI_RESEARCH_PATHS = [
    BASE_DIR / "logs" / "tori" / "tori_latest.json",
    BASE_DIR / "logs" / "tori1" / "tori_latest.json",
    BASE_DIR / "logs" / "tori2" / "tori_latest.json",
]
WATCHLIST_PATH = BASE_DIR / "config" / "price_band_alert_watchlist.json"
PREDICTION_SYMBOLS_PATH = BASE_DIR / "config" / "prediction_symbols.yaml"
PUBLIC_SNAPSHOT_PATH = DOTORI_DIR / "data" / "public-snapshot.json"
SYMBOL_DIRECTORY_PATH = DOTORI_DIR / "data" / "symbol-directory.json"
DOTORI_COM_REPORT_PATH = DOTORI_DIR / "data" / "dotori-com-report.json"
DOTORI_COM_AUTONOMY_POLICY_PATH = BASE_DIR / "config" / "dotori_com_autonomy_policy.json"
DOTORI_COM_PUBLIC_AUTONOMY_POLICY_PATH = DOTORI_DIR / "data" / "autonomy-policy.json"
KST = timezone(timedelta(hours=9))
REQUEST_TIMEOUT_SECONDS = 4
OHLC_CACHE: dict[tuple[str, str], dict] = {}

SYMBOL_ALIASES = {
    "엘지유플러스": ("032640", "LG유플러스", "국내"),
    "LG유플러스": ("032640", "LG유플러스", "국내"),
    "엘지전자": ("066570", "LG전자", "국내"),
    "LG전자": ("066570", "LG전자", "국내"),
    "엘지이노텍": ("011070", "LG이노텍", "국내"),
    "LG이노텍": ("011070", "LG이노텍", "국내"),
}

DEFAULT_US_SYMBOLS = [
    ("MU", "마이크론 테크놀로지"),
    ("MRVL", "마벨 테크놀로지"),
    ("AVGO", "브로드컴"),
    ("NVDA", "엔비디아"),
    ("AMD", "AMD"),
    ("TSM", "TSMC"),
    ("QQQ", "인베스코 QQQ"),
    ("SOXX", "필라델피아 반도체 ETF"),
    ("SMH", "반도체 ETF"),
    ("JPM", "JP모건체이스"),
    ("ETN", "이튼"),
    ("SNDK", "샌디스크"),
    ("TSLA", "테슬라"),
    ("AAPL", "애플"),
    ("MSFT", "마이크로소프트"),
    ("GOOGL", "알파벳"),
    ("META", "메타"),
    ("AMZN", "아마존"),
    ("ORCL", "오라클"),
    ("CRM", "세일즈포스"),
    ("NFLX", "넷플릭스"),
    ("PLTR", "팔란티어"),
    ("ARM", "Arm"),
    ("ASML", "ASML"),
    ("LRCX", "램리서치"),
    ("KLAC", "KLA"),
    ("INTC", "인텔"),
    ("QCOM", "퀄컴"),
    ("TXN", "텍사스 인스트루먼트"),
    ("AMAT", "어플라이드 머티어리얼즈"),
    ("MCHP", "마이크로칩"),
    ("ON", "온세미컨덕터"),
    ("IBM", "IBM"),
    ("BAC", "뱅크오브아메리카"),
    ("WFC", "웰스파고"),
    ("GS", "골드만삭스"),
    ("XOM", "엑슨모빌"),
    ("CVX", "셰브론"),
    ("CAT", "캐터필러"),
    ("DE", "디어"),
    ("BA", "보잉"),
    ("LMT", "록히드마틴"),
    ("NOC", "노스럽그러먼"),
    ("UNH", "유나이티드헬스"),
    ("JNJ", "존슨앤드존슨"),
    ("ABBV", "애브비"),
    ("PFE", "화이자"),
    ("GE", "GE"),
    ("AMT", "아메리칸타워"),
    ("SHOP", "쇼피파이"),
]


def _dotori_com_autonomy_policy() -> dict:
    default_policy = {
        "program": "dotori_com",
        "mode": "research_and_trading",
        "scope": "dotori.com",
        "allowed_actions": [
            "collect_market_data",
            "collect_news",
            "summarize_sources",
            "store_research",
            "verify_tori_research",
            "classify_verified_vs_reference_only",
            "generate_trade_candidates",
            "submit_buy",
            "submit_sell",
            "manage_positions",
        ],
        "forbidden_actions": [
            "bypass_broker_limits",
            "bypass_existing_autotrade_gates",
            "share_api_secrets_to_public_site",
        ],
        "trade_execution_allowed": True,
        "execution_owner": "pc_autotrade_engine",
        "verification_owner": "dotori_com",
        "tori_role_policy": {
            "tori1": "domestic_market_and_korean_morning_evening_news_collection",
            "tori2": "overseas_market_and_global_economic_news_collection",
            "tori3": "unused_by_default",
            "dotori_com": "verification_crosscheck_and_trade_candidate_classification",
        },
        "public_site_can_hold_secrets": False,
        "requires_existing_safety_gates": True,
    }
    try:
        payload = json.loads(DOTORI_COM_AUTONOMY_POLICY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return default_policy
    return payload if isinstance(payload, dict) else default_policy

DEFAULT_DOMESTIC_SYMBOLS = [
    ("005930", "삼성전자"),
    ("000660", "SK하이닉스"),
    ("373220", "LG에너지솔루션"),
    ("005380", "현대차"),
    ("000270", "기아"),
    ("068270", "셀트리온"),
    ("105560", "KB금융"),
    ("055550", "신한지주"),
    ("035420", "NAVER"),
    ("005490", "POSCO홀딩스"),
    ("012330", "현대모비스"),
    ("028260", "삼성물산"),
    ("006400", "삼성SDI"),
    ("051910", "LG화학"),
    ("035720", "카카오"),
    ("207940", "삼성바이오로직스"),
    ("032830", "삼성생명"),
    ("086790", "하나금융지주"),
    ("000810", "삼성화재"),
    ("316140", "우리금융지주"),
    ("066570", "LG전자"),
    ("034730", "SK"),
    ("096770", "SK이노베이션"),
    ("003550", "LG"),
    ("017670", "SK텔레콤"),
    ("009150", "삼성전기"),
    ("011070", "LG이노텍"),
    ("018260", "삼성에스디에스"),
    ("222800", "심텍"),
    ("001820", "삼화콘덴서"),
    ("009155", "삼성전기우"),
    ("018880", "한온시스템"),
    ("005850", "에스엘"),
    ("277810", "레인보우로보틱스"),
    ("033780", "KT&G"),
    ("015760", "한국전력"),
    ("010950", "S-Oil"),
    ("010130", "고려아연"),
    ("042660", "한화오션"),
    ("329180", "HD현대중공업"),
    ("012450", "한화에어로스페이스"),
    ("047810", "한국항공우주"),
    ("064350", "현대로템"),
    ("003670", "포스코퓨처엠"),
    ("247540", "에코프로비엠"),
    ("086520", "에코프로"),
    ("326030", "SK바이오팜"),
    ("196170", "알테오젠"),
    ("028300", "HLB"),
    ("039030", "이오테크닉스"),
]


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


def _load_dotenv_once() -> None:
    for path in (BASE_DIR / ".env", DOTORI_DIR / ".env"):
        if not path.exists():
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip('"').strip("'")


def _windows_user_env(*names: str) -> str:
    for name in names:
        value = str(os.environ.get(name, "") or "").strip()
        if value:
            return value
    if os.name != "nt":
        return ""
    try:
        import winreg
    except Exception:
        return ""
    for name in names:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                value = str(winreg.QueryValueEx(key, name)[0] or "").strip()
        except Exception:
            value = ""
        if value:
            os.environ.setdefault(name, value)
            return value
    return ""


def _http_json(url: str, params: dict | None = None, timeout: int = REQUEST_TIMEOUT_SECONDS) -> object:
    full_url = url
    if params:
        full_url += ("&" if "?" in full_url else "?") + urlencode(params)
    request = Request(
        full_url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://www.tossinvest.com",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or ""
    candidates = [charset] if charset else []
    if "naver.com" in url:
        candidates.extend(["cp949", "euc-kr"])
    candidates.extend(["utf-8", "cp949"])
    last_error: Exception | None = None
    for encoding in candidates:
        if not encoding:
            continue
        try:
            return json.loads(raw.decode(encoding))
        except Exception as exc:
            last_error = exc
    if last_error:
        raise last_error
    return json.loads(raw.decode("utf-8", errors="replace"))


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        text = str(value or "").replace(",", "").replace("$", "").replace("원", "").strip()
        if not text:
            return default
        return float(text)
    except Exception:
        return default


def _format_price(value: float, market_text: str) -> str:
    if value <= 0:
        return "-"
    if market_text == "미국":
        return f"${value:,.2f}"
    return f"{value:,.0f}원"


def _normalize_symbol_fields(symbol: object, name: object = "", market: object = "") -> tuple[str, str, str]:
    raw_symbol = str(symbol or "").strip()
    raw_name = str(name or "").strip()
    raw_market = str(market or "").strip()
    alias = SYMBOL_ALIASES.get(raw_symbol) or SYMBOL_ALIASES.get(raw_name)
    if alias:
        return alias
    normalized = raw_symbol.upper()
    if re.fullmatch(r"\d{1,6}", normalized):
        normalized = normalized.zfill(6)
        return normalized, raw_name or normalized, "국내"
    if re.fullmatch(r"[A-Z0-9.]+", normalized):
        return normalized, raw_name or normalized, raw_market or "미국"
    return normalized, raw_name or raw_symbol, raw_market or "국내"


def _scanner_row(item: dict, rank: int) -> dict:
    symbol, resolved_name, resolved_market = _normalize_symbol_fields(item.get("symbol"), item.get("display_name"), item.get("market"))
    symbol = _clean_text(symbol)
    name = _clean_text(resolved_name, symbol)
    current = _clean_text(item.get("current_price_text"))
    signal = _clean_text(item.get("trade_signal"), "관찰")
    purchase_price = _safe_float(item.get("purchase_price"), 0.0)
    if purchase_price <= 0 and any(token in signal for token in ("보유", "매도", "비중축소")):
        signal = "관찰대기"
    low = _clean_text(item.get("pred_low_text"))
    high = _clean_text(item.get("pred_high_text"))
    hint = _clean_text(item.get("analysis_hint"), "시장 데이터 확인")
    market = _clean_text(resolved_market)
    if market == "국내" and "$" in current:
        quote_row = _fetch_public_quote(symbol, "국내")
        price = _safe_float(quote_row.get("price"), 0.0)
        if price > 0:
            current = _format_price(price, "국내")
            low = "-"
            high = "-"
    evidence = _public_evidence_analysis(symbol, [hint], signal)
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
        "evidence": evidence,
    }


def _integrated_source_label(part_key: str) -> str:
    labels = {
        "scanner": "1파트 스캐너",
        "scanner_integrated": "통합추천",
        "turso_scanner": "외부 스캐너",
        "tori_part1_scanner": "토리 스캐너",
        "tori_part5_learning": "토리 학습",
        "investment": "2파트 투자",
        "autotrade_plan": "3파트 자동매매",
        "prediction": "4파트 예측",
        "learning": "5파트 학습",
        "earnings": "6파트 실적",
        "spike": "7파트 급등주",
        "moving_average": "8파트 이평선",
        "analysis_signal": "8파트 분석",
        "analysis_sector_signal": "8파트 섹터",
        "discovery": "10파트 발견",
        "backtest": "11파트 백테스트",
        "watchlist": "4파트 관심종목",
        "watch_state": "4파트 감시상태",
    }
    return labels.get(str(part_key or ""), str(part_key or "자료"))


def _integrated_part_score(part_key: str, part: dict) -> float:
    score = 0.0
    raw_score = _safe_float(part.get("score", part.get("last_score", 0.0)), 0.0)
    if raw_score:
        score += max(-20.0, min(100.0, raw_score)) * 0.28
    expected = _safe_float(part.get("expected_return_pct", part.get("unrealized_return_pct", 0.0)), 0.0)
    score += max(-15.0, min(20.0, expected)) * 1.3
    priority = _safe_float(part.get("priority_score"), 0.0)
    score += max(-12.0, min(20.0, priority)) * 1.5
    signal_pct = _safe_float(part.get("part_signal_total_pct", part.get("profit_engine_adjustment_pct", 0.0)), 0.0)
    score += max(-10.0, min(12.0, signal_pct)) * 1.2
    side = str(part.get("side", "") or "").lower()
    action = str(part.get("action", "") or part.get("trade_signal", "") or part.get("profit_engine_label", "") or "")
    text = f"{side} {action}"
    if "buy_candidate" in side or "강한 매수" in text:
        score += 18.0
    elif "hold_or_scale" in side or "추가" in text or "매수" in text:
        score += 10.0
    elif "hold" in side or "보유" in text or "관찰" in text:
        score += 3.0
    if "sell_watch" in side or "매도" in text or "손절" in text or "위험" in text:
        score -= 14.0
    score += min(12.0, max(0.0, _safe_float(part.get("buy_weight"), 0.0)) * 8.0)
    score -= min(18.0, max(0.0, _safe_float(part.get("sell_ratio"), 0.0)) * 14.0)
    score += {
        "scanner": 5.0,
        "scanner_integrated": 10.0,
        "tori_part1_scanner": 4.0,
        "investment": 4.0,
        "autotrade_plan": 5.0,
        "prediction": 3.0,
        "spike": 4.0,
        "moving_average": 3.0,
        "analysis_signal": 3.0,
    }.get(part_key, 0.0)
    return score


def _integrated_action(score: float, action_votes: list[str]) -> str:
    joined = " ".join(action_votes)
    if "매도" in joined or "손절" in joined or score < 18:
        return "관찰"
    if score >= 55:
        return "강한 매수"
    if score >= 35:
        return "매수 후보"
    return "관찰"


def _dedupe_texts(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
    return output


def _manual_fundamental_notes_payload() -> dict:
    try:
        payload = json.loads(MANUAL_FUNDAMENTAL_NOTES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _manual_fundamental_note(symbol: str) -> dict:
    payload = _manual_fundamental_notes_payload()
    symbols = payload.get("symbols", {}) if isinstance(payload.get("symbols"), dict) else {}
    row = symbols.get(str(symbol or "").strip().upper(), {}) if isinstance(symbols, dict) else {}
    return row if isinstance(row, dict) else {}


def _public_evidence_analysis(symbol: str, reasons: list[str] | None = None, signal: str = "") -> dict:
    note = _manual_fundamental_note(symbol)
    positive = note.get("positive_points", []) if isinstance(note.get("positive_points"), list) else []
    watch = note.get("watch_points", []) if isinstance(note.get("watch_points"), list) else []
    required = note.get("required_confirmations", []) if isinstance(note.get("required_confirmations"), list) else []
    clues = _dedupe_texts([str(item) for item in positive[:3]] + [str(item) for item in (reasons or [])[:3]])
    if not clues:
        clues = [
            "도토리 통합 스캐너가 가격, 예측, 이평선, 뉴스 흐름을 연결해 후보로 분류했습니다.",
            "구체적인 사업·재무 근거는 공시와 실적 자료가 확보될 때 보강합니다.",
        ]
    flow = _dedupe_texts([
        "사업동력 확인",
        "영업률과 순이익률 비교",
        "부채비율과 이자비용 점검",
        "차트 신호는 진입 타이밍 참고",
    ])
    confirmations = _dedupe_texts([str(item) for item in required[:3]] + [str(item) for item in watch[:2]])
    if not confirmations:
        confirmations = [
            "실적 개선이 실제 순이익으로 이어지는지 확인",
            "부채 부담 또는 현금흐름 훼손이 없는지 확인",
            "예측가와 현재가 사이의 손익비가 충분한지 확인",
        ]
    title = _clean_text(note.get("title"), "근거 기반 종목 점검")
    stance = _clean_text(note.get("stance"), "자료 미확인 종목은 확신 매수보다 정찰 또는 관찰 우선")
    if signal and "매수" in signal and not note:
        stance = "매수 후보라도 사업·재무 확인 전에는 정찰 관점으로만 봅니다."
    return {
        "title": title,
        "clues": clues[:4],
        "flow": flow,
        "confirmations": confirmations[:4],
        "stance": stance,
    }


def _scanner_rows_from_unified_state(market_text: str, limit: int = 30) -> list[dict]:
    if not UNIFIED_SYMBOL_STATE_PATH.exists():
        return []
    try:
        payload = json.loads(UNIFIED_SYMBOL_STATE_PATH.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return []
    symbols = payload.get("symbols", {}) if isinstance(payload, dict) else {}
    if not isinstance(symbols, dict):
        return []
    rows: list[dict] = []
    for raw_symbol, entry in symbols.items():
        if not isinstance(entry, dict):
            continue
        symbol, resolved_name, resolved_market = _normalize_symbol_fields(
            entry.get("symbol", raw_symbol),
            entry.get("name", raw_symbol),
            entry.get("market", ""),
        )
        resolved_name = re.sub(r"\s*\(\d+회 중복\)\s*$", "", resolved_name).strip() or symbol
        if resolved_market != market_text:
            continue
        parts = entry.get("parts", {}) if isinstance(entry.get("parts"), dict) else {}
        if not parts:
            continue
        score = 0.0
        source_labels: list[str] = []
        reason_parts: list[str] = []
        action_votes: list[str] = []
        integrated_part = parts.get("scanner_integrated") if isinstance(parts.get("scanner_integrated"), dict) else {}
        for part_key, part in parts.items():
            if not isinstance(part, dict):
                continue
            label = _integrated_source_label(str(part_key))
            if label not in source_labels:
                source_labels.append(label)
            score += _integrated_part_score(str(part_key), part)
            action_text = str(part.get("action") or part.get("side") or part.get("trade_signal") or part.get("profit_engine_label") or "")
            if action_text:
                action_votes.append(action_text)
            for key in ("reason", "analysis_hint", "profit_engine_note", "condition_learning_note", "risk_note"):
                text = str(part.get(key, "") or "").strip()
                if text:
                    reason_parts.append(text)
                    break
            raw_reasons = part.get("reasons", [])
            if isinstance(raw_reasons, list):
                reason_parts.extend(str(reason or "").strip() for reason in raw_reasons[:2] if str(reason or "").strip())
        duplicate_count = int(entry.get("duplicate_count", len(parts)) or len(parts))
        score += min(18.0, max(0, duplicate_count - 1) * 4.0)
        if score <= 0:
            continue
        current_price = _safe_float(entry.get("current_price"), 0.0)
        if current_price <= 0 and isinstance(integrated_part, dict):
            current_price = _safe_float(integrated_part.get("current_price"), 0.0)
        signal = _clean_text(integrated_part.get("action") if isinstance(integrated_part, dict) else "", _integrated_action(score, action_votes))
        expected = _safe_float(integrated_part.get("expected_return_pct") if isinstance(integrated_part, dict) else 0.0, 0.0)
        if not expected:
            for part in parts.values():
                if isinstance(part, dict):
                    expected = _safe_float(part.get("expected_return_pct"), 0.0)
                    if expected:
                        break
        reasons = _dedupe_texts([
            f"통합자료 {len(source_labels)}개 반영: {', '.join(source_labels[:6])}",
            f"통합추천점수 {score:.1f}",
        ] + reason_parts)
        evidence = _public_evidence_analysis(symbol, reasons, signal)
        rows.append(
            {
                "rank": 0,
                "market": market_text,
                "symbol": symbol,
                "name": f"{resolved_name}({symbol})" if symbol not in resolved_name else resolved_name,
                "currentPrice": _format_price(current_price, market_text),
                "signal": signal,
                "predRange": f"예상수익 {expected:+.2f}%",
                "summary": " | ".join(reasons[:3]),
                "sentiment": signal,
                "risk": reasons[2] if len(reasons) > 2 else "통합자료 기준 관찰",
                "source": "도토리 PC 통합 추천자료",
                "score": round(score, 2),
                "integratedSources": source_labels,
                "evidence": evidence,
            }
        )
    rows.sort(key=lambda row: float(row.get("score", 0.0) or 0.0), reverse=True)
    return _dedupe_and_rank(rows, limit)


def _top_items(items: list[dict], market_text: str, limit: int = 50) -> list[dict]:
    filtered = [
        item for item in items
        if isinstance(item, dict)
        and _normalize_symbol_fields(item.get("symbol"), item.get("display_name"), item.get("market"))[2] == market_text
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
        is_domestic_symbol = bool(re.fullmatch(r"\d{6}", symbol))
        if market_text == "국내" and not is_domestic_symbol:
            continue
        if market_text == "미국" and is_domestic_symbol:
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


def _extract_toss_price(payload: object) -> float:
    candidates: list[object] = []
    if isinstance(payload, dict):
        result = payload.get("result", payload)
        if isinstance(result, list):
            candidates.extend(result)
        elif isinstance(result, dict):
            candidates.append(result)
            for key in ("items", "prices", "stockPrices"):
                value = result.get(key)
                if isinstance(value, list):
                    candidates.extend(value)
        candidates.append(payload)
    elif isinstance(payload, list):
        candidates.extend(payload)
    for item in candidates:
        if not isinstance(item, dict):
            continue
        for key in ("close", "tradePrice", "price", "currentPrice", "afterMarketClose", "preMarketClose", "regularMarketPrice"):
            value = _safe_float(item.get(key), 0.0)
            if value > 0:
                return value
    return 0.0


def _extract_toss_price_detail(payload: object) -> dict:
    candidates: list[object] = []
    if isinstance(payload, dict):
        result = payload.get("result", payload)
        if isinstance(result, list):
            candidates.extend(result)
        elif isinstance(result, dict):
            candidates.append(result)
            for key in ("items", "prices", "stockPrices"):
                value = result.get(key)
                if isinstance(value, list):
                    candidates.extend(value)
        candidates.append(payload)
    elif isinstance(payload, list):
        candidates.extend(payload)
    for item in candidates:
        if isinstance(item, dict) and _extract_toss_price(item) > 0:
            return item
    return {}


def _fetch_toss_public_quote(symbol: str) -> dict:
    normalized = str(symbol or "").strip().upper()
    if not normalized:
        return {}
    try:
        info_payload = _http_json(f"https://wts-info-api.tossinvest.com/api/v2/stock-infos/code-or-symbol/{quote(normalized)}")
    except Exception:
        return {}
    info = info_payload.get("result", info_payload) if isinstance(info_payload, dict) else {}
    if not isinstance(info, dict):
        return {}
    product_code = str(info.get("productCode") or info.get("code") or info.get("guid") or "").strip()
    detail = {}
    if product_code:
        endpoints = (
            ("https://wts-info-api.tossinvest.com/api/v3/stock-prices/details", {"productCodes": product_code}),
            ("https://wts-info-api.tossinvest.com/api/v3/stock-prices", {"productCodes": product_code, "viewType": "DETAIL", "meta": "true"}),
            ("https://wts-info-api.tossinvest.com/api/v1/product/stock-prices", {"productCodes": product_code, "meta": "true"}),
        )
        for url, params in endpoints:
            try:
                detail = _extract_toss_price_detail(_http_json(url, params))
            except Exception:
                detail = {}
            if detail:
                break
    price = _extract_toss_price(detail)
    name = (
        str(info.get("name") or info.get("stockName") or info.get("nameKo") or info.get("korName") or "").strip()
        or str(info.get("nameEng") or info.get("englishName") or "").strip()
    )
    return {
        "symbol": normalized,
        "name": name,
        "price": price,
        "market": "미국" if not re.fullmatch(r"\d{6}", normalized) else "국내",
        "source": "Toss Securities",
        "productCode": product_code,
    }


def _fetch_yahoo_quote(symbol: str) -> dict:
    normalized = str(symbol or "").strip().upper()
    if not normalized:
        return {}
    try:
        payload = _http_json("https://query1.finance.yahoo.com/v7/finance/quote", {"symbols": normalized})
        rows = payload.get("quoteResponse", {}).get("result", []) if isinstance(payload, dict) else []
        row = rows[0] if rows and isinstance(rows[0], dict) else {}
    except Exception:
        row = {}
    if not row:
        try:
            chart = _http_json(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(normalized)}",
                {"range": "1d", "interval": "1m", "includePrePost": "true"},
            )
            result = chart.get("chart", {}).get("result", [])[0]
            meta = result.get("meta", {})
            row = {
                "regularMarketPrice": meta.get("regularMarketPrice"),
                "shortName": meta.get("symbol"),
                "longName": meta.get("symbol"),
            }
        except Exception:
            row = {}
    price = _safe_float(row.get("regularMarketPrice") or row.get("postMarketPrice") or row.get("preMarketPrice"), 0.0)
    name = str(row.get("longName") or row.get("shortName") or normalized).strip()
    return {"symbol": normalized, "name": name, "price": price, "market": "미국", "source": "Yahoo Finance"}


def _yahoo_chart_symbol_candidates(symbol: str, market_text: str = "") -> list[str]:
    normalized = str(symbol or "").strip().upper()
    if not normalized:
        return []
    if re.fullmatch(r"\d{1,6}", normalized) or market_text == "국내":
        domestic = normalized.zfill(6)
        return [f"{domestic}.KS", f"{domestic}.KQ"]
    return [normalized]


def _fetch_yahoo_ohlc(symbol: str, market_text: str = "", limit: int = 80) -> dict:
    normalized = str(symbol or "").strip().upper()
    if not normalized:
        return {}
    cache_key = (normalized, str(market_text or ""))
    if cache_key in OHLC_CACHE:
        return OHLC_CACHE[cache_key]
    for yahoo_symbol in _yahoo_chart_symbol_candidates(normalized, market_text):
        try:
            chart = _http_json(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(yahoo_symbol)}",
                {"range": "3mo", "interval": "1d", "includePrePost": "true", "events": "history"},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            result = chart.get("chart", {}).get("result", [])[0]
            timestamps = result.get("timestamp", [])
            quote_rows = result.get("indicators", {}).get("quote", [])
            quote_row = quote_rows[0] if quote_rows and isinstance(quote_rows[0], dict) else {}
            if not timestamps or not quote_row:
                continue
            rows: list[dict] = []
            opens = quote_row.get("open") or []
            highs = quote_row.get("high") or []
            lows = quote_row.get("low") or []
            closes = quote_row.get("close") or []
            volumes = quote_row.get("volume") or []
            for index, ts in enumerate(timestamps):
                close = _safe_float(closes[index] if index < len(closes) else None, 0.0)
                if close <= 0:
                    continue
                open_value = _safe_float(opens[index] if index < len(opens) else close, close)
                high_value = _safe_float(highs[index] if index < len(highs) else close, close)
                low_value = _safe_float(lows[index] if index < len(lows) else close, close)
                volume = _safe_float(volumes[index] if index < len(volumes) else 0, 0.0)
                traded_at = datetime.fromtimestamp(int(ts), KST).date().isoformat()
                rows.append({
                    "date": traded_at,
                    "open": round(open_value, 4),
                    "high": round(high_value, 4),
                    "low": round(low_value, 4),
                    "close": round(close, 4),
                    "volume": int(volume) if volume >= 0 else 0,
                })
            if rows:
                payload = {
                    "symbol": normalized,
                    "quoteSymbol": yahoo_symbol,
                    "source": "Yahoo Finance",
                    "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
                    "rows": rows[-limit:],
                }
                OHLC_CACHE[cache_key] = payload
                return payload
        except Exception:
            continue
    OHLC_CACHE[cache_key] = {}
    return {}


def _previous_ohlc_by_symbol(previous: dict) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    moving_rows = previous.get("movingAverages", []) if isinstance(previous, dict) else []
    if not isinstance(moving_rows, list):
        return rows
    for item in moving_rows:
        if not isinstance(item, dict):
            continue
        symbol = _clean_text(item.get("symbol"), "").upper()
        ohlc = item.get("ohlc")
        if symbol and isinstance(ohlc, list) and ohlc:
            rows[symbol] = {
                "source": _clean_text(item.get("ohlcSource"), "previous snapshot"),
                "updatedAt": _clean_text(item.get("ohlcUpdatedAt"), ""),
                "rows": ohlc,
            }
    return rows


def _fetch_naver_quote(symbol: str) -> dict:
    normalized = str(symbol or "").strip().zfill(6)
    if not re.fullmatch(r"\d{6}", normalized):
        return {}
    try:
        payload = _http_json(
            "https://polling.finance.naver.com/api/realtime",
            {"query": f"SERVICE_ITEM:{normalized}"},
        )
    except Exception:
        return {}
    areas = payload.get("result", {}).get("areas", []) if isinstance(payload, dict) else []
    datas = []
    for area in areas:
        if isinstance(area, dict) and isinstance(area.get("datas"), list):
            datas.extend(area["datas"])
    row = datas[0] if datas and isinstance(datas[0], dict) else {}
    name = str(row.get("nm") or row.get("name") or normalized).strip()
    price = _safe_float(row.get("nv") or row.get("closePrice") or row.get("nowVal"), 0.0)
    return {"symbol": normalized, "name": name, "price": price, "market": "국내", "source": "Naver Finance"}


def _fetch_public_quote(symbol: str, market_text: str) -> dict:
    normalized = str(symbol or "").strip().upper()
    if not normalized:
        return {}
    if market_text == "국내" or re.fullmatch(r"\d{6}", normalized):
        return _fetch_naver_quote(normalized)
    quote_row = _fetch_toss_public_quote(normalized)
    if quote_row.get("price", 0) > 0:
        return quote_row
    return _fetch_yahoo_quote(normalized)


def _load_watchlist_symbols() -> list[dict]:
    if not WATCHLIST_PATH.exists():
        return []
    try:
        payload = json.loads(WATCHLIST_PATH.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return []
    items = payload.get("items", []) if isinstance(payload, dict) else []
    rows: list[dict] = []
    if not isinstance(items, list):
        return rows
    for item in items:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol", "") or "").strip().upper()
        if not symbol:
            continue
        market = "국내" if re.fullmatch(r"\d{6}", symbol) else "미국"
        rows.append({
            "symbol": symbol,
            "name": _clean_text(item.get("name"), symbol),
            "market": market,
            "basePrice": item.get("base_price"),
            "quantity": item.get("quantity"),
        })
    return rows


def _load_prediction_symbol_rows() -> list[dict]:
    if not PREDICTION_SYMBOLS_PATH.exists():
        return []
    rows: list[dict] = []
    current: dict = {}
    for line in PREDICTION_SYMBOLS_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if stripped.startswith("- symbol:"):
            if current.get("symbol"):
                rows.append(current)
            current = {"symbol": stripped.split(":", 1)[1].strip().strip("'\"")}
        elif ":" in stripped and current is not None:
            key, value = stripped.split(":", 1)
            current[key.strip()] = value.strip().strip("'\"")
    if current.get("symbol"):
        rows.append(current)
    normalized_rows = []
    for row in rows:
        symbol = str(row.get("symbol", "") or "").strip().upper()
        if not symbol:
            continue
        normalized_rows.append({
            "symbol": symbol,
            "name": _clean_text(row.get("name"), symbol),
            "market": "국내" if re.fullmatch(r"\d{6}", symbol) else "미국",
            "basePrice": row.get("purchase_price"),
            "quantity": row.get("quantity"),
        })
    return normalized_rows


def _fallback_candidates(market_text: str) -> list[dict]:
    candidates: list[dict] = []
    candidates.extend(_load_watchlist_symbols())
    candidates.extend(_load_prediction_symbol_rows())
    if market_text == "국내":
        candidates.extend({"symbol": symbol, "name": name, "market": "국내"} for symbol, name in DEFAULT_DOMESTIC_SYMBOLS)
    if market_text == "미국":
        candidates.extend({"symbol": symbol, "name": name, "market": "미국"} for symbol, name in DEFAULT_US_SYMBOLS)
    seen: set[str] = set()
    rows: list[dict] = []
    for item in candidates:
        symbol = str(item.get("symbol", "") or "").strip().upper()
        market = str(item.get("market", "") or "").strip()
        if not symbol or symbol in seen or market != market_text:
            continue
        seen.add(symbol)
        rows.append(item)
    return rows


def _supplement_from_public_quotes(market_text: str, used_symbols: set[str], start_rank: int, limit: int) -> list[dict]:
    rows: list[dict] = []
    for item in _fallback_candidates(market_text):
        if len(rows) >= limit:
            break
        symbol = str(item.get("symbol", "") or "").strip().upper()
        if not symbol or symbol in used_symbols:
            continue
        quote_row = _fetch_public_quote(symbol, market_text)
        name = _clean_text(quote_row.get("name") or item.get("name"), symbol)
        price = _safe_float(quote_row.get("price"), 0.0)
        base = _safe_float(item.get("basePrice"), 0.0)
        signal = "관심"
        if base > 0 and price > 0:
            change_pct = (price - base) / base * 100.0
            if change_pct >= 7:
                signal = "매도/관찰"
            elif change_pct <= -7:
                signal = "보유/관찰"
            else:
                signal = "보유/변동성확대"
        summary = f"도토리컴 보충자료 | 현재 {_format_price(price, market_text)}"
        if base > 0:
            summary += f" | 기준 {_format_price(base, market_text)}"
        rows.append({
            "rank": start_rank + len(rows),
            "market": market_text,
            "symbol": symbol,
            "name": f"{name}({symbol})" if symbol not in name else name,
            "currentPrice": _format_price(price, market_text),
            "signal": signal,
            "predRange": "도토리컴 보충",
            "summary": summary,
            "sentiment": signal,
            "risk": "자료 부족 보완",
            "source": quote_row.get("source") or "도토리컴 보충자료",
            "score": 0.0,
        })
        used_symbols.add(symbol)
    return rows


def _dedupe_and_rank(rows: list[dict], limit: int) -> list[dict]:
    seen: set[str] = set()
    output: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = _clean_text(row.get("symbol"), "").upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        fixed = dict(row)
        fixed["rank"] = len(output) + 1
        output.append(fixed)
        if len(output) >= limit:
            break
    return output


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
        raw_display_name = _clean_text(item.get("display_name"), "")
        resolved_symbol, resolved_name, resolved_market = _normalize_symbol_fields(
            item.get("symbol"),
            raw_display_name,
            item.get("market"),
        )
        symbol = _clean_text(resolved_symbol, "")
        if not symbol:
            continue
        display_name = _clean_text(resolved_name or raw_display_name, symbol)
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
            "signal": _public_prediction_signal(item),
            "note": note,
            "score": round(_score_from_reasons(item), 2),
        }))
    rows.sort(key=lambda pair: (pair[0], pair[1].get("score", 0)), reverse=True)
    return [row for _, row in rows[:limit]]


def _supplement_spike_rows(items: list[dict], market_text: str, existing_symbols: set[str], limit: int = 20) -> list[dict]:
    rows: list[tuple[float, dict]] = []
    for item in items or []:
        if not isinstance(item, dict) or _is_excluded_product(item):
            continue
        raw_display_name = _clean_text(item.get("display_name"), "")
        resolved_symbol, resolved_name, resolved_market = _normalize_symbol_fields(
            item.get("symbol"),
            raw_display_name,
            item.get("market"),
        )
        symbol = _clean_text(resolved_symbol, "").upper()
        if not symbol or symbol in existing_symbols:
            continue
        is_domestic = bool(re.fullmatch(r"\d{6}", symbol))
        if market_text == "국내" and not is_domestic:
            continue
        if market_text == "미국" and is_domestic:
            continue
        reason = _reason_with_keywords(item, ("\ucd5c\uadfc \uc218\uc775\ub960", "20\uc77c", "\uae09\ub4f1", "\uae09\ub77d", "\uc0c1\uc2b9", "\ud558\ub77d"))
        if not reason:
            continue
        pct = _pct_from_text(reason)
        if abs(pct) < 3.0:
            continue
        display_name = _clean_text(resolved_name or raw_display_name, symbol)
        name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        rows.append((abs(pct), {
            "name": name,
            "symbol": symbol,
            "market": market_text,
            "range": "\ucd5c\uadfc \uc218\uc775\ub960/\uc218\uae09 \ubcf4\ucda9",
            "change": f"{pct:+.1f}%",
            "currentPrice": _clean_text(item.get("current_price_text"), ""),
            "signal": _public_prediction_signal(item),
            "note": _shorten(reason),
            "score": round(_score_from_reasons(item), 2),
        }))
        existing_symbols.add(symbol)
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


def _public_prediction_signal(item: dict) -> str:
    signal = _clean_text(item.get("trade_signal"), "관찰")
    purchase_price = _safe_float(item.get("purchase_price"), 0.0)
    if purchase_price <= 0 and any(token in signal for token in ("보유", "매도", "비중축소")):
        return "관찰대기"
    return signal


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


def _moving_average_value(rows: list[dict], window_size: int) -> float:
    closes: list[float] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        close = _safe_float(row.get("close"), 0.0)
        if close > 0:
            closes.append(close)
    if len(closes) < window_size:
        return 0.0
    return sum(closes[-window_size:]) / window_size


def _moving_average_rows(items: list[dict], limit: int = 30, previous_ohlc: dict[str, dict] | None = None) -> list[dict]:
    rows: list[dict] = []
    previous_ohlc = previous_ohlc or {}
    for item in items:
        if not isinstance(item, dict):
            continue
        raw_display_name = _clean_text(item.get("display_name"), "")
        resolved_symbol, resolved_name, resolved_market = _normalize_symbol_fields(
            item.get("symbol"),
            raw_display_name,
            item.get("market"),
        )
        symbol = _clean_text(resolved_symbol, "")
        if not symbol:
            continue
        display_name = _clean_text(resolved_name or raw_display_name, symbol)
        name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        note = _first_matching_reason(item, ("\uc774\ud3c9", "20\uc77c", "\ucd94\uc138", "\ub370\ub4dc", "\uace8\ub4e0"))
        if not note:
            note = _clean_text(item.get("analysis_hint"), "")
        market = _clean_text(resolved_market)
        ohlc_payload = _fetch_yahoo_ohlc(symbol, market)
        if not ohlc_payload.get("rows"):
            ohlc_payload = previous_ohlc.get(symbol.upper(), {})
        ohlc_rows = ohlc_payload.get("rows", []) if isinstance(ohlc_payload.get("rows"), list) else []
        current_price = _safe_float(item.get("current_price_text"), 0.0)
        ma20_value = _moving_average_value(ohlc_rows, 20)
        ma60_value = _moving_average_value(ohlc_rows, 60)
        ma20_gap = ((current_price / ma20_value) - 1.0) * 100.0 if current_price > 0 and ma20_value > 0 else 0.0
        ma60_gap = ((current_price / ma60_value) - 1.0) * 100.0 if current_price > 0 and ma60_value > 0 else 0.0
        ma20_text = _format_price(ma20_value, market) if ma20_value > 0 else _ma20_label(item)
        ma60_text = _format_price(ma60_value, market) if ma60_value > 0 else _ma60_label(item)
        ma_note = _shorten(f"20\uc77c\uc120 \ub300\ube44 {ma20_gap:+.1f}% | {note}", 140) if ma20_value > 0 else _shorten(note)
        rows.append({
            "name": name,
            "symbol": symbol,
            "market": market,
            "currentPrice": _clean_text(item.get("current_price_text"), ""),
            "ma20": ma20_text,
            "ma60": ma60_text,
            "ma20Value": round(ma20_value, 4),
            "ma60Value": round(ma60_value, 4),
            "ma20Gap": f"{ma20_gap:+.1f}%" if ma20_value > 0 else "",
            "ma60Gap": f"{ma60_gap:+.1f}%" if ma60_value > 0 else "",
            "decision": _public_prediction_signal(item),
            "note": ma_note,
            "score": round(_score_from_reasons(item), 2),
            "ohlc": ohlc_rows,
            "ohlcSource": _clean_text(ohlc_payload.get("source"), ""),
            "ohlcUpdatedAt": _clean_text(ohlc_payload.get("updatedAt"), ""),
            "ohlcQuoteSymbol": _clean_text(ohlc_payload.get("quoteSymbol"), ""),
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
        signal = _public_prediction_signal(item)
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


def _public_growth_discovery_rows(limit: int = 40) -> list[dict]:
    if not DISCOVERY_PART10_PATH.exists():
        return []
    try:
        payload = json.loads(DISCOVERY_PART10_PATH.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return []
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return []
    output: list[dict] = []
    for index, row in enumerate(rows[:limit], start=1):
        if not isinstance(row, dict):
            continue
        symbol = _clean_text(row.get("symbol"), "")
        if not symbol:
            continue
        name = _clean_text(row.get("display_name"), symbol)
        score = _safe_float(row.get("score"), 0.0)
        price = _safe_float(row.get("price"), 0.0)
        reasons = row.get("reasons", [])
        if not isinstance(reasons, list):
            reasons = [row.get("reason", "")]
        durable = row.get("durable_growth_metrics", {}) if isinstance(row.get("durable_growth_metrics"), dict) else {}
        quality = row.get("quality_valuation_metrics", {}) if isinstance(row.get("quality_valuation_metrics"), dict) else {}
        notes: list[str] = []
        durable_notes = durable.get("notes", []) if isinstance(durable.get("notes"), list) else []
        for value in list(reasons[:4]) + list(durable_notes):
            text = _clean_text(value, "")
            if text and text not in notes:
                notes.append(text)
        quality_label = _clean_text(quality.get("label"), "")
        if quality_label and quality_label not in notes:
            notes.append(quality_label)
        output.append(
            {
                "rank": int(row.get("rank") or index),
                "symbol": symbol,
                "name": name,
                "market": "국내",
                "score": round(score, 1),
                "verdict": _clean_text(row.get("verdict"), "관찰"),
                "theme": _clean_text(row.get("theme"), "일반성장"),
                "currentPrice": price,
                "currentPriceText": _format_price(price, "국내"),
                "return5d": f"{_safe_float(row.get('return_5d_pct'), 0.0):+.2f}%",
                "return20d": f"{_safe_float(row.get('return_20d_pct'), 0.0):+.2f}%",
                "volumeRatio": f"{_safe_float(row.get('volume_ratio_20'), 0.0):.2f}배",
                "rsi": f"{_safe_float(row.get('rsi_14'), 0.0):.1f}",
                "lifecycle": _clean_text(row.get("company_lifecycle"), ""),
                "reason": _clean_text(row.get("reason"), ""),
                "notes": notes[:5],
            }
        )
    return output


def _reason_with_keywords(item: dict, keywords: tuple[str, ...]) -> str:
    for reason in item.get("reasons", []) or []:
        text = str(reason or "").strip()
        if any(keyword in text for keyword in keywords):
            return text
    return ""


def _growth_pct_from_item(item: dict) -> float:
    for reason in item.get("reasons", []) or []:
        text = str(reason or "")
        if "20\uc77c" in text or "\ucd5c\uadfc \uc218\uc775\ub960" in text or "\uc0c1\uc2b9" in text:
            pct = _pct_from_text(text)
            if pct:
                return pct
    return 0.0


def _public_us_growth_discovery_rows(items: list[dict], start_rank: int = 1, limit: int = 30, existing_symbols: set[str] | None = None) -> list[dict]:
    existing = {str(symbol or "").strip().upper() for symbol in (existing_symbols or set())}
    candidates: list[tuple[float, dict]] = []
    for item in items or []:
        if not isinstance(item, dict) or _is_excluded_product(item):
            continue
        raw_display_name = _clean_text(item.get("display_name"), "")
        resolved_symbol, resolved_name, resolved_market = _normalize_symbol_fields(
            item.get("symbol"),
            raw_display_name,
            item.get("market"),
        )
        symbol = _clean_text(resolved_symbol, "").upper()
        if not symbol or symbol in existing or re.fullmatch(r"\d{6}", symbol):
            continue
        market = _clean_text(resolved_market, "미국")
        if market not in {"미국", "해외"}:
            continue
        display_name = _clean_text(resolved_name or raw_display_name, symbol)
        name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        growth_pct = _growth_pct_from_item(item)
        base_score = _score_from_reasons(item)
        if growth_pct < 3.0 and base_score < 80:
            continue
        current_price = _safe_float(item.get("current_price_text"), 0.0)
        reason = _reason_with_keywords(item, ("20\uc77c", "\ucd5c\uadfc \uc218\uc775\ub960", "\uac70\ub798\ub7c9", "\uc131\uc7a5", "AI", "\ubc18\ub3c4\uccb4"))
        notes = []
        for value in item.get("reasons", [])[:5] if isinstance(item.get("reasons"), list) else []:
            text = _clean_text(value, "")
            if text and text not in notes:
                notes.append(text)
        volume_text = _reason_with_keywords(item, ("\uac70\ub798\ub7c9", "20\uc77c \ud3c9\uade0"))
        candidates.append((
            growth_pct + base_score * 0.03,
            {
                "rank": 0,
                "symbol": symbol,
                "name": name,
                "market": "미국",
                "score": round(base_score, 1),
                "verdict": _clean_text(item.get("trade_signal"), "관찰"),
                "theme": _clean_text(item.get("analysis_hint"), "미국 성장후보"),
                "currentPrice": current_price,
                "currentPriceText": _format_price(current_price, "미국"),
                "return5d": "-",
                "return20d": f"{growth_pct:+.2f}%" if growth_pct else "-",
                "volumeRatio": _shorten(volume_text, 32) if volume_text else "-",
                "rsi": "-",
                "lifecycle": "",
                "reason": _clean_text(reason, ""),
                "notes": notes[:5],
            },
        ))
    candidates.sort(key=lambda pair: pair[0], reverse=True)
    rows = [row for _, row in candidates[:limit]]
    for offset, row in enumerate(rows, start=start_rank):
        row["rank"] = offset
    return rows


def _read_json_dict(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _dotori_research_source_paths() -> list[Path]:
    paths = [AUTONOMOUS_RESEARCH_PATH]
    paths.extend(TORI_RESEARCH_PATHS)
    return paths


def _dotori_research_news_list(limit: int = 40) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for path in _dotori_research_source_paths():
        if not path.exists():
            continue
        payload = _read_json_dict(path)
        items = payload.get("items", [])
        if not isinstance(items, list):
            continue
        collected_at = _clean_text(payload.get("collected_at"), "")
        source_label = "dotori-com" if path == AUTONOMOUS_RESEARCH_PATH else _clean_text(payload.get("node_id"), path.parent.name)
        for item in items:
            if not isinstance(item, dict):
                continue
            title = _clean_public_line(item.get("title"))
            summary = _clean_public_line(item.get("summary"))
            url = _clean_text(item.get("url"), "")
            if not title or not summary:
                continue
            key = url or title
            if key in seen:
                continue
            domain = _clean_text(item.get("source_domain"), "")
            verification = item.get("verification", {}) if isinstance(item.get("verification"), dict) else {}
            confidence = _clean_text(verification.get("confidence"), "unverified")
            trade_signal_allowed = bool(verification.get("trade_signal_allowed", False))
            if len(summary) > 180:
                summary = summary[:177].rstrip() + "..."
            rows.append(
                {
                    "title": title,
                    "summary": summary,
                    "asOf": _clean_text(item.get("collected_at"), collected_at),
                    "url": url,
                    "source": source_label,
                    "sourceDomain": domain,
                    "score": float(item.get("score", 0.0) or 0.0),
                    "verificationOwner": "dotori_com",
                    "verificationConfidence": confidence,
                    "tradeSignalAllowed": trade_signal_allowed,
                    "verificationPolicy": "dotori_com verifies tori1/tori2 research before candidate use",
                }
            )
            seen.add(key)
            if len(rows) >= limit:
                return rows
    return rows


def _merge_news_rows(primary: list[dict], supplemental: list[dict], limit: int = 40) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for item in [*supplemental, *primary]:
        if not isinstance(item, dict):
            continue
        title = _clean_text(item.get("title"), "")
        key = _clean_text(item.get("url"), "") or title
        if not title or key in seen:
            continue
        rows.append(item)
        seen.add(key)
        if len(rows) >= limit:
            break
    return rows


def _dotori_research_report(research_rows: list[dict]) -> dict | None:
    if not research_rows:
        return None
    lines = []
    for row in research_rows[:10]:
        domain = _clean_text(row.get("sourceDomain"), "")
        title = _clean_text(row.get("title"), "")
        summary = _clean_text(row.get("summary"), "")
        line = title
        if domain:
            line += f" | {domain}"
        if summary:
            line += f" | {summary[:90]}"
        lines.append(line)
    if not lines:
        return None
    return {
        "title": "도토리컴 자동수집 자료",
        "kind": "dotori-com-research",
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "summary": "도토리컴이 자동으로 모은 뉴스와 시장 자료를 웹 리포트 항목에 반영합니다.",
        "sections": [
            {
                "heading": "자동 반영된 수집 자료",
                "items": lines,
            }
        ],
    }


def _merge_research_into_morning_note(reports: list[dict], research_rows: list[dict]) -> list[dict]:
    report = _dotori_research_report(research_rows)
    if report is None:
        return reports
    return [report, *reports]


def _turso_url() -> str:
    raw = _windows_user_env("TURSO_DATABASE_URL", "TORI_TURSO_DATABASE_URL")
    if not raw:
        for name in ("tori_config.yaml", "tori1_config.yaml", "tori2_config.yaml", "tori3_config.yaml"):
            path = BASE_DIR / "config" / name
            if not path.exists():
                continue
            for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.strip().startswith("turso_database_url:"):
                    raw = line.split(":", 1)[1].strip().strip("'\"")
                    break
            if raw:
                break
    raw = raw.strip().rstrip("/")
    if raw.startswith("libsql://"):
        raw = "https://" + raw[len("libsql://"):]
    return raw


def _turso_token() -> str:
    return _windows_user_env("TURSO_AUTH_TOKEN", "TORI_TURSO_AUTH_TOKEN")


def _turso_arg(value: object) -> dict:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": str(value)}
    return {"type": "text", "value": str(value)}


def _turso_execute(sql: str, args: list[object] | None = None, timeout: int = 12) -> object:
    database_url = _turso_url()
    auth_token = _turso_token()
    if not database_url or not auth_token:
        raise RuntimeError("Turso URL 또는 인증 토큰이 없습니다.")
    payload = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": [_turso_arg(arg) for arg in (args or [])]}},
            {"type": "close"},
        ]
    }
    request = Request(
        f"{database_url}/v2/pipeline",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
    result = json.loads(raw.decode("utf-8", errors="replace"))
    first = result.get("results", [{}])[0] if isinstance(result, dict) else {}
    if isinstance(first, dict) and first.get("type") == "error":
        raise RuntimeError(str(first.get("error", {}).get("message") or "turso_execute_error"))
    return result


def _report_payload_from_row(row: dict, saved_at: str) -> dict:
    symbol = _clean_text(row.get("symbol"), "")
    return {
        "ok": True,
        "symbol": symbol,
        "name": _clean_text(row.get("name"), symbol),
        "market": _clean_text(row.get("market"), ""),
        "currentPrice": _clean_text(row.get("currentPrice"), "-"),
        "source": _clean_text(row.get("source"), "도토리컴 보충자료"),
        "quotedAt": saved_at,
        "savedAt": saved_at,
        "scanner": {
            "title": _clean_text(row.get("name"), symbol),
            "summary": _clean_text(row.get("summary"), ""),
            "sentiment": _clean_text(row.get("sentiment"), ""),
            "risk": _clean_text(row.get("risk"), ""),
        },
        "watchlist": {
            "symbol": symbol,
            "name": _clean_text(row.get("name"), symbol),
            "market": _clean_text(row.get("market"), ""),
            "currentPrice": _clean_text(row.get("currentPrice"), "-"),
            "signal": _clean_text(row.get("signal"), "관심"),
            "movingAverage": _clean_text(row.get("risk"), ""),
            "memo": _clean_text(row.get("summary"), ""),
        },
        "analysis": {
            "summary": _clean_text(row.get("summary"), ""),
            "predRange": _clean_text(row.get("predRange"), ""),
        },
        "sources": ["도토리컴 공개 스냅샷"],
    }


def _build_dotori_com_reports(scanner: list[dict], saved_at: str) -> dict:
    reports = {}
    autonomy_policy = _dotori_com_autonomy_policy()
    for row in scanner:
        if not isinstance(row, dict):
            continue
        symbol = _clean_text(row.get("symbol"), "").upper()
        if not symbol:
            continue
        report = _report_payload_from_row(row, saved_at)
        report["autonomyPolicy"] = autonomy_policy
        reports[symbol] = report
    return {
        "updatedAt": saved_at,
        "autonomyPolicy": autonomy_policy,
        "count": len(reports),
        "reports": reports,
    }


def _upload_reports_to_turso(report_payload: dict) -> dict:
    reports = report_payload.get("reports", {}) if isinstance(report_payload, dict) else {}
    if not isinstance(reports, dict) or not reports:
        return {"ok": False, "skipped": True, "reason": "업로드할 리포트가 없습니다."}
    if not _turso_url() or not _turso_token():
        return {"ok": False, "skipped": True, "reason": "Turso 환경변수가 없어 로컬 JSON만 갱신했습니다."}
    try:
        _turso_execute("CREATE TABLE IF NOT EXISTS stock_reports (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at TEXT NOT NULL)")
        _turso_execute("CREATE TABLE IF NOT EXISTS stock_report_history (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL)")
        saved = 0
        saved_at = _clean_text(report_payload.get("updatedAt"), datetime.now(KST).isoformat(timespec="seconds"))
        for symbol, payload in reports.items():
            text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            _turso_execute(
                "INSERT INTO stock_reports (symbol, payload, saved_at) VALUES (?, ?, ?) "
                "ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at",
                [symbol, text, saved_at],
            )
            if saved < 120:
                _turso_execute(
                    "INSERT INTO stock_report_history (symbol, payload, saved_at) VALUES (?, ?, ?)",
                    [symbol, text, saved_at],
                )
            saved += 1
        return {"ok": True, "skipped": False, "saved": saved, "table": "stock_reports"}
    except (URLError, TimeoutError, RuntimeError, OSError) as exc:
        return {"ok": False, "skipped": False, "reason": str(exc)[:180]}


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
    scanner_limit_each = 30
    domestic = _scanner_rows_from_unified_state("국내", scanner_limit_each)
    us = _scanner_rows_from_unified_state("미국", scanner_limit_each)
    scanner_source = "도토리 PC 통합 추천자료"
    if not domestic:
        domestic = _top_items(items, "국내", scanner_limit_each)
        scanner_source = "도토리컴 저장자료 + Toss/Naver/Yahoo 보충"
    if not us:
        us = _top_items(items, "미국", scanner_limit_each)
        scanner_source = "도토리컴 저장자료 + Toss/Naver/Yahoo 보충"
    if len(domestic) < scanner_limit_each:
        domestic.extend(_supplement_from_investment("국내", {row["symbol"] for row in domestic}, len(domestic) + 1, scanner_limit_each - len(domestic)))
    if len(us) < scanner_limit_each:
        us.extend(_supplement_from_investment("미국", {row["symbol"] for row in us}, len(us) + 1, scanner_limit_each - len(us)))
    if len(domestic) < scanner_limit_each:
        domestic.extend(_supplement_from_public_quotes("국내", {row["symbol"] for row in domestic}, len(domestic) + 1, scanner_limit_each - len(domestic)))
    if len(us) < scanner_limit_each:
        us.extend(_supplement_from_public_quotes("미국", {row["symbol"] for row in us}, len(us) + 1, scanner_limit_each - len(us)))
    domestic = _dedupe_and_rank(domestic, scanner_limit_each)
    us = _dedupe_and_rank(us, scanner_limit_each)
    if len(domestic) < scanner_limit_each:
        domestic.extend(_supplement_from_public_quotes("국내", {row["symbol"] for row in domestic}, len(domestic) + 1, scanner_limit_each - len(domestic)))
        domestic = _dedupe_and_rank(domestic, scanner_limit_each)
    if len(us) < scanner_limit_each:
        us.extend(_supplement_from_public_quotes("미국", {row["symbol"] for row in us}, len(us) + 1, scanner_limit_each - len(us)))
        us = _dedupe_and_rank(us, scanner_limit_each)
    scanner = domestic + us
    autonomy_policy = _dotori_com_autonomy_policy()
    previous["updatedAt"] = datetime.now(KST).isoformat(timespec="seconds")
    previous["autonomyPolicy"] = autonomy_policy
    previous["scannerUpdatedAt"] = predictions.get("saved_at", previous["updatedAt"])
    previous["scanner"] = scanner
    spike_rows = _spike_rows(items, 50)
    spike_symbols = {str(row.get("symbol", "")).strip().upper() for row in spike_rows if isinstance(row, dict)}
    spike_rows.extend(_supplement_spike_rows(items, "국내", spike_symbols, 20))
    spike_rows.extend(_supplement_spike_rows(items, "미국", spike_symbols, 20))
    if spike_rows:
        previous["spikes"] = spike_rows
    research_rows = _dotori_research_news_list()
    research_report = _dotori_research_report(research_rows)
    previous["movingAverages"] = _moving_average_rows(items, previous_ohlc=_previous_ohlc_by_symbol(previous))
    previous["morningNote"] = _merge_research_into_morning_note(_public_analysis_reports(), research_rows)
    previous["sectorOverview"] = _public_sector_overview_reports(items)
    previous["deepAnalysis"] = ([research_report] if research_report else []) + _public_deep_analysis_reports(items)
    previous["newsList"] = _merge_news_rows(_public_news_list(), research_rows)
    growth_rows = _public_growth_discovery_rows()
    growth_symbols = {str(row.get("symbol", "")).strip().upper() for row in growth_rows if isinstance(row, dict)}
    growth_rows.extend(_public_us_growth_discovery_rows(items, len(growth_rows) + 1, 30, growth_symbols))
    previous["growthDiscovery"] = growth_rows
    previous["dotoriComResearch"] = research_rows
    previous["analysis"] = previous["morningNote"]
    previous["scannerGroups"] = {
        "domestic": domestic,
        "us": us,
    }
    previous["webDataStatus"] = {
        "updatedAt": previous["updatedAt"],
        "source": scanner_source,
        "scannerTargetEach": scanner_limit_each,
        "domesticCount": len(domestic),
        "usCount": len(us),
        "dotoriComSupplemented": True,
        "integratedScanner": scanner_source == "도토리 PC 통합 추천자료",
        "dotoriComResearchCount": len(research_rows),
        "dotoriComResearchUpdatedAt": research_rows[0].get("asOf", "") if research_rows else "",
        "growthDiscoveryCount": len(previous.get("growthDiscovery", [])),
        "autonomyMode": autonomy_policy.get("mode", "research_and_trading"),
        "tradeExecutionAllowed": bool(autonomy_policy.get("trade_execution_allowed", False)),
        "executionOwner": autonomy_policy.get("execution_owner", "pc_autotrade_engine"),
        "note": "웹 자료가 부족할 때 도토리컴이 관심종목과 기본 감시종목을 보충해 공개 스냅샷으로 보냅니다.",
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


def build_symbol_directory(snapshot: dict | None = None) -> dict:
    predictions = json.loads(PREDICTIONS_PATH.read_text(encoding="utf-8", errors="replace"))
    items = predictions.get("items", []) if isinstance(predictions, dict) else []
    directory: dict[str, dict] = {}
    if not isinstance(items, list):
        items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        symbol, resolved_name, resolved_market = _normalize_symbol_fields(item.get("symbol"), item.get("display_name"), item.get("market"))
        symbol = _clean_text(symbol, "").upper()
        if not symbol:
            continue
        display_name = _clean_text(resolved_name, symbol)
        clean_name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", display_name).strip() or display_name
        current_price = _clean_text(item.get("current_price_text"), "")
        pred_low = _clean_text(item.get("pred_low_text"))
        pred_high = _clean_text(item.get("pred_high_text"))
        if resolved_market == "국내" and "$" in current_price:
            quote_row = _fetch_public_quote(symbol, "국내")
            price = _safe_float(quote_row.get("price"), 0.0)
            if price > 0:
                current_price = _format_price(price, "국내")
                pred_low = "-"
                pred_high = "-"
        directory[symbol] = {
            "symbol": symbol,
            "name": clean_name,
            "market": _clean_text(resolved_market),
            "currentPrice": current_price,
            "signal": _public_prediction_signal(item),
            "movingAverage": _clean_text(item.get("analysis_hint"), ""),
            "predRange": f"{pred_low} ~ {pred_high}",
            "memo": _clean_text(item.get("analysis_hint"), "도토리웹 저장소 기준 종목 정보"),
        }
    if isinstance(snapshot, dict):
        for row in snapshot.get("scanner", []) or []:
            if not isinstance(row, dict):
                continue
            symbol = _clean_text(row.get("symbol"), "").upper()
            if not symbol or symbol in directory:
                continue
            name = _clean_text(row.get("name"), symbol)
            clean_name = re.sub(rf"\s*\(?{re.escape(symbol)}\)?\s*$", "", name).strip() or name
            directory[symbol] = {
                "symbol": symbol,
                "name": clean_name,
                "market": _clean_text(row.get("market")),
                "currentPrice": _clean_text(row.get("currentPrice"), ""),
                "signal": _clean_text(row.get("signal"), "관심"),
                "movingAverage": _clean_text(row.get("risk"), ""),
                "predRange": _clean_text(row.get("predRange"), ""),
                "memo": _clean_text(row.get("summary"), "도토리컴 보충자료"),
            }
    return {
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "symbols": directory,
    }


def main() -> None:
    _load_dotenv_once()
    PUBLIC_SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = build_snapshot()
    report_payload = _build_dotori_com_reports(payload.get("scanner", []), payload.get("updatedAt", datetime.now(KST).isoformat(timespec="seconds")))
    upload_status = _upload_reports_to_turso(report_payload)
    payload.setdefault("webDataStatus", {})["tursoUpload"] = upload_status
    PUBLIC_SNAPSHOT_PATH.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    DOTORI_COM_REPORT_PATH.write_text(
        json.dumps(report_payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    DOTORI_COM_PUBLIC_AUTONOMY_POLICY_PATH.write_text(
        json.dumps(_dotori_com_autonomy_policy(), ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    SYMBOL_DIRECTORY_PATH.write_text(
        json.dumps(build_symbol_directory(payload), ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    print(f"exported {PUBLIC_SNAPSHOT_PATH}")
    print(f"reports {report_payload.get('count', 0)} | turso {upload_status}")


if __name__ == "__main__":
    main()
