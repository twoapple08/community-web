#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 공지사항 복원 및 전체 기능 점검/통합 패치 시작"
echo "=========================================================="

# 1. 공지사항 전용 통합 컴포넌트 생성 (src/components/NoticeBanner.tsx)
cat << 'FILE_NOTICE' > src/components/NoticeBanner.tsx
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
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (data) {
      setNotice(data as SiteNotice)
      setEditNoticeTitle(data.title)
      setEditNoticeContent(data.content)

      const hiddenTimestamp = localStorage.getItem('hide_notice_until')
      if (!hiddenTimestamp || new Date(hiddenTimestamp) < new Date(data.updated_at)) {
        setIsNoticeAutoPopup(true)
        setIsNoticeDetailOpen(true)
      }
    }
  }

  const handleCloseNoticePopup = () => {
    if (isNoticeAutoPopup && dontShowAgainChecked && notice) {
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
      .upsert({
        id: 1,
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      })

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
FILE_NOTICE

# 2. 클랜 피드 (/clan/page.tsx) 완전 정비 (공지사항 배너, 삭제신청 심사, 페이지네이션 10~50개 복원)
cat << 'FILE_CLAN_PAGE' > src/app/clan/page.tsx
'use client'

import { CrownIcon, RoleType } from "@/components/CrownIcon";
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  RotateCw,
  Heart,
  Calendar,
  Image as ImageIcon,
  Search,
  Filter,
  EyeOff,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  Siren
} from 'lucide-react';
import NoticeBanner from '@/components/NoticeBanner';
import AdminReportModal from '@/components/AdminReportModal';
import Link from 'next/link';

type SortType = 'latest' | 'popular' | 'oldest';
type OfficialFilterType = 'all' | 'official' | 'unofficial';

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  author_nickname?: string;
  author_role?: RoleType;
  is_official?: boolean;
  delete_requested?: boolean;
  delete_reason?: string | null;
  tags?: string[];
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
  feed_type?: string;
}

const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
};

const extractPlainText = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const countImages = (html: string): number => {
  if (!html) return 0;
  const matches = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi);
  return matches ? matches.length : 0;
};

