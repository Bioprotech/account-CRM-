/**
 * v3.17 Phase A8 — 영업 담당자 활동 점수 산정 모듈
 *
 * 사양서: Account_CRM_점수체계_사양서_v1.0.docx
 * 적용 범위: 가점·감점 기준만 반영 (등급/처우 표는 CRM에 미반영)
 *
 * 총점: 100점
 *   - 영업 성과 60점 (당월 달성률 30 + YTD 진도 20 + 전월 대비 개선 10)
 *   - CRM 활동 품질 40점 (접촉 빈도 10 + 이슈 해결률 10 + 14일+ 미해결 10 + GAP 원인 입력 5 + A등급 30일 접촉 5)
 *   - 감점 -20점 max (주간 0건 / A등급 45일+ 미접촉 / GAP 미분류 / 허위 입력)
 *
 * 최저 0점 보장
 *
 * 사용:
 *   import { computeScore } from '../lib/scoring';
 *   const result = computeScore({ rep, accounts, activityLogs, orders, businessPlans, yearMonth });
 *   // result = { total: 87, performance: 52, quality: 35, deduction: 0, breakdown: {...} }
 */

/* ── 외부 사유 이슈 타입 (해결률 산정 시 해결로 간주) ── */
const EXTERNAL_REASON_ISSUE_TYPES = ['규제·인증', '입찰', '인증/규제', '입찰 대기'];

/* ── 점수 배점 (사양서 그대로) ── */
const POINTS = {
  PERFORMANCE: {
    MONTHLY_ACHIEVE: 30,    // 2-1
    YTD_PROGRESS: 20,       // 2-2
    MONTH_OVER_MONTH: 10,   // 2-3
  },
  QUALITY: {
    CONTACT_FREQ: 10,       // 3-1
    ISSUE_RESOLVE: 10,      // 3-2
    OVERDUE_14: 10,         // 3-3
    GAP_DETAIL: 5,          // 3-4
    A_TIER_CONTACT: 5,      // 3-5
  },
  DEDUCTION: {
    ZERO_WEEK_PER: 5,       // 4-1: 주간 0건 -5/회, max -10
    ZERO_WEEK_MAX: 10,
    A_TIER_45_PER: 5,       // 4-1: A등급 45일+ -5/사 (사 수 제한 없음)
    GAP_MISSING: 3,         // 4-1: GAP 원인 미분류 -3 (1회만)
    FALSE_INPUT: 10,        // 4-1: 허위 입력 의심 -10 (1회만)
    MAX_TOTAL: 20,
  },
};

/* ── 유틸 ── */
const daysSince = (dateStr) => {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};
const inMonth = (dateStr, yearMonth) => dateStr && dateStr.startsWith(yearMonth);
const ymToDateRange = (yearMonth) => {
  // yearMonth = "2026-05" → start: "2026-05-01", end: "2026-05-31"
  return { start: `${yearMonth}-01`, end: `${yearMonth}-31` };
};

/* ══════════════════════════════════════════════════════
   2-1. 당월 수주 달성률 (30점)
   ══════════════════════════════════════════════════════ */
function calcMonthlyAchievement({ rep, orders, businessPlans, yearMonth }) {
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const monthKey = yearMonth.slice(5, 7);

  // 담당 sales_rep의 사업계획 plan (당월 목표 합산)
  const repPlans = (businessPlans || []).filter(p =>
    (p.type === 'customer' || !p.type) &&
    p.year === year &&
    p.sales_rep === rep
  );
  const monthTarget = repPlans.reduce((s, p) => s + (p.targets?.[monthKey] || 0), 0);

  // 담당 plan의 account_id 목록 — 그 account의 당월 수주만 카운트
  const planAccountIds = new Set(repPlans.map(p => p.account_id).filter(Boolean));
  const monthActual = (orders || [])
    .filter(o => inMonth(o.order_date, yearMonth) && planAccountIds.has(o.account_id))
    .reduce((s, o) => s + (o.order_amount || 0), 0);

  const pct = monthTarget > 0 ? Math.round((monthActual / monthTarget) * 100) : 0;

  let score = 0;
  if (monthTarget <= 0) {
    score = 0;
  } else if (pct >= 100) score = 30;
  else if (pct >= 80) score = 18;
  else if (pct >= 60) score = 8;
  else score = 0;

  return { score, max: 30, pct, monthTarget, monthActual };
}

