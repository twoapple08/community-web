-- =====================================================================
--  SFAClan 업데이트 SQL (2026-10-05)
--  사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
--  * 여러 번 실행해도 안전합니다. (이미 적용된 부분은 건너뜀)
--  * 반드시 "코드 배포 전에" 먼저 실행해 주세요.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 피드별 게시글 번호 (post_no)
--    클랜 피드 / 커뮤니티 피드가 각자 1번부터 번호를 가짐 (/clan/1, /community/1)
--    기존 글은 기존 번호(id)를 그대로 써서 이미 공유된 링크가 깨지지 않습니다.
--    → 제작자 콘솔의 [게시글 번호 초기화]를 누르면 피드별로 1번부터 다시 매겨집니다.
-- ---------------------------------------------------------------------
alter table public.posts add column if not exists post_no integer;

update public.posts set post_no = id where post_no is null;

create unique index if not exists posts_feed_type_post_no_key on public.posts (feed_type, post_no);

create or replace function public.sfa_assign_post_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('sfa_post_no:' || coalesce(new.feed_type, '')));
    if new.feed_type is null then
      select coalesce(max(post_no), 0) + 1 into new.post_no from public.posts where feed_type is null;
    else
      select coalesce(max(post_no), 0) + 1 into new.post_no from public.posts where feed_type = new.feed_type;
    end if;
    return new;
  end if;

  -- 번호는 [게시글 번호 초기화] 기능으로만 바꿀 수 있음 (임의 변경 차단)
  if new.post_no is distinct from old.post_no
     and coalesce(current_setting('sfa.allow_post_no_change', true), '') <> 'on' then
    new.post_no := old.post_no;
  end if;

  -- 피드 종류가 바뀌면 새 피드의 마지막 번호 다음 번호 부여
  if new.feed_type is distinct from old.feed_type then
    perform pg_advisory_xact_lock(hashtext('sfa_post_no:' || coalesce(new.feed_type, '')));
    select coalesce(max(post_no), 0) + 1 into new.post_no from public.posts where feed_type = new.feed_type;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sfa_assign_post_no on public.posts;
create trigger trg_sfa_assign_post_no
  before insert or update of post_no, feed_type on public.posts
  for each row execute function public.sfa_assign_post_no();

-- [게시글 번호 초기화] : 피드별로 올린 순서대로 1번부터 재정렬
--  (예전 방식처럼 내부 id 를 바꾸지 않으므로 댓글/좋아요/신고 기록이 꼬일 위험이 없음)
drop function if exists public.reindex_post_ids();
create function public.reindex_post_ids()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_clan int;
  v_community int;
  v_total int;
begin
  if v_email <> 'iwsamuel08@gmail.com'
     and not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'creator') then
    raise exception '게시글 번호 초기화는 사이트 제작자만 실행할 수 있습니다.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('sfa_post_no:clan'));
  perform pg_advisory_xact_lock(hashtext('sfa_post_no:community'));
  perform set_config('sfa.allow_post_no_change', 'on', true);

  -- 1단계: 임시 음수 번호 (고유번호 충돌 방지)
  update public.posts p
     set post_no = -s.rn
    from (
      select id, row_number() over (partition by feed_type order by created_at asc, id asc) as rn
        from public.posts
    ) s
   where p.id = s.id;

  -- 2단계: 양수로 확정
  update public.posts set post_no = -post_no where post_no < 0;

  perform set_config('sfa.allow_post_no_change', 'off', true);

  select count(*) filter (where feed_type = 'clan'),
         count(*) filter (where feed_type = 'community'),
         count(*)
    into v_clan, v_community, v_total
    from public.posts;

  return jsonb_build_object(
    'success', true,
    'count', v_total,
    'clan_count', v_clan,
    'community_count', v_community
  );
end;
$$;

revoke all on function public.reindex_post_ids() from public;
revoke all on function public.reindex_post_ids() from anon;
grant execute on function public.reindex_post_ids() to authenticated;

-- ---------------------------------------------------------------------
-- 2. 댓글 좋아요 수 자동 계산 (동시에 눌러도 숫자가 꼬이지 않음)
-- ---------------------------------------------------------------------
create or replace function public.sfa_sync_comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment_id bigint;
begin
  if tg_op = 'DELETE' then
    v_comment_id := old.comment_id;
  else
    v_comment_id := new.comment_id;
  end if;

  update public.post_comments
     set likes_count = (select count(*) from public.comment_likes where comment_id = v_comment_id)
   where id = v_comment_id;

  return null;
end;
$$;

drop trigger if exists zz_sfa_comment_likes_count on public.comment_likes;
create trigger zz_sfa_comment_likes_count
  after insert or delete on public.comment_likes
  for each row execute function public.sfa_sync_comment_likes_count();

-- 기존 숫자 정정
update public.post_comments c
   set likes_count = s.cnt
  from (
    select pc.id, (select count(*) from public.comment_likes cl where cl.comment_id = pc.id) as cnt
      from public.post_comments pc
  ) s
 where c.id = s.id
   and c.likes_count is distinct from s.cnt;

-- 댓글 수정 권한은 작성자 본인만 (이제 좋아요 수는 DB 가 계산하므로 남의 댓글을 수정할 필요 없음)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'post_comments' and cmd = 'UPDATE'
  loop
    execute format('drop policy %I on public.post_comments', pol.policyname);
  end loop;
