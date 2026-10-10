//! 스틱파이터 커뮤니티 윈도우 앱 (Tauri v2 껍데기)
//!
//! 실서버 사이트(https://www.sfaclan.com)를 앱 창에 그대로 불러오고, 사이트가 할 수 없는 일만 앱이 맡는다.
//! - 앱 표시: 페이지 스크립트보다 먼저 `window.__SFACLAN_APP__ = { platform: 'windows', version }` 를 넣음
//! - 사이트 ⇄ 앱 약속 (사이트: src/lib/appBridge.ts, src/lib/appNotify.ts)
//!   - 명령: sfa_open_external, sfa_notify, sfa_get_close_behavior, sfa_set_close_behavior,
//!     sfa_close_decision, sfa_app_ready, sfa_take_pending
//!   - 이벤트(앱 → 사이트): sfa:deep-link, sfa:notification-click, sfa:close-requested
//! - 다른 사이트 주소(구글 로그인 포함)는 앱 창에서 열지 않고 기본 브라우저로 넘긴다
//! - 로그인: 기본 브라우저에서 로그인 → sfaclan://auth-callback?code=... 딥링크로 앱에 돌아옴
//! - 창 닫기(X): 설정에 따라 묻기(사이트 팝업) / 종료 / 트레이로 숨기기
//! - 단일 실행: 두 번째 실행(딥링크 포함)은 이미 켜진 창을 앞으로 가져오고 딥링크를 넘겨줌

#[cfg(windows)]
mod notify;

use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, LogicalSize, Manager, State, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

// ---------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------

/// 메인 창 이름 (capabilities/main.json 의 windows 와 같아야 함)
const MAIN_LABEL: &str = "main";
const APP_TITLE: &str = "스틱파이터 커뮤니티";

/// 앱으로 취급하는 사이트 주소 (capabilities/main.json 의 remote.urls 와 같아야 함)
const APP_HOSTS: [&str; 2] = ["www.sfaclan.com", "sfaclan.com"];
/// 앱 안 페이지(dist/index.html) 주소의 호스트 (윈도우: http://tauri.localhost/)
const LOCAL_HOST: &str = "tauri.localhost";
/// 딥링크 주소 형식 sfaclan://... (tauri.conf.json 의 plugins.deep-link.desktop.schemes)
const DEEP_LINK_SCHEME: &str = "sfaclan";

const DEFAULT_WIDTH: f64 = 1100.0;
const DEFAULT_HEIGHT: f64 = 800.0;
const MIN_WIDTH: f64 = 360.0;
const MIN_HEIGHT: f64 = 560.0;
const POPUP_WIDTH: f64 = 900.0;
const POPUP_HEIGHT: f64 = 720.0;

/// WebView2 실행 옵션
/// - 앞부분은 wry 기본값(미니 메뉴·SmartScreen 끄기). 이 값을 지정하면 기본값이 대체되므로 함께 적어 둠
/// - 뒷부분: 창을 트레이로 숨겨도 사이트의 알림 확인(실시간 연결·60초 확인)이 느려지지 않게 백그라운드 절전 끄기
/// - 보조 창도 반드시 같은 값을 써야 함 (같은 WebView2 데이터 폴더를 공유)
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

/// 앱 → 사이트 이벤트 이름
const EVENT_DEEP_LINK: &str = "sfa:deep-link";
const EVENT_NOTIFICATION_CLICK: &str = "sfa:notification-click";
const EVENT_CLOSE_REQUESTED: &str = "sfa:close-requested";

/// 앱 설정 파일 (%APPDATA%\com.sfaclan.community\settings.json)
const SETTINGS_FILE: &str = "settings.json";

/// 사이트가 보내는 알림 글자 길이 제한
const MAX_TITLE_CHARS: usize = 120;
const MAX_BODY_CHARS: usize = 500;
const MAX_NOTIFICATION_DATA_BYTES: usize = 4096;
const MAX_DEEP_LINK_BYTES: usize = 8192;

/// 디버그 빌드에서만 콘솔에 남기는 기록
macro_rules! debug_log {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            eprintln!("[sfaclan] {}", format_args!($($arg)*));
        }
    };
}

