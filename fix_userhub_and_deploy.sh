#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] UserHubModal.tsx TS18047 타입 에러 완전 해결 및 빌드"
echo "=========================================================="

cat << 'FILE_USER_HUB' > src/components/UserHubModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import CustomPopup from './CustomPopup'
import {
  X,
  ArrowLeft,
  User,
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
  Trash2
} from 'lucide-react'

type ModalView = 'menu' | 'nickname' | 'my_posts' | 'liked_posts' | 'appeals' | 'suggestion_write' | 'suggestion_inbox'

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

  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu')
      setNewNickname(currentNickname)
      if (isCreator) {
        checkFreezeStatus()
        fetchSuggestions()
      }
      if (isCreatorOrSuperAdmin) {
        fetchAppeals()
      }
    }
  }, [isOpen, currentNickname, isCreator, isCreatorOrSuperAdmin])

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
      setNoticeModal({
        text: `총 ${data?.count || 0}개의 게시글 번호가 1번부터 차례대로 성공적으로 재정렬되었습니다.`,
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
              {currentView === 'suggestion_write' && '건의사항 작성'}
              {currentView === 'suggestion_inbox' && '제작자 건의함'}
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
                    <p className="text-[11px] text-zinc-400">내가 작성한 모든 글을 모아봅니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
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
                    <p className="text-[11px] text-zinc-400">좋아요를 누른 관심 게시글을 확인합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
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
                      <p className="text-[11px] text-zinc-400">블랙리스트 유저의 이의제기 및 문의를 처리합니다.</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
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
                    className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
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
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">제목</label>
              <input
                type="text"
                value={suggestionTitle}
                onChange={(e) => setSuggestionTitle(e.target.value)}
                placeholder="건의 제목을 간략히 적어주세요"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">건의 내용</label>
              <textarea
                value={suggestionContent}
                onChange={(e) => setSuggestionContent(e.target.value)}
                placeholder="필요한 기능이나 발견하신 버그를 상세히 적어주시면 사이트 개선에 큰 도움이 됩니다."
                rows={5}
                className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-xs"
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
              <span className="text-xs font-bold text-zinc-400">
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-yellow-400 text-black">
                          {item.category}
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-white truncate">
                          {item.title}
                        </span>
                      </div>
                      {!item.is_read && (
                        <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                      <span>작성자: {item.user_nickname}</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
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
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-zinc-400">
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
                모든 게시글의 번호를 1번부터 차례대로 재정렬하시겠습니까?
              </p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                기존 댓글, 좋아요, 신고 기록 및 시퀀스가 안전하게 1번부터 연속 동기화됩니다.
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
              <p className="text-[11px] text-zinc-400">
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
            className="w-full max-w-sm bg-black text-white border-2 border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-none bg-zinc-800 text-zinc-300">
                {resolvedNoticePopup.status === 'resolved_unbanned' ? '블랙리스트 해제 완료' : '블랙리스트 유지 처리됨'}
              </span>
              <h3 className="text-sm font-black text-white pt-1">
                이미 처리된 이의제기 및 문의입니다
              </h3>
            </div>

            <div className="p-3 bg-zinc-950 border border-zinc-800 text-left space-y-2 text-xs">
              <div>
                <span className="text-zinc-500 text-[10px] block">유저 소명:</span>
                <p className="text-zinc-300 font-medium whitespace-pre-wrap">{resolvedNoticePopup.message}</p>
              </div>
              <div className="pt-2 border-t border-zinc-900">
                <span className="text-zinc-500 text-[10px] block">관리자 전송 답장:</span>
                <p className="text-emerald-400 font-semibold whitespace-pre-wrap">{resolvedNoticePopup.admin_reply || '답장 없음'}</p>
              </div>
            </div>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setResolvedNoticePopup(null)}
                className="px-6 py-2 text-xs font-black bg-white text-black hover:bg-zinc-200 rounded-none transition"
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
    </div>
  )
}
FILE_USER_HUB

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: UserHubModal.tsx null 안전성 보장 및 프로덕션 빌드 성공"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
