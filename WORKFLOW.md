# 작업 워크플로우 (공통) — Pipeline CRM / Account CRM

> 두 프로젝트 모두 동일 절차 적용.
> Claude Code 세션에서 코드 수정 후 **반드시** 이행.

---

## 🔄 수정 후 필수 체크리스트

코드 변경 후 다음 5단계를 **순서대로** 이행:

### ① Build & Deploy
```powershell
# Account CRM
cd "C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm"
npm run build
npx firebase deploy --only hosting

# Pipeline CRM
cd "C:\Users\haksu\OneDrive\Claude Cowork\bioprotech-crm"
npm run build
npx firebase deploy --only hosting
```

### ② src/lib/changelog.js 갱신
앱 내 "📝 업데이트 내역" 메뉴에 표시됨. 최상단에 새 버전 항목 추가:

```javascript
export const CHANGELOG = [
  {
    version: 'v2.9',        // 또는 v8.1 (Pipeline은 v7/v8 계열)
    date: '2026-04-XX',
    title: '간결한 제목',
    items: [
      '🆕 주요 기능 1 — 상세 설명',
      '🔧 개선 사항 — 상세 설명',
      '🐛 버그 수정 — 상세 설명',
    ],
  },
  // 기존 항목들...
];
```

### ③ DEVELOPMENT_LOG.md 표에 날짜별 내역 추가
파일 끝의 "배포 이력" 또는 변경 이력 표에 한 줄 추가:

```markdown
| 2026-04-XX | 간단한 한 줄 요약 (이 줄이 표의 마지막에 오도록) |
```

파일 상단의 "최종 업데이트" 날짜도 함께 갱신.

