/**
 * 고객 분류 체계
 *
 * 1. 기존 고객 — 사업계획에 포함된 비병원 고객 (개별 목표 vs 실적)
 * 2. 대학병원 — 고객명에 병원/의료원 포함 → 목표+실적 합산 1행
 * 3. 해외기타 — 계획 외 + 25년 이력 有 + 해외
 * 4. 국내기타 — 계획 외 + 25년 이력 有 + 국내 비병원
 * 5. 신규   — 25년 이력 無 + 26년 첫 수주
 */

const HOSPITAL_KEYWORDS = ['병원', '의료원'];

// 국내 지역 판별
const DOMESTIC_REGIONS = ['한국', '국내', 'Korea', 'Domestic', ''];
const DOMESTIC_COUNTRIES = ['한국', 'Korea', 'KR', 'KOR', ''];

export function isHospital(name) {
  if (!name) return false;
  return HOSPITAL_KEYWORDS.some(kw => name.includes(kw));
}

export function isDomestic(account) {
  // 국가나 지역에서 국내 여부 판별
  const region = (account.region || '').trim();
  const country = (account.country || '').trim();

  // 명시적 해외 지역이면 해외
  const overseasRegions = ['북미', '중남미', '유럽', '아시아', '중동', '아프리카', 'CIS'];
  if (overseasRegions.includes(region)) return false;

  // 한국 명시
  if (DOMESTIC_REGIONS.includes(region) && region) return true;
  if (DOMESTIC_COUNTRIES.includes(country) && country) return true;

  // 한글 고객명이면 국내로 추정 (region/country 모두 비어있을 때)
  if (!region && !country && /[가-힣]/.test(account.company_name || '')) return true;

  return false;
}

/**
 * 전체 고객/주문/사업계획을 5개 카테고리로 분류
 *
 * @param {object} params
 * @param {Array} params.accounts - CRM 고객 목록
 * @param {Array} params.customerPlans - 올해 사업계획 (type !== 'product')
 * @param {Array} params.yearOrders - 올해 수주 목록
 * @param {Set<string>} params.priorYearCustomers - 전년도(2025) 수주 고객명 Set (lowercase trimmed)
 * @returns {object} { existing, hospital, overseasEtc, domesticEtc, newCustomer, hospitalAccounts }
 */
