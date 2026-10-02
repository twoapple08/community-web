'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Calendar, User as UserIcon } from 'lucide-react'

interface Post {
  id: string
  title: string
  content: string
  created_at: string
  author_id: string
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPosts = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setPosts(data)
      }
      setLoading(false)
    }

    fetchPosts()
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">커뮤니티 피드</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">자유롭게 소통하고 게시글을 공유하세요.</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-400 dark:text-zinc-500">게시글 목록을 불러오는 중...</div>
      ) : posts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
          <MessageSquare className="w-10 h-10 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-700 dark:text-zinc-300 font-medium">아직 등록된 게시글이 없습니다.</p>
          <p className="text-sm text-zinc-500 mt-1">상단 '글쓰기' 버튼을 눌러 첫 번째 게시글을 작성해 보세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-2xl transition shadow-sm dark:shadow-md space-y-3"
            >
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{post.title}</h2>
              <div
                className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3 prose prose-zinc dark:prose-invert max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
              <div className="flex items-center gap-4 text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/80 pt-3 mt-2">
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <UserIcon className="w-3.5 h-3.5" />
                  작성자
                </span>
                <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(post.created_at).toLocaleDateString()}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
