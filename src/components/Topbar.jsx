import { useAccount } from '../context/AccountContext';
import { createNewAccount } from '../lib/utils';
import { SUPPORTED_LANGS } from '../lib/i18n';

export default function Topbar() {
  const {
    currentTab, setCurrentTab, filters, setFilters, setEditingAccount, setSidebarOpen, currentUser,
    // v3.17 Phase D: 관리자 시점 변경
    isAdmin, teamMembers, viewAsRep, setViewAsRep,
    // v3.33: i18n
    lang, setLang, t,
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
        <button className={`topbar-tab ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>{t('menu.dashboard')}</button>
        <button className={`topbar-tab ${currentTab === 'accounts' ? 'active' : ''}`} onClick={() => setCurrentTab('accounts')}>{t('menu.accounts')}</button>
        <button className={`topbar-tab ${currentTab === 'report' ? 'active' : ''}`} onClick={() => setCurrentTab('report')}>{t('menu.report')}</button>
        <button className={`topbar-tab ${currentTab === 'progress' ? 'active' : ''}`} onClick={() => setCurrentTab('progress')}>{t('menu.progress')}</button>
      </div>

      <div className="topbar-search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder={t('common.searchPlaceholder')}
          value={filters.searchQ}
          onChange={handleSearch}
        />
      </div>

      {/* v3.33: 언어 토글 KO | EN (중국 법인 AM 영문 사용 지원) */}
      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', marginRight: 8 }}>
        {SUPPORTED_LANGS.map(L => (
          <button
            key={L.code}
            onClick={() => setLang(L.code)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: lang === L.code ? 700 : 500,
              background: lang === L.code ? 'var(--accent)' : 'var(--bg)',
              color: lang === L.code ? '#fff' : 'var(--text2)',
              border: 'none',
              cursor: 'pointer',
            }}
            title={L.code === 'ko' ? '한국어' : 'English'}
          >
            {L.label}
          </button>
        ))}
      </div>

      {/* v3.17 Phase D: 관리자만 — 담당자 시점 변경 드롭다운 */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t('topbar.viewAs')}</span>
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
            title={t('topbar.viewAsTooltip')}
          >
            <option value="">{t('topbar.viewAsAll')}</option>
            {(teamMembers || []).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {viewAsRep && (
            <button
              onClick={() => setViewAsRep(null)}
              style={{ fontSize: 10, padding: '3px 6px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
              title={t('topbar.viewAsReset')}
            >✕</button>
          )}
        </div>
      )}

      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={handleAdd}>{t('topbar.addCustomer')}</button>
      </div>
    </div>
  );
}
