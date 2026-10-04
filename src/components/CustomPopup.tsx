'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

interface CustomPopupProps {
  isOpen: boolean
  title: string
  message: string
  type?: 'alert' | 'confirm'
  onConfirm: () => void
  onCancel?: () => void
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
}

export default function CustomPopup({
  isOpen,
  title,
  message,
  type = 'alert',
  onConfirm,
  onCancel,
  confirmText = '확인',
  cancelText = '취소',
  isDanger = false,
}: CustomPopupProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        if (type === 'alert') onConfirm();
        else if (onCancel) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-black border-2 border-zinc-900 dark:border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-semibold whitespace-pre-wrap">
          {message}
        </p>

        <div className="flex items-center justify-center gap-2 pt-2">
          {type === 'confirm' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onCancel) onCancel();
              }}
              className="px-4 py-1.5 text-xs font-bold rounded-none border border-zinc-400 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className={`px-5 py-1.5 text-xs font-black rounded-none transition shadow-sm ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
