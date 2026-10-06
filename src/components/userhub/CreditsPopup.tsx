'use client'

import { createPortal } from 'react-dom'

interface CreditsPopupProps {
  isOpen: boolean
  onClose: () => void
}

// 크레딧 항목 (라벨은 작게, 값은 굵게)
const CREDITS: { label: string; values: string[] }[] = [
  { label: '사이트 제작자', values: ['사과사과'] },
  { label: '사용된 도구', values: ['Gemini, Claude'] },
  { label: '도움주신 분들', values: ['시르타르', '그 외 사이트 공개 전 베타 테스터 분들'] },
]

/** 마이 프로필 맨 아래 '크레딧' 팝업 (CustomPopup 과 같은 각진 흑백 디자인) */
export default function CreditsPopup({ isOpen, onClose }: CreditsPopupProps) {
  // 버튼을 눌러야 열리므로 서버 렌더링 시점에는 그려지지 않음 (document 없으면 생략)
  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        // 포털이어도 React 이벤트는 부모(마이 프로필 배경)로 전달되므로 여기서 멈춰 허브까지 닫히지 않게 함
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="크레딧"
        className="w-full max-w-sm bg-white dark:bg-black border-2 border-zinc-900 dark:border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">크레딧</h3>

        <div className="space-y-3.5">
          {CREDITS.map((item) => (
            <div key={item.label} className="space-y-0.5">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.label}</p>
              {item.values.map((value) => (
                <p key={value} className="text-xs font-bold text-zinc-900 dark:text-white leading-relaxed">
                  {value}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 text-xs font-black rounded-none transition shadow-sm bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
