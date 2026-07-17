"""멀티심볼 캔들 마감 폴링 러너 (M1 골격).

APScheduler 로 각 타임프레임의 캔들 마감 경계 직후에 fetch → 최신 캔들 로그.
M2 부터 이 자리에 지표 계산·신호 판정이 들어간다.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from adapters.bitget import BitgetError, get_candles
from config import CONFIG

log = logging.getLogger("rulekeeper")

# 각 타임프레임의 "캔들 마감" 시각(UTC)에 맞춘 cron 스펙
_CLOSE_CRON = {
    "15m": {"minute": "0,15,30,45"},
    "1H": {"minute": "0"},
    "4H": {"hour": "0,4,8,12,16,20", "minute": "0"},
}


def poll_timeframe(timeframe: str) -> None:
    """한 타임프레임에 대해 전 심볼의 최신 캔들을 조회·로그."""
    now = datetime.now(timezone.utc)
    for symbol in CONFIG.symbols:
        try:
            candles = get_candles(symbol, timeframe, limit=2)
        except BitgetError as exc:
            log.error("[%s %s] 조회 실패: %s", symbol, timeframe, exc)
            continue
        if not candles:
            log.warning("[%s %s] 캔들 없음", symbol, timeframe)
            continue

        latest = candles[-1]
        forming = ""
        if len(candles) >= 2:
            interval = latest.ts - candles[-2].ts
            if now < latest.ts + interval:
                forming = " (형성 중)"
        log.info("[%-11s %-3s] %s  open=%s UTC%s",
                 symbol, timeframe, latest,
                 latest.ts.strftime("%m-%d %H:%M"), forming)


def poll_all() -> None:
    """전 타임프레임 즉시 1회 조회 (기동 직후 피드백 / 스모크 테스트)."""
    for timeframe in CONFIG.timeframes:
        poll_timeframe(timeframe)


def build_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone="UTC")
    second = CONFIG.close_fetch_delay_s
    for timeframe, cron in _CLOSE_CRON.items():
        scheduler.add_job(
            poll_timeframe,
            CronTrigger(timezone="UTC", second=second, **cron),
            args=[timeframe],
            id=f"poll-{timeframe}",
            max_instances=1,
            misfire_grace_time=60,
        )
    return scheduler
