'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Siren, X, Check } from 'lucide-react'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  postId: string
  currentUserId: string | null
}

const IMAGE_REASONS = ['선정성 이미지 사용', '폭력적인 이미지 사용'] as const;
const CONTENT_REASONS = ['욕설', '혐오 발언', '같은 내용 반복 게시'] as const;

export default function ReportModal({ isOpen, onClose, postId, currentUserId }: ReportModalProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [isOtherSelected, setIsOtherSelected] = useState(false)
  const [customReasonText, setCustomReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const toggleReason = (r: string) => {
    setSelectedReasons((prev) =>
      prev.includes(r) ? prev.filter((item) => item !== r) : [...prev, r]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      alert('신고 기능은 로그인 후 이용 가능합니다.')
      return
    }

    if (selectedReasons.length === 0 && !isOtherSelected) {
      alert('신고 사유를 최소 하나 이상 선택해 주십시오.')
      return
    }

    if (isOtherSelected && !customReasonText.trim()) {
      alert('기타 사유 내용을 입력해 주십시오.')
      return
    }

    setSubmitting(true)
    const finalReasons = [...selectedReasons]
    if (isOtherSelected) {
      finalReasons.push('기타')
    }

    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)

    const { error } = await supabase.from('post_reports').insert({
      post_id: targetPostId,
      reporter_id: currentUserId,
      reasons: finalReasons,
      custom_reason: isOtherSelected ? customReasonText.trim() : null,
    })

    if (error) {
      if (error.code === '23505') {
        alert('이미 신고한 게시글입니다. (게시글 하나당 1회만 신고 가능)')
      } else {
        alert(`신고 접수 실패: ${error.message}`)
      }
    } else {
      alert('신고가 정상적으로 접수되었습니다. 관리자 시스템 및 자동 누적 정책에 따라 처리됩니다.')
      onClose()
    }
    setSubmitting(false)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
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
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* 큰 주제 1 (체크박스 없음) */}
          <div className="space-y-2">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 block border-l-2 border-rose-600 pl-2">
              부적절한 이미지
            </span>
            <div className="space-y-1.5 pl-3">
              {IMAGE_REASONS.map((reason) => {
                const checked = selectedReasons.includes(reason)
                return (
                  <label key={reason} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleReason(reason)}
                      className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{reason}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* 큰 주제 2 (체크박스 없음) */}
          <div className="space-y-2">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 block border-l-2 border-rose-600 pl-2">
              부적절한 내용
            </span>
            <div className="space-y-1.5 pl-3">
              {CONTENT_REASONS.map((reason) => {
                const checked = selectedReasons.includes(reason)
                return (
                  <label key={reason} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleReason(reason)}
                      className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{reason}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* 기타 직접 기입란 */}
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
    </div>
  )
}
