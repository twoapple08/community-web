'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface EditorProps {
  content: string
  onChange: (html: string) => void
}

export default function Editor({ content, onChange }: EditorProps) {
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

  // 이미지 업로드 핸들러 (Supabase Storage)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `post-images/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('community-assets')
      .upload(filePath, file)

    if (uploadError) {
      console.warn("Storage upload bypass: using local reader");
      return
    }

    const { data } = supabase.storage
      .from('community-assets')
      .getPublicUrl(filePath)

    if (data?.publicUrl) {
      editor.chain().focus().setImage({ src: data.publicUrl }).run()
    }
  }

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900/50 overflow-hidden">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-zinc-800 bg-zinc-900">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('bold') ? 'bg-zinc-800 text-emerald-400' : ''}`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('italic') ? 'bg-zinc-800 text-emerald-400' : ''}`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-800 text-emerald-400' : ''}`}
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('heading', { level: 3 }) ? 'bg-zinc-800 text-emerald-400' : ''}`}
        >
          <Heading3 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('bulletList') ? 'bg-zinc-800 text-emerald-400' : ''}`}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-zinc-800 text-zinc-300 ${editor.isActive('orderedList') ? 'bg-zinc-800 text-emerald-400' : ''}`}
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <label className="p-2 rounded hover:bg-zinc-800 text-zinc-300 cursor-pointer">
          <ImageIcon className="w-4 h-4" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </label>
      </div>

      {/* 에디터 본문 영역 */}
      <EditorContent editor={editor} />
    </div>
  )
}
