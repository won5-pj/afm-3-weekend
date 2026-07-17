# DEV.md — RuleKeeper 개발 가이드

> 재량매매를 명시적 신호 + 매매일지로 바꿔 준수율·성과를 숫자로 확인하는 1인용 규칙 기반 트레이딩 시그널 엔진.
> **Architecture: 옵션 A → B 경로** (v1 로컬 Windows 상시구동으로 BTC·ETH 검증 → 안정화 후 동일 코드를 소형 VPS로 승격)

---

## Requirements (MISSION.md에서 추출)

- [ ] 4층 규칙 신호 생성 — ①방향(HH/HL + EMA정배열) ②횡보게이트(ADX>25) ③S/R 존 자동탐지(스윙피벗+방어횟수 가중) ④15m 트리거(존 위 종가마감 + 거래량 소프트 확증)
- [ ] 손절 = 위치(구조 기준) + 크기(계좌 고정 1%) 분리, 포지션 크기 = (잔고 × 1%) ÷ 손절거리
- [ ] 익절 = +2R 부분/전량 + 남은 물량 15m 스윙 트레일
- [ ] 멀티심볼 상관 리스크 상한 — `{BTC, ETH}` 묶음 합산 상한 + NDX100 별도 그룹 + 하루 최대 진입/동시 포지션 상한
- [ ] 텔레그램 진입근거 카드 전송 + 인라인 버튼 `[진입] [건너뜀] [관망]`
- [ ] 결과 R 수동 입력 (A안 — 청산가/R을 텔레그램에서 입력)
- [ ] 자동 매매일지 로깅 (신호 조건 전부 + 실행여부 + 이유 + 결과 R)
- [ ] 리포트 — 신호 준수율 · 셋업 승률 · 평균 R · 조건별 성과(ADX구간·방어횟수·거래량 강/약)
- [ ] 심리 가드레일 — 일일 손실 한도 경고 + 리벤지/과매매 경고
- [ ] 검증 순서 — BTC·ETH(24/7 클린)로 엔진 검증 → NDX100(`NDX100USDT`) 세션·갭 처리와 함께 추가

## Non-goals (v1 안티스코프 → v2 로드맵)

- 자동 체결(봇 직접 주문) — v1 체결은 사용자가 직접
- 비트겟 체결 자동 대조(B안) — v1.5
- 백테스트 엔진 — v2
- HFM/MT5 어댑터 — v2 (나스닥 신호 자체는 v1에서 `NDX100USDT`로 처리)
- 비트겟 500x `NAS100` CFD 라인 — 사용 안 함(별도 상품, mix API 미지원)
- 볼륨 프로파일/OI/펀딩비/CVD 등 크립토 전용 무거운 신호 — v2
- 수동 레벨 오버라이드 — v2 옵션
- 복기·패턴분석 멀티에이전트 — v2 (v1은 그 재료가 될 일지 데이터 축적까지)
- 다중 사용자 / 신호 공유·판매 — 범위 밖(1인용)

## Style (엔진·출력 스타일 가이드)

- **모듈 경계 엄수** — 플랫폼 독립 `engine`(규칙·지표·리스크) / 거래소 `adapters`(비트겟) / `runner`(멀티심볼 폴링) / `notify`(텔레그램) / `storage`(Supabase) / `report` / `guardrails` 를 분리. v2에서 MT5 어댑터를 끼울 수 있게 어댑터 인터페이스를 얇게.
- **파라미터는 코드에 박지 말고 `config`/`.env`로** — EMA 기간, ADX 임계, RISK_PCT, 거래량 배수(1.3×) 등 "나중에 다이얼로 조절"할 값 전부.
- **텔레그램 근거 카드 포맷** (MISSION 예시 준수):
  ```
  🟢 롱 신호 · BTCUSDT
  진입존: 63,200~63,450 (지지, 4회 방어)
  추세: 4H 상승 (HH/HL ✓, EMA정배열 ✓, ADX 28)
  트리거: 15m 종가 존 위 마감 ✓ (반전 캔들, 거래량 1.5× → 강)
  손절: 62,900 (-1R / 계좌 1%)   목표: +2R → 64,400
  [✅ 진입함]  [❌ 건너뜀]  [⏭ 관망]
  ```
