import { useState } from 'react';
import {
  BIZ_HEALTH_OPTIONS, SUPPLIER_POSITIONS, COMPETITOR_PRICE_LEVELS,
  SUBSTITUTE_SEARCH, INFLUENCER_ROLES, RELATIONSHIP_TEMPS, PRODUCTS,
} from '../../lib/constants';
import { today } from '../../lib/utils';

const SECTION_STYLE = {
  marginBottom: 20, padding: 16, background: 'var(--bg3)',
  borderRadius: 8, border: '1px solid var(--border)',
};

const LABEL_STYLE = {
  fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
};

export default function CustomerInsight({ draft, update }) {
  const insight = draft.customer_insight || {};

  const set = (section, field, value) => {
    const prev = insight[section] || {};
    update({
      customer_insight: {
        ...insight,
        [section]: { ...prev, [field]: value },
        last_updated: today(),
      },
    });
  };

  /* ── 경쟁사 현황 배열 헬퍼 ── */
  const competitors = insight.supplier?.competitors || [];
  const setCompetitor = (idx, field, value) => {
    const next = [...competitors];
    next[idx] = { ...next[idx], [field]: value };
    set('supplier', 'competitors', next);
  };
  const addCompetitor = () => set('supplier', 'competitors', [...competitors, { name: '', share: '', price_level: '', products: '' }]);
  const removeCompetitor = (idx) => set('supplier', 'competitors', competitors.filter((_, i) => i !== idx));

  /* ── 구매 영향자 배열 헬퍼 ── */
  const influencers = insight.decision?.influencers || [];
  const setInfluencer = (idx, field, value) => {
    const next = [...influencers];
    next[idx] = { ...next[idx], [field]: value };
    set('decision', 'influencers', next);
  };
  const addInfluencer = () => set('decision', 'influencers', [...influencers, { name: '', role: '', dept: '' }]);
  const removeInfluencer = (idx) => set('decision', 'influencers', influencers.filter((_, i) => i !== idx));

  // 인사이트 완성도 계산
  const completeness = (() => {
    let filled = 0;
    let total = 0;
    // 건강도: 4개 필드
    ['revenue_trend', 'budget_trend', 'expansion_notes', 'contact_change'].forEach(k => {
      total++;
      if (insight.health?.[k]) filled++;
    });
    // 공급자: 3개 핵심 필드
    ['position', 'substitute_search'].forEach(k => {
      total++;
      if (insight.supplier?.[k]) filled++;
    });
    total++;
    if (competitors.length > 0) filled++;
    // 결정구조: 3개 핵심 필드
    ['key_decision_maker', 'relationship_temp'].forEach(k => {
      total++;
      if (insight.decision?.[k]) filled++;
    });
    total++;
    if (insight.decision?.has_champion) filled++;
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  })();

  return (
    <div>
      {/* 완성도 표시 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          Customer Insight
          {insight.last_updated && <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>최종: {insight.last_updated}</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${completeness}%`, height: '100%', background: completeness >= 70 ? 'var(--green)' : completeness >= 40 ? 'var(--yellow)' : 'var(--red)', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: completeness >= 70 ? 'var(--green)' : completeness >= 40 ? 'var(--yellow)' : 'var(--red)' }}>{completeness}%</span>
        </div>
      </div>

      {/* ─── 1. 고객 비즈니스 건강도 ─── */}
      <div style={SECTION_STYLE}>
        <div style={LABEL_STYLE}>
          <span style={{ fontSize: 16 }}>💊</span>
          고객 비즈니스 건강도
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>고객사 매출 성장 추세</label>
            <select value={insight.health?.revenue_trend || ''} onChange={e => set('health', 'revenue_trend', e.target.value)}>
              <option value="">선택</option>
              {BIZ_HEALTH_OPTIONS.revenue_trend.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>구매 예산 동향</label>
            <select value={insight.health?.budget_trend || ''} onChange={e => set('health', 'budget_trend', e.target.value)}>
              <option value="">선택</option>
              {BIZ_HEALTH_OPTIONS.budget_trend.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>조달 담당자 변동</label>
            <select value={insight.health?.contact_change || ''} onChange={e => set('health', 'contact_change', e.target.value)}>
              <option value="">선택</option>
              {BIZ_HEALTH_OPTIONS.contact_change.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>변동일</label>
            <input type="date" value={insight.health?.contact_change_date || ''} onChange={e => set('health', 'contact_change_date', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>사업 확장 이슈</label>
          <textarea
            value={insight.health?.expansion_notes || ''}
            onChange={e => set('health', 'expansion_notes', e.target.value)}
            placeholder="신규 시장 진출, M&A, 라인 증설, 구조조정 등"
            rows={2}
            style={{ width: '100%', resize: 'vertical', fontSize: 12 }}
          />
        </div>
      </div>

      {/* ─── 2. 공급자 지위 ─── */}
      <div style={SECTION_STYLE}>
        <div style={LABEL_STYLE}>
          <span style={{ fontSize: 16 }}>🏭</span>
          공급자 지위 (Supplier Position)
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>우리의 공급자 지위</label>
            <select value={insight.supplier?.position || ''} onChange={e => set('supplier', 'position', e.target.value)}>
              <option value="">선택</option>
              {SUPPLIER_POSITIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>대체재 탐색 여부</label>
            <select value={insight.supplier?.substitute_search || ''} onChange={e => set('supplier', 'substitute_search', e.target.value)}>
              <option value="">선택</option>
              {SUBSTITUTE_SEARCH.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>전략 제품</label>
          <div className="products-grid">
            {PRODUCTS.map(p => (
              <label key={p} className="prod-check">
                <input
                  type="checkbox"
                  checked={(insight.supplier?.strategic_products || []).includes(p)}
                  onChange={() => {
                    const cur = insight.supplier?.strategic_products || [];
                    set('supplier', 'strategic_products', cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]);
                  }}
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        {/* 경쟁 공급사 현황 */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>경쟁 공급사 현황</label>
            <button className="btn btn-ghost btn-sm" onClick={addCompetitor}>+ 경쟁사 추가</button>
          </div>
          {competitors.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 12 }}>등록된 경쟁사가 없습니다</div>
          ) : (
            competitors.map((c, idx) => (
              <div key={idx} className="contact-card" style={{ position: 'relative' }}>
                <button className="remove-contact" onClick={() => removeCompetitor(idx)}>✕</button>
                <div className="form-row">
                  <div className="form-group">
                    <label>업체명</label>
                    <input type="text" value={c.name || ''} onChange={e => setCompetitor(idx, 'name', e.target.value)} placeholder="경쟁사명" />
                  </div>
                  <div className="form-group">
                    <label>점유율 추정</label>
                    <input type="text" value={c.share || ''} onChange={e => setCompetitor(idx, 'share', e.target.value)} placeholder="예: 30%" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>가격 수준</label>
                    <select value={c.price_level || ''} onChange={e => setCompetitor(idx, 'price_level', e.target.value)}>
                      <option value="">선택</option>
                      {COMPETITOR_PRICE_LEVELS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>경쟁 제품</label>
                    <input type="text" value={c.products || ''} onChange={e => setCompetitor(idx, 'products', e.target.value)} placeholder="제품명" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── 3. 구매결정 구조 ─── */}
      <div style={SECTION_STYLE}>
        <div style={LABEL_STYLE}>
          <span style={{ fontSize: 16 }}>👥</span>
          구매결정 구조 (Decision Map)
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>실질 결정권자</label>
            <input type="text" value={insight.decision?.key_decision_maker || ''} onChange={e => set('decision', 'key_decision_maker', e.target.value)} placeholder="이름 / 직책" />
          </div>
          <div className="form-group">
            <label>관계 온도 (결정권자 기준)</label>
            <select value={insight.decision?.relationship_temp || ''} onChange={e => set('decision', 'relationship_temp', e.target.value)}>
              <option value="">선택</option>
              {RELATIONSHIP_TEMPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>우리 내부 후원자 (Champion)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="prod-check">
                <input type="checkbox" checked={!!insight.decision?.has_champion} onChange={e => set('decision', 'has_champion', e.target.checked)} />
                있음
              </label>
              {insight.decision?.has_champion && (
                <input type="text" value={insight.decision?.champion_name || ''} onChange={e => set('decision', 'champion_name', e.target.value)} placeholder="이름 / 직책" style={{ flex: 1 }} />
              )}
            </div>
          </div>
        </div>

        {/* 구매 영향자 목록 */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>구매 영향자</label>
            <button className="btn btn-ghost btn-sm" onClick={addInfluencer}>+ 영향자 추가</button>
          </div>
          {influencers.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 12 }}>등록된 구매 영향자가 없습니다</div>
          ) : (
            influencers.map((inf, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input type="text" value={inf.name || ''} onChange={e => setInfluencer(idx, 'name', e.target.value)} placeholder="이름" style={{ flex: 1 }} />
                <select value={inf.role || ''} onChange={e => setInfluencer(idx, 'role', e.target.value)} style={{ width: 90 }}>
                  <option value="">역할</option>
                  {INFLUENCER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input type="text" value={inf.dept || ''} onChange={e => setInfluencer(idx, 'dept', e.target.value)} placeholder="부서" style={{ width: 100 }} />
                <button className="btn btn-danger btn-sm" onClick={() => removeInfluencer(idx)} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button>
              </div>
            ))
          )}
        </div>

        {/* 의사결정 프로세스 메모 */}
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>의사결정 프로세스 메모</label>
          <textarea
            value={insight.decision?.process_notes || ''}
            onChange={e => set('decision', 'process_notes', e.target.value)}
            placeholder="구매 결정까지의 프로세스, 승인 단계, 리드타임 등"
            rows={2}
            style={{ width: '100%', resize: 'vertical', fontSize: 12 }}
          />
        </div>
      </div>
    </div>
  );
}
