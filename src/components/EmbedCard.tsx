'use client'

import { useEffect, useState } from 'react'
import { EMBED_ICON, EMBED_STYLES, fetchEmbedTitle, resolveEmbedDisplayTitle, type EmbedType } from '@/lib/embeds'

interface EmbedCardProps {
  type: EmbedType
  url: string
  /** 카드를 누르면 호출 (외부 링크 접속 확인 팝업 띄우기) */
  onClick: (url: string) => void
}

/** 댓글용 카카오톡 오픈채팅 / 디스코드 초대 카드 (게시글 임베드 바와 같은 디자인의 작은 버전) */
export default function EmbedCard({ type, url, onClick }: EmbedCardProps) {
  const s = EMBED_STYLES[type]
  const icon = EMBED_ICON[type]
  // 캐시된 실제 이름을 첫 화면부터 바로 표시 (없으면 기본 이름)
  const [title, setTitle] = useState(() => resolveEmbedDisplayTitle(type, url))

  // 모르는 이름은 미리보기 API 로 조회 후 교체 (같은 링크는 동시에 1번만 요청)
  useEffect(() => {
    let alive = true
    fetchEmbedTitle(url).then((fetched) => {
      if (alive && fetched) setTitle(fetched)
    })
    return () => {
      alive = false
    }
  }, [url])

  return (
    <button
      type="button"
      title={url}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick(url)
      }}
      className={`my-1.5 w-full max-w-sm px-3 py-2 ${s.bar} rounded-none flex items-center justify-between gap-2.5 text-left whitespace-normal cursor-pointer select-none group`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={`w-7 h-7 rounded-none ${s.iconBox} flex items-center justify-center shrink-0`}>
          <svg className="w-4 h-4 fill-current" viewBox={icon.viewBox} aria-hidden="true">
            <path d={icon.path} />
          </svg>
        </span>
        <span className={`text-xs sm:text-sm font-extrabold ${s.title} truncate group-hover:underline`}>{title}</span>
      </span>
      <span className={`px-3 py-1 ${s.button} text-[10px] sm:text-xs font-black rounded-none shrink-0`}>{s.buttonLabel}</span>
    </button>
  )
}
