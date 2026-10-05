'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import { ThumbsUp, ImageIcon, Trash2, Send, Loader2, X, Siren, CornerDownRight, ChevronDown, ChevronUp, MessageSquareQuote } from 'lucide-react'
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
  const [mounted, setMounted] = useState(false)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sortType, setSortType] = useState<'latest' | 'popular'>('latest')

  // 댓글 작성
  const [inputContent, setInputContent] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 대댓글 작성
  const [replyingToId, setReplyingToId] = useState<number | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyImage, setReplyImage] = useState<string | null>(null)
  const [submittingReply, setSubmittingReply] = useState(false)
  const [uploadingReplyImage, setUploadingReplyImage] = useState(false)
  const replyFileInputRef = useRef<HTMLInputElement>(null)

  // 대댓글 접기/펼치기 상태 관리 (기본적으로 모두 접힌 상태)
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({})

  // 댓글/답글 신고 모달
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
    setMounted(true)
  }, [])

  useEffect(() => {
    fetchComments()
  }, [postId, sortType])

  const toggleRepliesExpand = (commentId: number) => {
    setExpandedReplies((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }))
  }

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
      // 답글 작성 후 해당 답글 목록 자동 펼치기
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }))
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
      setPopup({ show: true, title: '신고 접수', message: '신고가 성공적으로 접수되었습니다.' })
      fetchComments()
    }
  }

  const rootComments = comments.filter((c) => !c.parent_id)

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
      {/* 댓글 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm sm:text-base font-black text-zinc-900 dark:text-white">
          댓글 ({comments.length})
        </h3>
        <div className="flex items-center gap-1 text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-none border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setSortType('latest')}
            className={`px-1.5 py-0.5 rounded-none transition ${
              sortType === 'latest' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-400'
            }`}
          >
            최신순
          </button>
          <button
            type="button"
            onClick={() => setSortType('popular')}
            className={`px-1.5 py-0.5 rounded-none transition ${
              sortType === 'popular' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-400'
            }`}
          >
            인기순
          </button>
        </div>
      </div>

      {/* 새 댓글 작성 폼 (컴팩트 세로폭) */}
      <form onSubmit={handleSubmitComment} className="space-y-1.5">
        <textarea
          value={inputContent}
          onChange={(e) => setInputContent(e.target.value)}
          placeholder="댓글을 작성해 보세요 (이미지 및 GIF 첨부 가능)"
          rows={2}
          className="w-full p-3 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        {attachedImage && (
          <div className="relative inline-block border border-zinc-300 dark:border-zinc-700">
            <img src={attachedImage} alt="첨부" className="w-14 h-14 object-cover" />
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
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-none transition"
          >
            {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
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
            className="inline-flex items-center gap-1 px-4 py-1.5 text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            <span>{submitting ? '등록 중...' : '등록'}</span>
          </button>
        </div>
      </form>

      {/* 댓글 및 대댓글 목록 */}
      <div className="space-y-2 pt-1">
        {loading ? (
          <div className="py-4 text-center text-xs text-zinc-400">댓글을 불러오는 중...</div>
        ) : rootComments.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-400">첫 댓글을 남겨보세요!</div>
        ) : (
          rootComments.map((comment) => {
            const isCommentAuthor = currentUserId && currentUserId === comment.author_id
            const canDelete =
              isCommentAuthor ||
              currentUserRole === 'creator' ||
              currentUserRole === 'super_admin' ||
              currentUserRole === 'admin'

            const replies = comments
              .filter((c) => c.parent_id === comment.id)
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            const isRepliesOpen = Boolean(expandedReplies[comment.id])

            return (
              <div key={comment.id} className="space-y-1.5">
                {/* 1. 최상위 댓글 카드 (세로폭 대폭 축소) */}
                <div className="p-2 sm:p-2.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
                      <CrownIcon role={comment.author_role} className="w-3 h-3 shrink-0" />
                      <span className="text-xs sm:text-sm font-bold">{comment.author_nickname}</span>
                      <span className="text-[10px] text-zinc-400 font-normal">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isCommentAuthor && (
                        <button
                          type="button"
                          onClick={() => {
                          if (!currentUserId) {
                            setPopup({ show: true, title: '로그인 필요', message: '신고 기능은 로그인 후 이용 가능합니다.' });
                            return;
                          }
                          setReportingCommentId(comment.id);
                        }}
                          className="text-zinc-400 hover:text-rose-500 transition p-0.5"
                          title="댓글 신고"
                        >
                          <Siren className="w-3 h-3" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-zinc-400 hover:text-red-500 transition p-0.5"
                          title="댓글 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {comment.content && (
                    <p className="text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap break-words text-xs sm:text-sm font-bold">
                      {comment.content}
                    </p>
                  )}

                  {comment.image_url && (
                    <div className="pt-0.5">
                      <img
                        src={comment.image_url}
                        alt="댓글 이미지"
                        className="w-1/4 max-w-[120px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                        onClick={() => window.open(comment.image_url || '', '_blank')}
                        title="클릭하여 원본 보기"
                      />
                    </div>
                  )}

                  {/* 하단 액션 바: 답글 접기/펼치기 토글 + 좋아요 */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-zinc-500 hover:text-blue-500 transition"
                      >
                        <CornerDownRight className="w-2.5 h-2.5" />
                        <span>{replyingToId === comment.id ? '취소' : '답글 달기'}</span>
                      </button>

                      {/* 답글 접었다 피는 토글 버튼 (기본적으로 접힌 상태) */}
                      {replies.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleRepliesExpand(comment.id)}
                          className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline transition"
                        >
                          <span>{isRepliesOpen ? '답글 접기' : `답글 ${replies.length}개 보기`}</span>
                          {isRepliesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleCommentLike(comment)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[10px] font-bold border transition ${
                        comment.user_liked
                          ? 'bg-blue-50 text-blue-600 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <ThumbsUp className={`w-2.5 h-2.5 ${comment.user_liked ? 'fill-current' : ''}`} />
                      <span>{comment.likes_count}</span>
                    </button>
                  </div>
                </div>

                {/* 2. 대댓글 작성 인라인 폼 (컴팩트) */}
                {replyingToId === comment.id && (
                  <div className="ml-3 sm:ml-5 pl-2.5 border-l-2 border-blue-500 space-y-1.5 py-0.5 animate-in fade-in duration-150">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-none space-y-1.5">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        <MessageSquareQuote className="w-3 h-3" />
                        <span>@{comment.author_nickname} 님에게 답글</span>
                      </div>

                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="답글 내용을 입력하세요"
                        rows={1}
                        className="w-full p-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      {replyImage && (
                        <div className="relative inline-block border border-zinc-300 dark:border-zinc-700">
                          <img src={replyImage} alt="답글 이미지" className="w-12 h-12 object-cover" />
                          <button
                            type="button"
                            onClick={() => setReplyImage(null)}
                            className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-0.5">
                        <button
                          type="button"
                          onClick={() => replyFileInputRef.current?.click()}
                          disabled={uploadingReplyImage}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] border border-zinc-300 dark:border-zinc-700 rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                        >
                          {uploadingReplyImage ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ImageIcon className="w-2.5 h-2.5" />}
                          <span>사진</span>
                        </button>
                        <input
                          ref={replyFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, true)}
                        />

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToId(null)
                              setReplyContent('')
                              setReplyImage(null)
                            }}
                            className="px-2 py-0.5 text-[10px] border border-zinc-300 dark:border-zinc-700 rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={submittingReply}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-none transition disabled:opacity-50"
                          >
                            <Send className="w-2.5 h-2.5" />
                            <span>{submittingReply ? '등록 중...' : '등록'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. 대댓글 목록 (기본 접힘, 클릭 시에만 펼쳐짐) */}
                {isRepliesOpen && replies.length > 0 && (
                  <div className="ml-3 sm:ml-5 pl-2.5 sm:pl-3 border-l-2 border-zinc-300 dark:border-zinc-800 space-y-1.5 pt-0.5 animate-in fade-in duration-150">
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
                          className="p-2 bg-zinc-100/70 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 font-bold text-zinc-800 dark:text-zinc-200">
                              <CornerDownRight className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              <CrownIcon role={reply.author_role} className="w-2.5 h-2.5 shrink-0" />
                              <span className="text-[11px]">{reply.author_nickname}</span>
                              <span className="text-[9px] text-zinc-400 font-normal">
                                {new Date(reply.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {!isReplyAuthor && (
                                <button
                                  type="button"
                                  onClick={() => {
                                  if (!currentUserId) {
                                    setPopup({ show: true, title: '로그인 필요', message: '신고 기능은 로그인 후 이용 가능합니다.' });
                                    return;
                                  }
                                  setReportingCommentId(reply.id);
                                }}
                                  className="text-zinc-400 hover:text-rose-500 transition p-0.5"
                                  title="답글 신고"
                                >
                                  <Siren className="w-2.5 h-2.5" />
                                </button>
                              )}
                              {canDeleteReply && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(reply.id)}
                                  className="text-zinc-400 hover:text-red-500 transition p-0.5"
                                  title="답글 삭제"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {reply.content && (
                            <p className="text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap break-words pl-3 text-[11px]">
                              {reply.content}
                            </p>
                          )}

                          {reply.image_url && (
                            <div className="pt-0.5 pl-3">
                              <img
                                src={reply.image_url}
                                alt="답글 이미지"
                                className="w-1/4 max-w-[100px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                                onClick={() => window.open(reply.image_url || '', '_blank')}
                                title="클릭하여 원본 보기"
                              />
                            </div>
                          )}

                          <div className="flex justify-end pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleToggleCommentLike(reply)}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[9px] font-bold border transition ${
                                reply.user_liked
                                  ? 'bg-blue-50 text-blue-600 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                              }`}
                            >
                              <ThumbsUp className={`w-2 h-2 ${reply.user_liked ? 'fill-current' : ''}`} />
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

      {/* 댓글/답글 신고 모달: createPortal 로 화면 정중앙(fixed inset-0)에 무조건 노출 */}
      {mounted && reportingCommentId && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setReportingCommentId(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-950 border-2 border-rose-600 rounded-none p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
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
        </div>,
        document.body
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
