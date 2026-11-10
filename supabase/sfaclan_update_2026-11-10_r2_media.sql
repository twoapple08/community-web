-- ============================================================
-- 게시글/댓글 속 사진·동영상 주소를 Supabase Storage → Cloudflare R2 로 바꾸기 (1회용)
-- ------------------------------------------------------------
-- 순서: "Storage → R2 이전" GitHub Actions 로 파일 복사가 끝난 뒤에 실행
--
-- 바뀌는 것 (public 스키마의 모든 글자/JSON 칸에서 찾아 바꿈: 글 본문, 썸네일, 댓글 사진 등)
--   https://xxxx.supabase.co/storage/v1/object/public/posts/a.jpg
--   → https://R2공개주소/posts/a.jpg
--   (대상 버킷: posts, post-images, post-videos, comment-images)
-- 바뀌지 않는 것: 프로필 사진(avatars), 앱 설치 파일(app-releases)
--
-- 주소만 바꾸는 작업이라 '수정됨' 표시·알림·푸시가 생기지 않도록
-- 바꾸는 동안만 해당 표의 트리거를 잠시 끔 (끝나면 다시 켬, 한 번에 처리되어 중간 실패 시 전부 원래대로)
-- ============================================================

-- [1단계] 미리보기: 몇 줄이 바뀌는지 확인 (아무것도 바꾸지 않음)
do $$
declare
  v_pattern constant text := 'https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/(posts|post-images|post-videos|comment-images)/';
  r record;
  v_count bigint;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'jsonb', 'json')
  loop
    execute format('select count(*) from public.%I where %I::text ~ %L', r.table_name, r.column_name, v_pattern) into v_count;
    if v_count > 0 then
      raise notice '%.% : %줄', r.table_name, r.column_name, v_count;
    end if;
  end loop;
end $$;


-- [2단계] 실제 바꾸기
--   아래 v_r2 의 주소를 R2 공개 주소로 바꾼 뒤 실행 (끝에 / 없이)
--   예) 'https://pub-1234abcd.r2.dev'  또는  'https://media.sfaclan.com'
do $$
declare
  v_r2 constant text := 'https://여기에-R2-공개주소';
  v_pattern constant text := 'https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/(posts|post-images|post-videos|comment-images)/';
  r record;
  v_count bigint;
begin
  if v_r2 like '%여기에%' or v_r2 !~ '^https://[a-z0-9.-]+$' then
    raise exception 'v_r2 에 R2 공개 주소를 먼저 넣어주세요 (https:// 로 시작, 끝에 / 없이)';
  end if;

  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'jsonb', 'json')
  loop
    execute format('select count(*) from public.%I where %I::text ~ %L', r.table_name, r.column_name, v_pattern) into v_count;
    continue when v_count = 0;

    execute format('alter table public.%I disable trigger user', r.table_name);
    execute format(
      'update public.%I set %I = regexp_replace(%I::text, %L, %L, ''g'')::%s where %I::text ~ %L',
      r.table_name, r.column_name, r.column_name, v_pattern, v_r2 || '/\1/',
      case r.data_type when 'character varying' then 'text' else r.data_type end,
      r.column_name, v_pattern
    );
    execute format('alter table public.%I enable trigger user', r.table_name);

    raise notice '%.% : %줄 변경', r.table_name, r.column_name, v_count;
  end loop;
end $$;


-- [3단계] 확인: 남은 Supabase 주소가 0 이어야 함 → [1단계]를 다시 실행해서 아무것도 안 나오면 완료
