import React, { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

function pct(actual, target) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}

function pctColor(p) {
  if (p >= 90) return 'green';
  if (p >= 70) return 'yellow';
  return 'red';
}

function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}

export default function Progress() {
  const { businessPlans, orders, accounts, setEditingAccount } = useAccount();

  // 고객별 사업계획 (product plans 제외)
  const customerPlans = useMemo(() =>
    businessPlans.filter(p => p.year === CURRENT_YEAR && (p.type === 'customer' || !p.type)),
    [businessPlans]
  );

  // 품목별 사업계획
  const productPlans = useMemo(() =>
    businessPlans.filter(p => p.year === CURRENT_YEAR && p.type === 'product'),
    [businessPlans]
  );

  const yearOrders = useMemo(() =>
    orders.filter(o => (o.order_date || '').startsWith(String(CURRENT_YEAR))),
    [orders]
  );

  // customer_name → plan 매핑
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

  // ── 전체 연간 목표/실적 ──
  const overallStats = useMemo(() => {
    const annualTarget = customerPlans.reduce((s, p) => s + (p.annual_target || 0), 0);

    let ytdTarget = 0;
    customerPlans.forEach(p => {
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });

    const ytdActual = yearOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    // 월별 추이
    const monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const mk = String(m).padStart(2, '0');
      const target = customerPlans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
      const actual = yearOrders.filter(o => parseInt((o.order_date || '').slice(5, 7)) === m)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      monthlyData.push({ month: m, target, actual });
    }

    return { annualTarget, ytdTarget, ytdActual, monthlyData };
  }, [customerPlans, yearOrders]);

  // ── 담당자별 진도 (계획의 sales_rep 기준) ──
  const repProgress = useMemo(() => {
    const map = {};

    customerPlans.forEach(p => {
      const rep = p.sales_rep || '미배정';
      if (!map[rep]) map[rep] = { rep, annualTarget: 0, ytdTarget: 0, ytdActual: 0 };
      map[rep].annualTarget += (p.annual_target || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        map[rep].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });

    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || '기타';
      if (!map[rep]) map[rep] = { rep, annualTarget: 0, ytdTarget: 0, ytdActual: 0 };
      map[rep].ytdActual += (o.order_amount || 0);
    });

    return Object.values(map)
      .filter(r => r.annualTarget > 0 || r.ytdActual > 0)
      .map(r => ({ ...r, ytdPct: pct(r.ytdActual, r.ytdTarget) }))
      .sort((a, b) => b.annualTarget - a.annualTarget);
  }, [customerPlans, yearOrders, planLookup]);

  // ── 고객별 진도 ── (customer_name 기반 매칭)
  const accountProgress = useMemo(() => {
    const map = {}; // key = customer_name lowercase

    customerPlans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (!key) return;
      if (!map[key]) {
        const account = p.account_id ? accounts.find(a => a.id === p.account_id) : null;
        map[key] = {
          key,
          account_id: p.account_id,
          customer_name: p.customer_name,
          sales_rep: p.sales_rep || account?.sales_rep || '',
          region: p.region || account?.region || '',
          annualTarget: 0, ytdTarget: 0, ytdActual: 0,
          account,
          matched: !!p.account_id,
        };
      }
      map[key].annualTarget += (p.annual_target || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        map[key].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });

    yearOrders.forEach(o => {
      const key = (o.customer_name || '').toLowerCase().trim();
      if (key && map[key]) {
        map[key].ytdActual += (o.order_amount || 0);
      }
    });

    return Object.values(map)
      .map(r => ({ ...r, ytdPct: pct(r.ytdActual, r.ytdTarget), annualPct: pct(r.ytdActual, r.annualTarget) }))
      .sort((a, b) => b.annualTarget - a.annualTarget);
  }, [customerPlans, yearOrders, accounts]);

  // ── 품목별 진도 ──
  const productProgress = useMemo(() => {
    const map = {};

    productPlans.forEach(p => {
      if (!map[p.product]) map[p.product] = { product: p.product, annualTarget: 0, ytdTarget: 0, ytdActual: 0 };
      map[p.product].annualTarget += (p.annual_target || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        map[p.product].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });

    yearOrders.forEach(o => {
      const prod = (o.product_category || '').trim();
      if (!prod) return;
      if (map[prod]) {
        map[prod].ytdActual += (o.order_amount || 0);
      } else {
        const matchKey = Object.keys(map).find(k =>
          prod.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(prod.toLowerCase())
        );
        if (matchKey) map[matchKey].ytdActual += (o.order_amount || 0);
      }
    });

    return Object.values(map)
      .filter(r => r.annualTarget > 0)
      .map(r => ({ ...r, ytdPct: pct(r.ytdActual, r.ytdTarget), annualPct: pct(r.ytdActual, r.annualTarget) }))
      .sort((a, b) => b.annualTarget - a.annualTarget);
  }, [productPlans, yearOrders]);

  const maxMonthly = Math.max(1, ...overallStats.monthlyData.map(m => Math.max(m.target, m.actual)));

  if (customerPlans.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📊</div>
        <p>사업계획 데이터가 없습니다.<br />설정 → 사업계획 Import에서 엑셀 파일을 업로드해주세요.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="report-section-title">{CURRENT_YEAR}년 사업계획 진도관리 ({CURRENT_MONTH}월 기준)</div>

      {/* 전체 KPI */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi accent">
          <div className="kpi-label">연간 목표</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{fmtKRW(overallStats.annualTarget)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">YTD 목표 (~{CURRENT_MONTH}월)</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{fmtKRW(overallStats.ytdTarget)}</div>
        </div>
        <div className={`kpi ${pctColor(pct(overallStats.ytdActual, overallStats.ytdTarget))}`}>
          <div className="kpi-label">YTD 실적</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{fmtKRW(overallStats.ytdActual)}</div>
        </div>
        <div className={`kpi ${pctColor(pct(overallStats.ytdActual, overallStats.ytdTarget))}`}>
          <div className="kpi-label">YTD 달성률</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{pct(overallStats.ytdActual, overallStats.ytdTarget)}%</div>
        </div>
      </div>

      {/* 월별 목표 vs 실적 차트 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📈 월별 목표 vs 실적</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--accent)' }}>■ 목표</span>
          <span style={{ fontSize: 10, color: 'var(--green)' }}>■ 실적</span>
        </div>
        <div className="monthly-chart">
          {overallStats.monthlyData.map((m, i) => (
            <div key={i} className="monthly-bar-group">
              <div className="monthly-bars">
                <div className="monthly-bar target" style={{ height: `${(m.target / maxMonthly) * 100}%` }} title={`목표: ${fmtKRW(m.target)}`} />
                <div className="monthly-bar actual" style={{ height: `${(m.actual / maxMonthly) * 100}%` }} title={`실적: ${fmtKRW(m.actual)}`} />
              </div>
              <div className="monthly-label">{m.month}월</div>
              {m.month <= CURRENT_MONTH && m.target > 0 && (
                <div className={`monthly-pct ${pctColor(pct(m.actual, m.target))}`}>{pct(m.actual, m.target)}%</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 담당자별 진도 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">👤 담당자별 진도</div>
        <div className="table-wrap" style={{ maxHeight: 300 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>담당자</th>
                <th style={{ textAlign: 'right' }}>연간 목표</th>
                <th style={{ textAlign: 'right' }}>YTD 목표</th>
                <th style={{ textAlign: 'right' }}>YTD 실적</th>
                <th style={{ textAlign: 'right' }}>달성률</th>
                <th style={{ width: 120 }}>진도</th>
              </tr>
            </thead>
            <tbody>
              {repProgress.map(r => (
                <tr key={r.rep}>
                  <td style={{ fontWeight: 600 }}>{r.rep}</td>
                  <td style={{ textAlign: 'right' }}>{fmtKRW(r.annualTarget)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtKRW(r.ytdTarget)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(r.ytdActual)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`score-badge ${pctColor(r.ytdPct)}`}>{r.ytdPct}%</span>
                  </td>
                  <td>
                    <div className="score-gauge" style={{ height: 10 }}>
                      <div className={`score-gauge-fill ${pctColor(r.ytdPct)}`} style={{ width: `${Math.min(100, r.ytdPct)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="two-col">
        {/* 고객별 진도 */}
        <div className="card">
          <div className="card-title">🏢 고객별 진도 (Top 20)</div>
          <div className="table-wrap" style={{ maxHeight: 400 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>고객명</th>
                  <th style={{ textAlign: 'right' }}>연간 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 실적</th>
                  <th style={{ textAlign: 'right' }}>달성률</th>
                </tr>
              </thead>
              <tbody>
                {accountProgress.slice(0, 20).map(a => (
                  <tr key={a.key}
                    style={{ cursor: a.account ? 'pointer' : 'default', opacity: a.matched ? 1 : 0.6 }}
                    onClick={() => a.account && setEditingAccount(a.account)}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 11 }}>
                        {!a.matched && <span style={{ color: 'var(--text3)' }} title="CRM 미등록">* </span>}
                        {a.customer_name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{a.sales_rep} · {a.region}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(a.annualTarget)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(a.ytdActual)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`score-badge ${pctColor(a.annualPct)}`}>{a.annualPct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 품목별 진도 */}
        <div className="card">
          <div className="card-title">📦 품목별 진도</div>
          {productProgress.length > 0 ? (
            <div className="table-wrap" style={{ maxHeight: 400 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>제품군</th>
                    <th style={{ textAlign: 'right' }}>연간 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 실적</th>
                    <th style={{ textAlign: 'right' }}>달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {productProgress.map(p => (
                    <tr key={p.product}>
                      <td style={{ fontWeight: 600, fontSize: 11 }}>{p.product}</td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(p.annualTarget)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(p.ytdActual)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`score-badge ${pctColor(p.annualPct)}`}>{p.annualPct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              품목별 목표 데이터가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* GAP 분석 */}
      {accountProgress.filter(a => a.ytdPct < 70 && a.ytdTarget > 0).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">🔴 GAP 분석 — 목표 대비 70% 미달 고객</div>
          <div className="issue-list">
            {accountProgress
              .filter(a => a.ytdPct < 70 && a.ytdTarget > 0)
              .sort((a, b) => (a.ytdActual - a.ytdTarget) - (b.ytdActual - b.ytdTarget))
              .map(a => (
                <div key={a.key} className="issue-row"
                  style={{ cursor: a.account ? 'pointer' : 'default' }}
                  onClick={() => a.account && setEditingAccount(a.account)}>
                  <span className="issue-company">{a.customer_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--red)' }}>GAP: {fmtKRW(a.ytdActual - a.ytdTarget)}</span>
                  <span className={`score-badge ${pctColor(a.ytdPct)}`}>{a.ytdPct}%</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{a.sales_rep}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 상세 GAP 분석 */}
      <DetailedGapAnalysis
        customerPlans={customerPlans}
        productPlans={productPlans}
        yearOrders={yearOrders}
        accounts={accounts}
        planLookup={planLookup}
        findPlanForOrder={findPlanForOrder}
        accountProgress={accountProgress}
        productProgress={productProgress}
        repProgress={repProgress}
        setEditingAccount={setEditingAccount}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────
   상세 GAP 분석 컴포넌트
   ──────────────────────────────────────────────── */
function DetailedGapAnalysis({ customerPlans, productPlans, yearOrders, accounts, planLookup, findPlanForOrder, accountProgress, productProgress, repProgress, setEditingAccount }) {
  const [gapTab, setGapTab] = useState('rep');
  const [expandedRows, setExpandedRows] = useState({});

  const months = [];
  for (let m = 1; m <= CURRENT_MONTH; m++) months.push(m);

  const toggleRow = (key) => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));

  // ── 담당자별 월간 GAP ──
  const repMonthlyGap = useMemo(() => {
    const map = {};

    customerPlans.forEach(p => {
      const rep = p.sales_rep || '미배정';
      if (!map[rep]) map[rep] = { rep, months: {}, ytdTarget: 0, ytdActual: 0, underCustomers: [] };
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        const mk = String(m).padStart(2, '0');
        if (!map[rep].months[m]) map[rep].months[m] = { target: 0, actual: 0 };
        map[rep].months[m].target += (p.targets?.[mk] || 0);
        map[rep].ytdTarget += (p.targets?.[mk] || 0);
      }
    });

    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || '기타';
      if (!map[rep]) map[rep] = { rep, months: {}, ytdTarget: 0, ytdActual: 0, underCustomers: [] };
      const m = parseInt((o.order_date || '').slice(5, 7));
      if (m >= 1 && m <= CURRENT_MONTH) {
        if (!map[rep].months[m]) map[rep].months[m] = { target: 0, actual: 0 };
        map[rep].months[m].actual += (o.order_amount || 0);
        map[rep].ytdActual += (o.order_amount || 0);
      }
    });

    // 주요 미달 고객 (top 3)
    Object.keys(map).forEach(rep => {
      const repCustomers = accountProgress
        .filter(a => a.sales_rep === rep && a.ytdTarget > 0)
        .map(a => ({ ...a, gap: a.ytdActual - a.ytdTarget }))
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 3);
      map[rep].underCustomers = repCustomers;
    });

    return Object.values(map).filter(r => r.ytdTarget > 0 || r.ytdActual > 0).sort((a, b) => b.ytdTarget - a.ytdTarget);
  }, [customerPlans, yearOrders, accountProgress, planLookup]);

  // ── 품목별 월간 GAP ──
  const productMonthlyGap = useMemo(() => {
    const map = {};

    productPlans.forEach(p => {
      if (!map[p.product]) map[p.product] = { product: p.product, months: {}, ytdTarget: 0, ytdActual: 0 };
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        const mk = String(m).padStart(2, '0');
        if (!map[p.product].months[m]) map[p.product].months[m] = { target: 0, actual: 0 };
        map[p.product].months[m].target += (p.targets?.[mk] || 0);
        map[p.product].ytdTarget += (p.targets?.[mk] || 0);
      }
    });

    yearOrders.forEach(o => {
      const prod = (o.product_category || '').trim();
      if (!prod) return;
      const matchKey = map[prod] ? prod : Object.keys(map).find(k =>
        prod.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(prod.toLowerCase())
      );
      if (matchKey) {
        const m = parseInt((o.order_date || '').slice(5, 7));
        if (m >= 1 && m <= CURRENT_MONTH) {
          if (!map[matchKey].months[m]) map[matchKey].months[m] = { target: 0, actual: 0 };
          map[matchKey].months[m].actual += (o.order_amount || 0);
          map[matchKey].ytdActual += (o.order_amount || 0);
        }
      }
    });

    return Object.values(map).filter(r => r.ytdTarget > 0).sort((a, b) => b.ytdTarget - a.ytdTarget);
  }, [productPlans, yearOrders]);

  // ── 지역별 월간 GAP ──
  const regionMonthlyGap = useMemo(() => {
    const map = {};

    customerPlans.forEach(p => {
      const account = p.account_id ? accounts.find(a => a.id === p.account_id) : null;
      const region = p.region || account?.region || '기타';
      if (!map[region]) map[region] = { region, months: {}, ytdTarget: 0, ytdActual: 0, underCustomers: [] };
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        const mk = String(m).padStart(2, '0');
        if (!map[region].months[m]) map[region].months[m] = { target: 0, actual: 0 };
        map[region].months[m].target += (p.targets?.[mk] || 0);
        map[region].ytdTarget += (p.targets?.[mk] || 0);
      }
    });

    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const account = accounts.find(a => a.id === o.account_id);
      const region = plan?.region || account?.region || '기타';
      if (!map[region]) map[region] = { region, months: {}, ytdTarget: 0, ytdActual: 0, underCustomers: [] };
      const m = parseInt((o.order_date || '').slice(5, 7));
      if (m >= 1 && m <= CURRENT_MONTH) {
        if (!map[region].months[m]) map[region].months[m] = { target: 0, actual: 0 };
        map[region].months[m].actual += (o.order_amount || 0);
        map[region].ytdActual += (o.order_amount || 0);
      }
    });

    // 지역별 미달 고객
    Object.keys(map).forEach(region => {
      const regionCustomers = accountProgress
        .filter(a => (a.region || '기타') === region && a.ytdTarget > 0)
        .map(a => ({ ...a, gap: a.ytdActual - a.ytdTarget }))
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 5);
      map[region].underCustomers = regionCustomers;
    });

    return Object.values(map).filter(r => r.ytdTarget > 0 || r.ytdActual > 0).sort((a, b) => b.ytdTarget - a.ytdTarget);
  }, [customerPlans, yearOrders, accounts, accountProgress, planLookup]);

  // ── 사업구분별 월간 GAP ──
  const bizTypeMonthlyGap = useMemo(() => {
    const map = {};

    customerPlans.forEach(p => {
      const account = p.account_id ? accounts.find(a => a.id === p.account_id) : null;
      const biz = p.business_type || account?.business_type || '기타';
      if (!map[biz]) map[biz] = { bizType: biz, months: {}, ytdTarget: 0, ytdActual: 0 };
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        const mk = String(m).padStart(2, '0');
        if (!map[biz].months[m]) map[biz].months[m] = { target: 0, actual: 0 };
        map[biz].months[m].target += (p.targets?.[mk] || 0);
        map[biz].ytdTarget += (p.targets?.[mk] || 0);
      }
    });

    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const account = accounts.find(a => a.id === o.account_id);
      const biz = plan?.business_type || account?.business_type || '기타';
      if (!map[biz]) map[biz] = { bizType: biz, months: {}, ytdTarget: 0, ytdActual: 0 };
      const m = parseInt((o.order_date || '').slice(5, 7));
      if (m >= 1 && m <= CURRENT_MONTH) {
        if (!map[biz].months[m]) map[biz].months[m] = { target: 0, actual: 0 };
        map[biz].months[m].actual += (o.order_amount || 0);
        map[biz].ytdActual += (o.order_amount || 0);
      }
    });

    return Object.values(map).filter(r => r.ytdTarget > 0 || r.ytdActual > 0).sort((a, b) => b.ytdTarget - a.ytdTarget);
  }, [customerPlans, yearOrders, accounts, planLookup]);

  // 현재 탭 데이터
  const currentData = gapTab === 'rep' ? repMonthlyGap
    : gapTab === 'product' ? productMonthlyGap
    : gapTab === 'region' ? regionMonthlyGap
    : bizTypeMonthlyGap;

  const totalGap = currentData.reduce((s, r) => s + (r.ytdActual - r.ytdTarget), 0);
  const underCount = currentData.filter(r => r.ytdActual < r.ytdTarget).length;
  const nameKey = gapTab === 'rep' ? 'rep' : gapTab === 'product' ? 'product' : gapTab === 'region' ? 'region' : 'bizType';
  const hasExpand = gapTab === 'rep' || gapTab === 'region';

  if (customerPlans.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">📊 상세 GAP 분석</div>

      {/* 탭 버튼 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { key: 'rep', label: '담당자별' },
          { key: 'product', label: '품목별' },
          { key: 'region', label: '지역별' },
          { key: 'biztype', label: '사업구분별' },
        ].map(t => (
          <button key={t.key}
            className={`tab-btn ${gapTab === t.key ? 'active' : ''}`}
            style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)',
              background: gapTab === t.key ? 'var(--accent)' : 'var(--bg2)',
              color: gapTab === t.key ? '#fff' : 'var(--text2)',
              cursor: 'pointer', fontWeight: gapTab === t.key ? 600 : 400,
            }}
            onClick={() => { setGapTab(t.key); setExpandedRows({}); }}
          >{t.label}</button>
        ))}
      </div>

      {/* 서머리 KPI */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ padding: '8px 16px', borderRadius: 6, background: totalGap < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${totalGap < 0 ? 'var(--red)' : 'var(--green)'}` }}>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>전체 GAP 금액</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: totalGap < 0 ? 'var(--red)' : 'var(--green)' }}>{fmtKRW(totalGap)}</div>
        </div>
        <div style={{ padding: '8px 16px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>미달 항목 수</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>{underCount} / {currentData.length}</div>
        </div>
      </div>

      {/* 월별 GAP 테이블 */}
      <div className="table-wrap" style={{ maxHeight: 500, overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: 10, minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg1)', zIndex: 2, minWidth: 80 }}>구분</th>
              {months.map(m => (
                <th key={m} style={{ textAlign: 'center', minWidth: 65 }}>{m}월</th>
              ))}
              <th style={{ textAlign: 'right', minWidth: 75 }}>YTD GAP</th>
              <th style={{ textAlign: 'right', minWidth: 55 }}>달성률</th>
            </tr>
          </thead>
          <tbody>
            {currentData.map(row => {
              const key = row[nameKey];
              const ytdGap = row.ytdActual - row.ytdTarget;
              const ytdPct = pct(row.ytdActual, row.ytdTarget);
              const isExpanded = expandedRows[key];
              const expandable = hasExpand && row.underCustomers?.length > 0;

              return (
                <React.Fragment key={key}>
                  <tr style={{ cursor: expandable ? 'pointer' : 'default' }} onClick={() => expandable && toggleRow(key)}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg1)', zIndex: 1, fontWeight: 600 }}>
                      {expandable && <span style={{ fontSize: 9, marginRight: 2 }}>{isExpanded ? '▼' : '▶'}</span>}
                      {key}
                    </td>
                    {months.map(m => {
                      const md = row.months[m] || { target: 0, actual: 0 };
                      const gap = md.actual - md.target;
                      const isOver = gap >= 0;
                      return (
                        <td key={m} style={{
                          textAlign: 'center',
                          background: md.target === 0 ? 'transparent' : isOver ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                          color: md.target === 0 ? 'var(--text3)' : isOver ? 'var(--green)' : 'var(--red)',
                          fontSize: 10,
                        }}>
                          {md.target === 0 ? '-' : (
                            <>
                              <span>{isOver ? '▲' : '▼'}</span>
                              <span style={{ display: 'block', fontSize: 9 }}>{fmtKRW(Math.abs(gap))}</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', fontWeight: 600, color: ytdGap >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtKRW(ytdGap)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`score-badge ${pctColor(ytdPct)}`}>{ytdPct}%</span>
                    </td>
                  </tr>
                  {/* 확장 행: 미달 고객 */}
                  {isExpanded && row.underCustomers?.map(c => (
                    <tr key={c.key} style={{ background: 'var(--bg2)', cursor: c.account ? 'pointer' : 'default' }}
                      onClick={(e) => { e.stopPropagation(); c.account && setEditingAccount(c.account); }}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1, paddingLeft: 20, fontSize: 10, color: 'var(--text2)' }}>
                        {c.customer_name}
                      </td>
                      {months.map(m => {
                        // 고객별 월간 데이터 계산
                        const mk = String(m).padStart(2, '0');
                        const plan = planLookup.byAccountId[c.account_id] || planLookup.byName[(c.customer_name || '').toLowerCase().trim()];
                        const target = plan?.targets?.[mk] || 0;
                        const actual = yearOrders
                          .filter(o => {
                            const oKey = (o.customer_name || '').toLowerCase().trim();
                            return (o.account_id === c.account_id || oKey === c.key) && parseInt((o.order_date || '').slice(5, 7)) === m;
                          })
                          .reduce((s, o) => s + (o.order_amount || 0), 0);
                        const gap = actual - target;
                        const isOver = gap >= 0;
                        return (
                          <td key={m} style={{
                            textAlign: 'center', fontSize: 9,
                            color: target === 0 ? 'var(--text3)' : isOver ? 'var(--green)' : 'var(--red)',
                          }}>
                            {target === 0 ? '-' : fmtKRW(Math.abs(gap))}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', fontSize: 10, color: c.gap >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fmtKRW(c.gap)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`score-badge ${pctColor(c.ytdPct)}`} style={{ fontSize: 9 }}>{c.ytdPct}%</span>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
