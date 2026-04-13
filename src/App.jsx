import { useState, useEffect } from 'react';
import AccountProvider, { useAccount } from './context/AccountContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { CHANGELOG, CURRENT_VERSION, VERSION_STORAGE_KEY } from './lib/changelog';
import Dashboard from './views/Dashboard';
import AccountList from './views/AccountList';
import Settings from './views/Settings';
import Report from './views/Report';
import OrderReport from './views/OrderReport';
import Progress from './views/Progress';
import TypeGuideView from './views/TypeGuideView';
import AccountModal from './components/AccountModal/AccountModal';

function UserSelectScreen() {
  const { login, teamMembers } = useAccount();
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const ADMIN_PASSWORD = '1208';

  const handleAdminSubmit = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PASSWORD) {
      login('Haksu', true);
    } else {
      setPinError(true);
      setPin('');
      setTimeout(() => setPinError(false), 1500);
    }
  };

  if (showAdminPin) {
    return (
      <div className="user-select-screen">
        <form onSubmit={handleAdminSubmit} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          background: 'var(--bg2)', padding: 32, borderRadius: 16,
          border: '1.5px solid var(--accent)', width: 280,
        }}>
          <div style={{ fontSize: 32 }}>🔐</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>관리자 비밀번호</div>
          <input
            type="password"
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="비밀번호 입력"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              border: `1.5px solid ${pinError ? '#ef4444' : 'var(--border)'}`,
              background: 'var(--bg)', color: 'var(--text)', fontSize: 16,
              textAlign: 'center', letterSpacing: 4,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {pinError && (
            <div style={{ color: '#ef4444', fontSize: 12 }}>비밀번호가 올바르지 않습니다</div>
          )}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button type="button" onClick={() => { setShowAdminPin(false); setPin(''); setPinError(false); }}
              style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}>
              취소
            </button>
            <button type="submit"
              style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>
              확인
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="user-select-screen">
      <h1>Account CRM</h1>
      <p className="subtitle">Bio Protech 기존고객 관리 시스템</p>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: -8 }}>담당자를 선택하거나 관리자로 로그인하세요</p>
      <div className="user-grid">
        {teamMembers.map(name => (
          <div key={name} className="user-card" onClick={() => login(name, false)}>
            <div className="name">👤 {name}</div>
            <div className="role">내 고객만 편집</div>
          </div>
        ))}
        <div className="user-card admin" onClick={() => setShowAdminPin(true)}
          style={{ borderColor: 'var(--accent)', background: 'rgba(46,125,50,.06)' }}>
          <div className="name" style={{ color: 'var(--accent)' }}>👑 관리자</div>
          <div className="role" style={{ color: 'var(--accent)', opacity: 0.7 }}>전체 관리</div>
        </div>
      </div>
    </div>
  );
}

function ChangelogPopup({ onClose }) {
  const latest = CHANGELOG[0];
  return (
    <div className="overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '80vh' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: 16 }}>Account CRM 업데이트</h2>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{latest.version} — {latest.date}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--accent)' }}>{latest.title}</div>
          {latest.items.map((item, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              {item}
            </div>
          ))}
          {CHANGELOG.length > 1 && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}>이전 업데이트 내역</summary>
              {CHANGELOG.slice(1).map((log, idx) => (
                <div key={idx} style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{log.version} — {log.title} <span style={{ fontWeight: 400, color: 'var(--text3)' }}>({log.date})</span></div>
                  {log.items.map((item, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text2)', padding: '2px 0', paddingLeft: 8 }}>{item}</div>
                  ))}
                </div>
              ))}
            </details>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { currentUser, currentTab, editingAccount, toast } = useAccount();
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const seen = localStorage.getItem(VERSION_STORAGE_KEY);
    if (seen !== CURRENT_VERSION) {
      setShowChangelog(true);
    }
  }, [currentUser]);

  const closeChangelog = () => {
    localStorage.setItem(VERSION_STORAGE_KEY, CURRENT_VERSION);
    setShowChangelog(false);
  };

  if (!currentUser) return <UserSelectScreen />;

  const renderView = () => {
    switch (currentTab) {
      case 'dashboard': return <Dashboard />;
      case 'accounts': return <AccountList />;
      case 'orderReport': return <OrderReport />;
      case 'report': return <Report />;
      case 'progress': return <Progress />;
      case 'typeguide': return <TypeGuideView />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div id="app">
      <Sidebar />
      <div id="main">
        <Topbar />
        <div id="content">
          {renderView()}
        </div>
      </div>

      {editingAccount && <AccountModal />}
      {showChangelog && <ChangelogPopup onClose={closeChangelog} />}

      {toast && (
        <div className="toast-wrap">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AccountProvider>
      <AppContent />
    </AccountProvider>
  );
}
