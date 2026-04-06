import { useState } from 'react';
import { PRODUCTS } from '../../lib/constants';
import { today, genId } from '../../lib/utils';

const CS_STATUSES = ['미접촉', '제안중', '샘플진행', '수주완료', '중단'];

function fmtAmount(n) {
  if (!n) return '-';
  const num = Number(n);
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (num >= 10000) return `${Math.round(num / 10000).toLocaleString()}만`;
  return num.toLocaleString();
}

const emptyItem = () => ({
  id: genId('cs'),
  target_product: '',
  status: '미접촉',
  potential_amount: '',
  actual_amount: '',
  notes: '',
  started_at: today(),
  updated_at: today(),
});

export default function CrossSelling({ draft, update }) {
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyItem());

  const items = draft.cross_selling || [];
  const currentProducts = draft.products || [];

  // Products available for cross-selling (exclude current products)
  const availableProducts = PRODUCTS.filter(p => !currentProducts.includes(p));

  // Summary calculations
  const activeItems = items.filter(i => i.status !== '중단');
  const totalPotential = activeItems.reduce((s, i) => s + (Number(i.potential_amount) || 0), 0);
  const totalActual = items.filter(i => i.status === '수주완료').reduce((s, i) => s + (Number(i.actual_amount) || 0), 0);

  const statusCounts = {};
  CS_STATUSES.filter(s => s !== '중단').forEach(s => { statusCounts[s] = 0; });
  activeItems.forEach(i => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });

  const handleAdd = () => {
    setForm(emptyItem());
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (item) => {
    setForm({ ...item });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.target_product) return;
    const entry = { ...form, updated_at: today() };
    let next;
    if (editingId) {
      next = items.map(i => i.id === editingId ? entry : i);
    } else {
      next = [...items, entry];
    }
    update({ cross_selling: next });
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (id) => {
    update({ cross_selling: items.filter(i => i.id !== id) });
  };

  const statusColor = (s) => {
    switch (s) {
      case '미접촉': return '#94a3b8';
      case '제안중': return '#2e7d32';
      case '샘플진행': return '#f59e0b';
      case '수주완료': return '#22c55e';
      case '중단': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  return (
    <div>
      {/* Summary Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 16,
      }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>전체 기회</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{activeItems.length}<span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 2 }}>건</span></div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>예상 수주금액</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{fmtAmount(totalPotential)}</div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>실제 수주금액</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{fmtAmount(totalActual)}</div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>파이프라인</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(statusCounts).map(([s, c]) => (
              <span key={s} style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8,
                background: statusColor(s) + '18', color: statusColor(s),
                fontWeight: 600,
              }}>
                {s} {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Current Products */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
          현재 취급 품목
        </label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {currentProducts.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>기본정보 탭에서 제품군을 설정해주세요</span>
          )}
          {currentProducts.map(p => (
            <span key={p} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 8,
              background: 'var(--primary)', color: '#fff', fontWeight: 600,
            }}>{p}</span>
          ))}
        </div>
      </div>

      {/* Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>
          크로스셀링 기회 ({items.length}건)
        </label>
        <button className="btn btn-ghost btn-sm" onClick={handleAdd}>+ 크로스셀링 추가</button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: 14,
          marginBottom: 14, background: 'var(--bg2)',
        }}>
          <div className="form-row">
            <div className="form-group">
              <label>대상 품목 *</label>
              <select value={form.target_product} onChange={e => setForm(f => ({ ...f, target_product: e.target.value }))}>
                <option value="">선택</option>
                {availableProducts.map(p => <option key={p} value={p}>{p}</option>)}
                {/* If editing an item whose product is now in currentProducts, still show it */}
                {editingId && form.target_product && !availableProducts.includes(form.target_product) && (
                  <option value={form.target_product}>{form.target_product} (현재 취급)</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {CS_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>예상 수주금액 (KRW)</label>
              <input
                type="number"
                value={form.potential_amount}
                onChange={e => setForm(f => ({ ...f, potential_amount: e.target.value }))}
                placeholder="예: 50000000"
              />
              {form.potential_amount && (
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtAmount(form.potential_amount)}</span>
              )}
            </div>
            <div className="form-group">
              <label>실제 수주금액 (KRW)</label>
              <input
                type="number"
                value={form.actual_amount}
                onChange={e => setForm(f => ({ ...f, actual_amount: e.target.value }))}
                placeholder={form.status === '수주완료' ? '실제 금액 입력' : '수주완료 시 입력'}
                disabled={form.status !== '수주완료'}
              />
              {form.actual_amount && form.status === '수주완료' && (
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtAmount(form.actual_amount)}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>시작일</label>
              <input type="date" value={form.started_at} onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))} />
            </div>
            <div className="form-group" />
          </div>

          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>비고</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="메모, 진행 상황 등"
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditingId(null); }}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {editingId ? '수정' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {items.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>
          등록된 크로스셀링 기회가 없습니다.
        </div>
      )}

      {items.map(item => (
        <div key={item.id} style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: 12,
          marginBottom: 8, background: item.status === '중단' ? 'var(--bg2)' : 'transparent',
          opacity: item.status === '중단' ? 0.6 : 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{item.target_product}</span>
              <span style={{
                fontSize: 10, padding: '1px 8px', borderRadius: 8,
                background: statusColor(item.status) + '18', color: statusColor(item.status),
                fontWeight: 600,
              }}>{item.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(item)} style={{ fontSize: 11, padding: '2px 8px' }}>수정</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item.id)} style={{ fontSize: 11, padding: '2px 8px', color: '#ef4444' }}>삭제</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text2)', flexWrap: 'wrap' }}>
            <span>예상: <b>{fmtAmount(item.potential_amount)}</b></span>
            {item.status === '수주완료' && item.actual_amount && (
              <span>실제: <b style={{ color: '#22c55e' }}>{fmtAmount(item.actual_amount)}</b></span>
            )}
            <span>시작: {item.started_at || '-'}</span>
            <span>업데이트: {item.updated_at || '-'}</span>
          </div>

          {item.notes && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
              {item.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const summaryCard = {
  background: 'var(--bg2)',
  borderRadius: 8,
  padding: '10px 14px',
  border: '1px solid var(--border)',
};
