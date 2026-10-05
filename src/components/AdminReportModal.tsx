'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { Siren, X, Check, Trash2, RotateCcw, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import { formatReportNotice, formatAutoDeleteNotice } from '@/lib/koreanUtils'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { emitPostsChanged } from '@/lib/feedStore'
import CustomPopup from './CustomPopup'

interface AdminNotification {
  id: number
  type: 'report' | 'auto_deleted'
  post_id: number | null
  reporter_nickname: string | null
  post_title: string
  feed_type: string
  reason: string
  message: string
  is_read: boolean
  created_at: string
}

interface AdminReportModalProps {
  isOpen: boolean
  onClose: () => void
  onPostRestored?: () => void
}

export default function AdminReportModal({ isOpen, onClose, onPostRestored }: AdminReportModalProps) {
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)

  // 내용 보기(삭제글 복구/영구삭제) 팝업 상태
  const [viewPost, setViewPost] = useState<any | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [actionProcessing, setActionProcessing] = useState(false)

  // 브라우저 기본 alert/confirm 대신 사이트 전용 직각 팝업
  const [popup, setPopup] = useState<{
    isOpen: boolean
    title: string
    message: string
    type?: 'alert' | 'confirm'
    isDanger?: boolean
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const closePopup = () => setPopup((p) => ({ ...p, isOpen: false }))
  const showAlert = (title: string, message: string, after?: () => void) =>
    setPopup({
      isOpen: true,
      title,
      message,
      type: 'alert',
      onConfirm: () => {
        closePopup()
        if (after) after()
      },
    })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen])

  const fetchNotifications = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)

    if (data) {
      setNotifications(data as AdminNotification[])
    }
    setLoading(false)
  }

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return

    await supabase.from('admin_notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const handleOpenPostContent = async (postId: number | null) => {
    if (!postId) return
    setViewLoading(true)
    const { data } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle()
    if (data) {
      setViewPost(data)
    } else {
      showAlert('게시글 없음', '게시글을 찾을 수 없거나 이미 영구 삭제되었습니다.')
    }
    setViewLoading(false)
  }

  const executeRestorePost = async (postId: number) => {
    setActionProcessing(true)
    const { error } = await supabase
      .from('posts')
      .update({ is_deleted: false, deleted_at: null, delete_reason: null })
      .eq('id', postId)

    if (error) {
      showAlert('복구 실패', `복구 실패: ${error.message}`)
    } else {
      showAlert('복구 완료', '게시글이 성공적으로 복구되었습니다.')
      setViewPost(null)
      emitPostsChanged({ kind: 'refresh' })
      if (onPostRestored) onPostRestored()
      fetchNotifications()
    }
    setActionProcessing(false)
  }

  const handleRestorePost = (postId: number) => {
    setPopup({
      isOpen: true,
      title: '게시글 복구',
      message: '해당 게시글을 복구하시겠습니까? 피드에 다시 정상 노출됩니다.',
      type: 'confirm',
      onConfirm: () => {
        closePopup()
        executeRestorePost(postId)
      },
    })
  }

  const executePermanentDelete = async (postId: number) => {
    setActionProcessing(true)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      showAlert('영구 삭제 실패', `영구 삭제 실패: ${error.message}`)
    } else {
      showAlert('영구 삭제 완료', '게시글이 영구 삭제되었습니다.')
      setViewPost(null)
      emitPostsChanged({ kind: 'refresh' })
      if (onPostRestored) onPostRestored()
      fetchNotifications()
    }
    setActionProcessing(false)
  }

  const handlePermanentDelete = (postId: number) => {
    setPopup({
      isOpen: true,
      title: '게시글 영구 삭제',
      message: '게시글을 영구 삭제하시겠습니까? 데이터베이스에서 완전히 삭제되며 복구할 수 없습니다.',
      type: 'confirm',
      isDanger: true,
      onConfirm: () => {
        closePopup()
        executePermanentDelete(postId)
      },
    })
  }

  if (!isOpen || !mounted) return null

  return (
    <>
    {createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-black border-2 border-red-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-red-200 dark:border-red-950 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-red-600 text-white rounded-none">
              <Siren className="w-4 h-4" />
            </div>
            <h3 className="text-base font-black text-zinc-900 dark:text-white">
              신고 및 제재 기록 (관리진 전용)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="px-2.5 py-1 text-[11px] font-bold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-none transition"
            >
              모두 읽음
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-400">알림 기록을 불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-semibold">
              접수된 신고 및 삭제 알림이 없습니다.
            </div>
          ) : (
            notifications.map((item) => {
              const feedLabel = item.feed_type === 'community' ? '커뮤니티 피드' : '클랜 피드'
              const formattedMsg =
                item.type === 'auto_deleted'
                  ? formatAutoDeleteNotice(feedLabel, item.post_title, item.reason)
                  : formatReportNotice(item.reporter_nickname || '익명사용자', feedLabel, item.post_title, item.reason)

              return (
                <div
                  key={item.id}
                  className={`p-3 border rounded-none transition text-xs space-y-2 ${
                    item.type === 'auto_deleted'
                      ? 'border-red-500/80 bg-red-50/50 dark:bg-red-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  } ${!item.is_read ? 'ring-1 ring-red-500' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-none ${
                        item.type === 'auto_deleted'
                          ? 'bg-red-600 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {item.type === 'auto_deleted' ? '3회 누적 자동 삭제' : '신고 접수'}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed break-words">
                    {formattedMsg}
                  </p>

                  {item.type === 'auto_deleted' && item.post_id && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleOpenPostContent(item.post_id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white rounded-none transition shadow-sm"
                      >
                        <Eye className="w-3 h-3" />
                        <span>내용보기</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 내용보기 및 복구/영구삭제 서브 모달 */}
      {viewPost && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={(e) => {
            e.stopPropagation()
            setViewPost(null)
          }}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-zinc-950 border-2 border-red-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-black text-zinc-900 dark:text-white">
                  삭제된 게시글 상세 심사
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewPost(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 block">
                삭제 사유: {viewPost.delete_reason || '사유 미입력'}
              </span>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white break-words">
                {viewPost.title}
              </h2>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm leading-relaxed max-h-72 overflow-y-auto rounded-none prose dark:prose-invert max-w-none">
                <div className="[contain:paint]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(viewPost.content) }} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => handleRestorePost(viewPost.id)}
                disabled={actionProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>복구</span>
              </button>
              <button
                type="button"
                onClick={() => handlePermanentDelete(viewPost.id)}
                disabled={actionProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-none transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>영구 삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
    )}

    {/* 팝업은 신고 기록 창 바깥에 두어, 팝업 여백 클릭이 신고 기록 창까지 닫지 않도록 함 */}
    <CustomPopup
      isOpen={popup.isOpen}
      title={popup.title}
      message={popup.message}
      type={popup.type || 'alert'}
      isDanger={popup.isDanger}
      onConfirm={popup.onConfirm}
      onCancel={closePopup}
    />
    </>
  )
}
