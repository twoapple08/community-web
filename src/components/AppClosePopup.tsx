'use client'

import { createPortal } from 'react-dom'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { sendCloseDecision, type CloseAction } from '@/lib/appBridge'

interface AppClosePopupProps {
  isOpen: boolean
  onClose: () => void
}

// [윈도우 앱 전용] 창 닫기(X)를 눌렀을 때 "완전히 종료 / 트레이로 내리기"를 묻는 팝업 (CustomPopup 과 같은 직각 디자인)
// 배경 클릭·Esc 는 취소 (창을 그대로 둠)
export default function AppClosePopup({ isOpen, onClose }: AppClosePopupProps) {
  const [remember, setRemember] = useState(false)
  const [sending, setSending] = useState(false)
  const isBackdropMouseDownRef = useRef(false)
  const sendingRef = useRef(false)

  const decide = async (action: CloseAction) => {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    try {
      await sendCloseDecision(action, action === 'cancel' ? false : remember)
    } finally {
      sendingRef.current = false
      setSending(false)
      setRemember(false)
      onClose()
    }
  }

  // Esc = 취소
  const cancelByKeyboard = useEffectEvent(() => {
    void decide('cancel')
  })
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelByKeyboard()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // 앱(브라우저)에서 창 닫기 요청을 받은 뒤에만 열리므로 서버 렌더링에서는 항상 닫힌 상태
  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        isBackdropMouseDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropMouseDownRef.current) void decide('cancel')
        isBackdropMouseDownRef.current = false
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-close-popup-title"
        className="w-full max-w-sm bg-white dark:bg-black border-2 border-zinc-900 dark:border-white rounded-none p-6 shadow-2xl space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="app-close-popup-title"
          className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider"
        >
          창 닫기
        </h3>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-semibold whitespace-pre-wrap">
          스틱파이터 커뮤니티를 완전히 종료할까요, 아니면 작업표시줄 트레이로 내려 알림을 계속 받을까요?
        </p>

        <label className="flex items-center justify-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={sending}
            className="w-3.5 h-3.5 shrink-0 rounded-none accent-zinc-900 dark:accent-white cursor-pointer"
          />
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            다음부터 묻지 않기 (알림 설정에서 바꿀 수 있어요)
          </span>
        </label>

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => void decide('exit')}
            disabled={sending}
            className="px-4 py-1.5 text-xs font-bold rounded-none border border-zinc-400 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition disabled:opacity-50"
          >
            완전히 닫기
          </button>
          <button
            type="button"
            onClick={() => void decide('tray')}
            disabled={sending}
            className="px-5 py-1.5 text-xs font-black rounded-none transition shadow-sm bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black disabled:opacity-50"
          >
            트레이로 내리기
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
