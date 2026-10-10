-- =====================================================================
--  SFAClan 업데이트 SQL (2026-10-10) - 앱(APK/EXE) 알림 · 푸시 · 앱 다운로드
--  사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
--  * 여러 번 실행해도 안전합니다. (이미 적용된 부분은 건너뜀)
--  * 반드시 "코드 배포 전에" 먼저 실행해 주세요.
--  * 2026-10-05, 2026-10-06 업데이트 SQL 이 먼저 적용되어 있어야 합니다.
--
--  주요 내용
--   1. 관리자 알림 설정 (신고 / 건의함 / 이의제기 → 앱 OS 알림 받기)
--   2. 알림 설정 의미 변경: 꺼 두어도 알림은 그대로 저장됨 (빨간 점·[알림] 목록 유지)
--      → 설정은 이제 "앱의 OS 알림(휴대폰 상단 / 윈도우 오른쪽 아래)을 띄울지"만 정함
--   3. 앱 푸시 토큰 저장소 (push_tokens) + 등록 / 해제 함수
--   4. 푸시 발송 설정 (푸시 서버 주소 / 비밀값 - 관리용 계정만 읽기·쓰기 가능)
--   5. 푸시 문구 · 받는 사람 계산 함수 (푸시 서버 Edge Function 전용)
--   6. 새 알림 / 신고 / 건의사항 / 이의제기가 생기면 푸시 서버(send-push)를 부르는 트리거 (pg_net)
--   7. 실시간(Realtime) 대상 테이블 추가 (관리자 알림 / 건의함)
--   8. 앱 설치 파일 저장소 (app-releases 버킷, 비공개 - 제작자·최고관리자만 다운로드)
--
--  [푸시 1회 설정] 맨 아래 "푸시 1회 설정" 참고 (Edge Function send-push 배포 후 실행)
--   * 설정 전에는 푸시만 안 갈 뿐, 사이트와 앱의 다른 기능은 모두 정상 동작합니다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 관리자 알림 설정 (계정 단위, 앱 OS 알림만 제어)
--    notify_admin_report     : 신고 접수 / 신고 검토 필요 (제작자·최고관리자)
--    notify_admin_suggestion : 새 건의사항 (제작자)
--    notify_admin_appeal     : 블랙리스트 이의제기 (제작자·최고관리자)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists notify_admin_report boolean default true;
alter table public.profiles add column if not exists notify_admin_suggestion boolean default true;
alter table public.profiles add column if not exists notify_admin_appeal boolean default true;

-- profiles 는 '컬럼별 조회 권한' 방식일 수 있으므로 새 컬럼도 명시적으로 허용 (2026-10-06 과 같은 방식)
grant select (notify_admin_report, notify_admin_suggestion, notify_admin_appeal)
  on public.profiles to anon, authenticated;
grant update (notify_admin_report, notify_admin_suggestion, notify_admin_appeal)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. 알림 설정 의미 변경
--    (2026-10-06 의 알림 함수와 동일 + 받는 사람이 알림을 꺼 두었어도 알림은 항상 만듦)
--    → 꺼 둔 알림도 빨간 점 / [알림] 목록에는 그대로 보이고, 앱의 OS 알림만 뜨지 않음
--      (OS 알림 여부는 아래 5번 sfa_push_build 와 앱 화면에서 notify_* 설정을 보고 판단)
-- ---------------------------------------------------------------------
create or replace function public.sfa_notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_title text;
  v_nick text;
begin
  if tg_op = 'DELETE' then
    delete from public.user_notifications
     where type = 'post_like'
       and post_id = old.post_id
       and actor_id = old.user_id::uuid
       and is_read = false;
    return null;
  end if;

  select author_id, title into v_author, v_title from public.posts where id = new.post_id;
  if v_author is null or v_author = new.user_id::uuid then
    return null;
  end if;

  select nickname into v_nick from public.profiles where id = new.user_id;

  insert into public.user_notifications (recipient_id, actor_id, actor_nickname, type, post_id, post_title)
  values (v_author, new.user_id, coalesce(v_nick, '익명사용자'), 'post_like', new.post_id, v_title)
  on conflict (recipient_id, actor_id, post_id) where type = 'post_like'
  do update set is_read = false,
                created_at = now(),
                actor_nickname = excluded.actor_nickname,
                post_title = excluded.post_title;

  -- 60일 지난 알림 자동 정리 (테이블이 무한히 커지지 않도록)
  delete from public.user_notifications
   where recipient_id = v_author and created_at < now() - interval '60 days';

  return null;
