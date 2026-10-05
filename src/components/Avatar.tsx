'use client'

import { useState, type ReactNode } from 'react'
import { User } from 'lucide-react'

interface AvatarProps {
  /** 프로필 사진 주소 (없으면 fallback 또는 기본 사람 아이콘) */
  src?: string | null
  /** 지름(px) */
  size?: number
  alt?: string
  className?: string
  /** 사진이 없거나 불러오지 못했을 때 대신 보여줄 내용 (지정하지 않으면 기본 사람 아이콘 원) */
  fallback?: ReactNode
}

/** 원형 프로필 사진 (GIF 움직임 유지, 화면에 보일 때만 로드) */
export default function Avatar({ src, size = 32, alt = '프로필 사진', className = '', fallback }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = Boolean(src) && failedSrc !== src

  if (!showImage && fallback !== undefined) return <>{fallback}</>

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src as string)}
          className="w-full h-full object-cover"
        />
      ) : (
        <User className="text-zinc-400 dark:text-zinc-500" style={{ width: size * 0.55, height: size * 0.55 }} />
      )}
    </span>
  )
}
