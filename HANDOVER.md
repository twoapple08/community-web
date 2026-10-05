# SFAClan 인수인계 프롬프트 (2026-10-05 기준)

> 이 문서 전체를 새 AI 세션의 첫 메시지로 붙여넣으면 됩니다.
> 코드 저장소: `twoapple08/community-web` (GitHub) / 실서버: https://www.sfaclan.com

---

## 0. AI 에게 주는 작업 규칙 (반드시 지킬 것)

1. **바꾸라고 한 것 외에는 화면·동작이 눈으로 보기에 완전히 똑같아야 한다.** 코드는 바뀌어도 되지만 디자인/배치/문구/동작은 그대로.
2. **새 팝업은 브라우저 기본 팝업(alert/confirm/prompt) 금지.** 사이트 전용 직각 팝업(`src/components/CustomPopup.tsx`) 또는 같은 디자인 계열로 만든다.
3. **사용자는 모바일로 작업한다.** 결과물은 "GitHub Codespaces 터미널에 붙여넣기만 하면 되는 명령"으로 준다.
4. 마지막에는 항상 **에러 검사(빌드) → 통과 시에만 실서버 배포(main push)** 하는 명령을 준다. 빌드 실패 시 push 하면 안 된다(`set -e` 또는 `&&` 연결).
5. AI 가 혼자 처리할 수 있는 건 직접 처리하고, 사용자가 해야 할 일(Supabase 대시보드 작업 등)은 순서대로 정리해서 알려준다.
6. 질문이나 필요한 자료가 있으면 먼저 물어본다.
7. 답변은 한국어로 한다.
8. 이 저장소의 Next.js 는 16 버전(학습 데이터와 다름). 코드를 쓰기 전에 `node_modules/next/dist/docs/` 문서를 확인한다. (`AGENTS.md` 참고)

---

## 1. 프로젝트 개요

- **사이트**: 스틱파이터 커뮤니티 (SFAClan) – 클랜 홍보(클랜 피드) + 유저 자유 소통(커뮤니티 피드)
- **타깃**: 모바일 퍼스트, 다크/라이트 모드, 직각(`rounded-none`) 팝업 + 라운드스퀘어 카드 디자인
- **제작자 계정**: iwsamuel08@gmail.com (코드에는 평문 대신 SHA-256 해시로만 비교 – `src/lib/roles.ts`)
- **권한 등급**: 제작자(creator, 빨간 왕관) > 최고관리자(super_admin, 주황 왕관) > 일반관리자(admin, 흰 왕관) > 일반회원

## 2. 기술 스택 / 인프라

- Next.js **16.3.8** (App Router, Turbopack), React **19.2.8**, Tailwind CSS **v4** (`@import "tailwindcss"`, `@variant dark (&:where(.dark, .dark *))`)
- `@tailwindcss/typography` **미설치** → `prose` 클래스는 `globals.css` 의 직접 작성 규칙만 적용됨
- Supabase: PostgreSQL + RLS, Storage, Auth(Google OAuth, **PKCE 방식**), Realtime
- 에디터: TipTap v3 (StarterKit, Image, Table, TextAlign + 직접 만든 Mark/Node)
- 아이콘: lucide-react 1.49
- 배포: GitHub `main` 브랜치 push → **Vercel 자동 배포**
- Supabase 클라이언트: `src/lib/supabase.ts` (세션 저장 키 `sfaclan_auth_session`, `flowType: 'pkce'`)
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Vercel 에 설정됨, 저장소에는 없음)

## 3. 폴더 구조 (핵심만)

