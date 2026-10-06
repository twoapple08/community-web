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
--      - 비로그인 조회는 글 1개당 하루 최대 300회까지만 셈 (식별값을 바꿔 가며 숫자를 부풀리는 것 방지)
--      - 삭제·삭제 신청·신고 검토로 숨겨진 글은 세지 않음
--      - 조회 기록은 이틀이 지나면 자동으로 지움 (매일 00:10 정리 예약, 예약 기능이 없으면 조회 때 조금씩 정리)
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
create index if not exists post_views_post_day_idx on public.post_views (post_id, viewed_on);

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
  c_anon_daily_limit constant int := 300;
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

    -- 비로그인 조회는 글마다 하루 상한까지만 (넘으면 숫자만 돌려줌)
    if (select count(*)
          from (select 1
                  from public.post_views
                 where post_id = p_post_id
                   and viewed_on = v_today
                   and viewer_key like 'a:%'
                 limit c_anon_daily_limit) capped) >= c_anon_daily_limit then
      select view_count into v_count from public.posts where id = p_post_id;
      return v_count;
    end if;
  end if;

  -- 삭제·삭제 신청(비공개)·신고 검토로 숨겨진 글은 세지 않음
  insert into public.post_views (post_id, viewer_key, viewed_on)
  select p.id, v_key, v_today
    from public.posts p
   where p.id = p_post_id
     and not coalesce(p.is_deleted, false)
     and not coalesce(p.delete_requested, false)
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

  -- 예약 정리가 없을 때를 위한 보조 정리 (가끔, 한 번에 최대 1000건만 → 조회가 느려지지 않게)
  if random() < 0.05 then
    delete from public.post_views
     where ctid in (select ctid from public.post_views where viewed_on < v_today - 1 limit 1000);
  end if;

  return v_count;
end;
$$;

revoke all on function public.sfa_record_post_view(bigint, text) from public;
grant execute on function public.sfa_record_post_view(bigint, text) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------
-- 5. 이틀 지난 조회 기록 매일 정리 (한국 시간 00:10)
--    Supabase 의 pg_cron(예약 작업)을 켜서 등록. 켤 수 없는 환경이면 건너뜀 (위 함수의 보조 정리로 대신함)
-- ---------------------------------------------------------------------
do $do$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 켤 수 없어 예약 정리를 건너뜁니다: %', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule(
        'sfa_purge_post_views',
        '10 15 * * *',
        $job$delete from public.post_views where viewed_on < (now() at time zone 'Asia/Seoul')::date - 1$job$
      );
    exception when others then
      raise notice '예약 정리 등록 실패 (조회수 기능에는 영향 없음): %', sqlerrm;
    end;
  end if;
end
$do$;

notify pgrst, 'reload schema';

-- 확인용: 조회수 컬럼과 함수가 보이면 정상
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'view_count') as "조회수 컬럼",
  exists (select 1 from pg_proc where proname = 'sfa_record_post_view') as "조회수 함수";
