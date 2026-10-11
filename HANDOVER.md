# SFAClan 인수인계 (2026-10-11 기준, 사이트 + 앱 통합본)

> 사용법: 새 AI 세션에 "저장소의 HANDOVER.md 를 먼저 읽어줘" 라고 요청 (이 파일 하나로 끝. 예전 HANDOVER_APP.md 는 여기로 합침).

코드 저장소: twoapple08/community-web (GitHub) / 실서버: https://www.sfaclan.com
작업 브랜치: **ccr-d081b1c2-9mjot4** (그 전 작업은 claude/charming-ptolemy-oe6qxa). main 반영 여부는 `git log origin/main --oneline -5` 로 확인.
배포 스크립트 deploy_sfaclan_update.sh 의 BRANCH 기본값도 이 브랜치.

**현재 상태 (2026-10-11)**
- 사이트: 앱 연동 코드까지 main 에 배포 완료 (main = 55e679c).
- 앱 설정 모두 끝남: 2026-10-10 앱 SQL 적용, GitHub Secrets 7개, Firebase(FCM), Edge Function send-push 배포·연결, 서명 키 백업.
- 앱 빌드: 안드로이드(서명 APK, 푸시 포함)·윈도우(NSIS) 수동 빌드 성공 → Supabase 비공개 버킷 app-releases 에 업로드 완료.
- **남은 것: 실기기 점검 (아래 9번 목록)** 과 그 결과 반영.
- 작업 브랜치에만 있고 main 에 없는 것: codespaces-setup-push.sh 개선(DB 업데이트 자동 적용), 이 문서. 사이트·앱 동작과 무관하므로 급히 배포할 필요 없음.

## 0. AI 작업 규칙 (반드시 지킬 것)
- 바꾸라고 한 것 외에는 화면·동작이 눈으로 보기에 완전히 똑같아야 한다. 코드는 바뀌어도 되지만 디자인/배치/문구/동작은 그대로 둔다.
- 브라우저 기본 팝업(alert/confirm/prompt)은 쓰지 않는다. 사이트 전용 직각 팝업(src/components/CustomPopup.tsx)이나 같은 디자인 계열을 쓴다. 라운드 스퀘어도 가능하다.
- 사용자는 주로 **휴대폰(브라우저 + GitHub Codespaces 터미널)**, 가끔 PC(VS Code + Git Bash)로 작업한다. 휴대폰에서 긴 SQL 붙여넣기는 실패하기 쉬우므로
  가능하면 "Codespaces 터미널에 한 줄 붙여넣으면 다 해 주는 스크립트"로 준다 (apps/android/scripts/codespaces-*.sh 방식).
- 결과물은 "붙여넣기만 하면 되는 명령"으로 준다. 마지막에는 항상 에러 검사(타입 검사 + 빌드)를 통과해야만 실서버에 배포(main push)되는 명령을 준다.
- 실서버 배포(main push)는 사용자가 직접 한다. AI는 작업 브랜치에 커밋·푸시까지만 하고 배포 명령을 알려준다. npx tsc --noEmit 은 실행해도 된다.
- AI가 혼자 처리할 수 있는 건 직접 처리하고, 사용자가 해야 할 일(Supabase 작업 등)은 순서대로 정리해서 알려준다.
- 복붙만으로 끝나는 작업(SQL 실행, 배포, 공지 작성, 실기기 확인)은 사용자에게 넘겨 토큰을 아낀다. 사용자가 할 일 안내는 모든 작업이 끝난 뒤 한 번에 한다.
- 질문이나 필요한 자료가 있으면 먼저 물어본다. **답변은 반드시 한국어로 한다** (영어로 답하면 사용자가 불편해함).
- 비밀 값(service_role 키, Supabase 액세스 토큰, Firebase 서비스 계정 키, 서명 키 비밀번호)은 채팅에 붙여넣게 하지 않는다. 터미널·GitHub Secrets·Supabase Secrets 에만.
  공개 저장소이므로 비밀 파일 커밋 금지, Actions 산출물(artifact) 금지, 로그에 비밀 값 출력 금지.
- 서명 키를 새로 만들지 않는다 (새로 만들면 기존 설치 앱이 업데이트 불가). 필요하면 반드시 먼저 묻는다.
- 이 저장소의 Next.js 는 16 버전으로 학습 데이터와 다르다. 코드를 쓰기 전에 node_modules/next/dist/docs/ 문서를 확인한다 (AGENTS.md 참고).

