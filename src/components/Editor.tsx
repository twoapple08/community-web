'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import {
  Bold,
  Italic,
  Strikethrough,
  Quote,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table as TableIcon,
  Code,
  Minus,
  Sparkles,
  Palette,
  Highlighter,
  Type,
  X,
  Check
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useState, useRef } from 'react'

interface EditorProps {
  content: string
  onChange: (html: string) => void
  minHeight?: string
}

const PRESET_FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const FONT_FAMILIES = [
  { label: '기본 고딕 (Sans)', value: 'sans-serif' },
  { label: '명조체 (Serif)', value: 'serif' },
  { label: '고정폭 (Mono)', value: 'monospace' },
  { label: '손글씨체 (Cursive)', value: 'cursive' }
];

export default function Editor({ content, onChange, minHeight = '300px' }: EditorProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [showMoreTools, setShowMoreTools] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. 커스텀 링크 삽입 모달 상태
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [inputLinkUrl, setInputLinkUrl] = useState('')
  const [inputLinkText, setInputLinkText] = useState('')

  // 2. 글꼴 및 크기 커스텀 드롭다운 상태
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false)
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: `prose prose-zinc dark:prose-invert max-w-none p-4 focus:outline-none text-zinc-800 dark:text-zinc-200 min-h-[${minHeight}]`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  if (!editor) return null

  // 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop() || 'png'
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      let finalUrl: string | null = null

      try {
        const { error: err1 } = await supabase.storage.from('posts').upload(fileName, file)
        if (!err1) {
          const { data } = supabase.storage.from('posts').getPublicUrl(fileName)
          if (data?.publicUrl) finalUrl = data.publicUrl
        } else {
          const { error: err2 } = await supabase.storage.from('post-images').upload(fileName, file)
          if (!err2) {
            const { data } = supabase.storage.from('post-images').getPublicUrl(fileName)
            if (data?.publicUrl) finalUrl = data.publicUrl
          }
        }
      } catch (err) {
        console.warn("Storage upload error:", err)
      }

      if (!finalUrl) {
        finalUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string) || '')
          reader.onerror = () => resolve('')
          reader.readAsDataURL(file)
        })
      }

      if (finalUrl) {
        editor.chain().focus().setImage({ src: finalUrl }).run()
      }
    }

    onChange(editor.getHTML())
    setIsUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 커스텀 링크 팝업 열기
  const handleOpenLinkModal = () => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    setInputLinkText(selected || '')
    setInputLinkUrl('')
    setIsLinkModalOpen(true)
  }

  // 커스텀 링크 삽입 적용
  const handleApplyLink = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputLinkUrl.trim()) return

    let finalUrl = inputLinkUrl.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    const displayText = inputLinkText.trim() || finalUrl
    editor.chain().focus().insertContent(`<a href="${finalUrl}" target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    setIsLinkModalOpen(false)
    setInputLinkUrl('')
    setInputLinkText('')
  }

  // 서식 헬퍼 함수
  const applyTextColor = (color: string) => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    editor.chain().focus().insertContent(`<span style="color: ${color};">${selected || '색상 텍스트'}</span> `).run()
  }

  const applyHighlightColor = (bgColor: string) => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    editor.chain().focus().insertContent(`<mark style="background-color: ${bgColor}; padding: 0 4px; border-radius: 2px;">${selected || '형광펜 텍스트'}</mark> `).run()
  }

  const applyFontSize = (size: string) => {
    let clean = size.trim()
    if (!clean.endsWith('px') && !clean.endsWith('em') && !clean.endsWith('rem')) {
      clean += 'px'
    }
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    editor.chain().focus().insertContent(`<span style="font-size: ${clean};">${selected || '텍스트'}</span> `).run()
    setIsSizeDropdownOpen(false)
    setCustomSizeInput('')
  }

  const applyFontFamily = (font: string) => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    editor.chain().focus().insertContent(`<span style="font-family: ${font};">${selected || '텍스트'}</span> `).run()
    setIsFontDropdownOpen(false)
  }

  const applyAlign = (align: string) => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    editor.chain().focus().insertContent(`<div style="text-align: ${align};">${selected || '정렬된 문단'}</div><p></p>`).run()
  }

  const insertTable = (rows: number, cols: number) => {
    let tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1px solid #71717a;"><tbody>`
    for (let r = 0; r < rows; r++) {
      tableHtml += `<tr>`
      for (let c = 0; c < cols; c++) {
        tableHtml += `<td style="border: 1px solid #71717a; padding: 8px; text-align: left;">내용</td>`
      }
      tableHtml += `</tr>`
    }
    tableHtml += `</tbody></table><p></p>`
    editor.chain().focus().insertContent(tableHtml).run()
  }

  const insertSymbol = (sym: string) => {
    editor.chain().focus().insertContent(`${sym} `).run()
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 overflow-visible shadow-sm relative">
      {/* 1열: 기본 툴바 + [더보기 토글] + 맨 우측 [이미지 추가] */}
      <div className="flex items-center justify-between gap-1 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}
            title="굵게"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400' : ''}`}
            title="기울임"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('strike') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400' : ''}`}
            title="취소선"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('blockquote') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400' : ''}`}
            title="인용구"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400' : ''}`}
            title="글머리 기호"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('orderedList') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400' : ''}`}
            title="번호 매기기"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          {/* 사이트 UI 맞춤 커스텀 링크 팝업 트리거 */}
          <button
            type="button"
            onClick={handleOpenLinkModal}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            title="링크 삽입"
          >
            <LinkIcon className="w-4 h-4" />
          </button>

          {/* 도구 더보기 토글 */}
          <button
            type="button"
            onClick={() => setShowMoreTools(!showMoreTools)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition ${
              showMoreTools
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <span>도구 더보기</span>
            {showMoreTools ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* 맨 오른쪽: 이미지 첨부 버튼 */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition disabled:opacity-50 shadow-sm"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5" />
            )}
            <span>{isUploading ? '업로드 중...' : '이미지 추가'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>

      {/* 2열: 펼쳐지는 고급 서식 도구 모음 */}
      {showMoreTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center gap-2 text-xs relative z-20 animate-in slide-in-from-top-2 duration-150">
          {/* 글꼴 드롭다운 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsFontDropdownOpen(!isFontDropdownOpen)
                setIsSizeDropdownOpen(false)
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-800 dark:text-zinc-200 font-medium shadow-sm"
            >
              <Type className="w-3.5 h-3.5 text-zinc-400" />
              <span>글꼴 선택</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isFontDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 z-30 overflow-hidden">
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => applyFontFamily(f.value)}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 block"
                    style={{ fontFamily: f.value }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 폰트 크기 드롭다운 (직접 입력란 포함) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsSizeDropdownOpen(!isSizeDropdownOpen)
                setIsFontDropdownOpen(false)
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-800 dark:text-zinc-200 font-medium shadow-sm"
            >
              <span>글자 크기</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isSizeDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-2 z-30 space-y-2">
                {/* 폰트 크기 직접 입력 */}
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold block mb-1">직접 입력 (px)</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      placeholder="예: 22"
                      value={customSizeInput}
                      onChange={(e) => setCustomSizeInput(e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => customSizeInput && applyFontSize(customSizeInput)}
                      className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold shrink-0"
                    >
                      적용
                    </button>
                  </div>
                </div>

                {/* 프리셋 선택 목록 */}
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 space-y-0.5">
                  <span className="text-[10px] text-zinc-400 font-bold block mb-1">프리셋 선택</span>
                  {PRESET_FONT_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => applyFontSize(sz)}
                      className="w-full px-2 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded"
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 색상 팔레트 */}
          <div className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <button type="button" onClick={() => applyTextColor('#ef4444')} className="w-4 h-4 rounded-full bg-red-500" title="빨간색" />
            <button type="button" onClick={() => applyTextColor('#3b82f6')} className="w-4 h-4 rounded-full bg-blue-500" title="파란색" />
            <button type="button" onClick={() => applyTextColor('#10b981')} className="w-4 h-4 rounded-full bg-emerald-500" title="초록색" />
            <button type="button" onClick={() => applyTextColor('#f59e0b')} className="w-4 h-4 rounded-full bg-amber-500" title="노란색" />
            <button type="button" onClick={() => applyTextColor('#a855f7')} className="w-4 h-4 rounded-full bg-purple-500" title="보라색" />
          </div>

          {/* 형광펜 */}
          <div className="flex items-center gap-1">
            <Highlighter className="w-3.5 h-3.5 text-zinc-400" />
            <button type="button" onClick={() => applyHighlightColor('#fef08a')} className="w-4 h-4 rounded bg-yellow-200 border border-yellow-400" title="노랑 형광펜" />
            <button type="button" onClick={() => applyHighlightColor('#bbf7d0')} className="w-4 h-4 rounded bg-green-200 border border-green-400" title="연두 형광펜" />
            <button type="button" onClick={() => applyHighlightColor('#fed7aa')} className="w-4 h-4 rounded bg-orange-200 border border-orange-400" title="주황 형광펜" />
            <button type="button" onClick={() => applyHighlightColor('#bae6fd')} className="w-4 h-4 rounded bg-sky-200 border border-sky-400" title="하늘 형광펜" />
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 정렬 */}
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => applyAlign('left')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" title="왼쪽 맞춤">
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyAlign('center')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" title="가운데 맞춤">
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyAlign('right')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" title="오른쪽 맞춤">
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => applyAlign('justify')} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" title="양쪽 맞춤">
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 표 삽입 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => insertTable(2, 2)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-[11px]"
              title="2x2 표"
            >
              <TableIcon className="w-3 h-3" />
              <span>2x2 표</span>
            </button>
            <button
              type="button"
              onClick={() => insertTable(3, 3)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-[11px]"
              title="3x3 표"
            >
              <TableIcon className="w-3 h-3" />
              <span>3x3 표</span>
            </button>
          </div>

          {/* 구분선 & 코드 블록 & 특수기호 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
            title="구분선 삽입"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
            title="코드 블록"
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1 pl-1">
            <Sparkles className="w-3 h-3 text-zinc-400" />
            <button type="button" onClick={() => insertSymbol('★')} className="hover:text-emerald-500 font-bold">★</button>
            <button type="button" onClick={() => insertSymbol('♥')} className="hover:text-emerald-500 font-bold">♥</button>
            <button type="button" onClick={() => insertSymbol('◆')} className="hover:text-emerald-500 font-bold">◆</button>
            <button type="button" onClick={() => insertSymbol('→')} className="hover:text-emerald-500 font-bold">→</button>
            <button type="button" onClick={() => insertSymbol('※')} className="hover:text-emerald-500 font-bold">※</button>
          </div>
        </div>
      )}

      {/* 본문 에디터 내용 영역 */}
      <EditorContent editor={editor} />

      {/* 사이트 UI 맞춤 링크 삽입 커스텀 팝업 (입력 내용 실시간 반영) */}
      {isLinkModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsLinkModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-emerald-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">링크 삽입</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLinkModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyLink} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  접속 주소 (URL)
                </label>
                <input
                  type="text"
                  value={inputLinkUrl}
                  onChange={(e) => setInputLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoFocus
                  required
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  표시할 텍스트 (선택 사항)
                </label>
                <input
                  type="text"
                  value={inputLinkText}
                  onChange={(e) => setInputLinkText(e.target.value)}
                  placeholder="비워두면 URL이 그대로 표시됩니다"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 현재 입력된 URL 실시간 미리보기 */}
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                <span className="font-bold text-zinc-700 dark:text-zinc-300">연결: </span>
                {inputLinkUrl ? inputLinkUrl : '주소를 입력해 주세요'}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsLinkModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!inputLinkUrl.trim()}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-40 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>적용</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
