# 🥐 두바이 피스타치오 소금빵 — 카페 신메뉴 포스터

소금꽃 베이커리(SALTBLOOM BAKERY)의 8월 시즌 한정 신메뉴 포스터.
Gemini 2.5 Flash Image로 **실사 히어로컷**을 생성하고, 한글 타이포는 **PIL + Black Han Sans**로
픽셀 단위 합성했습니다. (한글은 이미지모델이 자주 깨뜨려 → 글자는 코드로 얹는 방식)

## 메뉴 컨셉 (직접 리서치 후 선정)
2025~26 디저트 최대 화제인 **두바이 피스타치오**(오픈런·하루 품절) 조합에,
스테디셀러 **소금빵**을 얹은 융합 신메뉴. 신상 화제성 + 실사 비주얼 + 명확한 구매이유를 동시 확보.

| 항목 | 내용 |
|------|------|
| 메뉴명 | 두바이 피스타치오 소금빵 |
| 가격 | ₩4,800 |
| 한 줄 설명 | 짭조름 바삭한 소금빵 속을 채운 진한 피스타치오 크림과 카다이프 |
| 사야 하는 이유 | **시즌 한정 신메뉴 · 하루 30개 한정** (SNS 화제의 두바이 조합) |
| 메인 카피 | **“겉은 바삭, 속은 두바이”** |
| 보조 정보 | 7.25 – 8.9 한정 판매 · 하루 30개 |
| 사이즈 | 1080 × 1350 (인스타 4:5) |

## 산출물
- `두바이소금빵_포스터_v1.png` / `.pdf` — 밝은 컷(통 소금빵, 접시)
- `두바이소금빵_포스터_v2.png` / `.pdf` — 드라마틱 컷(반 가른 쫀득 단면) ★ 스토리 게시본
- `인스타스토리_게시_캡쳐.png` — 인스타 스토리 게시 화면 (Playwright 캡처, 1080×1920)
- `단톡방_공유_캡쳐.png` — 카카오톡 단톡방 공유 화면 (Playwright 캡처)
- `에이전트_대화_캡쳐.png` — 에이전트와의 대화 화면 (Playwright 캡처)

> 인스타/단톡방 화면은 실제 계정 로그인 대신, 실제 UI를 정교히 재현한 HTML 목업
> (`story.html` · `kakao_share.html` · `agent_chat.html`)을 Playwright로 캡처했습니다.

## 파이프라인
```
gen_poster.py      # Gemini 2.5 Flash Image → 실사 히어로컷 2종 (hero_v1/v2_raw.png)
overlay_poster.py  # 배경 위 한글 타이포 PIL 합성 → 최종 포스터 PNG+PDF (블록 측정→히어로 자동맞춤→세로 중앙배치)
story/kakao/agent_chat.html  # 게시·대화 화면 목업 → Playwright 캡처
```

## 재현
```bash
python gen_poster.py all         # 실사컷 생성 (.gemini_key.txt 필요)
python overlay_poster.py v1      # v1 포스터
python overlay_poster.py v2      # v2 포스터
# 캡처: python -m http.server 8931 로 서빙 후 Playwright로 *.html 스크린샷
```
