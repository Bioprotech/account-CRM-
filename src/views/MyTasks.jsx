import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { filterValidOrders } from '../lib/aggregation';

/* ══════════════════════════════════════════════════════════════════
   v3.17.11 — MyTasks 페이지
   ──────────────────────────────────────────────────────────────────
   담당자별 통합 업무 뷰:
     ① 내 team_tasks (월별, 우선순위/상태별)
     ② 내 Open 이슈 (P1/P2/P3)
     ③ 곧 다가오는 차주 액션 (Activity Log next_action_date)
     ④ 내 거래처 GAP 부족분 (이번달)

   관리자(본부장)는 전체 또는 viewAsRep으로 특정 담당자처럼 동작.
   ══════════════════════════════════════════════════════════════════ */

const TEAM_BY_REP = {}; // sales_rep → team mapping은 account에서 lookup

function toYM(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db - da) / 86400000);
}

const PRIORITY_COLORS = {
  P1: { bg: 'rgba(220,38,38,0.08)', border: 'var(--red)', text: 'var(--red)', label: '🔴 P1 (긴급)' },
  P2: { bg: 'rgba(245,158,11,0.08)', border: '#d97706', text: '#d97706', label: '🟡 P2 (주요)' },
  P3: { bg: 'rgba(34,197,94,0.06)', border: '#16a34a', text: '#16a34a', label: '🟢 P3 (일반)' },
};

const STATUS_COLORS = {
  Open: { bg: 'rgba(220,38,38,0.08)', text: 'var(--red)', label: '🔴 미시작' },
  'In Progress': { bg: 'rgba(245,158,11,0.08)', text: '#d97706', label: '🟡 진행중' },
  Done: { bg: 'rgba(34,197,94,0.08)', text: '#16a34a', label: '✅ 완료' },
};

