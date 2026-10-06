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
    super::read_secret("github_repo_token")?
        .filter(|value| !value.is_empty())
        .or(super::read_secret("github_access_token")?)
        .ok_or_else(|| "GitHub oturumu veya depo erişim anahtarı gerekli".into())
}

fn code_root(app: &tauri::AppHandle, repository: &str) -> Result<PathBuf, String> {
    let parts: Vec<_> = repository.split('/').collect();
    if parts.len() != 2 || !parts.iter().all(|part| safe_segment(part)) { return Err("Geçersiz test deposu".into()); }
    let root = app.path().app_cache_dir().map_err(|error| error.to_string())?
        .join("code-repos").join(parts[0]).join(parts[1]);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn code_source_valid(source: &Path) -> bool {
    let Ok(bytes) = fs::read(source.join("source-files.sha256.json")) else { return false; };
    let Ok(hashes) = serde_json::from_slice::<std::collections::HashMap<String, String>>(&bytes) else { return false; };
    !hashes.is_empty() && hashes.iter().all(|(file, expected)| safe_relative(file)
        && fs::read(source.join(file)).map(|bytes| digest(&bytes) == *expected).unwrap_or(false))
        && source.join("catalog/catalog.json").is_file()
}

fn active_code_sha(root: &Path) -> Option<String> {
    fs::read_to_string(root.join("active-sha")).ok().map(|sha| sha.trim().to_string())
        .filter(|sha| sha.len() == 40 && sha.chars().all(|ch| ch.is_ascii_hexdigit()) && code_source_valid(&root.join(sha)))
}

#[tauri::command]
pub async fn code_repo_status(app: tauri::AppHandle, repository: String, reference: String) -> Result<SourceStatus, String> {
    let root = code_root(&app, &repository)?;
    if !safe_segment(&reference) { return Err("Geçersiz kaynak dalı".into()); }
    let active = active_code_sha(&root);
    let result = async {
        let response = github_client()?.get(format!("https://api.github.com/repos/{repository}/commits/{reference}"))
            .header("User-Agent", "stardrop-workbench").bearer_auth(token()?).send().await.map_err(|error| error.to_string())?;
        if !response.status().is_success() { return Err(format!("GitHub kaynak denetimi HTTP {}", response.status())); }
        let value: serde_json::Value = serde_json::from_str(&response.text().await.map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        let sha = value["sha"].as_str().ok_or("GitHub commit kimliği eksik")?;
        if sha.len() != 40 || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) { return Err("Geçersiz commit kimliği".into()); }
        Ok::<String, String>(sha.to_string())
    }.await;
    match result {
        Ok(latest) => Ok(SourceStatus { active_sha: active, latest_sha: Some(latest), offline: false, warning: None }),
        Err(error) if active.is_some() => Ok(SourceStatus { active_sha: active, latest_sha: None, offline: true, warning: Some(error) }),
        Err(error) => Err(error),
    }
}

fn archive_file(archive: &mut zip::ZipArchive<Cursor<Vec<u8>>>, path: &str) -> Result<Vec<u8>, String> {
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some((_, relative)) = entry.name().split_once('/') else { continue; };
        if relative == path {
            if entry.size() > 200_000 { return Err(format!("{path} fazla büyük")); }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|error| error.to_string())?;
            return Ok(bytes);
        }
    }
    Err(format!("GitHub kaynağında {path} yok"))
}

