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
  MessageSquare,
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
  comments_count?: number;
  author_nickname?: string;
  author_role?: RoleType;
  board_category?: string;
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
}

const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  const imgMatch = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
  if (imgMatch) return imgMatch[1];
  const posterMatch = html.match(/<video[^>]+poster=['"]([^'"]+)['"]/i);
  if (posterMatch) return posterMatch[1];
  return null;
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

      if (email?.toLowerCase() === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
        checkUnreadReports();
      } else if (uid) {
        supabase.from("user_roles").select("role").or(`user_id.eq.${uid},email.eq.${email || ''}`).maybeSingle().then(({ data }) => {
          if (data?.role) {
            setCurrentUserRole(data.role as RoleType);
            if (data.role === 'creator' || data.role === 'super_admin') {
              checkUnreadReports();
            }
          }
        });
      }
    });

    fetchPosts();
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

      // 댓글 + 답글 수 조회 (DB 컬럼 및 실시간 count fallback)
      const postIds = postsData.map((p) => p.id);
      const commentCountMap: Record<string, number> = {};
      if (postIds.length > 0) {
        const { data: commentsCountData } = await supabase
          .from('post_comments')
          .select('post_id')
          .in('post_id', postIds);
        commentsCountData?.forEach((c: any) => {
          const pid = String(c.post_id);
          commentCountMap[pid] = (commentCountMap[pid] || 0) + 1;
        });
      }

      setPosts(
        postsData.map((post) => ({
          ...post,
          likes_count: post.likes_count ?? 0,
          comments_count: post.comments_count !== undefined ? post.comments_count : (commentCountMap[String(post.id)] || 0),
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

      <NoticeBanner currentUserRole={currentUserRole} />

      <hr className="border-zinc-200 dark:border-zinc-800 mb-4" />

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

                      {/* 댓글 및 답글 통합 수 표시 */}
                      <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{post.comments_count ?? 0}</span>
                      </span>

                      {imageCount > 1 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                          <ImageIcon className="w-3.5 h-3.5" />
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

      {/* 페이지네이션 */}
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
