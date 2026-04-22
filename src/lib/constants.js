/* ── 팀원 ── */
export const DEFAULT_TEAM_MEMBERS = ['Iris', 'Rebecca', 'Ian', 'Wendy', 'Dana', '김지희'];
export const TEAM_MEMBERS = DEFAULT_TEAM_MEMBERS; // 하위호환
export const TEAM_STORAGE_KEY = 'bioprotech_account_crm_team_v1';

/* ── 영업팀 ── */
export const SALES_TEAMS = ['해외영업', '영업지원', '국내영업'];

/* ── 지역 ── */
export const REGIONS = ['북미', '중남미', '유럽', '아시아', '중동', '아프리카', 'CIS', '한국'];

/* ── 제품군 ── */
export const PRODUCTS = [
  'ECG',
  'TAB',
  'NEO',
  'Evacuator',
  'Smoke',
  'Pencil',
  'G.PAD_p',
  'G.PAD_u',
  'TENS',
  'UNIT',
  'SpO2',
  'EEG',
  'EMG',
  'Laparo',
  'Accessory',
];

/* ── 사업형태 (구분) ── */
export const BUSINESS_TYPES = [
  'OEM',
  'Single',
  'Multiple',
  'Private',
  '가격민감',
  '입찰',
  '직접수출',
  '대리점',
  '공통',
  '기타',
];

/* ── 계약 상태 ── */
export const CONTRACT_STATUSES = ['활성', '만료임박', '만료', '협상중', '없음'];

/* ── 이슈 유형 (Activity Log) ── */
export const ISSUE_TYPES = [
  '일반컨택',
  '가격협의',
  '품질클레임',
  '입찰',
  '샘플요청',
  '계약갱신',
  '규제·인증',
  '시장정보수집',
  '수주활동',
  '영업미팅',
  '크로스셀링',
  'VOC수집',
];

/* ── 수주활동 세부 유형 ── */
export const ORDER_ACTIVITY_TYPES = [
  '견적발송', '오더접수', '납기조율', 'PO접수', '수주확정', '출하', '기타',
];

