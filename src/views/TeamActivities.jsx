import { useState, useMemo } from 'react';
import { useAccount } from '../context/AccountContext';

// 팀 옵션 (영업 3팀)
const SALES_TEAMS = ['국내영업', '해외영업', '영업지원'];
const TEAM_DISPLAY = { '국내영업': '국내영업', '해외영업': '해외영업', '영업지원': 'BPU(영업지원)' };

// 활동 유형
const ACTIVITY_TYPES = ['가격정책', '정책안내', '캠페인', '전시회', '교육', '법규/인증', '기타'];

// 우선순위
const PRIORITIES = [
  { key: 'normal', label: '🟢 일반', color: 'var(--green, #16a34a)' },
  { key: 'major',  label: '🟡 주요', color: '#d97706' },
  { key: 'urgent', label: '🔴 긴급', color: 'var(--red)' },
];

// 대상 범위
const TARGET_SCOPES = ['전체', '지역', '세그먼트', '특정고객들'];

// 공유 대상 부서/팀 (영업 + 유관부서)
const SHARE_TARGETS = [
  '국내영업', '해외영업', '영업지원',
  '품질팀', '생산팀', '연구개발팀', '경영지원',
];

// 상태
const STATUSES = [
  { key: 'open',   label: 'Open', color: 'var(--accent)' },
  { key: 'closed', label: 'Closed', color: 'var(--text3)' },
];

function blankDraft() {
  return {
    id: '',
    team: '국내영업',
    date: new Date().toISOString().slice(0, 10),
    type: '정책안내',
    priority: 'normal',
    title: '',
    content: '',
    target_scope: '전체',
    target_detail: '',
    related_accounts: [],
    share_with_teams: [],
    status: 'open',
  };
}

function fmtPriority(p) {
  return PRIORITIES.find(x => x.key === p) || PRIORITIES[0];
}

