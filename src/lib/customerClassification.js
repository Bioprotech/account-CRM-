/**
 * 고객 분류 체계
 *
 * 1. 기존 고객 — 사업계획에 포함된 비병원, 비버킷 고객 (개별 목표 vs 실적)
 * 2. 대학병원 — 직판영업 목표 + 병원명 고객 실적 통합
 * 3. 해외기타 — "해외기타" 사업계획 목표 + 계획 외 해외 고객 실적
 * 4. 국내기타 — "국내 기타" 사업계획 목표 + 계획 외 국내 비병원 실적
 * 5. 신규   — "국내 신규" 사업계획 목표 + 25년 이력 無 고객 실적
 */

const HOSPITAL_KEYWORDS = ['병원', '의료원'];

// 버킷(통합) 카테고리 매핑 — 사업계획 customer_name → 분류 카테고리
const BUCKET_PLAN_NAMES = {
  '해외기타': 'overseasEtc',
  '직판영업': 'hospital',
  '국내 신규': 'newCustomer',
  '국내 기타': 'domesticEtc',
};

// 국내 지역 판별
const DOMESTIC_REGIONS = ['한국', '국내', 'Korea', 'Domestic', ''];
const DOMESTIC_COUNTRIES = ['한국', 'Korea', 'KR', 'KOR', ''];

export function isHospital(name) {
  if (!name) return false;
  return HOSPITAL_KEYWORDS.some(kw => name.includes(kw));
}

export function isDomestic(account) {
  const region = (account.region || '').trim();
  const country = (account.country || '').trim();

  const overseasRegions = ['북미', '중남미', '유럽', '아시아', '중동', '아프리카', 'CIS',
    'N.America', 'Latin America', 'Europe', 'Asia', 'Middle East', 'Africa'];
  if (overseasRegions.includes(region)) return false;

  if (DOMESTIC_REGIONS.includes(region) && region) return true;
  if (DOMESTIC_COUNTRIES.includes(country) && country) return true;

  // 한글 고객명이면 국내로 추정 (region/country 모두 비어있을 때)
  if (!region && !country && /[가-힣]/.test(account.company_name || '')) return true;

  return false;
}

/**
 * 사업계획 customer_name이 버킷 카테고리인지 확인
 */
function getBucketCategory(customerName) {
  if (!customerName) return null;
  const trimmed = customerName.trim();
  for (const [name, cat] of Object.entries(BUCKET_PLAN_NAMES)) {
    if (trimmed === name || trimmed.toLowerCase() === name.toLowerCase()) return cat;
  }
  return null;
}

/**
 * 전체 고객/주문/사업계획을 5개 카테고리로 분류
 *
 * @param {object} params
 * @param {Array} params.accounts - CRM 고객 목록
 * @param {Array} params.customerPlans - 올해 사업계획 (type !== 'product')
 * @param {Array} params.yearOrders - 올해 수주 목록
 * @param {Set<string>} params.priorYearCustomers - 전년도(2025) 수주 고객명 Set (lowercase trimmed)
 * @returns {object} { existing, hospital, overseasEtc, domesticEtc, newCustomer }
 */
