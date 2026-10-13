use std::io;
use std::net::{Ipv4Addr, SocketAddrV4, UdpSocket};
use std::time::Duration;

const PREFIX: &str = "STARDROP_WATCH_V1 ";
const MAX_REPLY: usize = 4096;

fn read_with_retry(socket: &UdpSocket, peer: SocketAddrV4, sequence: &str, body: &str) -> Result<String, String> {
    let request = format!("{PREFIX}{sequence}\n{body}");
    if request.len() > 1024 { return Err("İzleme isteği fazla büyük".into()); }
    let expected = format!("{PREFIX}{sequence}\n");
    let mut bytes = [0u8; MAX_REPLY];
    for _ in 0..4 {
        socket.send_to(request.as_bytes(), peer).map_err(|error| error.to_string())?;
        loop {
            match socket.recv_from(&mut bytes) {
                Ok((size, sender)) => {
                    if sender != peer.into() || !bytes[..size].starts_with(expected.as_bytes()) { continue; }
                    let json = std::str::from_utf8(&bytes[expected.len()..size])
                        .map_err(|_| "ESP32 izleme yanıtı UTF-8 değil".to_string())?;
                    serde_json::from_str::<serde_json::Value>(json)
                        .map_err(|_| "ESP32 izleme yanıtı geçersiz".to_string())?;
                    return Ok(json.to_string());
                }
                Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut) => break,
                Err(error) => return Err(error.to_string()),
            }
        }
    }
    Err("ESP32 canlı okuma yanıtı gecikti; ağ bağlantısı yeniden deneniyor".into())
}

#[tauri::command]
pub async fn esp_watch_udp_read(base: String, body: String) -> Result<String, String> {
    let url = super::esp_url(&base, "/api/watch/read")?;
    let address: Ipv4Addr = url.host_str().ok_or("ESP adresi yok")?
        .parse().map_err(|_| "ESP IP adresi geçersiz")?;
    if body.len() > 900 || serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return Err("İzleme isteği geçersiz".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|error| error.to_string())?;
        socket.set_read_timeout(Some(Duration::from_millis(150))).map_err(|error| error.to_string())?;
        let sequence = uuid::Uuid::new_v4().simple().to_string()[..8].to_string();
        read_with_retry(&socket, SocketAddrV4::new(address, 4211), &sequence, &body)
    }).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_lost_reply_without_changing_sequence() {
        let server = UdpSocket::bind("127.0.0.1:0").unwrap();
        server.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let peer = match server.local_addr().unwrap() { std::net::SocketAddr::V4(addr) => addr, _ => unreachable!() };
        let thread = std::thread::spawn(move || {
            let mut bytes = [0u8; 1024];
            let (first_size, _) = server.recv_from(&mut bytes).unwrap();
            let first = bytes[..first_size].to_vec();
            let (second_size, sender) = server.recv_from(&mut bytes).unwrap();
            assert_eq!(first, bytes[..second_size]);
            server.send_to(b"STARDROP_WATCH_V1 deadbeef\n{\"valid\":true}", sender).unwrap();
            server.send_to(b"STARDROP_WATCH_V1 1234abcd\n{\"valid\":true}", sender).unwrap();
        });
        let client = UdpSocket::bind("127.0.0.1:0").unwrap();
        client.set_read_timeout(Some(Duration::from_millis(50))).unwrap();
        assert_eq!(read_with_retry(&client, peer, "1234abcd", "{}"), Ok("{\"valid\":true}".into()));
        thread.join().unwrap();
    }
}
