'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Snowflake } from 'lucide-react'

interface FreezeModalProps {
  isOpen: boolean
  onClose: () => void
  actionText: string // "좋아요를", "신고를", "게시글 작성을", "게시글 수정을", "게시글 삭제를"
}

export default function FreezeModal({ isOpen, onClose, actionText }: FreezeModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-950 border-2 border-sky-800 dark:border-sky-400 rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          <div className="p-3 bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-400 rounded-none border border-sky-800/30 dark:border-sky-400/30">
            <Snowflake className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white">
            사이트 일시 중지 안내
          </h3>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
            현재 사이트가 중지되어 {actionText} 하실 수 없습니다.
            <br />
            잠시 후 다시 시도해주시길 바랍니다.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-xs font-bold rounded-none bg-sky-800 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 text-white transition shadow-sm"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
