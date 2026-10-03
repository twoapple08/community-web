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
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Megaphone,
  Pencil
} from 'lucide-react';
import PostModal from '@/components/PostModal';

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
}

interface SiteNotice {
  id: number;
  title: string;
  content: string;
  updated_at: string;
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

  // 페이지네이션 및 드롭업 상태
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(10);
  const [isPageSizeDropupOpen, setIsPageSizeDropupOpen] = useState(false);

  // 공지사항 상태
  const [notice, setNotice] = useState<SiteNotice | null>(null);
  const [isNoticeDetailOpen, setIsNoticeDetailOpen] = useState(false);
  const [isNoticeAutoPopup, setIsNoticeAutoPopup] = useState(false);
  const [isNoticeEditOpen, setIsNoticeEditOpen] = useState(false);
  const [editNoticeTitle, setEditNoticeTitle] = useState('');
  const [editNoticeContent, setEditNoticeContent] = useState('');
  const [savingNotice, setSavingNotice] = useState(false);
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false);

  // 상단 공지 알림 토스트 (CSS 애니메이션으로 페이드인 & 페이드아웃 보장)
  const [toastState, setToastState] = useState<{
    visible: boolean;
    animatingOut: boolean;
    text: string;
  }>({
    visible: false,
    animatingOut: false,
    text: '',
  });

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    type: 'approve' | 'reject';
    post: Post;
  } | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);

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

    fetchNotice();
  }, []);

  const fetchNotice = async () => {
    const { data } = await supabase
      .from('site_notices')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (data) {
      setNotice(data as SiteNotice);
      setEditNoticeTitle(data.title);
      setEditNoticeContent(data.content);

      const hiddenTimestamp = localStorage.getItem('hide_notice_until');
      if (!hiddenTimestamp || new Date(hiddenTimestamp) < new Date(data.updated_at)) {
        setIsNoticeAutoPopup(true);
        setIsNoticeDetailOpen(true);
      }
    }
  };

  const handleCloseNoticePopup = () => {
    if (isNoticeAutoPopup && dontShowAgainChecked && notice) {
      localStorage.setItem('hide_notice_until', notice.updated_at);
    }
    setIsNoticeDetailOpen(false);
  };

  const showTopToast = (msg: string) => {
    setToastState({ visible: true, animatingOut: false, text: msg });
    setTimeout(() => {
      setToastState((prev) => ({ ...prev, animatingOut: true }));
      setTimeout(() => {
        setToastState({ visible: false, animatingOut: false, text: '' });
      }, 350);
    }, 2500);
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNoticeTitle.trim() || !editNoticeContent.trim()) {
      alert('제목과 내용을 모두 입력해 주십시오.');
      return;
    }

    setSavingNotice(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('site_notices')
      .upsert({
        id: 1,
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      });

    if (error) {
      alert(`공지사항 수정 실패: ${error.message}`);
    } else {
      setNotice({
        id: 1,
        title: editNoticeTitle.trim(),
        content: editNoticeContent.trim(),
        updated_at: nowIso,
      });
      setIsNoticeEditOpen(false);
      showTopToast('공지사항이 성공적으로 갱신되었습니다.');
    }
    setSavingNotice(false);
  };

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

      const { data: rolesData } = await supabase.from('user_roles').select('*');
      const roleMapByUserId: Record<string, RoleType> = {};
      rolesData?.forEach((r: any) => {
        if (r.user_id) roleMapByUserId[r.user_id] = r.role;
        if (r.email === 'iwsamuel08@gmail.com' && r.user_id) roleMapByUserId[r.user_id] = 'creator';
      });

      const formattedPosts: Post[] = postsData.map((post) => {
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, officialFilter, selectedFilterTags, sortType]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchPosts();
    await fetchNotice();
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

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * postsPerPage;
    return filteredPosts.slice(startIndex, startIndex + postsPerPage);
  }, [filteredPosts, currentPage, postsPerPage]);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
      {/* 상단 공지 알림 토스트 (top-20, 순수 CSS 애니메이션으로 완벽한 페이드인 & 페이드아웃) */}
      {toastState.visible && (
        <div
          className={`fixed top-20 left-1/2 z-[100] px-5 py-2.5 bg-blue-600 text-white border border-blue-400 rounded-none text-xs font-bold tracking-wide pointer-events-none shadow-2xl flex items-center gap-2 ${
            toastState.animatingOut ? 'animate-notice-out' : 'animate-notice-in'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>{toastState.text}</span>
        </div>
      )}

      {/* 헤더 타이틀 및 새로고침 */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white transition-colors duration-300">
            커뮤니티 피드
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 transition-colors duration-300">
            자유롭게 소통하고 게시글을 공유하세요.
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors duration-300 shadow-sm disabled:opacity-50 shrink-0"
          title="피드 새로고침"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          <span className="hidden sm:inline">새로고침</span>
        </button>
      </div>

      {/* 공지사항 배너 (배경 채움 해제 + 투명 틴트 + X축 수평 중심선 일치) */}
      {notice && (
        <div
          onClick={() => {
            setIsNoticeAutoPopup(false);
            setIsNoticeDetailOpen(true);
          }}
          className="w-full rounded-none bg-blue-50/40 dark:bg-blue-950/20 border border-blue-500/40 dark:border-blue-500/40 hover:bg-blue-100/40 dark:hover:bg-blue-950/40 px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors duration-300 group select-none mb-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/40 border border-blue-500/30 rounded-none transition-colors duration-300">
              <Megaphone className="w-3.5 h-3.5 transition-colors duration-300" />
            </div>
            <span className="text-sm font-black text-blue-600 dark:text-blue-400 shrink-0 leading-normal transition-colors duration-300">
              [공지사항]
            </span>
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:underline leading-normal transition-colors duration-300">
              {notice.title}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-white shrink-0 hidden sm:inline leading-normal transition-colors duration-300">
              ({new Date(notice.updated_at).toLocaleDateString()})
            </span>
          </div>

          <div className="flex items-center shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNoticeEditOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1 h-7 px-2.5 text-xs font-bold rounded-none bg-blue-600 hover:bg-blue-500 text-white transition-colors duration-300 shadow-sm shrink-0 leading-normal"
              >
                <Pencil className="w-3 h-3" />
                <span>공지 수정</span>
              </button>
            )}
          </div>
        </div>
      )}

      <hr className="border-zinc-200 dark:border-zinc-800 mb-5 transition-colors duration-300" />

      {/* 검색창 및 필터 바 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성자, 내용 검색 (공백 무시)"
            className="w-full pl-9 pr-8 py-2.5 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors duration-300"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors duration-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleOpenFilterModal}
          className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors duration-300 shadow-sm shrink-0 ${
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

      {selectedFilterTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[11px] text-zinc-400 font-medium">선택된 태그:</span>
          {selectedFilterTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 transition-colors duration-300"
            >
              #{tag}
              <button
                type="button"
                onClick={() => setSelectedFilterTags((prev) => prev.filter((t) => t !== tag))}
                className="hover:text-rose-500 transition-colors duration-300"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelectedFilterTags([])}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline ml-1 transition-colors duration-300"
          >
            초기화
          </button>
        </div>
      )}

      {/* 필터 탭 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-6">
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-semibold transition-colors duration-300">
          <button
            onClick={() => setOfficialFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors duration-300 whitespace-nowrap ${
              officialFilter === 'all'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            통합
          </button>
          <button
            onClick={() => setOfficialFilter('official')}
            className={`px-3 py-1.5 rounded-lg transition-colors duration-300 whitespace-nowrap ${
              officialFilter === 'official'
                ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            공식
          </button>
          <button
            onClick={() => setOfficialFilter('unofficial')}
            className={`px-3 py-1.5 rounded-lg transition-colors duration-300 whitespace-nowrap ${
              officialFilter === 'unofficial'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            비공식
          </button>
        </div>

        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-semibold transition-colors duration-300">
          <button
            onClick={() => setSortType('latest')}
            className={`px-3 py-1.5 rounded-lg transition-colors duration-300 whitespace-nowrap ${
              sortType === 'latest'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            최신순
          </button>
          <button
            onClick={() => setSortType('popular')}
            className={`px-3 py-1.5 rounded-lg transition-colors duration-300 whitespace-nowrap ${
              sortType === 'popular'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            인기순
          </button>
          <button
            onClick={() => setSortType('oldest')}
            className={`px-3 py-1.5 rounded-lg transition-colors duration-300 whitespace-nowrap ${
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
          {paginatedPosts.map((post) => {
            const thumbnail = post.thumbnail_url || extractFirstImage(post.content);
            const plainText = extractPlainText(post.content);
            const imageCount = countImages(post.content);

            return (
              <article
                key={post.id}
                onClick={() => handleOpenPost(post.id)}
                className={`group p-4 sm:p-6 rounded-2xl transition duration-300 shadow-sm dark:shadow-md cursor-pointer select-none relative ${
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
                    <h2 className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-300 line-clamp-1">
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
                            className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/80 dark:border-emerald-900/50 transition-colors duration-300"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed transition-colors duration-300">
                      {plainText || '내용이 없습니다.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs text-zinc-500 pt-1">
                      <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium leading-normal transition-colors duration-300">
                        <CrownIcon role={post.author_role} className="w-4 h-4 shrink-0" />
                        <span>{post.author_nickname}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-zinc-400 dark:text-zinc-500 leading-normal transition-colors duration-300">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400 font-medium leading-normal transition-colors duration-300">
                        <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                        <span>{post.likes_count ?? 0}</span>
                      </span>
                      {imageCount > 1 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/50 leading-normal transition-colors duration-300">
                          <ImageIcon className="w-3 h-3" />
                          <span>+{imageCount}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {post.is_preview_hidden ? (
                    <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-1 select-none transition-colors duration-300">
                      <EyeOff className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400 dark:text-zinc-500" />
                      <span className="text-[9px] sm:text-[10px] font-medium text-zinc-500 dark:text-zinc-400">미리보기 가림</span>
                    </div>
                  ) : thumbnail ? (
                    <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800/80 transition-colors duration-300">
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition duration-300 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        허락 (삭제)
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ type: 'reject', post })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white font-bold transition duration-300 shadow-sm"
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

      {/* 하단 페이지네이션 및 우측 드롭업 */}
      {filteredPosts.length > 0 && (
        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors duration-300">
          <div className="hidden sm:block text-xs text-zinc-400 w-32 transition-colors duration-300">
            전체 {filteredPosts.length}개
          </div>

          <div className="flex items-center gap-1 justify-center">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition duration-300"
              title="이전 페이지"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                return (
                  page === 1 ||
                  page === totalPages ||
                  Math.abs(page - currentPage) <= 1
                );
              })
              .map((page, idx, arr) => {
                const prev = arr[idx - 1];
                const hasGap = prev && page - prev > 1;
                return (
                  <div key={page} className="flex items-center">
                    {hasGap && <span className="px-1 text-xs text-zinc-400">...</span>}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-8 h-8 px-2 text-xs font-semibold rounded-lg transition duration-300 ${
                        currentPage === page
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {page}
                    </button>
                  </div>
                );
              })}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition duration-300"
              title="다음 페이지"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative self-end sm:self-auto">
            {isPageSizeDropupOpen && (
              <div className="absolute bottom-full mb-1.5 right-0 z-30 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {PAGE_SIZE_OPTIONS.map((size) => {
                  const isSelected = postsPerPage === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePageSizeChange(size)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition duration-300 ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <span>{size}개씩 보기</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsPageSizeDropupOpen(!isPageSizeDropupOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-semibold transition duration-300 shadow-sm"
            >
              <span>{postsPerPage}개씩 보기</span>
              <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </div>
      )}

      {/* 공지 상세 모달 */}
      {isNoticeDetailOpen && notice && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={handleCloseNoticePopup}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-blue-600 rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-300"
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
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none transition duration-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-blue-700 dark:text-blue-400">
                {notice.title}
              </h4>
              <p className="text-[11px] text-zinc-400">
                최종 갱신일: {new Date(notice.updated_at).toLocaleString()}
              </p>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto rounded-none">
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
                  <span>다음 공지사항 갱신 까지 보지 않기</span>
                </label>
              )}

              <button
                type="button"
                onClick={handleCloseNoticePopup}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-none transition duration-300 shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 공지 수정 팝업 */}
      {isNoticeEditOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => !savingNotice && setIsNoticeEditOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-blue-600 rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-300"
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
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none transition duration-300"
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
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-300"
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
                  className="w-full px-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNoticeEditOpen(false)}
                  disabled={savingNotice}
                  className="px-4 py-2 text-xs font-semibold rounded-none border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition duration-300 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingNotice}
                  className="px-5 py-2 text-xs font-bold rounded-none bg-blue-600 hover:bg-blue-700 text-white transition duration-300 disabled:opacity-50"
                >
                  {savingNotice ? '갱신 중...' : '공지 갱신 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 태그 필터 팝업 */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-300"
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
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition duration-300"
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition duration-300 border ${
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
                className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:underline transition duration-300"
              >
                전체 해제
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition duration-300"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleApplyFilterModal}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition duration-300 shadow-sm"
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
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => !actionProcessing && setConfirmModal(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-300"
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
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition duration-300 disabled:opacity-50"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={confirmModal.type === 'approve' ? handleApproveDelete : handleRejectDelete}
                disabled={actionProcessing}
                className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition duration-300 disabled:opacity-50 ${
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
