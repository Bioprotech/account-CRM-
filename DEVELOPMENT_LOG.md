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
| 2026-04-24 | 🐛 v3.3.1 영업현황 Import 버그 수정: (1) 전년도 데이터 미포함 → "🌐 전체 연도" 기본값 + 단일 연도 선택 시 경고 (2) excelDateToStr 강화 — string 날짜 YYYY-MM-DD 정규화 (ISO/YYYY-M-D/M/D/YYYY/D.M.YYYY 등) (3) Page 1 앞 빈 페이지 수정 (ChapterHeader page>1만 break) |
