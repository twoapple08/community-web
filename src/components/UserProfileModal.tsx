'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchRoleMap } from '@/lib/roles'
import { getPostPath, selectPostsWithNo } from '@/lib/postRoute'
import { markOpenedFromFeed } from '@/lib/feedStore'
import {
  fetchProfileStats,
  fetchPublicProfile,
  forgetProfileHistoryEntry,
  onProfileChanged,
  type ProfileStats,
  type PublicProfile,
} from '@/lib/userProfile'
import Avatar from './Avatar'
import { CrownIcon, type RoleType } from './CrownIcon'
import { X, Loader2, Lock, UserX, FileText, Heart, MessageSquare, Calendar } from 'lucide-react'

interface ProfilePost {
  id: number | string
  post_no?: number | null
  title: string | null
  created_at: string
  likes_count?: number | null
  comments_count?: number | null
  thumbnail_url?: string | null
  is_official?: boolean | null
  feed_type?: string | null
  board_category?: string | null
  is_preview_hidden?: boolean | null
  delete_requested?: boolean | null
}

interface UserProfileModalProps {
  userId: string
  onClose: () => void
}

const POST_LIMIT = 100
const POST_COLUMNS =
  'id, title, created_at, likes_count, comments_count, thumbnail_url, is_official, feed_type, board_category, is_preview_hidden, delete_requested'
// 일부 컬럼이 아직 없는 DB 에서도 목록이 비지 않도록 기존(내가 쓴 게시글)과 같은 기본 컬럼으로 재조회
const BASIC_POST_COLUMNS = 'id, title, created_at, likes_count, thumbnail_url, is_official, feed_type'

// 프로필 id 는 uuid → 잘못된 주소(?profile=abc)면 DB 요청 없이 바로 '없는 사용자'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const queryAuthorPosts = async (userId: string, columns: string): Promise<ProfilePost[] | null> => {
  let failed = false
  const rows = await selectPostsWithNo<ProfilePost>(columns, async (cols) => {
    const res = await supabase
      .from('posts')
      .select(cols)
      .eq('author_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(POST_LIMIT)
    failed = Boolean(res.error)
    return res
  })
  return failed ? null : rows
}

const fetchAuthorPosts = async (userId: string): Promise<ProfilePost[]> => {
  const full = await queryAuthorPosts(userId, POST_COLUMNS)
  if (full) return full
  return (await queryAuthorPosts(userId, BASIC_POST_COLUMNS)) ?? []
}

const roleLabel = (role: RoleType): string | null =>
  role === 'creator' ? '제작자' : role === 'super_admin' ? '최고관리자' : role === 'admin' ? '일반관리자' : null

/** 목록 오른쪽 작은 썸네일 (이미지가 깨지면 자리만 비움) */
function PostThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <span className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </span>
  )
}

/** 통계 칸 (320px 화면에서도 한 줄에 3칸이 들어가도록 아이콘 없이 글자만) */
function StatTile({ label, value, loading }: { label: string; value: number | null | undefined; loading: boolean }) {
  return (
    <div className="min-w-0 flex flex-col items-center justify-center gap-1 px-1.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 text-center">
      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 leading-tight">{label}</span>
      {loading ? (
        <Loader2 className="w-4 h-4 my-0.5 animate-spin text-zinc-400 dark:text-zinc-500" />
      ) : value === null || value === undefined ? (
        <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 py-0.5">
          <Lock className="w-3 h-3 shrink-0" />
          <span>비공개</span>
        </span>
      ) : (
        <span className="text-base font-black text-zinc-900 dark:text-white tabular-nums leading-tight">
          {value.toLocaleString()}
        </span>
      )}
    </div>
  )
}

