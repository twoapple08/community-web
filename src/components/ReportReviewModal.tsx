'use client'

// 신고 누적 게시글/댓글 상세 심사 창 (제작자 / 최고 관리자 전용)
// - 신고 대상 내용 + 누가 어떤 사유로 신고했는지 보여 주고, 삭제 확정 / 무고 처리(복구)를 결정
// - 확인/알림 팝업은 부모(AdminReportModal)가 포털 바깥에 띄움 → 팝업 여백 클릭이 이 창까지 닫지 않도록
// - DB 함수(SQL)가 아직 없으면 예전 방식(게시글 직접 조회/수정)으로 대체 동작

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { X, Trash2, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'

export type ReportTargetType = 'post' | 'comment'

export interface ReportReviewTarget {
  targetType: ReportTargetType
  targetId: number
}

export interface ReviewConfirmRequest {
  title: string
  message: string
  confirmText?: string
  isDanger?: boolean
  onConfirm: () => void
}

interface ReportReviewModalProps {
  target: ReportReviewTarget
  onClose: () => void
  /** 심사 결과가 DB 에 반영된 뒤 (피드/알림 새로고침용) */
  onChanged: () => void
  showAlert: (title: string, message: string) => void
  showConfirm: (request: ReviewConfirmRequest) => void
}

interface ReportEntry {
  reporter_id: string | null
  reporter_nickname: string
  reasons: string[]
  custom_reason: string | null
  created_at: string | null
}

interface PostTarget {
  id: number
  author_id: string | null
  author_nickname: string
  title: string
  content: string
  feed_type: string | null
  is_deleted: boolean
  report_review_status: string | null
  created_at: string | null
}

interface CommentTarget {
  id: number
  post_id: number | null
  parent_id: number | null
  author_id: string | null
  author_nickname: string
  content: string
  image_url: string | null
  created_at: string | null
  report_review_status: string | null
  post_title: string | null
  feed_type: string | null
}

type ReviewStatus = 'pending' | 'visible' | 'dismissed' | 'deleted'
type ReviewAction = 'delete' | 'dismiss'

type DetailsResult =
  | {
      kind: 'ok'
      /** rpc: 새 DB 함수 / direct: SQL 미적용 → 테이블 직접 조회 */
      source: 'rpc' | 'direct'
      post: PostTarget | null
      comment: CommentTarget | null
      /** null = 신고 내역을 불러올 수 없음 */
      reports: ReportEntry[] | null
    }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }

const NOT_FOUND_MESSAGE = '이미 영구 삭제되었거나 존재하지 않는 대상입니다.'
const ANONYMOUS = '익명사용자'

type DbError = { code?: string; message?: string } | null

/** DB 함수가 아직 없음 (SQL 미실행) */
const isMissingFunction = (error: DbError) =>
  Boolean(
    error &&
      (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || ''))
  )

const toStr = (v: unknown): string | null => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v))

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const feedLabelOf = (feed: string | null) => (feed === 'community' ? '커뮤니티 피드' : '클랜 피드')

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')

