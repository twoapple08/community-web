import type { Viewport } from 'next'
import type { ReactNode } from 'react'
import AppShell from '@/components/AppShell'
import './globals.css'

// 첫 화면이 그려지기 전에 저장된 테마를 적용 (라이트 모드 사용자가 접속할 때 검은 화면이 번쩍이던 문제 해결)
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;if(t==='light'){c.remove('dark')}else{c.add('dark')}}catch(e){}})();`

const SITE_TITLE = '스틱파이터 커뮤니티'
const SITE_DESCRIPTION = '유저들과 소통하고 클랜을 홍보하세요'

// 뷰포트 태그는 Next.js 가 이 설정으로 1개만 출력
// (예전에는 직접 쓴 태그 + Next.js 기본 태그가 함께 들어가 2개가 되면서 첫 화면 확대 배율이 어긋나던 문제)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

// 서버 컴포넌트: 문서 뼈대(html/head/body)만 담당. 헤더·알림·전역 모달 등 화면 로직은 AppShell(클라이언트)
export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <link rel="icon" href="/icon.png?v=3" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png?v=3" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_TITLE} />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:image" content="https://www.sfaclan.com/icon.png?v=3" />
        <meta property="og:url" content="https://www.sfaclan.com/" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
      </head>
      <body className="min-h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-300 overflow-x-hidden flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
