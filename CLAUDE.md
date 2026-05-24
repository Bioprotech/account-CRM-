# CLAUDE.md — Account CRM 프로젝트 지침 (새 Claude 자동 로드)

> 이 파일은 Claude Code가 세션 시작 시 **자동으로 읽습니다**.
> 계정·PC가 바뀌어도 이 파일 + git 저장소만 있으면 작업을 이어갈 수 있습니다.
> 상세 컨텍스트는 `PROJECT_CONTEXT.md`, 작업 절차는 `WORKFLOW.md`,
> 직전 작업 상태는 `SESSION_HANDOFF.md`, 전체 이력은 `DEVELOPMENT_LOG.md` 참조.

---

## 🏢 프로젝트 개요

- **이름**: Bio Protech Account CRM (기존고객 관리)
- **운영 URL**: https://bioprotech-account-crm.web.app
- **GitHub**: https://github.com/Bioprotech/account-CRM-.git
- **로컬 경로**: `C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm\`
- **기술 스택**: React 19 + Vite + Firebase Firestore + Custom CSS
- **색상 테마**: Green (#2e7d32) — 자매 앱 Pipeline CRM(Blue)과 구분
- **현재 버전**: v3.21 (changelog.js 최상단 항목이 항상 현재 버전)

> 자매 앱: **Pipeline CRM** (신규 딜 발굴) — `C:\Users\haksu\OneDrive\Claude Cowork\bioprotech-crm\`
> 두 앱 모두 Firebase 프로젝트 `bioprotech-crm` 공유 (컬렉션 분리).

---

## 🖥 개발 환경

- **OS**: Windows · **셸**: PowerShell (bash 문법 불가 — `&&` 대신 `;`, 등)
- **Node.js**: v24.x (`C:\Program Files\nodejs\`)
- **관리자 비밀번호**: `1208` (앱 로그인)
- **담당자**: Iris, Rebecca, Ian, Wendy, Dana, 김지희, Haksu(관리자/본부장)
- **지역 7개 (영문)**: N.America / Latin America / Europe / Asia / Middle East / Africa / CIS

---

## 📏 필수 작업 절차 (코드 수정 후 반드시 이행)

1. **빌드**: `npm run build` — ⚠ **반드시 먼저 `rm -rf node_modules/.vite dist`** (Vite 캐시가 changelog 등 변경을 누락시킨 사고 있었음 — v3.18)
2. **빌드 검증**: 빌드된 `dist/assets/index-*.js`에 의도한 변경(예: 새 버전 문자열)이 포함됐는지 grep으로 확인
3. **배포**: `npx firebase deploy --only hosting` — ⚠ **사용자 명시적 컨펌 후에만 배포**
4. **라이브 검증**: `curl -s https://bioprotech-account-crm.web.app/` 로 새 JS hash 서빙 확인
5. **changelog.js**: `src/lib/changelog.js` 최상단에 새 버전 항목 추가 (앱 "📝 업데이트 내역" 메뉴에 표시)
6. **DEVELOPMENT_LOG.md**: 날짜별 변경사항 한 줄 추가
7. **Git commit + push**: 상세 메시지 + 원격 반영
8. **SESSION_HANDOFF.md 갱신**: 현재 상태 최신화

> 사용자가 여러 차례 강조: "10개 요청하면 5개만 하고 배포하지 말 것."
> 작업을 단계별로 나눠 **각 단계마다 빌드 검증**하고, **누락 없이** 모두 처리한 뒤 컨펌받아 배포.

---

## ⚠️⚠️ 절대 규칙 1 — 담당자 분류 (반복 강조됨)

영업현황/ProMES 데이터에는 사업계획과 무관한 비유효 담당자가 섞여 있음.
리포트·대시보드 집계에서 `transaction.sales_rep`을 그대로 쓰면 안 됨.

1. 유효 담당자 = **사업계획 담당자 ∪ teamMembers** — 그 외 절대 제외
   → `src/lib/salesReps.js`의 `getValidSalesReps()` 사용
2. 담당자별 집계 시 → `src/lib/customerClassification.js`의 `classifyForRepView()` 사용
   - 사업계획 매칭 → plan.sales_rep
   - 사업계획 外 + 전년 수주 有 → **국내기타 / 해외기타** 버킷
   - 사업계획 外 + 전년 수주 無 → **국내신규 / 해외신규** 버킷
3. **금지 패턴**: `o.sales_rep || '기타'`, `p.sales_rep || o.sales_rep`
4. **집계는 그 고객 담당자(account.sales_rep) 기준** — 본부장(Haksu)이 입력/수정해도
   그 고객 담당자로 카운팅 (본부장이 집계에 나타나면 안 됨)
   → Report.jsx `resolveActivityRep()`, scoring.js `isActivityForRep()`

---

## ⚠️⚠️ 절대 규칙 2 — 실적 데이터 source whitelist (v3.18~)

수주/매출은 **ProMES Excel import만이 정답**. 다른 경로(수동 입력 등)는 집계 제외.

