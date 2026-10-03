'use client'

import { CrownIcon, RoleType } from "./CrownIcon";
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ReportModal from './ReportModal';
import Editor from './Editor';
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
  FileDown,
  Siren,
  ExternalLink
} from 'lucide-react';

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;

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
}

interface PostModalProps {
  postId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function PostModal({ postId, onClose, onDeleted }: PostModalProps) {
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editThumbnailUrl, setEditThumbnailUrl] = useState<string | null>(null);
  const [editIsPreviewHidden, setEditIsPreviewHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  const [showRequestDeleteModal, setShowRequestDeleteModal] = useState(false);
  const [deleteReasonText, setDeleteReasonText] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [linkConfirmUrl, setLinkConfirmUrl] = useState<string | null>(null);

  const contentContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email;
      if (email === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else if (email) {
        supabase.from("user_roles").select("role").eq("email", email).maybeSingle().then(({ data }) => {
          if (data?.role) setCurrentUserRole(data.role as RoleType);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!post?.author_id) {
      setAuthorRole(null);
      setAuthorNickname("");
      return;
    }

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
      .select("role, user_id, email")
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setAuthorRole(null);
          return;
        }

        const matched = data.find((r: any) => r.user_id === post.author_id);
        if (matched?.role) {
          setAuthorRole(matched.role as RoleType);
        } else {
          setAuthorRole(null);
        }
      });
  }, [post?.author_id]);

  const checkDraft = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('post_drafts')
      .select('title')
      .eq('user_id', currentUserId)
      .maybeSingle();
    setHasDraft(Boolean(data));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (linkConfirmUrl) {
          setLinkConfirmUrl(null);
        } else if (isReportModalOpen) {
          setIsReportModalOpen(false);
        } else if (previewImageUrl) {
          setPreviewImageUrl(null);
        } else if (showRequestDeleteModal) {
          setShowRequestDeleteModal(false);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (isEditing) {
          if (window.confirm('수정을 취소하시겠습니까? 변경 사항은 저장되지 않습니다.')) {
            setIsEditing(false);
          }
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showDeleteConfirm, showRequestDeleteModal, isEditing, previewImageUrl, isReportModalOpen, linkConfirmUrl]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);

      if (postId) {
        fetchPost(uid);
      }
    });
  }, [postId]);

  const fetchPost = async (uid?: string | null) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (!error && data) {
      setPost(data);
      setEditTitle(data.title);
      setEditContent(data.content);
      setEditTags(Array.isArray(data.tags) ? data.tags : []);
      setEditThumbnailUrl(data.thumbnail_url || null);
      setEditIsPreviewHidden(Boolean(data.is_preview_hidden));
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

  // 임베드 카드 메타데이터 비동기 바인딩
  useEffect(() => {
    if (!post?.content || !contentContainerRef.current) return;

    const embedElements = contentContainerRef.current.querySelectorAll<HTMLElement>('[data-embed-url]');
    embedElements.forEach(async (el) => {
      const url = el.getAttribute('data-embed-url');
      const type = el.getAttribute('data-embed-type');
      if (!url) return;

      try {
        const res = await fetch(`/api/embed-metadata?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.title) {
            const titleEl = el.querySelector<HTMLElement>('.embed-title-text');
            if (titleEl) {
              titleEl.textContent = data.title;
            }
          }
        }
      } catch (err) {
        console.error('Metadata resolve error:', err);
      }
    });
  }, [post?.content, isEditing]);

  const handleToggleOfficial = async () => {
    if (!post) return;
    const nextStatus = !post.is_official;
    const { error } = await supabase
      .from('posts')
      .update({ is_official: nextStatus })
      .eq('id', postId);

    if (error) {
      alert(`공식 상태 변경 실패: ${error.message}`);
    } else {
      setPost({ ...post, is_official: nextStatus });
      if (onDeleted) onDeleted();
    }
  };

  const handleSubmitDeleteRequest = async () => {
    if (!post) return;
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

  const handleToggleLike = async () => {
    if (!currentUserId) {
      alert('좋아요 기능은 로그인이 필요합니다.');
      return;
    }
    if (likeLoading) return;
    setLikeLoading(true);

    const prevLiked = isLiked;
    const prevCount = likesCount;

    setIsLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

    const targetPostId: any = isNaN(Number(postId)) ? postId : Number(postId);

    if (prevLiked) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', targetPostId)
        .eq('user_id', currentUserId);

      if (error) {
        setIsLiked(prevLiked);
        setLikesCount(prevCount);
      }
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: targetPostId, user_id: currentUserId });

      if (error) {
        setIsLiked(prevLiked);
        setLikesCount(prevCount);
      }
    }
    setLikeLoading(false);
  };

  useEffect(() => {
    if (isEditing) {
      checkDraft();
    }
  }, [isEditing]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 임베드 카드 액션 버튼 또는 카드 클릭 처리
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

  const handleSaveEditDraft = async () => {
    if (!currentUserId) return;
    if (!editTitle.trim() && !editContent.trim()) {
      alert('제목 또는 내용이 비어있어 보관할 수 없습니다.');
      return;
    }

    setIsSavingDraft(true);
    const { error } = await supabase.from('post_drafts').upsert(
      {
        user_id: currentUserId,
        title: editTitle.trim(),
        content: editContent,
        tags: editTags,
        thumbnail_url: editThumbnailUrl,
        is_preview_hidden: editIsPreviewHidden,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      alert(`임시보관 실패: ${error.message}`);
    } else {
      setHasDraft(true);
      alert('현재 수정 내용이 임시보관되었습니다. (최대 1개 유지)');
    }
    setIsSavingDraft(false);
  };

  const handleLoadEditDraft = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('post_drafts')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (!data) return;
    if (window.confirm('보관된 임시글을 불러오시겠습니까? 현재 편집 중인 내용이 대체됩니다.')) {
      setEditTitle(data.title || '');
      setEditContent(data.content || '');
      setEditTags(data.tags || []);
      setEditThumbnailUrl(data.thumbnail_url || null);
      setEditIsPreviewHidden(Boolean(data.is_preview_hidden));
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return alert('제목을 입력해 주십시오.');
    if (!editContent.trim() || editContent === '<p></p>') return alert('내용을 입력해 주십시오.');

    setSaving(true);
    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: editContent,
        tags: editTags,
        thumbnail_url: editThumbnailUrl,
        is_preview_hidden: editIsPreviewHidden,
      })
      .eq('id', postId);

    if (error) {
      alert(`수정 실패: ${error.message}`);
      setSaving(false);
    } else {
      if (currentUserId) {
        await supabase.from('post_drafts').delete().eq('user_id', currentUserId);
      }
      setPost((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim(),
              content: editContent,
              tags: editTags,
              thumbnail_url: editThumbnailUrl,
              is_preview_hidden: editIsPreviewHidden,
            }
          : null
      );
      setIsEditing(false);
      setSaving(false);
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleExecuteDelete = async () => {
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

  const isAuthor = Boolean(currentUserId && post && currentUserId === post.author_id);
  const canForceManage = Boolean((() => {
    if (!post || isAuthor) return false;
    if (authorRole === 'creator') return false;
    if (authorRole === 'super_admin') return currentUserRole === 'creator';
    if (authorRole === 'admin') return currentUserRole === 'creator' || currentUserRole === 'super_admin';
    return currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin';
  })());
  const canManage = isAuthor || canForceManage;

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

      // 1. 유튜브: 레터박스 및 부가 설명 없이 16:9 순수 플레이어 (나무위키 스타일)
      const ytMatch = href.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
      if (ytMatch) {
        const videoId = ytMatch[1];
        const wrapper = doc.createElement('div');
        wrapper.className = 'my-3 w-full max-w-2xl mx-auto rounded-none overflow-hidden shadow-md bg-black not-prose';
        wrapper.innerHTML = `
          <div class="aspect-video w-full bg-black">
            <iframe src="https://www.youtube.com/embed/${videoId}?rel=0" class="w-full h-full border-0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>
        `;
        a.replaceWith(wrapper);
        return;
      }

      // 2. 카카오톡: 노란색 바 형태 (라운드 스퀘어 배제, 링크 텍스트 미표기)
      const kakaoMatch = href.match(/open\.kakao\.com\/[a-zA-Z0-9_\/]+/i);
      if (kakaoMatch) {
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-3 bg-[#242111] dark:bg-[#1c190d] border border-[#FEE500]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.setAttribute('data-embed-type', 'kakaotalk');
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-none bg-[#FEE500] flex items-center justify-center text-[#191919] shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              카카오톡 오픈채팅
            </span>
          </div>
          <button type="button" class="px-4 py-2 bg-[#FEE500] hover:bg-[#ebd300] text-[#191919] text-xs font-black rounded-none transition shrink-0 whitespace-nowrap">
            채팅방 입장
          </button>
        `;
        a.replaceWith(bar);
        return;
      }

      // 3. 디스코드: 파란색 바 형태 (라운드 스퀘어 배제, 링크 텍스트 미표기)
      const discordMatch = href.match(/(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i);
      if (discordMatch) {
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-3 bg-[#111322] dark:bg-[#0c0d18] border border-[#5865F2]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.setAttribute('data-embed-type', 'discord');
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-none bg-[#5865F2] flex items-center justify-center text-white shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              디스코드 서버 초대
            </span>
          </div>
          <button type="button" class="px-4 py-2 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-black rounded-none transition shrink-0 whitespace-nowrap">
            서버 참가
          </button>
        `;
        a.replaceWith(bar);
        return;
      }

      a.className = 'text-blue-500 dark:text-blue-400 underline font-semibold cursor-pointer hover:text-blue-600 break-all';
    });

    return doc.body.innerHTML;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-6 sm:py-8 flex justify-center items-start animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-auto sm:my-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 pb-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing ? (
              <>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
                  title="게시글 링크 복사"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copied ? '링크 복사됨' : '공유'}</span>
                </button>

                {(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin') && post && (
                  <button
                    onClick={handleToggleOfficial}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                      post.is_official
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{post.is_official ? '공식 해제' : '공식 지정'}</span>
                  </button>
                )}

                {canManage && post && (
                  <>
                    <button
                      onClick={() => {
                        setEditTitle(post?.title || '');
                        setEditContent(post?.content || '');
                        setEditTags(Array.isArray(post?.tags) ? post?.tags : []);
                        setEditThumbnailUrl(post?.thumbnail_url || null);
                        setEditIsPreviewHidden(Boolean(post?.is_preview_hidden));
                        setIsEditing(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-900/50 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{isAuthor ? "수정" : "강제 수정"}</span>
                    </button>

                    {post?.is_official && isAuthor && !canForceManage ? (
                      <button
                        onClick={() => setShowRequestDeleteModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900/50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제 신청</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900/50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isAuthor ? "삭제" : "강제 삭제"}</span>
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                  편집 모드
                </span>

                {hasDraft && (
                  <button
                    type="button"
                    onClick={handleLoadEditDraft}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/60 transition"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">불러오기</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveEditDraft}
                  disabled={isSavingDraft}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition disabled:opacity-50"
                >
                  {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>임시보관</span>
                </button>

                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{saving ? '저장 중...' : '수정 완료'}</span>
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 sm:px-8 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-zinc-400 dark:text-zinc-500">
              내용을 불러오는 중입니다...
            </div>
          ) : !post ? (
            <div className="py-20 text-center text-zinc-500">
              존재하지 않거나 삭제된 게시글입니다.
            </div>
          ) : isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                  제목
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="게시글 제목을 입력하세요"
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                  해시태그 설정 (중복 선택 가능)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_TAGS.map((tag) => {
                    const isSelected = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditTags((prev) => prev.filter((t) => t !== tag));
                          } else {
                            setEditTags((prev) => [...prev, tag]);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <span>#{tag}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                  내용 및 이미지 편집
                </label>
                <Editor content={editContent} onChange={setEditContent} minHeight="240px" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <header className="space-y-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-snug">
                  {post.is_official && (
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2 font-extrabold">
                      [공식]
                    </span>
                  )}
                  {post.title}
                </h2>

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200/80 dark:border-emerald-900/50"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={authorRole} className="w-4 h-4 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
              </header>

              <div
                ref={contentContainerRef}
                onClick={handleContentClick}
                className="prose dark:prose-invert max-w-none break-words break-all whitespace-pre-wrap leading-relaxed text-zinc-800 dark:text-zinc-200 [&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-4 [&_img]:cursor-pointer [&_table]:border-collapse"
                dangerouslySetInnerHTML={{ __html: renderRichContent(post.content) }}
              />

              <div className="pt-6 pb-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeLoading}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50 hover:bg-rose-100'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700'
                  }`}
                >
                  <Heart className={`w-4 h-4 transition-transform ${isLiked ? 'fill-current text-rose-500 scale-110' : 'text-zinc-400'}`} />
                  <span>좋아요 {likesCount}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {!isEditing && post && (
          <div className="absolute bottom-4 right-6 z-20">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-none text-xs font-bold transition shadow-sm"
              title="게시글 신고"
            >
              <Siren className="w-4 h-4 stroke-rose-600" />
              <span>신고</span>
            </button>
          </div>
        )}
      </div>

      {linkConfirmUrl && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setLinkConfirmUrl(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <ExternalLink className="w-6 h-6" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                외부 링크 접속 확인
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                이 링크에 접속하시겠습니까?
              </p>
            </div>

            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs font-mono text-zinc-800 dark:text-zinc-200 break-all max-h-28 overflow-y-auto border border-zinc-200 dark:border-zinc-700 text-left">
              {linkConfirmUrl}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLinkConfirmUrl(null)}
                className="px-5 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = linkConfirmUrl;
                  setLinkConfirmUrl(null);
                  window.open(target, '_blank', 'noopener,noreferrer');
                }}
                className="px-6 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        postId={postId}
        currentUserId={currentUserId}
      />

      {showRequestDeleteModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !requestSubmitting && setShowRequestDeleteModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">공식 게시글 삭제 신청</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">관리자 승인 후 영구 삭제 처리됩니다.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              공식 게시글은 관리자 승인 절차를 거칩니다. 신청 즉시 일반 사용자에게 비공개 처리되며 관리자 검토 후 삭제가 최종 결정됩니다.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                삭제 사유 (선택 사항)
              </label>
              <textarea
                value={deleteReasonText}
                onChange={(e) => setDeleteReasonText(e.target.value)}
                placeholder="삭제 사유를 상세히 입력해 주십시오."
                rows={3}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestDeleteModal(false)}
                disabled={requestSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitDeleteRequest}
                disabled={requestSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{requestSubmitting ? '신청 중...' : '신청 전송'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition z-10"
            title="닫기 (ESC)"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="사진 미리보기"
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">게시글 삭제</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">데이터 영구 제거</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              정말로 이 게시글을 삭제하시겠습니까? 삭제된 게시글은 다시 복구할 수 없습니다.
            </p>
            {deleteError && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50">
                삭제 실패: {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
