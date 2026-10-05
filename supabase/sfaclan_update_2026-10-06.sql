-- =====================================================================
--  SFAClan 업데이트 SQL (2026-10-06)
--  사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
--  * 여러 번 실행해도 안전합니다. (이미 적용된 부분은 건너뜀)
--  * 반드시 "코드 배포 전에" 먼저 실행해 주세요.
--  * 2026-10-05 업데이트 SQL 이 먼저 적용되어 있어야 합니다.
--
--  주요 내용
--   1. 프로필 확장 (프로필 사진 / 소개글 / 활동 수 공개 설정 / 알림 받기 설정)
--   2. 닉네임 중복 금지 (기존 중복은 먼저 가입한 계정이 원래 닉네임 유지, 나머지는 뒤에 숫자)
--   3. 프로필 통계 (쓴 글 / 누른 좋아요 / 단 댓글)
--   4. 알림 받기 설정 반영 (좋아요 / 댓글 / 답글 알림 끄기)
--   5. 신고 시스템 개편 (3명 신고 시 '자동 삭제' 대신 '숨김 + 최고 관리진 검토')
--   6. 프로필 사진 저장소 (avatars)
--   7. 조회 속도용 인덱스
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 프로필 확장 (사진 / 소개글 / 공개 설정 / 알림 설정)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists show_like_count boolean default true;
alter table public.profiles add column if not exists show_comment_count boolean default true;
alter table public.profiles add column if not exists notify_post_like boolean default true;
alter table public.profiles add column if not exists notify_post_comment boolean default true;
alter table public.profiles add column if not exists notify_comment_reply boolean default true;

-- 지난 업데이트(이메일 보호)로 profiles 가 '컬럼별 조회 권한' 방식이 되었을 수 있으므로 새 컬럼도 명시적으로 허용
grant select (avatar_url, bio, show_like_count, show_comment_count,
              notify_post_like, notify_post_comment, notify_comment_reply)
  on public.profiles to anon, authenticated;
grant update (avatar_url, bio, show_like_count, show_comment_count,
              notify_post_like, notify_post_comment, notify_comment_reply)
  on public.profiles to authenticated;

-- 소개글 60자 제한 + 프로필 사진은 사이트 저장소(avatars) 주소만 허용
create or replace function public.sfa_profiles_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bio is not null then
    new.bio := nullif(btrim(left(btrim(new.bio), 60)), '');
  end if;

  if new.avatar_url is not null then
    new.avatar_url := nullif(btrim(new.avatar_url), '');
  end if;

  if new.avatar_url is not null
     and new.avatar_url !~* '^https?://[^[:space:]"''<>]+/storage/v1/object/public/avatars/[^[:space:]"''<>]+$' then
    if tg_op = 'INSERT' then
      -- 가입 처리 중 외부 사진 주소(구글 등)가 들어와도 가입 자체는 실패하지 않도록 비워 둠
      new.avatar_url := null;
    elsif new.avatar_url is distinct from old.avatar_url then
      raise exception '프로필 사진은 사이트에 업로드한 이미지만 사용할 수 있습니다.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sfa_profiles_validate on public.profiles;
create trigger trg_sfa_profiles_validate
  before insert or update of bio, avatar_url on public.profiles
  for each row execute function public.sfa_profiles_validate();

-- ---------------------------------------------------------------------
-- 2. 닉네임 중복 금지 (대소문자 / 앞뒤 공백 무시)
--    기존 중복 닉네임은 가장 먼저 가입한 계정이 원래 닉네임을 유지하고,
--    나머지 계정은 뒤에 숫자(1, 2, 3 …)를 붙여 자동 정리됩니다. (최대 15자)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_notnull boolean;
  v_candidate text;
  v_n int;
begin
  select a.attnotnull into v_notnull
    from pg_attribute a
   where a.attrelid = 'public.profiles'::regclass
     and a.attname = 'nickname'
     and not a.attisdropped;

  -- 1) 앞뒤 공백 제거 (빈 닉네임은 '없음' 처리. 컬럼이 NOT NULL 이면 빈 문자열 유지)
  if coalesce(v_notnull, false) then
    update public.profiles
       set nickname = btrim(nickname)
     where nickname is not null
       and nickname <> btrim(nickname);
  else
    update public.profiles
       set nickname = nullif(btrim(nickname), '')
     where nickname is not null
       and nickname is distinct from nullif(btrim(nickname), '');
  end if;

  -- 2) 중복 정리: 가입이 빠른 순(같으면 id 순)으로 1번째만 원래 닉네임 유지
  for r in
    select p.id,
           p.nickname,
           row_number() over (
             partition by lower(p.nickname)
             order by u.created_at asc nulls last, p.id::text asc
           ) as rn
      from public.profiles p
      left join auth.users u on u.id::text = p.id::text
     where p.nickname is not null
       and p.nickname <> ''
     order by lower(p.nickname), rn
  loop
    continue when r.rn = 1;

    v_n := 1;
    loop
      v_candidate := left(r.nickname, greatest(15 - length(v_n::text), 1)) || v_n::text;
      exit when not exists (
        select 1 from public.profiles
         where nickname is not null
           and btrim(nickname) <> ''
           and lower(btrim(nickname)) = lower(v_candidate)
      );
      v_n := v_n + 1;
    end loop;

    update public.profiles set nickname = v_candidate where id = r.id;
    raise notice '중복 닉네임 정리: % → %', r.nickname, v_candidate;
  end loop;
end $$;

-- 닉네임 저장 시 검사: 공백 정리, 가입 시 중복이면 자동으로 숫자 붙임, 변경 시 중복이면 거부
create or replace function public.sfa_profiles_nickname_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text;
  v_candidate text;
  v_n int;
