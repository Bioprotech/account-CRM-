/* ══════════════════════════════════════════════════════════════════
   v3.18 — 단일 집계 함수 (Single Source of Truth)
   ──────────────────────────────────────────────────────────────────
   모든 화면(Report, Dashboard, Progress, OrderReport, MyTasks)이
   이 모듈의 함수만 호출하도록 강제. 한 곳을 수정하면 모든 화면에
   일관되게 적용되며, source whitelist도 한 곳에만 정의.

   원칙:
   1. SOURCE_WHITELIST에 명시된 source만 보고서 집계에 사용
   2. 외부에서 합계를 직접 계산하지 않고, 본 모듈 함수 호출
   3. 본 모듈 변경 시 영향 받는 화면을 즉시 파악 가능
   ══════════════════════════════════════════════════════════════════ */

// ── 허용 source 화이트리스트 (단일 정의) ──
export const VALID_ORDER_SOURCES = new Set([
  'excel_import_promes_O',      // ProMES 수주 (현재 정답)
  'excel_import_영업현황',       // 옛 영업현황 수주 (legacy 과도기)
]);

export const VALID_SALES_SOURCES = new Set([
  'excel_import_promes_S',      // ProMES 매출 (현재 정답)
  'excel_import_영업현황_S',     // 옛 영업현황 매출 (legacy 과도기)
]);

// ── 표시용 source 라벨 ──
export const SOURCE_LABELS = {
  excel_import_promes_O: 'ProMES (수주)',
  excel_import_promes_S: 'ProMES (매출)',
  excel_import_영업현황: '영업현황 (수주, legacy)',
  excel_import_영업현황_S: '영업현황 (매출, legacy)',
  manual: '수동 입력 (집계 제외)',
};

// ──────────────────────────────────────────
// 1. Filter: 보고서에 사용 가능한 orders/sales
// ──────────────────────────────────────────
export function filterValidOrders(ordersAll) {
  return (ordersAll || []).filter(o => VALID_ORDER_SOURCES.has(o.source || ''));
}

export function filterValidSales(salesAll) {
  return (salesAll || []).filter(s => VALID_SALES_SOURCES.has(s.source || ''));
}

// ──────────────────────────────────────────
// 2. Source 분포 분석 (진단용)
// ──────────────────────────────────────────
export function analyzeOrdersSourceDistribution(ordersAll, { year, monthsSet } = {}) {
  const yearStr = year ? String(year) : null;
  const cnt = { promes: 0, legacy: 0, manual: 0, other: 0 };
  const amt = { promes: 0, legacy: 0, manual: 0, other: 0 };
  let lastImport = '';
  (ordersAll || []).forEach(o => {
    if (yearStr && !(o.order_date || '').startsWith(yearStr + '-')) return;
    if (monthsSet && !monthsSet.has((o.order_date || '').slice(5, 7))) return;
    const src = o.source || '';
    const a = o.order_amount || 0;
    let bucket;
    if (src === 'excel_import_promes_O') bucket = 'promes';
    else if (src === 'excel_import_영업현황') bucket = 'legacy';
    else if (!src) bucket = 'manual';
    else bucket = 'other';
    cnt[bucket]++;
    amt[bucket] += a;
    if (bucket === 'promes' && o.import_date && o.import_date > lastImport) {
      lastImport = o.import_date;
    }
  });
  const validAmount = amt.promes + amt.legacy;
  const ignoredAmount = amt.manual + amt.other;
  return {
    counts: cnt,
    amounts: amt,
    validCount: cnt.promes + cnt.legacy,
    validAmount,
    ignoredCount: cnt.manual + cnt.other,
    ignoredAmount,
    lastImport,
    isClean: cnt.manual === 0 && cnt.other === 0,
  };
}

