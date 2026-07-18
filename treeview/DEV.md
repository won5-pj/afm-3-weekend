# DEV.md - 개발 가이드

> **treeview** — 두서없는 생각·긴 글·문서를 넣으면 핵심을 요약하고 한 장의 마인드맵으로 정리해주는 개인용 생각정리 도구.
> **Architecture:** Supabase JS 구조 (Supabase Auth + PostgreSQL/RLS + Edge Functions + 모바일 우선 프론트엔드)

---

## Requirements
MISSION.md에서 추출한 v1(무료) 범위 요구사항 체크리스트.

- [ ] 큰 입력창에 긴 텍스트·메모 붙여넣기
- [ ] 외부 문서(PDF·기사) 불러오기 → 텍스트 추출
- [ ] AI 핵심 요약 (넣은 내용 "안에서" 정리 + 조각 간 관계 파악)
- [ ] 마인드맵 시각화 — 요약+맵(기본)
- [ ] 마인드맵 시각화 — 트리형(위계형)
- [ ] 마인드맵 시각화 — 그물망/클러스터형(선택)
- [ ] 아웃라인 ↔ 맵 토글 (버튼 하나로 전환)
- [ ] 내보내기 — PNG
- [ ] 내보내기 — Markdown
- [ ] **모바일 최적화 (1급 요구사항)** — 모바일 우선 반응형, 가로 스크롤·잘림 없음
- [ ] 터치 조작 — 핀치 줌 / 드래그 이동 / 노드 탭으로 펼치기·접기
- [ ] 작은 화면 가독성 — 요약 접기/펼치기, 맵 자동 맞춤(fit-to-screen), 요약↔맵 탭 전환
- [ ] 붙여넣기 30초 이내 맵 생성 (성능 목표)
- [ ] 무료 월 생성 횟수 상한 (사용량 제한)
- [ ] 이전 맵 목록 최소 제공 (데스크톱: 접이식 사이드바 / 모바일: 하단시트·햄버거)

## Non-goals (v1에서 하지 않을 것)
- ❌ v2 유료 기능: 새 관점·빠진 고리 제안, 과거 메모와의 연결, 웹검색 기반 확장
- ❌ 구독 결제 시스템 (v2에서 도입)
- ❌ 광고 — "머리를 비우려는" 집중 맥락과 충돌하므로 절대 붙이지 않음
- ❌ 사용자가 직접 노드를 그리는 수동 마인드맵 편집기 (정리는 앱이 위임받는 게 핵심)
- ❌ 복잡한 메뉴·설정 화면 (극단적 미니멀 유지)

## Style (UI/UX 방향)
- **단일 입력창 중심의 미니멀 레이아웃** — 화면 중앙에 큰 입력창 하나 + 생성 버튼. "붙여넣고 누르면 끝".
- **여백으로 구분, 선·박스 최소화** — 경계선 대신 여백/옅은 배경 톤으로 구획.
- **노드는 키워드·짧은 문구 위주** — 메뉴를 파고들지 않아도 결과를 바로 읽음 (Xmind 'Zen Mode' 식 몰입형).
- **모바일 우선** — 작은 화면 기준으로 먼저 설계 후 데스크톱으로 확장.
- 색: 차분한 무채색 기반 + 그물망형에서만 클러스터별 색 덩어리 사용.

## Key Concepts (핵심 용어)
- **요약+맵**: 짧은 핵심 요약 문단 + 그 아래 마인드맵. 기본 결과 형태.
- **트리형**: 중심 주제에서 가지가 뻗는 위계형 지도 (markdown 위계 → 렌더).
- **그물망/클러스터형**: 관련 개념끼리 색으로 묶고, 중요할수록 노드를 크게 표시하는 네트워크 그래프.
- **아웃라인 ↔ 맵 토글**: 같은 내용을 접이식 텍스트 개요 ↔ 마인드맵으로 전환. (markdown 하나가 두 표현의 공통 소스)
- **연관성 범위 a**: 넣은 내용 "안에서"의 요약·관계 파악. (v1 범위)
- **생성(generation)**: 텍스트 → 요약+맵 1회 산출. 무료 사용량 상한의 카운트 단위.

## Open Questions (아직 미결정)
- 무료 월 생성 횟수 상한의 구체적 수치 (예: 월 20회?) — TODO에서 상수로 두고 나중에 확정.
- 유료 구독 가격대 (v2).
- 지원 문서 형식 범위 (PDF·기사 외 워드/URL 추가 여부).
- 리버스 트라이얼(첫 며칠 프리미엄 개방) 도입 여부.
- v2 "웹검색 기반 아이디어 확장"을 정식 기능으로 넣을지 실험으로 둘지.

