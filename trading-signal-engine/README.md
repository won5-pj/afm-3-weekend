# RuleKeeper — 트레이딩 시그널 엔진

재량매매를 명시적 신호 + 매매일지로 바꿔 준수율·성과를 숫자로 확인하는 1인용 규칙 기반 엔진.
전체 기획은 [`MISSION.md`](MISSION.md), 개발 계획·구조는 [`DEV.md`](DEV.md) 참고.

## 실행 (Windows, M1)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python main.py --once   # 캔들 1회 조회 후 종료 (스모크 테스트)
python main.py          # 캔들 마감 스케줄러 상시 구동 (Ctrl+C 종료)
```

- `.env.example` 를 `.env` 로 복사해 심볼·리스크 파라미터를 조절.
- 현재 M1은 **비트겟 공개 캔들 API(키 불필요)** 만 사용한다.
- 다음 단계(M2~)의 의존성(pandas·지표·텔레그램·supabase)은 해당 마일스톤에서 추가.

## 진행 상황

- [x] **M1** — 데이터 수신 골격 (비트겟 캔들 fetch + 캔들 마감 스케줄러)
- [ ] M2 — 지표 계산 (EMA/ADX/스윙피벗 S-R 존) · 최고 난관
- [ ] M3 — 4층 신호 판정 + 리스크
- [ ] M4 — 텔레그램 알림·인터랙션
- [ ] M5 — 매매일지 로깅 (Supabase)
- [ ] M6 — `/report` 리포트
- [ ] M7 — NDX100 세션·갭 처리
- [ ] M8 — 심리 가드레일 + VPS 승격
