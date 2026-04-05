import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { PRODUCTS } from '../../lib/constants';
import { genId, today } from '../../lib/utils';

const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4'];
const CURRENT_YEAR = new Date().getFullYear();

export default function ForecastTrend({ accountId }) {
  const { getForecastsForAccount, saveForecast, removeForecast, getOrdersForAccount } = useAccount();
  const allForecasts = getForecastsForAccount(accountId);
  const allOrders = getOrdersForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [newFcst, setNewFcst] = useState({
    year: CURRENT_YEAR,
    period: 'Q1',
    product_category: '',
    forecast_amount: '',
    currency: 'USD',
  });

  // Track 분류: forecast 데이터가 있으면 Track A, 없으면 Track B
  const hasForecast = allForecasts.length > 0;

  // ── Track A: FCST vs Actual ──
  const fcstAnalysis = useMemo(() => {
    if (!hasForecast) return [];
    return allForecasts.map(f => {
      // 해당 기간의 실제 수주 합산
      const periodOrders = allOrders.filter(o => {
        if (!o.order_date) return false;
        const y = parseInt(o.order_date.slice(0, 4));
        if (y !== f.year) return false;
        const m = parseInt(o.order_date.slice(5, 7));
        if (f.period === 'Q1') return m >= 1 && m <= 3;
        if (f.period === 'Q2') return m >= 4 && m <= 6;
        if (f.period === 'Q3') return m >= 7 && m <= 9;
        if (f.period === 'Q4') return m >= 10 && m <= 12;
        return false;
      });
      const actual = periodOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
      const forecast = f.forecast_amount || 0;
      const variance = forecast > 0 ? ((actual - forecast) / forecast) * 100 : 0;
      return { ...f, actual, variance };
    });
  }, [allForecasts, allOrders, hasForecast]);

  // FCST 괴리 알람 (±15%)
  const fcstAlarms = fcstAnalysis.filter(f => Math.abs(f.variance) > 15);

  // ── Track B: 트렌드 분석 ──
  const trendAnalysis = useMemo(() => {
    if (allOrders.length < 2) return null;

    // 분기별 집계
    const quarterlyMap = {};
    allOrders.forEach(o => {
      if (!o.order_date) return;
      const y = parseInt(o.order_date.slice(0, 4));
      const m = parseInt(o.order_date.slice(5, 7));
      const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
      const key = `${y}-${q}`;
      if (!quarterlyMap[key]) quarterlyMap[key] = { year: y, period: q, amount: 0, count: 0 };
      quarterlyMap[key].amount += o.order_amount || 0;
      quarterlyMap[key].count++;
    });

    const quarters = Object.values(quarterlyMap).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.period.localeCompare(b.period);
    });

    if (quarters.length < 2) return null;

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

    // 계절성: 같은 분기를 연도별로 비교
    const seasonality = {};
    PERIODS.forEach(q => {
      const vals = quarters.filter(qr => qr.period === q);
      if (vals.length > 0) {
        seasonality[q] = {
          avg: Math.round(vals.reduce((s, v) => s + v.amount, 0) / vals.length),
          count: vals.length,
          latest: vals[vals.length - 1]?.amount || 0,
        };
      }
    });

    // 전년 동기 대비 변화
    const yoyComparison = [];
    const curYear = CURRENT_YEAR;
    const prevYear = curYear - 1;
    PERIODS.forEach(q => {
      const cur = quarterlyMap[`${curYear}-${q}`];
      const prev = quarterlyMap[`${prevYear}-${q}`];
      if (prev) {
        const curAmt = cur?.amount || 0;
        const change = prev.amount > 0 ? ((curAmt - prev.amount) / prev.amount) * 100 : 0;
        yoyComparison.push({ period: q, current: curAmt, previous: prev.amount, change });
      }
    });

    // 이탈 위험: 최근 2분기 연속 전년대비 20% 이상 감소
    const churnRisk = yoyComparison.filter(y => y.change < -20).length >= 2;

    // 평균 발주 주기 & 예상 다음 발주
    const sortedOrders = allOrders.filter(o => o.order_date).sort((a, b) => a.order_date.localeCompare(b.order_date));
    let avgGap = null;
    let expectedNext = null;
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

    return { quarters, yearly, maxYearly, seasonality, yoyComparison, churnRisk, avgGap, expectedNext };
  }, [allOrders]);

  const handleAddFcst = () => {
    if (!newFcst.product_category || !newFcst.forecast_amount) return;
    saveForecast({
      id: genId('fcst'),
      account_id: accountId,
      year: parseInt(newFcst.year),
      period: newFcst.period,
      product_category: newFcst.product_category,
      forecast_amount: parseFloat(newFcst.forecast_amount) || 0,
      currency: newFcst.currency,
      created_at: today(),
    });
    setNewFcst({ year: CURRENT_YEAR, period: 'Q1', product_category: '', forecast_amount: '', currency: 'USD' });
    setShowForm(false);
  };

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
          {/* 괴리 알람 */}
          {fcstAlarms.length > 0 && (
            <div className="alert-banner danger" style={{ marginBottom: 16 }}>
              <span>🔴</span>
              <strong>FCST 괴리 경고:</strong> {fcstAlarms.length}건의 분기에서 ±15% 초과 괴리 발생
            </div>
          )}

          {/* FCST vs Actual 테이블 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">📊 Forecast vs 실적</div>
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>연도</th>
                    <th>분기</th>
                    <th>제품군</th>
                    <th style={{ textAlign: 'right' }}>Forecast</th>
                    <th style={{ textAlign: 'right' }}>실적</th>
                    <th style={{ textAlign: 'right' }}>괴리율</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fcstAnalysis.map(f => (
                    <tr key={f.id}>
                      <td>{f.year}</td>
                      <td>{f.period}</td>
                      <td>{f.product_category}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${(f.forecast_amount || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${f.actual.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`score-badge ${Math.abs(f.variance) > 15 ? 'red' : Math.abs(f.variance) > 10 ? 'yellow' : 'green'}`}>
                          {f.variance > 0 ? '+' : ''}{f.variance.toFixed(1)}%
                        </span>
                      </td>
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
          {/* 이탈 위험 경고 */}
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
                  <span className="dist-count" style={{ width: 'auto', minWidth: 80 }}>${amt.toLocaleString()}</span>
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
                        <td style={{ textAlign: 'right' }}>${y.previous.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${y.current.toLocaleString()}</td>
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

          {/* 계절성 패턴 */}
          {Object.keys(trendAnalysis.seasonality).length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">🔄 계절성 패턴 (분기별 평균)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {PERIODS.map(q => {
                  const s = trendAnalysis.seasonality[q];
                  return (
                    <div key={q} className="kpi" style={{ padding: 12 }}>
                      <div className="kpi-label">{q}</div>
                      <div className="kpi-value" style={{ fontSize: 18 }}>
                        {s ? `$${s.avg.toLocaleString()}` : '-'}
                      </div>
                      {s && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{s.count}회 평균</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 예상 발주 */}
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

      {/* FCST 입력 (항상 표시 — Track A 전환용) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Forecast 데이터 ({allForecasts.length}건)</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '취소' : '+ Forecast 입력'}
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
              <label>분기 *</label>
              <select value={newFcst.period} onChange={e => setNewFcst(p => ({ ...p, period: e.target.value }))}>
                {PERIODS.map(q => <option key={q} value={q}>{q}</option>)}
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
              <label>Forecast 금액 *</label>
              <input type="number" value={newFcst.forecast_amount} onChange={e => setNewFcst(p => ({ ...p, forecast_amount: e.target.value }))} placeholder="예상 수주 금액" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>통화</label>
              <select value={newFcst.currency} onChange={e => setNewFcst(p => ({ ...p, currency: e.target.value }))}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="KRW">KRW</option>
              </select>
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleAddFcst} disabled={!newFcst.product_category || !newFcst.forecast_amount}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