---

## 선택된 개발 구조

**Supabase JS 구조** — v1(개인용) → v2(유료) → 공개 배포를 하나의 스택으로 끝까지 가져가는 최단 경로.

| 계층 | 구성 | 담당 요구사항 |
|------|------|--------------|
| **Auth** | Supabase Auth (이메일/OAuth, 익명 세션) | 사용량 제한·구독의 기반이 되는 "사용자" 개념 |
| **DB** | Supabase PostgreSQL + Row Level Security(RLS) | 맵 히스토리 저장, 월 생성 횟수 카운트, "내 데이터만 보임" 자동 보안 |
| **서버 로직** | Supabase **Edge Functions** (Deno) | AI 요약 호출(키 보호), PDF 텍스트 추출 |
| **프론트엔드** | HTML + ES Modules JS + Tailwind(CDN) + Supabase JS(CDN) | 모바일 우선 UI, 입력·토글·내보내기 |
| **마인드맵** | 아래 라이브러리 후보 참고 | 트리/그물망/아웃라인 시각화 |

### 마인드맵 시각화 라이브러리 후보
- **markmap** (`markmap-lib` + `markmap-view`, D3 기반) — **주력.** Markdown → 마인드맵. 팬/줌 내장. **아웃라인↔맵 토글에 이상적**(markdown 원본이 곧 아웃라인, 렌더 결과가 맵). 트리형·요약+맵에 사용.
- **Cytoscape.js** — **그물망/클러스터형(선택 기능)용.** 네트워크 그래프, 노드 크기·클러스터 색상, 터치 제스처(핀치줌·드래그) 내장.
- (대안) **vis-network** — Cytoscape 대신 네트워크 뷰에 쓸 수 있는 경량 대안.

> **설계 팁:** AI 요약 결과를 하나의 구조화된 JSON `{ summary, outline(markdown), nodes[], edges[] }`으로 받으면 markmap(outline)·Cytoscape(nodes/edges)·아웃라인 텍스트를 모두 같은 소스에서 렌더할 수 있다.

---

## 미션 요구사항 A~E → 구조 매핑

| # | 요구사항 | 이 구조에서의 구현 위치 |
|---|----------|------------------------|
| **A** | AI 요약·연관성 분석 (LLM 호출) | **Edge Function** `summarize` — Claude API를 서버측에서 호출. **API 키는 프론트에 절대 노출하지 않고** `supabase secrets`에 보관. |
| **B** | 모바일 터치 마인드맵 (핀치줌·드래그·탭) | **프론트엔드** — markmap/Cytoscape의 팬·줌·터치 제스처 + Tailwind 모바일 우선 반응형 + `viewport` 메타·`touch-action` 설정. |
| **C** | 문서 파싱 (PDF·기사) | **Edge Function** `extract`(또는 `summarize` 내부) — PDF 텍스트 추출 후 요약 파이프라인에 투입. 대안: 클라이언트 pdf.js 파싱 후 텍스트만 전송. |
| **D** | 무료 월 생성 횟수 제한 | **DB + RLS** — `usage_counters`(또는 `generations` 집계) 테이블에 사용자별 월 카운트. Edge Function이 생성 전 카운트 확인 → 상한 초과 시 거절. |
| **E** | v2 과거 메모 연결 + 유료 구독 | **DB(RLS로 사용자별 격리)** — `maps` 테이블에 요약·맵 데이터 저장(=v1의 히스토리, v2 과거메모 연결의 재료). 구독은 v2에서 `subscriptions` 테이블 + 결제 웹훅. |

---

## 프로젝트 구조

```
treeview/
├── MISSION.md
├── DEV.md                      # 이 문서
├── package.json                # 정적 개발 서버 스크립트 (Phase 2에서 생성)
├── .env.local                  # 프론트 공개 키 (SUPABASE_URL, ANON KEY) — gitignore
├── .gitignore
├── index.html                  # 메인 (Phase 2에서 prototype-v1.html을 전환)
├── src/
│   ├── app.js                  # 앱 진입점: 뷰 전환, 상태 관리
│   ├── supabase.js             # Supabase 클라이언트 초기화
│   ├── auth.js                 # 로그인/익명 세션 처리
│   ├── mindmap.js              # markmap/Cytoscape 렌더링 래퍼
│   └── exporter.js             # PNG / Markdown 내보내기
└── supabase/
    ├── config.toml             # supabase CLI 설정
    └── functions/
        ├── summarize/          # AI 요약 Edge Function (Claude API 호출)
        │   └── index.ts
        └── extract/            # (선택) PDF·문서 텍스트 추출
            └── index.ts
```

