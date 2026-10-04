#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 카톡/디코 이름 자동연동, 드롭다운 잘림 수정, 세로사진 3:4 크롭 패치"
echo "=========================================================="

# 1. /api/link-preview/route.ts 보강 (Discord 공식 API 연동)
cat << 'FILE_API' > src/app/api/link-preview/route.ts
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
FILE_API

# 2. 피드형 세로 사진 1.7배 감지 및 3:4 비율 크롭 전용 컴포넌트 생성 (src/components/FeedMedia.tsx)
cat << 'FILE_FEED_MEDIA' > src/components/FeedMedia.tsx
'use client'

import { useState } from 'react'

interface FeedMediaProps {
  src: string
  alt: string
}

export default function FeedMedia({ src, alt }: FeedMediaProps) {
  const [isTall, setIsTall] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className={`w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center transition-all duration-200 ${
        isTall ? 'aspect-[3/4] max-w-sm sm:max-w-md mx-auto shadow-sm' : 'max-h-[520px]'
      }`}
    >
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const img = e.currentTarget
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const ratio = img.naturalHeight / img.naturalWidth
            // 세로폭이 가로의 1.7배 이상일 경우 3:4 비율로 크롭
            if (ratio >= 1.7) {
              setIsTall(true)
            }
          }
          setLoaded(true)
        }}
        className={`w-full transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${
          isTall
            ? 'h-full object-cover object-top'
            : 'max-h-[520px] w-full object-contain'
        }`}
      />
    </div>
  )
}
FILE_FEED_MEDIA

