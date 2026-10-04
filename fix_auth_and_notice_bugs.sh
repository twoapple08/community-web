#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 공지사항 영구 캐시, 로그인 세션 유지, 잔버그 패치 시작"
echo "=========================================================="

# 1. Supabase 클라이언트 세션 스토리지 영구 고정 (src/lib/supabase.ts)
cat << 'FILE_SUPABASE' > src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co")!
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder")!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sfaclan_auth_session',
  },
})
FILE_SUPABASE

# 2. 공지사항 서명 기반 캐싱 및 영구 닫기 보장 (src/components/NoticeBanner.tsx)
cat << 'FILE_NOTICE_BANNER' > src/components/NoticeBanner.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Megaphone, Pencil, X } from 'lucide-react'
import { RoleType } from './CrownIcon'

interface SiteNotice {
  id: number
  title: string
  content: string
  updated_at: string
}

interface NoticeBannerProps {
  currentUserRole: RoleType
}

export default function NoticeBanner({ currentUserRole }: NoticeBannerProps) {
  const [notice, setNotice] = useState<SiteNotice | null>(null)
  const [isNoticeDetailOpen, setIsNoticeDetailOpen] = useState(false)
  const [isNoticeAutoPopup, setIsNoticeAutoPopup] = useState(false)
  const [isNoticeEditOpen, setIsNoticeEditOpen] = useState(false)
  const [editNoticeTitle, setEditNoticeTitle] = useState('')
  const [editNoticeContent, setEditNoticeContent] = useState('')
  const [savingNotice, setSavingNotice] = useState(false)
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false)

  const [toastState, setToastState] = useState<{
    visible: boolean
    animatingOut: boolean
    text: string
  }>({
    visible: false,
    animatingOut: false,
    text: '',
  })

  const isAdmin = Boolean(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin')

  useEffect(() => {
    fetchNotice()
  }, [])

  const fetchNotice = async () => {
    const { data } = await supabase
      .from('site_notices')
      .select('id, title, content, updated_at')
      .eq('id', 1)
      .maybeSingle()

    if (data) {
      setNotice(data as SiteNotice)
      setEditNoticeTitle(data.title)
      setEditNoticeContent(data.content)

      // [핵심] 실제 공지 내용(제목+내용) 서명 기반 비교 (동결 토글이나 타임스탬프 오류로 인한 재노출 차단)
      const currentSignature = `${data.title}:::${data.content}`
      const savedSignature = localStorage.getItem('hide_notice_signature')

      if (savedSignature !== currentSignature) {
        setIsNoticeAutoPopup(true)
        setIsNoticeDetailOpen(true)
      }
    }
  }

  const handleCloseNoticePopup = () => {
    if (dontShowAgainChecked && notice) {
      const currentSignature = `${notice.title}:::${notice.content}`
      localStorage.setItem('hide_notice_signature', currentSignature)
      localStorage.setItem('hide_notice_until', notice.updated_at)
    }
    setIsNoticeDetailOpen(false)
  }

  const showTopToast = (msg: string) => {
    setToastState({ visible: true, animatingOut: false, text: msg })
    setTimeout(() => {
      setToastState((prev) => ({ ...prev, animatingOut: true }))
      setTimeout(() => {
        setToastState({ visible: false, animatingOut: false, text: '' })
      }, 350)
    }, 2500)
  }

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editNoticeTitle.trim() || !editNoticeContent.trim()) {
      alert('제목과 내용을 모두 입력해 주십시오.')
      return
    }

    setSavingNotice(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('site_notices')
      .update({
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      })
      .eq('id', 1)

    if (error) {
      alert(`공지사항 수정 실패: ${error.message}`)
    } else {
      setNotice({
        id: 1,
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      })
      setIsNoticeEditOpen(false)
      showTopToast('공지사항이 성공적으로 갱신되었습니다.')
    }
    setSavingNotice(false)
  }

  if (!notice) return null

  return (
    <>
      {toastState.visible && (
        <div
          className={`fixed top-16 sm:top-20 left-1/2 z-[100] px-4 py-2 bg-blue-600 text-white border border-blue-400 rounded-none text-xs font-bold tracking-wide pointer-events-none shadow-2xl flex items-center gap-2 max-w-[90vw] truncate ${
            toastState.animatingOut ? 'animate-notice-out' : 'animate-notice-in'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{toastState.text}</span>
        </div>
      )}

      {/* 배너 UI */}
      <div
        onClick={() => {
          setIsNoticeAutoPopup(false)
          setIsNoticeDetailOpen(true)
        }}
        className="w-full rounded-none bg-blue-50/40 dark:bg-blue-950/20 border border-blue-500/40 hover:bg-blue-100/40 dark:hover:bg-blue-950/40 px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition group select-none mb-3 min-w-0"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/40 border border-blue-500/30 rounded-none">
            <Megaphone className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400 shrink-0">
            [공지사항]
          </span>
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:underline">
            {notice.title}
          </span>
          <span className="text-xs font-semibold text-zinc-500 dark:text-white shrink-0 hidden md:inline">
            ({new Date(notice.updated_at).toLocaleDateString()})
          </span>
        </div>

        <div className="flex items-center shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsNoticeEditOpen(true)
              }}
              className="inline-flex items-center justify-center gap-1 h-7 px-2 sm:px-2.5 text-xs font-bold rounded-none bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm shrink-0 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>공지 수정</span>
            </button>
          )}
        </div>
      </div>

      {/* 공지 상세 모달 */}
      {isNoticeDetailOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
          onClick={handleCloseNoticePopup}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-blue-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 text-white rounded-none">
                  <Megaphone className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  공지사항
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseNoticePopup}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-blue-700 dark:text-blue-400 break-words">
                {notice.title}
              </h4>
              <p className="text-[11px] text-zinc-400">
                최종 갱신일: {new Date(notice.updated_at).toLocaleString()}
              </p>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto rounded-none break-words">
                {notice.content}
              </div>
            </div>

            <div className={`flex items-center ${isNoticeAutoPopup ? 'justify-between' : 'justify-end'} pt-2 border-t border-zinc-100 dark:border-zinc-800`}>
              {isNoticeAutoPopup && (
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dontShowAgainChecked}
                    onChange={(e) => setDontShowAgainChecked(e.target.checked)}
                    className="rounded-none border-zinc-400 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span>다음 공지 갱신 시까지 보지 않기</span>
                </label>
              )}

              <button
                type="button"
                onClick={handleCloseNoticePopup}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-none transition shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공지 수정 모달 */}
      {isNoticeEditOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md"
          onClick={() => !savingNotice && setIsNoticeEditOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-blue-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/60 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">공지사항 수정</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNoticeEditOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNotice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                  공지 제목
                </label>
                <input
                  type="text"
                  value={editNoticeTitle}
                  onChange={(e) => setEditNoticeTitle(e.target.value)}
                  placeholder="공지사항 제목을 입력하세요"
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                  공지 내용
                </label>
                <textarea
                  value={editNoticeContent}
                  onChange={(e) => setEditNoticeContent(e.target.value)}
                  placeholder="상세 공지 내용을 입력하세요"
                  rows={6}
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNoticeEditOpen(false)}
                  disabled={savingNotice}
                  className="px-4 py-2 text-xs font-semibold rounded-none border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingNotice}
                  className="px-5 py-2 text-xs font-bold rounded-none bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                >
                  {savingNotice ? '갱신 중...' : '공지 갱신 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
FILE_NOTICE_BANNER

# 3. 사이트 얼리기 토글 시 updated_at 변경 및 공지사항 덮어쓰기 방지 (src/components/UserHubModal.tsx)
cat << 'FILE_PATCH_HUB' > patch_hub_freeze.py
with open("src/components/UserHubModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# is_frozen 토글 시 updated_at 갱신하지 않고 오직 is_frozen 컬럼만 업데이트
target_freeze = """  const handleToggleFreeze = async () => {
    setIsTogglingFreeze(true)
    const nextStatus = !isFrozen
    const { error } = await supabase
      .from('site_notices')
      .upsert({ id: 1, is_frozen: nextStatus, updated_at: new Date().toISOString() })"""

clean_freeze = """  const handleToggleFreeze = async () => {
    setIsTogglingFreeze(true)
    const nextStatus = !isFrozen
    const { error } = await supabase
      .from('site_notices')
      .update({ is_frozen: nextStatus })
      .eq('id', 1)"""

if target_freeze in code:
    code = code.replace(target_freeze, clean_freeze)
    with open("src/components/UserHubModal.tsx", "w", encoding="utf-8") as f:
        f.write(code)
    print("UserHubModal.tsx freeze logic updated (no updated_at touch)")
FILE_PATCH_HUB
python3 patch_hub_freeze.py || true
rm -f patch_hub_freeze.py

# 4. 약관 동의 upsert 보정 (src/components/TermsModal.tsx)
cat << 'FILE_TERMS' > src/components/TermsModal.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Check } from 'lucide-react'

interface TermsModalProps {
  isOpen: boolean
  userId: string
  onAgreed: () => void
}

export default function TermsModal({ isOpen, userId, onAgreed }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (!agreed) return
    setLoading(true)

    // 신규 유저 레코드 부재 시에도 확실히 저장되도록 upsert 적용
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, terms_agreed: true }, { onConflict: 'id' })

    if (!error) {
      onAgreed()
    } else {
      alert(`약관 동의 처리 실패: ${error.message}`)
    }
    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-lg bg-zinc-950 border-2 border-white text-white rounded-none p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
          <div className="p-1.5 bg-white text-black">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black tracking-wide">커뮤니티 서비스 이용약관</h2>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-3 max-h-72 overflow-y-auto leading-relaxed select-none">
          <p className="font-bold text-white">제1조 (목적 및 커뮤니티 건전성 유지)</p>
          <p>
            본 약관은 사용자가 안전하고 쾌적한 환경에서 게시글을 작성하고 소통할 수 있도록 규정합니다.
          </p>

          <p className="font-bold text-white">제2조 (금지 행위 및 게시물 규제)</p>
          <p>다음 각 호에 해당하는 행위는 엄격히 금지됩니다:</p>
          <ul className="list-disc list-inside space-y-1 pl-1 text-zinc-400">
            <li><strong className="text-zinc-200">부적절한 이미지</strong>: 선정성 노출 이미지, 잔혹하거나 폭력적인 이미지</li>
            <li><strong className="text-zinc-200">부적절한 내용</strong>: 타인에 대한 욕설, 비하 및 혐오 발언</li>
            <li>동일 또는 유사한 내용의 반복적 도배 게시 행위</li>
          </ul>

          <p className="font-bold text-white">제3조 (신고 및 게시물 자동 삭제 조치)</p>
          <p>
            1. 게시글은 사용자 신고를 통해 접수되며, 동일한 사유로 <strong>3회 누적 신고</strong> 시 해당 게시글은 별도 경고 없이 시스템에 의해 <strong>즉시 자동 영구 삭제</strong>됩니다.
          </p>

          <p className="font-bold text-white">제4조 (영구 블랙리스트 제재)</p>
          <p>
            1. 동일 유저의 게시글이 누적 신고로 인해 <strong>3회 이상 삭제</strong>된 경우, 해당 계정은 <strong>영구 블랙리스트</strong>로 자동 전환됩니다.
            <br />
            2. 블랙리스트로 등록된 사용자는 게시글 작성 기능이 영구히 차단됩니다.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <label className="flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 rounded-none border border-white bg-black accent-white cursor-pointer"
            />
            <span>위 이용약관을 모두 확인하였으며 이에 동의합니다.</span>
          </label>

          <button
            type="button"
            disabled={!agreed || loading}
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-black bg-white text-black hover:bg-zinc-200 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{loading ? '처리 중...' : '확인'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
FILE_TERMS

# 5. 루트(/) 리다이렉트 시 OAuth 인증 해시 및 쿼리 파라미터 보존 (src/app/page.tsx)
cat << 'FILE_ROOT_PAGE' > src/app/page.tsx
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
FILE_ROOT_PAGE

# 6. 세션 검증 전 로그인 버튼 깜빡임 제거 및 OAuth 직접 라우팅 (src/app/layout.tsx)
cat << 'FILE_LAYOUT' > src/app/layout.tsx
'use client'

import { CrownIcon } from "@/components/CrownIcon";
import AdminModal from "@/components/AdminModal";
import UserHubModal from "@/components/UserHubModal";
import BlacklistModal from "@/components/BlacklistModal";
import TermsModal from "@/components/TermsModal";
import AdminReplyPopup from "@/components/AdminReplyPopup";
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
  const [authLoading, setAuthLoading] = useState(true)
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
    // 1) 초기 세션 조회
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email);
      }
      setAuthLoading(false);
    });

    // 2) 인증 상태 변경 감지
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
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    // [핵심] 로그인 완료 후 /community 로 직접 리다이렉트 (루트 경유 토큰 유실 차단)
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
        <title>스틱파이터 클랜 커뮤니티</title>
        <meta name="description" content="자신만의 클랜을 홍보하세요" />
        <link rel="icon" href="/icon.png?v=3" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png?v=3" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="스틱파이터 클랜 커뮤니티" />
        <meta property="og:title" content="스틱파이터 클랜 커뮤니티" />
        <meta property="og:description" content="자신만의 클랜을 홍보하세요" />
        <meta property="og:image" content="https://www.sfaclan.com/icon.png?v=3" />
        <meta property="og:url" content="https://www.sfaclan.com/" />
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

              {/* [핵심] 세션 로딩 중에는 로그인 버튼 깜빡임 방지 (스켈레톤 렌더링) */}
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

        <AdminReplyPopup />

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
FILE_LAYOUT

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 에러 없음! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: 공지사항 고유 서명 캐시 영구화, 로그인 세션 유지 강화, 잔버그 패치"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
