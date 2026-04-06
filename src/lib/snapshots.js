import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  orderBy,
  query,
} from 'firebase/firestore';
import { getApps } from 'firebase/app';

const SNAP_COLLECTION = 'account_snapshots';

function getDb() {
  const apps = getApps();
  if (!apps.length) return null;
  return getFirestore(apps[0]);
}

/**
 * 전체 데이터 스냅샷 저장
 * @param {string} name - 스냅샷 이름
 * @param {object} data - { accounts, activityLogs, orders, contracts, forecasts, businessPlans }
 */
export async function saveSnapshot(name, data) {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다');
  const id = 'snap_' + Date.now();
  const ref = doc(db, SNAP_COLLECTION, id);
  await setDoc(ref, {
    id,
    name: name || '무제',
    createdAt: new Date().toISOString(),
    counts: {
      accounts: data.accounts?.length || 0,
      activityLogs: data.activityLogs?.length || 0,
      orders: data.orders?.length || 0,
      contracts: data.contracts?.length || 0,
      forecasts: data.forecasts?.length || 0,
      businessPlans: data.businessPlans?.length || 0,
    },
    data,
  });
  return id;
}

/**
 * 스냅샷 목록 조회 (데이터 본문 제외)
 */
export async function listSnapshots() {
  const db = getDb();
  if (!db) return [];
  const q = query(collection(db, SNAP_COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const raw = d.data();
    return { id: raw.id, name: raw.name, createdAt: raw.createdAt, counts: raw.counts };
  });
}

/**
 * 스냅샷 상세 조회 (데이터 포함)
 */
export async function getSnapshot(id) {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다');
  const ref = doc(db, SNAP_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('스냅샷을 찾을 수 없습니다');
  return snap.data();
}

/**
 * 스냅샷 삭제
 */
export async function deleteSnapshot(id) {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다');
  await deleteDoc(doc(db, SNAP_COLLECTION, id));
}
