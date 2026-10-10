# SFAClan 앱(APK / EXE) + 앱 알림 인수인계 (2026-10-10 기준)

> 사용법: 새 AI 세션에 "저장소의 HANDOVER.md 와 HANDOVER_APP.md 를 먼저 읽어줘" 라고 요청.
> HANDOVER.md 의 "0. AI 작업 규칙"을 그대로 따른다. (답변은 한국어, 배포는 사용자가 직접, 작업 브랜치에 커밋·푸시까지만,
> 사용자가 할 일은 모든 작업이 끝난 뒤 한 번에 순서대로 안내, 브라우저 기본 팝업 금지 등)

작업 브랜치: **ccr-d081b1c2-9mjot4** (claude/charming-ptolemy-oe6qxa 위에서 이어 작업).
배포 스크립트 deploy_sfaclan_update.sh 의 BRANCH 기본값도 이 브랜치로 바꿔 두었다.

**현재 상태: 코드·CI 완성, 사용자 설정과 실기기 확인만 남음.**
- 사이트: 타입 검사·린트(새 오류 없음)·프로덕션 빌드 통과, 가짜 Supabase/가짜 앱 환경으로 화면 확인 완료.
- GitHub Actions: 안드로이드 APK 빌드, 윈도우 NSIS 설치 프로그램 빌드 모두 성공 (push 확인용 빌드, 서명·업로드 없음).
- DB SQL: 로컬 PostgreSQL 16 에 Supabase 비슷한 환경을 만들어 2번 연속 실행·동작 시험 완료. 실제 Supabase 에서는 아직 실행 안 함.
- 실기기(휴대폰·윈도우 PC)에서는 아직 한 번도 실행해 보지 않음.

---

## 1. 사용자 결정 사항 (확정)

