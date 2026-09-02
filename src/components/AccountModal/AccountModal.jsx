import { useState, useEffect } from 'react';
import { useAccount } from '../../context/AccountContext';
import { SCORE_CATEGORIES, GAP_CAUSES, OPPORTUNITY_TYPES, STRATEGIC_TIERS } from '../../lib/constants';
import BasicInfo from './BasicInfo';

import ActivityLog from './ActivityLog';
import OrderHistory from './OrderHistory';
import PriceContract from './PriceContract';
import ForecastTrend from './ForecastTrend';
import CrossSelling from './CrossSelling';
import TypeGuide from './TypeGuide';
import GapAnalysis from './GapAnalysis';
import CustomerInsight from './CustomerInsight';

// v3.33: label은 i18n 키 — 렌더 시점에 t() 적용
const TABS = [
  { key: 'basic',        labelKey: 'modal.tab.basic' },
  { key: 'insight',      labelKey: 'modal.tab.insight' },
  { key: 'activity',     labelKey: 'modal.tab.activity' },
  { key: 'orders',       labelKey: 'modal.tab.orders' },
  { key: 'gap',          labelKey: 'modal.tab.gap' },
  { key: 'contract',     labelKey: 'modal.tab.contract' },
  { key: 'forecast',     labelKey: 'modal.tab.forecast' },
  { key: 'crossselling', labelKey: 'modal.tab.crossselling' },
  { key: 'typeguide',    labelKey: 'modal.tab.typeguide' },
];

function fmtAmount(n) {
  if (!n) return '-';
  const num = Number(n);
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (num >= 10000) return `${Math.round(num / 10000).toLocaleString()}만`;
  return num.toLocaleString();
}

