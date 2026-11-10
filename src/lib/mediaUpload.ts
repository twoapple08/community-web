import { supabase } from '@/lib/supabase'

// 게시글/댓글 사진·동영상 업로드
// 1순위: Cloudflare R2 (내려받기 트래픽 무료) — /api/upload-url 에서 일회용 업로드 주소를 받아 직접 전송
// 2순위: R2 가 설정 전이거나 실패하면 예전처럼 Supabase Storage 에 업로드
// 어느 쪽이든 파일 이름이 매번 무작위라 내용이 바뀌지 않으므로 브라우저에 1년 보관(재다운로드 방지)

export type MediaBucket = 'posts' | 'post-videos' | 'comment-images'

const SUPABASE_CACHE_SECONDS = '31536000'

const extOf = (file: Blob, fileName: string) => {
  const fromName = fileName.includes('.') ? fileName.split('.').pop() || '' : ''
  const cleaned = fromName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (cleaned) return cleaned
  const fromType = (file.type.split('/')[1] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return fromType || 'bin'
}

const uploadToR2 = async (bucket: MediaBucket, file: Blob, contentType: string, ext: string, prefix: string): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null

    const res = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ bucket, ext, contentType, size: file.size, prefix }),
    })
    if (!res.ok) return null
    const info = (await res.json()) as { uploadUrl?: string; headers?: Record<string, string>; publicUrl?: string }
    if (!info.uploadUrl || !info.publicUrl) return null

    const put = await fetch(info.uploadUrl, { method: 'PUT', headers: info.headers, body: file })
    if (!put.ok) {
      console.warn('R2 upload failed:', put.status)
      return null
    }
    return info.publicUrl
  } catch (err) {
    console.warn('R2 upload error:', err)
    return null
  }
}

/** Supabase Storage 로 직접 업로드 (R2 를 쓸 수 없을 때의 예비 경로) */
export const uploadToSupabaseStorage = async (bucket: string, fileName: string, file: Blob, contentType?: string): Promise<string | null> => {
  try {
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
      contentType: contentType || file.type || undefined,
      cacheControl: SUPABASE_CACHE_SECONDS,
    })
    if (error) return null
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
    return data?.publicUrl || null
  } catch (err) {
    console.warn('Storage upload error:', err)
    return null
  }
}

/**
 * 사진/동영상을 올리고 공개 주소를 돌려줌 (실패 시 null)
 * @param fileName Supabase 예비 경로에서 쓸 파일 이름 (R2 는 서버가 이름을 새로 정함)
 * @param prefix  파일 이름 앞에 붙일 짧은 구분자 (예: 'thumb-', 'vid-', 'comment-')
 */
export const uploadMedia = async (
  bucket: MediaBucket,
  fileName: string,
  file: Blob,
  options: { contentType?: string; prefix?: string } = {},
): Promise<string | null> => {
  const contentType = (options.contentType || file.type || '').toLowerCase()
  if (contentType) {
    const r2Url = await uploadToR2(bucket, file, contentType, extOf(file, fileName), options.prefix || '')
    if (r2Url) return r2Url
  }
  return uploadToSupabaseStorage(bucket, fileName, file, contentType || undefined)
}
