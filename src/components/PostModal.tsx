'use client'

import { CrownIcon, RoleType } from "./CrownIcon";
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import ReportModal from './ReportModal';
import FreezeModal from './FreezeModal';
import CommentsSection from './CommentsSection';
import CustomPopup from './CustomPopup';
import { fetchMyRole, fetchRoleMap, isCreatorEmail } from '@/lib/roles';
import { fetchPostByRouteNo, type FeedType } from '@/lib/postRoute';
import { emitPostsChanged } from '@/lib/feedStore';
import { sanitizeDocument, escapeHtml } from '@/lib/sanitizeHtml';
import { getShareableUrl } from '@/lib/authUrl';
import { copyText } from '@/lib/clipboard';
import {
  X,
  Trash2,
  Share2,
  Check,
  AlertTriangle,
  Pencil,
  Heart,
  ShieldCheck,
  Send,
  Siren
} from 'lucide-react';

// 에디터(TipTap)는 용량이 커서 '수정' 버튼을 누를 때만 내려받습니다. (일반 열람 시 로딩 속도 향상)
const loadEditor = () => import('./Editor');
const Editor = dynamic(loadEditor, {
  ssr: false,
  loading: () => (
    <div className="min-h-[260px] border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-center text-xs text-zinc-400">
      에디터를 불러오는 중...
    </div>
  ),
});

interface Post {
  id: number | string;
  post_no?: number | null;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  comments_count?: number;
  is_official?: boolean;
  is_deleted?: boolean;
  delete_requested?: boolean;
  delete_reason?: string | null;
  tags?: string[];
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
  feed_type?: string;
  board_category?: string;
}

