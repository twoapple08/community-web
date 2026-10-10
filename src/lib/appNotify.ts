// 앱 OS 알림(안드로이드 상단 알림 / 윈도우 오른쪽 아래 알림) 관련 공용 함수
// - 일반 브라우저에서는 OS 알림을 쓰지 않는다 (빨간 점만). 여기 함수들은 브라우저에서 아무 일도 하지 않는다
// - 알림 켜고 끄기(계정 설정 notify_*)는 "OS 알림을 띄울지"만 정한다. 알림 기록·빨간 점은 그대로 쌓인다
// - 전달 방식
//   A) 안드로이드 + Firebase(FCM) 빌드: 서버가 푸시를 보냄. 앱이 앞에 떠 있을 때 온 푸시는 로컬 알림으로 다시 띄움
//   B) 윈도우 앱 / Firebase 없는 안드로이드 빌드: 앱이 떠 있는 동안(트레이 포함) 사이트가 직접 새 알림을 감시해 띄움
//      (Supabase Realtime + 60초 확인, 시작 전에 있던 알림은 띄우지 않음)
//
// [주의] Capacitor 플러그인 객체는 then 을 가진 Proxy 라서 async 함수의 반환값으로 돌려주면 안 된다 (appBridge 참고)

import { supabase } from '@/lib/supabase'
import {
  getAppPlatform,
  hasNativePush,
  isApp,
  loadCapacitorLocalNotifications,
  loadCapacitorPush,
  tauriInvoke,
  usesInPageNotifier,
} from '@/lib/appBridge'
import {
  appNotificationKey,
  buildAppealOsNotification,
  buildReportOsNotification,
  buildSuggestionOsNotification,
  buildUserOsNotification,
  parseAppNotificationData,
  type AdminReportRow,
  type AppealRow,
  type AppNotificationData,
  type OsNotification,
  type SuggestionRow,
  type UserNotification,
} from '@/lib/notifications'
import { fetchMySettings, onProfileChanged, type MySettings } from '@/lib/userProfile'

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

/** 이 기기에서 알림 받기 (기기별, 기본 켜짐) */
const DEVICE_NOTIFY_KEY = 'sfa_app_notify'
/** 로그인 후 알림 권한을 이미 한 번 물어봤는지 */
const PERMISSION_ASKED_KEY = 'sfa_app_notify_asked'
/** 이 기기의 FCM 토큰 (로그아웃 때 계정에서 떼어 내기 위해 보관) */
const PUSH_TOKEN_KEY = 'sfa_push_token'
/** 이 기기 토큰이 서버에 어떤 계정으로 등록돼 있는지 표시 ('1'). 로그아웃 버튼 없이 세션이 끝났을 때 토큰을 폐기하는 기준 */
const PUSH_OWNER_KEY = 'sfa_push_registered'

/** 안드로이드 알림 채널 (서버 푸시 android.notification.channel_id 와 같아야 함) */
export const APP_NOTIFICATION_CHANNEL_ID = 'sfa_alerts'
const APP_NOTIFICATION_CHANNEL = {
  id: APP_NOTIFICATION_CHANNEL_ID,
  name: '알림',
  description: '좋아요·댓글·답글·신고·건의사항·이의제기 알림',
  importance: 5 as const, // HIGH: 화면 위에 잠깐 펼쳐지는 알림(헤즈업)
  visibility: 1 as const,
  vibration: true,
  lights: true,
  lightColor: '#10b981',
}
const NOTIFICATION_SMALL_ICON = 'ic_stat_notify'
const NOTIFICATION_ICON_COLOR = '#10b981'

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 저장 불가(사생활 보호 모드 등) → 무시
  }
}

// ---------------------------------------------------------------------
// 권한
// ---------------------------------------------------------------------
const toPermissionState = (state: string | undefined | null): NotificationPermissionState => {
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'denied'
  if (state === 'prompt' || state === 'prompt-with-rationale') return 'prompt'
  return 'unsupported'
}

