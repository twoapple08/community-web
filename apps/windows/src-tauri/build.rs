// 윈도우 앱 빌드 스크립트 (tauri-build)
// - 앱 전용 명령(sfa_*)마다 권한(allow-sfa-..., deny-sfa-...)을 자동으로 만든다.
//   원격 사이트(https://www.sfaclan.com)는 capabilities/main.json 에 적힌 권한만 쓸 수 있으므로
//   여기서 명령을 추가하면 capabilities/main.json 에도 allow-... 를 함께 추가해야 한다.
// - 이 목록과 src/lib.rs 의 tauri::generate_handler! 목록은 항상 같아야 한다.
const APP_COMMANDS: &[&str] = &[
    "sfa_open_external",
    "sfa_notify",
    "sfa_get_close_behavior",
    "sfa_set_close_behavior",
    "sfa_close_decision",
    "sfa_app_ready",
    "sfa_take_pending",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("tauri-build 실행 실패");
}