/// 창 크기·위치·최대화만 기억 (보이기 여부는 저장하지 않음: 트레이에 숨긴 채 종료해도 다음 실행 때 창이 보이게)
fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

// ---------------------------------------------------------------------
// 상태 · 설정
// ---------------------------------------------------------------------

/// 창 닫기(X) 동작
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum CloseBehavior {
    /// 사이트 팝업으로 물어봄 (기본)
    #[default]
    Ask,
    /// 바로 종료
    Exit,
    /// 트레이로 숨김 (알림은 계속 받음)
    Tray,
}

impl CloseBehavior {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "ask" => Some(Self::Ask),
            "exit" => Some(Self::Exit),
            "tray" => Some(Self::Tray),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Ask => "ask",
            Self::Exit => "exit",
            Self::Tray => "tray",
        }
    }
}

/// settings.json 내용 (모르는 값·깨진 파일은 기본값으로)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    close_behavior: CloseBehavior,
}

#[derive(Default)]
struct Inner {
    /// 사이트가 듣기 준비를 마쳤는지 (sfa_app_ready). 메인 창이 새 페이지를 불러오기 시작하면 false
    page_ready: bool,
    /// 사이트가 준비되기 전에 들어온 딥링크·알림 클릭 (sfa_take_pending 으로 꺼내 감)
    pending_deep_link: Option<String>,
    pending_notification: Option<String>,
    settings: Settings,
    /// 트레이 아이콘을 만들었는지 (실패했으면 '트레이로 숨기기' 대신 최소화)
    tray_ready: bool,
}

#[derive(Default)]
struct AppState {
    inner: Mutex<Inner>,
    settings_path: Mutex<Option<PathBuf>>,
}

impl AppState {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn close_behavior(&self) -> CloseBehavior {
        self.lock().settings.close_behavior
    }

    /// 앱 설정 폴더에서 settings.json 을 읽어 옴 (실행 시 한 번)
    fn load_settings(&self, app: &AppHandle) {
        let Ok(dir) = app.path().app_config_dir() else {
            return;
        };
        let path = dir.join(SETTINGS_FILE);
        let settings = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Settings>(&bytes).ok())
            .unwrap_or_default();
        self.lock().settings = settings;
        *self
            .settings_path
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(path);
    }

    /// 창 닫기 동작을 바꾸고 파일에 저장
    fn set_close_behavior(&self, behavior: CloseBehavior) -> Result<(), String> {
        let settings = {
            let mut inner = self.lock();
            inner.settings.close_behavior = behavior;
            inner.settings.clone()
        };
        self.save_settings(&settings)
    }

    fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        let path = self
            .settings_path
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
            .ok_or_else(|| "설정 파일 위치를 찾지 못했습니다.".to_string())?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|error| error.to_string())?;
        }
        let json = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
        // 임시 파일에 쓴 뒤 바꿔치기 (쓰는 도중 꺼져도 설정 파일이 깨지지 않게)
        let temp_path = path.with_extension("json.tmp");
        fs::write(&temp_path, json).map_err(|error| error.to_string())?;
        fs::rename(&temp_path, &path).map_err(|error| error.to_string())
    }
}

// ---------------------------------------------------------------------
// 주소 판별 · 기본 브라우저
// ---------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UrlKind {
    /// 사이트 주소 (앱 안에서 엶)
    App,
    /// 앱 안 페이지 (dist/index.html)
    Local,
    /// about:blank
    Blank,
    /// 다른 사이트·메일 (기본 프로그램으로 넘김)
    External,
    /// 그 밖의 주소 (file:, javascript:, 알 수 없는 프로토콜 등) → 막음
    Blocked,
}

fn classify_url(url: &Url) -> UrlKind {
    match url.scheme() {
        "about" if url.path() == "blank" => UrlKind::Blank,
        "http" | "https" => {
            let host = url.host_str().unwrap_or_default();
            if host == LOCAL_HOST {
                UrlKind::Local
            } else if APP_HOSTS.contains(&host) && url.port().is_none() {
                UrlKind::App
            } else {
                UrlKind::External
            }
        }
        "mailto" => UrlKind::External,
        _ => UrlKind::Blocked,
    }
}

