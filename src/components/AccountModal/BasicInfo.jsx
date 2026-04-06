import { REGIONS, PRODUCTS, BUSINESS_TYPES, CONTRACT_STATUSES } from '../../lib/constants';
import { useAccount } from '../../context/AccountContext';

const TYPE_TRANSITIONS = {
  'Single → Multiple': '재구매 전환 성공',
  'Multiple → Private': '대리점 전환 성공',
  '입찰 → Multiple': '로컬판매 전환 성공',
  '가격민감 → Multiple': '장기 고객 전환 성공',
};

export default function BasicInfo({ draft, update }) {
  const { teamMembers } = useAccount();
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
        <div className="form-group" />
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
