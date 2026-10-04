'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import {
  X,
  ArrowLeft,
  User,
  FileText,
  Heart,
  ChevronRight,
  Calendar,
  Check,
  Loader2,
  RefreshCw,
  Snowflake,
  ShieldAlert
} from 'lucide-react'

type ModalView = 'menu' | 'nickname' | 'my_posts' | 'liked_posts'

interface PostItem {
  id: string
  title: string
  created_at: string
  likes_count: number
  thumbnail_url?: string | null
  is_official?: boolean
}

interface UserHubModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  userEmail: string
  userRole: RoleType
  currentNickname: string
  onNicknameUpdated: (newNick: string) => void
}

export default function UserHubModal({
  isOpen,
  onClose,
  userId,
  userEmail,
  userRole,
  currentNickname,
  onNicknameUpdated,
}: UserHubModalProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentView, setCurrentView] = useState<ModalView>('menu')

  const [newNickname, setNewNickname] = useState(currentNickname)
  const [updatingNickname, setUpdatingNickname] = useState(false)

  const [posts, setPosts] = useState<PostItem[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const isCreator = userRole === 'creator' || userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'
  const [isFrozen, setIsFrozen] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [isTogglingFreeze, setIsTogglingFreeze] = useState(false)

  // 번호 재정렬(노란색) 및 사이트 동결(하늘색) 전용 모달 상태
  const [confirmReindexOpen, setConfirmReindexOpen] = useState(false)
  const [noticeModal, setNoticeModal] = useState<{ text: string; theme: 'yellow' | 'sky' } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu')
      setNewNickname(currentNickname)
      if (isCreator) {
        checkFreezeStatus()
      }
    }
  }, [isOpen, currentNickname, isCreator])

  const checkFreezeStatus = async () => {
    const { data } = await supabase
      .from('site_notices')
      .select('is_frozen')
      .eq('id', 1)
      .maybeSingle()
    if (data) {
      setIsFrozen(Boolean(data.is_frozen))
    }
  }

  const handleToggleFreeze = async () => {
    setIsTogglingFreeze(true)
    const nextStatus = !isFrozen
    const { error } = await supabase
      .from('site_notices')
      .upsert({ id: 1, is_frozen: nextStatus, updated_at: new Date().toISOString() })

    if (error) {
      setNoticeModal({ text: `사이트 얼리기 상태 변경 실패: ${error.message}`, theme: 'sky' })
    } else {
      setIsFrozen(nextStatus)
      setNoticeModal({
        text: nextStatus ? '사이트가 성공적으로 동결(얼리기)되었습니다.' : '사이트 동결이 해제되었습니다.',
        theme: 'sky'
      })
    }
    setIsTogglingFreeze(false)
  }

  const handleExecuteReindex = async () => {
    setIsReindexing(true)
    const { data, error } = await supabase.rpc('reindex_post_ids')
    setConfirmReindexOpen(false)
    if (error) {
      setNoticeModal({ text: `게시글 번호 초기화 실패: ${error.message}`, theme: 'yellow' })
    } else {
      setNoticeModal({
        text: `총 ${data?.count || 0}개의 게시글 번호가 1번부터 차례대로 성공적으로 재정렬되었습니다.`,
        theme: 'yellow'
      })
      router.refresh()
    }
    setIsReindexing(false)
  }

  const fetchMyPosts = async () => {
    setLoadingPosts(true)
    const { data } = await supabase
      .from('posts')
      .select('id, title, created_at, likes_count, thumbnail_url, is_official')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })

    if (data) {
      setPosts(data as PostItem[])
    }
    setLoadingPosts(false)
  }

  const fetchLikedPosts = async () => {
    setLoadingPosts(true)
    const { data: likeRecords } = await supabase
      .from('post_likes')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (likeRecords && likeRecords.length > 0) {
      const postIds = likeRecords.map((r: any) => r.post_id)
      const { data: postData } = await supabase
        .from('posts')
        .select('id, title, created_at, likes_count, thumbnail_url, is_official')
        .in('id', postIds)

      if (postData) {
        const postMap = new Map(postData.map((p: any) => [p.id, p]))
        const ordered = postIds
          .map((id) => postMap.get(id))
          .filter(Boolean) as PostItem[]
        setPosts(ordered)
      } else {
        setPosts([])
      }
    } else {
      setPosts([])
    }
    setLoadingPosts(false)
  }

  const handleSelectView = (view: ModalView) => {
    setCurrentView(view)
    if (view === 'my_posts') {
      fetchMyPosts()
    } else if (view === 'liked_posts') {
      fetchLikedPosts()
    }
  }

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNickname.trim()) {
      setNoticeModal({ text: '닉네임을 입력해 주십시오.', theme: 'sky' })
      return
    }
    if (newNickname.trim().length > 15) {
      setNoticeModal({ text: '닉네임은 15자 이하로 설정해 주십시오.', theme: 'sky' })
      return
    }

    setUpdatingNickname(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        nickname: newNickname.trim(),
      })

    if (error) {
      setNoticeModal({ text: `닉네임 저장 실패: ${error.message}`, theme: 'sky' })
    } else {
      onNicknameUpdated(newNickname.trim())
      setNoticeModal({ text: '닉네임이 성공적으로 변경되었습니다.', theme: 'sky' })
      setCurrentView('menu')
    }
    setUpdatingNickname(false)
  }

  const handleOpenPost = (postId: string) => {
    onClose()
    router.push(`/?post=${postId}`, { scroll: false })
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {currentView !== 'menu' && (
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="p-1 -ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              {currentView === 'menu' && '마이 메뉴'}
              {currentView === 'nickname' && '닉네임 변경'}
              {currentView === 'my_posts' && '내가 쓴 게시글'}
              {currentView === 'liked_posts' && '좋아요 누른 게시글'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentView === 'menu' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CrownIcon role={userRole} className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {currentNickname || '익명사용자'}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                    {userRole === 'creator' ? '제작자' : userRole === 'super_admin' ? '최고관리자' : userRole === 'admin' ? '일반관리자' : '일반회원'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{userEmail}</p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSelectView('nickname')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-blue-500 transition">
                      닉네임 변경
                    </h3>
                    <p className="text-[11px] text-zinc-400">활동 프로필 닉네임을 수정합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectView('my_posts')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition">
                      내가 쓴 게시글
                    </h3>
                    <p className="text-[11px] text-zinc-400">내가 작성한 모든 글을 모아봅니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectView('liked_posts')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-rose-500 transition">
                      내가 좋아요 누른 게시글
                    </h3>
                    <p className="text-[11px] text-zinc-400">좋아요를 누른 관심 게시글을 확인합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition" />
              </button>
            </div>

            {isCreator && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center gap-1.5 px-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    사이트 제작자 전용 콘솔
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReindexOpen(true)}
                    disabled={isReindexing}
                    className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
                    <span>게시글 번호 초기화</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleFreeze}
                    disabled={isTogglingFreeze}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50 border ${
                      isFrozen
                        ? 'bg-sky-600 text-white border-sky-500 shadow-md animate-pulse'
                        : 'border-sky-500/40 bg-sky-950/20 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>{isFrozen ? '얼리기 해제 (동결 중)' : '사이트 얼리기'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'nickname' && (
          <form onSubmit={handleSaveNickname} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                새 닉네임 (최대 15자)
              </label>
              <input
                type="text"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder="사용할 닉네임을 입력하세요"
                maxLength={15}
                autoFocus
                className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                disabled={updatingNickname}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                이전
              </button>
              <button
                type="submit"
                disabled={updatingNickname}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {updatingNickname ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{updatingNickname ? '저장 중...' : '변경 완료'}</span>
              </button>
            </div>
          </form>
        )}

        {(currentView === 'my_posts' || currentView === 'liked_posts') && (
          <div className="p-5">
            {loadingPosts ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-xs">게시글 목록을 불러오는 중...</span>
              </div>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-500 dark:text-zinc-400">
                  {currentView === 'my_posts' ? '작성한 게시글이 없습니다.' : '좋아요를 누른 게시글이 없습니다.'}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {currentView === 'my_posts' ? '새 글을 작성해 보세요!' : '마음에 드는 글에 좋아요를 눌러보세요.'}
                </p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => handleOpenPost(post.id)}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 cursor-pointer transition group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        {post.is_official && (
                          <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
                            [공식]
                          </span>
                        )}
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate group-hover:text-emerald-500 transition">
                          {post.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1 text-rose-500">
                          <Heart className="w-3.5 h-3.5 fill-rose-500/30" />
                          {post.likes_count ?? 0}
                        </span>
                      </div>
                    </div>
                    {post.thumbnail_url && (
                      <img
                        src={post.thumbnail_url}
                        alt="썸네일"
                        className="w-10 h-10 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1. 번호 재정렬 확인 팝업 (직각 + 노란색 테두리 + 라이트모드 색반전 + 텍스트 중앙 정렬) */}
      {mounted && confirmReindexOpen && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isReindexing && setConfirmReindexOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-black border-2 border-amber-600 dark:border-yellow-400 rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2 text-center">
              <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-bold leading-relaxed">
                모든 게시글의 번호를 1번부터 차례대로 재정렬하시겠습니까?
              </p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                기존 좋아요 및 신고 기록은 새 번호로 안전하게 보존됩니다.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmReindexOpen(false)}
                disabled={isReindexing}
                className="px-5 py-2 text-xs font-semibold rounded-none border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteReindex}
                disabled={isReindexing}
                className="px-5 py-2 text-xs font-bold rounded-none bg-amber-600 hover:bg-amber-700 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isReindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isReindexing ? '재정렬 중...' : '확인'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 2. 커스텀 결과 알림 팝업 (테마에 따라 yellow 또는 sky 직각 테두리) */}
      {mounted && noticeModal && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setNoticeModal(null)}
        >
          <div
            className={`w-full max-w-sm bg-white dark:bg-black border-2 rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150 ${
              noticeModal.theme === 'yellow'
                ? 'border-amber-600 dark:border-yellow-400'
                : 'border-sky-600 dark:border-sky-400'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs sm:text-sm text-zinc-900 dark:text-white leading-relaxed font-semibold">
              {noticeModal.text}
            </p>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setNoticeModal(null)}
                className={`px-6 py-2 text-xs font-bold rounded-none transition shadow-sm cursor-pointer ${
                  noticeModal.theme === 'yellow'
                    ? 'bg-amber-600 hover:bg-amber-700 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black'
                    : 'bg-sky-600 hover:bg-sky-700 dark:bg-sky-400 dark:hover:bg-sky-300 text-white dark:text-black'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
