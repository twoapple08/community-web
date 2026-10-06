// 에디터 이미지: 누르면 주황색 점 8개(위 3개, 가운데 2개, 아래 3개)가 나타나고, 점을 끌어 크기를 조절
// - tiptap 기본 ResizableNodeView 는 touchend 를 처리하지 않고(모바일에서 크기 조절이 안 끝남) 손잡이를 항상 보여 줘서 직접 구현
// - 저장 값은 HTML width 속성(px)뿐 (height 없음) → 글 본문에서는 max-width: 100% 로 화면 폭에 맞게 줄어듦
// - 손잡이/외곽선 모양은 editor.css
import Image from '@tiptap/extension-image'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view'

const MIN_WIDTH = 40

type HandleDir = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

interface HandleSpec {
  dir: HandleDir
  /** 가로 위치 (-1 왼쪽, 0 가운데, 1 오른쪽) */
  x: -1 | 0 | 1
  /** 세로 위치 (-1 위, 0 가운데, 1 아래) */
  y: -1 | 0 | 1
}

const HANDLES: HandleSpec[] = [
  // 위 3개
  { dir: 'nw', x: -1, y: -1 },
  { dir: 'n', x: 0, y: -1 },
  { dir: 'ne', x: 1, y: -1 },
  // 가운데 2개
  { dir: 'w', x: -1, y: 0 },
  { dir: 'e', x: 1, y: 0 },
  // 아래 3개
  { dir: 'sw', x: -1, y: 1 },
  { dir: 's', x: 0, y: 1 },
  { dir: 'se', x: 1, y: 1 },
]

/** "320", "320px", "320.4" → 320 (%, auto 등 px 가 아닌 값은 null) */
export const parseImageWidth = (value: string | null | undefined): number | null => {
  if (!value) return null
  const m = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
  if (!m) return null
  const n = Math.round(parseFloat(m[1]))
  return Number.isFinite(n) && n > 0 ? n : null
}

const toWidth = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  if (typeof value === 'string') return parseImageWidth(value)
  return null
}

/** 안쪽 여백을 뺀 실제 내용 폭 */
const innerWidth = (el: HTMLElement): number => {
  const cs = window.getComputedStyle(el)
  return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
}

interface DragState {
  pointerId: number
  handle: HandleSpec
  handleEl: HTMLElement
  startX: number
  startY: number
  startWidth: number
  /** 가로/세로 비율 (위·아래 가운데 점은 세로 이동량 × 비율 만큼 가로 폭 변경) */
  ratio: number
  maxWidth: number
  width: number
}

class ResizableImageView implements NodeView {
  dom: HTMLSpanElement
  private img: HTMLImageElement
  private handleEls: HTMLDivElement[] = []
  private badge: HTMLDivElement
  private node: PMNode
  private view: EditorView
  private getPos: () => number | undefined
  private drag: DragState | null = null

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('span')
    this.dom.className = 'sfa-img-resize'

    this.img = document.createElement('img')
    this.img.draggable = false
    this.dom.appendChild(this.img)

