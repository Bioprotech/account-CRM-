import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { ISSUE_TYPES, ORDER_ACTIVITY_TYPES, CUSTOMER_TYPE_GUIDE, ISSUE_PRIORITIES, DEFAULT_PRIORITY, RESOLUTION_METHODS } from '../../lib/constants';
import { today, genId, fmtDate } from '../../lib/utils';

/* ── 금액 포맷: 억/만 단위 ── */
function fmtAmount(v) {
  const n = Number(v);
  if (!n || n <= 0) return '';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000)}만`;
  return `${n.toLocaleString()}원`;
}

/* ── 필드명 한글 라벨 (수정 이력용) ── */
const FIELD_LABELS = {
  date: '활동 발생일',
  issue_type: '이슈 유형',
  priority: '중요도',
  content: '내용',
  next_action: '다음 액션',
  due_date: '다음 액션 기한',
  order_sub_type: '수주 세부 유형',
  expected_amount: '예상 금액',
  related_order_no: '관련 오더번호',
  product_category: '제품군',
  target_product: '대상 품목',
};

const INITIAL_LOG = {
  date: '',                // v3.5: 활동 발생일 (사용자 입력, 기본: 오늘)
  issue_type: '일반컨택',
  content: '',
  next_action: '',
  due_date: '',
  priority: DEFAULT_PRIORITY,
  order_sub_type: '',
  expected_amount: '',
  related_order_no: '',
  product_category: '',
  target_product: '',
};

/* ══════════════════════════════════════════════════════
   이슈 종결 처리 모달 (Phase C v3.5)
   ══════════════════════════════════════════════════════ */
function ResolutionModal({ log, currentUser, onClose, onSave }) {
  const [resolution, setResolution] = useState('');
  const [method, setMethod] = useState('');
  const [resolutionDate, setResolutionDate] = useState(today());

  const handleSubmit = () => {
    if (!resolution.trim()) {
      alert('⚠ 처리 결과 설명은 반드시 입력해야 합니다.');
      return;
    }
    onSave({
      status: 'Closed',
      resolution: resolution.trim(),
      resolution_method: method || '',
      resolution_date: resolutionDate || today(),
      closed_at: today(),
      closed_by: currentUser || '',
    });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)', borderRadius: 8, padding: 20,
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>🏁</span>
          <h3 style={{ margin: 0, fontSize: 16 }}>이슈 종결 처리</h3>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
          [{log.issue_type}] {log.content.length > 40 ? log.content.slice(0, 40) + '...' : log.content}
        </div>

        {/* 처리 결과 (필수) */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'block' }}>
            처리 결과 <span style={{ color: 'var(--red)' }}>*</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
              (어떻게 마무리되었는지 구체적으로)
            </span>
          </label>
          <textarea
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            placeholder="예: 4/23 CEO 승인 후 5% 인하 확정 (2026 하반기 적용). 재작성된 견적서 전달."
            rows={4}
            style={{ width: '100%', padding: 8, fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical', fontFamily: 'inherit' }}
            autoFocus
          />
        </div>

        {/* 해결 방법 태그 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'block' }}>
            해결 방법 <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>(선택)</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {RESOLUTION_METHODS.map(m => {
              const active = method === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(active ? '' : m.key)}
                  title={m.desc}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'rgba(46,125,50,0.1)' : 'var(--bg2)',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    fontWeight: active ? 700 : 400,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 실제 해결일 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'block' }}>
            실제 해결일
          </label>
          <input
            type="date"
            value={resolutionDate}
            onChange={e => setResolutionDate(e.target.value)}
            style={{ padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
          />
          <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>
            (예정일과 다를 경우 수정)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ fontSize: 12, padding: '6px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
          >취소</button>
          <button
            onClick={handleSubmit}
            disabled={!resolution.trim()}
            style={{
              fontSize: 12, padding: '6px 14px',
              background: resolution.trim() ? 'var(--accent)' : 'var(--bg3)',
              color: resolution.trim() ? '#fff' : 'var(--text3)',
              border: 'none', borderRadius: 4,
              cursor: resolution.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >🏁 완료 처리</button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityLog({ accountId, draft }) {
  const { getLogsForAccount, saveLog, removeLog, currentUser, isAdmin } = useAccount();
  const logs = getLogsForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterSubType, setFilterSubType] = useState('');
  const [newLog, setNewLog] = useState({ ...INITIAL_LOG, date: today() });

  // v3.5: 편집 모드 관리
  const [editingLogId, setEditingLogId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // v3.5: 완료 처리 팝업
  const [resolvingLog, setResolvingLog] = useState(null);

  // v3.5: 수정 이력 토글
  const [expandedHistory, setExpandedHistory] = useState({});

  /* ── 권한 체크: 본인 로그만 편집 가능, 관리자는 모든 로그 ── */
  const canEditLog = (log) => isAdmin || log.sales_rep === currentUser;

  /* ── Summary stats ── */
  const summary = useMemo(() => {
    const orderLogs = logs.filter(l => l.issue_type === '수주활동');
    const totalExpected = orderLogs.reduce((s, l) => s + (Number(l.expected_amount) || 0), 0);
    const lastDate = logs.length > 0
      ? logs.reduce((latest, l) => (l.date > latest ? l.date : latest), logs[0].date)
      : null;
    return {
      total: logs.length,
      orderCount: orderLogs.length,
      totalExpected,
      lastDate,
    };
  }, [logs]);

  const handleAdd = () => {
    if (!newLog.content.trim()) return;

    const nowIso = new Date().toISOString();
    const logEntry = {
      id: genId('log'),
      account_id: accountId,
      date: newLog.date || today(),       // v3.5: 사용자 입력 활동 발생일
      issue_type: newLog.issue_type,
      priority: Number(newLog.priority) || DEFAULT_PRIORITY,
      sales_rep: currentUser,
      content: newLog.content.trim(),
      status: 'Open',
      next_action: newLog.next_action.trim(),
      due_date: newLog.due_date,
      attachment_url: '',
      closed_at: '',
      closed_by: '',
      resolution: '',
      resolution_method: '',
      resolution_date: '',
      created_at: today(),
      created_at_iso: nowIso,
      updated_at: nowIso,
      updated_by: currentUser,
      edit_history: [],
    };

    // 수주활동 추가 필드
    if (newLog.issue_type === '수주활동') {
      logEntry.order_sub_type = newLog.order_sub_type || '';
      logEntry.expected_amount = Number(newLog.expected_amount) || 0;
      logEntry.related_order_no = newLog.related_order_no?.trim() || '';
      logEntry.product_category = newLog.product_category?.trim() || '';
    }

    // 크로스셀링 추가 필드
    if (newLog.issue_type === '크로스셀링') {
      logEntry.target_product = newLog.target_product?.trim() || '';
      logEntry.expected_amount = Number(newLog.expected_amount) || 0;
    }

    saveLog(logEntry);
    setNewLog({ ...INITIAL_LOG, date: today() });
    setShowForm(false);
  };

  /* ══════════════════════════════════════════════════════
     상태 변경 (진행 중 / 재오픈)
     완료는 ResolutionModal 경유
     ══════════════════════════════════════════════════════ */
  const updateStatus = (log, newStatus) => {
    const nowIso = new Date().toISOString();
    saveLog({
      ...log,
      status: newStatus,
      closed_at: newStatus === 'Closed' ? today() : log.closed_at,
      updated_at: nowIso,
      updated_by: currentUser,
    });
  };

  const updatePriority = (log, newPriority) => {
    const prevPriority = log.priority ?? DEFAULT_PRIORITY;
    const newP = Number(newPriority) || DEFAULT_PRIORITY;
    if (prevPriority === newP) return;
    const nowIso = new Date().toISOString();
    const history = [...(log.edit_history || []), {
      at: nowIso, by: currentUser, fields: ['priority'],
      from: { priority: prevPriority }, to: { priority: newP },
    }];
    saveLog({
      ...log,
      priority: newP,
      updated_at: nowIso,
      updated_by: currentUser,
      edit_history: history,
    });
  };

  /* ══════════════════════════════════════════════════════
     편집 모드
     ══════════════════════════════════════════════════════ */
  const startEdit = (log) => {
    setEditingLogId(log.id);
    setEditForm({
      date: log.date || today(),
      issue_type: log.issue_type || '일반컨택',
      priority: log.priority ?? DEFAULT_PRIORITY,
      content: log.content || '',
      next_action: log.next_action || '',
      due_date: log.due_date || '',
      order_sub_type: log.order_sub_type || '',
      expected_amount: log.expected_amount || '',
      related_order_no: log.related_order_no || '',
      product_category: log.product_category || '',
      target_product: log.target_product || '',
    });
  };

  const cancelEdit = () => {
    setEditingLogId(null);
    setEditForm(null);
  };

  const saveEdit = (log) => {
    if (!editForm || !editForm.content.trim()) {
      alert('내용은 반드시 입력해야 합니다.');
      return;
    }
    // 변경된 필드 감지
    const changedFields = [];
    const fromValues = {};
    const toValues = {};
    const compareKeys = ['date', 'issue_type', 'priority', 'content', 'next_action', 'due_date', 'order_sub_type', 'expected_amount', 'related_order_no', 'product_category', 'target_product'];
    compareKeys.forEach(k => {
      const oldV = log[k] ?? '';
      const newV = editForm[k] ?? '';
      if (String(oldV) !== String(newV)) {
        changedFields.push(k);
        fromValues[k] = oldV;
        toValues[k] = newV;
      }
    });

    if (changedFields.length === 0) {
      cancelEdit();
      return;
    }

    const nowIso = new Date().toISOString();
    const history = [...(log.edit_history || []), {
      at: nowIso,
      by: currentUser,
      fields: changedFields,
      from: fromValues,
      to: toValues,
    }];

    saveLog({
      ...log,
      date: editForm.date || log.date,
      issue_type: editForm.issue_type,
      priority: Number(editForm.priority) || DEFAULT_PRIORITY,
      content: editForm.content.trim(),
      next_action: editForm.next_action?.trim() || '',
      due_date: editForm.due_date || '',
      order_sub_type: editForm.order_sub_type || '',
      expected_amount: Number(editForm.expected_amount) || 0,
      related_order_no: editForm.related_order_no?.trim() || '',
      product_category: editForm.product_category?.trim() || '',
      target_product: editForm.target_product?.trim() || '',
      updated_at: nowIso,
      updated_by: currentUser,
      edit_history: history,
    });

    cancelEdit();
  };

  /* ══════════════════════════════════════════════════════
     완료 처리 (ResolutionModal 저장 콜백)
     ══════════════════════════════════════════════════════ */
  const handleResolve = (log, resolveData) => {
    const nowIso = new Date().toISOString();
    saveLog({
      ...log,
      ...resolveData,
      updated_at: nowIso,
      updated_by: currentUser,
    });
  };

  /* ══════════════════════════════════════════════════════
     삭제 권한 체크
     ══════════════════════════════════════════════════════ */
  const handleDelete = (log) => {
    if (!canEditLog(log)) {
      alert('본인이 작성한 로그만 삭제 가능합니다.');
      return;
    }
    if (confirm('이 로그를 삭제하시겠습니까? (복구 불가)')) {
      removeLog(log.id);
    }
  };

  /* ── 필터 적용 ── */
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filterType) result = result.filter(l => l.issue_type === filterType);
    if (filterType === '수주활동' && filterSubType) {
      result = result.filter(l => l.order_sub_type === filterSubType);
    }
    return result;
  }, [logs, filterType, filterSubType]);

  return (
    <div>
      {/* ── Summary Banner ── */}
      {logs.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, padding: '8px 12px', marginBottom: 12,
          background: 'var(--bg2, #f5f7fa)', borderRadius: 8, fontSize: '12px',
          color: 'var(--text2, #555)', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span>전체 <b>{summary.total}</b>건</span>
          <span style={{ color: 'var(--text3, #999)' }}>|</span>
          <span>수주활동 <b style={{ color: 'var(--primary, #4a6cf7)' }}>{summary.orderCount}</b>건
            {summary.totalExpected > 0 && (
              <span style={{ marginLeft: 4, color: 'var(--success, #22c55e)', fontWeight: 600 }}>
                ({fmtAmount(summary.totalExpected)})
              </span>
            )}
          </span>
          <span style={{ color: 'var(--text3, #999)' }}>|</span>
          <span>최근활동 <b>{summary.lastDate ? fmtDate(summary.lastDate) : '-'}</b></span>
          {isAdmin && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
              👑 관리자 — 전체 로그 편집 가능
            </span>
          )}
        </div>
      )}

      {/* ── 액션 바 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="filter-select" value={filterType} onChange={e => { setFilterType(e.target.value); setFilterSubType(''); }}>
            <option value="">전체 유형</option>
            {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {filterType === '수주활동' && (
            <select className="filter-select" value={filterSubType} onChange={e => setFilterSubType(e.target.value)}
              style={{ fontSize: '11px' }}>
              <option value="">전체 세부유형</option>
              {ORDER_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{filteredLogs.length}건</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(!showForm); if (!showForm) setNewLog({ ...INITIAL_LOG, date: today() }); }}>
          {showForm ? '취소' : '+ 새 로그'}
        </button>
      </div>

      {/* ── 새 로그 폼 ── */}
      {showForm && (
        <div className="activity-form">
          {/* 리스크 행동 경고 */}
          {(() => {
            const bt = draft.business_type;
            const guide = CUSTOMER_TYPE_GUIDE[bt];
            if (!guide) return null;
            const riskMap = {
              OEM: { '가격협의': '가격 중심 대화를 지양해야 합니다. KAM 합의 하에 진행하세요.' },
              Private: { '가격협의': 'PL 고객간 가격 형평성을 고려해야 합니다.' },
              Single: { '일반컨택': '단순 컨택보다 관계 구축형 대응으로 전환하세요.' },
              '가격민감': { '가격협의': '전체 SKU 일괄 가격조정을 피하고 패키지 제안으로 접근하세요.' },
            };
            const warning = riskMap[bt]?.[newLog.issue_type];
            if (!warning) return null;
            return (
              <div style={{ padding: '8px 12px', marginBottom: 10, borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid var(--red)', fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <span><strong>[{guide.label}]</strong> {warning}</span>
              </div>
            );
          })()}

          {/* v3.5: 상단 행 — 활동 발생일 / 이슈 유형 / 중요도 */}
          <div className="form-row">
            <div className="form-group">
              <label>
                활동 발생일 <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 400 }}>(실제 발생한 날)</span>
              </label>
              <input
                type="date"
                value={newLog.date || today()}
                onChange={e => setNewLog(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>이슈 유형</label>
              <select value={newLog.issue_type} onChange={e => setNewLog(p => ({ ...p, issue_type: e.target.value, order_sub_type: '', expected_amount: '', related_order_no: '', product_category: '', target_product: '' }))}>
                {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>중요도</label>
              <select value={newLog.priority || DEFAULT_PRIORITY} onChange={e => setNewLog(p => ({ ...p, priority: Number(e.target.value) }))}>
                {ISSUE_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
              </select>
            </div>
          </div>

          {/* 수주활동 추가 필드 */}
          {newLog.issue_type === '수주활동' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>세부 유형</label>
                  <select value={newLog.order_sub_type} onChange={e => setNewLog(p => ({ ...p, order_sub_type: e.target.value }))}>
                    <option value="">선택...</option>
                    {ORDER_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>예상 수주금액 (원)</label>
                  <input type="number" value={newLog.expected_amount} onChange={e => setNewLog(p => ({ ...p, expected_amount: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>관련 오더번호</label>
                  <input type="text" value={newLog.related_order_no} onChange={e => setNewLog(p => ({ ...p, related_order_no: e.target.value }))} placeholder="선택사항" />
                </div>
                <div className="form-group">
                  <label>제품군</label>
                  <input type="text" value={newLog.product_category} onChange={e => setNewLog(p => ({ ...p, product_category: e.target.value }))} placeholder="선택사항" />
                </div>
              </div>
            </>
          )}

          {/* 크로스셀링 추가 필드 */}
          {newLog.issue_type === '크로스셀링' && (
            <div className="form-row">
              <div className="form-group">
                <label>대상 품목</label>
                <input type="text" value={newLog.target_product} onChange={e => setNewLog(p => ({ ...p, target_product: e.target.value }))} placeholder="크로스셀링 대상 품목" />
              </div>
              <div className="form-group">
                <label>예상 금액 (원)</label>
                <input type="number" value={newLog.expected_amount} onChange={e => setNewLog(p => ({ ...p, expected_amount: e.target.value }))} placeholder="0" />
              </div>
            </div>
          )}

          {/* 내용 */}
          <div className="form-row full">
            <div className="form-group">
              <label>내용 *</label>
              <textarea value={newLog.content} onChange={e => setNewLog(p => ({ ...p, content: e.target.value }))} placeholder="이슈 내용을 입력하세요..." />
            </div>
          </div>

          {/* v3.5: 하단 행 — 다음 액션 / 다음 액션 기한 (짝으로 묶음) */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>다음 액션</label>
              <input type="text" value={newLog.next_action} onChange={e => setNewLog(p => ({ ...p, next_action: e.target.value }))} placeholder="다음 단계 액션" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>
                다음 액션 기한 <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 400 }}>(due date)</span>
              </label>
              <input type="date" value={newLog.due_date} onChange={e => setNewLog(p => ({ ...p, due_date: e.target.value }))} />
            </div>
          </div>

          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!newLog.content.trim()}>로그 추가</button>
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      {filteredLogs.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📝</div>
          <p>활동 로그가 없습니다.<br />'+ 새 로그' 버튼으로 첫 기록을 남기세요.</p>
        </div>
      ) : (
        <div className="timeline">
          {filteredLogs.map(log => {
            const statusClass = log.status === 'Closed' ? 'closed' : log.status === 'In Progress' ? 'in-progress' : 'open';
            const isOrder = log.issue_type === '수주활동';
            const isCross = log.issue_type === '크로스셀링';

            const priorityInfo = ISSUE_PRIORITIES.find(p => p.value === (log.priority ?? DEFAULT_PRIORITY)) || ISSUE_PRIORITIES[0];
            const editable = canEditLog(log);
            const isEditing = editingLogId === log.id;
            const editHistory = log.edit_history || [];
            const historyExpanded = expandedHistory[log.id];

            /* ── 편집 모드 렌더 ── */
            if (isEditing && editForm) {
              return (
                <div key={log.id} className={`timeline-item ${statusClass}`} style={{ border: '2px dashed var(--accent)', background: 'rgba(46,125,50,0.03)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
                    ✎ 편집 모드 — {log.sales_rep} · 원본 작성 {log.date}
                  </div>

                  {/* 상단 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label>활동 발생일</label>
                      <input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>이슈 유형</label>
                      <select value={editForm.issue_type} onChange={e => setEditForm(p => ({ ...p, issue_type: e.target.value }))}>
                        {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>중요도</label>
                      <select value={editForm.priority} onChange={e => setEditForm(p => ({ ...p, priority: Number(e.target.value) }))}>
                        {ISSUE_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {editForm.issue_type === '수주활동' && (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>세부 유형</label>
                          <select value={editForm.order_sub_type} onChange={e => setEditForm(p => ({ ...p, order_sub_type: e.target.value }))}>
                            <option value="">선택...</option>
                            {ORDER_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>예상 수주금액</label>
                          <input type="number" value={editForm.expected_amount} onChange={e => setEditForm(p => ({ ...p, expected_amount: e.target.value }))} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>관련 오더번호</label>
                          <input type="text" value={editForm.related_order_no} onChange={e => setEditForm(p => ({ ...p, related_order_no: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>제품군</label>
                          <input type="text" value={editForm.product_category} onChange={e => setEditForm(p => ({ ...p, product_category: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}

                  {editForm.issue_type === '크로스셀링' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>대상 품목</label>
                        <input type="text" value={editForm.target_product} onChange={e => setEditForm(p => ({ ...p, target_product: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>예상 금액</label>
                        <input type="number" value={editForm.expected_amount} onChange={e => setEditForm(p => ({ ...p, expected_amount: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  <div className="form-row full">
                    <div className="form-group">
                      <label>내용 *</label>
                      <textarea value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label>다음 액션</label>
                      <input type="text" value={editForm.next_action} onChange={e => setEditForm(p => ({ ...p, next_action: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>다음 액션 기한</label>
                      <input type="date" value={editForm.due_date} onChange={e => setEditForm(p => ({ ...p, due_date: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>취소</button>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(log)} disabled={!editForm.content.trim()}>수정 저장</button>
                  </div>
                </div>
              );
            }

            /* ── 일반 표시 모드 ── */
            return (
              <div key={log.id} className={`timeline-item ${statusClass}`}>
                <div className="timeline-header">
                  <span className="timeline-date">{log.date}</span>
                  <span className={`issue-badge ${log.issue_type?.replace('·', '')}`}>{log.issue_type}</span>
                  {(log.priority ?? DEFAULT_PRIORITY) > 1 && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                      background: priorityInfo.color + '22', color: priorityInfo.color,
                    }}>{priorityInfo.icon} {priorityInfo.label}</span>
                  )}
                  {isOrder && log.order_sub_type && (
                    <span className="issue-badge" style={{
                      background: 'var(--primary-light, #e8edff)',
                      color: 'var(--primary, #4a6cf7)',
                      fontSize: '10px',
                    }}>{log.order_sub_type}</span>
                  )}
                  <span className={`status-badge ${statusClass}`}>{log.status}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{log.sales_rep}</span>
                  {editHistory.length > 0 && (
                    <button
                      onClick={() => setExpandedHistory(p => ({ ...p, [log.id]: !p[log.id] }))}
                      style={{
                        fontSize: 9, padding: '1px 6px', background: 'var(--bg2)',
                        border: '1px solid var(--border)', borderRadius: 10,
                        cursor: 'pointer', color: 'var(--text2)',
                      }}
                      title="수정 이력 보기"
                    >
                      ✎ {editHistory.length}회 수정 {historyExpanded ? '▼' : '▶'}
                    </button>
                  )}
                </div>
                <div className="timeline-content">{log.content}</div>

                {/* 수주활동 추가 정보 */}
                {isOrder && (Number(log.expected_amount) > 0 || log.related_order_no || log.product_category) && (
                  <div style={{
                    display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4,
                    fontSize: '11px', color: 'var(--text2, #666)',
                  }}>
                    {Number(log.expected_amount) > 0 && (
                      <span style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>
                        예상금액: {fmtAmount(log.expected_amount)}
                      </span>
                    )}
                    {log.related_order_no && <span>오더: {log.related_order_no}</span>}
                    {log.product_category && <span>제품군: {log.product_category}</span>}
                  </div>
                )}

                {/* 크로스셀링 추가 정보 */}
                {isCross && (log.target_product || Number(log.expected_amount) > 0) && (
                  <div style={{
                    display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4,
                    fontSize: '11px', color: 'var(--text2, #666)',
                  }}>
                    {log.target_product && <span>대상품목: {log.target_product}</span>}
                    {Number(log.expected_amount) > 0 && (
                      <span style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>
                        예상금액: {fmtAmount(log.expected_amount)}
                      </span>
                    )}
                  </div>
                )}

                {(log.next_action || log.due_date) && (
                  <div className="timeline-meta">
                    {log.next_action && <span>다음: {log.next_action}</span>}
                    {log.due_date && <span>기한: {fmtDate(log.due_date)}</span>}
                  </div>
                )}

                {/* v3.5: 처리 결과 (완료된 이슈) */}
                {log.status === 'Closed' && log.resolution && (
                  <div style={{
                    marginTop: 8, padding: '8px 10px',
                    background: 'rgba(22,163,74,0.06)',
                    border: '1px solid rgba(22,163,74,0.2)',
                    borderRadius: 4, fontSize: 11,
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      🏁 처리 결과
                      {log.resolution_method && (() => {
                        const meta = RESOLUTION_METHODS.find(m => m.key === log.resolution_method);
                        return meta ? (
                          <span style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(22,163,74,0.15)', borderRadius: 3, fontWeight: 600 }}>
                            {meta.icon} {meta.label}
                          </span>
                        ) : null;
                      })()}
                      {log.resolution_date && (
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                          해결일: {fmtDate(log.resolution_date)}
                        </span>
                      )}
                      {log.closed_by && (
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                          by {log.closed_by}
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{log.resolution}</div>
                  </div>
                )}

                {/* v3.5: 수정 이력 (펼침) */}
                {historyExpanded && editHistory.length > 0 && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px',
                    background: 'var(--bg2)', borderRadius: 4, fontSize: 10,
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>
                      📜 수정 이력 ({editHistory.length}회)
                    </div>
                    {[...editHistory].reverse().map((h, i) => {
                      const dt = h.at ? new Date(h.at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                      const fieldLabels = (h.fields || []).map(f => FIELD_LABELS[f] || f).join(', ');
                      return (
                        <div key={i} style={{ padding: '2px 0', color: 'var(--text2)' }}>
                          · <strong>{dt}</strong> by <span style={{ color: 'var(--accent)' }}>{h.by || '-'}</span>: {fieldLabels}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 하단 버튼 */}
                <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {log.status !== 'In Progress' && log.status !== 'Closed' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(log, 'In Progress')}>진행 중</button>
                  )}
                  {log.status !== 'Closed' && (
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => setResolvingLog(log)}
                      title="처리 결과를 기록하고 완료"
                    >🏁 완료</button>
                  )}
                  {log.status === 'Closed' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(log, 'Open')}>재오픈</button>
                  )}
                  <select
                    value={log.priority ?? DEFAULT_PRIORITY}
                    onChange={e => updatePriority(log, e.target.value)}
                    style={{ fontSize: 11, padding: '2px 4px', marginLeft: 4 }}
                    title="중요도 변경"
                    disabled={!editable}
                  >
                    {ISSUE_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                  </select>
                  {/* v3.5: 편집 버튼 (권한 있을 때만) */}
                  {editable && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => startEdit(log)}
                      title="편집"
                      style={{ marginLeft: 4 }}
                    >✎ 편집</button>
                  )}
                  {editable && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(log)} style={{ marginLeft: 'auto' }}>삭제</button>
                  )}
                  {!editable && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>
                      (본인 로그만 편집 가능)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 완료 처리 팝업 ── */}
      {resolvingLog && (
        <ResolutionModal
          log={resolvingLog}
          currentUser={currentUser}
          onClose={() => setResolvingLog(null)}
          onSave={(resolveData) => handleResolve(resolvingLog, resolveData)}
        />
      )}
    </div>
  );
}