## 1. 프로젝트 개요
- 사이트: 스틱파이터 커뮤니티 (SFAClan). 클랜 홍보용 클랜 피드와 유저 소통용 커뮤니티 피드로 나뉜다.
- 디자인 방향: 모바일 퍼스트, 다크/라이트 모드, 직각(rounded-none) 팝업 + 라운드스퀘어 카드.
- 제작자 계정: iwsamuel08@gmail.com. 클라이언트 코드에서는 SHA-256 해시로만 비교한다 (src/lib/roles.ts 의 isCreatorEmail). 서버 SQL 함수와 개인정보처리방침 연락처에는 평문이 들어가 있다 (사용자 승인).
- 권한 등급: 제작자(creator, 빨간 왕관) > 최고관리자(super_admin, 주황 왕관) > 일반관리자(admin, 흰 왕관) > 일반회원.
- 사이트 제작자 표기: 사과사과. 크레딧은 사용된 도구 Gemini·Claude, 도움주신 분들 시르타르 외 베타 테스터.

## 2. 기술 스택 / 인프라
- Next.js 16.3.8 (App Router, Turbopack), React 19.2.8.
- Tailwind CSS v4: @import "tailwindcss", @variant dark (&:where(.dark, .dark *)). @tailwindcss/typography 와 애니메이션 플러그인은 없다. 그래서 prose 서식은 globals.css 에 직접 작성했고, animate-in / zoom-in-95 클래스는 아무 효과가 없다.
- Supabase: PostgreSQL + RLS, Storage(posts, post-images, post-videos, comment-images, avatars), Auth(Google OAuth, PKCE), Realtime.
- TipTap v3 에디터, lucide-react 아이콘.
- 배포: main push → Vercel 자동 배포. 다른 브랜치는 Preview 로만 배포된다.
- 환경변수 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 는 Vercel 에만 있고 저장소에는 없다.
- 배포 명령: 작업 브랜치 이름을 바꾸면 스크립트 안의 BRANCH 기본값도 바꾸거나 첫 번째 인자로 넘긴다.
  - PC(Git Bash, 저장소 폴더): git fetch origin <브랜치> && git show origin/<브랜치>:deploy_sfaclan_update.sh | bash
  - Codespaces: 같은 명령 앞에 cd /workspaces/community-web && 를 붙인다.
  - 스크립트 순서: 기존 변경 stash → main 에 merge → npm ci → npx tsc --noEmit → npm run build → 모두 통과 시에만 main push.

