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

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      setCurrentUserId(uid)
      if (uid) fetchUnnotifiedReply(uid)
    }

    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null
      setCurrentUserId(uid)
      if (uid) fetchUnnotifiedReply(uid)
      else setReplyData(null)
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

  // 접속 중일 때 실시간으로 답장 감지
  // (예전: 로그인한 모든 유저가 5초마다 서버 조회 → 트래픽 낭비. 지금: 실시간 수신 + 대기 중 이의제기가 있을 때만 60초 확인)
  useEffect(() => {
    if (!currentUserId) return

    let disposed = false
    let realtimeActive = false
    let hasPendingAppeal = false

    const checkPendingAppeal = async () => {
      const { count } = await supabase
        .from('blacklist_appeals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUserId)
        .eq('status', 'pending')
      if (!disposed) hasPendingAppeal = (count || 0) > 0
    }
    checkPendingAppeal()

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
          checkPendingAppeal()
        }
      )
      .subscribe((status) => {
        realtimeActive = String(status) === 'SUBSCRIBED'
      })

    const interval = setInterval(() => {
      if (!realtimeActive && hasPendingAppeal && document.visibilityState === 'visible') {
        fetchUnnotifiedReply(currentUserId)
      }
    }, 60000)

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchUnnotifiedReply(currentUserId)
        checkPendingAppeal()
      }
    }
    document.addEventListener('visibilitychange', handleVisible)

    return () => {
      disposed = true
      supabase.removeChannel(channel)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [currentUserId])

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