    HANDLES.forEach((spec) => {
      const el = document.createElement('div')
      el.className = 'sfa-img-resize__handle'
      el.dataset.dir = spec.dir
      el.setAttribute('aria-hidden', 'true')
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e, spec, el))
      this.handleEls.push(el)
      this.dom.appendChild(el)
    })

    this.badge = document.createElement('div')
    this.badge.className = 'sfa-img-resize__badge'
    this.badge.setAttribute('aria-hidden', 'true')
    this.dom.appendChild(this.badge)

    // 손잡이를 끌 때 브라우저 기본 끌어놓기(이미지 이동)가 시작되지 않도록
    this.dom.addEventListener('dragstart', this.onDragStart)

    this.syncFromNode()
  }

  // -------------------------------------------------------------------
  // 화면 ↔ 노드 속성
  // -------------------------------------------------------------------
  private syncFromNode() {
    const { src, alt, title } = this.node.attrs as { src?: string | null; alt?: string | null; title?: string | null }
    if (src) {
      if (this.img.getAttribute('src') !== src) this.img.setAttribute('src', src)
    } else {
      this.img.removeAttribute('src')
    }
    if (alt) this.img.setAttribute('alt', alt)
    else this.img.removeAttribute('alt')
    if (title) this.img.setAttribute('title', title)
    else this.img.removeAttribute('title')

    // 끄는 중에는 화면에 보이는 크기를 덮어쓰지 않음
    if (this.drag) return
    const width = toWidth(this.node.attrs.width)
    this.img.style.width = width ? `${width}px` : ''
    this.dom.classList.toggle('has-width', Boolean(width))
  }

  /** 크기 조절 최대 폭 = 에디터 내용 폭 (들여쓰기·표 칸 안이면 그 칸의 폭) */
  private getMaxWidth(): number {
    let max = innerWidth(this.view.dom)
    let block = this.dom.parentElement
    while (block && block !== this.view.dom && window.getComputedStyle(block).display.startsWith('inline')) {
      block = block.parentElement
    }
    if (block && block !== this.view.dom) {
      const blockWidth = innerWidth(block)
      if (blockWidth > 0) max = Math.min(max, blockWidth)
    }
    return Math.max(MIN_WIDTH, Math.floor(max))
  }

  private isControl(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false
    return this.badge.contains(target) || this.handleEls.some((el) => el.contains(target))
  }

  // -------------------------------------------------------------------
  // 끌어서 크기 조절 (Pointer Events → 마우스·터치 모두)
  // -------------------------------------------------------------------
  private onDragStart = (e: DragEvent) => {
    if (!this.drag && !this.isControl(e.target)) return
    // 에디터까지 전달되면 취소된 끌기 정보가 남아 나중에 엉뚱한 놓기(drop)에 쓰일 수 있어 여기서 차단
    e.preventDefault()
    e.stopPropagation()
  }

  private onPointerDown(e: PointerEvent, handle: HandleSpec, handleEl: HTMLElement) {
    if (!this.view.editable || this.drag) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const rect = this.img.getBoundingClientRect()
    // 이미지를 아직 불러오지 못함
    if (!rect.width) return
    const natural = this.img.naturalWidth && this.img.naturalHeight ? this.img.naturalWidth / this.img.naturalHeight : 1
    const ratio = rect.height > 0 ? rect.width / rect.height : natural

    try {
      handleEl.setPointerCapture(e.pointerId)
    } catch {}

    const startWidth = Math.round(rect.width)
    this.drag = {
      pointerId: e.pointerId,
      handle,
      handleEl,
      startX: e.clientX,
      startY: e.clientY,
      startWidth,
      ratio,
      maxWidth: this.getMaxWidth(),
      width: startWidth,
    }
    // 끄는 동안 현재 크기를 고정해 두고 숫자 표시
    this.img.style.width = `${startWidth}px`
    this.dom.classList.add('is-resizing', 'has-width')
    this.badge.textContent = `${startWidth}px`

    window.addEventListener('pointermove', this.onPointerMove, { passive: false })
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    handleEl.addEventListener('lostpointercapture', this.onLostCapture)
  }

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag
    if (!d || e.pointerId !== d.pointerId) return
    e.preventDefault()
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    // 오른쪽 점은 오른쪽으로, 왼쪽 점은 왼쪽으로 끌면 커짐 / 위·아래 가운데 점은 세로 이동량 × 비율
    const delta = d.handle.x !== 0 ? d.handle.x * dx : d.handle.y * dy * d.ratio
    const width = Math.round(Math.min(d.maxWidth, Math.max(MIN_WIDTH, d.startWidth + delta)))
    if (width === d.width) return
    d.width = width
    this.img.style.width = `${width}px`
    this.badge.textContent = `${width}px`
  }

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag
    if (!d || e.pointerId !== d.pointerId) return
    // pointercancel(시스템 제스처 등)도 끌어 둔 크기를 그대로 반영
    this.endDrag(true)
  }

  private onLostCapture = (e: PointerEvent) => {
    const d = this.drag
    if (!d || e.pointerId !== d.pointerId) return
    this.endDrag(true)
  }

  private endDrag(commit: boolean) {
    const d = this.drag
    if (!d) return
    this.drag = null

    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    d.handleEl.removeEventListener('lostpointercapture', this.onLostCapture)
    try {
      if (d.handleEl.hasPointerCapture(d.pointerId)) d.handleEl.releasePointerCapture(d.pointerId)
    } catch {}
    this.dom.classList.remove('is-resizing')
    this.badge.textContent = ''

    // 움직이지 않았으면(점을 눌렀다 떼기만 함) 원래대로
    if (!commit || d.width === d.startWidth) {
      this.syncFromNode()
      return
    }

    const pos = this.getPos()
    const current = typeof pos === 'number' ? this.view.state.doc.nodeAt(pos) : null
    if (typeof pos !== 'number' || !current || current.type !== this.node.type) {
      this.syncFromNode()
      return
    }

    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width: d.width })
    // 조절 후에도 이미지 선택(주황색 점)을 유지 → 이어서 다시 조절 가능
    try {
      tr.setSelection(NodeSelection.create(tr.doc, pos))
    } catch {}
    this.view.dispatch(tr)
  }

  // -------------------------------------------------------------------
  // ProseMirror NodeView
  // -------------------------------------------------------------------
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.syncFromNode()
    return true
  }

  selectNode() {
    // 선택된 동안에만 점 8개 + 주황색 외곽선
    if (this.view.editable) this.dom.classList.add('is-selected')
  }

  deselectNode() {
    this.dom.classList.remove('is-selected')
  }

  stopEvent(event: Event): boolean {
    // 손잡이에서 일어난 마우스/터치/끌기 이벤트와 크기 조절 중의 이벤트는 에디터가 처리하지 않음 (선택 변경·이미지 이동 방지)
    return this.drag !== null || this.isControl(event.target)
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type !== 'selection' && this.isControl(mutation.target)) return true
    // 내용이 없는 노드라 크기/클래스 변경 등 DOM 변화는 모두 무시 (선택 변화만 에디터가 처리)
    return mutation.type !== 'selection'
  }

  destroy() {
    // 끄는 도중 노드가 사라지면 저장하지 않고 이벤트만 정리
    this.endDrag(false)
    this.dom.removeEventListener('dragstart', this.onDragStart)
  }
}

export const ResizableImage = Image.extend({
  addAttributes() {
    const attrs: Record<string, unknown> = { ...this.parent?.() }
    // 높이는 저장하지 않음 (가로 폭만 지정, 세로는 비율대로 자동)
    delete attrs.height
    return {
      ...attrs,
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => parseImageWidth(el.getAttribute('width')) ?? parseImageWidth(el.style.width),
        renderHTML: (attributes: Record<string, unknown>) => {
          const width = toWidth(attributes.width)
          return width ? { width: String(width) } : {}
        },
      },
    }
  },

  addNodeView() {
    if (typeof document === 'undefined') return null
    return ({ node, view, getPos }) => new ResizableImageView(node, view, getPos)
  },
}).configure({
  inline: true,
  // 업로드 실패 시 data: 주소로 넣은 이미지가 다시 수정할 때 사라지던 문제
  allowBase64: true,
})

export default ResizableImage