## 3. 폴더 구조 (핵심)
```
src/app/
  layout.tsx            서버 컴포넌트: viewport export(태그 1개), head 메타·OG, 테마 초기화 인라인 스크립트, <AppShell>
  globals.css           전역 스타일 (아래 6번 참고)
  page.tsx              / → 로그인 처리 후 /community 이동
  community/layout.tsx  피드 목록을 레이아웃에 둠 (글 열고 닫아도 목록 유지), [id]/page.tsx = 게시글 모달
  clan/...              위와 동일 구조
  write/page.tsx        글쓰기 (게시판·태그, 썸네일, 임시보관, 블랙리스트 차단 + 이의제기)
  privacy/page.tsx      개인정보처리방침 (공개 페이지)
  posts/[id]/page.tsx   옛 주소 호환
  api/link-preview/     링크 제목 조회 (SSRF 차단, 엣지 캐시)
src/components/
  AppShell.tsx          헤더(테마 토글, 글쓰기, 프로필, 관리자, 블랙, 로그아웃), 알림 빨간점·실시간, 앱 연동(로그인·OS 알림·딥링크·뒤로가기), 전역 모달, 하단 푸터
  AppClosePopup.tsx     [윈도우 앱] 창 닫기(X) 때 '완전히 닫기 / 트레이로 내리기' 직각 팝업
  UserProfileHost/UserProfileModal  ?profile=유저ID 로 뜨는 공개 프로필 창
  Avatar.tsx            원형 프로필 사진 (없으면 fallback)
  CommunityFeed / ClanFeed  피드 목록 (목록형·피드형·앨범형)
  PostModal.tsx         게시글 상세 (본문 정화, 임베드, 좋아요, 공유, 수정/삭제, 신고, 신고 심사 상태 표시)
  CommentsSection.tsx   댓글 (인라인 수정, 삭제 확인, 링크/임베드, #comment-ID 앵커 스크롤)
  CommentText.tsx / EmbedCard.tsx / LinkConfirmPopup.tsx
  Editor.tsx            TipTap 에디터
  editor/ColorStudio.tsx, ColorWheel.tsx, VerticalSlider.tsx  색 편집창
  editor/ResizableImage.ts, editor.css   이미지 8점 크기조절
  editor/EditorHelpPopup.tsx             ? 도구 설명
  UserHubModal.tsx      마이 프로필 (+ userhub/SettingsView, NotificationSettingsView, AppDownloadView, SettingsParts, MyCommentsView, CreditsPopup)
  AdminReportModal.tsx + ReportReviewModal.tsx  신고 기록·심사
  VideoThumb.tsx        목록용 동영상 첫 장면 미리보기 (재생 없음, 화면 근처에서만 로드)
  (lib) postViews.ts    조회 기록(recordPostView) + 조회수 짧게 표시(formatViewCount)
  AdminModal, BlacklistModal, AdminReplyPopup, NoticeBanner, TermsModal, CustomPopup, CrownIcon, FreezeModal, ReportModal, FeedMedia
src/lib/
  userProfile.ts   프로필 열기/닫기(pushState), 공개프로필·통계·아바타맵, 닉네임 변경, 사진 업로드, 설정 저장, 토스트 설정
  embeds.ts        카톡/디코/유튜브 판별·캐시·임베드 HTML (채움형 디자인)
  colorUtils.ts    색 변환, 글씨색·테두리·글로우 CSS, 즐겨찾기 색(localStorage)
  notifications.ts 알림 조회·문구·이동 경로(resolveNotificationPath, commentAnchor) + 앱 OS 알림 문구(build*OsNotification, SQL sfa_push_build 와 같은 문구)
  appBridge.ts     앱 안인지 판별(getAppPlatform), 기본 브라우저 열기, 앱 로그인(sfaclan://auth-callback), 창 닫기 설정, 상태바, 앱 이벤트 연결
  appNotify.ts     앱 OS 알림: 권한, 안드로이드 채널, FCM 토큰 등록/해제, 앱이 떠 있는 동안 직접 감시(윈도우), 이 기기 알림 켜기/끄기
  appIntents.ts    알림을 눌렀을 때 피드의 [신고 기록] 창 열기 요청
  roles.ts, authUrl.ts, sanitizeHtml.ts, postRoute.ts, feedStore.ts, htmlText.ts, imageCompress.ts, clipboard.ts, koreanUtils.ts, videoUtils.ts
supabase/
  sfaclan_update_2026-10-05.sql  지난 업데이트 (적용 완료)
  sfaclan_update_2026-10-06.sql  지난 업데이트 (적용 완료, 여러 번 실행해도 안전)
  sfaclan_update_2026-10-07_avatar.sql  새 가입자는 항상 기본 프로필 사진 (여러 번 실행해도 안전)
  sfaclan_reset_avatars_once.sql        (1회용) 모든 유저 프로필 사진을 기본으로 되돌림
  sfaclan_update_2026-10-08_views.sql   게시글 조회수 (여러 번 실행해도 안전)
  sfaclan_update_2026-10-10_app.sql     앱 알림·푸시·앱 다운로드 버킷 (여러 번 실행해도 안전, 8번 참고)
  functions/send-push/index.ts          FCM 푸시 발송 Edge Function (import 없는 한 파일. codespaces-setup-push.sh 가 배포, 대시보드 붙여넣기도 가능)
apps/                            앱 껍데기 (사이트 빌드·타입검사·린트와 분리됨, tsconfig/eslint 에서 제외)
  assets/          앱 아이콘 원본 (make_base_icons.py 로 public/logo-community.png 에서 생성)
  android/         Capacitor 8 안드로이드 앱 (README.md 참고), scripts/codespaces-setup-*.sh = Codespaces 한 줄 설정 스크립트
  windows/         Tauri 2 윈도우 앱, NSIS 설치 프로그램 (README.md 참고)
.github/workflows/app-android.yml, app-windows.yml   앱 빌드 (push = 확인용 빌드, 수동 실행 = 서명·업로드)
deploy_sfaclan_update.sh         빌드 검사 후 main 배포 스크립트
```
루트의 수많은 fix_*.sh, update_*.sh, project_codebase.txt 는 과거 기록이며 현재 동작에 쓰이지 않는다.

## 4. 주요 기능
- 피드 2종: 클랜 피드(/clan, 댓글 없음, 공식/비공식·태그 필터, 공식글 삭제신청 → 관리자 심사)와 커뮤니티 피드(/community, 게시판 9종, 댓글).
- 보기 모드 3종: 목록형·피드형·앨범형. localStorage 키 sfa_global_view_mode 로 두 피드가 같이 쓴다.
  - 사진이 2장 이상이면 파란 +N, 동영상이 있으면 주황 배지(영상 아이콘 + 개수)를 목록형·앨범형에 표시한다.
  - 대표 사진·포스터가 없는 동영상 글은 VideoThumb 로 첫 장면을 보여 준다 (재생 안 됨).
  - 본문 미리보기는 피드형에서만 보인다 (2줄, 내용이 없으면 숨김). 목록형·앨범형은 제목과 사진만 보인다.
