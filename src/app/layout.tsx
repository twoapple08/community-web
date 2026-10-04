'use client'

import { CrownIcon } from "@/components/CrownIcon";
import AdminModal from "@/components/AdminModal";
import UserHubModal from "@/components/UserHubModal";
import BlacklistModal from "@/components/BlacklistModal";
import TermsModal from "@/components/TermsModal";
import './globals.css'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Moon, Sun, PenSquare, LogOut, LogIn, Crown, ShieldAlert } from 'lucide-react'

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
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);
  const [isUserHubOpen, setIsUserHubOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme === 'light') {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    } else {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const loadUserProfile = async (userId: string, email?: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('nickname, terms_agreed')
      .eq('id', userId)
      .maybeSingle();

    if (profileData?.nickname) {
      setNickname(profileData.nickname);
    } else {
      setNickname('익명사용자');
    }

    if (!profileData?.terms_agreed) {
      setIsTermsModalOpen(true);
    } else {
      setIsTermsModalOpen(false);
    }

    if (email?.toLowerCase() === "iwsamuel08@gmail.com") {
      setUserRole("creator");
    } else {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .or(`user_id.eq.${userId},email.eq.${email || ''}`)
        .maybeSingle();

      if (roleData?.role) {
        setUserRole(roleData.role as "creator" | "super_admin" | "admin");
      } else {
        setUserRole(null);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email);
      } else {
        setNickname('');
        setUserRole(null);
        setIsTermsModalOpen(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setNickname('');
    setUserRole(null);
  };

  const isCreatorOrSuperAdmin =
    user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ||
    userRole === "creator" ||
    userRole === "super_admin";

  const isAdminGroup = Boolean(userRole === "creator" || userRole === "super_admin" || userRole === "admin");

  return (
    <html lang="ko" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        
        {/* 브라우저 타이틀 및 메타태그 */}
        <title>스틱파이터 클랜 커뮤니티</title>
        <meta name="description" content="자신만의 클랜을 홍보하세요" />

        {/* 새 도메인 기준 파비콘 및 앱 아이콘 (캐시 강제 무력화 v=3) */}
        <link rel="icon" href="/icon.png?v=3" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png?v=3" />

        {/* 카카오톡 / 디스코드 링크 공유 미리보기 (공식 도메인 sfaclan.com 연동) */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="스틱파이터 클랜 커뮤니티" />
        <meta property="og:title" content="스틱파이터 클랜 커뮤니티" />
        <meta property="og:description" content="자신만의 클랜을 홍보하세요" />
        <meta property="og:image" content="https://www.sfaclan.com/icon.png?v=3" />
        <meta property="og:url" content="https://www.sfaclan.com/" />

        {/* 트위터 / X 카드 메타태그 */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="스틱파이터 클랜 커뮤니티" />
        <meta name="twitter:description" content="자신만의 클랜을 홍보하세요" />
        <meta name="twitter:image" content="https://www.sfaclan.com/icon.png?v=3" />
      </head>
      <body className="min-h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-300 overflow-x-hidden flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md transition-colors duration-300">
          <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 h-13 sm:h-15 flex items-center justify-between gap-1.5">
            <Link href="/" className="text-sm sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white hover:opacity-80 transition shrink-0">
              COMMUNITY
            </Link>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink min-w-0">
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                onClick={toggleTheme}
                title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                className={`relative inline-flex h-6 w-11 sm:h-7 sm:w-13 items-center rounded-full p-0.5 transition-colors duration-300 cursor-pointer shadow-inner shrink-0 ${
                  theme === 'dark'
                    ? 'bg-white border border-zinc-200'
                    : 'bg-zinc-900 border border-zinc-800'
                }`}
              >
                <span
                  className={`inline-flex h-4.5 w-4.5 sm:h-5 sm:w-5 transform items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out ${
                    theme === 'dark'
                      ? 'translate-x-5 sm:translate-x-6 bg-zinc-950'
                      : 'translate-x-0 bg-white'
                  }`}
                >
                  {theme === 'dark' ? (
                    <Moon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white fill-white" />
                  ) : (
                    <Sun className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-zinc-950 stroke-[2.5]" />
                  )}
                </span>
              </button>

              {user ? (
                <>
                  <Link
                    href="/write"
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0 shadow-sm"
                  >
                    <PenSquare className="w-3 h-3" />
                    <span>글쓰기</span>
                  </Link>

                  <button
                    onClick={() => setIsUserHubOpen(true)}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-[11px] sm:text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0"
                    title="마이 메뉴"
                  >
                    <CrownIcon role={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole} className="w-3 h-3 shrink-0" />
                    <span className="max-w-[45px] sm:max-w-[90px] truncate">{nickname || "닉네임"}</span>
                  </button>

                  {isCreatorOrSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsAdminModalOpen(true)}
                      className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-bold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition whitespace-nowrap shrink-0"
                      title="관리자 지정"
                    >
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">관리자</span>
                    </button>
                  )}

                  {isAdminGroup && (
                    <button
                      type="button"
                      onClick={() => setIsBlacklistModalOpen(true)}
                      className="!bg-black !text-white !border !border-white hover:!bg-zinc-900 inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-black rounded-none transition whitespace-nowrap shrink-0 shadow-sm"
                      title="블랙리스트 관리"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 !text-white shrink-0" />
                      <span>블랙</span>
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-300 text-[11px] sm:text-xs font-medium transition shrink-0"
                    title="로그아웃"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>로그인</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="w-full flex-1 flex flex-col items-stretch">{children}</main>

        {user && (
          <UserHubModal
            isOpen={isUserHubOpen}
            onClose={() => setIsUserHubOpen(false)}
            userId={user.id}
            userEmail={user.email || ""}
            userRole={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole}
            currentNickname={nickname}
            onNicknameUpdated={(newNick) => setNickname(newNick)}
          />
        )}

        <AdminModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUserRole={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole}
        />

        <BlacklistModal
          isOpen={isBlacklistModalOpen}
          onClose={() => setIsBlacklistModalOpen(false)}
        />

        {user && (
          <TermsModal
            isOpen={isTermsModalOpen}
            userId={user.id}
            onAgreed={() => setIsTermsModalOpen(false)}
          />
        )}
      </body>
    </html>
  )
}
