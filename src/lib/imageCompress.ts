// 업로드 전 대용량 사진 자동 축소 (스토리지 용량/트래픽 절감 + 사진 속 GPS 등 위치정보(EXIF) 제거)
// 휴대폰 화면에서는 육안 차이가 없는 수준으로만 줄이며, GIF(움짤)/SVG/WebP 는 원본 그대로 둡니다.

interface CompressOptions {
  /** 긴 변 최대 픽셀 */
  maxDimension: number
  /** JPEG 품질 (0~1) */
  quality: number
  /** 이 용량 미만이고 크기도 작으면 원본 유지 */
  minBytes: number
}

const SKIP_TYPES = /gif|svg|webp|avif/i

const loadImage = (file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })

export const compressImageFile = async (file: File, options: CompressOptions): Promise<File> => {
  try {
    if (typeof window === 'undefined' || !file.type.startsWith('image/') || SKIP_TYPES.test(file.type)) {
      return file
    }

    const { source, width, height, release } = await loadImage(file)
    try {
      const longest = Math.max(width, height)
      if (!longest) return file
      if (longest <= options.maxDimension && file.size < options.minBytes) return file

      const scale = Math.min(1, options.maxDimension / longest)
      const targetW = Math.max(1, Math.round(width * scale))
      const targetH = Math.max(1, Math.round(height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, targetW, targetH)

      const outputType = /png/i.test(file.type) ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, options.quality))
      if (!blob || blob.size >= file.size) return file

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
      const ext = outputType === 'image/png' ? 'png' : 'jpg'
      return new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() })
    } finally {
      release()
    }
  } catch {
    return file
  }
}

/** 게시글 본문 이미지용 (화질 우선) */
export const compressPostImage = (file: File) =>
  compressImageFile(file, { maxDimension: 2560, quality: 0.9, minBytes: 1.5 * 1024 * 1024 })

/** 댓글 첨부 이미지용 (작게 표시되므로 조금 더 축소) */
export const compressCommentImage = (file: File) =>
  compressImageFile(file, { maxDimension: 1600, quality: 0.85, minBytes: 600 * 1024 })
