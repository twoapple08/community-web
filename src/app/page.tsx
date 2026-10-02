'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 세션 확인
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    checkUser()

    // 로그인 상태 변화 감지
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">시스템 로딩 중...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6">
      <div className="w-full max-w-md p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl text-center space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">커뮤니티 웹 코어 테스트</h1>

        {user ? (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-left text-sm space-y-1">
              <p className="text-zinc-400">접속 계정:</p>
              <p className="font-semibold text-emerald-400">{user.email}</p>
              <p className="text-xs text-zinc-500 font-mono mt-1">UID: {user.id}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 font-medium rounded-lg transition"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              구글 로그인을 실행하여 DB 프로필 자동 생성 및 세션을 확인합니다.
            </p>
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 px-4 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition flex items-center justify-center gap-2"
            >
              Google 계정으로 로그인
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