export default function TeamActivities() {
  const { teamActivities, saveTeamActivity, removeTeamActivity, currentUser, isAdmin, accounts, t } = useAccount();

  // 필터
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('this_month'); // this_month / last_month / all
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  // 모달
  const [editing, setEditing] = useState(null); // null = closed, {} = open
  const [accSearch, setAccSearch] = useState('');

  const todayYM = new Date().toISOString().slice(0, 7);
  const prevYM = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  const filtered = useMemo(() => {
    return (teamActivities || [])
      .filter(a => filterTeam === 'all' || a.team === filterTeam)
      .filter(a => filterType === 'all' || a.type === filterType)
      .filter(a => filterStatus === 'all' || a.status === filterStatus)
      .filter(a => filterPriority === 'all' || a.priority === filterPriority)
      .filter(a => {
        if (filterPeriod === 'all') return true;
        const ym = (a.date || '').slice(0, 7);
        if (filterPeriod === 'this_month') return ym === todayYM;
        if (filterPeriod === 'last_month') return ym === prevYM;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [teamActivities, filterTeam, filterPeriod, filterType, filterStatus, filterPriority, todayYM, prevYM]);

  const openNew = () => {
    setEditing({ ...blankDraft(), id: `ta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, created_by: currentUser });
    setAccSearch('');
  };
  const openEdit = (a) => { setEditing({ ...a, related_accounts: a.related_accounts || [], share_with_teams: a.share_with_teams || [] }); setAccSearch(''); };
  const closeModal = () => { setEditing(null); setAccSearch(''); };

  const handleSave = async () => {
    if (!editing.title || !editing.title.trim()) {
      alert('제목은 필수입니다');
      return;
    }
    await saveTeamActivity(editing);
    closeModal();
  };
  const handleDelete = async (id) => {
    if (!confirm('이 팀 활동을 삭제할까요?')) return;
    await removeTeamActivity(id);
  };

  const toggleShareTeam = (t) => {
    setEditing(prev => {
      const set = new Set(prev.share_with_teams || []);
      if (set.has(t)) set.delete(t); else set.add(t);
      return { ...prev, share_with_teams: Array.from(set) };
    });
  };
  const addAccount = (acc) => {
    setEditing(prev => {
      if (prev.related_accounts.includes(acc.id)) return prev;
      return { ...prev, related_accounts: [...prev.related_accounts, acc.id] };
    });
    setAccSearch('');
  };
  const removeAccountChip = (accId) => {
    setEditing(prev => ({ ...prev, related_accounts: prev.related_accounts.filter(x => x !== accId) }));
  };

  const accountSuggestions = useMemo(() => {
    const term = (accSearch || '').toLowerCase().trim();
    if (!term) return [];
    return (accounts || [])
      .filter(a => (a.company_name || '').toLowerCase().includes(term))
      .filter(a => !editing?.related_accounts?.includes(a.id))
      .slice(0, 8);
  }, [accSearch, accounts, editing]);

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('teamAct.title')}</h3>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {t('teamAct.subtitle')}
          </div>
        </div>
        <button
          onClick={openNew}
          style={{ marginLeft: 'auto', padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          {t('teamAct.add')}
        </button>
      </div>

      {/* 필터 */}
      <div className="card" style={{ marginBottom: 12, padding: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        <label>팀:&nbsp;
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">전체</option>
            {SALES_TEAMS.map(t => <option key={t} value={t}>{TEAM_DISPLAY[t]}</option>)}
          </select>
        </label>
        <label>기간:&nbsp;
          <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={{ fontSize: 12 }}>
            <option value="this_month">이번 달</option>
            <option value="last_month">지난 달</option>
            <option value="all">전체</option>
          </select>
        </label>
        <label>유형:&nbsp;
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">전체</option>
            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>상태:&nbsp;
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">전체</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>우선순위:&nbsp;
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">전체</option>
            {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>{filtered.length}건</span>
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>
          {t('teamAct.empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(a => {
            const prio = fmtPriority(a.priority);
            const statusObj = STATUSES.find(s => s.key === a.status) || STATUSES[0];
            const shareTargets = a.share_with_teams || [];
            const relAcc = (a.related_accounts || []).map(id => accounts.find(x => x.id === id)).filter(Boolean);
            return (
              <div key={a.id} className="card" style={{ padding: 10, borderLeft: `4px solid ${prio.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: prio.color, fontWeight: 700 }}>{prio.label}</span>
                  <span style={{ fontSize: 11, padding: '1px 6px', background: 'var(--bg2)', borderRadius: 3 }}>{TEAM_DISPLAY[a.team] || a.team}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.date}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {a.type}</span>
                  <span style={{ fontSize: 11, color: statusObj.color, fontWeight: 600 }}>· {statusObj.label}</span>
                  {shareTargets.length > 0 && (
                    <span style={{ fontSize: 11, padding: '1px 6px', background: 'rgba(37,99,235,0.1)', color: '#1d4ed8', borderRadius: 3, fontWeight: 600 }}>
                      📢 공유: {shareTargets.join(', ')}
                    </span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(a)} style={{ padding: '3px 10px', fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>수정</button>
                    {(isAdmin || a.created_by === currentUser) && (
                      <button onClick={() => handleDelete(a.id)} style={{ padding: '3px 10px', fontSize: 11, background: '#fee2e2', color: 'var(--red)', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>삭제</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
                {a.content && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', marginBottom: 6 }}>{a.content}</div>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text3)' }}>
                  <span>대상: {a.target_scope}{a.target_detail ? ` (${a.target_detail})` : ''}</span>
                  {relAcc.length > 0 && (
                    <span>영향 고객 {relAcc.length}: {relAcc.slice(0, 5).map(x => x.company_name).join(', ')}{relAcc.length > 5 ? ` 외 ${relAcc.length - 5}` : ''}</span>
                  )}
                  {a.created_by && <span>입력: {a.created_by}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 모달 */}
      {editing && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 8, padding: 20, maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>📣 팀 공통 활동 {editing.created_at ? '수정' : '추가'}</h3>
              <button onClick={closeModal} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>팀
                <select value={editing.team} onChange={e => setEditing({ ...editing, team: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {SALES_TEAMS.map(t => <option key={t} value={t}>{TEAM_DISPLAY[t]}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>일자
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 12 }}>유형
                <select value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>우선순위
                <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
            </div>

            <label style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>제목 *
              <input type="text" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="예: 국내 전 대리점 5% 가격 인상 고지" style={{ width: '100%', padding: 8, marginTop: 3, fontSize: 13 }} />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>내용
              <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} rows={4} placeholder="배경·진행 상황·다음 액션 등" style={{ width: '100%', padding: 8, marginTop: 3, fontSize: 12, fontFamily: 'inherit' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>대상 범위
                <select value={editing.target_scope} onChange={e => setEditing({ ...editing, target_scope: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {TARGET_SCOPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>대상 상세
                <input type="text" value={editing.target_detail} onChange={e => setEditing({ ...editing, target_detail: e.target.value })} placeholder="예: 중동(UAE·KSA) / 종합병원 전부 / 등" style={{ width: '100%', padding: 6, marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 12 }}>상태
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {/* 영향 고객 (옵션) */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>영향 고객 (선택 시 고객카드에도 노출)</div>
              <input
                type="text"
                value={accSearch}
                onChange={e => setAccSearch(e.target.value)}
                placeholder="고객사 이름 입력해 검색..."
                style={{ width: '100%', padding: 6, fontSize: 12 }}
              />
              {accountSuggestions.length > 0 && (
                <div style={{ border: '1px solid var(--border)', marginTop: 2, maxHeight: 150, overflow: 'auto', background: 'var(--bg)' }}>
                  {accountSuggestions.map(acc => (
                    <div key={acc.id} onClick={() => addAccount(acc)} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--bg2)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {acc.company_name} <span style={{ color: 'var(--text3)', fontSize: 10 }}>{acc.region}</span>
                    </div>
                  ))}
                </div>
              )}
              {editing.related_accounts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {editing.related_accounts.map(id => {
                    const acc = accounts.find(x => x.id === id);
                    if (!acc) return null;
                    return (
                      <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(46,125,50,0.1)', borderRadius: 12, fontSize: 11 }}>
                        {acc.company_name}
                        <button onClick={() => removeAccountChip(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 공유 대상 */}
            <div style={{ marginBottom: 14, padding: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#1d4ed8' }}>📢 유관부서 공유 (체크 시 보고서 상단 "공유 사항" 카드에 자동 노출)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SHARE_TARGETS.map(t => {
                  const checked = (editing.share_with_teams || []).includes(t);
                  return (
                    <label key={t} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: checked ? 'rgba(37,99,235,0.15)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleShareTeam(t)} />
                      {t}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 액션 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '8px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>취소</button>
              <button onClick={handleSave} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
