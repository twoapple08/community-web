'use client'

import { useParams, useRouter } from 'next/navigation'
import ClanFeedPage from '../page'
import PostModal from '@/components/PostModal'

export default function ClanPostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  return (
    <>
      <ClanFeedPage />
      {id && (
        <PostModal
          postId={id}
          onClose={() => router.push('/clan')}
        />
      )}
    </>
  )
}
