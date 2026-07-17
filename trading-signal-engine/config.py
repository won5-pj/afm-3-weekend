"""RuleKeeper 설정 — .env 로드 + 심볼/타임프레임/파라미터.

"나중에 다이얼로 조절"할 값(심볼, 리스크%, 지표 임계 등)은 전부 여기 또는 .env 로.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _parse_symbols(raw: str) -> list[str]:
    return [s.strip().upper() for s in raw.split(",") if s.strip()]


@dataclass(frozen=True)
class Config:
    # M1: BTC·ETH 먼저. NDX100USDT 는 M7에서 세션·갭 처리와 함께 추가.
    symbols: list[str] = field(
        default_factory=lambda: _parse_symbols(os.getenv("SYMBOLS", "BTCUSDT,ETHUSDT"))
    )
    # 상위 TF(방향/게이트) + 트리거 TF
    timeframes: tuple[str, ...] = ("15m", "1H", "4H")
    risk_pct: float = field(default_factory=lambda: float(os.getenv("RISK_PCT", "0.01")))
    account_balance: float = field(
        default_factory=lambda: float(os.getenv("ACCOUNT_BALANCE") or 0)
    )
    # 캔들 마감 후 조회까지 대기(초) — 마감 직후 아직 미확정 캔들을 피하기 위한 여유
    close_fetch_delay_s: int = field(
        default_factory=lambda: int(os.getenv("CLOSE_FETCH_DELAY_S", "5"))
    )


CONFIG = Config()
