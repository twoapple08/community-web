'use client'

import { CrownIcon, RoleType } from "@/components/CrownIcon";
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { MessagesSquare, Calendar, Image as ImageIcon, RotateCw, Heart, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import PostModal from '@/components/PostModal';

type SortType = 'latest' | 'popular' | 'oldest';
type OfficialFilterType = 'all' | 'official' | 'unofficial';

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  author_nickname?: string;
  is_official?: boolean;
  delete_requested?: boolean;
  delete_reason?: string | null;
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

function FeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activePostId = searchParams.get('post');

  const [posts, setPosts] = useState<Post[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, RoleType>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [officialFilter, setOfficialFilter] = useState<OfficialFilterType>('all');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 삭제 신청 승인/거절 확인 팝업 상태
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

    supabase.from("user_roles").select("user_id, role, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, RoleType> = {};
      data.forEach((r: any) => {
        if (r.user_id) map[r.user_id] = r.role;
        if (r.email === "iwsamuel08@gmail.com" && r.user_id) map[r.user_id] = "creator";
      });
      setRolesMap(map);
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

      const formattedPosts: Post[] = postsData.map((post) => ({
        ...post,
        likes_count: post.likes_count ?? 0,
        author_nickname: profileMap[post.author_id] || '작성자',
        is_official: Boolean(post.is_official),
        delete_requested: Boolean(post.delete_requested),
        delete_reason: post.delete_reason || null,
      }));

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

  // 삭제 신청 승인 (영구 삭제)
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

  // 삭제 신청 거절 (공개 복구)
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

  // 게시글 필터링 및 관리자 삭제 신청 최상단 정렬 파이프라인
  const filteredPosts = posts
    .filter((post) => {
      // 삭제 신청 상태의 글은 관리자나 본인 작성자가 아니면 절대 노출하지 않음
      if (post.delete_requested && !isAdmin && post.author_id !== currentUserId) {
        return false;
      }

      if (officialFilter === 'official') return post.is_official;
      if (officialFilter === 'unofficial') return !post.is_official;
      return true;
    })
    .sort((a, b) => {
      // 관리자 화면에서는 삭제 신청 게시글을 무조건 최상단에 우선 배치
      if (isAdmin) {
        if (a.delete_requested && !b.delete_requested) return -1;
        if (!a.delete_requested && b.delete_requested) return 1;
      }
      return 0;
    });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 최상단 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">커뮤니티 피드</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">자유롭게 소통하고 게시글을 공유하세요.</p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="inline-flex self-start sm:self-auto items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition shadow-sm disabled:opacity-50"
          title="피드 새로고침"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          <span>{isRefreshing ? '갱신 중...' : '새로고침'}</span>
        </button>
      </div>

      {/* 탭 필터: [통합 / 공식만 / 비공식만] & [최신 / 인기 / 오래된순] */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        {/* 공식 분류 탭 */}
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-semibold">
          <button
            onClick={() => setOfficialFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              officialFilter === 'all'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            통합
          </button>
          <button
            onClick={() => setOfficialFilter('official')}
            className={`px-3 py-1.5 rounded-lg transition ${
              officialFilter === 'official'
                ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            공식만 보기
          </button>
          <button
            onClick={() => setOfficialFilter('unofficial')}
            className={`px-3 py-1.5 rounded-lg transition ${
              officialFilter === 'unofficial'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            비공식만 보기
          </button>
        </div>

        {/* 정렬 필터 */}
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}
            className={`px-3 py-1.5 rounded-lg transition ${
              sortType === 'latest'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            최신순
          </button>
          <button
            onClick={() => setSortType('popular')}
            className={`px-3 py-1.5 rounded-lg transition ${
              sortType === 'popular'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            인기순
          </button>
          <button
            onClick={() => setSortType('oldest')}
            className={`px-3 py-1.5 rounded-lg transition ${
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
            const thumbnail = extractFirstImage(post.content);
            const plainText = extractPlainText(post.content);
            const imageCount = countImages(post.content);

            return (
              <article
                key={post.id}
                onClick={() => handleOpenPost(post.id)}
                className={`group p-5 sm:p-6 rounded-2xl transition duration-200 shadow-sm dark:shadow-md cursor-pointer select-none relative ${
                  post.delete_requested
                    ? 'bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-400 dark:border-amber-600'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                {/* 삭제 신청 게시글 관리자 전용 배지 */}
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

                <div className="flex items-start justify-between gap-4 sm:gap-6">
                  <div className="flex-1 min-w-0 space-y-2">
                    <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {post.is_official && (
                        <span className="inline-block text-emerald-600 dark:text-emerald-400 mr-1.5 font-extrabold">
                          [공식]
                        </span>
                      )}
                      {post.title}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {plainText || '내용이 없습니다.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-zinc-500 pt-1">
                      <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                        <CrownIcon role={rolesMap[post.author_id]} className="w-4 h-4" />
                        {post.author_nickname}
                      </span>
                      <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
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

                  {thumbnail && (
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800/80">
                      <img
                        src={thumbnail}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>

                {/* 관리자 전용 삭제 신청 심사 바 */}
                {post.delete_requested && isAdmin && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    {/* 좌측 하단 허락 / 거절 버튼 */}
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

                    {/* 우측 하단 삭제 사유 표기 */}
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

      {/* 허락 / 거절 결정 팝업 창 */}
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
