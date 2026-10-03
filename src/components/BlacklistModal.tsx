'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Search, UserMinus, ShieldAlert, Check } from 'lucide-react'

interface BlacklistUser {
  user_id: string
  nickname: string
  email: string
  reason: string
  created_at: string
}

interface ProfileUser {
  id: string
  nickname: string
  email?: string
}

interface BlacklistModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function BlacklistModal({ isOpen, onClose }: BlacklistModalProps) {
  const [blacklist, setBlacklist] = useState<BlacklistUser[]>([])
  const [profiles, setProfiles] = useState<ProfileUser[]>([])
  const [searchNickname, setSearchNickname] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [reason, setReason] = useState('관리자 수동 지정 제재')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    setFetching(true)
    const { data: bData } = await supabase
      .from('blacklists')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: pData } = await supabase
      .from('profiles')
      .select('id, nickname, email')

    if (bData) setBlacklist(bData as BlacklistUser[])
    if (pData) setProfiles(pData as ProfileUser[])
    setFetching(false)
  }

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) {
      alert('블랙리스트로 지정할 유저를 선택해 주십시오.')
      return
    }

    setLoading(true)
    const targetUser = profiles.find((p) => p.id === selectedUserId)
    if (!targetUser) {
      alert('유저 정보를 찾을 수 없습니다.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('blacklists').upsert({
      user_id: selectedUserId,
      nickname: targetUser.nickname,
      email: targetUser.email || `${targetUser.nickname}@community.local`,
      reason: reason.trim() || '관리자 수동 지정 제재',
    })

    if (error) {
      alert(`블랙리스트 등록 실패: ${error.message}`)
    } else {
      setSelectedUserId('')
      setSearchNickname('')
      await loadData()
    }
    setLoading(false)
  }

  const handleRemoveBlacklist = async (userId: string) => {
    if (!window.confirm('해당 유저를 블랙리스트에서 해제하시겠습니까?')) return
    const { error } = await supabase.from('blacklists').delete().eq('user_id', userId)
    if (error) {
      alert(`해제 실패: ${error.message}`)
    } else {
      await loadData()
    }
  }

  if (!isOpen) return null

  const filteredProfiles = profiles.filter((p) =>
    p.nickname.toLowerCase().includes(searchNickname.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg !bg-black !text-white !border-2 !border-white rounded-none shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between !border-b !border-white pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-white" />
            <h2 className="text-base font-black tracking-wide">블랙리스트 관리</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-white hover:bg-zinc-900 rounded-none transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAddBlacklist} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-white mb-1">
              제재할 유저 검색 및 선택
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchNickname}
                onChange={(e) => setSearchNickname(e.target.value)}
                placeholder="유저 닉네임을 입력하세요"
                className="w-full pl-9 pr-3 py-2 text-xs !bg-zinc-950 !border !border-zinc-700 !text-white rounded-none focus:outline-none focus:!border-white"
              />
            </div>

            <div className="max-h-28 overflow-y-auto !border !border-zinc-800 !bg-zinc-950 divide-y divide-zinc-900">
              {filteredProfiles.length === 0 ? (
                <div className="p-3 text-center text-xs text-zinc-500">일치하는 유저가 없습니다.</div>
              ) : (
                filteredProfiles.map((p) => {
                  const isSelected = selectedUserId === p.id
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedUserId(p.id)}
                      className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition ${
                        isSelected
                          ? '!bg-white !text-black font-bold'
                          : 'hover:!bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      <span>{p.nickname}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-black" />}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-white mb-1">
              제재 사유
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 입력하세요"
              className="w-full px-3 py-1.5 text-xs !bg-zinc-950 !border !border-zinc-700 !text-white rounded-none focus:outline-none focus:!border-white"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading || !selectedUserId}
              className="px-4 py-2 text-xs font-bold !bg-white !text-black hover:!bg-zinc-200 transition disabled:opacity-40"
            >
              {loading ? '처리 중...' : '블랙리스트 추가'}
            </button>
          </div>
        </form>

        <div className="pt-2 !border-t !border-zinc-800">
          <h3 className="text-xs font-bold text-white mb-2">
            현재 블랙리스트 등록 유저 ({blacklist.length}명)
          </h3>
          {fetching ? (
            <div className="py-4 text-center text-xs text-zinc-500">목록을 불러오는 중...</div>
          ) : blacklist.length === 0 ? (
            <div className="py-4 text-center text-xs text-zinc-500">등록된 유저가 없습니다.</div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {blacklist.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center justify-between p-2.5 !bg-zinc-950 !border !border-zinc-800"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-white truncate">{user.nickname || user.email}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{user.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveBlacklist(user.user_id)}
                    className="p-1 text-zinc-400 hover:text-white transition shrink-0"
                    title="제재 해제"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