- 조회수: posts.view_count. 같은 사람(회원은 계정, 비회원은 브라우저 임의 식별값)·같은 글은 하루(KST) 1번만 셈.
  - sfa_record_post_view RPC 로만 올라가고(직접 수정은 트리거가 막음), 삭제·삭제 신청 글은 세지 않음, 비회원은 글당 하루 300회 상한.
  - 조회 기록(post_views)은 이틀 뒤 삭제 (pg_cron 매일 00:10 KST, 없으면 RPC 안에서 가끔 정리). 인기순 정렬에는 영향 없음.
  - 표시: 게시글 창 머리(조회 N), 목록형 메타 줄, 피드형 하단 오른쪽, 앨범형 사진 왼쪽 아래. SQL 미적용이면 표시 안 함.
- 정렬: 최신순/인기순/오래된순. 한 페이지에 10~50개 표시. 게시글 주소는 피드별 번호(post_no)를 쓴다.
- 프로필: 닉네임(목록·게시글·댓글)을 누르면 ?profile=ID 창이 뜨고, 뒤로가기로 닫힌다.
  - 닉네임, 왕관, 한 줄 소개, 통계(쓴 글 / 누른 좋아요 / 댓글 수, 비공개 설정 시 "비공개"), 작성한 게시글 목록을 보여준다.
  - 피드형 원형 칸, 게시글 머리, 댓글에는 프로필 사진이 있을 때만 표시한다.
- 마이 프로필(구 마이 메뉴)
  - 상단 카드를 누르면 내 프로필이 열린다.
  - 메뉴: 알림, 개인 설정(톱니바퀴), 건의사항/건의함, 내가 쓴 게시글, 좋아요 누른 게시글, 내가 쓴 댓글, 관리자 전용 메시지, 앱 다운로드(제작자·최고관리자), 제작자 콘솔.
  - [알림] 창 머리(닫기 버튼 옆) 톱니바퀴 → 알림 설정: 내 활동 알림(좋아요/댓글/답글), 관리자 알림(신고·이의제기는 제작자·최고관리자, 건의함은 제작자),
    앱 안에서만 '이 기기'(이 기기에서 알림 받기, 알림 권한), 윈도우 앱에서만 '창 닫기'(매번 묻기/완전히 닫기/트레이로 내리기).
    알림 설정은 앱의 OS 알림을 띄울지만 정한다. 꺼도 알림 목록·빨간 점은 그대로 쌓인다.
  - 맨 아래에 ⓘ 크레딧과 개인정보처리방침 링크가 있다.
- 개인 설정
  - 프로필 사진: 호버/탭 시 카메라 아이콘, GIF 가능, 5MB 이하, avatars 버킷, "기본 이미지로" 버튼.
  - 닉네임: 중복 불가, 실시간 중복 확인, 최대 15자.
  - 한 줄 소개(60자), 누른 좋아요 수·쓴 댓글 수 공개 토글.
  - (알림 스위치는 2026-10-10 에 [알림] → 톱니바퀴 '알림 설정'으로 옮김)
- 댓글: 답글, 이미지/GIF, 좋아요, 신고.
  - 삭제 시 확인창이 뜬다. 작성자는 댓글 자리에서 바로 수정할 수 있고, 수정되면 "(수정됨)"이 붙는다.
  - 링크는 클릭되며, 카톡/디코는 카드, 유튜브는 플레이어로 표시하고 누르면 접속 확인 팝업이 뜬다.
  - 알림을 누르면 #comment-ID 위치로 바로 이동한다.
- 임베드: 카톡/디코는 테두리 없이 브랜드색 50%로 꽉 채운 바 형태다. 실제 방·서버 이름은 캐시와 data-embed-title 로 관리한다.
- 신고: 게시글·댓글 모두 1인당 1회만 가능하다.
  - 같은 사유로 3회가 쌓이면(사유별로 셈, '기타'는 한 종류) 관리자 검토 전까지 임시로 가려진다. 게시글은 is_deleted=true + report_review_status='pending', 댓글은 자리표시로 바뀐다.
  - 제작자와 최고관리자가 [신고 기록] → 심사 대기 → 내용 보기에서 신고 내역을 확인하고 [삭제 확정] 또는 [무고 처리(복구)]를 고른다.
  - 게시글이 신고로 3회 이상 삭제 확정되면 작성자는 자동으로 블랙리스트에 오른다.
