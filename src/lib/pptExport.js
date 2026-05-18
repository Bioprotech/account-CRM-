/**
 * v3.16 — PPT 월간 보고서 생성 (pptxgenjs)
 *
 * 사용:
 *   import { generateMonthlyPpt } from '../lib/pptExport';
 *   await generateMonthlyPpt({ monthlyReportData, execSummary, nextMonthPlan, ... });
 *
 * 슬라이드 구성 (12장):
 *   1. 표지
 *   2. 목차
 *   3. [Ch1] KPI 4카드 + 자동 요약
 *   4. [Ch1] 전년동기 비교 + 영업본부장 메시지
 *   5. [Ch2] 월별 수주·매출 추이 (차트)
 *   6. [Ch2] 팀별 / 담당자별 실적
 *   7. [Ch3] 팀별 활동 + GAP 요약
 *   8. [Ch3] 고객별 분석 (사업계획 매칭 + 4 버킷)
 *   9. [Ch3] GAP 심층 (원인·대책)
 *  10. [Ch4] 차월 파이프라인 + 계약 만료 임박
 *  11. [Ch4] 팀별 TASK
 *  12. [Ch5] 신규 딜 + AM 활동 품질
 */

/* ── 디자인 상수 ── */
const COLORS = {
  PRIMARY: '2e7d32',      // 영업본부 그린
  PRIMARY_DARK: '1b5e20',
  ACCENT: '558b2f',
  TEXT: '1b2e1b',
  TEXT2: '4a5e4a',
  TEXT3: '8a9e8a',
  BG: 'f6f8f5',
  BG2: 'eef2ec',
  RED: 'dc2626',
  YELLOW: 'd97706',
  GREEN: '16a34a',
  BLUE: '2563eb',
  BORDER: 'd0d5d0',
  WHITE: 'FFFFFF',
};

const FONT = '맑은 고딕'; // Malgun Gothic
const FONT_EN = 'Calibri';

/* ── 포맷 헬퍼 ── */
function fmtKRW(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return n.toLocaleString();
}
function fmtM(n) {
  if (!n) return '-';
  return Math.round(n / 1000000).toLocaleString();
}
function fmtPct(n) {
  if (n === null || n === undefined) return '-';
  return `${n}%`;
}
function statusColor(pct) {
  if (pct >= 100) return COLORS.GREEN;
  if (pct >= 80) return COLORS.YELLOW;
  return COLORS.RED;
}
function statusLabel(pct) {
  if (pct >= 100) return '🟢 정상';
  if (pct >= 80) return '🟡 주의';
  return '🔴 위험';
}

/* ── 슬라이드 헤더 (모든 본문 슬라이드 공통) ── */
function addHeader(slide, chapterNum, chapterTitle, subtitle = '', monthLabel = '') {
  // 상단 컬러 바
  slide.addShape('rect', {
    x: 0, y: 0, w: 13.333, h: 0.5,
    fill: { color: COLORS.PRIMARY },
    line: { color: COLORS.PRIMARY, width: 0 },
  });
  // Chapter 번호
  slide.addText(`Chapter ${chapterNum}`, {
    x: 0.4, y: 0.05, w: 1.5, h: 0.4,
    fontFace: FONT_EN, fontSize: 11, color: COLORS.WHITE, bold: true,
    valign: 'middle',
  });
  // Chapter 제목
  slide.addText(chapterTitle, {
    x: 1.9, y: 0.05, w: 8, h: 0.4,
    fontFace: FONT, fontSize: 12, color: COLORS.WHITE, bold: true,
    valign: 'middle',
  });
  // 우측 월 표시
  if (monthLabel) {
    slide.addText(monthLabel, {
      x: 10.5, y: 0.05, w: 2.5, h: 0.4,
      fontFace: FONT, fontSize: 10, color: COLORS.WHITE,
      align: 'right', valign: 'middle',
    });
  }
  // 부제목 (대형)
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.4, y: 0.65, w: 12.5, h: 0.5,
      fontFace: FONT, fontSize: 20, color: COLORS.TEXT, bold: true,
      valign: 'middle',
    });
  }
}

/* ── 푸터 (모든 슬라이드 공통) ── */
function addFooter(slide, slideNum, totalSlides, monthLabel) {
  slide.addText(`Bio Protech 영업본부 월간 보고 · ${monthLabel || ''}`, {
    x: 0.4, y: 7.15, w: 8, h: 0.25,
    fontFace: FONT, fontSize: 9, color: COLORS.TEXT3,
    valign: 'middle',
  });
  slide.addText(`${slideNum} / ${totalSlides}`, {
    x: 12.4, y: 7.15, w: 0.6, h: 0.25,
    fontFace: FONT_EN, fontSize: 9, color: COLORS.TEXT3,
    align: 'right', valign: 'middle',
  });
}

/* ══════════════════════════════════════════════════════
   메인: 월간 PPT 생성
   ══════════════════════════════════════════════════════ */