- **로그** — 신호/무신호 판정 근거를 구조화 로그로 남겨 M2~M3 디버깅과 사후 검증에 활용.

## Key Concepts (용어)

- **R** — 리스크 단위. 1R = 계좌의 1%(손절까지 거리). 결과 R = 실현손익 ÷ 리스크.
- **신호 준수율** — 발생한 신호 중 규칙대로 실행(진입)한 비율. v1 핵심 지표.
- **정배열** — 상승 시 가격 > EMA50 > EMA200 (하락은 대칭). 방향 판정.
- **HH/HL 시장구조** — 연속 고점·저점이 높아짐(상승)/낮아짐(하락). 스윙 피벗으로 탐지.
- **ADX 게이트** — ADX>25만 진입 허용, 20~25 관망, <20 진입 금지. 횡보 차단 핵심 장치.
- **S/R 존 · 방어횟수** — 스윙 피벗 병합으로 만든 지지/저항 "존". 여러 번 지켜질수록(방어횟수↑) 신뢰↑.
- **거래량 라벨(소프트)** — 방어캔들 거래량 ≥ 20봉평균 × 1.3 → "강", 미만 → "약". 하드필터 아님, 기록만 하고 피드백 루프가 검증.
- **상관 그룹** — `{BTC, ETH}`(고상관 한 묶음, 합산 상한) / `NDX100`(별도 그룹). 상관 포지션의 숨은 리스크 증폭 차단.

## Open Questions (데이터 보며 확정)

- 준수율 정의에서 **관망(watched)** 을 준수로 볼지 이탈로 볼지 (초안: 진입만 준수로 집계)
- 계좌 잔고 갱신 주기 (v1은 `.env` 수동 갱신 → 이후 `/balance` 명령)
- +2R 도달 시 **부분 vs 전량** 익절 비율 (초안: 절반 익절 후 스윙 트레일)
- 로컬(A) → VPS(B) 승격 트리거 기준 (예: 표본 N회 + 안정 무중단 X일)
- NDX100 **주말 포지션 정책** 세부 (재개 갭 리스크 → 금요일 마감 전 청산 권고 여부)
- 상관 그룹 합산 상한 확정값 (초안: `{BTC,ETH}` 동시 진행 시 합산 ≤ 1.5%)

---

## 선택된 개발 구조 (확정)

| 결정 축 | 확정 값 | 근거 (한 줄) |
|---|---|---|
| 아키텍처 | **옵션 A → B 경로** | 로컬에서 BTC·ETH 빠르게 검증 → 같은 코드를 VPS로 승격. 상시 프로세스가 트레일링·상관 상시감시에 자연스러움 |
| 언어/런타임 | **Python** | pandas·지표(ADX/EMA/피벗)·python-telegram-bot 생태계가 이 도메인 표준. MISSION도 Python이 자연스럽다 명시 |
| 상시구동 | **로컬 Windows 상시 ON → VPS 승격** | 검증기 비용 0·디버깅 즉시, 안정화 후 24/7 무중단으로 승격(NDX 24/5 세션은 서버가 안 자야 의미) |
| DB | **Supabase (Postgres)** | 이미 보유. 로컬 단계부터 사용 → A→B 이전 시 마이그레이션 0, 향후 React 대시보드 재활용 |
| 실시간성 | **REST 폴링** | 신호가 "캔들 종가 마감" 기준 → 마감 시점만 확인하면 충분. 웹소켓은 v1 오버스펙 |
| 텔레그램 | **python-telegram-bot 폴링 모드** | 공개 URL 불필요(로컬 PC 뒤에서도 동작), 인라인 버튼 콜백 처리 깔끔 |
| 계좌 잔고(사이징) | **`.env` 고정값 시작** | 수동 주기 갱신 → 향후 텔레그램 `/balance` 명령으로 승격 |
| 리포트 | **텔레그램 `/report` 먼저** | 웹 대시보드는 향후(Supabase라 쉽게 추가) |
| 심리 가드레일 | **둘 다 v1 포함** | 일일 손실 한도 경고 + 리벤지/과매매 경고 |

