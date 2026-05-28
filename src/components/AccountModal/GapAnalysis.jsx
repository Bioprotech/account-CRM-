import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { GAP_CAUSES, OPPORTUNITY_TYPES, BUDGET_CYCLES, PRODUCTS } from '../../lib/constants';
import { today, genId } from '../../lib/utils';

/* ── 금액 포맷 ── */
function fmtKRW(n) {
  if (!n) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}

const PROB_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export default function GapAnalysis({ draft, update }) {
  const { businessPlans, orders, t, te } = useAccount();
  const [oppForm, setOppForm] = useState(null);

  const gap = draft.gap_analysis || {};

  const updateGap = (fields) => {
    update({ gap_analysis: { ...gap, ...fields, last_updated: today() } });
  };

  /* ── 사업계획 대비 Gap 자동 계산 ── */
  const planGap = useMemo(() => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const name = (draft.company_name || '').toLowerCase().trim();
    if (!name) return null;

    // Find plans for this account
    const plans = businessPlans.filter(p =>
      p.year === year && (p.type === 'customer' || !p.type) &&
      (p.account_id === draft.id || (p.customer_name || '').toLowerCase().trim() === name)
    );
    if (plans.length === 0) return null;

    const annualTarget = plans.reduce((s, p) => s + (p.annual_target || 0), 0);
    let ytdTarget = 0;
    for (let m = 1; m <= month; m++) {
      const mk = String(m).padStart(2, '0');
      ytdTarget += plans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
    }

    // YTD actuals from orders
    const yearStr = String(year);
    const ytdActual = orders
      .filter(o => o.order_date?.startsWith(yearStr) &&
        (o.account_id === draft.id || (o.customer_name || '').toLowerCase().trim() === name))
      .reduce((s, o) => s + (o.order_amount || 0), 0);

    return {
      annualTarget,
      ytdTarget,
      ytdActual,
      ytdGap: ytdActual - ytdTarget,
      achieveRate: ytdTarget > 0 ? Math.round((ytdActual / ytdTarget) * 100) : 0,
    };
  }, [businessPlans, orders, draft.id, draft.company_name]);

  /* ── 원인 토글 ── */
  const toggleCause = (key) => {
    const causes = gap.causes || [];
    const next = causes.includes(key)
      ? causes.filter(c => c !== key)
      : [...causes, key];
    updateGap({ causes: next });
  };

  /* ── v3.17 Phase A3: GAP 원인 입력 완성도 검증
       원인 선택했는데 cause_detail이 비어있으면 GAP 분석 미완성으로 간주
       (점수 시스템의 3-4 항목 입력 성실도에 반영됨) ── */
  const hasCauseButNoDetail =
    (gap.causes || []).length > 0 &&
    !(gap.cause_detail || '').trim();

  /* ── 기회 파이프라인 ── */
  const opportunities = gap.opportunities || [];

  const addOpportunity = () => {
    setOppForm({
      id: genId('opp'),
      type: 'upsell',
      product: '',
      amount: '',
      probability: 50,
      expected_date: '',
      note: '',
    });
  };

  const saveOpportunity = () => {
    if (!oppForm) return;
    const existing = opportunities.find(o => o.id === oppForm.id);
    const next = existing
      ? opportunities.map(o => o.id === oppForm.id ? { ...oppForm, amount: Number(oppForm.amount) || 0 } : o)
      : [...opportunities, { ...oppForm, amount: Number(oppForm.amount) || 0 }];
    updateGap({ opportunities: next });
    setOppForm(null);
  };

  const removeOpportunity = (id) => {
    updateGap({ opportunities: opportunities.filter(o => o.id !== id) });
  };

  /* ── 액션 플랜 ── */
  const actionPlan = gap.action_plan || [
    { text: '', done: false },
    { text: '', done: false },
    { text: '', done: false },
  ];

  const updateAction = (idx, field, value) => {
    const next = [...actionPlan];
    next[idx] = { ...next[idx], [field]: value };
    updateGap({ action_plan: next });
  };

  /* ── 기회 합계 ── */
  const oppTotal = opportunities.reduce((s, o) => s + (o.amount || 0), 0);
  const weightedOppTotal = opportunities.reduce((s, o) => s + (o.amount || 0) * (o.probability || 0) / 100, 0);

  return (
    <div>
      {/* ── Section 1: 수주 Gap 현황 (자동 계산) ── */}
      {planGap && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">{t('gap.ytdStatus')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg3)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t('gap.annualTarget')}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKRW(planGap.annualTarget)}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg3)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t('gap.ytdTarget')}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKRW(planGap.ytdTarget)}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg3)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t('gap.ytdActual')}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{fmtKRW(planGap.ytdActual)}</div>
            </div>
            <div style={{
              textAlign: 'center', padding: 8, borderRadius: 6,
              background: planGap.ytdGap >= 0 ? 'rgba(22,163,74,.08)' : 'rgba(220,38,38,.08)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t('gap.gapLabel')}</div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: planGap.ytdGap >= 0 ? 'var(--green)' : 'var(--red)',
              }}>
                {planGap.ytdGap >= 0 ? '+' : ''}{fmtKRW(planGap.ytdGap)}
              </div>
              <div style={{ fontSize: 10, color: planGap.achieveRate >= 90 ? 'var(--green)' : planGap.achieveRate >= 70 ? 'var(--yellow)' : 'var(--red)' }}>
                {t('gap.achievementRate')} {planGap.achieveRate}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Gap 원인 / 대책 ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">
          {t('gap.causesAndCounter')}
          {planGap && (
            <span style={{ fontSize: 10, marginLeft: 8, padding: '2px 8px', borderRadius: 10,
              background: planGap.ytdGap >= 0 ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.12)',
              color: planGap.ytdGap >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700,
            }}>
              {planGap.ytdGap >= 0 ? t('gap.overAchieved') : t('gap.underTarget')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          {planGap?.ytdGap < 0 ? t('gap.causeHintUnder') : t('gap.causeHintOver')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {GAP_CAUSES.map(cause => {
            const selected = (gap.causes || []).includes(cause.key);
            return (
              <label key={cause.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                background: selected ? 'rgba(46,125,50,.06)' : 'transparent',
                transition: 'all .15s',
              }}>
                <input type="checkbox" checked={selected} onChange={() => toggleCause(cause.key)}
                  style={{ accentColor: 'var(--accent)' }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: selected ? 600 : 400 }}>
                    {cause.icon} {te(cause.label)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{te(cause.desc)}</div>
                </div>
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: hasCauseButNoDetail ? 'var(--red)' : 'var(--text2)', display: 'block', marginBottom: 4 }}>
            {planGap?.ytdGap >= 0 ? t('gap.detailLabelOver') : t('gap.detailLabelUnder')}
            {(gap.causes || []).length > 0 && <span style={{ color: 'var(--red)', marginLeft: 4 }}>{t('gap.detailRequired')}</span>}
          </label>
          <textarea
            value={gap.cause_detail || ''}
            onChange={e => updateGap({ cause_detail: e.target.value })}
            placeholder={planGap?.ytdGap >= 0
              ? t('gap.detailPlaceholderOver')
              : t('gap.detailPlaceholderUnder')}
            style={{
              minHeight: 60,
              borderColor: hasCauseButNoDetail ? 'var(--red)' : undefined,
              boxShadow: hasCauseButNoDetail ? '0 0 0 2px rgba(220,38,38,0.1)' : undefined,
            }}
          />
          {hasCauseButNoDetail && (
            <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginTop: 4, padding: '6px 8px', background: 'rgba(220,38,38,0.06)', borderRadius: 4 }}>
              {t('gap.warnEmptyDetail')}
            </div>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: planGap?.ytdGap < 0 ? 'var(--red)' : 'var(--green)', display: 'block', marginBottom: 4 }}>
            {planGap?.ytdGap < 0 ? t('gap.counterUnder') : t('gap.counterOver')}
          </label>
          <textarea
            value={gap.countermeasure || ''}
            onChange={e => updateGap({ countermeasure: e.target.value })}
            placeholder={planGap?.ytdGap < 0
              ? t('gap.counterPlaceholderUnder')
              : t('gap.counterPlaceholderOver')}
            style={{ minHeight: 60 }}
          />
        </div>
      </div>

      {/* ── Section 3: 고객 예산/구매 사이클 ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">{t('gap.budgetCycleSection')}</div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('gap.budgetTime')}</label>
            <select value={gap.budget_cycle || ''} onChange={e => updateGap({ budget_cycle: e.target.value })}>
              <option value="">{t('common.select')}</option>
              {BUDGET_CYCLES.map(b => <option key={b} value={b}>{te(b)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{t('gap.decisionCycle')}</label>
            <select value={gap.decision_cycle || ''} onChange={e => updateGap({ decision_cycle: e.target.value })}>
              <option value="">{t('common.select')}</option>
              <option value="월간">{t('gap.cycleMonthly')}</option>
              <option value="분기">{t('gap.cycleQuarter')}</option>
              <option value="반기">{t('gap.cycleHalf')}</option>
              <option value="연간">{t('gap.cycleAnnual')}</option>
              <option value="수시">{t('gap.cycleAdhoc')}</option>
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 4 }}>
          <label>{t('gap.compNotes')}</label>
          <textarea
            value={gap.competition_notes || ''}
            onChange={e => updateGap({ competition_notes: e.target.value })}
            placeholder={t('gap.compNotesPlaceholder')}
            style={{ minHeight: 50 }}
          />
        </div>
      </div>

      {/* ── Section 4: 기회 파이프라인 ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('gap.oppPipeline')}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {opportunities.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {opportunities.length} {t('gap.oppCountLabel')} | {t('gap.oppWeighted')} {fmtKRW(weightedOppTotal)}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={addOpportunity}>{t('gap.oppAdd')}</button>
          </div>
        </div>

        {/* 기회 입력 폼 */}
        {oppForm && (
          <div style={{ padding: 10, background: 'var(--bg3)', borderRadius: 8, marginBottom: 8 }}>
            <div className="form-row">
              <div className="form-group">
                <label>{t('gap.oppType')}</label>
                <select value={oppForm.type} onChange={e => setOppForm(p => ({ ...p, type: e.target.value }))}>
                  {OPPORTUNITY_TYPES.map(ot => <option key={ot.key} value={ot.key}>{te(ot.label)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('orderHistory.product')}</label>
                <select value={oppForm.product} onChange={e => setOppForm(p => ({ ...p, product: e.target.value }))}>
                  <option value="">{t('common.select')}</option>
                  {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('gap.opp.amount')} (KRW)</label>
                <input type="number" value={oppForm.amount}
                  onChange={e => setOppForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label>{t('gap.oppProbability')}</label>
                <select value={oppForm.probability} onChange={e => setOppForm(p => ({ ...p, probability: Number(e.target.value) }))}>
                  {PROB_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('gap.oppExpected')}</label>
                <input type="date" value={oppForm.expected_date}
                  onChange={e => setOppForm(p => ({ ...p, expected_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('gap.oppNote')}</label>
                <input type="text" value={oppForm.note}
                  onChange={e => setOppForm(p => ({ ...p, note: e.target.value }))} placeholder={t('gap.oppNotePlaceholder')} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setOppForm(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary btn-sm" onClick={saveOpportunity}>{t('common.save')}</button>
            </div>
          </div>
        )}

        {/* 기회 목록 */}
        {opportunities.length === 0 && !oppForm ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
            {t('gap.oppEmpty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opportunities.map(opp => {
              const typeInfo = OPPORTUNITY_TYPES.find(t => t.key === opp.type) || {};
              return (
                <div key={opp.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  fontSize: 12,
                }}>
                  <span className="issue-badge" style={{ fontSize: 10 }}>{te(typeInfo.label) || opp.type}</span>
                  {opp.product && <span style={{ color: 'var(--text2)' }}>{opp.product}</span>}
                  <span style={{ fontWeight: 600 }}>{fmtKRW(opp.amount)}</span>
                  <span style={{
                    padding: '1px 6px', borderRadius: 4, fontSize: 10,
                    background: opp.probability >= 70 ? 'rgba(22,163,74,.1)' : opp.probability >= 40 ? 'rgba(217,119,6,.1)' : 'rgba(220,38,38,.1)',
                    color: opp.probability >= 70 ? 'var(--green)' : opp.probability >= 40 ? 'var(--yellow)' : 'var(--red)',
                  }}>{opp.probability}%</span>
                  {opp.expected_date && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{opp.expected_date}</span>}
                  {opp.note && <span style={{ fontSize: 10, color: 'var(--text3)', flex: 1 }}>{opp.note}</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => setOppForm({ ...opp, amount: String(opp.amount || '') })}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => removeOpportunity(opp.id)}>{t('common.delete')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 5: 이번 달 액션 플랜 ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('gap.actionPlan')}</span>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>
            {actionPlan.filter(a => a.done).length}/{actionPlan.filter(a => a.text.trim()).length} {t('gap.actionDone')}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {actionPlan.map((action, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={action.done}
                onChange={e => updateAction(idx, 'done', e.target.checked)}
                style={{ accentColor: 'var(--green)', width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, width: 16 }}>{idx + 1}.</span>
              <input type="text" value={action.text}
                onChange={e => updateAction(idx, 'text', e.target.value)}
                placeholder={t('gap.actionPlaceholder', { n: idx + 1 })}
                style={{
                  flex: 1,
                  textDecoration: action.done ? 'line-through' : 'none',
                  color: action.done ? 'var(--text3)' : 'var(--text)',
                }}
              />
            </div>
          ))}
        </div>
        {actionPlan.length < 5 && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 10 }}
            onClick={() => updateGap({ action_plan: [...actionPlan, { text: '', done: false }] })}>
            {t('gap.actionAdd')}
          </button>
        )}
      </div>

      {/* ── 마지막 업데이트 ── */}
      {gap.last_updated && (
        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right' }}>
          {t('gap.lastUpdated')} {gap.last_updated}
        </div>
      )}
    </div>
  );
}
