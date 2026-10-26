import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { GAP_CAUSES, OPPORTUNITY_TYPES, BUDGET_CYCLES, PRODUCTS } from '../../lib/constants';
import { today, genId } from '../../lib/utils';
import CauseCountermeasure from '../CauseCountermeasure';

const GAP_REASON_OPTIONS = [
  '고객 예산 삭감', '경쟁사 저가 수주', '납기 문제', '품질 클레임', '담당자 변경',
  '결재 지연', '재고 과다', '시장 수요 감소', '담당자 활동 부족', '기타',
];

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
  const { businessPlans, orders, gapReasons, saveGapReason, removeGapReason, t, te } = useAccount();
  const [oppForm, setOppForm] = useState(null);
  const [histFilter, setHistFilter] = useState({ ym: '', cause: '' });
  const [selectedGapMonth, setSelectedGapMonth] = useState(null);
  const [gapReasonForm, setGapReasonForm] = useState({ reason: '', detail: '' });

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

  /* ── M5: 월별 목표/실적 계산 ── */
  const monthlyGap = useMemo(() => {
    const year = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const name = (draft.company_name || '').toLowerCase().trim();
    if (!name) return [];

    const plans = businessPlans.filter(p =>
      p.year === year && (p.type === 'customer' || !p.type) &&
      (p.account_id === draft.id || (p.customer_name || '').toLowerCase().trim() === name)
    );

    const result = [];
    for (let m = 1; m <= currentMonth; m++) {
      const mk = String(m).padStart(2, '0');
      const target = plans.reduce((s, p) => s + (p.targets?.[mk] || 0), 0);
      const actual = orders
        .filter(o => o.order_date?.startsWith(`${year}-${mk}`) &&
          (o.account_id === draft.id || (o.customer_name || '').toLowerCase().trim() === name))
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      result.push({ month: m, mk, target, actual, gap: actual - target, rate: target > 0 ? Math.round((actual / target) * 100) : null });
    }
    return result;
  }, [businessPlans, orders, draft.id, draft.company_name]);

  const gapForAccount = useMemo(() =>
    gapReasons.filter(r => r.account_id === draft.id),
    [gapReasons, draft.id]
  );

  const handleSaveGapReason = async () => {
    if (!selectedGapMonth) return;
    if (!gapReasonForm.reason) { alert('원인을 선택하세요.'); return; }
    if (!gapReasonForm.detail.trim()) { alert('상세 내용을 입력하세요.'); return; }
    const year = new Date().getFullYear();
    const id = `${draft.id}_${year}_${selectedGapMonth.mk}`;
    await saveGapReason({
      id,
      account_id: draft.id,
      year,
      month: selectedGapMonth.month,
      reason: gapReasonForm.reason,
      detail: gapReasonForm.detail.trim(),
      recorded_at: today(),
    });
    setSelectedGapMonth(null);
    setGapReasonForm({ reason: '', detail: '' });
  };

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

      {/* ⑥ v3.50: GAP 원인 월별 이력 — 테이블 형식, Section 1 바로 다음 */}
      {(gap.gap_cause_history || []).length > 0 && (() => {
        const allYms = [...new Set((gap.gap_cause_history).map(e => e.year_month))].sort().reverse();
        const allCauses = [...new Set((gap.gap_cause_history).flatMap(e => e.causes || []))];
        const filtered = [...gap.gap_cause_history]
          .filter(e => (!histFilter.ym || e.year_month === histFilter.ym) &&
            (!histFilter.cause || (e.causes || []).includes(histFilter.cause)))
          .reverse();
        return (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>📅 GAP 원인 이력 ({filtered.length}건)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={histFilter.ym} onChange={e => setHistFilter(p => ({ ...p, ym: e.target.value }))}
                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <option value="">연도/월 전체</option>
                  {allYms.map(ym => <option key={ym} value={ym}>{ym}</option>)}
                </select>
                <select value={histFilter.cause} onChange={e => setHistFilter(p => ({ ...p, cause: e.target.value }))}
                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <option value="">원인 전체</option>
                  {allCauses.map(ck => {
                    const ci = GAP_CAUSES.find(c => c.key === ck);
                    return <option key={ck} value={ck}>{ci ? `${ci.icon} ${te(ci.label)}` : ck}</option>;
                  })}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)', fontSize: 11, color: 'var(--text3)' }}>
                    <th style={{ padding: '5px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>연/월</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>주요 원인</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>원인 분석</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>대책 / Next Action Plan</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, i) => {
                    const origIdx = gap.gap_cause_history.findIndex(
                      e => e.saved_at === entry.saved_at && e.year_month === entry.year_month
                    );
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg2)' }}>
                        <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', fontWeight: 700 }}>{entry.year_month}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {(entry.causes || []).map(ck => {
                              const ci = GAP_CAUSES.find(c => c.key === ck);
                              return (
                                <span key={ck} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(46,125,50,.1)', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {ci ? `${ci.icon} ${te(ci.label)}` : ck}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td style={{ padding: '5px 8px', color: 'var(--text2)', maxWidth: 200 }}>{entry.cause_detail || '-'}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text2)', maxWidth: 200 }}>{entry.countermeasure || '-'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={() => {
                              const next = gap.gap_cause_history.filter((_, idx) => idx !== origIdx);
                              updateGap({ gap_cause_history: next });
                            }}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
        {/* M2: 4단계 원인분석/대책 */}
        <CauseCountermeasure
          situationSummary={planGap ? `목표 ${(planGap.ytdTarget / 100000000).toFixed(2)}억 · 실적 ${(planGap.ytdActual / 100000000).toFixed(2)}억 · GAP ${(planGap.ytdGap / 100000000).toFixed(2)}억` : null}
          causeDetail={gap.cause_detail}
          onCauseDetailChange={v => updateGap({ cause_detail: v })}
          rootCause={gap.root_cause}
          onRootCauseChange={v => updateGap({ root_cause: v })}
          countermeasure={gap.countermeasure}
          onCountermeasureChange={v => updateGap({ countermeasure: v })}
          isUnderTarget={planGap?.ytdGap < 0}
          hasCauseButNoDetail={hasCauseButNoDetail}
          detailLabel={planGap?.ytdGap >= 0 ? t('gap.detailLabelOver') : t('gap.detailLabelUnder')}
          counterLabel={planGap?.ytdGap < 0 ? t('gap.counterUnder') : t('gap.counterOver')}
          detailPlaceholder={planGap?.ytdGap >= 0 ? t('gap.detailPlaceholderOver') : t('gap.detailPlaceholderUnder')}
          counterPlaceholder={planGap?.ytdGap < 0 ? t('gap.counterPlaceholderUnder') : t('gap.counterPlaceholderOver')}
        />

        {/* v3.34: Loss Reason 보강 — 회복 가능성 + 경쟁사명 (명세 P0) */}
        {(gap.causes || []).length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: 'rgba(46,125,50,0.04)', border: '1px solid rgba(46,125,50,0.18)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>
              📊 Loss Reason 보강 정보 (보고서 분석용)
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ fontSize: 11, fontWeight: 600 }}>회복 가능성 <span style={{ color: 'var(--red)' }}>*</span></label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {[
                    { key: 'HIGH',   label: '🟢 HIGH', color: 'var(--green, #16a34a)' },
                    { key: 'MEDIUM', label: '🟡 MEDIUM', color: '#d97706' },
                    { key: 'LOW',    label: '🔴 LOW', color: 'var(--red)' },
                  ].map(r => {
                    const checked = gap.recoverability === r.key;
                    return (
                      <label key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: `1.5px solid ${checked ? r.color : 'var(--border)'}`, borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: checked ? 700 : 500, color: checked ? r.color : 'var(--text2)', background: checked ? 'var(--bg)' : 'transparent' }}>
                        <input type="radio" name={`recov_${draft.id || 'new'}`} checked={checked} onChange={() => updateGap({ recoverability: r.key })} />
                        {r.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* 경쟁사명 — '경쟁 이탈' cause 선택 시 표시 */}
              {(gap.causes || []).includes('competition') && (
                <div className="form-group">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>경쟁사명 <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="text"
                    value={gap.competitor_name || ''}
                    onChange={e => updateGap({ competitor_name: e.target.value })}
                    placeholder="예: INTCO / J&J / Stryker / 미상"
                    style={{ width: '100%', padding: 6, fontSize: 12, border: `1px solid ${(gap.causes || []).includes('competition') && !(gap.competitor_name || '').trim() ? 'var(--red)' : 'var(--border)'}`, borderRadius: 4 }}
                  />
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              ※ 회복 가능성 + (경쟁이탈 시) 경쟁사명은 월간 보고서 "미달 원인 분석" 슬라이드에 자동 반영됩니다
            </div>
          </div>
        )}

        {/* ⑥ v3.47: 이번 달 분석 저장 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              const ym = today().slice(0, 7);
              const existing = gap.gap_cause_history || [];
              const newEntry = {
                year_month: ym,
                causes: gap.causes || [],
                cause_detail: gap.cause_detail || '',
                root_cause: gap.root_cause || '',
                countermeasure: gap.countermeasure || '',
                saved_at: today(),
              };
              updateGap({ gap_cause_history: [...existing, newEntry] });
            }}
          >
            💾 이번 달 분석 저장
          </button>
        </div>
      </div>

      {/* ⑥ v3.50: GAP 원인 이력 테이블 — 상단 이동됨 (아래 Section 1-2 사이에 렌더) */}
      {false && (() => {
        const allYms = [...new Set((gap.gap_cause_history).map(e => e.year_month))].sort().reverse();
        const allCauses = [...new Set((gap.gap_cause_history).flatMap(e => e.causes || []))];
        const filtered = [...gap.gap_cause_history]
          .filter(e => (!histFilter.ym || e.year_month === histFilter.ym) &&
            (!histFilter.cause || (e.causes || []).includes(histFilter.cause)))
          .reverse();
        return (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>📅 GAP 원인 이력 ({filtered.length}건)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={histFilter.ym} onChange={e => setHistFilter(p => ({ ...p, ym: e.target.value }))}
                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <option value="">연도/월 전체</option>
                  {allYms.map(ym => <option key={ym} value={ym}>{ym}</option>)}
                </select>
                <select value={histFilter.cause} onChange={e => setHistFilter(p => ({ ...p, cause: e.target.value }))}
                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <option value="">원인 전체</option>
                  {allCauses.map(ck => {
                    const ci = GAP_CAUSES.find(c => c.key === ck);
                    return <option key={ck} value={ck}>{ci ? `${ci.icon} ${te(ci.label)}` : ck}</option>;
                  })}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)', fontSize: 11, color: 'var(--text3)' }}>
                    <th style={{ padding: '5px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>연/월</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>주요 원인</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>원인 분석</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>대책 / Next Action Plan</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, i) => {
                    const realIdx = gap.gap_cause_history.indexOf(gap.gap_cause_history.find(
                      e => e.saved_at === entry.saved_at && e.year_month === entry.year_month
                    ));
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg2)' }}>
                        <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', fontWeight: 700 }}>{entry.year_month}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {(entry.causes || []).map(ck => {
                              const ci = GAP_CAUSES.find(c => c.key === ck);
                              return (
                                <span key={ck} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(46,125,50,.1)', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {ci ? `${ci.icon} ${te(ci.label)}` : ck}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td style={{ padding: '5px 8px', color: 'var(--text2)', maxWidth: 200 }}>{entry.cause_detail || '-'}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text2)', maxWidth: 200 }}>{entry.countermeasure || '-'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={() => {
                              const next = gap.gap_cause_history.filter((_, idx) => idx !== realIdx);
                              updateGap({ gap_cause_history: next });
                            }}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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

      {/* ── M5: 월별 목표 미달 현황 ── */}
      {monthlyGap.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">📅 월별 미달 현황</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {monthlyGap.map(m => {
              const isMiss = m.target > 0 && m.actual < m.target;
              const isSelected = selectedGapMonth?.mk === m.mk;
              const existingReason = gapForAccount.find(r => r.month === m.month && r.year === new Date().getFullYear());
              return (
                <div
                  key={m.mk}
                  onClick={() => {
                    if (!isMiss) return;
                    setSelectedGapMonth(isSelected ? null : m);
                    setGapReasonForm(existingReason
                      ? { reason: existingReason.reason, detail: existingReason.detail }
                      : { reason: '', detail: '' }
                    );
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '6px 8px', borderRadius: 8, cursor: isMiss ? 'pointer' : 'default',
                    border: isSelected ? '2px solid var(--accent)' : `1.5px solid ${isMiss ? '#ef4444' : 'var(--border)'}`,
                    background: isSelected ? 'rgba(46,125,50,.08)' : isMiss ? 'rgba(239,68,68,.05)' : 'var(--bg2)',
                    minWidth: 52,
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{m.month}월</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isMiss ? '#ef4444' : 'var(--green)' }}>
                    {m.rate !== null ? `${m.rate}%` : '-'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>{fmtKRW(m.actual)}</div>
                  {existingReason && (
                    <div style={{ fontSize: 8, color: 'var(--accent)', marginTop: 2 }}>✔기록</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
            ※ 빨간 막대(미달 월) 클릭 → 원인 기록
          </div>

          {selectedGapMonth && (
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>
                {selectedGapMonth.month}월 미달 원인 ({fmtKRW(selectedGapMonth.target)} 목표 → {fmtKRW(selectedGapMonth.actual)} 실적, {selectedGapMonth.rate}%)
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>원인 선택 *</div>
                <select
                  value={gapReasonForm.reason}
                  onChange={e => setGapReasonForm(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value="">-- 원인 선택 --</option>
                  {GAP_REASON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>상세 내용 * (필수)</div>
                <textarea
                  value={gapReasonForm.detail}
                  onChange={e => setGapReasonForm(prev => ({ ...prev, detail: e.target.value }))}
                  placeholder="구체적인 미달 원인과 경위를 기재하세요..."
                  rows={3}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedGapMonth(null); setGapReasonForm({ reason: '', detail: '' }); }}>취소</button>
                {gapForAccount.find(r => r.month === selectedGapMonth.month && r.year === new Date().getFullYear()) && (
                  <button className="btn btn-danger btn-sm"
                    onClick={() => {
                      const id = `${draft.id}_${new Date().getFullYear()}_${selectedGapMonth.mk}`;
                      removeGapReason(id);
                      setSelectedGapMonth(null);
                    }}>삭제</button>
                )}
                <button className="btn btn-primary btn-sm" onClick={handleSaveGapReason}>저장</button>
              </div>
            </div>
          )}

          {gapForAccount.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text2)' }}>기록된 원인</div>
              {gapForAccount.sort((a, b) => a.month - b.month).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0, paddingTop: 2 }}>{r.month}월</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>{r.reason}</span>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 마지막 업데이트 ── */}
      {gap.last_updated && (
        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right' }}>
          {t('gap.lastUpdated')} {gap.last_updated}
        </div>
      )}
    </div>
  );
}
