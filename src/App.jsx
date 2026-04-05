import AccountProvider, { useAccount } from './context/AccountContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './views/Dashboard';
import AccountList from './views/AccountList';
import Settings from './views/Settings';
import Report from './views/Report';
import Progress from './views/Progress';
import AccountModal from './components/AccountModal/AccountModal';

function UserSelectScreen() {
  const { login } = useAccount();

  const users = [
    { name: 'Haksu', admin: true },
    { name: 'Iris', admin: false },
    { name: 'Rebecca', admin: false },
    { name: 'Ian', admin: false },
    { name: 'Wendy', admin: false },
    { name: 'Dana', admin: false },
    { name: '김지희', admin: false },
  ];

  return (
    <div className="user-select-screen">
      <h1>Account CRM</h1>
      <p className="subtitle">Bio Protech 기존고객 관리 시스템</p>
      <div className="user-grid">
        {users.map(u => (
          <div key={u.name} className="user-card" onClick={() => login(u.name, u.admin)}>
            <div className="name">{u.admin ? '👑' : '👤'} {u.name}</div>
            <div className="role">{u.admin ? '관리자' : '담당자'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppContent() {
  const { currentUser, currentTab, editingAccount, toast } = useAccount();

  if (!currentUser) return <UserSelectScreen />;

  const renderView = () => {
    switch (currentTab) {
      case 'dashboard': return <Dashboard />;
      case 'accounts': return <AccountList />;
      case 'report': return <Report />;
      case 'progress': return <Progress />;
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
