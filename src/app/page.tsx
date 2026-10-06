'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCleanSearchAndHash } from '@/lib/authUrl'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    // [보안] Supabase 가 로그인 코드 처리를 끝낼 때까지 기다린 뒤, 인증 파라미터를 뺀 주소로만 이동
    // (예전에는 토큰이 붙은 주소를 그대로 /community 로 넘겨 주소창에 토큰이 남는 경우가 있었음)
    supabase.auth
      .getSession()
      .catch(() => null)
      .finally(() => {
        if (cancelled) return
        router.replace(`/community${getCleanSearchAndHash()}`)
      })
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black text-zinc-500 dark:text-zinc-400 text-xs font-medium">
      커뮤니티 피드로 이동 중...
    </div>
  )
}
