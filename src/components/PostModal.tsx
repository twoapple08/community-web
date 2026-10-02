'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { X, Calendar, User as UserIcon, Trash2, Share2, Check } from 'lucide-react'

interface Post {
  id: string
  title: string
  content: string
  created_at: string
  author_id: string
}

interface PostModalProps {
  postId: string
  onClose: () => void
  onDeleted?: () => void
}

export default function PostModal({ postId, onClose, onDeleted }: PostModalProps) {
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  // ESC 키 입력 감지 시 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 현재 사용자 및 게시글 단건 조회
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null)
    })

    const fetchPost = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (!error && data) {
        setPost(data)
      }
      setLoading(false)
    }

    if (postId) {
      fetchPost()
    }
  }, [postId])

  // URL 공유 클립보드 복사
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('주소 복사에 실패했습니다.')
    }
  }

  // 게시글 삭제 처리
  const handleDelete = async () => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return

    setDeleting(true)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      alert(`게시글 삭제 실패: ${error.message}`)
      setDeleting(false)
    } else {
      alert('게시글이 삭제되었습니다.')
      onClose()
      if (onDeleted) onDeleted()
      router.refresh()
    }
  }

  const isAuthor = currentUserId && post && currentUserId === post.author_id

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 툴바 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
              title="게시글 링크 복사"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copied ? '링크 복사됨' : '공유'}</span>
            </button>

            {isAuthor && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900/50 transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? '삭제 중...' : '삭제'}</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="overflow-y-auto px-6 py-6 sm:px-8 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-zinc-400 dark:text-zinc-500">
              내용을 불러오는 중입니다...
            </div>
          ) : !post ? (
            <div className="py-20 text-center text-zinc-500">
              존재하지 않거나 삭제된 게시글입니다.
            </div>
          ) : (
            <>
              <header className="space-y-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-snug">
                  {post.title}
                </h2>
                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" />
                    작성자
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
              </header>

              <div
                className="prose prose-zinc dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed text-base [&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-4 [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
