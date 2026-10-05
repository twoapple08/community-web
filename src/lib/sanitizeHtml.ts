// 게시글 본문 HTML 보안 정화 (XSS 차단)
// - 에디터가 만드는 서식(글꼴/색상/표/이미지/동영상/링크)은 그대로 유지
// - 스크립트 실행이 가능한 태그/속성/URL 만 제거
// 브라우저(DOMParser) 전용이며, 서버 렌더링 시에는 빈 문자열을 반환합니다.

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option',
  'noscript', 'template', 'svg', 'math', 'portal', 'dialog',
])

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'span',
  'a', 'img', 'video', 'source', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'colgroup', 'col', 'div', 'sub', 'sup', 'small', 'font', 'center', 'figure', 'figcaption',
  'caption', 'abbr', 'q', 'cite', 'kbd', 'samp', 'var', 'time',
])

const ALLOWED_ATTRS = new Set([
  'class', 'style', 'title', 'alt', 'href', 'target', 'rel', 'src', 'poster', 'controls',
  'playsinline', 'preload', 'muted', 'loop', 'width', 'height', 'colspan', 'rowspan',
  'colwidth', 'align', 'valign', 'dir', 'lang', 'start', 'reversed', 'type', 'color', 'face',
  'size', 'datetime', 'span',
])

const URL_ATTRS = new Set(['href', 'src', 'poster'])
const DANGEROUS_STYLE = /expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import|url\s*\(/i

const isSafeUrl = (attr: string, tag: string, value: string): boolean => {
  const v = value.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase()
  if (!v) return false
  if (v.startsWith('#') || v.startsWith('/')) return true
  if (v.startsWith('http:') || v.startsWith('https:')) return true
  if (attr === 'href' && v.startsWith('mailto:')) return true
  // 업로드 실패 시 에디터가 넣는 data:image 미리보기 이미지 허용
  if (tag === 'img' && attr === 'src' && v.startsWith('data:image/')) return true
  // 스킴이 없는 상대 경로
  return !/^[a-z][a-z0-9+.-]*:/.test(v)
}

const cleanElement = (el: Element) => {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const tag = el.tagName.toLowerCase()
    const keep =
      (ALLOWED_ATTRS.has(name) || (name.startsWith('data-') && !name.startsWith('data-on'))) &&
      !name.startsWith('on')

    if (!keep) {
      el.removeAttribute(attr.name)
      continue
    }
    if (URL_ATTRS.has(name) && !isSafeUrl(name, tag, attr.value)) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === 'style' && DANGEROUS_STYLE.test(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }
}

const walk = (node: Node) => {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.parentNode?.removeChild(child)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue

    const el = child as Element
    const tag = el.tagName.toLowerCase()

    if (DROP_WITH_CONTENT.has(tag)) {
      el.parentNode?.removeChild(el)
      continue
    }

    walk(el)

    if (!ALLOWED_TAGS.has(tag)) {
      // 알 수 없는 태그는 껍데기만 벗기고 내용은 유지
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
      }
      continue
    }

    cleanElement(el)
  }
}

/** 문서(Document) 단위로 정화 – 이미 DOMParser 로 파싱한 문서에 사용 */
export const sanitizeDocument = (doc: Document) => {
  walk(doc.body)
}

/** HTML 문자열 정화 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  sanitizeDocument(doc)
  return doc.body.innerHTML
}

/** innerHTML 템플릿에 끼워 넣는 텍스트 이스케이프 */
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
