// 게시글 HTML -> 목록 미리보기용 텍스트/썸네일 추출 유틸

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** &amp; &lt; &#39; 등 HTML 엔티티를 실제 문자로 복원 (미리보기에 &amp; 가 그대로 보이던 문제 해결) */
export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) {
      const code = parseInt(lower.slice(2), 16)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
    }
    if (lower.startsWith('#')) {
      const code = parseInt(lower.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[lower] ?? match
  })

export const extractFirstImage = (html: string): string | null => {
  if (!html) return null
  const imgMatch = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i)
  if (imgMatch) return decodeEntities(imgMatch[1])
  const posterMatch = html.match(/<video[^>]+poster=['"]([^'"]+)['"]/i)
  if (posterMatch) return decodeEntities(posterMatch[1])
  return null
}

export const extractPlainText = (html: string): string => {
  if (!html) return ''
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

export const countImages = (html: string): number => {
  if (!html) return 0
  const matches = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi)
  return matches ? matches.length : 0
}

/** 검색 비교용 정규화 (공백 제거 + 소문자) */
export const normalizeForSearch = (text: string): string => (text || '').replace(/\s+/g, '').toLowerCase()
