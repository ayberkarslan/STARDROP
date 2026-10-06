use keyring::Entry;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, UdpSocket};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Emitter;
mod local_build;
mod esp_watch;

const AUTH_WORKER: &str = "https://stardrop-auth.ayberkarslann0.workers.dev";
const GITHUB_CLIENT_ID: &str = "Iv23liLOQvO5jpP3xkxR";

fn auth_worker_base(value: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Geçersiz GitHub giriş servisi adresi".to_string())?;
    if url.scheme() != "https" || url.host_str().is_none() || url.port_or_known_default() != Some(443)
        || url.path() != "/" || url.query().is_some() || url.fragment().is_some()
        || !url.username().is_empty() || url.password().is_some() {
        return Err("GitHub giriş servisi yalnızca https://alan-adi biçiminde olmalı".into());
    }
    Ok(value.trim_end_matches('/').to_string())
}

fn auth_worker() -> Result<String, String> {
    let configured = std::env::var("STARDROP_AUTH_WORKER_URL").unwrap_or_else(|_| AUTH_WORKER.into());
    auth_worker_base(&configured)
}

fn parse_curl_auth_response(output: std::process::Output) -> Result<(u16, String), String> {
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(format!("HTTP/3 yedek bağlantısı başarısız: {}", detail.trim().chars().take(250).collect::<String>()));
    }
    if output.stdout.len() > 16 * 1024 { return Err("GitHub giriş servisi yanıtı fazla büyük".into()); }
    let text = String::from_utf8(output.stdout).map_err(|_| "GitHub giriş servisi UTF-8 yanıtı vermedi")?;
    let (body, status) = text.rsplit_once("\n__STARDROP_HTTP_STATUS__")
        .ok_or("HTTP/3 yanıt durumu okunamadı")?;
    let status = status.trim().parse::<u16>().map_err(|_| "Geçersiz HTTP/3 yanıt durumu")?;
    Ok((status, body.to_string()))
}

fn auth_worker_post_http3(url: &str, body: &str) -> Result<(u16, String), String> {
    let mut child = Command::new("curl")
        .args(["--http3-only", "--silent", "--show-error", "--max-time", "15", "--connect-timeout", "5",
            "--request", "POST", "--header", "Content-Type: application/json",
            "--header", "User-Agent: stardrop-workbench", "--data-binary", "@-",
            "--write-out", "\n__STARDROP_HTTP_STATUS__%{http_code}", url])
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|error| format!("HTTP/3 için curl başlatılamadı: {error}"))?;
    child.stdin.take().ok_or("HTTP/3 giriş kanalı açılamadı")?
        .write_all(body.as_bytes()).map_err(|error| error.to_string())?;
    parse_curl_auth_response(child.wait_with_output().map_err(|error| error.to_string())?)
}

async fn auth_worker_post(url: String, body: String) -> Result<(u16, String), String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(15)).build().map_err(|error| error.to_string())?;
    let send = client.post(&url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "stardrop-workbench")
        .body(body.clone());
    match send.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let body = response.text().await.map_err(|error| error.to_string())?;
            Ok((status, body))
        }
        Err(tcp_error) if tcp_error.is_connect() => {
            tauri::async_runtime::spawn_blocking(move || auth_worker_post_http3(&url, &body))
                .await.map_err(|error| error.to_string())?
                .map_err(|http3_error| format!("GitHub giriş servisine HTTPS/TCP ve HTTP/3 ile ulaşılamadı: TCP: {tcp_error}; HTTP/3: {http3_error}"))
        }
        Err(error) => Err(error.to_string()),
    }
}

