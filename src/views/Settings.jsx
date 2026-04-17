import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useAccount } from '../context/AccountContext';
import { genId, today } from '../lib/utils';
import { saveSnapshot, listSnapshots, deleteSnapshot as removeSnapshot } from '../lib/snapshots';
import { savePriorYearCustomers, loadPriorYearCustomers } from '../lib/customerClassification';

// 엑셀 날짜 시리얼 → YYYY-MM-DD 변환
function excelDateToStr(serial) {
  if (!serial) return '';
  if (typeof serial === 'string') return serial;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().slice(0, 10);
}

// 지역명 영→한 매핑
const REGION_EN_TO_KR = {
  'N.America': '북미', 'North America': '북미', 'NA': '북미',
  'Europe': '유럽', 'EU': '유럽',
  'Asia': '아시아',
  'Latin America': '중남미', 'S.America': '중남미', 'LATAM': '중남미',
  'M.E.': '중동', 'Middle East': '중동',
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

export default function Settings() {
  const { accounts, saveAccount, importOrders, importSales, importBusinessPlans, businessPlans, clearBusinessPlans, orders, sales, forecasts, saveForecast, removeForecast, showToast, isAdmin, teamMembers, saveTeamMembers } = useAccount();

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
    const plans = businessPlans.filter(p => p.year === year && p.type !== 'product');
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

      const unlinked = businessPlans.filter(p => p.year === year && p.type !== 'product' && !p.account_id);
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
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));

  // 파일 데이터를 ref로 보관 (React state에 13k 행 넣지 않음)
  const parsedDataRef = useRef(null);

  // 공통 헤더 매핑 함수 (O/S 시트 공용)
  const mapHeadersToColIdx = (headers, isOSheet = true) => {
    return {
      status: headers.indexOf('진행상태'),
      orderNo: headers.indexOf('수주번호'),
      customer: headers.indexOf('고객명'),
      productGroup: headers.indexOf('제품군'),
      // O 시트는 '오더일', S 시트는 'B/L date'/'B/L 날짜'/'출하일' 등 변종 시도
      orderDate: isOSheet
        ? headers.indexOf('오더일')
        : (() => {
            const candidates = ['B/L date', 'B/L Date', 'BL Date', 'B/L DATE', 'B/L 날짜', 'B/L일', '매출일', '출하일', 'BL date', 'bl_date'];
            for (const c of candidates) {
              const i = headers.findIndex(h => h.toLowerCase() === c.toLowerCase());
              if (i >= 0) return i;
            }
            // 부분 매칭 시도
            return headers.findIndex(h => /b\s*\/?\s*l/i.test(h) && /date|날짜|일/.test(h));
          })(),
      quantity: headers.indexOf('수량'),
      unitPrice: headers.indexOf('단가'),
      currency: headers.indexOf('통화'),
      region: headers.indexOf('지역'),
      country: headers.indexOf('국가'),
      salesRep: headers.indexOf('영업담당'),
      orderAmount: headers.indexOf('수주금액') >= 0 ? headers.indexOf('수주금액') : headers.indexOf('매출금액'),
      orderType: headers.indexOf('오더 구분'),
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
      const oColIdx = mapHeadersToColIdx(oHeaders, true);
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
          sColIdx = mapHeadersToColIdx(sHeaders, false);
          sHasValidDateColumn = sColIdx.orderDate >= 0;
          sDataRows = sRows.slice(1).filter(r => r && r[sColIdx.customer]);
          sDataRows.forEach(r => {
            const dateVal = r[sColIdx.orderDate];
            if (!dateVal) return;
            const year = excelDateToStr(dateVal).slice(0, 4);
            if (year && year.startsWith('20')) sYearCounts[year] = (sYearCounts[year] || 0) + 1;
          });
        }
      }

      // 고객 매칭 (O+S 모두 대상)
      const accountMap = {};
      accounts.forEach(a => { if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = true; });
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
    setImporting(true);

    try {
      const { oDataRows, oColIdx, sDataRows, sColIdx, priorYearNames } = parsedDataRef.current;

      // 전년도 고객 목록 저장 (고객 분류에 사용)
      if (priorYearNames && priorYearNames.length > 0) {
        savePriorYearCustomers(priorYearNames);
      }

      // 기존 계정 매핑
      const accountMap = {};
      accounts.forEach(a => { if (a.company_name) accountMap[a.company_name.toLowerCase().trim()] = a.id; });

      const excludeStatuses = ['수주취소'];
      const excludeTypes = ['무상샘플', '수리출고'];

      // ── O 시트 (수주) 1차 패스: 유효행 추출 + 미매칭 고객 수집 ──
      const oValidRows = [];
      const unmatchedCustomerInfo = {};
      let oFiltered = 0;

      oDataRows.forEach(row => {
        const status = String(row[oColIdx.status] || '').trim();
        const orderType = String(row[oColIdx.orderType] || '').trim();
        if (excludeStatuses.includes(status)) { oFiltered++; return; }
        if (excludeTypes.includes(orderType)) { oFiltered++; return; }

        const dateVal = row[oColIdx.orderDate];
        if (!dateVal) return;
        const orderDate = excelDateToStr(dateVal);
        if (importYear && !orderDate.startsWith(importYear)) return;

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

      // ── S 시트 (매출) 1차 패스: 유효행 추출 + 미매칭 고객 수집 (O와 동일 로직) ──
      const sValidRows = [];
      let sFiltered = 0;
      const hasSheetS = sDataRows && sColIdx && sColIdx.orderDate >= 0;
      if (hasSheetS) {
        sDataRows.forEach(row => {
          const status = String(row[sColIdx.status] || '').trim();
          const orderType = String(row[sColIdx.orderType] || '').trim();
          if (excludeStatuses.includes(status)) { sFiltered++; return; }
          if (excludeTypes.includes(orderType)) { sFiltered++; return; }

          const dateVal = row[sColIdx.orderDate];
          if (!dateVal) return;
          const saleDate = excelDateToStr(dateVal);
          if (importYear && !saleDate.startsWith(importYear)) return;

          const customer = String(row[sColIdx.customer] || '').trim();
          if (!customer) return;

          const saleAmount = parseFloat(row[sColIdx.orderAmount]) || 0;
          if (saleAmount <= 0) return;

          sValidRows.push(row);

          // S 시트 고객도 미매칭이면 자동 계정 생성 (O와 동일)
          const key = customer.toLowerCase().trim();
          if (!accountMap[key] && !unmatchedCustomerInfo[key]) {
            unmatchedCustomerInfo[key] = {
              company_name: customer,
              region: mapRegion(String(row[sColIdx.region] || '').trim()),
              country: String(row[sColIdx.country] || '').trim(),
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

      // ── 2차 패스: 매출(Sales) 생성 ──
      const newSales = [];
      if (hasSheetS) {
        sValidRows.forEach(row => {
          const customer = String(row[sColIdx.customer] || '').trim();
          const accountId = accountMap[customer.toLowerCase().trim()];
          if (!accountId) return;
          const orderNo = String(row[sColIdx.orderNo] || '').trim();
          const saleDate = excelDateToStr(row[sColIdx.orderDate]);
          newSales.push({
            id: `sal_${orderNo || genId('sal')}_${saleDate}`,
            account_id: accountId,
            customer_name: customer,
            order_number: orderNo,
            sale_date: saleDate, // B/L date 기준
            product_category: String(row[sColIdx.productGroup] || '').trim(),
            sale_amount: parseFloat(row[sColIdx.orderAmount]) || 0,
            currency: String(row[sColIdx.currency] || 'KRW').trim(),
            quantity: parseInt(row[sColIdx.quantity]) || 0,
            unit_price: parseFloat(row[sColIdx.unitPrice]) || 0,
            sales_rep: String(row[sColIdx.salesRep] || '').trim(),
            region: mapRegion(String(row[sColIdx.region] || '').trim()),
            country: String(row[sColIdx.country] || '').trim(),
            status: String(row[sColIdx.status] || '').trim(),
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

      // 고객별 시트 찾기
      const mainSheet = wb.SheetNames.find(s => s.includes('고객별')) || wb.SheetNames[0];
      const ws = wb.Sheets[mainSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // 헤더 행 찾기 (고객사 + 담당자 포함)
      let headerIdx = -1;
      let colMap = {};
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

      if (headerIdx === -1) {
        showToast('헤더 행을 찾을 수 없습니다 (고객사, 담당자 컬럼 필요)', 'error');
        return;
      }

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
      const planRows = [];
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

      setPlanPreview({
        fileName: file.name, sheetName: mainSheet,
        planRows, productPlans,
        totalRows: planRows.length,
        matched: matchedSet.size, unmatched: unmatchedNames.length,
        unmatchedNames, annualTotal,
      });
      showToast(`${file.name} 로드 (${planRows.length}개 고객, ${productPlans.length}개 품목)`, 'info');
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

      if (plans.length > 0) importBusinessPlans(plans);

      showToast(`사업계획 ${plans.length}건 import${newAccountCount > 0 ? ` (신규 고객 ${newAccountCount}사 자동생성)` : ''}`, 'success');
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
      const unlinked = businessPlans.filter(p => p.year === year && p.type !== 'product' && !p.account_id);
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
      const plans = businessPlans.filter(p => p.year === year && p.type !== 'product' && p.biz_type);

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
    const plans = businessPlans.filter(p => p.year === year && p.type !== 'product' && p.biz_type);
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
  const customerPlanCount = businessPlans.filter(p => p.year === planYear && p.type !== 'product').length;
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

      {/* ── 영업현황 Import (수주 O sheet + 매출 S sheet) ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📥 영업현황 Import (수주 + 매출)</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          영업현황 엑셀 파일의 <strong>O시트(수주, 오더일 기준)</strong>와 <strong>S시트(매출, B/L date 기준)</strong>를 동시에 import합니다.<br />
          수주취소·무상샘플은 자동 제외. 재업로드 시 기존 import 데이터를 교체합니다.
        </p>

        {currentOrderImports > 0 && (
          <div className="alert-banner" style={{ marginBottom: 12, background: 'rgba(46,125,50,.08)', borderColor: 'rgba(46,125,50,.3)' }}>
            <span>📋</span> 수주 <strong>{currentOrderImports.toLocaleString()}건</strong>
            {sales && sales.length > 0 && (
              <> / 매출 <strong>{sales.filter(s => s.source === 'excel_import_영업현황_S').length.toLocaleString()}건</strong></>
            )} import됨
          </div>
        )}

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

            {/* 연도 선택 (수주 기준) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Import 연도:</span>
              <select value={importYear} onChange={e => setImportYear(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                {[...new Set([...Object.keys(preview.oYearCounts), ...Object.keys(preview.sYearCounts)])].sort().reverse().map(y => (
                  <option key={y} value={y}>{y}년 (수주 {(preview.oYearCounts[y] || 0).toLocaleString()} / 매출 {(preview.sYearCounts[y] || 0).toLocaleString()})</option>
                ))}
              </select>
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
                <div className="kpi-label">{importYear}년 수주</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{(preview.oYearCounts[importYear] || 0).toLocaleString()}</div>
              </div>
              <div className="kpi" style={{ padding: 10, background: 'rgba(59,130,246,.08)' }}>
                <div className="kpi-label">{importYear}년 매출</div>
                <div className="kpi-value" style={{ fontSize: 18 }}>{(preview.sYearCounts[importYear] || 0).toLocaleString()}</div>
              </div>
              <div className="kpi" style={{ padding: 10 }}>
                <div className="kpi-label">{Number(importYear) - 1}년 고객</div>
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
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Import 중...' : `${importYear}년 수주+매출 Import`}
              </button>
              <button className="btn btn-ghost" onClick={() => { setPreview(null); parsedDataRef.current = null; }}>취소</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 사업계획 Import ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📊 사업계획 Import (수주목표)</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          수주목표 엑셀에서 <strong>월별·담당별·고객별</strong> 목표 금액을 import합니다.<br />
          미매칭 고객도 함께 import되어 전체 목표 합계가 유지됩니다. 품목별 시트가 있으면 품목별 목표도 포함됩니다.
        </p>

        {currentPlanCount > 0 && (() => {
          const unlinkedCount = businessPlans.filter(p => p.year === planYear && p.type !== 'product' && !p.account_id).length;
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              <div className="kpi accent" style={{ padding: 10 }}>
                <div className="kpi-label">연간 목표 합계</div>
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
            </div>

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
          const plans = businessPlans.filter(p => p.year === currentYear && p.type !== 'product' && p.sales_rep);
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
