'use client'

import { useEffect, useRef, useState } from 'react'

interface VideoThumbProps {
  src: string
  className?: string
}

/**
 * 목록용 동영상 미리보기 (재생 없이 첫 프레임만 표시)
 * - 화면 근처에 왔을 때만 메타데이터를 불러옴 (목록에 동영상이 많아도 처음 로딩이 느려지지 않게)
 * - #t=0.1 : iOS Safari 에서도 검은 화면 대신 첫 장면이 그려지게 함
 */
export default function VideoThumb({ src, className = '' }: VideoThumbProps) {
  const holderRef = useRef<HTMLSpanElement>(null)
  // IntersectionObserver 가 없는 아주 오래된 브라우저는 바로 표시
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = holderRef.current
    if (!el || visible || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  const frameSrc = src.includes('#') ? src : `${src}#t=0.1`

  return (
    <span ref={holderRef} className={`block w-full h-full bg-zinc-100 dark:bg-zinc-800 ${className}`}>
      {visible && (
        <video
          src={frameSrc}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          disablePictureInPicture
          onLoadedMetadata={() => setReady(true)}
          onLoadedData={() => setReady(true)}
          className={`block w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  )
}