> **A → B 승격 경로:** 엔진 코드는 A/B 동일. 로컬에서 검증 → `.env`와 실행 위치만 VPS로 옮기면 됨. DB가 처음부터 Supabase라 데이터 이전 불필요.

### 지표 라이브러리 주의
- Windows에서 **TA-Lib은 설치가 까다로움** → `pandas-ta` 또는 순수 파이썬 `ta` 라이브러리 사용.
- 캔들 수신은 비트겟 REST 직접 호출(`/api/v2/mix/market/candles`, `productType=usdt-futures`) 또는 `ccxt`(비트겟 지원, OHLCV 통일)로 단순화.

## 프로젝트 구조

```
trading-signal-engine/
├── MISSION.md
├── DEV.md
├── .env                      # 시크릿 (gitignore)
├── .env.example
├── requirements.txt
├── main.py                   # 진입점: 스케줄러 부팅, 멀티심볼 러너 기동
├── config.py                 # .env 로드, 심볼/파라미터 설정
├── engine/
│   ├── rules.py              # 플랫폼 독립 4층 규칙 엔진 (bias/gate/zone/trigger)
│   ├── indicators.py         # EMA / ADX / 스윙피벗 / S-R존 / 거래량
│   ├── risk.py               # 손절 위치·크기, 포지션 사이징, 멀티심볼 상관 상한
│   └── session.py            # NDX100 24/5 세션·갭 처리 (M7)
├── adapters/
│   └── bitget.py             # 비트겟 mix v2 캔들 fetch (공개 REST, 키 불필요)
├── runner/
│   └── multi_symbol.py       # 심볼별 캔들 마감 폴링·판정 루프 (APScheduler)
├── notify/
│   └── telegram_bot.py       # 근거카드 전송 + 인라인버튼 콜백 + /report /balance
├── storage/
│   └── db.py                 # Supabase 클라이언트, 일지 write/read
├── report/
│   └── metrics.py            # 준수율·승률·평균R·조건별 성과
└── guardrails/
    └── psychology.py         # 일일 손실 한도·리벤지/과매매 경고
```

> MISSION 구조 메모 준수 — 플랫폼 독립 "핵심 규칙 엔진"(`engine`) + 심볼별 러너(`runner`) + 거래소 어댑터(`adapters/bitget.py`). v2에서 `adapters/mt5.py`를 끼울 수 있는 형태.

---

## TODO List (M1~M8 마일스톤)

의존성 순서(데이터수신 → 지표 → 신호판정 → 텔레그램 → 일지 → 리포트)를 따르되 **BTC·ETH 먼저 검증 후 NDX100(M7) 추가**. 각 마일스톤 끝에 체크포인트(📌)와 커밋(세이브포인트).

### M1 · 데이터 수신 + 프로젝트 골격 🟢
- [ ] 🟢 프로젝트 초기화 — venv, `requirements.txt`, `.env`/`config.py`
- [ ] 🟢 비트겟 캔들 어댑터 — `adapters/bitget.py` (BTC/ETH의 15m·1H·4H OHLCV fetch, 공개 API 키 불필요)
- [ ] 🟢 캔들 마감 스케줄러 골격 — `runner/multi_symbol.py` (APScheduler로 TF 경계 직후 fetch)
- 📌 체크포인트: 터미널에서 3개 TF 최신 캔들이 주기적으로 찍힘
- 📌 `git commit` — "M1: 데이터 수신 골격"

