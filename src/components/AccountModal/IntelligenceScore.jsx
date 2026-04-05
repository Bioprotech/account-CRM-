import { useState, useCallback } from 'react';
import { SCORE_CATEGORIES } from '../../lib/constants';
import { computeIntelligenceScore, scoreColorClass } from '../../lib/utils';

/* ── 입력 필드 렌더러 ── */
function InputField({ item, value, onChange }) {
  const baseStyle = {
    width: '100%',
    fontSize: '12px',
    padding: '4px 6px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    background: 'var(--bg2, #fff)',
    color: 'var(--text1)',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  switch (item.inputType) {
    case 'textarea':
      return (
        <textarea
          style={{ ...baseStyle, resize: 'vertical', minHeight: '48px', maxHeight: '80px' }}
          rows={2}
          placeholder={item.placeholder || ''}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      );
    case 'select':
      return (
        <select
          style={{ ...baseStyle, cursor: 'pointer' }}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">-- 선택 --</option>
          {(item.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          type="number"
          style={baseStyle}
          placeholder={item.placeholder || ''}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      );
    default: // 'text'
      return (
        <input
          type="text"
          style={baseStyle}
          placeholder={item.placeholder || ''}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      );
  }
}

/* ── 완성 아이콘 ── */
function StatusIcon({ filled }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 18,
      height: 18,
      borderRadius: '50%',
      fontSize: '11px',
      flexShrink: 0,
      background: filled ? 'var(--green, #22c55e)' : 'var(--bg3, #e5e7eb)',
      color: filled ? '#fff' : 'var(--text3, #999)',
    }}>
      {filled ? '✓' : '—'}
    </span>
  );
}

/* ── 메인 컴포넌트 ── */
export default function IntelligenceScore({ draft, update }) {
  const [expanded, setExpanded] = useState(SCORE_CATEGORIES.map(c => c.key));

  const intelligence = draft.intelligence || {};
  const categories = intelligence.categories || {};
  const dataMap = intelligence.data || {};

  const toggleExpand = (key) => {
    setExpanded(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  /* data 값이 비어있지 않으면 checked=true */
  const isItemFilled = useCallback((itemKey) => {
    const val = dataMap[itemKey];
    return val !== undefined && val !== null && String(val).trim() !== '';
  }, [dataMap]);

  /* 하위 호환: 구 데이터에 data 필드 없고 categories.items 만 있는 경우 */
  const isItemCheckedLegacy = useCallback((catKey, itemKey) => {
    return !!categories[catKey]?.items?.[itemKey];
  }, [categories]);

  const isItemComplete = useCallback((catKey, itemKey) => {
    return isItemFilled(itemKey) || isItemCheckedLegacy(catKey, itemKey);
  }, [isItemFilled, isItemCheckedLegacy]);

  /* 입력 값 변경 핸들러 */
  const handleChange = useCallback((catKey, itemKey, value) => {
    const newData = { ...dataMap, [itemKey]: value };

    // categories의 checked 상태도 동기화
    const newCategories = { ...categories };
    for (const cat of SCORE_CATEGORIES) {
      const items = {};
      for (const it of cat.items) {
        const v = cat.key === catKey && it.key === itemKey ? value : newData[it.key];
        const filled = v !== undefined && v !== null && String(v).trim() !== '';
        // 하위 호환: 기존 checked 상태도 유지
        const legacyChecked = !!categories[cat.key]?.items?.[it.key];
        items[it.key] = filled || legacyChecked;
      }
      const checked = cat.items.filter(it => items[it.key]).length;
      const catScore = Math.round((checked / cat.items.length) * 100);
      newCategories[cat.key] = { score: catScore, items };
    }

    const totalScore = computeIntelligenceScore(newCategories);

    update({
      intelligence: {
        ...intelligence,
        total_score: totalScore,
        categories: newCategories,
        data: newData,
        last_updated: new Date().toISOString().slice(0, 10),
      },
    });
  }, [dataMap, categories, intelligence, update]);

  /* 점수 계산 (표시용) */
  const getCatStats = useCallback((cat) => {
    const filled = cat.items.filter(it => isItemComplete(cat.key, it.key)).length;
    const pct = Math.round((filled / cat.items.length) * 100);
    return { filled, total: cat.items.length, pct };
  }, [isItemComplete]);

  const totalScore = intelligence.total_score ?? 0;
  const colorCls = scoreColorClass(totalScore).replace('score-', '');

  return (
    <div>
      {/* Summary */}
      <div className="intel-summary">
        <div className={`intel-score-big ${colorCls}`}>{totalScore}%</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 4 }}>Intelligence Score</div>
          <div className="score-gauge" style={{ height: 10 }}>
            <div className={`score-gauge-fill ${colorCls}`} style={{ width: `${totalScore}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '10px', color: 'var(--text3)' }}>
            <span>0%</span>
            <span className={`score-badge ${colorCls}`}>
              {totalScore >= 70 ? '🟢 양호' : totalScore >= 50 ? '🟡 주의' : '🔴 경고'}
            </span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      {SCORE_CATEGORIES.map(cat => {
        const { filled, total, pct } = getCatStats(cat);
        const isOpen = expanded.includes(cat.key);

        return (
          <div key={cat.key} className="intel-category">
            <div className="intel-cat-header" onClick={() => toggleExpand(cat.key)}>
              <div>
                <span className="intel-cat-title">{cat.label}</span>
                <span className="intel-cat-weight">(가중치 {Math.round(cat.weight * 100)}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`score-badge ${pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red'}`}>
                  {filled}/{total}
                </span>
                <span className="intel-cat-score" style={{ color: pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)' }}>
                  {pct}%
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>
            {isOpen && (
              <div className="intel-cat-body">
                {cat.items.map(item => {
                  const complete = isItemComplete(cat.key, item.key);
                  const val = dataMap[item.key] ?? '';
                  return (
                    <div
                      key={item.key}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))',
                      }}
                    >
                      <StatusIcon filled={complete} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          marginBottom: 3,
                          color: complete ? 'var(--text1)' : 'var(--text2, #666)',
                        }}>
                          {item.label}
                        </div>
                        <InputField
                          item={item}
                          value={val}
                          onChange={(v) => handleChange(cat.key, item.key, v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
