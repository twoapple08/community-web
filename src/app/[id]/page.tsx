'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Calendar, User as UserIcon, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Post {
  id: string
  title: string
  content: string
  created_at: string
  author_id: string
}

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [post, setPost] = useState<Post | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null)
    })

    const fetchPost = async () => {
      if (!id) return
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .single()

      if (!error && data) {
        setPost(data)
      }
      setLoading(false)
    }

    fetchPost()
  }, [id])

  const handleDelete = async () => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return

    setDeleting(true)
    const { error } = await supabase.from('posts').delete().eq('id', id)

    if (error) {
      alert(`게시글 삭제 실패: ${error.message}`)
      setDeleting(false)
    } else {
      alert('게시글이 삭제되었습니다.')
      router.push('/')
      router.refresh()
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center text-zinc-400 dark:text-zinc-500">
        게시글 데이터를 로드 중입니다...
      </div>
    )
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-zinc-700 dark:text-zinc-300 font-medium">존재하지 않거나 삭제된 게시글입니다.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm font-medium hover:opacity-80 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          피드로 돌아가기
        </Link>
      </div>
    )
  }

  const isAuthor = currentUserId && currentUserId === post.author_id

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      {/* 상단 네비게이션 및 액션 바 */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800 mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로 돌아가기
        </Link>

        {isAuthor && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900/50 transition disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleting ? '삭제 진행 중...' : '게시글 삭제'}</span>
          </button>
        )}
      </div>

      {/* 게시글 메타 정보 */}
      <header className="space-y-4 mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
          {post.title}
        </h1>
        <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <UserIcon className="w-4 h-4" />
            작성자
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {new Date(post.created_at).toLocaleDateString()}
          </span>
        </div>
      </header>

      {/* 게시글 본문 렌더링 영역 (이미지 포함) */}
      <div
        className="prose prose-zinc dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed text-base [&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-6 [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </article>
  )
}
