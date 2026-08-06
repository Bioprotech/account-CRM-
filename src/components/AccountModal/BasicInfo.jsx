import { REGIONS, PRODUCTS, BUSINESS_TYPES, CONTRACT_STATUSES, STRATEGIC_TIERS, CUSTOMER_CATEGORIES, CUSTOMER_ANALYSIS_FIELDS } from '../../lib/constants';
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
  const { teamMembers, businessPlans, appSettings, contracts, isAdmin, t, te } = useAccount();

  // v3.32: 계약전환율 = contract_status === '활성' 기준 (기존 필드 그대로 활용)
  //   가이드 박스로 '활성' 판정 기준 안내. 계약 1건 이상이면 컨텍스트의
  //   saveContractItem이 자동으로 contract_status를 '활성'으로 설정 (override 가능).
  const acctContracts = useMemo(() => (contracts || []).filter(c => c.account_id === draft.id), [contracts, draft.id]);
  const hasContracts = acctContracts.length > 0;
  const isActiveStatus = draft.contract_status === '활성';

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
          <label>{t('basic.companyName')} *</label>
          <input type="text" value={draft.company_name || ''} onChange={e => update({ company_name: e.target.value })} placeholder={t('basic.companyName')} />
        </div>
        <div className="form-group">
          <label>{t('basic.country')}</label>
          <input type="text" value={draft.country || ''} onChange={e => update({ country: e.target.value })} placeholder={t('basic.country')} />
        </div>
      </div>

      {/* v3.12: 고객 분류 — 통계 안정화 (저장된 값으로 분류, 매번 계산 X) */}
      <div className="form-row full">
        <div className="form-group">
          <label>
            🏷️ {t('basic.customerCategory')}
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={currentCategory}
              onChange={e => update({ customer_category: e.target.value })}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, minWidth: 200 }}
            >
              {CUSTOMER_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon} {te(c.label)}{c.key === 'unclassified' ? '' : ''}</option>
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
            🔗 {t('basic.aliases')}
            <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
              {t('basic.aliasesHint')}
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
          <label>{t('basic.region')}</label>
          <select value={draft.region || ''} onChange={e => update({ region: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{t('basic.businessType')}</label>
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
            <option value="">{t('common.select')}</option>
            {BUSINESS_TYPES.map(b => <option key={b} value={b}>{te(b)}</option>)}
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
          <label>
            {t('basic.salesRep')}
            {isAdmin && draft.rep_locked && (
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>
                🔒 자동동기화 제외
                <button onClick={() => update({ rep_locked: false })}
                  style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)' }}>
                  해제
                </button>
              </span>
            )}
          </label>
          <select value={draft.sales_rep || ''} onChange={e => update({ sales_rep: e.target.value, ...(isAdmin ? { rep_locked: true } : {}) })}>
            <option value="">{t('common.select')}</option>
            {teamMembers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{t('basic.contractStatus')}</label>
          <select value={draft.contract_status || ''} onChange={e => update({ contract_status: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{te(s)}</option>)}
          </select>
        </div>
      </div>

      {/* v3.45: 공동 담당자 */}
      {teamMembers.filter(m => m !== draft.sales_rep).length > 0 && (
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>공동 담당자</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {teamMembers.filter(m => m !== draft.sales_rep).map(m => {
              const checked = (draft.co_reps || []).includes(m);
              return (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, background: checked ? 'rgba(46,125,50,.08)' : 'var(--bg2)' }}>
                  <input type="checkbox" checked={checked} onChange={e => {
                    const curr = draft.co_reps || [];
                    update({ co_reps: e.target.checked ? [...curr, m] : curr.filter(x => x !== m) });
                  }} style={{ accentColor: 'var(--accent)' }} />
                  {m}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* v3.32: 계약 상태 가이드 박스 (기존 contract_status 필드 활용 — 전환율 지표) */}
      <div style={{ marginBottom: 14, padding: 10, background: 'rgba(46,125,50,0.04)', border: '1px solid rgba(46,125,50,0.2)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--accent)' }}>
          {t('basic.contractGuideTitle')} — <span style={{ fontWeight: 400, color: 'var(--text2)' }}>{t('basic.contractGuideSubtitle')}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t('basic.contractGuideIntro')}
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
            <li>{t('basic.contractGuide1')}</li>
            <li>{t('basic.contractGuide2')}</li>
            <li>{t('basic.contractGuide3')}</li>
          </ul>
        </div>
        {hasContracts && !isActiveStatus && (
          <div style={{ marginTop: 6, padding: '4px 8px', background: 'rgba(217,119,6,0.08)', borderRadius: 4, fontSize: 11, color: '#d97706', fontWeight: 600 }}>
            {t('basic.contractWarn', { n: acctContracts.length })}
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t('basic.tradeStartDate')}</label>
          <input type="date" value={draft.trade_start_date || ''} onChange={e => update({ trade_start_date: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t('basic.strategicTier')}</label>
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
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>{t('basic.contextMemo')}</label>
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
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>{t('basic.products')}</label>
        <div className="products-grid">
          {PRODUCTS.map(p => (
            <label key={p} className="prod-check">
              <input type="checkbox" checked={(draft.products || []).includes(p)} onChange={() => toggleProduct(p)} />
              {p}
            </label>
          ))}
        </div>
      </div>

      {/* v3.46: 고객분석 섹션 */}
      {(() => {
        const ca = draft.intelligence_score?.customer_analysis?.items || {};
        const filledCount = CUSTOMER_ANALYSIS_FIELDS.filter(f => ca[f.key] && ca[f.key] !== '').length;
        const updateCA = (key, value) => update({
          intelligence_score: {
            ...draft.intelligence_score,
            customer_analysis: { items: { ...ca, [key]: value } },
          },
        });
        return (
          <details style={{ marginBottom: 16 }} open={filledCount === 0}>
            <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent)', padding: '6px 0', userSelect: 'none' }}>
              📊 고객분석
              <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text3)', fontSize: 10 }}>
                {filledCount}/{CUSTOMER_ANALYSIS_FIELDS.length} 항목 완료
              </span>
              <span style={{ marginLeft: 6, display: 'inline-block', width: 80, height: 4, background: 'var(--border)', borderRadius: 2, verticalAlign: 'middle', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.round(filledCount / CUSTOMER_ANALYSIS_FIELDS.length * 100)}%`, height: '100%', background: filledCount === CUSTOMER_ANALYSIS_FIELDS.length ? 'var(--accent)' : '#f59e0b', borderRadius: 2 }} />
              </span>
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 8 }}>
              {CUSTOMER_ANALYSIS_FIELDS.map(f => (
                <div key={f.key} className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 10 }}>{f.label}</label>
                  <select
                    value={ca[f.key] || ''}
                    onChange={e => updateCA(f.key, e.target.value)}
                    style={{ fontSize: 11, padding: '3px 6px' }}
                  >
                    <option value="">-- 선택 --</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 10 }}>관심 내역</label>
                <textarea
                  value={draft.ca_interest || ''}
                  onChange={e => update({ ca_interest: e.target.value })}
                  rows={2}
                  style={{ fontSize: 11, resize: 'vertical' }}
                  placeholder="관심 분야, 관심 제품군 등"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 10 }}>특이사항</label>
                <textarea
                  value={draft.ca_remark || ''}
                  onChange={e => update({ ca_remark: e.target.value })}
                  rows={2}
                  style={{ fontSize: 11, resize: 'vertical' }}
                  placeholder="주요 특이사항 메모"
                />
              </div>
            </div>
          </details>
        );
      })()}

      {/* Key Contacts */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>{t('basic.keyContacts')}</label>
          <button className="btn btn-ghost btn-sm" onClick={addContact}>+ 연락처 추가</button>
        </div>

        {(draft.key_contacts || []).map((c, idx) => (
          <div key={idx} className="contact-card">
            {(draft.key_contacts || []).length > 1 && (
              <button className="remove-contact" onClick={() => removeContact(idx)}>✕</button>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>{t('basic.contactName')}</label>
                <input type="text" value={c.name || ''} onChange={e => updateContact(idx, 'name', e.target.value)} placeholder="담당자명" />
              </div>
              <div className="form-group">
                <label>{t('basic.contactTitle')}</label>
                <input type="text" value={c.title || ''} onChange={e => updateContact(idx, 'title', e.target.value)} placeholder="직책" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('basic.contactEmail')}</label>
                <input type="email" value={c.email || ''} onChange={e => updateContact(idx, 'email', e.target.value)} placeholder="email@company.com" />
              </div>
              <div className="form-group">
                <label>{t('basic.contactPhone')}</label>
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
