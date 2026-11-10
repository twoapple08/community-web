// 기존 Supabase Storage 의 게시글/댓글 사진·동영상을 Cloudflare R2 로 복사 (한 번만 실행)
//
// - 원본은 지우지 않음 (복사만). 확인이 끝난 뒤 Supabase 대시보드에서 직접 지우면 됨
// - R2 안의 위치는 "버킷이름/파일경로" 그대로 → 글 속 주소는 앞부분만 바꾸면 됨
//   예) https://xxxx.supabase.co/storage/v1/object/public/posts/a.jpg → https://R2공개주소/posts/a.jpg
// - 이미 R2 에 있는 파일은 건너뜀 → 중간에 끊겨도 다시 실행하면 이어서 진행
// - 프로필 사진(avatars)은 DB 검증 규칙이 Supabase 주소를 요구해서 이전하지 않음 (512px·1년 캐시라 트래픽 미미)
//
// 필요한 환경변수:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   DRY_RUN=true 이면 목록만 세고 실제 복사는 안 함
//
// 실행: node scripts/migrate-storage-to-r2.mjs   (GitHub Actions "Storage → R2 이전" 에서도 실행 가능)

import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'

const BUCKETS = ['posts', 'post-images', 'post-videos', 'comment-images']
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const CONCURRENCY = 4

const need = (name) => {
  const v = process.env[name]
  if (!v) {
    console.error(`환경변수 ${name} 가 없습니다.`)
    process.exit(1)
  }
  return v
}

const SUPABASE_URL = need('SUPABASE_URL')
const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY')
const ACCOUNT_ID = need('R2_ACCOUNT_ID')
const R2_BUCKET = need('R2_BUCKET')
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const r2 = new AwsClient({
  accessKeyId: need('R2_ACCESS_KEY_ID'),
  secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
  service: 's3',
  region: 'auto',
})
const r2Url = (key) => `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`

// 폴더 안까지 전부 나열
const listAll = async (bucket, prefix = '') => {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) {
      // 버킷이 아예 없으면 건너뜀
      if (/not found/i.test(error.message)) return files
      throw new Error(`${bucket}/${prefix} 목록 조회 실패: ${error.message}`)
    }
    if (!data || data.length === 0) break
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) files.push(...(await listAll(bucket, path))) // 폴더
      else if (item.name !== '.emptyFolderPlaceholder') files.push({ path, size: item.metadata?.size ?? 0, type: item.metadata?.mimetype })
    }
    if (data.length < 1000) break
  }
  return files
}

const existsInR2 = async (key) => {
  const res = await r2.fetch(r2Url(key), { method: 'HEAD' })
  return res.ok
}

const copyOne = async (bucket, file) => {
  const key = `${bucket}/${file.path}`
  if (await existsInR2(key)) return 'skipped'

  const { data: blob, error } = await supabase.storage.from(bucket).download(file.path)
  if (error || !blob) throw new Error(`다운로드 실패 ${key}: ${error?.message}`)
  const body = new Uint8Array(await blob.arrayBuffer())

  const res = await r2.fetch(r2Url(key), {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || blob.type || 'application/octet-stream',
      'Cache-Control': CACHE_CONTROL,
    },
    body,
  })
  if (!res.ok) throw new Error(`R2 업로드 실패 ${key}: ${res.status} ${await res.text()}`)
  return 'copied'
}

const main = async () => {
  const stats = { copied: 0, skipped: 0, failed: 0, bytes: 0 }
  for (const bucket of BUCKETS) {
    const files = await listAll(bucket)
    const total = files.reduce((s, f) => s + (f.size || 0), 0)
    console.log(`[${bucket}] 파일 ${files.length}개, ${(total / 1024 / 1024).toFixed(1)}MB`)
    if (DRY_RUN) continue

    let i = 0
    const worker = async () => {
      while (i < files.length) {
        const file = files[i++]
        try {
          const result = await copyOne(bucket, file)
          stats[result]++
          if (result === 'copied') stats.bytes += file.size || 0
        } catch (err) {
          stats.failed++
          console.error(String(err instanceof Error ? err.message : err))
        }
        const done = stats.copied + stats.skipped + stats.failed
        if (done % 50 === 0) console.log(`  진행: ${done}개 처리`)
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  }

  if (DRY_RUN) {
    console.log('DRY_RUN: 실제 복사는 하지 않았습니다.')
    return
  }
  console.log(`완료: 복사 ${stats.copied}개 (${(stats.bytes / 1024 / 1024).toFixed(1)}MB), 이미 있음 ${stats.skipped}개, 실패 ${stats.failed}개`)
  if (stats.failed > 0) {
    console.error('실패한 파일이 있습니다. 다시 실행하면 실패한 것만 이어서 복사합니다.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
