/**
 * Fuzzy Match Utility (v3.6)
 *
 * 사업계획 ↔ 영업현황 고객명 매칭 정확도 향상.
 * 외부 라이브러리 없이 자체 구현 (정규화 + Levenshtein + Token-based).
 */

/* ── 1. 고객명 정규화 (대소문자, 공백, 특수문자, 일반 접미사 제거) ── */
const SUFFIX_PATTERNS = [
  // 영문 회사 접미사
  /\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|company|gmbh|sa|ag|kk|sarl|bv|nv|spa|srl|plc|pvt)\b\.?/gi,
  // 한글 회사 접미사
  /(주식회사|\(주\)|\(유\)|유한회사|합자회사|주식|법인)/g,
  // 산업별 일반 접미사 (옵션, 너무 강하게 제거하면 오히려 매칭 망침)
  // /\b(group|holdings|international|global|industries|industry|technologies|technology|tech|systems|solutions|services|trading|enterprise)\b/gi,
];

export function normalizeCompanyName(name) {
  if (!name) return '';
  let s = String(name).trim().toLowerCase();
  // 회사 접미사 제거
  SUFFIX_PATTERNS.forEach(p => { s = s.replace(p, ''); });
  // 특수문자, 구두점 제거 (단, 한글/영문/숫자/공백 유지)
  s = s.replace(/[^\w가-힣\s]/g, ' ');
  // 다중 공백 → 단일 공백 → 제거
  s = s.replace(/\s+/g, '').trim();
  return s;
}

/* ── 2. Levenshtein Distance (편집 거리) ── */
export function levenshteinDistance(a, b) {
  if (!a && !b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  // O(min(m, n)) 메모리 최적화
  if (m < n) return levenshteinDistance(b, a);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* ── 3. 문자열 유사도 (0~1, 1=완벽) ── */
export function stringSimilarity(a, b) {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // 한쪽이 다른 쪽 포함 (substring)
  if (na.length >= 3 && nb.length >= 3) {
    if (na.includes(nb) || nb.includes(na)) {
      const shortLen = Math.min(na.length, nb.length);
      const longLen = Math.max(na.length, nb.length);
      // 길이 차이가 크지 않으면 높은 점수
      return 0.85 + 0.15 * (shortLen / longLen);
    }
  }
  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

/* ── 4. Token 단위 매칭 (단어가 일치하면 보너스) ── */
export function tokenSimilarity(a, b) {
  if (!a || !b) return 0;
  // 정규화 전 단어 추출 (공백/특수문자 split)
  const toTokens = (s) => String(s)
    .toLowerCase()
    .split(/[\s\.,()\-_/&]+/)
    .map(t => t.replace(/[^\w가-힣]/g, ''))
    .filter(t => t.length >= 2 && !/^(inc|ltd|co|corp|llc|plc|gmbh|sa|ag|kk)$/i.test(t));
  const tokensA = new Set(toTokens(a));
  const tokensB = new Set(toTokens(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union; // Jaccard similarity
}

/* ── 5. 종합 점수 (string + token 가중) ── */
export function combinedSimilarity(a, b) {
  const ss = stringSimilarity(a, b);
  const ts = tokenSimilarity(a, b);
  // 두 점수 중 높은 쪽 + 다른 쪽 25% 보너스 (cap 1.0)
  return Math.min(1, Math.max(ss, ts) + Math.min(ss, ts) * 0.25);
}

/* ── 6. 매칭 후보 찾기 ── */
/**
 * @param {string} target - 찾을 고객명
 * @param {Array<{key: any, name: string}>} candidates - 후보 리스트
 * @param {number} threshold - 최소 신뢰도 (기본 0.7)
 * @param {number} topN - 상위 N개 후보 (기본 3)
 * @returns Array<{key, name, score}> 점수 내림차순
 */
export function findMatches(target, candidates, threshold = 0.7, topN = 3) {
  if (!target || !candidates || candidates.length === 0) return [];
  const scored = candidates.map(c => ({
    key: c.key,
    name: c.name,
    score: combinedSimilarity(target, c.name),
  }));
  return scored
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/* ── 7. 신뢰도 등급 ── */
export function confidenceLabel(score) {
  if (score >= 0.95) return { label: '완벽', color: '#16a34a' };
  if (score >= 0.85) return { label: '매우 높음', color: '#16a34a' };
  if (score >= 0.75) return { label: '높음', color: '#65a30d' };
  if (score >= 0.65) return { label: '보통', color: '#d97706' };
  return { label: '낮음', color: '#dc2626' };
}
