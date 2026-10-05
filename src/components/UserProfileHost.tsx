'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import UserProfileModal from './UserProfileModal'
import { PROFILE_QUERY_PARAM, closeUserProfile, syncProfileParamPresence } from '@/lib/userProfile'

/**
 * 주소의 ?profile=유저ID 를 보고 프로필 창을 띄우는 전역 호스트 (AppShell 에서 Suspense 로 감싸 사용)
 * openUserProfile() 의 history.pushState 도 useSearchParams 에 그대로 반영됨
 */
export default function UserProfileHost() {
  const searchParams = useSearchParams()
  const profileId = searchParams.get(PROFILE_QUERY_PARAM)?.trim() || null

  // 뒤로가기 등으로 파라미터가 사라지면 '닫기 = 뒤로가기' 기록을 초기화
  useEffect(() => {
    syncProfileParamPresence(Boolean(profileId))
  }, [profileId])

  if (!profileId) return null

  // 다른 유저로 바뀌면 key 로 창을 새로 만들어 이전 유저 정보가 섞이지 않게 함
  return <UserProfileModal key={profileId} userId={profileId} onClose={closeUserProfile} />
}