- 리치 텍스트 에디터
  - 글꼴/서식 → [색 상세 편집]
    - 색상 고르기: 고정 삼각형 + 색상 고리, 왼쪽 위 미리보기 칸.
    - 탭 구성: 글씨 색 / 테두리 / 글로우. 테두리와 글로우는 스위치로 켜는 방식이고, 꺼져 있으면 흑백 처리돼 조작할 수 없다.
    - 주황 세로 슬라이더(불투명도, 두께, 범위, 강도)로 수치를 조절한다.
    - HEX 입력, 즐겨찾기(툴바의 기본 색 자리에 표시), 다크/라이트 배경 미리보기, 초기화·취소·적용 버튼이 있다.
  - 테두리나 글로우만 넣고 글씨 색을 건드리지 않으면 글씨 색은 그대로다.
  - 글씨 색 초기화: 툴바와 색 편집창의 [기본색] → 지정한 글씨 색만 지움(테두리·글로우 유지) → 다크/라이트에 따라 바뀌는 기본 글자색.
    색 편집창 아래 [전체 초기화]는 글씨 색·테두리·글로우를 모두 지움. 표에서 여러 칸을 선택해도 모든 칸에 적용됨.
  - 색 편집창은 '직접 바꾼 항목만' 적용한다 (colorUtils 의 TextStylePatch / applyTextStylePatch). 여러 색·효과가 섞인 선택은 글자마다 원래 값을 유지하고,
    탭 점이 무지개로 표시되며 안내 문구가 뜬다. 미리보기도 글자마다 실제 적용 결과를 보여 준다. 형광펜도 색을 바꿨을 때만 섞인 형광펜을 덮어쓴다.
  - 서식 읽기: 한 span 에 여러 스타일(색+크기+글꼴+배경색)이 있어도 모두 읽음 (parse 규칙 consuming: false). 형광펜은 priority 200 으로 바깥에 그려 조각나지 않음.
  - 밑줄은 CustomUnderline 하나만 쓴다 (StarterKit underline 끔, Ctrl+U 도 같은 밑줄). 들여쓰기/내어쓰기는 문단 indent 속성(24px 단위, 최대 8단계).
  - [형광펜 상세 편집], 툴바 맨 오른쪽 ? 도구 설명, 이미지를 누르면 주황 점 8개로 크기 조절 (width 속성으로 저장).
- 헤더
  - 왼쪽 위 로고는 public/logo-community.webp(.png) 이미지 (배경 투명, 높이 h-11 / sm:h-13). 360px 미만 관리자 압축 배치에서는 사이트 아이콘.
  - 관리자 그룹은 460px 미만에서 압축 배치되고, 360px 미만에서는 로고 대신 아이콘이 보인다. 320px 에서도 잘리지 않는다.
  - 테마 토글은 CSS dark: 방식으로 동작하며 손잡이가 미끄러진다.
  - 전환은 View Transition(document.startViewTransition)으로 화면 전체를 한 번에 교차 전환한다 (전환 중 html.theme-vt, 손잡이는 view-transition-name 으로 따로 이동).
    지원하지 않는 브라우저는 예전처럼 html.theme-switching 으로 요소별 색 전환을 한다.
- 스크롤바: globals.css 에서 마우스 기기에만 둥근 zinc 색 스크롤바 적용 (--sb-thumb 등 변수, 다크/라이트 자동). 휴대폰은 기본 오버레이 스크롤바.
- 공지 상세 창: 게시글 상세 창처럼 내용 전체를 펼치고 창(배경) 전체를 스크롤한다.
- 프로필 사진: 새 가입자는 항상 기본 사진(사진 없음)으로 시작한다 (DB 트리거).
- 기타
  - 알림: 일반 브라우저는 프로필 빨간점 + 마이 프로필 [알림]만 (파란 토스트는 2026-10-10 에 없앰). Supabase Realtime 을 쓰고, 실패하면 60초마다 확인한다.
    앱(안드로이드/윈도우)은 모든 알림(좋아요·댓글·답글·신고·건의·이의제기)을 OS 알림으로 띄운다 (7~10번).
  - 건의사항, 이의제기, 사이트 얼리기, 공지(서명 기반 다시 보지 않기), 이용약관 첫 동의, 동영상 50MB, 임시보관.