export default function AccountModal() {
  const { editingAccount, setEditingAccount, saveAccount, removeAccount, isAdmin, currentUser,
    getLogsForAccount, getOrdersForAccount, getSalesForAccount, getContractsForAccount, getForecastsForAccount, getPlansForAccount, t,
    editingAccountInitialTab } = useAccount();
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (editingAccount) {
      setDraft({ ...editingAccount });
      setActiveTab(editingAccountInitialTab || 'basic');
    }
  }, [editingAccount, editingAccountInitialTab]);

  if (!draft) return null;

  const update = (fields) => {
    setDraft(prev => ({ ...prev, ...fields }));
  };

  const handleSave = () => {
    if (!draft.company_name?.trim()) {
      alert('회사명을 입력해주세요.');
      return;
    }
    saveAccount(draft);
    setEditingAccount(null);
  };

  const handleDelete = () => {
    removeAccount(draft.id);
    setEditingAccount(null);
    setShowDelete(false);
  };

  const canEdit = isAdmin || !draft.sales_rep || draft.sales_rep === currentUser || (draft.co_reps || []).includes(currentUser);
  const isNew = !editingAccount?.company_name;
  const score = draft.intelligence?.total_score ?? 0;

  const handleExcelExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const name = draft.company_name || 'Customer';

      // Sheet 1: 기본정보
      const basicRows = [
        ['고객 카드 — ' + name, '', '', new Date().toISOString().slice(0, 10)],
        [],
        ['[기본정보]'],
        ['회사명', draft.company_name || ''],
        ['국가', draft.country || ''],
        ['지역', draft.region || ''],
        ['사업형태', draft.business_type || ''],
        ['고객유형', draft.customer_type || ''],
        ['고객분류', draft.customer_category || ''],
        ['전략등급', draft.strategic_tier || ''],
        ['담당자', draft.sales_rep || ''],
        ['제품군', (draft.products || []).join(', ')],
        ['거래 시작일', draft.trade_start_date || ''],
        ['계약 상태', draft.contract_status || ''],
        ['최근 컨택일', draft.last_contact_date || ''],
        ['Intelligence Score', `${score}%`],
        ['메모(Context)', draft.context_memo || ''],
        [],
        ['[Key Contacts]'],
        ['이름', '직책', '이메일', '전화', '결정권자'],
        ...(draft.key_contacts || []).map(c => [c.name || '', c.title || '', c.email || '', c.phone || '', c.is_decision_maker ? 'Y' : '']),
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(basicRows);
      ws1['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 18 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws1, '기본정보');

      // Sheet 2: Intelligence Score
      const scoreRows = [['Intelligence Score 상세', `전체: ${score}%`], []];
      const intel = draft.intelligence?.categories || {};
      SCORE_CATEGORIES.forEach(cat => {
        const catData = intel[cat.key] || {};
        const catScore = catData.score ?? 0;
        scoreRows.push([`[${cat.label}]`, `가중치: ${cat.weight * 100}%`, `점수: ${catScore}%`]);
        cat.items.forEach(item => {
          const val = catData.items?.[item.key];
          const checked = val && val !== '' && val !== false;
          scoreRows.push(['', item.label, checked ? (typeof val === 'string' ? val : 'O') : 'X']);
        });
        scoreRows.push([]);
      });
      const ws2 = XLSX.utils.aoa_to_sheet(scoreRows);
      ws2['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Intelligence Score');

      // Sheet 3: 활동 로그
      const logs = getLogsForAccount(draft.id);
      const logRows = [
        ['활동 로그', `${logs.length}건`],
        [],
        ['날짜', '유형', '중요도', '담당자', '내용', '다음액션', '기한', '예상금액', '제품군', '대상품목', '수주세부유형', '회복계획일', '회복금액', '회복메모', '타부서공유', '결과'],
        ...logs.map(l => [
          l.date || '', l.issue_type || '', l.priority || '', l.sales_rep || '',
          l.content || '', l.next_action || '', l.due_date || '',
          l.expected_amount || '', l.product_category || '', l.target_product || '',
          l.order_sub_type || '', l.recovery_plan_date || '', l.recovery_plan_amount || '',
          l.recovery_plan_note || '', l.cross_dept_share ? 'Y' : '', l.outcome || '',
        ]),
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(logRows);
      ws3['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws3, '활동로그');

      // Sheet 4: 수주이력
      const orders = getOrdersForAccount(draft.id);
      const orderRows = [
        ['수주이력', `${orders.length}건`],
        [],
        ['오더일', '제품군', '수주금액', '담당자', '비고'],
        ...orders.map(o => [o.order_date || '', o.product_category || '', o.order_amount || 0, o.sales_rep || '', o.notes || '']),
      ];
      if (orders.length > 0) {
        orderRows.push([], ['합계', '', orders.reduce((s, o) => s + (o.order_amount || 0), 0)]);
      }
      const ws4 = XLSX.utils.aoa_to_sheet(orderRows);
      ws4['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws4, '수주이력');

      // Sheet 5: 매출이력
      const sales = getSalesForAccount(draft.id);
      if (sales.length > 0) {
        const saleRows = [
          ['매출이력', `${sales.length}건`],
          [],
          ['매출일(B/L)', '제품군', '매출금액', '담당자', '비고'],
          ...sales.map(s => [s.sale_date || '', s.product_category || '', s.sale_amount || 0, s.sales_rep || '', s.notes || '']),
        ];
        saleRows.push([], ['합계', '', sales.reduce((sum, s) => sum + (s.sale_amount || 0), 0)]);
        const ws5b = XLSX.utils.aoa_to_sheet(saleRows);
        ws5b['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws5b, '매출이력');
      }

      // Sheet 6: GAP 분석
      const gap = draft.gap_analysis || {};
      const gapRows = [['GAP 분석'], []];
      // Causes
      const causes = (gap.causes || []).map(k => GAP_CAUSES.find(c => c.key === k)).filter(Boolean);
      gapRows.push(['[Gap 원인]']);
      if (causes.length > 0) {
        causes.forEach(c => gapRows.push(['', `${c.icon} ${c.label}`, c.desc]));
      } else {
        gapRows.push(['', '미설정']);
      }
      gapRows.push([]);
      // Notes
      if (gap.cause_notes) {
        gapRows.push(['[원인 상세]'], ['', gap.cause_notes], []);
      }
      // Opportunities
      gapRows.push(['[기회 파이프라인]']);
      const opps = gap.opportunities || [];
      if (opps.length > 0) {
        gapRows.push(['유형', '품목', '예상금액', '확률', '가중금액', '예상시기', '비고']);
        opps.forEach(o => {
          const typeInfo = OPPORTUNITY_TYPES.find(t => t.key === o.type);
          gapRows.push([typeInfo?.label || o.type, o.product || '', o.amount || 0, `${o.probability || 0}%`, Math.round((o.amount || 0) * (o.probability || 0) / 100), o.expected_date || '', o.notes || '']);
        });
      } else {
        gapRows.push(['', '등록된 기회 없음']);
      }
      gapRows.push([]);
      // Action Plan
      const actions = (gap.action_plan || []).filter(a => a.text?.trim());
      if (actions.length > 0) {
        gapRows.push(['[액션플랜]'], ['완료', '내용', '기한']);
        actions.forEach(a => gapRows.push([a.done ? 'O' : '', a.text, a.due || '']));
      }
      const ws5 = XLSX.utils.aoa_to_sheet(gapRows);
      ws5['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws5, 'GAP분석');

      // Sheet 6: 가격·계약
      const contracts = getContractsForAccount(draft.id);
      const contractRows = [
        ['가격·계약', `${contracts.length}건`],
        [],
        ['제품군', '단가(USD)', '결제조건', '계약시작', '계약만료', '비고'],
        ...contracts.map(c => [c.product_category || '', c.unit_price || '', c.payment_terms || '', c.contract_start || '', c.contract_expiry || '', c.notes || '']),
      ];
      const ws6 = XLSX.utils.aoa_to_sheet(contractRows);
      ws6['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws6, '가격계약');

      // Sheet 7: FCST
      const forecasts = getForecastsForAccount(draft.id);
      if (forecasts.length > 0) {
        const fcstRows = [
          ['Forecast', `${forecasts.length}건`],
          [],
          ['연도', '기간', '제품군', '예측금액', '주문예상월', '비고'],
          ...forecasts.map(f => [f.year || '', f.period || '', f.product_category || '', f.forecast_amount || 0, f.order_month || '', f.notes || '']),
        ];
        const ws7 = XLSX.utils.aoa_to_sheet(fcstRows);
        ws7['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws7, 'FCST');
      }

      // Sheet 8: 크로스셀링
      const cs = draft.cross_selling || [];
      if (cs.length > 0) {
        const csRows = [
          ['크로스셀링', `${cs.length}건`],
          [],
          ['대상품목', '상태', '예상금액', '실제금액', '시작일', '비고'],
          ...cs.map(c => [c.target_product || '', c.status || '', c.potential_amount || 0, c.actual_amount || 0, c.started_at || '', c.notes || '']),
        ];
        const ws8 = XLSX.utils.aoa_to_sheet(csRows);
        ws8['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws8, '크로스셀링');
      }

      // Sheet: Insight
      const ci = draft.customer_insight || {};
      const supplier = ci.supplier || {};
      const decision = ci.decision || {};
      const bizHealth = ci.biz_health || {};
      const insightRows = [
        ['고객 인사이트'],
        [],
        ['[공급자·경쟁 포지션]'],
        ['우리 공급 포지션', supplier.position || ''],
        ['대안 탐색 여부', supplier.substitute_search || ''],
        ['전략 품목', (supplier.strategic_products || []).join(', ')],
        [],
        ['경쟁사', '가격수준', '비고'],
        ...(supplier.competitors || []).map(c => [c.name || '', c.price_level || '', c.notes || '']),
        [],
        ['[의사결정]'],
        ['핵심 의사결정자', decision.key_decision_maker || ''],
        ['관계 온도', decision.relationship_temp || ''],
        ['챔피언 유무', decision.has_champion !== undefined && decision.has_champion !== '' ? (decision.has_champion ? 'Y' : 'N') : ''],
        [],
        ['인플루언서', '역할', '온도', '비고'],
        ...(decision.influencers || []).map(inf => [inf.name || '', inf.role || '', inf.temp || '', inf.notes || '']),
        [],
        ['[사업 건전성]'],
        ['성장 트렌드', bizHealth.growth_trend || ''],
        ['재무 건전성', bizHealth.financial_health || ''],
        ['전략 부합도', bizHealth.strategic_fit || ''],
        ['추가 메모', bizHealth.notes || ''],
      ];
      const wsInsight = XLSX.utils.aoa_to_sheet(insightRows);
      wsInsight['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsInsight, 'Insight');

      XLSX.writeFile(wb, `${name}_고객카드_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Excel export 실패:', err);
      alert('Excel 다운로드에 실패했습니다.');
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'basic':
        return <BasicInfo draft={draft} update={update} />;
      case 'insight':
        return <CustomerInsight draft={draft} update={update} />;
      case 'activity':
        return <ActivityLog accountId={draft.id} draft={draft} />;
      case 'orders':
        return <OrderHistory accountId={draft.id} />;
      case 'contract':
        return <PriceContract accountId={draft.id} />;
      case 'forecast':
        return <ForecastTrend accountId={draft.id} />;
      case 'gap':
        return <GapAnalysis draft={draft} update={update} />;
      case 'crossselling':
        return <CrossSelling draft={draft} update={update} />;
      case 'typeguide':
        return <TypeGuide draft={draft} update={update} />;
      default:
        return null;
    }
  };

  return (
    <div className="overlay" onClick={() => setEditingAccount(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>{isNew ? '새 고객 등록' : draft.company_name || '(미입력)'}</h2>
            {!isNew && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                {draft.strategic_tier && (() => {
                  const tier = STRATEGIC_TIERS.find(t => t.key === draft.strategic_tier);
                  return tier ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: tier.color, color: '#fff' }}>
                      {tier.key}
                    </span>
                  ) : null;
                })()}
                {draft.region && <span className="region-badge">{draft.region}</span>}
                {draft.sales_rep && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>담당: {draft.sales_rep}</span>}
                <span className={`score-badge ${score >= 70 ? 'green' : score >= 50 ? 'yellow' : 'red'}`}>
                  Score {score}%
                </span>
              </div>
            )}
            {!isNew && draft.context_memo && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', maxWidth: 500 }}>
                {draft.context_memo}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={() => setEditingAccount(null)}>✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`modal-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Body */}
        <fieldset disabled={!canEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div className="modal-body">
            {renderTab()}
          </div>
        </fieldset>

        {/* Footer */}
        <div className="modal-footer">
          {!isNew && canEdit && (
            <button className="btn btn-danger" onClick={() => setShowDelete(true)} style={{ marginRight: 'auto' }}>삭제</button>
          )}
          {!isNew && (
            <button className="btn btn-success" onClick={handleExcelExport} style={{ fontSize: 11 }}>Excel 다운로드</button>
          )}
          <button className="btn btn-ghost" onClick={() => setEditingAccount(null)}>취소</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={handleSave}>저장</button>
          )}
        </div>
      </div>

      {/* Delete Confirm */}
      {showDelete && (
        <div className="confirm-overlay" onClick={() => setShowDelete(false)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>'{draft.company_name}'을(를) 삭제하시겠습니까?<br />관련 활동 로그도 함께 삭제됩니다.</p>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)}>취소</button>
              <button className="btn btn-danger" onClick={handleDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
