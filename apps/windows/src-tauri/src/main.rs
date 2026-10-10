// 릴리스 빌드에서는 윈도우 콘솔 창이 같이 뜨지 않게 함 (지우지 말 것)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sfaclan_lib::run()
}
