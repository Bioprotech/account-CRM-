# 계정 이관 가이드 — Claude 구독 변경

> Claude(Claude Code) 사용 계정(구독)을 회사 계정으로 변경 시,
> 새 계정/PC에서 이 프로젝트 작업을 그대로 이어가기 위한 체크리스트.
> **이 프로젝트의 코드·Firebase·GitHub은 변경되지 않습니다. Claude 구독만 바뀝니다.**

작성: 2026-05-20

---

## ✅ 1. 새 계정/PC에서 가장 먼저 할 일

새 Claude Code 세션을 시작하면, Claude가 자동으로 `CLAUDE.md`를 읽어 컨텍스트를 파악합니다.
사용자는 첫 메시지로 다음만 말하면 됩니다:

```
account-crm 프로젝트 작업을 이어가려 합니다.
CLAUDE.md와 SESSION_HANDOFF.md를 읽고 현재 상태를 파악해줘.
```

Claude가 읽어야 할 문서 (우선순위 순):
1. **CLAUDE.md** — 작업 규칙·절대 규칙·핵심 파일 (자동 로드)
2. **SESSION_HANDOFF.md** — 직전 작업 상태 (v3.21)
3. **PROJECT_CONTEXT.md** — 전체 맥락
4. **DEVELOPMENT_LOG.md** — 상세 이력
5. **WORKFLOW.md** — 작업 절차

---

## ✅ 2. 같은 PC에서 계정만 바꾸는 경우

가장 간단합니다. 대부분 그대로 작동합니다:

- [ ] 프로젝트 폴더 그대로 (`C:\Users\haksu\OneDrive\Claude Cowork\Customer CRM\account-crm\`)
- [ ] Firebase CLI 로그인 — 그대로 유지됨 (`firebase login:list`로 확인)
- [ ] GitHub 인증 — 그대로 유지됨 (`git remote -v`로 확인)
- [ ] node_modules — 그대로 (없으면 `npm install`)
- [ ] ⚠ **Claude의 기억(MEMORY.md)**: `~/.claude/` 폴더에 저장되며 PC에 종속.
      같은 PC면 유지될 가능성이 높지만, **CLAUDE.md에 모든 핵심을 복제**해두었으므로
      기억이 사라져도 작업 가능.

---

## ✅ 3. 다른 PC에서 새 계정을 쓰는 경우

새 PC에서 환경을 재구성해야 합니다:

### 3-1. 프로젝트 코드 받기
```powershell
# 방법 A: OneDrive 동기화 (이미 OneDrive 폴더면 자동)
# 방법 B: git clone
git clone https://github.com/Bioprotech/account-CRM-.git
cd account-CRM-
```

### 3-2. Node.js + 의존성
```powershell
# Node.js v24.x 설치 확인
node --version
# 의존성 설치
npm install
```

### 3-3. Firebase CLI 로그인 (배포에 필요)
```powershell
npm install -g firebase-tools   # 없으면
firebase login                   # 회사 계정 또는 기존 Google 계정으로
firebase projects:list           # bioprotech-crm 보이는지 확인
```
> ⚠ Firebase 프로젝트(`bioprotech-crm`) 접근 권한이 있는 Google 계정으로 로그인해야 배포 가능.
> 권한 없으면 기존 소유자가 Firebase 콘솔 → 프로젝트 설정 → 사용자 및 권한에서 새 계정 추가.

### 3-4. GitHub 인증 (push에 필요)
```powershell
git config user.name "이름"
git config user.email "이메일"
# push 시 GitHub 인증 (PAT 토큰 또는 gh auth login)
```

### 3-5. 동작 확인
```powershell
npm run build      # 빌드 성공 확인
npx firebase deploy --only hosting   # (사용자 컨펌 후) 배포 테스트
```

---

## ✅ 4. 변경되지 않는 것 (안심)

| 항목 | 상태 |
|---|---|
| Firebase 프로젝트 `bioprotech-crm` | 그대로 |
| Firestore 데이터 (고객·수주·매출 등) | 그대로 |
| 라이브 URL https://bioprotech-account-crm.web.app | 그대로 |
| GitHub 저장소 | 그대로 |
| 앱 내 담당자 계정 (Haksu/Iris/Rebecca 등) | 그대로 |
| 앱 관리자 비밀번호 `1208` | 그대로 |

→ **Claude 구독만 바뀌고, 서비스·데이터·코드는 모두 유지됩니다.**

---

## ✅ 5. 이관 직전 체크 (현재 계정에서 미리 할 일)

- [ ] **현재 작업(v3.21)을 git에 push** — 새 계정에서 `git pull`로 이어받기
- [ ] CLAUDE.md / SESSION_HANDOFF.md 최신화 (이 작업으로 완료)
- [ ] 필요 시 v3.21 배포 (사용자 컨펌)
- [ ] (선택) `~/.claude/`의 MEMORY.md 핵심 내용은 CLAUDE.md에 복제됨 — 별도 백업 불필요

---

## 📎 참고: 자매 앱 Pipeline CRM

동일 방식으로 이관. 위치: `C:\Users\haksu\OneDrive\Claude Cowork\bioprotech-crm\`
- URL: https://bioprotech-crm.web.app
- GitHub: https://github.com/Bioprotech/pipeline-CRM-.git
- 같은 Firebase 프로젝트(bioprotech-crm), 컬렉션 분리(customers/app_settings/snapshots)
- 그 폴더에도 동일하게 CLAUDE.md를 만들어두면 새 계정에서 즉시 작업 가능

---

*이 가이드는 Claude 구독 계정 변경 대비용 — 2026-05-20 작성*
