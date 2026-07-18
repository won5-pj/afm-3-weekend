# index-4 컴포넌트 분리판

`../index-4.html` 하나에 몰려 있던 React 컴포넌트를 **컴포넌트별 파일**로 분리한 버전입니다.
빌드 도구 없이 CDN(React 18 + Babel standalone + Tailwind)을 그대로 유지합니다.

## 폴더 구조

```
index-4-components/
├─ index.html          # 엔트리: CDN 로드 + Tailwind 설정 + 컴포넌트 스크립트 순서 로드
├─ styles.css          # 마퀴/눌림/커서 등 커스텀 CSS
├─ main.jsx            # ReactDOM.createRoot(...).render(<App />)
├─ components/
│  ├─ Box.jsx          # 프리미티브 — 하드섀도우 블록
│  ├─ Button.jsx       # 프리미티브 — 눌림 버튼
│  ├─ Badge.jsx        # 프리미티브 — 라벨 배지
│  ├─ SectionTitle.jsx # 프리미티브 — 섹션 제목 (→ Badge)
│  ├─ Header.jsx       # 레이아웃 — 스티키 헤더 + 모바일 메뉴
│  ├─ Marquee.jsx      # 레이아웃 — 무한 스크롤 띠
│  ├─ Footer.jsx       # 레이아웃 — 푸터
│  ├─ Hero.jsx         # 섹션 — 히어로 (→ Badge, Button)
│  ├─ CanDo.jsx        # 섹션 — 할 수 있는 일 (→ SectionTitle, Box)
│  ├─ Models.jsx       # 섹션 — 모델 라인업 (→ SectionTitle, Box)
│  ├─ Where.jsx        # 섹션 — 사용처 (→ Badge, Box)
│  ├─ Values.jsx       # 섹션 — 지향점 (→ SectionTitle, Box)
│  ├─ CTA.jsx          # 섹션 — 마무리 CTA (→ Button)
│  └─ App.jsx          # 루트 — 전 섹션 조립
└─ README.md
```

## 동작 방식

- 각 `.jsx` 파일은 `<script type="text/babel" src="...">` 로 로드되어 **브라우저에서 JSX 변환**됩니다.
- 모듈 번들러가 없으므로 컴포넌트는 `import/export` 대신 **전역 함수**로 정의되고,
  Babel standalone 이 `index.html` 의 스크립트 **문서 순서대로** 실행하여 서로 참조합니다.
- 그래서 로드 순서가 중요합니다: `프리미티브 → 레이아웃 → 섹션 → App → main` 순.
- React 훅은 전역 중복 선언을 피하려고 각 컴포넌트 안에서
  `const { useState } = React;` 처럼 **함수 스코프로** 꺼내 씁니다.

## 실행 방법

⚠️ 외부 `text/babel` 스크립트는 `fetch` 로 불러오므로 **파일 더블클릭(`file://`)으로는
CORS 때문에 로드되지 않습니다.** 반드시 로컬 서버로 여세요.

```bash
# 이 폴더에서 아무거나 하나
npx serve .          # http://localhost:3000
# 또는
python -m http.server 8000   # http://localhost:8000
```

VS Code 를 쓴다면 **Live Server** 확장으로 `index.html` 을 열어도 됩니다.

> 참고: 빌드 없이 브라우저에서 바로 열리는 **단일 파일** 버전은 `../index-4.html` 입니다.
> 이 폴더는 "컴포넌트별로 나눠 읽고 재사용하기 좋게" 정리한 버전입니다.
