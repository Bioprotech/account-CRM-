import { useAccount } from '../context/AccountContext';
import { CURRENT_VERSION } from '../lib/changelog';

// v3.33: label은 i18n 키 — 렌더 시점에 t(item.labelKey)로 변환
const NAV_ITEMS = [
  { key: 'dashboard',  icon: '📊',  labelKey: 'menu.dashboard' },
  { key: 'report',     icon: '📋',  labelKey: 'menu.report' },
  { key: 'myTasks',    icon: '🗒️', labelKey: 'menu.myTasks' },
  { key: 'accounts',   icon: '🏢',  labelKey: 'menu.accounts' },
  { key: 'progress',   icon: '📈',  labelKey: 'menu.progress' },
  { key: 'teamCommon', icon: '👥',  labelKey: 'menu.teamCommon' },
  { key: 'typeguide',  icon: '📖',  labelKey: 'menu.typeguide' },
  { key: 'changelog',  icon: '📝',  labelKey: 'menu.changelog' },
  { key: 'settings',   icon: '⚙️', labelKey: 'menu.settings', adminOnly: true },
];

export default function Sidebar() {
  const { currentTab, setCurrentTab, currentUser, isAdmin, logout, accounts, openIssues, alarms, fbStatus, sidebarOpen, setSidebarOpen, t } = useAccount();

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
            <div className="user-role">{isAdmin ? t('user.admin') : t('user.salesRep')}</div>
          </div>
          <button className="logout-btn" onClick={logout}>{t('common.changeLogin')}</button>
        </div>

        {/* Nav */}
        <div className="nav-section">
          <div className="nav-label">{t('menu.menuLabel')}</div>
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
            <div
              key={item.key}
              className={`nav-item ${currentTab === item.key ? 'active' : ''}`}
              onClick={() => { setCurrentTab(item.key); setSidebarOpen(false); }}
            >
              <span>{item.icon}</span>
              <span>{t(item.labelKey)}</span>
              {item.key === 'accounts' && (
                <span className="nav-badge">{accounts.length}</span>
              )}
              {item.key === 'dashboard' && alarms.length > 0 && (
                <span className="nav-badge" style={{ background: 'rgba(220,38,38,.12)', color: 'var(--red)' }}>{alarms.length}</span>
              )}
              {item.key === 'changelog' && (
                <span className="nav-badge" style={{ background: 'rgba(46,125,50,.12)', color: 'var(--accent)' }}>{CURRENT_VERSION}</span>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="nav-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
          <div className="nav-label">{t('menu.summaryLabel')}</div>
          <div style={{ padding: '4px 16px', fontSize: '11px', color: 'var(--text3)' }}>
            {t('menu.openIssuesShort')}: <strong style={{ color: openIssues.length > 0 ? 'var(--red)' : 'var(--green)' }}>{openIssues.length}</strong>
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
