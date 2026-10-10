# send-push (앱 푸시 발송 Edge Function)

새 알림(좋아요·댓글·답글), 신고, 건의사항, 이의제기가 DB 에 저장되면
DB 트리거(`sfa_push_dispatch`)가 pg_net 으로 이 함수를 부르고, 이 함수가 안드로이드 앱(FCM)에 푸시를 보냅니다.

- `index.ts` 한 파일, import 없음 → Supabase 대시보드 편집기에 그대로 붙여넣어 배포할 수 있습니다.
- 받는 사람·문구·알림 설정 반영은 DB 함수 `sfa_push_build` 가 계산합니다 (`supabase/sfaclan_update_2026-10-10_app.sql`).
- 앱을 쓰지 않는 회원(등록된 기기가 없는 회원)의 알림에는 이 함수가 아예 호출되지 않습니다.

## 1회 설정 순서

1. **SQL 실행**: `supabase/sfaclan_update_2026-10-10_app.sql` 전체를 SQL Editor 에서 실행
   (Database → Extensions 에서 `pg_net` 이 켜져 있는지 확인. SQL 이 자동으로 켜 보고, 안 되면 직접 켜기)
2. **Firebase 서비스 계정 키**: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성" → JSON 파일 받기
   (앱의 `google-services.json` 과 **같은 Firebase 프로젝트**여야 함. 이 파일은 절대 저장소에 올리지 않기)
3. **함수 배포** (둘 중 하나)
   - 대시보드: Edge Functions → Deploy a new function → Via Editor → 이름 `send-push` → `index.ts` 내용 붙여넣기 → Deploy
     → 배포 후 함수 Details/Settings 에서 **Enforce JWT verification(Verify JWT) 끄기** → Save
   - CLI: `supabase functions deploy send-push --no-verify-jwt --project-ref <project-ref>`
4. **Secrets 등록**: Edge Functions → Secrets (Manage secrets)
   - `PUSH_WEBHOOK_SECRET` = SQL Editor 에서 `select public.sfa_get_push_secret();` 결과 값
   - `FCM_SERVICE_ACCOUNT` = 2번에서 받은 JSON 파일 내용 전체 (base64 로 인코딩해서 넣어도 됨)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 자동으로 넣어 주므로 등록하지 않음
5. **푸시 주소 연결**: SQL Editor 에서
   `select public.sfa_set_push_endpoint('https://<project-ref>.supabase.co/functions/v1/send-push');`
   (푸시를 잠시 끄려면 `select public.sfa_set_push_endpoint(null);`)

## 확인 방법

- 안드로이드 앱(Firebase 포함 빌드)에 로그인한 뒤 다른 계정으로 그 계정의 글에 좋아요/댓글
- SQL Editor: `select id, status_code, left(content::text, 200), error_msg, created from net._http_response order by created desc limit 20;`
  - `{"sent":1,"failed":0,"dropped":0}` → 정상
  - 401 `unauthorized` → `PUSH_WEBHOOK_SECRET` 값이 `sfa_get_push_secret()` 과 다름
  - 500 `not_configured` → Secrets 누락 또는 `FCM_SERVICE_ACCOUNT` 형식 오류 (함수 Logs 에 이유가 한국어로 나옴)
- 함수 Logs 에는 비밀값·토큰을 남기지 않습니다.

## 응답

| 상황 | 상태 | 내용 |
|---|---|---|
| 정상 | 200 | `{ sent, failed, dropped }` (보낼 기기가 없으면 `skipped` 사유 포함) |
| POST 가 아님 | 405 | `{ error: "method_not_allowed" }` |
| 비밀값 불일치 | 401 | `{ error: "unauthorized" }` |
| 잘못된 요청 | 400 | `{ error: "invalid_json" \| "invalid_target" }` |
| 설정 누락 | 500 | `{ error: "not_configured", message }` |

- `dropped`: 앱 삭제·재설치 등으로 FCM 이 거부한 토큰 (DB 에서 자동 삭제, 앱이 다음 실행 때 다시 등록)
