import { CrownIcon } from "./CrownIcon"
'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  X,
  Calendar,
  User as UserIcon,
  Trash2,
  Share2,
  Check,
  AlertTriangle,
  Pencil,
  Save,
  Bold,
  Italic,
  Underline,
  Image as ImageIcon,
  Loader2,
  ZoomIn,
  Eye
} from 'lucide-react'

interface Post {
  id: string
  title: string
  content: string
  created_at: string
  author_id: string
}

interface PostModalProps {
  postId: string
  onClose: () => void
  onDeleted?: () => void
}

export default function PostModal({ postId, onClose, onDeleted }: PostModalProps) {
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  // 사진 확대 미리보기 (Lightbox) 상태
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  // 편집 모드 상태 관리
  const [isEditing, setIsEditing] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<"creator" | "super_admin" | "admin" | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [selectedEditorImg, setSelectedEditorImg] = useState<HTMLImageElement | null>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 커스텀 삭제 팝업 상태 관리
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 본문 내 이미지 목록 스캔 동기화
  const syncAttachedImages = () => {
    if (!editorRef.current) return
    const imgs = Array.from(editorRef.current.querySelectorAll('img')).map((img) => img.src)
    setAttachedImages(imgs)
  }

  // ESC 키 이벤트 감지 (계층별 종료)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImageUrl) {
          setPreviewImageUrl(null)
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false)
        } else if (isEditing) {
          if (window.confirm('수정을 취소하시겠습니까? 변경 사항은 저장되지 않습니다.')) {
            setIsEditing(false)
            setSelectedEditorImg(null)
          }
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, showDeleteConfirm, isEditing, previewImageUrl])

  // 배경 스크롤 차단
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // 게시글 데이터 및 세션 로드
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
        const uEmail = session?.user?.email?.toLowerCase()
        if (uEmail === "iwsamuel08@gmail.com") {
          setCurrentUserRole("creator")
        } else if (uEmail) {
          supabase.from("user_roles").select("role").eq("email", uEmail).maybeSingle().then(({ data }) => {
            if (data?.role) setCurrentUserRole(data.role as any)
          })
        }
      setCurrentUserId(session?.user?.id ?? null)
    })

    const fetchPost = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (!error && data) {
        setPost(data)
        setEditTitle(data.title)
      }
      setLoading(false)
    }

    if (postId) {
      fetchPost()
    }
  }, [postId])

  // 편집 모드 진입 시 에디터 본문 초기화 및 이미지 추출
  useEffect(() => {
    if (isEditing && editorRef.current && post) {
      editorRef.current.innerHTML = post.content
      syncAttachedImages()
    }
  }, [isEditing, post])

  // 공유 링크 복사
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 복사 예외
    }
  }

  // 서식 명령 실행
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value)
  }

  // 이미지 업로드 처리
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`

      const { error: uploadError } = await supabase.storage.from('posts').upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName)

      if (editorRef.current) {
        editorRef.current.focus()
        document.execCommand('insertImage', false, publicUrl)
        setTimeout(syncAttachedImages, 100)
      }
    } catch (err: any) {
      alert(`이미지 업로드 실패: ${err.message || '스토리지 연결 오류'}`)
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 에디터 내 특정 이미지 삭제 (URL 기준)
  const handleRemoveImageBySrc = (src: string) => {
    if (!editorRef.current) return
    const imgElements = editorRef.current.querySelectorAll('img')
    imgElements.forEach((img) => {
      if (img.src === src) {
        img.remove()
      }
    })
    setSelectedEditorImg(null)
    syncAttachedImages()
  }

  // 에디터 내부 클릭 감지 (이미지 선택 토글)
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      setSelectedEditorImg(target as HTMLImageElement)
    } else {
      setSelectedEditorImg(null)
    }
  }

  // 열람 모드 본문 클릭 시 이미지 확대 감지
  const handleContentViewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      setPreviewImageUrl((target as HTMLImageElement).src)
    }
  }

  // 수정 내용 최종 저장
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      alert('제목을 입력해 주십시오.')
      return
    }

    const contentToSave = editorRef.current?.innerHTML || ''
    if (!contentToSave.trim() || contentToSave === '<p><br></p>') {
      alert('내용을 입력해 주십시오.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: contentToSave,
      })
      .eq('id', postId)

    if (error) {
      alert(`게시글 수정 실패: ${error.message}`)
      setSaving(false)
    } else {
      setPost((prev) => (prev ? { ...prev, title: editTitle.trim(), content: contentToSave } : null))
      setIsEditing(false)
      setSelectedEditorImg(null)
      setSaving(false)
      if (onDeleted) onDeleted()
      router.refresh()
    }
  }

  // 게시글 삭제 최종 실행
  const handleExecuteDelete = async () => {
    setDeleting(true)
    setDeleteError(null)

    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
    } else {
      setShowDeleteConfirm(false)
      onClose()
      if (onDeleted) onDeleted()
      router.refresh()
    }
  }

  const isAuthor = Boolean(currentUserId && post && currentUserId === post.author_id)
  const canManage = Boolean(post && (isAuthor || ["creator", "super_admin", "admin"].includes(currentUserRole || "")))

  return (
    <>
      {/* 본문 팝업 오버레이 */}
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-6 py-8 sm:py-14 flex justify-center items-start animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-3xl my-auto sm:my-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 상단 스티키 툴바 */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
                    title="게시글 링크 복사"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>{copied ? '링크 복사됨' : '공유'}</span>
                  </button>

                  {Boolean(canManage && post) && (
                    <>
                      <button
                        onClick={() => {
                          setEditTitle(post?.title || "")
                          setIsEditing(true)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-900/50 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>수정</span>
                      </button>

                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900/50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제</span>
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                    편집 모드
                  </span>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || uploadingImage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{saving ? '저장 중...' : '수정 완료'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setSelectedEditorImg(null)
                    }}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 본문 / 편집 영역 */}
          <div className="px-6 py-6 sm:px-8 space-y-6">
            {loading ? (
              <div className="py-20 text-center text-zinc-400 dark:text-zinc-500">
                내용을 불러오는 중입니다...
              </div>
            ) : !post ? (
              <div className="py-20 text-center text-zinc-500">
                존재하지 않거나 삭제된 게시글입니다.
              </div>
            ) : isEditing ? (
              /* --- [수정 편집 모드] --- */
              <div className="space-y-4">
                {/* 제목 입력창 */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                    제목
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="게시글 제목을 입력하세요"
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                </div>

                {/* 서식 툴바 */}
                <div className="flex flex-wrap items-center gap-1 p-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                  <button
                    type="button"
                    onClick={() => executeCommand('bold')}
                    className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                    title="굵게"
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => executeCommand('italic')}
                    className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                    title="기울임"
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => executeCommand('underline')}
                    className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                    title="밑줄"
                  >
                    <Underline className="w-4 h-4" />
                  </button>

                  <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

                  {/* 이미지 업로드 */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition disabled:opacity-50"
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> : <ImageIcon className="w-4 h-4 text-emerald-500" />}
                    <span>{uploadingImage ? '업로드 중...' : '이미지 추가'}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* 첨부된 사진 관리 트레이 */}
                {attachedImages.length > 0 && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      <span>삽입된 사진 관리 ({attachedImages.length}장)</span>
                      <span className="text-[11px] text-zinc-400">클릭 시 미리보기 / 휴지통 클릭 시 삭제</span>
                    </div>
                    <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                      {attachedImages.map((src, index) => (
                        <div
                          key={index}
                          className="relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800"
                        >
                          <img
                            src={src}
                            alt={`첨부 사진 ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setPreviewImageUrl(src)}
                          />
                          {/* 호버 오버레이: 미리보기 & 삭제 버튼 */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(src)}
                              className="p-1 rounded-full bg-white/80 hover:bg-white text-zinc-900 transition"
                              title="크게 보기"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveImageBySrc(src)}
                              className="p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
                              title="사진 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 에디터 내 이미지 직접 선택 시 퀵 액션 배너 */}
                {selectedEditorImg && (
                  <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                    <span className="font-semibold flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      선택된 사진
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(selectedEditorImg.src)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition font-medium"
                      >
                        <ZoomIn className="w-3 h-3" />
                        미리보기
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImageBySrc(selectedEditorImg.src)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        사진 삭제
                      </button>
                    </div>
                  </div>
                )}

                {/* 본문 WYSIWYG 에디터 */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                    내용
                  </label>
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onClick={handleEditorClick}
                    onInput={syncAttachedImages}
                    className="min-h-[300px] p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 prose prose-zinc dark:prose-invert max-w-none leading-relaxed text-base [&_img]:rounded-xl [&_img]:my-4 [&_img]:max-w-full [&_img]:cursor-pointer [&_img:hover]:ring-2 [&_img:hover]:ring-emerald-400 transition"
                  />
                </div>
              </div>
            ) : (
              /* --- [일반 열람 모드] --- */
              <>
                <header className="space-y-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-snug">
                    {post.title}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" />
                      작성자
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </header>

                {/* 본문 렌더링 (사진 클릭 시 라이트박스 오픈) */}
                <div
                  onClick={handleContentViewClick}
                  className="prose prose-zinc dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed text-base [&_img]:rounded-xl [&_img]:shadow-md [&_img]:my-6 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img:hover]:opacity-95 transition"
                  dangerouslySetInnerHTML={{ __html: post.content }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* 사진 전체화면 확대 라이트박스 (미리보기 모달) */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition z-10"
            title="닫기 (ESC)"
          >
            <X className="w-6 h-6" />
          </button>

          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="사진 미리보기"
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
            />
            <div className="mt-3 text-xs text-zinc-400 flex items-center gap-2">
              <span>사진 미리보기</span>
              <span>•</span>
              <button
                type="button"
                onClick={() => window.open(previewImageUrl, '_blank')}
                className="underline hover:text-white transition"
              >
                원본 파일 열기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 커스텀 게시글 삭제 확인 팝업 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">게시글 삭제</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">데이터 영구 제거</p>
              </div>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              정말로 이 게시글을 삭제하시겠습니까? 삭제된 게시글은 다시 복구할 수 없습니다.
            </p>

            {deleteError && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50">
                삭제 실패: {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? '삭제 진행 중...' : '삭제'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
