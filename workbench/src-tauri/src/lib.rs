use keyring::Entry;

fn entry_for(key: &str) -> Result<Entry, String> {
    if key.is_empty() || !key.chars().all(|value| value.is_ascii_alphanumeric() || value == '_' || value == '-') {
        return Err("Geçersiz secret anahtarı".into());
    }
    Entry::new("com.yildizroket.stardrop-workbench", key).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_secret(key: String, value: String) -> Result<(), String> {
    entry_for(&key)?.set_password(&value).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_secret(key: String) -> Result<Option<String>, String> {
    match entry_for(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_secret(key: String) -> Result<(), String> {
    match entry_for(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_secret, load_secret, delete_secret])
        .run(tauri::generate_context!())
        .expect("STARDROP Workbench başlatılamadı");
}
