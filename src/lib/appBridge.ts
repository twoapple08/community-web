// 앱 껍데기(안드로이드 Capacitor / 윈도우 Tauri)와 사이트를 잇는 다리
// - 앱 안인지 판별, 기본 브라우저로 열기, 창 닫기 동작, 앱 로그인(딥링크), 뒤로가기, 상태바, 알림 클릭 연결
// - 네이티브 모듈은 앱 안에서만 동적 import → 일반 브라우저 방문자는 추가 다운로드·동작이 전혀 없음
// - 일반 브라우저에서는 모든 함수가 아무 일도 하지 않거나 기본값을 돌려주며, 예외를 던지지 않는다
//
// [주의] Capacitor 플러그인 객체(App, Browser 등)는 then 을 가진 Proxy 라서 Promise 의 결과값으로 돌려주면
//        영원히 끝나지 않는다. 그래서 로더는 항상 "모듈"을 돌려주고, 쓰는 쪽에서 꺼내 쓴다.
//
// [주의] 이 파일은 supabase.ts 가 불러오므로 supabase 를 정적으로 import 하지 않는다 (순환 참조 방지).

export type AppPlatform = 'android' | 'windows'
export type CloseBehavior = 'ask' | 'exit' | 'tray'
export type CloseAction = 'exit' | 'tray' | 'cancel'

/** 안드로이드 껍데기가 User-Agent 끝에 붙이는 표식: " SFAClanApp/<버전> (android)" */
const ANDROID_UA_PATTERN = /SFAClanApp\/([\d.]+) \(android\)/
/** Firebase(FCM) 가 들어간 안드로이드 빌드면 추가로 붙는 표식 */
const ANDROID_PUSH_UA_MARK = 'SFAClanPush/1'

/** 구글 로그인을 마치고 앱으로 돌아오는 주소 (Supabase → Authentication → Redirect URLs 에 등록 필요) */
export const APP_AUTH_CALLBACK_URL = 'sfaclan://auth-callback'

interface SfaclanAppGlobal {
  platform?: string
  version?: string
}

declare global {
  interface Window {
    /** 윈도우 앱(Tauri)이 페이지 스크립트보다 먼저 넣어 주는 표식 */
    __SFACLAN_APP__?: SfaclanAppGlobal
  }
}

const readAppGlobal = (): SfaclanAppGlobal | null => {
  try {
    return window.__SFACLAN_APP__ ?? null
  } catch {
    return null
  }
}

const readUserAgent = (): string => {
  try {
    return typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  } catch {
    return ''
  }
}

/**
 * 앱 안이면 'android' | 'windows', 일반 브라우저면 null (동기, 첫 렌더 전에도 사용 가능)
 * 서버 렌더링에서는 항상 null 이므로 화면 모양(마크업)을 바꾸는 데 쓰면 안 된다 (effect / 이벤트 처리에서만 사용)
 */
export const getAppPlatform = (): AppPlatform | null => {
  if (typeof window === 'undefined') return null
  if (readAppGlobal()?.platform === 'windows') return 'windows'
  if (ANDROID_UA_PATTERN.test(readUserAgent())) return 'android'
  return null
}

export const isApp = (): boolean => getAppPlatform() !== null

/** 앱 껍데기 버전 (예: '1.0.0'). 브라우저면 null */
export const getAppVersion = (): string | null => {
  const platform = getAppPlatform()
  if (platform === 'windows') {
    const version = readAppGlobal()?.version
    return typeof version === 'string' && version ? version : null
  }
  if (platform === 'android') return ANDROID_UA_PATTERN.exec(readUserAgent())?.[1] ?? null
  return null
}

/** 안드로이드 앱이면서 FCM 푸시가 들어간 빌드인지 (앱이 꺼져 있어도 알림 받기 가능) */
export const hasNativePush = (): boolean =>
  getAppPlatform() === 'android' && readUserAgent().includes(ANDROID_PUSH_UA_MARK)

/**
 * 앱이 떠 있는 동안 사이트가 직접 알림을 띄우는 방식인지 (윈도우 앱, 또는 푸시가 없는 안드로이드 빌드)
 * FCM 푸시가 있는 안드로이드는 서버가 보내 주므로 false
 */
export const usesInPageNotifier = (): boolean => {
  const platform = getAppPlatform()
  return platform === 'windows' || (platform === 'android' && !hasNativePush())
}

// ---------------------------------------------------------------------
// 네이티브 모듈 로더 (앱 안에서만 호출. 실패하면 다음 호출 때 다시 시도)
// ---------------------------------------------------------------------
const memoLoader = <T>(load: () => Promise<T>) => {
  let pending: Promise<T> | null = null
  return (): Promise<T> => {
    if (!pending) {
      pending = load()
      pending.catch(() => {
        pending = null
      })
    }
    return pending
  }
}