> Phase 1의 프로토타입은 `prototype-v1.html` 단일 파일 하나뿐이며, 위 구조는 Phase 2 이후 점진적으로 갖춰진다.

---

## 📋 TODO List
바이브 코딩 최적화 순서: **디자인 → 기본기능(쉬운 것) → 플랫폼 연결 검증 → 핵심·어려운 기능(불확실한 것 먼저) → 마무리**. 난이도: 🟢 Easy · 🟡 Medium · 🔴 Hard.

### Phase 1: 디자인 & 프로토타이핑
> ⚠️ 서버 코드·npm·Supabase 불필요. `prototype-v1.html` 단일 파일을 브라우저에서 직접 열어 확인.

- [ ] 🟢 `prototype-v1.html` — 단일 입력창 + 생성 버튼 중심의 첫 화면(미니멀, 여백 기반)
- [ ] 🟢 더미 요약 문단 + 더미 마인드맵 렌더 (markmap CDN, 하드코딩 markdown)
- [ ] 🟡 뷰 전환 UI 4종 스켈레톤 — 요약+맵 / 트리형 / 그물망형(더미) / 아웃라인↔맵 토글
- [ ] 🔴 **모바일 우선 레이아웃** — 폰 화면 기준 설계, 요약↔맵 탭 전환, 맵 fit-to-screen, 요약 접기/펼치기 (1급 요구사항이므로 프로토타입부터 반영)
- [ ] 🟢 이전 맵 목록 UI 자리만 (데스크톱 사이드바 / 모바일 하단시트·햄버거)
- 📌 **체크포인트:** 더미 데이터로 폰·데스크톱 양쪽에서 모든 화면이 잘림 없이 보이고 뷰 전환·토글이 동작 (파일을 브라우저로 직접 열어 확인)
- 📌 `git commit` — 프로토타입 세이브 포인트

### Phase 2: 기본 기능 (쉬운 것부터 — 순수 웹 표준)
> AI·서버 없이 더미/클라이언트 데이터로 동작하는 앱 껍데기를 완성한다.

- [ ] 🟢 **프로젝트 초기화** — `package.json`, 정적 개발 서버(`npx serve` 또는 Vite), `.gitignore`
- [ ] 🟢 `prototype-v1.html` → `index.html` 전환, `src/*.js` 모듈로 분리
- [ ] 🟢 입력 처리 — 큰 텍스트 붙여넣기, 문자 수 표시, 모바일 붙여넣기 흐름 매끄럽게
- [ ] 🟡 파일 선택 UI — PDF·문서 선택 (실제 파싱은 Phase 3, 여기선 선택·미리보기까지)
- [ ] 🟡 마인드맵 실제 렌더 연결 — `mindmap.js`로 markmap(트리/요약+맵) + Cytoscape(그물망) 래핑, 더미 JSON 입력
- [ ] 🟡 아웃라인 ↔ 맵 토글 로직 (markdown 원본 ↔ 렌더 전환)
- [ ] 🟡 내보내기 — PNG(맵 캡처) + Markdown(아웃라인 저장), 클라이언트 전용
- 📌 **체크포인트:** 브라우저에서 텍스트를 넣으면 (더미 요약이라도) 맵이 뜨고, 4종 뷰 전환·토글·PNG/Markdown 내보내기가 실제로 동작
- 📌 `git commit` · 동작 확인 후 다음 단계로

### Phase 2.5: 플랫폼(Supabase) 연결 검증
> Phase 3의 어려운 AI 기능을 만들기 전에 Supabase 파이프라인을 먼저 검증해 빌드 문제를 조기 발견한다.

- [ ] 🟡 Supabase 프로젝트 준비 (신규 생성 또는 기존 재사용) + `supabase CLI` 로그인·link
- [ ] 🟡 `supabase.js` — 클라이언트 초기화 (SUPABASE_URL / ANON KEY), `.env.local` 연결
- [ ] 🟡 익명/이메일 세션 최소 구현(`auth.js`) — 로그인 없이도 세션 확보
- [ ] 🟡 `maps` 테이블 + RLS 정책 생성 → 프론트에서 test row 저장·조회로 "내 데이터만 보임" 검증
- [ ] 🔴 Edge Function `hello` 배포 → 프론트에서 호출 성공 확인 (배포 파이프라인 검증)
- 📌 **체크포인트:** 실제 Supabase에서 세션·DB read/write(RLS 적용)·Edge Function 호출이 모두 정상 동작
- 📌 `git commit`

