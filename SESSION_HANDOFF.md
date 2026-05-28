# Session Handoff — Account CRM

> **새 Claude Code 세션 시작 시 이 문서를 먼저 읽으세요.**
> 빠른 컨텍스트 회복용. 작업 규칙은 `CLAUDE.md`, 상세 이력은 `DEVELOPMENT_LOG.md` 참조.

**최종 갱신**: 2026-05-28 (v3.34 배포 완료 — 보고서 인사이트 Loss Reason/Activity ROI/FCST 정확도/Health Score)

---

## 🎯 현재 상태

- **운영 버전(라이브)**: **v3.34** — https://bioprotech-account-crm.web.app (index-C-s_PkW2.js)
- **GitHub**: https://github.com/Bioprotech/account-CRM-.git
- **Firebase 프로젝트**: bioprotech-crm (Pipeline CRM과 공유)
- 커밋/푸시/배포 상태는 항상 `git status` + `git log`로 직접 확인할 것

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

### ⭐ CRM 보완 명세서 (보고서/CRM_보완_개발_명세_v1.md) 잔여 항목
- **⑤ 마진/공헌이익 (P1)** — order_history에 cogs/공헌이익 추가. ⚠ 데이터 source 결정 필요 (옵션 A: ERP/BOM Excel Import 월1회 / B: 품목별 평균 원가율 수동 / C: 계약별 수동). source 정해지면 진행
- **③ Stage Transition Time / ④ 경쟁사 Win/Loss** — Pipeline CRM 영역. Pipeline CRM 폴더에서 별도 작업
- 완료: ① Loss Reason(v3.34) · ② FCST 정확도(v3.34) · ⑥ 활동 ROI(v3.34) · ⑦ Health Score 간이판(v3.34)

### i18n 잔여 (선택)
- AccountModal 일부 inline placeholder / alert·confirm 메시지 한국어 잔존 (사용자: 가이드 문서로 별도 안내 예정)
- 보고서·Settings는 영문화 제외 (사용자 결정)

### 기타 (선택)
- 입력 검증/누락 경고 (FCST·크로스셀링 예상일자·품목·금액 미입력 시 경고)
- 고객 목록(AccountList)에 거래종료 고객 시각적 구분 + 필터 토글

## ✅ 최근 완료 (참고)
- **v3.32** 계약전환율 KPI (Dashboard 상단) + 거래종료 분류 (모든 운영 메뉴에서 자동 제외)
- **v3.31** 👥 팀 공통 — 팀 활동 + 공통 프로젝트 + 📢 유관부서 공유 callout
- **v3.30** 주간 분기별 진행 현황 — 사업부(해외/BPU/국내) breakdown
- **v3.29** 미래 예측 정리 — 차월 파이프라인 제거 + 품목 예측 공식 보정

---

*계정 이관(Claude 구독 변경) 대비 갱신 — 2026-05-25*
