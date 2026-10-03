'use client'

import { CrownIcon, RoleType } from "./CrownIcon";
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ReportModal from './ReportModal';
import {
  X,
  Calendar,
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
  Heart,
  ShieldCheck,
  Send,
  EyeOff,
  FileDown,
  Siren,
  ExternalLink,
  MessageCircle
} from 'lucide-react';

const AVAILABLE_TAGS = ['초급', '중급', '고급', '막고라', '클랜전', '제작 중심', '친목 중심'] as const;

interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  likes_count?: number;
  is_official?: boolean;
  delete_requested?: boolean;
  delete_reason?: string | null;
  tags?: string[];
  thumbnail_url?: string | null;
  is_preview_hidden?: boolean;
}

interface PostModalProps {
  postId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function PostModal({ postId, onClose, onDeleted }: PostModalProps) {
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [authorRole, setAuthorRole] = useState<RoleType>(null);
  const [authorNickname, setAuthorNickname] = useState<string>("");

  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editThumbnailUrl, setEditThumbnailUrl] = useState<string | null>(null);
  const [editIsPreviewHidden, setEditIsPreviewHidden] = useState(false);

  const [saving, setSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [selectedEditorImg, setSelectedEditorImg] = useState<HTMLImageElement | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showRequestDeleteModal, setShowRequestDeleteModal] = useState(false);
  const [deleteReasonText, setDeleteReasonText] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // 신고 모달 상태
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const [customPopup, setCustomPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email;
      if (email === "iwsamuel08@gmail.com") {
        setCurrentUserRole("creator");
      } else if (email) {
        supabase.from("user_roles").select("role").eq("email", email).maybeSingle().then(({ data }) => {
          if (data?.role) setCurrentUserRole(data.role as RoleType);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!post?.author_id) {
      setAuthorRole(null);
      setAuthorNickname("");
      return;
    }

    supabase
      .from("profiles")
      .select("nickname")
      .eq("id", post.author_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nickname) setAuthorNickname(data.nickname);
      });

    supabase
      .from("user_roles")
      .select("role, user_id, email")
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setAuthorRole(null);
          return;
        }