```
src/app/
  layout.tsx              루트 레이아웃(클라이언트 컴포넌트) – 헤더, 테마 토글, 로그인, OG 메타태그,
                          알림 빨간점/실시간 토스트, 마이메뉴/관리자/블랙리스트/약관 모달
  page.tsx                / → 로그인 처리 끝난 뒤 /community 로 이동 (인증 파라미터 제거)
  globals.css             전역 스타일 (모바일 112% 스케일, 본문 서식, 한글 줄바꿈 등)
  community/layout.tsx    커뮤니티 피드 목록을 "레이아웃"에 둠 → 글 열고 닫아도 목록 유지
  community/page.tsx      null (목록은 layout 이 그림)
  community/[id]/page.tsx 게시글 상세 모달 (id = 피드별 번호 post_no)
  clan/...                위와 동일 구조 (클랜 피드)
  write/page.tsx          글쓰기 (게시판/태그 선택, 썸네일 선택, 임시보관, 블랙리스트 차단+이의제기)
  posts/[id]/page.tsx     옛 주소 호환 → 새 주소로 자동 이동
  api/link-preview/       카톡 오픈채팅/디스코드/일반 링크 제목 조회 (SSRF 차단, 엣지 캐시)
src/components/
  CommunityFeed.tsx / ClanFeed.tsx   피드 목록 (목록형/피드형/앨범형, 정렬, 검색, 필터, 페이지)
  PostModal.tsx           게시글 상세 (본문 정화+임베드 변환, 좋아요, 공유, 수정/삭제/삭제신청, 신고)
  CommentsSection.tsx     댓글/답글 (이미지 첨부, 좋아요, 신고, 답글 기본 접힘)
  Editor.tsx              TipTap 리치 에디터 (서식/표/기호/링크/이미지/동영상 50MB)
  UserHubModal.tsx        마이 메뉴 (알림, 닉네임, 건의사항/건의함, 내 글, 좋아요 글, 이의제기 관리, 제작자 콘솔)
  NoticeBanner.tsx        공지 배너/팝업/수정
  AdminModal.tsx          관리자 지정 / AdminReportModal.tsx 신고 기록 / BlacklistModal.tsx 블랙리스트
  AdminReplyPopup.tsx     블랙리스트 유저에게 관리자 답장 팝업
  CustomPopup.tsx         사이트 전용 직각 팝업 (alert/confirm 대체)
  FeedMedia.tsx           피드형 썸네일 (세로 1.7배 이상 → 3:4 크롭)
  CrownIcon.tsx, FreezeModal.tsx, ReportModal.tsx, TermsModal.tsx
src/lib/
  roles.ts        제작자 판별(해시), 내 권한/전체 권한맵 조회 캐시
  authUrl.ts      주소창의 로그인 코드/토큰 제거, 공유용 깨끗한 주소
  sanitizeHtml.ts 게시글 HTML 보안 정화 (XSS 차단), escapeHtml
  postRoute.ts    피드별 번호(post_no) 주소 생성/조회 (post_no 없으면 id 로 대체)
  feedStore.ts    피드 목록 캐시 + 게시글 변경 이벤트(좋아요/수정/삭제 → 목록 반영)
  notifications.ts 알림 조회/읽음/삭제/문구/이동 주소
  htmlText.ts     미리보기 텍스트/썸네일/이미지 수 추출 (HTML 엔티티 복원)
  imageCompress.ts 업로드 전 큰 사진 자동 축소 (본문 2560px, 댓글 1600px, GIF 원본 유지)
  clipboard.ts    복사 (카톡 인앱브라우저 대비 폴백)
  koreanUtils.ts  을/를, 이/가, 으로/로 조사 처리
  videoUtils.ts   동영상 첫 프레임 썸네일 캡처
supabase/sfaclan_update_2026-10-05.sql   이번 업데이트 DB 변경 SQL (아래 6번)
deploy_sfaclan_update.sh                 빌드 검사 후 main 배포 스크립트
```

루트에 있는 수많은 `fix_*.sh`, `update_*.sh` 파일과 `project_codebase.txt` 는 과거 작업 기록이며 현재 동작에 쓰이지 않는다.

## 4. 주요 기능 정리

