// 색상 변환 / 글자 스타일(글씨색·테두리·글로우) CSS 생성·해석 / 즐겨찾기 색 저장
// 리치 텍스트 에디터(Editor.tsx)와 색 편집 팝업(ColorStudio.tsx)이 함께 사용합니다.

export interface RGBA {
  r: number // 0~255
  g: number
  b: number
  a: number // 0~1
}

export interface HSV {
  h: number // 0~360
  s: number // 0~1
  v: number // 0~1
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const round2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------
// 변환
// ---------------------------------------------------------------------
export const rgbToHex = ({ r, g, b }: Pick<RGBA, 'r' | 'g' | 'b'>): string =>
  `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('')}`

export const hexToRgba = (hex: string): RGBA | null => {
  const clean = hex.trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(clean)) return null
  const full = clean.length <= 4 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const a = full.length === 8 ? round2(parseInt(full.slice(6, 8), 16) / 255) : 1
  return { r, g, b, a }
}

export const rgbToHsv = ({ r, g, b }: Pick<RGBA, 'r' | 'g' | 'b'>): HSV => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export const hsvToRgb = ({ h, s, v }: HSV): Pick<RGBA, 'r' | 'g' | 'b'> => {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 60) [rp, gp, bp] = [c, x, 0]
  else if (hh < 120) [rp, gp, bp] = [x, c, 0]
  else if (hh < 180) [rp, gp, bp] = [0, c, x]
  else if (hh < 240) [rp, gp, bp] = [0, x, c]
  else if (hh < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) }
}

let normalizerCtx: CanvasRenderingContext2D | null | undefined

/** CSS 색 문자열(#hex, rgb(), rgba(), 색 이름 등) → RGBA. 해석 불가면 null */
export const parseCssColor = (input: string | null | undefined): RGBA | null => {
  if (!input) return null
  const value = input.trim()
  if (!value) return null

  const hex = hexToRgba(value)
  if (hex) return hex

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i)
  if (rgb) {
    let a = 1
    if (rgb[4] !== undefined) a = rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
    return { r: clamp(+rgb[1], 0, 255), g: clamp(+rgb[2], 0, 255), b: clamp(+rgb[3], 0, 255), a: clamp(round2(a), 0, 1) }
  }

  // 색 이름 등은 브라우저에 해석을 맡김
  if (typeof document === 'undefined') return null
  if (normalizerCtx === undefined) {
    normalizerCtx = document.createElement('canvas').getContext('2d')
  }
  if (!normalizerCtx) return null
  normalizerCtx.fillStyle = '#010203'
  normalizerCtx.fillStyle = value
  const normalized = String(normalizerCtx.fillStyle)
  if (normalized === '#010203' && value.toLowerCase() !== '#010203') return null
  return hexToRgba(normalized) ?? parseCssColor(normalized.startsWith('rgb') ? normalized : null)
}

