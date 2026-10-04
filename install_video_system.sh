#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 동영상 첨부 및 아카라이브식 플레이어 시스템 구축"
echo "=========================================================="

# 1. 동영상 첫 프레임 캡처 유틸리티 (src/lib/videoUtils.ts)
cat << 'FILE_VIDEO_UTILS' > src/lib/videoUtils.ts
export async function captureVideoFirstFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    // 첫 프레임 디코딩을 위해 0.05초 시점으로 이동
    video.onloadedmetadata = () => {
      video.currentTime = 0.05;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          }, 'image/jpeg', 0.85);
        } else {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}
FILE_VIDEO_UTILS

# 2. 에디터 컴포넌트 (Editor.tsx) - 동영상 업로드 버튼 및 TipTap 비디오 노드 탑재
cat << 'FILE_EDITOR' > src/components/Editor.tsx
'use client'

import { useEditor, EditorContent, Mark, Node, mergeAttributes } from '@tiptap/react'
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
  Check,
  AlertCircle
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

// 아카라이브 스타일 직각 동영상 노드
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
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [showMoreTools, setShowMoreTools] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [inputLinkUrl, setInputLinkUrl] = useState('')
  const [inputLinkText, setInputLinkText] = useState('')

  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false)
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')

  const [popup, setPopup] = useState<{ show: boolean; title: string; message: string }>({
    show: false,
    title: '',
    message: '',
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: true }),
      CustomVideo,
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

  // 이미지 단독 업로드 핸들러
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

  // 동영상 단독 업로드 핸들러 (최대 1GB 제한 + 첫 프레임 썸네일 자동 캡처)
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 1GB (1024MB) 초과 검사
    const maxSizeBytes = 1024 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setPopup({
        show: true,
        title: '용량 초과',
        message: '동영상 파일 크기는 최대 1GB(1024MB)까지 첨부할 수 있습니다.',
      })
      if (videoInputRef.current) videoInputRef.current.value = ''
      return
    }

    setIsUploadingVideo(true)
    setUploadProgressText('썸네일 생성 및 업로드 중...')

    try {
      // 1) 동영상 첫 프레임 캡처
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

      // 2) 동영상 본체 업로드 (post-videos 전용 버킷)
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
          // TipTap 에디터에 아카라이브형 비디오 태그 삽입
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

    const displayText = detectedEmbedType ? finalUrl : (inputLinkText.trim() || finalUrl)

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${finalUrl}" target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    } else {
      editor.chain().focus().setMark('customLink', { href: finalUrl }).run()
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
      editor.chain().focus().insertContent(`<mark style="background-color: ${color}; padding: 0 4px; border-radius: 2px;">형광펜</mark> `).run()
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
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-none bg-zinc-50/50 dark:bg-zinc-900/50 overflow-visible shadow-sm relative">
      <div className="flex items-center justify-between gap-1 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500 font-bold' : ''}`}
            title="굵게"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="기울임"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleMark('customUnderline').run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('customUnderline') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="밑줄"
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('strike') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="취소선"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ${editor.isActive('blockquote') ? 'bg-zinc-200 dark:bg-zinc-800 text-emerald-500' : ''}`}
            title="인용구"
          >
            <Quote className="w-4 h-4" />
          </button>
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
            onClick={handleOpenLinkModal}
            className="p-1.5 rounded-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            title="링크 삽입"
          >
            <LinkIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowMoreTools(!showMoreTools)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-none text-xs font-semibold border transition ${
              showMoreTools
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-500'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-400'
            }`}
          >
            <span>도구 더보기</span>
            {showMoreTools ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* 미디어 업로드 분리 버튼 (이미지 / 동영상) */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* 1. 이미지 첨부 버튼 */}
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

          {/* 2. 동영상 첨부 버튼 (최대 1GB 지원) */}
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={isUploading || isUploadingVideo}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-none text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50 shadow-sm"
            title="동영상 첨부 (최대 1GB, 첫 프레임 자동 썸네일)"
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

      {showMoreTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-wrap items-center gap-2 text-xs relative z-20">
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
              <span>글꼴</span>
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

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsSizeDropdownOpen(!isSizeDropdownOpen)
                setIsFontDropdownOpen(false)
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs font-medium"
            >
              <span>크기</span>
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

          <div className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button type="button" onClick={() => handleSetColor('#ef4444')} className="w-4 h-4 bg-red-500" title="빨간색" />
            <button type="button" onClick={() => handleSetColor('#f97316')} className="w-4 h-4 bg-orange-500" title="주황색" />
            <button type="button" onClick={() => handleSetColor('#eab308')} className="w-4 h-4 bg-yellow-500" title="노란색" />
            <button type="button" onClick={() => handleSetColor('#10b981')} className="w-4 h-4 bg-emerald-500" title="초록색" />
            <button type="button" onClick={() => handleSetColor('#3b82f6')} className="w-4 h-4 bg-blue-500" title="파란색" />
            <button type="button" onClick={() => handleSetColor('#71717a')} className="w-4 h-4 bg-zinc-500" title="회색" />
          </div>

          <div className="flex items-center gap-1">
            <Highlighter className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button type="button" onClick={() => handleSetHighlight('#fef08a')} className="w-4 h-4 bg-yellow-200 border border-yellow-400" title="노랑 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#bbf7d0')} className="w-4 h-4 bg-green-200 border border-green-400" title="연두 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('#bae6fd')} className="w-4 h-4 bg-sky-200 border border-sky-400" title="하늘 형광펜" />
            <button type="button" onClick={() => handleSetHighlight('clear')} className="px-1 text-[10px] border" title="형광펜 지우기">지움</button>
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          <button
            type="button"
            onClick={() => insertTable(2, 2)}
            className="px-1.5 py-0.5 border text-[11px]"
            title="2x2 표"
          >
            <TableIcon className="w-3 h-3 inline mr-1" />
            <span>2x2 표</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1 border"
            title="구분선"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="p-1 border"
            title="코드 블록"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <EditorContent editor={editor} />

      {/* 링크 모달 */}
      {isLinkModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
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
              <input
                type="text"
                value={inputLinkUrl}
                onChange={(e) => setInputLinkUrl(e.target.value)}
                placeholder="https://example.com"
                required
                className="w-full px-3 py-2 text-xs bg-zinc-800 border rounded-none font-mono text-white"
              />
              <input
                type="text"
                value={inputLinkText}
                onChange={(e) => setInputLinkText(e.target.value)}
                placeholder="표시할 텍스트 (선택)"
                className="w-full px-3 py-2 text-xs bg-zinc-800 border rounded-none text-white"
              />
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setIsLinkModalOpen(false)} className="px-3 py-1.5 border text-xs">취소</button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold">적용</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CustomPopup
        isOpen={popup.show}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup({ show: false, title: '', message: '' })}
      />
    </div>
  )
}
FILE_EDITOR

