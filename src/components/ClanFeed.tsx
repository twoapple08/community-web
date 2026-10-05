'use client'

import { CrownIcon, RoleType } from "@/components/CrownIcon";
import { useEffect, useState, Suspense, useMemo, useRef, useCallback, useDeferredValue, type MouseEvent as ReactMouseEvent } from 'react';
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
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  ArrowLeftRight,
  Siren
} from 'lucide-react';
import NoticeBanner from '@/components/NoticeBanner';
import FeedMedia from '@/components/FeedMedia';
import AdminReportModal from '@/components/AdminReportModal';
import CustomPopup from '@/components/CustomPopup';
import Avatar from '@/components/Avatar';
import Link from 'next/link';
import { extractFirstImage, extractPlainText, countImages, normalizeForSearch } from '@/lib/htmlText';
import { fetchMyRole, fetchRoleMap } from '@/lib/roles';
import { getPostPath } from '@/lib/postRoute';
import { fetchAvatarMap, openUserProfile } from '@/lib/userProfile';
import {
  FEED_CACHE_FRESH_MS,
  getFeedCache,
  markOpenedFromFeed,
  onPostsChanged,
  patchFeedCache,
  setFeedCache,
} from '@/lib/feedStore';

type SortType = 'latest' | 'popular' | 'oldest';
type OfficialFilterType = 'all' | 'official' | 'unofficial';
type ViewMode = 'list' | 'feed' | 'album';

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

interface Post {
  id: string;
  post_no?: number | null;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  author_nickname?: string;
  author_role?: RoleType;
  author_avatar?: string | null;
  is_official?: boolean;
  delete_requested?: boolean;
  delete_reason?: string | null;
  tags?: string[];
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
  feed_type?: string;
  // 목록 렌더링/검색용으로 미리 계산해 두는 값
  _plain: string;
  _thumb: string | null;
  _imageCount: number;
  _searchTitle: string;
  _searchAuthor: string;
  _searchContent: string;
  _time: number;
}

// 마지막으로 받아 온 작성자 프로필 사진 (목록을 다시 불러올 때 사진이 사라졌다 다시 뜨는 깜빡임 방지)
const lastKnownAvatars: Record<string, string | null> = {};

const isCrownRole = (role: RoleType) => role === 'creator' || role === 'super_admin' || role === 'admin';

// 작성자 닉네임 클릭 → 프로필 열기 (게시글이 같이 열리지 않도록 전파 차단)
const openAuthorProfile = (e: ReactMouseEvent, authorId: string) => {
  e.stopPropagation();
  openUserProfile(authorId);
};

// 피드형 작성자 원: 프로필 사진이 있으면 사진 + 오른쪽 아래 작은 왕관(관리자만), 없거나 못 불러오면 기존 모양(가운데 왕관) 그대로
function FeedAuthorCircle({ src, role, nickname }: { src?: string | null; role?: RoleType; nickname?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const circle = (
    <span className="w-8 h-8 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
      <CrownIcon role={role} className="w-4 h-4" />
    </span>
  );
  if (!src || failedSrc === src) return circle;

  return (
    // 사진 로드 실패(onError 는 React 에서 부모로 전달됨) 시 왕관 배지가 가운데 왕관과 겹치지 않게 기존 원으로 되돌림
    <span className="relative flex w-8 h-8 shrink-0" onError={() => setFailedSrc(src)}>
      {/* Avatar 는 px 크기라 rem 기반인 w-8 과 맞추기 위해 크기를 강제 */}
      <Avatar src={src} alt={`${nickname ?? '작성자'} 프로필 사진`} className="w-8! h-8!" fallback={circle} />
      {isCrownRole(role) && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
          <CrownIcon role={role} className="w-2.5 h-2.5" />
        </span>
      )}
    </span>
  );
}

const sortPosts = (list: Post[], sortType: SortType): Post[] => {
  const sorted = [...list];
  if (sortType === 'popular') {
    sorted.sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0) || b._time - a._time);
  } else if (sortType === 'oldest') {
    sorted.sort((a, b) => a._time - b._time);
  } else {
    sorted.sort((a, b) => b._time - a._time);
  }
  return sorted;
};

