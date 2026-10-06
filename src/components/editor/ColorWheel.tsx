'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { hsvToRgb, type HSV } from '@/lib/colorUtils'

// 색조 고리 + 회전하는 HSV 삼각형 색 선택기 (canvas)
// - 고리: 3시 방향 빨강(0°)에서 시계 방향으로 노랑 → 초록 → 하늘 → 파랑 → 자홍
// - 삼각형: 순색 꼭짓점이 색조 손잡이를 향하고, +120° 검정, +240° 흰색 (화면 좌표, y 아래 방향)

interface ColorWheelProps {
  hsv: HSV
  onChange: (hsv: HSV) => void
  /** 왼쪽 위 모서리 견본에 보여줄 결과 색 (CSS 색, 반투명 가능) */
  swatch?: string | null
  /** 최대 지름(px). 부모 폭이 좁으면 그만큼 작아짐 */
  maxSize?: number
  ariaLabel?: string
}

/** 반투명 색 뒤에 깔 체크무늬 */
export const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage: 'conic-gradient(#d4d4d8 25%, #ffffff 0 50%, #d4d4d8 0 75%, #ffffff 0)',
  backgroundSize: '10px 10px',
}

interface Pt {
  x: number
  y: number
}

interface Tri {
  hue: Pt
  white: Pt
  black: Pt
}

interface Geometry {
  c: number // 중심
  ro: number // 고리 바깥 반지름
  ri: number // 고리 안쪽 반지름
  rm: number // 고리 중앙선 (색조 손잡이 위치)
  rt: number // 삼각형 꼭짓점 반지름
  hueHandleR: number
  svHandleR: number
  lineWidth: number
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const rad = (deg: number) => (deg * Math.PI) / 180

const getGeometry = (size: number): Geometry => {
  const c = size / 2
  const ringWidth = Math.max(14, Math.round(size * 0.11))
  const lineWidth = size >= 180 ? 3 : 2.5
  const hueHandleR = ringWidth / 2 + 3
  // 큰 손잡이(흰 테 + 어두운 외곽선)가 캔버스 밖으로 잘리지 않도록 여백 확보
  const ro = c - (3 + lineWidth / 2 + 1.5)
  const ri = ro - ringWidth
  return {
    c,
    ro,
    ri,
    rm: ro - ringWidth / 2,
    rt: ri - Math.max(2, size * 0.012),
    hueHandleR,
    svHandleR: Math.max(6, size * 0.034),
    lineWidth,
  }
}

const triangleOf = (g: Geometry, hue: number): Tri => {
  const at = (deg: number): Pt => ({ x: g.c + g.rt * Math.cos(rad(deg)), y: g.c + g.rt * Math.sin(rad(deg)) })
  return { hue: at(hue), black: at(hue + 120), white: at(hue + 240) }
}

/** 점 p 의 무게중심 좌표 [순색, 흰색, 검정] */
const barycentric = (p: Pt, t: Tri): [number, number, number] => {
  const { hue: a, white: b, black: c } = t
  const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
  if (det === 0) return [0, 0, 1]
  const wa = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det
  const wb = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det
  return [wa, wb, 1 - wa - wb]
}

const closestOnSegment = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1) : 0
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/** 삼각형 안의 위치 → 채도/명도 (밖이면 가장 가까운 가장자리로 고정) */
const svFromPoint = (p: Pt, t: Tri, prev: HSV): HSV => {
  let w = barycentric(p, t)
  if (w[0] < 0 || w[1] < 0 || w[2] < 0) {
    const candidates = [closestOnSegment(p, t.hue, t.white), closestOnSegment(p, t.white, t.black), closestOnSegment(p, t.black, t.hue)]
    let best = candidates[0]
    let bestDist = Infinity
    candidates.forEach((q) => {
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = q
      }
    })
    w = barycentric(best, t)
    const wh = Math.max(0, w[0])
    const ww = Math.max(0, w[1])
    const wk = Math.max(0, w[2])
    const sum = wh + ww + wk || 1
    w = [wh / sum, ww / sum, wk / sum]
  }
  // 색 = 순색×wH + 흰색×wW → 명도 = wH + wW, 채도 = wH / 명도
  const v = clamp(w[0] + w[1], 0, 1)
  // 검정 꼭짓점에서는 채도가 정해지지 않으므로 이전 값 유지
  const s = v > 0.0001 ? clamp(w[0] / v, 0, 1) : prev.s
  return { h: prev.h, s, v }
}