exception when others then
  raise warning 'sfa_notify_post_like 실패: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists zz_sfa_notify_post_like on public.post_likes;
create trigger zz_sfa_notify_post_like
  after insert or delete on public.post_likes
  for each row execute function public.sfa_notify_post_like();

create or replace function public.sfa_notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_title text;
  v_parent_author uuid;
  v_nick text;
  v_preview text;
begin
  select author_id, title into v_post_author, v_title from public.posts where id = new.post_id;
  select nickname into v_nick from public.profiles where id = new.author_id;

  v_preview := left(
    coalesce(nullif(btrim(new.content), ''), case when new.image_url is not null then '(사진)' else '' end),
    80
  );

  -- 내 댓글에 답글
  if new.parent_id is not null then
    select author_id into v_parent_author from public.post_comments where id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id::uuid then
      insert into public.user_notifications
        (recipient_id, actor_id, actor_nickname, type, post_id, comment_id, post_title, content_preview)
      values
        (v_parent_author, new.author_id, coalesce(v_nick, '익명사용자'), 'comment_reply', new.post_id, new.id, v_title, v_preview);
    end if;
  end if;

  -- 내 게시글에 댓글 (위에서 답글 알림을 받은 사람이 글쓴이면 중복 알림 X)
  if v_post_author is not null
     and v_post_author <> new.author_id::uuid
     and v_post_author is distinct from v_parent_author then
    insert into public.user_notifications
      (recipient_id, actor_id, actor_nickname, type, post_id, comment_id, post_title, content_preview)
    values
      (v_post_author, new.author_id, coalesce(v_nick, '익명사용자'), 'post_comment', new.post_id, new.id, v_title, v_preview);
  end if;

  if v_post_author is not null then
    delete from public.user_notifications
     where recipient_id = v_post_author and created_at < now() - interval '60 days';
  end if;

  return null;
exception when others then
  raise warning 'sfa_notify_post_comment 실패: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists zz_sfa_notify_post_comment on public.post_comments;
create trigger zz_sfa_notify_post_comment
  after insert on public.post_comments
  for each row execute function public.sfa_notify_post_comment();

-- ---------------------------------------------------------------------
-- 3. 앱 푸시 토큰 (기기마다 1개, 로그인한 계정에 연결)
--    * 본인 토큰만 조회 / 삭제 가능, 등록·변경은 아래 함수로만
--    * 같은 기기에서 다른 계정으로 로그인하면 토큰이 새 계정으로 옮겨감
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 1 and 4096),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'windows', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id, platform);

alter table public.push_tokens enable row level security;

drop policy if exists sfa_push_tokens_select_own on public.push_tokens;
drop policy if exists sfa_push_tokens_delete_own on public.push_tokens;

create policy sfa_push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy sfa_push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.push_tokens from anon;
revoke all on public.push_tokens from authenticated;
grant select, delete on public.push_tokens to authenticated;