export default function MyTasks() {
  const ctx = useAccount();
  const {
    accounts: accountsAll, activityLogs, openIssues, teamTasks, businessPlans,
    orders: ordersAll, saveTeamTask, removeTeamTask, setEditingAccount, setCurrentTab, showToast,
  } = ctx;
  const t = ctx.t;
  const te = ctx.te;
  // v3.32: 거래종료(inactive) 고객 — 내 업무에서 자동 제외
  const accounts = useMemo(() => (accountsAll || []).filter(a => a?.customer_category !== 'inactive'), [accountsAll]);
  const currentUser = ctx.effectiveCurrentUser ?? ctx.currentUser;
  const isAdmin = ctx.effectiveIsAdmin ?? ctx.isAdmin;
  const viewAsRep = ctx.viewAsRep;

  // 본부장(관리자)이 viewAsRep 안 했으면 "전체"로 처리, 했으면 그 담당자.
  // 일반 담당자는 본인만.
  const targetRep = useMemo(() => {
    if (isAdmin && !viewAsRep) return null; // 전체
    return viewAsRep || currentUser;
  }, [isAdmin, viewAsRep, currentUser]);

  // 내 거래처 (담당자 기준)
  const myAccountIds = useMemo(() => {
    if (!targetRep) return null; // 전체
    return new Set((accounts || []).filter(a => a.sales_rep === targetRep).map(a => a.id));
  }, [targetRep, accounts]);

  // 담당자 → 팀 매핑 (account.team에서 가져오기, 또는 region에서)
  const repTeam = useMemo(() => {
    if (!targetRep) return null;
    const a = (accounts || []).find(a => a.sales_rep === targetRep);
    if (!a) return null;
    if (a.team) return a.team;
    if (a.region) {
      if (a.region.includes('국내') || a.region === 'Korea') return '국내영업';
      if (a.region.includes('BPU')) return '영업지원';
      return '해외영업';
    }
    return null;
  }, [targetRep, accounts]);

  // 필터
  const [showCompleted, setShowCompleted] = useState(false);
  const [monthFilter, setMonthFilter] = useState('all'); // 'all' | 'thisMonth' | 'nextMonth' | 'overdue'

  const thisYM = toYM(new Date());
  const nextYM = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return toYM(d);
  })();

  // ── ① 내 team_tasks ──
  const myTeamTasks = useMemo(() => {
    const filtered = (teamTasks || []).filter(t => {
      if (!showCompleted && t.status === 'Done') return false;
      if (monthFilter === 'thisMonth' && t.year_month !== thisYM) return false;
      if (monthFilter === 'nextMonth' && t.year_month !== nextYM) return false;
      if (monthFilter === 'overdue' && (!t.due_date || t.due_date >= todayStr() || t.status === 'Done')) return false;
      if (!targetRep) return true; // 전체 (관리자)
      // 담당자 본인 = assignee 매칭 OR 자기팀 + assignee 비어있음
      if (t.assignee === targetRep) return true;
      if (!t.assignee && repTeam && t.team === repTeam) return true;
      return false;
    });
    return filtered.sort((a, b) => {
      // 1) Open/In Progress 먼저
      const sa = a.status === 'Done' ? 2 : a.status === 'In Progress' ? 1 : 0;
      const sb = b.status === 'Done' ? 2 : b.status === 'In Progress' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      // 2) Priority
      const pa = a.priority === 'P1' ? 0 : a.priority === 'P2' ? 1 : 2;
      const pb = b.priority === 'P1' ? 0 : b.priority === 'P2' ? 1 : 2;
      if (pa !== pb) return pa - pb;
      // 3) due_date
      return (a.due_date || '9999').localeCompare(b.due_date || '9999');
    });
  }, [teamTasks, targetRep, repTeam, showCompleted, monthFilter, thisYM, nextYM]);

  // ── ② 내 Open 이슈 ──
  const myOpenIssues = useMemo(() => {
    return (openIssues || []).filter(iss => {
      if (myAccountIds && !myAccountIds.has(iss.account_id)) return false;
      return iss.status !== 'Closed' && iss.status !== 'Done';
    }).sort((a, b) => {
      const pa = a.priority === 'P1' ? 0 : a.priority === 'P2' ? 1 : 2;
      const pb = b.priority === 'P1' ? 0 : b.priority === 'P2' ? 1 : 2;
      return pa - pb;
    });
  }, [openIssues, myAccountIds]);

  // ── ③ 차주 액션 (Activity Log next_action_date) ──
  const nextActions = useMemo(() => {
    const today = todayStr();
    const nextWeek = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    return (activityLogs || []).filter(l => {
      if (myAccountIds && !myAccountIds.has(l.account_id)) return false;
      if (!l.next_action_date) return false;
      if (l.next_action_date < today) return false; // 이미 지남
      if (l.next_action_date > nextWeek) return false; // 7일 초과
      return true;
    }).sort((a, b) => (a.next_action_date || '').localeCompare(b.next_action_date || ''));
  }, [activityLogs, myAccountIds]);

  // ── ④ 내 거래처 GAP 부족분 (이번달) ──
  const myGapShortfall = useMemo(() => {
    const yearStr = String(new Date().getFullYear());
    const monthKey = String(new Date().getMonth() + 1).padStart(2, '0');
    const customerPlans = (businessPlans || []).filter(p =>
      (p.type === 'customer' || !p.type) && p.year === Number(yearStr)
    );
    const myAccs = myAccountIds
      ? (accounts || []).filter(a => myAccountIds.has(a.id))
      : (accounts || []);
    const validOrders = filterValidOrders(ordersAll);
    const result = [];
    myAccs.forEach(acc => {
      const plan = customerPlans.find(p =>
        (p.account_id === acc.id) ||
        ((p.customer_name || '').toLowerCase().trim() === (acc.company_name || '').toLowerCase().trim())
      );
      if (!plan) return;
      const monthTarget = plan.targets?.[monthKey] || 0;
      if (monthTarget <= 0) return;
      const monthActual = validOrders
        .filter(o => o.account_id === acc.id && (o.order_date || '').slice(0, 7) === `${yearStr}-${monthKey}`)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const gap = monthTarget - monthActual;
      if (gap > 0) {
        result.push({
          account: acc,
          target: monthTarget,
          actual: monthActual,
          gap,
          pct: Math.round((monthActual / monthTarget) * 100),
        });
      }
    });
    return result.sort((a, b) => b.gap - a.gap);
  }, [accounts, businessPlans, ordersAll, myAccountIds]);

  // 통계
  const stats = useMemo(() => {
    const tasks = myTeamTasks.filter(t => t.status !== 'Done');
    return {
      tasksOpen: tasks.length,
      tasksOverdue: tasks.filter(t => t.due_date && t.due_date < todayStr()).length,
      issuesP1: myOpenIssues.filter(i => i.priority === 'P1').length,
      issuesP2: myOpenIssues.filter(i => i.priority === 'P2').length,
      nextActions7d: nextActions.length,
      gapShortCount: myGapShortfall.length,
      gapShortAmount: myGapShortfall.reduce((s, x) => s + x.gap, 0),
    };
  }, [myTeamTasks, myOpenIssues, nextActions, myGapShortfall]);

  const fmt = (n) => {
    if (!n) return '0';
    const abs = Math.abs(n);
    if (abs >= 100000000) return (abs / 100000000).toFixed(1) + '억';
    if (abs >= 10000) return Math.round(abs / 10000).toLocaleString() + '만';
    return Math.round(abs).toLocaleString();
  };

  const updateTaskStatus = (task, newStatus) => {
    saveTeamTask({ ...task, status: newStatus, updated_at: new Date().toISOString() });
    showToast?.(`상태 변경: ${task.content.slice(0, 30)} → ${newStatus}`, 'success');
  };

  const handleDeleteTask = (task) => {
    if (!confirm(`이 TASK를 삭제하시겠습니까?\n\n${task.content}`)) return;
    removeTeamTask(task.id);
    showToast?.('TASK 삭제됨', 'success');
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          🗒️ {t('myTasks.title')}
          {targetRep ? (
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)' }}>
              — {targetRep} {viewAsRep && isAdmin && '(viewAs)'}
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--accent)' }}>— 관리자 전체 뷰</span>
          )}
        </h2>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 0' }}>
          내 team_tasks · Open 이슈 · 차주 액션 · GAP 부족 통합 뷰
        </p>
      </div>

      {/* KPI 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
        <div className="kpi" style={{ padding: 10 }}>
          <div className="kpi-label">미완 TASK</div>
          <div className="kpi-value" style={{ fontSize: 22, color: stats.tasksOpen > 0 ? 'var(--red)' : 'inherit' }}>
            {stats.tasksOpen}
          </div>
          {stats.tasksOverdue > 0 && (
            <div style={{ fontSize: 9, color: 'var(--red)', marginTop: 2 }}>⚠ 기한 초과 {stats.tasksOverdue}</div>
          )}
        </div>
        <div className="kpi" style={{ padding: 10 }}>
          <div className="kpi-label">Open 이슈 (P1/P2)</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            <span style={{ color: 'var(--red)' }}>{stats.issuesP1}</span>
            <span style={{ fontSize: 14, color: 'var(--text3)' }}> / </span>
            <span style={{ color: '#d97706' }}>{stats.issuesP2}</span>
          </div>
        </div>
        <div className="kpi" style={{ padding: 10 }}>
          <div className="kpi-label">7일 내 차주 액션</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{stats.nextActions7d}</div>
        </div>
        <div className="kpi" style={{ padding: 10 }}>
          <div className="kpi-label">이번달 GAP 부족</div>
          <div className="kpi-value" style={{ fontSize: 18, color: stats.gapShortAmount > 0 ? 'var(--red)' : 'inherit' }}>
            {fmt(stats.gapShortAmount)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text3)' }}>{stats.gapShortCount}개 거래처</div>
        </div>
      </div>

      {/* 필터 */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { v: 'all', label: '전체' },
            { v: 'thisMonth', label: `이번달 (${thisYM})` },
            { v: 'nextMonth', label: `다음달 (${nextYM})` },
            { v: 'overdue', label: '기한 초과만' },
          ].map(o => (
            <button
              key={o.v}
              onClick={() => setMonthFilter(o.v)}
              className={`btn btn-sm ${monthFilter === o.v ? 'btn-primary' : ''}`}
              style={{ fontSize: 11 }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 11, marginLeft: 8 }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
          {' '}완료된 TASK 포함
        </label>
      </div>

      {/* ① TASK 카드 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span>📋 내 TASK ({myTeamTasks.length}건)</span>
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
            — 우선순위 · 상태 · 기한 순 정렬
          </span>
        </div>
        {myTeamTasks.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: 12 }}>
            ✨ 해당하는 TASK가 없습니다. {monthFilter === 'all' && '월간 보고서 ■ 5/6 섹션에서 등록하거나 주간 보고서 Open 이슈 옆 [📌 다음달 계획] 버튼을 사용하세요.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {myTeamTasks.map(task => {
              const pc = PRIORITY_COLORS[task.priority || 'P3'] || PRIORITY_COLORS.P3;
              const sc = STATUS_COLORS[task.status || 'Open'] || STATUS_COLORS.Open;
              const overdue = task.due_date && task.due_date < todayStr() && task.status !== 'Done';
              return (
                <div
                  key={task.id}
                  style={{
                    padding: '8px 12px',
                    background: overdue ? 'rgba(220,38,38,0.04)' : 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderLeft: `4px solid ${pc.border}`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: pc.bg, color: pc.text, marginRight: 6 }}>
                          {pc.label}
                        </span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: sc.bg, color: sc.text, marginRight: 6 }}>
                          {sc.label}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                          [{task.team || '?'}] · {task.year_month || '?'}
                          {task.assignee && ` · ${task.assignee}`}
                          {task.due_date && ` · 기한 ${task.due_date}`}
                          {overdue && <span style={{ color: 'var(--red)', fontWeight: 700 }}> ⚠ {Math.abs(daysBetween(task.due_date, todayStr()))}일 초과</span>}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{task.content}</div>
                      {task.source === 'open_issue_register' && (
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                          ↳ Open 이슈에서 등록됨
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {task.status !== 'Done' && (
                        <>
                          {task.status === 'Open' && (
                            <button
                              onClick={() => updateTaskStatus(task, 'In Progress')}
                              style={{ fontSize: 9, padding: '2px 6px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                            >
                              ▶ 진행
                            </button>
                          )}
                          <button
                            onClick={() => updateTaskStatus(task, 'Done')}
                            style={{ fontSize: 9, padding: '2px 6px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                          >
                            ✓ 완료
                          </button>
                        </>
                      )}
                      {task.status === 'Done' && (
                        <button
                          onClick={() => updateTaskStatus(task, 'Open')}
                          style={{ fontSize: 9, padding: '2px 6px', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}
                        >
                          ↺ 재오픈
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteTask(task)}
                        style={{ fontSize: 9, padding: '2px 6px', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 3, cursor: 'pointer' }}
                      >
                        ✕ 삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ② Open 이슈 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔴 내 Open 이슈 ({myOpenIssues.length}건)</div>
        {myOpenIssues.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: 12 }}>Open 이슈가 없습니다.</div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {myOpenIssues.slice(0, 20).map(iss => {
              const pc = PRIORITY_COLORS[iss.priority || 'P3'] || PRIORITY_COLORS.P3;
              return (
                <div
                  key={iss.id}
                  style={{
                    padding: '6px 10px',
                    background: pc.bg,
                    borderLeft: `3px solid ${pc.border}`,
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    const acc = (accounts || []).find(a => a.id === iss.account_id);
                    if (acc) setEditingAccount(acc);
                  }}
                  title="고객 카드 열기"
                >
                  <div style={{ fontSize: 11 }}>
                    <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 2, background: pc.border, color: '#fff', marginRight: 4 }}>
                      {iss.priority || 'P3'}
                    </span>
                    <strong>[{iss.customer_name || '?'}]</strong>{' '}
                    {(iss.issue_type || '')} · {(iss.content || '').slice(0, 80)}
                    {iss.daysOpen !== undefined && (
                      <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 4 }}>· {iss.daysOpen}일</span>
                    )}
                  </div>
                </div>
              );
            })}
            {myOpenIssues.length > 20 && (
              <div style={{ fontSize: 10, color: 'var(--text3)', padding: 4, textAlign: 'center' }}>
                ... 외 {myOpenIssues.length - 20}건
              </div>
            )}
          </div>
        )}
      </div>

      {/* ③ 차주 액션 */}
      {nextActions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">📅 7일 내 차주 액션 ({nextActions.length}건)</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {nextActions.map(act => {
              const acc = (accounts || []).find(a => a.id === act.account_id);
              const dLeft = daysBetween(todayStr(), act.next_action_date);
              return (
                <div
                  key={act.id}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--bg2)',
                    borderLeft: `3px solid ${dLeft <= 1 ? 'var(--red)' : dLeft <= 3 ? '#d97706' : 'var(--border)'}`,
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                  onClick={() => acc && setEditingAccount(acc)}
                  title="고객 카드 열기"
                >
                  <div style={{ fontSize: 11 }}>
                    <strong style={{ color: dLeft <= 1 ? 'var(--red)' : 'inherit' }}>
                      {act.next_action_date} (D{dLeft >= 0 ? '-' : '+'}{Math.abs(dLeft)})
                    </strong>
                    {' · '}<strong>[{act.customer_name || acc?.company_name || '?'}]</strong>
                    {' '}{(act.next_action || act.content || '').slice(0, 80)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ④ GAP 부족 */}
      {myGapShortfall.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span>📉 이번달 GAP 부족 거래처 ({myGapShortfall.length}개)</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)' }}>
              — 사업계획 대비 미달, 만회 활동 필요
            </span>
          </div>
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>거래처</th>
                <th style={{ textAlign: 'right' }}>목표</th>
                <th style={{ textAlign: 'right' }}>실적</th>
                <th style={{ textAlign: 'right' }}>GAP</th>
                <th style={{ textAlign: 'right' }}>달성률</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {myGapShortfall.slice(0, 20).map(row => (
                <tr key={row.account.id}>
                  <td>
                    <button
                      onClick={() => setEditingAccount(row.account)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 11 }}
                    >
                      {row.account.company_name}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmt(row.target)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(row.actual)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>-{fmt(row.gap)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 10, padding: '1px 5px', borderRadius: 2,
                      background: row.pct >= 80 ? 'rgba(34,197,94,0.1)' : row.pct >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(220,38,38,0.1)',
                      color: row.pct >= 80 ? '#16a34a' : row.pct >= 50 ? '#d97706' : 'var(--red)',
                    }}>
                      {row.pct}%
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setEditingAccount(row.account)}
                      style={{ fontSize: 9, padding: '2px 6px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                    >
                      열기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, padding: '6px 10px', background: 'var(--bg2)', borderRadius: 4 }}>
        💡 TASK 등록 경로: 월간 보고서 ■ 5 (자유 메모 → [+ TASK로 등록]) · ■ 6 (팀별 직접 등록) · 주간 보고서 Open 이슈 옆 [📌 다음달 계획] 버튼
      </div>
    </div>
  );
}
