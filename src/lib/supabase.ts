import { createClient } from '@supabase/supabase-js'
import { isApp } from '@/lib/appBridge'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co")!
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder")!

// [앱 전용] 실시간 연결의 심장박동(heartbeat)을 Web Worker 에서 돌림
// → 창이 트레이로 숨겨지거나 백그라운드라 타이머가 느려져도 연결이 끊기지 않아 알림을 계속 받음
// (일반 브라우저는 예전 설정 그대로, Worker 를 지원하지 않는 환경도 예전 설정)
const appRealtimeOptions =
  typeof window !== 'undefined' && typeof Worker !== 'undefined' && isApp()
    ? { realtime: { worker: true } }
    : {}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sfaclan_auth_session',
    // [보안] PKCE 방식: 로그인 직후 주소창에 access_token/refresh_token 이 절대 노출되지 않음
    // (일회용 code 만 잠깐 붙었다가 즉시 제거되며, 다른 기기/브라우저에서는 무용지물)
    flowType: 'pkce',
  },
  ...appRealtimeOptions,
})
