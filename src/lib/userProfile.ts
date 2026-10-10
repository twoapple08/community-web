// 유저 프로필 공통 유틸
// - 다른 유저 프로필 열기/닫기 (주소에 ?profile=유저ID 를 붙이는 방식 → 뒤로가기로 닫힘, 링크 공유 가능)
// - 공개 프로필/통계 조회, 프로필 사진 업로드, 닉네임 변경(중복 불가), 개인 설정 저장
// - 새 DB 컬럼/함수가 아직 없는 경우(SQL 미실행)에도 사이트가 깨지지 않도록 모두 안전하게 대체 동작

import { supabase } from '@/lib/supabase'
import { compressImageFile } from '@/lib/imageCompress'

export const PROFILE_QUERY_PARAM = 'profile'

// ---------------------------------------------------------------------
// 프로필 모달 열기/닫기
// ---------------------------------------------------------------------
let openedByPush = false

/** 다른 유저(또는 내) 프로필 열기. 현재 페이지 위에 프로필 창이 뜨고, 뒤로가기로 닫힙니다. */
export const openUserProfile = (userId: string | null | undefined) => {
  if (!userId || typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get(PROFILE_QUERY_PARAM) === userId) return
  const alreadyOpen = url.searchParams.has(PROFILE_QUERY_PARAM)
  url.searchParams.set(PROFILE_QUERY_PARAM, userId)
  const next = `${url.pathname}${url.search}${url.hash}`
  if (alreadyOpen) {
    window.history.replaceState(null, '', next)
  } else {
    window.history.pushState(null, '', next)
    openedByPush = true
  }
}

/** 프로필 창 닫기 (열 때 쌓은 방문 기록이 있으면 뒤로가기, 공유 링크로 들어왔으면 주소에서 파라미터만 제거) */
export const closeUserProfile = () => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PROFILE_QUERY_PARAM)) return
  if (openedByPush) {
    openedByPush = false
    window.history.back()
    return
  }
  url.searchParams.delete(PROFILE_QUERY_PARAM)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

/** 프로필 창 안에서 다른 페이지(게시글)로 이동하기 직전에 호출 – 이후 닫기 동작이 뒤로가기를 쓰지 않도록 */
export const forgetProfileHistoryEntry = () => {
  openedByPush = false
}

/**
 * 프로필 창을 띄우는 쪽(UserProfileHost)이 주소의 ?profile 유무가 바뀔 때마다 호출.
 * 브라우저 뒤로가기 등으로 파라미터가 사라졌으면 '뒤로가기로 닫기' 기록을 지워 엉뚱한 페이지로 돌아가지 않게 함
 */
export const syncProfileParamPresence = (present: boolean) => {
  if (!present) openedByPush = false
}

// ---------------------------------------------------------------------
// 공개 프로필
// ---------------------------------------------------------------------
export interface PublicProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
  bio: string | null
  show_like_count: boolean
  show_comment_count: boolean
}

export interface MySettings extends PublicProfile {
  notify_post_like: boolean
  notify_post_comment: boolean
  notify_comment_reply: boolean
  /** 관리자 알림 (앱 OS 알림): 신고·신고 검토 – 제작자/최고관리자 */
  notify_admin_report: boolean
  /** 관리자 알림 (앱 OS 알림): 건의함 – 제작자 */
  notify_admin_suggestion: boolean
  /** 관리자 알림 (앱 OS 알림): 블랙리스트 이의제기 – 제작자/최고관리자 */
  notify_admin_appeal: boolean
}

export interface ProfileStats {
  post_count: number
  /** 비공개면 null (본인은 항상 숫자) */
  like_count: number | null
  /** 비공개면 null (본인은 항상 숫자) */
  comment_count: number | null
  show_like_count: boolean
  show_comment_count: boolean
}

const EXTENDED_PUBLIC_COLUMNS = 'id, nickname, avatar_url, bio, show_like_count, show_comment_count'
const SETTINGS_COLUMNS = `${EXTENDED_PUBLIC_COLUMNS}, notify_post_like, notify_post_comment, notify_comment_reply`
const ADMIN_NOTIFY_COLUMNS = 'notify_admin_report, notify_admin_suggestion, notify_admin_appeal'

type RawProfile = Partial<MySettings> & { id: string; nickname?: string | null }

const normalizePublic = (row: RawProfile): PublicProfile => ({
  id: row.id,
  nickname: row.nickname ?? null,
  avatar_url: row.avatar_url ?? null,
  bio: row.bio ?? null,
  show_like_count: row.show_like_count !== false,
  show_comment_count: row.show_comment_count !== false,
})

/** 한 명의 공개 프로필 (닉네임/사진/소개/공개설정) */
export const fetchPublicProfile = async (userId: string): Promise<PublicProfile | null> => {
  const extended = await supabase.from('profiles').select(EXTENDED_PUBLIC_COLUMNS).eq('id', userId).maybeSingle()
  if (!extended.error) return extended.data ? normalizePublic(extended.data as RawProfile) : null
  const basic = await supabase.from('profiles').select('id, nickname').eq('id', userId).maybeSingle()
  return basic.data ? normalizePublic(basic.data as RawProfile) : null
}

