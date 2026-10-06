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
  nickname: string | null
  email?: string
}

// 닉네임이 비어 있는 계정(null)도 목록/검색이 깨지지 않도록 표시용 이름으로 대체
const displayNickname = (nickname: string | null | undefined) => (nickname || '').trim() || '익명사용자'

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

  // 블랙리스트 전용 커스텀 확인 팝업
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    onConfirm?: () => void;
  } | null>(null);

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

    // 개인정보 보호: 다른 유저의 이메일은 조회하지 않음 (닉네임만 사용)
    const { data: pData } = await supabase
      .from('profiles')
      .select('id, nickname')

    if (bData) setBlacklist(bData as BlacklistUser[])
    if (pData) setProfiles(pData as ProfileUser[])
    setFetching(false)
  }

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) {
      setConfirmDialog({
        isOpen: true,
        title: '유저 선택 필요',
        message: '블랙리스트로 지정할 유저를 목록에서 선택해 주십시오.',
        isConfirm: false
      })
      return
    }

    setLoading(true)
    const targetUser = profiles.find((p) => p.id === selectedUserId)
    if (!targetUser) {
      setConfirmDialog({
        isOpen: true,
        title: '오류',
        message: '유저 정보를 찾을 수 없습니다.',
        isConfirm: false
      })
      setLoading(false)
      return
    }

    const targetName = displayNickname(targetUser.nickname)
    const { error } = await supabase.from('blacklists').upsert({
      user_id: selectedUserId,
      nickname: targetName,
      email: targetUser.email || `${(targetUser.nickname || '').trim() || targetUser.id}@community.local`,
      reason: reason.trim() || '관리자 수동 지정 제재',
    })

    if (error) {
      setConfirmDialog({
        isOpen: true,
        title: '등록 실패',
        message: `블랙리스트 등록 실패: ${error.message}`,
        isConfirm: false
      })
    } else {
      setSelectedUserId('')
      setSearchNickname('')
      await loadData()
      setConfirmDialog({
        isOpen: true,
        title: '등록 완료',
        message: `[${targetName}] 유저가 블랙리스트에 정상 등록되었습니다.`,
        isConfirm: false
      })
    }
    setLoading(false)
  }

  const handleRequestRemove = (user: BlacklistUser) => {
    setConfirmDialog({
      isOpen: true,
      title: '블랙리스트 해제',
      message: `정말로 [${user.nickname || user.email}] 유저를 블랙리스트에서 해제하시겠습니까?`,
      isConfirm: true,
      onConfirm: async () => {
        const { error } = await supabase.from('blacklists').delete().eq('user_id', user.user_id)
        if (error) {
          setConfirmDialog({
            isOpen: true,
            title: '해제 실패',
            message: `해제 실패: ${error.message}`,
            isConfirm: false
          })
        } else {
          await loadData()
        }
      }
    })
  }

  if (!isOpen) return null

  const filteredProfiles = profiles.filter((p) =>
    (p.nickname || '').toLowerCase().includes(searchNickname.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white text-zinc-900 border-2 border-zinc-900 dark:bg-black dark:text-white dark:border-white rounded-none shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-900 dark:border-white pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-zinc-900 dark:text-white" />
            <h2 className="text-base font-black tracking-wide">블랙리스트 관리</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-900 hover:bg-zinc-100 dark:text-white dark:hover:bg-zinc-900 rounded-none transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAddBlacklist} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-zinc-900 dark:text-white mb-1">
              제재할 유저 검색 및 선택
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchNickname}
                onChange={(e) => setSearchNickname(e.target.value)}
                placeholder="유저 닉네임을 입력하세요"
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-zinc-300 text-zinc-900 focus:border-zinc-900 dark:bg-zinc-950 dark:border-zinc-700 dark:text-white dark:focus:border-white rounded-none focus:outline-none"
              />
            </div>

            <div className="max-h-28 overflow-y-auto border border-zinc-300 bg-zinc-50 divide-y divide-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:divide-zinc-900">
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
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-bold'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <span>{displayNickname(p.nickname)}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white dark:text-black" />}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-900 dark:text-white mb-1">
              제재 사유
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 입력하세요"
              className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-300 text-zinc-900 focus:border-zinc-900 dark:bg-zinc-950 dark:border-zinc-700 dark:text-white dark:focus:border-white rounded-none focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading || !selectedUserId}
              className="px-4 py-2 text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition disabled:opacity-40 rounded-none"
            >
              {loading ? '처리 중...' : '블랙리스트 추가'}
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-zinc-300 dark:border-zinc-800">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-2">
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
                  className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-300 dark:bg-zinc-950 dark:border-zinc-800"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{user.nickname || user.email}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{user.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRequestRemove(user)}
                    className="p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition shrink-0"
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

      {/* 블랙리스트 UI 일치 커스텀 확인/알림 팝업 */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="w-full max-w-sm bg-white text-zinc-900 border-2 border-zinc-900 dark:bg-black dark:text-white dark:border-white p-6 space-y-4 text-center rounded-none shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold">{confirmDialog.title}</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              {confirmDialog.isConfirm && (
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-1.5 text-xs border border-zinc-400 text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-500 dark:text-zinc-300 dark:hover:border-white dark:hover:text-white rounded-none transition"
                >
                  취소
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const onOk = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  if (onOk) onOk();
                }}
                className="px-5 py-1.5 text-xs bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 font-bold rounded-none transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