/* ══════════════════════════════════════════════════════
   2-2. YTD 진도 (20점)
   ══════════════════════════════════════════════════════ */
function calcYtdProgress({ rep, orders, businessPlans, yearMonth }) {
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const month = parseInt(yearMonth.slice(5, 7), 10);

  const repPlans = (businessPlans || []).filter(p =>
    (p.type === 'customer' || !p.type) &&
    p.year === year &&
    p.sales_rep === rep
  );

  let ytdTarget = 0;
  repPlans.forEach(p => {
    if (!p.targets) return;
    for (let m = 1; m <= month; m++) {
      ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
    }
  });

  const planAccountIds = new Set(repPlans.map(p => p.account_id).filter(Boolean));
  const ytdActual = (orders || []).reduce((s, o) => {
    if (!o.order_date || !o.order_date.startsWith(String(year))) return s;
    const mm = parseInt(o.order_date.slice(5, 7), 10);
    if (mm < 1 || mm > month) return s;
    if (!planAccountIds.has(o.account_id)) return s;
    return s + (o.order_amount || 0);
  }, 0);

  const pct = ytdTarget > 0 ? Math.round((ytdActual / ytdTarget) * 100) : 0;

  let score = 0;
  if (ytdTarget <= 0) {
    score = 0;
  } else if (pct >= 100) score = 20;
  else if (pct >= 80) score = 12;
  else if (pct >= 60) score = 6;
  else score = 0;

  return { score, max: 20, pct, ytdTarget, ytdActual };
}

/* ══════════════════════════════════════════════════════
   2-3. 전월 대비 달성률 개선 (10점)
   ══════════════════════════════════════════════════════ */
function calcMonthOverMonth({ rep, orders, businessPlans, yearMonth }) {
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevYM = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const curr = calcMonthlyAchievement({ rep, orders, businessPlans, yearMonth });
  const prev = calcMonthlyAchievement({ rep, orders, businessPlans, yearMonth: prevYM });

  const deltaPp = curr.pct - prev.pct;

  let score = 0;
  if (deltaPp >= 10) score = 10;
  else if (deltaPp >= 5) score = 5;
  else score = 0;

  return { score, max: 10, deltaPp, currPct: curr.pct, prevPct: prev.pct };
}

/* ══════════════════════════════════════════════════════
   3-1. 고객당 월 접촉 빈도 (10점)
   ══════════════════════════════════════════════════════ */
function calcContactFrequency({ rep, accounts, activityLogs, yearMonth }) {
  const repAccounts = (accounts || []).filter(a => a.sales_rep === rep);
  const accountCount = repAccounts.length;
  if (accountCount === 0) return { score: 0, max: 10, freq: 0, accountCount: 0, activityCount: 0, _note: '담당 고객 없음' };

  const activityCount = (activityLogs || [])
    .filter(l => inMonth(l.date, yearMonth) && l.sales_rep === rep)
    .length;

  const freq = activityCount / accountCount;

  let score = 0;
  if (freq >= 2.0) score = 10;
  else if (freq >= 1.5) score = 6;
  else if (freq >= 1.0) score = 3;
  else score = 0;

  return { score, max: 10, freq: Math.round(freq * 10) / 10, accountCount, activityCount };
}

/* ══════════════════════════════════════════════════════
   3-2. 이슈 해결률 (10점)
   ══════════════════════════════════════════════════════ */
function calcIssueResolveRate({ rep, activityLogs, yearMonth }) {
  // 당월 중 Open된 전체 건 (date가 당월) — 모든 이슈
  const monthOpened = (activityLogs || []).filter(l =>
    inMonth(l.date, yearMonth) && l.sales_rep === rep
  );
  if (monthOpened.length === 0) return { score: 10, max: 10, rate: null, _note: '당월 Open 건 0건 → 만점' };

  // Closed 또는 외부 사유 태깅된 건 = 해결 간주
  const resolved = monthOpened.filter(l =>
    l.status === 'Closed' ||
    EXTERNAL_REASON_ISSUE_TYPES.includes(l.issue_type)
  );
  const rate = Math.round((resolved.length / monthOpened.length) * 100);

  let score = 0;
  if (rate >= 80) score = 10;
  else if (rate >= 60) score = 6;
  else if (rate >= 40) score = 2;
  else score = 0;

  return { score, max: 10, rate, openedCount: monthOpened.length, resolvedCount: resolved.length };
}

