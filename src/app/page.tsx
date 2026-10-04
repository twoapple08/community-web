'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // [핵심] Google OAuth 인증 토큰/코드가 포함된 해시와 쿼리를 온전히 유지하며 /community 로 이동
    const search = typeof window !== 'undefined' ? window.location.search : ''
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    router.replace(`/community${search}${hash}`)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black text-zinc-400 text-xs font-medium">
      커뮤니티 피드로 이동 중...
    </div>
  )
}
