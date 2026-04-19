/**
 * 유효 담당자(sales rep) 목록 중앙화
 *
 * 규칙 (사용자 지시):
 *   "사업계획상의 담당자와 인위적으로 추가하는 담당자를 제외하고는 없습니다"
 *   = businessPlans의 customer/product plan에 등록된 sales_rep
 *   + 설정 > 팀 관리에서 추가한 teamMembers
 *   + '해외영업', '영업지원', '국내영업' 등 팀 이름이 rep 필드에 들어온 경우는 제외
 *   + 위 두 집합의 합집합만 유효. 그 외 orders/sales에 있는 rep 값은 모두 무시
 */

/**
 * 유효 담당자 Set 반환
 * @param {object} params
 * @param {Array} params.businessPlans - 올해 사업계획 전체
 * @param {Array<string>} params.teamMembers - 수동 추가 팀원 목록
 * @returns {Set<string>} 유효 담당자 이름 집합
 */
export function getValidSalesReps({ businessPlans = [], teamMembers = [] }) {
  const reps = new Set();

  // 팀 멤버 (수동 추가)
  (teamMembers || []).forEach(m => {
    if (m && typeof m === 'string') reps.add(m.trim());
  });

  // 사업계획상 담당자 (customer plan만 대상, product plan 제외)
  (businessPlans || []).forEach(p => {
    if (p.type === 'product') return;
    if (p.type === 'team_sales') return;
    if (p.sales_rep && typeof p.sales_rep === 'string') {
      const name = p.sales_rep.trim();
      if (name) reps.add(name);
    }
  });

  // 팀 이름 자체가 담당자로 들어온 케이스 제거
  const TEAM_NAMES = ['해외영업', '영업지원', '국내영업', '해외', 'BPU', '국내'];
  TEAM_NAMES.forEach(t => reps.delete(t));

  // 빈 문자열 제거
  reps.delete('');

  return reps;
}

/**
 * 담당자 이름이 유효한지 체크
 */
export function isValidRep(name, validReps) {
  if (!name || typeof name !== 'string') return false;
  return validReps.has(name.trim());
}

/**
 * 정렬된 유효 담당자 배열 반환 (리포트 표시용)
 * teamMembers 순서 우선, 추가 사업계획 담당자는 뒤에
 */
export function getSortedValidReps({ businessPlans = [], teamMembers = [] }) {
  const validSet = getValidSalesReps({ businessPlans, teamMembers });
  const tmList = (teamMembers || []).filter(r => validSet.has(r));
  const extras = [...validSet].filter(r => !tmList.includes(r)).sort();
  return [...tmList, ...extras];
}
