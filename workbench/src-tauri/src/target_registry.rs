use std::{collections::BTreeMap, fs, io::Write, path::Path, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use serde::{Deserialize, Serialize};
use tauri::Manager;

static REGISTRY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetRecord {
    uid: String,
    label: String,
    model: String,
    created_at: u64,
    updated_at: u64,
}

#[derive(Serialize, Deserialize)]
struct Registry { version: u32, targets: BTreeMap<String, TargetRecord> }

fn normalize_uid(uid: &str) -> Result<String, String> {
    let uid = uid.trim().to_ascii_lowercase();
    if uid.len() != 24 || !uid.bytes().all(|byte| byte.is_ascii_hexdigit()) || uid == "0".repeat(24) || uid == "f".repeat(24) {
        return Err("Geçerli STM32 UID'si gerekli; kart adı kaydedilmedi.".into());
    }
    Ok(uid)
}

fn read_registry(path: &Path) -> Result<Registry, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Registry { version: 1, targets: BTreeMap::new() }),
        Err(error) => return Err(format!("Kart kayıtları okunamadı: {error}")),
    };
    if bytes.len() > 2 * 1024 * 1024 { return Err("Kart kayıt dosyası fazla büyük.".into()); }
    let registry: Registry = serde_json::from_slice(&bytes).map_err(|_| "Kart kayıt dosyası bozuk; mevcut dosya korunuyor.")?;
    if registry.version != 1 { return Err("Kart kayıt sürümü desteklenmiyor.".into()); }
    for (uid, record) in &registry.targets {
        if normalize_uid(uid)? != *uid || record.uid != *uid || record.label.trim().is_empty() || record.label.chars().count() > 32 || record.label.chars().any(char::is_control) {
            return Err("Kart kaydı geçersiz; mevcut dosya korunuyor.".into());
        }
    }
    Ok(registry)
}

fn save_record(path: &Path, uid: &str, label: &str, model: &str, overwrite: bool) -> Result<BTreeMap<String, TargetRecord>, String> {
    let uid = normalize_uid(uid)?;
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 32 || label.chars().any(char::is_control) { return Err("Kart adı 1–32 karakter olmalı.".into()); }
    if model.chars().count() > 80 || model.chars().any(char::is_control) { return Err("Kart modeli geçersiz.".into()); }
    let mut registry = read_registry(path)?;
    if !overwrite && registry.targets.contains_key(&uid) { return Ok(registry.targets); }
    if registry.targets.len() >= 10000 && !registry.targets.contains_key(&uid) { return Err("Yerel kart kayıt sınırına ulaşıldı.".into()); }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis() as u64;
    let created_at = registry.targets.get(&uid).map(|record| record.created_at).unwrap_or(now);
    registry.targets.insert(uid.clone(), TargetRecord { uid, label: label.into(), model: model.into(), created_at, updated_at: now });
    let parent = path.parent().ok_or("Kart kayıt dizini bulunamadı.")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary.write_all(&serde_json::to_vec_pretty(&registry).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    temporary.as_file().sync_all().map_err(|error| error.to_string())?;
    temporary.persist(path).map_err(|error| format!("Kart kaydı yazılamadı: {error}"))?;
    Ok(registry.targets)
}

#[tauri::command]
pub fn target_registry_load(app: tauri::AppHandle) -> Result<BTreeMap<String, TargetRecord>, String> {
    let _lock = REGISTRY_LOCK.lock().map_err(|error| error.to_string())?;
    read_registry(&app.path().app_data_dir().map_err(|error| error.to_string())?.join("targets.json")).map(|registry| registry.targets)
}

#[tauri::command]
pub fn target_registry_save(app: tauri::AppHandle, uid: String, label: String, model: String, overwrite: bool) -> Result<BTreeMap<String, TargetRecord>, String> {
    let _lock = REGISTRY_LOCK.lock().map_err(|error| error.to_string())?;
    save_record(&app.path().app_data_dir().map_err(|error| error.to_string())?.join("targets.json"), &uid, &label, &model, overwrite)
}

#[cfg(test)]
mod tests {
    use super::*;
    const FIRST: &str = "001300155231501920323239";
    const SECOND: &str = "001300155231501920323240";
    #[test]
    fn names_survive_reopen_and_are_keyed_by_uid_not_model() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("targets.json");
        save_record(&path, FIRST, "Telemetri", "STM32F446", true).unwrap();
        save_record(&path, SECOND, "Uçuş kartı", "STM32F446", true).unwrap();
        let targets = read_registry(&path).unwrap().targets;
        assert_eq!(targets[FIRST].label, "Telemetri"); assert_eq!(targets[SECOND].label, "Uçuş kartı");
        let renamed = save_record(&path, FIRST, "Yeni ad", "STM32F446", true).unwrap();
        assert_eq!(renamed[FIRST].created_at, targets[FIRST].created_at);
        assert_eq!(read_registry(&path).unwrap().targets[FIRST].label, "Yeni ad");
        assert_eq!(read_registry(&path).unwrap().targets[SECOND].label, "Uçuş kartı");
    }
    #[test]
    fn firmware_import_does_not_replace_local_name() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("targets.json");
        save_record(&path, FIRST, "Yerel ad", "STM32F446", true).unwrap();
        assert_eq!(save_record(&path, FIRST, "Eski ESP adı", "STM32F446", false).unwrap()[FIRST].label, "Yerel ad");
        assert_eq!(normalize_uid("00130015523150192032ABCD").unwrap(), "00130015523150192032abcd");
    }
    #[test]
    fn invalid_input_and_corrupt_database_are_not_overwritten() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("targets.json");
        assert!(save_record(&path, "", "Kart", "STM32", true).is_err());
        assert!(save_record(&path, FIRST, "\n", "STM32", true).is_err());
        assert!(!path.exists());
        fs::write(&path, "broken").unwrap();
        assert!(save_record(&path, FIRST, "Kart", "STM32", true).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "broken");
    }
}
