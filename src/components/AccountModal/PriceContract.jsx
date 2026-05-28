import { useState } from 'react';
import { useAccount } from '../../context/AccountContext';
import { PRODUCTS } from '../../lib/constants';
import { today, genId, fmtDate } from '../../lib/utils';

export default function PriceContract({ accountId }) {
  const { getContractsForAccount, saveContractItem, removeContract, t } = useAccount();
  const allContracts = getContractsForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    product_category: '',
    unit_price: '',
    currency: 'USD',
    net_terms: '',
    moq: '',
    contract_qty: '',
    contract_expiry: '',
    contract_start: '',
    // v3.17 Phase A4: 분할 발주 스케줄
    // [{ date: 'YYYY-MM-DD', qty: 1000, note: '1차 발주 예정' }, ...]
    delivery_schedule: [],
  });

  const resetForm = () => {
    setForm({ product_category: '', unit_price: '', currency: 'USD', net_terms: '', moq: '', contract_qty: '', contract_expiry: '', contract_start: '', delivery_schedule: [] });
    setEditingId(null);
    setShowForm(false);
  };

  // v3.17 Phase A4: 분할 스케줄 헬퍼
  const addScheduleRow = () => {
    setForm(p => ({
      ...p,
      delivery_schedule: [...(p.delivery_schedule || []), { date: '', qty: '', note: '' }],
    }));
  };
  const updateScheduleRow = (idx, field, value) => {
    setForm(p => ({
      ...p,
      delivery_schedule: (p.delivery_schedule || []).map((r, i) =>
        i === idx ? { ...r, [field]: value } : r
      ),
    }));
  };
  const removeScheduleRow = (idx) => {
    setForm(p => ({
      ...p,
      delivery_schedule: (p.delivery_schedule || []).filter((_, i) => i !== idx),
    }));
  };
  // 분할 합계 검증
  const scheduleSum = (form.delivery_schedule || []).reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const contractQtyNum = parseInt(form.contract_qty) || 0;
  const scheduleMismatch = contractQtyNum > 0 && scheduleSum > 0 && scheduleSum !== contractQtyNum;

  // 계약금액 자동 계산
  const calcContractAmount = (price, qty) => {
    const p = parseFloat(price) || 0;
    const q = parseInt(qty) || 0;
    return p * q;
  };

  const contractAmount = calcContractAmount(form.unit_price, form.contract_qty);

  const handleSave = () => {
    if (!form.product_category) return;

    const price = parseFloat(form.unit_price) || 0;
    const qty = parseInt(form.contract_qty) || 0;

    if (editingId) {
      const existing = allContracts.find(c => c.id === editingId);
      const changeLog = {
        date: today(),
        prev_price: existing?.unit_price ?? 0,
        new_price: price,
        prev_terms: existing?.net_terms || '',
        new_terms: form.net_terms || '',
        prev_qty: existing?.contract_qty ?? 0,
        new_qty: qty,
        reason: '조건 업데이트',
      };

      saveContractItem({
        ...existing,
        product_category: form.product_category,
        unit_price: price,
        currency: form.currency,
        net_terms: form.net_terms,
        moq: parseInt(form.moq) || 0,
        contract_qty: qty,
        contract_amount: price * qty,
        contract_start: form.contract_start || '',
        contract_expiry: form.contract_expiry,
        // v3.17 Phase A4: 분할 스케줄 (date/qty/note 정규화)
        delivery_schedule: (form.delivery_schedule || [])
          .filter(r => r.date || r.qty || r.note)
          .map(r => ({ date: r.date || '', qty: parseInt(r.qty) || 0, note: r.note || '' })),
        change_logs: [...(existing?.change_logs || []), changeLog],
        updated_at: today(),
      });
    } else {
      saveContractItem({
        id: genId('ctr'),
        account_id: accountId,
        product_category: form.product_category,
        unit_price: price,
        currency: form.currency,
        net_terms: form.net_terms,
        moq: parseInt(form.moq) || 0,
        contract_qty: qty,
        contract_amount: price * qty,
        contract_start: form.contract_start || '',
        contract_expiry: form.contract_expiry,
        delivery_schedule: (form.delivery_schedule || [])
          .filter(r => r.date || r.qty || r.note)
          .map(r => ({ date: r.date || '', qty: parseInt(r.qty) || 0, note: r.note || '' })),
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
      contract_qty: c.contract_qty?.toString() || '',
      contract_expiry: c.contract_expiry || '',
      contract_start: c.contract_start || '',
      delivery_schedule: (c.delivery_schedule || []).map(r => ({
        date: r.date || '',
        qty: (r.qty ?? '').toString(),
        note: r.note || '',
      })),
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const getDaysUntilExpiry = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  function fmtAmt(currency, amount) {
    if (!amount) return '-';
    const sym = currency === 'KRW' ? '₩' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    return `${sym}${amount.toLocaleString()}`;
  }

  return (
    <div>
      {/* 액션 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('pc.sectionTitle')} ({allContracts.length} {t('pc.itemsCount')})</span>
        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? t('common.cancel') : t('pc.addCondition')}
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
              <label>{t('pc.contractStart')}</label>
              <input type="date" value={form.contract_start} onChange={e => setForm(p => ({ ...p, contract_start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('pc.contractExpiry')}</label>
              <input type="date" value={form.contract_expiry} onChange={e => setForm(p => ({ ...p, contract_expiry: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('pc.unitPrice')}</label>
              <input type="number" step="any" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="단가" />
            </div>
            <div className="form-group">
              <label>{t('pc.currency')}</label>
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
              <label>계약수량 (총 볼륨)</label>
              <input type="number" value={form.contract_qty} onChange={e => setForm(p => ({ ...p, contract_qty: e.target.value }))} placeholder="연간/계약기간 총 수량" />
            </div>
            <div className="form-group">
              <label>MOQ (1회 최소 주문)</label>
              <input type="number" value={form.moq} onChange={e => setForm(p => ({ ...p, moq: e.target.value }))} placeholder="1회 최소 주문 수량" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>결제조건 (NET terms)</label>
              <input type="text" value={form.net_terms} onChange={e => setForm(p => ({ ...p, net_terms: e.target.value }))} placeholder="예: NET 30, T/T in advance" />
            </div>
            <div className="form-group">
              <label>계약금액 (자동 계산)</label>
              <div style={{
                padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6,
                fontWeight: 700, fontSize: 14, color: contractAmount > 0 ? 'var(--accent)' : 'var(--text3)',
              }}>
                {contractAmount > 0
                  ? fmtAmt(form.currency, contractAmount)
                  : '단가 × 계약수량'}
              </div>
            </div>
          </div>
          {/* v3.17 Phase A4: 분할 발주 스케줄 */}
          <div style={{ marginTop: 12, padding: 10, background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>
                📅 분할 발주 스케줄
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
                  (전체 계약수량을 언제 어떻게 발주받을지 — 기회 파이프라인 자동 반영)
                </span>
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addScheduleRow} style={{ fontSize: 11 }}>+ 행 추가</button>
            </div>
            {(form.delivery_schedule || []).length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text3)', padding: 8, textAlign: 'center' }}>
                분할 스케줄이 없습니다 (필요 시 "+ 행 추가")
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--text3)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>예상 발주일</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', width: 100 }}>수량</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>메모</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(form.delivery_schedule || []).map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '2px 4px' }}>
                        <input type="date" value={row.date} onChange={e => updateScheduleRow(idx, 'date', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 11 }} />
                      </td>
                      <td style={{ padding: '2px 4px' }}>
                        <input type="number" value={row.qty} onChange={e => updateScheduleRow(idx, 'qty', e.target.value)} placeholder="0" style={{ width: '100%', padding: '4px 6px', fontSize: 11, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '2px 4px' }}>
                        <input type="text" value={row.note} onChange={e => updateScheduleRow(idx, 'note', e.target.value)} placeholder="예: 1차 발주 / 분기말 보충" style={{ width: '100%', padding: '4px 6px', fontSize: 11 }} />
                      </td>
                      <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                        <button type="button" onClick={() => removeScheduleRow(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }} title="삭제">✕</button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 6px', fontSize: 11 }}>합계</td>
                    <td style={{ textAlign: 'right', padding: '6px 6px', fontSize: 11, color: scheduleMismatch ? 'var(--red)' : 'var(--text)' }}>
                      {scheduleSum.toLocaleString()}
                      {contractQtyNum > 0 && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>/ {contractQtyNum.toLocaleString()}</span>}
                    </td>
                    <td colSpan={2}>
                      {scheduleMismatch && (
                        <span style={{ fontSize: 10, color: 'var(--red)' }}>
                          ⚠ 분할 합계가 계약 수량과 일치하지 않음 (차이 {(contractQtyNum - scheduleSum).toLocaleString()})
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
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
          <p>{t("pc.empty")}</p>
        </div>
      ) : (
        <div>
          {allContracts.map(c => {
            const daysLeft = getDaysUntilExpiry(c.contract_expiry);
            const isExpiringSoon = daysLeft !== null && daysLeft <= 60;
            const cAmount = c.contract_amount || (c.unit_price || 0) * (c.contract_qty || 0);

            return (
              <div key={c.id} className="card" style={{ marginBottom: 12, border: isExpiringSoon ? `2px solid ${daysLeft <= 30 ? 'var(--red)' : 'var(--yellow)'}` : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{c.product_category}</span>
                    {cAmount > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                        {fmtAmt(c.currency, cAmount)}
                      </span>
                    )}
                    {daysLeft !== null && daysLeft <= 60 && (
                      <span className={`score-badge ${daysLeft <= 30 ? 'red' : 'yellow'}`} style={{ marginLeft: 8 }}>
                        {daysLeft <= 0 ? '만료됨' : `D-${daysLeft}`}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>{t("common.edit")}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeContract(c.id)}>{t("common.delete")}</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>{t("pc.colUnitPrice")}</div>
                    <div style={{ fontWeight: 600 }}>{fmtAmt(c.currency, c.unit_price)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>{t("pc.colContractQty")}</div>
                    <div style={{ fontWeight: 600 }}>{c.contract_qty ? c.contract_qty.toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>{t("pc.colMOQ")}</div>
                    <div>{c.moq ? c.moq.toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>{t("pc.colNetTerms")}</div>
                    <div>{c.net_terms || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>{t("pc.colContractExpiry")}</div>
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
                        {log.prev_qty !== undefined && log.prev_qty !== log.new_qty && (
                          <span> | 수량: {(log.prev_qty || 0).toLocaleString()} → <strong>{(log.new_qty || 0).toLocaleString()}</strong></span>
                        )}
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
