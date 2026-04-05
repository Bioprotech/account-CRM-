import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { PRODUCTS } from '../../lib/constants';
import { today, genId, fmtDate } from '../../lib/utils';

export default function OrderHistory({ accountId }) {
  const { getOrdersForAccount, saveOrder, removeOrder, currentUser } = useAccount();
  const allOrders = getOrdersForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [newOrder, setNewOrder] = useState({
    product_category: '',
    order_amount: '',
    currency: 'USD',
    order_date: today(),
  });

  const handleAdd = () => {
    if (!newOrder.product_category || !newOrder.order_amount) return;
    saveOrder({
      id: genId('ord'),
      account_id: accountId,
      order_date: newOrder.order_date,
      product_category: newOrder.product_category,
      order_amount: parseFloat(newOrder.order_amount) || 0,
      currency: newOrder.currency,
      sales_rep: currentUser,
      source: 'manual',
      import_date: today(),
    });
    setNewOrder({ product_category: '', order_amount: '', currency: 'USD', order_date: today() });
    setShowForm(false);
  };

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

  return (
    <div>
      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div className="kpi" style={{ padding: 12 }}>
          <div className="kpi-label">총 수주건수</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{allOrders.length}</div>
        </div>
        <div className="kpi accent" style={{ padding: 12 }}>
          <div className="kpi-label">총 수주금액</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>${totalAmount.toLocaleString()}</div>
        </div>
        <div className="kpi" style={{ padding: 12 }}>
          <div className="kpi-label">마지막 발주일</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{orderStats?.lastOrder ? fmtDate(orderStats.lastOrder) : '-'}</div>
        </div>
        <div className={`kpi ${orderStats?.daysUntilNext <= 14 ? 'red' : orderStats?.daysUntilNext <= 30 ? 'yellow' : ''}`} style={{ padding: 12 }}>
          <div className="kpi-label">예상 다음 발주</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>
            {orderStats ? (orderStats.daysUntilNext > 0 ? `D-${orderStats.daysUntilNext}` : `D+${Math.abs(orderStats.daysUntilNext)}`) : '-'}
          </div>
        </div>
      </div>

      {/* 발주 주기 정보 */}
      {orderStats && (
        <div className="alert-banner warning" style={{ marginBottom: 16 }}>
          <span>📊</span>
          평균 발주 주기: <strong>{orderStats.avgGap}일</strong> | 마지막 발주 후: <strong>{orderStats.daysSinceLast}일 경과</strong>
          {orderStats.daysUntilNext <= 0 && <span style={{ marginLeft: 8, color: 'var(--red)', fontWeight: 700 }}>⚠ 발주 예상일 경과</span>}
        </div>
      )}

      {/* 연간 수주 추이 */}
      {yearlyData.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📈 연간 수주 추이</div>
          <div className="dist-chart">
            {yearlyData.map(([year, amt]) => (
              <div key={year} className="dist-row">
                <span className="dist-label">{year}</span>
                <div className="dist-bar-wrap" style={{ height: 12 }}>
                  <div className="dist-bar" style={{ width: `${(amt / maxYearly) * 100}%`, background: 'var(--accent)' }} />
                </div>
                <span className="dist-count" style={{ width: 'auto', minWidth: 80 }}>${amt.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>수주 이력 ({allOrders.length}건)</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '취소' : '+ 수동 입력'}
        </button>
      </div>

      {/* 수동 입력 폼 */}
      {showForm && (
        <div className="activity-form">
          <div className="form-row">
            <div className="form-group">
              <label>제품군 *</label>
              <select value={newOrder.product_category} onChange={e => setNewOrder(p => ({ ...p, product_category: e.target.value }))}>
                <option value="">선택</option>
                {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>수주일 *</label>
              <input type="date" value={newOrder.order_date} onChange={e => setNewOrder(p => ({ ...p, order_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>수주금액 *</label>
              <input type="number" value={newOrder.order_amount} onChange={e => setNewOrder(p => ({ ...p, order_amount: e.target.value }))} placeholder="금액" />
            </div>
            <div className="form-group">
              <label>통화</label>
              <select value={newOrder.currency} onChange={e => setNewOrder(p => ({ ...p, currency: e.target.value }))}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="KRW">KRW</option>
              </select>
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!newOrder.product_category || !newOrder.order_amount}>추가</button>
          </div>
        </div>
      )}

      {/* 수주 목록 */}
      {allOrders.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📦</div>
          <p>수주 이력이 없습니다.<br />수동 입력 또는 엑셀 import로 추가하세요.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 300 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>수주일</th>
                <th>제품군</th>
                <th>금액</th>
                <th>통화</th>
                <th>담당자</th>
                <th>출처</th>
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
                  <td><span className={`issue-badge ${o.source === 'excel_import' ? '입찰' : '일반컨택'}`}>{o.source === 'excel_import' ? 'Excel' : '수동'}</span></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => removeOrder(o.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
