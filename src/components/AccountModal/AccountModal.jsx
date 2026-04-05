import { useState, useEffect } from 'react';
import { useAccount } from '../../context/AccountContext';
import BasicInfo from './BasicInfo';
import IntelligenceScore from './IntelligenceScore';
import ActivityLog from './ActivityLog';
import OrderHistory from './OrderHistory';
import PriceContract from './PriceContract';
import ForecastTrend from './ForecastTrend';
import CrossSelling from './CrossSelling';
import TypeGuide from './TypeGuide';
import GapAnalysis from './GapAnalysis';

const TABS = [
  { key: 'basic', label: '기본정보' },
  { key: 'score', label: 'Score' },
  { key: 'activity', label: 'Activity' },
  { key: 'orders', label: '수주이력' },
  { key: 'gap', label: 'GAP분석' },
  { key: 'contract', label: '가격·계약' },
  { key: 'forecast', label: 'FCST' },
  { key: 'crossselling', label: '크로스셀링' },
  { key: 'typeguide', label: '유형가이드' },
];

export default function AccountModal() {
  const { editingAccount, setEditingAccount, saveAccount, removeAccount, isAdmin, currentUser } = useAccount();
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (editingAccount) {
      setDraft({ ...editingAccount });
      setActiveTab('basic');
    }
  }, [editingAccount]);

  if (!draft) return null;

  const update = (fields) => {
    setDraft(prev => ({ ...prev, ...fields }));
  };

  const handleSave = () => {
    if (!draft.company_name?.trim()) {
      alert('회사명을 입력해주세요.');
      return;
    }
    saveAccount(draft);
    setEditingAccount(null);
  };

  const handleDelete = () => {
    removeAccount(draft.id);
    setEditingAccount(null);
    setShowDelete(false);
  };

  const canEdit = isAdmin || !draft.sales_rep || draft.sales_rep === currentUser;
  const isNew = !editingAccount?.company_name;
  const score = draft.intelligence?.total_score ?? 0;

  const renderTab = () => {
    switch (activeTab) {
      case 'basic':
        return <BasicInfo draft={draft} update={update} />;
      case 'score':
        return <IntelligenceScore draft={draft} update={update} />;
      case 'activity':
        return <ActivityLog accountId={draft.id} draft={draft} />;
      case 'orders':
        return <OrderHistory accountId={draft.id} />;
      case 'contract':
        return <PriceContract accountId={draft.id} />;
      case 'forecast':
        return <ForecastTrend accountId={draft.id} />;
      case 'gap':
        return <GapAnalysis draft={draft} update={update} />;
      case 'crossselling':
        return <CrossSelling draft={draft} update={update} />;
      case 'typeguide':
        return <TypeGuide draft={draft} update={update} />;
      default:
        return null;
    }
  };

  return (
    <div className="overlay" onClick={() => setEditingAccount(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>{isNew ? '새 고객 등록' : draft.company_name || '(미입력)'}</h2>
            {!isNew && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                {draft.region && <span className="region-badge">{draft.region}</span>}
                {draft.sales_rep && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>담당: {draft.sales_rep}</span>}
                <span className={`score-badge ${score >= 70 ? 'green' : score >= 50 ? 'yellow' : 'red'}`}>
                  Score {score}%
                </span>
              </div>
            )}
          </div>
          <button className="modal-close" onClick={() => setEditingAccount(null)}>✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`modal-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <fieldset disabled={!canEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div className="modal-body">
            {renderTab()}
          </div>
        </fieldset>

        {/* Footer */}
        <div className="modal-footer">
          {!isNew && canEdit && (
            <button className="btn btn-danger" onClick={() => setShowDelete(true)} style={{ marginRight: 'auto' }}>삭제</button>
          )}
          <button className="btn btn-ghost" onClick={() => setEditingAccount(null)}>취소</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={handleSave}>저장</button>
          )}
        </div>
      </div>

      {/* Delete Confirm */}
      {showDelete && (
        <div className="confirm-overlay" onClick={() => setShowDelete(false)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>'{draft.company_name}'을(를) 삭제하시겠습니까?<br />관련 활동 로그도 함께 삭제됩니다.</p>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)}>취소</button>
              <button className="btn btn-danger" onClick={handleDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
