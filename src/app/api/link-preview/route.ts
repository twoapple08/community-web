import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  try {
    // 1) 디스코드 링크 -> Discord 공식 초대 API 조회
    const discordMatch = url.match(/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9-]+)/i)
    if (discordMatch && discordMatch[1]) {
      const code = discordMatch[1].split('?')[0].split('#')[0]
      try {
        const dRes = await fetch(`https://discord.com/api/v9/invites/${code}?with_counts=true`, {
          next: { revalidate: 3600 }
        })
        if (dRes.ok) {
          const dData = await dRes.json()
          if (dData?.guild?.name) {
            return NextResponse.json({ title: dData.guild.name.trim() })
          }
        }
      } catch {}
      return NextResponse.json({ title: '디스코드 서버' })
    }

    // 2) 카카오톡 오픈채팅 및 일반 웹사이트
    const isKakao = /open\.kakao\.com/i.test(url)
    const userAgent = isKakao
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 9.9.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({ title: isKakao ? '카카오톡 오픈채팅방' : '' })
    }

    const html = await res.text()
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

    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()

    if (!title || /^https?:\/\//i.test(title)) {
      title = isKakao ? '카카오톡 오픈채팅방' : ''
    }

    return NextResponse.json({ title })
  } catch {
    const isKakao = /open\.kakao\.com/i.test(url)
    return NextResponse.json({ title: isKakao ? '카카오톡 오픈채팅방' : '' })
  }
}
