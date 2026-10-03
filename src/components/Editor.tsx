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
  Highlighter
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useState, useRef } from 'react'

interface EditorProps {
  content: string
  onChange: (html: string) => void
  minHeight?: string
}

export default function Editor({ content, onChange, minHeight = '300px' }: EditorProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [showMoreTools, setShowMoreTools] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // 1. 이미지 업로드 (맨 우측 배치)
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

  // 2. 링크 삽입
  const handleInsertLink = () => {
    const url = prompt('삽입할 링크(URL)를 입력하세요:')
    if (!url) return
    const text = prompt('표시할 텍스트를 입력하세요 (비워두면 URL 그대로 표시):') || url
    editor.chain().focus().insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a> `).run()
  }

  // 3. 서식 헬퍼 함수
  const applyTextColor = (color: string) => {
    editor.chain().focus().insertContent(`<span style="color: ${color};">${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || '색상 텍스트'}</span> `).run()
  }

  const applyHighlightColor = (bgColor: string) => {
    editor.chain().focus().insertContent(`<mark style="background-color: ${bgColor}; padding: 0 4px; border-radius: 2px;">${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || '형광펜 텍스트'}</mark> `).run()
  }

  const applyFontSize = (size: string) => {
    editor.chain().focus().insertContent(`<span style="font-size: ${size};">${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || '텍스트'}</span> `).run()
  }

  const applyFontFamily = (font: string) => {
    editor.chain().focus().insertContent(`<span style="font-family: ${font};">${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || '텍스트'}</span> `).run()
  }

  const applyAlign = (align: string) => {
    editor.chain().focus().insertContent(`<div style="text-align: ${align};">${editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || '정렬된 문단'}</div><p></p>`).run()
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
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden shadow-sm">
      {/* 1열: 가장 자주 쓰는 툴바 + [더보기 토글] + 맨 우측 [이미지 첨부] */}
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

          {/* 인용구 및 목록 */}
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
            onClick={handleInsertLink}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            title="링크 삽입"
          >
            <LinkIcon className="w-4 h-4" />
          </button>

          {/* 더보기 펼치기 토글 버튼 */}
          <button
            type="button"
            onClick={() => setShowMoreTools(!showMoreTools)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition ${
              showMoreTools
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
            }`}
            title="더 많은 서식 도구 보기"
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

      {/* 2열: 펼쳐지는 고급 도구 모음 (글자색, 형광펜, 폰트크기, 정렬, 표 등) */}
      {showMoreTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center gap-2 text-xs animate-in slide-in-from-top-2 duration-150">
          {/* 글꼴 크기 */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-400 font-bold">크기:</span>
            <select
              onChange={(e) => applyFontSize(e.target.value)}
              className="px-1.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 text-xs"
              defaultValue="16px"
            >
              <option value="12px">작게 (12px)</option>
              <option value="14px">보통 (14px)</option>
              <option value="16px">기본 (16px)</option>
              <option value="20px">크게 (20px)</option>
              <option value="26px">아주 크게 (26px)</option>
            </select>
          </div>

          {/* 글꼴 선택 */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-400 font-bold">글꼴:</span>
            <select
              onChange={(e) => applyFontFamily(e.target.value)}
              className="px-1.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 text-xs"
            >
              <option value="sans-serif">기본 고딕</option>
              <option value="serif">명조체 (바탕)</option>
              <option value="monospace">코딩 고정폭</option>
              <option value="cursive">손글씨체</option>
            </select>
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 글자 색상 팔레트 */}
          <div className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <button type="button" onClick={() => applyTextColor('#ef4444')} className="w-4 h-4 rounded-full bg-red-500" title="빨간색" />
            <button type="button" onClick={() => applyTextColor('#3b82f6')} className="w-4 h-4 rounded-full bg-blue-500" title="파란색" />
            <button type="button" onClick={() => applyTextColor('#10b981')} className="w-4 h-4 rounded-full bg-emerald-500" title="초록색" />
            <button type="button" onClick={() => applyTextColor('#f59e0b')} className="w-4 h-4 rounded-full bg-amber-500" title="노란색" />
            <button type="button" onClick={() => applyTextColor('#a855f7')} className="w-4 h-4 rounded-full bg-purple-500" title="보라색" />
          </div>

          {/* 배경 형광펜 팔레트 */}
          <div className="flex items-center gap-1">
            <Highlighter className="w-3.5 h-3.5 text-zinc-400" />
            <button type="button" onClick={() => applyHighlightColor('#fef08a')} className="w-4 h-4 rounded bg-yellow-200 border border-yellow-400" title="노랑 형광펜" />
            <button type="button" onClick={() => applyHighlightColor('#bbf7d0')} className="w-4 h-4 rounded bg-green-200 border border-green-400" title="연두 형광펜" />
            <button type="button" onClick={() => applyHighlightColor('#fed7aa')} className="w-4 h-4 rounded bg-orange-200 border border-orange-400" title="주황 형광펜" />
            <button type="button" onClick={() => applyHighlightColor('#bae6fd')} className="w-4 h-4 rounded bg-sky-200 border border-sky-400" title="하늘 형광펜" />
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 정렬 버튼 모음 */}
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
              title="2x2 표 삽입"
            >
              <TableIcon className="w-3 h-3" />
              <span>2x2 표</span>
            </button>
            <button
              type="button"
              onClick={() => insertTable(3, 3)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-[11px]"
              title="3x3 표 삽입"
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
    </div>
  )
}
