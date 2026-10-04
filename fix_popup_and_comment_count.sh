#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 팝업 버블링 차단 및 목록 댓글/답글 수 표시 패치"
echo "=========================================================="

# 1. CustomPopup.tsx 이벤트 전파 차단 보강
cat << 'FILE_CUSTOM_POPUP' > src/components/CustomPopup.tsx
'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

interface CustomPopupProps {
  isOpen: boolean
  title: string
  message: string
  type?: 'alert' | 'confirm'
  onConfirm: () => void
  onCancel?: () => void
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
}

export default function CustomPopup({
  isOpen,
  title,
  message,
  type = 'alert',
  onConfirm,
  onCancel,
  confirmText = '확인',
  cancelText = '취소',
  isDanger = false,
}: CustomPopupProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        if (type === 'alert') onConfirm();
        else if (onCancel) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-black border-2 border-zinc-900 dark:border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-semibold whitespace-pre-wrap">
          {message}
        </p>

        <div className="flex items-center justify-center gap-2 pt-2">
          {type === 'confirm' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onCancel) onCancel();
              }}
              className="px-4 py-1.5 text-xs font-bold rounded-none border border-zinc-400 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className={`px-5 py-1.5 text-xs font-black rounded-none transition shadow-sm ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
FILE_CUSTOM_POPUP

# 2. FreezeModal.tsx 이벤트 전파 차단 보강
cat << 'FILE_FREEZE' > src/components/FreezeModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface FreezeModalProps {
  isOpen: boolean
  onClose: () => void
  actionText: string
}

