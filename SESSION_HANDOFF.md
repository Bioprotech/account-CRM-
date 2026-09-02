# Session Handoff — Account CRM

> **새 Claude Code 세션 시작 시 이 문서를 먼저 읽으세요.**
> 빠른 컨텍스트 회복용. 작업 규칙은 `CLAUDE.md`, 상세 이력은 `DEVELOPMENT_LOG.md` 참조.

**최종 갱신**: 2026-09-02 (v3.48 빌드 완료 — FCST 관리 루프, 배포 대기)

---

## 🎯 현재 상태

- **운영 버전(라이브)**: v3.47 (배포 완료)
- **빌드 완료(미배포)**: v3.48 (index-BdEgqJHZ.js) — 사용자 컨펌 후 배포
- **GitHub**: https://github.com/Bioprotech/account-CRM-.git
- **Firebase 프로젝트**: bioprotech-crm (Pipeline CRM과 공유)

---

## 🆕 v3.47 변경 (2026-08-06 — GAP 분석 7종 개선)

- **[OrderReport.jsx] ① GAP 계산 개선** — FCST가 확정수주로 전환된 달은 GAP에서 FCST 제외. effectiveFcst 컬럼 추가.
- **[BasicInfo.jsx / Dashboard.jsx] ② 담당자 복원 방지** — rep_locked 플래그. 관리자 직접 변경 시 잠금, 동기화 제외.
- **[MyTasks.jsx] ③ 팀 필터 버그** — repTeam 다수결 방식(전체 계정 집계)으로 수정.
- **[Dashboard.jsx] ④ 주간 활동 현황판** — 이번 주 완료 활동 + 차주 예정 액션 카드 추가.
- **[Report.jsx] ⑤ 월간보고 4-3/4-4 재편** — 초과달성(4-3) / 미달(4-4) 분리 섹션.
- **[GapAnalysis.jsx] ⑥ GAP 원인 이력 누적** — "이번 달 분석 저장" 버튼 + gap_cause_history 배열 + 이력 뷰.
- **[Report.jsx] ⑦ 전체 F-up 활동 이력** — 월간보고에 ■3-1 사업부별 전체 고객 활동 이력 뷰 추가.

---

## 🆕 v3.37 변경 (2026-06-09 — 보고서 개선 + 수주현황 분석)

**사용자 요청**: "내용은 쓸데없이 많은데 정작 무슨 얘기를 하고자 하는 것인지 불명확" 지적 대응

- **[Report.jsx] 결론 헤드라인 배너** (Page 1 최상단)
  - 상태 아이콘(🟢🟡🔴) + ■0 핵심 메시지(미입력 시 자동 요약) + KPI 3종
  - 회의 시 첫 화면에서 결론 즉시 파악
- **[Report.jsx] Page 2 섹션 접기/펼치기**
  - ■2-3 담당자별 / ■8 품목별 / ■9 대륙별 — 기본값: 접힘
- **[Dashboard.jsx] OrderAnalysisCard** (전 담당자 열람 가능)
  - 해외 계획고객 / 해외신규기타 / 국내 계획고객 / 국내기타신규 / BPU
  - 연간계획 / YTD계획 / YTD실적 / 달성률 / 전년YTD / 계획대비 / 전년대비

---

## 🆕 v3.35~36 이전 변경 요약

- **v3.36** (2026-05-31) — 주간보고 ■1-5 다음달 수주/매출 예상
- **v3.35** (2026-05-31 — Import 중복 재발 근본 해결

**v3.22에서 Firestore 레벨 중복(delete 실패 → 2배 저장)을 차단했으나 React state 레벨 중복이 잔존:**

- `batchSaveOrders/batchSaveSales` 완료 후 `onSnapshot`이 전체 state를 REPLACE 함
- 이후 `setOrders(prev => [...prev, ...newOrders])`가 중복 append → 2배 표시
- **수정 위치**: `AccountContext.jsx` `importOrders` (line ~387) / `importSales` (line ~447)
- **수정 내용**: ID Set 기반 dedup — `prev`에 이미 있는 ID는 `toAdd`에서 제외
- 어느 타이밍에도 중복 불가 (onSnapshot 먼저 오면 no-op, 나중이면 optimistic update)

---

## 📌 직전 주요 버전 흐름 (계정 이관 후 신규 세션 작업분)

- **v3.37** (2026-06-09) — 월간보고 개선 + 수주현황 분석 대시보드 (이번)
- **v3.36** (2026-05-31) — 주간보고 ■1-5 다음달 수주/매출 예상
- **v3.35** (2026-05-31) — Import React state 중복 경쟁조건 해결
- **v3.34** (2026-05-28) — 보고서 인사이트: Loss Reason / Activity ROI / FCST 정확도 / Health Score
- **v3.33** (2026-05-26) — i18n: KO/EN 토글, AM 운영 메뉴 영문화 (중국 법인 지원)
- **v3.32** (2026-05-26) — 계약전환율 KPI (Dashboard) + 거래종료(inactive) 고객 분류
- **v3.31** (2026-05-26) — 팀 공통: `team_activities` / `team_projects` Firestore 신규
- **v3.30** (2026-05-26) — 주간 분기별 진행현황 사업부(해외/BPU/국내) breakdown
- **v3.29** (2026-05-25) — 미래 예측 정리: 차월 파이프라인 제거 + 품목 예측 공식 보정
- **v3.28** (2026-05-25) — 품목별 미래예측 크로스셀링 탭 누락 수정
- **v3.27** (2026-05-25) — 주간 분기별 진행현황 매출 추가
- **v3.26** (2026-05-25) — 주간 ■1-4 사업계획 외(신규/기타) 포함
- **v3.25** (2026-05-25) — 주간 고객별 수주목표 진행 현황 신규
- **v3.24** (2026-05-25) — GAP 분석 완전 일원화 (중복 섹션 제거)
- **v3.23** (2026-05-25) — 설정창 정리 접이식 + PromesBackfillTool 제거
- **v3.22** (2026-05-25) — import 중복 방지 Firestore 레벨 (delete 실패 시 저장 중단)
- **v3.18** — 데이터 무결성 구조 개혁 (단일 집계 aggregation.js + Import Audit). ⚠ Vite 캐시 사고 → 이후 빌드 전 캐시 비우기 필수

---

## ⚠ 핵심 주의사항 (사고 재발 방지)

1. **빌드 전 캐시 비우기**: PowerShell — `Remove-Item -Recurse -Force node_modules/.vite, dist`
2. **빌드 후 검증**: 새 hash 확인 + 버전 문자열 grep
3. **배포 후 검증**: 라이브 index.html의 JS hash 확인
4. **배포는 사용자 컨펌 후에만**
5. **담당자 집계는 account.sales_rep 기준** (본부장 입력해도 그 고객 담당자로)
6. **실적은 source whitelist** (ProMES + 영업현황만, manual 제외) — aggregation.js
7. **누락 없이 모두 처리** 후 컨펌 — "5개만 하고 배포" 금지

---

## 🚀 다음 작업 후보

- **CRM 보완 명세서 잔여**: ⑤ 마진/공헌이익 (ERP/BOM source 결정 필요), ③④는 Pipeline CRM 영역
- **수주현황 분석 고도화**: Dashboard OrderAnalysisCard — BPU 분류 정확도 확인 (실제 데이터로 검토)
- **i18n 잔여**: AccountModal inline placeholder / alert 메시지 (선택)
- **거래종료 고객 시각적 구분** in AccountList (선택)

---

*갱신 — 2026-05-31 (v3.35 Import 중복 React state 경쟁조건 근본 해결)*