### ④ Git commit + push
```bash
git add <수정된_파일들>
git commit -m "$(cat <<'EOF'
v2.X — 제목 한 줄

[상세 내용]
- 변경 1
- 변경 2
- 변경 3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

**저장소**:
- Account CRM: https://github.com/Bioprotech/account-CRM-.git
- Pipeline CRM: https://github.com/Bioprotech/pipeline-CRM-.git

### ⑤ MEMORY.md 갱신 (중대한 변경 시만)
`C:\Users\haksu\.claude\projects\...\memory\MEMORY.md`
- 새로운 주요 기능, 아키텍처 변경, 핵심 파일 경로 변경 시에만
- 사소한 버그 수정·UI 조정은 제외

---

## 📁 필수 MD 파일 (두 프로젝트 공통)

각 프로젝트 루트에 반드시 유지:

| 파일 | 역할 | 갱신 빈도 |
|---|---|---|
| `README.md` | 프로젝트 기본 소개 | 초기 1회 + 대형 변경 시 |
| `PROJECT_CONTEXT.md` (Account) / `CONTEXT.md` (Pipeline) | 아키텍처 종합 요약 + 핵심 파일 위치 | 구조 변경 시 |
| `DEVELOPMENT_LOG.md` | 날짜별 변경 이력 표 | **매 작업 시** |
| `WORKFLOW.md` | 본 문서 (공통 작업 절차) | 절차 변경 시 |
| `src/lib/changelog.js` | 앱 내 릴리스 노트 | **매 버전 배포 시** |

---

## 🎯 작업 시작 체크리스트 (세션 처음)

Claude Code 새 세션 시작 시:

1. 작업할 프로젝트 폴더로 이동:
   - Account CRM: `C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm\`
   - Pipeline CRM: `C:\Users\haksu\OneDrive\Claude Cowork\bioprotech-crm\`
2. 다음 파일들 먼저 읽기:
   - `PROJECT_CONTEXT.md` (또는 `CONTEXT.md`) — 프로젝트 전체 맥락
   - `DEVELOPMENT_LOG.md` — 최근 작업 이력 (마지막 10~20줄)
3. `git status` + `git log --oneline -10` 확인하여 이전 세션 상태 파악

---

## ⚠️⚠️⚠️ Account CRM — 담당자 분류 절대 규칙

사용자가 여러 차례 강조한 **반드시 준수해야 할** 규칙입니다. 위반 시 리포트에 의미 없는 담당자(Lijian/Milena/이다은 등)가 계속 노출되어 사용자 신뢰를 잃습니다.

### 문제 상황
영업현황 Excel에는 사업계획과 무관한 담당자 이름이 다수 포함되어 있음.

### 반드시 준수

**1. 유효 담당자 = 사업계획 담당자 ∪ teamMembers**
```js
import { getValidSalesReps, getSortedValidReps } from '../lib/salesReps';
const validReps = getSortedValidReps({ businessPlans, teamMembers });
```

**2. 주문/매출 담당자 집계 시 `classifyForRepView()` 사용**
```js
import { classifyForRepView } from '../lib/customerClassification';
const { rep, bucket } = classifyForRepView({
  account, customerName, planByName, priorSet
});
// rep = 사업계획 매칭 시 plan.sales_rep
//     = 외+전년수주有 → '국내기타' | '해외기타'
//     = 외+전년수주無 → '국내신규' | '해외신규'
```

**3. 금지된 패턴 — 절대 사용 금지**
- ❌ `p.sales_rep || o.sales_rep || '기타'`
- ❌ `o.sales_rep || '미배정'`
- ❌ `plan?.sales_rep || o.sales_rep`

**4. 적용 범위 — 전 시스템**
주간 리포트 · 월간 리포트 · 대시보드 · OrderReport · 진도관리 · GAP 분석 — 모두 위 규칙 준수.

**5. 점검 명령**: 위반 코드 검색
```bash
grep -rn "o\.sales_rep \|\|" src/
grep -rn "|| '미배정'" src/
```

---

## 🔐 보안 및 주의사항

- **관리자 비밀번호**: 두 프로젝트 모두 `1208` (동일)
- **Firestore 보안 규칙**: `allow read, write: if true` (개발 단계, 추후 강화)
- **민감 파일 Git 제외**: `.firebase/`, `node_modules/`, `dist/` 등 `.gitignore` 설정됨
- **Firebase 프로젝트**: 두 앱 모두 `bioprotech-crm` 공유, 컬렉션만 분리

---

## 🧰 자주 쓰는 명령어

### 개발
```powershell
npm run dev         # 개발 서버 (포트: Account 5174, Pipeline 5173)
npm run build       # 프로덕션 빌드 → dist/
npm run preview     # 빌드 결과 로컬 프리뷰
```

### Firebase
```powershell
npx firebase deploy --only hosting                  # 배포
npx firebase projects:list                          # 프로젝트 확인
```

### Git
```bash
git status
git log --oneline -20
git diff HEAD~1
git push                                            # 원격 반영
```

---

## 📊 환경 정보

| 항목 | 값 |
|---|---|
| OS | Windows 10/11 |
| 셸 | PowerShell (bash 문법 불가) |
| Node.js | v24.14.0 |
| 패키지매니저 | npm |
| 프론트엔드 | React 19 + Vite |
| 백엔드 | Firebase Firestore + Storage + Hosting |

---

## 🔗 관련 문서

### Account CRM 내부 문서
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) — 프로젝트 전체 아키텍처
- [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) — 날짜별 변경 이력
- [account-CRM-REPORT-SPEC.md](./account-CRM-REPORT-SPEC.md) — 리포트 탭 설계 스펙
- [README.md](./README.md) — 프로젝트 소개

### Pipeline CRM 내부 문서
- `../../bioprotech-crm/CONTEXT.md` — 아키텍처
- `../../bioprotech-crm/DEVELOPMENT_LOG.md` — 변경 이력
- `../../bioprotech-crm/README.md` — 프로젝트 소개

### 사용자 메모리
- `C:\Users\haksu\.claude\projects\...\memory\MEMORY.md` — 세션 간 유지

---

*최종 업데이트: 2026-04-20 | 두 CRM 프로젝트 모두 이 절차 준수*
