'use client'

import { useParams, useRouter } from 'next/navigation'
import CommunityFeedPage from '../page'
import PostModal from '@/components/PostModal'

export default function CommunityPostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  return (
    <>
      <CommunityFeedPage />
      {id && (
        <PostModal
          postId={id}
          onClose={() => router.push('/community')}
        />
      )}
    </>
  )
}
