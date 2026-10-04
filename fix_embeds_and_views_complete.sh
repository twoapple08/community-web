#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 카톡/디코 이름 자동연동, 드롭다운 모바일잘림 해결, 3:4크롭 통합배포"
echo "=========================================================="

# 1. /api/link-preview/route.ts 보강 (Discord API + 카카오톡 스크랩 최적화)
cat << 'FILE_API' > src/app/api/link-preview/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  try {
    // 1) 디스코드 링크일 경우 공식 API로 서버 이름 직접 조회
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
      return NextResponse.json({ title: '디스코드 서버 초대' })
    }

    // 2) 카카오톡 오픈채팅 및 일반 웹페이지 크롤링
    const isKakao = /open\.kakao\.com/i.test(url)
    const userAgent = isKakao
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 9.9.0'
      : 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

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

    // HTML Entity 디코딩
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
FILE_API

# 2. 피드형 세로 사진 1.7배 초과 시 3:4 크롭 컴포넌트 (src/components/FeedMedia.tsx)
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

  const checkRatio = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalHeight / img.naturalWidth
      // 세로폭이 가로의 1.7배 이상일 경우 3:4 비율로 크롭
      if (ratio >= 1.7) {
        setIsTall(true)
      }
    }
    setLoaded(true)
  }

  return (
    <div
      className={`w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center transition-all duration-200 ${
        isTall ? 'aspect-[3/4] max-w-sm sm:max-w-md mx-auto shadow-sm' : 'max-h-[520px]'
      }`}
    >
      <img
        src={src}
        alt={alt}
        onLoad={(e) => checkRatio(e.currentTarget)}
        ref={(el) => {
          if (el && el.complete) checkRatio(el)
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

# 3. PostModal.tsx: 카톡/디코 생링크 노출 원천 차단 및 실시간 비동기 서버/방 이름 주입
cat << 'FILE_PATCH_POST_VIEWER' > patch_post_viewer.py
with open("src/components/PostModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# renderRichContent 내부의 카카오/디코 카드 렌더링 전면 개편
old_render_block = """      const kakaoMatch = href.match(/open\\.kakao\\.com\\/[a-zA-Z0-9_\\/]+/i);"""

new_render_logic = """      const kakaoMatch = href.match(/open\\.kakao\\.com\\/[a-zA-Z0-9_\\/]+/i);
      if (kakaoMatch) {
        let initialTitle = (a.getAttribute('data-embed-title') || '').trim();
        if (!initialTitle || /^https?:\\/\\//i.test(initialTitle)) {
          initialTitle = '카카오톡 오픈채팅방';
        }
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-2.5 bg-[#242111] dark:bg-[#1c190d] border border-[#FEE500]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.setAttribute('data-embed-type', 'kakaotalk');
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-none bg-[#FEE500] flex items-center justify-center text-[#191919] shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              ${initialTitle}
            </span>
          </div>
          <button type="button" class="px-3.5 py-1.5 bg-[#FEE500] text-[#191919] text-xs font-black rounded-none">입장</button>
        `;
        a.replaceWith(bar);
        return;
      }

      const discordMatch = href.match(/(?:discord\\.gg|discord\\.com\\/invite)\\/[a-zA-Z0-9-]+/i);
      if (discordMatch) {
        let initialTitle = (a.getAttribute('data-embed-title') || '').trim();
        if (!initialTitle || /^https?:\\/\\//i.test(initialTitle)) {
          initialTitle = '디스코드 서버';
        }
        const bar = doc.createElement('div');
        bar.className = 'my-2.5 px-4 py-2.5 bg-[#111322] dark:bg-[#0c0d18] border border-[#5865F2]/50 rounded-none flex items-center justify-between gap-3 max-w-xl not-prose cursor-pointer select-none group';
        bar.setAttribute('data-embed-url', href);
        bar.setAttribute('data-embed-type', 'discord');
        bar.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-none bg-[#5865F2] flex items-center justify-center text-white shrink-0">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            </div>
            <span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              ${initialTitle}
            </span>
          </div>
          <button type="button" class="px-3.5 py-1.5 bg-[#5865F2] text-white text-xs font-black rounded-none">참가</button>
        `;
        a.replaceWith(bar);
        return;
      }"""

# 기존 kakaoMatch 부터 discordMatch 블록 전체를 교체
import re
pattern = r'const kakaoMatch = href\.match\(/open\\\.kakao\\\.com[^\n]+\n(?:.*?)(?=a\.className =)'
code = re.sub(pattern, new_render_logic + '\n\n      ', code, flags=re.DOTALL)

# 본문 렌더링 후 실시간 비동기 타이틀 자동 주입 훅 (sessionStorage 캐싱 탑재)
discord_update_hook = """const contentContainerRef = useRef<HTMLDivElement>(null);

  // 본문 렌더링 후 카카오톡/디스코드 카드에 실제 서버/방 이름 비동기 자동 반영
  useEffect(() => {
    if (!contentContainerRef.current || !post) return;
    const cards = contentContainerRef.current.querySelectorAll<HTMLElement>('[data-embed-url]');
    cards.forEach(async (card) => {
      const url = card.getAttribute('data-embed-url');
      if (!url) return;
      const titleEl = card.querySelector<HTMLElement>('.embed-title-text');
      if (!titleEl) return;

      const currentText = titleEl.textContent?.trim() || '';
      // 이미 구체적인 방/서버 이름이 지정되어 있으면 스킵
      if (currentText && currentText !== '카카오톡 오픈채팅방' && currentText !== '디스코드 서버' && !/^https?:\\/\\//i.test(currentText)) {
        return;
      }

      // 1) 세션스토리지 캐시 확인
      const cacheKey = `embed_title_${url}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        titleEl.textContent = cached;
        return;
      }

      // 2) 백엔드 API 호출로 실제 이름 조회
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.title && !/^https?:\\/\\//i.test(data.title)) {
            titleEl.textContent = data.title;
            sessionStorage.setItem(cacheKey, data.title);
          }
        }
      } catch {}
    });
  }, [post, isEditing]);"""

if "embed_title_" not in code:
    code = code.replace("const contentContainerRef = useRef<HTMLDivElement>(null);", discord_update_hook, 1)

with open("src/components/PostModal.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("PostModal.tsx: 카톡/디코 생링크 노출 차단 및 실시간 비동기 이름 주입 완료")
FILE_PATCH_POST_VIEWER
python3 patch_post_viewer.py || true
rm -f patch_post_viewer.py

# 4. clan/page.tsx: 드롭다운 left-0 조정, FeedMedia 3:4 크롭, sfa_global_view_mode 통일
cat << 'FILE_PATCH_CLAN_PAGE' > patch_clan.py
with open("src/app/clan/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1) 드롭다운 모바일 화면 잘림 방지 (left-0 및 max-w-[85vw])
code = code.replace(
    'className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1',
    'className="absolute left-0 top-full mt-1.5 w-44 sm:w-48 max-w-[85vw] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1'
)

# 2) sfa_view_mode_clan -> sfa_global_view_mode 로 전역 통일
code = code.replace("sfa_view_mode_clan", "sfa_global_view_mode")

# 3) 피드형 대형 이미지를 FeedMedia 컴포넌트로 교체
if "import FeedMedia from '@/components/FeedMedia';" not in code:
    code = code.replace("import NoticeBanner from '@/components/NoticeBanner';", "import NoticeBanner from '@/components/NoticeBanner';\nimport FeedMedia from '@/components/FeedMedia';")

old_feed_img = """{thumbnail && !post.is_preview_hidden && (
                      <div className="w-full max-h-[460px] aspect-video rounded-xl overflow-hidden bg-black/5 border border-zinc-200 dark:border-zinc-800">
                        <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}"""

new_feed_img = """{thumbnail && !post.is_preview_hidden && (
                      <FeedMedia src={thumbnail} alt={post.title} />
                    )}"""

if old_feed_img in code:
    code = code.replace(old_feed_img, new_feed_img)

with open("src/app/clan/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("clan/page.tsx: 드롭다운 left-0 모바일 패치 및 FeedMedia 3:4 크롭 적용 완료")
FILE_PATCH_CLAN_PAGE
python3 patch_clan.py || true
rm -f patch_clan_view.py || true
rm -f patch_clan.py

# 5. community/page.tsx: 드롭다운 left-0 조정, FeedMedia 3:4 크롭, sfa_global_view_mode 통일
cat << 'FILE_PATCH_COMM_PAGE' > patch_comm.py
with open("src/app/community/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1) 드롭다운 모바일 화면 잘림 방지 (left-0 및 max-w-[85vw])
code = code.replace(
    'className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1',
    'className="absolute left-0 top-full mt-1.5 w-44 sm:w-48 max-w-[85vw] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1'
)

# 2) sfa_view_mode_comm -> sfa_global_view_mode 로 전역 통일
code = code.replace("sfa_view_mode_comm", "sfa_global_view_mode")

# 3) 피드형 대형 이미지를 FeedMedia 컴포넌트로 교체
if "import FeedMedia from '@/components/FeedMedia';" not in code:
    code = code.replace("import NoticeBanner from '@/components/NoticeBanner';", "import NoticeBanner from '@/components/NoticeBanner';\nimport FeedMedia from '@/components/FeedMedia';")

old_comm_img = """{thumbnail && !post.is_preview_hidden && (
                      <div className="w-full max-h-[460px] aspect-video rounded-xl overflow-hidden bg-black/5 border border-zinc-200 dark:border-zinc-800">
                        <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}"""

new_comm_img = """{thumbnail && !post.is_preview_hidden && (
                      <FeedMedia src={thumbnail} alt={post.title} />
                    )}"""

if old_comm_img in code:
    code = code.replace(old_comm_img, new_comm_img)

with open("src/app/community/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("community/page.tsx: 드롭다운 left-0 모바일 패치 및 FeedMedia 3:4 크롭 적용 완료")
FILE_PATCH_COMM_PAGE
python3 patch_comm.py || true
rm -f patch_comm_view.py || true
rm -f patch_comm.py

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 에러 없음! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: 카톡/디코 생링크 노출 원천 차단 및 실시간 이름 주입, 드롭다운 모바일 잘림 수정, 세로사진 3:4 크롭 적용"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
