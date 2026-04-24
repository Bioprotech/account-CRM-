import { useState, useMemo, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { GAP_CAUSES, OPPORTUNITY_TYPES, SCORE_CATEGORIES, SALES_TEAMS, TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES } from '../lib/constants';
import { daysSince } from '../lib/utils';
import { HBarChart, DonutChart, ProgressBars } from '../components/Charts';
import { aggregateByRep, classifyForRepView, loadPriorYearCustomers } from '../lib/customerClassification';
import { getValidSalesReps, getSortedValidReps } from '../lib/salesReps';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

/* ── 팀 표시명 매핑 ── */
const TEAM_DISPLAY = { '해외영업': '해외(본사)', '영업지원': 'BPU', '국내영업': '국내' };
const TEAM_ORDER = ['해외영업', '영업지원', '국내영업'];

/* ── 매출 팀 (사업계획 월별매출 시트 기준: 해외/BPU/국내) ── */
const SALES_TEAM_ORDER = ['해외', 'BPU', '국내'];
const SALES_TEAM_DISPLAY = { '해외': '해외(본사)', 'BPU': 'BPU', '국내': '국내(직판포함)' };
// 수주 team → 매출 team 매핑 (동일 plan 공유)
const ORDER_TEAM_TO_SALES = { '해외영업': '해외', '영업지원': 'BPU', '국내영업': '국내' };

/* ── helpers ── */
function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}
/** 백만원 단위 포맷 (리포트 테이블용) */
function fmtM(n) {
  if (!n) return '-';
  return Math.round(n / 1000000).toLocaleString();
}
function pct(actual, target) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}
function pctColor(p) {
  if (p >= 100) return 'blue';
  if (p >= 80) return '';
  return 'red';
}
/** 달성률 스타일 (스펙: ≥100% 파랑, 80~99% 검정, <80% 빨강) */
function achieveStyle(p) {
  if (p >= 100) return { color: 'var(--blue, #2563eb)', fontWeight: 700 };
  if (p >= 80) return { color: 'var(--text)', fontWeight: 600 };
  return { color: 'var(--red)', fontWeight: 700 };
}

/* ── date range helpers ── */
/** 주차 범위 계산 (월~일 기준, offset=0 이번주, -1 지난주 등) */
function getWeekRangeByOffset(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
    monday,
    sunday,
  };
}
/** N월 N주차 라벨 */
function getWeekLabel(mondayDate) {
  const m = mondayDate.getMonth() + 1;
  const firstMon = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), 1);
  const firstDay = firstMon.getDay();
  const firstMonday = firstDay <= 1 ? firstMon.getDate() + (1 - firstDay) : firstMon.getDate() + (8 - firstDay);
  const weekNum = Math.ceil(((mondayDate.getDate() - firstMonday) / 7) + 1);
  return `${m}월 ${weekNum > 0 ? weekNum : 1}주차`;
}
function getWeekRange() {
  return getWeekRangeByOffset(0);
}
function getMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

/* ══════════════════════════════════════════════════════════════════
   Phase C v3.3 — 5페이지 스토리텔링 구조 (#13)
   페이지 구분 배너 (화면 + 인쇄 겸용)
   ══════════════════════════════════════════════════════════════════ */