/* ── 고객유형별 비즈 프로세스 가이드 ── */
export const CUSTOMER_TYPE_GUIDE = {
  OEM: {
    label: 'OEM',
    definition: '대형 기업이 우리 제품을 자체 제품으로 취급하는 경우',
    traits: ['품질/납기/사양 요구 수준 높음', '단가 협상 강도 높음', '장기 계약 선호', '공급 안정성 최우선'],
    goals: ['장기 공급계약 확보', '단가인하 최소화', '품질·납기 안정성 유지'],
    strategy: ['전략적 파트너십 관리 (KAM)', '연간 단가 협상 프로세스 표준화', '고객 중장기 로드맵 확보 → 선제적 제안'],
    risks: ['고객과의 약속 신중', '가격 중심 대화 지양', '이슈 보고 지연 금지', '문서 없는 구두 합의 금지'],
    process: ['분기별 QBR 실시', '연간 단가 협상', '품질 이슈 대응 프로토콜', '공동 개발 프로젝트 관리'],
    checklist: ['QBR 일정 확정', '연간 단가 협상 완료', '품질 이슈 프로토콜 수립', 'KAM 운영체계 구축', '중장기 로드맵 공유'],
  },
  Private: {
    label: 'Private Label',
    definition: '우리 제품을 고객 브랜드로 판매하는 고객',
    traits: ['커스터마이징 요구', '브랜드 영향력에 따른 매출 변동', '대리점화 가능성 높음'],
    goals: ['대리점 전환', '연간 구매량 확대'],
    strategy: ['독점/비독점 대리점 계약', 'MOQ 및 연간 목표 설정', '공동 마케팅 운영', 'Cross-selling 제안'],
    risks: ['고객 브랜드 전략 개입 주의', 'PL 고객간 가격 형평성'],
    process: ['대리점계약→교육→론칭지원', '월간 판매 리포트', '공동 마케팅 운영', '재고/주문 관리'],
    checklist: ['대리점 계약 체결', '초기 론칭 지원 완료', '월간 판매 리포트 수신', '공동 마케팅 계획 수립', 'Cross-selling 제안'],
  },
  Multiple: {
    label: 'Multi Order',
    definition: '연간 반복주문이 발생하며 일정한 수요가 있는 고객',
    traits: ['주문패턴 존재', '재구매 가능성 높음', 'SKU 확대 여지'],
    goals: ['반복 주문 유지', 'SKU 확대', '대리점 전환 검토'],
    strategy: ['안정적 채널로 육성', '주문 패턴 분석 → 리오더 제안', 'SKU 확대 제안', '판매 인센티브'],
    risks: ['수동적 대응 금지', '리오더 시점 대기 금지'],
    process: ['고객 등급화', '월간 주문패턴 분석 → 리오더', '신제품 우선 공급', '판매 데이터 기반 리포트'],
    checklist: ['고객 등급 설정', '주문패턴 분석 완료', '리오더 일정 수립', 'SKU 확대 제안', '판매 인센티브 검토'],
  },
  Single: {
    label: 'Single Order',
    definition: '단발성 주문이 발생하는 고객',
    traits: ['일회성/프로젝트성 구매', '재구매 전환율 낮음', '경험 및 만족도 중요'],
    goals: ['재구매 전환', '고객 경험 개선'],
    strategy: ['반복구매로 전환 구조', '관계 구축형으로 전환', '맞춤형 추가 제품 제안', 'Starter 패키지'],
    risks: ['주문 후 F-up 방치 금지', '소극적 대응 금지'],
    process: ['주문 이후 사후관리 (7/30/90일)', '사용후기 → 업셀링 제안', 'CRM 기반 리마케팅'],
    checklist: ['7일 F-up 완료', '30일 F-up 완료', '90일 F-up 완료', '업셀링 제안', '재구매 전환 여부 확인'],
  },
  '입찰': {
    label: '입찰고객',
    definition: '입찰 참여를 통해 구매하는 고객',
    traits: ['가격 경쟁 심함', '입찰조건 중요', '낙찰 후 장기 거래 가능'],
    goals: ['낙찰률 향상', '입찰조건 최적화', '로컬판매 전환'],
    strategy: ['입찰 의존도 낮춤 → 상시매출 구조', '과거 입찰 데이터 분석', '경쟁사 분석 DB', 'Cross-selling'],
    risks: ['입찰조건 미검토 참여 금지', '피드백 없는 반복 입찰 금지'],
    process: ['입찰정보 수집→타당성 검토→참여→피드백', '입찰 후 분석', '로컬판매 전환 제안'],
    checklist: ['입찰 정보 수집', '타당성 검토', '입찰 참여', '결과 피드백 수집', '로컬판매 전환 검토'],
  },
  '가격민감': {
    label: '가격민감',
    definition: '가격을 최우선으로 고려하는 고객',
    traits: ['가격 협상 강도 높음', '경쟁사 가격 민감'],
    goals: ['이익 유지', '다수 SKU로 판매 확대', '장기 고객 전환'],
    strategy: ['패키지로 총 이익 확보', '가격 외 차별화', 'Loss 제품 + 고마진 제품 패키지'],
    risks: ['전체 SKU 일괄 가격조정 금지', '고객 요구 100% 수용 금지'],
    process: ['패키지 SKU 구성표 운영', '전용 가격 운영', '경쟁사 가격 모니터링'],
    checklist: ['패키지 SKU 구성', '전용 가격표 작성', '경쟁사 가격 조사', '이익률 분석', '장기 전환 계획'],
  },
};

/* ── 이슈 상태 ── */
export const ISSUE_STATUSES = ['Open', 'In Progress', 'Closed'];

/* ── 이슈 중요도 (우선순위 가중치) ──
 *  - 주요이슈 자동 집계 기준: priority >= 2 (주요 + 긴급)
 *  - 주간 → 월간 누적 보고 자연 연결
 */
export const ISSUE_PRIORITIES = [
  { value: 1, label: '일반', icon: '🟢', color: '#16a34a' },
  { value: 2, label: '주요', icon: '🟡', color: '#d97706' },
  { value: 3, label: '긴급', icon: '🔴', color: '#dc2626' },
];
export const DEFAULT_PRIORITY = 1;

/* ── Intelligence Score 카테고리 ── */
/* inputType: 'text'(단답), 'textarea'(장문), 'select'(선택), 'number'(숫자)
   입력된 값이 있으면 자동으로 해당 항목 checked 처리 */
