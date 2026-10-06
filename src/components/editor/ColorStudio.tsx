'use client'

import { createPortal } from 'react-dom'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Moon, Star, Sun, X } from 'lucide-react'
import ColorWheel, { CHECKERBOARD_STYLE } from './ColorWheel'
import VerticalSlider from './VerticalSlider'
import {
  applyTextStylePatch,
  formatCssColor,
  GLOW_SIZE_RANGE,
  GLOW_STRENGTH_RANGE,
  hexToRgba,
  hsvToRgb,
  isSameColor,
  loadFavoriteColors,
  onFavoriteColorsChanged,
  OPACITY_RANGE,
  parseCssColor,
  rgbToHex,
  rgbToHsv,
  STROKE_WIDTH_RANGE,
  textStyleToMarkAttrs,
  toggleFavoriteColor,
  type FavoriteKind,
  type HSV,
  type RawTextMarkAttrs,
  type RGBA,
  type TextStylePatch,
  type TextStyleValue,
} from '@/lib/colorUtils'

// 리치 텍스트 색 편집 팝업 (글씨 색 / 테두리 / 글로우, 형광펜)
// 기본 <input type="color"> 팝업 대신 사용합니다.

export type ColorStudioMode = 'text' | 'highlight'

/** 미리보기 글자 조각 (선택한 글자의 원래 글씨 색/효과/형광펜) */
export interface ColorStudioPreviewSegment {
  text: string
  style: RawTextMarkAttrs
  highlight: string | null
}

export interface ColorStudioPreview {
  text: string
  /** 있으면 글자마다 원래 스타일에 바꾼 항목만 합쳐서 미리보기 (실제 적용 결과와 같음) */
  segments?: ColorStudioPreviewSegment[]
  fontFamily?: string | null
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}

/** 선택한 글자들에 서로 다른 값이 섞여 있는 항목 */
export interface ColorStudioMixed {
  color?: boolean
  stroke?: boolean
  glow?: boolean
  highlight?: boolean
}

export interface ColorStudioProps {
  isOpen: boolean
  mode: ColorStudioMode
  /** 여러 값이 섞인 항목 (바꾸지 않으면 글자마다 원래 값 유지) */
  mixed?: ColorStudioMixed
  /** mode 'text': 선택 영역의 현재 글씨 색/테두리/글로우 */
  initialText?: TextStyleValue
  /** mode 'highlight': 현재 형광펜 색 */
  initialHighlight?: string | null
  preview: ColorStudioPreview
  /**
   * text: 전체 결과 (선택 없이 새 글자를 넣을 때 사용)
   * textPatch: 바꾼 항목만 (선택한 글자에 적용할 때 사용 → 바꾸지 않은 색/효과는 글자마다 그대로)
   * highlight: 바꾼 형광펜 색 (바꾸지 않았으면 없음)
   */
  onApply: (value: { text?: TextStyleValue; textPatch?: TextStylePatch; highlight?: string }) => void
  /** 글씨 색·테두리·글로우(text) 또는 형광펜(highlight) 제거 */
  onClear: () => void
  onClose: () => void
}

type TabKey = 'color' | 'stroke' | 'glow'
type ColorKey = 'text' | 'stroke' | 'glow' | 'highlight'

interface ColorState {
  hsv: HSV
  a: number // 0~1
}

const DEFAULT_TEXT_COLOR = '#ef4444'
const DEFAULT_STROKE = { width: 2, color: '#000000' }
const DEFAULT_GLOW = { size: 8, strength: 2, color: '#fde047' }
const DEFAULT_HIGHLIGHT = '#fef08a'
const PREVIEW_FALLBACK = '가나다 ABC 123'
const PREVIEW_MAX_CHARS = 60
// 미리보기 배경 (사이트 테마와 무관하게 직접 골라 가독성 확인)
const PREVIEW_THEME = {
  dark: { bg: '#18181b', fg: '#f4f4f5' },
  light: { bg: '#ffffff', fg: '#18181b' },
}
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i
const MIN_ALPHA = OPACITY_RANGE.min / 100

