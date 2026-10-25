// M2: 4단계 원인분석/대책 컴포넌트 — GapAnalysis 외 다른 곳에서도 재사용 가능
// ① 현황(situationSummary) ② 현황분석(causeDetail) ③ 문제점(rootCause) ④ 대책(countermeasure)

export function isCCComplete(gap) {
  return !!(gap.cause_detail?.trim() && gap.root_cause?.trim() && gap.countermeasure?.trim());
}

export default function CauseCountermeasure({
  situationSummary,
  causeDetail, onCauseDetailChange,
  rootCause, onRootCauseChange,
  countermeasure, onCountermeasureChange,
  isUnderTarget,
  hasCauseButNoDetail,
  detailLabel, counterLabel,
  detailPlaceholder, counterPlaceholder,
}) {
  return (
    <div>
      {/* ① 현황 */}
      {situationSummary && (
        <div style={{
          marginBottom: 10, padding: '8px 12px',
          background: 'var(--bg2)', borderRadius: 6, fontSize: 12,
          borderLeft: '3px solid var(--accent)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: 4 }}>
            ① 현황
          </div>
          <div>{situationSummary}</div>
        </div>
      )}

      {/* ② 현황분석 */}
      <div style={{ marginTop: 8 }}>
        <label style={{
          fontSize: 11, fontWeight: 600,
          color: hasCauseButNoDetail ? 'var(--red)' : 'var(--text2)',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        }}>
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, flexShrink: 0 }}>②</span>
          {detailLabel || '현황분석 (원인)'}
        </label>
        <textarea
          value={causeDetail || ''}
          onChange={e => onCauseDetailChange(e.target.value)}
          placeholder={detailPlaceholder || '현황 분석 내용을 입력하세요'}
          style={{
            minHeight: 60,
            borderColor: hasCauseButNoDetail ? 'var(--red)' : undefined,
            boxShadow: hasCauseButNoDetail ? '0 0 0 2px rgba(220,38,38,0.1)' : undefined,
          }}
        />
        {hasCauseButNoDetail && (
          <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginTop: 4, padding: '6px 8px', background: 'rgba(220,38,38,0.06)', borderRadius: 4 }}>
            원인 선택 시 분석 내용은 필수 입력입니다
          </div>
        )}
      </div>

      {/* ③ 문제점/근본원인 */}
      <div style={{ marginTop: 8 }}>
        <label style={{
          fontSize: 11, fontWeight: 600, color: '#d97706',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        }}>
          <span style={{ background: '#d97706', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, flexShrink: 0 }}>③</span>
          문제점 / 근본원인
        </label>
        <textarea
          value={rootCause || ''}
          onChange={e => onRootCauseChange(e.target.value)}
          placeholder="가장 핵심적인 문제점과 근본 원인을 구체적으로 기술하세요"
          style={{ minHeight: 50 }}
        />
      </div>

      {/* ④ 대책 */}
      <div style={{ marginTop: 8 }}>
        <label style={{
          fontSize: 11, fontWeight: 600,
          color: isUnderTarget ? 'var(--red)' : 'var(--green, #16a34a)',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        }}>
          <span style={{ background: isUnderTarget ? 'var(--red)' : 'var(--green, #16a34a)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, flexShrink: 0 }}>④</span>
          {counterLabel || '대책'}
        </label>
        <textarea
          value={countermeasure || ''}
          onChange={e => onCountermeasureChange(e.target.value)}
          placeholder={counterPlaceholder || '구체적인 대책을 입력하세요'}
          style={{ minHeight: 60 }}
        />
      </div>
    </div>
  );
}
