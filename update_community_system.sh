#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 피드 분리 및 신규 시스템 자동 구현 스크립트 가동"
echo "=========================================================="

# 1. 한국어 조사 유틸리티 파일 생성
cat << 'FILE_KOREAN' > src/lib/koreanUtils.ts
export function hasJongseong(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    const lastChar = char.toLowerCase();
    return ['1', '3', '6', '7', '8', '0', 'l', 'm', 'n', 'r'].includes(lastChar);
  }
  return (code - 0xac00) % 28 !== 0;
}

export function isRieulJongseong(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 8;
  }
  return ['l', 'r'].includes(char.toLowerCase());
}

export function getEulReul(word: string): string {
  const clean = (word || '').trim().replace(/['"“”]/g, '');
  const lastChar = clean[clean.length - 1] || '';
  return hasJongseong(lastChar) ? '을' : '를';
}

export function getYiGa(word: string): string {
  const clean = (word || '').trim().replace(/['"“”]/g, '');
  const lastChar = clean[clean.length - 1] || '';
  return hasJongseong(lastChar) ? '이' : '가';
}

export function getEuroRo(word: string): string {
  const clean = (word || '').trim().replace(/['"“”]/g, '');
  const lastChar = clean[clean.length - 1] || '';
  if (!hasJongseong(lastChar) || isRieulJongseong(lastChar)) {
    return '로';
  }
  return '으로';
}

export function formatReportNotice(reporterNick: string, feedLabel: string, postTitle: string, reason: string): string {
  const target = `[${feedLabel} / ${postTitle}]`;
  const eulReul = getEulReul(target);
  const euroRo = getEuroRo(reason);
  return `${reporterNick}님이 ${target}${eulReul} ${reason}${euroRo} 신고하셨습니다.`;
}

export function formatAutoDeleteNotice(feedLabel: string, postTitle: string, reason: string): string {
  const target = `[${feedLabel} / ${postTitle}]`;
  const yiGa = getYiGa(target);
  const euroRo = getEuroRo(reason);
  return `${target}${yiGa} ${reason}${euroRo} 3회 누적 신고가 되어 자동 삭제되었습니다.`;
}
FILE_KOREAN

# 2. 관리자 신고 기록 모달 컴포넌트 생성 (rounded-none, 직각 규격 준수)
cat << 'FILE_ADMIN_REPORT' > src/components/AdminReportModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { Siren, X, Check, Trash2, RotateCcw, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import { formatReportNotice, formatAutoDeleteNotice } from '@/lib/koreanUtils'

interface AdminNotification {
  id: number
  type: 'report' | 'auto_deleted'
  post_id: number | null
  reporter_nickname: string | null
  post_title: string
  feed_type: string
  reason: string
  message: string
  is_read: boolean
  created_at: string
}

interface AdminReportModalProps {
  isOpen: boolean
  onClose: () => void
  onPostRestored?: () => void
}

export default function AdminReportModal({ isOpen, onClose, onPostRestored }: AdminReportModalProps) {
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)

  // 내용 보기(삭제글 복구/영구삭제) 팝업 상태
  const [viewPost, setViewPost] = useState<any | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [actionProcessing, setActionProcessing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen])

  const fetchNotifications = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)

    if (data) {
      setNotifications(data as AdminNotification[])
    }
    setLoading(false)
  }

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return

    await supabase.from('admin_notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const handleOpenPostContent = async (postId: number | null) => {
    if (!postId) return
    setViewLoading(true)
    const { data } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle()
    if (data) {
      setViewPost(data)
    } else {
      alert('게시글을 찾을 수 없거나 이미 영구 삭제되었습니다.')
    }
    setViewLoading(false)
  }

  const handleRestorePost = async (postId: number) => {
    if (!confirm('해당 게시글을 복구하시겠습니까? 피드에 다시 정상 노출됩니다.')) return
    setActionProcessing(true)
    const { error } = await supabase
      .from('posts')
      .update({ is_deleted: false, deleted_at: null, delete_reason: null })
      .eq('id', postId)

    if (error) {
      alert(`복구 실패: ${error.message}`)
    } else {
      alert('게시글이 성공적으로 복구되었습니다.')
      setViewPost(null)
      if (onPostRestored) onPostRestored()
      fetchNotifications()
    }
    setActionProcessing(false)
  }

  const handlePermanentDelete = async (postId: number) => {
    if (!confirm('게시글을 영구 삭제하시겠습니까? 데이터베이스에서 완전히 삭제되며 복구할 수 없습니다.')) return
    setActionProcessing(true)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      alert(`영구 삭제 실패: ${error.message}`)
    } else {
      alert('게시글이 영구 삭제되었습니다.')
      setViewPost(null)
      if (onPostRestored) onPostRestored()
      fetchNotifications()
    }
    setActionProcessing(false)
  }

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-black border-2 border-red-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-red-200 dark:border-red-950 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-red-600 text-white rounded-none">
              <Siren className="w-4 h-4" />
            </div>
            <h3 className="text-base font-black text-zinc-900 dark:text-white">
              신고 및 제재 기록 (관리진 전용)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="px-2.5 py-1 text-[11px] font-bold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-none transition"
            >
              모두 읽음
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white rounded-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-400">알림 기록을 불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-semibold">
              접수된 신고 및 삭제 알림이 없습니다.
            </div>
          ) : (
            notifications.map((item) => {
              const feedLabel = item.feed_type === 'community' ? '커뮤니티 피드' : '클랜 피드'
              const formattedMsg =
                item.type === 'auto_deleted'
                  ? formatAutoDeleteNotice(feedLabel, item.post_title, item.reason)
                  : formatReportNotice(item.reporter_nickname || '익명사용자', feedLabel, item.post_title, item.reason)

              return (
                <div
                  key={item.id}
                  className={`p-3 border rounded-none transition text-xs space-y-2 ${
                    item.type === 'auto_deleted'
                      ? 'border-red-500/80 bg-red-50/50 dark:bg-red-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                  } ${!item.is_read ? 'ring-1 ring-red-500' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-none ${
                        item.type === 'auto_deleted'
                          ? 'bg-red-600 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {item.type === 'auto_deleted' ? '3회 누적 자동 삭제' : '신고 접수'}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed break-words">
                    {formattedMsg}
                  </p>

                  {item.type === 'auto_deleted' && item.post_id && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleOpenPostContent(item.post_id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white rounded-none transition shadow-sm"
                      >
                        <Eye className="w-3 h-3" />
                        <span>내용보기</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 내용보기 및 복구/영구삭제 서브 모달 */}
      {viewPost && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setViewPost(null)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-zinc-950 border-2 border-red-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-black text-zinc-900 dark:text-white">
                  삭제된 게시글 상세 심사
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewPost(null)}
                className="p-1 text-zinc-400 hover:text-white rounded-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 block">
                삭제 사유: {viewPost.delete_reason || '사유 미입력'}
              </span>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white break-words">
                {viewPost.title}
              </h2>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm leading-relaxed max-h-72 overflow-y-auto rounded-none prose dark:prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: viewPost.content }} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => handleRestorePost(viewPost.id)}
                disabled={actionProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>복구</span>
              </button>
              <button
                type="button"
                onClick={() => handlePermanentDelete(viewPost.id)}
                disabled={actionProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-none transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>영구 삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
FILE_ADMIN_REPORT

# 3. 댓글 컴포넌트 생성 (1/4 이미지 크기, 좋아요 엄지척, 최신/인기순)
cat << 'FILE_COMMENTS' > src/components/CommentsSection.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import { ThumbsUp, ImageIcon, Trash2, Send, Loader2, X } from 'lucide-react'

interface CommentItem {
  id: number
  post_id: number
  author_id: string
  content: string
  image_url: string | null
  likes_count: number
  created_at: string
  author_nickname?: string
  author_role?: RoleType
  user_liked?: boolean
}

interface CommentsSectionProps {
  postId: string | number
  currentUserId: string | null
  currentUserRole: RoleType
}

export default function CommentsSection({ postId, currentUserId, currentUserRole }: CommentsSectionProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sortType, setSortType] = useState<'latest' | 'popular'>('latest')

  const [inputContent, setInputContent] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchComments()
  }, [postId, sortType])

  const fetchComments = async () => {
    setLoading(true)
    const targetId = isNaN(Number(postId)) ? postId : Number(postId)

    const query = supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', targetId)

    const { data: commentsData } =
      sortType === 'popular'
        ? await query.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
        : await query.order('created_at', { ascending: true })

    if (commentsData && commentsData.length > 0) {
      const authorIds = Array.from(new Set(commentsData.map((c) => c.author_id)))
      const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', authorIds)
      const profileMap: Record<string, string> = {}
      profiles?.forEach((p) => {
        profileMap[p.id] = p.nickname
      })

      const { data: roles } = await supabase.from('user_roles').select('user_id, email, role')
      const roleMap: Record<string, RoleType> = {}
      roles?.forEach((r) => {
        if (r.user_id) roleMap[r.user_id] = r.role
        if (r.email === 'iwsamuel08@gmail.com' && r.user_id) roleMap[r.user_id] = 'creator'
      })

      let userLikesSet = new Set<number>()
      if (currentUserId) {
        const commentIds = commentsData.map((c) => c.id)
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .in('comment_id', commentIds)
          .eq('user_id', currentUserId)

        likes?.forEach((l) => userLikesSet.add(l.comment_id))
      }

      setComments(
        commentsData.map((c) => ({
          ...c,
          author_nickname: profileMap[c.author_id] || '익명사용자',
          author_role: roleMap[c.author_id] || null,
          user_liked: userLikesSet.has(c.id),
        }))
      )
    } else {
      setComments([])
    }
    setLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    const fileExt = file.name.split('.').pop() || 'png'
    const fileName = `comment-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    try {
      const { error } = await supabase.storage.from('comment-images').upload(fileName, file)
      if (!error) {
        const { data } = supabase.storage.from('comment-images').getPublicUrl(fileName)
        if (data?.publicUrl) {
          setAttachedImage(data.publicUrl)
        }
      } else {
        const reader = new FileReader()
        reader.onload = () => setAttachedImage(reader.result as string)
        reader.readAsDataURL(file)
      }
    } catch {
      const reader = new FileReader()
      reader.onload = () => setAttachedImage(reader.result as string)
      reader.readAsDataURL(file)
    }
    setUploadingImage(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      alert('댓글 작성을 위해 먼저 로그인해 주십시오.')
      return
    }
    if (!inputContent.trim() && !attachedImage) {
      alert('댓글 내용 또는 이미지를 첨부해 주십시오.')
      return
    }

    setSubmitting(true)
    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)

    const { error } = await supabase.from('post_comments').insert({
      post_id: targetPostId,
      author_id: currentUserId,
      content: inputContent.trim(),
      image_url: attachedImage,
      likes_count: 0,
    })

    if (error) {
      alert(`댓글 등록 실패: ${error.message}`)
    } else {
      setInputContent('')
      setAttachedImage(null)
      fetchComments()
    }
    setSubmitting(false)
  }

  const handleToggleCommentLike = async (comment: CommentItem) => {
    if (!currentUserId) {
      alert('좋아요 기능은 로그인이 필요합니다.')
      return
    }

    const prevLiked = Boolean(comment.user_liked)
    const newLikesCount = prevLiked ? Math.max(0, comment.likes_count - 1) : comment.likes_count + 1

    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, user_liked: !prevLiked, likes_count: newLikesCount } : c))
    )

    if (prevLiked) {
      await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      await supabase.from('post_comments').update({ likes_count: newLikesCount }).eq('id', comment.id)
    } else {
      await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: currentUserId })
      await supabase.from('post_comments').update({ likes_count: newLikesCount }).eq('id', comment.id)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (error) {
      alert(`댓글 삭제 실패: ${error.message}`)
    } else {
      fetchComments()
    }
  }

  return (
    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          댓글 ({comments.length})
        </h3>
        <div className="flex items-center gap-1 text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-none border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setSortType('latest')}
            className={`px-2 py-0.5 rounded-none transition ${
              sortType === 'latest' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-400'
            }`}
          >
            최신순
          </button>
          <button
            type="button"
            onClick={() => setSortType('popular')}
            className={`px-2 py-0.5 rounded-none transition ${
              sortType === 'popular' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-400'
            }`}
          >
            인기순
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmitComment} className="space-y-2">
        <div className="relative">
          <textarea
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            placeholder="댓글을 작성해 보세요 (이미지 및 GIF 첨부 가능)"
            rows={2}
            className="w-full p-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {attachedImage && (
          <div className="relative inline-block border border-zinc-300 dark:border-zinc-700">
            <img src={attachedImage} alt="첨부" className="w-20 h-20 object-cover" />
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-none transition"
          >
            {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
            <span>사진/GIF</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? '등록 중...' : '등록'}</span>
          </button>
        </div>
      </form>

      <div className="space-y-3 pt-2">
        {loading ? (
          <div className="py-6 text-center text-xs text-zinc-400">댓글을 불러오는 중...</div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-400">첫 댓글을 남겨보세요!</div>
        ) : (
          comments.map((comment) => {
            const isCommentAuthor = currentUserId && currentUserId === comment.author_id
            const canDelete =
              isCommentAuthor ||
              currentUserRole === 'creator' ||
              currentUserRole === 'super_admin' ||
              currentUserRole === 'admin'

            return (
              <div
                key={comment.id}
                className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={comment.author_role} className="w-3.5 h-3.5 shrink-0" />
                    <span>{comment.author_nickname}</span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-zinc-400 hover:text-red-500 transition"
                      title="댓글 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {comment.content && (
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                    {comment.content}
                  </p>
                )}

                {/* 1/4 사이즈 이미지 렌더링 규격 적용 */}
                {comment.image_url && (
                  <div className="pt-1">
                    <img
                      src={comment.image_url}
                      alt="댓글 첨부 이미지"
                      className="w-1/4 max-w-[140px] sm:max-w-[170px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                      onClick={() => window.open(comment.image_url || '', '_blank')}
                      title="클릭하여 원본 보기"
                    />
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleCommentLike(comment)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[11px] font-bold border transition ${
                      comment.user_liked
                        ? 'bg-blue-50 text-blue-600 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <ThumbsUp className={`w-3 h-3 ${comment.user_liked ? 'fill-current' : ''}`} />
                    <span>{comment.likes_count}</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
FILE_COMMENTS

# 4. 루트(/) 접속 시 /community 로 자동 리다이렉트
cat << 'FILE_ROOT_PAGE' > src/app/page.tsx
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/community')
}
FILE_ROOT_PAGE

# 5. 클랜 피드 페이지 (/clan)
mkdir -p src/app/clan
cat << 'FILE_CLAN_PAGE' > src/app/clan/page.tsx
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
  Search,
  Filter,
  EyeOff,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Megaphone,
  Pencil,
  ArrowLeftRight,
  Siren
} from 'lucide-react';
import PostModal from '@/components/PostModal';
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
  author_nickname?: string;
  author_role?: RoleType;
  is_official?: boolean;
  tags?: string[];
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
  feed_type?: string;
}

export default function ClanFeedPage() {
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

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [postsPerPage, setPostsPerPage] = useState<number>(10);
  const [isPageSizeDropupOpen, setIsPageSizeDropupOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 최고관리자 및 제작자 전용 신고 기록 상태
  const [isAdminReportOpen, setIsAdminReportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isCreatorOrSuperAdmin =
    currentUserRole === 'creator' || currentUserRole === 'super_admin';

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

    fetchPosts();
    checkUnreadReports();
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

      setPosts(
        postsData.map((post) => ({
          ...post,
          likes_count: post.likes_count ?? 0,
          author_nickname: profileMap[post.author_id] || '작성자',
          author_role: roleMap[post.author_id] || null,
          is_official: Boolean(post.is_official),
          tags: Array.isArray(post.tags) ? post.tags : [],
        }))
      );
    }
    setLoading(false);
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.replace(/\s+/g, '').toLowerCase();

    return posts.filter((post) => {
      if (officialFilter === 'official' && !post.is_official) return false;
      if (officialFilter === 'unofficial' && post.is_official) return false;

      if (selectedFilterTags.length > 0) {
        const postTags = post.tags || [];
        if (!selectedFilterTags.some((t) => postTags.includes(t))) return false;
      }

      if (q) {
        const titleMatch = (post.title || '').replace(/\s+/g, '').toLowerCase().includes(q);
        const authorMatch = (post.author_nickname || '').replace(/\s+/g, '').toLowerCase().includes(q);
        if (!titleMatch && !authorMatch) return false;
      }

      return true;
    });
  }, [posts, officialFilter, selectedFilterTags, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * postsPerPage;
    return filteredPosts.slice(startIndex, startIndex + postsPerPage);
  }, [filteredPosts, currentPage, postsPerPage]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col min-w-0">
      {/* 교체 버튼 및 헤더 */}
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
          {/* 최고관리자 및 제작자 전용 신고 기록 버튼 */}
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

      <hr className="border-zinc-200 dark:border-zinc-800 mb-4" />

      {/* 검색 및 필터 바 */}
      <div className="flex items-center gap-2 mb-3.5 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성자 검색"
            className="w-full pl-9 pr-8 py-2 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsFilterModalOpen(true)}
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

      {/* 공식/비공식 탭 및 정렬 탭 */}
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
        </div>
      </div>

      {/* 게시글 목록 */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400">클랜 피드를 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">등록된 클랜 게시글이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {paginatedPosts.map((post) => (
            <article
              key={post.id}
              onClick={() => router.push(`/clan/${post.id}`)}
              className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                    {post.is_official && <span className="text-emerald-500 mr-1.5">[공식]</span>}
                    {post.title}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-zinc-400 pt-1">
                    <span className="flex items-center gap-1">
                      <CrownIcon role={post.author_role} className="w-3.5 h-3.5 shrink-0" />
                      <span>{post.author_nickname}</span>
                    </span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    <span className="text-rose-500 flex items-center gap-1">
                      <Heart className="w-3 h-3 fill-current" />
                      {post.likes_count}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          ))}
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
                const isSelected = selectedFilterTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedFilterTags((prev) => prev.filter((t) => t !== tag));
                      } else {
                        setSelectedFilterTags((prev) => [...prev, tag]);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-xl"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 신고 기록 모달 */}
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
FILE_CLAN_PAGE

# 6. 클랜 상세 모달 라우트 (/clan/[id])
mkdir -p src/app/clan/'[id]'
cat << 'FILE_CLAN_DETAIL' > src/app/clan/'[id]'/page.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import ClanFeedPage from '../page'
import PostModal from '@/components/PostModal'

export default function ClanPostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  return (
    <>
      <ClanFeedPage />
      {id && (
        <PostModal
          postId={id}
          onClose={() => router.push('/clan')}
        />
      )}
    </>
  )
}
FILE_CLAN_DETAIL

# 7. 커뮤니티 피드 페이지 (/community)
mkdir -p src/app/community
cat << 'FILE_COMMUNITY_PAGE' > src/app/community/page.tsx
'use client'

import { CrownIcon, RoleType } from "@/components/CrownIcon";
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  RotateCw,
  Heart,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Menu,
  Siren,
  Check
} from 'lucide-react';
import AdminReportModal from '@/components/AdminReportModal';
import Link from 'next/link';

type SortType = 'latest' | 'popular' | 'oldest';
const BOARD_CATEGORIES = ['모두', '자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  author_nickname?: string;
  author_role?: RoleType;
  board_category?: string;
}

export default function CommunityFeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);

  const [sortType, setSortType] = useState<SortType>('latest');
  const [selectedBoard, setSelectedBoard] = useState<string>('모두');
  const [isBoardDropdownOpen, setIsBoardDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 최고관리자 및 제작자 전용 신고 기록 상태
  const [isAdminReportOpen, setIsAdminReportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isCreatorOrSuperAdmin =
    currentUserRole === 'creator' || currentUserRole === 'super_admin';

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

    fetchPosts();
    checkUnreadReports();
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

      setPosts(
        postsData.map((post) => ({
          ...post,
          likes_count: post.likes_count ?? 0,
          author_nickname: profileMap[post.author_id] || '작성자',
          author_role: roleMap[post.author_id] || null,
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
        if (!titleMatch && !authorMatch) return false;
      }

      return true;
    });
  }, [posts, selectedBoard, searchQuery]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col min-w-0">
      {/* 교체 버튼 및 헤더 */}
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
          {/* 최고관리자 및 제작자 전용 신고 기록 버튼 */}
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

      <hr className="border-zinc-200 dark:border-zinc-800 mb-4" />

      {/* 검색 및 줄3개 게시판 선택 드롭다운 */}
      <div className="flex items-center gap-2 mb-3.5 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성자 검색"
            className="w-full pl-9 pr-8 py-2 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 3줄 아이콘 게시판 선택기 */}
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

      {/* 정렬 탭 */}
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
        </div>
      </div>

      {/* 게시글 피드 목록 */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400">커뮤니티 피드를 불러오는 중...</div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
          <p className="text-zinc-500">등록된 커뮤니티 게시글이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {filteredPosts.map((post) => (
            <article
              key={post.id}
              onClick={() => router.push(`/community/${post.id}`)}
              className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                    {post.title}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-zinc-400 pt-1">
                    <span className="flex items-center gap-1">
                      <CrownIcon role={post.author_role} className="w-3.5 h-3.5 shrink-0" />
                      <span>{post.author_nickname}</span>
                    </span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    <span className="text-rose-500 flex items-center gap-1">
                      <Heart className="w-3 h-3 fill-current" />
                      {post.likes_count}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 관리자 신고 기록 모달 */}
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
FILE_COMMUNITY_PAGE

# 8. 커뮤니티 상세 모달 라우트 (/community/[id])
mkdir -p src/app/community/'[id]'
cat << 'FILE_COMMUNITY_DETAIL' > src/app/community/'[id]'/page.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import CommunityFeedPage from '../page'
import PostModal from '@/components/PostModal'

export default function CommunityPostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  return (
    <>
      <CommunityFeedPage />
      {id && (
        <PostModal
          postId={id}
          onClose={() => router.push('/community')}
        />
      )}
    </>
  )
}
FILE_COMMUNITY_DETAIL

# 9. 글쓰기 페이지 (/write) - 피드 선택 및 커뮤니티 게시판 말머리 강제 선택 반영
cat << 'FILE_WRITE_PAGE' > src/app/write/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import FreezeModal from '@/components/FreezeModal'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;
const COMMUNITY_BOARDS = ['자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;

export default function WritePage() {
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
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        alert('로그인이 필요한 기능입니다.')
        router.push('/')
      } else {
        setUserId(session.user.id)
        setUserEmail(session.user.email || null)
      }
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    const isCreator = userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'
    if (!isCreator) {
      const { data: noticeData } = await supabase
        .from('site_notices')
        .select('is_frozen')
        .eq('id', 1)
        .maybeSingle()

      if (noticeData?.is_frozen) {
        setIsFreezeModalOpen(true)
        return
      }
    }

    if (feedType === 'community' && !selectedBoard) {
      alert('커뮤니티 게시판을 반드시 하나 선택해야 합니다.')
      return
    }

    if (!title.trim()) {
      alert('제목을 입력해 주십시오.')
      return
    }

    if (!content.trim() || content === '<p></p>') {
      alert('본문 내용을 작성해 주십시오.')
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
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
      },
    ])

    if (error) {
      alert(`게시글 등록 실패: ${error.message}`)
      setIsSubmitting(false)
    } else {
      router.push(feedType === 'community' ? '/community' : '/clan')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link
          href={feedType === 'community' ? '/community' : '/clan'}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>피드로 돌아가기</span>
        </Link>

        {/* 피드 대상 선택 탭 */}
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

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 커뮤니티 전용 필수 게시판 선택 */}
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

        <Editor key={editorKey} content={content} onChange={setContent} />

        <div className="flex justify-end gap-2 pt-2">
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

      <FreezeModal
        isOpen={isFreezeModalOpen}
        onClose={() => setIsFreezeModalOpen(false)}
        actionText="게시글 작성을"
      />
    </div>
  )
}
FILE_WRITE_PAGE

# 10. PostModal 에 댓글 시스템 및 커뮤니티 분기 통합
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

  const [authorRole, setAuthorRole] = useState<RoleType>(null);
  const [authorNickname, setAuthorNickname] = useState<string>("");

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezeActionText, setFreezeActionText] = useState('');

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

  const fetchPost = async (uid?: string | null) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (!error && data) {
      setPost(data);
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
      await supabase.from('post_likes').delete().eq('post_id', targetPostId).eq('user_id', currentUserId);
    } else {
      await supabase.from('post_likes').insert({ post_id: targetPostId, user_id: currentUserId });
    }
    setLikeLoading(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin';
  const isAuthor = Boolean(currentUserId && post && currentUserId === post.author_id);

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
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copied ? '링크 복사됨' : '공유'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-8 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-zinc-400">게시글 로딩 중...</div>
          ) : !post ? (
            <div className="py-20 text-center text-zinc-400">존재하지 않거나 삭제된 게시글입니다.</div>
          ) : (
            <div className="space-y-5">
              <header className="space-y-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                  {post.feed_type === 'clan' && post.is_official && (
                    <span className="text-emerald-500 mr-2">[공식]</span>
                  )}
                  {post.title}
                </h2>

                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={authorRole} className="w-3.5 h-3.5 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
              </header>

              <div
                className="prose dark:prose-invert max-w-none break-words whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              <div className="pt-4 pb-1 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
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

              {/* 커뮤니티 피드 게시글일 때만 댓글 시스템 활성화 */}
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

        {post && (
          <div className="absolute bottom-4 right-5 z-20">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-none text-xs font-bold transition shadow-sm"
            >
              <Siren className="w-3.5 h-3.5 stroke-rose-600" />
              <span>신고</span>
            </button>
          </div>
        )}
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        postId={postId}
        currentUserId={currentUserId}
      />
    </div>
  );
}
FILE_POST_MODAL

echo "--> 소스코드 생성 완료. 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [검증 성공] Next.js 빌드가 성공적으로 완료되었습니다!"
echo " 실서버(Vercel) 배포를 위해 Git 커밋 및 푸시를 진행합니다."
echo "=========================================================="

git add .
git commit -m "feat: 분리된 클랜/커뮤니티 피드, 댓글 시스템 및 관리진 신고기록 구축"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 안전하게 반영되었습니다!"
echo "=========================================================="
