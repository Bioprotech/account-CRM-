import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useAccount } from '../context/AccountContext';
import { genId, today } from '../lib/utils';
import { saveSnapshot, listSnapshots, deleteSnapshot as removeSnapshot } from '../lib/snapshots';
import { savePriorYearCustomers, loadPriorYearCustomers, suggestCustomerCategory } from '../lib/customerClassification';
import { combinedSimilarity, normalizeCompanyName, confidenceLabel } from '../lib/fuzzyMatch';
import { CUSTOMER_CATEGORIES } from '../lib/constants';
import { deleteOrder } from '../lib/firebase';

// v3.4: 엑셀 날짜 시리얼/문자열 → YYYY-MM-DD 변환 (강화)
// 이전 버전은 문자열 그대로 반환 → "4/23/2026" 등 비표준이 주간 범위 비교에서 실패
function excelDateToStr(serial) {
  if (!serial && serial !== 0) return '';
  // Date 객체
  if (serial instanceof Date) {
    if (isNaN(serial.getTime())) return '';
    const y = serial.getFullYear();
    const m = String(serial.getMonth() + 1).padStart(2, '0');
    const d = String(serial.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 숫자 (Excel serial)
  if (typeof serial === 'number') {
    const d = new Date((serial - 25569) * 86400000);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  // 문자열 — 다양한 형식 정규화
  if (typeof serial === 'string') {
    const s = serial.trim();
    if (!s) return '';
    // 이미 ISO YYYY-MM-DD[...]
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    // YYYY/M/D or YYYY.M.D
    let m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    // M/D/YYYY (미국식) or M-D-YYYY
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    // D.M.YYYY (유럽식) - 앞 숫자가 12 초과일 때만 적용
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m && parseInt(m[1], 10) > 12) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // Date 파싱 최후 시도
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }
    return s;
  }
  return '';
}

// 지역명 영→한 매핑
const REGION_EN_TO_KR = {
  'N.America': '북미', 'North America': '북미', 'NA': '북미',
  'Europe': '유럽', 'EU': '유럽',
  'Asia': '아시아',
  'Latin America': '중남미', 'L.America': '중남미', 'S.America': '중남미', 'LATAM': '중남미',
  'M.E.': '중동', 'M.E': '중동', 'Middle East': '중동',
  'Africa': '아프리카',
  'CIS': 'CIS',
  'Korea': '한국', 'Domestic': '한국',
  'Oceania': '아시아',
};
function mapRegion(eng) {
  if (!eng) return '';
  return REGION_EN_TO_KR[eng] || eng;
}

function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}

/* ══════════════════════════════════════════════════════════════════
   v3.12 — 고객 분류 일괄 적용 도구
   account에 customer_category 명시 필드를 일괄 자동 추천 적용
   ══════════════════════════════════════════════════════════════════ */