### M2 · 지표 계산 🟡🔴 (최고 리스크 구간)
- [ ] 🟢 EMA50/200 정배열 판정 — `engine/indicators.py` (라이브러리)
- [ ] 🟢 ADX 계산 — `engine/indicators.py`
- [ ] 🔴 **스윙 피벗 탐지 + S/R 존 병합 + 방어횟수 가중** — ⚠️ **이 앱 최고 불확실도 파트.** 방법이 여럿 → 실제 캔들에 눈으로 그려 검증하며 튜닝. 실패 시 우회: 방어횟수 가중을 단순 근접 병합으로 축소 후 점진 고도화
- [ ] 🟡 컨플루언스 — 전일/전주 고저 + 라운드 넘버
- [ ] 🟢 거래량 20봉 평균 및 비율 계산
- 📌 체크포인트: 특정 심볼의 현재 추세/ADX/S-R 존/거래량비율이 숫자로 출력, S/R 존을 캔들 차트에 눈으로 대조해 타당
- 📌 `git commit` — "M2: 지표 계산 (S/R 존 시각검증 완료)"

### M3 · 신호 판정 (4층 결합) 🟡
- [ ] 🟡 4층 결합 — `engine/rules.py` (①방향 ②ADX 게이트 ③진입존 ④15m 트리거 + 거래량 라벨)
- [ ] 🟡 손절 위치(구조) + 크기(계좌 1%) + 포지션 사이징 — `engine/risk.py`
- [ ] 🟡 +2R 목표 + 스윙 트레일 로직
- [ ] 🟡 멀티심볼 상관 상한 — `{BTC,ETH}` 합산 + 하루 최대 진입 상한
- 📌 체크포인트: 콘솔에 "신호/무신호 + 근거(어느 층에서 걸렸는지)" 로그
- 📌 `git commit` — "M3: 4층 신호 판정 + 리스크"

### M4 · 텔레그램 알림 + 인터랙션 🟡
- [ ] 🟡 근거 카드 전송 — `notify/telegram_bot.py` (MISSION 카드 포맷)
- [ ] 🟡 인라인 버튼 `[진입][건너뜀][관망]` 콜백 처리
- [ ] 🟡 결과 R 수동 입력 플로우 (A안 — 청산가/R 입력)
- 📌 체크포인트: 실제 신호가 텔레그램으로 오고 버튼 탭 + R 입력이 기록됨
- 📌 `git commit` — "M4: 텔레그램 알림·인터랙션"

### M5 · 매매일지 로깅 🟢🟡
- [ ] 🟡 Supabase 스키마 적용 (아래 스키마 초안)
- [ ] 🟢 신호 발생 시 조건 전부 write — `storage/db.py`
- [ ] 🟡 사용자 탭/이유/결과 R을 같은 레코드에 update
- 📌 체크포인트: DB에 완결된 일지 레코드(조건 → 실행 → 결과)가 한 줄로 축적
- 📌 `git commit` — "M5: 매매일지 로깅"

### M6 · 리포트/대시보드 🟡
- [ ] 🟡 지표 계산 — `report/metrics.py` (준수율·승률·평균R·조건별)
- [ ] 🟡 텔레그램 `/report` 명령
- 📌 체크포인트: 축적 데이터로 준수율/승률/평균R/조건별 성과가 계산되어 텔레그램으로 옴
- 📌 `git commit` — "M6: /report 리포트"

### M7 · NDX100 세션·갭 처리 🔴 (BTC/ETH 검증 후 추가)
- [ ] 🔴 24/5 세션 인식 — `engine/session.py` (주말·미 공휴일 캔들 공백)
- [ ] 🔴 재개 갭 리스크 정책 + 주말 포지션 정책
- [ ] 🟡 NDX100 별도 상관 그룹 상한
- 📌 체크포인트: `NDX100USDT`가 세션 분기와 함께 안전하게 신호 생성(주말 공백에 오작동 없음)
- 📌 `git commit` — "M7: NDX100 세션·갭 처리"

