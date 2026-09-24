use keyring::Entry;
use std::net::{Ipv4Addr, UdpSocket};
use std::time::{Duration, Instant};

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
        .invoke_handler(tauri::generate_handler![save_secret, load_secret, delete_secret, download_artifact, github_device_request, discover_esp])
        .run(tauri::generate_context!())
        .expect("STARDROP Workbench başlatılamadı");
}
