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
  let newCustomerDomesticActual = 0;
  let newCustomerOverseasActual = 0;
  const overseasEtcCustomers = [];
  const domesticEtcCustomers = [];
  const newCustomers = [];

  Object.values(nonPlanByCustomer).forEach(info => {
    const name = (info.name || '').toLowerCase().trim();
    const amount = info.orders.reduce((s, o) => s + (o.order_amount || 0), 0);
    const isPrior = priorSet.has(name);
    const domestic = info.account ? isDomestic(info.account) : /[가-힣]/.test(info.name || '');

    if (!isPrior) {
      // 신규 (전년도 수주 없는 고객)
      newCustomerActual += amount;
      if (domestic) newCustomerDomesticActual += amount;
      else newCustomerOverseasActual += amount;
      newCustomers.push({
        name: info.name, amount, accountId: info.account?.id || null,
        domestic, orderCount: info.orders.length,
      });
    } else if (domestic) {
      domesticEtcActual += amount;
      domesticEtcCustomers.push({ name: info.name, amount, accountId: info.account?.id || null, orderCount: info.orders.length });
    } else {
      overseasEtcActual += amount;
      overseasEtcCustomers.push({ name: info.name, amount, accountId: info.account?.id || null, orderCount: info.orders.length });
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
      actualDomestic: newCustomerDomesticActual,
      actualOverseas: newCustomerOverseasActual,
      monthTargets: newCustomerMonthTargets,
      customers: newCustomers,
      customersDomestic: newCustomers.filter(c => c.domestic),
      customersOverseas: newCustomers.filter(c => !c.domestic),
    },
  };
}

/* ══════════════════════════════════════════════════════
   담당자 뷰용 고객 버킷 결정 (단일 주문/매출 → 분류 키)
   ══════════════════════════════════════════════════════ */

/**
 * 한 고객(account)의 담당자 뷰 버킷을 결정
 *   - 사업계획 매칭 → { bucket: 'plan', rep: '사업계획 담당자' }
 *   - 전년도 수주 無 → { bucket: 'new', domestic, label: '국내신규'|'해외신규' }
 *   - 전년도 수주 有 + 사업계획 外 → { bucket: 'etc', domestic, label: '국내기타'|'해외기타' }
 *
 * @param {object} params
 * @param {object} params.account - 고객 객체 (선택, null 가능)
 * @param {string} params.customerName - 주문/매출의 customer_name
 * @param {Map|object} params.planByName - { name(lowercase trimmed) → plan }
 * @param {Set<string>} params.priorSet - 전년도 수주 고객명 Set (lowercase trimmed)
 */
export function classifyForRepView({ account, customerName, planByName, priorSet }) {
  const nameKey = (customerName || account?.company_name || '').toLowerCase().trim();
  if (!nameKey) return { bucket: 'unknown', label: '기타', rep: null };

  // 1. 사업계획 매칭 (customer 플랜)
  const plan = planByName instanceof Map ? planByName.get(nameKey) : planByName[nameKey];
  if (plan && plan.sales_rep) {
    return { bucket: 'plan', rep: plan.sales_rep, label: plan.sales_rep, planMatch: true };
  }

  // 2. 국내/해외 판별
  const domestic = account
    ? isDomestic(account)
    : /[가-힣]/.test(customerName || '');

  // 3. 전년도 수주 여부
  const hasPrior = priorSet && priorSet.has(nameKey);

  if (!hasPrior) {
    // 신규
    return {
      bucket: 'new',
      rep: domestic ? '국내신규' : '해외신규',
      label: domestic ? '국내신규' : '해외신규',
      domestic,
      isNew: true,
    };
  }

  // 기타
  return {
    bucket: 'etc',
    rep: domestic ? '국내기타' : '해외기타',
    label: domestic ? '국내기타' : '해외기타',
    domestic,
    isEtc: true,
  };
}

/* ══════════════════════════════════════════════════════
   담당자별 집계 (신 분류 체계 기반)
   ══════════════════════════════════════════════════════ */

/**
 * 주문/매출 목록을 담당자별로 집계
 * - 사업계획 담당자 + 국내기타 / 해외기타 / 국내신규 / 해외신규
 *
 * @param {object} params
 * @param {Array} params.transactions - orders 또는 sales 배열
 * @param {Array} params.accounts
 * @param {Array} params.customerPlans
 * @param {Set<string>} params.priorSet
 * @param {Array<string>} params.teamMembers - 유효 담당자 목록 (빈 행 유지용)
 * @param {function} params.amountGetter - (tx) => amount
 * @returns {object} { repAggregates: { [repName]: { amount, customers: [...] } }, buckets: {...} }
 */
