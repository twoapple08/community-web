// 게시글 조회수 기록 / 표시 도우미
// - 서버(sfa_record_post_view)가 같은 사람·같은 글은 하루 1번만 셈
// - SQL 을 아직 적용하지 않았으면 조용히 실패하고 조회수는 표시하지 않음

import { supabase } from '@/lib/supabase'

const VIEWER_KEY_STORAGE = 'sfa_viewer_key'
const RECENT_VIEWS_STORAGE = 'sfa_recent_views'
// 같은 탭에서 같은 글을 다시 열 때 서버 호출을 줄이는 시간 (서버도 하루 1번만 세므로 숫자에는 영향 없음)
const RECENT_VIEW_TTL_MS = 30 * 60 * 1000

const createViewerKey = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

/** 비로그인 방문자용 브라우저 식별값 (기기별 1개, 개인정보 없음) */
const getViewerKey = (): string | null => {
  try {
    let key = localStorage.getItem(VIEWER_KEY_STORAGE)
    if (!key || !/^[A-Za-z0-9-]{16,64}$/.test(key)) {
      key = createViewerKey()
      localStorage.setItem(VIEWER_KEY_STORAGE, key)
    }
    return key
  } catch {
    return null
  }
}

const readRecentViews = (): Record<string, number> => {
  try {
    const raw = sessionStorage.getItem(RECENT_VIEWS_STORAGE)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

const writeRecentViews = (map: Record<string, number>) => {
  try {
    sessionStorage.setItem(RECENT_VIEWS_STORAGE, JSON.stringify(map))
  } catch {}
}

// 같은 글을 동시에 두 번 기록하지 않도록 (개발 모드의 effect 두 번 실행 등)
const pending = new Map<string, Promise<number | null>>()

/**
 * 게시글 조회를 기록하고 새 조회수를 돌려줌
 * - 최근(30분)에 이미 기록했거나 실패하면 null (화면은 불러온 조회수를 그대로 사용)
 */
export const recordPostView = (postId: number | string): Promise<number | null> => {
  const id = String(postId)
  const numericId = Number(postId)
  if (!Number.isFinite(numericId)) return Promise.resolve(null)

  const existing = pending.get(id)
  if (existing) return existing

  const now = Date.now()
  const recent = readRecentViews()
  if (recent[id] && now - recent[id] < RECENT_VIEW_TTL_MS) return Promise.resolve(null)

  const task = (async () => {
    try {
      const { data, error } = await supabase.rpc('sfa_record_post_view', {
        p_post_id: numericId,
        p_viewer_key: getViewerKey(),
      })
      if (error) return null
      // 오래된 기록은 정리하면서 저장
      const next = readRecentViews()
      Object.keys(next).forEach((key) => {
        if (now - next[key] >= RECENT_VIEW_TTL_MS) delete next[key]
      })
      next[id] = now
      writeRecentViews(next)
      const count = typeof data === 'number' ? data : data == null ? null : Number(data)
      return count !== null && Number.isFinite(count) ? count : null
    } catch {
      return null
    } finally {
      pending.delete(id)
    }
  })()
  pending.set(id, task)
  return task
}

/** 조회수 짧게 표시 (9,999 까지는 그대로, 1만 이상은 1.2만) */
export const formatViewCount = (count: number): string => {
  if (count < 10000) return count.toLocaleString('ko-KR')
  const man = count / 10000
  return `${man >= 100 ? Math.round(man) : Math.round(man * 10) / 10}만`
}
