import { REGIONS, PRODUCTS, BUSINESS_TYPES, CONTRACT_STATUSES, STRATEGIC_TIERS, CUSTOMER_CATEGORIES } from '../../lib/constants';
import { useAccount } from '../../context/AccountContext';
import { suggestCustomerCategory, loadPriorYearCustomers } from '../../lib/customerClassification';
import { useMemo } from 'react';

const TYPE_TRANSITIONS = {
  'Single → Multiple': '재구매 전환 성공',
  'Multiple → Private': '대리점 전환 성공',
  '입찰 → Multiple': '로컬판매 전환 성공',
  '가격민감 → Multiple': '장기 고객 전환 성공',
};

export default function BasicInfo({ draft, update }) {
  const { teamMembers, businessPlans, appSettings } = useAccount();

  // v3.12: 자동 분류 추천 계산
  const priorSet = useMemo(() => {
    if (appSettings?.priorYearCustomers && Array.isArray(appSettings.priorYearCustomers)) {
      return new Set(appSettings.priorYearCustomers);
    }
    return loadPriorYearCustomers();
  }, [appSettings]);
  const suggestedCategory = useMemo(() => {
    if (!draft.id) return 'unclassified';
    return suggestCustomerCategory({
      account: draft,
      customerPlans: (businessPlans || []).filter(p => p.type === 'customer' || !p.type),
      priorSet,
    });
  }, [draft, businessPlans, priorSet]);
  const currentCategory = draft.customer_category || 'unclassified';
  const categoryMatchesSuggestion = currentCategory === suggestedCategory;
  const updateContact = (idx, field, value) => {
    const next = [...draft.key_contacts];
    next[idx] = { ...next[idx], [field]: value };
    update({ key_contacts: next });
  };

  const addContact = () => {
    update({
      key_contacts: [...(draft.key_contacts || []), { name: '', title: '', email: '', phone: '', is_decision_maker: false }]
    });
  };

  const removeContact = (idx) => {
    update({ key_contacts: draft.key_contacts.filter((_, i) => i !== idx) });
  };

  const toggleProduct = (p) => {
    const prods = draft.products || [];
    update({ products: prods.includes(p) ? prods.filter(x => x !== p) : [...prods, p] });
  };

  return (
    <div>
      {/* 회사 기본정보 */}
      <div className="form-row">
        <div className="form-group">
          <label>회사명 *</label>
          <input type="text" value={draft.company_name || ''} onChange={e => update({ company_name: e.target.value })} placeholder="회사명 입력" />
        </div>
        <div className="form-group">
          <label>국가</label>
          <input type="text" value={draft.country || ''} onChange={e => update({ country: e.target.value })} placeholder="국가명" />
        </div>
      </div>

      {/* v3.12: 고객 분류 — 통계 안정화 (저장된 값으로 분류, 매번 계산 X) */}
      <div className="form-row full">
        <div className="form-group">
          <label>
            🏷️ 고객 분류
            <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
              CRM 통계 기준 — 저장된 값 사용 (매번 계산 X)
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={currentCategory}
              onChange={e => update({ customer_category: e.target.value })}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, minWidth: 200 }}
            >
              {CUSTOMER_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}{c.key === 'unclassified' ? ' (미설정)' : ''}</option>
              ))}
            </select>
            {!categoryMatchesSuggestion && (
              <button
                type="button"
                onClick={() => update({ customer_category: suggestedCategory })}
                style={{
                  fontSize: 10, padding: '4px 10px',
                  background: 'rgba(46,125,50,0.08)', border: '1px solid var(--accent)',
                  color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                }}
                title={`자동 추천: ${CUSTOMER_CATEGORIES.find(c => c.key === suggestedCategory)?.label}`}
              >
                🔄 자동 추천 적용 ({CUSTOMER_CATEGORIES.find(c => c.key === suggestedCategory)?.icon} {CUSTOMER_CATEGORIES.find(c => c.key === suggestedCategory)?.label})
              </button>
            )}
            {categoryMatchesSuggestion && currentCategory !== 'unclassified' && (
              <span style={{ fontSize: 10, color: 'var(--green, #16a34a)', fontWeight: 600 }}>
                ✓ 자동 추천과 일치
              </span>
            )}
          </div>
          {currentCategory !== 'unclassified' && (() => {
            const meta = CUSTOMER_CATEGORIES.find(c => c.key === currentCategory);
            return meta ? (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                ※ {meta.desc}
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* v3.11: 별칭(Alias) — 영업현황에 다른 이름으로 표기될 때 자동 매칭 */}
      <div className="form-row full">
        <div className="form-group">
          <label>
            🔗 별칭 / 다른 표기명 (Alias)
            <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
              영업현황 import 시 이 이름들도 같은 고객으로 인식됨
            </span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', minHeight: 36 }}>
            {(draft.aliases || []).map((alias, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', background: 'rgba(46,125,50,0.08)',
                color: 'var(--accent)', borderRadius: 4, fontSize: 11, fontWeight: 600,
              }}>
                {alias}
                <button
                  type="button"
                  onClick={() => {
                    const next = [...(draft.aliases || [])];
                    next.splice(i, 1);
                    update({ aliases: next });
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: 0 }}
                  title="삭제"
                >×</button>
              </span>
            ))}
            <input
              type="text"
              placeholder="+ 별칭 추가 후 Enter (예: AMBIDERM Guatemala)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = e.target.value.trim();
                  if (!v) return;
                  const current = draft.aliases || [];
                  if (current.some(a => a.toLowerCase().trim() === v.toLowerCase().trim())) {
                    e.target.value = '';
                    return;
                  }
                  if (v.toLowerCase().trim() === (draft.company_name || '').toLowerCase().trim()) {
                    alert('회사명과 동일한 별칭은 추가할 수 없습니다.');
                    return;
                  }
                  update({ aliases: [...current, v] });
                  e.target.value = '';
                }
              }}
              style={{ flex: 1, minWidth: 200, border: 'none', outline: 'none', background: 'transparent', fontSize: 11, padding: '3px 6px' }}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>지역</label>
          <select value={draft.region || ''} onChange={e => update({ region: e.target.value })}>
            <option value="">선택</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>사업형태</label>
          <select value={draft.business_type || ''} onChange={e => {
            const oldType = draft.business_type || '';
            const newType = e.target.value;
            const changes = { business_type: newType };
            if (oldType && newType && oldType !== newType) {
              const history = [...(draft.type_history || [])];
              history.push({ from: oldType, to: newType, date: new Date().toISOString().slice(0, 10) });
              changes.type_history = history;
            }
            update(changes);
          }}>
            <option value="">선택</option>
            {BUSINESS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {draft.type_history?.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text3)' }}>
              {draft.type_history.map((h, i) => {
                const key = `${h.from} → ${h.to}`;
                const label = TYPE_TRANSITIONS[key] || '유형 변경';
                return (
                  <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ color: 'var(--accent)' }}>↗</span>
                    <span>{h.from} → {h.to}</span>
                    <span style={{ color: 'var(--green)', fontSize: 9 }}>({label})</span>
                    <span style={{ marginLeft: 'auto' }}>{h.date}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>담당자</label>
          <select value={draft.sales_rep || ''} onChange={e => update({ sales_rep: e.target.value })}>
            <option value="">선택</option>
            {teamMembers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>계약 상태</label>
          <select value={draft.contract_status || ''} onChange={e => update({ contract_status: e.target.value })}>
            <option value="">선택</option>
            {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>거래 시작일</label>
          <input type="date" value={draft.trade_start_date || ''} onChange={e => update({ trade_start_date: e.target.value })} />
        </div>
        <div className="form-group">
          <label>전략 등급</label>
          <select value={draft.strategic_tier || ''} onChange={e => update({ strategic_tier: e.target.value })}>
            <option value="">미설정</option>
            {STRATEGIC_TIERS.map(t => (
              <option key={t.key} value={t.key}>{t.key} — {t.label}</option>
            ))}
          </select>
          {draft.strategic_tier && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text3)' }}>
              {STRATEGIC_TIERS.find(t => t.key === draft.strategic_tier)?.desc}
            </div>
          )}
        </div>
      </div>

      {/* 현재 컨텍스트 메모 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>현재 컨텍스트 메모</label>
        <textarea
          value={draft.context_memo || ''}
          onChange={e => update({ context_memo: e.target.value })}
          placeholder="이 고객의 현재 상황을 한 줄로 요약 (예: Q2 예산 삭감 중. 하반기 재검토 예정. 단가 인하 압박 있음.)"
          rows={2}
          style={{ width: '100%', resize: 'vertical', fontSize: 12 }}
        />
      </div>

      {/* 담당 제품군 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>담당 제품군</label>
        <div className="products-grid">
          {PRODUCTS.map(p => (
            <label key={p} className="prod-check">
              <input type="checkbox" checked={(draft.products || []).includes(p)} onChange={() => toggleProduct(p)} />
              {p}
            </label>
          ))}
        </div>
      </div>

      {/* Key Contacts */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>고객사 Key Contact</label>
          <button className="btn btn-ghost btn-sm" onClick={addContact}>+ 연락처 추가</button>
        </div>

        {(draft.key_contacts || []).map((c, idx) => (
          <div key={idx} className="contact-card">
            {(draft.key_contacts || []).length > 1 && (
              <button className="remove-contact" onClick={() => removeContact(idx)}>✕</button>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>이름</label>
                <input type="text" value={c.name || ''} onChange={e => updateContact(idx, 'name', e.target.value)} placeholder="담당자명" />
              </div>
              <div className="form-group">
                <label>직책</label>
                <input type="text" value={c.title || ''} onChange={e => updateContact(idx, 'title', e.target.value)} placeholder="직책" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>이메일</label>
                <input type="email" value={c.email || ''} onChange={e => updateContact(idx, 'email', e.target.value)} placeholder="email@company.com" />
              </div>
              <div className="form-group">
                <label>전화</label>
                <input type="tel" value={c.phone || ''} onChange={e => updateContact(idx, 'phone', e.target.value)} placeholder="+00-000-0000" />
              </div>
            </div>
            <label className="prod-check" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={!!c.is_decision_maker} onChange={e => updateContact(idx, 'is_decision_maker', e.target.checked)} />
              결정권자 (Decision Maker)
              {c.is_decision_maker && <span className="dm-badge">DM</span>}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
