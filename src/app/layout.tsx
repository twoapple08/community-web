'use client'

import { CrownIcon } from "@/components/CrownIcon";
import AdminModal from "@/components/AdminModal";
import './globals.css'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Moon, Sun, PenSquare, LogOut, LogIn, Check, Crown } from 'lucide-react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [user, setUser] = useState<any>(null)
  const [nickname, setNickname] = useState<string>("");
  const [userRole, setUserRole] = useState<"creator" | "super_admin" | "admin" | null>(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  
  // 닉네임 수정 팝업 상태
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [updatingNickname, setUpdatingNickname] = useState(false)

  // 초기 테마 로드
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null
    if (savedTheme === 'light') {
      setTheme('light')
      document.documentElement.classList.remove('dark')
    } else {
      setTheme('dark')
      document.documentElement.classList.add('dark')
    }
  }, [])

  // 테마 토글 함수
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // 유저 프로필 닉네임 및 관리자 권한 동시 로드
  const loadUserProfile = async (userId: string, email?: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('id', userId)
      .maybeSingle()

    if (profileData?.nickname) {
      setNickname(profileData.nickname)
    } else {
      setNickname('익명사용자')
    }

    if (email?.toLowerCase() === "iwsamuel08@gmail.com") {
      setUserRole("creator")
    } else {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .or(`user_id.eq.${userId},email.eq.${email || ''}`)
        .maybeSingle()

      if (roleData?.role) {
        setUserRole(roleData.role as "creator" | "super_admin" | "admin")
      } else {
        setUserRole(null)
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email)
      } else {
        setNickname('')
        setUserRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setNickname('')
    setUserRole(null)
  }

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNickname.trim()) return alert('닉네임을 입력해 주십시오.')
    if (newNickname.trim().length > 15) return alert('닉네임은 15자 이하로 설정해 주십시오.')

    setUpdatingNickname(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        nickname: newNickname.trim(),
      })

    if (error) {
      alert(`닉네임 저장 실패: ${error.message}`)
    } else {
      setNickname(newNickname.trim())
      setShowNicknameModal(false)
      window.location.reload()
    }
    setUpdatingNickname(false)
  }

  const isCreatorOrSuperAdmin =
    user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ||
    userRole === "creator" ||
    userRole === "super_admin"

  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-200">
        {/* 상단 네비게이션 헤더 */}
        <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md transition-colors duration-200">
          <div className="max-w-6xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-1 sm:gap-2">
            {/* 로고 */}
            <Link href="/" className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white hover:opacity-80 transition shrink-0">
              COMMUNITY
            </Link>

            {/* 우측 네비게이션 영역 */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* 테마 토글 버튼 */}
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                onClick={toggleTheme}
                title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                className={`relative inline-flex h-7 w-12 sm:h-8 sm:w-14 items-center rounded-full p-0.5 sm:p-1 transition-colors duration-300 cursor-pointer shadow-inner shrink-0 ${
                  theme === 'dark'
                    ? 'bg-white border border-zinc-200'
                    : 'bg-zinc-900 border border-zinc-800'
                }`}
              >
                <span
                  className={`inline-flex h-5 w-5 sm:h-6 sm:w-6 transform items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out ${
                    theme === 'dark'
                      ? 'translate-x-5 sm:translate-x-6 bg-zinc-950'
                      : 'translate-x-0 bg-white'
                  }`}
                >
                  {theme === 'dark' ? (
                    <Moon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white fill-white" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-zinc-950 stroke-[2.5]" />
                  )}
                </span>
              </button>

              {user ? (
                <>
                  {/* 글쓰기 버튼 */}
                  <Link
                    href="/write"
                    className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0"
                  >
                    <PenSquare className="w-3.5 h-3.5" />
                    <span>글쓰기</span>
                  </Link>

                  {/* 닉네임 버튼 */}
                  <button
                    onClick={() => {
                      setNewNickname(nickname)
                      setShowNicknameModal(true)
                    }}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0"
                    title="닉네임 변경"
                  >
                    <CrownIcon role={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole} className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="max-w-[55px] sm:max-w-[110px] truncate">{nickname || "닉네임"}</span>
                  </button>

                  {/* 관리자 지정 버튼 */}
                  {isCreatorOrSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsAdminModalOpen(true)}
                      className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition whitespace-nowrap shrink-0"
                      title="관리자 지정"
                    >
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">관리자 지정</span>
                    </button>
                  )}

                  {/* 로그아웃 버튼 */}
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-lg bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-300 text-xs sm:text-sm font-medium transition shrink-0"
                    title="로그아웃"
                  >
                    <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">로그아웃</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>로그인</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main>{children}</main>

        {/* 닉네임 변경 팝업 모달 */}
        {showNicknameModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
            onClick={() => !updatingNickname && setShowNicknameModal(false)}
          >
            <div
              className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">닉네임 변경</h3>
              <form onSubmit={handleSaveNickname} className="space-y-4">
                <input
                  type="text"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder="사용할 닉네임을 입력하세요"
                  maxLength={15}
                  autoFocus
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNicknameModal(false)}
                    disabled={updatingNickname}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={updatingNickname}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{updatingNickname ? '저장 중...' : '변경 완료'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 관리자 지정 모달 */}
        <AdminModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUserRole={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole}
        />
      </body>
    </html>
  )
}