begin
  if new.nickname is null then
    return new;
  end if;

  v_clean := btrim(new.nickname);

  if v_clean = '' then
    -- 빈 닉네임은 '없음'(null) 으로 저장 (컬럼이 NOT NULL 이면 빈 문자열 유지)
    if exists (
      select 1 from pg_attribute
       where attrelid = 'public.profiles'::regclass
         and attname = 'nickname'
         and attnotnull
    ) then
      new.nickname := '';
    else
      new.nickname := null;
    end if;
    return new;
  end if;

  new.nickname := v_clean;

  -- 본인 닉네임의 대소문자/공백만 바뀐 경우는 검사 불필요
  if tg_op = 'UPDATE' and old.nickname is not null and lower(btrim(old.nickname)) = lower(v_clean) then
    return new;
  end if;

  -- 같은 닉네임으로 동시에 저장해도 한 명만 성공하도록 잠금
  perform pg_advisory_xact_lock(hashtext('sfa_nickname:' || lower(v_clean)));

  if not exists (
    select 1 from public.profiles
     where nickname is not null
       and btrim(nickname) <> ''
       and lower(btrim(nickname)) = lower(v_clean)
       and id is distinct from new.id
  ) then
    return new;
  end if;

  -- 신규 가입(프로필 행이 아직 없음): 가입이 실패하지 않도록 뒤에 숫자를 붙여 저장
  if tg_op = 'INSERT' and not exists (select 1 from public.profiles where id = new.id) then
    v_n := 1;
    loop
      v_candidate := left(v_clean, greatest(15 - length(v_n::text), 1)) || v_n::text;
      perform pg_advisory_xact_lock(hashtext('sfa_nickname:' || lower(v_candidate)));
      exit when not exists (
        select 1 from public.profiles
         where nickname is not null
           and btrim(nickname) <> ''
           and lower(btrim(nickname)) = lower(v_candidate)
      );
      v_n := v_n + 1;
    end loop;
    new.nickname := v_candidate;
    return new;
  end if;

  raise exception '이미 사용 중인 닉네임입니다.' using errcode = '23505';
end;
$$;

drop trigger if exists trg_sfa_profiles_nickname_guard on public.profiles;
create trigger trg_sfa_profiles_nickname_guard
  before insert or update of nickname on public.profiles
  for each row execute function public.sfa_profiles_nickname_guard();

-- 최종 안전장치: DB 수준 고유 제약 (대소문자/앞뒤 공백 무시)
create unique index if not exists profiles_nickname_ci_key
  on public.profiles (lower(btrim(nickname)))
  where nickname is not null and btrim(nickname) <> '';

