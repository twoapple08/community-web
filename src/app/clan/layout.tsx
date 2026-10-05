'use client'

import ClanFeed from '@/components/ClanFeed'

// 피드 목록을 레이아웃에 두어 게시글(/clan/번호)을 열고 닫아도
// 목록이 다시 마운트/재조회되지 않습니다. (스크롤·페이지·검색 상태 유지 + 트래픽 절감)
export default function ClanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClanFeed />
      {children}
    </>
  )
}
