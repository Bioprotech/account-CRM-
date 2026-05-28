import { useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { fmtDate } from '../../lib/utils';

export default function OrderHistory({ accountId }) {
  const { getOrdersForAccount, removeOrder, accounts, t } = useAccount();
  const allOrders = getOrdersForAccount(accountId);
  const account = useMemo(() => (accounts || []).find(a => a.id === accountId), [accounts, accountId]);

  // v3.17.10: 수동 입력 영구 비활성화 — 수주는 ProMES Excel import만이 정답.
  // handleAdd / showForm / newOrder state 제거 (재발 방지).

  // 연도별 집계
  const yearlyData = useMemo(() => {
    const map = {};
    allOrders.forEach(o => {
      const year = (o.order_date || '').slice(0, 4);
      if (!year) return;
      if (!map[year]) map[year] = 0;
      map[year] += o.order_amount || 0;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allOrders]);

  const maxYearly = Math.max(1, ...yearlyData.map(([, v]) => v));

  // 평균 발주 주기
  const orderStats = useMemo(() => {
    const sorted = allOrders.filter(o => o.order_date).sort((a, b) => a.order_date.localeCompare(b.order_date));
    if (sorted.length < 2) return null;

    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const d = (new Date(sorted[i].order_date) - new Date(sorted[i - 1].order_date)) / 86400000;
      if (d > 0) gaps.push(d);
    }
    if (gaps.length === 0) return null;

    const avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    const lastOrder = sorted[sorted.length - 1];
    const daysSinceLast = Math.round((Date.now() - new Date(lastOrder.order_date).getTime()) / 86400000);
    const expectedNext = new Date(new Date(lastOrder.order_date).getTime() + avgGap * 86400000).toISOString().slice(0, 10);
    const daysUntilNext = Math.round(avgGap - daysSinceLast);

    return { avgGap, lastOrder: lastOrder.order_date, daysSinceLast, expectedNext, daysUntilNext };
  }, [allOrders]);

  const totalAmount = allOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

  // v3.17 Phase A5: 통화별 합계 (혼합 통화 정확하게 표시)
  //   ProMES import 데이터는 모두 KRW, 수동 입력은 다양함
  //   기존 하드코딩 $ 표시 버그 수정
  const totalsByCurrency = {};
  allOrders.forEach(o => {
    const cur = o.currency || 'KRW';
    totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + (o.order_amount || 0);
  });
  const currencySymbol = (cur) => {
    if (cur === 'KRW') return '₩';
    if (cur === 'EUR') return '€';
    if (cur === 'GBP') return '£';
    if (cur === 'JPY') return '¥';
    if (cur === 'CNY') return '¥';
    return '$';
  };
  // 가장 비중 큰 통화 1개만 KPI에 표시 (혼합인 경우 별도 표기)
  const sortedCurrencies = Object.entries(totalsByCurrency).sort((a, b) => b[1] - a[1]);
  const primaryCurrency = sortedCurrencies[0]?.[0] || 'KRW';
  const primaryTotal = sortedCurrencies[0]?.[1] || 0;
  const hasMixedCurrency = sortedCurrencies.length > 1;

  return (
    <div>
      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div className="kpi" style={{ padding: 12 }}>
          <div className="kpi-label">{t('orderHistory.totalCount')}</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{allOrders.length}</div>
        </div>
        <div className="kpi accent" style={{ padding: 12 }}>
          <div className="kpi-label">{t('orderHistory.totalAmount')} {hasMixedCurrency && <span style={{ fontSize: 9, color: 'var(--text3)' }}>({t('orderHistory.mixed')})</span>}</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {currencySymbol(primaryCurrency)}{primaryTotal.toLocaleString()}
          </div>
          {hasMixedCurrency && (
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
              {sortedCurrencies.slice(1).map(([c, v]) => `${currencySymbol(c)}${v.toLocaleString()}`).join(' / ')}
            </div>
          )}
        </div>
        <div className="kpi" style={{ padding: 12 }}>
          <div className="kpi-label">{t('orderHistory.lastOrder')}</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{orderStats?.lastOrder ? fmtDate(orderStats.lastOrder) : '-'}</div>
        </div>
        <div className={`kpi ${orderStats?.daysUntilNext <= 14 ? 'red' : orderStats?.daysUntilNext <= 30 ? 'yellow' : ''}`} style={{ padding: 12 }}>
          <div className="kpi-label">{t('orderHistory.expectedNext')}</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>
            {orderStats ? (orderStats.daysUntilNext > 0 ? `D-${orderStats.daysUntilNext}` : `D+${Math.abs(orderStats.daysUntilNext)}`) : '-'}
          </div>
        </div>
      </div>

      {/* 발주 주기 정보 */}
      {orderStats && (
        <div className="alert-banner warning" style={{ marginBottom: 16 }}>
          <span>📊</span>
          {t('orderHistory.avgGap')}: <strong>{orderStats.avgGap}{t('orderHistory.days')}</strong> | {t('orderHistory.sinceLast')}: <strong>{orderStats.daysSinceLast}{t('orderHistory.daysAgo')}</strong>
          {orderStats.daysUntilNext <= 0 && <span style={{ marginLeft: 8, color: 'var(--red)', fontWeight: 700 }}>{t('orderHistory.overdue')}</span>}
        </div>
      )}

      {/* 연간 수주 추이 */}
      {yearlyData.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t('orderHistory.yearlyTrend')}</div>
          <div className="dist-chart">
            {yearlyData.map(([year, amt]) => (
              <div key={year} className="dist-row">
                <span className="dist-label">{year}</span>
                <div className="dist-bar-wrap" style={{ height: 12 }}>
                  <div className="dist-bar" style={{ width: `${(amt / maxYearly) * 100}%`, background: 'var(--accent)' }} />
                </div>
                <span className="dist-count" style={{ width: 'auto', minWidth: 80 }}>{currencySymbol(primaryCurrency)}{amt.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('orderHistory.listTitle')} ({allOrders.length})</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{t('orderHistory.importOnly')}</span>
      </div>

      {/* 수주 목록 */}
      {allOrders.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📦</div>
          <p>{t('orderHistory.empty')}</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 300 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('orderHistory.orderDate')}</th>
                <th>{t('orderHistory.product')}</th>
                <th>{t('orderHistory.amount')}</th>
                <th>{t('orderHistory.currency')}</th>
                <th>{t('orderHistory.rep')}</th>
                <th>{t('orderHistory.source')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allOrders.map(o => (
                <tr key={o.id}>
                  <td>{o.order_date}</td>
                  <td>{o.product_category}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{(o.order_amount || 0).toLocaleString()}</td>
                  <td>{o.currency}</td>
                  <td>{o.sales_rep}</td>
                  <td><span className={`issue-badge ${o.source === 'excel_import' ? '입찰' : '일반컨택'}`}>{o.source === 'excel_import' ? 'Excel' : t('orderHistory.manual')}</span></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => removeOrder(o.id)}>{t('common.delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
