import { useState, useMemo } from 'react';
import { useAccount } from '../context/AccountContext';
import { REGIONS, PRODUCTS, BUSINESS_TYPES, PAGE_SIZE, STRATEGIC_TIERS } from '../lib/constants';
import { scoreColorClass, fmtDate, daysSince } from '../lib/utils';

const CURRENT_YEAR = new Date().getFullYear();

function fmtKRW(n) {
  if (!n) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}

export default function AccountList() {
  const { visibleAccounts, filters, setFilters, setEditingAccount, getLogsForAccount, activityLogs, businessPlans, teamMembers } = useAccount();
  const [page, setPage] = useState(1);
  const [targetSortAsc, setTargetSortAsc] = useState(false); // default: descending

  // account_id 및 customer_name 기반 연간 목표 매핑
  const targetByAccount = useMemo(() => {
    const customerPlans = businessPlans.filter(p => p.year === CURRENT_YEAR && p.type !== 'product');
    const byId = {};
    const byName = {};
    customerPlans.forEach(p => {
      if (p.account_id) {
        byId[p.account_id] = (byId[p.account_id] || 0) + (p.annual_target || 0);
      }
      if (p.customer_name) {
        const key = p.customer_name.toLowerCase().trim();
        byName[key] = (byName[key] || 0) + (p.annual_target || 0);
      }
    });
    return { byId, byName };
  }, [businessPlans]);

  const getTarget = (a) => {
    return targetByAccount.byId[a.id]
      || targetByAccount.byName[(a.company_name || '').toLowerCase().trim()]
      || 0;
  };

  // 기본 정렬: 연간 목표 내림차순 (0은 하단)
  const sortedAccounts = useMemo(() => {
    return [...visibleAccounts].sort((a, b) => {
      const ta = getTarget(a);
      const tb = getTarget(b);
      if (targetSortAsc) {
        // ascending: 0 at bottom, then low to high
        if (ta === 0 && tb !== 0) return 1;
        if (ta !== 0 && tb === 0) return -1;
        return ta - tb;
      } else {
        // descending: high to low, 0 at bottom
        if (ta === 0 && tb !== 0) return 1;
        if (ta !== 0 && tb === 0) return -1;
        return tb - ta;
      }
    });
  }, [visibleAccounts, targetSortAsc, targetByAccount]);

  const total = sortedAccounts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paginated = sortedAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setFilters({ searchQ: '', region: '', salesRep: '', businessType: '', product: '', scoreRange: '', tier: '' });
    setPage(1);
  };

  const getOpenIssueCount = (accountId) => {
    return activityLogs.filter(l => l.account_id === accountId && l.status !== 'Closed').length;
  };

  return (
    <div>
      {/* Filter Bar */}
      <div className="filter-bar">
        <select className="filter-select" value={filters.region} onChange={e => { setFilters(f => ({ ...f, region: e.target.value })); setPage(1); }}>
          <option value="">전체 지역</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={filters.salesRep} onChange={e => { setFilters(f => ({ ...f, salesRep: e.target.value })); setPage(1); }}>
          <option value="">전체 담당자</option>
          {teamMembers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={filters.businessType} onChange={e => { setFilters(f => ({ ...f, businessType: e.target.value })); setPage(1); }}>
          <option value="">전체 사업형태</option>
          {BUSINESS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="filter-select" value={filters.product} onChange={e => { setFilters(f => ({ ...f, product: e.target.value })); setPage(1); }}>
          <option value="">전체 품목</option>
          {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" value={filters.scoreRange} onChange={e => { setFilters(f => ({ ...f, scoreRange: e.target.value })); setPage(1); }}>
          <option value="">전체 Score</option>
          <option value="red">🔴 50% 미만</option>
          <option value="yellow">🟡 50~70%</option>
          <option value="green">🟢 70% 이상</option>
        </select>
        <select className="filter-select" value={filters.tier || ''} onChange={e => { setFilters(f => ({ ...f, tier: e.target.value })); setPage(1); }}>
          <option value="">전체 등급</option>
          {STRATEGIC_TIERS.map(t => <option key={t.key} value={t.key}>{t.key} — {t.label}</option>)}
          <option value="none">미설정</option>
        </select>
        <span className="filter-count">{total}개사</span>
        {Object.values(filters).some(v => v) && (
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>필터 초기화</button>
        )}
        <button className="btn btn-success btn-sm" onClick={async () => {
          try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const rows = sortedAccounts.map(a => ({
              '회사명': a.company_name || '',
              '전략등급': a.strategic_tier || '-',
              '국가': a.country || '',
              '지역': a.region || '',
              '사업형태': a.business_type || '',
              '담당자': a.sales_rep || '',
              'Insight 진척률': (a.intelligence?.total_score ?? 0) + '%',
              '제품군': (a.products || []).join(', '),
              '계약상태': a.contract_status || '',
              '최근 컨택일': a.last_contact_date || '',
              '연간 목표': getTarget(a),
              'Open 이슈': getOpenIssueCount(a.id),
              '등록일': a.created_at || '',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [
              { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
              { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
              { wch: 10 }, { wch: 12 },
            ];
            XLSX.utils.book_append_sheet(wb, ws, '고객목록');
            XLSX.writeFile(wb, `Account_CRM_고객목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
          } catch (err) {
            console.error('다운로드 실패:', err);
          }
        }} style={{ marginLeft: 'auto' }}>Excel 다운로드</button>
      </div>

      {/* Table */}
      {total === 0 ? (
        <div className="empty-state">
          <div className="icon">🏢</div>
          <p>등록된 고객이 없습니다.<br />상단의 '+ 고객 추가' 버튼으로 시작하세요.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>회사명</th>
                  <th>등급</th>
                  <th>지역</th>
                  <th>담당자</th>
                  <th>사업형태</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { setTargetSortAsc(v => !v); setPage(1); }}>
                    연간 목표 {targetSortAsc ? '▲' : '▼'}
                  </th>
                  <th>Insight</th>
                  <th>마지막 컨택</th>
                  <th>Open 이슈</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(a => {
                  const score = a.intelligence?.total_score ?? 0;
                  const colorCls = scoreColorClass(score);
                  const openCount = getOpenIssueCount(a.id);
                  const noContact30 = daysSince(a.last_contact_date) > 30;
                  const isDanger = score < 50;

                  return (
                    <tr key={a.id} className={isDanger ? 'row-danger' : ''} onClick={() => setEditingAccount(a)}>
                      <td style={{ fontWeight: 600 }}>{a.company_name || '(미입력)'}</td>
                      <td>
                        {a.strategic_tier ? (() => {
                          const tier = STRATEGIC_TIERS.find(t => t.key === a.strategic_tier);
                          return tier ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: tier.color, color: '#fff' }}>
                              {tier.key}
                            </span>
                          ) : '-';
                        })() : <span style={{ color: 'var(--text3)' }}>-</span>}
                      </td>
                      <td><span className="region-badge">{a.region || '-'}</span></td>
                      <td>{a.sales_rep || '-'}</td>
                      <td>{a.business_type || '-'}</td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>{fmtKRW(getTarget(a))}</td>
                      <td>
                        <div className="score-cell">
                          <div className="score-gauge">
                            <div
                              className={`score-gauge-fill ${colorCls.replace('score-', '')}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className={`score-num`} style={{ color: score < 50 ? 'var(--red)' : score < 70 ? 'var(--yellow)' : 'var(--green)' }}>
                            {score}%
                          </span>
                        </div>
                      </td>
                      <td style={{ color: noContact30 ? 'var(--red)' : 'inherit', fontWeight: noContact30 ? 600 : 400 }}>
                        {a.last_contact_date ? fmtDate(a.last_contact_date) : '-'}
                        {noContact30 && ' ⚠'}
                      </td>
                      <td>
                        {openCount > 0 ? (
                          <span className="score-badge red">{openCount}</span>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <span>{(page - 1) * PAGE_SIZE + 1}~{Math.min(page * PAGE_SIZE, total)} / {total}개</span>
            <div className="page-btns">
              {page > 1 && <button className="page-btn" onClick={() => setPage(page - 1)}>◀</button>}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
                .map((p, idx, arr) => (
                  <span key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 4px', color: 'var(--text3)' }}>…</span>}
                    <button className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  </span>
                ))
              }
              {page < totalPages && <button className="page-btn" onClick={() => setPage(page + 1)}>▶</button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