export function aggregateByRep({
  transactions,
  accounts,
  customerPlans,
  priorSet,
  teamMembers = [],
  amountGetter = (t) => t.order_amount || t.sale_amount || 0,
}) {
  // plan name lookup
  const planByName = {};
  (customerPlans || []).forEach(p => {
    if (!p.customer_name) return;
    if (getBucketCategory(p.customer_name)) return; // 버킷 플랜 제외
    planByName[p.customer_name.toLowerCase().trim()] = p;
  });

  const accountByName = {};
  (accounts || []).forEach(a => {
    if (a.company_name) accountByName[a.company_name.toLowerCase().trim()] = a;
  });
  const accountById = {};
  (accounts || []).forEach(a => { accountById[a.id] = a; });

  // 결과 컨테이너: 담당자 + 버킷
  const result = {};

  // 사업계획 담당자 초기화 (실적 0이어도 행 유지)
  const planReps = new Set();
  (customerPlans || []).forEach(p => {
    if (p.sales_rep) planReps.add(p.sales_rep);
  });
  (teamMembers || []).forEach(r => planReps.add(r));

  planReps.forEach(rep => {
    result[rep] = { kind: 'plan', rep, amount: 0, customers: [], orderCount: 0 };
  });

  // 버킷 4종 초기화
  ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => {
    result[k] = {
      kind: k.endsWith('신규') ? 'new' : 'etc',
      rep: k,
      amount: 0,
      customers: [], // [{ name, amount, accountId }]
      orderCount: 0,
    };
  });

  // transaction 순회
  (transactions || []).forEach(tx => {
    const acc = tx.account_id ? accountById[tx.account_id]
      : accountByName[(tx.customer_name || '').toLowerCase().trim()] || null;
    const { rep, bucket } = classifyForRepView({
      account: acc,
      customerName: tx.customer_name || acc?.company_name,
      planByName,
      priorSet: priorSet || new Set(),
    });
    if (!rep) return;
    if (!result[rep]) {
      // teamMembers에 없는 담당자 (사업계획엔 있지만) - 버킷에 매핑
      result[rep] = { kind: 'plan', rep, amount: 0, customers: [], orderCount: 0 };
    }
    const amount = amountGetter(tx);
    const name = tx.customer_name || acc?.company_name || '?';
    result[rep].amount += amount;
    result[rep].orderCount++;
    // 고객별 누적
    const existing = result[rep].customers.find(c => c.name === name);
    if (existing) {
      existing.amount += amount;
      existing.orderCount++;
    } else {
      result[rep].customers.push({ name, amount, accountId: acc?.id || null, orderCount: 1 });
    }
  });

  return result;
}

/**
 * 전년도 고객 목록 저장/로드
 * - Firestore (app_settings/crm_settings 도큐먼트)가 주 저장소
 * - localStorage는 캐시용 (Firestore 로드 전 빠른 표시)
 */
import { saveSetting } from './firebase';

const PRIOR_YEAR_KEY = 'bioprotech_account_crm_prior_year_customers';

export async function savePriorYearCustomers(names) {
  const cleaned = [...new Set(names.map(n => n.toLowerCase().trim()).filter(Boolean))];
  // localStorage 캐시
  localStorage.setItem(PRIOR_YEAR_KEY, JSON.stringify(cleaned));
  // Firestore 저장 (주 저장소)
  try {
    await saveSetting('priorYearCustomers', cleaned);
  } catch (e) {
    console.error('[PriorYear] Firestore 저장 실패:', e);
  }
  return cleaned;
}

export function loadPriorYearCustomers() {
  // localStorage 캐시에서 빠르게 로드 (Firestore 구독 데이터가 오기 전까지)
  try {
    const saved = JSON.parse(localStorage.getItem(PRIOR_YEAR_KEY));
    if (Array.isArray(saved)) return new Set(saved);
  } catch {}
  return new Set();
}

/**
 * Firestore에서 받은 settings로 localStorage 캐시 동기화
 */
export function syncPriorYearFromSettings(settings) {
  if (settings?.priorYearCustomers && Array.isArray(settings.priorYearCustomers)) {
    localStorage.setItem(PRIOR_YEAR_KEY, JSON.stringify(settings.priorYearCustomers));
    return new Set(settings.priorYearCustomers);
  }
  return null;
}
