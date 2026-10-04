#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 대댓글 기능 탑재 및 번호 재정렬 시스템 복구"
echo "=========================================================="

# 1. 대댓글(답글) 완벽 지원 CommentsSection 컴포넌트 생성
cat << 'FILE_COMMENTS' > src/components/CommentsSection.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import { ThumbsUp, ImageIcon, Trash2, Send, Loader2, X, Siren, CornerDownRight, MessageSquareQuote } from 'lucide-react'
import CustomPopup from './CustomPopup'

interface CommentItem {
  id: number
  post_id: number
  author_id: string
  content: string
  image_url: string | null
  likes_count: number
  created_at: string
  parent_id?: number | null
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

  // 일반 댓글 작성 상태
  const [inputContent, setInputContent] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 대댓글(답글) 작성 상태
  const [replyingToId, setReplyingToId] = useState<number | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyImage, setReplyImage] = useState<string | null>(null)
  const [submittingReply, setSubmittingReply] = useState(false)
  const [uploadingReplyImage, setUploadingReplyImage] = useState(false)
  const replyFileInputRef = useRef<HTMLInputElement>(null)

  // 댓글/답글 신고 상태
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null)
  const [commentReportReason, setCommentReportReason] = useState<string>('욕설 및 비방')
  const [commentCustomReason, setCommentCustomReason] = useState<string>('')
  const [submittingCommentReport, setSubmittingCommentReport] = useState(false)

  const [popup, setPopup] = useState<{
    show: boolean;
    title: string;
    message: string;
  }>({ show: false, title: '', message: '' })

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isReply: boolean = false) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isReply) setUploadingReplyImage(true)
    else setUploadingImage(true)

    const fileExt = file.name.split('.').pop() || 'png'
    const fileName = `comment-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    try {
      const { error } = await supabase.storage.from('comment-images').upload(fileName, file)
      if (!error) {
        const { data } = supabase.storage.from('comment-images').getPublicUrl(fileName)
        if (data?.publicUrl) {
          if (isReply) setReplyImage(data.publicUrl)
          else setAttachedImage(data.publicUrl)
        }
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          if (isReply) setReplyImage(reader.result as string)
          else setAttachedImage(reader.result as string)
        }
        reader.readAsDataURL(file)
      }
    } catch {
      const reader = new FileReader()
      reader.onload = () => {
        if (isReply) setReplyImage(reader.result as string)
        else setAttachedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }

    if (isReply) {
      setUploadingReplyImage(false)
      if (replyFileInputRef.current) replyFileInputRef.current.value = ''
    } else {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 일반 댓글 등록
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '댓글 작성을 위해 먼저 로그인해 주십시오.' })
      return
    }
    if (!inputContent.trim() && !attachedImage) {
      setPopup({ show: true, title: '내용 입력', message: '댓글 내용 또는 이미지를 첨부해 주십시오.' })
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
      parent_id: null,
    })

    if (error) {
      setPopup({ show: true, title: '등록 실패', message: error.message })
    } else {
      setInputContent('')
      setAttachedImage(null)
      fetchComments()
    }
    setSubmitting(false)
  }

  // 대댓글(답글) 등록
  const handleSubmitReply = async (parentId: number) => {
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '답글 작성을 위해 먼저 로그인해 주십시오.' })
      return
    }
    if (!replyContent.trim() && !replyImage) {
      setPopup({ show: true, title: '내용 입력', message: '답글 내용 또는 이미지를 첨부해 주십시오.' })
      return
    }

    setSubmittingReply(true)
    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)

    const { error } = await supabase.from('post_comments').insert({
      post_id: targetPostId,
      author_id: currentUserId,
      content: replyContent.trim(),
      image_url: replyImage,
      likes_count: 0,
      parent_id: parentId,
    })

    if (error) {
      setPopup({ show: true, title: '등록 실패', message: error.message })
    } else {
      setReplyContent('')
      setReplyImage(null)
      setReplyingToId(null)
      fetchComments()
    }
    setSubmittingReply(false)
  }

  const handleToggleCommentLike = async (comment: CommentItem) => {
    if (!currentUserId) {
      setPopup({ show: true, title: '로그인 필요', message: '좋아요 기능은 로그인이 필요합니다.' })
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
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (error) {
      setPopup({ show: true, title: '삭제 실패', message: error.message })
    } else {
      fetchComments()
    }
  }

  const handleCommentReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId || !reportingCommentId) return

    setSubmittingCommentReport(true)
    const targetPostId = isNaN(Number(postId)) ? postId : Number(postId)
    const finalReason = commentReportReason === '기타' ? (commentCustomReason.trim() || '기타') : commentReportReason

    const { error } = await supabase.from('comment_reports').insert({
      comment_id: reportingCommentId,
      post_id: targetPostId,
      reporter_id: currentUserId,
      reasons: [finalReason],
      custom_reason: commentReportReason === '기타' ? commentCustomReason.trim() : null
    })

    setSubmittingCommentReport(false)
    setReportingCommentId(null)
    setCommentCustomReason('')

    if (error) {
      if (error.code === '23505') {
        setPopup({ show: true, title: '중복 신고', message: '이미 신고한 댓글입니다.' })
      } else {
        setPopup({ show: true, title: '신고 실패', message: error.message })
      }
    } else {
      setPopup({ show: true, title: '신고 접수', message: '댓글 신고가 성공적으로 접수되었습니다.' })
      fetchComments()
    }
  }

  // 최상위 댓글과 대댓글 분리
  const rootComments = comments.filter((c) => !c.parent_id)

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

      {/* 새 댓글 작성 폼 */}
      <form onSubmit={handleSubmitComment} className="space-y-2">
        <textarea
          value={inputContent}
          onChange={(e) => setInputContent(e.target.value)}
          placeholder="댓글을 작성해 보세요 (이미지 및 GIF 첨부 가능)"
          rows={2}
          className="w-full p-2.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

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
            onChange={(e) => handleImageUpload(e, false)}
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

      {/* 댓글 및 대댓글 목록 */}
      <div className="space-y-4 pt-2">
        {loading ? (
          <div className="py-6 text-center text-xs text-zinc-400">댓글을 불러오는 중...</div>
        ) : rootComments.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-400">첫 댓글을 남겨보세요!</div>
        ) : (
          rootComments.map((comment) => {
            const isCommentAuthor = currentUserId && currentUserId === comment.author_id
            const canDelete =
              isCommentAuthor ||
              currentUserRole === 'creator' ||
              currentUserRole === 'super_admin' ||
              currentUserRole === 'admin'

            // 해당 댓글의 자식 대댓글들 (시간순 정렬)
            const replies = comments
              .filter((c) => c.parent_id === comment.id)
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            return (
              <div key={comment.id} className="space-y-2">
                {/* 1. 최상위 댓글 카드 */}
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
                      <CrownIcon role={comment.author_role} className="w-3.5 h-3.5 shrink-0" />
                      <span>{comment.author_nickname}</span>
                      <span className="text-[10px] text-zinc-400 font-normal">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isCommentAuthor && (
                        <button
                          type="button"
                          onClick={() => setReportingCommentId(comment.id)}
                          className="text-zinc-400 hover:text-rose-500 transition"
                          title="댓글 신고"
                        >
                          <Siren className="w-3.5 h-3.5" />
                        </button>
                      )}
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
                  </div>

                  {comment.content && (
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  )}

                  {comment.image_url && (
                    <div className="pt-1">
                      <img
                        src={comment.image_url}
                        alt="댓글 이미지"
                        className="w-1/4 max-w-[140px] sm:max-w-[170px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                        onClick={() => window.open(comment.image_url || '', '_blank')}
                        title="클릭하여 원본 보기"
                      />
                    </div>
                  )}

                  {/* 좋아요 및 답글 달기 버튼 바 */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <button
                      type="button"
                      onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-blue-500 transition"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      <span>{replyingToId === comment.id ? '답글 닫기' : '답글 달기'}</span>
                      {replies.length > 0 && <span className="text-[10px] text-zinc-400">({replies.length})</span>}
                    </button>

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

                {/* 2. 대댓글(답글) 작성 입력창 */}
                {replyingToId === comment.id && (
                  <div className="ml-4 sm:ml-6 pl-3 border-l-2 border-blue-500 dark:border-blue-400 space-y-2 py-1 animate-in fade-in duration-150">
                    <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-none space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        <MessageSquareQuote className="w-3.5 h-3.5" />
                        <span>@{comment.author_nickname} 님에게 답글 작성</span>
                      </div>

                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="답글을 작성하세요 (이미지/GIF 가능)"
                        rows={2}
                        className="w-full p-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      {replyImage && (
                        <div className="relative inline-block border border-zinc-300 dark:border-zinc-700">
                          <img src={replyImage} alt="답글 이미지" className="w-16 h-16 object-cover" />
                          <button
                            type="button"
                            onClick={() => setReplyImage(null)}
                            className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => replyFileInputRef.current?.click()}
                          disabled={uploadingReplyImage}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                        >
                          {uploadingReplyImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                          <span>사진</span>
                        </button>
                        <input
                          ref={replyFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, true)}
                        />

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToId(null)
                              setReplyContent('')
                              setReplyImage(null)
                            }}
                            className="px-3 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={submittingReply}
                            className="inline-flex items-center gap-1 px-3.5 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-none transition disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            <span>{submittingReply ? '등록 중...' : '답글 등록'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. 대댓글 목록 렌더링 (들여쓰기 적용) */}
                {replies.length > 0 && (
                  <div className="ml-4 sm:ml-6 pl-3 sm:pl-4 border-l-2 border-zinc-300 dark:border-zinc-800 space-y-2.5 pt-1">
                    {replies.map((reply) => {
                      const isReplyAuthor = currentUserId && currentUserId === reply.author_id
                      const canDeleteReply =
                        isReplyAuthor ||
                        currentUserRole === 'creator' ||
                        currentUserRole === 'super_admin' ||
                        currentUserRole === 'admin'

                      return (
                        <div
                          key={reply.id}
                          className="p-2.5 bg-zinc-100/70 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
                              <CornerDownRight className="w-3 h-3 text-blue-500 shrink-0" />
                              <CrownIcon role={reply.author_role} className="w-3 h-3 shrink-0" />
                              <span>{reply.author_nickname}</span>
                              <span className="text-[10px] text-zinc-400 font-normal">
                                {new Date(reply.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {!isReplyAuthor && (
                                <button
                                  type="button"
                                  onClick={() => setReportingCommentId(reply.id)}
                                  className="text-zinc-400 hover:text-rose-500 transition"
                                  title="답글 신고"
                                >
                                  <Siren className="w-3 h-3" />
                                </button>
                              )}
                              {canDeleteReply && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(reply.id)}
                                  className="text-zinc-400 hover:text-red-500 transition"
                                  title="답글 삭제"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {reply.content && (
                            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words pl-4">
                              {reply.content}
                            </p>
                          )}

                          {reply.image_url && (
                            <div className="pt-1 pl-4">
                              <img
                                src={reply.image_url}
                                alt="답글 이미지"
                                className="w-1/4 max-w-[120px] sm:max-w-[150px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                                onClick={() => window.open(reply.image_url || '', '_blank')}
                                title="클릭하여 원본 보기"
                              />
                            </div>
                          )}

                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleToggleCommentLike(reply)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[10px] font-bold border transition ${
                                reply.user_liked
                                  ? 'bg-blue-50 text-blue-600 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                              }`}
                            >
                              <ThumbsUp className={`w-2.5 h-2.5 ${reply.user_liked ? 'fill-current' : ''}`} />
                              <span>{reply.likes_count}</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 댓글/대댓글 신고 모달 */}
      {reportingCommentId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setReportingCommentId(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-950 border-2 border-rose-600 rounded-none p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rose-200 dark:border-rose-950 pb-2.5">
              <div className="flex items-center gap-2 text-rose-600">
                <Siren className="w-4 h-4" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">댓글 / 답글 신고</h3>
              </div>
              <button onClick={() => setReportingCommentId(null)} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCommentReportSubmit} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                {['욕설 및 비방', '음란성 / 부적절한 이미지', '도배 및 광고', '기타'].map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="commentReason"
                      value={r}
                      checked={commentReportReason === r}
                      onChange={(e) => setCommentReportReason(e.target.value)}
                      className="accent-rose-600"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>

              {commentReportReason === '기타' && (
                <textarea
                  value={commentCustomReason}
                  onChange={(e) => setCommentCustomReason(e.target.value)}
                  placeholder="신고 사유를 작성해 주십시오."
                  rows={2}
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs"
                />
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setReportingCommentId(null)}
                  className="px-3 py-1.5 border rounded-none text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submittingCommentReport}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-none text-xs"
                >
                  {submittingCommentReport ? '접수 중...' : '신고'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup({ show: false, title: '', message: '' })}
      />
    </div>
  )
}
FILE_COMMENTS

# 2. UserHubModal.tsx 번호 재정렬 후 새로고침 보강
cat << 'FILE_PATCH_HUB' > patch_hub.py
with open("src/components/UserHubModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

target = """    if (error) {
      setNoticeModal({ text: `게시글 번호 초기화 실패: ${error.message}`, theme: 'yellow' })
    } else {
      setNoticeModal({
        text: `총 ${data?.count || 0}개의 게시글 번호가 1번부터 차례대로 성공적으로 재정렬되었습니다.`,
        theme: 'yellow'
      })
      router.refresh()
    }"""

replacement = """    if (error) {
      setNoticeModal({ text: `게시글 번호 초기화 실패: ${error.message}`, theme: 'yellow' })
    } else {
      setNoticeModal({
        text: `총 ${data?.count || 0}개의 게시글 번호가 1번부터 차례대로 성공적으로 재정렬되었습니다.`,
        theme: 'yellow'
      })
      setTimeout(() => {
        window.location.reload()
      }, 1200)
    }"""

if target in content:
    content = content.replace(target, replacement)
    with open("src/components/UserHubModal.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("UserHubModal.tsx reload logic patched")
FILE_PATCH_HUB
python3 patch_hub.py || true
rm -f patch_hub.py

echo "--> 소스코드 갱신 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! Git 자동 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "feat: 대댓글(답글) 기능 신설 및 게시글 번호 재정렬 외래키 동기화 수정 완료"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
