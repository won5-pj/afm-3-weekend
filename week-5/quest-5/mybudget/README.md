# 나의 가계부 (mybudget)

수입/지출 내역을 등록·조회하고 카테고리별 합계를 보여주는 가계부 앱.
모든 데이터는 Supabase Postgres 에 저장됩니다.

## 아키텍처

```
[사용자 입력 (날짜, 금액, 카테고리, 메모)]
   → [Server (server.js, Node 내장 http)]
   → DB 에 수입/지출 저장 (budget_entries 테이블)
   → 내역 조회 & 카테고리별 합계 계산 (SQL GROUP BY)
   → 결과 응답 (JSON) → 화면 렌더 (index.html)
```

## 실행 방법

```bash
npm install
npm start
# → http://localhost:3000
```

- 서버 최초 실행 시 `budget_entries` 테이블을 자동 생성하고, 비어 있으면 예시 내역 12건을 시드합니다.
- DB 접속 문자열은 코드에 기본값이 들어 있으며, `DATABASE_URL` 환경변수로 덮어쓸 수 있습니다.
- Supabase 는 pooler(transaction mode, 6543 포트)를 쓰므로 드라이버에서 `prepare: false` 가 필수입니다.

## 주요 기능

- **내역 등록/조회**: 날짜·금액·카테고리·메모로 수입/지출 등록, 월별 목록 조회
- **카테고리별 합계**: SQL `GROUP BY` 로 카테고리별 지출/수입 집계
- **월별 지출 추이**: 최근 6개월 지출을 막대 차트로 표시 (선택 월 강조)
- **예산 대비 사용량**: 전체·카테고리별 월 예산을 설정하고 사용률을 진행바로 표시
  (80% 이상 주의(노랑)/100% 초과 경고(빨강)), 예산은 화면에서 바로 수정·저장

## DB 테이블

### budget_entries (수입/지출 내역)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | bigint (identity) | PK |
| `type` | text | `income`(수입) / `expense`(지출) |
| `category` | text | 식비, 교통, 주거, 구독료, 경조사 … |
| `amount` | numeric(14,2) | 금액(원) |
| `memo` | text | 메모(선택) |
| `date` | date | 사용/수입 날짜 |
| `created_at` | timestamptz | 등록 시각 |

### budgets (월 예산 — 매월 반복 적용)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `category` | text (PK) | 카테고리명, `__total__` 이면 전체 예산 |
| `amount` | numeric(14,2) | 월 예산(원) |

전체 DDL 은 [`schema.sql`](./schema.sql) 참고.

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/transactions?month=YYYY-MM&type=income\|expense` | 내역 목록 조회(필터 선택) |
| `POST` | `/api/transactions` | 내역 등록 `{ type, category, amount, memo, date }` |
| `DELETE` | `/api/transactions/:id` | 내역 삭제 |
| `GET` | `/api/summary?month=YYYY-MM` | 카테고리별 합계(SQL `GROUP BY`) + 총 수입/지출/잔액 |
| `GET` | `/api/monthly?months=6` | 월별 수입/지출 추이 (최근 N개월) |
| `GET` | `/api/budget` | 예산 조회 `{ total, categories }` |
| `PUT` | `/api/budget` | 예산 설정 `{ category, amount }` (amount 0 이면 삭제) |
| `GET` | `/api/categories` | UI 용 카테고리 목록 |

### 카테고리별 합계 (GROUP BY)

```sql
select type, category, sum(amount) as total, count(*) as count
from budget_entries
group by type, category
order by total desc;
```
