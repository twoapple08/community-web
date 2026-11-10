-- ============================================================
-- R2 미사용 파일 정리용: "지금 DB 에서 쓰이고 있는 사진·동영상 목록"을 돌려주는 함수
-- ------------------------------------------------------------
-- GitHub Actions "R2 미사용 파일 정리" 가 이 목록에 없는 R2 파일만 trash/ 폴더로 옮김
--   * 삭제된 글 / 글 수정으로 빠진 사진 / 글을 쓰다 말고 나간 사진 → 목록에 없음 → 정리 대상
--   * 신고로 숨겨진 글(is_deleted = true)은 DB 에 남아 있으므로 → 목록에 있음 → 보존
-- public 스키마의 모든 글자/JSON 칸을 훑어서 찾으므로 표가 늘어나도 따로 고칠 필요 없음
-- R2 주소와 예전 Supabase Storage 주소 둘 다 인식 (이전 전에도 잘못 지우지 않도록)
--
-- 보안: 서비스 키(service_role)로만 실행 가능, 일반 회원/비회원은 호출 불가
-- SQL 에디터에 전체를 붙여넣고 한 번 실행하면 끝 (여러 번 실행해도 안전)
-- ============================================================

create or replace function public.sfa_media_keys_in_use()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_re constant text := 'https?://[^/"''[:space:]<>]+/(?:storage/v1/object/public/)?((?:posts|post-images|post-videos|comment-images)/[^"''[:space:]<>?#)\\]+)';
  v_quick constant text := '(posts|post-images|post-videos|comment-images)/';
  v_keys text[] := '{}';
  v_found text[];
  r record;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'jsonb', 'json')
  loop
    execute format(
      'select array_agg(distinct m[1]) from public.%I, regexp_matches(%I::text, %L, ''g'') as m where %I::text ~ %L',
      r.table_name, r.column_name, v_re, r.column_name, v_quick
    ) into v_found;
    if v_found is not null then
      v_keys := v_keys || v_found;
    end if;
  end loop;

  return coalesce((select jsonb_agg(distinct k) from unnest(v_keys) as k), '[]'::jsonb);
end;
$$;

revoke all on function public.sfa_media_keys_in_use() from public, anon, authenticated;
grant execute on function public.sfa_media_keys_in_use() to service_role;

-- 확인 (쓰이고 있는 파일 개수)
-- select jsonb_array_length(public.sfa_media_keys_in_use());