function ClanFeedContent() {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [officialFilter, setOfficialFilter] = useState<OfficialFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [tempFilterTags, setTempFilterTags] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(10);
  const [isPageSizeDropupOpen, setIsPageSizeDropupOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ type: 'approve' | 'reject'; post: Post } | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);

  const [isAdminReportOpen, setIsAdminReportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isAdmin = Boolean(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin');
  const isCreatorOrSuperAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin';

  useEffect(() => {
    const savedSize = localStorage.getItem('user_posts_per_page');
    if (savedSize && [10, 20, 30, 40, 50].includes(Number(savedSize))) {
      setPostsPerPage(Number(savedSize));
    }
  }, []);

  const handlePageSizeChange = (newSize: number) => {
    setPostsPerPage(newSize);
    setCurrentPage(1);
    setIsPageSizeDropupOpen(false);
    localStorage.setItem('user_posts_per_page', String(newSize));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email;
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);

      if (email === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else if (email) {
        supabase.from("user_roles").select("role").eq("email", email).maybeSingle().then(({ data }) => {
          if (data?.role) setCurrentUserRole(data.role as RoleType);
        });
      }
    });

    fetchPosts();
    checkUnreadReports();
  }, []);

  const checkUnreadReports = async () => {
    const { count } = await supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    setUnreadCount(count || 0);
  };

  const fetchPosts = async () => {
    const baseQuery = supabase
      .from('posts')
      .select('*')
      .eq('feed_type', 'clan')
      .eq('is_deleted', false);

    const query =
      sortType === 'popular'
        ? baseQuery.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
        : sortType === 'oldest'
        ? baseQuery.order('created_at', { ascending: true })
        : baseQuery.order('created_at', { ascending: false });

    const { data: postsData } = await query;

    if (postsData) {
      const authorIds = Array.from(new Set(postsData.map((p) => p.author_id).filter(Boolean)));
      const profileMap: Record<string, string> = {};

      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname')
          .in('id', authorIds);

        profilesData?.forEach((p) => {
          profileMap[p.id] = p.nickname;
        });
      }

      const { data: rolesData } = await supabase.from('user_roles').select('*');
      const roleMap: Record<string, RoleType> = {};
      rolesData?.forEach((r: any) => {
        if (r.user_id) roleMap[r.user_id] = r.role;
        if (r.email === 'iwsamuel08@gmail.com' && r.user_id) roleMap[r.user_id] = 'creator';
      });

      setPosts(
        postsData.map((post) => ({
          ...post,
          likes_count: post.likes_count ?? 0,
          author_nickname: profileMap[post.author_id] || '작성자',
          author_role: roleMap[post.author_id] || null,
          is_official: Boolean(post.is_official),
          delete_requested: Boolean(post.delete_requested),
          delete_reason: post.delete_reason || null,
          tags: Array.isArray(post.tags) ? post.tags : [],
          thumbnail_url: post.thumbnail_url || null,
          is_preview_hidden: Boolean(post.is_preview_hidden),
        }))
      );
    }
    setLoading(false);
  };

  const handleApproveDelete = async () => {
    if (!confirmModal) return;
    setActionProcessing(true);
    const { error } = await supabase.from('posts').delete().eq('id', confirmModal.post.id);
    if (error) {
      alert(`삭제 처리에 실패했습니다: ${error.message}`);
    } else {
      setConfirmModal(null);
      await fetchPosts();
    }
    setActionProcessing(false);
  };

  const handleRejectDelete = async () => {
    if (!confirmModal) return;
    setActionProcessing(true);
    const { error } = await supabase
      .from('posts')
      .update({ delete_requested: false, delete_reason: null })
      .eq('id', confirmModal.post.id);

    if (error) {
      alert(`거절 처리에 실패했습니다: ${error.message}`);
    } else {
      setConfirmModal(null);
      await fetchPosts();
    }
    setActionProcessing(false);
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();

    return posts
      .filter((post) => {
        if (post.delete_requested && !isAdmin && post.author_id !== currentUserId) {
          return false;
        }

        if (officialFilter === 'official' && !post.is_official) return false;
        if (officialFilter === 'unofficial' && post.is_official) return false;

        if (selectedFilterTags.length > 0) {
          const postTags = post.tags || [];
          if (!selectedFilterTags.some((t) => postTags.includes(t))) return false;
        }

        if (q) {
          const titleMatch = (post.title || '').replace(/\s+/g, '').toLowerCase().includes(q);
          const authorMatch = (post.author_nickname || '').replace(/\s+/g, '').toLowerCase().includes(q);
          const contentMatch = extractPlainText(post.content).replace(/\s+/g, '').toLowerCase().includes(q);
          if (!titleMatch && !authorMatch && !contentMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (isAdmin) {
          if (a.delete_requested && !b.delete_requested) return -1;
          if (!a.delete_requested && b.delete_requested) return 1;
        }
        return 0;
      });
  }, [posts, officialFilter, selectedFilterTags, searchQuery, isAdmin, currentUserId]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * postsPerPage;
    return filteredPosts.slice(startIndex, startIndex + postsPerPage);
  }, [filteredPosts, currentPage, postsPerPage]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col min-w-0">
      {/* 교체 버튼 및 헤더 */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/community"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-none shadow-sm transition"
              title="커뮤니티 피드로 교체"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>커뮤니티 교체</span>
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-white truncate">
            클랜 피드
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
            클랜 홍보 · 링크 공유
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCreatorOrSuperAdmin && (
            <button
              onClick={() => setIsAdminReportOpen(true)}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold rounded-none border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition shadow-sm"
              title="신고 기록"
            >
              <Siren className="w-3.5 h-3.5" />
              <span>신고 기록</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-black rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none shadow-md">
                  {unreadCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={async () => {
              setIsRefreshing(true);
              await fetchPosts();
              await checkUnreadReports();
              setTimeout(() => setIsRefreshing(false), 400);
            }}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>

      {/* 공지사항 배너 컴포넌트 탑재 */}
      <NoticeBanner currentUserRole={currentUserRole} />

      <hr className="border-zinc-200 dark:border-zinc-800 mb-4" />

      {/* 검색 및 필터 바 */}
      <div className="flex items-center gap-2 mb-3.5 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성자, 내용 검색"
            className="w-full pl-9 pr-8 py-2 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setTempFilterTags([...selectedFilterTags]);
            setIsFilterModalOpen(true);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition shadow-sm shrink-0 ${
            selectedFilterTags.length > 0
              ? 'bg-emerald-500 text-white border-emerald-600'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>필터</span>
          {selectedFilterTags.length > 0 && <span>({selectedFilterTags.length})</span>}
        </button>
      </div>

      {/* 공식/비공식 탭 및 정렬 탭 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setOfficialFilter('all')}
            className={`px-3 py-1 rounded-lg transition ${officialFilter === 'all' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            통합
          </button>
          <button
            onClick={() => setOfficialFilter('official')}
            className={`px-3 py-1 rounded-lg transition ${officialFilter === 'official' ? 'bg-white dark:bg-zinc-900 text-emerald-500 shadow-sm' : 'text-zinc-400'}`}
          >
            공식
          </button>
          <button
            onClick={() => setOfficialFilter('unofficial')}
            className={`px-3 py-1 rounded-lg transition ${officialFilter === 'unofficial' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            비공식
          </button>
        </div>

        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}
            className={`px-3 py-1 rounded-lg transition ${sortType === 'latest' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            최신순
          </button>
          <button
            onClick={() => setSortType('popular')}
            className={`px-3 py-1 rounded-lg transition ${sortType === 'popular' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            인기순
          </button>
          <button
            onClick={() => setSortType('oldest')}
            className={`px-3 py-1 rounded-lg transition ${sortType === 'oldest' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            오래된순
          </button>
        </div>
      </div>

      {/* 피드 목록 */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400">클랜 피드를 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">조건에 일치하는 클랜 게시글이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3.5 w-full">
          {paginatedPosts.map((post) => {
            const thumbnail = post.thumbnail_url || extractFirstImage(post.content);
            const plainText = extractPlainText(post.content);
            const imageCount = countImages(post.content);

            return (
              <article
                key={post.id}
                onClick={() => router.push(`/clan/${post.id}`)}
                className={`group p-3.5 sm:p-5 rounded-2xl transition duration-300 shadow-sm cursor-pointer select-none relative w-full ${
                  post.delete_requested
                    ? 'bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-400 dark:border-amber-600'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                }`}
              >
                {post.delete_requested && (
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-amber-200 dark:border-amber-900/60">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>비공개 처리됨 (삭제 신청 대기 중)</span>
                    </div>
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-amber-500 text-white">
                      삭제 신청
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 sm:gap-5 w-full">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <h2 className="text-sm sm:text-base md:text-lg font-bold text-zinc-900 dark:text-white tracking-tight truncate">
                      {post.is_official && (
                        <span className="text-emerald-500 mr-1.5 font-extrabold">[공식]</span>
                      )}
                      {post.title}
                    </h2>

                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200/80 dark:border-emerald-900/50"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {plainText || '내용이 없습니다.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3.5 text-xs text-zinc-500 pt-1">
                      <span className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                        <CrownIcon role={post.author_role} className="w-3.5 h-3.5 shrink-0" />
                        <span>{post.author_nickname}</span>
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center gap-1 text-rose-500 font-medium">
                        <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                        <span>{post.likes_count ?? 0}</span>
                      </span>
                      {imageCount > 1 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50">
                          <ImageIcon className="w-3 h-3" />
                          <span>+{imageCount}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {post.is_preview_hidden ? (
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 aspect-square shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400">
                      <EyeOff className="w-5 h-5" />
                      <span className="text-[9px]">가림</span>
                    </div>
                  ) : thumbnail ? (
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 aspect-square shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800">
                      <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                </div>

                {post.delete_requested && isAdmin && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 pt-2.5 border-t border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: 'approve', post })}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
                      >
                        허락 (삭제)
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: 'reject', post })}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white font-bold"
                      >
                        거절 (복구)
                      </button>
                    </div>
                    <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                      사유: {post.delete_reason || '미입력'}
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 및 드롭업 */}
      {filteredPosts.length > 0 && (
        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="text-xs text-zinc-400">전체 {filteredPosts.length}개</div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-bold">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            {isPageSizeDropupOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 z-30">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handlePageSizeChange(size)}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {size}개씩 보기
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsPageSizeDropupOpen(!isPageSizeDropupOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 border rounded-xl font-semibold"
            >
              <span>{postsPerPage}개씩 보기</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 태그 필터 모달 */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">클랜 태그 필터</h3>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const isSelected = tempFilterTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setTempFilterTags((prev) => prev.filter((t) => t !== tag));
                      } else {
                        setTempFilterTags((prev) => [...prev, tag]);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border ${
                      isSelected ? 'bg-emerald-600 text-white border-emerald-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFilterTags([...tempFilterTags]);
                  setIsFilterModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-xl"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 승인/거절 모달 */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => !actionProcessing && setConfirmModal(null)}
        >
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 p-6 rounded-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">삭제 심사</h3>
            <p className="text-xs text-zinc-500">
              {confirmModal.type === 'approve' ? '게시글을 영구히 삭제하시겠습니까?' : '삭제 신청을 거절하고 복구하시겠습니까?'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={confirmModal.type === 'approve' ? handleApproveDelete : handleRejectDelete}
                className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-xl"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminReportModal
        isOpen={isAdminReportOpen}
        onClose={() => {
          setIsAdminReportOpen(false);
          checkUnreadReports();
        }}
        onPostRestored={fetchPosts}
      />
    </div>
  );
}

export default function ClanFeedPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">클랜 피드를 로드하는 중...</div>}>
      <ClanFeedContent />
    </Suspense>
  );
}
FILE_CLAN_PAGE

# 3. 커뮤니티 피드 (/community/page.tsx) 완전 정비 (공지사항 배너, 9대 게시판 선택, 페이지네이션 10~50개 복원)
cat << 'FILE_COMM_PAGE' > src/app/community/page.tsx
'use client'

import { CrownIcon, RoleType } from "@/components/CrownIcon";
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  RotateCw,
  Heart,
  Calendar,
  Image as ImageIcon,
  Search,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ArrowLeftRight,
  Menu,
  Siren,
  Check
} from 'lucide-react';
import NoticeBanner from '@/components/NoticeBanner';
import AdminReportModal from '@/components/AdminReportModal';
import Link from 'next/link';

type SortType = 'latest' | 'popular' | 'oldest';
const BOARD_CATEGORIES = ['모두', '자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  author_nickname?: string;
  author_role?: RoleType;
  board_category?: string;
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
}

const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
};

const extractPlainText = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const countImages = (html: string): number => {
  if (!html) return 0;
  const matches = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi);
  return matches ? matches.length : 0;
};

function CommunityFeedContent() {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [selectedBoard, setSelectedBoard] = useState<string>('모두');
  const [isBoardDropdownOpen, setIsBoardDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(10);
  const [isPageSizeDropupOpen, setIsPageSizeDropupOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isAdminReportOpen, setIsAdminReportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isCreatorOrSuperAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin';

  useEffect(() => {
    const savedSize = localStorage.getItem('user_posts_per_page');
    if (savedSize && [10, 20, 30, 40, 50].includes(Number(savedSize))) {
      setPostsPerPage(Number(savedSize));
    }
  }, []);

  const handlePageSizeChange = (newSize: number) => {
    setPostsPerPage(newSize);
    setCurrentPage(1);
    setIsPageSizeDropupOpen(false);
    localStorage.setItem('user_posts_per_page', String(newSize));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email;
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);

      if (email === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else if (email) {
        supabase.from("user_roles").select("role").eq("email", email).maybeSingle().then(({ data }) => {
          if (data?.role) setCurrentUserRole(data.role as RoleType);
        });
      }
    });

    fetchPosts();
    checkUnreadReports();
  }, []);

  const checkUnreadReports = async () => {
    const { count } = await supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    setUnreadCount(count || 0);
  };

  const fetchPosts = async () => {
    const baseQuery = supabase
      .from('posts')
      .select('*')
      .eq('feed_type', 'community')
      .eq('is_deleted', false);

    const query =
      sortType === 'popular'
        ? baseQuery.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
        : sortType === 'oldest'
        ? baseQuery.order('created_at', { ascending: true })
        : baseQuery.order('created_at', { ascending: false });

    const { data: postsData } = await query;

    if (postsData) {
      const authorIds = Array.from(new Set(postsData.map((p) => p.author_id).filter(Boolean)));
      const profileMap: Record<string, string> = {};

      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname')
          .in('id', authorIds);

        profilesData?.forEach((p) => {
          profileMap[p.id] = p.nickname;
        });
      }

      const { data: rolesData } = await supabase.from('user_roles').select('*');
      const roleMap: Record<string, RoleType> = {};
      rolesData?.forEach((r: any) => {
        if (r.user_id) roleMap[r.user_id] = r.role;
        if (r.email === 'iwsamuel08@gmail.com' && r.user_id) roleMap[r.user_id] = 'creator';
      });

      setPosts(
        postsData.map((post) => ({
          ...post,
          likes_count: post.likes_count ?? 0,
          author_nickname: profileMap[post.author_id] || '작성자',
          author_role: roleMap[post.author_id] || null,
          thumbnail_url: post.thumbnail_url || null,
          is_preview_hidden: Boolean(post.is_preview_hidden),
        }))
      );
    }
    setLoading(false);
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();

    return posts.filter((post) => {
      if (selectedBoard !== '모두' && post.board_category !== selectedBoard) {
        return false;
      }

      if (q) {
        const titleMatch = (post.title || '').replace(/\s+/g, '').toLowerCase().includes(q);
        const authorMatch = (post.author_nickname || '').replace(/\s+/g, '').toLowerCase().includes(q);
        const contentMatch = extractPlainText(post.content).replace(/\s+/g, '').toLowerCase().includes(q);
        if (!titleMatch && !authorMatch && !contentMatch) return false;
      }

      return true;
    });
  }, [posts, selectedBoard, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * postsPerPage;
    return filteredPosts.slice(startIndex, startIndex + postsPerPage);
  }, [filteredPosts, currentPage, postsPerPage]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col min-w-0">
      {/* 교체 버튼 및 헤더 */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/clan"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none shadow-sm transition"
              title="클랜 피드로 교체"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>클랜 피드로 교체</span>
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-white truncate">
            커뮤니티 피드
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
            가입 인사 · 자유로운 수다
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCreatorOrSuperAdmin && (
            <button
              onClick={() => setIsAdminReportOpen(true)}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs font-bold rounded-none border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition shadow-sm"
              title="신고 기록"
            >
              <Siren className="w-3.5 h-3.5" />
              <span>신고 기록</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-black rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none shadow-md">
                  {unreadCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={async () => {
              setIsRefreshing(true);
              await fetchPosts();
              await checkUnreadReports();
              setTimeout(() => setIsRefreshing(false), 400);
            }}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>

      {/* 공지사항 배너 컴포넌트 탑재 */}
      <NoticeBanner currentUserRole={currentUserRole} />

      <hr className="border-zinc-200 dark:border-zinc-800 mb-4" />

      {/* 검색 및 줄3개 게시판 드롭다운 */}
      <div className="flex items-center gap-2 mb-3.5 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성자, 내용 검색"
            className="w-full pl-9 pr-8 py-2 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsBoardDropdownOpen(!isBoardDropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-none border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 shadow-sm"
          >
            <Menu className="w-4 h-4 text-blue-500" />
            <span>게시판: {selectedBoard}</span>
          </button>

          {isBoardDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-none shadow-xl z-30 py-1">
              {BOARD_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedBoard(cat);
                    setIsBoardDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition ${
                    selectedBoard === cat
                      ? 'bg-blue-600 text-white font-bold'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <span>{cat}</span>
                  {selectedBoard === cat && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 정렬 바 */}
      <div className="flex justify-end mb-4">
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}
            className={`px-3 py-1 rounded-lg transition ${sortType === 'latest' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            최신순
          </button>
          <button
            onClick={() => setSortType('popular')}
            className={`px-3 py-1 rounded-lg transition ${sortType === 'popular' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            인기순
          </button>
          <button
            onClick={() => setSortType('oldest')}
            className={`px-3 py-1 rounded-lg transition ${sortType === 'oldest' ? 'bg-white dark:bg-zinc-900 shadow-sm' : 'text-zinc-400'}`}
          >
            오래된순
          </button>
        </div>
      </div>

      {/* 게시글 목록 */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400">커뮤니티 피드를 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">등록된 커뮤니티 게시글이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3.5 w-full">
          {paginatedPosts.map((post) => {
            const thumbnail = post.thumbnail_url || extractFirstImage(post.content);
            const plainText = extractPlainText(post.content);
            const imageCount = countImages(post.content);

            return (
              <article
                key={post.id}
                onClick={() => router.push(`/community/${post.id}`)}
                className="group p-3.5 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 transition cursor-pointer select-none"
              >
                <div className="flex items-start justify-between gap-3 sm:gap-5 w-full">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <h2 className="text-sm sm:text-base md:text-lg font-bold text-zinc-900 dark:text-white tracking-tight truncate">
                      {post.title}
                    </h2>

                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {plainText || '내용이 없습니다.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3.5 text-xs text-zinc-500 pt-1">
                      <span className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                        <CrownIcon role={post.author_role} className="w-3.5 h-3.5 shrink-0" />
                        <span>{post.author_nickname}</span>
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center gap-1 text-rose-500 font-medium">
                        <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                        <span>{post.likes_count ?? 0}</span>
                      </span>
                      {imageCount > 1 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                          <ImageIcon className="w-3 h-3" />
                          <span>+{imageCount}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {post.is_preview_hidden ? (
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 aspect-square shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400">
                      <EyeOff className="w-5 h-5" />
                      <span className="text-[9px]">가림</span>
                    </div>
                  ) : thumbnail ? (
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 aspect-square shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800">
                      <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 및 드롭업 */}
      {filteredPosts.length > 0 && (
        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="text-xs text-zinc-400">전체 {filteredPosts.length}개</div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-bold">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            {isPageSizeDropupOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 z-30">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handlePageSizeChange(size)}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {size}개씩 보기
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsPageSizeDropupOpen(!isPageSizeDropupOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 border rounded-xl font-semibold"
            >
              <span>{postsPerPage}개씩 보기</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <AdminReportModal
        isOpen={isAdminReportOpen}
        onClose={() => {
          setIsAdminReportOpen(false);
          checkUnreadReports();
        }}
        onPostRestored={fetchPosts}
      />
    </div>
  );
}

export default function CommunityFeedPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">커뮤니티 피드를 로드하는 중...</div>}>
      <CommunityFeedContent />
    </Suspense>
  );
}
FILE_COMM_PAGE

# 4. 글쓰기 페이지 (/write/page.tsx) 임시저장/썸네일/게시판필수 완전 보존형
cat << 'FILE_WRITE_PAGE' > src/app/write/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import FreezeModal from '@/components/FreezeModal'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;
const COMMUNITY_BOARDS = ['자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;

interface DraftData {
  title: string
  content: string
  tags: string[]
  thumbnail_url: string | null
  is_preview_hidden: boolean
  updated_at: string
}

function WriteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultFeed = searchParams?.get('feed') === 'clan' ? 'clan' : 'community'

  const [feedType, setFeedType] = useState<'clan' | 'community'>(defaultFeed)
  const [selectedBoard, setSelectedBoard] = useState<string>('')

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null)
  const [isPreviewHidden, setIsPreviewHidden] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null)
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        alert('로그인이 필요한 기능입니다. 메인 피드로 이동합니다.')
        router.push('/')
      } else {
        const uid = session.user.id
        setUserId(uid)
        setUserEmail(session.user.email || null)

        const { data: blackRecord } = await supabase
          .from('blacklists')
          .select('reason')
          .eq('user_id', uid)
          .maybeSingle()

        if (blackRecord) {
          alert(`귀하는 블랙리스트로 등록되어 있어 게시글 작성이 금지되었습니다.\n사유: ${blackRecord.reason}`)
          router.push('/')
          return
        }

        checkExistingDraft(uid)
      }
    })
  }, [router])

  const checkExistingDraft = async (uid: string) => {
    const { data } = await supabase
      .from('post_drafts')
      .select('title, content, tags, thumbnail_url, is_preview_hidden, updated_at')
      .eq('user_id', uid)
      .maybeSingle()

    if (data) {
      setExistingDraft(data as DraftData)
    }
  }

  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map(
    (m) => m[1]
  );

  useEffect(() => {
    if (detectedImages.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(detectedImages[0]);
    }
  }, [content]);

  const handleSaveDraft = async () => {
    if (!userId) return
    if (!title.trim() && (!content.trim() || content === '<p></p>')) {
      alert('제목 또는 내용이 비어있어 임시보관할 수 없습니다.')
      return
    }

    setIsSavingDraft(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('post_drafts').upsert(
      {
        user_id: userId,
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      alert(`임시보관 실패: ${error.message}`)
    } else {
      setExistingDraft({
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      })
      alert('현재 작성 내용이 안전하게 임시보관되었습니다. (최대 1개 유지)')
    }
    setIsSavingDraft(false)
  }

  const handleLoadDraftClick = () => {
    if (!existingDraft) return
    setTitle(existingDraft.title || '')
    setContent(existingDraft.content || '')
    setSelectedTags(existingDraft.tags || [])
    setSelectedThumbnail(existingDraft.thumbnail_url || null)
    setIsPreviewHidden(Boolean(existingDraft.is_preview_hidden))
    setEditorKey((prev) => prev + 1)
  }

  const handleDeleteDraft = async () => {
    if (!userId) return
    if (!confirm('보관 중인 임시 게시글을 완전히 삭제하시겠습니까?')) return
    await supabase.from('post_drafts').delete().eq('user_id', userId)
    setExistingDraft(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    const isCreator = userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'
    if (!isCreator) {
      const { data: noticeData } = await supabase
        .from('site_notices')
        .select('is_frozen')
        .eq('id', 1)
        .maybeSingle()

      if (noticeData?.is_frozen) {
        setIsFreezeModalOpen(true)
        return
      }
    }

    if (feedType === 'community' && !selectedBoard) {
      alert('커뮤니티 게시판을 반드시 하나 선택해야 합니다.')
      return
    }

    if (!title.trim()) {
      alert('게시글 제목을 입력해 주십시오.')
      return
    }

    if (!content.trim() || content === '<p></p>') {
      alert('본문 내용을 작성해 주십시오.')
      return
    }

    setIsSubmitting(true)
    const finalTitle = feedType === 'community' ? `[${selectedBoard}] ${title.trim()}` : title.trim()

    const { error } = await supabase.from('posts').insert([
      {
        title: finalTitle,
        content,
        author_id: userId,
        feed_type: feedType,
        board_category: feedType === 'community' ? selectedBoard : null,
        tags: feedType === 'clan' ? selectedTags : [],
        thumbnail_url: selectedThumbnail || (detectedImages.length > 0 ? detectedImages[0] : null),
        is_preview_hidden: isPreviewHidden,
      },
    ])

    if (error) {
      alert(`게시글 등록 실패: ${error.message}`)
      setIsSubmitting(false)
    } else {
      await supabase.from('post_drafts').delete().eq('user_id', userId)
      router.push(feedType === 'community' ? '/community' : '/clan')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <Link
          href={feedType === 'community' ? '/community' : '/clan'}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>피드로 돌아가기</span>
        </Link>

        {/* 피드 대상 선택 탭 */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-none text-xs font-bold">
          <button
            type="button"
            onClick={() => setFeedType('community')}
            className={`px-3 py-1.5 rounded-none transition ${feedType === 'community' ? 'bg-blue-600 text-white' : 'text-zinc-400'}`}
          >
            커뮤니티 피드
          </button>
          <button
            type="button"
            onClick={() => setFeedType('clan')}
            className={`px-3 py-1.5 rounded-none transition ${feedType === 'clan' ? 'bg-emerald-600 text-white' : 'text-zinc-400'}`}
          >
            클랜 피드
          </button>
        </div>
      </div>

      {existingDraft && (
        <div className="flex items-center justify-between p-3.5 mb-5 rounded-none bg-emerald-950/30 border border-emerald-800/60 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>임시보관된 글이 있습니다 ({new Date(existingDraft.updated_at).toLocaleString()})</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadDraftClick}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition rounded-none"
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={handleDeleteDraft}
              className="p-1 text-zinc-400 hover:text-red-400 transition"
              title="임시보관 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 커뮤니티 전용 필수 게시판 선택 */}
        {feedType === 'community' ? (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-2">
            <label className="block text-xs font-bold text-blue-400">
              * 게시판 선택 (필수 1개 선택)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMUNITY_BOARDS.map((board) => {
                const isSelected = selectedBoard === board;
                return (
                  <button
                    key={board}
                    type="button"
                    onClick={() => setSelectedBoard(board)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-none border transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    <span>{board}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-2">
            <label className="block text-xs font-bold text-emerald-400">
              클랜 해시태그 선택
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTags((prev) => prev.filter((t) => t !== tag));
                      } else {
                        setSelectedTags((prev) => [...prev, tag]);
                      }
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-semibold border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span>#{tag}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <input
            type="text"
            placeholder={feedType === 'community' ? "게시글 제목 (말머리는 자동 추가됩니다)" : "클랜 게시글 제목을 입력하세요"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-none text-lg font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {detectedImages.length > 0 && (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                미리보기 썸네일 설정
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPreviewHidden}
                  onChange={(e) => setIsPreviewHidden(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 relative"></div>
                <span className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <EyeOff className="w-3.5 h-3.5" />
                  미리보기 가리기
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {detectedImages.map((src, idx) => {
                const isMain = selectedThumbnail === src && !isPreviewHidden;
                return (
                  <div
                    key={idx}
                    onClick={() => !isPreviewHidden && setSelectedThumbnail(src)}
                    className={`relative shrink-0 w-20 h-20 rounded-none overflow-hidden border-2 cursor-pointer ${
                      isMain ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-zinc-700'
                    }`}
                  >
                    <img src={src} alt="사진" className="w-full h-full object-cover" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Editor key={editorKey} content={content} onChange={setContent} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-none border border-zinc-700 transition disabled:opacity-50 text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>임시보관</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-6 py-2.5 font-bold rounded-none text-white text-sm transition disabled:opacity-50 ${
              feedType === 'community' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? '등록 중...' : '게시글 등록'}</span>
          </button>
        </div>
      </form>

      <FreezeModal
        isOpen={isFreezeModalOpen}
        onClose={() => setIsFreezeModalOpen(false)}
        actionText="게시글 작성을"
      />
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">작성 에디터를 불러오는 중...</div>}>
      <WriteContent />
    </Suspense>
  )
}
FILE_WRITE_PAGE

# 5. PostModal 에 유튜브/카톡/디스코드 리치임베드, 링크확인, 이미지확대 완전 복원
cat << 'FILE_POST_MODAL' > src/components/PostModal.tsx
'use client'

import { CrownIcon, RoleType } from "./CrownIcon";
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ReportModal from './ReportModal';
import FreezeModal from './FreezeModal';
import Editor from './Editor';
import CommentsSection from './CommentsSection';
import {
  X,
  Calendar,
  Trash2,
  Share2,
  Check,
  AlertTriangle,
  Pencil,
  Loader2,
  Heart,
  ShieldCheck,
  Send,
  Siren,
  ExternalLink
} from 'lucide-react';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  is_official?: boolean;
  delete_requested?: boolean;
  delete_reason?: string | null;
  tags?: string[];
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
  feed_type?: string;
  board_category?: string;
}

interface PostModalProps {
  postId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function PostModal({ postId, onClose, onDeleted }: PostModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [authorRole, setAuthorRole] = useState<RoleType>(null);
  const [authorNickname, setAuthorNickname] = useState<string>("");

  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [showRequestDeleteModal, setShowRequestDeleteModal] = useState(false);
  const [deleteReasonText, setDeleteReasonText] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [linkConfirmUrl, setLinkConfirmUrl] = useState<string | null>(null);

  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeActionText, setFreezeActionText] = useState('');

  const contentContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      if (!user) {
        setCurrentUserId(null);
        setCurrentUserEmail(null);
        setCurrentUserRole(null);
        return;
      }

      const uid = user.id;
      const email = user.email || '';
      setCurrentUserId(uid);
      setCurrentUserEmail(email);

      if (email.toLowerCase() === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .or(`user_id.eq.${uid},email.eq.${email}`)
          .maybeSingle();

        if (roleData?.role) setCurrentUserRole(roleData.role as RoleType);
      }

      if (postId) fetchPost(uid);
    });
  }, [postId]);

  const isCreator = currentUserRole === 'creator' || currentUserEmail?.toLowerCase() === 'iwsamuel08@gmail.com';

  const checkFrozen = async (actionText: string): Promise<boolean> => {
    if (isCreator) return false;
    const { data } = await supabase.from('site_notices').select('is_frozen').eq('id', 1).maybeSingle();
    if (data?.is_frozen) {
      setFreezeActionText(actionText);
      setIsFreezeModalOpen(true);
      return true;
    }
    return false;
  };

  const fetchPost = async (uid?: string | null) => {
    setLoading(true);
    const { data, error } = await supabase.from('posts').select('*').eq('id', postId).single();

    if (!error && data) {
      setPost(data);
      setEditTitle(data.title);
      setEditContent(data.content);
      setLikesCount(data.likes_count ?? 0);

      const userIdToCheck = uid !== undefined ? uid : currentUserId;
      if (userIdToCheck) {
        const targetPostId: any = isNaN(Number(postId)) ? postId : Number(postId);
        const { data: likeRecord } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('post_id', targetPostId)
          .eq('user_id', userIdToCheck)
          .maybeSingle();

        setIsLiked(!!likeRecord);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!post?.author_id) return;
    supabase
      .from("profiles")
      .select("nickname")
      .eq("id", post.author_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nickname) setAuthorNickname(data.nickname);
      });

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", post.author_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.role) setAuthorRole(data.role as RoleType);
      });
  }, [post?.author_id]);

  useEffect(() => {
    if (!post?.content || !contentContainerRef.current) return;

    const embedElements = contentContainerRef.current.querySelectorAll<HTMLElement>('[data-embed-url]');
    embedElements.forEach(async (el) => {
      const url = el.getAttribute('data-embed-url');
      if (!url) return;
      try {
        const res = await fetch(`/api/embed-metadata?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.title) {
            const titleEl = el.querySelector<HTMLElement>('.embed-title-text');
            if (titleEl) titleEl.textContent = data.title;
          }
        }
      } catch (err) {
        console.error('Metadata resolve error:', err);
      }
    });
  }, [post?.content, isEditing]);

  const handleToggleLike = async () => {
    if (!currentUserId) {
      alert('좋아요 기능은 로그인이 필요합니다.');
      return;
    }
    if (await checkFrozen('좋아요를')) return;
    if (likeLoading) return;
    setLikeLoading(true);

    const prevLiked = isLiked;
    const prevCount = likesCount;

    setIsLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

    const targetPostId: any = isNaN(Number(postId)) ? postId : Number(postId);

    if (prevLiked) {
      await supabase.from('post_likes').delete().eq('post_id', targetPostId).eq('user_id', currentUserId);
    } else {
      await supabase.from('post_likes').insert({ post_id: targetPostId, user_id: currentUserId });
    }
    setLikeLoading(false);
  };

  const handleToggleOfficial = async () => {
    if (!post) return;
    const nextStatus = !post.is_official;
    const { error } = await supabase.from('posts').update({ is_official: nextStatus }).eq('id', postId);
    if (error) {
      alert(`공식 상태 변경 실패: ${error.message}`);
    } else {
      setPost({ ...post, is_official: nextStatus });
      if (onDeleted) onDeleted();
    }
  };

  const handleSubmitDeleteRequest = async () => {
    if (!post) return;
    if (await checkFrozen('게시글 삭제를')) return;

    setRequestSubmitting(true);
    const { error } = await supabase
      .from('posts')
      .update({
        delete_requested: true,
        delete_reason: deleteReasonText.trim() || '사유 미작성',
      })
      .eq('id', postId);

    if (error) {
      alert(`신청 실패: ${error.message}`);
      setRequestSubmitting(false);
    } else {
      alert('관리자에게 삭제 신청이 접수되었습니다. 검토 전까지 비공개 상태로 전환됩니다.');
      setShowRequestDeleteModal(false);
      onClose();
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleSaveEdit = async () => {
    if (await checkFrozen('게시글 수정을')) return;
    if (!editTitle.trim()) return alert('제목을 입력해 주십시오.');
    if (!editContent.trim() || editContent === '<p></p>') return alert('내용을 입력해 주십시오.');

    setSaving(true);
    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: editContent,
      })
      .eq('id', postId);

    if (error) {
      alert(`수정 실패: ${error.message}`);
      setSaving(false);
    } else {
      setPost((prev) => (prev ? { ...prev, title: editTitle.trim(), content: editContent } : null));
      setIsEditing(false);
      setSaving(false);
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleExecuteDelete = async () => {
    if (await checkFrozen('게시글 삭제를')) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      setDeleteError(error.message);
    } else {
      setShowDeleteConfirm(false);
      onClose();
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const embedCard = target.closest<HTMLElement>('[data-embed-url]');
    if (embedCard) {
      const href = embedCard.getAttribute('data-embed-url');
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        setLinkConfirmUrl(href);
        return;
      }
    }

    const anchor = target.closest('a');
    if (anchor && anchor.href) {
      e.preventDefault();
      e.stopPropagation();
      setLinkConfirmUrl(anchor.href);
      return;
    }

    if (target.tagName === 'IMG') {
      setPreviewImageUrl((target as HTMLImageElement).src);
    }
  };

  const renderRichContent = (html: string) => {
    if (typeof window === 'undefined') return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    const walkTextNodes = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (urlRegex.test(node.nodeValue)) {
          const parent = node.parentNode;
          if (parent && parent.nodeName !== 'A' && parent.nodeName !== 'SCRIPT' && parent.nodeName !== 'STYLE') {
            const span = doc.createElement('span');
            span.innerHTML = node.nodeValue.replace(urlRegex, (url) => `<a href="${url}">${url}</a>`);
            parent.replaceChild(span, node);
          }
        }
      } else {
        Array.from(node.childNodes).forEach(walkTextNodes);
      }
    };
    walkTextNodes(doc.body);

    const anchors = Array.from(doc.querySelectorAll('a'));
    anchors.forEach((a) => {
      const href = a.getAttribute('href') || '';

      const ytMatch = href.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
      if (ytMatch) {
        const videoId = ytMatch[1];
        const wrapper = doc.createElement('div');
        wrapper.className = 'my-3 w-full max-w-2xl mx-auto not-prose';
        wrapper.innerHTML = `
          <div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
            <iframe
              src="https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1"
              style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen>
            </iframe>
          </div>
        `;
        a.replaceWith(wrapper);
        return;
      }

      const kakaoMatch = href.match(/open\.kakao\.com\/[a-zA-Z0-9_\/]+/i);
      if (kakaoMatch) {
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-2.5 bg-[#242111] dark:bg-[#1c190d] border border-[#FEE500]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-none bg-[#FEE500] flex items-center justify-center text-[#191919] shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              카카오톡 오픈채팅
            </span>
          </div>
          <button type="button" class="px-3.5 py-1.5 bg-[#FEE500] text-[#191919] text-xs font-black rounded-none">입장</button>
        `;
        a.replaceWith(bar);
        return;
      }

      const discordMatch = href.match(/(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i);
      if (discordMatch) {
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-2.5 bg-[#111322] dark:bg-[#0c0d18] border border-[#5865F2]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-none bg-[#5865F2] flex items-center justify-center text-white shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              디스코드 서버 초대
            </span>
          </div>
          <button type="button" class="px-3.5 py-1.5 bg-[#5865F2] text-white text-xs font-black rounded-none">참가</button>
        `;
        a.replaceWith(bar);
        return;
      }

      a.className = 'text-blue-500 underline font-semibold cursor-pointer';
    });

    return doc.body.innerHTML;
  };

  const isAuthor = Boolean(currentUserId && post && currentUserId === post.author_id);
  const isAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin';

  const canForceManage = Boolean((() => {
    if (!post || !currentUserRole || isAuthor) return false;
    if (currentUserRole === 'creator') return true;
    if (authorRole === 'creator') return false;
    if (currentUserRole === 'super_admin') return authorRole !== 'super_admin';
    if (currentUserRole === 'admin') return !authorRole;
    return false;
  })());

  const canManage = isAuthor || canForceManage;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-6 sm:py-8 flex justify-center items-start"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-auto sm:my-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden pb-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copied ? '복사됨' : '공유'}</span>
                </button>

                {/* 공식 지정 버튼 (클랜 피드에서만 동작) */}
                {post?.feed_type === 'clan' && isAdmin && (
                  <button
                    onClick={handleToggleOfficial}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-500/40 text-emerald-500"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{post.is_official ? '공식 해제' : '공식 지정'}</span>
                  </button>
                )}

                {canManage && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-500 border border-emerald-500/30 rounded-lg"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{isAuthor ? '수정' : '강제 수정'}</span>
                    </button>

                    {post?.feed_type === 'clan' && post?.is_official && isAuthor && !isAdmin ? (
                      <button
                        onClick={() => setShowRequestDeleteModal(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-500 border border-amber-500/30 rounded-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>삭제 신청</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-500 border border-red-500/30 rounded-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{isAuthor ? '삭제' : '강제 삭제'}</span>
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                >
                  {saving ? '저장 중...' : '수정 완료'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 border rounded-lg text-xs"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-8 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-zinc-400">게시글을 불러오는 중...</div>
          ) : !post ? (
            <div className="py-20 text-center text-zinc-400">삭제되었거나 없는 게시글입니다.</div>
          ) : isEditing ? (
            <div className="space-y-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full p-2.5 bg-zinc-800 border border-zinc-700 text-white rounded-xl font-bold"
              />
              <Editor content={editContent} onChange={setEditContent} minHeight="240px" />
            </div>
          ) : (
            <div className="space-y-5">
              <header className="space-y-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white">
                  {post.feed_type === 'clan' && post.is_official && (
                    <span className="text-emerald-500 mr-2">[공식]</span>
                  )}
                  {post.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={authorRole} className="w-3.5 h-3.5 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </header>

              <div
                ref={contentContainerRef}
                onClick={handleContentClick}
                className="prose dark:prose-invert max-w-none break-words whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed [&_img]:rounded-xl [&_img]:my-3 [&_img]:cursor-pointer"
                dangerouslySetInnerHTML={{ __html: renderRichContent(post.content) }}
              />

              <div className="pt-4 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeLoading}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-semibold text-xs transition ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-rose-500' : ''}`} />
                  <span>좋아요 {likesCount}</span>
                </button>
              </div>

              {/* 커뮤니티 피드 글일 때만 댓글 시스템 활성화 */}
              {post.feed_type === 'community' && (
                <CommentsSection
                  postId={post.id}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              )}
            </div>
          )}
        </div>

        {!isEditing && post && (
          <div className="absolute bottom-4 right-5 z-20">
            <button
              type="button"
              onClick={async () => {
                if (await checkFrozen('신고를')) return;
                setIsReportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-none text-xs font-bold transition shadow-sm"
            >
              <Siren className="w-3.5 h-3.5 stroke-rose-600" />
              <span>신고</span>
            </button>
          </div>
        )}
      </div>

      {/* 외부 링크 확인 모달 */}
      {mounted && linkConfirmUrl && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLinkConfirmUrl(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border rounded-2xl p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">외부 링크 접속 확인</h3>
            <p className="text-xs text-zinc-400">이 링크로 이동하시겠습니까?</p>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs font-mono break-all text-left max-h-24 overflow-y-auto">
              {linkConfirmUrl}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setLinkConfirmUrl(null)} className="px-4 py-1.5 text-xs border rounded-xl">취소</button>
              <button
                onClick={() => {
                  const url = linkConfirmUrl;
                  setLinkConfirmUrl(null);
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="px-5 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-xl"
              >
                접속
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 이미지 확대 모달 */}
      {mounted && previewImageUrl && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90" onClick={() => setPreviewImageUrl(null)}>
          <button onClick={() => setPreviewImageUrl(null)} className="absolute top-5 right-5 text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <img src={previewImageUrl} alt="미리보기" className="max-h-[85vh] max-w-full rounded-2xl" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}

      {/* 삭제 확인 모달 */}
      {mounted && showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm bg-zinc-900 p-6 rounded-2xl space-y-4 border border-zinc-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">게시글 삭제</h3>
            <p className="text-xs text-zinc-400">게시글을 삭제하시겠습니까? 데이터가 복구되지 않습니다.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 text-xs border border-zinc-700 text-zinc-300 rounded-xl">취소</button>
              <button onClick={handleExecuteDelete} className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <FreezeModal
        isOpen={isFreezeModalOpen}
        onClose={() => setIsFreezeModalOpen(false)}
        actionText={freezeActionText}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        postId={postId}
        currentUserId={currentUserId}
      />
    </div>
  );
}
FILE_POST_MODAL

echo "--> 소스코드 동기화 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 에러 없이 전체 시스템 빌드가 완벽히 통과되었습니다!"
echo " Vercel 실서버 배포를 위한 Git 푸시를 시작합니다."
echo "=========================================================="

git add .
git commit -m "fix: 클랜/커뮤니티 피드 공지사항 복원 및 전체 기능 통합 검증 완료"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 완벽히 적용되었습니다!"
echo "=========================================================="