/** 채도/명도 → 삼각형 안의 위치 */
const pointFromSv = (hsv: HSV, t: Tri): Pt => {
  const wh = hsv.s * hsv.v
  const ww = hsv.v * (1 - hsv.s)
  const wk = 1 - hsv.v
  return {
    x: wh * t.hue.x + ww * t.white.x + wk * t.black.x,
    y: wh * t.hue.y + ww * t.white.y + wk * t.black.y,
  }
}

/** 색조 고리 (크기가 바뀔 때만 다시 그림) */
const renderRing = (px: number, dpr: number, g: Geometry): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const ringPath = () => {
    ctx.beginPath()
    ctx.arc(g.c, g.c, g.ro, 0, Math.PI * 2)
    ctx.arc(g.c, g.c, g.ri, 0, Math.PI * 2, true)
    ctx.closePath()
  }
  if (typeof ctx.createConicGradient === 'function') {
    // 원뿔 그라데이션: 0rad(3시)부터 시계 방향 → 색조 각도와 그대로 일치
    const grad = ctx.createConicGradient(0, g.c, g.c)
    for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, `hsl(${i * 30}, 100%, 50%)`)
    ringPath()
    ctx.fillStyle = grad
    ctx.fill()
  } else {
    // 구형 브라우저: 1° 쐐기를 살짝 겹쳐 그려 이음새가 보이지 않게
    ctx.save()
    ringPath()
    ctx.clip()
    for (let deg = 0; deg < 360; deg++) {
      ctx.beginPath()
      ctx.moveTo(g.c, g.c)
      ctx.arc(g.c, g.c, g.ro + 1, rad(deg - 0.6), rad(deg + 1.1))
      ctx.closePath()
      ctx.fillStyle = `hsl(${deg}, 100%, 50%)`
      ctx.fill()
    }
    ctx.restore()
  }
  return canvas
}

/** 삼각형 내부를 장치 픽셀 단위로 직접 계산 (무게중심 보간) */
const renderTriangle = (canvas: HTMLCanvasElement, px: number, dpr: number, t: Tri, hue: number) => {
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px
    canvas.height = px
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, px, px)

  const H = { x: t.hue.x * dpr, y: t.hue.y * dpr }
  const W = { x: t.white.x * dpr, y: t.white.y * dpr }
  const B = { x: t.black.x * dpr, y: t.black.y * dpr }
  // 가장자리 안티앨리어싱용으로 2px 여유 (바깥 픽셀은 가장 가까운 색으로 채우고 경로로 잘라냄)
  const minX = Math.max(0, Math.floor(Math.min(H.x, W.x, B.x)) - 2)
  const maxX = Math.min(px, Math.ceil(Math.max(H.x, W.x, B.x)) + 2)
  const minY = Math.max(0, Math.floor(Math.min(H.y, W.y, B.y)) - 2)
  const maxY = Math.min(px, Math.ceil(Math.max(H.y, W.y, B.y)) + 2)
  const w = maxX - minX
  const h = maxY - minY
  if (w <= 0 || h <= 0) return

  const det = (W.y - B.y) * (H.x - B.x) + (B.x - W.x) * (H.y - B.y)
  if (det === 0) return
  const a1 = (W.y - B.y) / det
  const a2 = (B.x - W.x) / det
  const b1 = (B.y - H.y) / det
  const b2 = (H.x - B.x) / det
  const { r: hr, g: hg, b: hb } = hsvToRgb({ h: hue, s: 1, v: 1 })

  const img = ctx.createImageData(w, h)
  const data = img.data
  let i = 0
  for (let y = 0; y < h; y++) {
    const dy = minY + y + 0.5 - B.y
    for (let x = 0; x < w; x++) {
      const dx = minX + x + 0.5 - B.x
      let wh = a1 * dx + a2 * dy
      let ww = b1 * dx + b2 * dy
      if (wh < 0) wh = 0
      if (ww < 0) ww = 0
      const sum = wh + ww
      if (sum > 1) {
        wh /= sum
        ww /= sum
      }
      // 검정 꼭짓점 성분은 0 이므로 순색·흰색만 더함
      const white = ww * 255
      data[i] = wh * hr + white
      data[i + 1] = wh * hg + white
      data[i + 2] = wh * hb + white
      data[i + 3] = 255
      i += 4
    }
  }
  ctx.putImageData(img, minX, minY)
}

