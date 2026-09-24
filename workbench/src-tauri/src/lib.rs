use keyring::Entry;
use std::net::{Ipv4Addr, UdpSocket};
use std::time::{Duration, Instant};
use tauri::Emitter;

const ESP_GET_PATHS: &[&str] = &[
    "/ping", "/api/wifi/status", "/api/wifi/scan", "/api/programmer/status",
    "/api/target/status", "/api/diagnostic/report",
];
const ESP_POST_PATHS: &[&str] = &[
    "/api/wifi/switch", "/api/wifi/add", "/api/wifi/remove",
    "/api/programmer/settings", "/api/target/label",
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
    let client = reqwest::Client::builder().timeout(Duration::from_millis(timeout_ms.unwrap_or(10000).clamp(1000, 30000)))
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
async fn esp_stream(app: tauri::AppHandle, base: String, path: String, stream_id: String) -> Result<(), String> {
    if path != "/stream-flash" && path != "/stream-target-flash-usage" { return Err("Geçersiz ESP32 akışı".into()); }
    if stream_id.len() != 36 || !stream_id.chars().all(|ch| ch.is_ascii_hexdigit() || ch == '-') { return Err("Geçersiz akış kimliği".into()); }
    let url = esp_url(&base, &path)?;
    let response = reqwest::Client::builder().timeout(Duration::from_secs(190)).build().map_err(|error| error.to_string())?
        .get(url).send().await.map_err(|error| error.to_string())?;
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
                        || value.get("error").and_then(|flag| flag.as_bool()) == Some(true) { return Ok(()); }
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

#[tauri::command]
async fn download_artifact(repository: String, artifact_id: u64) -> Result<tauri::ipc::Response, String> {
    let pieces: Vec<&str> = repository.split('/').collect();
    if pieces.len() != 2 || pieces.iter().any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')) {
        return Err("Geçersiz GitHub deposu".into());
    }
    let token = entry_for("github_access_token")?.get_password().map_err(|error| error.to_string())?;
    let url = format!("https://api.github.com/repos/{}/{}/actions/artifacts/{}/zip", pieces[0], pieces[1], artifact_id);
    let response = reqwest::Client::new().get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "stardrop-workbench")
        .bearer_auth(token).send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() { return Err(format!("GitHub artefakt indirme HTTP {}", response.status())); }
    if response.content_length().unwrap_or(0) > 50 * 1024 * 1024 { return Err("Artefakt 50 MB sınırını aşıyor".into()); }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > 50 * 1024 * 1024 { return Err("Artefakt 50 MB sınırını aşıyor".into()); }
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}

#[tauri::command]
async fn github_device_request(client_id: String, device_code: Option<String>) -> Result<String, String> {
    if client_id.is_empty() || !client_id.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return Err("Geçersiz GitHub Client ID".into());
    }
    let (url, mut form) = if let Some(code) = device_code {
        ("https://github.com/login/oauth/access_token", vec![
            ("client_id", client_id), ("device_code", code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code".to_string()),
        ])
    } else {
        ("https://github.com/login/device/code", vec![("client_id", client_id)])
    };
    let response = reqwest::Client::new().post(url)
        .header("Accept", "application/json")
        .header("User-Agent", "stardrop-workbench")
        .form(&form).send().await.map_err(|error| error.to_string())?;
    form.clear();
    if !response.status().is_success() { return Err(format!("GitHub giriş HTTP {}", response.status())); }
    response.text().await.map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_secret, load_secret, delete_secret, download_artifact, github_device_request, discover_esp, esp_http, esp_upload, esp_stream])
        .run(tauri::generate_context!())
        .expect("STARDROP Workbench başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
