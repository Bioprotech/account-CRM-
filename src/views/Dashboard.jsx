import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { REGIONS, CUSTOMER_TYPE_GUIDE, STRATEGIC_TIERS } from '../lib/constants';
import { daysSince, scoreColorClass } from '../lib/utils';
import { classifyCustomers, classifyForRepView, loadPriorYearCustomers, syncPriorYearFromSettings } from '../lib/customerClassification';
import { getSortedValidReps } from '../lib/salesReps';

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
  const { visibleAccounts, activityLogs, openIssues, alarms, setEditingAccount, setCurrentTab, accounts, orders, businessPlans, forecasts, contracts, currentUser, isAdmin, saveAccount, showToast, appSettings, teamMembers } = useAccount();

  // 전년도 수주 Set + 유효 담당자 (신 분류 체계)
  const priorYearSet = useMemo(() => {
    if (appSettings?.priorYearCustomers && Array.isArray(appSettings.priorYearCustomers)) {
      return new Set(appSettings.priorYearCustomers);
    }
    return loadPriorYearCustomers();
  }, [appSettings]);
  const validReps = useMemo(
    () => getSortedValidReps({ businessPlans, teamMembers }),
    [businessPlans, teamMembers]
  );
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

  // 고객 분류 (기존/대학병원/해외기타/국내기타/신규)
  // Firestore settings에서 priorYearCustomers가 오면 우선 사용, 아니면 localStorage 캐시
  const priorYearCustomers = useMemo(() => {
    const fromFirestore = syncPriorYearFromSettings(appSettings);
    return fromFirestore || loadPriorYearCustomers();
  }, [appSettings]);
  const classification = useMemo(() => {
    if (!hasPlan && yearOrders.length === 0) return null;
    return classifyCustomers({
      accounts: myAccounts.length > 0 ? myAccounts : accounts,
      customerPlans,
      yearOrders,
      priorYearCustomers,
    });
  }, [accounts, myAccounts, customerPlans, yearOrders, priorYearCustomers, hasPlan]);

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

  // 전략등급별 분포
  const tierStats = useMemo(() => {
    const map = {};
    STRATEGIC_TIERS.forEach(t => { map[t.key] = { count: 0, accounts: [] }; });
    map['none'] = { count: 0, accounts: [] };
    myAccounts.forEach(a => {
      const tier = a.strategic_tier || 'none';
      if (!map[tier]) map[tier] = { count: 0, accounts: [] };
      map[tier].count++;
      map[tier].accounts.push(a);
    });
    return map;
  }, [myAccounts]);

  // D등급 고객 (Watch 알람)
  const watchAccounts = useMemo(() => {
    return myAccounts.filter(a => a.strategic_tier === 'D');
  }, [myAccounts]);

  // Insight 진척률 30% 미만 고객
  const lowInsightAccounts = useMemo(() => {
    return myAccounts.filter(a => {
      const score = a.intelligence?.total_score ?? 0;
      return score > 0 && score < 30;
    });
  }, [myAccounts]);

  // ── 계약상태 모니터링 (GREEN/YELLOW/RED) ──
  const contractStatusList = useMemo(() => {
    if (!hasPlan) return [];
    const planAccountIds = new Set(customerPlans.map(p => p.account_id).filter(Boolean));
    return myAccounts
      .filter(a => planAccountIds.has(a.id))
      .map(a => {
        const acctContracts = contracts.filter(c => c.account_id === a.id);
        const hasContract = acctContracts.some(c => c.contract_expiry || c.unit_price);
        const acctForecasts = forecasts.filter(f => f.account_id === a.id && f.year === CURRENT_YEAR);
        const hasFcst = acctForecasts.length > 0;
        // GREEN: 계약체결, YELLOW: 미체결이지만 FCST 협의, RED: 미체결+FCST없음
        let status = 'red';
        if (hasContract) status = 'green';
        else if (hasFcst) status = 'yellow';
        return { ...a, contractStatus: status, hasContract, hasFcst };
      });
  }, [myAccounts, contracts, forecasts, customerPlans, hasPlan]);

  // ── 목표미달 고객 경고 (연간 확정+FCST < 목표) ──
  const gapWarningAccounts = useMemo(() => {
    if (!hasPlan) return [];
    const result = [];
    customerPlans.forEach(p => {
      if (!p.account_id) return;
      const acc = myAccounts.find(a => a.id === p.account_id);
      if (!acc) return;
      const target = p.annual_target || 0;
      if (target <= 0) return;
      const actual = yearOrders.filter(o => o.account_id === p.account_id).reduce((s, o) => s + (o.order_amount || 0), 0);
      const fcst = forecasts.filter(f => f.account_id === p.account_id && f.year === CURRENT_YEAR).reduce((s, f) => s + (f.forecast_amount || 0), 0);
      const gap = target - actual - fcst;
      if (gap > 0) {
        result.push({ account: acc, target, actual, fcst, gap, pct: Math.round(((actual + fcst) / target) * 100) });
      }
    });
    result.sort((a, b) => b.gap - a.gap);
    return result;
  }, [customerPlans, yearOrders, forecasts, myAccounts, hasPlan]);

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

  // 담당자별 목표 vs 실적 — 신 분류 체계 (국내기타/해외기타/국내신규/해외신규 버킷 포함)
  const repStats = useMemo(() => {
    const map = {};
    const bucketNames = ['해외기타', '직판영업', '국내 신규', '국내 기타'];

    // 사업계획 담당자 + teamMembers 초기화
    validReps.forEach(r => { map[r] = { count: 0, target: 0, actual: 0, isBucket: false }; });
    // 버킷 4종 초기화
    ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => {
      map[k] = { count: 0, target: 0, actual: 0, isBucket: true, isNew: k.endsWith('신규') };
    });

    if (hasPlan) {
      customerPlans.forEach(p => {
        const name = (p.customer_name || '').trim();
        // 버킷 플랜 → 해당 버킷 target에 반영
        if (bucketNames.includes(name)) {
          let key = null;
          if (name === '해외기타') key = '해외기타';
          else if (name === '국내 기타') key = '국내기타';
          else if (name === '국내 신규') key = '국내신규';
          if (key && map[key]) map[key].target += (p.annual_target || 0);
          return;
        }
        const rep = p.sales_rep || '미배정';
        if (!map[rep]) map[rep] = { count: 0, target: 0, actual: 0, isBucket: false };
        map[rep].target += (p.annual_target || 0);
      });

      // 신 분류 체계로 실적 배분
      const planByName = {};
      customerPlans.forEach(p => {
        if (!p.customer_name) return;
        if (bucketNames.includes(p.customer_name.trim())) return;
        planByName[p.customer_name.toLowerCase().trim()] = p;
      });
      yearOrders.forEach(o => {
        const acc = o.account_id ? accounts.find(a => a.id === o.account_id)
          : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (o.customer_name || '').toLowerCase().trim()) || null;
        const { rep } = classifyForRepView({
          account: acc,
          customerName: o.customer_name || acc?.company_name,
          planByName,
          priorSet: priorYearSet,
        });
        if (!rep) return;
        if (!map[rep]) map[rep] = { count: 0, target: 0, actual: 0, isBucket: false };
        map[rep].actual += (o.order_amount || 0);
      });
    }

    // 배정 고객 수
    myAccounts.forEach(a => {
      const rep = a.sales_rep || '미배정';
      if (map[rep]) map[rep].count++;
    });

    return map;
  }, [myAccounts, customerPlans, yearOrders, hasPlan, planLookup, accounts, validReps, priorYearSet]);

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
          <div className="kpi-label">평균 Insight</div>
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

      {/* 매출 분류별 현황 */}
      {classification && hasPlan && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📊 사업계획 YTD 진도</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <div className="kpi accent" style={{ padding: 10 }}>
              <div className="kpi-label">연간 목표</div>
              <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(stats.annualTarget)}</div>
            </div>
            <div className="kpi" style={{ padding: 10 }}>
              <div className="kpi-label">YTD 목표</div>
              <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(stats.ytdTarget)}</div>
            </div>
            <div className={`kpi ${pctColor(pct(stats.ytdActual, stats.ytdTarget))}`} style={{ padding: 10 }}>
              <div className="kpi-label">YTD 실적 ({pct(stats.ytdActual, stats.ytdTarget)}%)</div>
              <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(stats.ytdActual)}</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th style={{ textAlign: 'right' }}>연간 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 실적</th>
                  <th style={{ textAlign: 'right' }}>달성률</th>
                  <th style={{ width: 100 }}>진도</th>
                </tr>
              </thead>
              <tbody>
                {/* 기존 고객 */}
                {(() => {
                  const target = classification.existing.target;
                  const actual = yearOrders
                    .filter(o => {
                      const name = (o.customer_name || '').toLowerCase().trim();
                      return classification.existing.plans.some(p => (p.customer_name || '').toLowerCase().trim() === name);
                    })
                    .filter(o => !classification.hospital.accountIds.has(o.account_id))
                    .reduce((s, o) => s + (o.order_amount || 0), 0);
                  const p = pct(actual, target);
                  return (
                    <tr>
                      <td style={{ fontWeight: 600 }}>기존 고객</td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(target)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(actual)}</td>
                      <td style={{ textAlign: 'right' }}><span className={`score-badge ${pctColor(p)}`}>{p}%</span></td>
                      <td><div className="score-gauge" style={{ height: 10 }}><div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} /></div></td>
                    </tr>
                  );
                })()}
                {/* 대학병원 */}
                {(() => {
                  const { target, actual } = classification.hospital;
                  const p = pct(actual, target);
                  return (
                    <tr style={{ background: 'rgba(46,125,50,.04)' }}>
                      <td style={{ fontWeight: 600 }}>
                        🏥 대학병원
                        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({classification.hospital.names.length}개)</span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(target)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(actual)}</td>
                      <td style={{ textAlign: 'right' }}>{target > 0 ? <span className={`score-badge ${pctColor(p)}`}>{p}%</span> : '-'}</td>
                      <td>{target > 0 && <div className="score-gauge" style={{ height: 10 }}><div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} /></div>}</td>
                    </tr>
                  );
                })()}
                {/* 해외기타 */}
                {(() => {
                  const target = classification.overseasEtc.target;
                  const actual = classification.overseasEtc.actual;
                  const p = pct(actual, target);
                  return (target > 0 || actual > 0) ? (
                    <tr>
                      <td style={{ fontWeight: 600 }}>
                        🌍 해외기타
                        {classification.overseasEtc.customers.length > 0 && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({classification.overseasEtc.customers.length}개사)</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(target)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(actual)}</td>
                      <td style={{ textAlign: 'right' }}>{target > 0 ? <span className={`score-badge ${pctColor(p)}`}>{p}%</span> : '-'}</td>
                      <td>{target > 0 && <div className="score-gauge" style={{ height: 10 }}><div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} /></div>}</td>
                    </tr>
                  ) : null;
                })()}
                {/* 국내기타 */}
                {(() => {
                  const target = classification.domesticEtc.target;
                  const actual = classification.domesticEtc.actual;
                  const p = pct(actual, target);
                  return (target > 0 || actual > 0) ? (
                    <tr>
                      <td style={{ fontWeight: 600 }}>
                        🏢 국내기타
                        {classification.domesticEtc.customers.length > 0 && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({classification.domesticEtc.customers.length}개사)</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(target)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(actual)}</td>
                      <td style={{ textAlign: 'right' }}>{target > 0 ? <span className={`score-badge ${pctColor(p)}`}>{p}%</span> : '-'}</td>
                      <td>{target > 0 && <div className="score-gauge" style={{ height: 10 }}><div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} /></div>}</td>
                    </tr>
                  ) : null;
                })()}
                {/* 신규 */}
                {(() => {
                  const target = classification.newCustomer.target;
                  const actual = classification.newCustomer.actual;
                  const p = pct(actual, target);
                  return (target > 0 || actual > 0) ? (
                    <tr style={{ background: 'rgba(33,150,243,.04)' }}>
                      <td style={{ fontWeight: 600 }}>
                        🆕 신규
                        {classification.newCustomer.customers.length > 0 && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>({classification.newCustomer.customers.length}개사)</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(target)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>{fmtKRW(actual)}</td>
                      <td style={{ textAlign: 'right' }}>{target > 0 ? <span className={`score-badge ${pctColor(p)}`}>{p}%</span> : <span style={{ fontSize: 10, color: 'var(--accent)' }}>신규매출</span>}</td>
                      <td>{target > 0 && <div className="score-gauge" style={{ height: 10 }}><div className={`score-gauge-fill ${pctColor(p)}`} style={{ width: `${Math.min(100, p)}%` }} /></div>}</td>
                    </tr>
                  ) : null;
                })()}
                {/* 합계 */}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td>합계</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(stats.annualTarget)}</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(stats.ytdActual)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`score-badge ${pctColor(pct(stats.ytdActual, stats.ytdTarget))}`}>{pct(stats.ytdActual, stats.ytdTarget)}%</span>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {/* 분류 상세 (접기) */}
          {(classification.overseasEtc.customers.length > 0 || classification.domesticEtc.customers.length > 0 || classification.newCustomer.customers.length > 0) && (
            <details style={{ marginTop: 8, fontSize: 11 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text3)' }}>계획 외/신규 고객 상세 보기</summary>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {classification.overseasEtc.customers.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>🌍 해외기타</div>
                    {classification.overseasEtc.customers.map((c, i) => {
                      const acc = c.accountId ? accounts.find(a => a.id === c.accountId) : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (c.name || '').toLowerCase().trim());
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: acc ? 'pointer' : 'default', borderRadius: 4 }}
                          onClick={() => acc && setEditingAccount(acc)}
                          onMouseOver={e => acc && (e.currentTarget.style.background = 'rgba(33,150,243,.08)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ color: acc ? 'var(--accent)' : undefined, textDecoration: acc ? 'underline' : undefined }}>{c.name}</span>
                          <span style={{ fontWeight: 600 }}>{fmtKRW(c.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {classification.domesticEtc.customers.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>🏢 국내기타</div>
                    {classification.domesticEtc.customers.map((c, i) => {
                      const acc = c.accountId ? accounts.find(a => a.id === c.accountId) : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (c.name || '').toLowerCase().trim());
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: acc ? 'pointer' : 'default', borderRadius: 4 }}
                          onClick={() => acc && setEditingAccount(acc)}
                          onMouseOver={e => acc && (e.currentTarget.style.background = 'rgba(33,150,243,.08)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ color: acc ? 'var(--accent)' : undefined, textDecoration: acc ? 'underline' : undefined }}>{c.name}</span>
                          <span style={{ fontWeight: 600 }}>{fmtKRW(c.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {classification.newCustomer.customers.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--accent)' }}>🆕 신규</div>
                    {classification.newCustomer.customers.map((c, i) => {
                      const acc = c.accountId ? accounts.find(a => a.id === c.accountId) : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (c.name || '').toLowerCase().trim());
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', cursor: acc ? 'pointer' : 'default', borderRadius: 4 }}
                          onClick={() => acc && setEditingAccount(acc)}
                          onMouseOver={e => acc && (e.currentTarget.style.background = 'rgba(33,150,243,.08)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ color: acc ? 'var(--accent)' : undefined, textDecoration: acc ? 'underline' : undefined }}>{c.name}</span>
                          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmtKRW(c.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

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

      {/* 전략등급별 분포 + D등급 Watch */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">🎯 전략 등급 분포</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 8 }}>
            {STRATEGIC_TIERS.map(t => (
              <div key={t.key} style={{
                textAlign: 'center', padding: '10px 4px', borderRadius: 8,
                background: `${t.color}0F`, border: `1px solid ${t.color}40`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{tierStats[t.key]?.count || 0}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: t.color }}>{t.key}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>{t.label}</div>
              </div>
            ))}
            <div style={{
              textAlign: 'center', padding: '10px 4px', borderRadius: 8,
              background: 'var(--bg3)', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text3)' }}>{tierStats['none']?.count || 0}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)' }}>-</div>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>미설정</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">⚠️ Watch 알람</div>
          {watchAccounts.length === 0 && lowInsightAccounts.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--green)' }}>Watch 대상 없음</p>
            </div>
          ) : (
            <div className="issue-list">
              {watchAccounts.slice(0, 6).map(a => {
                const score = a.intelligence?.total_score ?? 0;
                const health = a.customer_insight?.health;
                const supplier = a.customer_insight?.supplier;
                return (
                  <div key={a.id} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(a)}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#c62828', color: '#fff', fontWeight: 700 }}>D</span>
                    <span className="issue-company">{a.company_name}</span>
                    <span className="score-badge red" style={{ fontSize: 10 }}>{score}%</span>
                    {health?.revenue_trend === '축소' && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>📉축소</span>}
                    {supplier?.substitute_search === '탐색 중' && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>🔄대체재탐색</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{a.sales_rep}</span>
                  </div>
                );
              })}
              {lowInsightAccounts.filter(a => a.strategic_tier !== 'D').slice(0, 6).map(a => {
                const score = a.intelligence?.total_score ?? 0;
                return (
                  <div key={a.id} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(a)}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--yellow)', color: '#000', fontWeight: 700 }}>!</span>
                    <span className="issue-company">{a.company_name}</span>
                    <span className="score-badge red" style={{ fontSize: 10 }}>진척 {score}%</span>
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

      {/* 계약상태 모니터링 + 목표미달 경고 */}
      {hasPlan && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 계약상태 */}
          <div className="card">
            <div className="card-title">📋 계약 체결 현황</div>
            {contractStatusList.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}><p>사업계획 고객 없음</p></div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {['green', 'yellow', 'red'].map(s => {
                    const cnt = contractStatusList.filter(a => a.contractStatus === s).length;
                    const label = s === 'green' ? '계약체결' : s === 'yellow' ? 'FCST협의' : '미체결';
                    const color = s === 'green' ? 'var(--green)' : s === 'yellow' ? '#f59e0b' : 'var(--red)';
                    return (
                      <div key={s} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: `${color}12`, border: `1px solid ${color}40` }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color }}>{cnt}</div>
                        <div style={{ fontSize: 10, color }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="issue-list" style={{ maxHeight: 180 }}>
                  {contractStatusList
                    .filter(a => a.contractStatus !== 'green')
                    .sort((a, b) => (a.contractStatus === 'red' ? 0 : 1) - (b.contractStatus === 'red' ? 0 : 1))
                    .slice(0, 10)
                    .map(a => (
                      <div key={a.id} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(a)}>
                        <span style={{ fontSize: 10, width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                          background: a.contractStatus === 'red' ? 'var(--red)' : '#f59e0b' }} />
                        <span className="issue-company">{a.company_name}</span>
                        <span style={{ fontSize: 10, color: a.contractStatus === 'red' ? 'var(--red)' : '#f59e0b' }}>
                          {a.contractStatus === 'red' ? '미체결' : 'FCST 협의 중'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{a.sales_rep}</span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>

          {/* 목표미달 GAP 경고 */}
          <div className="card">
            <div className="card-title">⚠️ 목표 미달 고객 (확정+FCST &lt; 목표)</div>
            {gapWarningAccounts.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p style={{ color: 'var(--green)' }}>모든 고객이 목표 달성 궤도</p>
              </div>
            ) : (
              <div className="issue-list" style={{ maxHeight: 220 }}>
                {gapWarningAccounts.slice(0, 12).map(w => (
                  <div key={w.account.id} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(w.account)}>
                    <span className="issue-company">{w.account.company_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>GAP {fmtKRW(w.gap)}</span>
                    <span className={`score-badge ${w.pct >= 70 ? 'yellow' : 'red'}`} style={{ fontSize: 9 }}>{w.pct}%</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{w.account.sales_rep}</span>
                  </div>
                ))}
              </div>
            )}
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