/// 기본 브라우저(메일은 기본 메일 앱)로 열기. 창 이벤트 처리를 막지 않게 별도 스레드에서 실행
fn open_external(url: Url) {
    std::thread::spawn(move || {
        if let Err(error) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
            debug_log!("기본 브라우저로 열기 실패: {error}");
        }
    });
}

/// 앱 창 안에서의 이동 규칙 (메인 창·보조 창 공통). true = 앱 안에서 이동
fn allow_in_app_navigation(url: &Url) -> bool {
    match classify_url(url) {
        UrlKind::App | UrlKind::Local | UrlKind::Blank => true,
        UrlKind::External => {
            open_external(url.clone());
            false
        }
        UrlKind::Blocked => {
            debug_log!("막은 주소: {url}");
            false
        }
    }
}

/// 새 창 요청(target=_blank, window.open) 처리 (메인 창·보조 창 공통)
/// - 다른 사이트 → 기본 브라우저 / 같은 사이트·빈 창 → 앱 안 보조 창 / 그 밖 → 막음
fn handle_new_window(
    app: &AppHandle,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<Wry> {
    match classify_url(&url) {
        UrlKind::App | UrlKind::Blank => match create_popup_window(app, features) {
            Ok(window) => NewWindowResponse::Create { window },
            Err(error) => {
                debug_log!("보조 창 만들기 실패: {error}");
                if classify_url(&url) == UrlKind::App {
                    open_external(url);
                }
                NewWindowResponse::Deny
            }
        },
        UrlKind::External => {
            open_external(url);
            NewWindowResponse::Deny
        }
        UrlKind::Local | UrlKind::Blocked => NewWindowResponse::Deny,
    }
}

// ---------------------------------------------------------------------
// 창
// ---------------------------------------------------------------------

/// 메인 창 만들기 (보이지 않는 상태로 만든 뒤 크기·위치를 복원하고 보여 줌 → 깜빡임 방지)
fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let version = app.package_info().version.to_string();
    let version_json = serde_json::to_string(&version).unwrap_or_else(|_| "\"\"".to_string());
    // 사이트(src/lib/appBridge.ts getAppPlatform)가 윈도우 앱인지 알아보는 표시 (페이지 스크립트보다 먼저 실행됨)
    let init_script = format!(
        "window.__SFACLAN_APP__ = Object.freeze({{ platform: 'windows', version: {version_json} }});"
    );

    let new_window_app = app.clone();

    WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::App("index.html".into()))
        .title(APP_TITLE)
        .inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .resizable(true)
        .maximizable(true)
        .center()
        .visible(false)
        // 사이트의 끌어다 놓기(이미지 올리기 등)가 브라우저와 똑같이 동작하도록 앱의 파일 끌어다 놓기 처리를 끔
        .disable_drag_drop_handler()
        .additional_browser_args(BROWSER_ARGS)
        .initialization_script(init_script)
        .on_navigation(allow_in_app_navigation)
        .on_new_window(move |url, features| handle_new_window(&new_window_app, url, features))
        .on_page_load(|window, payload| {
            // 새 페이지를 불러오기 시작하면 사이트가 다시 sfa_app_ready 를 부를 때까지 '준비 안 됨'
            if matches!(payload.event(), PageLoadEvent::Started) {
                if let Some(state) = window.try_state::<AppState>() {
                    state.lock().page_ready = false;
                }
            }
        })
        .build()
}