- **단일 집계 모듈**: `src/lib/aggregation.js`
  - `filterValidOrders(orders)` / `filterValidSales(sales)` — 모든 화면이 이것만 호출
  - 허용 수주 source: `excel_import_promes_O` + `excel_import_영업현황` (legacy 과도기)
  - 허용 매출 source: `excel_import_promes_S` + `excel_import_영업현황_S`
  - `manual` 등 그 외 source는 보고서/대시보드/진도관리/MyTasks에서 **영구 제외**
- 적용 화면: Report.jsx, Dashboard.jsx, Progress.jsx, OrderReport.jsx, MyTasks.jsx
- AccountModal 수주이력 탭의 [수동 입력] 버튼은 v3.17.10에서 영구 제거됨
- **데이터 무결성 대시보드**: Settings 최상단 (`validateDataIntegrity()` 5종 자동 검사 + Import Audit Log)

---

## 🗄 데이터 모델

Firestore 컬렉션 (`bioprotech-crm` 프로젝트):
- **accounts** — 고객 (customer_category로 명시 분류: 해외고객/국내고객/해외기타/국내기타/해외신규/국내신규)
- **order_history** — 수주 (ProMES O시트, `order_date` 기준)
- **sales_history** — 매출 (ProMES S시트, `sale_date` = B/L Date 기준)
- **activity_logs** — F-up 이력 (priority, recovery_plan_*, cross_dept_share)
- **price_contracts** — 계약·가격 (delivery_schedule 분할발주)
- **forecasts** — FCST
- **business_plans** — 사업계획 (type: customer / product / team_sales)
- **team_tasks** — 팀별 월간 TASK (year_month, team, priority, status)
- **app_settings** — 경영진 수동 입력 (exec_summary, next_month_plan, weekly_forecast, auto_summary_override 등 월/주차별 키)
- **import_audit_logs** — ProMES import 시점 raw 합계 불변 원장 (v3.18)
- **customers** — Pipeline CRM (read-only 구독, 하이브리드)

ProMES 데이터: 월 단위 집계, dedupe key = `year-month-account_id-product_code`,
order_date는 `YYYY-MM-01`로 정규화 (주차 분리 불가 — 월 단위 운영).

---

## 🧩 핵심 파일

| 파일 | 역할 |
|---|---|
| `src/context/AccountContext.jsx` | 전역 상태 + Firestore 구독/저장 |
| `src/views/Report.jsx` | 주간/월간 리포트 (가장 크고 복잡 — 6000줄+) |
| `src/views/Dashboard.jsx` | 대시보드 + 담당자 활동 점수 |
| `src/views/Settings.jsx` | 설정 + ProMES Import + 무결성 대시보드 + 각종 정리 도구 |
| `src/views/OrderReport.jsx` | 수주목표관리 |
| `src/views/Progress.jsx` | 진도관리 |
| `src/views/MyTasks.jsx` | 내 업무 (team_tasks + Open이슈 + 차주액션 + GAP) |
| `src/lib/aggregation.js` | ⭐ 단일 집계 모듈 (source whitelist) |
| `src/lib/scoring.js` | 담당자 점수 (100점, computeScore({rep,...,yearMonth})) |
| `src/lib/salesReps.js` | getValidSalesReps |
| `src/lib/customerClassification.js` | classifyForRepView / aggregateByRep |
| `src/lib/changelog.js` | 버전 이력 (최상단 = 현재 버전) |
| `src/lib/firebase.js` | Firestore CRUD |
| `src/components/AccountModal/` | 고객 카드 7탭 |

---

## 📋 월간 리포트 구조 (v3.21 기준, Report.jsx)

- **Page 1** (a·b): 자동 Executive Summary(수정가능) + 이번달 핵심요약 + 실적
- **Page 2** (c): Key Metrics — ■1 월별(분기/반기 소계) · ■2 팀별(9컬럼) · ■2-3 담당자별 · ■4-2 고객별 · ■8 품목별 · ■9 대륙별
- **Page 3** (d·e): ■3 팀별 활동(상세) · ■4-3 고객별 GAP 심층 + 4-3b 원인별(한 카드)
- **Page 4** (f·g·h·i): ■5 다음달 계획+TASK · ■5-1 차월 파이프라인(6-source) · ■5-2 3개월 예측 · ■5-3 기회 파이프라인(모든 미래 cross_selling)
- **Page 5** (j·k): ■9-2 품목 미래예측 · ■7 Pipeline CRM(빈 카드 hide) · 담당자 활동점수

주간 리포트: ■1 수주현황 / ■1-2 매출현황 (각 예측 입력 컬럼) + 팀별 통합 블록.

---

## 🚀 세션 시작 체크리스트

1. 이 `CLAUDE.md` + `SESSION_HANDOFF.md` 읽기 (현재 상태 파악)
2. `git status` + `git log --oneline -10` 확인
3. 작업 전 `npm install` (node_modules 없으면)
4. 코드 수정 → 위 "필수 작업 절차" 8단계 준수
5. **배포는 사용자 컨펌 후에만**

---

*이 파일은 계정 이관(Claude 구독 변경)을 위해 작성됨 — 2026-05-20*
