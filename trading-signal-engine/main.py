"""RuleKeeper 진입점 (M1 골격).

  python main.py --once   # 캔들 1회 조회 후 종료 (스모크 테스트)
  python main.py          # 캔들 마감 스케줄러 상시 구동 (Ctrl+C 종료)
"""
from __future__ import annotations

import argparse
import logging
import sys

from config import CONFIG
from runner.multi_symbol import build_scheduler, poll_all

log = logging.getLogger("rulekeeper")


def _setup_logging() -> None:
    # Windows 콘솔에서 한글/기호가 깨지지 않도록 stdout/stderr 을 UTF-8 로 강제
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8")
            except (ValueError, OSError):
                pass
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="RuleKeeper 시그널 엔진 (M1)")
    parser.add_argument("--once", action="store_true",
                        help="캔들을 한 번만 조회해 출력하고 종료")
    args = parser.parse_args()

    _setup_logging()
    log.info("RuleKeeper M1 — symbols=%s · TFs=%s",
             ",".join(CONFIG.symbols), ",".join(CONFIG.timeframes))

    poll_all()  # 기동 즉시 1회 조회

    if args.once:
        return

    log.info("캔들 마감 스케줄러 시작 (종료: Ctrl+C)")
    scheduler = build_scheduler()
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("종료합니다.")


if __name__ == "__main__":
    main()
