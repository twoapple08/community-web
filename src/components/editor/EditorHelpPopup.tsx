'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
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
  Plus,
  Trash2,
  Split,
  Maximize2,
} from 'lucide-react'

// 에디터 툴바 "?" 버튼: 모든 도구 버튼의 아이콘과 짧은 설명

interface HelpItem {
  icon: ReactNode
  name: string
  desc: string
}

interface HelpGroup {
  title: string
  /** 묶음 위치 안내 (예: 어떤 버튼을 눌러야 보이는지) */
  note?: string
  items: HelpItem[]
}

const ICON = 'w-4 h-4'
// 툴바에서 아이콘 대신 글자로 표시되는 버튼용
const TextIcon = ({ children }: { children: ReactNode }) => <span className="text-[11px] font-black leading-none">{children}</span>

const HELP_GROUPS: HelpGroup[] = [
  {
    title: '기본 서식',
    items: [
      { icon: <Bold className={ICON} />, name: '굵게', desc: '선택한 글자를 굵게 만듭니다.' },
      { icon: <Italic className={ICON} />, name: '기울임', desc: '글자를 비스듬히 기울입니다.' },
      { icon: <UnderlineIcon className={ICON} />, name: '밑줄', desc: '글자 아래에 밑줄을 긋습니다.' },
      { icon: <Strikethrough className={ICON} />, name: '취소선', desc: '글자 가운데에 줄을 그어 지운 것처럼 표시합니다.' },
    ],
  },
  {
    title: '문단 정렬',
    items: [
      { icon: <AlignLeft className={ICON} />, name: '왼쪽 맞춤', desc: '문단을 왼쪽에 맞춥니다.' },
      { icon: <AlignCenter className={ICON} />, name: '가운데 맞춤', desc: '문단을 가운데에 맞춥니다.' },
      { icon: <AlignRight className={ICON} />, name: '오른쪽 맞춤', desc: '문단을 오른쪽에 맞춥니다.' },
      { icon: <AlignJustify className={ICON} />, name: '양쪽 맞춤', desc: '줄의 양 끝을 가지런히 맞춥니다.' },
    ],
  },
  {
    title: '들여쓰기·내어쓰기',
    items: [
      { icon: <Indent className={ICON} />, name: '들여쓰기', desc: '문단의 시작을 안쪽으로 들여 씁니다.' },
      { icon: <Outdent className={ICON} />, name: '내어쓰기', desc: '들여쓰기를 없애고 원래 위치로 되돌립니다.' },
    ],
  },
  {
    title: '목록·인용',
    items: [
      { icon: <List className={ICON} />, name: '글머리 기호', desc: '점(•)으로 시작하는 목록을 만듭니다.' },
      { icon: <ListOrdered className={ICON} />, name: '번호 매기기', desc: '1, 2, 3 번호가 붙는 목록을 만듭니다.' },
      { icon: <Quote className={ICON} />, name: '인용구', desc: '다른 사람의 말이나 글을 인용 상자로 표시합니다.' },
    ],
  },
  {
    title: '삽입',
    items: [
      { icon: <TextIcon>Ω</TextIcon>, name: '기호', desc: '★ ♥ ※ ① 같은 특수 기호를 넣습니다.' },
      {
        icon: <LinkIcon className={ICON} />,
        name: '링크',
        desc: '링크를 넣습니다. 카톡 오픈채팅·디스코드 초대·유튜브 링크는 전용 카드로 표시됩니다.',
      },
      {
        icon: <ImageIcon className={ICON} />,
        name: '이미지',
        desc: '사진을 넣습니다. 여러 장을 한 번에 고를 수 있고, 큰 사진은 자동으로 축소되며 GIF(움짤)도 올릴 수 있습니다.',
      },
      {
        icon: <VideoIcon className={ICON} />,
        name: '동영상',
        desc: '동영상 파일을 올립니다 (최대 50MB). 긴 영상은 유튜브 링크로 넣어 주세요.',
      },
    ],
  },
  {
    title: '표 도구',
    note: "'표 도구' 버튼을 누르면 표 편집 줄이 열립니다.",
    items: [
      { icon: <TableIcon className={ICON} />, name: '표 생성 (3x3)', desc: '제목 행이 있는 3칸 × 3줄 표를 넣습니다.' },
      { icon: <Plus className={ICON} />, name: '행 추가·열 추가', desc: '커서가 있는 칸의 위/아래에 행을, 왼쪽/오른쪽에 열을 추가합니다.' },
      { icon: <Minus className={ICON} />, name: '행 삭제·열 삭제', desc: '커서가 있는 칸의 행 또는 열을 지웁니다.' },
      { icon: <Maximize2 className={ICON} />, name: '셀 병합', desc: '끌어서 선택한 여러 칸을 하나로 합칩니다.' },
      { icon: <Split className={ICON} />, name: '셀 분할', desc: '합쳐 둔 칸을 다시 나눕니다.' },
      { icon: <Trash2 className={ICON} />, name: '표 삭제', desc: '커서가 있는 표 전체를 지웁니다.' },
    ],
  },
  {
    title: '글꼴/서식',
    note: "'글꼴/서식' 버튼을 누르면 아래 도구가 열립니다.",
    items: [
      { icon: <Type className={ICON} />, name: '글꼴 선택', desc: '맑은 고딕, 나눔고딕, 바탕체 등 글꼴을 바꿉니다.' },
      { icon: <TextIcon>가</TextIcon>, name: '글꼴 크기', desc: '글자 크기를 목록에서 고르거나 숫자로 직접 입력합니다.' },
      {
        icon: <Palette className={ICON} />,
        name: '글자 색 상세 편집',
        desc: '글씨 색·테두리·글로우(빛 번짐)를 자유롭게 고릅니다. 자주 쓰는 색은 즐겨찾기에 저장해 옆의 작은 칸으로 바로 쓸 수 있습니다.',
      },
      {
        icon: <Highlighter className={ICON} />,
        name: '형광펜',
        desc: '상세 편집으로 글자 뒤 배경색을 칠합니다. 지움을 누르면 형광펜이 없어집니다.',
      },
      { icon: <Minus className={ICON} />, name: '구분선', desc: '문단 사이에 가로 구분선을 넣습니다.' },
      { icon: <Code className={ICON} />, name: '코드 블록', desc: '코드를 고정폭 글꼴 상자에 씁니다.' },
    ],
  },
]

