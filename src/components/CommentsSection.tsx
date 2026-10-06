'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { CrownIcon, RoleType } from './CrownIcon'
import { ThumbsUp, ImageIcon, Trash2, Send, Loader2, X, Siren, CornerDownRight, ChevronDown, ChevronUp, MessageSquareQuote, Pencil } from 'lucide-react'
import CustomPopup from './CustomPopup'
import LinkConfirmPopup from './LinkConfirmPopup'
import CommentText from './CommentText'
import Avatar from './Avatar'
import { fetchRoleMap } from '@/lib/roles'
import { compressCommentImage } from '@/lib/imageCompress'
import { fetchAvatarMap, openUserProfile } from '@/lib/userProfile'

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
  /** 신고 누적 심사 상태 (null | pending | deleted | dismissed) – SQL 미적용 시 없음 */
  report_review_status?: string | null
  /** 마지막 수정 시각 (내용/사진이 바뀌면 DB 가 자동 기록) */
  edited_at?: string | null
}

interface CommentsSectionProps {
  postId: string | number
  currentUserId: string | null
  currentUserRole: RoleType
  /** 댓글+답글 총 개수가 바뀌면 호출 (목록 화면의 댓글 수 동기화용) */
  onCountChange?: (count: number) => void
  /** 댓글 속 링크/카드를 눌렀을 때 호출 (없으면 자체 링크 확인 팝업 사용) */
  onLinkClick?: (url: string) => void
}

const COMMENT_HASH_REGEX = /^#comment-(\d+)$/

const REVIEW_PLACEHOLDER: Record<string, string> = {
  pending: '신고가 누적되어 관리자가 검토 중인 댓글입니다.',
  deleted: '관리자에 의해 삭제된 댓글입니다.',
}