- 회색 보조 글씨(날짜·메타 정보 등): 라이트 모드는 text-zinc-500, 다크 모드는 dark:text-zinc-400 (라이트에서 흐리던 문제로 한 단계 진하게).
  새 UI 에 회색 글씨를 쓸 때도 "text-zinc-500 dark:text-zinc-400" 조합을 쓴다. 큰 장식용 빈 아이콘·기본 프로필 아이콘만 zinc-400 유지.
- 블랙리스트 관련 UI: 라이트 모드에서는 흰 배경과 검은 테두리, 다크 모드에서는 검정으로 표시된다.

## 5. 데이터베이스 (Supabase) – 2026-10-06 SQL 로 추가된 것
- profiles: avatar_url, bio, show_like_count, show_comment_count, notify_post_like, notify_post_comment, notify_comment_reply
  - 컬럼 단위 select/update 권한이 부여되어 있다.
  - 닉네임은 대소문자와 앞뒤 공백을 무시하고 유니크하다 (인덱스 profiles_nickname_ci_key).
  - 가드 트리거: 가입할 때 중복이면 숫자를 붙이고, 수정할 때 중복이면 23505 오류를 낸다.
- posts: report_review_status (null/pending/deleted/dismissed), report_dismissed_at, deleted_at
  - 가드 트리거 trg_sfa_posts_report_guard 가 있어서 제작자·최고관리자만 심사 상태를 바꿀 수 있다.
- post_comments: report_review_status, report_dismissed_at, edited_at
  - 수정·삭제 가드: 작성자는 content 와 image_url 만 바꿀 수 있고, 검토 중이거나 삭제된 댓글은 수정·삭제할 수 없다.
- admin_notifications: target_type, comment_id, comment_preview, reporter_id, resolution, resolved_at, resolved_by_nickname
  - type 값은 report / review_required / auto_deleted(예전 방식 기록)이다.
- 신고 트리거: post_reports·comment_reports 의 예전 트리거는 모두 지웠고 zz_sfa_post_report, zz_sfa_comment_report 로 바꿨다.
  - 신고마다 알림을 남긴다.
  - 같은 사유로 3명이 신고하면 숨기고 review_required 알림을 만든다. 무고 처리한 시점 이후의 신고만 센다.
- RPC 함수: sfa_check_nickname, sfa_set_nickname, sfa_get_profile_stats, sfa_review_report(delete/dismiss), sfa_get_report_details, sfa_is_senior_admin, sfa_is_any_admin
- 알림 트리거: (2026-10-10 SQL 부터) notify_* 설정과 관계없이 알림을 항상 만든다. notify_* 는 앱 OS 알림(푸시)을 띄울지만 정한다.
- Storage avatars 버킷: 누구나 읽을 수 있고, 각 유저는 자기 uid/ 폴더에만 쓸 수 있다.
- 확인 결과 (적용 완료): 닉네임 중복 0, 새 함수 6개 정상. posts 트리거는 trg_sfa_assign_post_no 와 trg_sfa_posts_report_guard 2개뿐이다.
- 예전부터 있던 것들: post_no 자동 번호와 reindex_post_ids(), user_notifications (60일 뒤 자동 정리, Realtime), 댓글 좋아요 수 트리거, profiles.email 외부 조회 차단 등.

- 2026-10-10 SQL: profiles.notify_admin_report/suggestion/appeal, push_tokens(+ sfa_register_push_token/sfa_unregister_push_token),
  푸시 발송 트리거 zz_sfa_push_dispatch(pg_net → Edge Function send-push), sfa_push_build(받는 사람·문구), 비공개 버킷 app-releases(제작자·최고관리자만 읽기),
  admin_notifications·site_suggestions Realtime 등록(RLS 켜진 테이블만). 자세한 내용은 7~8번.