const TABS: { key: TabKey; label: string }[] = [
  { key: 'color', label: '글씨 색' },
  { key: 'stroke', label: '테두리' },
  { key: 'glow', label: '글로우' },
]

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const toColorState = (value: string | null | undefined, fallback: string, withAlpha: boolean): ColorState => {
  const parsed = parseCssColor(value) ?? parseCssColor(fallback) ?? { r: 0, g: 0, b: 0, a: 1 }
  return { hsv: rgbToHsv(parsed), a: withAlpha ? clamp(parsed.a, MIN_ALPHA, 1) : 1 }
}

const toRgba = (c: ColorState): RGBA => ({ ...hsvToRgb(c.hsv), a: c.a })
const toCss = (c: ColorState) => formatCssColor(toRgba(c))
const toHex = (c: ColorState) => rgbToHex(hsvToRgb(c.hsv)).toUpperCase()

// 회색/검정처럼 색조가 없는 색은 기존 색조를 유지 (삼각형이 갑자기 빨강 쪽으로 돌지 않도록)
const keepHue = (rgb: Pick<RGBA, 'r' | 'g' | 'b'>, prev: HSV): HSV => {
  const next = rgbToHsv(rgb)
  if (next.v === 0) return { h: prev.h, s: prev.s, v: 0 }
  if (next.s === 0) return { h: prev.h, s: 0, v: next.v }
  return next
}

// 서버 렌더 중에는 그리지 않고, 브라우저에서만 포털을 엶
const subscribeNothing = () => () => {}
const useIsClient = () =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  )

export default function ColorStudio(props: ColorStudioProps) {
  const isClient = useIsClient()
  if (!props.isOpen || !isClient) return null
  // 열 때마다 새로 마운트 → 초기값(initialText/initialHighlight)으로 다시 시작
  return createPortal(<ColorStudioPanel key={props.mode} {...props} />, document.body)
}

// 여러 값이 섞인 항목의 탭 점 (무지개)
const MIXED_DOT_STYLE: CSSProperties = {
  backgroundImage: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)',
}

