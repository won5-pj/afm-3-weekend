# 🛍️ MEN'S SHOP — 남성의류 쇼핑몰 (결제 없음)

상품 목록(공개) → 장바구니 담기(로그인 필수) → 내 장바구니 관리 → 합계 계산까지 구현한
단일 HTML 쇼핑몰 앱입니다. 결제 없이 `주문하기`는 "준비 중" 안내만 띄웁니다.

## 핵심 구조
```
[상품 목록 (DB, 공개)] → [장바구니 담기 (로그인 필수)] → [내 장바구니 관리] → [합계 계산]
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
- **주문하기**: 클릭 시 "주문 기능 준비 중" 모달

## 기술 스택
- Frontend: 단일 `index.html` (React 18 + Babel standalone + Tailwind CDN)
- Backend: Supabase (Postgres + Auth + RLS), `@supabase/supabase-js` REST

## DB 스키마 (`schema.sql`)
| 테이블 | 컬럼 | 접근 정책(RLS) |
|--------|------|----------------|
| `products` | id, name, price, image_url, description | **공개** — anon·authenticated 조회, 쓰기 불가 |
| `cart` | id, user_id, product_id, quantity | **본인만** — `user_id = auth.uid()` 인 행만 조회/담기/수정/삭제 |
| `ratings` | id, user_id, product_id, rating(1~5) | **조회 공개**(평균 계산) / **등록·수정·삭제는 본인만** · `unique(user_id, product_id)` |

- `cart.user_id` 기본값 `auth.uid()`, `unique(user_id, product_id)` 로 같은 상품 1행 유지
- 이미지는 외부 의존성 없는 SVG data URI (항상 로딩됨)

## 로컬 실행 / 시드
```bash
npm install          # postgres 드라이버
node seed.js         # products/cart 테이블 + RLS 생성 및 상품 10종 시드 (재실행 안전)
npx serve .          # 정적 서버로 index.html 열기
```

## 배포
Vercel 정적 배포. dev 파일은 `.vercelignore` 로 제외하고 `index.html` 만 서빙합니다.
```bash
vercel --prod
```
