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
const CONTRACTS_COL = 'price_contracts';
const FORECASTS_COL = 'forecasts';
const PLANS_COL = 'business_plans';

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
