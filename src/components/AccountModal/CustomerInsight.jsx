import { useState, useCallback, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import {
  SCORE_CATEGORIES, BIZ_HEALTH_OPTIONS, SUPPLIER_POSITIONS, COMPETITOR_PRICE_LEVELS,
  SUBSTITUTE_SEARCH, INFLUENCER_ROLES, RELATIONSHIP_TEMPS, PRODUCTS,
} from '../../lib/constants';
import { today, computeIntelligenceScore, scoreColorClass } from '../../lib/utils';

const SECTION_STYLE = {
  marginBottom: 16, padding: 14, background: 'var(--bg3)',
  borderRadius: 8, border: '1px solid var(--border)',
};
const HEADER_STYLE = {
  fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8,
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none',
};

/* ── 입력 필드 렌더러 (기존 Score에서 가져옴) ── */
function InputField({ item, value, onChange }) {
  const s = { width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2,#fff)', color: 'var(--text1)', fontFamily: 'inherit', boxSizing: 'border-box' };
  if (item.inputType === 'textarea') return <textarea style={{ ...s, resize: 'vertical', minHeight: 44, maxHeight: 80 }} rows={2} placeholder={item.placeholder || ''} value={value} onChange={e => onChange(e.target.value)} />;
  if (item.inputType === 'select') return (
    <select style={{ ...s, cursor: 'pointer' }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">-- 선택 --</option>
      {(item.options || []).map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  if (item.inputType === 'number') return <input type="number" style={s} placeholder={item.placeholder || ''} value={value} onChange={e => onChange(e.target.value)} />;
  return <input type="text" style={s} placeholder={item.placeholder || ''} value={value} onChange={e => onChange(e.target.value)} />;
}

function StatusIcon({ filled, auto }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%', fontSize: 11, flexShrink: 0,
      background: filled ? (auto ? 'var(--accent)' : 'var(--green,#22c55e)') : 'var(--bg3,#e5e7eb)',
      color: filled ? '#fff' : 'var(--text3,#999)',
    }}>
      {filled ? (auto ? 'A' : '✓') : '—'}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   메인 컴포넌트
   ═══════════════════════════════════════════════════ */
export default function CustomerInsight({ draft, update }) {
  const { getContractsForAccount } = useAccount();
  const contracts = getContractsForAccount(draft.id);

  const insight = draft.customer_insight || {};
  const intelligence = draft.intelligence || {};
  const dataMap = intelligence.data || {};
  const categories = intelligence.categories || {};

  /* ── 섹션 펼침/접힘 ── */
  const [expanded, setExpanded] = useState(['auto_basic', 'market_understanding', 'auto_competitor', 'pain_needs', 'auto_trade', 'auto_decision', 'biz_health']);
  const toggle = (key) => setExpanded(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);

  /* ═══ 자동 감지: ① 기본정보 완성도 ═══ */
  const autoBasic = useMemo(() => {
    const items = [
      { key: 'has_contacts', label: 'Key Contact 등록', filled: (draft.key_contacts || []).some(c => c.name?.trim()) },
      { key: 'has_dm', label: '결정권자(DM) 확인', filled: (draft.key_contacts || []).some(c => c.is_decision_maker) },
      { key: 'has_country', label: '국가/지역 설정', filled: !!(draft.country && draft.region) },
      { key: 'has_products', label: '담당 제품군 설정', filled: (draft.products || []).length > 0 },
    ];
    const filled = items.filter(i => i.filled).length;
    return { items, filled, total: items.length, pct: Math.round((filled / items.length) * 100) };
  }, [draft]);

  /* ═══ 자동 감지: ③ 경쟁사·공급자 파악 ═══ */
  const autoCompetitor = useMemo(() => {
    const competitors = insight.supplier?.competitors || [];
    const items = [
      { key: 'has_position', label: '공급자 지위 설정', filled: !!insight.supplier?.position },
      { key: 'has_competitors', label: '경쟁 공급사 등록', filled: competitors.length > 0 },
      { key: 'has_substitute', label: '대체재 탐색 여부', filled: !!insight.supplier?.substitute_search },
      { key: 'has_strategic', label: '전략 제품 설정', filled: (insight.supplier?.strategic_products || []).length > 0 },
      { key: 'has_comp_price', label: '경쟁사 가격 수준', filled: competitors.some(c => c.price_level) },
    ];
    const filled = items.filter(i => i.filled).length;
    return { items, filled, total: items.length, pct: Math.round((filled / items.length) * 100) };
  }, [insight]);

  /* ═══ 자동 감지: ⑤ 거래조건 파악 ═══ */
  const autoTrade = useMemo(() => {
    const hasContract = contracts.length > 0;
    const hasPrice = contracts.some(c => c.unit_price > 0);
    const hasTerms = contracts.some(c => c.net_terms);
    const hasMoq = contracts.some(c => c.moq > 0);
    const hasExpiry = contracts.some(c => c.contract_expiry);
    const items = [
      { key: 'has_contract', label: '계약 등록', filled: hasContract },
      { key: 'has_price', label: '단가 설정', filled: hasPrice },
      { key: 'has_terms', label: '결제조건 설정', filled: hasTerms },
      { key: 'has_moq', label: 'MOQ/계약수량 설정', filled: hasMoq },
      { key: 'has_expiry', label: '계약 만료일 설정', filled: hasExpiry },
    ];
    const filled = items.filter(i => i.filled).length;
    return { items, filled, total: items.length, pct: Math.round((filled / items.length) * 100) };
  }, [contracts]);

  /* ═══ 자동 감지: ⑥ 관계·의사결정 ═══ */
  const autoDecision = useMemo(() => {
    const items = [
      { key: 'has_kdm', label: '실질 결정권자 파악', filled: !!insight.decision?.key_decision_maker },
      { key: 'has_temp', label: '관계 온도 평가', filled: !!insight.decision?.relationship_temp },
      { key: 'has_champion', label: '내부 후원자 여부', filled: insight.decision?.has_champion !== undefined && insight.decision?.has_champion !== '' },
      { key: 'has_influencers', label: '구매 영향자 파악', filled: (insight.decision?.influencers || []).length > 0 },
    ];
    const filled = items.filter(i => i.filled).length;
    return { items, filled, total: items.length, pct: Math.round((filled / items.length) * 100) };
  }, [insight]);

  /* ═══ 직접 입력: ② 시장·채널 이해도 (Score에서 가져옴) ═══ */
  const marketCat = SCORE_CATEGORIES.find(c => c.key === 'market_understanding');
  /* ═══ 직접 입력: ④ Pain & Needs (Score에서 가져옴) ═══ */
  const painCat = SCORE_CATEGORIES.find(c => c.key === 'pain_needs');

  const isItemFilled = useCallback((itemKey) => {
    const val = dataMap[itemKey];
    return val !== undefined && val !== null && String(val).trim() !== '';
  }, [dataMap]);

  const isItemCheckedLegacy = useCallback((catKey, itemKey) => {
    return !!categories[catKey]?.items?.[itemKey];
  }, [categories]);

  const isItemComplete = useCallback((catKey, itemKey) => {
    return isItemFilled(itemKey) || isItemCheckedLegacy(catKey, itemKey);
  }, [isItemFilled, isItemCheckedLegacy]);

  const getManualCatStats = useCallback((cat) => {
    const filled = cat.items.filter(it => isItemComplete(cat.key, it.key)).length;
    return { filled, total: cat.items.length, pct: Math.round((filled / cat.items.length) * 100) };
  }, [isItemComplete]);

  /* ── Score 데이터 변경 핸들러 (기존 intelligence 구조 유지) ── */
  const handleScoreChange = useCallback((catKey, itemKey, value) => {
    const newData = { ...dataMap, [itemKey]: value };
    const newCategories = { ...categories };
    for (const cat of SCORE_CATEGORIES) {
      const items = {};
      for (const it of cat.items) {
        const v = cat.key === catKey && it.key === itemKey ? value : newData[it.key];
        const filled = v !== undefined && v !== null && String(v).trim() !== '';
        const legacyChecked = !!categories[cat.key]?.items?.[it.key];
        items[it.key] = filled || legacyChecked;
      }
      const checked = cat.items.filter(it => items[it.key]).length;
      newCategories[cat.key] = { score: Math.round((checked / cat.items.length) * 100), items };
    }
    const totalScore = computeIntelligenceScore(newCategories);
    update({
      intelligence: {
        ...intelligence,
        total_score: totalScore,
        categories: newCategories,
        data: newData,
        last_updated: today(),
      },
    });
  }, [dataMap, categories, intelligence, update]);

  /* ═══ 비즈니스 건강도 ═══ */
  const bizHealthStats = useMemo(() => {
    const items = [
      { key: 'revenue', filled: !!insight.health?.revenue_trend },
      { key: 'budget', filled: !!insight.health?.budget_trend },
      { key: 'contact', filled: !!insight.health?.contact_change },
      { key: 'expansion', filled: !!insight.health?.expansion_notes },
    ];
    const filled = items.filter(i => i.filled).length;
    return { filled, total: items.length, pct: Math.round((filled / items.length) * 100) };
  }, [insight]);

  /* ═══════════════════════════════════
     통합 진척률 계산 (가중치 적용)
     ═══════════════════════════════════ */
  const marketStats = getManualCatStats(marketCat);
  const painStats = getManualCatStats(painCat);

  const overallProgress = useMemo(() => {
    // 가중치: 기본10 + 시장15 + 경쟁20 + Pain25 + 거래20 + 관계10 = 100%
    // + 건강도는 보너스 표시 (진척률에는 포함하되 낮은 가중치)
    const sections = [
      { pct: autoBasic.pct, weight: 0.08 },
      { pct: marketStats.pct, weight: 0.15 },
      { pct: autoCompetitor.pct, weight: 0.18 },
      { pct: painStats.pct, weight: 0.22 },
      { pct: autoTrade.pct, weight: 0.17 },
      { pct: autoDecision.pct, weight: 0.10 },
      { pct: bizHealthStats.pct, weight: 0.10 },
    ];
    const total = Math.round(sections.reduce((s, sec) => s + sec.pct * sec.weight, 0));
    return total;
  }, [autoBasic, marketStats, autoCompetitor, painStats, autoTrade, autoDecision, bizHealthStats]);

  // intelligence.total_score 동기화 (통합 진척률)
  const syncScore = useCallback(() => {
    if ((intelligence.total_score ?? 0) !== overallProgress) {
      update({
        intelligence: {
          ...intelligence,
          total_score: overallProgress,
          last_updated: today(),
        },
      });
    }
  }, [intelligence, overallProgress, update]);

  // 렌더 시 동기화 (side effect 없이 상태 반영)
  useMemo(() => {
    if (draft.id && (intelligence.total_score ?? 0) !== overallProgress) {
      // defer update to avoid render loop
      setTimeout(() => syncScore(), 0);
    }
  }, [overallProgress]);

  const colorCls = scoreColorClass(overallProgress).replace('score-', '');

  /* ── Insight 헬퍼 ── */
  const setInsight = (section, field, value) => {
    const prev = insight[section] || {};
    update({
      customer_insight: {
        ...insight,
        [section]: { ...prev, [field]: value },
        last_updated: today(),
      },
    });
  };

  const competitors = insight.supplier?.competitors || [];
  const setCompetitor = (idx, field, value) => {
    const next = [...competitors]; next[idx] = { ...next[idx], [field]: value };
    setInsight('supplier', 'competitors', next);
  };
  const addCompetitor = () => setInsight('supplier', 'competitors', [...competitors, { name: '', share: '', price_level: '', products: '' }]);
  const removeCompetitor = (idx) => setInsight('supplier', 'competitors', competitors.filter((_, i) => i !== idx));

  const influencers = insight.decision?.influencers || [];
  const setInfluencer = (idx, field, value) => {
    const next = [...influencers]; next[idx] = { ...next[idx], [field]: value };
    setInsight('decision', 'influencers', next);
  };
  const addInfluencer = () => setInsight('decision', 'influencers', [...influencers, { name: '', role: '', dept: '' }]);
  const removeInfluencer = (idx) => setInsight('decision', 'influencers', influencers.filter((_, i) => i !== idx));

  /* ═══ 자동감지 섹션 렌더러 ═══ */
  const renderAutoSection = (key, icon, title, stats, note) => (
    <div style={SECTION_STYLE}>
      <div style={HEADER_STYLE} onClick={() => toggle(key)}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        {title}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`score-badge ${stats.pct >= 70 ? 'green' : stats.pct >= 40 ? 'yellow' : 'red'}`}>{stats.filled}/{stats.total}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: stats.pct >= 70 ? 'var(--green)' : stats.pct >= 40 ? 'var(--yellow)' : 'var(--red)' }}>{stats.pct}%</span>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{expanded.includes(key) ? '▲' : '▼'}</span>
        </span>
      </div>
      {expanded.includes(key) && (
        <div>
          {note && <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 8, fontStyle: 'italic' }}>{note}</div>}
          {stats.items.map(item => (
            <div key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
              <StatusIcon filled={item.filled} auto />
              <span style={{ color: item.filled ? 'var(--text)' : 'var(--text3)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ═══ 직접 입력 Score 섹션 렌더러 ═══ */
  const renderScoreSection = (cat, stats) => (
    <div style={SECTION_STYLE} key={cat.key}>
      <div style={HEADER_STYLE} onClick={() => toggle(cat.key)}>
        <span style={{ fontSize: 15 }}>{cat.key === 'market_understanding' ? '🌍' : '💡'}</span>
        {cat.label}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`score-badge ${stats.pct >= 70 ? 'green' : stats.pct >= 40 ? 'yellow' : 'red'}`}>{stats.filled}/{stats.total}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: stats.pct >= 70 ? 'var(--green)' : stats.pct >= 40 ? 'var(--yellow)' : 'var(--red)' }}>{stats.pct}%</span>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{expanded.includes(cat.key) ? '▲' : '▼'}</span>
        </span>
      </div>
      {expanded.includes(cat.key) && (
        <div>
          {cat.items.map(item => {
            const complete = isItemComplete(cat.key, item.key);
            const val = dataMap[item.key] ?? '';
            return (
              <div key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <StatusIcon filled={complete} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3, color: complete ? 'var(--text1)' : 'var(--text2)' }}>{item.label}</div>
                  <InputField item={item} value={val} onChange={v => handleScoreChange(cat.key, item.key, v)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* ═══ 통합 진척률 Summary ═══ */}
      <div className="intel-summary">
        <div className={`intel-score-big ${colorCls}`}>{overallProgress}%</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Customer Insight</div>
          <div className="score-gauge" style={{ height: 10 }}>
            <div className={`score-gauge-fill ${colorCls}`} style={{ width: `${overallProgress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text3)' }}>
            <span>0%</span>
            <span className={`score-badge ${colorCls}`}>
              {overallProgress >= 70 ? '양호' : overallProgress >= 50 ? '주의' : overallProgress >= 30 ? '경고' : '미입력'}
            </span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* ── 섹션별 진행 요약 바 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16, fontSize: 9, textAlign: 'center' }}>
        {[
          { label: '기본정보', pct: autoBasic.pct },
          { label: '시장이해', pct: marketStats.pct },
          { label: '경쟁/공급', pct: autoCompetitor.pct },
          { label: 'Pain&Needs', pct: painStats.pct },
          { label: '거래조건', pct: autoTrade.pct },
          { label: '관계/결정', pct: autoDecision.pct },
          { label: '건강도', pct: bizHealthStats.pct },
        ].map(s => (
          <div key={s.label}>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
              <div style={{ width: `${s.pct}%`, height: '100%', background: s.pct >= 70 ? 'var(--green)' : s.pct >= 40 ? 'var(--yellow)' : 'var(--red)', borderRadius: 2 }} />
            </div>
            <div style={{ color: 'var(--text3)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ═══ ① 기본정보 완성도 (자동 감지) ═══ */}
      {renderAutoSection('auto_basic', '📋', '기본정보 완성도', autoBasic, '기본정보 탭에서 자동 감지됩니다')}

      {/* ═══ ② 시장·채널 이해도 (직접 입력) ═══ */}
      {renderScoreSection(marketCat, marketStats)}

      {/* ═══ ③ 경쟁사·공급자 파악 (Insight 공급자지위) ═══ */}
      <div style={SECTION_STYLE}>
        <div style={HEADER_STYLE} onClick={() => toggle('auto_competitor')}>
          <span style={{ fontSize: 15 }}>⚔️</span>
          경쟁사·공급자 파악
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`score-badge ${autoCompetitor.pct >= 70 ? 'green' : autoCompetitor.pct >= 40 ? 'yellow' : 'red'}`}>{autoCompetitor.filled}/{autoCompetitor.total}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: autoCompetitor.pct >= 70 ? 'var(--green)' : autoCompetitor.pct >= 40 ? 'var(--yellow)' : 'var(--red)' }}>{autoCompetitor.pct}%</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>{expanded.includes('auto_competitor') ? '▲' : '▼'}</span>
          </span>
        </div>
        {expanded.includes('auto_competitor') && (
          <div>
            <div className="form-row">
              <div className="form-group">
                <label>우리의 공급자 지위</label>
                <select value={insight.supplier?.position || ''} onChange={e => setInsight('supplier', 'position', e.target.value)}>
                  <option value="">선택</option>
                  {SUPPLIER_POSITIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>대체재 탐색 여부</label>
                <select value={insight.supplier?.substitute_search || ''} onChange={e => setInsight('supplier', 'substitute_search', e.target.value)}>
                  <option value="">선택</option>
                  {SUBSTITUTE_SEARCH.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 6 }}>
              <label>전략 제품</label>
              <div className="products-grid">
                {PRODUCTS.map(p => (
                  <label key={p} className="prod-check">
                    <input type="checkbox" checked={(insight.supplier?.strategic_products || []).includes(p)}
                      onChange={() => {
                        const cur = insight.supplier?.strategic_products || [];
                        setInsight('supplier', 'strategic_products', cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]);
                      }} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>경쟁 공급사</label>
              <button className="btn btn-ghost btn-sm" onClick={addCompetitor}>+ 추가</button>
            </div>
            {competitors.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 8 }}>등록된 경쟁사 없음</div>
              : competitors.map((c, idx) => (
                <div key={idx} className="contact-card" style={{ position: 'relative' }}>
                  <button className="remove-contact" onClick={() => removeCompetitor(idx)}>✕</button>
                  <div className="form-row">
                    <div className="form-group"><label>업체명</label><input type="text" value={c.name || ''} onChange={e => setCompetitor(idx, 'name', e.target.value)} placeholder="경쟁사명" /></div>
                    <div className="form-group"><label>점유율</label><input type="text" value={c.share || ''} onChange={e => setCompetitor(idx, 'share', e.target.value)} placeholder="예: 30%" /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>가격 수준</label>
                      <select value={c.price_level || ''} onChange={e => setCompetitor(idx, 'price_level', e.target.value)}>
                        <option value="">선택</option>
                        {COMPETITOR_PRICE_LEVELS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>경쟁 제품</label><input type="text" value={c.products || ''} onChange={e => setCompetitor(idx, 'products', e.target.value)} placeholder="제품명" /></div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ═══ ④ Pain & Needs (직접 입력) ═══ */}
      {renderScoreSection(painCat, painStats)}

      {/* ═══ ⑤ 거래조건 파악 (자동 감지) ═══ */}
      {renderAutoSection('auto_trade', '💰', '거래조건 파악', autoTrade, '가격·계약 탭에서 자동 감지됩니다')}

      {/* ═══ ⑥ 관계·의사결정 구조 ═══ */}
      <div style={SECTION_STYLE}>
        <div style={HEADER_STYLE} onClick={() => toggle('auto_decision')}>
          <span style={{ fontSize: 15 }}>👥</span>
          관계·의사결정 구조
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`score-badge ${autoDecision.pct >= 70 ? 'green' : autoDecision.pct >= 40 ? 'yellow' : 'red'}`}>{autoDecision.filled}/{autoDecision.total}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: autoDecision.pct >= 70 ? 'var(--green)' : autoDecision.pct >= 40 ? 'var(--yellow)' : 'var(--red)' }}>{autoDecision.pct}%</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>{expanded.includes('auto_decision') ? '▲' : '▼'}</span>
          </span>
        </div>
        {expanded.includes('auto_decision') && (
          <div>
            <div className="form-row">
              <div className="form-group"><label>실질 결정권자</label>
                <input type="text" value={insight.decision?.key_decision_maker || ''} onChange={e => setInsight('decision', 'key_decision_maker', e.target.value)} placeholder="이름 / 직책" />
              </div>
              <div className="form-group"><label>관계 온도</label>
                <select value={insight.decision?.relationship_temp || ''} onChange={e => setInsight('decision', 'relationship_temp', e.target.value)}>
                  <option value="">선택</option>
                  {RELATIONSHIP_TEMPS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>내부 후원자 (Champion)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="prod-check">
                    <input type="checkbox" checked={!!insight.decision?.has_champion} onChange={e => setInsight('decision', 'has_champion', e.target.checked)} /> 있음
                  </label>
                  {insight.decision?.has_champion && (
                    <input type="text" value={insight.decision?.champion_name || ''} onChange={e => setInsight('decision', 'champion_name', e.target.value)} placeholder="이름/직책" style={{ flex: 1 }} />
                  )}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>구매 영향자</label>
              <button className="btn btn-ghost btn-sm" onClick={addInfluencer}>+ 추가</button>
            </div>
            {influencers.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 8 }}>등록된 영향자 없음</div>
              : influencers.map((inf, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                  <input type="text" value={inf.name || ''} onChange={e => setInfluencer(idx, 'name', e.target.value)} placeholder="이름" style={{ flex: 1 }} />
                  <select value={inf.role || ''} onChange={e => setInfluencer(idx, 'role', e.target.value)} style={{ width: 80 }}>
                    <option value="">역할</option>
                    {INFLUENCER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input type="text" value={inf.dept || ''} onChange={e => setInfluencer(idx, 'dept', e.target.value)} placeholder="부서" style={{ width: 90 }} />
                  <button className="btn btn-danger btn-sm" onClick={() => removeInfluencer(idx)} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button>
                </div>
              ))}
            <div className="form-group" style={{ marginTop: 8 }}>
              <label>의사결정 프로세스 메모</label>
              <textarea value={insight.decision?.process_notes || ''} onChange={e => setInsight('decision', 'process_notes', e.target.value)}
                placeholder="구매 결정까지의 프로세스, 승인 단계, 리드타임 등" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12 }} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ ⑦ 비즈니스 건강도 ═══ */}
      <div style={SECTION_STYLE}>
        <div style={HEADER_STYLE} onClick={() => toggle('biz_health')}>
          <span style={{ fontSize: 15 }}>💊</span>
          비즈니스 건강도
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`score-badge ${bizHealthStats.pct >= 70 ? 'green' : bizHealthStats.pct >= 40 ? 'yellow' : 'red'}`}>{bizHealthStats.filled}/{bizHealthStats.total}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: bizHealthStats.pct >= 70 ? 'var(--green)' : bizHealthStats.pct >= 40 ? 'var(--yellow)' : 'var(--red)' }}>{bizHealthStats.pct}%</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>{expanded.includes('biz_health') ? '▲' : '▼'}</span>
          </span>
        </div>
        {expanded.includes('biz_health') && (
          <div>
            <div className="form-row">
              <div className="form-group"><label>매출 성장 추세</label>
                <select value={insight.health?.revenue_trend || ''} onChange={e => setInsight('health', 'revenue_trend', e.target.value)}>
                  <option value="">선택</option>
                  {BIZ_HEALTH_OPTIONS.revenue_trend.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group"><label>구매 예산 동향</label>
                <select value={insight.health?.budget_trend || ''} onChange={e => setInsight('health', 'budget_trend', e.target.value)}>
                  <option value="">선택</option>
                  {BIZ_HEALTH_OPTIONS.budget_trend.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>담당자 변동</label>
                <select value={insight.health?.contact_change || ''} onChange={e => setInsight('health', 'contact_change', e.target.value)}>
                  <option value="">선택</option>
                  {BIZ_HEALTH_OPTIONS.contact_change.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group"><label>변동일</label>
                <input type="date" value={insight.health?.contact_change_date || ''} onChange={e => setInsight('health', 'contact_change_date', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 6 }}>
              <label>사업 확장 이슈</label>
              <textarea value={insight.health?.expansion_notes || ''} onChange={e => setInsight('health', 'expansion_notes', e.target.value)}
                placeholder="신규 시장 진출, M&A, 라인 증설, 구조조정 등" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