-- 푸시 토큰 등록 (로그인 후 앱이 호출). 성공하면 true, 잘못된 값이면 오류
create or replace function public.sfa_register_push_token(p_token text, p_platform text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
  v_platform text := lower(btrim(coalesce(p_platform, '')));
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  -- 토큰은 공백 없는 영문·숫자·기호(ASCII)만, 최대 4096자 (FCM 토큰은 보통 150~300자)
  if char_length(v_token) < 1 or char_length(v_token) > 4096 or v_token !~ '^[!-~]+$' then
    raise exception '잘못된 푸시 토큰입니다.' using errcode = '22023';
  end if;

  if v_platform not in ('android', 'windows', 'web') then
    raise exception '지원하지 않는 기기 종류입니다.' using errcode = '22023';
  end if;

  begin
    insert into public.push_tokens (token, user_id, platform)
    values (v_token, v_uid, v_platform)
    on conflict (token) do update
      set user_id = excluded.user_id,
          platform = excluded.platform,
          updated_at = now();
  exception when program_limit_exceeded then
    -- 압축되지 않는 아주 긴 값은 색인 한도(약 2.7KB)를 넘어 저장할 수 없음
    raise exception '잘못된 푸시 토큰입니다.' using errcode = '22023';
  end;

  -- 한 계정에 기기가 너무 많이 쌓이지 않도록 최근 10대만 유지 (기기 교체·재설치 등)
  delete from public.push_tokens
   where user_id = v_uid
     and token not in (
       select t.token from public.push_tokens t
        where t.user_id = v_uid
        order by t.updated_at desc, t.created_at desc
        limit 10
     );

  return true;
end;
$$;

-- 푸시 토큰 해제 (로그아웃 직전 / 이 기기 알림 끄기). 지운 게 있으면 true
create or replace function public.sfa_unregister_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
begin
  if v_uid is null or nullif(btrim(coalesce(p_token, '')), '') is null then
    return false;
  end if;

  delete from public.push_tokens
   where token = btrim(p_token)
     and user_id = v_uid;
  get diagnostics v_count = row_count;

  return v_count > 0;
end;
$$;

revoke all on function public.sfa_register_push_token(text, text) from public, anon;
grant execute on function public.sfa_register_push_token(text, text) to authenticated;
revoke all on function public.sfa_unregister_push_token(text) from public, anon;
grant execute on function public.sfa_unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 푸시 발송 설정 (1줄짜리 비공개 표)
--    * endpoint : 푸시 서버(Edge Function send-push) 주소. 비어 있으면 푸시를 보내지 않음
--    * secret   : 푸시 서버만 아는 비밀값 (자동 생성). Edge Function Secrets 의 PUSH_WEBHOOK_SECRET 과 같아야 함
--    * 사이트 / 로그인 유저는 읽을 수 없음 (SQL Editor 의 관리용 계정만)
-- ---------------------------------------------------------------------
create table if not exists public.sfa_push_config (
  id smallint primary key default 1 check (id = 1),
  endpoint text,
  secret text,
  updated_at timestamptz not null default now()
);

alter table public.sfa_push_config enable row level security;
revoke all on public.sfa_push_config from public;
revoke all on public.sfa_push_config from anon;
revoke all on public.sfa_push_config from authenticated;

-- 비밀값 자동 생성 (이미 있으면 그대로 유지 → 여러 번 실행해도 바뀌지 않음)
do $$
declare
  v_secret text;
begin
  if exists (select 1 from public.sfa_push_config where id = 1 and coalesce(secret, '') <> '') then
    return;
  end if;

  begin
    execute 'select encode(extensions.gen_random_bytes(32), ''hex'')' into v_secret;
  exception when others then
    begin
      execute 'select encode(gen_random_bytes(32), ''hex'')' into v_secret;
    exception when others then
      -- pgcrypto 가 없으면 기본 내장 난수 UUID 2개로 64자 비밀값 생성
      v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    end;
  end;

  insert into public.sfa_push_config (id, endpoint, secret)
  values (1, null, v_secret)
  on conflict (id) do update
    set secret = excluded.secret,
        updated_at = now()
  where coalesce(public.sfa_push_config.secret, '') = '';
end $$;

-- 푸시 서버 주소 저장 (빈 값이면 푸시 끄기). SQL Editor 에서만 실행
create or replace function public.sfa_set_push_endpoint(p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_url is not null and v_url !~* '^https://[^[:space:]"''<>]+$' then
    raise exception '푸시 서버 주소는 https:// 로 시작하는 전체 주소여야 합니다.' using errcode = '22023';
  end if;

  update public.sfa_push_config
     set endpoint = v_url,
         updated_at = now()
   where id = 1;

  if not found then
    raise exception '푸시 설정이 없습니다. 2026-10-10 업데이트 SQL 을 다시 실행해 주세요.' using errcode = 'P0002';
  end if;

  return coalesce(v_url, '(푸시 꺼짐)');
end;
$$;

-- 비밀값 확인 (Edge Function Secrets 의 PUSH_WEBHOOK_SECRET 에 넣을 값). SQL Editor 에서만 실행
create or replace function public.sfa_get_push_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select secret from public.sfa_push_config where id = 1;
$$;

revoke all on function public.sfa_set_push_endpoint(text) from public, anon, authenticated;
grant execute on function public.sfa_set_push_endpoint(text) to service_role;
revoke all on function public.sfa_get_push_secret() from public, anon, authenticated;
grant execute on function public.sfa_get_push_secret() to service_role;

-- ---------------------------------------------------------------------
-- 5. 푸시 문구 · 받는 사람 계산 (Edge Function send-push 전용, 사이트에서는 호출 불가)
--    문구는 사이트(src/lib/notifications.ts 의 describeNotification)와 똑같이 만듦
-- ---------------------------------------------------------------------

-- 사이트의 quote() 와 같은 글자 정리: 공백류를 한 칸으로 합치고 앞뒤 공백 제거 후 최대 p_max 자
--  (글자 수는 브라우저(JS)와 같은 방식으로 셈 → 이모지 등은 2자로 계산)
--  p_ellipsis = true 면 잘렸을 때 끝에 '…' 를 붙임
create or replace function public.sfa_push_clip_text(p_text text, p_max int, p_ellipsis boolean default true)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_clean text;
  v_units int := 0;
  v_width int;
  i int;
begin
  -- JS 정규식 \s 와 같은 공백 문자들 (일반 공백, 탭, 줄바꿈, 전각 공백 등)
  v_clean := btrim(regexp_replace(
    coalesce(p_text, ''),
    '[\t\n\v\f\r    -     　﻿]+',
    ' ',
    'g'
  ));

  if v_clean = '' then
    return '';
  end if;

  for i in 1 .. char_length(v_clean) loop
    v_width := case when ascii(substr(v_clean, i, 1)) > 65535 then 2 else 1 end;
    if v_units + v_width > p_max then
      return left(v_clean, i - 1) || case when p_ellipsis then '…' else '' end;
    end if;
    v_units := v_units + v_width;
  end loop;

  return v_clean;
end;
$$;

-- 관리진 계정 목록 (제작자 + 최고관리자, p_creator_only = true 면 제작자만)
--  user_roles 는 user_id 또는 이메일로 연결 (sfa_is_senior_admin 과 같은 기준) + 제작자 계정 이메일
create or replace function public.sfa_push_staff_ids(p_creator_only boolean)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from auth.users u
   where lower(u.email) = 'iwsamuel08@gmail.com'
  union
  select u.id
    from public.user_roles ur
    join auth.users u on u.id::text = ur.user_id::text
   where ur.user_id is not null
     and ur.role in ('creator', 'super_admin')
     and (not coalesce(p_creator_only, false) or ur.role = 'creator')
  union
  select u.id
    from public.user_roles ur
    join auth.users u on lower(u.email) = lower(btrim(ur.email))
   where coalesce(btrim(ur.email), '') <> ''
     and ur.role in ('creator', 'super_admin')
     and (not coalesce(p_creator_only, false) or ur.role = 'creator');
$$;

-- 푸시 내용 만들기
--  결과: { title, body, data: { kind, id, type?, post_id?, comment_id? (모두 문자열) },
--          tokens: [ { token, platform } ] }   ← 보낼 기기가 없으면 tokens 는 빈 배열
--  받는 사람
--   * user_notifications  → 알림 받는 사람 (notify_post_like / notify_post_comment / notify_comment_reply 가 꺼져 있으면 제외)
--   * admin_notifications (report / review_required) → 제작자 + 최고관리자 (notify_admin_report), 신고한 본인은 제외
--   * site_suggestions    → 제작자 (notify_admin_suggestion), 건의한 본인은 제외
--   * blacklist_appeals   → 제작자 + 최고관리자 (notify_admin_appeal)
--  지금은 안드로이드 앱(FCM)만 서버 푸시를 받음 (윈도우 앱은 실행 중일 때 앱이 직접 OS 알림)
create or replace function public.sfa_push_build(p_table text, p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_row jsonb;
  v_type text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_who text;
  v_text text;
  v_setting text;
  v_candidates uuid[] := '{}'::uuid[];
  v_exclude text;
  v_recipients uuid[] := '{}'::uuid[];
  v_tokens jsonb;
begin
  if p_id is null then
    return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'invalid_id');
  end if;

  if v_table = 'user_notifications' then
    select to_jsonb(n) into v_row from public.user_notifications n where n.id = p_id;
    if v_row is null then
      return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'not_found');
    end if;

    v_type := v_row ->> 'type';
    v_who := coalesce(nullif(v_row ->> 'actor_nickname', ''), '누군가');

    if v_type = 'post_like' then
      v_title := '좋아요';
      v_setting := 'notify_post_like';
      v_body := v_who || '님이 회원님의 게시글을 좋아합니다.';
    else
      v_text := public.sfa_push_clip_text(v_row ->> 'content_preview', 40, true);
      if v_type = 'comment_reply' then
        v_title := '새 답글';
        v_setting := 'notify_comment_reply';
        v_body := case
          when v_text <> '' then v_who || '님이 회원님의 댓글에 답글을 남겼습니다: "' || v_text || '"'
          else v_who || '님이 회원님의 댓글에 답글을 남겼습니다.'
        end;
      else
        v_title := '새 댓글';
        v_setting := 'notify_post_comment';
        v_body := case
          when v_text <> '' then v_who || '님이 회원님의 게시글에 댓글을 남겼습니다: "' || v_text || '"'
          else v_who || '님이 회원님의 게시글에 댓글을 남겼습니다.'
        end;
      end if;
    end if;

    v_data := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'user',
      'id', p_id::text,
      'type', v_type,
      'post_id', v_row ->> 'post_id',
      'comment_id', v_row ->> 'comment_id'
    ));

    if v_row ->> 'recipient_id' is not null then
      v_candidates := array[(v_row ->> 'recipient_id')::uuid];
    end if;

  elsif v_table = 'admin_notifications' then
    select to_jsonb(a) into v_row from public.admin_notifications a where a.id = p_id;
    if v_row is null then
      return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'not_found');
    end if;

    v_type := v_row ->> 'type';
    -- 신고 문구 앞뒤 공백 정리 (사이트의 message.trim() 과 같은 공백 문자 기준)
    v_text := regexp_replace(
      coalesce(v_row ->> 'message', ''),
      '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
      '',
      'g'
    );
    if v_type = 'report' then
      v_title := '신고 접수';
      v_body := coalesce(nullif(v_text, ''), '새 신고가 접수되었습니다.');
      v_exclude := nullif(v_row ->> 'reporter_id', '');
    elsif v_type = 'review_required' then
      v_title := '신고 검토 필요';
      v_body := coalesce(nullif(v_text, ''), '신고가 누적되어 검토가 필요합니다.');
    else
      -- 예전 방식 기록(auto_deleted) 등은 푸시하지 않음
      return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'unsupported_type');
    end if;

    v_setting := 'notify_admin_report';
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'report',
      'id', p_id::text,
      'type', v_type,
      'post_id', v_row ->> 'post_id',
      'comment_id', v_row ->> 'comment_id'
    ));
    select coalesce(array_agg(s.id), '{}'::uuid[]) into v_candidates
      from public.sfa_push_staff_ids(false) as s(id);

  elsif v_table = 'site_suggestions' then
    select to_jsonb(s) into v_row from public.site_suggestions s where s.id = p_id;
    if v_row is null then
      return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'not_found');
    end if;

    v_title := '새 건의사항';
    v_body := coalesce(nullif(v_row ->> 'user_nickname', ''), '익명사용자')
              || ': [' || coalesce(v_row ->> 'category', '') || '] '
              || coalesce(v_row ->> 'title', '');
    v_setting := 'notify_admin_suggestion';
    v_exclude := nullif(v_row ->> 'user_id', '');
    v_data := jsonb_build_object('kind', 'suggestion', 'id', p_id::text);
    select coalesce(array_agg(s.id), '{}'::uuid[]) into v_candidates
      from public.sfa_push_staff_ids(true) as s(id);

  elsif v_table = 'blacklist_appeals' then
    select to_jsonb(b) into v_row from public.blacklist_appeals b where b.id = p_id;
    if v_row is null then
      return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'not_found');
    end if;

    v_title := '블랙리스트 이의제기';
    v_body := coalesce(nullif(v_row ->> 'user_nickname', ''), '익명사용자')
              || ': ' || public.sfa_push_clip_text(v_row ->> 'message', 80, false);
    v_setting := 'notify_admin_appeal';
    v_data := jsonb_build_object('kind', 'appeal', 'id', p_id::text);
    select coalesce(array_agg(s.id), '{}'::uuid[]) into v_candidates
      from public.sfa_push_staff_ids(false) as s(id);

  else
    return jsonb_build_object('tokens', '[]'::jsonb, 'reason', 'unsupported_table');
  end if;

  -- 계정 알림 설정 반영 (설정이 없거나 null 이면 켜진 것으로 봄)
  select coalesce(array_agg(distinct c.uid), '{}'::uuid[])
    into v_recipients
    from unnest(v_candidates) as c(uid)
    left join public.profiles p on p.id::text = c.uid::text
   where c.uid is not null
     and coalesce((to_jsonb(p) ->> v_setting)::boolean, true)
     and (v_exclude is null or c.uid::text <> v_exclude);

  -- 안드로이드 앱 기기만 (토큰은 기본키라 중복 없음)
  select coalesce(
           jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform)
                     order by t.updated_at desc, t.token),
           '[]'::jsonb)
    into v_tokens
    from public.push_tokens t
   where t.platform = 'android'
     and t.user_id = any (v_recipients);

  return jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'data', v_data,
    'tokens', coalesce(v_tokens, '[]'::jsonb)
  );