/* ══════════════════════════════════════════════════════
   3-3. 14일+ 미해결 이슈 건수 (10점)
   ══════════════════════════════════════════════════════ */
function calcOverdue14({ rep, activityLogs, yearMonth }) {
  // 당월 말일 기준 Open 상태이며 14일 이상 경과 + 외부 사유 태깅 제외
  // (yearMonth가 과거인 경우 정확한 cutoff 계산 — 당월 말일 기준)
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const eom = new Date(year, month, 0); // 당월 말일

  const overdue = (activityLogs || []).filter(l => {
    if (l.sales_rep !== rep) return false;
    if (l.status === 'Closed') return false;
    if (EXTERNAL_REASON_ISSUE_TYPES.includes(l.issue_type)) return false;
    if (!l.date) return false;
    const opened = new Date(l.date);
    if (isNaN(opened.getTime()) || opened > eom) return false;
    const days = Math.floor((eom - opened) / 86400000);
    return days >= 14;
  });

  const count = overdue.length;
  let score = 0;
  if (count === 0) score = 10;
  else if (count <= 2) score = 6;
  else if (count <= 4) score = 2;
  else score = 0;

  return { score, max: 10, count };
}

/* ══════════════════════════════════════════════════════
   3-4. GAP 원인 입력 성실도 (5점)
   미달 고객 (담당 기준) 중 cause_detail이 1줄 이상 입력된 비율
   ══════════════════════════════════════════════════════ */
function calcGapDetailFill({ rep, accounts, orders, businessPlans, yearMonth }) {
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const month = parseInt(yearMonth.slice(5, 7), 10);

  const repPlans = (businessPlans || []).filter(p =>
    (p.type === 'customer' || !p.type) &&
    p.year === year &&
    p.sales_rep === rep &&
    p.account_id
  );

  // 미달 고객만 (YTD 기준)
  const shortfallAccounts = [];
  repPlans.forEach(p => {
    let ytdTarget = 0;
    if (p.targets) {
      for (let m = 1; m <= month; m++) {
        ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
      }
    }
    if (ytdTarget <= 0) return;
    const ytdActual = (orders || []).reduce((s, o) => {
      if (o.account_id !== p.account_id) return s;
      if (!o.order_date || !o.order_date.startsWith(String(year))) return s;
      const mm = parseInt(o.order_date.slice(5, 7), 10);
      if (mm < 1 || mm > month) return s;
      return s + (o.order_amount || 0);
    }, 0);
    if (ytdActual < ytdTarget) {
      const acc = (accounts || []).find(a => a.id === p.account_id);
      shortfallAccounts.push({ id: p.account_id, name: acc?.company_name || p.customer_name, account: acc });
    }
  });

  if (shortfallAccounts.length === 0) {
    return { score: 5, max: 5, fillRate: null, shortfallCount: 0, _note: '미달 고객 없음 → 만점' };
  }

  // cause_detail 입력된 고객 카운트 (account.gap.cause_detail 1자 이상)
  const filled = shortfallAccounts.filter(s => {
    const detail = (s.account?.gap?.cause_detail || '').trim();
    const causes = s.account?.gap?.causes || [];
    return causes.length > 0 && detail.length > 0;
  });
  const fillRate = Math.round((filled.length / shortfallAccounts.length) * 100);

  let score = 0;
  if (fillRate >= 100) score = 5;
  else if (fillRate >= 50) score = 2;
  else score = 0;

  return { score, max: 5, fillRate, shortfallCount: shortfallAccounts.length, filledCount: filled.length };
}

/* ══════════════════════════════════════════════════════
   3-5. 전략 A등급 고객 30일 내 접촉 (5점)
   ══════════════════════════════════════════════════════ */