end $$;

create policy sfa_post_comments_update_own on public.post_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. 알림 (내 게시글에 좋아요/댓글, 내 댓글에 답글)
-- ---------------------------------------------------------------------
create table if not exists public.user_notifications (
  id bigint generated by default as identity primary key,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_nickname text,
  type text not null check (type in ('post_like', 'post_comment', 'comment_reply')),
  post_id bigint references public.posts (id) on delete cascade,
  comment_id bigint references public.post_comments (id) on delete cascade,
  post_title text,
  content_preview text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc);
create index if not exists user_notifications_recipient_unread_idx
  on public.user_notifications (recipient_id) where is_read = false;
create unique index if not exists user_notifications_like_unique
  on public.user_notifications (recipient_id, actor_id, post_id) where type = 'post_like';
create index if not exists user_notifications_post_idx on public.user_notifications (post_id);
create index if not exists user_notifications_comment_idx on public.user_notifications (comment_id);

alter table public.user_notifications enable row level security;

drop policy if exists sfa_notifications_select_own on public.user_notifications;
drop policy if exists sfa_notifications_update_own on public.user_notifications;
drop policy if exists sfa_notifications_delete_own on public.user_notifications;

create policy sfa_notifications_select_own on public.user_notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy sfa_notifications_update_own on public.user_notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy sfa_notifications_delete_own on public.user_notifications
  for delete to authenticated using (recipient_id = auth.uid());

-- 알림은 DB 트리거만 만들 수 있고, 유저는 '읽음 표시'와 '삭제'만 가능
revoke all on public.user_notifications from anon;
revoke all on public.user_notifications from authenticated;
grant select, delete on public.user_notifications to authenticated;
grant update (is_read) on public.user_notifications to authenticated;

-- 좋아요 알림 (좋아요 취소 시 읽지 않은 알림도 함께 제거)
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

-- 댓글/답글 알림
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

-- 실시간 알림 수신 (Realtime) 대상 테이블 등록
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.user_notifications';
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'blacklist_appeals'
    ) then
      execute 'alter publication supabase_realtime add table public.blacklist_appeals';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. 조회 속도용 인덱스 (글이 많아져도 목록/댓글/좋아요 조회가 느려지지 않도록)
--    컬럼 구성이 달라 실패하는 항목은 자동으로 건너뜀
-- ---------------------------------------------------------------------
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'create index if not exists posts_feed_list_idx on public.posts (feed_type, is_deleted, created_at desc)',
    'create index if not exists posts_author_idx on public.posts (author_id)',
    'create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at)',
    'create index if not exists post_comments_parent_idx on public.post_comments (parent_id)',
    'create index if not exists post_likes_post_user_idx on public.post_likes (post_id, user_id)',
    'create index if not exists post_likes_user_created_idx on public.post_likes (user_id, created_at desc)',
    'create index if not exists comment_likes_comment_user_idx on public.comment_likes (comment_id, user_id)',
    'create index if not exists comment_likes_user_idx on public.comment_likes (user_id)',
    'create index if not exists admin_notifications_unread_idx on public.admin_notifications (is_read)',
    'create index if not exists blacklist_appeals_user_idx on public.blacklist_appeals (user_id, status)'
  ]
  loop
    begin
      execute stmt;
    exception when others then
      raise notice '인덱스 건너뜀: % (%)', stmt, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. 개인정보 보호: 다른 사람이 profiles 의 이메일을 조회하지 못하게 차단
--    (닉네임 등 나머지 컬럼은 그대로 조회 가능)
--    기존 보안 정책/함수가 profiles.email 을 쓰고 있으면 사이트가 깨지지 않도록 자동으로 건너뜀
-- ---------------------------------------------------------------------
do $$
declare
  v_cols text;
  v_risky int := 0;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) then
    raise notice 'profiles.email 컬럼이 없어 개인정보 보호 단계를 건너뜁니다.';
    return;
  end if;

  -- profiles 를 참조하는 보안 정책 / 뷰 / (일반 권한) 함수가 하나라도 있으면 안전을 위해 건너뜀
  select count(*) into v_risky
    from pg_policies
   where (coalesce(qual, '') || coalesce(with_check, '')) ilike '%profiles%';

  select v_risky + count(*) into v_risky
    from information_schema.view_column_usage
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'email';

  select v_risky + count(*) into v_risky
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not p.prosecdef
     and p.prosrc ilike '%profiles%';

  if v_risky > 0 then
    raise notice 'profiles 를 참조하는 정책/뷰/함수가 있어 개인정보 보호 단계를 안전하게 건너뜁니다. (%건)', v_risky;
    return;
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name <> 'email';

  execute 'revoke select on public.profiles from anon, authenticated';
  execute format('grant select (%s) on public.profiles to anon, authenticated', v_cols);
  raise notice 'profiles.email 외부 조회 차단 완료';
end $$;

commit;

-- PostgREST(API) 가 새 컬럼/테이블을 바로 인식하도록 갱신
notify pgrst, 'reload schema';

-- =====================================================================
-- [참고] 되돌리기가 필요할 때만 사용 (평소에는 실행하지 마세요)
--   grant select on public.profiles to anon, authenticated;   -- 5번 이메일 차단 해제
-- =====================================================================
