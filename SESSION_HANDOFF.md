# Session Handoff — Account CRM

> **새 Claude Code 세션 시작 시 이 문서를 먼저 읽으세요.**
> 빠른 컨텍스트 회복용. 상세 이력은 `DEVELOPMENT_LOG.md` 참조.

**최종 갱신**: 2026-05-09 (v3.13 배포 완료 — ProMES 영업통계 Import 도입)

---

## 🎯 현재 상태

- **운영 버전**: v3.13 (정상 작동 중)
- **배포 URL**: https://bioprotech-account-crm.web.app
- **GitHub**: https://github.com/Bioprotech/account-CRM-.git
- **마지막 커밋**: v3.13 (ProMES 영업통계 Import)

## 🆕 v3.13 핵심 변화 — ProMES 도입

### 배경
- `영업현황_2026.xlsm`이 더 이상 갱신되지 않음 (2026-04 기준 종료)
- **ProMES 영업통계 리포트**에서 매출/수주를 별도 통계로 산출
- 다운로드: 수주.xlsx + 매출.xlsx (분리)

### 신규 import 모듈: Settings → PromesImportTool
- 시트명 `원본 데이터` 자동 감지
- 헤더: `연도/분기/월/지역코드/지역명/거래처코드/거래처명/제품군코드/제품군명/건수/수량/금액(KRW)`
- 각 행 = 월 × 거래처 × 제품군 집계 (월 단위 정밀도)

### Account 매칭 3단계
1. **external_code** (거래처코드 C-00xxx) — 가장 정확
2. **company_name + alias** 매칭
3. **신규 자동 생성** + external_code 자동 저장

### dedupe 키 변경
- 기존(영업현황): 수주번호 기반
- ProMES: `${year}-${month}-${account_id}-${product_code}` (같은 키 다중 행 자동 합산)

### 자동 제외 규칙
- 금액 0원 행 자동 제외 (사용자 확인: 정상 수주/매출만)
- ProMES 통계가 이미 취소·샘플·수리 등 비정상 데이터 정제

### 영업담당 컬럼 부재 — 영향 없음
- `classifyForRepView`는 plan/account 기반 attribution
- transaction의 `sales_rep` 필드는 핵심 분류 로직에 사용 안 됨
- 사업계획 매칭 거래처 → plan.sales_rep / 외 거래처 → 4 버킷 자동

### 리포트 영향
- ✅ 월간/연간 리포트: 기존과 동일
- ✅ 담당자별 집계: 정상 작동
- ⚠ 주간 리포트 일자 정밀도: 월 단위 → "월목표 대비 누적실적" 표시는 정상

### 기존 영업현황 Import 처리
- "Legacy — 영업현황_2026.xlsm 형식" 표시로 보존
- source 분리됨: excel_import_영업현황(_S) vs excel_import_promes_O/S
- 두 source 데이터는 Firestore에 공존 가능 (마이그레이션 불필요)

---

## 📦 데이터 모델 (Firestore)

### Account (`accounts` collection)
```
{
  id: string,
  company_name: string,
  region: string,
  country: string,
  sales_rep: string,
  business_type: string,
  intelligence: { total_score, categories, last_updated },
  // ── v3.11 추가 ──
  aliases: string[],              // 영업현황 변형명 자동 매칭용
  // ── v3.12 추가 ──
  customer_category: string,      // CUSTOMER_CATEGORIES key 중 하나
  // 기존 필드들...
}
```

### customer_category 값 (constants.js:CUSTOMER_CATEGORIES)
- `overseas_main` 🌏 해외고객 (사업계획 매칭 + 해외)
- `domestic_main` 🇰🇷 국내고객 (사업계획 매칭 + 국내, 병원 포함)
- `overseas_other` 🌍 해외기타 (사업계획 외 + 해외 + 전년 수주 有)
- `domestic_other` 🏠 국내기타 (사업계획 외 + 국내 + 전년 수주 有)
- `overseas_new` 🆕 해외신규 (전년 수주 無 + 해외)
- `domestic_new` 🆕 국내신규 (전년 수주 無 + 국내)
- `unclassified` ❓ 미분류 (기본값)

### 기타 컬렉션
- `activity_logs`: priority, edit_history, resolution 등 (v3.5)
- `order_history`: source 필드로 관리 (excel_import_영업현황)
- `sales_history`: source `excel_import_영업현황_S`, sale_date = B/L date
- `business_plans`: type (customer / product / team_sales), account_id 연결됨
- `team_tasks`: 팀별 월간 TASK (v3.3)
- `app_settings`: priorYearCustomers, exec_summary_YYYY-MM, next_month_plan_YYYY-MM (v3.4)

---

## ⚠️ 절대 규칙 (재발 방지 — 반복 강조 사항)

