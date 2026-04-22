# Account CRM — 프로젝트 컨텍스트

> Claude Code 세션 시작 시 이 파일을 먼저 읽어 프로젝트 전체 맥락을 파악하세요.
> 상세 변경 이력: [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) 참조
> 최종 업데이트: 2026-04-20 (v2.8)

---

## 📋 프로젝트 정보

| 항목 | 내용 |
|---|---|
| 프로젝트명 | Bio Protech Account CRM (기존고객 관리) |
| 운영 URL | https://bioprotech-account-crm.web.app |
| Firebase | bioprotech-crm (Pipeline CRM과 DB 공유, 컬렉션 분리) |
| 기술 스택 | React 19 + Vite + Firebase Firestore + Firebase Storage |
| 색상 | Green (#2e7d32) |
| 저장소 | https://github.com/Bioprotech/account-CRM-.git |
| 관리자 비밀번호 | `1208` |
| 위치 | `C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm\` |

---

## 🎯 이 시스템의 목적

**Pipeline CRM**이 신규 딜 발굴·클로징 도구라면,  
**Account CRM**은 이미 거래 중인 고객과의 관계를 깊게 유지하고 재구매·업셀링을 관리.

### 핵심 철학
- 단순 수주 활동을 넘어 고객의 Pain & Needs 이해
- 고객 정보 깊이를 수치화 (Intelligence Score)
- 트렌드 기반 자동 알람으로 선제적 영업 액션 유도

---

## 🏗 아키텍처 개요

### 주요 화면 (사이드바 네비게이션)
1. **📊 대시보드** — KPI + 알람 + 고객 분류별 YTD 진도 + Open 이슈
2. **🏢 고객 목록** — 필터 (지역/품목/담당자/사업형태/Score/전략등급)
3. **📈 수주목표관리** — 월별·담당별·고객별 수주 현황 매트릭스
4. **📋 종합 리포트** — 주간/월간 리포트 (팀별 블록 구조 + 사업부별)
5. **📊 진도관리** — 사업계획 vs 실적
6. **📖 유형가이드** — 고객 유형별 비즈 프로세스
7. **⚙️ 설정** — Import, 팀멤버 관리, 스냅샷 등
8. **📝 업데이트 내역** — 버전별 릴리스 노트

### 고객 상세카드 (7탭)
1. **기본정보** — 회사명/국가/지역/사업형태/담당자/Key Contacts
2. **고객분석 (Insight)** — Intelligence Score 6카테고리 + 전략등급(A/B/C/D) + 컨텍스트 메모
3. **F-up 이력 (Activity Log)** — 12종 이슈 유형, priority(🟢일반/🟡주요/🔴긴급), 상태 추적
4. **계약·가격 (PriceContract)** — 제품별 단가/결제조건/계약만료
5. **스코어링** — 7항목 체크리스트
6. **업데이트** — 수정 이력
7. **📎 첨부파일** — Firebase Storage 연동

---

## 🗂 데이터 모델 (Firestore 컬렉션)

| 컬렉션 | 역할 |
|---|---|
| `accounts` | 고객 기본정보 + Intelligence Score + 전략등급 |
| `activity_logs` | F-up 로그 (issue_type, priority, status, next_action) |
| `order_history` | 수주 데이터 (영업현황 O시트, 오더일 기준) |
| `sales_history` | 매출 데이터 (영업현황 S시트, B/L Date 기준) — **v2.5 신설** |
| `price_contracts` | 가격·계약 조건 (contract_qty 포함) |
| `forecasts` | FCST 예측 (Track A: 고객제공 / Track B: 트렌드분석) |
| `business_plans` | 사업계획 (type: customer / product / team_sales) |
| `app_settings` | 앱 전체 설정 (teamMembers, priorYearCustomers 등) |
| `account_snapshots` | 백업 스냅샷 |

---

## 👥 담당자 / 팀 체계

### 팀멤버
- Iris, Rebecca, Ian, Wendy, Dana, 김지희, Haksu (관리자)

### 영업팀 (사업계획 기준)
- **해외영업** (사업부: 해외)
- **영업지원** (사업부: BPU)
- **국내영업** (사업부: 국내, 직판 포함)

### 고객 자동 분류 (v2.7~v2.8, 중앙화)
- `customerClassification.js` + `salesReps.js`에서 중앙 관리
- **사업계획 담당자 + teamMembers만** 유효 담당자로 인정
- 사업계획 외 고객은 자동 버킷:
  - **국내기타** (전년도 수주 有, 국내)
  - **해외기타** (전년도 수주 有, 해외)
  - **국내신규** (전년도 수주 無, 국내)
  - **해외신규** (전년도 수주 無, 해외)

---

## 🔑 핵심 기능 요약

### 영업현황 Excel Import
- **O시트 (수주)**: 고객명/오더일/수주금액 → `order_history`
- **S시트 (매출)**: 고객사/B/L Date/매출금액 → `sales_history`
- 자동 고객 매칭 + 신규 고객 자동 생성

### 사업계획 Excel Import
- **고객별 시트**: 월별 수주 목표 → `type: 'customer'`
- **품목별 시트**: 월별 품목 목표 → `type: 'product'`
- **월별매출 시트**: 사업부별(해외/BPU/국내) 월별 매출 목표 → `type: 'team_sales'` (v2.5)

### 주간 리포트 (v2.8)
- 주차 네비게이터
- KPI: 금주수주 / 금주활동 / Open이슈 / **MTD 달성률** (v2.6에서 YTD→MTD)
- 분기별 진행 현황 (Q1~Q4, 완료/진행중/예정)
- **■ 1. 수주 현황** — 해외/BPU/국내 3사업부 (region fallback, '기타' 제거)
- **■ 1-2. 매출 현황** — 3사업부, B/L Date 기준
- **■ 1-3. 담당자별 당월 실적** — 사업계획 담당자 + 4개 버킷 (토글 드릴다운)
- **■ [팀별 통합 블록]** (해외/BPU/국내 각각):
  - 📊 금주 활동
  - 🔴 주요 이슈 (Activity Log priority ≥ 주요, 자동 집계)
  - ⏳ Open 이슈 (고객 단위 그룹핑 + P1/P2/P3 자동 우선순위 + 토글)
  - 📅 차주 계획 (다음주 due + 금주 미완료 이월)
  - ⚠ 리스크 (재구매 임박 + 계약만료 D-60 + 14일+ 미해결)

### 월간 리포트 (v2.3~v2.7)
- 월 네비게이터 (기본: 직전 완료 월)
- KPI 4카드 (수주/매출 × MTD/YTD, 달성률 + 전년비)
- 전년동기 대비 비교 표 (증감액/증감률)
- 섹션 A (Executive Summary, 수동 입력, localStorage)
- 섹션 B-1 월별 수주 추이표 (12개월)
- 섹션 B-1-2 월별 매출 추이표 (B/L Date 기준)
- 섹션 B-2 팀별 월간 수주 실적
- 섹션 B-2-2 팀별 월간 매출
- 섹션 C 팀별 월간 활동 분석 (Activity/신규계약/Cross-selling/미해결/컨택)
- 섹션 D 주요 거래처 상위 10사
- 섹션 D-2 고객별 당월 실적 (목표 있는 모든 고객, 달성률 낮은 순)
- **섹션 4-3 고객별 GAP 심층 분석** (미달 TOP10 + 초과 TOP5, 고객카드 전체 맥락 통합)
  - FCST Catch-up 자동 코멘트
- 섹션 E 다음 달 계획 (수동 입력 + 재구매 D-30 + 계약만료 D-60)

### 재구매 알람 3유형 (v2.4~)
- 🔵 FCST 기반 (고객 입력)
- 🟢 사업계획 기반 (targets[MM])
- 🟡 트렌드 기반 (가중평균 주문주기)

### Activity Log 중요도 (v2.8)
- 🟢 일반 / 🟡 주요 / 🔴 긴급
- 주요이슈 자동 집계 기준: priority ≥ 2
- 주→월 보고 자연 연결

---

## 📁 핵심 파일

### Context / State
- `src/context/AccountContext.jsx` — 전역 상태 (accounts, logs, orders, sales, contracts, forecasts, businessPlans, alarms)

### 핵심 유틸리티 (v2.7 중앙화)
- `src/lib/customerClassification.js` — classifyCustomers, classifyForRepView, aggregateByRep
- `src/lib/salesReps.js` — getValidSalesReps (사업계획 + teamMembers만)
- `src/lib/constants.js` — ISSUE_TYPES, ISSUE_PRIORITIES, SALES_TEAMS, REGIONS, SCORE_CATEGORIES
- `src/lib/changelog.js` — 앱 내 업데이트 이력

### Views
- `src/views/Dashboard.jsx` — 대시보드
- `src/views/Report.jsx` — 주간/월간 리포트 (약 3000줄)
- `src/views/OrderReport.jsx` — 수주목표관리 매트릭스
- `src/views/Settings.jsx` — Import, 팀 관리, 스냅샷
- `src/views/ProgressView.jsx`, `TypeGuide.jsx`, `ChangelogView.jsx`

### AccountModal 탭
- `src/components/AccountModal/BasicInfo.jsx`
- `src/components/AccountModal/CustomerInsight.jsx` (전략등급 + 6 카테고리)
- `src/components/AccountModal/ActivityLog.jsx` (priority 필드 포함)
- `src/components/AccountModal/GapAnalysis.jsx` (원인/상세/대책 필드)
- `src/components/AccountModal/PriceContract.jsx`
- `src/components/AccountModal/ForecastTrend.jsx`
- `src/components/AccountModal/CrossSelling.jsx`

---

## 🚀 환경 & 배포

### Windows 환경
- **Node.js**: v24.14.0 (`C:\Program Files\nodejs\`)
- **셸**: PowerShell (bash 문법 불가)

### 개발
```powershell
cd "C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm"
npm run dev   # http://localhost:5174
```

### 배포 (PowerShell에서 실행)
```powershell
cd "C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm"
npm run build
npx firebase deploy --only hosting
```

---

## 📏 작업 규칙 (수정 후 반드시 이행)

1. **배포**: `npm run build` → `npx firebase deploy --only hosting`
2. **changelog.js**: 최상단에 새 버전 항목 추가
3. **DEVELOPMENT_LOG.md**: 표 마지막에 날짜별 내역 추가
4. **Git**: commit + push (`git add`, `git commit -m "…"`, `git push`)
5. **MEMORY.md**: 중대한 아키텍처/버전 변경 시 갱신

상세 절차: [WORKFLOW.md](./WORKFLOW.md) 참조

---

## 🔗 연관 프로젝트

- **Pipeline CRM** (신규 딜 발굴): `../../bioprotech-crm/`
  - URL: https://bioprotech-crm.web.app
  - Firebase: 동일 (`bioprotech-crm`), `customers` 컬렉션 사용
  - 색상: Blue vs Account CRM Green

---

## 📊 참조 Excel 파일

| 파일 | 용도 |
|---|---|
| `영업현황_2026.xlsm` | O시트(수주) + S시트(매출) Import 원본 |
| `2026년 영업 사업계획_v10_담당자배정.xlsx` | 사업계획 Import (월별매출 시트에 매출 목표 有) |
| `26년 수주목표_월별_담당별_고객별.xlsx` | 고객별 수주 목표 (매출 목표 없음) |
| `Fannin 현황분석.xlsx` | Intelligence Score 체크리스트 기준 |

---

*작성일: 2026-04-20*  
*세션 시작 시 참고: 이 파일 + [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) + [WORKFLOW.md](./WORKFLOW.md)*
