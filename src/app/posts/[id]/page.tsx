'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPostPath, selectPostsWithNo } from '@/lib/postRoute'

// 예전 주소(/posts/번호) 호환용: 새 게시글 주소(/clan/번호, /community/번호)로 자동 이동
// (예전 페이지는 본문 보안 정화 없이 HTML 을 그대로 출력하던 문제가 있어 교체)
export default function LegacyPostRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id || !/^\d+$/.test(id)) {
      setNotFound(true)
      return
    }
    let cancelled = false
    selectPostsWithNo<{ id: number; feed_type: string; post_no?: number | null }>('id, feed_type', (cols) =>
      supabase.from('posts').select(cols).eq('id', Number(id)).limit(1)
    ).then((rows) => {
      if (cancelled) return
      if (rows[0]) router.replace(getPostPath(rows[0]))
      else setNotFound(true)
    })
    return () => {
      cancelled = true
    }
  }, [id, router])

  if (!notFound) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center text-zinc-500 dark:text-zinc-500">
        게시글 데이터를 로드 중입니다...
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
      <p className="text-zinc-700 dark:text-zinc-300 font-medium">존재하지 않거나 삭제된 게시글입니다.</p>
      <Link
        href="/community"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm font-medium hover:opacity-80 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        피드로 돌아가기
      </Link>
    </div>
  )
}