/// 보조 창 (같은 사이트를 새 창으로 열 때. 예: 약관 동의 창의 개인정보처리방침 링크)
/// - 앱 명령 권한이 없는 일반 웹 화면 (capabilities 는 메인 창에만 있음)
/// - 이동 규칙은 메인 창과 같음. 빈 창으로 열린 뒤 바로 바깥 주소로 가면 기본 브라우저로 넘기고 빈 창은 닫음
fn create_popup_window(
    app: &AppHandle,
    features: NewWindowFeatures,
) -> tauri::Result<WebviewWindow> {
    static POPUP_SEQ: AtomicU64 = AtomicU64::new(1);
    let label = format!("popup-{}", POPUP_SEQ.fetch_add(1, Ordering::Relaxed));

    let nav_app = app.clone();
    let nav_label = label.clone();
    // 사이트 페이지를 한 번이라도 열었는지 (아니면 빈 창)
    let has_page = Arc::new(AtomicBool::new(false));
    let new_window_app = app.clone();

    // 실제 주소는 WebView2 가 새 창 요청에 맞춰 바로 불러옴
    let blank = Url::parse("about:blank").map_err(tauri::Error::InvalidUrl)?;

    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
        .title(APP_TITLE)
        .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .resizable(true)
        .window_features(features)
        .disable_drag_drop_handler()
        .additional_browser_args(BROWSER_ARGS)
        .on_navigation(move |url| {
            let kind = classify_url(url);
            if matches!(kind, UrlKind::App | UrlKind::Local) {
                has_page.store(true, Ordering::Relaxed);
            }
            let allowed = allow_in_app_navigation(url);
            if kind == UrlKind::External && !has_page.load(Ordering::Relaxed) {
                close_window_later(&nav_app, &nav_label);
            }
            allowed
        })
        .on_new_window(move |url, features| handle_new_window(&new_window_app, url, features))
        .build()
}

/// 창 닫기를 이벤트 처리가 끝난 뒤에 하도록 다른 스레드에서 요청
fn close_window_later(app: &AppHandle, label: &str) {
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    });
}

/// 저장된 크기·위치·최대화 상태 복원 + 최소 크기 보장
fn restore_main_window_state(window: &WebviewWindow) {
    if let Err(error) = window.restore_state(window_state_flags()) {
        debug_log!("창 상태 복원 실패: {error}");
    }
    let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) else {
        return;
    };
    let logical = size.to_logical::<f64>(scale);
    if logical.width < MIN_WIDTH || logical.height < MIN_HEIGHT {
        let _ = window.set_size(LogicalSize::new(
            logical.width.max(MIN_WIDTH),
            logical.height.max(MIN_HEIGHT),
        ));
    }
}

/// 메인 창 보이기 + 최소화 풀기 + 앞으로 가져오기
fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    let _ = window.show();
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.set_focus();
}

/// 메인 창을 트레이로 숨김 (트레이 아이콘이 없으면 최소화)
fn hide_main_window_to_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    // 숨긴 채 컴퓨터가 꺼져도 창 크기·위치가 남도록 지금 저장
    let _ = app.save_window_state(window_state_flags());
    let tray_ready = app
        .try_state::<AppState>()
        .map(|state| state.lock().tray_ready)
        .unwrap_or(false);
    if tray_ready {
        let _ = window.hide();
    } else {
        let _ = window.minimize();
    }
}

/// 앱 완전 종료 (창 상태는 window-state 플러그인이 종료 이벤트에서 저장)
fn exit_app(app: &AppHandle) {
    app.exit(0);
}

/// 메인 창 닫기(X, Alt+F4, 작업 표시줄 '창 닫기') 요청 처리
fn handle_main_close_request(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        exit_app(app);
        return;
    };
    let (behavior, page_ready) = {
        let inner = state.lock();
        (inner.settings.close_behavior, inner.page_ready)
    };
    match behavior {
        CloseBehavior::Exit => exit_app(app),
        CloseBehavior::Tray => hide_main_window_to_tray(app),
        CloseBehavior::Ask => {
            // 사이트가 준비돼 있으면 사이트 팝업으로 물어봄 (최소화돼 있어도 팝업이 보이게 창을 먼저 띄움)
            // 준비 안 됨(불러오는 중·오프라인 화면) → 물어볼 화면이 없으므로 종료
            if page_ready {
                show_main_window(app);
                if app.emit_to(MAIN_LABEL, EVENT_CLOSE_REQUESTED, ()).is_ok() {
                    return;
                }
            }
            exit_app(app);
        }
    }
}

