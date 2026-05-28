/**
 * Bio Protech CRM — 보고서 인사이트 보강 (v3.34)
 *
 * 명세서 (CRM_보완_개발_명세_v1.md) 기반 헬퍼:
 *   1. Loss Reason 입력률 / 카테고리 분포 / 회복가능성 분포
 *   2. 활동 → 수주 outcome 매트릭스
 *   3. Forecast Accuracy (담당자별)
 *   4. Customer Health Score (간이판 — 결제 제외 80점 만점)
 */

import { filterValidOrders } from './aggregation';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

/* ══════════════════════════════════════════════════════════════════
   ① Loss Reason 입력률 분석
   - 미달(YTD 달성률 < 80%) 고객 중 cause + recoverability + (경쟁이탈 시) competitor 모두 입력된 비율
   ══════════════════════════════════════════════════════════════════ */
export function analyzeLossReasons(accounts, businessPlans, ordersAll, year = CURRENT_YEAR) {
  const orders = filterValidOrders(ordersAll);
  const yearOrders = orders.filter(o => (o.order_date || '').startsWith(String(year)));
  const customerPlans = (businessPlans || []).filter(p =>
    p.year === year && (p.type === 'customer' || !p.type)
  );

  // 각 account의 YTD 달성률 계산
  const month = new Date().getMonth() + 1;
  const underTargetAccounts = [];

  (accounts || []).forEach(a => {
    if (a?.customer_category === 'inactive') return;
    const name = (a.company_name || '').toLowerCase().trim();
    const plans = customerPlans.filter(p =>
      p.account_id === a.id || (p.customer_name || '').toLowerCase().trim() === name
    );
    if (plans.length === 0) return;

    let ytdTarget = 0;
    for (let m = 1; m <= month; m++) {
      const mk = String(m).padStart(2, '0');
      ytdTarget += plans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
    }
    if (ytdTarget === 0) return;

    const ytdActual = yearOrders
      .filter(o => o.account_id === a.id || (o.customer_name || '').toLowerCase().trim() === name)
      .reduce((s, o) => s + (o.order_amount || 0), 0);

    const achieveRate = ytdActual / ytdTarget;
    if (achieveRate >= 0.80) return; // 80% 이상은 입력 의무 아님

    const gap = a.gap_analysis || {};
    const hasCauses = (gap.causes || []).length > 0;
    const hasDetail = !!(gap.cause_detail || '').trim();
    const hasRecov = !!gap.recoverability;
    const isCompetition = (gap.causes || []).includes('competition');
    const hasCompetitor = !isCompetition || !!(gap.competitor_name || '').trim();

    const fullyFilled = hasCauses && hasDetail && hasRecov && hasCompetitor;

    underTargetAccounts.push({
      account: a,
      ytdTarget,
      ytdActual,
      achieveRate,
      ytdGap: ytdActual - ytdTarget,
      causes: gap.causes || [],
      cause_detail: gap.cause_detail || '',
      recoverability: gap.recoverability || '',
      competitor_name: gap.competitor_name || '',
      fullyFilled,
    });
  });

  const totalUnder = underTargetAccounts.length;
  const filled = underTargetAccounts.filter(x => x.fullyFilled).length;
  const inputRate = totalUnder > 0 ? Math.round((filled / totalUnder) * 100) : 100;

  // 카테고리 분포 (입력된 것만)
  const byCategory = {};
  // 회복가능성 분포
  const byRecov = { HIGH: 0, MEDIUM: 0, LOW: 0, '': 0 };
  // 경쟁사 분포 (COMPETITION 인 경우만)
  const byCompetitor = {};

  underTargetAccounts.forEach(x => {
    x.causes.forEach(c => {
      byCategory[c] = (byCategory[c] || 0) + 1;
    });
    byRecov[x.recoverability || ''] = (byRecov[x.recoverability || ''] || 0) + 1;
    if (x.causes.includes('competition') && x.competitor_name) {
      byCompetitor[x.competitor_name] = (byCompetitor[x.competitor_name] || 0) + 1;
    }
  });

  return {
    totalUnder,
    filled,
    inputRate,
    underTargetAccounts: underTargetAccounts.sort((a, b) => a.achieveRate - b.achieveRate),
    byCategory,
    byRecov,
    byCompetitor,
  };
}

/* ══════════════════════════════════════════════════════════════════
   ⑥ 활동 → 수주 outcome 매트릭스
   - 활동 유형 × outcome 분포
   ══════════════════════════════════════════════════════════════════ */
