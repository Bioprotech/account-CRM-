import { useState, useMemo, useCallback } from 'react';
import { useAccount } from '../context/AccountContext';
import { filterValidOrders } from '../lib/aggregation';
import { PRODUCTS } from '../lib/constants';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const ALL_PRODUCTS = ['전체', ...PRODUCTS];

function fmtM(n) {
  if (!n || n === 0) return '-';
  return (n / 1_000_000).toFixed(1) + 'M';
}

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function pct(a, b) {
  if (!b) return null;
  return ((a - b) / b) * 100;
}

function growthStyle(val) {
  if (val === null) return {};
  if (val > 10) return { color: 'var(--green)', fontWeight: 600 };
  if (val < -10) return { color: 'var(--red)', fontWeight: 600 };
  return { color: 'var(--text2)' };
}

function achieveStyle(rate) {
  if (rate === null) return {};
  if (rate >= 100) return { color: 'var(--green)', fontWeight: 600 };
  if (rate >= 80) return { color: 'var(--yellow)', fontWeight: 600 };
  return { color: 'var(--red)' };
}

function getCategory(account) {
  const cat = account?.customer_category || '';
  if (cat.includes('국내')) return '국내';
  const name = (account?.company_name || '').toUpperCase();
  if (name === 'BPU' || name.startsWith('BPU ')) return 'BPU';
  return '해외';
}

