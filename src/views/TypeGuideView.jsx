import { useState } from 'react';
import { CUSTOMER_TYPE_GUIDE } from '../lib/constants';

const TYPES = Object.keys(CUSTOMER_TYPE_GUIDE);

export default function TypeGuideView() {
  const [selectedType, setSelectedType] = useState(null);

  return (
    <div className="type-guide-view">
      <h2>고객 유형별 비즈니스 프로세스 가이드</h2>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 20 }}>
        고객 유형에 따른 전략, 운영 프로세스, 체크리스트를 한눈에 확인할 수 있습니다.
        각 유형 카드를 클릭하면 상세 내용을 확인하세요.
      </p>

      {/* Type selector cards */}
      <div className="tgv-type-grid">
        {TYPES.map(key => {
          const g = CUSTOMER_TYPE_GUIDE[key];
          const active = selectedType === key;
          return (
            <div
              key={key}
              className={`tgv-type-card ${active ? 'active' : ''}`}
              onClick={() => setSelectedType(active ? null : key)}
            >
              <div className="tgv-type-label">{g.label}</div>
              <div className="tgv-type-def">{g.definition}</div>
            </div>
          );
        })}
      </div>

      {/* 전체 비교표 (선택 없을 때) */}
      {!selectedType && (
        <div className="tgv-compare">
          <h3>유형별 핵심 비교</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>유형</th>
                  <th>핵심 목표</th>
                  <th>전략 요약</th>
                  <th>주의사항</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map(key => {
                  const g = CUSTOMER_TYPE_GUIDE[key];
                  return (
                    <tr key={key}>
                      <td><strong>{g.label}</strong></td>
                      <td>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {g.goals.map((goal, i) => <li key={i}>{goal}</li>)}
                        </ul>
                      </td>
                      <td>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {g.strategy.slice(0, 2).map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </td>
                      <td>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {g.risks.slice(0, 2).map((r, i) => <li key={i} style={{ color: 'var(--red)' }}>{r}</li>)}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Intelligence Score & GAP 분석 가이드 */}
          <h3 style={{ marginTop: 32 }}>Intelligence Score 카테고리별 가이드</h3>
          <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 12 }}>
            고객 미팅 시 아래 카테고리별 질문을 활용하여 정보를 수집하세요. 가중치가 높은 항목을 우선 파악합니다.
          </p>
          <div className="tgv-score-guide">
            {[
              { label: 'Pain & Needs', weight: '25%', color: '#1b5e20',
                questions: ['고객의 가장 큰 불만/문제는?', '아직 충족되지 않는 니즈는?', '구매 시 가장 중요한 기준은? (가격/품질/납기/서비스)', '시장에서 새로운 기회나 트렌드는?', '구매를 방해하는 장벽은?'] },
              { label: '경쟁사 파악', weight: '20%', color: '#2e7d32',
                questions: ['현재 어떤 경쟁 제품을 사용 중인가?', '경쟁사 단가는 얼마인가?', '우리 제품의 점유율은?', '경쟁 대비 우리의 강점/약점은?', '경쟁사에서 전환 가능성은?'] },
              { label: '거래조건 파악', weight: '20%', color: '#388e3c',
                questions: ['현재 적용 단가는?', '결제조건(NET terms)은?', '계약 만료일은?', 'MOQ와 연간 목표물량은?', '볼륨 디스카운트 구조는?'] },
              { label: '시장·채널 이해도', weight: '15%', color: '#558b2f',
                questions: ['해당 시장 규모는 얼마인가?', '시장 성장률은?', '유통 채널 구조는? (직판/대리점/온라인)', '주요 수요 부서/과목은?', '연간 수입/소비량은?'] },
              { label: '기본정보 완성도', weight: '10%', color: '#689f38',
                questions: ['설립연도, 직원수, 매출규모는?', 'Key Contact 정보는?', '의사결정권자(DM)는 누구인가?', '모회사/자회사 구조는?'] },
              { label: '관계 깊이', weight: '10%', color: '#7cb342',
                questions: ['DM에게 직접 연락 가능한가?', '최근 6개월 내 방문/미팅 이력은?', '고객이 자사 정보를 공유하는가?', '여러 부서/채널과 관계가 있는가?'] },
            ].map((cat, i) => (
              <div key={i} className="tgv-score-card">
                <div className="tgv-score-header" style={{ borderLeftColor: cat.color }}>
                  <span className="tgv-score-label">{cat.label}</span>
                  <span className="tgv-score-weight" style={{ color: cat.color }}>{cat.weight}</span>
                </div>
                <ul className="tgv-question-list">
                  {cat.questions.map((q, j) => (
                    <li key={j}>{q}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* GAP 원인 가이드 */}
          <h3 style={{ marginTop: 32 }}>GAP 원인별 대응 가이드</h3>
          <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 12 }}>
            사업계획 대비 수주 Gap이 발생했을 때, 원인을 파악하고 아래 대응 방안을 참고하세요.
          </p>
          <div className="tgv-gap-guide">
            {[
              { icon: '📉', label: '수요 감소', check: '고객 연간 예산 변동, 재고 수준 확인', action: '수요 회복 시점 파악, 대체 수요처 발굴' },
              { icon: '⚔️', label: '경쟁 이탈', check: '경쟁사 제품/가격 파악, 전환 이유 확인', action: '차별화 포인트 강조, 가격 외 가치 제안' },
              { icon: '💰', label: '가격 장벽', check: '가격 기대치, 볼륨 디스카운트 가능성', action: '패키지 제안, 총비용(TCO) 관점 전환' },
              { icon: '🔗', label: '채널 문제', check: '재고 현황, 리오더 시점, 채널 변경 여부', action: '채널 다변화, 직접 공급 검토' },
              { icon: '📋', label: '인증/규제', check: '인증 상태, 필요 서류, 예상 소요 기간', action: '인증 프로세스 지원, 대체 인증 검토' },
              { icon: '🤝', label: '관계 약화', check: '신규 담당자 파악, 미팅 일정 수립', action: '관계 재구축, 상위 레벨 접촉' },
              { icon: '⏰', label: '시점 차이', check: '예산 사이클, 다음 발주 예상 시기', action: '선제적 제안, 예산 확보 시점 공략' },
              { icon: '🏭', label: '내부 이슈', check: '이슈 해결 상태, 고객 피드백', action: '신속 대응, 재발 방지 대책 공유' },
            ].map((g, i) => (
              <div key={i} className="tgv-gap-row">
                <div className="tgv-gap-icon">{g.icon}</div>
                <div className="tgv-gap-label">{g.label}</div>
                <div className="tgv-gap-check"><strong>확인:</strong> {g.check}</div>
                <div className="tgv-gap-action"><strong>대응:</strong> {g.action}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 선택된 유형 상세 */}
      {selectedType && (() => {
        const g = CUSTOMER_TYPE_GUIDE[selectedType];
        return (
          <div className="tgv-detail">
            <div className="tgv-detail-header">
              <h3>{g.label} 고객 상세 가이드</h3>
              <button className="btn btn-ghost" onClick={() => setSelectedType(null)}>전체 비교로 돌아가기</button>
            </div>

            {/* Definition */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">고객 정의</div>
              <p style={{ color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>{g.definition}</p>
            </div>

            {/* Two column: Traits + Goals */}
            <div className="tgv-two-col">
              <div className="card">
                <div className="card-title">고객 특성</div>
                <ul className="tg-list">
                  {g.traits.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
              <div className="card">
                <div className="card-title">핵심 목표</div>
                <ol className="tg-numbered">
                  {g.goals.map((goal, i) => <li key={i}>{goal}</li>)}
                </ol>
              </div>
            </div>

            {/* Strategy */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">영업 전략</div>
              <ol className="tg-numbered">
                {g.strategy.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>

            {/* Risks */}
            <div className="card tgv-risk-card" style={{ marginBottom: 12 }}>
              <div className="card-title" style={{ color: 'var(--red)' }}>주의사항 (리스크 행동)</div>
              <ul className="tg-list">
                {g.risks.map((r, i) => <li key={i} style={{ color: 'var(--red)' }}>{r}</li>)}
              </ul>
            </div>

            {/* Process flow */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">운영 프로세스</div>
              <div className="tg-process-flow">
                {g.process.map((step, i) => (
                  <div key={i} className="tg-process-step-wrap">
                    {i > 0 && <span className="tg-arrow">→</span>}
                    <div className="tg-process-step">
                      <span className="tg-step-num">Step {i + 1}</span>
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Checklist (read-only) */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">관리 체크리스트</div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                * 실제 체크는 고객 상세카드의 '유형가이드' 탭에서 관리합니다.
              </p>
              <div className="tg-checklist">
                {g.checklist.map((item, i) => (
                  <div key={i} className="tgv-checklist-item">
                    <span className="tgv-checklist-num">{i + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
