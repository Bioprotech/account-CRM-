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
  writeBatch,
} from 'firebase/firestore';
import { getApps } from 'firebase/app';

const SNAP_COLLECTION = 'account_snapshots';
const CHUNK_SIZE = 100;
const BATCH_LIMIT = 499;
const DATA_KEYS = ['accounts', 'activityLogs', 'orders', 'contracts', 'forecasts', 'businessPlans'];

function getDb() {
  const apps = getApps();
  if (!apps.length) return null;
  return getFirestore(apps[0]);
}

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function saveSnapshot(name, data) {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다');

  const id = 'snap_' + Date.now();
  const chunkMap = {};
  const writes = [];

  for (const key of DATA_KEYS) {
    const arr = data[key] || [];
    const chunks = chunkArray(arr, CHUNK_SIZE);
    const count = chunks.length || 1;
    chunkMap[key] = count;
    if (chunks.length === 0) {
      writes.push({ ref: doc(db, SNAP_COLLECTION, id, 'chunks', `${key}_0`), payload: { items: [] } });
    } else {
      chunks.forEach((chunk, i) => {
        writes.push({ ref: doc(db, SNAP_COLLECTION, id, 'chunks', `${key}_${i}`), payload: { items: chunk } });
      });
    }
  }

  // 청크를 writeBatch로 분할 저장 (499개 한도)
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH_LIMIT).forEach(w => batch.set(w.ref, w.payload));
    await batch.commit();
  }

  // 메타데이터 메인 문서 저장
  await setDoc(doc(db, SNAP_COLLECTION, id), {
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
    chunkMap,
  });

  return id;
}

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

export async function getSnapshot(id) {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다');

  const ref = doc(db, SNAP_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('스냅샷을 찾을 수 없습니다');

  const meta = snap.data();

  // 구버전 호환: data 필드가 인라인으로 저장된 경우
  if (meta.data && !meta.chunkMap) return meta;

  // 서브컬렉션에서 청크 재조합
  const chunkMap = meta.chunkMap || {};
  const chunksSnap = await getDocs(collection(db, SNAP_COLLECTION, id, 'chunks'));
  const chunkDocs = {};
  chunksSnap.docs.forEach(d => { chunkDocs[d.id] = d.data(); });

  const resultData = {};
  for (const key of DATA_KEYS) {
    const count = chunkMap[key] || 0;
    const items = [];
    for (let i = 0; i < count; i++) {
      const chunk = chunkDocs[`${key}_${i}`];
      if (chunk) items.push(...(chunk.items || []));
    }
    resultData[key] = items;
  }

  return { id: meta.id, name: meta.name, createdAt: meta.createdAt, counts: meta.counts, data: resultData };
}

export async function deleteSnapshot(id) {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다');

  // 서브컬렉션 청크 삭제 (Firestore는 자동 삭제 안 함)
  const chunksSnap = await getDocs(collection(db, SNAP_COLLECTION, id, 'chunks'));
  if (!chunksSnap.empty) {
    const docs = chunksSnap.docs;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  await deleteDoc(doc(db, SNAP_COLLECTION, id));
}
