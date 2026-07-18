---
name: treeview-kickstart
description: treeview 프로젝트가 dev-kickstart에서 Supabase JS 구조로 확정됨 + AI 요약 앱에 재사용 가능한 패턴
metadata:
  type: project
---

treeview (C:\afm-3-weekend\treeview) — 생각정리 도구(텍스트/PDF → 요약 + 마인드맵). dev-kickstart에서 **Option 2 Supabase JS 구조** 확정, DEV.md 작성 완료.

**Why:** 미션에 사용량제한·과거메모연결·유료구독·공개배포가 이미 로드맵에 있어 인증+DB+서버리스가 필수 → Supabase가 정확히 부합.

**How to apply (AI 요약형 앱 dev-kickstart에서 재사용할 패턴):**
- LLM API 키 보호 = **Supabase Edge Function 프록시** (프론트→Edge Function→Claude). 키는 `supabase secrets set`으로만. 프론트 직접 호출 금지.
- 사용량 제한은 **서버측(Edge Function)에서 생성 직전 검증** + RLS 테이블 카운트. 클라 카운트는 표시용.
- 마인드맵: markmap(트리/아웃라인 토글 — markdown 원본이 곧 아웃라인) + Cytoscape.js(그물망/클러스터). AI가 `{summary, outline, nodes, edges}` 단일 JSON 반환하면 3종 뷰 한 소스로 렌더.
- 바이브코딩 Phase에 **Phase 2.5(Supabase 연결 검증)** 삽입: 어려운 AI 기능 전에 세션·DB(RLS)·Edge Function 배포 파이프라인부터 검증.
- 모델 기본 `claude-opus-4-8`, 속도/비용(30초 목표·무료티어) 시 haiku-4-5/sonnet-5 검토는 사용자 결정으로 남김.

관련: [[quant-trading-agent-project]] 등 다른 프로젝트와 동일 저장소(afm-3-weekend), Supabase MCP 기사용 중.
