import { useState, useMemo } from 'react';
import { useAccount } from '../context/AccountContext';
import { GAP_CAUSES, OPPORTUNITY_TYPES, SCORE_CATEGORIES, SALES_TEAMS } from '../lib/constants';
import { daysSince } from '../lib/utils';
import { HBarChart, DonutChart, ProgressBars } from '../components/Charts';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

/* ── 팀 표시명 매핑 ── */
const TEAM_DISPLAY = { '해외영업': '해외(본사)', '영업지원': 'BPU', '국내영업': '국내' };
const TEAM_ORDER = ['해외영업', '영업지원', '국내영업'];

/* ── helpers ── */
function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}
/** 백만원 단위 포맷 (리포트 테이블용) */
function fmtM(n) {
  if (!n) return '-';
  return Math.round(n / 1000000).toLocaleString();
}
function pct(actual, target) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}
function pctColor(p) {
  if (p >= 100) return 'blue';
  if (p >= 80) return '';
  return 'red';
}
/** 달성률 스타일 (스펙: ≥100% 파랑, 80~99% 검정, <80% 빨강) */
function achieveStyle(p) {
  if (p >= 100) return { color: 'var(--blue, #2563eb)', fontWeight: 700 };
  if (p >= 80) return { color: 'var(--text)', fontWeight: 600 };
  return { color: 'var(--red)', fontWeight: 700 };
}

/* ── date range helpers ── */
/** 주차 범위 계산 (월~일 기준, offset=0 이번주, -1 지난주 등) */
function getWeekRangeByOffset(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
    monday,
    sunday,
  };
}
/** N월 N주차 라벨 */
function getWeekLabel(mondayDate) {
  const m = mondayDate.getMonth() + 1;
  const firstMon = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), 1);
  const firstDay = firstMon.getDay();
  const firstMonday = firstDay <= 1 ? firstMon.getDate() + (1 - firstDay) : firstMon.getDate() + (8 - firstDay);
  const weekNum = Math.ceil(((mondayDate.getDate() - firstMonday) / 7) + 1);
  return `${m}월 ${weekNum > 0 ? weekNum : 1}주차`;
}
function getWeekRange() {
  return getWeekRangeByOffset(0);
}
function getMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

