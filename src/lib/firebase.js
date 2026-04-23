import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  where,
  orderBy,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC7gMHus8Zl06aV6w1ffIkPO4wuntD7jEY",
  authDomain: "bioprotech-crm.firebaseapp.com",
  projectId: "bioprotech-crm",
  storageBucket: "bioprotech-crm.firebasestorage.app",
  messagingSenderId: "670822980502",
  appId: "1:670822980502:web:c33e816275e063d3c1dbb7",
};

const ACCOUNTS_COL = 'accounts';
const LOGS_COL = 'activity_logs';
const ORDERS_COL = 'order_history';
const SALES_COL = 'sales_history';
const CONTRACTS_COL = 'price_contracts';
const FORECASTS_COL = 'forecasts';
const PLANS_COL = 'business_plans';
const TASKS_COL = 'team_tasks';           // Phase C v3.2 — 팀별 TASK
const PIPELINE_COL = 'customers';          // Phase C v3.2 — Pipeline CRM 하이브리드 (read-only)

let db = null;
export let FIREBASE_ENABLED = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    FIREBASE_ENABLED = true;
    console.log('[Firebase] Firestore 연결됨:', firebaseConfig.projectId);
  }
} catch (e) {
  console.error('[Firebase] 초기화 실패:', e);
}

/* ── Accounts ── */

export function subscribeAccounts(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, ACCOUNTS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] accounts onSnapshot 오류:', err)
  );
}

export async function saveAccountToFirestore(account) {
  if (!FIREBASE_ENABLED) return;
  const ref = doc(db, ACCOUNTS_COL, account.id);
  await setDoc(ref, account);
}

export async function deleteAccountFromFirestore(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, ACCOUNTS_COL, id));
}

/* ── Activity Logs ── */

export function subscribeActivityLogs(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, LOGS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] activity_logs onSnapshot 오류:', err)
  );
}

export async function saveActivityLog(log) {
  if (!FIREBASE_ENABLED) return;
  const ref = doc(db, LOGS_COL, log.id);
  await setDoc(ref, log);
}

export async function deleteActivityLog(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, LOGS_COL, id));
}

/* ── Order History ── */

export function subscribeOrders(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, ORDERS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] order_history onSnapshot 오류:', err)
  );
}

export async function saveOrder(order) {
  if (!FIREBASE_ENABLED) return;
  await setDoc(doc(db, ORDERS_COL, order.id), order);
}

export async function deleteOrder(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, ORDERS_COL, id));
}

export async function batchSaveOrders(orders) {
  if (!FIREBASE_ENABLED) return;
  const CHUNK = 500;
  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(o => batch.set(doc(db, ORDERS_COL, o.id), o));
    await batch.commit();
  }
}

/* ── Sales History (매출, B/L date 기준) ── */

export function subscribeSales(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, SALES_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] sales_history onSnapshot 오류:', err)
  );
}

export async function saveSale(sale) {
  if (!FIREBASE_ENABLED) return;
  await setDoc(doc(db, SALES_COL, sale.id), sale);
}

export async function deleteSale(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, SALES_COL, id));
}

export async function batchSaveSales(sales) {
  if (!FIREBASE_ENABLED) return;
  const CHUNK = 500;
  for (let i = 0; i < sales.length; i += CHUNK) {
    const chunk = sales.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(s => batch.set(doc(db, SALES_COL, s.id), s));
    await batch.commit();
  }
}

/* ── Price Contracts ── */

export function subscribeContracts(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, CONTRACTS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] price_contracts onSnapshot 오류:', err)
  );
}

export async function saveContract(contract) {
  if (!FIREBASE_ENABLED) return;
  await setDoc(doc(db, CONTRACTS_COL, contract.id), contract);
}

export async function deleteContract(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, CONTRACTS_COL, id));
}

/* ── Forecasts ── */

export function subscribeForecasts(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, FORECASTS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] forecasts onSnapshot 오류:', err)
  );
}

export async function saveForecast(forecast) {
  if (!FIREBASE_ENABLED) return;
  await setDoc(doc(db, FORECASTS_COL, forecast.id), forecast);
}

export async function deleteForecast(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, FORECASTS_COL, id));
}

/* ── Business Plans ── */

export function subscribeBusinessPlans(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, PLANS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] business_plans onSnapshot 오류:', err)
  );
}

