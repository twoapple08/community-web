#!/usr/bin/env bash
# =====================================================================
#  앱 빌드 준비를 한 번에 (Codespaces 터미널용, 처음 한 번만)
#   1) 안드로이드 서명 키 만들기 (이미 있으면 그대로 사용)
#   2) GitHub Secrets 6개 등록 (서명 키 4개 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
#   3) 서명 키 백업: Supabase 비공개 버킷 app-signing-backup 에 키 파일·비밀번호 올리기
#      (아무 정책도 없는 버킷 → 사이트 사용자는 못 보고, Supabase 대시보드 Storage 에서만 내려받을 수 있음)
#
#  실행 (Codespaces 터미널):
#    cd /workspaces/community-web && bash <(git fetch -q origin ccr-d081b1c2-9mjot4 && git show origin/ccr-d081b1c2-9mjot4:apps/android/scripts/codespaces-setup-secrets.sh)
#
#  중간에 물어보는 것
#    - GitHub 로그인 (처음 한 번): 화면의 8자리 코드를 https://github.com/login/device 에 입력
#    - Supabase Project URL / service_role 키 (Supabase → Project Settings → API)
# =====================================================================
set -euo pipefail

REPO="twoapple08/community-web"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APP_DIR="$ROOT/apps/android"
KEY_DIR="$APP_DIR/keystore"
P12="$KEY_DIR/sfaclan-release.p12"
SECRETS_TXT="$KEY_DIR/github-secrets.txt"
BACKUP_BUCKET="app-signing-backup"

say() { printf '\n==== %s\n' "$*"; }
fail() { printf '\n[중단] %s\n' "$*" >&2; exit 1; }

[ -d "$APP_DIR" ] || fail "apps/android 폴더가 없습니다. 먼저 사이트 배포(main 반영)를 하고, 저장소 폴더에서 main 브랜치로 실행하세요."
command -v gh >/dev/null || fail "gh(깃허브 명령) 가 없습니다. Codespaces 에서 실행해 주세요."

# Codespaces 의 기본 토큰은 Secrets 를 등록할 권한이 없으므로, 본인 계정으로 로그인한 gh 를 씀
gh_user() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }

# ---------------------------------------------------------------------
say "1) 서명 키 준비"
# ---------------------------------------------------------------------
cd "$APP_DIR"
if [ -f "$P12" ] && [ -f "$SECRETS_TXT" ]; then
  echo "이미 만든 서명 키가 있어 그대로 사용합니다. ($P12)"
elif [ -f "$P12" ]; then
  fail "서명 키 파일은 있는데 비밀번호 파일(github-secrets.txt)이 없습니다. 이미 GitHub 에 등록했다면 이 스크립트는 다시 실행할 필요가 없습니다."
else
  echo "필요한 패키지 설치 중... (1~2분)"
  npm install --no-audit --no-fund --loglevel=error >/dev/null
  npm run --silent keystore
fi

secret_value() { awk -v k="$1" 'f { print; exit } $0 == k { f = 1 }' "$SECRETS_TXT"; }
KEY_B64="$(secret_value ANDROID_KEYSTORE_BASE64)"
KEY_PASS="$(secret_value ANDROID_KEYSTORE_PASSWORD)"
KEY_ALIAS="$(secret_value ANDROID_KEY_ALIAS)"
[ -n "$KEY_B64" ] && [ -n "$KEY_PASS" ] && [ -n "$KEY_ALIAS" ] || fail "github-secrets.txt 를 읽지 못했습니다."