const avatarCache = new Map<string, { at: number; url: string | null }>()
const AVATAR_CACHE_MS = 60 * 1000

/** 여러 유저의 프로필 사진 주소 (컬럼이 없거나 권한 오류면 빈 결과 → 기존 화면 그대로) */
export const fetchAvatarMap = async (userIds: string[]): Promise<Record<string, string | null>> => {
  const result: Record<string, string | null> = {}
  const now = Date.now()
  const missing: string[] = []
  Array.from(new Set(userIds.filter(Boolean))).forEach((id) => {
    const cached = avatarCache.get(id)
    if (cached && now - cached.at < AVATAR_CACHE_MS) result[id] = cached.url
    else missing.push(id)
  })
  if (missing.length === 0) return result

  try {
    const { data, error } = await supabase.from('profiles').select('id, avatar_url').in('id', missing)
    if (error || !data) return result
    ;(data as { id: string; avatar_url: string | null }[]).forEach((row) => {
      result[row.id] = row.avatar_url || null
      avatarCache.set(row.id, { at: now, url: row.avatar_url || null })
    })
  } catch {
    // 무시 (사진 없이 표시)
  }
  return result
}

/** 프로필 통계 (쓴 글 / 누른 좋아요 / 단 댓글). 공개 설정은 DB 함수가 판단 */
export const fetchProfileStats = async (userId: string): Promise<ProfileStats | null> => {
  const { data, error } = await supabase.rpc('sfa_get_profile_stats', { p_user_id: userId })
  if (!error && data) {
    const d = data as Partial<ProfileStats>
    return {
      post_count: Number(d.post_count ?? 0),
      like_count: d.like_count === null || d.like_count === undefined ? null : Number(d.like_count),
      comment_count: d.comment_count === null || d.comment_count === undefined ? null : Number(d.comment_count),
      show_like_count: d.show_like_count !== false,
      show_comment_count: d.show_comment_count !== false,
    }
  }

  // DB 함수가 아직 없을 때: 게시글 수만 직접 계산 (나머지는 비공개 표시)
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userId)
    .eq('is_deleted', false)
  return {
    post_count: count || 0,
    like_count: null,
    comment_count: null,
    show_like_count: false,
    show_comment_count: false,
  }
}

// ---------------------------------------------------------------------
// 내 설정
// ---------------------------------------------------------------------
export const fetchMySettings = async (userId: string): Promise<MySettings | null> => {
  // 관리자 알림 컬럼(2026-10-10 SQL)이 아직 없으면 그 컬럼만 빼고 다시 조회 → 나머지 설정은 그대로 보임
  let extended = await supabase.from('profiles').select(`${SETTINGS_COLUMNS}, ${ADMIN_NOTIFY_COLUMNS}`).eq('id', userId).maybeSingle()
  if (extended.error) {
    extended = await supabase.from('profiles').select(SETTINGS_COLUMNS).eq('id', userId).maybeSingle()
  }
  const row = (extended.error ? null : extended.data) as RawProfile | null
  if (!extended.error) {
    if (!row) return null
    return {
      ...normalizePublic(row),
      notify_post_like: row.notify_post_like !== false,
      notify_post_comment: row.notify_post_comment !== false,
      notify_comment_reply: row.notify_comment_reply !== false,
      notify_admin_report: row.notify_admin_report !== false,
      notify_admin_suggestion: row.notify_admin_suggestion !== false,
      notify_admin_appeal: row.notify_admin_appeal !== false,
    }
  }
  const basic = await supabase.from('profiles').select('id, nickname').eq('id', userId).maybeSingle()
  if (!basic.data) return null
  return {
    ...normalizePublic(basic.data as RawProfile),
    notify_post_like: true,
    notify_post_comment: true,
    notify_comment_reply: true,
    notify_admin_report: true,
    notify_admin_suggestion: true,
    notify_admin_appeal: true,
  }
}

export type SettingsPatch = Partial<
  Pick<
    MySettings,
    | 'bio'
    | 'avatar_url'
    | 'show_like_count'
    | 'show_comment_count'
    | 'notify_post_like'
    | 'notify_post_comment'
    | 'notify_comment_reply'
    | 'notify_admin_report'
    | 'notify_admin_suggestion'
    | 'notify_admin_appeal'
  >
>

export const updateMySettings = async (userId: string, patch: SettingsPatch): Promise<{ error: string | null }> => {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) return { error: error.message }
  avatarCache.delete(userId)
  emitProfileChanged({ userId, ...patch })
  return { error: null }
}

// ---------------------------------------------------------------------
// 닉네임 (중복 불가)
// ---------------------------------------------------------------------
export const NICKNAME_MAX_LENGTH = 15

