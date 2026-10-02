import { CrownIcon, RoleType } from "@/components/CrownIcon";
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Calendar, User as UserIcon, Image as ImageIcon, RotateCw } from 'lucide-react'
import PostModal from '@/components/PostModal'

interface Post {
  id: string
  title: string
  content: string
  created_at: string
  author_id: string
  author_nickname?: string
}

const extractFirstImage = (html: string): string | null => {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : null
}

const extractPlainText = (html: string): string => {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const countImages = (html: string): number => {
  const matches = html.match(/<img[^>]+src=["']([^"']+)["']/gi)
  return matches ? matches.length : 0
}

function FeedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activePostId = searchParams.get('post')

  const [posts, setPosts] = useState<Post[]>([])
  const [rolesMap, setRolesMap] = useState<Record<string, RoleType>>({});

  useEffect(() => {
    supabase.from("user_roles").select("user_id, role, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, RoleType> = {};
      data.forEach((r: any) => {
        if (r.user_id) map[r.user_id] = r.role;
        if (r.email === "iwsamuel08@gmail.com" && r.user_id) map[r.user_id] = "creator";
      });
      setRolesMap(map);
    });
  }, []);
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchPosts = async () => {
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })

    if (!postsError && postsData) {
      const authorIds = Array.from(new Set(postsData.map((p) => p.author_id).filter(Boolean)))
      const profileMap: Record<string, string> = {}

      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname')
          .in('id', authorIds)

        if (profilesData) {
          profilesData.forEach((profile) => {
            profileMap[profile.id] = profile.nickname
          })
        }
      }

      const formattedPosts = postsData.map((post) => ({
        ...post,
        author_nickname: profileMap[post.author_id] || '작성자',
      }))

      setPosts(formattedPosts)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPosts()
  }, [])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await fetchPosts()
    setTimeout(() => {
      setIsRefreshing(false)
    }, 400)
  }

  const handleOpenPost = (id: string) => {
    router.push(`/?post=${id}`, { scroll: false })
  }

  const handleClosePost = () => {
    router.push('/', { scroll: false })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 헤더 및 전용 새로고침 버튼 바 */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">커뮤니티 피드</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">자유롭게 소통하고 게시글을 공유하세요.</p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition shadow-sm disabled:opacity-50"
          title="피드 새로고침"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          <span>{isRefreshing ? '갱신 중...' : '새로고침'}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-400 dark:text-zinc-500">게시글 목록을 불러오는 중...</div>
      ) : posts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
          <MessageSquare className="w-10 h-10 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-700 dark:text-zinc-300 font-medium">아직 등록된 게시글이 없습니다.</p>
          <p className="text-sm text-zinc-500 mt-1">상단 '글쓰기' 버튼을 눌러 첫 번째 게시글을 작성해 보세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const thumbnail = extractFirstImage(post.content)
            const plainText = extractPlainText(post.content)
            const imageCount = countImages(post.content)

            return (
              <article
                key={post.id}
                onClick={() => handleOpenPost(post.id)}
                className="group p-5 sm:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-2xl transition duration-200 shadow-sm dark:shadow-md cursor-pointer select-none"
              >
                <div className="flex items-start justify-between gap-4 sm:gap-6">
                  <div className="flex-1 min-w-0 space-y-2">
                    <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {post.title}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {plainText || '내용이 없습니다.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-zinc-500 pt-1">
                      <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                        <CrownIcon role={rolesMap[post.author_id]} className="w-4 h-4" />
                        {post.author_nickname}
                      </span>
                      <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                      {imageCount > 1 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                          <ImageIcon className="w-3 h-3" />
                          +{imageCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {thumbnail && (
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800/80">
                      <img
                        src={thumbnail}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {activePostId && (
        <PostModal
          postId={activePostId}
          onClose={handleClosePost}
          onDeleted={fetchPosts}
        />
      )}
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">피드 데이터를 불러오는 중...</div>}>
      <FeedContent />
    </Suspense>
  )
}