### M8 · 심리 가드레일 + 안정화 → 옵션 B 승격 🟡
- [ ] 🟡 일일 손실 한도 경고 — `guardrails/psychology.py`
- [ ] 🟡 리벤지/과매매 경고
- [ ] 🟡 에러/재시도·재접속 견고화, 로깅 정리
- [ ] 🟡 소형 VPS 배포(동일 코드, `.env`만 이전) → 24/7 무중단
- 📌 체크포인트: 무중단 24/7 운영 가능, 가드레일 경고 정상 발동
- 📌 `git commit` — "M8: 가드레일 + VPS 승격"

---

## 외부 설정 필요 항목

### 필수 (Must Have)

| 항목 | 획득 방법 | 필요 시점 |
|---|---|---|
| 텔레그램 봇 토큰 | BotFather에서 `/newbot` | **v1 즉시** (핵심 출력 채널) |
| 텔레그램 chat_id | 봇에 아무 메시지 전송 후 `https://api.telegram.org/bot<TOKEN>/getUpdates`로 확인 | **v1 즉시** |
| Python 3.11+ + 라이브러리 | Windows 설치 · `pandas`, `pandas-ta`(또는 `ta`), `python-telegram-bot`, `httpx`/`requests`, `apscheduler`, `supabase`, (선택)`ccxt` | **v1 즉시** |
| 비트겟 캔들 API | **키 불필요** — 공개 REST `/api/v2/mix/market/candles`, `productType=usdt-futures` | v1, 키 없음 |
| Supabase 프로젝트 | supabase.com 프로젝트 생성 → Settings > API에서 URL·key | **v1 즉시** |

### 나중 (Later)

| 항목 | 획득 방법 | 필요 시점 |
|---|---|---|
| 비트겟 **읽기전용** API 키 | 비트겟 API 관리에서 read-only 발급 | **v1.5** (체결 자동 대조 B안) |
| VPS/클라우드 계정 | 소형 리눅스 VPS(월 약 $4~6) 또는 Fly.io/Railway | **옵션 B 승격 시** |
| 비트겟 거래 API 키 | (자동 체결) | v2 (안티스코프) |

### `.env` 변수 목록

```dotenv
TELEGRAM_BOT_TOKEN=            # BotFather 토큰
TELEGRAM_CHAT_ID=             # 본인 chat_id
SUPABASE_URL=                # Supabase 프로젝트 URL
SUPABASE_KEY=                # Supabase key (service_role 권장, 1인용 서버측)
RISK_PCT=0.01                # 1회 매매 계좌 리스크 (1%)
ACCOUNT_BALANCE=             # 포지션 사이징용 잔고 (v1 수동 갱신)
SYMBOLS=BTCUSDT,ETHUSDT,NDX100USDT
```

---

## Supabase 매매일지 스키마 초안

성공지표(신호 준수율 · 셋업 승률 · 평균 R · 조건별 성과)를 이 스키마만으로 계산 가능하도록 설계.

### 테이블 `signals` — 신호 1건 = 1행 (조건 → 실행 → 결과)

