# 🛍️ MEN'S SHOP — 남성의류 쇼핑몰

상품 목록(공개) → 장바구니(로그인 필수) → **토스페이먼츠 실제 결제(테스트)** → 주문 상세 →
마이페이지 주문 내역까지 구현한 단일 HTML 쇼핑몰 앱입니다.

## 핵심 구조
```
[상품 목록 (DB, 공개)] → [장바구니 (로그인 필수)] → [결제(토스페이먼츠)]
   → [서버 승인(confirm)] → [주문 상세] → [마이페이지 주문 내역]
```

## 기능
- **상품 목록**: 로그인 없이 누구나 조회 (상품명·가격·이미지·설명, 상품 10종)
- **검색**: 상품명·설명 실시간 필터 (클라이언트, 대소문자 무시)
- **별점(1~5점)**: 평균·평가 수는 누구나 조회, 별점 남기기/수정은 로그인한 본인만 (사용자당 상품별 1개)
- **회원가입 / 로그인**: Supabase Auth (이메일+비밀번호)
- **장바구니**(로그인 필수)
  - 담기: 상품 카드의 `🛒 담기` (같은 상품은 수량 누적)
  - 조회: 헤더 `🛒 장바구니`
  - 수량변경: `+` / `−` (수량 1에서 `−` 비활성)
  - 삭제: 항목별 `🗑️ 삭제`, 전체 비우기
  - 합계: 총 수량·총 금액 자동 계산
- **결제(토스페이먼츠 결제위젯 · 테스트 모드)**
  - 장바구니 → `주문하기` → 결제위젯(결제수단+약관) → `결제하기`
  - **서버 승인**: 시크릿키는 클라이언트에 노출하지 않고 Vercel 서버리스 함수(`api/confirm-payment.js`)에서만 사용
  - **금액 위변조 방지**: 결제 전 `orders`에 저장한 신뢰 금액과 대조해 일치할 때만 승인 (멱등 처리)
  - 승인 성공 시 주문 `DONE`+`paid_at` 기록 및 장바구니 자동 비우기
  - 결제 테스트용 **100원 상품** 포함
- **주문 상세 페이지**: 결제 완료 후 상품명 / 금액 / 주문번호 / 주문일시 / 결제수단 표시
- **마이페이지**: 내 주문 내역(상품명 / 금액 / 주문일 / 주문번호)
  - **본인 주문만** (RLS + 쿼리 `user_id = 로그인 uid` 필터) · **최신순**(`paid_at DESC`)
  - 주문번호는 앞 8자리만 표시(`#ORDXXXXX...`) · 0건이면 "아직 주문 내역이 없어요" 빈 상태

## 기술 스택
- Frontend: 단일 `index.html` (React 18 + Babel standalone + Tailwind CDN + 토스페이먼츠 v2 SDK)
- Backend: Supabase (Postgres + Auth + RLS) + Vercel 서버리스 함수(결제 승인)
- 결제: 토스페이먼츠 결제위젯 (승인 API는 서버에서 시크릿키로 호출)

## DB 스키마 (`schema.sql`)
| 테이블 | 컬럼 | 접근 정책(RLS) |
|--------|------|----------------|
| `products` | id, name, price, image_url, description | **공개** — anon·authenticated 조회, 쓰기 불가 |
| `cart` | id, user_id, product_id, quantity | **본인만** — `user_id = auth.uid()` 인 행만 조회/담기/수정/삭제 |
| `ratings` | id, user_id, product_id, rating(1~5) | **조회 공개**(평균 계산) / **등록·수정·삭제는 본인만** · `unique(user_id, product_id)` |
| `orders` | order_id(PK), user_id, amount, order_name, status, paid_at, created_at | **본인만** — `user_id = auth.uid()`. 결제 전 PENDING 저장 → 서버 승인 후 DONE+paid_at |

- `cart.user_id`·`orders.user_id`·`ratings.user_id` 기본값 `auth.uid()`
- 이미지는 외부 의존성 없는 SVG data URI (항상 로딩됨)

## 결제(토스페이먼츠) 구성
- 클라이언트키는 `index.html`에 공개(공개키). **시크릿키는 커밋/노출 금지** → Vercel 환경변수 `TOSS_SECRET_KEY`.
- 서버 승인 함수: `api/confirm-payment.js` (무의존성 Vercel 함수). 흐름: 저장금액 대조 → 토스 `payments/confirm` → 주문 DONE + 장바구니 비우기.

## 로컬 실행 / 시드
```bash
npm install                 # postgres 드라이버
node seed.js                # products/cart/ratings 테이블 + RLS + 상품/별점 시드 (재실행 안전)
node add-payment-extras.js  # orders.paid_at 컬럼 + 100원 테스트 상품 (재실행 안전)
npx serve .                 # 정적 서버로 index.html 열기 (단, /api 함수는 Vercel에서만 동작)
```

## 배포
Vercel 배포. `index.html`(정적) + `api/`(서버리스 함수)를 함께 올리고, dev 파일은 `.vercelignore` 로 제외.
```bash
vercel env add TOSS_SECRET_KEY production   # 최초 1회 (시크릿키 주입)
vercel --prod
```
