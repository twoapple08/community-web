import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  try {
    // 1) 디스코드 링크일 경우 공식 API로 서버 이름(guild.name) 직접 조회
    const discordMatch = url.match(/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9-]+)/i)
    if (discordMatch && discordMatch[1]) {
      const code = discordMatch[1]
      try {
        const dRes = await fetch(`https://discord.com/api/v9/invites/${code}?with_counts=true`, {
          next: { revalidate: 3600 }
        })
        if (dRes.ok) {
          const dData = await dRes.json()
          if (dData?.guild?.name) {
            return NextResponse.json({ title: dData.guild.name })
          }
        }
      } catch {}
    }

    // 2) 카카오톡 오픈채팅 및 일반 웹사이트 OG Title 파싱
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      if (/open\.kakao\.com/i.test(url)) return NextResponse.json({ title: '카카오톡 오픈채팅방' })
      if (/discord/i.test(url)) return NextResponse.json({ title: '디스코드 서버' })
      return NextResponse.json({ title: '' })
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

    if (!title || /^https?:\/\//i.test(title)) {
      if (/open\.kakao\.com/i.test(url)) title = '카카오톡 오픈채팅방'
      else if (/discord/i.test(url)) title = '디스코드 서버'
    }

    return NextResponse.json({ title })
  } catch {
    if (/open\.kakao\.com/i.test(url)) return NextResponse.json({ title: '카카오톡 오픈채팅방' })
    if (/discord/i.test(url)) return NextResponse.json({ title: '디스코드 서버' })
    return NextResponse.json({ title: '' })
  }
}
