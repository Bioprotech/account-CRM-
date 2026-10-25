# Session Handoff — Account CRM

> **새 Claude Code 세션 시작 시 이 문서를 먼저 읽으세요.**
> 빠른 컨텍스트 회복용. 작업 규칙은 `CLAUDE.md`, 상세 이력은 `DEVELOPMENT_LOG.md` 참조.

**최종 갱신**: 2026-10-25 (v3.52 배포 완료 — Phase 1 라이브)

---

## 🎯 현재 상태

- **운영 버전(라이브)**: v3.52 (E1 입찰태그·현황판 · M6 TeamProjects · M2 원인분석 — 2026-10-25 배포)
- **빌드 파일**: index-aSwYRHGy.js
- **GitHub**: https://github.com/Bioprotech/account-CRM-.git
- **Firebase 프로젝트**: bioprotech-crm

---

## 🆕 v3.52 변경 (2026-10-25 — Phase 1)

### E1: 입찰 태그 + 현황판
- `ActivityLog.jsx` — INITIAL_LOG에 `is_tender`, `tender_info` 추가
- `ActivityLog.jsx` — 입찰 체크박스 + 조건부 서브필드(기관/품목/수량/단가/금액/결과발표일/상태) 폼 추가
- `ActivityLog.jsx` — 타임라인 입찰 배지 + 세부정보 블록
- `src/views/TenderView.jsx` — 신규 파일. 전체 입찰 현황 테이블 + KPI 요약 (전체/낙찰/진행중/낙찰률)
- `Sidebar.jsx` — 입찰 현황 메뉴 추가 (경쟁사 가격 위)
- `App.jsx` — TenderView 라우팅
- `i18n.js` — menu.tenders 한/영 추가

### M6: TeamProjects 보완
- `TeamProjects.jsx` — blankProject()에 `mid_long_term_goal`, `monthly_progress`, `deliverables` 추가
- 모달에 중장기(3년) 목표 textarea, 2026년 월별 진도 ●/◎/X 인터랙티브, 산출물 리스트 추가

### M2: 4단계 원인분석 컴포넌트
- `src/components/CauseCountermeasure.jsx` — 신규 파일. ①현황 ②현황분석 ③문제점/근본원인 ④대책 4단계 UI. `isCCComplete()` helper export.
- `GapAnalysis.jsx` — CauseCountermeasure 임포트 + root_cause 필드 + 이번달 저장 시 root_cause 포함

---

## 📋 다음 할 일 (Phase 2, 3, 4)

### Phase 2 (다음 세션)
- **M4**: 전략 분석 노트 (5 테마 × 4 블록), 새 컬렉션 `strategy_notes`
- **M5**: 목표 미달 매트릭스 — 지역×고객×월, 드롭다운+필수상세입력, `gap_reasons` 컬렉션
- **M7**: Cross-Selling 전사 뷰 — 기존 CrossSelling.jsx 데이터 집계, `cs_targets` 컬렉션

### Phase 3
- **M1**: DT2(수정) 시트 파서 → Settings.jsx import → `type: 'product_customer'`; ProductReport.jsx 확장

### Phase 4 (데이터 축적 후)
- **M8**: 신규 ReportNew.jsx (10섹션) 생성; 기존 Report.jsx 유지

---

## ⚠️ 절대 규칙 (항상 준수)

1. `classifyForRepView()` 사용 — `o.sales_rep` 직접 사용 절대 금지
2. `filterValidOrders()` / `filterValidSales()` 사용 필수
3. 배포는 사용자 명시 컨펌 후에만
4. 빌드 전 `node_modules/.vite` + `dist` 제거 필수
5. 작업 전 계획 수립 → 사용자 공유 → 실행 순서
