// 마이 프로필 설정 화면(개인 설정 / 알림 설정)이 같이 쓰는 작은 조각들
// - 섹션 상자, 스위치 줄, 저장 실패 문구, 팝업 상태, 설정 기본값

import type { ReactNode } from 'react'
import type { MySettings } from '@/lib/userProfile'

export const SAVE_ERROR_MESSAGE = '설정을 저장하지 못했습니다. (DB 업데이트가 필요할 수 있습니다)'

export interface PopupState {
  isOpen: boolean
  title: string
  message: string
  type?: 'alert' | 'confirm'
  isDanger?: boolean
  onConfirm: () => void
}

export const CLOSED_POPUP: PopupState = { isOpen: false, title: '', message: '', onConfirm: () => {} }

// 프로필 정보가 없거나 새 컬럼이 없을 때 쓰는 기본값 (DB 기본값과 동일)
export const defaultSettings = (userId: string): MySettings => ({
  id: userId,
  nickname: null,
  avatar_url: null,
  bio: null,
  show_like_count: true,
  show_comment_count: true,
  notify_post_like: true,
  notify_post_comment: true,
  notify_comment_reply: true,
  notify_admin_report: true,
  notify_admin_suggestion: true,
  notify_admin_appeal: true,
})

/** 섹션 묶음 (작은 제목 + 둥근 회색 상자) */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
      <h3 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider">{label}</h3>
      {children}
    </section>
  )
}

/** 글쓰기 화면 '미리보기 가리기' 와 같은 모양의 스위치 */
export function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className={`flex items-center justify-between gap-3 select-none ${disabled ? 'cursor-wait' : 'cursor-pointer'}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-zinc-900 dark:text-white">{label}</span>
        {description && (
          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-9 h-5 shrink-0 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:after:translate-x-4 peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform"></div>
    </label>
  )
}
