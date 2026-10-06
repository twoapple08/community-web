'use client'

import { CrownIcon } from "@/components/CrownIcon";
import AdminModal from "@/components/AdminModal";
import UserHubModal from "@/components/UserHubModal";
import BlacklistModal from "@/components/BlacklistModal";
import TermsModal from "@/components/TermsModal";
import AdminReplyPopup from "@/components/AdminReplyPopup";
import UserProfileHost from "@/components/UserProfileHost";
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearRoleCaches, fetchMyRole, isCreatorEmail } from '@/lib/roles'
import { scrubAuthParamsFromUrl } from '@/lib/authUrl'
import {
  describeNotification,
  fetchLatestUnreadNotification,
  fetchUnreadNotificationCount,
  markNotificationRead,
  resolveNotificationPath,
  type UserNotification,
} from '@/lib/notifications'
import { isNotificationToastEnabled, onProfileChanged } from '@/lib/userProfile'
import { Moon, Sun, PenSquare, LogOut, LogIn, Crown, ShieldAlert, Bell } from 'lucide-react'

const NOTIFICATION_POLL_MS = 60 * 1000

// 테마 전환 중에만 모든 요소에 같은 전환 효과를 걸어 색이 한꺼번에 바뀌도록 (globals.css 의 html.theme-switching)
// View Transition 을 지원하는 브라우저는 화면 전체를 한 번에 교차 전환 (globals.css 의 html.theme-vt)
const THEME_SWITCHING_CLASS = 'theme-switching'
const THEME_VT_CLASS = 'theme-vt'
const THEME_SWITCHING_MS = 400

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

