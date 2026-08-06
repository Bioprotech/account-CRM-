import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { REGIONS, CUSTOMER_TYPE_GUIDE, STRATEGIC_TIERS } from '../lib/constants';
import { daysSince, scoreColorClass, today } from '../lib/utils';
import { classifyCustomers, classifyForRepView, loadPriorYearCustomers, syncPriorYearFromSettings } from '../lib/customerClassification';
import { getSortedValidReps } from '../lib/salesReps';
import { computeScore } from '../lib/scoring';
import { filterValidOrders } from '../lib/aggregation';
import { aggregateConversionByRep } from '../lib/contractConversion';
import { getValidSalesReps } from '../lib/salesReps';
import { analyzeLossReasons, analyzeActivityOutcomes, analyzeForecastAccuracy, aggregateHealthScores } from '../lib/reportInsights';

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

/**
 * v3.34 — 📊 보고서 인사이트 카드 (Loss Reason / Activity ROI / FCST 정확도 / Health Score)
 *   영업본부 명세서(CRM_보완_개발_명세_v1.md) P0~P2 항목을 한 카드에 통합
 */
function ReportInsightsCard({ accounts, businessPlans, ordersAll, activityLogs, forecasts, setEditingAccount, isAdmin }) {
  const lossReason = useMemo(() => analyzeLossReasons(accounts, businessPlans, ordersAll), [accounts, businessPlans, ordersAll]);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const actOutcomes = useMemo(() => analyzeActivityOutcomes(activityLogs, currentMonth), [activityLogs, currentMonth]);
  const fcstAcc = useMemo(() => analyzeForecastAccuracy(forecasts, ordersAll, accounts, 6), [forecasts, ordersAll, accounts]);
  const health = useMemo(() => aggregateHealthScores(accounts, ordersAll, activityLogs, forecasts), [accounts, ordersAll, activityLogs, forecasts]);

  const [expanded, setExpanded] = useState(null);

  // 안 보일 케이스: 데이터 거의 없으면 skip
  if (lossReason.totalUnder === 0 && actOutcomes.totalTagged === 0 && fcstAcc.totalEvaluable === 0 && health.results.length === 0) return null;

  const lossColor = lossReason.inputRate >= 80 ? 'var(--green, #16a34a)' : lossReason.inputRate >= 50 ? '#d97706' : 'var(--red)';

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid #6d28d9', padding: 12, background: 'linear-gradient(135deg, rgba(109,40,217,0.04), rgba(46,125,50,0.03))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ fontSize: 14, color: '#6d28d9' }}>📊 보고서 인사이트 (Loss Reason · Activity ROI · FCST 정확도 · Health Score)</strong>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>월간 보고서 분석용 — 본부 KPI</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {/* ① Loss Reason 입력률 */}
        <div style={kpiCardStyle('rgba(220,38,38,0.05)')}>
          <div style={kpiHeaderStyle}>🔴 Loss Reason 입력률</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: lossColor }}>{lossReason.inputRate}%</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{lossReason.filled} / {lossReason.totalUnder} 미달 고객</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            80% 미달 고객의 원인+회복가능성 입력 완료 비율
          </div>
          {lossReason.totalUnder - lossReason.filled > 0 && (
            <button onClick={() => setExpanded(expanded === 'loss' ? null : 'loss')} style={smBtn}>
              {expanded === 'loss' ? '▲ 닫기' : `▼ 미입력 ${lossReason.totalUnder - lossReason.filled}건 보기`}
            </button>
          )}
        </div>

        {/* ⑥ Activity ROI (이번 달) */}
        <div style={kpiCardStyle('rgba(46,125,50,0.05)')}>
          <div style={kpiHeaderStyle}>🎯 Activity ROI (이번 달)</div>
          {actOutcomes.totalTagged === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>활동에 outcome 태그가 없음<br />→ Activity 추가 시 outcome 선택</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                태깅 활동 <strong>{actOutcomes.totalTagged}</strong>건
              </div>
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {Object.entries(actOutcomes.byRep).slice(0, 4).map(([rep, r]) => (
                  <div key={rep} style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{rep}</span>
                    <span style={{ fontWeight: 600, color: r.roi >= 30 ? 'var(--green, #16a34a)' : r.roi >= 10 ? '#d97706' : 'var(--red)' }}>
                      WON {r.won}/{r.total} = <strong>{r.roi}%</strong>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ② Forecast Accuracy (담당자별) */}
        <div style={kpiCardStyle('rgba(37,99,235,0.05)')}>
          <div style={kpiHeaderStyle}>🔮 FCST 정확도 (6개월 평균)</div>
          {fcstAcc.totalEvaluable === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>과거 6개월 평가 가능한 FCST 없음</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>평가 {fcstAcc.totalEvaluable}건</div>
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {Object.values(fcstAcc.repAccuracy).sort((a, b) => b.avgAccuracy - a.avgAccuracy).slice(0, 5).map(r => (
                  <div key={r.rep} style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.rep} ({r.count}건)</span>
                    <span style={{ fontWeight: 600, color: r.avgAccuracy >= 80 ? 'var(--green, #16a34a)' : r.avgAccuracy >= 60 ? '#d97706' : 'var(--red)' }}>
                      {r.avgAccuracy}%
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>※ 3개월 예측 가중치에 자동 반영 예정</div>
            </>
          )}
        </div>

        {/* ⑦ Customer Health Score */}
        <div style={kpiCardStyle('rgba(217,119,6,0.05)')}>
          <div style={kpiHeaderStyle}>❤️ Health Score 분포</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span style={gradeChip('var(--green, #16a34a)')}>A {health.dist.A}</span>
            <span style={gradeChip('#2563eb')}>B {health.dist.B}</span>
            <span style={gradeChip('#d97706')}>C {health.dist.C}</span>
            <span style={gradeChip('var(--red)')}>D {health.dist.D}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            ⚠ 위험(C/D): <strong>{health.atRisk.length}</strong>사
          </div>
          {health.atRisk.length > 0 && (
            <button onClick={() => setExpanded(expanded === 'health' ? null : 'health')} style={smBtn}>
              {expanded === 'health' ? '▲ 닫기' : `▼ 위험 ${health.atRisk.length}사 보기`}
            </button>
          )}
        </div>
      </div>

      {/* 펼침: Loss Reason 미입력 고객 */}
      {expanded === 'loss' && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--bg2)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Loss Reason 미입력 미달 고객 ({lossReason.totalUnder - lossReason.filled}건)</div>
          <div style={{ display: 'grid', gap: 3, maxHeight: 220, overflow: 'auto' }}>
            {lossReason.underTargetAccounts.filter(x => !x.fullyFilled).map(x => {
              const missing = [];
              if (x.causes.length === 0) missing.push('원인');
              if (!x.cause_detail) missing.push('상세');
              if (!x.recoverability) missing.push('회복가능성');
              if (x.causes.includes('competition') && !x.competitor_name) missing.push('경쟁사명');
              return (
                <div key={x.account.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 6px', background: 'var(--bg)', borderRadius: 3 }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditingAccount(x.account); }} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', minWidth: 160 }}>
                    {x.account.company_name}
                  </a>
                  <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>달성률 {Math.round(x.achieveRate * 100)}%</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>담당: {x.account.sales_rep || '미배정'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--red)' }}>누락: {missing.join(', ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 펼침: Health 위험 고객 */}
      {expanded === 'health' && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--bg2)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Health Score 위험 고객 (C/D 등급)</div>
          <div style={{ display: 'grid', gap: 3, maxHeight: 240, overflow: 'auto' }}>
            {health.atRisk.slice(0, 20).map(x => (
              <div key={x.account.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 6px', background: 'var(--bg)', borderRadius: 3 }}>
                <span style={gradeChip(x.health.grade === 'C' ? '#d97706' : 'var(--red)')}>{x.health.grade}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{x.health.normalizedScore}점</span>
                <a href="#" onClick={(e) => { e.preventDefault(); setEditingAccount(x.account); }} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', minWidth: 160 }}>
                  {x.account.company_name}
                </a>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{x.account.sales_rep || '미배정'}</span>
                {x.health.alerts.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--red)' }}>{x.health.alerts.join(' · ')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const kpiCardStyle = (bg) => ({
  background: bg, padding: 10, borderRadius: 6, border: '1px solid var(--border)',
});
const kpiHeaderStyle = {
  fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--text2)',
};
const smBtn = {
  marginTop: 4, padding: '2px 8px', fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
};
const gradeChip = (color) => ({
  fontSize: 10, padding: '2px 8px', borderRadius: 10, background: color, color: '#fff', fontWeight: 700,
});

/**
 * v3.32 — 🎯 계약전환율 KPI 카드 (Dashboard 상단, 사이드바 메뉴 대체)
 *   전환 = account.contract_status === '활성' (기존 필드 활용)
 *   거래종료(customer_category === 'inactive')는 분모에서 자동 제외
 *   본부장: 전체 / 담당자: 본인 행만
 *   펼침: 미달 고객 리스트 + 인라인 상태 변경 (권한 있을 때)
 */
function ConversionKpiCard({ accounts, businessPlans, teamMembers, currentUser, isAdmin, setEditingAccount, saveAccount, t }) {
  const [expandedRep, setExpandedRep] = useState(null);

  const validReps = useMemo(() => getValidSalesReps(businessPlans, teamMembers), [businessPlans, teamMembers]);
  const byRep = useMemo(() => aggregateConversionByRep(accounts, validReps), [accounts, validReps]);
  const repList = useMemo(() => Object.values(byRep).sort((a, b) => b.total - a.total), [byRep]);
  const totals = useMemo(() => repList.reduce((acc, r) => ({
    total: acc.total + r.total,
    converted: acc.converted + r.converted,
    pending: acc.pending + r.pending,
  }), { total: 0, converted: 0, pending: 0 }), [repList]);

  if (totals.total === 0) return null;
  const totalRate = Math.round((totals.converted / totals.total) * 100);
  const rateColor = totalRate >= 50 ? 'var(--green, #16a34a)' : totalRate >= 30 ? '#d97706' : 'var(--red)';
  const displayRows = (!isAdmin && currentUser) ? repList.filter(r => r.rep === currentUser) : repList;

  const handleStatusChange = async (account, newStatus) => {
    const canEdit = isAdmin || (account.sales_rep === currentUser);
    if (!canEdit) {
      alert(t ? t('dashboard.onlyOwnerEdit') : '담당자 또는 본부장만 변경 가능합니다');
      return;
    }
    await saveAccount({ ...account, contract_status: newStatus });
  };

  const tt = t || ((k) => k);

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--accent)', padding: 12, background: 'linear-gradient(135deg, rgba(46,125,50,0.04), rgba(37,99,235,0.04))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{tt('dashboard.conversionTitle')}</strong>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{tt('dashboard.conversionSubtitle')}</span>
        {isAdmin && (
          <>
            <span style={{ fontSize: 28, fontWeight: 800, color: rateColor, marginLeft: 8 }}>{totalRate}%</span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{tt('dashboard.converted')} {totals.converted} / {tt('dashboard.pending')} {totals.pending} / {tt('dashboard.totalCustomers')} {totals.total}</span>
          </>
        )}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {displayRows.map(r => {
          const rc = r.conversionRate >= 50 ? 'var(--green, #16a34a)' : r.conversionRate >= 30 ? '#d97706' : 'var(--red)';
          const expanded = expandedRep === r.rep;
          const pendingList = r.accounts.filter(a => !a.converted);
          return (
            <div key={r.rep}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px', background: 'var(--bg)', borderRadius: 4 }}>
                <span style={{ minWidth: 80, fontWeight: 700 }}>{r.rep}</span>
                <div style={{ flex: 1, height: 10, background: 'var(--bg2)', borderRadius: 5, overflow: 'hidden', maxWidth: 240 }}>
                  <div style={{ width: `${r.conversionRate}%`, height: '100%', background: rc }} />
                </div>
                <span style={{ minWidth: 50, fontSize: 13, fontWeight: 700, color: rc, textAlign: 'right' }}>{r.conversionRate}%</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {tt('dashboard.converted')} <strong>{r.converted}</strong> / {tt('dashboard.pending')} <strong style={{ color: 'var(--red)' }}>{r.pending}</strong> / {tt('dashboard.totalCustomers')} <strong>{r.total}</strong>
                </span>
                {pendingList.length > 0 && (
                  <button
                    onClick={() => setExpandedRep(expanded ? null : r.rep)}
                    style={{ marginLeft: 'auto', padding: '2px 10px', fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                  >
                    {expanded ? `▲ ${tt('dashboard.closePending')}` : `▼ ${tt('dashboard.viewPending', { n: pendingList.length })}`}
                  </button>
                )}
              </div>
              {expanded && pendingList.length > 0 && (
                <div style={{ marginLeft: 16, marginTop: 4, marginBottom: 8, padding: 8, background: 'var(--bg2)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>
                    {r.rep} 담당 미달 {pendingList.length}개 — 계약 상태 인라인 변경 가능
                  </div>
                  <div style={{ display: 'grid', gap: 3, maxHeight: 240, overflow: 'auto' }}>
                    {pendingList.map(it => {
                      const acc = accounts.find(a => a.id === it.id);
                      const canEdit = isAdmin || (acc && acc.sales_rep === currentUser);
                      return (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 6px', background: 'var(--bg)', borderRadius: 3 }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); if (acc) setEditingAccount(acc); }}
                            style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', minWidth: 180 }}>
                            {it.name}
                          </a>
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{tt('dashboard.currentStatus')}: {tt(`contractStatus.${({'활성':'active','만료':'expired','만료임박':'expiringSoon','협상중':'negotiating','없음':'none'})[it.status] || 'none'}`)}</span>
                          {canEdit ? (
                            <select
                              value={it.status}
                              onChange={e => handleStatusChange(acc, e.target.value)}
                              style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 4px' }}
                              title="Active = formal contract / annual guarantee / regular forecast"
                            >
                              <option value="없음">{tt('contractStatus.none')}</option>
                              <option value="협상중">{tt('contractStatus.negotiating')}</option>
                              <option value="만료임박">{tt('contractStatus.expiringSoon')}</option>
                              <option value="만료">{tt('contractStatus.expired')}</option>
                              <option value="활성">{tt('contractStatus.active')} ({tt('dashboard.converted')})</option>
                            </select>
                          ) : (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{tt('dashboard.onlyOwnerEdit')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * v3.17 Phase D — 점수 카드 (담당자 1명)
 *   100점 만점 시각화 + 영업성과/품질/감점 분해
 */
function ScoreCardSection({ rep, accounts, activityLogs, orders, businessPlans, yearMonth: yearMonthProp }) {
  const yearMonth = yearMonthProp || new Date().toISOString().slice(0, 7);
  const result = useMemo(
    () => computeScore({ rep, accounts, activityLogs, orders, businessPlans, yearMonth }),
    [rep, accounts, activityLogs, orders, businessPlans, yearMonth]
  );
  const [expanded, setExpanded] = useState(false);

  const grade = result.total >= 90 ? { label: 'S', color: '#16a34a' }
    : result.total >= 75 ? { label: 'A', color: '#16a34a' }
    : result.total >= 60 ? { label: 'B', color: '#d97706' }
    : result.total >= 40 ? { label: 'C', color: '#dc2626' }
    : { label: 'D', color: '#7f1d1d' };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${grade.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 4 }}>
        {/* 큰 점수 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>이번 달 활동 점수</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: grade.color, lineHeight: 1 }}>{result.total}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>/ 100점</div>
        </div>
        {/* 영업 성과 + 품질 + 감점 분해 */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ padding: '6px 10px', background: 'rgba(46,125,50,0.08)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>🔵 영업 성과</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{result.performance} <span style={{ fontSize: 10, color: 'var(--text3)' }}>/ 60</span></div>
          </div>
          <div style={{ padding: '6px 10px', background: 'rgba(22,163,74,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>🟢 CRM 활동 품질</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{result.quality} <span style={{ fontSize: 10, color: 'var(--text3)' }}>/ 40</span></div>
          </div>
          <div style={{ padding: '6px 10px', background: result.deduction > 0 ? 'rgba(220,38,38,0.06)' : 'var(--bg2)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>🔴 감점</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: result.deduction > 0 ? 'var(--red)' : 'var(--text3)' }}>
              {result.deduction > 0 ? `−${result.deduction}` : '0'} <span style={{ fontSize: 10, color: 'var(--text3)' }}>/ 20</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded(p => !p)}
          style={{ fontSize: 11, padding: '6px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
        >
          {expanded ? '▲ 접기' : '▼ 항목별 상세'}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {/* 항목별 점수표 */}
          <table className="data-table" style={{ fontSize: 11, marginBottom: 8 }}>
            <thead>
              <tr>
                <th>항목</th>
                <th style={{ textAlign: 'right' }}>점수</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>2-1. 당월 수주 달성률</td>
                <td style={{ textAlign: 'right', color: result.breakdown.monthly.score === 30 ? 'var(--green, #16a34a)' : 'var(--text)' }}>{result.breakdown.monthly.score}/30</td>
                <td>달성률 {result.breakdown.monthly.pct}% (목표 100%↑→30 / 80%↑→18 / 60%↑→8 / 미만→0)</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>2-2. YTD 진도</td>
                <td style={{ textAlign: 'right', color: result.breakdown.ytd.score === 20 ? 'var(--green, #16a34a)' : 'var(--text)' }}>{result.breakdown.ytd.score}/20</td>
                <td>YTD {result.breakdown.ytd.pct}% (100%↑→20 / 80%↑→12 / 60%↑→6 / 미만→0)</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>2-3. 전월 대비 개선</td>
                <td style={{ textAlign: 'right' }}>{result.breakdown.mom.score}/10</td>
                <td>{result.breakdown.mom.deltaPp >= 0 ? '+' : ''}{result.breakdown.mom.deltaPp}%p (10%p↑→10 / 5%p↑→5 / 미만→0)</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>3-1. 고객당 월 접촉 빈도</td>
                <td style={{ textAlign: 'right' }}>{result.breakdown.contact.score}/10</td>
                <td>{result.breakdown.contact.freq}회 (담당 {result.breakdown.contact.accountCount}사 / 활동 {result.breakdown.contact.activityCount}건)</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>3-2. 이슈 해결률</td>
                <td style={{ textAlign: 'right' }}>{result.breakdown.resolve.score}/10</td>
                <td>{result.breakdown.resolve.rate !== null ? `${result.breakdown.resolve.rate}% (${result.breakdown.resolve.resolvedCount}/${result.breakdown.resolve.openedCount})` : result.breakdown.resolve._note}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>3-3. 14일+ 미해결</td>
                <td style={{ textAlign: 'right' }}>{result.breakdown.overdue.score}/10</td>
                <td>{result.breakdown.overdue.count}건 (0건→10 / 1-2→6 / 3-4→2 / 5건↑→0)</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>3-4. GAP 원인 입력</td>
                <td style={{ textAlign: 'right' }}>{result.breakdown.gapDetail.score}/5</td>
                <td>{result.breakdown.gapDetail.fillRate !== null ? `${result.breakdown.gapDetail.fillRate}% (${result.breakdown.gapDetail.filledCount}/${result.breakdown.gapDetail.shortfallCount}사)` : result.breakdown.gapDetail._note}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>3-5. A등급 30일 내 접촉</td>
                <td style={{ textAlign: 'right' }}>{result.breakdown.aTier.score}/5</td>
                <td>{result.breakdown.aTier._note || `A등급 ${result.breakdown.aTier.totalATier}사 중 ${result.breakdown.aTier.missCount}사 미접촉`}</td>
              </tr>
              {/* 감점 항목 */}
              {result.breakdown.zeroWeek.deduction > 0 && (
                <tr style={{ color: 'var(--red)' }}>
                  <td style={{ fontWeight: 600 }}>4-1. 주간 활동 0건</td>
                  <td style={{ textAlign: 'right' }}>−{result.breakdown.zeroWeek.deduction}</td>
                  <td>0건 주 {result.breakdown.zeroWeek.zeroWeeks}회 발생 (출장/전시회 태그 시 예외)</td>
                </tr>
              )}
              {result.breakdown.aTier45.deduction > 0 && (
                <tr style={{ color: 'var(--red)' }}>
                  <td style={{ fontWeight: 600 }}>4-2. A등급 45일+ 미접촉</td>
                  <td style={{ textAlign: 'right' }}>−{result.breakdown.aTier45.deduction}</td>
                  <td>{result.breakdown.aTier45.missCount}사: {(result.breakdown.aTier45.missList || []).slice(0, 3).join(', ')}{(result.breakdown.aTier45.missList || []).length > 3 ? ` 외 ${result.breakdown.aTier45.missList.length - 3}사` : ''}</td>
                </tr>
              )}
              {result.breakdown.gapMissing.applied && (
                <tr style={{ color: 'var(--red)' }}>
                  <td style={{ fontWeight: 600 }}>4-3. GAP 원인 미분류</td>
                  <td style={{ textAlign: 'right' }}>−{result.breakdown.gapMissing.deduction}</td>
                  <td>미달 고객 중 cause_detail 미입력 1사 이상</td>
                </tr>
              )}
              {result.breakdown.falseInput.applied && (
                <tr style={{ color: 'var(--red)' }}>
                  <td style={{ fontWeight: 600 }}>4-4. 허위 입력 의심</td>
                  <td style={{ textAlign: 'right' }}>−{result.breakdown.falseInput.deduction}</td>
                  <td>동일 날짜 3건+ 유사도 90%+ 탐지</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
            ※ 점수 산정 기준: 매월 말일 23:59 CRM 데이터 · {yearMonth} 기준 · 사양서 v1.0
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * v3.17 Phase D — 팀 점수 종합표 (관리자 + 전체 시점)
 */
function TeamScoreboard({ teamMembers, accounts, activityLogs, orders, businessPlans, yearMonth: yearMonthProp }) {
  const yearMonth = yearMonthProp || new Date().toISOString().slice(0, 7);
  const scores = useMemo(() => {
    return (teamMembers || []).map(rep => ({
      rep,
      ...computeScore({ rep, accounts, activityLogs, orders, businessPlans, yearMonth }),
    })).sort((a, b) => b.total - a.total);
  }, [teamMembers, accounts, activityLogs, orders, businessPlans, yearMonth]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span>📊 담당자 활동 점수 (이번 달, {yearMonth})</span>
        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
          — 100점 만점 (영업 성과 60 + CRM 품질 40 - 감점 max 20) · 사양서 v1.0
        </span>
      </div>
      <div className="table-wrap">
        <table className="data-table" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th>담당자</th>
              <th style={{ textAlign: 'right' }}>총점</th>
              <th style={{ textAlign: 'right' }}>영업성과 (60)</th>
              <th style={{ textAlign: 'right' }}>CRM 품질 (40)</th>
              <th style={{ textAlign: 'right' }}>감점</th>
              <th style={{ textAlign: 'right' }}>당월 달성</th>
              <th style={{ textAlign: 'right' }}>YTD 진도</th>
              <th style={{ textAlign: 'right' }}>해결률</th>
              <th style={{ textAlign: 'right' }}>14일+ 미해결</th>
            </tr>
          </thead>
          <tbody>
            {scores.map(s => {
              const totalColor = s.total >= 90 ? '#16a34a' : s.total >= 75 ? '#16a34a' : s.total >= 60 ? '#d97706' : s.total >= 40 ? '#dc2626' : '#7f1d1d';
              return (
                <tr key={s.rep}>
                  <td style={{ fontWeight: 600 }}>{s.rep}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: totalColor }}>{s.total}</td>
                  <td style={{ textAlign: 'right' }}>{s.performance}</td>
                  <td style={{ textAlign: 'right' }}>{s.quality}</td>
                  <td style={{ textAlign: 'right', color: s.deduction > 0 ? 'var(--red)' : 'var(--text3)' }}>
                    {s.deduction > 0 ? `−${s.deduction}` : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{s.breakdown?.monthly?.pct ?? 0}%</td>
                  <td style={{ textAlign: 'right' }}>{s.breakdown?.ytd?.pct ?? 0}%</td>
                  <td style={{ textAlign: 'right' }}>{s.breakdown?.resolve?.rate ?? '-'}{s.breakdown?.resolve?.rate !== null ? '%' : ''}</td>
                  <td style={{ textAlign: 'right', color: (s.breakdown?.overdue?.count ?? 0) > 0 ? 'var(--red)' : 'var(--text3)' }}>
                    {s.breakdown?.overdue?.count ?? 0}건
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * v3.15 — YTD 진도율 헬퍼
 * 사업계획의 월별 targets[01..12] 합산을 기준으로 "현재월까지 정상 진도"를 판단
 *
 * @param {Array} plans - 사업계획 plan 배열 (해당 카테고리만)
 * @param {number} actualYTD - YTD 실적 합계
 * @returns {{ ytdTarget, ytdActual, shortage, surplus, progressPct, status, statusLabel, statusColor }}
 *   - progressPct: YTD실적 / YTD목표 × 100
 *   - status: 'on_track' | 'caution' | 'behind' | 'no_target'
 *   - shortage: 미달액 (양수면 부족, 0이면 달성/초과)
 *   - surplus: 초과액
 */
function computeYtdProgress(plans, actualYTD) {
  let ytdTarget = 0;
  (plans || []).forEach(p => {
    if (!p?.targets) return;
    for (let m = 1; m <= CURRENT_MONTH; m++) {
      ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
    }
  });
  const ytdActual = actualYTD || 0;
  const diff = ytdActual - ytdTarget;
  const shortage = diff < 0 ? Math.abs(diff) : 0;
  const surplus = diff >= 0 ? diff : 0;
  const progressPct = ytdTarget > 0 ? Math.round((ytdActual / ytdTarget) * 100) : 0;

  let status = 'on_track';
  let statusLabel = '정상';
  let statusColor = 'var(--green, #16a34a)';
  if (ytdTarget <= 0) {
    status = 'no_target';
    statusLabel = '목표 없음';
    statusColor = 'var(--text3)';
  } else if (progressPct >= 100) {
    status = 'on_track';
    statusLabel = '정상';
    statusColor = 'var(--green, #16a34a)';
  } else if (progressPct >= 80) {
    status = 'caution';
    statusLabel = '주의';
    statusColor = '#d97706';
  } else {
    status = 'behind';
    statusLabel = '위험';
    statusColor = 'var(--red)';
  }

  return { ytdTarget, ytdActual, shortage, surplus, progressPct, status, statusLabel, statusColor };
}

/**
 * v3.15 — 진도율 표시용 작은 컴포넌트 (인라인 표시)
 * "진도 94% 🟢정상 · YTD목표 720억 vs 실적 681억 (▼39억)"
 */
function YtdProgressBadge({ ytdTarget, ytdActual, shortage, surplus, progressPct, statusLabel, statusColor, compact = false }) {
  if (ytdTarget <= 0) {
    return <span style={{ fontSize: 10, color: 'var(--text3)' }}>YTD 목표 없음</span>;
  }
  if (compact) {
    return (
      <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>
        진도 {progressPct}% {statusLabel}
        {shortage > 0 && <span> · ▼{fmtKRW(shortage)}</span>}
      </span>
    );
  }
  return (
    <div style={{ fontSize: 10, color: statusColor, fontWeight: 600, lineHeight: 1.4 }}>
      <span>진도 {progressPct}% · {statusLabel}</span>
      <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
        (YTD목표 {fmtKRW(ytdTarget)} vs 실적 {fmtKRW(ytdActual)})
      </span>
      {shortage > 0 && (
        <div style={{ color: 'var(--red)', fontWeight: 700 }}>
          ▼ Shortage {fmtKRW(shortage)}
        </div>
      )}
      {surplus > 0 && progressPct > 100 && (
        <div style={{ color: 'var(--green, #16a34a)', fontWeight: 700 }}>
          ▲ Surplus {fmtKRW(surplus)} (목표 초과 달성)
        </div>
      )}
    </div>
  );
}

/**
 * v3.37 — 📊 수주현황 분석 (Excel 수주현황_분석 형태)
 * 고객별 연간계획 / YTD계획 / YTD실적 / 전년YTD / 계획대비 / 전년대비
 * 섹션: 해외 계획고객 / 해외신규기타 / 국내 계획고객 / 국내기타신규 / BPU
 */
function OrderAnalysisCard({ accounts, businessPlans, orders }) {
  const CUR_YEAR = new Date().getFullYear();
  const CUR_MONTH = new Date().getMonth() + 1;
  const [openSections, setOpenSections] = useState({});
  const toggleSec = (k) => setOpenSections(p => ({ ...p, [k]: !p[k] }));

  // 연간/YTD 사업계획 조회
  const customerPlansAll = useMemo(() =>
    businessPlans.filter(p => p.year === CUR_YEAR && (p.type === 'customer' || !p.type)),
    [businessPlans, CUR_YEAR]
  );

  const ytdPlanFor = (plan) => {
    if (!plan?.targets) return 0;
    let s = 0;
    for (let m = 1; m <= CUR_MONTH; m++) s += (plan.targets[String(m).padStart(2, '0')] || 0);
    return s;
  };

  const curOrders = useMemo(() => orders.filter(o => (o.order_date || '').startsWith(String(CUR_YEAR))), [orders, CUR_YEAR]);
  const prevOrders = useMemo(() => orders.filter(o => (o.order_date || '').startsWith(String(CUR_YEAR - 1))), [orders, CUR_YEAR]);

  // 계획 인덱스
  const planByAccId = useMemo(() => { const m = {}; customerPlansAll.forEach(p => { if (p.account_id) m[p.account_id] = p; }); return m; }, [customerPlansAll]);
  const planByName = useMemo(() => { const m = {}; customerPlansAll.forEach(p => { if (p.customer_name) m[p.customer_name.toLowerCase().trim()] = p; }); return m; }, [customerPlansAll]);

  // 수주 집계 (account_id 기준, 없으면 customer_name)
  const sumOrders = (orderList, accountId, customerName) => {
    let s = 0;
    orderList.forEach(o => {
      const mm = parseInt((o.order_date || '').slice(5, 7), 10);
      if (mm < 1 || mm > CUR_MONTH) return;
      if ((accountId && o.account_id === accountId) ||
          (!accountId && customerName && (o.customer_name || '').toLowerCase().trim() === customerName.toLowerCase().trim())) {
        s += (o.order_amount || 0);
      }
    });
    return s;
  };

  // 분석 데이터 산출
  const data = useMemo(() => {
    const sections = { '해외계획': [], '해외신규기타': [], '국내계획': [], '국내기타신규': [], 'BPU': [] };
    const processedIds = new Set();

    // 사업계획 고객 처리
    customerPlansAll.forEach(plan => {
      const accId = plan.account_id;
      const accName = plan.customer_name || '';
      const acc = accId ? accounts.find(a => a.id === accId) : accounts.find(a => (a.company_name || '').toLowerCase().trim() === accName.toLowerCase().trim());
      if (acc) processedIds.add(acc.id);

      const annualPlan = plan.annual_target || 0;
      const ytdPlan = ytdPlanFor(plan);
      const ytdActual = sumOrders(curOrders, accId, accName);
      const priorYtd = sumOrders(prevOrders, accId, accName);
      const cat = acc?.customer_category || '';
      const isBPU = accName.toUpperCase().includes('BPU') || (cat || '').toUpperCase().includes('BPU');
      const isOverseas = cat.startsWith('해외') || (!cat && acc && !/[가-힣]/.test(acc.company_name || ''));
      const displayName = acc?.company_name || accName;

      const item = { name: displayName, annualPlan, ytdPlan, ytdActual, priorYtd, gapPlan: ytdActual - ytdPlan, gapPrior: ytdActual - priorYtd };

      if (isBPU) sections['BPU'].push(item);
      else if (isOverseas) sections['해외계획'].push(item);
      else sections['국내계획'].push(item);
    });

    // 계획 없는 고객 (수주 발생)
    const unplanned = {};
    [...curOrders, ...prevOrders].forEach(o => {
      const acc = accounts.find(a => a.id === o.account_id);
      if (acc && processedIds.has(acc.id)) return;
      const name = o.customer_name || acc?.company_name || '';
      if (!name) return;
      if (!unplanned[name]) {
        const cat = acc?.customer_category || '';
        unplanned[name] = {
          name, accId: acc?.id, cat,
          isBPU: name.toUpperCase().includes('BPU') || cat.toUpperCase().includes('BPU'),
          isOverseas: cat.startsWith('해외') || (!cat && acc && !/[가-힣]/.test(name)),
        };
      }
    });

    Object.values(unplanned).forEach(u => {
      const ytdActual = sumOrders(curOrders, u.accId, u.name);
      const priorYtd = sumOrders(prevOrders, u.accId, u.name);
      if (ytdActual === 0 && priorYtd === 0) return;
      const item = { name: u.name, annualPlan: 0, ytdPlan: 0, ytdActual, priorYtd, gapPlan: ytdActual, gapPrior: ytdActual - priorYtd };
      if (u.isBPU) sections['BPU'].push(item);
      else if (u.isOverseas) sections['해외신규기타'].push(item);
      else sections['국내기타신규'].push(item);
    });

    // 정렬 + 소계
    const labels = { '해외계획': '▶ 해외 계획고객', '해외신규기타': '▶ 해외신규/기타', '국내계획': '▶ 국내 계획고객', '국내기타신규': '▶ 국내 기타/신규', 'BPU': '▶ BPU' };
    const result = [];
    let grand = { annualPlan: 0, ytdPlan: 0, ytdActual: 0, priorYtd: 0, gapPlan: 0, gapPrior: 0 };

    Object.entries(sections).forEach(([key, items]) => {
      if (items.length === 0) return;
      items.sort((a, b) => (b.annualPlan || b.ytdActual) - (a.annualPlan || a.ytdActual));
      const sub = items.reduce((acc, it) => ({
        annualPlan: acc.annualPlan + it.annualPlan, ytdPlan: acc.ytdPlan + it.ytdPlan,
        ytdActual: acc.ytdActual + it.ytdActual, priorYtd: acc.priorYtd + it.priorYtd,
        gapPlan: acc.gapPlan + it.gapPlan, gapPrior: acc.gapPrior + it.gapPrior,
      }), { annualPlan: 0, ytdPlan: 0, ytdActual: 0, priorYtd: 0, gapPlan: 0, gapPrior: 0 });
      result.push({ key, label: labels[key], items, sub });
      Object.keys(grand).forEach(k => { grand[k] += sub[k]; });
    });

    return { result, grand };
  }, [accounts, customerPlansAll, curOrders, prevOrders, CUR_MONTH]);

  const fmtB = (n) => {
    if (!n && n !== 0) return '-';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(1) + '억';
    if (abs >= 1e4) return sign + Math.round(abs / 1e4).toLocaleString() + '만';
    return n.toLocaleString();
  };
  const gapStyle = (v) => ({ color: v >= 0 ? 'var(--green,#16a34a)' : 'var(--red)', fontWeight: 600 });
  const pctStyle = (a, b) => {
    if (!b) return { color: 'var(--text3)' };
    const p = Math.round((a / b) * 100);
    return { color: p >= 100 ? 'var(--green,#16a34a)' : p >= 80 ? '#d97706' : 'var(--red)', fontWeight: 600 };
  };
  const pctLabel = (a, b) => b ? Math.round((a / b) * 100) + '%' : '-';

  if (data.result.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>📊 수주현황 분석 (YTD ~{CUR_MONTH}월)</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
          연간계획 / YTD계획({CUR_MONTH}월까지) / YTD실적 / 전년YTD / 계획대비 · 단위: 억원
        </span>
      </div>
      <div className="table-wrap">
        <table className="data-table" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 180, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>고객명</th>
              <th style={{ textAlign: 'right', minWidth: 80 }}>연간계획</th>
              <th style={{ textAlign: 'right', minWidth: 75 }}>YTD계획</th>
              <th style={{ textAlign: 'right', minWidth: 75 }}>YTD실적</th>
              <th style={{ textAlign: 'right', minWidth: 60 }}>달성률</th>
              <th style={{ textAlign: 'right', minWidth: 75 }}>전년YTD</th>
              <th style={{ textAlign: 'right', minWidth: 75 }}>계획대비</th>
              <th style={{ textAlign: 'right', minWidth: 75 }}>전년대비</th>
            </tr>
          </thead>
          <tbody>
            {data.result.map(({ key, label, items, sub }) => (
              <>
                {/* 섹션 헤더 행 (소계 포함) */}
                <tr key={`sec-${key}`} style={{ background: 'var(--bg2)', cursor: 'pointer' }} onClick={() => toggleSec(key)}>
                  <td style={{ fontWeight: 700, color: 'var(--accent)', position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>
                    {openSections[key] ? '▼' : '▶'} {label.replace('▶ ', '')} ({items.length}사)
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtB(sub.annualPlan)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtB(sub.ytdPlan)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmtB(sub.ytdActual)}</td>
                  <td style={{ textAlign: 'right', ...pctStyle(sub.ytdActual, sub.ytdPlan) }}>{pctLabel(sub.ytdActual, sub.ytdPlan)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text3)', fontWeight: 600 }}>{fmtB(sub.priorYtd)}</td>
                  <td style={{ textAlign: 'right', ...gapStyle(sub.gapPlan) }}>{sub.gapPlan >= 0 ? '+' : ''}{fmtB(sub.gapPlan)}</td>
                  <td style={{ textAlign: 'right', ...gapStyle(sub.gapPrior) }}>{sub.gapPrior >= 0 ? '+' : ''}{fmtB(sub.gapPrior)}</td>
                </tr>
                {/* 펼침: 고객별 행 */}
                {openSections[key] && items.map((it, idx) => (
                  <tr key={`${key}-${idx}`} style={{ fontSize: 10 }}>
                    <td style={{ paddingLeft: 20, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>{it.name}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtB(it.annualPlan)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtB(it.ytdPlan)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtB(it.ytdActual)}</td>
                    <td style={{ textAlign: 'right', ...pctStyle(it.ytdActual, it.ytdPlan) }}>{pctLabel(it.ytdActual, it.ytdPlan)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtB(it.priorYtd)}</td>
                    <td style={{ textAlign: 'right', ...gapStyle(it.gapPlan) }}>{it.gapPlan >= 0 ? '+' : ''}{fmtB(it.gapPlan)}</td>
                    <td style={{ textAlign: 'right', ...gapStyle(it.gapPrior) }}>{it.gapPrior >= 0 ? '+' : ''}{fmtB(it.gapPrior)}</td>
                  </tr>
                ))}
              </>
            ))}
            {/* 전체 합계 */}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700, background: 'rgba(46,125,50,0.06)', fontSize: 12 }}>
              <td style={{ fontWeight: 800, position: 'sticky', left: 0, background: 'rgba(46,125,50,0.06)', zIndex: 1 }}>▶ 전체 합계</td>
              <td style={{ textAlign: 'right' }}>{fmtB(data.grand.annualPlan)}</td>
              <td style={{ textAlign: 'right' }}>{fmtB(data.grand.ytdPlan)}</td>
              <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtB(data.grand.ytdActual)}</td>
              <td style={{ textAlign: 'right', ...pctStyle(data.grand.ytdActual, data.grand.ytdPlan) }}>{pctLabel(data.grand.ytdActual, data.grand.ytdPlan)}</td>
              <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtB(data.grand.priorYtd)}</td>
              <td style={{ textAlign: 'right', ...gapStyle(data.grand.gapPlan) }}>{data.grand.gapPlan >= 0 ? '+' : ''}{fmtB(data.grand.gapPlan)}</td>
              <td style={{ textAlign: 'right', ...gapStyle(data.grand.gapPrior) }}>{data.grand.gapPrior >= 0 ? '+' : ''}{fmtB(data.grand.gapPrior)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 6 }}>
        ※ 섹션 클릭 → 고객별 상세 펼침 · 계획=사업계획 YTD목표(1~{CUR_MONTH}월) · 전년=전년도 동기간 · ProMES 수주 기준
      </div>
    </div>
  );
}

export default function Dashboard() {
  const accountCtx = useAccount();
  const { visibleAccounts, activityLogs, openIssues, alarms, setEditingAccount, setCurrentTab, accounts, orders: ordersAll, businessPlans, forecasts, contracts, saveAccount, showToast, appSettings, teamMembers, t } = accountCtx;

  // v3.18: 단일 집계 함수 (lib/aggregation.js) 사용
  const orders = useMemo(() => filterValidOrders(ordersAll), [ordersAll]);
  // v3.17 Phase D: 관리자가 viewAsRep 설정 시 그 담당자처럼 동작
  const currentUser = accountCtx.effectiveCurrentUser ?? accountCtx.currentUser;
  const isAdmin = accountCtx.effectiveIsAdmin ?? accountCtx.isAdmin;
  const viewAsRep = accountCtx.viewAsRep;

  // v3.21: 담당자 활동 점수 비교 월 (이번 달 ~ 5달 전 선택 가능)
  const [scoreYearMonth, setScoreYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ value: ym, label: i === 0 ? `${ym} (이번 달)` : `${ym}` });
    }
    return opts;
  }, []);

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

  // v3.15.1: 카드별 펼치기 토글 (상위 N건 + 클릭 시 전체)
  const [expandedCards, setExpandedCards] = useState({});
  const toggleCardExpand = (key) => setExpandedCards(prev => ({ ...prev, [key]: !prev[key] }));

  // ── 담당자별 데이터 필터링 ──
  // 대시보드는 엄격 필터: sales_rep === currentUser인 고객만 (미배정 고객 제외)
  // 관리자/미로그인은 전체
  // v3.32: 거래종료(customer_category === 'inactive') 고객은 모든 카드(긴급/전략등급/체크리스트 등)에서 자동 제외
  const myAccounts = useMemo(() => {
    const base = (isAdmin || !currentUser) ? visibleAccounts : accounts.filter(a => a.sales_rep === currentUser);
    return base.filter(a => a?.customer_category !== 'inactive');
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
    myBusinessPlans.filter(p => p.year === CURRENT_YEAR && (p.type === 'customer' || !p.type)),
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

  // ── v3.15.1: 목표미달 고객 (YTD 기준으로 변경)
  //   기존: 연간 목표 - 실적 - FCST → 5월 시점에 연말까지 부족분이 표시되어 비현실적
  //   변경: 사업계획의 1~현재월 누적 (ytdTarget) - YTD 실적 → 현재 시점 진도 부족분
  const gapWarningAccounts = useMemo(() => {
    if (!hasPlan) return [];
    const result = [];
    customerPlans.forEach(p => {
      if (!p.account_id) return;
      const acc = myAccounts.find(a => a.id === p.account_id);
      if (!acc) return;
      // YTD 목표 = 1~CURRENT_MONTH 월별 목표 합산
      let ytdTarget = 0;
      if (p.targets) {
        for (let m = 1; m <= CURRENT_MONTH; m++) {
          ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
        }
      }
      if (ytdTarget <= 0) return;
      // YTD 실적 = 1~CURRENT_MONTH 사이 수주
      const ytdActual = yearOrders
        .filter(o => {
          const mm = (o.order_date || '').slice(5, 7);
          return o.account_id === p.account_id && mm && parseInt(mm, 10) <= CURRENT_MONTH;
        })
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const gap = ytdTarget - ytdActual;
      if (gap > 0) {
        // 참고용: 연간 누적, FCST도 별도로 보관
        const annualTarget = p.annual_target || 0;
        const fcst = forecasts.filter(f => f.account_id === p.account_id && f.year === CURRENT_YEAR).reduce((s, f) => s + (f.forecast_amount || 0), 0);
        result.push({
          account: acc,
          ytdTarget, ytdActual, gap,
          annualTarget, fcst,
          pct: Math.round((ytdActual / ytdTarget) * 100),
        });
      }
    });
    result.sort((a, b) => b.gap - a.gap);
    return result;
  }, [customerPlans, yearOrders, forecasts, myAccounts, hasPlan]);

  // 지역별 목표 vs 실적 + v3.15: ytdTarget (1~currentMonth 누적)
  const regionStats = useMemo(() => {
    const map = {};
    REGIONS.forEach(r => { map[r] = { count: 0, target: 0, ytdTarget: 0, actual: 0 }; });

    myAccounts.forEach(a => {
      if (a.region && map[a.region]) map[a.region].count++;
    });

    if (hasPlan) {
      customerPlans.forEach(p => {
        const region = p.region || '';
        if (!map[region]) map[region] = { count: 0, target: 0, ytdTarget: 0, actual: 0 };
        map[region].target += (p.annual_target || 0);
        // v3.15: ytdTarget = 1~CURRENT_MONTH 월별 목표 합산
        if (p.targets) {
          for (let m = 1; m <= CURRENT_MONTH; m++) {
            map[region].ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
          }
        }
      });
      yearOrders.forEach(o => {
        const plan = findPlanForOrder(o);
        const region = plan?.region || o.region || '';
        if (map[region]) map[region].actual += (o.order_amount || 0);
        else {
          const acc = accounts.find(a => a.id === o.account_id);
          const r = acc?.region || '';
          if (!map[r]) map[r] = { count: 0, target: 0, ytdTarget: 0, actual: 0 };
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

    // 사업계획 담당자 + teamMembers 초기화 (v3.15: ytdTarget 추가)
    validReps.forEach(r => { map[r] = { count: 0, target: 0, ytdTarget: 0, actual: 0, isBucket: false }; });
    // 버킷 4종 초기화
    ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => {
      map[k] = { count: 0, target: 0, ytdTarget: 0, actual: 0, isBucket: true, isNew: k.endsWith('신규') };
    });

    if (hasPlan) {
      customerPlans.forEach(p => {
        const name = (p.customer_name || '').trim();
        // v3.15: ytdTarget 합산용
        let pYtd = 0;
        if (p.targets) {
          for (let m = 1; m <= CURRENT_MONTH; m++) {
            pYtd += (p.targets[String(m).padStart(2, '0')] || 0);
          }
        }
        // 버킷 플랜 → 해당 버킷 target에 반영
        if (bucketNames.includes(name)) {
          let key = null;
          if (name === '해외기타') key = '해외기타';
          else if (name === '국내 기타') key = '국내기타';
          else if (name === '국내 신규') key = '국내신규';
          if (key && map[key]) {
            map[key].target += (p.annual_target || 0);
            map[key].ytdTarget += pYtd;
          }
          return;
        }
        const rep = p.sales_rep || '미배정';
        if (!map[rep]) map[rep] = { count: 0, target: 0, ytdTarget: 0, actual: 0, isBucket: false };
        map[rep].target += (p.annual_target || 0);
        map[rep].ytdTarget += pYtd;
      });

      // 신 분류 체계로 실적 배분
      const planByName = {};
      const planByAccountId = {};  // v3.9: 퍼지매칭 결과 활용
      customerPlans.forEach(p => {
        if (!p.customer_name) return;
        if (bucketNames.includes(p.customer_name.trim())) return;
        planByName[p.customer_name.toLowerCase().trim()] = p;
        if (p.account_id && !planByAccountId[p.account_id]) {
          planByAccountId[p.account_id] = p;
        }
      });
      yearOrders.forEach(o => {
        const acc = o.account_id ? accounts.find(a => a.id === o.account_id)
          : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (o.customer_name || '').toLowerCase().trim()) || null;
        const { rep } = classifyForRepView({
          account: acc,
          customerName: o.customer_name || acc?.company_name,
          planByName,
          planByAccountId,
          priorSet: priorYearSet,
        });
        if (!rep) return;
        if (!map[rep]) map[rep] = { count: 0, target: 0, ytdTarget: 0, actual: 0, isBucket: false };
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

  // 구분(사업형태)별 목표 vs 실적 + v3.15: ytdTarget
  const bizTypeStats = useMemo(() => {
    if (!hasPlan) return {};
    const map = {};

    customerPlans.forEach(p => {
      const biz = p.biz_type || '기타';
      if (!map[biz]) map[biz] = { count: 0, target: 0, ytdTarget: 0, actual: 0 };
      map[biz].target += (p.annual_target || 0);
      if (p.targets) {
        for (let m = 1; m <= CURRENT_MONTH; m++) {
          map[biz].ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
        }
      }
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = myAccounts.find(a => a.id === o.account_id) || accounts.find(a => a.id === o.account_id);
      const biz = plan?.biz_type || acc?.business_type || '기타';
      if (!map[biz]) map[biz] = { count: 0, target: 0, ytdTarget: 0, actual: 0 };
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
      if (!map[product]) map[product] = { target: 0, ytdTarget: 0, actual: 0 };
      map[product].target += (p.annual_target || 0);
      if (p.targets) {
        for (let m = 1; m <= CURRENT_MONTH; m++) {
          map[product].ytdTarget += (p.targets[String(m).padStart(2, '0')] || 0);
        }
      }
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

  // v3.46: 이번 주 + 기한초과 액션플랜
  const pendingActions = useMemo(() => {
    const todayStr = today();
    const d = new Date();
    const diffToMon = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const wkStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon).toISOString().slice(0, 10);
    const wkEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon + 6).toISOString().slice(0, 10);
    const result = [];
    myOpenIssues.forEach(l => {
      const acc = accounts.find(a => a.id === l.account_id);
      const logActions = l.next_actions?.length
        ? l.next_actions
        : (l.next_action ? [{ text: l.next_action, date: l.due_date || '' }] : []);
      logActions.forEach((a, idx) => {
        if (!a.text || !a.date || a.date > wkEnd) return;
        result.push({
          key: l.id + '_' + idx,
          company: acc?.company_name || '?',
          action: a.text,
          date: a.date,
          rep: l.sales_rep,
          account: acc,
          isOverdue: a.date < wkStart,
          isTodayOrSoon: a.date >= wkStart && a.date <= todayStr,
        });
      });
    });
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [myOpenIssues, accounts]);

  // v3.47: 주간 활동 현황판 (이번 주 완료 + 차주 예정 액션)
  const weeklyStatus = useMemo(() => {
    const d = new Date();
    const diffToMon = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const wkStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon).toISOString().slice(0, 10);
    const wkEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon + 6).toISOString().slice(0, 10);
    const nwkStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon + 7).toISOString().slice(0, 10);
    const nwkEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon + 13).toISOString().slice(0, 10);

    const thisWeekActs = (myActivityLogs || [])
      .filter(l => l.date >= wkStart && l.date <= wkEnd)
      .map(l => {
        const acc = accounts.find(a => a.id === l.account_id);
        return { ...l, company: acc?.company_name || '?', rep: acc?.sales_rep || l.sales_rep || '' };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const nextWeekActions = [];
    (myActivityLogs || []).forEach(l => {
      const acc = accounts.find(a => a.id === l.account_id);
      const logActions = l.next_actions?.length
        ? l.next_actions
        : (l.next_action ? [{ text: l.next_action, date: l.due_date || '' }] : []);
      logActions.forEach((a, idx) => {
        if (!a.text || !a.date || a.date < nwkStart || a.date > nwkEnd) return;
        nextWeekActions.push({
          key: l.id + '_' + idx,
          company: acc?.company_name || '?',
          action: a.text,
          date: a.date,
          rep: acc?.sales_rep || l.sales_rep || '',
          account: acc,
        });
      });
    });
    nextWeekActions.sort((a, b) => a.date.localeCompare(b.date));

    // 담당자별 집계 (관리자용)
    const byRep = {};
    [...thisWeekActs, ...nextWeekActions.map(a => ({ ...a, _isAction: true }))].forEach(item => {
      const r = item.rep || '미배정';
      if (!byRep[r]) byRep[r] = { acts: [], actions: [] };
      if (item._isAction) byRep[r].actions.push(item);
      else byRep[r].acts.push(item);
    });

    return { thisWeekActs, nextWeekActions, byRep, wkStart, wkEnd, nwkStart, nwkEnd };
  }, [myActivityLogs, accounts]);

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
    const plans = businessPlans.filter(p => p.year === currentYear && (p.type === 'customer' || !p.type) && p.sales_rep);
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

    const needSync = accounts.filter(a => repMap[a.id] && a.sales_rep !== repMap[a.id] && !a.rep_locked);
    const lockedCount = accounts.filter(a => repMap[a.id] && a.sales_rep !== repMap[a.id] && a.rep_locked).length;
    return { repMap, needSync, lockedCount, total: Object.keys(repMap).length };
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
            <strong>{t('dashboard.syncNeeded')}:</strong> <strong style={{ color: 'var(--red)' }}>{syncInfo.needSync.length}</strong> — {t('dashboard.syncDesc')}
            {syncInfo.lockedCount > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--amber)' }}>🔒 {syncInfo.lockedCount}개 고객은 직접 지정 잠금 (동기화 제외)</span>
            )}
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              {t('dashboard.syncHint')}
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing} style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
            {syncing ? t('dashboard.syncing') : `${syncInfo.needSync.length}${t('dashboard.syncBtn')}`}
          </button>
        </div>
      )}

      {/* 담당자 표시 */}
      {currentUser && !isAdmin && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'rgba(46,125,50,.06)', borderRadius: 8, border: '1px solid rgba(46,125,50,.15)', fontSize: 12, color: 'var(--text2)' }}>
          👤 <strong>{currentUser}</strong>{t('user.welcome')}
        </div>
      )}

      {/* v3.17 Phase D: 관리자 시점 변경 안내 배너 */}
      {viewAsRep && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'rgba(245,158,11,0.1)', borderRadius: 8, border: '2px solid #d97706', fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>👀</span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#d97706' }}>{t('user.viewingAs')}</strong>
            <span style={{ marginLeft: 6 }}>
              — <strong>{viewAsRep}</strong>{t('user.viewingAsDesc')}
            </span>
          </div>
        </div>
      )}

      {/* 긴급 알람 */}
      {urgentAccounts.length > 0 && (
        <div className="alert-banner danger">
          <span>🔴</span>
          <strong>{t('dashboard.urgentAlarm')}:</strong> {t('dashboard.urgentAlarmDesc')} — {urgentAccounts.length}
          <span style={{ marginLeft: 'auto', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setCurrentTab('accounts')}>{t('dashboard.viewList')}</span>
        </div>
      )}

      {/* v3.32: 🎯 계약전환율 KPI 카드 (금년 영업 핵심 TASK) — 사이드바 메뉴 제거 후 Dashboard에만 표시 */}
      <ConversionKpiCard
        accounts={accounts}
        businessPlans={businessPlans}
        teamMembers={teamMembers}
        currentUser={currentUser}
        isAdmin={isAdmin}
        setEditingAccount={setEditingAccount}
        saveAccount={saveAccount}
        t={t}
      />

      {/* v3.37: 📊 수주현황 분석 (Excel 형태 — 고객별 YTD 계획대비/전년대비) */}
      <OrderAnalysisCard
        accounts={accounts}
        businessPlans={businessPlans}
        orders={orders}
      />

      {/* v3.34: 📊 보고서 인사이트 카드 (Loss Reason / Activity ROI / FCST 정확도 / Health Score) */}
      {isAdmin && (
        <ReportInsightsCard
          accounts={accounts}
          businessPlans={businessPlans}
          ordersAll={ordersAll}
          activityLogs={activityLogs}
          forecasts={forecasts}
          setEditingAccount={setEditingAccount}
          isAdmin={isAdmin}
        />
      )}


      {/* v3.21: 담당자 활동 점수 — 월 선택 드롭다운 (월단위 비교 가능) */}
      {((currentUser && !isAdmin) || (isAdmin && viewAsRep) || (isAdmin && !viewAsRep && teamMembers && teamMembers.length > 0)) && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('dashboard.activityScoreMonth')}:</span>
          <select
            value={scoreYearMonth}
            onChange={(e) => setScoreYearMonth(e.target.value)}
            style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }}
          >
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>
            {t('dashboard.activityScoreHint')}
          </span>
        </div>
      )}

      {/* v3.17 Phase D: 담당자별 점수 카드 (개별 담당자 또는 viewAsRep 시 표시) */}
      {(currentUser && !isAdmin) && (
        <ScoreCardSection
          rep={currentUser}
          accounts={accounts}
          activityLogs={activityLogs}
          orders={orders}
          businessPlans={businessPlans}
          yearMonth={scoreYearMonth}
        />
      )}
      {/* 관리자 + viewAsRep: 그 담당자 점수 */}
      {(isAdmin && viewAsRep) && (
        <ScoreCardSection
          rep={viewAsRep}
          accounts={accounts}
          activityLogs={activityLogs}
          orders={orders}
          businessPlans={businessPlans}
          yearMonth={scoreYearMonth}
        />
      )}
      {/* 관리자 (전체 시점): 전 담당자 점수 표 */}
      {(isAdmin && !viewAsRep && teamMembers && teamMembers.length > 0) && (
        <TeamScoreboard
          teamMembers={teamMembers}
          accounts={accounts}
          activityLogs={activityLogs}
          orders={orders}
          businessPlans={businessPlans}
          yearMonth={scoreYearMonth}
        />
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

      {/* v3.46: 이번 주 액션 마감 카드 */}
      {pendingActions.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--red, #dc2626)' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>📅 이번 주 액션 마감 ({pendingActions.length}건)</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — 이번 주 기한 도래 + 기한 초과 액션플랜
            </span>
          </div>
          <div className="issue-list">
            {pendingActions.slice(0, 15).map(item => (
              <div
                key={item.key}
                className="issue-row"
                style={{ cursor: item.account ? 'pointer' : 'default', background: item.isOverdue ? 'rgba(220,38,38,0.04)' : undefined }}
                onClick={() => item.account && setEditingAccount(item.account)}
              >
                <span style={{ fontSize: 13, marginRight: 4 }}>{item.isOverdue ? '🔴' : item.isTodayOrSoon ? '🟡' : '🟢'}</span>
                <span className="issue-company">{item.company}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>{item.action}</span>
                <span style={{ fontSize: 10, color: item.isOverdue ? 'var(--red, #dc2626)' : 'var(--text3)', fontWeight: item.isOverdue ? 700 : 400, marginLeft: 8 }}>
                  {item.isOverdue ? '⚠ 기한초과 ' : ''}{item.date}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>{item.rep}</span>
              </div>
            ))}
          </div>
          {pendingActions.length > 15 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 6 }}>... 외 {pendingActions.length - 15}건 더</div>
          )}
        </div>
      )}

      {/* v3.47: 주간 활동 현황판 */}
      {(weeklyStatus.thisWeekActs.length > 0 || weeklyStatus.nextWeekActions.length > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📊 주간 활동 현황판</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* 이번 주 완료 활동 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>
                이번 주 완료 활동 ({weeklyStatus.thisWeekActs.length}건)
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginLeft: 4 }}>{weeklyStatus.wkStart} ~ {weeklyStatus.wkEnd}</span>
              </div>
              {weeklyStatus.thisWeekActs.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>이번 주 활동 없음</div>
              ) : isAdmin ? (
                Object.entries(weeklyStatus.byRep).filter(([, v]) => v.acts.length > 0)
                  .sort((a, b) => b[1].acts.length - a[1].acts.length)
                  .map(([rep, v]) => (
                    <div key={rep} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, marginBottom: 3 }}>
                        {rep} <span style={{ fontWeight: 400, color: 'var(--accent)' }}>({v.acts.length}건)</span>
                      </div>
                      {v.acts.slice(0, 3).map(l => (
                        <div key={l.id} className="issue-row" style={{ cursor: 'pointer', fontSize: 11 }}
                          onClick={() => { const acc = accounts.find(a => a.id === l.account_id); if (acc) setEditingAccount(acc); }}>
                          <span className="issue-company" style={{ minWidth: 60, maxWidth: 80 }}>{l.company}</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{(l.content || '내용 없음').slice(0, 30)}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{l.date}</span>
                        </div>
                      ))}
                      {v.acts.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>... 외 {v.acts.length - 3}건</div>}
                    </div>
                  ))
              ) : (
                <div className="issue-list">
                  {weeklyStatus.thisWeekActs.slice(0, 8).map(l => (
                    <div key={l.id} className="issue-row" style={{ cursor: 'pointer' }}
                      onClick={() => { const acc = accounts.find(a => a.id === l.account_id); if (acc) setEditingAccount(acc); }}>
                      <span className="issue-company">{l.company}</span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(l.content || '내용 없음').slice(0, 35)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{l.date}</span>
                    </div>
                  ))}
                  {weeklyStatus.thisWeekActs.length > 8 && <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>... 외 {weeklyStatus.thisWeekActs.length - 8}건</div>}
                </div>
              )}
            </div>
            {/* 차주 예정 액션 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text2)' }}>
                차주 예정 액션 ({weeklyStatus.nextWeekActions.length}건)
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginLeft: 4 }}>{weeklyStatus.nwkStart} ~ {weeklyStatus.nwkEnd}</span>
              </div>
              {weeklyStatus.nextWeekActions.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>차주 예정 액션 없음</div>
              ) : isAdmin ? (
                Object.entries(weeklyStatus.byRep).filter(([, v]) => v.actions.length > 0)
                  .sort((a, b) => b[1].actions.length - a[1].actions.length)
                  .map(([rep, v]) => (
                    <div key={rep} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, marginBottom: 3 }}>
                        {rep} <span style={{ fontWeight: 400, color: 'var(--text3)' }}>({v.actions.length}건)</span>
                      </div>
                      {v.actions.slice(0, 3).map(a => (
                        <div key={a.key} className="issue-row" style={{ cursor: 'pointer', fontSize: 11 }}
                          onClick={() => a.account && setEditingAccount(a.account)}>
                          <span className="issue-company" style={{ minWidth: 60, maxWidth: 80 }}>{a.company}</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.action.slice(0, 30)}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{a.date}</span>
                        </div>
                      ))}
                      {v.actions.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>... 외 {v.actions.length - 3}건</div>}
                    </div>
                  ))
              ) : (
                <div className="issue-list">
                  {weeklyStatus.nextWeekActions.slice(0, 8).map(a => (
                    <div key={a.key} className="issue-row" style={{ cursor: 'pointer' }}
                      onClick={() => a.account && setEditingAccount(a.account)}>
                      <span className="issue-company">{a.company}</span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action.slice(0, 35)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{a.date}</span>
                    </div>
                  ))}
                  {weeklyStatus.nextWeekActions.length > 8 && <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>... 외 {weeklyStatus.nextWeekActions.length - 8}건</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alarms */}
      {myAlarms.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>🔔 알람 ({myAlarms.length.toLocaleString()}건)</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — 트리거: 🔴Score&lt;50%+미접촉30일 · 🟡계약만료D-60 · 🔵FCST/🟢사업계획/🟡트렌드 재구매임박 · 🟡Open이슈14일+ · 사업형태별 미실행
            </span>
          </div>
          {/* v3.15.1: 상위 15건 + "전체 보기" 펼치기 (danger 우선) */}
          {(() => {
            const sorted = [...myAlarms].sort((a, b) => {
              const order = { danger: 0, warning: 1, info: 2 };
              return (order[a.level] ?? 3) - (order[b.level] ?? 3);
            });
            const isExpanded = expandedCards.alarms;
            const visible = isExpanded ? sorted : sorted.slice(0, 15);
            return (
              <>
                <div className="issue-list" style={{ maxHeight: isExpanded ? 480 : 'auto' }}>
                  {visible.map((alarm, i) => (
                    <div key={i} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(alarm.account)}>
                      <span style={{ fontSize: 14, marginRight: 4 }}>{alarm.level === 'danger' ? '🔴' : alarm.level === 'info' ? '🔵' : '🟡'}</span>
                      <span className="issue-company">{alarm.account?.company_name || '?'}</span>
                      <span style={{ fontSize: 11, color: alarm.level === 'danger' ? 'var(--red)' : alarm.level === 'info' ? 'var(--accent)' : 'var(--yellow)' }}>{alarm.msg}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{alarm.account?.sales_rep}</span>
                    </div>
                  ))}
                </div>
                {sorted.length > 15 && (
                  <button
                    onClick={() => toggleCardExpand('alarms')}
                    style={{ width: '100%', textAlign: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 0', fontSize: 11, fontWeight: 600, marginTop: 8, cursor: 'pointer', color: 'var(--accent)' }}
                  >
                    {isExpanded ? '▲ 접기' : `▼ 전체 ${sorted.length}건 보기 (외 ${sorted.length - 15}건 더)`}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Open 이슈 + 긴급 고객 */}
      <div className="two-col">
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>📋 Open 이슈 ({myOpenIssues.length.toLocaleString()}건)</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — Activity Log status ≠ Closed (담당자가 닫지 않은 모든 활동)
            </span>
          </div>
          {recentOpenIssues.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--green)' }}>진행 중인 이슈가 없습니다</p>
            </div>
          ) : (() => {
            // v3.15.1: 상위 10건 + 펼치기
            const isExpanded = expandedCards.openIssues;
            const visible = isExpanded ? recentOpenIssues : recentOpenIssues.slice(0, 10);
            return (
              <>
                <div className="issue-list" style={{ maxHeight: isExpanded ? 360 : 'auto' }}>
                  {visible.map(log => (
                    <div key={log.id} className="issue-row">
                      <span className="issue-company">{log.company_name}</span>
                      <span className={`issue-badge ${log.issue_type?.replace('·', '')}`}>{log.issue_type}</span>
                      <span className={`status-badge ${log.status === 'Open' ? 'open' : 'in-progress'}`}>{log.status}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{log.date}</span>
                    </div>
                  ))}
                </div>
                {recentOpenIssues.length > 10 && (
                  <button
                    onClick={() => toggleCardExpand('openIssues')}
                    style={{ width: '100%', textAlign: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 0', fontSize: 11, fontWeight: 600, marginTop: 8, cursor: 'pointer', color: 'var(--accent)' }}
                  >
                    {isExpanded ? '▲ 접기' : `▼ 전체 ${recentOpenIssues.length}건 보기`}
                  </button>
                )}
              </>
            );
          })()}
        </div>

        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>🔴 긴급 관리 대상 ({urgentAccounts.length.toLocaleString()}사)</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — Insight Score &lt; 50% AND 미접촉 30일+ (한번이라도 입력된 계정만)
            </span>
          </div>
          {urgentAccounts.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--green)' }}>긴급 대상 없음</p>
            </div>
          ) : (() => {
            // v3.15.1: 상위 10건 + 펼치기
            const isExpanded = expandedCards.urgent;
            const visible = isExpanded ? urgentAccounts : urgentAccounts.slice(0, 10);
            return (
              <>
                <div className="issue-list" style={{ maxHeight: isExpanded ? 360 : 'auto' }}>
                  {visible.map(a => {
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
                {urgentAccounts.length > 10 && (
                  <button
                    onClick={() => toggleCardExpand('urgent')}
                    style={{ width: '100%', textAlign: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 0', fontSize: 11, fontWeight: 600, marginTop: 8, cursor: 'pointer', color: 'var(--accent)' }}
                  >
                    {isExpanded ? '▲ 접기' : `▼ 전체 ${urgentAccounts.length}사 보기`}
                  </button>
                )}
              </>
            );
          })()}
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
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>⚠️ Watch 알람 ({(watchAccounts.length + lowInsightAccounts.filter(a => a.strategic_tier !== 'D').length).toLocaleString()}사)</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — 🔴D등급 (수익축소·대체재탐색 등) OR 🟡Insight 진척률 &lt; 30%
            </span>
          </div>
          {watchAccounts.length === 0 && lowInsightAccounts.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--green)' }}>Watch 대상 없음</p>
            </div>
          ) : (() => {
            // v3.15.1: D등급 6건 + 진척률 낮음 6건 + 펼치기
            const isExpanded = expandedCards.watch;
            const watchVisible = isExpanded ? watchAccounts : watchAccounts.slice(0, 6);
            const lowInsightFiltered = lowInsightAccounts.filter(a => a.strategic_tier !== 'D');
            const lowVisible = isExpanded ? lowInsightFiltered : lowInsightFiltered.slice(0, 6);
            const totalWatch = watchAccounts.length + lowInsightFiltered.length;
            const visibleCount = watchVisible.length + lowVisible.length;
            return (
              <>
                <div className="issue-list" style={{ maxHeight: isExpanded ? 480 : 'auto' }}>
                  {watchVisible.map(a => {
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
              {lowVisible.map(a => {
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
                {totalWatch > visibleCount && (
                  <button
                    onClick={() => toggleCardExpand('watch')}
                    style={{ width: '100%', textAlign: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 0', fontSize: 11, fontWeight: 600, marginTop: 8, cursor: 'pointer', color: 'var(--accent)' }}
                  >
                    {isExpanded ? '▲ 접기' : `▼ 전체 ${totalWatch}사 보기`}
                  </button>
                )}
              </>
            );
          })()}
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

          {/* v3.15.1: 목표미달 GAP — YTD 기준 + 펼치기 */}
          <div className="card">
            <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
              <span>⚠️ YTD 목표 미달 고객 ({gapWarningAccounts.length.toLocaleString()}사 · 총 GAP {fmtKRW(gapWarningAccounts.reduce((s, w) => s + (w.gap || 0), 0))})</span>
              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
                — 사업계획 1~{CURRENT_MONTH}월 누적 목표 &gt; YTD 실적
              </span>
            </div>
            {gapWarningAccounts.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p style={{ color: 'var(--green)' }}>모든 고객이 진도 정상</p>
              </div>
            ) : (() => {
              const isExpanded = expandedCards.gapWarning;
              const visible = isExpanded ? gapWarningAccounts : gapWarningAccounts.slice(0, 12);
              return (
                <>
                  <div className="issue-list" style={{ maxHeight: isExpanded ? 480 : 'auto' }}>
                    {visible.map(w => (
                      <div key={w.account.id} className="issue-row" style={{ cursor: 'pointer' }} onClick={() => setEditingAccount(w.account)}>
                        <span className="issue-company">{w.account.company_name}</span>
                        <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>▼ {fmtKRW(w.gap)}</span>
                        <span className={`score-badge ${w.pct >= 80 ? 'yellow' : 'red'}`} style={{ fontSize: 9 }}>{w.pct}%</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>{w.account.sales_rep}</span>
                      </div>
                    ))}
                  </div>
                  {gapWarningAccounts.length > 12 && (
                    <button
                      onClick={() => toggleCardExpand('gapWarning')}
                      style={{ width: '100%', textAlign: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 0', fontSize: 11, fontWeight: 600, marginTop: 8, cursor: 'pointer', color: 'var(--accent)' }}
                    >
                      {isExpanded ? '▲ 접기' : `▼ 전체 ${gapWarningAccounts.length}사 보기`}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 지역별 + 담당자별 목표 vs 실적 */}
      <div className="two-col">
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>🌍 지역별 {hasPlan ? '목표 vs 실적' : '분포'}</span>
            {hasPlan && (
              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
                — 진도: YTD실적/YTD목표 (현재월까지 사업계획 누적) · 🟢≥100% / 🟡80-100% / 🔴&lt;80%
              </span>
            )}
          </div>
          {hasPlan ? (
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>지역</th>
                    <th style={{ textAlign: 'right' }}>고객수</th>
                    <th style={{ textAlign: 'right' }}>연간 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 실적</th>
                    <th style={{ textAlign: 'right' }}>진도</th>
                    <th style={{ textAlign: 'right' }}>Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(regionStats)
                    .filter(([, v]) => v.target > 0 || v.actual > 0 || v.count > 0)
                    .sort((a, b) => b[1].target - a[1].target)
                    .map(([region, v]) => {
                      const ytdPct = v.ytdTarget > 0 ? Math.round((v.actual / v.ytdTarget) * 100) : 0;
                      const shortage = Math.max(0, v.ytdTarget - v.actual);
                      const surplus = Math.max(0, v.actual - v.ytdTarget);
                      const statusColor = v.ytdTarget <= 0 ? 'var(--text3)'
                        : ytdPct >= 100 ? 'var(--green, #16a34a)'
                        : ytdPct >= 80 ? '#d97706'
                        : 'var(--red)';
                      const statusIcon = v.ytdTarget <= 0 ? '·' : ytdPct >= 100 ? '🟢' : ytdPct >= 80 ? '🟡' : '🔴';
                      return (
                        <tr key={region}>
                          <td style={{ fontWeight: 600 }}>{region}</td>
                          <td style={{ textAlign: 'right' }}>{v.count}</td>
                          <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>{fmtKRW(v.ytdTarget)}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: statusColor }}>
                            {v.ytdTarget > 0 ? `${statusIcon} ${ytdPct}%` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: shortage > 0 ? 'var(--red)' : surplus > 0 ? 'var(--green, #16a34a)' : 'var(--text3)' }}>
                            {shortage > 0 ? `▼${fmtKRW(shortage)}` : surplus > 0 ? `▲${fmtKRW(surplus)}` : '-'}
                          </td>
                        </tr>
                      );
                    })}
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
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>👤 담당자별 {hasPlan ? '목표 vs 실적' : '분포'}</span>
            {hasPlan && (
              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
                — 진도: YTD실적/YTD목표 (사업계획 월별 누적)
              </span>
            )}
          </div>
          {hasPlan ? (
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>담당자</th>
                    <th style={{ textAlign: 'right' }}>고객수</th>
                    <th style={{ textAlign: 'right' }}>연간 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 목표</th>
                    <th style={{ textAlign: 'right' }}>YTD 실적</th>
                    <th style={{ textAlign: 'right' }}>진도</th>
                    <th style={{ textAlign: 'right' }}>Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(repStats)
                    .filter(([, v]) => v.target > 0 || v.actual > 0 || v.count > 0)
                    .sort((a, b) => b[1].target - a[1].target)
                    .map(([rep, v]) => {
                      const ytdPct = v.ytdTarget > 0 ? Math.round((v.actual / v.ytdTarget) * 100) : 0;
                      const shortage = Math.max(0, v.ytdTarget - v.actual);
                      const surplus = Math.max(0, v.actual - v.ytdTarget);
                      const statusColor = v.ytdTarget <= 0 ? 'var(--text3)'
                        : ytdPct >= 100 ? 'var(--green, #16a34a)'
                        : ytdPct >= 80 ? '#d97706'
                        : 'var(--red)';
                      const statusIcon = v.ytdTarget <= 0 ? '·' : ytdPct >= 100 ? '🟢' : ytdPct >= 80 ? '🟡' : '🔴';
                      return (
                        <tr key={rep}>
                          <td style={{ fontWeight: 600 }}>{rep}</td>
                          <td style={{ textAlign: 'right' }}>{v.count}</td>
                          <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>{fmtKRW(v.ytdTarget)}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                          <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: statusColor }}>
                            {v.ytdTarget > 0 ? `${statusIcon} ${ytdPct}%` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: shortage > 0 ? 'var(--red)' : surplus > 0 ? 'var(--green, #16a34a)' : 'var(--text3)' }}>
                            {shortage > 0 ? `▼${fmtKRW(shortage)}` : surplus > 0 ? `▲${fmtKRW(surplus)}` : '-'}
                          </td>
                        </tr>
                      );
                    })}
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
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>📊 사업구분별 목표 vs 실적</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — 진도: YTD실적/YTD목표 (사업계획 월별 누적, {CURRENT_MONTH}월까지)
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th style={{ textAlign: 'right' }}>연간 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 실적</th>
                  <th style={{ textAlign: 'right' }}>진도</th>
                  <th style={{ textAlign: 'right' }}>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bizTypeStats)
                  .filter(([, v]) => v.target > 0)
                  .sort((a, b) => b[1].target - a[1].target)
                  .map(([biz, v]) => {
                    const ytdPct = v.ytdTarget > 0 ? Math.round((v.actual / v.ytdTarget) * 100) : 0;
                    const shortage = Math.max(0, v.ytdTarget - v.actual);
                    const surplus = Math.max(0, v.actual - v.ytdTarget);
                    const statusColor = v.ytdTarget <= 0 ? 'var(--text3)'
                      : ytdPct >= 100 ? 'var(--green, #16a34a)'
                      : ytdPct >= 80 ? '#d97706'
                      : 'var(--red)';
                    const statusIcon = v.ytdTarget <= 0 ? '·' : ytdPct >= 100 ? '🟢' : ytdPct >= 80 ? '🟡' : '🔴';
                    return (
                      <tr key={biz}>
                        <td style={{ fontWeight: 600 }}>{biz}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>{fmtKRW(v.ytdTarget)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: statusColor }}>
                          {v.ytdTarget > 0 ? `${statusIcon} ${ytdPct}%` : '-'}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: shortage > 0 ? 'var(--red)' : surplus > 0 ? 'var(--green, #16a34a)' : 'var(--text3)' }}>
                          {shortage > 0 ? `▼${fmtKRW(shortage)}` : surplus > 0 ? `▲${fmtKRW(surplus)}` : '-'}
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
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <span>📦 품목별 목표 vs 실적</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — 진도: YTD실적/YTD목표 (사업계획 월별 누적, {CURRENT_MONTH}월까지)
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목</th>
                  <th style={{ textAlign: 'right' }}>연간 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 목표</th>
                  <th style={{ textAlign: 'right' }}>YTD 실적</th>
                  <th style={{ textAlign: 'right' }}>진도</th>
                  <th style={{ textAlign: 'right' }}>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(productStats)
                  .filter(([, v]) => v.target > 0)
                  .sort((a, b) => b[1].target - a[1].target)
                  .map(([product, v]) => {
                    const ytdPct = v.ytdTarget > 0 ? Math.round((v.actual / v.ytdTarget) * 100) : 0;
                    const shortage = Math.max(0, v.ytdTarget - v.actual);
                    const surplus = Math.max(0, v.actual - v.ytdTarget);
                    const statusColor = v.ytdTarget <= 0 ? 'var(--text3)'
                      : ytdPct >= 100 ? 'var(--green, #16a34a)'
                      : ytdPct >= 80 ? '#d97706'
                      : 'var(--red)';
                    const statusIcon = v.ytdTarget <= 0 ? '·' : ytdPct >= 100 ? '🟢' : ytdPct >= 80 ? '🟡' : '🔴';
                    return (
                      <tr key={product}>
                        <td style={{ fontWeight: 600 }}>{product}</td>
                        <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.target)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>{fmtKRW(v.ytdTarget)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{fmtKRW(v.actual)}</td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: statusColor }}>
                          {v.ytdTarget > 0 ? `${statusIcon} ${ytdPct}%` : '-'}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: shortage > 0 ? 'var(--red)' : surplus > 0 ? 'var(--green, #16a34a)' : 'var(--text3)' }}>
                          {shortage > 0 ? `▼${fmtKRW(shortage)}` : surplus > 0 ? `▲${fmtKRW(surplus)}` : '-'}
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
