'use client'

import { useState } from 'react'

interface FeedMediaProps {
  src: string
  alt: string
}

export default function FeedMedia({ src, alt }: FeedMediaProps) {
  const [isTall, setIsTall] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const checkRatio = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalHeight / img.naturalWidth
      if (ratio >= 1.7) {
        setIsTall(true)
      }
    }
    setLoaded(true)
  }

  return (
    <div
      className={`w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center transition-all duration-200 ${
        isTall ? 'aspect-[3/4] max-w-sm sm:max-w-md mx-auto shadow-sm' : 'max-h-[520px]'
      }`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={(e) => checkRatio(e.currentTarget)}
        ref={(el) => {
          if (el && el.complete) checkRatio(el)
        }}
        className={`w-full transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${
          isTall
            ? 'h-full object-cover object-top'
            : 'max-h-[520px] w-full object-contain'
        }`}
      />
    </div>
  )
}