function calcATierContact({ rep, accounts, activityLogs, yearMonth }) {
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const eom = new Date(year, month, 0);
  const cutoff30 = new Date(eom); cutoff30.setDate(eom.getDate() - 30);
  const cutoff30Str = cutoff30.toISOString().slice(0, 10);
  const eomStr = eom.toISOString().slice(0, 10);

  const repAccounts = (accounts || []).filter(a =>
    a.sales_rep === rep &&
    (a.strategic_tier === 'A' || a.customer_grade === 'A')
  );
  if (repAccounts.length === 0) return { score: 5, max: 5, missCount: 0, _note: 'A등급 고객 없음 → 만점' };

  // 각 A등급 고객 — 30일 내 활동 1건 이상 있는지
  let missCount = 0;
  const missList = [];
  repAccounts.forEach(a => {
    const hasContact = (activityLogs || []).some(l =>
      l.account_id === a.id &&
      l.date >= cutoff30Str &&
      l.date <= eomStr
    );
    if (!hasContact) {
      missCount++;
      missList.push(a.company_name);
    }
  });

  let score = 0;
  if (missCount === 0) score = 5;
  else if (missCount === 1) score = 3;
  else score = 0;

  return { score, max: 5, missCount, missList, totalATier: repAccounts.length };
}

/* ══════════════════════════════════════════════════════
   4-1. 주간 활동 0건 감점 (-5/회, max -10)
   ══════════════════════════════════════════════════════ */
function calcZeroWeekDeduction({ rep, activityLogs, yearMonth }) {
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // 각 주 (월요일 기준) 활동 카운트
  // 월 내의 주 = first/lastDay 사이의 모든 월요일
  const weeks = [];
  let cursor = new Date(firstDay);
  // 첫 월요일까지 이동
  while (cursor.getDay() !== 1 && cursor <= lastDay) {
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cursor <= lastDay) {
    const weekStart = cursor.toISOString().slice(0, 10);
    const we = new Date(cursor); we.setDate(we.getDate() + 6);
    const weekEnd = we.toISOString().slice(0, 10);
    const count = (activityLogs || []).filter(l =>
      l.sales_rep === rep &&
      l.date >= weekStart &&
      l.date <= weekEnd
    ).length;
    // 출장/전시회 태그 예외 (issue_type 또는 content에 키워드)
    const hasException = (activityLogs || []).some(l =>
      l.sales_rep === rep &&
      l.date >= weekStart &&
      l.date <= weekEnd &&
      (
        l.issue_type === '출장' ||
        l.issue_type === '전시회' ||
        (l.content || '').includes('출장') ||
        (l.content || '').includes('전시회')
      )
    );
    weeks.push({ weekStart, weekEnd, count, isZero: count === 0 && !hasException });
    cursor.setDate(cursor.getDate() + 7);
  }

  const zeroWeeks = weeks.filter(w => w.isZero).length;
  const deduction = Math.min(zeroWeeks * 5, 10);
  return { deduction, zeroWeeks, weeksAnalyzed: weeks.length };
}

/* ══════════════════════════════════════════════════════
   4-1. A등급 고객 45일+ 미접촉 감점 (-5/사, 무제한)
   ══════════════════════════════════════════════════════ */
function calcATier45Deduction({ rep, accounts, activityLogs, yearMonth }) {
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const eom = new Date(year, month, 0);
  const cutoff45 = new Date(eom); cutoff45.setDate(eom.getDate() - 45);
  const cutoff45Str = cutoff45.toISOString().slice(0, 10);
  const eomStr = eom.toISOString().slice(0, 10);

  const repATier = (accounts || []).filter(a =>
    a.sales_rep === rep &&
    (a.strategic_tier === 'A' || a.customer_grade === 'A')
  );

  let missCount = 0;
  const missList = [];
  repATier.forEach(a => {
    const hasContact = (activityLogs || []).some(l =>
      l.account_id === a.id &&
      l.date >= cutoff45Str &&
      l.date <= eomStr
    );
    if (!hasContact) {
      missCount++;
      missList.push(a.company_name);
    }
  });

  const deduction = missCount * 5;
  return { deduction, missCount, missList };
}

/* ══════════════════════════════════════════════════════
   4-1. GAP 원인 미분류 감점 (-3, 1회만)
   미달 고객 중 cause_detail 공란이 1사 이상이면 -3
   ══════════════════════════════════════════════════════ */