## 6. 주의할 점
- globals.css 의 전역 * transition 규칙은 @layer base 안에 있다. 레이어 밖으로 빼면 Tailwind 의 transition·duration 유틸리티가 전부 무시된다.
- 게시글 HTML 은 반드시 sanitizeHtml/sanitizeDocument 를 거친다. innerHTML 에 문자열을 넣을 때는 escapeHtml 을 쓴다. 게시글 링크는 getPostPath() 로 만든다. 게시글을 바꾸면 emitPostsChanged() 를 호출한다.
- profiles 에 컬럼을 새로 만들면 grant select (새컬럼) on public.profiles to anon, authenticated; 가 필요하다. 수정 가능한 컬럼이면 update 권한도 준다.
- 새 DB 컬럼이나 함수를 쓰는 코드는 SQL 을 아직 안 돌린 상태에서도 사이트가 깨지지 않게, 별도 조회나 오류 무시로 처리한다 (userProfile.ts 방식).
- 피드는 해당 피드 글 전체를 한 번에 불러온다. 글이 1,000개를 넘으면 서버 페이지네이션을 검토한다.
- 프로필 사진·닉네임을 바꾼 뒤 피드 목록에는 최대 1분 정도 예전 값이 보일 수 있다 (아바타 캐시 60초, 피드는 프로필 변경 이벤트를 받지 않음).
- 프로필 창 목록에서 삭제 신청 중인 글은 작성자 본인만 본다. 클랜 피드에서는 관리자에게도 보인다.
- 예전부터 있던 ESLint 경고(effect 안 setState, any 타입, 안 쓰는 import 등)는 남아 있다. 빌드에는 영향이 없다.
- 실기기에서 아직 확인할 것: 색상 고리 터치 드래그, 이미지 크기조절 점 터치, 프로필 사진(GIF) 업로드, 신고 심사 흐름, 앱 전체(9번 실기기 점검 목록).
- 앱 판별(getAppPlatform)은 서버 렌더링 때 항상 null 이다. 앱에서만 다른 화면을 그릴 때는 마운트 후 값(useSyncExternalStore/effect)으로 그려야 hydration 오류가 안 난다.
- 앱 화면은 실서버를 그대로 띄우므로, 사이트 배포만으로 앱 화면이 바뀐다. 앱 껍데기(apps/)는 아이콘·딥링크·플러그인·알림 채널을 바꿀 때만 다시 빌드한다.

## 7. 앱(APK / EXE) – 사용자 결정 사항 (확정)

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

## 8. 앱 – 구조

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

## 8-1. 앱 설정 기록 (모두 완료, 다시 할 때 참고)

