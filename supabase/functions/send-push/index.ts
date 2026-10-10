// =====================================================================
//  SFAClan 앱 푸시 발송 (Supabase Edge Function: send-push)
//  * import 가 하나도 없음 → Supabase 대시보드 편집기에 그대로 붙여넣어 배포 가능
//  * 흐름
//    1) DB 트리거(sfa_push_dispatch)가 pg_net 으로 { table, id } 와 비밀값 헤더(x-sfa-push-secret)를 보냄
//    2) 비밀값 확인 → DB 함수 sfa_push_build 로 제목·내용·받을 기기 목록 계산
//    3) FCM HTTP v1 로 기기마다 발송 (동시에 최대 10개)
//    4) 앱 삭제 등으로 더 이상 쓸 수 없는 토큰은 sfa_push_drop_token 으로 삭제
//  * 필요한 Secrets
//    - PUSH_WEBHOOK_SECRET : SQL 의 select public.sfa_get_push_secret(); 결과
//    - FCM_SERVICE_ACCOUNT : Firebase 서비스 계정 키 JSON 파일 내용 전체 (base64 로 넣어도 됨)
//    - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY : Supabase 가 자동으로 넣어 줌
//  * 배포할 때 JWT 검증(Verify JWT / Enforce JWT verification)은 끈다 (비밀값 헤더로 대신 확인)
//  * 결과: { sent, failed, dropped } (보낼 기기가 없으면 skipped 사유 포함)
// =====================================================================

const ALLOWED_TABLES = new Set(['user_notifications', 'admin_notifications', 'site_suggestions', 'blacklist_appeals'])
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const SEND_CONCURRENCY = 10
const FETCH_TIMEOUT_MS = 8000
const MAX_REQUEST_BYTES = 16 * 1024
// FCM 메시지 전체 4KB 제한을 넘지 않도록 넉넉히 자름 (평소 문구는 이보다 훨씬 짧음)
const MAX_TITLE_CHARS = 200
const MAX_BODY_CHARS = 1000

// 앱(안드로이드)과 맞춘 값: 알림 채널 / 상태바 아이콘 / 강조색
const ANDROID_CHANNEL_ID = 'sfa_alerts'
const ANDROID_SMALL_ICON = 'ic_stat_notify'
const ANDROID_COLOR = '#10b981'

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
  token_uri: string
}

interface PushTarget {
  token: string
  platform?: string | null
}

interface PushBuild {
  title?: string | null
  body?: string | null
  data?: Record<string, unknown> | null
  tokens?: PushTarget[] | null
  reason?: string | null
}

type SendOutcome = 'sent' | 'failed' | 'dropped'

interface FcmErrorBody {
  error?: {
    code?: number
    status?: string
    message?: string
    details?: Array<{
      '@type'?: string
      errorCode?: string
      fieldViolations?: Array<{ field?: string; description?: string }>
    }>
  }
}

/** 설정(Secrets) 누락·형식 오류 → 500 으로 응답 */
class ConfigError extends Error {}

// ---------------------------------------------------------------------
// 작은 도우미
// ---------------------------------------------------------------------
const jsonResponse = (status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  })

