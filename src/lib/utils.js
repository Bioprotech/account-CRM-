import { SCORE_CATEGORIES } from './constants';

/* ── 날짜 포맷 ── */
export function fmtDate(d) {
  if (!d) return '-';
  const s = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
  const [, m, day] = s.split('-');
  return `${m}/${day}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Intelligence Score 계산 ── */
export function computeIntelligenceScore(categories) {
  if (!categories) return 0;
  let total = 0;
  for (const cat of SCORE_CATEGORIES) {
    const data = categories[cat.key];
    if (!data?.items) continue;
    const checked = cat.items.filter(it => data.items[it.key]).length;
    const ratio = checked / cat.items.length;
    total += ratio * cat.weight * 100;
  }
  return Math.round(total);
}

/* ── Score → 색상 클래스 ── */
export function scoreColorClass(score) {
  if (score >= 70) return 'score-green';
  if (score >= 50) return 'score-yellow';
  return 'score-red';
}

export function scoreLabel(score) {
  if (score >= 70) return '양호';
  if (score >= 50) return '주의';
  return '경고';
}

/* ── 경과일 계산 ── */
export function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/* ── 필터 적용 ── */
export function getFilteredAccounts(accounts, filters) {
  return accounts.filter(a => {
    if (filters.searchQ) {
      const q = filters.searchQ.toLowerCase();
      if (!a.company_name?.toLowerCase().includes(q)) return false;
    }
    if (filters.region && a.region !== filters.region) return false;
    if (filters.salesRep && a.sales_rep !== filters.salesRep) return false;
    if (filters.businessType && a.business_type !== filters.businessType) return false;
    if (filters.product && !(a.products || []).includes(filters.product)) return false;
    if (filters.scoreRange) {
      const s = a.intelligence?.total_score ?? 0;
      if (filters.scoreRange === 'red' && s >= 50) return false;
      if (filters.scoreRange === 'yellow' && (s < 50 || s >= 70)) return false;
      if (filters.scoreRange === 'green' && s < 70) return false;
    }
    return true;
  });
}

/* ── 새 계정 템플릿 ── */
export function createNewAccount(salesRep) {
  return {
    id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    company_name: '',
    country: '',
    region: '',
    business_type: '',
    products: [],
    sales_rep: salesRep || '',
    key_contacts: [{ name: '', title: '', email: '', phone: '', is_decision_maker: false }],
    contract_status: '없음',
    trade_start_date: '',
    intelligence: {
      total_score: 0,
      categories: {},
      last_updated: '',
    },
    last_contact_date: '',
    created_at: today(),
    updated_at: today(),
  };
}

/* ── ID 생성 ── */
export function genId(prefix = 'log') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}
