# SFAClan 인수인계 프롬프트 (2026-10-06 기준)

> 사용법: 이 파일 전체를 새 AI 세션의 첫 메시지로 붙여넣거나, "저장소의 HANDOVER.md 를 먼저 읽어줘" 라고 요청.

코드 저장소: twoapple08/community-web (GitHub) / 실서버: https://www.sfaclan.com
현재 main 최신 커밋: b1c1ae6 이후 (작업 브랜치 ccr-70abf057-unrbxz 를 main 에 합쳐 배포한 상태)

## 0. AI 작업 규칙 (반드시 지킬 것)
- 바꾸라고 한 것 외에는 화면·동작이 눈으로 보기에 완전히 똑같아야 한다. 코드는 바뀌어도 되지만 디자인/배치/문구/동작은 그대로 둔다.
- 브라우저 기본 팝업(alert/confirm/prompt)은 쓰지 않는다. 사이트 전용 직각 팝업(src/components/CustomPopup.tsx)이나 같은 디자인 계열을 쓴다. 라운드 스퀘어도 가능하다.
- 사용자는 모바일 또는 PC(VS Code + Git Bash, Node.js 설치)로 작업한다.
- 결과물은 "붙여넣기만 하면 되는 명령"으로 준다. 마지막에는 항상 에러 검사(타입 검사 + 빌드)를 통과해야만 실서버에 배포(main push)되는 명령을 준다.
- 실서버 배포(main push)는 사용자가 직접 한다. AI는 작업 브랜치에 커밋·푸시까지만 하고 배포 명령을 알려준다. npx tsc --noEmit 은 실행해도 된다.
- AI가 혼자 처리할 수 있는 건 직접 처리하고, 사용자가 해야 할 일(Supabase 작업 등)은 순서대로 정리해서 알려준다.
- 복붙만으로 끝나는 작업(SQL 실행, 배포, 공지 작성, 실기기 확인)은 사용자에게 넘겨 토큰을 아낀다. 사용자가 할 일 안내는 모든 작업이 끝난 뒤 한 번에 한다.
- 질문이나 필요한 자료가 있으면 먼저 물어본다. 답변은 한국어로 한다.
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
  AppShell.tsx          헤더(테마 토글, 글쓰기, 프로필, 관리자, 블랙, 로그아웃), 알림 토스트·실시간, 전역 모달, 하단 푸터
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
  UserHubModal.tsx      마이 프로필 (+ userhub/SettingsView, MyCommentsView, CreditsPopup)
  AdminReportModal.tsx + ReportReviewModal.tsx  신고 기록·심사
  AdminModal, BlacklistModal, AdminReplyPopup, NoticeBanner, TermsModal, CustomPopup, CrownIcon, FreezeModal, ReportModal, FeedMedia
src/lib/
  userProfile.ts   프로필 열기/닫기(pushState), 공개프로필·통계·아바타맵, 닉네임 변경, 사진 업로드, 설정 저장, 토스트 설정
  embeds.ts        카톡/디코/유튜브 판별·캐시·임베드 HTML (채움형 디자인)
  colorUtils.ts    색 변환, 글씨색·테두리·글로우 CSS, 즐겨찾기 색(localStorage)
  notifications.ts 알림 조회·문구·이동 경로(resolveNotificationPath, commentAnchor)
  roles.ts, authUrl.ts, sanitizeHtml.ts, postRoute.ts, feedStore.ts, htmlText.ts, imageCompress.ts, clipboard.ts, koreanUtils.ts, videoUtils.ts
supabase/
  sfaclan_update_2026-10-05.sql  지난 업데이트 (적용 완료)
  sfaclan_update_2026-10-06.sql  이번 업데이트 (적용 완료, 여러 번 실행해도 안전)
