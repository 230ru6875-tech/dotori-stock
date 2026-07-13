from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


WEB_DIR = Path(__file__).resolve().parent
ROOT = WEB_DIR.parent
SNAPSHOT_PATH = WEB_DIR / "data" / "public-snapshot.json"
SCOUT_PATH = ROOT / "learning_data" / "growth_value_affordable_scout" / "latest.json"


def _load(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _float(value: Any) -> float | None:
    try:
        return float(str(value).replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _verdict(score: float) -> str:
    if score >= 7.0:
        return "우선 관찰"
    if score >= 6.0:
        return "검증 후보"
    return "보류"


def _row(item: dict[str, Any], rank: int) -> dict[str, Any]:
    score = _float(item.get("growth_value_score")) or 0.0
    price = _float(item.get("price"))
    per = _float(item.get("per"))
    roe = _float(item.get("roe"))
    market_cap = _float(item.get("market_cap_eok"))
    foreign = _float(item.get("foreign_pct"))
    change = str(item.get("change_rate_text") or "-").strip()
    notes = [
        "로컬 성장·가치 프록시 점수 기반",
        f"PER {per:.2f}" if per is not None else "PER 확인 필요",
        f"ROE {roe:.2f}%" if roe is not None else "ROE 확인 필요",
        f"시가총액 {market_cap:,.0f}억원" if market_cap is not None else "시가총액 확인 필요",
        f"외국인 {foreign:.2f}%" if foreign is not None else "외국인 비중 확인 필요",
    ]
    return {
        "rank": rank,
        "market": "국내",
        "marketCode": item.get("market"),
        "symbol": str(item.get("symbol") or "").strip(),
        "name": str(item.get("name") or item.get("symbol") or "").strip(),
        "score": round(score * 10.0, 2),
        "growthValueScore": round(score, 2),
        "verdict": _verdict(score),
        "theme": "성장+가치 프록시",
        "currentPrice": price,
        "currentPriceText": f"{price:,.0f}원" if price is not None else "-",
        "return5d": change,
        "return20d": "-",
        "volumeRatio": f"거래량 {item.get('volume', '-')}" if item.get("volume") not in (None, "") else "-",
        "notes": notes,
        "reason": " / ".join(notes),
        "valuationProxy": {
            "source": "naver_market_sum",
            "method": "PER·ROE·시가총액·외국인 비중·성장/가치 키워드 프록시",
            "per": per,
            "roe": roe,
            "marketCapEok": market_cap,
            "foreignPct": foreign,
        },
        "sourceUpdatedAt": item.get("generated_at"),
        "virtualOnly": True,
    }


def main() -> dict[str, Any]:
    snapshot = _load(SNAPSHOT_PATH, {})
    scout = _load(SCOUT_PATH, {})
    if not isinstance(snapshot, dict):
        raise RuntimeError("public snapshot is not an object")
    candidates = scout.get("candidates", []) if isinstance(scout, dict) else []
    candidates = [item for item in candidates if isinstance(item, dict) and item.get("symbol")]
    candidates.sort(key=lambda item: _float(item.get("growth_value_score")) or 0.0, reverse=True)
    rows = [_row(item, index) for index, item in enumerate(candidates, start=1)]
    snapshot["growthDiscovery"] = rows
    snapshot["growthDiscoveryMeta"] = {
        "source": "local_value_proxy",
        "sourceFile": str(SCOUT_PATH),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scoutGeneratedAt": scout.get("generated_at") if isinstance(scout, dict) else None,
        "method": scout.get("method", {}) if isinstance(scout, dict) else {},
        "fairValueAvailable": False,
        "note": "InvestingPro 공정가치 공식이 아닌 로컬 후보 선별 프록시입니다. 실제 주문 전 차트·호가·실적 검증이 필요합니다.",
    }
    web_status = snapshot.setdefault("webDataStatus", {})
    if isinstance(web_status, dict):
        web_status["growthDiscoveryCount"] = len(rows)
        web_status["growthDiscoverySource"] = "local_value_proxy"
        web_status["growthDiscoveryUpdatedAt"] = snapshot["growthDiscoveryMeta"]["generatedAt"]
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "count": len(rows), "snapshot": str(SNAPSHOT_PATH)}


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=False))
