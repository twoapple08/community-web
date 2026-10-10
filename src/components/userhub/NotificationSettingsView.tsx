'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import CustomPopup from '../CustomPopup'
import { CLOSED_POPUP, SAVE_ERROR_MESSAGE, Section, ToggleRow, defaultSettings, type PopupState } from './SettingsParts'
import { fetchMySettings, updateMySettings, type MySettings, type SettingsPatch } from '@/lib/userProfile'
import { getAppPlatform, getCloseBehavior, setCloseBehavior, type AppPlatform, type CloseBehavior } from '@/lib/appBridge'
import {
  getNotificationPermission,
  isDeviceNotifyEnabled,
  requestNotificationPermission,
  setDeviceNotifyEnabled,
  type NotificationPermissionState,
} from '@/lib/appNotify'
import { Loader2 } from 'lucide-react'

// 계정 단위 알림 스위치 (profiles 컬럼). 앱의 OS 알림을 띄울지만 정함 – 꺼도 알림 목록·빨간 점은 그대로
type NotifyKey =
  | 'notify_post_like'
  | 'notify_post_comment'
  | 'notify_comment_reply'
  | 'notify_admin_report'
  | 'notify_admin_appeal'
  | 'notify_admin_suggestion'

const CLOSE_OPTIONS: { value: CloseBehavior; label: string; description: string }[] = [
  { value: 'ask', label: '매번 묻기', description: '닫기(X)를 누를 때마다 완전히 닫을지, 트레이로 내릴지 물어봅니다.' },
  { value: 'exit', label: '완전히 닫기', description: '앱이 완전히 종료되어 알림도 받지 않습니다.' },
  { value: 'tray', label: '트레이로 내리기', description: '작업 표시줄 오른쪽 트레이에 남아 알림을 계속 받습니다.' },
]

// 앱 안인지는 서버 렌더링에서 항상 null → 하이드레이션 때는 서버 값(null)을 쓰고, 그 뒤 실제 값으로 다시 그림
const subscribeNothing = () => () => {}
const getServerPlatform = (): AppPlatform | null => null
const useAppPlatform = () => useSyncExternalStore(subscribeNothing, getAppPlatform, getServerPlatform)

interface NotificationSettingsViewProps {
  userId: string
  /** 제작자 (건의함 알림) */
  isCreator: boolean
  /** 제작자 또는 최고관리자 (신고·이의제기 알림) */
  isCreatorOrSuperAdmin: boolean
}