- **피드 2종**: 클랜 피드(`/clan`, 댓글 없음, 공식/비공식 필터, 태그 필터, 공식글 삭제신청→관리자 심사) / 커뮤니티 피드(`/community`, 게시판 9종, 댓글)
- **보기 모드 3종**: 목록형 / 피드형 / 앨범형, `localStorage` 키 `sfa_global_view_mode` 로 두 피드 공통 저장. 드롭다운은 버튼이 화면 왼쪽 절반이면 오른쪽으로, 오른쪽이면 왼쪽으로 펼침
- **정렬**: 최신순/인기순(좋아요)/오래된순 – 클라이언트에서 정렬. 검색/필터/정렬 바뀌면 1페이지로
- **페이지당 개수**: `user_posts_per_page` (10~50)
- **게시글 주소**: `/clan/{post_no}`, `/community/{post_no}` – 피드별로 1번부터. 기존 글은 post_no = 기존 id
- **게시글 번호 초기화**(제작자 콘솔): RPC `reindex_post_ids()` → 피드별로 올린 순서대로 1번부터 재정렬 (내부 id 는 안 바꿈)
- **스마트 임베드**: 카톡 오픈채팅/디스코드 초대 링크 → 전용 카드(실제 방/서버 이름 표시, `embed_title_{url}` 캐시, 수정 저장 시 `data-embed-title` 로 HTML 에 각인), 유튜브 → 16:9 플레이어
- **댓글**: 답글(@닉네임), 이미지/GIF, 좋아요(수는 DB 트리거가 계산), 신고, 답글 기본 접힘. 최신순 = 새 댓글이 위
- **알림(전 유저)**: 내 글에 좋아요/댓글, 내 댓글에 답글 → 프로필 버튼 빨간점 + 상단 파란 토스트(클릭 시 해당 글) + 마이메뉴 [알림] (모두 읽음 / 읽은 알림 삭제). Supabase Realtime 수신, 실패 시 60초 확인
- **건의사항**: 일반유저 → 마이메뉴 노란 테두리 카드에서 전송(`site_suggestions`). 제작자는 [건의함] (미확인 시 빨간점, 읽은 건의 전체삭제)
- **관리자 전용 메시지(이의제기)**: 블랙리스트 유저 소명 → 제작자/최고관리자 처리 (해제/유지 + 답장). 대기 건 있으면 빨간점
- **신고**: 게시글 신고 3회 누적 시 자동 삭제(DB 트리거), 신고 기록 모달(관리진), 복구/영구삭제
- **사이트 얼리기**(제작자): `site_notices.is_frozen` – 일반 유저 글쓰기/좋아요/신고 등 차단 팝업
- **공지**: 내용 서명(`title:::content`)으로 "다음 갱신까지 보지 않기", 같은 접속 중에는 자동 팝업 1회만
- **이용약관**: 첫 로그인 시 동의 (`profiles.terms_agreed`)
- **동영상**: `post-videos` 버킷, 50MB 제한(사전 안내 팝업), 첫 프레임 썸네일 자동 캡처
- **임시보관**: `post_drafts` (유저당 1개)

## 5. 디자인 규칙

- 팝업: 직각(`rounded-none`), 라이트=흰 배경+검은 테두리 / 다크=검은 배경+흰 테두리 (`CustomPopup` 기준)
- 카드/버튼: 피드 카드는 `rounded-2xl`, 버튼 다수 `rounded-xl`
- **블랙리스트 관련 UI(블랙 버튼, 블랙리스트 관리, 이의제기 상세, 관리자 답장)는 `!bg-black` 으로 라이트 모드에서도 검정 고정 (의도된 디자인)**
- 강조색: 커뮤니티=파랑(blue-600), 클랜=초록(emerald-600), 건의=노랑(yellow-400), 신고=빨강/로즈
- 모바일: `@media (max-width: 640px) { html { font-size: 112% } }` 등 가독성 스케일업
- 다크/라이트: 새 UI 를 만들 때 반드시 `bg-xxx dark:bg-yyy` 처럼 두 모드 모두 지정
- 첫 화면 테마 깜빡임 방지: `layout.tsx` 의 인라인 테마 스크립트
- OG(카톡/디코 미리보기): 제목 "스틱파이터 커뮤니티", 설명 "유저들과 소통하고 클랜을 홍보하세요", 이미지 `/icon.png?v=3`

## 6. 데이터베이스 (Supabase)

주요 테이블: `posts`(id, post_no, title, content, author_id, feed_type, board_category, tags, thumbnail_url, is_preview_hidden, likes_count, comments_count, is_official, is_deleted, delete_requested, delete_reason, created_at), `post_likes`, `post_comments`(parent_id, likes_count, image_url), `comment_likes`, `post_reports`, `comment_reports`, `admin_notifications`, `profiles`(nickname, terms_agreed), `user_roles`(user_id, email, role), `blacklists`, `blacklist_appeals`, `site_suggestions`, `site_notices`(id=1, is_frozen), `post_drafts`, **`user_notifications`(신규)**

기존 트리거: `trg_post_comments_count`(댓글 수), 신고 3회 자동삭제 등
RLS 는 `auth.users` 직접 조회 대신 `auth.jwt() ->> 'email'` 사용 (권한 에러 방지)

**이번 업데이트 SQL** `supabase/sfaclan_update_2026-10-05.sql` (여러 번 실행해도 안전):
1. `posts.post_no` + 피드별 유니크 인덱스 + 자동 번호 트리거 + `reindex_post_ids()` 재작성(제작자만 실행 가능)
2. 댓글 좋아요 수 DB 트리거 계산, 댓글 수정은 작성자만
3. `user_notifications` 테이블 + RLS + 좋아요/댓글/답글 알림 트리거 + Realtime 등록(60일 지난 알림 자동 정리)
4. 조회 속도용 인덱스
5. 다른 사람의 `profiles.email` 조회 차단 (위험하면 자동 건너뜀)

