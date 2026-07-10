# 🐶 멍스데이(Mongsday) — AI 운영 파트너앱

**내 카페를 잘 아는** 맞춤형 AI 운영 파트너.
`my_cafe.md`(카페 아이덴티티 = **AI Context**)와 Supabase에 쌓인 **실시간 운영 데이터**(매출·예약·회원견·재고)를 **결합**해, 사장님 질문에 "우리 카페를 아는" 파트너로 답합니다.

```
[AI Context = my_cafe.md]  +  [Supabase 운영 데이터]
        └──────────────┬──────────────┘
        Gemini 가 결합해 사장님 맞춤 조언
```

## 구성
| 파일 | 역할 |
|------|------|
| `my_cafe.md` | **AI Context** — 카페 컨셉/타겟/메뉴/차별점 등 아이덴티티 (컨설팅 결과물) |
| `server.js` | Express + `pg`(Supabase) + Gemini. 운영 스냅샷 조회 + AI 결합 |
| `index.html` | 대시보드(KPI·예약·생일견·재고) + AI 채팅 UI |
| `seed.js` | `cafe_*` 테이블 생성 + 데모 운영 데이터 시드 (DB `current_date` 기준 상대 날짜) |
| `schema.sql` | 운영 데이터 스키마 (참조용) |

## 운영 데이터 테이블 (Supabase, `cafe_` 접두사)
- `cafe_menu` — 메뉴판(음료/브런치/펫베이커리/생일파티)
- `cafe_sales` — 판매 내역(주문 단위 `order_no`로 객단가 계산)
- `cafe_pets` — 단골 반려견 회원(생일 → 파티 세일즈 기회)
- `cafe_reservations` — 생일파티 예약(우리 카페 핵심 상품)
- `cafe_inventory` — 재고(발주점·유통기한 경고)

## 실행 방법
```bash
cd week-5/quest-5/mycafe
npm install
npm run seed     # cafe_* 테이블 생성 + 데모 데이터 채우기 (최초 1회 / 데이터 갱신 시)
npm start        # http://localhost:3200
```
`.env` 필요값: `DATABASE_URL`(Supabase 풀러), `GEMINI_API_KEY`, `PORT`(기본 3200). → `.env.example` 참고.

## 이렇게 물어보세요
- "이번 달 매출 어때?" · "인기 메뉴 뭐야?" · "객단가 알려줘"
- "다가오는 생일파티 정리해줘"
- "이번 달 생일인 강아지한테 뭐 하면 좋을까?" (→ 파티 세일즈 제안)
- "재고 점검해줘" (발주 필요 / 유통기한 임박)
- "매출 올릴 아이디어 줘" (카페 컨셉 + 실데이터 기반 제안)

## API
- `GET /api/snapshot` — 대시보드용 운영 스냅샷(JSON)
- `POST /api/chat` `{ message }` — AI 운영 파트너 답변(카페 컨텍스트 + 실데이터 결합)
- `GET /api/cafe` — my_cafe.md 원문/메타

## 보안 메모
- 앱은 **직접 DB 접속 문자열**(전체 권한)로 연결합니다. `cafe_*` 테이블에는 RLS가 없으므로
  anon 키를 공개하는 클라이언트에는 사용하지 마세요(이 앱은 서버가 대신 DB에 접근).
- `.env`(DB 비밀번호·API 키)는 `.gitignore` 처리되어 커밋되지 않습니다.
- AI 답변은 **실제 조회된 운영 데이터에만 근거**하도록 프롬프트가 제한되어 있습니다.
