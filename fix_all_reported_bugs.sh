#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 신고 중복 제거, 마이메뉴 복원, 댓글신고 탑재 시작"
echo "=========================================================="

# 1. ReportModal.tsx: 클라이언트 중복 알림 생성 코드 완전 제거 (1개만 안전 접수)
cat << 'FILE_REPORT_MODAL' > src/components/ReportModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { Siren, X, Check } from 'lucide-react'
import CustomPopup from './CustomPopup'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  postId: string
  currentUserId: string | null
}

const IMAGE_REASONS = ['선정성 이미지 사용', '폭력적인 이미지 사용'] as const;
const CONTENT_REASONS = ['욕설', '혐오 발언', '같은 내용 반복 게시'] as const;

export default function ReportModal({ isOpen, onClose, postId, currentUserId }: ReportModalProps) {
  const [mounted, setMounted] = useState(false)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [isOtherSelected, setIsOtherSelected] = useState(false)
  const [customReasonText, setCustomReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [popup, setPopup] = useState<{
    show: boolean;
    title: string;
    message: string;
    isSuccess?: boolean;
  }>({ show: false, title: '', message: '' })

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  const toggleReason = (r: string) => {
    setSelectedReasons((prev) =>
      prev.includes(r) ? prev.filter((item) => item !== r) : [...prev, r]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '신고 기능은 로그인 후 이용 가능합니다.' })
      return
    }

    if (selectedReasons.length === 0 && !isOtherSelected) {
      setPopup({ show: true, title: '사유 선택 필요', message: '신고 사유를 최소 하나 이상 선택해 주십시오.' })
      return
    }

    if (isOtherSelected && !customReasonText.trim()) {
      setPopup({ show: true, title: '기타 사유 기입', message: '기타 사유 내용을 입력해 주십시오.' })
      return
    }

    setSubmitting(true)
    const finalReasons = [...selectedReasons]
    if (isOtherSelected) {
      finalReasons.push('기타')
    }

    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)

    // DB post_reports 에 1회 단독 INSERT (알림 생성 및 3회 누적 처리는 DB 트리거가 100% 원자적으로 단일 수행)
    const { error } = await supabase.from('post_reports').insert({
      post_id: targetPostId,
      reporter_id: currentUserId,
      reasons: finalReasons,
      custom_reason: isOtherSelected ? customReasonText.trim() : null,
    })

    if (error) {
      if (error.code === '23505') {
        setPopup({ show: true, title: '중복 신고 안내', message: '이미 신고한 게시글입니다. (게시글 하나당 1회만 신고 가능)' })
      } else {
        setPopup({ show: true, title: '접수 실패', message: `신고 접수 실패: ${error.message}` })
      }
    } else {
      setPopup({ show: true, title: '접수 완료', message: '신고가 정상적으로 접수되었습니다.', isSuccess: true })
    }
    setSubmitting(false)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border-2 border-rose-600 rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-950 pb-3">
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-rose-600" />
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">게시글 신고</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-2">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 block border-l-2 border-rose-600 pl-2">
              부적절한 이미지
            </span>
            <div className="space-y-1.5 pl-3">
              {IMAGE_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(reason)}
                    onChange={() => toggleReason(reason)}
                    className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 block border-l-2 border-rose-600 pl-2">
              부적절한 내용
            </span>
            <div className="space-y-1.5 pl-3">
              {CONTENT_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(reason)}
                    onChange={() => toggleReason(reason)}
                    className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pl-3 border-t border-zinc-100 dark:border-zinc-800 pt-2">
            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isOtherSelected}
                onChange={(e) => setIsOtherSelected(e.target.checked)}
                className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="font-bold">기타</span>
            </label>
            {isOtherSelected && (
              <textarea
                value={customReasonText}
                onChange={(e) => setCustomReasonText(e.target.value)}
                placeholder="구체적인 신고 사유를 직접 기입해 주십시오."
                rows={2}
                className="w-full mt-1.5 p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-1.5 font-semibold rounded-none border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-1.5 font-bold rounded-none bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{submitting ? '접수 중...' : '신고 접수'}</span>
            </button>
          </div>
        </form>
      </div>

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => {
          if (popup.isSuccess) onClose();
          setPopup({ show: false, title: '', message: '' });
        }}
      />
    </div>,
    document.body
  )
}
FILE_REPORT_MODAL

