import { useState } from 'react';
import TeamActivities from './TeamActivities';
import TeamProjects from './TeamProjects';

export default function TeamCommon() {
  const [tab, setTab] = useState('activities'); // 'activities' | 'projects'

  return (
    <div style={{ padding: 16 }}>
      {/* 페이지 헤더 + 탭 */}
      <div style={{ marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
          👥 팀 공통
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>
            — 고객 단위 외 팀 공통 업무 (활동·프로젝트)를 한 곳에 기록 · 보고서에 자동 반영
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'activities', label: '📣 팀 활동', desc: '시점성 (가격고지·정책·전시회 등)' },
            { key: 'projects',   label: '🚀 공통 프로젝트', desc: '지속성 + KPI (Smoke 확대 등)' },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
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
                title={t.desc}
              >
                {t.label}
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
