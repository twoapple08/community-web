'use client'

import { useEffect, useRef, useState } from 'react'
import Avatar from '../Avatar'
import CustomPopup from '../CustomPopup'
import { CLOSED_POPUP, SAVE_ERROR_MESSAGE, Section, ToggleRow, defaultSettings, type PopupState } from './SettingsParts'
import {
  NICKNAME_MAX_LENGTH,
  checkNicknameAvailable,
  fetchMySettings,
  setMyNickname,
  updateMySettings,
  uploadAvatar,
  type MySettings,
  type SettingsPatch,
} from '@/lib/userProfile'
import { Camera, Loader2 } from 'lucide-react'

const BIO_MAX_LENGTH = 60

// 알림 스위치는 마이 프로필 > 알림 > 톱니바퀴(알림 설정) 화면으로 옮김
type ToggleKey = 'show_like_count' | 'show_comment_count'
type NicknameStatus = 'idle' | 'checking' | 'available' | 'duplicate'

interface SettingsViewProps {
  userId: string
  currentNickname: string
  onNicknameUpdated: (newNick: string) => void
}

/** 마이 프로필 > 개인 설정 (프로필 사진 / 닉네임 / 한 줄 소개 / 공개 설정) */
export default function SettingsView({ userId, currentNickname, onNicknameUpdated }: SettingsViewProps) {
  const [settings, setSettings] = useState<MySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [popup, setPopup] = useState<PopupState>(CLOSED_POPUP)
  const closePopup = () => setPopup((p) => ({ ...p, isOpen: false }))
  const showAlert = (title: string, message: string) =>
    setPopup({ isOpen: true, title, message, type: 'alert', onConfirm: closePopup })

  // 프로필 사진
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // 닉네임
  const [nickname, setNickname] = useState(currentNickname)
  // 마지막으로 확인한 닉네임과 결과 (null = DB 함수 없음 → 표시 안 함)
  const [nickCheck, setNickCheck] = useState<{ name: string; available: boolean | null } | null>(null)
  const [savingNick, setSavingNick] = useState(false)
  const [nickMessage, setNickMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // 한 줄 소개
  const [bio, setBio] = useState('')
  const [savedBio, setSavedBio] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [bioMessage, setBioMessage] = useState<string | null>(null)

  // 공개 스위치 (저장 중인 항목은 연타 방지)
  const [savingKeys, setSavingKeys] = useState<ToggleKey[]>([])

  // 저장 완료 문구는 잠깐 보여준 뒤 자동으로 지움 (실패 문구는 다시 입력할 때까지 유지)
  useEffect(() => {
    if (!nickMessage?.ok) return
    const timer = setTimeout(() => setNickMessage(null), 2500)
    return () => clearTimeout(timer)
  }, [nickMessage])

  useEffect(() => {
    if (!bioMessage) return
    const timer = setTimeout(() => setBioMessage(null), 2500)
    return () => clearTimeout(timer)
  }, [bioMessage])

  useEffect(() => {
    let cancelled = false
    fetchMySettings(userId)
      .catch(() => null)
      .then((data) => {
        if (cancelled) return
        const next = data ?? defaultSettings(userId)
        setSettings(next)
        setBio(next.bio || '')
        setSavedBio(next.bio || '')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const cleanNickname = nickname.trim()
  const nicknameUnchanged = cleanNickname === currentNickname.trim()

  // 닉네임 중복 확인 (입력 멈춘 뒤 0.4초)
  useEffect(() => {
    if (!cleanNickname || nicknameUnchanged) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const available = await checkNicknameAvailable(cleanNickname)
      if (!cancelled) setNickCheck({ name: cleanNickname, available })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cleanNickname, nicknameUnchanged])

  // 표시 상태는 입력값과 마지막 확인 결과로 계산 (DB 함수가 없으면 아무것도 표시하지 않고 저장 시 다시 확인)
  const nickStatus: NicknameStatus =
    !cleanNickname || nicknameUnchanged
      ? 'idle'
      : nickCheck?.name !== cleanNickname
        ? 'checking'
        : nickCheck.available === null
          ? 'idle'
          : nickCheck.available
            ? 'available'
            : 'duplicate'

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 같은 파일을 다시 골라도 change 이벤트가 오도록 비움
    e.target.value = ''
    if (!file || uploadingAvatar) return
    setUploadingAvatar(true)
    const { url, error } = await uploadAvatar(userId, file)
    setUploadingAvatar(false)
    if (error || !url) {
      showAlert('사진 변경 실패', error || '프로필 사진을 저장하지 못했습니다.')
      return
    }
    setSettings((prev) => (prev ? { ...prev, avatar_url: url } : prev))
  }

  const handleResetAvatar = () => {
    setPopup({
      isOpen: true,
      title: '기본 이미지로 변경',
      message: '프로필 사진을 지우고 기본 이미지로 되돌리시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        closePopup()
        setUploadingAvatar(true)
        const { error } = await updateMySettings(userId, { avatar_url: null })
        setUploadingAvatar(false)
        if (error) {
          showAlert('사진 변경 실패', SAVE_ERROR_MESSAGE)
          return
        }
        setSettings((prev) => (prev ? { ...prev, avatar_url: null } : prev))
      },
    })
  }

  const canSaveNickname = Boolean(cleanNickname) && !nicknameUnchanged && nickStatus !== 'duplicate' && !savingNick

  const handleSaveNickname = async () => {
    if (!canSaveNickname) return
    setSavingNick(true)
    setNickMessage(null)
    const result = await setMyNickname(userId, cleanNickname)
    setSavingNick(false)
    if (result.ok) {
      setNickname(result.nickname)
      onNicknameUpdated(result.nickname)
      setNickMessage({ ok: true, text: '닉네임이 변경되었습니다.' })
    } else {
      if (result.reason === 'duplicate') setNickCheck({ name: cleanNickname, available: false })
      setNickMessage({ ok: false, text: result.message })
    }
  }

  const bioUnchanged = bio.trim() === savedBio.trim()

  const handleSaveBio = async () => {
    if (bioUnchanged || savingBio) return
    setSavingBio(true)
    setBioMessage(null)
    const nextBio = bio.trim() || null
    const { error } = await updateMySettings(userId, { bio: nextBio })
    setSavingBio(false)
    if (error) {
      showAlert('저장 실패', SAVE_ERROR_MESSAGE)
      return
    }
    setBio(nextBio || '')
    setSavedBio(nextBio || '')
    setSettings((prev) => (prev ? { ...prev, bio: nextBio } : prev))
    setBioMessage('한 줄 소개가 저장되었습니다.')
  }

  // 스위치는 즉시 저장 (먼저 화면을 바꾸고, 실패하면 되돌림)
  const handleToggle = async (key: ToggleKey, next: boolean) => {
    if (!settings || savingKeys.includes(key)) return
    setSettings((prev) => (prev ? { ...prev, [key]: next } : prev))
    setSavingKeys((prev) => [...prev, key])
    const { error } = await updateMySettings(userId, { [key]: next } as SettingsPatch)
    setSavingKeys((prev) => prev.filter((k) => k !== key))
    if (error) {
      setSettings((prev) => (prev ? { ...prev, [key]: !next } : prev))
      showAlert('저장 실패', SAVE_ERROR_MESSAGE)
    }
  }

  const inputClass =
    'w-full min-w-0 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500'
  const saveButtonClass =
    'shrink-0 px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 inline-flex items-center gap-1'

  return (
    <div className="p-5 max-h-[70vh] overflow-y-auto overscroll-contain">
      {loading || !settings ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs">설정을 불러오는 중...</span>
        </div>
      ) : (
        <div className="space-y-3">
          <Section label="프로필 사진">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="프로필 사진 변경"
                className="relative shrink-0 rounded-full group cursor-pointer disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-offset-zinc-900"
              >
                <Avatar src={settings.avatar_url} size={84} alt="내 프로필 사진" />
                {/* 마우스: 올리면 카메라 덮개 */}
                <span className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </span>
                {/* 터치 기기: 호버가 없으므로 오른쪽 아래 작은 카메라 배지로 누를 수 있음을 표시 */}
                <span className="absolute bottom-0 right-0 hidden pointer-coarse:flex w-7 h-7 items-center justify-center rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-2 border-zinc-50 dark:border-zinc-900 shadow">
                  <Camera className="w-3.5 h-3.5" />
                </span>
                {uploadingAvatar && (
                  <span className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </span>
                )}
              </button>
              <div className="min-w-0 space-y-1.5">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  사진을 눌러 변경합니다. PNG, JPG, GIF, WEBP (5MB 이하, GIF 움직임 유지)
                </p>
                {settings.avatar_url && (
                  <button
                    type="button"
                    onClick={handleResetAvatar}
                    disabled={uploadingAvatar}
                    className="py-1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 underline underline-offset-2 transition disabled:opacity-50"
                  >
                    기본 이미지로
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleAvatarFile}
              className="hidden"
            />
          </Section>

          <Section label="닉네임">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value)
                  setNickMessage(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    handleSaveNickname()
                  }
                }}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="닉네임"
                className={inputClass}
              />
              <button type="button" onClick={handleSaveNickname} disabled={!canSaveNickname} className={saveButtonClass}>
                {savingNick && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>저장</span>
              </button>
            </div>
            {nickMessage ? (
              <p className={`text-[11px] font-semibold ${nickMessage.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {nickMessage.text}
              </p>
            ) : nickStatus === 'available' ? (
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">사용 가능한 닉네임입니다.</p>
            ) : nickStatus === 'duplicate' ? (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">이미 사용 중인 닉네임입니다.</p>
            ) : null}
          </Section>

          <Section label="한 줄 소개">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value)
                  setBioMessage(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    handleSaveBio()
                  }
                }}
                maxLength={BIO_MAX_LENGTH}
                placeholder="나를 한 줄로 소개해 보세요"
                className={inputClass}
              />
              <button type="button" onClick={handleSaveBio} disabled={bioUnchanged || savingBio} className={saveButtonClass}>
                {savingBio && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>저장</span>
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 min-w-0">{bioMessage}</p>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-500 shrink-0 tabular-nums">
                {bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
          </Section>

          <Section label="공개 설정">
            <ToggleRow
              label="내가 누른 좋아요 수 공개"
              description="다른 사람이 내 프로필에서 볼 수 있습니다"
              checked={settings.show_like_count}
              disabled={savingKeys.includes('show_like_count')}
              onChange={(next) => handleToggle('show_like_count', next)}
            />
            <ToggleRow
              label="내가 쓴 댓글 수 공개"
              description="다른 사람이 내 프로필에서 볼 수 있습니다"
              checked={settings.show_comment_count}
              disabled={savingKeys.includes('show_comment_count')}
              onChange={(next) => handleToggle('show_comment_count', next)}
            />
          </Section>
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