-- 닉네임 사용 가능 여부 (true = 사용 가능, 내 현재 닉네임은 사용 가능으로 처리)
create or replace function public.sfa_check_nickname(p_nickname text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean text := btrim(coalesce(p_nickname, ''));
begin
  if v_clean = '' then
    return false;
  end if;

  return not exists (
    select 1 from public.profiles
     where nickname is not null
       and btrim(nickname) <> ''
       and lower(btrim(nickname)) = lower(v_clean)
       and (auth.uid() is null or id <> auth.uid())
  );
end;
$$;

-- 내 닉네임 변경 (1~15자, 중복 불가). 결과: {ok, error?: duplicate|length|auth, nickname?}
create or replace function public.sfa_set_nickname(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean text := btrim(coalesce(p_nickname, ''));
  v_final text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  if char_length(v_clean) < 1 or char_length(v_clean) > 15 then
    return jsonb_build_object('ok', false, 'error', 'length');
  end if;

  perform pg_advisory_xact_lock(hashtext('sfa_nickname:' || lower(v_clean)));

  if exists (
    select 1 from public.profiles
     where nickname is not null
       and btrim(nickname) <> ''
       and lower(btrim(nickname)) = lower(v_clean)
       and id <> v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  begin
    update public.profiles set nickname = v_clean where id = v_uid
    returning nickname into v_final;

    if not found then
      insert into public.profiles (id, nickname) values (v_uid, v_clean)
      returning nickname into v_final;
    end if;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    when others then
      return jsonb_build_object('ok', false, 'error', 'error', 'message', sqlerrm);
  end;

  return jsonb_build_object('ok', true, 'nickname', coalesce(v_final, v_clean));
end;
$$;

revoke all on function public.sfa_check_nickname(text) from public, anon;
grant execute on function public.sfa_check_nickname(text) to authenticated;
revoke all on function public.sfa_set_nickname(text) from public, anon;
grant execute on function public.sfa_set_nickname(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 프로필 통계 (쓴 글 / 누른 좋아요 / 단 댓글)
--    좋아요/댓글 수를 '비공개'로 설정한 유저는 다른 사람에게 null 로 보임 (본인은 항상 숫자)
-- ---------------------------------------------------------------------
create or replace function public.sfa_get_profile_stats(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- 각 테이블의 실제 컬럼 타입(uuid/text)에 맞춰 비교 → 인덱스 사용 + 타입 오류 방지
  v_profile_id public.profiles.id%type;
  v_post_author public.posts.author_id%type;
  v_like_user public.post_likes.user_id%type;
  v_comment_author public.post_comments.author_id%type;
  v_show_like boolean;
  v_show_comment boolean;
  v_is_self boolean := false;
  v_posts int := 0;
  v_likes int;
  v_comments int;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'post_count', 0, 'like_count', null, 'comment_count', null,
      'show_like_count', true, 'show_comment_count', true
    );
  end if;

  v_is_self := auth.uid() is not null and auth.uid()::text = p_user_id::text;
  v_profile_id := p_user_id;
  v_post_author := p_user_id;
  v_like_user := p_user_id;
  v_comment_author := p_user_id;

  select show_like_count, show_comment_count
    into v_show_like, v_show_comment
    from public.profiles
   where id = v_profile_id;

  v_show_like := coalesce(v_show_like, true);
  v_show_comment := coalesce(v_show_comment, true);

  select count(*) into v_posts
    from public.posts
   where author_id = v_post_author
     and is_deleted = false
     and coalesce(delete_requested, false) = false;

  if v_is_self or v_show_like then
    select count(*) into v_likes from public.post_likes where user_id = v_like_user;
  end if;

  if v_is_self or v_show_comment then
    select count(*) into v_comments from public.post_comments where author_id = v_comment_author;
  end if;

  return jsonb_build_object(
    'post_count', coalesce(v_posts, 0),
    'like_count', v_likes,
    'comment_count', v_comments,
    'show_like_count', v_show_like,
    'show_comment_count', v_show_comment
  );
end;
$$;

revoke all on function public.sfa_get_profile_stats(uuid) from public;
grant execute on function public.sfa_get_profile_stats(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 알림 받기 설정 반영
--    (2026-10-05 의 알림 함수와 동일 + 받는 사람이 해당 알림을 꺼 두었으면 만들지 않음)
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
  v_enabled boolean;
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

  -- 글쓴이가 '내 게시글 좋아요 알림'을 꺼 두었으면 건너뜀
  select notify_post_like into v_enabled from public.profiles where id = v_author;
  if not coalesce(v_enabled, true) then
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
  v_enabled boolean;
begin
  select author_id, title into v_post_author, v_title from public.posts where id = new.post_id;
  select nickname into v_nick from public.profiles where id = new.author_id;

  v_preview := left(
    coalesce(nullif(btrim(new.content), ''), case when new.image_url is not null then '(사진)' else '' end),
    80
  );

  -- 내 댓글에 답글 (댓글 주인이 '답글 알림'을 꺼 두었으면 건너뜀)
  if new.parent_id is not null then
    select author_id into v_parent_author from public.post_comments where id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id::uuid then
      v_enabled := null;
      select notify_comment_reply into v_enabled from public.profiles where id = v_parent_author;
      if coalesce(v_enabled, true) then
        insert into public.user_notifications
          (recipient_id, actor_id, actor_nickname, type, post_id, comment_id, post_title, content_preview)
        values
          (v_parent_author, new.author_id, coalesce(v_nick, '익명사용자'), 'comment_reply', new.post_id, new.id, v_title, v_preview);
      end if;
    end if;
  end if;

  -- 내 게시글에 댓글 (위에서 답글 알림을 받은 사람이 글쓴이면 중복 알림 X, 글쓴이가 '댓글 알림'을 꺼 두었으면 건너뜀)
  if v_post_author is not null
     and v_post_author <> new.author_id::uuid
     and v_post_author is distinct from v_parent_author then
    v_enabled := null;
    select notify_post_comment into v_enabled from public.profiles where id = v_post_author;
    if coalesce(v_enabled, true) then
      insert into public.user_notifications
        (recipient_id, actor_id, actor_nickname, type, post_id, comment_id, post_title, content_preview)
      values
        (v_post_author, new.author_id, coalesce(v_nick, '익명사용자'), 'post_comment', new.post_id, new.id, v_title, v_preview);
    end if;
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
-- 5. 신고 시스템 개편
--    * 신고 1건마다 관리진 알림 ('report')
--    * 서로 다른 3명이 신고하면 게시글은 숨김 / 댓글은 가림 처리 + '검토 필요' 알림 ('review_required')
--    * 제작자/최고 관리자가 [삭제 확정] 또는 [무고 처리(복구)] 결정
--    * 무고 처리 후에는 그 이후 신고만 다시 셈
--    * 예전 '3회 누적 즉시 자동 삭제' 트리거는 모두 제거
-- ---------------------------------------------------------------------

-- 5-1. 새 컬럼
alter table public.posts add column if not exists report_review_status text;
alter table public.posts add column if not exists report_dismissed_at timestamptz;
alter table public.posts add column if not exists deleted_at timestamptz;
alter table public.posts add column if not exists delete_requested boolean default false;
alter table public.posts add column if not exists delete_reason text;

alter table public.post_comments add column if not exists report_review_status text;
alter table public.post_comments add column if not exists report_dismissed_at timestamptz;
alter table public.post_comments add column if not exists edited_at timestamptz;

alter table public.admin_notifications add column if not exists target_type text default 'post';
alter table public.admin_notifications add column if not exists comment_id bigint;
alter table public.admin_notifications add column if not exists comment_preview text;
alter table public.admin_notifications add column if not exists reporter_id uuid;
alter table public.admin_notifications add column if not exists resolution text;
alter table public.admin_notifications add column if not exists resolved_at timestamptz;
alter table public.admin_notifications add column if not exists resolved_by_nickname text;
alter table public.admin_notifications alter column target_type set default 'post';

alter table public.post_reports add column if not exists created_at timestamptz default now();
alter table public.comment_reports add column if not exists created_at timestamptz default now();

-- 5-2. 알림 종류(type) 제한 해제 ('review_required' 를 저장할 수 있도록)
do $$
declare
  c record;
begin
  for c in
    select distinct con.conname
      from pg_constraint con
      join pg_attribute a
        on a.attrelid = con.conrelid
       and a.attnum = any (con.conkey)
     where con.conrelid = 'public.admin_notifications'::regclass
       and con.contype = 'c'
       and a.attname = 'type'
  loop
    execute format('alter table public.admin_notifications drop constraint %I', c.conname);
    raise notice 'admin_notifications 제약 제거: %', c.conname;
  end loop;

  -- type 이 enum 타입이면 자유 문자열(text)로 변경
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'admin_notifications'
       and column_name = 'type'
       and data_type = 'USER-DEFINED'
  ) then
    begin
      execute 'alter table public.admin_notifications alter column "type" type text using "type"::text';
    exception when others then
      raise warning 'admin_notifications.type 을 text 로 바꾸지 못했습니다: %', sqlerrm;
    end;
  end if;
end $$;

-- 5-3. 예전 신고 트리거(3회 누적 즉시 자동 삭제 등) 전부 제거
do $$
declare
  t record;
begin
  for t in
    select tg.tgname, c.relname
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('post_reports', 'comment_reports')
       and not tg.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.%I', t.tgname, t.relname);
    raise notice '기존 신고 트리거 제거: %.%', t.relname, t.tgname;
  end loop;
end $$;

-- 5-4. 권한 확인 도우미
-- 최고 관리진 (제작자 / 최고 관리자) : 신고 검토 결정 가능
create or replace function public.sfa_is_senior_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       lower(coalesce(auth.jwt() ->> 'email', '')) = 'iwsamuel08@gmail.com'
       or exists (
         select 1 from public.user_roles ur
          where ur.role in ('creator', 'super_admin')
            and (
              ur.user_id::text = auth.uid()::text
              or (coalesce(auth.jwt() ->> 'email', '') <> ''
                  and lower(ur.email) = lower(auth.jwt() ->> 'email'))
            )
       )
     );
$$;

-- 관리진 전체 (제작자 / 최고 관리자 / 관리자)
create or replace function public.sfa_is_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       lower(coalesce(auth.jwt() ->> 'email', '')) = 'iwsamuel08@gmail.com'
       or exists (
         select 1 from public.user_roles ur
          where ur.role in ('creator', 'super_admin', 'admin')
            and (
              ur.user_id::text = auth.uid()::text
              or (coalesce(auth.jwt() ->> 'email', '') <> ''
                  and lower(ur.email) = lower(auth.jwt() ->> 'email'))
            )
       )
     );
$$;

grant execute on function public.sfa_is_senior_admin() to anon, authenticated;
grant execute on function public.sfa_is_any_admin() to anon, authenticated;

-- 5-5. 게시글 신고 접수 트리거
create or replace function public.sfa_on_post_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notif_reporter public.admin_notifications.reporter_id%type;
  v_nick text;
  v_found boolean := false;
  v_title text;
  v_feed text;
  v_status text;
  v_dismissed timestamptz;
  v_label text;
  v_reason text;
  v_summary text;
  v_count int := 0;
begin
  select nickname into v_nick from public.profiles where id::text = new.reporter_id::text;
  v_nick := coalesce(nullif(btrim(v_nick), ''), '익명사용자');

  select title, feed_type, report_review_status, report_dismissed_at
    into v_title, v_feed, v_status, v_dismissed
    from public.posts
   where id = new.post_id;
  v_found := found;

  v_title := coalesce(nullif(btrim(v_title), ''), '(제목 없음)');
  v_label := case when v_feed = 'community' then '커뮤니티 피드' else '클랜 피드' end;

  -- 신고 사유 (기타는 직접 쓴 내용을 괄호로)
  select string_agg(
           case
             when u.r = '기타' and nullif(btrim(coalesce(new.custom_reason, '')), '') is not null
               then '기타(' || left(btrim(new.custom_reason), 100) || ')'
             else btrim(u.r)
           end,
           ', ' order by u.ord)
    into v_reason
    from unnest(coalesce(new.reasons, array[]::text[])) with ordinality as u(r, ord)
   where nullif(btrim(u.r), '') is not null;
  v_reason := coalesce(
    nullif(v_reason, ''),
    nullif(left(btrim(coalesce(new.custom_reason, '')), 100), ''),
    '사유 미기재'
  );

  -- 관리진 알림: 신고 접수 (실패해도 신고 자체는 접수되도록 분리)
  begin
    v_notif_reporter := new.reporter_id;
    insert into public.admin_notifications
      (type, target_type, post_id, comment_id, comment_preview, reporter_id, reporter_nickname,
       post_title, feed_type, reason, message, is_read)
    values
      ('report', 'post', new.post_id, null, null, v_notif_reporter, v_nick,
       v_title, coalesce(v_feed, 'community'), v_reason,
       format('%s님이 [%s / %s] 게시글을 신고했습니다. (사유: %s)', v_nick, v_label, v_title, v_reason),
       false);
  exception when others then
    raise warning 'sfa_on_post_report 신고 알림 생성 실패: %', sqlerrm;
  end;

  if not v_found then
    return null;
  end if;

  -- 서로 다른 3명 이상 신고 → 숨김 + 검토 요청
  begin
    -- 같은 글에 동시에 신고가 들어와도 한 번만 처리
    perform pg_advisory_xact_lock(hashtext('sfa_report:post:' || new.post_id::text));

    select report_review_status, report_dismissed_at
      into v_status, v_dismissed
      from public.posts
     where id = new.post_id;

    select count(distinct reporter_id) into v_count
      from public.post_reports
     where post_id = new.post_id
       and (v_dismissed is null or created_at > v_dismissed);

    if v_count >= 3 and (v_status is null or v_status = 'dismissed') then
      update public.posts
         set is_deleted = true,
             report_review_status = 'pending',
             deleted_at = now()
       where id = new.post_id
         and (report_review_status is null or report_review_status = 'dismissed');

      if found then
        -- 많이 나온 사유 순으로 요약 (예: 욕설 2건, 혐오 발언 1건)
        select string_agg(s.r || ' ' || s.cnt || '건', ', ' order by s.cnt desc, s.r)
          into v_summary
          from (
            select btrim(u.r) as r, count(*) as cnt
              from public.post_reports pr
              cross join lateral unnest(coalesce(pr.reasons, array[]::text[])) as u(r)
             where pr.post_id = new.post_id
               and (v_dismissed is null or pr.created_at > v_dismissed)
               and nullif(btrim(u.r), '') is not null
             group by btrim(u.r)
             order by count(*) desc, btrim(u.r)
             limit 3
          ) s;
        v_summary := coalesce(nullif(v_summary, ''), v_reason);

        begin
          insert into public.admin_notifications
            (type, target_type, post_id, comment_id, comment_preview, reporter_id, reporter_nickname,
             post_title, feed_type, reason, message, is_read)
          values
            ('review_required', 'post', new.post_id, null, null, null, '시스템',
             v_title, coalesce(v_feed, 'community'), v_summary,
             format('[%s / %s] 게시글이 서로 다른 %s명에게 신고되어 비공개 처리되었습니다. 내용을 확인하고 삭제 확정 또는 무고 처리해 주세요. (주요 사유: %s)',
                    v_label, v_title, v_count, v_summary),
             false);
        exception when others then
          raise warning 'sfa_on_post_report 검토 알림 생성 실패: %', sqlerrm;
        end;
      end if;
    end if;
  exception when others then
    raise warning 'sfa_on_post_report 누적 신고 처리 실패: %', sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists zz_sfa_post_report on public.post_reports;
create trigger zz_sfa_post_report
  after insert on public.post_reports
  for each row execute function public.sfa_on_post_report();

-- 5-6. 댓글/답글 신고 접수 트리거
create or replace function public.sfa_on_comment_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notif_reporter public.admin_notifications.reporter_id%type;
  v_nick text;
  v_found boolean := false;
  v_post_id bigint;
  v_content text;
  v_image text;
  v_status text;
  v_dismissed timestamptz;
  v_preview text;
  v_target_label text;
  v_title text;
  v_feed text;
  v_label text;
  v_reason text;
  v_summary text;
  v_count int := 0;
begin
  select nickname into v_nick from public.profiles where id::text = new.reporter_id::text;
  v_nick := coalesce(nullif(btrim(v_nick), ''), '익명사용자');

  select c.post_id, c.content, c.image_url, c.report_review_status, c.report_dismissed_at
    into v_post_id, v_content, v_image, v_status, v_dismissed
    from public.post_comments c
   where c.id = new.comment_id;
  v_found := found;

  if v_post_id is not null then
    select title, feed_type into v_title, v_feed from public.posts where id = v_post_id;
  end if;

  v_title := coalesce(nullif(btrim(v_title), ''), '(제목 없음)');
  v_label := case when v_feed = 'community' then '커뮤니티 피드' else '클랜 피드' end;

  -- 댓글 미리보기 (글 없이 사진만 있으면 '(사진)')
  v_preview := left(
    coalesce(
      nullif(regexp_replace(btrim(coalesce(v_content, '')), '\s+', ' ', 'g'), ''),
      case when v_image is not null then '(사진)' end
    ),
    80
  );
  v_target_label := case
    when v_preview is not null then '댓글("' || left(v_preview, 30) || case when char_length(v_preview) > 30 then '…' else '' end || '")'
    else '댓글'
  end;

  select string_agg(
           case
             when u.r = '기타' and nullif(btrim(coalesce(new.custom_reason, '')), '') is not null
               then '기타(' || left(btrim(new.custom_reason), 100) || ')'
             else btrim(u.r)
           end,
           ', ' order by u.ord)
    into v_reason
    from unnest(coalesce(new.reasons, array[]::text[])) with ordinality as u(r, ord)
   where nullif(btrim(u.r), '') is not null;
  v_reason := coalesce(
    nullif(v_reason, ''),
    nullif(left(btrim(coalesce(new.custom_reason, '')), 100), ''),
    '사유 미기재'
  );

  begin
    v_notif_reporter := new.reporter_id;
    insert into public.admin_notifications
      (type, target_type, post_id, comment_id, comment_preview, reporter_id, reporter_nickname,
       post_title, feed_type, reason, message, is_read)
    values
      ('report', 'comment', v_post_id, new.comment_id, v_preview, v_notif_reporter, v_nick,
       v_title, coalesce(v_feed, 'community'), v_reason,
       format('%s님이 [%s / %s] 게시글의 %s을 신고했습니다. (사유: %s)', v_nick, v_label, v_title, v_target_label, v_reason),
       false);
  exception when others then
    raise warning 'sfa_on_comment_report 신고 알림 생성 실패: %', sqlerrm;
  end;

  if not v_found then
    return null;
  end if;

  begin
    perform pg_advisory_xact_lock(hashtext('sfa_report:comment:' || new.comment_id::text));

    select report_review_status, report_dismissed_at
      into v_status, v_dismissed
      from public.post_comments
     where id = new.comment_id;

    select count(distinct reporter_id) into v_count
      from public.comment_reports
     where comment_id = new.comment_id
       and (v_dismissed is null or created_at > v_dismissed);

    if v_count >= 3 and (v_status is null or v_status = 'dismissed') then
      -- 댓글은 행을 지우지 않고 '검토 중' 표시만 (답글 유지, 화면에서는 가림 처리)
      update public.post_comments
         set report_review_status = 'pending'
       where id = new.comment_id
         and (report_review_status is null or report_review_status = 'dismissed');

      if found then
        select string_agg(s.r || ' ' || s.cnt || '건', ', ' order by s.cnt desc, s.r)
          into v_summary
          from (
            select btrim(u.r) as r, count(*) as cnt
              from public.comment_reports cr
              cross join lateral unnest(coalesce(cr.reasons, array[]::text[])) as u(r)
             where cr.comment_id = new.comment_id
               and (v_dismissed is null or cr.created_at > v_dismissed)
               and nullif(btrim(u.r), '') is not null
             group by btrim(u.r)
             order by count(*) desc, btrim(u.r)
             limit 3
          ) s;
        v_summary := coalesce(nullif(v_summary, ''), v_reason);

        begin
          insert into public.admin_notifications
            (type, target_type, post_id, comment_id, comment_preview, reporter_id, reporter_nickname,
             post_title, feed_type, reason, message, is_read)
          values
            ('review_required', 'comment', v_post_id, new.comment_id, v_preview, null, '시스템',
             v_title, coalesce(v_feed, 'community'), v_summary,
             format('[%s / %s] 게시글의 %s이 서로 다른 %s명에게 신고되어 가림 처리되었습니다. 내용을 확인하고 삭제 확정 또는 무고 처리해 주세요. (주요 사유: %s)',
                    v_label, v_title, v_target_label, v_count, v_summary),
             false);
        exception when others then
          raise warning 'sfa_on_comment_report 검토 알림 생성 실패: %', sqlerrm;
        end;
      end if;
    end if;
  exception when others then
    raise warning 'sfa_on_comment_report 누적 신고 처리 실패: %', sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists zz_sfa_comment_report on public.comment_reports;
create trigger zz_sfa_comment_report
  after insert on public.comment_reports
  for each row execute function public.sfa_on_comment_report();

-- 5-7. 신고 검토 결정 (제작자 / 최고 관리자 전용)
--      p_target_type: 'post' | 'comment' / p_action: 'delete'(삭제 확정) | 'dismiss'(무고 처리·복구)
create or replace function public.sfa_review_report(p_target_type text, p_target_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(btrim(coalesce(p_target_type, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_status text;
  v_admin_nick text;
  v_author public.posts.author_id%type;
  v_deleted_count int := 0;
  v_bl_user public.blacklists.user_id%type;
  v_bl_nick text;
  v_bl_email text;
begin
  if not public.sfa_is_senior_admin() then
    return jsonb_build_object('ok', false, 'status', null, 'error', 'forbidden');
  end if;

  if v_type not in ('post', 'comment') or p_target_id is null then
    return jsonb_build_object('ok', false, 'status', null, 'error', 'invalid_target');
  end if;

  if v_action not in ('delete', 'dismiss') then
    return jsonb_build_object('ok', false, 'status', null, 'error', 'invalid_action');
  end if;

  -- 신고 접수 트리거와 같은 잠금 → 결정과 새 신고가 동시에 들어와도 순서대로 처리
  perform pg_advisory_xact_lock(hashtext('sfa_report:' || v_type || ':' || p_target_id::text));

  select nickname into v_admin_nick from public.profiles where id::text = auth.uid()::text;
  v_admin_nick := coalesce(nullif(btrim(v_admin_nick), ''), '관리자');

  if v_type = 'post' then
    if v_action = 'delete' then
      update public.posts
         set is_deleted = true,
             report_review_status = 'deleted',
             deleted_at = coalesce(deleted_at, now())
       where id = p_target_id
      returning author_id into v_author;

      if not found then
        return jsonb_build_object('ok', false, 'status', null, 'error', 'not_found');
      end if;
      v_status := 'deleted';

      -- 신고로 삭제 확정된 글이 3개 이상이면 블랙리스트 자동 등록 (실패해도 결정은 유지)
      begin
        if v_author is not null then
          select count(*) into v_deleted_count
            from public.posts
           where author_id = v_author
             and report_review_status = 'deleted';

          if v_deleted_count >= 3 then
            v_bl_user := v_author;
            if not exists (select 1 from public.blacklists where user_id = v_bl_user) then
              select nickname into v_bl_nick from public.profiles where id::text = v_author::text;
              select email into v_bl_email from auth.users where id::text = v_author::text;

              insert into public.blacklists (user_id, nickname, email, reason)
              values (
                v_bl_user,
                coalesce(nullif(btrim(v_bl_nick), ''), '익명사용자'),
                coalesce(nullif(btrim(v_bl_email), ''), coalesce(nullif(btrim(v_bl_nick), ''), 'user') || '@community.local'),
                '신고 누적으로 게시글 3회 이상 삭제 (자동 등록)'
              )
              on conflict do nothing;
            end if;
          end if;
        end if;
      exception when others then
        raise warning 'sfa_review_report 블랙리스트 자동 등록 실패: %', sqlerrm;
      end;
    else
      -- 무고 처리: 다시 공개 + 이전 신고는 더 이상 세지 않음
      update public.posts
         set is_deleted = false,
             report_review_status = 'dismissed',
             report_dismissed_at = now(),
             deleted_at = null,
             delete_reason = case when coalesce(delete_requested, false) then delete_reason else null end
       where id = p_target_id;

      if not found then
        return jsonb_build_object('ok', false, 'status', null, 'error', 'not_found');
      end if;
      v_status := 'dismissed';
    end if;
  else
    if v_action = 'delete' then
      -- 댓글 삭제 확정은 '가림 유지' (행/답글은 남김)
      update public.post_comments
         set report_review_status = 'deleted'
       where id = p_target_id;
    else
      update public.post_comments
         set report_review_status = 'dismissed',
             report_dismissed_at = now()
       where id = p_target_id;
    end if;

    if not found then
      return jsonb_build_object('ok', false, 'status', null, 'error', 'not_found');
    end if;
    v_status := case when v_action = 'delete' then 'deleted' else 'dismissed' end;
  end if;

  -- 해당 대상의 '검토 필요'(예전 '자동 삭제' 포함) 알림에 처리 결과 기록
  --  (이전 회차에 이미 처리된 기록은 그대로 두고, 아직 처리 전인 알림만 기록.
  --   처리 전 알림이 없으면 결정을 바꾼 경우이므로 가장 최근 알림을 갱신)
  begin
    update public.admin_notifications
       set resolution = v_status,
           resolved_at = now(),
           resolved_by_nickname = v_admin_nick
     where type in ('review_required', 'auto_deleted')
       and resolution is null
       and (
         (v_type = 'post' and coalesce(target_type, 'post') = 'post' and post_id = p_target_id)
         or (v_type = 'comment' and target_type = 'comment' and comment_id = p_target_id)
       );

    if not found then
      update public.admin_notifications
         set resolution = v_status,
             resolved_at = now(),
             resolved_by_nickname = v_admin_nick
       where id = (
         select n.id
           from public.admin_notifications n
          where n.type in ('review_required', 'auto_deleted')
            and (
              (v_type = 'post' and coalesce(n.target_type, 'post') = 'post' and n.post_id = p_target_id)
              or (v_type = 'comment' and n.target_type = 'comment' and n.comment_id = p_target_id)
            )
          order by n.created_at desc, n.id desc
          limit 1
       );
    end if;
  exception when others then
    raise warning 'sfa_review_report 알림 처리 기록 실패: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

revoke all on function public.sfa_review_report(text, bigint, text) from public, anon;
grant execute on function public.sfa_review_report(text, bigint, text) to authenticated;

-- 5-8. 신고 상세 내역 (누가 / 어떤 사유로 / 언제) - 제작자 / 최고 관리자 전용
create or replace function public.sfa_get_report_details(p_target_type text, p_target_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text := lower(btrim(coalesce(p_target_type, '')));
  v_reports jsonb := '[]'::jsonb;
  v_target jsonb;
begin
  if not public.sfa_is_senior_admin() then
    raise exception '신고 상세 내역은 제작자/최고 관리자만 볼 수 있습니다.' using errcode = '42501';
  end if;

  if v_type = 'post' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'reporter_id', r.reporter_id,
             'reporter_nickname', coalesce(nullif(btrim(pf.nickname), ''), '익명사용자'),
             'reasons', coalesce(to_jsonb(r.reasons), '[]'::jsonb),
             'custom_reason', r.custom_reason,
             'created_at', r.created_at
           ) order by r.created_at desc nulls last), '[]'::jsonb)
      into v_reports
      from public.post_reports r
      left join public.profiles pf on pf.id::text = r.reporter_id::text
     where r.post_id = p_target_id;

    select jsonb_build_object(
             'id', p.id,
             'author_id', p.author_id,
             'author_nickname', coalesce(nullif(btrim(pf.nickname), ''), '익명사용자'),
             'title', p.title,
             'content', p.content,
             'feed_type', p.feed_type,
             'post_no', p.post_no,
             'is_deleted', p.is_deleted,
             'report_review_status', p.report_review_status,
             'created_at', p.created_at
           )
      into v_target
      from public.posts p
      left join public.profiles pf on pf.id::text = p.author_id::text
     where p.id = p_target_id;
  elsif v_type = 'comment' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'reporter_id', r.reporter_id,
             'reporter_nickname', coalesce(nullif(btrim(pf.nickname), ''), '익명사용자'),
             'reasons', coalesce(to_jsonb(r.reasons), '[]'::jsonb),
             'custom_reason', r.custom_reason,
             'created_at', r.created_at
           ) order by r.created_at desc nulls last), '[]'::jsonb)
      into v_reports
      from public.comment_reports r
      left join public.profiles pf on pf.id::text = r.reporter_id::text
     where r.comment_id = p_target_id;

    select jsonb_build_object(
             'id', c.id,
             'post_id', c.post_id,
             'parent_id', c.parent_id,
             'author_id', c.author_id,
             'author_nickname', coalesce(nullif(btrim(pf.nickname), ''), '익명사용자'),
             'content', c.content,
             'image_url', c.image_url,
             'created_at', c.created_at,
             'report_review_status', c.report_review_status,
             'post_title', p.title,
             'feed_type', p.feed_type,
             'post_no', p.post_no
           )
      into v_target
      from public.post_comments c
      left join public.posts p on p.id = c.post_id
      left join public.profiles pf on pf.id::text = c.author_id::text
     where c.id = p_target_id;
  else
    raise exception '잘못된 신고 대상입니다.' using errcode = '22023';
  end if;

  return jsonb_build_object('reports', coalesce(v_reports, '[]'::jsonb), 'target', v_target);
end;
$$;

revoke all on function public.sfa_get_report_details(text, bigint) from public, anon;
grant execute on function public.sfa_get_report_details(text, bigint) to authenticated;

-- 5-9. 댓글 보호
--   * 작성자는 내용/사진만 수정 가능 (좋아요 수, 작성 시각, 검토 상태 등은 그대로 유지)
--   * 신고 검토 중 / 삭제 확정된 댓글은 작성자가 수정·삭제 불가
--   * 내용/사진이 바뀌면 edited_at 자동 기록 ('수정됨' 표시)
--   (DB 내부 처리·관리 함수는 current_user 가 다르므로 영향 없음 → 이 함수는 security definer 로 만들면 안 됨)
create or replace function public.sfa_post_comments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.report_review_status in ('pending', 'deleted')
       and (new.content is distinct from old.content or new.image_url is distinct from old.image_url) then
      raise exception '신고 검토 중인 댓글은 수정할 수 없습니다.';
    end if;

    new.post_id := old.post_id;
    new.author_id := old.author_id;
    new.parent_id := old.parent_id;
    new.likes_count := old.likes_count;
    new.created_at := old.created_at;
    new.report_review_status := old.report_review_status;
    new.report_dismissed_at := old.report_dismissed_at;
    new.edited_at := old.edited_at;
  end if;

  if new.content is distinct from old.content or new.image_url is distinct from old.image_url then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sfa_post_comments_guard on public.post_comments;
create trigger trg_sfa_post_comments_guard
  before update on public.post_comments
  for each row execute function public.sfa_post_comments_guard();

create or replace function public.sfa_post_comments_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and old.report_review_status in ('pending', 'deleted') then
    if old.author_id::text = coalesce(auth.uid()::text, '') then
      if not public.sfa_is_any_admin() then
        raise exception '신고 검토 중인 댓글은 삭제할 수 없습니다.';
      end if;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_sfa_post_comments_delete_guard on public.post_comments;
create trigger trg_sfa_post_comments_delete_guard
  before delete on public.post_comments
  for each row execute function public.sfa_post_comments_delete_guard();

-- 5-10. 게시글 보호: 신고로 숨겨진 글은 최고 관리진 결정 전까지 작성자가 직접 다시 공개할 수 없음
create or replace function public.sfa_posts_report_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- 신고 관련 값이 그대로면 통과 (일반 수정 / 삭제 신청 등)
  if new.report_review_status is not distinct from old.report_review_status
     and new.report_dismissed_at is not distinct from old.report_dismissed_at
     and (new.is_deleted is not distinct from old.is_deleted
          or coalesce(old.report_review_status, '') not in ('pending', 'deleted')) then
    return new;
  end if;

  if public.sfa_is_senior_admin() then
    -- 예전 관리 화면에서 직접 복구한 경우: 무고 처리로 기록해 상태를 맞춤
    if old.report_review_status in ('pending', 'deleted')
       and coalesce(old.is_deleted, false)
       and not coalesce(new.is_deleted, false)
       and new.report_review_status is not distinct from old.report_review_status then
      new.report_review_status := 'dismissed';
      new.report_dismissed_at := now();
    end if;
    return new;
  end if;

  new.report_review_status := old.report_review_status;
  new.report_dismissed_at := old.report_dismissed_at;
  if old.report_review_status in ('pending', 'deleted') then
    new.is_deleted := old.is_deleted;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sfa_posts_report_guard on public.posts;
create trigger trg_sfa_posts_report_guard
  before update of is_deleted, deleted_at, report_review_status, report_dismissed_at on public.posts
  for each row execute function public.sfa_posts_report_guard();

-- 5-11. 기존 데이터 정리
-- 예전 방식(3회 신고 즉시 자동 삭제)으로 숨겨진 글 → '검토 대기'
update public.posts
   set report_review_status = 'pending'
 where is_deleted = true
   and report_review_status is null;

-- 예전 관리 화면에서 직접 복구된 글 → '무고 처리'로 상태 맞춤
update public.posts
   set report_review_status = 'dismissed',
       report_dismissed_at = coalesce(report_dismissed_at, now())
 where coalesce(is_deleted, false) = false
   and report_review_status = 'pending';

update public.admin_notifications
   set target_type = 'post'
 where target_type is null;

-- 예전 '자동 삭제' 알림: 이미 처리된 건 결과 기록 (영구 삭제됨 → deleted / 복구됨 → dismissed)
update public.admin_notifications n
   set resolution = case
                      when n.post_id is null
                        or not exists (select 1 from public.posts p where p.id = n.post_id) then 'deleted'
                      else 'dismissed'
                    end,
       resolved_at = coalesce(n.resolved_at, now())
 where n.type = 'auto_deleted'
   and n.resolution is null
   and (
     n.post_id is null
     or not exists (select 1 from public.posts p where p.id = n.post_id)
     or exists (select 1 from public.posts p where p.id = n.post_id and coalesce(p.is_deleted, false) = false)
   );

-- ---------------------------------------------------------------------
-- 6. 프로필 사진 저장소 (avatars 버킷)
--    누구나 볼 수 있고, 로그인한 유저는 '내 아이디 폴더' 안에만 올리기/바꾸기/지우기 가능
--    (저장소 권한 문제로 실패해도 나머지 업데이트는 그대로 적용되도록 분리)
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  exception
    when undefined_column then
      begin
        insert into storage.buckets (id, name, public)
        values ('avatars', 'avatars', true)
        on conflict (id) do update set public = true;
      exception when others then
        raise warning 'avatars 버킷 생성 실패: %', sqlerrm;
      end;
    when others then
      raise warning 'avatars 버킷 생성 실패: %', sqlerrm;
  end;

  begin
    drop policy if exists sfa_avatars_public_read on storage.objects;
    create policy sfa_avatars_public_read on storage.objects
      for select
      using (bucket_id = 'avatars');
  exception when others then
    raise warning 'avatars 조회 정책 생성 실패: %', sqlerrm;
  end;

  begin
    drop policy if exists sfa_avatars_insert_own on storage.objects;
    create policy sfa_avatars_insert_own on storage.objects
      for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  exception when others then
    raise warning 'avatars 업로드 정책 생성 실패: %', sqlerrm;
  end;

  begin
    drop policy if exists sfa_avatars_update_own on storage.objects;
    create policy sfa_avatars_update_own on storage.objects
      for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  exception when others then
    raise warning 'avatars 수정 정책 생성 실패: %', sqlerrm;
  end;

  begin
    drop policy if exists sfa_avatars_delete_own on storage.objects;
    create policy sfa_avatars_delete_own on storage.objects
      for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  exception when others then
    raise warning 'avatars 삭제 정책 생성 실패: %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 7. 조회 속도용 인덱스 (컬럼 구성이 달라 실패하는 항목은 자동으로 건너뜀)
-- ---------------------------------------------------------------------
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'create index if not exists admin_notifications_target_idx on public.admin_notifications (target_type, post_id)',
    'create index if not exists admin_notifications_comment_idx on public.admin_notifications (comment_id)',
    'create index if not exists admin_notifications_created_idx on public.admin_notifications (created_at desc)',
    'create index if not exists post_comments_author_created_idx on public.post_comments (author_id, created_at desc)',
    'create index if not exists post_reports_post_idx on public.post_reports (post_id)',
    'create index if not exists comment_reports_comment_idx on public.comment_reports (comment_id)',
    'create index if not exists posts_report_review_idx on public.posts (report_review_status) where report_review_status is not null',
    'create index if not exists post_comments_report_review_idx on public.post_comments (report_review_status) where report_review_status is not null'
  ]
  loop
    begin
      execute stmt;
    exception when others then
      raise notice '인덱스 건너뜀: % (%)', stmt, sqlerrm;
    end;
  end loop;