/** 흰 테 손잡이 (밝은 배경에서도 보이도록 어두운 외곽선 + 그림자) */
const drawHandle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lw: number, dpr: number, fill: string | null) => {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 4 * dpr
  ctx.lineWidth = lw + 2
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.stroke()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  if (fill) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0, r - lw / 2), 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.lineWidth = lw
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.restore()
}

type DragMode = 'hue' | 'sv'

export default function ColorWheel({
  hsv,
  onChange,
  swatch,
  maxSize = 220,
  ariaLabel = '색상환: 바깥 고리로 색조, 안쪽 삼각형으로 채도와 밝기를 고릅니다',
}: ColorWheelProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)
  const [dprTick, setDprTick] = useState(0)

  const cacheRef = useRef<{ ring: HTMLCanvasElement | null; ringKey: string; tri: HTMLCanvasElement | null; triKey: string }>({
    ring: null,
    ringKey: '',
    tri: null,
    triKey: '',
  })
  const dragRef = useRef<{ id: number; mode: DragMode } | null>(null)
  const pendingRef = useRef<Pt | null>(null)
  const rafRef = useRef<number | null>(null)
  // 드래그 중에는 렌더 반영 전에도 최신 값으로 이어서 계산
  const liveRef = useRef<HSV>(hsv)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    liveRef.current = hsv
  }, [hsv])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // 부모 폭에 맞춰 지름 결정 (정수 px 로 맞춰야 선명함)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      const next = Math.max(0, Math.min(maxSize, Math.floor(el.getBoundingClientRect().width)))
      setSize((prev) => (prev === next ? prev : next))
    }
    if (typeof ResizeObserver === 'undefined') {
      const id = requestAnimationFrame(update)
      window.addEventListener('resize', update)
      return () => {
        cancelAnimationFrame(id)
        window.removeEventListener('resize', update)
      }
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxSize])

  // 화면 배율(devicePixelRatio)이 바뀌면 다시 그림 (확대/축소, 다른 모니터로 이동)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    const handle = () => setDprTick((n) => n + 1)
    mq.addEventListener?.('change', handle)
    return () => mq.removeEventListener?.('change', handle)
  }, [dprTick])

  // 그리기 (드래그 중 값 변경은 requestAnimationFrame 단위로만 들어오므로 프레임당 최대 1회)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3)
    const px = Math.round(size * dpr)
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px
      canvas.height = px
    }
    const g = getGeometry(size)
    const cache = cacheRef.current
    const sizeKey = `${px}|${dpr}`
    if (!cache.ring || cache.ringKey !== sizeKey) {
      cache.ring = renderRing(px, dpr, g)
      cache.ringKey = sizeKey
    }
    const tri = triangleOf(g, hsv.h)
    const triKey = `${sizeKey}|${hsv.h}`
    if (!cache.tri) cache.tri = document.createElement('canvas')
    if (cache.triKey !== triKey) {
      renderTriangle(cache.tri, px, dpr, tri, hsv.h)
      cache.triKey = triKey
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, px, px)
    ctx.drawImage(cache.ring, 0, 0)

    // 삼각형: 경로로 잘라내 가장자리를 매끄럽게
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.beginPath()
    ctx.moveTo(tri.hue.x, tri.hue.y)
    ctx.lineTo(tri.white.x, tri.white.y)
    ctx.lineTo(tri.black.x, tri.black.y)
    ctx.closePath()
    ctx.clip()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(cache.tri, 0, 0)
    ctx.restore()

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 흰/검정 꼭짓점이 흰/검정 패널 배경에 묻히지 않도록 아주 옅은 회색 외곽선
    ctx.beginPath()
    ctx.moveTo(tri.hue.x, tri.hue.y)
    ctx.lineTo(tri.white.x, tri.white.y)
    ctx.lineTo(tri.black.x, tri.black.y)
    ctx.closePath()
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)'
    ctx.stroke()

    const { r, g: gg, b } = hsvToRgb({ h: hsv.h, s: 1, v: 1 })
    drawHandle(ctx, g.c + g.rm * Math.cos(rad(hsv.h)), g.c + g.rm * Math.sin(rad(hsv.h)), g.hueHandleR, g.lineWidth, dpr, `rgb(${r}, ${gg}, ${b})`)
    const p = pointFromSv(hsv, tri)
    drawHandle(ctx, p.x, p.y, g.svHandleR, g.lineWidth - 0.5, dpr, null)
  }, [hsv, size, dprTick])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  const toLocal = (clientX: number, clientY: number): Pt | null => {
    const canvas = canvasRef.current
    if (!canvas || size <= 0) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0) return null
    // 열리는 애니메이션(확대) 중에도 정확하도록 실제 표시 크기로 환산
    const scale = size / rect.width
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale }
  }

  const processPending = () => {
    rafRef.current = null
    const drag = dragRef.current
    const p = pendingRef.current
    pendingRef.current = null
    if (!drag || !p || size <= 0) return
    const g = getGeometry(size)
    const prev = liveRef.current
    let next: HSV
    if (drag.mode === 'hue') {
      let h = (Math.atan2(p.y - g.c, p.x - g.c) * 180) / Math.PI
      if (h < 0) h += 360
      next = { h, s: prev.s, v: prev.v }
    } else {
      next = svFromPoint(p, triangleOf(g, prev.h), prev)
    }
    if (next.h === prev.h && next.s === prev.s && next.v === prev.v) return
    liveRef.current = next
    onChangeRef.current(next)
  }

  const schedule = (p: Pt) => {
    pendingRef.current = p
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(processPending)
  }

  const flush = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      processPending()
    }
  }

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = toLocal(e.clientX, e.clientY)
    if (!p) return
    const g = getGeometry(size)
    const d = Math.hypot(p.x - g.c, p.y - g.c)
    let mode: DragMode | null = null
    if (d >= g.ri - 1 && d <= g.ro + 14) mode = 'hue'
    else if (d < g.ri - 1) mode = 'sv'
    // 네 귀퉁이(고리 바깥)는 무시
    if (!mode) return
    e.preventDefault()
    // HEX 입력칸 등의 입력을 먼저 확정시키기 위해 직접 포커스 이동
    e.currentTarget.focus({ preventScroll: true })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    dragRef.current = { id: e.pointerId, mode }
    schedule(p)
  }

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return
    const p = toLocal(e.clientX, e.clientY)
    if (p) schedule(p)
  }

  const endDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return
    // 마지막 위치를 놓치지 않도록 대기 중인 프레임을 즉시 처리
    flush()
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  // 키보드: ←/→ 색조, ↑/↓ 밝기, PageUp/PageDown 채도 (Shift 로 크게)
  const handleKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const big = e.shiftKey
    let next: HSV | null = null
    switch (e.key) {
      case 'ArrowLeft':
        next = { ...hsv, h: (hsv.h - (big ? 15 : 3) + 360) % 360 }
        break
      case 'ArrowRight':
        next = { ...hsv, h: (hsv.h + (big ? 15 : 3)) % 360 }
        break
      case 'ArrowUp':
        next = { ...hsv, v: clamp(hsv.v + (big ? 0.1 : 0.02), 0, 1) }
        break
      case 'ArrowDown':
        next = { ...hsv, v: clamp(hsv.v - (big ? 0.1 : 0.02), 0, 1) }
        break
      case 'PageUp':
        next = { ...hsv, s: clamp(hsv.s + 0.05, 0, 1) }
        break
      case 'PageDown':
        next = { ...hsv, s: clamp(hsv.s - 0.05, 0, 1) }
        break
    }
    if (!next) return
    e.preventDefault()
    onChange(next)
  }

  // 고리 바깥 모서리 빈 공간에 들어가는 크기 (색조 손잡이와 겹치지 않게)
  const swatchSize = Math.round(clamp((size || maxSize) * 0.145, 24, 32))

  return (
    <div ref={wrapRef} className="w-full flex justify-center">
      <div
        className="relative shrink-0"
        style={size > 0 ? { width: size, height: size } : { width: '100%', maxWidth: maxSize, aspectRatio: '1 / 1' }}
      >
        <canvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          aria-label={ariaLabel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => {
            dragRef.current = null
          }}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 w-full h-full block cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
        />
        {swatch && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-600 shadow-sm"
            style={{ width: swatchSize, height: swatchSize, ...CHECKERBOARD_STYLE }}
          >
            <span className="absolute inset-0 transition-none" style={{ backgroundColor: swatch }} />
          </span>
        )}
      </div>
    </div>
  )
}