```sql
create table signals (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- 대상
  symbol            text not null,              -- BTCUSDT / ETHUSDT / NDX100USDT
  direction         text not null,              -- long / short
  correlation_group text not null,              -- 'BTC_ETH' / 'NDX'

  -- ① 방향(Bias)
  bias_tf           text,                       -- '4H' / '1H'
  trend_structure   text,                       -- 'HH_HL' / 'LH_LL'
  ema_aligned       boolean,                    -- 정배열 여부

  -- ② 횡보 게이트
  adx               numeric,                    -- ADX 원값 (구간 버킷은 리포트에서 파생)

  -- ③ 진입존(S/R)
  sr_type           text,                       -- 'support' / 'resistance'
  sr_zone_low       numeric,
  sr_zone_high      numeric,
  defense_count     int,                        -- 방어 횟수 (레벨 강도)
  confluence        jsonb,                      -- {"prev_day_hl":true,"round_number":true,...}

  -- ④ 트리거 + 거래량
  trigger_tf        text default '15m',
  trigger_confirmed boolean,                    -- 존 위(추세방향) 종가 마감
  reversal_candle   boolean,                    -- 아래꼬리 > 몸통 (가중)
  volume_ratio      numeric,                    -- 방어캔들 거래량 / 20봉평균
  volume_label      text,                       -- 'strong' (>=1.3x) / 'weak'
  signal_strength   text,                       -- 종합 라벨 'strong' / 'weak'

  -- 리스크 / 목표
  entry_price       numeric,                    -- 제안 진입가(존 기준)
  stop_price        numeric,                    -- 손절 위치
  stop_distance     numeric,                    -- 진입-손절 거리 (=1R 폭)
  target_price      numeric,                    -- +2R
  risk_pct          numeric,                    -- 계좌 리스크 % (기본 0.01)
  position_size     numeric,                    -- (잔고 × risk_pct) / stop_distance

  -- 실행 (사용자 탭)
  user_action       text,                       -- 'entered' / 'skipped' / 'watched'
  action_at         timestamptz,
  skip_reason       text,                       -- 건너뜀/관망 이유

  -- 결과 (A안 수동 입력)
  exit_price        numeric,
  result_r          numeric,                    -- 실현 R (익절 +2, 손절 -1, 수동청산 등)
  outcome           text,                       -- 'win' / 'loss' / 'breakeven' (result_r 파생)
  closed_at         timestamptz,
  notes             text
);
```

### 테이블 `guardrail_events` — 심리 가드레일 발동 기록

```sql
create table guardrail_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  type          text not null,      -- 'daily_loss_limit' / 'revenge' / 'overtrading'
  symbol        text,
  message       text,
  day_pnl_r     numeric,            -- 당일 누적 R
  trade_count   int,                -- 당일 매매 수
  acknowledged  boolean default false
);
```

### 성공지표 계산 매핑

| MISSION 지표 | 계산식 (signals 기준) |
|---|---|
| 신호 준수율 | `count(user_action='entered') / count(*)` (관망 처리는 Open Question) |
| 셋업 승률 | `count(result_r > 0) / count(user_action='entered' AND result_r is not null)` |
| 평균 R | `avg(result_r)` where `user_action='entered'` |
| 준수 vs 이탈 격차 | `avg(result_r)` 를 `user_action` 별로 비교 (건너뛴 신호가 +R이었나) |
| ADX 구간별 성과 | `adx` 버킷(20-25/25-30/30+) × 승률 |
| 방어횟수별 성과 | `defense_count` 버킷 × 승률 |
| 거래량 강/약별 성과 | `volume_label` × 승률 |
| 일일 손실 한도 위반 | `guardrail_events` where `type='daily_loss_limit'` count |
| 리벤지/과매매 경고 | `guardrail_events` where `type in ('revenge','overtrading')` count |

---

## 시작하기 (M1 첫 액션)

Windows PowerShell 기준:

```powershell
# 1. 프로젝트 폴더에서 가상환경
cd C:\afm-3-weekend\trading-signal-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. 의존성 설치
pip install pandas pandas-ta python-telegram-bot httpx apscheduler supabase

# 3. .env 작성 (.env.example 복사 후 값 채우기)
#    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SUPABASE_URL, SUPABASE_KEY,
#    RISK_PCT=0.01, ACCOUNT_BALANCE, SYMBOLS=BTCUSDT,ETHUSDT,NDX100USDT

# 4. M1 스모크 테스트: 비트겟 공개 캔들 fetch (키 불필요)
#    adapters/bitget.py 에 /api/v2/mix/market/candles 호출 구현 후,
#    BTCUSDT 15m 최근 캔들이 콘솔에 찍히는지 확인
```

**M1의 첫 코드 목표:** `adapters/bitget.py`에서 `productType=usdt-futures`로 `BTCUSDT` 15m 캔들을 받아 마지막 마감 캔들을 출력. 이게 되면 데이터 파이프의 시작점이 확보됩니다. (S/R 존 탐지 M2가 최고 난관이니, 데이터가 들어오는 즉시 실제 캔들로 눈 검증을 시작하세요.)
