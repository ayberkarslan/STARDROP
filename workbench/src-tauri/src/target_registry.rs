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
    #[serde(default)]
    flash_analysis: Option<FlashAnalysis>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashAnalysis {
    total_bytes: u32,
    programmed_bytes: u32,
    free_bytes: u32,
    duration_ms: u32,
    #[serde(default)]
    analyzed_at: u64,
}

fn validate_analysis(value: &FlashAnalysis) -> Result<(), String> {
    if value.total_bytes == 0 || value.total_bytes > 16 * 1024 * 1024 ||
        value.programmed_bytes.checked_add(value.free_bytes) != Some(value.total_bytes) {
        return Err("Flash analiz verisi geçersiz.".into());
    }
    Ok(())
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
    validate_registry(&registry)?;
    Ok(registry)
}
fn validate_registry(registry: &Registry) -> Result<(), String> {
    if registry.version != 1 || registry.targets.len() > 10000 { return Err("Kart kayıt sürümü veya kapasitesi desteklenmiyor.".into()); }
    for (uid, record) in &registry.targets {
        if normalize_uid(uid)? != *uid || record.uid != *uid || (record.label.trim().is_empty() && record.flash_analysis.is_none()) || record.label.chars().count() > 32 || record.label.chars().any(char::is_control) || record.model.len() > 80 || record.model.chars().any(char::is_control) {
            return Err("Kart kaydı geçersiz; mevcut dosya korunuyor.".into());
        }
        if let Some(analysis) = &record.flash_analysis { validate_analysis(analysis)?; }
    }
    Ok(())
}

#[tauri::command]
pub fn target_registry_import(app: tauri::AppHandle, records: BTreeMap<String, TargetRecord>) -> Result<BTreeMap<String, TargetRecord>, String> {
    let _lock = REGISTRY_LOCK.lock().map_err(|error| error.to_string())?;
    let path = app.path().app_data_dir().map_err(|error| error.to_string())?.join("targets.json");
    import_records(&path, records)
}
fn import_records(path: &Path, records: BTreeMap<String, TargetRecord>) -> Result<BTreeMap<String, TargetRecord>, String> {
    let incoming = Registry { version: 1, targets: records }; validate_registry(&incoming)?;
    let mut registry = read_registry(path)?;
    registry.targets.extend(incoming.targets); validate_registry(&registry)?;
    persist_registry(path, &registry)?;
    Ok(registry.targets)
}

fn save_record(path: &Path, uid: &str, label: &str, model: &str, overwrite: bool) -> Result<BTreeMap<String, TargetRecord>, String> {
    let uid = normalize_uid(uid)?;
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 32 || label.chars().any(char::is_control) { return Err("Kart adı 1–32 karakter olmalı.".into()); }
    if model.chars().count() > 80 || model.chars().any(char::is_control) { return Err("Kart modeli geçersiz.".into()); }
    let mut registry = read_registry(path)?;
    if !overwrite && registry.targets.get(&uid).is_some_and(|record| !record.label.is_empty()) { return Ok(registry.targets); }
    if registry.targets.len() >= 10000 && !registry.targets.contains_key(&uid) { return Err("Yerel kart kayıt sınırına ulaşıldı.".into()); }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis() as u64;
    let created_at = registry.targets.get(&uid).map(|record| record.created_at).unwrap_or(now);
    let flash_analysis = registry.targets.get(&uid).and_then(|record| record.flash_analysis.clone());
    registry.targets.insert(uid.clone(), TargetRecord { uid, label: label.into(), model: model.into(), created_at, updated_at: now, flash_analysis });
    persist_registry(path, &registry)?;
    Ok(registry.targets)
}

