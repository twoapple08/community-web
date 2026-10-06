#!/usr/bin/env bash
# =====================================================================
#  SFAClan 업데이트 실서버 적용 스크립트 (PC Git Bash / MSYS2 / Codespaces 터미널용)
#  - 수정본(작업 브랜치, 기본값은 아래 BRANCH)을 main 에 합치고
#  - 패키지 설치 → 에러 검사(타입 + 프로덕션 빌드) → 통과 시에만 main 에 push (= Vercel 실서버 배포)
#  - 에러가 하나라도 나면 즉시 멈추고 push 하지 않습니다.
# =====================================================================
set -euo pipefail

BRANCH="${1:-claude/charming-ptolemy-oe6qxa}"

cd "$(git rev-parse --show-toplevel)"

# Windows 의 MSYS2(UCRT64) / Git Bash 터미널은 Node.js 경로를 못 찾는 경우가 있음
# → npm 이 없으면 흔한 설치 위치를 찾아 이 스크립트 안에서만 PATH 에 추가 (git 작업 전에 확인해서 중간에 멈추지 않게)
if ! command -v npm >/dev/null 2>&1; then
  for dir in \
    "/c/Program Files/nodejs" \
    "/c/Program Files (x86)/nodejs" \
    "/c/nvm4w/nodejs" \
    "${NVM_SYMLINK:+$(cygpath -u "$NVM_SYMLINK" 2>/dev/null || true)}" \
    "${LOCALAPPDATA:+$(cygpath -u "$LOCALAPPDATA" 2>/dev/null || true)/Programs/nodejs}"; do
    if [ -n "$dir" ] && [ -f "$dir/node.exe" ]; then
      export PATH="$dir:$PATH"
      echo "  → Node.js 경로를 찾아 추가했습니다: $dir"
      break
    fi
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[중단] Node.js(npm) 를 찾을 수 없습니다. 아무것도 바꾸지 않았습니다."
  echo "  - VS Code 터미널 오른쪽 위 '+' 옆 화살표 → 'Git Bash' 로 새 터미널을 열고 다시 실행하거나"
  echo "  - PowerShell 에서 'where.exe node' 로 Node.js 위치를 확인해 알려 주세요."
  exit 1
fi
echo "  → node $(node -v), npm $(npm -v)"

echo "=================================================="
echo " 0) 작업 폴더 정리 (저장 안 된 변경이 있으면 백업 보관)"
echo "=================================================="
if [ -n "$(git status --porcelain)" ]; then
  BACKUP="backup-before-sfaclan-update-$(date +%Y%m%d-%H%M%S)"
  git stash push -u -m "$BACKUP"
  echo "  → 기존 변경사항을 '$BACKUP' 이름으로 git stash 에 보관했습니다. (복구: git stash list / git stash pop)"
fi

echo "=================================================="
echo " 1) 최신 수정본 내려받기"
echo "=================================================="
git fetch origin main "$BRANCH"
git checkout main
git pull --ff-only origin main
git merge --no-edit "origin/$BRANCH"

echo "=================================================="
echo " 2) 패키지 설치"
echo "=================================================="
npm ci

echo "=================================================="
echo " 3) 에러 검사 (타입 검사 + 프로덕션 빌드)"
echo "=================================================="
npx tsc --noEmit
npm run build

echo "=================================================="
echo " [통과] 에러 없음 → 실서버 배포(main push) 진행"
echo "=================================================="
git push origin main

echo "=================================================="
echo " [완료] Vercel 이 자동으로 실서버에 배포합니다. (보통 1~3분)"
echo "  ※ Vercel 에서 예전에 'Instant Rollback(되돌리기)'을 했다면"
echo "    Vercel 대시보드 → Deployments 에서 새 배포를 'Promote to Production' 해 주세요."
echo "=================================================="
