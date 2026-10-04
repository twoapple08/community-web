'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import { ThumbsUp, ImageIcon, Trash2, Send, Loader2, X, Siren, Check } from 'lucide-react'
import CustomPopup from './CustomPopup'

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

  // 댓글 신고 상태
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
        if (data?.publicUrl) setAttachedImage(data.publicUrl)
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

  // 댓글 신고 제출 핸들러
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

                  <div className="flex items-center gap-2">
                    {/* 댓글 신고 버튼 */}
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

      {/* 댓글 전용 신고 팝업 */}
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
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">댓글 신고</h3>
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
