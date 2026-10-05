'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PostModal from '@/components/PostModal'
import { consumeOpenedFromFeed } from '@/lib/feedStore'

export default function ClanPostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  // 목록에서 열었으면 닫을 때 뒤로가기(히스토리 정리), 공유 링크로 들어왔으면 목록으로 교체 이동
  const [openedFromFeed] = useState(() => consumeOpenedFromFeed())

  if (!id) return null

  return (
    <PostModal
      key={id}
      postId={id}
      feedType="clan"
      onClose={() => {
        if (openedFromFeed) router.back()
        else router.replace('/clan')
      }}
    />
  )
}
