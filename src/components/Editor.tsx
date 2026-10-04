'use client'

import { useEditor, EditorContent, Mark, Node, mergeAttributes } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TextAlign } from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'

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
  Video as VideoIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  Table as TableIcon,
  Code,
  Minus,
  Sparkles,
  Palette,
  Highlighter,
  Type,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Indent,
  Outdent,
  Plus,
  Trash2,
  Split,
  Maximize2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useState, useRef, useMemo } from 'react'
import { captureVideoFirstFrame } from '@/lib/videoUtils'
import CustomPopup from './CustomPopup'

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

const CustomVideo = Node.create({
  name: 'customVideo',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      poster: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: 'video[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        playsinline: 'true',
        preload: 'metadata',
        class: 'w-full max-h-[620px] my-3 bg-black rounded-none border border-zinc-300 dark:border-zinc-800 object-contain shadow-sm',
      }),
    ]
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
        renderHTML: attrs => attrs.color ? { style: `background-color: ${attrs.color}; padding: 0 4px;` } : {},
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

const PRESET_FONT_SIZES = ['11px', '13px', '15px', '16px', '18px', '20px', '24px', '28px', '32px', '36px']
const FONT_FAMILIES = [
  { label: '맑은 고딕 (기본)', value: "'Malgun Gothic', sans-serif" },
  { label: '나눔고딕', value: "'Nanum Gothic', sans-serif" },
  { label: '바탕체 (명조)', value: "'Batang', serif" },
  { label: '궁서체', value: "'Gungsuh', cursive" },
  { label: '프리텐다드', value: "'Pretendard', sans-serif" },
  { label: '고정폭 (코딩)', value: "monospace" },
  { label: 'Arial', value: "Arial, sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
]

const SPECIAL_SYMBOLS = [
  '★', '☆', '♥', '♡', '◆', '◇', '■', '□', '▲', '△', '▼', '▽',
  '→', '←', '↑', '↓', '↔', '※', '♨', '♬', '♪', '♠', '♣', '☎',
  '☞', '☜', '㈜', '™', 'ⓒ', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'
]

export default function Editor({ content, onChange, minHeight = '320px' }: EditorProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [showMoreTools, setShowMoreTools] = useState(false)
  const [showTableTools, setShowTableTools] = useState(false)
  const [showSymbolModal, setShowSymbolModal] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [inputLinkUrl, setInputLinkUrl] = useState('')
  const [inputLinkText, setInputLinkText] = useState('')
  const [fetchingTitle, setFetchingTitle] = useState(false)

  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false)
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')
  const [customColorInput, setCustomColorInput] = useState('#ffffff')

  const [videoNoticePopup, setVideoNoticePopup] = useState(false)
  const [popup, setPopup] = useState<{ show: boolean; title: string; message: string }>({
    show: false,
    title: '',
    message: '',
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Image.configure({ inline: true }),
      CustomVideo,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
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

  const detectedEmbedType = useMemo(() => {
    const url = inputLinkUrl.trim().toLowerCase();
    if (/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)/.test(url)) return 'youtube';
    if (/open\.kakao\.com\/[a-z0-9_\/]+/i.test(url)) return 'kakaotalk';
    if (/(?:discord\.gg|discord\.com\/invite)\/[a-z0-9-]+/i.test(url)) return 'discord';
    return null;
  }, [inputLinkUrl]);

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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 동영상 업로드 (50MB 안내 후 실행)
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const maxSizeBytes = 50 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setPopup({
        show: true,
        title: '용량 초과 안내',
        message: '현재 동영상 파일은 최대 50MB까지만 업로드할 수 있습니다.\n(긴 영상이나 대용량은 상단 링크 도구의 YouTube 링크를 이용해 주시기 바랍니다)',
      })
      if (videoInputRef.current) videoInputRef.current.value = ''
      return
    }

    setIsUploadingVideo(true)
    setUploadProgressText('썸네일 생성 및 업로드 중...')

    try {
      const thumbBlob = await captureVideoFirstFrame(file)
      let posterUrl: string | null = null

      if (thumbBlob) {
        const thumbName = `thumb-${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`
        const { error: thumbErr } = await supabase.storage.from('posts').upload(thumbName, thumbBlob, { contentType: 'image/jpeg' })
        if (!thumbErr) {
          const { data } = supabase.storage.from('posts').getPublicUrl(thumbName)
          if (data?.publicUrl) posterUrl = data.publicUrl
        }
      }

      setUploadProgressText('동영상 서버 전송 중...')
      const videoExt = file.name.split('.').pop() || 'mp4'
      const videoFileName = `vid-${Date.now()}-${Math.random().toString(36).substring(2)}.${videoExt}`

      const { error: videoErr } = await supabase.storage.from('post-videos').upload(videoFileName, file, {
        contentType: file.type || 'video/mp4',
      })

      if (videoErr) {
        setPopup({
          show: true,
          title: '업로드 실패',
          message: `동영상 업로드 실패: ${videoErr.message}`,
        })
      } else {
        const { data } = supabase.storage.from('post-videos').getPublicUrl(videoFileName)
        const videoUrl = data?.publicUrl

        if (videoUrl) {
          const posterAttr = posterUrl ? ` poster="${posterUrl}"` : ''
          const videoHtml = `<video src="${videoUrl}"${posterAttr} controls playsinline preload="metadata" class="w-full max-h-[620px] my-3 bg-black rounded-none border border-zinc-300 dark:border-zinc-800 object-contain shadow-sm"></video><p></p>`
          editor.chain().focus().insertContent(videoHtml).run()
          onChange(editor.getHTML())
        }
      }
    } catch (err: any) {
      setPopup({
        show: true,
        title: '오류 발생',
        message: `처리 도중 오류가 발생했습니다: ${err.message}`,
      })
    }

    setIsUploadingVideo(false)
    setUploadProgressText('')
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  const fetchAutoTitle = async (url: string) => {
    if (!url.startsWith('http')) return
    setFetchingTitle(true)
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (data?.title) {
        setInputLinkText(data.title)
      }
    } catch {}
    setFetchingTitle(false)
  }

  const handleOpenLinkModal = () => {
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    setInputLinkText(selected || '')
    setInputLinkUrl('')
    setIsLinkModalOpen(true)
  }

  const handleApplyLink = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputLinkUrl.trim()) return

    let finalUrl = inputLinkUrl.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    const titleAttr = inputLinkText.trim() ? ` data-embed-title="${inputLinkText.trim().replace(/"/g, '&quot;')}"` : ''
    const displayText = inputLinkText.trim() || finalUrl

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${finalUrl}"${titleAttr} target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    } else {
      editor.chain().focus().insertContent(`<a href="${finalUrl}"${titleAttr} target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    }

    setIsLinkModalOpen(false)
    setInputLinkUrl('')
    setInputLinkText('')
  }

  const handleSetColor = (color: string) => {
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<span style="color: ${color};">색상</span> `).run()
    } else {
      editor.chain().focus().setMark('customColor', { color }).run()
    }
  }

  const handleSetHighlight = (color: string) => {
    if (color === 'clear') {
      editor.chain().focus().unsetMark('customHighlight').run()
      return
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<mark style="background-color: ${color}; padding: 0 4px;">형광펜</mark> `).run()
    } else {
      editor.chain().focus().setMark('customHighlight', { color }).run()
    }
  }

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

  const handleSetFontFamily = (family: string) => {
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<span style="font-family: ${family};">글꼴</span> `).run()
    } else {
      editor.chain().focus().setMark('customFontFamily', { family }).run()
    }
    setIsFontDropdownOpen(false)
  }

  // 들여쓰기 / 내어쓰기 함수
  const handleIndent = (direction: 'in' | 'out') => {
    const padding = direction === 'in' ? '24px' : '0px';
    editor.chain().focus().command(({ tr, state }) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph') {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            style: direction === 'in' ? 'padding-left: 24px;' : '',
          });
        }
      });
      return true;
    }).run();
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-none bg-zinc-50/50 dark:bg-zinc-900/50 overflow-visible shadow-sm relative">
      {/* 주 툴바 영역 */}
      <div className="flex items-center justify-between gap-1 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {/* 볼드, 이탤릭, 밑줄, 취소선 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500 font-bold' : ''}`}
            title="볼드체 (Bold)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="이탤릭체 (Italic)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleMark('customUnderline').run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('customUnderline') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="언더라인 (Underline)"
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('strike') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="취소선 (Strikethrough)"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

          {/* 텍스트 정렬 (왼쪽, 가운데, 오른쪽, 양쪽 맞춤) */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive({ textAlign: 'left' }) ? 'bg-zinc-200 dark:bg-zinc-800 text-blue-500' : ''}`}
            title="왼쪽 맞춤"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive({ textAlign: 'center' }) ? 'bg-zinc-200 dark:bg-zinc-800 text-blue-500' : ''}`}
            title="가운데 맞춤"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive({ textAlign: 'right' }) ? 'bg-zinc-200 dark:bg-zinc-800 text-blue-500' : ''}`}
            title="오른쪽 맞춤"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive({ textAlign: 'justify' }) ? 'bg-zinc-200 dark:bg-zinc-800 text-blue-500' : ''}`}
            title="양쪽 맞춤"
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

          {/* 들여쓰기 / 내어쓰기 */}
          <button
            type="button"
            onClick={() => handleIndent('out')}
            className="p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            title="내어쓰기"
          >
            <Outdent className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleIndent('in')}
            className="p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            title="들여쓰기"
          >
            <Indent className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

          {/* 글머리 기호, 번호 매기기, 인용구 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="글머리 기호"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('orderedList') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="번호 매기기"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('blockquote') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="인용구"
          >
            <Quote className="w-4 h-4" />
          </button>

          {/* 기호/특수문자 */}
          <button
            type="button"
            onClick={() => setShowSymbolModal(true)}
            className="p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs"
            title="기호 및 특수문자"
          >
            Ω 기호
          </button>

          {/* 링크 */}
          <button
            type="button"
            onClick={handleOpenLinkModal}
            className="p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            title="링크 삽입"
          >
            <LinkIcon className="w-4 h-4" />
          </button>

          {/* 표 제어 툴바 토글 */}
          <button
            type="button"
            onClick={() => setShowTableTools(!showTableTools)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-none text-xs font-semibold border transition ${
              showTableTools || editor.isActive('table')
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
            }`}
            title="표(Table) 상세 관리"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>표 도구</span>
          </button>

          {/* 서식 더보기 */}
          <button
            type="button"
            onClick={() => setShowMoreTools(!showMoreTools)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-none text-xs font-semibold border transition ${
              showMoreTools
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-500'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-400'
            }`}
          >
            <span>글꼴/서식</span>
            {showMoreTools ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* 미디어 첨부 버튼 (이미지 / 동영상) */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isUploadingVideo}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-none text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-50 border border-zinc-700"
            title="이미지 파일 첨부"
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
            <span>{isUploading ? '업로드...' : '이미지'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          <button
            type="button"
            onClick={() => setVideoNoticePopup(true)}
            disabled={isUploading || isUploadingVideo}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-none text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50 shadow-sm"
            title="동영상 첨부 (현재 최대 50MB 가능)"
          >
            {isUploadingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VideoIcon className="w-3.5 h-3.5" />}
            <span>{isUploadingVideo ? (uploadProgressText || '전송 중...') : '동영상'}</span>
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleVideoUpload}
          />
        </div>
      </div>

      {/* 3번 이미지 기준: 표(Table) 전용 고기능 서식 바 */}
      {showTableTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-blue-50/50 dark:bg-blue-950/20 flex flex-wrap items-center gap-1.5 text-xs animate-in slide-in-from-top-1 duration-150">
          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mr-1">표 편집:</span>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-none text-[11px] font-bold text-blue-600 hover:bg-blue-100"
          >
            표 생성 (3x3)
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

          {/* 행 조작 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100"
            title="표 행 추가 (위)"
          >
            행 추가 (위)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100"
            title="표 행 추가 (아래)"
          >
            행 추가 (아래)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-2 py-1 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 rounded-none text-[11px] hover:bg-red-100"
            title="표 행 삭제"
          >
            행 삭제
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

          {/* 열 조작 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100"
            title="표 열 추가 (좌측)"
          >
            열 추가 (좌)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100"
            title="표 열 추가 (우측)"
          >
            열 추가 (우)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-2 py-1 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 rounded-none text-[11px] hover:bg-red-100"
            title="표 열 삭제"
          >
            열 삭제
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

          {/* 병합 및 분할 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().mergeCells().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100"
            title="표 셀 병합"
          >
            셀 병합
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().splitCell().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100"
            title="표 셀 분할"
          >
            셀 분할
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="ml-auto px-2 py-1 border border-red-500 bg-red-600 text-white rounded-none text-[11px] font-bold hover:bg-red-700"
            title="표 전체 삭제"
          >
            표 삭제
          </button>
        </div>
      )}

      {/* 글꼴, 크기, 색상, 하이라이트 서식 바 */}
      {showMoreTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center gap-2 text-xs relative z-20">
          {/* 글꼴 선택 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsFontDropdownOpen(!isFontDropdownOpen)
                setIsSizeDropdownOpen(false)
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs font-medium"
            >
              <Type className="w-3.5 h-3.5 text-zinc-400" />
              <span>글꼴선택</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isFontDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none shadow-xl py-1 z-30 max-h-56 overflow-y-auto">
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

          {/* 글꼴 크기 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsSizeDropdownOpen(!isSizeDropdownOpen)
                setIsFontDropdownOpen(false)
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs font-medium"
            >
              <span>글꼴크기</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isSizeDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none shadow-xl p-2.5 z-30 space-y-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="예: 20"
                    value={customSizeInput}
                    onChange={(e) => setCustomSizeInput(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border rounded-none"
                  />
                  <button
                    type="button"
                    onClick={() => customSizeInput && handleSetFontSize(customSizeInput)}
                    className="px-2.5 py-1 bg-emerald-600 text-white rounded-none text-xs font-bold shrink-0"
                  >
                    적용
                  </button>
                </div>
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 space-y-0.5">
                  {PRESET_FONT_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => handleSetFontSize(sz)}
                      className="w-full px-2 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-none"
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
            <button type="button" onClick={() => handleSetColor('#ffffff')} className="w-4 h-4 bg-white border border-zinc-400" title="흰색" />
            <button type="button" onClick={() => handleSetColor('#ef4444')} className="w-4 h-4 bg-red-500" title="빨간색" />
            <button type="button" onClick={() => handleSetColor('#f97316')} className="w-4 h-4 bg-orange-500" title="주황색" />
            <button type="button" onClick={() => handleSetColor('#eab308')} className="w-4 h-4 bg-yellow-500" title="노란색" />
            <button type="button" onClick={() => handleSetColor('#10b981')} className="w-4 h-4 bg-emerald-500" title="초록색" />
            <button type="button" onClick={() => handleSetColor('#3b82f6')} className="w-4 h-4 bg-blue-500" title="파란색" />
            <button type="button" onClick={() => handleSetColor('#a855f7')} className="w-4 h-4 bg-purple-500" title="보라색" />
            <button type="button" onClick={() => handleSetColor('#71717a')} className="w-4 h-4 bg-zinc-500" title="회색" />
            <input
              type="color"
              value={customColorInput}
              onChange={(e) => {
                setCustomColorInput(e.target.value)
                handleSetColor(e.target.value)
              }}
              className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent"
              title="커스텀 색상 선택"
            />
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 배경색상 / 하이라이트 */}
          <div className="flex items-center gap-1">
            <Highlighter className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button type="button" onClick={() => handleSetHighlight('#fef08a')} className="w-4 h-4 bg-yellow-200 border border-yellow-400" title="노랑 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#bbf7d0')} className="w-4 h-4 bg-green-200 border border-green-400" title="연두 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#fed7aa')} className="w-4 h-4 bg-orange-200 border border-orange-400" title="주황 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#bae6fd')} className="w-4 h-4 bg-sky-200 border border-sky-400" title="하늘 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#fbcfe8')} className="w-4 h-4 bg-pink-200 border border-pink-400" title="분홍 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('clear')} className="px-1 text-[10px] border border-zinc-400" title="형광펜 지우기">지움</button>
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 구분선 및 코드블록 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1 border border-zinc-300 dark:border-zinc-700 rounded-none text-zinc-600 dark:text-zinc-300"
            title="구분선 삽입"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="p-1 border border-zinc-300 dark:border-zinc-700 rounded-none text-zinc-600 dark:text-zinc-300"
            title="코드 블록"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 본문 에디터 내용 영역 */}
      <EditorContent editor={editor} />

      {/* 기호 / 특수문자 모달 */}
      {showSymbolModal && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowSymbolModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-950 border-2 border-zinc-900 dark:border-white p-5 rounded-none shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-black">특수 기호 선택</h3>
              <button type="button" onClick={() => setShowSymbolModal(false)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1 max-h-60 overflow-y-auto p-1">
              {SPECIAL_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => {
                    editor.chain().focus().insertContent(`${sym} `).run();
                    setShowSymbolModal(false);
                  }}
                  className="h-9 flex items-center justify-center border hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm font-bold"
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 링크 모달 */}
      {isLinkModalOpen && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setIsLinkModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border rounded-none p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">링크 삽입</h3>
              <button type="button" onClick={() => setIsLinkModalOpen(false)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyLink} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">링크 URL</label>
                <input
                  type="text"
                  value={inputLinkUrl}
                  onChange={(e) => {
                    const val = e.target.value
                    setInputLinkUrl(val)
                    if (val.startsWith('http')) fetchAutoTitle(val)
                  }}
                  onBlur={() => {
                    if (inputLinkUrl.startsWith('http') && !inputLinkText) fetchAutoTitle(inputLinkUrl)
                  }}
                  placeholder="https://example.com"
                  required
                  className="w-full px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-none font-mono text-zinc-900 dark:text-white"
                />
              </div>

              {detectedEmbedType && (
                <div className="p-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-400/50 rounded-none text-[11px] text-blue-600 dark:text-blue-400 leading-snug">
                  ℹ️ {detectedEmbedType === 'youtube' ? 'YouTube 영상' : detectedEmbedType === 'discord' ? 'Discord 서버 초대' : '카카오톡 오픈채팅'} 링크는 전용 임베드 카드로 표시됩니다.
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                  {detectedEmbedType === 'discord' ? '서버 이름 (자동 또는 직접 입력)' : detectedEmbedType === 'kakaotalk' ? '오픈채팅방 이름 (자동 또는 직접 입력)' : '표시할 텍스트 (선택)'}
                  {fetchingTitle && <span className="ml-2 text-blue-500 animate-pulse text-[10px]">정보 가져오는 중...</span>}
                </label>
                <input
                  type="text"
                  value={inputLinkText}
                  onChange={(e) => setInputLinkText(e.target.value)}
                  placeholder={detectedEmbedType === 'discord' ? '디스코드 서버 이름' : detectedEmbedType === 'kakaotalk' ? '카카오톡 오픈채팅방 이름' : '표시할 텍스트'}
                  className="w-full px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setIsLinkModalOpen(false)} className="px-3 py-1.5 border text-xs">취소</button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold">적용</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 동영상 업로드 사전 안내 팝업 (50MB 제한) */}
      <CustomPopup
        isOpen={videoNoticePopup}
        type="confirm"
        title="동영상 첨부 용량 안내"
        message={"현재 동영상 업로드는 파일당 최대 50MB까지만 가능합니다.\n\n긴 영상이나 고용량 영상은 상단 링크 도구(사슬 모양)를 통해 YouTube 링크를 등록해 주시기 바랍니다."}
        confirmText="파일 선택"
        cancelText="취소"
        onConfirm={() => {
          setVideoNoticePopup(false)
          videoInputRef.current?.click()
        }}
        onCancel={() => setVideoNoticePopup(false)}
      />

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup({ show: false, title: '', message: '' })}
      />
    </div>
  )
}