function ClanFeedContent() {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>(() => getFeedCache<Post>('clan')?.posts ?? []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isViewModeDropdownOpen, setIsViewModeDropdownOpen] = useState(false);
  const [dropdownAlign, setDropdownAlign] = useState<'left' | 'right'>('right');
  const viewModeDropdownRef = useRef<HTMLDivElement>(null);

  const [officialFilter, setOfficialFilter] = useState<OfficialFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [tempFilterTags, setTempFilterTags] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(10);
  const [isPageSizeDropupOpen, setIsPageSizeDropupOpen] = useState(false);
  const pageSizeDropupRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(() => !getFeedCache('clan'));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ type: 'approve' | 'reject'; post: Post } | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [errorPopup, setErrorPopup] = useState<{ title: string; message: string } | null>(null);

  const [isAdminReportOpen, setIsAdminReportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isAdmin = Boolean(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin');
  const isCreatorOrSuperAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin';

  // 보기 방식 통합 로컬스토리지 키 (sfa_global_view_mode)
  useEffect(() => {
    const savedSize = localStorage.getItem('user_posts_per_page');
    if (savedSize && [10, 20, 30, 40, 50].includes(Number(savedSize))) {
      setPostsPerPage(Number(savedSize));
    }
    const savedGlobalView = localStorage.getItem('sfa_global_view_mode') as ViewMode | null;
    if (savedGlobalView && ['list', 'feed', 'album'].includes(savedGlobalView)) {
      setViewMode(savedGlobalView);
    }
  }, []);

  // 외부 클릭 시 드롭다운 닫기 (보기형식 / 페이지당 개수)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (viewModeDropdownRef.current && !viewModeDropdownRef.current.contains(target)) {
        setIsViewModeDropdownOpen(false);
      }
      if (pageSizeDropupRef.current && !pageSizeDropupRef.current.contains(target)) {
        setIsPageSizeDropupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setIsViewModeDropdownOpen(false);
    localStorage.setItem('sfa_global_view_mode', mode);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPostsPerPage(newSize);
    setCurrentPage(1);
    setIsPageSizeDropupOpen(false);
    localStorage.setItem('user_posts_per_page', String(newSize));
  };

  const checkUnreadReports = useCallback(async () => {
    const { count } = await supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    setUnreadCount(count || 0);
  }, []);

  const fetchPosts = useCallback(async () => {
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('feed_type', 'clan')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (postsData) {
      const authorIds = Array.from(new Set(postsData.map((p) => p.author_id).filter(Boolean)));
      const profileMap: Record<string, string> = {};

      const [profileRows, roleMap] = await Promise.all([
        authorIds.length > 0
          ? Promise.resolve(supabase.from('profiles').select('id, nickname').in('id', authorIds)).then(
              (res) => (res.data ?? []) as { id: string; nickname: string }[]
            )
          : Promise.resolve([] as { id: string; nickname: string }[]),
        fetchRoleMap(),
      ]);

      profileRows.forEach((p) => {
        profileMap[p.id] = p.nickname;
      });

      const nextPosts: Post[] = postsData.map((post) => {
        const nickname = profileMap[post.author_id] || '작성자';
        const plain = extractPlainText(post.content);
        return {
          ...post,
          likes_count: post.likes_count ?? 0,
          author_nickname: nickname,
          author_role: roleMap[post.author_id] || null,
          author_avatar: lastKnownAvatars[post.author_id] ?? null,
          is_official: Boolean(post.is_official),
          delete_requested: Boolean(post.delete_requested),
          delete_reason: post.delete_reason || null,
          tags: Array.isArray(post.tags) ? post.tags : [],
          thumbnail_url: post.thumbnail_url || null,
          is_preview_hidden: Boolean(post.is_preview_hidden),
          _plain: plain,
          _thumb: post.thumbnail_url || extractFirstImage(post.content),
          _imageCount: countImages(post.content),
          _searchTitle: normalizeForSearch(post.title || ''),
          _searchAuthor: normalizeForSearch(nickname),
          _searchContent: normalizeForSearch(plain),
          _time: new Date(post.created_at).getTime() || 0,
        };
      });

      setPosts(nextPosts);
      setFeedCache('clan', nextPosts);

      // 프로필 사진은 첫 화면을 막지 않도록 목록을 먼저 보여 준 뒤 따로 불러와 합침
      // (SQL 미적용으로 avatar_url 컬럼이 없으면 빈 결과 → 기존 화면 그대로)
      if (authorIds.length > 0) {
        fetchAvatarMap(authorIds)
          .then((avatarMap) => {
            Object.assign(lastKnownAvatars, avatarMap);
            const applyAvatars = (list: Post[]): Post[] => {
              let changed = false;
              const next = list.map((p) => {
                const url = avatarMap[p.author_id];
                if (url === undefined || p.author_avatar === url) return p;
                changed = true;
                return { ...p, author_avatar: url };
              });
              return changed ? next : list;
            };
            setPosts(applyAvatars);
            const cached = getFeedCache<Post>('clan');
            if (cached) {
              const nextCached = applyAvatars(cached.posts);
              if (nextCached !== cached.posts) setFeedCache('clan', nextCached);
            }
          })
          .catch(() => {});
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (!uid) return;
      fetchMyRole(uid, session?.user?.email).then((role) => {
        if (!role) return;
        setCurrentUserRole(role);
        if (role === 'creator' || role === 'super_admin') {
          checkUnreadReports();
        }
      });
    });

    // 캐시가 있으면 즉시 표시하고, 오래된 경우에만 뒤에서 조용히 새로고침
    const cached = getFeedCache('clan');
    if (!cached || Date.now() - cached.at > FEED_CACHE_FRESH_MS) {
      fetchPosts();
    }
  }, [fetchPosts, checkUnreadReports]);

  // 게시글 상세(모달)에서 좋아요/수정/삭제가 일어나면 목록에 반영
  useEffect(() => {
    return onPostsChanged((event) => {
      if (event.kind === 'patch') {
        patchFeedCache(event.id, event.patch);
        setPosts((prev) => prev.map((p) => (String(p.id) === String(event.id) ? ({ ...p, ...event.patch } as Post) : p)));
      } else {
        if (event.kind === 'remove') {
          setPosts((prev) => prev.filter((p) => String(p.id) !== String(event.id)));
        }
        fetchPosts();
      }
    });
  }, [fetchPosts]);

  const handleApproveDelete = async () => {
    if (!confirmModal) return;
    setActionProcessing(true);
    const { error } = await supabase.from('posts').delete().eq('id', confirmModal.post.id);
    if (error) {
      setErrorPopup({ title: '삭제 실패', message: `삭제 처리에 실패했습니다: ${error.message}` });
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
      setErrorPopup({ title: '거절 실패', message: `거절 처리에 실패했습니다: ${error.message}` });
    } else {
      setConfirmModal(null);
      await fetchPosts();
    }
    setActionProcessing(false);
  };

  const sortedPosts = useMemo(() => sortPosts(posts, sortType), [posts, sortType]);

  const filteredPosts = useMemo(() => {
    const q = normalizeForSearch(deferredSearchQuery);

    const visible = sortedPosts.filter((post) => {
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
        if (!post._searchTitle.includes(q) && !post._searchAuthor.includes(q) && !post._searchContent.includes(q)) {
          return false;
        }
      }

      return true;
    });

    // 관리자에게는 삭제 신청 글을 최상단에 고정 (나머지는 선택한 정렬 순서 유지)
    if (!isAdmin) return visible;
    return [...visible.filter((p) => p.delete_requested), ...visible.filter((p) => !p.delete_requested)];
  }, [sortedPosts, officialFilter, selectedFilterTags, deferredSearchQuery, isAdmin, currentUserId]);

  // 검색어/필터/정렬이 바뀌면 1페이지로 이동 (빈 페이지가 보이던 문제 방지)
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchQuery, officialFilter, selectedFilterTags, sortType]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPosts = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * postsPerPage;
    return filteredPosts.slice(startIndex, startIndex + postsPerPage);
  }, [filteredPosts, safeCurrentPage, postsPerPage]);

  const openPost = (post: Post) => {
    markOpenedFromFeed();
    router.push(getPostPath({ ...post, feed_type: 'clan' }));
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col min-w-0">
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
              await Promise.all([fetchPosts(), isCreatorOrSuperAdmin ? checkUnreadReports() : Promise.resolve()]);
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

      {/* 필터 및 정렬 + 보기형식 바 */}
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

        {/* 정렬 버튼 그룹 + 바로 왼쪽에 위치한 네이버 카페식 보기방식 드롭다운 */}
        <div className="flex items-center gap-2">
          {/* 네이버 카페 스타일 보기형식 드롭다운 */}
          <div className="relative" ref={viewModeDropdownRef}>
            <button
              type="button"
              onClick={() => {
                if (!isViewModeDropdownOpen && viewModeDropdownRef.current) {
                  const rect = viewModeDropdownRef.current.getBoundingClientRect();
                  if (rect.left < window.innerWidth / 2) {
                    setDropdownAlign('left');
                  } else {
                    setDropdownAlign('right');
                  }
                }
                setIsViewModeDropdownOpen(!isViewModeDropdownOpen);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 transition shadow-sm"
              title="보기 형식 변경"
            >
              {viewMode === 'list' && (
                <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <circle cx="3.5" cy="6" r="1.5" fill="currentColor"/><circle cx="3.5" cy="12" r="1.5" fill="currentColor"/><circle cx="3.5" cy="18" r="1.5" fill="currentColor"/>
                </svg>
              )}
              {viewMode === 'feed' && (
                <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/>
                </svg>
              )}
              {viewMode === 'album' && (
                <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
                </svg>
              )}
              <span>{viewMode === 'list' ? '목록형' : viewMode === 'album' ? '앨범형' : '피드형'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isViewModeDropdownOpen && (
              <div className={`absolute top-full mt-1.5 w-48 max-w-[85vw] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-100 ${
                dropdownAlign === 'left' ? 'left-0' : 'right-0'
              }`}>
                {/* 1. 목록형 (캡처 1번) */}
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('list')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                      <circle cx="3.5" cy="6" r="1.5" fill="currentColor"/><circle cx="3.5" cy="12" r="1.5" fill="currentColor"/><circle cx="3.5" cy="18" r="1.5" fill="currentColor"/>
                    </svg>
                    <span>목록형</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'list' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {viewMode === 'list' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>

                {/* 2. 피드형 (캡처 2번) */}
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('feed')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/>
                    </svg>
                    <span>피드형</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'feed' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {viewMode === 'feed' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>

                {/* 3. 앨범형 (캡처 3번) */}
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('album')}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
                      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
                    </svg>
                    <span>앨범형</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'album' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {viewMode === 'album' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>
              </div>
            )}
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
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-400">클랜 피드를 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">조건에 일치하는 클랜 게시글이 없습니다.</p>
        </div>
      ) : (
        <div>
          {/* 1. 목록형 (캡처 1번 이미지: 기존 메인 카드 디자인 - 좌측 내용, 우측 썸네일) */}
          {viewMode === 'list' && (
            <div className="space-y-3.5 w-full">
              {paginatedPosts.map((post) => {
                const thumbnail = post._thumb;
                const imageCount = post._imageCount;

                return (
                  <article
                    key={post.id}
                    onClick={() => openPost(post)}
                    className={`group p-3.5 sm:p-5 rounded-2xl transition duration-300 shadow-sm cursor-pointer select-none relative w-full ${
                      post.delete_requested
                        ? 'bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-400 dark:border-amber-600'
                        : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                    }`}
                  >
                    {post.delete_requested && (
                      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-amber-200 dark:border-amber-900/60">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 min-w-0">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>비공개 처리됨 (삭제 신청 대기 중)</span>
                        </div>
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-amber-500 text-white shrink-0">
                          삭제 신청
                        </span>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3 sm:gap-5 w-full">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <h2 className="text-base sm:text-lg md:text-xl font-black text-zinc-900 dark:text-white tracking-tight truncate">
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

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3.5 text-xs sm:text-sm text-zinc-500 pt-1 font-semibold">
                          <button
                            type="button"
                            onClick={(e) => openAuthorProfile(e, post.author_id)}
                            className="group/author flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 min-w-0 text-left cursor-pointer"
                          >
                            <CrownIcon role={post.author_role} className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate group-hover/author:underline">{post.author_nickname}</span>
                          </button>
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
                          <img src={thumbnail} alt={post.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        </div>
                      ) : null}
                    </div>

                    {post.delete_requested && isAdmin && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 pt-2.5 border-t border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-2 text-xs"
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
                        <span className="text-zinc-600 dark:text-zinc-300 font-medium min-w-0 break-words">
                          사유: {post.delete_reason || '미입력'}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* 2. 피드형 (캡처 2번 이미지: 상단 작성자 ➔ 제목/요약 ➔ 가로 100% 와이드 대형 썸네일) */}
          {viewMode === 'feed' && (
            <div className="space-y-4 w-full">
              {paginatedPosts.map((post) => {
                const thumbnail = post._thumb;

                return (
                  <article
                    key={post.id}
                    onClick={() => openPost(post)}
                    className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 transition cursor-pointer select-none shadow-sm space-y-3"
                  >
                    {/* 상단 프로필 헤더 */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => openAuthorProfile(e, post.author_id)}
                        className="group/author flex items-center gap-2 min-w-0 text-left cursor-pointer"
                      >
                        <FeedAuthorCircle src={post.author_avatar} role={post.author_role} nickname={post.author_nickname} />
                        <span className="min-w-0">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white block truncate group-hover/author:underline">
                            {post.author_nickname}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {new Date(post.created_at).toLocaleDateString()}
                          </span>
                        </span>
                      </button>

                      {post.is_official && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shrink-0">
                          공식 클랜
                        </span>
                      )}
                    </div>

                    {/* 제목 (본문 미리보기 글자는 표시하지 않음) */}
                    <div className="space-y-1">
                      <h2 className="text-lg sm:text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                        {post.title}
                      </h2>
                    </div>

                    {/* 세로 1.7배 이상 사진 3:4 자동 크롭 FeedMedia */}
                    {thumbnail && !post.is_preview_hidden && (
                      <FeedMedia src={thumbnail} alt={post.title} />
                    )}

                    {/* 태그 목록 */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200/80 dark:border-emerald-900/50"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 하단 액션 바 (클랜 피드는 댓글 없이 오직 좋아요만) */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                      <div className="flex items-center gap-1.5 text-rose-500 font-bold">
                        <Heart className="w-4 h-4 fill-rose-500/20" />
                        <span>좋아요 {post.likes_count ?? 0}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* 3. 앨범형 (캡처 3번 이미지: 2~3열 갤러리 그리드) */}
          {viewMode === 'album' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full">
              {paginatedPosts.map((post) => {
                const thumbnail = post.is_preview_hidden ? null : post._thumb;
                const imageCount = post._imageCount;

                return (
                  <div
                    key={post.id}
                    onClick={() => openPost(post)}
                    className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-400 transition cursor-pointer select-none flex flex-col shadow-sm min-w-0"
                  >
                    <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative">
                      {post.is_preview_hidden ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                          <EyeOff className="w-6 h-6" />
                          <span className="text-[10px]">가림</span>
                        </div>
                      ) : thumbnail ? (
                        <img src={thumbnail} alt={post.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
                          <ImageIcon className="w-8 h-8 stroke-1 text-zinc-400" />
                        </div>
                      )}

                      {post.is_official && (
                        <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow">
                          공식
                        </span>
                      )}

                      {imageCount > 1 && !post.is_preview_hidden && (
                        <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                          +{imageCount}
                        </span>
                      )}
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5 min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 group-hover:text-emerald-500 transition">
                        {post.title}
                      </h3>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={(e) => openAuthorProfile(e, post.author_id)}
                          className="max-w-[80px] min-w-0 text-left cursor-pointer"
                        >
                          <span className="block truncate hover:underline">{post.author_nickname}</span>
                        </button>
                        <span className="text-rose-500 font-semibold flex items-center gap-0.5 shrink-0">
                          <Heart className="w-3 h-3 fill-current" /> {post.likes_count ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 페이지네이션 */}
      {filteredPosts.length > 0 && (
        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="text-xs text-zinc-400">전체 {filteredPosts.length}개</div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
              disabled={safeCurrentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-bold">{safeCurrentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
              disabled={safeCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative" ref={pageSizeDropupRef}>
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
                disabled={actionProcessing}
                className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-xl"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomPopup
        isOpen={Boolean(errorPopup)}
        title={errorPopup?.title || ''}
        message={errorPopup?.message || ''}
        onConfirm={() => setErrorPopup(null)}
      />

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

export default function ClanFeed() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">클랜 피드를 로드하는 중...</div>}>
      <ClanFeedContent />
    </Suspense>
  );
}