## 7. 이번 작업(2026-10-05)에서 해결한 것

| 과제 | 해결 내용 |
|---|---|
| 공유 시 다른 계정으로 로그인/이메일 유출 | 원인1: implicit 로그인이라 주소에 `#access_token` 이 남음 → PKCE 전환 + 주소 정리 + 공유 주소 정리. 원인2: 본문 XSS 구멍 → HTML 정화 |
| 다크→라이트 미전환 | 건의사항/닉네임 입력, 글쓰기 화면, 에디터 이미지 버튼, 수정/삭제창, 약관 창 수정 + 첫 화면 깜빡임 제거 |
| 임베드 미리보기 문구 | 변경 완료 |
| 알림 기능 | 위 4번 참고 |
| 최적화 | 글 열고 닫을 때 목록 재조회 제거, 목록/권한/공지 캐시, 5초 폴링 제거, 이미지 지연로딩·자동축소, 링크 제목 디바운스·엣지캐시, 인덱스 |
| 정렬 버튼 | 동작하도록 수정 |
| 번호 재정렬 | 피드별로 따로 |
| 잔버그 | 한글 줄바꿈, 글머리/번호/인용/코드블록 표시, 넓은 표 잘림, `&amp;` 표시, alert/confirm 제거, 뒤로가기 시 글 재오픈, 삭제글 직접 링크 노출, 에디터 최소 높이 등 |

브랜치: `claude/sfaclan-analysis-bugfix-hqiocr` (기준: 커밋 f1b8d04 – 그 이후 main 의 4개 커밋 src 변경은 되돌림)

## 8. 현재 상태 / 남은 일 (중요)

- [ ] **빌드 검사 미실행**: 이전 AI 세션에서 권한 문제로 `npm run build` 를 돌리지 못했다. 다음 세션은 먼저 `npm ci && npx tsc --noEmit && npm run build` 로 에러를 확인하고 고칠 것.
- [ ] **Supabase SQL 실행** (코드 배포 전에): SQL Editor 에 `supabase/sfaclan_update_2026-10-05.sql` 전체 실행
- [ ] **Supabase Auth → URL Configuration → Redirect URLs** 에 `https://www.sfaclan.com/**`, `https://sfaclan.com/**` 확인/추가
- [ ] **배포**: Codespaces 에서
  ```bash
  cd /workspaces/community-web && git fetch origin claude/sfaclan-analysis-bugfix-hqiocr && git show origin/claude/sfaclan-analysis-bugfix-hqiocr:deploy_sfaclan_update.sh | bash
  ```
  (Vercel 에서 예전에 Rollback 했다면 새 배포를 Promote to Production)
- [ ] 카톡 미리보기 캐시 초기화: https://developers.kakao.com/tool/debugger/sharing
- [ ] 링크를 공유했던 유저들에게 "한 번 로그아웃 후 재로그인" 공지 (유출 세션 무효화)
- [ ] 사용자에게 확인 대기 중인 질문:
  1. 블랙리스트 관련 검정 UI 도 라이트 모드에 맞출지
  2. 알림 입구를 헤더 종 아이콘으로 따로 둘지 (현재: 프로필 빨간점 + 마이메뉴)
  3. 댓글 삭제 시 확인 팝업 추가할지

## 9. 앞으로 주의할 점

- 피드는 아직 해당 피드의 **글 전체를 한 번에** 불러온다. 글이 1,000개를 넘어가면 서버 페이지네이션/검색으로 바꾸는 것을 검토할 것.
- 새 게시글 링크는 반드시 `getPostPath()` (`src/lib/postRoute.ts`) 로 만들 것 (id 직접 사용 금지).
- 게시글 HTML 을 화면에 넣을 때는 반드시 `sanitizeHtml`/`sanitizeDocument` 를 거칠 것. innerHTML 템플릿에 문자열을 넣을 때는 `escapeHtml`.
- 게시글을 수정/삭제/좋아요 하면 `emitPostsChanged()` 로 목록에 알릴 것.
- `profiles` 에 컬럼을 새로 추가하면, SQL 5단계가 적용된 경우 `grant select (새컬럼) on public.profiles to anon, authenticated;` 가 필요하다.
- 제작자 이메일을 코드에 평문으로 쓰지 말고 `isCreatorEmail()` 사용.
