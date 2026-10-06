'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import CustomPopup from './CustomPopup'
import Avatar from './Avatar'
import SettingsView from './userhub/SettingsView'
import MyCommentsView from './userhub/MyCommentsView'
import CreditsPopup from './userhub/CreditsPopup'
import { isCreatorEmail } from '@/lib/roles'
import { getPostPath, selectPostsWithNo } from '@/lib/postRoute'
import { fetchMySettings, onProfileChanged, openUserProfile } from '@/lib/userProfile'
import {
  deleteReadNotifications,
  describeNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationPath,
  type UserNotification,
} from '@/lib/notifications'
import {
  X,
  ArrowLeft,
  Settings,
  FileText,
  Heart,
  ChevronRight,
  Calendar,
  Loader2,
  RefreshCw,
  Snowflake,
  Mail,
  Lightbulb,
  Inbox,
  Send,
  Trash2,
  Bell,
  CheckCheck,
  MessageSquare,
  CornerDownRight,
  Info
} from 'lucide-react'

type ModalView = 'menu' | 'notifications' | 'settings' | 'my_posts' | 'liked_posts' | 'my_comments' | 'appeals' | 'suggestion_write' | 'suggestion_inbox'

interface PostItem {
  id: string
  post_no?: number | null
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

interface SuggestionItem {
  id: number
  user_id: string
  user_nickname: string
  user_email: string | null
  category: string
  title: string
  content: string
  is_read: boolean
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
  unreadNotificationCount: number
  onUnreadNotificationCountChange: (count: number) => void
}

export default function UserHubModal({
  isOpen,
  onClose,
  userId,
  userEmail,
  userRole,
  currentNickname,
  onNicknameUpdated,
  unreadNotificationCount,
  onUnreadNotificationCountChange,
}: UserHubModalProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentView, setCurrentView] = useState<ModalView>('menu')

  // 상단 프로필 카드의 내 프로필 사진
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [creditsOpen, setCreditsOpen] = useState(false)

  const [posts, setPosts] = useState<PostItem[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const isCreator = userRole === 'creator' || isCreatorEmail(userEmail)
  const isCreatorOrSuperAdmin = isCreator || userRole === 'super_admin'

  const [isFrozen, setIsFrozen] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [isTogglingFreeze, setIsTogglingFreeze] = useState(false)

  // 번호 재정렬 확인 팝업 상태
  const [confirmReindexOpen, setConfirmReindexOpen] = useState(false)
  const [noticeModal, setNoticeModal] = useState<{ text: string; theme: 'yellow' | 'sky' } | null>(null)

  // 이의제기 관리 상태 (제작자, 최고관리자)
  const [appeals, setAppeals] = useState<BlacklistAppeal[]>([])
  const [pendingAppealCount, setPendingAppealCount] = useState(0)
  const [selectedAppeal, setSelectedAppeal] = useState<BlacklistAppeal | null>(null)
  const [replyInput, setReplyInput] = useState('')
  const [processingAction, setProcessingAction] = useState(false)
  const [deletingResolvedAppeals, setDeletingResolvedAppeals] = useState(false)
  const [resolvedNoticePopup, setResolvedNoticePopup] = useState<BlacklistAppeal | null>(null)

  const [confirmActionDialog, setConfirmActionDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: 'unban' | 'keep';
  } | null>(null)

  // 건의사항 작성 상태 (일반회원, 일반관리자, 최고관리자)
  const [suggestionCategory, setSuggestionCategory] = useState<'기능 제안' | '버그 제보' | '기타'>('기능 제안')
  const [suggestionTitle, setSuggestionTitle] = useState('')
  const [suggestionContent, setSuggestionContent] = useState('')
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false)

  // 건의함 수신 상태 (제작자 전용)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [unreadSuggestionCount, setUnreadSuggestionCount] = useState(0)
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestionItem | null>(null)
  const [deletingReadSuggestions, setDeletingReadSuggestions] = useState(false)

  // 내 게시글 알림 (좋아요/댓글/답글)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [processingNotifications, setProcessingNotifications] = useState(false)

