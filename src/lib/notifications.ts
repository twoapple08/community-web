import { supabase } from '@/lib/supabase'
import { getPostPath, selectPostsWithNo } from '@/lib/postRoute'

export type NotificationType = 'post_like' | 'post_comment' | 'comment_reply'

export interface UserNotification {
  id: number
  recipient_id: string
  actor_id: string | null
  actor_nickname: string | null
  type: NotificationType
  post_id: number | null
  comment_id: number | null
  post_title: string | null
  content_preview: string | null
  is_read: boolean
  created_at: string
}

export const NOTIFICATION_LIST_LIMIT = 50

/** 읽지 않은 알림 개수 (본문 없이 개수만 조회 → 트래픽 최소) */
export const fetchUnreadNotificationCount = async (userId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)
  if (error) return 0
  return count || 0
}

export const fetchNotifications = async (userId: string): Promise<UserNotification[]> => {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_LIST_LIMIT)
  if (error || !data) return []
  return data as UserNotification[]
}

export const fetchLatestUnreadNotification = async (userId: string): Promise<UserNotification | null> => {
  const { data } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('recipient_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as UserNotification | null) ?? null
}

export const markNotificationRead = async (id: number) => {
  await supabase.from('user_notifications').update({ is_read: true }).eq('id', id)
}

export const markAllNotificationsRead = async (userId: string) => {
  await supabase.from('user_notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false)
}

export const deleteReadNotifications = async (userId: string) => {
  return supabase.from('user_notifications').delete().eq('recipient_id', userId).eq('is_read', true)
}

const quote = (text: string | null | undefined, max = 40) => {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/** 알림 문구 */
export const describeNotification = (n: UserNotification): string => {
  const who = n.actor_nickname || '누군가'
  if (n.type === 'post_like') return `${who}님이 회원님의 게시글을 좋아합니다.`
  const preview = quote(n.content_preview)
  if (n.type === 'comment_reply') {
    return preview ? `${who}님이 회원님의 댓글에 답글을 남겼습니다: "${preview}"` : `${who}님이 회원님의 댓글에 답글을 남겼습니다.`
  }
  return preview ? `${who}님이 회원님의 게시글에 댓글을 남겼습니다: "${preview}"` : `${who}님이 회원님의 게시글에 댓글을 남겼습니다.`
}

/** 알림이 가리키는 게시글의 상세 주소 (피드별 번호 반영). 글이 삭제됐으면 null */
export const resolveNotificationPostPath = async (postId: number | null): Promise<string | null> => {
  if (!postId) return null
  const rows = await selectPostsWithNo<{ id: number; feed_type: string; post_no?: number | null }>(
    'id, feed_type',
    (cols) => supabase.from('posts').select(cols).eq('id', postId).limit(1)
  )
  const row = rows[0]
  if (!row) return null
  return getPostPath(row)
}

/** 게시글 주소 + 해당 댓글 위치(#comment-번호). 댓글 알림을 누르면 그 댓글로 바로 스크롤 */
export const commentAnchor = (commentId: number | string | null | undefined): string =>
  commentId ? `#comment-${commentId}` : ''

/** 알림을 눌렀을 때 이동할 주소 (댓글/답글 알림은 해당 댓글 위치까지) */
export const resolveNotificationPath = async (n: Pick<UserNotification, 'post_id' | 'comment_id' | 'type'>): Promise<string | null> => {
  const path = await resolveNotificationPostPath(n.post_id)
  if (!path) return null
  return n.type === 'post_like' ? path : `${path}${commentAnchor(n.comment_id)}`
}

// ---------------------------------------------------------------------
// 앱 OS 알림 (안드로이드 상단 알림 / 윈도우 오른쪽 아래 알림) 공용 문구·데이터
// - FCM 푸시(서버 SQL sfa_push_build) / 윈도우 sfa_notify / 로컬 알림이 모두 같은 형식을 씀
// - 서버(SQL)와 사이트가 똑같은 문구를 만들어야 하므로 규칙을 바꿀 때는 SQL 도 함께 바꿀 것
// ---------------------------------------------------------------------

export type AppNotificationKind = 'user' | 'report' | 'suggestion' | 'appeal'
export type AdminReportNoticeType = 'report' | 'review_required'

/** 알림에 실어 보내는 데이터 (모든 값은 문자열) – 누르면 이 값으로 이동할 곳을 정함 */
export interface AppNotificationData {
  kind: AppNotificationKind
  /** 해당 행의 id (user_notifications / admin_notifications / site_suggestions / blacklist_appeals) */
  id: string
  type?: NotificationType | AdminReportNoticeType
  post_id?: string
  comment_id?: string
}

export interface OsNotification {
  title: string
  body: string
  data: AppNotificationData
}

export const USER_NOTIFICATION_TITLES: Record<NotificationType, string> = {
  post_like: '좋아요',
  post_comment: '새 댓글',
  comment_reply: '새 답글',
}

export const ADMIN_NOTIFICATION_TITLES = {
  report: '신고 접수',
  review_required: '신고 검토 필요',
  suggestion: '새 건의사항',
  appeal: '블랙리스트 이의제기',
} as const

const ADMIN_REPORT_FALLBACK_BODY: Record<AdminReportNoticeType, string> = {
  report: '새 신고가 접수되었습니다.',
  review_required: '신고가 누적되어 검토가 필요합니다.',
}

const ANONYMOUS_NICKNAME = '익명사용자'
const APPEAL_PREVIEW_MAX = 80

const toIdString = (value: number | string | null | undefined): string | undefined =>
  value === null || value === undefined || value === '' ? undefined : String(value)

/** 좋아요 / 댓글 / 답글 알림 (user_notifications 행) */
export const buildUserOsNotification = (n: UserNotification): OsNotification => {
  const data: AppNotificationData = { kind: 'user', id: String(n.id), type: n.type }
  const postId = toIdString(n.post_id)
  const commentId = toIdString(n.comment_id)
  if (postId) data.post_id = postId
  if (commentId) data.comment_id = commentId
  return {
    title: USER_NOTIFICATION_TITLES[n.type] ?? '알림',
    body: describeNotification(n),
    data,
  }
}

export interface AdminReportRow {
  id: number
  type: string | null
  message?: string | null
  post_id?: number | null
  comment_id?: number | null
}

/** 신고 접수 / 신고 검토 필요 알림 (admin_notifications 행). 다른 type 이면 null */
export const buildReportOsNotification = (row: AdminReportRow): OsNotification | null => {
  if (row.type !== 'report' && row.type !== 'review_required') return null
  const type: AdminReportNoticeType = row.type
  const data: AppNotificationData = { kind: 'report', id: String(row.id), type }
  const postId = toIdString(row.post_id)
  const commentId = toIdString(row.comment_id)
  if (postId) data.post_id = postId
  if (commentId) data.comment_id = commentId
  return {
    title: ADMIN_NOTIFICATION_TITLES[type],
    body: (row.message || '').trim() || ADMIN_REPORT_FALLBACK_BODY[type],
    data,
  }
}

export interface SuggestionRow {
  id: number
  user_nickname?: string | null
  category?: string | null
  title?: string | null
}

/** 새 건의사항 알림 (site_suggestions 행) – "닉네임: [분류] 제목" */
export const buildSuggestionOsNotification = (row: SuggestionRow): OsNotification => ({
  title: ADMIN_NOTIFICATION_TITLES.suggestion,
  body: `${row.user_nickname || ANONYMOUS_NICKNAME}: [${row.category ?? ''}] ${row.title ?? ''}`,
  data: { kind: 'suggestion', id: String(row.id) },
})

/** 공백을 한 칸으로 모으고 앞에서부터 max 글자 (말줄임표 없음, 이모지도 한 글자로 셈 – SQL left() 와 같게) */
export const collapsePreview = (text: string | null | undefined, max: number): string =>
  Array.from((text || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('')

export interface AppealRow {
  id: number
  user_nickname?: string | null
  message?: string | null
}

/** 블랙리스트 이의제기 알림 (blacklist_appeals 행) – "닉네임: 내용 앞 80자" */
export const buildAppealOsNotification = (row: AppealRow): OsNotification => ({
  title: ADMIN_NOTIFICATION_TITLES.appeal,
  body: `${row.user_nickname || ANONYMOUS_NICKNAME}: ${collapsePreview(row.message, APPEAL_PREVIEW_MAX)}`,
  data: { kind: 'appeal', id: String(row.id) },
})

const APP_NOTIFICATION_KINDS: readonly AppNotificationKind[] = ['user', 'report', 'suggestion', 'appeal']

/**
 * 알림 데이터 읽기 (FCM data 객체 / 로컬 알림 extra / 윈도우 이벤트의 JSON 문자열 모두 받음).
 * 형식이 맞지 않으면 null
 */
export const parseAppNotificationData = (raw: unknown): AppNotificationData | null => {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const kind = obj.kind
  if (typeof kind !== 'string' || !APP_NOTIFICATION_KINDS.includes(kind as AppNotificationKind)) return null
  const id = obj.id === null || obj.id === undefined ? '' : String(obj.id)
  if (!id) return null

  const data: AppNotificationData = { kind: kind as AppNotificationKind, id }
  const type = obj.type
  if (
    typeof type === 'string' &&
    (type === 'post_like' || type === 'post_comment' || type === 'comment_reply' || type === 'report' || type === 'review_required')
  ) {
    data.type = type
  }
  const postId = toIdString(obj.post_id as string | number | null | undefined)
  const commentId = toIdString(obj.comment_id as string | number | null | undefined)
  if (postId) data.post_id = postId
  if (commentId) data.comment_id = commentId
  return data
}

/** 같은 알림을 두 번 띄우지 않기 위한 고유 키 (예: "user:123") */
export const appNotificationKey = (data: Pick<AppNotificationData, 'kind' | 'id'>): string => `${data.kind}:${data.id}`
