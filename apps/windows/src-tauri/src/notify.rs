//! 윈도우 알림(토스트, 화면 오른쪽 아래)
//!
//! - 사이트가 sfa_notify 로 요청하면 제목·내용으로 토스트를 띄우고, 사용자가 누르면 `on_click` 을 부른다.
//! - 알림 클릭 이벤트(Activated)는 앱이 그 알림 객체를 들고 있을 때만 앱으로 전달되므로,
//!   띄운 알림은 사라지거나(사용자가 닫음) 눌릴 때까지 최근 MAX_ALIVE 개를 보관한다.
//!   (시간이 지나 알림 센터로 들어간 알림도 누를 수 있으므로 계속 보관)
//! - 앱 ID(AUMID): 설치본은 설치 프로그램(NSIS)이 시작 메뉴 바로가기에 넣는 앱 ID(= tauri.conf.json 의 identifier)를 쓴다.
//!   설치하지 않고 실행한 개발용 빌드는 그 바로가기가 없어 알림이 안 뜨므로 PowerShell 앱 ID 로 대신 띄운다.

use std::{
    collections::VecDeque,
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use windows::{
    core::{h, IInspectable, HSTRING},
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    UI::Notifications::{
        ToastDismissalReason, ToastDismissedEventArgs, ToastFailedEventArgs, ToastNotification,
        ToastNotificationManager,
    },
};

/// 설치하지 않은(개발용) 실행에서 쓰는 앱 ID (알림 출처가 Windows PowerShell 로 표시됨)
const POWERSHELL_APP_ID: &str =
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/// 클릭을 받기 위해 보관하는 알림 최대 개수 (넘치면 오래된 것부터 놓음)
const MAX_ALIVE: usize = 50;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static ALIVE: Mutex<VecDeque<(u64, ToastNotification)>> = Mutex::new(VecDeque::new());

/// NSIS 설치 프로그램으로 설치된 실행 파일인지 (설치 폴더에 uninstall.exe 가 함께 있음)
pub fn is_installed() -> bool {
    tauri::utils::platform::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe")))
        .as_deref()
        .map(Path::is_file)
        .unwrap_or(false)
}

/// 알림에 쓸 앱 ID
pub fn app_user_model_id(identifier: &str) -> String {
    if is_installed() {
        identifier.to_string()
    } else {
        POWERSHELL_APP_ID.to_string()
    }
}

/// 이 프로세스의 작업 표시줄 앱 ID 를 시작 메뉴 바로가기와 같게 맞춤 (설치본만)
/// - 딥링크·설치 직후 실행처럼 바로가기를 거치지 않고 켜져도 작업 표시줄 고정 아이콘·알림과 같은 앱으로 묶이게 함
/// - 창을 만들기 전에 불러야 함
pub fn set_process_app_user_model_id(identifier: &str) {
    if !is_installed() {
        return;
    }
    let id = HSTRING::from(identifier);
    // 실패해도 앱 동작에는 문제 없음 (작업 표시줄 묶음만 달라질 수 있음)
    let _ = unsafe { windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(&id) };
}

/// 보관 목록에 추가 (넘치면 오래된 알림부터 놓음)
fn keep(id: u64, toast: ToastNotification) {
    let evicted = {
        let mut alive = ALIVE.lock().unwrap_or_else(|e| e.into_inner());
        alive.push_back((id, toast));
        let mut evicted = Vec::new();
        while alive.len() > MAX_ALIVE {
            if let Some(old) = alive.pop_front() {
                evicted.push(old);
            }
        }
        evicted
    };
    // 잠금을 푼 뒤에 놓음
    drop(evicted);
}

/// 보관 목록에서 제거
fn release(id: u64) {
    let removed = {
        let mut alive = ALIVE.lock().unwrap_or_else(|e| e.into_inner());
        alive
            .iter()
            .position(|(alive_id, _)| *alive_id == id)
            .and_then(|index| alive.remove(index))
    };
    drop(removed);
}

/// 토스트 알림 표시. 사용자가 알림(본문)을 누르면 `on_click` 실행 (윈도우 알림 스레드에서 불림)
pub fn show<F>(app_id: &str, title: &str, body: &str, on_click: F) -> windows::core::Result<()>
where
    F: Fn() + Send + 'static,
{
    // <toast><visual><binding template="ToastGeneric"><text>제목</text><text>내용</text></binding></visual></toast>
    // (글자는 SetInnerText 로 넣으므로 XML 특수문자가 그대로 안전하게 표시됨)
    let xml = XmlDocument::new()?;
    let toast_el = xml.CreateElement(h!("toast"))?;
    let visual_el = xml.CreateElement(h!("visual"))?;
    let binding_el = xml.CreateElement(h!("binding"))?;
    binding_el.SetAttribute(h!("template"), h!("ToastGeneric"))?;

    let title_el = xml.CreateElement(h!("text"))?;
    title_el.SetInnerText(&HSTRING::from(title))?;
    binding_el.AppendChild(&title_el)?;

    if !body.is_empty() {
        let body_el = xml.CreateElement(h!("text"))?;
        body_el.SetInnerText(&HSTRING::from(body))?;
        binding_el.AppendChild(&body_el)?;
    }

    visual_el.AppendChild(&binding_el)?;
    toast_el.AppendChild(&visual_el)?;
    xml.AppendChild(&toast_el)?;

    let toast = ToastNotification::CreateToastNotification(&xml)?;
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);

    // 알림을 누름 → 보관 해제 후 앱으로 전달
    toast.Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(
        move |_, _| {
            release(id);
            on_click();
            Ok(())
        },
    ))?;

    // 사용자가 닫았거나 앱이 숨김 → 보관 해제. 시간이 지나 알림 센터로 간 경우(TimedOut)는 계속 누를 수 있어 보관
    toast.Dismissed(&TypedEventHandler::<
        ToastNotification,
        ToastDismissedEventArgs,
    >::new(move |_, args| {
        let timed_out = args
            .as_ref()
            .and_then(|args| args.Reason().ok())
            .map(|reason| reason == ToastDismissalReason::TimedOut)
            .unwrap_or(false);
        if !timed_out {
            release(id);
        }
        Ok(())
    }))?;

    // 표시 실패 (윈도우 알림 설정에서 앱 알림을 끈 경우 등)
    toast.Failed(
        &TypedEventHandler::<ToastNotification, ToastFailedEventArgs>::new(move |_, _| {
            release(id);
            Ok(())
        }),
    )?;

    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?;
    keep(id, toast.clone());
    if let Err(error) = notifier.Show(&toast) {
        release(id);
        return Err(error);
    }
    Ok(())
}