fn extract_code_archive(bytes: Vec<u8>, root: &Path, destination: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
    let prefix = if (0..archive.len()).any(|index| archive.by_index(index).map(|entry|
        entry.name().split_once('/').map(|(_, relative)| relative == "stardrop/catalog/catalog.json").unwrap_or(false)
    ).unwrap_or(false)) { "stardrop/" } else { "" };
    let catalog_bytes = archive_file(&mut archive, &format!("{prefix}catalog/catalog.json"))?;
    let catalog: CodeCatalog = serde_json::from_slice(&catalog_bytes).map_err(|_| "Test kataloğu geçersiz")?;
    catalog.validate()?;
    let mut needed = std::collections::HashSet::from(["catalog/catalog.json".to_string()]);
    let mut include_dirs = Vec::new();
    for test in catalog.tests.iter().filter(|test| test.status == "ready") {
        let manifest_bytes = archive_file(&mut archive, &format!("{prefix}{}", test.source_path))?;
        let manifest: ProjectManifest = serde_json::from_slice(&manifest_bytes).map_err(|_| "Proje manifesti geçersiz")?;
        let base = Path::new(&test.source_path).parent().unwrap_or(Path::new(""));
        needed.insert(test.source_path.clone());
        for file in manifest.sources.iter().chain(std::iter::once(&manifest.linker_script)) {
            needed.insert(manifest_path(base, Path::new(""), file)?.to_string_lossy().to_string());
        }
        for dir in &manifest.include_dirs {
            include_dirs.push(manifest_path(base, Path::new(""), dir)?.to_string_lossy().to_string());
        }
    }
    let stage = tempfile::tempdir_in(root).map_err(|error| error.to_string())?;
    let mut hashes = std::collections::HashMap::new();
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        if !entry.is_file() { continue; }
        let Some((_, relative)) = entry.name().split_once('/') else { continue; };
        let Some(relative) = relative.strip_prefix(prefix) else { continue; };
        let relative = relative.to_string();
        if !safe_relative(&relative) { continue; }
        let include = include_dirs.iter().any(|dir| relative.starts_with(&format!("{dir}/")));
        if !needed.contains(&relative) && !include { continue; }
        if relative.contains("/CMSIS/Device/") && relative.ends_with(".h")
            && !relative.rsplit('/').next().unwrap_or("").starts_with("stm32f401")
            && !relative.rsplit('/').next().unwrap_or("").starts_with("stm32f446")
            && !relative.ends_with("stm32f4xx.h") && !relative.ends_with("system_stm32f4xx.h") { continue; }
        if entry.size() > 2_000_000 || total + entry.size() > 16_000_000 { return Err("Derleme kaynakları 16 MB sınırını aşıyor".into()); }
        let mut content = Vec::new();
        entry.read_to_end(&mut content).map_err(|error| error.to_string())?;
        total += content.len() as u64;
        let path = stage.path().join(&relative);
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
        fs::write(path, &content).map_err(|error| error.to_string())?;
        hashes.insert(relative, digest(&content));
    }
    if needed.iter().any(|path| !hashes.contains_key(path)) { return Err("Test projesinde gerekli kaynak dosyası eksik".into()); }
    fs::write(stage.path().join("source-files.sha256.json"), serde_json::to_vec(&hashes).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    fs::rename(stage.path(), destination).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn activate_code_repo(app: tauri::AppHandle, repository: String, sha: String) -> Result<SourceStatus, String> {
    let root = code_root(&app, &repository)?;
    if sha.len() != 40 || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) { return Err("Geçersiz commit kimliği".into()); }
    let destination = root.join(&sha);
    if !code_source_valid(&destination) {
        if destination.exists() { return Err("Bozuk test kaynağı önbelleği; önbelleği temizle".into()); }
        let response = github_client()?.get(format!("https://api.github.com/repos/{repository}/zipball/{sha}"))
            .header("User-Agent", "stardrop-workbench").bearer_auth(token()?).send().await.map_err(|error| error.to_string())?;
        if !response.status().is_success() { return Err(format!("GitHub test indirme HTTP {}", response.status())); }
        if response.content_length().unwrap_or(0) > 16_000_000 { return Err("Kaynak arşivi 16 MB sınırını aşıyor".into()); }
        let bytes = response.bytes().await.map_err(|error| error.to_string())?;
        if bytes.len() > 16_000_000 { return Err("Kaynak arşivi 16 MB sınırını aşıyor".into()); }
        extract_code_archive(bytes.to_vec(), &root, &destination)?;
    }
    fs::write(root.join("active-sha"), &sha).map_err(|error| error.to_string())?;
    Ok(SourceStatus { active_sha: Some(sha.clone()), latest_sha: Some(sha), offline: false, warning: None })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeCatalog { schema_version: u8, #[serde(default)] devices: Vec<CodeDevice>, tests: Vec<CodeTest> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeDevice {
    id: String, name: String, match_parts: Vec<String>, interfaces: Vec<CodeInterface>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeInterface {
    protocol: String, required_roles: Vec<String>, optional_roles: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeTest {
    id: String, status: String, #[serde(default)] source_path: String, build: Option<String>,
    device_id: Option<String>,
    #[serde(default)] protocol: String, #[serde(default)] match_parts: Vec<String>,
    #[serde(default)] supported_mcu: Vec<String>, #[serde(default)] required_roles: Vec<String>,
    #[serde(default)] result: String,
}

impl CodeCatalog {
    fn validate(&self) -> Result<(), String> {
        if !matches!(self.schema_version, 1 | 2) || self.tests.is_empty() || self.tests.len() > 100 { return Err("Test kataloğu sürümü veya boyutu geçersiz".into()); }
        let mut device_ids = std::collections::HashSet::new();
        if self.schema_version == 2 && self.devices.is_empty() { return Err("Katalog cihaz tanımı eksik".into()); }
        for device in &self.devices {
            let mut protocols = std::collections::HashSet::new();
            if !safe_segment(&device.id) || !device_ids.insert(&device.id) || device.name.is_empty()
                || device.match_parts.is_empty() || device.interfaces.is_empty()
                || device.interfaces.iter().any(|interface| !matches!(interface.protocol.as_str(), "GPIO" | "I2C" | "SPI")
                    || !protocols.insert(&interface.protocol) || interface.required_roles.is_empty()
                    || interface.required_roles.iter().chain(&interface.optional_roles).any(|role| !valid_pin_role(role))) {
                return Err("Katalog cihaz tanımı geçersiz".into());
            }
        }
        let mut ids = std::collections::HashSet::new();
        for test in &self.tests {
            let device = test.device_id.as_ref().and_then(|id| self.devices.iter().find(|device| &device.id == id));
            if !safe_segment(&test.id) || !ids.insert(&test.id) || !matches!(test.status.as_str(), "ready" | "planned")
                || self.schema_version == 2 && test.device_id.as_ref().is_none_or(|id| !device_ids.contains(id))
                || self.schema_version == 2 && (test.required_roles.is_empty() || test.required_roles.iter().any(|role| !valid_pin_role(role)))
                || self.schema_version == 2 && device.is_none_or(|device| device.interfaces.iter()
                    .find(|interface| interface.protocol == test.protocol).is_none_or(|interface|
                        test.required_roles.iter().any(|role| !interface.required_roles.contains(role) && !interface.optional_roles.contains(role))))
                || test.status == "ready" && (!safe_relative(&test.source_path) || test.build.as_deref() != Some("stm32-hal-v1")
                    || !matches!(test.result.as_str(), "visual" | "sram") || test.required_roles.is_empty()
                    || test.supported_mcu.is_empty() || self.schema_version == 2 && !test.source_path.ends_with("stardrop-project.json")) {
                return Err("Test kataloğunda geçersiz veya desteklenmeyen kayıt".into());
            }
        }
        Ok(())
    }

    fn matches_component(&self, test: &CodeTest, part: &str, protocol: &str) -> bool {
        if let Some(device_id) = &test.device_id {
            return self.devices.iter().find(|device| &device.id == device_id).is_some_and(|device|
                device.interfaces.iter().any(|interface| interface.protocol == protocol)
                    && device.match_parts.iter().any(|alias| {
                        let alias = alias.to_ascii_uppercase();
                        part == alias || part.starts_with(&format!("{alias}-")) || part.starts_with(&format!("{alias}_"))
                    }));
        }
        test.match_parts.iter().any(|name| part.contains(&name.to_ascii_uppercase()))
    }
}

fn valid_pin_role(role: &str) -> bool {
    matches!(role, "LED" | "SCL" | "SDA" | "SCK" | "MISO" | "MOSI" | "CS" | "INT" | "RESET")
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
    #[serde(default)] project_path: Option<String>,
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

#[tauri::command]
pub async fn toolchain_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools: Vec<_> = ["arm-none-eabi-gcc", "arm-none-eabi-g++", "arm-none-eabi-objcopy"].iter().map(|name| {
            let result = compiler(&app, name).and_then(|path| {
                let output = Command::new(&path).arg("--version").output().map_err(|error| error.to_string())?;
                if !output.status.success() { return Err("Araç çalıştırılamadı".into()); }
                Ok((path.to_string_lossy().to_string(), String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").chars().take(180).collect::<String>()))
            });
            match result { Ok((path, version)) => serde_json::json!({ "name": name, "ready": true, "path": path, "version": version }),
                Err(error) => serde_json::json!({ "name": name, "ready": false, "error": error }) }
        }).collect();
        serde_json::json!({ "ready": tools.iter().all(|tool| tool["ready"] == true), "tools": tools })
    }).await.map_err(|error| error.to_string())
}
#[tauri::command]
pub fn code_cache_info(app: tauri::AppHandle, repository: String) -> Result<serde_json::Value, String> {
    let root = code_root(&app, &repository)?;
    let active = active_code_sha(&root);
    let mut snapshots = Vec::new();
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.len() == 40 && name.chars().all(|ch| ch.is_ascii_hexdigit()) && entry.file_type().map_err(|error| error.to_string())?.is_dir() {
            snapshots.push(serde_json::json!({ "sha": name, "verified": code_source_valid(&entry.path()), "active": active.as_deref() == Some(name.as_str()) }));
        }
    }
    Ok(serde_json::json!({ "activeSha": active, "snapshots": snapshots }))
}
#[tauri::command]
pub fn code_cache_retire(app: tauri::AppHandle, repository: String) -> Result<String, String> {
    let root = code_root(&app, &repository)?;
    let trash = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("retired-code-repos");
    fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
    let destination = trash.join(uuid::Uuid::new_v4().to_string());
    fs::rename(root, &destination).map_err(|error| error.to_string())?;
    Ok(destination.to_string_lossy().into())
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
    let (port, number, interval, active_low, target) = validate_led_request(&request)?;
    let header = format!("#pragma once\n#define STARDROP_SCL_PORT 0\n#define STARDROP_SCL_PIN 0\n#define STARDROP_SDA_PORT 0\n#define STARDROP_SDA_PIN 0\n#define STARDROP_LED_PORT {port}\n#define STARDROP_LED_PIN {number}\n#define STARDROP_LED_ACTIVE_LOW {}\n#define STARDROP_BLINK_MS {interval}\n#define STARDROP_VISUAL_TEST 1\n#define STARDROP_USE_I2C 0\n#define STARDROP_F401 {}\n#define STARDROP_TEST_ID_HASH {}\n#define STARDROP_PROFILE_HASH {}\n#define STARDROP_RUN_HASH {}\n", active_low as u8, (target == "stm32f401cc") as u8, hash32(b"led-blink"), hash32(request.profile_json.as_bytes()), hash32(request.request_id.as_bytes()));
    let work = tempfile::tempdir().map_err(|error| error.to_string())?;
    let (on, off) = led_timing(&request.profile_json, &request.component_ref)?;
    let header = format!("{header}#define STARDROP_LED_ON_MS {on}\n#define STARDROP_LED_OFF_MS {off}\n");
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

fn validate_led_request(request: &LedBuildRequest) -> Result<(u8, u8, u64, bool, &'static str), String> {
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
    if bytes.len() < 3 || bytes.len() > 4 || bytes[0] != b'P' || !matches!(bytes[1], b'A' | b'B' | b'C' | b'D') { return Err("LED GPIO geçersiz".into()); }
    let port = bytes[1] - b'A';
    let number: u8 = pin[2..].parse().map_err(|_| "LED GPIO geçersiz")?;
    if number > 15 || (port == 0 && (number == 13 || number == 14))
        || !package_pin_present(&request.mcu_part, pin) { return Err("GPIO bu hedef için uygun değil".into()); }
    let (interval, _) = led_timing(&request.profile_json, &request.component_ref)?;
    let active_low = component["activeLow"].as_bool().ok_or("LED polaritesi eksik")?;
    if request.request_id.len() > 100 || !request.request_id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') { return Err("Çalıştırma kimliği geçersiz".into()); }
    Ok((port, number, interval, active_low, target))
}

fn led_timing(profile_json: &str, component_ref: &str) -> Result<(u64, u64), String> {
    let profile: serde_json::Value = serde_json::from_str(profile_json).map_err(|_| "Profil geçersiz")?;
    let component = profile["components"].as_array().ok_or("Bileşen yok")?.iter()
        .find(|item| item["ref"] == component_ref).ok_or("LED yok")?;
    let read = |key: &str| -> Result<u64, String> {
        let value = component.get(key).unwrap_or(&component["blinkMs"]);
        let ms = value.as_u64().ok_or("LED süresi geçersiz")?;
        let maximum = if component.get(key).is_some() { 60000 } else { 5000 };
        if !(50..=maximum).contains(&ms) { return Err("LED süresi sınır dışında".into()); }
        Ok(ms)
    };
    Ok((read("onMs")?, read("offMs")?))
}

#[tauri::command]
pub async fn compile_blackpill_led(app: tauri::AppHandle, request: LedBuildRequest) -> Result<LedBuildResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let gcc = compiler(&app, "arm-none-eabi-gcc")?;
        let objcopy = compiler(&app, "arm-none-eabi-objcopy")?;
        let project = request.project_path.clone().ok_or("Yerel BlackPill proje klasörü seçilmedi")?;
        compile_blackpill_at(Path::new(&project), Path::new(&project), &gcc, &objcopy, request)
    }).await.map_err(|error| error.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeBuildRequest {
    repository: String, test_id: String,
    profile_json: String, component_ref: String, request_id: String,
    mcu_part: String, target_uid: String,
}

#[tauri::command]
pub async fn compile_code_test(app: tauri::AppHandle, request: CodeBuildRequest) -> Result<LedBuildResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = code_root(&app, &request.repository)?;
        let sha = active_code_sha(&root).ok_or("Önce test deposunu indir ve etkinleştir")?;
        let source = root.join(&sha);
        if !code_source_valid(&source) { return Err("Test kaynağı doğrulanamadı".into()); }
        compile_code_test_at(&source, &compiler(&app, "arm-none-eabi-gcc")?,
            &compiler(&app, "arm-none-eabi-objcopy")?, request, sha)
    }).await.map_err(|error| error.to_string())?
}

