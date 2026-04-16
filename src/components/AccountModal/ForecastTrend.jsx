import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { PRODUCTS } from '../../lib/constants';
import { genId, today } from '../../lib/utils';

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const CURRENT_YEAR = new Date().getFullYear();

function fmtKRW(n) {
  if (!n) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString();
}

export default function ForecastTrend({ accountId }) {
  const { getForecastsForAccount, saveForecast, removeForecast, getOrdersForAccount } = useAccount();
  const allForecasts = getForecastsForAccount(accountId);
  const allOrders = getOrdersForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [newFcst, setNewFcst] = useState({
    year: CURRENT_YEAR,
    month: 1,
    product_category: '',
    forecast_amount: '',
    currency: 'KRW',
    notes: '',
  });

  // Track 분류: forecast 데이터가 있으면 Track A, 없으면 Track B
  const hasForecast = allForecasts.length > 0;

  // ── Track A: FCST vs Actual (월별) ──
  const fcstAnalysis = useMemo(() => {
    if (!hasForecast) return [];
    return allForecasts.map(f => {
      const month = f.month || quarterToMonth(f.period);
      const periodOrders = allOrders.filter(o => {
        if (!o.order_date) return false;
        const y = parseInt(o.order_date.slice(0, 4));
        const m = parseInt(o.order_date.slice(5, 7));
        if (f.period) {
          // 기존 분기 데이터 호환
          if (y !== f.year) return false;
          if (f.period === 'Q1') return m >= 1 && m <= 3;
          if (f.period === 'Q2') return m >= 4 && m <= 6;
          if (f.period === 'Q3') return m >= 7 && m <= 9;
          if (f.period === 'Q4') return m >= 10 && m <= 12;
        }
        return y === f.year && m === month;
      });
      const actual = periodOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
      const forecast = f.forecast_amount || 0;
      const variance = forecast > 0 ? ((actual - forecast) / forecast) * 100 : 0;
      return { ...f, month, actual, variance };
    });
  }, [allForecasts, allOrders, hasForecast]);

  // FCST 괴리 알람 (±15%)
  const fcstAlarms = fcstAnalysis.filter(f => Math.abs(f.variance) > 15);

  // ── Track B: 트렌드 분석 ──
  const trendAnalysis = useMemo(() => {
    if (allOrders.length < 2) return null;

    // 월별 집계
    const monthlyMap = {};
    allOrders.forEach(o => {
      if (!o.order_date) return;
      const y = parseInt(o.order_date.slice(0, 4));
      const m = parseInt(o.order_date.slice(5, 7));
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { year: y, month: m, amount: 0, count: 0 };
      monthlyMap[key].amount += o.order_amount || 0;
      monthlyMap[key].count++;
    });

    // 연도별 합계
    const yearlyMap = {};
    allOrders.forEach(o => {
      if (!o.order_date) return;
      const y = o.order_date.slice(0, 4);
      if (!yearlyMap[y]) yearlyMap[y] = 0;
      yearlyMap[y] += o.order_amount || 0;
    });
    const yearly = Object.entries(yearlyMap).sort((a, b) => a[0].localeCompare(b[0]));
    const maxYearly = Math.max(1, ...yearly.map(([, v]) => v));

    // 전년 동기 대비 (분기 단위)
    const quarterlyMap = {};
    allOrders.forEach(o => {
      if (!o.order_date) return;
      const y = parseInt(o.order_date.slice(0, 4));
      const m = parseInt(o.order_date.slice(5, 7));
      const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
      const key = `${y}-${q}`;
      if (!quarterlyMap[key]) quarterlyMap[key] = { year: y, period: q, amount: 0 };
      quarterlyMap[key].amount += o.order_amount || 0;
    });

    const yoyComparison = [];
    ['Q1','Q2','Q3','Q4'].forEach(q => {
      const cur = quarterlyMap[`${CURRENT_YEAR}-${q}`];
      const prev = quarterlyMap[`${CURRENT_YEAR - 1}-${q}`];
      if (prev) {
        const curAmt = cur?.amount || 0;
        const change = prev.amount > 0 ? ((curAmt - prev.amount) / prev.amount) * 100 : 0;
        yoyComparison.push({ period: q, current: curAmt, previous: prev.amount, change });
      }
    });

    // 이탈 위험
    const churnRisk = yoyComparison.filter(y => y.change < -20).length >= 2;

    // 평균 발주 주기
    const sortedOrders = allOrders.filter(o => o.order_date).sort((a, b) => a.order_date.localeCompare(b.order_date));
    let avgGap = null, expectedNext = null;
    if (sortedOrders.length >= 2) {
      const gaps = [];
      for (let i = 1; i < sortedOrders.length; i++) {
        const d = (new Date(sortedOrders[i].order_date) - new Date(sortedOrders[i - 1].order_date)) / 86400000;
        if (d > 0) gaps.push(d);
      }
      if (gaps.length > 0) {
        avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
        const lastDate = new Date(sortedOrders[sortedOrders.length - 1].order_date);
        expectedNext = new Date(lastDate.getTime() + avgGap * 86400000).toISOString().slice(0, 10);
      }
    }

    return { yearly, maxYearly, yoyComparison, churnRisk, avgGap, expectedNext };
  }, [allOrders]);

  const handleAddFcst = () => {
    if (!newFcst.product_category || !newFcst.forecast_amount) return;
    saveForecast({
      id: genId('fcst'),
      account_id: accountId,
      year: parseInt(newFcst.year),
      month: parseInt(newFcst.month),
      product_category: newFcst.product_category,
      forecast_amount: parseFloat(newFcst.forecast_amount) || 0,
      currency: newFcst.currency,
      order_month: `${newFcst.year}-${String(newFcst.month).padStart(2, '0')}`,
      notes: newFcst.notes || '',
      created_at: today(),
    });
    setNewFcst({ year: CURRENT_YEAR, month: parseInt(newFcst.month) < 12 ? parseInt(newFcst.month) + 1 : 1, product_category: newFcst.product_category, forecast_amount: '', currency: newFcst.currency, notes: '' });
  };

  // 월별 요약 테이블 (연도별 그룹)
  const monthlySummary = useMemo(() => {
    if (!hasForecast) return [];
    const byYear = {};
    fcstAnalysis.forEach(f => {
      const y = f.year;
      if (!byYear[y]) byYear[y] = {};
      const m = f.month || 1;
      if (!byYear[y][m]) byYear[y][m] = { forecast: 0, actual: 0, items: [] };
      byYear[y][m].forecast += f.forecast_amount || 0;
      byYear[y][m].actual += f.actual;
      byYear[y][m].items.push(f);
    });
    return Object.entries(byYear).sort((a, b) => b[0] - a[0]);
  }, [fcstAnalysis, hasForecast]);

  function displayPeriod(f) {
    if (f.month) return `${f.month}월`;
    if (f.period) return f.period;
    return '-';
  }

  return (
    <div>
      {/* Track 표시 */}
      <div className="alert-banner warning" style={{ marginBottom: 16 }}>
        <span>{hasForecast ? '📊' : '📈'}</span>
        <strong>{hasForecast ? 'Track A' : 'Track B'}</strong> —
        {hasForecast
          ? ' FCST 제공 고객: Forecast vs 실제 발주 괴리 분석'
          : ' FCST 미제공 고객: 수주 트렌드 자동 분석'}
      </div>

      {/* ═══ Track A: FCST 제공 고객 ═══ */}
      {hasForecast && (
        <>
          {fcstAlarms.length > 0 && (
            <div className="alert-banner danger" style={{ marginBottom: 16 }}>
              <span>🔴</span>
              <strong>FCST 괴리 경고:</strong> {fcstAlarms.length}건에서 ±15% 초과 괴리 발생
            </div>
          )}

          {/* 월별 요약 */}
          {monthlySummary.map(([year, months]) => (
            <div key={year} className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">📊 {year}년 월별 FCST vs 실적</div>
              <div className="table-wrap" style={{ maxHeight: 400 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>월</th>
                      <th style={{ textAlign: 'right' }}>Forecast</th>
                      <th style={{ textAlign: 'right' }}>실적</th>
                      <th style={{ textAlign: 'right' }}>괴리율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(months).sort((a, b) => a[0] - b[0]).map(([m, data]) => {
                      const pct = data.forecast > 0 ? ((data.actual - data.forecast) / data.forecast) * 100 : 0;
                      return (
                        <tr key={m}>
                          <td>{m}월</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(data.forecast)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(data.actual)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`score-badge ${Math.abs(pct) > 15 ? 'red' : Math.abs(pct) > 10 ? 'yellow' : 'green'}`}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* 상세 항목 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📋 FCST 상세 항목</div>
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>연도</th>
                    <th>기간</th>
                    <th>제품군</th>
                    <th style={{ textAlign: 'right' }}>Forecast</th>
                    <th style={{ textAlign: 'right' }}>실적</th>
                    <th style={{ textAlign: 'right' }}>괴리율</th>
                    <th>비고</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fcstAnalysis.map(f => (
                    <tr key={f.id}>
                      <td>{f.year}</td>
                      <td>{displayPeriod(f)}</td>
                      <td>{f.product_category}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(f.forecast_amount || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(f.actual)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`score-badge ${Math.abs(f.variance) > 15 ? 'red' : Math.abs(f.variance) > 10 ? 'yellow' : 'green'}`}>
                          {f.variance > 0 ? '+' : ''}{f.variance.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.notes || ''}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => removeForecast(f.id)}>삭제</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ Track B: 트렌드 분석 ═══ */}
      {!hasForecast && trendAnalysis && (
        <>
          {trendAnalysis.churnRisk && (
            <div className="alert-banner danger" style={{ marginBottom: 16 }}>
              <span>🔴</span>
              <strong>이탈 위험:</strong> 최근 2분기 연속 전년 대비 20% 이상 감소 추이 감지
            </div>
          )}

          {/* 연간 추이 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📈 연간 수주 추이</div>
            <div className="dist-chart">
              {trendAnalysis.yearly.map(([year, amt]) => (
                <div key={year} className="dist-row">
                  <span className="dist-label">{year}</span>
                  <div className="dist-bar-wrap" style={{ height: 14 }}>
                    <div className="dist-bar" style={{ width: `${(amt / trendAnalysis.maxYearly) * 100}%`, background: 'var(--accent)' }} />
                  </div>
                  <span className="dist-count" style={{ width: 'auto', minWidth: 80 }}>{fmtKRW(amt)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 전년 동기 대비 */}
          {trendAnalysis.yoyComparison.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">📊 전년 동기 대비 ({CURRENT_YEAR - 1} vs {CURRENT_YEAR})</div>
              <div className="table-wrap" style={{ maxHeight: 250 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>분기</th>
                      <th style={{ textAlign: 'right' }}>{CURRENT_YEAR - 1}</th>
                      <th style={{ textAlign: 'right' }}>{CURRENT_YEAR}</th>
                      <th style={{ textAlign: 'right' }}>변화율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendAnalysis.yoyComparison.map(y => (
                      <tr key={y.period}>
                        <td>{y.period}</td>
                        <td style={{ textAlign: 'right' }}>{fmtKRW(y.previous)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(y.current)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`score-badge ${y.change < -20 ? 'red' : y.change < 0 ? 'yellow' : 'green'}`}>
                            {y.change > 0 ? '+' : ''}{y.change.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {trendAnalysis.avgGap && (
            <div className="alert-banner warning" style={{ marginBottom: 16 }}>
              <span>📅</span>
              평균 발주 주기: <strong>{trendAnalysis.avgGap}일</strong> | 예상 다음 발주: <strong>{trendAnalysis.expectedNext}</strong>
            </div>
          )}
        </>
      )}

      {/* Track B: 데이터 부족 */}
      {!hasForecast && !trendAnalysis && (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <div className="icon">📈</div>
          <p>트렌드 분석을 위한 수주 데이터가 부족합니다.<br />수주이력 탭에서 데이터를 추가해주세요.</p>
        </div>
      )}

      {/* FCST 입력 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Forecast 데이터 ({allForecasts.length}건)</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '닫기' : '+ Forecast 입력'}
        </button>
      </div>

      {showForm && (
        <div className="activity-form">
          <div className="form-row">
            <div className="form-group">
              <label>연도 *</label>
              <select value={newFcst.year} onChange={e => setNewFcst(p => ({ ...p, year: e.target.value }))}>
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>월 *</label>
              <select value={newFcst.month} onChange={e => setNewFcst(p => ({ ...p, month: e.target.value }))}>
                {MONTHS.map((label, idx) => <option key={idx + 1} value={idx + 1}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>제품군 *</label>
              <select value={newFcst.product_category} onChange={e => setNewFcst(p => ({ ...p, product_category: e.target.value }))}>
                <option value="">선택</option>
                {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Forecast 금액 (원) *</label>
              <input type="number" value={newFcst.forecast_amount} onChange={e => setNewFcst(p => ({ ...p, forecast_amount: e.target.value }))} placeholder="예상 수주 금액" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>통화</label>
              <select value={newFcst.currency} onChange={e => setNewFcst(p => ({ ...p, currency: e.target.value }))}>
                <option value="KRW">KRW (원)</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="form-group">
              <label>비고</label>
              <input type="text" value={newFcst.notes} onChange={e => setNewFcst(p => ({ ...p, notes: e.target.value }))} placeholder="메모 (선택)" />
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleAddFcst} disabled={!newFcst.product_category || !newFcst.forecast_amount}>추가</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 기존 분기 데이터 → 월 변환 (호환용) */
function quarterToMonth(period) {
  if (period === 'Q1') return 1;
  if (period === 'Q2') return 4;
  if (period === 'Q3') return 7;
  if (period === 'Q4') return 10;
  return 1;
}