export default function FreezeModal({ isOpen, onClose, actionText }: FreezeModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-black border-2 border-sky-600 dark:border-sky-400 rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5 text-center">
          <p className="text-xs sm:text-sm text-zinc-900 dark:text-white leading-relaxed font-semibold">
            현재 사이트가 중지되어 {actionText} 하실 수 없습니다.
          </p>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-semibold">
            잠시 후 다시 시도해주시길 바랍니다.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-6 py-2 text-xs font-bold rounded-none bg-sky-600 hover:bg-sky-700 dark:bg-sky-400 dark:hover:bg-sky-300 text-white dark:text-black transition shadow-sm cursor-pointer"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
FILE_FREEZE

# 3. PostModal.tsx: e.target === e.currentTarget 가드 및 내부 모달 전파 차단 적용
cat << 'FILE_POST_MODAL' > src/components/PostModal.tsx
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
  Calendar,
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

  const [customPopup, setCustomPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const contentContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      if (!user) {
        setCurrentUserId(null);
        setCurrentUserEmail(null);
        setCurrentUserRole(null);
        return;
      }

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
    });
  }, [postId]);

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
      }
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
    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: editContent,
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
      setPost((prev) => (prev ? { ...prev, title: editTitle.trim(), content: editContent } : null));
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
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-2.5 bg-[#242111] dark:bg-[#1c190d] border border-[#FEE500]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-none bg-[#FEE500] flex items-center justify-center text-[#191919] shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              카카오톡 오픈채팅
            </span>
          </div>
          <button type="button" class="px-3.5 py-1.5 bg-[#FEE500] text-[#191919] text-xs font-black rounded-none">입장</button>
        `;
        a.replaceWith(bar);
        return;
      }

      const discordMatch = href.match(/(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i);
      if (discordMatch) {
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-2.5 bg-[#111322] dark:bg-[#0c0d18] border border-[#5865F2]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-none bg-[#5865F2] flex items-center justify-center text-white shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              디스코드 서버 초대
            </span>
          </div>
          <button type="button" class="px-3.5 py-1.5 bg-[#5865F2] text-white text-xs font-black rounded-none">참가</button>
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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-6 sm:py-8 flex justify-center items-start"
      onClick={(e) => {
        // [핵심 가드] 오직 게시글 오버레이 배경 자체를 직접 클릭했을 때만 닫힘 (팝업 버블링 완벽 차단)
        if (e.target === e.currentTarget) {
          onClose();
        }
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copied ? '복사됨' : '공유'}</span>
                </button>

                {post?.feed_type === 'clan' && isAdmin && (
                  <button
                    onClick={handleToggleOfficial}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-500/40 text-emerald-500"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{post.is_official ? '공식 해제' : '공식 지정'}</span>
                  </button>
                )}

                {canManage && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-500 border border-emerald-500/30 rounded-lg"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{isAuthor ? '수정' : '강제 수정'}</span>
                    </button>

                    {post?.feed_type === 'clan' && post?.is_official && isAuthor && !isAdmin ? (
                      <button
                        onClick={() => setShowRequestDeleteModal(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-500 border border-amber-500/30 rounded-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>삭제 신청</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-500 border border-red-500/30 rounded-lg"
                      >
                        <Trash2 className="w-3 h-3" />
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
                  className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                >
                  {saving ? '저장 중...' : '수정 완료'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 border rounded-lg text-xs"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-8 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-zinc-400">게시글을 불러오는 중...</div>
          ) : !post ? (
            <div className="py-20 text-center text-zinc-400">삭제되었거나 없는 게시글입니다.</div>
          ) : isEditing ? (
            <div className="space-y-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full p-2.5 bg-zinc-800 border border-zinc-700 text-white rounded-xl font-bold"
              />
              <Editor content={editContent} onChange={setEditContent} minHeight="240px" />
            </div>
          ) : (
            <div className="space-y-5">
              <header className="space-y-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white">
                  {post.feed_type === 'clan' && post.is_official && (
                    <span className="text-emerald-500 mr-2">[공식]</span>
                  )}
                  {post.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={authorRole} className="w-3.5 h-3.5 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </header>

              <div
                ref={contentContainerRef}
                onClick={handleContentClick}
                className="prose dark:prose-invert max-w-none break-words whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed [&_img]:rounded-xl [&_img]:my-3 [&_img]:cursor-pointer"
                dangerouslySetInnerHTML={{ __html: renderRichContent(post.content) }}
              />

              <div className="pt-4 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeLoading}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-semibold text-xs transition ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-rose-500' : ''}`} />
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
                if (await checkFrozen('신고를')) return;
                setIsReportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-none text-xs font-bold transition shadow-sm"
            >
              <Siren className="w-3.5 h-3.5 stroke-rose-600" />
              <span>신고</span>
            </button>
          </div>
        )}
      </div>

      {/* 공식 게시글 삭제 신청 모달 (전파 차단 적용) */}
      {mounted && showRequestDeleteModal && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            if (!requestSubmitting) setShowRequestDeleteModal(false);
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

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              공식 게시글은 관리자 승인 절차를 거칩니다. 신청 즉시 일반 사용자에게 비공개 처리되며 관리자 검토 후 삭제가 최종 결정됩니다.
            </p>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                삭제 사유 (선택 사항)
              </label>
              <textarea
                value={deleteReasonText}
                onChange={(e) => setDeleteReasonText(e.target.value)}
                placeholder="삭제 사유를 상세히 입력해 주십시오."
                rows={3}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRequestDeleteModal(false);
                }}
                disabled={requestSubmitting}
                className="px-4 py-1.5 text-xs font-semibold rounded-none border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSubmitDeleteRequest();
                }}
                disabled={requestSubmitting}
                className="px-5 py-1.5 text-xs font-bold rounded-none bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{requestSubmitting ? '신청 중...' : '신청 전송'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 외부 링크 확인 모달 (전파 차단 적용) */}
      {mounted && linkConfirmUrl && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setLinkConfirmUrl(null);
          }}
        >
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border rounded-none p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">외부 링크 접속 확인</h3>
            <p className="text-xs text-zinc-400">이 링크로 이동하시겠습니까?</p>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-none text-xs font-mono break-all text-left max-h-24 overflow-y-auto">
              {linkConfirmUrl}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLinkConfirmUrl(null);
                }}
                className="px-4 py-1.5 text-xs border rounded-none"
              >
                취소
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const url = linkConfirmUrl;
                  setLinkConfirmUrl(null);
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="px-5 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-none"
              >
                접속
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 이미지 확대 모달 (전파 차단 적용) */}
      {mounted && previewImageUrl && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/90"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewImageUrl(null);
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImageUrl(null);
            }}
            className="absolute top-5 right-5 text-white p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <img src={previewImageUrl} alt="미리보기" className="max-h-[85vh] max-w-full rounded-none" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}

      {/* 영구 삭제 확인 모달 (전파 차단 적용) */}
      {mounted && showDeleteConfirm && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(false);
          }}
        >
          <div className="w-full max-w-sm bg-zinc-900 p-6 rounded-none space-y-4 border border-zinc-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">게시글 삭제</h3>
            <p className="text-xs text-zinc-400">게시글을 삭제하시겠습니까? 데이터가 복구되지 않습니다.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-1.5 text-xs border border-zinc-700 text-zinc-300 rounded-none"
              >
                취소
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExecuteDelete();
                }}
                className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-none"
              >
                삭제
              </button>
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
FILE_POST_MODAL

# 4. clan/page.tsx: 목록에서 댓글/답글 수(MessageSquare) 표시 반영
cat << 'FILE_CLAN_PAGE' > src/app/clan/page.tsx
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
  Filter,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  AlertCircle,
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
  comments_count?: number;
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

                      {/* 댓글 및 답글 통합 수 표시 */}
                      <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{post.comments_count ?? 0}</span>
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
FILE_CLAN_PAGE

# 5. community/page.tsx: 목록에서 댓글/답글 수(MessageSquare) 표시 반영
cat << 'FILE_COMM_PAGE' > src/app/community/page.tsx
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
FILE_COMM_PAGE

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: 팝업 여백 클릭 버블링 차단 및 피드 목록 댓글/답글 수 표시 구현"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