# ---------------------------------------------------------------------
say "2) Supabase 정보 입력 (Supabase → Project Settings → API)"
# ---------------------------------------------------------------------
read -r -p "Project URL (https://xxxx.supabase.co): " SB_URL
SB_URL="$(printf '%s' "$SB_URL" | tr -d '[:space:]')"
SB_URL="${SB_URL%/}"
[[ "$SB_URL" =~ ^https://[a-z0-9-]+\.supabase\.co$ ]] || fail "Project URL 형식이 아닙니다: $SB_URL"
read -r -s -p "service_role 키 (붙여넣어도 화면에 안 보입니다): " SB_KEY
echo
SB_KEY="$(printf '%s' "$SB_KEY" | tr -d '[:space:]')"
[ "${#SB_KEY}" -ge 20 ] || fail "service_role 키가 너무 짧습니다. 다시 확인해 주세요."

# 키가 맞는지 먼저 확인 (버킷 목록 조회)
code="$(curl -s -o /dev/null -w '%{http_code}' "$SB_URL/storage/v1/bucket" -H "Authorization: Bearer $SB_KEY" -H "apikey: $SB_KEY")"
[ "$code" = "200" ] || fail "Supabase 접속 확인 실패 (HTTP $code). URL 과 service_role 키를 확인해 주세요."
echo "Supabase 확인 완료"

# ---------------------------------------------------------------------
say "3) 서명 키 백업 → Supabase 비공개 버킷 $BACKUP_BUCKET"
# ---------------------------------------------------------------------
curl -s -o /dev/null -X POST "$SB_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $SB_KEY" -H "apikey: $SB_KEY" -H "Content-Type: application/json" \
  -d "{\"id\":\"$BACKUP_BUCKET\",\"name\":\"$BACKUP_BUCKET\",\"public\":false}" || true
STAMP="$(date -u +%Y%m%d-%H%M%S)"
upload() { # $1=저장 경로 $2=로컬 파일 $3=종류
  local c
  c="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SB_URL/storage/v1/object/$BACKUP_BUCKET/$1" \
    -H "Authorization: Bearer $SB_KEY" -H "apikey: $SB_KEY" -H "Content-Type: $3" --data-binary "@$2")"
  [ "$c" = "200" ] || fail "백업 업로드 실패 ($1, HTTP $c)"
}
upload "$STAMP/sfaclan-release.p12" "$P12" "application/x-pkcs12"
upload "$STAMP/github-secrets.txt" "$SECRETS_TXT" "text/plain"
echo "백업 완료: Supabase → Storage → $BACKUP_BUCKET → $STAMP/"

# ---------------------------------------------------------------------
say "4) GitHub 로그인 확인"
# ---------------------------------------------------------------------
if ! gh_user auth status -h github.com >/dev/null 2>&1; then
  echo "아래에 나오는 8자리 코드를 휴대폰 브라우저에서 https://github.com/login/device 에 입력하고 승인하세요."
  echo "(브라우저를 열 수 없다는 메시지가 나와도 괜찮습니다)"
  gh_user auth login -h github.com -p https -w -s repo
fi

# ---------------------------------------------------------------------
say "5) GitHub Secrets 등록 ($REPO)"
# ---------------------------------------------------------------------
set_secret() { printf '%s' "$2" | gh_user secret set "$1" -R "$REPO" >/dev/null && echo "  등록: $1"; }
set_secret ANDROID_KEYSTORE_BASE64 "$KEY_B64"
set_secret ANDROID_KEYSTORE_PASSWORD "$KEY_PASS"
set_secret ANDROID_KEY_ALIAS "$KEY_ALIAS"
set_secret ANDROID_KEY_PASSWORD "$KEY_PASS"
set_secret SUPABASE_URL "$SB_URL"
set_secret SUPABASE_SERVICE_ROLE_KEY "$SB_KEY"

# 등록·백업이 끝났으므로 비밀번호 파일은 지움 (키 파일은 이 Codespace 에도 남겨 둠, 커밋되지 않음)
rm -f "$SECRETS_TXT"

say "[완료]"
echo "- GitHub Secrets 6개 등록 완료"
echo "- 서명 키 백업: Supabase → Storage → $BACKUP_BUCKET → $STAMP/ (sfaclan-release.p12, github-secrets.txt)"
echo "  ※ 이 백업을 잃으면 앱 업데이트가 안 됩니다. 버킷을 지우지 마세요."
