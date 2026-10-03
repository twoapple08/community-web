import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL 파라미터가 누락되었습니다.' }, { status: 400 });
  }

  try {
    // 1. 디스코드 초대 링크 파싱 (공식 공개 엔드포인트 호출)
    const discordMatch = targetUrl.match(/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9-]+)/i);
    if (discordMatch) {
      const inviteCode = discordMatch[1];
      try {
        const res = await fetch(`https://discord.com/api/v10/invites/${inviteCode}`, {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 3600 }
        });
        if (res.ok) {
          const data = await res.json();
          const serverName = data.guild?.name || '디스코드 서버';
          return NextResponse.json({
            success: true,
            type: 'discord',
            title: serverName,
          });
        }
      } catch (err) {
        console.error('Discord metadata fetch error:', err);
      }
      return NextResponse.json({
        success: true,
        type: 'discord',
        title: '디스코드 서버 초대',
      });
    }

    // 2. 카카오톡 오픈채팅방 링크 파싱 (서버 사이드 HTML 메타 태그 스크래핑)
    const kakaoMatch = targetUrl.match(/open\.kakao\.com\/[a-zA-Z0-9_\/]+/i);
    if (kakaoMatch) {
      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          next: { revalidate: 3600 }
        });

        if (res.ok) {
          const html = await res.text();
          const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

          let roomName = ogTitleMatch ? ogTitleMatch[1] : titleMatch ? titleMatch[1] : null;
          if (roomName) {
            roomName = roomName.replace(/카카오톡\s*오픈채팅/gi, '').replace(/[|:\-_]/g, '').trim();
            if (!roomName) roomName = '카카오톡 오픈채팅방';
            return NextResponse.json({
              success: true,
              type: 'kakaotalk',
              title: roomName,
            });
          }
        }
      } catch (err) {
        console.error('Kakao metadata fetch error:', err);
      }
      return NextResponse.json({
        success: true,
        type: 'kakaotalk',
        title: '카카오톡 오픈채팅방',
      });
    }

    return NextResponse.json({ error: '지원되지 않는 임베드 URL입니다.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