export type NicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; reason: 'duplicate' | 'length' | 'auth' | 'error'; message: string }

const NICKNAME_MESSAGES = {
  duplicate: '이미 사용 중인 닉네임입니다.',
  length: `닉네임은 1~${NICKNAME_MAX_LENGTH}자로 입력해 주세요.`,
  auth: '로그인이 필요합니다.',
  error: '닉네임 변경 중 오류가 발생했습니다.',
} as const

const isMissingFunction = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '')))

/** 닉네임 사용 가능 여부 (본인의 현재 닉네임은 사용 가능으로 처리). DB 함수가 없으면 null */
export const checkNicknameAvailable = async (nickname: string): Promise<boolean | null> => {
  const clean = nickname.trim()
  if (!clean) return false
  const { data, error } = await supabase.rpc('sfa_check_nickname', { p_nickname: clean })
  if (error) return null
  return Boolean(data)
}

export const setMyNickname = async (userId: string, nickname: string): Promise<NicknameResult> => {
  const clean = nickname.trim()
  if (clean.length < 1 || clean.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: 'length', message: NICKNAME_MESSAGES.length }
  }

  const { data, error } = await supabase.rpc('sfa_set_nickname', { p_nickname: clean })
  if (!error && data) {
    const d = data as { ok?: boolean; error?: string; nickname?: string }
    if (d.ok) {
      const finalNick = d.nickname || clean
      emitProfileChanged({ userId, nickname: finalNick })
      return { ok: true, nickname: finalNick }
    }
    const reason = (['duplicate', 'length', 'auth'] as const).find((r) => r === d.error) ?? 'error'
    return { ok: false, reason, message: NICKNAME_MESSAGES[reason] }
  }

  if (isMissingFunction(error)) {
    // SQL 미적용 환경: 예전 방식으로 저장
    const { error: upsertError } = await supabase.from('profiles').upsert({ id: userId, nickname: clean })
    if (upsertError) {
      const reason = upsertError.code === '23505' ? 'duplicate' : 'error'
      return { ok: false, reason, message: NICKNAME_MESSAGES[reason] }
    }
    emitProfileChanged({ userId, nickname: clean })
    return { ok: true, nickname: clean }
  }

  const reason = error?.code === '23505' ? 'duplicate' : 'error'
  return { ok: false, reason, message: NICKNAME_MESSAGES[reason] }
}

// ---------------------------------------------------------------------
// 프로필 사진 업로드 (avatars 버킷, GIF 가능)
// ---------------------------------------------------------------------
export const AVATAR_BUCKET = 'avatars'
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_TYPES = /^image\/(png|jpe?g|gif|webp)$/i

export const uploadAvatar = async (userId: string, originalFile: File): Promise<{ url: string | null; error: string | null }> => {
  if (!AVATAR_TYPES.test(originalFile.type)) {
    return { url: null, error: 'PNG, JPG, GIF, WEBP 이미지만 사용할 수 있습니다.' }
  }
  if (originalFile.size > AVATAR_MAX_BYTES) {
    return { url: null, error: '프로필 사진은 5MB 이하만 올릴 수 있습니다.' }
  }

  // GIF/WEBP 는 움직임 유지를 위해 원본, 나머지는 512px 로 축소
  const file = await compressImageFile(originalFile, { maxDimension: 512, quality: 0.9, minBytes: 300 * 1024 })
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) return { url: null, error: `업로드 실패: ${error.message}` }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const url = data?.publicUrl || null
  if (!url) return { url: null, error: '업로드한 사진 주소를 가져오지 못했습니다.' }

  const saved = await updateMySettings(userId, { avatar_url: url })
  if (saved.error) return { url: null, error: `저장 실패: ${saved.error}` }
  return { url, error: null }
}

// ---------------------------------------------------------------------
// 프로필 변경 알림 (헤더 닉네임/사진 등 즉시 반영)
// ---------------------------------------------------------------------
export interface ProfileChangedEvent extends SettingsPatch {
  userId: string
  nickname?: string
}

type ProfileListener = (event: ProfileChangedEvent) => void
const profileListeners = new Set<ProfileListener>()

export const onProfileChanged = (listener: ProfileListener) => {
  profileListeners.add(listener)
  return () => {
    profileListeners.delete(listener)
  }
}

export const emitProfileChanged = (event: ProfileChangedEvent) => {
  if (event.avatar_url !== undefined) avatarCache.delete(event.userId)
  profileListeners.forEach((listener) => listener(event))
}

// ---------------------------------------------------------------------
// 새 알림 토스트(상단 파란 팝업) 표시 여부 – 기기별 설정
// ---------------------------------------------------------------------
const TOAST_KEY = 'sfa_notify_toast'

export const isNotificationToastEnabled = (): boolean => {
  try {
    return localStorage.getItem(TOAST_KEY) !== '0'
  } catch {
    return true
  }
}

export const setNotificationToastEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(TOAST_KEY, enabled ? '1' : '0')
  } catch {}
}