end;
$$;

-- 더 이상 쓸 수 없는 토큰 삭제 (앱 삭제·재설치 등으로 FCM 이 거부한 토큰). 지운 게 있으면 true
create or replace function public.sfa_push_drop_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return false;
  end if;

  delete from public.push_tokens where token = btrim(p_token);
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.sfa_push_clip_text(text, int, boolean) from public, anon, authenticated;
grant execute on function public.sfa_push_clip_text(text, int, boolean) to service_role;
revoke all on function public.sfa_push_staff_ids(boolean) from public, anon, authenticated;
grant execute on function public.sfa_push_staff_ids(boolean) to service_role;
revoke all on function public.sfa_push_build(text, bigint) from public, anon, authenticated;
grant execute on function public.sfa_push_build(text, bigint) to service_role;
revoke all on function public.sfa_push_drop_token(text) from public, anon, authenticated;
grant execute on function public.sfa_push_drop_token(text) to service_role;

-- ---------------------------------------------------------------------
-- 6. 새 알림이 생기면 푸시 서버 호출 (pg_net)
--    * 푸시 서버 주소가 없거나 pg_net 이 없으면 아무것도 하지 않음
--    * 보낼 기기가 하나도 없으면(앱을 안 쓰는 회원) 서버를 부르지 않음
--    * 어떤 오류가 나도 알림 / 댓글 / 신고 저장은 절대 실패하지 않음 (경고만 남김)
--    * 실제 요청은 저장(커밋)이 끝난 뒤 pg_net 이 따로 보냄
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    begin
      create extension if not exists pg_net;
    exception when others then
      raise notice 'pg_net 을 켤 수 없어 앱 푸시 발송을 건너뜁니다 (사이트·앱의 다른 기능에는 영향 없음): %', sqlerrm;
    end;
  end;