// ---------------------------------------------------------------------
// 딥링크 · 알림 클릭 전달
// ---------------------------------------------------------------------

#[derive(Clone, Copy)]
#[cfg_attr(not(windows), allow(dead_code))]
enum PendingKind {
    DeepLink,
    Notification,
}

/// 사이트로 전달 (준비됐으면 이벤트, 아니면 sfa_take_pending 으로 꺼내 가도록 보관). 창은 항상 앞으로
fn deliver_to_site(app: &AppHandle, kind: PendingKind, payload: String) {
    show_main_window(app);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    let page_ready = state.lock().page_ready;
    if page_ready {
        let event = match kind {
            PendingKind::DeepLink => EVENT_DEEP_LINK,
            PendingKind::Notification => EVENT_NOTIFICATION_CLICK,
        };
        if app.emit_to(MAIN_LABEL, event, payload.clone()).is_ok() {
            return;
        }
    }

    let mut inner = state.lock();
    match kind {
        PendingKind::DeepLink => inner.pending_deep_link = Some(payload),
        PendingKind::Notification => inner.pending_notification = Some(payload),
    }
}

/// sfaclan://... 주소만 받음
fn normalize_deep_link(url: &Url) -> Option<String> {
    if url.scheme() != DEEP_LINK_SCHEME {
        return None;
    }
    let value = url.as_str();
    (value.len() <= MAX_DEEP_LINK_BYTES).then(|| value.to_string())
}

/// 설치 프로그램이 등록한 sfaclan:// 연결이 이 실행 파일을 가리키지 않으면 다시 등록 (개발용 실행·설치 폴더 이동 대비)
fn ensure_deep_link_registered(app: &AppHandle) {
    let deep_link = app.deep_link();
    if deep_link.is_registered(DEEP_LINK_SCHEME).unwrap_or(false) {
        return;
    }
    if let Err(error) = deep_link.register_all() {
        debug_log!("딥링크 등록 실패: {error}");
    }
}

// ---------------------------------------------------------------------
// 트레이
// ---------------------------------------------------------------------

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip(APP_TITLE)
        .menu(&menu)
        // 왼쪽 클릭은 창 열기, 메뉴는 오른쪽 클릭
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            // '종료'는 닫기 설정과 관계없이 항상 완전히 종료
            "quit" => exit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------
// 사이트가 부르는 명령 (권한: capabilities/main.json, 목록: build.rs)
// ---------------------------------------------------------------------

/// 알림 글자 정리: 제어 문자 제거, 길이 제한
fn clean_text(value: &str, max_chars: usize) -> String {
    let cleaned: String = value
        .chars()
        .filter(|c| (!c.is_control() || *c == '\n') && *c != '\u{FFFE}' && *c != '\u{FFFF}')
        .take(max_chars)
        .collect();
    cleaned.trim().to_string()
}

/// 기본 브라우저로 열기 (http/https 만)
#[tauri::command]
fn sfa_open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(url.trim()).map_err(|_| "올바르지 않은 주소입니다.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("http/https 주소만 열 수 있습니다.".to_string());
    }
    open_external(parsed);
    Ok(())
}

/// 윈도우 알림 띄우기. 누르면 창을 앞으로 가져오고 sfa:notification-click(data) 전달
#[tauri::command]
async fn sfa_notify(
    app: AppHandle,
    title: String,
    body: String,
    data: String,
) -> Result<(), String> {
    if data.len() > MAX_NOTIFICATION_DATA_BYTES {
        return Err("알림 데이터가 너무 깁니다.".to_string());
    }
    let mut title = clean_text(&title, MAX_TITLE_CHARS);
    if title.is_empty() {
        title = APP_TITLE.to_string();
    }
    let body = clean_text(&body, MAX_BODY_CHARS);

    #[cfg(windows)]
    {
        let app_id = notify::app_user_model_id(&app.config().identifier);
        let click_app = app.clone();
        notify::show(&app_id, &title, &body, move || {
            deliver_to_site(&click_app, PendingKind::Notification, data.clone());
        })
        .map_err(|error| error.to_string())
    }

    #[cfg(not(windows))]
    {
        let _ = (app, title, body, data);
        Err("윈도우에서만 지원합니다.".to_string())
    }
}