export function analyzeActivityOutcomes(activityLogs, yearMonth = null) {
  const logs = (activityLogs || []).filter(l => {
    if (!l.outcome) return false;
    if (yearMonth && !(l.date || '').startsWith(yearMonth)) return false;
    return true;
  });

  // 활동 유형(issue_type) × outcome 매트릭스
  const matrix = {};
  const totalByType = {};
  const wonByType = {};

  logs.forEach(l => {
    const type = l.issue_type || '기타';
    const outcome = l.outcome;
    if (!matrix[type]) matrix[type] = { NO_CHANGE: 0, NEW_LEAD: 0, QUALIFIED: 0, PROPOSAL_SENT: 0, WON: 0, LOST: 0 };
    matrix[type][outcome] = (matrix[type][outcome] || 0) + 1;
    totalByType[type] = (totalByType[type] || 0) + 1;
    if (outcome === 'WON') wonByType[type] = (wonByType[type] || 0) + 1;
  });

  // 활동 유형별 ROI (WON / 전체)
  const roiByType = {};
  Object.keys(totalByType).forEach(type => {
    const total = totalByType[type];
    const won = wonByType[type] || 0;
    roiByType[type] = {
      total,
      won,
      roi: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  });

  // 담당자별 ROI (각 담당자 활동 → WON 비율)
  const byRep = {};
  logs.forEach(l => {
    const rep = l.sales_rep || '미배정';
    if (!byRep[rep]) byRep[rep] = { total: 0, won: 0, lost: 0 };
    byRep[rep].total++;
    if (l.outcome === 'WON') byRep[rep].won++;
    if (l.outcome === 'LOST') byRep[rep].lost++;
  });
  Object.values(byRep).forEach(r => {
    r.roi = r.total > 0 ? Math.round((r.won / r.total) * 100) : 0;
  });

  return {
    totalTagged: logs.length,
    matrix,
    roiByType,
    byRep,
  };
}

/* ══════════════════════════════════════════════════════════════════
   ② Forecast Accuracy (담당자별)
   - 과거 N개월의 FCST vs 실제 수주 비교
   ══════════════════════════════════════════════════════════════════ */
export function analyzeForecastAccuracy(forecasts, ordersAll, accounts, monthsBack = 6) {
  const orders = filterValidOrders(ordersAll);
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  const cutoffStr = cutoff.toISOString().slice(0, 7);
  const currentMonth = today.toISOString().slice(0, 7);

  // 평가 대상: 예측월이 cutoff 이후이면서 현재 월 이전 (=이미 결과가 나온 것)
  const evaluable = (forecasts || []).filter(f => {
    const fm = f.order_month?.length === 7 ? f.order_month : null;
    if (!fm) return false;
    return fm >= cutoffStr && fm < currentMonth;
  });

  const accountLookup = new Map();
  (accounts || []).forEach(a => accountLookup.set(a.id, a));

  // 각 forecast에 대해 실적 매칭
  const recordsByRep = {};
  evaluable.forEach(f => {
    const acc = accountLookup.get(f.account_id);
    if (!acc) return;
    const rep = acc.sales_rep;
    if (!rep) return;

    // 같은 월, 같은 account의 실제 수주 합계
    const actualSum = orders
      .filter(o =>
        o.account_id === f.account_id &&
        (o.order_date || '').startsWith(f.order_month)
      )
      .reduce((s, o) => s + (o.order_amount || 0), 0);

    const forecastAmt = f.forecast_amount || f.amount || 0;
    if (forecastAmt === 0) return;

    const accuracy = actualSum / forecastAmt;

    if (!recordsByRep[rep]) recordsByRep[rep] = [];
    recordsByRep[rep].push({
      forecast: forecastAmt,
      actual: actualSum,
      accuracy,
      month: f.order_month,
    });
  });

  // 담당자별 평균 정확도
  const repAccuracy = {};
  Object.entries(recordsByRep).forEach(([rep, records]) => {
    if (records.length === 0) return;
    // 정확도 = min(actual/forecast, 1) — 초과 달성도 100%로 cap
    const cappedAccuracies = records.map(r => Math.min(r.accuracy, 1));
    const avgAccuracy = cappedAccuracies.reduce((a, b) => a + b, 0) / cappedAccuracies.length;
    repAccuracy[rep] = {
      rep,
      count: records.length,
      avgAccuracy: Math.round(avgAccuracy * 100),  // 0-100%
      totalForecast: records.reduce((s, r) => s + r.forecast, 0),
      totalActual: records.reduce((s, r) => s + r.actual, 0),
    };
  });

  return {
    totalEvaluable: evaluable.length,
    repAccuracy,
  };
}

/* ══════════════════════════════════════════════════════════════════
   ⑦ Customer Health Score (간이판 — 80점 만점)
   - 결제 정보 부재로 결제20점 제외
   - 수주 빈도 30점 + 응답 속도 20점 + 클레임율 15점 + FCST 정확도 15점 = 80점
   ══════════════════════════════════════════════════════════════════ */
export function calculateHealthScore(account, ordersAll, activityLogs, forecasts) {
  if (!account) return null;
  const orders = filterValidOrders(ordersAll);
  const accId = account.id;
  const accName = (account.company_name || '').toLowerCase().trim();

  // ── 1. 수주 빈도 (30점) ──
  // 최근 12개월 수주 건수 기준
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);
  const recentOrders = orders.filter(o =>
    (o.account_id === accId || (o.customer_name || '').toLowerCase().trim() === accName) &&
    (o.order_date || '') >= oneYearAgo
  );
  // 6개월 이상 무주문 → 0점, 매월 주문 → 30점
  const lastOrderDate = recentOrders.map(o => o.order_date).sort().pop();
  let orderFreqScore = 0;
  if (lastOrderDate) {
    const daysSinceLast = Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86400000);
    if (daysSinceLast <= 30) orderFreqScore = 30;
    else if (daysSinceLast <= 60) orderFreqScore = 25;
    else if (daysSinceLast <= 90) orderFreqScore = 20;
    else if (daysSinceLast <= 180) orderFreqScore = 10;
    else orderFreqScore = 0;
  }

  // ── 2. 응답 속도 (20점) ──
  // 최근 컨택 후 next_action_date 지킴 비율
  const acctLogs = (activityLogs || []).filter(l => l.account_id === accId);
  const daysSinceContact = account.last_contact_date
    ? Math.floor((Date.now() - new Date(account.last_contact_date).getTime()) / 86400000)
    : 999;
  let responseScore = 0;
  if (daysSinceContact <= 14) responseScore = 20;
  else if (daysSinceContact <= 30) responseScore = 15;
  else if (daysSinceContact <= 60) responseScore = 10;
  else if (daysSinceContact <= 90) responseScore = 5;
  else responseScore = 0;

  // ── 3. 클레임율 (15점) ──
  // 최근 12개월 품질클레임 비율
  const totalRecentLogs = acctLogs.filter(l => (l.date || '') >= oneYearAgo).length;
  const claims = acctLogs.filter(l =>
    l.issue_type === '품질클레임' && (l.date || '') >= oneYearAgo
  ).length;
  const claimRate = totalRecentLogs > 0 ? claims / totalRecentLogs : 0;
  let claimScore = 15;
  if (claimRate >= 0.30) claimScore = 0;
  else if (claimRate >= 0.20) claimScore = 5;
  else if (claimRate >= 0.10) claimScore = 10;

  // ── 4. FCST 정확도 (15점) ──
  // 이 account의 과거 FCST 정확도 평균
  const acctFcsts = (forecasts || []).filter(f => f.account_id === accId);
  let fcstScore = 15;  // 기본 (FCST 데이터 없으면 만점 가정)
  if (acctFcsts.length > 0) {
    const accuracies = acctFcsts.map(f => {
      const actualSum = orders
        .filter(o => o.account_id === accId && (o.order_date || '').startsWith(f.order_month))
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const forecastAmt = f.forecast_amount || f.amount || 0;
      return forecastAmt > 0 ? Math.min(actualSum / forecastAmt, 1) : null;
    }).filter(x => x !== null);
    if (accuracies.length > 0) {
      const avgAcc = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
      fcstScore = Math.round(avgAcc * 15);
    }
  }

  const total = orderFreqScore + responseScore + claimScore + fcstScore;
  // 80점 만점 기준 (결제20 제외)
  const normalizedScore = Math.round((total / 80) * 100);  // 100점 환산

  let grade = 'A';
  if (normalizedScore < 40) grade = 'D';
  else if (normalizedScore < 60) grade = 'C';
  else if (normalizedScore < 80) grade = 'B';

  const alerts = [];
  if (orderFreqScore < 15) alerts.push('주문 빈도 급감 — 90일+ 무주문');
  if (responseScore < 10) alerts.push('미접촉 60일+ — 관계 약화 위험');
  if (claimScore < 8) alerts.push('클레임 증가 — 품질 이슈 확인 필요');

  return {
    total,
    maxTotal: 80,
    normalizedScore,
    grade,
    factors: { orderFreqScore, responseScore, claimScore, fcstScore },
    alerts,
    lastOrderDate,
    daysSinceContact,
  };
}

/* 일괄 — 모든 active accounts의 Health Score */
export function aggregateHealthScores(accounts, ordersAll, activityLogs, forecasts) {
  const results = (accounts || [])
    .filter(a => a?.customer_category !== 'inactive')
    .map(a => ({
      account: a,
      health: calculateHealthScore(a, ordersAll, activityLogs, forecasts),
    }))
    .filter(x => x.health !== null);

  const dist = { A: 0, B: 0, C: 0, D: 0 };
  results.forEach(x => { dist[x.health.grade]++; });

  const atRisk = results
    .filter(x => x.health.grade === 'C' || x.health.grade === 'D')
    .sort((a, b) => a.health.normalizedScore - b.health.normalizedScore);

  return { results, dist, atRisk };
}