# 2. UserHubModal.tsx: 내가 쓴 글, 좋아요한 글 선택 버튼 및 목록 뷰 100% 완전 복원
cat << 'FILE_USER_HUB' > src/components/UserHubModal.tsx
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
  ShieldAlert,
  Mail
} from 'lucide-react'

type ModalView = 'menu' | 'nickname' | 'my_posts' | 'liked_posts' | 'appeals'

interface PostItem {
  id: string
  title: string
  created_at: string
  likes_count: number
  thumbnail_url?: string | null
  is_official?: boolean
  feed_type?: string
}

interface BlacklistAppeal {
  id: number
  user_id: string
  user_nickname: string
  user_email: string | null
  message: string
  status: string
  admin_reply: string | null
  created_at: string
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

  const isCreatorOrSuperAdmin =
    userRole === 'creator' ||
    userRole === 'super_admin' ||
    userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'

  const [isFrozen, setIsFrozen] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [isTogglingFreeze, setIsTogglingFreeze] = useState(false)

  const [appeals, setAppeals] = useState<BlacklistAppeal[]>([])
  const [pendingAppealCount, setPendingAppealCount] = useState(0)
  const [selectedAppeal, setSelectedAppeal] = useState<BlacklistAppeal | null>(null)
  const [replyInput, setReplyInput] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  const [confirmReindexOpen, setConfirmReindexOpen] = useState(false)
  const [noticeModal, setNoticeModal] = useState<{ text: string; theme: 'yellow' | 'sky' } | null>(null)
  const [confirmActionDialog, setConfirmActionDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: 'unban' | 'keep';
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu')
      setNewNickname(currentNickname)
      if (isCreatorOrSuperAdmin) {
        checkFreezeStatus()
        fetchAppeals()
      }
    }
  }, [isOpen, currentNickname, isCreatorOrSuperAdmin])

  const checkFreezeStatus = async () => {
    const { data } = await supabase.from('site_notices').select('is_frozen').eq('id', 1).maybeSingle()
    if (data) setIsFrozen(Boolean(data.is_frozen))
  }

  const fetchAppeals = async () => {
    const { data } = await supabase
      .from('blacklist_appeals')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setAppeals(data as BlacklistAppeal[])
      const pending = data.filter((a: any) => a.status === 'pending').length
      setPendingAppealCount(pending)
    }
  }

  const fetchMyPosts = async () => {
    setLoadingPosts(true)
    const { data } = await supabase
      .from('posts')
      .select('id, title, created_at, likes_count, thumbnail_url, is_official, feed_type')
      .eq('author_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (data) setPosts(data as PostItem[])
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
        .select('id, title, created_at, likes_count, thumbnail_url, is_official, feed_type')
        .in('id', postIds)
        .eq('is_deleted', false)

      if (postData) {
        const postMap = new Map(postData.map((p: any) => [p.id, p]))
        const ordered = postIds.map((id) => postMap.get(id)).filter(Boolean) as PostItem[]
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
    if (view === 'my_posts') fetchMyPosts()
    else if (view === 'liked_posts') fetchLikedPosts()
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

  const handleExecuteAppealAction = async (action: 'unban' | 'keep') => {
    if (!selectedAppeal) return
    setProcessingAction(true)
    const nowIso = new Date().toISOString()

    if (action === 'unban') {
      await supabase.from('blacklists').delete().eq('user_id', selectedAppeal.user_id)
      await supabase
        .from('blacklist_appeals')
        .update({
          status: 'resolved_unbanned',
          admin_reply: replyInput.trim() || '이의제기가 수용되어 블랙리스트가 해제되었습니다.',
          admin_id: userId,
          admin_nickname: currentNickname,
          resolved_at: nowIso,
          user_notified: false
        })
        .eq('id', selectedAppeal.id)

      setConfirmActionDialog(null)
      setSelectedAppeal(null)
      setReplyInput('')
      await fetchAppeals()
      setNoticeModal({ text: `[${selectedAppeal.user_nickname}] 님의 블랙리스트가 해제되었습니다.`, theme: 'sky' })
    } else {
      await supabase
        .from('blacklist_appeals')
        .update({
          status: 'resolved_kept',
          admin_reply: replyInput.trim() || '관리자 검토 결과 블랙리스트 상태가 유지됩니다.',
          admin_id: userId,
          admin_nickname: currentNickname,
          resolved_at: nowIso,
          user_notified: false
        })
        .eq('id', selectedAppeal.id)

      setConfirmActionDialog(null)
      setSelectedAppeal(null)
      setReplyInput('')
      await fetchAppeals()
      setNoticeModal({ text: `답장이 전송되었으며 블랙리스트가 유지되었습니다.`, theme: 'sky' })
    }
    setProcessingAction(false)
  }

  const handleOpenPost = (post: PostItem) => {
    onClose()
    const targetRoute = post.feed_type === 'community' ? `/community/${post.id}` : `/clan/${post.id}`
    router.push(targetRoute)
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
              {currentView === 'appeals' && '관리자 전용 메시지'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white rounded-lg transition">
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
              {/* 1. 닉네임 변경 */}
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
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">닉네임 변경</h3>
                    <p className="text-[11px] text-zinc-400">활동 프로필 닉네임을 수정합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>

              {/* 2. 내가 쓴 게시글 (복원 완료!) */}
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
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">내가 쓴 게시글</h3>
                    <p className="text-[11px] text-zinc-400">내가 작성한 모든 글을 모아봅니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>

              {/* 3. 내가 좋아요 누른 게시글 (복원 완료!) */}
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
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">내가 좋아요 누른 게시글</h3>
                    <p className="text-[11px] text-zinc-400">좋아요를 누른 관심 게시글을 확인합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>

              {/* 4. 관리자 전용 메시지 (제작자, 최고관리자 전용) */}
              {isCreatorOrSuperAdmin && (
                <button
                  type="button"
                  onClick={() => handleSelectView('appeals')}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left relative"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 relative">
                      <Mail className="w-4 h-4" />
                      {pendingAppealCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-zinc-900 dark:text-white">관리자 전용 메시지</h3>
                        {pendingAppealCount > 0 && (
                          <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.2 rounded-full">
                            {pendingAppealCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400">블랙리스트 유저의 이의제기 및 문의를 처리합니다.</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              )}
            </div>

            {userRole === 'creator' && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <span className="text-[11px] font-black text-amber-500 uppercase tracking-wider block px-1">
                  사이트 제작자 전용 콘솔
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReindexOpen(true)}
                    disabled={isReindexing}
                    className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
                    <span>게시글 번호 초기화</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleFreeze}
                    disabled={isTogglingFreeze}
                    className={`p-2.5 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1 ${
                      isFrozen ? 'bg-sky-600 text-white' : 'border-sky-500/40 text-sky-500'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>{isFrozen ? '동결 중' : '사이트 얼리기'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'nickname' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newNickname.trim()) return
              setUpdatingNickname(true)
              await supabase.from('profiles').upsert({ id: userId, nickname: newNickname.trim() })
              onNicknameUpdated(newNickname.trim())
              setUpdatingNickname(false)
              setCurrentView('menu')
            }}
            className="p-5 space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">새 닉네임</label>
              <input
                type="text"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                maxLength={15}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="px-4 py-2 text-xs border rounded-xl"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={updatingNickname}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl"
              >
                저장
              </button>
            </div>
          </form>
        )}

        {/* 내가 쓴 글 / 좋아요 누른 글 목록 뷰 */}
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
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => handleOpenPost(post)}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 cursor-pointer transition group"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200">
                          {post.feed_type === 'community' ? '커뮤니티' : '클랜'}
                        </span>
                        {post.is_official && (
                          <span className="text-[10px] font-extrabold text-emerald-500">[공식]</span>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'appeals' && (
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {appeals.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">도착한 이의제기 메시지가 없습니다.</div>
            ) : (
              appeals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedAppeal(item)
                    setReplyInput(item.admin_reply || '')
                  }}
                  className={`p-3 rounded-none border cursor-pointer transition text-xs space-y-1.5 ${
                    item.status === 'pending'
                      ? '!bg-black !border-2 !border-red-600 !text-white'
                      : '!bg-zinc-950 !border !border-zinc-800 !text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">{item.user_nickname}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-none ${
                      item.status === 'pending' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {item.status === 'pending' ? '답변 대기' : item.status === 'resolved_unbanned' ? '해제 완료' : '유지 처리됨'}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-zinc-400 text-[11px]">{item.message}</p>
                  <span className="text-[10px] text-zinc-500 block">{new Date(item.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 이의제기 상세 및 관리자 답장 모달 */}
      {selectedAppeal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setSelectedAppeal(null)}
        >
          <div
            className="w-full max-w-md !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-black text-white">
                이의제기 상세: {selectedAppeal.user_nickname}
              </h3>
              <button onClick={() => setSelectedAppeal(null)} className="p-1 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-400 font-bold block">유저 소명 내용:</span>
              <div className="p-3 !bg-zinc-950 !border !border-zinc-800 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {selectedAppeal.message}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-zinc-900">
              <label className="text-[11px] text-white font-black block">관리자 답장 작성:</label>
              <textarea
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder="유저에게 통보될 답장 내용을 작성해 주십시오."
                rows={3}
                className="w-full p-2.5 text-xs !bg-zinc-950 !border !border-zinc-700 !text-white rounded-none focus:outline-none focus:!border-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmActionDialog({
                  isOpen: true,
                  title: '블랙리스트 해제 경고',
                  message: `정말로 [${selectedAppeal.user_nickname}] 유저의 블랙리스트를 해제하시겠습니까?`,
                  action: 'unban'
                })}
                disabled={processingAction}
                className="px-3.5 py-1.5 text-xs font-bold rounded-none bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                블랙리스트 해제
              </button>
              <button
                type="button"
                onClick={() => setConfirmActionDialog({
                  isOpen: true,
                  title: '블랙리스트 유지 경고',
                  message: `정말로 [${selectedAppeal.user_nickname}] 유저의 블랙리스트를 유지하고 답장을 통보하시겠습니까?`,
                  action: 'keep'
                })}
                disabled={processingAction}
                className="px-3.5 py-1.5 text-xs font-bold rounded-none bg-red-600 hover:bg-red-500 text-white transition"
              >
                블랙리스트 유지
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 실행 확인 경고 팝업 */}
      {confirmActionDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setConfirmActionDialog(null)}
        >
          <div
            className="w-full max-w-sm !bg-black !text-white !border-2 !border-white rounded-none p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-white">{confirmActionDialog.title}</h3>
            <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
              {confirmActionDialog.message}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setConfirmActionDialog(null)}
                className="px-4 py-1.5 text-xs border border-zinc-600 text-zinc-300 rounded-none"
              >
                취소
              </button>
              <button
                onClick={() => handleExecuteAppealAction(confirmActionDialog.action)}
                className="px-5 py-1.5 text-xs font-black bg-white text-black rounded-none"
              >
                실행 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setNoticeModal(null)}
        >
          <div
            className={`w-full max-w-sm bg-white dark:bg-black border-2 rounded-none p-6 shadow-2xl space-y-4 text-center ${
              noticeModal.theme === 'yellow' ? 'border-amber-600 dark:border-yellow-400' : 'border-sky-600 dark:border-sky-400'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-zinc-900 dark:text-white leading-relaxed font-semibold">
              {noticeModal.text}
            </p>
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setNoticeModal(null)}
                className="px-6 py-2 text-xs font-bold rounded-none bg-sky-600 text-white"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
FILE_USER_HUB

# 3. CommentsSection.tsx: 댓글 신고 버튼 및 신고 모달 신설
cat << 'FILE_COMMENTS' > src/components/CommentsSection.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import { ThumbsUp, ImageIcon, Trash2, Send, Loader2, X, Siren, Check } from 'lucide-react'
import CustomPopup from './CustomPopup'

interface CommentItem {
  id: number
  post_id: number
  author_id: string
  content: string
  image_url: string | null
  likes_count: number
  created_at: string
  author_nickname?: string
  author_role?: RoleType
  user_liked?: boolean
}

interface CommentsSectionProps {
  postId: string | number
  currentUserId: string | null
  currentUserRole: RoleType
}

export default function CommentsSection({ postId, currentUserId, currentUserRole }: CommentsSectionProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sortType, setSortType] = useState<'latest' | 'popular'>('latest')

  const [inputContent, setInputContent] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 댓글 신고 상태
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null)
  const [commentReportReason, setCommentReportReason] = useState<string>('욕설 및 비방')
  const [commentCustomReason, setCommentCustomReason] = useState<string>('')
  const [submittingCommentReport, setSubmittingCommentReport] = useState(false)

  const [popup, setPopup] = useState<{
    show: boolean;
    title: string;
    message: string;
  }>({ show: false, title: '', message: '' })

  useEffect(() => {
    fetchComments()
  }, [postId, sortType])

  const fetchComments = async () => {
    setLoading(true)
    const targetId = isNaN(Number(postId)) ? postId : Number(postId)

    const query = supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', targetId)

    const { data: commentsData } =
      sortType === 'popular'
        ? await query.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
        : await query.order('created_at', { ascending: true })

    if (commentsData && commentsData.length > 0) {
      const authorIds = Array.from(new Set(commentsData.map((c) => c.author_id)))
      const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', authorIds)
      const profileMap: Record<string, string> = {}
      profiles?.forEach((p) => {
        profileMap[p.id] = p.nickname
      })

      const { data: roles } = await supabase.from('user_roles').select('user_id, email, role')
      const roleMap: Record<string, RoleType> = {}
      roles?.forEach((r) => {
        if (r.user_id) roleMap[r.user_id] = r.role
        if (r.email === 'iwsamuel08@gmail.com' && r.user_id) roleMap[r.user_id] = 'creator'
      })

      let userLikesSet = new Set<number>()
      if (currentUserId) {
        const commentIds = commentsData.map((c) => c.id)
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .in('comment_id', commentIds)
          .eq('user_id', currentUserId)

        likes?.forEach((l) => userLikesSet.add(l.comment_id))
      }

      setComments(
        commentsData.map((c) => ({
          ...c,
          author_nickname: profileMap[c.author_id] || '익명사용자',
          author_role: roleMap[c.author_id] || null,
          user_liked: userLikesSet.has(c.id),
        }))
      )
    } else {
      setComments([])
    }
    setLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    const fileExt = file.name.split('.').pop() || 'png'
    const fileName = `comment-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    try {
      const { error } = await supabase.storage.from('comment-images').upload(fileName, file)
      if (!error) {
        const { data } = supabase.storage.from('comment-images').getPublicUrl(fileName)
        if (data?.publicUrl) setAttachedImage(data.publicUrl)
      } else {
        const reader = new FileReader()
        reader.onload = () => setAttachedImage(reader.result as string)
        reader.readAsDataURL(file)
      }
    } catch {
      const reader = new FileReader()
      reader.onload = () => setAttachedImage(reader.result as string)
      reader.readAsDataURL(file)
    }
    setUploadingImage(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '댓글 작성을 위해 먼저 로그인해 주십시오.' })
      return
    }
    if (!inputContent.trim() && !attachedImage) {
      setPopup({ show: true, title: '내용 입력', message: '댓글 내용 또는 이미지를 첨부해 주십시오.' })
      return
    }

    setSubmitting(true)
    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)

    const { error } = await supabase.from('post_comments').insert({
      post_id: targetPostId,
      author_id: currentUserId,
      content: inputContent.trim(),
      image_url: attachedImage,
      likes_count: 0,
    })

    if (error) {
      setPopup({ show: true, title: '등록 실패', message: error.message })
    } else {
      setInputContent('')
      setAttachedImage(null)
      fetchComments()
    }
    setSubmitting(false)
  }

  const handleToggleCommentLike = async (comment: CommentItem) => {
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '좋아요 기능은 로그인이 필요합니다.' })
      return
    }

    const prevLiked = Boolean(comment.user_liked)
    const newLikesCount = prevLiked ? Math.max(0, comment.likes_count - 1) : comment.likes_count + 1

    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, user_liked: !prevLiked, likes_count: newLikesCount } : c))
    )

    if (prevLiked) {
      await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      await supabase.from('post_comments').update({ likes_count: newLikesCount }).eq('id', comment.id)
    } else {
      await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: currentUserId })
      await supabase.from('post_comments').update({ likes_count: newLikesCount }).eq('id', comment.id)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (error) {
      setPopup({ show: true, title: '삭제 실패', message: error.message })
    } else {
      fetchComments()
    }
  }

  // 댓글 신고 제출 핸들러
  const handleCommentReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId || !reportingCommentId) return

    setSubmittingCommentReport(true)
    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)
    const finalReason = commentReportReason === '기타' ? (commentCustomReason.trim() || '기타') : commentReportReason

    const { error } = await supabase.from('comment_reports').insert({
      comment_id: reportingCommentId,
      post_id: targetPostId,
      reporter_id: currentUserId,
      reasons: [finalReason],
      custom_reason: commentReportReason === '기타' ? commentCustomReason.trim() : null
    })

    setSubmittingCommentReport(false)
    setReportingCommentId(null)
    setCommentCustomReason('')

    if (error) {
      if (error.code === '23505') {
        setPopup({ show: true, title: '중복 신고', message: '이미 신고한 댓글입니다.' })
      } else {
        setPopup({ show: true, title: '신고 실패', message: error.message })
      }
    } else {
      setPopup({ show: true, title: '신고 접수', message: '댓글 신고가 성공적으로 접수되었습니다.' })
      fetchComments()
    }
  }

  return (
    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          댓글 ({comments.length})
        </h3>
        <div className="flex items-center gap-1 text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-none border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setSortType('latest')}
            className={`px-2 py-0.5 rounded-none transition ${
              sortType === 'latest' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-400'
            }`}
          >
            최신순
          </button>
          <button
            type="button"
            onClick={() => setSortType('popular')}
            className={`px-2 py-0.5 rounded-none transition ${
              sortType === 'popular' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-400'
            }`}
          >
            인기순
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmitComment} className="space-y-2">
        <div className="relative">
          <textarea
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            placeholder="댓글을 작성해 보세요 (이미지 및 GIF 첨부 가능)"
            rows={2}
            className="w-full p-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {attachedImage && (
          <div className="relative inline-block border border-zinc-300 dark:border-zinc-700">
            <img src={attachedImage} alt="첨부" className="w-20 h-20 object-cover" />
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-none transition"
          >
            {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
            <span>사진/GIF</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? '등록 중...' : '등록'}</span>
          </button>
        </div>
      </form>

      <div className="space-y-3 pt-2">
        {loading ? (
          <div className="py-6 text-center text-xs text-zinc-400">댓글을 불러오는 중...</div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-400">첫 댓글을 남겨보세요!</div>
        ) : (
          comments.map((comment) => {
            const isCommentAuthor = currentUserId && currentUserId === comment.author_id
            const canDelete =
              isCommentAuthor ||
              currentUserRole === 'creator' ||
              currentUserRole === 'super_admin' ||
              currentUserRole === 'admin'

            return (
              <div
                key={comment.id}
                className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={comment.author_role} className="w-3.5 h-3.5 shrink-0" />
                    <span>{comment.author_nickname}</span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 댓글 신고 버튼 */}
                    {!isCommentAuthor && (
                      <button
                        type="button"
                        onClick={() => setReportingCommentId(comment.id)}
                        className="text-zinc-400 hover:text-rose-500 transition"
                        title="댓글 신고"
                      >
                        <Siren className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-zinc-400 hover:text-red-500 transition"
                        title="댓글 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {comment.content && (
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                    {comment.content}
                  </p>
                )}

                {comment.image_url && (
                  <div className="pt-1">
                    <img
                      src={comment.image_url}
                      alt="댓글 이미지"
                      className="w-1/4 max-w-[140px] sm:max-w-[170px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                      onClick={() => window.open(comment.image_url || '', '_blank')}
                      title="클릭하여 원본 보기"
                    />
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleCommentLike(comment)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-bold border transition ${
                      comment.user_liked
                        ? 'bg-blue-50 text-blue-600 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <ThumbsUp className={`w-3 h-3 ${comment.user_liked ? 'fill-current' : ''}`} />
                    <span>{comment.likes_count}</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 댓글 전용 신고 팝업 */}
      {reportingCommentId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setReportingCommentId(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-950 border-2 border-rose-600 rounded-none p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rose-200 dark:border-rose-950 pb-2.5">
              <div className="flex items-center gap-2 text-rose-600">
                <Siren className="w-4 h-4" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">댓글 신고</h3>
              </div>
              <button onClick={() => setReportingCommentId(null)} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCommentReportSubmit} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                {['욕설 및 비방', '음란성 / 부적절한 이미지', '도배 및 광고', '기타'].map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="commentReason"
                      value={r}
                      checked={commentReportReason === r}
                      onChange={(e) => setCommentReportReason(e.target.value)}
                      className="accent-rose-600"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>

              {commentReportReason === '기타' && (
                <textarea
                  value={commentCustomReason}
                  onChange={(e) => setCommentCustomReason(e.target.value)}
                  placeholder="신고 사유를 작성해 주십시오."
                  rows={2}
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs"
                />
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setReportingCommentId(null)}
                  className="px-3 py-1.5 border rounded-none text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submittingCommentReport}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-none text-xs"
                >
                  {submittingCommentReport ? '접수 중...' : '신고'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup({ show: false, title: '', message: '' })}
      />
    </div>
  )
}
FILE_COMMENTS

echo "--> 소스코드 동기화 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 모든 에러 해결 완료! Git 자동 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: 신고 알림 중복 제거, 마이메뉴 글/좋아요 복원, 댓글 신고 시스템 탑재"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