/** OS 알림 권한 상태 (윈도우는 권한이 필요 없어 항상 'granted', 앱이 아니면 'unsupported') */
export const getNotificationPermission = async (): Promise<NotificationPermissionState> => {
  const platform = getAppPlatform()
  if (platform === 'windows') return 'granted'
  if (platform !== 'android') return 'unsupported'
  try {
    const { LocalNotifications } = await loadCapacitorLocalNotifications()
    const status = await LocalNotifications.checkPermissions()
    return toPermissionState(status.display)
  } catch {
    // 로컬 알림 플러그인이 없는 빌드 → 푸시 플러그인으로 확인 (같은 안드로이드 권한)
  }
  if (!hasNativePush()) return 'unsupported'
  try {
    const { PushNotifications } = await loadCapacitorPush()
    const status = await PushNotifications.checkPermissions()
    return toPermissionState(status.receive)
  } catch {
    return 'unsupported'
  }
}

/** OS 알림 권한 요청 (안드로이드 13 이상에서만 실제 창이 뜸. 윈도우는 'granted', 앱이 아니면 'unsupported') */
export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  const platform = getAppPlatform()
  if (platform === 'windows') return 'granted'
  if (platform !== 'android') return 'unsupported'
  writeStorage(PERMISSION_ASKED_KEY, '1')

  let state: NotificationPermissionState = 'unsupported'
  try {
    const { LocalNotifications } = await loadCapacitorLocalNotifications()
    const status = await LocalNotifications.requestPermissions()
    state = toPermissionState(status.display)
  } catch {
    if (hasNativePush()) {
      try {
        const { PushNotifications } = await loadCapacitorPush()
        const status = await PushNotifications.requestPermissions()
        state = toPermissionState(status.receive)
      } catch {
        state = 'unsupported'
      }
    }
  }

  // 방금 허용했으면 이 기기 푸시 등록까지 이어서 (로그인 상태일 때만)
  if (state === 'granted') void registerPush().catch(() => {})
  return state
}

// ---------------------------------------------------------------------
// 안드로이드 알림 채널 / OS 알림 띄우기
// ---------------------------------------------------------------------
let channelsReady: Promise<void> | null = null

/** [안드로이드] 알림 채널 만들기 (여러 번 불러도 1번만. 이미 있으면 그대로) */
const ensureAndroidChannels = (): Promise<void> => {
  if (getAppPlatform() !== 'android') return Promise.resolve()
  if (!channelsReady) {
    channelsReady = (async () => {
      try {
        const { LocalNotifications } = await loadCapacitorLocalNotifications()
        await LocalNotifications.createChannel(APP_NOTIFICATION_CHANNEL)
      } catch {
        // 로컬 알림 플러그인이 없는 빌드
      }
      if (hasNativePush()) {
        try {
          const { PushNotifications } = await loadCapacitorPush()
          await PushNotifications.createChannel(APP_NOTIFICATION_CHANNEL)
        } catch {
          // 푸시 플러그인이 없는 빌드
        }
      }
    })()
  }
  return channelsReady
}

/** 로컬 알림 번호 (32비트 정수). 같은 알림은 같은 번호 → 두 번 와도 하나로 보임 */
export const localNotificationIdFor = (data: Pick<AppNotificationData, 'kind' | 'id'>): number => {
  // FNV-1a 32bit
  const key = appNotificationKey(data)
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash & 0x7fffffff) || 1
}

/**
 * OS 알림 띄우기 (앱 전용). 이 기기 알림이 꺼져 있거나 권한이 없으면 띄우지 않고 false.
 * 안드로이드는 권한이 없을 때 갑자기 권한 창이 뜨지 않도록 미리 확인한다.
 */
export const showOsNotification = async (notification: OsNotification): Promise<boolean> => {
  if (!isDeviceNotifyEnabled()) return false
  const platform = getAppPlatform()
  try {
    if (platform === 'windows') {
      await tauriInvoke('sfa_notify', {
        title: notification.title,
        body: notification.body,
        data: JSON.stringify(notification.data),
      })
      return true
    }
    if (platform === 'android') {
      if ((await getNotificationPermission()) !== 'granted') return false
      await ensureAndroidChannels()
      const { LocalNotifications } = await loadCapacitorLocalNotifications()
      await LocalNotifications.schedule({
        notifications: [
          {
            id: localNotificationIdFor(notification.data),
            title: notification.title,
            body: notification.body,
            largeBody: notification.body,
            channelId: APP_NOTIFICATION_CHANNEL_ID,
            smallIcon: NOTIFICATION_SMALL_ICON,
            iconColor: NOTIFICATION_ICON_COLOR,
            autoCancel: true,
            // 바로 띄우는 알림 → '정확한 알람' 권한이 필요 없음 (true 면 설정 화면이 열릴 수 있음)
            isExactNotification: false,
            extra: notification.data,
          },
        ],
      })
      return true
    }
  } catch {
    // 앱 쪽 명령/플러그인이 없거나 실패 → 조용히 무시 (빨간 점·알림 목록은 그대로)
  }
  return false
}

