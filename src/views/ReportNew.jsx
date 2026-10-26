/**
 * ReportNew.jsx — v3.53 M8: 월간 보고서 자동 조립 엔진
 * 10개 섹션을 M1~M7 데이터로 자동 생성. 서술 필드 공란 시 '⚠️ 담당자 미작성' 표시.
 */
import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { classifyForRepView } from '../lib/customerClassification';
import { filterValidOrders, filterValidSales } from '../lib/aggregation';
import { getValidSalesReps } from '../lib/salesReps';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YM = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, '0')}`;

function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}

function pct(actual, target) {
  if (!target) return null;
  return Math.round((actual / target) * 100);
}

const UNWRITTEN = '⚠️ 담당자 미작성';

/* ── 섹션 컨테이너 ── */
function Section({ num, title, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: collapsed ? 0 : 12 }}
        onClick={() => setCollapsed(p => !p)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#fff' }}>
            {num}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && children}
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span style={{ fontWeight: highlight ? 700 : 400, color: highlight ? 'var(--accent)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

function UnwrittenBadge() {
  return (
    <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,.08)', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px' }}>
      {UNWRITTEN}
    </div>
  );
}

export default function ReportNew() {
  const {
    accounts, activityLogs, orders: ordersAll, sales: salesAll,
    businessPlans, forecasts, contracts, teamTasks,
    gapReasons, csTargets, appSettings, teamMembers, t,
  } = useAccount();

  const [reportMonth, setReportMonth] = useState(CURRENT_YM);

  const year = parseInt(reportMonth.slice(0, 4));
  const month = parseInt(reportMonth.slice(5, 7));
  const mk = String(month).padStart(2, '0');

  const orders = useMemo(() => filterValidOrders(ordersAll), [ordersAll]);
  const sales = useMemo(() => filterValidSales(salesAll), [salesAll]);

  /* ── 1. 이달 수주 현황 ── */
  const monthOrders = useMemo(() =>
    orders.filter(o => o.order_date?.startsWith(`${year}-${mk}`)),
    [orders, year, mk]
  );
  const monthOrderAmt = monthOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

  const monthPlans = useMemo(() =>
    businessPlans.filter(p => p.year === year && (p.type === 'customer' || !p.type)),
    [businessPlans, year]
  );
  const monthTarget = monthPlans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
  const orderRate = pct(monthOrderAmt, monthTarget);

  /* ── 2. 이달 매출 현황 ── */
  const monthSales = useMemo(() =>
    sales.filter(s => s.sale_date?.startsWith(`${year}-${mk}`)),
    [sales, year, mk]
  );
  const monthSalesAmt = monthSales.reduce((s, sv) => s + (sv.sale_amount || 0), 0);

  const salesPlans = useMemo(() =>
    businessPlans.filter(p => p.year === year && p.type === 'team_sales'),
    [businessPlans, year]
  );
  const salesTarget = salesPlans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
  const salesRate = pct(monthSalesAmt, salesTarget);

  /* ── 3. 팀별 수주 현황 ── */
  const TEAMS = ['해외영업', '영업지원', '국내영업'];
  const teamOrderData = useMemo(() => {
    return TEAMS.map(team => {
      const plans = businessPlans.filter(p => p.year === year && p.type === 'customer' && p.team === team);
      const target = plans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
      const actual = monthOrders
        .filter(o => plans.some(p => p.account_id === o.account_id || (p.customer_name || '').toLowerCase() === (o.customer_name || '').toLowerCase()))
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      return { team, target, actual, rate: pct(actual, target) };
    });
  }, [businessPlans, monthOrders, year, mk]);

  /* ── 4. 담당자별 수주 현황 ── */
  const validReps = useMemo(() => getValidSalesReps(businessPlans, teamMembers, year), [businessPlans, teamMembers, year]);
  const repData = useMemo(() => {
    return validReps.map(rep => {
      const plans = businessPlans.filter(p => p.year === year && p.sales_rep === rep && (p.type === 'customer' || !p.type));
      const target = plans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
      const actual = monthOrders
        .filter(o => {
          const classified = classifyForRepView(o, businessPlans, year, teamMembers);
          return classified === rep;
        })
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      return { rep, target, actual, rate: pct(actual, target) };
    }).filter(r => r.target > 0 || r.actual > 0);
  }, [validReps, businessPlans, monthOrders, year, mk, teamMembers]);

  /* ── 5. 미달 고객 현황 (M5 gap_reasons) ── */
  const gapForMonth = useMemo(() =>
    gapReasons.filter(r => r.year === year && r.month === month),
    [gapReasons, year, month]
  );

  const gapAccounts = useMemo(() => {
    return accounts.filter(a => {
      const plan = monthPlans.find(p => p.account_id === a.id || (p.customer_name || '').toLowerCase() === (a.company_name || '').toLowerCase());
      if (!plan) return false;
      const target = plan.targets?.[mk] || 0;
      if (target === 0) return false;
      const actual = monthOrders.filter(o => o.account_id === a.id || (o.customer_name || '').toLowerCase() === (a.company_name || '').toLowerCase())
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      return actual < target;
    }).slice(0, 15);
  }, [accounts, monthPlans, monthOrders, mk]);

  /* ── 6. 지역/업종별 집계 ── */
  const regionData = useMemo(() => {
    const REGIONS = ['N.America', 'Latin America', 'Europe', 'Asia', 'Middle East', 'Africa', 'CIS', '국내'];
    return REGIONS.map(reg => {
      const regAccounts = accounts.filter(a => a.region === reg);
      const actual = monthOrders.filter(o => regAccounts.some(a => a.id === o.account_id)).reduce((s, o) => s + (o.order_amount || 0), 0);
      return { region: reg, actual };
    }).filter(r => r.actual > 0).sort((a, b) => b.actual - a.actual);
  }, [accounts, monthOrders]);

  /* ── 7. Cross-Selling 현황 (M7) ── */
  const csItems = useMemo(() => {
    const result = [];
    accounts.forEach(a => {
      (a.cross_selling || []).forEach(cs => {
        result.push({ ...cs, account_name: a.company_name, sales_rep: a.sales_rep });
      });
    });
    return result;
  }, [accounts]);
  const csActive = csItems.filter(x => x.status !== '중단' && x.status !== '수주완료');
  const csDone = csItems.filter(x => x.status === '수주완료');

  /* ── 8. 다음달 FCST ── */
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nmk = String(nextMonth).padStart(2, '0');
  const nextMonthForecasts = useMemo(() =>
    forecasts.filter(f => f.year === nextYear && f.month === nextMonth),
    [forecasts, nextYear, nextMonth]
  );
  const nextFcstTotal = nextMonthForecasts.reduce((s, f) => s + (f.amount || 0), 0);
  const nextTarget = monthPlans.reduce((s, p) => s + (p.targets?.[nmk] || 0), 0);

  /* ── 9. 이달 TASK 현황 ── */
  const monthTasks = useMemo(() =>
    teamTasks.filter(t => t.year_month === reportMonth),
    [teamTasks, reportMonth]
  );
  const doneTasks = monthTasks.filter(t => t.status === '완료');
  const pendTasks = monthTasks.filter(t => t.status !== '완료');

  /* ── 10. 경영진 요약 (appSettings) ── */
  const execSummary = appSettings?.[`exec_summary_${reportMonth}`] || '';
  const nextPlan = appSettings?.[`next_month_plan_${reportMonth}`] || '';

  /* ── 월 선택 옵션 ── */
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(CURRENT_YEAR, CURRENT_MONTH - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ value: ym, label: ym });
    }
    return opts;
  }, []);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>📋 신규 월간 보고서</h2>
        <select
          value={reportMonth}
          onChange={e => setReportMonth(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>보고 기준월</span>
      </div>

      {/* ── Section 1: 이달 수주 현황 ── */}
      <Section num="1" title="이달 수주 현황">
        <Row label="수주 목표" value={fmtKRW(monthTarget)} />
        <Row label="수주 실적" value={fmtKRW(monthOrderAmt)} highlight />
        <Row label="달성률" value={orderRate !== null ? `${orderRate}%` : '-'} highlight />
        <Row label="건수" value={`${monthOrders.length}건`} />
        {monthOrders.length === 0 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>해당 월 수주 데이터 없음</div>}
      </Section>

      {/* ── Section 2: 이달 매출 현황 ── */}
      <Section num="2" title="이달 매출 현황">
        <Row label="매출 목표" value={fmtKRW(salesTarget)} />
        <Row label="매출 실적" value={fmtKRW(monthSalesAmt)} highlight />
        <Row label="달성률" value={salesRate !== null ? `${salesRate}%` : '-'} highlight />
        <Row label="건수" value={`${monthSales.length}건`} />
      </Section>

      {/* ── Section 3: 팀별 수주 현황 ── */}
      <Section num="3" title="팀별 수주 현황">
        {teamOrderData.map(({ team, target, actual, rate }) => (
          <Row
            key={team}
            label={team}
            value={`${fmtKRW(actual)} / 목표 ${fmtKRW(target)} (${rate !== null ? rate + '%' : '-'})`}
            highlight={rate !== null && rate >= 100}
          />
        ))}
      </Section>

      {/* ── Section 4: 담당자별 수주 현황 ── */}
      <Section num="4" title="담당자별 수주 현황">
        {repData.length > 0 ? repData.map(({ rep, target, actual, rate }) => (
          <Row
            key={rep}
            label={rep}
            value={`${fmtKRW(actual)} / 목표 ${fmtKRW(target)} (${rate !== null ? rate + '%' : '-'})`}
            highlight={rate !== null && rate >= 100}
          />
        )) : <div style={{ fontSize: 12, color: 'var(--text3)' }}>사업계획 데이터 없음</div>}
      </Section>

      {/* ── Section 5: 미달 고객 & 원인 분석 (M5) ── */}
      <Section num="5" title="미달 고객 & 원인 분석">
        {gapAccounts.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>미달 고객 없음 (또는 사업계획 미등록)</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {['고객명', '목표', '실적', '달성률', '기록된 원인'].map(h => (
                    <th key={h} style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gapAccounts.map(a => {
                  const plan = monthPlans.find(p => p.account_id === a.id || (p.customer_name || '').toLowerCase() === (a.company_name || '').toLowerCase());
                  const target = plan?.targets?.[mk] || 0;
                  const actual = monthOrders.filter(o => o.account_id === a.id).reduce((s, o) => s + (o.order_amount || 0), 0);
                  const r = pct(actual, target);
                  const reason = gapForMonth.find(g => g.account_id === a.id);
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px' }}>{a.company_name}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtKRW(target)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#ef4444' }}>{fmtKRW(actual)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#ef4444' }}>{r !== null ? `${r}%` : '-'}</td>
                      <td style={{ padding: '5px 8px', color: reason ? 'var(--text)' : '#f59e0b' }}>
                        {reason ? `${reason.reason}: ${reason.detail}` : UNWRITTEN}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 6: 지역별 수주 현황 ── */}
      <Section num="6" title="지역별 수주 현황">
        {regionData.length > 0 ? regionData.map(({ region, actual }) => (
          <Row key={region} label={region} value={fmtKRW(actual)} />
        )) : <div style={{ fontSize: 12, color: 'var(--text3)' }}>데이터 없음</div>}
      </Section>

      {/* ── Section 7: Cross-Selling 현황 (M7) ── */}
      <Section num="7" title="Cross-Selling 현황">
        <Row label="전체 CS 건" value={`${csItems.length}건`} />
        <Row label="진행 중" value={`${csActive.length}건`} />
        <Row label="수주 완료" value={`${csDone.length}건`} highlight />
        {csItems.length === 0 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>등록된 Cross-Selling 없음</div>}
        {csActive.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>주요 진행 건</div>
            {csActive.slice(0, 5).map((x, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                <span>{x.account_name} — {x.target_product || '제품미지정'}</span>
                <span style={{ color: 'var(--text3)' }}>{x.status} · {fmtKRW(Number(x.potential_amount) || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 8: 다음달 FCST ── */}
      <Section num="8" title={`다음달 수주 예측 (${nextYear}-${String(nextMonth).padStart(2, '0')})`}>
        <Row label="다음달 목표" value={fmtKRW(nextTarget)} />
        <Row label="FCST 합계" value={fmtKRW(nextFcstTotal)} highlight />
        <Row label="FCST 달성 예상" value={nextTarget > 0 ? `${pct(nextFcstTotal, nextTarget)}%` : '-'} />
        <Row label="FCST 건수" value={`${nextMonthForecasts.length}건`} />
      </Section>

      {/* ── Section 9: 이달 TASK 현황 ── */}
      <Section num="9" title="이달 TASK 현황">
        <Row label="전체 TASK" value={`${monthTasks.length}건`} />
        <Row label="완료" value={`${doneTasks.length}건`} highlight />
        <Row label="미완료" value={`${pendTasks.length}건`} />
        {pendTasks.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>미완료 TASK</div>
            {pendTasks.slice(0, 8).map((task, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                <span>{task.title || task.task_title || task.content || '-'}</span>
                <span style={{ color: 'var(--text3)' }}>{task.status} · {task.team || ''}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 10: 경영진 코멘트 ── */}
      <Section num="10" title="경영진 총평 & 다음달 계획">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text2)' }}>이달 총평</div>
          {execSummary ? (
            <div style={{ fontSize: 12, lineHeight: 1.7, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
              {execSummary}
            </div>
          ) : <UnwrittenBadge />}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text2)' }}>다음달 주요 계획</div>
          {nextPlan ? (
            <div style={{ fontSize: 12, lineHeight: 1.7, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
              {nextPlan}
            </div>
          ) : <UnwrittenBadge />}
        </div>
      </Section>
    </div>
  );
}