const applyThemeClass = (root: HTMLElement, nextTheme: 'dark' | 'light') => {
  if (nextTheme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

// 사이트 공통 화면 (헤더 / 알림 토스트 / 전역 모달 / 하단 안내). 루트 레이아웃(서버 컴포넌트)이 감쌉니다.
export default function AppShell({
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

  // 다른 페이지(게시글 등)로 이동하면 마이 프로필 창을 닫음
  // (마이 프로필 → 내 프로필 → 게시글 순으로 이동했을 때 창이 새 페이지 위에 남아 있던 문제)
  const pathname = usePathname();
  const [hubPathname, setHubPathname] = useState(pathname);
  if (hubPathname !== pathname) {
    setHubPathname(pathname);
    if (isUserHubOpen) setIsUserHubOpen(false);
  }
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  const loadedUserIdRef = useRef<string | null>(null);
  const themeSwitchTimerRef = useRef<number | null>(null);
  const themeTransitionIdRef = useRef(0);

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

  useEffect(() => () => {
    if (themeSwitchTimerRef.current) window.clearTimeout(themeSwitchTimerRef.current);
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    // 실제 화면 상태 기준으로 다음 테마 결정 (빠르게 연속으로 눌러도 어긋나지 않게)
    const nextTheme: 'dark' | 'light' = root.classList.contains('dark') ? 'light' : 'dark';

    setTheme(nextTheme);
    try {
      localStorage.setItem('theme', nextTheme);
    } catch {}

    if (themeSwitchTimerRef.current) {
      window.clearTimeout(themeSwitchTimerRef.current);
      themeSwitchTimerRef.current = null;
    }
    root.classList.remove(THEME_SWITCHING_CLASS);

    // 1) View Transition: 바뀌기 전/후 화면을 한 장씩 찍어 교차 전환 → 모든 요소가 같은 속도, 프레임 드랍 없음
    const doc = document as ViewTransitionDocument;
    if (typeof doc.startViewTransition === 'function') {
      const transitionId = ++themeTransitionIdRef.current;
      root.classList.add(THEME_VT_CLASS);
      try {
        const transition = doc.startViewTransition(() => applyThemeClass(root, nextTheme));
        transition.finished
          .catch(() => {})
          .finally(() => {
            // 전환 도중 또 눌렀다면 새 전환이 끝날 때 정리
            if (themeTransitionIdRef.current === transitionId) root.classList.remove(THEME_VT_CLASS);
          });
        return;
      } catch {
        root.classList.remove(THEME_VT_CLASS);
      }
    }

    // 2) 미지원 브라우저: 색 전환 효과를 먼저 걸어 둔 뒤 테마를 바꿔야 모든 요소가 같은 속도로 함께 바뀜
    root.classList.add(THEME_SWITCHING_CLASS);
    themeSwitchTimerRef.current = window.setTimeout(() => {
      root.classList.remove(THEME_SWITCHING_CLASS);
      themeSwitchTimerRef.current = null;
    }, THEME_SWITCHING_MS);
    applyThemeClass(root, nextTheme);
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
    // 개인 설정에서 알림 팝업을 끈 기기는 빨간점/개수만 갱신하고 팝업은 띄우지 않음
    if (!isNotificationToastEnabled()) return;
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
      // 팝업을 끈 경우 최신 알림 본문은 조회하지 않음 (트래픽 절약)
      if (announce && lastCount >= 0 && count > lastCount && isNotificationToastEnabled()) {
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

  // 프로필 창/개인 설정에서 닉네임을 바꾸면 헤더 닉네임도 즉시 반영
  useEffect(() => {
    if (!userId) return;
    return onProfileChanged((event) => {
      if (event.userId === userId && event.nickname !== undefined) setNickname(event.nickname);
    });
  }, [userId]);

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
    // 댓글/답글 알림은 해당 댓글 위치(#comment-번호)까지 이동
    const path = await resolveNotificationPath(target);
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

  // 관리자 그룹은 버튼(관리자/블랙)이 더 많아 좁은 폰(460px 미만)에서 헤더가 화면 밖으로 밀리던 문제
  // → 그 폭에서만 글쓰기/블랙을 아이콘만 표시하고 간격·여백·테마 스위치를 조금 줄인 압축 배치 사용
  const compact = Boolean(user) && (isAdminGroup || isCreatorOrSuperAdmin);
  const withCompact = (base: string, compactClasses: string) => (compact ? `${base} ${compactClasses}` : base);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md transition-colors duration-300">
        <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 h-13 sm:h-15 flex items-center justify-between gap-1.5">
          {/* 로고는 공간이 부족하면 먼저 줄어듦 (오른쪽 버튼이 화면 밖으로 밀리지 않도록) */}
          <Link
            href="/community"
            className="min-w-0 truncate text-sm sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white hover:opacity-80 transition"
          >
            {compact ? (
              <>
                {/* 360px 미만 압축 배치에서는 글자 대신 사이트 아이콘 */}
                <img
                  src="/icon.png?v=3"
                  alt="COMMUNITY"
                  className="hidden max-[360px]:block w-7 h-7 rounded shrink-0"
                />
                <span className="max-[360px]:hidden">COMMUNITY</span>
              </>
            ) : (
              'COMMUNITY'
            )}
          </Link>

          {/* 오른쪽 버튼 묶음은 줄어들지 않음. 시스템 글꼴이 아주 큰 기기에서는 마지막 수단으로 가로 스크롤 (py 는 빨간점이 잘리지 않게) */}
          <div className={withCompact('flex items-center gap-1 sm:gap-1.5 shrink-0 max-w-full overflow-x-auto no-scrollbar py-2', 'max-[460px]:gap-0.5')}>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              suppressHydrationWarning
              className={withCompact('relative inline-flex h-6 w-11 sm:h-7 sm:w-13 items-center rounded-full p-0.5 transition-colors duration-300 cursor-pointer shadow-inner shrink-0 border bg-zinc-900 border-zinc-800 dark:bg-white dark:border-zinc-200', 'max-[460px]:h-5.5 max-[460px]:w-10')}
            >
              {/* 스위치 모양은 dark: 클래스로만 결정 → 라이트 모드 사용자도 첫 화면부터 올바른 위치, 손잡이는 부드럽게 이동 */}
              <span
                className={withCompact('theme-toggle-knob inline-grid place-items-center h-4.5 w-4.5 sm:h-5 sm:w-5 rounded-full shadow-md transition-transform duration-300 ease-in-out bg-white translate-x-0 dark:bg-zinc-950 dark:translate-x-5 sm:dark:translate-x-6', 'max-[460px]:h-4 max-[460px]:w-4 max-[460px]:dark:translate-x-4.5')}
              >
                {/* 해/달 아이콘을 겹쳐 두고 회전·크기·투명도로 교차 전환 (아이콘이 잠깐 사라지던 문제 해결) */}
                <Sun className="[grid-area:1/1] w-2.5 h-2.5 sm:w-3 sm:h-3 text-zinc-950 stroke-[2.5] transition-[opacity,rotate,scale] duration-300 ease-in-out opacity-100 rotate-0 scale-100 dark:opacity-0 dark:-rotate-90 dark:scale-50" />
                <Moon className="[grid-area:1/1] w-2.5 h-2.5 sm:w-3 sm:h-3 text-white fill-white transition-[opacity,rotate,scale] duration-300 ease-in-out opacity-0 rotate-90 scale-50 dark:opacity-100 dark:rotate-0 dark:scale-100" />
              </span>
            </button>

            {authLoading ? (
              <div className="h-7 w-14 sm:w-16 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded-lg shrink-0" />
            ) : user ? (
              <>
                <Link
                  href="/write"
                  className={withCompact('inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0 shadow-sm', 'max-[460px]:px-1.5')}
                  aria-label="글쓰기"
                >
                  <PenSquare className={withCompact('w-3 h-3', 'max-[460px]:w-3.5 max-[460px]:h-3.5')} />
                  <span className={compact ? 'max-[460px]:hidden' : undefined}>글쓰기</span>
                </Link>

                {/* 프로필 버튼 (내 글 새 알림 / 건의함 / 관리자 메시지 알람 시 빨간점 표시) */}
                <button
                  onClick={() => setIsUserHubOpen(true)}
                  className={withCompact('relative inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-[11px] sm:text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0', 'max-[460px]:px-1')}
                  title={unreadNotificationCount > 0 ? `마이 프로필 (새 알림 ${unreadNotificationCount}개)` : '마이 프로필'}
                >
                  <CrownIcon role={effectiveRole} className="w-3 h-3 shrink-0" />
                  <span className={withCompact('max-w-[45px] sm:max-w-[90px] truncate', 'max-[460px]:max-w-[40px]')}>{nickname || "닉네임"}</span>
                  {hasProfileBadge && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black animate-pulse" />
                  )}
                </button>

                {isCreatorOrSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsAdminModalOpen(true)}
                    className={withCompact('inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-bold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition whitespace-nowrap shrink-0', 'max-[460px]:px-1')}
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
                    className={withCompact('inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-black rounded-none border bg-white text-black border-black hover:bg-zinc-100 dark:bg-black dark:text-white dark:border-white dark:hover:bg-zinc-900 transition whitespace-nowrap shrink-0 shadow-sm', 'max-[460px]:px-1')}
                    title="블랙리스트 관리"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span className={compact ? 'max-[460px]:hidden' : undefined}>블랙</span>
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className={withCompact('inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-300 text-[11px] sm:text-xs font-medium transition shrink-0', 'max-[460px]:px-1')}
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

      {/* 하단 안내 (눈에 띄지 않게 한 줄) */}
      <footer className="w-full py-6 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
        <Link href="/privacy" className="hover:underline">
          개인정보처리방침
        </Link>
        <span className="mx-1.5" aria-hidden="true">·</span>
        <span>© 스틱파이터 커뮤니티</span>
      </footer>

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

      {/* 다른 유저 프로필 창 (주소의 ?profile=유저ID 로 열림) */}
      <Suspense fallback={null}>
        <UserProfileHost />
      </Suspense>

      {user && (
        <TermsModal
          isOpen={isTermsModalOpen}
          userId={user.id}
          onAgreed={() => setIsTermsModalOpen(false)}
        />
      )}
    </>
  )
}
