'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { supabase } from '@/lib/supabase'
import { isApp, openExternal } from '@/lib/appBridge'
import CustomPopup from '../CustomPopup'
import { Download, Loader2, Monitor, Smartphone } from 'lucide-react'

// 마이 프로필 > 앱 다운로드 (제작자·최고관리자 전용)
// - 설치 파일은 Supabase Storage 비공개 버킷(app-releases)에 GitHub Actions 가 올림
// - 버킷 읽기 권한은 sfa_is_senior_admin() 만 (SQL). 버튼을 누를 때마다 1분짜리 서명 주소를 발급
// - 버킷/파일이 아직 없으면(SQL 미적용·빌드 전) "아직 업로드된 파일이 없습니다" 로 표시

const RELEASE_BUCKET = 'app-releases'
const SIGNED_URL_SECONDS = 60

type ReleasePlatform = 'android' | 'windows'

/** {플랫폼}/latest.json 내용 (빌드 때 CI 가 같이 올림) */
interface ReleaseInfo {
  version: string
  builtAt: Date | null
  size: number | null
  /** 같은 폴더 안의 설치 파일 이름 */
  file: string
}

type ReleaseState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; info: ReleaseInfo }

interface PlatformMeta {
  title: string
  kind: string
  Icon: ComponentType<{ className?: string }>
  defaultFile: string
  downloadName: (version: string) => string
  guide: string[]
}

const PLATFORMS: Record<ReleasePlatform, PlatformMeta> = {
  android: {
    title: '안드로이드',
    kind: 'APK',
    Icon: Smartphone,
    defaultFile: 'sfaclan.apk',
    downloadName: (version) => `SFAClan-${version}.apk`,
    guide: [
      '다운로드한 APK 파일을 눌러 엽니다.',
      '설치가 막히면 설정 → 출처를 알 수 없는 앱 설치 허용',
      'Play 프로텍트 경고가 나오면 [무시하고 설치] (안 보이면 [세부정보 더보기]를 먼저 누르세요)',
      '새 버전도 같은 방법으로 설치하면 기존 앱이 업데이트됩니다.',
    ],
  },
  windows: {
    title: '윈도우',
    kind: '설치 파일',
    Icon: Monitor,
    defaultFile: 'sfaclan-setup.exe',
    downloadName: (version) => `SFAClan-Setup-${version}.exe`,
    guide: [
      '다운로드한 설치 파일(.exe)을 실행합니다.',
      'Windows의 PC 보호(SmartScreen) 창이 나오면 [추가 정보] → [실행]',
      '설치가 끝나면 시작 메뉴의 [스틱파이터 커뮤니티]로 실행합니다.',
    ],
  },
}

const PLATFORM_ORDER: ReleasePlatform[] = ['android', 'windows']

const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

/** latest.json 검사 (형식이 이상하면 null → 업로드된 파일 없음으로 표시) */
const parseReleaseInfo = (raw: unknown, platform: ReleasePlatform): ReleaseInfo | null => {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const version = typeof data.version === 'string' ? data.version.trim() : ''
  if (!SAFE_VERSION.test(version)) return null

  const builtAtRaw = typeof data.built_at === 'string' ? new Date(data.built_at) : null
  const builtAt = builtAtRaw && !Number.isNaN(builtAtRaw.getTime()) ? builtAtRaw : null
  const size = typeof data.size === 'number' && Number.isFinite(data.size) && data.size > 0 ? data.size : null
  const fileRaw = typeof data.file === 'string' ? data.file.trim() : ''
  // 폴더 이동(../) 등을 막기 위해 단순한 파일 이름만 허용
  const file = SAFE_FILE_NAME.test(fileRaw) && !fileRaw.includes('..') ? fileRaw : PLATFORMS[platform].defaultFile

  return { version, builtAt, size, file }
}

