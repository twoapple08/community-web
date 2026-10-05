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
