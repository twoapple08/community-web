'use client'

import { useEditor, EditorContent, Mark, mergeAttributes } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
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

// TipTap 스키마 정제 방지 전용 커스텀 마크 정의
const CustomUnderline = Mark.create({
  name: 'customUnderline',
  parseHTML() {
    return [{ tag: 'u' }, { style: 'text-decoration=underline' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0]
  },
})

const CustomLink = Mark.create({
  name: 'customLink',
  priority: 1000,
  keepOnSplit: false,
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: el => el.getAttribute('href'),
        renderHTML: attrs => ({ href: attrs.href }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'a[href]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { target: '_blank', rel: 'noopener noreferrer', class: 'text-blue-500 underline font-semibold' }), 0]
  },
})

const CustomColor = Mark.create({
  name: 'customColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: el => el.style.color,
        renderHTML: attrs => attrs.color ? { style: `color: ${attrs.color}` } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[style*="color"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

const CustomFontSize = Mark.create({
  name: 'customFontSize',
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: el => el.style.fontSize,
        renderHTML: attrs => attrs.size ? { style: `font-size: ${attrs.size}` } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[style*="font-size"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

const CustomFontFamily = Mark.create({
  name: 'customFontFamily',
  addAttributes() {
    return {
      family: {
        default: null,
        parseHTML: el => el.style.fontFamily,
        renderHTML: attrs => attrs.family ? { style: `font-family: ${attrs.family}` } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[style*="font-family"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

const CustomHighlight = Mark.create({
  name: 'customHighlight',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: el => el.style.backgroundColor,
        renderHTML: attrs => attrs.color ? { style: `background-color: ${attrs.color}; padding: 0 4px; border-radius: 2px;` } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'mark' }, { tag: 'span[style*="background-color"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0]
  },
})

interface EditorProps {
  content: string
  onChange: (html: string) => void
  minHeight?: string
}

const PRESET_FONT_SIZES = ['11px', '13px', '16px', '19px', '24px', '30px', '36px']
const FONT_FAMILIES = [
  { label: '맑은 고딕 (기본)', value: "'Malgun Gothic', sans-serif" },
  { label: '나눔고딕', value: "'Nanum Gothic', sans-serif" },
  { label: '바탕체 (명조)', value: "'Batang', serif" },
  { label: '궁서체', value: "'Gungsuh', cursive" },
  { label: '고정폭 (코딩용)', value: "monospace" },
  { label: 'Arial', value: "Arial, sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
]

export default function Editor({ content, onChange, minHeight = '300px' }: EditorProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [showMoreTools, setShowMoreTools] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 링크 모달 상태
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [inputLinkUrl, setInputLinkUrl] = useState('')
  const [inputLinkText, setInputLinkText] = useState('')

  // 폰트 및 크기 팝업 상태
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false)
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: true }),
      CustomUnderline,
      CustomLink,
      CustomColor,
      CustomFontSize,
      CustomFontFamily,
      CustomHighlight,
    ],
    content,
    editorProps: {
      attributes: {
        class: `prose prose-zinc dark:prose-invert max-w-none p-4 focus:outline-none text-zinc-800 dark:text-zinc-200 min-h-[${minHeight}] leading-relaxed`,
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

  // 링크 삽입 모달 오픈
  const handleOpenLinkModal = () => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    setInputLinkText(selected || '')
    setInputLinkUrl('')
    setIsLinkModalOpen(true)
  }

  // 링크 삽입 확정
  const handleApplyLink = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputLinkUrl.trim()) return

    let finalUrl = inputLinkUrl.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    const displayText = inputLinkText.trim() || finalUrl

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${finalUrl}" target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    } else {
      editor.chain().focus().setMark('customLink', { href: finalUrl }).run()
    }

    setIsLinkModalOpen(false)
    setInputLinkUrl('')
    setInputLinkText('')
  }

  // 글자색 적용
  const handleSetColor = (color: string) => {
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<span style="color: ${color};">색상</span> `).run()
    } else {
      editor.chain().focus().setMark('customColor', { color }).run()
    }
  }

  // 형광펜 적용
  const handleSetHighlight = (color: string) => {
    if (color === 'clear') {
      editor.chain().focus().unsetMark('customHighlight').run()
      return
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<mark style="background-color: ${color}; padding: 0 4px; border-radius: 2px;">형광펜</mark> `).run()
    } else {
      editor.chain().focus().setMark('customHighlight', { color }).run()
    }
  }

  // 폰트 크기 적용
  const handleSetFontSize = (sizeStr: string) => {
    let clean = sizeStr.trim()
    if (!clean.endsWith('px') && !clean.endsWith('pt') && !clean.endsWith('rem')) {
      clean += 'px'
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<span style="font-size: ${clean};">텍스트</span> `).run()
    } else {
      editor.chain().focus().setMark('customFontSize', { size: clean }).run()
    }
    setIsSizeDropdownOpen(false)
    setCustomSizeInput('')
  }

  // 글꼴 패밀리 적용
  const handleSetFontFamily = (family: string) => {
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<span style="font-family: ${family};">글꼴</span> `).run()
    } else {
      editor.chain().focus().setMark('customFontFamily', { family }).run()
    }
    setIsFontDropdownOpen(false)
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

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 overflow-visible shadow-sm relative">
      {/* 1열 기본 툴바 */}
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
            onClick={() => editor.chain().focus().toggleMark('customUnderline').run()}
            className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('customUnderline') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400' : ''}`}
            title="밑줄"
          >
            <UnderlineIcon className="w-4 h-4" />
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

      {/* 2열 고급 도구 모음 (아카라이브 방식) */}
      {showMoreTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center gap-2 text-xs relative z-20 animate-in slide-in-from-top-2 duration-150">
          {/* 글꼴 드롭다운 팝업 */}
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
              <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 z-30 max-h-56 overflow-y-auto">
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => handleSetFontFamily(f.value)}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 block truncate"
                    style={{ fontFamily: f.value }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 글자 크기 드롭다운 팝업 (직접 입력란 포함) */}
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
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-2.5 z-30 space-y-2">
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold block mb-1">직접 입력 (px 단위)</span>
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
                      onClick={() => customSizeInput && handleSetFontSize(customSizeInput)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold shrink-0 transition"
                    >
                      적용
                    </button>
                  </div>
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 space-y-0.5">
                  <span className="text-[10px] text-zinc-400 font-bold block mb-1">프리셋 선택</span>
                  {PRESET_FONT_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => handleSetFontSize(sz)}
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

          {/* 글자 색상 팔레트 */}
          <div className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button type="button" onClick={() => handleSetColor('#ef4444')} className="w-4 h-4 rounded-full bg-red-500 border border-red-600" title="빨간색" />
            <button type="button" onClick={() => handleSetColor('#f97316')} className="w-4 h-4 rounded-full bg-orange-500 border border-orange-600" title="주황색" />
            <button type="button" onClick={() => handleSetColor('#eab308')} className="w-4 h-4 rounded-full bg-yellow-500 border border-yellow-600" title="노란색" />
            <button type="button" onClick={() => handleSetColor('#10b981')} className="w-4 h-4 rounded-full bg-emerald-500 border border-emerald-600" title="초록색" />
            <button type="button" onClick={() => handleSetColor('#06b6d4')} className="w-4 h-4 rounded-full bg-cyan-500 border border-cyan-600" title="하늘색" />
            <button type="button" onClick={() => handleSetColor('#3b82f6')} className="w-4 h-4 rounded-full bg-blue-500 border border-blue-600" title="파란색" />
            <button type="button" onClick={() => handleSetColor('#a855f7')} className="w-4 h-4 rounded-full bg-purple-500 border border-purple-600" title="보라색" />
            <button type="button" onClick={() => handleSetColor('#71717a')} className="w-4 h-4 rounded-full bg-zinc-500 border border-zinc-600" title="회색" />
          </div>

          {/* 형광펜 팔레트 */}
          <div className="flex items-center gap-1">
            <Highlighter className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button type="button" onClick={() => handleSetHighlight('#fef08a')} className="w-4 h-4 rounded bg-yellow-200 border border-yellow-400" title="노랑 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#bbf7d0')} className="w-4 h-4 rounded bg-green-200 border border-green-400" title="연두 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#fed7aa')} className="w-4 h-4 rounded bg-orange-200 border border-orange-400" title="주황 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#bae6fd')} className="w-4 h-4 rounded bg-sky-200 border border-sky-400" title="하늘 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#fbcfe8')} className="w-4 h-4 rounded bg-pink-200 border border-pink-400" title="분홍 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('clear')} className="px-1 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 border border-zinc-300 dark:border-zinc-700 rounded" title="형광펜 지우기">지움</button>
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
            <button type="button" onClick={() => editor.chain().focus().insertContent('★ ').run()} className="hover:text-emerald-500 font-bold">★</button>
            <button type="button" onClick={() => editor.chain().focus().insertContent('♥ ').run()} className="hover:text-emerald-500 font-bold">♥</button>
            <button type="button" onClick={() => editor.chain().focus().insertContent('◆ ').run()} className="hover:text-emerald-500 font-bold">◆</button>
            <button type="button" onClick={() => editor.chain().focus().insertContent('→ ').run()} className="hover:text-emerald-500 font-bold">→</button>
            <button type="button" onClick={() => editor.chain().focus().insertContent('※ ').run()} className="hover:text-emerald-500 font-bold">※</button>
          </div>
        </div>
      )}

      {/* 본문 에디터 내용 영역 */}
      <EditorContent editor={editor} />

      {/* 링크 삽입 커스텀 팝업 (실시간 입력 상태 표시창 포함) */}
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

              {/* 실시간 입력 상태 안내창 */}
              <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl text-xs space-y-1 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center gap-1 font-bold text-zinc-700 dark:text-zinc-300">
                  <span>입력 확인:</span>
                  {inputLinkUrl.trim() ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-0.5">
                      <Check className="w-3.5 h-3.5" /> 정상 입력됨
                    </span>
                  ) : (
                    <span className="text-amber-500">주소를 입력해 주세요</span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  연결: {inputLinkUrl.trim() || '입력 대기 중...'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  표시명: {inputLinkText.trim() || inputLinkUrl.trim() || '(URL 주소로 표시)'}
                </p>
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
