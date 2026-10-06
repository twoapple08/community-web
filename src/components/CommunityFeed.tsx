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
  MessageSquare,
  Search,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeftRight,
  Menu,
  Siren,
  Check,
  Video as VideoIcon,
  Eye,
} from 'lucide-react';
import NoticeBanner from '@/components/NoticeBanner';
import FeedMedia from '@/components/FeedMedia';
import VideoThumb from '@/components/VideoThumb';
import { formatViewCount } from '@/lib/postViews';
import AdminReportModal from '@/components/AdminReportModal';
import Avatar from '@/components/Avatar';
import Link from 'next/link';
import { extractFirstImage, extractPlainText, countImages, countVideos, extractFirstVideo, normalizeForSearch } from '@/lib/htmlText';
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
type ViewMode = 'list' | 'feed' | 'album';

const BOARD_CATEGORIES = ['모두', '자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

interface Post {
  id: string;
  post_no?: number | null;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  /** 조회수 – SQL 미적용 시 없음 */
  view_count?: number | null;
  comments_count?: number;
  author_nickname?: string;
  author_role?: RoleType;
  author_avatar?: string | null;
  board_category?: string;
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
  feed_type?: string;
  // 목록 렌더링/검색용으로 미리 계산해 두는 값 (매 렌더링마다 HTML 을 다시 분석하지 않도록)
  _plain: string;
  _thumb: string | null;
  _imageCount: number;
  _videoCount: number;
  _videoSrc: string | null;
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

function CommunityFeedContent() {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>(() => getFeedCache<Post>('community')?.posts ?? []);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isViewModeDropdownOpen, setIsViewModeDropdownOpen] = useState(false);
  const [dropdownAlign, setDropdownAlign] = useState<'left' | 'right'>('right');
  const viewModeDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedBoard, setSelectedBoard] = useState<string>('모두');
  const [isBoardDropdownOpen, setIsBoardDropdownOpen] = useState(false);
  const boardDropdownRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(10);
  const [isPageSizeDropupOpen, setIsPageSizeDropupOpen] = useState(false);
  const pageSizeDropupRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(() => !getFeedCache('community'));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isAdminReportOpen, setIsAdminReportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // 외부 클릭 시 드롭다운 닫기 (보기형식 / 게시판 / 페이지당 개수)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (viewModeDropdownRef.current && !viewModeDropdownRef.current.contains(target)) {
        setIsViewModeDropdownOpen(false);
      }
      if (boardDropdownRef.current && !boardDropdownRef.current.contains(target)) {
        setIsBoardDropdownOpen(false);
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
      .eq('feed_type', 'community')
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

      // posts.comments_count 컬럼(트리거 자동 관리)이 없는 경우에만 댓글 행을 직접 셉니다.
      const needsCommentCount = postsData.length > 0 && postsData[0].comments_count === undefined;
      const commentCountMap: Record<string, number> = {};
      if (needsCommentCount) {
        const { data: commentsCountData } = await supabase
          .from('post_comments')
          .select('post_id')
          .in('post_id', postsData.map((p) => p.id));
        commentsCountData?.forEach((c: { post_id: number | string }) => {
          const pid = String(c.post_id);
          commentCountMap[pid] = (commentCountMap[pid] || 0) + 1;
        });
      }

      const nextPosts: Post[] = postsData.map((post) => {
        const nickname = profileMap[post.author_id] || '작성자';
        const plain = extractPlainText(post.content);
        return {
          ...post,
          likes_count: post.likes_count ?? 0,
          comments_count: post.comments_count !== undefined ? post.comments_count : (commentCountMap[String(post.id)] || 0),
          author_nickname: nickname,
          author_role: roleMap[post.author_id] || null,
          author_avatar: lastKnownAvatars[post.author_id] ?? null,
          thumbnail_url: post.thumbnail_url || null,
          is_preview_hidden: Boolean(post.is_preview_hidden),
          _plain: plain,
          _thumb: post.thumbnail_url || extractFirstImage(post.content),
          _imageCount: countImages(post.content),
          _videoCount: countVideos(post.content),
          _videoSrc: extractFirstVideo(post.content),
          _searchTitle: normalizeForSearch(post.title || ''),
          _searchAuthor: normalizeForSearch(nickname),
          _searchContent: normalizeForSearch(plain),
          _time: new Date(post.created_at).getTime() || 0,
        };
      });

      setPosts(nextPosts);
      setFeedCache('community', nextPosts);

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
            const cached = getFeedCache<Post>('community');
            if (cached) {
              const nextCached = applyAvatars(cached.posts);
              if (nextCached !== cached.posts) setFeedCache('community', nextCached);
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
    const cached = getFeedCache('community');
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

  const sortedPosts = useMemo(() => sortPosts(posts, sortType), [posts, sortType]);

  const filteredPosts = useMemo(() => {
    const q = normalizeForSearch(deferredSearchQuery);

    return sortedPosts.filter((post) => {
      if (selectedBoard !== '모두' && post.board_category !== selectedBoard) {
        return false;
      }

      if (q) {
        if (!post._searchTitle.includes(q) && !post._searchAuthor.includes(q) && !post._searchContent.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [sortedPosts, selectedBoard, deferredSearchQuery]);

  // 검색어/게시판/정렬이 바뀌면 1페이지로 이동 (빈 페이지가 보이던 문제 방지)
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchQuery, selectedBoard, sortType]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPosts = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * postsPerPage;
    return filteredPosts.slice(startIndex, startIndex + postsPerPage);
  }, [filteredPosts, safeCurrentPage, postsPerPage]);

  const openPost = (post: Post) => {
    markOpenedFromFeed();
    router.push(getPostPath({ ...post, feed_type: 'community' }));
  };

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
            className="w-full pl-9 pr-8 py-2 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="relative" ref={boardDropdownRef}>
          <button
            type="button"
            onClick={() => setIsBoardDropdownOpen(!isBoardDropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-none border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 shadow-sm whitespace-nowrap"
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

      {/* 정렬 버튼 그룹 + 바로 왼쪽에 위치한 네이버 카페식 보기방식 드롭다운 */}
      <div className="flex items-center justify-end gap-2 mb-4">
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
              <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="3.5" cy="6" r="1.5" fill="currentColor"/><circle cx="3.5" cy="12" r="1.5" fill="currentColor"/><circle cx="3.5" cy="18" r="1.5" fill="currentColor"/>
              </svg>
            )}
            {viewMode === 'feed' && (
              <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/>
              </svg>
            )}
            {viewMode === 'album' && (
              <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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

      {loading ? (
        <div className="py-20 text-center text-zinc-400">커뮤니티 피드를 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">등록된 커뮤니티 게시글이 없습니다.</p>
        </div>
      ) : (
        <div>
          {/* 1. 목록형 (캡처 1번 이미지: 기존 메인 카드 디자인 - 좌측 내용, 우측 썸네일) */}
          {viewMode === 'list' && (
            <div className="space-y-3.5 w-full">
              {paginatedPosts.map((post) => {
                const thumbnail = post._thumb;
                const imageCount = post._imageCount;
                const videoCount = post._videoCount;

                return (
                  <article
                    key={post.id}
                    onClick={() => openPost(post)}
                    className="group p-3.5 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 transition cursor-pointer select-none shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3 sm:gap-5 w-full">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <h2 className="text-base sm:text-lg md:text-xl font-black text-zinc-900 dark:text-white tracking-tight truncate">
                          {post.title}
                        </h2>

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

                          <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{post.comments_count ?? 0}</span>
                          </span>

                          {typeof post.view_count === 'number' && (
                            <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 font-medium" title="조회수">
                              <Eye className="w-3.5 h-3.5" />
                              <span>{formatViewCount(post.view_count)}</span>
                            </span>
                          )}

                          {imageCount > 1 && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>+{imageCount}</span>
                            </span>
                          )}

                          {videoCount > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-900/50">
                              <VideoIcon className="w-3.5 h-3.5" />
                              <span>{videoCount}</span>
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
                      ) : post._videoSrc ? (
                        <div className="relative w-20 h-20 sm:w-24 sm:h-24 aspect-square shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800">
                          <VideoThumb src={post._videoSrc} />
                        </div>
                      ) : null}
                    </div>
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

                      {post.board_category && post.board_category !== '모두' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/30 shrink-0">
                          {post.board_category}
                        </span>
                      )}
                    </div>

                    {/* 제목 + 본문 앞부분 살짝 미리보기 (피드형에서만, 내용이 있을 때만) */}
                    <div className="space-y-1">
                      <h2 className="text-lg sm:text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                        {post.title}
                      </h2>
                      {post._plain && (
                        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                          {post._plain}
                        </p>
                      )}
                    </div>

                    {/* 세로 1.7배 이상 사진 3:4 자동 크롭 FeedMedia */}
                    {!post.is_preview_hidden && (thumbnail ? (
                      <FeedMedia src={thumbnail} alt={post.title} />
                    ) : post._videoSrc ? (
                      // 사진이 없는 동영상 글: 재생 없이 첫 장면만 미리보기
                      <div className="w-full aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                        <VideoThumb src={post._videoSrc} />
                      </div>
                    ) : null)}

                    {/* 하단 액션 바 (좋아요 + 댓글 수) */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-rose-500 font-bold">
                          <Heart className="w-4 h-4 fill-rose-500/20" />
                          <span>좋아요 {post.likes_count ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-blue-500 font-bold">
                          <MessageSquare className="w-4 h-4" />
                          <span>댓글 {post.comments_count ?? 0}</span>
                        </div>
                      </div>
                      {typeof post.view_count === 'number' && (
                        <span className="flex items-center gap-1.5 font-bold text-zinc-500 dark:text-zinc-400" title="조회수">
                          <Eye className="w-4 h-4" />
                          <span>조회 {formatViewCount(post.view_count)}</span>
                        </span>
                      )}
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
                const videoCount = post._videoCount;

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
                      ) : post._videoSrc ? (
                        <VideoThumb src={post._videoSrc} className="group-hover:scale-105 transition duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
                          <ImageIcon className="w-8 h-8 stroke-1 text-zinc-400" />
                        </div>
                      )}

                      {!post.is_preview_hidden && (imageCount > 1 || videoCount > 0) && (
                        <span className="absolute top-2 right-2 flex items-center gap-1">
                          {imageCount > 1 && (
                            <span className="bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                              +{imageCount}
                            </span>
                          )}
                          {videoCount > 0 && (
                            <span className="flex items-center gap-0.5 bg-orange-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                              <VideoIcon className="w-3 h-3" />
                              {videoCount}
                            </span>
                          )}
                        </span>
                      )}

                      {typeof post.view_count === 'number' && (
                        <span className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm" title="조회수">
                          <Eye className="w-3 h-3" />
                          {formatViewCount(post.view_count)}
                        </span>
                      )}
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5 min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 group-hover:text-blue-500 transition">
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
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-rose-500 font-semibold flex items-center gap-0.5">
                            <Heart className="w-3 h-3 fill-current" /> {post.likes_count ?? 0}
                          </span>
                          <span className="text-blue-500 font-semibold flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" /> {post.comments_count ?? 0}
                          </span>
                        </div>
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

export default function CommunityFeed() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">커뮤니티 피드를 로드하는 중...</div>}>
      <CommunityFeedContent />
    </Suspense>
  );
}