const noopSubscribe = () => () => {}
const useIsClient = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )

interface EditorHelpPopupProps {
  isOpen: boolean
  onClose: () => void
}

export default function EditorHelpPopup({ isOpen, onClose }: EditorHelpPopupProps) {
  const isClient = useIsClient()
  const backdropDownRef = useRef(false)

  // Esc 로 닫기 (아래쪽 다른 모달까지 함께 닫히지 않도록 전파 차단)
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [isOpen, onClose])

  if (!isOpen || !isClient) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      // 팝업 안에서 끌다가 바깥에서 손을 뗀 경우에는 닫히지 않도록
      onMouseDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropDownRef.current) onClose()
        backdropDownRef.current = false
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="에디터 도구 설명"
        className="w-full max-w-md max-h-[85vh] overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950 border-2 border-zinc-900 dark:border-white rounded-none shadow-2xl text-zinc-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 pt-4 pb-2 bg-white dark:bg-zinc-950 border-b border-zinc-900 dark:border-white">
          <h3 className="text-sm font-black text-zinc-900 dark:text-white">에디터 도구 설명</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-none text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="닫기"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-5 space-y-4">
          {HELP_GROUPS.map((group) => (
            <section key={group.title} className="space-y-1.5">
              <h4 className="text-[11px] font-black tracking-wider text-emerald-600 dark:text-emerald-400">{group.title}</h4>
              {group.note && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{group.note}</p>}
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.name} className="flex items-start gap-2.5">
                    <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-none border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
                      {item.icon}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white leading-snug">{item.name}</p>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* 이미지 크기 조절 안내 */}
          <div className="flex items-start gap-2 p-2.5 rounded-none border border-orange-400 dark:border-orange-500/70 bg-orange-50 dark:bg-orange-950/30">
            <span className="shrink-0 mt-1 w-2.5 h-2.5 rounded-full bg-orange-500 border-[1.5px] border-white dark:border-zinc-950 shadow-sm" />
            <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-300 leading-snug">
              팁: 이미지를 누르면 주황색 점 8개가 나타나며, 점을 끌어 크기를 조절할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
