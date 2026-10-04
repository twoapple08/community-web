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
  Check,
  Loader2,
  RefreshCw,
  Snowflake,
  ShieldAlert,
  Mail,
  RotateCcw
} from 'lucide-react'

type ModalView = 'menu' | 'nickname' | 'my_posts' | 'liked_posts' | 'appeals'

interface PostItem {
  id: string
  title: string
  created_at: string
  likes_count: number
  thumbnail_url?: string | null
  is_official?: boolean
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

  // 이의제기 관리 상태
  const [appeals, setAppeals] = useState<BlacklistAppeal[]>([])
  const [pendingAppealCount, setPendingAppealCount] = useState(0)
  const [selectedAppeal, setSelectedAppeal] = useState<BlacklistAppeal | null>(null)
  const [replyInput, setReplyInput] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  // 번호 재정렬/결과 모달 및 커스텀 팝업
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

  // 관리자 답장 실행: 해제 또는 유지
  const handleExecuteAppealAction = async (action: 'unban' | 'keep') => {
    if (!selectedAppeal) return
    setProcessingAction(true)

    const nowIso = new Date().toISOString()

    if (action === 'unban') {
      // 1) 블랙리스트에서 제거
      await supabase.from('blacklists').delete().eq('user_id', selectedAppeal.user_id)

      // 2) 이의제기 완료 업데이트
      await supabase
        .from('blacklist_appeals')
        .update({
          status: 'resolved_unbanned',
          admin_reply: replyInput.trim() || '이의제기가 수용되어 블랙리스트가 해제되었습니다.',
          admin_id: userId,
          admin_nickname: currentNickname,
          resolved_at: nowIso,
          user_notified: true
        })
        .eq('id', selectedAppeal.id)

      setConfirmActionDialog(null)
      setSelectedAppeal(null)
      setReplyInput('')
      await fetchAppeals()
      setNoticeModal({ text: `[${selectedAppeal.user_nickname}] 님의 블랙리스트가 해제되었습니다.`, theme: 'sky' })
    } else {
      // 블랙리스트 유지 및 답장 통보 저장
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
              <button
                type="button"
                onClick={() => setCurrentView('nickname')}
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

              {/* 관리자 전용 메시지 메뉴 (제작자, 최고관리자 전용 + 빨간점 알람) */}
              {isCreatorOrSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setCurrentView('appeals')}
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

      {/* 이의제기 상세 및 답장 창 */}
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

      {/* 답장 버튼 클릭 시 실행 확인 경고창 (필수 요구사항!) */}
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

      {/* 결과 알림 팝업 */}
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
