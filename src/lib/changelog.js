export const CHANGELOG = [
  {
    version: 'v2.0',
    date: '2026-04-13',
    title: 'Customer Insight 통합 + 전략등급',
    items: [
      '🎯 전략 등급(A/B/C/D) 도입 — 고객 목록/대시보드에서 등급별 필터 및 분포 확인',
      '🔍 Customer Insight 탭 통합 — 기존 Score + 비즈니스 건강도 + 공급자 지위 + 구매결정 구조를 하나의 탭으로 통합',
      '⚡ 자동 감지 — 기본정보/가격계약 탭에 입력된 데이터를 자동으로 Insight 진척률에 반영',
      '📝 현재 컨텍스트 메모 — 고객 현황 한 줄 요약 (기본정보 탭 + 모달 헤더에 표시)',
      '⚠️ Watch 알람 — D등급 고객 + 진척률 30% 미만 고객 대시보드 알람',
      '📋 업데이트 알림 — 이 팝업! 새 버전 배포 시 변경 내역 자동 표시',
    ],
  },
  {
    version: 'v1.9',
    date: '2026-04-13',
    title: 'FCST 월별 전환 + 수주목표관리',
    items: [
      '📈 수주목표관리 리포트 뷰 신규 추가 (목표/확정수주/FCST 월별 테이블)',
      '📊 FCST 월별 입력 전환 (분기별→월별, 기존 데이터 호환)',
      '✏️ 리포트 내 FCST 인라인 편집 (셀 클릭→직접 입력)',
      '💰 가격·계약: 계약수량 + 계약금액 자동계산 추가',
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
export const VERSION_STORAGE_KEY = 'bioprotech_account_crm_version';