export async function generateMonthlyPpt(ctx) {
  const pptxgen = (await import('pptxgenjs')).default;
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333" × 7.5" (16:9)
  pptx.author = 'Bio Protech 영업본부';
  pptx.company = 'Bio Protech';
  pptx.title = `월간 보고서 ${ctx.monthlyReportData?.monthLabel || ''}`;

  const md = ctx.monthlyReportData || {};
  const monthLabel = md.monthLabel || '';
  const TOTAL = 12;
  const today = new Date().toISOString().slice(0, 10);

  // ══════════════════════════════════════════════════════
  // Slide 1 — 표지
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    // 배경 컬러 (그린 그라데이션 효과 — 단색)
    s.addShape('rect', {
      x: 0, y: 0, w: 13.333, h: 7.5,
      fill: { color: COLORS.PRIMARY_DARK },
      line: { color: COLORS.PRIMARY_DARK, width: 0 },
    });
    // 위쪽 강조 박스
    s.addShape('rect', {
      x: 0, y: 0, w: 13.333, h: 1.2,
      fill: { color: COLORS.PRIMARY },
      line: { color: COLORS.PRIMARY, width: 0 },
    });
    // 회사명
    s.addText('Bio Protech', {
      x: 0.6, y: 0.3, w: 6, h: 0.6,
      fontFace: FONT_EN, fontSize: 28, color: COLORS.WHITE, bold: true,
      valign: 'middle',
    });
    // 부서
    s.addText('영업본부', {
      x: 0.6, y: 0.85, w: 6, h: 0.3,
      fontFace: FONT, fontSize: 16, color: COLORS.WHITE,
      valign: 'middle',
    });

    // 메인 타이틀
    s.addText('월간 보고서', {
      x: 0.6, y: 2.8, w: 12, h: 1,
      fontFace: FONT, fontSize: 60, color: COLORS.WHITE, bold: true,
    });
    s.addText('Monthly Sales Report', {
      x: 0.6, y: 3.9, w: 12, h: 0.5,
      fontFace: FONT_EN, fontSize: 18, color: 'B0DDB5', italic: true,
    });

    // 기간
    s.addText(monthLabel, {
      x: 0.6, y: 5.0, w: 12, h: 0.8,
      fontFace: FONT, fontSize: 40, color: COLORS.WHITE, bold: true,
    });

    // 하단 정보
    s.addText(`작성일: ${today}`, {
      x: 0.6, y: 6.7, w: 6, h: 0.4,
      fontFace: FONT, fontSize: 12, color: 'B0DDB5',
    });
    s.addText('CONFIDENTIAL', {
      x: 9, y: 6.7, w: 3.6, h: 0.4,
      fontFace: FONT_EN, fontSize: 11, color: 'B0DDB5', bold: true,
      align: 'right',
    });
  }

  // ══════════════════════════════════════════════════════
  // Slide 2 — 목차
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '', '목 차', 'Contents', monthLabel);

    const chapters = [
      { num: '01', title: 'Executive Summary', desc: 'KPI · 전년동기 비교 · 영업본부장 메시지', page: '03-04' },
      { num: '02', title: 'Key Metrics', desc: '월별 수주·매출 추이 · 팀별·담당자별 실적', page: '05-06' },
      { num: '03', title: 'Strategic Analysis', desc: '팀별 활동 · 고객별 분석 · GAP 심층', page: '07-09' },
      { num: '04', title: 'Next Month Actions', desc: '차월 파이프라인 · 계약 만료 · 팀별 TASK', page: '10-11' },
      { num: '05', title: 'Pipeline & Deep Analysis', desc: '신규 딜 · AM 활동 품질', page: '12' },
    ];

    chapters.forEach((ch, i) => {
      const yPos = 1.5 + i * 1.05;
      // 번호 박스
      s.addShape('rect', {
        x: 0.6, y: yPos, w: 1.0, h: 0.9,
        fill: { color: COLORS.PRIMARY },
        line: { color: COLORS.PRIMARY, width: 0 },
      });
      s.addText(ch.num, {
        x: 0.6, y: yPos, w: 1.0, h: 0.9,
        fontFace: FONT_EN, fontSize: 28, color: COLORS.WHITE, bold: true,
        align: 'center', valign: 'middle',
      });
      // 제목
      s.addText(ch.title, {
        x: 1.8, y: yPos + 0.05, w: 8, h: 0.45,
        fontFace: FONT, fontSize: 18, color: COLORS.TEXT, bold: true,
      });
      // 설명
      s.addText(ch.desc, {
        x: 1.8, y: yPos + 0.5, w: 8, h: 0.35,
        fontFace: FONT, fontSize: 11, color: COLORS.TEXT2,
      });
      // 페이지
      s.addText(`p. ${ch.page}`, {
        x: 11, y: yPos + 0.15, w: 1.8, h: 0.5,
        fontFace: FONT_EN, fontSize: 14, color: COLORS.TEXT3,
        align: 'right', valign: 'middle',
      });
    });

    addFooter(s, 2, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 3 — Ch1: KPI 4카드 + 자동 요약
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '01', 'Executive Summary', 'KPI 4카드 — 수주·매출 × MTD·YTD', monthLabel);

    const kpi = md.kpi || {};
    const cards = [
      { title: '📦 수주 MTD', pct: kpi.order?.mtdPct || 0, actual: kpi.order?.mtdActual || 0, target: kpi.order?.mtdTarget || 0, yoy: kpi.order?.mtdYoyPct || 0, color: COLORS.PRIMARY },
      { title: '📦 수주 YTD 진도', pct: kpi.order?.ytdPct || 0, actual: kpi.order?.ytdActual || 0, target: kpi.order?.ytdTarget || 0, yoy: kpi.order?.ytdYoyPct || 0, color: COLORS.PRIMARY },
      { title: '💰 매출 MTD', pct: kpi.sales?.mtdPct || 0, actual: kpi.sales?.mtdActual || 0, target: kpi.sales?.mtdTarget || 0, yoy: kpi.sales?.mtdYoyPct || 0, color: COLORS.BLUE },
      { title: '💰 매출 YTD 진도', pct: kpi.sales?.ytdPct || 0, actual: kpi.sales?.ytdActual || 0, target: kpi.sales?.ytdTarget || 0, yoy: kpi.sales?.ytdYoyPct || 0, color: COLORS.BLUE },
    ];

    cards.forEach((c, i) => {
      const x = 0.4 + i * 3.16;
      const y = 1.5;
      const w = 3.0;
      const h = 2.4;
      const sc = statusColor(c.pct);
      // 카드 배경
      s.addShape('rect', {
        x, y, w, h,
        fill: { color: COLORS.WHITE },
        line: { color: sc, width: 2 },
      });
      // 상단 타이틀 바
      s.addShape('rect', {
        x, y, w, h: 0.4,
        fill: { color: c.color },
        line: { color: c.color, width: 0 },
      });
      s.addText(c.title, {
        x: x + 0.1, y, w: w - 0.2, h: 0.4,
        fontFace: FONT, fontSize: 11, color: COLORS.WHITE, bold: true,
        valign: 'middle',
      });
      // 큰 % 값
      s.addText(`${c.pct}%`, {
        x, y: y + 0.5, w, h: 0.9,
        fontFace: FONT_EN, fontSize: 44, color: sc, bold: true,
        align: 'center', valign: 'middle',
      });
      // 상태 라벨
      s.addText(statusLabel(c.pct), {
        x, y: y + 1.4, w, h: 0.3,
        fontFace: FONT, fontSize: 12, color: sc, bold: true,
        align: 'center',
      });
      // 실적/목표
      s.addText(`실적 ${fmtKRW(c.actual)} / 목표 ${fmtKRW(c.target)}`, {
        x, y: y + 1.75, w, h: 0.3,
        fontFace: FONT, fontSize: 10, color: COLORS.TEXT2,
        align: 'center',
      });
      // 전년 대비
      s.addText(c.yoy > 0 ? `전년 대비 ${c.yoy}%` : '전년 데이터 없음', {
        x, y: y + 2.05, w, h: 0.3,
        fontFace: FONT, fontSize: 10, color: c.yoy >= 100 ? COLORS.GREEN : COLORS.RED,
        align: 'center',
      });
    });

    // 자동 요약 박스
    if (md.autoExecSummary?.lines) {
      const lines = md.autoExecSummary.lines.slice(0, 4);
      s.addShape('rect', {
        x: 0.4, y: 4.2, w: 12.5, h: 2.7,
        fill: { color: COLORS.BG2 },
        line: { color: COLORS.BORDER, width: 1 },
      });
      s.addText(`💡 자동 요약 — ${md.autoExecSummary.autoStatus || ''}`, {
        x: 0.6, y: 4.3, w: 12, h: 0.4,
        fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
        valign: 'middle',
      });
      const lineTexts = lines.map((l, i) => ({
        text: `${i + 1}. ${l}`,
        options: { fontFace: FONT, fontSize: 11, color: COLORS.TEXT2, paraSpaceAfter: 6 },
      }));
      s.addText(lineTexts, {
        x: 0.6, y: 4.75, w: 12, h: 2.05, valign: 'top',
      });
    }

    addFooter(s, 3, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 4 — Ch1: 전년동기 비교 + 영업본부장 메시지
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '01', 'Executive Summary', '전년 동기 비교 + 영업본부장 메시지', monthLabel);

    const kpi = md.kpi || {};
    // 전년동기 비교 표
    const headerRow = [
      { text: '구분', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '당월', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '전년 동월', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: 'YoY', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: 'YTD', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '전년 YTD', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: 'YoY', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
    ];
    const rows = [
      headerRow,
      [
        { text: '수주', options: { bold: true } },
        { text: fmtKRW(kpi.order?.mtdActual || 0), options: { align: 'right' } },
        { text: fmtKRW(kpi.order?.mtdPrevYear || 0), options: { align: 'right', color: COLORS.TEXT3 } },
        { text: kpi.order?.mtdYoyPct > 0 ? `${kpi.order.mtdYoyPct}%` : '-', options: { align: 'right', color: kpi.order?.mtdYoyPct >= 100 ? COLORS.GREEN : COLORS.RED, bold: true } },
        { text: fmtKRW(kpi.order?.ytdActual || 0), options: { align: 'right' } },
        { text: fmtKRW(kpi.order?.ytdPrevYear || 0), options: { align: 'right', color: COLORS.TEXT3 } },
        { text: kpi.order?.ytdYoyPct > 0 ? `${kpi.order.ytdYoyPct}%` : '-', options: { align: 'right', color: kpi.order?.ytdYoyPct >= 100 ? COLORS.GREEN : COLORS.RED, bold: true } },
      ],
      [
        { text: '매출', options: { bold: true } },
        { text: fmtKRW(kpi.sales?.mtdActual || 0), options: { align: 'right' } },
        { text: fmtKRW(kpi.sales?.mtdPrevYear || 0), options: { align: 'right', color: COLORS.TEXT3 } },
        { text: kpi.sales?.mtdYoyPct > 0 ? `${kpi.sales.mtdYoyPct}%` : '-', options: { align: 'right', color: kpi.sales?.mtdYoyPct >= 100 ? COLORS.GREEN : COLORS.RED, bold: true } },
        { text: fmtKRW(kpi.sales?.ytdActual || 0), options: { align: 'right' } },
        { text: fmtKRW(kpi.sales?.ytdPrevYear || 0), options: { align: 'right', color: COLORS.TEXT3 } },
        { text: kpi.sales?.ytdYoyPct > 0 ? `${kpi.sales.ytdYoyPct}%` : '-', options: { align: 'right', color: kpi.sales?.ytdYoyPct >= 100 ? COLORS.GREEN : COLORS.RED, bold: true } },
      ],
    ];
    s.addTable(rows, {
      x: 0.4, y: 1.5, w: 12.5, h: 1.5,
      fontFace: FONT, fontSize: 12, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.5,
    });

    // 영업본부장 메시지 (execSummary)
    const exec = ctx.execSummary || {};
    s.addText('📝 영업본부장 메시지', {
      x: 0.4, y: 3.4, w: 12, h: 0.4,
      fontFace: FONT, fontSize: 14, color: COLORS.TEXT, bold: true,
      valign: 'middle',
    });
    s.addShape('rect', {
      x: 0.4, y: 3.85, w: 12.5, h: 3.0,
      fill: { color: COLORS.BG2 },
      line: { color: COLORS.BORDER, width: 1 },
    });
    const execLines = [
      exec.msg1 ? `① ${exec.msg1}` : '① (입력되지 않음)',
      exec.msg2 ? `② ${exec.msg2}` : '② (입력되지 않음)',
      exec.msg3 ? `③ ${exec.msg3}` : '③ (입력되지 않음)',
      '',
      exec.nextMonthFocus ? `🎯 차월 핵심 포커스: ${exec.nextMonthFocus}` : '',
    ].filter(Boolean);
    s.addText(execLines.map(l => ({
      text: l,
      options: { fontFace: FONT, fontSize: 12, color: COLORS.TEXT, paraSpaceAfter: 8 },
    })), {
      x: 0.6, y: 4.0, w: 12, h: 2.7, valign: 'top',
    });
    if (exec.status) {
      s.addText(`상태: ${exec.status}`, {
        x: 11, y: 3.85, w: 1.8, h: 0.4,
        fontFace: FONT, fontSize: 14, color: COLORS.TEXT, bold: true,
        align: 'right', valign: 'middle',
      });
    }

    addFooter(s, 4, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 5 — Ch2: 월별 수주·매출 추이 (차트)
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '02', 'Key Metrics', '월별 수주·매출 추이 (12개월)', monthLabel);

    // 수주 차트 데이터
    const trend = md.monthlyTrend || [];
    const orderChartData = [
      {
        name: '수주 목표',
        labels: trend.map(t => `${t.month}월`),
        values: trend.map(t => Math.round((t.target || 0) / 1000000)), // 백만원
      },
      {
        name: '수주 실적',
        labels: trend.map(t => `${t.month}월`),
        values: trend.map(t => Math.round((t.actual || 0) / 1000000)),
      },
    ];
    s.addChart(pptx.ChartType.bar, orderChartData, {
      x: 0.4, y: 1.5, w: 6.3, h: 5.4,
      barDir: 'col',
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 9,
      valAxisLabelFontFace: FONT,
      valAxisLabelFontSize: 9,
      chartColors: [COLORS.TEXT3, COLORS.PRIMARY],
      showTitle: true,
      title: '📦 수주 추이 (단위: 백만원)',
      titleFontFace: FONT,
      titleFontSize: 13,
      titleColor: COLORS.TEXT,
      showLegend: true,
      legendPos: 't',
      legendFontFace: FONT,
      legendFontSize: 10,
      dataLabelFontSize: 8,
      showValue: false,
    });

    // 매출 차트 데이터
    const salesTrend = md.salesMonthlyTrend || [];
    const salesChartData = [
      {
        name: '매출 목표',
        labels: salesTrend.map(t => `${t.month}월`),
        values: salesTrend.map(t => Math.round((t.target || 0) / 1000000)),
      },
      {
        name: '매출 실적',
        labels: salesTrend.map(t => `${t.month}월`),
        values: salesTrend.map(t => Math.round((t.actual || 0) / 1000000)),
      },
    ];
    s.addChart(pptx.ChartType.bar, salesChartData, {
      x: 6.85, y: 1.5, w: 6.3, h: 5.4,
      barDir: 'col',
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 9,
      valAxisLabelFontFace: FONT,
      valAxisLabelFontSize: 9,
      chartColors: [COLORS.TEXT3, COLORS.BLUE],
      showTitle: true,
      title: '💰 매출 추이 (단위: 백만원)',
      titleFontFace: FONT,
      titleFontSize: 13,
      titleColor: COLORS.TEXT,
      showLegend: true,
      legendPos: 't',
      legendFontFace: FONT,
      legendFontSize: 10,
    });

    addFooter(s, 5, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 6 — Ch2: 팀별 / 담당자별 실적
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '02', 'Key Metrics', '팀별 / 담당자별 실적', monthLabel);

    // 팀별 수주
    s.addText('📦 사업부별 수주 (당월)', {
      x: 0.4, y: 1.4, w: 6.3, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    const teamRows = md.teamRows || [];
    const teamTotal = md.teamTotal || {};
    const teamHeader = [
      { text: '사업부', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '목표', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '실적', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '달성률', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
    ];
    const teamData = [
      teamHeader,
      ...teamRows.map(r => {
        const pct = r.target > 0 ? Math.round((r.actual / r.target) * 100) : 0;
        return [
          { text: r.displayName || r.team || '-', options: { bold: true } },
          { text: fmtM(r.target), options: { align: 'right' } },
          { text: fmtM(r.actual), options: { align: 'right', bold: true } },
          { text: r.target > 0 ? `${pct}%` : '-', options: { align: 'right', color: statusColor(pct), bold: true } },
        ];
      }),
      [
        { text: '합계', options: { bold: true, fill: { color: COLORS.BG2 } } },
        { text: fmtM(teamTotal.target || 0), options: { align: 'right', bold: true, fill: { color: COLORS.BG2 } } },
        { text: fmtM(teamTotal.actual || 0), options: { align: 'right', bold: true, fill: { color: COLORS.BG2 } } },
        { text: teamTotal.target > 0 ? `${Math.round((teamTotal.actual / teamTotal.target) * 100)}%` : '-', options: { align: 'right', bold: true, fill: { color: COLORS.BG2 } } },
      ],
    ];
    s.addTable(teamData, {
      x: 0.4, y: 1.85, w: 6.3, h: 2.0,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.35,
      colW: [1.5, 1.6, 1.6, 1.6],
    });

    // 팀별 매출
    s.addText('💰 사업부별 매출 (당월, B/L Date)', {
      x: 6.85, y: 1.4, w: 6.3, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    const salesTeamRows = md.salesTeamRows || [];
    const salesTeamTotal = md.salesTeamTotal || {};
    const salesTeamData = [
      [
        { text: '사업부', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'center' } },
        { text: '목표', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'center' } },
        { text: '실적', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'center' } },
        { text: '달성률', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'center' } },
      ],
      ...salesTeamRows.map(r => {
        const pct = r.target > 0 ? Math.round((r.actual / r.target) * 100) : 0;
        return [
          { text: r.displayName || r.team || '-', options: { bold: true } },
          { text: fmtM(r.target), options: { align: 'right' } },
          { text: fmtM(r.actual), options: { align: 'right', bold: true } },
          { text: r.target > 0 ? `${pct}%` : '-', options: { align: 'right', color: statusColor(pct), bold: true } },
        ];
      }),
      [
        { text: '합계', options: { bold: true, fill: { color: COLORS.BG2 } } },
        { text: fmtM(salesTeamTotal.target || 0), options: { align: 'right', bold: true, fill: { color: COLORS.BG2 } } },
        { text: fmtM(salesTeamTotal.actual || 0), options: { align: 'right', bold: true, fill: { color: COLORS.BG2 } } },
        { text: salesTeamTotal.target > 0 ? `${Math.round((salesTeamTotal.actual / salesTeamTotal.target) * 100)}%` : '-', options: { align: 'right', bold: true, fill: { color: COLORS.BG2 } } },
      ],
    ];
    s.addTable(salesTeamData, {
      x: 6.85, y: 1.85, w: 6.3, h: 2.0,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.35,
      colW: [1.5, 1.6, 1.6, 1.6],
    });

    // 담당자별 실적 (사업계획 매칭 담당자만)
    s.addText('👤 담당자별 실적 (사업계획 매칭, 단위: 백만원)', {
      x: 0.4, y: 4.05, w: 12.5, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    const repRows = (md.repMonthRows || []).slice(0, 8);
    const repHeader = [
      { text: '담당자', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '당월 목표', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '당월 실적', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '당월 달성', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: 'YTD 목표', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: 'YTD 실적', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: 'YTD 진도', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
    ];
    const repData = [
      repHeader,
      ...repRows.map(r => {
        const mpct = r.monthTarget > 0 ? Math.round((r.monthActual / r.monthTarget) * 100) : 0;
        const ypct = r.ytdTarget > 0 ? Math.round((r.ytdActual / r.ytdTarget) * 100) : 0;
        return [
          { text: r.rep || '-', options: { bold: true } },
          { text: fmtM(r.monthTarget || 0), options: { align: 'right' } },
          { text: fmtM(r.monthActual || 0), options: { align: 'right' } },
          { text: r.monthTarget > 0 ? `${mpct}%` : '-', options: { align: 'right', color: statusColor(mpct) } },
          { text: fmtM(r.ytdTarget || 0), options: { align: 'right' } },
          { text: fmtM(r.ytdActual || 0), options: { align: 'right' } },
          { text: r.ytdTarget > 0 ? `${ypct}%` : '-', options: { align: 'right', color: statusColor(ypct), bold: true } },
        ];
      }),
    ];
    s.addTable(repData, {
      x: 0.4, y: 4.5, w: 12.5, h: 2.4,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.28,
    });

    addFooter(s, 6, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 7 — Ch3: 팀별 활동 + GAP 요약
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '03', 'Strategic Analysis', '팀별 활동 + GAP 요약', monthLabel);

    const teamAct = md.teamActivity || {};
    const teams = Object.keys(teamAct);
    s.addText('📊 팀별 활동 (당월)', {
      x: 0.4, y: 1.4, w: 6.3, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    const teamActData = [
      [
        { text: '팀', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true } },
        { text: '총 활동', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
        { text: '계약갱신', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
        { text: '크로스셀링', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
        { text: 'Open 이슈', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
      ],
      ...teams.map(t => {
        const v = teamAct[t];
        return [
          { text: v.display || t, options: { bold: true } },
          { text: `${v.total || 0}건`, options: { align: 'right' } },
          { text: `${v.newContract || 0}건`, options: { align: 'right' } },
          { text: `${v.crossSelling || 0}건`, options: { align: 'right' } },
          { text: `${v.openIssues || 0}건`, options: { align: 'right', color: v.openIssues > 0 ? COLORS.RED : COLORS.TEXT } },
        ];
      }),
    ];
    s.addTable(teamActData, {
      x: 0.4, y: 1.85, w: 6.3, h: 2.0,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.35,
    });

    // GAP 요약
    const gap = md.gapSummary || {};
    s.addText('📉 GAP 요약 (전체 합계 기준)', {
      x: 6.85, y: 1.4, w: 6.3, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    s.addShape('rect', {
      x: 6.85, y: 1.85, w: 6.3, h: 2.0,
      fill: { color: COLORS.BG2 },
      line: { color: COLORS.BORDER, width: 1 },
    });
    const gapLines = [
      `▼ 전체 미달: ${gap.allShortfallCount || 0}사 · ${fmtKRW(gap.allShortfallSum || 0)}`,
      `▲ 전체 초과: ${gap.allSurplusCount || 0}사 · ${fmtKRW(gap.allSurplusSum || 0)}`,
      `✓ 정상 (90~110%): ${gap.normalCount || 0}사`,
      '',
      `📊 Net GAP: ${fmtKRW((gap.allSurplusSum || 0) - (gap.allShortfallSum || 0))}`,
    ];
    s.addText(gapLines.map((l, i) => ({
      text: l,
      options: {
        fontFace: FONT, fontSize: 12,
        color: i === 0 ? COLORS.RED : i === 1 ? COLORS.GREEN : i === 2 ? COLORS.TEXT : COLORS.TEXT,
        bold: i === 0 || i === 1 || i === 4,
        paraSpaceAfter: 6,
      },
    })), {
      x: 7.05, y: 1.95, w: 6, h: 1.85, valign: 'top',
    });

    // 팀별 GAP 원인 (있으면)
    const teamGapCauses = md.teamGapCauses || {};
    if (Object.keys(teamGapCauses).length > 0) {
      s.addText('🔍 팀별 GAP 원인 TOP', {
        x: 0.4, y: 4.1, w: 12.5, h: 0.4,
        fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
      });
      const causeRows = Object.entries(teamGapCauses).slice(0, 6).flatMap(([team, causes]) => {
        return (Array.isArray(causes) ? causes.slice(0, 3) : []).map((c, i) => [
          { text: i === 0 ? team : '', options: { bold: true } },
          { text: c.label || c.key || '-', options: {} },
          { text: `${c.count || 0}건`, options: { align: 'right' } },
          { text: c.impact ? fmtKRW(c.impact) : '-', options: { align: 'right' } },
        ]);
      });
      if (causeRows.length > 0) {
        s.addTable([
          [
            { text: '팀', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true } },
            { text: '원인', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true } },
            { text: '건수', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
            { text: '영향 금액', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
          ],
          ...causeRows,
        ], {
          x: 0.4, y: 4.55, w: 12.5, h: 2.3,
          fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
          border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
          rowH: 0.28,
        });
      }
    }

    addFooter(s, 7, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 8 — Ch3: 고객별 분석
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '03', 'Strategic Analysis', '고객별 분석 (Top 미달 + 초과)', monthLabel);

    const gap = md.gapDeepAnalysis || {};
    const shortfall = (gap.shortfall || []).slice(0, 8);
    const surplus = (gap.surplus || []).slice(0, 5);

    s.addText(`▼ YTD 미달 Top ${shortfall.length} (전체 ${gap.allShortfall?.length || 0}사 중)`, {
      x: 0.4, y: 1.4, w: 12.5, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.RED, bold: true,
    });
    const shortHeader = [
      { text: '고객', options: { fill: { color: COLORS.RED }, color: COLORS.WHITE, bold: true } },
      { text: 'YTD 목표', options: { fill: { color: COLORS.RED }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: 'YTD 실적', options: { fill: { color: COLORS.RED }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: 'GAP', options: { fill: { color: COLORS.RED }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '진도', options: { fill: { color: COLORS.RED }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '담당자', options: { fill: { color: COLORS.RED }, color: COLORS.WHITE, bold: true, align: 'center' } },
    ];
    const shortData = [
      shortHeader,
      ...shortfall.map(c => {
        const ytdT = c.ytdTarget || 0;
        const ytdA = c.ytdActual || 0;
        const pct = ytdT > 0 ? Math.round((ytdA / ytdT) * 100) : 0;
        return [
          { text: c.name || c.customer_name || '-', options: { bold: true } },
          { text: fmtKRW(ytdT), options: { align: 'right' } },
          { text: fmtKRW(ytdA), options: { align: 'right' } },
          { text: `▼ ${fmtKRW(ytdT - ytdA)}`, options: { align: 'right', color: COLORS.RED, bold: true } },
          { text: `${pct}%`, options: { align: 'right', color: statusColor(pct), bold: true } },
          { text: c.sales_rep || '-', options: { align: 'center' } },
        ];
      }),
    ];
    s.addTable(shortData, {
      x: 0.4, y: 1.85, w: 12.5, h: 2.4,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.28,
    });

    // 초과 고객
    s.addText(`▲ YTD 초과 Top ${surplus.length} (전체 ${gap.allSurplus?.length || 0}사 중)`, {
      x: 0.4, y: 4.5, w: 12.5, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.GREEN, bold: true,
    });
    const surplusHeader = [
      { text: '고객', options: { fill: { color: COLORS.GREEN }, color: COLORS.WHITE, bold: true } },
      { text: 'YTD 목표', options: { fill: { color: COLORS.GREEN }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: 'YTD 실적', options: { fill: { color: COLORS.GREEN }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '초과', options: { fill: { color: COLORS.GREEN }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '진도', options: { fill: { color: COLORS.GREEN }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '담당자', options: { fill: { color: COLORS.GREEN }, color: COLORS.WHITE, bold: true, align: 'center' } },
    ];
    const surplusData = [
      surplusHeader,
      ...surplus.map(c => {
        const ytdT = c.ytdTarget || 0;
        const ytdA = c.ytdActual || 0;
        const pct = ytdT > 0 ? Math.round((ytdA / ytdT) * 100) : 0;
        return [
          { text: c.name || c.customer_name || '-', options: { bold: true } },
          { text: fmtKRW(ytdT), options: { align: 'right' } },
          { text: fmtKRW(ytdA), options: { align: 'right' } },
          { text: `▲ ${fmtKRW(ytdA - ytdT)}`, options: { align: 'right', color: COLORS.GREEN, bold: true } },
          { text: `${pct}%`, options: { align: 'right', color: COLORS.GREEN, bold: true } },
          { text: c.sales_rep || '-', options: { align: 'center' } },
        ];
      }),
    ];
    s.addTable(surplusData, {
      x: 0.4, y: 4.95, w: 12.5, h: 1.9,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.28,
    });

    addFooter(s, 8, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 9 — Ch3: GAP 심층 (원인 + 미달 고객 상세)
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '03', 'Strategic Analysis', 'GAP 심층 분석 — 원인 · 대책 · 인사이트', monthLabel);

    const gap = md.gapDeepAnalysis || {};
    const shortfall = (gap.shortfall || []).slice(0, 5);

    s.addText('🔬 Top 미달 고객 상세 (원인 + 대책)', {
      x: 0.4, y: 1.4, w: 12.5, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });

    const cards = shortfall.slice(0, 4);
    cards.forEach((c, i) => {
      const x = 0.4 + (i % 2) * 6.3;
      const y = 1.85 + Math.floor(i / 2) * 2.55;
      // 카드 배경
      s.addShape('rect', {
        x, y, w: 6.2, h: 2.45,
        fill: { color: COLORS.BG },
        line: { color: COLORS.RED, width: 2 },
      });
      // 고객명
      s.addText(c.name || c.customer_name || '-', {
        x: x + 0.15, y: y + 0.1, w: 4.5, h: 0.35,
        fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
      });
      // GAP
      const ytdT = c.ytdTarget || 0;
      const ytdA = c.ytdActual || 0;
      s.addText(`▼ GAP ${fmtKRW(ytdT - ytdA)}`, {
        x: x + 4.6, y: y + 0.1, w: 1.5, h: 0.35,
        fontFace: FONT, fontSize: 11, color: COLORS.RED, bold: true,
        align: 'right',
      });
      // 진도
      const pct = ytdT > 0 ? Math.round((ytdA / ytdT) * 100) : 0;
      s.addText(`진도 ${pct}% · 담당 ${c.sales_rep || '-'}`, {
        x: x + 0.15, y: y + 0.45, w: 6, h: 0.25,
        fontFace: FONT, fontSize: 10, color: COLORS.TEXT3,
      });
      // 원인
      const causesText = (c.gap_causes || c.causes || []).map(cs => {
        if (typeof cs === 'string') return cs;
        return cs.label || cs.key || '';
      }).filter(Boolean).slice(0, 3).join(', ');
      s.addText(`원인: ${causesText || '(미입력)'}`, {
        x: x + 0.15, y: y + 0.75, w: 6, h: 0.4,
        fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      });
      // 대책 / 추진 액션
      const action = c.countermeasure || c.action_plan || '';
      s.addText(`대책: ${action || '(미입력)'}`, {
        x: x + 0.15, y: y + 1.2, w: 6, h: 0.55,
        fontFace: FONT, fontSize: 10, color: COLORS.TEXT2,
        valign: 'top',
      });
      // 인사이트
      const insight = c.insight || c.last_insight || '';
      if (insight) {
        s.addText(`💡 ${insight.length > 100 ? insight.slice(0, 100) + '…' : insight}`, {
          x: x + 0.15, y: y + 1.8, w: 6, h: 0.55,
          fontFace: FONT, fontSize: 9, color: COLORS.TEXT3, italic: true,
          valign: 'top',
        });
      }
    });

    addFooter(s, 9, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 10 — Ch4: 차월 파이프라인 + 계약 만료 임박
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '04', 'Next Month Actions', '차월 파이프라인 + 계약 만료 임박', monthLabel);

    const pipeline = md.monthlyPipeline || {};
    const items = (pipeline.items || []).slice(0, 10);
    s.addText(`🎯 차월 수주 파이프라인 — 예상 ${fmtKRW(pipeline.totalExpected || 0)} · 가중 ${fmtKRW(pipeline.totalWeighted || 0)}`, {
      x: 0.4, y: 1.4, w: 12.5, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    const pipeHeader = [
      { text: 'P', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '고객', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true } },
      { text: '소스', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'center' } },
      { text: '예상 금액', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '신뢰도', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '가중액', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
    ];
    const pipeRows = items.map(p => {
      const srcLabel = p.source === 'fcst' ? '🔵 FCST' : p.source === 'plan' ? '🟢 사업계획' : p.source === 'trend' ? '🟡 트렌드' : p.source;
      const pColor = p.priority === 'P1' ? COLORS.RED : p.priority === 'P2' ? COLORS.YELLOW : COLORS.TEXT3;
      return [
        { text: p.priority || '-', options: { align: 'center', color: pColor, bold: true } },
        { text: p.account?.company_name || '-', options: { bold: true } },
        { text: srcLabel, options: { align: 'center', fontSize: 9 } },
        { text: fmtKRW(p.amount || 0), options: { align: 'right' } },
        { text: `${p.confidence || 0}%`, options: { align: 'right' } },
        { text: fmtKRW(p.weighted || 0), options: { align: 'right', bold: true, color: COLORS.PRIMARY } },
      ];
    });
    s.addTable([pipeHeader, ...pipeRows], {
      x: 0.4, y: 1.85, w: 7.5, h: 4.9,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.28,
      colW: [0.5, 2.5, 1.2, 1.3, 0.8, 1.2],
    });

    // 계약 만료 임박
    const expiring = (md.contractExpiringSoon || []).slice(0, 10);
    s.addText(`⏰ 계약 만료 임박 (D-60 이내, ${expiring.length}건)`, {
      x: 8.05, y: 1.4, w: 5.1, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    const expHeader = [
      { text: '고객', options: { fill: { color: COLORS.YELLOW }, color: COLORS.WHITE, bold: true } },
      { text: '제품', options: { fill: { color: COLORS.YELLOW }, color: COLORS.WHITE, bold: true } },
      { text: 'D-day', options: { fill: { color: COLORS.YELLOW }, color: COLORS.WHITE, bold: true, align: 'right' } },
    ];
    const expRows = expiring.map(e => [
      { text: e.company || '-', options: { bold: true } },
      { text: e.product || '-', options: { fontSize: 9 } },
      { text: `D-${e.daysLeft}`, options: { align: 'right', color: e.daysLeft <= 30 ? COLORS.RED : COLORS.YELLOW, bold: true } },
    ]);
    if (expRows.length > 0) {
      s.addTable([expHeader, ...expRows], {
        x: 8.05, y: 1.85, w: 5.1, h: 4.9,
        fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
        border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
        rowH: 0.28,
      });
    } else {
      s.addText('만료 임박 계약 없음', {
        x: 8.05, y: 1.85, w: 5.1, h: 0.5,
        fontFace: FONT, fontSize: 11, color: COLORS.GREEN,
        align: 'center',
      });
    }

    addFooter(s, 10, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 11 — Ch4: 팀별 TASK + 다음 달 계획
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '04', 'Next Month Actions', '팀별 월간 TASK + 다음 달 계획', monthLabel);

    const nextPlan = ctx.nextMonthPlan || {};
    // 3개 팀별 박스
    const teams = [
      { key: 'overseas', title: '🌍 해외영업', plan: nextPlan.overseas, color: COLORS.BLUE },
      { key: 'support', title: '🏢 BPU (영업지원)', plan: nextPlan.support, color: COLORS.YELLOW },
      { key: 'domestic', title: '🇰🇷 국내영업 (직판 포함)', plan: nextPlan.domestic, color: COLORS.PRIMARY },
    ];
    teams.forEach((t, i) => {
      const x = 0.4 + i * 4.32;
      const y = 1.5;
      const w = 4.15;
      const h = 5.3;
      // 박스
      s.addShape('rect', { x, y, w, h, fill: { color: COLORS.WHITE }, line: { color: t.color, width: 2 } });
      // 헤더
      s.addShape('rect', { x, y, w, h: 0.5, fill: { color: t.color }, line: { color: t.color, width: 0 } });
      s.addText(t.title, {
        x: x + 0.15, y, w: w - 0.3, h: 0.5,
        fontFace: FONT, fontSize: 13, color: COLORS.WHITE, bold: true,
        valign: 'middle',
      });
      // 내용
      const content = t.plan && t.plan.trim() ? t.plan : '(다음 달 계획이 입력되지 않았습니다)';
      s.addText(content, {
        x: x + 0.2, y: y + 0.7, w: w - 0.4, h: h - 0.85,
        fontFace: FONT, fontSize: 11, color: COLORS.TEXT,
        valign: 'top',
      });
    });

    addFooter(s, 11, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // Slide 12 — Ch5: 신규 딜 + AM 활동 품질
  // ══════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addHeader(s, '05', 'Pipeline & Deep Analysis', 'Pipeline CRM 신규 딜 + AM 활동 품질', monthLabel);

    // 신규 딜 (Pipeline CRM)
    const highlights = (md.pipelineHighlights || []).slice(0, 8);
    s.addText(`💎 Pipeline CRM 신규 딜 Top ${highlights.length}`, {
      x: 0.4, y: 1.4, w: 6.3, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });
    if (highlights.length > 0) {
      const newDealHeader = [
        { text: '고객', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true } },
        { text: '단계', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'center' } },
        { text: '예상 금액', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'right' } },
        { text: '확률', options: { fill: { color: COLORS.BLUE }, color: COLORS.WHITE, bold: true, align: 'right' } },
      ];
      const newDealRows = highlights.map(h => [
        { text: h.company || '-', options: { bold: true, fontSize: 9 } },
        { text: h.stage || '-', options: { align: 'center', fontSize: 9 } },
        { text: fmtKRW(h.amount || 0), options: { align: 'right', fontSize: 9 } },
        { text: `${h.probability || 0}%`, options: { align: 'right', fontSize: 9 } },
      ]);
      s.addTable([newDealHeader, ...newDealRows], {
        x: 0.4, y: 1.85, w: 6.3, h: 4.9,
        fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
        border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
        rowH: 0.28,
      });
    } else {
      s.addText('신규 딜 없음', {
        x: 0.4, y: 1.85, w: 6.3, h: 0.5,
        fontFace: FONT, fontSize: 11, color: COLORS.TEXT3,
      });
    }

    // AM 활동 품질 — accounts 기반 간이 통계
    const accounts = ctx.accounts || [];
    const activityLogs = ctx.activityLogs || [];
    s.addText('📞 AM 활동 품질 (담당자별 90일 컨택 + Score)', {
      x: 6.85, y: 1.4, w: 6.3, h: 0.4,
      fontFace: FONT, fontSize: 13, color: COLORS.TEXT, bold: true,
    });

    const repStat = {};
    accounts.forEach(a => {
      if (!a.sales_rep) return;
      if (!repStat[a.sales_rep]) repStat[a.sales_rep] = { count: 0, scoreSum: 0, contact90: 0 };
      repStat[a.sales_rep].count++;
      repStat[a.sales_rep].scoreSum += (a.intelligence?.total_score || 0);
    });
    const now = new Date();
    const cutoff90 = new Date(now); cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoff90Str = cutoff90.toISOString().slice(0, 10);
    activityLogs.forEach(l => {
      if ((l.date || '') < cutoff90Str) return;
      if (l.sales_rep && repStat[l.sales_rep]) {
        repStat[l.sales_rep].contact90++;
      }
    });
    const amRows = Object.entries(repStat)
      .filter(([, v]) => v.count > 0)
      .map(([rep, v]) => ({
        rep,
        count: v.count,
        contact90: v.contact90,
        freq: v.count > 0 ? (v.contact90 / v.count).toFixed(1) : '0',
        avgScore: v.count > 0 ? Math.round(v.scoreSum / v.count) : 0,
      }))
      .sort((a, b) => b.contact90 - a.contact90)
      .slice(0, 8);
    const amHeader = [
      { text: '담당자', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true } },
      { text: '고객수', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '90일 컨택', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '고객당 빈도', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
      { text: '평균 Score', options: { fill: { color: COLORS.PRIMARY }, color: COLORS.WHITE, bold: true, align: 'right' } },
    ];
    const amData = amRows.map(r => [
      { text: r.rep, options: { bold: true, fontSize: 9 } },
      { text: `${r.count}사`, options: { align: 'right', fontSize: 9 } },
      { text: `${r.contact90}건`, options: { align: 'right', fontSize: 9 } },
      { text: r.freq, options: { align: 'right', fontSize: 9 } },
      { text: `${r.avgScore}%`, options: { align: 'right', fontSize: 9, color: r.avgScore >= 70 ? COLORS.GREEN : r.avgScore >= 50 ? COLORS.YELLOW : COLORS.RED } },
    ]);
    s.addTable([amHeader, ...amData], {
      x: 6.85, y: 1.85, w: 6.3, h: 4.9,
      fontFace: FONT, fontSize: 10, color: COLORS.TEXT,
      border: { type: 'solid', color: COLORS.BORDER, pt: 1 },
      rowH: 0.28,
    });

    addFooter(s, 12, TOTAL, monthLabel);
  }

  // ══════════════════════════════════════════════════════
  // 파일 저장
  // ══════════════════════════════════════════════════════
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `Bio_Protech_월간보고서_${md.selYear || ''}년_${String(md.selMonth || '').padStart(2, '0')}월_${dateStr}.pptx`;
  await pptx.writeFile({ fileName });
  return fileName;
}
