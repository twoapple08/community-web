import { NextRequest, NextResponse } from 'next/server'

// 같은 링크의 제목은 Vercel 엣지 캐시에 하루 보관 → 서버 함수 호출/외부 요청 횟수 대폭 절감
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
}
const ERROR_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=600',
}

const FETCH_TIMEOUT_MS = 5000
const MAX_HTML_BYTES = 512 * 1024

const json = (body: Record<string, unknown>, init?: { status?: number; headers?: Record<string, string> }) =>
  NextResponse.json(body, { status: init?.status, headers: init?.headers ?? CACHE_HEADERS })

// [보안] 서버가 내부망/로컬 주소로 요청을 보내도록 악용되는 것(SSRF)을 차단
const isBlockedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true
  }
  if (/^\d+$/.test(host)) return true // 10진수 IP 표기
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
    return false
  }
  if (host.includes(':')) {
    // IPv6 리터럴: 루프백/링크로컬/사설 대역 차단
    if (host === '::1' || host === '::' || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('::ffff:')) {
      return true
    }
  }
  return false
}

const readLimitedText = async (res: Response): Promise<string> => {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let received = 0
  let html = ''
  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) break
    received += value.byteLength
    html += decoder.decode(value, { stream: true })
    // 제목 정보는 <head> 안에 있으므로 </head> 를 만나면 더 받지 않음
    if (/<\/head>/i.test(html)) break
  }
  try {
    await reader.cancel()
  } catch {}
  return html
}

const decodeTitle = (title: string) =>
  title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .trim()
    .slice(0, 200)

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return json({ error: 'URL required' }, { status: 400, headers: ERROR_CACHE_HEADERS })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return json({ title: '' }, { status: 400, headers: ERROR_CACHE_HEADERS })
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password || isBlockedHost(parsed.hostname)) {
    return json({ title: '' }, { status: 400, headers: ERROR_CACHE_HEADERS })
  }

  const isKakao = /(^|\.)open\.kakao\.com$/i.test(parsed.hostname)

  try {
    // 1) 디스코드 링크 -> Discord 공식 초대 API 조회
    const isDiscordHost = /(^|\.)(discord\.gg|discord\.com)$/i.test(parsed.hostname)
    const discordMatch = isDiscordHost ? url.match(/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9-]+)/i) : null
    if (discordMatch && discordMatch[1]) {
      const code = discordMatch[1].split('?')[0].split('#')[0]
      try {
        const dRes = await fetch(`https://discord.com/api/v9/invites/${encodeURIComponent(code)}?with_counts=true`, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (dRes.ok) {
          const dData = await dRes.json()
          if (dData?.guild?.name) {
            return json({ title: String(dData.guild.name).trim() })
          }
        }
      } catch {}
      return json({ title: '디스코드 서버' }, { headers: ERROR_CACHE_HEADERS })
    }

    // 2) 카카오톡 오픈채팅 및 일반 웹사이트
    const userAgent = isKakao
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 9.9.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const res = await fetch(parsed.toString(), {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    // 리다이렉트 끝 주소도 내부망이면 차단
    try {
      if (res.url && isBlockedHost(new URL(res.url).hostname)) {
        return json({ title: '' }, { headers: ERROR_CACHE_HEADERS })
      }
    } catch {}

    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || (contentType && !/html|xml/i.test(contentType))) {
      return json({ title: isKakao ? '카카오톡 오픈채팅방' : '' }, { headers: ERROR_CACHE_HEADERS })
    }

    const html = await readLimitedText(res)
    let title = ''

    const ogTitleMatch = html.match(/<meta[^>]+property=['"]og:title['"][^>]+content=['"]([^'"]+)['"]/i)
      || html.match(/<meta[^>]+content=['"]([^'"]+)['"][^>]+property=['"]og:title['"]/i)

    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].trim()
    } else {
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1].trim()
      }
    }

    title = decodeTitle(title)

    if (!title || /^https?:\/\//i.test(title)) {
      title = isKakao ? '카카오톡 오픈채팅방' : ''
    }

    return json({ title })
  } catch {
    return json({ title: isKakao ? '카카오톡 오픈채팅방' : '' }, { headers: ERROR_CACHE_HEADERS })
  }
}
