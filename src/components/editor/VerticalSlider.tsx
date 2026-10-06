'use client'

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface VerticalSliderProps {
  /** 위쪽에 표시할 이름 (예: 불투명도) */
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** 아래쪽 값 표시 형식 (예: 50 → "50%") */
  format?: (value: number) => string
  /** 트랙 높이(px). 지정하지 않으면 부모 높이를 채움 */
  height?: number
  ariaLabel?: string
  className?: string
}

// 손잡이 지름(px) — 위치 계산에 쓰이므로 rem 이 아닌 고정 px
const THUMB = 20

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** 세로 슬라이더 (아래 = 최소, 위 = 최대). 마우스·터치 드래그와 키보드 화살표 지원 */
export default function VerticalSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  height,
  ariaLabel,
  className = '',
}: VerticalSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<number | null>(null)

  const decimals = (String(step).split('.')[1] || '').length
  // 단계에 맞춰 반올림 (0.1 + 0.2 같은 부동소수점 오차 정리)
  const snap = (raw: number) => {
    const stepped = Math.round((raw - min) / step) * step + min
    return clamp(Number(stepped.toFixed(decimals)), min, max)
  }

  const shown = clamp(value, min, max)
  const ratio = max > min ? (shown - min) / (max - min) : 0
  const display = format ? format(shown) : String(shown)

  const emit = (next: number) => {
    if (next !== value) onChange(next)
  }

  const valueFromPointer = (clientY: number) => {
    const el = trackRef.current
    if (!el) return value
    const rect = el.getBoundingClientRect()
    const usable = rect.height - THUMB
    if (usable <= 0) return value
    const r = 1 - (clientY - rect.top - THUMB / 2) / usable
    return snap(min + clamp(r, 0, 1) * (max - min))
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    // 다른 입력칸(HEX 등)의 입력을 먼저 확정시키기 위해 직접 포커스 이동
    e.currentTarget.focus({ preventScroll: true })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = e.pointerId
    emit(valueFromPointer(e.clientY))
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== e.pointerId) return
    emit(valueFromPointer(e.clientY))
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== e.pointerId) return
    draggingRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = shown + step
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        next = shown - step
        break
      case 'PageUp':
        next = shown + step * 5
        break
      case 'PageDown':
        next = shown - step * 5
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
    }
    if (next === null) return
    e.preventDefault()
    emit(snap(next))
  }

  return (
    <div className={`flex flex-col items-center gap-1.5 select-none ${className}`}>
      <span className="text-[11px] font-bold leading-none whitespace-nowrap text-zinc-700 dark:text-zinc-300">{label}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel ?? label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        aria-valuetext={display}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          draggingRef.current = null
        }}
        onKeyDown={handleKeyDown}
        className={`relative w-8 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${
          height ? 'shrink-0' : 'flex-1 min-h-[96px]'
        }`}
        style={height ? { height } : undefined}
      >
        {/* 트랙 (손잡이 반지름만큼 위아래를 비워 끝에서도 손잡이가 넘치지 않게) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800"
          style={{ top: THUMB / 2, bottom: THUMB / 2 }}
        >
          <div className="absolute inset-x-0 bottom-0 bg-orange-500 dark:bg-orange-500" style={{ height: `${ratio * 100}%` }} />
        </div>
        {/* 손잡이 */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-orange-500 dark:bg-orange-500 border-2 border-white dark:border-zinc-950 shadow-md"
          style={{ width: THUMB, height: THUMB, bottom: `calc(${ratio} * (100% - ${THUMB}px))` }}
        />
      </div>
      <span className="text-[11px] font-bold font-mono leading-none whitespace-nowrap tabular-nums text-zinc-900 dark:text-white">
        {display}
      </span>
    </div>
  )
}
