import { useMemo, useState, useCallback } from 'react';
import { useAccount } from '../context/AccountContext';
import { getValidSalesReps, getSortedValidReps } from '../lib/salesReps';
import { PRODUCTS } from '../lib/constants';
import { classifyCustomers, loadPriorYearCustomers, syncPriorYearFromSettings } from '../lib/customerClassification';
import { genId, today } from '../lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const Q_LABELS = { 1: 'Q1', 2: 'Q1', 3: 'Q1', 4: 'Q2', 5: 'Q2', 6: 'Q2', 7: 'Q3', 8: 'Q3', 9: 'Q3', 10: 'Q4', 11: 'Q4', 12: 'Q4' };

function fmtAmt(n) {
  if (!n) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString();
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

export default function OrderReport() {
  const { accounts, orders, businessPlans, forecasts, saveForecast, removeForecast, setEditingAccount, isAdmin, currentUser, appSettings, showToast, teamMembers, contracts } = useAccount();

  const [viewYear] = useState(CURRENT_YEAR);
  const [viewMode, setViewMode] = useState('customer'); // 'customer' | 'team' | 'product'
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null); // { accountId, month, product }
  const [editValue, setEditValue] = useState('');
  const [filterRep, setFilterRep] = useState('');

  // ── 데이터 준비 ──
  const yearOrders = useMemo(() =>
    orders.filter(o => {
      if (!o.order_date) return false;
      return parseInt(o.order_date.slice(0, 4)) === viewYear;
    }),
  [orders, viewYear]);

  const yearPlans = useMemo(() =>
    businessPlans.filter(p => p.year === viewYear && p.type !== 'product'),
  [businessPlans, viewYear]);

  const yearForecasts = useMemo(() =>
    forecasts.filter(f => f.year === viewYear),
  [forecasts, viewYear]);

  // ── 고객별 목표/실적/예측 집계 ──
  const customerData = useMemo(() => {
    const result = {};

    // 1. 사업계획 → 월별 목표
    yearPlans.forEach(p => {
      if (!p.account_id) return;
      if (!result[p.account_id]) {
        result[p.account_id] = {
          accountId: p.account_id,
          name: p.customer_name || '',
          salesRep: '',
          region: '',
          targets: {},       // { month: amount }
          actuals: {},       // { month: amount }
          fcsts: {},         // { month: amount }
          fcstDetails: {},   // { month: [forecast items] }
          annualTarget: p.annual_target || 0,
        };
      } else {
        result[p.account_id].annualTarget += (p.annual_target || 0);
      }
      // 월별 목표 분배
      if (p.targets) {
        Object.entries(p.targets).forEach(([m, v]) => {
          const mi = parseInt(m);
          if (mi >= 1 && mi <= 12) {
            result[p.account_id].targets[mi] = (result[p.account_id].targets[mi] || 0) + v;
          }
        });
      }
    });

    // account 정보 보강
    accounts.forEach(a => {
      if (result[a.id]) {
        result[a.id].salesRep = a.sales_rep || '';
        result[a.id].region = a.region || '';
        if (!result[a.id].name) result[a.id].name = a.company_name || '';
      }
    });

    // 2. 확정수주 → 월별 실적
    yearOrders.forEach(o => {
      const accountId = o.account_id;
      if (!accountId) return;
      const m = parseInt(o.order_date.slice(5, 7));
      if (!result[accountId]) {
        // 사업계획에 없는 고객도 실적은 표시
        const acc = accounts.find(a => a.id === accountId);
        result[accountId] = {
          accountId,
          name: o.customer_name || acc?.company_name || '',
          salesRep: acc?.sales_rep || '',
          region: acc?.region || '',
          targets: {},
          actuals: {},
          fcsts: {},
          fcstDetails: {},
          annualTarget: 0,
        };
      }
      result[accountId].actuals[m] = (result[accountId].actuals[m] || 0) + (o.order_amount || 0);
    });

    // 3. FCST → 월별 예측
    yearForecasts.forEach(f => {
      const accountId = f.account_id;
      if (!accountId) return;
      const m = f.month || quarterToMonth(f.period);
      if (!result[accountId]) {
        const acc = accounts.find(a => a.id === accountId);
        result[accountId] = {
          accountId,
          name: acc?.company_name || '',
          salesRep: acc?.sales_rep || '',
          region: acc?.region || '',
          targets: {},
          actuals: {},
          fcsts: {},
          fcstDetails: {},
          annualTarget: 0,
        };
      }
      result[accountId].fcsts[m] = (result[accountId].fcsts[m] || 0) + (f.forecast_amount || 0);
      if (!result[accountId].fcstDetails[m]) result[accountId].fcstDetails[m] = [];
      result[accountId].fcstDetails[m].push(f);
    });

    return result;
  }, [yearPlans, yearOrders, yearForecasts, accounts]);

  // 필터 적용
  const filteredData = useMemo(() => {
    let list = Object.values(customerData);
    if (filterRep) {
      list = list.filter(d => d.salesRep === filterRep);
    }
    if (!isAdmin && currentUser) {
      list = list.filter(d => d.salesRep === currentUser);
    }
    // 목표/실적/예측 중 하나라도 있는 것만
    list = list.filter(d => d.annualTarget > 0 || Object.keys(d.actuals).length > 0 || Object.keys(d.fcsts).length > 0);
    // 이름순 정렬
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }, [customerData, filterRep, isAdmin, currentUser]);

  // ── 전체 합계 ──
  const totals = useMemo(() => {
    const t = { targets: {}, actuals: {}, fcsts: {}, annualTarget: 0 };
    filteredData.forEach(d => {
      t.annualTarget += d.annualTarget;
      MONTHS.forEach(m => {
        t.targets[m] = (t.targets[m] || 0) + (d.targets[m] || 0);
        t.actuals[m] = (t.actuals[m] || 0) + (d.actuals[m] || 0);
        t.fcsts[m] = (t.fcsts[m] || 0) + (d.fcsts[m] || 0);
      });
    });
    return t;
  }, [filteredData]);

  // ── 분기 범위 표시 (현재 분기 + 인접) ──
  const currentQ = Math.ceil(CURRENT_MONTH / 3);
  const [displayQ, setDisplayQ] = useState(currentQ);
  const displayMonths = useMemo(() => {
    const start = (displayQ - 1) * 3 + 1;
    return [start, start + 1, start + 2];
  }, [displayQ]);

  // ── 담당자 목록 (사업계획 + teamMembers, 중앙화된 규칙) ──
  const repList = useMemo(() => {
    const sorted = getSortedValidReps({ businessPlans, teamMembers });
    return sorted.filter(name => Object.values(customerData).some(d => d.salesRep === name));
  }, [customerData, businessPlans, teamMembers]);

  // ── FCST 인라인 편집 ──
  const handleCellClick = useCallback((accountId, month) => {
    if (!isAdmin && currentUser) {
      // 담당자는 자기 고객만
      const d = customerData[accountId];
      if (d && d.salesRep !== currentUser) return;
    }
    setEditingCell({ accountId, month });
    const d = customerData[accountId];
    setEditValue(d?.fcsts[month] ? String(d.fcsts[month]) : '');
  }, [customerData, isAdmin, currentUser]);

  const handleCellSave = useCallback(() => {
    if (!editingCell) return;
    const { accountId, month } = editingCell;
    const amount = parseFloat(editValue) || 0;

    // 기존 해당 월 forecast 삭제 후 새로 저장
    const existing = customerData[accountId]?.fcstDetails[month] || [];
    existing.forEach(f => removeForecast(f.id));

    if (amount > 0) {
      saveForecast({
        id: genId('fcst'),
        account_id: accountId,
        year: viewYear,
        month: month,
        product_category: '',
        forecast_amount: amount,
        currency: 'KRW',
        order_month: `${viewYear}-${String(month).padStart(2, '0')}`,
        notes: '',
        created_at: today(),
      });
    }

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, customerData, viewYear, saveForecast, removeForecast]);

  const handleCellKeyDown = (e) => {
    if (e.key === 'Enter') handleCellSave();
    if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── 분기 합계 계산 ──
  function qSum(obj, months) {
    return months.reduce((s, m) => s + (obj[m] || 0), 0);
  }

  function cellColor(actual, target) {
    if (!target) return '';
    const p = (actual / target) * 100;
    if (p >= 100) return 'var(--green)';
    if (p >= 70) return 'var(--amber)';
    return 'var(--red)';
  }

  // 연간 합계
  function annualSum(obj) {
    return MONTHS.reduce((s, m) => s + (obj[m] || 0), 0);
  }

  return (
    <div style={{ padding: 0 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>수주목표관리 ({viewYear})</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 담당자 필터 */}
          {isAdmin && (
            <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
              <option value="">전체 담당자</option>
              {repList.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {/* 분기 선택 */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4].map(q => (
              <button key={q}
                className={`btn btn-sm ${displayQ === q ? 'btn-primary' : ''}`}
                onClick={() => setDisplayQ(q)}
                style={{ minWidth: 36 }}
              >Q{q}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
        <KpiCard label="연간 목표" value={fmtAmt(totals.annualTarget)} />
        <KpiCard label="확정수주 (YTD)" value={fmtAmt(annualSum(totals.actuals))} />
        <KpiCard label="FCST (잔여)" value={fmtAmt(MONTHS.filter(m => m > CURRENT_MONTH).reduce((s, m) => s + (totals.fcsts[m] || 0), 0))} />
        <KpiCard
          label="달성률 (YTD)"
          value={`${pct(annualSum(totals.actuals), totals.annualTarget)}%`}
          color={cellColor(annualSum(totals.actuals), totals.annualTarget)}
        />
        <KpiCard
          label="예상 달성률"
          value={`${pct(annualSum(totals.actuals) + MONTHS.filter(m => m > CURRENT_MONTH).reduce((s, m) => s + (totals.fcsts[m] || 0), 0), totals.annualTarget)}%`}
        />
      </div>

      {/* 메인 테이블 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: 11, whiteSpace: 'nowrap', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg3)', zIndex: 2, minWidth: 140 }}>고객사</th>
                <th style={{ minWidth: 50 }}>담당</th>
                {displayMonths.map(m => (
                  <th key={m} colSpan={4} style={{ textAlign: 'center', borderLeft: '2px solid var(--border)' }}>
                    {m}월 {m === CURRENT_MONTH && <span style={{ color: 'var(--accent)', fontSize: 9 }}>●</span>}
                  </th>
                ))}
                <th colSpan={4} style={{ textAlign: 'center', borderLeft: '2px solid var(--accent)', background: 'var(--accent-bg)' }}>
                  Q{displayQ} 합계
                </th>
                <th style={{ borderLeft: '2px solid var(--border)', textAlign: 'center' }}>연간목표</th>
                <th style={{ textAlign: 'center' }}>연간실적</th>
                <th style={{ textAlign: 'center' }}>GAP</th>
                <th style={{ textAlign: 'center' }}>달성률</th>
              </tr>
              <tr style={{ background: 'var(--bg2)', fontSize: 10 }}>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 2 }}></th>
                <th></th>
                {displayMonths.map(m => (
                  <SubHeaders key={m} month={m} />
                ))}
                <th style={{ textAlign: 'right', borderLeft: '2px solid var(--accent)', color: 'var(--text3)' }}>목표</th>
                <th style={{ textAlign: 'right', color: 'var(--text3)' }}>확정</th>
                <th style={{ textAlign: 'right', color: 'var(--text3)' }}>FCST</th>
                <th style={{ textAlign: 'right', color: 'var(--red)' }}>GAP</th>
                <th style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', color: 'var(--text3)' }}>목표</th>
                <th style={{ textAlign: 'right', color: 'var(--text3)' }}>확정</th>
                <th style={{ textAlign: 'right', color: 'var(--red)' }}>GAP</th>
                <th style={{ textAlign: 'right', color: 'var(--text3)' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(d => (
                <CustomerRow
                  key={d.accountId}
                  data={d}
                  displayMonths={displayMonths}
                  displayQ={displayQ}
                  editingCell={editingCell}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onCellClick={handleCellClick}
                  onCellSave={handleCellSave}
                  onCellKeyDown={handleCellKeyDown}
                  onNameClick={() => {
                    const acc = accounts.find(a => a.id === d.accountId);
                    if (acc) setEditingAccount(acc);
                  }}
                  qSum={qSum}
                  annualSum={annualSum}
                  cellColor={cellColor}
                  currentMonth={CURRENT_MONTH}
                />
              ))}

              {/* 합계 행 */}
              <tr style={{ fontWeight: 700, background: 'var(--bg3)', borderTop: '2px solid var(--accent)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--bg3)', zIndex: 2 }}>합계 ({filteredData.length}개사)</td>
                <td></td>
                {displayMonths.map(m => (
                  <TotalCells key={m} month={m} totals={totals} />
                ))}
                {(() => {
                  const qT = qSum(totals.targets, displayMonths), qA = qSum(totals.actuals, displayMonths), qF = qSum(totals.fcsts, displayMonths), qG = qT - qA - qF;
                  const yrA = annualSum(totals.actuals), yrF = annualSum(totals.fcsts), yrG = totals.annualTarget - yrA - yrF;
                  return (<>
                    <td style={{ textAlign: 'right', borderLeft: '2px solid var(--accent)', fontWeight: 700 }}>{fmtAmt(qT)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtAmt(qA)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtAmt(qF)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: qG > 0 ? 'var(--red)' : 'var(--green)' }}>{qG !== 0 ? fmtAmt(qG) : '-'}</td>
                    <td style={{ textAlign: 'right', borderLeft: '2px solid var(--border)' }}>{fmtAmt(totals.annualTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtAmt(yrA)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: yrG > 0 ? 'var(--red)' : 'var(--green)' }}>{yrG !== 0 ? fmtAmt(yrG) : '-'}</td>
                    <td style={{ textAlign: 'right', color: cellColor(yrA, totals.annualTarget) }}>
                      {pct(yrA, totals.annualTarget)}%
                    </td>
                  </>);
                })()}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 10, color: 'var(--text3)', flexWrap: 'wrap' }}>
        <span>목표: 사업계획</span>
        <span>확정: 접수된 수주</span>
        <span style={{ color: 'var(--accent)' }}>FCST: 클릭하여 예정수주 입력/수정</span>
        <span style={{ color: 'var(--green)' }}>● 100%+</span>
        <span style={{ color: 'var(--amber)' }}>● 70~99%</span>
        <span style={{ color: 'var(--red)' }}>● &lt;70%</span>
      </div>
    </div>
  );
}

/* ── Sub Components ── */

function KpiCard({ label, value, color }) {
  return (
    <div className="kpi" style={{ padding: '10px 12px' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 16, color: color || undefined }}>{value}</div>
    </div>
  );
}

function SubHeaders({ month }) {
  return (
    <>
      <th style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', color: 'var(--text3)' }}>목표</th>
      <th style={{ textAlign: 'right', color: 'var(--text3)' }}>확정</th>
      <th style={{ textAlign: 'right', color: 'var(--accent)', cursor: 'help' }} title="클릭하여 편집">FCST</th>
      <th style={{ textAlign: 'right', color: 'var(--red)', fontSize: 9 }}>GAP</th>
    </>
  );
}

function TotalCells({ month, totals }) {
  const gap = (totals.targets[month] || 0) - (totals.actuals[month] || 0) - (totals.fcsts[month] || 0);
  return (
    <>
      <td style={{ textAlign: 'right', borderLeft: '2px solid var(--border)' }}>{fmtAmt(totals.targets[month] || 0)}</td>
      <td style={{ textAlign: 'right' }}>{fmtAmt(totals.actuals[month] || 0)}</td>
      <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtAmt(totals.fcsts[month] || 0)}</td>
      <td style={{ textAlign: 'right', color: gap > 0 ? 'var(--red)' : 'var(--green)', fontSize: 10 }}>{gap !== 0 ? fmtAmt(gap) : '-'}</td>
    </>
  );
}

function CustomerRow({ data: d, displayMonths, displayQ, editingCell, editValue, setEditValue, onCellClick, onCellSave, onCellKeyDown, onNameClick, qSum, annualSum, cellColor, currentMonth }) {
  const qTarget = qSum(d.targets, displayMonths);
  const qActual = qSum(d.actuals, displayMonths);
  const qFcst = qSum(d.fcsts, displayMonths);
  const yrActual = annualSum(d.actuals);
  const yrPct = pct(yrActual, d.annualTarget);

  return (
    <tr>
      <td style={{ position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
        onClick={onNameClick}
        title="고객카드 열기"
      >
        <span style={{ borderBottom: '1px dashed var(--accent)', color: 'var(--accent)' }}>
          {(d.name || '').length > 16 ? d.name.slice(0, 16) + '…' : d.name}
        </span>
      </td>
      <td style={{ fontSize: 10, color: 'var(--text3)' }}>{d.salesRep}</td>
      {displayMonths.map(m => {
        const isEditing = editingCell?.accountId === d.accountId && editingCell?.month === m;
        const isPast = m < currentMonth;
        const isCurrent = m === currentMonth;
        return (
          <MonthCells
            key={m}
            month={m}
            target={d.targets[m] || 0}
            actual={d.actuals[m] || 0}
            fcst={d.fcsts[m] || 0}
            isEditing={isEditing}
            editValue={editValue}
            setEditValue={setEditValue}
            onCellClick={() => onCellClick(d.accountId, m)}
            onCellSave={onCellSave}
            onCellKeyDown={onCellKeyDown}
            isPast={isPast}
            isCurrent={isCurrent}
          />
        );
      })}
      {/* Q 합계 */}
      <td style={{ textAlign: 'right', borderLeft: '2px solid var(--accent)', background: 'var(--accent-bg)', fontSize: 11 }}>{fmtAmt(qTarget)}</td>
      <td style={{ textAlign: 'right', background: 'var(--accent-bg)', fontSize: 11, fontWeight: 600 }}>{fmtAmt(qActual)}</td>
      <td style={{ textAlign: 'right', background: 'var(--accent-bg)', fontSize: 11, color: 'var(--accent)' }}>{fmtAmt(qFcst)}</td>
      {(() => { const qGap = qTarget - qActual - qFcst; return (
        <td style={{ textAlign: 'right', background: 'var(--accent-bg)', fontSize: 10, color: qTarget > 0 && qGap > 0 ? 'var(--red)' : qGap < 0 ? 'var(--green)' : 'var(--text4)', fontWeight: 600 }}>
          {qTarget > 0 && qGap !== 0 ? fmtAmt(qGap) : '-'}
        </td>
      ); })()}
      {/* 연간 */}
      {(() => { const yrFcst = annualSum(d.fcsts); const yrGap = d.annualTarget - yrActual - yrFcst; return (<>
        <td style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', fontSize: 11 }}>{fmtAmt(d.annualTarget)}</td>
        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtAmt(yrActual)}</td>
        <td style={{ textAlign: 'right', fontSize: 10, color: d.annualTarget > 0 && yrGap > 0 ? 'var(--red)' : yrGap < 0 ? 'var(--green)' : 'var(--text4)', fontWeight: 600 }}>
          {d.annualTarget > 0 && yrGap !== 0 ? fmtAmt(yrGap) : '-'}
        </td>
        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: cellColor(yrActual, d.annualTarget) }}>
          {d.annualTarget > 0 ? `${yrPct}%` : '-'}
        </td>
      </>); })()}
    </tr>
  );
}

function MonthCells({ month, target, actual, fcst, isEditing, editValue, setEditValue, onCellClick, onCellSave, onCellKeyDown, isPast, isCurrent }) {
  const gap = target - actual - fcst;
  return (
    <>
      <td style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', fontSize: 10, color: 'var(--text3)' }}>
        {target ? fmtAmt(target) : '-'}
      </td>
      <td style={{
        textAlign: 'right', fontSize: 10, fontWeight: actual ? 600 : 400,
        background: isCurrent ? 'rgba(59,130,246,.04)' : undefined,
      }}>
        {actual ? fmtAmt(actual) : '-'}
      </td>
      <td
        style={{
          textAlign: 'right', fontSize: 10, color: 'var(--accent)',
          cursor: 'pointer', position: 'relative',
          background: isEditing ? 'var(--accent-bg)' : (isCurrent ? 'rgba(59,130,246,.04)' : undefined),
          minWidth: 60,
        }}
        onClick={!isEditing ? onCellClick : undefined}
        title="클릭하여 FCST 입력/수정"
      >
        {isEditing ? (
          <input
            type="number"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={onCellSave}
            onKeyDown={onCellKeyDown}
            autoFocus
            style={{
              width: '100%', fontSize: 10, padding: '1px 4px', textAlign: 'right',
              border: '1.5px solid var(--accent)', borderRadius: 3, outline: 'none',
              background: 'white',
            }}
            placeholder="금액"
          />
        ) : (
          fcst ? fmtAmt(fcst) : <span style={{ color: 'var(--text4)', fontSize: 9 }}>+</span>
        )}
      </td>
      <td style={{ textAlign: 'right', fontSize: 9, color: target > 0 && gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--green)' : 'var(--text4)' }}>
        {target > 0 && gap !== 0 ? fmtAmt(gap) : '-'}
      </td>
    </>
  );
}

function quarterToMonth(period) {
  if (period === 'Q1') return 1;
  if (period === 'Q2') return 4;
  if (period === 'Q3') return 7;
  if (period === 'Q4') return 10;
  return 1;
}
