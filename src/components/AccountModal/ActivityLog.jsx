import { useState, useMemo } from 'react';
import { useAccount } from '../../context/AccountContext';
import { ISSUE_TYPES, ISSUE_STATUSES, ORDER_ACTIVITY_TYPES, CUSTOMER_TYPE_GUIDE } from '../../lib/constants';
import { today, genId, fmtDate } from '../../lib/utils';

/* ── 금액 포맷: 억/만 단위 ── */
function fmtAmount(v) {
  const n = Number(v);
  if (!n || n <= 0) return '';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000)}만`;
  return `${n.toLocaleString()}원`;
}

const INITIAL_LOG = {
  issue_type: '일반컨택',
  content: '',
  next_action: '',
  due_date: '',
  order_sub_type: '',
  expected_amount: '',
  related_order_no: '',
  product_category: '',
  target_product: '',
};

export default function ActivityLog({ accountId, draft }) {
  const { getLogsForAccount, saveLog, removeLog, currentUser } = useAccount();
  const logs = getLogsForAccount(accountId);

  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterSubType, setFilterSubType] = useState('');
  const [newLog, setNewLog] = useState({ ...INITIAL_LOG });

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

    const logEntry = {
      id: genId('log'),
      account_id: accountId,
      date: today(),
      issue_type: newLog.issue_type,
      sales_rep: currentUser,
      content: newLog.content.trim(),
      status: 'Open',
      next_action: newLog.next_action.trim(),
      due_date: newLog.due_date,
      attachment_url: '',
      closed_at: '',
      created_at: today(),
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
    setNewLog({ ...INITIAL_LOG });
    setShowForm(false);
  };

  const updateStatus = (log, newStatus) => {
    saveLog({
      ...log,
      status: newStatus,
      closed_at: newStatus === 'Closed' ? today() : log.closed_at,
    });
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
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '취소' : '+ 새 로그'}
        </button>
      </div>

      {/* ── 새 로그 폼 ── */}
      {showForm && (
        <div className="activity-form">
          {/* 리스크 행동 경고 (E1) */}
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

          <div className="form-row">
            <div className="form-group">
              <label>이슈 유형</label>
              <select value={newLog.issue_type} onChange={e => setNewLog(p => ({ ...p, issue_type: e.target.value, order_sub_type: '', expected_amount: '', related_order_no: '', product_category: '', target_product: '' }))}>
                {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>기한</label>
              <input type="date" value={newLog.due_date} onChange={e => setNewLog(p => ({ ...p, due_date: e.target.value }))} />
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

          <div className="form-row full">
            <div className="form-group">
              <label>내용 *</label>
              <textarea value={newLog.content} onChange={e => setNewLog(p => ({ ...p, content: e.target.value }))} placeholder="이슈 내용을 입력하세요..." />
            </div>
          </div>
          <div className="form-row full">
            <div className="form-group">
              <label>다음 액션</label>
              <input type="text" value={newLog.next_action} onChange={e => setNewLog(p => ({ ...p, next_action: e.target.value }))} placeholder="다음 단계 액션" />
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

            return (
              <div key={log.id} className={`timeline-item ${statusClass}`}>
                <div className="timeline-header">
                  <span className="timeline-date">{log.date}</span>
                  <span className={`issue-badge ${log.issue_type?.replace('·', '')}`}>{log.issue_type}</span>
                  {isOrder && log.order_sub_type && (
                    <span className="issue-badge" style={{
                      background: 'var(--primary-light, #e8edff)',
                      color: 'var(--primary, #4a6cf7)',
                      fontSize: '10px',
                    }}>{log.order_sub_type}</span>
                  )}
                  <span className={`status-badge ${statusClass}`}>{log.status}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{log.sales_rep}</span>
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
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {log.status !== 'In Progress' && log.status !== 'Closed' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(log, 'In Progress')}>진행 중</button>
                  )}
                  {log.status !== 'Closed' && (
                    <button className="btn btn-success btn-sm" onClick={() => updateStatus(log, 'Closed')}>완료</button>
                  )}
                  {log.status === 'Closed' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(log, 'Open')}>재오픈</button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => removeLog(log.id)} style={{ marginLeft: 'auto' }}>삭제</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
