import { useState, useMemo } from 'react';
import { useAccount } from '../context/AccountContext';

const SALES_TEAMS = ['국내영업', '해외영업', '영업지원'];
const TEAM_DISPLAY = { '국내영업': '국내영업', '해외영업': '해외영업', '영업지원': 'BPU(영업지원)' };
const SHARE_TARGETS = ['국내영업', '해외영업', '영업지원', '품질팀', '생산팀', '연구개발팀', '경영지원'];
const PRIORITIES = [
  { key: 'normal', label: '🟢 일반', color: 'var(--green, #16a34a)' },
  { key: 'major',  label: '🟡 주요', color: '#d97706' },
  { key: 'urgent', label: '🔴 긴급', color: 'var(--red)' },
];
const STATUSES = [
  { key: 'planning', label: '📋 계획', color: 'var(--text2)' },
  { key: 'active',   label: '🔵 진행중', color: 'var(--accent)' },
  { key: 'on_hold',  label: '⏸ 보류', color: '#d97706' },
  { key: 'done',     label: '✅ 완료', color: 'var(--green, #16a34a)' },
];
const TARGET_SCOPES = ['전체고객', '국내', '해외', '특정세그먼트', '특정고객들'];

function blankProject() {
  return {
    id: '',
    project_name: '',
    description: '',
    owner_team: '국내영업',
    collaborator_teams: [],
    target_scope: '전체고객',
    target_detail: '',
    start_date: new Date().toISOString().slice(0, 10),
    target_end_date: '',
    status: 'active',
    priority: 'normal',
    kpi_metric: '',
    kpi_target: 0,
    kpi_actual: 0,
    milestones: [],
    updates: [],
    related_accounts: [],
    share_with_teams: [],
  };
}

function fmtPrio(p) { return PRIORITIES.find(x => x.key === p) || PRIORITIES[0]; }
function fmtStatus(s) { return STATUSES.find(x => x.key === s) || STATUSES[1]; }

