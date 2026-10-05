// 피드 목록 캐시 + 게시글 변경 이벤트
// 게시글을 열고 닫을 때마다 전체 목록을 다시 내려받지 않도록 해서 트래픽/렉을 줄입니다.

import type { FeedType } from '@/lib/postRoute'

export type PostsChangedEvent =
  | { kind: 'refresh' }
  | { kind: 'patch'; id: number | string; patch: Record<string, unknown> }
  | { kind: 'remove'; id: number | string }

type Listener = (event: PostsChangedEvent) => void

const listeners = new Set<Listener>()

export const onPostsChanged = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const emitPostsChanged = (event: PostsChangedEvent) => {
  if (event.kind !== 'patch') invalidateFeedCache()
  listeners.forEach((listener) => listener(event))
}

interface FeedCacheEntry<T> {
  posts: T[]
  at: number
}

const feedCache: Partial<Record<FeedType, FeedCacheEntry<unknown>>> = {}

/** 캐시가 이 시간보다 오래되면 화면은 캐시로 즉시 보여주고 뒤에서 조용히 새로고침 */
export const FEED_CACHE_FRESH_MS = 60 * 1000

export const getFeedCache = <T>(feed: FeedType): FeedCacheEntry<T> | null =>
  (feedCache[feed] as FeedCacheEntry<T> | undefined) ?? null

export const setFeedCache = <T>(feed: FeedType, posts: T[]) => {
  feedCache[feed] = { posts, at: Date.now() }
}

export const patchFeedCache = (id: number | string, patch: Record<string, unknown>) => {
  ;(Object.keys(feedCache) as FeedType[]).forEach((feed) => {
    const entry = feedCache[feed]
    if (!entry) return
    entry.posts = entry.posts.map((p) =>
      String((p as { id: number | string }).id) === String(id) ? { ...(p as object), ...patch } : p
    )
  })
}

export const invalidateFeedCache = (feed?: FeedType) => {
  if (feed) delete feedCache[feed]
  else {
    delete feedCache.clan
    delete feedCache.community
  }
}

// 목록에서 게시글을 열었는지 기록 -> 닫기 시 뒤로가기로 처리해 '뒤로가기 누르면 글이 다시 열리는' 문제 방지
let openedFromFeed = false

export const markOpenedFromFeed = () => {
  openedFromFeed = true
}

export const consumeOpenedFromFeed = (): boolean => {
  const value = openedFromFeed
  openedFromFeed = false
  return value
}
