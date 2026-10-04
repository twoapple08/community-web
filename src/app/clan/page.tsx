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
