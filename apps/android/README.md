# 스틱파이터 커뮤니티 — 안드로이드 앱 (APK)

실서버 **https://www.sfaclan.com** 을 그대로 띄우는 안드로이드 앱 껍데기입니다. (Capacitor 8)
사이트를 배포하면 앱 화면도 자동으로 최신이 됩니다. 아이콘·딥링크·플러그인을 바꿀 때만 앱을 다시 빌드합니다.

- 패키지 ID: `com.sfaclan.community` / 앱 이름: 스틱파이터 커뮤니티 / 버전: `package.json` 의 `version`
- 앱 전용 주소: `sfaclan://` (구글 로그인은 기기 기본 브라우저에서 → `sfaclan://auth-callback` 으로 복귀)
- 사이트가 앱을 알아보는 표시: User-Agent 끝에 `SFAClanApp/<버전> (android)` (+ Firebase 포함 빌드면 ` SFAClanPush/1`)
- 인터넷이 끊기면 앱에 들어 있는 `www/offline.html` (다시 시도 버튼)

## 폴더

| 경로 | 내용 |
|---|---|
| `capacitor.config.ts` | 앱 설정 (불러올 주소, User-Agent, 시작 화면, 알림 아이콘 등) |
| `www/` | 앱에 들어가는 파일 (자리표시 `index.html`, 연결 실패 화면 `offline.html`) |
| `android/` | 안드로이드 프로젝트. `MainActivity.java` 가 상태바·내비게이션바 여백과 색을 처리 |
| `scripts/make_icons.py` | 아이콘·시작 화면 이미지 만들기 (`apps/assets` 원본 → `res/`) |
| `scripts/make-keystore.mjs` | 서명 키 만들기 (내 PC 에서 한 번) |

## 빌드 (GitHub Actions)

`.github/workflows/app-android.yml` — **앱 빌드 (안드로이드)**

- **push** (`apps/android/**` 가 바뀌면): 확인용 빌드만 합니다. 서명·업로드 없음.
- **수동 실행** (GitHub → Actions → 앱 빌드 (안드로이드) → Run workflow): 서명된 APK 를 만들어
  Supabase 비공개 버킷 `app-releases` 의 `android/sfaclan.apk`, `android/latest.json` 으로 올립니다.
  사이트 → 마이 프로필 → **[앱 다운로드]** 에서 제작자·최고관리자만 받을 수 있습니다.
- 공개 저장소이므로 APK 를 Actions 산출물로 남기지 않고, 로그에 비밀 값·주소를 출력하지 않습니다.
- 빌드 번호(versionCode)는 Actions 실행 번호입니다. 안드로이드는 번호가 더 큰 APK 만 업데이트로 설치합니다.

### GitHub Secrets (Settings → Secrets and variables → Actions)

| 이름 | 필요할 때 | 값 |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | 수동 실행 | 서명 키 파일(base64) — `make-keystore.mjs` 가 만들어 줌 |
| `ANDROID_KEYSTORE_PASSWORD` | 수동 실행 | 서명 키 비밀번호 |
| `ANDROID_KEY_ALIAS` | 수동 실행 | `sfaclan` |
| `ANDROID_KEY_PASSWORD` | 수동 실행 | 서명 키 비밀번호 (위와 같음) |
| `SUPABASE_URL` | 업로드 | `https://<프로젝트>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 업로드 | Supabase → Project Settings → API 의 service_role 키 |
| `GOOGLE_SERVICES_JSON` | 선택 (푸시) | Firebase 의 `google-services.json` 파일 내용 전체 |

## 서명 키 만들기 (처음 한 번)

```bash
cd apps/android
npm install
npm run keystore        # = node scripts/make-keystore.mjs
```

1. `apps/android/keystore/sfaclan-release.p12` (키 파일)와 `github-secrets.txt` (등록할 값)가 만들어집니다.
2. **키 파일과 비밀번호를 두 곳 이상에 백업하세요.** 잃어버리면 이미 설치된 앱을 업데이트할 수 없습니다(지우고 새로 설치해야 함).
3. `github-secrets.txt` 의 4개 값을 GitHub Secrets 에 등록한 뒤 `github-secrets.txt` 는 지웁니다.
4. `keystore/` 폴더는 커밋되지 않게 막혀 있습니다. `git add -f` 로 억지로 넣지 마세요.

## 푸시 알림 (Firebase, 선택)

Firebase 가 없으면 앱이 열려 있는 동안에만 알림이 옵니다. (뒤로 보낸 상태에서는 기기 절전 정책에 따라 늦거나 안 올 수 있음)
앱이 꺼져 있을 때도 받으려면:

1. https://console.firebase.google.com → 프로젝트 만들기 (무료, 애널리틱스 꺼도 됨)
2. 프로젝트 설정 → 내 앱 → **Android 앱 추가** → 패키지 이름 `com.sfaclan.community` → `google-services.json` 다운로드
3. GitHub Secret `GOOGLE_SERVICES_JSON` 에 그 파일 내용 전체를 붙여 넣기 → 앱을 다시 빌드(수동 실행)해서 새 APK 설치
4. 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → 받은 JSON 을 Supabase Edge Function `send-push` 의
   Secret `FCM_SERVICE_ACCOUNT` 로 등록 (자세한 순서는 `supabase/functions/send-push` 안내 참고)

## 아이콘·시작 화면 다시 만들기

로고를 바꿀 때만: `python3 apps/assets/make_base_icons.py` → `python3 apps/android/scripts/make_icons.py` (Pillow 필요).
알림 작은 아이콘은 `android/app/src/main/res/drawable/ic_stat_notify.xml` (흰색 종 벡터)입니다.

## 내 PC 에서 직접 빌드 (선택)

Node.js 22+, JDK 21, Android SDK(Android Studio)가 필요합니다.

```bash
cd apps/android
npm install
npx cap sync android
cd android && ./gradlew assembleDebug     # 결과: android/app/build/outputs/apk/debug/app-debug.apk
```
