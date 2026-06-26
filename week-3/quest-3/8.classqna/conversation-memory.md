# 수업 Q&A 대화 메모리

> class-qna 에이전트가 이전 대화를 기억하기 위해 사용하는 파일입니다.
> 각 대화 후 질문/답변 요지가 아래에 누적 기록됩니다.

## 2026-06-26 — Q2
- Q: API가 뭐야? 수업 자료 기준으로 설명하고, 실습 코드에서 API 쓰는 예시 하나 보여줘.
- A:
  - API = 만들어진 백엔드 서버를 사용하는 인터페이스. 앱 유형 중 "중계기(Network)"의 핵심.
  - 외부 서버에 데이터를 요청(fetch) → JSON 응답 → 화면에 표시하는 구조.
  - 코드 예시: week-3/pokebook/index.html — PokeAPI fetch 호출 (fetchPokemon 함수, loadList 함수)
  - 참조: curriculum.md (3주차 개념), concepts-summary.md (중계기 설명), week-3/pokebook/index.html

## 2026-06-26 — Q1 (첫 대화)
- Q: 계산기(Calculation) 앱이랑 변환기(Transform) 앱의 차이가 뭐야? week-2 실습 중 어떤 게 계산기이고 어떤 게 변환기인지 알려줘.
- A: 
  - 계산기: 입력 → 공식 → 새로운 정보 생성 (결정론적, 외부 안 씀)
  - 변환기: 같은 정보를 다른 형태/포맷으로 바꿈 (원본 복원 가능)
  - 구분 핵심: "원본 복원 가능하면 변환, 새 값이 나오면 계산"
  - week-2 계산기: split(더치페이), tax cal(부가가치세)
  - week-2 변환기: QR(텍스트→QR이미지), PDF(문서→PDF), meme(이미지+텍스트→짤)
  - 참조: week-3/quest-3/8.classqna/concepts-summary.md, week-2/quest-2/ 각 index.html