end $$;

create or replace function public.sfa_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_id bigint;
  v_endpoint text;
  v_secret text;
  v_payload jsonb;
  v_body jsonb;
  v_headers jsonb;
begin
  select endpoint, secret into v_endpoint, v_secret from public.sfa_push_config where id = 1;
  if coalesce(btrim(v_endpoint), '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;

  if to_regnamespace('net') is null
     or not exists (
       select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'net' and p.proname = 'http_post'
     ) then
    return null;
  end if;

  v_row := to_jsonb(new);

  -- 관리진 알림은 신고 접수 / 검토 필요만
  if tg_table_name = 'admin_notifications'
     and coalesce(v_row ->> 'type', '') not in ('report', 'review_required') then
    return null;
  end if;

  v_id := (v_row ->> 'id')::bigint;
  if v_id is null then
    return null;
  end if;

  -- 받을 기기가 없으면 서버 호출 생략
  v_payload := public.sfa_push_build(tg_table_name, v_id);
  if coalesce(jsonb_array_length(v_payload -> 'tokens'), 0) = 0 then
    return null;
  end if;

  v_body := jsonb_build_object('table', tg_table_name, 'id', v_id);
  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-sfa-push-secret', v_secret);

  begin
    perform net.http_post(
      url := v_endpoint,
      body := v_body,
      headers := v_headers,
      timeout_milliseconds := 10000
    );
  exception when undefined_function then
    -- 예전 pg_net (시간 제한 옵션 없음)
    perform net.http_post(url := v_endpoint, body := v_body, headers := v_headers);
  end;

  return null;
exception when others then
  raise warning 'sfa_push_dispatch 실패 (%): %', tg_table_name, sqlerrm;
  return null;
end;
$$;

revoke all on function public.sfa_push_dispatch() from public, anon, authenticated;

-- 대상 테이블에 트리거 연결 (테이블이 없으면 건너뜀)
do $$
declare
  t text;
begin
  foreach t in array array['user_notifications', 'admin_notifications', 'site_suggestions', 'blacklist_appeals']
  loop
    if to_regclass('public.' || t) is null then
      raise notice '% 테이블이 없어 푸시 트리거를 건너뜁니다.', t;
      continue;
    end if;

    execute format('drop trigger if exists zz_sfa_push_dispatch on public.%I', t);
    execute format(
      'create trigger zz_sfa_push_dispatch after insert on public.%I for each row execute function public.sfa_push_dispatch()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. 실시간(Realtime) 대상 테이블
--    앱이 켜져 있는 동안 새 신고 / 건의사항 / 이의제기 / 알림을 바로 받기 위해 등록
--    * 행 보안(RLS)이 켜진 테이블만 등록 (꺼져 있으면 로그인한 누구나 새 내용을 실시간으로 받을 수 있어 건너뜀)
--    * 기존 조회 권한(정책)은 바꾸지 않음 → 지금 화면에서 볼 수 있는 사람만 실시간으로도 받음
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  v_rls boolean;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime 발행이 없어 실시간 등록을 건너뜁니다.';
    return;
  end if;

  foreach t in array array['user_notifications', 'blacklist_appeals', 'admin_notifications', 'site_suggestions']
  loop
    v_rls := null;
    select c.relrowsecurity into v_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = t
       and c.relkind in ('r', 'p');

    if v_rls is null then
      raise notice '% 테이블이 없어 실시간 등록을 건너뜁니다.', t;
      continue;
    end if;

    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      if not v_rls then
        raise warning '% 테이블은 이미 실시간 대상이지만 행 보안(RLS)이 꺼져 있습니다. 확인이 필요합니다.', t;
      end if;
      continue;
    end if;

    if not v_rls then
      raise notice '% 테이블은 행 보안(RLS)이 꺼져 있어 실시간 등록을 건너뜁니다. (앱은 60초마다 확인하는 방식으로 대신 동작)', t;
      continue;
    end if;

    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice '실시간 등록: %', t;
    exception when others then
      raise notice '% 실시간 등록 실패 (60초 확인 방식으로 대신 동작): %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. 앱 설치 파일 저장소 (app-releases 버킷)
--    비공개 버킷. 제작자·최고관리자만 내려받기(잠깐 쓰는 다운로드 주소 발급) 가능
--    올리기는 GitHub Actions 가 service_role 키로만 함 (업로드/수정/삭제 정책 없음)
--    (저장소 권한 문제로 실패해도 나머지 업데이트는 그대로 적용되도록 분리)
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('app-releases', 'app-releases', false, 209715200, null)
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = null;
  exception
    when undefined_column then
      begin
        insert into storage.buckets (id, name, public)
        values ('app-releases', 'app-releases', false)
        on conflict (id) do update set public = false;
      exception when others then
        raise warning 'app-releases 버킷 생성 실패: %', sqlerrm;
      end;
    when others then
      raise warning 'app-releases 버킷 생성 실패: %', sqlerrm;
  end;

  begin
    drop policy if exists sfa_app_releases_senior_read on storage.objects;
    create policy sfa_app_releases_senior_read on storage.objects
      for select to authenticated
      using (bucket_id = 'app-releases' and (select public.sfa_is_senior_admin()));
  exception when others then
    raise warning 'app-releases 조회 정책 생성 실패: %', sqlerrm;
  end;
end $$;

commit;

-- PostgREST(API) 가 새 컬럼/함수를 바로 인식하도록 갱신
notify pgrst, 'reload schema';

-- =====================================================================
-- [푸시 1회 설정] Edge Function send-push 를 배포한 뒤, 아래 두 줄을 한 줄씩 실행
--   (<project-ref> 는 Supabase 프로젝트 주소의 앞부분. 예: https://abcd1234.supabase.co → abcd1234)
--
--   select public.sfa_set_push_endpoint('https://<project-ref>.supabase.co/functions/v1/send-push');
--   select public.sfa_get_push_secret();   -- 나온 값을 Edge Functions → Secrets 의 PUSH_WEBHOOK_SECRET 에 저장
--
--   -- 푸시를 잠시 끄려면
--   select public.sfa_set_push_endpoint(null);
-- =====================================================================

-- =====================================================================
-- [참고] 확인용 쿼리 (필요할 때 한 줄씩 골라 실행. 평소에는 실행하지 않아도 됩니다)
--
--   -- 새 컬럼 / 함수 / 테이블이 보이면 정상 (모두 true)
--   select
--     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'notify_admin_report') as "관리자 알림 설정",
--     to_regclass('public.push_tokens') is not null as "푸시 토큰 표",
--     exists (select 1 from pg_proc where proname = 'sfa_push_build') as "푸시 문구 함수",
--     exists (select 1 from pg_extension where extname = 'pg_net') as "pg_net",
--     exists (select 1 from storage.buckets where id = 'app-releases') as "앱 설치 파일 저장소";
--
--   -- 푸시 설정 (주소가 비어 있으면 푸시를 보내지 않음)
--   select endpoint, updated_at from public.sfa_push_config;
--
--   -- 등록된 앱 기기 수
--   select platform, count(*) from public.push_tokens group by 1;
--
--   -- 푸시 트리거 목록 (4개 테이블에 zz_sfa_push_dispatch 가 있어야 정상)
--   select tgrelid::regclass as table_name, tgname from pg_trigger
--    where not tgisinternal and tgname = 'zz_sfa_push_dispatch' order by 1;
--
--   -- 실시간 대상 테이블
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
--
--   -- 실시간·화면 조회에 쓰이는 조회 정책 (제작자·최고관리자가 볼 수 있어야 함)
--   select tablename, policyname, cmd, roles, qual from pg_policies
--    where schemaname = 'public' and tablename in ('admin_notifications', 'site_suggestions', 'blacklist_appeals')
--    order by 1, 2;
--
--   -- 최근 푸시 서버 호출 결과 (pg_net, 몇 시간 동안만 보관됨)
--   select id, status_code, left(content::text, 200) as content, error_msg, created
--     from net._http_response order by created desc limit 20;
--
--   -- 푸시 내용 미리보기 (알림 번호를 넣어서)
--   select public.sfa_push_build('user_notifications', 1);
--
--   -- 앱 설치 파일 저장소
--   select id, public, file_size_limit from storage.buckets where id = 'app-releases';
--   select name, created_at from storage.objects where bucket_id = 'app-releases' order by name;
-- =====================================================================