/** 글 길이에 맞춰 높이가 늘어나는 수정용 입력칸 (열리면 커서를 글 끝에 둠) */
function AutoGrowTextarea({ value, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // border-box 이므로 테두리 두께까지 더해야 스크롤바가 생기지 않음
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  return <textarea ref={ref} rows={1} value={value} {...rest} />
}

export default function CommentsSection({ postId, currentUserId, currentUserRole, onCountChange, onLinkClick }: CommentsSectionProps) {
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

  // 삭제 확인 팝업 대상
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; isReply: boolean } | null>(null)

  // 인라인 수정 (한 번에 하나의 댓글만)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // 작성자 프로필 사진 (있는 사람만 표시)
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({})

  // 상위에서 링크 확인 팝업을 주지 않았을 때 쓰는 자체 팝업
  const [localLinkUrl, setLocalLinkUrl] = useState<string | null>(null)

  // 주소의 #comment-번호 로 이동 후 잠깐 강조
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const [hashVersion, setHashVersion] = useState(0)
  const handledHashRef = useRef<string | null>(null)
  const anchorTimerRef = useRef<number | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

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

  // 주소의 해시가 바뀌면(알림 클릭 등) 다시 해당 댓글로 이동
  useEffect(() => {
    const bump = () => setHashVersion((v) => v + 1)
    window.addEventListener('hashchange', bump)
    window.addEventListener('popstate', bump)
    return () => {
      window.removeEventListener('hashchange', bump)
      window.removeEventListener('popstate', bump)
      if (anchorTimerRef.current) window.clearTimeout(anchorTimerRef.current)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    }
  }, [])

  // 댓글을 다 불러온 뒤 #comment-번호 위치로 스크롤 + 2초간 강조 (같은 해시는 1번만)
  useEffect(() => {
    if (loading) return
    const hash = window.location.hash
    const m = COMMENT_HASH_REGEX.exec(hash)
    if (!m || handledHashRef.current === hash) return
    const targetId = Number(m[1])
    const target = comments.find((c) => c.id === targetId)
    if (!target) return
    handledHashRef.current = hash
    const parentId = target.parent_id ?? null

    // 펼친 답글이 화면에 그려질 때까지 잠깐씩 기다리며 찾기
    const tryScroll = (triesLeft: number) => {
      const el = document.getElementById(`comment-${targetId}`)
      if (!el) {
        if (triesLeft > 0) anchorTimerRef.current = window.setTimeout(() => tryScroll(triesLeft - 1), 60)
        return
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedId(targetId)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 2000)
    }

    if (anchorTimerRef.current) window.clearTimeout(anchorTimerRef.current)
    anchorTimerRef.current = window.setTimeout(() => {
      // 답글이면 부모 댓글의 답글 목록부터 펼침
      if (parentId) setExpandedReplies((prev) => (prev[parentId] ? prev : { ...prev, [parentId]: true }))
      tryScroll(10)
    }, 0)
  }, [loading, comments, hashVersion])

  // 댓글 수가 바뀌면 상위(목록 화면)에 알림
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => {
    onCountChangeRef.current = onCountChange
  })
  const lastReportedCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (loading) return
    if (lastReportedCountRef.current === null) {
      lastReportedCountRef.current = comments.length
      onCountChangeRef.current?.(comments.length)
      return
    }
    if (lastReportedCountRef.current !== comments.length) {
      lastReportedCountRef.current = comments.length
      onCountChangeRef.current?.(comments.length)
    }
  }, [comments.length, loading])

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
        : await query.order('created_at', { ascending: false })

    if (commentsData && commentsData.length > 0) {
      const authorIds = Array.from(new Set(commentsData.map((c) => c.author_id)))
      const [{ data: profiles }, roleMap] = await Promise.all([
        supabase.from('profiles').select('id, nickname').in('id', authorIds),
        fetchRoleMap(),
      ])
      const profileMap: Record<string, string> = {}
      profiles?.forEach((p) => {
        profileMap[p.id] = p.nickname
      })

      const userLikesSet = new Set<number>()
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

      // 프로필 사진은 목록 표시를 막지 않도록 따로 불러와 덧붙임 (컬럼이 없으면 빈 결과)
      fetchAvatarMap(authorIds).then((map) => setAvatarMap((prev) => ({ ...prev, ...map })))
    } else {
      setComments([])
    }
    setLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isReply: boolean = false) => {
    const originalFile = e.target.files?.[0]
    if (!originalFile) return

    if (isReply) setUploadingReplyImage(true)
    else setUploadingImage(true)

    // 대용량 사진은 업로드 전에 자동 축소 (GIF 는 원본 유지)
    const file = await compressCommentImage(originalFile)
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

    // 좋아요 수(likes_count)는 DB 트리거가 comment_likes 기준으로 정확히 계산합니다. (동시 클릭 시 숫자 꼬임 방지)
    const { error } = prevLiked
      ? await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      : await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: currentUserId })

    if (error) {
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, user_liked: prevLiked, likes_count: comment.likes_count } : c))
      )
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (error) {
      setPopup({ show: true, title: '삭제 실패', message: error.message })
    } else {
      if (editingId === commentId) cancelEdit()
      fetchComments()
    }
  }

  const startEdit = (item: CommentItem) => {
    setEditingId(item.id)
    setEditContent(item.content || '')
    setEditImage(item.image_url || null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
    setEditImage(null)
  }

  const handleSaveEdit = async (item: CommentItem) => {
    if (!currentUserId || savingEdit) return
    const content = editContent.trim()
    if (!content && !editImage) {
      setPopup({ show: true, title: '내용 입력', message: '댓글 내용 또는 이미지를 첨부해 주십시오.' })
      return
    }
    // 바뀐 것이 없으면 저장 요청 없이 닫기 ('(수정됨)' 표시가 괜히 붙지 않도록)
    if (content === (item.content || '') && editImage === (item.image_url || null)) {
      cancelEdit()
      return
    }

    setSavingEdit(true)
    const { data, error } = await supabase
      .from('post_comments')
      .update({ content, image_url: editImage })
      .eq('id', item.id)
      .eq('author_id', currentUserId)
      .select()
    setSavingEdit(false)

    if (error) {
      setPopup({ show: true, title: '수정 실패', message: error.message })
      return
    }
    const row = (Array.isArray(data) ? data[0] : null) as Partial<CommentItem> | null
    if (!row) {
      // 권한 정책에 막히면 오류 없이 빈 결과가 옴
      setPopup({ show: true, title: '수정 실패', message: '댓글을 수정할 수 없습니다. 이미 삭제되었거나 수정 권한이 없습니다.' })
      return
    }

    setComments((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? {
              ...c,
              content: typeof row.content === 'string' ? row.content : content,
              image_url: row.image_url !== undefined ? row.image_url : editImage,
              edited_at: row.edited_at !== undefined ? row.edited_at : c.edited_at,
            }
          : c
      )
    )
    cancelEdit()
  }

  const handleLinkClick = (url: string) => {
    if (onLinkClick) onLinkClick(url)
    else setLocalLinkUrl(url)
  }

  // 수정 모드: 댓글 글자 자리가 그대로 입력칸으로 바뀜
  const renderEditForm = (item: CommentItem, isReply: boolean) => (
    <div className={`space-y-1 ${isReply ? 'pl-3' : ''}`}>
      <AutoGrowTextarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            handleSaveEdit(item)
          } else if (e.key === 'Escape') {
            // 바깥 창(프로필 등)의 Esc 닫기가 같이 실행되지 않도록 전파 차단
            e.preventDefault()
            e.stopPropagation()
            cancelEdit()
          }
        }}
        placeholder={isReply ? '답글 내용을 입력하세요' : '댓글 내용을 입력하세요'}
        aria-label={isReply ? '답글 수정' : '댓글 수정'}
        className={`block w-full px-1.5 py-1 leading-snug bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          isReply ? 'text-[11px]' : 'text-[11px] sm:text-xs'
        }`}
      />

      {editImage && (
        <div className="relative inline-block border border-zinc-300 dark:border-zinc-700">
          <img src={editImage} alt="첨부 이미지" className="w-12 h-12 object-cover" />
          <button
            type="button"
            onClick={() => setEditImage(null)}
            className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5"
            title="이미지 빼기"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={cancelEdit}
          disabled={savingEdit}
          className="px-2 py-0.5 text-[10px] border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-800 transition disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => handleSaveEdit(item)}
          disabled={savingEdit}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-none transition disabled:opacity-50"
        >
          {savingEdit && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
          <span>{savingEdit ? '저장 중...' : '저장'}</span>
        </button>
      </div>
    </div>
  )

  // 관리자에게만 보이는 심사 상태 배지
  const renderReviewBadge = (status: string | null | undefined) => {
    if (status !== 'pending' && status !== 'deleted') return null
    return (
      <span
        className={`px-1 py-px text-[9px] font-black leading-none rounded-none border ${
          status === 'pending'
            ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
            : 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
        }`}
      >
        {status === 'pending' ? '검토 중' : '삭제됨'}
      </span>
    )
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
  const isAdmin = currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin'

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
      {/* 댓글 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
          댓글 ({comments.length})
        </h3>
        <div className="flex items-center gap-1 text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-none border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setSortType('latest')}
            className={`px-1.5 py-0.5 rounded-none transition ${
              sortType === 'latest' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            최신순
          </button>
          <button
            type="button"
            onClick={() => setSortType('popular')}
            className={`px-1.5 py-0.5 rounded-none transition ${
              sortType === 'popular' ? 'bg-white dark:bg-zinc-950 font-bold shadow-sm' : 'text-zinc-500 dark:text-zinc-400'
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
          className="w-full p-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            <span>{submitting ? '등록 중...' : '등록'}</span>
          </button>
        </div>
      </form>

      {/* 댓글 및 대댓글 목록 */}
      <div className="space-y-2 pt-1">
        {loading ? (
          <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">댓글을 불러오는 중...</div>
        ) : rootComments.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">첫 댓글을 남겨보세요!</div>
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

            // 신고 누적 심사 상태: 일반 유저는 안내 문구, 관리자는 흐리게 + 배지
            const reviewStatus = comment.report_review_status
            const isUnderReview = reviewStatus === 'pending' || reviewStatus === 'deleted'
            const showPlaceholder = isUnderReview && !isAdmin
            const canEdit = Boolean(isCommentAuthor) && !isUnderReview
            const isEditingThis = editingId === comment.id
            const avatarUrl = avatarMap[comment.author_id]

            return (
              <div key={comment.id} className="space-y-1.5">
                {/* 1. 최상위 댓글 카드 (세로폭 대폭 축소) */}
                <div
                  id={`comment-${comment.id}`}
                  className={`p-2 sm:p-2.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-1.5 text-xs transition-shadow duration-500 ${
                    highlightedId === comment.id ? 'ring-2 ring-amber-400' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 font-bold text-zinc-800 dark:text-zinc-200">
                      <button
                        type="button"
                        onClick={() => openUserProfile(comment.author_id)}
                        title="프로필 보기"
                        className="flex items-center gap-1.5 min-w-0 text-left hover:underline"
                      >
                        {avatarUrl && <Avatar src={avatarUrl} size={16} alt={`${comment.author_nickname} 프로필 사진`} fallback={null} />}
                        <CrownIcon role={comment.author_role} className="w-3 h-3 shrink-0" />
                        <span className="text-[11px] sm:text-xs">{comment.author_nickname}</span>
                      </button>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                      {comment.edited_at && !showPlaceholder && (
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal">(수정됨)</span>
                      )}
                      {isAdmin && renderReviewBadge(reviewStatus)}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isCommentAuthor && !showPlaceholder && (
                        <button
                          type="button"
                          onClick={() => {
                          if (!currentUserId) {
                            setPopup({ show: true, title: '로그인 필요', message: '신고 기능은 로그인 후 이용 가능합니다.' });
                            return;
                          }
                          setReportingCommentId(comment.id);
                        }}
                          className="text-zinc-500 dark:text-zinc-400 hover:text-rose-500 transition p-0.5"
                          title="댓글 신고"
                        >
                          <Siren className="w-3 h-3" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => (isEditingThis ? cancelEdit() : startEdit(comment))}
                          className={`transition p-0.5 ${isEditingThis ? 'text-blue-500' : 'text-zinc-500 dark:text-zinc-400 hover:text-blue-500'}`}
                          title="댓글 수정"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {canDelete && !showPlaceholder && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ id: comment.id, isReply: false })}
                          className="text-zinc-500 dark:text-zinc-400 hover:text-red-500 transition p-0.5"
                          title="댓글 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {showPlaceholder ? (
                    <p className="italic text-zinc-500 dark:text-zinc-400 leading-snug text-[11px] sm:text-xs">
                      {REVIEW_PLACEHOLDER[reviewStatus as string]}
                    </p>
                  ) : isEditingThis ? (
                    renderEditForm(comment, false)
                  ) : (
                    <>
                      {comment.content && (
                        <CommentText
                          text={comment.content}
                          onLinkClick={handleLinkClick}
                          className={`text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap break-words text-[11px] sm:text-xs ${
                            isUnderReview ? 'opacity-60' : ''
                          }`}
                        />
                      )}

                      {comment.image_url && (
                        <div className={`pt-0.5 ${isUnderReview ? 'opacity-60' : ''}`}>
                          <img
                            src={comment.image_url}
                            alt="댓글 이미지"
                            loading="lazy"
                            className="w-1/4 max-w-[120px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                            onClick={() => window.open(comment.image_url || '', '_blank')}
                            title="클릭하여 원본 보기"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* 하단 액션 바: 답글 접기/펼치기 토글 + 좋아요 (심사 중 안내 댓글은 답글 토글만) */}
                  {(!showPlaceholder || replies.length > 0) && (
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                      <div className="flex items-center gap-2">
                        {!showPlaceholder && (
                          <button
                            type="button"
                            onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-zinc-500 hover:text-blue-500 transition"
                          >
                            <CornerDownRight className="w-2.5 h-2.5" />
                            <span>{replyingToId === comment.id ? '취소' : '답글 달기'}</span>
                          </button>
                        )}

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

                      {!showPlaceholder && (
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
                      )}
                    </div>
                  )}
                </div>

                {/* 2. 대댓글 작성 인라인 폼 (컴팩트) */}
                {replyingToId === comment.id && !showPlaceholder && (
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

                      const replyReviewStatus = reply.report_review_status
                      const isReplyUnderReview = replyReviewStatus === 'pending' || replyReviewStatus === 'deleted'
                      const showReplyPlaceholder = isReplyUnderReview && !isAdmin
                      const canEditReply = Boolean(isReplyAuthor) && !isReplyUnderReview
                      const isEditingReply = editingId === reply.id
                      const replyAvatarUrl = avatarMap[reply.author_id]

                      return (
                        <div
                          key={reply.id}
                          id={`comment-${reply.id}`}
                          className={`p-2 bg-zinc-100/70 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-none space-y-1 text-xs transition-shadow duration-500 ${
                            highlightedId === reply.id ? 'ring-2 ring-amber-400' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0 font-bold text-zinc-800 dark:text-zinc-200">
                              <CornerDownRight className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              <button
                                type="button"
                                onClick={() => openUserProfile(reply.author_id)}
                                title="프로필 보기"
                                className="flex items-center gap-1 min-w-0 text-left hover:underline"
                              >
                                {replyAvatarUrl && <Avatar src={replyAvatarUrl} size={14} alt={`${reply.author_nickname} 프로필 사진`} fallback={null} />}
                                <CrownIcon role={reply.author_role} className="w-2.5 h-2.5 shrink-0" />
                                <span className="text-[11px]">{reply.author_nickname}</span>
                              </button>
                              <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-normal">
                                {new Date(reply.created_at).toLocaleDateString()}
                              </span>
                              {reply.edited_at && !showReplyPlaceholder && (
                                <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-normal">(수정됨)</span>
                              )}
                              {isAdmin && renderReviewBadge(replyReviewStatus)}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {!isReplyAuthor && !showReplyPlaceholder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                  if (!currentUserId) {
                                    setPopup({ show: true, title: '로그인 필요', message: '신고 기능은 로그인 후 이용 가능합니다.' });
                                    return;
                                  }
                                  setReportingCommentId(reply.id);
                                }}
                                  className="text-zinc-500 dark:text-zinc-400 hover:text-rose-500 transition p-0.5"
                                  title="답글 신고"
                                >
                                  <Siren className="w-2.5 h-2.5" />
                                </button>
                              )}
                              {canEditReply && (
                                <button
                                  type="button"
                                  onClick={() => (isEditingReply ? cancelEdit() : startEdit(reply))}
                                  className={`transition p-0.5 ${isEditingReply ? 'text-blue-500' : 'text-zinc-500 dark:text-zinc-400 hover:text-blue-500'}`}
                                  title="답글 수정"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              )}
                              {canDeleteReply && !showReplyPlaceholder && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ id: reply.id, isReply: true })}
                                  className="text-zinc-500 dark:text-zinc-400 hover:text-red-500 transition p-0.5"
                                  title="답글 삭제"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {showReplyPlaceholder ? (
                            <p className="italic text-zinc-500 dark:text-zinc-400 leading-snug pl-3 text-[11px]">
                              {REVIEW_PLACEHOLDER[replyReviewStatus as string]}
                            </p>
                          ) : isEditingReply ? (
                            renderEditForm(reply, true)
                          ) : (
                            <>
                              {reply.content && (
                                <CommentText
                                  text={reply.content}
                                  onLinkClick={handleLinkClick}
                                  className={`text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap break-words pl-3 text-[11px] ${
                                    isReplyUnderReview ? 'opacity-60' : ''
                                  }`}
                                />
                              )}

                              {reply.image_url && (
                                <div className={`pt-0.5 pl-3 ${isReplyUnderReview ? 'opacity-60' : ''}`}>
                                  <img
                                    src={reply.image_url}
                                    alt="답글 이미지"
                                    loading="lazy"
                                    className="w-1/4 max-w-[100px] aspect-auto object-cover rounded-none border border-zinc-300 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition"
                                    onClick={() => window.open(reply.image_url || '', '_blank')}
                                    title="클릭하여 원본 보기"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {!showReplyPlaceholder && (
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
                          )}
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
              <button onClick={() => setReportingCommentId(null)} className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-white">
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

      {/* 댓글/답글 삭제 확인 (확인을 눌러야만 삭제) */}
      <CustomPopup
        isOpen={Boolean(deleteTarget)}
        type="confirm"
        isDanger
        title={deleteTarget?.isReply ? '답글 삭제' : '댓글 삭제'}
        message={'이 댓글을 삭제하시겠습니까?\n삭제한 댓글은 복구할 수 없습니다.'}
        confirmText="삭제"
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (target) handleDeleteComment(target.id)
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {!onLinkClick && <LinkConfirmPopup url={localLinkUrl} onClose={() => setLocalLinkUrl(null)} />}

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup({ show: false, title: '', message: '' })}
      />
    </div>
  )
}
