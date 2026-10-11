#!/usr/bin/env bash
# =====================================================================
#  앱 푸시 알림 준비 + 앱 빌드를 한 번에 (Codespaces 터미널용, 처음 한 번만)
#   1) Firebase 파일 2개 확인 (google-services.json, 서비스 계정 키 JSON)
#   2) GitHub Secret GOOGLE_SERVICES_JSON 등록 (안드로이드 앱에 푸시 기능 넣기)
#   3) Supabase Edge Function send-push 배포 (JWT 확인 끔) + 비밀 값 2개 등록
#   4) 배포된 함수 동작 확인 → DB 와 연결 (sfa_set_push_endpoint)
#   5) 안드로이드·윈도우 앱 빌드 시작 (Supabase 비공개 버킷에 업로드)
#
#  실행 (Codespaces 터미널):
#    cd /workspaces/community-web && bash <(git fetch -q origin ccr-d081b1c2-9mjot4 && git show origin/ccr-d081b1c2-9mjot4:apps/android/scripts/codespaces-setup-push.sh)
#
#  준비물
#    - Firebase 에서 받은 파일 2개: google-services.json, 서비스 계정 키(...firebase-adminsdk...json)
#      → Codespaces 왼쪽 파일 목록의 apps/android/keystore 폴더에 올리거나(Upload), 실행 중에 내용을 붙여넣기
#    - Supabase Project URL, Supabase 액세스 토큰(sbp_...)
# =====================================================================
set -euo pipefail

REPO="twoapple08/community-web"
APP_ID="com.sfaclan.community"
SUPABASE_CLI_VERSION="2.120.0"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
KEY_DIR="$ROOT/apps/android/keystore"
FN_SRC="$ROOT/supabase/functions/send-push/index.ts"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
STTY_SAVED=""
cleanup() {
  [ -n "$STTY_SAVED" ] && stty "$STTY_SAVED" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

say() { printf '\n==== %s\n' "$*"; }
fail() { printf '\n[중단] %s\n' "$*" >&2; exit 1; }

# Codespaces 의 기본 토큰(GITHUB_TOKEN)은 Secrets 등록·빌드 실행 권한이 없으므로 본인 로그인으로 gh 사용
gh_user() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }
# Supabase CLI (버전 고정, 사람이 읽는 출력)
sb() { npx -y "supabase@${SUPABASE_CLI_VERSION}" "$@" --agent no; }

[ -f "$FN_SRC" ] || fail "supabase/functions/send-push/index.ts 가 없습니다. 저장소 폴더(main 브랜치, 사이트 배포 후)에서 실행해 주세요."
for cmd in gh node npx python3 curl base64; do
  command -v "$cmd" >/dev/null || fail "$cmd 명령이 없습니다. Codespaces 에서 실행해 주세요."
done

# ---------------------------------------------------------------------
say "1) GitHub 로그인 확인"
# ---------------------------------------------------------------------
if ! gh_user auth status -h github.com >/dev/null 2>&1; then
  echo "아래 8자리 코드를 휴대폰 브라우저에서 https://github.com/login/device 에 입력하고 승인하세요."
  echo "(브라우저를 열 수 없다는 메시지가 나와도 괜찮습니다)"
  gh_user auth login -h github.com -p https -w -s repo
fi
missing=""
existing="$(gh_user secret list -R "$REPO" --json name -q '.[].name' 2>/dev/null || true)"
for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  grep -qx "$name" <<<"$existing" || missing="$missing $name"
done
[ -z "$missing" ] || fail "GitHub Secrets 가 빠져 있습니다:$missing → 먼저 codespaces-setup-secrets.sh 를 실행해 주세요."
echo "GitHub 로그인·기존 Secrets 6개 확인 완료"

# ---------------------------------------------------------------------
say "2) Firebase 파일 2개 확인"
# ---------------------------------------------------------------------
mkdir -p "$KEY_DIR"