export const loadCapacitorApp = memoLoader(() => import('@capacitor/app'))
export const loadCapacitorBrowser = memoLoader(() => import('@capacitor/browser'))
export const loadCapacitorPush = memoLoader(() => import('@capacitor/push-notifications'))
export const loadCapacitorLocalNotifications = memoLoader(() => import('@capacitor/local-notifications'))
export const loadCapacitorStatusBar = memoLoader(() => import('@capacitor/status-bar'))
const loadTauriCore = memoLoader(() => import('@tauri-apps/api/core'))
const loadTauriEvent = memoLoader(() => import('@tauri-apps/api/event'))

/** [윈도우 앱] Rust 명령 호출. 윈도우 앱이 아니거나 실패하면 예외 (호출하는 쪽에서 처리) */
export const tauriInvoke = async <T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (getAppPlatform() !== 'windows') throw new Error('윈도우 앱이 아닙니다.')
  const { invoke } = await loadTauriCore()
  return invoke<T>(command, args)
}

/** [윈도우 앱] Rust 가 보내는 이벤트 듣기. 반환값으로 해제. 윈도우 앱이 아니거나 실패하면 예외 */
export const tauriListen = async <T>(event: string, handler: (payload: T) => void): Promise<() => void> => {
  if (getAppPlatform() !== 'windows') throw new Error('윈도우 앱이 아닙니다.')
  const { listen } = await loadTauriEvent()
  const unlisten = await listen<T>(event, (e) => handler(e.payload))
  return () => {
    try {
      unlisten()
    } catch {
      // 이미 해제됨
    }
  }
}

// ---------------------------------------------------------------------
// 기본 브라우저로 열기
// ---------------------------------------------------------------------

/** 기기 기본 브라우저로 주소 열기 (앱 전용). 브라우저에서는 새 탭 */
export const openExternal = async (url: string): Promise<void> => {
  if (typeof window === 'undefined') return
  const platform = getAppPlatform()
  try {
    if (platform === 'android') {
      const { Browser } = await loadCapacitorBrowser()
      await Browser.open({ url })
      return
    }
    if (platform === 'windows') {
      await tauriInvoke('sfa_open_external', { url })
      return
    }
  } catch {
    // 네이티브 호출 실패 → 아래 기본 동작 (윈도우 앱은 새 창 요청도 기본 브라우저로 넘김)
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ---------------------------------------------------------------------
// [윈도우 앱] 창 닫기(X) 동작
// ---------------------------------------------------------------------
const isCloseBehavior = (value: unknown): value is CloseBehavior => value === 'ask' || value === 'exit' || value === 'tray'

/** [윈도우 앱] 창 닫기(X) 동작 설정 읽기. 다른 환경에서는 'exit' */
export const getCloseBehavior = async (): Promise<CloseBehavior> => {
  if (getAppPlatform() !== 'windows') return 'exit'
  try {
    const value = await tauriInvoke<string>('sfa_get_close_behavior')
    return isCloseBehavior(value) ? value : 'ask'
  } catch {
    return 'ask'
  }
}

/** [윈도우 앱] 창 닫기(X) 동작 설정 저장. 다른 환경에서는 무시 */
export const setCloseBehavior = async (behavior: CloseBehavior): Promise<void> => {
  if (getAppPlatform() !== 'windows' || !isCloseBehavior(behavior)) return
  try {
    await tauriInvoke('sfa_set_close_behavior', { behavior })
  } catch {
    // 저장 실패 → 기존 설정 유지
  }
}

/** [윈도우 앱] 창 닫기 팝업에서 고른 결과 전달 (완전히 종료 / 트레이로 / 취소, 다음부터 묻지 않기) */
export const sendCloseDecision = async (action: CloseAction, remember: boolean): Promise<void> => {
  if (getAppPlatform() !== 'windows') return
  try {
    await tauriInvoke('sfa_close_decision', { action, remember: Boolean(remember) && action !== 'cancel' })
  } catch {
    // 앱 쪽 명령이 없으면 아무 일도 하지 않음
  }
}

// ---------------------------------------------------------------------
// [안드로이드 앱] 상태바 색을 사이트 테마에 맞춤 (가능한 기기에서만, 실패는 무시)
// ---------------------------------------------------------------------
const STATUS_BAR_COLORS = { dark: '#09090b', light: '#ffffff' } as const

export const setAppStatusBarTheme = async (theme: 'dark' | 'light'): Promise<void> => {
  if (getAppPlatform() !== 'android') return
  try {
    const { StatusBar, Style } = await loadCapacitorStatusBar()
    // Style.Dark = 어두운 배경용 밝은 글씨, Style.Light = 밝은 배경용 어두운 글씨
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
    await StatusBar.setBackgroundColor({ color: STATUS_BAR_COLORS[theme] }).catch(() => {})
  } catch {
    // 상태바 플러그인이 없는 빌드 → 무시
  }
}

// ---------------------------------------------------------------------
// 앱 로그인 (기기 기본 브라우저에서 구글 로그인 → sfaclan://auth-callback 으로 돌아옴)
// ---------------------------------------------------------------------
const LOGIN_START_FAILED = '로그인 창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * 앱 안에서 로그인 시작. 웹뷰 안에서는 구글 로그인이 막혀 있으므로 기본 브라우저로 연다.
 * (PKCE 확인값은 이 웹뷰 저장소에 남고, 딥링크로 돌아온 code 를 같은 웹뷰에서 교환)
 */
export const startAppLogin = async (): Promise<{ error: string | null }> => {
  if (!isApp()) return { error: LOGIN_START_FAILED }
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: APP_AUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error || !data?.url) return { error: LOGIN_START_FAILED }
    await openExternal(data.url)
    return { error: null }
  } catch {
    return { error: LOGIN_START_FAILED }
  }
}

