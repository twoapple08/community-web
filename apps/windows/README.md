# 스틱파이터 커뮤니티 윈도우 앱 (apps/windows)

Tauri v2 로 만든 윈도우 앱 껍데기입니다. 앱 창은 실서버 **https://www.sfaclan.com** 을 그대로 불러오므로
사이트를 배포하면 앱 화면도 바로 최신이 됩니다. 앱(설치 파일)을 다시 만들어야 하는 경우는 아이콘·딥링크·알림·창 동작 같은
**이 폴더의 내용이 바뀔 때뿐**입니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `dist/index.html` | 앱이 처음 여는 페이지. 바로 사이트로 이동하고, 인터넷이 끊기면 [다시 시도] 화면을 보여 줌 |
| `src-tauri/tauri.conf.json` | 앱 이름·ID(`com.sfaclan.community`)·버전, 설치 프로그램(NSIS, 한국어, 관리자 권한 없이 사용자 폴더에 설치), 딥링크 `sfaclan://` |
| `src-tauri/capabilities/main.json` | 사이트(https://www.sfaclan.com, https://sfaclan.com)가 메인 창에서 쓸 수 있는 권한 (이벤트 듣기 + `sfa_*` 명령만) |
| `src-tauri/build.rs` | 앱 명령 목록 (명령을 추가하면 여기와 `capabilities/main.json`, `src/lib.rs` 를 함께 고침) |
| `src-tauri/src/lib.rs` | 창·트레이·딥링크·창 닫기·사이트 명령 |
| `src-tauri/src/notify.rs` | 윈도우 알림(오른쪽 아래 토스트) |
| `src-tauri/icons/` | 아이콘 (`apps/assets/icon-1024.png` 에서 `npx tauri icon ../assets/icon-1024.png` 로 생성) |

## 사이트와의 약속 (사이트 쪽: `src/lib/appBridge.ts`, `src/lib/appNotify.ts`)

- 페이지 스크립트보다 먼저 `window.__SFACLAN_APP__ = { platform: 'windows', version }` 을 넣음 (User-Agent 는 그대로)
- 명령: `sfa_open_external {url}`, `sfa_notify {title, body, data}`, `sfa_get_close_behavior`, `sfa_set_close_behavior {behavior}`,
  `sfa_close_decision {action, remember}`, `sfa_app_ready`, `sfa_take_pending` → `{ deepLink, notification }`
- 이벤트(앱 → 사이트): `sfa:deep-link`, `sfa:notification-click`, `sfa:close-requested`
- 다른 사이트 주소(구글 로그인 포함)는 앱 창에서 열지 않고 기본 브라우저로 엶. 같은 사이트를 새 창으로 열면 앱 안 보조 창(권한 없음)
- 창 닫기(X): 묻기(기본, 사이트 팝업) / 종료 / 트레이로 숨기기. 설정은 `%APPDATA%\com.sfaclan.community\settings.json`
- 트레이 아이콘: 왼쪽 클릭 = 창 열기, 오른쪽 클릭 메뉴 [열기, 종료]. "종료"는 항상 완전히 종료
- 창 크기·위치·최대화는 다음 실행 때 복원 (최소 360×560)

## 빌드 (GitHub Actions)

`.github/workflows/app-windows.yml` (**앱 빌드 (윈도우)**)

- 이 폴더나 워크플로 파일을 push 하면: 확인용 빌드만 합니다 (업로드 없음).
- **Actions → 앱 빌드 (윈도우) → Run workflow**: 설치 파일을 만들어 Supabase 비공개 버킷 `app-releases` 의
  `windows/sfaclan-setup.exe`, `windows/latest.json` 으로 올립니다. 사이트의 마이 프로필 → [앱 다운로드] 에서 제작자·최고관리자만 받을 수 있습니다.
- 필요한 GitHub Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- 저장소가 공개이므로 설치 파일을 Actions 산출물로 남기지 않습니다.

버전을 올릴 때는 `src-tauri/tauri.conf.json` 의 `version` 을 바꿉니다 (`src-tauri/Cargo.toml`, `package.json` 의 version 도 같이 맞춰 두기).

## 설치

- 코드 서명을 하지 않아서 처음 실행할 때 SmartScreen 경고가 뜹니다 → **추가 정보 → 실행**.
- 관리자 권한 없이 `%LOCALAPPDATA%\스틱파이터 커뮤니티` 에 설치되고 시작 메뉴에 바로가기가 생깁니다. (바탕 화면 바로가기는 설치 마지막 화면에서 선택)
- WebView2 가 없는 PC(오래된 윈도우 10)는 설치 중에 자동으로 받아 설치합니다 (인터넷 필요).

## 내 PC 에서 실행해 보기 (선택)

윈도우 PC 에 Node.js 와 Rust(https://rustup.rs) 가 있어야 합니다.

```bash
cd apps/windows
npm ci
npx tauri dev      # 개발용 실행
npx tauri build    # 설치 파일: src-tauri/target/release/bundle/nsis/
```

- 개발용 실행은 설치된 앱이 아니어서 알림 출처가 "Windows PowerShell" 로 표시됩니다 (설치본은 앱 이름으로 표시).
- 개발용 실행은 `sfaclan://` 연결(로그인 후 돌아오는 주소)을 개발용 실행 파일로 바꿔 등록합니다. 설치본을 한 번 실행하면 다시 설치본으로 등록됩니다.
