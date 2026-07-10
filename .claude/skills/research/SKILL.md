---
name: research
description: 관심분야 자동 리서치 — 사용자가 "리서치 돌려줘", "이 주제 좀 조사해줘", "○○ 관련 사이트 찾아서 정리해줘", "리서치 스킬 써줘" 등 특정 주제를 웹에서 조사·정리해 노션에 올려달라고 할 때 사용한다. 브라우저 MCP로 관련 사이트 3곳 이상을 직접 탐색해 핵심 정보를 모으고, 정해진 md 포맷으로 정리한 뒤 노션에 공유한다.
---

# 관심분야 자동 리서치 (research)

사용자가 관심 있는 주제를 정하면, **브라우저 MCP(Playwright)로 관련 사이트 3곳 이상을 직접 방문**해 핵심 정보를 수집하고, 아래 정해진 마크다운 포맷으로 정리한 뒤 **노션에 공유**하는 스킬입니다.

## 작업 흐름

### ① 주제·키워드 묻기 (필수 — 먼저 물어보기)
- 사용자가 주제를 명확히 주지 않았으면 **먼저 물어봅니다.** 임의로 주제를 정하지 않습니다.
- 확인할 것: **① 리서치 주제/키워드**, ② (선택) 조사 관점·범위(예: "가격 비교", "브랜드별 컨셉", "최신 트렌드"), ③ (선택) 결과물 저장 위치.
- 주제가 이미 충분히 구체적이면 곧바로 ②로 넘어갑니다. (예: "베이커리카페 관련 사이트 3곳 이상 조사해줘"는 바로 진행 가능)

### ② 브라우저 MCP로 관련 사이트 3곳 이상 탐색
- 필요한 도구는 ToolSearch로 로드: `mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_close`, (사이트 발굴이 필요하면) `WebSearch`.
- 어떤 사이트를 볼지 모르면 먼저 `WebSearch`로 대표 사이트/공식 도메인을 찾습니다.
- 각 사이트마다: `browser_navigate` → `browser_snapshot`(내용 확인). 스냅샷이 크면 `depth` 파라미터(예: 12~15)로 트리 깊이를 제한해 토큰을 아낍니다.
- **서로 다른 관점의 사이트 3곳 이상**을 봅니다. (예: 대형/소형, 공식/리뷰, 국내/해외처럼 대비되게 고르면 정리가 풍부해짐)
- 각 출처에서 뽑을 핵심: 개요/컨셉, 대표 특징·제품·수치, 차별점, 링크(URL).
- **실제로 페이지에서 확인한 내용만** 적습니다. 없는 정보를 지어내지 않습니다.

#### 브라우저 잠금 오류 대처 (자주 발생)
`Browser is already in use ... use --isolated` 오류가 나면, 이전 세션의 Playwright 전용 브라우저 프로세스가 프로필을 잠근 것입니다. (일반 브라우저 아님 → 정리해도 안전) Bash/PowerShell로 잔여 프로세스를 종료 후 재시도:
```powershell
Get-CimInstance Win32_Process -Filter "name='msedge.exe'" |
  Where-Object { $_.CommandLine -like '*ms-playwright-mcp*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```
(Chrome 기반이면 `name='chrome.exe'`로 바꿔 동일하게 처리.)

### ③ 아래 포맷의 md로 정리
수집한 내용을 **정해진 포맷**의 마크다운으로 저장합니다.
- 저장 위치: 사용자가 지정하지 않으면 `week-5/research/<topic-slug>/research.md` (topic-slug는 영어 kebab-case).
- 파일명은 `research.md`, 내용은 한국어로 작성합니다.

**md 포맷 (반드시 이 5개 섹션 포함):**
```markdown
# <제목>  — 리서치 주제를 담은 제목

- **수집일**: YYYY-MM-DD
- (선택) 조사 방법/범위 한 줄

## 출처별 핵심
### 1. <출처 이름> (URL)
- 핵심 정보 불릿 (개요·특징·수치·차별점)
### 2. <출처 이름> (URL)
- ...
### 3. <출처 이름> (URL)
- ...
(3곳 이상)

## 한 줄 요약
> 이번 리서치의 결론을 한 문장으로.

## 다음 액션
- [ ] 이어서 하면 좋을 일 1
- [ ] 이어서 하면 좋을 일 2
```
- 표(브랜드/항목 비교 등)를 넣으면 가독성이 좋아지므로 출처가 비교 가능하면 표를 추가로 넣습니다. (필수 5개 섹션은 그대로 유지)
- **수집일**은 세션의 오늘 날짜(currentDate)를 씁니다. 스크립트에서 `Date.now()`로 만들지 말고 컨텍스트의 날짜를 그대로 적습니다.

### ④ 노션에 공유
- 필요한 도구는 ToolSearch로 로드: `mcp__notion__notion-create-pages` (연결 확인용 `mcp__notion__notion-fetch` id="self").
- `notion-create-pages`로 페이지 생성:
  - **title은 properties에** 넣고, **content에는 제목(H1)을 다시 넣지 않습니다.** (본문은 `##`부터 시작)
  - content는 위 md 본문을 그대로 사용 (표준 마크다운 표·불릿·인용문 모두 동작).
  - `icon`에 주제에 맞는 이모지 하나(예: 🔎)를 지정.
  - **parent는 생략**하면 워크스페이스 개인(private) 페이지로 생성됩니다. 사용자가 특정 상위 페이지/DB를 지정하면 그 `page_id`/`data_source_id`를 parent로 사용.
- 생성 후 반환된 **노션 페이지 URL**과 로컬 `research.md` 경로를 사용자에게 알려주고, 상위 위치를 옮기고 싶은지 한 번 확인합니다.

## 마무리
- 브라우저는 작업 끝에 `browser_close`로 닫습니다.
- 결과 보고 시: 방문한 사이트 목록(3곳 이상), 저장한 `research.md` 경로, 노션 페이지 URL을 함께 전달합니다.
- 여러 단계(사이트별 탐색 → 정리 → 업로드)라 진행이 길어지면 TaskCreate/TaskUpdate로 진행 상황을 관리합니다.