fn compile_code_test_at(source: &Path, gcc: &Path, objcopy: &Path, request: CodeBuildRequest, sha: String) -> Result<LedBuildResult, String> {
        let catalog: CodeCatalog = serde_json::from_slice(&fs::read(source.join("catalog/catalog.json")).map_err(|error| error.to_string())?)
            .map_err(|_| "Test kataloğu geçersiz")?;
        catalog.validate()?;
        let test = catalog.tests.iter().find(|test| test.id == request.test_id && test.status == "ready")
            .ok_or("Seçilen test bu kaynak sürümünde hazır değil")?;
        let profile: serde_json::Value = serde_json::from_str(&request.profile_json).map_err(|_| "Kart profili geçersiz")?;
        let component = profile["components"].as_array().and_then(|items| items.iter().find(|item| item["ref"] == request.component_ref))
            .ok_or("Test bileşeni kart profilinde yok")?;
        let part = component["part"].as_str().unwrap_or("").to_ascii_uppercase();
        let protocol = component["protocol"].as_str().unwrap_or("");
        if profile["mcu"]["part"] != request.mcu_part || profile["targetUid"] != request.target_uid
            || request.target_uid.len() != 24 || !request.target_uid.chars().all(|ch| ch.is_ascii_hexdigit())
            || !test.supported_mcu.iter().any(|mcu| request.mcu_part.starts_with(mcu))
            || test.protocol != protocol || !catalog.matches_component(test, &part, protocol) {
            return Err("Test kart profili veya STM32 hedefiyle uyuşmuyor".into());
        }
        let connections = profile["connections"].as_array().ok_or("Pin listesi yok")?;
        if test.required_roles.iter().any(|role| !connections.iter().any(|pin| pin["componentRef"] == request.component_ref
            && pin["role"] == *role && pin["approved"] == true)) { return Err("Test için onaylı pin rolleri eksik".into()); }
        if request.request_id.len() > 100 || !request.request_id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
            return Err("Çalıştırma kimliği geçersiz".into());
        }
        let mut header = role_pin_header(&request.profile_json, &request.component_ref)?;
        header.push_str(&format!("#define STARDROP_TEST_ID_HASH {}\n#define STARDROP_PROFILE_HASH {}\n#define STARDROP_RUN_HASH {}\n",
            hash32(test.id.as_bytes()), hash32(request.profile_json.as_bytes()), hash32(request.request_id.as_bytes())));
        if protocol == "GPIO" && part == "LED" {
            let led_request = LedBuildRequest { repository: request.repository.clone(), account: String::new(),
                profile_json: request.profile_json.clone(), component_ref: request.component_ref.clone(),
                request_id: request.request_id.clone(), mcu_part: request.mcu_part.clone(), target_uid: request.target_uid.clone(),
                project_path: None };
            let (_, _, interval, active_low, _) = validate_led_request(&led_request)?;
            header.push_str(&format!("#define STARDROP_LED_ACTIVE_LOW {}\n#define STARDROP_LED_BLINK_MS {interval}\n#define STARDROP_LED_SERIAL_ENABLED 0\n", active_low as u8));
            let (on, off) = led_timing(&request.profile_json, &request.component_ref)?;
            header.push_str(&format!("#define STARDROP_LED_ON_MS {on}\n#define STARDROP_LED_OFF_MS {off}\n"));
        }
        header.push_str("#endif\n");
        let project = source.join(Path::new(&test.source_path).parent().unwrap_or(Path::new("")));
        let led_request = LedBuildRequest { repository: request.repository, account: String::new(),
            profile_json: request.profile_json, component_ref: request.component_ref,
            request_id: request.request_id, mcu_part: request.mcu_part, target_uid: request.target_uid,
            project_path: None };
        let mut result = compile_hal_at(&project, source, gcc, objcopy, led_request, header)?;
        result.source_sha = sha;
        Ok(result)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectManifest {
    schema_version: u8,
    target: String,
    linker_script: String,
    cpu: String,
    fpu: String,
    float_abi: String,
    defines: Vec<String>,
    include_dirs: Vec<String>,
    sources: Vec<String>,
    #[serde(default)]
    capabilities: Vec<String>,
}

