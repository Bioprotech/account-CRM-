import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { FIREBASE_ENABLED, subscribeAccounts, saveAccountToFirestore, deleteAccountFromFirestore, subscribeActivityLogs, saveActivityLog, deleteActivityLog, subscribeOrders, saveOrder as fbSaveOrder, deleteOrder as fbDeleteOrder, batchSaveOrders, subscribeSales, saveSale as fbSaveSale, deleteSale as fbDeleteSale, batchSaveSales, subscribeContracts, saveContract as fbSaveContract, deleteContract as fbDeleteContract, subscribeForecasts, saveForecast as fbSaveForecast, deleteForecast as fbDeleteForecast, subscribeBusinessPlans, batchSaveBusinessPlans, deleteBusinessPlan as fbDeletePlan, uploadAllData, clearAllData, subscribeSettings, saveSetting } from '../lib/firebase';
import { getSnapshot as fetchSnapshot } from '../lib/snapshots';
import { STORAGE_KEY, AUTH_KEY, DEFAULT_TEAM_MEMBERS, TEAM_STORAGE_KEY } from '../lib/constants';
import { computeIntelligenceScore, getFilteredAccounts, daysSince } from '../lib/utils';

const Ctx = createContext();
export const useAccount = () => useContext(Ctx);

export default function AccountProvider({ children }) {
  /* ── Auth ── */
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY));
      if (saved?.user) {
        setCurrentUser(saved.user);
        setIsAdmin(!!saved.isAdmin);
      }
    } catch {}
  }, []);

  const login = useCallback((name, admin = false) => {
    setCurrentUser(name);
    setIsAdmin(admin);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: name, isAdmin: admin }));
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setIsAdmin(false);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  /* ── Team Members (Firestore 동기화) ── */
  const [teamMembers, setTeamMembersState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY));
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return DEFAULT_TEAM_MEMBERS;
  });

  /* ── App Settings (Firestore 구독) ── */
  const [appSettings, setAppSettings] = useState({});

  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    const unsub = subscribeSettings((data) => {
      setAppSettings(data);
      // Firestore의 teamMembers로 동기화
      if (Array.isArray(data.teamMembers) && data.teamMembers.length > 0) {
        setTeamMembersState(data.teamMembers);
        localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(data.teamMembers));
      }
      // Firestore의 priorYearCustomers로 localStorage 동기화
      if (Array.isArray(data.priorYearCustomers)) {
        localStorage.setItem('bioprotech_account_crm_prior_year_customers', JSON.stringify(data.priorYearCustomers));
      }
    });
    return () => unsub();
  }, []);

  const saveTeamMembers = useCallback(async (members) => {
    const cleaned = members.map(m => m.trim()).filter(Boolean);
    setTeamMembersState(cleaned);
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(cleaned));
    // Firestore에도 저장
    try { await saveSetting('teamMembers', cleaned); } catch (e) { console.error('팀멤버 Firestore 저장 실패:', e); }
  }, []);

  /* ── Accounts ── */
  const [accounts, setAccounts] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sales, setSales] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [businessPlans, setBusinessPlans] = useState([]);
  const [fbStatus, setFbStatus] = useState(FIREBASE_ENABLED ? 'connecting' : 'disabled');

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved?.accounts) setAccounts(saved.accounts);
        if (saved?.activityLogs) setActivityLogs(saved.activityLogs);
        if (saved?.orders) setOrders(saved.orders);
        if (saved?.sales) setSales(saved.sales);
        if (saved?.contracts) setContracts(saved.contracts);
        if (saved?.forecasts) setForecasts(saved.forecasts);
        if (saved?.businessPlans) setBusinessPlans(saved.businessPlans);
      } catch {}
      return;
    }

    const unsub1 = subscribeAccounts((data) => {
      setAccounts(data);
      setFbStatus('connected');
    });
    const unsub2 = subscribeActivityLogs((data) => setActivityLogs(data));
    const unsub3 = subscribeOrders((data) => setOrders(data));
    const unsub4 = subscribeContracts((data) => setContracts(data));
    const unsub5 = subscribeForecasts((data) => setForecasts(data));
    const unsub6 = subscribeBusinessPlans((data) => setBusinessPlans(data));
    const unsub7 = subscribeSales((data) => setSales(data));

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, []);

  // localStorage 백업
  useEffect(() => {
    if (accounts.length || activityLogs.length || orders.length || sales.length || contracts.length || forecasts.length || businessPlans.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts, activityLogs, orders, sales, contracts, forecasts, businessPlans }));
    }
  }, [accounts, activityLogs, orders, sales, contracts, forecasts, businessPlans]);

  /* ── Save / Delete ── */
  const saveAccount = useCallback(async (account) => {
    const updated = { ...account, updated_at: new Date().toISOString().slice(0, 10) };
    // 로컬 업데이트
    setAccounts(prev => {
      const idx = prev.findIndex(a => a.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    if (FIREBASE_ENABLED) {
      try { await saveAccountToFirestore(updated); }
      catch (e) { console.error('계정 저장 실패:', e); showToast('저장 실패', 'error'); }
    }
    showToast('저장 완료', 'success');
  }, []);

  const removeAccount = useCallback(async (id) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    if (FIREBASE_ENABLED) {
      try { await deleteAccountFromFirestore(id); }
      catch (e) { console.error('삭제 실패:', e); }
    }
    // 관련 로그도 삭제
    const relatedLogs = activityLogs.filter(l => l.account_id === id);
    for (const log of relatedLogs) {
      setActivityLogs(prev => prev.filter(l => l.id !== log.id));
      if (FIREBASE_ENABLED) await deleteActivityLog(log.id);
    }
    showToast('삭제 완료', 'success');
  }, [activityLogs]);

  const saveLog = useCallback(async (log) => {
    setActivityLogs(prev => {
      const idx = prev.findIndex(l => l.id === log.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = log;
        return next;
      }
      return [...prev, log];
    });
    if (FIREBASE_ENABLED) {
      try { await saveActivityLog(log); }
      catch (e) { console.error('로그 저장 실패:', e); }
    }
    // 최근 컨택일 업데이트
    setAccounts(prev => prev.map(a =>
      a.id === log.account_id
        ? { ...a, last_contact_date: log.date, updated_at: new Date().toISOString().slice(0, 10) }
        : a
    ));
  }, []);

  const removeLog = useCallback(async (id) => {
    setActivityLogs(prev => prev.filter(l => l.id !== id));
    if (FIREBASE_ENABLED) {
      try { await deleteActivityLog(id); }
      catch (e) { console.error('로그 삭제 실패:', e); }
    }
  }, []);

  /* ── Orders ── */
  const saveOrder = useCallback(async (order) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === order.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = order; return next; }
      return [...prev, order];
    });
    if (FIREBASE_ENABLED) {
      try { await fbSaveOrder(order); } catch (e) { console.error('수주 저장 실패:', e); }
    }
  }, []);

  const removeOrder = useCallback(async (id) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    if (FIREBASE_ENABLED) { try { await fbDeleteOrder(id); } catch {} }
  }, []);

  const importOrders = useCallback(async (newOrders, replaceSource) => {
    // replaceSource가 지정되면 해당 source의 기존 데이터를 교체
    const toRemoveIds = replaceSource
      ? orders.filter(o => o.source === replaceSource).map(o => o.id)
      : [];

    setOrders(prev => {
      const filtered = replaceSource ? prev.filter(o => o.source !== replaceSource) : prev;
      return [...filtered, ...newOrders];
    });

    if (FIREBASE_ENABLED) {
      // 기존 데이터 삭제
      for (const id of toRemoveIds) {
        try { await fbDeleteOrder(id); } catch {}
      }
      // 새 데이터 저장
      try { await batchSaveOrders(newOrders); } catch (e) { console.error('일괄 import 실패:', e); }
    }
    showToast(`${newOrders.length}건 수주이력 import 완료`, 'success');
  }, [orders]);

  const getOrdersForAccount = useCallback((accountId) => {
    return orders.filter(o => o.account_id === accountId).sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''));
  }, [orders]);

  /* ── Sales (매출, B/L date 기준) ── */
  const saveSaleItem = useCallback(async (sale) => {
    setSales(prev => {
      const idx = prev.findIndex(s => s.id === sale.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = sale; return next; }
      return [...prev, sale];
    });
    if (FIREBASE_ENABLED) {
      try { await fbSaveSale(sale); } catch (e) { console.error('매출 저장 실패:', e); }
    }
  }, []);

  const removeSale = useCallback(async (id) => {
    setSales(prev => prev.filter(s => s.id !== id));
    if (FIREBASE_ENABLED) { try { await fbDeleteSale(id); } catch {} }
  }, []);

  const importSales = useCallback(async (newSales, replaceSource) => {
    const toRemoveIds = replaceSource
      ? sales.filter(s => s.source === replaceSource).map(s => s.id)
      : [];

    setSales(prev => {
      const filtered = replaceSource ? prev.filter(s => s.source !== replaceSource) : prev;
      return [...filtered, ...newSales];
    });

    if (FIREBASE_ENABLED) {
      for (const id of toRemoveIds) {
        try { await fbDeleteSale(id); } catch {}
      }
      try { await batchSaveSales(newSales); } catch (e) { console.error('일괄 매출 import 실패:', e); }
    }
    showToast(`${newSales.length}건 매출이력 import 완료`, 'success');
  }, [sales]);

  const getSalesForAccount = useCallback((accountId) => {
    return sales.filter(s => s.account_id === accountId).sort((a, b) => (b.sale_date || '').localeCompare(a.sale_date || ''));
  }, [sales]);

  /* ── Contracts ── */
  const saveContractItem = useCallback(async (contract) => {
    // undefined 값 제거 (Firestore는 undefined를 거부함)
    const clean = JSON.parse(JSON.stringify(contract));
    setContracts(prev => {
      const idx = prev.findIndex(c => c.id === clean.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = clean; return next; }
      return [...prev, clean];
    });
    if (FIREBASE_ENABLED) {
      try { await fbSaveContract(clean); } catch (e) { console.error('계약 저장 실패:', e); }
    }
  }, []);

  const removeContract = useCallback(async (id) => {
    setContracts(prev => prev.filter(c => c.id !== id));
    if (FIREBASE_ENABLED) { try { await fbDeleteContract(id); } catch {} }
  }, []);

  const getContractsForAccount = useCallback((accountId) => {
    return contracts.filter(c => c.account_id === accountId);
  }, [contracts]);

  /* ── Forecasts ── */
  const saveForecast = useCallback(async (forecast) => {
    setForecasts(prev => {
      const idx = prev.findIndex(f => f.id === forecast.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = forecast; return next; }
      return [...prev, forecast];
    });
    if (FIREBASE_ENABLED) {
      try { await fbSaveForecast(forecast); } catch (e) { console.error('Forecast 저장 실패:', e); }
    }
  }, []);

  const removeForecast = useCallback(async (id) => {
    setForecasts(prev => prev.filter(f => f.id !== id));
    if (FIREBASE_ENABLED) { try { await fbDeleteForecast(id); } catch {} }
  }, []);

  const getForecastsForAccount = useCallback((accountId) => {
    return forecasts.filter(f => f.account_id === accountId).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return (a.period || '').localeCompare(b.period || '');
    });
  }, [forecasts]);

  /* ── Business Plans ── */
  const importBusinessPlans = useCallback(async (plans) => {
    // 기존 같은 연도 데이터 교체
    const year = plans[0]?.year;
    setBusinessPlans(prev => [...prev.filter(p => p.year !== year), ...plans]);
    if (FIREBASE_ENABLED) {
      try { await batchSaveBusinessPlans(plans); } catch (e) { console.error('사업계획 import 실패:', e); }
    }
    showToast(`${plans.length}건 사업계획 import 완료`, 'success');
  }, []);

  const clearBusinessPlans = useCallback(async (year) => {
    const toRemove = businessPlans.filter(p => p.year === year);
    setBusinessPlans(prev => prev.filter(p => p.year !== year));
    if (FIREBASE_ENABLED) {
      for (const p of toRemove) {
        try { await fbDeletePlan(p.id); } catch {}
      }
    }
  }, [businessPlans]);

  const getPlansForAccount = useCallback((accountId, year) => {
    return businessPlans.filter(p => p.account_id === accountId && (!year || p.year === year));
  }, [businessPlans]);

  /* ── Filters ── */
  const [filters, setFilters] = useState({
    searchQ: '', region: '', salesRep: '', businessType: '', product: '', scoreRange: '',
  });

  const filteredAccounts = useMemo(
    () => getFilteredAccounts(accounts, filters),
    [accounts, filters]
  );

  const visibleAccounts = useMemo(() => {
    if (isAdmin || !currentUser) return filteredAccounts;
    return filteredAccounts.filter(a => !a.sales_rep || a.sales_rep === currentUser);
  }, [filteredAccounts, currentUser, isAdmin]);

  /* ── Tab & Modal ── */
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [editingAccount, setEditingAccount] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ── Toast ── */
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Derived data ── */
  const getLogsForAccount = useCallback((accountId) => {
    return activityLogs
      .filter(l => l.account_id === accountId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [activityLogs]);

  const openIssues = useMemo(() => {
    return activityLogs.filter(l => l.status !== 'Closed');
  }, [activityLogs]);

  /* ── Alarms ── */
  const alarms = useMemo(() => {
    const result = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // businessPlans에 있는 account_id 목록 (사업계획 고객 판별용)
    const bpAccountIds = new Set(businessPlans.filter(p => p.account_id).map(p => p.account_id));

    accounts.forEach(a => {
      const score = a.intelligence?.total_score ?? 0;
      const noContact = daysSince(a.last_contact_date) > 30;
      const hasBeenUpdated = !!a.last_contact_date || !!a.intelligence?.last_updated;

      // Score < 50% + 미접촉 30일 (한번이라도 업데이트된 계정만)
      if (score < 50 && noContact && hasBeenUpdated) {
        result.push({ type: 'score_contact', level: 'danger', account: a, msg: `Score ${score}% + 미접촉 ${daysSince(a.last_contact_date)}일` });
      }

      // 정보 미입력: 사업계획에는 있지만 score=0, 미접촉인 계정
      if (score === 0 && !a.last_contact_date && bpAccountIds.has(a.id)) {
        result.push({ type: 'data_incomplete', level: 'info', account: a, msg: '정보 미입력 (사업계획 고객)' });
      }

      // 계약 만료 알람
      const acctContracts = contracts.filter(c => c.account_id === a.id && c.contract_expiry);
      acctContracts.forEach(c => {
        const daysLeft = Math.ceil((new Date(c.contract_expiry) - now) / 86400000);
        if (daysLeft <= 30 && daysLeft > 0) {
          result.push({ type: 'contract_expiry', level: daysLeft <= 30 ? 'danger' : 'warning', account: a, msg: `계약 만료 D-${daysLeft} (${c.product_category})` });
        } else if (daysLeft <= 60 && daysLeft > 30) {
          result.push({ type: 'contract_expiry', level: 'warning', account: a, msg: `계약 만료 D-${daysLeft} (${c.product_category})` });
        }
      });

      // ══════════════════════════════════════════════
      // 재구매 임박 알람 (3유형 병행: FCST / 사업계획 / 트렌드)
      // - 각 유형은 독립적으로 알람 생성 (한 고객에 3개 다 뜰 수 있음)
      // - 소스(source) 필드로 구분: 'fcst' | 'plan' | 'trend'
      // ══════════════════════════════════════════════
      const acctOrders = orders.filter(o => o.account_id === a.id && o.order_date).sort((x, y) => x.order_date.localeCompare(y.order_date));
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // ── ① FCST 기반 알람 (🔵 고객 FCST) ──
      const acctForecasts = forecasts.filter(f => f.account_id === a.id && f.order_month);
      for (const f of acctForecasts) {
        let d = null;
        if (f.order_month.length === 7) d = new Date(f.order_month + '-15');
        else if (f.order_month.length <= 2) d = new Date(`${currentYear}-${f.order_month.padStart(2, '0')}-15`);
        if (!d || isNaN(d.getTime())) continue;
        const daysUntil = Math.round((d - now) / 86400000);
        const monthStr = d.toISOString().slice(0, 7);
        // 해당 월에 이미 주문이 있으면 스킵 (발주 완료)
        const hasOrder = acctOrders.some(o => (o.order_date || '').startsWith(monthStr));
        if (hasOrder) continue;
        if (daysUntil <= 0 && daysUntil > -30) {
          result.push({ type: 'reorder', source: 'fcst', level: 'danger', account: a, msg: `🔵 [FCST] 예상월(${monthStr}) 경과 ${Math.abs(daysUntil)}일` });
        } else if (daysUntil > 0 && daysUntil <= 14) {
          result.push({ type: 'reorder', source: 'fcst', level: 'danger', account: a, msg: `🔵 [FCST] 재구매 예상 D-${daysUntil}` });
        } else if (daysUntil > 14 && daysUntil <= 30) {
          result.push({ type: 'reorder', source: 'fcst', level: 'warning', account: a, msg: `🔵 [FCST] 재구매 예상 D-${daysUntil}` });
        }
      }

      // ── ② 사업계획 기반 알람 (🟢 사업계획 타겟) ──
      const acctPlans = businessPlans.filter(p => p.account_id === a.id && p.year === currentYear);
      acctPlans.forEach(p => {
        if (!p.targets) return;
        Object.entries(p.targets).forEach(([monthKey, amount]) => {
          if (!amount || amount <= 0) return;
          const mNum = parseInt(monthKey, 10);
          if (isNaN(mNum) || mNum < 1 || mNum > 12) return;
          // 해당 월 중간(15일) 기준으로 D-day 계산
          const targetDate = new Date(`${currentYear}-${monthKey}-15`);
          const daysUntil = Math.round((targetDate - now) / 86400000);
          const monthStr = `${currentYear}-${monthKey}`;
          // 해당 월에 이미 주문이 있으면 스킵 (달성 완료)
          const monthActual = acctOrders
            .filter(o => (o.order_date || '').startsWith(monthStr))
            .reduce((s, o) => s + (o.order_amount || 0), 0);
          if (monthActual >= amount * 0.8) return; // 80% 이상 달성 시 해제
          if (daysUntil <= 0 && daysUntil > -30 && monthActual < amount) {
            result.push({ type: 'reorder', source: 'plan', level: 'danger', account: a, msg: `🟢 [사업계획] ${mNum}월 타겟 경과 (실적 ${Math.round((monthActual / amount) * 100)}%)` });
          } else if (daysUntil > 0 && daysUntil <= 14) {
            result.push({ type: 'reorder', source: 'plan', level: 'danger', account: a, msg: `🟢 [사업계획] ${mNum}월 타겟 D-${daysUntil}` });
          } else if (daysUntil > 14 && daysUntil <= 30) {
            result.push({ type: 'reorder', source: 'plan', level: 'warning', account: a, msg: `🟢 [사업계획] ${mNum}월 타겟 D-${daysUntil}` });
          }
        });
      });

      // ── ③ 트렌드 기반 알람 (🟡 주문 트렌드) ──
      if (acctOrders.length >= 2) {
        const lastOrder = acctOrders[acctOrders.length - 1];
        const gaps = [];
        for (let i = 1; i < acctOrders.length; i++) {
          const d = (new Date(acctOrders[i].order_date) - new Date(acctOrders[i - 1].order_date)) / 86400000;
          if (d > 0) gaps.push(d);
        }
        if (gaps.length > 0) {
          let weightedSum = 0, weightTotal = 0;
          gaps.forEach((g, idx) => {
            const distFromEnd = gaps.length - 1 - idx;
            const w = distFromEnd === 0 ? 2 : distFromEnd === 1 ? 1.5 : 1;
            weightedSum += g * w;
            weightTotal += w;
          });
          const weightedAvgGap = weightedSum / weightTotal;
          const daysSinceLast = (now - new Date(lastOrder.order_date)) / 86400000;
          const trendDaysUntilNext = Math.round(weightedAvgGap - daysSinceLast);

          // 계절성 체크
          const currentQ = Math.ceil(currentMonth / 3);
          const orderYears = [...new Set(acctOrders.map(o => new Date(o.order_date).getFullYear()))];
          let skipSeasonal = false;
          if (orderYears.length >= 2) {
            const pastYears = orderYears.filter(y => y < currentYear);
            if (pastYears.length >= 2) {
              const qOrders = acctOrders.filter(o => {
                const d = new Date(o.order_date);
                return d.getFullYear() < currentYear && Math.ceil((d.getMonth() + 1) / 3) === currentQ;
              });
              if (qOrders.length === 0) skipSeasonal = true;
            }
          }

          if (!skipSeasonal) {
            if (trendDaysUntilNext <= 14 && trendDaysUntilNext > 0) {
              result.push({ type: 'reorder', source: 'trend', level: 'danger', account: a, msg: `🟡 [트렌드] 재구매 예상 D-${trendDaysUntilNext} (가중평균)` });
            } else if (trendDaysUntilNext <= 30 && trendDaysUntilNext > 14) {
              result.push({ type: 'reorder', source: 'trend', level: 'warning', account: a, msg: `🟡 [트렌드] 재구매 예상 D-${trendDaysUntilNext} (가중평균)` });
            } else if (trendDaysUntilNext <= 0 && trendDaysUntilNext > -30) {
              result.push({ type: 'reorder', source: 'trend', level: 'danger', account: a, msg: `🟡 [트렌드] 예상일 ${Math.abs(trendDaysUntilNext)}일 경과 (가중평균)` });
            }
          }
        }
      }
    });

    // Open 이슈 14일 초과
    activityLogs.filter(l => l.status !== 'Closed').forEach(l => {
      const d = daysSince(l.date);
      if (d > 14) {
        const account = accounts.find(a => a.id === l.account_id);
        result.push({ type: 'overdue_issue', level: 'warning', account: account || { company_name: '?' }, msg: `Open 이슈 ${d}일 경과 (${l.issue_type})` });
      }
    });

    // ── 유형별 맞춤 알람 ──
    accounts.forEach(a => {
      const bt = a.business_type;
      if (!bt) return;
      const acctLogs = activityLogs.filter(l => l.account_id === a.id);
      const lastContact = daysSince(a.last_contact_date);
      const acctOrders = orders.filter(o => o.account_id === a.id && o.order_date);
      const lastOrderDate = acctOrders.length > 0 ? acctOrders.sort((x, y) => y.order_date.localeCompare(x.order_date))[0].order_date : null;
      const daysSinceOrder = lastOrderDate ? Math.floor((now - new Date(lastOrderDate)) / 86400000) : null;

      if (bt === 'OEM') {
        // QBR 분기 리뷰 알람: 분기 시작 후 20일 이내에 QBR 활동 없으면
        const currentQ = Math.ceil((now.getMonth() + 1) / 3);
        const qStart = new Date(now.getFullYear(), (currentQ - 1) * 3, 1);
        const daysSinceQStart = Math.floor((now - qStart) / 86400000);
        if (daysSinceQStart >= 20) {
          const qbrLog = acctLogs.find(l => {
            const d = new Date(l.date);
            return d >= qStart && (l.content || '').toLowerCase().includes('qbr');
          });
          if (!qbrLog) {
            result.push({ type: 'type_action', level: 'warning', account: a, msg: `[OEM] Q${currentQ} QBR 미실시` });
          }
        }
      } else if (bt === 'Single') {
        // 주문 후 사후관리 알람 (7/30/90일)
        if (daysSinceOrder !== null) {
          const hasFollowUp = (days) => acctLogs.some(l => {
            const d = new Date(l.date);
            const orderD = new Date(lastOrderDate);
            const diff = Math.floor((d - orderD) / 86400000);
            return diff >= (days - 5) && diff <= (days + 10);
          });
          if (daysSinceOrder >= 7 && daysSinceOrder < 30 && !hasFollowUp(7)) {
            result.push({ type: 'type_action', level: 'warning', account: a, msg: `[Single] 주문 후 7일 F-up 필요` });
          } else if (daysSinceOrder >= 30 && daysSinceOrder < 90 && !hasFollowUp(30)) {
            result.push({ type: 'type_action', level: 'warning', account: a, msg: `[Single] 주문 후 30일 F-up 필요` });
          } else if (daysSinceOrder >= 90 && !hasFollowUp(90)) {
            result.push({ type: 'type_action', level: 'info', account: a, msg: `[Single] 주문 후 90일 F-up 필요 (재구매 전환 검토)` });
          }
        }
      } else if (bt === 'Multiple') {
        // 주문패턴 분석 미실시 + 60일 이상 미접촉
        if (lastContact > 60) {
          result.push({ type: 'type_action', level: 'warning', account: a, msg: `[Multi] 미접촉 ${lastContact}일 — 리오더 제안 필요` });
        }
      } else if (bt === 'Private') {
        // 월간 판매 리포트 미수신 체크 (30일 이상 활동 없으면)
        if (lastContact > 30) {
          result.push({ type: 'type_action', level: 'info', account: a, msg: `[Private] 월간 판매리포트 확인 필요 (${lastContact}일 미접촉)` });
        }
      } else if (bt === '입찰') {
        // 입찰 후 피드백 미수집
        const bidLogs = acctLogs.filter(l => l.issue_type === '입찰');
        const lastBid = bidLogs.length > 0 ? bidLogs.sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0] : null;
        if (lastBid && daysSince(lastBid.date) > 30) {
          const hasFeedback = acctLogs.some(l => new Date(l.date) > new Date(lastBid.date) && (l.content || '').includes('피드백'));
          if (!hasFeedback) {
            result.push({ type: 'type_action', level: 'info', account: a, msg: `[입찰] 입찰 후 피드백 미수집 (${daysSince(lastBid.date)}일)` });
          }
        }
      } else if (bt === '가격민감') {
        // 경쟁사 가격 모니터링 미실시 (90일 이상)
        const priceLog = acctLogs.find(l => (l.content || '').includes('경쟁사') || (l.content || '').includes('가격'));
        if (!priceLog || daysSince(priceLog.date) > 90) {
          result.push({ type: 'type_action', level: 'info', account: a, msg: `[가격민감] 경쟁사 가격 모니터링 필요` });
        }
      }

      // 체크리스트 미완료 알람 (30% 미만이면)
      const checklist = a.type_checklist || {};
      const guide = { OEM: 5, Private: 5, Multiple: 5, Single: 5, '입찰': 5, '가격민감': 5 };
      const totalItems = guide[bt] || 0;
      if (totalItems > 0) {
        const completed = Object.values(checklist).filter(Boolean).length;
        const pct = Math.round((completed / totalItems) * 100);
        if (pct < 30 && a.last_contact_date) {
          result.push({ type: 'checklist_low', level: 'info', account: a, msg: `[${bt}] 체크리스트 ${pct}% (${completed}/${totalItems})` });
        }
      }
    });

    return result;
  }, [accounts, contracts, orders, activityLogs, businessPlans, forecasts]);

  /* ── Snapshot 복원 ── */
  const restoreSnapshot = useCallback(async (snapshotId) => {
    const snap = await fetchSnapshot(snapshotId);
    const d = snap.data || {};

    // 로컬 상태 업데이트
    if (d.accounts) setAccounts(d.accounts);
    if (d.activityLogs) setActivityLogs(d.activityLogs);
    if (d.orders) setOrders(d.orders);
    if (d.sales) setSales(d.sales);
    if (d.contracts) setContracts(d.contracts);
    if (d.forecasts) setForecasts(d.forecasts);
    if (d.businessPlans) setBusinessPlans(d.businessPlans);

    // localStorage 백업
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accounts: d.accounts || [],
      activityLogs: d.activityLogs || [],
      orders: d.orders || [],
      sales: d.sales || [],
      contracts: d.contracts || [],
      forecasts: d.forecasts || [],
      businessPlans: d.businessPlans || [],
    }));

    // Firestore 전체 교체
    if (FIREBASE_ENABLED) {
      try { await uploadAllData(d); }
      catch (e) { console.error('Firestore 복원 실패:', e); }
    }

    const cnt = d.accounts?.length || 0;
    showToast(`복원 완료: ${cnt}개사 (${snap.name})`, 'success');
  }, []);

  const value = {
    currentUser, isAdmin, login, logout,
    accounts, filteredAccounts, visibleAccounts,
    activityLogs, openIssues,
    orders, sales, contracts, forecasts, businessPlans, alarms,
    filters, setFilters,
    currentTab, setCurrentTab,
    editingAccount, setEditingAccount,
    sidebarOpen, setSidebarOpen,
    saveAccount, removeAccount,
    saveLog, removeLog, getLogsForAccount,
    saveOrder, removeOrder, importOrders, getOrdersForAccount,
    saveSaleItem, removeSale, importSales, getSalesForAccount,
    saveContractItem, removeContract, getContractsForAccount,
    saveForecast, removeForecast, getForecastsForAccount,
    importBusinessPlans, clearBusinessPlans, getPlansForAccount,
    toast, showToast,
    fbStatus,
    teamMembers, saveTeamMembers,
    appSettings,
    restoreSnapshot,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

