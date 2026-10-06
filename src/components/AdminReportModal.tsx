'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { Siren, X, Eye } from 'lucide-react'
import { formatReportNotice, formatCommentReportNotice, formatReviewRequiredNotice } from '@/lib/koreanUtils'
import { emitPostsChanged } from '@/lib/feedStore'
import CustomPopup from './CustomPopup'
import ReportReviewModal, { type ReportReviewTarget, type ReportTargetType, type ReviewConfirmRequest } from './ReportReviewModal'

// DB 원본 행 (새 컬럼은 SQL 미적용 시 없을 수 있음)
interface RawAdminNotification {
  id: number
  type: string | null
  target_type?: string | null
  post_id: number | null
  comment_id?: number | null
  comment_preview?: string | null
  reporter_nickname: string | null
  post_title: string | null
  feed_type: string | null
  reason: string | null
  message: string | null
  is_read: boolean
  created_at: string
  resolution?: string | null
  resolved_at?: string | null
  resolved_by_nickname?: string | null
}

type NoticeKind = 'report' | 'review_required'
type Resolution = 'deleted' | 'dismissed' | null

interface AdminNotification {
  id: number
  kind: NoticeKind
  targetType: ReportTargetType
  /** 심사 창에서 열 대상 번호 (게시글 id 또는 댓글 id). 없으면 내용 보기 불가 */
  targetId: number | null
  text: string
  isRead: boolean
  createdAt: string
  resolution: Resolution
  resolvedAt: string | null
  resolvedBy: string | null
}

interface AdminReportModalProps {
  isOpen: boolean
  onClose: () => void
  onPostRestored?: () => void
}

const NOTIFICATION_LIMIT = 100

// 예전 '3회 누적 자동 삭제'(auto_deleted) 알림도 '심사 필요'와 똑같이 취급
const normalizeNotification = (raw: RawAdminNotification): AdminNotification => {
  const kind: NoticeKind = raw.type === 'review_required' || raw.type === 'auto_deleted' ? 'review_required' : 'report'
  const targetType: ReportTargetType = raw.target_type === 'comment' ? 'comment' : 'post'
  const feedLabel = raw.feed_type === 'community' ? '커뮤니티 피드' : '클랜 피드'
  const title = (raw.post_title || '').trim() || '(제목 없음)'
  const reason = (raw.reason || '').trim()
  const reporter = (raw.reporter_nickname || '').trim() || '익명사용자'

  const text =
    kind === 'review_required'
      ? formatReviewRequiredNotice(feedLabel, title, reason, targetType, raw.comment_preview)
      : targetType === 'comment'
      ? formatCommentReportNotice(reporter, feedLabel, title, raw.comment_preview, reason || '사유 미기재')
      : formatReportNotice(reporter, feedLabel, title, reason || '사유 미기재')

  const targetId = targetType === 'comment' ? raw.comment_id ?? null : raw.post_id ?? null

  return {
    id: raw.id,
    kind,
    targetType,
    targetId,
    text,
    isRead: Boolean(raw.is_read),
    createdAt: raw.created_at,
    resolution: raw.resolution === 'deleted' || raw.resolution === 'dismissed' ? raw.resolution : null,
    resolvedAt: raw.resolved_at ?? null,
    resolvedBy: (raw.resolved_by_nickname || '').trim() || null,
  }
}

