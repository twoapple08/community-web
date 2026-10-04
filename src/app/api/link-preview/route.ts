import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
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

    return NextResponse.json({ title })
  } catch {
    return NextResponse.json({ title: '' })
  }
}