### Phase 3: 핵심 & 어려운 기능 (불확실도 높은 순서)
> 이 앱만의 특수 기능. AI 학습 데이터가 적거나 방법이 다양해 헤맬 수 있는 부분.

- [ ] 🔴 **AI 요약 Edge Function** `summarize` — Claude API 호출, 프롬프트 튜닝으로 `{summary, outline, nodes, edges}` **JSON 구조화 출력**. 키는 서버측 보관.
  - ⚠️ 실패 시 우회: (1) 출력이 흔들리면 structured outputs/JSON 스키마 강제, (2) 라이브러리 파싱 문제 시 Markdown 아웃라인만 먼저 반환하고 그물망은 후순위, (3) Edge Function 타임아웃 시 `max_tokens` 축소·모델 하향(하단 참고)
- [ ] 🔴 **문서 파싱** (요구사항 C) — PDF 텍스트 추출 → 요약 파이프라인 투입
  - ⚠️ 실패 시 우회: Edge Function 내 추출이 어려우면 클라이언트 `pdf.js`로 텍스트만 뽑아 전송
- [ ] 🔴 요약 결과 → 마인드맵 데이터 매핑 — 실제 AI JSON을 트리/그물망/아웃라인 3종 렌더에 연결 (연관성 반영)
- [ ] 🟡 인증(Auth) 정식화 — 이메일/OAuth 로그인, 세션 유지
- [ ] 🟡 **월 생성 횟수 제한** (요구사항 D) — `usage_counters` 집계, Edge Function이 생성 전 상한 확인·거절. 상한 수치는 상수(`MONTHLY_LIMIT`)로 두고 나중에 확정
- [ ] 🟡 맵 히스토리 저장·불러오기 — `maps`에 저장, 이전 맵 목록에서 열기 (v2 과거메모 연결의 토대)
- 📌 **체크포인트:** 실제 텍스트/PDF를 넣으면 진짜 AI 요약 + 맵이 뜨고, 로그인·사용량 제한·히스토리가 실환경에서 동작
- 📌 `git commit` · 롤백 가능 지점 확보

### Phase 4: 마무리 & 배포
- [ ] 🟡 UI 폴리싱 — 여백/톤 정리, 로딩·빈 상태, 노드 겹침 최소화
- [ ] 🟡 에러 처리 — 요약 실패·사용량 초과·파싱 실패·네트워크 오류 사용자 안내
- [ ] 🟡 **성능 튜닝** — 붙여넣기→맵 30초 이내 (모델·프롬프트·`max_tokens` 조정, 스트리밍 검토)
- [ ] 🟡 모바일 최종 점검 — 주요 폰 화면폭에서 잘림·오작동 없이 95% 성공 (성공 지표)
- [ ] 🟡 배포 — 프론트 정적 호스팅(Vercel/Netlify/Cloudflare Pages) + Edge Function 배포 + 시크릿 설정
- 📌 **체크포인트:** 공개 배포 가능한 상태
- 📌 `git commit`

### v2 (유료) — 나중에
- 🔴 새 관점·빠진 고리 제안 (연관성 범위 b)
- 🔴 과거 생각과의 연결 (연관성 범위 c) — Phase 3에서 쌓은 `maps` 히스토리 활용
- 🟡 유료 구독 — `subscriptions` 테이블 + 결제(토스페이먼츠/Stripe/Lemon Squeezy) 웹훅
- 🟡 (후보) 웹검색 기반 아이디어 확장

---

## 🔧 외부 설정 필요 항목

### 필수 (Must Have)
| 항목 | 왜 필요한가 | 어디서 얻는가 |
|------|-------------|--------------|
| **Supabase 프로젝트** | Auth·DB·Edge Functions의 기반 | supabase.com 로그인 → New Project (이 저장소는 이미 Supabase MCP를 쓰고 있으므로 기존 프로젝트 재사용도 가능) |
| **SUPABASE_URL** | 프론트에서 Supabase에 접속 | 프로젝트 → Settings → API → Project URL (공개 키, 프론트 노출 OK) |
| **SUPABASE ANON / Publishable Key** | 프론트 클라이언트 인증 키 (RLS로 보호) | Settings → API → anon/publishable key (공개 키, 프론트 노출 OK) |
| **Anthropic Claude API Key** | AI 요약·연관성 분석 (요구사항 A) | console.anthropic.com → API Keys. **⚠️ 절대 프론트에 넣지 말 것** — Edge Function 시크릿으로만 보관 |
| **Supabase CLI** | Edge Function 배포·시크릿 관리·로컬 실행 | `npm i -g supabase` 또는 scoop/winget. Deno 런타임은 CLI에 포함 |
| **Node.js (LTS)** | 정적 개발 서버·패키지 관리 | nodejs.org (18+ 권장) |

