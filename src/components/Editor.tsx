'use client'

import { useEditor, EditorContent, Extension, Mark, Node, mergeAttributes } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
  HelpCircle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useState, useRef, useMemo, useEffect, useSyncExternalStore } from 'react'
import { captureVideoFirstFrame } from '@/lib/videoUtils'
import { compressPostImage } from '@/lib/imageCompress'
import {
  applyTextStylePatch,
  isEmptyTextStylePatch,
  isSameColor,
  loadFavoriteColors,
  markAttrsToTextStyle,
  onFavoriteColorsChanged,
  textMarkAttrsToCss,
  textStyleToCss,
  type FavoriteKind,
  type TextStylePatch,
  type TextStyleValue,
} from '@/lib/colorUtils'
import CustomPopup from './CustomPopup'
import ColorStudio, {
  type ColorStudioMixed,
  type ColorStudioMode,
  type ColorStudioPreview,
  type ColorStudioPreviewSegment,
} from './editor/ColorStudio'
import EditorHelpPopup from './editor/EditorHelpPopup'
import ResizableImage from './editor/ResizableImage'
import './editor/editor.css'

// 한 span 에 여러 스타일(글씨 색 + 크기 + 글꼴 + 배경색 등)이 함께 있어도 각 서식이 모두 읽히도록
// - consuming: false → 이 규칙이 맞아도 다른 서식 규칙도 계속 검사 (예전에는 첫 서식 하나만 남고 나머지가 사라짐)
// - 해당 스타일 값이 실제로 있을 때만 매치 (예: 'background-color' 가 'color' 로 잘못 읽혀 형광펜이 사라지던 문제)
const styledSpanRule = (hasStyle: (el: HTMLElement) => boolean) => ({
  tag: 'span[style]',
  consuming: false,
  getAttrs: (el: HTMLElement) => (hasStyle(el) ? {} : false),
})

// 문단 들여쓰기 (단계마다 24px, 최대 8단계)
// 예전에는 문단에 style 속성이 없어 들여쓰기/내어쓰기 버튼을 눌러도 아무 변화가 없었음
const INDENT_STEP_PX = 24
const MAX_INDENT_LEVEL = 8
const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const px = parseFloat(el.style.paddingLeft || '0')
              return Number.isFinite(px) && px > 0 ? Math.min(MAX_INDENT_LEVEL, Math.round(px / INDENT_STEP_PX)) : 0
            },
            renderHTML: (attrs) => (attrs.indent > 0 ? { style: `padding-left: ${attrs.indent * INDENT_STEP_PX}px` } : {}),
          },
        },
      },
    ]
  },
})

