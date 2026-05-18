import { useAccount } from '../context/AccountContext';
import { createNewAccount } from '../lib/utils';

export default function Topbar() {
  const {
    currentTab, setCurrentTab, filters, setFilters, setEditingAccount, setSidebarOpen, currentUser,
    // v3.17 Phase D: 관리자 시점 변경
    isAdmin, teamMembers, viewAsRep, setViewAsRep,
  } = useAccount();

  const handleSearch = (e) => {
    setFilters(f => ({ ...f, searchQ: e.target.value }));
    if (currentTab !== 'accounts') setCurrentTab('accounts');
  };

  const handleAdd = () => {
    setEditingAccount(createNewAccount(currentUser));
  };

  return (
    <div id="topbar">
      <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>

      <div className="topbar-tabs">
        <button className={`topbar-tab ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>대시보드</button>
        <button className={`topbar-tab ${currentTab === 'accounts' ? 'active' : ''}`} onClick={() => setCurrentTab('accounts')}>고객 목록</button>
        <button className={`topbar-tab ${currentTab === 'report' ? 'active' : ''}`} onClick={() => setCurrentTab('report')}>리포트</button>
        <button className={`topbar-tab ${currentTab === 'progress' ? 'active' : ''}`} onClick={() => setCurrentTab('progress')}>진도관리</button>
      </div>

      <div className="topbar-search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="회사명 검색..."
          value={filters.searchQ}
          onChange={handleSearch}
        />
      </div>

      {/* v3.17 Phase D: 관리자만 — 담당자 시점 변경 드롭다운 */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>👀 시점:</span>
          <select
            value={viewAsRep || ''}
            onChange={e => setViewAsRep(e.target.value || null)}
            style={{
              padding: '4px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4,
              background: viewAsRep ? 'rgba(245,158,11,0.1)' : 'var(--bg)',
              color: viewAsRep ? '#d97706' : 'var(--text)',
              fontWeight: viewAsRep ? 700 : 400,
              cursor: 'pointer',
            }}
            title="관리자 전용: 특정 담당자 시점으로 화면 보기"
          >
            <option value="">👤 전체 (관리자)</option>
            {(teamMembers || []).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {viewAsRep && (
            <button
              onClick={() => setViewAsRep(null)}
              style={{ fontSize: 10, padding: '3px 6px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
              title="전체 시점으로 복귀"
            >✕</button>
          )}
        </div>
      )}

      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={handleAdd}>+ 고객 추가</button>
      </div>
    </div>
  );
}