export default function TeamProjects() {
  const { teamProjects, saveTeamProject, removeTeamProject, currentUser, isAdmin, accounts, t } = useAccount();

  // 필터
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  // 모달 (project 편집)
  const [editing, setEditing] = useState(null);
  const [accSearch, setAccSearch] = useState('');

  // update 추가 임시 입력
  const [newUpdate, setNewUpdate] = useState({ date: new Date().toISOString().slice(0, 10), content: '', share_with_teams: [] });
  // milestone 추가 임시 입력
  const [newMilestone, setNewMilestone] = useState({ date: '', label: '' });

  const filtered = useMemo(() => {
    return (teamProjects || [])
      .filter(p => filterTeam === 'all' || p.owner_team === filterTeam || (p.collaborator_teams || []).includes(filterTeam))
      .filter(p => filterStatus === 'all' || p.status === filterStatus)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }, [teamProjects, filterTeam, filterStatus]);

  const openNew = () => {
    setEditing({ ...blankProject(), id: `pj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, created_by: currentUser });
    setAccSearch('');
    setNewUpdate({ date: new Date().toISOString().slice(0, 10), content: '', share_with_teams: [] });
    setNewMilestone({ date: '', label: '' });
  };
  const openEdit = (p) => {
    setEditing({
      ...p,
      collaborator_teams: p.collaborator_teams || [],
      milestones: p.milestones || [],
      updates: p.updates || [],
      related_accounts: p.related_accounts || [],
      share_with_teams: p.share_with_teams || [],
    });
    setAccSearch('');
    setNewUpdate({ date: new Date().toISOString().slice(0, 10), content: '', share_with_teams: [] });
    setNewMilestone({ date: '', label: '' });
  };
  const closeModal = () => setEditing(null);

  const handleSave = async () => {
    if (!editing.project_name || !editing.project_name.trim()) {
      alert('프로젝트명은 필수입니다');
      return;
    }
    await saveTeamProject(editing);
    closeModal();
  };
  const handleDelete = async (id) => {
    if (!confirm('이 공통 프로젝트를 삭제할까요?')) return;
    await removeTeamProject(id);
  };

  const toggleShareTeam = (t) => {
    setEditing(prev => {
      const set = new Set(prev.share_with_teams || []);
      if (set.has(t)) set.delete(t); else set.add(t);
      return { ...prev, share_with_teams: Array.from(set) };
    });
  };
  const toggleCollab = (t) => {
    setEditing(prev => {
      const set = new Set(prev.collaborator_teams || []);
      if (set.has(t)) set.delete(t); else set.add(t);
      return { ...prev, collaborator_teams: Array.from(set) };
    });
  };
  const toggleUpdateShare = (t) => {
    setNewUpdate(prev => {
      const set = new Set(prev.share_with_teams || []);
      if (set.has(t)) set.delete(t); else set.add(t);
      return { ...prev, share_with_teams: Array.from(set) };
    });
  };
  const addUpdate = () => {
    if (!newUpdate.content.trim()) { alert('업데이트 내용 입력'); return; }
    setEditing(prev => ({
      ...prev,
      updates: [...(prev.updates || []), {
        id: `u_${Date.now()}`,
        date: newUpdate.date,
        content: newUpdate.content.trim(),
        author: currentUser,
        share_with_teams: newUpdate.share_with_teams,
      }],
    }));
    setNewUpdate({ date: new Date().toISOString().slice(0, 10), content: '', share_with_teams: [] });
  };
  const removeUpdate = (uid) => {
    setEditing(prev => ({ ...prev, updates: (prev.updates || []).filter(u => u.id !== uid) }));
  };
  const addMilestone = () => {
    if (!newMilestone.label.trim() || !newMilestone.date) { alert('마일스톤 일자/내용 입력'); return; }
    setEditing(prev => ({
      ...prev,
      milestones: [...(prev.milestones || []), {
        id: `m_${Date.now()}`,
        date: newMilestone.date,
        label: newMilestone.label.trim(),
        status: 'pending',
      }],
    }));
    setNewMilestone({ date: '', label: '' });
  };
  const toggleMilestone = (mid) => {
    setEditing(prev => ({
      ...prev,
      milestones: (prev.milestones || []).map(m => m.id === mid ? { ...m, status: m.status === 'done' ? 'pending' : 'done' } : m),
    }));
  };
  const removeMilestone = (mid) => {
    setEditing(prev => ({ ...prev, milestones: (prev.milestones || []).filter(m => m.id !== mid) }));
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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('teamProj.title')}</h3>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {t('teamProj.subtitle')}
          </div>
        </div>
        <button
          onClick={openNew}
          style={{ marginLeft: 'auto', padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          {t('teamProj.add')}
        </button>
      </div>

      {/* 필터 */}
      <div className="card" style={{ marginBottom: 12, padding: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        <label>주관/협업 팀:&nbsp;
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">전체</option>
            {SALES_TEAMS.map(t => <option key={t} value={t}>{TEAM_DISPLAY[t]}</option>)}
          </select>
        </label>
        <label>상태:&nbsp;
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">전체</option>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>{filtered.length}건</span>
      </div>

      {/* 카드 그리드 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>
          등록된 공통 프로젝트가 없습니다. [+ 새 프로젝트 추가] 버튼으로 시작하세요.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {filtered.map(p => {
            const prio = fmtPrio(p.priority);
            const stat = fmtStatus(p.status);
            const kpiPct = p.kpi_target > 0 ? Math.round((p.kpi_actual / p.kpi_target) * 100) : 0;
            const milestones = p.milestones || [];
            const updates = p.updates || [];
            const nextM = milestones.filter(m => m.status !== 'done').sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
            const lastU = updates.length > 0 ? updates.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;
            const shareTargets = p.share_with_teams || [];
            const relAcc = (p.related_accounts || []).length;
            return (
              <div key={p.id} className="card" style={{ padding: 12, borderLeft: `4px solid ${stat.color}` }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>🚀 {p.project_name}</strong>
                  <span style={{ fontSize: 11, color: stat.color, fontWeight: 600 }}>· {stat.label}</span>
                  <span style={{ fontSize: 11, color: prio.color, fontWeight: 600, marginLeft: 'auto' }}>{prio.label}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                  주관: <strong>{TEAM_DISPLAY[p.owner_team] || p.owner_team}</strong>
                  {(p.collaborator_teams || []).length > 0 && (
                    <span style={{ marginLeft: 6 }}>· 협업: {(p.collaborator_teams || []).map(t => TEAM_DISPLAY[t] || t).join(', ')}</span>
                  )}
                  <span style={{ marginLeft: 6, color: 'var(--text3)' }}>· {p.start_date} ~ {p.target_end_date || '미정'}</span>
                </div>
                {p.description && (
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{p.description}</div>
                )}
                {/* KPI */}
                {p.kpi_metric && (
                  <div style={{ marginBottom: 8, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                      📊 KPI: {p.kpi_metric}
                      <span style={{ marginLeft: 6, fontSize: 11, color: kpiPct >= 100 ? 'var(--green, #16a34a)' : kpiPct >= 50 ? '#d97706' : 'var(--red)' }}>
                        {p.kpi_actual} / {p.kpi_target} ({kpiPct}%)
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, kpiPct)}%`, height: '100%', background: kpiPct >= 100 ? 'var(--green, #16a34a)' : kpiPct >= 50 ? '#d97706' : 'var(--red)' }} />
                    </div>
                  </div>
                )}
                {/* 다음 마일스톤 + 최근 update */}
                <div style={{ fontSize: 11, marginBottom: 6 }}>
                  {nextM && (
                    <div style={{ color: 'var(--text2)' }}>
                      🏁 다음: <strong>{nextM.date}</strong> {nextM.label}
                    </div>
                  )}
                  {lastU && (
                    <div style={{ color: 'var(--text2)' }}>
                      🗒 최근 ({lastU.date}): {lastU.content.length > 60 ? lastU.content.slice(0, 60) + '…' : lastU.content}
                      {(lastU.share_with_teams || []).length > 0 && (
                        <span style={{ marginLeft: 4, fontSize: 9, padding: '0 4px', background: 'rgba(37,99,235,0.12)', color: '#1d4ed8', borderRadius: 2, fontWeight: 600 }}>📢</span>
                      )}
                    </div>
                  )}
                </div>
                {/* 메타 */}
                <div style={{ fontSize: 10, color: 'var(--text3)', display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span>대상: {p.target_scope}{p.target_detail ? ` (${p.target_detail})` : ''}</span>
                  {relAcc > 0 && <span>· 관련 고객 {relAcc}</span>}
                  <span>· 마일스톤 {milestones.filter(m => m.status === 'done').length}/{milestones.length}</span>
                  <span>· update {updates.length}</span>
                  {shareTargets.length > 0 && (
                    <span style={{ color: '#1d4ed8', fontWeight: 600 }}>📢 PJT공유: {shareTargets.join(', ')}</span>
                  )}
                </div>
                {/* 액션 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(p)} style={{ padding: '3px 10px', fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>편집 / Update 추가</button>
                  {(isAdmin || p.created_by === currentUser) && (
                    <button onClick={() => handleDelete(p.id)} style={{ padding: '3px 10px', fontSize: 11, background: '#fee2e2', color: 'var(--red)', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>삭제</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 모달 */}
      {editing && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 8, padding: 20, maxWidth: 820, width: '100%', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>🚀 공통 프로젝트 {editing.created_at ? '편집' : '추가'}</h3>
              <button onClick={closeModal} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>

            <label style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>프로젝트명 *
              <input type="text" value={editing.project_name} onChange={e => setEditing({ ...editing, project_name: e.target.value })} placeholder="예: Smoke 확대" style={{ width: '100%', padding: 8, marginTop: 3, fontSize: 13 }} />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>설명 / 목적
              <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} placeholder="배경, 목적, 범위 등" style={{ width: '100%', padding: 8, marginTop: 3, fontSize: 12, fontFamily: 'inherit' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>주관팀
                <select value={editing.owner_team} onChange={e => setEditing({ ...editing, owner_team: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {SALES_TEAMS.map(t => <option key={t} value={t}>{TEAM_DISPLAY[t]}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>상태
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>우선순위
                <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>대상 범위
                <select value={editing.target_scope} onChange={e => setEditing({ ...editing, target_scope: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }}>
                  {TARGET_SCOPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>시작일
                <input type="date" value={editing.start_date} onChange={e => setEditing({ ...editing, start_date: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 12 }}>목표 종료일
                <input type="date" value={editing.target_end_date} onChange={e => setEditing({ ...editing, target_end_date: e.target.value })} style={{ width: '100%', padding: 6, marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 12 }}>대상 상세
                <input type="text" value={editing.target_detail} onChange={e => setEditing({ ...editing, target_detail: e.target.value })} placeholder="예: 신규 의원 30개 / 종합병원" style={{ width: '100%', padding: 6, marginTop: 3 }} />
              </label>
            </div>

            {/* 협업 팀 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>협업 팀</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SALES_TEAMS.filter(t => t !== editing.owner_team).map(t => {
                  const checked = (editing.collaborator_teams || []).includes(t);
                  return (
                    <label key={t} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: checked ? 'rgba(46,125,50,0.1)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCollab(t)} />
                      {TEAM_DISPLAY[t]}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* KPI */}
            <div style={{ marginBottom: 10, padding: 10, background: 'var(--bg2)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📊 KPI</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                <label style={{ fontSize: 11 }}>지표명
                  <input type="text" value={editing.kpi_metric} onChange={e => setEditing({ ...editing, kpi_metric: e.target.value })} placeholder="예: 도입 고객 수" style={{ width: '100%', padding: 6, marginTop: 2 }} />
                </label>
                <label style={{ fontSize: 11 }}>목표
                  <input type="number" value={editing.kpi_target} onChange={e => setEditing({ ...editing, kpi_target: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: 6, marginTop: 2 }} />
                </label>
                <label style={{ fontSize: 11 }}>실적
                  <input type="number" value={editing.kpi_actual} onChange={e => setEditing({ ...editing, kpi_actual: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: 6, marginTop: 2 }} />
                </label>
              </div>
            </div>

            {/* 마일스톤 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🏁 마일스톤 ({(editing.milestones || []).length}건)</div>
              {(editing.milestones || []).length > 0 && (
                <div style={{ display: 'grid', gap: 3, marginBottom: 6 }}>
                  {editing.milestones.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 6px', background: 'var(--bg2)', borderRadius: 3 }}>
                      <input type="checkbox" checked={m.status === 'done'} onChange={() => toggleMilestone(m.id)} />
                      <span style={{ color: 'var(--text3)' }}>{m.date}</span>
                      <span style={{ flex: 1, textDecoration: m.status === 'done' ? 'line-through' : 'none', color: m.status === 'done' ? 'var(--text3)' : 'inherit' }}>{m.label}</span>
                      <button onClick={() => removeMilestone(m.id)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="date" value={newMilestone.date} onChange={e => setNewMilestone({ ...newMilestone, date: e.target.value })} style={{ padding: 4, fontSize: 11 }} />
                <input type="text" value={newMilestone.label} onChange={e => setNewMilestone({ ...newMilestone, label: e.target.value })} placeholder="마일스톤 내용" style={{ flex: 1, padding: 4, fontSize: 11 }} />
                <button onClick={addMilestone} style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>+ 추가</button>
              </div>
            </div>

            {/* 업데이트 */}
            <div style={{ marginBottom: 10, padding: 10, background: 'var(--bg2)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🗒 진행 업데이트 ({(editing.updates || []).length}건)</div>
              {(editing.updates || []).length > 0 && (
                <div style={{ display: 'grid', gap: 4, marginBottom: 8, maxHeight: 180, overflow: 'auto' }}>
                  {[...editing.updates].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(u => (
                    <div key={u.id} style={{ fontSize: 11, padding: '4px 6px', background: 'var(--bg)', borderRadius: 3, borderLeft: '2px solid var(--accent)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--text3)' }}>{u.date}</span>
                        {u.author && <span style={{ color: 'var(--text3)' }}>· {u.author}</span>}
                        {(u.share_with_teams || []).length > 0 && (
                          <span style={{ fontSize: 9, padding: '0 4px', background: 'rgba(37,99,235,0.12)', color: '#1d4ed8', borderRadius: 2, fontWeight: 600 }}>📢 {(u.share_with_teams).join(',')}</span>
                        )}
                        <button onClick={() => removeUpdate(u.id)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
                      </div>
                      <div style={{ marginTop: 2 }}>{u.content}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: 'var(--bg)', padding: 8, borderRadius: 4, border: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>+ 새 업데이트 추가</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <input type="date" value={newUpdate.date} onChange={e => setNewUpdate({ ...newUpdate, date: e.target.value })} style={{ padding: 4, fontSize: 11 }} />
                  <input type="text" value={newUpdate.content} onChange={e => setNewUpdate({ ...newUpdate, content: e.target.value })} placeholder="진행 내용 (예: 대구 ○○병원 도입 확정)" style={{ flex: 1, padding: 4, fontSize: 11 }} />
                  <button onClick={addUpdate} style={{ padding: '4px 10px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>+ 추가</button>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', fontSize: 10 }}>
                  <span style={{ color: 'var(--text3)' }}>📢 이 update 공유:</span>
                  {SHARE_TARGETS.map(t => {
                    const checked = (newUpdate.share_with_teams || []).includes(t);
                    return (
                      <label key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 6px', background: checked ? 'rgba(37,99,235,0.12)' : 'var(--bg2)', borderRadius: 3, cursor: 'pointer' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleUpdateShare(t)} />
                        {t}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 영향 고객 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>관련 고객 (선택 시 고객카드에도 노출)</div>
              <input type="text" value={accSearch} onChange={e => setAccSearch(e.target.value)} placeholder="고객사 검색..." style={{ width: '100%', padding: 6, fontSize: 12 }} />
              {accountSuggestions.length > 0 && (
                <div style={{ border: '1px solid var(--border)', marginTop: 2, maxHeight: 120, overflow: 'auto', background: 'var(--bg)' }}>
                  {accountSuggestions.map(acc => (
                    <div key={acc.id} onClick={() => addAccount(acc)} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--bg2)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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

            {/* PJT 단위 공유 */}
            <div style={{ marginBottom: 14, padding: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#1d4ed8' }}>📢 PJT 단위 유관부서 공유 (전체 PJT의 진행이 공유 필요할 때)</div>
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
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>※ 개별 update 단위 공유는 위 "+ 새 업데이트 추가" 안에서 따로 체크 가능</div>
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
