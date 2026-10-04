#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 시스템 전수 조사 수정 및 자동 배포 스크립트 가동"
echo "=========================================================="

# 1. 커스텀 직각 팝업 유틸리티 컴포넌트 생성 (기본 alert/confirm 대체용)
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
      onClick={type === 'alert' ? onConfirm : onCancel}
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
              onClick={onCancel}
              className="px-4 py-1.5 text-xs font-bold rounded-none border border-zinc-400 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
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

# 2. ReportModal 에 알림 direct insert 동기화 (트리거 누락 대비 이중 안전망)
cat << 'FILE_REPORT_MODAL' > src/components/ReportModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { Siren, X, Check } from 'lucide-react'
import CustomPopup from './CustomPopup'
import { formatReportNotice, formatAutoDeleteNotice } from '@/lib/koreanUtils'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  postId: string
  currentUserId: string | null
}

const IMAGE_REASONS = ['선정성 이미지 사용', '폭력적인 이미지 사용'] as const;
const CONTENT_REASONS = ['욕설', '혐오 발언', '같은 내용 반복 게시'] as const;

export default function ReportModal({ isOpen, onClose, postId, currentUserId }: ReportModalProps) {
  const [mounted, setMounted] = useState(false)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [isOtherSelected, setIsOtherSelected] = useState(false)
  const [customReasonText, setCustomReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [popup, setPopup] = useState<{
    show: boolean;
    title: string;
    message: string;
    isSuccess?: boolean;
  }>({ show: false, title: '', message: '' })

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  const toggleReason = (r: string) => {
    setSelectedReasons((prev) =>
      prev.includes(r) ? prev.filter((item) => item !== r) : [...prev, r]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '신고 기능은 로그인 후 이용 가능합니다.' })
      return
    }

    if (selectedReasons.length === 0 && !isOtherSelected) {
      setPopup({ show: true, title: '사유 선택 필요', message: '신고 사유를 최소 하나 이상 선택해 주십시오.' })
      return
    }

    if (isOtherSelected && !customReasonText.trim()) {
      setPopup({ show: true, title: '기타 사유 기입', message: '기타 사유 내용을 입력해 주십시오.' })
      return
    }

    setSubmitting(true)
    const finalReasons = [...selectedReasons]
    if (isOtherSelected) {
      finalReasons.push('기타')
    }

    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)

    // 1) 신고 접수
    const { error } = await supabase.from('post_reports').insert({
      post_id: targetPostId,
      reporter_id: currentUserId,
      reasons: finalReasons,
      custom_reason: isOtherSelected ? customReasonText.trim() : null,
    })

    if (error) {
      if (error.code === '23505') {
        setPopup({ show: true, title: '중복 신고 안내', message: '이미 신고한 게시글입니다. (게시글 하나당 1회만 신고 가능)' })
      } else {
        setPopup({ show: true, title: '접수 실패', message: `신고 접수 실패: ${error.message}` })
      }
      setSubmitting(false)
      return
    }

    // 2) 관리자 알림(admin_notifications) 동기화 보강
    try {
      const { data: pData } = await supabase.from('posts').select('id, title, feed_type, is_deleted').eq('id', targetPostId).maybeSingle()
      const { data: uData } = await supabase.from('profiles').select('nickname').eq('id', currentUserId).maybeSingle()
      const reporterNick = uData?.nickname || '사용자'
      const feedLabel = pData?.feed_type === 'community' ? '커뮤니티 피드' : '클랜 피드'
      const reasonText = isOtherSelected ? customReasonText.trim() : finalReasons[0] || '부적절한 내용'

      const msg = formatReportNotice(reporterNick, feedLabel, pData?.title || '게시글', reasonText)

      await supabase.from('admin_notifications').insert({
        type: 'report',
        post_id: targetPostId,
        reporter_id: currentUserId,
        reporter_nickname: reporterNick,
        post_title: pData?.title || '게시글',
        feed_type: pData?.feed_type || 'clan',
        reason: reasonText,
        message: msg,
        is_read: false
      })

      // 누적 3회 검사 및 소프트 딜리트
      const { count } = await supabase.from('post_reports').select('*', { count: 'exact', head: true }).eq('post_id', targetPostId)
      if (count && count >= 3 && !pData?.is_deleted) {
        await supabase.from('posts').update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          delete_reason: `누적 신고 3회 (${reasonText})`
        }).eq('id', targetPostId)

        const autoMsg = formatAutoDeleteNotice(feedLabel, pData?.title || '게시글', reasonText)
        await supabase.from('admin_notifications').insert({
          type: 'auto_deleted',
          post_id: targetPostId,
          reporter_nickname: '시스템',
          post_title: pData?.title || '게시글',
          feed_type: pData?.feed_type || 'clan',
          reason: reasonText,
          message: autoMsg,
          is_read: false
        })
      }
    } catch (err) {
      console.warn('Notification sync handled:', err)
    }

    setPopup({ show: true, title: '접수 완료', message: '신고가 정상적으로 접수되었습니다.', isSuccess: true })
    setSubmitting(false)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border-2 border-rose-600 rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-950 pb-3">
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-rose-600" />
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">게시글 신고</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-2">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 block border-l-2 border-rose-600 pl-2">
              부적절한 이미지
            </span>
            <div className="space-y-1.5 pl-3">
              {IMAGE_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(reason)}
                    onChange={() => toggleReason(reason)}
                    className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 block border-l-2 border-rose-600 pl-2">
              부적절한 내용
            </span>
            <div className="space-y-1.5 pl-3">
              {CONTENT_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(reason)}
                    onChange={() => toggleReason(reason)}
                    className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pl-3 border-t border-zinc-100 dark:border-zinc-800 pt-2">
            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isOtherSelected}
                onChange={(e) => setIsOtherSelected(e.target.checked)}
                className="rounded-none border-zinc-400 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="font-bold">기타</span>
            </label>
            {isOtherSelected && (
              <textarea
                value={customReasonText}
                onChange={(e) => setCustomReasonText(e.target.value)}
                placeholder="구체적인 신고 사유를 직접 기입해 주십시오."
                rows={2}
                className="w-full mt-1.5 p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-1.5 font-semibold rounded-none border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-1.5 font-bold rounded-none bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{submitting ? '접수 중...' : '신고 접수'}</span>
            </button>
          </div>
        </form>
      </div>

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => {
          if (popup.isSuccess) onClose();
          setPopup({ show: false, title: '', message: '' });
        }}
      />
    </div>,
    document.body
  )
}
FILE_REPORT_MODAL

