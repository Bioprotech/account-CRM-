import { useState } from 'react';
import { useAccount } from '../../context/AccountContext';
import { PRODUCTS } from '../../lib/constants';
import { today, genId, fmtDate } from '../../lib/utils';

export default function PriceContract({ accountId }) {
  const { getContractsForAccount, saveContractItem, removeContract } = useAccount();
  const allContracts = getContractsForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    product_category: '',
    unit_price: '',
    currency: 'USD',
    net_terms: '',
    moq: '',
    contract_expiry: '',
  });

  const resetForm = () => {
    setForm({ product_category: '', unit_price: '', currency: 'USD', net_terms: '', moq: '', contract_expiry: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = () => {
    if (!form.product_category) return;

    if (editingId) {
      // 기존 계약 수정 → 변경 로그 추가
      const existing = allContracts.find(c => c.id === editingId);
      const changeLog = {
        date: today(),
        prev_price: existing?.unit_price,
        new_price: parseFloat(form.unit_price) || 0,
        prev_terms: existing?.net_terms,
        new_terms: form.net_terms,
        reason: '조건 업데이트',
      };

      saveContractItem({
        ...existing,
        product_category: form.product_category,
        unit_price: parseFloat(form.unit_price) || 0,
        currency: form.currency,
        net_terms: form.net_terms,
        moq: parseInt(form.moq) || 0,
        contract_expiry: form.contract_expiry,
        change_logs: [...(existing?.change_logs || []), changeLog],
        updated_at: today(),
      });
    } else {
      // 신규 추가
      saveContractItem({
        id: genId('ctr'),
        account_id: accountId,
        product_category: form.product_category,
        unit_price: parseFloat(form.unit_price) || 0,
        currency: form.currency,
        net_terms: form.net_terms,
        moq: parseInt(form.moq) || 0,
        contract_expiry: form.contract_expiry,
        change_logs: [],
        updated_at: today(),
      });
    }
    resetForm();
  };

  const startEdit = (c) => {
    setForm({
      product_category: c.product_category,
      unit_price: c.unit_price?.toString() || '',
      currency: c.currency || 'USD',
      net_terms: c.net_terms || '',
      moq: c.moq?.toString() || '',
      contract_expiry: c.contract_expiry || '',
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const getDaysUntilExpiry = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  return (
    <div>
      {/* 액션 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>가격·계약 조건 ({allContracts.length}건)</span>
        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? '취소' : '+ 조건 추가'}
        </button>
      </div>

      {/* 폼 */}
      {showForm && (
        <div className="activity-form">
          <div className="form-row">
            <div className="form-group">
              <label>제품군 *</label>
              <select value={form.product_category} onChange={e => setForm(p => ({ ...p, product_category: e.target.value }))}>
                <option value="">선택</option>
                {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>계약 만료일</label>
              <input type="date" value={form.contract_expiry} onChange={e => setForm(p => ({ ...p, contract_expiry: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>단가</label>
              <input type="number" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="단가" />
            </div>
            <div className="form-group">
              <label>통화</label>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="KRW">KRW</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>결제조건 (NET terms)</label>
              <input type="text" value={form.net_terms} onChange={e => setForm(p => ({ ...p, net_terms: e.target.value }))} placeholder="예: NET 30, T/T in advance" />
            </div>
            <div className="form-group">
              <label>MOQ</label>
              <input type="number" value={form.moq} onChange={e => setForm(p => ({ ...p, moq: e.target.value }))} placeholder="최소 주문 수량" />
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={!form.product_category}>
              {editingId ? '수정' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* 계약 목록 */}
      {allContracts.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📋</div>
          <p>가격·계약 조건이 없습니다.<br />'+ 조건 추가'로 등록하세요.</p>
        </div>
      ) : (
        <div>
          {allContracts.map(c => {
            const daysLeft = getDaysUntilExpiry(c.contract_expiry);
            const isExpiringSoon = daysLeft !== null && daysLeft <= 60;

            return (
              <div key={c.id} className="card" style={{ marginBottom: 12, border: isExpiringSoon ? `2px solid ${daysLeft <= 30 ? 'var(--red)' : 'var(--yellow)'}` : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{c.product_category}</span>
                    {daysLeft !== null && daysLeft <= 60 && (
                      <span className={`score-badge ${daysLeft <= 30 ? 'red' : 'yellow'}`} style={{ marginLeft: 8 }}>
                        {daysLeft <= 0 ? '만료됨' : `D-${daysLeft}`}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>수정</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeContract(c.id)}>삭제</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>단가</div>
                    <div style={{ fontWeight: 600 }}>{c.currency} {(c.unit_price || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>결제조건</div>
                    <div>{c.net_terms || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>MOQ</div>
                    <div>{c.moq ? c.moq.toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>계약 만료</div>
                    <div>{c.contract_expiry || '-'}</div>
                  </div>
                </div>

                {/* 변경 이력 */}
                {(c.change_logs || []).length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>조건 변경 이력</div>
                    {c.change_logs.slice(-3).map((log, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text2)', padding: '2px 0' }}>
                        <span style={{ color: 'var(--text3)' }}>{log.date}</span>
                        {' | '}
                        단가: {log.prev_price?.toLocaleString()} → <strong>{log.new_price?.toLocaleString()}</strong>
                        {log.prev_terms !== log.new_terms && <span> | 조건: {log.prev_terms} → {log.new_terms}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
