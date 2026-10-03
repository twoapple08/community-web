'use client'

import { CrownIcon, RoleType } from "@/components/CrownIcon";
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  MessagesSquare,
  Calendar,
  Image as ImageIcon,
  RotateCw,
  Heart,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  EyeOff,
  X,
  Check
} from 'lucide-react';
import PostModal from '@/components/PostModal';

type SortType = 'latest' | 'popular' | 'oldest';
type OfficialFilterType = 'all' | 'official' | 'unofficial';

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;

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
}

const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
};

const extractPlainText = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const countImages = (html: string): number => {
  if (!html) return 0;
  const matches = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi);
  return matches ? matches.length : 0;
};

const normalizeText = (text: string): string => {
  return (text || '').replace(/\s+/g, '').toLowerCase();
};

function FeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activePostId = searchParams.get('post');

  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [officialFilter, setOfficialFilter] = useState<OfficialFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [tempFilterTags, setTempFilterTags] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    type: 'approve' | 'reject';
    post: Post;
  } | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);

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
  }, []);

  const isAdmin = Boolean(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin');

  const fetchPosts = async () => {
    const baseQuery = supabase.from('posts').select('*');

    const query =
      sortType === 'popular'
        ? baseQuery.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
        : sortType === 'oldest'
        ? baseQuery.order('created_at', { ascending: true })
        : baseQuery.order('created_at', { ascending: false });

    const { data: postsData, error: postsError } = await query;

    if (!postsError && postsData) {
      const authorIds = Array.from(new Set(postsData.map((p) => p.author_id).filter(Boolean)));
      const profileMap: Record<string, string> = {};

      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nickname')
          .in('id', authorIds);

        if (profilesData) {
          profilesData.forEach((profile) => {
            profileMap[profile.id] = profile.nickname;
          });
        }
      }

      // 관리자 역할 매핑 (user_id 및 fallback 결합)
      const { data: rolesData } = await supabase.from('user_roles').select('*');
      const roleMapByUserId: Record<string, RoleType> = {};
      rolesData?.forEach((r: any) => {
        if (r.user_id) roleMapByUserId[r.user_id] = r.role;
        if (r.email === 'iwsamuel08@gmail.com' && r.user_id) roleMapByUserId[r.user_id] = 'creator';
      });

      const formattedPosts: Post[] = postsData.map((post) => {
        // author_id로 역할 식별 (미식별 시 제작자 fallback)
        let determinedRole = roleMapByUserId[post.author_id] || null;

        return {
          ...post,
          likes_count: post.likes_count ?? 0,
          author_nickname: profileMap[post.author_id] || '작성자',
          author_role: determinedRole,
          is_official: Boolean(post.is_official),
          delete_requested: Boolean(post.delete_requested),
          delete_reason: post.delete_reason || null,
          tags: Array.isArray(post.tags) ? post.tags : [],
          thumbnail_url: post.thumbnail_url || null,
          is_preview_hidden: Boolean(post.is_preview_hidden),
        };
      });

      setPosts(formattedPosts);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, [sortType]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchPosts();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  const handleOpenPost = (id: string) => {
    router.push(`/?post=${id}`, { scroll: false });
  };

  const handleClosePost = () => {
    router.push('/', { scroll: false });
    fetchPosts();
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
      .update({
        delete_requested: false,
        delete_reason: null,
      })
      .eq('id', confirmModal.post.id);

    if (error) {
      alert(`거절 처리에 실패했습니다: ${error.message}`);
    } else {
      setConfirmModal(null);
      await fetchPosts();
    }
    setActionProcessing(false);
  };

  const handleOpenFilterModal = () => {
    setTempFilterTags([...selectedFilterTags]);
    setIsFilterModalOpen(true);
  };

  const handleApplyFilterModal = () => {
    setSelectedFilterTags([...tempFilterTags]);
    setIsFilterModalOpen(false);
  };

  const handleResetFilterModal = () => {
    setTempFilterTags([]);
    setSelectedFilterTags([]);
    setIsFilterModalOpen(false);
  };

  const filteredPosts = useMemo(() => {
    const normQuery = normalizeText(searchQuery);

    return posts
      .filter((post) => {
        if (post.delete_requested && !isAdmin && post.author_id !== currentUserId) {
          return false;
        }

        if (officialFilter === 'official' && !post.is_official) return false;
        if (officialFilter === 'unofficial' && post.is_official) return false;

        if (selectedFilterTags.length > 0) {
          const postTags = post.tags || [];
          const hasMatchingTag = selectedFilterTags.some((t) => postTags.includes(t));
          if (!hasMatchingTag) return false;
        }

        if (normQuery) {
          const titleMatch = normalizeText(post.title).includes(normQuery);
          const authorMatch = normalizeText(post.author_nickname || '').includes(normQuery);
          const contentMatch = normalizeText(extractPlainText(post.content)).includes(normQuery);
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

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
      {/* 타이틀 및 새로고침 헤더 (모바일 반응형 한 줄 정렬) */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">커뮤니티 피드</h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">자유롭게 소통하고 게시글을 공유하세요.</p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition shadow-sm disabled:opacity-50 shrink-0"
          title="피드 새로고침"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          <span className="hidden sm:inline">{isRefreshing ? '갱신 중...' : '새로고침'}</span>
        </button>
      </div>

      {/* 검색창 및 깔때기 필터 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성자, 내용 검색 (공백 무시)"
            className="w-full pl-9 pr-8 py-2.5 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleOpenFilterModal}
          className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl border transition shadow-sm shrink-0 ${
            selectedFilterTags.length > 0
              ? 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
          title="해시태그 필터"
        >
          <Filter className="w-3.5 h-3.5" />
          <span>필터</span>
          {selectedFilterTags.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-white text-emerald-600 text-[10px] flex items-center justify-center font-bold">
              {selectedFilterTags.length}
            </span>
          )}
        </button>
      </div>

      {/* 활성화된 필터 뱃지 */}
      {selectedFilterTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[11px] text-zinc-400 font-medium">선택된 태그:</span>
          {selectedFilterTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800"
            >
              #{tag}
              <button
                type="button"
                onClick={() => setSelectedFilterTags((prev) => prev.filter((t) => t !== tag))}
                className="hover:text-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelectedFilterTags([])}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline ml-1"
          >
            초기화
          </button>
        </div>
      )}

      {/* 필터 탭 바 (모바일 가로 붕괴 방지 반응형) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-6">
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-semibold">
          <button
            onClick={() => setOfficialFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              officialFilter === 'all'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            통합
          </button>
          <button
            onClick={() => setOfficialFilter('official')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              officialFilter === 'official'
                ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            공식
          </button>
          <button
            onClick={() => setOfficialFilter('unofficial')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              officialFilter === 'unofficial'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            비공식
          </button>
        </div>

        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              sortType === 'latest'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            최신순
          </button>
          <button
            onClick={() => setSortType('popular')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              sortType === 'popular'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            인기순
          </button>
          <button
            onClick={() => setSortType('oldest')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              sortType === 'oldest'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            오래된순
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-400 dark:text-zinc-500">게시글 목록을 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
          <MessagesSquare className="w-10 h-10 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-700 dark:text-zinc-300 font-medium">해당 조건에 일치하는 게시글이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const thumbnail = post.thumbnail_url || extractFirstImage(post.content);
            const plainText = extractPlainText(post.content);
            const imageCount = countImages(post.content);

            return (
              <article
                key={post.id}
                onClick={() => handleOpenPost(post.id)}
                className={`group p-4 sm:p-6 rounded-2xl transition duration-200 shadow-sm dark:shadow-md cursor-pointer select-none relative ${
                  post.delete_requested
                    ? 'bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-400 dark:border-amber-600'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                {post.delete_requested && (
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-amber-200 dark:border-amber-900/60">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4" />
                      <span>비공개 처리됨 (삭제 신청 대기 중)</span>
                    </div>
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-amber-500 text-white shadow-sm">
                      &lt;삭제 신청 게시글&gt;
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 sm:gap-6">
                  <div className="flex-1 min-w-0 space-y-2">
                    <h2 className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {post.is_official && (
                        <span className="inline-block text-emerald-600 dark:text-emerald-400 mr-1.5 font-extrabold">
                          [공식]
                        </span>
                      )}
                      {post.title}
                    </h2>

                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-emerald-900/50"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {plainText || '내용이 없습니다.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs text-zinc-500 pt-1">
                      {/* 작성자 닉네임 좌측 왕관 100% 매핑 렌더링 */}
                      <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                        <CrownIcon role={post.author_role} className="w-4 h-4 shrink-0" />
                        <span>{post.author_nickname}</span>
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400 font-medium">
                        <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                        {post.likes_count ?? 0}
                      </span>
                      {imageCount > 1 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                          <ImageIcon className="w-3 h-3" />
                          +{imageCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 썸네일 미리보기 */}
                  {post.is_preview_hidden ? (
                    <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-1 select-none">
                      <EyeOff className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400 dark:text-zinc-500" />
                      <span className="text-[9px] sm:text-[10px] font-medium text-zinc-500 dark:text-zinc-400">미리보기 가림</span>
                    </div>
                  ) : thumbnail ? (
                    <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800/80">
                      <img
                        src={thumbnail}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                </div>

                {post.delete_requested && isAdmin && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 order-2 sm:order-1">
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: 'approve', post })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        허락 (삭제)
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: 'reject', post })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white font-bold transition shadow-sm"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        거절 (복구)
                      </button>
                    </div>

                    <div className="text-zinc-700 dark:text-zinc-300 font-medium order-1 sm:order-2 bg-amber-100/80 dark:bg-amber-900/40 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 max-w-full break-words">
                      <span className="font-bold text-amber-900 dark:text-amber-200">삭제사유: </span>
                      {post.delete_reason || '사유가 입력되지 않았습니다.'}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* 깔때기 태그 필터 팝업 */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">태그 필터 설정</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              선택한 태그가 하나라도 포함된 게시글이 피드에 표시됩니다. (다중 선택 가능)
            </p>

            <div className="flex flex-wrap gap-2">
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <span>#{tag}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleResetFilterModal}
                className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:underline"
              >
                전체 해제
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleApplyFilterModal}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 확인 팝업 */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !actionProcessing && setConfirmModal(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              게시글 삭제 심사
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {confirmModal.type === 'approve'
                ? '게시글의 삭제를 허락하시겠습니까? 데이터가 영구히 제거됩니다.'
                : '게시글의 삭제를 거절하시겠습니까? 다시 일반 사용자에게 공개됩니다.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={actionProcessing}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={confirmModal.type === 'approve' ? handleApproveDelete : handleRejectDelete}
                disabled={actionProcessing}
                className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition disabled:opacity-50 ${
                  confirmModal.type === 'approve' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {actionProcessing ? '처리 중...' : '예'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activePostId && (
        <PostModal
          postId={activePostId}
          onClose={handleClosePost}
          onDeleted={fetchPosts}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">피드 데이터를 불러오는 중...</div>}>
      <FeedContent />
    </Suspense>
  );
}