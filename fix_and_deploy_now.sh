#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 구문 오류 복구 및 전역 실시간 답장 시스템 완전 적용"
echo "=========================================================="

# 1. 전역 실시간 답장 수신 팝업 컴포넌트 (src/components/AdminReplyPopup.tsx)
cat << 'FILE_POPUP' > src/components/AdminReplyPopup.tsx
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
  useEffect(() => {
    if (!currentUserId) return

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

    const interval = setInterval(() => {
      fetchUnnotifiedReply(currentUserId)
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
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
FILE_POPUP

# 2. 깨진 구문 없는 완전한 글쓰기 페이지 (src/app/write/page.tsx)
cat << 'FILE_WRITE' > src/app/write/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import FreezeModal from '@/components/FreezeModal'
import CustomPopup from '@/components/CustomPopup'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, ShieldAlert, Mail } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;
const COMMUNITY_BOARDS = ['자유', '정보 공유', '일상', '사연', '글/소설', '질문', '그림', '영상'] as const;

interface DraftData {
  title: string
  content: string
  tags: string[]
  thumbnail_url: string | null
  is_preview_hidden: boolean
  updated_at: string
}

function WriteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultFeed = searchParams?.get('feed') === 'clan' ? 'clan' : 'community'

  const [feedType, setFeedType] = useState<'clan' | 'community'>(defaultFeed)
  const [selectedBoard, setSelectedBoard] = useState<string>('')

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null)
  const [isPreviewHidden, setIsPreviewHidden] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userNickname, setUserNickname] = useState<string>('')
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null)
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false)

  // 블랙리스트 전용 상태
  const [showBlacklistModal, setShowBlacklistModal] = useState(false)
  const [showAppealModal, setShowAppealModal] = useState(false)
  const [appealMessage, setAppealMessage] = useState('')
  const [sendingAppeal, setSendingAppeal] = useState(false)

  // 커스텀 직각 팝업 상태
  const [customPopup, setCustomPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm: () => void;
    onCancel?: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setCustomPopup({
          isOpen: true,
          title: '로그인 필요',
          message: '로그인이 필요한 기능입니다. 메인 피드로 이동합니다.',
          onConfirm: () => router.push('/')
        })
      } else {
        const uid = session.user.id
        setUserId(uid)
        setUserEmail(session.user.email || null)

        const { data: prof } = await supabase.from('profiles').select('nickname').eq('id', uid).maybeSingle()
        setUserNickname(prof?.nickname || '사용자')

        // 블랙리스트 등록 여부 확인
        const { data: blackRecord } = await supabase
          .from('blacklists')
          .select('user_id')
          .eq('user_id', uid)
          .maybeSingle()

        if (blackRecord) {
          setShowBlacklistModal(true)
          return
        }

        checkExistingDraft(uid)
      }
    })
  }, [router])

  const checkExistingDraft = async (uid: string) => {
    const { data } = await supabase
      .from('post_drafts')
      .select('title, content, tags, thumbnail_url, is_preview_hidden, updated_at')
      .eq('user_id', uid)
      .maybeSingle()

    if (data) setExistingDraft(data as DraftData)
  }

  const handleSendAppeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    if (!appealMessage.trim()) {
      setCustomPopup({
        isOpen: true,
        title: '내용 입력',
        message: '이의제기 및 문의 내용을 작성해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setSendingAppeal(true)

    const { data: existingAppeal } = await supabase
      .from('blacklist_appeals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingAppeal) {
      setSendingAppeal(false)
      setShowAppealModal(false)
      setCustomPopup({
        isOpen: true,
        title: '접수 안내',
        message: '이미 검토 대기 중인 이의제기가 존재합니다. 관리자 확인 후 통보됩니다.',
        onConfirm: () => {
          setCustomPopup((p) => ({ ...p, isOpen: false }))
          router.push('/')
        }
      })
      return
    }

    const { error } = await supabase.from('blacklist_appeals').insert({
      user_id: userId,
      user_nickname: userNickname,
      user_email: userEmail,
      message: appealMessage.trim(),
      status: 'pending'
    })

    setSendingAppeal(false)
    setShowAppealModal(false)

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '전송 실패',
        message: `전송 실패: ${error.message}`,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
    } else {
      setCustomPopup({
        isOpen: true,
        title: '전송 완료',
        message: '관리자에게 이의제기 및 문의가 안전하게 전달되었습니다. 관리자 검토 후 결과가 통보됩니다.',
        onConfirm: () => {
          setCustomPopup((p) => ({ ...p, isOpen: false }))
          router.push('/')
        }
      })
    }
  }

  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map(
    (m) => m[1]
  );

  useEffect(() => {
    if (detectedImages.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(detectedImages[0]);
    }
  }, [content]);

  const handleSaveDraft = async () => {
    if (!userId) return
    if (!title.trim() && (!content.trim() || content === '<p></p>')) {
      setCustomPopup({
        isOpen: true,
        title: '임시보관 불가',
        message: '제목 또는 내용이 비어있어 보관할 수 없습니다.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setIsSavingDraft(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('post_drafts').upsert(
      {
        user_id: userId,
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '보관 실패',
        message: error.message,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
    } else {
      setExistingDraft({
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      })
      setCustomPopup({
        isOpen: true,
        title: '임시보관 완료',
        message: '현재 작성 내용이 안전하게 임시보관되었습니다. (최대 1개 유지)',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
    }
    setIsSavingDraft(false)
  }

  const handleLoadDraftClick = () => {
    if (!existingDraft) return
    setTitle(existingDraft.title || '')
    setContent(existingDraft.content || '')
    setSelectedTags(existingDraft.tags || [])
    setSelectedThumbnail(existingDraft.thumbnail_url || null)
    setIsPreviewHidden(Boolean(existingDraft.is_preview_hidden))
    setEditorKey((prev) => prev + 1)
  }

  const handleDeleteDraft = () => {
    if (!userId) return
    setCustomPopup({
      isOpen: true,
      type: 'confirm',
      title: '임시글 삭제',
      message: '보관 중인 임시 게시글을 완전히 삭제하시겠습니까?',
      onConfirm: async () => {
        await supabase.from('post_drafts').delete().eq('user_id', userId)
        setExistingDraft(null)
        setCustomPopup((p) => ({ ...p, isOpen: false }))
      },
      onCancel: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    const isCreator = userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'
    if (!isCreator) {
      const { data: noticeData } = await supabase.from('site_notices').select('is_frozen').eq('id', 1).maybeSingle()
      if (noticeData?.is_frozen) {
        setIsFreezeModalOpen(true)
        return
      }
    }

    if (feedType === 'community' && !selectedBoard) {
      setCustomPopup({
        isOpen: true,
        title: '게시판 선택 필요',
        message: '커뮤니티 게시판을 반드시 하나 선택해야 합니다.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    if (!title.trim()) {
      setCustomPopup({
        isOpen: true,
        title: '제목 입력',
        message: '게시글 제목을 입력해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    if (!content.trim() || content === '<p></p>') {
      setCustomPopup({
        isOpen: true,
        title: '내용 입력',
        message: '본문 내용을 작성해 주십시오.',
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      return
    }

    setIsSubmitting(true)
    const finalTitle = feedType === 'community' ? `[${selectedBoard}] ${title.trim()}` : title.trim()

    const { error } = await supabase.from('posts').insert([
      {
        title: finalTitle,
        content,
        author_id: userId,
        feed_type: feedType,
        board_category: feedType === 'community' ? selectedBoard : null,
        tags: feedType === 'clan' ? selectedTags : [],
        thumbnail_url: selectedThumbnail || (detectedImages.length > 0 ? detectedImages[0] : null),
        is_preview_hidden: isPreviewHidden,
      },
    ])

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '등록 실패',
        message: error.message,
        onConfirm: () => setCustomPopup((p) => ({ ...p, isOpen: false }))
      })
      setIsSubmitting(false)
    } else {
      await supabase.from('post_drafts').delete().eq('user_id', userId)
      router.push(feedType === 'community' ? '/community' : '/clan')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <Link
          href={feedType === 'community' ? '/community' : '/clan'}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>피드로 돌아가기</span>
        </Link>

        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-none text-xs font-bold">
          <button
            type="button"
            onClick={() => setFeedType('community')}
            className={`px-3 py-1.5 rounded-none transition ${feedType === 'community' ? 'bg-blue-600 text-white' : 'text-zinc-400'}`}
          >
            커뮤니티 피드
          </button>
          <button
            type="button"
            onClick={() => setFeedType('clan')}
            className={`px-3 py-1.5 rounded-none transition ${feedType === 'clan' ? 'bg-emerald-600 text-white' : 'text-zinc-400'}`}
          >
            클랜 피드
          </button>
        </div>
      </div>

      {existingDraft && (
        <div className="flex items-center justify-between p-3.5 mb-5 rounded-none bg-emerald-950/30 border border-emerald-800/60 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>임시보관된 글이 있습니다 ({new Date(existingDraft.updated_at).toLocaleString()})</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadDraftClick}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition rounded-none"
            >
              불러오기
            </button>
            <button
              type="button"
              onClick={handleDeleteDraft}
              className="p-1 text-zinc-400 hover:text-red-400 transition"
              title="임시보관 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {feedType === 'community' ? (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-2">
            <label className="block text-xs font-bold text-blue-400">
              * 게시판 선택 (필수 1개 선택)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMUNITY_BOARDS.map((board) => {
                const isSelected = selectedBoard === board;
                return (
                  <button
                    key={board}
                    type="button"
                    onClick={() => setSelectedBoard(board)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-none border transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    <span>{board}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-2">
            <label className="block text-xs font-bold text-emerald-400">
              클랜 해시태그 선택
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTags((prev) => prev.filter((t) => t !== tag));
                      } else {
                        setSelectedTags((prev) => [...prev, tag]);
                      }
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-semibold border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span>#{tag}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <input
            type="text"
            placeholder={feedType === 'community' ? "게시글 제목 (말머리는 자동 추가됩니다)" : "클랜 게시글 제목을 입력하세요"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-none text-lg font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {detectedImages.length > 0 && (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-none space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                미리보기 썸네일 설정
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPreviewHidden}
                  onChange={(e) => setIsPreviewHidden(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-600 relative"></div>
                <span className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <EyeOff className="w-3.5 h-3.5" />
                  미리보기 가리기
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {detectedImages.map((src, idx) => {
                const isMain = selectedThumbnail === src && !isPreviewHidden;
                return (
                  <div
                    key={idx}
                    onClick={() => !isPreviewHidden && setSelectedThumbnail(src)}
                    className={`relative shrink-0 w-20 h-20 rounded-none overflow-hidden border-2 cursor-pointer ${
                      isMain ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-zinc-700'
                    }`}
                  >
                    <img src={src} alt="사진" className="w-full h-full object-cover" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Editor key={editorKey} content={content} onChange={setContent} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-none border border-zinc-700 transition disabled:opacity-50 text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>임시보관</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-6 py-2.5 font-bold rounded-none text-white text-sm transition disabled:opacity-50 ${
              feedType === 'community' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? '등록 중...' : '게시글 등록'}</span>
          </button>
        </div>
      </form>

      {/* 블랙리스트 제재 전용 팝업 (사유 노출 없이 깔끔한 안내문) */}
      {showBlacklistModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => router.push('/')}
        >
          <div
            className="w-full max-w-sm !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-5 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <div className="p-3 bg-white text-black rounded-none">
                <ShieldAlert className="w-7 h-7" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black tracking-wide text-white">
                게시글 작성 제한 안내
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                귀하는 커뮤니티 이용 규정 위반으로 인해 블랙리스트로 등록되어 있어 게시글 작성이 영구히 금지되었습니다.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowBlacklistModal(false)
                  setShowAppealModal(true)
                }}
                className="px-4 py-2 text-xs font-bold rounded-none border border-white text-white hover:bg-zinc-900 transition flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>이의제기 및 문의</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-5 py-2 text-xs font-black rounded-none bg-white text-black hover:bg-zinc-200 transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 블랙리스트 이의제기 및 문의 작성 창 */}
      {showAppealModal && (
        <div
          className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => {
            setShowAppealModal(false)
            router.push('/')
          }}
        >
          <div
            className="w-full max-w-md !bg-black !text-white !border-2 !border-white rounded-none p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-white" />
                <h3 className="text-sm font-black text-white">이의제기 및 문의 작성</h3>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              관리진(사이트 제작자, 최고 관리자)에게 소명 내용 및 문의를 전달합니다. (해제 전까지 1회만 전송 가능)
            </p>

            <form onSubmit={handleSendAppeal} className="space-y-4">
              <textarea
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                placeholder="상세 문의 및 소명 내용을 입력하세요"
                rows={5}
                className="w-full p-3 text-xs !bg-zinc-950 !border !border-zinc-700 !text-white rounded-none focus:outline-none focus:!border-white"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    setShowAppealModal(false)
                    router.push('/')
                  }}
                  disabled={sendingAppeal}
                  className="px-4 py-2 text-xs font-bold rounded-none border border-zinc-600 text-zinc-300 hover:bg-zinc-900 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={sendingAppeal}
                  className="px-5 py-2 text-xs font-black rounded-none bg-white text-black hover:bg-zinc-200 transition disabled:opacity-40"
                >
                  {sendingAppeal ? '전송 중...' : '전송'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FreezeModal
        isOpen={isFreezeModalOpen}
        onClose={() => setIsFreezeModalOpen(false)}
        actionText="게시글 작성을"
      />

      <CustomPopup
        isOpen={customPopup.isOpen}
        type={customPopup.type}
        title={customPopup.title}
        message={customPopup.message}
        onConfirm={customPopup.onConfirm}
        onCancel={customPopup.onCancel}
      />
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-400">작성 에디터를 불러오는 중...</div>}>
      <WriteContent />
    </Suspense>
  )
}
FILE_WRITE

# 3. layout.tsx 에 AdminReplyPopup 완벽 연동
cat << 'FILE_LAYOUT' > src/app/layout.tsx
'use client'

import { CrownIcon } from "@/components/CrownIcon";
import AdminModal from "@/components/AdminModal";
import UserHubModal from "@/components/UserHubModal";
import BlacklistModal from "@/components/BlacklistModal";
import TermsModal from "@/components/TermsModal";
import AdminReplyPopup from "@/components/AdminReplyPopup";
import './globals.css'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Moon, Sun, PenSquare, LogOut, LogIn, Crown, ShieldAlert } from 'lucide-react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [user, setUser] = useState<any>(null)
  const [nickname, setNickname] = useState<string>("");
  const [userRole, setUserRole] = useState<"creator" | "super_admin" | "admin" | null>(null);

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);
  const [isUserHubOpen, setIsUserHubOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme === 'light') {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    } else {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const loadUserProfile = async (userId: string, email?: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('nickname, terms_agreed')
      .eq('id', userId)
      .maybeSingle();

    if (profileData?.nickname) {
      setNickname(profileData.nickname);
    } else {
      setNickname('익명사용자');
    }

    if (!profileData?.terms_agreed) {
      setIsTermsModalOpen(true);
    } else {
      setIsTermsModalOpen(false);
    }

    if (email?.toLowerCase() === "iwsamuel08@gmail.com") {
      setUserRole("creator");
    } else {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .or(`user_id.eq.${userId},email.eq.${email || ''}`)
        .maybeSingle();

      if (roleData?.role) {
        setUserRole(roleData.role as "creator" | "super_admin" | "admin");
      } else {
        setUserRole(null);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserProfile(currentUser.id, currentUser.email);
      } else {
        setNickname('');
        setUserRole(null);
        setIsTermsModalOpen(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setNickname('');
    setUserRole(null);
  };

  const isCreatorOrSuperAdmin =
    user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ||
    userRole === "creator" ||
    userRole === "super_admin";

  const isAdminGroup = Boolean(userRole === "creator" || userRole === "super_admin" || userRole === "admin");

  return (
    <html lang="ko" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <title>스틱파이터 클랜 커뮤니티</title>
        <meta name="description" content="자신만의 클랜을 홍보하세요" />
        <link rel="icon" href="/icon.png?v=3" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png?v=3" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="스틱파이터 클랜 커뮤니티" />
        <meta property="og:title" content="스틱파이터 클랜 커뮤니티" />
        <meta property="og:description" content="자신만의 클랜을 홍보하세요" />
        <meta property="og:image" content="https://www.sfaclan.com/icon.png?v=3" />
        <meta property="og:url" content="https://www.sfaclan.com/" />
      </head>
      <body className="min-h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-300 overflow-x-hidden flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md transition-colors duration-300">
          <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 h-13 sm:h-15 flex items-center justify-between gap-1.5">
            <Link href="/" className="text-sm sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white hover:opacity-80 transition shrink-0">
              COMMUNITY
            </Link>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink min-w-0">
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                onClick={toggleTheme}
                title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                className={`relative inline-flex h-6 w-11 sm:h-7 sm:w-13 items-center rounded-full p-0.5 transition-colors duration-300 cursor-pointer shadow-inner shrink-0 ${
                  theme === 'dark' ? 'bg-white border border-zinc-200' : 'bg-zinc-900 border border-zinc-800'
                }`}
              >
                <span
                  className={`inline-flex h-4.5 w-4.5 sm:h-5 sm:w-5 transform items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out ${
                    theme === 'dark' ? 'translate-x-5 sm:translate-x-6 bg-zinc-950' : 'translate-x-0 bg-white'
                  }`}
                >
                  {theme === 'dark' ? (
                    <Moon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white fill-white" />
                  ) : (
                    <Sun className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-zinc-950 stroke-[2.5]" />
                  )}
                </span>
              </button>

              {user ? (
                <>
                  <Link
                    href="/write"
                    className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0 shadow-sm"
                  >
                    <PenSquare className="w-3 h-3" />
                    <span>글쓰기</span>
                  </Link>

                  <button
                    onClick={() => setIsUserHubOpen(true)}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-[11px] sm:text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0"
                    title="마이 메뉴"
                  >
                    <CrownIcon role={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole} className="w-3 h-3 shrink-0" />
                    <span className="max-w-[45px] sm:max-w-[90px] truncate">{nickname || "닉네임"}</span>
                  </button>

                  {isCreatorOrSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsAdminModalOpen(true)}
                      className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-bold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition whitespace-nowrap shrink-0"
                      title="관리자 지정"
                    >
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">관리자</span>
                    </button>
                  )}

                  {isAdminGroup && (
                    <button
                      type="button"
                      onClick={() => setIsBlacklistModalOpen(true)}
                      className="!bg-black !text-white !border !border-white hover:!bg-zinc-900 inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-black rounded-none transition whitespace-nowrap shrink-0 shadow-sm"
                      title="블랙리스트 관리"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 !text-white shrink-0" />
                      <span>블랙</span>
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-300 text-[11px] sm:text-xs font-medium transition shrink-0"
                    title="로그아웃"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-[11px] sm:text-xs font-bold transition whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>로그인</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="w-full flex-1 flex flex-col items-stretch">{children}</main>

        {/* 전역 실시간 답장 수신 팝업 */}
        <AdminReplyPopup />

        {user && (
          <UserHubModal
            isOpen={isUserHubOpen}
            onClose={() => setIsUserHubOpen(false)}
            userId={user.id}
            userEmail={user.email || ""}
            userRole={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole}
            currentNickname={nickname}
            onNicknameUpdated={(newNick) => setNickname(newNick)}
          />
        )}

        <AdminModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUserRole={user?.email?.toLowerCase() === "iwsamuel08@gmail.com" ? "creator" : userRole}
        />

        <BlacklistModal
          isOpen={isBlacklistModalOpen}
          onClose={() => setIsBlacklistModalOpen(false)}
        />

        {user && (
          <TermsModal
            isOpen={isTermsModalOpen}
            userId={user.id}
            onAgreed={() => setIsTermsModalOpen(false)}
          />
        )}
      </body>
    </html>
  )
}
FILE_LAYOUT

echo "--> 소스코드 정비 완료. 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 구문 오류 해결 완료! Git 자동 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: write 페이지 JSX 구문 오류 복구 및 전역 실시간 답장 팝업 완벽 적용"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
