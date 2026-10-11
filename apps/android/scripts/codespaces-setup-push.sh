#!/usr/bin/env bash
# =====================================================================
#  앱 푸시 알림 준비 + 앱 빌드를 한 번에 (Codespaces 터미널용, 처음 한 번만. 다시 실행해도 안전)
#   1) Firebase 파일 2개 확인 (google-services.json, 서비스 계정 키 JSON)
#   2) Supabase 확인 (DB 업데이트 적용 여부, 앱 설치 파일 저장소 app-releases 와 내려받기 권한)
#   3) Supabase Edge Function send-push 배포 (JWT 확인 끔) + 비밀 값 2개 등록 → 동작 확인 → DB 와 연결
#   4) GitHub Secret GOOGLE_SERVICES_JSON 등록 (안드로이드 앱에 푸시 기능 넣기)
#   5) 안드로이드·윈도우 앱 빌드 시작 (끝나면 Supabase 비공개 버킷에 자동 업로드)
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
  if [ -n "$STTY_SAVED" ]; then stty "$STTY_SAVED" 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

say() { printf '\n==== %s\n' "$*"; }
fail() {
  printf '\n[중단] %s\n' "$*" >&2
  if [ -d "$KEY_DIR" ] && ls "$KEY_DIR"/*.json >/dev/null 2>&1; then
    printf '       (올린 Firebase 파일은 %s 에 남아 있어 다시 실행하면 그대로 씁니다. 이 폴더는 커밋되지 않습니다)\n' "apps/android/keystore" >&2
  fi
  exit 1
}

# Codespaces 의 기본 토큰(GITHUB_TOKEN)은 Secrets 등록·빌드 실행 권한이 없으므로 본인 로그인으로 gh 사용
gh_user() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }

# Supabase CLI: 버전 고정, 사람이 읽는 출력, 임시 폴더에서 실행(저장소에 supabase/.temp 가 생기지 않게),
# npm 로그 파일 남기지 않기(명령 인자에 비밀 값이 없더라도 흔적을 줄임)
SBWORK="$WORK/sbwork"
mkdir -p "$SBWORK/supabase/functions/send-push"
sb() {
  (cd "$SBWORK" && SUPABASE_WORKDIR="$SBWORK" npm_config_logs_max=0 npm_config_update_notifier=false \
    npx -y "supabase@${SUPABASE_CLI_VERSION}" "$@" --agent no)
}

# 비어 있으면 다시 묻는 입력 (q 입력 시 중단). $1 = 안내 문구, $2 = -s 면 화면에 안 보이게
ask() {
  local prompt="$1" secret="${2:-}" value=""
  while :; do
    if [ "$secret" = "-s" ]; then
      read -r -s -p "$prompt" value || true
      echo >&2
    else
      read -r -p "$prompt" value || true
    fi
    value="$(printf '%s' "$value" | tr -d '[:space:]')"
    [ "$value" = "q" ] && fail "사용자가 중단했습니다."
    [ -n "$value" ] && break
    echo "  (비어 있습니다. 다시 붙여넣어 주세요. 그만두려면 q)" >&2
  done
  printf '%s' "$value"
}

[ -f "$FN_SRC" ] || fail "supabase/functions/send-push/index.ts 가 없습니다. 저장소 폴더(main 브랜치, 사이트 배포 후)에서 실행해 주세요."
for cmd in gh node npx python3 curl git stty; do
  command -v "$cmd" >/dev/null || fail "$cmd 명령이 없습니다. Codespaces 에서 실행해 주세요."
done
cp "$FN_SRC" "$SBWORK/supabase/functions/send-push/index.ts"

# ---------------------------------------------------------------------
say "1) GitHub 로그인 확인"
# ---------------------------------------------------------------------
if ! gh_user auth status -h github.com >/dev/null 2>&1; then
  echo "아래 8자리 코드를 휴대폰 브라우저에서 https://github.com/login/device 에 입력하고 승인하세요."
  echo "(브라우저를 열 수 없다는 메시지가 나와도 괜찮습니다)"
  gh_user auth login -h github.com -p https -w -s repo
fi
existing="$(gh_user secret list -R "$REPO" --json name -q '.[].name' 2>"$WORK/gh.err")" \
  || fail "GitHub Secrets 목록을 읽지 못했습니다: $(head -c 300 "$WORK/gh.err")"
missing=""
for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  grep -qx "$name" <<<"$existing" || missing="$missing $name"
done
[ -z "$missing" ] || fail "GitHub Secrets 가 빠져 있습니다:$missing (서명 키 준비 단계부터 다시 해야 합니다. 서명 키를 새로 만들기 전에 꼭 물어봐 주세요)"
echo "  ✓ GitHub 로그인·기존 Secrets 6개 확인"

# ---------------------------------------------------------------------
say "2) Firebase 파일 2개 확인"
# ---------------------------------------------------------------------
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR" 2>/dev/null || true

# 저장소 안의 JSON 파일을 내용으로 구분해 고름 (파일 이름 상관없음)
# - google-services.json 은 패키지 com.sfaclan.community 가 들어 있는 것만
# - 서비스 계정 키와 google-services.json 의 Firebase 프로젝트가 같은 짝 중 가장 최근에 올린 것
scan_files() {
  find "$ROOT" -maxdepth 5 -type f -name '*.json' \
    -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -path '*/target/*' \
    -not -path '*/src/main/*' -size -64k -print0 2>/dev/null |
  node -e '
    const fs = require("fs")
    const appId = process.argv[1]
    const files = fs.readFileSync(0, "utf8").split("\0").filter(Boolean)
    const gs = [], sa = []
    for (const f of files) {
      let o
      try { o = JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")) } catch { continue }
      if (!o || typeof o !== "object") continue
      const m = fs.statSync(f).mtimeMs
      if (o.type === "service_account" && o.private_key) sa.push({ f, pid: String(o.project_id || ""), m })
      else if (o.project_info && Array.isArray(o.client)) {
        const ok = o.client.some((c) => c?.client_info?.android_client_info?.package_name === appId)
        gs.push({ f, pid: String(o.project_info.project_id || ""), m, ok })
      }
    }
    let best = null
    for (const g of gs.filter((x) => x.ok && x.pid))
      for (const s of sa.filter((x) => x.pid === g.pid)) {
        const score = Math.max(g.m, s.m)
        if (!best || score > best.score) best = { g, s, score }
      }
    const notes = []
    if (!gs.length) notes.push("✗ google-services.json 없음")
    else if (!gs.some((x) => x.ok)) notes.push("✗ google-services.json 에 패키지 " + appId + " 앱이 없음 → Firebase 에서 Android 앱을 이 패키지 이름으로 추가했는지 확인 (" + gs.map((x) => x.f).join(", ") + ")")
    if (!sa.length) notes.push("✗ 서비스 계정 키(...firebase-adminsdk...json) 없음")
    if (!best && gs.some((x) => x.ok) && sa.length)
      notes.push("✗ 두 파일의 Firebase 프로젝트가 다름 → 같은 프로젝트에서 받은 파일인지 확인 (google-services: " + [...new Set(gs.filter((x) => x.ok).map((x) => x.pid))].join(", ") + " / 서비스 계정: " + [...new Set(sa.map((x) => x.pid))].join(", ") + ")")
    // 1줄: 고른 google-services, 2줄: 고른 서비스 계정, 3줄: 찾은 모든 서비스 계정(탭 구분), 4줄: 모든 google-services(탭 구분), 이후: 안내
    console.log(best ? best.g.f : "")
    console.log(best ? best.s.f : "")
    console.log(sa.map((x) => x.f).join("\t"))
    console.log(gs.map((x) => x.f).join("\t"))
    for (const n of notes) console.log(n)
  ' "$APP_ID"
}

# 붙여넣은 JSON 읽기
# - 줄 길이 제한(4095자)을 피하려고 바이트 단위로 읽고, 중괄호가 닫히면 Enter 없이 자동으로 끝
# - { 앞의 다른 글(실수로 붙여넣은 명령어 등)은 무시, 내용이 JSON 이 아니면 실패로 돌아감
# - { 를 붙여넣기 전에 q 와 Enter 를 누르면 취소
# $1 = 저장할 파일, $2 = hide 면 화면에 안 보이게 (서비스 계정 키)
read_json_paste() {
  local out="$1" hide="${2:-}" rc=0
  if [ -t 0 ]; then
    STTY_SAVED="$(stty -g)"
    if [ "$hide" = "hide" ]; then stty -icanon -echo min 1 time 0; else stty -icanon min 1 time 0; fi
  fi
  python3 -I -c '
import codecs, json, os, select, sys
out = sys.argv[1]
dec = codecs.getincrementaldecoder("utf-8")("replace")
started = False; depth = 0; in_str = False; esc = False; buf = []; line = ""
while True:
    chunk = os.read(0, 65536)
    if not chunk:
        sys.exit(1)
    for ch in dec.decode(chunk):
        if not started:
            if ch == "{":
                started = True; depth = 1; buf = ["{"]
            elif ch in "\r\n":
                if line.strip().lower() == "q":
                    sys.exit(2)
                line = ""
            else:
                line += ch
            continue
        buf.append(ch)
        if in_str:
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == "\"": in_str = False
            continue
        if ch == "\"": in_str = True
        elif ch == "{": depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                text = "".join(buf)
                try:
                    json.loads(text)
                except ValueError:
                    sys.exit(3)
                # 붙여넣기 끝에 딸려 온 줄바꿈·Enter 는 버림 (다음 질문에 빈 값으로 들어가지 않게)
                while select.select([0], [], [], 0.5)[0]:
                    if not os.read(0, 65536):
                        break
                fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as f:
                    f.write(text + "\n")
                sys.exit(0)
' "$out" || rc=$?
  if [ -n "$STTY_SAVED" ]; then stty "$STTY_SAVED"; STTY_SAVED=""; fi
  echo
  return $rc
}

paste_one() { # $1 = 이름, $2 = 저장 파일, $3 = hide
  local rc=0
  if [ "${3:-}" = "hide" ]; then
    echo "$1 내용을 통째로 붙여넣으세요. (비밀 값이라 화면에 보이지 않습니다. 붙여넣으면 자동으로 다음으로 넘어갑니다. 취소: q 입력 후 Enter)"
  else
    echo "$1 내용을 통째로 붙여넣으세요. (붙여넣으면 자동으로 다음으로 넘어갑니다. 취소: q 입력 후 Enter)"
  fi
  read_json_paste "$2" "${3:-}" || rc=$?
  case "$rc" in
    0) echo "  ✓ $1 받음" ;;
    2) echo "  취소했습니다." ;;
    *) echo "  ✗ 붙여넣은 내용이 올바른 JSON 이 아닙니다. 파일 내용 전체를 다시 복사해 주세요." ;;
  esac
}

GS_FILE=""
SA_FILE=""
ALL_SA=""
while :; do
  mapfile -t scan < <(scan_files)
  GS_FILE="${scan[0]:-}"
  SA_FILE="${scan[1]:-}"
  ALL_SA="${scan[2]:-}"
  if [ -n "$GS_FILE" ] && [ -n "$SA_FILE" ]; then break; fi
  echo
  for ((i = 4; i < ${#scan[@]}; i++)); do echo "  ${scan[$i]}"; done
  echo
  echo "방법 1) Codespaces 왼쪽 파일 목록에서 apps → android → keystore 폴더를 길게 누르거나 오른쪽 클릭 → Upload..."
  echo "        → 휴대폰에 받은 파일을 골라 올린 뒤, 여기서 그냥 Enter"
  echo "방법 2) p 입력 후 Enter → 파일 내용을 복사해 붙여넣기"
  read -r -p "선택 (Enter = 다시 찾기, p = 붙여넣기, q = 그만): " choice || choice="q"
  case "$choice" in
    q|Q) fail "사용자가 중단했습니다." ;;
    p|P)
      paste_one "google-services.json" "$KEY_DIR/google-services.json"
      paste_one "서비스 계정 키 JSON" "$KEY_DIR/firebase-service-account.json" hide
      ;;
  esac
done
echo "  사용할 파일: ${GS_FILE#"$ROOT"/}"
echo "               ${SA_FILE#"$ROOT"/}"

# 저장소에 올린 Firebase 파일이 커밋되지 않는 곳에 있지 않으면 keystore 폴더(커밋 제외)로 옮김
safe_place() { # $1 = 파일 → 옮긴 경로 출력
  local f="$1" dest
  if git -C "$ROOT" check-ignore -q -- "$f" 2>/dev/null; then printf '%s' "$f"; return; fi
  dest="$KEY_DIR/$(basename "$f")"
  [ -e "$dest" ] && dest="$KEY_DIR/$(date +%s)-$(basename "$f")"
  mv "$f" "$dest"
  printf '%s' "$dest"
}
GS_FILE="$(safe_place "$GS_FILE")"
SA_FILE="$(safe_place "$SA_FILE")"
chmod 600 "$SA_FILE" 2>/dev/null || true

# 내용 확인 + 정리 (앱 빌드의 확인 방식과 같게)
node - "$GS_FILE" "$SA_FILE" "$WORK" "$APP_ID" <<'EOF' || fail "Firebase 파일 확인 실패 (위 메시지 참고. 잘못된 파일은 apps/android/keystore 에서 지우고 다시 실행)"
const fs = require('fs')
const crypto = require('crypto')
const [gsPath, saPath, outDir, appId] = process.argv.slice(2)
const die = (m) => { console.error('  ✗ ' + m); process.exit(1) }
const load = (p, label) => {
  let t = ''
  try { t = fs.readFileSync(p, 'utf8') } catch { die(label + ' 을 읽을 수 없습니다.') }
  t = t.replace(/^﻿/, '').trim()
  try { return JSON.parse(t) } catch { die(label + ' 이 올바른 JSON 이 아닙니다.') }
}
const gs = load(gsPath, 'google-services.json')
const sa = load(saPath, '서비스 계정 키')
const pid = gs?.project_info?.project_id
if (!(Array.isArray(gs.client) && gs.client.some((c) => c?.client_info?.android_client_info?.package_name === appId)))
  die(`google-services.json 에 패키지 ${appId} 앱이 없습니다.`)
for (const k of ['project_id', 'client_email', 'private_key'])
  if (typeof sa[k] !== 'string' || !sa[k].trim()) die('서비스 계정 키에 ' + k + ' 가 없습니다. 파일을 다시 받아 주세요.')
try { crypto.createPrivateKey(sa.private_key.replace(/\\n/g, '\n')) } catch { die('서비스 계정 키의 private_key 를 읽을 수 없습니다. 파일을 다시 받아 주세요.') }
if (sa.project_id !== pid) die(`두 파일의 Firebase 프로젝트가 다릅니다 (${pid} / ${sa.project_id}).`)
fs.writeFileSync(outDir + '/gs.json', JSON.stringify(gs, null, 2) + '\n', { mode: 0o600 })
fs.writeFileSync(outDir + '/sa.b64', Buffer.from(JSON.stringify(sa)).toString('base64'), { mode: 0o600 })
console.log('  ✓ Firebase 프로젝트: ' + pid)
EOF

# ---------------------------------------------------------------------
say "3) Supabase 정보 입력"
# ---------------------------------------------------------------------
echo "Project URL: Supabase → Project Settings → Data API(또는 API) 의 Project URL"
while :; do
  SB_URL="$(ask "Project URL (https://xxxx.supabase.co): ")"
  SB_URL="${SB_URL%/}"
  if [[ "$SB_URL" =~ ^https://([a-z]{20})\.supabase\.co$ ]]; then SB_REF="${BASH_REMATCH[1]}"; break; fi
  echo "  ✗ 형식이 아닙니다: $SB_URL (예: https://abcdefghijklmnopqrst.supabase.co)"
done

echo
echo "액세스 토큰: 휴대폰 브라우저에서 https://supabase.com/dashboard/account/tokens 열기"
echo "  → Generate new token → 이름 아무거나(예: codespaces) → 만들어진 sbp_ 로 시작하는 값 복사"
while :; do
  SUPABASE_ACCESS_TOKEN="$(ask "액세스 토큰 붙여넣기 (화면에 안 보입니다): " -s)"
  [[ "$SUPABASE_ACCESS_TOKEN" =~ ^sbp_(oauth_|v0_)?[a-f0-9]{40}$ ]] && break
  echo "  ✗ sbp_ 로 시작하는 액세스 토큰이 아닙니다. 다시 복사해 주세요."
done
export SUPABASE_ACCESS_TOKEN

echo "Supabase 도구 준비 중... (처음 한 번 1분 정도)"
sb --version >/dev/null 2>"$WORK/sb.err" || fail "Supabase CLI 를 준비하지 못했습니다: $(tail -c 300 "$WORK/sb.err")"

# service_role 키: 토큰으로 자동으로 가져오고, 안 되면 붙여넣기
SB_KEY=""
if sb projects api-keys --project-ref "$SB_REF" --reveal -o json >"$WORK/keys.json" 2>"$WORK/sb.err"; then
  SB_KEY="$(python3 -I -c '
import json, sys
try:
    keys = json.load(open(sys.argv[1]))
except Exception:
    keys = []
print(next((k.get("api_key") or "" for k in keys if isinstance(k, dict) and k.get("name") == "service_role"), ""))' "$WORK/keys.json")"
else
  if grep -qiE '401|403|unauthori|forbidden|invalid.*token' "$WORK/sb.err"; then
    fail "액세스 토큰 또는 Project URL 이 맞지 않습니다: $(tail -c 300 "$WORK/sb.err")"
  fi
  echo "  (자동으로 가져오기 실패: $(tail -c 200 "$WORK/sb.err" | tr '\n' ' '))"
fi
rm -f "$WORK/keys.json"
check_key() {
  python3 -I - "$1" "$SB_REF" <<'EOF'
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
EOF
}
if [[ "$SB_KEY" != eyJ* ]] || ! check_key "$SB_KEY" 2>/dev/null; then
  echo "service_role 키를 자동으로 가져오지 못했습니다."
  echo "Supabase → Project Settings → API Keys → Legacy API Keys → service_role (secret) → Reveal → Copy"
  while :; do
    SB_KEY="$(ask "service_role 키 붙여넣기 (화면에 안 보입니다): " -s)"
    check_key "$SB_KEY" && break
  done
fi
echo "  ✓ service_role 키 확인"

rpc() { # $1 = 함수 이름, $2 = JSON 본문 → HTTP 코드 출력, 본문은 $WORK/rpc.out
  rm -f "$WORK/rpc.out"
  curl -sS --max-time 30 -o "$WORK/rpc.out" -w '%{http_code}' -X POST "$SB_URL/rest/v1/rpc/$1" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" -H "Accept: application/json" -d "$2" 2>"$WORK/curl.err" || true
}
rpc_detail() { if [ -s "$WORK/rpc.out" ]; then head -c 200 "$WORK/rpc.out"; else head -c 200 "$WORK/curl.err"; fi; }

code="$(rpc sfa_get_push_secret '{}')"
case "$code" in
  200) ;;
  404) fail "DB 업데이트가 적용되지 않았습니다 (sfa_get_push_secret 없음). supabase/sfaclan_update_2026-10-10_app.sql 을 SQL Editor 에서 다시 실행해 주세요." ;;
  *) fail "푸시 비밀 값 조회 실패 (HTTP $code): $(rpc_detail)" ;;
esac
PUSH_SECRET="$(python3 -I -c 'import json,sys; v=json.load(open(sys.argv[1])); print(v if isinstance(v,str) else "")' "$WORK/rpc.out")"
rm -f "$WORK/rpc.out"
[ -n "$PUSH_SECRET" ] || fail "푸시 비밀 값이 비어 있습니다. 2026-10-10 SQL 을 다시 실행해 주세요."
echo "  ✓ DB 업데이트 확인"

# ---------------------------------------------------------------------
say "4) 앱 설치 파일 저장소(app-releases)와 내려받기 권한 확인"
# ---------------------------------------------------------------------
TODO_AFTER=""
bc="$(curl -sS --max-time 30 -o "$WORK/bucket.out" -w '%{http_code}' "$SB_URL/storage/v1/bucket/app-releases" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" 2>/dev/null || true)"
if [ "$bc" = 200 ]; then
  echo "  ✓ app-releases 버킷 있음"
else
  cc="$(curl -sS --max-time 30 -o "$WORK/bucket.out" -w '%{http_code}' -X POST "$SB_URL/storage/v1/bucket" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" -H "Content-Type: application/json" \
    -d '{"id":"app-releases","name":"app-releases","public":false}' 2>/dev/null || true)"
  [ "${cc:0:1}" = 2 ] || fail "app-releases 버킷 만들기 실패 (HTTP $cc): $(head -c 200 "$WORK/bucket.out")"
  echo "  ✓ app-releases 버킷 만듦 (비공개)"
fi

# 내려받기 권한(제작자·최고관리자만 읽기) 정책: Supabase 관리 API 로 확인하고 없으면 만듦
POLICY_SQL="drop policy if exists sfa_app_releases_senior_read on storage.objects; create policy sfa_app_releases_senior_read on storage.objects for select to authenticated using (bucket_id = 'app-releases' and (select public.sfa_is_senior_admin()));"
mq() { # $1 = SQL → HTTP 코드 출력, 결과는 $WORK/mq.out
  local body
  body="$(python3 -I -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1")"
  curl -sS --max-time 60 -o "$WORK/mq.out" -w '%{http_code}' -X POST \
    "https://api.supabase.com/v1/projects/$SB_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d "$body" 2>/dev/null || true
}
qc="$(mq "select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sfa_app_releases_senior_read'")"
has_policy="$(python3 -I -c '
import json, sys
try:
    rows = json.load(open(sys.argv[1]))
    print("yes" if rows and int(rows[0].get("n", 0)) > 0 else "no")
except Exception:
    print("unknown")' "$WORK/mq.out" 2>/dev/null || echo unknown)"
if [ "${qc:0:1}" = 2 ] && [ "$has_policy" = yes ]; then
  echo "  ✓ 내려받기 권한 정책 있음"
else
  pc="$(mq "$POLICY_SQL")"
  if [ "${pc:0:1}" = 2 ]; then
    echo "  ✓ 내려받기 권한 정책 만듦"
  else
    echo "  ! 내려받기 권한 정책을 자동으로 만들지 못했습니다 (HTTP $pc). 끝난 뒤 안내를 따라 SQL 한 줄을 실행해 주세요."
    TODO_AFTER="$POLICY_SQL"
  fi
fi

# ---------------------------------------------------------------------
say "5) 푸시 함수(send-push) 배포 + 비밀 값 등록"
# ---------------------------------------------------------------------
sb functions deploy send-push --project-ref "$SB_REF" --workdir "$SBWORK" --no-verify-jwt --use-api \
  || fail "함수 배포 실패. 액세스 토큰과 Project URL 을 확인해 주세요."

# 비밀 값은 명령 인자 대신 임시 파일로 전달 (한 줄짜리 값만 사용: 16진수, base64)
(umask 077 && printf 'PUSH_WEBHOOK_SECRET=%s\nFCM_SERVICE_ACCOUNT=%s\n' "$PUSH_SECRET" "$(cat "$WORK/sa.b64")" > "$WORK/fn.env")
sb secrets set --project-ref "$SB_REF" --env-file "$WORK/fn.env" >/dev/null || fail "함수 비밀 값 등록 실패."
rm -f "$WORK/fn.env"
echo "  ✓ 배포·비밀 값 등록 완료"

# 동작 확인 (비밀 값이 함수에 반영되기까지 잠깐 걸릴 수 있음)
FN_URL="$SB_URL/functions/v1/send-push"
smoke() {
  rm -f "$WORK/smoke.out"
  curl -sS --max-time 30 -o "$WORK/smoke.out" -w '%{http_code}' -X POST "$FN_URL" \
    -H 'Content-Type: application/json' "$@" 2>/dev/null || true
}
ok=""
c="000"
echo "  함수 동작 확인 중... (최대 1분 30초)"
for _ in $(seq 1 18); do
  c="$(smoke -H "x-sfa-push-secret: $PUSH_SECRET" -d '{}')"
  if [ "$c" = 400 ] && grep -q '"invalid_target"' "$WORK/smoke.out" 2>/dev/null; then ok=1; break; fi
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

# DB 의 새 알림 → 푸시 함수 연결 (함수 확인이 끝난 뒤에)
body="$(python3 -I -c 'import json,sys; print(json.dumps({"p_url": sys.argv[1]}))' "$FN_URL")"
code="$(rpc sfa_set_push_endpoint "$body")"
[ "$code" = 200 ] || fail "DB 와 푸시 함수 연결 실패 (HTTP $code): $(rpc_detail)"
rm -f "$WORK/rpc.out"
echo "  ✓ 새 알림이 생기면 푸시가 나가도록 연결 완료"

# ---------------------------------------------------------------------
say "6) GitHub Secret GOOGLE_SERVICES_JSON 등록"
# ---------------------------------------------------------------------
[ -s "$WORK/gs.json" ] || fail "google-services.json 정리본이 비어 있습니다."
gh_user secret set GOOGLE_SERVICES_JSON -R "$REPO" < "$WORK/gs.json" >/dev/null 2>"$WORK/gh.err" \
  || fail "GOOGLE_SERVICES_JSON 등록 실패: $(head -c 300 "$WORK/gh.err")"
echo "  ✓ 등록 완료 (안드로이드 앱에 푸시 기능이 들어갑니다)"

# ---------------------------------------------------------------------
say "7) 앱 빌드 시작 (안드로이드·윈도우, 끝나면 Supabase 에 자동 업로드)"
# ---------------------------------------------------------------------
for wf in app-android.yml app-windows.yml; do
  url="$(gh_user workflow run "$wf" -R "$REPO" --ref main -f upload=true 2>"$WORK/gh.err")" \
    || fail "$wf 빌드 시작 실패: $(head -c 300 "$WORK/gh.err")"
  if [ -z "$url" ]; then
    for _ in 1 2 3 4 5 6; do
      sleep 5
      url="$(gh_user run list -R "$REPO" -w "$wf" -e workflow_dispatch -b main -L 1 --json url -q '.[0].url' 2>/dev/null || true)"
      [ -n "$url" ] && break
    done
  fi
  echo "  $wf: ${url:-https://github.com/$REPO/actions/workflows/$wf}"
done

# 서비스 계정 키는 강력한 비밀 값이라 Codespace 에서 모두 지움 (필요하면 Firebase 에서 언제든 새로 만들 수 있음)
IFS=$'\t' read -r -a sa_list <<<"$ALL_SA"
for f in "${sa_list[@]}" "$SA_FILE"; do
  [ -n "$f" ] && rm -f -- "$f"
done

say "[완료]"
echo "- 푸시 함수 배포·연결 완료, 안드로이드 앱에 푸시 기능 포함"
echo "- 앱 빌드는 5~10분 걸립니다. 끝나면 사이트 → 마이 프로필 → [앱 다운로드] 에서 받을 수 있습니다."
echo "- Codespace 에 올린 서비스 계정 키 파일은 모두 지웠습니다. 휴대폰에 받은 키 파일도 지워 주세요."
if [ -n "$TODO_AFTER" ]; then
  echo
  echo "※ 남은 일 1개: Supabase → SQL Editor 에 아래 한 줄을 붙여넣고 Run (앱 다운로드 권한)"
  echo "$TODO_AFTER"
fi
