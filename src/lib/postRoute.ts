import { supabase } from '@/lib/supabase'

export type FeedType = 'clan' | 'community'

export interface PostRouteInfo {
  id: number | string
  post_no?: number | null
  feed_type?: string | null
}

/** 피드별 게시글 번호(post_no)를 사용한 상세 주소. post_no 가 없으면 기존 id 사용 */
export const getPostPath = (post: PostRouteInfo): string => {
  const feed = post.feed_type === 'community' ? 'community' : 'clan'
  return `/${feed}/${post.post_no ?? post.id}`
}

const isMissingPostNoColumn = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === '42703' || /post_no/i.test(error.message || '')))

/**
 * 주소의 번호로 게시글 조회
 * 1) 피드별 번호(post_no) 우선
 * 2) post_no 컬럼이 아직 없거나 일치하는 글이 없으면 기존 전역 id 로 조회 (예전 공유 링크 호환)
 */
export const fetchPostByRouteNo = async (feedType: FeedType, routeNo: string) => {
  const no = Number(routeNo)
  if (!Number.isInteger(no) || no <= 0) return null

  const byNo = await supabase
    .from('posts')
    .select('*')
    .eq('feed_type', feedType)
    .eq('post_no', no)
    .maybeSingle()

  if (byNo.data) return byNo.data
  if (byNo.error && !isMissingPostNoColumn(byNo.error)) return null

  const byId = await supabase.from('posts').select('*').eq('id', no).maybeSingle()
  if (byId.data && (!byId.data.feed_type || byId.data.feed_type === feedType)) return byId.data
  return null
}

/** post_no 컬럼 유무와 관계없이 동작하는 목록 조회용 select 도우미 */
export const selectPostsWithNo = async <T>(
  columns: string,
  build: (cols: string) => PromiseLike<unknown>
): Promise<T[]> => {
  type Result = { data: T[] | null; error: { code?: string; message?: string } | null }
  const first = (await build(`${columns}, post_no`)) as Result
  if (!first.error) return first.data || []
  if (isMissingPostNoColumn(first.error)) {
    const second = (await build(columns)) as Result
    return second.data || []
  }
  return []
}