/** sfaclan://auth-callback 주소인지 */
export const isAuthCallbackUrl = (url: string | null | undefined): boolean =>
  typeof url === 'string' && /^sfaclan:\/\/auth-callback(?:[/?#]|$)/i.test(url.trim())

/** 주소의 ?쿼리 와 #해시 값을 모두 읽음 (오류 정보가 # 뒤에 오는 경우 대비) */
const readCallbackParams = (url: string): URLSearchParams => {
  const trimmed = url.trim()
  const hashIndex = trimmed.indexOf('#')
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : ''
  const queryIndex = beforeHash.indexOf('?')
  const params = new URLSearchParams(queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '')
  new URLSearchParams(hash).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value)
  })
  return params
}

// 같은 로그인 코드를 두 번 교환하지 않도록 기록 (실행 주소 다시 읽기 / 새로고침 / 이벤트 중복 대비)
const HANDLED_CODES_KEY = 'sfa_app_auth_codes'
const HANDLED_CODES_MAX = 5
const handledCodesMemory = new Set<string>()

const readHandledCodes = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HANDLED_CODES_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

const isCodeHandled = (code: string) => handledCodesMemory.has(code) || readHandledCodes().includes(code)

const markCodeHandled = (code: string) => {
  handledCodesMemory.add(code)
  try {
    const next = [...readHandledCodes().filter((c) => c !== code), code].slice(-HANDLED_CODES_MAX)
    localStorage.setItem(HANDLED_CODES_KEY, JSON.stringify(next))
  } catch {
    // 저장 실패 → 메모리 기록만 사용
  }
}

/**
 * 딥링크(sfaclan://auth-callback?code=...)로 돌아온 로그인 마무리.
 * - handled: 로그인 콜백 주소였는지
 * - error: 사용자에게 보여 줄 실패 사유 (성공·중복이면 null). 성공하면 onAuthStateChange 가 화면을 갱신
 */
export const completeAppLogin = async (url: string): Promise<{ handled: boolean; error: string | null }> => {
  if (!isAuthCallbackUrl(url)) return { handled: false, error: null }

  if (getAppPlatform() === 'android') {
    try {
      const { Browser } = await loadCapacitorBrowser()
      await Browser.close()
    } catch {
      // 안드로이드에서는 지원하지 않을 수 있음 (앱이 앞으로 오면서 자동으로 닫힘)
    }
  }

  const params = readCallbackParams(url)
  const errorText = params.get('error_description') || params.get('error')
  if (errorText) {
    return { handled: true, error: `구글 로그인을 완료하지 못했습니다.\n(${errorText.replace(/\+/g, ' ')})` }
  }

  const code = params.get('code')
  if (!code) return { handled: true, error: '로그인 정보가 전달되지 않았습니다. 다시 시도해 주세요.' }
  if (isCodeHandled(code)) return { handled: true, error: null }
  markCodeHandled(code)

  try {
    const { supabase } = await import('@/lib/supabase')
    // 로그인 흐름 번호가 함께 왔으면 그 흐름의 확인값으로 교환 (없으면 가장 최근 확인값)
    const flowId = params.get('sb_flow_id')
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    if (error) {
      return { handled: true, error: `로그인을 완료하지 못했습니다. 로그인 버튼을 눌러 다시 시도해 주세요.\n(${error.message})` }
    }
    return { handled: true, error: null }
  } catch {
    return { handled: true, error: '로그인을 완료하지 못했습니다. 로그인 버튼을 눌러 다시 시도해 주세요.' }
  }
}