### 선택 (Nice to Have)
| 항목 | 왜 필요한가 | 어디서 얻는가 |
|------|-------------|--------------|
| **정적 호스팅** (Vercel/Netlify/Cloudflare Pages) | v1 공개 배포 | 각 서비스 무료 플랜 + GitHub 연동 |
| **결제 서비스** (토스페이먼츠/Stripe/Lemon Squeezy) | **v2** 구독 결제 | 각 서비스 대시보드에서 키 발급 |
| **커스텀 도메인** | 배포 시 브랜딩 | 도메인 등록업체 + 호스팅 DNS 설정 |

### .env 예시
```bash
# .env.local  (프론트엔드 — 공개 키만. gitignore 필수)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...        # anon / publishable key

# Edge Function 시크릿 (프론트에 절대 노출 금지 — supabase CLI로 등록)
#   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# 여기(파일)에 적지 말고 위 명령으로만 등록할 것
```

### LLM 모델
- **기본:** `claude-opus-4-8` (Anthropic Claude API) — 요약·연관성 분석 품질 우선.
- **속도/비용 고려:** v1은 무료(월 횟수 제한)이고 "30초 이내" 목표가 있으므로, 대량 요약에는 `claude-haiku-4-5`(빠름·저비용) 또는 `claude-sonnet-5`(균형)로 낮추는 것을 검토할 수 있음. → **모델 선택은 사용자 결정.** 기본은 `claude-opus-4-8`로 시작.
- **교체 가능:** Edge Function 안에서 모델 문자열만 바꾸면 다른 Claude 모델로, 또는 다른 LLM(OpenAI 등)으로도 교체 가능하도록 요약 호출을 한 함수로 캡슐화한다.
- 호출 형식: `POST https://api.anthropic.com/v1/messages`, 헤더 `x-api-key`, `anthropic-version: 2023-06-01`. Edge Function 타임아웃을 넘지 않도록 `max_tokens`를 합리적으로 제한.

---

## 시작하기 (Windows · PowerShell)

```powershell
# 0. 위치
cd C:\afm-3-weekend\treeview

# --- Phase 1: 프로토타입 (설치 불필요) ---
# prototype-v1.html 을 만든 뒤 브라우저로 직접 열기
start .\prototype-v1.html

# --- Phase 2: 프로젝트 초기화 ---
npm init -y
# 정적 개발 서버 (택1)
npx serve .
#   또는 Vite 사용 시:  npm create vite@latest . -- --template vanilla

# --- Phase 2.5: Supabase 연결 ---
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
# .env.local 에 SUPABASE_URL / ANON KEY 채우기 (공개 키)

# --- Phase 3: AI Edge Function ---
supabase functions new summarize
# API 키는 파일이 아니라 시크릿으로만 등록
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
supabase functions deploy summarize
# 로컬 테스트:
supabase functions serve summarize
```

---

## 주의사항 (반드시 지킬 것)
- 🔐 **API 키를 프론트엔드에 절대 노출하지 말 것.** `ANTHROPIC_API_KEY`는 Edge Function 시크릿(`supabase secrets set`)으로만 보관하고, 프론트에서 Claude API를 직접 호출하지 않는다. 프론트 → Edge Function → Claude 순서로만 호출.
- 🔐 **RLS는 기본 ON.** `maps`·`usage_counters` 등 사용자 데이터 테이블은 반드시 RLS 정책을 걸어 "본인 행만 select/insert/update" 가능하게 한다. RLS 없이 anon key만 믿으면 데이터가 전부 노출된다.
- 🔢 **사용량 카운트는 서버측에서 검증.** 월 생성 횟수 상한은 프론트가 아니라 Edge Function이 생성 직전에 확인·거절해야 우회 불가. 클라이언트 카운트는 표시용일 뿐.
- ⏱️ **Edge Function 타임아웃 유의.** 요약 출력이 길면 함수 시간이 초과될 수 있으므로 `max_tokens`를 제한하고, 30초 목표에 맞춰 모델·프롬프트를 조정. 필요 시 스트리밍 검토.
- 📱 **모바일이 1급 요구사항.** 모든 화면을 폰 화면폭 기준으로 먼저 만들고, `viewport` 메타·`touch-action`·충분한 터치 영역·fit-to-screen을 항상 확인.
- 💾 **각 Phase 끝에서 git commit.** 다음 Phase(특히 Phase 3의 어려운 기능)에서 실패하면 직전 커밋으로 롤백.
- 🚫 **광고 금지.** 미션 원칙 — 집중 사용 맥락과 충돌.
