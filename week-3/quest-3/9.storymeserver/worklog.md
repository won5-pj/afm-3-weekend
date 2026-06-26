# 작업 로그 — 나를 설명하는 .md + Q&A 채팅앱 (Server + AI)

날짜: 2026-06-26

> 퀘스트: **[Context + Server + AI] 나를 설명하는 .md + Q&A 앱**

## 요청 → 작업 요약

### 1. 요청: "화면에 질문을 입력하면 서버가 질문과 .md를 함께 AI에게 전달하고, AI가 .md 내용을 근거로 답변해서 화면에 보여주는 채팅앱. 없는 내용은 '몰라요'를 기본 컨텍스트로."
- 작업: `9.storymeserver` 폴더에 서버 기반 채팅앱 구축.
  - `about-me.md` — `7.storyme`에서 복사한 컨텍스트(자기소개) 파일
  - `.env` — `1.mychatgpt`에서 복사한 Gemini API 키
  - `server.js` — Node.js `http` 웹서버 (의존성 없음)
    - 정적 파일 서빙 + `POST /api/chat` 라우트
    - **매 요청마다 `about-me.md`를 읽어** 질문과 함께 Gemini에 전달 (파일 수정 시 서버 재시작 불필요)
    - system 프롬프트 규칙: 문서 내용만 근거로 답하고, **없는 내용은 정확히 "몰라요."**
    - `temperature: 0.2` (사실 기반 답변 안정화)
    - `.env`/점(.) 파일 외부 접근 차단(403) — API 키 유출 방지
  - `index.html` — 채팅 UI (질문 입력 → 답변 표시, Enter 전송 / Shift+Enter 줄바꿈, 대화 기록 유지)

### 2. 검증: 실제 서버 실행 후 동작 확인
- "직업이 뭐예요?" → **"오상원 씨의 직업은 회사원입니다."** (문서 근거 ✅)
- "어디 살아요?" → **"오상원 씨는 서울시 종로구에 삽니다."** (문서 근거 ✅)
- "좋아하는 음식이 뭐예요?" (문서에 없음) → **"몰라요."** (규칙대로 ✅)
- `GET /.env` → **403 Forbidden** (보안 ✅)

### 3. 요청: "워크로그 + 실행화면 스크린샷 남겨줘"
- 작업: 이 `worklog.md`와 스크린샷 2장(`대화1.png`, `실행화면1.png`)을 같은 폴더에 저장.

## 결과물
- `9.storymeserver/about-me.md` — AI 컨텍스트 (자기소개)
- `9.storymeserver/.env` — Gemini API 키
- `9.storymeserver/server.js` — Node.js 서버 (질문 + .md → Gemini 프록시) [신규]
- `9.storymeserver/index.html` — 채팅 화면 [신규]
- `9.storymeserver/worklog.md` — 이 작업 로그 [신규]
- `9.storymeserver/대화1.png`, `실행화면1.png` — 실행 스크린샷 [신규]

## 실행 방법
```
cd week-3/quest-3/9.storymeserver
node server.js
# 브라우저에서 http://localhost:3000 접속
```

## 동작 흐름
화면에서 질문 입력 → `/api/chat` 전송 → **서버가 `about-me.md`를 읽어** 질문과 함께 Gemini에 전달
→ AI가 문서 내용만 근거로 답변(없으면 "몰라요.") → 화면에 표시.

## 검증
- 문서에 있는 정보(직업·지역)는 정확히 답하고, 없는 정보(좋아하는 음식)는 "몰라요."로 응답.
- `.env` 등 민감 파일은 403으로 차단됨 → 의도대로 동작 확인.
