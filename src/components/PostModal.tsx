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
import CustomPopup from './CustomPopup';
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

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  comments_count?: number;
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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      if (user) {
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
      } else {
        setCurrentUserId(null);
        setCurrentUserEmail(null);
        setCurrentUserRole(null);
        if (postId) fetchPost(null);
      }
    });
  }, [postId]);

  const refreshEmbedTitles = () => {
    if (!contentContainerRef.current) return;
    const cards = contentContainerRef.current.querySelectorAll<HTMLElement>('[data-embed-url]');
    cards.forEach(async (card) => {
      const url = card.getAttribute('data-embed-url');
      if (!url) return;
      const titleEl = card.querySelector<HTMLElement>('.embed-title-text');
      if (!titleEl) return;

      const cacheKey = `embed_title_${url}`;
      const cached = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
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
            sessionStorage.setItem(cacheKey, data.title);
            localStorage.setItem(cacheKey, data.title);
          }
        }
      } catch (e) {
        console.warn('Embed preview fetch error:', e);
      }
    });
  };

  useEffect(() => {
    if (!post || loading || isEditing) return;
    const animId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refreshEmbedTitles();
      });
    });
    return () => cancelAnimationFrame(animId);
  }, [post, loading, isEditing]);

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
      } else {
        setIsLiked(false);
      }
    } else {
      setPost(null);
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
        else setAuthorNickname('익명사용자');
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
      setCustomPopup({
        isOpen: true,
        title: '오류',
        message: `공식 상태 변경 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
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
      setCustomPopup({
        isOpen: true,
        title: '신청 실패',
        message: `신청 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
      setRequestSubmitting(false);
    } else {
      setShowRequestDeleteModal(false);
      setCustomPopup({
        isOpen: true,
        title: '삭제 신청 접수',
        message: '관리자에게 삭제 신청이 접수되었습니다. 검토 전까지 비공개 상태로 전환됩니다.',
        onConfirm: () => {
          setCustomPopup((p) => ({ ...p, isOpen: false }));
          onClose();
          if (onDeleted) onDeleted();
          router.refresh();
        }
      });
    }
  };

  const handleSaveEdit = async () => {
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

    let processedContent = editContent;
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    const matches = Array.from(new Set(processedContent.match(urlRegex) || []));
    for (const url of matches) {
      const cacheKey = `embed_title_${url}`;
      const cached = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
      if (cached && !/^https?:\/\//i.test(cached)) {
        processedContent = processedContent.replace(
          new RegExp(`(<a[^>]+href=["']${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*)(>)`, 'gi'),
          `$1 data-embed-title="${cached.replace(/"/g, '&quot;')}"$2`
        );
      }
    }

    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: processedContent,
      })
      .eq('id', postId);

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
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleExecuteDelete = async () => {
    if (await checkFrozen('게시글 삭제를')) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '삭제 실패',
        message: error.message,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      });
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
    if (!html) return '';
    html = html.replace(/<p><\/p>/g, '<p>&nbsp;</p>').replace(/<p><br><\/p>/g, '<p>&nbsp;</p>');
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
        const cached = sessionStorage.getItem(`embed_title_${href}`) || localStorage.getItem(`embed_title_${href}`);
        let rawTitle = (a.getAttribute('data-embed-title') || cached || a.textContent || '').trim();
        let displayTitle = (!rawTitle || /^https?:\/\//i.test(rawTitle)) ? '카카오톡 오픈채팅방' : rawTitle;

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
              ${displayTitle}
            </span>
          </div>
          <button type="button" class="px-4 py-1.5 sm:py-2 bg-[#FEE500] text-[#191919] text-xs sm:text-sm font-black rounded-none shrink-0">입장</button>
        `;
        a.replaceWith(bar);
        return;
      }

      const discordMatch = href.match(/(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i);
      if (discordMatch) {
        const cached = sessionStorage.getItem(`embed_title_${href}`) || localStorage.getItem(`embed_title_${href}`);
        let rawTitle = (a.getAttribute('data-embed-title') || cached || a.textContent || '').trim();
        let displayTitle = (!rawTitle || /^https?:\/\//i.test(rawTitle)) ? '디스코드 서버' : rawTitle;

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
              ${displayTitle}
            </span>
          </div>
          <button type="button" class="px-4 py-1.5 sm:py-2 bg-[#5865F2] text-white text-xs sm:text-sm font-black rounded-none shrink-0">참가</button>
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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-2.5 sm:p-6 sm:py-8 flex justify-center items-start"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
                  <span>{copied ? '복사됨' : '공유'}</span>
                </button>

                {post?.feed_type === 'clan' && isAdmin && (
                  <button
                    onClick={handleToggleOfficial}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg border border-emerald-500/40 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{post.is_official ? '공식 해제' : '공식 지정'}</span>
                  </button>
                )}

                {canManage && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-500 border border-emerald-500/30 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{isAuthor ? '수정' : '강제 수정'}</span>
                    </button>

                    {post?.feed_type === 'clan' && post?.is_official && isAuthor && !isAdmin ? (
                      <button
                        onClick={() => setShowRequestDeleteModal(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-amber-500 border border-amber-500/30 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제 신청</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-bold text-red-500 border border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
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
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs sm:text-sm font-bold transition shadow-sm"
                >
                  {saving ? '저장 중...' : '수정 완료'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs sm:text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-full transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-4 py-5 sm:px-8 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-zinc-400 font-medium text-sm">게시글 데이터를 불러오는 중...</div>
          ) : !post ? (
            <div className="py-20 text-center text-zinc-400 font-medium text-sm">삭제되었거나 존재하지 않는 게시글입니다.</div>
          ) : isEditing ? (
            <div className="space-y-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl text-base sm:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
              <Editor content={editContent} onChange={setEditContent} minHeight="260px" />
            </div>
          ) : (
            <div className="space-y-5">
              <header className="space-y-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                  {post.feed_type === 'clan' && post.is_official && (
                    <span className="text-emerald-500 mr-2">[공식]</span>
                  )}
                  {post.title}
                </h2>
                <div className="flex items-center gap-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={authorRole} className="w-4 h-4 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </header>

              <div
                ref={contentContainerRef}
                onClick={handleContentClick}
                className="prose dark:prose-invert max-w-none break-words text-zinc-800 dark:text-zinc-200 text-sm sm:text-base leading-relaxed [&_img]:rounded-xl [&_img]:my-3 [&_img]:cursor-pointer"
                dangerouslySetInnerHTML={{ __html: renderRichContent(post.content) }}
              />

              <div className="pt-4 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeLoading}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs sm:text-sm transition ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-current text-rose-500' : ''}`} />
                  <span>좋아요 {likesCount}</span>
                </button>
              </div>

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
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">외부 링크 접속 확인</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">이 링크로 이동하시겠습니까?</p>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-none text-xs font-mono break-all text-left max-h-24 overflow-y-auto text-zinc-800 dark:text-zinc-200">
              {linkConfirmUrl}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setLinkConfirmUrl(null)} className="px-4 py-2 text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">취소</button>
              <button
                onClick={() => {
                  const url = linkConfirmUrl;
                  setLinkConfirmUrl(null);
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition"
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
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 p-6 rounded-none space-y-4 border-2 border-zinc-200 dark:border-zinc-800 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">게시글 삭제</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">게시글을 삭제하시겠습니까? 데이터가 복구되지 않습니다.</p>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">취소</button>
              <button onClick={handleExecuteDelete} className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-none transition shadow-sm">삭제</button>
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

      <CustomPopup
        isOpen={customPopup.isOpen}
        title={customPopup.title}
        message={customPopup.message}
        onConfirm={customPopup.onConfirm}
      />
    </div>
  );
}