# 저장소 안에서 올린 JSON 파일을 내용으로 구분 (파일 이름은 상관없음, node_modules 등은 제외)
find_uploaded() {
  find "$ROOT" -maxdepth 5 -type f -name '*.json' \
    -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/target/*' \
    -not -path '*/android/app/src/*' -size -64k -print0 2>/dev/null |
  node -e '
    const fs = require("fs")
    const files = fs.readFileSync(0, "utf8").split("\0").filter(Boolean)
    let gs = "", sa = ""
    for (const f of files) {
      let o
      try { o = JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")) } catch { continue }
      if (!o || typeof o !== "object") continue
      if (!sa && o.type === "service_account" && o.private_key) sa = f
      else if (!gs && o.project_info && Array.isArray(o.client)) gs = f
    }
    console.log(gs); console.log(sa)
  '
}

# 붙여넣은 JSON 을 끝까지 읽음 (한 줄 4095자 제한 피하기, Ctrl+D 없이 JSON 이 완성되면 자동으로 끝)
read_json_paste() { # $1 = 저장할 파일
  if [ -t 0 ]; then
    STTY_SAVED="$(stty -g)"
    stty -icanon min 1 time 0
  fi
  local rc=0
  python3 -I -c '
import json, sys
buf = ""
for line in sys.stdin:
    buf += line
    t = buf.lstrip("﻿").strip()
    if not t:
        continue
    try:
        json.loads(t)
    except ValueError:
        continue
    with open(sys.argv[1], "w") as f:
        f.write(t + "\n")
    sys.exit(0)
sys.exit(1)' "$1" || rc=$?
  if [ -n "$STTY_SAVED" ]; then stty "$STTY_SAVED"; STTY_SAVED=""; fi
  return $rc
}

GS_FILE=""
SA_FILE=""
while :; do
  { read -r GS_FILE; read -r SA_FILE; } < <(find_uploaded)
  if [ -n "$GS_FILE" ] && [ -n "$SA_FILE" ]; then break; fi
  echo
  [ -n "$GS_FILE" ] && echo "  ✓ google-services.json 찾음" || echo "  ✗ google-services.json 없음"
  [ -n "$SA_FILE" ] && echo "  ✓ 서비스 계정 키 찾음" || echo "  ✗ 서비스 계정 키(...firebase-adminsdk...json) 없음"
  echo
  echo "방법 1) Codespaces 왼쪽 파일 목록에서 apps → android → keystore 폴더를 길게 누르거나 오른쪽 클릭 → Upload..."
  echo "        → 휴대폰에 받은 파일을 골라 올린 뒤, 여기서 Enter"
  echo "방법 2) p 를 입력하고 Enter → 파일 내용을 통째로 복사해 붙여넣기"
  read -r -p "선택 (Enter = 다시 찾기, p = 붙여넣기, q = 그만): " choice
  case "$choice" in
    q|Q) fail "사용자가 중단했습니다." ;;
    p|P)
      if [ -z "$GS_FILE" ]; then
        echo "google-services.json 내용을 붙여넣으세요 (붙여넣기가 끝나면 자동으로 다음으로 넘어갑니다):"
        read_json_paste "$KEY_DIR/google-services.json" || fail "google-services.json 을 읽지 못했습니다."
        echo "  ✓ 받음"
      fi
      if [ -z "$SA_FILE" ]; then
        echo "서비스 계정 키 JSON 내용을 붙여넣으세요 (붙여넣기가 끝나면 자동으로 다음으로 넘어갑니다):"
        read_json_paste "$KEY_DIR/firebase-service-account.json" || fail "서비스 계정 키를 읽지 못했습니다."
        chmod 600 "$KEY_DIR/firebase-service-account.json"
        echo "  ✓ 받음"
      fi
      ;;
  esac
done

# 내용 확인 + 정리 (앱 빌드의 확인 방식과 같게, 프로젝트가 같은지도 확인)
node - "$GS_FILE" "$SA_FILE" "$WORK" "$APP_ID" <<'EOF' || fail "Firebase 파일 확인 실패 (위 메시지 참고)"
const fs = require('fs')
const crypto = require('crypto')
const [gsPath, saPath, outDir, appId] = process.argv.slice(2)
const die = (m) => { console.error('  ✗ ' + m); process.exit(1) }
const load = (p, label) => {
  let t = ''
  try { t = fs.readFileSync(p, 'utf8') } catch { die(label + ' 을 읽을 수 없습니다.') }
  t = t.replace(/^﻿/, '').trim()
  if (!t) die(label + ' 이 비어 있습니다.')
  try { return JSON.parse(t) } catch { die(label + ' 이 올바른 JSON 이 아닙니다.') }
}
const gs = load(gsPath, 'google-services.json')
const sa = load(saPath, '서비스 계정 키')
const pid = gs?.project_info?.project_id
if (typeof pid !== 'string' || !pid) die('google-services.json 에 project_id 가 없습니다.')
if (!(Array.isArray(gs.client) && gs.client.some((c) => c?.client_info?.android_client_info?.package_name === appId)))
  die(`google-services.json 에 패키지 ${appId} 앱이 없습니다. Firebase 에서 Android 앱을 패키지 이름 ${appId} 로 추가했는지 확인하세요.`)
if (sa.type !== 'service_account') die('서비스 계정 키 파일이 아닙니다. (Firebase → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성)')
for (const k of ['project_id', 'client_email', 'private_key'])
  if (typeof sa[k] !== 'string' || !sa[k].trim()) die('서비스 계정 키에 ' + k + ' 가 없습니다.')
try { crypto.createPrivateKey(sa.private_key.replace(/\\n/g, '\n')) } catch { die('서비스 계정 키의 private_key 를 읽을 수 없습니다. 파일을 다시 받아 주세요.') }
if (sa.project_id !== pid) die(`두 파일의 Firebase 프로젝트가 다릅니다 (google-services: ${pid}, 서비스 계정: ${sa.project_id}). 같은 프로젝트에서 받아 주세요.`)
fs.writeFileSync(outDir + '/gs.json', JSON.stringify(gs, null, 2) + '\n', { mode: 0o600 })
fs.writeFileSync(outDir + '/sa.b64', Buffer.from(JSON.stringify(sa)).toString('base64'), { mode: 0o600 })
console.log('  ✓ Firebase 프로젝트: ' + pid)
EOF

# ---------------------------------------------------------------------
say "3) Supabase 정보 입력"
# ---------------------------------------------------------------------
echo "Project URL: Supabase → Project Settings → Data API(또는 API) 의 Project URL"
read -r -p "Project URL (https://xxxx.supabase.co): " SB_URL
SB_URL="$(printf '%s' "$SB_URL" | tr -d '[:space:]')"
SB_URL="${SB_URL%/}"
[[ "$SB_URL" =~ ^https://([a-z]{20})\.supabase\.co$ ]] || fail "Project URL 형식이 아닙니다: $SB_URL"
SB_REF="${BASH_REMATCH[1]}"

echo
echo "액세스 토큰: 휴대폰 브라우저에서 https://supabase.com/dashboard/account/tokens 열기"
echo "  → Generate new token → 이름 아무거나(예: codespaces) → 만들어진 sbp_ 로 시작하는 값 복사"
read -r -s -p "액세스 토큰 붙여넣기 (화면에 안 보입니다): " SUPABASE_ACCESS_TOKEN
echo
SUPABASE_ACCESS_TOKEN="$(printf '%s' "$SUPABASE_ACCESS_TOKEN" | tr -d '[:space:]')"
[[ "$SUPABASE_ACCESS_TOKEN" =~ ^sbp_(oauth_|v0_)?[a-f0-9]{40}$ ]] || fail "액세스 토큰 형식이 아닙니다 (sbp_ 로 시작하는 값)."
export SUPABASE_ACCESS_TOKEN

echo "Supabase 도구 준비 중... (처음 한 번 1분 정도)"
sb --version >/dev/null || fail "Supabase CLI 를 준비하지 못했습니다. 잠시 후 다시 실행해 주세요."

# service_role 키: 토큰으로 자동으로 가져오고, 안 되면 붙여넣기
SB_KEY=""
if sb projects api-keys --project-ref "$SB_REF" --reveal -o json > "$WORK/keys.json" 2>/dev/null; then
  SB_KEY="$(python3 -I -c '
import json, sys
try:
    keys = json.load(open(sys.argv[1]))
except Exception:
    keys = []
print(next((k.get("api_key") or "" for k in keys if k.get("name") == "service_role"), ""))' "$WORK/keys.json")"
fi
rm -f "$WORK/keys.json"
if [[ "$SB_KEY" != eyJ* ]]; then
  echo "service_role 키를 자동으로 가져오지 못했습니다."
  echo "Supabase → Project Settings → API Keys → Legacy API Keys → service_role (secret) → Reveal → Copy"
  read -r -s -p "service_role 키 붙여넣기 (화면에 안 보입니다): " SB_KEY
  echo
  SB_KEY="$(printf '%s' "$SB_KEY" | tr -d '[:space:]')"
fi
python3 -I - "$SB_KEY" "$SB_REF" <<'EOF' || fail "service_role 키 확인 실패 (위 메시지 참고)"
import base64, json, sys
key, ref = sys.argv[1], sys.argv[2]
parts = key.split('.')
if len(parts) != 3:
    sys.exit('  ✗ eyJ 로 시작하는 Legacy service_role 키가 아닙니다.')
try:
    claims = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
except Exception:
    sys.exit('  ✗ 키를 읽을 수 없습니다. 다시 복사해 주세요.')
if claims.get('role') != 'service_role':
    sys.exit('  ✗ 이 키는 %s 키입니다. service_role 키를 넣어 주세요.' % claims.get('role'))
if claims.get('ref') and claims['ref'] != ref:
    sys.exit('  ✗ 다른 프로젝트(%s)의 키입니다.' % claims['ref'])
print('  ✓ service_role 키 확인')
EOF

rpc() { # $1 = 함수 이름, $2 = JSON 본문 → HTTP 코드 출력, 본문은 $WORK/rpc.out
  curl -sS --max-time 30 -o "$WORK/rpc.out" -w '%{http_code}' -X POST "$SB_URL/rest/v1/rpc/$1" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" -H "Accept: application/json" -d "$2"
}

code="$(rpc sfa_get_push_secret '{}')" || code="000"
case "$code" in
  200) ;;
  404) fail "DB 함수 sfa_get_push_secret 가 없습니다. supabase/sfaclan_update_2026-10-10_app.sql 을 먼저 실행해 주세요." ;;
  *) fail "푸시 비밀 값 조회 실패 (HTTP $code): $(head -c 200 "$WORK/rpc.out")" ;;
esac
PUSH_SECRET="$(python3 -I -c 'import json,sys; v=json.load(open(sys.argv[1])); print(v if isinstance(v,str) else "")' "$WORK/rpc.out")"
[ -n "$PUSH_SECRET" ] || fail "푸시 비밀 값이 비어 있습니다. 2026-10-10 SQL 을 다시 실행해 주세요."
echo "  ✓ 푸시 비밀 값 확인"

# ---------------------------------------------------------------------
say "4) 푸시 함수(send-push) 배포 + 비밀 값 등록"
# ---------------------------------------------------------------------
# 임시 폴더에서 배포 (저장소에 supabase/.temp 가 생기지 않게)
DEPLOY_DIR="$WORK/deploy"
mkdir -p "$DEPLOY_DIR/supabase/functions/send-push"
cp "$FN_SRC" "$DEPLOY_DIR/supabase/functions/send-push/index.ts"
sb functions deploy send-push --project-ref "$SB_REF" --workdir "$DEPLOY_DIR" --no-verify-jwt --use-api \
  || fail "함수 배포 실패. 액세스 토큰과 Project URL 을 확인해 주세요."

sb secrets set --project-ref "$SB_REF" \
  "PUSH_WEBHOOK_SECRET=$PUSH_SECRET" \
  "FCM_SERVICE_ACCOUNT=$(cat "$WORK/sa.b64")" >/dev/null \
  || fail "함수 비밀 값 등록 실패."
echo "  ✓ 배포·비밀 값 등록 완료"

# 동작 확인 (비밀 값이 함수에 반영되기까지 잠깐 걸릴 수 있음)
FN_URL="$SB_URL/functions/v1/send-push"
smoke() {
  curl -sS --max-time 30 -o "$WORK/smoke.out" -w '%{http_code}' -X POST "$FN_URL" \
    -H 'Content-Type: application/json' "$@" || true
}
ok=""
c="000"
for _ in $(seq 1 18); do
  c="$(smoke -H "x-sfa-push-secret: $PUSH_SECRET" -d '{}')"
  if [ "$c" = 400 ] && grep -q '"invalid_target"' "$WORK/smoke.out"; then ok=1; break; fi
  sleep 5
done
if [ -z "$ok" ]; then
  body="$(head -c 200 "$WORK/smoke.out" 2>/dev/null || true)"
  case "$c" in
    401) fail "함수 확인 실패 (HTTP 401). 함수의 JWT 확인이 켜져 있거나 비밀 값이 다릅니다: $body" ;;
    500) fail "함수 확인 실패 (HTTP 500). 비밀 값이 아직 반영되지 않았을 수 있습니다. 1분 뒤 다시 실행해 주세요: $body" ;;
    *) fail "함수 확인 실패 (HTTP $c): $body" ;;
  esac
fi
echo "  ✓ 함수 동작 확인 (JWT 확인 꺼짐, 비밀 값 일치)"

# ---------------------------------------------------------------------
say "5) DB 와 푸시 함수 연결"
# ---------------------------------------------------------------------
body="$(python3 -I -c 'import json,sys; print(json.dumps({"p_url": sys.argv[1]}))' "$FN_URL")"
code="$(rpc sfa_set_push_endpoint "$body")" || code="000"
[ "$code" = 200 ] || fail "연결 실패 (HTTP $code): $(head -c 200 "$WORK/rpc.out")"
echo "  ✓ 새 알림이 생기면 푸시 함수가 불리도록 연결 완료"

# ---------------------------------------------------------------------
say "6) GitHub Secret GOOGLE_SERVICES_JSON 등록"
# ---------------------------------------------------------------------
[ -s "$WORK/gs.json" ] || fail "google-services.json 정리본이 비어 있습니다."
gh_user secret set GOOGLE_SERVICES_JSON -R "$REPO" < "$WORK/gs.json" >/dev/null
echo "  ✓ 등록 완료 (안드로이드 앱에 푸시 기능이 들어갑니다)"

# ---------------------------------------------------------------------
say "7) 앱 설치 파일 저장소(app-releases) 확인"
# ---------------------------------------------------------------------
bc="$(curl -sS --max-time 30 -o "$WORK/bucket.out" -w '%{http_code}' "$SB_URL/storage/v1/bucket/app-releases" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" || true)"
if [ "$bc" = 200 ]; then
  echo "  ✓ app-releases 버킷 있음"
else
  echo "  app-releases 버킷이 없어 만듭니다..."
  cc="$(curl -sS --max-time 30 -o "$WORK/bucket.out" -w '%{http_code}' -X POST "$SB_URL/storage/v1/bucket" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" -H "Content-Type: application/json" \
    -d '{"id":"app-releases","name":"app-releases","public":false}' || true)"
  [ "${cc:0:1}" = 2 ] || fail "app-releases 버킷 만들기 실패 (HTTP $cc): $(head -c 200 "$WORK/bucket.out")"
  echo "  ✓ app-releases 버킷 만듦 (내려받기 권한 정책은 2026-10-10 SQL 에 들어 있습니다)"
fi

# ---------------------------------------------------------------------
say "8) 앱 빌드 시작 (안드로이드·윈도우, 끝나면 Supabase 에 자동 업로드)"
# ---------------------------------------------------------------------
for wf in app-android.yml app-windows.yml; do
  url="$(gh_user workflow run "$wf" -R "$REPO" --ref main -f upload=true 2>/dev/null)" || fail "$wf 빌드 시작 실패"
  if [ -z "$url" ]; then
    for _ in 1 2 3 4 5 6; do
      sleep 5
      url="$(gh_user run list -R "$REPO" -w "$wf" -e workflow_dispatch -b main -L 1 --json url -q '.[0].url' 2>/dev/null || true)"
      [ -n "$url" ] && break
    done
  fi
  echo "  $wf: ${url:-https://github.com/$REPO/actions/workflows/$wf}"
done

# 서비스 계정 키는 강력한 비밀 값이라 Codespace 에서 지움 (필요하면 Firebase 에서 언제든 새로 만들 수 있음)
rm -f "$SA_FILE"

say "[완료]"
echo "- 푸시 함수 배포·연결 완료, 안드로이드 앱에 푸시 기능 포함"
echo "- 앱 빌드는 5~10분 걸립니다. 끝나면 사이트 → 마이 프로필 → [앱 다운로드] 에서 받을 수 있습니다."
echo "- Codespace 에 올린 서비스 계정 키 파일은 지웠습니다. 휴대폰에 받은 키 파일도 지워 주세요."
