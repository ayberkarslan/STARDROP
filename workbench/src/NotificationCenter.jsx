import { useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';

export function useNoticeHistory(notice) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    if (!notice) return;
    setEntries((current) => current[0]?.message === notice ? current : [
      { message: notice, time: new Date().toLocaleTimeString('tr-TR') }, ...current,
    ].slice(0, 50));
  }, [notice]);
  return entries;
}

export default function NotificationCenter({ esp, notice, entries, onRetry, disabled }) {
  const wifi = esp.wifi;
  const online = esp.status === 'online';
  const label = online ? 'ESP32 bağlı' : esp.status === 'searching' ? 'ESP32 aranıyor…' : 'ESP32 çevrimdışı';
  const network = online ? `${wifi?.connected ? wifi.ssid : wifi?.apSsid || 'ESP32 AP'} · ${wifi?.ip || esp.base}` : '';
  const signal = online && wifi?.connected && Number.isFinite(wifi.rssi) ? `${wifi.rssi} dBm` : '';

  return <section className="notification-center" aria-label="Bağlantı ve bildirim merkezi">
    <button className={`connection-status ${esp.status}`} onClick={onRetry} disabled={disabled} title={[network, signal, 'ESP32’yi yeniden ara'].filter(Boolean).join(' · ')}>
      <span className="esp-status-dot" />
      <span className="connection-copy"><strong>{label}</strong>{network && <small>{network}</small>}{signal && <small>{signal}</small>}</span>
      <RefreshCw size={13} />
    </button>
    <details className="notification-details">
      <summary title="Bildirim geçmişini aç"><Bell size={14} /><span>Bildirimler</span><small>{entries.length}</small></summary>
      <div className="notification-history" role="log" aria-label="Bildirim geçmişi">
        <h3>Bildirimler</h3>
        {entries.length ? entries.map((entry, index) => <p key={`${entry.time}-${index}`}><time>{entry.time}</time><span>{entry.message}</span></p>) : <p>Henüz bildirim yok.</p>}
      </div>
    </details>
    <p className="notification-latest" role="status" aria-live="polite">{notice}</p>
  </section>;
}
