import { useState, useMemo, useCallback, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { PRODUCTS } from '../lib/constants';
import { genId } from '../lib/utils';

const CURRENCIES = ['USD', 'EUR', 'CNY', 'KRW'];
const SOURCES = ['고객사', '파트너', '전시회', '조사'];

const EMPTY_FORM = {
  country: '', category: '', model: '', competitor: '',
  ourModel: '', ourDealerPrice: '', ourHospitalPrice: '',
  dealerPrice: '', hospitalPrice: '',
  currency: 'USD', source: '고객사', customerId: '', remarks: '',
};

const filterSelStyle = {
  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 12, minWidth: 110,
};

const fieldStyle = {
  width: '100%', padding: '6px 8px', border: '1px solid var(--border)',
  borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600,
};

function PriceCompare({ ours, theirs, currency }) {
  if (ours == null && theirs == null) return <span style={{ color: 'var(--text3)' }}>-</span>;
  const fmt = (n) => n != null ? n.toLocaleString() : '-';
  let indicator = null;
  if (ours != null && theirs != null && theirs > 0) {
    const diff = ((ours - theirs) / theirs) * 100;
    const isLower = diff < 0;
    indicator = (
      <span style={{
        fontSize: 10, marginLeft: 4, fontWeight: 700,
        color: isLower ? 'var(--green)' : 'var(--red)',
      }}>
        {isLower ? '▼' : '▲'}{Math.abs(diff).toFixed(0)}%
      </span>
    );
  }
  return (
    <div style={{ lineHeight: 1.6 }}>
      {theirs != null && (
        <div style={{ color: 'var(--text2)', fontSize: 11 }}>
          경: <span style={{ fontWeight: 600 }}>{fmt(theirs)}</span>
        </div>
      )}
      {ours != null && (
        <div style={{ fontSize: 11 }}>
          자: <span style={{ fontWeight: 600 }}>{fmt(ours)}</span>
          {indicator}
        </div>
      )}
    </div>
  );
}

export default function CompetitorView() {
  const {
    competitors, saveCompetitorItem, removeCompetitor,
    isAdmin, currentUser, accounts, showToast,
  } = useAccount();

  const fileInputRef = useRef(null);

  const [filterCountry, setFilterCountry]       = useState('');
  const [filterCategory, setFilterCategory]     = useState('');
  const [filterCompetitor, setFilterCompetitor] = useState('');
  const [filterCurrency, setFilterCurrency]     = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);

  const countries = useMemo(() =>
    [...new Set((competitors || []).map(c => c.country).filter(Boolean))].sort(),
    [competitors]
  );
  const competitorNames = useMemo(() =>
    [...new Set((competitors || []).map(c => c.competitor).filter(Boolean))].sort(),
    [competitors]
  );

  const filtered = useMemo(() => {
    let data = [...(competitors || [])];
    if (filterCountry)    data = data.filter(c => c.country === filterCountry);
    if (filterCategory)   data = data.filter(c => c.category === filterCategory);
    if (filterCompetitor) data = data.filter(c => c.competitor === filterCompetitor);
    if (filterCurrency)   data = data.filter(c => c.currency === filterCurrency);
    return data.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [competitors, filterCountry, filterCategory, filterCompetitor, filterCurrency]);

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      country:          item.country || '',
      category:         item.category || '',
      model:            item.model || '',
      competitor:       item.competitor || '',
      ourModel:         item.ourModel || '',
      dealerPrice:      item.dealerPrice != null ? String(item.dealerPrice) : '',
      hospitalPrice:    item.hospitalPrice != null ? String(item.hospitalPrice) : '',
      ourDealerPrice:   item.ourDealerPrice != null ? String(item.ourDealerPrice) : '',
      ourHospitalPrice: item.ourHospitalPrice != null ? String(item.ourHospitalPrice) : '',
      currency:         item.currency || 'USD',
      source:           item.source || '고객사',
      customerId:       item.customerId || '',
      remarks:          item.remarks || '',
    });
    setShowModal(true);
  };

  const setField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = useCallback(async () => {
    if (!form.country || !form.competitor) {
      alert('국가와 경쟁사는 필수입니다.');
      return;
    }
    const toNum = (v) => v !== '' ? Number(v) : null;
    const item = {
      id:               editingId || genId('comp'),
      country:          form.country.trim(),
      category:         form.category,
      model:            form.model.trim(),
      competitor:       form.competitor.trim(),
      ourModel:         form.ourModel.trim(),
      dealerPrice:      toNum(form.dealerPrice),
      hospitalPrice:    toNum(form.hospitalPrice),
      ourDealerPrice:   toNum(form.ourDealerPrice),
      ourHospitalPrice: toNum(form.ourHospitalPrice),
      currency:         form.currency,
      source:           form.source,
      customerId:       form.customerId || null,
      remarks:          form.remarks.trim(),
      updatedAt:        new Date().toISOString(),
      updatedBy:        currentUser || '',
    };
    await saveCompetitorItem(item);
    setShowModal(false);
  }, [form, editingId, currentUser, saveCompetitorItem]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('이 항목을 삭제하시겠습니까?')) return;
    await removeCompetitor(id);
  }, [removeCompetitor]);

  const handleExport = useCallback(async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const rows = [
      ['경쟁사 가격 현황'],
      [`추출일: ${new Date().toISOString().slice(0, 10)}`],
      ['※ ID 컬럼을 삭제하지 마세요. 가져오기 시 기존 항목 식별에 사용됩니다.'],
      ['ID', '국가', '카테고리', '경쟁사', '경쟁 모델', '자사 모델',
       '경쟁사 대리점가', '자사 대리점가', '경쟁사 병원납품가', '자사 병원납품가',
       '통화', '출처', '날짜', '입력자', '비고', '연결 고객사'],
      ...filtered.map(c => {
        const acc = (accounts || []).find(a => a.id === c.customerId);
        return [
          c.id || '',
          c.country || '', c.category || '', c.competitor || '', c.model || '', c.ourModel || '',
          c.dealerPrice ?? '', c.ourDealerPrice ?? '',
          c.hospitalPrice ?? '', c.ourHospitalPrice ?? '',
          c.currency || '', c.source || '',
          (c.updatedAt || '').slice(0, 10), c.updatedBy || '',
          c.remarks || '', acc ? acc.company_name : '',
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 7 }, { wch: 8 }, { wch: 12 }, { wch: 9 }, { wch: 24 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, '경쟁사 가격');
    XLSX.writeFile(wb, `경쟁사가격현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [filtered, accounts]);

  const handleImport = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const headerIdx = allRows.findIndex(r => r[0] === 'ID' && r[1] === '국가');
    if (headerIdx < 0) {
      alert('올바른 형식의 파일이 아닙니다.\n이 CRM에서 내보낸 Excel 파일을 사용해 주세요.');
      return;
    }

    const headers = allRows[headerIdx];
    const col = (name) => headers.indexOf(name);
    const toNum = (v) => {
      if (v === '' || v == null) return null;
      const n = Number(String(v).replace(/,/g, ''));
      return isNaN(n) ? null : n;
    };

    const dataRows = allRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));
    const items = dataRows.map(row => ({
      id:               String(row[col('ID')] || '').trim() || genId('comp'),
      country:          String(row[col('국가')] || '').trim(),
      category:         String(row[col('카테고리')] || '').trim(),
      competitor:       String(row[col('경쟁사')] || '').trim(),
      model:            String(row[col('경쟁 모델')] || '').trim(),
      ourModel:         String(row[col('자사 모델')] || '').trim(),
      dealerPrice:      toNum(row[col('경쟁사 대리점가')]),
      ourDealerPrice:   toNum(row[col('자사 대리점가')]),
      hospitalPrice:    toNum(row[col('경쟁사 병원납품가')]),
      ourHospitalPrice: toNum(row[col('자사 병원납품가')]),
      currency:         CURRENCIES.includes(row[col('통화')]) ? row[col('통화')] : 'USD',
      source:           SOURCES.includes(row[col('출처')]) ? row[col('출처')] : '고객사',
      remarks:          String(row[col('비고')] || '').trim(),
      customerId:       null,
      updatedAt:        new Date().toISOString(),
      updatedBy:        currentUser || '',
    })).filter(item => item.country && item.competitor);

    if (items.length === 0) {
      alert('국가와 경쟁사가 입력된 유효한 행이 없습니다.');
      return;
    }

    const existingIds = new Set((competitors || []).map(c => c.id));
    const updateCount = items.filter(i => existingIds.has(i.id)).length;
    const addCount = items.length - updateCount;
    const msg = `총 ${items.length}건을 가져옵니다.\n\n• 신규 추가: ${addCount}건\n• 기존 항목 수정: ${updateCount}건\n\n계속하시겠습니까?`;
    if (!window.confirm(msg)) return;

    let ok = 0;
    for (const item of items) {
      try { await saveCompetitorItem(item); ok++; } catch (err) { console.error(err); }
    }
    showToast(`${ok}건 가져오기 완료`, 'success');
  }, [competitors, currentUser, saveCompetitorItem, showToast]);

  const hasFilter = filterCountry || filterCategory || filterCompetitor || filterCurrency;
  const clearFilters = () => {
    setFilterCountry(''); setFilterCategory('');
    setFilterCompetitor(''); setFilterCurrency('');
  };

  const thStyle = (align = 'left', sub = false) => ({
    padding: sub ? '3px 8px' : '7px 8px',
    textAlign: align,
    fontSize: sub ? 10 : 11,
    fontWeight: 600,
    color: sub ? 'var(--text3)' : 'var(--text2)',
    background: sub ? 'rgba(0,0,0,.02)' : 'transparent',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ maxWidth: 1300 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>🏷 경쟁사 가격 현황</h2>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            경쟁사 vs 자사 제품 가격 비교 &nbsp;·&nbsp; 총 {(competitors || []).length}건
            {hasFilter && ` (필터: ${filtered.length}건)`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 내보내기</button>
          <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>📤 가져오기</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 추가</button>
        </div>
      </div>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={filterSelStyle}>
          <option value="">전체 국가</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={filterSelStyle}>
          <option value="">전체 카테고리</option>
          {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterCompetitor} onChange={e => setFilterCompetitor(e.target.value)} style={filterSelStyle}>
          <option value="">전체 경쟁사</option>
          {competitorNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} style={filterSelStyle}>
          <option value="">전체 통화</option>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasFilter && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ 초기화</button>
        )}
      </div>

      {/* 테이블 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12, minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={thStyle()} rowSpan={2}>국가</th>
                <th style={thStyle()} rowSpan={2}>카테고리</th>
                <th style={thStyle()} rowSpan={2}>경쟁사</th>
                <th style={thStyle()} rowSpan={2}>경쟁 모델<br/><span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>→ 자사 모델</span></th>
                <th style={{ ...thStyle('right'), borderLeft: '2px solid var(--border)' }} colSpan={2}>대리점가</th>
                <th style={{ ...thStyle('right'), borderLeft: '1px solid var(--border)' }} colSpan={2}>병원납품가</th>
                <th style={thStyle('center')} rowSpan={2}>통화</th>
                <th style={thStyle()} rowSpan={2}>출처</th>
                <th style={thStyle()} rowSpan={2}>비고</th>
                <th style={thStyle('left')} rowSpan={2}>날짜 / 입력자</th>
                <th style={thStyle('center')} rowSpan={2}></th>
              </tr>
              <tr>
                <th style={{ ...thStyle('right', true), borderLeft: '2px solid var(--border)' }}>경쟁사</th>
                <th style={thStyle('right', true)}>자사</th>
                <th style={{ ...thStyle('right', true), borderLeft: '1px solid var(--border)' }}>경쟁사</th>
                <th style={thStyle('right', true)}>자사</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                    {hasFilter ? '필터 조건에 맞는 데이터가 없습니다.' : '아직 입력된 데이터가 없습니다. [+ 추가] 버튼을 눌러 경쟁사 가격을 등록하세요.'}
                  </td>
                </tr>
              )}
              {filtered.map(item => {
                const linkedAcc = (accounts || []).find(a => a.id === item.customerId);
                const dealerAdv = item.ourDealerPrice != null && item.dealerPrice != null
                  ? item.ourDealerPrice < item.dealerPrice : null;
                const hospAdv = item.ourHospitalPrice != null && item.hospitalPrice != null
                  ? item.ourHospitalPrice < item.hospitalPrice : null;
                const fmt = (n) => n != null ? n.toLocaleString() : '-';
                const diffBadge = (ours, theirs) => {
                  if (ours == null || theirs == null || theirs === 0) return null;
                  const d = ((ours - theirs) / theirs) * 100;
                  return (
                    <span style={{
                      fontSize: 9, padding: '1px 4px', borderRadius: 4, marginLeft: 3, fontWeight: 700,
                      background: d < 0 ? 'rgba(46,125,50,.12)' : 'rgba(220,38,38,.1)',
                      color: d < 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {d < 0 ? '▼' : '▲'}{Math.abs(d).toFixed(0)}%
                    </span>
                  );
                };
                return (
                  <tr key={item.id}>
                    <td>{item.country || '-'}</td>
                    <td>
                      {item.category
                        ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(46,125,50,.1)', color: 'var(--accent)', fontWeight: 600 }}>{item.category}</span>
                        : '-'}
                    </td>
                    <td style={{ color: '#d97706', fontWeight: 600 }}>{item.competitor || '-'}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{item.model || '-'}</div>
                      {item.ourModel && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 1 }}>→ {item.ourModel}</div>
                      )}
                      {linkedAcc && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>🔗 {linkedAcc.company_name}</div>
                      )}
                    </td>
                    {/* 대리점가 */}
                    <td style={{ textAlign: 'right', borderLeft: '2px solid var(--border)', color: 'var(--text2)' }}>
                      {fmt(item.dealerPrice)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {fmt(item.ourDealerPrice)}
                      {diffBadge(item.ourDealerPrice, item.dealerPrice)}
                    </td>
                    {/* 병원납품가 */}
                    <td style={{ textAlign: 'right', borderLeft: '1px solid var(--border)', color: 'var(--text2)' }}>
                      {fmt(item.hospitalPrice)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {fmt(item.ourHospitalPrice)}
                      {diffBadge(item.ourHospitalPrice, item.hospitalPrice)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--bg2)', fontWeight: 700 }}>
                        {item.currency}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{item.source || '-'}</td>
                    <td style={{ maxWidth: 160, color: 'var(--text2)', fontSize: 11 }}>
                      {item.remarks || '-'}
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: 10, whiteSpace: 'nowrap' }}>
                      {(item.updatedAt || '').slice(0, 10)}<br />{item.updatedBy || ''}
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11, padding: '2px 8px', marginRight: 4 }}
                        onClick={() => openEdit(item)}
                      >수정</button>
                      {isAdmin && (
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => handleDelete(item.id)}
                        >삭제</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', padding: '6px 12px' }}>
            ※ ▼% 녹색 = 자사가 경쟁사보다 저렴 (가격경쟁력 우위) &nbsp;|&nbsp; ▲% 적색 = 자사가 경쟁사보다 비쌈 &nbsp;|&nbsp; 삭제는 관리자만 가능
          </div>
        )}
      </div>

      {/* 입력/수정 모달 */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: 'var(--bg)', borderRadius: 10, width: '95%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {editingId ? '🏷 경쟁사 가격 수정' : '🏷 경쟁사 가격 추가'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* 기본 정보 */}
              <div>
                <label style={labelStyle}>국가 *</label>
                <input value={form.country} onChange={setField('country')} style={fieldStyle} placeholder="예: USA, KSA, Korea" />
              </div>
              <div>
                <label style={labelStyle}>카테고리</label>
                <select value={form.category} onChange={setField('category')} style={fieldStyle}>
                  <option value="">선택 안 함</option>
                  {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>경쟁사 *</label>
                <input value={form.competitor} onChange={setField('competitor')} style={fieldStyle} placeholder="경쟁사명" />
              </div>
              <div>
                <label style={labelStyle}>경쟁 모델명</label>
                <input value={form.model} onChange={setField('model')} style={fieldStyle} placeholder="경쟁 제품 모델명" />
              </div>

              {/* 구분선 */}
              <div style={{ gridColumn: '1 / -1', margin: '4px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  경쟁사 가격
                </div>
              </div>
              <div>
                <label style={labelStyle}>경쟁사 대리점가</label>
                <input value={form.dealerPrice} onChange={setField('dealerPrice')} style={fieldStyle} type="number" min="0" placeholder="숫자만 입력" />
              </div>
              <div>
                <label style={labelStyle}>경쟁사 병원납품가</label>
                <input value={form.hospitalPrice} onChange={setField('hospitalPrice')} style={fieldStyle} type="number" min="0" placeholder="숫자만 입력" />
              </div>

              {/* 자사 가격 */}
              <div style={{ gridColumn: '1 / -1', margin: '4px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  자사 가격 (대응 제품)
                </div>
              </div>
              <div>
                <label style={labelStyle}>자사 모델명</label>
                <input value={form.ourModel} onChange={setField('ourModel')} style={fieldStyle} placeholder="자사 대응 모델명 (선택)" />
              </div>
              <div></div>
              <div>
                <label style={labelStyle}>자사 대리점가</label>
                <input value={form.ourDealerPrice} onChange={setField('ourDealerPrice')} style={fieldStyle} type="number" min="0" placeholder="숫자만 입력" />
              </div>
              <div>
                <label style={labelStyle}>자사 병원납품가</label>
                <input value={form.ourHospitalPrice} onChange={setField('ourHospitalPrice')} style={fieldStyle} type="number" min="0" placeholder="숫자만 입력" />
              </div>

              {/* 기타 */}
              <div>
                <label style={labelStyle}>통화</label>
                <select value={form.currency} onChange={setField('currency')} style={fieldStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>출처</label>
                <select value={form.source} onChange={setField('source')} style={fieldStyle}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>고객사 연결 (선택)</label>
                <select value={form.customerId} onChange={setField('customerId')} style={fieldStyle}>
                  <option value="">연결 안 함</option>
                  {(accounts || [])
                    .slice().sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
                    .map(a => <option key={a.id} value={a.id}>{a.company_name}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>비고</label>
                <textarea
                  value={form.remarks}
                  onChange={setField('remarks')}
                  placeholder="가격 수집 배경, 특이사항, 할인 조건 등 메모"
                  rows={3}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingId ? '수정 저장' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
