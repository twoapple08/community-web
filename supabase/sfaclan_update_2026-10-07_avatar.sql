-- =====================================================================
--  SFAClan 업데이트 SQL (2026-10-07) - 프로필 사진 기본값
--  사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
--  * 2026-10-06 업데이트 SQL 이 먼저 적용되어 있어야 합니다.
--
--  * 여러 번 실행해도 안전합니다.
--  내용: 새로 가입하는 사람은 항상 기본 프로필 사진(사진 없음)으로 시작
--        → 가입 처리 중 구글 등 외부 사진이나 다른 값이 들어와도 무조건 비움
--  지금 유저들의 사진을 기본으로 되돌리는 1회용 명령은 sfaclan_reset_avatars_once.sql 에 따로 있습니다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 가입(INSERT) 시 프로필 사진은 항상 기본값(null)
--      (수정 시 검사 규칙은 2026-10-06 과 동일: 사이트 avatars 버킷 주소만 허용)
-- ---------------------------------------------------------------------
create or replace function public.sfa_profiles_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bio is not null then
    new.bio := nullif(btrim(left(btrim(new.bio), 60)), '');
  end if;

  if tg_op = 'INSERT' then
    -- 새로 가입한 사람은 기본 프로필 사진으로 시작
    new.avatar_url := null;
    return new;
  end if;

  if new.avatar_url is not null then
    new.avatar_url := nullif(btrim(new.avatar_url), '');
  end if;

  if new.avatar_url is not null
     and new.avatar_url is distinct from old.avatar_url
     and new.avatar_url !~* '^https?://[^[:space:]"''<>]+/storage/v1/object/public/avatars/[^[:space:]"''<>]+$' then
    raise exception '프로필 사진은 사이트에 업로드한 이미지만 사용할 수 있습니다.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sfa_profiles_validate on public.profiles;
create trigger trg_sfa_profiles_validate
  before insert or update of bio, avatar_url on public.profiles
  for each row execute function public.sfa_profiles_validate();

-- 컬럼 기본값도 명시적으로 비움 (다른 곳에서 기본값을 넣어 두었더라도 무효화)
alter table public.profiles alter column avatar_url drop default;

commit;
