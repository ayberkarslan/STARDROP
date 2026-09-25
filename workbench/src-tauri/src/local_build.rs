use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::{Cursor, Read}, path::{Path, PathBuf}, process::Command, time::Duration};
use tauri::Manager;

const FILES: &[&str] = &[
    "firmware/startup.c", "firmware/main.c", "firmware/platform_i2c.c",
    "firmware/diagnostic_test.h", "firmware/stm32f401cc.ld", "firmware/stm32f446re.ld",
    "runtime/stardrop_diagnostic_report.c", "runtime/stardrop_diagnostic_report.h",
    "templates/led_blink.c", "catalog/catalog.json",
];

fn safe_segment(value: &str) -> bool {
    !value.is_empty() && value.len() <= 100 && value.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        && value != "." && value != ".."
}

fn source_root(app: &tauri::AppHandle, account: &str, repository: &str) -> Result<PathBuf, String> {
    let parts: Vec<&str> = repository.split('/').collect();
    if !safe_segment(account) || parts.len() != 2 || !parts.iter().all(|part| safe_segment(part)) {
        return Err("Geçersiz hesap veya GitHub deposu".into());
    }
    let root = app.path().app_cache_dir().map_err(|error| error.to_string())?
        .join("diagnostic-sources").join(account).join(parts[0]).join(parts[1]);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn active_sha(root: &Path) -> Option<String> {
    fs::read_to_string(root.join("active-sha")).ok().map(|text| text.trim().to_string())
        .filter(|sha| sha.len() == 40 && sha.chars().all(|ch| ch.is_ascii_hexdigit()) && verified_source(&root.join(sha)))
}

fn verified_source(source: &Path) -> bool {
    let Ok(manifest) = fs::read(source.join("source-files.sha256.json")) else { return false; };
    let Ok(hashes) = serde_json::from_slice::<std::collections::HashMap<String, String>>(&manifest) else { return false; };
    FILES.iter().all(|file| {
        let Some(expected) = hashes.get(*file) else { return false; };
        fs::read(source.join(file)).map(|bytes| digest(&bytes) == *expected).unwrap_or(false)
    })
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(25)).build().map_err(|error| error.to_string())
}