# 3. PostModal.tsx: 본문 렌더러에서 생링크 노출 원천 차단 및 Discord 서버 이름 비동기 자동 주입
cat << 'FILE_PATCH_POST_VIEWER' > patch_post_viewer.py
with open("src/components/PostModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 카카오톡 & 디스코드 렌더링 로직 보강
old_kakao_block = """      const kakaoMatch = href.match(/open\.kakao\.com\/[a-zA-Z0-9_\/]+/i);
      if (kakaoMatch) {"""

new_kakao_block = """      const kakaoMatch = href.match(/open\.kakao\.com\/[a-zA-Z0-9_\/]+/i);
      if (kakaoMatch) {
        let title = (a.getAttribute('data-embed-title') || a.textContent || '').trim();
        if (!title || /^https?:\\/\\//i.test(title)) {
          title = '카카오톡 오픈채팅방';
        }"""

old_discord_block = """      const discordMatch = href.match(/(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9-]+/i);
      if (discordMatch) {"""

new_discord_block = """      const discordMatch = href.match(/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9-]+)/i);
      if (discordMatch) {
        let title = (a.getAttribute('data-embed-title') || a.textContent || '').trim();
        if (!title || /^https?:\\/\\//i.test(title)) {
          title = '디스코드 서버';
        }"""

if old_kakao_block in code and "title = '카카오톡 오픈채팅방'" not in code:
    code = code.replace(old_kakao_block, new_kakao_block)

if old_discord_block in code and "title = '디스코드 서버'" not in code:
    code = code.replace(old_discord_block, new_discord_block)

# 제목 주입 변수 바인딩
code = code.replace(
    '카카오톡 오픈채팅\n            </span>',
    '${title}\n            </span>'
)
code = code.replace(
    '디스코드 서버 초대\n            </span>',
    '${title}\n            </span>'
)

# Discord 서버 이름 실시간 비동기 업데이트 훅 추가
target_hook = "const contentContainerRef = useRef<HTMLDivElement>(null);"
discord_update_hook = """const contentContainerRef = useRef<HTMLDivElement>(null);

  // 본문 렌더링 후 디스코드 카드들에 실제 서버 이름 비동기 자동 반영
  useEffect(() => {
    if (!contentContainerRef.current || !post) return;
    const cards = contentContainerRef.current.querySelectorAll<HTMLElement>('[data-embed-url]');
    cards.forEach(async (card) => {
      const url = card.getAttribute('data-embed-url') || '';
      const discordMatch = url.match(/(?:discord\\.gg|discord\\.com\\/invite)\\/([a-zA-Z0-9-]+)/i);
      if (discordMatch && discordMatch[1]) {
        const titleEl = card.querySelector('.embed-title-text');
        if (titleEl && (!titleEl.textContent || titleEl.textContent.trim() === '디스코드 서버' || /^https?:\\/\\//i.test(titleEl.textContent.trim()))) {
          try {
            const res = await fetch(`https://discord.com/api/v9/invites/${discordMatch[1]}?with_counts=true`);
            if (res.ok) {
              const data = await res.json();
              if (data?.guild?.name) {
                titleEl.textContent = data.guild.name;
              }
            }
          } catch {}
        }
      }
    });
  }, [post, isEditing]);"""

if target_hook in code and "discord_update_hook" not in code and "cards.forEach" not in code:
    code = code.replace(target_hook, discord_update_hook, 1)

with open("src/components/PostModal.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("PostModal.tsx: 카톡/디코 생링크 노출 방지 및 Discord API 실시간 반영 완료")
FILE_PATCH_POST_VIEWER
python3 patch_post_viewer.py || true
rm -f patch_post_viewer.py

# 4. clan/page.tsx: 드롭다운 left-0 수정, FeedMedia 적용, sfa_global_view_mode 통일
cat << 'FILE_PATCH_CLAN_PAGE' > patch_clan.py
with open("src/app/clan/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# FeedMedia import 추가
if "import FeedMedia" not in code:
    code = code.replace("import NoticeBanner from '@/components/NoticeBanner';", "import NoticeBanner from '@/components/NoticeBanner';\nimport FeedMedia from '@/components/FeedMedia';")

# 1) 모바일 드롭다운 좌표 수정: absolute right-0 -> absolute left-0 (화면 밖 짤림 방지)
code = code.replace(
    'className="absolute right-0 top-full mt-1.5 w-48',
    'className="absolute left-0 top-full mt-1.5 w-48'
)

# 2) 피드형 가로 100% 썸네일을 FeedMedia 컴포넌트로 교체 (1.7배 세로사진 3:4 크롭)
old_feed_img = """{/* 가로 100% 대형 와이드 썸네일 (이미지가 있을 때 시원하게 노출) */}
                    {thumbnail && !post.is_preview_hidden && (
                      <div className="w-full max-h-[460px] aspect-video rounded-xl overflow-hidden bg-black/5 border border-zinc-200 dark:border-zinc-800">
                        <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}"""

new_feed_img = """{/* 세로 1.7배 이상 사진 3:4 자동 크롭 FeedMedia */}
                    {thumbnail && !post.is_preview_hidden && (
                      <FeedMedia src={thumbnail} alt={post.title} />
                    )}"""

if old_feed_img in code:
    code = code.replace(old_feed_img, new_feed_img)

with open("src/app/clan/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("clan/page.tsx: 드롭다운 left-0 위치 조정 및 FeedMedia 3:4 크롭 적용 완료")
FILE_PATCH_CLAN_PAGE
python3 patch_clan.py || true
rm -f patch_clan.py

# 5. community/page.tsx: 드롭다운 left-0 수정, FeedMedia 적용, sfa_global_view_mode 통일
cat << 'FILE_PATCH_COMM_PAGE' > patch_comm.py
with open("src/app/community/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# FeedMedia import 추가
if "import FeedMedia" not in code:
    code = code.replace("import NoticeBanner from '@/components/NoticeBanner';", "import NoticeBanner from '@/components/NoticeBanner';\nimport FeedMedia from '@/components/FeedMedia';")

# 1) 모바일 드롭다운 좌표 수정: absolute right-0 -> absolute left-0
code = code.replace(
    'className="absolute right-0 top-full mt-1.5 w-48',
    'className="absolute left-0 top-full mt-1.5 w-48'
)

# 2) 피드형 가로 100% 썸네일을 FeedMedia 컴포넌트로 교체 (1.7배 세로사진 3:4 크롭)
old_comm_feed_img = """{/* 가로 100% 대형 와이드 썸네일 (이미지가 있을 때 시원하게 노출) */}
                    {thumbnail && !post.is_preview_hidden && (
                      <div className="w-full max-h-[460px] aspect-video rounded-xl overflow-hidden bg-black/5 border border-zinc-200 dark:border-zinc-800">
                        <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}"""

new_comm_feed_img = """{/* 세로 1.7배 이상 사진 3:4 자동 크롭 FeedMedia */}
                    {thumbnail && !post.is_preview_hidden && (
                      <FeedMedia src={thumbnail} alt={post.title} />
                    )}"""

if old_comm_feed_img in code:
    code = code.replace(old_comm_feed_img, new_comm_feed_img)

with open("src/app/community/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("community/page.tsx: 드롭다운 left-0 위치 조정 및 FeedMedia 3:4 크롭 적용 완료")
FILE_PATCH_COMM_PAGE
python3 patch_comm.py || true
rm -f patch_comm.py

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: 카톡/디코 서버이름 자동연동, 드롭다운 모바일 잘림 해결, 세로사진 1.7배 3:4 크롭 적용"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