interface PostModalProps {
  /** 주소창의 게시글 번호 (피드별 번호 post_no, 없으면 기존 id) */
  postId: string;
  feedType: FeedType;
  onClose: () => void;
  onDeleted?: () => void;
}

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;
const KAKAO_REGEX = /open\.kakao\.com\/[a-zA-Z0-9_\/]+/i;
const DISCORD_REGEX = /(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i;
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

const readEmbedTitleCache = (url: string): string | null => {
  try {
    const key = `embed_title_${url}`;
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeEmbedTitleCache = (url: string, title: string) => {
  try {
    const key = `embed_title_${url}`;
    sessionStorage.setItem(key, title);
    localStorage.setItem(key, title);
  } catch {
    // 저장소 사용 불가(시크릿 모드 등) 시 무시
  }
};

// 본문 렌더링: 보안 정화 후 카톡/디코/유튜브 임베드 변환 (캐시된 이름을 0초 시점에 즉시 주입)
const renderRichContent = (rawHtml: string): string => {
  if (!rawHtml) return '';
  const html = rawHtml.replace(/<p><\/p>/g, '<p>&nbsp;</p>').replace(/<p><br><\/p>/g, '<p>&nbsp;</p>');
  if (typeof window === 'undefined') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // [보안] 스크립트/이벤트 속성/위험 URL 제거 (XSS 로 로그인 세션을 탈취하는 공격 차단)
  sanitizeDocument(doc);

  const walkTextNodes = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      URL_REGEX.lastIndex = 0;
      if (URL_REGEX.test(node.nodeValue)) {
        const parent = node.parentNode;
        if (parent && parent.nodeName !== 'A' && parent.nodeName !== 'SCRIPT' && parent.nodeName !== 'STYLE') {
          const fragment = doc.createDocumentFragment();
          let lastIndex = 0;
          const text = node.nodeValue;
          URL_REGEX.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = URL_REGEX.exec(text)) !== null) {
            if (match.index > lastIndex) fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
            const a = doc.createElement('a');
            a.setAttribute('href', match[0]);
            a.textContent = match[0];
            fragment.appendChild(a);
            lastIndex = match.index + match[0].length;
          }
          if (lastIndex < text.length) fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
          const span = doc.createElement('span');
          span.appendChild(fragment);
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

    // 1. 유튜브
    const ytMatch = href.match(YOUTUBE_REGEX);
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
            loading="lazy"
            allowfullscreen>
          </iframe>
        </div>
      `;
      a.replaceWith(wrapper);
      return;
    }

    // 2. 카카오톡 (0초 시점에 캐시 즉시 참조)
    const kakaoMatch = href.match(KAKAO_REGEX);
    if (kakaoMatch) {
      const cached = readEmbedTitleCache(href);
      const rawTitle = (a.getAttribute('data-embed-title') || cached || a.textContent || '').trim();
      const displayTitle = (!rawTitle || /^https?:\/\//i.test(rawTitle)) ? '카카오톡 오픈채팅방' : rawTitle;

      const bar = doc.createElement('div');
      bar.className = 'my-3 px-4 py-3 sm:py-3.5 bg-[#242111] dark:bg-[#1c190d] border border-[#FEE500]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
      bar.setAttribute('data-embed-url', href);
      bar.setAttribute('data-embed-type', 'kakaotalk');
      bar.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-none bg-[#FEE500] flex items-center justify-center text-[#191919] shrink-0">
            <svg class="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/></svg>
          </div>
          <span class="text-sm sm:text-base font-extrabold text-white truncate embed-title-text group-hover:underline">
            ${escapeHtml(displayTitle)}
          </span>
        </div>
        <button type="button" class="px-4 py-1.5 sm:py-2 bg-[#FEE500] text-[#191919] text-xs sm:text-sm font-black rounded-none shrink-0">입장</button>
      `;
      a.replaceWith(bar);
      return;
    }

    // 3. 디스코드 (0초 시점에 캐시 즉시 참조)
    const discordMatch = href.match(DISCORD_REGEX);
    if (discordMatch) {
      const cached = readEmbedTitleCache(href);
      const rawTitle = (a.getAttribute('data-embed-title') || cached || a.textContent || '').trim();
      const displayTitle = (!rawTitle || /^https?:\/\//i.test(rawTitle)) ? '디스코드 서버' : rawTitle;

      const bar = doc.createElement('div');
      bar.className = 'my-3 px-4 py-3 sm:py-3.5 bg-[#111322] dark:bg-[#0c0d18] border border-[#5865F2]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
      bar.setAttribute('data-embed-url', href);
      bar.setAttribute('data-embed-type', 'discord');
      bar.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-none bg-[#5865F2] flex items-center justify-center text-white shrink-0">
            <svg class="w-4.5 h-4.5 fill-current" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
          </div>
          <span class="text-sm sm:text-base font-extrabold text-white truncate embed-title-text group-hover:underline">
            ${escapeHtml(displayTitle)}
          </span>
        </div>
        <button type="button" class="px-4 py-1.5 sm:py-2 bg-[#5865F2] text-white text-xs sm:text-sm font-black rounded-none shrink-0">참가</button>
      `;
      a.replaceWith(bar);
      return;
    }

    a.className = 'text-blue-500 underline font-semibold cursor-pointer';
  });

  // 폭이 넓은 표가 모바일 화면 밖으로 잘리지 않도록 가로 스크롤 영역으로 감싸기
  doc.querySelectorAll('table').forEach((table) => {
    const parent = table.parentElement;
    if (parent && parent.getAttribute('data-table-scroll') === '1') return;
    const scroller = doc.createElement('div');
    scroller.setAttribute('data-table-scroll', '1');
    scroller.setAttribute('style', 'overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;');
    table.parentNode?.insertBefore(scroller, table);
    scroller.appendChild(table);
  });

  // 본문 이미지는 화면에 보일 때만 내려받기 (모양 변화 없음, 데이터 절약)
  doc.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });

  return doc.body.innerHTML;
};

// 수정 저장 시 카톡/디코 링크의 실제 이름을 data-embed-title 속성으로 HTML 에 영구 각인
const stampEmbedTitles = (html: string): string => {
  if (!html || typeof window === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (!KAKAO_REGEX.test(href) && !DISCORD_REGEX.test(href)) return;
    const cached = readEmbedTitleCache(href);
    if (cached && !/^https?:\/\//i.test(cached) && a.getAttribute('data-embed-title') !== cached) {
      a.setAttribute('data-embed-title', cached);
      changed = true;
    }
  });
  return changed ? doc.body.innerHTML : html;
};

export default function PostModal({ postId, feedType, onClose, onDeleted }: PostModalProps) {
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
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [linkConfirmUrl, setLinkConfirmUrl] = useState<string | null>(null);

  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeActionText, setFreezeActionText] = useState('');

  const isBackdropMouseDownRef = useRef(false);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  const [customPopup, setCustomPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    setMounted(true);
  }, []);

  // 게시글 + 로그인 유저 권한을 함께 불러온 뒤 표시 (관리자 전용 글 노출 판단이 깜빡이지 않도록)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      const uid = user?.id ?? null;
      const email = user?.email ?? null;

      const [postData, role] = await Promise.all([
        fetchPostByRouteNo(feedType, postId),
        uid ? fetchMyRole(uid, email) : Promise.resolve(null as RoleType),
      ]);
      if (cancelled) return;

      setCurrentUserId(uid);
      setCurrentUserEmail(email);
      setCurrentUserRole(role);

      if (postData) {
        setPost(postData as Post);
        setEditTitle(postData.title);
        setEditContent(postData.content);
        setLikesCount(postData.likes_count ?? 0);

        if (uid) {
          const { data: likeRecord } = await supabase
            .from('post_likes')
            .select('post_id')
            .eq('post_id', postData.id)
            .eq('user_id', uid)
            .maybeSingle();
          if (cancelled) return;
          setIsLiked(!!likeRecord);
        } else {
          setIsLiked(false);
        }
      } else {
        setPost(null);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [postId, feedType]);

  useEffect(() => {
    if (!post?.author_id) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("nickname")
      .eq("id", post.author_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.nickname) setAuthorNickname(data.nickname);
        else setAuthorNickname('익명사용자');
      });

    fetchRoleMap().then((map) => {
      if (!cancelled) setAuthorRole(map[post.author_id] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [post?.author_id]);

  // 카카오톡 및 디스코드 실제 이름 비동기 탐색 및 실시간 치환 헬퍼
  const refreshEmbedTitles = useCallback(() => {
    if (!contentContainerRef.current) return;
    const cards = contentContainerRef.current.querySelectorAll<HTMLElement>('[data-embed-url]');
    cards.forEach(async (card) => {
      const url = card.getAttribute('data-embed-url');
      if (!url) return;
      const titleEl = card.querySelector<HTMLElement>('.embed-title-text');
      if (!titleEl) return;

      const cached = readEmbedTitleCache(url);
      if (cached && !/^https?:\/\//i.test(cached)) {
        titleEl.textContent = cached;
        return;
      }

      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.title && !/^https?:\/\//i.test(data.title)) {
            titleEl.textContent = data.title;
            writeEmbedTitleCache(url, data.title);
          }
        }
      } catch (e) {
        console.warn('Embed preview fetch error:', e);
      }
    });
  }, []);

  // 본문 HTML 변환은 글 내용이 바뀔 때만 1회 수행 (좋아요/복사 등 다른 상태 변경 시 재계산 X)
  const renderedContent = useMemo(() => (post && mounted ? renderRichContent(post.content) : ''), [post, mounted]);

  // post 로딩 완료 후 및 수정 완료 후 DOM 렌더링 타이밍을 확실히 보장하여 실행
  useEffect(() => {
    if (!post || loading || isEditing || !renderedContent) return;
    // requestAnimationFrame 2회로 React 19의 실제 DOM 커밋 시점을 보장
    let innerId = 0;
    const animId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        refreshEmbedTitles();
      });
    });
    return () => {
      cancelAnimationFrame(animId);
      cancelAnimationFrame(innerId);
    };
  }, [post, loading, isEditing, renderedContent, refreshEmbedTitles]);

  const isCreator = currentUserRole === 'creator' || isCreatorEmail(currentUserEmail);

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

  const handleToggleLike = async () => {
    if (!currentUserId) {
      setCustomPopup({
        isOpen: true,
        title: '로그인 필요',
        message: '좋아요 기능은 로그인이 필요합니다.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
      return;
    }
    if (!post) return;
    if (await checkFrozen('좋아요를')) return;
    if (likeLoading) return;
    setLikeLoading(true);

    const prevLiked = isLiked;
    const prevCount = likesCount;
    const nextCount = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;

    setIsLiked(!prevLiked);
    setLikesCount(nextCount);

    const { error } = prevLiked
      ? await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', currentUserId)
      : await supabase.from('post_likes').insert({ post_id: post.id, user_id: currentUserId });

    if (error) {
      // 실패 시 화면 숫자 원상복구
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
    } else {
      emitPostsChanged({ kind: 'patch', id: post.id, patch: { likes_count: nextCount } });
    }
    setLikeLoading(false);
  };

  const handleToggleOfficial = async () => {
    if (!post) return;
    const nextStatus = !post.is_official;
    const { error } = await supabase.from('posts').update({ is_official: nextStatus }).eq('id', post.id);
    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '오류',
        message: `공식 상태 변경 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
    } else {
      setPost({ ...post, is_official: nextStatus });
      emitPostsChanged({ kind: 'patch', id: post.id, patch: { is_official: nextStatus } });
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
      .eq('id', post.id);

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '신청 실패',
        message: `신청 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
      setRequestSubmitting(false);
    } else {
      setShowRequestDeleteModal(false);
      setRequestSubmitting(false);
      setCustomPopup({
        isOpen: true,
        title: '삭제 신청 접수',
        message: '관리자에게 삭제 신청이 접수되었습니다. 검토 전까지 비공개 상태로 전환됩니다.',
        onConfirm: () => {
          setCustomPopup((p) => ({ ...p, isOpen: false }));
          emitPostsChanged({ kind: 'refresh' });
          onClose();
          if (onDeleted) onDeleted();
        }
      });
    }
  };

  // 수정 저장 시 링크 타이틀을 HTML에 영구 각인하여 DB에 저장
  const handleSaveEdit = async () => {
    if (!post) return;
    if (await checkFrozen('게시글 수정을')) return;
    if (!editTitle.trim()) {
      setCustomPopup({
        isOpen: true,
        title: '제목 입력',
        message: '게시글 제목을 입력해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
      return;
    }
    if (!editContent.trim() || editContent === '<p></p>') {
      setCustomPopup({
        isOpen: true,
        title: '내용 입력',
        message: '본문 내용을 작성해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
      return;
    }

    setSaving(true);

    // 본문 내 카카오/디코 링크에 대해 캐시된 실제 이름을 data-embed-title 속성으로 영구 주입
    const processedContent = stampEmbedTitles(editContent);

    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: processedContent,
      })
      .eq('id', post.id);

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '수정 실패',
        message: `수정 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
      setSaving(false);
    } else {
      setPost((prev) => (prev ? { ...prev, title: editTitle.trim(), content: processedContent } : null));
      setIsEditing(false);
      setSaving(false);
      emitPostsChanged({ kind: 'refresh' });
      if (onDeleted) onDeleted();
    }
  };

  const handleExecuteDelete = async () => {
    if (!post) return;
    if (await checkFrozen('게시글 삭제를')) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '삭제 실패',
        message: error.message,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
    } else {
      setShowDeleteConfirm(false);
      emitPostsChanged({ kind: 'remove', id: post.id });
      onClose();
      if (onDeleted) onDeleted();
    }
  };

  const handleShare = async () => {
    // [보안] 주소창의 쿼리/해시(로그인 토큰 등)를 제외한 깨끗한 게시글 주소만 복사
    const ok = await copyText(getShareableUrl());
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCustomPopup({
        isOpen: true,
        title: '공유 주소',
        message: `아래 주소를 길게 눌러 복사해 주세요.\n\n${getShareableUrl()}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
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

  const isAuthor = Boolean(currentUserId && post && currentUserId === post.author_id);
  const isAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin';

  // 신고 누적으로 삭제된 글 / 삭제 신청(비공개) 글은 관리자와 작성자만 열람
  const isHiddenForViewer = Boolean(
    post && !isAdmin && (post.is_deleted || (post.delete_requested && !isAuthor))
  );
  const visiblePost = isHiddenForViewer ? null : post;

  const canForceManage = Boolean((() => {
    if (!post || !currentUserRole || isAuthor) return false;
    if (currentUserRole === 'creator') return true;
    if (authorRole === 'creator') return false;
    if (currentUserRole === 'super_admin') return authorRole !== 'super_admin';
    if (currentUserRole === 'admin') return !authorRole;
    return false;
  })());

  const canManage = isAuthor || canForceManage;

  // 수정 권한이 있으면 에디터 코드를 미리 받아 두어 '수정' 클릭 시 바로 열리게 함
  useEffect(() => {
    if (canManage) loadEditor();
  }, [canManage]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/60 backdrop-blur-sm p-2.5 sm:p-6 sm:py-8 flex justify-center items-start"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) isBackdropMouseDownRef.current = true;
        else isBackdropMouseDownRef.current = false;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropMouseDownRef.current) {
          onClose();
        }
        isBackdropMouseDownRef.current = false;
      }}
    >
      <div
        className="relative w-full max-w-3xl my-auto sm:my-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden pb-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {!isEditing ? (
              <>
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
                  <span>{copied ? '복사됨' : '공유'}</span>
                </button>

                {visiblePost?.feed_type === 'clan' && isAdmin && (
                  <button
                    onClick={handleToggleOfficial}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg border border-emerald-500/40 text-emerald-500"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{visiblePost.is_official ? '공식 해제' : '공식 지정'}</span>
                  </button>
                )}

                {visiblePost && canManage && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-500 border border-emerald-500/30 rounded-lg"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{isAuthor ? '수정' : '강제 수정'}</span>
                    </button>

                    {visiblePost.feed_type === 'clan' && visiblePost.is_official && isAuthor && !isAdmin ? (
                      <button
                        onClick={() => setShowRequestDeleteModal(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-amber-500 border border-amber-500/30 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제 신청</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-red-500 border border-red-500/30 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs sm:text-sm font-bold"
                >
                  {saving ? '저장 중...' : '수정 완료'}
                </button>
                <button
                  onClick={() => {
                    // 취소 시 수정하던 내용을 원래 글로 되돌림 (다시 '수정'을 눌렀을 때 이전 편집 내용이 남아 있던 문제 방지)
                    if (post) {
                      setEditTitle(post.title);
                      setEditContent(post.content);
                    }
                    setIsEditing(false);
                  }}
                  className="px-4 py-1.5 border rounded-lg text-xs sm:text-sm"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-full shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-4 py-5 sm:px-8 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-zinc-400 font-medium text-sm">게시글 데이터를 불러오는 중...</div>
          ) : !visiblePost ? (
            <div className="py-20 text-center text-zinc-400 font-medium text-sm">삭제되었거나 존재하지 않는 게시글입니다.</div>
          ) : isEditing ? (
            <div className="space-y-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl text-base sm:text-lg font-bold"
              />
              <Editor content={editContent} onChange={setEditContent} minHeight="260px" />
            </div>
          ) : (
            <div className="space-y-5">
              <header className="space-y-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white leading-tight break-words">
                  {visiblePost.feed_type === 'clan' && visiblePost.is_official && (
                    <span className="text-emerald-500 mr-2">[공식]</span>
                  )}
                  {visiblePost.title}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-zinc-400">
                  <span className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200 min-w-0">
                    <CrownIcon role={authorRole} className="w-4 h-4 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span>{new Date(visiblePost.created_at).toLocaleDateString()}</span>
                </div>
              </header>

              <div
                ref={contentContainerRef}
                onClick={handleContentClick}
                className="prose dark:prose-invert max-w-none break-words [contain:paint] text-zinc-800 dark:text-zinc-200 text-sm sm:text-base leading-relaxed [&_img]:rounded-xl [&_img]:my-3 [&_img]:cursor-pointer"
                dangerouslySetInnerHTML={{ __html: renderedContent }}
              />

              <div className="pt-4 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeLoading}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs sm:text-sm transition ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-current text-rose-500' : ''}`} />
                  <span>좋아요 {likesCount}</span>
                </button>
              </div>

              {visiblePost.feed_type === 'community' && (
                <CommentsSection
                  postId={visiblePost.id}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  onCountChange={(count) => emitPostsChanged({ kind: 'patch', id: visiblePost.id, patch: { comments_count: count } })}
                />
              )}
            </div>
          )}
        </div>

        {!isEditing && visiblePost && (
          <div className="absolute bottom-4 right-5 z-20">
            <button
              type="button"
              onClick={async () => {
                if (!currentUserId) {
                  setCustomPopup({
                    isOpen: true,
                    title: '로그인 필요',
                    message: '신고 기능은 로그인 후 이용 가능합니다.',
                    onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
                  });
                  return;
                }
                if (await checkFrozen('신고를')) return;
                setIsReportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-none text-xs sm:text-sm font-bold transition shadow-sm"
            >
              <Siren className="w-4 h-4 stroke-rose-600" />
              <span>신고</span>
            </button>
          </div>
        )}
      </div>

      {mounted && showRequestDeleteModal && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !requestSubmitting) setShowRequestDeleteModal(false);
          }}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 border-2 border-amber-500 rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-none bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">공식 게시글 삭제 신청</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">관리자 승인 후 최종 삭제 처리됩니다.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              공식 게시글은 관리자 승인 절차를 거칩니다. 신청 즉시 일반 사용자에게 비공개 처리되며 관리자 검토 후 삭제가 최종 결정됩니다.
            </p>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                삭제 사유 (선택 사항)
              </label>
              <textarea
                value={deleteReasonText}
                onChange={(e) => setDeleteReasonText(e.target.value)}
                placeholder="삭제 사유를 상세히 입력해 주십시오."
                rows={3}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRequestDeleteModal(false)}
                disabled={requestSubmitting}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-none border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitDeleteRequest}
                disabled={requestSubmitting}
                className="px-5 py-2 text-xs sm:text-sm font-bold rounded-none bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>{requestSubmitting ? '신청 중...' : '신청 전송'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mounted && linkConfirmUrl && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLinkConfirmUrl(null);
          }}
        >
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border rounded-none p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">외부 링크 접속 확인</h3>
            <p className="text-xs text-zinc-400">이 링크로 이동하시겠습니까?</p>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-none text-xs font-mono break-all text-left max-h-24 overflow-y-auto">
              {linkConfirmUrl}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setLinkConfirmUrl(null)} className="px-4 py-2 text-xs border rounded-none">취소</button>
              <button
                onClick={() => {
                  const url = linkConfirmUrl;
                  setLinkConfirmUrl(null);
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-none"
              >
                접속
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mounted && previewImageUrl && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/90"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewImageUrl(null);
          }}
        >
          <button onClick={() => setPreviewImageUrl(null)} className="absolute top-5 right-5 text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <img src={previewImageUrl} alt="미리보기" className="max-h-[85vh] max-w-full rounded-none" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}

      {mounted && showDeleteConfirm && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDeleteConfirm(false);
          }}
        >
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 p-6 rounded-none space-y-4 border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">게시글 삭제</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">게시글을 삭제하시겠습니까? 데이터가 복구되지 않습니다.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-none">취소</button>
              <button onClick={handleExecuteDelete} className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-none">삭제</button>
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

      {post && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          postId={String(post.id)}
          currentUserId={currentUserId}
        />
      )}

      <CustomPopup
        isOpen={customPopup.isOpen}
        title={customPopup.title}
        message={customPopup.message}
        onConfirm={customPopup.onConfirm}
      />
    </div>
  );
}
