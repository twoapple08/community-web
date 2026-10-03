'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;

interface DraftData {
  title: string
  content: string
  tags: string[]
  thumbnail_url: string | null
  is_preview_hidden: boolean
  updated_at: string
}

export default function WritePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null)
  const [isPreviewHidden, setIsPreviewHidden] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null)

  const [customPopup, setCustomPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '' })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setCustomPopup({
          isOpen: true,
          title: '로그인 필요',
          message: '로그인이 필요한 기능입니다. 메인 피드로 이동합니다.',
          type: 'alert',
          onConfirm: () => router.push('/')
        })
      } else {
        const uid = session.user.id
        setUserId(uid)

        // 블랙리스트 여부 검사
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
      setCustomPopup({
        isOpen: true,
        title: '임시보관 불가',
        message: '제목 또는 본문 내용이 비어있어 임시보관할 수 없습니다.',
        type: 'alert'
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
        message: `임시보관 실패: ${error.message}`,
        type: 'alert'
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
        type: 'alert'
      })
    }
    setIsSavingDraft(false)
  }

  const executeLoadDraft = () => {
    if (!existingDraft) return
    setTitle(existingDraft.title || '')
    setContent(existingDraft.content || '')
    setSelectedTags(existingDraft.tags || [])
    setSelectedThumbnail(existingDraft.thumbnail_url || null)
    setIsPreviewHidden(Boolean(existingDraft.is_preview_hidden))
    setEditorKey((prev) => prev + 1)
  }

  const handleLoadDraftClick = () => {
    if (!existingDraft) return
    if (title.trim() || (content.trim() && content !== '<p></p>')) {
      setCustomPopup({
        isOpen: true,
        title: '임시보관 불러오기',
        message: '임시보관된 글을 불러오시겠습니까? 현재 작성 중인 내용은 대체됩니다.',
        type: 'confirm',
        onConfirm: executeLoadDraft
      })
    } else {
      executeLoadDraft()
    }
  }

  const handleDeleteDraft = () => {
    if (!userId) return
    setCustomPopup({
      isOpen: true,
      title: '임시보관 삭제',
      message: '보관 중인 임시 게시글을 완전히 삭제하시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        await supabase.from('post_drafts').delete().eq('user_id', userId)
        setExistingDraft(null)
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setCustomPopup({
        isOpen: true,
        title: '제목 입력',
        message: '게시글 제목을 입력해 주십시오.',
        type: 'alert'
      })
      return
    }
    if (!content.trim() || content === '<p></p>') {
      setCustomPopup({
        isOpen: true,
        title: '내용 입력',
        message: '본문 내용을 작성해 주십시오.',
        type: 'alert'
      })
      return
    }
    if (!userId) return

    setIsSubmitting(true)

    const { error } = await supabase.from('posts').insert([
      {
        title: title.trim(),
        content,
        author_id: userId,
        tags: selectedTags,
        thumbnail_url: selectedThumbnail || (detectedImages.length > 0 ? detectedImages[0] : null),
        is_preview_hidden: isPreviewHidden,
      },
    ])

    if (error) {
      setCustomPopup({
        isOpen: true,
        title: '등록 실패',
        message: error.message.includes('policy')
          ? '블랙리스트로 등록되어 있거나 권한이 없어 게시글을 작성할 수 없습니다.'
          : `게시글 등록 실패: ${error.message}`,
        type: 'alert'
      })
      setIsSubmitting(false)
    } else {
      await supabase.from('post_drafts').delete().eq('user_id', userId)
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>목록으로 돌아가기</span>
        </Link>

        <div className="flex items-center gap-2">
          {existingDraft && (
            <button
              type="button"
              onClick={handleLoadDraftClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/60 text-xs font-semibold transition"
              title="임시보관 불러오기"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>임시보관 불러오기</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition disabled:opacity-50"
          >
            {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>임시보관</span>
          </button>
        </div>
      </div>

      {existingDraft && (
        <div className="flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              임시보관된 글이 있습니다 ({new Date(existingDraft.updated_at).toLocaleString()})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadDraftClick}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition"
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
        <div>
          <input
            type="text"
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-lg font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
          <label className="block text-xs font-semibold text-zinc-400">
            해시태그 선택 (중복 선택 가능)
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
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                    isSelected
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                      : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  <span>#{tag}</span>
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {detectedImages.length > 0 && (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-3">
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
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 relative"></div>
                <span className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <EyeOff className="w-3.5 h-3.5" />
                  미리보기 가리기
                </span>
              </label>
            </div>

            <div>
              <span className="text-[11px] text-zinc-400 block mb-1.5">
                {isPreviewHidden
                  ? '미리보기 가리기가 설정되어 있어 썸네일이 피드에 노출되지 않습니다.'
                  : '피드에 노출할 대표 사진을 선택하세요:'}
              </span>
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {detectedImages.map((src, idx) => {
                  const isMain = selectedThumbnail === src && !isPreviewHidden;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!isPreviewHidden) {
                          setSelectedThumbnail(src);
                        }
                      }}
                      className={`relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition ${
                        isPreviewHidden
                          ? 'opacity-40 cursor-not-allowed border-zinc-700'
                          : isMain
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30 cursor-pointer'
                          : 'border-zinc-700 hover:border-zinc-500 cursor-pointer'
                      }`}
                    >
                      <img src={src} alt="사진" className="w-full h-full object-cover" />
                      {isMain && (
                        <span className="absolute bottom-1 left-1 right-1 bg-emerald-600 text-white text-[9px] font-bold text-center py-0.5 rounded">
                          대표 사진
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <Editor key={editorKey} content={content} onChange={setContent} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl border border-zinc-700 transition disabled:opacity-50 text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>임시보관</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition disabled:opacity-50 text-sm"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? '등록 중...' : '게시글 등록'}</span>
          </button>
        </div>
      </form>

      {customPopup.isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setCustomPopup((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {customPopup.title}
              </h3>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {customPopup.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCustomPopup((prev) => ({ ...prev, isOpen: false }));
                  if (customPopup.onConfirm) customPopup.onConfirm();
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
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
