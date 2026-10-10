# SFAClan 앱(APK / EXE) 제작 인수인계 (2026-10-10 기준)

> 사용법: 새 AI 세션에 "저장소의 HANDOVER.md 와 HANDOVER_APP.md 를 먼저 읽어줘" 라고 요청.
> HANDOVER.md 의 "0. AI 작업 규칙"을 그대로 따른다. (답변은 한국어, 배포는 사용자가 직접, 작업 브랜치에 커밋·푸시까지만,
> 사용자가 할 일은 모든 작업이 끝난 뒤 한 번에 순서대로 안내, 브라우저 기본 팝업 금지 등)

작업 브랜치: claude/charming-ptolemy-oe6qxa (이전 세션 작업이 모두 여기 있음).
main 에 반영됐는지는 `git log origin/main --oneline -5` 로 확인할 것. 새 세션의 브랜치 이름이 다르면
deploy_sfaclan_update.sh 의 BRANCH 기본값도 바꾸거나, 배포 명령에서 첫 번째 인자로 넘긴다.

---

## 1. 사용자 요구사항 (확정)

### 앱 기본
- 앱 이름: **스틱파이터 커뮤니티**
- 아이콘: 사이트 왼쪽 위 로고(public/logo-community.png, 원본은 배경 투명 1672x941 중 로고 부분)를 **흰 배경 정사각형** 위에 여백을 두고 얹음.
  안드로이드 적응형 아이콘(maskable) 안전 영역 고려.
- 플랫폼: 안드로이드 **APK**, 윈도우 **EXE (setup 설치 프로그램)**. 스토어 출시는 당장 안 함(직접 설치용).