// ---------------------------------------------------------------------
// [안드로이드 + FCM] 푸시 토큰 등록 / 해제
// ---------------------------------------------------------------------
/** 지금 이 기기로 푸시를 받을 계정 (로그인 중일 때만) */
let pushOwnerUserId: string | null = null
/** 이번 실행에서 이미 푸시 등록을 마친 계정 (권한 허용 직후·로그인 직후에 두 번 등록하지 않도록) */
let pushRegisteredFor: string | null = null
let pushRegistering: Promise<void> | null = null
let pushListenersReady: Promise<void> | null = null

const savePushToken = async (token: string) => {
  if (!token) return
  writeStorage(PUSH_TOKEN_KEY, token)
  if (!pushOwnerUserId || !isDeviceNotifyEnabled()) return
  try {
    const { error } = await supabase.rpc('sfa_register_push_token', { p_token: token, p_platform: 'android' })
    if (!error) writeStorage(PUSH_OWNER_KEY, '1')
  } catch {
    // SQL 미적용 등 → 앱이 떠 있을 때만 알림 (다음 실행 때 다시 등록 시도)
  }
}

/** 앱이 앞에 떠 있을 때 온 푸시 → 시스템이 띄워 주지 않으므로 같은 내용으로 로컬 알림 */
const showForegroundPush = (push: { title?: string; body?: string; data?: unknown }) => {
  // 로그아웃 상태에서 남은 푸시가 오면 띄우지 않음
  if (!pushOwnerUserId) return
  const data = parseAppNotificationData(push.data)
  if (!data) return
  const title = (push.title || '').trim()
  const body = (push.body || '').trim()
  if (!title && !body) return
  void showOsNotification({ title: title || '스틱파이터 커뮤니티', body, data })
}

const ensurePushListeners = (): Promise<void> => {
  if (!pushListenersReady) {
    pushListenersReady = (async () => {
      const { PushNotifications } = await loadCapacitorPush()
      await PushNotifications.addListener('registration', (token) => {
        void savePushToken(token.value)
      })
      await PushNotifications.addListener('registrationError', () => {
        // 등록 실패 (구글 플레이 서비스 없음 등) → 앱이 떠 있을 때 알림만 불가. 조용히 무시
      })
      await PushNotifications.addListener('pushNotificationReceived', (push) => {
        showForegroundPush(push)
      })
    })()
    pushListenersReady.catch(() => {
      pushListenersReady = null
    })
  }
  return pushListenersReady
}

/** 이 기기를 푸시 받을 기기로 등록 (로그인 + 기기 알림 켜짐 + 권한 허용일 때만). 결과 토큰은 'registration' 에서 저장 */
const registerPush = (): Promise<void> => {
  const owner = pushOwnerUserId
  if (!hasNativePush() || !owner || !isDeviceNotifyEnabled()) return Promise.resolve()
  if (pushRegisteredFor === owner) return Promise.resolve()
  if (pushRegistering) return pushRegistering

  pushRegistering = (async () => {
    if ((await getNotificationPermission()) !== 'granted') return
    try {
      await ensureAndroidChannels()
      await ensurePushListeners()
      const { PushNotifications } = await loadCapacitorPush()
      await PushNotifications.register()
      if (pushOwnerUserId === owner) pushRegisteredFor = owner
    } catch {
      // Firebase 설정이 없는 빌드 등 → 무시
    }
  })().finally(() => {
    pushRegistering = null
  })
  return pushRegistering
}

/**
 * 이 기기 푸시 토큰을 계정에서 떼어 냄.
 * revokeDevice=true 면 기기의 FCM 토큰 자체도 지움 (기기 알림 끄기). 서버 삭제에 실패해도 토큰을 지워 엉뚱한 계정 알림을 막음
 */