  const [customPopupState, setCustomPopupState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  useEffect(() => {
    setMounted(true)
  }, [])

  // 닉네임이 바뀔 때마다 메뉴로 돌아가지 않도록 currentNickname 은 의존성에서 제외 (개인 설정 화면 유지)
  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu')
      if (isCreator) {
        checkFreezeStatus()
        fetchSuggestions()
      }
      if (isCreatorOrSuperAdmin) {
        fetchAppeals()
      }
    }
  }, [isOpen, isCreator, isCreatorOrSuperAdmin])

  useEffect(() => {
    if (!isOpen || !userId) return
    let cancelled = false
    fetchMySettings(userId).then((data) => {
      if (!cancelled) setMyAvatarUrl(data?.avatar_url ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, userId])

  // 개인 설정에서 사진을 바꾸면 상단 카드에도 바로 반영
  useEffect(() => {
    return onProfileChanged((event) => {
      if (event.userId === userId && event.avatar_url !== undefined) setMyAvatarUrl(event.avatar_url ?? null)
    })
  }, [userId])

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

  const fetchSuggestions = async () => {
    const { data } = await supabase
      .from('site_suggestions')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setSuggestions(data as SuggestionItem[])
      const unread = data.filter((s: any) => !s.is_read).length
      setUnreadSuggestionCount(unread)
    }
  }

  const handleToggleFreeze = async () => {
    setIsTogglingFreeze(true)
    const nextStatus = !isFrozen
    const { error } = await supabase
      .from('site_notices')
      .update({ is_frozen: nextStatus })
      .eq('id', 1)

    if (error) {
      setNoticeModal({ text: `사이트 얼리기 상태 변경 실패: ${error?.message || '알 수 없는 오류'}`, theme: 'sky' })
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
      setNoticeModal({ text: `게시글 번호 초기화 실패: ${error?.message || '알 수 없는 오류'}`, theme: 'yellow' })
    } else {
      const hasFeedCounts = data && typeof data.clan_count === 'number' && typeof data.community_count === 'number'
      setNoticeModal({
        text: hasFeedCounts
          ? `클랜 피드 ${data.clan_count}개, 커뮤니티 피드 ${data.community_count}개의 게시글 번호가 피드별로 각각 1번부터 올린 순서대로 재정렬되었습니다.`
          : `총 ${data?.count || 0}개의 게시글 번호가 1번부터 차례대로 성공적으로 재정렬되었습니다.`,
        theme: 'yellow'
      })
      setTimeout(() => {
        window.location.reload()
      }, 1200)
    }
    setIsReindexing(false)
  }

  const handleDeleteResolvedAppeals = () => {
    setCustomPopupState({
      isOpen: true,
      title: '처리된 내역 전체 삭제',
      message: '답변 및 처리가 완료된 모든 이의제기 메시지를 영구 삭제하시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        setCustomPopupState((p) => ({ ...p, isOpen: false }))
        setDeletingResolvedAppeals(true)
        const { error } = await supabase
          .from('blacklist_appeals')
          .delete()
          .neq('status', 'pending')

        if (error) {
          setNoticeModal({ text: `삭제 실패: ${error?.message || '알 수 없는 오류'}`, theme: 'sky' })
        } else {
          setAppeals((prev) => prev.filter((a) => a.status === 'pending'))
          setNoticeModal({ text: '처리된 모든 메시지가 성공적으로 삭제되었습니다.', theme: 'sky' })
        }
        setDeletingResolvedAppeals(false)
      }
    })
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

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!suggestionTitle.trim() || !suggestionContent.trim()) {
      setCustomPopupState({
        isOpen: true,
        title: '입력 확인',
        message: '제목과 내용을 모두 입력해 주십시오.',
        onConfirm: () => setCustomPopupState((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setSubmittingSuggestion(true)
    const { error } = await supabase.from('site_suggestions').insert({
      user_id: userId,
      user_nickname: currentNickname || '사용자',
      user_email: userEmail,
      category: suggestionCategory,
      title: suggestionTitle.trim(),
      content: suggestionContent.trim(),
    })
    setSubmittingSuggestion(false)

    if (error) {
      setCustomPopupState({
        isOpen: true,
        title: '전송 실패',
        message: `건의사항 전송 실패: ${error?.message || '알 수 없는 오류'}`,
        onConfirm: () => setCustomPopupState((p) => ({ ...p, isOpen: false }))
      })
    } else {
      setCustomPopupState({
        isOpen: true,
        title: '건의사항 접수 완료',
        message: '사이트 제작자에게 건의사항이 성공적으로 전달되었습니다. 소중한 의견 감사합니다!',
        onConfirm: () => {
          setCustomPopupState((p) => ({ ...p, isOpen: false }))
          setSuggestionTitle('')
          setSuggestionContent('')
          setCurrentView('menu')
        }
      })
    }
  }

  const handleOpenSuggestion = async (item: SuggestionItem) => {
    setSelectedSuggestion(item)
    if (!item.is_read) {
      await supabase.from('site_suggestions').update({ is_read: true }).eq('id', item.id)
      setSuggestions((prev) => prev.map((s) => (s.id === item.id ? { ...s, is_read: true } : s)))
      setUnreadSuggestionCount((prev) => Math.max(0, prev - 1))
    }
  }

  const handleDeleteReadSuggestions = () => {
    setCustomPopupState({
      isOpen: true,
      title: '읽은 건의 전체 삭제',
      message: '읽음 처리된 모든 건의사항을 영구 삭제하시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        setCustomPopupState((p) => ({ ...p, isOpen: false }))
        setDeletingReadSuggestions(true)
        const { error } = await supabase.from('site_suggestions').delete().eq('is_read', true)
        if (error) {
          setNoticeModal({ text: `삭제 실패: ${error?.message || '알 수 없는 오류'}`, theme: 'sky' })
        } else {
          setSuggestions((prev) => prev.filter((s) => !s.is_read))
          setNoticeModal({ text: '읽은 모든 건의사항이 삭제되었습니다.', theme: 'sky' })
        }
        setDeletingReadSuggestions(false)
      }
    })
  }

  const fetchMyPosts = async () => {
    setLoadingPosts(true)
    const data = await selectPostsWithNo<PostItem>(
      'id, title, created_at, likes_count, thumbnail_url, is_official, feed_type',
      (cols) =>
        supabase
          .from('posts')
          .select(cols)
          .eq('author_id', userId)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
    )

    setPosts(data)
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
      const postIds = likeRecords.map((r: { post_id: number | string }) => r.post_id)
      const postData = await selectPostsWithNo<PostItem>(
        'id, title, created_at, likes_count, thumbnail_url, is_official, feed_type',
        (cols) =>
          supabase
            .from('posts')
            .select(cols)
            .in('id', postIds)
            .eq('is_deleted', false)
      )

      const postMap = new Map(postData.map((p) => [String(p.id), p]))
      const ordered = postIds.map((id) => postMap.get(String(id))).filter(Boolean) as PostItem[]
      setPosts(ordered)
    } else {
      setPosts([])
    }
    setLoadingPosts(false)
  }

  const loadNotifications = async () => {
    setLoadingNotifications(true)
    const list = await fetchNotifications(userId)
    setNotifications(list)
    setLoadingNotifications(false)
  }

  const handleSelectView = (view: ModalView) => {
    setCurrentView(view)
    if (view === 'my_posts') fetchMyPosts()
    else if (view === 'liked_posts') fetchLikedPosts()
    else if (view === 'notifications') loadNotifications()
  }

  const handleOpenPost = (post: PostItem) => {
    onClose()
    router.push(getPostPath(post))
  }

  // 내가 쓴 댓글 → 해당 게시글의 댓글 위치로 이동
  const handleOpenCommentPath = (path: string) => {
    onClose()
    router.push(path)
  }

  const handleOpenNotification = async (item: UserNotification) => {
    if (!item.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)))
      onUnreadNotificationCountChange(Math.max(0, unreadNotificationCount - 1))
      await markNotificationRead(item.id)
    }
    const path = await resolveNotificationPath(item)
    if (!path) {
      setCustomPopupState({
        isOpen: true,
        title: '게시글 없음',
        message: '삭제되었거나 존재하지 않는 게시글입니다.',
        onConfirm: () => setCustomPopupState((p) => ({ ...p, isOpen: false }))
      })
      return
    }
    onClose()
    router.push(path)
  }

  const handleMarkAllNotificationsRead = async () => {
    if (!notifications.some((n) => !n.is_read) && unreadNotificationCount === 0) return
    setProcessingNotifications(true)
    await markAllNotificationsRead(userId)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    onUnreadNotificationCountChange(0)
    setProcessingNotifications(false)
  }

  const handleDeleteReadNotifications = () => {
    setCustomPopupState({
      isOpen: true,
      title: '읽은 알림 삭제',
      message: '읽음 처리된 모든 알림을 삭제하시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        setCustomPopupState((p) => ({ ...p, isOpen: false }))
        setProcessingNotifications(true)
        const { error } = await deleteReadNotifications(userId)
        if (error) {
          setNoticeModal({ text: `삭제 실패: ${error.message || '알 수 없는 오류'}`, theme: 'sky' })
        } else {
          setNotifications((prev) => prev.filter((n) => !n.is_read))
        }
        setProcessingNotifications(false)
      }
    })
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
                className="p-1 -ml-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              {currentView === 'menu' && '마이 프로필'}
              {currentView === 'notifications' && '알림'}
              {currentView === 'settings' && '개인 설정'}
              {currentView === 'my_posts' && '내가 쓴 게시글'}
              {currentView === 'liked_posts' && '좋아요 누른 게시글'}
              {currentView === 'my_comments' && '내가 쓴 댓글'}
              {currentView === 'appeals' && '관리자 전용 메시지'}
              {currentView === 'suggestion_write' && '건의사항 작성'}
              {currentView === 'suggestion_inbox' && '제작자 건의함'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentView === 'menu' && (
          <div className="p-5 space-y-4 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain">
            {/* 누르면 내 공개 프로필 (허브는 닫지 않고 그 위에 프로필 창이 뜸) */}
            <button
              type="button"
              onClick={() => openUserProfile(userId)}
              className="w-full flex items-center gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition text-left cursor-pointer group"
            >
              <Avatar
                src={myAvatarUrl}
                size={44}
                alt={`${currentNickname || '익명사용자'} 프로필 사진`}
                fallback={
                  <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CrownIcon role={userRole} className="w-5 h-5" />
                  </div>
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate min-w-0 max-w-full">
                    {currentNickname || '익명사용자'}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">
                    {userRole === 'creator' ? '제작자' : userRole === 'super_admin' ? '최고관리자' : userRole === 'admin' ? '일반관리자' : '일반회원'}
                  </span>
                </div>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{userEmail}</span>
              </div>
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition">
                {/* 아주 좁은 화면(360px 미만)에서는 닉네임 공간을 위해 화살표만 표시 */}
                <span className="hidden min-[360px]:inline whitespace-nowrap">프로필 보기</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSelectView('notifications')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left relative"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 relative">
                    <Bell className="w-4 h-4" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black animate-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-zinc-900 dark:text-white">알림</h3>
                      {unreadNotificationCount > 0 && (
                        <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.2 rounded-full">
                          {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">내 게시글·댓글에 달린 좋아요와 댓글 소식을 확인합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectView('settings')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">개인 설정</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">프로필 사진, 닉네임, 공개 범위, 알림을 설정합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </button>

              {!isCreator && (
                <button
                  type="button"
                  onClick={() => handleSelectView('suggestion_write')}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border-2 border-yellow-400 dark:border-yellow-400 bg-yellow-50/20 dark:bg-yellow-950/20 hover:bg-yellow-100/30 dark:hover:bg-yellow-950/40 transition group text-left shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-yellow-400/20 text-yellow-600 dark:text-yellow-400">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-zinc-900 dark:text-white group-hover:text-yellow-500 transition">
                        건의사항
                      </h3>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">필요한 기능, 버그 제보 등을 제작자에게 건의합니다.</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-yellow-500" />
                </button>
              )}

              {isCreator && (
                <button
                  type="button"
                  onClick={() => handleSelectView('suggestion_inbox')}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border-2 border-yellow-400 dark:border-yellow-400 bg-yellow-50/20 dark:bg-yellow-950/20 hover:bg-yellow-100/30 dark:hover:bg-yellow-950/40 transition group text-left shadow-sm relative"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 relative">
                      <Inbox className="w-4 h-4" />
                      {unreadSuggestionCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-black text-zinc-900 dark:text-white group-hover:text-yellow-500 transition">
                          건의함
                        </h3>
                        {unreadSuggestionCount > 0 && (
                          <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.2 rounded-full">
                            {unreadSuggestionCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">유저들이 보낸 건의 및 버그 제보를 확인합니다.</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-yellow-500" />
                </button>
              )}

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
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">내가 작성한 모든 글을 모아봅니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
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
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">내가 좋아요 누른 게시글</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">좋아요를 누른 관심 게시글을 확인합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectView('my_comments')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">내가 쓴 댓글</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">내가 단 댓글과 답글을 모아봅니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </button>

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
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black animate-pulse" />
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
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">블랙리스트 유저의 이의제기 및 문의를 처리합니다.</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                </button>
              )}
            </div>

            {isCreator && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <span className="text-[11px] font-black text-amber-500 uppercase tracking-wider block px-1">
                  사이트 제작자 전용 콘솔
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReindexOpen(true)}
                    disabled={isReindexing}
                    className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
                    <span>게시글 번호 초기화</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleFreeze}
                    disabled={isTogglingFreeze}
                    className={`p-2.5 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1 cursor-pointer ${
                      isFrozen ? 'bg-sky-600 text-white' : 'border-sky-500/40 text-sky-500'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>{isFrozen ? '동결 중' : '사이트 얼리기'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 메뉴 맨 아래: 크레딧 / 개인정보처리방침 */}
            <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <button
                type="button"
                onClick={() => setCreditsOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-1.5 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
              >
                <Info className="w-3.5 h-3.5" />
                <span>크레딧</span>
              </button>
              <span className="w-px h-3 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
              <Link
                href="/privacy"
                onClick={onClose}
                className="px-2 py-1.5 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
              >
                개인정보처리방침
              </Link>
            </div>
          </div>
        )}

        {currentView === 'settings' && (
          <SettingsView userId={userId} currentNickname={currentNickname} onNicknameUpdated={onNicknameUpdated} />
        )}

        {currentView === 'my_comments' && <MyCommentsView userId={userId} onNavigate={handleOpenCommentPath} />}

        {currentView === 'suggestion_write' && (
          <form onSubmit={handleSubmitSuggestion} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-yellow-500 mb-1.5">건의 구분</label>
              <div className="flex gap-1.5">
                {(['기능 제안', '버그 제보', '기타'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSuggestionCategory(cat)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition ${
                      suggestionCategory === cat
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">제목</label>
              <input
                type="text"
                value={suggestionTitle}
                onChange={(e) => setSuggestionTitle(e.target.value)}
                placeholder="건의 제목을 간략히 적어주세요"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">건의 내용</label>
              <textarea
                value={suggestionContent}
                onChange={(e) => setSuggestionContent(e.target.value)}
                placeholder="필요한 기능이나 발견하신 버그를 상세히 적어주시면 사이트 개선에 큰 도움이 됩니다."
                rows={5}
                className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="px-4 py-2 text-xs border rounded-xl"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submittingSuggestion}
                className="px-5 py-2 text-xs font-bold bg-yellow-400 hover:bg-yellow-300 text-black rounded-xl flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submittingSuggestion ? '전송 중...' : '건의 전송'}</span>
              </button>
            </div>
          </form>
        )}

        {currentView === 'suggestion_inbox' && (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                수신된 건의 ({suggestions.length}건)
              </span>
              <button
                type="button"
                onClick={handleDeleteReadSuggestions}
                disabled={deletingReadSuggestions}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-500/40 rounded-none transition disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>읽은 건의 전체삭제</span>
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {suggestions.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">도착한 건의사항이 없습니다.</div>
              ) : (
                suggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenSuggestion(item)}
                    className={`p-3 rounded-xl border cursor-pointer transition text-xs space-y-1 ${
                      !item.is_read
                        ? 'border-yellow-400 bg-yellow-400/10'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-yellow-400 text-black shrink-0">
                          {item.category}
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-white truncate min-w-0">
                          {item.title}
                        </span>
                      </div>
                      {!item.is_read && (
                        <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 pt-0.5">
                      <span>작성자: {item.user_nickname}</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {currentView === 'notifications' && (
          <div className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                받은 알림 ({notifications.length}건)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkAllNotificationsRead}
                  disabled={processingNotifications}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-sky-500/40 rounded-none transition disabled:opacity-50"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>모두 읽음</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteReadNotifications}
                  disabled={processingNotifications}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-500/40 rounded-none transition disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>읽은 알림 삭제</span>
                </button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {loadingNotifications ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
                  <span className="text-xs">알림을 불러오는 중...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">도착한 알림이 없습니다.</div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenNotification(item)}
                    className={`p-3 rounded-xl border cursor-pointer transition text-xs space-y-1 ${
                      !item.is_read
                        ? 'border-sky-500/60 bg-sky-500/10'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="mt-0.5 shrink-0">
                          {item.type === 'post_like' ? (
                            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/30" />
                          ) : item.type === 'comment_reply' ? (
                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                          )}
                        </span>
                        <p className="font-bold text-zinc-900 dark:text-white leading-snug break-words min-w-0">
                          {describeNotification(item)}
                        </p>
                      </div>
                      {!item.is_read && <span className="w-2 h-2 mt-1 rounded-full bg-red-600 shrink-0" />}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 pt-0.5 pl-5">
                      <span className="truncate min-w-0">{item.post_title || '게시글'}</span>
                      <span className="shrink-0">{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {(currentView === 'my_posts' || currentView === 'liked_posts') && (
          <div className="p-5">
            {loadingPosts ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-xs">게시글 목록을 불러오는 중...</span>
              </div>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shrink-0">
                          {post.feed_type === 'community' ? '커뮤니티' : '클랜'}
                        </span>
                        {post.is_official && (
                          <span className="text-[10px] font-extrabold text-emerald-500 shrink-0">[공식]</span>
                        )}
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate group-hover:text-emerald-500 transition">
                          {post.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
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
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                수신된 메시지 ({appeals.length}건)
              </span>
              <button
                type="button"
                onClick={handleDeleteResolvedAppeals}
                disabled={deletingResolvedAppeals}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-500/40 rounded-none transition disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>처리된 내용 전체 삭제</span>
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {appeals.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">도착한 이의제기 메시지가 없습니다.</div>
              ) : (
                appeals.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.status !== 'pending') {
                        setResolvedNoticePopup(item)
                        return
                      }
                      setSelectedAppeal(item)
                      setReplyInput(item.admin_reply || '')
                    }}
                    className={`p-3 rounded-none border cursor-pointer transition text-xs space-y-1.5 ${
                      item.status === 'pending'
                        ? 'bg-white dark:bg-black border-2 border-red-600 text-zinc-900 dark:text-white'
                        : 'bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-zinc-900 dark:text-white">{item.user_nickname}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-none ${
                        item.status === 'pending' ? 'bg-red-600 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {item.status === 'pending' ? '답변 대기' : item.status === 'resolved_unbanned' ? '해제 완료' : '유지 처리됨'}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-zinc-600 dark:text-zinc-400 text-[11px]">{item.message}</p>
                    <span className="text-[10px] text-zinc-500 block">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {mounted && confirmReindexOpen && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isReindexing && setConfirmReindexOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-black border-2 border-amber-600 dark:border-yellow-400 rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2 text-center">
              <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-bold leading-relaxed">
                클랜 피드와 커뮤니티 피드의 게시글 번호를 각각 1번부터 올린 순서대로 재정렬하시겠습니까?
              </p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                댓글, 좋아요, 신고 기록은 그대로 유지되며 게시글 주소 번호만 피드별로 다시 매겨집니다.
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

      {selectedSuggestion && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          onClick={() => setSelectedSuggestion(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-950 border-2 border-yellow-400 rounded-none p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
                [{selectedSuggestion.category}] 건의 내용
              </span>
              <button onClick={() => setSelectedSuggestion(null)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-black text-zinc-900 dark:text-white">
                {selectedSuggestion.title}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                보낸이: {selectedSuggestion.user_nickname} ({selectedSuggestion.user_email || '이메일 없음'})
              </p>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
              {selectedSuggestion.content}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                type="button"
                onClick={() => setSelectedSuggestion(null)}
                className="px-5 py-1.5 text-xs font-bold bg-yellow-400 text-black rounded-none"
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {resolvedNoticePopup && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setResolvedNoticePopup(null)}
        >
          <div
            className="w-full max-w-sm bg-white text-zinc-900 border-2 border-zinc-900 dark:bg-black dark:text-white dark:border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-none bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {resolvedNoticePopup.status === 'resolved_unbanned' ? '블랙리스트 해제 완료' : '블랙리스트 유지 처리됨'}
              </span>
              <h3 className="text-sm font-black text-zinc-900 dark:text-white pt-1">
                이미 처리된 이의제기 및 문의입니다
              </h3>
            </div>

            <div className="p-3 bg-zinc-50 border border-zinc-300 dark:bg-zinc-950 dark:border-zinc-800 text-left space-y-2 text-xs">
              <div>
                <span className="text-zinc-500 text-[10px] block">유저 소명:</span>
                <p className="text-zinc-800 dark:text-zinc-300 font-medium whitespace-pre-wrap">{resolvedNoticePopup.message}</p>
              </div>
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-900">
                <span className="text-zinc-500 text-[10px] block">관리자 전송 답장:</span>
                <p className="text-emerald-700 dark:text-emerald-400 font-semibold whitespace-pre-wrap">{resolvedNoticePopup.admin_reply || '답장 없음'}</p>
              </div>
            </div>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setResolvedNoticePopup(null)}
                className="px-6 py-2 text-xs font-black bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 rounded-none transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedAppeal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setSelectedAppeal(null)}
        >
          <div
            className="w-full max-w-md bg-white text-zinc-900 border-2 border-zinc-900 dark:bg-black dark:text-white dark:border-white rounded-none p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-black text-zinc-900 dark:text-white">
                이의제기 상세: {selectedAppeal.user_nickname}
              </h3>
              <button onClick={() => setSelectedAppeal(null)} className="p-1 text-zinc-900 dark:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold block">유저 소명 내용:</span>
              <div className="p-3 bg-zinc-50 border border-zinc-300 text-zinc-800 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-200 text-xs whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {selectedAppeal.message}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-900">
              <label className="text-[11px] text-zinc-900 dark:text-white font-black block">관리자 답장 작성:</label>
              <textarea
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder="유저에게 통보될 답장 내용을 작성해 주십시오."
                rows={3}
                className="w-full p-2.5 text-xs bg-white border border-zinc-300 text-zinc-900 focus:border-zinc-900 dark:bg-zinc-950 dark:border-zinc-700 dark:text-white dark:focus:border-white rounded-none focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
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

      {confirmActionDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setConfirmActionDialog(null)}
        >
          <div
            className="w-full max-w-sm bg-white text-zinc-900 border-2 border-zinc-900 dark:bg-black dark:text-white dark:border-white rounded-none p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-zinc-900 dark:text-white">{confirmActionDialog.title}</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-semibold">
              {confirmActionDialog.message}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setConfirmActionDialog(null)}
                className="px-4 py-1.5 text-xs border border-zinc-400 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300 rounded-none"
              >
                취소
              </button>
              <button
                onClick={() => handleExecuteAppealAction(confirmActionDialog.action)}
                className="px-5 py-1.5 text-xs font-black bg-zinc-900 text-white dark:bg-white dark:text-black rounded-none"
              >
                실행 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeModal && (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
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

      <CustomPopup
        isOpen={customPopupState.isOpen}
        title={customPopupState.title}
        message={customPopupState.message}
        type={customPopupState.type || 'alert'}
        onConfirm={customPopupState.onConfirm}
        onCancel={() => setCustomPopupState((p) => ({ ...p, isOpen: false }))}
      />

      <CreditsPopup isOpen={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  )
}