export function analyzeSalesSourceDistribution(salesAll, { year, monthsSet } = {}) {
  const yearStr = year ? String(year) : null;
  const cnt = { promes: 0, legacy: 0, manual: 0, other: 0 };
  const amt = { promes: 0, legacy: 0, manual: 0, other: 0 };
  let lastImport = '';
  (salesAll || []).forEach(s => {
    if (yearStr && !(s.sale_date || '').startsWith(yearStr + '-')) return;
    if (monthsSet && !monthsSet.has((s.sale_date || '').slice(5, 7))) return;
    const src = s.source || '';
    const a = s.sale_amount || 0;
    let bucket;
    if (src === 'excel_import_promes_S') bucket = 'promes';
    else if (src === 'excel_import_영업현황_S') bucket = 'legacy';
    else if (!src) bucket = 'manual';
    else bucket = 'other';
    cnt[bucket]++;
    amt[bucket] += a;
    if (bucket === 'promes' && s.import_date && s.import_date > lastImport) {
      lastImport = s.import_date;
    }
  });
  return {
    counts: cnt,
    amounts: amt,
    validCount: cnt.promes + cnt.legacy,
    validAmount: amt.promes + amt.legacy,
    ignoredCount: cnt.manual + cnt.other,
    ignoredAmount: amt.manual + amt.other,
    lastImport,
    isClean: cnt.manual === 0 && cnt.other === 0,
  };
}

// ──────────────────────────────────────────
// 3. 기간별 합계 (보고서 화면 공용)
// ──────────────────────────────────────────
export function sumOrderAmountByPeriod(orders, { yearMonth, year } = {}) {
  return (orders || []).reduce((s, o) => {
    const d = o.order_date || '';
    if (yearMonth && !d.startsWith(yearMonth)) return s;
    if (year && !d.startsWith(String(year) + '-')) return s;
    return s + (o.order_amount || 0);
  }, 0);
}

export function sumSalesAmountByPeriod(sales, { yearMonth, year } = {}) {
  return (sales || []).reduce((s, x) => {
    const d = x.sale_date || '';
    if (yearMonth && !d.startsWith(yearMonth)) return s;
    if (year && !d.startsWith(String(year) + '-')) return s;
    return s + (x.sale_amount || 0);
  }, 0);
}

// ──────────────────────────────────────────
// 4. 사업계획 합계 (고정값)
// ──────────────────────────────────────────
export function sumPlanTargetsByPeriod(customerPlans, { year, monthsArr }) {
  const yearNum = Number(year);
  return (customerPlans || []).reduce((s, p) => {
    if (p.year !== yearNum) return s;
    monthsArr.forEach(m => {
      s += p.targets?.[m] || 0;
    });
    return s;
  }, 0);
}

// ──────────────────────────────────────────
// 5. 데이터 무결성 자동 검증 (Regression Detection)
// ──────────────────────────────────────────
/**
 * 데이터 무결성 종합 검증.
 * @returns {Array<{level: 'ok'|'warn'|'error', message: string, detail?: string}>}
 */