const CustomUnderline = Mark.create({
  name: 'customUnderline',
  parseHTML() {
    return [{ tag: 'u' }, { style: 'text-decoration=underline' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0]
  },
  // 기본 밑줄 확장은 끔 (툴바 밑줄과 Ctrl+U 밑줄이 서로 다른 서식이라 툴바로 지울 수 없던 문제)
  addKeyboardShortcuts() {
    return {
      'Mod-u': () => this.editor.commands.toggleMark(this.name),
      'Mod-U': () => this.editor.commands.toggleMark(this.name),
    }
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

const readTextStroke = (el: HTMLElement): string | null =>
  el.style.getPropertyValue('-webkit-text-stroke') || el.style.webkitTextStroke || null

// 글씨 색 + 테두리(-webkit-text-stroke) + 글로우(text-shadow) 를 한 span 에 함께 저장
// (예전 글의 color 만 있는 span 도 그대로 읽고 씀)
const CustomColor = Mark.create({
  name: 'customColor',
  addAttributes() {
    // 스타일 문자열은 renderHTML 에서 한 번에 만듦 (테두리에는 paint-order 도 함께 필요)
    return {
      color: {
        default: null,
        // 빈 문자열 대신 null 로 통일 (같은 모양인데 서로 다른 서식으로 취급돼 쪼개지던 문제)
        parseHTML: el => el.style.color || el.getAttribute('color') || null,
        renderHTML: () => ({}),
      },
      stroke: {
        default: null,
        parseHTML: el => readTextStroke(el),
        renderHTML: () => ({}),
      },
      glow: {
        default: null,
        parseHTML: el => el.style.textShadow || null,
        renderHTML: () => ({}),
      },
    }
  },
  parseHTML() {
    return [
      styledSpanRule((el) => Boolean(el.style.color || readTextStroke(el) || el.style.textShadow)),
      // 다른 곳에서 붙여 넣은 옛 <font color> 글씨 색
      { tag: 'font[color]', consuming: false },
    ]
  },
  renderHTML({ mark, HTMLAttributes }) {
    const style = textMarkAttrsToCss(mark.attrs)
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0]
  },
})

const CustomFontSize = Mark.create({
  name: 'customFontSize',
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: attrs => attrs.size ? { style: `font-size: ${attrs.size}` } : {},
      },
    }
  },
  parseHTML() {
    return [styledSpanRule((el) => Boolean(el.style.fontSize))]
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
        parseHTML: el => el.style.fontFamily || null,
        renderHTML: attrs => attrs.family ? { style: `font-family: ${attrs.family}` } : {},
      },
    }
  },
  parseHTML() {
    return [styledSpanRule((el) => Boolean(el.style.fontFamily))]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

const CustomHighlight = Mark.create({
  name: 'customHighlight',
  // 굵게·글씨 색 등 다른 서식보다 바깥에 그려지게 → 형광펜 안에 여러 색/굵기가 섞여도 한 덩어리로 유지
  // (예전에는 형광펜이 조각나 조각마다 좌우 여백이 붙어 글자 사이가 벌어짐)
  priority: 200,
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: el => el.style.backgroundColor || null,
        renderHTML: attrs => attrs.color ? { style: `background-color: ${attrs.color}; padding: 0 4px;` } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'mark', consuming: false }, styledSpanRule((el) => Boolean(el.style.backgroundColor))]
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

// 즐겨찾기 색(기기별 localStorage) 구독
// - 내용이 같으면 같은 배열을 돌려줘야 useSyncExternalStore 가 무한 렌더하지 않음
const NO_COLORS: string[] = []
const favoriteColorCache: Record<FavoriteKind, { key: string; list: string[] }> = {
  text: { key: '', list: NO_COLORS },
  highlight: { key: '', list: NO_COLORS },
}
const getFavoriteSnapshot = (kind: FavoriteKind): string[] => {
  const list = loadFavoriteColors(kind)
  const key = list.join('|')
  if (favoriteColorCache[kind].key !== key) favoriteColorCache[kind] = { key, list }
  return favoriteColorCache[kind].list
}
const subscribeFavoriteColors = (onChange: () => void) => onFavoriteColorsChanged(() => onChange())
const useFavoriteColors = (kind: FavoriteKind): string[] =>
  useSyncExternalStore(
    subscribeFavoriteColors,
    () => getFavoriteSnapshot(kind),
    () => NO_COLORS
  )

interface ColorStudioState {
  mode: ColorStudioMode
  initialText: TextStyleValue
  initialHighlight: string | null
  mixed: ColorStudioMixed
  preview: ColorStudioPreview
}

const EMPTY_STUDIO_PREVIEW: ColorStudioPreview = { text: '' }
const STUDIO_PREVIEW_MAX_CHARS = 24

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
  const titleFetchTimerRef = useRef<number | null>(null)
  const titleFetchAbortRef = useRef<AbortController | null>(null)

  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false)
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')

  // 글자 색/형광펜 상세 편집 팝업 + 열 때의 선택 범위 (팝업으로 포커스가 옮겨가도 원래 선택에 적용)
  const [colorStudio, setColorStudio] = useState<ColorStudioState | null>(null)
  const studioSelectionRef = useRef<{ from: number; to: number } | null>(null)
  const favoriteTextColors = useFavoriteColors('text')
  const favoriteHighlightColors = useFavoriteColors('highlight')

  const [showHelpPopup, setShowHelpPopup] = useState(false)

  const [videoNoticePopup, setVideoNoticePopup] = useState(false)
  const [popup, setPopup] = useState<{ show: boolean; title: string; message: string }>({
    show: false,
    title: '',
    message: '',
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 밑줄은 CustomUnderline 하나만 사용 (두 종류가 섞이면 툴바로 밑줄을 지울 수 없음)
        underline: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      ResizableImage,
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
      ParagraphIndent,
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
        class: 'prose prose-zinc dark:prose-invert max-w-none p-4 focus:outline-none text-zinc-800 dark:text-zinc-200 leading-relaxed',
        // Tailwind 는 동적 클래스(min-h-[${...}])를 만들지 못해 최소 높이가 적용되지 않던 문제 → 인라인 스타일로 적용
        style: `min-height: ${minHeight};`,
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

  // 링크 제목 자동 조회 타이머/요청 정리
  useEffect(() => {
    return () => {
      if (titleFetchTimerRef.current) window.clearTimeout(titleFetchTimerRef.current)
      titleFetchAbortRef.current?.abort()
    }
  }, [])

  if (!editor) return null

  // 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    for (const originalFile of Array.from(files)) {
      // 대용량 사진은 업로드 전에 화질 손상 없이 자동 축소 (GIF 움짤은 원본 유지)
      const file = await compressPostImage(originalFile)
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
    } catch (err) {
      setPopup({
        show: true,
        title: '오류 발생',
        message: `처리 도중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
      })
    }

    setIsUploadingVideo(false)
    setUploadProgressText('')
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  const fetchAutoTitle = async (url: string) => {
    if (!url.startsWith('http')) return
    titleFetchAbortRef.current?.abort()
    const controller = new AbortController()
    titleFetchAbortRef.current = controller
    setFetchingTitle(true)
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      const data = await res.json()
      if (data?.title && !controller.signal.aborted) {
        setInputLinkText(data.title)
      }
    } catch {}
    if (titleFetchAbortRef.current === controller) setFetchingTitle(false)
  }

  // 입력할 때마다 서버에 요청하지 않도록 입력이 멈춘 뒤 0.5초 후 1회만 조회
  const scheduleAutoTitle = (url: string) => {
    if (titleFetchTimerRef.current) window.clearTimeout(titleFetchTimerRef.current)
    if (!url.startsWith('http')) return
    titleFetchTimerRef.current = window.setTimeout(() => {
      titleFetchTimerRef.current = null
      fetchAutoTitle(url)
    }, 500)
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

  // 즐겨찾기 글씨 색 바로 적용
  const handleSetColor = (color: string) => {
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<span style="color: ${color};">색상</span> `).run()
    } else {
      // 이미 준 테두리/글로우는 그대로 두고 글씨 색만 변경
      // (setMark 는 구간마다 기존 속성에 합쳐 적용 → 여러 스타일이 섞인 선택도 각자 테두리/글로우 유지)
      editor.chain().focus().setMark('customColor', { color }).run()
    }
  }

  // 선택한 글자들의 글씨 색/테두리/글로우/형광펜을 모아, 처음 값과 '여러 값이 섞였는지'를 알아냄
  // (editor.getAttributes 는 여러 값 중 하나만 돌려줘서, 섞인 선택에서 그 값 하나로 전부 덮어쓰던 원인)
  const inspectSelectionStyles = (from: number, to: number) => {
    const { doc, schema } = editor.state
    const colorType = schema.marks.customColor
    const highlightType = schema.marks.customHighlight
    if (from === to || !colorType || !highlightType) {
      return {
        initialText: markAttrsToTextStyle(editor.getAttributes('customColor')),
        initialHighlight: (editor.getAttributes('customHighlight').color as string | null) ?? null,
        mixed: {},
        segments: [] as ColorStudioPreviewSegment[],
      }
    }
    const seen = { color: new Set<string>(), stroke: new Set<string>(), glow: new Set<string>(), highlight: new Set<string>() }
    let firstText: TextStyleValue = { color: null, stroke: null, glow: null }
    let firstHighlight: string | null = null
    // 미리보기용: 선택 앞부분 글자를 원래 색/효과와 함께 (적용 결과를 글자마다 정확히 보여 줌)
    const segments: ColorStudioPreviewSegment[] = []
    let segmentChars = 0
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return
      const rawAttrs = colorType.isInSet(node.marks)?.attrs
      if (segmentChars < STUDIO_PREVIEW_MAX_CHARS) {
        const text = (node.text ?? '').slice(Math.max(0, from - pos), Math.max(0, to - pos))
        const chars = Array.from(text).slice(0, STUDIO_PREVIEW_MAX_CHARS - segmentChars)
        if (chars.length > 0) {
          segmentChars += chars.length
          segments.push({
            text: chars.join(''),
            style: { color: rawAttrs?.color ?? null, stroke: rawAttrs?.stroke ?? null, glow: rawAttrs?.glow ?? null },
            highlight: (highlightType.isInSet(node.marks)?.attrs.color as string | null) ?? null,
          })
        }
      }
      const style = markAttrsToTextStyle(rawAttrs)
      seen.color.add(style.color ?? '')
      seen.stroke.add(style.stroke ? JSON.stringify(style.stroke) : '')
      seen.glow.add(style.glow ? JSON.stringify(style.glow) : '')
      firstText = {
        color: firstText.color ?? style.color,
        stroke: firstText.stroke ?? style.stroke,
        glow: firstText.glow ?? style.glow,
      }
      const hl = (highlightType.isInSet(node.marks)?.attrs.color as string | null) ?? null
      if (![...seen.highlight].some((c) => (c === '' ? !hl : isSameColor(c, hl)))) seen.highlight.add(hl ?? '')
      firstHighlight = firstHighlight ?? hl
    })
    return {
      initialText: firstText,
      initialHighlight: firstHighlight,
      segments,
      mixed: {
        color: seen.color.size > 1,
        stroke: seen.stroke.size > 1,
        glow: seen.glow.size > 1,
        highlight: seen.highlight.size > 1,
      },
    }
  }

  // 글자 색 / 형광펜 상세 편집 팝업 열기
  const openColorStudio = (mode: ColorStudioMode) => {
    const { from, to } = editor.state.selection
    studioSelectionRef.current = { from, to }
    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim()
    const { segments, ...styles } = inspectSelectionStyles(from, to)
    setColorStudio({
      mode,
      ...styles,
      preview: {
        segments,
        text: Array.from(selectedText).slice(0, STUDIO_PREVIEW_MAX_CHARS).join(''),
        fontFamily: editor.getAttributes('customFontFamily').family ?? null,
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('customUnderline'),
        strike: editor.isActive('strike'),
      },
    })
  }

  const closeColorStudio = () => {
    setColorStudio(null)
    studioSelectionRef.current = null
  }

  // 팝업을 열 때의 선택 범위로 되돌린 뒤 명령 실행
  const chainAtStudioSelection = () => {
    const saved = studioSelectionRef.current
    const chain = editor.chain().focus()
    if (!saved) return chain
    const max = editor.state.doc.content.size
    return chain.setTextSelection({ from: Math.min(saved.from, max), to: Math.min(saved.to, max) })
  }

  // 선택 구간의 글자마다 기존 글씨 색/테두리/글로우에 '바꾼 항목만' 합쳐서 적용 (한 번의 되돌리기 단위)
  // → 여러 색이 섞인 글자에 테두리만 켜도 각 글자의 색이 그대로 유지됨
  const applyTextPatchAtStudioSelection = (patch: TextStylePatch) => {
    chainAtStudioSelection()
      .command(({ tr, state }) => {
        const type = state.schema.marks.customColor
        if (!type) return false
        const { from, to } = state.selection
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isText) return
          const start = Math.max(from, pos)
          const end = Math.min(to, pos + node.nodeSize)
          if (start >= end) return
          const next = applyTextStylePatch(type.isInSet(node.marks)?.attrs, patch)
          if (!next.color && !next.stroke && !next.glow) tr.removeMark(start, end, type)
          else tr.addMark(start, end, type.create(next))
        })
        return true
      })
      .run()
  }

  const handleColorStudioApply = (value: { text?: TextStyleValue; textPatch?: TextStylePatch; highlight?: string }) => {
    if (!colorStudio) return
    const saved = studioSelectionRef.current
    const wasEmpty = !saved || saved.from === saved.to

    if (colorStudio.mode === 'text' && value.text) {
      const style = value.text
      if (wasEmpty) {
        if (!style.color && !style.stroke && !style.glow) {
          chainAtStudioSelection().unsetMark('customColor').run()
        } else {
          // 선택 없이 적용: 기존처럼 '색상' 글자를 넣어 바로 이어서 쓸 수 있게
          chainAtStudioSelection().insertContent(`<span style="${textStyleToCss(style)}">색상</span> `).run()
        }
      } else if (value.textPatch && !isEmptyTextStylePatch(value.textPatch)) {
        applyTextPatchAtStudioSelection(value.textPatch)
      } else {
        // 아무것도 바꾸지 않고 적용 → 그대로 (선택만 되돌림)
        chainAtStudioSelection().run()
      }
    } else if (colorStudio.mode === 'highlight') {
      chainAtStudioSelection().run()
      // 색을 바꾸지 않았으면(value.highlight 없음) 여러 형광펜이 섞인 선택도 그대로 둠
      if (value.highlight) handleSetHighlight(value.highlight)
    }

    closeColorStudio()
  }

  const handleColorStudioClear = () => {
    if (!colorStudio) return
    chainAtStudioSelection().unsetMark(colorStudio.mode === 'text' ? 'customColor' : 'customHighlight').run()
    closeColorStudio()
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
    editor.chain().focus().command(({ tr, state }) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          const current = Number(node.attrs.indent) || 0;
          const next = Math.max(0, Math.min(MAX_INDENT_LEVEL, current + (direction === 'in' ? 1 : -1)));
          if (next !== current) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
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

        {/* 미디어 첨부 버튼 (이미지 / 동영상) + 도구 설명 */}
        {/* 좁은 화면에서 업로드 진행 문구가 길어져도 가로로 넘치지 않도록 줄바꿈 허용 */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isUploadingVideo}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-none text-xs font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 border-zinc-300 dark:text-white dark:bg-zinc-800 dark:hover:bg-zinc-700 transition disabled:opacity-50 border dark:border-zinc-700"
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

          {/* 도구 설명 (모든 툴바 버튼 안내) */}
          <button
            type="button"
            onClick={() => setShowHelpPopup(true)}
            className="inline-flex items-center justify-center p-1.5 rounded-none border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="도구 설명"
            aria-label="도구 설명"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3번 이미지 기준: 표(Table) 전용 고기능 서식 바 */}
      {showTableTools && (
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-blue-50/50 dark:bg-blue-950/20 flex flex-wrap items-center gap-1.5 text-xs animate-in slide-in-from-top-1 duration-150">
          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mr-1">표 편집:</span>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-none text-[11px] font-bold text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-950/60"
          >
            표 생성 (3x3)
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

          {/* 행 조작 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="표 행 추가 (위)"
          >
            행 추가 (위)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="표 행 추가 (아래)"
          >
            행 추가 (아래)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-2 py-1 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 rounded-none text-[11px] hover:bg-red-100 dark:hover:bg-red-950/70"
            title="표 행 삭제"
          >
            행 삭제
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

          {/* 열 조작 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="표 열 추가 (좌측)"
          >
            열 추가 (좌)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="표 열 추가 (우측)"
          >
            열 추가 (우)
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-2 py-1 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 rounded-none text-[11px] hover:bg-red-100 dark:hover:bg-red-950/70"
            title="표 열 삭제"
          >
            열 삭제
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

          {/* 병합 및 분할 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().mergeCells().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="표 셀 병합"
          >
            셀 병합
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().splitCell().run()}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-none text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
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

          {/* 글자 색상: 상세 편집(글씨 색/테두리/글로우) + 즐겨찾기 색 */}
          {/* 즐겨찾기가 많아도 좁은 화면에서 넘치지 않도록 줄바꿈 허용 */}
          <div className="flex flex-wrap items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button
              type="button"
              onClick={() => openColorStudio('text')}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs font-medium text-zinc-900 dark:text-zinc-100"
              title="글씨 색·테두리·글로우 상세 편집"
            >
              <span>색 상세 편집</span>
            </button>
            {favoriteTextColors.map((color, i) => (
              <button
                key={`${i}-${color}`}
                type="button"
                onClick={() => handleSetColor(color)}
                className="w-4 h-4 border border-zinc-400 dark:border-zinc-500"
                style={{ backgroundColor: color }}
                title={`즐겨찾기 색 ${color}`}
                aria-label={`즐겨찾기 글씨 색 ${color}`}
              />
            ))}
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

          {/* 배경색상 / 하이라이트: 상세 편집 + 즐겨찾기 색 + 지움 */}
          <div className="flex flex-wrap items-center gap-1">
            <Highlighter className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            <button
              type="button"
              onClick={() => openColorStudio('highlight')}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-none text-xs font-medium text-zinc-900 dark:text-zinc-100"
              title="형광펜 색 상세 편집"
            >
              <span>형광펜 상세 편집</span>
            </button>
            {favoriteHighlightColors.map((color, i) => (
              <button
                key={`${i}-${color}`}
                type="button"
                onClick={() => handleSetHighlight(color)}
                className="w-4 h-4 border border-zinc-400 dark:border-zinc-500"
                style={{ backgroundColor: color }}
                title={`즐겨찾기 형광펜 ${color}`}
                aria-label={`즐겨찾기 형광펜 ${color}`}
              />
            ))}
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
                    scheduleAutoTitle(val)
                  }}
                  onBlur={() => {
                    if (inputLinkUrl.startsWith('http') && !inputLinkText) {
                      if (titleFetchTimerRef.current) {
                        window.clearTimeout(titleFetchTimerRef.current)
                        titleFetchTimerRef.current = null
                      }
                      fetchAutoTitle(inputLinkUrl)
                    }
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

      {/* 글자 색 / 형광펜 상세 편집 */}
      <ColorStudio
        isOpen={colorStudio !== null}
        mode={colorStudio?.mode ?? 'text'}
        mixed={colorStudio?.mixed}
        initialText={colorStudio?.initialText}
        initialHighlight={colorStudio?.initialHighlight ?? null}
        preview={colorStudio?.preview ?? EMPTY_STUDIO_PREVIEW}
        onApply={handleColorStudioApply}
        onClear={handleColorStudioClear}
        onClose={closeColorStudio}
      />

      {/* 툴바 도구 설명 */}
      <EditorHelpPopup isOpen={showHelpPopup} onClose={() => setShowHelpPopup(false)} />

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
