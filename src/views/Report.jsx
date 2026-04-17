import { useState, useMemo, useEffect } from 'react';
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
  const { accounts, activityLogs, orders, sales, forecasts, businessPlans, contracts, openIssues, alarms, teamMembers } = useAccount();
  const [tab, setTab] = useState('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  // 월 offset: 0=이번달, -1=전월 등. 스펙 기본값은 직전 완료 월(-1)
  const [monthOffset, setMonthOffset] = useState(-1);
  // Executive Summary (수동 입력, localStorage 저장)
  const [execSummary, setExecSummary] = useState({ msg1: '', msg2: '', msg3: '', status: '🟢', nextMonthFocus: '' });
  // 다음 달 사업 계획 (수동 입력, localStorage)
  const [nextMonthPlan, setNextMonthPlan] = useState({ overseas: '', domestic: '', support: '' });

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

    // 담당자별 배정 고객수 (accounts.sales_rep 기준)
    const assignedCountByRep = {};
    teamMembers.forEach(t => { assignedCountByRep[t] = 0; });
    accounts.forEach(a => {
      if (a.sales_rep && assignedCountByRep[a.sales_rep] !== undefined) {
        assignedCountByRep[a.sales_rep]++;
      }
    });

    // Activity summary per rep (전원 표시, 활동 0이어도 유지)
    const repActivity = {};
    teamMembers.forEach(t => {
      repActivity[t] = {
        assignedCount: assignedCountByRep[t] || 0,
        contacts: 0, orderActivity: 0, crossSelling: 0, latestContent: '',
      };
    });
    weekLogs.forEach(l => {
      const rep = l.sales_rep;
      if (!rep || !repActivity[rep]) return;
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
  }, [activityLogs, orders, accounts, openIssues, yearOrders, customerPlans, productPlans, planLookup, teamMembers]);

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

    // ══ 매출(Sales) 팀별 집계 (B/L date 기준) ══
    // 주문 → 팀 매핑 재사용 (동일 고객이면 동일 팀)
    const getTeamForSale = (s) => {
      const plan = planLookup.byAccountId[s.account_id]
        || planLookup.byName[(s.customer_name || '').toLowerCase().trim()];
      return plan?.team || '기타';
    };

    const monthSales = (sales || []).filter(s => (s.sale_date || '').startsWith(monthStr));
    const thisWeekSales = monthSales.filter(s => (s.sale_date || '') >= wkStart && (s.sale_date || '') <= wkEnd);
    const prevWeekSales = monthSales.filter(s => (s.sale_date || '') >= monthStartStr && (s.sale_date || '') < wkStart);

    const salesTeamData = {};
    TEAM_ORDER.forEach(team => {
      salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    });
    salesTeamData['기타'] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };

    prevWeekSales.forEach(s => {
      const team = getTeamForSale(s);
      if (!salesTeamData[team]) salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      salesTeamData[team].prevCum += (s.sale_amount || 0);
      salesTeamData[team].monthCum += (s.sale_amount || 0);
    });
    thisWeekSales.forEach(s => {
      const team = getTeamForSale(s);
      if (!salesTeamData[team]) salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      salesTeamData[team].thisWeek += (s.sale_amount || 0);
      salesTeamData[team].monthCum += (s.sale_amount || 0);
    });
    // 매출 목표는 수주 목표를 동일하게 사용 (별도 목표가 아직 없음)
    customerPlans.forEach(p => {
      const team = p.team || '기타';
      if (!salesTeamData[team]) salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      salesTeamData[team].monthTarget += (p.targets?.[monthKey] || 0);
    });

    const salesTotal = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    Object.values(salesTeamData).forEach(d => {
      salesTotal.prevCum += d.prevCum;
      salesTotal.thisWeek += d.thisWeek;
      salesTotal.monthCum += d.monthCum;
      salesTotal.monthTarget += d.monthTarget;
    });
    const hasSalesData = (sales || []).length > 0;

    // ── MTD 달성률 (수주 기준) ──
    const mtdActual = total.monthCum;
    const mtdTarget = total.monthTarget;
    const mtdPct = mtdTarget > 0 ? Math.round((mtdActual / mtdTarget) * 100) : 0;

    // ── 분기별 진행 현황 (Q1~Q4) ──
    const quarterData = [1, 2, 3, 4].map(q => {
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      let target = 0;
      let actual = 0;
      for (let m = startMonth; m <= endMonth; m++) {
        const mKey = String(m).padStart(2, '0');
        customerPlans.forEach(p => {
          target += (p.targets?.[mKey] || 0);
        });
        const mPrefix = `${wkYear}-${mKey}`;
        orders.forEach(o => {
          if ((o.order_date || '').startsWith(mPrefix)) actual += (o.order_amount || 0);
        });
      }
      // 분기 상태 판단
      const currentQ = Math.ceil(wkMonth / 3);
      let status = 'future';
      if (q < currentQ) status = 'done';
      else if (q === currentQ) status = 'active';
      return {
        q, target, actual,
        achieveRate: target > 0 ? Math.round((actual / target) * 100) : 0,
        status,
        label: `Q${q}`,
      };
    });

    return {
      wkStart, wkEnd, monday,
      weekLabel: getWeekLabel(monday),
      monthStr,
      teamData,
      displayTeams,
      total,
      salesTeamData, salesTotal, hasSalesData,
      mtdActual, mtdTarget, mtdPct,
      quarterData,
    };
  }, [orders, sales, customerPlans, weekOffset, planLookup]);

  /* ══════════════════════════════
     SECTION B — 이슈사항 자동 집계
     ══════════════════════════════ */
  // 이슈 유형 → 리포트 카테고리 매핑
  const ISSUE_CATEGORY_MAP = {
    '수주활동': '영업이슈', '가격협의': '영업이슈', '입찰': '영업이슈', '계약갱신': '영업이슈', '영업미팅': '영업이슈',
    '샘플요청': '고객지원', '규제·인증': '고객지원',
    '품질클레임': '품질이슈', 'VOC수집': '품질이슈',
  };
  const ISSUE_CAT_ORDER = ['영업이슈', '고객지원', '품질이슈', '기타'];
  const ISSUE_CAT_LABELS = {
    '영업이슈': '영업이슈 (수주관련)', '고객지원': '고객지원 (유관부서 협조필요)',
    '품질이슈': '품질이슈', '기타': '기타',
  };
  const TEAM_SHORT = { '해외영업': '해외', '영업지원': '지원', '국내영업': '국내' };

  // account → team 매핑 함수
  const getTeamForAccount = (accountId) => {
    const plan = planLookup.byAccountId[accountId];
    if (plan?.team) return plan.team;
    const acc = accounts.find(a => a.id === accountId);
    if (acc) {
      const namePlan = planLookup.byName[(acc.company_name || '').toLowerCase().trim()];
      if (namePlan?.team) return namePlan.team;
      if (acc.region === '한국') return '국내영업';
    }
    return '해외영업';
  };

  const sectionBData = useMemo(() => {
    const { wkStart, wkEnd } = sectionAData;
    const weekLogs = activityLogs.filter(l => (l.date || '') >= wkStart && (l.date || '') <= wkEnd);

    // 카테고리별 + 팀별 그룹핑
    const grouped = {};
    ISSUE_CAT_ORDER.forEach(cat => { grouped[cat] = []; });

    weekLogs.forEach(l => {
      const cat = ISSUE_CATEGORY_MAP[l.issue_type] || '기타';
      const team = getTeamForAccount(l.account_id);
      const acc = accounts.find(a => a.id === l.account_id);
      grouped[cat].push({
        team,
        teamShort: TEAM_SHORT[team] || team,
        company: acc?.company_name || '?',
        content: l.content || '-',
        rep: l.sales_rep || '-',
        status: l.status || 'Open',
        issueType: l.issue_type,
        date: l.date,
      });
    });

    // 각 카테고리 내에서 팀 순서 정렬
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => {
        const ti = TEAM_ORDER.indexOf(a.team === '해외영업' ? '해외영업' : a.team);
        const tj = TEAM_ORDER.indexOf(b.team === '해외영업' ? '해외영업' : b.team);
        return ti - tj;
      });
    });

    return { grouped, totalCount: weekLogs.length };
  }, [sectionAData, activityLogs, accounts, planLookup]);

  /* ══════════════════════════════
     SECTION C — 다음 주 예정 액션
     ══════════════════════════════ */
  const sectionCData = useMemo(() => {
    const { monday, wkStart, wkEnd } = sectionAData;
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    const nStart = nextMonday.toISOString().slice(0, 10);
    const nEnd = nextSunday.toISOString().slice(0, 10);

    const actionsMap = new Map(); // 중복 제거용 (id 기준)

    // ① 다음 주 due_date 액션 (정상 예정)
    activityLogs
      .filter(l => l.next_action && l.status !== 'Closed' && l.due_date && l.due_date >= nStart && l.due_date <= nEnd)
      .forEach(l => {
        const acc = accounts.find(a => a.id === l.account_id);
        const team = getTeamForAccount(l.account_id);
        actionsMap.set(l.id, {
          teamShort: TEAM_SHORT[team] || team,
          company: acc?.company_name || '?',
          action: l.next_action,
          dueDate: l.due_date,
          rep: l.sales_rep || '-',
          isCarryover: false,
          status: l.status || 'Open',
        });
      });

    // ② 금주에 등록되었으나 Closed되지 않은 이슈 → 자동 이월
    activityLogs
      .filter(l => {
        if (l.status === 'Closed') return false;
        // 금주 범위에 기록된 이슈
        const inThisWeek = (l.date || '') >= wkStart && (l.date || '') <= wkEnd;
        // 또는 due_date가 지났거나 이번주까지인데 미해결
        const overdueOrThisWeek = l.due_date && l.due_date <= wkEnd;
        return inThisWeek || overdueOrThisWeek;
      })
      .forEach(l => {
        if (actionsMap.has(l.id)) return; // 이미 있으면 스킵
        const acc = accounts.find(a => a.id === l.account_id);
        const team = getTeamForAccount(l.account_id);
        actionsMap.set(l.id, {
          teamShort: TEAM_SHORT[team] || team,
          company: acc?.company_name || '?',
          action: l.next_action || `[${l.issue_type}] ${l.content || '-'}`,
          dueDate: l.due_date || '-',
          rep: l.sales_rep || '-',
          isCarryover: true,
          status: l.status || 'Open',
          daysOpen: daysSince(l.date),
        });
      });

    const actions = Array.from(actionsMap.values())
      .sort((a, b) => {
        // 이월 먼저, 그 다음 due_date 순
        if (a.isCarryover !== b.isCarryover) return a.isCarryover ? -1 : 1;
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      });

    // 재구매 임박 고객 (D-14 이내) — 소스별 그룹핑
    const reorderAll = alarms.filter(a => a.type === 'reorder' && a.level === 'danger');
    const reorderBySource = {
      fcst: reorderAll.filter(a => a.source === 'fcst').slice(0, 5),
      plan: reorderAll.filter(a => a.source === 'plan').slice(0, 5),
      trend: reorderAll.filter(a => a.source === 'trend').slice(0, 5),
    };
    const reorderAlarms = reorderAll.slice(0, 10); // 레거시 호환

    const carryoverCount = actions.filter(a => a.isCarryover).length;

    return { actions, carryoverCount, nextWeekLabel: `${nStart} ~ ${nEnd}`, reorderAlarms, reorderBySource };
  }, [sectionAData, activityLogs, accounts, alarms, planLookup]);

  /* ══════════════════════════════════════════════════════
     MONTHLY REPORT DATA (스펙 기반, monthOffset 반응)
     ══════════════════════════════════════════════════════ */
  const monthlyReportData = useMemo(() => {
    // 선택된 월 계산
    const baseDate = new Date();
    baseDate.setDate(1);
    baseDate.setMonth(baseDate.getMonth() + monthOffset);
    const selYear = baseDate.getFullYear();
    const selMonth = baseDate.getMonth() + 1;
    const selMonthStr = `${selYear}-${String(selMonth).padStart(2, '0')}`;
    const selMonthKey = String(selMonth).padStart(2, '0');
    const prevYearMonthStr = `${selYear - 1}-${selMonthKey}`;

    // 전월 계산
    const prevDate = new Date(baseDate);
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // ── 섹션 B-1: 월별 추이 (수주 + 매출, 1~12월) ──
    const monthlyTrend = [];
    const salesMonthlyTrend = [];
    for (let m = 1; m <= 12; m++) {
      const mKey = String(m).padStart(2, '0');
      const thisYearMonth = `${selYear}-${mKey}`;
      const prevYearMonth = `${selYear - 1}-${mKey}`;

      const actual = orders
        .filter(o => (o.order_date || '').startsWith(thisYearMonth))
        .reduce((s, o) => s + (o.order_amount || 0), 0);

      const prevYearActual = orders
        .filter(o => (o.order_date || '').startsWith(prevYearMonth))
        .reduce((s, o) => s + (o.order_amount || 0), 0);

      const target = customerPlans.reduce((s, p) => s + (p.targets?.[mKey] || 0), 0);

      // 매출 (B/L date 기준)
      const salesActual = (sales || [])
        .filter(s => (s.sale_date || '').startsWith(thisYearMonth))
        .reduce((sum, s) => sum + (s.sale_amount || 0), 0);
      const salesPrevYearActual = (sales || [])
        .filter(s => (s.sale_date || '').startsWith(prevYearMonth))
        .reduce((sum, s) => sum + (s.sale_amount || 0), 0);

      salesMonthlyTrend.push({
        month: m,
        prevYearActual: salesPrevYearActual,
        target, // 수주 목표 동일 사용
        actual: salesActual,
        yoyPct: salesPrevYearActual > 0 ? Math.round((salesActual / salesPrevYearActual) * 100) : 0,
        targetPct: target > 0 ? Math.round((salesActual / target) * 100) : 0,
      });

      monthlyTrend.push({
        month: m,
        prevYearActual,
        target,
        actual,
        yoyPct: prevYearActual > 0 ? Math.round((actual / prevYearActual) * 100) : 0,
        targetPct: target > 0 ? Math.round((actual / target) * 100) : 0,
      });
    }
    const trendTotal = monthlyTrend.reduce((acc, t) => ({
      prevYearActual: acc.prevYearActual + t.prevYearActual,
      target: acc.target + t.target,
      actual: acc.actual + t.actual,
    }), { prevYearActual: 0, target: 0, actual: 0 });

    const salesTrendTotal = salesMonthlyTrend.reduce((acc, t) => ({
      prevYearActual: acc.prevYearActual + t.prevYearActual,
      target: acc.target + t.target,
      actual: acc.actual + t.actual,
    }), { prevYearActual: 0, target: 0, actual: 0 });
    const hasSalesData = (sales || []).length > 0;

    // ── 섹션 B-2: 팀별 실적 ──
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(selMonthStr));
    const prevYearMonthOrders = orders.filter(o => (o.order_date || '').startsWith(prevYearMonthStr));

    const getTeamForOrderLocal = (o) => {
      const plan = findPlanForOrder(o);
      return plan?.team || '기타';
    };

    const teamMonthly = {};
    TEAM_ORDER.forEach(t => { teamMonthly[t] = { target: 0, actual: 0, prevYearActual: 0 }; });
    teamMonthly['기타'] = { target: 0, actual: 0, prevYearActual: 0 };

    customerPlans.forEach(p => {
      const team = p.team || '기타';
      if (!teamMonthly[team]) teamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      teamMonthly[team].target += (p.targets?.[selMonthKey] || 0);
    });
    monthOrders.forEach(o => {
      const team = getTeamForOrderLocal(o);
      if (!teamMonthly[team]) teamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      teamMonthly[team].actual += (o.order_amount || 0);
    });
    prevYearMonthOrders.forEach(o => {
      const team = getTeamForOrderLocal(o);
      if (!teamMonthly[team]) teamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      teamMonthly[team].prevYearActual += (o.order_amount || 0);
    });

    const teamRows = TEAM_ORDER.map(t => ({
      team: t, display: TEAM_DISPLAY[t] || t, ...teamMonthly[t],
      achieveRate: teamMonthly[t].target > 0 ? Math.round((teamMonthly[t].actual / teamMonthly[t].target) * 100) : 0,
      yoyRate: teamMonthly[t].prevYearActual > 0 ? Math.round((teamMonthly[t].actual / teamMonthly[t].prevYearActual) * 100) : 0,
    }));
    const teamTotal = teamRows.reduce((acc, r) => ({
      target: acc.target + r.target, actual: acc.actual + r.actual, prevYearActual: acc.prevYearActual + r.prevYearActual,
    }), { target: 0, actual: 0, prevYearActual: 0 });

    // ── B-2 매출 팀별 ──
    const getTeamForSaleLocal = (s) => {
      const plan = planLookup.byAccountId[s.account_id] || planLookup.byName[(s.customer_name || '').toLowerCase().trim()];
      return plan?.team || '기타';
    };
    const monthSales = (sales || []).filter(s => (s.sale_date || '').startsWith(selMonthStr));
    const prevYearMonthSales = (sales || []).filter(s => (s.sale_date || '').startsWith(prevYearMonthStr));

    const salesTeamMonthly = {};
    TEAM_ORDER.forEach(t => { salesTeamMonthly[t] = { target: 0, actual: 0, prevYearActual: 0 }; });
    customerPlans.forEach(p => {
      const team = p.team || '기타';
      if (!salesTeamMonthly[team]) salesTeamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      salesTeamMonthly[team].target += (p.targets?.[selMonthKey] || 0);
    });
    monthSales.forEach(s => {
      const team = getTeamForSaleLocal(s);
      if (!salesTeamMonthly[team]) salesTeamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      salesTeamMonthly[team].actual += (s.sale_amount || 0);
    });
    prevYearMonthSales.forEach(s => {
      const team = getTeamForSaleLocal(s);
      if (!salesTeamMonthly[team]) salesTeamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      salesTeamMonthly[team].prevYearActual += (s.sale_amount || 0);
    });
    const salesTeamRows = TEAM_ORDER.map(t => ({
      team: t, display: TEAM_DISPLAY[t] || t, ...salesTeamMonthly[t],
      achieveRate: salesTeamMonthly[t].target > 0 ? Math.round((salesTeamMonthly[t].actual / salesTeamMonthly[t].target) * 100) : 0,
      yoyRate: salesTeamMonthly[t].prevYearActual > 0 ? Math.round((salesTeamMonthly[t].actual / salesTeamMonthly[t].prevYearActual) * 100) : 0,
    }));
    const salesTeamTotal = salesTeamRows.reduce((acc, r) => ({
      target: acc.target + r.target, actual: acc.actual + r.actual, prevYearActual: acc.prevYearActual + r.prevYearActual,
    }), { target: 0, actual: 0, prevYearActual: 0 });

    // ── 섹션 C: 팀별 월간 활동 분석 ──
    const monthStart = `${selMonthStr}-01`;
    const monthEnd = `${selMonthStr}-31`;
    const monthLogs = activityLogs.filter(l => (l.date || '') >= monthStart && (l.date || '') <= monthEnd);

    const getTeamForAccountLocal = (accountId) => {
      const plan = planLookup.byAccountId[accountId];
      if (plan?.team) return plan.team;
      const acc = accounts.find(a => a.id === accountId);
      if (acc) {
        const namePlan = planLookup.byName[(acc.company_name || '').toLowerCase().trim()];
        if (namePlan?.team) return namePlan.team;
        if (acc.region === '한국') return '국내영업';
      }
      return '해외영업';
    };

    const teamActivity = {};
    TEAM_ORDER.forEach(t => {
      teamActivity[t] = {
        display: TEAM_DISPLAY[t] || t,
        total: 0, newContract: 0, crossSelling: 0, openIssues: 0,
        contactedAccounts: new Set(),
        majorIssues: [],
      };
    });
    monthLogs.forEach(l => {
      const team = getTeamForAccountLocal(l.account_id);
      if (!teamActivity[team]) return;
      teamActivity[team].total++;
      if (l.issue_type === '계약갱신') teamActivity[team].newContract++;
      if (l.issue_type === '크로스셀링') teamActivity[team].crossSelling++;
      if (l.status !== 'Closed') {
        teamActivity[team].openIssues++;
        // 영업이슈/고객지원/품질이슈에 해당하면 주요이슈로
        if (['수주활동', '가격협의', '품질클레임', '샘플요청', '규제·인증'].includes(l.issue_type)) {
          const acc = accounts.find(a => a.id === l.account_id);
          teamActivity[team].majorIssues.push({
            company: acc?.company_name || '?',
            type: l.issue_type,
            content: l.content || '',
          });
        }
      }
      teamActivity[team].contactedAccounts.add(l.account_id);
    });
    // Set을 count로 변환
    Object.values(teamActivity).forEach(t => {
      t.contactedCount = t.contactedAccounts.size;
      delete t.contactedAccounts;
      t.majorIssues = t.majorIssues.slice(0, 5);
    });

    // ── 섹션 D: 주요 거래처별 실적 (상위 10사) ──
    const accountMonthMap = {};
    monthOrders.forEach(o => {
      const key = o.account_id || o.customer_name;
      if (!accountMonthMap[key]) accountMonthMap[key] = { name: o.customer_name, thisMonth: 0, lastMonth: 0 };
      accountMonthMap[key].thisMonth += (o.order_amount || 0);
    });
    orders.filter(o => (o.order_date || '').startsWith(prevMonthStr)).forEach(o => {
      const key = o.account_id || o.customer_name;
      if (!accountMonthMap[key]) accountMonthMap[key] = { name: o.customer_name, thisMonth: 0, lastMonth: 0 };
      accountMonthMap[key].lastMonth += (o.order_amount || 0);
    });
    const topAccounts = Object.values(accountMonthMap)
      .filter(a => a.thisMonth > 0)
      .sort((a, b) => b.thisMonth - a.thisMonth)
      .slice(0, 10)
      .map(a => ({
        ...a,
        changeRate: a.lastMonth > 0 ? Math.round(((a.thisMonth - a.lastMonth) / a.lastMonth) * 100) : null,
      }));

    // ── 섹션 E: 재구매/계약 만료 임박 ──
    const now = new Date();
    const nextMonthDate = new Date(selYear, selMonth, 0); // 선택월 말일
    nextMonthDate.setDate(nextMonthDate.getDate() + 30);
    const reorderSoon = alarms
      .filter(a => a.type === 'reorder')
      .slice(0, 10);
    const contractExpiringSoon = [];
    contracts.forEach(c => {
      if (!c.contract_expiry) return;
      const daysLeft = Math.ceil((new Date(c.contract_expiry) - now) / 86400000);
      if (daysLeft <= 60 && daysLeft > 0) {
        const acc = accounts.find(a => a.id === c.account_id);
        contractExpiringSoon.push({
          company: acc?.company_name || '?',
          product: c.product_category,
          expiry: c.contract_expiry,
          daysLeft,
        });
      }
    });
    contractExpiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      selYear, selMonth, selMonthStr, selMonthKey,
      monthLabel: `${selYear}년 ${selMonth}월`,
      monthlyTrend, trendTotal,
      salesMonthlyTrend, salesTrendTotal, hasSalesData,
      teamRows, teamTotal,
      salesTeamRows, salesTeamTotal,
      teamActivity,
      topAccounts,
      reorderSoon, contractExpiringSoon,
      monthOrders, monthSales, // for Excel raw
    };
  }, [monthOffset, orders, sales, customerPlans, activityLogs, accounts, contracts, alarms, planLookup]);

  /* ══════════════════════════════════════════════════════
     Executive Summary / 다음 달 계획 localStorage 로드·저장
     ══════════════════════════════════════════════════════ */
  const execSummaryKey = `bioprotech_account_crm_exec_summary_${monthlyReportData.selMonthStr}`;
  const nextMonthPlanKey = `bioprotech_account_crm_next_month_plan_${monthlyReportData.selMonthStr}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(execSummaryKey));
      setExecSummary(saved || { msg1: '', msg2: '', msg3: '', status: '🟢', nextMonthFocus: '' });
    } catch {}
    try {
      const saved = JSON.parse(localStorage.getItem(nextMonthPlanKey));
      setNextMonthPlan(saved || { overseas: '', domestic: '', support: '' });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyReportData.selMonthStr]);

  const saveExecSummary = (updates) => {
    const next = { ...execSummary, ...updates };
    setExecSummary(next);
    localStorage.setItem(execSummaryKey, JSON.stringify(next));
  };
  const saveNextMonthPlan = (updates) => {
    const next = { ...nextMonthPlan, ...updates };
    setNextMonthPlan(next);
    localStorage.setItem(nextMonthPlanKey, JSON.stringify(next));
  };

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
        const wkLabel = sectionAData.weekLabel;
        const wkShort = `${sectionAData.monday.getMonth() + 1}월${Math.ceil(sectionAData.monday.getDate() / 7)}W`;

        const rows = [
          ['영업본부 주간회의 보고자료', '', '', '', '', ''],
          [`${wkLabel} (${sectionAData.wkStart} ~ ${sectionAData.wkEnd})`, '', '', '', '', `출력일: ${new Date().toISOString().slice(0, 10)}`],
          [],
          // ── 섹션 A: 수주 현황 ──
          ['■ 1. 수주 현황', '', '', '', '', '[단위: 백만원 / %]'],
          ['구분', '전주 누적', '금주 신규', '당월 누적', '당월 목표', '달성률'],
          ...sectionAData.displayTeams.map(team => {
            const d = sectionAData.teamData[team];
            const rate = d.monthTarget > 0 ? `${pct(d.monthCum, d.monthTarget)}%` : '-';
            return [TEAM_DISPLAY[team] || team, Math.round(d.prevCum / 1e6), Math.round(d.thisWeek / 1e6), Math.round(d.monthCum / 1e6), Math.round(d.monthTarget / 1e6), rate];
          }),
          ['합계', Math.round(sectionAData.total.prevCum / 1e6), Math.round(sectionAData.total.thisWeek / 1e6), Math.round(sectionAData.total.monthCum / 1e6), Math.round(sectionAData.total.monthTarget / 1e6), sectionAData.total.monthTarget > 0 ? `${pct(sectionAData.total.monthCum, sectionAData.total.monthTarget)}%` : '-'],
          [],
          // ── 섹션 B: 이슈사항 ──
          ['■ 2. 영업본부 주간 이슈사항'],
          ['구분', '팀', '고객명', '주요 내용', '담당', '상태'],
          ...ISSUE_CAT_ORDER.flatMap(cat => {
            const catRows = sectionBData.grouped[cat];
            if (catRows.length === 0) return [[ISSUE_CAT_LABELS[cat], '', '', '—', '', '']];
            return catRows.map((r, i) => [i === 0 ? ISSUE_CAT_LABELS[cat] : '', r.teamShort, r.company, `[${r.issueType}] ${r.content}`, r.rep, r.status]);
          }),
          [],
          // ── 섹션 C: 다음 주 예정 액션 ──
          ['■ 3. 다음 주 예정 액션', `(${sectionCData.nextWeekLabel})`],
          ['팀', '고객명', '액션 내용', '담당', '기한'],
          ...(sectionCData.actions.length > 0
            ? sectionCData.actions.map(a => [a.teamShort, a.company, a.action, a.rep, a.dueDate])
            : [['', '', '예정된 액션 없음', '', '']]),
          ...(sectionCData.reorderAlarms.length > 0
            ? [[], ['※ 재구매 임박 고객 (D-14 이내)'], ...sectionCData.reorderAlarms.map(a => ['', a.account?.company_name || '', a.msg, '', ''])]
            : []),
          [],
          // ── 부록: 상세 실적 ──
          ['[부록] 금주 수주 상세'],
          ['고객명', '제품군', '수주금액', '담당자', '오더일'],
          ...weeklyData.weekOrders.map(o => {
            const acc = accounts.find(a => a.id === o.account_id);
            return [o.customer_name || acc?.company_name || '?', o.product_category || '', o.order_amount || 0, o.sales_rep || '', o.order_date || ''];
          }),
          ...(weeklyData.weekOrders.length === 0 ? [['', '', '금주 수주 없음', '', '']] : []),
          [],
          ['[부록] 담당자별 활동 요약'],
          ['담당자', '컨택건수', '수주활동', '크로스셀링', '주요 내용'],
          ...Object.entries(weeklyData.repActivity)
            .filter(([, v]) => v.contacts > 0)
            .map(([rep, v]) => [rep, v.contacts, v.orderActivity, v.crossSelling, v.latestContent]),
          [],
          ...(planSummary ? [
            ['[부록] 사업계획 YTD 진도'],
            ['담당자', 'YTD목표', 'YTD실적', '달성률'],
            ...Object.entries(planSummary.byRep)
              .filter(([, v]) => v.ytdTarget > 0 || v.ytdActual > 0)
              .map(([rep, v]) => [rep, v.ytdTarget, v.ytdActual, v.ytdTarget > 0 ? `${pct(v.ytdActual, v.ytdTarget)}%` : '-']),
          ] : []),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 50 }, { wch: 10 }, { wch: 12 }];
        // 합계 행 강조 (merge 불가하므로 볼드 처리는 뷰어에서)
        XLSX.utils.book_append_sheet(wb, ws, `주간종합_(${wkShort})`);

      } else {
        const mR = monthlyReportData;
        const mmShort = `${mR.selMonth}월`;

        // ── Sheet 1: 매출-수주 Raw (값) ──
        const rawRows = [
          ['수주 Raw 데이터', `${mR.monthLabel} (${mR.monthOrders.length}건)`],
          [],
          ['수주번호', '오더일', '고객명', '담당자', '팀', '지역', '국가', '제품군', '수량', '단가', '수주금액', '통화', '상태'],
          ...mR.monthOrders.map(o => {
            const acc = accounts.find(a => a.id === o.account_id);
            const plan = findPlanForOrder(o);
            return [
              o.order_number || '', o.order_date || '', o.customer_name || acc?.company_name || '',
              o.sales_rep || '', plan?.team || '', o.region || '', o.country || '',
              o.product_category || '', o.quantity || 0, o.unit_price || 0, o.order_amount || 0,
              o.currency || 'KRW', o.status || '',
            ];
          }),
        ];
        const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
        wsRaw['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsRaw, '매출-수주 Raw (값)');

        // ── Sheet 2: 월간종합_(MM월) ──
        const rows = [
          [`${mR.monthLabel} 영업본부 월간 보고`, '', '', '', '', '', '', '', '', '', '', '', '', ''],
          [`출력일: ${new Date().toISOString().slice(0, 10)}`],
          [],
          // ── 섹션 A: Executive Summary ──
          ['■ 0. 이번 달 핵심 요약', '', '', '', '', '', '', '', '', '', '', '', '', ''],
          ['핵심 메시지 1', execSummary.msg1 || ''],
          ['핵심 메시지 2', execSummary.msg2 || ''],
          ['핵심 메시지 3', execSummary.msg3 || ''],
          ['종합 판단', execSummary.status || ''],
          ['다음 달 집중 과제', execSummary.nextMonthFocus || ''],
          [],
          // ── 섹션 B-1: 월별 수주 실적 현황 ──
          ['■ 1. 수주현황 — 월별 실적', '', '', '', '', '', '', '', '', '', '', '', '', '[단위: 백만원]'],
          ['구분', ...mR.monthlyTrend.map(t => `${t.month}월`), '합계'],
          ['전년실적', ...mR.monthlyTrend.map(t => Math.round(t.prevYearActual / 1e6)), Math.round(mR.trendTotal.prevYearActual / 1e6)],
          ['목표', ...mR.monthlyTrend.map(t => Math.round(t.target / 1e6)), Math.round(mR.trendTotal.target / 1e6)],
          ['실적', ...mR.monthlyTrend.map(t => Math.round(t.actual / 1e6)), Math.round(mR.trendTotal.actual / 1e6)],
          ['전년대비(%)', ...mR.monthlyTrend.map(t => t.prevYearActual > 0 ? `${t.yoyPct}%` : '-'), mR.trendTotal.prevYearActual > 0 ? `${Math.round((mR.trendTotal.actual / mR.trendTotal.prevYearActual) * 100)}%` : '-'],
          ['목표대비(%)', ...mR.monthlyTrend.map(t => t.target > 0 ? `${t.targetPct}%` : '-'), mR.trendTotal.target > 0 ? `${Math.round((mR.trendTotal.actual / mR.trendTotal.target) * 100)}%` : '-'],
          [],
          // ── 섹션 B-2: 팀별 월간 실적 ──
          [`■ 2. 팀별 월간 실적 (${mR.monthLabel})`],
          ['팀', '목표', '실적', '달성률', '전년 동월', '전년대비'],
          ...mR.teamRows.map(r => [
            r.display,
            Math.round(r.target / 1e6),
            Math.round(r.actual / 1e6),
            r.target > 0 ? `${r.achieveRate}%` : '-',
            Math.round(r.prevYearActual / 1e6),
            r.prevYearActual > 0 ? `${r.yoyRate}%` : '-',
          ]),
          ['Total',
            Math.round(mR.teamTotal.target / 1e6),
            Math.round(mR.teamTotal.actual / 1e6),
            mR.teamTotal.target > 0 ? `${pct(mR.teamTotal.actual, mR.teamTotal.target)}%` : '-',
            Math.round(mR.teamTotal.prevYearActual / 1e6),
            mR.teamTotal.prevYearActual > 0 ? `${pct(mR.teamTotal.actual, mR.teamTotal.prevYearActual)}%` : '-',
          ],
          [],
          // ── 섹션 C: 팀별 월간 활동 분석 ──
          ['■ 3. 팀별 월간 활동 분석'],
          ['팀', '총 Activity', '신규 계약', 'Cross-selling', '미해결 이슈', '주요 고객 컨택'],
          ...TEAM_ORDER.map(team => {
            const t = mR.teamActivity[team];
            return [t.display, `${t.total}건`, `${t.newContract}건`, `${t.crossSelling}건`, `${t.openIssues}건`, `${t.contactedCount}사`];
          }),
          [],
          ['[팀별 주요 이슈]'],
          ...TEAM_ORDER.flatMap(team => {
            const t = mR.teamActivity[team];
            if (t.majorIssues.length === 0) return [[`[${t.display}]`, '없음']];
            return [
              [`[${t.display}]`, '', '', '', '', ''],
              ...t.majorIssues.map(iss => ['', iss.company, iss.type, iss.content]),
            ];
          }),
          [],
          // ── 섹션 D: 주요 거래처별 실적 ──
          ['■ 4. 주요 거래처별 수주 현황 (상위 10사)'],
          ['순위', '거래처명', '당월 수주', '전월 수주', '증감률'],
          ...mR.topAccounts.map((a, i) => [
            i + 1, a.name, Math.round(a.thisMonth / 1e6), Math.round(a.lastMonth / 1e6),
            a.changeRate === null ? '신규' : `${a.changeRate > 0 ? '+' : ''}${a.changeRate}%`,
          ]),
          [],
          // ── 섹션 E: 다음 달 사업 계획 ──
          ['■ 5. 다음 달 주요 계획'],
          ['[해외영업팀]', nextMonthPlan.overseas || ''],
          ['[국내영업팀]', nextMonthPlan.domestic || ''],
          ['[영업지원팀]', nextMonthPlan.support || ''],
          [],
          ...(mR.reorderSoon.length > 0 ? [
            ['※ 재구매 임박 고객 (D-30 이내)'],
            ...mR.reorderSoon.map(a => ['', a.account?.company_name || '', a.msg]),
            [],
          ] : []),
          ...(mR.contractExpiringSoon.length > 0 ? [
            ['※ 계약 만료 임박 (D-60 이내)'],
            ['', '고객명', '제품군', 'D-day', '만료일'],
            ...mR.contractExpiringSoon.map(c => ['', c.company, c.product, `D-${c.daysLeft}`, c.expiry]),
          ] : []),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws, `월간종합_(${mmShort})`);

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

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = tab === 'weekly'
        ? `영업본부_주간회의_보고자료_${sectionAData.weekLabel}_v1_${dateStr}.xlsx`
        : `월간자료_${monthlyReportData.selYear}년_${String(monthlyReportData.selMonth).padStart(2, '0')}월_영업본부_v1_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
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

          {/* ── KPI 카드 (MTD 중심) ── */}
          <div className="kpi-grid" style={{ gridTemplateColumns: hasPlan ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', marginBottom: 16 }}>
            <div className="kpi accent">
              <div className="kpi-label">금주 수주</div>
              <div className="kpi-value">{fmtKRW(sectionAData.total.thisWeek)}</div>
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
            {hasPlan && (
              <div className={`kpi ${pctColor(sectionAData.mtdPct)}`}>
                <div className="kpi-label">MTD 달성률</div>
                <div className="kpi-value">{sectionAData.mtdPct}%</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtKRW(sectionAData.mtdActual)} / {fmtKRW(sectionAData.mtdTarget)}</div>
              </div>
            )}
          </div>

          {/* ══ 분기별 진행 현황 ══ */}
          {hasPlan && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 분기별 진행 현황 ({sectionAData.monday.getFullYear()}년)</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[단위: 백만원 / %]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 80 }}>분기</th>
                      <th style={{ textAlign: 'right' }}>목표</th>
                      <th style={{ textAlign: 'right' }}>실적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'left', paddingLeft: 12 }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAData.quarterData.map(q => {
                      const statusLabel = q.status === 'done' ? '✅ 완료' : q.status === 'active' ? '🔵 진행중' : '⏸ 예정';
                      const statusColor = q.status === 'done' ? 'var(--text2)' : q.status === 'active' ? 'var(--accent)' : 'var(--text3)';
                      return (
                        <tr key={q.q}>
                          <td style={{ fontWeight: 600, color: q.status === 'active' ? 'var(--accent)' : undefined }}>
                            {q.label}
                            <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                              ({(q.q - 1) * 3 + 1}~{q.q * 3}월)
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{fmtM(q.target)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: q.actual > 0 ? 'var(--accent)' : 'var(--text3)' }}>{fmtM(q.actual)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(q.achieveRate) }}>
                            {q.target > 0 ? `${q.achieveRate}%` : '-'}
                          </td>
                          <td style={{ paddingLeft: 12, fontSize: 11, color: statusColor, fontWeight: 600 }}>{statusLabel}</td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const t = sectionAData.quarterData.reduce((acc, q) => ({
                        target: acc.target + q.target, actual: acc.actual + q.actual,
                      }), { target: 0, actual: 0 });
                      return (
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                          <td>연간 합계</td>
                          <td style={{ textAlign: 'right' }}>{fmtM(t.target)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtM(t.actual)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(pct(t.actual, t.target)) }}>
                            {t.target > 0 ? `${pct(t.actual, t.target)}%` : '-'}
                          </td>
                          <td></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

          {/* ══ 섹션 A-2 — 매출 현황 (B/L date 기준) ══ */}
          {hasPlan && sectionAData.hasSalesData && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 1-2. 매출 현황</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[B/L date 기준, 단위: 백만원 / %]</span>
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
                      const d = sectionAData.salesTeamData[team];
                      const rate = pct(d.monthCum, d.monthTarget);
                      return (
                        <tr key={team}>
                          <td style={{ fontWeight: 600 }}>{TEAM_DISPLAY[team] || team}</td>
                          <td style={{ textAlign: 'right' }}>{fmtM(d.prevCum)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: d.thisWeek > 0 ? '#2563eb' : undefined }}>{fmtM(d.thisWeek)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(d.monthCum)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(d.monthTarget)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(rate) }}>{d.monthTarget > 0 && d.monthCum > 0 ? `${rate}%` : '-'}</td>
                        </tr>
                      );
                    })}
                    {/* 합계 행 */}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td>합계</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.salesTotal.prevCum)}</td>
                      <td style={{ textAlign: 'right', color: sectionAData.salesTotal.thisWeek > 0 ? '#2563eb' : undefined }}>{fmtM(sectionAData.salesTotal.thisWeek)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.salesTotal.monthCum)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(sectionAData.salesTotal.monthTarget)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(pct(sectionAData.salesTotal.monthCum, sectionAData.salesTotal.monthTarget)) }}>
                        {sectionAData.salesTotal.monthTarget > 0 && sectionAData.salesTotal.monthCum > 0 ? `${pct(sectionAData.salesTotal.monthCum, sectionAData.salesTotal.monthTarget)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 매출: Import S시트(B/L date 기준) / 목표: 수주 목표와 동일값 사용 (별도 매출 목표 미도입)
              </div>
            </div>
          )}

          {hasPlan && !sectionAData.hasSalesData && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 11, color: 'var(--text3)' }}>
              ⚠ 매출(S시트) 데이터가 import되지 않았습니다. 설정 → 영업현황 Import에서 S시트를 포함한 파일을 업로드하세요.
            </div>
          )}

          {/* ══ 섹션 B — 이슈사항 자동 집계 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 2. 영업본부 주간 이슈사항</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{sectionBData.totalCount}건</span>
            </div>
            {sectionBData.totalCount === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>해당 주 등록된 이슈 없음</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 110 }}>구분</th>
                      <th style={{ minWidth: 40 }}>팀</th>
                      <th style={{ minWidth: 80 }}>고객명</th>
                      <th>주요 내용</th>
                      <th style={{ minWidth: 50 }}>담당</th>
                      <th style={{ minWidth: 60 }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ISSUE_CAT_ORDER.map(cat => {
                      const rows = sectionBData.grouped[cat];
                      if (rows.length === 0) {
                        return (
                          <tr key={cat} style={{ background: 'var(--bg2)' }}>
                            <td style={{ fontWeight: 600, color: 'var(--text2)' }}>{ISSUE_CAT_LABELS[cat]}</td>
                            <td colSpan={5} style={{ color: 'var(--text4)', fontSize: 11 }}>—</td>
                          </tr>
                        );
                      }
                      return rows.map((r, i) => (
                        <tr key={`${cat}-${i}`}>
                          {i === 0 && (
                            <td rowSpan={rows.length} style={{ fontWeight: 600, verticalAlign: 'top', background: 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                              {ISSUE_CAT_LABELS[cat]}
                            </td>
                          )}
                          <td style={{ fontSize: 11, color: 'var(--text2)' }}>{r.teamShort}</td>
                          <td style={{ fontWeight: 600, fontSize: 11 }}>{r.company}</td>
                          <td style={{ fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--text3)', marginRight: 4 }}>[{r.issueType}]</span>
                            {r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content}
                          </td>
                          <td style={{ fontSize: 11 }}>{r.rep}</td>
                          <td>
                            <span className={`status-badge ${r.status === 'Open' ? 'open' : r.status === 'In Progress' ? 'in-progress' : 'closed'}`} style={{ fontSize: 10 }}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ══ 섹션 C — 다음 주 예정 액션 (미완료 이슈 자동 이월 포함) ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>■ 3. 다음 주 예정 액션</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>({sectionCData.nextWeekLabel})</span>
              {sectionCData.carryoverCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, background: '#fee2e2', padding: '2px 8px', borderRadius: 10 }}>
                  이월 {sectionCData.carryoverCount}건
                </span>
              )}
            </div>
            {sectionCData.actions.length === 0 && sectionCData.reorderAlarms.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>예정된 액션 없음</div>
            ) : (
              <>
                {sectionCData.actions.length > 0 && (
                  <div className="table-wrap" style={{ marginBottom: sectionCData.reorderAlarms.length > 0 ? 12 : 0 }}>
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 50 }}>구분</th>
                          <th style={{ minWidth: 40 }}>팀</th>
                          <th style={{ minWidth: 80 }}>고객명</th>
                          <th>액션 내용</th>
                          <th style={{ minWidth: 50 }}>담당</th>
                          <th style={{ minWidth: 80 }}>기한</th>
                          <th style={{ minWidth: 60 }}>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionCData.actions.map((a, i) => (
                          <tr key={i} style={{ background: a.isCarryover ? '#fef2f2' : undefined }}>
                            <td>
                              {a.isCarryover
                                ? <span style={{ fontSize: 10, color: '#fff', background: 'var(--red)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>이월</span>
                                : <span style={{ fontSize: 10, color: 'var(--text3)' }}>신규</span>}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--text2)' }}>{a.teamShort}</td>
                            <td style={{ fontWeight: 600, fontSize: 11 }}>{a.company}</td>
                            <td style={{ fontSize: 11 }}>
                              {a.action}
                              {a.isCarryover && a.daysOpen > 0 && (
                                <span style={{ fontSize: 10, color: 'var(--red)', marginLeft: 6 }}>({a.daysOpen}일 경과)</span>
                              )}
                            </td>
                            <td style={{ fontSize: 11 }}>{a.rep}</td>
                            <td style={{ fontSize: 11, fontWeight: 600 }}>{a.dueDate}</td>
                            <td>
                              <span className={`status-badge ${a.status === 'Open' ? 'open' : a.status === 'In Progress' ? 'in-progress' : 'closed'}`} style={{ fontSize: 10 }}>
                                {a.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(sectionCData.reorderBySource.fcst.length + sectionCData.reorderBySource.plan.length + sectionCData.reorderBySource.trend.length) > 0 && (
                  <div style={{ padding: '8px 0', display: 'grid', gap: 10 }}>
                    {sectionCData.reorderBySource.fcst.length > 0 && (
                      <div style={{ padding: '6px 10px', background: '#dbeafe', borderRadius: 6, borderLeft: '3px solid #2563eb' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>🔵 [FCST 기반] 재구매 예상 D-14 이내 ({sectionCData.reorderBySource.fcst.length}건)</div>
                        {sectionCData.reorderBySource.fcst.map((a, i) => (
                          <div key={i} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text2)' }}>
                            • <strong>{a.account?.company_name}</strong> — {a.msg.replace(/^🔵 \[FCST\]\s*/, '')}
                          </div>
                        ))}
                      </div>
                    )}
                    {sectionCData.reorderBySource.plan.length > 0 && (
                      <div style={{ padding: '6px 10px', background: '#dcfce7', borderRadius: 6, borderLeft: '3px solid #16a34a' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>🟢 [사업계획 기반] 타겟 D-14 이내 ({sectionCData.reorderBySource.plan.length}건)</div>
                        {sectionCData.reorderBySource.plan.map((a, i) => (
                          <div key={i} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text2)' }}>
                            • <strong>{a.account?.company_name}</strong> — {a.msg.replace(/^🟢 \[사업계획\]\s*/, '')}
                          </div>
                        ))}
                      </div>
                    )}
                    {sectionCData.reorderBySource.trend.length > 0 && (
                      <div style={{ padding: '6px 10px', background: '#fef3c7', borderRadius: 6, borderLeft: '3px solid #d97706' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>🟡 [트렌드 기반] 주문 패턴 예상 D-14 이내 ({sectionCData.reorderBySource.trend.length}건)</div>
                        {sectionCData.reorderBySource.trend.map((a, i) => (
                          <div key={i} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text2)' }}>
                            • <strong>{a.account?.company_name}</strong> — {a.msg.replace(/^🟡 \[트렌드\]\s*/, '')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 기존 상세 분석 ── */}
          <div className="report-section-title no-print" style={{ marginTop: 8 }}>상세 분석 ({weeklyData.weekStart} ~ {weeklyData.weekEnd})</div>

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

          {/* Section 3: 금주 활동 요약 (전원 표시, 배정 고객수 포함) */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">금주 활동 요약 (담당자별)</div>
            <div className="table-wrap" style={{ maxHeight: 350 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>담당자</th>
                    <th style={{ textAlign: 'right' }}>배정 고객수</th>
                    <th style={{ textAlign: 'right' }}>컨택건수</th>
                    <th style={{ textAlign: 'right' }}>컨택율</th>
                    <th style={{ textAlign: 'right' }}>수주활동</th>
                    <th style={{ textAlign: 'right' }}>크로스셀링</th>
                    <th>주요 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(weeklyData.repActivity)
                    .sort((a, b) => b[1].contacts - a[1].contacts || b[1].assignedCount - a[1].assignedCount)
                    .map(([rep, v]) => {
                      const contactRate = v.assignedCount > 0 ? Math.round((v.contacts / v.assignedCount) * 100) : 0;
                      return (
                        <tr key={rep} style={{ opacity: v.contacts === 0 ? 0.6 : 1 }}>
                          <td style={{ fontWeight: 600 }}>{rep}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{v.assignedCount}사</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: v.contacts === 0 ? 'var(--red)' : 'var(--accent)' }}>{v.contacts}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: contactRate >= 20 ? 'var(--green, #16a34a)' : contactRate >= 10 ? 'var(--text2)' : 'var(--red)' }}>
                            {v.assignedCount > 0 ? `${contactRate}%` : '-'}
                          </td>
                          <td style={{ textAlign: 'right' }}>{v.orderActivity}</td>
                          <td style={{ textAlign: 'right' }}>{v.crossSelling}</td>
                          <td style={{ fontSize: 11, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.latestContent || (v.contacts === 0 ? '⚠ 금주 활동 없음' : '-')}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              ※ 컨택율 = 컨택건수 ÷ 배정 고객수 × 100
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
          {/* ── 월 네비게이터 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            marginBottom: 16, padding: '10px 0',
          }}>
            <button className="btn btn-ghost" onClick={() => setMonthOffset(m => m - 1)} style={{ fontSize: 13, padding: '6px 12px' }}>◀ 이전 월</button>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 180, textAlign: 'center' }}>
              {monthlyReportData.monthLabel}
            </div>
            <button className="btn btn-ghost" onClick={() => setMonthOffset(m => m + 1)} style={{ fontSize: 13, padding: '6px 12px' }} disabled={monthOffset >= 0}>다음 월 ▶</button>
            {monthOffset !== -1 && (
              <button className="btn btn-ghost" onClick={() => setMonthOffset(-1)} style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text3)' }}>전월로</button>
            )}
          </div>

          {/* ══ 섹션 A — Executive Summary (수동 입력) ══ */}
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg2)' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 0. 이번 달 핵심 요약</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[영업본부장 직접 입력]</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[1, 2, 3].map(i => {
                const key = `msg${i}`;
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)' }}>핵심 메시지 {i}</label>
                    <input
                      type="text"
                      value={execSummary[key] || ''}
                      onChange={e => saveExecSummary({ [key]: e.target.value })}
                      placeholder={`핵심 메시지 ${i}을 입력하세요`}
                      style={{ flex: 1, padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)' }}>종합 판단</label>
                {['🟢 순조', '🟡 주의', '🔴 위기'].map(opt => {
                  const icon = opt.split(' ')[0];
                  return (
                    <button
                      key={opt}
                      onClick={() => saveExecSummary({ status: icon })}
                      className={`btn btn-sm ${execSummary.status === icon ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: 12 }}
                    >{opt}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)', marginTop: 4 }}>다음 달 집중</label>
                <textarea
                  value={execSummary.nextMonthFocus || ''}
                  onChange={e => saveExecSummary({ nextMonthFocus: e.target.value })}
                  placeholder="다음 달 집중 과제를 입력하세요"
                  rows={2}
                  style={{ flex: 1, padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* ══ 섹션 B-1 — 월별 수주 실적 현황 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 1. 수주현황 — 월별 실적</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[단위: 백만원 / %]</span>
            </div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 80, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>구분</th>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <th key={t.month} style={{ textAlign: 'right', minWidth: 55, background: t.month === monthlyReportData.selMonth ? 'var(--accent-bg, #e0f2fe)' : undefined }}>
                        {t.month}월
                      </th>
                    ))}
                    <th style={{ textAlign: 'right', minWidth: 65, fontWeight: 700 }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년실적</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(t.prevYearActual)}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.trendTotal.prevYearActual)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right' }}>{fmtM(t.target)}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.trendTotal.target)}</td>
                  </tr>
                  <tr style={{ background: 'var(--bg2)' }}>
                    <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>실적</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', fontWeight: 600, color: t.actual > 0 ? 'var(--accent)' : 'var(--text3)' }}>{fmtM(t.actual)}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmtM(monthlyReportData.trendTotal.actual)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년대비</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.yoyPct) }}>{t.prevYearActual > 0 && t.actual > 0 ? `${t.yoyPct}%` : '-'}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {monthlyReportData.trendTotal.prevYearActual > 0 ? `${Math.round((monthlyReportData.trendTotal.actual / monthlyReportData.trendTotal.prevYearActual) * 100)}%` : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표대비</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.targetPct) }}>{t.target > 0 ? `${t.targetPct}%` : '-'}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {monthlyReportData.trendTotal.target > 0 ? `${Math.round((monthlyReportData.trendTotal.actual / monthlyReportData.trendTotal.target) * 100)}%` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ 섹션 B-1-2 — 매출 현황 월별 실적 (B/L date 기준) ══ */}
          {monthlyReportData.hasSalesData && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 1-2. 매출현황 — 월별 실적</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[B/L date 기준, 단위: 백만원]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 80, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>구분</th>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <th key={t.month} style={{ textAlign: 'right', minWidth: 55, background: t.month === monthlyReportData.selMonth ? '#dbeafe' : undefined }}>
                          {t.month}월
                        </th>
                      ))}
                      <th style={{ textAlign: 'right', minWidth: 65, fontWeight: 700 }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년실적</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(t.prevYearActual)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.salesTrendTotal.prevYearActual)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right' }}>{fmtM(t.target)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.salesTrendTotal.target)}</td>
                    </tr>
                    <tr style={{ background: 'var(--bg2)' }}>
                      <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>실적</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', fontWeight: 600, color: t.actual > 0 ? '#2563eb' : 'var(--text3)' }}>{fmtM(t.actual)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{fmtM(monthlyReportData.salesTrendTotal.actual)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년대비</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.yoyPct) }}>{t.prevYearActual > 0 && t.actual > 0 ? `${t.yoyPct}%` : '-'}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {monthlyReportData.salesTrendTotal.prevYearActual > 0 ? `${Math.round((monthlyReportData.salesTrendTotal.actual / monthlyReportData.salesTrendTotal.prevYearActual) * 100)}%` : '-'}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표대비</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.targetPct) }}>{t.target > 0 && t.actual > 0 ? `${t.targetPct}%` : '-'}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {monthlyReportData.salesTrendTotal.target > 0 && monthlyReportData.salesTrendTotal.actual > 0 ? `${Math.round((monthlyReportData.salesTrendTotal.actual / monthlyReportData.salesTrendTotal.target) * 100)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ 섹션 B-2 — 팀별 월간 실적 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 2. 팀별 월간 실적</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[{monthlyReportData.monthLabel} 기준]</span>
            </div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 100 }}>팀</th>
                    <th style={{ textAlign: 'right' }}>목표</th>
                    <th style={{ textAlign: 'right' }}>실적</th>
                    <th style={{ textAlign: 'right' }}>달성률</th>
                    <th style={{ textAlign: 'right' }}>전년 동월</th>
                    <th style={{ textAlign: 'right' }}>전년대비</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyReportData.teamRows.map(r => (
                    <tr key={r.team}>
                      <td style={{ fontWeight: 600 }}>{r.display}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(r.target)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmtM(r.actual)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(r.achieveRate) }}>{r.target > 0 ? `${r.achieveRate}%` : '-'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(r.prevYearActual)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(r.yoyRate) }}>{r.prevYearActual > 0 ? `${r.yoyRate}%` : '-'}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td>Total</td>
                    <td style={{ textAlign: 'right' }}>{fmtM(monthlyReportData.teamTotal.target)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtM(monthlyReportData.teamTotal.actual)}</td>
                    <td style={{ textAlign: 'right', ...achieveStyle(pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.target)) }}>
                      {monthlyReportData.teamTotal.target > 0 ? `${pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.target)}%` : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtM(monthlyReportData.teamTotal.prevYearActual)}</td>
                    <td style={{ textAlign: 'right', ...achieveStyle(pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.prevYearActual)) }}>
                      {monthlyReportData.teamTotal.prevYearActual > 0 ? `${pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.prevYearActual)}%` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ 섹션 B-2-2 — 팀별 월간 매출 ══ */}
          {monthlyReportData.hasSalesData && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 2-2. 팀별 월간 매출</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[{monthlyReportData.monthLabel} / B/L date 기준]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 100 }}>팀</th>
                      <th style={{ textAlign: 'right' }}>목표</th>
                      <th style={{ textAlign: 'right' }}>매출</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'right' }}>전년 동월</th>
                      <th style={{ textAlign: 'right' }}>전년대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReportData.salesTeamRows.map(r => (
                      <tr key={r.team}>
                        <td style={{ fontWeight: 600 }}>{r.display}</td>
                        <td style={{ textAlign: 'right' }}>{fmtM(r.target)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>{fmtM(r.actual)}</td>
                        <td style={{ textAlign: 'right', ...achieveStyle(r.achieveRate) }}>{r.target > 0 && r.actual > 0 ? `${r.achieveRate}%` : '-'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(r.prevYearActual)}</td>
                        <td style={{ textAlign: 'right', ...achieveStyle(r.yoyRate) }}>{r.prevYearActual > 0 && r.actual > 0 ? `${r.yoyRate}%` : '-'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td>Total</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(monthlyReportData.salesTeamTotal.target)}</td>
                      <td style={{ textAlign: 'right', color: '#2563eb' }}>{fmtM(monthlyReportData.salesTeamTotal.actual)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(pct(monthlyReportData.salesTeamTotal.actual, monthlyReportData.salesTeamTotal.target)) }}>
                        {monthlyReportData.salesTeamTotal.target > 0 && monthlyReportData.salesTeamTotal.actual > 0 ? `${pct(monthlyReportData.salesTeamTotal.actual, monthlyReportData.salesTeamTotal.target)}%` : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmtM(monthlyReportData.salesTeamTotal.prevYearActual)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(pct(monthlyReportData.salesTeamTotal.actual, monthlyReportData.salesTeamTotal.prevYearActual)) }}>
                        {monthlyReportData.salesTeamTotal.prevYearActual > 0 && monthlyReportData.salesTeamTotal.actual > 0 ? `${pct(monthlyReportData.salesTeamTotal.actual, monthlyReportData.salesTeamTotal.prevYearActual)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ 섹션 C — 팀별 월간 활동 분석 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">■ 3. 팀별 월간 활동 분석</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {TEAM_ORDER.map(team => {
                const t = monthlyReportData.teamActivity[team];
                return (
                  <div key={team} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--bg2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>[{t.display}]</div>
                    <table style={{ width: '100%', fontSize: 11 }}>
                      <tbody>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>총 Activity</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.total}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>신규 계약 체결</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.newContract}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>Cross-selling</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.crossSelling}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>미해결 이슈</td><td style={{ textAlign: 'right', fontWeight: 600, color: t.openIssues > 0 ? 'var(--red)' : undefined }}>{t.openIssues}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>주요 고객 컨택</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.contactedCount}사</td></tr>
                      </tbody>
                    </table>
                    {t.majorIssues.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>주요 이슈 TOP {t.majorIssues.length}</div>
                        {t.majorIssues.map((iss, i) => (
                          <div key={i} style={{ fontSize: 10, padding: '2px 0', color: 'var(--text2)' }}>
                            • <strong>{iss.company}</strong> [{iss.type}] {iss.content.length > 30 ? iss.content.slice(0, 30) + '...' : iss.content}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══ 섹션 D — 주요 거래처별 실적 (상위 10사) ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">■ 4. 주요 거래처별 수주 현황 (상위 10사)</div>
            {monthlyReportData.topAccounts.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>당월 수주 없음</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 30, textAlign: 'center' }}>#</th>
                      <th>거래처명</th>
                      <th style={{ textAlign: 'right' }}>당월 수주</th>
                      <th style={{ textAlign: 'right' }}>전월 수주</th>
                      <th style={{ textAlign: 'right' }}>증감률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReportData.topAccounts.map((a, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: 'center', color: 'var(--text3)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmtM(a.thisMonth)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(a.lastMonth)}</td>
                        <td style={{ textAlign: 'right', color: a.changeRate === null ? 'var(--text3)' : a.changeRate > 0 ? 'var(--green, #16a34a)' : a.changeRate < 0 ? 'var(--red)' : 'var(--text2)', fontWeight: 600 }}>
                          {a.changeRate === null ? '신규' : a.changeRate > 0 ? `+${a.changeRate}%` : `${a.changeRate}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ══ 섹션 E — 다음 달 사업 계획 (반자동) ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">■ 5. 다음 달 주요 계획</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {[
                { key: 'overseas', label: '해외영업팀' },
                { key: 'domestic', label: '국내영업팀' },
                { key: 'support', label: '영업지원팀' },
              ].map(t => (
                <div key={t.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)', marginTop: 4 }}>[{t.label}]</label>
                  <textarea
                    value={nextMonthPlan[t.key] || ''}
                    onChange={e => saveNextMonthPlan({ [t.key]: e.target.value })}
                    placeholder={`${t.label} 다음 달 주요 계획`}
                    rows={2}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical' }}
                  />
                </div>
              ))}
            </div>
            {monthlyReportData.reorderSoon.length > 0 && (() => {
              const grouped = {
                fcst: monthlyReportData.reorderSoon.filter(a => a.source === 'fcst'),
                plan: monthlyReportData.reorderSoon.filter(a => a.source === 'plan'),
                trend: monthlyReportData.reorderSoon.filter(a => a.source === 'trend'),
                other: monthlyReportData.reorderSoon.filter(a => !a.source),
              };
              return (
                <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 8, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>🔔 재구매 임박 고객 (유형별)</div>
                  {grouped.fcst.length > 0 && (
                    <div style={{ padding: '6px 10px', background: '#dbeafe', borderRadius: 4, borderLeft: '3px solid #2563eb' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 3 }}>🔵 FCST 기반 ({grouped.fcst.length}건)</div>
                      {grouped.fcst.map((a, i) => (
                        <div key={i} style={{ fontSize: 10, padding: '2px 0', color: 'var(--text2)' }}>
                          • <strong>{a.account?.company_name}</strong> — {a.msg.replace(/^🔵 \[FCST\]\s*/, '')}
                        </div>
                      ))}
                    </div>
                  )}
                  {grouped.plan.length > 0 && (
                    <div style={{ padding: '6px 10px', background: '#dcfce7', borderRadius: 4, borderLeft: '3px solid #16a34a' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', marginBottom: 3 }}>🟢 사업계획 기반 ({grouped.plan.length}건)</div>
                      {grouped.plan.map((a, i) => (
                        <div key={i} style={{ fontSize: 10, padding: '2px 0', color: 'var(--text2)' }}>
                          • <strong>{a.account?.company_name}</strong> — {a.msg.replace(/^🟢 \[사업계획\]\s*/, '')}
                        </div>
                      ))}
                    </div>
                  )}
                  {grouped.trend.length > 0 && (
                    <div style={{ padding: '6px 10px', background: '#fef3c7', borderRadius: 4, borderLeft: '3px solid #d97706' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', marginBottom: 3 }}>🟡 트렌드 기반 ({grouped.trend.length}건)</div>
                      {grouped.trend.map((a, i) => (
                        <div key={i} style={{ fontSize: 10, padding: '2px 0', color: 'var(--text2)' }}>
                          • <strong>{a.account?.company_name}</strong> — {a.msg.replace(/^🟡 \[트렌드\]\s*/, '')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {monthlyReportData.contractExpiringSoon.length > 0 && (
              <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706', marginBottom: 6 }}>🟡 계약 만료 임박 (D-60 이내)</div>
                {monthlyReportData.contractExpiringSoon.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text2)' }}>
                    • <strong>{c.company}</strong> — {c.product} / D-{c.daysLeft} ({c.expiry})
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="report-section-title" style={{ marginTop: 8 }}>상세 분석 ({monthlyData.thisMonthStr})</div>

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