Codespaces 터미널에서 한 줄로 실행하는 스크립트 2개로 처리했다 (둘 다 다시 실행해도 안전).
1. `codespaces-setup-secrets.sh`: 서명 키 생성 → GitHub Secrets 6개(ANDROID_KEYSTORE_BASE64/PASSWORD, ANDROID_KEY_ALIAS/PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
   → 서명 키 백업을 Supabase 비공개 버킷 **app-signing-backup** 에 올림 (**절대 지우지 말 것**. 잃으면 앱 업데이트 불가).
   `cd /workspaces/community-web && bash <(git fetch -q origin ccr-d081b1c2-9mjot4 && git show origin/ccr-d081b1c2-9mjot4:apps/android/scripts/codespaces-setup-secrets.sh)`
2. `codespaces-setup-push.sh`: Firebase 파일 2개(google-services.json, 서비스 계정 키) 확인 → Supabase Project URL + 액세스 토큰(sbp_) 입력
   → service_role 키 자동 조회 → 2026-10-10 앱 SQL 이 없으면 관리 API 로 직접 적용 → app-releases 버킷·내려받기 정책 확인/생성
   → send-push 배포(JWT 확인 끔)·비밀 값(PUSH_WEBHOOK_SECRET, FCM_SERVICE_ACCOUNT) 등록·동작 확인 → sfa_set_push_endpoint 로 DB 연결
   → GitHub Secret GOOGLE_SERVICES_JSON → 안드로이드·윈도우 빌드(main, upload) 시작 → 서비스 계정 키 파일 삭제.
   `cd /workspaces/community-web && bash <(git fetch -q origin ccr-d081b1c2-9mjot4 && git show origin/ccr-d081b1c2-9mjot4:apps/android/scripts/codespaces-setup-push.sh)`
- Supabase 액세스 토큰: https://supabase.com/dashboard/account/tokens → Generate new token (설정 후 지워도 됨).
- 로그인 복귀 주소: Supabase → Authentication → URL Configuration → Redirect URLs 에 `sfaclan://auth-callback` (등록 여부는 실기기 로그인으로 확인. 앱 로그인이 사이트로 돌아가 버리면 이것부터 확인).
- Supabase 는 Pro 요금제 (무료 한도 초과로 업그레이드함).
- 서명 인증서: CN=SFAClan, SHA-256 3170a94411a58cdf9ed877d75b565df2382ecad62cf18c69a80d7a51164e2234 (공개 정보, 빌드 로그와 비교용).
- 새 앱 파일 올리기: GitHub → Actions → "앱 빌드 (안드로이드)" / "앱 빌드 (윈도우)" → Run workflow (branch main, upload 체크).
  앱 화면은 실서버를 띄우므로 사이트만 바뀐 경우 다시 빌드할 필요 없음.
- 설치 경고: 안드로이드 "출처를 알 수 없는 앱 허용"·Play 프로텍트 "무시하고 설치", 윈도우 SmartScreen "추가 정보 → 실행".

## 8-2. 확인한 것 / 못 한 것

확인함
- 사이트: tsc, eslint(기존 오류만 남음, 새 오류 없음), next build. Playwright + 가짜 Supabase 로 마이 프로필·알림·알림 설정·앱 다운로드·개인 설정 화면 (320/360/448px, 라이트/다크),
  가짜 Tauri 환경에서 이 기기·창 닫기 섹션, 창 닫기 팝업, 앱 이벤트 연결 순서 (listen → sfa_app_ready → sfa_take_pending).
- 가짜 Capacitor 환경에서 권한 요청 1회, FCM 등록·토큰 저장 RPC, 앞에 있을 때 푸시 → 로컬 알림, 뒤로가기, 로그아웃 순서(토큰 해제 → 로그아웃).
- SQL: 로컬 PostgreSQL 16 에서 2회 연속 실행, 알림 끄기여도 알림 저장됨, 받는 사람(제작자 이메일·최고관리자·신고자 제외·설정 꺼짐), 권한(일반 유저는 비밀 함수 호출 불가), 버킷 정책.
- Edge Function: deno check/lint, 가짜 FCM 으로 보내기·토큰 정리·재시도.
- CI: 안드로이드 APK, 윈도우 NSIS 설치 파일 실제 빌드 성공 (GitHub Actions).
- 별도 검토 단계(보안·사이트 흐름·연결 계약·CI·네이티브 동작)에서 확인된 문제 7건은 모두 수정함.

- 실제 환경: Supabase 에 SQL 적용, send-push 동작 확인(잘못된 요청 400 응답), 서명 APK·윈도우 설치 파일 빌드·업로드 성공 (2026-10-11).

아직 못 함 (실기기 필요)
- 실제 폰·PC 에서 설치·로그인·알림(FCM 실제 도착 포함)·창 크기·트레이.

## 9. 실기기 점검 목록 (다음에 할 일)

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

## 10. 앱 – 알려진 제한 / 참고

- 윈도우 앱을 완전히 닫으면 알림이 오지 않는다 (트레이로 내리면 계속 옴). 앱이 꺼진 뒤 예전 알림을 눌러도 해당 글로 이동하지 않을 수 있음.
- Firebase 없이 빌드한 안드로이드 앱은 앱이 떠 있는 동안만 알림 (기기 절전 정책에 따라 뒤로 보낸 상태에서는 늦거나 안 올 수 있음).
- 같은 글에 좋아요 → 취소 → 다시 좋아요를 하면 (알림을 읽기 전이면) 푸시가 다시 갈 수 있다. 이미 읽은 좋아요 알림이 다시 살아나는 경우(UPDATE)는 푸시하지 않는다.
- 안드로이드 앱에서는 사이트의 HTTP 오류 페이지(404 등)도 Capacitor 가 연결 실패 화면으로 바꿔 보여 준다.
- 사이트 쪽 같은 사이트 새 창(target=_blank) 링크는 윈도우 앱에서 권한 없는 보조 창으로 열린다 (앱 알림·로그인 불가, 일반 웹페이지처럼 동작).
- 서명 키(p12)를 잃어버리면 같은 앱으로 업데이트가 안 된다 (지우고 새로 설치해야 함).
- 앱 껍데기를 바꾸면(apps/) push 때 확인용 빌드가 자동으로 돈다. 실제 배포 파일은 수동 실행으로만 올라간다.
- 앱 판별은 서버 렌더링에서 항상 null → 앱 전용 화면 요소는 마운트 후에만 그린다 (6번).

## 11. 남은 일 / 아이디어
- **실기기 점검(9번) 결과 반영.**
- 고해상도 로고로 앱 아이콘 다시 만들기 (8번 '아이콘' 참고).
- (나중에) 일반 브라우저 웹 푸시: 같은 서버 구조(push_tokens platform 'web', sfa_push_build) 재사용 가능. 지금은 하지 않기로 함.
- (선택) 사이트가 최신 앱 버전을 알려 주고 오래된 앱이면 "새 버전 받기" 안내 (latest.json 의 version/build 활용).
- (나중에) 모든 유저에게 앱 다운로드 공개 (알림 구조는 이미 전체 유저 기준).
- 계정 탈퇴 기능은 지금 건의사항이나 이메일로 요청받는 방식이다 (개인정보처리방침에 명시).
- 모달 등장 애니메이션(animate-in 계열)은 플러그인이 없어 동작하지 않는다. 필요하면 키프레임을 직접 추가한다.