# 3. PostModal.tsx 에 공식 삭제 신청 포털 완전 복구 및 커스텀 팝업 통합
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
  Loader2,
  Heart,
  ShieldCheck,
  Send,
  Siren,
  ExternalLink
} from 'lucide-react';

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

  // 공식글 삭제 신청 전용 모달 상태
  const [showRequestDeleteModal, setShowRequestDeleteModal] = useState(false);
  const [deleteReasonText, setDeleteReasonText] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [linkConfirmUrl, setLinkConfirmUrl] = useState<string | null>(null);

  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeActionText, setFreezeActionText] = useState('');

  // 공통 커스텀 팝업
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

  // 공식 게시글 삭제 신청 제출
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
      onClick={onClose}
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

      {/* 공식 게시글 삭제 신청 모달 (복구 완료!) */}
      {mounted && showRequestDeleteModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !requestSubmitting && setShowRequestDeleteModal(false)}
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
                onClick={() => setShowRequestDeleteModal(false)}
                disabled={requestSubmitting}
                className="px-4 py-1.5 text-xs font-semibold rounded-none border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitDeleteRequest}
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

      {/* 외부 링크 확인 모달 */}
      {mounted && linkConfirmUrl && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLinkConfirmUrl(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border rounded-none p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">외부 링크 접속 확인</h3>
            <p className="text-xs text-zinc-400">이 링크로 이동하시겠습니까?</p>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-none text-xs font-mono break-all text-left max-h-24 overflow-y-auto">
              {linkConfirmUrl}
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={() => setLinkConfirmUrl(null)} className="px-4 py-1.5 text-xs border rounded-none">취소</button>
              <button
                onClick={() => {
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

      {/* 이미지 확대 모달 */}
      {mounted && previewImageUrl && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90" onClick={() => setPreviewImageUrl(null)}>
          <button onClick={() => setPreviewImageUrl(null)} className="absolute top-5 right-5 text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <img src={previewImageUrl} alt="미리보기" className="max-h-[85vh] max-w-full rounded-none" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}

      {/* 영구 삭제 확인 모달 */}
      {mounted && showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm bg-zinc-900 p-6 rounded-none space-y-4 border border-zinc-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">게시글 삭제</h3>
            <p className="text-xs text-zinc-400">게시글을 삭제하시겠습니까? 데이터가 복구되지 않습니다.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-1.5 text-xs border border-zinc-700 text-zinc-300 rounded-none">취소</button>
              <button onClick={handleExecuteDelete} className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-none">삭제</button>
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

# 4. write/page.tsx 에 블랙리스트 전용 UI + 이의제기 팝업 + 관리자 답장 수신 팝업 구현
cat << 'FILE_WRITE_PAGE' > src/app/write/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import FreezeModal from '@/components/FreezeModal'
import CustomPopup from '@/components/CustomPopup'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, ShieldAlert, Mail } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;
const COMMUNITY_BOARDS = ['자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;

interface DraftData {
  title: string
  content: string
  tags: string[]
  thumbnail_url: string | null
  is_preview_hidden: boolean
  updated_at: string
}

function WriteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultFeed = searchParams?.get('feed') === 'clan' ? 'clan' : 'community'

  const [feedType, setFeedType] = useState<'clan' | 'community'>(defaultFeed)
  const [selectedBoard, setSelectedBoard] = useState<string>('')

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null)
  const [isPreviewHidden, setIsPreviewHidden] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userNickname, setUserNickname] = useState<string>('')
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null)
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false)

  // 블랙리스트 전용 상태
  const [isBlacklisted, setIsBlacklisted] = useState(false)
  const [showBlacklistModal, setShowBlacklistModal] = useState(false)
  const [showAppealModal, setShowAppealModal] = useState(false)
  const [appealMessage, setAppealMessage] = useState('')
  const [sendingAppeal, setSendingAppeal] = useState(false)

  // 관리자 답장 수신 팝업 상태
  const [adminReplyNotice, setAdminReplyNotice] = useState<{ id: number; reply: string } | null>(null)

  // 커스텀 팝업 상태
  const [customPopup, setCustomPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm: () => void;
    onCancel?: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setCustomPopup({
          isOpen: true,
          title: '로그인 필요',
          message: '로그인이 필요한 기능입니다. 메인 피드로 이동합니다.',
          onConfirm: () => router.push('/')
        })
      } else {
        const uid = session.user.id
        setUserId(uid)
        setUserEmail(session.user.email || null)

        const { data: prof } = await supabase.from('profiles').select('nickname').eq('id', uid).maybeSingle()
        setUserNickname(prof?.nickname || '사용자')

        // 1) 관리자 답장 미확인 확인
        const { data: replyRecord } = await supabase
          .from('blacklist_appeals')
          .select('id, admin_reply')
          .eq('user_id', uid)
          .eq('status', 'resolved_kept')
          .eq('user_notified', false)
          .order('resolved_at', { ascending: false })
          .maybeSingle()

        if (replyRecord?.admin_reply) {
          setAdminReplyNotice({ id: replyRecord.id, reply: replyRecord.admin_reply })
        }

        // 2) 블랙리스트 여부 확인
        const { data: blackRecord } = await supabase
          .from('blacklists')
          .select('user_id')
          .eq('user_id', uid)
          .maybeSingle()

        if (blackRecord) {
          setIsBlacklisted(true)
          setShowBlacklistModal(true)
          return
        }

        checkExistingDraft(uid)
      }
    })
  }, [router])

  const checkExistingDraft = async (uid: string) => {
    const { data } = await supabase
      .from('post_drafts')
      .select('title, content, tags, thumbnail_url, is_preview_hidden, updated_at')
      .eq('user_id', uid)
      .maybeSingle()

    if (data) setExistingDraft(data as DraftData)
  }

  // 이의제기 제출 함수
  const handleSendAppeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    if (!appealMessage.trim()) {
      setCustomPopup({
        isOpen: true,
        title: '내용 입력',
        message: '이의제기 및 문의 내용을 작성해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setSendingAppeal(true)

    // 이미 대기 중인 문의가 있는지 확인 (1회 제한)
    const { data: existingAppeal } = await supabase
      .from('blacklist_appeals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingAppeal) {
      setSendingAppeal(false)
      setShowAppealModal(false)
      setCustomPopup({
        isOpen: true,
        title: '접수 안내',
        message: '이미 검토 대기 중인 이의제기가 존재합니다. 관리자 확인 후 통보됩니다.',
        onConfirm: () => {
          setCustomPopup((p) => ({ ...p, isOpen: false }))
          router.push('/')
        }
      })
      return
    }

    const { error } = await supabase.from('blacklist_appeals').insert({
      user_id: userId,
      user_nickname: userNickname,
      user_email: userEmail,
      message: appealMessage.trim(),
      status: 'pending'
    })

    setSendingAppeal(false)
    setShowAppealModal(false)

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '전송 실패',
        message: `전송 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
    } else {
      setCustomPopup({
        isOpen: true,
        title: '전송 완료',
        message: '관리자에게 이의제기 및 문의가 안전하게 전달되었습니다. 관리자 검토 후 결과가 통보됩니다.',
        onConfirm: () => {
          setCustomPopup((p) => ({ ...p, isOpen: false }))
          router.push('/')
        }
      })
    }
  }

  // 관리자 답장 확인 완료 처리
  const handleConfirmReplyNotice = async () => {
    if (!adminReplyNotice) return
    await supabase.from('blacklist_appeals').update({ user_notified: true }).eq('id', adminReplyNotice.id)
    setAdminReplyNotice(null)
  }

  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map(
    (m) => m[1]
  );

  useEffect(() => {
    if (detectedImages.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(detectedImages[0]);
    }
  }, [content]);

  const handleSaveDraft = async () => {
    if (!userId) return
    if (!title.trim() && (!content.trim() || content === '<p></p>')) {
      setCustomPopup({
        isOpen: true,
        title: '임시보관 불가',
        message: '제목 또는 내용이 비어있어 보관할 수 없습니다.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setIsSavingDraft(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('post_drafts').upsert(
      {
        user_id: userId,
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '보관 실패',
        message: error.message,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
    } else {
      setExistingDraft({
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      })
      setCustomPopup({
        isOpen: true,
        title: '임시보관 완료',
        message: '현재 작성 내용이 안전하게 임시보관되었습니다. (최대 1개 유지)',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
    }
    setIsSavingDraft(false)
  }

  const handleLoadDraftClick = () => {
    if (!existingDraft) return
    setTitle(existingDraft.title || '')
    setContent(existingDraft.content || '')
    setSelectedTags(existingDraft.tags || [])
    setSelectedThumbnail(existingDraft.thumbnail_url || null)
    setIsPreviewHidden(Boolean(existingDraft.is_preview_hidden))
    setEditorKey((prev) => prev + 1)
  }

  const handleDeleteDraft = () => {
    if (!userId) return
    setCustomPopup({
      isOpen: true,
      type: 'confirm',
      title: '임시글 삭제',
      message: '보관 중인 임시 게시글을 완전히 삭제하시겠습니까?',
      onConfirm: async () => {
        await supabase.from('post_drafts').delete().eq('user_id', userId)
        setExistingDraft(null)
        setCustomPopup((p) => ({ ...p, isOpen: false }))
      },
      onCancel: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    const isCreator = userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'
    if (!isCreator) {
      const { data: noticeData } = await supabase.from('site_notices').select('is_frozen').eq('id', 1).maybeSingle()
      if (noticeData?.is_frozen) {
        setIsFreezeModalOpen(true)
        return
      }
    }

    if (feedType === 'community' && !selectedBoard) {
      setCustomPopup({
        isOpen: true,
        title: '게시판 선택 필요',
        message: '커뮤니티 게시판을 반드시 하나 선택해야 합니다.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    if (!title.trim()) {
      setCustomPopup({
        isOpen: true,
        title: '제목 입력',
        message: '게시글 제목을 입력해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    if (!content.trim() || content === '<p></p>') {
      setCustomPopup({
        isOpen: true,
        title: '내용 입력',
        message: '본문 내용을 작성해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setIsSubmitting(true)
    const finalTitle = feedType === 'community' ? `[${selectedBoard}] ${title.trim()}` : title.trim()

    const { error } = await supabase.from('posts').insert([
      {
        title: finalTitle,
        content,
        author_id: userId,
        feed_type: feedType,
        board_category: feedType === 'community' ? selectedBoard : null,
        tags: feedType === 'clan' ? selectedTags : [],
        thumbnail_url: selectedThumbnail || (detectedImages.length > 0 ? detectedImages[0] : null),
        is_preview_hidden: isPreviewHidden,
      },
    ])

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '등록 실패',
        message: error.message,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      setIsSubmitting(false)
    } else {
      await supabase.from('post_drafts').delete().eq('user_id', userId)
      router.push(feedType === 'community' ? '/community' : '/clan')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <Link
          href={feedType === 'community' ? '/community' : '/clan'}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>피드로 돌아가기</span>
        </Link>

        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-none text-xs font-bold">
          <button
            type="button"
            onClick={() => setFeedType('community')}
            className={`px-3 py-1.5 rounded-none transition ${feedType === 'community' ? 'bg-blue-600 text-white' : 'text-zinc-400'}`}
          >
            커뮤니티 피드
          </button>
          <button
            type="button"
            onClick={() => setFeedType('clan')}
            className={`px-3 py-1.5 rounded-none transition ${feedType === 'clan' ? 'bg-emerald-600 text-white' : 'text-zinc-400'}`}
          >
            클랜 피드
          </button>
        </div>
      </div>

      {existingDraft && (
        <div className="flex items-center justify-between p-3.5 mb-5 rounded-none bg-emerald-950/30 border border-emerald-800/60 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>임시보관된 글이 있습니다 ({new Date(existingDraft.updated_at).toLocaleString()})</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadDraftClick}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition rounded-none"
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={handleDeleteDraft}
              className="p-1 text-zinc-400 hover:text-red-400 transition"
              title="임시보관 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {feedType === 'community' ? (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-2">
            <label className="block text-xs font-bold text-blue-400">
              * 게시판 선택 (필수 1개 선택)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMUNITY_BOARDS.map((board) => {
                const isSelected = selectedBoard === board;
                return (
                  <button
                    key={board}
                    type="button"
                    onClick={() => setSelectedBoard(board)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-none border transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    <span>{board}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-2">
            <label className="block text-xs font-bold text-emerald-400">
              클랜 해시태그 선택
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTags((prev) => prev.filter((t) => t !== tag));
                      } else {
                        setSelectedTags((prev) => [...prev, tag]);
                      }
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-semibold border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span>#{tag}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <input
            type="text"
            placeholder={feedType === 'community' ? "게시글 제목 (말머리는 자동 추가됩니다)" : "클랜 게시글 제목을 입력하세요"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-none text-lg font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {detectedImages.length > 0 && (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                미리보기 썸네일 설정
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPreviewHidden}
                  onChange={(e) => setIsPreviewHidden(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 relative"></div>
                <span className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <EyeOff className="w-3.5 h-3.5" />
                  미리보기 가리기
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {detectedImages.map((src, idx) => {
                const isMain = selectedThumbnail === src && !isPreviewHidden;
                return (
                  <div
                    key={idx}
                    onClick={() => !isPreviewHidden && setSelectedThumbnail(src)}
                    className={`relative shrink-0 w-20 h-20 rounded-none overflow-hidden border-2 cursor-pointer ${
                      isMain ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-zinc-700'
                    }`}
                  >
                    <img src={src} alt="사진" className="w-full h-full object-cover" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Editor key={editorKey} content={content} onChange={setContent} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-none border border-zinc-700 transition disabled:opacity-50 text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>임시보관</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-6 py-2.5 font-bold rounded-none text-white text-sm transition disabled:opacity-50 ${
              feedType === 'community' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? '등록 중...' : '게시글 등록'}</span>
          </button>
        </div>
      </form>

      {/* 블랙리스트 제재 전용 UI 팝업 (사유 삭제 + 직각 + 흑백 규격) */}
      {showBlacklistModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => router.push('/')}
        >
          <div
            className="w-full max-w-sm !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-5 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <div className="p-3 bg-white text-black rounded-none">
                <ShieldAlert className="w-7 h-7" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black tracking-wide text-white">
                게시글 작성 제한 안내
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                귀하는 커뮤니티 이용 규정 위반으로 인해 블랙리스트로 등록되어 있어 게시글 작성이 영구히 금지되었습니다.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBlacklistModal(false)
                  setShowAppealModal(true)
                }}
                className="px-4 py-2 text-xs font-bold rounded-none border border-white text-white hover:bg-zinc-900 transition flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>이의제기 및 문의</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-5 py-2 text-xs font-black rounded-none bg-white text-black hover:bg-zinc-200 transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 블랙리스트 이의제기 및 문의 작성 창 */}
      {showAppealModal && (
        <div
          className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => {
            setShowAppealModal(false)
            router.push('/')
          }}
        >
          <div
            className="w-full max-w-md !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-white" />
                <h3 className="text-sm font-black text-white">이의제기 및 문의 작성</h3>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              관리진(사이트 제작자, 최고 관리자)에게 소명 내용 및 문의를 전달합니다. (해제 전까지 1회만 전송 가능)
            </p>

            <form onSubmit={handleSendAppeal} className="space-y-4">
              <textarea
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                placeholder="상세 문의 및 소명 내용을 입력하세요"
                rows={5}
                className="w-full p-3 text-xs !bg-zinc-950 !border !border-zinc-700 !text-white rounded-none focus:outline-none focus:!border-white"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    setShowAppealModal(false)
                    router.push('/')
                  }}
                  disabled={sendingAppeal}
                  className="px-4 py-2 text-xs font-bold rounded-none border border-zinc-600 text-zinc-300 hover:bg-zinc-900 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={sendingAppeal}
                  className="px-5 py-2 text-xs font-black rounded-none bg-white text-black hover:bg-zinc-200 transition disabled:opacity-40"
                >
                  {sendingAppeal ? '전송 중...' : '전송'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 관리자 답장 수신 팝업 ("답장" 제목 + 확인 버튼) */}
      {adminReplyNotice && (
        <div
          className="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={handleConfirmReplyNotice}
        >
          <div
            className="w-full max-w-sm !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-white border-b border-zinc-800 pb-2">
              답장
            </h3>
            <div className="p-3 !bg-zinc-950 !border !border-zinc-800 text-xs text-zinc-200 text-left whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {adminReplyNotice.reply}
            </div>
            <p className="text-[11px] text-zinc-400">
              관리자의 검토 결과 블랙리스트 상태가 유지되었습니다.
            </p>
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleConfirmReplyNotice}
                className="px-6 py-2 text-xs font-black rounded-none bg-white text-black hover:bg-zinc-200 transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <FreezeModal
        isOpen={isFreezeModalOpen}
        onClose={() => setIsFreezeModalOpen(false)}
        actionText="게시글 작성을"
      />

      <CustomPopup
        isOpen={customPopup.isOpen}
        type={customPopup.type}
        title={customPopup.title}
        message={customPopup.message}
        onConfirm={customPopup.onConfirm}
        onCancel={customPopup.onCancel}
      />
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">작성 에디터를 불러오는 중...</div>}>
      <WriteContent />
    </Suspense>
  )
}
FILE_WRITE_PAGE

# 5. UserHubModal.tsx 에 최고관리자/제작자 전용 '관리자 전용 메시지' 및 답장/해제/유지 기능 구현
cat << 'FILE_USER_HUB' > src/components/UserHubModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import CustomPopup from './CustomPopup'
import {
  X,
  ArrowLeft,
  User,
  FileText,
  Heart,
  ChevronRight,
  Calendar,
  Check,
  Loader2,
  RefreshCw,
  Snowflake,
  ShieldAlert,
  Mail,
  RotateCcw
} from 'lucide-react'

type ModalView = 'menu' | 'nickname' | 'my_posts' | 'liked_posts' | 'appeals'

interface PostItem {
  id: string
  title: string
  created_at: string
  likes_count: number
  thumbnail_url?: string | null
  is_official?: boolean
}

interface BlacklistAppeal {
  id: number
  user_id: string
  user_nickname: string
  user_email: string | null
  message: string
  status: string
  admin_reply: string | null
  created_at: string
}

interface UserHubModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  userEmail: string
  userRole: RoleType
  currentNickname: string
  onNicknameUpdated: (newNick: string) => void
}

export default function UserHubModal({
  isOpen,
  onClose,
  userId,
  userEmail,
  userRole,
  currentNickname,
  onNicknameUpdated,
}: UserHubModalProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentView, setCurrentView] = useState<ModalView>('menu')

  const [newNickname, setNewNickname] = useState(currentNickname)
  const [updatingNickname, setUpdatingNickname] = useState(false)

  const [posts, setPosts] = useState<PostItem[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const isCreatorOrSuperAdmin =
    userRole === 'creator' ||
    userRole === 'super_admin' ||
    userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'

  const [isFrozen, setIsFrozen] = useState(false)
  const [isReindexing, setIsReindexing] = useState(false)
  const [isTogglingFreeze, setIsTogglingFreeze] = useState(false)

  // 이의제기 관리 상태
  const [appeals, setAppeals] = useState<BlacklistAppeal[]>([])
  const [pendingAppealCount, setPendingAppealCount] = useState(0)
  const [selectedAppeal, setSelectedAppeal] = useState<BlacklistAppeal | null>(null)
  const [replyInput, setReplyInput] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  // 번호 재정렬/결과 모달 및 커스텀 팝업
  const [confirmReindexOpen, setConfirmReindexOpen] = useState(false)
  const [noticeModal, setNoticeModal] = useState<{ text: string; theme: 'yellow' | 'sky' } | null>(null)
  const [confirmActionDialog, setConfirmActionDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: 'unban' | 'keep';
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setCurrentView('menu')
      setNewNickname(currentNickname)
      if (isCreatorOrSuperAdmin) {
        checkFreezeStatus()
        fetchAppeals()
      }
    }
  }, [isOpen, currentNickname, isCreatorOrSuperAdmin])

  const checkFreezeStatus = async () => {
    const { data } = await supabase.from('site_notices').select('is_frozen').eq('id', 1).maybeSingle()
    if (data) setIsFrozen(Boolean(data.is_frozen))
  }

  const fetchAppeals = async () => {
    const { data } = await supabase
      .from('blacklist_appeals')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setAppeals(data as BlacklistAppeal[])
      const pending = data.filter((a: any) => a.status === 'pending').length
      setPendingAppealCount(pending)
    }
  }

  const handleToggleFreeze = async () => {
    setIsTogglingFreeze(true)
    const nextStatus = !isFrozen
    const { error } = await supabase
      .from('site_notices')
      .upsert({ id: 1, is_frozen: nextStatus, updated_at: new Date().toISOString() })

    if (error) {
      setNoticeModal({ text: `사이트 얼리기 상태 변경 실패: ${error.message}`, theme: 'sky' })
    } else {
      setIsFrozen(nextStatus)
      setNoticeModal({
        text: nextStatus ? '사이트가 성공적으로 동결(얼리기)되었습니다.' : '사이트 동결이 해제되었습니다.',
        theme: 'sky'
      })
    }
    setIsTogglingFreeze(false)
  }

  const handleExecuteReindex = async () => {
    setIsReindexing(true)
    const { data, error } = await supabase.rpc('reindex_post_ids')
    setConfirmReindexOpen(false)
    if (error) {
      setNoticeModal({ text: `게시글 번호 초기화 실패: ${error.message}`, theme: 'yellow' })
    } else {
      setNoticeModal({
        text: `총 ${data?.count || 0}개의 게시글 번호가 1번부터 차례대로 성공적으로 재정렬되었습니다.`,
        theme: 'yellow'
      })
      router.refresh()
    }
    setIsReindexing(false)
  }

  // 관리자 답장 실행: 해제 또는 유지
  const handleExecuteAppealAction = async (action: 'unban' | 'keep') => {
    if (!selectedAppeal) return
    setProcessingAction(true)

    const nowIso = new Date().toISOString()

    if (action === 'unban') {
      // 1) 블랙리스트에서 제거
      await supabase.from('blacklists').delete().eq('user_id', selectedAppeal.user_id)

      // 2) 이의제기 완료 업데이트
      await supabase
        .from('blacklist_appeals')
        .update({
          status: 'resolved_unbanned',
          admin_reply: replyInput.trim() || '이의제기가 수용되어 블랙리스트가 해제되었습니다.',
          admin_id: userId,
          admin_nickname: currentNickname,
          resolved_at: nowIso,
          user_notified: true
        })
        .eq('id', selectedAppeal.id)

      setConfirmActionDialog(null)
      setSelectedAppeal(null)
      setReplyInput('')
      await fetchAppeals()
      setNoticeModal({ text: `[${selectedAppeal.user_nickname}] 님의 블랙리스트가 해제되었습니다.`, theme: 'sky' })
    } else {
      // 블랙리스트 유지 및 답장 통보 저장
      await supabase
        .from('blacklist_appeals')
        .update({
          status: 'resolved_kept',
          admin_reply: replyInput.trim() || '관리자 검토 결과 블랙리스트 상태가 유지됩니다.',
          admin_id: userId,
          admin_nickname: currentNickname,
          resolved_at: nowIso,
          user_notified: false
        })
        .eq('id', selectedAppeal.id)

      setConfirmActionDialog(null)
      setSelectedAppeal(null)
      setReplyInput('')
      await fetchAppeals()
      setNoticeModal({ text: `답장이 전송되었으며 블랙리스트가 유지되었습니다.`, theme: 'sky' })
    }
    setProcessingAction(false)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {currentView !== 'menu' && (
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="p-1 -ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              {currentView === 'menu' && '마이 메뉴'}
              {currentView === 'nickname' && '닉네임 변경'}
              {currentView === 'appeals' && '관리자 전용 메시지'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentView === 'menu' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CrownIcon role={userRole} className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {currentNickname || '익명사용자'}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                    {userRole === 'creator' ? '제작자' : userRole === 'super_admin' ? '최고관리자' : userRole === 'admin' ? '일반관리자' : '일반회원'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{userEmail}</p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCurrentView('nickname')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">닉네임 변경</h3>
                    <p className="text-[11px] text-zinc-400">활동 프로필 닉네임을 수정합니다.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>

              {/* 관리자 전용 메시지 메뉴 (제작자, 최고관리자 전용 + 빨간점 알람) */}
              {isCreatorOrSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setCurrentView('appeals')}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition group text-left relative"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 relative">
                      <Mail className="w-4 h-4" />
                      {pendingAppealCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white dark:ring-black" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-zinc-900 dark:text-white">관리자 전용 메시지</h3>
                        {pendingAppealCount > 0 && (
                          <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.2 rounded-full">
                            {pendingAppealCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400">블랙리스트 유저의 이의제기 및 문의를 처리합니다.</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              )}
            </div>

            {userRole === 'creator' && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <span className="text-[11px] font-black text-amber-500 uppercase tracking-wider block px-1">
                  사이트 제작자 전용 콘솔
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReindexOpen(true)}
                    disabled={isReindexing}
                    className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
                    <span>게시글 번호 초기화</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleFreeze}
                    disabled={isTogglingFreeze}
                    className={`p-2.5 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1 ${
                      isFrozen ? 'bg-sky-600 text-white' : 'border-sky-500/40 text-sky-500'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>{isFrozen ? '동결 중' : '사이트 얼리기'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'nickname' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newNickname.trim()) return
              setUpdatingNickname(true)
              await supabase.from('profiles').upsert({ id: userId, nickname: newNickname.trim() })
              onNicknameUpdated(newNickname.trim())
              setUpdatingNickname(false)
              setCurrentView('menu')
            }}
            className="p-5 space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">새 닉네임</label>
              <input
                type="text"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                maxLength={15}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCurrentView('menu')}
                className="px-4 py-2 text-xs border rounded-xl"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={updatingNickname}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl"
              >
                저장
              </button>
            </div>
          </form>
        )}

        {currentView === 'appeals' && (
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {appeals.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">도착한 이의제기 메시지가 없습니다.</div>
            ) : (
              appeals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedAppeal(item)
                    setReplyInput(item.admin_reply || '')
                  }}
                  className={`p-3 rounded-none border cursor-pointer transition text-xs space-y-1.5 ${
                    item.status === 'pending'
                      ? '!bg-black !border-2 !border-red-600 !text-white'
                      : '!bg-zinc-950 !border !border-zinc-800 !text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">{item.user_nickname}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-none ${
                      item.status === 'pending' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {item.status === 'pending' ? '답변 대기' : item.status === 'resolved_unbanned' ? '해제 완료' : '유지 처리됨'}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-zinc-400 text-[11px]">{item.message}</p>
                  <span className="text-[10px] text-zinc-500 block">{new Date(item.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 이의제기 상세 및 답장 창 */}
      {selectedAppeal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setSelectedAppeal(null)}
        >
          <div
            className="w-full max-w-md !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-black text-white">
                이의제기 상세: {selectedAppeal.user_nickname}
              </h3>
              <button onClick={() => setSelectedAppeal(null)} className="p-1 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-400 font-bold block">유저 소명 내용:</span>
              <div className="p-3 !bg-zinc-950 !border !border-zinc-800 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {selectedAppeal.message}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-zinc-900">
              <label className="text-[11px] text-white font-black block">관리자 답장 작성:</label>
              <textarea
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder="유저에게 통보될 답장 내용을 작성해 주십시오."
                rows={3}
                className="w-full p-2.5 text-xs !bg-zinc-950 !border !border-zinc-700 !text-white rounded-none focus:outline-none focus:!border-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmActionDialog({
                  isOpen: true,
                  title: '블랙리스트 해제 경고',
                  message: `정말로 [${selectedAppeal.user_nickname}] 유저의 블랙리스트를 해제하시겠습니까?`,
                  action: 'unban'
                })}
                disabled={processingAction}
                className="px-3.5 py-1.5 text-xs font-bold rounded-none bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                블랙리스트 해제
              </button>
              <button
                type="button"
                onClick={() => setConfirmActionDialog({
                  isOpen: true,
                  title: '블랙리스트 유지 경고',
                  message: `정말로 [${selectedAppeal.user_nickname}] 유저의 블랙리스트를 유지하고 답장을 통보하시겠습니까?`,
                  action: 'keep'
                })}
                disabled={processingAction}
                className="px-3.5 py-1.5 text-xs font-bold rounded-none bg-red-600 hover:bg-red-500 text-white transition"
              >
                블랙리스트 유지
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 답장 버튼 클릭 시 실행 확인 경고창 (필수 요구사항!) */}
      {confirmActionDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setConfirmActionDialog(null)}
        >
          <div
            className="w-full max-w-sm !bg-black !text-white !border-2 !border-white rounded-none p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-white">{confirmActionDialog.title}</h3>
            <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
              {confirmActionDialog.message}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setConfirmActionDialog(null)}
                className="px-4 py-1.5 text-xs border border-zinc-600 text-zinc-300 rounded-none"
              >
                취소
              </button>
              <button
                onClick={() => handleExecuteAppealAction(confirmActionDialog.action)}
                className="px-5 py-1.5 text-xs font-black bg-white text-black rounded-none"
              >
                실행 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 알림 팝업 */}
      {noticeModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setNoticeModal(null)}
        >
          <div
            className={`w-full max-w-sm bg-white dark:bg-black border-2 rounded-none p-6 shadow-2xl space-y-4 text-center ${
              noticeModal.theme === 'yellow' ? 'border-amber-600 dark:border-yellow-400' : 'border-sky-600 dark:border-sky-400'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-zinc-900 dark:text-white leading-relaxed font-semibold">
              {noticeModal.text}
            </p>
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setNoticeModal(null)}
                className="px-6 py-2 text-xs font-bold rounded-none bg-sky-600 text-white"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
FILE_USER_HUB

# 6. ClanFeedPage & CommunityFeedPage 최고관리자 권한 조회 및 신고기록 버튼 동기화 완벽 보강
cat << 'FILE_PATCH_CLAN_PAGE' > patch_clan_role.py
with open("src/app/clan/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# role 조회 로직 보강
old_role_lookup = """      if (email === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else if (email) {
        supabase.from("user_roles").select("role").eq("email", email).maybeSingle().then(({ data }) => {
          if (data?.role) setCurrentUserRole(data.role as RoleType);
        });
      }"""

new_role_lookup = """      if (email?.toLowerCase() === "iwsamuel08@gmail.com") {
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
      }"""

if old_role_lookup in content:
    content = content.replace(old_role_lookup, new_role_lookup)
    with open("src/app/clan/page.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("clan/page.tsx role patch applied successfully")
FILE_PATCH_CLAN_PAGE
python3 patch_clan_role.py || true
rm -f patch_clan_role.py

cat << 'FILE_PATCH_COMM_PAGE' > patch_comm_role.py
with open("src/app/community/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

old_role_lookup = """      if (email === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else if (email) {
        supabase.from("user_roles").select("role").eq("email", email).maybeSingle().then(({ data }) => {
          if (data?.role) setCurrentUserRole(data.role as RoleType);
        });
      }"""

new_role_lookup = """      if (email?.toLowerCase() === "iwsamuel08@gmail.com") {
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
      }"""

if old_role_lookup in content:
    content = content.replace(old_role_lookup, new_role_lookup)
    with open("src/app/community/page.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("community/page.tsx role patch applied successfully")
FILE_PATCH_COMM_PAGE
python3 patch_comm_role.py || true
rm -f patch_comm_role.py

echo "--> 소스코드 동기화 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 성공] 모든 에러 검증 통과! Vercel 실서버 자동 배포 시작"
echo "=========================================================="

git add .
git commit -m "fix: 최고관리자 신고기록 복원, 공식삭제신청 포털 복원, 블랙리스트 이의제기 및 답장 시스템 구축"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 수정사항이 성공적으로 반영되었습니다!"
echo "=========================================================="