function BulkClassificationTool({ accounts, businessPlans, appSettings, saveAccount, showToast }) {
  const [analysis, setAnalysis] = useState(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const priorSet = useMemo(() => {
    if (appSettings?.priorYearCustomers && Array.isArray(appSettings.priorYearCustomers)) {
      return new Set(appSettings.priorYearCustomers);
    }
    return loadPriorYearCustomers();
  }, [appSettings]);

  const customerPlansFiltered = useMemo(
    () => (businessPlans || []).filter(p => p.type === 'customer' || !p.type),
    [businessPlans]
  );

  const runAnalysis = async () => {
    setRunning(true);
    setAnalysis(null);
    await new Promise(r => setTimeout(r, 30));
    try {
      // 모든 account에 대해 자동 추천 계산
      const proposals = accounts.map(a => {
        const suggested = suggestCustomerCategory({
          account: a,
          customerPlans: customerPlansFiltered,
          priorSet,
        });
        const current = a.customer_category || 'unclassified';
        const willChange = current !== suggested && (overwriteExisting || current === 'unclassified');
        return { account: a, current, suggested, willChange };
      });

      // 카테고리별 카운트
      const beforeCount = {};
      const afterCount = {};
      CUSTOMER_CATEGORIES.forEach(c => {
        beforeCount[c.key] = 0;
        afterCount[c.key] = 0;
      });
      proposals.forEach(p => {
        beforeCount[p.current] = (beforeCount[p.current] || 0) + 1;
        const finalKey = p.willChange ? p.suggested : p.current;
        afterCount[finalKey] = (afterCount[finalKey] || 0) + 1;
      });

      const willChangeCount = proposals.filter(p => p.willChange).length;
      const unclassifiedNow = proposals.filter(p => p.current === 'unclassified').length;
      const sampleChanges = proposals.filter(p => p.willChange).slice(0, 30);

      setAnalysis({ proposals, beforeCount, afterCount, willChangeCount, unclassifiedNow, sampleChanges });
    } catch (e) {
      console.error(e);
      alert('분석 실패: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const applyAll = async () => {
    if (!analysis) return;
    const targets = analysis.proposals.filter(p => p.willChange);
    if (targets.length === 0) {
      showToast('변경할 항목이 없습니다', 'info');
      return;
    }
    if (!confirm(`${targets.length}개 account의 분류를 자동 추천 값으로 변경하시겠습니까?\n\n${overwriteExisting ? '⚠ 기존 분류도 덮어씌움' : '미분류만 새로 적용'}`)) return;

    setApplying(true);
    try {
      let success = 0;
      for (const t of targets) {
        const updated = { ...t.account, customer_category: t.suggested };
        try {
          await saveAccount(updated);
          success++;
        } catch (e) {
          console.error('account 저장 실패:', t.account.company_name, e);
        }
      }
      showToast(`${success}/${targets.length}개 account 분류 적용 완료`, 'success');
      setAnalysis(null);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #2563eb' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🏷️ 고객 분류 일괄 적용 도구</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
          [account.customer_category 자동 추천 일괄 저장 — 통계 안정화]
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        모든 account에 명시적 분류(<strong>해외고객/국내고객/해외기타/국내기타/해외신규/국내신규</strong>)를 일괄 적용합니다.
        <strong style={{ color: 'var(--accent)' }}> 한 번 저장된 분류는 매번 계산되지 않으므로 통계가 안정적</strong>입니다.
        분류 후 isDomestic 같은 함수가 변해도 통계 영향 없음.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={e => setOverwriteExisting(e.target.checked)}
          />
          기존 분류도 덮어씌움 (추천 권장: 체크 해제 — 미분류만 적용)
        </label>
        <button className="btn btn-primary" onClick={runAnalysis} disabled={running}>
          {running ? '분석 중...' : '🔬 자동 추천 분석'}
        </button>
      </div>

      {analysis && (
        <div>
          {/* 요약 KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
            <div className="kpi" style={{ padding: 10 }}>
              <div className="kpi-label">전체 account</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{accounts.length}사</div>
            </div>
            <div className="kpi" style={{ padding: 10, background: 'rgba(220,38,38,0.06)' }}>
              <div className="kpi-label">현재 미분류</div>
              <div className="kpi-value" style={{ fontSize: 18, color: 'var(--red)' }}>{analysis.unclassifiedNow}사</div>
            </div>
            <div className="kpi green" style={{ padding: 10 }}>
              <div className="kpi-label">변경 예정</div>
              <div className="kpi-value" style={{ fontSize: 18, color: 'var(--green, #16a34a)' }}>{analysis.willChangeCount}사</div>
            </div>
          </div>

          {/* Before / After 분포 */}
          <div style={{ marginBottom: 12, padding: 10, background: 'var(--bg2)', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📊 분류 분포 변화 (Before → After)</div>
            <table className="data-table" style={{ fontSize: 11, width: '100%' }}>
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th style={{ textAlign: 'right' }}>현재</th>
                  <th style={{ textAlign: 'right' }}>적용 후</th>
                  <th style={{ textAlign: 'right' }}>변화</th>
                </tr>
              </thead>
              <tbody>
                {CUSTOMER_CATEGORIES.map(c => {
                  const diff = (analysis.afterCount[c.key] || 0) - (analysis.beforeCount[c.key] || 0);
                  return (
                    <tr key={c.key}>
                      <td>{c.icon} {c.label}</td>
                      <td style={{ textAlign: 'right' }}>{analysis.beforeCount[c.key] || 0}사</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{analysis.afterCount[c.key] || 0}사</td>
                      <td style={{ textAlign: 'right', color: diff > 0 ? 'var(--green, #16a34a)' : diff < 0 ? 'var(--red)' : 'var(--text3)' }}>
                        {diff > 0 ? '+' : ''}{diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 샘플 변경 */}
          {analysis.sampleChanges.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                변경 대상 미리보기 ({analysis.willChangeCount}사 중 상위 30사)
              </summary>
              <div className="table-wrap" style={{ maxHeight: 300, marginTop: 6 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>회사명</th>
                      <th>현재 분류</th>
                      <th>→</th>
                      <th>추천 분류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.sampleChanges.map((p, i) => {
                      const cur = CUSTOMER_CATEGORIES.find(c => c.key === p.current) || CUSTOMER_CATEGORIES[CUSTOMER_CATEGORIES.length - 1];
                      const sug = CUSTOMER_CATEGORIES.find(c => c.key === p.suggested) || CUSTOMER_CATEGORIES[CUSTOMER_CATEGORIES.length - 1];
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.account.company_name}</td>
                          <td style={{ color: 'var(--text3)' }}>{cur.icon} {cur.label}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text3)' }}>→</td>
                          <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{sug.icon} {sug.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* 적용 버튼 */}
          {analysis.willChangeCount > 0 && (
            <div style={{ padding: 10, background: 'rgba(46,125,50,0.06)', borderRadius: 6, marginTop: 8 }}>
              <button
                className="btn btn-primary"
                onClick={applyAll}
                disabled={applying}
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {applying ? '적용 중...' : `💾 ${analysis.willChangeCount}개 account 분류 일괄 적용`}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 10 }}>
                ※ 적용 후에도 개별 고객 카드에서 자유롭게 변경 가능합니다
              </span>
            </div>
          )}
          {analysis.willChangeCount === 0 && (
            <div style={{ padding: 10, background: 'rgba(22,163,74,0.06)', borderRadius: 6, fontSize: 12, color: 'var(--green, #16a34a)', fontWeight: 600 }}>
              ✅ 모든 account가 이미 적절히 분류되어 있습니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.13 — ProMES 영업통계 Import (수주 + 매출)
   ──────────────────────────────────────────────────────────────────
   ProMES 영업통계 리포트의 "원본 Excel" 다운로드를 import.
   기존 영업현황_2026.xlsm (O/S 시트)를 대체.

   파일 구조 (수주.xlsx / 매출.xlsx 동일):
     - 시트명: "원본 데이터" (1개)
     - 헤더: 연도, 분기, 월, 지역코드, 지역명, 거래처코드, 거래처명,
             제품군코드, 제품군명, 건수, 수량, 금액(KRW)
     - 각 행 = 월 × 거래처 × 제품군 집계 (월 단위 정밀도)

   주요 설계:
     - Account 매칭: external_code(거래처코드) 우선 → company_name → alias
     - 미매칭 고객: 자동 신규 생성 + external_code 저장
     - dedupe 키: year-month-account_id-product_code
     - 금액 0원 행 자동 제외 (사용자 확인: 정상수주/매출 인식)
     - 영업담당 필드 부재: classifyForRepView가 plan/account 기반이라 무영향

   영향:
     - ✅ 월간/연간 리포트: 기존과 동일
     - ✅ 담당자별 집계: plan 매칭 + 4 버킷으로 정상 작동
     - ⚠ 주간 리포트 일자 정밀도: 월 첫째 날(YYYY-MM-01)로 정규화
       → "월목표 대비 누적실적" 표시는 정상
   ══════════════════════════════════════════════════════════════════ */
function PromesImportTool({ accounts, saveAccount, orders, sales, importOrders, importSales, showToast }) {
  const orderFileRef = useRef();
  const salesFileRef = useRef();
  const [orderPreview, setOrderPreview] = useState(null);
  const [salesPreview, setSalesPreview] = useState(null);
  const orderParsedRef = useRef(null);
  const salesParsedRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // 기본 연도: 당해 + 전년
  const [importYears, setImportYears] = useState(() => {
    const y = new Date().getFullYear();
    return new Set([String(y), String(y - 1)]);
  });

  // ProMES "원본 데이터" 시트 헤더 매퍼
  const mapPromesHeaders = (headers) => ({
    year: headers.indexOf('연도'),
    quarter: headers.indexOf('분기'),
    month: headers.indexOf('월'),
    regionCode: headers.indexOf('지역코드'),
    regionName: headers.indexOf('지역명'),
    accountCode: headers.indexOf('거래처코드'),
    customerName: headers.indexOf('거래처명'),
    productCode: headers.indexOf('제품군코드'),
    productName: headers.indexOf('제품군명'),
    count: headers.indexOf('건수'),
    quantity: headers.indexOf('수량'),
    amount: headers.indexOf('금액(KRW)') >= 0 ? headers.indexOf('금액(KRW)') : headers.indexOf('금액'),
  });

  // 월 컬럼 정규화: "2026-01" 또는 숫자/문자열 → { yyyy, mm }
  const normalizeMonth = (yearStr, monthVal) => {
    const s = String(monthVal || '').trim();
    const m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return { yyyy: m[1], mm: m[2].padStart(2, '0') };
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 1 && n <= 12) return { yyyy: yearStr, mm: String(n).padStart(2, '0') };
    return { yyyy: yearStr, mm: '' };
  };

  const parseFile = async (file, kind) => {
    showToast(`${file.name} 읽는 중...`, 'info');
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const sheetName = wb.SheetNames.find(s => s === '원본 데이터') || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { showToast('데이터가 없습니다', 'error'); return; }

      const headers = rows[0].map(c => String(c || '').trim());
      const colIdx = mapPromesHeaders(headers);

      // 필수 컬럼 검증
      if (colIdx.year < 0 || colIdx.month < 0 || colIdx.customerName < 0 || colIdx.amount < 0) {
        showToast('필수 컬럼(연도/월/거래처명/금액(KRW)) 부재 — ProMES 원본 형식 확인 필요', 'error');
        return;
      }

      // 금액 0원 자동 제외 + 거래처명 빈 행 제외
      const dataRows = rows.slice(1).filter(r => {
        const customer = String(r[colIdx.customerName] || '').trim();
        const amount = parseFloat(r[colIdx.amount]) || 0;
        return customer && amount > 0;
      });

      // 연도별 분포
      const yearCounts = {};
      dataRows.forEach(r => {
        const y = String(r[colIdx.year] || '').slice(0, 4);
        if (y && y.startsWith('20')) yearCounts[y] = (yearCounts[y] || 0) + 1;
      });

      // Account 매칭 인덱스 (코드 우선)
      const accountByCode = {};
      const accountByName = {};
      accounts.forEach(a => {
        if (a.external_code) accountByCode[String(a.external_code).trim()] = a;
        if (a.company_name) accountByName[a.company_name.toLowerCase().trim()] = a;
        (a.aliases || []).forEach(alias => {
          if (alias) accountByName[String(alias).toLowerCase().trim()] = a;
        });
      });

      // 거래처 단위 매칭 분석 (preview용)
      const customerMap = new Map();
      dataRows.forEach(r => {
        const code = String(r[colIdx.accountCode] || '').trim();
        const name = String(r[colIdx.customerName] || '').trim();
        const regionName = String(r[colIdx.regionName] || '').trim();
        const key = code || name.toLowerCase();
        if (customerMap.has(key)) return;
        const matched = (code && accountByCode[code]) || accountByName[name.toLowerCase().trim()];
        customerMap.set(key, { code, name, regionName, matched: !!matched });
      });

      const matchedCount = [...customerMap.values()].filter(c => c.matched).length;
      const unmatchedCount = customerMap.size - matchedCount;
      const unmatchedNames = [...customerMap.values()].filter(c => !c.matched).map(c => c.name);

      const parsedRef = kind === 'order' ? orderParsedRef : salesParsedRef;
      const setPreview = kind === 'order' ? setOrderPreview : setSalesPreview;

      parsedRef.current = { dataRows, colIdx };
      setPreview({
        fileName: file.name,
        sheetName,
        totalRows: dataRows.length,
        yearCounts,
        matchedCount,
        unmatchedCount,
        unmatchedNames: unmatchedNames.slice(0, 30),
        unmatchedTotal: unmatchedNames.length,
      });

      showToast(`${kind === 'order' ? '수주' : '매출'} 로드 완료: ${dataRows.length.toLocaleString()}건 (금액 0원 행 제외)`, 'success');
    } catch (err) {
      console.error(err);
      showToast('파일 읽기 실패: ' + err.message, 'error');
    }
  };

  const handleOrderFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await parseFile(file, 'order');
  };
  const handleSalesFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await parseFile(file, 'sales');
  };

  const handleImport = async () => {
    if (!orderParsedRef.current && !salesParsedRef.current) {
      showToast('수주 또는 매출 파일을 먼저 선택하세요', 'error');
      return;
    }
    const selectedYears = [...importYears].sort().reverse();
    if (selectedYears.length === 0) {
      alert('연도를 1개 이상 선택하세요');
      return;
    }

    const oCount = orderParsedRef.current?.dataRows?.length || 0;
    const sCount = salesParsedRef.current?.dataRows?.length || 0;

    if (!confirm(
      `📋 ProMES Import 확인\n\n` +
      `▸ 연도: ${selectedYears.join(', ')}\n` +
      `▸ 수주 raw rows: ${oCount.toLocaleString()}건\n` +
      `▸ 매출 raw rows: ${sCount.toLocaleString()}건\n\n` +
      `기존 ProMES import 데이터(source=excel_import_promes_*)는 교체됩니다.\n` +
      `기존 영업현황 import (excel_import_영업현황) 데이터는 영향 없음.\n\n` +
      `계속할까요?`
    )) return;

    setImporting(true);
    try {
      // ── Account 매칭 인덱스 (모든 import 공유) ──
      const accountByCode = {};
      const accountByName = {};
      const accountById = {};
      accounts.forEach(a => {
        if (a.external_code) accountByCode[String(a.external_code).trim()] = a;
        if (a.company_name) accountByName[a.company_name.toLowerCase().trim()] = a;
        (a.aliases || []).forEach(alias => {
          if (alias) accountByName[String(alias).toLowerCase().trim()] = a;
        });
        accountById[a.id] = a;
      });

      // ── 미매칭 고객 자동 생성 (양 파일 union, 선택 연도만) ──
      const newAccountInfo = {};
      const collectMissing = (parsed) => {
        if (!parsed) return;
        const { dataRows, colIdx } = parsed;
        dataRows.forEach(r => {
          const yearStr = String(r[colIdx.year] || '').slice(0, 4);
          if (!importYears.has(yearStr)) return;
          const code = String(r[colIdx.accountCode] || '').trim();
          const name = String(r[colIdx.customerName] || '').trim();
          const regionName = String(r[colIdx.regionName] || '').trim();
          if (!name) return;
          const matched = (code && accountByCode[code]) || accountByName[name.toLowerCase().trim()];
          if (matched) return;
          const key = code || name.toLowerCase().trim();
          if (!newAccountInfo[key]) newAccountInfo[key] = { code, name, regionName };
        });
      };
      collectMissing(orderParsedRef.current);
      collectMissing(salesParsedRef.current);

      const newAccounts = [];
      for (const info of Object.values(newAccountInfo)) {
        const newId = 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const acc = {
          id: newId,
          company_name: info.name,
          external_code: info.code || '',
          country: '',
          region: mapRegion(info.regionName),
          sales_rep: '',
          products: [],
          business_type: '',
          key_contacts: [],
          contract_status: '없음',
          intelligence: { total_score: 0, categories: {}, last_updated: '' },
          last_contact_date: '',
          aliases: [],
          customer_category: 'unclassified',
          created_at: today(),
          updated_at: today(),
        };
        newAccounts.push(acc);
        if (info.code) accountByCode[info.code] = acc;
        accountByName[info.name.toLowerCase().trim()] = acc;
        accountById[newId] = acc;
      }
      for (const acc of newAccounts) await saveAccount(acc);

      // ── external_code 보강 (기존 account에 코드 없으면 채워 넣기) ──
      const codeUpdatesMap = new Map();
      const collectCodeUpdates = (parsed) => {
        if (!parsed) return;
        const { dataRows, colIdx } = parsed;
        dataRows.forEach(r => {
          const code = String(r[colIdx.accountCode] || '').trim();
          const name = String(r[colIdx.customerName] || '').trim();
          if (!code || !name) return;
          const acc = accountByCode[code] || accountByName[name.toLowerCase().trim()];
          if (!acc) return;
          if ((acc.external_code || '').trim() !== code) {
            codeUpdatesMap.set(acc.id, { ...acc, external_code: code, updated_at: today() });
          }
        });
      };
      collectCodeUpdates(orderParsedRef.current);
      collectCodeUpdates(salesParsedRef.current);
      for (const acc of codeUpdatesMap.values()) await saveAccount(acc);

      // v3.15.2: imports[] 추적 제거 (옵션 B — 월 단위 운영, 주간 delta 불필요)
      const importDate = today();

      // ── 수주 build ──
      const newOrders = [];
      if (orderParsedRef.current) {
        const { dataRows, colIdx } = orderParsedRef.current;
        const dedupe = new Map();
        dataRows.forEach(r => {
          const yearStr = String(r[colIdx.year] || '').slice(0, 4);
          if (!importYears.has(yearStr)) return;
          const code = String(r[colIdx.accountCode] || '').trim();
          const name = String(r[colIdx.customerName] || '').trim();
          if (!name) return;
          const acc = (code && accountByCode[code]) || accountByName[name.toLowerCase().trim()];
          if (!acc) return;

          const { yyyy, mm } = normalizeMonth(yearStr, r[colIdx.month]);
          if (!mm) return;

          const productCode = String(r[colIdx.productCode] || '').trim();
          const productName = String(r[colIdx.productName] || '').trim();
          const regionName = String(r[colIdx.regionName] || '').trim();
          const regionCode = String(r[colIdx.regionCode] || '').trim();
          const amount = parseFloat(r[colIdx.amount]) || 0;
          const quantity = parseInt(r[colIdx.quantity]) || 0;
          const count = parseInt(r[colIdx.count]) || 1;
          const quarter = parseInt(r[colIdx.quarter]) || Math.ceil(parseInt(mm, 10) / 3);
          if (amount <= 0) return;

          const dedupeKey = `${yyyy}-${mm}-${acc.id}-${productCode || productName}`;
          const existing = dedupe.get(dedupeKey);
          if (existing) {
            existing.order_amount += amount;
            existing.quantity += quantity;
            existing.count += count;
            return;
          }
          dedupe.set(dedupeKey, {
            id: `ord_promes_${yyyy}${mm}_${acc.id}_${productCode || 'X'}`,
            account_id: acc.id,
            customer_name: acc.company_name || name,
            external_code: code || acc.external_code || '',
            order_number: '',
            order_date: `${yyyy}-${mm}-01`,
            order_month: `${yyyy}-${mm}`,
            year: parseInt(yyyy, 10),
            quarter,
            product_category: productName,
            product_code: productCode,
            order_amount: amount,
            currency: 'KRW',
            quantity,
            count,
            sales_rep: '',
            region: mapRegion(regionName),
            region_code: regionCode,
            country: '',
            status: '',
            source: 'excel_import_promes_O',
            import_date: importDate,
          });
        });
        newOrders.push(...dedupe.values());
      }

      // ── 매출 build ──
      const newSales = [];
      if (salesParsedRef.current) {
        const { dataRows, colIdx } = salesParsedRef.current;
        const dedupe = new Map();
        dataRows.forEach(r => {
          const yearStr = String(r[colIdx.year] || '').slice(0, 4);
          if (!importYears.has(yearStr)) return;
          const code = String(r[colIdx.accountCode] || '').trim();
          const name = String(r[colIdx.customerName] || '').trim();
          if (!name) return;
          const acc = (code && accountByCode[code]) || accountByName[name.toLowerCase().trim()];
          if (!acc) return;

          const { yyyy, mm } = normalizeMonth(yearStr, r[colIdx.month]);
          if (!mm) return;

          const productCode = String(r[colIdx.productCode] || '').trim();
          const productName = String(r[colIdx.productName] || '').trim();
          const regionName = String(r[colIdx.regionName] || '').trim();
          const regionCode = String(r[colIdx.regionCode] || '').trim();
          const amount = parseFloat(r[colIdx.amount]) || 0;
          const quantity = parseInt(r[colIdx.quantity]) || 0;
          const count = parseInt(r[colIdx.count]) || 1;
          const quarter = parseInt(r[colIdx.quarter]) || Math.ceil(parseInt(mm, 10) / 3);
          if (amount <= 0) return;

          const dedupeKey = `${yyyy}-${mm}-${acc.id}-${productCode || productName}`;
          const existing = dedupe.get(dedupeKey);
          if (existing) {
            existing.sale_amount += amount;
            existing.quantity += quantity;
            existing.count += count;
            return;
          }
          dedupe.set(dedupeKey, {
            id: `sal_promes_${yyyy}${mm}_${acc.id}_${productCode || 'X'}`,
            account_id: acc.id,
            customer_name: acc.company_name || name,
            external_code: code || acc.external_code || '',
            order_number: '',
            sale_date: `${yyyy}-${mm}-01`,
            sale_month: `${yyyy}-${mm}`,
            delivery_date: '',
            year: parseInt(yyyy, 10),
            quarter,
            product_category: productName,
            product_code: productCode,
            sale_amount: amount,
            pending_amount: 0,
            currency: 'KRW',
            quantity,
            count,
            sales_rep: '',
            region: mapRegion(regionName),
            region_code: regionCode,
            country: '',
            source: 'excel_import_promes_S',
            import_date: importDate,
          });
        });
        newSales.push(...dedupe.values());
      }

      if (newOrders.length > 0) {
        await importOrders(newOrders, 'excel_import_promes_O');
      }
      if (newSales.length > 0) {
        await importSales(newSales, 'excel_import_promes_S');
      }

      // ── 전년도 고객 목록 갱신 (수주 데이터로 — 분류 자동 추천에 사용) ──
      if (newOrders.length > 0) {
        const priorYear = String(new Date().getFullYear() - 1);
        const priorYearNames = newOrders
          .filter(o => String(o.year) === priorYear)
          .map(o => o.customer_name);
        if (priorYearNames.length > 0) {
          await savePriorYearCustomers(priorYearNames);
        }
      }

      const parts = [];
      if (newOrders.length > 0) parts.push(`수주 ${newOrders.length.toLocaleString()}건`);
      if (newSales.length > 0) parts.push(`매출 ${newSales.length.toLocaleString()}건`);
      if (newAccounts.length > 0) parts.push(`신규 ${newAccounts.length}사`);
      if (codeUpdatesMap.size > 0) parts.push(`코드 갱신 ${codeUpdatesMap.size}사`);
      showToast(`ProMES Import 완료: ${parts.join(' / ')}`, 'success');

      setOrderPreview(null); orderParsedRef.current = null;
      setSalesPreview(null); salesParsedRef.current = null;
    } catch (err) {
      console.error('ProMES Import 실패:', err);
      showToast('Import 실패: ' + err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  // 연도 후보 (양 파일 union)
  const yearCandidates = useMemo(() => {
    const yearSet = new Set();
    if (orderPreview) Object.keys(orderPreview.yearCounts || {}).forEach(y => yearSet.add(y));
    if (salesPreview) Object.keys(salesPreview.yearCounts || {}).forEach(y => yearSet.add(y));
    return [...yearSet].filter(y => y && y.startsWith('20')).sort().reverse();
  }, [orderPreview, salesPreview]);

  const promesOrdersCount = orders.filter(o => o.source === 'excel_import_promes_O').length;
  const promesSalesCount = sales.filter(s => s.source === 'excel_import_promes_S').length;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🆕 ProMES 영업통계 Import (수주 + 매출)</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--green, #16a34a)', padding: '2px 8px', background: 'rgba(22,163,74,0.1)', borderRadius: 12 }}>
          권장 (2026-05~)
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
        ProMES 영업통계 리포트의 <strong>"원본 Excel"</strong> 다운로드를 import합니다.
        수주.xlsx와 매출.xlsx를 별도로 선택하세요. 한쪽만 import도 가능.<br />
        <span style={{ color: 'var(--text3)' }}>
          • 시트명 <code>원본 데이터</code> 자동 감지
          • 거래처코드(C-00xxx)로 자동 매칭, 신규 고객 자동 생성
          • 금액 0원 행 자동 제외 (정상 수주/매출만)
          • dedupe 키: 연도-월-account_id-제품군코드
        </span>
      </p>

      {(promesOrdersCount > 0 || promesSalesCount > 0) && (
        <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(46,125,50,.08)', borderColor: 'rgba(46,125,50,.3)' }}>
          <span>📋</span> ProMES 수주 <strong>{promesOrdersCount.toLocaleString()}건</strong> / 매출 <strong>{promesSalesCount.toLocaleString()}건</strong> import됨
        </div>
      )}

      {/* 두 파일 선택 영역 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* 수주 */}
        <div style={{ padding: 10, background: 'var(--bg2)', borderRadius: 6, border: orderPreview ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>📦 수주 파일</div>
          <input ref={orderFileRef} type="file" accept=".xlsx,.xls" onChange={handleOrderFile} style={{ display: 'none' }} />
          <button className="btn btn-ghost" onClick={() => orderFileRef.current?.click()} style={{ marginBottom: 6, fontSize: 12 }}>
            {orderPreview ? '수주 파일 변경' : '수주 파일 선택'}
          </button>
          {orderPreview ? (
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>{orderPreview.fileName}</div>
              <div>총 <strong>{orderPreview.totalRows.toLocaleString()}건</strong></div>
              <div>매칭 <strong>{orderPreview.matchedCount}사</strong> / 미매칭 <span style={{ color: orderPreview.unmatchedCount > 0 ? 'var(--red)' : 'inherit' }}><strong>{orderPreview.unmatchedCount}사</strong></span></div>
              <button onClick={() => { setOrderPreview(null); orderParsedRef.current = null; }} style={{ fontSize: 10, padding: '2px 6px', marginTop: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}>제거</button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>예: 영업현황_원본_2026-2026_수주.xlsx</div>
          )}
        </div>
        {/* 매출 */}
        <div style={{ padding: 10, background: 'var(--bg2)', borderRadius: 6, border: salesPreview ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>💰 매출 파일</div>
          <input ref={salesFileRef} type="file" accept=".xlsx,.xls" onChange={handleSalesFile} style={{ display: 'none' }} />
          <button className="btn btn-ghost" onClick={() => salesFileRef.current?.click()} style={{ marginBottom: 6, fontSize: 12 }}>
            {salesPreview ? '매출 파일 변경' : '매출 파일 선택'}
          </button>
          {salesPreview ? (
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>{salesPreview.fileName}</div>
              <div>총 <strong>{salesPreview.totalRows.toLocaleString()}건</strong></div>
              <div>매칭 <strong>{salesPreview.matchedCount}사</strong> / 미매칭 <span style={{ color: salesPreview.unmatchedCount > 0 ? 'var(--red)' : 'inherit' }}><strong>{salesPreview.unmatchedCount}사</strong></span></div>
              <button onClick={() => { setSalesPreview(null); salesParsedRef.current = null; }} style={{ fontSize: 10, padding: '2px 6px', marginTop: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}>제거</button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>예: 영업현황_원본_2026-2026_매출.xlsx</div>
          )}
        </div>
      </div>

      {/* 미매칭 고객 미리보기 */}
      {(orderPreview?.unmatchedCount > 0 || salesPreview?.unmatchedCount > 0) && (
        <details style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12, padding: 8, background: 'rgba(220,38,38,0.04)', borderRadius: 4 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            ⚠ 미매칭 고객 ({Math.max(orderPreview?.unmatchedCount || 0, salesPreview?.unmatchedCount || 0)}사) — Import 시 신규 account 자동 생성됨
          </summary>
          {orderPreview?.unmatchedCount > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 600, color: 'var(--text2)' }}>수주 미매칭:</div>
              <div style={{ color: 'var(--text2)' }}>{orderPreview.unmatchedNames.join(', ')}{orderPreview.unmatchedTotal > 30 ? ` 외 ${orderPreview.unmatchedTotal - 30}사` : ''}</div>
            </div>
          )}
          {salesPreview?.unmatchedCount > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 600, color: 'var(--text2)' }}>매출 미매칭:</div>
              <div style={{ color: 'var(--text2)' }}>{salesPreview.unmatchedNames.join(', ')}{salesPreview.unmatchedTotal > 30 ? ` 외 ${salesPreview.unmatchedTotal - 30}사` : ''}</div>
            </div>
          )}
        </details>
      )}

      {/* 연도 선택 */}
      {(orderPreview || salesPreview) && yearCandidates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', padding: 10, background: 'var(--bg2)', borderRadius: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>📅 Import 연도</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>당해+전년 권장</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
            {yearCandidates.map(y => {
              const checked = importYears.has(y);
              const oC = orderPreview?.yearCounts?.[y] || 0;
              const sC = salesPreview?.yearCounts?.[y] || 0;
              return (
                <label key={y} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6,
                  border: checked ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: checked ? 'rgba(46,125,50,0.08)' : 'var(--bg)',
                  cursor: 'pointer', fontSize: 11, fontWeight: checked ? 700 : 400, userSelect: 'none',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => setImportYears(prev => {
                    const next = new Set(prev);
                    if (next.has(y)) next.delete(y); else next.add(y);
                    return next;
                  })} style={{ margin: 0, cursor: 'pointer' }} />
                  <span>{y}년</span>
                  <span style={{ fontSize: 9, color: 'var(--text3)' }}>
                    (수주 {oC.toLocaleString()} / 매출 {sC.toLocaleString()})
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Import 실행 */}
      {(orderPreview || salesPreview) && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing || importYears.size === 0}>
            {importing
              ? 'Import 중...'
              : importYears.size === 0
                ? '⚠ 연도 선택 필요'
                : `${[...importYears].sort().reverse().join('+')} ProMES Import 실행`}
          </button>
          <button className="btn btn-ghost" onClick={() => {
            setOrderPreview(null); orderParsedRef.current = null;
            setSalesPreview(null); salesParsedRef.current = null;
          }} disabled={importing}>전체 취소</button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.14.2 — ProMES Baseline 재설정 도구
   ──────────────────────────────────────────────────────────────────
   v3.14 백필의 문제: imports[0].delta = 누적 amount → 그 한 주에 1~5월
   전체 누적이 몰림. 주간 수주가 비현실적으로 부풀려짐.

   해결: Baseline 개념 도입.
     - 백필 시 imports[0] = { date, amount, delta: 0, _baseline: true }
     - 즉 "이건 historical baseline, 이미 발생한 누적 amount일 뿐"
     - 다음 ProMES Import 시 delta = newAmount - baseline.amount → 진짜 신규 수주

   이 도구는 항상 표시 (이미 잘못 백필된 데이터를 정정하는 용도):
     - 이미 imports[] 있어도 강제로 baseline 1개로 재설정 가능
     - 사용자가 baseline 기준일 선택 (default: 직전 주 일요일 → 모든 주차 분석 범위 밖)
   ══════════════════════════════════════════════════════════════════ */
function PromesBackfillTool({ orders, sales, importOrders, importSales, showToast }) {
  const [running, setRunning] = useState(false);

  // 기본 baseline 일자 = 전년 12/31 (어떤 주차에도 속하지 않도록 가장 안전)
  // 이전 default(직전 주 일요일)는 그 주차 안에 baseline이 잡혀 부풀림이 남는 문제 발생
  // → 전년 마지막 날로 변경: 올해 모든 주차 분석에서 안 보임, 누적 amount는 보존
  const defaultBaselineDate = (() => {
    const now = new Date();
    return `${now.getFullYear() - 1}-12-31`;
  })();
  const [baselineDate, setBaselineDate] = useState(defaultBaselineDate);

  const allPromesOrders = orders.filter(o => o.source === 'excel_import_promes_O');
  const allPromesSales = sales.filter(s => s.source === 'excel_import_promes_S');

  // 이미 baseline 적용된 데이터 카운트 (참고용)
  const baselineDoneOrders = allPromesOrders.filter(o =>
    Array.isArray(o.imports) && o.imports.length > 0 && o.imports[0]._baseline === true
  ).length;
  const baselineDoneSales = allPromesSales.filter(s =>
    Array.isArray(s.imports) && s.imports.length > 0 && s.imports[0]._baseline === true
  ).length;
  const allBaseline = baselineDoneOrders === allPromesOrders.length && baselineDoneSales === allPromesSales.length;

  // ProMES 데이터가 아예 없으면 표시 안 함
  if (allPromesOrders.length === 0 && allPromesSales.length === 0) return null;

  const handleBaseline = async () => {
    if (!confirm(
      `ProMES 데이터의 imports[] 배열을 baseline 1개로 재설정합니다.\n\n` +
      `▸ 수주: ${allPromesOrders.length.toLocaleString()}건\n` +
      `▸ 매출: ${allPromesSales.length.toLocaleString()}건\n` +
      `▸ Baseline 기준일: ${baselineDate}\n\n` +
      `imports[0] = { date: ${baselineDate}, amount: 누적, delta: 0, _baseline: true }\n\n` +
      `※ 이미 백필된 imports[]는 모두 재설정됨\n` +
      `※ 누적 amount(order_amount/sale_amount)는 그대로 보존\n` +
      `※ delta = 0이라 baseline은 주간 리포트에 표시되지 않음\n` +
      `※ 다음 ProMES Import부터 baseline 대비 정확한 주간 delta 추적\n\n` +
      `계속할까요?`
    )) return;
    setRunning(true);
    try {
      const updatedOrders = allPromesOrders.map(o => ({
        ...o,
        imports: [{
          date: baselineDate,
          amount: o.order_amount || 0,
          delta: 0,
          _baseline: true,
        }],
      }));
      const updatedSales = allPromesSales.map(s => ({
        ...s,
        imports: [{
          date: baselineDate,
          amount: s.sale_amount || 0,
          delta: 0,
          _baseline: true,
        }],
      }));

      if (updatedOrders.length > 0) await importOrders(updatedOrders, 'excel_import_promes_O');
      if (updatedSales.length > 0) await importSales(updatedSales, 'excel_import_promes_S');
      showToast(
        `Baseline 재설정 완료: 수주 ${updatedOrders.length.toLocaleString()}건 / 매출 ${updatedSales.length.toLocaleString()}건 (delta=0, ${baselineDate} 기준)`,
        'success'
      );
    } catch (e) {
      console.error('Baseline 실패:', e);
      showToast('Baseline 실패: ' + e.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #f59e0b' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>⏬ ProMES Baseline 재설정</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', padding: '2px 8px', background: 'var(--bg2)', borderRadius: 12 }}>
          {allBaseline ? '✅ 적용됨' : '⚠ 필수 1회 실행'} (v3.14.2)
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
        {!allBaseline && (
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>
            ⚠ 주간 리포트가 비정상이라면 (예: 한 주에 824억 표시) 이 도구로 재설정하세요.<br />
          </span>
        )}
        ProMES 누적 데이터를 <strong>baseline (delta=0)</strong>으로 표시합니다.
        baseline은 주간 분석에서 제외되고, 다음 ProMES Import부터 baseline 대비 정확한 delta(그 주 신규 수주)가 자동 추적됩니다.
        <br />
        <span style={{ color: 'var(--text3)' }}>
          • 매주 월요일에 ProMES 새로 다운 → Import → 그 주의 신규 데이터로 표시
          • 백필을 다시 실행하면 imports[] 전체가 baseline 1개로 reset (안전)
        </span>
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, padding: 10, background: 'var(--bg2)', borderRadius: 6, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>📅 Baseline 기준일:</label>
        <input
          type="date"
          value={baselineDate}
          onChange={e => setBaselineDate(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
        />
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>
          이 날짜를 imports[0].date로 사용 — 주간 분석 시 이 날짜가 속한 주에 표시됨. 보통 직전 주 일요일로 두면 가장 안전.
        </span>
      </div>

      <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
        <span>⏬</span> 대상: ProMES 수주 <strong>{allPromesOrders.length.toLocaleString()}건</strong> / 매출 <strong>{allPromesSales.length.toLocaleString()}건</strong> 전체
        {allBaseline && (
          <span style={{ color: 'var(--green, #16a34a)', marginLeft: 8 }}>
            (현재 모두 baseline 적용됨 — 다시 클릭 시 기준일/누적 amount만 갱신)
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={handleBaseline}
          disabled={running}
          style={{ background: '#f59e0b', color: '#fff' }}
        >
          {running ? '재설정 중...' : `⏬ Baseline 재설정 (${(allPromesOrders.length + allPromesSales.length).toLocaleString()}건, ${baselineDate} 기준)`}
        </button>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            if (!confirm(
              `⚠️ 롤백: 모든 ProMES transaction에서 imports[] 배열을 완전히 제거합니다.\n\n` +
              `▸ 수주: ${allPromesOrders.length.toLocaleString()}건\n` +
              `▸ 매출: ${allPromesSales.length.toLocaleString()}건\n\n` +
              `누적 amount는 그대로 보존, imports[] 추적만 제거됩니다.\n` +
              `주간 리포트는 일자 기반 fallback으로 동작 (ProMES는 5월 데이터가 5/1로 잡혀 주차 분석 불가).\n\n` +
              `v3.14 도입 이전 상태로 돌리는 용도. 계속할까요?`
            )) return;
            setRunning(true);
            try {
              const updatedOrders = allPromesOrders.map(o => {
                const copy = { ...o };
                delete copy.imports;
                return copy;
              });
              const updatedSales = allPromesSales.map(s => {
                const copy = { ...s };
                delete copy.imports;
                return copy;
              });
              if (updatedOrders.length > 0) await importOrders(updatedOrders, 'excel_import_promes_O');
              if (updatedSales.length > 0) await importSales(updatedSales, 'excel_import_promes_S');
              showToast(`롤백 완료: imports[] 제거됨 (수주 ${updatedOrders.length}건 / 매출 ${updatedSales.length}건)`, 'success');
            } catch (e) {
              console.error('롤백 실패:', e);
              showToast('롤백 실패: ' + e.message, 'error');
            } finally {
              setRunning(false);
            }
          }}
          disabled={running}
          style={{ color: 'var(--red)' }}
        >
          {running ? '...' : '⏎ 롤백 (imports[] 완전 제거)'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.13.1 — 기존 영업현황 Import 데이터 정리 도구 (One-time cleanup)
   ──────────────────────────────────────────────────────────────────
   ProMES Import으로 전환 후 영업현황_2026.xlsm 형식 데이터는 더 이상
   필요 없음. ProMES와 이중 집계 방지를 위해 일괄 삭제.

   삭제 대상:
     - source = 'excel_import_영업현황' (수주)
     - source = 'excel_import_영업현황_S' (매출)

   ProMES source (excel_import_promes_O / _S) 데이터는 영향 없음.
   삭제할 데이터가 없으면 카드 자동으로 숨김.
   ══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   v3.17.10 — Manual 수주 데이터 일괄 정리 도구
   ──────────────────────────────────────────────────────────────────
   OrderHistory의 [수주 추가] 버튼이 v3.17.10에서 영구 제거되었으나,
   이전에 입력된 source='manual' 데이터가 DB에 남아 있을 수 있음.
   보고서/대시보드는 source filter로 이미 무시하지만, 데이터 자체도
   깨끗하게 정리.
   ══════════════════════════════════════════════════════════════════ */
function ManualOrderCleanupTool({ orders, showToast }) {
  const [cleaning, setCleaning] = useState(false);
  const manualOrders = (orders || []).filter(o => (o.source || '') === 'manual');
  if (manualOrders.length === 0) return null;
  const totalAmt = manualOrders.reduce((s, o) => s + (o.order_amount || 0), 0);
  const fmt = (n) => {
    if (!n) return '0';
    const abs = Math.abs(n);
    if (abs >= 100000000) return (abs / 100000000).toFixed(1) + '억';
    if (abs >= 10000) return Math.round(abs / 10000).toLocaleString() + '만';
    return Math.round(abs).toLocaleString();
  };
  const handleCleanup = async () => {
    if (!confirm(
      `Manual 입력 수주 데이터를 일괄 삭제합니다.\n\n` +
      `▸ ${manualOrders.length.toLocaleString()}건 / ${fmt(totalAmt)}\n\n` +
      `※ ProMES import 데이터는 영향 없음\n` +
      `※ 이 작업은 되돌릴 수 없습니다\n\n` +
      `계속할까요?`
    )) return;
    setCleaning(true);
    try {
      let ok = 0, fail = 0;
      for (const o of manualOrders) {
        try {
          await deleteOrder(o.id);
          ok++;
        } catch (e) {
          console.error('삭제 실패', o.id, e);
          fail++;
        }
      }
      showToast(`정리 완료: 삭제 ${ok}건${fail > 0 ? ` / 실패 ${fail}건` : ''}`, fail > 0 ? 'warning' : 'success');
    } catch (e) {
      console.error('Manual cleanup 실패:', e);
      showToast('정리 실패: ' + e.message, 'error');
    } finally {
      setCleaning(false);
    }
  };
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--red)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🗑 수동 입력 수주 데이터 정리</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', padding: '2px 8px', background: 'var(--bg2)', borderRadius: 12 }}>
          v3.17.10
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
        AccountModal에서 직접 입력된 <strong>source='manual'</strong> 수주 데이터.<br />
        보고서·대시보드는 이미 source filter로 이런 데이터를 집계에서 제외하지만,<br />
        DB도 정리하려면 아래 버튼 사용. 향후 OrderHistory에서 직접 입력은 불가능 (v3.17.10에서 비활성화).
      </p>
      <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.3)' }}>
        <span>⚠</span> Manual 수주 <strong>{manualOrders.length.toLocaleString()}건</strong> / <strong>{fmt(totalAmt)}</strong> 삭제 예정
      </div>
      <button
        className="btn btn-primary"
        onClick={handleCleanup}
        disabled={cleaning}
        style={{ background: 'var(--red)', color: '#fff' }}
      >
        {cleaning ? '삭제 중...' : `🗑 Manual 수주 일괄 삭제 (${manualOrders.length}건)`}
      </button>
    </div>
  );
}

function LegacyDataCleanupTool({ orders, sales, importOrders, importSales, showToast }) {
  const [cleaning, setCleaning] = useState(false);

  const legacyOrders = orders.filter(o => o.source === 'excel_import_영업현황').length;
  const legacySales = sales.filter(s => s.source === 'excel_import_영업현황_S').length;

  if (legacyOrders === 0 && legacySales === 0) return null;

  const handleCleanup = async () => {
    if (!confirm(
      `기존 영업현황 import 데이터를 모두 삭제합니다.\n\n` +
      `▸ 수주: ${legacyOrders.toLocaleString()}건 (source=excel_import_영업현황)\n` +
      `▸ 매출: ${legacySales.toLocaleString()}건 (source=excel_import_영업현황_S)\n\n` +
      `※ ProMES import 데이터는 영향 없음\n` +
      `※ 이 작업은 되돌릴 수 없습니다\n\n` +
      `계속할까요?`
    )) return;
    setCleaning(true);
    try {
      if (legacyOrders > 0) await importOrders([], 'excel_import_영업현황');
      if (legacySales > 0) await importSales([], 'excel_import_영업현황_S');
      showToast(`정리 완료: 수주 ${legacyOrders.toLocaleString()}건 + 매출 ${legacySales.toLocaleString()}건 삭제`, 'success');
    } catch (e) {
      console.error('Legacy cleanup 실패:', e);
      showToast('정리 실패: ' + e.message, 'error');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--red)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🗑 기존 영업현황 Import 데이터 정리</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', padding: '2px 8px', background: 'var(--bg2)', borderRadius: 12 }}>
          One-time cleanup (v3.13.1)
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
        ProMES Import으로 전환했으므로 <strong>이전 영업현황_2026.xlsm 형식 데이터는 더 이상 필요 없습니다</strong>.<br />
        ProMES와 이중 집계되지 않도록 일괄 정리하세요. 삭제 후 이 카드는 자동으로 사라집니다.
      </p>
      <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.3)' }}>
        <span>⚠</span> 영업현황 수주 <strong>{legacyOrders.toLocaleString()}건</strong> / 매출 <strong>{legacySales.toLocaleString()}건</strong> 삭제 예정
      </div>
      <button
        className="btn btn-primary"
        onClick={handleCleanup}
        disabled={cleaning}
        style={{ background: 'var(--red)', color: '#fff' }}
      >
        {cleaning ? '삭제 중...' : `🗑 영업현황 데이터 일괄 삭제 (${(legacyOrders + legacySales).toLocaleString()}건)`}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.17.3 — Activity Log sales_rep 일괄 정정 도구
   ──────────────────────────────────────────────────────────────────
   본부장(관리자)이 입력/수정한 활동의 sales_rep이 본부장 이름으로 잘못 저장된
   경우를 정정. 각 활동의 sales_rep을 해당 account의 sales_rep으로 일괄 변경.

   대상: activityLogs 중 그 account의 sales_rep과 일치하지 않는 모든 활동
   정정: 해당 account의 sales_rep으로 덮어쓰기 + created_by에 원래 입력자 보존
   ══════════════════════════════════════════════════════════════════ */
function ActivityRepFixTool({ accounts, activityLogs, saveLog, showToast }) {
  const [running, setRunning] = useState(false);

  // 정정 대상 분석
  const accountMap = useMemo(() => {
    const m = {};
    (accounts || []).forEach(a => { m[a.id] = a; });
    return m;
  }, [accounts]);

  const targets = useMemo(() => {
    return (activityLogs || []).filter(l => {
      const acc = accountMap[l.account_id];
      if (!acc || !acc.sales_rep) return false;
      // sales_rep이 빈 값이거나 account의 sales_rep과 다른 경우
      return !l.sales_rep || l.sales_rep !== acc.sales_rep;
    });
  }, [activityLogs, accountMap]);

  // 입력자별 분포 (몇 명이 본부장 이름으로 잘못 저장됐는지)
  const byInputter = useMemo(() => {
    const m = {};
    targets.forEach(l => {
      const inputter = l.sales_rep || '(빈값)';
      m[inputter] = (m[inputter] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [targets]);

  if (targets.length === 0) return null;

  const handleFix = async () => {
    if (!confirm(
      `Activity Log의 sales_rep을 각 고객의 담당자로 일괄 정정합니다.\n\n` +
      `▸ 정정 대상: ${targets.length.toLocaleString()}건\n\n` +
      `각 활동의 원래 입력자는 created_by 필드에 보존됩니다.\n` +
      `정정 후 모든 리포트의 담당자 집계가 그 고객의 담당자 기준으로 표시됩니다.\n\n` +
      `※ 되돌릴 수 없습니다. 계속할까요?`
    )) return;
    setRunning(true);
    try {
      let success = 0;
      for (const l of targets) {
        const acc = accountMap[l.account_id];
        if (!acc || !acc.sales_rep) continue;
        try {
          await saveLog({
            ...l,
            sales_rep: acc.sales_rep,
            // 원래 입력자 보존 (created_by가 없으면 기존 sales_rep을 입력자로 간주)
            created_by: l.created_by || l.sales_rep || '',
          });
          success++;
        } catch (e) {
          console.error('정정 실패:', l.id, e);
        }
      }
      showToast(`정정 완료: ${success}/${targets.length}건`, 'success');
    } catch (e) {
      showToast('정정 실패: ' + e.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #d97706' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>👤 Activity Log 담당자 일괄 정정</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', padding: '2px 8px', background: 'var(--bg2)', borderRadius: 12 }}>
          (v3.17.3)
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
        <strong>본부장이 입력/수정한 활동의 sales_rep이 본부장 이름으로 잘못 저장된 경우</strong>를 정정합니다.<br />
        각 활동의 sales_rep을 해당 <strong>고객의 담당자</strong>로 통일 (원래 입력자는 created_by에 보존).
      </p>
      <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(217,119,6,0.06)', borderColor: 'rgba(217,119,6,0.3)' }}>
        <span>👤</span> 정정 대상: <strong>{targets.length.toLocaleString()}건</strong>
        {byInputter.length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)' }}>
            (현재 잘못 저장된 입력자별: {byInputter.slice(0, 5).map(([k, n]) => `${k}=${n}`).join(', ')}{byInputter.length > 5 ? '...' : ''})
          </span>
        )}
      </div>
      <button
        className="btn btn-primary"
        onClick={handleFix}
        disabled={running}
        style={{ background: '#d97706', color: '#fff' }}
      >
        {running ? '정정 중...' : `👤 ${targets.length}건 sales_rep 일괄 정정`}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.10 — Account 합병 도구 (중복 account 통합)
   ══════════════════════════════════════════════════════════════════ */
function AccountMergeTool({ accounts, orders, sales, businessPlans, mergeAccounts }) {
  const [searchQ, setSearchQ] = useState('');
  const [primaryId, setPrimaryId] = useState('');
  const [secondaryId, setSecondaryId] = useState('');
  const [merging, setMerging] = useState(false);

  // account 통계 계산 (정렬용)
  const accountsWithStats = useMemo(() => {
    return accounts.map(a => {
      const orderCount = orders.filter(o => o.account_id === a.id).length;
      const orderTotal = orders.filter(o => o.account_id === a.id).reduce((s, o) => s + (o.order_amount || 0), 0);
      const saleCount = sales.filter(s => s.account_id === a.id).length;
      const saleTotal = sales.filter(s => s.account_id === a.id).reduce((s, s2) => s + (s2.sale_amount || 0), 0);
      const planCount = businessPlans.filter(p => p.account_id === a.id).length;
      return { ...a, orderCount, orderTotal, saleCount, saleTotal, planCount };
    });
  }, [accounts, orders, sales, businessPlans]);

  // 검색 필터
  const filteredAccounts = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.toLowerCase().trim();
    return accountsWithStats
      .filter(a => (a.company_name || '').toLowerCase().includes(q))
      .sort((a, b) => (b.orderTotal + b.saleTotal) - (a.orderTotal + a.saleTotal));
  }, [accountsWithStats, searchQ]);

  const primary = accountsWithStats.find(a => a.id === primaryId);
  const secondary = accountsWithStats.find(a => a.id === secondaryId);

  const swap = () => {
    setPrimaryId(secondaryId);
    setSecondaryId(primaryId);
  };

  const handleMerge = async () => {
    if (!primary || !secondary) return;
    if (primary.id === secondary.id) {
      alert('서로 다른 account를 선택해주세요.');
      return;
    }
    const confirmMsg = `정말 합병하시겠습니까?\n\n` +
      `▸ 유지: "${primary.company_name}" (${primary.orderCount + primary.saleCount}건 + 새로 ${secondary.orderCount + secondary.saleCount}건 추가)\n` +
      `▸ 삭제: "${secondary.company_name}" (모든 데이터 → 유지 account로 이전)\n\n` +
      `※ 이 작업은 되돌릴 수 없습니다 (수동 재import는 가능)`;
    if (!confirm(confirmMsg)) return;

    setMerging(true);
    try {
      const result = await mergeAccounts(primary.id, secondary.id);
      if (result.success) {
        // 폼 리셋
        setSearchQ('');
        setPrimaryId('');
        setSecondaryId('');
      }
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #16a34a' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🔗 Account 합병 도구</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
          [중복 account 통합 — 수주/매출/활동/계약/사업계획 데이터 모두 이전]
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        같은 회사가 여러 account로 분리되어 있을 때 통합합니다.
        예: "AMBIDERM" + "AMBIDERM Guatemala" → "AMBIDERM" 하나로.
        <strong style={{ color: 'var(--accent)' }}> 합병 후에도 회사명은 고객 카드에서 자유롭게 변경 가능</strong>합니다.
      </p>

      {/* 검색 */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="text"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="회사명 검색 (예: ambiderm, fannin, palupa, tecnologia)"
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 4 }}
        />
      </div>

      {/* 검색 결과 */}
      {searchQ.trim() && filteredAccounts.length > 0 && (
        <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 4, maxHeight: 280, overflow: 'auto' }}>
          <table className="data-table" style={{ fontSize: 11, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>유지 (Primary)</th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>삭제 (Secondary)</th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>회사명</th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)', textAlign: 'right' }}>수주</th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)', textAlign: 'right' }}>매출</th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)', textAlign: 'right' }}>사업계획</th>
                <th style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>지역/담당</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.slice(0, 30).map(a => (
                <tr key={a.id} style={{ background: a.id === primaryId ? 'rgba(22,163,74,0.1)' : a.id === secondaryId ? 'rgba(220,38,38,0.05)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="primary"
                      checked={primaryId === a.id}
                      onChange={() => { setPrimaryId(a.id); if (secondaryId === a.id) setSecondaryId(''); }}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="secondary"
                      checked={secondaryId === a.id}
                      onChange={() => { setSecondaryId(a.id); if (primaryId === a.id) setPrimaryId(''); }}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {a.company_name}
                    {a.planCount > 0 && <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', background: 'var(--accent)', color: '#fff', borderRadius: 3 }}>📋 사업계획</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{a.orderCount > 0 ? `${a.orderCount}건 / ${fmtKRW(a.orderTotal)}` : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{a.saleCount > 0 ? `${a.saleCount}건 / ${fmtKRW(a.saleTotal)}` : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{a.planCount > 0 ? `${a.planCount}개` : '-'}</td>
                  <td style={{ fontSize: 10, color: 'var(--text2)' }}>
                    {(a.region || '-')} / {(a.sales_rep || '-')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 합병 미리보기 */}
      {primary && secondary && (
        <div style={{ padding: 12, background: 'rgba(22,163,74,0.06)', borderRadius: 6, marginBottom: 12, border: '1px solid var(--green, #16a34a)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 8 }}>📋 합병 미리보기</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ padding: 10, background: 'rgba(22,163,74,0.1)', borderRadius: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 4 }}>✓ 유지 (Primary)</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{primary.company_name}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                수주 {primary.orderCount}건, 매출 {primary.saleCount}건
              </div>
            </div>
            <div>
              <button
                onClick={swap}
                style={{ fontSize: 16, padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                title="Primary ↔ Secondary 교체"
              >⇅</button>
            </div>
            <div style={{ padding: 10, background: 'rgba(220,38,38,0.06)', borderRadius: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>✗ 삭제 (Secondary)</div>
              <div style={{ fontSize: 13, fontWeight: 700, textDecoration: 'line-through' }}>{secondary.company_name}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                수주 {secondary.orderCount}건, 매출 {secondary.saleCount}건 → 이전됨
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
            <strong>이전될 데이터:</strong>
            <span style={{ marginLeft: 6 }}>
              수주 {secondary.orderCount}건 ({fmtKRW(secondary.orderTotal)}) ·
              매출 {secondary.saleCount}건 ({fmtKRW(secondary.saleTotal)}) ·
              사업계획 {secondary.planCount}개
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleMerge}
              disabled={merging}
              style={{ background: 'var(--green, #16a34a)' }}
            >
              {merging ? '합병 중...' : `🔗 합병 실행 — "${secondary.company_name}" → "${primary.company_name}"`}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { setPrimaryId(''); setSecondaryId(''); }}
            >취소</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
        💡 사용법: 회사명 검색 → 결과 표에서 "유지(Primary)" 라디오 + "삭제(Secondary)" 라디오 선택 → 미리보기 확인 → 합병 실행.
        Secondary의 모든 수주/매출/활동/계약/FCST/사업계획 데이터가 Primary로 이전된 후 Secondary는 삭제됩니다.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.7 — 사업계획 ↔ 영업현황 정합성 진단
   "수주 104% vs Gap -9.1억" 모순의 정확한 분해 분석
   ══════════════════════════════════════════════════════════════════ */
function ReconciliationDiagnostic({ accounts, orders, sales, businessPlans }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [quarterEnd, setQuarterEnd] = useState(3); // 기본: 1Q (1~3월)

  const run = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    await new Promise(r => setTimeout(r, 30));

    try {
      const yearStr = String(year);
      const months = []; for (let m = 1; m <= quarterEnd; m++) months.push(String(m).padStart(2, '0'));
      const monthSet = new Set(months);

      // ── v3.17.5: source별 데이터 분포 진단 (이중 집계 점검) ──
      const sourceCounts = { promes: 0, legacy: 0, manual: 0, other: 0 };
      const sourceAmounts = { promes: 0, legacy: 0, manual: 0, other: 0 };
      // v3.17.7: "기타" 카테고리 정체 식별 — 실제 source 값별 집계
      const otherSourceDetail = {}; // { 'source_name': { n, amt, samples: [{month, customer, product, amount, id}] } }
      // v3.17.6: 월별 source 분포 + ProMES 내부 중복 점검
      const monthlySource = {}; // { '05': { promes: {n,amt}, legacy: {n,amt}, manual: {n,amt}, other: {n,amt} } }
      const dupKeyMap = {}; // dedupe key 별 건수 — 같은 key 2건 이상이면 ProMES 중복 가능
      months.forEach(m => {
        monthlySource[m] = {
          promes: { n: 0, amt: 0 },
          legacy: { n: 0, amt: 0 },
          manual: { n: 0, amt: 0 },
          other: { n: 0, amt: 0 },
        };
      });
      orders.forEach(o => {
        if (!o.order_date || !o.order_date.startsWith(yearStr + '-')) return;
        const m = o.order_date.slice(5, 7);
        if (!monthSet.has(m)) return;
        const src = o.source || '';
        const amt = o.order_amount || 0;
        let bucket;
        if (src === 'excel_import_promes_O') bucket = 'promes';
        else if (src === 'excel_import_영업현황') bucket = 'legacy';
        else if (!src) bucket = 'manual';
        else bucket = 'other';
        sourceCounts[bucket]++;
        sourceAmounts[bucket] += amt;
        if (monthlySource[m]) {
          monthlySource[m][bucket].n++;
          monthlySource[m][bucket].amt += amt;
        }
        // v3.17.7: "기타"의 실제 source 값 추적
        // v3.17.8: 전체 리스트 보존 + created_by/created_at 노출 (manual 판단 정확도 향상)
        // v3.17.9: account_id → accounts lookup으로 거래처명 복원 (OrderHistory.jsx 버그 우회)
        if (bucket === 'other') {
          const srcKey = src || '(empty)';
          if (!otherSourceDetail[srcKey]) {
            otherSourceDetail[srcKey] = { n: 0, amt: 0, samples: [] };
          }
          otherSourceDetail[srcKey].n++;
          otherSourceDetail[srcKey].amt += amt;
          // 전체 리스트 보존 (50건 초과 시만 sampling)
          if (otherSourceDetail[srcKey].samples.length < 50) {
            // account_id로 거래처명 복원
            const acc = accounts.find(a => a.id === o.account_id);
            const customerResolved = o.customer_name || (acc ? acc.company_name : '');
            const productResolved = o.product_name || o.product_category || o.product_code || '';
            otherSourceDetail[srcKey].samples.push({
              id: o.id,
              month: m,
              date: o.order_date,
              customer: customerResolved,
              account_id: o.account_id || '',
              account_rep: acc ? (acc.sales_rep || '') : '',
              product: productResolved,
              product_category: o.product_category || '',
              product_code: o.product_code || '',
              amount: amt,
              currency: o.currency || '',
              sales_rep: o.sales_rep || '',
              created_by: o.created_by || '',
              updated_by: o.updated_by || '',
              created_at: o.created_at || '',
              updated_at: o.updated_at || '',
              order_number: o.order_number || '',
            });
          }
        }
        // ProMES 내부 중복 점검 (같은 month+account+product 2번 이상)
        if (bucket === 'promes') {
          const key = `${m}|${o.account_id || ''}|${o.product_code || ''}`;
          if (!dupKeyMap[key]) dupKeyMap[key] = { n: 0, amt: 0, samples: [] };
          dupKeyMap[key].n++;
          dupKeyMap[key].amt += amt;
          if (dupKeyMap[key].samples.length < 3) {
            dupKeyMap[key].samples.push({
              id: o.id,
              account_name: o.customer_name || '',
              product_name: o.product_name || '',
              amount: amt,
            });
          }
        }
      });
      const dupEntries = Object.entries(dupKeyMap).filter(([k, v]) => v.n >= 2);
      const dupTotalAmount = dupEntries.reduce((s, [k, v]) => s + v.amt, 0);
      const dupTotalCount = dupEntries.reduce((s, [k, v]) => s + v.n, 0);

      // ── 1. 사업계획 customer plans (YTD target 합계) ──
      const customerPlans = businessPlans.filter(p => (p.type === 'customer' || !p.type) && p.year === Number(yearStr));
      const planByName = {}; // customer_name 기준 그룹
      customerPlans.forEach(p => {
        const name = (p.customer_name || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (!planByName[key]) {
          planByName[key] = {
            name,
            account_id: p.account_id || null,
            ytd_target: 0,
            plans_count: 0,
            is_bucket: ['해외기타', '국내기타', '국내신규', '직판영업', '해외신규'].includes(name),
          };
        }
        planByName[key].plans_count++;
        if (p.account_id) planByName[key].account_id = p.account_id;
        // YTD target 합계 (1~quarterEnd월)
        months.forEach(mKey => {
          planByName[key].ytd_target += (p.targets?.[mKey] || 0);
        });
      });

      const planList = Object.values(planByName);
      const planTotalTarget = planList.reduce((s, p) => s + p.ytd_target, 0);
      const planMatched = planList.filter(p => p.account_id);     // account_id 연결된 plan
      const planUnmatched = planList.filter(p => !p.account_id && !p.is_bucket); // 미매칭 일반 고객
      const planBuckets = planList.filter(p => p.is_bucket);      // 신규/기타 버킷 plan

      // ── 2. 영업현황 actual (YTD orders) ──
      const ytdOrders = orders.filter(o => {
        const d = o.order_date || '';
        if (!d.startsWith(yearStr + '-')) return false;
        const m = d.slice(5, 7);
        return monthSet.has(m);
      });
      const ytdOrderTotal = ytdOrders.reduce((s, o) => s + (o.order_amount || 0), 0);

      // 영업현황 actual을 account별로 분류
      const ytdActualByAccount = {};
      ytdOrders.forEach(o => {
        const aid = o.account_id || `_unmatched_${(o.customer_name || '').toLowerCase().trim()}`;
        ytdActualByAccount[aid] = (ytdActualByAccount[aid] || 0) + (o.order_amount || 0);
      });

      // ── 3. 사업계획 plan별 actual 매칭 ──
      let matchedActual = 0; // 사업계획 매칭된 plan들의 actual 합계
      const planWithActual = planList.map(p => {
        let actual = 0;
        if (p.account_id) {
          // account_id 직접 매칭
          actual = ytdActualByAccount[p.account_id] || 0;
        } else if (!p.is_bucket) {
          // 이름 기반 매칭 (account 찾고 그 account의 actual)
          const acc = accounts.find(a => (a.company_name || '').toLowerCase().trim() === p.name.toLowerCase().trim());
          if (acc) actual = ytdActualByAccount[acc.id] || 0;
        }
        // 버킷 plan은 따로 처리
        return { ...p, actual, gap: p.ytd_target - actual, gapPct: p.ytd_target > 0 ? Math.round((actual / p.ytd_target) * 100) : 0 };
      });

      // 일반 사업계획 고객 (버킷 제외) 합계
      const regularPlans = planWithActual.filter(p => !p.is_bucket);
      const regularPlanActual = regularPlans.reduce((s, p) => s + p.actual, 0);
      const regularPlanTarget = regularPlans.reduce((s, p) => s + p.ytd_target, 0);
      const regularPlanGap = regularPlanTarget - regularPlanActual;

      // 버킷 plan 합계
      const bucketTarget = planBuckets.reduce((s, p) => s + p.ytd_target, 0);
      // 버킷 actual = 사업계획 매칭된 account 외의 actual
      const matchedAccIds = new Set(regularPlans.filter(p => p.account_id).map(p => p.account_id));
      // 이름 기반 매칭된 account도 추가
      regularPlans.filter(p => !p.account_id).forEach(p => {
        const acc = accounts.find(a => (a.company_name || '').toLowerCase().trim() === p.name.toLowerCase().trim());
        if (acc) matchedAccIds.add(acc.id);
      });
      let bucketActual = 0;
      // v3.7.2: 버킷 actual 분해 (사업계획 외 거래처 actual 추적)
      const bucketActualByAccount = {};
      ytdOrders.forEach(o => {
        if (!o.account_id || !matchedAccIds.has(o.account_id)) {
          bucketActual += (o.order_amount || 0);
          const aid = o.account_id || `__noid__${(o.customer_name || '').toLowerCase().trim()}`;
          if (!bucketActualByAccount[aid]) {
            const acc = o.account_id ? accounts.find(a => a.id === o.account_id) : null;
            bucketActualByAccount[aid] = {
              account_id: o.account_id || null,
              customer_name: acc?.company_name || o.customer_name || '?',
              sales_rep: acc?.sales_rep || o.sales_rep || '',
              region: acc?.region || o.region || '',
              total: 0,
              order_count: 0,
            };
          }
          bucketActualByAccount[aid].total += (o.order_amount || 0);
          bucketActualByAccount[aid].order_count++;
        }
      });
      const bucketGap = bucketTarget - bucketActual;
      // 버킷 actual 분해 리스트 (금액 큰 순)
      const bucketActualList = Object.values(bucketActualByAccount).sort((a, b) => b.total - a.total);

      // ── 4. 미달/초과 분류 (GAP 분석 표시 기준 vs 전체) ──
      const shortFallList = regularPlans
        .filter(p => p.ytd_target > 0 && p.gapPct < 90 && p.gap > 0)
        .sort((a, b) => b.gap - a.gap);
      const surplusList = regularPlans
        .filter(p => p.ytd_target > 0 && p.gapPct > 110 && p.gap < 0)
        .sort((a, b) => a.gap - b.gap);
      const normalList = regularPlans
        .filter(p => p.ytd_target > 0 && p.gapPct >= 90 && p.gapPct <= 110);
      // 미달이지만 < 1억 (작은 미달)
      const tinyShort = regularPlans
        .filter(p => p.ytd_target > 0 && p.gapPct < 90 && p.gap > 0 && p.gap < 100000000);

      const top10ShortGap = shortFallList.slice(0, 10).reduce((s, p) => s + p.gap, 0);
      const top5SurplusGap = surplusList.slice(0, 5).reduce((s, p) => s + (-p.gap), 0);
      const top10_5_NetGap = top10ShortGap - top5SurplusGap;

      const allShortGap = shortFallList.reduce((s, p) => s + p.gap, 0);
      const allSurplusGap = surplusList.reduce((s, p) => s + (-p.gap), 0);

      setAnalysis({
        year: yearStr,
        quarterEnd,
        // v3.17.5: source 분포 (이중 집계 점검)
        sourceCounts,
        sourceAmounts,
        // v3.17.6: 월별 source breakdown + ProMES 내부 중복
        monthlySource,
        months,
        dupEntries,
        dupTotalAmount,
        dupTotalCount,
        // v3.17.7: "기타" 정체 식별
        otherSourceDetail,
        // 사업계획 측면
        planList: planWithActual,
        planTotalTarget,
        regularPlanTarget,
        regularPlanActual,
        regularPlanGap,
        bucketTarget,
        bucketActual,
        bucketGap,
        bucketActualList,
        planBucketCount: planBuckets.length,
        planMatchedCount: planMatched.length,
        planUnmatchedCount: planUnmatched.length,
        // 실적 측면 (ProMES + 영업현황 잔여 합산)
        ytdOrderTotal,
        // 분류
        shortFallList,
        surplusList,
        normalList,
        tinyShort,
        top10ShortGap,
        top5SurplusGap,
        top10_5_NetGap,
        allShortGap,
        allSurplusGap,
      });
    } catch (err) {
      console.error(err);
      alert('분석 중 오류: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #dc2626' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>🔬 사업계획 ↔ 실적 정합성 진단</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>[ProMES + 잔여 영업현황 통합 분석]</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        사업계획 target vs 실적(orders) 매칭 / 신규-기타 버킷의 실제 분포 / source별 분포 확인.<br />
        <span style={{ color: 'var(--red)', fontWeight: 600 }}>※ ProMES + 영업현황 잔여 모든 source 합산 — 이중 집계 발생 시 source 분포 카드에서 확인.</span>
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12 }}>
          연도:&nbsp;
          <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '3px 6px', fontSize: 12 }}>
            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          기간:&nbsp;
          <select value={quarterEnd} onChange={e => setQuarterEnd(Number(e.target.value))} style={{ padding: '3px 6px', fontSize: 12 }}>
            <option value={3}>1분기 (1~3월)</option>
            <option value={4}>~ 4월</option>
            <option value={5}>~ 5월</option>
            <option value={6}>2분기 누계 (1~6월)</option>
            <option value={7}>~ 7월</option>
            <option value={8}>~ 8월</option>
            <option value={9}>3분기 누계 (1~9월)</option>
            <option value={10}>~ 10월</option>
            <option value={11}>~ 11월</option>
            <option value={12}>연간 (1~12월)</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={run} disabled={analyzing}>
          {analyzing ? '분석 중...' : '🔬 정합성 진단 시작'}
        </button>
      </div>

      {analysis && (() => {
        const fmt = fmtKRW;
        const overallPct = analysis.planTotalTarget > 0 ? Math.round((analysis.ytdOrderTotal / analysis.planTotalTarget) * 100) : 0;
        const hasDoubleCount = analysis.sourceCounts && analysis.sourceCounts.promes > 0 && analysis.sourceCounts.legacy > 0;
        return (
          <div>
            {/* v3.17.5: 이중 집계 경고 */}
            {hasDoubleCount && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: '2px solid var(--red)', borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>
                  🚨 이중 집계 감지 — 실적 수치가 부풀려져 있습니다!
                </div>
                <div style={{ fontSize: 11, color: 'var(--text)' }}>
                  ProMES 데이터 <strong>{analysis.sourceCounts.promes.toLocaleString()}건 ({fmt(analysis.sourceAmounts.promes)})</strong> +
                  영업현황 잔여 <strong>{analysis.sourceCounts.legacy.toLocaleString()}건 ({fmt(analysis.sourceAmounts.legacy)})</strong>
                  → 동일 거래 중복 가능성<br />
                  <strong style={{ color: 'var(--red)' }}>
                    🔧 즉시 조치: 위쪽 "🗑 영업현황 데이터 일괄 삭제" 카드에서 영업현황 잔여 데이터 제거 권장
                  </strong>
                </div>
              </div>
            )}
            {/* source 분포 (정상도) */}
            {analysis.sourceCounts && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 11 }}>
                <strong style={{ color: 'var(--text)' }}>📊 source 분포 ({analysis.year}년 1~{analysis.quarterEnd}월):</strong>
                {analysis.sourceCounts.promes > 0 && (
                  <span style={{ marginLeft: 8 }}>
                    🆕 ProMES <strong>{analysis.sourceCounts.promes.toLocaleString()}건</strong> ({fmt(analysis.sourceAmounts.promes)})
                  </span>
                )}
                {analysis.sourceCounts.legacy > 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--red)' }}>
                    🗑 영업현황(잔여) <strong>{analysis.sourceCounts.legacy.toLocaleString()}건</strong> ({fmt(analysis.sourceAmounts.legacy)})
                  </span>
                )}
                {analysis.sourceCounts.manual > 0 && (
                  <span style={{ marginLeft: 8 }}>
                    ✋ 수동 <strong>{analysis.sourceCounts.manual.toLocaleString()}건</strong> ({fmt(analysis.sourceAmounts.manual)})
                  </span>
                )}
                {analysis.sourceCounts.other > 0 && (
                  <span style={{ marginLeft: 8 }}>
                    기타 <strong>{analysis.sourceCounts.other.toLocaleString()}건</strong> ({fmt(analysis.sourceAmounts.other)})
                  </span>
                )}
              </div>
            )}

            {/* v3.17.6: 월별 source breakdown — 어느 월에 인플레이션이 있는지 즉시 확인 */}
            {analysis.monthlySource && analysis.months && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📅 월별 source 분포 (이중 집계 위치 즉시 식별)</div>
                <table className="data-table" style={{ fontSize: 10, width: '100%' }}>
                  <thead>
                    <tr>
                      <th>월</th>
                      <th style={{ textAlign: 'right' }}>ProMES 건/금액</th>
                      <th style={{ textAlign: 'right' }}>영업현황(잔여)</th>
                      <th style={{ textAlign: 'right' }}>수동</th>
                      <th style={{ textAlign: 'right' }}>기타</th>
                      <th style={{ textAlign: 'right' }}>월 합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.months.map(m => {
                      const ms = analysis.monthlySource[m] || {};
                      const total = (ms.promes?.amt || 0) + (ms.legacy?.amt || 0) + (ms.manual?.amt || 0) + (ms.other?.amt || 0);
                      const hasDouble = (ms.promes?.n || 0) > 0 && (ms.legacy?.n || 0) > 0;
                      return (
                        <tr key={m} style={hasDouble ? { background: 'rgba(220,38,38,0.06)' } : null}>
                          <td><strong>{m}월</strong>{hasDouble && <span style={{ color: 'var(--red)', marginLeft: 4 }}>🚨</span>}</td>
                          <td style={{ textAlign: 'right' }}>{(ms.promes?.n || 0).toLocaleString()}건 · {fmt(ms.promes?.amt || 0)}</td>
                          <td style={{ textAlign: 'right', color: (ms.legacy?.n || 0) > 0 ? 'var(--red)' : 'inherit' }}>
                            {(ms.legacy?.n || 0).toLocaleString()}건 · {fmt(ms.legacy?.amt || 0)}
                          </td>
                          <td style={{ textAlign: 'right' }}>{(ms.manual?.n || 0).toLocaleString()}건 · {fmt(ms.manual?.amt || 0)}</td>
                          <td style={{ textAlign: 'right' }}>{(ms.other?.n || 0).toLocaleString()}건 · {fmt(ms.other?.amt || 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* v3.17.7: "기타" 카테고리의 실제 source 정체 식별 */}
            {analysis.otherSourceDetail && Object.keys(analysis.otherSourceDetail).length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '2px solid #f59e0b', borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>
                  ⚠ "기타" 카테고리 정체 — {Object.keys(analysis.otherSourceDetail).length}개 source · {analysis.sourceCounts.other}건 · {fmt(analysis.sourceAmounts.other)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text)', marginBottom: 6 }}>
                  ProMES / 영업현황 / 수동 외의 source. 정체를 확인 후 잘못된 데이터면 삭제 필요.
                </div>
                {Object.entries(analysis.otherSourceDetail)
                  .sort((a, b) => b[1].amt - a[1].amt)
                  .map(([src, info]) => {
                    const isManual = src === 'manual' || src === '(empty)';
                    return (
                    <div key={src} style={{ marginBottom: 8, padding: 8, background: 'var(--card)', borderRadius: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'monospace', background: isManual ? 'rgba(37,99,235,0.15)' : 'rgba(245,158,11,0.15)', padding: '1px 6px', borderRadius: 3 }}>
                          source = "{src}"
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          {info.n.toLocaleString()}건 · <strong style={{ color: 'var(--red)' }}>{fmt(info.amt)}</strong>
                        </span>
                        {isManual && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--blue, #2563eb)' }}>
                            ✋ 수동 입력 — 실제 수주일 수 있음, 삭제 신중
                          </span>
                        )}
                      </div>
                      <table style={{ fontSize: 10, width: '100%' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg2)' }}>
                            <th style={{ textAlign: 'left', padding: 3 }}>일자</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>거래처 (lookup)</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>담당자</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>제품/카테고리</th>
                            <th style={{ textAlign: 'right', padding: 3 }}>금액</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>통화</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>주문번호</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>입력자</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>입력일</th>
                            <th style={{ textAlign: 'left', padding: 3 }}>doc id</th>
                          </tr>
                        </thead>
                        <tbody>
                          {info.samples
                            .sort((a, b) => (b.amount || 0) - (a.amount || 0))
                            .map((s, i) => (
                            <tr key={i} style={s.amount > 10000000 ? { background: 'rgba(220,38,38,0.04)' } : null}>
                              <td style={{ padding: 3 }}>{s.date}</td>
                              <td style={{ padding: 3 }}>{s.customer || <span style={{ color: 'var(--text3)' }}>(account: {s.account_id || '—'})</span>}</td>
                              <td style={{ padding: 3 }}>{s.sales_rep || s.account_rep || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                              <td style={{ padding: 3 }}>{s.product || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                              <td style={{ padding: 3, textAlign: 'right', fontWeight: s.amount > 10000000 ? 700 : 400 }}>{fmt(s.amount)}</td>
                              <td style={{ padding: 3 }}>{s.currency || '—'}</td>
                              <td style={{ padding: 3, fontSize: 9 }}>{s.order_number || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                              <td style={{ padding: 3 }}>{s.created_by || s.updated_by || <span style={{ color: 'var(--text3)' }}>(미저장)</span>}</td>
                              <td style={{ padding: 3, fontSize: 9 }}>{(s.created_at || s.updated_at || '').slice(0, 16) || '—'}</td>
                              <td style={{ padding: 3, fontFamily: 'monospace', fontSize: 9 }}>{s.id}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {info.n > 50 && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                          ⚠ 총 {info.n}건 중 50건만 표시
                        </div>
                      )}
                    </div>
                  );
                  })}
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
                  💡 위 source가 잘못된 데이터라면 → 아래 <strong>🗑 "기타" source 일괄 삭제</strong> 버튼 사용
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 8, background: 'var(--red)', color: '#fff', fontSize: 12 }}
                  onClick={async () => {
                    const srcKeys = Object.keys(analysis.otherSourceDetail);
                    const hasManual = srcKeys.includes('manual') || srcKeys.includes('(empty)');
                    const totalN = analysis.sourceCounts.other;
                    const totalAmt = analysis.sourceAmounts.other;
                    const srcList = srcKeys.map(k => `  • "${k}" (${analysis.otherSourceDetail[k].n}건, ${fmt(analysis.otherSourceDetail[k].amt)})`).join('\n');

                    if (hasManual) {
                      const ack = prompt(
                        `⛔ 경고: "manual" source가 포함되어 있습니다!\n\n` +
                        `"manual" = 사용자가 UI에서 직접 입력한 수주 데이터입니다.\n` +
                        `ProMES에 안 잡힌 실제 수주를 수동 입력한 것일 수 있어,\n` +
                        `삭제 시 실제 수주가 사라질 수 있습니다.\n\n` +
                        `삭제 대상:\n${srcList}\n총 ${totalN}건 / ${fmt(totalAmt)}\n\n` +
                        `정말 삭제하려면 아래에 정확히 입력하세요:\n` +
                        `   삭제확정\n\n` +
                        `(취소하려면 빈 칸 또는 다른 글자)`
                      );
                      if (ack !== '삭제확정') {
                        alert('취소되었습니다.');
                        return;
                      }
                    } else {
                      if (!confirm(`다음 source의 데이터를 일괄 삭제하시겠습니까?\n\n${srcList}\n\n총 ${totalN}건 / ${fmt(totalAmt)}\n\n⚠ 되돌릴 수 없습니다.`)) return;
                    }
                    try {
                      const yearStr = analysis.year;
                      const monthSet = new Set(analysis.months);
                      const toDelete = orders.filter(o => {
                        if (!o.order_date || !o.order_date.startsWith(yearStr + '-')) return false;
                        const m = o.order_date.slice(5, 7);
                        if (!monthSet.has(m)) return false;
                        const src = o.source || '';
                        if (src === 'excel_import_promes_O') return false;
                        if (src === 'excel_import_영업현황') return false;
                        if (!src) return false;
                        return true;
                      });
                      let ok = 0, fail = 0;
                      for (const o of toDelete) {
                        try {
                          await deleteOrder(o.id);
                          ok++;
                        } catch (e) {
                          console.error('삭제 실패', o.id, e);
                          fail++;
                        }
                      }
                      alert(`완료: 삭제 ${ok}건 / 실패 ${fail}건. 페이지 새로고침 후 다시 진단해주세요.`);
                    } catch (err) {
                      alert('삭제 실패: ' + err.message);
                    }
                  }}
                >
                  🗑 "기타" source 일괄 삭제 ({analysis.sourceCounts.other}건 / {fmt(analysis.sourceAmounts.other)})
                </button>
              </div>
            )}

            {/* v3.17.6: ProMES 내부 중복 점검 — 같은 month+account+product 2건 이상 */}
            {analysis.dupEntries && analysis.dupEntries.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: '2px solid var(--red)', borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
                  🚨 ProMES 내부 중복 감지 — {analysis.dupEntries.length.toLocaleString()}개 키에 {analysis.dupTotalCount}건 / {fmt(analysis.dupTotalAmount)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text)', marginBottom: 6 }}>
                  동일 (월 + 거래처 + 제품) 조합이 2건 이상 — ProMES 재임포트 시 기존 데이터 미삭제로 인한 중복 가능성. 상위 10개:
                </div>
                <table className="data-table" style={{ fontSize: 10, width: '100%' }}>
                  <thead>
                    <tr>
                      <th>키 (월|account_id|product_code)</th>
                      <th style={{ textAlign: 'right' }}>건수</th>
                      <th style={{ textAlign: 'right' }}>합계</th>
                      <th>예시 (고객 / 제품 / 금액)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.dupEntries
                      .sort((a, b) => b[1].amt - a[1].amt)
                      .slice(0, 10)
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td style={{ fontFamily: 'monospace', fontSize: 9 }}>{k}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{v.n}건</td>
                          <td style={{ textAlign: 'right' }}>{fmt(v.amt)}</td>
                          <td style={{ fontSize: 9 }}>
                            {v.samples.map((s, i) => (
                              <div key={i}>{s.account_name} / {s.product_name} / {fmt(s.amount)}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 핵심 KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
              <div className="kpi" style={{ padding: 10 }}>
                <div className="kpi-label">사업계획 YTD 총 목표</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmt(analysis.planTotalTarget)}</div>
              </div>
              <div className="kpi accent" style={{ padding: 10 }}>
                <div className="kpi-label">YTD 총 실적 (모든 source 합산)</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fmt(analysis.ytdOrderTotal)}</div>
                {analysis.sourceCounts && (analysis.sourceCounts.promes > 0 || analysis.sourceCounts.legacy > 0) && (
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                    ProMES {analysis.sourceCounts.promes}건 · 영업현황(잔여) {analysis.sourceCounts.legacy}건
                  </div>
                )}
              </div>
              <div className={`kpi ${overallPct >= 100 ? 'green' : overallPct >= 80 ? '' : 'red'}`} style={{ padding: 10 }}>
                <div className="kpi-label">총 달성률</div>
                <div className="kpi-value" style={{ fontSize: 22 }}>{overallPct}%</div>
              </div>
              <div className="kpi" style={{ padding: 10 }}>
                <div className="kpi-label">총 차액</div>
                <div className="kpi-value" style={{ fontSize: 18, color: analysis.ytdOrderTotal >= analysis.planTotalTarget ? 'var(--green, #16a34a)' : 'var(--red)' }}>
                  {analysis.ytdOrderTotal >= analysis.planTotalTarget ? '+' : ''}{fmt(analysis.ytdOrderTotal - analysis.planTotalTarget)}
                </div>
              </div>
            </div>

            {/* 분해 표 */}
            <div style={{ padding: 12, background: 'var(--bg2)', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📐 사업계획 Target 분해 ({analysis.year}년 {analysis.quarterEnd === 3 ? '1Q' : `~${analysis.quarterEnd}월`} YTD)</div>
              <table className="data-table" style={{ fontSize: 11, width: '100%' }}>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th style={{ textAlign: 'right' }}>Target</th>
                    <th style={{ textAlign: 'right' }}>Actual</th>
                    <th style={{ textAlign: 'right' }}>Gap</th>
                    <th style={{ textAlign: 'right' }}>달성률</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>📋 일반 사업계획 고객 ({analysis.planList.filter(p => !p.is_bucket).length}사)</td>
                    <td style={{ textAlign: 'right' }}>{fmt(analysis.regularPlanTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(analysis.regularPlanActual)}</td>
                    <td style={{ textAlign: 'right', color: analysis.regularPlanGap > 0 ? 'var(--red)' : 'var(--green, #16a34a)' }}>
                      {analysis.regularPlanGap > 0 ? '-' : '+'}{fmt(Math.abs(analysis.regularPlanGap))}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {analysis.regularPlanTarget > 0 ? Math.round((analysis.regularPlanActual / analysis.regularPlanTarget) * 100) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td>🪣 버킷 plan ({analysis.planBucketCount}건: 해외기타/국내신규/국내기타/직판영업)</td>
                    <td style={{ textAlign: 'right' }}>{fmt(analysis.bucketTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(analysis.bucketActual)}</td>
                    <td style={{ textAlign: 'right', color: analysis.bucketGap > 0 ? 'var(--red)' : 'var(--green, #16a34a)' }}>
                      {analysis.bucketGap > 0 ? '-' : '+'}{fmt(Math.abs(analysis.bucketGap))}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {analysis.bucketTarget > 0 ? Math.round((analysis.bucketActual / analysis.bucketTarget) * 100) : 0}%
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(46,125,50,0.08)', fontWeight: 700 }}>
                    <td>합계</td>
                    <td style={{ textAlign: 'right' }}>{fmt(analysis.planTotalTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(analysis.ytdOrderTotal)}</td>
                    <td style={{ textAlign: 'right', color: (analysis.ytdOrderTotal - analysis.planTotalTarget) >= 0 ? 'var(--green, #16a34a)' : 'var(--red)' }}>
                      {(analysis.ytdOrderTotal - analysis.planTotalTarget) >= 0 ? '+' : ''}{fmt(analysis.ytdOrderTotal - analysis.planTotalTarget)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{overallPct}%</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                ※ 일반 plan = 개별 고객 plan, 버킷 = "해외기타" 등 그룹 plan
              </div>
            </div>

            {/* v3.7.2: 버킷 actual 7.9억의 정체 분해 (어떤 거래처가 가져왔는지) */}
            {analysis.bucketActualList && analysis.bucketActualList.length > 0 && (
              <details open style={{ marginBottom: 12, padding: 10, background: 'rgba(217,119,6,0.04)', borderRadius: 6, border: '1px solid #d97706' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#b45309' }}>
                  🔬 버킷 actual {fmt(analysis.bucketActual)}의 정체 — {analysis.bucketActualList.length}개 거래처 분해
                </summary>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                  사업계획에 매칭되지 않은 모든 영업현황 수주의 거래처별 분포. 월간 리포트 ■2-3의 신규/기타와 다른 이유를 여기서 확인 가능.
                </div>
                <div className="table-wrap" style={{ maxHeight: 400 }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>거래처명</th>
                        <th>담당자 (sales_rep)</th>
                        <th>지역</th>
                        <th style={{ textAlign: 'right' }}>YTD 수주</th>
                        <th style={{ textAlign: 'right' }}>건수</th>
                        <th>account_id 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.bucketActualList.slice(0, 50).map((b, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{b.customer_name}</td>
                          <td>{b.sales_rep || <span style={{ color: 'var(--red)' }}>미배정</span>}</td>
                          <td>{b.region || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(b.total)}</td>
                          <td style={{ textAlign: 'right' }}>{b.order_count}</td>
                          <td style={{ fontSize: 10 }}>
                            {b.account_id
                              ? <span style={{ color: 'var(--green, #16a34a)' }}>✓ {b.account_id.slice(0, 12)}...</span>
                              : <span style={{ color: 'var(--red)' }}>✗ NULL (계정 미생성)</span>}
                          </td>
                        </tr>
                      ))}
                      {analysis.bucketActualList.length > 50 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)' }}>외 {analysis.bucketActualList.length - 50}건</td></tr>
                      )}
                      <tr style={{ background: 'rgba(217,119,6,0.08)', fontWeight: 700 }}>
                        <td colSpan={4}>합계 (Top 50)</td>
                        <td style={{ textAlign: 'right' }}>{fmt(analysis.bucketActualList.slice(0, 50).reduce((s, b) => s + b.total, 0))}</td>
                        <td style={{ textAlign: 'right' }}>{analysis.bucketActualList.slice(0, 50).reduce((s, b) => s + b.order_count, 0)}</td>
                        <td>(전체 합계 {fmt(analysis.bucketActual)})</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                  💡 이 거래처들의 sales_rep이 사업계획 담당자와 일치하면, 월간 리포트 ■2-3에서는 해당 담당자 행에 포함되어 신규/기타 버킷에는 안 나타남.
                </div>
              </details>
            )}

            {/* GAP 분석 임계값 분류 */}
            <div style={{ padding: 12, background: 'rgba(220,38,38,0.04)', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>⚠ GAP 분석 임계값 분류 (일반 사업계획 고객 {analysis.planList.filter(p => !p.is_bucket && p.ytd_target > 0).length}사)</div>
              <table className="data-table" style={{ fontSize: 11, width: '100%' }}>
                <thead>
                  <tr>
                    <th>분류</th>
                    <th style={{ textAlign: 'right' }}>고객수</th>
                    <th style={{ textAlign: 'right' }}>Gap 합계</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: 'rgba(220,38,38,0.04)' }}>
                    <td>🔴 미달 전체 (달성률 &lt; 90%)</td>
                    <td style={{ textAlign: 'right' }}>{analysis.shortFallList.length}사</td>
                    <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>-{fmt(analysis.allShortGap)}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 20, color: 'var(--text2)' }}>↳ 표시 상위 10사</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{Math.min(10, analysis.shortFallList.length)}사</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>-{fmt(analysis.top10ShortGap)}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 20, color: 'var(--text3)' }}>↳ 11위 이하 (리포트에 미표시)</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{Math.max(0, analysis.shortFallList.length - 10)}사</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>-{fmt(Math.max(0, analysis.allShortGap - analysis.top10ShortGap))}</td>
                  </tr>
                  <tr style={{ background: 'rgba(22,163,74,0.04)' }}>
                    <td>🟢 초과 전체 (달성률 &gt; 110%)</td>
                    <td style={{ textAlign: 'right' }}>{analysis.surplusList.length}사</td>
                    <td style={{ textAlign: 'right', color: 'var(--green, #16a34a)', fontWeight: 700 }}>+{fmt(analysis.allSurplusGap)}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 20, color: 'var(--text2)' }}>↳ 표시 상위 5사</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{Math.min(5, analysis.surplusList.length)}사</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>+{fmt(analysis.top5SurplusGap)}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 20, color: 'var(--text3)' }}>↳ 6위 이하 (리포트에 미표시)</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{Math.max(0, analysis.surplusList.length - 5)}사</td>
                    <td style={{ textAlign: 'right', color: 'var(--text3)' }}>+{fmt(Math.max(0, analysis.allSurplusGap - analysis.top5SurplusGap))}</td>
                  </tr>
                  <tr>
                    <td>⚪ 정상 (90~110%)</td>
                    <td style={{ textAlign: 'right' }}>{analysis.normalList.length}사</td>
                    <td style={{ textAlign: 'right' }}>-</td>
                  </tr>
                  <tr style={{ background: 'rgba(46,125,50,0.04)', fontWeight: 700 }}>
                    <td>📊 미달 전체 - 초과 전체 = 일반 고객 net Gap</td>
                    <td></td>
                    <td style={{ textAlign: 'right', color: (analysis.allShortGap - analysis.allSurplusGap) > 0 ? 'var(--red)' : 'var(--green, #16a34a)' }}>
                      {(analysis.allShortGap - analysis.allSurplusGap) > 0 ? '-' : '+'}{fmt(Math.abs(analysis.allShortGap - analysis.allSurplusGap))}
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(220,38,38,0.06)', fontWeight: 700 }}>
                    <td>📊 (리포트 표시) Top10 미달 - Top5 초과 = -9.1억과 비교</td>
                    <td></td>
                    <td style={{ textAlign: 'right', color: analysis.top10_5_NetGap > 0 ? 'var(--red)' : 'var(--green, #16a34a)' }}>
                      {analysis.top10_5_NetGap > 0 ? '-' : '+'}{fmt(Math.abs(analysis.top10_5_NetGap))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 결론 */}
            <div style={{ padding: 12, background: '#fef3c7', borderRadius: 6, marginBottom: 12, border: '1px solid #d97706' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#b45309' }}>💡 모순 분해 결론</div>
              <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                <div>• <strong>전체 합계 관점</strong>: 영업현황 {fmt(analysis.ytdOrderTotal)} / 사업계획 목표 {fmt(analysis.planTotalTarget)} = <strong>{overallPct}%</strong></div>
                <div>• <strong>일반 사업계획 고객만</strong> ({analysis.planList.filter(p => !p.is_bucket).length}사): {fmt(analysis.regularPlanActual)} / {fmt(analysis.regularPlanTarget)} (Gap {analysis.regularPlanGap > 0 ? '-' : '+'}{fmt(Math.abs(analysis.regularPlanGap))})</div>
                <div>• <strong>버킷(신규/기타)</strong>: {fmt(analysis.bucketActual)} / {fmt(analysis.bucketTarget)} (Gap {analysis.bucketGap > 0 ? '-' : '+'}{fmt(Math.abs(analysis.bucketGap))})</div>
                <div>• <strong>리포트 GAP -9.1억</strong>은 <u>미달 Top10 + 초과 Top5만의 합산</u>일 뿐, 일반 고객 전체 net gap은 <strong>{(analysis.allShortGap - analysis.allSurplusGap) > 0 ? '-' : '+'}{fmt(Math.abs(analysis.allShortGap - analysis.allSurplusGap))}</strong></div>
              </div>
            </div>

            {/* 미달 전체 리스트 */}
            {analysis.shortFallList.length > 0 && (
              <details style={{ marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '6px 0' }}>
                  🔴 미달 전체 {analysis.shortFallList.length}사 (Gap 큰 순) — 클릭 펼치기
                </summary>
                <div className="table-wrap" style={{ maxHeight: 400, marginTop: 6 }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>고객명</th>
                        <th style={{ textAlign: 'right' }}>YTD Target</th>
                        <th style={{ textAlign: 'right' }}>YTD Actual</th>
                        <th style={{ textAlign: 'right' }}>Gap</th>
                        <th style={{ textAlign: 'right' }}>달성률</th>
                        <th>account_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.shortFallList.map((p, i) => (
                        <tr key={i} style={{ background: i < 10 ? 'rgba(220,38,38,0.04)' : undefined }}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(p.ytd_target)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(p.actual)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--red)' }}>-{fmt(p.gap)}</td>
                          <td style={{ textAlign: 'right' }}>{p.gapPct}%</td>
                          <td style={{ fontSize: 9, color: p.account_id ? 'var(--green, #16a34a)' : 'var(--red)' }}>
                            {p.account_id ? '✓ 매칭' : '✗ 미연결'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* 초과 전체 리스트 */}
            {analysis.surplusList.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '6px 0' }}>
                  🟢 초과 전체 {analysis.surplusList.length}사 (초과 큰 순)
                </summary>
                <div className="table-wrap" style={{ maxHeight: 300, marginTop: 6 }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>고객명</th>
                        <th style={{ textAlign: 'right' }}>YTD Target</th>
                        <th style={{ textAlign: 'right' }}>YTD Actual</th>
                        <th style={{ textAlign: 'right' }}>초과액</th>
                        <th style={{ textAlign: 'right' }}>달성률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.surplusList.map((p, i) => (
                        <tr key={i} style={{ background: i < 5 ? 'rgba(22,163,74,0.04)' : undefined }}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(p.ytd_target)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(p.actual)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--green, #16a34a)' }}>+{fmt(-p.gap)}</td>
                          <td style={{ textAlign: 'right' }}>{p.gapPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        );
      })()}

      {!analysis && !analyzing && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          [분석 시작] 버튼을 클릭하면 사업계획 target과 영업현황 actual의 정확한 분해 결과가 표시됩니다. 데이터 변경 없음.
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   v3.6 — 고객명 퍼지 매칭 분석기 (Dry-run)
   사업계획의 customer_name 과 영업현황으로 자동 생성된 account 간 매칭
   ══════════════════════════════════════════════════════════════════ */
function FuzzyMatchAnalyzer({ accounts, orders, sales, businessPlans, applyFuzzyMatches, showToast }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [threshold, setThreshold] = useState(0.7);
  // v3.6 Phase 2: 매칭 적용용 체크박스 state
  const [selectedMatches, setSelectedMatches] = useState(new Set());
  const [applying, setApplying] = useState(false);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysis(null);

    // 비동기 (UI 응답성)
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // 1. 사업계획의 고객명 추출 (customer 타입만)
      const planCustomers = businessPlans
        .filter(p => (p.type === 'customer' || !p.type) && p.customer_name)
        .map(p => ({
          plan_id: p.id,
          name: p.customer_name.trim(),
          account_id: p.account_id || null,
          annual_target: p.annual_target || 0,
          sales_rep: p.sales_rep || '',
          biz_type: p.biz_type || '',
        }));

      // 사업계획 고객명 unique
      const planNameMap = {};
      planCustomers.forEach(p => {
        const key = p.name.toLowerCase().trim();
        if (!planNameMap[key]) {
          planNameMap[key] = { name: p.name, plans: [], total_target: 0, account_id: p.account_id };
        }
        planNameMap[key].plans.push(p);
        planNameMap[key].total_target += p.annual_target;
        if (p.account_id) planNameMap[key].account_id = p.account_id;
      });
      const planList = Object.values(planNameMap);

      // 사업계획에 이미 정확히 매칭된 account ID set
      const planAccountIds = new Set(planList.filter(p => p.account_id).map(p => p.account_id));
      // 사업계획 고객명을 소문자 정규화한 set (정확 매칭 확인용)
      const planNameLowerSet = new Set(planList.map(p => p.name.toLowerCase().trim()));

      // 2. accounts 중 사업계획에 없는 것들 (= 영업현황으로만 자동 생성된 가능성 높음)
      // 매출/수주 매칭 대상이 되는 account만 (활동이 있는)
      const ordersByAccount = {};
      const salesByAccount = {};
      orders.forEach(o => {
        if (!o.account_id) return;
        ordersByAccount[o.account_id] = (ordersByAccount[o.account_id] || 0) + (o.order_amount || 0);
      });
      sales.forEach(s => {
        if (!s.account_id) return;
        salesByAccount[s.account_id] = (salesByAccount[s.account_id] || 0) + (s.sale_amount || 0);
      });

      const unmatchedAccounts = accounts
        .filter(a => {
          if (!a.company_name) return false;
          // 이미 사업계획에 직접 매칭된 account는 제외
          if (planAccountIds.has(a.id)) return false;
          // 사업계획 고객명과 정확히 일치하는 account도 제외 (이미 매칭 작동 중)
          if (planNameLowerSet.has(a.company_name.toLowerCase().trim())) return false;
          // 영업현황 활동이 있는 account만 (매출/수주 데이터)
          const hasActivity = ordersByAccount[a.id] > 0 || salesByAccount[a.id] > 0;
          return hasActivity;
        })
        .map(a => ({
          account_id: a.id,
          name: a.company_name,
          order_total: ordersByAccount[a.id] || 0,
          sales_total: salesByAccount[a.id] || 0,
        }))
        .sort((x, y) => (y.order_total + y.sales_total) - (x.order_total + x.sales_total));

      // 3. 각 미매칭 account에 대해 사업계획 후보 매칭
      const matches = []; // { account, candidate, score }
      const noMatches = []; // 매칭 실패
      unmatchedAccounts.forEach(acc => {
        let best = { candidate: null, score: 0 };
        planList.forEach(p => {
          const score = combinedSimilarity(acc.name, p.name);
          if (score > best.score) {
            best = { candidate: p, score };
          }
        });
        if (best.score >= threshold) {
          matches.push({ account: acc, candidate: best.candidate, score: best.score });
        } else {
          noMatches.push({ account: acc, bestScore: best.score, bestCandidate: best.candidate });
        }
      });

      // 4. 통계 변화 미리보기
      // 현재: account별 수주/매출 합계 → 사업계획 매칭 여부 따라 분류
      // 적용 시: 매칭된 account는 사업계획 고객으로 분류
      const currentMatched = accounts.filter(a => planAccountIds.has(a.id) || planNameLowerSet.has((a.company_name || '').toLowerCase().trim())).length;
      const currentUnmatched = unmatchedAccounts.length;
      const willMatch = matches.length;
      const stillUnmatched = currentUnmatched - willMatch;

      // 매칭 시 사업계획 고객의 실적 보강 효과
      let plannedActualGain = 0;
      let plannedActualSalesGain = 0;
      matches.forEach(m => {
        plannedActualGain += m.account.order_total;
        plannedActualSalesGain += m.account.sales_total;
      });

      const sortedMatches = matches.sort((a, b) => b.score - a.score);

      // v3.6 Phase 2: 신뢰도 90% 이상 자동 체크 (안전한 default)
      const autoSelected = new Set();
      sortedMatches.forEach(m => {
        if (m.score >= 0.9) autoSelected.add(m.account.account_id);
      });
      setSelectedMatches(autoSelected);

      setAnalysis({
        planTotalCustomers: planList.length,
        planUnmatched: planList.filter(p => !p.account_id).length,
        unmatchedAccounts,
        matches: sortedMatches,
        noMatches: noMatches.sort((a, b) => (b.account.order_total + b.account.sales_total) - (a.account.order_total + a.account.sales_total)),
        before: {
          matchedCount: currentMatched,
          unmatchedCount: currentUnmatched,
        },
        after: {
          matchedCount: currentMatched + willMatch,
          unmatchedCount: stillUnmatched,
        },
        plannedActualGain,
        plannedActualSalesGain,
        threshold,
      });
    } catch (err) {
      console.error('퍼지 매칭 분석 실패:', err);
      alert('분석 중 오류 발생: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #7c3aed' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>🔍 고객명 퍼지 매칭 분석</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
          [사업계획 ↔ 영업현황 고객명 통합 점검 — Dry-run, 적용 X]
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        사업계획에 등록된 고객명과 영업현황(수주/매출)에서 자동 생성된 고객 account를
        <strong> 정규화·편집거리·토큰 기반 퍼지 매칭</strong>으로 비교합니다.<br />
        예: "Fannin Healthcare" ↔ "Fannin Healthcare Inc." 같은 차이를 자동 감지.
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}> 분석만 진행, 데이터는 변경 안 됨.</span>
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12 }}>
          신뢰도 임계값:&nbsp;
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ padding: '3px 6px', fontSize: 12 }}>
            <option value={0.85}>85% (엄격)</option>
            <option value={0.75}>75% (높음)</option>
            <option value={0.7}>70% (보통, 권장)</option>
            <option value={0.6}>60% (관대)</option>
            <option value={0.5}>50% (매우 관대)</option>
          </select>
        </label>
        <button
          className="btn btn-primary"
          onClick={runAnalysis}
          disabled={analyzing || !accounts.length || !businessPlans.length}
        >
          {analyzing ? '분석 중...' : '🔍 매칭 분석 시작'}
        </button>
      </div>

      {analysis && (
        <div>
          {/* 요약 박스 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
            <div className="kpi" style={{ padding: 10 }}>
              <div className="kpi-label">사업계획 고객</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{analysis.planTotalCustomers}사</div>
            </div>
            <div className="kpi" style={{ padding: 10 }}>
              <div className="kpi-label">현재 미매칭 Account</div>
              <div className="kpi-value" style={{ fontSize: 18, color: 'var(--red)' }}>{analysis.before.unmatchedCount}사</div>
            </div>
            <div className="kpi green" style={{ padding: 10 }}>
              <div className="kpi-label">매칭 후보 발견</div>
              <div className="kpi-value" style={{ fontSize: 18, color: 'var(--green, #16a34a)' }}>+{analysis.matches.length}사</div>
            </div>
            <div className="kpi" style={{ padding: 10 }}>
              <div className="kpi-label">여전히 매칭 실패</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{analysis.noMatches.length}사</div>
            </div>
          </div>

          {/* 통계 변화 */}
          {(analysis.plannedActualGain > 0 || analysis.plannedActualSalesGain > 0) && (
            <div style={{ padding: 10, background: 'rgba(46,125,50,0.06)', borderRadius: 6, marginBottom: 12, fontSize: 12, borderLeft: '3px solid var(--green, #16a34a)' }}>
              <div style={{ fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 4 }}>📈 매칭 적용 시 사업계획 고객 실적 보강 효과</div>
              <div>수주: <strong>+{fmtKRW(analysis.plannedActualGain)}</strong> ({analysis.matches.length}사 통합)</div>
              <div>매출: <strong>+{fmtKRW(analysis.plannedActualSalesGain)}</strong></div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                ※ 현재는 미매칭 account로 분류되어 "신규/기타" 버킷에 잡혀있는 실적이, 매칭 적용 시 해당 사업계획 고객 실적으로 이동
              </div>
            </div>
          )}

          {/* 매칭 후보 리스트 + Phase 2: 체크박스 선택 + 적용 */}
          {analysis.matches.length > 0 && (
            <details open style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '6px 0' }}>
                ✅ 매칭 후보 {analysis.matches.length}건 (신뢰도 {Math.round(threshold * 100)}% 이상)
                <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 11 }}>
                  · 선택 {selectedMatches.size}건
                </span>
              </summary>
              {/* 일괄 선택 버튼 */}
              <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    const all = new Set(analysis.matches.map(m => m.account.account_id));
                    setSelectedMatches(all);
                  }}
                  style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}
                >전체 선택</button>
                <button
                  onClick={() => {
                    const high = new Set(analysis.matches.filter(m => m.score >= 0.9).map(m => m.account.account_id));
                    setSelectedMatches(high);
                  }}
                  style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}
                >신뢰도 90%+ 만</button>
                <button
                  onClick={() => setSelectedMatches(new Set())}
                  style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}
                >전체 해제</button>
              </div>
              <div className="table-wrap" style={{ maxHeight: 400, marginTop: 6 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>적용</th>
                      <th>영업현황 Account 명</th>
                      <th>→</th>
                      <th>사업계획 고객명</th>
                      <th style={{ textAlign: 'right' }}>신뢰도</th>
                      <th style={{ textAlign: 'right' }}>수주</th>
                      <th style={{ textAlign: 'right' }}>매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.matches.map((m, i) => {
                      const conf = confidenceLabel(m.score);
                      const isSelected = selectedMatches.has(m.account.account_id);
                      const toggle = () => {
                        setSelectedMatches(prev => {
                          const next = new Set(prev);
                          if (next.has(m.account.account_id)) next.delete(m.account.account_id);
                          else next.add(m.account.account_id);
                          return next;
                        });
                      };
                      return (
                        <tr key={i} style={{ background: isSelected ? 'rgba(46,125,50,0.04)' : undefined }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={toggle}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={toggle}>{m.account.name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text3)' }}>→</td>
                          <td style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={toggle}>{m.candidate.name}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ padding: '1px 6px', borderRadius: 3, background: conf.color + '22', color: conf.color, fontWeight: 700 }}>
                              {Math.round(m.score * 100)}% ({conf.label})
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{m.account.order_total > 0 ? fmtKRW(m.account.order_total) : '-'}</td>
                          <td style={{ textAlign: 'right' }}>{m.account.sales_total > 0 ? fmtKRW(m.account.sales_total) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Phase 2: 매칭 적용 버튼 */}
              {selectedMatches.size > 0 && (() => {
                // 선택된 매칭의 합계 계산
                const selected = analysis.matches.filter(m => selectedMatches.has(m.account.account_id));
                const totalOrder = selected.reduce((s, m) => s + m.account.order_total, 0);
                const totalSales = selected.reduce((s, m) => s + m.account.sales_total, 0);
                return (
                  <div style={{ marginTop: 12, padding: 10, background: 'rgba(46,125,50,0.06)', borderRadius: 6, border: '1px solid rgba(46,125,50,0.3)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #16a34a)', marginBottom: 6 }}>
                      💾 선택 항목 매칭 적용 준비
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                      선택 <strong>{selectedMatches.size}건</strong> · 사업계획 고객 실적 보강:
                      수주 <strong>{fmtKRW(totalOrder)}</strong> / 매출 <strong>{fmtKRW(totalSales)}</strong>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 10 }}>
                      ※ 사업계획 plan들의 <code>account_id</code>가 영업현황 account ID로 연결됨.
                      고객 이름은 변경 없음. Report 통계가 즉시 정확해집니다.
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={applying}
                      onClick={async () => {
                        if (!confirm(`선택한 ${selectedMatches.size}건의 매칭을 적용하시겠습니까?\n\n• 사업계획 plan에 영업현황 account_id 연결\n• 데이터 손실 없음 (account 통합 X, ID 연결만)`)) return;
                        setApplying(true);
                        try {
                          const matchesToApply = selected.map(m => ({
                            plan_customer_name: m.candidate.name,
                            account_id: m.account.account_id,
                          }));
                          const updated = await applyFuzzyMatches(matchesToApply);
                          if (updated > 0) {
                            // 적용 후 자동 재분석으로 결과 업데이트
                            setAnalysis(null);
                            setSelectedMatches(new Set());
                          }
                        } catch (e) {
                          showToast('매칭 적용 실패: ' + e.message, 'error');
                        } finally {
                          setApplying(false);
                        }
                      }}
                    >
                      {applying ? '적용 중...' : `💾 선택한 ${selectedMatches.size}건 매칭 적용`}
                    </button>
                  </div>
                );
              })()}
            </details>
          )}

          {/* 매칭 실패 리스트 */}
          {analysis.noMatches.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '6px 0' }}>
                ❓ 매칭 실패 {analysis.noMatches.length}건 (사업계획에 비슷한 고객 없음)
              </summary>
              <div className="table-wrap" style={{ maxHeight: 300, marginTop: 6 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>영업현황 Account 명</th>
                      <th>최근접 후보</th>
                      <th style={{ textAlign: 'right' }}>점수</th>
                      <th style={{ textAlign: 'right' }}>수주</th>
                      <th style={{ textAlign: 'right' }}>매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.noMatches.slice(0, 50).map((m, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{m.account.name}</td>
                        <td style={{ color: 'var(--text3)' }}>{m.bestCandidate?.name || '-'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text3)' }}>{Math.round(m.bestScore * 100)}%</td>
                        <td style={{ textAlign: 'right' }}>{m.account.order_total > 0 ? fmtKRW(m.account.order_total) : '-'}</td>
                        <td style={{ textAlign: 'right' }}>{m.account.sales_total > 0 ? fmtKRW(m.account.sales_total) : '-'}</td>
                      </tr>
                    ))}
                    {analysis.noMatches.length > 50 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)' }}>외 {analysis.noMatches.length - 50}건</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 10px', background: 'var(--bg2)', borderRadius: 4, marginTop: 8 }}>
            💡 분석 결과만 표시되었습니다. 실제 매칭 적용 (account 통합 / account_id 재연결)은 별도 작업으로,
            결과 검증 후 진행 가능합니다.
          </div>
        </div>
      )}

      {!analysis && !analyzing && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          [분석 시작] 버튼을 클릭하면 사업계획과 영업현황 고객명을 자동 비교합니다. 데이터는 변경되지 않습니다.
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { accounts, saveAccount, importOrders, importSales, importBusinessPlans, businessPlans, clearBusinessPlans, orders, sales, forecasts, saveForecast, removeForecast, showToast, isAdmin, teamMembers, saveTeamMembers, applyFuzzyMatches, mergeAccounts, appSettings, activityLogs, saveLog } = useAccount();

  /* ══════════════════════════════════════
     팀 멤버 관리
     ══════════════════════════════════════ */
  const [newMemberName, setNewMemberName] = useState('');
  const [editingMemberIdx, setEditingMemberIdx] = useState(-1);
  const [editingMemberName, setEditingMemberName] = useState('');

  const handleAddMember = () => {
    const name = newMemberName.trim();
    if (!name) return;
    if (teamMembers.includes(name)) {
      showToast(`'${name}'은(는) 이미 등록되어 있습니다`, 'error');
      return;
    }
    saveTeamMembers([...teamMembers, name]);
    setNewMemberName('');
    showToast(`담당자 '${name}' 추가 완료`, 'success');
  };

  const handleRemoveMember = (idx) => {
    const name = teamMembers[idx];
    const assignedCount = accounts.filter(a => a.sales_rep === name).length;
    if (assignedCount > 0 && !confirm(`'${name}' 담당자에게 배정된 고객이 ${assignedCount}개 있습니다. 정말 삭제하시겠습니까?\n(고객 배정은 유지됩니다)`)) return;
    saveTeamMembers(teamMembers.filter((_, i) => i !== idx));
    showToast(`담당자 '${name}' 삭제 완료`, 'success');
  };

  const handleEditMember = (idx) => {
    setEditingMemberIdx(idx);
    setEditingMemberName(teamMembers[idx]);
  };

  const handleSaveEditMember = () => {
    const name = editingMemberName.trim();
    if (!name) return;
    const oldName = teamMembers[editingMemberIdx];
    if (name !== oldName && teamMembers.includes(name)) {
      showToast(`'${name}'은(는) 이미 등록되어 있습니다`, 'error');
      return;
    }
    const updated = [...teamMembers];
    updated[editingMemberIdx] = name;
    saveTeamMembers(updated);
    // 고객 카드의 담당자도 일괄 변경
    if (name !== oldName) {
      const affected = accounts.filter(a => a.sales_rep === oldName);
      affected.forEach(a => saveAccount({ ...a, sales_rep: name }));
      if (affected.length > 0) showToast(`${affected.length}개 고객의 담당자명도 '${name}'으로 변경됨`, 'info');
    }
    setEditingMemberIdx(-1);
    setEditingMemberName('');
    showToast(`담당자 '${oldName}' → '${name}' 수정 완료`, 'success');
  };

  /* ══════════════════════════════════════
     고객 마스터 일괄 동기화
     (사업계획 기준으로 누락 고객 생성 + 담당자/지역/사업형태 동기화)
     ══════════════════════════════════════ */
  const [masterSyncing, setMasterSyncing] = useState(false);

  const masterSyncPreview = useMemo(() => {
    const year = new Date().getFullYear();
    const plans = businessPlans.filter(p => p.year === year && (p.type === 'customer' || !p.type));
    if (plans.length === 0) return null;

    const accountMap = {};
    accounts.forEach(a => {
      if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a;
    });

    const missing = []; // 신규 생성 필요
    const needUpdate = []; // 기존 계정 업데이트 필요
    const alreadyOk = []; // 이미 일치

    plans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (!key) return;

      const existing = accountMap[key];
      if (!existing) {
        missing.push(p);
      } else {
        const repDiff = p.sales_rep && p.sales_rep.trim() !== (existing.sales_rep || '').trim();
        const regionDiff = p.region && p.region !== (existing.region || '');
        const bizDiff = p.biz_type && p.biz_type !== (existing.business_type || '');
        const countryDiff = p.country && p.country !== (existing.country || '');
        if (repDiff || regionDiff || bizDiff || countryDiff) {
          needUpdate.push({ plan: p, account: existing, repDiff, regionDiff, bizDiff, countryDiff });
        } else {
          alreadyOk.push(p);
        }
      }
    });

    return { plans, missing, needUpdate, alreadyOk };
  }, [businessPlans, accounts]);

  const handleMasterSync = async () => {
    if (!masterSyncPreview) return;
    setMasterSyncing(true);

    try {
      const year = new Date().getFullYear();
      let created = 0, updated = 0;

      // 1. 누락 고객 생성
      for (const p of masterSyncPreview.missing) {
        const newId = 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        await saveAccount({
          id: newId,
          company_name: p.customer_name,
          country: p.country || '',
          region: p.region || '',
          business_type: p.biz_type || '',
          products: [],
          sales_rep: (p.sales_rep || '').trim(),
          key_contacts: [],
          contract_status: '없음',
          intelligence: { total_score: 0, categories: {}, last_updated: '' },
          last_contact_date: '',
          created_at: today(),
          updated_at: today(),
        });
        created++;
        // 잠시 대기 (ID 충돌 방지)
        await new Promise(r => setTimeout(r, 50));
      }

      // 2. 기존 고객 업데이트 (담당자, 지역, 사업형태, 국가)
      for (const item of masterSyncPreview.needUpdate) {
        const { plan: p, account: a } = item;
        const changes = {};
        if (p.sales_rep && p.sales_rep.trim() !== (a.sales_rep || '').trim()) changes.sales_rep = p.sales_rep.trim();
        if (p.region && p.region !== (a.region || '')) changes.region = p.region;
        if (p.biz_type && p.biz_type !== (a.business_type || '')) changes.business_type = p.biz_type;
        if (p.country && p.country !== (a.country || '')) changes.country = p.country;
        if (Object.keys(changes).length > 0) {
          await saveAccount({ ...a, ...changes });
          updated++;
        }
      }

      // 3. 사업계획 account_id 재연결
      const freshAccountMap = {};
      // re-read accounts after creation
      const allAccounts = [...accounts];
      // Also include newly created (won't be in accounts yet from Firestore listener)
      allAccounts.forEach(a => {
        if (a.company_name) freshAccountMap[a.company_name.toLowerCase().trim()] = a.id;
      });

      const unlinked = businessPlans.filter(p => p.year === year && (p.type === 'customer' || !p.type) && !p.account_id);
      if (unlinked.length > 0) {
        const updatedPlans = [];
        for (const p of unlinked) {
          const key = (p.customer_name || '').toLowerCase().trim();
          const accountId = freshAccountMap[key];
          if (accountId) {
            updatedPlans.push({ ...p, id: `plan_${year}_${accountId}`, account_id: accountId });
          }
        }
        if (updatedPlans.length > 0) {
          const linkedIds = new Set(unlinked.map(p => p.id));
          const remaining = businessPlans.filter(p => !linkedIds.has(p.id));
          importBusinessPlans([...remaining.filter(p => p.year === year), ...updatedPlans]);
        }
      }

      showToast(`마스터 동기화 완료: 신규 ${created}사 생성, ${updated}사 업데이트`, 'success');
    } catch (err) {
      showToast('동기화 실패: ' + err.message, 'error');
    } finally {
      setMasterSyncing(false);
    }
  };

  /* ══════════════════════════════════════════
     영업현황 Import (O sheet — 수주 raw data)
     ══════════════════════════════════════════ */
  const fileRef = useRef();
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  // v3.4.1: 다중 연도 체크박스 선택 — 기본: 당해 + 전년도 (전년대비 비교용)
  // importYear: 하위 호환용 단일 연도 state (''  = 전체)
  // importYears: Set<string> — 선택된 연도들 (비어있으면 "전체"로 간주)
  const [importYear, setImportYear] = useState('');
  const [importYears, setImportYears] = useState(() => {
    const y = new Date().getFullYear();
    return new Set([String(y), String(y - 1)]); // 당해 + 전년
  });

  // 파일 데이터를 ref로 보관 (React state에 13k 행 넣지 않음)
  const parsedDataRef = useRef(null);

  // O 시트 (수주) 헤더 매핑
  const mapOSheetHeaders = (headers) => ({
    status: headers.indexOf('진행상태'),
    orderNo: headers.indexOf('수주번호'),
    customer: headers.indexOf('고객명'),
    productGroup: headers.indexOf('제품군'),
    orderDate: headers.indexOf('오더일'),
    quantity: headers.indexOf('수량'),
    unitPrice: headers.indexOf('단가'),
    currency: headers.indexOf('통화'),
    region: headers.indexOf('지역'),
    country: headers.indexOf('국가'),
    salesRep: headers.indexOf('영업담당'),
    orderAmount: headers.indexOf('수주금액'),
    orderType: headers.indexOf('오더 구분'),
  });

  // S 시트 (매출) 헤더 매핑 — 실제 영업현황_2026.xlsm S 시트 컬럼 기준
  // [고객사, 수주번호, 제품군, 품명, 단가, 통화, 수량, 원화매출액, 납품일자, B/L Date, 영업담당, 지역, 매출금액, 매출대기]
  const mapSSheetHeaders = (headers) => {
    // 보조 탐색 (B/L Date 대소문자/공백 변형)
    const findDate = () => {
      const i1 = headers.indexOf('B/L Date');
      if (i1 >= 0) return i1;
      const fallback = ['B/L date', 'BL Date', 'B/L DATE', 'B/L 날짜', '매출일'];
      for (const c of fallback) {
        const i = headers.findIndex(h => h.toLowerCase() === c.toLowerCase());
        if (i >= 0) return i;
      }
      return headers.findIndex(h => /b\s*\/?\s*l/i.test(h) && /date|날짜/i.test(h));
    };
    return {
      status: -1, // S시트엔 진행상태 없음
      orderType: -1, // S시트엔 오더 구분 없음
      orderNo: headers.indexOf('수주번호'),
      customer: headers.indexOf('고객사'), // O시트는 고객명, S시트는 고객사
      productGroup: headers.indexOf('제품군'),
      orderDate: findDate(), // B/L Date
      saleConfirmedDate: findDate(), // 동일 (B/L Date = 매출 확정일)
      deliveryDate: headers.indexOf('납품일자'),
      quantity: headers.indexOf('수량'),
      unitPrice: headers.indexOf('단가'),
      currency: headers.indexOf('통화'),
      region: headers.indexOf('지역'),
      country: -1, // S시트엔 국가 없음
      salesRep: headers.indexOf('영업담당'),
      // 매출 금액 우선순위: 매출금액(확정) > 원화매출액
      orderAmount: headers.indexOf('매출금액') >= 0 ? headers.indexOf('매출금액') : headers.indexOf('원화매출액'),
      pendingAmount: headers.indexOf('매출대기'),
    };
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast(`${file.name} 읽는 중... (파일이 크면 수 초 걸릴 수 있습니다)`, 'info');

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);

      // ── O 시트 (수주) ──
      const oSheetName = wb.SheetNames.find(s => s === 'O') || wb.SheetNames[0];
      const oWs = wb.Sheets[oSheetName];
      const oRows = XLSX.utils.sheet_to_json(oWs, { header: 1 });
      if (oRows.length < 2) { showToast('O시트 데이터가 없습니다', 'error'); return; }

      const oHeaders = oRows[0].map(c => String(c || '').trim());
      const oColIdx = mapOSheetHeaders(oHeaders);
      const oDataRows = oRows.slice(1).filter(r => r && r[oColIdx.customer]);

      // 연도별 분포 (수주)
      const oYearCounts = {};
      oDataRows.forEach(r => {
        const dateVal = r[oColIdx.orderDate];
        if (!dateVal) return;
        const year = excelDateToStr(dateVal).slice(0, 4);
        if (year && year.startsWith('20')) oYearCounts[year] = (oYearCounts[year] || 0) + 1;
      });

      // ── S 시트 (매출) ──
      const sSheetName = wb.SheetNames.find(s => s === 'S');
      let sDataRows = [];
      let sColIdx = null;
      let sYearCounts = {};
      let sHasValidDateColumn = false;
      if (sSheetName) {
        const sWs = wb.Sheets[sSheetName];
        const sRows = XLSX.utils.sheet_to_json(sWs, { header: 1 });
        if (sRows.length >= 2) {
          const sHeaders = sRows[0].map(c => String(c || '').trim());
          sColIdx = mapSSheetHeaders(sHeaders);
          sHasValidDateColumn = sColIdx.orderDate >= 0 && sColIdx.customer >= 0;
          sDataRows = sRows.slice(1).filter(r => r && r[sColIdx.customer]);
          sDataRows.forEach(r => {
            const dateVal = r[sColIdx.orderDate];
            if (!dateVal) return;
            const year = excelDateToStr(dateVal).slice(0, 4);
            if (year && year.startsWith('20')) sYearCounts[year] = (sYearCounts[year] || 0) + 1;
          });
        }
      }

      // 고객 매칭 (O+S 모두 대상) — v3.11: aliases도 매칭에 포함
      const accountMap = {};
      accounts.forEach(a => {
        if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = true;
        (a.aliases || []).forEach(alias => {
          if (alias) accountMap[String(alias).toLowerCase().trim()] = true;
        });
      });
      const customerSet = new Set([
        ...oDataRows.map(r => String(r[oColIdx.customer] || '').trim()),
        ...sDataRows.map(r => String(r[sColIdx?.customer] || '').trim()),
      ].filter(Boolean));
      const matchedNames = [...customerSet].filter(n => accountMap[n.toLowerCase().trim()]);
      const unmatchedNames = [...customerSet].filter(n => !accountMap[n.toLowerCase().trim()]);

      // 전년도 고객 목록 (O 시트 수주 기준)
      const priorYear = String(new Date().getFullYear() - 1);
      const excludeStatuses = ['수주취소'];
      const excludeTypes = ['무상샘플', '수리출고'];
      const priorYearNames = [];
      oDataRows.forEach(r => {
        const dateStr = excelDateToStr(r[oColIdx.orderDate]);
        if (!dateStr.startsWith(priorYear)) return;
        const status = String(r[oColIdx.status] || '').trim();
        const orderType = String(r[oColIdx.orderType] || '').trim();
        if (excludeStatuses.includes(status) || excludeTypes.includes(orderType)) return;
        const amt = parseFloat(r[oColIdx.orderAmount]) || 0;
        if (amt <= 0) return;
        priorYearNames.push(String(r[oColIdx.customer] || '').trim());
      });
      const priorYearUniqueCount = new Set(priorYearNames.map(n => n.toLowerCase().trim())).size;

      parsedDataRef.current = {
        oColIdx, oDataRows,
        sColIdx, sDataRows,
        priorYearNames,
      };

      setPreview({
        fileName: file.name,
        oSheetName, sSheetName: sSheetName || null,
        oTotalRows: oDataRows.length,
        sTotalRows: sDataRows.length,
        sHasValidDateColumn,
        oYearCounts, sYearCounts,
        matchedCustomers: matchedNames.length,
        unmatchedCustomers: unmatchedNames.length,
        unmatchedNames: unmatchedNames.slice(0, 30),
        priorYearUniqueCount,
      });
      const msg = sSheetName
        ? `로드 완료: O시트 ${oDataRows.length.toLocaleString()}건 + S시트 ${sDataRows.length.toLocaleString()}건`
        : `로드 완료: O시트 ${oDataRows.length.toLocaleString()}건 (S시트 없음)`;
      showToast(msg, 'success');
    } catch (err) {
      showToast('파일 읽기 실패: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!preview || !parsedDataRef.current) return;

    // ═══════════════════════════════════════════════════════════
    // v3.5.2 진단 모드: importYears 상태를 사용자에게 명시 + 강제 확인
    // ═══════════════════════════════════════════════════════════
    const selectedYearsArr = importYears ? [...importYears].sort().reverse() : [];
    const isYearsSet = importYears instanceof Set;

    console.log('━━━━━━━━━ 🎯 Import 시작 진단 ━━━━━━━━━');
    console.log('importYears 타입:', isYearsSet ? 'Set ✓' : `❌ ${typeof importYears}`);
    console.log('importYears 크기:', importYears?.size);
    console.log('선택된 연도:', selectedYearsArr);
    console.log('importYear (legacy):', importYear);
    console.log('Excel oDataRows:', parsedDataRef.current.oDataRows?.length || 0, '건');
    console.log('Excel sDataRows:', parsedDataRef.current.sDataRows?.length || 0, '건');

    if (selectedYearsArr.length === 0) {
      alert('⚠ 연도를 1개 이상 선택해주세요.');
      return;
    }

    // 강제 확인 — 사용자가 정확히 인지하고 진행하도록
    const confirmMsg = `📋 Import 시작 확인\n\n` +
      `▸ 선택한 연도: ${selectedYearsArr.join(', ')}\n` +
      `▸ 이 연도의 데이터만 저장됩니다 (다른 연도는 제외)\n\n` +
      `계속 진행하시겠습니까?`;
    if (!confirm(confirmMsg)) {
      console.log('사용자가 Import 취소');
      return;
    }

    setImporting(true);

    try {
      const { oDataRows, oColIdx, sDataRows, sColIdx, priorYearNames } = parsedDataRef.current;

      // 전년도 고객 목록 저장 (고객 분류에 사용)
      if (priorYearNames && priorYearNames.length > 0) {
        savePriorYearCustomers(priorYearNames);
      }

      // 기존 계정 매핑 — v3.11: aliases도 매칭 (합병 후 재import 안전)
      const accountMap = {};
      accounts.forEach(a => {
        if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id;
        (a.aliases || []).forEach(alias => {
          if (alias) accountMap[String(alias).toLowerCase().trim()] = a.id;
        });
      });

      const excludeStatuses = ['수주취소'];
      const excludeTypes = ['무상샘플', '수리출고'];

      // ── O 시트 (수주) 1차 패스: 유효행 추출 + 미매칭 고객 수집 ──
      const oValidRows = [];
      const unmatchedCustomerInfo = {};
      let oFiltered = 0;
      let oYearFiltered = 0;
      const oYearStats = {};

      oDataRows.forEach(row => {
        const status = String(row[oColIdx.status] || '').trim();
        const orderType = String(row[oColIdx.orderType] || '').trim();
        if (excludeStatuses.includes(status)) { oFiltered++; return; }
        if (excludeTypes.includes(orderType)) { oFiltered++; return; }

        const dateVal = row[oColIdx.orderDate];
        if (!dateVal) return;
        const orderDate = excelDateToStr(dateVal);
        const yearPart = orderDate.slice(0, 4);
        oYearStats[yearPart] = (oYearStats[yearPart] || 0) + 1;
        // v3.5.2: 명시적 필터 (디버깅 카운트 추가)
        if (importYears instanceof Set && importYears.size > 0) {
          if (!importYears.has(yearPart)) {
            oYearFiltered++;
            return;
          }
        } else if (importYear && !orderDate.startsWith(importYear)) {
          oYearFiltered++;
          return;
        }

        const customer = String(row[oColIdx.customer] || '').trim();
        if (!customer) return;

        const orderAmount = parseFloat(row[oColIdx.orderAmount]) || 0;
        if (orderAmount <= 0) return;

        oValidRows.push(row);

        const key = customer.toLowerCase().trim();
        if (!accountMap[key] && !unmatchedCustomerInfo[key]) {
          unmatchedCustomerInfo[key] = {
            company_name: customer,
            region: mapRegion(String(row[oColIdx.region] || '').trim()),
            country: String(row[oColIdx.country] || '').trim(),
            sales_rep: String(row[oColIdx.salesRep] || '').trim(),
            products: new Set(),
          };
        }
        if (unmatchedCustomerInfo[key]) {
          const prod = String(row[oColIdx.productGroup] || '').trim();
          if (prod) unmatchedCustomerInfo[key].products.add(prod);
        }
      });

      console.log('📊 수주 필터 결과:', {
        총: oDataRows.length,
        제외_상태: oFiltered,
        제외_연도: oYearFiltered,
        통과: oValidRows.length,
        연도분포: oYearStats,
      });

      // ── S 시트 (매출) 1차 패스: B/L Date 있고 매출금액 > 0 인 행만 확정 매출로 처리 ──
      const sValidRows = [];
      let sFiltered = 0;
      let sYearFiltered = 0;
      const sYearStats = {};
      const hasSheetS = sDataRows && sColIdx && sColIdx.orderDate >= 0 && sColIdx.customer >= 0;
      if (hasSheetS) {
        sDataRows.forEach(row => {
          const dateVal = row[sColIdx.orderDate];
          if (!dateVal) { sFiltered++; return; } // B/L Date 없으면 매출 미확정 → 제외
          const saleDate = excelDateToStr(dateVal);
          const yearPart = saleDate.slice(0, 4);
          sYearStats[yearPart] = (sYearStats[yearPart] || 0) + 1;
          // v3.5.2: 명시적 필터 (디버깅 카운트)
          if (importYears instanceof Set && importYears.size > 0) {
            if (!importYears.has(yearPart)) {
              sYearFiltered++;
              return;
            }
          } else if (importYear && !saleDate.startsWith(importYear)) {
            sYearFiltered++;
            return;
          }

          const customer = String(row[sColIdx.customer] || '').trim();
          if (!customer) return;

          const saleAmount = parseFloat(row[sColIdx.orderAmount]) || 0;
          if (saleAmount <= 0) { sFiltered++; return; }

          sValidRows.push(row);

          // 미매칭 고객 자동 계정 (지역/담당자만, 국가·오더타입 없음)
          const key = customer.toLowerCase().trim();
          if (!accountMap[key] && !unmatchedCustomerInfo[key]) {
            unmatchedCustomerInfo[key] = {
              company_name: customer,
              region: mapRegion(String(row[sColIdx.region] || '').trim()),
              country: '',
              sales_rep: String(row[sColIdx.salesRep] || '').trim(),
              products: new Set(),
            };
          }
          if (unmatchedCustomerInfo[key]) {
            const prod = String(row[sColIdx.productGroup] || '').trim();
            if (prod) unmatchedCustomerInfo[key].products.add(prod);
          }
        });
      }

      console.log('📊 매출 필터 결과:', {
        총: sDataRows.length,
        제외_BL_또는_금액0: sFiltered,
        제외_연도: sYearFiltered,
        통과: sValidRows.length,
        연도분포: sYearStats,
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 미매칭 고객 자동 계정 생성
      const newAccounts = [];
      for (const [key, info] of Object.entries(unmatchedCustomerInfo)) {
        const newId = 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        accountMap[key] = newId;
        newAccounts.push({
          id: newId,
          company_name: info.company_name,
          country: info.country,
          region: info.region,
          sales_rep: info.sales_rep,
          products: [...info.products],
          business_type: '',
          key_contacts: [],
          contract_status: '없음',
          intelligence: { total_score: 0, categories: {}, last_updated: '' },
          last_contact_date: '',
          created_at: today(),
          updated_at: today(),
        });
      }
      for (const acc of newAccounts) {
        await saveAccount(acc);
      }

      // ── 2차 패스: 수주(Orders) 생성 ──
      const newOrders = [];
      oValidRows.forEach(row => {
        const customer = String(row[oColIdx.customer] || '').trim();
        const accountId = accountMap[customer.toLowerCase().trim()];
        if (!accountId) return;
        const orderNo = String(row[oColIdx.orderNo] || '').trim();
        const orderDate = excelDateToStr(row[oColIdx.orderDate]);
        newOrders.push({
          id: `ord_${orderNo || genId('ord')}`,
          account_id: accountId,
          customer_name: customer,
          order_number: orderNo,
          order_date: orderDate,
          product_category: String(row[oColIdx.productGroup] || '').trim(),
          order_amount: parseFloat(row[oColIdx.orderAmount]) || 0,
          currency: String(row[oColIdx.currency] || 'KRW').trim(),
          quantity: parseInt(row[oColIdx.quantity]) || 0,
          unit_price: parseFloat(row[oColIdx.unitPrice]) || 0,
          sales_rep: String(row[oColIdx.salesRep] || '').trim(),
          region: mapRegion(String(row[oColIdx.region] || '').trim()),
          country: String(row[oColIdx.country] || '').trim(),
          status: String(row[oColIdx.status] || '').trim(),
          source: 'excel_import_영업현황',
          import_date: today(),
        });
      });

      // ── 2차 패스: 매출(Sales) 생성 — B/L Date 기준 확정 매출만 ──
      const newSales = [];
      if (hasSheetS) {
        sValidRows.forEach(row => {
          const customer = String(row[sColIdx.customer] || '').trim();
          const accountId = accountMap[customer.toLowerCase().trim()];
          if (!accountId) return;
          const orderNo = String(row[sColIdx.orderNo] || '').trim();
          const saleDate = excelDateToStr(row[sColIdx.orderDate]); // B/L Date
          const deliveryDate = sColIdx.deliveryDate >= 0 ? excelDateToStr(row[sColIdx.deliveryDate]) : '';
          newSales.push({
            id: `sal_${orderNo || genId('sal')}_${saleDate}_${Math.random().toString(36).slice(2, 6)}`,
            account_id: accountId,
            customer_name: customer,
            order_number: orderNo,
            sale_date: saleDate, // B/L Date (매출 확정일)
            delivery_date: deliveryDate, // 납품일자 (참고용)
            product_category: String(row[sColIdx.productGroup] || '').trim(),
            sale_amount: parseFloat(row[sColIdx.orderAmount]) || 0, // 매출금액
            pending_amount: sColIdx.pendingAmount >= 0 ? (parseFloat(row[sColIdx.pendingAmount]) || 0) : 0,
            currency: String(row[sColIdx.currency] || 'KRW').trim(),
            quantity: parseInt(row[sColIdx.quantity]) || 0,
            unit_price: parseFloat(row[sColIdx.unitPrice]) || 0,
            sales_rep: String(row[sColIdx.salesRep] || '').trim(),
            region: mapRegion(String(row[sColIdx.region] || '').trim()),
            country: '', // S 시트에 국가 없음
            source: 'excel_import_영업현황_S',
            import_date: today(),
          });
        });
      }

      if (newOrders.length > 0) {
        await importOrders(newOrders, 'excel_import_영업현황');
      }
      if (newSales.length > 0) {
        await importSales(newSales, 'excel_import_영업현황_S');
      }

      const parts = [];
      parts.push(`수주 ${newOrders.length}건`);
      if (hasSheetS) parts.push(`매출 ${newSales.length}건`);
      if (newAccounts.length > 0) parts.push(`신규 고객 ${newAccounts.length}사 자동생성`);
      parts.push(`제외 ${oFiltered + sFiltered}건`);
      showToast(`Import 완료: ${parts.join(', ')}`, 'success');
      setPreview(null);
      parsedDataRef.current = null;
    } catch (err) {
      console.error('Import 실패:', err);
      showToast('Import 실패: ' + err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  /* ══════════════════════════════════════
     사업계획 Import (수주목표 파일)
     ══════════════════════════════════════ */
  const planFileRef = useRef();
  const [planImporting, setPlanImporting] = useState(false);
  const [planPreview, setPlanPreview] = useState(null);

  const handlePlanFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);

      // 고객별 시트 찾기 (선택적 — 없어도 매출 목표만 Import 가능)
      const mainSheet = wb.SheetNames.find(s => s.includes('고객별'));

      // 헤더 행 찾기 (고객사 + 담당자 포함)
      let headerIdx = -1;
      let colMap = {};
      let rows = [];
      if (mainSheet) {
        const ws = wb.Sheets[mainSheet];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const row = (rows[i] || []).map(c => String(c || '').trim());
          const hasCustomer = row.some(c => c.includes('고객') && (c.includes('사') || c.includes('명')));
          const hasRep = row.some(c => c === '담당자');
          if (hasCustomer && hasRep) {
            headerIdx = i;
            row.forEach((h, j) => {
              if (h.includes('고객') && (h.includes('사') || h.includes('명'))) colMap.customer = j;
              if (h === '지역') colMap.region = j;
              if (h === '국가') colMap.country = j;
              if (h.includes('영업팀') || h === '팀') colMap.team = j;
              if (h === '구분') colMap.bizType = j;
              if (h === '담당자') colMap.rep = j;
              if (h === '1월') colMap.m01 = j;
              if (h === '2월') colMap.m02 = j;
              if (h === '3월') colMap.m03 = j;
              if (h === '4월') colMap.m04 = j;
              if (h === '5월') colMap.m05 = j;
              if (h === '6월') colMap.m06 = j;
              if (h === '7월') colMap.m07 = j;
              if (h === '8월') colMap.m08 = j;
              if (h === '9월') colMap.m09 = j;
              if (h === '10월') colMap.m10 = j;
              if (h === '11월') colMap.m11 = j;
              if (h === '12월') colMap.m12 = j;
              if (h.includes('목표') && h.includes('202')) colMap.annual = j;
            });
            break;
          }
        }
      }
      // 고객별 시트 없거나 헤더 못 찾음 — 매출 목표 Import 전용 파일일 수 있음 (경고만)
      const hasCustomerSheet = !!mainSheet && headerIdx >= 0;

      const planRows = [];
      if (hasCustomerSheet) {
        // 연간 합계 컬럼 보조 탐색
        if (colMap.annual === undefined) {
          const lastRow = (rows[headerIdx] || []).map(c => String(c || '').trim());
          for (let j = lastRow.length - 1; j >= 0; j--) {
            if (lastRow[j].includes('목표') && !lastRow[j].includes('분기') && !lastRow[j].includes('반기')) {
              colMap.annual = j;
              break;
            }
          }
        }

        const monthCols = [colMap.m01, colMap.m02, colMap.m03, colMap.m04, colMap.m05, colMap.m06,
                           colMap.m07, colMap.m08, colMap.m09, colMap.m10, colMap.m11, colMap.m12];

        // 고객 데이터 파싱
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r) continue;
          const customer = String(r[colMap.customer] || '').trim();
          if (!customer || customer === 'Total' || customer.includes('소계') || customer.includes('합계')) continue;

          const monthTargets = {};
          let hasAny = false;
          monthCols.forEach((col, idx) => {
            if (col !== undefined) {
              const val = parseFloat(r[col]) || 0;
              monthTargets[String(idx + 1).padStart(2, '0')] = val;
              if (val > 0) hasAny = true;
            }
          });

          const annual = colMap.annual !== undefined
            ? (parseFloat(r[colMap.annual]) || 0)
            : Object.values(monthTargets).reduce((s, v) => s + v, 0);

          if (!hasAny && annual <= 0) continue;

          planRows.push({
            customerName: customer,
            region: mapRegion(String(r[colMap.region] || '').trim()),
            country: String(r[colMap.country] || '').trim(),
            team: String(r[colMap.team] || '').trim(),
            bizType: String(r[colMap.bizType] || '').trim(),
            salesRep: String(r[colMap.rep] || '').trim(),
            monthTargets,
            annual,
          });
        }
      }

      // 월별매출 시트 파싱 — 사업부별 매출 목표 추출 (해외/BPU/국내)
      // ⚠️ 중요: 사업계획 파일에 따라 시트명·데이터 유무가 다름. 여러 후보 중 "값이 있는" 시트 우선 선택.
      //   - 후보: '월별매출', '26년도 월별수주매출S_251229', '월별 매출' 등
      //   - `_담당자배정.xlsx`는 매출 목표가 비어있을 수 있음 (이 경우 _251229 버전 업로드 필요)
      const parseSalesTargets = (sheetName) => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return null;
        const sRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // "사업부별 매출" 섹션 찾기
        let sectionIdx = -1;
        for (let i = 0; i < sRows.length; i++) {
          const cellText = (sRows[i] || []).map(c => String(c || '')).join(' ');
          if (/사업부별\s*매출/.test(cellText) || /팀별\s*매출/.test(cellText)) {
            sectionIdx = i; break;
          }
        }
        if (sectionIdx < 0) return null;
        let headerRowIdx = -1;
        for (let i = sectionIdx + 1; i < Math.min(sectionIdx + 4, sRows.length); i++) {
          const row = (sRows[i] || []).map(c => String(c || ''));
          if (row.includes('1월') && row.includes('12월')) { headerRowIdx = i; break; }
        }
        if (headerRowIdx < 0) return null;
        const hdr = (sRows[headerRowIdx] || []).map(c => String(c || ''));
        const monthCols = [];
        for (let m = 1; m <= 12; m++) monthCols.push(hdr.indexOf(`${m}월`));

        const targets = {};
        ['해외', 'BPU', '국내'].forEach(t => {
          targets[t] = {};
          for (let m = 1; m <= 12; m++) targets[t][String(m).padStart(2, '0')] = 0;
        });
        // ⚠️ 각 팀의 "첫 번째 데이터 행만" 사용 (중복 방지):
        //   Excel 레이아웃상 "국내" 팀은 종종 3개 행으로 분리:
        //     국내 (합계 행, 이것만 취함)
        //     국내 (국내 대리점만, 중복으로 무시)
        //     국내(직판) (세부 행, 중복으로 무시)
        //   Total 행 값으로 검증하여 정확성 보장
        const teamSeenCount = { '해외': 0, 'BPU': 0, '국내': 0 };
        let dataFound = false;
        for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 15, sRows.length); i++) {
          const row = sRows[i] || [];
          let teamName = '';
          for (let c = 0; c <= 3; c++) {
            const v = String(row[c] || '').trim();
            if (['해외', 'BPU', '국내', '국내(직판)'].includes(v) || v === 'Total' || v === 'Total ') {
              teamName = v; break;
            }
          }
          if (!teamName) continue;
          if (teamName === 'Total' || teamName === 'Total ') break;
          const mappedTeam = teamName.startsWith('국내') ? '국내' : teamName;
          // 이미 한 번 본 팀은 중복이므로 무시 (첫 행이 합계 행)
          if (teamSeenCount[mappedTeam] >= 1) continue;
          teamSeenCount[mappedTeam]++;

          if (!targets[mappedTeam]) {
            targets[mappedTeam] = {};
            for (let m = 1; m <= 12; m++) targets[mappedTeam][String(m).padStart(2, '0')] = 0;
          }
          let rowHasValue = false;
          for (let m = 1; m <= 12; m++) {
            const col = monthCols[m - 1];
            if (col < 0) continue;
            const val = parseFloat(row[col]) || 0;
            if (val > 0) rowHasValue = true;
            // ⚠️ 단위: 사업계획 Excel 헤더에 "[단위: 천원]" 표기지만 실제 셀 값은 "원" 단위
            //   (수주 목표도 동일 방식으로 원 단위 저장)
            targets[mappedTeam][String(m).padStart(2, '0')] += val;
          }
          if (rowHasValue) dataFound = true;
        }
        if (!dataFound) return null;
        // 연간 합계가 0인 팀은 무의미하므로 제거 (전부 0이면 null 반환)
        const totalSum = Object.values(targets).reduce((sum, months) =>
          sum + Object.values(months).reduce((s, v) => s + v, 0), 0);
        if (totalSum === 0) return null;
        return { targets, sheetName };
      };

      // 여러 후보 시트 중 데이터가 있는 것 우선
      // ⚠️ 시트 우선순위 (중요):
      // 같은 사업계획 파일 내 여러 시트에 매출 목표가 있을 수 있음.
      // - 월별매출 시트 = 구버전/보수적 목표
      // - 26년도 월별수주매출S_* 시트 = 최신 시뮬레이션 (사용자가 운영에 쓰는 공식 값)
      // 따라서 "수주매출S" 패턴을 최우선으로 선택.
      const candidateSheetNames = [
        // 1순위: 통합 시뮬레이션 시트 (S suffix, 날짜 포함)
        ...wb.SheetNames.filter(s => /수주매출S/.test(s) || /수주\s*매출\s*S/.test(s)),
        // 2순위: 다른 수주매출 통합 시트
        ...wb.SheetNames.filter(s => /월별.*수주.*매출/.test(s) && !s.includes('세부')),
        // 3순위: 월별매출 단독 시트
        ...wb.SheetNames.filter(s => s === '월별매출'),
        ...wb.SheetNames.filter(s => /월별.*매출/.test(s) && !s.includes('세부') && !s.includes('수주')),
      ];
      const uniqueCandidates = [...new Set(candidateSheetNames)];

      let teamSalesTargets = {};
      let salesTargetFound = false;
      let salesSheetUsed = null;
      for (const name of uniqueCandidates) {
        const result = parseSalesTargets(name);
        if (result) {
          teamSalesTargets = result.targets;
          salesTargetFound = true;
          salesSheetUsed = result.sheetName;
          break;
        }
      }

      // 품목별 시트 파싱
      const prodSheet = wb.SheetNames.find(s => s.includes('품목별'));
      const productPlans = [];
      if (prodSheet) {
        const pws = wb.Sheets[prodSheet];
        const pRows = XLSX.utils.sheet_to_json(pws, { header: 1 });
        if (pRows.length > 1) {
          for (let i = 1; i < pRows.length; i++) {
            const pr = pRows[i];
            if (!pr || !pr[0]) continue;
            const product = String(pr[0]).trim();
            if (!product || product === 'Total' || product.includes('합계')) continue;
            const mt = {};
            let hasAny = false;
            for (let m = 1; m <= 12; m++) {
              const val = parseFloat(pr[m]) || 0;
              mt[String(m).padStart(2, '0')] = val;
              if (val > 0) hasAny = true;
            }
            const annual = parseFloat(pr[13]) || Object.values(mt).reduce((s, v) => s + v, 0);
            if (hasAny || annual > 0) productPlans.push({ product, monthTargets: mt, annual });
          }
        }
      }

      // CRM 매칭
      const accountMap = {};
      accounts.forEach(a => { if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id; });

      const matchedSet = new Set();
      const unmatchedNames = [];
      planRows.forEach(r => {
        const key = r.customerName.toLowerCase().trim();
        if (accountMap[key]) {
          r.accountId = accountMap[key];
          matchedSet.add(r.customerName);
        } else if (!unmatchedNames.includes(r.customerName)) {
          unmatchedNames.push(r.customerName);
        }
      });

      const annualTotal = planRows.reduce((s, r) => s + r.annual, 0);

      // 최소 검증: 고객별 수주목표 OR 매출목표 OR 품목별 중 하나는 있어야 함
      if (planRows.length === 0 && productPlans.length === 0 && !salesTargetFound) {
        showToast('사업계획 데이터를 찾을 수 없습니다. 다음 시트 중 하나가 필요합니다:\n'
          + '- 고객별 수주목표 (예: 고객별.담당별.지역별.사업구분)\n'
          + '- 매출 목표 (예: 월별매출, 26년도 월별수주매출S_*)\n'
          + '- 품목별 목표', 'error');
        return;
      }

      setPlanPreview({
        fileName: file.name,
        sheetName: mainSheet || '(고객별 시트 없음)',
        hasCustomerSheet,
        planRows, productPlans,
        teamSalesTargets, salesTargetFound, salesSheetUsed,
        salesCandidateSheets: uniqueCandidates,
        totalRows: planRows.length,
        matched: matchedSet.size, unmatched: unmatchedNames.length,
        unmatchedNames, annualTotal,
      });

      // 토스트 메시지
      const msgParts = [];
      if (planRows.length > 0) msgParts.push(`고객별 수주목표 ${planRows.length}건`);
      if (productPlans.length > 0) msgParts.push(`품목별 ${productPlans.length}건`);
      if (salesTargetFound) {
        msgParts.push(`매출목표 "${salesSheetUsed}" 시트 추출`);
      } else if (uniqueCandidates.length > 0) {
        msgParts.push(`⚠ 매출목표 시트 값 비어있음`);
      }
      showToast(`${file.name} 로드: ${msgParts.join(', ')}`, salesTargetFound || planRows.length > 0 ? 'info' : 'warn');
    } catch (err) {
      showToast('파일 읽기 실패: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  const handlePlanImport = async () => {
    if (!planPreview) return;
    setPlanImporting(true);

    try {
      const year = new Date().getFullYear();

      // 미매칭 고객 자동 계정 생성
      const accountMap = {};
      accounts.forEach(a => { if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id; });

      let newAccountCount = 0;
      for (const r of planPreview.planRows) {
        const key = r.customerName.toLowerCase().trim();
        if (!accountMap[key]) {
          const newId = 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          accountMap[key] = newId;
          r.accountId = newId;
          await saveAccount({
            id: newId,
            company_name: r.customerName,
            country: r.country,
            region: r.region,
            business_type: r.bizType,
            products: [],
            sales_rep: r.salesRep,
            key_contacts: [],
            contract_status: '없음',
            intelligence: { total_score: 0, categories: {}, last_updated: '' },
            last_contact_date: '',
            created_at: today(),
            updated_at: today(),
          });
          newAccountCount++;
        } else if (!r.accountId) {
          r.accountId = accountMap[key];
        }
      }

      const plans = [];

      // 고객별 계획 (이제 모두 accountId 보유)
      planPreview.planRows.forEach(r => {
        plans.push({
          id: `plan_${year}_${r.accountId}`,
          year,
          type: 'customer',
          account_id: r.accountId,
          customer_name: r.customerName,
          sales_rep: r.salesRep,
          region: r.region,
          country: r.country,
          team: r.team,
          biz_type: r.bizType,
          targets: r.monthTargets,
          annual_target: r.annual,
          currency: 'KRW',
          source: 'excel_import',
          import_date: today(),
        });
      });

      // 품목별 계획
      planPreview.productPlans.forEach(p => {
        plans.push({
          id: `plan_${year}_product_${p.product}`,
          year,
          type: 'product',
          product: p.product,
          targets: p.monthTargets,
          annual_target: p.annual,
          currency: 'KRW',
          source: 'excel_import',
          import_date: today(),
        });
      });

      // 팀별 매출 목표 (월별매출 시트에서 파싱된 것)
      let teamSalesCount = 0;
      if (planPreview.salesTargetFound && planPreview.teamSalesTargets) {
        const teamMap = { '해외': 'overseas', 'BPU': 'bpu', '국내': 'domestic' };
        Object.entries(planPreview.teamSalesTargets).forEach(([teamName, targets]) => {
          const annual = Object.values(targets).reduce((s, v) => s + v, 0);
          if (annual <= 0) return;
          plans.push({
            id: `plan_${year}_team_sales_${teamMap[teamName] || teamName}`,
            year,
            type: 'team_sales',
            team: teamName, // '해외' | 'BPU' | '국내'
            targets, // {01: amt, ..., 12: amt} 원 단위
            annual_target: annual,
            currency: 'KRW',
            source: 'excel_import',
            import_date: today(),
          });
          teamSalesCount++;
        });
      }

      if (plans.length > 0) importBusinessPlans(plans);

      const parts = [`사업계획 ${plans.length}건 import 완료`];
      if (teamSalesCount > 0) {
        // 매출 목표 연간 합계 계산해서 토스트에 표시
        const salesAnnual = Object.values(planPreview.teamSalesTargets || {})
          .reduce((sum, months) => sum + Object.values(months).reduce((s, v) => s + v, 0), 0);
        const salesAnnualStr = salesAnnual >= 100000000
          ? `${(salesAnnual / 100000000).toFixed(1)}억`
          : `${Math.round(salesAnnual / 10000).toLocaleString()}만`;
        parts.push(`💰 팀별 매출목표 ${teamSalesCount}팀 (연간 ${salesAnnualStr})`);
      } else {
        parts.push('⚠ 매출목표 미추출 (수주목표 기반 대체 사용)');
      }
      if (newAccountCount > 0) parts.push(`신규 고객 ${newAccountCount}사 자동생성`);
      showToast(parts.join(' · '), 'success');
      setPlanPreview(null);
    } catch (err) {
      showToast('Import 실패: ' + err.message, 'error');
    } finally {
      setPlanImporting(false);
    }
  };

  /* ══════════════════════════════════════
     사업계획 ↔ 고객 자동 재연결
     ══════════════════════════════════════ */
  const [relinking, setRelinking] = useState(false);

  const handleRelinkPlans = async () => {
    setRelinking(true);
    try {
      const year = new Date().getFullYear();
      const unlinked = businessPlans.filter(p => p.year === year && (p.type === 'customer' || !p.type) && !p.account_id);
      if (unlinked.length === 0) {
        showToast('연결이 필요한 사업계획이 없습니다', 'info');
        setRelinking(false);
        return;
      }

      // 기존 계정 이름 → ID 매핑
      const accountMap = {};
      accounts.forEach(a => {
        if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id;
      });

      let linked = 0;
      let created = 0;
      const updatedPlans = [];

      for (const p of unlinked) {
        const key = (p.customer_name || '').toLowerCase().trim();
        if (!key) continue;

        let accountId = accountMap[key];

        // 기존 계정이 있으면 business_type 동기화
        if (accountId && p.biz_type) {
          const existingAcct = accounts.find(a => a.id === accountId);
          if (existingAcct && !existingAcct.business_type) {
            await saveAccount({ ...existingAcct, business_type: p.biz_type });
          }
        }

        // 계정이 없으면 자동 생성
        if (!accountId) {
          accountId = 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          accountMap[key] = accountId;
          await saveAccount({
            id: accountId,
            company_name: p.customer_name,
            country: p.country || '',
            region: p.region || '',
            business_type: p.biz_type || '',
            products: [],
            sales_rep: p.sales_rep || '',
            key_contacts: [],
            contract_status: '없음',
            intelligence: { total_score: 0, categories: {}, last_updated: '' },
            last_contact_date: '',
            created_at: today(),
            updated_at: today(),
          });
          created++;
        }

        updatedPlans.push({
          ...p,
          id: `plan_${year}_${accountId}`,
          account_id: accountId,
        });
        linked++;
      }

      if (updatedPlans.length > 0) {
        // 기존 unlinked plans + 연결된 plans 교체
        const linkedIds = new Set(unlinked.map(p => p.id));
        const remaining = businessPlans.filter(p => !linkedIds.has(p.id));
        importBusinessPlans([...remaining.filter(p => p.year === year), ...updatedPlans]);
      }

      showToast(`재연결 완료: ${linked}건 연결${created > 0 ? ` (신규 고객 ${created}사 생성)` : ''}`, 'success');
    } catch (err) {
      showToast('재연결 실패: ' + err.message, 'error');
    } finally {
      setRelinking(false);
    }
  };

  /* ══════════════════════════════════════
     사업형태 일괄 동기화
     ══════════════════════════════════════ */
  const [syncing, setSyncing] = useState(false);

  const handleSyncBizType = async () => {
    setSyncing(true);
    try {
      const year = new Date().getFullYear();
      const plans = businessPlans.filter(p => p.year === year && (p.type === 'customer' || !p.type) && p.biz_type);

      // customer_name 기반으로 plan → account 매칭
      const nameToType = {};
      plans.forEach(p => {
        const key = (p.customer_name || '').toLowerCase().trim();
        if (key && p.biz_type) nameToType[key] = p.biz_type;
      });

      let updated = 0;
      for (const a of accounts) {
        const key = (a.company_name || '').toLowerCase().trim();
        const planType = nameToType[key];
        if (planType && a.business_type !== planType) {
          await saveAccount({ ...a, business_type: planType });
          updated++;
        }
      }

      showToast(updated > 0 ? `사업형태 동기화 완료: ${updated}건 업데이트` : '모든 고객의 사업형태가 최신입니다', updated > 0 ? 'success' : 'info');
    } catch (err) {
      showToast('동기화 실패: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // 동기화 필요 건수 계산
  const bizTypeSyncNeeded = (() => {
    const year = new Date().getFullYear();
    const plans = businessPlans.filter(p => p.year === year && (p.type === 'customer' || !p.type) && p.biz_type);
    const nameToType = {};
    plans.forEach(p => {
      const key = (p.customer_name || '').toLowerCase().trim();
      if (key && p.biz_type) nameToType[key] = p.biz_type;
    });
    return accounts.filter(a => {
      const key = (a.company_name || '').toLowerCase().trim();
      return nameToType[key] && a.business_type !== nameToType[key];
    }).length;
  })();

  /* ══════════════════════════════════════
     FCST Import (수주 예측)
     ══════════════════════════════════════ */
  const fcstFileRef = useRef();
  const [fcstImporting, setFcstImporting] = useState(false);
  const [fcstPreview, setFcstPreview] = useState(null);
  const [fcstYear, setFcstYear] = useState(String(new Date().getFullYear()));
  const fcstParsedRef = useRef(null);

  const handleFcstFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast(`${file.name} 읽는 중...`, 'info');

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);

      // FCST 시트 찾기
      const sheetName = wb.SheetNames.find(s => s === 'FCST' || s.includes('FCST'));
      if (!sheetName) {
        showToast('FCST 시트를 찾을 수 없습니다', 'error');
        return;
      }
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) { showToast('데이터가 없습니다', 'error'); return; }

      // 헤더 파싱 (row 0) - 컬럼 인덱스 직접 매핑
      const headers = rows[0].map(c => String(c || '').trim());
      const colIdx = {};
      headers.forEach((h, i) => {
        if (h.includes('년도')) colIdx.year = i;
        if (h === '버전') colIdx.version = i;
        if (h === 'ABC') colIdx.abc = i;
        if (h.includes('FCST') && h.includes('No')) colIdx.fcstNo = i;
        if (h === '구분') colIdx.type = i;
        if (h === '고객명') colIdx.customer = i;
        if (h === '최종고객') colIdx.endCustomer = i;
        if (h === '제품군') colIdx.productCategory = i;
        if (h === '품명') colIdx.productName = i;
        if (h.includes('기준모델')) colIdx.baseModel = i;
        if (h === 'Site') colIdx.site = i;
        if (h === '수주월') colIdx.orderMonth = i;
        if (h === '납기월') colIdx.deliveryMonth = i;
        if (h === '단가') colIdx.unitPrice = i;
        if (h === '통화') colIdx.currency = i;
        if (h === '수량') colIdx.quantity = i;
        if (h === '금액') colIdx.amountForeign = i;
        if (h.includes('원화') && h.includes('금액')) colIdx.amountKRW = i;
        if (h === '환율') colIdx.exchangeRate = i;
      });

      // 고정 위치 폴백 (헤더 파싱 실패 시)
      if (colIdx.year === undefined) colIdx.year = 1;
      if (colIdx.version === undefined) colIdx.version = 2;
      if (colIdx.abc === undefined) colIdx.abc = 3;
      if (colIdx.fcstNo === undefined) colIdx.fcstNo = 4;
      if (colIdx.type === undefined) colIdx.type = 5;
      if (colIdx.customer === undefined) colIdx.customer = 6;
      if (colIdx.endCustomer === undefined) colIdx.endCustomer = 7;
      if (colIdx.productCategory === undefined) colIdx.productCategory = 8;
      if (colIdx.productName === undefined) colIdx.productName = 9;
      if (colIdx.baseModel === undefined) colIdx.baseModel = 10;
      if (colIdx.site === undefined) colIdx.site = 11;
      if (colIdx.orderMonth === undefined) colIdx.orderMonth = 12;
      if (colIdx.deliveryMonth === undefined) colIdx.deliveryMonth = 13;
      if (colIdx.unitPrice === undefined) colIdx.unitPrice = 14;
      if (colIdx.currency === undefined) colIdx.currency = 15;
      if (colIdx.quantity === undefined) colIdx.quantity = 16;
      if (colIdx.amountForeign === undefined) colIdx.amountForeign = 17;
      if (colIdx.amountKRW === undefined) colIdx.amountKRW = 18;
      if (colIdx.exchangeRate === undefined) colIdx.exchangeRate = 19;

      const dataRows = rows.slice(1).filter(r => r && (r[colIdx.customer] || r[colIdx.fcstNo]));

      // 연도별 분포 (수주월 기준)
      const yearCounts = {};
      dataRows.forEach(r => {
        const yr = String(r[colIdx.year] || '').trim();
        if (yr && yr.startsWith('20')) yearCounts[yr] = (yearCounts[yr] || 0) + 1;
      });

      // 고객 매칭
      const accountMap = {};
      accounts.forEach(a => { if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id; });
      const customerSet = new Set(dataRows.map(r => String(r[colIdx.customer] || '').trim()).filter(Boolean));
      const matchedNames = [...customerSet].filter(n => accountMap[n.toLowerCase().trim()]);
      const unmatchedNames = [...customerSet].filter(n => !accountMap[n.toLowerCase().trim()]);

      // 총 원화금액
      const totalKRW = dataRows.reduce((s, r) => s + (parseFloat(r[colIdx.amountKRW]) || 0), 0);

      fcstParsedRef.current = { colIdx, dataRows };

      setFcstPreview({
        fileName: file.name, sheetName,
        totalRows: dataRows.length, yearCounts,
        matchedCustomers: matchedNames.length,
        unmatchedCustomers: unmatchedNames.length,
        unmatchedNames: unmatchedNames.slice(0, 30),
        totalKRW,
        customerCount: customerSet.size,
      });
      showToast(`${file.name} FCST시트 로드 완료 (${dataRows.length.toLocaleString()}건)`, 'success');
    } catch (err) {
      showToast('파일 읽기 실패: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  const handleFcstImport = async () => {
    if (!fcstPreview || !fcstParsedRef.current) return;
    setFcstImporting(true);

    try {
      const { dataRows, colIdx } = fcstParsedRef.current;

      // 기존 계정 매핑
      const accountMap = {};
      accounts.forEach(a => { if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id; });

      // 기존 FCST import 데이터 삭제 (재import 대비)
      const existingFcst = forecasts.filter(f => f.source === 'excel_import_fcst');
      for (const f of existingFcst) {
        await removeForecast(f.id);
      }

      // 연도 필터 적용하여 행 필터링
      const filteredRows = fcstYear
        ? dataRows.filter(r => String(r[colIdx.year] || '').trim() === fcstYear)
        : dataRows;

      let imported = 0;
      let skipped = 0;

      for (const row of filteredRows) {
        const customerName = String(row[colIdx.customer] || '').trim();
        const fcstNo = String(row[colIdx.fcstNo] || '').trim();
        if (!customerName && !fcstNo) { skipped++; continue; }

        const accountId = accountMap[customerName.toLowerCase().trim()] || '';

        const forecast = {
          id: `fcst_${fcstNo || genId('fcst')}`,
          account_id: accountId,
          customer_name: customerName,
          year: parseInt(row[colIdx.year]) || new Date().getFullYear(),
          version: String(row[colIdx.version] || '').trim(),
          abc_grade: String(row[colIdx.abc] || '').trim(),
          fcst_no: fcstNo,
          type: String(row[colIdx.type] || '').trim(),
          end_customer: String(row[colIdx.endCustomer] || '').trim(),
          product_category: String(row[colIdx.productCategory] || '').trim(),
          product_name: String(row[colIdx.productName] || '').trim(),
          base_model: String(row[colIdx.baseModel] || '').trim(),
          site: String(row[colIdx.site] || '').trim(),
          order_month: excelDateToStr(row[colIdx.orderMonth]),
          delivery_month: excelDateToStr(row[colIdx.deliveryMonth]),
          unit_price: parseFloat(row[colIdx.unitPrice]) || 0,
          currency: String(row[colIdx.currency] || 'USD').trim(),
          quantity: parseInt(row[colIdx.quantity]) || 0,
          amount_foreign: parseFloat(row[colIdx.amountForeign]) || 0,
          amount_krw: parseFloat(row[colIdx.amountKRW]) || 0,
          exchange_rate: parseFloat(row[colIdx.exchangeRate]) || 0,
          source: 'excel_import_fcst',
          import_date: today(),
        };

        await saveForecast(forecast);
        imported++;
      }

      showToast(`FCST Import 완료: ${imported}건 저장, ${skipped}건 스킵`, imported > 0 ? 'success' : 'error');
      setFcstPreview(null);
      fcstParsedRef.current = null;
    } catch (err) {
      showToast('FCST Import 실패: ' + err.message, 'error');
    } finally {
      setFcstImporting(false);
    }
  };

  /* ══════════════════════════════════════ */

  const planYear = new Date().getFullYear();
  const currentPlanCount = businessPlans.filter(p => p.year === planYear).length;
  const customerPlanCount = businessPlans.filter(p => p.year === planYear && (p.type === 'customer' || !p.type)).length;
  const productPlanCount = businessPlans.filter(p => p.year === planYear && p.type === 'product').length;
  const currentOrderImports = orders.filter(o => o.source === 'excel_import_영업현황').length;
  const currentFcstImports = forecasts.filter(f => f.source === 'excel_import_fcst').length;

  if (!isAdmin) {
    return (
      <div className="empty-state">
        <div className="icon">🔒</div>
        <p>관리자만 접근 가능합니다.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>설정</h2>

      {/* ── 팀 멤버 관리 ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">👥 담당자 관리</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          영업 담당자를 추가/수정/삭제합니다. 로그인 화면, 필터, 고객 배정 등에 반영됩니다.
        </p>

        <div style={{ marginBottom: 12 }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>담당자명</th>
                <th style={{ width: 80 }}>배정 고객</th>
                <th style={{ width: 120 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((name, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'center', color: 'var(--text3)' }}>{idx + 1}</td>
                  <td>
                    {editingMemberIdx === idx ? (
                      <input
                        type="text"
                        value={editingMemberName}
                        onChange={e => setEditingMemberName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveEditMember()}
                        style={{ padding: '2px 6px', fontSize: 12, width: '100%' }}
                        autoFocus
                      />
                    ) : (
                      <span style={{ fontWeight: 600 }}>{name}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="score-badge" style={{ background: 'var(--bg3)' }}>
                      {accounts.filter(a => a.sales_rep === name).length}
                    </span>
                  </td>
                  <td>
                    {editingMemberIdx === idx ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveEditMember}>저장</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingMemberIdx(-1)}>취소</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEditMember(idx)}>수정</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemoveMember(idx)}>삭제</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={newMemberName}
            onChange={e => setNewMemberName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddMember()}
            placeholder="새 담당자 이름"
            style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={!newMemberName.trim()}>
            + 담당자 추가
          </button>
        </div>
      </div>

      {/* ── 고객 마스터 일괄 동기화 ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔄 고객 마스터 일괄 동기화</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          사업계획 데이터를 기준으로 <strong>누락 고객 자동 생성</strong> + <strong>담당자·지역·사업형태 일괄 업데이트</strong>를 수행합니다.<br />
          사업계획을 먼저 import한 후 실행하세요.
        </p>

        {masterSyncPreview ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              <div className="kpi accent" style={{ padding: 10 }}>
                <div className="kpi-label">사업계획 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{masterSyncPreview.plans.length}사</div>
              </div>
              <div className={`kpi ${masterSyncPreview.missing.length > 0 ? 'red' : 'green'}`} style={{ padding: 10 }}>
                <div className="kpi-label">누락 (신규생성)</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{masterSyncPreview.missing.length}사</div>
              </div>
              <div className={`kpi ${masterSyncPreview.needUpdate.length > 0 ? '' : 'green'}`} style={{ padding: 10 }}>
                <div className="kpi-label">업데이트 필요</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{masterSyncPreview.needUpdate.length}사</div>
              </div>
              <div className="kpi green" style={{ padding: 10 }}>
                <div className="kpi-label">이미 일치</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{masterSyncPreview.alreadyOk.length}사</div>
              </div>
            </div>

            {masterSyncPreview.missing.length > 0 && (
              <details style={{ fontSize: 11, marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--red)', fontWeight: 600 }}>
                  신규 생성 대상 {masterSyncPreview.missing.length}사
                </summary>
                <div style={{ marginTop: 4, maxHeight: 120, overflowY: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead><tr><th>고객명</th><th>담당자</th><th>지역</th><th>사업형태</th></tr></thead>
                    <tbody>
                      {masterSyncPreview.missing.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.customer_name}</td>
                          <td>{p.sales_rep || '-'}</td>
                          <td>{p.region || '-'}</td>
                          <td>{p.biz_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {masterSyncPreview.needUpdate.length > 0 && (
              <details style={{ fontSize: 11, marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>
                  업데이트 대상 {masterSyncPreview.needUpdate.length}사
                </summary>
                <div style={{ marginTop: 4, maxHeight: 150, overflowY: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead><tr><th>고객명</th><th>항목</th><th>현재값</th><th>→</th><th>변경값</th></tr></thead>
                    <tbody>
                      {masterSyncPreview.needUpdate.map((item, i) => {
                        const rows = [];
                        if (item.repDiff) rows.push({ field: '담당자', old: item.account.sales_rep || '(비어있음)', next: item.plan.sales_rep });
                        if (item.regionDiff) rows.push({ field: '지역', old: item.account.region || '(비어있음)', next: item.plan.region });
                        if (item.bizDiff) rows.push({ field: '사업형태', old: item.account.business_type || '(비어있음)', next: item.plan.biz_type });
                        if (item.countryDiff) rows.push({ field: '국가', old: item.account.country || '(비어있음)', next: item.plan.country });
                        return rows.map((r, j) => (
                          <tr key={`${i}-${j}`}>
                            {j === 0 && <td rowSpan={rows.length} style={{ fontWeight: 600 }}>{item.account.company_name}</td>}
                            <td>{r.field}</td>
                            <td style={{ color: 'var(--text3)' }}>{r.old}</td>
                            <td style={{ textAlign: 'center' }}>→</td>
                            <td style={{ color: 'var(--green)', fontWeight: 600 }}>{r.next}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <button
              className="btn btn-primary"
              onClick={handleMasterSync}
              disabled={masterSyncing || (masterSyncPreview.missing.length === 0 && masterSyncPreview.needUpdate.length === 0)}
            >
              {masterSyncing ? '동기화 중...' : masterSyncPreview.missing.length === 0 && masterSyncPreview.needUpdate.length === 0 ? '모두 동기화됨 ✓' : `일괄 동기화 실행 (${masterSyncPreview.missing.length}사 생성 + ${masterSyncPreview.needUpdate.length}사 업데이트)`}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: 16, textAlign: 'center' }}>
            사업계획이 import되지 않았습니다. 아래에서 먼저 사업계획을 import해주세요.
          </div>
        )}
      </div>

      {/* ── v3.13: ProMES 영업통계 Import (현재 권장) ── */}
      <PromesImportTool
        accounts={accounts}
        saveAccount={saveAccount}
        orders={orders}
        sales={sales}
        importOrders={importOrders}
        importSales={importSales}
        showToast={showToast}
      />

      {/* v3.15.2: PromesBackfillTool 제거됨 — 옵션 B 선택 (월 단위 운영) */}

      {/* ── v3.13.1: 기존 영업현황 Import 데이터 정리 (One-time, 데이터 있을 때만 표시) ── */}
      <LegacyDataCleanupTool
        orders={orders}
        sales={sales}
        importOrders={importOrders}
        importSales={importSales}
        showToast={showToast}
      />

      {/* ── v3.17.10: Manual 수주 데이터 일괄 정리 (데이터 있을 때만 표시) ── */}
      <ManualOrderCleanupTool
        orders={orders}
        showToast={showToast}
      />

      {/* ── v3.17.3: Activity Log sales_rep 일괄 정정 (정정 대상 있을 때만 표시) ── */}
      <ActivityRepFixTool
        accounts={accounts}
        activityLogs={activityLogs}
        saveLog={saveLog}
        showToast={showToast}
      />

      {/* ── DEPRECATED: 영업현황 Import 카드 (v3.13.1에서 UI 제거)
         이 블록은 빌드에 포함되지 않도록 false 조건으로 감쌌고,
         dead code (handleFileSelect 등)는 아직 남아있지만 호출 경로 없음.
         완전 제거는 다음 cleanup 작업에서 진행. ── */}
      {false && (
      <div className="card" style={{ marginBottom: 16, opacity: 0.85 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📥 영업현황 Import (수주 + 매출)</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', padding: '2px 8px', background: 'var(--bg2)', borderRadius: 12 }}>
            Legacy — 영업현황_2026.xlsm 형식 (~2026-04)
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          기존 <strong>영업현황_2026.xlsm</strong> 파일의 O/S 시트 형식 import (참고용 보존).<br />
          <span style={{ color: 'var(--text3)' }}>2026년 5월 이후 영업현황 Excel은 갱신되지 않습니다 → 위 <strong>ProMES 영업통계 Import</strong> 사용 권장.</span>
        </p>

        {currentOrderImports > 0 && (
          <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(46,125,50,.08)', borderColor: 'rgba(46,125,50,.3)' }}>
            <span>📋</span> 수주 <strong>{currentOrderImports.toLocaleString()}건</strong>
            {sales && sales.length > 0 && (
              <> / 매출 <strong>{sales.filter(s => s.source === 'excel_import_영업현황_S').length.toLocaleString()}건</strong></>
            )} import됨
          </div>
        )}

        {/* v3.5.2: 진단 도구 — 정확한 데이터 분포 확인 */}
        {(orders.length > 0 || sales.length > 0) && (() => {
          // Source별 분포
          const orderBySource = {};
          orders.forEach(o => {
            const src = o.source || '(없음)';
            orderBySource[src] = (orderBySource[src] || 0) + 1;
          });
          const salesBySource = {};
          sales.forEach(s => {
            const src = s.source || '(없음)';
            salesBySource[src] = (salesBySource[src] || 0) + 1;
          });
          // 연도별 분포 (excel_import_영업현황 source만)
          const orderByYear = {};
          orders.filter(o => o.source === 'excel_import_영업현황').forEach(o => {
            const y = (o.order_date || '').slice(0, 4) || '(연도없음)';
            orderByYear[y] = (orderByYear[y] || 0) + 1;
          });
          const salesByYear = {};
          sales.filter(s => s.source === 'excel_import_영업현황_S').forEach(s => {
            const y = (s.sale_date || '').slice(0, 4) || '(연도없음)';
            salesByYear[y] = (salesByYear[y] || 0) + 1;
          });

          return (
            <details style={{ marginBottom: 12, padding: 10, background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                🔍 데이터 진단 (Source별 / 연도별 정확한 건수)
              </summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11 }}>
                {/* 수주 */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>📦 수주 (Total: {orders.length.toLocaleString()}건)</div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Source별</div>
                    {Object.entries(orderBySource).sort((a, b) => b[1] - a[1]).map(([src, n]) => (
                      <div key={src} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 4px', background: 'var(--bg)', marginBottom: 1, borderRadius: 2 }}>
                        <span style={{ color: 'var(--text2)' }}>{src}</span>
                        <strong>{n.toLocaleString()}건</strong>
                      </div>
                    ))}
                  </div>
                  {Object.keys(orderByYear).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>영업현황 — 연도별</div>
                      {Object.entries(orderByYear).sort((a, b) => b[0].localeCompare(a[0])).map(([y, n]) => (
                        <div key={y} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 4px', background: 'var(--bg)', marginBottom: 1, borderRadius: 2 }}>
                          <span>{y}년</span>
                          <strong>{n.toLocaleString()}건</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* 매출 */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>💰 매출 (Total: {sales.length.toLocaleString()}건)</div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Source별</div>
                    {Object.entries(salesBySource).sort((a, b) => b[1] - a[1]).map(([src, n]) => (
                      <div key={src} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 4px', background: 'var(--bg)', marginBottom: 1, borderRadius: 2 }}>
                        <span style={{ color: 'var(--text2)' }}>{src}</span>
                        <strong>{n.toLocaleString()}건</strong>
                      </div>
                    ))}
                  </div>
                  {Object.keys(salesByYear).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>영업현황_S — 연도별</div>
                      {Object.entries(salesByYear).sort((a, b) => b[0].localeCompare(a[0])).map(([y, n]) => (
                        <div key={y} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 4px', background: 'var(--bg)', marginBottom: 1, borderRadius: 2 }}>
                          <span>{y}년</span>
                          <strong>{n.toLocaleString()}건</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>
                ※ 이 표는 React state(Firestore 실시간 구독) 기반. 비정상 source가 있거나 연도별 분포 이상하면 알려주세요.
              </div>
            </details>
          );
        })()}

        <div style={{ marginBottom: 12 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>영업현황 엑셀 선택</button>
        </div>

        {preview && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              {preview.fileName}<br />
              <span style={{ color: 'var(--text2)', fontWeight: 400 }}>
                O시트 (수주): {preview.oTotalRows.toLocaleString()}건
                {preview.sSheetName ? (
                  <> / S시트 (매출): {preview.sTotalRows.toLocaleString()}건 {!preview.sHasValidDateColumn && <span style={{ color: 'var(--red)' }}>⚠ B/L date 컬럼 미발견</span>}</>
                ) : (
                  <span style={{ color: 'var(--text3)' }}> / S시트 없음 (수주만 import)</span>
                )}
              </span>
            </div>

            {/* v3.4.1: 연도 다중 선택 (체크박스) — 경영보고에 필요한 연도만 Import */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', padding: 10, background: 'var(--bg2)', borderRadius: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>📅 Import 연도 선택</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>필요한 연도만 체크 (권장: 당해 + 전년도)</span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                {(() => {
                  const years = [...new Set([...Object.keys(preview.oYearCounts), ...Object.keys(preview.sYearCounts)])]
                    .filter(y => y && y.startsWith('20'))
                    .sort()
                    .reverse();
                  const toggleYear = (y) => {
                    setImportYears(prev => {
                      const next = new Set(prev);
                      if (next.has(y)) next.delete(y);
                      else next.add(y);
                      return next;
                    });
                  };
                  const currentY = String(new Date().getFullYear());
                  const prevY = String(new Date().getFullYear() - 1);
                  return (
                    <>
                      {years.map(y => {
                        const checked = importYears.has(y);
                        const isRecommended = y === currentY || y === prevY;
                        return (
                          <label key={y} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: checked ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: checked ? 'rgba(46,125,50,0.08)' : 'var(--bg)',
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: checked ? 700 : 400,
                            userSelect: 'none',
                          }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleYear(y)}
                              style={{ margin: 0, cursor: 'pointer' }}
                            />
                            <span>{y}년</span>
                            {isRecommended && <span style={{ fontSize: 9, color: 'var(--green, #16a34a)' }}>⭐</span>}
                            <span style={{ fontSize: 9, color: 'var(--text3)' }}>
                              (수주 {(preview.oYearCounts[y] || 0).toLocaleString()} / 매출 {(preview.sYearCounts[y] || 0).toLocaleString()})
                            </span>
                          </label>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setImportYears(new Set([currentY, prevY]))}
                        style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                        title="당해+전년만 선택 (권장)"
                      >
                        ⭐ 당해+전년만
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportYears(new Set(years))}
                        style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportYears(new Set())}
                        style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                      >
                        해제
                      </button>
                    </>
                  );
                })()}
              </div>
              {/* 상태 안내 */}
              <div style={{ width: '100%', marginTop: 4 }}>
                {importYears.size === 0 ? (
                  <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>
                    ⚠ 연도를 1개 이상 선택하세요
                  </span>
                ) : importYears.size === 1 ? (
                  <span style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>
                    ⚠ {[...importYears][0]}년만 선택 — 전년대비 비교 불가
                  </span>
                ) : (() => {
                  const selected = [...importYears].sort().reverse();
                  const totalO = selected.reduce((s, y) => s + (preview.oYearCounts[y] || 0), 0);
                  const totalS = selected.reduce((s, y) => s + (preview.sYearCounts[y] || 0), 0);
                  return (
                    <span style={{ fontSize: 10, color: 'var(--green, #16a34a)', fontWeight: 600 }}>
                      ✅ {selected.join(', ')} 선택됨 — 수주 {totalO.toLocaleString()} / 매출 {totalS.toLocaleString()} · 전년대비 비교 가능
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* 매칭 현황 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              <div className="kpi green" style={{ padding: 10 }}>
                <div className="kpi-label">매칭 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{preview.matchedCustomers}사</div>
              </div>
              <div className={`kpi ${preview.unmatchedCustomers > 0 ? 'red' : ''}`} style={{ padding: 10 }}>
                <div className="kpi-label">미매칭 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{preview.unmatchedCustomers}사</div>
              </div>
              <div className="kpi accent" style={{ padding: 10 }}>
                <div className="kpi-label">선택 연도 수주</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>
                  {(() => {
                    if (!importYears || importYears.size === 0) return '0';
                    const total = [...importYears].reduce((s, y) => s + (preview.oYearCounts[y] || 0), 0);
                    return total.toLocaleString();
                  })()}
                </div>
              </div>
              <div className="kpi" style={{ padding: 10, background: 'rgba(59,130,246,.08)' }}>
                <div className="kpi-label">선택 연도 매출</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>
                  {(() => {
                    if (!importYears || importYears.size === 0) return '0';
                    const total = [...importYears].reduce((s, y) => s + (preview.sYearCounts[y] || 0), 0);
                    return total.toLocaleString();
                  })()}
                </div>
              </div>
              <div className="kpi" style={{ padding: 10 }}>
                <div className="kpi-label">{Number(new Date().getFullYear()) - 1}년 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{preview.priorYearUniqueCount || 0}사</div>
              </div>
            </div>

            {preview.unmatchedNames.length > 0 && (
              <details style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer' }}>미매칭 고객 {preview.unmatchedCustomers}사 보기</summary>
                <div style={{ marginTop: 4 }}>{preview.unmatchedNames.join(', ')}{preview.unmatchedCustomers > 30 ? ` 외 ${preview.unmatchedCustomers - 30}사` : ''}</div>
              </details>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || importYears.size === 0}>
                {importing
                  ? 'Import 중...'
                  : importYears.size === 0
                    ? '⚠ 연도 선택 필요'
                    : `${[...importYears].sort().reverse().join('+')} 수주+매출 Import`}
              </button>
              <button className="btn btn-ghost" onClick={() => { setPreview(null); parsedDataRef.current = null; }}>취소</button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── v3.12: 고객 분류 일괄 적용 도구 ── */}
      <BulkClassificationTool
        accounts={accounts}
        businessPlans={businessPlans}
        appSettings={appSettings}
        saveAccount={saveAccount}
        showToast={showToast}
      />

      {/* ── v3.10: Account 합병 도구 (중복 account 통합) ── */}
      <AccountMergeTool
        accounts={accounts}
        orders={orders}
        sales={sales}
        businessPlans={businessPlans}
        mergeAccounts={mergeAccounts}
      />

      {/* ── v3.7: 사업계획 ↔ 영업현황 정합성 진단 ── */}
      <ReconciliationDiagnostic
        accounts={accounts}
        orders={orders}
        sales={sales}
        businessPlans={businessPlans}
      />

      {/* ── v3.6: 고객명 퍼지 매칭 분석 + Phase 2 적용 ── */}
      <FuzzyMatchAnalyzer
        accounts={accounts}
        orders={orders}
        sales={sales}
        businessPlans={businessPlans}
        applyFuzzyMatches={applyFuzzyMatches}
        showToast={showToast}
      />

      {/* ── 사업계획 Import ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📊 사업계획 Import (수주목표 + 매출목표)</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>두 유형의 파일 모두 지원하며 필요에 따라 <strong>한 파일씩 순서대로</strong> 업로드 가능합니다:</div>
          <div style={{ padding: '6px 10px', background: 'var(--bg2)', borderRadius: 4, marginBottom: 6, fontSize: 11 }}>
            <strong>① 수주목표 파일 (예: <code>26년 수주목표_월별_담당별_고객별.xlsx</code>)</strong><br />
            → <strong>고객별.담당별.지역별.사업구분</strong> 시트 → 고객별 수주 목표 (<code>type: customer</code>)<br />
            → <strong>품목별</strong> 시트 → 품목별 목표 (<code>type: product</code>)
          </div>
          <div style={{ padding: '6px 10px', background: 'rgba(59,130,246,.06)', borderRadius: 4, marginBottom: 6, fontSize: 11 }}>
            <strong>② 사업계획 파일 (예: <code>2026년 영업 사업계획_v10_251229.xlsx</code>)</strong><br />
            → <strong>26년도 월별수주매출S_*</strong> 또는 <strong>월별매출</strong> 시트 → 사업부별 매출 목표 해외/BPU/국내 (<code>type: team_sales</code>)<br />
            → 단위: 원 / 중복 "국내" 행 자동 스킵
          </div>
          <div style={{ fontSize: 11, color: 'var(--green, #16a34a)', fontWeight: 600 }}>
            💡 Type별 교체: 한 파일만 업로드해도 다른 type(수주/매출)의 기존 데이터는 유지됩니다.
          </div>
        </div>

        {currentPlanCount > 0 && (() => {
          const unlinkedCount = businessPlans.filter(p => p.year === planYear && (p.type === 'customer' || !p.type) && !p.account_id).length;
          return (
            <div className="alert-banner warning" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span>📋</span> {planYear}년 사업계획: 고객 <strong>{customerPlanCount}</strong>건 + 품목 <strong>{productPlanCount}</strong>건
                {unlinkedCount > 0 && <span style={{ color: 'var(--red)', fontSize: 11 }}>({unlinkedCount}건 미연결)</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {unlinkedCount > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={handleRelinkPlans} disabled={relinking}>
                    {relinking ? '연결 중...' : `고객 재연결 (${unlinkedCount}건)`}
                  </button>
                )}
                {bizTypeSyncNeeded > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={handleSyncBizType} disabled={syncing} style={{ background: 'var(--green)' }}>
                    {syncing ? '동기화 중...' : `사업형태 동기화 (${bizTypeSyncNeeded}건)`}
                  </button>
                )}
                <button className="btn btn-danger btn-sm"
                  onClick={() => { if (confirm(`${planYear}년 사업계획을 초기화하시겠습니까?`)) clearBusinessPlans(planYear); }}>
                  초기화
                </button>
              </div>
            </div>
          );
        })()}

        <div style={{ marginBottom: 12 }}>
          <input ref={planFileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handlePlanFileSelect} style={{ display: 'none' }} />
          <button className="btn btn-primary" onClick={() => planFileRef.current?.click()}>수주목표 엑셀 선택</button>
        </div>

        {planPreview && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              {planPreview.fileName} / {planPreview.sheetName}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              <div className="kpi accent" style={{ padding: 10 }}>
                <div className="kpi-label">수주 연간 목표</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(planPreview.annualTotal)}</div>
              </div>
              <div className="kpi green" style={{ padding: 10 }}>
                <div className="kpi-label">매칭 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{planPreview.matched}사</div>
              </div>
              <div className={`kpi ${planPreview.unmatched > 0 ? 'red' : ''}`} style={{ padding: 10 }}>
                <div className="kpi-label">미매칭 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{planPreview.unmatched}사</div>
              </div>
              <div className="kpi" style={{ padding: 10 }}>
                <div className="kpi-label">품목별 목표</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{planPreview.productPlans.length}개</div>
              </div>
              <div className={`kpi ${planPreview.salesTargetFound ? 'green' : 'red'}`} style={{ padding: 10, background: planPreview.salesTargetFound ? 'rgba(59,130,246,.08)' : undefined }}>
                <div className="kpi-label">팀별 매출목표</div>
                <div className="kpi-value" style={{ fontSize: 14 }}>
                  {planPreview.salesTargetFound
                    ? `${Object.keys(planPreview.teamSalesTargets).filter(k => Object.values(planPreview.teamSalesTargets[k] || {}).reduce((s, v) => s + v, 0) > 0).length}팀`
                    : '없음'}
                </div>
              </div>
            </div>

            {planPreview.salesTargetFound && (
              <details style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12, padding: '6px 10px', background: 'var(--bg2)', borderRadius: 4 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  📘 팀별 매출 목표 상세 — "{planPreview.salesSheetUsed}" 시트에서 추출
                </summary>
                <div style={{ marginTop: 6 }}>
                  {Object.entries(planPreview.teamSalesTargets || {}).map(([team, targets]) => {
                    const annual = Object.values(targets).reduce((s, v) => s + v, 0);
                    if (annual <= 0) return null;
                    return (
                      <div key={team} style={{ padding: '2px 0' }}>
                        • <strong>{team}</strong> — 연간 {fmtKRW(annual)}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {!planPreview.salesTargetFound && planPreview.salesCandidateSheets?.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12, padding: '8px 10px', background: 'rgba(220,38,38,.06)', borderRadius: 4, border: '1px solid rgba(220,38,38,.2)' }}>
                ⚠ 매출목표 시트 [<strong>{planPreview.salesCandidateSheets.join(', ')}</strong>]가 있으나 <strong>값이 비어 있습니다</strong>.<br />
                → <strong>{'`2026년 영업 사업계획_v10_251229.xlsx`'} (담당자배정 X)</strong> 파일 업로드 권장
                — 해외/BPU/국내 월별 매출 목표가 채워진 버전 필요
              </div>
            )}

            {!planPreview.salesTargetFound && (!planPreview.salesCandidateSheets || planPreview.salesCandidateSheets.length === 0) && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 4 }}>
                ℹ 이 파일에는 "월별매출" 시트가 없습니다. 수주 목표만 import 됩니다.<br />
                → 매출 목표 필요 시 <strong>{'`2026년 영업 사업계획_v10_*.xlsx`'}</strong> 파일 업로드
              </div>
            )}

            {planPreview.unmatchedNames.length > 0 && (
              <details style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer' }}>미매칭 고객 {planPreview.unmatched}사 보기</summary>
                <div style={{ marginTop: 4 }}>{planPreview.unmatchedNames.join(', ')}</div>
              </details>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handlePlanImport} disabled={planImporting}>
                {planImporting ? 'Import 중...' : '사업계획 Import 실행'}
              </button>
              <button className="btn btn-ghost" onClick={() => setPlanPreview(null)}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* ── FCST Import ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📋 FCST Import (수주 예측)</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          영업수주목표관리 엑셀 파일의 <strong>FCST</strong> 시트에서 수주 예측 데이터를 import합니다.<br />
          재업로드 시 기존 FCST import 데이터를 교체합니다.
        </p>

        {currentFcstImports > 0 && (
          <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(46,125,50,.08)', borderColor: 'rgba(46,125,50,.3)' }}>
            <span>📋</span> FCST 수주예측 <strong>{currentFcstImports.toLocaleString()}건</strong> import됨
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input ref={fcstFileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFcstFileSelect} style={{ display: 'none' }} />
          <button className="btn btn-primary" onClick={() => fcstFileRef.current?.click()}>FCST 엑셀 선택</button>
        </div>

        {fcstPreview && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              {fcstPreview.fileName} / {fcstPreview.sheetName} 시트 ({fcstPreview.totalRows.toLocaleString()}건)
            </div>

            {/* 연도 선택 */}
            {Object.keys(fcstPreview.yearCounts).length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Import 연도:</span>
                <select value={fcstYear} onChange={e => setFcstYear(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  <option value="">전체</option>
                  {Object.keys(fcstPreview.yearCounts).sort().reverse().map(y => (
                    <option key={y} value={y}>{y}년 ({fcstPreview.yearCounts[y].toLocaleString()}건)</option>
                  ))}
                </select>
              </div>
            )}

            {/* KPI 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              <div className="kpi accent" style={{ padding: 10 }}>
                <div className="kpi-label">전체 건수</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fcstPreview.totalRows.toLocaleString()}</div>
              </div>
              <div className="kpi green" style={{ padding: 10 }}>
                <div className="kpi-label">고객 수</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fcstPreview.customerCount}사</div>
              </div>
              <div className={`kpi ${fcstPreview.unmatchedCustomers > 0 ? 'red' : ''}`} style={{ padding: 10 }}>
                <div className="kpi-label">미매칭 고객</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{fcstPreview.unmatchedCustomers}사</div>
              </div>
              <div className="kpi" style={{ padding: 10 }}>
                <div className="kpi-label">총 원화금액</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>{fmtKRW(fcstPreview.totalKRW)}</div>
              </div>
            </div>

            {fcstPreview.unmatchedNames.length > 0 && (
              <details style={{ fontSize: 11, color: 'var(--red)', marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer' }}>미매칭 고객 {fcstPreview.unmatchedCustomers}사 보기</summary>
                <div style={{ marginTop: 4 }}>{fcstPreview.unmatchedNames.join(', ')}{fcstPreview.unmatchedCustomers > 30 ? ` 외 ${fcstPreview.unmatchedCustomers - 30}사` : ''}</div>
              </details>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleFcstImport} disabled={fcstImporting}>
                {fcstImporting ? 'Import 중...' : `FCST Import 실행${fcstYear ? ` (${fcstYear}년)` : ''}`}
              </button>
              <button className="btn btn-ghost" onClick={() => { setFcstPreview(null); fcstParsedRef.current = null; }}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 담당자 동기화 ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">👤 사업계획 → 고객 담당자 동기화</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          사업계획에 설정된 담당자(sales_rep)를 각 고객 카드에 일괄 반영합니다.<br />
          고객 카드에 담당자가 비어있거나, 사업계획과 다른 경우 업데이트됩니다.
        </div>
        {(() => {
          const currentYear = new Date().getFullYear();
          const plans = businessPlans.filter(p => p.year === currentYear && (p.type === 'customer' || !p.type) && p.sales_rep);
          // 고객별 담당자 매핑 (account_id 또는 customer_name으로 매칭)
          const repMap = {};
          plans.forEach(p => {
            if (p.account_id && !repMap[p.account_id]) {
              repMap[p.account_id] = p.sales_rep;
              return;
            }
            if (p.customer_name) {
              const name = p.customer_name.toLowerCase().trim();
              const acc = accounts.find(a => (a.company_name || '').toLowerCase().trim() === name);
              if (acc && !repMap[acc.id]) repMap[acc.id] = p.sales_rep;
            }
          });
          const needSync = accounts.filter(a => repMap[a.id] && a.sales_rep !== repMap[a.id]);
          const alreadySynced = accounts.filter(a => repMap[a.id] && a.sales_rep === repMap[a.id]);

          return (
            <>
              <div style={{ fontSize: 11, marginBottom: 8 }}>
                사업계획 담당자 정보: <strong>{Object.keys(repMap).length}</strong>개사 |
                이미 일치: <strong style={{ color: 'var(--green)' }}>{alreadySynced.length}</strong>개사 |
                업데이트 필요: <strong style={{ color: needSync.length > 0 ? 'var(--red)' : 'var(--green)' }}>{needSync.length}</strong>개사
              </div>
              {needSync.length > 0 && (
                <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 10, fontSize: 11 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>고객명</th>
                        <th>현재 담당자</th>
                        <th>→</th>
                        <th>사업계획 담당자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {needSync.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 600 }}>{a.company_name}</td>
                          <td style={{ color: a.sales_rep ? 'var(--text2)' : 'var(--red)' }}>{a.sales_rep || '(비어있음)'}</td>
                          <td style={{ textAlign: 'center' }}>→</td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>{repMap[a.id]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                className="btn btn-primary"
                disabled={needSync.length === 0}
                onClick={async () => {
                  if (!confirm(`${needSync.length}개 고객의 담당자를 업데이트하시겠습니까?`)) return;
                  let count = 0;
                  for (const a of needSync) {
                    await saveAccount({ ...a, sales_rep: repMap[a.id] });
                    count++;
                  }
                  showToast(`${count}개 고객 담당자 동기화 완료`, 'success');
                }}
              >
                {needSync.length > 0 ? `${needSync.length}개 고객 담당자 동기화 실행` : '모두 동기화됨 ✓'}
              </button>
            </>
          );
        })()}
      </div>

      {/* ── 데이터 스냅샷 ── */}
      <SnapshotSection />

      {/* ── 등록 현황 ── */}
      <div className="card">
        <div className="card-title">📊 등록 현황</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          등록 고객: <strong>{accounts.length}</strong>개사 · 수주이력: <strong>{orders.length.toLocaleString()}</strong>건 · 사업계획: <strong>{currentPlanCount}</strong>건 · FCST: <strong>{currentFcstImports}</strong>건
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          엑셀 import 시 고객명이 아래 목록과 정확히 일치해야 매칭됩니다.
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {accounts.map(a => (
            <span key={a.id} className="region-badge" style={{ margin: '2px 4px' }}>{a.company_name || '(미입력)'}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   데이터 스냅샷 관리 컴포넌트
   ══════════════════════════════════════ */
function SnapshotSection() {
  const { accounts, activityLogs, orders, contracts, forecasts, businessPlans, restoreSnapshot, showToast, fbStatus } = useAccount();

  const [snapName, setSnapName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listSnapshots();
      setList(items);
    } catch (e) {
      console.error('스냅샷 목록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fbStatus === 'connected') loadList();
  }, [fbStatus, loadList]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSnapshot(snapName || `백업 ${new Date().toLocaleDateString('ko-KR')}`, {
        accounts, activityLogs, orders, contracts, forecasts, businessPlans,
      });
      setSnapName('');
      showToast('스냅샷 저장 완료', 'success');
      loadList();
    } catch (e) {
      showToast('스냅샷 저장 실패: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (id) => {
    setRestoring(true);
    try {
      await restoreSnapshot(id);
      setConfirmId(null);
      loadList();
    } catch (e) {
      showToast('복원 실패: ' + e.message, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('이 스냅샷을 삭제하시겠습니까?')) return;
    try {
      await removeSnapshot(id);
      showToast('스냅샷 삭제 완료', 'success');
      loadList();
    } catch (e) {
      showToast('삭제 실패: ' + e.message, 'error');
    }
  };

  if (fbStatus !== 'connected') return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">💾 데이터 스냅샷</div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
        현재 전체 데이터를 백업하고, 필요 시 특정 시점으로 복원할 수 있습니다.<br />
        대량 작업(일괄 동기화, import 등) 전에 백업을 권장합니다.
      </p>

      {/* 저장 폼 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          value={snapName}
          onChange={e => setSnapName(e.target.value)}
          placeholder="스냅샷 이름 (예: 동기화 전 백업)"
          style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
        />
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '현재 상태 백업'}
        </button>
      </div>

      {/* 현재 데이터 요약 */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>고객 {accounts.length}</span>
        <span>활동로그 {activityLogs.length}</span>
        <span>수주 {orders.length}</span>
        <span>계약 {contracts.length}</span>
        <span>FCST {forecasts.length}</span>
        <span>사업계획 {businessPlans.length}</span>
      </div>

      {/* 스냅샷 목록 */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: 12, textAlign: 'center' }}>로딩 중...</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: 12, textAlign: 'center' }}>저장된 스냅샷이 없습니다</div>
      ) : (
        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>이름</th>
                <th>날짜</th>
                <th>고객</th>
                <th>수주</th>
                <th>사업계획</th>
                <th style={{ width: 120 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{new Date(s.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ textAlign: 'center' }}>{s.counts?.accounts || 0}</td>
                  <td style={{ textAlign: 'center' }}>{s.counts?.orders || 0}</td>
                  <td style={{ textAlign: 'center' }}>{s.counts?.businessPlans || 0}</td>
                  <td>
                    {confirmId === s.id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRestore(s.id)} disabled={restoring}>
                          {restoring ? '복원중...' : '확인'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>취소</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => setConfirmId(s.id)}>↩ 복원</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s.id)}>삭제</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmId && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(211,47,47,.08)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
          ⚠️ 복원하면 현재 데이터가 스냅샷 시점으로 덮어쓰입니다. 위 "확인" 버튼을 눌러주세요.
        </div>
      )}
    </div>
  );
}