/// 창 닫기 동작 ('ask' | 'exit' | 'tray')
#[tauri::command]
fn sfa_get_close_behavior(state: State<'_, AppState>) -> String {
    state.close_behavior().as_str().to_string()
}

#[tauri::command]
fn sfa_set_close_behavior(state: State<'_, AppState>, behavior: String) -> Result<(), String> {
    let behavior =
        CloseBehavior::parse(&behavior).ok_or_else(|| "알 수 없는 닫기 동작입니다.".to_string())?;
    state.set_close_behavior(behavior)
}

/// 창 닫기 팝업에서 고른 결과 ('exit' | 'tray' | 'cancel'), remember 면 다음부터 묻지 않음
#[tauri::command]
fn sfa_close_decision(
    app: AppHandle,
    state: State<'_, AppState>,
    action: String,
    remember: bool,
) -> Result<(), String> {
    let behavior = match action.as_str() {
        "exit" => Some(CloseBehavior::Exit),
        "tray" => Some(CloseBehavior::Tray),
        "cancel" => None,
        _ => return Err("알 수 없는 선택입니다.".to_string()),
    };
    // 종료 전에 먼저 저장 (저장에 실패해도 고른 동작은 실행)
    let saved = match (remember, behavior) {
        (true, Some(behavior)) => state.set_close_behavior(behavior),
        _ => Ok(()),
    };
    match behavior {
        Some(CloseBehavior::Exit) => exit_app(&app),
        Some(CloseBehavior::Tray) => hide_main_window_to_tray(&app),
        _ => {}
    }
    saved
}