/* ── Reusable breakdown table component ── */
function BreakdownTable({ title, rows, periodLabel = '금주', showYtd = false, showAnnual = false }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="table-wrap" style={{ maxHeight: 250 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>구분</th>
              <th style={{ textAlign: 'right' }}>{periodLabel} 수주</th>
              {showYtd && <th style={{ textAlign: 'right' }}>YTD 실적</th>}
              {showAnnual && <th style={{ textAlign: 'right' }}>연간 목표</th>}
              {showAnnual && <th style={{ textAlign: 'right' }}>달성률</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(r.periodActual)}</td>
                {showYtd && <td style={{ textAlign: 'right' }}>{fmtKRW(r.ytdActual)}</td>}
                {showAnnual && <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(r.annualTarget)}</td>}
                {showAnnual && (
                  <td style={{ textAlign: 'right' }}>
                    {r.annualTarget > 0
                      ? <span className={`score-badge ${pctColor(pct(r.ytdActual, r.annualTarget))}`}>{pct(r.ytdActual, r.annualTarget)}%</span>
                      : '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Monthly breakdown table with monthly target ── */
function MonthlyBreakdownTable({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="table-wrap" style={{ maxHeight: 280 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>구분</th>
              <th style={{ textAlign: 'right' }}>당월 목표</th>
              <th style={{ textAlign: 'right' }}>당월 실적</th>
              <th style={{ textAlign: 'right' }}>당월 달성률</th>
              <th style={{ textAlign: 'right' }}>YTD 실적</th>
              <th style={{ textAlign: 'right' }}>연간 목표</th>
              <th style={{ textAlign: 'right' }}>연간 달성률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const mp = pct(r.monthActual, r.monthTarget);
              const ap = pct(r.ytdActual, r.annualTarget);
              return (
                <tr key={r.label}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(r.monthTarget)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(r.monthActual)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.monthTarget > 0
                      ? <span className={`score-badge ${pctColor(mp)}`}>{mp}%</span>
                      : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtKRW(r.ytdActual)}</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(r.annualTarget)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.annualTarget > 0
                      ? <span className={`score-badge ${pctColor(ap)}`}>{ap}%</span>
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   REPORT COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function Report() {
  const { accounts, activityLogs, orders, forecasts, businessPlans, openIssues, alarms, teamMembers } = useAccount();
  const [tab, setTab] = useState('weekly');
  const [weekOffset, setWeekOffset] = useState(0);

  /* ── Base data ── */
  const customerPlans = useMemo(() =>
    businessPlans.filter(p => p.year === CURRENT_YEAR && p.type !== 'product'),
    [businessPlans]
  );
  const productPlans = useMemo(() =>
    businessPlans.filter(p => p.year === CURRENT_YEAR && p.type === 'product'),
    [businessPlans]
  );
  const hasPlan = customerPlans.length > 0;

  const planLookup = useMemo(() => {
    const byAccountId = {};
    const byName = {};
    customerPlans.forEach(p => {
      if (p.account_id) byAccountId[p.account_id] = p;
      if (p.customer_name) byName[p.customer_name.toLowerCase().trim()] = p;
    });
    return { byAccountId, byName };
  }, [customerPlans]);

  const findPlanForOrder = (o) => {
    return planLookup.byAccountId[o.account_id]
      || planLookup.byName[(o.customer_name || '').toLowerCase().trim()]
      || null;
  };

  const yearOrders = useMemo(() =>
    orders.filter(o => (o.order_date || '').startsWith(String(CURRENT_YEAR))),
    [orders]
  );

  /* ── Plan summary (shared) ── */
  const planSummary = useMemo(() => {
    if (!hasPlan) return null;
    const monthKey = String(CURRENT_MONTH).padStart(2, '0');

    const annualTarget = customerPlans.reduce((s, p) => s + (p.annual_target || 0), 0);
    let ytdTarget = 0;
    customerPlans.forEach(p => {
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    const ytdActual = yearOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    const monthTarget = customerPlans.reduce((s, p) => s + (p.targets?.[monthKey] || 0), 0);
    const thisMonthStr = getMonthStr();
    const monthActual = orders.filter(o => (o.order_date || '').startsWith(thisMonthStr))
      .reduce((s, o) => s + (o.order_amount || 0), 0);

    // rep-level YTD
    const byRep = {};
    customerPlans.forEach(p => {
      const rep = p.sales_rep || '미배정';
      if (!byRep[rep]) byRep[rep] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
      byRep[rep].annualTarget += (p.annual_target || 0);
      byRep[rep].monthTarget += (p.targets?.[monthKey] || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        byRep[rep].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || '기타';
      if (!byRep[rep]) byRep[rep] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
      byRep[rep].ytdActual += (o.order_amount || 0);
      if ((o.order_date || '').startsWith(thisMonthStr)) {
        byRep[rep].monthActual += (o.order_amount || 0);
      }
    });

    // account-level month plan vs actual
    const accountPlanVsActual = [];
    const planByCustomer = {};
    customerPlans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (!planByCustomer[key]) planByCustomer[key] = { target: 0, ytdTarget: 0, name: p.customer_name, rep: p.sales_rep };
      planByCustomer[key].target += (p.targets?.[monthKey] || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        planByCustomer[key].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(thisMonthStr));
    Object.entries(planByCustomer).forEach(([key, { target, ytdTarget: yt, name, rep }]) => {
      const actual = monthOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === key)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const ytdAct = yearOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === key)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      if (target > 0) {
        accountPlanVsActual.push({ key, name, rep, target, actual, ytdActual: ytdAct, pct: pct(actual, target) });
      }
    });
    accountPlanVsActual.sort((a, b) => b.target - a.target);

    return { annualTarget, ytdTarget, ytdActual, monthTarget, monthActual, byRep, accountPlanVsActual };
  }, [customerPlans, orders, yearOrders, hasPlan, planLookup]);

  /* ── Category breakdown builder ── */
  const buildCategoryBreakdown = (periodOrders, periodLabel) => {
    // 1. By rep (plan-based)
    const repMap = {};
    if (hasPlan) {
      customerPlans.forEach(p => {
        const rep = p.sales_rep || '미배정';
        if (!repMap[rep]) repMap[rep] = { periodActual: 0, ytdActual: 0, annualTarget: p.annual_target || 0, monthTarget: 0 };
        else repMap[rep].annualTarget += (p.annual_target || 0);
      });
    }
    const tmSet = new Set(teamMembers);
    periodOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || o.sales_rep || '기타';
      const validRep = tmSet.has(rep) ? rep : (repMap[rep] ? rep : '기타');
      if (!repMap[validRep]) repMap[validRep] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      repMap[validRep].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || o.sales_rep || '기타';
      const validRep = tmSet.has(rep) ? rep : (repMap[rep] ? rep : '기타');
      if (!repMap[validRep]) repMap[validRep] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      repMap[validRep].ytdActual += (o.order_amount || 0);
    });
    const repRows = Object.entries(repMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget)
      .map(([label, v]) => ({ label, ...v }));

    // 2. By product (fuzzy match to productPlans)
    const prodMap = {};
    if (productPlans.length > 0) {
      productPlans.forEach(p => {
        const prod = p.product || '기타';
        if (!prodMap[prod]) prodMap[prod] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
        prodMap[prod].annualTarget += (p.annual_target || 0);
      });
    }
    const matchProduct = (cat) => {
      if (!cat) return null;
      const catLow = cat.toLowerCase();
      for (const prod of Object.keys(prodMap)) {
        const pLow = prod.toLowerCase();
        if (catLow.includes(pLow) || pLow.includes(catLow)) return prod;
      }
      return cat; // fallback to raw category
    };
    periodOrders.forEach(o => {
      const prod = matchProduct(o.product_category) || o.product_category || '기타';
      if (!prodMap[prod]) prodMap[prod] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      prodMap[prod].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const prod = matchProduct(o.product_category) || o.product_category || '기타';
      if (!prodMap[prod]) prodMap[prod] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      prodMap[prod].ytdActual += (o.order_amount || 0);
    });
    const prodRows = Object.entries(prodMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    // 3. By region (plan-based)
    const regMap = {};
    if (hasPlan) {
      customerPlans.forEach(p => {
        const reg = p.region || '기타';
        if (!regMap[reg]) regMap[reg] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
        regMap[reg].annualTarget += (p.annual_target || 0);
      });
    }
    periodOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const reg = plan?.region || o.region || acc?.region || '기타';
      if (!regMap[reg]) regMap[reg] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      regMap[reg].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const reg = plan?.region || o.region || acc?.region || '기타';
      if (!regMap[reg]) regMap[reg] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      regMap[reg].ytdActual += (o.order_amount || 0);
    });
    const regRows = Object.entries(regMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    // 4. By biz_type
    const bizMap = {};
    if (hasPlan) {
      customerPlans.forEach(p => {
        const biz = p.biz_type || '기타';
        if (!bizMap[biz]) bizMap[biz] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
        bizMap[biz].annualTarget += (p.annual_target || 0);
      });
    }
    periodOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const biz = plan?.biz_type || acc?.business_type || '기타';
      if (!bizMap[biz]) bizMap[biz] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      bizMap[biz].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const biz = plan?.biz_type || acc?.business_type || '기타';
      if (!bizMap[biz]) bizMap[biz] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      bizMap[biz].ytdActual += (o.order_amount || 0);
    });
    const bizRows = Object.entries(bizMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    // 5. By customer type (business_type on account)
    const typeMap = {};
    accounts.forEach(a => {
      if (!a.business_type) return;
      if (!typeMap[a.business_type]) typeMap[a.business_type] = { periodActual: 0, ytdActual: 0, annualTarget: 0, count: 0, activeCount: 0 };
      typeMap[a.business_type].count++;
    });
    if (hasPlan) {
      customerPlans.forEach(p => {
        const acc = p.account_id ? accounts.find(a => a.id === p.account_id) : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (p.customer_name || '').toLowerCase().trim());
        const bt = acc?.business_type || p.biz_type || '';
        if (!bt) return;
        if (!typeMap[bt]) typeMap[bt] = { periodActual: 0, ytdActual: 0, annualTarget: 0, count: 0, activeCount: 0 };
        typeMap[bt].annualTarget += (p.annual_target || 0);
      });
    }
    periodOrders.forEach(o => {
      const acc = accounts.find(a => a.id === o.account_id);
      const bt = acc?.business_type || '';
      if (!bt) return;
      if (!typeMap[bt]) typeMap[bt] = { periodActual: 0, ytdActual: 0, annualTarget: 0, count: 0, activeCount: 0 };
      typeMap[bt].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const acc = accounts.find(a => a.id === o.account_id);
      const bt = acc?.business_type || '';
      if (!bt) return;
      if (!typeMap[bt]) typeMap[bt] = { periodActual: 0, ytdActual: 0, annualTarget: 0, count: 0, activeCount: 0 };
      typeMap[bt].ytdActual += (o.order_amount || 0);
      typeMap[bt].activeCount++;
    });
    const typeRows = Object.entries(typeMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    return { repRows, prodRows, regRows, bizRows, typeRows };
  };

  /* ══════════════════════════════
     WEEKLY DATA
     ══════════════════════════════ */
  const weeklyData = useMemo(() => {
    const { start, end } = getWeekRange();
    const weekLogs = activityLogs.filter(l => (l.date || '') >= start && (l.date || '') <= end);
    const weekOrders = orders.filter(o => (o.order_date || '') >= start && (o.order_date || '') <= end);
    const weekOrderTotal = weekOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    // Activity summary per rep
    const repActivity = {};
    teamMembers.forEach(t => {
      repActivity[t] = { contacts: 0, orderActivity: 0, crossSelling: 0, latestContent: '' };
    });
    weekLogs.forEach(l => {
      const rep = l.sales_rep;
      if (!rep || !repActivity[rep]) return; // teamMembers에 없는 담당자는 무시
      repActivity[rep].contacts++;
      if (l.issue_type === '수주활동') repActivity[rep].orderActivity++;
      if (l.issue_type === '크로스셀링') repActivity[rep].crossSelling++;
      if (l.content && (!repActivity[rep].latestContent || (l.date || '') > (repActivity[rep]._latestDate || ''))) {
        repActivity[rep].latestContent = l.content.length > 40 ? l.content.slice(0, 40) + '...' : l.content;
        repActivity[rep]._latestDate = l.date;
      }
    });

    // Overdue issues (14+ days open)
    const overdueIssues = activityLogs
      .filter(l => l.status !== 'Closed' && daysSince(l.date) > 14)
      .map(l => {
        const account = accounts.find(a => a.id === l.account_id);
        return { ...l, company_name: account?.company_name || '?' };
      })
      .sort((a, b) => daysSince(a.date) - daysSince(b.date))
      .reverse();

    // Category breakdowns for this week
    const breakdown = buildCategoryBreakdown(weekOrders, '금주');

    return {
      weekStart: start,
      weekEnd: end,
      weekLogs,
      weekOrders,
      weekOrderTotal,
      weekOrderCount: weekOrders.length,
      weekActivityCount: weekLogs.length,
      openIssueCount: openIssues.length,
      repActivity,
      overdueIssues,
      breakdown,
    };
  }, [activityLogs, orders, accounts, openIssues, yearOrders, customerPlans, productPlans, planLookup]);

  /* ══════════════════════════════
     SECTION A — 매출·수주 현황 (팀별)
     ══════════════════════════════ */
  const sectionAData = useMemo(() => {
    const { start: wkStart, end: wkEnd, monday } = getWeekRangeByOffset(weekOffset);
    const wkMonth = monday.getMonth() + 1;
    const wkYear = monday.getFullYear();
    const monthStr = `${wkYear}-${String(wkMonth).padStart(2, '0')}`;
    const monthKey = String(wkMonth).padStart(2, '0');

    // 전주 끝 = 이번주 월요일 전날 (일요일)
    const prevWeekEnd = new Date(monday);
    prevWeekEnd.setDate(monday.getDate() - 1);
    const prevWeekEndStr = prevWeekEnd.toISOString().slice(0, 10);
    const monthStartStr = `${monthStr}-01`;

    // 주문 → 팀 매핑 함수
    const getTeamForOrder = (o) => {
      const plan = findPlanForOrder(o);
      return plan?.team || '기타';
    };

    // 당월 전체 주문
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(monthStr));
    // 금주 주문
    const thisWeekOrders = monthOrders.filter(o => (o.order_date || '') >= wkStart && (o.order_date || '') <= wkEnd);
    // 전주까지 누적 (당월 시작 ~ 금주 시작 전날)
    const prevWeekOrders = monthOrders.filter(o => (o.order_date || '') >= monthStartStr && (o.order_date || '') < wkStart);

    // 팀별 집계
    const teamData = {};
    TEAM_ORDER.forEach(team => {
      teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    });
    teamData['기타'] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };

    prevWeekOrders.forEach(o => {
      const team = getTeamForOrder(o);
      if (!teamData[team]) teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      teamData[team].prevCum += (o.order_amount || 0);
      teamData[team].monthCum += (o.order_amount || 0);
    });

    thisWeekOrders.forEach(o => {
      const team = getTeamForOrder(o);
      if (!teamData[team]) teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      teamData[team].thisWeek += (o.order_amount || 0);
      teamData[team].monthCum += (o.order_amount || 0);
    });

    // 당월 목표 (사업계획 팀별)
    customerPlans.forEach(p => {
      const team = p.team || '기타';
      if (!teamData[team]) teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      teamData[team].monthTarget += (p.targets?.[monthKey] || 0);
    });

    // 합계 행
    const total = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    Object.values(teamData).forEach(d => {
      total.prevCum += d.prevCum;
      total.thisWeek += d.thisWeek;
      total.monthCum += d.monthCum;
      total.monthTarget += d.monthTarget;
    });

    // 표시할 팀 목록 (TEAM_ORDER + 기타가 있으면)
    const displayTeams = [...TEAM_ORDER];
    if (teamData['기타'] && (teamData['기타'].prevCum > 0 || teamData['기타'].thisWeek > 0 || teamData['기타'].monthTarget > 0)) {
      displayTeams.push('기타');
    }

    return {
      wkStart, wkEnd, monday,
      weekLabel: getWeekLabel(monday),
      monthStr,
      teamData,
      displayTeams,
      total,
    };
  }, [orders, customerPlans, weekOffset, planLookup]);

  /* ══════════════════════════════
     MONTHLY DATA
     ══════════════════════════════ */
  const monthlyData = useMemo(() => {
    const thisMonthStr = getMonthStr();
    const monthKey = String(CURRENT_MONTH).padStart(2, '0');
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(thisMonthStr));
    const monthTotal = monthOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    // Category breakdowns for this month
    const breakdown = buildCategoryBreakdown(monthOrders, '당월');

    // Monthly breakdown rows with month target
    const buildMonthlyRows = (periodOrders, planSource, keyFn, targetKeyFn) => {
      const map = {};
      // targets from plans
      if (hasPlan) {
        planSource.forEach(p => {
          const key = keyFn(p);
          if (!map[key]) map[key] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
          map[key].annualTarget += (p.annual_target || 0);
          map[key].monthTarget += (p.targets?.[monthKey] || 0);
        });
      }
      periodOrders.forEach(o => {
        const key = targetKeyFn(o);
        if (!map[key]) map[key] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
        map[key].monthActual += (o.order_amount || 0);
      });
      yearOrders.forEach(o => {
        const key = targetKeyFn(o);
        if (!map[key]) map[key] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
        map[key].ytdActual += (o.order_amount || 0);
      });
      return Object.entries(map)
        .filter(([, v]) => v.monthTarget > 0 || v.monthActual > 0 || v.ytdActual > 0)
        .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
        .map(([label, v]) => ({ label, ...v }));
    };

    // Rep breakdown with month targets
    const repMonthRows = buildMonthlyRows(
      monthOrders, customerPlans,
      p => p.sales_rep || '미배정',
      o => { const plan = findPlanForOrder(o); return plan?.sales_rep || o.sales_rep || '기타'; }
    );

    // Product breakdown with month targets
    const prodMonthRows = buildMonthlyRows(
      monthOrders, productPlans,
      p => p.product || '기타',
      o => {
        const cat = (o.product_category || '').toLowerCase();
        if (!cat) return '기타';
        for (const pp of productPlans) {
          const pLow = (pp.product || '').toLowerCase();
          if (cat.includes(pLow) || pLow.includes(cat)) return pp.product;
        }
        return o.product_category || '기타';
      }
    );

    // Region breakdown with month targets
    const regMonthRows = buildMonthlyRows(
      monthOrders, customerPlans,
      p => p.region || '기타',
      o => { const plan = findPlanForOrder(o); const acc = accounts.find(a => a.id === o.account_id); return plan?.region || o.region || acc?.region || '기타'; }
    );

    // BizType breakdown with month targets
    const bizMonthRows = buildMonthlyRows(
      monthOrders, customerPlans,
      p => p.biz_type || '기타',
      o => { const plan = findPlanForOrder(o); const acc = accounts.find(a => a.id === o.account_id); return plan?.biz_type || acc?.business_type || '기타'; }
    );

    // Customer type breakdown with month targets
    const typeMonthRows = buildMonthlyRows(
      monthOrders, customerPlans,
      p => {
        const acc = p.account_id ? accounts.find(a => a.id === p.account_id) : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (p.customer_name || '').toLowerCase().trim());
        return acc?.business_type || p.biz_type || '';
      },
      o => { const acc = accounts.find(a => a.id === o.account_id); return acc?.business_type || ''; }
    ).filter(r => r.label);

    // Cross-selling aggregation from all accounts
    const csStats = { '미접촉': { count: 0, amount: 0 }, '제안중': { count: 0, amount: 0 }, '샘플진행': { count: 0, amount: 0 }, '수주완료': { count: 0, amount: 0 } };
    const csTopOpps = [];
    accounts.forEach(a => {
      const items = a.cross_selling || [];
      items.forEach(item => {
        if (item.status === '중단') return;
        const st = item.status || '미접촉';
        if (csStats[st]) {
          csStats[st].count++;
          csStats[st].amount += (Number(item.potential_amount) || 0);
        }
        if (st !== '수주완료' && (Number(item.potential_amount) || 0) > 0) {
          csTopOpps.push({
            company: a.company_name,
            product: item.target_product,
            status: item.status,
            amount: Number(item.potential_amount) || 0,
          });
        }
      });
    });
    csTopOpps.sort((a, b) => b.amount - a.amount);

    // FCST vs Actual for current month
    const fcstVsActual = [];
    forecasts.filter(f => f.year === CURRENT_YEAR).forEach(f => {
      // match forecasts that cover current month
      const curQ = Math.ceil(CURRENT_MONTH / 3);
      const fPeriod = f.period || '';
      const fQ = fPeriod === 'Q1' ? 1 : fPeriod === 'Q2' ? 2 : fPeriod === 'Q3' ? 3 : fPeriod === 'Q4' ? 4 : 0;
      if (fQ !== curQ) return;

      const periodOrders = orders.filter(o => {
        if (!o.order_date) return false;
        const y = parseInt(o.order_date.slice(0, 4));
        if (y !== f.year) return false;
        const m = parseInt(o.order_date.slice(5, 7));
        if (fPeriod === 'Q1') return m >= 1 && m <= 3;
        if (fPeriod === 'Q2') return m >= 4 && m <= 6;
        if (fPeriod === 'Q3') return m >= 7 && m <= 9;
        if (fPeriod === 'Q4') return m >= 10 && m <= 12;
        return false;
      });
      const actual = periodOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
      const account = accounts.find(a => a.id === f.account_id);
      fcstVsActual.push({
        company_name: account?.company_name || f.customer_name || '?',
        forecast: f.forecast_amount || 0,
        actual,
        diff: actual - (f.forecast_amount || 0),
        period: f.period,
        note: actual === 0 ? '실적 없음' : actual >= (f.forecast_amount || 0) ? '목표 초과' : '목표 미달',
      });
    });
    fcstVsActual.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return {
      thisMonthStr,
      monthTotal,
      monthOrders,
      repMonthRows,
      prodMonthRows,
      regMonthRows,
      bizMonthRows,
      typeMonthRows,
      csStats,
      csTopOpps,
      fcstVsActual,
    };
  }, [accounts, orders, yearOrders, forecasts, customerPlans, productPlans, planLookup, hasPlan]);

  /* ── Deep GAP Analysis Data ── */
  const gapAnalysisData = useMemo(() => {
    if (!hasPlan) return null;
    const monthKey = String(CURRENT_MONTH).padStart(2, '0');
    const yearStr = String(CURRENT_YEAR);

    // 1. 고객별 Gap 계산 + gap_analysis 데이터 수집
    const customerGaps = [];
    const planByCustomer = {};
    customerPlans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (!planByCustomer[key]) planByCustomer[key] = { plans: [], name: p.customer_name, rep: p.sales_rep };
      planByCustomer[key].plans.push(p);
    });

    Object.entries(planByCustomer).forEach(([key, { plans, name, rep }]) => {
      let ytdTarget = 0;
      plans.forEach(p => {
        for (let m = 1; m <= CURRENT_MONTH; m++) {
          ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
        }
      });
      const annualTarget = plans.reduce((s, p) => s + (p.annual_target || 0), 0);
      const ytdActual = yearOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === key || plans.some(p => p.account_id && p.account_id === o.account_id))
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const ytdGap = ytdActual - ytdTarget;
      const account = accounts.find(a => (a.company_name || '').toLowerCase().trim() === key) ||
                       accounts.find(a => plans.some(p => p.account_id === a.id));

      customerGaps.push({
        name, rep, key,
        annualTarget, ytdTarget, ytdActual, ytdGap,
        achieveRate: ytdTarget > 0 ? Math.round((ytdActual / ytdTarget) * 100) : (ytdActual > 0 ? 999 : 0),
        account,
        gapAnalysis: account?.gap_analysis || {},
        score: account?.intelligence?.total_score || 0,
      });
    });

    // 2. Gap 원인별 집계
    const causeAgg = {};
    GAP_CAUSES.forEach(c => { causeAgg[c.key] = { ...c, count: 0, totalGap: 0, customers: [] }; });
    customerGaps.forEach(cg => {
      const causes = cg.gapAnalysis?.causes || [];
      causes.forEach(causeKey => {
        if (causeAgg[causeKey]) {
          causeAgg[causeKey].count++;
          causeAgg[causeKey].totalGap += Math.abs(Math.min(0, cg.ytdGap));
          causeAgg[causeKey].customers.push(cg.name);
        }
      });
    });
    const causeRanking = Object.values(causeAgg)
      .filter(c => c.count > 0)
      .sort((a, b) => b.totalGap - a.totalGap || b.count - a.count);

    // 3. Gap 상위 미달 고객 (top 10)
    const topGapCustomers = [...customerGaps]
      .filter(c => c.ytdGap < 0)
      .sort((a, b) => a.ytdGap - b.ytdGap)
      .slice(0, 10);

    // 4. Intelligence Score 미비 항목 자동 추출
    const getMissingIntelligence = (account) => {
      if (!account?.intelligence?.categories) return [];
      const missing = [];
      SCORE_CATEGORIES.forEach(cat => {
        const catData = account.intelligence.categories[cat.key];
        if (!catData?.items) {
          missing.push({ category: cat.label, items: cat.items.map(i => i.label) });
          return;
        }
        const missingItems = cat.items.filter(it => !catData.items[it.key]).map(it => it.label);
        if (missingItems.length > 0) {
          missing.push({ category: cat.label, items: missingItems, weight: cat.weight });
        }
      });
      return missing.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    };

    // 5. 기회 파이프라인 집계
    const allOpportunities = [];
    accounts.forEach(a => {
      const opps = a.gap_analysis?.opportunities || [];
      opps.forEach(opp => {
        allOpportunities.push({
          ...opp,
          company: a.company_name,
          rep: a.sales_rep,
        });
      });
    });
    const oppByType = {};
    OPPORTUNITY_TYPES.forEach(t => { oppByType[t.key] = { ...t, count: 0, totalAmount: 0, weightedAmount: 0 }; });
    allOpportunities.forEach(opp => {
      if (oppByType[opp.type]) {
        oppByType[opp.type].count++;
        oppByType[opp.type].totalAmount += (opp.amount || 0);
        oppByType[opp.type].weightedAmount += (opp.amount || 0) * (opp.probability || 0) / 100;
      }
    });
    const oppSummary = Object.values(oppByType).filter(o => o.count > 0);
    const totalOppWeighted = allOpportunities.reduce((s, o) => s + (o.amount || 0) * (o.probability || 0) / 100, 0);

    // 6. AM별 활동 품질 지표 — plan sales_rep 기준
    const amMetrics = {};
    const amReps = new Set();
    // teamMembers만 사용 (불필요한 담당자 제외)
    teamMembers.forEach(r => amReps.add(r));

    amReps.forEach(rep => {
      const repAccounts = accounts.filter(a => a.sales_rep === rep);
      const repPlans = customerPlans.filter(p => p.sales_rep === rep);
      if (repAccounts.length === 0 && repPlans.length === 0) return;

      const repLogs = activityLogs.filter(l => l.sales_rep === rep);
      const last90 = new Date(); last90.setDate(last90.getDate() - 90);
      const last90Str = last90.toISOString().slice(0, 10);
      const recentLogs = repLogs.filter(l => l.date >= last90Str);

      const avgScore = repAccounts.length > 0
        ? Math.round(repAccounts.reduce((s, a) => s + (a.intelligence?.total_score || 0), 0) / repAccounts.length)
        : 0;

      const actionPlans = repAccounts.map(a => a.gap_analysis?.action_plan || []).flat();
      const totalActions = actionPlans.filter(a => a.text?.trim()).length;
      const doneActions = actionPlans.filter(a => a.text?.trim() && a.done).length;

      const repGapCustomers = customerGaps.filter(c => c.rep === rep);
      const repYtdTarget = repGapCustomers.reduce((s, c) => s + c.ytdTarget, 0);
      const repYtdActual = repGapCustomers.reduce((s, c) => s + c.ytdActual, 0);

      amMetrics[rep] = {
        accountCount: Math.max(repAccounts.length, repPlans.length),
        contactCount90d: recentLogs.length,
        avgContactFreq: repAccounts.length > 0 ? (recentLogs.length / repAccounts.length).toFixed(1) : 0,
        avgScore,
        actionTotal: totalActions,
        actionDone: doneActions,
        actionRate: totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0,
        ytdTarget: repYtdTarget,
        ytdActual: repYtdActual,
        achieveRate: repYtdTarget > 0 ? Math.round((repYtdActual / repYtdTarget) * 100) : 0,
        gapCauses: (() => {
          const causes = {};
          repAccounts.forEach(a => {
            (a.gap_analysis?.causes || []).forEach(c => { causes[c] = (causes[c] || 0) + 1; });
          });
          return Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 3);
        })(),
      };
    });

    return {
      customerGaps,
      causeRanking,
      topGapCustomers,
      getMissingIntelligence,
      allOpportunities,
      oppSummary,
      totalOppWeighted,
      amMetrics,
    };
  }, [accounts, activityLogs, yearOrders, customerPlans, hasPlan]);

  /* ══════════════════════════════
     EXCEL DOWNLOAD
     ══════════════════════════════ */
  const handleExcelDownload = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      if (tab === 'weekly') {
        const rows = [
          ['주간 리포트', `${weeklyData.weekStart} ~ ${weeklyData.weekEnd}`],
          [],
          ['[Executive Summary]'],
          ['금주 수주', weeklyData.weekOrderTotal],
          ['금주 활동', weeklyData.weekActivityCount],
          ['Open 이슈', weeklyData.openIssueCount],
          ...(planSummary ? [['YTD 달성률', `${pct(planSummary.ytdActual, planSummary.ytdTarget)}%`]] : []),
          [],
          ['[금주 수주 현황]'],
          ['고객명', '제품군', '수주금액', '담당자', '오더일'],
          ...weeklyData.weekOrders.map(o => {
            const acc = accounts.find(a => a.id === o.account_id);
            return [o.customer_name || acc?.company_name || '?', o.product_category || '', o.order_amount || 0, o.sales_rep || '', o.order_date || ''];
          }),
          [],
          ['[금주 활동 요약]'],
          ['담당자', '컨택건수', '수주활동', '크로스셀링', '주요 내용'],
          ...Object.entries(weeklyData.repActivity)
            .filter(([, v]) => v.contacts > 0)
            .map(([rep, v]) => [rep, v.contacts, v.orderActivity, v.crossSelling, v.latestContent]),
          [],
          ...(planSummary ? [
            ['[사업계획 YTD 진도]'],
            ['연간목표', planSummary.annualTarget],
            ['YTD목표', planSummary.ytdTarget],
            ['YTD실적', planSummary.ytdActual],
            ['YTD달성률', `${pct(planSummary.ytdActual, planSummary.ytdTarget)}%`],
            [],
            ['담당자', 'YTD목표', 'YTD실적', '달성률'],
            ...Object.entries(planSummary.byRep).map(([rep, v]) => [rep, v.ytdTarget, v.ytdActual, v.ytdTarget > 0 ? `${pct(v.ytdActual, v.ytdTarget)}%` : '-']),
          ] : []),
          [],
          ['[담당자별 금주실적]'],
          ['구분', '금주 수주', 'YTD 실적', '연간 목표', '달성률'],
          ...weeklyData.breakdown.repRows.map(r => [r.label, r.periodActual, r.ytdActual, r.annualTarget, r.annualTarget > 0 ? `${pct(r.ytdActual, r.annualTarget)}%` : '-']),
          [],
          ['[품목별 금주실적]'],
          ['구분', '금주 수주', 'YTD 실적', '연간 목표', '달성률'],
          ...weeklyData.breakdown.prodRows.map(r => [r.label, r.periodActual, r.ytdActual, r.annualTarget, r.annualTarget > 0 ? `${pct(r.ytdActual, r.annualTarget)}%` : '-']),
          [],
          ['[지역별 금주실적]'],
          ['구분', '금주 수주', 'YTD 실적', '연간 목표', '달성률'],
          ...(weeklyData.breakdown.regRows || []).map(r => [r.label, r.periodActual, r.ytdActual, r.annualTarget, r.annualTarget > 0 ? `${pct(r.ytdActual, r.annualTarget)}%` : '-']),
          [],
          ['[Open 이슈 (Top 10)]'],
          ['고객명', '유형', '상태', '날짜', '내용'],
          ...openIssues
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .slice(0, 10)
            .map(l => {
              const acc = accounts.find(a => a.id === l.account_id);
              return [acc?.company_name || '?', l.issue_type || '', l.status || '', l.date || '', l.content || ''];
            }),
          [],
          ['[기한 초과 이슈 (14일+)]'],
          ['고객명', '유형', '경과일수', '내용'],
          ...weeklyData.overdueIssues.slice(0, 10).map(l => [l.company_name || '', l.issue_type || '', `${daysSince(l.date)}일`, l.content || '']),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws, '주간리포트');

      } else {
        const rows = [
          ['월간 리포트', monthlyData.thisMonthStr],
          [],
          ...(planSummary ? [
            ['[월간 실적 Summary]'],
            ['당월 목표', planSummary.monthTarget],
            ['당월 실적', planSummary.monthActual],
            ['당월 달성률', `${pct(planSummary.monthActual, planSummary.monthTarget)}%`],
            ['YTD 목표', planSummary.ytdTarget],
            ['YTD 실적', planSummary.ytdActual],
            ['YTD 달성률', `${pct(planSummary.ytdActual, planSummary.ytdTarget)}%`],
          ] : [
            ['당월 수주액', monthlyData.monthTotal],
          ]),
          [],
          ['[담당자별 당월 실적]'],
          ['구분', '당월목표', '당월실적', '당월달성률', 'YTD실적', '연간목표', '연간달성률'],
          ...monthlyData.repMonthRows.map(r => [r.label, r.monthTarget, r.monthActual, r.monthTarget > 0 ? `${pct(r.monthActual, r.monthTarget)}%` : '-', r.ytdActual, r.annualTarget, r.annualTarget > 0 ? `${pct(r.ytdActual, r.annualTarget)}%` : '-']),
          [],
          ['[품목별 당월 실적]'],
          ['구분', '당월목표', '당월실적', '당월달성률', 'YTD실적', '연간목표', '연간달성률'],
          ...monthlyData.prodMonthRows.map(r => [r.label, r.monthTarget, r.monthActual, r.monthTarget > 0 ? `${pct(r.monthActual, r.monthTarget)}%` : '-', r.ytdActual, r.annualTarget, r.annualTarget > 0 ? `${pct(r.ytdActual, r.annualTarget)}%` : '-']),
          [],
          ...(planSummary?.accountPlanVsActual?.length > 0 ? [
            ['[고객별 당월 실적]'],
            ['고객명', '담당자', '당월 목표', '당월 실적', '달성률', 'YTD 실적'],
            ...planSummary.accountPlanVsActual.slice(0, 20).map(a => [a.name, a.rep, a.target, a.actual, `${a.pct}%`, a.ytdActual]),
          ] : []),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, '월간리포트');

        // Cross-Selling sheet
        if (monthlyData.csTopOpps?.length > 0) {
          const csRows = [
            ['Cross-Selling 현황'],
            [],
            ['상태', '건수', '금액'],
            ...Object.entries(monthlyData.csStats).map(([st, v]) => [st, v.count, v.amount]),
            [],
            ['[Top 기회]'],
            ['고객명', '타겟 제품', '상태', '예상 금액'],
            ...monthlyData.csTopOpps.slice(0, 15).map(o => [o.company, o.product, o.status, o.amount]),
          ];
          const wcs = XLSX.utils.aoa_to_sheet(csRows);
          wcs['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
          XLSX.utils.book_append_sheet(wb, wcs, '크로스셀링');
        }

        // FCST vs Actual sheet
        if (monthlyData.fcstVsActual?.length > 0) {
          const fcstRows = [
            ['FCST vs Actual (당분기)'],
            [],
            ['고객명', '예측금액', '실적금액', '차이', '비고'],
            ...monthlyData.fcstVsActual.map(f => [f.company_name, f.forecast, f.actual, f.diff, f.note || '']),
          ];
          const wfc = XLSX.utils.aoa_to_sheet(fcstRows);
          wfc['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 25 }];
          XLSX.utils.book_append_sheet(wb, wfc, 'FCST vs Actual');
        }

        // Deep GAP Analysis sheets
        if (gapAnalysisData) {
          // GAP-1: 원인분석 sheet
          const gapRows = [
            ['심층 Gap 분석 — 원인분석'],
            [],
            ['원인', '건수', '영향금액', '관련 고객'],
            ...gapAnalysisData.causeRanking.map(c => [
              `${c.icon} ${c.label}`, c.count, c.totalGap, c.customers.slice(0, 5).join(', ') + (c.customers.length > 5 ? ` 외 ${c.customers.length - 5}` : ''),
            ]),
          ];
          // GAP-2: 고객별 심층분석
          if (gapAnalysisData.topGapCustomers.length > 0) {
            gapRows.push([], [], ['[고객별 심층분석 — Gap 상위]']);
            gapRows.push(['고객명', '담당', 'YTD Gap', '달성률', 'Gap 원인', 'Score', '미비정보', '액션플랜']);
            gapAnalysisData.topGapCustomers.forEach(cg => {
              const causes = (cg.gapAnalysis?.causes || []).map(k => GAP_CAUSES.find(c => c.key === k)).filter(Boolean);
              const missingInfo = gapAnalysisData.getMissingIntelligence(cg.account);
              const actionPlan = (cg.gapAnalysis?.action_plan || []).filter(a => a.text?.trim());
              const actionDone = actionPlan.filter(a => a.done).length;
              gapRows.push([
                cg.name, cg.rep, cg.ytdGap, `${cg.achieveRate}%`,
                causes.map(c => c.label).join(', ') || '미분석',
                `${cg.score}%`,
                missingInfo.slice(0, 3).map(m => m.category).join(', ') || '완비',
                actionPlan.length > 0 ? `${actionDone}/${actionPlan.length} 완료` : '미설정',
              ]);
            });
          }
          const wg1 = XLSX.utils.aoa_to_sheet(gapRows);
          wg1['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 25 }, { wch: 15 }];
          XLSX.utils.book_append_sheet(wb, wg1, 'Gap 원인·고객분석');

          // GAP-3: 기회 파이프라인 sheet
          if (gapAnalysisData.allOpportunities.length > 0) {
            const oppRows = [
              ['기회 파이프라인 (Gap 만회)', '', '', '', '가중합계:', gapAnalysisData.totalOppWeighted],
              [],
              ['[유형별 요약]'],
              ['유형', '건수', '총 금액', '가중 금액'],
              ...gapAnalysisData.oppSummary.map(o => [o.label, o.count, o.totalAmount, Math.round(o.weightedAmount)]),
              [],
              ['[주요 기회 상세]'],
              ['고객명', '유형', '품목', '예상금액', '확률', '가중금액', '예상시기'],
              ...gapAnalysisData.allOpportunities
                .sort((a, b) => (b.amount * b.probability) - (a.amount * a.probability))
                .slice(0, 20)
                .map(opp => {
                  const typeInfo = OPPORTUNITY_TYPES.find(t => t.key === opp.type);
                  return [opp.company, typeInfo?.label || opp.type, opp.product || '', opp.amount || 0, `${opp.probability || 0}%`, Math.round((opp.amount || 0) * (opp.probability || 0) / 100), opp.expected_date || ''];
                }),
            ];
            const wg2 = XLSX.utils.aoa_to_sheet(oppRows);
            wg2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(wb, wg2, '기회 파이프라인');
          }

          // GAP-4: AM별 활동 품질 sheet
          const amEntries = Object.entries(gapAnalysisData.amMetrics);
          if (amEntries.length > 0) {
            const amRows = [
              ['AM별 활동 품질 지표'],
              [],
              ['담당자', '고객수', '90일 컨택', '고객당 빈도', '평균 Score', '액션 실행률', 'YTD 달성률', '주요 Gap 원인'],
              ...amEntries
                .sort((a, b) => b[1].achieveRate - a[1].achieveRate)
                .map(([rep, m]) => [
                  rep, m.accountCount, `${m.contactCount90d}건`, m.avgContactFreq,
                  `${m.avgScore}%`,
                  m.actionTotal > 0 ? `${m.actionRate}% (${m.actionDone}/${m.actionTotal})` : '미설정',
                  m.ytdTarget > 0 ? `${m.achieveRate}%` : '-',
                  m.gapCauses.map(([k, cnt]) => {
                    const c = GAP_CAUSES.find(gc => gc.key === k);
                    return `${c?.label || k}(${cnt})`;
                  }).join(', ') || '-',
                ]),
            ];
            const wg3 = XLSX.utils.aoa_to_sheet(amRows);
            wg3['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, wg3, 'AM 활동 품질');
          }
        }
      }

      XLSX.writeFile(wb, `Account_CRM_${tab === 'weekly' ? '주간' : '월간'}_리포트_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Excel 다운로드 실패:', err);
    }
  };

  /* ══════════════════════════════
     RENDER
     ══════════════════════════════ */
  return (
    <div>
      {/* Tab bar + download */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`topbar-tab ${tab === 'weekly' ? 'active' : ''}`} onClick={() => setTab('weekly')}>주간 리포트</button>
          <button className={`topbar-tab ${tab === 'monthly' ? 'active' : ''}`} onClick={() => setTab('monthly')}>월간 리포트</button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => window.print()} style={{ fontSize: 11 }}>인쇄</button>
          <button className="btn btn-success" onClick={handleExcelDownload}>Excel 다운로드</button>
        </div>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="print-header" style={{ display: 'none' }}>
        <h1>Bio Protech 영업본부 {tab === 'weekly' ? '주간' : '월간'} 리포트</h1>
        <div className="print-subtitle">
          {tab === 'weekly' ? `${weeklyData.weekStart} ~ ${weeklyData.weekEnd}` : monthlyData.thisMonthStr}
          {' | '}출력일: {new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
         WEEKLY REPORT
         ═══════════════════════════════════════════════ */}
      {tab === 'weekly' && (
        <div>
          {/* ── 주차 네비게이터 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            marginBottom: 16, padding: '10px 0',
          }}>
            <button className="btn btn-ghost" onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 13, padding: '6px 12px' }}>◀ 이전 주</button>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 200, textAlign: 'center' }}>
              {sectionAData.weekLabel} ({sectionAData.wkStart} ~ {sectionAData.wkEnd})
            </div>
            <button className="btn btn-ghost" onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 13, padding: '6px 12px' }} disabled={weekOffset >= 0}>다음 주 ▶</button>
            {weekOffset !== 0 && (
              <button className="btn btn-ghost" onClick={() => setWeekOffset(0)} style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text3)' }}>이번 주로</button>
            )}
          </div>

          {/* ══ 섹션 A — 매출·수주 현황 ══ */}
          {hasPlan && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 1. 수주 현황</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[단위: 백만원 / %]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 90 }}>구분</th>
                      <th style={{ textAlign: 'right' }}>전주 누적</th>
                      <th style={{ textAlign: 'right' }}>금주 신규</th>
                      <th style={{ textAlign: 'right' }}>당월 누적</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAData.displayTeams.map(team => {
                      const d = sectionAData.teamData[team];
                      const rate = pct(d.monthCum, d.monthTarget);
                      return (
                        <tr key={team}>
                          <td style={{ fontWeight: 600 }}>{TEAM_DISPLAY[team] || team}</td>
                          <td style={{ textAlign: 'right' }}>{fmtM(d.prevCum)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: d.thisWeek > 0 ? 'var(--accent)' : undefined }}>{fmtM(d.thisWeek)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(d.monthCum)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(d.monthTarget)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(rate) }}>{d.monthTarget > 0 ? `${rate}%` : '-'}</td>
                        </tr>
                      );
                    })}
                    {/* 합계 행 */}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td>합계</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.total.prevCum)}</td>
                      <td style={{ textAlign: 'right', color: sectionAData.total.thisWeek > 0 ? 'var(--accent)' : undefined }}>{fmtM(sectionAData.total.thisWeek)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.total.monthCum)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(sectionAData.total.monthTarget)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(pct(sectionAData.total.monthCum, sectionAData.total.monthTarget)) }}>
                        {sectionAData.total.monthTarget > 0 ? `${pct(sectionAData.total.monthCum, sectionAData.total.monthTarget)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 수주: Import 실적 기준 / 목표: 사업계획 Import 고정값 / 전주 누적: 당월 1일 ~ 금주 시작 전일
              </div>
            </div>
          )}

          <div className="report-section-title" style={{ marginTop: 8 }}>주간 리포트 ({weeklyData.weekStart} ~ {weeklyData.weekEnd})</div>

          {/* Section 1: Executive Summary */}
          <div className="kpi-grid" style={{ gridTemplateColumns: hasPlan ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
            <div className="kpi accent">
              <div className="kpi-label">금주 수주</div>
              <div className="kpi-value">{fmtKRW(weeklyData.weekOrderTotal)}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{weeklyData.weekOrderCount}건</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">금주 활동</div>
              <div className="kpi-value">{weeklyData.weekActivityCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>컨택건수</div>
            </div>
            <div className={`kpi ${weeklyData.openIssueCount > 0 ? 'red' : 'green'}`}>
              <div className="kpi-label">Open 이슈</div>
              <div className="kpi-value">{weeklyData.openIssueCount}</div>
            </div>
            {hasPlan && planSummary && (
              <div className={`kpi ${pctColor(pct(planSummary.ytdActual, planSummary.ytdTarget))}`}>
                <div className="kpi-label">YTD 달성률</div>
                <div className="kpi-value">{pct(planSummary.ytdActual, planSummary.ytdTarget)}%</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtKRW(planSummary.ytdActual)} / {fmtKRW(planSummary.ytdTarget)}</div>
              </div>
            )}
          </div>

          {/* Section 2: 금주 수주 현황 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">금주 수주 현황</div>
            {weeklyData.weekOrders.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>금주 수주 없음</div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 250 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>고객명</th>
                      <th>제품군</th>
                      <th style={{ textAlign: 'right' }}>수주금액</th>
                      <th>담당자</th>
                      <th>오더일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyData.weekOrders
                      .sort((a, b) => (b.order_amount || 0) - (a.order_amount || 0))
                      .map((o, i) => {
                        const acc = accounts.find(a => a.id === o.account_id);
                        return (
                          <tr key={o.id || i}>
                            <td style={{ fontWeight: 600 }}>{o.customer_name || acc?.company_name || '?'}</td>
                            <td>{o.product_category || '-'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(o.order_amount)}</td>
                            <td>{o.sales_rep || acc?.sales_rep || '-'}</td>
                            <td style={{ fontSize: 11 }}>{o.order_date || '-'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 3: 금주 활동 요약 (per rep) */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">금주 활동 요약</div>
            <div className="table-wrap" style={{ maxHeight: 250 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>담당자</th>
                    <th style={{ textAlign: 'right' }}>컨택건수</th>
                    <th style={{ textAlign: 'right' }}>수주활동</th>
                    <th style={{ textAlign: 'right' }}>크로스셀링</th>
                    <th>주요 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(weeklyData.repActivity)
                    .filter(([, v]) => v.contacts > 0)
                    .sort((a, b) => b[1].contacts - a[1].contacts)
                    .map(([rep, v]) => (
                      <tr key={rep}>
                        <td style={{ fontWeight: 600 }}>{rep}</td>
                        <td style={{ textAlign: 'right' }}>{v.contacts}</td>
                        <td style={{ textAlign: 'right' }}>{v.orderActivity}</td>
                        <td style={{ textAlign: 'right' }}>{v.crossSelling}</td>
                        <td style={{ fontSize: 11, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.latestContent || '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: 사업계획 YTD 진도 */}
          {planSummary && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">사업계획 YTD 진도</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                <div className="kpi" style={{ padding: 10 }}>
                  <div className="kpi-label">연간 목표</div>
                  <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.annualTarget)}</div>
                </div>
                <div className="kpi" style={{ padding: 10 }}>
                  <div className="kpi-label">YTD 목표</div>
                  <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.ytdTarget)}</div>
                </div>
                <div className="kpi" style={{ padding: 10 }}>
                  <div className="kpi-label">YTD 실적</div>
                  <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.ytdActual)}</div>
                </div>
                <div className={`kpi ${pctColor(pct(planSummary.ytdActual, planSummary.ytdTarget))}`} style={{ padding: 10 }}>
                  <div className="kpi-label">달성률</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>{pct(planSummary.ytdActual, planSummary.ytdTarget)}%</div>
                </div>
              </div>

              <div className="table-wrap" style={{ maxHeight: 200 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>담당자</th>
                      <th style={{ textAlign: 'right' }}>YTD 목표</th>
                      <th style={{ textAlign: 'right' }}>YTD 실적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(planSummary.byRep)
                      .filter(([, v]) => v.ytdTarget > 0 || v.ytdActual > 0)
                      .sort((a, b) => b[1].ytdTarget - a[1].ytdTarget)
                      .map(([rep, v]) => (
                        <tr key={rep}>
                          <td style={{ fontWeight: 600 }}>{rep}</td>
                          <td style={{ textAlign: 'right' }}>{fmtKRW(v.ytdTarget)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(v.ytdActual)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`score-badge ${pctColor(pct(v.ytdActual, v.ytdTarget))}`}>{pct(v.ytdActual, v.ytdTarget)}%</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 5: 시각적 차트 */}
          {hasPlan && weeklyData.breakdown.repRows.length > 0 && (
            <div className="two-col" style={{ marginBottom: 16 }}>
              <HBarChart
                title="담당자별 YTD 달성률"
                rows={weeklyData.breakdown.repRows.filter(r => r.annualTarget > 0).map(r => ({
                  label: r.label, target: r.annualTarget, actual: r.ytdActual,
                }))}
              />
              <DonutChart
                title="품목별 YTD 실적 비중"
                slices={weeklyData.breakdown.prodRows.filter(r => r.ytdActual > 0).map(r => ({
                  label: r.label, value: r.ytdActual,
                }))}
              />
            </div>
          )}

          {hasPlan && weeklyData.breakdown.repRows.length > 0 && (
            <ProgressBars
              title="담당자별 연간 목표 달성 진도"
              items={weeklyData.breakdown.repRows.filter(r => r.annualTarget > 0).map(r => ({
                label: r.label, value: r.ytdActual, max: r.annualTarget,
              }))}
            />
          )}

          {/* Section 5b: 주간 담당/품목/지역/사업구분별 실적 */}
          {(weeklyData.breakdown.repRows.length > 0 || weeklyData.breakdown.prodRows.length > 0) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">주간 분류별 실적 (상세)</div>
              <BreakdownTable title="담당자별 금주 실적" rows={weeklyData.breakdown.repRows} periodLabel="금주" showYtd showAnnual={hasPlan} />
              <BreakdownTable title="품목별 금주 실적" rows={weeklyData.breakdown.prodRows} periodLabel="금주" showYtd showAnnual={productPlans.length > 0} />
              <BreakdownTable title="지역별 금주 실적" rows={weeklyData.breakdown.regRows} periodLabel="금주" showYtd showAnnual={hasPlan} />
              <BreakdownTable title="사업구분별 금주 실적" rows={weeklyData.breakdown.bizRows} periodLabel="금주" showYtd showAnnual={hasPlan} />
              {weeklyData.breakdown.typeRows?.length > 0 && (
                <BreakdownTable title="고객유형별 금주 실적" rows={weeklyData.breakdown.typeRows} periodLabel="금주" showYtd showAnnual={hasPlan} />
              )}
            </div>
          )}

          {/* Section 6: 주요 이슈 & 다음 주 계획 */}
          <div className="two-col">
            <div className="card">
              <div className="card-title">Open 이슈 (Top 10)</div>
              {openIssues.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--green)', fontSize: 12 }}>진행 중인 이슈가 없습니다</div>
              ) : (
                <div className="issue-list">
                  {openIssues
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 10)
                    .map(l => {
                      const account = accounts.find(a => a.id === l.account_id);
                      return (
                        <div key={l.id} className="issue-row">
                          <span className="issue-company">{account?.company_name || '?'}</span>
                          <span className={`issue-badge ${l.issue_type?.replace('\xb7', '')}`}>{l.issue_type}</span>
                          <span className={`status-badge ${l.status === 'Open' ? 'open' : 'in-progress'}`}>{l.status}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{l.date}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">기한 초과 이슈 (14일+)</div>
              {weeklyData.overdueIssues.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--green)', fontSize: 12 }}>해당 없음</div>
              ) : (
                <div className="issue-list">
                  {weeklyData.overdueIssues.slice(0, 10).map(l => (
                    <div key={l.id} className="issue-row">
                      <span className="issue-company">{l.company_name}</span>
                      <span className={`issue-badge ${l.issue_type?.replace('\xb7', '')}`}>{l.issue_type}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--red)' }}>{daysSince(l.date)}일 경과</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
         MONTHLY REPORT
         ═══════════════════════════════════════════════ */}
      {tab === 'monthly' && (
        <div>
          <div className="report-section-title">월간 리포트 ({monthlyData.thisMonthStr})</div>

          {/* Section 1: 월간 실적 Summary */}
          {planSummary ? (
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
              <div className="kpi">
                <div className="kpi-label">당월 목표</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.monthTarget)}</div>
              </div>
              <div className="kpi accent">
                <div className="kpi-label">당월 실적</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.monthActual)}</div>
              </div>
              <div className={`kpi ${pctColor(pct(planSummary.monthActual, planSummary.monthTarget))}`}>
                <div className="kpi-label">당월 달성률</div>
                <div className="kpi-value">{pct(planSummary.monthActual, planSummary.monthTarget)}%</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">YTD 목표</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.ytdTarget)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">YTD 실적</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planSummary.ytdActual)}</div>
              </div>
              <div className={`kpi ${pctColor(pct(planSummary.ytdActual, planSummary.ytdTarget))}`}>
                <div className="kpi-label">YTD 달성률</div>
                <div className="kpi-value">{pct(planSummary.ytdActual, planSummary.ytdTarget)}%</div>
              </div>
            </div>
          ) : (
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div className="kpi accent">
                <div className="kpi-label">당월 수주액</div>
                <div className="kpi-value">{fmtKRW(monthlyData.monthTotal)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">YTD 수주액</div>
                <div className="kpi-value">{fmtKRW(yearOrders.reduce((s, o) => s + (o.order_amount || 0), 0))}</div>
              </div>
            </div>
          )}

          {/* Section 2: 시각적 차트 */}
          {monthlyData.repMonthRows.length > 0 && (
            <div className="two-col" style={{ marginBottom: 16 }}>
              <HBarChart
                title="담당자별 당월 목표 vs 실적"
                rows={monthlyData.repMonthRows.filter(r => r.monthTarget > 0).map(r => ({
                  label: r.label, target: r.monthTarget, actual: r.monthActual,
                }))}
              />
              <HBarChart
                title="담당자별 YTD 목표 vs 실적"
                rows={monthlyData.repMonthRows.filter(r => r.annualTarget > 0).map(r => ({
                  label: r.label, target: r.annualTarget, actual: r.ytdActual,
                }))}
              />
            </div>
          )}

          {monthlyData.prodMonthRows.length > 0 && (
            <div className="two-col" style={{ marginBottom: 16 }}>
              <DonutChart
                title="품목별 당월 실적 비중"
                slices={monthlyData.prodMonthRows.filter(r => r.monthActual > 0).map(r => ({
                  label: r.label, value: r.monthActual,
                }))}
              />
              <DonutChart
                title="지역별 당월 실적 비중"
                slices={(monthlyData.regMonthRows || []).filter(r => r.monthActual > 0).map(r => ({
                  label: r.label, value: r.monthActual,
                }))}
              />
            </div>
          )}

          {monthlyData.repMonthRows.length > 0 && (
            <ProgressBars
              title="담당자별 연간 달성 진도"
              items={monthlyData.repMonthRows.filter(r => r.annualTarget > 0).map(r => ({
                label: r.label, value: r.ytdActual, max: r.annualTarget,
              }))}
            />
          )}

          {/* Section 2b: 당월 분류별 실적 (상세 테이블) */}
          {(monthlyData.repMonthRows.length > 0 || monthlyData.prodMonthRows.length > 0) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">당월 분류별 실적 (상세)</div>
              <MonthlyBreakdownTable title="담당자별" rows={monthlyData.repMonthRows} />
              <MonthlyBreakdownTable title="품목별" rows={monthlyData.prodMonthRows} />
              <MonthlyBreakdownTable title="지역별" rows={monthlyData.regMonthRows} />
              <MonthlyBreakdownTable title="사업구분별" rows={monthlyData.bizMonthRows} />
              {monthlyData.typeMonthRows?.length > 0 && (
                <MonthlyBreakdownTable title="고객유형별" rows={monthlyData.typeMonthRows} />
              )}
            </div>
          )}

          {/* Section 3: 고객별 당월 실적 */}
          {planSummary?.accountPlanVsActual?.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">고객별 당월 실적</div>
              <div className="table-wrap" style={{ maxHeight: 300 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>고객명</th>
                      <th>담당자</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>당월 실적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'right' }}>YTD 실적</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planSummary.accountPlanVsActual.slice(0, 20).map(a => (
                      <tr key={a.key}>
                        <td style={{ fontWeight: 600, fontSize: 11 }}>{a.name}</td>
                        <td style={{ fontSize: 11 }}>{a.rep}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(a.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(a.actual)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`score-badge ${pctColor(a.pct)}`}>{a.pct}%</span>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(a.ytdActual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 4: Cross-Selling 현황 */}
          {(monthlyData.csStats['미접촉'].count > 0 || monthlyData.csStats['제안중'].count > 0 || monthlyData.csStats['샘플진행'].count > 0 || monthlyData.csStats['수주완료'].count > 0) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Cross-Selling 현황</div>
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 12 }}>
                {Object.entries(monthlyData.csStats).map(([st, v]) => (
                  <div key={st} className={`kpi ${st === '수주완료' ? 'green' : ''}`} style={{ padding: 10 }}>
                    <div className="kpi-label">{st}</div>
                    <div className="kpi-value" style={{ fontSize: 16 }}>{v.count}건</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtKRW(v.amount)}</div>
                  </div>
                ))}
              </div>

              {monthlyData.csTopOpps.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top 기회 (예상금액 순)</div>
                  <div className="table-wrap" style={{ maxHeight: 200 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>고객명</th>
                          <th>타겟 제품</th>
                          <th>상태</th>
                          <th style={{ textAlign: 'right' }}>예상 금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyData.csTopOpps.slice(0, 10).map((opp, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{opp.company}</td>
                            <td>{opp.product}</td>
                            <td><span className={`status-badge ${opp.status === '제안중' ? 'in-progress' : 'open'}`}>{opp.status}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(opp.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Section 5: FCST vs Actual */}
          {monthlyData.fcstVsActual.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">FCST vs Actual (당분기)</div>
              <div className="table-wrap" style={{ maxHeight: 250 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>고객명</th>
                      <th style={{ textAlign: 'right' }}>예측금액</th>
                      <th style={{ textAlign: 'right' }}>실적금액</th>
                      <th style={{ textAlign: 'right' }}>차이</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.fcstVsActual.map((f, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{f.company_name}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(f.forecast)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(f.actual)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: f.diff >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: 11 }}>
                            {f.diff >= 0 ? '+' : ''}{fmtKRW(f.diff)}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{f.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
             DEEP GAP ANALYSIS (심층 Gap 분석)
             ═══════════════════════════════════════════════ */}
          {gapAnalysisData && (
            <>
              <div className="report-section-title" style={{ marginTop: 20 }}>심층 Gap 분석</div>

              {/* GAP-1: Gap 원인 분석 */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title">Gap 원인 분석</div>
                {gapAnalysisData.causeRanking.length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                    아직 원인 태깅된 고객이 없습니다. 각 고객의 'GAP분석' 탭에서 원인을 태깅하세요.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {gapAnalysisData.causeRanking.map((cause, i) => (
                        <div key={cause.key} style={{
                          padding: '10px 12px', borderRadius: 8,
                          border: i < 3 ? '1px solid var(--red)' : '1px solid var(--border)',
                          background: i < 3 ? 'rgba(220,38,38,.04)' : 'var(--bg3)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{cause.icon} {cause.label}</span>
                            {i < 3 && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>TOP {i + 1}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                            <span style={{ fontWeight: 600 }}>{cause.count}</span>건 |
                            영향금액 <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtKRW(cause.totalGap)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                            {cause.customers.slice(0, 3).join(', ')}{cause.customers.length > 3 ? ` 외 ${cause.customers.length - 3}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* GAP-2: 고객별 심층 분석 (Gap 상위) */}
              {gapAnalysisData.topGapCustomers.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title">고객별 심층 분석 (Gap 상위 {gapAnalysisData.topGapCustomers.length}개사)</div>
                  <div className="table-wrap" style={{ maxHeight: 400 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>고객명</th>
                          <th>담당</th>
                          <th style={{ textAlign: 'right' }}>YTD Gap</th>
                          <th style={{ textAlign: 'right' }}>달성률</th>
                          <th>원인</th>
                          <th style={{ textAlign: 'right' }}>Score</th>
                          <th>미비 정보</th>
                          <th>액션플랜</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gapAnalysisData.topGapCustomers.map(cg => {
                          const causes = (cg.gapAnalysis?.causes || [])
                            .map(k => GAP_CAUSES.find(c => c.key === k))
                            .filter(Boolean);
                          const missingInfo = gapAnalysisData.getMissingIntelligence(cg.account);
                          const topMissing = missingInfo.slice(0, 2);
                          const actionPlan = (cg.gapAnalysis?.action_plan || []).filter(a => a.text?.trim());
                          const actionDone = actionPlan.filter(a => a.done).length;

                          return (
                            <tr key={cg.key}>
                              <td style={{ fontWeight: 600, fontSize: 11 }}>{cg.name}</td>
                              <td style={{ fontSize: 11 }}>{cg.rep}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 11 }}>{fmtKRW(cg.ytdGap)}</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`score-badge ${pctColor(cg.achieveRate)}`} style={{ fontSize: 10 }}>
                                  {cg.achieveRate}%
                                </span>
                              </td>
                              <td>
                                {causes.length > 0
                                  ? causes.map(c => (
                                      <span key={c.key} style={{ fontSize: 9, marginRight: 3, padding: '1px 4px', borderRadius: 3, background: 'rgba(220,38,38,.08)', color: 'var(--red)' }}>
                                        {c.icon}{c.label}
                                      </span>
                                    ))
                                  : <span style={{ fontSize: 10, color: 'var(--text3)' }}>미분석</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`score-badge ${cg.score >= 70 ? 'green' : cg.score >= 50 ? 'yellow' : 'red'}`} style={{ fontSize: 10 }}>
                                  {cg.score}%
                                </span>
                              </td>
                              <td style={{ fontSize: 10, color: 'var(--text2)', maxWidth: 140 }}>
                                {topMissing.length > 0
                                  ? topMissing.map(m => m.category).join(', ')
                                  : <span style={{ color: 'var(--green)' }}>완비</span>}
                              </td>
                              <td style={{ fontSize: 10 }}>
                                {actionPlan.length > 0
                                  ? <span style={{ color: actionDone === actionPlan.length ? 'var(--green)' : 'var(--yellow)' }}>
                                      {actionDone}/{actionPlan.length} 완료
                                    </span>
                                  : <span style={{ color: 'var(--text3)' }}>미설정</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* GAP-3: 기회 파이프라인 */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>기회 파이프라인 (Gap 만회)</span>
                  {gapAnalysisData.totalOppWeighted > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                      가중합계: {fmtKRW(gapAnalysisData.totalOppWeighted)}
                    </span>
                  )}
                </div>
                {gapAnalysisData.oppSummary.length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                    등록된 기회가 없습니다. 각 고객의 'GAP분석' 탭에서 기회를 등록하세요.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {gapAnalysisData.oppSummary.map(opp => (
                        <div key={opp.key} style={{ textAlign: 'center', padding: 10, background: 'rgba(22,163,74,.04)', borderRadius: 8, border: '1px solid rgba(22,163,74,.15)' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{opp.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', margin: '4px 0' }}>{opp.count}건</div>
                          <div style={{ fontSize: 10, color: 'var(--text2)' }}>총 {fmtKRW(opp.totalAmount)}</div>
                          <div style={{ fontSize: 10, color: 'var(--green)' }}>가중 {fmtKRW(opp.weightedAmount)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Top opportunities */}
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>주요 기회 (가중금액 순)</div>
                    <div className="table-wrap" style={{ maxHeight: 200 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>고객명</th>
                            <th>유형</th>
                            <th>품목</th>
                            <th style={{ textAlign: 'right' }}>예상금액</th>
                            <th style={{ textAlign: 'right' }}>확률</th>
                            <th style={{ textAlign: 'right' }}>가중금액</th>
                            <th>예상시기</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gapAnalysisData.allOpportunities
                            .sort((a, b) => (b.amount * b.probability) - (a.amount * a.probability))
                            .slice(0, 10)
                            .map((opp, i) => {
                              const typeInfo = OPPORTUNITY_TYPES.find(t => t.key === opp.type);
                              return (
                                <tr key={opp.id || i}>
                                  <td style={{ fontWeight: 600, fontSize: 11 }}>{opp.company}</td>
                                  <td><span className="issue-badge" style={{ fontSize: 9 }}>{typeInfo?.label || opp.type}</span></td>
                                  <td style={{ fontSize: 11 }}>{opp.product || '-'}</td>
                                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(opp.amount)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <span style={{
                                      fontSize: 10, padding: '1px 5px', borderRadius: 3,
                                      background: opp.probability >= 70 ? 'rgba(22,163,74,.1)' : opp.probability >= 40 ? 'rgba(217,119,6,.1)' : 'rgba(220,38,38,.1)',
                                      color: opp.probability >= 70 ? 'var(--green)' : opp.probability >= 40 ? 'var(--yellow)' : 'var(--red)',
                                    }}>{opp.probability}%</span>
                                  </td>
                                  <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
                                    {fmtKRW(opp.amount * opp.probability / 100)}
                                  </td>
                                  <td style={{ fontSize: 10, color: 'var(--text3)' }}>{opp.expected_date || '-'}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* GAP-4: AM별 활동 품질 지표 */}
              {Object.keys(gapAnalysisData.amMetrics).length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title">AM별 활동 품질 지표</div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>담당자</th>
                          <th style={{ textAlign: 'right' }}>고객수</th>
                          <th style={{ textAlign: 'right' }}>90일 컨택</th>
                          <th style={{ textAlign: 'right' }}>고객당 빈도</th>
                          <th style={{ textAlign: 'right' }}>평균 Score</th>
                          <th style={{ textAlign: 'right' }}>액션 실행률</th>
                          <th style={{ textAlign: 'right' }}>YTD 달성률</th>
                          <th>주요 Gap 원인</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(gapAnalysisData.amMetrics)
                          .sort((a, b) => b[1].achieveRate - a[1].achieveRate)
                          .map(([rep, m]) => (
                            <tr key={rep}>
                              <td style={{ fontWeight: 600 }}>{rep}</td>
                              <td style={{ textAlign: 'right' }}>{m.accountCount}</td>
                              <td style={{ textAlign: 'right' }}>{m.contactCount90d}건</td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{ color: m.avgContactFreq >= 2 ? 'var(--green)' : m.avgContactFreq >= 1 ? 'var(--yellow)' : 'var(--red)' }}>
                                  {m.avgContactFreq}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`score-badge ${m.avgScore >= 70 ? 'green' : m.avgScore >= 50 ? 'yellow' : 'red'}`} style={{ fontSize: 10 }}>
                                  {m.avgScore}%
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {m.actionTotal > 0 ? (
                                  <span style={{ color: m.actionRate >= 70 ? 'var(--green)' : m.actionRate >= 40 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600, fontSize: 11 }}>
                                    {m.actionRate}% <span style={{ fontSize: 9, fontWeight: 400 }}>({m.actionDone}/{m.actionTotal})</span>
                                  </span>
                                ) : <span style={{ fontSize: 10, color: 'var(--text3)' }}>미설정</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {m.ytdTarget > 0 ? (
                                  <span className={`score-badge ${pctColor(m.achieveRate)}`} style={{ fontSize: 10 }}>
                                    {m.achieveRate}%
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ fontSize: 10 }}>
                                {m.gapCauses.length > 0
                                  ? m.gapCauses.map(([k, cnt]) => {
                                      const c = GAP_CAUSES.find(gc => gc.key === k);
                                      return <span key={k} style={{ marginRight: 4 }}>{c?.icon}{c?.label}({cnt})</span>;
                                    })
                                  : <span style={{ color: 'var(--text3)' }}>-</span>}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
