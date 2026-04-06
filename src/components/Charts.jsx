/* ══════════════════════════════════════
   경량 차트 컴포넌트 (SVG + CSS)
   외부 라이브러리 없이 구현
   ══════════════════════════════════════ */

/**
 * 수평 바 차트 — 목표 vs 실적 비교
 * rows: [{ label, target, actual }]
 */
export function HBarChart({ rows, title, height = 'auto' }) {
  if (!rows || rows.length === 0) return null;
  const maxVal = Math.max(...rows.flatMap(r => [r.target || 0, r.actual || 0]), 1);

  return (
    <div className="chart-container" style={{ height }}>
      {title && <div className="chart-title">{title}</div>}
      <div className="hbar-chart">
        {rows.map((r, i) => {
          const tPct = Math.round(((r.target || 0) / maxVal) * 100);
          const aPct = Math.round(((r.actual || 0) / maxVal) * 100);
          const achieveRate = r.target > 0 ? Math.round((r.actual / r.target) * 100) : 0;
          return (
            <div key={i} className="hbar-row">
              <div className="hbar-label">{r.label}</div>
              <div className="hbar-bars">
                <div className="hbar-track">
                  <div className="hbar-bar target" style={{ width: `${tPct}%` }} />
                  <div className={`hbar-bar actual ${achieveRate >= 90 ? 'green' : achieveRate >= 70 ? 'yellow' : 'red'}`} style={{ width: `${aPct}%` }} />
                </div>
                <span className={`hbar-rate ${achieveRate >= 90 ? 'green' : achieveRate >= 70 ? 'yellow' : 'red'}`}>
                  {achieveRate}%
                </span>
              </div>
            </div>
          );
        })}
        <div className="hbar-legend">
          <span><span className="legend-dot target" /> 목표</span>
          <span><span className="legend-dot actual" /> 실적</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 도넛 차트 — 비중 분포
 * slices: [{ label, value, color }]
 */
export function DonutChart({ slices, title, size = 160 }) {
  if (!slices || slices.length === 0) return null;
  const total = slices.reduce((s, sl) => s + (sl.value || 0), 0);
  if (total === 0) return null;

  const COLORS = ['#2e7d32', '#558b2f', '#7cb342', '#aed581', '#c5e1a5', '#e8f5e9', '#1b5e20', '#4caf50'];
  let cumAngle = 0;
  const r = size / 2;
  const cx = r, cy = r;
  const innerR = r * 0.55;

  const paths = slices.filter(s => s.value > 0).map((sl, i) => {
    const angle = (sl.value / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + innerR * Math.cos(endRad);
    const iy1 = cy + innerR * Math.sin(endRad);
    const ix2 = cx + innerR * Math.cos(startRad);
    const iy2 = cy + innerR * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;
    const color = sl.color || COLORS[i % COLORS.length];

    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

    return <path key={i} d={d} fill={color} stroke="white" strokeWidth="1.5" />;
  });

  return (
    <div className="chart-container donut-wrap">
      {title && <div className="chart-title">{title}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {paths}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)">
            {fmtShort(total)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="var(--text3)">
            합계
          </text>
        </svg>
        <div className="donut-legend">
          {slices.filter(s => s.value > 0).map((sl, i) => (
            <div key={i} className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: sl.color || COLORS[i % COLORS.length] }} />
              <span className="donut-legend-label">{sl.label}</span>
              <span className="donut-legend-value">{fmtShort(sl.value)}</span>
              <span className="donut-legend-pct">{Math.round((sl.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 진행률 바 (게이지)
 * items: [{ label, value, max, color? }]
 */
export function ProgressBars({ items, title }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="chart-container">
      {title && <div className="chart-title">{title}</div>}
      <div className="progress-bars">
        {items.map((item, i) => {
          const pct = item.max > 0 ? Math.min(Math.round((item.value / item.max) * 100), 150) : 0;
          const displayPct = item.max > 0 ? Math.round((item.value / item.max) * 100) : 0;
          const barColor = item.color || (displayPct >= 90 ? 'var(--green)' : displayPct >= 70 ? 'var(--yellow)' : 'var(--red)');
          return (
            <div key={i} className="pbar-row">
              <div className="pbar-label">{item.label}</div>
              <div className="pbar-track">
                <div className="pbar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                {displayPct > 100 && (
                  <div className="pbar-overflow" style={{ width: `${Math.min(displayPct - 100, 100) * 0.5}%`, background: barColor, opacity: 0.4 }} />
                )}
              </div>
              <div className="pbar-values">
                <span className="pbar-pct" style={{ color: barColor }}>{displayPct}%</span>
                <span className="pbar-detail">{fmtShort(item.value)} / {fmtShort(item.max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 미니 KPI 요약 카드 (큰 숫자 + 서브텍스트)
 */
export function MiniKpiRow({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mini-kpi-row">
      {items.map((item, i) => (
        <div key={i} className={`mini-kpi ${item.accent ? 'accent' : ''} ${item.status || ''}`}>
          <div className="mini-kpi-label">{item.label}</div>
          <div className="mini-kpi-value">{item.value}</div>
          {item.sub && <div className="mini-kpi-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* helper */
function fmtShort(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}
