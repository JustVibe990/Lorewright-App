// All app logic lives in the TypeScript frontend. Rust only wires up the
// plugins it needs: HTTP (fetch from 5e.tools without CORS limits), file
// system (notes and data cache), dialogs and opening links in the browser.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Lorewright");
}
