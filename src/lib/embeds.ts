// 카카오톡 오픈채팅 / 디스코드 초대 / 유튜브 링크 임베드 공통 유틸
// - 게시글 본문(PostModal, innerHTML 방식)과 댓글(React 컴포넌트)이 같은 모양/캐시를 쓰도록 한 곳에 모아 둡니다.

import { escapeHtml } from '@/lib/sanitizeHtml'

export const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi
export const KAKAO_REGEX = /open\.kakao\.com\/[a-zA-Z0-9_\/]+/i
export const DISCORD_REGEX = /(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i
export const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i

export type EmbedType = 'kakaotalk' | 'discord'

/** 링크 종류 판별 (유튜브 / 카톡 / 디코 / 일반) */
export const detectLinkKind = (url: string): 'youtube' | EmbedType | 'link' => {
  if (YOUTUBE_REGEX.test(url)) return 'youtube'
  if (KAKAO_REGEX.test(url)) return 'kakaotalk'
  if (DISCORD_REGEX.test(url)) return 'discord'
  return 'link'
}

export const getYoutubeId = (url: string): string | null => {
  const m = url.match(YOUTUBE_REGEX)
  return m ? m[1] : null
}

/** 링크 끝에 붙은 문장부호(마침표, 쉼표, 닫는 괄호 등)는 링크에서 제외 */
export const trimTrailingPunctuation = (url: string): { url: string; rest: string } => {
  const m = url.match(/^(.*?)([.,!?;:)\]}'"…]+)$/)
  if (!m || !m[1]) return { url, rest: '' }
  return { url: m[1], rest: m[2] }
}

// ---------------------------------------------------------------------
// 실제 방/서버 이름 캐시 (sessionStorage + localStorage, 키: embed_title_{url})
// ---------------------------------------------------------------------
export const readEmbedTitleCache = (url: string): string | null => {
  try {
    const key = `embed_title_${url}`
    return sessionStorage.getItem(key) || localStorage.getItem(key)
  } catch {
    return null
  }
}

export const writeEmbedTitleCache = (url: string, title: string) => {
  try {
    const key = `embed_title_${url}`
    sessionStorage.setItem(key, title)
    localStorage.setItem(key, title)
  } catch {
    // 저장소 사용 불가(시크릿 모드 등) 시 무시
  }
}

const isUsableTitle = (title: string | null | undefined): title is string =>
  Boolean(title && title.trim() && !/^https?:\/\//i.test(title.trim()))

const inflightTitleRequests = new Map<string, Promise<string | null>>()

/** 링크의 실제 이름 조회 (캐시 → /api/link-preview). 같은 링크는 동시에 1번만 요청 */
export const fetchEmbedTitle = (url: string): Promise<string | null> => {
  const cached = readEmbedTitleCache(url)
  if (isUsableTitle(cached)) return Promise.resolve(cached)

  const running = inflightTitleRequests.get(url)
  if (running) return running

  const request = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then(async (res) => {
      if (!res.ok) return null
      const data = await res.json()
      const title = typeof data?.title === 'string' ? data.title.trim() : ''
      if (isUsableTitle(title)) {
        writeEmbedTitleCache(url, title)
        return title
      }
      return null
    })
    .catch(() => null)
    .finally(() => {
      inflightTitleRequests.delete(url)
    })

  inflightTitleRequests.set(url, request)
  return request
}

/** 저장된 이름(data-embed-title) → 캐시 → 링크 글자 순으로 표시 이름 결정 */
export const resolveEmbedDisplayTitle = (type: EmbedType, url: string, stamped?: string | null, linkText?: string | null): string => {
  const cached = readEmbedTitleCache(url)
  const raw = (stamped || cached || linkText || '').trim()
  if (isUsableTitle(raw)) return raw
  return EMBED_STYLES[type].fallbackTitle
}

// ---------------------------------------------------------------------
// 임베드 카드 디자인 (테두리 없이 브랜드 색 50% 로 꽉 채운 바 형식)
// 다크/라이트 모두 글자가 읽히도록 글자색은 테마별로 지정
// ---------------------------------------------------------------------
export const EMBED_STYLES: Record<
  EmbedType,
  { bar: string; iconBox: string; title: string; button: string; buttonLabel: string; fallbackTitle: string }
> = {
  kakaotalk: {
    bar: 'bg-[#FEE500]/50 border-0',
    iconBox: 'bg-[#FEE500] text-[#191919]',
    title: 'text-[#191919] dark:text-white',
    button: 'bg-[#FEE500] text-[#191919]',
    buttonLabel: '입장',
    fallbackTitle: '카카오톡 오픈채팅방',
  },
  discord: {
    bar: 'bg-[#5865F2]/50 border-0',
    iconBox: 'bg-[#5865F2] text-white',
    title: 'text-zinc-900 dark:text-white',
    button: 'bg-[#5865F2] text-white',
    buttonLabel: '참가',
    fallbackTitle: '디스코드 서버',
  },
}

export const KAKAO_ICON_PATH =
  'M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z'
export const KAKAO_ICON_VIEWBOX = '0 0 24 24'

export const DISCORD_ICON_PATH =
  'M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z'
export const DISCORD_ICON_VIEWBOX = '0 0 127.14 96.36'

export const EMBED_ICON: Record<EmbedType, { path: string; viewBox: string }> = {
  kakaotalk: { path: KAKAO_ICON_PATH, viewBox: KAKAO_ICON_VIEWBOX },
  discord: { path: DISCORD_ICON_PATH, viewBox: DISCORD_ICON_VIEWBOX },
}

/** 게시글 본문(innerHTML)용 임베드 바 HTML. 클릭 처리는 data-embed-url 속성으로 위임 */
export const buildEmbedBarHtml = (type: EmbedType, url: string, displayTitle: string): string => {
  const s = EMBED_STYLES[type]
  const icon = EMBED_ICON[type]
  return `<div class="my-3 px-4 py-3 sm:py-3.5 ${s.bar} rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group" data-embed-url="${escapeHtml(url)}" data-embed-type="${type}">
  <div class="flex items-center gap-3 min-w-0">
    <div class="w-8 h-8 rounded-none ${s.iconBox} flex items-center justify-center shrink-0">
      <svg class="w-4.5 h-4.5 fill-current" viewBox="${icon.viewBox}"><path d="${icon.path}"/></svg>
    </div>
    <span class="text-sm sm:text-base font-extrabold ${s.title} truncate embed-title-text group-hover:underline">${escapeHtml(displayTitle)}</span>
  </div>
  <button type="button" class="px-4 py-1.5 sm:py-2 ${s.button} text-xs sm:text-sm font-black rounded-none shrink-0">${s.buttonLabel}</button>
</div>`
}

/** 유튜브 16:9 플레이어 HTML (게시글 본문용) */
export const buildYoutubeEmbedHtml = (videoId: string): string => `
<div class="my-3 w-full max-w-2xl mx-auto not-prose">
  <div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
    <iframe
      src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=0&rel=0&modestbranding=1"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      loading="lazy"
      allowfullscreen>
    </iframe>
  </div>
</div>`