export const SCORE_CATEGORIES = [
  {
    key: 'basic_info',
    label: '기본정보 완성도',
    weight: 0.10,
    items: [
      { key: 'company_info', label: '회사 기본정보', inputType: 'textarea', placeholder: '설립연도, 직원수, 매출규모 등' },
      { key: 'key_contact', label: 'Key Contact', inputType: 'textarea', placeholder: '이름, 직책, 연락처' },
      { key: 'decision_maker', label: 'Decision Maker', inputType: 'text', placeholder: '결정권자 이름/직책' },
      { key: 'org_structure', label: '모회사/자회사 구조', inputType: 'text', placeholder: '그룹 구조' },
    ],
  },
  {
    key: 'market_understanding',
    label: '시장·채널 이해도',
    weight: 0.15,
    items: [
      { key: 'market_size', label: '시장 규모', inputType: 'text', placeholder: '국가/제품별 시장 규모' },
      { key: 'growth_rate', label: '시장 성장률', inputType: 'text', placeholder: '연간 성장률 (%)' },
      { key: 'channel_structure', label: '유통채널 구조', inputType: 'select', options: ['직접판매', '대리점', '온라인', '혼합', '기타'] },
      { key: 'demand_dept', label: '주요 수요 부서/과목', inputType: 'text', placeholder: '심전도실, 수술실 등' },
      { key: 'annual_volume', label: '연간 수입/소비량', inputType: 'text', placeholder: '연간 구매량/금액' },
    ],
  },
  {
    key: 'competitor_analysis',
    label: '경쟁사 파악',
    weight: 0.20,
    items: [
      { key: 'competitor_products', label: '경쟁 제품', inputType: 'textarea', placeholder: '현재 사용 경쟁 제품명/제조사' },
      { key: 'competitor_price', label: '경쟁사 가격대', inputType: 'text', placeholder: '주요 경쟁사 단가 범위' },
      { key: 'market_share', label: '자사 점유율', inputType: 'text', placeholder: '고객 내 점유율 (%)' },
      { key: 'swot', label: '강점/약점 분석', inputType: 'textarea', placeholder: '경쟁 대비 자사 강점/약점' },
      { key: 'switch_potential', label: '전환 가능성', inputType: 'select', options: ['높음', '중간', '낮음', '불가'] },
    ],
  },
  {
    key: 'pain_needs',
    label: 'Pain & Needs',
    weight: 0.25,
    items: [
      { key: 'pain_point', label: '핵심 Pain Point', inputType: 'textarea', placeholder: '고객의 핵심 문제/불만' },
      { key: 'unmet_needs', label: '미충족 니즈', inputType: 'textarea', placeholder: '아직 충족되지 않은 요구사항' },
      { key: 'purchase_barrier', label: '구매 장벽', inputType: 'textarea', placeholder: '가격, 물량, 인증 등 장벽' },
      { key: 'opportunity', label: '기회 요인', inputType: 'textarea', placeholder: '규제 변화, 트렌드 등 기회' },
      { key: 'priority', label: '고객 우선순위', inputType: 'select', options: ['가격', '품질', '납기', '서비스', '기술', '복합'] },
    ],
  },
  {
    key: 'trade_conditions',
    label: '거래조건 파악',
    weight: 0.20,
    items: [
      { key: 'unit_price', label: '현재 적용 단가', inputType: 'text', placeholder: '주요 제품 단가' },
      { key: 'net_terms', label: '결제조건', inputType: 'select', options: ['선결제', 'NET 30', 'NET 60', 'NET 90', 'NET 120', 'LC', '기타'] },
      { key: 'contract_expiry', label: '계약 만료일', inputType: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'moq', label: 'MOQ/목표물량', inputType: 'text', placeholder: 'MOQ 및 연간 목표물량' },
      { key: 'discount', label: '할인 구조', inputType: 'text', placeholder: '볼륨 디스카운트 조건' },
    ],
  },
  {
    key: 'relationship_depth',
    label: '관계 깊이',
    weight: 0.10,
    items: [
      { key: 'dm_access', label: 'DM 접근', inputType: 'select', options: ['직접 가능', '간접 가능', '불가'] },
      { key: 'recent_visit', label: '최근 방문/미팅', inputType: 'text', placeholder: '최근 방문일/형태' },
      { key: 'trust_level', label: '신뢰도', inputType: 'select', options: ['높음 (정보공유)', '보통', '낮음', '초기'] },
      { key: 'multi_channel', label: '다채널 관계', inputType: 'select', options: ['다부서 관계', '단일 창구', '미구축'] },
    ],
  },
];

