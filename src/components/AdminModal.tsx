'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, UserX, AlertTriangle, Search, Check, Crown, ChevronDown } from 'lucide-react'
import { CrownIcon, RoleType } from './CrownIcon'
import CustomPopup from './CustomPopup'
import { clearRoleCaches } from '@/lib/roles'

interface AdminUser {
  email: string
  role: RoleType
  user_id?: string
  nickname?: string
}

interface ProfileUser {
  id: string
  nickname: string | null
}

// 닉네임이 비어 있는 계정(null)도 목록/검색이 깨지지 않도록 표시용 이름으로 대체
const displayNickname = (nickname: string | null | undefined) => (nickname || '').trim() || '익명사용자'

interface AdminModalProps {
  isOpen: boolean
  onClose: () => void
  currentUserRole: RoleType
}

export default function AdminModal({ isOpen, onClose, currentUserRole }: AdminModalProps) {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [profiles, setProfiles] = useState<ProfileUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [searchNickname, setSearchNickname] = useState<string>('')
  const [targetRole, setTargetRole] = useState<'super_admin' | 'admin'>('admin')
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  const [deletingAdmin, setDeletingAdmin] = useState<AdminUser | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [alertPopup, setAlertPopup] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadData()
      setIsRoleDropdownOpen(false)
    }
  }, [isOpen])

  const loadData = async () => {
    setFetching(true)

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('email, role, user_id')

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, nickname')

    if (profilesData) {
      setProfiles(profilesData)
    }

    if (rolesData) {
      const profileMap: Record<string, string> = {}
      profilesData?.forEach((p) => {
        if (p.nickname) profileMap[p.id] = p.nickname
      })

      const formattedAdmins = rolesData.map((r: any) => ({
        ...r,
        nickname: r.user_id ? profileMap[r.user_id] || '닉네임 미등록' : '유저 ID 미연동',
      }))
      setAdmins(formattedAdmins)
    }

    setFetching(false)
  }

  const handleAssignAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) {
      setAlertPopup({ title: '유저 선택 필요', message: '관리자로 지정할 유저를 선택해 주십시오.' })
      return
    }

    setLoading(true)
    const targetProfile = profiles.find((p) => p.id === selectedUserId)
    if (!targetProfile) {
      setAlertPopup({ title: '오류', message: '유저 정보를 찾을 수 없습니다.' })
      setLoading(false)
      return
    }

    const { error } = await supabase.from('user_roles').upsert(
      {
        user_id: selectedUserId,
        email: `${(targetProfile.nickname || '').trim() || targetProfile.id}@community.local`,
        role: targetRole,
      },
      { onConflict: 'email' }
    )

    if (error) {
      const { data: existing } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', selectedUserId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('user_roles')
          .update({ role: targetRole })
          .eq('user_id', selectedUserId)
      } else {
        setAlertPopup({ title: '지정 실패', message: `관리자 지정 실패: ${error.message}` })
      }
    }

    setSelectedUserId('')
    setSearchNickname('')
    clearRoleCaches()
    await loadData()
    setLoading(false)
  }

  const handleConfirmRevoke = async () => {
    if (!deletingAdmin) return
    setIsDeleting(true)

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('email', deletingAdmin.email)

    if (error) {
      setAlertPopup({ title: '해제 실패', message: `해제 실패: ${error.message}` })
    } else {
      setDeletingAdmin(null)
      clearRoleCaches()
      await loadData()
    }
    setIsDeleting(false)
  }

  if (!isOpen) return null

  const filteredProfiles = profiles.filter((p) =>
    (p.nickname || '').toLowerCase().includes(searchNickname.toLowerCase())
  )

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-visible animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">관리자 지정 및 관리</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full transition duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <form onSubmit={handleAssignAdmin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                유저 닉네임 검색 및 선택
              </label>
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
                <input
                  type="text"
                  value={searchNickname}
                  onChange={(e) => setSearchNickname(e.target.value)}
                  placeholder="지정할 유저의 닉네임을 입력하세요"
                  className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition duration-300"
                />
              </div>

              <div className="max-h-32 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredProfiles.length === 0 ? (
                  <div className="p-3 text-center text-xs text-zinc-500 dark:text-zinc-400">일치하는 유저가 없습니다.</div>
                ) : (
                  filteredProfiles.map((p) => {
                    const isSelected = selectedUserId === p.id
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedUserId(p.id)}
                        className={`flex items-center justify-between px-3.5 py-2 text-xs cursor-pointer transition duration-300 ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-bold'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        <span>{displayNickname(p.nickname)}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="relative">
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                  부여할 권한
                </label>
                <button
                  type="button"
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium shadow-sm transition duration-300"
                >
                  <span className="truncate">
                    {targetRole === 'super_admin' ? '최고관리자' : '일반관리자'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0 ml-1" />
                </button>

                {isRoleDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-30 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    {currentUserRole === 'creator' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetRole('super_admin')
                          setIsRoleDropdownOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition duration-300 ${
                          targetRole === 'super_admin'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-700/60 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <span>최고관리자</span>
                        {targetRole === 'super_admin' && <Check className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setTargetRole('admin')
                        setIsRoleDropdownOpen(false)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition duration-300 ${
                        targetRole === 'admin'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-700/60 text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      <span>일반관리자</span>
                      {targetRole === 'admin' && <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading || !selectedUserId}
                  className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition duration-300 disabled:opacity-50"
                >
                  {loading ? '임명 중...' : '관리자 지정'}
                </button>
              </div>
            </div>
          </form>

          <div>
            <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
              현재 관리자 명단 ({admins.length}명)
            </h3>
            {fetching ? (
              <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">명단을 불러오는 중...</div>
            ) : (
              <div className="space-y-2">
                {admins.map((admin) => {
                  const isCreator = admin.role === 'creator'
                  const canRevoke =
                    currentUserRole === 'creator'
                      ? !isCreator
                      : currentUserRole === 'super_admin' && admin.role === 'admin'

                  return (
                    <div
                      key={admin.email}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 transition duration-300"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CrownIcon role={admin.role} className="w-4 h-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {admin.nickname || admin.email}
                          </p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {admin.role === 'creator'
                              ? '사이트 제작자'
                              : admin.role === 'super_admin'
                              ? '최고관리자'
                              : '일반관리자'}
                          </p>
                        </div>
                      </div>

                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => setDeletingAdmin(admin)}
                          className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition duration-300 shrink-0"
                          title="권한 해제"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {deletingAdmin && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => !isDeleting && setDeletingAdmin(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">관리자 권한 해제</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {deletingAdmin.nickname || deletingAdmin.email}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              정말로 <span className="font-bold text-red-500">[{deletingAdmin.nickname || deletingAdmin.email}]</span> 계정의 관리자 권한을 해제하시겠습니까? 해제 즉시 관리 권한이 박탈됩니다.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingAdmin(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition duration-300 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition duration-300 disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>{isDeleting ? '해제 중...' : '권한 해제'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    <CustomPopup
      isOpen={Boolean(alertPopup)}
      title={alertPopup?.title || ''}
      message={alertPopup?.message || ''}
      onConfirm={() => setAlertPopup(null)}
    />
    </>
  )
}