export function classifyCustomers({ accounts, customerPlans, yearOrders, priorYearCustomers }) {
  const priorSet = priorYearCustomers || new Set();

  // 사업계획 고객명 Set
  const planNameSet = new Set();
  customerPlans.forEach(p => {
    if (p.customer_name) planNameSet.add(p.customer_name.toLowerCase().trim());
  });

  // 사업계획에 있는 고객 중 병원인 것
  const hospitalPlanNames = new Set();
  customerPlans.forEach(p => {
    if (p.customer_name && isHospital(p.customer_name)) {
      hospitalPlanNames.add(p.customer_name.toLowerCase().trim());
    }
  });

  // --- 1. 기존 고객 (사업계획 有 + 비병원) ---
  const existingPlans = customerPlans.filter(p => {
    const name = (p.customer_name || '').toLowerCase().trim();
    return !isHospital(p.customer_name);
  });

  // --- 2. 대학병원 (병원명 고객 모두 통합) ---
  // 병원 계정: 사업계획에 있든 없든 모든 병원
  const hospitalAccountIds = new Set();
  accounts.forEach(a => {
    if (isHospital(a.company_name)) hospitalAccountIds.add(a.id);
  });

  // 병원 사업계획 합산
  const hospitalPlans = customerPlans.filter(p => isHospital(p.customer_name));
  const hospitalTarget = hospitalPlans.reduce((s, p) => s + (p.annual_target || 0), 0);
  const hospitalMonthTargets = {};
  hospitalPlans.forEach(p => {
    if (p.targets) {
      Object.entries(p.targets).forEach(([m, v]) => {
        hospitalMonthTargets[m] = (hospitalMonthTargets[m] || 0) + v;
      });
    }
  });

  // 병원 수주 합산
  const hospitalOrders = yearOrders.filter(o => {
    if (hospitalAccountIds.has(o.account_id)) return true;
    return isHospital(o.customer_name);
  });
  const hospitalActual = hospitalOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

  // --- 3~5. 사업계획에 없는 고객 분류 ---
  // 사업계획에 없는 수주 (비병원)
  const nonPlanOrders = yearOrders.filter(o => {
    const name = (o.customer_name || '').toLowerCase().trim();
    if (planNameSet.has(name)) return false;
    if (isHospital(o.customer_name)) return false;
    return true;
  });

  // 고객별로 그룹핑
  const nonPlanByCustomer = {};
  nonPlanOrders.forEach(o => {
    const name = (o.customer_name || '').toLowerCase().trim();
    if (!nonPlanByCustomer[name]) {
      nonPlanByCustomer[name] = { name: o.customer_name, orders: [], account: null };
    }
    nonPlanByCustomer[name].orders.push(o);
  });

  // account 연결
  const accountNameMap = {};
  accounts.forEach(a => {
    if (a.company_name) accountNameMap[a.company_name.toLowerCase().trim()] = a;
  });
  Object.entries(nonPlanByCustomer).forEach(([key, info]) => {
    info.account = accountNameMap[key] || null;
  });

  let overseasEtcActual = 0;
  let domesticEtcActual = 0;
  let newCustomerActual = 0;
  const overseasEtcCustomers = [];
  const domesticEtcCustomers = [];
  const newCustomers = [];

  Object.values(nonPlanByCustomer).forEach(info => {
    const name = (info.name || '').toLowerCase().trim();
    const amount = info.orders.reduce((s, o) => s + (o.order_amount || 0), 0);
    const isPrior = priorSet.has(name);
    const domestic = info.account ? isDomestic(info.account) : /[가-힣]/.test(info.name || '');

    if (!isPrior) {
      // 신규
      newCustomerActual += amount;
      newCustomers.push({ name: info.name, amount });
    } else if (domestic) {
      // 국내기타
      domesticEtcActual += amount;
      domesticEtcCustomers.push({ name: info.name, amount });
    } else {
      // 해외기타
      overseasEtcActual += amount;
      overseasEtcCustomers.push({ name: info.name, amount });
    }
  });

  return {
    existing: {
      plans: existingPlans,
      // 기존 고객의 수주는 Dashboard에서 개별 매칭하므로 여기서는 합산만
      target: existingPlans.reduce((s, p) => s + (p.annual_target || 0), 0),
    },
    hospital: {
      target: hospitalTarget,
      actual: hospitalActual,
      monthTargets: hospitalMonthTargets,
      plans: hospitalPlans,
      orders: hospitalOrders,
      accountIds: hospitalAccountIds,
      names: [...new Set([...hospitalPlans.map(p => p.customer_name), ...hospitalOrders.map(o => o.customer_name)].filter(Boolean))],
    },
    overseasEtc: {
      actual: overseasEtcActual,
      customers: overseasEtcCustomers,
    },
    domesticEtc: {
      actual: domesticEtcActual,
      customers: domesticEtcCustomers,
    },
    newCustomer: {
      actual: newCustomerActual,
      customers: newCustomers,
    },
  };
}

/**
 * 전년도 고객 목록 저장/로드 (localStorage)
 */
const PRIOR_YEAR_KEY = 'bioprotech_account_crm_prior_year_customers';

export function savePriorYearCustomers(names) {
  const cleaned = [...new Set(names.map(n => n.toLowerCase().trim()).filter(Boolean))];
  localStorage.setItem(PRIOR_YEAR_KEY, JSON.stringify(cleaned));
  return cleaned;
}

export function loadPriorYearCustomers() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRIOR_YEAR_KEY));
    if (Array.isArray(saved)) return new Set(saved);
  } catch {}
  return new Set();
}
