'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPostPath, selectPostsWithNo } from '@/lib/postRoute'
import { commentAnchor } from '@/lib/notifications'
import { Calendar, Loader2 } from 'lucide-react'

interface MyCommentRow {
  id: number
  post_id: number
  parent_id: number | null
  content: string | null
  image_url?: string | null
  created_at: string
}

interface CommentPost {
  id: number
  post_no?: number | null
  title: string | null
  feed_type?: string | null
  is_deleted?: boolean | null
}

interface MyCommentItem {
  comment: MyCommentRow
  post: CommentPost
}

interface MyCommentsViewProps {
  userId: string
  /** 댓글 위치 주소로 이동 (허브 닫기 + 페이지 이동은 부모가 처리) */
  onNavigate: (path: string) => void
}

const COMMENT_LIMIT = 100

const fetchMyComments = async (userId: string): Promise<MyCommentItem[]> => {
  const query = (columns: string) =>
    supabase
      .from('post_comments')
      .select(columns)
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(COMMENT_LIMIT)

  let res = await query('id, post_id, parent_id, content, image_url, created_at')
  // 사진 컬럼이 없는 예전 DB 에서도 목록은 보이도록 재조회
  if (res.error) res = await query('id, post_id, parent_id, content, created_at')
  if (res.error || !res.data) return []
  const comments = res.data as unknown as MyCommentRow[]
  if (comments.length === 0) return []

  const postIds = Array.from(new Set(comments.map((c) => c.post_id).filter(Boolean)))
  const posts = await selectPostsWithNo<CommentPost>('id, title, feed_type, is_deleted', (cols) =>
    supabase.from('posts').select(cols).in('id', postIds)
  )
  const postMap = new Map(posts.map((p) => [String(p.id), p]))

  // 삭제됐거나 숨겨진 글의 댓글은 이동할 곳이 없으므로 제외
  return comments.flatMap((comment) => {
    const post = postMap.get(String(comment.post_id))
    if (!post || post.is_deleted) return []
    return [{ comment, post }]
  })
}

/** 마이 프로필 > 내가 쓴 댓글 */
export default function MyCommentsView({ userId, onNavigate }: MyCommentsViewProps) {
  const [items, setItems] = useState<MyCommentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchMyComments(userId)
      .catch(() => [] as MyCommentItem[])
      .then((list) => {
        if (cancelled) return
        setItems(list)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div className="p-5">
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs">댓글 목록을 불러오는 중...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
          <p className="font-semibold text-zinc-500 dark:text-zinc-400">작성한 댓글이 없습니다.</p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto overscroll-contain space-y-2 pr-1">
          {items.map(({ comment, post }) => {
            const text = (comment.content || '').trim()
            return (
              <button
                key={comment.id}
                type="button"
                onClick={() => onNavigate(getPostPath(post) + commentAnchor(comment.id))}
                className="w-full text-left p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 cursor-pointer transition group space-y-1"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shrink-0">
                    {post.feed_type === 'community' ? '커뮤니티' : '클랜'}
                  </span>
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 truncate min-w-0 group-hover:text-emerald-500 transition">
                    {post.title || '제목 없음'}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 min-w-0">
                  {comment.parent_id && (
                    <span className="mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 shrink-0">
                      답글
                    </span>
                  )}
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2 break-words min-w-0">
                    {text || (comment.image_url ? '(사진)' : '')}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