/// 사이트가 이벤트 듣기 준비를 마침
#[tauri::command]
fn sfa_app_ready(state: State<'_, AppState>) {
    state.lock().page_ready = true;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingPayload {
    deep_link: Option<String>,
    notification: Option<String>,
}

/// 사이트가 준비되기 전에 들어온 딥링크·알림 클릭을 꺼내 감 (꺼내면 비움)
#[tauri::command]
fn sfa_take_pending(state: State<'_, AppState>) -> PendingPayload {
    let mut inner = state.lock();
    PendingPayload {
        deep_link: inner.pending_deep_link.take(),
        notification: inner.pending_notification.take(),
    }
}

// ---------------------------------------------------------------------
// 오프라인 화면 (윈도우)
// ---------------------------------------------------------------------

/// 사이트를 불러오지 못했을 때(인터넷 끊김·서버 연결 실패) WebView2 오류 화면 대신 앱 안 오프라인 화면(dist/index.html)으로 보냄
#[cfg(windows)]
fn install_offline_fallback(window: &WebviewWindow) {
    let result = window.with_webview(|webview| {
        use webview2_com::{
            Microsoft::Web::WebView2::Win32::{
                COREWEBVIEW2_WEB_ERROR_STATUS, COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT,
                COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED,
                COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET,
                COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED,
                COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED,
                COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE,
                COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT,
            },
            NavigationCompletedEventHandler,
        };
        use windows::core::{BOOL, HSTRING, PWSTR};

        const CONNECTION_ERRORS: [COREWEBVIEW2_WEB_ERROR_STATUS; 7] = [
            COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT,
            COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE,
            COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED,
            COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET,
            COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED,
            COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT,
            COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED,
        ];

        let core = match unsafe { webview.controller().CoreWebView2() } {
            Ok(core) => core,
            Err(error) => {
                debug_log!("WebView2 가져오기 실패: {error}");
                return;
            }
        };

        let handler = NavigationCompletedEventHandler::create(Box::new(|sender, args| {
            let (Some(sender), Some(args)) = (sender, args) else {
                return Ok(());
            };

            let mut success = BOOL::default();
            unsafe { args.IsSuccess(&mut success)? };
            if success.as_bool() {
                return Ok(());
            }

            // 연결 문제일 때만 (앱이 막은 이동·사용자가 멈춘 경우 등은 그대로 둠)
            let mut status = COREWEBVIEW2_WEB_ERROR_STATUS::default();
            unsafe { args.WebErrorStatus(&mut status)? };
            if !CONNECTION_ERRORS.contains(&status) {
                return Ok(());
            }

            let mut source = PWSTR::null();
            unsafe { sender.Source(&mut source)? };
            let source = webview2_com::take_pwstr(source);
            let Ok(failed_url) = Url::parse(&source) else {
                return Ok(());
            };
            if classify_url(&failed_url) != UrlKind::App {
                return Ok(());
            }

            let Some(offline_url) = offline_page_url(&failed_url) else {
                return Ok(());
            };
            unsafe { sender.Navigate(&HSTRING::from(offline_url.as_str()))? };
            Ok(())
        }));

        let mut token = 0i64;
        if let Err(error) = unsafe { core.add_NavigationCompleted(&handler, &mut token) } {
            debug_log!("오프라인 화면 연결 실패: {error}");
        }
    });
    if let Err(error) = result {
        debug_log!("오프라인 화면 연결 실패: {error}");
    }
}

/// 오프라인 화면 주소: http://tauri.localhost/index.html?offline=1&to=<원래 주소>
#[cfg(windows)]
fn offline_page_url(failed_url: &Url) -> Option<Url> {
    let mut url = Url::parse(&format!("http://{LOCAL_HOST}/index.html")).ok()?;
    url.query_pairs_mut()
        .append_pair("offline", "1")
        .append_pair("to", failed_url.as_str());
    Some(url)
}

// ---------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        // 단일 실행: 반드시 첫 번째 플러그인 (두 번째 실행은 여기서 딥링크를 넘기고 바로 끝남)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                // 메인 창만 기억 (보조 창 제외)
                .with_filter(|label| label == MAIN_LABEL)
                // 복원은 setup 에서 직접 (숨긴 채 복원 → 최소 크기 확인 → 보여 주기)
                .skip_initial_state(MAIN_LABEL)
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            sfa_open_external,
            sfa_notify,
            sfa_get_close_behavior,
            sfa_set_close_behavior,
            sfa_close_decision,
            sfa_app_ready,
            sfa_take_pending,
        ])
        .on_window_event(|window, event| {
            if window.label() != MAIN_LABEL {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 닫기는 항상 앱이 직접 처리 (메인 창이 없어지면 트레이·알림 클릭으로 돌아올 창이 없음)
                api.prevent_close();
                handle_main_close_request(window.app_handle());
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>();

            // 1) 설정 (창 닫기 동작)
            state.load_settings(&handle);

            // 2) 작업 표시줄 앱 ID (설치본, 창을 만들기 전에)
            #[cfg(windows)]
            notify::set_process_app_user_model_id(&handle.config().identifier);

            // 3) 딥링크: 연결 확인 + 꺼진 상태에서 딥링크로 켜진 경우 보관 + 켜진 뒤 들어오는 딥링크
            ensure_deep_link_registered(&handle);
            if let Ok(Some(urls)) = handle.deep_link().get_current() {
                if let Some(link) = urls.iter().find_map(normalize_deep_link) {
                    state.lock().pending_deep_link = Some(link);
                }
            }
            let deep_link_app = handle.clone();
            handle.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Some(link) = normalize_deep_link(&url) {
                        deliver_to_site(&deep_link_app, PendingKind::DeepLink, link);
                    }
                }
            });

            // 4) 트레이 (실패해도 앱은 계속: 트레이로 숨기기 대신 최소화)
            match create_tray(&handle) {
                Ok(()) => state.lock().tray_ready = true,
                Err(error) => debug_log!("트레이 아이콘 만들기 실패: {error}"),
            }

            // 5) 메인 창: 숨긴 채 만들고 → 크기·위치 복원 → 보여 주기
            let window = create_main_window(&handle)?;
            #[cfg(windows)]
            install_offline_fallback(&window);
            restore_main_window_state(&window);
            window.show()?;
            let _ = window.set_focus();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("스틱파이터 커뮤니티 앱을 실행하지 못했습니다");
}
