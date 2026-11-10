// R2 미사용 파일 정리: DB 어디에서도 쓰이지 않는 사진·동영상을 trash/ 폴더로 옮김 (바로 지우지 않음)
//
// - "쓰이는 파일" 목록은 DB 함수 public.sfa_media_keys_in_use() 가 알려줌
//   (supabase/sfaclan_update_2026-11-10_r2_cleanup.sql 을 먼저 한 번 실행해야 함)
// - 올린 지 MIN_AGE_DAYS 일이 안 된 파일은 건드리지 않음 (지금 글 쓰는 중일 수 있음)
// - trash/ 로 옮긴 파일은 R2 수명 주기 규칙으로 30일 뒤 자동 삭제되게 설정 권장
//   그 전에는 MODE=restore 로 전부 원래 자리로 되돌릴 수 있음
//
// MODE=preview (기본): 옮길 파일 목록만 출력
// MODE=move          : 실제로 trash/ 로 옮김
// MODE=restore       : trash/ 안의 파일을 전부 원래 자리로 되돌림
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'

const MEDIA_PREFIXES = ['posts/', 'post-images/', 'post-videos/', 'comment-images/']
const TRASH = 'trash/'
const MIN_AGE_DAYS = 3

const need = (name) => {
  const v = process.env[name]
  if (!v) {
    console.error(`환경변수 ${name} 가 없습니다.`)
    process.exit(1)
  }
  return v
}

const MODE = (process.env.MODE || 'preview').toLowerCase()
if (!['preview', 'move', 'restore'].includes(MODE)) {
  console.error(`MODE 는 preview / move / restore 중 하나여야 합니다: ${MODE}`)
  process.exit(1)
}

const ACCOUNT_ID = need('R2_ACCOUNT_ID')
const BUCKET = need('R2_BUCKET')
const r2 = new AwsClient({
  accessKeyId: need('R2_ACCESS_KEY_ID'),
  secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
  service: 's3',
  region: 'auto',
})
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/')
const objectUrl = (key) => `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${encodeKey(key)}`

const xmlDecode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

// R2 버킷의 파일 전부 나열 (prefix 지정 가능)
const listObjects = async (prefix = '') => {
  const out = []
  let token = ''
  for (;;) {
    const url = new URL(`https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('max-keys', '1000')
    if (prefix) url.searchParams.set('prefix', prefix)
    if (token) url.searchParams.set('continuation-token', token)
    const res = await r2.fetch(url.toString())
    const xml = await res.text()
    if (!res.ok) throw new Error(`R2 목록 조회 실패: ${res.status} ${xml}`)
    for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || []) {
      const key = xmlDecode((block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || '')
      const modified = new Date((block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1] || 0)
      const size = Number((block.match(/<Size>(\d+)<\/Size>/) || [])[1] || 0)
      if (key) out.push({ key, modified, size })
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break
    token = xmlDecode((xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1] || '')
    if (!token) break
  }
  return out
}

// R2 에는 "이동"이 없어서 복사 후 원본 삭제
const moveObject = async (from, to) => {
  const copy = await r2.fetch(objectUrl(to), {
    method: 'PUT',
    headers: { 'x-amz-copy-source': `/${BUCKET}/${encodeKey(from)}` },
  })
  if (!copy.ok) throw new Error(`복사 실패 ${from} → ${to}: ${copy.status} ${await copy.text()}`)
  const del = await r2.fetch(objectUrl(from), { method: 'DELETE' })
  if (!del.ok && del.status !== 404) throw new Error(`원본 삭제 실패 ${from}: ${del.status}`)
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`

const runAll = async (pairs) => {
  let ok = 0
  let failed = 0
  for (const [from, to] of pairs) {
    try {
      await moveObject(from, to)
      ok++
      if (ok % 50 === 0) console.log(`  진행: ${ok}/${pairs.length}`)
    } catch (err) {
      failed++
      console.error(String(err instanceof Error ? err.message : err))
    }
  }
  return { ok, failed }
}

const restore = async () => {
  const trashed = await listObjects(TRASH)
  console.log(`trash/ 안의 파일 ${trashed.length}개를 원래 자리로 되돌립니다.`)
  const { ok, failed } = await runAll(trashed.map((o) => [o.key, o.key.slice(TRASH.length)]))
  console.log(`완료: 되돌림 ${ok}개, 실패 ${failed}개`)
  if (failed > 0) process.exit(1)
}

const cleanup = async () => {
  const supabase = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('sfa_media_keys_in_use')
  if (error) throw new Error(`DB 에서 사용 중인 파일 목록을 못 가져왔습니다 (정리용 SQL 을 먼저 실행했는지 확인): ${error.message}`)
  const inUse = new Set()
  for (const raw of Array.isArray(data) ? data : []) {
    try {
      inUse.add(decodeURIComponent(String(raw)))
    } catch {
      inUse.add(String(raw))
    }
  }

  const all = (await listObjects()).filter((o) => MEDIA_PREFIXES.some((p) => o.key.startsWith(p)))
  const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000
  const unused = all.filter((o) => !inUse.has(o.key))
  const targets = unused.filter((o) => o.modified.getTime() < cutoff)
  const tooNew = unused.length - targets.length

  console.log(`R2 사진·동영상 ${all.length}개 / DB 에서 사용 중 ${inUse.size}개`)
  console.log(`안 쓰이는 파일 ${unused.length}개 (그중 ${MIN_AGE_DAYS}일 안 된 ${tooNew}개는 이번엔 건너뜀)`)
  console.log(`정리 대상 ${targets.length}개, ${mb(targets.reduce((s, o) => s + o.size, 0))}`)
  for (const o of targets.slice(0, 200)) console.log(`  - ${o.key} (${mb(o.size)}, ${o.modified.toISOString().slice(0, 10)})`)
  if (targets.length > 200) console.log(`  ... 외 ${targets.length - 200}개`)

  // 안전장치: DB 목록이 비어 있는데 R2 에 파일이 있으면 뭔가 잘못된 것 → 아무것도 옮기지 않음
  if (all.length > 0 && inUse.size === 0) {
    throw new Error('DB 에서 사용 중인 파일이 0개로 나왔습니다. 잘못 지우지 않도록 중단합니다.')
  }

  if (MODE !== 'move') {
    console.log('미리보기라 실제로 옮기지는 않았습니다. 실행하려면 mode 를 move 로 선택하세요.')
    return
  }
  const { ok, failed } = await runAll(targets.map((o) => [o.key, `${TRASH}${o.key}`]))
  console.log(`완료: trash/ 로 옮김 ${ok}개, 실패 ${failed}개`)
  if (failed > 0) process.exit(1)
}

;(MODE === 'restore' ? restore() : cleanup()).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
