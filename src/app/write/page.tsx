'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import FreezeModal from '@/components/FreezeModal'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, Loader2, AlertCircle } from 'lucide-react'
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
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null)
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        alert('로그인이 필요한 기능입니다. 메인 피드로 이동합니다.')
        router.push('/')
      } else {
        const uid = session.user.id
        setUserId(uid)
        setUserEmail(session.user.email || null)

        const { data: blackRecord } = await supabase
          .from('blacklists')
          .select('reason')
          .eq('user_id', uid)
          .maybeSingle()

        if (blackRecord) {
          alert(`귀하는 블랙리스트로 등록되어 있어 게시글 작성이 금지되었습니다.\n사유: ${blackRecord.reason}`)
          router.push('/')
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

    if (data) {
      setExistingDraft(data as DraftData)
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
      alert('제목 또는 내용이 비어있어 임시보관할 수 없습니다.')
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
      alert(`임시보관 실패: ${error.message}`)
    } else {
      setExistingDraft({
        title: title.trim(),
        content,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail,
        is_preview_hidden: isPreviewHidden,
        updated_at: nowIso,
      })
      alert('현재 작성 내용이 안전하게 임시보관되었습니다. (최대 1개 유지)')
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

  const handleDeleteDraft = async () => {
    if (!userId) return
    if (!confirm('보관 중인 임시 게시글을 완전히 삭제하시겠습니까?')) return
    await supabase.from('post_drafts').delete().eq('user_id', userId)
    setExistingDraft(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    const isCreator = userEmail?.toLowerCase() === 'iwsamuel08@gmail.com'
    if (!isCreator) {
      const { data: noticeData } = await supabase
        .from('site_notices')
        .select('is_frozen')
        .eq('id', 1)
        .maybeSingle()

      if (noticeData?.is_frozen) {
        setIsFreezeModalOpen(true)
        return
      }
    }

    if (feedType === 'community' && !selectedBoard) {
      alert('커뮤니티 게시판을 반드시 하나 선택해야 합니다.')
      return
    }

    if (!title.trim()) {
      alert('게시글 제목을 입력해 주십시오.')
      return
    }

    if (!content.trim() || content === '<p></p>') {
      alert('본문 내용을 작성해 주십시오.')
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
      alert(`게시글 등록 실패: ${error.message}`)
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

        {/* 피드 대상 선택 탭 */}
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
        {/* 커뮤니티 전용 필수 게시판 선택 */}
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

      <FreezeModal
        isOpen={isFreezeModalOpen}
        onClose={() => setIsFreezeModalOpen(false)}
        actionText="게시글 작성을"
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