# 3. write/page.tsx: 동영상 첫 프레임(poster) 자동 감지 및 썸네일 우선 등록
cat << 'FILE_PATCH_WRITE' > patch_write_media.py
with open("src/app/write/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

old_detected = """  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map(
    (m) => m[1]
  );

  useEffect(() => {
    if (detectedImages.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(detectedImages[0]);
    }
  }, [content]);"""

new_detected = """  // 이미지 src 및 비디오 첫 프레임 poster 동시 추출
  const detectedImages: string[] = Array.from(content.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)).map((m) => m[1]);
  const detectedPosters: string[] = Array.from(content.matchAll(/<video[^>]+poster=['"]([^'"]+)['"]/gi)).map((m) => m[1]);
  const allDetectedMedia = Array.from(new Set([...detectedImages, ...detectedPosters]));

  useEffect(() => {
    if (allDetectedMedia.length > 0 && !selectedThumbnail) {
      setSelectedThumbnail(allDetectedMedia[0]);
    }
  }, [content]);"""

if old_detected in content:
    content = content.replace(old_detected, new_detected)

# detectedImages.length > 0 바인딩 교체
content = content.replace("detectedImages.length > 0", "allDetectedMedia.length > 0")
content = content.replace("detectedImages.map", "allDetectedMedia.map")
content = content.replace("(detectedImages.length > 0 ? detectedImages[0] : null)", "(allDetectedMedia.length > 0 ? allDetectedMedia[0] : null)")

with open("src/app/write/page.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("write/page.tsx video poster thumbnail logic successfully updated")
FILE_PATCH_WRITE
python3 patch_write_media.py || true
rm -f patch_write_media.py

# 4. 피드 목록 썸네일 추출에 poster fallback 추가 (clan & community)
cat << 'FILE_PATCH_FEEDS' > patch_feed_posters.py
def patch_feed(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        code = f.read()
    
    old_extract = """const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
};"""

    new_extract = """const extractFirstImage = (html: string): string | null => {
  if (!html) return null;
  const imgMatch = html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
  if (imgMatch) return imgMatch[1];
  const posterMatch = html.match(/<video[^>]+poster=['"]([^'"]+)['"]/i);
  if (posterMatch) return posterMatch[1];
  return null;
};"""

    if old_extract in code:
        code = code.replace(old_extract, new_extract)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"{file_path} patched with video poster fallback")

patch_feed("src/app/clan/page.tsx")
patch_feed("src/app/community/page.tsx")
FILE_PATCH_FEEDS
python3 patch_feed_posters.py || true
rm -f patch_feed_posters.py

echo "--> 소스코드 정비 완료. 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 에러 없음! Git 실서버(Vercel) 배포를 시작합니다."
echo "=========================================================="

git add .
git commit -m "feat: 동영상 전용 버킷 분리, 최대 1GB 지원, 첫프레임 썸네일 자동 캡처 및 아카라이브 플레이어 구현"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