// ---------------------------------------------------------------------
// 앱 실행 환경 연결 (AppShell 이 처음 뜰 때 1번)
// ---------------------------------------------------------------------
export interface AppRuntimeHandlers {
  /** sfaclan:// 딥링크 (로그인 콜백 등) */
  onDeepLink: (url: string) => void
  /** OS 알림을 눌렀을 때. 원본 데이터 그대로 (윈도우는 JSON 문자열, 안드로이드는 객체) → parseAppNotificationData 로 읽기 */
  onNotificationClick: (payload: unknown) => void
  /** [윈도우] 창 닫기(X)를 눌렀고 설정이 '매번 묻기'일 때 → 닫기 팝업 표시 */
  onCloseRequested: () => void
  /** [안드로이드] 뒤로가기 버튼. 사이트가 직접 처리했으면(열린 창 닫기 등) true */
  onBackButton?: () => boolean
}

interface WindowsPending {
  deepLink?: string | null
  notification?: string | null
}

/**
 * 딥링크·뒤로가기·창 닫기 요청·알림 클릭을 연결. 반환값으로 모두 해제.
 * 윈도우는 듣기 준비가 끝난 뒤 sfa_app_ready 를 알리고, 앱이 꺼져 있을 때 들어온 딥링크/알림 클릭을 꺼내 처리.
 * 일반 브라우저에서는 아무 일도 하지 않음
 */
export const initAppRuntime = (handlers: AppRuntimeHandlers): (() => void) => {
  const platform = getAppPlatform()
  if (!platform) return () => {}

  let stopped = false
  const cleanups: Array<() => void> = []
  const keep = (cleanup: () => void) => {
    if (stopped) {
      try {
        cleanup()
      } catch {}
      return
    }
    cleanups.push(cleanup)
  }
  const safely = (run: () => void) => {
    if (stopped) return
    try {
      run()
    } catch {
      // 사이트 처리 중 오류가 앱 연결을 끊지 않도록
    }
  }

  const setupAndroid = async () => {
    try {
      const { App } = await loadCapacitorApp()
      const urlHandle = await App.addListener('appUrlOpen', (event) => safely(() => handlers.onDeepLink(event.url)))
      keep(() => void urlHandle.remove())

      const backHandle = await App.addListener('backButton', ({ canGoBack }) => {
        safely(() => {
          if (handlers.onBackButton?.()) return
          if (canGoBack) window.history.back()
          else void App.minimizeApp().catch(() => {})
        })
      })
      keep(() => void backHandle.remove())

      // 딥링크로 앱이 처음 실행된 경우 (이미 처리한 로그인 코드는 completeAppLogin 이 걸러 냄)
      const launch = await App.getLaunchUrl().catch(() => undefined)
      if (launch?.url && isAuthCallbackUrl(launch.url)) safely(() => handlers.onDeepLink(launch.url))
    } catch {
      // App 플러그인이 없는 빌드
    }

    try {
      const { LocalNotifications } = await loadCapacitorLocalNotifications()
      const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (action) =>
        safely(() => handlers.onNotificationClick(action.notification?.extra))
      )
      keep(() => void handle.remove())
    } catch {
      // 로컬 알림 플러그인이 없는 빌드
    }

    if (hasNativePush()) {
      try {
        const { PushNotifications } = await loadCapacitorPush()
        const handle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) =>
          safely(() => handlers.onNotificationClick(action.notification?.data))
        )
        keep(() => void handle.remove())
      } catch {
        // 푸시 플러그인이 없는 빌드
      }
    }
  }

  const setupWindows = async () => {
    const listenSafely = async <T>(event: string, handler: (payload: T) => void) => {
      try {
        keep(await tauriListen<T>(event, (payload) => safely(() => handler(payload))))
      } catch {
        // 이벤트 권한이 없거나 앱 쪽 준비가 안 됨
      }
    }
    await listenSafely<string>('sfa:deep-link', (url) => handlers.onDeepLink(String(url ?? '')))
    await listenSafely<string>('sfa:notification-click', (payload) => handlers.onNotificationClick(payload))
    await listenSafely<null>('sfa:close-requested', () => handlers.onCloseRequested())
    if (stopped) return

    // 듣기 준비 완료 → 이제부터 창 닫기(X)는 사이트 팝업으로, 알림 클릭은 이벤트로 전달됨
    await tauriInvoke('sfa_app_ready').catch(() => {})
    if (stopped) return

    const pending = await tauriInvoke<WindowsPending | null>('sfa_take_pending').catch(() => null)
    if (pending?.deepLink) safely(() => handlers.onDeepLink(String(pending.deepLink)))
    if (pending?.notification) safely(() => handlers.onNotificationClick(pending.notification))
  }

  void (platform === 'android' ? setupAndroid() : setupWindows()).catch(() => {})

  return () => {
    stopped = true
    cleanups.splice(0).forEach((cleanup) => {
      try {
        cleanup()
      } catch {}
    })
  }
}
