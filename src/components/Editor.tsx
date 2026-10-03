'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Image as ImageIcon,
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useState, useRef } from 'react'

interface EditorProps {
  content: string
  onChange: (html: string) => void
}

export default function Editor({ content, onChange }: EditorProps) {
  const [isUploading, setIsUploading] = useState(false)
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
        class: 'prose prose-invert max-w-none min-h-[300px] p-4 focus:outline-none text-zinc-200',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  if (!editor) return null

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

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-1 p-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('bold') ? 'bg-zinc-800 text-emerald-400' : ''}`}
            title="굵게"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('italic') ? 'bg-zinc-800 text-emerald-400' : ''}`}
            title="기울임"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-800 text-emerald-400' : ''}`}
            title="제목 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('heading', { level: 3 }) ? 'bg-zinc-800 text-emerald-400' : ''}`}
            title="제목 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('bulletList') ? 'bg-zinc-800 text-emerald-400' : ''}`}
            title="글머리 기호"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('orderedList') ? 'bg-zinc-800 text-emerald-400' : ''}`}
            title="번호 매기기"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <ImageIcon className="w-4 h-4 text-emerald-400" />
            )}
            <span>{isUploading ? '업로드 중...' : '이미지 첨부'}</span>
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

      <EditorContent editor={editor} />
    </div>
  )
}