export function validateDataIntegrity({ ordersAll, salesAll, businessPlans, importAuditLogs, year }) {
  const yearStr = String(year || new Date().getFullYear());
  const issues = [];

  // Check 1: 수주 source 분포
  const oDist = analyzeOrdersSourceDistribution(ordersAll, { year: yearStr });
  if (oDist.ignoredCount > 0) {
    issues.push({
      level: 'error',
      key: 'orders_ignored_present',
      message: `🚫 수주에 manual/기타 source ${oDist.ignoredCount}건 (${fmt(oDist.ignoredAmount)}) 존재`,
      detail: `Settings → "🗑 수동 입력 수주 데이터 정리" 카드로 일괄 삭제 가능. 보고서 집계에서는 이미 자동 제외됨.`,
    });
  } else {
    issues.push({
      level: 'ok',
      key: 'orders_clean',
      message: `✅ 수주 source 분포 정상 (ProMES ${oDist.counts.promes}건 + 영업현황 ${oDist.counts.legacy}건)`,
    });
  }

  // Check 2: 매출 source 분포
  const sDist = analyzeSalesSourceDistribution(salesAll, { year: yearStr });
  if (sDist.ignoredCount > 0) {
    issues.push({
      level: 'error',
      key: 'sales_ignored_present',
      message: `🚫 매출에 manual/기타 source ${sDist.ignoredCount}건 (${fmt(sDist.ignoredAmount)}) 존재`,
      detail: `보고서 집계에서는 이미 자동 제외됨.`,
    });
  } else {
    issues.push({
      level: 'ok',
      key: 'sales_clean',
      message: `✅ 매출 source 분포 정상 (ProMES ${sDist.counts.promes}건 + 영업현황 ${sDist.counts.legacy}건)`,
    });
  }

  // Check 3: ProMES + 영업현황 잔여 동시 존재
  if (oDist.counts.promes > 0 && oDist.counts.legacy > 0) {
    issues.push({
      level: 'warn',
      key: 'order_dual_sources',
      message: `⚠ 수주: ProMES + 영업현황 잔여 동시 존재 (이중 집계 위험)`,
      detail: `Settings → "🗑 기존 영업현황 Import 데이터 정리" 카드 사용 권장.`,
    });
  }
  if (sDist.counts.promes > 0 && sDist.counts.legacy > 0) {
    issues.push({
      level: 'warn',
      key: 'sales_dual_sources',
      message: `⚠ 매출: ProMES + 영업현황 잔여 동시 존재 (이중 집계 위험)`,
      detail: `Settings → "🗑 기존 영업현황 Import 데이터 정리" 카드 사용 권장.`,
    });
  }

  // Check 4: ImportAudit 합계 vs DB 합계 비교
  if (Array.isArray(importAuditLogs) && importAuditLogs.length > 0) {
    // 가장 최근의 import audit log
    const latestOrders = [...importAuditLogs]
      .filter(l => l.type === 'orders' && l.year === yearStr)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
    if (latestOrders) {
      const dbTotal = sumOrderAmountByPeriod(filterValidOrders(ordersAll), { year: yearStr });
      const diff = Math.abs(dbTotal - (latestOrders.total_amount || 0));
      const pct = latestOrders.total_amount > 0
        ? (diff / latestOrders.total_amount) * 100
        : 0;
      if (pct > 0.5) {
        issues.push({
          level: 'error',
          key: 'order_import_db_mismatch',
          message: `🚫 수주 Import 합계 ↔ DB 합계 불일치 (${pct.toFixed(2)}% 차이)`,
          detail: `Import(${latestOrders.created_at?.slice(0, 16)}): ${fmt(latestOrders.total_amount)} / DB 현재: ${fmt(dbTotal)} → ${fmt(diff)} 차이`,
        });
      } else {
        issues.push({
          level: 'ok',
          key: 'order_import_db_match',
          message: `✅ 수주 Import 합계 = DB 합계 일치 (${fmt(dbTotal)})`,
          detail: `Last import: ${latestOrders.created_at?.slice(0, 16)}`,
        });
      }
    }
    const latestSales = [...importAuditLogs]
      .filter(l => l.type === 'sales' && l.year === yearStr)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
    if (latestSales) {
      const dbTotal = sumSalesAmountByPeriod(filterValidSales(salesAll), { year: yearStr });
      const diff = Math.abs(dbTotal - (latestSales.total_amount || 0));
      const pct = latestSales.total_amount > 0
        ? (diff / latestSales.total_amount) * 100
        : 0;
      if (pct > 0.5) {
        issues.push({
          level: 'error',
          key: 'sales_import_db_mismatch',
          message: `🚫 매출 Import 합계 ↔ DB 합계 불일치 (${pct.toFixed(2)}% 차이)`,
          detail: `Import(${latestSales.created_at?.slice(0, 16)}): ${fmt(latestSales.total_amount)} / DB 현재: ${fmt(dbTotal)} → ${fmt(diff)} 차이`,
        });
      } else {
        issues.push({
          level: 'ok',
          key: 'sales_import_db_match',
          message: `✅ 매출 Import 합계 = DB 합계 일치 (${fmt(dbTotal)})`,
          detail: `Last import: ${latestSales.created_at?.slice(0, 16)}`,
        });
      }
    }
  } else {
    issues.push({
      level: 'warn',
      key: 'no_audit_log',
      message: `ℹ️ Import Audit Log 없음`,
      detail: `다음 ProMES Import부터 자동 기록되어 검증 가능해집니다.`,
    });
  }

  return issues;
}

function fmt(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString();
}
