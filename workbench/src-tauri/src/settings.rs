use std::{fs, io::Write, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;
pub fn export_directory(app: &tauri::AppHandle, directory: Option<String>) -> Result<PathBuf, String> {
    match directory.filter(|value| !value.trim().is_empty()) {
        Some(value) => {
            let path = PathBuf::from(&value);
            if !path.is_absolute() || value.chars().any(char::is_control) || value.len() > 500 { return Err("Kayıt klasörü tam bir dizin yolu olmalı".into()); }
            Ok(path)
        },
        None => Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("exports")),
    }
}
#[tauri::command]
pub fn settings_export(app: tauri::AppHandle, kind: String, content: String, directory: Option<String>) -> Result<String, String> {
    if !matches!(kind.as_str(), "backup" | "diagnostic") || content.is_empty() || content.len() > 4 * 1024 * 1024 { return Err("Kayıt türü veya boyutu geçersiz".into()); }
    serde_json::from_str::<serde_json::Value>(&content).map_err(|_| "Kayıt geçerli JSON olmalı")?;
    let directory = export_directory(&app, directory)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_nanos();
    let path = directory.join(format!("stardrop-{kind}-{stamp}.json"));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes()).and_then(|_| file.sync_all()).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into())
}
#[tauri::command]
pub fn settings_system_info(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "version": env!("CARGO_PKG_VERSION"), "os": std::env::consts::OS, "arch": std::env::consts::ARCH,
        "exportDirectory": export_directory(&app, None)?.to_string_lossy(), "storage": "OS credential store / session memory" }))
}