export default function ProductReport() {
  const { orders, accounts, businessPlans, setEditingAccount } = useAccount();
  const [selProduct, setSelProduct] = useState('전체');
  const [selYear, setSelYear] = useState(CURRENT_YEAR);
  const [sortKey, setSortKey] = useState('ytd');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState(null);

  const validOrders = useMemo(() => filterValidOrders(orders || []), [orders]);
  const accountMap = useMemo(() => {
    const m = {};
    (accounts || []).forEach(a => { m[a.id] = a; });
    return m;
  }, [accounts]);

  // 당해연도 YTD (1월~현재월 기준)
  const yearOrders = useMemo(() =>
    validOrders.filter(o => (o.order_date || '').startsWith(String(selYear))),
    [validOrders, selYear]
  );

  // 전년 동기 (같은 기간)
  const priorYearOrders = useMemo(() => {
    const priorYearStr = String(selYear - 1);
    return validOrders.filter(o => {
      const d = o.order_date || '';
      if (!d.startsWith(priorYearStr)) return false;
      const m = parseInt(d.slice(5, 7), 10);
      return m <= CURRENT_MONTH;
    });
  }, [validOrders, selYear]);

  // 사업계획 (product 타입, 연간목표)
  const productPlanMap = useMemo(() => {
    const map = {};
    (businessPlans || [])
      .filter(p => p.type === 'product' && p.year === selYear)
      .forEach(p => {
        const key = p.product || '기타';
        if (!map[key]) map[key] = 0;
        map[key] += (p.annual_target || 0);
      });
    return map;
  }, [businessPlans, selYear]);

  // 제품군별 YTD 합계 (탭 배지용)
  const productYtdMap = useMemo(() => {
    const m = {};
    yearOrders.forEach(o => {
      const p = (o.product_category || '').trim() || '기타';
      m[p] = (m[p] || 0) + (o.order_amount || 0);
    });
    return m;
  }, [yearOrders]);

  // 고객별 집계
  const customerRows = useMemo(() => {
    const filtered = selProduct === '전체'
      ? yearOrders
      : yearOrders.filter(o => (o.product_category || '').trim() === selProduct);

    const priorFiltered = selProduct === '전체'
      ? priorYearOrders
      : priorYearOrders.filter(o => (o.product_category || '').trim() === selProduct);

    const byAcc = {};
    filtered.forEach(o => {
      const id = o.account_id;
      if (!byAcc[id]) byAcc[id] = { ytd: 0 };
      byAcc[id].ytd += (o.order_amount || 0);
    });

    const priorByAcc = {};
    priorFiltered.forEach(o => {
      priorByAcc[o.account_id] = (priorByAcc[o.account_id] || 0) + (o.order_amount || 0);
    });

    const totalYtd = Object.values(byAcc).reduce((s, v) => s + v.ytd, 0);

    return Object.entries(byAcc).map(([id, { ytd }]) => {
      const acc = accountMap[id] || {};
      const prior = priorByAcc[id] || 0;
      return {
        id,
        name: acc.company_name || id,
        category: getCategory(acc),
        salesRep: acc.sales_rep || '-',
        ytd,
        prior,
        growth: pct(ytd, prior),
        share: totalYtd > 0 ? (ytd / totalYtd) * 100 : 0,
      };
    });
  }, [yearOrders, priorYearOrders, accountMap, selProduct]);

  const sortedRows = useMemo(() => {
    const rows = [...customerRows];
    rows.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) av = sortAsc ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortAsc ? Infinity : -Infinity;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return rows;
  }, [customerRows, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortIcon = (key) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';

  // 요약 KPI
  const totalYtd = customerRows.reduce((s, r) => s + r.ytd, 0);
  const totalPrior = customerRows.reduce((s, r) => s + r.prior, 0);
  const planTotal = selProduct === '전체'
    ? Object.values(productPlanMap).reduce((s, v) => s + v, 0)
    : (productPlanMap[selProduct] || 0);
  const achieveRate = planTotal > 0 ? (totalYtd / planTotal) * 100 : null;
  const growthRate = pct(totalYtd, totalPrior);

  // 제품군별 집계 (전체 보기용 드릴다운)
  const productRows = useMemo(() => {
    if (selProduct !== '전체') return [];
    const map = {};
    yearOrders.forEach(o => {
      const p = (o.product_category || '').trim() || '기타';
      if (!map[p]) map[p] = { ytd: 0, prior: 0 };
      map[p].ytd += (o.order_amount || 0);
    });
    priorYearOrders.forEach(o => {
      const p = (o.product_category || '').trim() || '기타';
      if (!map[p]) map[p] = { ytd: 0, prior: 0 };
      map[p].prior += (o.order_amount || 0);
    });
    return Object.entries(map)
      .map(([product, { ytd, prior }]) => ({
        product,
        ytd,
        prior,
        growth: pct(ytd, prior),
        plan: productPlanMap[product] || 0,
      }))
      .sort((a, b) => b.ytd - a.ytd);
  }, [yearOrders, priorYearOrders, productPlanMap, selProduct]);

  // Excel 내보내기
  const handleExport = useCallback(async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const H1_MONTHS = Array.from({ length: 6 }, (_, i) => i + 1); // 1~6월
    const H2_MONTHS = Array.from({ length: 6 }, (_, i) => i + 7); // 7~12월

    const buildYearOrders = (year) =>
      validOrders.filter(o => (o.order_date || '').startsWith(String(year)));

    const allYearOrders = buildYearOrders(selYear);
    const allPriorOrders = buildYearOrders(selYear - 1);

    const sumForProduct = (ordersArr, product, months) =>
      ordersArr
        .filter(o => {
          const match = product === '전체' || (o.product_category || '').trim() === product;
          const m = parseInt((o.order_date || '').slice(5, 7), 10);
          return match && (months ? months.includes(m) : true);
        })
        .reduce((s, o) => s + (o.order_amount || 0), 0);

    const sumForCustomerProduct = (ordersArr, accId, product, months) =>
      ordersArr
        .filter(o => {
          const matchAcc = o.account_id === accId;
          const matchProd = product === '전체' || (o.product_category || '').trim() === product;
          const m = parseInt((o.order_date || '').slice(5, 7), 10);
          return matchAcc && matchProd && (months ? months.includes(m) : true);
        })
        .reduce((s, o) => s + (o.order_amount || 0), 0);

    const products = selProduct === '전체' ? PRODUCTS : [selProduct];

    // 시트 1: 제품군별 요약
    const summaryAoa = [];
    summaryAoa.push(['', `상반기 (H1)`, '', '', '', '', `하반기 (H2)`, '', '', '', '', '연간', '', '']);
    summaryAoa.push(['제품군 / 고객명', `사업계획(${selYear}H1)`, `수주실적(${selYear}H1)`, `${selYear - 1}년수주(H1)`, '계획대비갭', '전년대비갭',
      `사업계획(${selYear}H2)`, `수주실적(${selYear}H2)`, `${selYear - 1}년수주(H2)`, '계획대비갭', '전년대비갭',
      '사업계획(연간)', '연간갭(계획대비)', '연간갭(전년대비)']);

    products.forEach(product => {
      const plan = productPlanMap[product] || 0;
      const h1Plan = plan / 2;
      const h2Plan = plan / 2;

      const h1Actual = sumForProduct(allYearOrders, product, H1_MONTHS);
      const h2Actual = sumForProduct(allYearOrders, product, H2_MONTHS);
      const h1Prior = sumForProduct(allPriorOrders, product, H1_MONTHS);
      const h2Prior = sumForProduct(allPriorOrders, product, H2_MONTHS);

      summaryAoa.push([
        `▶  ${product}`,
        h1Plan, h1Actual, h1Prior, h1Actual - h1Plan, h1Actual - h1Prior,
        h2Plan, h2Actual, h2Prior, h2Actual - h2Plan, h2Actual - h2Prior,
        plan, (h1Actual + h2Actual) - plan, (h1Actual + h2Actual) - (h1Prior + h2Prior),
      ]);

      // 고객별 행
      const accIds = [...new Set(
        allYearOrders
          .filter(o => (o.product_category || '').trim() === product)
          .map(o => o.account_id)
      )];
      accIds.forEach(id => {
        const acc = accountMap[id] || {};
        const cat = getCategory(acc);
        const name = acc.company_name || id;
        const ch1 = sumForCustomerProduct(allYearOrders, id, product, H1_MONTHS);
        const ch2 = sumForCustomerProduct(allYearOrders, id, product, H2_MONTHS);
        const ph1 = sumForCustomerProduct(allPriorOrders, id, product, H1_MONTHS);
        const ph2 = sumForCustomerProduct(allPriorOrders, id, product, H2_MONTHS);
        summaryAoa.push([
          `    ${name} [${cat}]`,
          0, ch1, ph1, ch1 - 0, ch1 - ph1,
          0, ch2, ph2, ch2 - 0, ch2 - ph2,
          0, (ch1 + ch2) - 0, (ch1 + ch2) - (ph1 + ph2),
        ]);
      });
    });

    const ws1 = XLSX.utils.aoa_to_sheet(summaryAoa);
    ws1['!cols'] = [{ wch: 30 }, ...Array(13).fill({ wch: 16 })];
    XLSX.utils.book_append_sheet(wb, ws1, '제품군별 현황');

    // 시트 2: 고객별 상세 (현재 필터 기준)
    const detailAoa = [];
    detailAoa.push([`제품군별 수주 현황 — ${selProduct} (${selYear}년)`]);
    detailAoa.push(['고객명', '구분', '담당자', `${selYear} YTD 수주(원)`, `${selYear - 1} 동기(원)`, '전년대비 증감(원)', '전년대비 %', '비중 %']);
    sortedRows.forEach(r => {
      detailAoa.push([
        r.name,
        r.category,
        r.salesRep,
        r.ytd,
        r.prior,
        r.ytd - r.prior,
        r.growth !== null ? r.growth / 100 : '',
        r.share / 100,
      ]);
    });
    detailAoa.push(['합계', '', '', totalYtd, totalPrior, totalYtd - totalPrior, growthRate !== null ? growthRate / 100 : '', 1]);

    const ws2 = XLSX.utils.aoa_to_sheet(detailAoa);
    ws2['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 8 }];

    // 숫자 포맷
    const fmtKRW = '#,##0';
    const fmtPct = '0.0%';
    for (let r = 2; r <= sortedRows.length + 3; r++) {
      ['D', 'E', 'F'].forEach(col => {
        const cell = ws2[`${col}${r}`];
        if (cell && typeof cell.v === 'number') cell.z = fmtKRW;
      });
      ['G', 'H'].forEach(col => {
        const cell = ws2[`${col}${r}`];
        if (cell && typeof cell.v === 'number') cell.z = fmtPct;
      });
    }

    XLSX.utils.book_append_sheet(wb, ws2, '고객별 상세');

    const filename = `수주현황_제품군별_${selYear}_${selProduct}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }, [sortedRows, validOrders, productPlanMap, accountMap, selProduct, selYear, totalYtd, totalPrior, growthRate]);

  const thStyle = (key) => ({
    padding: '6px 8px', textAlign: key === 'name' || key === 'category' || key === 'salesRep' ? 'left' : 'right',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', userSelect: 'none',
    background: sortKey === key ? 'rgba(46,125,50,.08)' : 'transparent',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>📦 제품군별 수주 현황</h2>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            품목 클릭 → 고객별 실적 | 전년대비: {selYear - 1}년 동기 비교
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selYear}
            onChange={e => setSelYear(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExport}
            title="Excel 파일 다운로드"
          >
            📥 Excel 내보내기
          </button>
        </div>
      </div>

      {/* 제품군 탭 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {ALL_PRODUCTS.map(p => {
          const amt = p === '전체' ? Object.values(productYtdMap).reduce((s, v) => s + v, 0) : (productYtdMap[p] || 0);
          const active = selProduct === p;
          return (
            <button
              key={p}
              onClick={() => setSelProduct(p)}
              style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
                fontWeight: active ? 700 : 400,
                background: active ? 'var(--accent)' : 'var(--bg2)',
                color: active ? '#fff' : amt > 0 ? 'var(--text)' : 'var(--text3)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all .15s',
              }}
            >
              {p}
              {amt > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>
                  {fmtM(amt)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* KPI 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: '연간 목표', value: fmtM(planTotal), sub: planTotal ? '사업계획 기준' : '계획 없음', color: '#2e7d32' },
          { label: `${selYear} YTD 수주`, value: fmtM(totalYtd), sub: `${CURRENT_MONTH}월까지 누적`, color: 'var(--primary)' },
          { label: '달성률', value: achieveRate !== null ? `${achieveRate.toFixed(1)}%` : '-', sub: '목표 대비', color: achieveRate !== null ? (achieveRate >= 100 ? 'var(--green)' : achieveRate >= 80 ? 'var(--yellow)' : 'var(--red)') : 'var(--text2)' },
          { label: '전년 동기 대비', value: growthRate !== null ? fmtPct(growthRate) : '-', sub: `전년 ${fmtM(totalPrior)}`, color: growthRate !== null ? (growthRate > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text2)' },
          { label: '고객 수', value: `${customerRows.length}개사`, sub: '수주 발생 고객', color: 'var(--text2)' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* 전체 보기: 제품군별 요약표 */}
      {selProduct === '전체' && productRows.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">■ 제품군별 요약 (클릭하면 해당 품목으로 이동)</div>
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 100, textAlign: 'left' }}>제품군</th>
                  <th style={{ textAlign: 'right' }}>연간목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 수주</th>
                  <th style={{ textAlign: 'right' }}>달성률</th>
                  <th style={{ textAlign: 'right' }}>전년 동기</th>
                  <th style={{ textAlign: 'right' }}>전년 대비</th>
                  <th style={{ textAlign: 'right', minWidth: 140 }}>비중 바</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map(r => {
                  const rate = r.plan > 0 ? (r.ytd / r.plan) * 100 : null;
                  const share = totalYtd > 0 ? (r.ytd / totalYtd) * 100 : 0;
                  const isExpanded = expandedProduct === r.product;
                  const productCustomers = customerRows
                    .filter(c => {
                      const accOrders = yearOrders.filter(o =>
                        o.account_id === c.id && (o.product_category || '').trim() === r.product
                      );
                      return accOrders.length > 0;
                    });
                  return [
                    <tr
                      key={r.product}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedProduct(isExpanded ? null : r.product)}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ marginRight: 4, fontSize: 10 }}>{isExpanded ? '▼' : '▶'}</span>
                        {r.product}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(r.plan)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(r.ytd)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(rate) }}>{rate !== null ? `${rate.toFixed(0)}%` : '-'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(r.prior)}</td>
                      <td style={{ textAlign: 'right', ...growthStyle(r.growth) }}>{fmtPct(r.growth)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(share, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text2)', minWidth: 32, textAlign: 'right' }}>{share.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>,
                    isExpanded && productCustomers.length > 0 && productCustomers.map(c => {
                      const cOrders = yearOrders.filter(o => o.account_id === c.id && (o.product_category || '').trim() === r.product);
                      const cYtd = cOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
                      const cPrior = priorYearOrders
                        .filter(o => o.account_id === c.id && (o.product_category || '').trim() === r.product)
                        .reduce((s, o) => s + (o.order_amount || 0), 0);
                      return (
                        <tr key={`${r.product}-${c.id}`} style={{ background: 'rgba(46,125,50,.03)' }}>
                          <td style={{ paddingLeft: 24, fontSize: 11, color: 'var(--text2)' }}>
                            <span
                              style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline' }}
                              onClick={() => setEditingAccount(accounts.find(a => a.id === c.id) || null)}
                            >
                              {c.name}
                            </span>
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>[{c.category}] {c.salesRep}</span>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text3)' }}>-</td>
                          <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtM(cYtd)}</td>
                          <td>-</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)', fontSize: 11 }}>{fmtM(cPrior)}</td>
                          <td style={{ textAlign: 'right', ...growthStyle(pct(cYtd, cPrior)), fontSize: 11 }}>{fmtPct(pct(cYtd, cPrior))}</td>
                          <td></td>
                        </tr>
                      );
                    }),
                  ];
                })}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td>합계</td>
                  <td style={{ textAlign: 'right' }}>{fmtM(planTotal)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtM(totalYtd)}</td>
                  <td style={{ textAlign: 'right', ...achieveStyle(achieveRate) }}>{achieveRate !== null ? `${achieveRate.toFixed(0)}%` : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{fmtM(totalPrior)}</td>
                  <td style={{ textAlign: 'right', ...growthStyle(growthRate) }}>{fmtPct(growthRate)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 고객별 상세 테이블 */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {selProduct === '전체' ? '전체 고객 상세' : `${selProduct} — 고객별 실적`}
            <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11, marginLeft: 8 }}>
              {sortedRows.length}개사 · {selYear}년 YTD ({CURRENT_MONTH}월까지)
            </span>
          </span>
        </div>
        <div className="table-wrap">
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle('name')} onClick={() => handleSort('name')}>고객명{sortIcon('name')}</th>
                <th style={{ ...thStyle('category'), textAlign: 'left' }} onClick={() => handleSort('category')}>구분{sortIcon('category')}</th>
                <th style={{ ...thStyle('salesRep'), textAlign: 'left' }} onClick={() => handleSort('salesRep')}>담당자{sortIcon('salesRep')}</th>
                <th style={thStyle('ytd')} onClick={() => handleSort('ytd')}>YTD 수주{sortIcon('ytd')}</th>
                <th style={thStyle('prior')} onClick={() => handleSort('prior')}>전년 동기{sortIcon('prior')}</th>
                <th style={thStyle('growth')} onClick={() => handleSort('growth')}>전년 대비{sortIcon('growth')}</th>
                <th style={thStyle('share')} onClick={() => handleSort('share')}>비중{sortIcon('share')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)' }}>
                    {selYear}년 {selProduct !== '전체' ? `${selProduct} ` : ''}수주 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span
                      style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontWeight: 600 }}
                      onClick={() => setEditingAccount(accounts.find(a => a.id === r.id) || null)}
                    >
                      {r.name}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
                      background: r.category === 'BPU' ? 'rgba(139,92,246,.12)' : r.category === '국내' ? 'rgba(22,163,74,.12)' : 'rgba(37,99,235,.12)',
                      color: r.category === 'BPU' ? '#7c3aed' : r.category === '국내' ? '#16a34a' : '#2563eb',
                    }}>
                      {r.category}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{r.salesRep}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(r.ytd)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(r.prior)}</td>
                  <td style={{ textAlign: 'right', ...growthStyle(r.growth) }}>{fmtPct(r.growth)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <div style={{ width: 50, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(r.share, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text2)', minWidth: 30, textAlign: 'right' }}>{r.share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedRows.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700, background: 'var(--bg2)' }}>
                  <td>합계</td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>{fmtM(totalYtd)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtM(totalPrior)}</td>
                  <td style={{ textAlign: 'right', ...growthStyle(growthRate) }}>{fmtPct(growthRate)}</td>
                  <td style={{ textAlign: 'right' }}>100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedRows.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            ※ ProMES 수주 기준 | 고객명 클릭 → 카드 열기 | 헤더 클릭 → 정렬
            | 비중: {selProduct === '전체' ? '전체' : `${selProduct}`} 품목 수주 내 해당 고객 비율
          </div>
        )}
      </div>
    </div>
  );
}