export function classifyCustomers({ accounts, customerPlans, yearOrders, priorYearCustomers }) {
  const priorSet = priorYearCustomers || new Set();

  // ── 버킷 플랜 분리 ──
  const bucketPlans = { hospital: [], overseasEtc: [], domesticEtc: [], newCustomer: [] };
  const regularPlans = []; // 기존 고객용 (비버킷, 비병원)

  customerPlans.forEach(p => {
    const bucket = getBucketCategory(p.customer_name);
    if (bucket) {
      bucketPlans[bucket].push(p);
      return;
    }
    // 병원명 고객은 hospital 버킷으로
    if (isHospital(p.customer_name)) {
      bucketPlans.hospital.push(p);
      return;
    }
    regularPlans.push(p);
  });

  // 사업계획 고객명 Set (버킷 제외, 실제 고객만)
  const planNameSet = new Set();
  regularPlans.forEach(p => {
    if (p.customer_name) planNameSet.add(p.customer_name.toLowerCase().trim());
  });
  // 병원 플랜 이름도 추가 (병원 실적 매칭용)
  bucketPlans.hospital.forEach(p => {
    if (p.customer_name && !getBucketCategory(p.customer_name)) {
      planNameSet.add(p.customer_name.toLowerCase().trim());
    }
  });

  // ── 버킷별 목표 합산 ──
  function sumBucketTarget(plans) {
    return plans.reduce((s, p) => s + (p.annual_target || 0), 0);
  }
  function sumBucketMonthTargets(plans) {
    const mt = {};
    plans.forEach(p => {
      if (p.targets) {
        Object.entries(p.targets).forEach(([m, v]) => {
          mt[m] = (mt[m] || 0) + v;
        });
      }
    });
    return mt;
  }

  // --- 1. 기존 고객 (버킷/병원 제외) ---
  const existingTarget = regularPlans.reduce((s, p) => s + (p.annual_target || 0), 0);

  // --- 2. 대학병원 ---
  const hospitalTarget = sumBucketTarget(bucketPlans.hospital);
  const hospitalMonthTargets = sumBucketMonthTargets(bucketPlans.hospital);

  // 병원 계정 ID
  const hospitalAccountIds = new Set();
  accounts.forEach(a => {
    if (isHospital(a.company_name)) hospitalAccountIds.add(a.id);
  });

  // 병원 수주 합산
  const hospitalOrders = yearOrders.filter(o => {
    if (hospitalAccountIds.has(o.account_id)) return true;
    return isHospital(o.customer_name);
  });
  const hospitalActual = hospitalOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

  // 병원 고객명 목록
  const hospitalNames = [...new Set([
    ...bucketPlans.hospital.filter(p => !getBucketCategory(p.customer_name)).map(p => p.customer_name),
    ...hospitalOrders.map(o => o.customer_name),
  ].filter(Boolean))];

  // --- 3. 해외기타 목표 ---
  const overseasEtcTarget = sumBucketTarget(bucketPlans.overseasEtc);
  const overseasEtcMonthTargets = sumBucketMonthTargets(bucketPlans.overseasEtc);

  // --- 4. 국내기타 목표 ---
  const domesticEtcTarget = sumBucketTarget(bucketPlans.domesticEtc);
  const domesticEtcMonthTargets = sumBucketMonthTargets(bucketPlans.domesticEtc);

  // --- 5. 신규 목표 ---
  const newCustomerTarget = sumBucketTarget(bucketPlans.newCustomer);
  const newCustomerMonthTargets = sumBucketMonthTargets(bucketPlans.newCustomer);

  // ── 계획 외 수주 분류 (비병원, 비버킷, 비기존) ──
  const nonPlanOrders = yearOrders.filter(o => {
    const name = (o.customer_name || '').toLowerCase().trim();
    // 기존 고객 플랜에 매칭되면 제외
    if (planNameSet.has(name)) return false;
    // 병원이면 이미 hospital에서 처리
    if (isHospital(o.customer_name)) return false;
    // 버킷 이름이면 제외
    if (getBucketCategory(o.customer_name)) return false;
    return true;
  });

  // 고객별 그룹핑
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
      newCustomers.push({ name: info.name, amount, accountId: info.account?.id || null });
    } else if (domestic) {
      // 국내기타
      domesticEtcActual += amount;
      domesticEtcCustomers.push({ name: info.name, amount, accountId: info.account?.id || null });
    } else {
      // 해외기타
      overseasEtcActual += amount;
      overseasEtcCustomers.push({ name: info.name, amount, accountId: info.account?.id || null });
    }
  });

  return {
    existing: {
      plans: regularPlans,
      target: existingTarget,
    },
    hospital: {
      target: hospitalTarget,
      actual: hospitalActual,
      monthTargets: hospitalMonthTargets,
      plans: bucketPlans.hospital,
      orders: hospitalOrders,
      accountIds: hospitalAccountIds,
      names: hospitalNames,
    },
    overseasEtc: {
      target: overseasEtcTarget,
      actual: overseasEtcActual,
      monthTargets: overseasEtcMonthTargets,
      customers: overseasEtcCustomers,
    },
    domesticEtc: {
      target: domesticEtcTarget,
      actual: domesticEtcActual,
      monthTargets: domesticEtcMonthTargets,
      customers: domesticEtcCustomers,
    },
    newCustomer: {
      target: newCustomerTarget,
      actual: newCustomerActual,
      monthTargets: newCustomerMonthTargets,
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