/* ── GAP 분석: 수주 미달 원인 분류 ── */
export const GAP_CAUSES = [
  { key: 'demand_down', label: '수요 감소', icon: '📉', desc: '고객 소비량 감소, 재고 과잉, 시장 위축' },
  { key: 'competition', label: '경쟁 이탈', icon: '⚔️', desc: '경쟁사 진입/가격공세, 점유율 하락' },
  { key: 'price_barrier', label: '가격 장벽', icon: '💰', desc: '단가 불만, 환율 영향, 예산 제약' },
  { key: 'channel_issue', label: '채널 문제', icon: '🔗', desc: '유통구조 변화, 재고 적체, 리오더 지연' },
  { key: 'regulation', label: '인증/규제', icon: '📋', desc: '인증 만료, 신규 규제, 등록 지연' },
  { key: 'relationship', label: '관계 약화', icon: '🤝', desc: '담당자 교체, 미접촉, DM 접근 불가' },
  { key: 'timing', label: '시점 차이', icon: '⏰', desc: '발주 시기 지연, 예산 이월, 계절성' },
  { key: 'internal', label: '내부 이슈', icon: '🏭', desc: '납기 지연, 품질 문제, 생산 차질' },
];

/* ── GAP 분석: 기회 유형 ── */
export const OPPORTUNITY_TYPES = [
  { key: 'upsell', label: '업셀링', desc: '기존 품목 물량 확대' },
  { key: 'crosssell', label: '크로스셀링', desc: '타 품목 신규 도입' },
  { key: 'new_bid', label: '신규 입찰', desc: '향후 입찰 참여 기회' },
  { key: 'contract_renewal', label: '계약 갱신', desc: '계약 갱신/조건 개선' },
  { key: 'price_restructure', label: '가격구조 개선', desc: '볼륨 디스카운트, 패키지' },
  { key: 'new_channel', label: '신규 채널', desc: '유통채널 확대/변경' },
];

/* ── GAP 분석: 예산 사이클 ── */
export const BUDGET_CYCLES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '분기별', '수시'];

/* ── 전략 등급 ── */
export const STRATEGIC_TIERS = [
  { key: 'A', label: 'Key Account', color: '#2e7d32', desc: '연간 수주 상위 20%, 전략 제품 확장 파트너' },
  { key: 'B', label: 'Growth Target', color: '#1565c0', desc: '현재 거래 규모는 작지만 성장 가능성 높음' },
  { key: 'C', label: 'Maintain', color: '#f9a825', desc: '안정적 반복 구매, 현상 유지' },
  { key: 'D', label: 'Watch', color: '#c62828', desc: '감소 추세, 경쟁 침투 감지, 이탈 위험' },
];

/* ── 비즈니스 건강도 ── */
export const BIZ_HEALTH_OPTIONS = {
  revenue_trend: ['성장', '보합', '축소', '불명'],
  budget_trend: ['증가', '유지', '삭감', '불명'],
  contact_change: ['변동 있음', '변동 없음'],
};

/* ── 공급자 지위 ── */
export const SUPPLIER_POSITIONS = ['단독 공급', '주공급자(70%↑)', '복수 중 하나', '소량 테스트 중'];
export const COMPETITOR_PRICE_LEVELS = ['높음', '유사', '낮음', '불명'];
export const SUBSTITUTE_SEARCH = ['탐색 중', '아니오', '불명'];

/* ── 구매결정 구조 ── */
export const INFLUENCER_ROLES = ['품질', '재무', '현장', '구매', '경영진', '기술', '기타'];
export const RELATIONSHIP_TEMPS = ['우호적', '중립', '비우호적', '미파악'];

/* ── 페이지네이션 ── */
export const PAGE_SIZE = 30;

/* ── localStorage 키 ── */
export const STORAGE_KEY = 'bioprotech_account_crm_v1';
export const AUTH_KEY = 'bioprotech_account_auth_v1';
