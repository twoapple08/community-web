// 로그인 콜백 파라미터(토큰/코드)가 주소창에 남아 공유되는 사고를 막는 유틸

const SEARCH_AUTH_KEYS = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description']
const HASH_AUTH_KEYS = [
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'error',
  'error_code',
  'error_description',
]

const cleanHash = (hash: string): string => {
  if (!hash || hash === '#') return ''
  const params = new URLSearchParams(hash.slice(1))
  if (!HASH_AUTH_KEYS.some((k) => params.has(k))) return hash
  HASH_AUTH_KEYS.forEach((k) => params.delete(k))
  params.delete('type')
  const rest = params.toString()
  return rest ? `#${rest}` : ''
}

/** 인증 관련 파라미터를 제거한 search + hash 문자열 */
export const getCleanSearchAndHash = (): string => {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  SEARCH_AUTH_KEYS.forEach((k) => url.searchParams.delete(k))
  const search = url.searchParams.toString()
  return `${search ? `?${search}` : ''}${cleanHash(url.hash)}`
}

const hasAuthParams = (): boolean => {
  if (typeof window === 'undefined') return false
  return `${window.location.search}${window.location.hash}` !== getCleanSearchAndHash()
}

// 첫 진입 주소에 인증 파라미터가 있었는지 기억 (Supabase 가 먼저 지워도 Next 라우터 내부 주소는 남아 있을 수 있음)
let pendingRouterSync = hasAuthParams()

/** 현재 주소창에서 인증 파라미터를 지움 (Supabase 가 세션 처리를 끝낸 뒤에 호출) */
export const scrubAuthParamsFromUrl = () => {
  if (typeof window === 'undefined') return
  const current = `${window.location.search}${window.location.hash}`
  const cleaned = getCleanSearchAndHash()
  if (current !== cleaned || pendingRouterSync) {
    pendingRouterSync = false
    // state 를 null 로 넘겨야 Next.js 라우터 내부 주소도 함께 갱신되어 토큰/코드가 다시 복원되지 않음
    window.history.replaceState(null, '', `${window.location.pathname}${cleaned}`)
  }
}

/** 공유용 깨끗한 주소 (쿼리/해시 제거) */
export const getShareableUrl = (): string => {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}
