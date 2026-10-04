#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 전역 실시간 '답장' 팝업 시스템 구축 시작"
echo "=========================================================="

# 1. 전역 실시간 답장 감지 및 팝업 컴포넌트 생성 (src/components/AdminReplyPopup.tsx)
cat << 'FILE_ADMIN_REPLY_POPUP' > src/components/AdminReplyPopup.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'

interface ReplyAppeal {
  id: number
  admin_reply: string
  status: string
}

export default function AdminReplyPopup() {
  const [mounted, setMounted] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [replyData, setReplyData] = useState<ReplyAppeal | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 로그인 유저 세션 획득 및 초기 미확인 답장 조회
  useEffect(() => {
    const checkUserAndReplies = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      setCurrentUserId(uid)

      if (uid) {
        fetchUnnotifiedReply(uid)
      }
    }

    checkUserAndReplies()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null
      setCurrentUserId(uid)
      if (uid) {
        fetchUnnotifiedReply(uid)
      } else {
        setReplyData(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUnnotifiedReply = async (uid: string) => {
    const { data } = await supabase
      .from('blacklist_appeals')
      .select('id, admin_reply, status')
      .eq('user_id', uid)
      .eq('user_notified', false)
      .not('admin_reply', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.admin_reply) {
      setReplyData(data as ReplyAppeal)
    }
  }

  // 접속 상태에서 관리자가 답장을 작성하면 즉시 화면에 띄우는 실시간 구독 + 보조 폴링
  useEffect(() => {
    if (!currentUserId) return

    // 1) Supabase Realtime 채널 구독
    const channel = supabase
      .channel(`realtime-appeals-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blacklist_appeals',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          fetchUnnotifiedReply(currentUserId)
        }
      )
      .subscribe()

    // 2) 7초 보조 폴링 (웹소켓 절체 대비)
    const interval = setInterval(() => {
      fetchUnnotifiedReply(currentUserId)
    }, 7000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUserId])

  // 확인 버튼 클릭 시 읽음 처리 및 닫기
  const handleConfirm = async () => {
    if (!replyData) return
    await supabase
      .from('blacklist_appeals')
      .update({ user_notified: true })
      .eq('id', replyData.id)

    setReplyData(null)
  }

  if (!mounted || !replyData) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
      onClick={handleConfirm}
    >
      <div
        className="w-full max-w-sm !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-black text-white border-b border-zinc-800 pb-2.5">
          답장
        </h3>

        <div className="p-3.5 !bg-zinc-950 !border !border-zinc-800 text-xs text-zinc-200 text-left whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">
          {replyData.admin_reply}
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2 text-xs font-black rounded-none bg-white text-black hover:bg-zinc-200 transition cursor-pointer shadow-md"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
FILE_ADMIN_REPLY_POPUP

# 2. UserHubModal.tsx 수정: 유지든 해제든 무조건 user_notified: false 로 저장
python3 - << 'PY_HUB'
with open("src/components/UserHubModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# unban 시 user_notified: true 로 되어 있던 부분을 false 로 수정
old_unban = "user_notified: true"
new_unban = "user_notified: false"

if old_unban in code:
    code = code.replace(old_unban, new_unban, 1)
    with open("src/components/UserHubModal.tsx", "w", encoding="utf-8") as f:
        f.write(code)
    print("UserHubModal.tsx: unban user_notified patched to false")
PY_HUB

# 3. layout.tsx 에 전역 AdminReplyPopup 컴포넌트 마운트
python3 - << 'PY_LAYOUT'
with open("src/app/layout.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# import 추가
if "import AdminReplyPopup" not in code:
    code = code.replace('import TermsModal from "@/components/TermsModal";', 'import TermsModal from "@/components/TermsModal";\nimport AdminReplyPopup from "@/components/AdminReplyPopup";')

# JSX에 렌더링 추가
if "<AdminReplyPopup />" not in code:
    code = code.replace('{children}</main>', '{children}</main>\n        <AdminReplyPopup />')

with open("src/app/layout.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("layout.tsx: AdminReplyPopup registered globally")
PY_LAYOUT

# 4. write/page.tsx 내의 중복 로컬 팝업 로직 정리
python3 - << 'PY_WRITE'
with open("src/app/write/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# write/page.tsx 안에 남아있던 adminReplyNotice 블록이 전역과 중복 실행되지 않도록 정리
import re
code = re.sub(r'\{\s*/\*\s*관리자 답장 수신 팝업.*?\*/\s*\}\s*\{adminReplyNotice && \(.*?\)\}', '', code, flags=re.DOTALL)

with open("src/app/write/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("write/page.tsx: local duplicate popup cleaned")
PY_WRITE

echo "--> 소스코드 갱신 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! 실서버(Vercel) 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "feat: 유저 접속 상태 시 실시간 '답장' 전역 팝업 즉시 노출 구현"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 기능이 성공적으로 반영되었습니다!"
echo "=========================================================="