export default function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const router = useRouter()
  const validId = UUID_RE.test(userId)
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropDownRef = useRef(false)

  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found'>(validId ? 'loading' : 'not_found')
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [role, setRole] = useState<RoleType>(null)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(validId)
  const [posts, setPosts] = useState<ProfilePost[]>([])
  const [postsHitLimit, setPostsHitLimit] = useState(false)
  const [postsLoading, setPostsLoading] = useState(validId)

  useEffect(() => {
    if (!validId) return
    let cancelled = false

    // 프로필 확인을 기다리지 않고 나머지 요청도 동시에 보내 대기 시간을 줄임
    const viewerPromise = supabase.auth
      .getSession()
      .then(({ data }) => data.session?.user?.id ?? null)
      .catch(() => null)

    fetchPublicProfile(userId)
      .catch(() => null)
      .then((row) => {
        if (cancelled) return
        setProfile(row)
        setStatus(row ? 'ready' : 'not_found')
      })

    viewerPromise.then((id) => {
      if (!cancelled) setViewerId(id)
    })

    fetchRoleMap()
      .then((map) => {
        if (!cancelled) setRole(map[userId] ?? null)
      })
      .catch(() => {})

    fetchProfileStats(userId)
      .catch(() => null)
      .then((result) => {
        if (cancelled) return
        setStats(result)
        setStatsLoading(false)
      })

    Promise.all([fetchAuthorPosts(userId).catch(() => [] as ProfilePost[]), viewerPromise]).then(([rows, viewer]) => {
      if (cancelled) return
      // 삭제 신청(비공개 처리)된 글은 작성자 본인에게만 표시
      setPosts(rows.filter((p) => !p.delete_requested || viewer === userId))
      setPostsHitLimit(rows.length >= POST_LIMIT)
      setPostsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [userId, validId])

  // 내 프로필을 보는 중에 닉네임/사진/소개를 바꾸면 바로 반영
  useEffect(() => {
    return onProfileChanged((event) => {
      if (event.userId !== userId) return
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              ...(event.nickname !== undefined ? { nickname: event.nickname } : {}),
              ...(event.avatar_url !== undefined ? { avatar_url: event.avatar_url } : {}),
              ...(event.bio !== undefined ? { bio: event.bio } : {}),
            }
          : prev
      )
    })
  }, [userId])

  // Esc 로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 키보드 사용자를 위해 창이 열리면 포커스를 창 안으로
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  const handleOpenPost = (post: ProfilePost) => {
    // 글로 이동하면 프로필 기록(?profile)은 뒤로가기 대상으로 남겨 둠 → 글을 닫으면 프로필로 돌아옴
    forgetProfileHistoryEntry()
    markOpenedFromFeed()
    router.push(getPostPath(post))
  }

  const nickname = profile?.nickname?.trim() || '익명사용자'
  const bio = profile?.bio?.trim() || ''
  const isMe = Boolean(viewerId) && viewerId === userId
  const badge = roleLabel(role)

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in duration-150"
      onMouseDown={(e) => {
        // 창 안에서 드래그하다 바깥에서 손을 뗀 경우는 닫지 않음
        backdropDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropDownRef.current) onClose()
        backdropDownRef.current = false
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-modal-title"
        tabIndex={-1}
        className="w-full max-w-md my-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden outline-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 id="user-profile-modal-title" className="text-base font-bold text-zinc-900 dark:text-white">
            프로필
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 -mr-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {status === 'loading' && (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <span className="text-xs">프로필을 불러오는 중...</span>
          </div>
        )}

        {status === 'not_found' && (
          <div className="py-16 px-5 flex flex-col items-center justify-center gap-2 text-center">
            <UserX className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400">존재하지 않는 사용자입니다.</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="px-4 sm:px-5 pt-5 pb-4 sm:pb-5 space-y-4">
            {/* 상단: 사진 / 닉네임 / 권한 / 한 줄 소개 */}
            <div className="flex flex-col items-center text-center min-w-0">
              <Avatar src={profile?.avatar_url} size={80} alt={`${nickname} 프로필 사진`} className="shadow-sm" />
              <div className="mt-3 flex items-center justify-center gap-1.5 max-w-full min-w-0">
                <CrownIcon role={role} className="w-5 h-5" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-white break-all leading-tight min-w-0">
                  {nickname}
                </h3>
              </div>
              {(badge || isMe) && (
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                  {badge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                      {badge}
                    </span>
                  )}
                  {isMe && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                      내 프로필
                    </span>
                  )}
                </div>
              )}
              {bio && (
                <p className="mt-2 max-w-full text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed break-words">{bio}</p>
              )}
            </div>

            {/* 활동 통계 (좋아요/댓글 수는 본인이 숨기면 비공개) */}
            <div className="grid grid-cols-3 gap-2">
              {/* 통계 조회가 완전히 실패하면 게시글 수는 불러온 목록 개수로 대신 표시 */}
              <StatTile
                label="게시글"
                value={stats ? stats.post_count : posts.length}
                loading={statsLoading || (!stats && postsLoading)}
              />
              <StatTile label="누른 좋아요" value={stats ? stats.like_count : null} loading={statsLoading} />
              <StatTile label="댓글" value={stats ? stats.comment_count : null} loading={statsLoading} />
            </div>

            {/* 작성한 게시글 목록 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>
                  작성한 게시글
                  {!postsLoading && ` (${posts.length}${postsHitLimit ? '+' : ''})`}
                </span>
              </div>

              {postsLoading ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  <span className="text-xs">게시글 목록을 불러오는 중...</span>
                </div>
              ) : posts.length === 0 ? (
                <div className="py-10 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">작성한 게시글이 없습니다.</p>
                </div>
              ) : (
                <div className="max-h-[45vh] sm:max-h-[50vh] overflow-y-auto overscroll-contain space-y-2 pr-1">
                  {posts.map((post) => {
                    const isCommunity = post.feed_type === 'community'
                    const showThumb = Boolean(post.thumbnail_url) && !post.is_preview_hidden
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => handleOpenPost(post)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 cursor-pointer transition group"
                      >
                        <span className="min-w-0 flex-1 block">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shrink-0">
                              {isCommunity ? '커뮤니티' : '클랜'}
                            </span>
                            {post.is_official && (
                              <span className="text-[10px] font-extrabold text-emerald-500 shrink-0">[공식]</span>
                            )}
                            <span className="text-xs font-bold text-zinc-900 dark:text-white truncate min-w-0 group-hover:text-emerald-500 transition">
                              {post.title || '제목 없음'}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              {new Date(post.created_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1 text-rose-500">
                              <Heart className="w-3.5 h-3.5 shrink-0 fill-rose-500/30" />
                              {post.likes_count ?? 0}
                            </span>
                            {isCommunity && typeof post.comments_count === 'number' && (
                              <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
                                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                {post.comments_count}
                              </span>
                            )}
                            {isCommunity && post.board_category && post.board_category !== '모두' && (
                              <span className="font-bold text-blue-500 dark:text-blue-400">{post.board_category}</span>
                            )}
                            {post.delete_requested && (
                              <span className="font-extrabold px-1.5 py-0.5 rounded bg-amber-500 text-white dark:bg-amber-600 dark:text-white">
                                삭제 신청
                              </span>
                            )}
                          </span>
                        </span>
                        {showThumb && <PostThumb src={post.thumbnail_url as string} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
