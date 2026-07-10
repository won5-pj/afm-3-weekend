# 🐶 멍스데이(Mongsday) 카페 사장님 대시보드

청라 반려견 생일파티 카페 **멍스데이**의 사장님 전용 관리자 대시보드.
매출·인기메뉴·재고·예약 데이터를 한눈에 보고, AI가 매일 "오늘의 카페 브리핑"을 생성합니다.

## 구성

| 영역 | 내용 |
|------|------|
| **Part 1 · Auth** | 관리자 로그인 (`admin` / `123456`), 사장님만 접근 |
| **Part 2 · 데이터** | Notion(할일/발주) · Supabase(매출·메뉴·재고·예약·펫) · OpenWeatherMap(날씨·손님예측) |
| **Part 3 · AI** | Gemini(`gemini-2.5-flash`)로 데이터를 종합한 오늘의 브리핑 자동 생성 |

## 구조

```
dashboard/
├─ index.html          # React + Tailwind (CDN) 대시보드 UI
├─ api/
│  ├─ _lib.js          # Supabase 집계(pg) + 날씨 공용 로직
│  ├─ data.js          # GET  매출/메뉴/재고/예약/생일 집계
│  ├─ weather.js       # GET  청라 날씨 + 손님 수 예측
│  ├─ todos.js         # GET/POST 할일(Notion 연동, Supabase 미러)
│  └─ briefing.js      # GET  Gemini 오늘의 카페 브리핑
└─ package.json        # pg 의존성
```

## 데이터 소스

- **Supabase** `ifrydgoofjalfufcpxka` — `cafe_sales`(거래 2,500여 건), `cafe_menu`, `cafe_inventory`, `cafe_reservations`, `cafe_pets`, `cafe_todos`
- **Notion DB** — [🐶 멍스데이 카페 · 할일/발주](https://app.notion.com/p/a96db721227c484fbbdf02ca4e7dc96f). 대시보드는 이를 Supabase에 미러링해 읽기/토글하며, `NOTION_TOKEN`+`NOTION_DB_ID` 설정 시 Notion에서 실시간 조회.
- 매출 지표는 데이터의 최신 날짜(`max(sale_date)`)를 "어제"로 기준 잡아 항상 최근 실데이터를 보여줌.

## 환경변수 (Vercel)

| 변수 | 용도 |
|------|------|
| `DATABASE_URL` | Supabase Postgres 커넥션(pooler 6543) |
| `WEATHER_API_KEY` | OpenWeatherMap |
| `GEMINI_API_KEY` | Google Gemini |
| `AUTH_SECRET` | 로그인 토큰(HMAC) 서명 키. `ADMIN_ID`/`ADMIN_PW`로 관리자 자격 변경 가능(기본 admin/123456) |
| `NOTION_TOKEN` | (선택) Notion 인테그레이션 토큰 — 설정 시 할일을 Notion에서 실시간 읽기/토글 |
| `NOTION_DB_ID` / `NOTION_DATA_SOURCE_ID` | Notion 할일 DB/데이터소스 ID (이미 설정됨) |

### 인증 흐름
`POST /api/login`(admin/123456) → HMAC 서명 토큰 발급 → 프론트가 `Authorization: Bearer`로 모든 `/api/*` 호출. 토큰 없거나 만료(12h) 시 데이터 엔드포인트는 401 → 자동 로그아웃. 즉 **API 자체가 서버사이드에서 보호**되어 사장님만 접근 가능.

## 로컬 실행

```bash
npm install
vercel dev          # .env 의 키를 사용해 /api 함수까지 로컬 구동
```

## 배포

```bash
vercel --prod
```