const normalizeReports = (raw: unknown, nickMap?: Record<string, string>): ReportEntry[] => {
  if (!Array.isArray(raw)) return []
  const list = raw.map((item) => {
    const row = (item || {}) as Record<string, unknown>
    const reporterId = toStr(row.reporter_id)
    const reasons = Array.isArray(row.reasons)
      ? row.reasons.map((r) => String(r ?? '').trim()).filter(Boolean)
      : typeof row.reasons === 'string' && row.reasons.trim()
      ? [row.reasons.trim()]
      : []
    return {
      reporter_id: reporterId,
      reporter_nickname:
        toStr(row.reporter_nickname)?.trim() || (reporterId && nickMap?.[reporterId]) || ANONYMOUS,
      reasons,
      custom_reason: toStr(row.custom_reason)?.trim() || null,
      created_at: toStr(row.created_at),
    }
  })
  // 최신 신고가 위로
  return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

const normalizePost = (raw: Record<string, unknown>, authorNick?: string): PostTarget => ({
  id: Number(raw.id),
  author_id: toStr(raw.author_id),
  author_nickname: toStr(raw.author_nickname)?.trim() || authorNick || ANONYMOUS,
  title: toStr(raw.title) || '(제목 없음)',
  content: toStr(raw.content) || '',
  feed_type: toStr(raw.feed_type),
  is_deleted: raw.is_deleted === true,
  report_review_status: toStr(raw.report_review_status),
  created_at: toStr(raw.created_at),
})

const normalizeComment = (
  raw: Record<string, unknown>,
  extra?: { authorNick?: string; postTitle?: string | null; feedType?: string | null }
): CommentTarget => ({
  id: Number(raw.id),
  post_id: toNum(raw.post_id),
  parent_id: toNum(raw.parent_id),
  author_id: toStr(raw.author_id),
  author_nickname: toStr(raw.author_nickname)?.trim() || extra?.authorNick || ANONYMOUS,
  content: toStr(raw.content) || '',
  image_url: toStr(raw.image_url),
  created_at: toStr(raw.created_at),
  report_review_status: toStr(raw.report_review_status),
  post_title: toStr(raw.post_title) ?? extra?.postTitle ?? null,
  feed_type: toStr(raw.feed_type) ?? extra?.feedType ?? null,
})

/** 게시글은 예전 방식으로 숨겨진 경우(is_deleted, 심사 상태 없음)도 '심사 대기'로 취급 */
const deriveStatus = (reviewStatus: string | null, hidden: boolean): ReviewStatus => {
  if (reviewStatus === 'pending' || reviewStatus === 'deleted' || reviewStatus === 'dismissed') return reviewStatus
  return hidden ? 'pending' : 'visible'
}

const STATUS_META: Record<ReviewStatus, { label: string; className: string }> = {
  pending: {
    label: '신고 누적으로 임시 숨김 · 심사 대기',
    className: 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300',
  },
  visible: {
    label: '정상 노출 중',
    className: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300',
  },
  dismissed: {
    label: '무고 처리됨',
    className: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  },
  deleted: {
    label: '삭제 확정됨',
    className: 'bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-800 text-red-700 dark:text-red-300',
  },
}

/** 확인 팝업 / 완료 문구 */
const getActionCopy = (targetType: ReportTargetType, status: ReviewStatus, action: ReviewAction) => {
  const isPost = targetType === 'post'
  const noun = isPost ? '게시글' : '댓글'

  if (action === 'dismiss') {
    if (status === 'deleted') {
      return {
        title: `${noun} 복구`,
        button: '복구',
        confirm: isPost
          ? '삭제 확정된 게시글을 복구하시겠습니까?\n피드에 다시 정상 노출되며 무고 처리로 기록됩니다.'
          : '삭제 확정된 댓글을 복구하시겠습니까?\n댓글 내용이 다시 정상 표시되며 무고 처리로 기록됩니다.',
        done: isPost ? '게시글이 복구되어 피드에 다시 정상 노출됩니다.' : '댓글이 복구되어 다시 정상 표시됩니다.',
      }
    }
    return {
      title: '무고 처리 (복구)',
      button: '무고 처리',
      confirm: isPost
        ? '신고가 부당하다고(무고) 판단하여 게시글을 복구하시겠습니까?\n피드에 다시 정상 노출되며, 지금까지 들어온 신고는 더 이상 누적되지 않습니다.'
        : '신고가 부당하다고(무고) 판단하여 댓글을 복구하시겠습니까?\n댓글이 다시 정상 표시되며, 지금까지 들어온 신고는 더 이상 누적되지 않습니다.',
      done: isPost ? '무고 처리되었습니다. 게시글이 피드에 다시 정상 노출됩니다.' : '무고 처리되었습니다. 댓글이 다시 정상 표시됩니다.',
    }
  }

  if (status === 'pending') {
    return {
      title: '삭제 확정',
      button: '삭제 확정',
      confirm: isPost
        ? '신고 내용이 합당하다고 판단하여 삭제를 확정하시겠습니까?\n게시글은 계속 숨김 처리되며, 신고로 삭제 확정된 글이 3개 이상인 작성자는 자동으로 블랙리스트에 등록됩니다.'
        : '신고 내용이 합당하다고 판단하여 삭제를 확정하시겠습니까?\n댓글 내용은 계속 가려지며, 달린 답글은 그대로 유지됩니다.',
      done: isPost ? '삭제가 확정되었습니다. 게시글은 계속 숨김 처리됩니다.' : '삭제가 확정되었습니다. 댓글 내용은 계속 가려집니다.',
    }
  }

  return {
    title: `${noun} 삭제`,
    button: '삭제',
    confirm: isPost
      ? '이 게시글을 삭제하시겠습니까?\n피드에서 즉시 숨겨지며 삭제 확정으로 기록됩니다. (필요하면 나중에 복구할 수 있습니다.)'
      : '이 댓글을 삭제(가림) 처리하시겠습니까?\n댓글 내용이 가려지며 달린 답글은 그대로 유지됩니다. (필요하면 나중에 복구할 수 있습니다.)',
    done: isPost ? '게시글이 삭제(숨김) 처리되었습니다.' : '댓글이 삭제(가림) 처리되었습니다.',
  }
}

const reviewErrorMessage = (code: string | undefined) => {
  if (code === 'forbidden') return '신고 심사는 제작자/최고 관리자만 할 수 있습니다.'
  if (code === 'not_found') return NOT_FOUND_MESSAGE
  return `처리 실패: ${code || '알 수 없는 오류'}`
}

// ---------------------------------------------------------------------
// 조회 (새 DB 함수 → 실패 시 예전 방식 직접 조회)
// ---------------------------------------------------------------------
const fetchNicknameMap = async (ids: (string | null)[]): Promise<Record<string, string>> => {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  if (unique.length === 0) return {}
  const { data } = await supabase.from('profiles').select('id, nickname').in('id', unique)
  const map: Record<string, string> = {}
  ;((data || []) as { id: string; nickname: string | null }[]).forEach((p) => {
    if (p.nickname && p.nickname.trim()) map[p.id] = p.nickname.trim()
  })
  return map
}

const fetchDirectReports = async (
  table: 'post_reports' | 'comment_reports',
  column: 'post_id' | 'comment_id',
  id: number
): Promise<ReportEntry[] | null> => {
  const { data, error } = await supabase.from(table).select('*').eq(column, id)
  if (error || !data) return null
  const rows = data as Record<string, unknown>[]
  const nickMap = await fetchNicknameMap(rows.map((r) => toStr(r.reporter_id)))
  return normalizeReports(rows, nickMap)
}

const fetchDirectDetails = async (target: ReportReviewTarget): Promise<DetailsResult> => {
  if (target.targetType === 'post') {
    const { data, error } = await supabase.from('posts').select('*').eq('id', target.targetId).maybeSingle()
    if (error) return { kind: 'error', message: `불러오기 실패: ${error.message}` }
    if (!data) return { kind: 'not_found' }
    const row = data as Record<string, unknown>
    const [nickMap, reports] = await Promise.all([
      fetchNicknameMap([toStr(row.author_id)]),
      fetchDirectReports('post_reports', 'post_id', target.targetId),
    ])
    const authorId = toStr(row.author_id)
    return {
      kind: 'ok',
      source: 'direct',
      post: normalizePost(row, authorId ? nickMap[authorId] : undefined),
      comment: null,
      reports,
    }
  }

  const { data, error } = await supabase.from('post_comments').select('*').eq('id', target.targetId).maybeSingle()
  if (error) return { kind: 'error', message: `불러오기 실패: ${error.message}` }
  if (!data) return { kind: 'not_found' }
  const row = data as Record<string, unknown>
  const postId = toNum(row.post_id)
  const [nickMap, reports, postRes] = await Promise.all([
    fetchNicknameMap([toStr(row.author_id)]),
    fetchDirectReports('comment_reports', 'comment_id', target.targetId),
    postId
      ? supabase.from('posts').select('id, title, feed_type').eq('id', postId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const post = (postRes.data || null) as { title?: string | null; feed_type?: string | null } | null
  const authorId = toStr(row.author_id)
  return {
    kind: 'ok',
    source: 'direct',
    post: null,
    comment: normalizeComment(row, {
      authorNick: authorId ? nickMap[authorId] : undefined,
      postTitle: post?.title ?? null,
      feedType: post?.feed_type ?? null,
    }),
    reports,
  }
}

const fetchReportDetails = async (target: ReportReviewTarget): Promise<DetailsResult> => {
  const { data, error } = await supabase.rpc('sfa_get_report_details', {
    p_target_type: target.targetType,
    p_target_id: target.targetId,
  })

  if (!error) {
    const d = (data || {}) as { reports?: unknown; target?: unknown }
    if (!d.target || typeof d.target !== 'object') return { kind: 'not_found' }
    const raw = d.target as Record<string, unknown>
    return {
      kind: 'ok',
      source: 'rpc',
      post: target.targetType === 'post' ? normalizePost(raw) : null,
      comment: target.targetType === 'comment' ? normalizeComment(raw) : null,
      reports: normalizeReports(d.reports),
    }
  }

  // 권한 없음은 그대로 안내 (직접 조회로 우회하지 않음)
  if (error.code === '42501') {
    return { kind: 'error', message: error.message || '신고 상세 내역은 제작자/최고 관리자만 볼 수 있습니다.' }
  }

  // DB 함수가 아직 없거나(SQL 미실행) 실행 오류 → 예전 방식으로 직접 조회
  return fetchDirectDetails(target)
}

// ---------------------------------------------------------------------
// 화면
// ---------------------------------------------------------------------
export default function ReportReviewModal({ target, onClose, onChanged, showAlert, showConfirm }: ReportReviewModalProps) {
  const { targetType, targetId } = target
  const [details, setDetails] = useState<DetailsResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const requestRef = useRef(0)

  // 늦게 도착한 이전 요청 결과가 최신 화면을 덮어쓰지 않도록 요청 번호로 구분
  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    const result = await fetchReportDetails({ targetType, targetId })
    if (requestId === requestRef.current) setDetails(result)
  }, [targetType, targetId])

  useEffect(() => {
    load()
  }, [load])

  const post = details?.kind === 'ok' ? details.post : null
  const comment = details?.kind === 'ok' ? details.comment : null
  const reports = details?.kind === 'ok' ? details.reports : null
  const isDirect = details?.kind === 'ok' && details.source === 'direct'

  const status: ReviewStatus | null = post
    ? deriveStatus(post.report_review_status, post.is_deleted)
    : comment
    ? deriveStatus(comment.report_review_status, false)
    : null

  const postContent = post?.content ?? ''
  const sanitizedContent = useMemo(() => sanitizeHtml(postContent), [postContent])

  /** 예전 방식(SQL 미적용) 게시글 처리 */
  const runLegacyPostAction = async (action: ReviewAction, current: PostTarget): Promise<{ ok: boolean; message: string }> => {
    if (action === 'dismiss') {
      const { error } = await supabase
        .from('posts')
        .update({ is_deleted: false, deleted_at: null, delete_reason: null })
        .eq('id', current.id)
      if (error) return { ok: false, message: `복구 실패: ${error.message}` }
      return {
        ok: true,
        message: '게시글이 성공적으로 복구되었습니다.\n(DB 업데이트(SQL 실행) 전이라 심사 결과 기록은 남지 않습니다.)',
      }
    }

    if (!current.is_deleted) {
      const { error } = await supabase
        .from('posts')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', current.id)
      if (error) return { ok: false, message: `삭제 실패: ${error.message}` }
      return {
        ok: true,
        message: '게시글이 숨김(삭제) 처리되었습니다.\n(DB 업데이트(SQL 실행) 전이라 심사 결과 기록은 남지 않습니다.)',
      }
    }

    // 예전 방식에는 심사 기록이 없으므로 숨김 상태만 유지
    return {
      ok: true,
      message: '게시글은 숨김 상태로 유지됩니다.\n심사 결과를 기록하려면 DB 업데이트(SQL 실행)가 필요합니다.',
    }
  }

  const runAction = async (action: ReviewAction, copy: ReturnType<typeof getActionCopy>) => {
    setProcessing(true)
    try {
      const { data, error } = await supabase.rpc('sfa_review_report', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_action: action,
      })

      if (error) {
        if (!isMissingFunction(error)) {
          showAlert('처리 실패', `처리 실패: ${error.message}`)
          await load()
          return
        }
        // DB 함수가 아직 없음: 게시글은 예전 방식으로, 댓글은 SQL 실행 필요 안내
        if (targetType === 'comment' || !post) {
          showAlert('DB 업데이트 필요', 'DB 업데이트(SQL 실행)가 필요합니다.')
          return
        }
        const legacy = await runLegacyPostAction(action, post)
        showAlert(legacy.ok ? '처리 완료' : '처리 실패', legacy.message)
        if (legacy.ok) onChanged()
        await load()
        return
      }

      const result = (data || {}) as { ok?: boolean; status?: string; error?: string }
      if (result.ok) {
        showAlert('처리 완료', copy.done)
        onChanged()
      } else {
        showAlert('처리 실패', reviewErrorMessage(result.error))
      }
      await load()
    } finally {
      setProcessing(false)
    }
  }

  const requestAction = (action: ReviewAction) => {
    if (!status || processing) return
    const copy = getActionCopy(targetType, status, action)
    showConfirm({
      title: copy.title,
      message: copy.confirm,
      confirmText: copy.button,
      isDanger: action === 'delete',
      onConfirm: () => runAction(action, copy),
    })
  }

  const runPermanentDelete = async (postId: number) => {
    setProcessing(true)
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    setProcessing(false)

    if (error) {
      showAlert('영구 삭제 실패', `영구 삭제 실패: ${error.message}`)
      return
    }
    showAlert('영구 삭제 완료', '게시글이 영구 삭제되었습니다.')
    onChanged()
    onClose()
  }

  const requestPermanentDelete = () => {
    if (!post || processing) return
    const postId = post.id
    showConfirm({
      title: '게시글 영구 삭제',
      message: '게시글을 영구 삭제하시겠습니까? 데이터베이스에서 완전히 삭제되며 복구할 수 없습니다.',
      confirmText: '영구 삭제',
      isDanger: true,
      onConfirm: () => runPermanentDelete(postId),
    })
  }

  // 영구 삭제: 삭제 확정된 글 (SQL 미적용 시에는 예전처럼 숨겨진 글에도 제공)
  const canPermanentDelete = Boolean(post) && (status === 'deleted' || (isDirect && Boolean(post?.is_deleted)))

  const btnBase =
    'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-none border transition disabled:opacity-50'
  const btnRestore = `${btnBase} bg-emerald-600 hover:bg-emerald-500 border-emerald-600 text-white`
  const btnDelete = `${btnBase} bg-red-600 hover:bg-red-500 border-red-600 text-white`
  const btnDeleteOutline = `${btnBase} bg-white dark:bg-transparent border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`
  const icon = (Icon: typeof Trash2) =>
    processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-zinc-950 border-2 border-red-600 rounded-none p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <h3 className="text-base font-black text-zinc-900 dark:text-white">
              {targetType === 'comment' ? '신고된 댓글 상세 심사' : '신고된 게시글 상세 심사'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-none shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!details ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>신고 내용을 불러오는 중...</span>
          </div>
        ) : details.kind === 'not_found' ? (
          <div className="py-12 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">{NOT_FOUND_MESSAGE}</div>
        ) : details.kind === 'error' ? (
          <div className="py-12 text-center text-xs font-semibold text-red-600 dark:text-red-400 break-words">
            {details.message}
          </div>
        ) : (
          <>
            {status && (
              <div className={`px-3 py-2 border rounded-none text-xs font-bold break-words ${STATUS_META[status].className}`}>
                상태: {STATUS_META[status].label}
              </div>
            )}

            {isDirect && (
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
                DB 업데이트(SQL 실행) 전이라 예전 방식으로 표시합니다. 일부 신고 내역이 보이지 않을 수 있습니다.
              </p>
            )}

            {post && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 break-words">
                  [{feedLabelOf(post.feed_type)}] 작성자 <span className="font-bold text-zinc-800 dark:text-zinc-200">{post.author_nickname}</span>
                  {post.created_at ? ` · ${formatDate(post.created_at)}` : ''}
                </p>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white break-words">{post.title}</h2>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm leading-relaxed max-h-72 overflow-y-auto rounded-none prose dark:prose-invert max-w-none">
                  <div className="[contain:paint]" dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
                </div>
              </div>
            )}

            {comment && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 break-words">
                  [{feedLabelOf(comment.feed_type)}] {comment.post_title || '(제목 없음)'}
                </p>
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 break-words">
                  {comment.parent_id ? '답글' : '댓글'} 작성자{' '}
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">{comment.author_nickname}</span>
                  {comment.created_at ? ` · ${formatDate(comment.created_at)}` : ''}
                </p>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none max-h-72 overflow-y-auto space-y-3">
                  {comment.content.trim() ? (
                    <p className="text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400">(글 내용 없음)</p>
                  )}
                  {comment.image_url && (
                    <img
                      src={comment.image_url}
                      alt="댓글 첨부 사진"
                      loading="lazy"
                      decoding="async"
                      className="block max-w-full max-h-60 object-contain border border-zinc-200 dark:border-zinc-800 rounded-none"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-black text-zinc-900 dark:text-white">
                신고 내역 ({reports ? reports.length : 0}건)
              </h4>
              {reports === null ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">신고 내역을 불러올 수 없습니다.</p>
              ) : reports.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">신고 내역이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {reports.map((r, idx) => (
                    <li
                      key={`${r.reporter_id || 'anon'}-${r.created_at || idx}-${idx}`}
                      className="p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-xs space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-zinc-900 dark:text-white break-words min-w-0">{r.reporter_nickname}</span>
                        {r.created_at && (
                          <span className="text-[10px] text-zinc-400 shrink-0">{formatDate(r.created_at)}</span>
                        )}
                      </div>
                      <p className="text-zinc-700 dark:text-zinc-300 break-words">
                        사유: {r.reasons.length > 0 ? r.reasons.join(', ') : r.custom_reason ? '기타' : '사유 미기재'}
                      </p>
                      {r.custom_reason && (
                        <p className="text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
                          직접 입력: {r.custom_reason}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              {status === 'pending' && (
                <>
                  <button type="button" onClick={() => requestAction('dismiss')} disabled={processing} className={btnRestore}>
                    {icon(RotateCcw)}
                    <span>무고 처리 (복구)</span>
                  </button>
                  <button type="button" onClick={() => requestAction('delete')} disabled={processing} className={btnDelete}>
                    {icon(Trash2)}
                    <span>삭제 확정</span>
                  </button>
                </>
              )}
              {(status === 'visible' || status === 'dismissed') && (
                <button type="button" onClick={() => requestAction('delete')} disabled={processing} className={btnDelete}>
                  {icon(Trash2)}
                  <span>삭제</span>
                </button>
              )}
              {status === 'deleted' && (
                <button type="button" onClick={() => requestAction('dismiss')} disabled={processing} className={btnRestore}>
                  {icon(RotateCcw)}
                  <span>복구</span>
                </button>
              )}
              {canPermanentDelete && (
                <button type="button" onClick={requestPermanentDelete} disabled={processing} className={btnDeleteOutline}>
                  {icon(Trash2)}
                  <span>영구 삭제</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
