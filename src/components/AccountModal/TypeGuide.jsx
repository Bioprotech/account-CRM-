import { CUSTOMER_TYPE_GUIDE } from '../../lib/constants';

// 유형별 추천 활동 매핑
const TYPE_RECOMMENDATIONS = {
  OEM: [
    { condition: (d) => !d.type_checklist?.item_0, text: 'QBR 일정을 확정하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_4, text: '고객 중장기 로드맵을 확보하세요', priority: 'medium' },
    { condition: () => true, text: '품질/납기 이슈 선제 대응 체크', priority: 'low' },
  ],
  Private: [
    { condition: (d) => !d.type_checklist?.item_0, text: '대리점 계약 체결을 추진하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_2, text: '월간 판매 리포트를 요청하세요', priority: 'medium' },
    { condition: (d) => !d.type_checklist?.item_4, text: 'Cross-selling 제품을 제안하세요', priority: 'medium' },
  ],
  Multiple: [
    { condition: (d) => !d.type_checklist?.item_1, text: '주문 패턴을 분석하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_2, text: '리오더 일정을 수립하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_3, text: 'SKU 확대를 제안하세요', priority: 'medium' },
  ],
  Single: [
    { condition: (d) => !d.type_checklist?.item_0, text: '주문 후 7일 Follow-up을 실시하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_3, text: '업셀링 제품을 제안하세요', priority: 'medium' },
    { condition: (d) => !d.type_checklist?.item_4, text: '재구매 전환 가능성을 검토하세요', priority: 'medium' },
  ],
  '입찰': [
    { condition: (d) => !d.type_checklist?.item_0, text: '입찰 정보를 수집하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_3, text: '이전 입찰 결과 피드백을 수집하세요', priority: 'medium' },
    { condition: (d) => !d.type_checklist?.item_4, text: '로컬판매 전환을 검토하세요', priority: 'medium' },
  ],
  '가격민감': [
    { condition: (d) => !d.type_checklist?.item_0, text: '패키지 SKU를 구성하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_2, text: '경쟁사 가격을 조사하세요', priority: 'high' },
    { condition: (d) => !d.type_checklist?.item_4, text: '장기 전환 계획을 수립하세요', priority: 'medium' },
  ],
};

export default function TypeGuide({ draft, update }) {
  const type = draft.business_type;
  const guide = CUSTOMER_TYPE_GUIDE[type];
  const checklist = draft.type_checklist || {};

  const toggleCheck = (idx) => {
    const key = `item_${idx}`;
    update({ type_checklist: { ...checklist, [key]: !checklist[key] } });
  };

  if (!type) {
    return (
      <div className="alert-banner warning">
        고객 유형이 설정되지 않았습니다. 기본정보 탭에서 고객 유형을 먼저 설정해주세요.
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="alert-banner">
        이 고객 유형({type})에 대한 가이드가 준비 중입니다.
      </div>
    );
  }

  const checkedCount = guide.checklist.filter((_, i) => checklist[`item_${i}`]).length;
  const totalCount = guide.checklist.length;

  // 추천 활동 계산
  const recommendations = (TYPE_RECOMMENDATIONS[type] || [])
    .filter(r => r.condition(draft))
    .slice(0, 3);

  return (
    <div className="type-guide">
      {/* Type badge */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="score-badge green" style={{ fontSize: 13, padding: '4px 12px' }}>
          {guide.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>유형별 비즈니스 프로세스 가이드</span>
      </div>

      {/* 추천 활동 (B2) */}
      {recommendations.length > 0 && (
        <div className="card" style={{ marginBottom: 12, background: 'rgba(59,130,246,0.04)', border: '1px solid var(--accent)' }}>
          <div className="card-title" style={{ color: 'var(--accent)' }}>📌 추천 다음 활동</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: r.priority === 'high' ? 'var(--red)' : r.priority === 'medium' ? 'var(--yellow)' : 'var(--green)',
                }} />
                <span style={{ color: 'var(--text1)' }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Definition */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-title">고객 정의</div>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{guide.definition}</p>
      </div>

      {/* Traits */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-title">고객 특성</div>
        <ul className="tg-list">
          {guide.traits.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      {/* Goals */}
      <div className="card tg-goals" style={{ marginBottom: 8 }}>
        <div className="card-title">핵심 목표</div>
        <ol className="tg-numbered">
          {guide.goals.map((g, i) => (
            <li key={i}><span className="tg-check-icon">&#10003;</span> {g}</li>
          ))}
        </ol>
      </div>

      {/* Strategy */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-title">전략</div>
        <ol className="tg-numbered">
          {guide.strategy.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>

      {/* Risks */}
      <div className="card tg-risks" style={{ marginBottom: 8 }}>
        <div className="card-title">주의사항 (리스크 행동)</div>
        <ul className="tg-list tg-risk-list">
          {guide.risks.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      {/* Process flow */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-title">운영 프로세스</div>
        <div className="tg-process-flow">
          {guide.process.map((step, i) => (
            <div key={i} className="tg-process-step-wrap">
              {i > 0 && <span className="tg-arrow">&#8594;</span>}
              <div className="tg-process-step">
                <span className="tg-step-num">Step {i + 1}</span>
                {step}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>체크리스트</span>
          <span className="score-badge" style={{
            background: checkedCount === totalCount ? 'rgba(22,163,74,.12)' : 'rgba(59,130,246,.08)',
            color: checkedCount === totalCount ? 'var(--green)' : 'var(--accent)',
            fontSize: 11,
          }}>
            {checkedCount}/{totalCount} 완료
          </span>
        </div>
        {/* Progress bar */}
        <div className="tg-progress-bar">
          <div className="tg-progress-fill" style={{ width: `${(checkedCount / totalCount) * 100}%` }} />
        </div>
        <div className="tg-checklist">
          {guide.checklist.map((item, i) => {
            const checked = !!checklist[`item_${i}`];
            return (
              <label key={i} className={`tg-checklist-item ${checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCheck(i)}
                />
                <span>{item}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