fn safe_relative(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty() && value.len() <= 180 && path.components().all(|part| matches!(part, std::path::Component::Normal(_)))
}

fn manifest_path(project: &Path, repo_root: &Path, value: &str) -> Result<PathBuf, String> {
    if let Some(relative) = value.strip_prefix("@repo/") {
        if !safe_relative(relative) { return Err("Güvensiz ortak kaynak yolu".into()); }
        Ok(repo_root.join(relative))
    } else if safe_relative(value) { Ok(project.join(value)) }
    else { Err("Güvensiz proje kaynak yolu".into()) }
}

fn package_pin_present(part: &str, pin: &str) -> bool {
    let Ok(data) = serde_json::from_str::<serde_json::Value>(include_str!("../../targets/packages.json")) else { return false; };
    let Some(target) = data["targets"].as_array().and_then(|targets| targets.iter()
        .find(|target| target["prefix"].as_str().is_some_and(|prefix| part.starts_with(prefix)))) else { return false; };
    let Some(map) = target["pinMap"].as_str() else { return false; };
    data["packages"][map].as_array().is_some_and(|pins| pins.iter().any(|name| name == pin))
}

fn role_pin_header(profile_json: &str, component_ref: &str) -> Result<String, String> {
    let profile: serde_json::Value = serde_json::from_str(profile_json).map_err(|_| "Kart profili geçersiz")?;
    let component = profile["components"].as_array().and_then(|items| items.iter().find(|item| item["ref"] == component_ref))
        .ok_or("Başlık için bileşen bulunamadı")?;
    let protocol = component["protocol"].as_str().ok_or("Bileşen protokolü eksik")?;
    let namespace = match protocol { "GPIO" if component["part"] == "LED" => "LED", "GPIO" => "GPIO", "I2C" => "I2C", "SPI" => "SPI", _ => return Err("Pin başlığı için protokol desteklenmiyor".into()) };
    let mcu_part = profile["mcu"]["part"].as_str().unwrap_or("");
    let mut header = String::from("#ifndef STARDROP_PIN_CONFIGURATIONS_H\n#define STARDROP_PIN_CONFIGURATIONS_H\n#define STARDROP_PIN_SCHEMA_VERSION 1\n");
    let bus = profile["connections"].as_array().and_then(|connections| connections.iter()
        .find(|connection| connection["componentRef"] == component_ref
            && (protocol != "I2C" || connection["role"] == "SCL")))
        .and_then(|connection| connection["peripheral"].as_str()).unwrap_or("");
    match (protocol, bus) {
        ("I2C", value) if value.starts_with("SOFT_I2C_") => header.push_str("#define STARDROP_I2C_BUS_SOFTWARE 1\n"),
        ("I2C", "I2C1" | "I2C2" | "I2C3") => header.push_str(&format!("#define STARDROP_I2C_BUS_NUMBER {}\n", &bus[3..])),
        ("SPI", "SPI1" | "SPI2" | "SPI3") => header.push_str(&format!("#define STARDROP_SPI_BUS_NUMBER {}\n", &bus[3..])),
        _ => {}
    }
    if protocol == "I2C" && !matches!(bus, "I2C1" | "I2C2" | "I2C3") && !bus.starts_with("SOFT_I2C_") {
        return Err("I2C bağlantı türü eksik veya geçersiz".into());
    }
    let mut roles = std::collections::HashSet::new();
    let mut pins = std::collections::HashSet::new();
    let mut count = 0;
    for connection in profile["connections"].as_array().ok_or("Pin listesi yok")? {
        if connection["componentRef"] != component_ref { continue; }
        if connection["approved"] != true { return Err("Pin bağlantısı henüz onaylanmadı".into()); }
        let role = connection["role"].as_str().ok_or("Pin rolü eksik")?;
        if !matches!(role, "LED" | "SCL" | "SDA" | "SCK" | "MISO" | "MOSI" | "CS" | "INT" | "RESET") || !roles.insert(role) {
            return Err("Tekrarlı veya bilinmeyen pin rolü".into());
        }
        let pin = connection["mcuPin"].as_str().ok_or("MCU pini eksik")?;
        if protocol == "I2C" && matches!(role, "SCL" | "SDA") {
            if connection["peripheral"].as_str() != Some(bus) {
                return Err("SCL ve SDA aynı I2C hattında olmalı".into());
            }
            let supported = match (bus, role) {
                ("I2C1", "SCL") => matches!(pin, "PB6" | "PB8"),
                ("I2C1", "SDA") => matches!(pin, "PB7" | "PB9"),
                ("I2C2", "SCL") => pin == "PB10",
                ("I2C2", "SDA") => pin == "PB11",
                ("I2C3", "SCL") => pin == "PA8",
                ("I2C3", "SDA") => pin == "PC9",
                (value, _) if value.starts_with("SOFT_I2C_") => true,
                _ => false,
            };
            if !supported { return Err("Seçilen pin donanımsal I2C rolünü desteklemiyor; uygun AF pini veya yazılımsal I2C seç".into()); }
        }
        if !pins.insert(pin) { return Err("İki rol aynı MCU pinine atanmış".into()); }
        let bytes = pin.as_bytes();
        if bytes.len() < 3 || bytes.len() > 4 || bytes[0] != b'P' || !matches!(bytes[1], b'A' | b'B' | b'C' | b'D') { return Err("MCU pini geçersiz".into()); }
        let number: u8 = pin[2..].parse().map_err(|_| "MCU pini geçersiz")?;
        if number > 15 || bytes[1] == b'A' && (number == 13 || number == 14)
            || !package_pin_present(mcu_part, pin) {
            return Err("SWD veya MCU paketinde bulunmayan pin".into());
        }
        let letter = bytes[1] as char;
        let prefix = if namespace == "LED" && role == "LED" { "STARDROP_LED".to_string() }
            else { format!("STARDROP_{namespace}_{role}") };
        header.push_str(&format!("#define {prefix}_GPIO_PORT GPIO{letter}\n#define {prefix}_GPIO_PIN GPIO_PIN_{number}\n#define {prefix}_GPIO_CLK_ENABLE() __HAL_RCC_GPIO{letter}_CLK_ENABLE()\n"));
        count += 1;
    }
    if count == 0 { return Err("Bileşenin onaylı pini yok".into()); }
    Ok(header)
}

