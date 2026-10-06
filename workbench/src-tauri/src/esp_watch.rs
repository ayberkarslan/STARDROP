use std::collections::HashMap;
use std::net::{Ipv4Addr, UdpSocket};
use std::sync::{Arc, Mutex, OnceLock, atomic::{AtomicBool, Ordering}};
use std::time::{Duration, Instant};
use tauri::Emitter;

static WATCHES: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
fn watches() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> { WATCHES.get_or_init(|| Mutex::new(HashMap::new())) }

#[tauri::command]
pub fn esp_watch_stop(watch_id: String) {
    if let Ok(mut entries) = watches().lock() {
        if let Some(active) = entries.remove(&watch_id) { active.store(false, Ordering::Relaxed); }
    }
}

#[tauri::command]
pub async fn esp_watch(app: tauri::AppHandle, base: String, watch_id: String) -> Result<(), String> {
    let url = super::esp_url(&base, "/ping")?;
    let address: Ipv4Addr = url.host_str().ok_or("ESP adresi yok")?.parse().map_err(|_| "Geçersiz ESP IP")?;
    if uuid::Uuid::parse_str(&watch_id).is_err() { return Err("Geçersiz izleme kimliği".into()); }
    let active = Arc::new(AtomicBool::new(true));
    {
        let mut entries = watches().lock().map_err(|error| error.to_string())?;
        if entries.len() >= 8 || entries.contains_key(&watch_id) { return Err("Cihaz izleme sınırı".into()); }
        entries.insert(watch_id.clone(), active.clone());
    }
    let cleanup_id = watch_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|error| error.to_string())?;
        socket.set_read_timeout(Some(Duration::from_millis(250))).map_err(|error| error.to_string())?;
        let peer = (address, 4210);
        socket.send_to(b"STARDROP_WATCH_V1", peer).map_err(|error| error.to_string())?;
        let mut renewed = Instant::now();
        let mut received = Instant::now();
        let mut previous = String::new();
        let mut bytes = [0u8; 4096];
        let emit = |value: serde_json::Value| app.emit("stardrop-device-status", serde_json::json!({ "watchId": watch_id, "data": value })).map_err(|error| error.to_string());
        let result = (|| -> Result<(), String> {
            while active.load(Ordering::Relaxed) {
                if renewed.elapsed() >= Duration::from_secs(10) {
                    socket.send_to(b"STARDROP_WATCH_V1", peer).map_err(|error| error.to_string())?;
                    renewed = Instant::now();
                }
                match socket.recv_from(&mut bytes) {
                    Ok((size, sender)) if sender.ip() == address && sender.port() == 4210 => {
                        let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes[..size]) else { continue; };
                        if value["protocol"] != "stardrop-status-v1" || !value["target"]["connected"].is_boolean() { continue; }
                        received = Instant::now();
                        let target = &value["target"];
                        let fingerprint = serde_json::json!([target["connected"], target["dpConnected"], target["uid"], target["label"], value["wifi"]["connected"], value["wifi"]["ip"], value["wifi"]["ssid"]]).to_string();
                        if fingerprint != previous {
                            previous = fingerprint;
                            emit(serde_json::json!({ "status": "online", "target": target, "wifi": value["wifi"] }))?;
                        }
                    }
                    Ok(_) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock || error.kind() == std::io::ErrorKind::TimedOut => {}
                    Err(error) => return Err(error.to_string()),
                }
                if received.elapsed() >= Duration::from_secs(10) {
                    emit(serde_json::json!({ "status": "offline" }))?;
                    break;
                }
            }
            Ok(())
        })();
        let _ = socket.send_to(b"STARDROP_UNWATCH_V1", peer);
        result
    }).await.map_err(|error| error.to_string());
    if let Ok(mut entries) = watches().lock() { entries.remove(&cleanup_id); }
    result?
}
