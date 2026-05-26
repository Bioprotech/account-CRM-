/**
 * 계약전환율 (v3.32) — 금년 영업 핵심 TASK 지표
 *
 * 정의:
 *   전환 = account.contract_status === '활성'
 *   미달 = 그 외 ('만료임박' / '만료' / '협상중' / '없음' / 빈 값)
 *
 * '활성' 판정 기준 (담당자/본부장이 수동 분류, AccountModal 가이드 안내):
 *   - 정식 계약 체결 (price_contracts 있음)
 *   - 연간 수량 개런티 고객 (계약 X, 연간 약정)
 *   - 정기 FCST 수신 고객 (MPS·MRP·월별 FCST 정기 업데이트)
 *
 * 자동 보조 (v3.32 Q2-B): price_contracts 1건 이상 등록되면 contract_status가
 * 빈 값/'없음'일 때 '활성'으로 자동 변경 (다른 값이면 사용자 override 존중)
 *
 * 제외 (Q3-C): 거래종료(customer_category === 'inactive') 고객은 분모에서 제외
 *
 * 권한:
 *   - 본부장(admin): 전체 변경
 *   - 담당자: account.sales_rep === currentUser 만 변경
 */

import { isInactiveAccount } from './constants';

export const CONVERTED_STATUS = '활성';

export function isConverted(account) {
  return account?.contract_status === CONVERTED_STATUS;
}

/**
 * 거래종료(inactive) 제외 + 유효 담당자 기준 담당자별 전환 집계.
 *   { rep: { total, converted, pending, accounts: [...] } }
 */
export function aggregateConversionByRep(accounts, validReps) {
  const repSet = new Set(validReps || []);
  const map = {};
  (accounts || []).forEach(a => {
    if (isInactiveAccount(a)) return; // 거래종료 제외
    const rep = a.sales_rep;
    if (!rep || !repSet.has(rep)) return; // 유효 담당자 아니면 제외
    if (!map[rep]) {
      map[rep] = { rep, total: 0, converted: 0, pending: 0, accounts: [] };
    }
    const converted = isConverted(a);
    map[rep].total++;
    if (converted) map[rep].converted++;
    else map[rep].pending++;
    map[rep].accounts.push({
      id: a.id,
      name: a.company_name,
      status: a.contract_status || '없음',
      converted,
    });
  });
  Object.values(map).forEach(m => {
    m.conversionRate = m.total > 0 ? Math.round((m.converted / m.total) * 100) : 0;
    // 미달 고객 우선순위: 협상중 → 만료임박 → 만료 → 없음 (관리 우선순위)
    const order = { '협상중': 1, '만료임박': 2, '만료': 3, '없음': 4, '': 4 };
    m.accounts.sort((a, b) => {
      if (a.converted !== b.converted) return a.converted ? 1 : -1;
      return (order[a.status] || 5) - (order[b.status] || 5);
    });
  });
  return map;
}

/**
 * 계약 추가 시 contract_status 자동 갱신 헬퍼 (Q2-B: 자동 변경 + override 가능)
 *   - 현재 contract_status가 비어있거나 '없음'이면 '활성'으로 자동 변경
 *   - 이미 다른 값(만료/만료임박/협상중/활성)이면 그대로 유지 (사용자 override 존중)
 */
export function maybeAutoActivate(account) {
  if (!account) return account;
  const cs = account.contract_status;
  if (!cs || cs === '없음') {
    return { ...account, contract_status: CONVERTED_STATUS };
  }
  return account;
}