/** 마이 프로필 > 알림 > 알림 설정 (앱에서 휴대폰·PC 알림으로 띄울 항목 / 이 기기 / 창 닫기) */
export default function NotificationSettingsView({ userId, isCreator, isCreatorOrSuperAdmin }: NotificationSettingsViewProps) {
  const [settings, setSettings] = useState<MySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [popup, setPopup] = useState<PopupState>(CLOSED_POPUP)
  const closePopup = () => setPopup((p) => ({ ...p, isOpen: false }))
  const showAlert = (title: string, message: string) =>
    setPopup({ isOpen: true, title, message, type: 'alert', onConfirm: closePopup })

  // 저장 중인 스위치는 연타 방지
  const [savingKeys, setSavingKeys] = useState<NotifyKey[]>([])

  // 이 기기 (앱 안에서만): 기기별 알림 켜기/끄기, OS 알림 권한, 윈도우 창 닫기 동작
  const platform = useAppPlatform()
  const [deviceEnabled, setDeviceEnabledState] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null)
  const [savingDevice, setSavingDevice] = useState(false)
  const [requestingPermission, setRequestingPermission] = useState(false)
  const [closeBehavior, setCloseBehaviorState] = useState<CloseBehavior | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMySettings(userId)
      .catch(() => null)
      .then((data) => {
        if (cancelled) return
        setSettings(data ?? defaultSettings(userId))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!platform) return
    let cancelled = false

    const refreshDevice = () => {
      getNotificationPermission()
        .catch((): NotificationPermissionState => 'unsupported')
        .then((state) => {
          if (cancelled) return
          setPermission(state)
          setDeviceEnabledState(isDeviceNotifyEnabled())
        })
    }
    refreshDevice()

    // 기기 설정에서 알림 권한을 바꾸고 앱으로 돌아오면 다시 확인
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshDevice()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    if (platform === 'windows') {
      getCloseBehavior()
        .catch((): CloseBehavior => 'ask')
        .then((behavior) => {
          if (!cancelled) setCloseBehaviorState(behavior)
        })
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [platform])

  // 스위치는 즉시 저장 (먼저 화면을 바꾸고, 실패하면 되돌림). 새 컬럼이 없으면(SQL 미적용) 저장 실패 팝업
  const handleToggle = async (key: NotifyKey, next: boolean) => {
    if (!settings || savingKeys.includes(key)) return
    setSettings((prev) => (prev ? { ...prev, [key]: next } : prev))
    setSavingKeys((prev) => [...prev, key])
    const { error } = await updateMySettings(userId, { [key]: next } as SettingsPatch).catch(() => ({
      error: 'network',
    }))
    setSavingKeys((prev) => prev.filter((k) => k !== key))
    if (error) {
      setSettings((prev) => (prev ? { ...prev, [key]: !next } : prev))
      showAlert('저장 실패', SAVE_ERROR_MESSAGE)
    }
  }

  // 이 기기 알림 켜기/끄기 (안드로이드는 푸시 등록·해제와 권한 요청까지 appNotify 가 처리)
  const handleToggleDevice = async (next: boolean) => {
    if (savingDevice) return
    setDeviceEnabledState(next)
    setSavingDevice(true)
    try {
      await setDeviceNotifyEnabled(next)
    } catch {
      // 설정 값은 이미 이 기기에 저장됨
    }
    // 켤 때 권한 창이 떴을 수 있으므로 다시 확인
    const state = await getNotificationPermission().catch((): NotificationPermissionState => 'unsupported')
    setPermission(state)
    setDeviceEnabledState(isDeviceNotifyEnabled())
    setSavingDevice(false)
  }

  const handleRequestPermission = async () => {
    if (requestingPermission) return
    setRequestingPermission(true)
    const state = await requestNotificationPermission().catch((): NotificationPermissionState => 'unsupported')
    setPermission(state)
    setRequestingPermission(false)
  }

  // 윈도우 창 닫기(X) 동작 (앱이 저장. 실패하면 앱 쪽 기존 설정 유지)
  const handleCloseBehavior = (next: CloseBehavior) => {
    if (closeBehavior === null || closeBehavior === next) return
    setCloseBehaviorState(next)
    void setCloseBehavior(next)
  }

  const selectedCloseOption = CLOSE_OPTIONS.find((option) => option.value === closeBehavior)

  return (
    <div className="p-5 max-h-[70vh] overflow-y-auto overscroll-contain">
      {loading || !settings ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs">설정을 불러오는 중...</span>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="px-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            앱(안드로이드·윈도우)에서 휴대폰·PC 알림으로 띄울 항목입니다. 꺼도 알림 목록에는 그대로 쌓입니다.
          </p>

          <Section label="내 활동 알림">
            <ToggleRow
              label="내 게시글 좋아요 알림"
              checked={settings.notify_post_like}
              disabled={savingKeys.includes('notify_post_like')}
              onChange={(next) => handleToggle('notify_post_like', next)}
            />
            <ToggleRow
              label="내 게시글 댓글 알림"
              checked={settings.notify_post_comment}
              disabled={savingKeys.includes('notify_post_comment')}
              onChange={(next) => handleToggle('notify_post_comment', next)}
            />
            <ToggleRow
              label="내 댓글 답글 알림"
              checked={settings.notify_comment_reply}
              disabled={savingKeys.includes('notify_comment_reply')}
              onChange={(next) => handleToggle('notify_comment_reply', next)}
            />
          </Section>

          {isCreatorOrSuperAdmin && (
            <Section label="관리자 알림">
              <ToggleRow
                label="신고 알림"
                description="신고 접수, 신고 누적으로 검토가 필요할 때"
                checked={settings.notify_admin_report}
                disabled={savingKeys.includes('notify_admin_report')}
                onChange={(next) => handleToggle('notify_admin_report', next)}
              />
              <ToggleRow
                label="블랙리스트 이의제기 알림"
                description="블랙리스트 유저가 이의제기를 보냈을 때"
                checked={settings.notify_admin_appeal}
                disabled={savingKeys.includes('notify_admin_appeal')}
                onChange={(next) => handleToggle('notify_admin_appeal', next)}
              />
              {isCreator && (
                <ToggleRow
                  label="건의함 알림"
                  description="유저가 건의사항을 보냈을 때"
                  checked={settings.notify_admin_suggestion}
                  disabled={savingKeys.includes('notify_admin_suggestion')}
                  onChange={(next) => handleToggle('notify_admin_suggestion', next)}
                />
              )}
            </Section>
          )}

          {platform && (
            <Section label="이 기기">
              <ToggleRow
                label="이 기기에서 알림 받기"
                description={platform === 'android' ? '이 휴대폰에만 적용됩니다' : '이 PC에만 적용됩니다'}
                checked={deviceEnabled ?? true}
                disabled={deviceEnabled === null || savingDevice}
                onChange={handleToggleDevice}
              />
              {deviceEnabled && permission === 'prompt' && (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                    알림을 띄우려면 기기의 알림 권한이 필요합니다.
                  </span>
                  <button
                    type="button"
                    onClick={handleRequestPermission}
                    disabled={requestingPermission}
                    className="shrink-0 px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 inline-flex items-center gap-1"
                  >
                    {requestingPermission && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>알림 권한 허용</span>
                  </button>
                </div>
              )}
              {deviceEnabled && permission === 'denied' && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  기기 설정에서 이 앱의 알림을 허용해 주세요.
                </p>
              )}
            </Section>
          )}

          {platform === 'windows' && (
            <Section label="창 닫기">
              <div className="space-y-2">
                <span id="sfa-close-behavior-label" className="block text-xs font-bold text-zinc-900 dark:text-white">
                  창을 닫을 때
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="sfa-close-behavior-label"
                  className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                >
                  {CLOSE_OPTIONS.map((option) => {
                    const selected = closeBehavior === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => handleCloseBehavior(option.value)}
                        disabled={closeBehavior === null}
                        className={`min-w-0 px-1 py-2 rounded-lg text-[11px] font-bold leading-tight break-keep transition disabled:cursor-wait ${
                          selected
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {selectedCloseOption && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{selectedCloseOption.description}</p>
                )}
              </div>
            </Section>
          )}
        </div>
      )}

      <CustomPopup
        isOpen={popup.isOpen}
        title={popup.title}
        message={popup.message}
        type={popup.type || 'alert'}
        isDanger={popup.isDanger}
        onConfirm={popup.onConfirm}
        onCancel={closePopup}
      />
    </div>
  )
}