fn persist_registry(path: &Path, registry: &Registry) -> Result<(), String> {
    let parent = path.parent().ok_or("Kart kayıt dizini bulunamadı.")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let bytes = serde_json::to_vec_pretty(&registry).map_err(|error| error.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 { return Err("Yerel kart kayıt kapasitesine ulaşıldı.".into()); }
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary.write_all(&bytes).map_err(|error| error.to_string())?;
    temporary.as_file().sync_all().map_err(|error| error.to_string())?;
    temporary.persist(path).map_err(|error| format!("Kart kaydı yazılamadı: {error}"))?;
    Ok(())
}

fn save_analysis(path: &Path, uid: &str, model: &str, mut analysis: FlashAnalysis) -> Result<BTreeMap<String, TargetRecord>, String> {
    let uid = normalize_uid(uid)?;
    validate_analysis(&analysis)?;
    if model.chars().count() > 80 || model.chars().any(char::is_control) { return Err("Kart modeli geçersiz.".into()); }
    let mut registry = read_registry(path)?;
    if registry.targets.len() >= 10000 && !registry.targets.contains_key(&uid) { return Err("Yerel kart kayıt sınırına ulaşıldı.".into()); }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis() as u64;
    analysis.analyzed_at = now;
    let record = registry.targets.entry(uid.clone()).or_insert(TargetRecord { uid, label: String::new(), model: model.into(), created_at: now, updated_at: now, flash_analysis: None });
    record.flash_analysis = Some(analysis);
    record.updated_at = now;
    persist_registry(path, &registry)?;
    Ok(registry.targets)
}

#[tauri::command]
pub fn target_registry_analysis_save(app: tauri::AppHandle, uid: String, model: String, analysis: FlashAnalysis) -> Result<BTreeMap<String, TargetRecord>, String> {
    let _lock = REGISTRY_LOCK.lock().map_err(|error| error.to_string())?;
    save_analysis(&app.path().app_data_dir().map_err(|error| error.to_string())?.join("targets.json"), &uid, &model, analysis)
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
    fn sample() -> FlashAnalysis { FlashAnalysis { total_bytes: 524288, programmed_bytes: 4096, free_bytes: 520192, duration_ms: 2500, analyzed_at: 0 } }
    #[test]
    fn analysis_survives_restart_rename_and_another_card() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("targets.json");
        save_analysis(&path, FIRST, "STM32F446", sample()).unwrap();
        let before = read_registry(&path).unwrap().targets[FIRST].flash_analysis.clone().unwrap();
        assert!(before.analyzed_at > 0);
        save_record(&path, FIRST, "Telemetri", "STM32F446", true).unwrap();
        save_analysis(&path, SECOND, "STM32F446", sample()).unwrap();
        let records = read_registry(&path).unwrap().targets;
        assert_eq!(records[FIRST].flash_analysis.as_ref().unwrap().analyzed_at, before.analyzed_at);
        assert_eq!(records[FIRST].label, "Telemetri");
        assert_eq!(records[SECOND].label, "");
        assert!(records[SECOND].flash_analysis.is_some());
    }
    #[test]
    fn failed_analysis_keeps_last_record_and_legacy_files_load() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("targets.json");
        save_record(&path, FIRST, "Kart", "STM32F446", true).unwrap();
        let mut legacy: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        legacy["targets"][FIRST].as_object_mut().unwrap().remove("flashAnalysis");
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert!(read_registry(&path).unwrap().targets[FIRST].flash_analysis.is_none());
        save_analysis(&path, FIRST, "STM32F446", sample()).unwrap();
        let before = fs::read(&path).unwrap();
        let mut invalid = sample(); invalid.free_bytes = 0;
        assert!(save_analysis(&path, FIRST, "STM32F446", invalid).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
    }
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
    #[test]
    fn backup_merge_keeps_other_cards_and_rejects_bad_records_before_writing() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("targets.json");
        let mut records = save_record(&path, FIRST, "Birinci", "STM32F446", true).unwrap();
        save_record(&path, SECOND, "İkinci", "STM32F401", true).unwrap();
        records.get_mut(FIRST).unwrap().label = "Yeni ad".into();
        let merged = import_records(&path, records.clone()).unwrap();
        assert_eq!(merged[FIRST].label, "Yeni ad");
        assert_eq!(merged[SECOND].label, "İkinci");
        let before = fs::read(&path).unwrap();
        records.get_mut(FIRST).unwrap().model = "\n".into();
        assert!(import_records(&path, records).is_err());
        assert_eq!(fs::read(path).unwrap(), before);
    }
}
