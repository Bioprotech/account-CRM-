import { useAccount } from '../context/AccountContext';

const NAV_ITEMS = [
  { key: 'dashboard', icon: '📊', label: '대시보드' },
  { key: 'accounts', icon: '🏢', label: '고객 목록' },
  { key: 'report', icon: '📋', label: '종합 리포트' },
  { key: 'progress', icon: '📈', label: '진도관리' },
  { key: 'settings', icon: '⚙️', label: '설정', adminOnly: true },
];

export default function Sidebar() {
  const { currentTab, setCurrentTab, currentUser, isAdmin, logout, accounts, openIssues, alarms, fbStatus, sidebarOpen, setSidebarOpen } = useAccount();

  return (
    <>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <div id="sidebar" className={sidebarOpen ? 'open' : ''}>
        {/* Logo */}
        <div className="sidebar-logo">
          <h1>Account CRM</h1>
          <div className="subtitle">Bio Protech</div>
        </div>

        {/* User */}
        <div className="sidebar-user">
          <div>
            <div className="user-name">{isAdmin ? '👑' : '👤'} {currentUser}</div>
            <div className="user-role">{isAdmin ? '관리자' : '담당자'}</div>
          </div>
          <button className="logout-btn" onClick={logout}>로그아웃</button>
        </div>

        {/* Nav */}
        <div className="nav-section">
          <div className="nav-label">메뉴</div>
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
            <div
              key={item.key}
              className={`nav-item ${currentTab === item.key ? 'active' : ''}`}
              onClick={() => { setCurrentTab(item.key); setSidebarOpen(false); }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'accounts' && (
                <span className="nav-badge">{accounts.length}</span>
              )}
              {item.key === 'dashboard' && alarms.length > 0 && (
                <span className="nav-badge" style={{ background: 'rgba(220,38,38,.12)', color: 'var(--red)' }}>{alarms.length}</span>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="nav-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
          <div className="nav-label">요약</div>
          <div style={{ padding: '4px 16px', fontSize: '11px', color: 'var(--text3)' }}>
            Open 이슈: <strong style={{ color: openIssues.length > 0 ? 'var(--red)' : 'var(--green)' }}>{openIssues.length}</strong>건
          </div>
        </div>

        {/* Firebase Status */}
        <div className="sidebar-status">
          <span className={`status-dot ${fbStatus === 'connected' ? '' : fbStatus === 'error' ? 'error' : 'connecting'}`} />
          {fbStatus === 'connected' ? 'Firestore 연결됨' : fbStatus === 'disabled' ? 'localStorage 모드' : fbStatus === 'error' ? '연결 오류' : '연결 중...'}
        </div>
      </div>
    </>
  );
}
