import { useAccount } from '../context/AccountContext';
import { createNewAccount } from '../lib/utils';

export default function Topbar() {
  const { currentTab, setCurrentTab, filters, setFilters, setEditingAccount, setSidebarOpen, currentUser } = useAccount();

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

      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={handleAdd}>+ 고객 추가</button>
      </div>
    </div>
  );
}