fn compile_blackpill_at(project: &Path, repo_root: &Path, gcc: &Path, objcopy: &Path, request: LedBuildRequest) -> Result<LedBuildResult, String> {
    let (_port, _number, interval, active_low, _) = validate_led_request(&request)?;
    let mut header = role_pin_header(&request.profile_json, &request.component_ref)?;
    let (on, off) = led_timing(&request.profile_json, &request.component_ref)?;
    header.push_str(&format!("#define STARDROP_LED_ACTIVE_LOW {}\n#define STARDROP_LED_BLINK_MS {interval}\n#define STARDROP_LED_ON_MS {on}\n#define STARDROP_LED_OFF_MS {off}\n#define STARDROP_LED_SERIAL_ENABLED 0\n#endif\n", active_low as u8));
    compile_hal_at(project, repo_root, gcc, objcopy, request, header)
}

fn compile_hal_at(project: &Path, repo_root: &Path, gcc: &Path, objcopy: &Path, request: LedBuildRequest, header: String) -> Result<LedBuildResult, String> {
    let (expected_target, maximum) = if request.mcu_part.starts_with("STM32F401CC") || request.mcu_part.starts_with("STM32F401CD") {
        ("STM32F401xC", 256 * 1024)
    } else if request.mcu_part.starts_with("STM32F446RE") {
        ("STM32F446xx", 512 * 1024)
    } else { return Err("HAL derleyicisi bu MCU için hazır değil".into()); };
    let project = project.canonicalize().map_err(|_| "Test proje klasörü bulunamadı")?;
    let repo_root = repo_root.canonicalize().map_err(|_| "Test deposu bulunamadı")?;
    for required in ["stardrop-project.json", "Inc/main.h", "Inc/pin_configurations.h"] {
        if !project.join(required).is_file() { return Err(format!("Test projesinde {required} eksik")); }
    }
    let manifest: ProjectManifest = serde_json::from_slice(&fs::read(project.join("stardrop-project.json")).map_err(|error| error.to_string())?)
        .map_err(|error| format!("Proje manifesti geçersiz: {error}"))?;
    if !manifest.sources.iter().any(|source| matches!(source.as_str(), "Src/main.c" | "Src/main.cpp")) {
        return Err("Proje manifestinde main.c veya main.cpp eksik".into());
    }
    let profile: serde_json::Value = serde_json::from_str(&request.profile_json).map_err(|_| "Profil geçersiz")?;
    let is_led = profile["components"].as_array().map(|items| items.iter().any(|component|
        component["ref"] == request.component_ref && component["part"] == "LED")).unwrap_or(false);
    if is_led {
        let (on, off) = led_timing(&request.profile_json, &request.component_ref)?;
        if on != off && !manifest.capabilities.iter().any(|capability| capability == "led-on-off-v1") {
            return Err("Bu kaynak ayrı LED sürelerini desteklemiyor. GitHub'daki yeni kaynak sürümünü indir ve etkinleştir.".into());
        }
    }
    if manifest.schema_version != 1 || manifest.target != expected_target || manifest.cpu != "cortex-m4"
        || manifest.fpu != "fpv4-sp-d16" || manifest.float_abi != "hard"
        || !manifest.defines.iter().any(|item| item == expected_target)
        || manifest.defines.iter().any(|item| item.starts_with("STM32") && item != expected_target) {
        return Err("Proje manifesti seçilen MCU hedefiyle uyuşmuyor".into());
    }
    if manifest.sources.is_empty() || manifest.sources.len() > 64 || manifest.include_dirs.len() > 16
        || manifest_path(&project, &repo_root, &manifest.linker_script).is_err()
        || manifest.sources.iter().any(|item| manifest_path(&project, &repo_root, item).is_err())
        || manifest.include_dirs.iter().any(|item| manifest_path(&project, &repo_root, item).is_err())
        || manifest.defines.iter().any(|item| item.len() > 50 || !item.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_')) {
        return Err("Proje manifestinde geçersiz dosya veya derleme tanımı var".into());
    }
    let work = tempfile::tempdir().map_err(|error| error.to_string())?;
    fs::write(work.path().join("pin_configurations.h"), &header).map_err(|error| error.to_string())?;
    let mut objects = Vec::new();
    for (index, source) in manifest.sources.iter().enumerate() {
        let input = manifest_path(&project, &repo_root, source)?;
        if !input.is_file() { return Err(format!("Proje kaynağı eksik: {source}")); }
        let object = work.path().join(format!("source-{index}.o"));
        let mut command = Command::new(gcc);
        command.args(["-c", "-mcpu=cortex-m4", "-mthumb", "-mfpu=fpv4-sp-d16", "-mfloat-abi=hard", "-Og", "-Wall", "-fdata-sections", "-ffunction-sections"]);
        if source.ends_with(".s") { command.args(["-x", "assembler-with-cpp"]); }
        else {
            if source.ends_with(".cpp") {
                command.args(["-x", "c++", "-std=c++14", "-fno-rtti", "-fno-exceptions", "-fno-threadsafe-statics", "-fno-use-cxa-atexit"]);
            } else if !source.ends_with(".c") { return Err(format!("Desteklenmeyen kaynak uzantısı: {source}")); }
            // Quoted includes in Inc/ must not silently use the checked-in defaults.
            command.arg("-include").arg(work.path().join("pin_configurations.h"));
        }
        for define in &manifest.defines { command.arg(format!("-D{define}")); }
        command.arg("-I").arg(work.path());
        for include in &manifest.include_dirs { command.arg("-I").arg(manifest_path(&project, &repo_root, include)?); }
        let output = command.arg(&input).arg("-o").arg(&object).output().map_err(|error| format!("ARM derleyici başlatılamadı: {error}"))?;
        if !output.status.success() { return Err(format!("{source} derlenemedi: {}", String::from_utf8_lossy(&output.stderr).chars().take(2000).collect::<String>())); }
        objects.push(object);
    }
    let elf = work.path().join("test.elf");
    let bin = work.path().join("test.bin");
    let cpp_linker = gcc.with_file_name(if gcc.extension().is_some_and(|ext| ext == "exe") {
        "arm-none-eabi-g++.exe"
    } else { "arm-none-eabi-g++" });
    let mut link = Command::new(if manifest.sources.iter().any(|source| source.ends_with(".cpp")) {
        &cpp_linker
    } else { gcc });
    link.args(["-mcpu=cortex-m4", "-mthumb", "-mfpu=fpv4-sp-d16", "-mfloat-abi=hard", "-specs=nano.specs"]);
    for object in &objects { link.arg(object); }
    let linked = link.arg("-T").arg(manifest_path(&project, &repo_root, &manifest.linker_script)?)
        .args(["-Wl,--gc-sections", "-lc", "-lm", "-lnosys"]).arg("-o").arg(&elf)
        .output().map_err(|error| format!("ARM linker başlatılamadı: {error}"))?;
    if !linked.status.success() { return Err(format!("Test bağlama hatası: {}", String::from_utf8_lossy(&linked.stderr).chars().take(2000).collect::<String>())); }
    let converted = Command::new(objcopy).args(["-O", "binary", "-S"]).arg(&elf).arg(&bin)
        .output().map_err(|error| format!("Objcopy başlatılamadı: {error}"))?;
    if !converted.status.success() { return Err(format!("BIN oluşturulamadı: {}", String::from_utf8_lossy(&converted.stderr).chars().take(2000).collect::<String>())); }
    let bytes = fs::read(bin).map_err(|error| format!("BIN okunamadı: {error}"))?;
    if bytes.len() < 64 || bytes.len() > maximum { return Err("Derlenen BIN boyutu geçersiz".into()); }
    let mut source = fs::read(project.join("stardrop-project.json")).map_err(|error| error.to_string())?;
    for item in manifest.sources.iter().chain(std::iter::once(&manifest.linker_script)) {
        source.extend_from_slice(item.as_bytes());
        source.extend(fs::read(manifest_path(&project, &repo_root, item)?).map_err(|error| error.to_string())?);
    }
    Ok(LedBuildResult { sha256: digest(&bytes), bytes,
        source_sha: format!("local-{}", &digest(&source)[..12]), profile_hash: hash32(request.profile_json.as_bytes()),
        request_id: request.request_id, header })
}

