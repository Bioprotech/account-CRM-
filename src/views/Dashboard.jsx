import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { REGIONS, CUSTOMER_TYPE_GUIDE } from '../lib/constants';
import { daysSince, scoreColorClass } from '../lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}

function pct(actual, target) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}

function pctColor(p) {
  if (p >= 90) return 'green';
  if (p >= 70) return 'yellow';
  return 'red';
}

export default function Dashboard() {
  const { visibleAccounts, activityLogs, openIssues, alarms, setEditingAccount, setCurrentTab, accounts, orders, businessPlans, currentUser, isAdmin, saveAccount, showToast } = useAccount();
  const [syncing, setSyncing] = useState(false);

  // ── 담당자별 데이터 필터링 ──
  // 대시보드는 엄격 필터: sales_rep === currentUser인 고객만 (미배정 고객 제외)
  // 관리자/미로그인은 전체
  const myAccounts = useMemo(() => {
    if (isAdmin || !currentUser) return visibleAccounts;
    return accounts.filter(a => a.sales_rep === currentUser);
  }, [accounts, visibleAccounts, isAdmin, currentUser]);

  const myAccountIds = useMemo(() => {
    return new Set(myAccounts.map(a => a.id));
  }, [myAccounts]);

  const myActivityLogs = useMemo(() => {
    if (isAdmin || !currentUser) return activityLogs;
    return activityLogs.filter(l => myAccountIds.has(l.account_id));
  }, [activityLogs, myAccountIds, isAdmin, currentUser]);

  const myOpenIssues = useMemo(() => {
    if (isAdmin || !currentUser) return openIssues;
    return openIssues.filter(l => myAccountIds.has(l.account_id));
  }, [openIssues, myAccountIds, isAdmin, currentUser]);

  const myAlarms = useMemo(() => {
    if (isAdmin || !currentUser) return alarms;
    return alarms.filter(a => a.account && myAccountIds.has(a.account.id));
  }, [alarms, myAccountIds, isAdmin, currentUser]);

  const myOrders = useMemo(() => {
    if (isAdmin || !currentUser) return orders;
    return orders.filter(o => myAccountIds.has(o.account_id));
  }, [orders, myAccountIds, isAdmin, currentUser]);

  const myBusinessPlans = useMemo(() => {
    if (isAdmin || !currentUser) return businessPlans;
    return businessPlans.filter(p => p.sales_rep === currentUser || myAccountIds.has(p.account_id));
  }, [businessPlans, myAccountIds, isAdmin, currentUser]);

  const customerPlans = useMemo(() =>
    myBusinessPlans.filter(p => p.year === CURRENT_YEAR && p.type !== 'product'),
    [myBusinessPlans]
  );
  const yearOrders = useMemo(() =>
    myOrders.filter(o => (o.order_date || '').startsWith(String(CURRENT_YEAR))),
    [myOrders]
  );
  const hasPlan = customerPlans.length > 0;

  // customer_name → plan 매핑 (account_id가 없는 plans도 매칭하기 위함)
  const planLookup = useMemo(() => {
    const byAccountId = {};
    const byName = {};
    customerPlans.forEach(p => {
      if (p.account_id) byAccountId[p.account_id] = p;
      if (p.customer_name) byName[p.customer_name.toLowerCase().trim()] = p;
    });
    return { byAccountId, byName };
  }, [customerPlans]);

  // order → plan 찾기 (account_id 우선, 없으면 customer_name으로)
  const findPlanForOrder = (o) => {
    return planLookup.byAccountId[o.account_id]
      || planLookup.byName[(o.customer_name || '').toLowerCase().trim()]
      || null;
  };

  const stats = useMemo(() => {
    const total = myAccounts.length;
    const avgScore = total > 0
      ? Math.round(myAccounts.reduce((s, a) => s + (a.intelligence?.total_score ?? 0), 0) / total)
      : 0;

    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const monthActivities = myActivityLogs.filter(l => (l.date || '').startsWith(thisMonth)).length;
    const openCount = myOpenIssues.length;

    // YTD 실적
    const ytdActual = yearOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
    let ytdTarget = 0;
    let annualTarget = 0;
    customerPlans.forEach(p => {
      annualTarget += (p.annual_target || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });

    return { total, avgScore, monthActivities, openCount, ytdActual, ytdTarget, annualTarget };
  }, [myAccounts, myActivityLogs, myOpenIssues, yearOrders, customerPlans]);

  // 긴급 알람
  const urgentAccounts = useMemo(() => {
    return myAccounts.filter(a => {
      const score = a.intelligence?.total_score ?? 0;
      return score < 50 && daysSince(a.last_contact_date) > 30;
    });
  }, [myAccounts]);

  // 유형별 체크리스트 진행률
  const typeChecklistStats = useMemo(() => {
    const result = [];
    Object.entries(CUSTOMER_TYPE_GUIDE).forEach(([key, guide]) => {
      const typeAccounts = myAccounts.filter(a => a.business_type === key);
      if (typeAccounts.length === 0) return;
      const totalItems = guide.checklist.length;
      let completedSum = 0;
      typeAccounts.forEach(a => {
        const cl = a.type_checklist || {};
        completedSum += Object.values(cl).filter(Boolean).length;
      });
      const avgPct = Math.round((completedSum / (typeAccounts.length * totalItems)) * 100);
      result.push({
        type: key,
        label: guide.label,
        count: typeAccounts.length,
        avgPct,
        totalItems,
        completedSum,
      });
    });
    return result;
  }, [myAccounts]);

  // 지역별 목표 vs 실적
  const regionStats = useMemo(() => {
    const map = {};
    REGIONS.forEach(r => { map[r] = { count: 0, target: 0, actual: 0 }; });

    myAccounts.forEach(a => {
      if (a.region && map[a.region]) map[a.region].count++;
    });

    if (hasPlan) {
      customerPlans.forEach(p => {
        const region = p.region || '';
        if (!map[region]) map[region] = { count: 0, target: 0, actual: 0 };
        map[region].target += (p.annual_target || 0);
      });
      yearOrders.forEach(o => {
        // plan의 region 우선 사용 (order의 region보다 사업계획 기준이 정확)
        const plan = findPlanForOrder(o);
        const region = plan?.region || o.region || '';
        if (map[region]) map[region].actual += (o.order_amount || 0);
        else {
          const acc = accounts.find(a => a.id === o.account_id);
          const r = acc?.region || '';
          if (!map[r]) map[r] = { count: 0, target: 0, actual: 0 };
          if (map[r]) map[r].actual += (o.order_amount || 0);
        }
      });
    }

    return map;
  }, [myAccounts, customerPlans, yearOrders, hasPlan, accounts, planLookup]);

  // 담당자별 목표 vs 실적 — 관리자만 전체 표시, 일반 사용자는 본인만
  const repStats = useMemo(() => {
    const map = {};

    if (hasPlan) {
      customerPlans.forEach(p => {
        const rep = p.sales_rep || '미배정';
        if (!map[rep]) map[rep] = { count: 0, target: 0, actual: 0 };
        map[rep].target += (p.annual_target || 0);
      });
      yearOrders.forEach(o => {
        const plan = findPlanForOrder(o);
        const rep = plan?.sales_rep || '기타';
        if (!map[rep]) map[rep] = { count: 0, target: 0, actual: 0 };
        map[rep].actual += (o.order_amount || 0);
      });
    }

    myAccounts.forEach(a => {
      const rep = a.sales_rep || '미배정';
      if (map[rep]) map[rep].count++;
    });

    return map;
  }, [myAccounts, customerPlans, yearOrders, hasPlan, planLookup]);

  // 구분(사업형태)별 목표 vs 실적
  const bizTypeStats = useMemo(() => {
    if (!hasPlan) return {};
    const map = {};

    customerPlans.forEach(p => {
      const biz = p.biz_type || '기타';
      if (!map[biz]) map[biz] = { count: 0, target: 0, actual: 0 };
      map[biz].target += (p.annual_target || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = myAccounts.find(a => a.id === o.account_id) || accounts.find(a => a.id === o.account_id);
      const biz = plan?.biz_type || acc?.business_type || '기타';
      if (!map[biz]) map[biz] = { count: 0, target: 0, actual: 0 };
      map[biz].actual += (o.order_amount || 0);
    });

    // 고객 수
    myAccounts.forEach(a => {
      const biz = a.business_type || '기타';
      if (map[biz]) map[biz].count++;
    });

    return map;
  }, [customerPlans, yearOrders, hasPlan, myAccounts, accounts, planLookup]);

  // 품목별 목표 vs 실적
  const productPlans = useMemo(() =>
    myBusinessPlans.filter(p => p.year === CURRENT_YEAR && p.type === 'product'),
    [myBusinessPlans]
  );

  const productStats = useMemo(() => {
    if (productPlans.length === 0) return {};
    const map = {};

    productPlans.forEach(p => {
      const product = p.product || '기타';
      if (!map[product]) map[product] = { target: 0, actual: 0 };
      map[product].target += (p.annual_target || 0);
    });

    yearOrders.forEach(o => {
      const cat = (o.product_category || '').toLowerCase();
      if (!cat) return;
      // fuzzy match: order의 product_category가 plan의 product를 포함하거나 그 반대
      for (const [product, v] of Object.entries(map)) {
        const pLower = product.toLowerCase();
        if (cat.includes(pLower) || pLower.includes(cat)) {
          v.actual += (o.order_amount || 0);
          return;
        }
      }
    });

    return map;
  }, [productPlans, yearOrders]);

  // Open 이슈
  const recentOpenIssues = useMemo(() => {
    return myOpenIssues
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 10)
      .map(log => {
        const account = accounts.find(a => a.id === log.account_id);
        return { ...log, company_name: account?.company_name || '(알 수 없음)' };
      });
  }, [myOpenIssues, accounts]);

  const maxRegionTarget = Math.max(1, ...Object.values(regionStats).map(v => Math.max(v.target, v.actual, v.count)));
  const maxRepTarget = Math.max(1, ...Object.values(repStats).map(v => Math.max(v.target, v.actual)));

  // ── 담당자 동기화 필요 여부 감지 ──
  // account_id 또는 customer_name으로 매칭
  const syncInfo = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const plans = businessPlans.filter(p => p.year === currentYear && p.type !== 'product' && p.sales_rep);
    const repMap = {};

    plans.forEach(p => {
      // 1) account_id로 매칭
      if (p.account_id && !repMap[p.account_id]) {
        repMap[p.account_id] = p.sales_rep;
        return;
      }
      // 2) customer_name으로 매칭
      if (p.customer_name) {
        const name = p.customer_name.toLowerCase().trim();
        const acc = accounts.find(a => (a.company_name || '').toLowerCase().trim() === name);
        if (acc && !repMap[acc.id]) {
          repMap[acc.id] = p.sales_rep;
        }
      }
    });

    const needSync = accounts.filter(a => repMap[a.id] && a.sales_rep !== repMap[a.id]);
    return { repMap, needSync, total: Object.keys(repMap).length };
  }, [accounts, businessPlans]);

  const handleSync = async () => {
    if (!confirm(`${syncInfo.needSync.length}개 고객의 담당자를 사업계획 기준으로 업데이트합니다. 진행하시겠습니까?`)) return;
    setSyncing(true);
    try {
      for (const a of syncInfo.needSync) {
        await saveAccount({ ...a, sales_rep: syncInfo.repMap[a.id] });
      }
      showToast(`${syncInfo.needSync.length}개 고객 담당자 동기화 완료`, 'success');
    } catch (e) {
      showToast('동기화 실패: ' + e.message, 'error');
    }
    setSyncing(false);
  };

  return (
    <div>
      {/* 담당자 동기화 필요 알림 (관리자 전용) */}
      {isAdmin && syncInfo.needSync.length > 0 && (
        <div className="alert-banner" style={{ background: 'rgba(230,81,0,.06)', border: '1px solid rgba(230,81,0,.3)', marginBottom: 12 }}>
          <span>⚠️</span>
          <div style={{ flex: 1 }}>
            <strong>담당자 미배정 감지:</strong> 사업계획에 담당자가 설정된 고객 중 <strong style={{ color: 'var(--red)' }}>{syncInfo.needSync.length}개사</strong>의 고객카드에 담당자가 반영되지 않았습니다.
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              동기화하면 각 담당자 로그인 시 본인 고객만 대시보드에 표시됩니다.
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing} style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
            {syncing ? '동기화 중...' : `${syncInfo.needSync.length}개 동기화 실행`}
          </button>
        </div>
      )}

      {/* 담당자 표시 */}
      {currentUser && !isAdmin && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'rgba(46,125,50,.06)', borderRadius: 8, border: '1px solid rgba(46,125,50,.15)', fontSize: 12, color: 'var(--text2)' }}>
          👤 <strong>{currentUser}</strong>님의 대시보드 — 담당 고객 기준 데이터
        </div>
      )}

      {/* 긴급 알람 */}
      {urgentAccounts.length > 0 && (
        <div className="alert-banner danger">
          <span>🔴</span>
          <strong>긴급 알람:</strong> Score 50% 미만 + 미접촉 30일 초과 고객 {urgentAccounts.length}개사
          <span style={{ marginLeft: 'auto', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setCurrentTab('accounts')}>목록 보기 →</span>
        </div>
      )}

      {/* KPI Grid */}
      <div className="kpi-grid" style={{ gridTemplateColumns: hasPlan ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
        <div className="kpi accent">
          <div className="kpi-label">{isAdmin || !currentUser ? '전체 고객' : '내 고객'}</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className={`kpi ${stats.avgScore < 50 ? 'red' : stats.avgScore < 70 ? 'yellow' : 'green'}`}>
          <div className="kpi-label">평균 Score</div>
          <div className="kpi-value">{stats.avgScore}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">이번 달 활동</div>
          <div className="kpi-value">{stats.monthActivities}</div>
        </div>
        <div className={`kpi ${stats.openCount > 0 ? 'red' : ''}`}>
          <div className="kpi-label">Open 이슈</div>
          <div className="kpi-value">{stats.openCount}</div>
        </div>
        {hasPlan && (
          <div className={`kpi ${pctColor(pct(stats.ytdActual, stats.ytdTarget))}`}>
            <div className="kpi-label">YTD 달성률</div>
            <div className="kpi-value">{pct(stats.ytdActual, stats.ytdTarget)}%</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtKRW(stats.ytdActual)} / {fmtKRW(stats.ytdTarget)}</div>
          </div>
        )}
      </div>

      {/* Alarms */}
      {myAlarms.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">🔔 알람 ({myAlarms.length}건)</div>
          <div className="issue-list" style={{ maxHeight: 200 }}>
            {myAlarms.slice(0, 15).map((alarm, i) => (
              <div key={i} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(alarm.account)}>
                <span style={{ fontSize: 14, marginRight: 4 }}>{alarm.level === 'danger' ? '🔴' : alarm.level === 'info' ? '🔵' : '🟡'}</span>
                <span className="issue-company">{alarm.account?.company_name || '?'}</span>
                <span style={{ fontSize: 11, color: alarm.level === 'danger' ? 'var(--red)' : alarm.level === 'info' ? 'var(--accent)' : 'var(--yellow)' }}>{alarm.msg}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{alarm.account?.sales_rep}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open 이슈 + 긴급 고객 */}
      <div className="two-col">
        <div className="card">
          <div className="card-title">📋 Open 이슈 현황</div>
          {recentOpenIssues.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--green)' }}>진행 중인 이슈가 없습니다</p>
            </div>
          ) : (
            <div className="issue-list">
              {recentOpenIssues.map(log => (
                <div key={log.id} className="issue-row">
                  <span className="issue-company">{log.company_name}</span>
                  <span className={`issue-badge ${log.issue_type?.replace('·', '')}`}>{log.issue_type}</span>
                  <span className={`status-badge ${log.status === 'Open' ? 'open' : 'in-progress'}`}>{log.status}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{log.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">🔴 긴급 관리 대상</div>
          {urgentAccounts.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--green)' }}>긴급 대상 없음</p>
            </div>
          ) : (
            <div className="issue-list">
              {urgentAccounts.slice(0, 10).map(a => {
                const score = a.intelligence?.total_score ?? 0;
                const days = daysSince(a.last_contact_date);
                return (
                  <div key={a.id} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(a)}>
                    <span className="issue-company">{a.company_name || '(미입력)'}</span>
                    <span className="score-badge red">{score}%</span>
                    <span style={{ fontSize: 11, color: 'var(--red)' }}>{days === Infinity ? '미접촉' : `${days}일 경과`}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{a.sales_rep}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 유형별 체크리스트 진행률 */}
      {typeChecklistStats.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📋 고객유형별 관리 현황</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(typeChecklistStats.length, 6)}, 1fr)`, gap: 8 }}>
            {typeChecklistStats.map(ts => (
              <div key={ts.type} style={{
                padding: '10px 12px', borderRadius: 8,
                background: ts.avgPct >= 70 ? 'rgba(34,197,94,0.08)' : ts.avgPct >= 30 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${ts.avgPct >= 70 ? 'var(--green)' : ts.avgPct >= 30 ? 'var(--yellow)' : 'var(--red)'}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{ts.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>{ts.count}개사</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${ts.avgPct}%`, height: '100%', borderRadius: 3,
                      background: ts.avgPct >= 70 ? 'var(--green)' : ts.avgPct >= 30 ? 'var(--yellow)' : 'var(--red)',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ts.avgPct >= 70 ? 'var(--green)' : ts.avgPct >= 30 ? 'var(--yellow)' : 'var(--red)' }}>
                    {ts.avgPct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 지역별 + 담당자별 목표 vs 실적 */}
      <div className="two-col">
        <div className="card">
          <div className="card-title">🌍 지역별 {hasPlan ? '목표 vs 실적' : '분포'}</div>
          {hasPlan ? (
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>지역</th>
                    <th style={{ textAlign: 'right' }}>고객수</th>
                    <th style={{ textAlign: 'right' }}>연간 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 실적</th>
                    <th style={{ textAlign: 'right' }}>달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(regionStats)
                    .filter(([, v]) => v.target > 0 || v.actual > 0 || v.count > 0)
                    .sort((a, b) => b[1].target - a[1].target)
                    .map(([region, v]) => (
                      <tr key={region}>
                        <td style={{ fontWeight: 600 }}>{region}</td>
                        <td style={{ textAlign: 'right' }}>{v.count}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {v.target > 0 && <span className={`score-badge ${pctColor(pct(v.actual, v.target))}`}>{pct(v.actual, v.target)}%</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dist-chart">
              {Object.entries(regionStats).map(([region, v]) => (
                <div key={region} className="dist-row">
                  <span className="dist-label">{region}</span>
                  <div className="dist-bar-wrap">
                    <div className="dist-bar" style={{ width: `${(v.count / Math.max(1, ...Object.values(regionStats).map(x => x.count))) * 100}%` }} />
                  </div>
                  <span className="dist-count">{v.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">👤 담당자별 {hasPlan ? '목표 vs 실적' : '분포'}</div>
          {hasPlan ? (
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>담당자</th>
                    <th style={{ textAlign: 'right' }}>고객수</th>
                    <th style={{ textAlign: 'right' }}>연간 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 실적</th>
                    <th style={{ textAlign: 'right' }}>달성률</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(repStats)
                    .filter(([, v]) => v.target > 0 || v.actual > 0 || v.count > 0)
                    .sort((a, b) => b[1].target - a[1].target)
                    .map(([rep, v]) => (
                      <tr key={rep}>
                        <td style={{ fontWeight: 600 }}>{rep}</td>
                        <td style={{ textAlign: 'right' }}>{v.count}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {v.target > 0 && <span className={`score-badge ${pctColor(pct(v.actual, v.target))}`}>{pct(v.actual, v.target)}%</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dist-chart">
              {Object.entries(repStats).map(([rep, v]) => (
                <div key={rep} className="dist-row">
                  <span className="dist-label">{rep}</span>
                  <div className="dist-bar-wrap">
                    <div className="dist-bar" style={{ width: `${(v.count / Math.max(1, ...Object.values(repStats).map(x => x.count))) * 100}%`, background: 'var(--accent2)' }} />
                  </div>
                  <span className="dist-count">{v.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 구분(사업형태)별 현황 */}
      {hasPlan && Object.keys(bizTypeStats).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📊 사업구분별 목표 vs 실적</div>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th style={{ textAlign: 'right' }}>연간 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 실적</th>
                  <th style={{ textAlign: 'right' }}>달성률</th>
                  <th style={{ width: 120 }}>진도</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bizTypeStats)
                  .filter(([, v]) => v.target > 0)
                  .sort((a, b) => b[1].target - a[1].target)
                  .map(([biz, v]) => {
                    const p = pct(v.actual, v.target);
                    return (
                      <tr key={biz}>
                        <td style={{ fontWeight: 600 }}>{biz}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`score-badge ${pctColor(p)}`}>{p}%</span>
                        </td>
                        <td>
                          <div className="score-gauge" style={{ height: 10 }}>
                            <div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 품목별 목표 vs 실적 */}
      {productPlans.length > 0 && Object.keys(productStats).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📦 품목별 목표 vs 실적</div>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목</th>
                  <th style={{ textAlign: 'right' }}>연간 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 실적</th>
                  <th style={{ textAlign: 'right' }}>달성률</th>
                  <th style={{ width: 120 }}>진도</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(productStats)
                  .filter(([, v]) => v.target > 0)
                  .sort((a, b) => b[1].target - a[1].target)
                  .map(([product, v]) => {
                    const p = pct(v.actual, v.target);
                    return (
                      <tr key={product}>
                        <td style={{ fontWeight: 600 }}>{product}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`score-badge ${pctColor(p)}`}>{p}%</span>
                        </td>
                        <td>
                          <div className="score-gauge" style={{ height: 10 }}>
                            <div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
