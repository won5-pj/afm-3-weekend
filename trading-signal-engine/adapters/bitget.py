"""비트겟 mix v2 캔들 어댑터 — 공개 REST, API 키 불필요.

BTCUSDT / ETHUSDT / NDX100USDT 모두 동일 엔드포인트(productType=usdt-futures)로
심볼만 바꿔 조회한다. 응답 캔들 한 행:
    [ts(ms), open, high, low, close, baseVolume, quoteVolume]  (오래된→최신 순)

v2에서 MT5 등 다른 거래소를 붙일 때도 이 모듈이 반환하는 Candle 형태만 맞추면 된다.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import requests

BASE_URL = "https://api.bitget.com"
CANDLES_PATH = "/api/v2/mix/market/candles"
PRODUCT_TYPE = "usdt-futures"

# 내부 TF 표기 → 비트겟 granularity 표기
GRANULARITY = {"15m": "15m", "1H": "1H", "4H": "4H"}


class BitgetError(RuntimeError):
    """비트겟 API 오류(네트워크 또는 비정상 응답 코드)."""


@dataclass(frozen=True)
class Candle:
    ts: datetime          # 캔들 시작 시각 (UTC)
    open: float
    high: float
    low: float
    close: float
    volume: float         # base volume (예: BTC 수량 / 계약 수)
    quote_volume: float   # quote volume (USDT)

    def __str__(self) -> str:
        return (
            f"O={self.open:.2f} H={self.high:.2f} "
            f"L={self.low:.2f} C={self.close:.2f} vol={self.volume:.3f}"
        )


def get_candles(symbol: str, timeframe: str, limit: int = 100,
                timeout: float = 10.0) -> list[Candle]:
    """`symbol`/`timeframe` 캔들을 오래된→최신 순 리스트로 반환.

    주의: 마지막 캔들은 '형성 중(미마감)'일 수 있다. 신호 로직(M3~)은 마감된
    캔들만 써야 하므로 타임스탬프로 마감 여부를 판정할 것.
    """
    granularity = GRANULARITY.get(timeframe, timeframe)
    params = {
        "symbol": symbol,
        "granularity": granularity,
        "productType": PRODUCT_TYPE,
        "limit": str(limit),
    }
    try:
        resp = requests.get(BASE_URL + CANDLES_PATH, params=params, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise BitgetError(f"네트워크 오류 ({symbol} {timeframe}): {exc}") from exc

    payload = resp.json()
    if payload.get("code") != "00000":
        raise BitgetError(
            f"API 오류 ({symbol} {timeframe}) "
            f"{payload.get('code')}: {payload.get('msg')}"
        )

    candles = [
        Candle(
            ts=datetime.fromtimestamp(int(row[0]) / 1000, tz=timezone.utc),
            open=float(row[1]), high=float(row[2]), low=float(row[3]),
            close=float(row[4]), volume=float(row[5]), quote_volume=float(row[6]),
        )
        for row in (payload.get("data") or [])
    ]
    candles.sort(key=lambda c: c.ts)
    return candles