const readEnv = (name: string): string => (Deno.env.get(name) ?? '').trim()

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** 길이가 달라도 시간이 일정한 문자열 비교 (비밀값 추측 방지) */
const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder()
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  const length = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** 글자(코드 포인트) 기준으로 자르기 (이모지가 반으로 잘리지 않게) */
const clipChars = (text: string, max: number): string => {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

const base64ToBytes = (base64: string) => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const textToBase64Url = (text: string): string => bytesToBase64Url(new TextEncoder().encode(text))

/** 정해진 개수만큼만 동시에 실행 */
const runPool = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

// ---------------------------------------------------------------------
// Firebase 서비스 계정 → Google OAuth 접근 토큰 (RS256 JWT, WebCrypto)
// ---------------------------------------------------------------------
let accountCache: { raw: string; account: ServiceAccount } | null = null

const loadServiceAccount = (): ServiceAccount => {
  const raw = readEnv('FCM_SERVICE_ACCOUNT')
  if (!raw) throw new ConfigError('FCM_SERVICE_ACCOUNT 가 설정되지 않았습니다.')
  if (accountCache && accountCache.raw === raw) return accountCache.account

  // JSON 그대로 또는 base64 로 인코딩한 JSON 둘 다 허용
  let text = raw
  if (!text.startsWith('{')) {
    try {
      text = new TextDecoder().decode(base64ToBytes(text))
    } catch {
      throw new ConfigError('FCM_SERVICE_ACCOUNT 형식이 올바르지 않습니다. (서비스 계정 JSON 내용 전체를 넣어 주세요)')
    }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new ConfigError('FCM_SERVICE_ACCOUNT 형식이 올바르지 않습니다. (JSON 이 아님)')
  }

  const tokenUri = String(parsed.token_uri ?? '').trim()
  const account: ServiceAccount = {
    project_id: String(parsed.project_id ?? '').trim(),
    client_email: String(parsed.client_email ?? '').trim(),
    // 비밀값에 줄바꿈이 \n 글자로 들어가 있어도 처리
    private_key: String(parsed.private_key ?? '')
      .replace(/\\n/g, '\n')
      .replace(/\r\n?/g, '\n'),
    token_uri: /^https:\/\//i.test(tokenUri) ? tokenUri : DEFAULT_TOKEN_URI,
  }

  if (!account.project_id || !account.client_email || !account.private_key.includes('PRIVATE KEY')) {
    throw new ConfigError('FCM_SERVICE_ACCOUNT 에 project_id / client_email / private_key 가 없습니다.')
  }

  accountCache = { raw, account }
  return account
}

/** DER 길이 표기 */
const derLength = (length: number): number[] => {
  if (length < 0x80) return [length]
  const bytes: number[] = []
  let rest = length
  while (rest > 0) {
    bytes.unshift(rest & 0xff)
    rest = Math.floor(rest / 256)
  }
  return [0x80 | bytes.length, ...bytes]
}

/** 'BEGIN RSA PRIVATE KEY'(PKCS#1) 형식이면 WebCrypto 가 읽는 PKCS#8 로 감쌈 */
const wrapPkcs1AsPkcs8 = (pkcs1: Uint8Array) => {
  const version = [0x02, 0x01, 0x00]
  // AlgorithmIdentifier { rsaEncryption, NULL }
  const algorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]
  const octetHeader = [0x04, ...derLength(pkcs1.length)]
  const innerLength = version.length + algorithm.length + octetHeader.length + pkcs1.length
  const header = [0x30, ...derLength(innerLength), ...version, ...algorithm, ...octetHeader]
  const out = new Uint8Array(header.length + pkcs1.length)
  out.set(header, 0)
  out.set(pkcs1, header.length)
  return out
}

let signingKeyCache: { pem: string; key: Promise<CryptoKey> } | null = null

const getSigningKey = (pem: string): Promise<CryptoKey> => {
  if (signingKeyCache && signingKeyCache.pem === pem) return signingKeyCache.key

  const isPkcs1 = pem.includes('BEGIN RSA PRIVATE KEY')
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')

  let der: ReturnType<typeof base64ToBytes>
  try {
    der = base64ToBytes(body)
  } catch {
    return Promise.reject(new ConfigError('FCM_SERVICE_ACCOUNT 의 private_key 를 읽을 수 없습니다.'))
  }
  if (isPkcs1) der = wrapPkcs1AsPkcs8(der)

  const key = crypto.subtle
    .importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    .catch(() => {
      throw new ConfigError('FCM_SERVICE_ACCOUNT 의 private_key 를 읽을 수 없습니다.')
    })

  signingKeyCache = { pem, key }
  key.catch(() => {
    if (signingKeyCache?.key === key) signingKeyCache = null
  })
  return key
}

// 접근 토큰은 만료 60초 전까지 재사용 (함수 인스턴스가 살아 있는 동안)
let accessTokenCache: { cacheKey: string; token: string; expiresAt: number } | null = null
let accessTokenInFlight: { cacheKey: string; promise: Promise<string> } | null = null

const fetchAccessToken = async (account: ServiceAccount, cacheKey: string): Promise<string> => {
  const iat = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = { iss: account.client_email, scope: FCM_SCOPE, aud: account.token_uri, iat, exp: iat + 3600 }
  const unsigned = `${textToBase64Url(JSON.stringify(header))}.${textToBase64Url(JSON.stringify(claims))}`

  const key = await getSigningKey(account.private_key)
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)))
  const assertion = `${unsigned}.${bytesToBase64Url(signature)}`

  const res = await fetch(account.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const payload = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number | string; error?: string }
    | null

  if (!res.ok || !payload?.access_token) {
    const code = payload?.error ? `, ${payload.error}` : ''
    if (res.status === 400 || res.status === 401) {
      // invalid_grant 등: 서비스 계정 키가 틀렸거나 삭제됨
      throw new ConfigError(`Google 인증 실패 (HTTP ${res.status}${code}). FCM_SERVICE_ACCOUNT 를 확인해 주세요.`)
    }
    throw new Error(`Google 인증 토큰 발급 실패 (HTTP ${res.status}${code})`)
  }

  const expiresIn = Number(payload.expires_in) > 0 ? Number(payload.expires_in) : 3600
  accessTokenCache = { cacheKey, token: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 }
  return payload.access_token
}