export default function AdminReportModal({ isOpen, onClose, onPostRestored }: AdminReportModalProps) {
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)

  // 내용 보기 · 심사 창 대상
  const [reviewTarget, setReviewTarget] = useState<ReportReviewTarget | null>(null)

  // 브라우저 기본 alert/confirm 대신 사이트 전용 직각 팝업
  const [popup, setPopup] = useState<{
    isOpen: boolean
    title: string
    message: string
    type?: 'alert' | 'confirm'
    isDanger?: boolean
    confirmText?: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const closePopup = useCallback(() => setPopup((p) => ({ ...p, isOpen: false })), [])

  const showAlert = useCallback(
    (title: string, message: string) =>
      setPopup({ isOpen: true, title, message, type: 'alert', onConfirm: closePopup }),
    [closePopup]
  )

  const showConfirm = useCallback(
    (request: ReviewConfirmRequest) =>
      setPopup({
        isOpen: true,
        title: request.title,
        message: request.message,
        type: 'confirm',
        isDanger: request.isDanger,
        confirmText: request.confirmText,
        onConfirm: () => {
          closePopup()
          request.onConfirm()
        },
      }),
    [closePopup]
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  // '불러오는 중' 표시는 처음 열 때만 (심사 처리 후 새로고침에서는 목록이 깜빡이지 않도록 조용히 갱신)
  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(NOTIFICATION_LIMIT)

    if (data) {
      setNotifications((data as RawAdminNotification[]).map(normalizeNotification))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen, fetchNotifications])

  // 닫을 때 심사 창도 함께 정리 → 다시 열면 '불러오는 중' 후 목록부터 보이도록
  const handleClose = () => {
    setReviewTarget(null)
    setLoading(true)
    onClose()
  }

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id)
    if (unreadIds.length === 0) return

    await supabase.from('admin_notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  const openReview = (item: AdminNotification) => {
    if (!item.targetId) return
    setReviewTarget({ targetType: item.targetType, targetId: item.targetId })
  }

  // 심사 결과 반영 후: 피드/목록 새로고침 + 알림 기록 다시 불러오기
  const handleReviewChanged = useCallback(() => {
    emitPostsChanged({ kind: 'refresh' })
    if (onPostRestored) onPostRestored()
    fetchNotifications()
  }, [onPostRestored, fetchNotifications])

  const closeReview = useCallback(() => setReviewTarget(null), [])

  if (!isOpen || !mounted) return null

  const pendingReviews = notifications.filter(
    (n) => n.kind === 'review_required' && n.resolution === null && n.targetId !== null
  )

  const renderBadges = (item: AdminNotification) => {
    if (item.kind === 'report') {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-none bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
          신고 접수
        </span>
      )
    }
    if (item.resolution === 'deleted') {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-none bg-red-600 dark:bg-red-600 text-white dark:text-white">
          삭제 확정
        </span>
      )
    }
    if (item.resolution === 'dismissed') {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-none bg-emerald-600 dark:bg-emerald-600 text-white dark:text-white">
          무고 처리
        </span>
      )
    }
    return (
      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-none bg-amber-400 dark:bg-amber-500 text-zinc-900 dark:text-black">
        심사 대기
      </span>
    )
  }

  const renderRow = (item: AdminNotification, inPendingSection: boolean) => {
    const isPendingReview = item.kind === 'review_required' && item.resolution === null
    const tone = inPendingSection
      ? 'border-amber-400 dark:border-amber-600/70 bg-amber-50 dark:bg-amber-950/20'
      : item.kind === 'review_required'
      ? 'border-red-500/80 bg-red-50/50 dark:bg-red-950/30'
      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'

    return (
      <div
        key={`${inPendingSection ? 'pending' : 'all'}-${item.id}`}
        className={`p-3 border rounded-none transition text-xs space-y-2 ${tone} ${
          !inPendingSection && !item.isRead ? 'ring-1 ring-red-500' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 min-w-0">{renderBadges(item)}</div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">{new Date(item.createdAt).toLocaleString()}</span>
        </div>

        <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed break-words">{item.text}</p>

        {item.resolution && (item.resolvedBy || item.resolvedAt) && (
          <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 break-words">
            처리: {item.resolvedBy || '관리자'}
            {item.resolvedAt ? ` · ${new Date(item.resolvedAt).toLocaleString()}` : ''}
          </p>
        )}

        {item.targetId !== null && (
          <div className="pt-1 flex justify-end">
            {inPendingSection ? (
              <button
                type="button"
                onClick={() => openReview(item)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-black bg-red-600 hover:bg-red-500 text-white rounded-none transition shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>내용 보기 · 심사</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openReview(item)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-none transition shadow-sm ${
                  isPendingReview
                    ? 'bg-red-600 hover:bg-red-500 text-white border border-red-600'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>{isPendingReview ? '내용 보기 · 심사' : '내용 보기'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
    {createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
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
              onClick={handleClose}
              className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-500 dark:text-zinc-400">알림 기록을 불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-semibold">
              접수된 신고 및 삭제 알림이 없습니다.
            </div>
          ) : (
            <>
              {pendingReviews.length > 0 && (
                <section className="space-y-2 pb-1">
                  <h4 className="text-xs font-black text-amber-700 dark:text-amber-400">
                    심사 대기 ({pendingReviews.length})
                  </h4>
                  {pendingReviews.map((item) => renderRow(item, true))}
                </section>
              )}

              <section className="space-y-2.5">
                <h4 className="text-xs font-black text-zinc-600 dark:text-zinc-400">전체 기록</h4>
                {notifications.map((item) => renderRow(item, false))}
              </section>
            </>
          )}
        </div>
      </div>

      {/* 내용 보기 · 심사 서브 모달 (대상이 바뀌면 새로 불러오도록 key 지정) */}
      {reviewTarget && (
        <ReportReviewModal
          key={`${reviewTarget.targetType}-${reviewTarget.targetId}`}
          target={reviewTarget}
          onClose={closeReview}
          onChanged={handleReviewChanged}
          showAlert={showAlert}
          showConfirm={showConfirm}
        />
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
      confirmText={popup.confirmText}
      onConfirm={popup.onConfirm}
      onCancel={closePopup}
    />
    </>
  )
}
