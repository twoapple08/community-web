import { NextRequest, NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'

// 게시글/댓글 사진·동영상을 Cloudflare R2 에 바로 올릴 수 있는 "일회용 업로드 주소"를 발급
// - 파일은 브라우저 → R2 로 직접 전송 (Vercel 서버를 거치지 않음 → Vercel 용량/시간 제한과 무관)
// - R2 는 내려받기 트래픽(이그레스)이 무료 → Supabase Cached Egress 초과 문제 해결
// - R2 설정(환경변수)이 없으면 503 을 돌려주고, 브라우저는 예전처럼 Supabase Storage 에 올림

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// 버킷 이름은 예전 Supabase Storage 버킷 이름을 그대로 R2 안의 폴더 이름으로 사용
// (기존 파일 이전 시 주소 앞부분만 바꾸면 되도록)
const RULES: Record<string, { mime: RegExp; maxBytes: number }> = {
  posts: { mime: /^image\//, maxBytes: 20 * 1024 * 1024 },
  'comment-images': { mime: /^image\//, maxBytes: 10 * 1024 * 1024 },
  'post-videos': { mime: /^video\//, maxBytes: 50 * 1024 * 1024 },
}

// 파일 이름이 매번 무작위라 내용이 바뀔 일이 없음 → 브라우저/CDN 에 1년 보관
const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const UPLOAD_URL_TTL_SECONDS = 600

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(req: NextRequest) {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucketName = process.env.R2_BUCKET
  const publicBase = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBase) {
    return json({ error: 'r2_not_configured' }, 503)
  }

  // 로그인한 회원만 업로드 가능
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401)

  let body: { bucket?: unknown; ext?: unknown; contentType?: unknown; size?: unknown; prefix?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const bucket = typeof body.bucket === 'string' ? body.bucket : ''
  const rule = RULES[bucket]
  const contentType = typeof body.contentType === 'string' ? body.contentType.toLowerCase().slice(0, 100) : ''
  const size = typeof body.size === 'number' ? body.size : NaN
  if (!rule) return json({ error: 'bad_bucket' }, 400)
  if (!rule.mime.test(contentType) || /svg|html|xml/.test(contentType)) return json({ error: 'bad_type' }, 400)
  if (!Number.isInteger(size) || size <= 0 || size > rule.maxBytes) return json({ error: 'too_large' }, 413)

  const ext = (typeof body.ext === 'string' ? body.ext : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const prefix = typeof body.prefix === 'string' && /^[a-z]{1,10}-$/.test(body.prefix) ? body.prefix : ''
  const key = `${bucket}/${prefix}${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}.${ext}`

  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  const target = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`)
  target.searchParams.set('X-Amz-Expires', String(UPLOAD_URL_TTL_SECONDS))

  // 종류·크기·캐시 설정까지 서명에 포함 → 발급받은 주소로 다른 파일/다른 크기를 올릴 수 없음
  const headers = {
    'Content-Type': contentType,
    'Content-Length': String(size),
    'Cache-Control': MEDIA_CACHE_CONTROL,
  }
  const signed = await r2.sign(target.toString(), {
    method: 'PUT',
    headers,
    aws: { signQuery: true, allHeaders: true },
  })

  return json({
    uploadUrl: signed.url,
    // 브라우저는 Content-Length 를 직접 넣을 수 없음 (본문 크기로 자동 설정됨)
    headers: { 'Content-Type': contentType, 'Cache-Control': MEDIA_CACHE_CONTROL },
    publicUrl: `${publicBase}/${key}`,
  })
}