const getAccessToken = async (account: ServiceAccount, forceRefresh = false): Promise<string> => {
  const cacheKey = `${account.client_email}|${account.token_uri}`

  if (!forceRefresh && accessTokenCache && accessTokenCache.cacheKey === cacheKey && Date.now() < accessTokenCache.expiresAt - 60_000) {
    return accessTokenCache.token
  }
  // 여러 기기에 동시에 보낼 때 토큰 발급은 한 번만
  if (accessTokenInFlight && accessTokenInFlight.cacheKey === cacheKey) {
    return accessTokenInFlight.promise
  }
  if (forceRefresh && accessTokenCache?.cacheKey === cacheKey) accessTokenCache = null

  const promise = fetchAccessToken(account, cacheKey)
  accessTokenInFlight = { cacheKey, promise }
  try {
    return await promise
  } finally {
    if (accessTokenInFlight?.promise === promise) accessTokenInFlight = null
  }
}

// ---------------------------------------------------------------------
// Supabase DB 함수 호출 (service_role)
// ---------------------------------------------------------------------
const callRpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  const baseUrl = readEnv('SUPABASE_URL').replace(/\/+$/, '')
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!baseUrl || !serviceKey) throw new ConfigError('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')

  const headers: Record<string, string> = {
    apikey: serviceKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  // 예전 방식 키(JWT)만 Authorization 에도 넣음 (새 sb_secret_ 키는 apikey 헤더만 사용)
  if (serviceKey.split('.').length === 3) headers.Authorization = `Bearer ${serviceKey}`

  const res = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`DB 함수 ${name} 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }
  return (text ? JSON.parse(text) : null) as T
}

const dropToken = async (token: string): Promise<void> => {
  try {
    await callRpc<boolean>('sfa_push_drop_token', { p_token: token })
  } catch (err) {
    console.error(`[send-push] 만료 토큰 삭제 실패: ${errorMessage(err)}`)
  }
}

// ---------------------------------------------------------------------
// FCM 발송
// ---------------------------------------------------------------------
const fcmErrorCode = (body: FcmErrorBody | null): string =>
  body?.error?.details?.find((d) => typeof d?.errorCode === 'string')?.errorCode ?? ''

/** 이 토큰으로는 다시 보낼 수 없는 오류인지 (앱 삭제·재설치, 잘못된 토큰) */
const isDeadToken = (httpStatus: number, body: FcmErrorBody | null): boolean => {
  const code = fcmErrorCode(body)
  if (code === 'UNREGISTERED' || httpStatus === 404) return true

  // INVALID_ARGUMENT 는 메시지 자체 문제일 수도 있으므로 '토큰' 때문일 때만 삭제
  const status = body?.error?.status ?? ''
  if (httpStatus === 400 && (code === 'INVALID_ARGUMENT' || status === 'INVALID_ARGUMENT')) {
    const aboutToken =
      body?.error?.details?.some((d) => d?.fieldViolations?.some((v) => v?.field === 'message.token')) ||
      /registration token/i.test(body?.error?.message ?? '')
    return Boolean(aboutToken)
  }
  return false
}

const retryDelayMs = (res: Response): number => {
  const seconds = Number(res.headers.get('retry-after'))
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 3000)
  return 600
}

const sendToToken = async (
  account: ServiceAccount,
  token: string,
  message: Record<string, unknown>
): Promise<SendOutcome> => {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`
  let refreshAuth = false

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      const accessToken = await getAccessToken(account, refreshAuth)
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { ...message, token } }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (err) {
      if (err instanceof ConfigError) throw err
      if (attempt === 0) {
        await sleep(500)
        continue
      }
      console.error(`[send-push] FCM 요청 실패: ${errorMessage(err)}`)
      return 'failed'
    }

    if (res.ok) {
      await res.text().catch(() => '')
      return 'sent'
    }

    const body = (await res.json().catch(() => null)) as FcmErrorBody | null

    if (isDeadToken(res.status, body)) {
      await dropToken(token)
      return 'dropped'
    }

    // 접근 토큰 만료 → 새로 받아서 한 번 더
    if (res.status === 401 && attempt === 0) {
      refreshAuth = true
      continue
    }

    // 일시적인 오류 → 잠깐 쉬고 한 번 더
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(retryDelayMs(res))
      continue
    }

    const code = fcmErrorCode(body) || body?.error?.status || 'UNKNOWN'
    const hint = code === 'SENDER_ID_MISMATCH' ? ' (앱의 google-services.json 과 서비스 계정의 Firebase 프로젝트가 다름)' : ''
    console.error(`[send-push] FCM 발송 실패: HTTP ${res.status} ${code}${hint}`)
    return 'failed'
  }

  return 'failed'
}