### 1. 담당자 분류 규칙 (가장 중요)
- ❌ `o.sales_rep || '미배정'` 절대 금지 (영업현황에 비유효 담당자 다수)
- ✅ 반드시 `classifyForRepView()` 사용 (사업계획 매칭 + 4개 버킷)
- 상세: `src/lib/customerClassification.js` 상단 주석

### 2. customerPlans 필터
- ❌ `p.type !== 'product'` 금지 (team_sales 섞임)
- ✅ `p.type === 'customer' || !p.type` 명시적 필터

### 3. classifyForRepView 매칭 우선순위 (v3.12)
```
① account.customer_category (저장된 값) — 가장 강력
② account_id 매칭 (planByAccountId)
③ customer_name 정확 매칭
④ 자동 (isDomestic + 전년 수주 → 4 버킷)
```

### 4. isDomestic 규칙 (v3.9)
- 한글 회사명 → 무조건 국내 (region이 "Asia"여도 무시)
- 병원/의료원 키워드 → 국내 (한글/영문 모두)
- 한국 명시(한국/Korea/KR/대한민국) → 국내

---

## 🛠 핵심 도구 (Settings 페이지)

| 도구 | 위치 | 용도 |
|------|------|------|
| 🏷️ 고객 분류 일괄 적용 | Settings 상단 (파란) | 모든 account에 customer_category 자동 추천 일괄 저장 |
| 🔗 Account 합병 | Settings 중간 (녹색) | 중복 account 통합 (alias 자동 추가) |
| 🔬 정합성 진단 | Settings 중간 (빨강) | 사업계획 ↔ 영업현황 매칭 검증 |
| 🔍 퍼지 매칭 분석 | Settings 중간 (보라) | 고객명 차이 자동 감지 + 적용 |
| 📥 영업현황 Import | Settings 하단 | 수주(O)+매출(S) 시트 동시 import + 다중 연도 체크 |

---

## 📊 월간 리포트 구조 (5페이지)

1. **Page 1 — Executive Summary**: KPI 4카드, 전년동기 비교, 자동/수동 요약
2. **Page 2 — Key Metrics**: 월별 수주/매출, 팀별, 담당자별 (■2-3 사업계획 매칭 담당자만)
3. **Page 3 — Strategic Analysis**: 팀별 활동+GAP, ■4-2 고객별 (사업계획 매칭 + 4개 버킷 그룹), GAP 심층
4. **Page 4 — Next Month Actions**: 차월 파이프라인, 계약 만료, 팀별 TASK
5. **Page 5 — Pipeline CRM & Deep Analysis**: 신규 딜, GAP 원인, AM 활동 품질

각 분류 표 하단에 **"📊 합계" 행** 자동 (데이터 일관성 검증)

---

## ✅ 검증된 사항 (v3.6~v3.12)

- ✅ 사업계획 ↔ 영업현황 합계 일치 (■2-3, ■4-2 모두 동일)
- ✅ 한국 병원 (고대안산병원 등) → 국내 분류
- ✅ AMBIDERM/FANNIN/PALUPA 등 합병 후 사업계획 매칭 정상
- ✅ Account 합병 + alias 시스템으로 재import 영구 보호
- ✅ customer_category로 분류 영구 안정화

---

## 🚨 알려진 이슈 / 향후 작업

### 미완료 (선택적)
- **영업현황 재import 테스트**: alias 시스템 검증은 사용자 다음 import 시 자동
- **Pipeline CRM 통합 데이터**: pipelineCustomers 구독은 됨, 실제 사용은 ■7 Pipeline 섹션에만

### 재발 가능 영역 (주의)
- **Firestore quota**: import 반복 시 일일 한도 초과 가능 (작업 분산 필요)
- **localStorage**: 대용량 백업 제거됨 (v3.4) — 새로 도입하지 말 것

---

## 🔄 5단계 작업 워크플로우 (필수)

코드 수정 후 반드시:

1. `npm run build` → `npx firebase deploy --only hosting`
2. `src/lib/changelog.js` 최상단에 새 버전 항목 추가 (앱 내 "📝 업데이트 내역" 표시)
3. `DEVELOPMENT_LOG.md` 한 줄 추가
4. `git commit + push`
5. (중대 변경 시만) `MEMORY.md`, `SESSION_HANDOFF.md` 갱신

상세: `WORKFLOW.md`

---

## 💡 다음 세션 시작 시 권장

새 Claude Code 세션:
1. 이 문서 (SESSION_HANDOFF.md) 먼저 읽기
2. 필요 시 `DEVELOPMENT_LOG.md` 끝부분 (최근 10-20줄) 확인
3. `git log --oneline -10`으로 최근 커밋 확인
4. 사용자 요청 작업 시작

---

*v3.12 핵심 메시지: "분류는 데이터에 저장. 매번 계산하지 말 것."*