async fn github_oauth_post(path: &str, fields: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let response = reqwest::Client::builder().timeout(Duration::from_secs(15)).build()
        .map_err(|error| error.to_string())?
        .post(format!("https://github.com/login/{path}"))
        .header("Accept", "application/json")
        .header("User-Agent", "stardrop-workbench")
        .form(fields)
        .send().await.map_err(|error| format!("GitHub'a bağlanılamadı: {error}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if body.len() > 16 * 1024 { return Err("GitHub yanıtı beklenenden büyük".into()); }
    let value: serde_json::Value = serde_json::from_str(&body).map_err(|_| "GitHub geçerli JSON yanıtı vermedi")?;
    if !status.is_success() {
        return Err(format!("GitHub HTTP {status}: {}", value.get("error_description").or_else(|| value.get("error"))
            .and_then(|value| value.as_str()).unwrap_or("İstek başarısız")));
    }
    Ok(value)
}

#[tauri::command]
async fn github_device_start() -> Result<String, String> {
    let value = github_oauth_post("device/code", &[("client_id", GITHUB_CLIENT_ID)]).await?;
    if let Some(error) = value.get("error").and_then(|value| value.as_str()) {
        return Err(if error == "device_flow_disabled" {
            "GitHub App ayarlarında Enable Device Flow'u açman gerekiyor.".into()
        } else { format!("GitHub Device Flow: {error}") });
    }
    for key in ["device_code", "user_code", "verification_uri", "expires_in", "interval"] {
        if value.get(key).is_none() { return Err(format!("GitHub yanıtında {key} eksik")); }
    }
    Ok(value.to_string())
}

#[tauri::command]
async fn github_device_poll(device_code: String) -> Result<String, String> {
    if device_code.len() > 256 || device_code.is_empty() || !device_code.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.') {
        return Err("Geçersiz GitHub cihaz kodu".into());
    }
    github_oauth_post("oauth/access_token", &[
        ("client_id", GITHUB_CLIENT_ID), ("device_code", &device_code),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ]).await.map(|value| value.to_string())
}

#[tauri::command]
async fn github_device_refresh(refresh_token: String) -> Result<String, String> {
    if !refresh_token.starts_with("ghr_") || refresh_token.len() > 256 {
        return Err("Geçersiz GitHub yenileme token'ı".into());
    }
    let value = github_oauth_post("oauth/access_token", &[
        ("client_id", GITHUB_CLIENT_ID), ("grant_type", "refresh_token"),
        ("refresh_token", &refresh_token),
    ]).await?;
    if let Some(error) = value.get("error").and_then(|value| value.as_str()) {
        return Err(format!("GitHub oturumu yenilenemedi: {error}"));
    }
    if value.get("access_token").and_then(|value| value.as_str()).is_none() {
        return Err("GitHub yenileme yanıtında erişim token'ı yok".into());
    }
    Ok(value.to_string())
}

#[tauri::command]
fn github_device_open() -> Result<(), String> {
    open_auth_browser("https://github.com/login/device")
}

const ESP_GET_PATHS: &[&str] = &[
    "/ping", "/api/wifi/status", "/api/wifi/scan", "/api/programmer/status",
    "/api/target/status", "/api/diagnostic/report",
];
const ESP_POST_PATHS: &[&str] = &[
    "/api/wifi/switch", "/api/wifi/add", "/api/wifi/remove",
    "/api/programmer/settings", "/api/programmer/restart", "/api/target/label", "/api/target/maintenance",
];

fn esp_url(base: &str, path: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(base).map_err(|error| error.to_string())?;
    if url.scheme() != "http" || url.host_str().and_then(|host| host.parse::<Ipv4Addr>().ok()).is_none()
        || url.port_or_known_default() != Some(80) || url.path() != "/" || url.query().is_some()
        || url.fragment().is_some() || !url.username().is_empty() || url.password().is_some() {
        return Err("ESP32 adresi http://IP biçiminde ve port 80 olmalı".into());
    }
    url.join(path).map_err(|error| error.to_string())
}

#[tauri::command]
async fn esp_http(base: String, path: String, method: String, body: Option<String>, timeout_ms: Option<u64>) -> Result<String, String> {
    let url = esp_url(&base, &path)?;
    let maximum_timeout = if path == "/api/target/maintenance" { 180000 } else { 30000 };
    let client = reqwest::Client::builder().timeout(Duration::from_millis(timeout_ms.unwrap_or(10000).clamp(1000, maximum_timeout)))
        .build().map_err(|error| error.to_string())?;
    let request = match method.as_str() {
        "GET" if ESP_GET_PATHS.contains(&path.as_str()) => client.get(url),
        "POST" if ESP_POST_PATHS.contains(&path.as_str()) => {
            let data = body.ok_or("POST gövdesi eksik")?;
            if data.len() > 4096 { return Err("ESP32 isteği fazla büyük".into()); }
            client.post(url).header("Content-Type", "application/json").body(data)
        }
        _ => return Err("ESP32 uç noktası izinli değil".into()),
    };
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() { return Err(format!("ESP32 HTTP {}: {}", status, text.chars().take(200).collect::<String>())); }
    if text.len() > 128 * 1024 { return Err("ESP32 yanıtı beklenenden büyük".into()); }
    Ok(text)
}

#[tauri::command]
async fn esp_upload(base: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 1024 * 1024 { return Err("Firmware boş veya 1 MB sınırını aşıyor".into()); }
    let url = esp_url(&base, "/upload")?;
    let part = reqwest::multipart::Part::bytes(bytes).file_name("firmware.bin").mime_str("application/octet-stream")
        .map_err(|error| error.to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let response = reqwest::Client::builder().timeout(Duration::from_secs(45)).build().map_err(|error| error.to_string())?
        .post(url).multipart(form).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() { return Err(format!("ESP32 yükleme HTTP {}: {}", status, text.chars().take(200).collect::<String>())); }
    Ok(text)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EspStreamEvent {
    stream_id: String,
    data: String,
}

#[tauri::command]
async fn esp_stream(app: tauri::AppHandle, base: String, path: String, stream_id: String, method: Option<String>, body: Option<String>) -> Result<String, String> {
    let method = method.as_deref().unwrap_or("GET");
    let maintenance = path == "/stream-target-maintenance";
    if maintenance {
        if method != "POST" || body.as_ref().is_none_or(|value| value.len() > 4096) { return Err("Geçersiz bakım isteği".into()); }
    } else if (path != "/stream-flash" && path != "/stream-target-flash-usage") || method != "GET" || body.is_some() {
        return Err("Geçersiz ESP32 akışı".into());
    }
    if stream_id.len() != 36 || !stream_id.chars().all(|ch| ch.is_ascii_hexdigit() || ch == '-') { return Err("Geçersiz akış kimliği".into()); }
    let url = esp_url(&base, &path)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(190)).build().map_err(|error| error.to_string())?;
    let request = if maintenance { client.post(url).header("Content-Type", "application/json").body(body.unwrap()) } else { client.get(url) };
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() { return Err(format!("ESP32 akışı HTTP {}", response.status())); }
    let mut response = response;
    let mut pending = Vec::<u8>::new();
    let mut total = 0usize;
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        total += chunk.len();
        if total > 2 * 1024 * 1024 { return Err("ESP32 olay akışı fazla büyük".into()); }
        pending.extend_from_slice(&chunk);
        while let Some(end) = pending.windows(2).position(|pair| pair == b"\n\n") {
            let frame: Vec<u8> = pending.drain(..end + 2).collect();
            let frame = String::from_utf8_lossy(&frame);
            for line in frame.lines() {
                let Some(data) = line.strip_prefix("data: ") else { continue; };
                app.emit("stardrop-esp-stream", EspStreamEvent { stream_id: stream_id.clone(), data: data.to_string() })
                    .map_err(|error| error.to_string())?;
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
                    if value.get("done").and_then(|flag| flag.as_bool()) == Some(true)
                        || value.get("error").and_then(|flag| flag.as_bool()) == Some(true) { return Ok(data.to_string()); }
                }
            }
        }
        if pending.len() > 16 * 1024 { return Err("ESP32 olay çerçevesi fazla büyük".into()); }
    }
    Err("ESP32 akışı tamamlanmadan kapandı".into())
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EspDiscoveryPacket {
    protocol: String,
    name: String,
    mac: String,
    sta_connected: bool,
    ip: String,
    ap_ip: String,
    http_port: u16,
    rssi: i32,
    #[serde(default)]
    reply_address: String,
}

#[tauri::command]
async fn discover_esp() -> Result<Vec<EspDiscoveryPacket>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
        socket.set_broadcast(true).map_err(|error| error.to_string())?;
        socket.set_read_timeout(Some(Duration::from_millis(250))).map_err(|error| error.to_string())?;
        socket.send_to(b"STARDROP_DISCOVER_V1", (Ipv4Addr::BROADCAST, 4210))
            .map_err(|error| error.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut devices = Vec::new();
        let mut bytes = [0u8; 1024];
        while Instant::now() < deadline && devices.len() < 16 {
            match socket.recv_from(&mut bytes) {
                Ok((size, sender)) => {
                    let Ok(mut device) = serde_json::from_slice::<EspDiscoveryPacket>(&bytes[..size]) else { continue; };
                    if device.protocol != "stardrop-discovery-v1" || device.http_port != 80 || device.ip.parse::<Ipv4Addr>().is_err() { continue; }
                    device.reply_address = sender.ip().to_string();
                    if !devices.iter().any(|known: &EspDiscoveryPacket| known.mac == device.mac && known.reply_address == device.reply_address) {
                        devices.push(device);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock || error.kind() == std::io::ErrorKind::TimedOut => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(devices)
    }).await.map_err(|error| error.to_string())?
}

fn entry_for(key: &str) -> Result<Entry, String> {
    if key.is_empty() || !key.chars().all(|value| value.is_ascii_alphanumeric() || value == '_' || value == '-') {
        return Err("Geçersiz secret anahtarı".into());
    }
    Entry::new("com.yildizroket.stardrop-workbench", key).map_err(|error| error.to_string())
}

static VOLATILE_SECRETS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn volatile_secrets() -> &'static Mutex<HashMap<String, String>> {
    VOLATILE_SECRETS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn memory_secret(key: &str) -> Result<Option<String>, String> {
    Ok(volatile_secrets().lock().map_err(|error| error.to_string())?.get(key).cloned())
}

fn read_secret(key: &str) -> Result<Option<String>, String> {
    if let Some(value) = memory_secret(key)? { return Ok(Some(value)); }
    match entry_for(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        // On systems without Secret Service, a previously persisted login
        // cannot be read. New credentials are kept in process memory only.
        Err(keyring::Error::PlatformFailure(_) | keyring::Error::NoStorageAccess(_)) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_secret(key: String, value: String) -> Result<&'static str, String> {
    match entry_for(&key)?.set_password(&value) {
        Ok(()) => {
            volatile_secrets().lock().map_err(|error| error.to_string())?.remove(&key);
            Ok("os")
        }
        Err(keyring::Error::PlatformFailure(_) | keyring::Error::NoStorageAccess(_)) => {
            volatile_secrets().lock().map_err(|error| error.to_string())?.insert(key, value);
            Ok("memory")
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn load_secret(key: String) -> Result<Option<String>, String> {
    read_secret(&key)
}

#[tauri::command]
fn delete_secret(key: String) -> Result<(), String> {
    volatile_secrets().lock().map_err(|error| error.to_string())?.remove(&key);
    match entry_for(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry)
            | Err(keyring::Error::PlatformFailure(_) | keyring::Error::NoStorageAccess(_)) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubRepoDiagnostic {
    credential_source: String,
    token_format: String,
    token_length: usize,
    user_status: u16,
    repository_status: u16,
    catalog_status: u16,
}

#[tauri::command]
async fn github_repo_diagnostic(repository: String) -> Result<GitHubRepoDiagnostic, String> {
    let parts: Vec<_> = repository.split('/').collect();
    if parts.len() != 2 || !parts.iter().all(|part| !part.is_empty() && part.len() <= 100
        && part.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))) {
        return Err("Geçersiz GitHub deposu".into());
    }
    let repo_token = read_secret("github_repo_token")?.filter(|value| !value.is_empty());
    let (source, credential) = if let Some(value) = repo_token {
        ("depo anahtarı", value)
    } else {
        ("GitHub giriş tokeni", read_secret("github_access_token")?
            .ok_or("Kaydedilmiş GitHub kimlik bilgisi bulunamadı")?)
    };
    let format = if credential.starts_with("github_pat_") { "fine-grained PAT biçimi" }
        else if credential.starts_with("ghu_") { "GitHub App kullanıcı tokeni biçimi" }
        else if credential.starts_with("ghp_") { "classic PAT biçimi" }
        else { "beklenmeyen biçim" };
    let client = reqwest::Client::builder().timeout(Duration::from_secs(12)).build().map_err(|error| error.to_string())?;
    let user_status = client.get("https://api.github.com/user").header("User-Agent", "stardrop-workbench")
        .bearer_auth(&credential).send().await.map_err(|error| error.to_string())?.status().as_u16();
    let repository_status = client.get(format!("https://api.github.com/repos/{repository}"))
        .header("User-Agent", "stardrop-workbench").bearer_auth(&credential)
        .send().await.map_err(|error| error.to_string())?.status().as_u16();
    let mut catalog_status = client.get(format!("https://api.github.com/repos/{repository}/contents/stardrop/catalog/catalog.json"))
        .header("User-Agent", "stardrop-workbench").bearer_auth(&credential)
        .send().await.map_err(|error| error.to_string())?.status().as_u16();
    if catalog_status == 404 {
        catalog_status = client.get(format!("https://api.github.com/repos/{repository}/contents/catalog/catalog.json"))
            .header("User-Agent", "stardrop-workbench").bearer_auth(&credential)
            .send().await.map_err(|error| error.to_string())?.status().as_u16();
    }
    Ok(GitHubRepoDiagnostic { credential_source: source.into(), token_format: format.into(),
        token_length: credential.len(), user_status, repository_status, catalog_status })
}

fn open_auth_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    command.arg(url).spawn().map_err(|error| format!("Tarayıcı açılamadı: {error}"))?;
    Ok(())
}

fn reply_to_browser(stream: &mut std::net::TcpStream, status: &str, message: &str) {
    let body = message.as_bytes();
    let reply = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
    let _ = stream.write_all(reply.as_bytes());
    let _ = stream.write_all(body);
}

fn wait_for_github_callback(listener: TcpListener, state: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(180);
    while Instant::now() < deadline {
        let (mut stream, _) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(error) => return Err(error.to_string()),
        };
        stream.set_read_timeout(Some(Duration::from_secs(2))).map_err(|error| error.to_string())?;
        let mut bytes = [0u8; 4096];
        let count = match stream.read(&mut bytes) { Ok(count) => count, Err(_) => continue };
        let request = String::from_utf8_lossy(&bytes[..count]);
        let Some(target) = request.lines().next().and_then(|line| line.strip_prefix("GET ")).and_then(|line| line.split_whitespace().next()) else { continue };
        let Ok(url) = reqwest::Url::parse(&format!("http://127.0.0.1{target}")) else { continue };
        if url.path() != "/callback" { continue; }
        let valid = url.query_pairs().any(|(key, value)| key == "state" && value == state);
        if !valid {
            reply_to_browser(&mut stream, "400 Bad Request", "Geçersiz oturum durumu.");
            continue;
        }
        if let Some(error) = url.query_pairs().find(|(key, _)| key == "error").map(|(_, value)| value.into_owned()) {
            reply_to_browser(&mut stream, "200 OK", "GitHub girişi iptal edildi. Bu sekmeyi kapatabilirsiniz.");
            return Err(format!("GitHub yetkilendirmesi reddedildi: {error}"));
        }
        let code = url.query_pairs().find(|(key, _)| key == "code").map(|(_, value)| value.into_owned())
            .filter(|value| !value.is_empty()).ok_or("GitHub yetkilendirme kodu gelmedi")?;
        reply_to_browser(&mut stream, "200 OK", "GitHub yetkilendirme kodu alındı. STARDROP uygulamasına dönün; token doğrulaması sürüyor.");
        return Ok(code);
    }
    Err("GitHub girişi 3 dakika içinde tamamlanmadı".into())
}

#[tauri::command]
async fn github_browser_login() -> Result<String, String> {
    let auth_worker = auth_worker()?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    let state = format!("{}.{:032x}", port, uuid::Uuid::new_v4().as_u128());
    let start = format!("{auth_worker}/start?state={state}");
    let expected = state.clone();
    let callback = tauri::async_runtime::spawn_blocking(move || wait_for_github_callback(listener, &expected));
    open_auth_browser(&start)?;
    let code = callback.await.map_err(|error| error.to_string())??;
    let (status, body) = auth_worker_post(format!("{auth_worker}/exchange"), serde_json::json!({ "code": code }).to_string()).await?;
    if !(200..300).contains(&status) {
        let detail = body.chars().take(300).collect::<String>();
        return Err(format!("GitHub token değişimi HTTP {status}: {detail}"));
    }
    let value: serde_json::Value = serde_json::from_str(&body).map_err(|error| error.to_string())?;
    if value.get("access_token").and_then(|token| token.as_str()).is_none() {
        return Err(value.get("error_description").or_else(|| value.get("error")).and_then(|error| error.as_str())
            .unwrap_or("GitHub erişim token'ı vermedi").into());
    }
    Ok(body)
}

#[tauri::command]
async fn github_refresh_login(refresh_token: String) -> Result<String, String> {
    if !refresh_token.starts_with("ghr_") || refresh_token.len() > 256 {
        return Err("Geçersiz GitHub yenileme token'ı".into());
    }
    let auth_worker = auth_worker()?;
    let (status, body) = auth_worker_post(format!("{auth_worker}/refresh"), serde_json::json!({ "refresh_token": refresh_token }).to_string()).await?;
    if !(200..300).contains(&status) { return Err(format!("GitHub oturum yenileme HTTP {status}: {}", body.chars().take(300).collect::<String>())); }
    let value: serde_json::Value = serde_json::from_str(&body).map_err(|error| error.to_string())?;
    if value.get("access_token").and_then(|token| token.as_str()).is_none() {
        return Err(value.get("error_description").and_then(|error| error.as_str()).unwrap_or("GitHub oturumu yenilenemedi").into());
    }
    Ok(body)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_secret, load_secret, delete_secret, github_repo_diagnostic, github_browser_login, github_refresh_login, github_device_start, github_device_poll, github_device_refresh, github_device_open, discover_esp, esp_http, esp_upload, esp_stream, esp_watch::esp_watch, esp_watch::esp_watch_stop, local_build::source_status, local_build::activate_source, local_build::code_repo_status, local_build::activate_code_repo, local_build::compile_code_test, local_build::compile_led, local_build::compile_blackpill_led, local_build::clear_source_cache])
        .run(tauri::generate_context!())
        .expect("STARDROP Workbench başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_worker_url_requires_https_origin() {
        assert_eq!(auth_worker_base("https://auth.example.com/").unwrap(), "https://auth.example.com");
        for value in ["http://auth.example.com", "https://auth.example.com/path", "https://auth.example.com?x=1", "https://user:pass@auth.example.com", "https://auth.example.com:8443"] {
            assert!(auth_worker_base(value).is_err(), "{value}");
        }
    }

    #[test]
    fn auth_worker_http3_when_configured() {
        if std::env::var("STARDROP_TEST_AUTH_WORKER").is_err() { return; }
        let (status, body) = tauri::async_runtime::block_on(auth_worker_post(
            format!("{AUTH_WORKER}/exchange"), r#"{"code":"invalid"}"#.into())).unwrap();
        assert_eq!(status, 200);
        assert!(body.contains("bad_verification_code"));
    }

    #[test]
    fn volatile_secret_is_available_to_native_github_operations() {
        let key = "stardrop_test_volatile_secret";
        volatile_secrets().lock().unwrap().insert(key.into(), "temporary".into());
        assert_eq!(read_secret(key).unwrap().as_deref(), Some("temporary"));
        volatile_secrets().lock().unwrap().remove(key);
    }

    #[test]
    fn esp_url_requires_plain_http_ipv4_on_port_80() {
        assert_eq!(esp_url("http://192.168.1.3", "/ping").unwrap().as_str(), "http://192.168.1.3/ping");
        assert!(esp_url("https://192.168.1.3", "/ping").is_err());
        assert!(esp_url("http://example.com", "/ping").is_err());
        assert!(esp_url("http://192.168.1.3:8080", "/ping").is_err());
    }

    #[test]
    fn native_esp_probe_when_configured() {
        let Ok(base) = std::env::var("STARDROP_TEST_ESP") else { return; };
        let ping = tauri::async_runtime::block_on(esp_http(base.clone(), "/ping".into(), "GET".into(), None, Some(4000))).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&ping).unwrap()["status"], "ok");
        let wifi = tauri::async_runtime::block_on(esp_http(base, "/api/wifi/status".into(), "GET".into(), None, Some(4000))).unwrap();
        assert!(serde_json::from_str::<serde_json::Value>(&wifi).unwrap()["ip"].is_string());
    }

    #[test]
    fn github_callback_rejects_wrong_state_before_accepting_code() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = std::thread::spawn(move || wait_for_github_callback(listener, "expected"));
        for state in ["wrong", "expected"] {
            let mut stream = std::net::TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
            let request = format!("GET /callback?state={state}&code=valid-code HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
            stream.write_all(request.as_bytes()).unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            assert!(response.starts_with(if state == "wrong" { "HTTP/1.1 400" } else { "HTTP/1.1 200" }));
        }
        assert_eq!(worker.join().unwrap().unwrap(), "valid-code");
    }
}