/** FCM data 는 모든 값이 문자열이어야 함 */
const toStringData = (data: Record<string, unknown> | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!data || typeof data !== 'object') return out
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue
    out[key] = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return out
}

// ---------------------------------------------------------------------
// 요청 처리
// ---------------------------------------------------------------------
const parseTarget = (payload: unknown): { table: string; id: number } | null => {
  if (!payload || typeof payload !== 'object') return null
  const { table, id } = payload as { table?: unknown; id?: unknown }
  const tableName = typeof table === 'string' ? table.trim() : ''
  const rowId =
    typeof id === 'number' ? id : typeof id === 'string' && /^\d{1,15}$/.test(id.trim()) ? Number(id.trim()) : Number.NaN
  if (!ALLOWED_TABLES.has(tableName) || !Number.isSafeInteger(rowId) || rowId <= 0) return null
  return { table: tableName, id: rowId }
}

const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' }, { Allow: 'POST' })
  }

  // 1) 비밀값 확인
  const expectedSecret = readEnv('PUSH_WEBHOOK_SECRET')
  if (!expectedSecret) {
    console.error('[send-push] PUSH_WEBHOOK_SECRET 가 설정되지 않았습니다.')
    return jsonResponse(500, { error: 'not_configured' })
  }
  const providedSecret = req.headers.get('x-sfa-push-secret') ?? ''
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return jsonResponse(401, { error: 'unauthorized' })
  }

  // 2) 요청 내용 { table, id }
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_REQUEST_BYTES) {
    return jsonResponse(413, { error: 'payload_too_large' })
  }
  let payload: unknown
  try {
    const raw = await req.text()
    if (raw.length > MAX_REQUEST_BYTES) return jsonResponse(413, { error: 'payload_too_large' })
    payload = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }
  const target = parseTarget(payload)
  if (!target) {
    return jsonResponse(400, { error: 'invalid_target' })
  }

  try {
    // 3) 제목·내용·받을 기기 (안드로이드 토큰만, 중복 제거)
    const build = await callRpc<PushBuild | null>('sfa_push_build', { p_table: target.table, p_id: target.id })
    const rawTargets: PushTarget[] = Array.isArray(build?.tokens) ? (build?.tokens as PushTarget[]) : []
    const tokenSet = new Set<string>()
    for (const t of rawTargets) {
      const value = t && typeof t.token === 'string' ? t.token.trim() : ''
      if (value && (t.platform ?? 'android') === 'android') tokenSet.add(value)
    }
    const tokens = Array.from(tokenSet)

    if (tokens.length === 0) {
      return jsonResponse(200, { sent: 0, failed: 0, dropped: 0, skipped: build?.reason || 'no_tokens' })
    }

    const title = clipChars(String(build?.title ?? '').trim(), MAX_TITLE_CHARS)
    const body = clipChars(String(build?.body ?? '').trim(), MAX_BODY_CHARS)
    if (!title || !body) {
      return jsonResponse(200, { sent: 0, failed: 0, dropped: 0, skipped: 'empty_message' })
    }

    // 4) 발송 (설정 오류는 기기마다 반복하지 않도록 먼저 확인)
    const account = loadServiceAccount()
    await getAccessToken(account)

    const message = {
      notification: { title, body },
      data: toStringData(build?.data),
      android: {
        priority: 'HIGH',
        notification: { channel_id: ANDROID_CHANNEL_ID, icon: ANDROID_SMALL_ICON, color: ANDROID_COLOR },
      },
    }

    const outcomes = await runPool(tokens, SEND_CONCURRENCY, (token) =>
      sendToToken(account, token, message).catch((err): SendOutcome => {
        console.error(`[send-push] 발송 중 오류: ${errorMessage(err)}`)
        return 'failed'
      })
    )

    const result = { sent: 0, failed: 0, dropped: 0 }
    for (const outcome of outcomes) result[outcome] += 1
    if (result.failed > 0 || result.dropped > 0) {
      console.log(`[send-push] ${target.table}#${target.id}: 성공 ${result.sent} / 실패 ${result.failed} / 만료 토큰 삭제 ${result.dropped}`)
    }
    return jsonResponse(200, result)
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[send-push] 설정 오류: ${err.message}`)
      return jsonResponse(500, { error: 'not_configured', message: err.message })
    }
    console.error(`[send-push] 처리 실패 (${target.table}#${target.id}): ${errorMessage(err)}`)
    return jsonResponse(500, { error: 'internal_error' })
  }
}

Deno.serve((req: Request) =>
  handleRequest(req).catch((err) => {
    console.error(`[send-push] 예상하지 못한 오류: ${errorMessage(err)}`)
    return jsonResponse(500, { error: 'internal_error' })
  })
)

export {}
