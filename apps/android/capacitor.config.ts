// 스틱파이터 커뮤니티 안드로이드 앱 설정 (Capacitor 8)
// - 앱은 실서버(https://www.sfaclan.com)를 그대로 불러온다 → 사이트를 배포하면 앱 화면도 자동으로 최신
// - `npx cap sync android` 때 이 파일이 실행되어 android/app/src/main/assets/capacitor.config.json 으로 저장된다.
//   그래서 User-Agent 에 붙는 버전·푸시 표시는 "sync 하는 순간" 의 package.json / google-services.json 기준이다.
//   (CI 는 google-services.json 을 먼저 만든 뒤 sync 한다)
import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// 이 파일이 있는 폴더(apps/android). cap CLI 가 CommonJS 로 변환해 실행하므로 보통 __dirname 이 있고,
// 없으면(ESM 으로 직접 불러온 경우) cap 명령을 실행한 폴더(apps/android)를 씀
const APP_DIR = typeof __dirname === 'string' ? __dirname : process.cwd();

// 앱 버전 = apps/android/package.json 의 version (빌드 번호는 CI 의 ANDROID_VERSION_CODE)
const APP_VERSION: string = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')).version;

// Firebase 설정 파일이 있으면 FCM 푸시가 들어간 빌드 → 사이트가 푸시 등록을 하도록 UA 에 표시
// (CI 에서는 GOOGLE_SERVICES_JSON 시크릿이 있을 때만 이 파일을 만든 뒤 sync 한다)
const HAS_FIREBASE = existsSync(join(APP_DIR, 'android', 'app', 'google-services.json'));

// 사이트(src/lib/appBridge.ts)가 앱 안인지 알아내는 표시. 형식을 바꾸면 사이트 쪽 정규식도 같이 바꿔야 함
// 기존 User-Agent 끝에 공백 하나를 두고 덧붙여진다 → "... SFAClanApp/1.0.0 (android) SFAClanPush/1"
const USER_AGENT_SUFFIX = `SFAClanApp/${APP_VERSION} (android)` + (HAS_FIREBASE ? ' SFAClanPush/1' : '');

const config: CapacitorConfig = {
  appId: 'com.sfaclan.community',
  appName: '스틱파이터 커뮤니티',
  // 앱에 들어가는 파일은 www/index.html(자리표시)과 www/offline.html(연결 실패 화면)뿐
  webDir: 'www',
  appendUserAgent: USER_AGENT_SUFFIX,
  server: {
    url: 'https://www.sfaclan.com',
    androidScheme: 'https',
    // 인터넷이 끊겼거나 페이지를 못 불러오면 앱에 들어 있는 www/offline.html 을 보여 줌
    errorPath: 'offline.html',
    // 앱 안에서 열어도 되는 주소 (그 밖의 주소는 기기 기본 브라우저로 열림)
    allowNavigation: ['www.sfaclan.com', 'sfaclan.com'],
  },
  android: {
    // 실서버(https)만 불러오므로 http 혼합 콘텐츠·웹뷰 디버깅은 끔
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // 상태바·내비게이션바 영역은 MainActivity 가 직접 처리한다.
    // 사이트는 viewport-fit=cover 를 쓰지만 safe-area 여백이 없어서, Capacitor 기본 처리(css/native)로 두면
    // 안드로이드 15+ 에서 웹뷰가 막대 아래까지 늘어나 화면 위·아래가 가려진다 → 끄고 MainActivity 가 항상 여백을 줌
    SystemBars: {
      insetsHandling: 'disable',
      style: 'DEFAULT',
    },
    // 막대 색·아이콘 색은 사이트가 테마에 맞춰 StatusBar.setStyle / setBackgroundColor 로 알려 주면
    // MainActivity(SiteStatusBarPlugin)가 상태바·내비게이션바 영역에 똑같이 칠한다.
    // overlaysWebView=true 는 MainActivity 의 전체 화면(edge-to-edge) 배치와 같은 설정이라 서로 부딪히지 않음
    StatusBar: {
      overlaysWebView: true,
      style: 'DEFAULT',
    },
    // 시작 화면: 흰 배경 + 가운데 로고 (안드로이드 12+ 는 시스템 시작 화면, 이전 버전은 같은 모양으로 흉내)
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      // 0: 안드로이드 12/12L 에서 시작 화면이 사라질 때 상태바·내비게이션바 아이콘 색이 기본값으로 되돌아가던 문제 방지
      //    (페이드 애니메이션을 쓰면 androidx 가 막대 모양을 테마 기본값으로 다시 칠함)
      launchFadeOutDuration: 0,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    // 'alert' 등을 넣으면 앱이 켜져 있을 때 플러그인이 푸시를 직접 띄워,
    // 사이트가 LocalNotifications 로 다시 띄우는 알림과 두 번 뜬다 → 비워 둠
    PushNotifications: {
      presentationOptions: [],
    },
    // 사이트가 띄우는 앱 알림의 작은 아이콘(res/drawable/ic_stat_notify.xml, 흰색 종)과 강조색
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#10b981',
    },
  },
};

export default config;