        const matched = data.find((r: any) => r.user_id === post.author_id);
        if (matched?.role) {
          setAuthorRole(matched.role as RoleType);
        } else {
          setAuthorRole(null);
        }
      });
  }, [post?.author_id]);

  const syncAttachedImages = () => {
    if (!editorRef.current) return;
    const imgs = Array.from(editorRef.current.querySelectorAll('img')).map((img) => img.src);
    setAttachedImages(imgs);
    if (imgs.length > 0 && !editThumbnailUrl) {
      setEditThumbnailUrl(imgs[0]);
    }
  };

  const checkDraft = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('post_drafts')
      .select('title')
      .eq('user_id', currentUserId)
      .maybeSingle();
    setHasDraft(Boolean(data));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isReportModalOpen) {
          setIsReportModalOpen(false);
        } else if (previewImageUrl) {
          setPreviewImageUrl(null);
        } else if (showRequestDeleteModal) {
          setShowRequestDeleteModal(false);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (isEditing) {
          setCustomPopup({
            isOpen: true,
            title: '수정 취소',
            message: '수정을 취소하시겠습니까? 변경 사항은 저장되지 않습니다.',
            type: 'confirm',
            onConfirm: () => {
              setIsEditing(false);
              setSelectedEditorImg(null);
            }
          });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showDeleteConfirm, showRequestDeleteModal, isEditing, previewImageUrl, isReportModalOpen]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);

      if (postId) {
        fetchPost(uid);
      }
    });
  }, [postId]);

  const fetchPost = async (uid?: string | null) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (!error && data) {
      setPost(data);
      setEditTitle(data.title);
      setEditTags(Array.isArray(data.tags) ? data.tags : []);
      setEditThumbnailUrl(data.thumbnail_url || null);
      setEditIsPreviewHidden(Boolean(data.is_preview_hidden));
      setLikesCount(data.likes_count ?? 0);

      const userIdToCheck = uid !== undefined ? uid : currentUserId;
      if (userIdToCheck) {
        const targetPostId: any = isNaN(Number(postId)) ? postId : Number(postId);
        const { data: likeRecord } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('post_id', targetPostId)
          .eq('user_id', userIdToCheck)
          .maybeSingle();

        setIsLiked(!!likeRecord);
      }
    }
    setLoading(false);
  };

  const handleToggleOfficial = async () => {
    if (!post) return;
    const nextStatus = !post.is_official;
    const { error } = await supabase
      .from('posts')
      .update({ is_official: nextStatus })
      .eq('id', postId);

    if (error) {
      alert(`공식 상태 변경 실패: ${error.message}`);
    } else {
      setPost({ ...post, is_official: nextStatus });
      if (onDeleted) onDeleted();
    }
  };

  const handleSubmitDeleteRequest = async () => {
    if (!post) return;
    setRequestSubmitting(true);
    const { error } = await supabase
      .from('posts')
      .update({
        delete_requested: true,
        delete_reason: deleteReasonText.trim() || '사유 미작성',
      })
      .eq('id', postId);

    if (error) {
      alert(`신청 실패: ${error.message}`);
      setRequestSubmitting(false);
    } else {
      alert('관리자에게 삭제 신청이 접수되었습니다. 검토 전까지 비공개 상태로 전환됩니다.');
      setShowRequestDeleteModal(false);
      onClose();
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleToggleLike = async () => {
    if (!currentUserId) {
      alert('좋아요 기능은 로그인이 필요합니다.');
      return;
    }
    if (likeLoading) return;
    setLikeLoading(true);

    const prevLiked = isLiked;
    const prevCount = likesCount;

    setIsLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

    const targetPostId: any = isNaN(Number(postId)) ? postId : Number(postId);

    if (prevLiked) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', targetPostId)
        .eq('user_id', currentUserId);

      if (error) {
        setIsLiked(prevLiked);
        setLikesCount(prevCount);
      }
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: targetPostId, user_id: currentUserId });

      if (error) {
        setIsLiked(prevLiked);
        setLikesCount(prevCount);
      }
    }
    setLikeLoading(false);
  };

  useEffect(() => {
    if (isEditing && editorRef.current && post) {
      editorRef.current.innerHTML = post.content;
      syncAttachedImages();
      checkDraft();
    }
  }, [isEditing, post]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop() || 'png';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
        let finalUrl: string | null = null;

        const { error: uploaderError } = await supabase.storage.from('posts').upload(fileName, file);
        if (!uploaderError) {
          const { data } = supabase.storage.from('posts').getPublicUrl(fileName);
          if (data?.publicUrl) finalUrl = data.publicUrl;
        } else {
          const { error: uploaderError2 } = await supabase.storage.from('post-images').upload(fileName, file);
          if (!uploaderError2) {
            const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
            if (data?.publicUrl) finalUrl = data.publicUrl;
          }
        }

        if (!finalUrl) {
          finalUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });
        }

        if (finalUrl && editorRef.current) {
          editorRef.current.focus();
          document.execCommand('insertImage', false, finalUrl);
        }
      }
      setTimeout(syncAttachedImages, 100);
    } catch (err: any) {
      alert(`이미지 업로드 오류: ${err.message}`);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImageBySrc = (src: string) => {
    if (!editorRef.current) return;
    const imgElements = editorRef.current.querySelectorAll('img');
    imgElements.forEach((img) => {
      if (img.src === src) {
        img.remove();
      }
    });
    if (editThumbnailUrl === src) {
      setEditThumbnailUrl(null);
    }
    setSelectedEditorImg(null);
    syncAttachedImages();
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      setSelectedEditorImg(target as HTMLImageElement);
    } else {
      setSelectedEditorImg(null);
    }
  };

  const handleContentViewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      setPreviewImageUrl((target as HTMLImageElement).src);
    }
  };

  const handleSaveEditDraft = async () => {
    if (!currentUserId) return;
    const contentToSave = editorRef.current?.innerHTML || '';
    if (!editTitle.trim() && !contentToSave.trim()) {
      alert('제목 또는 내용이 비어있어 보관할 수 없습니다.');
      return;
    }

    setIsSavingDraft(true);
    const { error } = await supabase.from('post_drafts').upsert(
      {
        user_id: currentUserId,
        title: editTitle.trim(),
        content: contentToSave,
        tags: editTags,
        thumbnail_url: editThumbnailUrl,
        is_preview_hidden: editIsPreviewHidden,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      alert(`임시보관 실패: ${error.message}`);
    } else {
      setHasDraft(true);
      alert('현재 수정 내용이 임시보관되었습니다. (최대 1개 유지)');
    }
    setIsSavingDraft(false);
  };

  const handleLoadEditDraft = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('post_drafts')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (!data) return;
    if (window.confirm('보관된 임시글을 불러오시겠습니까? 현재 편집 중인 내용이 대체됩니다.')) {
      setEditTitle(data.title || '');
      setEditTags(data.tags || []);
      setEditThumbnailUrl(data.thumbnail_url || null);
      setEditIsPreviewHidden(Boolean(data.is_preview_hidden));
      if (editorRef.current) {
        editorRef.current.innerHTML = data.content || '';
        syncAttachedImages();
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return alert('제목을 입력해 주십시오.');
    const contentToSave = editorRef.current?.innerHTML || '';
    if (!contentToSave.trim() || contentToSave === '<p><br></p>') return alert('내용을 입력해 주십시오.');

    setSaving(true);
    const { error } = await supabase
      .from('posts')
      .update({
        title: editTitle.trim(),
        content: contentToSave,
        tags: editTags,
        thumbnail_url: editThumbnailUrl,
        is_preview_hidden: editIsPreviewHidden,
      })
      .eq('id', postId);

    if (error) {
      alert(`수정 실패: ${error.message}`);
      setSaving(false);
    } else {
      if (currentUserId) {
        await supabase.from('post_drafts').delete().eq('user_id', currentUserId);
      }
      setPost((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim(),
              content: contentToSave,
              tags: editTags,
              thumbnail_url: editThumbnailUrl,
              is_preview_hidden: editIsPreviewHidden,
            }
          : null
      );
      setIsEditing(false);
      setSelectedEditorImg(null);
      setSaving(false);
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  const handleExecuteDelete = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      setDeleteError(error.message);
    } else {
      setShowDeleteConfirm(false);
      onClose();
      if (onDeleted) onDeleted();
      router.refresh();
    }
  };

  // 계층형 수정/삭제 권한 통제
  const isAuthor = Boolean(currentUserId && post && currentUserId === post.author_id);
  const canForceManage = Boolean((() => {
    if (!post || isAuthor) return false;
    if (authorRole === 'creator') return false;
    if (authorRole === 'super_admin') return currentUserRole === 'creator';
    if (authorRole === 'admin') return currentUserRole === 'creator' || currentUserRole === 'super_admin';
    return currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin';
  })());
  const canManage = isAuthor || canForceManage;

  // 하이퍼링크 및 유튜브/디스코드/카카오톡 전용 리치 임베드 변환 렌더링
  const renderRichContent = (html: string) => {
    // 1. 유튜브 URL 감지 및 임베드 변환
    let processed = html.replace(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)/g,
      (_match, videoId) => {
        return `<div class="my-4 aspect-video w-full max-w-xl mx-auto rounded-none overflow-hidden border border-zinc-800 shadow-lg">
          <iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>`;
      }
    );

    // 2. 디스코드 초대 링크 감지 및 카드 임베드
    processed = processed.replace(
      /(https?:\/\/(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+)/g,
      (match) => {
        return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3.5 py-2 my-2 rounded-none bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs no-underline transition shadow">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 127.14 96.36"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
          <span>디스코드 서버 참가하기</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        </a>`;
      }
    );

    // 3. 카카오톡 오픈채팅 링크 감지 및 카드 임베드
    processed = processed.replace(
      /(https?:\/\/(?:open\.kakao\.com)\/[a-zA-Z0-9_\/]+)/g,
      (match) => {
        return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3.5 py-2 my-2 rounded-none bg-[#FEE500] hover:bg-[#FADA0A] text-[#191919] font-bold text-xs no-underline transition shadow">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.124.498.182.492.383.359.158-.105 2.518-1.71 3.524-2.395.52.077 1.055.117 1.603.117 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"/></svg>
          <span>카카오톡 오픈채팅 입장하기</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        </a>`;
      }
    );

    // 4. 일반 하이퍼링크 클릭 상호작용 보장
    processed = processed.replace(
      /(<a\s+[^>]*href="[^"]*")/gi,
      `$1 target="_blank" rel="noopener noreferrer" class="text-blue-500 underline font-semibold hover:text-blue-400"`
    );

    return processed;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-6 sm:py-8 flex justify-center items-start animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-auto sm:my-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 pb-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
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

                {(currentUserRole === 'creator' || currentUserRole === 'super_admin' || currentUserRole === 'admin') && post && (
                  <button
                    onClick={handleToggleOfficial}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                      post.is_official
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{post.is_official ? '공식 해제' : '공식 지정'}</span>
                  </button>
                )}

                {canManage && post && (
                  <>
                    <button
                      onClick={() => {
                        setEditTitle(post?.title || '');
                        setEditTags(Array.isArray(post?.tags) ? post?.tags : []);
                        setEditThumbnailUrl(post?.thumbnail_url || null);
                        setEditIsPreviewHidden(Boolean(post?.is_preview_hidden));
                        setIsEditing(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-900/50 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{isAuthor ? "수정" : "강제 수정"}</span>
                    </button>

                    {post?.is_official && isAuthor && !canForceManage ? (
                      <button
                        onClick={() => setShowRequestDeleteModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900/50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>삭제 신청</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900/50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isAuthor ? "삭제" : "강제 삭제"}</span>
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                  편집 모드
                </span>

                {hasDraft && (
                  <button
                    type="button"
                    onClick={handleLoadEditDraft}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/60 transition"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">불러오기</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveEditDraft}
                  disabled={isSavingDraft}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition disabled:opacity-50"
                >
                  {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>임시보관</span>
                </button>

                <button
                  onClick={handleSaveEdit}
                  disabled={saving || uploadingImage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{saving ? '저장 중...' : '수정 완료'}</span>
                </button>
                <button
                  onClick={() => setIsEditing(false)}
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
            <div className="space-y-4">
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

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                  해시태그 설정 (중복 선택 가능)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_TAGS.map((tag) => {
                    const isSelected = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditTags((prev) => prev.filter((t) => t !== tag));
                          } else {
                            setEditTags((prev) => [...prev, tag]);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <span>#{tag}</span>
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                <button
                  type="button"
                  onClick={() => executeCommand('bold')}
                  className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('italic')}
                  className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('underline')}
                  className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <div className="h-4 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />
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
                  multiple
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {attachedImages.length > 0 && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      미리보기 설정
                    </span>
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editIsPreviewHidden}
                        onChange={(e) => setEditIsPreviewHidden(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 relative"></div>
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                        <EyeOff className="w-3.5 h-3.5" />
                        미리보기 가리기
                      </span>
                    </label>
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-400 block mb-1.5">
                      {editIsPreviewHidden
                        ? '미리보기 가리기가 설정되어 있어 썸네일이 피드에 노출되지 않습니다.'
                        : '대표로 표시할 썸네일을 터치하여 선택하세요:'}
                    </span>
                    <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                      {attachedImages.map((src, index) => {
                        const isMain = editThumbnailUrl === src && !editIsPreviewHidden;
                        return (
                          <div
                            key={index}
                            onClick={() => {
                              if (!editIsPreviewHidden) {
                                setEditThumbnailUrl(src);
                              }
                            }}
                            className={`relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition ${
                              editIsPreviewHidden
                                ? 'opacity-40 cursor-not-allowed border-zinc-300 dark:border-zinc-700'
                                : isMain
                                ? 'border-emerald-500 ring-2 ring-emerald-500/30 cursor-pointer'
                                : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 cursor-pointer'
                            }`}
                          >
                            <img src={src} alt="사진" className="w-full h-full object-cover" />
                            {isMain && (
                              <span className="absolute bottom-1 left-1 right-1 bg-emerald-600/90 text-white text-[9px] font-bold text-center py-0.5 rounded">
                                대표 사진
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveImageBySrc(src);
                              }}
                              className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition opacity-0 group-hover:opacity-100"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

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
                  className="prose dark:prose-invert max-w-none break-words break-all whitespace-pre-wrap overflow-hidden min-h-[220px] p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <header className="space-y-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-snug">
                  {post.is_official && (
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2 font-extrabold">
                      [공식]
                    </span>
                  )}
                  {post.title}
                </h2>

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200/80 dark:border-emerald-900/50"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                    <CrownIcon role={authorRole} className="w-4 h-4 shrink-0" />
                    <span>{authorNickname || '작성자'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
              </header>

              {/* 하이퍼링크 및 유튜브/디스코드/카톡 임베드 렌더링 영역 */}
              <div
                onClick={handleContentViewClick}
                className="prose dark:prose-invert max-w-none break-words break-all whitespace-pre-wrap overflow-hidden leading-relaxed text-zinc-800 dark:text-zinc-200 [&_iframe]:rounded-xl [&_iframe]:shadow-md"
                dangerouslySetInnerHTML={{ __html: renderRichContent(post.content) }}
              />

              <div className="pt-6 pb-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeLoading}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                    isLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50 hover:bg-rose-100'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700'
                  }`}
                >
                  <Heart className={`w-4 h-4 transition-transform ${isLiked ? 'fill-current text-rose-500 scale-110' : 'text-zinc-400'}`} />
                  <span>좋아요 {likesCount}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 상세창 맨 우측 하단: 빨간색 선 사이렌 아이콘과 신고 로 이루어진 빨간 테두리 버튼 */}
        {!isEditing && post && (
          <div className="absolute bottom-4 right-6 z-20">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-none text-xs font-bold transition shadow-sm"
              title="게시글 신고"
            >
              <Siren className="w-4 h-4 stroke-rose-600" />
              <span>신고</span>
            </button>
          </div>
        )}
      </div>

      {/* 세분화 신고 모달 */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        postId={postId}
        currentUserId={currentUserId}
      />

      {/* 공식 게시글 삭제 신청 팝업 */}
      {showRequestDeleteModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !requestSubmitting && setShowRequestDeleteModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">공식 게시글 삭제 신청</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">관리자 승인 후 영구 삭제 처리됩니다.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              공식 게시글은 관리자 승인 절차를 거칩니다. 신청 즉시 일반 사용자에게 비공개 처리되며 관리자 검토 후 삭제가 최종 결정됩니다.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                삭제 사유 (선택 사항)
              </label>
              <textarea
                value={deleteReasonText}
                onChange={(e) => setDeleteReasonText(e.target.value)}
                placeholder="삭제 사유를 상세히 입력해 주십시오."
                rows={3}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestDeleteModal(false)}
                disabled={requestSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitDeleteRequest}
                disabled={requestSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{requestSubmitting ? '신청 중...' : '신청 전송'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사진 전체보기 팝업 */}
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
          </div>
        </div>
      )}

      {/* 영구 삭제 확인 팝업 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setShowDeleteConfirm(false)}
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
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