const fetchReleaseInfo = async (platform: ReleasePlatform): Promise<ReleaseInfo | null> => {
  try {
    // 새 빌드가 올라오면 바로 보이도록 브라우저 캐시를 쓰지 않음
    const { data, error } = await supabase.storage
      .from(RELEASE_BUCKET)
      .download(`${platform}/latest.json`, {}, { cache: 'no-store' })
    if (error || !data) return null
    return parseReleaseInfo(JSON.parse(await data.text()), platform)
  } catch {
    return null
  }
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** YYYY.MM.DD (보는 사람 기준 시간대) */
const formatReleaseDate = (date: Date | null) =>
  date ? `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}` : '-'

const formatReleaseSize = (bytes: number | null) => {
  if (!bytes) return '-'
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`
}

export default function AppDownloadView() {
  const [releases, setReleases] = useState<Record<ReleasePlatform, ReleaseState>>({
    android: { status: 'loading' },
    windows: { status: 'loading' },
  })
  const [downloading, setDownloading] = useState<ReleasePlatform | null>(null)
  const [errorPopup, setErrorPopup] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    PLATFORM_ORDER.forEach((platform) => {
      fetchReleaseInfo(platform).then((info) => {
        if (cancelled) return
        setReleases((prev) => ({
          ...prev,
          [platform]: info ? { status: 'ready', info } : { status: 'missing' },
        }))
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDownload = async (platform: ReleasePlatform) => {
    const state = releases[platform]
    if (state.status !== 'ready' || downloading) return
    const { info } = state
    setDownloading(platform)
    try {
      const { data, error } = await supabase.storage
        .from(RELEASE_BUCKET)
        .createSignedUrl(`${platform}/${info.file}`, SIGNED_URL_SECONDS, {
          download: PLATFORMS[platform].downloadName(info.version),
        })
      if (error || !data?.signedUrl) {
        setErrorPopup({
          title: '다운로드 실패',
          message: '다운로드 주소를 만들지 못했습니다. 파일이 아직 없거나 권한이 없을 수 있습니다. 잠시 후 다시 시도해 주세요.',
        })
        return
      }
      // 앱 안에서는 기기 기본 브라우저로 받음 (웹뷰는 파일 저장이 막혀 있을 수 있음)
      if (isApp()) await openExternal(data.signedUrl)
      else window.location.assign(data.signedUrl)
    } catch {
      setErrorPopup({ title: '다운로드 실패', message: '네트워크 오류로 다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="p-5 max-h-[70vh] overflow-y-auto overscroll-contain">
      <div className="space-y-3">
        {PLATFORM_ORDER.map((platform) => {
          const meta = PLATFORMS[platform]
          const state = releases[platform]
          const isDownloading = downloading === platform
          return (
            <section
              key={platform}
              className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <meta.Icon className="w-4 h-4" />
                </div>
                <h3 className="min-w-0 text-xs font-bold text-zinc-900 dark:text-white">
                  {meta.title} <span className="text-zinc-500 dark:text-zinc-400">({meta.kind})</span>
                </h3>
              </div>

              {state.status === 'loading' ? (
                <div className="py-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  <span>파일 정보를 불러오는 중...</span>
                </div>
              ) : state.status === 'missing' ? (
                <p className="py-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">아직 업로드된 파일이 없습니다</p>
              ) : (
                <dl className="grid grid-cols-3 gap-1.5 text-center">
                  {[
                    { label: '버전', value: state.info.version },
                    { label: '날짜', value: formatReleaseDate(state.info.builtAt) },
                    { label: '크기', value: formatReleaseSize(state.info.size) },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="min-w-0 px-1 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                    >
                      <dt className="text-[10px] text-zinc-500 dark:text-zinc-400">{item.label}</dt>
                      <dd className="mt-0.5 text-[11px] font-bold text-zinc-900 dark:text-white tabular-nums truncate">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <button
                type="button"
                onClick={() => handleDownload(platform)}
                disabled={state.status !== 'ready' || downloading !== null}
                className="w-full py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 inline-flex items-center justify-center gap-1.5"
              >
                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isDownloading ? '주소 만드는 중...' : '다운로드'}</span>
              </button>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                <h4 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider">설치 방법</h4>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug break-keep">
                  {meta.guide.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            </section>
          )
        })}

        <p className="px-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          파일 주소는 1분 동안만 유효합니다. 다운로드가 시작되지 않으면 버튼을 다시 눌러 주세요.
        </p>
      </div>

      <CustomPopup
        isOpen={Boolean(errorPopup)}
        title={errorPopup?.title || ''}
        message={errorPopup?.message || ''}
        onConfirm={() => setErrorPopup(null)}
        onCancel={() => setErrorPopup(null)}
      />
    </div>
  )
}