### UI
- **앱 UI = 사이트 UI 그대로.** 앱 전용 화면(하단 탭 바 등)을 따로 만들지 않는다. "직접적인 UI 변경은 없음"이 사용자 결정.
- 주소창 있는 인터넷 창 느낌이 아니라 **진짜 앱처럼** 보여야 함 (주소창·브라우저 버튼 없음, 앱 아이콘·시작 화면·작업표시줄/최근앱에서 앱으로 보임).
- **사이트를 배포하면 앱도 자동으로 최신 화면** (앱이 실서버 https://www.sfaclan.com 을 불러오는 방식).
- **어떤 크기에서도 UI가 깨지지 않게**
  - PC: 창 테두리로 크기 조절 가능, **최소 크기** 지정(제안: 360x560), 창 크기·위치 기억, 최대화/전체화면.
  - 모바일: 팝업 창(작게 띄우기), 분할 화면(멀티 윈도우), 화면 회전, 폴더블에서 앱이 다시 로드되지 않고 레이아웃만 맞춰짐.
  - 사이트는 320px 까지 맞춰져 있음. 팝업/분할 화면은 그보다 좁아질 수 있으니 실제로 확인하고, 필요하면 300px 안팎 대응을 추가.

### 로그인
- 앱 안의 웹뷰(WebView/WebView2)에서는 **구글 로그인이 구글 정책으로 막힘** → 로그인 버튼을 누르면 **기기 기본 브라우저**에서 구글 로그인 →
  끝나면 앱 전용 주소(`sfaclan://auth-callback`)로 앱에 돌아와 로그인 완료. (사용자 표현: "사이트로 방문시켜서 로그인")
- 사이트는 Supabase PKCE 방식(src/lib/supabase.ts, storageKey 'sfaclan_auth_session').
  권장 흐름: 앱 안에서 `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:'sfaclan://auth-callback', skipBrowserRedirect:true } })`
  → 받은 URL 을 외부 브라우저로 열기 → 딥링크로 돌아온 `code` 를 **같은 웹뷰에서** `exchangeCodeForSession(code)` (code verifier 가 웹뷰 저장소에 있으므로).
- 일반 브라우저로 접속한 경우의 로그인은 지금과 똑같이 유지.

### 알림 (앱에서 작동해야 함)
- 대상 알림: **좋아요, 댓글(답글 포함), 신고 알림, 건의함**.
  - 기존 구조
    - 좋아요·댓글·답글 → `user_notifications` 테이블 (Realtime, 60일 자동 정리). 받는 사람의 notify_* 설정이 꺼져 있으면 DB 트리거가 아예 만들지 않음.
    - 신고 → `admin_notifications` (type: report / review_required). 제작자·최고관리자가 [신고 기록]에서 확인.
    - 건의사항 → `site_suggestions` (is_read). 제작자가 건의함에서 확인.
    - (참고) 이의제기 → `blacklist_appeals` (status pending). 최고관리자·제작자.
  - 관련 코드: src/lib/notifications.ts (문구·이동 경로), src/components/AppShell.tsx (Realtime 구독·파란 토스트·빨간 점, 실패 시 60초마다 확인).
- 앱이 **열려 있을 때**: 기존 사이트 토스트 + (창이 뒤에 있거나 최소화돼 있으면) **기기 알림(OS 알림)**.
- 앱이 **꺼져 있을 때**: 안드로이드 푸시 알림(FCM). 윈도우는 아래 "확인 필요" 참고.
- 알림을 누르면 해당 글/댓글 위치로 이동 (resolveNotificationPath, commentAnchor 재사용).

### 배포·다운로드
- **앱 설치 대상: 제작자 + 최고관리자만.** (일반관리자 제외)
- 마이 프로필 메뉴에 **[앱 다운로드]** 항목 추가 (제작자·최고관리자에게만 보임). 사이트 디자인(직각 팝업/라운드 스퀘어) 그대로.
  - 안드로이드 APK / 윈도우 설치 프로그램 다운로드 버튼
  - 설치 안내: 안드로이드 "출처를 알 수 없는 앱 허용" · Play 프로텍트 경고, 윈도우 SmartScreen "추가 정보 → 실행"
- **다운로드 막기 B 방식**: Supabase Storage **비공개 버킷**(예: `app-releases`)에 파일 보관.
  RLS 로 `sfa_is_senior_admin()`(제작자·최고관리자)만 읽기 허용 → 버튼을 누를 때 `createSignedUrl(파일, 60)` 로 잠깐 쓰는 주소 발급.
  - 새 SQL 은 HANDOVER.md 규칙대로 여러 번 실행해도 안전하게, SQL 미적용이어도 사이트가 깨지지 않게.

### 빌드
- **GitHub 저장소는 공개(public)** → GitHub Actions 무료.
- 제작자 PC/이 클라우드 환경에서 직접 빌드하지 않고 **GitHub Actions** 로 APK 와 setup.exe 를 만든다 (안드로이드 SDK 수 GB, EXE 는 윈도우 러너 필요).
- 저장소가 공개이므로 주의
  - 서명 키(keystore), Supabase service_role 키, Firebase 설정/서비스 계정은 **절대 커밋 금지** → GitHub Secrets / Supabase Secrets.
  - 공개 저장소의 Actions 산출물(artifact)·로그는 다른 사람도 볼 수 있음 → 빌드 결과는 **artifact 로 남기지 말고** Supabase 비공개 버킷에 바로 업로드
    (service_role 키로 Storage API 호출, 로그에 URL/키 출력 금지). 업로드가 어려우면 artifact 보존 기간 1일 + 사용자에게 위험 고지.

---

## 2. 제안 기술 구성 (이전 세션 검토 결과, 사용자에게 설명함)

| 구분 | 안드로이드 | 윈도우 |
|---|---|---|
| 껍데기 | Capacitor (server.url = https://www.sfaclan.com) | Tauri v2 (WebView2, NSIS setup.exe, 용량 작음) |
| 로그인 | @capacitor/browser(Custom Tab) 로 OAuth → intent-filter `sfaclan://` → App `appUrlOpen` | opener 로 기본 브라우저 → deep-link 플러그인 `sfaclan://` + single-instance 플러그인 |
| 크기 대응 | resizeableActivity, configChanges(orientation/screenSize/smallestScreenSize/screenLayout/density/uiMode)로 재로드 방지 | minWidth/minHeight, window-state 플러그인(크기·위치 기억) |
| 알림 | FCM 푸시 (+ local notification) | notification 플러그인 (OS 알림), 트레이 상주 여부는 확인 필요 |
| 기타 | 뒤로가기 버튼 → 열린 창 닫기/뒤로, 상태바 색 테마 연동, 시작 화면(흰 배경 로고) | 창 제목 "스틱파이터 커뮤니티", 앱 아이콘 |

- 사이트 쪽에서 앱 안인지 알아내기: 껍데기에서 User-Agent 끝에 `SFAClanApp/<버전> (android|windows)` 를 붙이는 방식 권장.
  앱일 때만 로그인 흐름·알림 등록·뒤로가기 처리를 바꾸고, **화면 모양은 바꾸지 않는다.**
- 앱 패키지 ID 제안: `com.sfaclan.community` (확인 필요)
- 껍데기 코드 위치 제안: 저장소 안 `apps/android`(Capacitor), `apps/windows`(Tauri). Next.js 빌드(Vercel)에 영향 없게 분리.
  (Vercel 이 apps/ 폴더를 빌드하지 않도록, tsconfig/eslint 대상에서도 제외)
- 앱 껍데기는 아이콘·딥링크·플러그인을 바꿀 때만 다시 빌드. 화면·기능 수정은 사이트 배포만으로 반영.
- (선택) 사이트가 최신 껍데기 버전을 알려 주고, 앱이 오래됐으면 "새 버전 받기" 안내.

### 푸시 알림 설계 제안
- 테이블 `push_tokens (user_id, token, platform, updated_at)` — 본인 것만 쓰기/지우기 RLS. 로그아웃 시 토큰 삭제.
- 보내기: Supabase **Database Webhook** (user_notifications / admin_notifications / site_suggestions INSERT) → **Edge Function** `send-push`
  → FCM HTTP v1 (Firebase 서비스 계정은 Supabase Secrets).
  - user_notifications → recipient_id 에게 (notify_* 설정은 이미 트리거에서 반영됨)
  - admin_notifications(report, review_required) → 제작자·최고관리자에게
  - site_suggestions → 제작자에게
- 알림 문구는 src/lib/notifications.ts 와 같은 표현 사용. 누르면 해당 경로로 이동.

---

## 3. 새 세션에서 작업 전에 사용자에게 먼저 확인할 것
이전 세션에서 아직 답을 받지 못한 질문들이다. **작업 시작 전에 한 번에 묻고**, 답을 받은 뒤 진행한다.
1. **앱이 꺼져 있을 때도 알림을 받을지**: 안드로이드는 Firebase 프로젝트(무료)를 사용자가 만들어야 함
   (패키지 ID 등록 → google-services.json, 서비스 계정 키). 아니면 "앱이 켜져 있을 때만" 으로 갈지.
2. **윈도우 앱 창을 닫으면**: 완전히 종료할지, 작업표시줄 트레이에 남아 알림을 계속 받을지.
3. **일반 브라우저(사이트)에도 푸시 알림**을 넣을지 (웹 푸시, 앱과 같은 서버 구조 재사용 가능). 이번 요청은 앱 기준.
4. **알림 받는 사람**: 신고 알림 = 제작자+최고관리자, 건의함 = 제작자만 (현재 사이트 권한과 동일) 로 맞는지. 이의제기 알림도 넣을지.
5. 앱 패키지 ID `com.sfaclan.community` 로 해도 되는지.

---

## 4. 사용자가 하게 될 일 (예상, 작업 끝난 뒤 한 번에 안내)
- SQL 실행 (비공개 버킷 + 권한, push_tokens 등)
- Supabase → Authentication → URL Configuration → Redirect URLs 에 `sfaclan://auth-callback` 추가
- (푸시 시) Firebase 프로젝트 생성, google-services.json·서비스 계정 키 준비, Supabase Edge Function 배포·Secrets 등록, Database Webhook 설정
- GitHub → Settings → Secrets 에 서명 키(base64)·비밀번호·Supabase 업로드 키 등록
  (서명 키는 Actions 에서 처음 한 번 만들어 주는 절차도 가능. **서명 키를 잃어버리면 같은 앱으로 업데이트 불가** → 사용자에게 백업 강조)
- 사이트 배포 (기존 deploy_sfaclan_update.sh)
- GitHub → Actions → 앱 빌드 실행 → 파일이 비공개 버킷에 올라갔는지 확인
- 실기기 설치·로그인·알림·창 크기 확인

---

## 5. 참고 (이전 세션에서 알게 된 것)
- 사용자의 VS Code 터미널은 MSYS2 UCRT64 bash 라서 Node.js 경로를 못 찾았음 → 배포 스크립트가 흔한 설치 위치를 자동으로 찾도록 수정해 둠.
  붙여넣기 시 `[200~` 가 붙으면 Ctrl+C 후 다시 붙여넣기. Git Bash 터미널을 쓰는 것이 가장 무난.
- 조회수 SQL(sfaclan_update_2026-10-08_views.sql)은 사용자가 실행 완료(컬럼·함수 true 확인).
- 로고 파일: public/logo-community.webp / .png (높이 144px, 배경 투명). 고해상도 원본이 필요하면 사용자에게 다시 요청.
- 화면 확인은 Playwright(사전 설치된 Chromium)로 가짜 Supabase 응답을 붙여 실제 페이지를 띄우는 방식이 잘 됐음.
  next start 를 끌 때 `pkill -f next-server` 는 자기 셸까지 죽이므로 PID 로 종료할 것.
