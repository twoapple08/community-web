'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Editor from '@/components/Editor'
import { Send, ArrowLeft, Check, EyeOff } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;

export default function WritePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null)
  const [isPreviewHidden, setIsPreviewHidden] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        alert('로그인이 필요한 기능입니다.')
        router.push('/')
      } else {
        setUserId(session.user.id)
      }
    })
  }, [router])

  // 본문 내 삽입된 이미지 목록 실시간 추출
  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map(
    (m) => m[1]
  );

  useEffect(() => {
    if (detectedImages.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(detectedImages[0]);
    }
  }, [content]);

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

    setIsSubmitting(false)

    if (error) {
      alert(`게시글 등록 실패: ${error.message}`)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>목록으로 돌아가기</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-white">새 게시글 작성</h1>
      </div>

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

        {/* 에디터 */}
        <Editor content={content} onChange={setContent} />

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

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? '등록 중...' : '게시글 등록'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}