fn token() -> Result<String, String> {
    super::entry_for("github_access_token")?.get_password().map_err(|_| "GitHub oturumu gerekli".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    active_sha: Option<String>,
    latest_sha: Option<String>,
    offline: bool,
    warning: Option<String>,
}

#[tauri::command]
pub async fn source_status(app: tauri::AppHandle, account: String, repository: String, reference: String) -> Result<SourceStatus, String> {
    #[cfg(debug_assertions)]
    if repository.is_empty() { return Ok(SourceStatus { active_sha: Some("local-dev".into()), latest_sha: Some("local-dev".into()), offline: false, warning: None }); }
    let root = source_root(&app, &account, &repository)?;
    if !safe_segment(&reference) { return Err("Geçersiz kaynak dalı".into()); }
    let active = active_sha(&root);
    let result = async {
        let response = github_client()?.get(format!("https://api.github.com/repos/{repository}/commits/{reference}"))
            .header("User-Agent", "stardrop-workbench").bearer_auth(token()?).send().await.map_err(|error| error.to_string())?;
        if !response.status().is_success() { return Err(format!("GitHub kaynak denetimi HTTP {}", response.status())); }
        let value: serde_json::Value = serde_json::from_str(&response.text().await.map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
        let sha = value["sha"].as_str().ok_or("GitHub commit kimliği eksik")?;
        if sha.len() != 40 || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) { return Err("Geçersiz commit kimliği".into()); }
        Ok::<String, String>(sha.to_string())
    }.await;
    match result {
        Ok(latest) => Ok(SourceStatus { active_sha: active, latest_sha: Some(latest), offline: false, warning: None }),
        Err(error) if active.is_some() => Ok(SourceStatus { active_sha: active, latest_sha: None,
            offline: !error.starts_with("GitHub kaynak denetimi HTTP") && !error.contains("GitHub oturumu"), warning: Some(error) }),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn activate_source(app: tauri::AppHandle, account: String, repository: String, sha: String) -> Result<SourceStatus, String> {
    let root = source_root(&app, &account, &repository)?;
    if sha.len() != 40 || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) { return Err("Geçersiz commit kimliği".into()); }
    let destination = root.join(&sha);
    if !verified_source(&destination) {
        if destination.exists() { return Err("Önbellekteki kaynak değişmiş veya bozulmuş; bu sürümü etkinleştirmeden önce önbelleği temizle".into()); }
        let response = github_client()?.get(format!("https://api.github.com/repos/{repository}/zipball/{sha}"))
            .header("User-Agent", "stardrop-workbench").bearer_auth(token()?).send().await.map_err(|error| error.to_string())?;
        if !response.status().is_success() { return Err(format!("GitHub kaynak indirme HTTP {}", response.status())); }
        if response.content_length().unwrap_or(0) > 3_000_000 { return Err("Kaynak arşivi çok büyük".into()); }
        let bytes = response.bytes().await.map_err(|error| error.to_string())?;
        if bytes.len() > 3_000_000 { return Err("Kaynak arşivi çok büyük".into()); }
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
        let stage = tempfile::tempdir_in(&root).map_err(|error| error.to_string())?;
        let mut found = std::collections::HashSet::new();
        let mut hashes = std::collections::HashMap::new();
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
            let Some((_, relative)) = entry.name().split_once('/') else { continue; };
            let relative = relative.to_string();
            if !FILES.contains(&relative.as_str()) || entry.size() > 200_000 || !found.insert(relative.clone()) { continue; }
            let path = stage.path().join(&relative);
            if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
            let mut contents = Vec::new();
            entry.read_to_end(&mut contents).map_err(|error| error.to_string())?;
            hashes.insert(relative, digest(&contents));
            fs::write(path, contents).map_err(|error| error.to_string())?;
        }
        if FILES.iter().any(|file| !found.contains(*file)) { return Err("GitHub kaynağında gerekli LED dosyaları eksik".into()); }
        fs::write(stage.path().join("source-files.sha256.json"), serde_json::to_vec(&hashes).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        fs::rename(stage.path(), &destination).map_err(|error| error.to_string())?;
    }
    fs::write(root.join("active-sha"), &sha).map_err(|error| error.to_string())?;
    Ok(SourceStatus { active_sha: Some(sha.clone()), latest_sha: Some(sha), offline: false, warning: None })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedBuildRequest {
    repository: String, account: String, profile_json: String, component_ref: String,
    request_id: String, mcu_part: String, target_uid: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedBuildResult {
    bytes: Vec<u8>, sha256: String, source_sha: String, profile_hash: String,
    request_id: String, header: String,
}

fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn hash32(bytes: &[u8]) -> String { format!("0x{}UL", &digest(bytes)[..8]) }

fn compiler(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let executable = format!("{name}{}", if cfg!(windows) { ".exe" } else { "" });
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("toolchain").join("bin").join(&executable);
        if bundled.is_file() { return Ok(bundled); }
    }
    #[cfg(debug_assertions)]
    { return Ok(PathBuf::from(executable)); }
    #[cfg(not(debug_assertions))]
    { Err(format!("Paketli {executable} bulunamadı")) }
}

#[tauri::command]
pub async fn compile_led(app: tauri::AppHandle, request: LedBuildRequest) -> Result<LedBuildResult, String> {
    tauri::async_runtime::spawn_blocking(move || compile_led_blocking(&app, request)).await.map_err(|error| error.to_string())?
}

fn compile_led_blocking(app: &tauri::AppHandle, request: LedBuildRequest) -> Result<LedBuildResult, String> {
    #[cfg(debug_assertions)]
    let development = request.repository.is_empty();
    #[cfg(not(debug_assertions))]
    let development = false;
    let (sha, source) = if development {
        ("local-dev".to_string(), PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../diagnostics"))
    } else {
        let root = source_root(app, &request.account, &request.repository)?;
        let sha = active_sha(&root).ok_or("Önce GitHub LED kaynağını indir")?;
        let source = root.join(&sha);
        if !verified_source(&source) { return Err("Kaynak önbelleği değişmiş; derleme durduruldu".into()); }
        (sha, source)
    };
    compile_led_at(&source, &compiler(app, "arm-none-eabi-gcc")?, &compiler(app, "arm-none-eabi-objcopy")?, request, sha)
}

fn compile_led_at(source: &Path, gcc: &Path, objcopy: &Path, request: LedBuildRequest, sha: String) -> Result<LedBuildResult, String> {
    let profile: serde_json::Value = serde_json::from_str(&request.profile_json).map_err(|_| "Kart profili geçersiz")?;
    let component = profile["components"].as_array().and_then(|items| items.iter().find(|item| item["ref"] == request.component_ref)).ok_or("LED bileşeni yok")?;
    let connections: Vec<&serde_json::Value> = profile["connections"].as_array().ok_or("Pin listesi yok")?.iter().filter(|item| item["componentRef"] == request.component_ref).collect();
    if component["protocol"] != "GPIO" || connections.len() != 1 || connections[0]["role"] != "LED" || connections[0]["approved"] != true {
        return Err("Onaylı tek LED pini gerekli".into());
    }
    if profile["mcu"]["part"] != request.mcu_part || profile["targetUid"] != request.target_uid { return Err("Profil/hedef bilgisi uyuşmuyor".into()); }
    if request.target_uid.len() != 24 || !request.target_uid.chars().all(|ch| ch.is_ascii_hexdigit()) { return Err("STM32 UID geçersiz".into()); }
    let target = if ["STM32F401CC", "STM32F401CD", "STM32F401CE"].iter().any(|prefix| request.mcu_part.starts_with(prefix)) {
        "stm32f401cc"
    } else if request.mcu_part.starts_with("STM32F446RE") { "stm32f446re" } else { return Err("MCU desteklenmiyor".into()); };
    let pin = connections[0]["mcuPin"].as_str().ok_or("LED GPIO eksik")?;
    let bytes = pin.as_bytes();
    if bytes.len() < 3 || bytes.len() > 4 || bytes[0] != b'P' || !matches!(bytes[1], b'A' | b'B' | b'C') { return Err("LED GPIO geçersiz".into()); }
    let port = bytes[1] - b'A';
    let number: u8 = pin[2..].parse().map_err(|_| "LED GPIO geçersiz")?;
    if number > 15 || (port == 0 && (number == 13 || number == 14)) || (port == 2 && target == "stm32f401cc" && number < 13) { return Err("GPIO bu hedef için uygun değil".into()); }
    let interval = component["blinkMs"].as_u64().ok_or("LED aralığı eksik")?;
    if !(50..=5000).contains(&interval) { return Err("LED aralığı 50–5000 ms olmalı".into()); }
    let active_low = component["activeLow"].as_bool().ok_or("LED polaritesi eksik")?;
    if request.request_id.len() > 100 || !request.request_id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') { return Err("Çalıştırma kimliği geçersiz".into()); }
    let header = format!("#pragma once\n#define STARDROP_SCL_PORT 0\n#define STARDROP_SCL_PIN 0\n#define STARDROP_SDA_PORT 0\n#define STARDROP_SDA_PIN 0\n#define STARDROP_LED_PORT {port}\n#define STARDROP_LED_PIN {number}\n#define STARDROP_LED_ACTIVE_LOW {}\n#define STARDROP_BLINK_MS {interval}\n#define STARDROP_VISUAL_TEST 1\n#define STARDROP_USE_I2C 0\n#define STARDROP_F401 {}\n#define STARDROP_TEST_ID_HASH {}\n#define STARDROP_PROFILE_HASH {}\n#define STARDROP_RUN_HASH {}\n", active_low as u8, (target == "stm32f401cc") as u8, hash32(b"led-blink"), hash32(request.profile_json.as_bytes()), hash32(request.request_id.as_bytes()));
    let work = tempfile::tempdir().map_err(|error| error.to_string())?;
    fs::write(work.path().join("generated_config.h"), &header).map_err(|error| error.to_string())?;
    let elf = work.path().join("led.elf");
    let bin = work.path().join("led.bin");
    let output = Command::new(gcc)
        .args(["-mcpu=cortex-m4", "-mthumb", "-mfloat-abi=soft", "-Os", "-std=c11", "-ffreestanding", "-fno-builtin", "-ffunction-sections", "-fdata-sections", "-Wall", "-Wextra", "-Werror"])
        .arg("-I").arg(work.path()).arg("-I").arg(source.join("runtime")).arg("-I").arg(source.join("firmware"))
        .arg(source.join("firmware/startup.c")).arg(source.join("firmware/main.c")).arg(source.join("firmware/platform_i2c.c"))
        .arg(source.join("runtime/stardrop_diagnostic_report.c")).arg(source.join("templates/led_blink.c"))
        .args(["-nostdlib", "-Wl,--gc-sections"]).arg("-T").arg(source.join(format!("firmware/{target}.ld")))
        .arg("-lgcc").arg("-o").arg(&elf).output().map_err(|error| format!("Derleyici başlatılamadı: {error}"))?;
    if !output.status.success() { return Err(format!("LED derlenemedi: {}", String::from_utf8_lossy(&output.stderr).chars().take(1600).collect::<String>())); }
    let converted = Command::new(objcopy).args(["-O", "binary"]).arg(&elf).arg(&bin).output().map_err(|error| error.to_string())?;
    if !converted.status.success() { return Err(format!("BIN oluşturulamadı: {}", String::from_utf8_lossy(&converted.stderr))); }
    let bytes = fs::read(bin).map_err(|error| error.to_string())?;
    let maximum = if target == "stm32f401cc" { 256 * 1024 } else { 512 * 1024 };
    if bytes.len() < 64 || bytes.len() > maximum { return Err("Derlenen BIN flash boyutuna uymuyor".into()); }
    Ok(LedBuildResult { sha256: digest(&bytes), bytes, source_sha: sha, profile_hash: hash32(request.profile_json.as_bytes()), request_id: request.request_id, header })
}

#[tauri::command]
pub fn clear_source_cache(app: tauri::AppHandle, account: String) -> Result<(), String> {
    if !safe_segment(&account) { return Err("Geçersiz hesap".into()); }
    let root = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("diagnostic-sources").join(account);
    if root.exists() { fs::remove_dir_all(root).map_err(|error| error.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(interval: u64) -> LedBuildRequest {
        let profile = serde_json::json!({
            "mcu": { "part": "STM32F401CDU6" }, "targetUid": "004B00344231501920393037",
            "components": [{ "ref": "D1", "part": "LED", "protocol": "GPIO", "activeLow": true, "blinkMs": interval }],
            "connections": [{ "componentRef": "D1", "role": "LED", "mcuPin": "PC13", "approved": true }]
        });
        LedBuildRequest { repository: String::new(), account: "tester".into(), profile_json: profile.to_string(),
            component_ref: "D1".into(), request_id: format!("test-{interval}"), mcu_part: "STM32F401CDU6".into(),
            target_uid: "004B00344231501920393037".into() }
    }

    #[test]
    fn led_builder_changes_binary_without_editing_source() {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../diagnostics");
        let fast = compile_led_at(&source, Path::new("arm-none-eabi-gcc"), Path::new("arm-none-eabi-objcopy"), fixture(100), "test-source".into()).unwrap();
        let slow = compile_led_at(&source, Path::new("arm-none-eabi-gcc"), Path::new("arm-none-eabi-objcopy"), fixture(1000), "test-source".into()).unwrap();
        assert!(fast.header.contains("#define STARDROP_LED_PIN 13"));
        assert!(slow.header.contains("#define STARDROP_BLINK_MS 1000"));
        assert_ne!(fast.sha256, slow.sha256);
    }

    #[test]
    fn led_builder_rejects_swd_pin() {
        let mut bad = fixture(100);
        bad.profile_json = bad.profile_json.replace("PC13", "PA13");
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../diagnostics");
        assert!(compile_led_at(&source, Path::new("arm-none-eabi-gcc"), Path::new("arm-none-eabi-objcopy"), bad, "test-source".into()).is_err());
    }

    #[test]
    fn led_builder_allows_f446_port_c() {
        let mut request = fixture(100);
        request.profile_json = request.profile_json.replace("STM32F401CDU6", "STM32F446RET6").replace("PC13", "PC9");
        request.mcu_part = "STM32F446RET6".into();
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../diagnostics");
        let result = compile_led_at(&source, Path::new("arm-none-eabi-gcc"), Path::new("arm-none-eabi-objcopy"), request, "test-source".into()).unwrap();
        assert!(result.header.contains("#define STARDROP_LED_PIN 9"));
    }

    #[test]
    fn source_cache_detects_modified_files() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let mut hashes = std::collections::HashMap::new();
        for file in FILES {
            let path = source.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, b"approved").unwrap();
            hashes.insert(file.to_string(), digest(b"approved"));
        }
        fs::write(source.join("source-files.sha256.json"), serde_json::to_vec(&hashes).unwrap()).unwrap();
        assert!(verified_source(&source));
        fs::write(source.join("templates/led_blink.c"), b"modified").unwrap();
        assert!(!verified_source(&source));
    }
}
