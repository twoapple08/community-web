'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface FreezeModalProps {
  isOpen: boolean
  onClose: () => void
  actionText: string
}

export default function FreezeModal({ isOpen, onClose, actionText }: FreezeModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-black border-2 border-sky-600 dark:border-sky-400 rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5 text-center">
          <p className="text-xs sm:text-sm text-zinc-900 dark:text-white leading-relaxed font-semibold">
            현재 사이트가 중지되어 {actionText} 하실 수 없습니다.
          </p>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-semibold">
            잠시 후 다시 시도해주시길 바랍니다.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-6 py-2 text-xs font-bold rounded-none bg-sky-600 hover:bg-sky-700 dark:bg-sky-400 dark:hover:bg-sky-300 text-white dark:text-black transition shadow-sm cursor-pointer"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
