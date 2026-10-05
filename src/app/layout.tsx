'use client'

import { CrownIcon } from "@/components/CrownIcon";
import AdminModal from "@/components/AdminModal";
import UserHubModal from "@/components/UserHubModal";
import BlacklistModal from "@/components/BlacklistModal";
import TermsModal from "@/components/TermsModal";
import AdminReplyPopup from "@/components/AdminReplyPopup";
import './globals.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearRoleCaches, fetchMyRole, isCreatorEmail } from '@/lib/roles'
import { scrubAuthParamsFromUrl } from '@/lib/authUrl'
import {
  describeNotification,
  fetchLatestUnreadNotification,
  fetchUnreadNotificationCount,
  markNotificationRead,
  resolveNotificationPostPath,
  type UserNotification,
} from '@/lib/notifications'
import { Moon, Sun, PenSquare, LogOut, LogIn, Crown, ShieldAlert, Bell } from 'lucide-react'

// 첫 화면이 그려지기 전에 저장된 테마를 적용 (라이트 모드 사용자가 접속할 때 검은 화면이 번쩍이던 문제 해결)
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;if(t==='light'){c.remove('dark')}else{c.add('dark')}}catch(e){}})();`

const SITE_TITLE = '스틱파이터 커뮤니티'
const SITE_DESCRIPTION = '유저들과 소통하고 클랜을 홍보하세요'

const NOTIFICATION_POLL_MS = 60 * 1000

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [nickname, setNickname] = useState<string>("");
  const [userRole, setUserRole] = useState<"creator" | "super_admin" | "admin" | null>(null);

  // 상단 프로필 버튼 빨간점 알람 상태 (관리자 알림 + 내 게시글 알림)
  const [hasAdminAlert, setHasAdminAlert] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const hasProfileBadge = hasAdminAlert || unreadNotificationCount > 0;

  // 새 알림 토스트
  const [toast, setToast] = useState<{ notification: UserNotification; animatingOut: boolean } | null>(null);
  const toastTimersRef = useRef<number[]>([]);

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);
  const [isUserHubOpen, setIsUserHubOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  const loadedUserIdRef = useRef<string | null>(null);

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

  const checkProfileAlerts = useCallback(async (role: string | null, email?: string) => {
    const isCreator = role === 'creator' || isCreatorEmail(email);
    const isSuperAdmin = role === 'super_admin';

    let hasAlert = false;

    // 1) 최고관리자 및 제작자: 관리자 전용 메시지(이의제기) 대기 건수
    if (isCreator || isSuperAdmin) {
      const { count: appealsCount } = await supabase
        .from('blacklist_appeals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (appealsCount && appealsCount > 0) hasAlert = true;
    }

    // 2) 제작자 전용: 미확인 건의사항 건수
    if (isCreator) {
      const { count: suggestionsCount } = await supabase
        .from('site_suggestions')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      if (suggestionsCount && suggestionsCount > 0) hasAlert = true;
    }

    setHasAdminAlert(hasAlert);
  }, []);

  const loadUserProfile = useCallback(async (userId: string, email?: string) => {
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

    const resolvedRole = (await fetchMyRole(userId, email)) as "creator" | "super_admin" | "admin" | null;
    setUserRole(resolvedRole ?? null);

    checkProfileAlerts(resolvedRole ?? null, email);
  }, [checkProfileAlerts]);

  useEffect(() => {
    const applySession = (currentUser: User | null) => {
      setUser(currentUser);
      if (currentUser) {
        // 같은 계정의 토큰 갱신(1시간마다) 때는 프로필을 다시 조회하지 않음
        if (loadedUserIdRef.current !== currentUser.id) {
          loadedUserIdRef.current = currentUser.id;
          loadUserProfile(currentUser.id, currentUser.email);
        }
      } else {
        loadedUserIdRef.current = null;
        clearRoleCaches();
        setNickname('');
        setUserRole(null);
        setIsTermsModalOpen(false);
        setHasAdminAlert(false);
        setUnreadNotificationCount(0);
      }
      setAuthLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      // [보안] 로그인 처리가 끝나면 주소창에 남은 일회용 코드/토큰을 즉시 제거 (공유 시 계정 유출 차단)
      scrubAuthParamsFromUrl();
      applySession(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') scrubAuthParamsFromUrl();
      applySession(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [loadUserProfile]);

  // ===== 내 게시글 알림 (좋아요/댓글/답글) =====
  const clearToastTimers = () => {
    toastTimersRef.current.forEach((t) => window.clearTimeout(t));
    toastTimersRef.current = [];
  };

  const showNotificationToast = useCallback((notification: UserNotification) => {
    clearToastTimers();
    setToast({ notification, animatingOut: false });
    toastTimersRef.current.push(
      window.setTimeout(() => {
        setToast((prev) => (prev ? { ...prev, animatingOut: true } : prev));
        toastTimersRef.current.push(window.setTimeout(() => setToast(null), 350));
      }, 3500)
    );
  }, []);

  useEffect(() => () => clearToastTimers(), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let disposed = false;
    let realtimeActive = false;
    let lastCount = -1;

    const refreshCount = async (announce: boolean) => {
      const count = await fetchUnreadNotificationCount(userId);
      if (disposed) return;
      if (announce && lastCount >= 0 && count > lastCount) {
        const latest = await fetchLatestUnreadNotification(userId);
        if (latest && !disposed) showNotificationToast(latest);
      }
      lastCount = count;
      setUnreadNotificationCount(count);
    };

    refreshCount(false);

    // 실시간 수신 (Supabase Realtime). 연결이 안 되면 60초 간격 확인으로 자동 대체
    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const notification = payload.new as UserNotification;
          lastCount = Math.max(0, lastCount) + 1;
          setUnreadNotificationCount((c) => c + 1);
          showNotificationToast(notification);
        }
      )
      .subscribe((status) => {
        realtimeActive = String(status) === 'SUBSCRIBED';
      });

    const interval = window.setInterval(() => {
      if (!realtimeActive && document.visibilityState === 'visible') refreshCount(true);
    }, NOTIFICATION_POLL_MS);

    // 앱/탭으로 돌아왔을 때 (모바일 백그라운드 동안 놓친 알림 반영)
    const handleVisible = () => {
      if (document.visibilityState === 'visible') refreshCount(true);
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, showNotificationToast]);

  const refreshNotificationCount = useCallback(async () => {
    if (!userId) return;
    setUnreadNotificationCount(await fetchUnreadNotificationCount(userId));
  }, [userId]);

  const handleToastClick = async () => {
    if (!toast) return;
    const target = toast.notification;
    clearToastTimers();
    setToast(null);
    if (!target.is_read) {
      await markNotificationRead(target.id);
      setUnreadNotificationCount((c) => Math.max(0, c - 1));
    }
    const path = await resolveNotificationPostPath(target.post_id);
    if (path) router.push(path);
  };

  const handleLogin = async () => {
    const redirectUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/community`
      : undefined;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    loadedUserIdRef.current = null;
    clearRoleCaches();
    setUser(null);
    setNickname('');
    setUserRole(null);
    setHasAdminAlert(false);
    setUnreadNotificationCount(0);
  };

  const effectiveRole = isCreatorEmail(user?.email) ? "creator" : userRole;

  const isCreatorOrSuperAdmin =
    isCreatorEmail(user?.email) ||
    userRole === "creator" ||
    userRole === "super_admin";

  const isAdminGroup = Boolean(userRole === "creator" || userRole === "super_admin" || userRole === "admin");

  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <script
          type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <link rel="icon" href="/icon.png?v=3" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png?v=3" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_TITLE} />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:image" content="https://www.sfaclan.com/icon.png?v=3" />
        <meta property="og:url" content="https://www.sfaclan.com/" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
      </head>
      <body className="min-h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-300 overflow-x-hidden flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md transition-colors duration-300">
          <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 h-13 sm:h-15 flex items-center justify-between gap-1.5">
            <Link href="/community" className="text-sm sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white hover:opacity-80 transition shrink-0">
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
                  theme === 'dark' ? 'bg-white border border-zinc-200' : 'bg-zinc-900 border border-zinc-800'
                }`}
              >
                <span
                  className={`inline-flex h-4.5 w-4.5 sm:h-5 sm:w-5 transform items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out ${
                    theme === 'dark' ? 'translate-x-5 sm:translate-x-6 bg-zinc-950' : 'translate-x-0 bg-white'
                  }`}
                >
                  {theme === 'dark' ? (
                    <Moon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white fill-white" />
                  ) : (
                    <Sun className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-zinc-950 stroke-[2.5]" />
                  )}
                </span>
              </button>

              {authLoading ? (
                <div className="h-7 w-14 sm:w-16 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded-lg shrink-0" />
              ) : user ? (
                <>
                  <Link
                    href="/write"
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0 shadow-sm"
                  >
                    <PenSquare className="w-3 h-3" />
                    <span>글쓰기</span>
                  </Link>

                  {/* 프로필 버튼 (내 글 새 알림 / 건의함 / 관리자 메시지 알람 시 빨간점 표시) */}
                  <button
                    onClick={() => setIsUserHubOpen(true)}
                    className="relative inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-[11px] sm:text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0"
                    title={unreadNotificationCount > 0 ? `마이 메뉴 (새 알림 ${unreadNotificationCount}개)` : '마이 메뉴'}
                  >
                    <CrownIcon role={effectiveRole} className="w-3 h-3 shrink-0" />
                    <span className="max-w-[45px] sm:max-w-[90px] truncate">{nickname || "닉네임"}</span>
                    {hasProfileBadge && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black animate-pulse" />
                    )}
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

        {/* 새 알림 토스트 (누르면 해당 게시글로 이동) */}
        {toast && (
          <button
            type="button"
            onClick={handleToastClick}
            className={`fixed top-16 sm:top-20 left-1/2 z-[100] px-4 py-2 bg-blue-600 text-white border border-blue-400 rounded-none text-xs font-bold tracking-wide shadow-2xl flex items-center gap-2 max-w-[90vw] cursor-pointer ${
              toast.animatingOut ? 'animate-notice-out' : 'animate-notice-in'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{describeNotification(toast.notification)}</span>
          </button>
        )}

        <AdminReplyPopup />

        {user && (
          <UserHubModal
            isOpen={isUserHubOpen}
            onClose={() => {
              setIsUserHubOpen(false);
              checkProfileAlerts(userRole, user?.email);
              refreshNotificationCount();
            }}
            userId={user.id}
            userEmail={user.email || ""}
            userRole={effectiveRole}
            currentNickname={nickname}
            onNicknameUpdated={(newNick) => setNickname(newNick)}
            unreadNotificationCount={unreadNotificationCount}
            onUnreadNotificationCountChange={setUnreadNotificationCount}
          />
        )}

        <AdminModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUserRole={effectiveRole}
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