function ChapterHeader({ page, total, title, subtitle, color = 'var(--accent)' }) {
  // Page 1은 리포트의 첫 섹션이므로 페이지 break 제외 (break 넣으면 앞에 빈 페이지 생김)
  return (
    <div className={page > 1 ? 'print-page-break' : ''} style={{ marginTop: page === 1 ? 0 : 20, marginBottom: 14 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: `linear-gradient(135deg, ${color}, rgba(46,125,50,0.05))`,
        borderRadius: 8,
        borderLeft: `4px solid ${color}`,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 10px',
          background: color,
          color: '#fff',
          borderRadius: 12,
          whiteSpace: 'nowrap',
        }}>
          📖 Page {page} / {total}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Phase C v3.3 — 팀별 TASK 섹션 (#14)
   team_tasks Firestore collection 활용
   ══════════════════════════════════════════════════════════════════ */
function TeamTasksSection({ yearMonth, teamTasks, saveTeamTask, removeTeamTask, showToast }) {
  const [addingTeam, setAddingTeam] = useState(null); // '해외영업' | '국내영업' | '영업지원'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ task_type: 'quota_recovery', content: '', assignee: '', due_date: '', priority: 'P2', status: 'Open' });

  const resetForm = () => {
    setForm({ task_type: 'quota_recovery', content: '', assignee: '', due_date: '', priority: 'P2', status: 'Open' });
    setAddingTeam(null);
    setEditingId(null);
  };

  const handleSave = (team) => {
    if (!form.content.trim()) {
      showToast?.('내용을 입력하세요', 'error');
      return;
    }
    const now = new Date().toISOString();
    const id = editingId || `task_${yearMonth}_${team}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task = {
      id,
      year_month: yearMonth,
      team,
      task_type: form.task_type,
      content: form.content.trim(),
      assignee: form.assignee.trim() || '',
      due_date: form.due_date || '',
      priority: form.priority,
      status: form.status,
      created_at: editingId ? (teamTasks.find(t => t.id === editingId)?.created_at || now) : now,
      updated_at: now,
    };
    saveTeamTask(task);
    showToast?.(editingId ? 'TASK 수정' : 'TASK 추가', 'success');
    resetForm();
  };

  const handleEdit = (task) => {
    setEditingId(task.id);
    setAddingTeam(task.team);
    setForm({
      task_type: task.task_type || 'quota_recovery',
      content: task.content || '',
      assignee: task.assignee || '',
      due_date: task.due_date || '',
      priority: task.priority || 'P2',
      status: task.status || 'Open',
    });
  };

  const handleDelete = (id) => {
    if (confirm('이 TASK를 삭제하시겠습니까?')) {
      removeTeamTask(id);
      showToast?.('TASK 삭제', 'success');
    }
  };

  const handleStatusToggle = (task) => {
    const nextStatus = task.status === 'Open' ? 'In Progress' : task.status === 'In Progress' ? 'Done' : 'Open';
    saveTeamTask({ ...task, status: nextStatus, updated_at: new Date().toISOString() });
  };

  const teams = [
    { key: '해외영업', label: '해외영업팀' },
    { key: '영업지원', label: 'BPU' },
    { key: '국내영업', label: '국내영업팀' },
  ];

  const tasksForMonth = (teamTasks || []).filter(t => t.year_month === yearMonth);
  const countByTeam = teams.reduce((acc, t) => {
    const list = tasksForMonth.filter(x => x.team === t.key);
    acc[t.key] = {
      total: list.length,
      open: list.filter(x => x.status === 'Open').length,
      inProgress: list.filter(x => x.status === 'In Progress').length,
      done: list.filter(x => x.status === 'Done').length,
    };
    return acc;
  }, {});

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>■ 6. 팀별 월간 TASK</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[{yearMonth} · 고정 5유형 + 자유 입력]</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>
          전체 {tasksForMonth.length}건 · Open {tasksForMonth.filter(t => t.status === 'Open').length} · 진행중 {tasksForMonth.filter(t => t.status === 'In Progress').length} · 완료 {tasksForMonth.filter(t => t.status === 'Done').length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {teams.map(t => {
          const teamTasksList = tasksForMonth.filter(x => x.team === t.key);
          const c = countByTeam[t.key];
          return (
            <div key={t.key} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--bg2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>[{t.label}]</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>{c.total}건 · 완료 {c.done}</div>
                <button
                  className="btn btn-sm"
                  onClick={() => { resetForm(); setAddingTeam(t.key); }}
                  style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', background: 'var(--accent)', color: '#fff', borderRadius: 3, border: 'none', cursor: 'pointer' }}
                >
                  + TASK
                </button>
              </div>

              {/* 입력 폼 */}
              {addingTeam === t.key && (
                <div style={{ padding: 8, marginBottom: 8, background: 'var(--bg)', borderRadius: 4, border: '1px dashed var(--accent)' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <select
                        value={form.task_type}
                        onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                        style={{ flex: 1, fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 3 }}
                      >
                        {TASK_TYPES.map(tt => (
                          <option key={tt.key} value={tt.key}>{tt.icon} {tt.label}</option>
                        ))}
                      </select>
                      <select
                        value={form.priority}
                        onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 3 }}
                      >
                        {TASK_PRIORITIES.map(p => (
                          <option key={p.key} value={p.key}>{p.key}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={form.content}
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="TASK 내용 (필수)"
                      rows={2}
                      style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 3, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="text"
                        value={form.assignee}
                        onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                        placeholder="담당자"
                        style={{ flex: 1, fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 3 }}
                      />
                      <input
                        type="date"
                        value={form.due_date}
                        onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 3 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        onClick={resetForm}
                        style={{ fontSize: 10, padding: '3px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}
                      >취소</button>
                      <button
                        onClick={() => handleSave(t.key)}
                        style={{ fontSize: 10, padding: '3px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}
                      >{editingId ? '수정' : '저장'}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* TASK 리스트 */}
              {teamTasksList.length === 0 ? (
                <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
                  TASK 없음
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 5 }}>
                  {teamTasksList
                    .sort((a, b) => {
                      const prioOrder = { P1: 1, P2: 2, P3: 3 };
                      const statusOrder = { 'Open': 1, 'In Progress': 2, 'Done': 3 };
                      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
                      return (prioOrder[a.priority] || 4) - (prioOrder[b.priority] || 4);
                    })
                    .map(task => {
                      const tt = TASK_TYPES.find(x => x.key === task.task_type) || TASK_TYPES[4];
                      const ps = TASK_PRIORITIES.find(x => x.key === task.priority) || TASK_PRIORITIES[1];
                      const ss = TASK_STATUSES.find(x => x.key === task.status) || TASK_STATUSES[0];
                      const isDone = task.status === 'Done';
                      return (
                        <div key={task.id} style={{
                          padding: 6,
                          background: isDone ? 'rgba(22,163,74,0.05)' : 'var(--bg)',
                          borderRadius: 4,
                          borderLeft: `3px solid ${ps.color}`,
                          opacity: isDone ? 0.7 : 1,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, fontWeight: 600 }}>{tt.icon} {tt.label}</span>
                            <span style={{ fontSize: 9, padding: '1px 4px', background: ps.color, color: '#fff', borderRadius: 2, fontWeight: 700 }}>{task.priority}</span>
                            <button
                              onClick={() => handleStatusToggle(task)}
                              style={{ fontSize: 9, padding: '1px 5px', background: ss.color, color: '#fff', border: 'none', borderRadius: 2, cursor: 'pointer', fontWeight: 600 }}
                              title="클릭으로 상태 순환: Open → In Progress → Done"
                            >{ss.label}</button>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                              <button
                                onClick={() => handleEdit(task)}
                                style={{ fontSize: 10, padding: '0 4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}
                                title="편집"
                              >✎</button>
                              <button
                                onClick={() => handleDelete(task.id)}
                                style={{ fontSize: 10, padding: '0 4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
                                title="삭제"
                              >×</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, marginBottom: 2, textDecoration: isDone ? 'line-through' : 'none' }}>{task.content}</div>
                          {(task.assignee || task.due_date) && (
                            <div style={{ fontSize: 10, color: 'var(--text3)', display: 'flex', gap: 8 }}>
                              {task.assignee && <span>👤 {task.assignee}</span>}
                              {task.due_date && <span>📅 {task.due_date}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, padding: '4px 8px', background: 'var(--bg2)', borderRadius: 4 }}>
        ※ 고정 유형(🎯 수주만회 / 📋 계약갱신 / 🚀 신규딜 / 🔀 Cross-Selling / 📌 기타) + 자유 입력 · 상태 배지 클릭 시 Open → In Progress → Done 순환
      </div>
    </div>
  );
}

/* ── Reusable breakdown table component ── */
function BreakdownTable({ title, rows, periodLabel = '금주', showYtd = false, showAnnual = false }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="table-wrap" style={{ maxHeight: 250 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>구분</th>
              <th style={{ textAlign: 'right' }}>{periodLabel} 수주</th>
              {showYtd && <th style={{ textAlign: 'right' }}>YTD 실적</th>}
              {showAnnual && <th style={{ textAlign: 'right' }}>연간 목표</th>}
              {showAnnual && <th style={{ textAlign: 'right' }}>달성률</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(r.periodActual)}</td>
                {showYtd && <td style={{ textAlign: 'right' }}>{fmtKRW(r.ytdActual)}</td>}
                {showAnnual && <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(r.annualTarget)}</td>}
                {showAnnual && (
                  <td style={{ textAlign: 'right' }}>
                    {r.annualTarget > 0
                      ? <span className={`score-badge ${pctColor(pct(r.ytdActual, r.annualTarget))}`}>{pct(r.ytdActual, r.annualTarget)}%</span>
                      : '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Monthly breakdown table with monthly target ── */
function MonthlyBreakdownTable({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="table-wrap" style={{ maxHeight: 280 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>구분</th>
              <th style={{ textAlign: 'right' }}>당월 목표</th>
              <th style={{ textAlign: 'right' }}>당월 실적</th>
              <th style={{ textAlign: 'right' }}>당월 달성률</th>
              <th style={{ textAlign: 'right' }}>YTD 실적</th>
              <th style={{ textAlign: 'right' }}>연간 목표</th>
              <th style={{ textAlign: 'right' }}>연간 달성률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const mp = pct(r.monthActual, r.monthTarget);
              const ap = pct(r.ytdActual, r.annualTarget);
              return (
                <tr key={r.label}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(r.monthTarget)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKRW(r.monthActual)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.monthTarget > 0
                      ? <span className={`score-badge ${pctColor(mp)}`}>{mp}%</span>
                      : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtKRW(r.ytdActual)}</td>
                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(r.annualTarget)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.annualTarget > 0
                      ? <span className={`score-badge ${pctColor(ap)}`}>{ap}%</span>
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   REPORT COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function Report() {
  const { accounts, activityLogs, orders, sales, forecasts, businessPlans, contracts, openIssues, alarms, teamMembers, setEditingAccount, appSettings, saveAppSetting, teamTasks, pipelineCustomers, saveTeamTask, removeTeamTask, showToast } = useAccount();

  // 전년도 수주 고객 Set (신규 vs 기타 판별용) — appSettings 우선, localStorage fallback
  const priorYearSet = useMemo(() => {
    if (appSettings?.priorYearCustomers && Array.isArray(appSettings.priorYearCustomers)) {
      return new Set(appSettings.priorYearCustomers);
    }
    return loadPriorYearCustomers();
  }, [appSettings]);

  // 유효 담당자 정렬 목록 (사업계획 + teamMembers만)
  const validReps = useMemo(
    () => getSortedValidReps({ businessPlans, teamMembers }),
    [businessPlans, teamMembers]
  );
  const validRepsSet = useMemo(() => new Set(validReps), [validReps]);
  const [tab, setTab] = useState('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  // 월 offset: 0=이번달, -1=전월 등. 스펙 기본값은 직전 완료 월(-1)
  const [monthOffset, setMonthOffset] = useState(-1);
  // Executive Summary (수동 입력, localStorage 저장)
  const [execSummary, setExecSummary] = useState({ msg1: '', msg2: '', msg3: '', status: '🟢', nextMonthFocus: '' });
  // 다음 달 사업 계획 (수동 입력, localStorage)
  const [nextMonthPlan, setNextMonthPlan] = useState({ overseas: '', domestic: '', support: '' });
  // 담당자별 실적 드릴다운 토글 (신규/기타 고객 리스트 펼침)
  const [repDrillOpen, setRepDrillOpen] = useState({}); // { [repKey]: boolean }
  const toggleRepDrill = (key) => setRepDrillOpen(prev => ({ ...prev, [key]: !prev[key] }));

  /* ── Base data ── */
  // ⚠️ customer plan만 명시적으로 (team_sales와 product 제외)
  //   이전에 (p.type === 'customer' || !p.type) 로 필터해서 team_sales가 섞여 수주·매출 목표 동일 출력 버그
  const customerPlans = useMemo(() =>
    businessPlans.filter(p => p.year === CURRENT_YEAR && (p.type === 'customer' || !p.type)),
    [businessPlans]
  );
  const productPlans = useMemo(() =>
    businessPlans.filter(p => p.year === CURRENT_YEAR && p.type === 'product'),
    [businessPlans]
  );
  const hasPlan = customerPlans.length > 0;

  const planLookup = useMemo(() => {
    const byAccountId = {};
    const byName = {};
    customerPlans.forEach(p => {
      if (p.account_id) byAccountId[p.account_id] = p;
      if (p.customer_name) byName[p.customer_name.toLowerCase().trim()] = p;
    });
    return { byAccountId, byName };
  }, [customerPlans]);

  const findPlanForOrder = (o) => {
    return planLookup.byAccountId[o.account_id]
      || planLookup.byName[(o.customer_name || '').toLowerCase().trim()]
      || null;
  };

  const yearOrders = useMemo(() =>
    orders.filter(o => (o.order_date || '').startsWith(String(CURRENT_YEAR))),
    [orders]
  );

  /* ── Plan summary (shared) ── */
  const planSummary = useMemo(() => {
    if (!hasPlan) return null;
    const monthKey = String(CURRENT_MONTH).padStart(2, '0');

    const annualTarget = customerPlans.reduce((s, p) => s + (p.annual_target || 0), 0);
    let ytdTarget = 0;
    customerPlans.forEach(p => {
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    const ytdActual = yearOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    const monthTarget = customerPlans.reduce((s, p) => s + (p.targets?.[monthKey] || 0), 0);
    const thisMonthStr = getMonthStr();
    const monthActual = orders.filter(o => (o.order_date || '').startsWith(thisMonthStr))
      .reduce((s, o) => s + (o.order_amount || 0), 0);

    // rep-level YTD
    // ⚠️ 담당자 분류 절대 규칙 (재발 방지):
    //   - 영업현황 o.sales_rep 그대로 쓰면 안 됨 (비유효 담당자 다수)
    //   - classifyForRepView로 사업계획 매칭 실패 시 국내기타/해외기타/국내신규/해외신규 버킷
    const byRep = {};
    const planByNameForPS = {};
    customerPlans.forEach(p => {
      if (!p.customer_name) return;
      if (['해외기타', '직판영업', '국내 신규', '국내 기타'].includes(p.customer_name.trim())) return;
      planByNameForPS[p.customer_name.toLowerCase().trim()] = p;
    });
    const priorSet = (appSettings?.priorYearCustomers && Array.isArray(appSettings.priorYearCustomers))
      ? new Set(appSettings.priorYearCustomers) : (typeof loadPriorYearCustomers === 'function' ? loadPriorYearCustomers() : new Set());
    // 초기화: 사업계획 담당자 + teamMembers + 4버킷
    customerPlans.forEach(p => {
      if (p.sales_rep && !['해외기타', '직판영업', '국내 신규', '국내 기타'].includes((p.customer_name || '').trim())) {
        if (!byRep[p.sales_rep]) byRep[p.sales_rep] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
      }
    });
    (teamMembers || []).forEach(r => {
      if (!byRep[r]) byRep[r] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
    });
    ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => {
      if (!byRep[k]) byRep[k] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
    });
    // 목표
    customerPlans.forEach(p => {
      const cname = (p.customer_name || '').trim();
      let rep;
      if (['해외기타', '국내 기타', '국내 신규', '직판영업'].includes(cname)) {
        if (cname === '해외기타') rep = '해외기타';
        else if (cname === '국내 기타') rep = '국내기타';
        else if (cname === '국내 신규') rep = '국내신규';
        else return; // 직판영업 bucket은 스킵
      } else {
        rep = p.sales_rep || '미배정';
      }
      if (!byRep[rep]) byRep[rep] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
      byRep[rep].annualTarget += (p.annual_target || 0);
      byRep[rep].monthTarget += (p.targets?.[monthKey] || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        byRep[rep].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    // 실적 — classifyForRepView로 버킷 자동 분류
    yearOrders.forEach(o => {
      const acc = o.account_id ? accounts.find(a => a.id === o.account_id)
        : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (o.customer_name || '').toLowerCase().trim()) || null;
      const { rep } = classifyForRepView({
        account: acc,
        customerName: o.customer_name || acc?.company_name,
        planByName: planByNameForPS,
        priorSet,
      });
      if (!rep) return;
      if (!byRep[rep]) byRep[rep] = { ytdTarget: 0, ytdActual: 0, annualTarget: 0, monthTarget: 0, monthActual: 0 };
      byRep[rep].ytdActual += (o.order_amount || 0);
      if ((o.order_date || '').startsWith(thisMonthStr)) {
        byRep[rep].monthActual += (o.order_amount || 0);
      }
    });

    // account-level month plan vs actual
    const accountPlanVsActual = [];
    const planByCustomer = {};
    customerPlans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (!planByCustomer[key]) planByCustomer[key] = { target: 0, ytdTarget: 0, name: p.customer_name, rep: p.sales_rep };
      planByCustomer[key].target += (p.targets?.[monthKey] || 0);
      for (let m = 1; m <= CURRENT_MONTH; m++) {
        planByCustomer[key].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(thisMonthStr));
    Object.entries(planByCustomer).forEach(([key, { target, ytdTarget: yt, name, rep }]) => {
      const actual = monthOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === key)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const ytdAct = yearOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === key)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      if (target > 0) {
        accountPlanVsActual.push({ key, name, rep, target, actual, ytdActual: ytdAct, pct: pct(actual, target) });
      }
    });
    accountPlanVsActual.sort((a, b) => b.target - a.target);

    return { annualTarget, ytdTarget, ytdActual, monthTarget, monthActual, byRep, accountPlanVsActual };
  }, [customerPlans, orders, yearOrders, hasPlan, planLookup, accounts, teamMembers, appSettings]);

  /* ── Category breakdown builder ── */
  const buildCategoryBreakdown = (periodOrders, periodLabel) => {
    // 1. By rep (plan-based)
    const repMap = {};
    if (hasPlan) {
      customerPlans.forEach(p => {
        const rep = p.sales_rep || '미배정';
        if (!repMap[rep]) repMap[rep] = { periodActual: 0, ytdActual: 0, annualTarget: p.annual_target || 0, monthTarget: 0 };
        else repMap[rep].annualTarget += (p.annual_target || 0);
      });
    }
    const tmSet = new Set(teamMembers);
    periodOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || o.sales_rep || '기타';
      const validRep = tmSet.has(rep) ? rep : (repMap[rep] ? rep : '기타');
      if (!repMap[validRep]) repMap[validRep] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      repMap[validRep].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const rep = plan?.sales_rep || o.sales_rep || '기타';
      const validRep = tmSet.has(rep) ? rep : (repMap[rep] ? rep : '기타');
      if (!repMap[validRep]) repMap[validRep] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      repMap[validRep].ytdActual += (o.order_amount || 0);
    });
    const repRows = Object.entries(repMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget)
      .map(([label, v]) => ({ label, ...v }));

    // 2. By product (fuzzy match to productPlans)
    const prodMap = {};
    if (productPlans.length > 0) {
      productPlans.forEach(p => {
        const prod = p.product || '기타';
        if (!prodMap[prod]) prodMap[prod] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
        prodMap[prod].annualTarget += (p.annual_target || 0);
      });
    }
    const matchProduct = (cat) => {
      if (!cat) return null;
      const catLow = cat.toLowerCase();
      for (const prod of Object.keys(prodMap)) {
        const pLow = prod.toLowerCase();
        if (catLow.includes(pLow) || pLow.includes(catLow)) return prod;
      }
      return cat; // fallback to raw category
    };
    periodOrders.forEach(o => {
      const prod = matchProduct(o.product_category) || o.product_category || '기타';
      if (!prodMap[prod]) prodMap[prod] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      prodMap[prod].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const prod = matchProduct(o.product_category) || o.product_category || '기타';
      if (!prodMap[prod]) prodMap[prod] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      prodMap[prod].ytdActual += (o.order_amount || 0);
    });
    const prodRows = Object.entries(prodMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    // 3. By region (plan-based)
    const regMap = {};
    if (hasPlan) {
      customerPlans.forEach(p => {
        const reg = p.region || '기타';
        if (!regMap[reg]) regMap[reg] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
        regMap[reg].annualTarget += (p.annual_target || 0);
      });
    }
    periodOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const reg = plan?.region || o.region || acc?.region || '기타';
      if (!regMap[reg]) regMap[reg] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      regMap[reg].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const reg = plan?.region || o.region || acc?.region || '기타';
      if (!regMap[reg]) regMap[reg] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      regMap[reg].ytdActual += (o.order_amount || 0);
    });
    const regRows = Object.entries(regMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    // 4. By biz_type
    const bizMap = {};
    if (hasPlan) {
      customerPlans.forEach(p => {
        const biz = p.biz_type || '기타';
        if (!bizMap[biz]) bizMap[biz] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
        bizMap[biz].annualTarget += (p.annual_target || 0);
      });
    }
    periodOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const biz = plan?.biz_type || acc?.business_type || '기타';
      if (!bizMap[biz]) bizMap[biz] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      bizMap[biz].periodActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const plan = findPlanForOrder(o);
      const acc = accounts.find(a => a.id === o.account_id);
      const biz = plan?.biz_type || acc?.business_type || '기타';
      if (!bizMap[biz]) bizMap[biz] = { periodActual: 0, ytdActual: 0, annualTarget: 0 };
      bizMap[biz].ytdActual += (o.order_amount || 0);
    });
    const bizRows = Object.entries(bizMap)
      .filter(([, v]) => v.periodActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => b[1].annualTarget - a[1].annualTarget || b[1].ytdActual - a[1].ytdActual)
      .map(([label, v]) => ({ label, ...v }));

    // v3.1: 고객유형별(typeRows) 제거 — 사업구분별(bizRows)과 중복, 사용처 없음

    return { repRows, prodRows, regRows, bizRows };
  };

  /* ══════════════════════════════
     WEEKLY DATA
     ══════════════════════════════ */
  const weeklyData = useMemo(() => {
    const { start, end } = getWeekRange();
    const weekLogs = activityLogs.filter(l => (l.date || '') >= start && (l.date || '') <= end);
    const weekOrders = orders.filter(o => (o.order_date || '') >= start && (o.order_date || '') <= end);
    const weekOrderTotal = weekOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    // 담당자별 배정 고객수 (accounts.sales_rep 기준)
    const assignedCountByRep = {};
    teamMembers.forEach(t => { assignedCountByRep[t] = 0; });
    accounts.forEach(a => {
      if (a.sales_rep && assignedCountByRep[a.sales_rep] !== undefined) {
        assignedCountByRep[a.sales_rep]++;
      }
    });

    // Activity summary per rep (전원 표시, 활동 0이어도 유지)
    const repActivity = {};
    teamMembers.forEach(t => {
      repActivity[t] = {
        assignedCount: assignedCountByRep[t] || 0,
        contacts: 0, orderActivity: 0, crossSelling: 0, latestContent: '',
      };
    });
    weekLogs.forEach(l => {
      const rep = l.sales_rep;
      if (!rep || !repActivity[rep]) return;
      repActivity[rep].contacts++;
      if (l.issue_type === '수주활동') repActivity[rep].orderActivity++;
      if (l.issue_type === '크로스셀링') repActivity[rep].crossSelling++;
      if (l.content && (!repActivity[rep].latestContent || (l.date || '') > (repActivity[rep]._latestDate || ''))) {
        repActivity[rep].latestContent = l.content.length > 40 ? l.content.slice(0, 40) + '...' : l.content;
        repActivity[rep]._latestDate = l.date;
      }
    });

    // Overdue issues (14+ days open)
    const overdueIssues = activityLogs
      .filter(l => l.status !== 'Closed' && daysSince(l.date) > 14)
      .map(l => {
        const account = accounts.find(a => a.id === l.account_id);
        return { ...l, company_name: account?.company_name || '?' };
      })
      .sort((a, b) => daysSince(a.date) - daysSince(b.date))
      .reverse();

    // Category breakdowns for this week
    const breakdown = buildCategoryBreakdown(weekOrders, '금주');

    return {
      weekStart: start,
      weekEnd: end,
      weekLogs,
      weekOrders,
      weekOrderTotal,
      weekOrderCount: weekOrders.length,
      weekActivityCount: weekLogs.length,
      openIssueCount: openIssues.length,
      repActivity,
      overdueIssues,
      breakdown,
    };
  }, [activityLogs, orders, accounts, openIssues, yearOrders, customerPlans, productPlans, planLookup, teamMembers]);

  /* ══════════════════════════════
     SECTION A — 매출·수주 현황 (팀별)
     ══════════════════════════════ */
  const sectionAData = useMemo(() => {
    const { start: wkStart, end: wkEnd, monday } = getWeekRangeByOffset(weekOffset);
    const wkMonth = monday.getMonth() + 1;
    const wkYear = monday.getFullYear();
    const monthStr = `${wkYear}-${String(wkMonth).padStart(2, '0')}`;
    const monthKey = String(wkMonth).padStart(2, '0');

    // 전주 끝 = 이번주 월요일 전날 (일요일)
    const prevWeekEnd = new Date(monday);
    prevWeekEnd.setDate(monday.getDate() - 1);
    const prevWeekEndStr = prevWeekEnd.toISOString().slice(0, 10);
    const monthStartStr = `${monthStr}-01`;

    // 주문 → 팀 매핑 함수 (region fallback으로 3사업부만, '기타' 제거)
    const getTeamForOrder = (o) => {
      const plan = findPlanForOrder(o);
      if (plan?.team && ['해외영업', '영업지원', '국내영업'].includes(plan.team)) {
        return plan.team;
      }
      // fallback: 고객 region 기반 국내/해외 판별
      const acc = o.account_id ? accounts.find(a => a.id === o.account_id) : null;
      const region = (o.region || acc?.region || '').trim();
      const domesticRegions = ['한국', '국내', 'Korea', 'Domestic'];
      if (domesticRegions.includes(region)) return '국내영업';
      // 한글 고객명이면 국내로 추정 (region 미확인 시)
      if (!region && /[가-힣]/.test(o.customer_name || acc?.company_name || '')) return '국내영업';
      return '해외영업';
    };

    // 당월 전체 주문
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(monthStr));
    // 금주 주문
    const thisWeekOrders = monthOrders.filter(o => (o.order_date || '') >= wkStart && (o.order_date || '') <= wkEnd);
    // 전주까지 누적 (당월 시작 ~ 금주 시작 전날)
    const prevWeekOrders = monthOrders.filter(o => (o.order_date || '') >= monthStartStr && (o.order_date || '') < wkStart);

    // 팀별 집계
    const teamData = {};
    TEAM_ORDER.forEach(team => {
      teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    });
    teamData['기타'] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };

    prevWeekOrders.forEach(o => {
      const team = getTeamForOrder(o);
      if (!teamData[team]) teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      teamData[team].prevCum += (o.order_amount || 0);
      teamData[team].monthCum += (o.order_amount || 0);
    });

    thisWeekOrders.forEach(o => {
      const team = getTeamForOrder(o);
      if (!teamData[team]) teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      teamData[team].thisWeek += (o.order_amount || 0);
      teamData[team].monthCum += (o.order_amount || 0);
    });

    // 당월 목표 (사업계획 팀별)
    customerPlans.forEach(p => {
      const team = p.team || '기타';
      if (!teamData[team]) teamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      teamData[team].monthTarget += (p.targets?.[monthKey] || 0);
    });

    // 합계 행
    const total = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    Object.values(teamData).forEach(d => {
      total.prevCum += d.prevCum;
      total.thisWeek += d.thisWeek;
      total.monthCum += d.monthCum;
      total.monthTarget += d.monthTarget;
    });

    // 표시할 팀 목록 (3사업부만; region fallback으로 '기타'는 발생 안 함)
    const displayTeams = [...TEAM_ORDER];

    // ══ 매출(Sales) 사업부별 집계 (B/L Date 기준, 해외/BPU/국내) ══
    // 매출 고객의 plan.team(수주팀) → 매출팀 매핑, region fallback으로 3사업부 통합
    const getSalesTeamForSale = (s) => {
      const plan = planLookup.byAccountId[s.account_id]
        || planLookup.byName[(s.customer_name || '').toLowerCase().trim()];
      const orderTeam = plan?.team;
      if (orderTeam && ORDER_TEAM_TO_SALES[orderTeam]) {
        return ORDER_TEAM_TO_SALES[orderTeam];
      }
      // fallback: region 기반
      const acc = s.account_id ? accounts.find(a => a.id === s.account_id) : null;
      const region = (s.region || acc?.region || '').trim();
      const domesticRegions = ['한국', '국내', 'Korea', 'Domestic'];
      if (domesticRegions.includes(region)) return '국내';
      if (!region && /[가-힣]/.test(s.customer_name || acc?.company_name || '')) return '국내';
      return '해외';
    };

    const monthSales = (sales || []).filter(s => (s.sale_date || '').startsWith(monthStr));
    const thisWeekSales = monthSales.filter(s => (s.sale_date || '') >= wkStart && (s.sale_date || '') <= wkEnd);
    const prevWeekSales = monthSales.filter(s => (s.sale_date || '') >= monthStartStr && (s.sale_date || '') < wkStart);

    const salesTeamData = {};
    SALES_TEAM_ORDER.forEach(team => {
      salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    });
    salesTeamData['기타'] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };

    prevWeekSales.forEach(s => {
      const team = getSalesTeamForSale(s);
      if (!salesTeamData[team]) salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      salesTeamData[team].prevCum += (s.sale_amount || 0);
      salesTeamData[team].monthCum += (s.sale_amount || 0);
    });
    thisWeekSales.forEach(s => {
      const team = getSalesTeamForSale(s);
      if (!salesTeamData[team]) salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
      salesTeamData[team].thisWeek += (s.sale_amount || 0);
      salesTeamData[team].monthCum += (s.sale_amount || 0);
    });

    // 매출 목표 우선순위:
    //   1순위: businessPlans의 type === 'team_sales' (사업계획 월별매출 시트에서 추출한 전용 매출목표)
    //   2순위 (Fallback): customerPlans의 수주 목표를 팀별로 집계해 매출목표로 사용
    //     → team_sales가 Import 안 됐더라도 "매출 목표 대비 실적"이 반드시 표시됨
    const teamSalesPlans = businessPlans.filter(p => p.type === 'team_sales' && p.year === wkYear);
    let salesTargetSource = 'none';
    if (teamSalesPlans.length > 0) {
      teamSalesPlans.forEach(p => {
        const team = p.team;
        if (!salesTeamData[team]) salesTeamData[team] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
        salesTeamData[team].monthTarget += (p.targets?.[monthKey] || 0);
      });
      salesTargetSource = 'team_sales';
    } else {
      // Fallback: 수주목표(customerPlans) → 팀별로 집계 (해외영업/영업지원/국내영업 → 해외/BPU/국내 매핑)
      customerPlans.forEach(p => {
        const orderTeam = p.team;
        const salesTeam = ORDER_TEAM_TO_SALES[orderTeam];
        if (!salesTeam) return;
        if (!salesTeamData[salesTeam]) salesTeamData[salesTeam] = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
        salesTeamData[salesTeam].monthTarget += (p.targets?.[monthKey] || 0);
      });
      salesTargetSource = 'fallback_order_target';
    }

    const salesTotal = { prevCum: 0, thisWeek: 0, monthCum: 0, monthTarget: 0 };
    Object.values(salesTeamData).forEach(d => {
      salesTotal.prevCum += d.prevCum;
      salesTotal.thisWeek += d.thisWeek;
      salesTotal.monthCum += d.monthCum;
      salesTotal.monthTarget += d.monthTarget;
    });
    const hasSalesData = (sales || []).length > 0;
    const hasSalesTarget = salesTotal.monthTarget > 0;

    // 매출 표시 팀 목록 (3사업부만, region fallback으로 '기타' 발생 안 함)
    const displaySalesTeams = [...SALES_TEAM_ORDER];

    // ── MTD 달성률 (수주 기준) ──
    const mtdActual = total.monthCum;
    const mtdTarget = total.monthTarget;
    const mtdPct = mtdTarget > 0 ? Math.round((mtdActual / mtdTarget) * 100) : 0;

    // ── 담당자별 주간 실적 (신 분류 체계) ──
    const planByNameWk = {};
    customerPlans.forEach(p => {
      if (!p.customer_name) return;
      const bucketNames = ['해외기타', '직판영업', '국내 신규', '국내 기타'];
      if (bucketNames.includes(p.customer_name.trim())) return;
      planByNameWk[p.customer_name.toLowerCase().trim()] = p;
    });
    const classifyTxWk = (tx) => {
      const acc = tx.account_id ? accounts.find(a => a.id === tx.account_id)
        : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (tx.customer_name || '').toLowerCase().trim()) || null;
      return classifyForRepView({
        account: acc,
        customerName: tx.customer_name || acc?.company_name,
        planByName: planByNameWk,
        priorSet: priorYearSet,
      });
    };
    const weekRepMap = {};
    const initWkKeys = new Set();
    customerPlans.forEach(p => { if (p.sales_rep && !['해외기타', '직판영업', '국내 신규', '국내 기타'].includes((p.customer_name || '').trim())) initWkKeys.add(p.sales_rep); });
    teamMembers.forEach(r => initWkKeys.add(r));
    ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => initWkKeys.add(k));
    initWkKeys.forEach(k => { weekRepMap[k] = { monthTarget: 0, weekActual: 0, monthActual: 0, monthCum: 0 }; });

    // 월 목표 (해당 담당자 plans + 버킷 플랜 월 목표)
    customerPlans.forEach(p => {
      const name = (p.customer_name || '').trim();
      if (['해외기타', '국내 기타', '국내 신규', '직판영업'].includes(name)) {
        let key = null;
        if (name === '해외기타') key = '해외기타';
        else if (name === '국내 기타') key = '국내기타';
        else if (name === '국내 신규') key = '국내신규';
        if (key && weekRepMap[key]) weekRepMap[key].monthTarget += (p.targets?.[monthKey] || 0);
        return;
      }
      const rep = p.sales_rep || '미배정';
      if (!weekRepMap[rep]) weekRepMap[rep] = { monthTarget: 0, weekActual: 0, monthActual: 0 };
      weekRepMap[rep].monthTarget += (p.targets?.[monthKey] || 0);
    });
    // 금주 수주
    thisWeekOrders.forEach(o => {
      const { rep } = classifyTxWk(o);
      if (!rep || !weekRepMap[rep]) weekRepMap[rep] = weekRepMap[rep] || { monthTarget: 0, weekActual: 0, monthActual: 0 };
      weekRepMap[rep].weekActual += (o.order_amount || 0);
    });
    // 당월 누적 수주 (전주 + 금주)
    monthOrders.forEach(o => {
      const { rep } = classifyTxWk(o);
      if (!rep || !weekRepMap[rep]) weekRepMap[rep] = weekRepMap[rep] || { monthTarget: 0, weekActual: 0, monthActual: 0 };
      weekRepMap[rep].monthActual += (o.order_amount || 0);
    });
    const weekRepRows = Object.entries(weekRepMap)
      .filter(([k, v]) => v.monthTarget > 0 || v.monthActual > 0 || v.weekActual > 0)
      .sort((a, b) => {
        const pa = a[1].monthTarget > 0 ? a[1].monthActual / a[1].monthTarget : -1;
        const pb = b[1].monthTarget > 0 ? b[1].monthActual / b[1].monthTarget : -1;
        if (pa !== pb) return pb - pa;
        return b[1].monthActual - a[1].monthActual;
      })
      .map(([label, v]) => ({
        label, ...v,
        isBucket: ['국내기타', '해외기타', '국내신규', '해외신규'].includes(label),
        isNew: label.endsWith('신규'),
      }));

    // 주간용 신규/기타 상세 리스트 (월 누적 기준)
    const wkNewDetails = { 국내신규: [], 해외신규: [] };
    const wkEtcDetails = { 국내기타: [], 해외기타: [] };
    monthOrders.forEach(o => {
      const { rep, bucket } = classifyTxWk(o);
      if (bucket !== 'new' && bucket !== 'etc') return;
      const target = bucket === 'new' ? wkNewDetails : wkEtcDetails;
      if (!target[rep]) target[rep] = [];
      const existing = target[rep].find(x => x.name === o.customer_name);
      if (existing) { existing.amount += (o.order_amount || 0); existing.orderCount++; }
      else target[rep].push({ name: o.customer_name, amount: o.order_amount || 0, orderCount: 1, accountId: o.account_id || null });
    });
    Object.keys(wkNewDetails).forEach(k => wkNewDetails[k].sort((a, b) => b.amount - a.amount));
    Object.keys(wkEtcDetails).forEach(k => wkEtcDetails[k].sort((a, b) => b.amount - a.amount));

    // ── 분기별 진행 현황 (Q1~Q4) ──
    const quarterData = [1, 2, 3, 4].map(q => {
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      let target = 0;
      let actual = 0;
      for (let m = startMonth; m <= endMonth; m++) {
        const mKey = String(m).padStart(2, '0');
        customerPlans.forEach(p => {
          target += (p.targets?.[mKey] || 0);
        });
        const mPrefix = `${wkYear}-${mKey}`;
        orders.forEach(o => {
          if ((o.order_date || '').startsWith(mPrefix)) actual += (o.order_amount || 0);
        });
      }
      // 분기 상태 판단
      const currentQ = Math.ceil(wkMonth / 3);
      let status = 'future';
      if (q < currentQ) status = 'done';
      else if (q === currentQ) status = 'active';
      return {
        q, target, actual,
        achieveRate: target > 0 ? Math.round((actual / target) * 100) : 0,
        status,
        label: `Q${q}`,
      };
    });

    return {
      wkStart, wkEnd, monday,
      weekLabel: getWeekLabel(monday),
      monthStr,
      teamData,
      displayTeams,
      total,
      salesTeamData, salesTotal, hasSalesData, hasSalesTarget, displaySalesTeams, salesTargetSource,
      mtdActual, mtdTarget, mtdPct,
      quarterData,
      weekRepRows, wkNewDetails, wkEtcDetails,
    };
  }, [orders, sales, customerPlans, businessPlans, weekOffset, planLookup, accounts, teamMembers, priorYearSet]);

  /* ══════════════════════════════
     SECTION B — 이슈사항 자동 집계
     ══════════════════════════════ */
  // 이슈 유형 → 리포트 카테고리 매핑
  const ISSUE_CATEGORY_MAP = {
    '수주활동': '영업이슈', '가격협의': '영업이슈', '입찰': '영업이슈', '계약갱신': '영업이슈', '영업미팅': '영업이슈',
    '샘플요청': '고객지원', '규제·인증': '고객지원',
    '품질클레임': '품질이슈', 'VOC수집': '품질이슈',
  };
  const ISSUE_CAT_ORDER = ['영업이슈', '고객지원', '품질이슈', '기타'];
  const ISSUE_CAT_LABELS = {
    '영업이슈': '영업이슈 (수주관련)', '고객지원': '고객지원 (유관부서 협조필요)',
    '품질이슈': '품질이슈', '기타': '기타',
  };
  const TEAM_SHORT = { '해외영업': '해외', '영업지원': '지원', '국내영업': '국내' };

  // account → team 매핑 함수
  const getTeamForAccount = (accountId) => {
    const plan = planLookup.byAccountId[accountId];
    if (plan?.team) return plan.team;
    const acc = accounts.find(a => a.id === accountId);
    if (acc) {
      const namePlan = planLookup.byName[(acc.company_name || '').toLowerCase().trim()];
      if (namePlan?.team) return namePlan.team;
      if (acc.region === '한국') return '국내영업';
    }
    return '해외영업';
  };

  /* ══════════════════════════════
     팀별 통합 블록 데이터
     각 팀별로: 금주활동 / 주요이슈 / Open이슈 / 차주계획 / 리스크
     ══════════════════════════════ */
  const teamBlocksData = useMemo(() => {
    const { wkStart, wkEnd, monday } = sectionAData;
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    const nStart = nextMonday.toISOString().slice(0, 10);
    const nEnd = nextSunday.toISOString().slice(0, 10);
    const now = new Date();

    // 팀별 빈 구조 초기화
    const blocks = {};
    TEAM_ORDER.forEach(t => {
      blocks[t] = {
        team: t,
        display: TEAM_DISPLAY[t] || t,
        activity: { contacts: 0, orderActivity: 0, crossSelling: 0, sampleRequest: 0, priceNegotiation: 0 },
        majorIssues: [],   // 금주 발생 + priority ≥ 2
        openIssues: [],    // 누적 미해결, 우선순위별 그룹핑
        nextActions: [],   // 차주 예정 + 금주 미완료 이월
        risks: {
          reorderSoon: [],
          contractExpiring: [],
          overdue: [],
        },
      };
    });

    // ── 금주 활동 집계 ──
    const weekLogs = activityLogs.filter(l => (l.date || '') >= wkStart && (l.date || '') <= wkEnd);
    weekLogs.forEach(l => {
      const team = getTeamForAccount(l.account_id);
      if (!blocks[team]) return;
      blocks[team].activity.contacts++;
      if (l.issue_type === '수주활동') blocks[team].activity.orderActivity++;
      if (l.issue_type === '크로스셀링') blocks[team].activity.crossSelling++;
      if (l.issue_type === '샘플요청') blocks[team].activity.sampleRequest++;
      if (l.issue_type === '가격협의') blocks[team].activity.priceNegotiation++;
    });

    // ── 주요 이슈 (금주 발생 + priority ≥ 2) ──
    weekLogs.forEach(l => {
      const priority = l.priority ?? 1;
      if (priority < 2) return;
      const team = getTeamForAccount(l.account_id);
      if (!blocks[team]) return;
      const acc = accounts.find(a => a.id === l.account_id);
      blocks[team].majorIssues.push({
        id: l.id,
        company: acc?.company_name || '?',
        accountId: l.account_id,
        content: l.content || '-',
        issueType: l.issue_type,
        status: l.status || 'Open',
        priority,
        date: l.date,
        rep: l.sales_rep || '-',
      });
    });
    // 긴급 먼저
    Object.values(blocks).forEach(b => {
      b.majorIssues.sort((a, b2) => (b2.priority - a.priority) || (b2.date || '').localeCompare(a.date || ''));
    });

    // ── Open 이슈 (누적, 고객별 그룹핑 + 우선순위) ──
    const openLogs = activityLogs.filter(l => l.status !== 'Closed');
    // 고객별 묶기
    const byTeamAndCustomer = {};
    openLogs.forEach(l => {
      const team = getTeamForAccount(l.account_id);
      if (!blocks[team]) return;
      const acc = accounts.find(a => a.id === l.account_id);
      const company = acc?.company_name || '?';
      const key = `${team}||${company}`;
      if (!byTeamAndCustomer[key]) {
        byTeamAndCustomer[key] = {
          team, company, accountId: l.account_id, account: acc,
          issues: [], maxDaysOpen: 0, hasQuality: false, priorityMax: 0,
          strategicTier: acc?.strategic_tier || null,
        };
      }
      const daysOpen = daysSince(l.date);
      byTeamAndCustomer[key].issues.push({
        id: l.id,
        issueType: l.issue_type,
        content: l.content || '-',
        status: l.status || 'Open',
        priority: l.priority ?? 1,
        date: l.date,
        daysOpen,
        rep: l.sales_rep || '-',
      });
      if (daysOpen > byTeamAndCustomer[key].maxDaysOpen) byTeamAndCustomer[key].maxDaysOpen = daysOpen;
      if (l.issue_type === '품질클레임') byTeamAndCustomer[key].hasQuality = true;
      const prio = l.priority ?? 1;
      if (prio > byTeamAndCustomer[key].priorityMax) byTeamAndCustomer[key].priorityMax = prio;
    });

    // 우선순위 자동 산정 + 팀별 배분
    Object.values(byTeamAndCustomer).forEach(cu => {
      // P1 긴급: priority 3 있음 OR 14일 초과 + (A/B 등급 or 품질클레임) OR 5건 이상
      // P2 주의: 7일+ 이슈 있거나 2건 이상 OR priority 2
      // P3 관리: 그 외
      const isABTier = cu.strategicTier === 'A' || cu.strategicTier === 'B';
      let p = 'P3';
      if (cu.priorityMax >= 3 || cu.hasQuality || (cu.maxDaysOpen > 14 && isABTier) || cu.issues.length >= 5) p = 'P1';
      else if (cu.priorityMax >= 2 || cu.maxDaysOpen > 7 || cu.issues.length >= 2) p = 'P2';
      cu.priority = p;
      // 이슈 정렬
      cu.issues.sort((a, b) => (b.priority - a.priority) || b.daysOpen - a.daysOpen);
      if (blocks[cu.team]) blocks[cu.team].openIssues.push(cu);
    });
    // 팀별로 우선순위 순 정렬
    Object.values(blocks).forEach(b => {
      const order = { P1: 0, P2: 1, P3: 2 };
      b.openIssues.sort((a, b2) => (order[a.priority] - order[b2.priority]) || b2.maxDaysOpen - a.maxDaysOpen);
    });

    // ── 차주 계획 (다음주 due_date + 금주 미완료 이월) ──
    const actionsMap = new Map();
    activityLogs.forEach(l => {
      if (l.status === 'Closed') return;
      const team = getTeamForAccount(l.account_id);
      if (!blocks[team]) return;
      const inNextWeek = l.next_action && l.due_date && l.due_date >= nStart && l.due_date <= nEnd;
      const isThisWeekOpen = (l.date || '') >= wkStart && (l.date || '') <= wkEnd && !l.next_action;
      const isOverdue = l.due_date && l.due_date <= wkEnd;
      if (!inNextWeek && !isThisWeekOpen && !isOverdue) return;
      if (actionsMap.has(l.id)) return;
      const acc = accounts.find(a => a.id === l.account_id);
      actionsMap.set(l.id, {
        team,
        company: acc?.company_name || '?',
        accountId: l.account_id,
        action: l.next_action || `[${l.issue_type}] ${l.content || '-'}`,
        dueDate: l.due_date || '-',
        rep: l.sales_rep || '-',
        isCarryover: !inNextWeek,
        daysOpen: daysSince(l.date),
        status: l.status,
      });
    });
    Array.from(actionsMap.values()).forEach(a => {
      if (blocks[a.team]) blocks[a.team].nextActions.push(a);
    });
    Object.values(blocks).forEach(b => {
      b.nextActions.sort((a, b2) => {
        if (a.isCarryover !== b2.isCarryover) return a.isCarryover ? -1 : 1;
        return (a.dueDate || '').localeCompare(b2.dueDate || '');
      });
    });

    // ── 리스크 (재구매 임박 + 계약만료 임박 + 14일+ 미해결) ──
    // 재구매 임박: alarms에서 수집 + 팀 분배
    (alarms || []).filter(a => a.type === 'reorder' && a.level === 'danger').forEach(al => {
      const team = getTeamForAccount(al.account?.id);
      if (!blocks[team]) return;
      blocks[team].risks.reorderSoon.push({
        company: al.account?.company_name || '?', msg: al.msg, source: al.source,
        accountId: al.account?.id,
      });
    });
    // 계약 만료 D-60 이내
    (contracts || []).forEach(c => {
      if (!c.contract_expiry) return;
      const daysLeft = Math.ceil((new Date(c.contract_expiry) - now) / 86400000);
      if (daysLeft <= 60 && daysLeft > 0) {
        const team = getTeamForAccount(c.account_id);
        if (!blocks[team]) return;
        const acc = accounts.find(a => a.id === c.account_id);
        blocks[team].risks.contractExpiring.push({
          company: acc?.company_name || '?',
          product: c.product_category, daysLeft, expiry: c.contract_expiry,
          accountId: c.account_id,
        });
      }
    });
    // 14일+ 미해결
    openLogs.forEach(l => {
      const d = daysSince(l.date);
      if (d <= 14) return;
      const team = getTeamForAccount(l.account_id);
      if (!blocks[team]) return;
      const acc = accounts.find(a => a.id === l.account_id);
      blocks[team].risks.overdue.push({
        company: acc?.company_name || '?', issueType: l.issue_type,
        daysOpen: d, accountId: l.account_id,
      });
    });
    Object.values(blocks).forEach(b => {
      b.risks.reorderSoon.sort((a, c) => (a.company || '').localeCompare(b.company || ''));
      b.risks.contractExpiring.sort((a, c) => a.daysLeft - c.daysLeft);
      b.risks.overdue.sort((a, c) => c.daysOpen - a.daysOpen);
    });

    return { blocks, nextWeekLabel: `${nStart} ~ ${nEnd}` };
  }, [sectionAData, activityLogs, accounts, contracts, alarms, planLookup]);

  // 레거시 유지용 (기존 섹션 B/C 참조 호환)
  const sectionBData = useMemo(() => {
    const { wkStart, wkEnd } = sectionAData;
    const weekLogs = activityLogs.filter(l => (l.date || '') >= wkStart && (l.date || '') <= wkEnd);
    return { totalCount: weekLogs.length };
  }, [sectionAData, activityLogs]);

  /* ══════════════════════════════
     SECTION C — 다음 주 예정 액션
     ══════════════════════════════ */
  const sectionCData = useMemo(() => {
    const { monday, wkStart, wkEnd } = sectionAData;
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    const nStart = nextMonday.toISOString().slice(0, 10);
    const nEnd = nextSunday.toISOString().slice(0, 10);

    const actionsMap = new Map(); // 중복 제거용 (id 기준)

    // ① 다음 주 due_date 액션 (정상 예정)
    activityLogs
      .filter(l => l.next_action && l.status !== 'Closed' && l.due_date && l.due_date >= nStart && l.due_date <= nEnd)
      .forEach(l => {
        const acc = accounts.find(a => a.id === l.account_id);
        const team = getTeamForAccount(l.account_id);
        actionsMap.set(l.id, {
          teamShort: TEAM_SHORT[team] || team,
          company: acc?.company_name || '?',
          action: l.next_action,
          dueDate: l.due_date,
          rep: l.sales_rep || '-',
          isCarryover: false,
          status: l.status || 'Open',
        });
      });

    // ② 금주에 등록되었으나 Closed되지 않은 이슈 → 자동 이월
    activityLogs
      .filter(l => {
        if (l.status === 'Closed') return false;
        // 금주 범위에 기록된 이슈
        const inThisWeek = (l.date || '') >= wkStart && (l.date || '') <= wkEnd;
        // 또는 due_date가 지났거나 이번주까지인데 미해결
        const overdueOrThisWeek = l.due_date && l.due_date <= wkEnd;
        return inThisWeek || overdueOrThisWeek;
      })
      .forEach(l => {
        if (actionsMap.has(l.id)) return; // 이미 있으면 스킵
        const acc = accounts.find(a => a.id === l.account_id);
        const team = getTeamForAccount(l.account_id);
        actionsMap.set(l.id, {
          teamShort: TEAM_SHORT[team] || team,
          company: acc?.company_name || '?',
          action: l.next_action || `[${l.issue_type}] ${l.content || '-'}`,
          dueDate: l.due_date || '-',
          rep: l.sales_rep || '-',
          isCarryover: true,
          status: l.status || 'Open',
          daysOpen: daysSince(l.date),
        });
      });

    const actions = Array.from(actionsMap.values())
      .sort((a, b) => {
        // 이월 먼저, 그 다음 due_date 순
        if (a.isCarryover !== b.isCarryover) return a.isCarryover ? -1 : 1;
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      });

    // 재구매 임박 고객 (D-14 이내) — 소스별 그룹핑
    const reorderAll = alarms.filter(a => a.type === 'reorder' && a.level === 'danger');
    const reorderBySource = {
      fcst: reorderAll.filter(a => a.source === 'fcst').slice(0, 5),
      plan: reorderAll.filter(a => a.source === 'plan').slice(0, 5),
      trend: reorderAll.filter(a => a.source === 'trend').slice(0, 5),
    };
    const reorderAlarms = reorderAll.slice(0, 10); // 레거시 호환

    const carryoverCount = actions.filter(a => a.isCarryover).length;

    return { actions, carryoverCount, nextWeekLabel: `${nStart} ~ ${nEnd}`, reorderAlarms, reorderBySource };
  }, [sectionAData, activityLogs, accounts, alarms, planLookup]);

  /* ══════════════════════════════════════════════════════
     MONTHLY REPORT DATA (스펙 기반, monthOffset 반응)
     ══════════════════════════════════════════════════════ */
  const monthlyReportData = useMemo(() => {
    // 선택된 월 계산
    const baseDate = new Date();
    baseDate.setDate(1);
    baseDate.setMonth(baseDate.getMonth() + monthOffset);
    const selYear = baseDate.getFullYear();
    const selMonth = baseDate.getMonth() + 1;
    const selMonthStr = `${selYear}-${String(selMonth).padStart(2, '0')}`;
    const selMonthKey = String(selMonth).padStart(2, '0');
    const prevYearMonthStr = `${selYear - 1}-${selMonthKey}`;

    // 전월 계산
    const prevDate = new Date(baseDate);
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // ── 섹션 B-1: 월별 추이 (수주 + 매출, 1~12월) ──
    // 매출 목표 Fallback: team_sales 없으면 customerPlans 수주목표 사용
    const teamSalesPlansTrend = businessPlans.filter(p => p.type === 'team_sales' && p.year === selYear);
    const useOrderTargetAsFallback = teamSalesPlansTrend.length === 0;
    const monthlyTrend = [];
    const salesMonthlyTrend = [];
    for (let m = 1; m <= 12; m++) {
      const mKey = String(m).padStart(2, '0');
      const thisYearMonth = `${selYear}-${mKey}`;
      const prevYearMonth = `${selYear - 1}-${mKey}`;

      const actual = orders
        .filter(o => (o.order_date || '').startsWith(thisYearMonth))
        .reduce((s, o) => s + (o.order_amount || 0), 0);

      const prevYearActual = orders
        .filter(o => (o.order_date || '').startsWith(prevYearMonth))
        .reduce((s, o) => s + (o.order_amount || 0), 0);

      const target = customerPlans.reduce((s, p) => s + (p.targets?.[mKey] || 0), 0);

      // 매출 (B/L Date 기준)
      const salesActual = (sales || [])
        .filter(s => (s.sale_date || '').startsWith(thisYearMonth))
        .reduce((sum, s) => sum + (s.sale_amount || 0), 0);
      const salesPrevYearActual = (sales || [])
        .filter(s => (s.sale_date || '').startsWith(prevYearMonth))
        .reduce((sum, s) => sum + (s.sale_amount || 0), 0);
      // 매출 목표: team_sales 있으면 우선, 없으면 수주목표 fallback
      const salesTarget = useOrderTargetAsFallback
        ? target
        : teamSalesPlansTrend.reduce((s, p) => s + (p.targets?.[mKey] || 0), 0);

      salesMonthlyTrend.push({
        month: m,
        prevYearActual: salesPrevYearActual,
        target: salesTarget,
        actual: salesActual,
        yoyPct: salesPrevYearActual > 0 ? Math.round((salesActual / salesPrevYearActual) * 100) : 0,
        targetPct: salesTarget > 0 ? Math.round((salesActual / salesTarget) * 100) : 0,
      });

      monthlyTrend.push({
        month: m,
        prevYearActual,
        target,
        actual,
        yoyPct: prevYearActual > 0 ? Math.round((actual / prevYearActual) * 100) : 0,
        targetPct: target > 0 ? Math.round((actual / target) * 100) : 0,
      });
    }
    const trendTotal = monthlyTrend.reduce((acc, t) => ({
      prevYearActual: acc.prevYearActual + t.prevYearActual,
      target: acc.target + t.target,
      actual: acc.actual + t.actual,
    }), { prevYearActual: 0, target: 0, actual: 0 });

    const salesTrendTotal = salesMonthlyTrend.reduce((acc, t) => ({
      prevYearActual: acc.prevYearActual + t.prevYearActual,
      target: acc.target + t.target,
      actual: acc.actual + t.actual,
    }), { prevYearActual: 0, target: 0, actual: 0 });
    const hasSalesData = (sales || []).length > 0;

    // ── 섹션 B-2: 팀별 실적 ──
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(selMonthStr));
    const prevYearMonthOrders = orders.filter(o => (o.order_date || '').startsWith(prevYearMonthStr));

    const getTeamForOrderLocal = (o) => {
      const plan = findPlanForOrder(o);
      return plan?.team || '기타';
    };

    const teamMonthly = {};
    TEAM_ORDER.forEach(t => { teamMonthly[t] = { target: 0, actual: 0, prevYearActual: 0 }; });
    teamMonthly['기타'] = { target: 0, actual: 0, prevYearActual: 0 };

    customerPlans.forEach(p => {
      const team = p.team || '기타';
      if (!teamMonthly[team]) teamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      teamMonthly[team].target += (p.targets?.[selMonthKey] || 0);
    });
    monthOrders.forEach(o => {
      const team = getTeamForOrderLocal(o);
      if (!teamMonthly[team]) teamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      teamMonthly[team].actual += (o.order_amount || 0);
    });
    prevYearMonthOrders.forEach(o => {
      const team = getTeamForOrderLocal(o);
      if (!teamMonthly[team]) teamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      teamMonthly[team].prevYearActual += (o.order_amount || 0);
    });

    const teamRows = TEAM_ORDER.map(t => ({
      team: t, display: TEAM_DISPLAY[t] || t, ...teamMonthly[t],
      achieveRate: teamMonthly[t].target > 0 ? Math.round((teamMonthly[t].actual / teamMonthly[t].target) * 100) : 0,
      yoyRate: teamMonthly[t].prevYearActual > 0 ? Math.round((teamMonthly[t].actual / teamMonthly[t].prevYearActual) * 100) : 0,
    }));
    const teamTotal = teamRows.reduce((acc, r) => ({
      target: acc.target + r.target, actual: acc.actual + r.actual, prevYearActual: acc.prevYearActual + r.prevYearActual,
    }), { target: 0, actual: 0, prevYearActual: 0 });

    // ── B-2 매출 팀별 ──
    const getTeamForSaleLocal = (s) => {
      const plan = planLookup.byAccountId[s.account_id] || planLookup.byName[(s.customer_name || '').toLowerCase().trim()];
      return plan?.team || '기타';
    };
    const monthSales = (sales || []).filter(s => (s.sale_date || '').startsWith(selMonthStr));
    const prevYearMonthSales = (sales || []).filter(s => (s.sale_date || '').startsWith(prevYearMonthStr));

    // 매출 사업부 매핑: 고객 plan.team(수주) → 매출팀(해외/BPU/국내)
    const getSalesTeamForSaleLocal = (s) => {
      const plan = planLookup.byAccountId[s.account_id] || planLookup.byName[(s.customer_name || '').toLowerCase().trim()];
      const orderTeam = plan?.team;
      return ORDER_TEAM_TO_SALES[orderTeam] || '기타';
    };

    const salesTeamMonthly = {};
    SALES_TEAM_ORDER.forEach(t => { salesTeamMonthly[t] = { target: 0, actual: 0, prevYearActual: 0 }; });
    // 매출 목표: team_sales 있으면 사용, 없으면 customerPlans(수주목표) fallback
    const teamSalesPlansM = businessPlans.filter(p => p.type === 'team_sales' && p.year === selYear);
    const salesTargetSourceM = teamSalesPlansM.length > 0 ? 'team_sales' : 'fallback_order_target';
    if (teamSalesPlansM.length > 0) {
      teamSalesPlansM.forEach(p => {
        const team = p.team;
        if (!salesTeamMonthly[team]) salesTeamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
        salesTeamMonthly[team].target += (p.targets?.[selMonthKey] || 0);
      });
    } else {
      // Fallback: 수주목표를 팀별로 집계
      customerPlans.forEach(p => {
        const orderTeam = p.team;
        const salesTeam = ORDER_TEAM_TO_SALES[orderTeam];
        if (!salesTeam) return;
        if (!salesTeamMonthly[salesTeam]) salesTeamMonthly[salesTeam] = { target: 0, actual: 0, prevYearActual: 0 };
        salesTeamMonthly[salesTeam].target += (p.targets?.[selMonthKey] || 0);
      });
    }
    monthSales.forEach(s => {
      const team = getSalesTeamForSaleLocal(s);
      if (!salesTeamMonthly[team]) salesTeamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      salesTeamMonthly[team].actual += (s.sale_amount || 0);
    });
    prevYearMonthSales.forEach(s => {
      const team = getSalesTeamForSaleLocal(s);
      if (!salesTeamMonthly[team]) salesTeamMonthly[team] = { target: 0, actual: 0, prevYearActual: 0 };
      salesTeamMonthly[team].prevYearActual += (s.sale_amount || 0);
    });
    const salesTeamRows = SALES_TEAM_ORDER.map(t => ({
      team: t, display: SALES_TEAM_DISPLAY[t] || t, ...salesTeamMonthly[t],
      achieveRate: salesTeamMonthly[t].target > 0 ? Math.round((salesTeamMonthly[t].actual / salesTeamMonthly[t].target) * 100) : 0,
      yoyRate: salesTeamMonthly[t].prevYearActual > 0 ? Math.round((salesTeamMonthly[t].actual / salesTeamMonthly[t].prevYearActual) * 100) : 0,
    }));
    const salesTeamTotal = salesTeamRows.reduce((acc, r) => ({
      target: acc.target + r.target, actual: acc.actual + r.actual, prevYearActual: acc.prevYearActual + r.prevYearActual,
    }), { target: 0, actual: 0, prevYearActual: 0 });

    // ── 섹션 C: 팀별 월간 활동 분석 ──
    const monthStart = `${selMonthStr}-01`;
    const monthEnd = `${selMonthStr}-31`;
    const monthLogs = activityLogs.filter(l => (l.date || '') >= monthStart && (l.date || '') <= monthEnd);

    const getTeamForAccountLocal = (accountId) => {
      const plan = planLookup.byAccountId[accountId];
      if (plan?.team) return plan.team;
      const acc = accounts.find(a => a.id === accountId);
      if (acc) {
        const namePlan = planLookup.byName[(acc.company_name || '').toLowerCase().trim()];
        if (namePlan?.team) return namePlan.team;
        if (acc.region === '한국') return '국내영업';
      }
      return '해외영업';
    };

    const teamActivity = {};
    TEAM_ORDER.forEach(t => {
      teamActivity[t] = {
        display: TEAM_DISPLAY[t] || t,
        total: 0, newContract: 0, crossSelling: 0, openIssues: 0,
        contactedAccounts: new Set(),
        majorIssues: [],
      };
    });
    monthLogs.forEach(l => {
      const team = getTeamForAccountLocal(l.account_id);
      if (!teamActivity[team]) return;
      teamActivity[team].total++;
      if (l.issue_type === '계약갱신') teamActivity[team].newContract++;
      if (l.issue_type === '크로스셀링') teamActivity[team].crossSelling++;
      if (l.status !== 'Closed') {
        teamActivity[team].openIssues++;
        // 영업이슈/고객지원/품질이슈에 해당하면 주요이슈로
        if (['수주활동', '가격협의', '품질클레임', '샘플요청', '규제·인증'].includes(l.issue_type)) {
          const acc = accounts.find(a => a.id === l.account_id);
          teamActivity[team].majorIssues.push({
            company: acc?.company_name || '?',
            type: l.issue_type,
            content: l.content || '',
          });
        }
      }
      teamActivity[team].contactedAccounts.add(l.account_id);
    });
    // Set을 count로 변환
    Object.values(teamActivity).forEach(t => {
      t.contactedCount = t.contactedAccounts.size;
      delete t.contactedAccounts;
      t.majorIssues = t.majorIssues.slice(0, 5);
    });

    // ── 섹션 D: 주요 거래처별 실적 (상위 10사) ──
    const accountMonthMap = {};
    monthOrders.forEach(o => {
      const key = o.account_id || o.customer_name;
      if (!accountMonthMap[key]) accountMonthMap[key] = { name: o.customer_name, thisMonth: 0, lastMonth: 0 };
      accountMonthMap[key].thisMonth += (o.order_amount || 0);
    });
    orders.filter(o => (o.order_date || '').startsWith(prevMonthStr)).forEach(o => {
      const key = o.account_id || o.customer_name;
      if (!accountMonthMap[key]) accountMonthMap[key] = { name: o.customer_name, thisMonth: 0, lastMonth: 0 };
      accountMonthMap[key].lastMonth += (o.order_amount || 0);
    });
    const topAccounts = Object.values(accountMonthMap)
      .filter(a => a.thisMonth > 0)
      .sort((a, b) => b.thisMonth - a.thisMonth)
      .slice(0, 10)
      .map(a => ({
        ...a,
        changeRate: a.lastMonth > 0 ? Math.round(((a.thisMonth - a.lastMonth) / a.lastMonth) * 100) : null,
      }));

    // ── 고객별 당월 실적 (목표 설정된 모든 고객, 실적 0 포함, 달성률 오름차순) ──
    const planByCustomerM = {};
    customerPlans.forEach(p => {
      if (!p.customer_name) return;
      // 버킷 플랜 제외 (실제 고객만)
      const bucketNames = ['해외기타', '직판영업', '국내 신규', '국내 기타'];
      if (bucketNames.includes(p.customer_name.trim())) return;
      const key = p.customer_name.toLowerCase().trim();
      if (!planByCustomerM[key]) planByCustomerM[key] = {
        key, name: p.customer_name, rep: p.sales_rep || '미배정',
        accountId: p.account_id || null,
        monthTarget: 0, ytdTarget: 0,
      };
      planByCustomerM[key].monthTarget += (p.targets?.[selMonthKey] || 0);
      for (let m = 1; m <= selMonth; m++) {
        planByCustomerM[key].ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
      }
    });
    // 실제 주문 조인
    const ytdOrdersForMonth = orders.filter(o => {
      const d = o.order_date || '';
      if (!d.startsWith(String(selYear))) return false;
      const m = parseInt(d.slice(5, 7), 10);
      return m >= 1 && m <= selMonth;
    });
    Object.values(planByCustomerM).forEach(p => {
      p.monthActual = monthOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === p.key)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      p.ytdActual = ytdOrdersForMonth
        .filter(o => (o.customer_name || '').toLowerCase().trim() === p.key)
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      p.monthPct = p.monthTarget > 0 ? Math.round((p.monthActual / p.monthTarget) * 100) : 0;
      p.ytdPct = p.ytdTarget > 0 ? Math.round((p.ytdActual / p.ytdTarget) * 100) : 0;
      p.monthGap = p.monthTarget - p.monthActual;
      p.ytdGap = p.ytdTarget - p.ytdActual;
    });
    // 목표 > 0 인 모든 고객 포함 (실적 0 포함), 달성률 낮은 순 (미달 우선 노출)
    const monthlyByCustomer = Object.values(planByCustomerM)
      .filter(p => p.monthTarget > 0)
      .sort((a, b) => b.monthPct - a.monthPct); // 달성률 높은 순 (사용자 요청 v3.1)

    // ══════════════════════════════════════════════════════
    // 담당자별 월간 실적 (신 분류 체계) — 사업계획 담당자 + 국내기타/해외기타/국내신규/해외신규
    // ══════════════════════════════════════════════════════
    const planByNameForRep = {};
    customerPlans.forEach(p => {
      if (!p.customer_name) return;
      const bucketNames = ['해외기타', '직판영업', '국내 신규', '국내 기타'];
      if (bucketNames.includes(p.customer_name.trim())) return;
      planByNameForRep[p.customer_name.toLowerCase().trim()] = p;
    });
    const classifyTxRep = (tx) => {
      const acc = tx.account_id ? accounts.find(a => a.id === tx.account_id)
        : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (tx.customer_name || '').toLowerCase().trim()) || null;
      return classifyForRepView({
        account: acc,
        customerName: tx.customer_name || acc?.company_name,
        planByName: planByNameForRep,
        priorSet: priorYearSet,
      });
    };

    const repMapMR = {};
    const initRepKeysMR = new Set();
    customerPlans.forEach(p => {
      if (p.sales_rep && !['해외기타', '직판영업', '국내 신규', '국내 기타'].includes((p.customer_name || '').trim())) {
        initRepKeysMR.add(p.sales_rep);
      }
    });
    (teamMembers || []).forEach(r => initRepKeysMR.add(r));
    ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => initRepKeysMR.add(k));
    initRepKeysMR.forEach(k => {
      repMapMR[k] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
    });

    customerPlans.forEach(p => {
      const name = (p.customer_name || '').trim();
      if (['해외기타', '국내 기타', '국내 신규', '직판영업'].includes(name)) {
        let key = null;
        if (name === '해외기타') key = '해외기타';
        else if (name === '국내 기타') key = '국내기타';
        else if (name === '국내 신규') key = '국내신규';
        if (key && repMapMR[key]) {
          repMapMR[key].monthTarget += (p.targets?.[selMonthKey] || 0);
          repMapMR[key].annualTarget += (p.annual_target || 0);
        }
        return;
      }
      const rep = p.sales_rep || '미배정';
      if (!repMapMR[rep]) repMapMR[rep] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
      repMapMR[rep].monthTarget += (p.targets?.[selMonthKey] || 0);
      repMapMR[rep].annualTarget += (p.annual_target || 0);
    });

    monthOrders.forEach(o => {
      const { rep } = classifyTxRep(o);
      if (!rep) return;
      if (!repMapMR[rep]) repMapMR[rep] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
      repMapMR[rep].monthActual += (o.order_amount || 0);
    });
    const ytdMonthOrdersMR = orders.filter(o => {
      const d = o.order_date || '';
      if (!d.startsWith(String(selYear))) return false;
      const m = parseInt(d.slice(5, 7), 10);
      return m >= 1 && m <= selMonth;
    });
    ytdMonthOrdersMR.forEach(o => {
      const { rep } = classifyTxRep(o);
      if (!rep) return;
      if (!repMapMR[rep]) repMapMR[rep] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
      repMapMR[rep].ytdActual += (o.order_amount || 0);
    });

    const repMonthRows = Object.entries(repMapMR)
      .filter(([, v]) => v.monthTarget > 0 || v.monthActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => {
        const pa = a[1].monthTarget > 0 ? a[1].monthActual / a[1].monthTarget : -1;
        const pb = b[1].monthTarget > 0 ? b[1].monthActual / b[1].monthTarget : -1;
        if (pa !== pb) return pb - pa;
        return b[1].monthActual - a[1].monthActual;
      })
      .map(([label, v]) => ({
        label, ...v,
        isBucket: ['국내기타', '해외기타', '국내신규', '해외신규'].includes(label),
        isNew: label.endsWith('신규'),
      }));

    const newCustomerDetails = { 국내신규: [], 해외신규: [] };
    const etcCustomerDetails = { 국내기타: [], 해외기타: [] };
    ytdMonthOrdersMR.forEach(o => {
      const { rep, bucket } = classifyTxRep(o);
      if (bucket !== 'new' && bucket !== 'etc') return;
      const target = bucket === 'new' ? newCustomerDetails : etcCustomerDetails;
      if (!target[rep]) target[rep] = [];
      const existing = target[rep].find(x => x.name === o.customer_name);
      if (existing) { existing.amount += (o.order_amount || 0); existing.orderCount++; }
      else target[rep].push({ name: o.customer_name, amount: o.order_amount || 0, orderCount: 1, accountId: o.account_id || null });
    });
    Object.keys(newCustomerDetails).forEach(k => newCustomerDetails[k].sort((a, b) => b.amount - a.amount));
    Object.keys(etcCustomerDetails).forEach(k => etcCustomerDetails[k].sort((a, b) => b.amount - a.amount));

    // ══════════════════════════════════════════════════════
    // GAP 심층 분석 — 미달/초과 고객 상위 N사 + 고객카드 전체 맥락 통합
    // ══════════════════════════════════════════════════════
    const gapDeepAnalysis = (() => {
      // YTD 기준 목표 있는 고객만
      const candidates = Object.values(planByCustomerM).filter(p => p.ytdTarget > 0);
      if (candidates.length === 0) return { shortfall: [], surplus: [] };

      const buildContext = (p) => {
        const account = accounts.find(a => a.id === p.accountId) ||
          accounts.find(a => (a.company_name || '').toLowerCase().trim() === p.key);

        // FCST Catch-up: 고객의 향후 FCST 합계
        const acctForecasts = (forecasts || []).filter(f =>
          (f.account_id === account?.id || (f.customer_name || '').toLowerCase().trim() === p.key)
          && f.year === selYear
        );
        let fcstFutureTotal = 0;
        let fcstLastMonth = null;
        acctForecasts.forEach(f => {
          if (!f.order_month) return;
          const mNum = f.order_month.length === 7
            ? parseInt(f.order_month.slice(5, 7), 10)
            : parseInt(f.order_month, 10);
          if (mNum > selMonth && mNum <= 12) {
            fcstFutureTotal += (f.amount || 0);
            if (!fcstLastMonth || mNum > fcstLastMonth) fcstLastMonth = mNum;
          }
        });
        // Gap catch-up 여부 판단
        let catchUpComment = null;
        if (p.ytdGap > 0 && fcstFutureTotal > 0) {
          const projected = p.ytdActual + fcstFutureTotal;
          const annualGoal = account ? customerPlans
            .filter(cp => cp.account_id === account.id || (cp.customer_name || '').toLowerCase().trim() === p.key)
            .reduce((s, cp) => s + (cp.annual_target || 0), 0) : 0;
          if (fcstFutureTotal >= p.ytdGap) {
            catchUpComment = {
              type: 'full', month: fcstLastMonth,
              text: `${fcstLastMonth}월 FCST 반영 시 YTD Gap ${fmtKRW(p.ytdGap)} 전액 회복 예상`,
            };
          } else if (annualGoal > 0) {
            const projectedRate = Math.round((projected / annualGoal) * 100);
            catchUpComment = {
              type: 'partial', projectedRate,
              text: `FCST 반영 시 연간 달성률 ${projectedRate}% 예상 (Gap 일부 회복)`,
            };
          }
        }

        // Activity Log 최근 3개월 GAP 관련 이슈
        const threeMonthsAgo = new Date(selYear, selMonth - 3, 1).toISOString().slice(0, 10);
        const gapIssueTypes = ['수주활동', '가격협의', '입찰', '품질클레임', '샘플요청', '계약갱신'];
        const recentIssues = (activityLogs || [])
          .filter(l => l.account_id === account?.id && (l.date || '') >= threeMonthsAgo && gapIssueTypes.includes(l.issue_type))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .slice(0, 5);

        // 계약 만료 임박
        const expiringContracts = (contracts || [])
          .filter(c => c.account_id === account?.id && c.contract_expiry)
          .map(c => {
            const daysLeft = Math.ceil((new Date(c.contract_expiry) - new Date()) / 86400000);
            return { ...c, daysLeft };
          })
          .filter(c => c.daysLeft > 0 && c.daysLeft <= 90);

        // 수주 트렌드 (전년 동기 대비)
        const prevYearYtd = (orders || []).filter(o => {
          const d = o.order_date || '';
          if (!d.startsWith(String(selYear - 1))) return false;
          const m = parseInt(d.slice(5, 7), 10);
          if (m < 1 || m > selMonth) return false;
          return o.account_id === account?.id || (o.customer_name || '').toLowerCase().trim() === p.key;
        }).reduce((s, o) => s + (o.order_amount || 0), 0);
        const yoyGrowth = prevYearYtd > 0
          ? Math.round(((p.ytdActual - prevYearYtd) / prevYearYtd) * 100)
          : null;

        // Cross-selling 진행 기회
        const csOpportunities = (account?.cross_selling || []).filter(cs => cs.status !== '중단' && cs.status !== '수주완료');

        const gap = account?.gap_analysis || {};

        return {
          ...p,
          account,
          gap,
          catchUpComment,
          recentIssues,
          expiringContracts,
          prevYearYtd,
          yoyGrowth,
          csOpportunities,
          fcstFutureTotal,
        };
      };

      // 미달 (ytdPct < 90%), 상위 10사 (Gap 금액 큰 순)
      const shortfall = candidates
        .filter(p => p.ytdPct < 90 && p.ytdGap > 0)
        .sort((a, b) => b.ytdGap - a.ytdGap)
        .slice(0, 10)
        .map(buildContext);

      // 초과 (ytdPct > 110%), 상위 5사 (Gap 음수 크기 순 = 초과 금액 큰 순)
      const surplus = candidates
        .filter(p => p.ytdPct > 110 && p.ytdGap < 0)
        .sort((a, b) => a.ytdGap - b.ytdGap) // 더 초과한 것부터
        .slice(0, 5)
        .map(buildContext);

      return { shortfall, surplus };
    })();

    // ── 섹션 E: 재구매/계약 만료 임박 ──
    const now = new Date();
    const nextMonthDate = new Date(selYear, selMonth, 0); // 선택월 말일
    nextMonthDate.setDate(nextMonthDate.getDate() + 30);
    const reorderSoon = alarms
      .filter(a => a.type === 'reorder')
      .slice(0, 10);
    const contractExpiringSoon = [];
    contracts.forEach(c => {
      if (!c.contract_expiry) return;
      const daysLeft = Math.ceil((new Date(c.contract_expiry) - now) / 86400000);
      if (daysLeft <= 60 && daysLeft > 0) {
        const acc = accounts.find(a => a.id === c.account_id);
        contractExpiringSoon.push({
          company: acc?.company_name || '?',
          product: c.product_category,
          expiry: c.contract_expiry,
          daysLeft,
        });
      }
    });
    contractExpiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);

    // ── KPI 계산: 당월 + YTD ──
    // YTD = 1월~선택월까지 누적
    const ytdOrderActual = monthlyTrend
      .filter(t => t.month <= selMonth)
      .reduce((s, t) => s + t.actual, 0);
    const ytdOrderTarget = monthlyTrend
      .filter(t => t.month <= selMonth)
      .reduce((s, t) => s + t.target, 0);
    const ytdOrderPrevYear = monthlyTrend
      .filter(t => t.month <= selMonth)
      .reduce((s, t) => s + t.prevYearActual, 0);

    const ytdSalesActual = salesMonthlyTrend
      .filter(t => t.month <= selMonth)
      .reduce((s, t) => s + t.actual, 0);
    const ytdSalesTarget = salesMonthlyTrend
      .filter(t => t.month <= selMonth)
      .reduce((s, t) => s + t.target, 0);
    const ytdSalesPrevYear = salesMonthlyTrend
      .filter(t => t.month <= selMonth)
      .reduce((s, t) => s + t.prevYearActual, 0);

    const monthOrderActual = monthlyTrend.find(t => t.month === selMonth)?.actual || 0;
    const monthOrderTarget = monthlyTrend.find(t => t.month === selMonth)?.target || 0;
    const monthOrderPrevYear = monthlyTrend.find(t => t.month === selMonth)?.prevYearActual || 0;

    const monthSalesActual = salesMonthlyTrend.find(t => t.month === selMonth)?.actual || 0;
    const monthSalesTarget = salesMonthlyTrend.find(t => t.month === selMonth)?.target || 0;
    const monthSalesPrevYear = salesMonthlyTrend.find(t => t.month === selMonth)?.prevYearActual || 0;

    const kpi = {
      order: {
        mtdActual: monthOrderActual, mtdTarget: monthOrderTarget, mtdPrevYear: monthOrderPrevYear,
        mtdPct: monthOrderTarget > 0 ? Math.round((monthOrderActual / monthOrderTarget) * 100) : 0,
        mtdYoyPct: monthOrderPrevYear > 0 ? Math.round((monthOrderActual / monthOrderPrevYear) * 100) : 0,
        ytdActual: ytdOrderActual, ytdTarget: ytdOrderTarget, ytdPrevYear: ytdOrderPrevYear,
        ytdPct: ytdOrderTarget > 0 ? Math.round((ytdOrderActual / ytdOrderTarget) * 100) : 0,
        ytdYoyPct: ytdOrderPrevYear > 0 ? Math.round((ytdOrderActual / ytdOrderPrevYear) * 100) : 0,
      },
      sales: {
        mtdActual: monthSalesActual, mtdTarget: monthSalesTarget, mtdPrevYear: monthSalesPrevYear,
        mtdPct: monthSalesTarget > 0 ? Math.round((monthSalesActual / monthSalesTarget) * 100) : 0,
        mtdYoyPct: monthSalesPrevYear > 0 ? Math.round((monthSalesActual / monthSalesPrevYear) * 100) : 0,
        ytdActual: ytdSalesActual, ytdTarget: ytdSalesTarget, ytdPrevYear: ytdSalesPrevYear,
        ytdPct: ytdSalesTarget > 0 ? Math.round((ytdSalesActual / ytdSalesTarget) * 100) : 0,
        ytdYoyPct: ytdSalesPrevYear > 0 ? Math.round((ytdSalesActual / ytdSalesPrevYear) * 100) : 0,
      },
    };

    // ══════════════════════════════════════════════════════
    // Phase B v3.2 — 차월 수주 파이프라인 (신뢰도 가중)
    // 각 reorderSoon 항목에 수주 가능액 + 신뢰도 + 가중금액 + 우선순위 부여
    // ══════════════════════════════════════════════════════
    const monthlyPipeline = (() => {
      // 신뢰도: FCST 80% / 사업계획 60% / 트렌드 40%
      const CONFIDENCE = { fcst: 80, plan: 60, trend: 40 };

      const enriched = reorderSoon.map(a => {
        const acc = a.account || {};
        const src = a.source || 'other';
        let amount = 0;

        // 1. FCST 기반 — forecasts에서 해당 예상월의 amount 찾기
        if (src === 'fcst') {
          const match = a.msg.match(/예상월\((\d{4}-\d{2})\)/) || a.msg.match(/예상 D-/);
          const acctForecasts = (forecasts || []).filter(f => f.account_id === acc.id && f.year === selYear);
          // 가장 가까운 미래 FCST 중 해당 메시지 월 매칭
          const future = acctForecasts.filter(f => {
            if (!f.order_month) return false;
            const m = f.order_month.length === 7 ? parseInt(f.order_month.slice(5, 7), 10) : parseInt(f.order_month, 10);
            return m > selMonth;
          });
          if (future.length > 0) {
            amount = future.reduce((s, f) => s + (f.amount || 0), 0);
          }
        }

        // 2. 사업계획 기반 — 당월 + 1 타겟액
        if (src === 'plan') {
          const nextMonth = selMonth + 1;
          if (nextMonth <= 12) {
            const nextKey = String(nextMonth).padStart(2, '0');
            const planForAcc = customerPlans.filter(p => p.account_id === acc.id);
            amount = planForAcc.reduce((s, p) => s + (p.targets?.[nextKey] || 0), 0);
          }
        }

        // 3. 트렌드 기반 — 고객의 과거 주문 평균
        if (src === 'trend') {
          const acctOrders = orders.filter(o => o.account_id === acc.id && o.order_date);
          if (acctOrders.length > 0) {
            const sum = acctOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
            amount = Math.round(sum / acctOrders.length);
          }
        }

        const confidence = CONFIDENCE[src] || 30;
        const weighted = Math.round(amount * confidence / 100);
        return { ...a, source: src, amount, confidence, weighted };
      });

      // 우선순위: 가중금액 높은 순
      enriched.sort((a, b) => b.weighted - a.weighted);

      // P1 (상위 금액 50%), P2, P3
      const total = enriched.reduce((s, x) => s + x.weighted, 0);
      let cumulative = 0;
      enriched.forEach(item => {
        cumulative += item.weighted;
        if (total > 0 && cumulative <= total * 0.5) item.priority = 'P1';
        else if (total > 0 && cumulative <= total * 0.8) item.priority = 'P2';
        else item.priority = 'P3';
      });

      const totalExpected = enriched.reduce((s, x) => s + x.amount, 0);
      const totalWeighted = enriched.reduce((s, x) => s + x.weighted, 0);

      return { items: enriched, totalExpected, totalWeighted };
    })();

    // ══════════════════════════════════════════════════════
    // Phase B v3.2 — GAP 심층분석 요약 (#7)
    // ══════════════════════════════════════════════════════
    const gapSummary = (() => {
      const short = gapDeepAnalysis.shortfall;
      const surplus = gapDeepAnalysis.surplus;
      const totalShortGap = short.reduce((s, c) => s + (c.ytdGap || 0), 0);
      const totalSurplusGap = surplus.reduce((s, c) => s + (Math.abs(c.ytdGap) || 0), 0);
      // 원인 빈도 집계 (미달 고객)
      const causeFreq = {};
      short.forEach(c => {
        (c.gap?.causes || []).forEach(k => {
          causeFreq[k] = (causeFreq[k] || 0) + 1;
        });
      });
      const topCauses = Object.entries(causeFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, n]) => {
          const meta = GAP_CAUSES.find(g => g.key === k);
          return { key: k, count: n, label: meta?.label || k, icon: meta?.icon || '' };
        });
      // FCST catch-up 금액
      const catchUpTotal = short.reduce((s, c) => s + (c.fcstFutureTotal || 0), 0);
      return {
        shortCount: short.length,
        surplusCount: surplus.length,
        totalShortGap,
        totalSurplusGap,
        topCauses,
        catchUpTotal,
        netGap: totalShortGap - totalSurplusGap,
      };
    })();

    // ══════════════════════════════════════════════════════
    // Phase B v3.2 — 팀별 GAP 원인 통합 (#4)
    // ══════════════════════════════════════════════════════
    const teamGapCauses = {};
    TEAM_ORDER.forEach(team => {
      teamGapCauses[team] = { display: TEAM_DISPLAY[team], shortCount: 0, shortGap: 0, causes: {} };
    });
    gapDeepAnalysis.shortfall.forEach(c => {
      const rep = c.rep || '';
      // rep → team 매핑: 사업계획에서 찾기
      const plan = customerPlans.find(p => p.sales_rep === rep);
      const team = plan?.team || (rep && accounts.find(a => a.id === c.accountId)?.team) || '';
      const teamKey = TEAM_ORDER.includes(team) ? team
                    : (rep === '국내영업' ? '국내영업' : null);
      // fallback: region 기반 추정
      let finalTeam = teamKey;
      if (!finalTeam) {
        const acc = c.account;
        const region = acc?.region || '';
        if (region.includes('해외') || region === 'Asia' || region === 'Europe' || region === 'N.America' || region === 'Latin America' || region === 'Middle East' || region === 'Africa' || region === 'CIS') {
          finalTeam = '해외영업';
        } else if (region.includes('국내') || region === 'Korea') {
          finalTeam = '국내영업';
        }
      }
      if (!finalTeam || !teamGapCauses[finalTeam]) return;
      teamGapCauses[finalTeam].shortCount++;
      teamGapCauses[finalTeam].shortGap += (c.ytdGap || 0);
      (c.gap?.causes || []).forEach(k => {
        teamGapCauses[finalTeam].causes[k] = (teamGapCauses[finalTeam].causes[k] || 0) + 1;
      });
    });
    // top 2 원인 정렬
    Object.keys(teamGapCauses).forEach(team => {
      const tc = teamGapCauses[team];
      tc.topCauses = Object.entries(tc.causes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k, n]) => {
          const meta = GAP_CAUSES.find(g => g.key === k);
          return { key: k, count: n, label: meta?.label || k, icon: meta?.icon || '' };
        });
    });

    // ══════════════════════════════════════════════════════
    // Phase B v3.2 — Executive Summary 자동 생성 (#1)
    // ══════════════════════════════════════════════════════
    const autoExecSummary = (() => {
      const lines = [];

      // Line 1: 당월 성과 (수주 + 매출)
      const orderStatus = kpi.order.mtdPct >= 100 ? '🟢 달성' : kpi.order.mtdPct >= 80 ? '🟡 근접' : '🔴 미달';
      const salesStatus = kpi.sales.mtdPct >= 100 ? '🟢 달성' : kpi.sales.mtdPct >= 80 ? '🟡 근접' : '🔴 미달';
      lines.push(`당월 수주 ${kpi.order.mtdPct}%(${orderStatus}) · 매출 ${kpi.sales.mtdPct}%(${salesStatus}) · YTD 수주 ${kpi.order.ytdPct}% / 매출 ${kpi.sales.ytdPct}%`);

      // Line 2: 전년대비
      if (kpi.order.mtdPrevYear > 0 || kpi.sales.mtdPrevYear > 0) {
        const orderYoy = kpi.order.mtdPrevYear > 0 ? Math.round(((kpi.order.mtdActual - kpi.order.mtdPrevYear) / kpi.order.mtdPrevYear) * 100) : null;
        const salesYoy = kpi.sales.mtdPrevYear > 0 ? Math.round(((kpi.sales.mtdActual - kpi.sales.mtdPrevYear) / kpi.sales.mtdPrevYear) * 100) : null;
        lines.push(`전년 동월대비 수주 ${orderYoy !== null ? (orderYoy >= 0 ? '+' : '') + orderYoy + '%' : '-'} · 매출 ${salesYoy !== null ? (salesYoy >= 0 ? '+' : '') + salesYoy + '%' : '-'}`);
      }

      // Line 3: 주요 리스크
      const riskParts = [];
      if (gapSummary.shortCount > 0) {
        riskParts.push(`미달 ${gapSummary.shortCount}사(Gap ${fmtKRW(gapSummary.totalShortGap)})`);
      }
      if (contractExpiringSoon.length > 0) {
        riskParts.push(`계약만료 D-60 ${contractExpiringSoon.length}건`);
      }
      const overdueCnt = (activityLogs || []).filter(l => l.status !== 'Closed' && daysSince(l.date) > 14).length;
      if (overdueCnt > 0) {
        riskParts.push(`14일+ 미해결 ${overdueCnt}건`);
      }
      if (riskParts.length > 0) {
        lines.push(`주요 리스크: ${riskParts.join(' · ')}`);
      }

      // Line 4: 다음 달 기회
      const oppParts = [];
      if (monthlyPipeline.totalWeighted > 0) {
        oppParts.push(`차월 파이프라인 가중 ${fmtKRW(monthlyPipeline.totalWeighted)}(${monthlyPipeline.items.length}건)`);
      }
      if (gapSummary.catchUpTotal > 0) {
        oppParts.push(`FCST catch-up 잠재 ${fmtKRW(gapSummary.catchUpTotal)}`);
      }
      if (oppParts.length > 0) {
        lines.push(`기회: ${oppParts.join(' · ')}`);
      }

      // 자동 종합 판단
      let autoStatus = '🟡 주의';
      if (kpi.order.mtdPct >= 100 && kpi.sales.mtdPct >= 100) autoStatus = '🟢 순조';
      else if (kpi.order.mtdPct < 80 || kpi.sales.mtdPct < 80 || gapSummary.shortCount >= 5) autoStatus = '🔴 위기';

      return { lines, autoStatus };
    })();

    // ══════════════════════════════════════════════════════
    // Phase C v3.2 — Pipeline CRM 신규 딜 하이라이트 (#15)
    // Pipeline CRM의 `customers` collection에서 Closing/Proposal/Evaluation 단계 최근 활성 딜
    // ══════════════════════════════════════════════════════
    const pipelineHighlights = (() => {
      if (!pipelineCustomers || pipelineCustomers.length === 0) return [];
      // Pipeline CRM 6단계 중 후반 단계 (Evaluation, Closing, Retention) 필터
      const activeStages = ['Proposal', 'Evaluation', 'Closing'];
      const highlights = pipelineCustomers
        .filter(c => activeStages.includes(c.stage))
        .map(c => ({
          id: c.id,
          company: c.company_name || c.name || '?',
          stage: c.stage,
          amount: c.expected_amount || c.deal_amount || c.amount || 0,
          probability: c.probability || c.close_probability || 0,
          closeDate: c.close_date || c.expected_close_date || c.target_date || '',
          product: c.product || c.product_category || '',
          sales_rep: c.sales_rep || c.owner || '',
          updated: c.updated_at || c.updatedAt || '',
        }))
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
        .slice(0, 10);
      return highlights;
    })();

    return {
      selYear, selMonth, selMonthStr, selMonthKey,
      monthLabel: `${selYear}년 ${selMonth}월`,
      monthlyTrend, trendTotal,
      salesMonthlyTrend, salesTrendTotal, hasSalesData, salesTargetSource: salesTargetSourceM,
      teamRows, teamTotal,
      salesTeamRows, salesTeamTotal,
      teamActivity,
      topAccounts,
      monthlyByCustomer,
      repMonthRows,
      newCustomerDetails, etcCustomerDetails,
      gapDeepAnalysis,
      kpi,
      reorderSoon, contractExpiringSoon,
      // Phase B/C v3.2
      monthlyPipeline,
      gapSummary,
      teamGapCauses,
      autoExecSummary,
      pipelineHighlights,
      monthOrders, monthSales, // for Excel raw
    };
  }, [monthOffset, orders, sales, customerPlans, businessPlans, activityLogs, accounts, contracts, forecasts, alarms, planLookup, teamMembers, priorYearSet, pipelineCustomers]);

  /* ══════════════════════════════════════════════════════
     v3.4: Executive Summary / 다음 달 계획 — Firestore 이전
     - 이전: localStorage (해당 브라우저에서만 보임, 손실 위험)
     - 이후: app_settings 컬렉션 (여러 PC/브라우저 공유, 안전)
     ══════════════════════════════════════════════════════ */
  const execSummaryKey = `exec_summary_${monthlyReportData.selMonthStr}`;
  const nextMonthPlanKey = `next_month_plan_${monthlyReportData.selMonthStr}`;

  // Firestore (appSettings) 값으로부터 현재 월 상태 동기화
  useEffect(() => {
    const savedExec = appSettings?.[execSummaryKey];
    setExecSummary(savedExec && typeof savedExec === 'object'
      ? savedExec
      : { msg1: '', msg2: '', msg3: '', status: '🟢', nextMonthFocus: '' });
    const savedPlan = appSettings?.[nextMonthPlanKey];
    setNextMonthPlan(savedPlan && typeof savedPlan === 'object'
      ? savedPlan
      : { overseas: '', domestic: '', support: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyReportData.selMonthStr, appSettings[execSummaryKey], appSettings[nextMonthPlanKey]]);

  // 일회성 마이그레이션: 기존 localStorage 값이 있으면 Firestore로 이관 (여러 PC 공유 가능하게)
  useEffect(() => {
    if (!saveAppSetting) return;
    const localExecKey = `bioprotech_account_crm_exec_summary_${monthlyReportData.selMonthStr}`;
    const localPlanKey = `bioprotech_account_crm_next_month_plan_${monthlyReportData.selMonthStr}`;
    try {
      const savedExec = localStorage.getItem(localExecKey);
      if (savedExec && !appSettings?.[execSummaryKey]) {
        const parsed = JSON.parse(savedExec);
        if (parsed && typeof parsed === 'object') {
          saveAppSetting(execSummaryKey, parsed);
          localStorage.removeItem(localExecKey); // 이관 후 삭제
        }
      }
    } catch {}
    try {
      const savedPlan = localStorage.getItem(localPlanKey);
      if (savedPlan && !appSettings?.[nextMonthPlanKey]) {
        const parsed = JSON.parse(savedPlan);
        if (parsed && typeof parsed === 'object') {
          saveAppSetting(nextMonthPlanKey, parsed);
          localStorage.removeItem(localPlanKey);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyReportData.selMonthStr]);

  // 디바운싱 타이머 (타이핑 즉시 Firestore 쓰기 방지)
  const execSaveTimer = useRef(null);
  const planSaveTimer = useRef(null);

  const saveExecSummary = (updates) => {
    const next = { ...execSummary, ...updates };
    setExecSummary(next); // 즉시 UI 반영
    if (execSaveTimer.current) clearTimeout(execSaveTimer.current);
    execSaveTimer.current = setTimeout(() => {
      if (saveAppSetting) saveAppSetting(execSummaryKey, next);
    }, 500);
  };
  const saveNextMonthPlan = (updates) => {
    const next = { ...nextMonthPlan, ...updates };
    setNextMonthPlan(next);
    if (planSaveTimer.current) clearTimeout(planSaveTimer.current);
    planSaveTimer.current = setTimeout(() => {
      if (saveAppSetting) saveAppSetting(nextMonthPlanKey, next);
    }, 500);
  };

  /* ══════════════════════════════
     MONTHLY DATA
     ══════════════════════════════ */
  const monthlyData = useMemo(() => {
    const thisMonthStr = getMonthStr();
    const monthKey = String(CURRENT_MONTH).padStart(2, '0');
    const monthOrders = orders.filter(o => (o.order_date || '').startsWith(thisMonthStr));
    const monthTotal = monthOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

    // Category breakdowns for this month
    const breakdown = buildCategoryBreakdown(monthOrders, '당월');

    // Monthly breakdown rows with month target
    const buildMonthlyRows = (periodOrders, planSource, keyFn, targetKeyFn) => {
      const map = {};
      // targets from plans
      if (hasPlan) {
        planSource.forEach(p => {
          const key = keyFn(p);
          if (!map[key]) map[key] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
          map[key].annualTarget += (p.annual_target || 0);
          map[key].monthTarget += (p.targets?.[monthKey] || 0);
        });
      }
      periodOrders.forEach(o => {
        const key = targetKeyFn(o);
        if (!map[key]) map[key] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
        map[key].monthActual += (o.order_amount || 0);
      });
      yearOrders.forEach(o => {
        const key = targetKeyFn(o);
        if (!map[key]) map[key] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
        map[key].ytdActual += (o.order_amount || 0);
      });
      return Object.entries(map)
        .filter(([, v]) => v.monthTarget > 0 || v.monthActual > 0 || v.ytdActual > 0)
        .sort((a, b) => {
          // 달성률 높은 순 (목표 있는 것만 의미있음)
          const pa = a[1].monthTarget > 0 ? a[1].monthActual / a[1].monthTarget : -1;
          const pb = b[1].monthTarget > 0 ? b[1].monthActual / b[1].monthTarget : -1;
          if (pa !== pb) return pb - pa;
          return b[1].monthActual - a[1].monthActual;
        })
        .map(([label, v]) => ({ label, ...v }));
    };

    // Rep breakdown with month targets
    // ⚠️ 담당자 분류 절대 규칙 (재발 방지):
    //   - 주문/매출의 sales_rep을 그대로 쓰면 안 됨 (영업현황에 Lijian/Milena/이다은 등 비유효 rep 다수 존재)
    //   - 반드시 classifyForRepView() 사용 → 사업계획 매칭 失 시 국내기타/해외기타/국내신규/해외신규 버킷
    //   - 참고: src/lib/customerClassification.js, src/lib/salesReps.js
    const planByNameForMonthlyData = {};
    customerPlans.forEach(p => {
      if (!p.customer_name) return;
      if (['해외기타', '직판영업', '국내 신규', '국내 기타'].includes(p.customer_name.trim())) return;
      planByNameForMonthlyData[p.customer_name.toLowerCase().trim()] = p;
    });
    const classifyForRepMD = (tx) => {
      const acc = tx.account_id ? accounts.find(a => a.id === tx.account_id)
        : accounts.find(a => (a.company_name || '').toLowerCase().trim() === (tx.customer_name || '').toLowerCase().trim()) || null;
      return classifyForRepView({
        account: acc,
        customerName: tx.customer_name || acc?.company_name,
        planByName: planByNameForMonthlyData,
        priorSet: priorYearSet,
      });
    };

    const repMapMD = {};
    // 사업계획 담당자 + teamMembers 초기화
    customerPlans.forEach(p => {
      if (p.sales_rep && !['해외기타', '직판영업', '국내 신규', '국내 기타'].includes((p.customer_name || '').trim())) {
        if (!repMapMD[p.sales_rep]) repMapMD[p.sales_rep] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
      }
    });
    (teamMembers || []).forEach(r => {
      if (!repMapMD[r]) repMapMD[r] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
    });
    ['국내기타', '해외기타', '국내신규', '해외신규'].forEach(k => {
      if (!repMapMD[k]) repMapMD[k] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
    });
    // 목표 (사업계획 담당자 + 버킷 플랜)
    customerPlans.forEach(p => {
      const name = (p.customer_name || '').trim();
      if (['해외기타', '국내 기타', '국내 신규', '직판영업'].includes(name)) {
        let key = null;
        if (name === '해외기타') key = '해외기타';
        else if (name === '국내 기타') key = '국내기타';
        else if (name === '국내 신규') key = '국내신규';
        if (key && repMapMD[key]) {
          repMapMD[key].monthTarget += (p.targets?.[monthKey] || 0);
          repMapMD[key].annualTarget += (p.annual_target || 0);
        }
        return;
      }
      const rep = p.sales_rep || '미배정';
      if (!repMapMD[rep]) repMapMD[rep] = { monthTarget: 0, monthActual: 0, ytdActual: 0, annualTarget: 0 };
      repMapMD[rep].monthTarget += (p.targets?.[monthKey] || 0);
      repMapMD[rep].annualTarget += (p.annual_target || 0);
    });
    // 실적 (classifyForRepView로 버킷 자동 분류)
    monthOrders.forEach(o => {
      const { rep } = classifyForRepMD(o);
      if (!rep || !repMapMD[rep]) return;
      repMapMD[rep].monthActual += (o.order_amount || 0);
    });
    yearOrders.forEach(o => {
      const { rep } = classifyForRepMD(o);
      if (!rep || !repMapMD[rep]) return;
      repMapMD[rep].ytdActual += (o.order_amount || 0);
    });
    const repMonthRows = Object.entries(repMapMD)
      .filter(([, v]) => v.monthTarget > 0 || v.monthActual > 0 || v.ytdActual > 0 || v.annualTarget > 0)
      .sort((a, b) => {
        const pa = a[1].monthTarget > 0 ? a[1].monthActual / a[1].monthTarget : -1;
        const pb = b[1].monthTarget > 0 ? b[1].monthActual / b[1].monthTarget : -1;
        if (pa !== pb) return pb - pa;
        return b[1].monthActual - a[1].monthActual;
      })
      .map(([label, v]) => ({ label, ...v }));

    // Product breakdown with month targets
    const prodMonthRows = buildMonthlyRows(
      monthOrders, productPlans,
      p => p.product || '기타',
      o => {
        const cat = (o.product_category || '').toLowerCase();
        if (!cat) return '기타';
        for (const pp of productPlans) {
          const pLow = (pp.product || '').toLowerCase();
          if (cat.includes(pLow) || pLow.includes(cat)) return pp.product;
        }
        return o.product_category || '기타';
      }
    );

    // Region breakdown with month targets
    const regMonthRows = buildMonthlyRows(
      monthOrders, customerPlans,
      p => p.region || '기타',
      o => { const plan = findPlanForOrder(o); const acc = accounts.find(a => a.id === o.account_id); return plan?.region || o.region || acc?.region || '기타'; }
    );

    // BizType breakdown with month targets
    const bizMonthRows = buildMonthlyRows(
      monthOrders, customerPlans,
      p => p.biz_type || '기타',
      o => { const plan = findPlanForOrder(o); const acc = accounts.find(a => a.id === o.account_id); return plan?.biz_type || acc?.business_type || '기타'; }
    );

    // v3.1: typeMonthRows 제거 — bizMonthRows와 중복, 사용처 없음

    // Cross-selling aggregation from all accounts
    const csStats = { '미접촉': { count: 0, amount: 0 }, '제안중': { count: 0, amount: 0 }, '샘플진행': { count: 0, amount: 0 }, '수주완료': { count: 0, amount: 0 } };
    const csTopOpps = [];
    accounts.forEach(a => {
      const items = a.cross_selling || [];
      items.forEach(item => {
        if (item.status === '중단') return;
        const st = item.status || '미접촉';
        if (csStats[st]) {
          csStats[st].count++;
          csStats[st].amount += (Number(item.potential_amount) || 0);
        }
        if (st !== '수주완료' && (Number(item.potential_amount) || 0) > 0) {
          csTopOpps.push({
            company: a.company_name,
            product: item.target_product,
            status: item.status,
            amount: Number(item.potential_amount) || 0,
          });
        }
      });
    });
    csTopOpps.sort((a, b) => b.amount - a.amount);

    // FCST vs Actual for current month
    const fcstVsActual = [];
    forecasts.filter(f => f.year === CURRENT_YEAR).forEach(f => {
      // match forecasts that cover current month
      const curQ = Math.ceil(CURRENT_MONTH / 3);
      const fPeriod = f.period || '';
      const fQ = fPeriod === 'Q1' ? 1 : fPeriod === 'Q2' ? 2 : fPeriod === 'Q3' ? 3 : fPeriod === 'Q4' ? 4 : 0;
      if (fQ !== curQ) return;

      const periodOrders = orders.filter(o => {
        if (!o.order_date) return false;
        const y = parseInt(o.order_date.slice(0, 4));
        if (y !== f.year) return false;
        const m = parseInt(o.order_date.slice(5, 7));
        if (fPeriod === 'Q1') return m >= 1 && m <= 3;
        if (fPeriod === 'Q2') return m >= 4 && m <= 6;
        if (fPeriod === 'Q3') return m >= 7 && m <= 9;
        if (fPeriod === 'Q4') return m >= 10 && m <= 12;
        return false;
      });
      const actual = periodOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
      const account = accounts.find(a => a.id === f.account_id);
      fcstVsActual.push({
        company_name: account?.company_name || f.customer_name || '?',
        forecast: f.forecast_amount || 0,
        actual,
        diff: actual - (f.forecast_amount || 0),
        period: f.period,
        note: actual === 0 ? '실적 없음' : actual >= (f.forecast_amount || 0) ? '목표 초과' : '목표 미달',
      });
    });
    fcstVsActual.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    return {
      thisMonthStr,
      monthTotal,
      monthOrders,
      repMonthRows,
      prodMonthRows,
      regMonthRows,
      bizMonthRows,
      csStats,
      csTopOpps,
      fcstVsActual,
    };
  }, [accounts, orders, yearOrders, forecasts, customerPlans, productPlans, planLookup, hasPlan]);

  /* ── Deep GAP Analysis Data ── */
  const gapAnalysisData = useMemo(() => {
    if (!hasPlan) return null;
    const monthKey = String(CURRENT_MONTH).padStart(2, '0');
    const yearStr = String(CURRENT_YEAR);

    // 1. 고객별 Gap 계산 + gap_analysis 데이터 수집
    const customerGaps = [];
    const planByCustomer = {};
    customerPlans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (!planByCustomer[key]) planByCustomer[key] = { plans: [], name: p.customer_name, rep: p.sales_rep };
      planByCustomer[key].plans.push(p);
    });

    Object.entries(planByCustomer).forEach(([key, { plans, name, rep }]) => {
      let ytdTarget = 0;
      plans.forEach(p => {
        for (let m = 1; m <= CURRENT_MONTH; m++) {
          ytdTarget += (p.targets?.[String(m).padStart(2, '0')] || 0);
        }
      });
      const annualTarget = plans.reduce((s, p) => s + (p.annual_target || 0), 0);
      const ytdActual = yearOrders
        .filter(o => (o.customer_name || '').toLowerCase().trim() === key || plans.some(p => p.account_id && p.account_id === o.account_id))
        .reduce((s, o) => s + (o.order_amount || 0), 0);
      const ytdGap = ytdActual - ytdTarget;
      const account = accounts.find(a => (a.company_name || '').toLowerCase().trim() === key) ||
                       accounts.find(a => plans.some(p => p.account_id === a.id));

      customerGaps.push({
        name, rep, key,
        annualTarget, ytdTarget, ytdActual, ytdGap,
        achieveRate: ytdTarget > 0 ? Math.round((ytdActual / ytdTarget) * 100) : (ytdActual > 0 ? 999 : 0),
        account,
        gapAnalysis: account?.gap_analysis || {},
        score: account?.intelligence?.total_score || 0,
      });
    });

    // 2. Gap 원인별 집계
    const causeAgg = {};
    GAP_CAUSES.forEach(c => { causeAgg[c.key] = { ...c, count: 0, totalGap: 0, customers: [] }; });
    customerGaps.forEach(cg => {
      const causes = cg.gapAnalysis?.causes || [];
      causes.forEach(causeKey => {
        if (causeAgg[causeKey]) {
          causeAgg[causeKey].count++;
          causeAgg[causeKey].totalGap += Math.abs(Math.min(0, cg.ytdGap));
          causeAgg[causeKey].customers.push(cg.name);
        }
      });
    });
    const causeRanking = Object.values(causeAgg)
      .filter(c => c.count > 0)
      .sort((a, b) => b.totalGap - a.totalGap || b.count - a.count);

    // 3. Gap 상위 미달 고객 (top 10)
    const topGapCustomers = [...customerGaps]
      .filter(c => c.ytdGap < 0)
      .sort((a, b) => a.ytdGap - b.ytdGap)
      .slice(0, 10);

    // 4. Intelligence Score 미비 항목 자동 추출
    const getMissingIntelligence = (account) => {
      if (!account?.intelligence?.categories) return [];
      const missing = [];
      SCORE_CATEGORIES.forEach(cat => {
        const catData = account.intelligence.categories[cat.key];
        if (!catData?.items) {
          missing.push({ category: cat.label, items: cat.items.map(i => i.label) });
          return;
        }
        const missingItems = cat.items.filter(it => !catData.items[it.key]).map(it => it.label);
        if (missingItems.length > 0) {
          missing.push({ category: cat.label, items: missingItems, weight: cat.weight });
        }
      });
      return missing.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    };

    // 5. 기회 파이프라인 집계
    const allOpportunities = [];
    accounts.forEach(a => {
      const opps = a.gap_analysis?.opportunities || [];
      opps.forEach(opp => {
        allOpportunities.push({
          ...opp,
          company: a.company_name,
          rep: a.sales_rep,
        });
      });
    });
    const oppByType = {};
    OPPORTUNITY_TYPES.forEach(t => { oppByType[t.key] = { ...t, count: 0, totalAmount: 0, weightedAmount: 0 }; });
    allOpportunities.forEach(opp => {
      if (oppByType[opp.type]) {
        oppByType[opp.type].count++;
        oppByType[opp.type].totalAmount += (opp.amount || 0);
        oppByType[opp.type].weightedAmount += (opp.amount || 0) * (opp.probability || 0) / 100;
      }
    });
    const oppSummary = Object.values(oppByType).filter(o => o.count > 0);
    const totalOppWeighted = allOpportunities.reduce((s, o) => s + (o.amount || 0) * (o.probability || 0) / 100, 0);

    // 6. AM별 활동 품질 지표 — plan sales_rep 기준
    const amMetrics = {};
    const amReps = new Set();
    // teamMembers만 사용 (불필요한 담당자 제외)
    teamMembers.forEach(r => amReps.add(r));

    amReps.forEach(rep => {
      const repAccounts = accounts.filter(a => a.sales_rep === rep);
      const repPlans = customerPlans.filter(p => p.sales_rep === rep);
      if (repAccounts.length === 0 && repPlans.length === 0) return;

      const repLogs = activityLogs.filter(l => l.sales_rep === rep);
      const last90 = new Date(); last90.setDate(last90.getDate() - 90);
      const last90Str = last90.toISOString().slice(0, 10);
      const recentLogs = repLogs.filter(l => l.date >= last90Str);

      const avgScore = repAccounts.length > 0
        ? Math.round(repAccounts.reduce((s, a) => s + (a.intelligence?.total_score || 0), 0) / repAccounts.length)
        : 0;

      const actionPlans = repAccounts.map(a => a.gap_analysis?.action_plan || []).flat();
      const totalActions = actionPlans.filter(a => a.text?.trim()).length;
      const doneActions = actionPlans.filter(a => a.text?.trim() && a.done).length;

      const repGapCustomers = customerGaps.filter(c => c.rep === rep);
      const repYtdTarget = repGapCustomers.reduce((s, c) => s + c.ytdTarget, 0);
      const repYtdActual = repGapCustomers.reduce((s, c) => s + c.ytdActual, 0);

      amMetrics[rep] = {
        accountCount: Math.max(repAccounts.length, repPlans.length),
        contactCount90d: recentLogs.length,
        avgContactFreq: repAccounts.length > 0 ? (recentLogs.length / repAccounts.length).toFixed(1) : 0,
        avgScore,
        actionTotal: totalActions,
        actionDone: doneActions,
        actionRate: totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0,
        ytdTarget: repYtdTarget,
        ytdActual: repYtdActual,
        achieveRate: repYtdTarget > 0 ? Math.round((repYtdActual / repYtdTarget) * 100) : 0,
        gapCauses: (() => {
          const causes = {};
          repAccounts.forEach(a => {
            (a.gap_analysis?.causes || []).forEach(c => { causes[c] = (causes[c] || 0) + 1; });
          });
          return Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 3);
        })(),
      };
    });

    return {
      customerGaps,
      causeRanking,
      topGapCustomers,
      getMissingIntelligence,
      allOpportunities,
      oppSummary,
      totalOppWeighted,
      amMetrics,
    };
  }, [accounts, activityLogs, yearOrders, customerPlans, hasPlan]);

  /* ══════════════════════════════
     EXCEL DOWNLOAD
     ══════════════════════════════ */
  const handleExcelDownload = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      if (tab === 'weekly') {
        const wkLabel = sectionAData.weekLabel;
        const wkShort = `${sectionAData.monday.getMonth() + 1}월${Math.ceil(sectionAData.monday.getDate() / 7)}W`;

        const rows = [
          ['영업본부 주간회의 보고자료', '', '', '', '', ''],
          [`${wkLabel} (${sectionAData.wkStart} ~ ${sectionAData.wkEnd})`, '', '', '', '', `출력일: ${new Date().toISOString().slice(0, 10)}`],
          [],
          // ── 섹션 A: 수주 현황 ──
          ['■ 1. 수주 현황', '', '', '', '', '[단위: 백만원 / %]'],
          ['구분', '전주 누적', '금주 신규', '당월 누적', '당월 목표', '달성률'],
          ...sectionAData.displayTeams.map(team => {
            const d = sectionAData.teamData[team];
            const rate = d.monthTarget > 0 ? `${pct(d.monthCum, d.monthTarget)}%` : '-';
            return [TEAM_DISPLAY[team] || team, Math.round(d.prevCum / 1e6), Math.round(d.thisWeek / 1e6), Math.round(d.monthCum / 1e6), Math.round(d.monthTarget / 1e6), rate];
          }),
          ['합계', Math.round(sectionAData.total.prevCum / 1e6), Math.round(sectionAData.total.thisWeek / 1e6), Math.round(sectionAData.total.monthCum / 1e6), Math.round(sectionAData.total.monthTarget / 1e6), sectionAData.total.monthTarget > 0 ? `${pct(sectionAData.total.monthCum, sectionAData.total.monthTarget)}%` : '-'],
          [],
          // ── 팀별 통합 블록 ──
          ...TEAM_ORDER.flatMap(teamKey => {
            const blk = teamBlocksData.blocks[teamKey];
            if (!blk) return [];
            const act = blk.activity;
            const rows = [
              [],
              [`■ [${blk.display}]`],
              [`📊 금주 활동`, `총 ${act.contacts}건 | 수주활동 ${act.orderActivity} | 가격협의 ${act.priceNegotiation} | 샘플요청 ${act.sampleRequest} | 크로스셀링 ${act.crossSelling}`],
              [],
              ['🔴 주요 이슈 (금주 발생, 🟡주요·🔴긴급)'],
            ];
            if (blk.majorIssues.length === 0) {
              rows.push(['', '없음']);
            } else {
              rows.push(['우선순위', '고객명', '유형', '내용', '담당', '상태', '날짜']);
              blk.majorIssues.forEach(iss => {
                rows.push([iss.priority === 3 ? '🔴 긴급' : '🟡 주요', iss.company, iss.issueType, iss.content, iss.rep, iss.status, iss.date]);
              });
            }
            rows.push([]);
            rows.push(['⏳ Open 이슈 (누적)']);
            if (blk.openIssues.length === 0) {
              rows.push(['', '없음']);
            } else {
              rows.push(['우선순위', '고객명', '등급', '이슈 건수', '최장 경과일', '주요 이슈']);
              blk.openIssues.forEach(cu => {
                const issueSummary = cu.issues.slice(0, 3).map(i => `[${i.issueType}] ${i.content.slice(0, 30)}`).join(' / ');
                rows.push([cu.priority, cu.company, cu.strategicTier || '-', cu.issues.length, cu.maxDaysOpen + '일', issueSummary]);
              });
            }
            rows.push([]);
            rows.push([`📅 차주 계획 (${teamBlocksData.nextWeekLabel})`]);
            if (blk.nextActions.length === 0) {
              rows.push(['', '예정된 액션 없음']);
            } else {
              rows.push(['구분', '고객명', '액션 내용', '담당', '기한']);
              blk.nextActions.forEach(a => {
                rows.push([a.isCarryover ? '이월' : '신규', a.company, a.action, a.rep, a.dueDate]);
              });
            }
            rows.push([]);
            rows.push(['⚠ 리스크']);
            if (blk.risks.reorderSoon.length > 0) {
              rows.push([`🔔 재구매 임박 ${blk.risks.reorderSoon.length}사`, blk.risks.reorderSoon.map(r => r.company).join(', ')]);
            }
            if (blk.risks.contractExpiring.length > 0) {
              rows.push([`📅 계약 만료 D-60 ${blk.risks.contractExpiring.length}건`, blk.risks.contractExpiring.map(c => `${c.company}(D-${c.daysLeft})`).join(', ')]);
            }
            if (blk.risks.overdue.length > 0) {
              rows.push([`⏰ 14일+ 미해결 ${blk.risks.overdue.length}건`, blk.risks.overdue.map(o => `${o.company}(${o.daysOpen}일)`).join(', ')]);
            }
            if (blk.risks.reorderSoon.length === 0 && blk.risks.contractExpiring.length === 0 && blk.risks.overdue.length === 0) {
              rows.push(['', '현재 리스크 없음']);
            }
            return rows;
          }),
          [],
          // ── 부록: 상세 실적 ──
          ['[부록] 금주 수주 상세'],
          ['고객명', '제품군', '수주금액', '담당자', '오더일'],
          ...weeklyData.weekOrders.map(o => {
            const acc = accounts.find(a => a.id === o.account_id);
            return [o.customer_name || acc?.company_name || '?', o.product_category || '', o.order_amount || 0, o.sales_rep || '', o.order_date || ''];
          }),
          ...(weeklyData.weekOrders.length === 0 ? [['', '', '금주 수주 없음', '', '']] : []),
          [],
          ['[부록] 담당자별 활동 요약'],
          ['담당자', '컨택건수', '수주활동', '크로스셀링', '주요 내용'],
          ...Object.entries(weeklyData.repActivity)
            .filter(([, v]) => v.contacts > 0)
            .map(([rep, v]) => [rep, v.contacts, v.orderActivity, v.crossSelling, v.latestContent]),
          [],
          ...(planSummary ? [
            ['[부록] 사업계획 YTD 진도'],
            ['담당자', 'YTD목표', 'YTD실적', '달성률'],
            ...Object.entries(planSummary.byRep)
              .filter(([, v]) => v.ytdTarget > 0 || v.ytdActual > 0)
              .map(([rep, v]) => [rep, v.ytdTarget, v.ytdActual, v.ytdTarget > 0 ? `${pct(v.ytdActual, v.ytdTarget)}%` : '-']),
          ] : []),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 50 }, { wch: 10 }, { wch: 12 }];
        // 합계 행 강조 (merge 불가하므로 볼드 처리는 뷰어에서)
        XLSX.utils.book_append_sheet(wb, ws, `주간종합_(${wkShort})`);

      } else {
        const mR = monthlyReportData;
        const mmShort = `${mR.selMonth}월`;

        // ── Sheet 1: 매출-수주 Raw (값) ──
        const rawRows = [
          ['수주 Raw 데이터', `${mR.monthLabel} (${mR.monthOrders.length}건)`],
          [],
          ['수주번호', '오더일', '고객명', '담당자', '팀', '지역', '국가', '제품군', '수량', '단가', '수주금액', '통화', '상태'],
          ...mR.monthOrders.map(o => {
            const acc = accounts.find(a => a.id === o.account_id);
            const plan = findPlanForOrder(o);
            return [
              o.order_number || '', o.order_date || '', o.customer_name || acc?.company_name || '',
              o.sales_rep || '', plan?.team || '', o.region || '', o.country || '',
              o.product_category || '', o.quantity || 0, o.unit_price || 0, o.order_amount || 0,
              o.currency || 'KRW', o.status || '',
            ];
          }),
        ];
        const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
        wsRaw['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsRaw, '매출-수주 Raw (값)');

        // ── Sheet 2: 월간종합_(MM월) ──
        const rows = [
          [`${mR.monthLabel} 영업본부 월간 보고`, '', '', '', '', '', '', '', '', '', '', '', '', ''],
          [`출력일: ${new Date().toISOString().slice(0, 10)}`],
          [],
          // ── 섹션 A: Executive Summary ──
          ['■ 0. 이번 달 핵심 요약', '', '', '', '', '', '', '', '', '', '', '', '', ''],
          ['핵심 메시지 1', execSummary.msg1 || ''],
          ['핵심 메시지 2', execSummary.msg2 || ''],
          ['핵심 메시지 3', execSummary.msg3 || ''],
          ['종합 판단', execSummary.status || ''],
          ['다음 달 집중 과제', execSummary.nextMonthFocus || ''],
          [],
          // ── 섹션 B-1: 월별 수주 실적 현황 ──
          ['■ 1. 수주현황 — 월별 실적', '', '', '', '', '', '', '', '', '', '', '', '', '[단위: 백만원]'],
          ['구분', ...mR.monthlyTrend.map(t => `${t.month}월`), '합계'],
          ['전년실적', ...mR.monthlyTrend.map(t => Math.round(t.prevYearActual / 1e6)), Math.round(mR.trendTotal.prevYearActual / 1e6)],
          ['목표', ...mR.monthlyTrend.map(t => Math.round(t.target / 1e6)), Math.round(mR.trendTotal.target / 1e6)],
          ['실적', ...mR.monthlyTrend.map(t => Math.round(t.actual / 1e6)), Math.round(mR.trendTotal.actual / 1e6)],
          ['전년대비(%)', ...mR.monthlyTrend.map(t => t.prevYearActual > 0 ? `${t.yoyPct}%` : '-'), mR.trendTotal.prevYearActual > 0 ? `${Math.round((mR.trendTotal.actual / mR.trendTotal.prevYearActual) * 100)}%` : '-'],
          ['목표대비(%)', ...mR.monthlyTrend.map(t => t.target > 0 ? `${t.targetPct}%` : '-'), mR.trendTotal.target > 0 ? `${Math.round((mR.trendTotal.actual / mR.trendTotal.target) * 100)}%` : '-'],
          [],
          // ── 섹션 B-2: 팀별 월간 실적 ──
          [`■ 2. 팀별 월간 실적 (${mR.monthLabel})`],
          ['팀', '목표', '실적', '달성률', '전년 동월', '전년대비'],
          ...mR.teamRows.map(r => [
            r.display,
            Math.round(r.target / 1e6),
            Math.round(r.actual / 1e6),
            r.target > 0 ? `${r.achieveRate}%` : '-',
            Math.round(r.prevYearActual / 1e6),
            r.prevYearActual > 0 ? `${r.yoyRate}%` : '-',
          ]),
          ['Total',
            Math.round(mR.teamTotal.target / 1e6),
            Math.round(mR.teamTotal.actual / 1e6),
            mR.teamTotal.target > 0 ? `${pct(mR.teamTotal.actual, mR.teamTotal.target)}%` : '-',
            Math.round(mR.teamTotal.prevYearActual / 1e6),
            mR.teamTotal.prevYearActual > 0 ? `${pct(mR.teamTotal.actual, mR.teamTotal.prevYearActual)}%` : '-',
          ],
          [],
          // ── 섹션 C: 팀별 월간 활동 분석 ──
          ['■ 3. 팀별 월간 활동 분석'],
          ['팀', '총 Activity', '신규 계약', 'Cross-selling', '미해결 이슈', '주요 고객 컨택'],
          ...TEAM_ORDER.map(team => {
            const t = mR.teamActivity[team];
            return [t.display, `${t.total}건`, `${t.newContract}건`, `${t.crossSelling}건`, `${t.openIssues}건`, `${t.contactedCount}사`];
          }),
          [],
          ['[팀별 주요 이슈]'],
          ...TEAM_ORDER.flatMap(team => {
            const t = mR.teamActivity[team];
            if (t.majorIssues.length === 0) return [[`[${t.display}]`, '없음']];
            return [
              [`[${t.display}]`, '', '', '', '', ''],
              ...t.majorIssues.map(iss => ['', iss.company, iss.type, iss.content]),
            ];
          }),
          [],
          // ── 섹션 D: 주요 거래처별 실적 ──
          ['■ 4. 주요 거래처별 수주 현황 (상위 10사)'],
          ['순위', '거래처명', '당월 수주', '전월 수주', '증감률'],
          ...mR.topAccounts.map((a, i) => [
            i + 1, a.name, Math.round(a.thisMonth / 1e6), Math.round(a.lastMonth / 1e6),
            a.changeRate === null ? '신규' : `${a.changeRate > 0 ? '+' : ''}${a.changeRate}%`,
          ]),
          [],
          // ── 섹션 E: 다음 달 사업 계획 ──
          ['■ 5. 다음 달 주요 계획'],
          ['[해외영업팀]', nextMonthPlan.overseas || ''],
          ['[국내영업팀]', nextMonthPlan.domestic || ''],
          ['[영업지원팀]', nextMonthPlan.support || ''],
          [],
          ...(mR.reorderSoon.length > 0 ? [
            ['※ 재구매 임박 고객 (D-30 이내)'],
            ...mR.reorderSoon.map(a => ['', a.account?.company_name || '', a.msg]),
            [],
          ] : []),
          ...(mR.contractExpiringSoon.length > 0 ? [
            ['※ 계약 만료 임박 (D-60 이내)'],
            ['', '고객명', '제품군', 'D-day', '만료일'],
            ...mR.contractExpiringSoon.map(c => ['', c.company, c.product, `D-${c.daysLeft}`, c.expiry]),
          ] : []),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws, `월간종합_(${mmShort})`);

        // Cross-Selling sheet
        if (monthlyData.csTopOpps?.length > 0) {
          const csRows = [
            ['Cross-Selling 현황'],
            [],
            ['상태', '건수', '금액'],
            ...Object.entries(monthlyData.csStats).map(([st, v]) => [st, v.count, v.amount]),
            [],
            ['[Top 기회]'],
            ['고객명', '타겟 제품', '상태', '예상 금액'],
            ...monthlyData.csTopOpps.slice(0, 15).map(o => [o.company, o.product, o.status, o.amount]),
          ];
          const wcs = XLSX.utils.aoa_to_sheet(csRows);
          wcs['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
          XLSX.utils.book_append_sheet(wb, wcs, '크로스셀링');
        }

        // FCST vs Actual sheet
        if (monthlyData.fcstVsActual?.length > 0) {
          const fcstRows = [
            ['FCST vs Actual (당분기)'],
            [],
            ['고객명', '예측금액', '실적금액', '차이', '비고'],
            ...monthlyData.fcstVsActual.map(f => [f.company_name, f.forecast, f.actual, f.diff, f.note || '']),
          ];
          const wfc = XLSX.utils.aoa_to_sheet(fcstRows);
          wfc['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 25 }];
          XLSX.utils.book_append_sheet(wb, wfc, 'FCST vs Actual');
        }

        // Deep GAP Analysis sheets
        if (gapAnalysisData) {
          // GAP-1: 원인분석 sheet
          const gapRows = [
            ['심층 Gap 분석 — 원인분석'],
            [],
            ['원인', '건수', '영향금액', '관련 고객'],
            ...gapAnalysisData.causeRanking.map(c => [
              `${c.icon} ${c.label}`, c.count, c.totalGap, c.customers.slice(0, 5).join(', ') + (c.customers.length > 5 ? ` 외 ${c.customers.length - 5}` : ''),
            ]),
          ];
          // GAP-2: 고객별 심층분석
          if (gapAnalysisData.topGapCustomers.length > 0) {
            gapRows.push([], [], ['[고객별 심층분석 — Gap 상위]']);
            gapRows.push(['고객명', '담당', 'YTD Gap', '달성률', 'Gap 원인', 'Score', '미비정보', '액션플랜']);
            gapAnalysisData.topGapCustomers.forEach(cg => {
              const causes = (cg.gapAnalysis?.causes || []).map(k => GAP_CAUSES.find(c => c.key === k)).filter(Boolean);
              const missingInfo = gapAnalysisData.getMissingIntelligence(cg.account);
              const actionPlan = (cg.gapAnalysis?.action_plan || []).filter(a => a.text?.trim());
              const actionDone = actionPlan.filter(a => a.done).length;
              gapRows.push([
                cg.name, cg.rep, cg.ytdGap, `${cg.achieveRate}%`,
                causes.map(c => c.label).join(', ') || '미분석',
                `${cg.score}%`,
                missingInfo.slice(0, 3).map(m => m.category).join(', ') || '완비',
                actionPlan.length > 0 ? `${actionDone}/${actionPlan.length} 완료` : '미설정',
              ]);
            });
          }
          const wg1 = XLSX.utils.aoa_to_sheet(gapRows);
          wg1['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 25 }, { wch: 15 }];
          XLSX.utils.book_append_sheet(wb, wg1, 'Gap 원인·고객분석');

          // GAP-3: 기회 파이프라인 sheet
          if (gapAnalysisData.allOpportunities.length > 0) {
            const oppRows = [
              ['기회 파이프라인 (Gap 만회)', '', '', '', '가중합계:', gapAnalysisData.totalOppWeighted],
              [],
              ['[유형별 요약]'],
              ['유형', '건수', '총 금액', '가중 금액'],
              ...gapAnalysisData.oppSummary.map(o => [o.label, o.count, o.totalAmount, Math.round(o.weightedAmount)]),
              [],
              ['[주요 기회 상세]'],
              ['고객명', '유형', '품목', '예상금액', '확률', '가중금액', '예상시기'],
              ...gapAnalysisData.allOpportunities
                .sort((a, b) => (b.amount * b.probability) - (a.amount * a.probability))
                .slice(0, 20)
                .map(opp => {
                  const typeInfo = OPPORTUNITY_TYPES.find(t => t.key === opp.type);
                  return [opp.company, typeInfo?.label || opp.type, opp.product || '', opp.amount || 0, `${opp.probability || 0}%`, Math.round((opp.amount || 0) * (opp.probability || 0) / 100), opp.expected_date || ''];
                }),
            ];
            const wg2 = XLSX.utils.aoa_to_sheet(oppRows);
            wg2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(wb, wg2, '기회 파이프라인');
          }

          // GAP-4: AM별 활동 품질 sheet
          const amEntries = Object.entries(gapAnalysisData.amMetrics);
          if (amEntries.length > 0) {
            const amRows = [
              ['AM별 활동 품질 지표'],
              [],
              ['담당자', '고객수', '90일 컨택', '고객당 빈도', '평균 Score', 'YTD 달성률', '주요 Gap 원인'],
              ...amEntries
                .sort((a, b) => b[1].achieveRate - a[1].achieveRate)
                .map(([rep, m]) => [
                  rep, m.accountCount, `${m.contactCount90d}건`, m.avgContactFreq,
                  `${m.avgScore}%`,
                  m.ytdTarget > 0 ? `${m.achieveRate}%` : '-',
                  m.gapCauses.map(([k, cnt]) => {
                    const c = GAP_CAUSES.find(gc => gc.key === k);
                    return `${c?.label || k}(${cnt})`;
                  }).join(', ') || '-',
                ]),
            ];
            const wg3 = XLSX.utils.aoa_to_sheet(amRows);
            wg3['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, wg3, 'AM 활동 품질');
          }
        }
      }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = tab === 'weekly'
        ? `영업본부_주간회의_보고자료_${sectionAData.weekLabel}_v1_${dateStr}.xlsx`
        : `월간자료_${monthlyReportData.selYear}년_${String(monthlyReportData.selMonth).padStart(2, '0')}월_영업본부_v1_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Excel 다운로드 실패:', err);
    }
  };

  /* ══════════════════════════════
     RENDER
     ══════════════════════════════ */
  return (
    <div>
      {/* Tab bar + download */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`topbar-tab ${tab === 'weekly' ? 'active' : ''}`} onClick={() => setTab('weekly')}>주간 리포트</button>
          <button className={`topbar-tab ${tab === 'monthly' ? 'active' : ''}`} onClick={() => setTab('monthly')}>월간 리포트</button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => window.print()} style={{ fontSize: 11 }}>인쇄</button>
          <button className="btn btn-success" onClick={handleExcelDownload}>Excel 다운로드</button>
        </div>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="print-header" style={{ display: 'none' }}>
        <h1>Bio Protech 영업본부 {tab === 'weekly' ? '주간' : '월간'} 리포트</h1>
        <div className="print-subtitle">
          {tab === 'weekly' ? `${weeklyData.weekStart} ~ ${weeklyData.weekEnd}` : monthlyData.thisMonthStr}
          {' | '}출력일: {new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
         WEEKLY REPORT
         ═══════════════════════════════════════════════ */}
      {tab === 'weekly' && (
        <div>
          {/* ── 주차 네비게이터 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            marginBottom: 16, padding: '10px 0',
          }}>
            <button className="btn btn-ghost" onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 13, padding: '6px 12px' }}>◀ 이전 주</button>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 200, textAlign: 'center' }}>
              {sectionAData.weekLabel} ({sectionAData.wkStart} ~ {sectionAData.wkEnd})
            </div>
            <button className="btn btn-ghost" onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 13, padding: '6px 12px' }} disabled={weekOffset >= 0}>다음 주 ▶</button>
            {weekOffset !== 0 && (
              <button className="btn btn-ghost" onClick={() => setWeekOffset(0)} style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text3)' }}>이번 주로</button>
            )}
          </div>

          {/* ── KPI 카드 (MTD 중심) ── */}
          <div className="kpi-grid" style={{ gridTemplateColumns: hasPlan ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', marginBottom: 16 }}>
            <div className="kpi accent">
              <div className="kpi-label">금주 수주</div>
              <div className="kpi-value">{fmtKRW(sectionAData.total.thisWeek)}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{weeklyData.weekOrderCount}건</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">금주 활동</div>
              <div className="kpi-value">{weeklyData.weekActivityCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>컨택건수</div>
            </div>
            <div className={`kpi ${weeklyData.openIssueCount > 0 ? 'red' : 'green'}`}>
              <div className="kpi-label">Open 이슈</div>
              <div className="kpi-value">{weeklyData.openIssueCount}</div>
            </div>
            {hasPlan && (
              <div className={`kpi ${pctColor(sectionAData.mtdPct)}`}>
                <div className="kpi-label">MTD 달성률</div>
                <div className="kpi-value">{sectionAData.mtdPct}%</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtKRW(sectionAData.mtdActual)} / {fmtKRW(sectionAData.mtdTarget)}</div>
              </div>
            )}
          </div>

          {/* ══ 분기별 진행 현황 ══ */}
          {hasPlan && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 분기별 진행 현황 ({sectionAData.monday.getFullYear()}년)</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[단위: 백만원 / %]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 80 }}>분기</th>
                      <th style={{ textAlign: 'right' }}>목표</th>
                      <th style={{ textAlign: 'right' }}>실적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'left', paddingLeft: 12 }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAData.quarterData.map(q => {
                      const statusLabel = q.status === 'done' ? '✅ 완료' : q.status === 'active' ? '🔵 진행중' : '⏸ 예정';
                      const statusColor = q.status === 'done' ? 'var(--text2)' : q.status === 'active' ? 'var(--accent)' : 'var(--text3)';
                      return (
                        <tr key={q.q}>
                          <td style={{ fontWeight: 600, color: q.status === 'active' ? 'var(--accent)' : undefined }}>
                            {q.label}
                            <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                              ({(q.q - 1) * 3 + 1}~{q.q * 3}월)
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{fmtM(q.target)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: q.actual > 0 ? 'var(--accent)' : 'var(--text3)' }}>{fmtM(q.actual)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(q.achieveRate) }}>
                            {q.target > 0 ? `${q.achieveRate}%` : '-'}
                          </td>
                          <td style={{ paddingLeft: 12, fontSize: 11, color: statusColor, fontWeight: 600 }}>{statusLabel}</td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const t = sectionAData.quarterData.reduce((acc, q) => ({
                        target: acc.target + q.target, actual: acc.actual + q.actual,
                      }), { target: 0, actual: 0 });
                      return (
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                          <td>연간 합계</td>
                          <td style={{ textAlign: 'right' }}>{fmtM(t.target)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtM(t.actual)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(pct(t.actual, t.target)) }}>
                            {t.target > 0 ? `${pct(t.actual, t.target)}%` : '-'}
                          </td>
                          <td></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ 섹션 A — 매출·수주 현황 ══ */}
          {hasPlan && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 1. 수주 현황</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[단위: 백만원 / %]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 90 }}>구분</th>
                      <th style={{ textAlign: 'right' }}>전주 누적</th>
                      <th style={{ textAlign: 'right' }}>금주 신규</th>
                      <th style={{ textAlign: 'right' }}>당월 누적</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAData.displayTeams.map(team => {
                      const d = sectionAData.teamData[team];
                      const rate = pct(d.monthCum, d.monthTarget);
                      return (
                        <tr key={team}>
                          <td style={{ fontWeight: 600 }}>{TEAM_DISPLAY[team] || team}</td>
                          <td style={{ textAlign: 'right' }}>{fmtM(d.prevCum)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: d.thisWeek > 0 ? 'var(--accent)' : undefined }}>{fmtM(d.thisWeek)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(d.monthCum)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(d.monthTarget)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(rate) }}>{d.monthTarget > 0 ? `${rate}%` : '-'}</td>
                        </tr>
                      );
                    })}
                    {/* 합계 행 */}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td>합계</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.total.prevCum)}</td>
                      <td style={{ textAlign: 'right', color: sectionAData.total.thisWeek > 0 ? 'var(--accent)' : undefined }}>{fmtM(sectionAData.total.thisWeek)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.total.monthCum)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(sectionAData.total.monthTarget)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(pct(sectionAData.total.monthCum, sectionAData.total.monthTarget)) }}>
                        {sectionAData.total.monthTarget > 0 ? `${pct(sectionAData.total.monthCum, sectionAData.total.monthTarget)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 수주: Import 실적 기준 / 목표: 사업계획 Import 고정값 / 전주 누적: 당월 1일 ~ 금주 시작 전일
              </div>
            </div>
          )}

          {/* ══ 섹션 A-2 — 매출 현황 (B/L Date 기준, BEP·생산 CAPA 모니터링) ══ */}
          {hasPlan && sectionAData.hasSalesData && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 1-2. 매출 현황</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[B/L Date 기준, 단위: 백만원 / %]</span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 110 }}>사업부</th>
                      <th style={{ textAlign: 'right' }}>전주 누적</th>
                      <th style={{ textAlign: 'right' }}>금주 신규</th>
                      <th style={{ textAlign: 'right' }}>당월 누적</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAData.displaySalesTeams.map(team => {
                      const d = sectionAData.salesTeamData[team];
                      const rate = pct(d.monthCum, d.monthTarget);
                      return (
                        <tr key={team}>
                          <td style={{ fontWeight: 600 }}>{SALES_TEAM_DISPLAY[team] || team}</td>
                          <td style={{ textAlign: 'right' }}>{fmtM(d.prevCum)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: d.thisWeek > 0 ? '#2563eb' : undefined }}>{fmtM(d.thisWeek)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(d.monthCum)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(d.monthTarget)}</td>
                          <td style={{ textAlign: 'right', ...achieveStyle(rate) }}>{d.monthTarget > 0 && d.monthCum > 0 ? `${rate}%` : '-'}</td>
                        </tr>
                      );
                    })}
                    {/* 합계 행 */}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td>합계</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.salesTotal.prevCum)}</td>
                      <td style={{ textAlign: 'right', color: sectionAData.salesTotal.thisWeek > 0 ? '#2563eb' : undefined }}>{fmtM(sectionAData.salesTotal.thisWeek)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(sectionAData.salesTotal.monthCum)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(sectionAData.salesTotal.monthTarget)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(pct(sectionAData.salesTotal.monthCum, sectionAData.salesTotal.monthTarget)) }}>
                        {sectionAData.salesTotal.monthTarget > 0 && sectionAData.salesTotal.monthCum > 0 ? `${pct(sectionAData.salesTotal.monthCum, sectionAData.salesTotal.monthTarget)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 매출: Import S시트(B/L Date 기준, 매출금액 확정분) /
                {sectionAData.salesTargetSource === 'team_sales'
                  ? ' 목표: 사업계획 월별매출 시트(사업부별)'
                  : sectionAData.salesTargetSource === 'fallback_order_target'
                  ? <span style={{ color: '#d97706' }}> 목표: <strong>수주목표 기반 대체</strong> (사업계획 월별매출 시트 Import 시 별도 매출목표로 교체됨)</span>
                  : ' 매출 목표 없음'}
              </div>
            </div>
          )}

          {hasPlan && !sectionAData.hasSalesData && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 11, color: 'var(--text3)' }}>
              ⚠ 매출(S시트) 데이터가 import되지 않았습니다. 설정 → 영업현황 Import에서 S시트를 포함한 파일을 업로드하세요.
            </div>
          )}

          {/* ══ 섹션 1-3 — 담당자별 당월 실적 (금주 시점, 신 분류 체계) ══ */}
          {sectionAData.weekRepRows && sectionAData.weekRepRows.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 1-3. 담당자별 당월 수주 실적</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                  ({sectionAData.monthStr} 기준, 달성률 순, 단위: 백만원)
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 110 }}>담당자 / 버킷</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>금주 신규</th>
                      <th style={{ textAlign: 'right' }}>당월 누적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'right' }}>Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionAData.weekRepRows.map((r) => {
                      const gap = r.monthTarget - r.monthActual;
                      const monthPct = r.monthTarget > 0 ? Math.round((r.monthActual / r.monthTarget) * 100) : 0;
                      const details = r.isNew ? sectionAData.wkNewDetails[r.label] : sectionAData.wkEtcDetails[r.label];
                      const hasDrill = r.isBucket && details && details.length > 0;
                      const isOpen = repDrillOpen[`w-${r.label}`];
                      return (
                        <>
                          <tr key={r.label} style={{ background: r.isBucket ? 'var(--bg2)' : undefined }}>
                            <td style={{ fontWeight: 600 }}>
                              {hasDrill ? (
                                <button onClick={() => toggleRepDrill(`w-${r.label}`)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: r.isNew ? '#2563eb' : 'var(--accent)', padding: 0 }}>
                                  {isOpen ? '▾' : '▸'} {r.label}
                                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>({details.length}사)</span>
                                </button>
                              ) : (
                                <span style={{ color: r.isBucket ? (r.isNew ? '#2563eb' : 'var(--text2)') : undefined }}>{r.label}</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{fmtM(r.monthTarget)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: r.weekActual > 0 ? 'var(--accent)' : 'var(--text3)' }}>{fmtM(r.weekActual)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(r.monthActual)}</td>
                            <td style={{ textAlign: 'right', ...achieveStyle(monthPct) }}>{r.monthTarget > 0 ? `${monthPct}%` : '-'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--green, #16a34a)' : 'var(--text2)' }}>
                              {r.monthTarget === 0 && r.monthActual === 0 ? '-' : gap > 0 ? `-${fmtM(gap)}` : gap < 0 ? `+${fmtM(-gap)}` : '0'}
                            </td>
                          </tr>
                          {isOpen && hasDrill && (
                            <tr key={`${r.label}-wk-drill`}>
                              <td colSpan={6} style={{ padding: 8, background: r.isNew ? 'rgba(219,234,254,0.3)' : 'rgba(254,243,199,0.2)', borderTop: '1px dashed var(--border)' }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                                  {r.isNew ? '🆕 신규 고객 상세 (전년도 수주 無)' : '📋 기타 고객 상세 (사업계획 외)'}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                                  {details.map((c, j) => (
                                    <div key={j} style={{ fontSize: 11, padding: '3px 6px', background: 'var(--bg)', borderRadius: 4 }}>
                                      <a href="#" onClick={(e) => { e.preventDefault(); if (c.accountId) { const acc = accounts.find(a => a.id === c.accountId); if (acc) setEditingAccount(acc); } }}
                                        style={{ color: c.accountId ? 'var(--accent)' : 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>
                                        {c.name}
                                      </a>
                                      <span style={{ float: 'right', fontWeight: 600 }}>{fmtM(c.amount)}</span>
                                      <span style={{ fontSize: 9, color: 'var(--text3)', display: 'block' }}>{c.orderCount}건 (당월)</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 사업계획상 담당자 + 팀원으로 구성 · 계획 외 고객은 국내/해외 기타(전년도 수주 有) 또는 신규(전년도 수주 無)로 자동 분류 · ▸ 클릭 시 상세 펼치기
              </div>
            </div>
          )}

          {/* ══ 섹션 B — 팀별 통합 블록 (금주활동 / 주요이슈 / Open이슈 / 차주계획 / 리스크) ══ */}
          {TEAM_ORDER.map(teamKey => {
            const blk = teamBlocksData.blocks[teamKey];
            if (!blk) return null;
            const openIssueTotal = blk.openIssues.reduce((s, c) => s + c.issues.length, 0);
            const p1Count = blk.openIssues.filter(c => c.priority === 'P1').length;
            return (
              <div key={teamKey} className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15 }}>■ [{blk.display}]</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                    활동 {blk.activity.contacts}건 · 주요이슈 {blk.majorIssues.length}건 · Open {openIssueTotal}건 ({blk.openIssues.length}사)
                    {p1Count > 0 && <span style={{ color: 'var(--red)', marginLeft: 4 }}>P1 {p1Count}사</span>}
                  </span>
                </div>

                {/* ── 금주 활동 ── */}
                <div style={{ padding: '8px 10px', background: 'var(--bg2)', borderRadius: 6, marginBottom: 10, fontSize: 11 }}>
                  <strong style={{ fontSize: 11 }}>📊 금주 활동:</strong>
                  <span style={{ marginLeft: 8 }}>총 {blk.activity.contacts}건</span>
                  {blk.activity.orderActivity > 0 && <span style={{ marginLeft: 6 }}>| 수주활동 {blk.activity.orderActivity}</span>}
                  {blk.activity.priceNegotiation > 0 && <span style={{ marginLeft: 6 }}>| 가격협의 {blk.activity.priceNegotiation}</span>}
                  {blk.activity.sampleRequest > 0 && <span style={{ marginLeft: 6 }}>| 샘플요청 {blk.activity.sampleRequest}</span>}
                  {blk.activity.crossSelling > 0 && <span style={{ marginLeft: 6 }}>| 크로스셀링 {blk.activity.crossSelling}</span>}
                </div>

                {/* ── 주요 이슈 ── */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--red)' }}>🔴 주요 이슈 (금주 발생, 🟡주요·🔴긴급)</div>
                  {blk.majorIssues.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 8px' }}>— 해당 없음 (Activity Log에 중요도 🟡주요 이상 기록 시 자동 표시)</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {blk.majorIssues.map((iss, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '4px 8px', background: iss.priority === 3 ? 'rgba(220,38,38,.06)' : 'rgba(217,119,6,.06)', borderLeft: `3px solid ${iss.priority === 3 ? '#dc2626' : '#d97706'}`, borderRadius: 3 }}>
                          <span style={{ marginRight: 4 }}>{iss.priority === 3 ? '🔴' : '🟡'}</span>
                          <strong>
                            {iss.accountId ? (
                              <a href="#" onClick={(e) => { e.preventDefault(); const acc = accounts.find(a => a.id === iss.accountId); if (acc) setEditingAccount(acc); }}
                                style={{ color: 'var(--accent)', textDecoration: 'none' }}>{iss.company}</a>
                            ) : iss.company}
                          </strong>
                          <span style={{ marginLeft: 4, color: 'var(--text3)' }}>[{iss.issueType}]</span>
                          <span style={{ marginLeft: 4 }}>{iss.content.length > 80 ? iss.content.slice(0, 80) + '...' : iss.content}</span>
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>— {iss.rep}, {iss.status}, {iss.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Open 이슈 ── */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>⏳ Open 이슈 (누적 진행중, 고객별 우선순위)</div>
                  {blk.openIssues.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 8px' }}>진행 중인 이슈 없음</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {blk.openIssues.slice(0, 15).map(cu => {
                        const pColor = cu.priority === 'P1' ? '#dc2626' : cu.priority === 'P2' ? '#d97706' : '#6b7280';
                        const pBg = cu.priority === 'P1' ? 'rgba(220,38,38,.06)' : cu.priority === 'P2' ? 'rgba(217,119,6,.04)' : 'var(--bg2)';
                        const isOpen = repDrillOpen[`o-${teamKey}-${cu.company}`];
                        return (
                          <div key={cu.company} style={{ background: pBg, borderLeft: `3px solid ${pColor}`, borderRadius: 3 }}>
                            <button onClick={() => toggleRepDrill(`o-${teamKey}-${cu.company}`)}
                              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 11 }}>
                              <span style={{ fontWeight: 700, color: pColor, marginRight: 6 }}>[{cu.priority}]</span>
                              <strong>{cu.company}</strong>
                              {cu.strategicTier && <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 4px', borderRadius: 3, background: 'var(--bg)' }}>{cu.strategicTier}</span>}
                              <span style={{ marginLeft: 6, color: 'var(--text2)' }}>
                                {cu.issues.length}건 / 최장 {cu.maxDaysOpen}일
                                {cu.hasQuality && <span style={{ color: 'var(--red)', marginLeft: 4 }}>⚠ 품질</span>}
                              </span>
                              <span style={{ float: 'right', color: 'var(--text3)', fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
                            </button>
                            {isOpen && (
                              <div style={{ padding: '4px 14px 8px', fontSize: 10, color: 'var(--text2)' }}>
                                {cu.issues.map(iss => (
                                  <div key={iss.id} style={{ padding: '2px 0' }}>
                                    • [{iss.issueType}] {iss.content.length > 80 ? iss.content.slice(0, 80) + '…' : iss.content}
                                    <span style={{ marginLeft: 4, color: 'var(--text3)' }}>({iss.status}, {iss.daysOpen}일, {iss.rep})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {blk.openIssues.length > 15 && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 4 }}>... 외 {blk.openIssues.length - 15}사</div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 차주 계획 ── */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📅 차주 계획 ({teamBlocksData.nextWeekLabel})</div>
                  {blk.nextActions.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 8px' }}>예정된 액션 없음</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 3 }}>
                      {blk.nextActions.slice(0, 10).map((a, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '3px 8px', background: a.isCarryover ? '#fef2f2' : 'var(--bg)', borderRadius: 3 }}>
                          {a.isCarryover && <span style={{ fontSize: 9, color: '#fff', background: 'var(--red)', padding: '1px 4px', borderRadius: 3, marginRight: 4 }}>이월</span>}
                          <strong>{a.company}</strong>
                          <span style={{ marginLeft: 4 }}>— {a.action.length > 60 ? a.action.slice(0, 60) + '…' : a.action}</span>
                          <span style={{ marginLeft: 6, color: 'var(--text3)', fontSize: 10 }}>({a.rep}, 기한: {a.dueDate})</span>
                        </div>
                      ))}
                      {blk.nextActions.length > 10 && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 4 }}>... 외 {blk.nextActions.length - 10}건</div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 리스크 ── */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#d97706' }}>⚠ 리스크</div>
                  {blk.risks.reorderSoon.length === 0 && blk.risks.contractExpiring.length === 0 && blk.risks.overdue.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 8px' }}>현재 리스크 없음</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 3, fontSize: 11 }}>
                      {blk.risks.reorderSoon.length > 0 && (
                        <div style={{ padding: '3px 8px', background: '#fef3c7', borderRadius: 3 }}>
                          <strong>🔔 재구매 임박 ({blk.risks.reorderSoon.length}사)</strong>:&nbsp;
                          <span style={{ color: 'var(--text2)' }}>
                            {blk.risks.reorderSoon.slice(0, 5).map(r => r.company).join(', ')}
                            {blk.risks.reorderSoon.length > 5 && ` 외 ${blk.risks.reorderSoon.length - 5}사`}
                          </span>
                        </div>
                      )}
                      {blk.risks.contractExpiring.length > 0 && (
                        <div style={{ padding: '3px 8px', background: '#fee2e2', borderRadius: 3 }}>
                          <strong>📅 계약 만료 D-60 ({blk.risks.contractExpiring.length}건)</strong>:&nbsp;
                          <span style={{ color: 'var(--text2)' }}>
                            {blk.risks.contractExpiring.slice(0, 5).map(c => `${c.company}(D-${c.daysLeft})`).join(', ')}
                            {blk.risks.contractExpiring.length > 5 && ` 외 ${blk.risks.contractExpiring.length - 5}건`}
                          </span>
                        </div>
                      )}
                      {blk.risks.overdue.length > 0 && (
                        <div style={{ padding: '3px 8px', background: 'rgba(220,38,38,.06)', borderRadius: 3 }}>
                          <strong>⏰ 14일+ 미해결 ({blk.risks.overdue.length}건)</strong>:&nbsp;
                          <span style={{ color: 'var(--text2)' }}>
                            {blk.risks.overdue.slice(0, 5).map(o => `${o.company}(${o.daysOpen}일)`).join(', ')}
                            {blk.risks.overdue.length > 5 && ` 외 ${blk.risks.overdue.length - 5}건`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── v3.1: 상세 분석 섹션 전체 제거 (팀별 통합 블록으로 정보 충분, 월간과 중복 방지) ── */}
        </div>
      )}

      {/* ═══════════════════════════════════════════════
         MONTHLY REPORT
         ═══════════════════════════════════════════════ */}
      {tab === 'monthly' && (
        <div>
          {/* ── 월 네비게이터 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            marginBottom: 16, padding: '10px 0',
          }}>
            <button className="btn btn-ghost" onClick={() => setMonthOffset(m => m - 1)} style={{ fontSize: 13, padding: '6px 12px' }}>◀ 이전 월</button>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 180, textAlign: 'center' }}>
              {monthlyReportData.monthLabel}
            </div>
            <button className="btn btn-ghost" onClick={() => setMonthOffset(m => m + 1)} style={{ fontSize: 13, padding: '6px 12px' }} disabled={monthOffset >= 0}>다음 월 ▶</button>
            {monthOffset !== -1 && (
              <button className="btn btn-ghost" onClick={() => setMonthOffset(-1)} style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text3)' }}>전월로</button>
            )}
          </div>

          {/* ══ Page 1 — Executive Summary ══ */}
          <ChapterHeader
            page={1}
            total={5}
            title="Executive Summary — 이번 달 한눈에"
            subtitle="KPI · 전년동기 비교 · 자동 요약 · 영업본부장 핵심 메시지"
            color="#2e7d32"
          />

          {/* ══ KPI 카드 — 당월 + YTD, 수주 + 매출 ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {/* 수주 MTD */}
            <div className={`kpi ${pctColor(monthlyReportData.kpi.order.mtdPct)}`} style={{ padding: 12 }}>
              <div className="kpi-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>📦 수주 MTD 달성률</div>
              <div className="kpi-value" style={{ fontSize: 22, marginBottom: 4 }}>{monthlyReportData.kpi.order.mtdPct}%</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                {fmtKRW(monthlyReportData.kpi.order.mtdActual)} / {fmtKRW(monthlyReportData.kpi.order.mtdTarget)}
              </div>
              <div style={{ fontSize: 10, color: monthlyReportData.kpi.order.mtdYoyPct >= 100 ? 'var(--green, #16a34a)' : 'var(--red)', marginTop: 2 }}>
                전년 {monthlyReportData.kpi.order.mtdYoyPct > 0 ? `${monthlyReportData.kpi.order.mtdYoyPct}%` : '-'}
              </div>
            </div>
            {/* 수주 YTD */}
            <div className={`kpi ${pctColor(monthlyReportData.kpi.order.ytdPct)}`} style={{ padding: 12 }}>
              <div className="kpi-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>📦 수주 YTD 누적달성률</div>
              <div className="kpi-value" style={{ fontSize: 22, marginBottom: 4 }}>{monthlyReportData.kpi.order.ytdPct}%</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                {fmtKRW(monthlyReportData.kpi.order.ytdActual)} / {fmtKRW(monthlyReportData.kpi.order.ytdTarget)}
              </div>
              <div style={{ fontSize: 10, color: monthlyReportData.kpi.order.ytdYoyPct >= 100 ? 'var(--green, #16a34a)' : 'var(--red)', marginTop: 2 }}>
                전년 {monthlyReportData.kpi.order.ytdYoyPct > 0 ? `${monthlyReportData.kpi.order.ytdYoyPct}%` : '-'}
              </div>
            </div>
            {/* 매출 MTD */}
            <div className={`kpi ${pctColor(monthlyReportData.kpi.sales.mtdPct)}`} style={{ padding: 12, background: 'rgba(59,130,246,0.05)' }}>
              <div className="kpi-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>💰 매출 MTD 달성률</div>
              <div className="kpi-value" style={{ fontSize: 22, marginBottom: 4 }}>{monthlyReportData.kpi.sales.mtdPct}%</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                {fmtKRW(monthlyReportData.kpi.sales.mtdActual)} / {fmtKRW(monthlyReportData.kpi.sales.mtdTarget)}
              </div>
              <div style={{ fontSize: 10, color: monthlyReportData.kpi.sales.mtdYoyPct >= 100 ? 'var(--green, #16a34a)' : 'var(--red)', marginTop: 2 }}>
                전년 {monthlyReportData.kpi.sales.mtdYoyPct > 0 ? `${monthlyReportData.kpi.sales.mtdYoyPct}%` : '-'}
              </div>
            </div>
            {/* 매출 YTD */}
            <div className={`kpi ${pctColor(monthlyReportData.kpi.sales.ytdPct)}`} style={{ padding: 12, background: 'rgba(59,130,246,0.05)' }}>
              <div className="kpi-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>💰 매출 YTD 누적달성률</div>
              <div className="kpi-value" style={{ fontSize: 22, marginBottom: 4 }}>{monthlyReportData.kpi.sales.ytdPct}%</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                {fmtKRW(monthlyReportData.kpi.sales.ytdActual)} / {fmtKRW(monthlyReportData.kpi.sales.ytdTarget)}
              </div>
              <div style={{ fontSize: 10, color: monthlyReportData.kpi.sales.ytdYoyPct >= 100 ? 'var(--green, #16a34a)' : 'var(--red)', marginTop: 2 }}>
                전년 {monthlyReportData.kpi.sales.ytdYoyPct > 0 ? `${monthlyReportData.kpi.sales.ytdYoyPct}%` : '-'}
              </div>
            </div>
          </div>

          {/* ══ 전년동기 대비 비교 요약 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">■ 전년동기 대비 비교</div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 100 }}>구분</th>
                    <th style={{ textAlign: 'right' }}>전년 동월 실적</th>
                    <th style={{ textAlign: 'right' }}>당월 실적</th>
                    <th style={{ textAlign: 'right' }}>증감액</th>
                    <th style={{ textAlign: 'right' }}>증감률</th>
                    <th style={{ textAlign: 'right', paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>전년 YTD</th>
                    <th style={{ textAlign: 'right' }}>당해 YTD</th>
                    <th style={{ textAlign: 'right' }}>YTD 증감액</th>
                    <th style={{ textAlign: 'right' }}>YTD 증감률</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: '📦 수주', k: monthlyReportData.kpi.order },
                    { label: '💰 매출', k: monthlyReportData.kpi.sales },
                  ].map((row, i) => {
                    const mtdDiff = row.k.mtdActual - row.k.mtdPrevYear;
                    const mtdGrowth = row.k.mtdPrevYear > 0 ? Math.round(((row.k.mtdActual - row.k.mtdPrevYear) / row.k.mtdPrevYear) * 100) : null;
                    const ytdDiff = row.k.ytdActual - row.k.ytdPrevYear;
                    const ytdGrowth = row.k.ytdPrevYear > 0 ? Math.round(((row.k.ytdActual - row.k.ytdPrevYear) / row.k.ytdPrevYear) * 100) : null;
                    const colorFor = (v) => v > 0 ? 'var(--green, #16a34a)' : v < 0 ? 'var(--red)' : 'var(--text2)';
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{row.label}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(row.k.mtdPrevYear)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(row.k.mtdActual)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: colorFor(mtdDiff) }}>
                          {mtdDiff >= 0 ? '+' : ''}{fmtM(mtdDiff)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: colorFor(mtdDiff) }}>
                          {mtdGrowth === null ? '신규' : `${mtdGrowth >= 0 ? '+' : ''}${mtdGrowth}%`}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text3)', paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>{fmtM(row.k.ytdPrevYear)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(row.k.ytdActual)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: colorFor(ytdDiff) }}>
                          {ytdDiff >= 0 ? '+' : ''}{fmtM(ytdDiff)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: colorFor(ytdDiff) }}>
                          {ytdGrowth === null ? '신규' : `${ytdGrowth >= 0 ? '+' : ''}${ytdGrowth}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
              ※ 수주: O시트(오더일 기준) / 매출: S시트(B/L Date 기준) · 단위: 백만원
            </div>
          </div>

          {/* ══ 섹션 A-0 — 자동 생성 요약 (Phase B #1) ══ */}
          <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(46,125,50,0.04), rgba(59,130,246,0.04))', border: '1px dashed var(--accent)' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🤖 자동 생성 Executive Summary</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[KPI/GAP/파이프라인 기반 자동 집계]</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{monthlyReportData.autoExecSummary.autoStatus}</span>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.5 }}>
              {monthlyReportData.autoExecSummary.lines.map((line, i) => (
                <div key={i} style={{ padding: '4px 10px', background: 'var(--bg)', borderRadius: 4, borderLeft: '3px solid var(--accent)' }}>
                  <strong style={{ color: 'var(--text2)', fontSize: 10, marginRight: 6 }}>{i === 0 ? '📊' : i === 1 ? '📈' : i === 2 ? '⚠️' : '🎯'}</strong>
                  {line}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
              ※ 수치 기반 자동 요약 · 하단 "0. 이번 달 핵심 요약"에서 수동 보완/편집
            </div>
          </div>

          {/* ══ 섹션 A — Executive Summary (수동 입력) ══ */}
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg2)' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 0. 이번 달 핵심 요약</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[영업본부장 직접 입력]</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[1, 2, 3].map(i => {
                const key = `msg${i}`;
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)' }}>핵심 메시지 {i}</label>
                    <input
                      type="text"
                      value={execSummary[key] || ''}
                      onChange={e => saveExecSummary({ [key]: e.target.value })}
                      placeholder={`핵심 메시지 ${i}을 입력하세요`}
                      style={{ flex: 1, padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)' }}>종합 판단</label>
                {['🟢 순조', '🟡 주의', '🔴 위기'].map(opt => {
                  const icon = opt.split(' ')[0];
                  return (
                    <button
                      key={opt}
                      onClick={() => saveExecSummary({ status: icon })}
                      className={`btn btn-sm ${execSummary.status === icon ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: 12 }}
                    >{opt}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)', marginTop: 4 }}>다음 달 집중</label>
                <textarea
                  value={execSummary.nextMonthFocus || ''}
                  onChange={e => saveExecSummary({ nextMonthFocus: e.target.value })}
                  placeholder="다음 달 집중 과제를 입력하세요"
                  rows={2}
                  style={{ flex: 1, padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* ══ Page 2 — Key Metrics ══ */}
          <ChapterHeader
            page={2}
            total={5}
            title="Key Metrics — 월별/팀별/담당자별 실적"
            subtitle="수주·매출 월별 추이 · 팀별 실적 · 담당자별 수주"
            color="#0ea5e9"
          />

          {/* ══ 섹션 B-1 — 월별 수주 실적 현황 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 1. 수주현황 — 월별 실적</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[단위: 백만원 / %]</span>
            </div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 80, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>구분</th>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <th key={t.month} style={{ textAlign: 'right', minWidth: 55, background: t.month === monthlyReportData.selMonth ? 'var(--accent-bg, #e0f2fe)' : undefined }}>
                        {t.month}월
                      </th>
                    ))}
                    <th style={{ textAlign: 'right', minWidth: 65, fontWeight: 700 }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년실적</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(t.prevYearActual)}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.trendTotal.prevYearActual)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right' }}>{fmtM(t.target)}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.trendTotal.target)}</td>
                  </tr>
                  <tr style={{ background: 'var(--bg2)' }}>
                    <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>실적</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', fontWeight: 600, color: t.actual > 0 ? 'var(--accent)' : 'var(--text3)' }}>{fmtM(t.actual)}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmtM(monthlyReportData.trendTotal.actual)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년대비</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.yoyPct) }}>{t.prevYearActual > 0 && t.actual > 0 ? `${t.yoyPct}%` : '-'}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {monthlyReportData.trendTotal.prevYearActual > 0 ? `${Math.round((monthlyReportData.trendTotal.actual / monthlyReportData.trendTotal.prevYearActual) * 100)}%` : '-'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표대비</td>
                    {monthlyReportData.monthlyTrend.map(t => (
                      <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.targetPct) }}>{t.target > 0 ? `${t.targetPct}%` : '-'}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {monthlyReportData.trendTotal.target > 0 ? `${Math.round((monthlyReportData.trendTotal.actual / monthlyReportData.trendTotal.target) * 100)}%` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ 섹션 B-1-2 — 매출 현황 월별 실적 (B/L date 기준) ══ */}
          {monthlyReportData.hasSalesData && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>■ 1-2. 매출현황 — 월별 실적</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[B/L date 기준, 단위: 백만원]</span>
                {monthlyReportData.salesTargetSource === 'fallback_order_target' && (
                  <span style={{ fontSize: 10, color: '#d97706', fontWeight: 600, background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                    목표: 수주목표 기반 대체
                  </span>
                )}
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 80, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>구분</th>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <th key={t.month} style={{ textAlign: 'right', minWidth: 55, background: t.month === monthlyReportData.selMonth ? '#dbeafe' : undefined }}>
                          {t.month}월
                        </th>
                      ))}
                      <th style={{ textAlign: 'right', minWidth: 65, fontWeight: 700 }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년실적</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(t.prevYearActual)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.salesTrendTotal.prevYearActual)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right' }}>{fmtM(t.target)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(monthlyReportData.salesTrendTotal.target)}</td>
                    </tr>
                    <tr style={{ background: 'var(--bg2)' }}>
                      <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: 'var(--bg2)', zIndex: 1 }}>실적</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', fontWeight: 600, color: t.actual > 0 ? '#2563eb' : 'var(--text3)' }}>{fmtM(t.actual)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{fmtM(monthlyReportData.salesTrendTotal.actual)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>전년대비</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.yoyPct) }}>{t.prevYearActual > 0 && t.actual > 0 ? `${t.yoyPct}%` : '-'}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {monthlyReportData.salesTrendTotal.prevYearActual > 0 ? `${Math.round((monthlyReportData.salesTrendTotal.actual / monthlyReportData.salesTrendTotal.prevYearActual) * 100)}%` : '-'}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--text2)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>목표대비</td>
                      {monthlyReportData.salesMonthlyTrend.map(t => (
                        <td key={t.month} style={{ textAlign: 'right', ...achieveStyle(t.targetPct) }}>{t.target > 0 && t.actual > 0 ? `${t.targetPct}%` : '-'}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {monthlyReportData.salesTrendTotal.target > 0 && monthlyReportData.salesTrendTotal.actual > 0 ? `${Math.round((monthlyReportData.salesTrendTotal.actual / monthlyReportData.salesTrendTotal.target) * 100)}%` : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ 섹션 B-2 — 팀별 월간 실적 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>■ 2. 팀별 월간 실적</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[{monthlyReportData.monthLabel} 기준]</span>
            </div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 100 }}>팀</th>
                    <th style={{ textAlign: 'right' }}>목표</th>
                    <th style={{ textAlign: 'right' }}>실적</th>
                    <th style={{ textAlign: 'right' }}>달성률</th>
                    <th style={{ textAlign: 'right' }}>전년 동월</th>
                    <th style={{ textAlign: 'right' }}>전년대비</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyReportData.teamRows.map(r => (
                    <tr key={r.team}>
                      <td style={{ fontWeight: 600 }}>{r.display}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(r.target)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmtM(r.actual)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(r.achieveRate) }}>{r.target > 0 ? `${r.achieveRate}%` : '-'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{fmtM(r.prevYearActual)}</td>
                      <td style={{ textAlign: 'right', ...achieveStyle(r.yoyRate) }}>{r.prevYearActual > 0 ? `${r.yoyRate}%` : '-'}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td>Total</td>
                    <td style={{ textAlign: 'right' }}>{fmtM(monthlyReportData.teamTotal.target)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtM(monthlyReportData.teamTotal.actual)}</td>
                    <td style={{ textAlign: 'right', ...achieveStyle(pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.target)) }}>
                      {monthlyReportData.teamTotal.target > 0 ? `${pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.target)}%` : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtM(monthlyReportData.teamTotal.prevYearActual)}</td>
                    <td style={{ textAlign: 'right', ...achieveStyle(pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.prevYearActual)) }}>
                      {monthlyReportData.teamTotal.prevYearActual > 0 ? `${pct(monthlyReportData.teamTotal.actual, monthlyReportData.teamTotal.prevYearActual)}%` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* [v3.1 제거] 섹션 2-2 팀별 월간 매출 — 매출은 1-2 월별 추이 + KPI 카드로 충분 */}

          {/* ══ 섹션 2-3 — 담당자별 월간 수주 실적 (신 분류 체계) ══ */}
          {monthlyReportData.repMonthRows.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 2-3. 담당자별 월간 수주 실적</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                  ({monthlyReportData.monthLabel}, 달성률 순, 단위: 백만원)
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 110 }}>담당자 / 버킷</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>당월 실적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'right' }}>Gap</th>
                      <th style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>YTD 실적</th>
                      <th style={{ textAlign: 'right' }}>연간 목표</th>
                      <th style={{ textAlign: 'right' }}>연간 달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReportData.repMonthRows.map((r, i) => {
                      const gap = r.monthTarget - r.monthActual;
                      const annualPct = r.annualTarget > 0 ? Math.round((r.ytdActual / r.annualTarget) * 100) : 0;
                      const monthPct = r.monthTarget > 0 ? Math.round((r.monthActual / r.monthTarget) * 100) : 0;
                      const hasDrill = r.isBucket && (
                        (r.isNew ? monthlyReportData.newCustomerDetails[r.label] : monthlyReportData.etcCustomerDetails[r.label])?.length > 0
                      );
                      const isOpen = repDrillOpen[`m-${r.label}`];
                      return (
                        <>
                          <tr key={r.label} style={{ background: r.isBucket ? 'var(--bg2)' : undefined }}>
                            <td style={{ fontWeight: 600 }}>
                              {hasDrill ? (
                                <button onClick={() => toggleRepDrill(`m-${r.label}`)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: r.isNew ? '#2563eb' : 'var(--accent)', padding: 0 }}>
                                  {isOpen ? '▾' : '▸'} {r.label}
                                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>
                                    ({(r.isNew ? monthlyReportData.newCustomerDetails[r.label] : monthlyReportData.etcCustomerDetails[r.label]).length}사)
                                  </span>
                                </button>
                              ) : (
                                <span style={{ color: r.isBucket ? (r.isNew ? '#2563eb' : 'var(--text2)') : undefined }}>
                                  {r.label}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{fmtM(r.monthTarget)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmtM(r.monthActual)}</td>
                            <td style={{ textAlign: 'right', ...achieveStyle(monthPct) }}>{r.monthTarget > 0 ? `${monthPct}%` : '-'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--green, #16a34a)' : 'var(--text2)' }}>
                              {r.monthTarget === 0 && r.monthActual === 0 ? '-' : gap > 0 ? `-${fmtM(gap)}` : gap < 0 ? `+${fmtM(-gap)}` : '0'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>{fmtM(r.ytdActual)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmtM(r.annualTarget)}</td>
                            <td style={{ textAlign: 'right', ...achieveStyle(annualPct) }}>{r.annualTarget > 0 ? `${annualPct}%` : '-'}</td>
                          </tr>
                          {isOpen && hasDrill && (
                            <tr key={`${r.label}-drill`}>
                              <td colSpan={8} style={{ padding: 8, background: r.isNew ? 'rgba(219,234,254,0.3)' : 'rgba(254,243,199,0.2)', borderTop: '1px dashed var(--border)' }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                                  {r.isNew ? '🆕 신규 고객 상세 (전년도 수주 無)' : '📋 기타 고객 상세 (사업계획 외)'}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                                  {(r.isNew ? monthlyReportData.newCustomerDetails[r.label] : monthlyReportData.etcCustomerDetails[r.label]).map((c, j) => (
                                    <div key={j} style={{ fontSize: 11, padding: '3px 6px', background: 'var(--bg)', borderRadius: 4 }}>
                                      <a href="#" onClick={(e) => { e.preventDefault(); if (c.accountId) { const acc = accounts.find(a => a.id === c.accountId); if (acc) setEditingAccount(acc); } }}
                                        style={{ color: c.accountId ? 'var(--accent)' : 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>
                                        {c.name}
                                      </a>
                                      <span style={{ float: 'right', fontWeight: 600 }}>{fmtM(c.amount)}</span>
                                      <span style={{ fontSize: 9, color: 'var(--text3)', display: 'block' }}>{c.orderCount}건 (YTD)</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 사업계획상 담당자 + 팀원으로 구성 · 계획 외 고객은 국내/해외 기타(전년도 수주 有) 또는 신규(전년도 수주 無)로 자동 분류 · ▸ 클릭 시 상세 펼치기
              </div>
            </div>
          )}

          {/* ══ Page 3 — Strategic Analysis ══ */}
          <ChapterHeader
            page={3}
            total={5}
            title="Strategic Analysis — 팀 활동 & GAP 심층 분석"
            subtitle="팀별 활동 + 미달 원인 · 고객별 당월 실적 · GAP 요약 + 상세 (미달/초과)"
            color="#d97706"
          />

          {/* ══ 섹션 C — 팀별 월간 활동 분석 ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">■ 3. 팀별 월간 활동 분석</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {TEAM_ORDER.map(team => {
                const t = monthlyReportData.teamActivity[team];
                const tg = monthlyReportData.teamGapCauses[team] || { shortCount: 0, shortGap: 0, topCauses: [] };
                return (
                  <div key={team} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--bg2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>[{t.display}]</div>
                    <table style={{ width: '100%', fontSize: 11 }}>
                      <tbody>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>총 Activity</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.total}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>신규 계약 체결</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.newContract}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>Cross-selling</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.crossSelling}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>미해결 이슈</td><td style={{ textAlign: 'right', fontWeight: 600, color: t.openIssues > 0 ? 'var(--red)' : undefined }}>{t.openIssues}건</td></tr>
                        <tr><td style={{ color: 'var(--text2)', padding: '2px 0' }}>주요 고객 컨택</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{t.contactedCount}사</td></tr>
                      </tbody>
                    </table>
                    {/* Phase B #4: 팀별 GAP 원인 */}
                    {tg.shortCount > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
                          🔴 미달 고객 {tg.shortCount}사 · Gap {fmtKRW(tg.shortGap)}
                        </div>
                        {tg.topCauses.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {tg.topCauses.map(c => (
                              <span key={c.key} style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(220,38,38,0.08)', color: 'var(--red)', borderRadius: 3, fontWeight: 600 }}>
                                {c.icon}{c.label}({c.count})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {t.majorIssues.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>주요 이슈 TOP {t.majorIssues.length}</div>
                        {t.majorIssues.map((iss, i) => (
                          <div key={i} style={{ fontSize: 10, padding: '2px 0', color: 'var(--text2)' }}>
                            • <strong>{iss.company}</strong> [{iss.type}] {iss.content.length > 30 ? iss.content.slice(0, 30) + '...' : iss.content}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* [v3.1 제거] 섹션 4 Top 10 거래처 (전월비교) — 시즌성 고객은 의미 없음, GAP 심층분석으로 통합 */}

          {/* ══ 섹션 4-2 — 고객별 당월 실적 (목표 설정된 모든 고객) ══ */}
          {monthlyReportData.monthlyByCustomer.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 4-2. 고객별 당월 수주 실적</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                  ({monthlyReportData.monthLabel} 목표 설정 고객 {monthlyReportData.monthlyByCustomer.length}사, 달성률 높은 순)
                </span>
              </div>
              <div className="table-wrap" style={{ maxHeight: 400 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>거래처명</th>
                      <th>담당</th>
                      <th style={{ textAlign: 'right' }}>당월 목표</th>
                      <th style={{ textAlign: 'right' }}>당월 실적</th>
                      <th style={{ textAlign: 'right' }}>달성률</th>
                      <th style={{ textAlign: 'right' }}>Gap</th>
                      <th style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>YTD 목표</th>
                      <th style={{ textAlign: 'right' }}>YTD 실적</th>
                      <th style={{ textAlign: 'right' }}>YTD 달성률</th>
                      <th style={{ textAlign: 'right' }}>YTD Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReportData.monthlyByCustomer.map((p, i) => (
                      <tr key={i} style={{ background: p.monthPct < 80 ? 'rgba(254, 226, 226, 0.3)' : undefined }}>
                        <td style={{ fontWeight: 600 }}>
                          {p.accountId ? (
                            <a href="#" onClick={(e) => { e.preventDefault(); const acc = accounts.find(a => a.id === p.accountId); if (acc) setEditingAccount(acc); }}
                              style={{ color: 'var(--accent)', textDecoration: 'none' }}>{p.name}</a>
                          ) : p.name}
                        </td>
                        <td style={{ color: 'var(--text2)' }}>{p.rep}</td>
                        <td style={{ textAlign: 'right' }}>{fmtM(p.monthTarget)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: p.monthActual > 0 ? 'var(--accent)' : 'var(--red)' }}>{fmtM(p.monthActual)}</td>
                        <td style={{ textAlign: 'right', ...achieveStyle(p.monthPct) }}>{p.monthPct}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: p.monthGap > 0 ? 'var(--red)' : p.monthGap < 0 ? 'var(--green, #16a34a)' : 'var(--text2)' }}>
                          {p.monthGap > 0 ? `-${fmtM(p.monthGap)}` : p.monthGap < 0 ? `+${fmtM(-p.monthGap)}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text3)', borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>{fmtM(p.ytdTarget)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(p.ytdActual)}</td>
                        <td style={{ textAlign: 'right', ...achieveStyle(p.ytdPct) }}>{p.ytdPct}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: p.ytdGap > 0 ? 'var(--red)' : p.ytdGap < 0 ? 'var(--green, #16a34a)' : 'var(--text2)' }}>
                          {p.ytdGap > 0 ? `-${fmtM(p.ytdGap)}` : p.ytdGap < 0 ? `+${fmtM(-p.ytdGap)}` : '0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                ※ 목표가 설정된 모든 고객 표시 (실적 0 포함) · 달성률 높은 순 · 고객명 클릭 시 상세 카드 열림
              </div>
            </div>
          )}

          {/* ══ 섹션 4-3 — 고객별 GAP 심층 분석 (미달 + 초과) ══ */}
          {(monthlyReportData.gapDeepAnalysis.shortfall.length > 0 || monthlyReportData.gapDeepAnalysis.surplus.length > 0) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>■ 4-3. 고객별 GAP 심층 분석</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                  (미달 {monthlyReportData.gapDeepAnalysis.shortfall.length}사 · 초과 {monthlyReportData.gapDeepAnalysis.surplus.length}사 · 고객카드 전체 맥락 통합)
                </span>
              </div>

              {/* Phase B #7: GAP 요약 박스 */}
              {(() => {
                const g = monthlyReportData.gapSummary;
                return (
                  <div style={{ marginBottom: 16, padding: 12, background: 'linear-gradient(135deg, rgba(220,38,38,0.04), rgba(22,163,74,0.04))', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>📊 GAP 요약 — 한눈에 보기</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                      {/* 미달 요약 */}
                      <div style={{ padding: 10, background: 'rgba(254,226,226,0.3)', borderRadius: 6, borderLeft: '3px solid var(--red)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>🔴 미달</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{g.shortCount}사</div>
                        <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>총 Gap {fmtKRW(g.totalShortGap)}</div>
                      </div>
                      {/* 초과 요약 */}
                      <div style={{ padding: 10, background: 'rgba(220,252,231,0.3)', borderRadius: 6, borderLeft: '3px solid var(--green, #16a34a)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 2 }}>🟢 초과</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{g.surplusCount}사</div>
                        <div style={{ fontSize: 11, color: 'var(--green, #16a34a)', fontWeight: 600 }}>총 초과 {fmtKRW(g.totalSurplusGap)}</div>
                      </div>
                      {/* 순 Gap */}
                      <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 6, borderLeft: `3px solid ${g.netGap > 0 ? 'var(--red)' : 'var(--green, #16a34a)'}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 2 }}>📐 순 Gap</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: g.netGap > 0 ? 'var(--red)' : 'var(--green, #16a34a)' }}>
                          {g.netGap > 0 ? '-' : '+'}{fmtKRW(Math.abs(g.netGap))}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>미달 − 초과</div>
                      </div>
                      {/* FCST Catch-up */}
                      {g.catchUpTotal > 0 && (
                        <div style={{ padding: 10, background: 'rgba(37,99,235,0.06)', borderRadius: 6, borderLeft: '3px solid #2563eb' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', marginBottom: 2 }}>📈 FCST 잠재</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#2563eb' }}>{fmtKRW(g.catchUpTotal)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>향후 회복 예상</div>
                        </div>
                      )}
                    </div>
                    {/* 주요 원인 TOP3 */}
                    {g.topCauses.length > 0 && (
                      <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>🔍 주요 원인 TOP {g.topCauses.length}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {g.topCauses.map((c, i) => (
                            <span key={c.key} style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(220,38,38,0.08)', color: 'var(--red)', borderRadius: 12, fontWeight: 600 }}>
                              #{i + 1} {c.icon} {c.label} <strong>({c.count}건)</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 🔴 미달 고객 */}
              {monthlyReportData.gapDeepAnalysis.shortfall.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid rgba(220,38,38,.3)' }}>
                    🔴 미달 고객 (YTD 달성률 90% 미만, Gap 금액 순)
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {monthlyReportData.gapDeepAnalysis.shortfall.map((c, i) => (
                      <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(254,226,226,0.2)' }}>
                        {/* 헤더 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            <a href="#" onClick={(e) => { e.preventDefault(); if (c.account) setEditingAccount(c.account); }}
                              style={{ color: 'var(--accent)', textDecoration: 'none' }}>{c.name}</a>
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>({c.rep})</span>
                          {c.account?.strategic_tier && (
                            <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg2)', borderRadius: 4, fontWeight: 600 }}>
                              {c.account.strategic_tier}
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>
                            YTD {c.ytdPct}% | Gap -{fmtKRW(c.ytdGap)}
                          </span>
                          {c.yoyGrowth !== null && (
                            <span style={{ fontSize: 10, color: c.yoyGrowth >= 0 ? 'var(--green, #16a34a)' : 'var(--red)', fontWeight: 600 }}>
                              YoY {c.yoyGrowth > 0 ? '+' : ''}{c.yoyGrowth}%
                            </span>
                          )}
                        </div>

                        {/* GAP 분석 내용 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>📌 GAP 분석</div>
                            {c.gap.causes && c.gap.causes.length > 0 ? (
                              <div style={{ marginBottom: 4 }}>
                                <strong>원인:</strong> {c.gap.causes.map(k => {
                                  const cause = GAP_CAUSES.find(g => g.key === k);
                                  return cause ? `${cause.icon} ${cause.label}` : k;
                                }).join(', ')}
                              </div>
                            ) : <div style={{ color: 'var(--text3)', marginBottom: 4 }}>원인 미설정</div>}
                            {c.gap.cause_detail && (
                              <div style={{ marginBottom: 4, padding: 4, background: 'var(--bg)', borderRadius: 4 }}>
                                <strong>상세:</strong> {c.gap.cause_detail}
                              </div>
                            )}
                            {c.gap.countermeasure && (
                              <div style={{ padding: 4, background: 'rgba(220,38,38,.06)', borderRadius: 4, borderLeft: '3px solid var(--red)' }}>
                                <strong style={{ color: 'var(--red)' }}>⚠ 대책:</strong> {c.gap.countermeasure}
                              </div>
                            )}
                            {c.gap.competition_notes && (
                              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text2)' }}>
                                🏁 경쟁: {c.gap.competition_notes}
                              </div>
                            )}
                            {c.gap.opportunities && c.gap.opportunities.length > 0 && (
                              <div style={{ marginTop: 4, fontSize: 10 }}>
                                🔗 Gap 만회 기회 {c.gap.opportunities.length}건 ({fmtKRW(c.gap.opportunities.reduce((s, o) => s + (o.amount || 0) * (o.probability || 0) / 100, 0))} 가중)
                              </div>
                            )}
                          </div>

                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>📊 연관 정보</div>
                            {c.catchUpComment && (
                              <div style={{ marginBottom: 4, padding: 4, background: 'rgba(37,99,235,.08)', borderRadius: 4, borderLeft: '3px solid #2563eb' }}>
                                <strong style={{ color: '#2563eb' }}>📈 FCST:</strong> {c.catchUpComment.text}
                              </div>
                            )}
                            {c.account?.current_context && (
                              <div style={{ marginBottom: 4, fontSize: 10 }}>
                                📝 컨텍스트: {c.account.current_context.slice(0, 80)}{c.account.current_context.length > 80 ? '…' : ''}
                              </div>
                            )}
                            {c.recentIssues.length > 0 && (
                              <div style={{ marginBottom: 4, fontSize: 10 }}>
                                📞 최근 3개월 이슈 ({c.recentIssues.length}):
                                <div style={{ marginTop: 2 }}>
                                  {c.recentIssues.slice(0, 3).map((l, j) => (
                                    <div key={j} style={{ paddingLeft: 4, color: 'var(--text2)' }}>
                                      • [{l.issue_type}] {l.date} — {l.status}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {c.expiringContracts.length > 0 && (
                              <div style={{ marginBottom: 4, fontSize: 10, color: '#d97706' }}>
                                📅 계약 만료 임박: {c.expiringContracts.map(x => `${x.product_category}(D-${x.daysLeft})`).join(', ')}
                              </div>
                            )}
                            {c.csOpportunities.length > 0 && (
                              <div style={{ fontSize: 10 }}>
                                🔗 Cross-selling: {c.csOpportunities.length}건 진행
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 🟢 초과 고객 */}
              {monthlyReportData.gapDeepAnalysis.surplus.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid rgba(22,163,74,.3)' }}>
                    🟢 초과 달성 고객 (YTD 달성률 110% 초과, 초과 금액 순)
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {monthlyReportData.gapDeepAnalysis.surplus.map((c, i) => (
                      <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(220,252,231,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            <a href="#" onClick={(e) => { e.preventDefault(); if (c.account) setEditingAccount(c.account); }}
                              style={{ color: 'var(--accent)', textDecoration: 'none' }}>{c.name}</a>
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>({c.rep})</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--green, #16a34a)' }}>
                            YTD {c.ytdPct}% | 초과 +{fmtKRW(-c.ytdGap)}
                          </span>
                          {c.yoyGrowth !== null && (
                            <span style={{ fontSize: 10, color: c.yoyGrowth >= 0 ? 'var(--green, #16a34a)' : 'var(--red)', fontWeight: 600 }}>
                              YoY {c.yoyGrowth > 0 ? '+' : ''}{c.yoyGrowth}%
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11 }}>
                          {c.gap.cause_detail && (
                            <div style={{ marginBottom: 4 }}>
                              <strong>✅ 초과 원인:</strong> {c.gap.cause_detail}
                            </div>
                          )}
                          {c.gap.countermeasure && (
                            <div style={{ marginBottom: 4, padding: 4, background: 'rgba(22,163,74,.06)', borderRadius: 4, borderLeft: '3px solid var(--green, #16a34a)' }}>
                              <strong style={{ color: 'var(--green, #16a34a)' }}>🚀 지속 발전:</strong> {c.gap.countermeasure}
                            </div>
                          )}
                          {!c.gap.cause_detail && !c.gap.countermeasure && (
                            <div style={{ color: 'var(--text3)', fontSize: 10 }}>
                              ⚠ 초과 달성 원인 미기록 — 고객카드 GAP 분석 탭에서 기록 필요
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 10, padding: '6px 10px', background: 'var(--bg2)', borderRadius: 4 }}>
                ※ 고객명 클릭 시 상세 카드 열림 · FCST catch-up 코멘트는 향후 FCST 합계가 Gap을 만회할 수 있을 때 자동 생성 · 전년 동기 대비 증감률 포함
              </div>
            </div>
          )}

          {/* ══ Page 4 — Next Month Actions ══ */}
          <ChapterHeader
            page={4}
            total={5}
            title="Next Month Actions — 차월 계획 & 팀별 TASK"
            subtitle="다음 달 주요 계획 · 차월 수주 파이프라인 · 계약 만료 · 팀별 TASK"
            color="#7c3aed"
          />

          {/* ══ 섹션 E — 다음 달 사업 계획 (반자동) ══ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">■ 5. 다음 달 주요 계획</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {[
                { key: 'overseas', label: '해외영업팀' },
                { key: 'domestic', label: '국내영업팀' },
                { key: 'support', label: '영업지원팀' },
              ].map(t => (
                <div key={t.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, minWidth: 90, color: 'var(--text2)', marginTop: 4 }}>[{t.label}]</label>
                  <textarea
                    value={nextMonthPlan[t.key] || ''}
                    onChange={e => saveNextMonthPlan({ [t.key]: e.target.value })}
                    placeholder={`${t.label} 다음 달 주요 계획`}
                    rows={2}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical' }}
                  />
                </div>
              ))}
            </div>
            {/* Phase B #8: 차월 수주 파이프라인 (신뢰도 가중) */}
            {monthlyReportData.monthlyPipeline.items.length > 0 && (() => {
              const { items, totalExpected, totalWeighted } = monthlyReportData.monthlyPipeline;
              const p1 = items.filter(x => x.priority === 'P1');
              const p2 = items.filter(x => x.priority === 'P2');
              const p3 = items.filter(x => x.priority === 'P3');
              const sourceMeta = {
                fcst:  { icon: '🔵', bg: '#dbeafe', color: '#1d4ed8', label: 'FCST (80%)' },
                plan:  { icon: '🟢', bg: '#dcfce7', color: '#15803d', label: '사업계획 (60%)' },
                trend: { icon: '🟡', bg: '#fef3c7', color: '#b45309', label: '트렌드 (40%)' },
                other: { icon: '⚪', bg: '#f3f4f6', color: '#6b7280', label: '기타 (30%)' },
              };
              const renderItem = (a, i) => {
                const src = sourceMeta[a.source] || sourceMeta.other;
                const prioColor = a.priority === 'P1' ? 'var(--red)' : a.priority === 'P2' ? '#d97706' : '#6b7280';
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 11, fontWeight: 700, color: prioColor, whiteSpace: 'nowrap' }}>{a.priority}</td>
                    <td style={{ fontSize: 11, fontWeight: 600 }}>
                      {a.account?.id ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); if (a.account) setEditingAccount(a.account); }}
                          style={{ color: 'var(--accent)', textDecoration: 'none' }}>{a.account?.company_name}</a>
                      ) : (a.account?.company_name || '?')}
                    </td>
                    <td style={{ fontSize: 10 }}>
                      <span style={{ padding: '1px 6px', background: src.bg, color: src.color, borderRadius: 3, fontWeight: 600 }}>
                        {src.icon} {src.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text2)' }}>{a.amount > 0 ? fmtKRW(a.amount) : '-'}</td>
                    <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--green, #16a34a)' }}>{a.weighted > 0 ? fmtKRW(a.weighted) : '-'}</td>
                    <td style={{ fontSize: 10, color: 'var(--text3)', maxWidth: 200 }}>{a.msg}</td>
                  </tr>
                );
              };
              return (
                <div style={{ padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>🎯 차월 수주 파이프라인 (신뢰도 가중)</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green, #16a34a)', padding: '2px 8px', background: 'rgba(22,163,74,0.08)', borderRadius: 4 }}>
                      예상 {fmtKRW(totalExpected)} / 가중 {fmtKRW(totalWeighted)} · {items.length}건
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>
                      P1 {p1.length} · P2 {p2.length} · P3 {p3.length}
                    </div>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 300 }}>
                    <table className="data-table" style={{ fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th>우선</th>
                          <th>고객사</th>
                          <th>소스 (신뢰도)</th>
                          <th style={{ textAlign: 'right' }}>예상금액</th>
                          <th style={{ textAlign: 'right' }}>가중금액</th>
                          <th>비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(renderItem)}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, padding: '4px 8px', background: 'var(--bg2)', borderRadius: 4 }}>
                    ※ 신뢰도: FCST 80% / 사업계획 60% / 트렌드 40% · 가중금액 = 예상금액 × 신뢰도 · 우선순위 P1(상위 50%) / P2(~80%) / P3(나머지)
                  </div>
                </div>
              );
            })()}
            {monthlyReportData.contractExpiringSoon.length > 0 && (
              <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706', marginBottom: 6 }}>🟡 계약 만료 임박 (D-60 이내)</div>
                {monthlyReportData.contractExpiringSoon.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text2)' }}>
                    • <strong>{c.company}</strong> — {c.product} / D-{c.daysLeft} ({c.expiry})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══ 섹션 F — 팀별 TASK (Phase C #14) ══ */}
          <TeamTasksSection
            yearMonth={monthlyReportData.selMonthStr}
            teamTasks={teamTasks}
            saveTeamTask={saveTeamTask}
            removeTeamTask={removeTeamTask}
            showToast={showToast}
          />

          {/* ══ Page 5 — Pipeline CRM & Deep Analysis ══ */}
          <ChapterHeader
            page={5}
            total={5}
            title="Pipeline CRM & Deep Analysis — 신규 딜 + 심층 GAP"
            subtitle="Pipeline CRM 하이라이트 (하이브리드 연동) · 심층 Gap 원인 · AM 활동 품질"
            color="#2563eb"
          />

          {/* ══ 섹션 G — Pipeline CRM 신규 딜 하이라이트 (Phase C #15) ══ */}
          {monthlyReportData.pipelineHighlights.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #2563eb' }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>■ 7. Pipeline CRM — 신규 딜 하이라이트</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                  [Proposal/Evaluation/Closing 단계, 상위 {monthlyReportData.pipelineHighlights.length}건]
                </span>
                <a
                  href="https://bioprotech-crm.web.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', background: '#2563eb', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 600 }}
                >
                  Pipeline CRM 열기 ↗
                </a>
              </div>
              <div className="table-wrap" style={{ maxHeight: 280 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>고객사</th>
                      <th>단계</th>
                      <th>품목</th>
                      <th style={{ textAlign: 'right' }}>예상금액</th>
                      <th style={{ textAlign: 'right' }}>확률</th>
                      <th style={{ textAlign: 'right' }}>가중금액</th>
                      <th>예상 종료</th>
                      <th>담당</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReportData.pipelineHighlights.map(d => {
                      const stageBg = d.stage === 'Closing' ? 'rgba(220,38,38,0.1)' : d.stage === 'Evaluation' ? 'rgba(217,119,6,0.1)' : 'rgba(37,99,235,0.1)';
                      const stageColor = d.stage === 'Closing' ? 'var(--red)' : d.stage === 'Evaluation' ? '#d97706' : '#2563eb';
                      return (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 600 }}>{d.company}</td>
                          <td><span style={{ fontSize: 10, padding: '2px 6px', background: stageBg, color: stageColor, borderRadius: 3, fontWeight: 600 }}>{d.stage}</span></td>
                          <td style={{ fontSize: 11 }}>{d.product || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{d.amount > 0 ? fmtKRW(d.amount) : '-'}</td>
                          <td style={{ textAlign: 'right' }}>{d.probability > 0 ? `${d.probability}%` : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green, #16a34a)' }}>
                            {d.amount > 0 && d.probability > 0 ? fmtKRW(d.amount * d.probability / 100) : '-'}
                          </td>
                          <td style={{ fontSize: 10, color: 'var(--text3)' }}>{d.closeDate || '-'}</td>
                          <td style={{ fontSize: 10 }}>{d.sales_rep || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, padding: '4px 8px', background: 'rgba(37,99,235,0.06)', borderRadius: 4 }}>
                ※ Pipeline CRM (신규 딜 관리)의 활성 딜을 실시간 연동 · 상세 관리는 Pipeline CRM에서 진행
              </div>
            </div>
          )}

          {/* ── v3.2: 레거시 Section 1~5 전면 제거 (KPI/차트/분류별/고객별/Cross-Selling/FCST) ──
                    - Section 1 (KPI): 상단 KPI 4카드(수주·매출×MTD·YTD)로 대체됨
                    - Section 2 (차트 HBar/Donut/Progress): 향후 필요 시 1-차트 섹션으로 부활
                    - Section 2b (당월 분류별 상세): 2-3 담당자별 표, 3 팀별 활동으로 대체
                    - Section 3 (고객별 당월): 4-2 고객별 당월 수주 실적으로 대체
                    - Section 4 (Cross-Selling): #11 업셀/크로스 제거 요구사항 반영
                    - Section 5 (FCST vs Actual): 5 차월 수주 파이프라인 + 4-3 FCST catch-up으로 대체
                    ── */}

          {/* ═══════════════════════════════════════════════
             DEEP GAP ANALYSIS (심층 Gap 분석)
             ═══════════════════════════════════════════════ */}
          {gapAnalysisData && (
            <>
              <div className="report-section-title" style={{ marginTop: 20 }}>심층 Gap 분석</div>

              {/* GAP-1: Gap 원인 분석 */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title">Gap 원인 분석</div>
                {gapAnalysisData.causeRanking.length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                    아직 원인 태깅된 고객이 없습니다. 각 고객의 'GAP분석' 탭에서 원인을 태깅하세요.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {gapAnalysisData.causeRanking.map((cause, i) => (
                        <div key={cause.key} style={{
                          padding: '10px 12px', borderRadius: 8,
                          border: i < 3 ? '1px solid var(--red)' : '1px solid var(--border)',
                          background: i < 3 ? 'rgba(220,38,38,.04)' : 'var(--bg3)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{cause.icon} {cause.label}</span>
                            {i < 3 && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>TOP {i + 1}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                            <span style={{ fontWeight: 600 }}>{cause.count}</span>건 |
                            영향금액 <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmtKRW(cause.totalGap)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                            {cause.customers.slice(0, 3).join(', ')}{cause.customers.length > 3 ? ` 외 ${cause.customers.length - 3}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* GAP-2: 고객별 심층 분석 (Gap 상위) */}
              {gapAnalysisData.topGapCustomers.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title">고객별 심층 분석 (Gap 상위 {gapAnalysisData.topGapCustomers.length}개사)</div>
                  <div className="table-wrap" style={{ maxHeight: 400 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>고객명</th>
                          <th>담당</th>
                          <th style={{ textAlign: 'right' }}>YTD Gap</th>
                          <th style={{ textAlign: 'right' }}>달성률</th>
                          <th>원인</th>
                          <th style={{ textAlign: 'right' }}>Score</th>
                          <th>미비 정보</th>
                          <th>액션플랜</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gapAnalysisData.topGapCustomers.map(cg => {
                          const causes = (cg.gapAnalysis?.causes || [])
                            .map(k => GAP_CAUSES.find(c => c.key === k))
                            .filter(Boolean);
                          const missingInfo = gapAnalysisData.getMissingIntelligence(cg.account);
                          const topMissing = missingInfo.slice(0, 2);
                          const actionPlan = (cg.gapAnalysis?.action_plan || []).filter(a => a.text?.trim());
                          const actionDone = actionPlan.filter(a => a.done).length;

                          return (
                            <tr key={cg.key}>
                              <td style={{ fontWeight: 600, fontSize: 11 }}>{cg.name}</td>
                              <td style={{ fontSize: 11 }}>{cg.rep}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 11 }}>{fmtKRW(cg.ytdGap)}</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`score-badge ${pctColor(cg.achieveRate)}`} style={{ fontSize: 10 }}>
                                  {cg.achieveRate}%
                                </span>
                              </td>
                              <td>
                                {causes.length > 0
                                  ? causes.map(c => (
                                      <span key={c.key} style={{ fontSize: 9, marginRight: 3, padding: '1px 4px', borderRadius: 3, background: 'rgba(220,38,38,.08)', color: 'var(--red)' }}>
                                        {c.icon}{c.label}
                                      </span>
                                    ))
                                  : <span style={{ fontSize: 10, color: 'var(--text3)' }}>미분석</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`score-badge ${cg.score >= 70 ? 'green' : cg.score >= 50 ? 'yellow' : 'red'}`} style={{ fontSize: 10 }}>
                                  {cg.score}%
                                </span>
                              </td>
                              <td style={{ fontSize: 10, color: 'var(--text2)', maxWidth: 140 }}>
                                {topMissing.length > 0
                                  ? topMissing.map(m => m.category).join(', ')
                                  : <span style={{ color: 'var(--green)' }}>완비</span>}
                              </td>
                              <td style={{ fontSize: 10 }}>
                                {actionPlan.length > 0
                                  ? <span style={{ color: actionDone === actionPlan.length ? 'var(--green)' : 'var(--yellow)' }}>
                                      {actionDone}/{actionPlan.length} 완료
                                    </span>
                                  : <span style={{ color: 'var(--text3)' }}>미설정</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* GAP-3: 기회 파이프라인 */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>기회 파이프라인 (Gap 만회)</span>
                  {gapAnalysisData.totalOppWeighted > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                      가중합계: {fmtKRW(gapAnalysisData.totalOppWeighted)}
                    </span>
                  )}
                </div>
                {gapAnalysisData.oppSummary.length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                    등록된 기회가 없습니다. 각 고객의 'GAP분석' 탭에서 기회를 등록하세요.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {gapAnalysisData.oppSummary.map(opp => (
                        <div key={opp.key} style={{ textAlign: 'center', padding: 10, background: 'rgba(22,163,74,.04)', borderRadius: 8, border: '1px solid rgba(22,163,74,.15)' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{opp.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', margin: '4px 0' }}>{opp.count}건</div>
                          <div style={{ fontSize: 10, color: 'var(--text2)' }}>총 {fmtKRW(opp.totalAmount)}</div>
                          <div style={{ fontSize: 10, color: 'var(--green)' }}>가중 {fmtKRW(opp.weightedAmount)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Top opportunities */}
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>주요 기회 (가중금액 순)</div>
                    <div className="table-wrap" style={{ maxHeight: 200 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>고객명</th>
                            <th>유형</th>
                            <th>품목</th>
                            <th style={{ textAlign: 'right' }}>예상금액</th>
                            <th style={{ textAlign: 'right' }}>확률</th>
                            <th style={{ textAlign: 'right' }}>가중금액</th>
                            <th>예상시기</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gapAnalysisData.allOpportunities
                            .sort((a, b) => (b.amount * b.probability) - (a.amount * a.probability))
                            .slice(0, 10)
                            .map((opp, i) => {
                              const typeInfo = OPPORTUNITY_TYPES.find(t => t.key === opp.type);
                              return (
                                <tr key={opp.id || i}>
                                  <td style={{ fontWeight: 600, fontSize: 11 }}>{opp.company}</td>
                                  <td><span className="issue-badge" style={{ fontSize: 9 }}>{typeInfo?.label || opp.type}</span></td>
                                  <td style={{ fontSize: 11 }}>{opp.product || '-'}</td>
                                  <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(opp.amount)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <span style={{
                                      fontSize: 10, padding: '1px 5px', borderRadius: 3,
                                      background: opp.probability >= 70 ? 'rgba(22,163,74,.1)' : opp.probability >= 40 ? 'rgba(217,119,6,.1)' : 'rgba(220,38,38,.1)',
                                      color: opp.probability >= 70 ? 'var(--green)' : opp.probability >= 40 ? 'var(--yellow)' : 'var(--red)',
                                    }}>{opp.probability}%</span>
                                  </td>
                                  <td style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
                                    {fmtKRW(opp.amount * opp.probability / 100)}
                                  </td>
                                  <td style={{ fontSize: 10, color: 'var(--text3)' }}>{opp.expected_date || '-'}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* GAP-4: AM별 활동 품질 지표 */}
              {Object.keys(gapAnalysisData.amMetrics).length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title">AM별 활동 품질 지표</div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>담당자</th>
                          <th style={{ textAlign: 'right' }}>고객수</th>
                          <th style={{ textAlign: 'right' }}>90일 컨택</th>
                          <th style={{ textAlign: 'right' }}>고객당 빈도</th>
                          <th style={{ textAlign: 'right' }}>평균 Score</th>
                          <th style={{ textAlign: 'right' }}>YTD 달성률</th>
                          <th>주요 Gap 원인</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(gapAnalysisData.amMetrics)
                          .sort((a, b) => b[1].achieveRate - a[1].achieveRate)
                          .map(([rep, m]) => (
                            <tr key={rep}>
                              <td style={{ fontWeight: 600 }}>{rep}</td>
                              <td style={{ textAlign: 'right' }}>{m.accountCount}</td>
                              <td style={{ textAlign: 'right' }}>{m.contactCount90d}건</td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{ color: m.avgContactFreq >= 2 ? 'var(--green)' : m.avgContactFreq >= 1 ? 'var(--yellow)' : 'var(--red)' }}>
                                  {m.avgContactFreq}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`score-badge ${m.avgScore >= 70 ? 'green' : m.avgScore >= 50 ? 'yellow' : 'red'}`} style={{ fontSize: 10 }}>
                                  {m.avgScore}%
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {m.ytdTarget > 0 ? (
                                  <span className={`score-badge ${pctColor(m.achieveRate)}`} style={{ fontSize: 10 }}>
                                    {m.achieveRate}%
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ fontSize: 10 }}>
                                {m.gapCauses.length > 0
                                  ? m.gapCauses.map(([k, cnt]) => {
                                      const c = GAP_CAUSES.find(gc => gc.key === k);
                                      return <span key={k} style={{ marginRight: 4 }}>{c?.icon}{c?.label}({cnt})</span>;
                                    })
                                  : <span style={{ color: 'var(--text3)' }}>-</span>}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
