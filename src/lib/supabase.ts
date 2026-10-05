import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co")!
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder")!

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
})
