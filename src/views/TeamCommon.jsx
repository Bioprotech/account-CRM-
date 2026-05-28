import { useState } from 'react';
import { useAccount } from '../context/AccountContext';
import TeamActivities from './TeamActivities';
import TeamProjects from './TeamProjects';

export default function TeamCommon() {
  const { t } = useAccount();
  const [tab, setTab] = useState('activities'); // 'activities' | 'projects'

  return (
    <div style={{ padding: 16 }}>
      {/* 페이지 헤더 + 탭 */}
      <div style={{ marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
          👥 {t('teamCommon.title')}
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>
            — {t('teamCommon.subtitle')}
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'activities', label: t('teamCommon.tabActivities'), desc: t('teamCommon.tabActivitiesDesc') },
            { key: 'projects',   label: t('teamCommon.tabProjects'),   desc: t('teamCommon.tabProjectsDesc') },
          ].map(item => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                style={{
                  padding: '10px 18px',
                  background: active ? 'var(--bg)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text2)',
                  border: 'none',
                  borderBottom: active ? '3px solid var(--accent)' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  fontFamily: 'inherit',
                  marginBottom: -2,
                }}
                title={item.desc}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'activities' && <TeamActivities />}
      {tab === 'projects'   && <TeamProjects />}
    </div>
  );
}
