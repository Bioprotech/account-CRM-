import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';

const TENDER_STATUSES = ['준비중', '제출완료', '낙찰', '낙찰실패', '취소'];

function fmtAmt(v) {
  const n = Number(v);
  if (!n) return '-';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return `${n.toLocaleString()}원`;
}

function statusColor(s) {
  if (s === '낙찰') return 'var(--green, #16a34a)';
  if (s === '낙찰실패') return 'var(--red)';
  if (s === '제출완료') return '#2563eb';
  if (s === '준비중') return '#d97706';
  if (s === '취소') return 'var(--text3)';
  return 'var(--text3)';
}

export default function TenderView() {
  const { activityLogs, accounts } = useAccount();
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const accountMap = useMemo(() => {
    const m = {};
    (accounts || []).forEach(a => { m[a.id] = a; });
    return m;
  }, [accounts]);

  const tenderLogs = useMemo(() => {
    return (activityLogs || [])
      .filter(l => l.is_tender)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [activityLogs]);

  const filtered = useMemo(() => {
    return tenderLogs.filter(l => {
      const ti = l.tender_info || {};
      if (filterStatus && ti.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const acc = accountMap[l.account_id];
        const text = [acc?.company_name, ti.institution, ti.product, l.content]
          .filter(Boolean).join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [tenderLogs, filterStatus, search, accountMap]);

  const kpi = useMemo(() => {
    const total = tenderLogs.length;
    const won = tenderLogs.filter(l => l.tender_info?.status === '낙찰').length;
    const pending = tenderLogs.filter(l => ['준비중', '제출완료'].includes(l.tender_info?.status)).length;
    const totalAmt = tenderLogs.reduce((s, l) => s + Number(l.tender_info?.amount || 0), 0);
    const wonAmt = tenderLogs.filter(l => l.tender_info?.status === '낙찰')
      .reduce((s, l) => s + Number(l.tender_info?.amount || 0), 0);
    const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
    return { total, won, pending, totalAmt, wonAmt, winRate };
  }, [tenderLogs]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>🏛️ 입찰 현황</h2>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
        고객별 활동 로그에 등록된 입찰 건을 자동으로 집계합니다
      </div>

      {/* KPI 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: '전체 입찰', value: kpi.total, color: 'var(--accent)' },
          { label: '낙찰', value: kpi.won, color: 'var(--green, #16a34a)' },
          { label: '진행중', value: kpi.pending, color: '#d97706' },
          { label: '총 입찰금액', value: fmtAmt(kpi.totalAmt), color: 'var(--text)' },
          { label: '낙찰률', value: `${kpi.winRate}%`, color: kpi.winRate >= 50 ? 'var(--green, #16a34a)' : 'var(--text2)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="card" style={{ marginBottom: 12, padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="고객사 / 기관 / 품목 검색..."
          style={{ flex: 1, minWidth: 180, padding: '5px 8px', fontSize: 12 }}
        />
        <label>상태:&nbsp;
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">전체</option>
            {TENDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span style={{ color: 'var(--text3)' }}>{filtered.length}건</span>
      </div>

      {/* 테이블 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🏛️</div>
          {tenderLogs.length === 0
            ? '아직 입찰 로그가 없습니다. 고객 활동 로그에서 "입찰 건" 체크박스로 등록하세요.'
            : '검색 조건에 맞는 입찰 건이 없습니다.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                {['날짜', '고객사', '발주기관', '품목', '수량', '금액', '결과발표일', '상태', '담당자'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const acc = accountMap[l.account_id];
                const ti = l.tender_info || {};
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{l.date}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{acc?.company_name || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{ti.institution || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{ti.product || '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {ti.quantity ? Number(ti.quantity).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                      {fmtAmt(ti.amount)}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{ti.announcement_date || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {ti.status ? (
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          color: statusColor(ti.status),
                          background: statusColor(ti.status) + '22',
                        }}>
                          {ti.status}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                      {l.sales_rep || l.created_by || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)' }}>
        ※ 낙찰금액: {fmtAmt(kpi.wonAmt)} &nbsp;|&nbsp;
        ※ 입찰 건은 고객별 활동 로그에서 "🏛️ 입찰 건" 체크박스 선택 시 이 현황판에 자동 반영됩니다.
      </div>
    </div>
  );
}