const unregisterPush = async (revokeDevice: boolean): Promise<void> => {
  if (!hasNativePush()) return
  pushRegisteredFor = null
  const token = readStorage(PUSH_TOKEN_KEY)
  let removedOnServer = false
  if (token) {
    try {
      const { error } = await supabase.rpc('sfa_unregister_push_token', { p_token: token })
      removedOnServer = !error
    } catch {
      removedOnServer = false
    }
  }
  if (revokeDevice || (token && !removedOnServer)) {
    try {
      const { PushNotifications } = await loadCapacitorPush()
      await PushNotifications.unregister()
    } catch {
      // 무시
    }
    writeStorage(PUSH_TOKEN_KEY, null)
  }
  // 서버에서 지웠거나 기기 토큰 자체를 폐기했으면 더 이상 이 기기에 등록된 계정 없음
  writeStorage(PUSH_OWNER_KEY, null)
}

// ---------------------------------------------------------------------
// 기기 설정 (이 기기에서 알림 받기)
// ---------------------------------------------------------------------

/** 이 기기(앱)에서 OS 알림 받기 – 기기별 설정 (기본 켜짐) */
export const isDeviceNotifyEnabled = (): boolean => readStorage(DEVICE_NOTIFY_KEY) !== '0'

/** 이 기기 OS 알림 켜기/끄기 (안드로이드는 푸시 등록/해제까지 처리, 켤 때 권한이 없으면 물어봄) */
export const setDeviceNotifyEnabled = async (enabled: boolean): Promise<void> => {
  writeStorage(DEVICE_NOTIFY_KEY, enabled ? '1' : '0')
  if (getAppPlatform() !== 'android') return
  try {
    if (enabled) {
      let permission = await getNotificationPermission()
      if (permission === 'prompt') permission = await requestNotificationPermission()
      if (permission === 'granted') await registerPush()
    } else {
      await unregisterPush(true)
    }
  } catch {
    // 무시 (설정 값은 이미 저장됨)
  }
}

// ---------------------------------------------------------------------
// 로그인 / 로그아웃 때 (AppShell 에서 호출)
// ---------------------------------------------------------------------

/**
 * 로그인한 유저의 앱 알림 준비 (로그인 직후·앱 시작 때).
 * - 안드로이드: 알림 채널 만들기, 처음 1번만 알림 권한 묻기(안드로이드 13+), FCM 빌드면 푸시 등록
 * - 일반 브라우저에서는 아무 일도 하지 않음 (권한도 묻지 않음)
 */
export const setupAppNotifications = async (userId: string): Promise<void> => {
  if (!isApp() || !userId) return
  pushOwnerUserId = userId
  if (getAppPlatform() !== 'android') return

  await ensureAndroidChannels()
  if (readStorage(PERMISSION_ASKED_KEY) !== '1' && isDeviceNotifyEnabled()) {
    const permission = await getNotificationPermission()
    if (permission === 'prompt') await requestNotificationPermission()
    else writeStorage(PERMISSION_ASKED_KEY, '1')
  }
  if (pushOwnerUserId !== userId) return // 그사이 로그아웃
  await registerPush()
}

/** 로그아웃 직전 (supabase.auth.signOut 전에 불러야 서버에서 토큰을 지울 권한이 있음) */
export const releaseAppNotifications = async (): Promise<void> => {
  pushOwnerUserId = null
  if (!hasNativePush()) return
  await unregisterPush(false)
}

/**
 * 로그아웃 버튼을 거치지 않고 세션이 끝났을 때 (다른 기기에서 전체 로그아웃, 앱이 꺼져 있는 동안 세션 만료 등).
 * 이미 로그인 정보가 없어 서버에서 토큰을 지울 수 없으므로 기기의 FCM 토큰 자체를 폐기한다.
 * (서버는 다음 푸시 때 '등록되지 않은 토큰' 응답을 받고 그 기록을 지움)
 * 정상 로그아웃 뒤나 한 번도 등록한 적 없는 기기에서는 아무 일도 하지 않음
 */
export const handleAppSessionEnded = async (): Promise<void> => {
  const hadOwner = pushOwnerUserId !== null || readStorage(PUSH_OWNER_KEY) === '1'
  pushOwnerUserId = null
  pushRegisteredFor = null
  if (!hasNativePush() || !hadOwner) return
  try {
    const { PushNotifications } = await loadCapacitorPush()
    await PushNotifications.unregister()
  } catch {
    // 무시
  }
  writeStorage(PUSH_TOKEN_KEY, null)
  writeStorage(PUSH_OWNER_KEY, null)
}

