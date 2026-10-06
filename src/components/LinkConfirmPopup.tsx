'use client'

import { createPortal } from 'react-dom'

interface LinkConfirmPopupProps {
  /** 접속할 외부 링크 (null 이면 아무것도 표시하지 않음) */
  url: string | null
  onClose: () => void
}

/** 외부 링크 접속 확인 팝업 (게시글 본문/댓글 링크 공용) */
export default function LinkConfirmPopup({ url, onClose }: LinkConfirmPopupProps) {
  // url 은 클릭 이후에만 생기므로 서버 렌더링/하이드레이션 시점에는 항상 null → 바로 포털 사용 가능
  if (!url || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border rounded-none p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold">외부 링크 접속 확인</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">이 링크로 이동하시겠습니까?</p>
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-none text-xs font-mono break-all text-left max-h-24 overflow-y-auto">
          {url}
        </div>
        <div className="flex justify-center gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs border rounded-none">취소</button>
          <button
            onClick={() => {
              onClose()
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
            className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-none"
          >
            접속
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