- 앱 이름 **스틱파이터 커뮤니티**, 패키지 ID **com.sfaclan.community**, 앱 주소 **sfaclan://** (로그인 복귀 sfaclan://auth-callback).
- 앱 UI = 사이트 UI 그대로 (앱은 실서버 https://www.sfaclan.com 을 띄움 → 사이트 배포 = 앱 화면 자동 최신).
- 설치 대상: 지금은 제작자 + 최고관리자만 (마이 프로필 [앱 다운로드]). 나중에 모든 유저가 설치할 수 있게 알림 구조는 전체 유저 기준으로 만듦.
- 앱이 꺼져 있어도 알림: 안드로이드는 FCM 푸시 (Firebase 프로젝트는 사용자가 만듦).
- 윈도우 창 X: 처음에는 "완전히 닫기 / 트레이로 내리기" 팝업 + "다음부터 묻지 않기", 나중에 알림 설정에서 변경 가능.
- 일반 브라우저 웹 푸시: 나중에 생각 (이번에는 안 함).
- 알림 표시:
  - **앱**: 모든 알림(좋아요·댓글·답글·신고(심사 포함)·건의함·이의제기)을 **OS 알림**으로 (앱을 보고 있을 때도). 사이트 파란 토스트는 쓰지 않음.
  - **일반 브라우저**: 토스트도 OS 알림도 없이 **빨간 점만** (예전 파란 토스트는 없앰).
- 알림 설정: 마이 프로필 → [알림] 창 머리의 **톱니바퀴** → 알림 설정.
  - 알림을 끄면 OS 알림(팝업)만 안 뜨고, 알림 목록·빨간 점·신고 기록·건의함·관리자 메시지에는 그대로 쌓임 (DB 트리거도 이에 맞게 수정).
  - 관리자 알림: 신고(심사 포함)·이의제기 = 제작자+최고관리자, 건의함 = 제작자. 각각 따로 끌 수 있음.
- OS 알림을 누르면: 좋아요·댓글 → 해당 글/댓글 위치, 신고 → [신고 기록] 창, 건의 → 건의함, 이의제기 → 관리자 전용 메시지.

## 2. 구조

| 구분 | 안드로이드 (apps/android) | 윈도우 (apps/windows) |
|---|---|---|
| 껍데기 | Capacitor 8.5 (server.url = https://www.sfaclan.com) | Tauri 2 (WebView2), NSIS 설치 프로그램 (관리자 권한 없이 설치) |
| 앱 표시 | User-Agent 끝 ` SFAClanApp/<버전> (android)` (+ Firebase 포함 빌드면 ` SFAClanPush/1`) | 페이지보다 먼저 `window.__SFACLAN_APP__ = {platform:'windows', version}` |
| 로그인 | 기본 브라우저(Custom Tab)에서 구글 로그인 → sfaclan://auth-callback → 같은 웹뷰에서 PKCE 코드 교환 | 기본 브라우저 → sfaclan:// (딥링크 + 단일 실행) → 같은 방식 |
| 알림 | FCM 푸시 (앱이 꺼져 있어도). 앱이 앞에 있을 때 온 푸시는 로컬 알림으로 다시 띄움. 채널 sfa_alerts(헤즈업) | 앱이 떠 있는 동안(트레이 포함) 사이트가 Realtime + 60초 확인으로 감시 → 윈도우 알림(오른쪽 아래) |
| 기타 | 뒤로가기(열린 창 닫기 → 뒤로 → 앱 내리기), 상태바·내비게이션바 여백/색 = 사이트 테마, 회전·분할·팝업 창에서 다시 로드 안 함, 연결 실패 화면 | 최소 360x560, 크기·위치 기억, 트레이(열기/종료), 다른 사이트 링크는 기본 브라우저, 연결 실패 화면 |

- 사이트 쪽 연결 코드: src/lib/appBridge.ts (앱 판별·로그인·딥링크·창 닫기·상태바), src/lib/appNotify.ts (OS 알림·권한·FCM 토큰·감시),
  src/lib/notifications.ts (OS 알림 문구), src/components/AppShell.tsx, AppClosePopup.tsx, userhub/NotificationSettingsView.tsx, userhub/AppDownloadView.tsx.
  네이티브 모듈은 앱 안에서만 동적으로 불러오므로 일반 브라우저 방문자는 추가 다운로드가 없다.
- 서버 푸시: DB 트리거 zz_sfa_push_dispatch (user_notifications / admin_notifications(report·review_required) / site_suggestions / blacklist_appeals INSERT)
  → pg_net → Edge Function send-push → FCM. 받는 사람·문구·알림 설정 반영은 SQL 함수 sfa_push_build 가 계산 (앱 기기가 없는 회원은 함수 호출 자체가 없음).
- 다른 기기에서 로그아웃 등으로 세션이 끝나면 그 폰의 FCM 토큰을 폐기 (로그아웃된 폰에 푸시가 계속 오지 않게).
- 앱 다운로드: Supabase 비공개 버킷 app-releases (제작자·최고관리자만 읽기). 버튼을 누르면 1분짜리 주소를 발급해 기본 브라우저로 받음.
  파일: android/sfaclan.apk, android/latest.json, windows/sfaclan-setup.exe, windows/latest.json
- 빌드: GitHub Actions (.github/workflows/app-android.yml, app-windows.yml)
  - push (apps/<플랫폼>/** 이 바뀌었을 때): 확인용 빌드만 (서명·업로드·Actions 산출물 없음)
  - 수동 실행 (Actions → 앱 빌드 → Run workflow, upload 체크): 서명(안드로이드)된 파일을 비공개 버킷에 업로드. 공개 저장소라 산출물·비밀 값은 로그에 남기지 않음.
  - 수동 실행은 워크플로 파일이 main 에 있어야 Actions 화면에 버튼이 보인다 → 사이트 배포(main 반영) 후에 실행.
- 아이콘: apps/assets (public/logo-community.png 로 만든 흰 배경 아이콘). 원본 로고가 214x144 로 작아 아이콘이 살짝 흐릴 수 있음 → 고해상도 로고를 받으면
  apps/assets/make_base_icons.py → apps/android 의 `npm run icons` → apps/windows 의 `npx tauri icon ../assets/icon-1024.png` 다시 실행.

## 3. 사용자가 할 일 (순서대로)

1. **SQL 실행** (사이트 배포 전): Supabase → SQL Editor → `supabase/sfaclan_update_2026-10-10_app.sql` 전체 붙여넣기 → Run.
   - "pg_net 을 켤 수 없어" 메시지가 보이면 Database → Extensions 에서 pg_net 켜고 한 번 더 실행.
   - "app-releases 버킷 생성 실패" 경고가 보이면 Storage 에서 비공개 버킷 app-releases 를 직접 만들고 SQL 한 번 더 실행.
2. **로그인 복귀 주소 등록**: Supabase → Authentication → URL Configuration → Redirect URLs 에 `sfaclan://auth-callback` 추가.
3. **사이트 배포**: 기존 배포 명령 (deploy_sfaclan_update.sh, 기본 브랜치 ccr-d081b1c2-9mjot4).
4. **서명 키 만들기** (내 PC, 처음 한 번, Git Bash 저장소 폴더): `cd apps/android && npm install && npm run keystore`
   - apps/android/keystore/ 에 sfaclan-release.p12 와 github-secrets.txt 가 생김. **p12 파일과 비밀번호를 두 곳 이상 백업** (잃어버리면 앱 업데이트 불가).
5. **GitHub Secrets 등록** (GitHub → Settings → Secrets and variables → Actions → New repository secret)
   - github-secrets.txt 의 4개: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD → 등록 후 github-secrets.txt 삭제.
   - SUPABASE_URL (https://<프로젝트>.supabase.co), SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API 의 service_role).
6. **(앱이 꺼져 있어도 알림) Firebase**
   - Firebase 콘솔 → 프로젝트 만들기 → Android 앱 추가 (패키지 com.sfaclan.community) → google-services.json 내용 전체를 GitHub Secret **GOOGLE_SERVICES_JSON** 으로 등록.
   - 같은 프로젝트 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성" JSON (7번에서 사용). 두 파일 모두 저장소에 올리지 않기.
7. **(푸시) Edge Function** (자세한 내용 supabase/functions/send-push/README.md)
   - Edge Functions → Deploy a new function → Via Editor → 이름 `send-push` → index.ts 붙여넣기 → Deploy → **Verify JWT 끄기**.
   - Edge Functions → Secrets: `PUSH_WEBHOOK_SECRET` = SQL Editor 의 `select public.sfa_get_push_secret();` 결과, `FCM_SERVICE_ACCOUNT` = 6번 JSON 내용 전체.
   - SQL Editor: `select public.sfa_set_push_endpoint('https://<project-ref>.supabase.co/functions/v1/send-push');`
8. **앱 빌드·업로드**: GitHub → Actions → "앱 빌드 (안드로이드)" / "앱 빌드 (윈도우)" → Run workflow (branch main, upload 체크).
   성공 후 Supabase → Storage → app-releases 에 파일 4개 확인.
9. **설치**: 사이트 마이 프로필 → [앱 다운로드] → 안드로이드 "출처를 알 수 없는 앱 설치 허용" · Play 프로텍트 경고는 "무시하고 설치",
   윈도우 SmartScreen 은 "추가 정보 → 실행".
10. **실기기 점검** (아래 5번 목록).

## 4. 확인한 것 / 못 한 것

확인함
- 사이트: tsc, eslint(기존 오류만 남음, 새 오류 없음), next build. Playwright + 가짜 Supabase 로 마이 프로필·알림·알림 설정·앱 다운로드·개인 설정 화면 (320/360/448px, 라이트/다크),
  가짜 Tauri 환경에서 이 기기·창 닫기 섹션, 창 닫기 팝업, 앱 이벤트 연결 순서 (listen → sfa_app_ready → sfa_take_pending).
- 가짜 Capacitor 환경에서 권한 요청 1회, FCM 등록·토큰 저장 RPC, 앞에 있을 때 푸시 → 로컬 알림, 뒤로가기, 로그아웃 순서(토큰 해제 → 로그아웃).
- SQL: 로컬 PostgreSQL 16 에서 2회 연속 실행, 알림 끄기여도 알림 저장됨, 받는 사람(제작자 이메일·최고관리자·신고자 제외·설정 꺼짐), 권한(일반 유저는 비밀 함수 호출 불가), 버킷 정책.
- Edge Function: deno check/lint, 가짜 FCM 으로 보내기·토큰 정리·재시도.
- CI: 안드로이드 APK, 윈도우 NSIS 설치 파일 실제 빌드 성공 (GitHub Actions).
- 별도 검토 단계(보안·사이트 흐름·연결 계약·CI·네이티브 동작)에서 확인된 문제 7건은 모두 수정함.

아직 못 함 (실기기 필요)
- 실제 Supabase(pg_net·Realtime·Storage)·FCM·Firebase 연동, 실제 폰·PC 에서 설치·로그인·알림·창 크기·트레이.

## 5. 실기기 점검 목록

안드로이드 (15/16 과 14 이하 각각 있으면 좋음)
- 설치 → 시작 화면(흰 배경 로고) → 사이트가 상태바·내비게이션바에 가려지지 않는지, 라이트/다크 전환 시 막대 색이 따라오는지.
- 로그인: 기본 브라우저에서 구글 로그인 → 앱으로 돌아와 로그인 완료.
- 알림 권한 묻기 1회 → 다른 계정으로 좋아요/댓글 → 앱 켜짐/뒤에 있음/완전히 꺼짐 각각 상단 알림 → 누르면 해당 글·댓글로 이동.
- 관리자: 신고·건의·이의제기 알림 → 누르면 [신고 기록] / 건의함 / 관리자 전용 메시지.
- 알림 설정에서 항목 끄기 → OS 알림만 안 오고 목록·빨간 점은 쌓이는지. "이 기기에서 알림 받기" 끄기.
- 회전·분할 화면·팝업 창에서 다시 로드되지 않는지, 키보드가 입력창을 가리지 않는지, 뒤로가기(창 닫기 → 뒤로 → 앱 내리기).
- 비행기 모드 → "인터넷 연결을 확인해 주세요" + 다시 시도.
윈도우
- 설치(관리자 권한 없이) → 창 최소 크기·크기/위치 기억·최대화.
- 로그인: 기본 브라우저 → "앱 열기" 허용 → 앱에서 로그인 완료.
- X → 닫기 팝업 (완전히 닫기 / 트레이로 내리기 / 다음부터 묻지 않기), 알림 설정 → 창 닫기에서 변경.
- 트레이 상태에서 알림이 오른쪽 아래에 뜨는지, 누르면 창이 앞으로 오며 해당 위치로 이동하는지. 트레이 메뉴 열기/종료.
- 앱을 한 번 더 실행하면 기존 창이 앞으로 오는지.
- 알림이 안 뜨면: 윈도우 설정 → 시스템 → 알림 → "스틱파이터 커뮤니티" 켜짐, 방해 금지 꺼짐.

## 6. 알려진 제한 / 참고

- 윈도우 앱을 완전히 닫으면 알림이 오지 않는다 (트레이로 내리면 계속 옴). 앱이 꺼진 뒤 예전 알림을 눌러도 해당 글로 이동하지 않을 수 있음.
- Firebase 없이 빌드한 안드로이드 앱은 앱이 떠 있는 동안만 알림 (기기 절전 정책에 따라 뒤로 보낸 상태에서는 늦거나 안 올 수 있음).
- 같은 글에 좋아요 → 취소 → 다시 좋아요를 하면 (알림을 읽기 전이면) 푸시가 다시 갈 수 있다. 이미 읽은 좋아요 알림이 다시 살아나는 경우(UPDATE)는 푸시하지 않는다.
- 안드로이드 앱에서는 사이트의 HTTP 오류 페이지(404 등)도 Capacitor 가 연결 실패 화면으로 바꿔 보여 준다.
- 사이트 쪽 같은 사이트 새 창(target=_blank) 링크는 윈도우 앱에서 권한 없는 보조 창으로 열린다 (앱 알림·로그인 불가, 일반 웹페이지처럼 동작).
- 서명 키(p12)를 잃어버리면 같은 앱으로 업데이트가 안 된다 (지우고 새로 설치해야 함).
- 앱 껍데기를 바꾸면(apps/) push 때 확인용 빌드가 자동으로 돈다. 실제 배포 파일은 수동 실행으로만 올라간다.
- 앱 판별은 서버 렌더링에서 항상 null → 앱 전용 화면 요소는 마운트 후에만 그린다 (HANDOVER.md 6번).

## 7. 다음에 할 수 있는 일

- 실기기 점검 결과 반영.
- 고해상도 로고로 아이콘 다시 만들기.
- (선택) 일반 브라우저 웹 푸시 (push_tokens platform 'web' + 같은 sfa_push_build 재사용).
- (선택) 사이트가 최신 앱 버전을 알려 주고 오래된 앱이면 "새 버전 받기" 안내 (latest.json 의 version/build 활용).