#[tauri::command]
pub fn clear_source_cache(app: tauri::AppHandle, account: String) -> Result<(), String> {
    if !safe_segment(&account) { return Err("Geçersiz hesap".into()); }
    let root = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("diagnostic-sources").join(account);
    if root.exists() { fs::remove_dir_all(root).map_err(|error| error.to_string())?; }
    let code = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("code-repos");
    if code.exists() { fs::remove_dir_all(code).map_err(|error| error.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bmp_request(bus: &str, scl: &str, sda: &str) -> CodeBuildRequest {
        let profile = serde_json::json!({
            "mcu": {"part": "STM32F446RET6"}, "targetUid": "001300155231501920323239",
            "components": [{"ref": "U1", "part": "BMP180", "protocol": "I2C"}],
            "connections": [
                {"componentRef":"U1", "role":"SCL", "mcuPin":scl, "peripheral":bus, "approved":true},
                {"componentRef":"U1", "role":"SDA", "mcuPin":sda, "peripheral":bus, "approved":true}
            ]
        });
        CodeBuildRequest { repository: String::new(), test_id: "bmp180-f446".into(),
            profile_json: profile.to_string(), component_ref: "U1".into(), request_id: "bmp-test".into(),
            mcu_part: "STM32F446RET6".into(), target_uid: "001300155231501920323239".into() }
    }

    #[test]
    fn i2c_header_rejects_wrong_af_and_mixed_buses() {
        assert!(role_pin_header(&bmp_request("I2C1", "PA0", "PA1").profile_json, "U1").is_err());
        assert!(role_pin_header(&bmp_request("I2C1", "PB6", "PB7").profile_json, "U1").is_ok());
        let request = bmp_request("I2C1", "PB6", "PB7");
        let mut profile: serde_json::Value = serde_json::from_str(&request.profile_json).unwrap();
        profile["connections"][1]["peripheral"] = serde_json::json!("I2C3");
        assert!(role_pin_header(&profile.to_string(), "U1").is_err());
    }

    #[test]
    fn bmp180_cpp_catalog_builds_hardware_and_software_pin_variants() {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../code-repo");
        let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("toolchain/bin/arm-none-eabi-gcc");
        let gcc = if bundled.is_file() { bundled } else { PathBuf::from("/usr/bin/arm-none-eabi-gcc") };
        let objcopy = gcc.with_file_name("arm-none-eabi-objcopy");
        let original = fs::read(repo.join("tests/bmp180-f446/Inc/pin_configurations.h")).unwrap();
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        archive_test_tree(&repo, &repo, &mut zip, "stardrop/");
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        extract_code_archive(zip.finish().unwrap().into_inner(), root.path(), &source).unwrap();
        assert!(code_source_valid(&source));
        let mut hashes = std::collections::HashSet::new();
        for (bus, scl, sda) in [("I2C1", "PB6", "PB7"), ("I2C1", "PB8", "PB9"),
            ("I2C3", "PA8", "PC9"), ("SOFT_I2C_1", "PA0", "PA1")] {
            let result = compile_code_test_at(&source, &gcc, &objcopy, bmp_request(bus, scl, sda), "bmp-source".into()).unwrap();
            assert!(result.bytes.len() > 64 && result.bytes.len() < 512 * 1024);
            assert_eq!(u32::from_le_bytes(result.bytes[..4].try_into().unwrap()), 0x20020000);
            assert!(hashes.insert(result.sha256), "I2C seçimi BIN'e yansımadı");
            assert_eq!(result.source_sha, "bmp-source");
        }
        assert!(compile_code_test_at(&source, &gcc, &objcopy, bmp_request("I2C1", "PA0", "PA1"), "bmp-source".into()).is_err());
        assert_eq!(original, fs::read(repo.join("tests/bmp180-f446/Inc/pin_configurations.h")).unwrap());
    }

    #[test]
    fn package_data_rejects_absent_pins_in_native_builds() {
        assert!(package_pin_present("STM32F401CDU6", "PC13"));
        assert!(!package_pin_present("STM32F401CDU6", "PB11"));
        assert!(package_pin_present("STM32F446RET6", "PC5"));
        assert!(!package_pin_present("STM32F446RET6", "PB11"));
    }

    #[test]
    fn local_v2_device_catalog_is_native_compatible() {
        let catalog: CodeCatalog = serde_json::from_str(include_str!("../../../code-repo/catalog/catalog.json")).unwrap();
        catalog.validate().unwrap();
        let bhi = catalog.tests.iter().find(|test| test.id == "bhi360-identity").unwrap();
        assert!(catalog.matches_component(bhi, "BHI360-IMU", "I2C"));
        assert!(!catalog.matches_component(bhi, "MPU6050", "SPI"));
    }

    fn fixture(interval: u64) -> LedBuildRequest {
        let profile = serde_json::json!({
            "mcu": { "part": "STM32F401CDU6" }, "targetUid": "004B00344231501920393037",
            "components": [{ "ref": "D1", "part": "LED", "protocol": "GPIO", "activeLow": true, "blinkMs": interval }],
            "connections": [{ "componentRef": "D1", "role": "LED", "mcuPin": "PC13", "approved": true }]
        });
        LedBuildRequest { repository: String::new(), account: "tester".into(), profile_json: profile.to_string(),
            component_ref: "D1".into(), request_id: format!("test-{interval}"), mcu_part: "STM32F401CDU6".into(),
            target_uid: "004B00344231501920393037".into(), project_path: None }
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

    #[test]
    fn generic_pin_header_supports_i2c_roles_without_board_refs() {
        let profile = serde_json::json!({
            "mcu": {"part": "STM32F401CDU6"},
            "components": [{"ref": "U23", "part": "BMP180", "protocol": "I2C"}],
            "connections": [
                {"componentRef": "U23", "role": "SCL", "mcuPin": "PB6", "peripheral": "SOFT_I2C_1", "approved": true},
                {"componentRef": "U23", "role": "SDA", "mcuPin": "PB7", "peripheral": "SOFT_I2C_1", "approved": true}
            ]
        });
        let header = role_pin_header(&profile.to_string(), "U23").unwrap();
        assert!(header.contains("STARDROP_I2C_SCL_GPIO_PIN GPIO_PIN_6"));
        assert!(header.contains("STARDROP_I2C_SDA_GPIO_PORT GPIOB"));
        assert!(header.contains("STARDROP_I2C_BUS_SOFTWARE 1"));
        assert!(!header.contains("U23"));
        let bad = profile.to_string().replace("PB7", "PA13");
        assert!(role_pin_header(&bad, "U23").is_err());
    }

    #[test]
    fn local_blackpill_project_uses_generated_header() {
        let Ok(project) = std::env::var("STARDROP_BLACKPILL_PROJECT") else { return; };
        let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("toolchain/bin/arm-none-eabi-gcc");
        let gcc = if bundled.is_file() { bundled } else { PathBuf::from("/usr/bin/arm-none-eabi-gcc") };
        let objcopy = gcc.with_file_name("arm-none-eabi-objcopy");
        let fast = compile_blackpill_at(Path::new(&project), Path::new(&project), &gcc, &objcopy, fixture(100)).unwrap();
        let slow = compile_blackpill_at(Path::new(&project), Path::new(&project), &gcc, &objcopy, fixture(1000)).unwrap();
        let mut other_pin = fixture(100);
        other_pin.profile_json = other_pin.profile_json.replace("PC13", "PB0");
        let moved = compile_blackpill_at(Path::new(&project), Path::new(&project), &gcc, &objcopy, other_pin).unwrap();
        assert!(fast.header.contains("#define STARDROP_LED_GPIO_PORT GPIOC"));
        assert!(slow.header.contains("#define STARDROP_LED_BLINK_MS 1000"));
        assert!(moved.header.contains("#define STARDROP_LED_GPIO_PORT GPIOB"));
        assert_ne!(fast.sha256, slow.sha256);
        assert_ne!(fast.sha256, moved.sha256);
        if let Ok(path) = std::env::var("STARDROP_BLACKPILL_EXPORT") { fs::write(path, fast.bytes).unwrap(); }
    }

    #[test]
    fn github_zip_layout_extracts_and_compiles_led() {
        let Ok(repo) = std::env::var("STARDROP_CODE_REPO_PROJECT") else { return; };
        let archive = Command::new("git").args(["archive", "--format=zip", "--prefix=github-commit/", "HEAD"])
            .current_dir(repo).output().unwrap();
        assert!(archive.status.success());
        let root = tempfile::tempdir().unwrap();
        let destination = root.path().join("source");
        extract_code_archive(archive.stdout, root.path(), &destination).unwrap();
        assert!(code_source_valid(&destination));
        assert!(!destination.join("Drivers/CMSIS/DSP").exists());
        let result = compile_blackpill_at(&destination, &destination, Path::new("arm-none-eabi-gcc"),
            Path::new("arm-none-eabi-objcopy"), fixture(100)).unwrap();
        assert!(result.bytes.len() > 64);
        let profile = fixture(100);
        let build = CodeBuildRequest { repository: "ayberkarslan/stardrop-code-repo".into(), test_id: "led-blink".into(),
            profile_json: profile.profile_json.clone(), component_ref: profile.component_ref,
            request_id: profile.request_id, mcu_part: profile.mcu_part, target_uid: profile.target_uid };
        let remote = compile_code_test_at(&destination, Path::new("arm-none-eabi-gcc"),
            Path::new("arm-none-eabi-objcopy"), build, "remote-commit".into()).unwrap();
        assert!(remote.header.contains("STARDROP_LED_GPIO_PORT GPIOC"));
        assert_eq!(remote.source_sha, "remote-commit");
    }

    fn archive_test_tree(base: &Path, dir: &Path, zip: &mut zip::ZipWriter<Cursor<Vec<u8>>>, prefix: &str) {
        use std::io::Write;
        for item in fs::read_dir(dir).unwrap() {
            let path = item.unwrap().path();
            if path.is_dir() { archive_test_tree(base, &path, zip, prefix); }
            else {
                let relative = path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
                zip.start_file(format!("github-commit/{prefix}{relative}"), zip::write::SimpleFileOptions::default()).unwrap();
                zip.write_all(&fs::read(path).unwrap()).unwrap();
            }
        }
    }

    #[test]
    fn archived_hal_catalog_builds_f446_pin_timing_and_polarity_variants() {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../code-repo");
        let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("toolchain/bin/arm-none-eabi-gcc");
        let gcc = if bundled.is_file() { bundled } else { PathBuf::from("/usr/bin/arm-none-eabi-gcc") };
        let objcopy = gcc.with_file_name("arm-none-eabi-objcopy");
        let original_header = fs::read(repo.join("tests/led-blink-f446/Inc/pin_configurations.h")).unwrap();
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        archive_test_tree(&repo, &repo, &mut zip, "");
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        extract_code_archive(zip.finish().unwrap().into_inner(), root.path(), &source).unwrap();
        assert!(code_source_valid(&source));
        let mut nested_zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        archive_test_tree(&repo, &repo, &mut nested_zip, "stardrop/");
        let source = root.path().join("nested-source");
        extract_code_archive(nested_zip.finish().unwrap().into_inner(), root.path(), &source).unwrap();
        assert!(code_source_valid(&source));
        assert!(!source.join("stardrop").exists());
        assert!(source.join("tests/led-blink-f446/Drivers/CMSIS/Device/ST/STM32F4xx/Include/stm32f446xx.h").is_file());
        assert!(!source.join("tests/led-blink-f446/build").exists());
        let make_request = |pin: &str, interval: u64, active_low: bool| {
            let mut led = fixture(interval);
            led.mcu_part = "STM32F446RET6".into();
            let mut profile: serde_json::Value = serde_json::from_str(&led.profile_json).unwrap();
            profile["mcu"]["part"] = serde_json::json!(led.mcu_part);
            profile["connections"][0]["mcuPin"] = serde_json::json!(pin);
            profile["components"][0]["activeLow"] = serde_json::json!(active_low);
            CodeBuildRequest { repository: String::new(), test_id: "led-blink-f446".into(),
                profile_json: profile.to_string(), component_ref: led.component_ref,
                request_id: led.request_id, mcu_part: led.mcu_part, target_uid: led.target_uid }
        };
        let mut hashes = std::collections::HashSet::new();
        for (pin, interval, active_low) in [("PA5", 100, false), ("PA5", 1000, false),
            ("PB0", 100, false), ("PD2", 100, false), ("PA5", 100, true)] {
            let result = compile_code_test_at(&source, &gcc, &objcopy, make_request(pin, interval, active_low), "test-sha".into()).unwrap();
            assert!(result.header.contains(&format!("STARDROP_LED_BLINK_MS {interval}")));
            assert!(result.header.contains(&format!("STARDROP_LED_ACTIVE_LOW {}", active_low as u8)));
            assert!(result.bytes.len() > 64 && result.bytes.len() < 512 * 1024);
            let stack = u32::from_le_bytes(result.bytes[..4].try_into().unwrap());
            let reset = u32::from_le_bytes(result.bytes[4..8].try_into().unwrap());
            assert_eq!(stack, 0x20020000);
            assert!(reset & 1 == 1 && (0x08000000..0x08080000).contains(&(reset & !1)));
            assert!(hashes.insert(result.sha256), "pin/süre/yön değişimi BIN'e yansımadı");
        }
        let led = fixture(100);
        let f401 = CodeBuildRequest { repository: String::new(), test_id: "led-blink".into(),
            profile_json: led.profile_json, component_ref: led.component_ref, request_id: led.request_id,
            mcu_part: led.mcu_part, target_uid: led.target_uid };
        assert!(compile_code_test_at(&source, &gcc, &objcopy, f401, "test-sha".into()).is_ok());
        for pin in ["PA13", "PA14", "PB11", "PD3"] {
            assert!(compile_code_test_at(&source, &gcc, &objcopy, make_request(pin, 100, false), "test-sha".into()).is_err());
        }
        let mut wrong_target = make_request("PA5", 100, false);
        wrong_target.test_id = "led-blink".into();
        assert!(compile_code_test_at(&source, &gcc, &objcopy, wrong_target, "test-sha".into()).is_err());
        let request = make_request("PA5", 100, false);
        let header = role_pin_header(&request.profile_json, &request.component_ref).unwrap();
        let mismatched_manifest = LedBuildRequest { repository: String::new(), account: String::new(),
            profile_json: request.profile_json, component_ref: request.component_ref, request_id: request.request_id,
            mcu_part: request.mcu_part, target_uid: request.target_uid, project_path: None };
        assert!(compile_hal_at(&source.join("tests/led-blink-f401"), &source, &gcc, &objcopy,
            mismatched_manifest, header).err().unwrap().contains("MCU hedefi"));
        assert!(compile_code_test_at(&source, &gcc, &objcopy, make_request("PA5", 49, false), "test-sha".into()).is_err());
        assert!(compile_code_test_at(&source, &gcc, &objcopy, make_request("PA5", 5001, false), "test-sha".into()).is_err());
        assert_eq!(original_header, fs::read(repo.join("tests/led-blink-f446/Inc/pin_configurations.h")).unwrap());
        let mut asymmetric = make_request("PA5", 100, false);
        let mut profile: serde_json::Value = serde_json::from_str(&asymmetric.profile_json).unwrap();
        profile["components"][0]["onMs"] = serde_json::json!(1000);
        profile["components"][0]["offMs"] = serde_json::json!(2000);
        asymmetric.profile_json = profile.to_string();
        let built = compile_code_test_at(&source, &gcc, &objcopy, asymmetric, "test-sha".into()).unwrap();
        assert!(built.header.contains("STARDROP_LED_ON_MS 1000"));
        assert!(built.header.contains("STARDROP_LED_OFF_MS 2000"));
        assert!(code_source_valid(&source));
    }

    #[test]
    fn code_catalog_requires_supported_build_and_safe_manifest_path() {
        let raw = include_str!("../../../code-repo/catalog/catalog.json");
        let catalog: CodeCatalog = serde_json::from_str(raw).unwrap();
        catalog.validate().unwrap();
        let mut bad: serde_json::Value = serde_json::from_str(raw).unwrap();
        bad["tests"][0]["sourcePath"] = serde_json::json!("../../outside/stardrop-project.json");
        let bad: CodeCatalog = serde_json::from_value(bad).unwrap();
        assert!(bad.validate().is_err());
    }
}