// ---------------------------------------------------------------------
// B) 앱이 떠 있는 동안 직접 감시해 띄우기 (윈도우 / FCM 없는 안드로이드)
// ---------------------------------------------------------------------
export type NotifierRole = 'creator' | 'super_admin' | 'admin' | null

type NotifierKind = AppNotificationData['kind']
type NotifySettingKey =
  | 'notify_post_like'
  | 'notify_post_comment'
  | 'notify_comment_reply'
  | 'notify_admin_report'
  | 'notify_admin_suggestion'
  | 'notify_admin_appeal'
type NotifySettings = Pick<MySettings, NotifySettingKey>

const NOTIFY_SETTING_KEYS: readonly NotifySettingKey[] = [
  'notify_post_like',
  'notify_post_comment',
  'notify_comment_reply',
  'notify_admin_report',
  'notify_admin_suggestion',
  'notify_admin_appeal',
]

const NOTIFIER_POLL_MS = 60 * 1000
/** 한 번 확인할 때 띄우는 최대 개수 (절전 후 깨어났을 때 알림이 쏟아지지 않도록. 나머지는 빨간 점·목록으로 확인) */
const NOTIFIER_MAX_PER_ROUND = 5

/** 역할별로 감시할 알림 종류 – 제작자: 신고·건의·이의제기 / 최고관리자: 신고·이의제기 / 나머지: 내 알림만 */
export const notifierKindsForRole = (role: NotifierRole): NotifierKind[] => {
  if (role === 'creator') return ['user', 'report', 'suggestion', 'appeal']
  if (role === 'super_admin') return ['user', 'report', 'appeal']
  return ['user']
}

interface NotifierSource {
  table: string
  columns: string
  /** 내 알림만 (user_notifications) */
  recipientOnly?: boolean
}

const NOTIFIER_SOURCES: Record<NotifierKind, NotifierSource> = {
  user: { table: 'user_notifications', columns: '*', recipientOnly: true },
  report: { table: 'admin_notifications', columns: 'id, type, message, reporter_id, post_id, comment_id' },
  suggestion: { table: 'site_suggestions', columns: 'id, user_id, user_nickname, category, title' },
  appeal: { table: 'blacklist_appeals', columns: 'id, user_id, user_nickname, message' },
}

type NotifierRow = { id: number | string } & Record<string, unknown>

/** 한 행 → OS 알림 (계정 설정에서 꺼 둔 종류, 내가 만든 신고·건의는 null) */
const buildNotifierNotification = (
  kind: NotifierKind,
  row: NotifierRow,
  userId: string,
  settings: NotifySettings
): OsNotification | null => {
  if (kind === 'user') {
    const n = row as unknown as UserNotification
    if (n.recipient_id && n.recipient_id !== userId) return null
    const key = `notify_${n.type}` as NotifySettingKey
    if (!NOTIFY_SETTING_KEYS.includes(key) || settings[key] === false) return null
    return buildUserOsNotification(n)
  }
  if (kind === 'report') {
    const r = row as unknown as AdminReportRow & { reporter_id?: string | null }
    if (settings.notify_admin_report === false) return null
    if (r.type === 'report' && r.reporter_id && r.reporter_id === userId) return null
    return buildReportOsNotification(r)
  }
  if (kind === 'suggestion') {
    const s = row as unknown as SuggestionRow & { user_id?: string | null }
    if (settings.notify_admin_suggestion === false) return null
    if (s.user_id && s.user_id === userId) return null
    return buildSuggestionOsNotification(s)
  }
  if (settings.notify_admin_appeal === false) return null
  return buildAppealOsNotification(row as unknown as AppealRow)
}

let notifierSeq = 0

/**
 * 앱 알림 감시 시작 (B 방식). 반환값으로 중지.
 * - 시작 시점의 가장 큰 id 를 기준점으로 잡아 그 뒤에 생긴 알림만 띄움
 * - 실시간 수신 + 60초마다 확인 (창이 숨겨져 있어도 계속, 앱 안에서만)
 * - 같은 알림은 한 번만, 계정 설정(notify_*)과 이 기기 설정(sfa_app_notify)을 따름
 * - FCM 푸시가 있는 안드로이드 빌드·일반 브라우저에서는 아무 일도 하지 않음
 */
