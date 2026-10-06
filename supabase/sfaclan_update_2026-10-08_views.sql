-- =====================================================================
--  SFAClan 업데이트 SQL (2026-10-08) - 게시글 조회수
--  사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
--  * 여러 번 실행해도 안전합니다. (이미 적용된 부분은 건너뜀)
--  * 코드 배포 전·후 어느 쪽에 실행해도 사이트가 깨지지 않습니다. (실행 전에는 조회수만 안 보임)
--
--  내용
--   1. posts.view_count (조회수) 컬럼
--   2. 같은 사람이 같은 글을 하루(한국 시간 기준)에 여러 번 열어도 1번만 셈
--      - 로그인 회원: 계정 기준 / 비로그인: 브라우저에 저장한 임의 식별값 기준
--      - 조회 기록은 이틀이 지나면 자동으로 지움
--   3. 조회수는 이 함수로만 올라감 (작성자나 다른 사람이 직접 숫자를 바꿀 수 없음)
--   * 인기순 정렬에는 영향 없음 (인기순은 기존처럼 좋아요 기준)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 조회수 컬럼
-- ---------------------------------------------------------------------
alter table public.posts add column if not exists view_count bigint not null default 0;
grant select (view_count) on public.posts to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 조회수 보호: 일반 사용자(앱)는 조회수를 직접 쓰거나 바꿀 수 없음
--    (아래 sfa_record_post_view 함수는 security definer 라 current_user 가 달라 통과)
-- ---------------------------------------------------------------------
create or replace function public.sfa_posts_view_count_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.view_count := 0;
    else
      new.view_count := old.view_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sfa_posts_view_count_guard on public.posts;
create trigger trg_sfa_posts_view_count_guard
  before insert or update of view_count on public.posts
  for each row execute function public.sfa_posts_view_count_guard();

-- ---------------------------------------------------------------------
-- 3. 하루 1회 집계용 조회 기록 (직접 읽기/쓰기 불가, 함수 안에서만 사용)
-- ---------------------------------------------------------------------
create table if not exists public.post_views (
  post_id bigint not null references public.posts (id) on delete cascade,
  viewer_key text not null,
  viewed_on date not null,
  primary key (post_id, viewer_key, viewed_on)
);

create index if not exists post_views_viewed_on_idx on public.post_views (viewed_on);

alter table public.post_views enable row level security;
revoke all on public.post_views from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 조회 기록 + 조회수 증가 함수 (새 조회수를 돌려줌)
-- ---------------------------------------------------------------------
create or replace function public.sfa_record_post_view(p_post_id bigint, p_viewer_key text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_key text;
  v_inserted int := 0;
  v_count bigint;
begin
  if p_post_id is null then
    return null;
  end if;

  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  else
    -- 비로그인: 브라우저 식별값 (영문·숫자·- 만, 최대 64자). 형식이 이상하면 세지 않음
    v_key := left(regexp_replace(coalesce(p_viewer_key, ''), '[^A-Za-z0-9-]', '', 'g'), 64);
    if length(v_key) < 16 then
      select view_count into v_count from public.posts where id = p_post_id;
      return v_count;
    end if;
    v_key := 'a:' || v_key;
  end if;

  -- 삭제·숨김 처리된 글은 세지 않음
  insert into public.post_views (post_id, viewer_key, viewed_on)
  select p.id, v_key, v_today
    from public.posts p
   where p.id = p_post_id
     and not coalesce(p.is_deleted, false)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.posts
       set view_count = coalesce(view_count, 0) + 1
     where id = p_post_id
    returning view_count into v_count;
  else
    select view_count into v_count from public.posts where id = p_post_id;
  end if;

  -- 오래된 조회 기록 정리 (가끔 한 번씩, 이틀 지난 것)
  if random() < 0.02 then
    delete from public.post_views where viewed_on < v_today - 1;
  end if;

  return v_count;
end;
$$;

revoke all on function public.sfa_record_post_view(bigint, text) from public;
grant execute on function public.sfa_record_post_view(bigint, text) to anon, authenticated;

commit;

-- 확인용: 조회수 컬럼과 함수가 보이면 정상
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'view_count') as "조회수 컬럼",
  exists (select 1 from pg_proc where proname = 'sfa_record_post_view') as "조회수 함수";