/** RGBA → CSS 문자열 (불투명이면 #rrggbb, 반투명이면 rgba()) */
export const formatCssColor = (c: RGBA): string => {
  const a = clamp(round2(c.a), 0, 1)
  if (a >= 1) return rgbToHex(c)
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`
}

/** 같은 색인지 비교 (표기 방식 무관) */
export const isSameColor = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ca = parseCssColor(a)
  const cb = parseCssColor(b)
  if (!ca || !cb) return false
  return ca.r === cb.r && ca.g === cb.g && ca.b === cb.b && Math.abs(ca.a - cb.a) < 0.01
}

/** 밝은 색 위에 올릴 글자색 결정용 (0~1, 클수록 밝음) */
export const relativeLuminance = ({ r, g, b }: Pick<RGBA, 'r' | 'g' | 'b'>): number => {
  const ch = (n: number) => {
    const s = n / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

// ---------------------------------------------------------------------
// 글자 스타일 (글씨 색 / 테두리 / 글로우)
// ---------------------------------------------------------------------
export interface StrokeStyle {
  /** 테두리 두께(px). 글자 바깥쪽으로 절반 정도가 보입니다 (paint-order: stroke fill) */
  width: number
  color: string
}

export interface GlowStyle {
  /** 번짐 범위(px) */
  size: number
  /** 강도 (겹치는 그림자 수, 1~5) */
  strength: number
  color: string
}

export interface TextStyleValue {
  color: string | null
  stroke: StrokeStyle | null
  glow: GlowStyle | null
}

export const STROKE_WIDTH_RANGE = { min: 0.5, max: 6, step: 0.5, default: 2 }
export const GLOW_SIZE_RANGE = { min: 2, max: 30, step: 1, default: 8 }
export const GLOW_STRENGTH_RANGE = { min: 1, max: 5, step: 1, default: 2 }
export const OPACITY_RANGE = { min: 10, max: 100, step: 5, default: 100 } // %

export const EMPTY_TEXT_STYLE: TextStyleValue = { color: null, stroke: null, glow: null }

/** `-webkit-text-stroke` 값 (예: "2px #000000") */
export const buildStrokeCss = (stroke: StrokeStyle): string => `${round2(stroke.width)}px ${stroke.color}`

export const parseStrokeCss = (value: string | null | undefined): StrokeStyle | null => {
  if (!value) return null
  const trimmed = value.trim()
  // 브라우저에 따라 "2px rgb(...)" 또는 "rgb(...) 2px" 순서로 정규화되므로 둘 다 처리
  const widthFirst = trimmed.match(/^([\d.]+)px\s+(.+)$/i)
  const colorFirst = widthFirst ? null : trimmed.match(/^(.+?)\s+([\d.]+)px$/i)
  const widthText = widthFirst?.[1] ?? colorFirst?.[2]
  const colorText = widthFirst?.[2] ?? colorFirst?.[1]
  if (!widthText || !colorText) return null
  const width = parseFloat(widthText)
  const color = parseCssColor(colorText)
  if (!Number.isFinite(width) || width <= 0 || !color) return null
  return { width: clamp(width, STROKE_WIDTH_RANGE.min, STROKE_WIDTH_RANGE.max), color: formatCssColor(color) }
}

/** `text-shadow` 값 (예: "0 0 8px #ffee00, 0 0 8px #ffee00") */
export const buildGlowCss = (glow: GlowStyle): string => {
  const layer = `0 0 ${round2(glow.size)}px ${glow.color}`
  const strength = clamp(Math.round(glow.strength), GLOW_STRENGTH_RANGE.min, GLOW_STRENGTH_RANGE.max)
  return Array.from({ length: strength }, () => layer).join(', ')
}

/** 괄호 안의 쉼표는 무시하고 그림자 목록 분리 */
const splitShadowList = (value: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export const parseGlowCss = (value: string | null | undefined): GlowStyle | null => {
  if (!value || value.trim() === 'none') return null
  const layers = splitShadowList(value)
  if (layers.length === 0) return null
  const first = layers[0]
  // 브라우저가 "rgb(...) 0px 0px 8px" 처럼 색을 앞으로 옮겨 정규화하는 경우도 처리
  const colorMatch = first.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|[a-z]+)\s*$/i) || first.match(/^(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|[a-z]+)/i)
  const lengths = first.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, ' ').match(/-?[\d.]+px|\b0\b/g) || []
  const blur = lengths.length >= 3 ? parseFloat(lengths[2]) : NaN
  const color = colorMatch ? parseCssColor(colorMatch[1]) : null
  if (!color || !Number.isFinite(blur) || blur <= 0) return null
  return {
    size: clamp(blur, GLOW_SIZE_RANGE.min, GLOW_SIZE_RANGE.max),
    strength: clamp(layers.length, GLOW_STRENGTH_RANGE.min, GLOW_STRENGTH_RANGE.max),
    color: formatCssColor(color),
  }
}

/** 에디터 마크 속성(color/stroke/glow 문자열) → 화면용 인라인 CSS 문자열 */
export const textMarkAttrsToCss = (attrs: { color?: string | null; stroke?: string | null; glow?: string | null }): string => {
  const parts: string[] = []
  if (attrs.color) parts.push(`color: ${attrs.color}`)
  if (attrs.stroke) parts.push(`-webkit-text-stroke: ${attrs.stroke}`, 'paint-order: stroke fill')
  if (attrs.glow) parts.push(`text-shadow: ${attrs.glow}`)
  return parts.length ? `${parts.join('; ')};` : ''
}

/** TextStyleValue → 에디터 마크 속성 */
export const textStyleToMarkAttrs = (value: TextStyleValue): { color: string | null; stroke: string | null; glow: string | null } => ({
  color: value.color,
  stroke: value.stroke ? buildStrokeCss(value.stroke) : null,
  glow: value.glow ? buildGlowCss(value.glow) : null,
})

/** 에디터 마크 속성 → TextStyleValue */
export const markAttrsToTextStyle = (attrs: { color?: string | null; stroke?: string | null; glow?: string | null } | null | undefined): TextStyleValue => {
  const color = parseCssColor(attrs?.color ?? null)
  return {
    color: color ? formatCssColor(color) : null,
    stroke: parseStrokeCss(attrs?.stroke ?? null),
    glow: parseGlowCss(attrs?.glow ?? null),
  }
}

/** TextStyleValue → 인라인 CSS (미리보기 및 빈 선택 시 삽입용) */
export const textStyleToCss = (value: TextStyleValue): string => textMarkAttrsToCss(textStyleToMarkAttrs(value))

// ---------------------------------------------------------------------
// 부분 적용 (여러 색/효과가 섞인 선택 영역에서 '바꾼 항목만' 적용)
// ---------------------------------------------------------------------
export interface RawTextMarkAttrs {
  color?: string | null
  stroke?: string | null
  glow?: string | null
}

/**
 * 효과(테두리/글로우) 변경 방법
 * - null: 지움
 * - { set }: 선택한 모든 글자에 이 값으로 (효과를 새로 켠 경우)
 * - { merge }: 이미 효과가 있는 글자에만, 바꾼 값(두께·색 등)만 덮어씀 (나머지 값과 효과 없는 글자는 그대로)
 */
export type EffectPatch<T> = null | { set: T } | { merge: Partial<T> }

/** 각 항목: undefined = 그대로 둠 */
export interface TextStylePatch {
  color?: string | null
  stroke?: EffectPatch<StrokeStyle>
  glow?: EffectPatch<GlowStyle>
}

export const isEmptyTextStylePatch = (patch: TextStylePatch): boolean =>
  patch.color === undefined && patch.stroke === undefined && patch.glow === undefined

const resolveEffectPatch = <T>(
  raw: string | null,
  patch: EffectPatch<T>,
  parse: (value: string | null) => T | null,
  build: (value: T) => string
): string | null => {
  if (patch === null) return null
  if ('set' in patch) return build(patch.set)
  const current = parse(raw)
  // 효과가 없거나 사이트 형식이 아닌 효과(직접 붙여 넣은 그림자 등)는 건드리지 않음
  if (!current) return raw
  return build({ ...current, ...patch.merge })
}

/** 글자 한 구간의 기존 속성 + 변경 내용 → 새 속성 (바꾸지 않은 항목은 원래 문자열 그대로) */
export const applyTextStylePatch = (
  old: RawTextMarkAttrs | null | undefined,
  patch: TextStylePatch
): { color: string | null; stroke: string | null; glow: string | null } => {
  const next = { color: old?.color || null, stroke: old?.stroke || null, glow: old?.glow || null }
  if (patch.color !== undefined) next.color = patch.color
  if (patch.stroke !== undefined) next.stroke = resolveEffectPatch(next.stroke, patch.stroke, parseStrokeCss, buildStrokeCss)
  if (patch.glow !== undefined) next.glow = resolveEffectPatch(next.glow, patch.glow, parseGlowCss, buildGlowCss)
  return next
}

// ---------------------------------------------------------------------
// 즐겨찾기 색 (기기별 저장)
// ---------------------------------------------------------------------
export type FavoriteKind = 'text' | 'highlight'
export const MAX_FAVORITE_COLORS = 12
const FAVORITE_KEYS: Record<FavoriteKind, string> = {
  text: 'sfa_fav_text_colors',
  highlight: 'sfa_fav_highlight_colors',
}
const FAVORITES_EVENT = 'sfa-favorite-colors-changed'

export const loadFavoriteColors = (kind: FavoriteKind): string[] => {
  try {
    const raw = localStorage.getItem(FAVORITE_KEYS[kind])
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list
      .filter((c): c is string => typeof c === 'string' && Boolean(parseCssColor(c)))
      .slice(0, MAX_FAVORITE_COLORS)
  } catch {
    return []
  }
}

export const saveFavoriteColors = (kind: FavoriteKind, colors: string[]) => {
  const unique: string[] = []
  colors.forEach((c) => {
    if (!unique.some((u) => isSameColor(u, c))) unique.push(c)
  })
  try {
    localStorage.setItem(FAVORITE_KEYS[kind], JSON.stringify(unique.slice(0, MAX_FAVORITE_COLORS)))
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: { kind } }))
  }
}

/** 즐겨찾기 추가/제거 토글. 추가되면 true */
export const toggleFavoriteColor = (kind: FavoriteKind, color: string): boolean => {
  const list = loadFavoriteColors(kind)
  const exists = list.some((c) => isSameColor(c, color))
  if (exists) {
    saveFavoriteColors(kind, list.filter((c) => !isSameColor(c, color)))
    return false
  }
  saveFavoriteColors(kind, [color, ...list])
  return true
}

/** 즐겨찾기 변경 구독 (다른 컴포넌트/탭과 동기화) */
export const onFavoriteColorsChanged = (listener: (kind: FavoriteKind) => void) => {
  if (typeof window === 'undefined') return () => {}
  const handleLocal = (e: Event) => listener((e as CustomEvent<{ kind: FavoriteKind }>).detail.kind)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === FAVORITE_KEYS.text) listener('text')
    if (e.key === FAVORITE_KEYS.highlight) listener('highlight')
  }
  window.addEventListener(FAVORITES_EVENT, handleLocal)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(FAVORITES_EVENT, handleLocal)
    window.removeEventListener('storage', handleStorage)
  }
}
