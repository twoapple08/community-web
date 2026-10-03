'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import { Send, ArrowLeft, Check, EyeOff, Save, FileDown, Clock, Trash2, Loader2 } from 'lucide-react'
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
  const [editorKey, setEditorKey] = useState(0) // 에디터 강제 재마운트 키

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // 임시보관 안내 상태
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null)
  const [loadingDraftCheck, setLoadingDraftCheck] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        alert('로그인이 필요한 기능입니다.')
        router.push('/')
      } else {
        const uid = session.user.id
        setUserId(uid)
        checkExistingDraft(uid)
      }
    })
  }, [router])

  // 기존 임시보관 확인
  const checkExistingDraft = async (uid: string) => {
    setLoadingDraftCheck(true)
    const { data } = await supabase
      .from('post_drafts')
      .select('title, content, tags, thumbnail_url, is_preview_hidden, updated_at')
      .eq('user_id', uid)
      .maybeSingle()

    if (data) {
      setExistingDraft(data as DraftData)
    }
    setLoadingDraftCheck(false)
  }

  // 본문 내 삽입된 이미지 목록 실시간 추출
  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map(
    (m) => m[1]
  );

  useEffect(() => {
    if (detectedImages.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(detectedImages[0]);
    }
  }, [content]);

  // 임시보관 저장 (최대 1개 덮어쓰기)
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
      alert('현재 작성 내용이 임시보관되었습니다. (최대 1개 보관)')
    }
    setIsSavingDraft(false)
  }

  // 임시보관 글 불러오기
  const handleLoadDraft = () => {
    if (!existingDraft) return
    if (
      (title.trim() || (content.trim() && content !== '<p></p>')) &&
      !window.confirm('임시보관된 글을 불러오시겠습니까? 현재 작성 중인 내용은 대체됩니다.')
    ) {
      return
    }

    setTitle(existingDraft.title || '')
    setContent(existingDraft.content || '')
    setSelectedTags(existingDraft.tags || [])
    setSelectedThumbnail(existingDraft.thumbnail_url || null)
    setIsPreviewHidden(Boolean(existingDraft.is_preview_hidden))
    setEditorKey((prev) => prev + 1) // 에디터 갱신
  }

  // 임시보관 글 삭제
  const handleDeleteDraft = async () => {
    if (!userId) return
    if (!window.confirm('임시보관된 글을 삭제하시겠습니까?')) return

    await supabase.from('post_drafts').delete().eq('user_id', userId)
    setExistingDraft(null)
  }

  // 최종 게시글 등록
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return alert('제목을 입력해 주세요.')
    if (!content.trim() || content === '<p></p>') return alert('본문 내용을 작성해 주세요.')
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
      alert(`게시글 등록 실패: ${error.message}`)
      setIsSubmitting(false)
    } else {
      // 등록 완료 시 보관되어 있던 임시글 자동 청소
      await supabase.from('post_drafts').delete().eq('user_id', userId)
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 상단 네비게이션 및 임시보관 헤더 컨트롤 */}
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
              onClick={handleLoadDraft}
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

      {/* 임시보관 감지 배너 */}
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
              onClick={handleLoadDraft}
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

        {/* 7종 고정 태그 선택기 */}
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
                  {isSelected && <Check className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 에디터 (불러오기 시 key 변경으로 내용 자동 동기화) */}
        <Editor key={editorKey} content={content} onChange={setContent} />

        {/* 썸네일 미리보기 설정 */}
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

          {detectedImages.length > 0 ? (
            <div>
              <span className="text-[11px] text-zinc-400 block mb-1.5">
                피드에 노출할 대표 사진을 선택하세요:
              </span>
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {detectedImages.map((src, idx) => {
                  const isMain = selectedThumbnail === src;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedThumbnail(src)}
                      className={`relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 cursor-pointer transition ${
                        isMain
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'border-zinc-700 hover:border-zinc-500'
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
          ) : (
            <p className="text-[11px] text-zinc-500">
              본문에 이미지를 첨부하면 이곳에서 대표 썸네일을 직접 선택할 수 있습니다.
            </p>
          )}
        </div>

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
    </div>
  )
}