deploy_sfaclan_update.sh         빌드 검사 후 main 배포 스크립트
```
루트의 수많은 fix_*.sh, update_*.sh, project_codebase.txt 는 과거 기록이며 현재 동작에 쓰이지 않는다.

## 4. 주요 기능
- 피드 2종: 클랜 피드(/clan, 댓글 없음, 공식/비공식·태그 필터, 공식글 삭제신청 → 관리자 심사)와 커뮤니티 피드(/community, 게시판 9종, 댓글).
- 보기 모드 3종: 목록형·피드형·앨범형. localStorage 키 sfa_global_view_mode 로 두 피드가 같이 쓴다.
  - 본문 미리보기는 피드형에서만 보인다 (2줄, 내용이 없으면 숨김). 목록형·앨범형은 제목과 사진만 보인다.
- 정렬: 최신순/인기순/오래된순. 한 페이지에 10~50개 표시. 게시글 주소는 피드별 번호(post_no)를 쓴다.
- 프로필: 닉네임(목록·게시글·댓글)을 누르면 ?profile=ID 창이 뜨고, 뒤로가기로 닫힌다.
  - 닉네임, 왕관, 한 줄 소개, 통계(쓴 글 / 누른 좋아요 / 댓글 수, 비공개 설정 시 "비공개"), 작성한 게시글 목록을 보여준다.
  - 피드형 원형 칸, 게시글 머리, 댓글에는 프로필 사진이 있을 때만 표시한다.
- 마이 프로필(구 마이 메뉴)
  - 상단 카드를 누르면 내 프로필이 열린다.
  - 메뉴: 알림, 개인 설정(톱니바퀴), 건의사항/건의함, 내가 쓴 게시글, 좋아요 누른 게시글, 내가 쓴 댓글, 관리자 전용 메시지, 제작자 콘솔.
  - 맨 아래에 ⓘ 크레딧과 개인정보처리방침 링크가 있다.
- 개인 설정
  - 프로필 사진: 호버/탭 시 카메라 아이콘, GIF 가능, 5MB 이하, avatars 버킷, "기본 이미지로" 버튼.
  - 닉네임: 중복 불가, 실시간 중복 확인, 최대 15자.
  - 한 줄 소개(60자), 누른 좋아요 수·쓴 댓글 수 공개 토글.
  - 알림 토글(좋아요/댓글/답글)과 새 알림 팝업 표시(기기별 localStorage sfa_notify_toast).
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
  - [형광펜 상세 편집], 툴바 맨 오른쪽 ? 도구 설명, 이미지를 누르면 주황 점 8개로 크기 조절 (width 속성으로 저장).
- 헤더
  - 관리자 그룹은 460px 미만에서 압축 배치되고, 360px 미만에서는 로고 대신 아이콘이 보인다. 320px 에서도 잘리지 않는다.
  - 테마 토글은 CSS dark: 방식으로 동작하며 손잡이가 미끄러진다. 전환 중에는 html.theme-switching 이 붙는다.
- 기타
  - 알림: 프로필 빨간점 + 파란 토스트 + 마이 프로필 [알림]. Supabase Realtime 을 쓰고, 실패하면 60초마다 확인한다.
  - 건의사항, 이의제기, 사이트 얼리기, 공지(서명 기반 다시 보지 않기), 이용약관 첫 동의, 동영상 50MB, 임시보관.
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
- 알림 트리거: 받는 사람의 notify_* 설정이 꺼져 있으면 알림을 만들지 않는다.
- Storage avatars 버킷: 누구나 읽을 수 있고, 각 유저는 자기 uid/ 폴더에만 쓸 수 있다.
- 확인 결과 (적용 완료): 닉네임 중복 0, 새 함수 6개 정상. posts 트리거는 trg_sfa_assign_post_no 와 trg_sfa_posts_report_guard 2개뿐이다.
- 예전부터 있던 것들: post_no 자동 번호와 reindex_post_ids(), user_notifications (60일 뒤 자동 정리, Realtime), 댓글 좋아요 수 트리거, profiles.email 외부 조회 차단 등.

## 6. 주의할 점
- globals.css 의 전역 * transition 규칙은 @layer base 안에 있다. 레이어 밖으로 빼면 Tailwind 의 transition·duration 유틸리티가 전부 무시된다.
- 게시글 HTML 은 반드시 sanitizeHtml/sanitizeDocument 를 거친다. innerHTML 에 문자열을 넣을 때는 escapeHtml 을 쓴다. 게시글 링크는 getPostPath() 로 만든다. 게시글을 바꾸면 emitPostsChanged() 를 호출한다.
- profiles 에 컬럼을 새로 만들면 grant select (새컬럼) on public.profiles to anon, authenticated; 가 필요하다. 수정 가능한 컬럼이면 update 권한도 준다.
- 새 DB 컬럼이나 함수를 쓰는 코드는 SQL 을 아직 안 돌린 상태에서도 사이트가 깨지지 않게, 별도 조회나 오류 무시로 처리한다 (userProfile.ts 방식).
- 피드는 해당 피드 글 전체를 한 번에 불러온다. 글이 1,000개를 넘으면 서버 페이지네이션을 검토한다.
- 프로필 사진·닉네임을 바꾼 뒤 피드 목록에는 최대 1분 정도 예전 값이 보일 수 있다 (아바타 캐시 60초, 피드는 프로필 변경 이벤트를 받지 않음).
- 프로필 창 목록에서 삭제 신청 중인 글은 작성자 본인만 본다. 클랜 피드에서는 관리자에게도 보인다.
- 예전부터 있던 ESLint 경고(effect 안 setState, any 타입, 안 쓰는 import 등)는 남아 있다. 빌드에는 영향이 없다.
- 실기기에서 아직 확인할 것: 색상 고리 터치 드래그, 이미지 크기조절 점 터치, 프로필 사진(GIF) 업로드, 신고 심사 흐름.

## 7. 남은 일 / 아이디어
- 사용자 실기기 점검 결과 반영.
- 계정 탈퇴 기능은 지금 건의사항이나 이메일로 요청받는 방식이다 (개인정보처리방침에 명시).
- 모달 등장 애니메이션(animate-in 계열)은 플러그인이 없어 동작하지 않는다. 필요하면 키프레임을 직접 추가한다.