end $$;

commit;

-- PostgREST(API) 가 새 컬럼/함수를 바로 인식하도록 갱신
notify pgrst, 'reload schema';

-- =====================================================================
-- [참고] 확인용 쿼리 (필요할 때 한 줄씩 골라 실행. 평소에는 실행하지 않아도 됩니다)
--
--   -- 닉네임 중복이 남아 있는지 (결과가 없어야 정상)
--   select lower(btrim(nickname)) as nick, count(*) from public.profiles
--    where nickname is not null and btrim(nickname) <> '' group by 1 having count(*) > 1;
--
--   -- 검토 대기 중인 게시글 / 댓글
--   select id, feed_type, post_no, title, report_review_status from public.posts where report_review_status = 'pending';
--   select id, post_id, content, report_review_status from public.post_comments where report_review_status = 'pending';
--
--   -- 최근 관리진 알림
--   select id, type, target_type, post_id, comment_id, reason, resolution, created_at
--     from public.admin_notifications order by created_at desc limit 30;
--
--   -- 신고 관련 테이블의 트리거 목록 (zz_sfa_post_report / zz_sfa_comment_report 만 있어야 정상)
--   select tgrelid::regclass as table_name, tgname from pg_trigger
--    where not tgisinternal
--      and tgrelid in ('public.post_reports'::regclass, 'public.comment_reports'::regclass,
--                      'public.posts'::regclass, 'public.post_comments'::regclass)
--    order by 1, 2;
--
--   -- 프로필 통계 함수 확인 (유저 아이디를 넣어서)
--   select public.sfa_get_profile_stats('00000000-0000-0000-0000-000000000000');
--
--   -- avatars 저장소 확인
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';
-- =====================================================================