function ColorStudioPanel({ mode, mixed = {}, initialText, initialHighlight, preview, onApply, onClear, onClose }: ColorStudioProps) {
  const isText = mode === 'text'
  const favoriteKind: FavoriteKind = isText ? 'text' : 'highlight'
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropDownRef = useRef(false)

  const [tab, setTab] = useState<TabKey>('color')
  // 사용자가 직접 바꾼 항목 기록 → 적용할 때 바꾼 항목만 글자에 반영
  // (예전에는 열 때 읽은 값 하나로 전체를 덮어써서, 여러 색이 섞인 글자가 한 색으로 초기화됨)
  const [changed, setChanged] = useState({
    color: false,
    strokeSwitch: false,
    strokeWidth: false,
    strokeColor: false,
    glowSwitch: false,
    glowSize: false,
    glowStrength: false,
    glowColor: false,
    highlight: false,
  })
  const markChanged = (key: keyof typeof changed) => setChanged((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  const tracked = <T,>(key: keyof typeof changed, set: (updater: T) => void) => (updater: T) => {
    markChanged(key)
    set(updater)
  }

  const [textColor, setTextColorState] = useState<ColorState>(() => toColorState(initialText?.color, DEFAULT_TEXT_COLOR, true))
  const setTextColor = tracked('color', setTextColorState)
  const initialStrokeOn = Boolean(initialText?.stroke)
  const [strokeOn, setStrokeOnState] = useState(initialStrokeOn)
  const setStrokeOn = tracked('strokeSwitch', setStrokeOnState)
  const [strokeColor, setStrokeColorState] = useState<ColorState>(() =>
    toColorState(initialText?.stroke?.color, DEFAULT_STROKE.color, false)
  )
  const setStrokeColor = tracked('strokeColor', setStrokeColorState)
  const [strokeWidth, setStrokeWidthState] = useState(() =>
    clamp(initialText?.stroke?.width ?? DEFAULT_STROKE.width, STROKE_WIDTH_RANGE.min, STROKE_WIDTH_RANGE.max)
  )
  const setStrokeWidth = tracked('strokeWidth', setStrokeWidthState)
  const initialGlowOn = Boolean(initialText?.glow)
  const [glowOn, setGlowOnState] = useState(initialGlowOn)
  const setGlowOn = tracked('glowSwitch', setGlowOnState)
  const [glowColor, setGlowColorState] = useState<ColorState>(() => toColorState(initialText?.glow?.color, DEFAULT_GLOW.color, false))
  const setGlowColor = tracked('glowColor', setGlowColorState)
  const [glowSize, setGlowSizeState] = useState(() =>
    clamp(initialText?.glow?.size ?? DEFAULT_GLOW.size, GLOW_SIZE_RANGE.min, GLOW_SIZE_RANGE.max)
  )
  const setGlowSize = tracked('glowSize', setGlowSizeState)
  const [glowStrength, setGlowStrengthState] = useState(() =>
    clamp(Math.round(initialText?.glow?.strength ?? DEFAULT_GLOW.strength), GLOW_STRENGTH_RANGE.min, GLOW_STRENGTH_RANGE.max)
  )
  const setGlowStrength = tracked('glowStrength', setGlowStrengthState)
  const [highlight, setHighlightState] = useState<ColorState>(() => toColorState(initialHighlight, DEFAULT_HIGHLIGHT, true))
  const setHighlight = tracked('highlight', setHighlightState)
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoriteColors(favoriteKind))
  const [favEditing, setFavEditing] = useState(false)
  // HEX 입력칸에 입력 중인 값 (포커스 중에만 존재)
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const [previewDark, setPreviewDark] = useState(() => document.documentElement.classList.contains('dark'))

  // 열리면 패널로 포커스 (키보드 사용자가 바로 조작 가능)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  // Esc = 취소 (아래쪽 다른 모달까지 함께 닫히지 않도록 전파 차단)
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  // 즐겨찾기 동기화 (다른 에디터/탭에서 바뀐 것도 반영)
  useEffect(
    () =>
      onFavoriteColorsChanged((kind) => {
        if (kind === favoriteKind) setFavorites(loadFavoriteColors(favoriteKind))
      }),
    [favoriteKind]
  )

  const activeKey: ColorKey = !isText ? 'highlight' : tab === 'color' ? 'text' : tab
  const states: Record<ColorKey, ColorState> = { text: textColor, stroke: strokeColor, glow: glowColor, highlight }
  const active = states[activeKey]
  const alphaEnabled = activeKey === 'text' || activeKey === 'highlight'
  const activeCss = toCss(active)
  const currentHex = toHex(active)

  const setActive = (updater: (prev: ColorState) => ColorState) => {
    if (activeKey === 'text') setTextColor(updater)
    else if (activeKey === 'stroke') setStrokeColor(updater)
    else if (activeKey === 'glow') setGlowColor(updater)
    else setHighlight(updater)
  }

  // 꺼진 테두리/글로우 탭은 회색 처리 + 조작 불가
  const sectionOff = isText && ((tab === 'stroke' && !strokeOn) || (tab === 'glow' && !glowOn))

  // 원래 글씨 색이 없던 글자에 테두리/글로우만 줄 때 기본색(빨강)까지 칠해지지 않도록, 글씨 색은 직접 바꿨거나 원래 있던 경우만
  const keptColor = initialText?.color && !mixed.color ? initialText.color : null
  const buildTextResult = (text: ColorState, stroke: ColorState, glow: ColorState, colorChanged = changed.color): TextStyleValue => ({
    color: colorChanged ? toCss(text) : keptColor,
    stroke: strokeOn ? { width: strokeWidth, color: toCss(stroke) } : null,
    glow: glowOn ? { size: glowSize, strength: glowStrength, color: toCss(glow) } : null,
  })
  const textResult = buildTextResult(textColor, strokeColor, glowColor)

  /** 바꾼 항목만 담은 변경 내용 (선택한 글자마다 기존 값과 합쳐짐) */
  const buildTextPatch = (
    result: TextStyleValue,
    c: typeof changed
  ): TextStylePatch => {
    const patch: TextStylePatch = {}
    if (c.color && result.color) patch.color = result.color

    if (!strokeOn) {
      if (initialStrokeOn) patch.stroke = null
    } else if (result.stroke) {
      // 새로 켰거나 스위치를 다시 켠 경우 → 선택한 모든 글자에 같은 테두리
      if (!initialStrokeOn || c.strokeSwitch) patch.stroke = { set: result.stroke }
      else {
        const merge: Partial<typeof result.stroke> = {}
        if (c.strokeWidth) merge.width = result.stroke.width
        if (c.strokeColor) merge.color = result.stroke.color
        if (Object.keys(merge).length > 0) patch.stroke = { merge }
      }
    }

    if (!glowOn) {
      if (initialGlowOn) patch.glow = null
    } else if (result.glow) {
      if (!initialGlowOn || c.glowSwitch) patch.glow = { set: result.glow }
      else {
        const merge: Partial<typeof result.glow> = {}
        if (c.glowSize) merge.size = result.glow.size
        if (c.glowStrength) merge.strength = result.glow.strength
        if (c.glowColor) merge.color = result.glow.color
        if (Object.keys(merge).length > 0) patch.glow = { merge }
      }
    }
    return patch
  }
  const highlightResult = toCss(highlight)

  // ---------------------------------------------------------------
  // HEX 입력
  // ---------------------------------------------------------------
  const hexValue = hexDraft ?? currentHex
  const hexValid = hexDraft === null || HEX_RE.test(hexDraft.trim())

  /** 입력 중인 HEX 값 → 색 (잘못된 값이면 null) */
  const parseHexDraft = (): Pick<RGBA, 'r' | 'g' | 'b'> | null => {
    if (hexDraft === null) return null
    const raw = hexDraft.trim()
    if (!HEX_RE.test(raw)) return null
    return hexToRgba(raw.startsWith('#') ? raw : `#${raw}`)
  }

  const commitHex = () => {
    if (hexDraft === null) return
    const rgb = parseHexDraft()
    setHexDraft(null)
    // 잘못된 값이면 원래 색으로 되돌림
    if (!rgb) return
    setActive((prev) => ({ ...prev, hsv: keepHue(rgb, prev.hsv) }))
  }

  const handleHexKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      e.currentTarget.blur() // blur 에서 확정
    }
  }

  // ---------------------------------------------------------------
  // 즐겨찾기
  // ---------------------------------------------------------------
  const isFavorite = favorites.some((c) => isSameColor(c, activeCss))
  const showFavEditing = favEditing && favorites.length > 0

  const handleToggleFavorite = () => {
    // 입력 중인 HEX 값이 있으면 그 색을 기준으로 (모바일에서 입력칸 포커스가 남아 있는 경우)
    const draft = parseHexDraft()
    const color = draft ? toCss({ ...active, hsv: keepHue(draft, active.hsv) }) : activeCss
    commitHex()
    toggleFavoriteColor(favoriteKind, color)
  }

  const pickFavorite = (color: string) => {
    if (showFavEditing) {
      toggleFavoriteColor(favoriteKind, color) // 편집 중에는 탭 = 삭제
      return
    }
    const rgba = parseCssColor(color)
    if (!rgba) return
    setHexDraft(null)
    setActive((prev) => ({ hsv: keepHue(rgba, prev.hsv), a: alphaEnabled ? clamp(rgba.a, MIN_ALPHA, 1) : 1 }))
  }

  // ---------------------------------------------------------------
  // 미리보기
  // ---------------------------------------------------------------
  const previewText = useMemo(() => {
    const t = (preview.text || '').replace(/\s+/g, ' ').trim()
    if (!t) return PREVIEW_FALLBACK
    const chars = Array.from(t)
    return chars.length > PREVIEW_MAX_CHARS ? `${chars.slice(0, PREVIEW_MAX_CHARS).join('')}…` : t
  }, [preview.text])

  const previewTheme = previewDark ? PREVIEW_THEME.dark : PREVIEW_THEME.light
  const decoration = [preview.underline ? 'underline' : '', preview.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  const baseTextStyle: CSSProperties = {
    fontFamily: preview.fontFamily || undefined,
    fontWeight: preview.bold ? 700 : 400,
    fontStyle: preview.italic ? 'italic' : 'normal',
    textDecorationLine: decoration || 'none',
    fontSize: '20px', // 실제 글자 크기와 무관하게 고정
    lineHeight: 1.5,
  }
  const textAttrsToStyle = (attrs: RawTextMarkAttrs): CSSProperties => ({
    color: attrs.color ?? undefined,
    WebkitTextStroke: attrs.stroke ?? undefined,
    paintOrder: attrs.stroke ? 'stroke fill' : undefined,
    textShadow: attrs.glow ?? undefined,
  })
  const highlightStyle = (color: string | null): CSSProperties =>
    color ? { backgroundColor: color, padding: '0 4px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' } : {}
  const highlightApplies = changed.highlight || !initialHighlight

  let previewStyle: CSSProperties
  if (isText) {
    previewStyle = { ...baseTextStyle, ...textAttrsToStyle(textStyleToMarkAttrs(textResult)) }
  } else {
    previewStyle = { ...baseTextStyle, ...highlightStyle(highlightResult) }
  }

  // 선택한 글자가 있으면 글자 조각마다 실제 적용 결과로 미리보기 (섞인 색이 그대로 유지되는지 확인 가능)
  const previewSegments = useMemo(() => {
    const list = preview.segments ?? []
    let used = 0
    const result: ColorStudioPreviewSegment[] = []
    for (const seg of list) {
      if (used >= PREVIEW_MAX_CHARS) break
      const chars = Array.from(seg.text.replace(/\s+/g, ' ')).slice(0, PREVIEW_MAX_CHARS - used)
      used += chars.length
      result.push({ ...seg, text: chars.join('') })
    }
    return result.some((seg) => seg.text.trim()) ? result : []
  }, [preview.segments])
  const livePatch = isText ? buildTextPatch(textResult, changed) : null

  // ---------------------------------------------------------------
  // 버튼 동작
  // ---------------------------------------------------------------
  const handleApply = () => {
    // 입력칸 포커스가 안 풀린 채(일부 모바일) 적용을 눌러도 입력한 HEX 값을 반영
    const draft = parseHexDraft()
    const withDraft = (key: ColorKey, state: ColorState): ColorState =>
      draft && key === activeKey ? { ...state, hsv: keepHue(draft, state.hsv) } : state
    const draftKey = draft ? activeKey : null
    const c = {
      ...changed,
      color: changed.color || draftKey === 'text',
      strokeColor: changed.strokeColor || draftKey === 'stroke',
      glowColor: changed.glowColor || draftKey === 'glow',
      highlight: changed.highlight || draftKey === 'highlight',
    }
    if (isText) {
      const text = buildTextResult(withDraft('text', textColor), withDraft('stroke', strokeColor), withDraft('glow', glowColor), c.color)
      onApply({ text, textPatch: buildTextPatch(text, c) })
    } else {
      // 형광펜이 원래 없던 곳은 바로 적용, 원래 있던 곳은 색을 바꿨을 때만 (섞인 형광펜이 한 색으로 바뀌지 않게)
      const shouldApply = c.highlight || !initialHighlight
      onApply(shouldApply ? { highlight: toCss(withDraft('highlight', highlight)) } : {})
    }
    // onClose 는 부모가 처리
  }

  const handleClear = () => {
    onClear()
    onClose()
  }

  // ---------------------------------------------------------------
  // 슬라이더 (현재 탭의 숫자 옵션)
  // ---------------------------------------------------------------
  const opacitySlider = (state: ColorState, set: (updater: (prev: ColorState) => ColorState) => void) => (
    <VerticalSlider
      label="불투명도"
      value={Math.round(state.a * 100)}
      min={OPACITY_RANGE.min}
      max={OPACITY_RANGE.max}
      step={OPACITY_RANGE.step}
      onChange={(v) => set((prev) => ({ ...prev, a: v / 100 }))}
      format={(v) => `${v}%`}
    />
  )

  let sliders: ReactNode
  if (!isText) sliders = opacitySlider(highlight, setHighlight)
  else if (tab === 'color') sliders = opacitySlider(textColor, setTextColor)
  else if (tab === 'stroke')
    sliders = (
      <VerticalSlider
        label="두께"
        value={strokeWidth}
        min={STROKE_WIDTH_RANGE.min}
        max={STROKE_WIDTH_RANGE.max}
        step={STROKE_WIDTH_RANGE.step}
        onChange={setStrokeWidth}
        format={(v) => `${v}px`}
        ariaLabel="테두리 두께"
      />
    )
  else
    sliders = (
      <>
        <VerticalSlider
          label="범위"
          value={glowSize}
          min={GLOW_SIZE_RANGE.min}
          max={GLOW_SIZE_RANGE.max}
          step={GLOW_SIZE_RANGE.step}
          onChange={setGlowSize}
          format={(v) => `${v}px`}
          ariaLabel="글로우 범위"
        />
        <VerticalSlider
          label="강도"
          value={glowStrength}
          min={GLOW_STRENGTH_RANGE.min}
          max={GLOW_STRENGTH_RANGE.max}
          step={GLOW_STRENGTH_RANGE.step}
          onChange={setGlowStrength}
          ariaLabel="글로우 강도"
        />
      </>
    )

  // 탭 이름 옆 작은 색 점 (꺼진 효과는 빈 점, 바꾸지 않은 섞인 항목은 무지개 점)
  const tabMixed = (key: TabKey): boolean => {
    if (key === 'color') return Boolean(mixed.color) && !changed.color
    if (key === 'stroke') return Boolean(mixed.stroke) && strokeOn && !changed.strokeSwitch && !changed.strokeColor
    return Boolean(mixed.glow) && glowOn && !changed.glowSwitch && !changed.glowColor
  }
  const tabDot = (key: TabKey): string | null => {
    if (key === 'color') return changed.color || initialText?.color ? toCss(textColor) : null
    if (key === 'stroke') return strokeOn ? toCss(strokeColor) : null
    return glowOn ? toCss(glowColor) : null
  }

  const effectSwitch =
    isText && tab !== 'color'
      ? {
          label: tab === 'stroke' ? '테두리 활성화' : '글로우 활성화',
          on: tab === 'stroke' ? strokeOn : glowOn,
          toggle: () => (tab === 'stroke' ? setStrokeOn((v) => !v) : setGlowOn((v) => !v)),
        }
      : null

  return (
    <div
      className="fixed inset-0 z-[11500] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // 패널 안에서 누르고 바깥에서 뗀 경우는 닫지 않음
        if (e.target === e.currentTarget && backdropDownRef.current) onClose()
        backdropDownRef.current = false
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm max-h-[92vh] overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950 border-2 border-zinc-900 dark:border-white rounded-none p-4 shadow-2xl space-y-3 outline-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-sm font-black text-zinc-900 dark:text-white tracking-wider">
            {isText ? '글자 색 편집' : '형광펜 색 편집'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 -mr-1.5 rounded-none text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 탭 (글자 색 편집만) */}
        {isText && (
          <div role="tablist" aria-label="글자 효과" className="grid grid-cols-3 border-2 border-zinc-900 dark:border-white">
            {TABS.map((t, i) => {
              const selected = tab === t.key
              const dot = tabDot(t.key)
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    commitHex() // 입력 중인 HEX 값은 원래 탭에 반영
                    setTab(t.key)
                  }}
                  className={`flex items-center justify-center gap-1.5 min-w-0 px-1 py-2 text-xs font-black rounded-none ${
                    i > 0 ? 'border-l-2 border-zinc-900 dark:border-white' : ''
                  } ${
                    selected
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                      : 'bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 shrink-0 rounded-full border border-zinc-400 dark:border-zinc-500 transition-none"
                    style={
                      tabMixed(t.key)
                        ? MIXED_DOT_STYLE
                        : dot
                          ? { ...CHECKERBOARD_STYLE, backgroundImage: `linear-gradient(${dot}, ${dot}), ${CHECKERBOARD_STYLE.backgroundImage}` }
                          : undefined
                    }
                  />
                  <span className="truncate">{t.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 여러 색/효과가 섞인 선택: 바꾼 항목만 적용된다는 안내 */}
        {(isText ? mixed.color || mixed.stroke || mixed.glow : mixed.highlight) && (
          <p className="flex items-start gap-1.5 px-2.5 py-2 text-[11px] leading-snug rounded-none border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">
            <span aria-hidden="true" className="mt-0.5 w-2.5 h-2.5 shrink-0 rounded-full border border-zinc-400 dark:border-zinc-500" style={MIXED_DOT_STYLE} />
            <span>선택한 글자에 서로 다른 {isText ? '색·효과' : '형광펜'}가 섞여 있습니다. 직접 바꾼 항목만 적용되고, 나머지는 글자마다 그대로 유지됩니다.</span>
          </p>
        )}

        {/* 테두리/글로우 켜기 스위치 */}
        {effectSwitch && (
          <button
            type="button"
            role="switch"
            aria-checked={effectSwitch.on}
            onClick={effectSwitch.toggle}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-none border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-left"
          >
            <span className="text-xs font-bold text-zinc-900 dark:text-white">{effectSwitch.label}</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${effectSwitch.on ? 'bg-orange-500 dark:bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-white shadow transition-transform duration-200 ${
                  effectSwitch.on ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        )}

        {/* 색 편집 영역 (꺼진 효과 탭에서는 회색 + 조작 불가) */}
        <div
          aria-disabled={sectionOff || undefined}
          inert={sectionOff}
          className={`space-y-3 transition-[filter,opacity] duration-200 ${sectionOff ? 'grayscale opacity-50 pointer-events-none select-none' : ''}`}
        >
          {/* 색상환 + 세로 슬라이더 */}
          <div className="flex items-stretch gap-3">
            <div className="flex-1 min-w-0">
              <ColorWheel hsv={active.hsv} onChange={(hsv) => setActive((prev) => ({ ...prev, hsv }))} swatch={activeCss} maxSize={220} />
            </div>
            {/* 슬라이더 자리는 탭과 무관하게 고정 폭 → 탭을 바꿔도 색상환 크기가 변하지 않음 */}
            <div className="shrink-0 flex items-stretch justify-center gap-1.5" style={{ width: isText ? 80 : 48 }}>
              {sliders}
            </div>
          </div>

          {/* HEX 입력 + 즐겨찾기 버튼 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="shrink-0 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">HEX</span>
              <input
                type="text"
                value={hexValue}
                onFocus={(e) => {
                  setHexDraft(currentHex)
                  e.currentTarget.select()
                }}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={commitHex}
                onKeyDown={handleHexKeyDown}
                maxLength={7}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label="16진수 색 코드"
                aria-invalid={!hexValid}
                className={`w-full min-w-0 max-w-[8.5rem] px-2 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded-none border outline-none bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-white ${
                  hexValid
                    ? 'border-zinc-300 focus:border-orange-500 dark:border-zinc-700 dark:focus:border-orange-500'
                    : 'border-red-500 dark:border-red-500'
                }`}
              />
            </label>
            {alphaEnabled && active.a < 1 && (
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
                불투명도 {Math.round(active.a * 100)}%
              </span>
            )}
            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? '즐겨찾기에서 빼기' : '즐겨찾기에 추가'}
              title={isFavorite ? '즐겨찾기에서 빼기' : '즐겨찾기에 추가'}
              className={`shrink-0 p-2 rounded-none border ${
                isFavorite
                  ? 'border-orange-500 text-orange-500 bg-orange-50 dark:border-orange-500 dark:text-orange-400 dark:bg-orange-500/10'
                  : 'border-zinc-300 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900'
              }`}
            >
              <Star className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* 즐겨찾기 목록 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 min-h-6">
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">즐겨찾기</span>
              {favorites.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFavEditing((v) => !v)}
                  aria-pressed={showFavEditing}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-none border ${
                    showFavEditing
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900'
                  }`}
                >
                  {showFavEditing ? '완료' : '편집'}
                </button>
              )}
            </div>
            {favorites.length === 0 ? (
              <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">★ 버튼으로 자주 쓰는 색을 즐겨찾기 하세요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {favorites.map((c, i) => {
                  const selected = !showFavEditing && isSameColor(c, activeCss)
                  return (
                    <button
                      key={`${i}-${c}`}
                      type="button"
                      onClick={() => pickFavorite(c)}
                      title={showFavEditing ? `${c} 삭제` : c}
                      aria-label={showFavEditing ? `즐겨찾기 색 ${c} 삭제` : `즐겨찾기 색 ${c} 사용`}
                      aria-pressed={showFavEditing ? undefined : selected}
                      className={`relative w-7 h-7 shrink-0 rounded-none border ${
                        selected
                          ? 'border-orange-500 ring-2 ring-orange-500/50 dark:border-orange-500 dark:ring-orange-500/50'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                      style={CHECKERBOARD_STYLE}
                    >
                      <span aria-hidden="true" className="absolute inset-0 transition-none" style={{ backgroundColor: c }} />
                      {showFavEditing && (
                        <span
                          aria-hidden="true"
                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full shadow bg-zinc-900 text-white dark:bg-white dark:text-black"
                        >
                          <X className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 미리보기 (모든 탭의 효과를 합친 결과) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">미리보기</span>
            <div role="group" aria-label="미리보기 배경" className="flex border border-zinc-300 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setPreviewDark(false)}
                aria-pressed={!previewDark}
                aria-label="밝은 배경으로 보기"
                title="밝은 배경으로 보기"
                className={`flex items-center justify-center w-7 h-6 rounded-none ${
                  !previewDark
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                    : 'bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewDark(true)}
                aria-pressed={previewDark}
                aria-label="어두운 배경으로 보기"
                title="어두운 배경으로 보기"
                className={`flex items-center justify-center w-7 h-6 rounded-none border-l border-zinc-300 dark:border-zinc-700 ${
                  previewDark
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                    : 'bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* 배경/기본 글자색은 사이트 테마가 아니라 위 토글을 따름 */}
          <div
            className="px-3 py-3 min-h-[3.5rem] max-h-36 overflow-hidden rounded-none border border-zinc-300 dark:border-zinc-700 break-words"
            style={{ backgroundColor: previewTheme.bg, color: previewTheme.fg }}
          >
            {previewSegments.length > 0 ? (
              <span className="transition-none" style={baseTextStyle}>
                {previewSegments.map((seg, i) => (
                  <span
                    key={i}
                    className="transition-none"
                    style={
                      livePatch
                        ? textAttrsToStyle(applyTextStylePatch(seg.style, livePatch))
                        : highlightStyle(highlightApplies ? highlightResult : seg.highlight)
                    }
                  >
                    {seg.text}
                  </span>
                ))}
              </span>
            ) : (
              <span className="transition-none" style={previewStyle}>
                {previewText}
              </span>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={handleClear}
            title={isText ? '글씨 색·테두리·글로우 지우기' : '형광펜 지우기'}
            className="px-1 py-2 text-xs font-bold rounded-none text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
          >
            초기화
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-none border border-zinc-400 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 text-xs font-black rounded-none transition shadow-sm bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black"
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
