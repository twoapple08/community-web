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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
      </head>
      <body className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-300">
        <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-2">
            <Link href="/" className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white hover:opacity-80 transition shrink-0">
              COMMUNITY
            </Link>

            <div className="flex items-center gap-1 sm:gap-2 shrink min-w-0 overflow-x-auto no-scrollbar py-1">
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
                    <Sun className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-950 stroke-[2.5]" />
                  )}
                </span>
              </button>

              {user ? (
                <>
                  <Link
                    href="/write"
                    className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-medium transition duration-300 whitespace-nowrap shrink-0"
                  >
                    <PenSquare className="w-3.5 h-3.5" />
                    <span>글쓰기</span>
                  </Link>

                  <button
                    onClick={() => setIsUserHubOpen(true)}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition duration-300 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0"
                    title="마이 메뉴"
                  >
                    <CrownIcon role={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole} className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="max-w-[55px] sm:max-w-[110px] truncate">{nickname || "닉네임"}</span>
                  </button>

                  {isCreatorOrSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsAdminModalOpen(true)}
                      className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition duration-300 whitespace-nowrap shrink-0"
                      title="관리자 지정"
                    >
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">관리자 지정</span>
                    </button>
                  )}

                  {isAdminGroup && (
                    <button
                      type="button"
                      onClick={() => setIsBlacklistModalOpen(true)}
                      className="!bg-black !text-white !border !border-white hover:!bg-zinc-900 inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 text-xs font-bold rounded-none transition whitespace-nowrap shrink-0 shadow-sm"
                      title="블랙리스트 관리"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 !text-white shrink-0" />
                      <span>블랙리스트</span>
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-lg bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-300 text-xs sm:text-sm font-medium transition duration-300 shrink-0"
                    title="로그아웃"
                  >
                    <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">로그아웃</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs sm:text-sm font-semibold transition duration-300 whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>로그인</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main>{children}</main>

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
