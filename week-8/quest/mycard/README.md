# 오상원 명함 (My Card)

> 처음 만난 사람이 나를 알 수 있도록 만든 개인 명함입니다.

## 🌱 한 줄 컨셉

> ## 나를 한 단어로 정의하면 — **성장 (Growth)**

어제보다 나은 오늘을 만드는 사람. 자기개발과 독서를 습관처럼,
인테리어에서 물류로 이어진 커리어까지 — 멈추지 않고 계속 자랍니다.
**성장은 습관, 열정은 기본값(default)** 입니다.

---

## 📇 결과물 (필수 포함 항목)

| 항목 | 파일 |
|------|------|
| 명함 이미지 (앞면) | [`out/card-front.png`](out/card-front.png) |
| 명함 이미지 (뒷면) | [`out/card-back.png`](out/card-back.png) |
| 한 줄 컨셉 설명 | 이 문서 상단 · [`CONCEPT.md`](CONCEPT.md) |
| 에이전트와의 대화 스크린샷 | [`out/agent-chat.png`](out/agent-chat.png) — **Cursor 실제 채팅 화면 캡처** |

---

## 🎨 디자인 정보

- **사이즈**: 90 × 54mm 표준 명함 (5:3) → 렌더링 1800 × 1080px (≈508 DPI, 인쇄용)
- **톤**: 토스풍의 시원하고 깔끔한 무드, **그린 계열**(성장 = green 의미 연결)
- **강조 포인트 1개**: 앞면의 **"성장"** 단 하나만 크기·컬러로 강조. 나머지는 차분하게.
- **폰트**: Pretendard (제목 Black/ExtraBold) + Malgun Gothic 폴백

### 앞면
- 좌상단: 모노그램(오) + 이름 **오상원 / OH SANG WON** + 직함 **사원 · TLS**
- 중앙: `나를 한 단어로 정의하면` → **성장** (成長 / GROWTH)
- 하단: 📞 010-2574-8001 · ✉ dennisoh.au@gmail.com · 📍 서울 종로구
- 배경: 우상향 **성장 그래프**(상승 바 + 라인 + 새싹)

### 뒷면
- 창의적 슬로건 (자기표현):
  > **"완성형이 아니라, 성장형입니다."**
  > 어제보다 딱 1cm 더 — 읽고, 배우고, 자랍니다.
  > 성장은 습관, 열정은 기본값(default)이니까요.
- 키워드 칩: 📖 매일 독서 · 🚀 자기개발 · 🌱 진행형
- **QR 코드**: 스캔하면 연락처(vCard)가 저장됩니다 (이름·직함·전화·이메일·주소 포함)

---

## 🛠 재생성 방법

```bash
# 1) QR 재생성 (연락처 vCard)
python assets/gen_qr.py

# 2) 로컬 서버 실행 후 Playwright로 캡처
python -m http.server 8931 --bind 127.0.0.1
#   → card-front.html / card-back.html / chat.html 을 1800x1080(카드) 뷰포트로 캡처
```

## 📂 파일 구조

```
mycard/
├─ README.md            # 이 문서
├─ CONCEPT.md           # 한 줄 컨셉 설명
├─ card-front.html      # 앞면 소스
├─ card-back.html       # 뒷면 소스
├─ chat.html            # (참고) 초기 대화 목업 HTML — 최종본은 실제 Cursor 캡처로 대체됨
├─ assets/
│  ├─ gen_qr.py         # 연락처 QR 생성 스크립트
│  └─ qr.png            # 생성된 QR (vCard)
├─ fonts/               # Pretendard 폰트
└─ out/
   ├─ card-front.png          # ✅ 앞면
   ├─ card-back.png           # ✅ 뒷면
   ├─ agent-chat.png          # ✅ 에이전트 대화 — Cursor 실제 채팅 화면 캡처
   └─ _agent-chat-mockup.png  # (참고) 초기 HTML 목업 버전
```