export async function saveBusinessPlan(plan) {
  if (!FIREBASE_ENABLED) return;
  await setDoc(doc(db, PLANS_COL, plan.id), plan);
}

export async function deleteBusinessPlan(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, PLANS_COL, id));
}

export async function batchSaveBusinessPlans(plans) {
  if (!FIREBASE_ENABLED) return;
  const CHUNK = 500;
  for (let i = 0; i < plans.length; i += CHUNK) {
    const chunk = plans.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(p => batch.set(doc(db, PLANS_COL, p.id), p));
    await batch.commit();
  }
}

/* ── Team Tasks (Phase C v3.2) ── */

export function subscribeTeamTasks(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, TASKS_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] team_tasks onSnapshot 오류:', err)
  );
}

export async function saveTeamTask(task) {
  if (!FIREBASE_ENABLED) return;
  await setDoc(doc(db, TASKS_COL, task.id), task);
}

export async function deleteTeamTask(id) {
  if (!FIREBASE_ENABLED) return;
  await deleteDoc(doc(db, TASKS_COL, id));
}

/* ── Pipeline CRM Customers (read-only 구독, Phase C v3.2) ── */

export function subscribePipelineCustomers(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const col = collection(db, PIPELINE_COL);
  return onSnapshot(col,
    (snap) => callback(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (err) => console.error('[Firebase] pipeline customers onSnapshot 오류:', err)
  );
}

/* ── Batch ── */

export async function uploadAllAccounts(accounts) {
  if (!FIREBASE_ENABLED) throw new Error('Firebase 미설정');
  const CHUNK = 500;
  for (let i = 0; i < accounts.length; i += CHUNK) {
    const chunk = accounts.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(a => batch.set(doc(db, ACCOUNTS_COL, a.id), a));
    await batch.commit();
  }
}

/* ── Snapshot 복원용: 전체 데이터 업로드 ── */

async function batchUpload(colName, items) {
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(item => batch.set(doc(db, colName, item.id), item));
    await batch.commit();
  }
}

async function clearCollection(colName) {
  const snap = await getDocs(collection(db, colName));
  const CHUNK = 500;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * 전체 컬렉션 초기화 후 스냅샷 데이터 업로드
 */
export async function uploadAllData(data) {
  if (!FIREBASE_ENABLED) throw new Error('Firebase 미설정');
  // 기존 데이터 삭제
  await clearAllData();
  // 새 데이터 업로드
  if (data.accounts?.length) await batchUpload(ACCOUNTS_COL, data.accounts);
  if (data.activityLogs?.length) await batchUpload(LOGS_COL, data.activityLogs);
  if (data.orders?.length) await batchUpload(ORDERS_COL, data.orders);
  if (data.sales?.length) await batchUpload(SALES_COL, data.sales);
  if (data.contracts?.length) await batchUpload(CONTRACTS_COL, data.contracts);
  if (data.forecasts?.length) await batchUpload(FORECASTS_COL, data.forecasts);
  if (data.businessPlans?.length) await batchUpload(PLANS_COL, data.businessPlans);
}

/* ── CRM Settings (Firestore 단일 도큐먼트) ── */

const SETTINGS_DOC = 'crm_settings';
const SETTINGS_COLLECTION = 'app_settings';

export function subscribeSettings(callback) {
  if (!FIREBASE_ENABLED) return () => {};
  const ref = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC);
  return onSnapshot(ref,
    (snap) => callback(snap.exists() ? snap.data() : {}),
    (err) => console.error('[Firebase] settings onSnapshot 오류:', err)
  );
}

export async function saveSetting(key, value) {
  if (!FIREBASE_ENABLED) return;
  const ref = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC);
  await setDoc(ref, { [key]: value }, { merge: true });
}

/**
 * 모든 컬렉션 비우기
 */
export async function clearAllData() {
  if (!FIREBASE_ENABLED) throw new Error('Firebase 미설정');
  await Promise.all([
    clearCollection(ACCOUNTS_COL),
    clearCollection(LOGS_COL),
    clearCollection(ORDERS_COL),
    clearCollection(SALES_COL),
    clearCollection(CONTRACTS_COL),
    clearCollection(FORECASTS_COL),
    clearCollection(PLANS_COL),
  ]);
}