export const startLocalNotifier = (options: { userId: string; role: NotifierRole }): (() => void) => {
  const { userId, role } = options
  if (!userId || !usesInPageNotifier()) return () => {}

  let stopped = false
  const kinds = notifierKindsForRole(role)
  const seq = ++notifierSeq
  const shown = new Set<string>()
  /** 종류별 기준점 (undefined = 아직 못 잡음 → 잡을 때까지 띄우지 않음) */
  const watermarks: Partial<Record<NotifierKind, number>> = {}
  const settings: NotifySettings = {
    notify_post_like: true,
    notify_post_comment: true,
    notify_comment_reply: true,
    notify_admin_report: true,
    notify_admin_suggestion: true,
    notify_admin_appeal: true,
  }

  // 계정 알림 설정 (개인 설정에서 바꾸면 바로 반영)
  fetchMySettings(userId)
    .then((mine) => {
      if (!mine || stopped) return
      NOTIFY_SETTING_KEYS.forEach((key) => {
        settings[key] = mine[key] !== false
      })
    })
    .catch(() => {})
  const offProfileChanged = onProfileChanged((event) => {
    if (event.userId !== userId) return
    NOTIFY_SETTING_KEYS.forEach((key) => {
      const value = event[key]
      if (typeof value === 'boolean') settings[key] = value
    })
  })

  const deliver = (kind: NotifierKind, row: NotifierRow) => {
    if (stopped) return
    const notification = buildNotifierNotification(kind, row, userId, settings)
    if (!notification) return
    const key = appNotificationKey(notification.data)
    if (shown.has(key)) return
    shown.add(key)
    void showOsNotification(notification)
  }

  const baseQuery = (kind: NotifierKind, columns: string) => {
    const source = NOTIFIER_SOURCES[kind]
    const query = supabase.from(source.table).select(columns)
    return source.recipientOnly ? query.eq('recipient_id', userId) : query
  }

  const captureWatermark = async (kind: NotifierKind) => {
    const { data, error } = await baseQuery(kind, 'id').order('id', { ascending: false }).limit(1)
    if (error || stopped) return
    const top = Number((data as unknown as NotifierRow[] | null)?.[0]?.id ?? 0)
    watermarks[kind] = Math.max(watermarks[kind] ?? 0, Number.isFinite(top) ? top : 0)
  }

  const pollKind = async (kind: NotifierKind) => {
    const mark = watermarks[kind]
    if (mark === undefined) {
      await captureWatermark(kind)
      return
    }
    // 새 알림 중 최신 몇 개만 (오래된 순으로 띄움)
    const { data, error } = await baseQuery(kind, NOTIFIER_SOURCES[kind].columns)
      .gt('id', mark)
      .order('id', { ascending: false })
      .limit(NOTIFIER_MAX_PER_ROUND)
    if (error || !data || stopped) return
    const rows = data as unknown as NotifierRow[]
    rows.forEach((row) => {
      const id = Number(row.id)
      if (Number.isFinite(id)) watermarks[kind] = Math.max(watermarks[kind] ?? 0, id)
    })
    rows.reverse().forEach((row) => deliver(kind, row))
  }

  const pollAll = () => {
    kinds.forEach((kind) => {
      void pollKind(kind).catch(() => {})
    })
  }

  // 실시간 수신: 종류마다 채널을 따로 (어느 표가 실시간 설정이 안 돼 있어도 나머지는 동작)
  const handleInsert = (kind: NotifierKind) => (payload: { new: unknown }) => {
    const row = payload.new as NotifierRow | null
    const id = Number(row?.id)
    if (!row || !Number.isFinite(id) || id <= 0) return
    const mark = watermarks[kind]
    if (mark !== undefined) {
      if (id <= mark) return
      watermarks[kind] = id
    }
    deliver(kind, row)
  }

  const channels = kinds.map((kind) => {
    const source = NOTIFIER_SOURCES[kind]
    return supabase
      .channel(`sfa-app-notify-${kind}-${userId}-${seq}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: source.table,
          ...(source.recipientOnly ? { filter: `recipient_id=eq.${userId}` } : {}),
        },
        handleInsert(kind)
      )
      .subscribe()
  })

  pollAll() // 처음에는 기준점만 잡음
  const interval = window.setInterval(pollAll, NOTIFIER_POLL_MS)

  return () => {
    stopped = true
    window.clearInterval(interval)
    offProfileChanged()
    channels.forEach((channel) => {
      void supabase.removeChannel(channel)
    })
  }
}