function calcGapMissingDeduction({ rep, accounts, orders, businessPlans, yearMonth }) {
  const detail = calcGapDetailFill({ rep, accounts, orders, businessPlans, yearMonth });
  if (detail.shortfallCount > 0 && detail.fillRate < 100) {
    return { deduction: 3, applied: true };
  }
  return { deduction: 0, applied: false };
}

/* ══════════════════════════════════════════════════════
   4-1. 허위 입력 의심 감점 (-10, 1회만)
   동일 담당자의 동일 날짜 Activity 3건 이상 + content 유사도 90%+
   (간단 구현: 동일 날짜 + 같은 첫 30자 substring 3건 이상)
   ══════════════════════════════════════════════════════ */
function calcFalseInputDeduction({ rep, activityLogs, yearMonth }) {
  const monthLogs = (activityLogs || []).filter(l =>
    inMonth(l.date, yearMonth) && l.sales_rep === rep
  );
  // 날짜별 그룹화
  const byDate = {};
  monthLogs.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });
  // 같은 날에 3건 이상 + content 처음 30자 동일한 게 3건 이상이면 의심
  let suspicious = false;
  for (const [date, logs] of Object.entries(byDate)) {
    if (logs.length < 3) continue;
    const prefixCounts = {};
    logs.forEach(l => {
      const prefix = (l.content || '').trim().slice(0, 30);
      if (!prefix) return;
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });
    if (Object.values(prefixCounts).some(c => c >= 3)) {
      suspicious = true;
      break;
    }
  }
  return { deduction: suspicious ? 10 : 0, applied: suspicious };
}

/* ══════════════════════════════════════════════════════
   메인: 한 담당자의 한 달 점수 산정
   ══════════════════════════════════════════════════════ */
export function computeScore({ rep, accounts, activityLogs, orders, businessPlans, yearMonth }) {
  if (!rep || !yearMonth) {
    return { total: 0, performance: 0, quality: 0, deduction: 0, breakdown: {}, _error: 'rep / yearMonth required' };
  }

  // 영업 성과 (60점)
  const monthly = calcMonthlyAchievement({ rep, orders, businessPlans, yearMonth });
  const ytd = calcYtdProgress({ rep, orders, businessPlans, yearMonth });
  const mom = calcMonthOverMonth({ rep, orders, businessPlans, yearMonth });
  const performance = monthly.score + ytd.score + mom.score;

  // CRM 활동 품질 (40점)
  const contact = calcContactFrequency({ rep, accounts, activityLogs, yearMonth });
  const resolve = calcIssueResolveRate({ rep, activityLogs, yearMonth });
  const overdue = calcOverdue14({ rep, activityLogs, yearMonth });
  const gapDetail = calcGapDetailFill({ rep, accounts, orders, businessPlans, yearMonth });
  const aTier = calcATierContact({ rep, accounts, activityLogs, yearMonth });
  const quality = contact.score + resolve.score + overdue.score + gapDetail.score + aTier.score;

  // 감점 (-20점 max)
  const zeroWeek = calcZeroWeekDeduction({ rep, activityLogs, yearMonth });
  const aTier45 = calcATier45Deduction({ rep, accounts, activityLogs, yearMonth });
  const gapMissing = calcGapMissingDeduction({ rep, accounts, orders, businessPlans, yearMonth });
  const falseInput = calcFalseInputDeduction({ rep, activityLogs, yearMonth });
  const deductionRaw = zeroWeek.deduction + aTier45.deduction + gapMissing.deduction + falseInput.deduction;
  const deduction = Math.min(deductionRaw, POINTS.DEDUCTION.MAX_TOTAL);

  const total = Math.max(0, performance + quality - deduction);

  return {
    total,
    performance,
    quality,
    deduction,
    breakdown: {
      monthly, ytd, mom,
      contact, resolve, overdue, gapDetail, aTier,
      zeroWeek, aTier45, gapMissing, falseInput,
    },
  };
}

/* ══════════════════════════════════════════════════════
   여러 담당자 일괄 점수 산정
   ══════════════════════════════════════════════════════ */
export function computeAllScores({ reps, accounts, activityLogs, orders, businessPlans, yearMonth }) {
  const results = {};
  (reps || []).forEach(rep => {
    results[rep] = computeScore({ rep, accounts, activityLogs, orders, businessPlans, yearMonth });
  });
  return results;
}

export { POINTS };
