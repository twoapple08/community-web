'use client'

import { useMemo } from 'react'
import EmbedCard from './EmbedCard'
import { URL_REGEX, detectLinkKind, getYoutubeId, trimTrailingPunctuation, type EmbedType } from '@/lib/embeds'

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; url: string }
  | { kind: 'embed'; type: EmbedType; url: string }
  | { kind: 'youtube'; url: string; videoId: string }

interface CommentTextProps {
  text: string
  /** 기존 댓글 문단과 같은 클래스 (글자 크기/색/줄바꿈 유지) */
  className?: string
  /** 링크/카드를 누르면 호출 (외부 링크 접속 확인 팝업) */
  onLinkClick: (url: string) => void
}

const isBlock = (seg: Segment) => seg.kind === 'embed' || seg.kind === 'youtube'

// 댓글 글자를 일반 글 / 링크 / 카드 / 유튜브 조각으로 분리
const splitSegments = (text: string): Segment[] => {
  const segments: Segment[] = []
  const pushText = (value: string) => {
    if (!value) return
    const last = segments[segments.length - 1]
    if (last && last.kind === 'text') last.text += value
    else segments.push({ kind: 'text', text: value })
  }

  // 공용 정규식의 lastIndex 상태를 건드리지 않도록 복사본 사용
  const regex = new RegExp(URL_REGEX.source, 'gi')
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) pushText(text.slice(lastIndex, match.index))
    const { url, rest } = trimTrailingPunctuation(match[0])
    const kind = detectLinkKind(url)
    const videoId = kind === 'youtube' ? getYoutubeId(url) : null
    if (kind === 'youtube' && videoId) segments.push({ kind: 'youtube', url, videoId })
    else if (kind === 'kakaotalk' || kind === 'discord') segments.push({ kind: 'embed', type: kind, url })
    else segments.push({ kind: 'link', url })
    pushText(rest)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) pushText(text.slice(lastIndex))

  // 카드/플레이어는 한 줄을 통째로 차지하므로 앞뒤 줄바꿈 1개씩은 빼서 빈 줄이 생기지 않게 함
  segments.forEach((seg, i) => {
    if (!isBlock(seg)) return
    const prev = segments[i - 1]
    const next = segments[i + 1]
    if (prev && prev.kind === 'text') prev.text = prev.text.replace(/\r?\n$/, '')
    if (next && next.kind === 'text') next.text = next.text.replace(/^\r?\n/, '')
  })
  return segments.filter((seg) => seg.kind !== 'text' || seg.text)
}

/** 댓글 본문: 줄바꿈은 그대로, http(s) 링크는 카드/플레이어/파란 링크로 표시 */
export default function CommentText({ text, className = '', onLinkClick }: CommentTextProps) {
  const segments = useMemo(() => splitSegments(text), [text])

  // <p> 안에는 카드(블록 요소)를 넣을 수 없어 div 사용 (모양은 동일)
  return (
    <div className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <span key={i}>{seg.text}</span>
        if (seg.kind === 'embed') {
          return <EmbedCard key={`${i}-${seg.url}`} type={seg.type} url={seg.url} onClick={onLinkClick} />
        }
        if (seg.kind === 'youtube') {
          return (
            <div key={`${i}-${seg.videoId}`} className="my-1.5 w-full max-w-md">
              <div className="relative w-full h-0 pb-[56.25%] bg-zinc-200 dark:bg-zinc-800">
                <iframe
                  src={`https://www.youtube.com/embed/${encodeURIComponent(seg.videoId)}?autoplay=0&rel=0&modestbranding=1`}
                  title="YouTube 동영상"
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  loading="lazy"
                  allowFullScreen
                />
              </div>
            </div>
          )
        }
        return (
          <a
            key={`${i}-${seg.url}`}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onLinkClick(seg.url)
            }}
            className="text-blue-600 dark:text-blue-400 underline font-semibold cursor-pointer break-all"
          >
            {seg.url}
          </a>
        )
      })}
    </div>
  )
}
