# Session Handoff — Account CRM

> **새 Claude Code 세션 시작 시 이 문서를 먼저 읽으세요.**
> 빠른 컨텍스트 회복용. 작업 규칙은 `CLAUDE.md`, 상세 이력은 `DEVELOPMENT_LOG.md` 참조.

**최종 갱신**: 2026-05-20 (v3.21 작업 완료 — 계정 이관 준비)

---

## 🎯 현재 상태

- **운영 버전(라이브)**: v3.20 — https://bioprotech-account-crm.web.app
- **로컬 최신 작업**: **v3.21** (커밋·배포 상태는 아래 ⚠ 참조)
- **GitHub**: https://github.com/Bioprotech/account-CRM-.git
- **Firebase 프로젝트**: bioprotech-crm (Pipeline CRM과 공유)

### ⚠ 이관 시점 미완 상태 (반드시 확인)
- v3.21 코드는 작성 완료 + 빌드 검증 완료
- **커밋/푸시/배포 여부는 `git status`와 `git log`로 직접 확인할 것**
- 라이브가 아직 v3.20이면 → v3.21 배포 필요 (사용자 컨펌 후)

---

## 🆕 v3.21 변경 (누락 7건 재작업 — 사용자 재지적)

v3.20에서 일부만 처리하고 배포한 것을 사용자가 강하게 지적 → 7건 전면 재작업:

1. **P1 자동 Executive Summary 수정 가능** — Page 1, "수동 수정 모드" 체크박스, 월별 Firestore 저장(auto_summary_override_YYYY-MM)
2. **P2 팀별 활동 분석 상세 항상 표시** — ■3, 토글 제거, 신규계약/크로스셀링/미해결이슈 각 건의 고객·유형·일자·담당·내용 표시 (주요고객컨택·하단 GAP원인·주요이슈TOP 제거)
3. **P3 GAP 4-3 + 4-3b 한 카드 통합** — 별도 카드 2개 → 4-3 안 sub-section
4. **P4 Page 4 흐름** — ■5 다음달 계획 textarea + 그 팀 다음달 TASK 리스트 + [+TASK 추가] 인라인 (InlineTaskAddForm 컴포넌트) → ■5-1 차월 파이프라인
5. **P5 ■7 Pipeline CRM 빈 카드 hide** — 활성 딜 0건이면 카드 숨김
6. **P6 기회 파이프라인 모든 미래 cross_selling** — monthlyData.allOpportunities 신규 (오늘 이후 모든 cross_selling/gap.opportunities/recovery, 월별 분포 미니표). ERBE 등 즉시 반영
7. **P7 담당자 활동점수 월 선택** — Dashboard 📅 드롭다운(최근 6개월), ScoreCardSection/TeamScoreboard에 yearMonth prop

---

## 📌 직전 주요 버전 흐름

- **v3.21** — 누락 7건 재작업 (위)
- **v3.20** — 주간 예측 입력 컬럼 / 월별 분기·반기 소계 / 보고서 a~k 재구성 / 팀활동 상세 / ■2 9컬럼 통일
- **v3.18** — 데이터 무결성 구조 개혁 (단일 집계 aggregation.js + Import Audit + validateDataIntegrity). ⚠ 이때 Vite 캐시로 changelog 누락 사고 → 이후 빌드 전 `rm -rf node_modules/.vite dist` 필수
- **v3.17.10** — 수주 집계 ProMES 전용 + AccountModal 수동입력 영구 비활성화 (manual 데이터 사고 대응)
- **v3.17.x** — ProMES 전환, GAP 분석, 점수 체계(사양서 v1.0), MyTasks 페이지, 관리자 viewAsRep

---

## ⚠ 핵심 주의사항 (사고 재발 방지)

1. **빌드 전 캐시 비우기**: `rm -rf node_modules/.vite dist` (안 하면 changelog 등 변경 누락)
2. **빌드 후 검증**: `grep "version:\`v3.XX\`" dist/assets/index-*.js`로 의도 변경 확인
3. **배포 후 검증**: `curl -s https://bioprotech-account-crm.web.app/` 새 hash 확인
4. **배포는 사용자 컨펌 후에만**
5. **담당자 집계는 account.sales_rep 기준** (본부장 입력해도 그 고객 담당자로)
6. **실적은 source whitelist** (ProMES + 영업현황만, manual 제외) — aggregation.js
7. **누락 없이 모두 처리** 후 컨펌 — "5개만 하고 배포" 금지

---

## 🚀 다음 작업 후보 (미완/논의)

### ⭐ 계약전환율 대시보드 (사용자 요청 — 2026-05-25, 우선순위 높음)
- **금년 영업 TASK = 계약전환율 높이기** (영업본부장 핵심 지표)
- **계약전환 인정 기준 (둘 중 하나면 전환 완료)**:
  1. 연간 계약액 포함된 **계약서 입력** (price_contracts — 정식 계약)
  2. 계약 불가 시 **"연간 FCST 협의"한 고객** (forecasts에 연간 FCST 등록 = 전환으로 인정)
- **대시보드 표시 (강력한 메시지)**:
  - 담당자별: 담당 고객 N개 중 → 전환 X개 / 미달 (N-X)개
  - 예: "Iris 고객 10개 중 계약전환 2개 (20%), 미달 8개"
  - 전환율 시각화 + 미달 고객이 명확히 드러나게
- 구현 시 검토: 전환 판정 로직 (계약서 OR 연간FCST), 담당자=account.sales_rep 기준, 미달 고객 리스트(클릭→카드)

### 예측 일관성 (논의됨, 권장안 도출)
- 차월 파이프라인 ① reorderSoon(알람10) → 전체 사업계획/FCST 차월분으로 통일 → 3개월 예측 M+1과 금액 일치
- 품목 미래예측은 "연말 누적 전망(YTD+미래, 품목축)"으로 역할 명확화 (다른 숫자 정상)

### 기타
- 입력 검증/누락 경고 (FCST·크로스셀링 예상일자·품목·금액 미입력 시 경고) — 예측 정확도 개선

---

*계정 이관(Claude 구독 변경) 대비 갱신 — 2026-05-25*
