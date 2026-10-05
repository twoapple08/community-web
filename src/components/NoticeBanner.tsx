'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Megaphone, Pencil, X } from 'lucide-react'
import CustomPopup from './CustomPopup'
import { RoleType } from './CrownIcon'

interface SiteNotice {
  id: number
  title: string
  content: string
  updated_at: string
}

interface NoticeBannerProps {
  currentUserRole: RoleType
}

export default function NoticeBanner({ currentUserRole }: NoticeBannerProps) {
  const [notice, setNotice] = useState<SiteNotice | null>(null)
  const [isNoticeDetailOpen, setIsNoticeDetailOpen] = useState(false)
  const [isNoticeAutoPopup, setIsNoticeAutoPopup] = useState(false)
  const [isNoticeEditOpen, setIsNoticeEditOpen] = useState(false)
  const [editNoticeTitle, setEditNoticeTitle] = useState('')
  const [editNoticeContent, setEditNoticeContent] = useState('')
  const [savingNotice, setSavingNotice] = useState(false)
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false)

  const [toastState, setToastState] = useState<{
    visible: boolean
    animatingOut: boolean
    text: string
  }>({
    visible: false,
    animatingOut: false,
    text: '',
  })

  const isAdmin = Boolean(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin')

  useEffect(() => {
    fetchNotice()
  }, [])

  const fetchNotice = async () => {
    const { data } = await supabase
      .from('site_notices')
      .select('id, title, content, updated_at')
      .eq('id', 1)
      .maybeSingle()

    if (data) {
      setNotice(data as SiteNotice)
      setEditNoticeTitle(data.title)
      setEditNoticeContent(data.content)

      // [핵심] 실제 공지 내용(제목+내용) 서명 기반 비교 (동결 토글이나 타임스탬프 오류로 인한 재노출 차단)
      const currentSignature = `${data.title}:::${data.content}`
      const savedSignature = localStorage.getItem('hide_notice_signature')

      if (savedSignature !== currentSignature) {
        setIsNoticeAutoPopup(true)
        setIsNoticeDetailOpen(true)
      }
    }
  }

  const handleCloseNoticePopup = () => {
    if (dontShowAgainChecked && notice) {
      const currentSignature = `${notice.title}:::${notice.content}`
      localStorage.setItem('hide_notice_signature', currentSignature)
      localStorage.setItem('hide_notice_until', notice.updated_at)
    }
    setIsNoticeDetailOpen(false)
  }

  const showTopToast = (msg: string) => {
    setToastState({ visible: true, animatingOut: false, text: msg })
    setTimeout(() => {
      setToastState((prev) => ({ ...prev, animatingOut: true }))
      setTimeout(() => {
        setToastState({ visible: false, animatingOut: false, text: '' })
      }, 350)
    }, 2500)
  }

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editNoticeTitle.trim() || !editNoticeContent.trim()) {
      showTopToast('제목과 내용을 모두 입력해 주십시오.')
      return
    }

    setSavingNotice(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('site_notices')
      .update({
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      })
      .eq('id', 1)

    if (error) {
      showTopToast(`공지사항 수정 실패: ${error.message}`)
    } else {
      setNotice({
        id: 1,
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      })
      setIsNoticeEditOpen(false)
      showTopToast('공지사항이 성공적으로 갱신되었습니다.')
    }
    setSavingNotice(false)
  }

  if (!notice) return null

  return (
    <>
      {toastState.visible && (
        <div
          className={`fixed top-16 sm:top-20 left-1/2 z-[100] px-4 py-2 bg-blue-600 text-white border border-blue-400 rounded-none text-xs font-bold tracking-wide pointer-events-none shadow-2xl flex items-center gap-2 max-w-[90vw] truncate ${
            toastState.animatingOut ? 'animate-notice-out' : 'animate-notice-in'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{toastState.text}</span>
        </div>
      )}

      {/* 배너 UI */}
      <div
        onClick={() => {
          setIsNoticeAutoPopup(false)
          setIsNoticeDetailOpen(true)
        }}
        className="w-full rounded-none bg-blue-50/40 dark:bg-blue-950/20 border border-blue-500/40 hover:bg-blue-100/40 dark:hover:bg-blue-950/40 px-4 py-3 sm:py-3.5 flex items-center justify-between gap-2.5 cursor-pointer transition group select-none mb-3 min-w-0"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/40 border border-blue-500/30 rounded-none">
            <Megaphone className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 shrink-0">
            [공지사항]
          </span>
          <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:underline">
            {notice.title}
          </span>
          <span className="text-xs font-semibold text-zinc-500 dark:text-white shrink-0 hidden md:inline">
            ({new Date(notice.updated_at).toLocaleDateString()})
          </span>
        </div>

        <div className="flex items-center shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsNoticeEditOpen(true)
              }}
              className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs sm:text-sm font-bold rounded-none bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm shrink-0 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>공지 수정</span>
            </button>
          )}
        </div>
      </div>

      {/* 공지 상세 모달 */}
      {isNoticeDetailOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
          onClick={handleCloseNoticePopup}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-blue-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 text-white rounded-none">
                  <Megaphone className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  공지사항
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseNoticePopup}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-blue-700 dark:text-blue-400 break-words">
                {notice.title}
              </h4>
              <p className="text-[11px] text-zinc-400">
                최종 갱신일: {new Date(notice.updated_at).toLocaleString()}
              </p>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto rounded-none break-words">
                {notice.content}
              </div>
            </div>

            <div className={`flex items-center ${isNoticeAutoPopup ? 'justify-between' : 'justify-end'} pt-2 border-t border-zinc-100 dark:border-zinc-800`}>
              {isNoticeAutoPopup && (
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dontShowAgainChecked}
                    onChange={(e) => setDontShowAgainChecked(e.target.checked)}
                    className="rounded-none border-zinc-400 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span>다음 공지 갱신 시까지 보지 않기</span>
                </label>
              )}

              <button
                type="button"
                onClick={handleCloseNoticePopup}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-none transition shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공지 수정 모달 */}
      {isNoticeEditOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md"
          onClick={() => !savingNotice && setIsNoticeEditOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-blue-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/60 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">공지사항 수정</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNoticeEditOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNotice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                  공지 제목
                </label>
                <input
                  type="text"
                  value={editNoticeTitle}
                  onChange={(e) => setEditNoticeTitle(e.target.value)}
                  placeholder="공지사항 제목을 입력하세요"
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                  공지 내용
                </label>
                <textarea
                  value={editNoticeContent}
                  onChange={(e) => setEditNoticeContent(e.target.value)}
                  placeholder="상세 공지 내용을 입력하세요"
                  rows={6}
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNoticeEditOpen(false)}
                  disabled={savingNotice}
                  className="px-4 py-2 text-xs font-semibold rounded-none border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingNotice}
                  className="px-5 py-2 text-xs font-bold rounded-none bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                >
                  {savingNotice ? '갱신 중...' : '공지 갱신 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
