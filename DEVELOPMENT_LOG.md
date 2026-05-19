# Account CRM 개발 이력

> 이 문서는 Account CRM의 개발 과정을 자동으로 기록합니다.
> 최종 업데이트: 2026-04-17

---

## 프로젝트 정보

| 항목 | 내용 |
|---|---|
| 프로젝트명 | Bio Protech Account CRM |
| 운영 URL | https://bioprotech-account-crm.web.app |
| Firebase 프로젝트 | bioprotech-crm (파이프라인 CRM과 공유) |
| 기술 스택 | React 19 + Vite + Firebase Firestore + Custom CSS |
| 색상 테마 | Green (#2e7d32) — 파이프라인 CRM(Blue)과 구분 |

---

## Phase 1 — 기본 구축 (완료)

### 핵심 기능
- 고객 목록 + 필터 (지역/품목/담당자/사업형태/Score)
- 고객 상세카드 9탭: 기본정보, Insight, Activity, 수주이력, GAP분석, 가격계약, FCST, 크로스셀링, 유형가이드
- Intelligence Score 6개 카테고리 체크리스트 (28항목, 가중치 합산 0~100%)
- Activity Log 타임라인 (이슈유형 12종 + 상태 관리)
- 대시보드 (KPI + 알람 + Open 이슈 + 긴급 관리 대상)

### 데이터 모델
- `accounts` — 고객 기본정보 + Intelligence Score 내장
- `activity_logs` — 활동 로그
- `orders` — 수주 이력
- `contracts` — 가격/계약 정보
- `forecasts` — Forecast 데이터
- `business_plans` — 사업계획 (월별 목표)

---

## Phase 2 — 고도화 (완료)

### 2-1. 수주이력 관리 (OrderHistory)
- 수주 등록/수정/삭제
- Excel 일괄 import (SheetJS)
- 연도별 필터, 합계 자동 계산

### 2-2. GAP 분석 (GapAnalysis)
- 사업계획 대비 Gap 자동 계산
- Gap 원인 태깅 (8개 원인 분류)
- 기회 파이프라인 (6개 유형 + 확률 + 가중금액)
- 액션플랜 관리 (체크리스트형)
- 예산 사이클 / 다음 발주 예측

### 2-3. 가격/계약 관리 (PriceContract)
- 제품별 단가, 결제조건, 계약기간 관리
- 계약수량(총 볼륨) + 계약금액(단가×수량) 자동 계산
- MOQ(1회 최소 주문)와 계약수량(전체 볼륨) 분리 관리
- 계약 만료 알람 (D-30, D-60)
- 조건 변경 이력 (단가/수량/결제조건 변경 추적)

### 2-4. Forecast 관리 (ForecastTrend)
- 분기/월별 예측 등록
- FCST vs Actual 비교

### 2-5. 크로스셀링 (CrossSelling)
- 크로스셀링 기회 등록/관리
- 파이프라인 상태 (미접촉→제안중→샘플진행→수주완료)
- 예상/실제 수주금액 추적

### 2-6. 유형가이드 (TypeGuide)
- 고객 유형별(OEM/Private/Multi/Single/입찰/가격민감) 전략 가이드
- 유형별 체크리스트 관리
- 체크리스트 미완료 알람

### 2-7. 진도관리 (Progress)
- 사업계획 Excel import
- 월별/분기별 진도 추적
- 담당자별/품목별/고객별 달성률

---

## Phase 3 — 리포트 & 보고서 기능 (완료)

### 3-1. 종합 리포트 (Report.jsx)
**주간 리포트 구성:**
1. Executive Summary KPI (금주수주/활동/이슈/YTD달성률)
2. 금주 수주 현황 테이블
3. 금주 활동 요약 (담당자별 컨택/수주활동/크로스셀링)
4. 사업계획 YTD 진도
5. 시각적 차트: 담당자별 YTD 달성률 바차트 + 품목별 도넛차트
6. 담당자별 연간 달성 진도 프로그레스바
7. 분류별 실적 상세 (담당자/품목/지역/사업구분/고객유형)
8. Open 이슈 Top 10 + 기한 초과 이슈

**월간 리포트 구성:**
1. 월간 실적 Summary KPI (당월/YTD 목표·실적·달성률)
2. 시각적 차트: 담당자별 당월·YTD 바차트 (2열)
3. 도넛차트: 품목별·지역별 당월 실적 비중 (2열)
4. 담당자별 연간 달성 진도 프로그레스바
5. 분류별 실적 상세 테이블
6. 고객별 당월 실적
7. Cross-Selling 현황 (파이프라인 + Top 기회)
8. FCST vs Actual (당분기)
9. 심층 Gap 분석:
   - Gap 원인 분석 (원인별 카드 + 영향금액)
   - 고객별 심층분석 (Gap 상위 고객 + 미비정보 + 액션플랜)
   - 기회 파이프라인 (유형별 요약 + 상세)
   - AM별 활동 품질 지표

### 3-2. Excel 다운로드
**주간 Excel:**
- Executive Summary + 수주현황 + 활동요약 + YTD진도 + 분류별실적 + 이슈목록

**월간 Excel (다중 시트):**
- 월간리포트 (실적Summary + 분류별 + 고객별)
- 크로스셀링 시트
- FCST vs Actual 시트
- Gap 원인·고객분석 시트
- 기회 파이프라인 시트
- AM 활동 품질 시트

### 3-3. 인쇄 기능
- 인쇄 버튼 → 브라우저 `window.print()` 호출
- `@media print` CSS: 사이드바/버튼 숨김, 테이블 전체 표시, 페이지 나눔 최적화
- 인쇄 시 "Bio Protech 영업본부 주간/월간 리포트" 헤더 자동 표시

### 3-4. 시각적 차트 컴포넌트 (Charts.jsx)
- `HBarChart` — 수평 바 차트 (목표 vs 실적, 달성률 색상)
- `DonutChart` — SVG 도넛 차트 (비중 분포 + 범례)
- `ProgressBars` — 진행률 바 (실적/목표 + % 표시)
- 외부 라이브러리 없이 순수 SVG + CSS 구현

---

## Phase 3b — 고객카드 Excel Export (완료)

### 기능
- AccountModal 하단 "Excel 다운로드" 버튼
- 고객 전체 데이터를 다중 시트 Excel로 다운로드

### Excel 시트 구성
| 시트 | 내용 |
|---|---|
| 기본정보 | 회사명, 국가, 지역, 담당자, 제품군, Key Contacts |
| Intelligence Score | 6개 카테고리별 항목 + 입력값 |
| 활동로그 | 전체 활동 이력 (날짜, 유형, 상태, 내용, 다음액션) |
| 수주이력 | 오더 내역 + 합계 |
| GAP분석 | 원인, 기회 파이프라인, 액션플랜 |
| 가격계약 | 단가, 결제조건, 계약기간 |
| FCST | Forecast 데이터 (있을 경우) |
| 크로스셀링 | 크로스셀링 기회 (있을 경우) |

---

## Phase 4 — 담당자별 대시보드 (완료)

### 기능
- 로그인한 담당자는 **본인 담당 고객** 데이터만 대시보드에 표시
- 관리자(Admin)는 전체 데이터 확인 가능
- 파이프라인 CRM과 동일한 방식

### 필터링 대상
| 데이터 | 필터 기준 |
|---|---|
| KPI (고객수, Score, 활동, 이슈) | 본인 고객만 |
| 알람 | 본인 고객 관련만 |
| Open 이슈 | 본인 고객 관련만 |
| 수주(orders) | 본인 고객 수주만 |
| 사업계획(plans) | 본인 담당 계획만 |
| 지역별/담당자별/사업구분별/품목별 통계 | 필터된 데이터 기준 |

### UI 변경
- 일반 사용자: "👤 {이름}님의 대시보드 — 담당 고객 기준 데이터" 배너 표시
- KPI 라벨: "전체 고객" → "내 고객" (일반 사용자)

---

## Phase 5 — 담당자 관리 & 고객 마스터 동기화 (완료)

### 5-1. 담당자 관리 UI (Settings.jsx)
- 담당자 추가/수정/삭제 기능
- 수정 시 해당 담당자에게 배정된 고객의 sales_rep도 일괄 변경
- 삭제 시 배정 고객 수 경고 확인
- 배정 고객 수 실시간 표시
- localStorage에 영속 저장 (`TEAM_STORAGE_KEY`)
- 로그인 화면, 필터, 고객카드 담당자 선택 등 모든 UI에 동적 반영

### 5-2. 팀 멤버 동적 관리 (Context 전환)
- 기존: `constants.js`의 `TEAM_MEMBERS` 하드코딩 배열
- 변경: `AccountContext`에서 `teamMembers` 상태로 관리
- `App.jsx` 로그인 화면 — 동적 사용자 목록
- `AccountList.jsx` 담당자 필터 — 동적 목록
- `BasicInfo.jsx` 담당자 선택 — 동적 목록
- `Report.jsx` 리포트 담당자별 통계 — 동적 목록

### 5-3. 고객 마스터 일괄 동기화 (Settings.jsx)
- 사업계획 데이터 기준으로 CRM 고객 마스터 동기화
- **누락 고객 자동 생성**: 사업계획에 있으나 CRM에 없는 고객 → 자동 생성
- **메타데이터 업데이트**: 담당자(sales_rep), 지역(region), 사업형태(business_type), 국가(country) 일괄 반영
- **사업계획 재연결**: 미연결 사업계획의 account_id 자동 매핑
- 미리보기: KPI 카드(신규/업데이트/일치) + 상세 변경 내역 테이블

---

## Phase 6 — 데이터 스냅샷 백업/복원 (완료)

### 기능
- 현재 **전체 데이터(6개 컬렉션)**를 Firestore에 스냅샷으로 저장
- 저장되는 데이터: accounts, activityLogs, orders, contracts, forecasts, businessPlans
- 스냅샷 목록에서 특정 시점으로 **복원** 가능
- 복원 시 Firestore + localStorage 동시 교체
- 삭제 확인, 복원 확인(2단계) 안전장치

### 파일
- `src/lib/snapshots.js` — Firestore `account_snapshots` 컬렉션 CRUD
- `src/lib/firebase.js` — `uploadAllData()`, `clearAllData()` 추가
- `src/context/AccountContext.jsx` — `restoreSnapshot()` 추가
- `src/views/Settings.jsx` — `SnapshotSection` UI 컴포넌트

### 사용 시나리오
- 대량 import/동기화 전 백업 → 문제 시 복원
- 버전 관리: 주요 작업 전후 스냅샷으로 이력 추적

---

## Phase 7 — 고객 5분류 체계 + 신규매출 관리 (완료)

### 분류 체계
| 구분 | 조건 |
|---|---|
| **기존 고객** | 사업계획에 포함된 비병원 고객 (개별 목표 vs 실적) |
| **대학병원** | 고객명에 병원/의료원 포함 → 목표+실적 합산 1행 (직판팀 매출) |
| **해외기타** | 계획 외 + 전년도 이력 有 + 해외 (계획 외 기존 해외 고객) |
| **국내기타** | 계획 외 + 전년도 이력 有 + 국내 비병원 (대리점 매출) |
| **신규** | 전년도 이력 無 + 올해 첫 수주 |

### 파일
- `src/lib/customerClassification.js` — NEW, 분류 로직 + 전년도 고객 목록 저장/로드
- `src/views/Dashboard.jsx` — 분류별 목표/실적 요약 테이블 + 상세 보기
- `src/views/Settings.jsx` — 영업현황 import 시 전년도 고객 자동 추출/저장

### 동작 방식
- 영업현황 Excel import 시 전년도(2025) 수주 고객 목록을 자동 추출 → localStorage 저장
- Dashboard에서 사업계획 + 수주 데이터 + 전년도 목록을 조합하여 5개 카테고리로 분류
- 사업계획 내 버킷 카테고리 자동 인식: "해외기타"→해외기타, "직판영업"→대학병원, "국내 신규"→신규, "국내 기타"→국내기타
- 대학병원: 직판영업 목표 + 병원명 고객 실적 합산 → 1행 표시
- 해외기타/국내기타/신규: 각각 사업계획 버킷 목표 + 계획 외 실적 표시 (목표 + 달성률)
- 모든 분류의 고객 목록 클릭 시 해당 고객 카드로 이동

---

## 인프라 & 배포

### Firebase 구성
- 프로젝트: `bioprotech-crm` (파이프라인 CRM과 공유)
- Hosting 사이트: `bioprotech-account-crm` → https://bioprotech-account-crm.web.app
- Firestore 컬렉션: accounts, activity_logs, orders, contracts, forecasts, business_plans

### 배포 방법
```
cd "C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm"
npm run build
npx firebase deploy --only hosting
```

### 색상 테마 (Green)
파이프라인 CRM(Blue)과 구분하기 위해 Green 테마 적용:
- `--accent: #2e7d32` / `--accent2: #558b2f`
- `--bg: #f6f8f5` / `--bg3: #eef2ec`
- `--text: #1b2e1b` / `--text2: #4a5e4a`

---

## 유형가이드 (TypeGuideView.jsx)

별도 전체 페이지로 구성 (사이드바 메뉴):
1. 6개 유형 선택 카드 (OEM/Private/Multi/Single/입찰/가격민감)
2. 전체 비교표 (핵심목표/전략/주의사항)
3. Intelligence Score 카테고리별 질문 가이드 (6카테고리 × 질문목록)
4. GAP 원인별 대응 가이드 (8원인 × 확인사항 + 대응방안)
5. 유형 선택 시 상세 가이드 (정의/특성/목표/전략/리스크/프로세스/체크리스트)

---

## 알람 시스템

### 자동 알람 유형
| 유형 | 조건 | 레벨 |
|---|---|---|
| Score+미접촉 | Score <50% + 30일 미접촉 | danger |
| 정보 미입력 | Score 0% + 사업계획 고객 | info |
| 계약 만료 | D-30 이내 | danger/warning |
| 재구매 임박 | 가중평균/FCST 기반 D-30 | danger/warning |
| Open 이슈 | 14일 초과 | warning |
| 유형별 맞춤 | OEM QBR, Single F-up, Multi 리오더 등 | warning/info |
| 체크리스트 | 유형별 체크리스트 30% 미만 | info |

### 재구매 예측 로직
- 가중 평균: 최근 gap에 높은 가중치 (2x 최근, 1.5x 그 다음)
- 계절성 보정: 2년+ 데이터, 현재 분기 과거 주문 없으면 스킵
- FCST 우선: Forecast 데이터가 있으면 FCST 기반, 트렌드와 차이 표시

---

## 파일 구조

```
account-crm/src/
├── App.jsx                          # 메인 앱 + 라우팅
├── index.css                        # 전체 스타일 (Green 테마 + 차트 + 인쇄)
├── context/
│   └── AccountContext.jsx           # 전역 상태 + Firebase 연동
├── lib/
│   ├── firebase.js                  # Firebase 설정
│   ├── constants.js                 # 상수 (팀원, 지역, 제품, Score카테고리, GAP원인 등)
│   ├── changelog.js                 # 버전 변경내역 + 업데이트 팝업 데이터
│   └── utils.js                     # 유틸리티 함수
├── components/
│   ├── Sidebar.jsx                  # 사이드바
│   ├── Topbar.jsx                   # 상단바
│   ├── Charts.jsx                   # 시각 차트 (HBarChart, DonutChart, ProgressBars)
│   └── AccountModal/
│       ├── AccountModal.jsx         # 고객 상세 모달 (9탭 + Excel export)
│       ├── BasicInfo.jsx            # 기본정보 + 전략등급 + 컨텍스트 메모
│       ├── IntelligenceScore.jsx    # Intelligence Score (레거시, Insight에 통합)
│       ├── ActivityLog.jsx          # Activity Log
│       ├── OrderHistory.jsx         # 수주이력
│       ├── GapAnalysis.jsx          # GAP 분석
│       ├── PriceContract.jsx        # 가격/계약
│       ├── ForecastTrend.jsx        # FCST
│       ├── CustomerInsight.jsx       # Customer Insight 통합 (Score 6카테고리 + 건강도/공급자/결정구조 + 자동감지)
│       ├── CrossSelling.jsx         # 크로스셀링
│       └── TypeGuide.jsx            # 유형가이드 (카드 내)
└── views/
    ├── Dashboard.jsx                # 대시보드
    ├── AccountList.jsx              # 고객 목록
    ├── Report.jsx                   # 종합 리포트 (주간/월간 + 차트 + Excel + 인쇄)
    ├── Progress.jsx                 # 진도관리
    ├── TypeGuideView.jsx            # 유형가이드 (전체 페이지)
    └── Settings.jsx                 # 설정
```

---

## 배포 이력

| 날짜 | 내용 |
|---|---|
| 2026-04-04 | Phase 1~2 초기 배포 (GitHub Pages) |
| 2026-04-05 | Firebase Hosting 전환 (bioprotech-account-crm.web.app) |
| 2026-04-05 | 유형가이드 전체 페이지 추가 |
| 2026-04-05 | Green 테마 적용 + 모바일 반응형 수정 |
| 2026-04-05 | 고객카드 Excel Export 기능 추가 |
| 2026-04-05 | 리포트 Excel 강화 (심층 Gap분석 시트 추가) |
| 2026-04-05 | 리포트 시각화 차트 추가 (바차트, 도넛, 프로그레스바) |
| 2026-04-05 | 인쇄 기능 추가 (@media print CSS) |
| 2026-04-05 | 담당자별 대시보드 필터링 (로그인 사용자 기준 데이터 표시) |
| 2026-04-05 | 담당자 동기화 도구 추가 (사업계획 → 고객카드 sales_rep 일괄 반영) |
| 2026-04-05 | 담당자 관리 UI 추가 (추가/수정/삭제 + 동적 반영) |
| 2026-04-05 | 고객 마스터 일괄 동기화 도구 (누락 고객 자동 생성 + 메타데이터 업데이트) |
| 2026-04-05 | 팀 멤버 동적 관리 (constants → Context 전환, localStorage 영속) |
| 2026-04-06 | 데이터 스냅샷 백업/복원 기능 추가 (Firestore account_snapshots 컬렉션) |
| 2026-04-07 | 사업계획 중복 정리 (604.9억 → 321.1억), 고객 5분류 체계 구현 |
| 2026-04-07 | 대시보드 분류별 YTD 진도 테이블 (기존/대학병원/해외기타/국내기타/신규) |
| 2026-04-07 | 분류 로직 개선: 사업계획 버킷(해외기타/직판영업/국내신규/국내기타) 목표 반영 |
| 2026-04-07 | 분류별 고객 클릭 → 고객카드 네비게이션 추가 |
| 2026-04-13 | Firestore 보안 규칙 만료 수정 (allow read, write: if true) |
| 2026-04-13 | 관리자 로그인 비밀번호 인증 (1208) — Pipeline CRM과 동일 방식 |
| 2026-04-13 | 팀멤버/전년도고객 목록 Firestore 동기화 (localStorage→Firestore 전환) |
| 2026-04-13 | FCST 탭 월별 입력으로 변경 (분기별→월별, 기존 분기 데이터 호환) |
| 2026-04-13 | 수주목표관리 리포트 뷰 신규 추가 (목표/확정수주/FCST 월별 테이블) |
| 2026-04-13 | 리포트 FCST 인라인 편집 (셀 클릭→직접 입력/수정, Firestore 실시간 반영) |
| 2026-04-13 | 리포트 KPI 카드 (연간목표/확정수주/잔여FCST/달성률/예상달성률) |
| 2026-04-13 | 리포트 Q1~Q4 분기 전환, 담당자 필터, 고객카드 연결 |
| 2026-04-13 | 가격·계약 탭: 계약수량(contract_qty) + 계약금액(contract_amount) 자동계산 추가 |
| 2026-04-13 | Customer Insight 탭 신규 추가 (비즈니스 건강도/공급자 지위/구매결정 구조) |
| 2026-04-13 | 전략 등급(A/B/C/D) 필드 + 현재 컨텍스트 메모 추가 (기본정보 탭) |
| 2026-04-13 | 고객 목록: 전략등급 컬럼 + 필터 추가 |
| 2026-04-13 | 대시보드: 전략등급별 분포 카드 + D등급(Watch) 알람 섹션 추가 |
| 2026-04-13 | Customer Insight 통합: Score 6카테고리를 Insight 탭으로 통합, Score 탭 제거 |
| 2026-04-13 | 자동 감지: 기본정보/가격계약 데이터 → Insight 진척률 자동 반영 |
| 2026-04-13 | Watch 알람 확장: D등급 + 진척률 30% 미만 고객 알람 통합 |
| 2026-04-13 | 업데이트 알림 팝업: 새 버전 배포 시 변경 내역 자동 표시 (changelog.js) |
| 2026-04-13 | 고객 목록/대시보드: Intelligence Score → Insight 라벨 변경 |
| 2026-04-16 | 통화 KRW 통일: FCST/수주실적 모두 원화(억/만) 표시로 변경 (USD→KRW) |
| 2026-04-16 | 수주목표관리: GAP 컬럼 추가 (목표 - 확정수주 - FCST), 월별/분기/연간 |
| 2026-04-16 | 대시보드: 계약 체결 현황 모니터링 (GREEN/YELLOW/RED 3단계) |
| 2026-04-16 | 대시보드: 목표 미달 고객 경고 (확정+FCST < 목표 GAP 표시) |
| 2026-04-16 | 수주목표관리: 담당자 필터를 팀멤버 기준으로 정리 |
| 2026-04-16 | 사이드바에 업데이트 내역 메뉴 추가 (버전 배지 표시) |
| 2026-04-16 | 계약수량 persistence 버그 수정 (undefined 값 → Firestore 저장 실패 방지) |
| 2026-04-16 | 리포트: AM별 활동지표/담당자별 실적에서 불필요한 담당자 제거 (teamMembers 기준) |
| 2026-04-16 | 종합 리포트 섹션 A: 팀별 수주 현황 테이블 (해외/BPU/국내 × 전주누적/금주/당월/목표/달성률) |
| 2026-04-16 | 주차 네비게이터 추가 (◀이전 주 / 다음 주▶, N월 N주차 라벨) |
| 2026-04-16 | 종합 리포트 섹션 B: 주간 이슈사항 자동 집계 (영업이슈/고객지원/품질이슈/기타 × 팀별) |
| 2026-04-16 | 종합 리포트 섹션 C: 다음 주 예정 액션 + 재구매 임박 고객 D-14 자동 표시 |
| 2026-04-16 | Excel Export: 주간종합 시트 스펙 기반 재구성 (섹션 A/B/C + 부록, 파일명 규격화) |
| 2026-04-17 | 월간 리포트 스펙 재구성: 월 네비게이터 + 섹션 A(Executive Summary 수동입력, localStorage) |
| 2026-04-17 | 월간 리포트 섹션 B: 12개월 추이표(전년실적/목표/실적/전년대비/목표대비) + 팀별 실적 |
| 2026-04-17 | 월간 리포트 섹션 C: 팀별 Activity/신규계약/Cross-selling/미해결/컨택 KPI + 주요이슈 TOP5 |
| 2026-04-17 | 월간 리포트 섹션 D: 주요 거래처별 상위 10사 (당월/전월/증감률) |
| 2026-04-17 | 월간 리포트 섹션 E: 다음달 계획 수동 입력 + 재구매 D-30 + 계약만료 D-60 자동 |
| 2026-04-17 | 월간 Excel Export 2시트: 매출-수주 Raw(값) + 월간종합_(MM월) 스펙 레이아웃 |
| 2026-04-17 | 주간 KPI YTD→MTD 전환 + 분기별 진행 현황(Q1~Q4) 테이블 추가 |
| 2026-04-17 | 담당자 활동 요약: 배정 고객수 컬럼 + 컨택율 + 활동 0명 담당자도 포함 표시 |
| 2026-04-17 | 다음 주 예정 액션: 금주 미완료 이슈 자동 이월 (이월 배지 + 경과일 표시) |
| 2026-04-17 | PDF 인쇄: #app 100vh 제한 해제, 페이지별 테이블 헤더 반복, 섹션 break 정책 |
| 2026-04-17 | 재구매 알람 3유형 구분: FCST🔵/사업계획🟢/트렌드🟡 독립 표시 + 사업계획 신규 로직 |
| 2026-04-17 | 매출 데이터 Import(S sheet, B/L date 기준) + sales_history 컬렉션 신설 |
| 2026-04-17 | 주간/월간 리포트 매출 섹션: 팀별 매출 현황 + 월별 매출 추이표 추가 |
| 2026-04-17 | S시트 컬럼 매핑 수정: 고객사/매출금액/B/L Date (기존 O시트 동일구조 가정 오류 수정) |
| 2026-04-17 | 사업계획 매출 목표 Import 추가: 월별매출 시트의 사업부별(해외/BPU/국내) 파싱 + team_sales plan 타입 신설 |
| 2026-04-17 | 리포트 매출 현황: 3개 사업부(해외/BPU/국내 직판포함) 기준, 팀별 매출 목표 대비 달성률 표시 |
| 2026-04-18 | 공통 유틸리티 중앙화 — customerClassification 확장(classifyForRepView, aggregateByRep), salesReps.js 신설 |
| 2026-04-18 | 월간 리포트 KPI 4종 카드 추가 (수주/매출 × MTD/YTD, 달성률 + 전년비) |
| 2026-04-18 | 월간 리포트 전년동기 대비 비교 표 (증감액/증감률, MTD+YTD) |
| 2026-04-18 | 월간 리포트 고객별 당월 실적 표 — 목표 설정된 모든 고객, 달성률 낮은 순 |
| 2026-04-18 | 당월 분류별 실적 정렬 변경 (연간목표순 → 당월달성률순) |
| 2026-04-18 | 담당자별 실적 테이블 재구성 — 사업계획+teamMembers만 + 국내기타/해외기타/국내신규/해외신규 버킷 자동 분류 |
| 2026-04-18 | 신규/기타 토글 드릴다운 UI — ▸ 클릭 시 고객 리스트 표시 (주간+월간 리포트) |
| 2026-04-18 | 대시보드 + OrderReport 담당자 분류 규칙 통합 (시스템 전체 일관성) |
| 2026-04-18 | GAP 분석 탭 개선 — 대책 필드 추가 (부족분 만회계획) + 초과/미달 자동 배지 |
| 2026-04-18 | 월간 리포트 섹션 4-3: 고객별 GAP 심층 분석 (미달 TOP10 + 초과 TOP5) |
| 2026-04-18 | GAP 심층 분석에 고객카드 전체 맥락 통합 (Insight, Activity, 계약, FCST, 전년비, Cross-selling) |
| 2026-04-18 | FCST Catch-up 자동 코멘트 — 향후 FCST가 YTD Gap 만회 시 "N월까지 회복 예상" 자동 생성 |
| 2026-04-20 | 주간 수주·매출 "기타" 행 제거 (region fallback), 3사업부만 표시 |
| 2026-04-20 | 주간 리포트 간소화: YTD 진도·차트·고객유형별 제거, MTD 기준 통일 |
| 2026-04-20 | ActivityLog priority 필드 추가 (🟢일반/🟡주요/🔴긴급) + 입력·수정 UI + 배지 표시 |
| 2026-04-20 | 주간 리포트 팀별 통합 블록 신규 — 금주활동·주요이슈·Open이슈·차주계획·리스크 |
| 2026-04-20 | Open 이슈 고객 단위 그룹핑 + P1/P2/P3 자동 우선순위 + 토글 드릴다운 |
| 2026-04-20 | 주간 Excel Export: 팀별 블록 구조로 재구성 |
| 2026-04-20 | 🚨 분류별 실적 상세 - 담당자별 완전 수정: monthlyData.repMonthRows + planSummary.byRep 모두 classifyForRepView 강제 |
| 2026-04-20 | 매출목표 Import 강화: 여러 후보 시트 자동 탐색, 빈 시트 경고 + 권장 파일명 안내 |
| 2026-04-20 | ⚠️ 담당자 분류 절대 규칙 문서화: customerClassification.js 주석 + WORKFLOW.md + MEMORY.md (재발 방지) |
| 2026-04-20 | 💰 매출 목표 Fallback 로직: team_sales 없으면 customerPlans 수주목표 자동 사용 (주간+월간 모두) |
| 2026-04-20 | UI 투명성: Fallback 사용 시 "수주목표 기반 대체" 라벨 표시 (사업부별 매출 Import 안내) |
| 2026-04-20 | 🐛 매출 목표 Import 단위 버그 수정 (×1000 제거) — 사업계획 Excel 값은 이미 원 단위 |
| 2026-04-20 | Import 완료 토스트에 매출목표 연간 금액 명시 + 미추출 시 "수주목표 기반 대체" 안내 |
| 2026-04-20 | 🎯 매출 목표 시트 우선순위 변경: 26년도 월별수주매출S_* 시트 최우선 (해외 215.6억, 사용자 기준값) |
| 2026-04-20 | "국내" 행 중복 합산 버그 수정 — Excel 레이아웃 중복 행 자동 스킵 (첫 행만 사용) |
| 2026-04-20 | 🐛 사업계획 Import 버그 수정: 고객별 시트 없어도 매출 목표만 Import 가능하게 로직 재설계 |
| 2026-04-20 | 🔐 Type별 plan 교체 로직: 매출 목표 Import 시 기존 수주 목표 삭제 방지 (중대 버그) |
| 2026-04-20 | 🚨 근본 원인 수정: customerPlans 필터(!== 'product')에 team_sales 섞여 수주=매출 동일 출력 — 14개 파일 일괄 수정 |
| 2026-04-23 | 📊 v3.1 Phase A 월간/주간 리포트 간소화: #3 팀별 매출 제거, #5 Top10 제거, #6 달성률 높은순, #9 상세분석 제거, #10 고객유형별 제거, #12 액션실행률 제거 |
| 2026-04-23 | 🎯 v3.2 Phase B 경영진 스토리텔링: #1 자동 Exec Summary, #7 GAP 요약박스, #4 팀별 GAP 통합, #8 차월 수주 파이프라인 (신뢰도 가중 P1/P2/P3), 레거시 Section 1~5 전면 제거, Firebase team_tasks/pipeline 인프라 추가 |
| 2026-04-24 | 🏆 v3.3 Phase C 월간 리포트 재구성: #13 5페이지 스토리텔링 (Chapter Header + 인쇄 페이지 구분), #14 팀별 월간 TASK CRUD (5유형 프리셋 + 자유입력 + 우선순위/상태), #15 Pipeline CRM 하이브리드 (신규 딜 하이라이트 + 가중금액) |
| 2026-04-24 | 🏗️ v3.4 localStorage 의존 근본 제거: (1) 대용량 STORAGE_KEY 백업 완전 제거 → quota 초과 흰 화면 방지 (2) Exec Summary / 다음 달 계획 app_settings Firestore 이전 (500ms 디바운싱 + 자동 localStorage 마이그레이션) (3) Import excelDateToStr 강화 + "전체 연도" 옵션 재적용 |
| 2026-04-25 | 📅 v3.4.1 Import 연도 다중 체크박스 선택: 당해+전년도 기본 자동 체크 (2025+2026), 원하는 연도만 Import 가능 — 경영 리포트 필요 데이터만 최적화 |
| 2026-04-25 | ✎ v3.5 Activity Log 전면 개편: (1) 활동 발생일 사용자 입력 (이전: today() 자동 고정 → 리포트 왜곡) (2) 폼 필드 재배치 — 기한을 다음 액션과 짝으로 묶음 (3) 편집 기능 추가 — 본인 로그/관리자 (4) 수정 이력 자동 기록 + 카드에 N회 수정 배지 (5) 완료 시 처리결과 팝업 (필수 설명 + 해결방법 8종 태그 + 실제 해결일) |
| 2026-04-25 | 🐛 v3.5.1 수주/매출 Import 버그 수정: (1) React state 기반 삭제 → Firestore source 기반 query 삭제로 변경 (어제 잔여 데이터까지 정리) (2) deleteDoc 순차 → writeBatch 500건 일괄 (속도 25배 향상, 10,000건 = 40초) (3) 명확한 진행 토스트 (기존 N건 삭제 → 신규 M건 표시) |
| 2026-04-27 | 🔍 v3.6 고객명 퍼지 매칭 분석기 (Dry-run): 사업계획 ↔ 영업현황 통합 점검. lib/fuzzyMatch.js (정규화+Levenshtein+Jaccard 종합), Settings에 분석 섹션 추가 (신뢰도 임계값 조정 가능, 매칭 후보·실패 리스트, 매칭 시 사업계획 실적 보강 효과 미리보기). 데이터 변경 없는 안전 분석. Phase 2(매칭 적용)는 결과 검증 후. |
| 2026-04-29 | 💾 v3.6.1 퍼지 매칭 Phase 2 (적용): 체크박스 선택 (90%+ 자동 체크, 70-89% 수동), 빠른 선택 버튼 (전체/90%+/해제), AccountContext.applyFuzzyMatches 함수 (사업계획 plan들의 account_id 일괄 연결, batchSave). Report 통계 즉시 정확화. account 통합/삭제 없는 안전 적용. |
| 2026-04-29 | 🔬 v3.7 정합성 진단 도구 (Settings.ReconciliationDiagnostic): "수주 104% vs Gap -9.1억" 모순 분해. 사업계획 Target/Actual 분해 (일반 plan vs 버킷 plan), GAP 임계값 분류 (전체 미달/초과 vs Top N 표시 부분합 명시), 합계 차이 자동 표시. 연도/기간 선택. |
| 2026-04-29 | 📐 v3.7.1 GAP 분석 misleading 표시 수정: gapDeepAnalysis가 Top10/Top5만 합산하여 "Net Gap"으로 misleading 표시했던 버그. allShortfall/allSurplus + 합계, normalCount(90~110%) 추가. UI 라벨 명시 (전체 vs Top), Executive Summary 자동 메시지도 전체 기준 사용. |
| 2026-04-29 | 📊 v3.8 분류 표 일관성 + 합계 행: MonthlyBreakdownTable에 합계 추가, ■2-3 담당자별에서 4개 버킷(국내/해외 기타·신규) 제거 (사업계획 매칭 담당자만), ■4-2 고객별에 4개 버킷 그룹 + 전체 합계 행 추가 (데이터 일관성 즉시 검증 가능). |
| 2026-04-29 | 🔗 v3.8.1 ■2-3 ↔ ■4-2 매칭 통일: classifyTxRep에 account_id 매칭 우선 (퍼지매칭 결과 활용), monthlyByCustomer에도 account_id 매칭 추가, monthTarget=0인 plan도 ytdActual 있으면 포함. 두 표 합계 일치 보장. |
| 2026-04-29 | 🌏 v3.9 분류 로직 시스템 전체 일관 적용: isDomestic 강력화 (한글명/병원 → 무조건 국내, region "Asia"여도 무시) — 고대안산병원 등 한국 병원이 해외기타 분류되던 버그 수정. classifyForRepView에 planByAccountId 옵션 내장. classifyCustomers에서 hospital 카테고리 폐지 → 국내기타로 통합. Report/Dashboard 모든 사용처 새 시그니처 적용. |
| 2026-04-30 | 🔗 v3.10 Account 합병 도구: Settings.AccountMergeTool — 회사명 검색 → primary/secondary 라디오 → 미리보기 → 합병 실행. AccountContext.mergeAccounts 함수 (orders/sales/logs/contracts/forecasts/plans 모두 secondary→primary로 이전 후 secondary 삭제). 중복 account 통합 (예: AMBIDERM + AMBIDERM Guatemala). |
| 2026-04-30 | 🛡 v3.11 Alias 시스템 — 합병 후 재import 영구 보호: mergeAccounts가 secondary.company_name + 기존 aliases를 primary.aliases 배열에 자동 합병. Settings import 로직에 aliases 매칭 추가 (handleFileSelect/handleImport). BasicInfo에 별칭 편집 UI (칩 형태 + Enter 추가/× 삭제). |
| 2026-04-30 | 🏷️ v3.12 명시적 고객 분류 (customer_category) — 매일 수정 종료: 7가지 카테고리 (해외/국내고객, 해외/국내기타, 해외/국내신규, 미분류). suggestCustomerCategory 자동 추천 함수. classifyForRepView 매칭 우선순위 변경 (① customer_category 명시 → ② account_id → ③ name → ④ 자동). BasicInfo에 분류 select + 자동추천 적용 버튼. Settings.BulkClassificationTool — 일괄 자동 분석 + 적용 도구. 한 번 적용으로 분류 영구 안정화. |
| 2026-05-09 | 🆕 v3.13 ProMES 영업통계 Import — 새 데이터 소스 연결: 영업현황_2026.xlsm 갱신 종료 → ProMES "원본 Excel" (수주.xlsx + 매출.xlsx 분리) 도입. Settings.PromesImportTool 신규 컴포넌트 (시트 "원본 데이터" 자동 감지, 헤더 매퍼). Account 매칭 3단계: external_code(거래처코드) → company_name+alias → 신규 자동 생성 (코드 자동 저장). dedupe 키 변경 (year-month-account_id-product_code). 일자 정규화 (YYYY-MM-01) + order_month/sale_month/year/quarter/count 필드 추가. 금액 0원 자동 제외. mapRegion에 ProMES 표기(M.E, L.America) 추가. source: excel_import_promes_O / excel_import_promes_S. 영업담당 컬럼 부재 영향 없음 (classifyForRepView가 plan/account 기반). 기존 영업현황 import은 Legacy 표시로 보존. |
| 2026-05-09 | 🗑 v3.13.1 영업현황 Import UI 제거 + Legacy 데이터 정리 도구: ProMES 단일 소스 전환 → 기존 영업현황 Import 카드 dead code 처리. Settings.LegacyDataCleanupTool 신규 (excel_import_영업현황 / _S source 일괄 삭제, importOrders/importSales 빈 배열 호출로 source 기반 wipe). 정리 완료 시 카드 자동으로 사라짐. 사용 흐름: ProMES Import → Legacy 데이터 일괄 삭제 → 단일 소스 운영. |
| 2026-05-11 | 📅 v3.14 ProMES Delta 추적 — 주간 리포트 정상화: ProMES 월 단위 집계로 인한 주간 리포트 0건 문제 해결. transaction에 imports[]={date, amount, delta} 배열 도입 — 매 import 시점의 누적 amount와 직전 대비 delta 보관. 주간 리포트는 그 주의 import entry delta만 합산하여 "그 주 신규 수주" 산출. Report.jsx에 expandWeeklyTransactions 헬퍼 + 주간 섹션 4곳 적용 (weeklyData/sectionAData). PromesImportTool 개선 (imports[] 자동 누적 + 같은 날 재import 시 마지막 entry 갱신). PromesBackfillTool 신규 (기존 ProMES 데이터에 imports[0] 1회 채움, 백필 후 자동 숨김). 월간/연간 리포트 영향 없음 (order_amount=마지막 누적). |
| 2026-05-11 | 🟢 v3.14.1 일반 활동 펼치기 토글 + 팀 분류 버그 수정: (1) 주간 리포트 teamBlocksData에 normalActivities 배열 추가 (priority < 2 활동 별도 수집), 팀 블록 UI에 "🟢 일반 활동 N건 보기" 토글 추가 — 25건 활동 중 일부만 리스트 표시되던 문제 해결. Excel 다운로드도 일반 활동 섹션 자동 포함. (2) getTeamForAccount / getTeamForAccountLocal 버그 수정 — fallback이 region === "한국"만 체크해서 분당서울대 등 한국 병원이 region 정보 부정확 시 해외영업으로 빠지던 문제. isDomestic() 사용 (한글명/병원 키워드/한국 region/country 통합) → 통일된 국내 판단. |
| 2026-05-11 | ⏬ v3.14.2 ProMES Baseline 재설정 — 주간 수주 비정상 부풀림 해결: v3.14 백필이 모든 ProMES 누적을 한 날 delta로 attribute → 한 주에 824.3억 등 비현실적 부풀림. 해결: imports[0]을 Baseline (delta=0, _baseline:true)로 변경 — 누적 amount는 보존하되 주간 분석에선 제외. PromesBackfillTool → "ProMES Baseline 재설정"으로 강화: 항상 표시 (재실행 가능), 기준일 직접 선택 (default: 전년 12/31), 모든 ProMES imports[] 강제 재설정. 다음 ProMES Import 시 baseline 대비 정확한 delta 추적 시작. |
| 2026-05-11 | 🔧 v3.14.3 월간 누적/MTD 달성률 핫픽스 + 롤백 옵션: v3.14 baseline 적용 후 monthCum이 0이 되는 핵심 버그 수정 (monthCum = prevCum + thisWeek로 계산 → 둘 다 expand delta → baseline=0). 해결: monthCum은 monthOrders/monthSales 직접 합산(누적 amount), thisWeek는 expand delta, prevCum = monthCum - thisWeek 자동 일관성. MTD 달성률·사업계획 대비 실적 정상화. PromesBackfillTool에 "⏎ imports[] 완전 제거 (롤백)" 옵션 추가 — v3.14 이전 상태로 복원 가능 (안전망). |
| 2026-05-11 | 🐛 v3.14.4 weeklyData가 weekOffset 무시하던 버그 수정: weeklyData useMemo가 getWeekRange() 호출 → 항상 현재 주만 반환. dependency에 weekOffset 없음. 수정: getWeekRangeByOffset(weekOffset) + dependency 추가. Open 이슈는 모든 미해결 누적이라 주차 무관(정상). |
| 2026-05-11 | 📈 v3.15 진도율 (YTD vs 사업계획 누적) + Dashboard UI 개선: (1) computeYtdProgress 헬퍼 + YtdProgressBadge 컴포넌트 — "1~현재월 사업계획 누적 vs 실적" 기반 진도. 🟢정상(≥100%)/🟡주의(80-100%)/🔴위험(<80%) + Shortage 표시. (2) Dashboard 4개 통계 카드 (지역/담당자/사업/품목)에 YTD 목표·진도·Shortage 컬럼 추가, regionStats/repStats/bizTypeStats/productStats에 ytdTarget 합산. (3) 알람 카드 전체 스크롤 + 6가지 트리거 조건 헤더 표기 + danger→warning→info 우선순위 정렬. (4) Open 이슈/긴급관리/Watch/목표미달 헤더에 N건+조건 명기, 목표미달은 총 GAP 금액 포함. (5) 주간 리포트 KPI 5개로 확장 — "📈 YTD 진도" 카드 신규 (sectionAData.ytdOrder* 필드 추가). (6) 월간 리포트 YTD KPI 카드 라벨 변경 + 진도 status + Shortage 표시. |
| 2026-05-11 | 🔧 v3.15.1 Dashboard UX 복원 + 목표미달 로직 수정 + 주간 수주 제거: (1) Dashboard 5개 카드(알람/Open이슈/긴급관리/Watch/목표미달) 원래 형태(상위 N + "▼ 전체 보기" 펼치기 토글)로 복원 — 사용자 피드백. (2) 목표미달 로직 핵심 버그 수정: 기존엔 연간 목표 - 실적 - FCST (5월 시점에 연말까지 부족분이라 비현실적) → YTD 목표(1~현재월 사업계획 누적) - YTD 실적 기준으로 변경. 사용자가 보고한 "69사 GAP 204억" 비정상 사례 해결. (3) 주간 리포트 주간 수주 표시 제거 (사용자 요청 — ProMES 월 단위 집계라 매주 import 안 하면 의미 없음): KPI 카드 "금주 수주" 제거(4개로 축소), 사업부 표(수주/매출)에서 "전주 누적"/"금주 신규" 컬럼 제거, 당월 누적/목표/달성률만 표시. Baseline 도구는 정상 작동 확인. |
| 2026-05-11 | 🧹 v3.15.2 옵션 B 채택 — Baseline·imports[] 로직 모두 제거, 월 단위 운영: 사용자가 매주 ProMES Import 부담 우려 → 월 단위 운영으로 단순화 결정. (1) Settings: ⏬ ProMES Baseline 재설정 도구 렌더 제거 (PromesBackfillTool 함수는 dead code로 남음). (2) PromesImportTool: imports[] 자동 누적 / buildImportsArray / existingPromesOrdersById 인덱스 / 2nd pass 코드 모두 제거. (3) Report.jsx: expandWeeklyTransactions 헬퍼 호출 4곳을 일자 기반 필터로 복원 (weekOrders, thisWeekOrders, prevWeekOrders, thisWeekSales, prevWeekSales). 기존 Firestore의 imports[] 필드는 무해 (사용 안 됨). 새 import부터 imports 필드 생성 안 함. YTD 진도율, 월간/연간 리포트 등은 모두 정상 유지. 운영: 매월 ProMES 1회 import만으로 충분. |
| 2026-05-15 | 📊 v3.16 월간 보고서 PPT 자동 다운로드 (12 슬라이드): 월간 리포트 → "📊 PPT 다운로드" 버튼 추가 (Excel 옆). pptxgenjs 라이브러리 (브라우저 사이드, 동적 import). 16:9 와이드, 영업본부 그린(#2e7d32) 테마, 맑은 고딕 폰트. 슬라이드 구성: 표지 → 목차 → Ch1(KPI 4카드+자동 요약, 전년동기+영업본부장 메시지) → Ch2(월별 추이 PPT native 차트, 사업부별·담당자별) → Ch3(팀별 활동+GAP 요약, 고객별 미달/초과, GAP 심층 카드) → Ch4(차월 파이프라인+계약만료, 팀별 다음달 계획) → Ch5(Pipeline CRM 신규 딜, AM 활동 품질). 사용자가 PowerPoint에서 자유롭게 편집 가능. 기존 Excel 다운로드 유지. src/lib/pptExport.js 신규 모듈. |
| 2026-05-18 | 🔧 v3.17 Phase A — 데이터 모델 확장 + 점수 체계 모듈: 사양서 v1.0 반영(가점·감점만, 등급·처우 제외). (A1) Activity Log에 cross_dept_share boolean 체크박스 추가 (10개 issue_type과 별도). (A2) Activity Log에 recovery_plan_date/amount/note 추가 (GAP·지연 메우는 영업활동 있는 경우 입력 — 리스크 분리에 사용 예정). (A3) GapAnalysis cause_detail validation — 원인 선택 후 비어있으면 빨간 경고 + "필수" 라벨 (점수 3-4 GAP 입력 성실도에 반영). (A4) PriceContract에 delivery_schedule 배열 + contract_start 추가 (분할 발주 스케줄, 기회 파이프라인 반영용). (A5) 수주이력 통화 표시 버그 수정 (하드코딩 $ → 동적 ₩/$/€/£/¥, 기본 KRW). (A6) Pipeline CRM 열기 버튼 제거. (A7) 팀 TASK Priority 라벨 "영업본부장 지시 우선순위 (Open 이슈 P와 별개)" 명시. (A8) src/lib/scoring.js 신규 — computeScore() 100점 만점 산정 (영업 성과 60 + CRM 품질 40 - 감점 max 20). Phase D에서 UI 노출 예정. |
| 2026-05-18 | 🚀 v3.17 종합 업데이트 (Phase A-E 일괄 배포): 사양서 v1.0 점수 체계 반영. Phase A (데이터 모델: cross_dept_share, recovery_plan, GAP cause_detail validation, delivery_schedule, 통화 표시 수정, Pipeline 버튼 제거, P 라벨 분리, src/lib/scoring.js 신규). Phase B (주간: 타부서 공유 별도 섹션, 전주 이행 점검, 리스크 2개 분리 회복계획 유무, 알람 일시 정지). Phase C (월간: 3개월 수주 예측, Pipeline fetch 진단, GAP 원인별 분석 cause_detail 미입력 경고, 다음달 계획 안내, 품목+대륙 7개 분석, GAP Top 10 펼치기). Phase D (관리자 모드: AccountContext viewAsRep, Topbar 드롭다운, Dashboard 안내 배너, ScoreCardSection 개인 100점 분해, TeamScoreboard 전체 정렬 표). Phase E (대표이사 품목별 미래 예측: 각 품목 4 영역 — 현재/영업활동/시나리오 3종/권장 액션 자동). |
| 2026-05-18 | 🧩 v3.17.1 주간 KPI에 담당자별 break down: weeklyData에 activitiesByRep + openIssuesByRep 추가 (sales_rep 기준 그룹). KPI 카드 "금주 활동 / Open 이슈" 헤드에 칩 형태로 담당자별 분배 직관 표시 (활동 많은 순). Open 이슈는 5건↑ 빨강 / 3건↑ 주황 색상 표시. 활동 점수와 AM 활동 품질 통합은 사용자 의견 기다림 (현재 별도 유지). |
| 2026-05-18 | 🧬 v3.17.2 활동 점수 통합 + PPT 일시 제거: 월간 리포트 AM별 활동 품질 표 → 담당자 활동 점수 통합표로 교체. 점수 시스템(사양서 v1.0)이 메인 평가, AM 활동 품질의 정성 정보(평균 Insight, 액션 완료율, Gap 원인 Top 3)는 보완 컬럼. 중복(90일 컨택, YTD 달성률)은 점수 항목 내포라 제거. PPT 다운로드 버튼/handlePptDownload 제거 (사용자 요청, 보완 예정). pptxgenjs + pptExport.js 모듈은 보존. |
| 2026-05-18 | 👤 v3.17.3 Activity Log 담당자 자동 정정: 본부장이 활동 입력 시 sales_rep이 본부장 이름으로 잘못 저장되는 문제 수정. handleAdd에서 sales_rep = draft.sales_rep (그 고객 담당자) || currentUser (fallback). created_by 필드 신규 — 실제 입력자 별도 보존. Settings에 ActivityRepFixTool 신규 (기존 잘못 저장된 활동 일괄 정정 + created_by 백업). 정정 대상 0건이면 자동 숨김. |
| 2026-05-19 | 🚨 v3.17.4 긴급 — 정합성 진단 ProMES 반영 + 이중 집계 감지: 사용자 보고 "보고서의 실적 수치가 다 오류" + 정합성 진단이 영업현황 기준으로 남아 있어 ProMES 전환 후 데이터와 불일치. ReconciliationDiagnostic 카드 전면 개편: 제목 "사업계획 ↔ 영업현황" → "사업계획 ↔ 실적", 서브타이틀 "[ProMES + 잔여 영업현황 통합 분석]", KPI 라벨 "영업현황 YTD" → "YTD 총 실적 (모든 source 합산)". source별 분포 진단 신규 (promes/legacy/manual/other 건수·금액). ProMES와 영업현황 잔여가 동시 존재 시 🚨 이중 집계 경고 배너 자동 표시 + "🗑 영업현황 일괄 삭제" 카드로 즉시 조치 안내. 보고서 실적 부풀림 원인 즉시 진단 가능. |
| 2026-05-19 | 🎯 v3.20 사용자 요청 일괄 반영 — 주간 예측 입력 / 분기·반기 / 보고서 a~k 재구성 / 팀 활동 상세화 / ■ 2 9컬럼 통일: (1) 주간 보고: 수주현황·매출현황 테이블 마지막 컬럼에 수주/매출 예측 입력 추가, 주차별 Firestore 자동 저장 (weekly_forecast_YYYY-MM-DD 키), 주차 이동 시 해당 주차 입력값 불러옴. (2) 월별 실적 테이블에 분기·반기 소계 컬럼 추가 — 1·2·3·Q1·4·5·6·Q2·상반기·7·8·9·Q3·10·11·12·Q4·하반기·합계, buildMonthlyColumnsWithSubtotals 모듈 헬퍼, 수주·매출 양쪽 적용. (3) 초과 고객 펼침 토글 — 미달 동일 패턴 [▼전체 N사 / ▲Top 5]. (4) 보고서 a~k 재구성: Page 1 (a 전체요약 + b 실적), Page 2 (c Key Metrics — 월별/팀별/담당별/고객별/품목별/대륙별 모두 한 곳), Page 3 (d 팀활동 + e GAP 통합), Page 4 (f Next Plan + g 차월 파이프라인 + h 3개월 예측 + i 기회 파이프라인), Page 5 (j 품목 미래 예측 + k 담당자 활동지수). ChapterHeader 5개 새 title/subtitle. (5) ■ 5 다음달 계획 textarea 제거 — ■ 6 팀별 월간 TASK로 통합. (6) 차월 수주 파이프라인 ■ 5에서 별도 카드 분리 (sectionGProBuy). (7) 기회 파이프라인 신규 (cross/gap/recovery만 추려낸 GAP 회복 전용). (8) 팀별 활동 상세화 — 신규계약/크로스셀링/미해결이슈/주요고객컨택 각 행 클릭 시 펼침, 어느 회사의 어떤 건인지 (일자/담당/내용) 표시, 컨택 회사는 칩 형태. teamActivity에 newContractList/crossSellingList/openIssuesList/contactedList 추가. (9) 품목 미래 예측 대표보고용 멘트 제거. (10) ■ 2 팀별 월간 실적 9컬럼 통일: 담당/당월목표/당월실적/달성률/Gap/YTD목표/YTD실적/YTD달성률/YTD Gap. teamRows·teamTotal에 ytdTarget·ytdActual·ytdAchieveRate·monthGap·ytdGap 추가. 빌드 시 Vite 캐시 매번 비움 (rm -rf node_modules/.vite dist) — v3.18 빌드에서 캐시로 인한 changelog 누락 재발 방지. |
| 2026-05-19 | 🛡 v3.18 데이터 무결성 구조 개혁 — 코드 수정 시 숫자 오류 근본 차단: 사용자 핵심 요청 "프로그램 수정 시 자꾸 데이터 오류, 근본원인 제거 필요. 숫자는 거의 Import값(고정된 사업계획 + 수주/매출 Import)인데 구조만 안정되면 오류 안 날 것". 3축 구조 도입: (축1) Single Source of Truth — 신규 src/lib/aggregation.js 단일 집계 모듈, filterValidOrders/filterValidSales/sumOrderAmountByPeriod 등, source whitelist 한 곳에만. Report/Dashboard/Progress/OrderReport/MyTasks 전부 동일 함수 호출 → 흩어진 로직 통합. (축2) Import Audit — 신규 import_audit_logs Firestore 컬렉션, ProMES Import 시 raw 합계 자동 기록(timestamp+연도+건수+총액+월별 분포), 불변 원장. firebase.js에 subscribeImportAuditLogs/saveImportAuditLog/deleteImportAuditLog. (축3) Regression Detection — validateDataIntegrity() 5가지 자동 검사 (수주/매출 source 분포, 이중 집계, Import 합계↔DB 0.5% 차이 시 ERROR). Settings에 🛡 데이터 무결성 대시보드 카드 신규 (보고서 상단 배너 → Settings 이동, 사용자 요청). 상태 뱃지/KPI 4카드/검사 상세 펼침/Import 이력 표 (시각/건수/합계/DB현재/차이/월별). 코드 수정 후 흐름: Settings 진입 한 번으로 무결성 확인. |
| 2026-05-19 | 🗒️ v3.17.11 누락 3종 완성 + 데이터 무결성 배너: (1) MyTasks 신규 페이지 (src/views/MyTasks.jsx) — 사이드바 🗒️ 내 업무. 내 team_tasks(월별/우선순위/상태 필터+인라인 상태 변경) + 내 Open 이슈(P1/P2/P3 정렬+고객 카드 연결) + 7일 내 차주 액션(Activity Log next_action_date) + 이번달 GAP 부족 거래처(사업계획 미달). 관리자=전체 뷰 / 일반=본인만 / viewAsRep=그 담당자. (2) 월간 ■ 5 다음달 계획 textarea → [+ TASK로 등록] 버튼 — textarea 줄별 내용을 team_task로 일괄 변환, 다음달 ■ 4-4 자동 이행 점검에 반영. (3) Report 상단 데이터 무결성 배너 — ProMES X건/Y억 + 영업현황 잔여 + 보고서 집계 YTD + manual/기타 발견 시 🚫 경고 + 마지막 import 일자. 사용자가 수치 신뢰성을 항상 한눈에 확인. |
| 2026-05-19 | 🔒 v3.17.10 긴급 — 수주 집계 ProMES 전용 + 수동 입력 영구 비활성화: 사용자 결정 "ProMES 집계만 보고서에 반영, 담당자들의 수주 추가가 실적 집계에 영향 미쳐서는 안 됨". (1) source filter 적용: 허용 [excel_import_promes_O, excel_import_영업현황] / 매출 [excel_import_promes_S, excel_import_영업현황_S]만 — Report.jsx + Dashboard.jsx + Progress.jsx + OrderReport.jsx 전부. manual 등 다른 source 영구 제외. (2) OrderHistory [+ 수동 입력] 버튼/폼/state/handler 영구 제거 — AccountModal에서 수주 수동 입력 불가, "ProMES만 사용" 안내. (3) ManualOrderCleanupTool 신규 — Settings에 source='manual' 일괄 삭제 카드 (데이터 있을 때만 표시, deleteOrder helper 사용). 결과: 보고서 수치 ProMES와 정확히 일치 (5월 13.7억). |
| 2026-05-19 | 🐛 v3.17.9 긴급 — manual 13건 원인 확인 + OrderHistory 저장 버그 수정: 사용자 분노 — "수동입력 말이 되냐 ProMES만 임포트하는데". 원인 확정: src/components/AccountModal/OrderHistory.jsx handleAdd가 customer_name/product_name/created_by 저장 안 하는 버그. AccountModal → 수주이력 탭에서 누군가 입력한 수주가 정체불명 데이터로 보였던 이유. 수정: customer_name=account.company_name 자동 채움, product_name=product_category, sales_rep=account.sales_rep (v3.17.3 본부장 보정 패턴), created_by+created_at 신규 저장. 진단 화면도 보강: account_id로 거래처명 lookup, 신규 컬럼 (담당자/제품/통화/주문번호), 미저장 필드 "(미저장)" 명시. 이제 manual 13건의 실제 정체 즉시 확인 가능. |
| 2026-05-19 | 🛡 v3.17.8 긴급 — "manual" source 정밀 진단 + 안전장치: 사용자가 "기타" 일괄 삭제 직전, source="manual" (수동 UI 입력) 13건 / 5.4억 포함 발견. 삭제 시 실제 수주 손실 위험. 진단 표 확장: 샘플 5건 → 50건 전체, 신규 컬럼 입력자(created_by)/입력일(created_at), 1천만원 초과 행 배경 강조, 금액 내림차순 정렬. 안전장치: source="manual" 포함 시 단순 confirm 대신 prompt에 "삭제확정" 정확 입력 강제. 기타 source(manual 외)는 기존 confirm 유지. 사용자 의도 식별 가이드: 동일일 batch 입력 의심, 원 단위 금액 다수=테스트 가능성, created_by 본인이면 의도 명확. |
| 2026-05-19 | 🎯 v3.17.7 긴급 — "기타" source 정체 식별 + 일괄 삭제 도구: 5월 진단 결과 5.4억 인플레이션의 정체는 "기타" 카테고리 11건. ProMES/영업현황/manual 외의 알 수 없는 source 값. ReconciliationDiagnostic에 "기타" source 정체 식별 카드 신규 — source 값별 건수·금액·예시 5건 (월/거래처/제품/금액/doc id) 표시. "기타" source 일괄 삭제 버튼 추가 (confirm에 삭제 대상 source 목록 명시, deleteOrder helper 사용). ProMES/영업현황/manual은 보존. 사용 절차: Settings → 진단 (~5월) → 기타 카드 확인 → 일괄 삭제. |
| 2026-05-19 | 🔍 v3.17.6 긴급 — 월별 source breakdown + ProMES 내부 중복 감지: 사용자 보고 "당월 누적 수주 19.1억인데 ProMES 임포트는 13.7억" — 기간 옵션이 ~4월까지만 있어 5월 인플레이션 위치 미식별. 기간 dropdown 확장 (~5월/~7월/~8월/~10월/~11월 추가). 월별 source 분포 breakdown 표 신규 — 각 월별 ProMES·영업현황(잔여)·수동·기타 동시 표시, 동시 존재 행은 🚨 강조. ProMES 내부 중복 감지 신규 — dedupe key (월+account_id+product_code) 2건 이상 항목 추적, 상위 10개 카드 (고객/제품/금액 예시). ProMES 재임포트 시 기존 미삭제 중복 즉시 식별. |
