import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, RefreshCw } from 'lucide-react';
import { usePopupDismiss } from './Popup.jsx';

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

export default function NotificationCenter({ esp, notice, entries, onRetry, disabled, recoveryCount = 0, onRecover }) {
  const [open, setOpen] = useState(false);
  const popup = useRef(null);
  const anchor = useRef(null);
  const history = useRef(null);
  const [position, setPosition] = useState({});
  usePopupDismiss(popup, open, () => setOpen(false), history);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = anchor.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(380, window.innerWidth - 24);
      const maxHeight = Math.min(360, Math.max(60, window.innerHeight - 54));
      setPosition({ width, maxHeight,
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
        bottom: Math.max(12, Math.min(window.innerHeight - bounds.top + 10, window.innerHeight - maxHeight - 42)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  const wifi = esp.wifi;
  const online = esp.status === 'online';
  const label = online ? 'ESP32 bağlı' : esp.status === 'searching' ? 'ESP32 aranıyor…' : 'ESP32 çevrimdışı';
  const network = online ? `${wifi?.connected ? wifi.ssid : wifi?.apSsid || 'ESP32 AP'} · ${wifi?.ip || esp.base}` : '';
  const signal = online && wifi?.connected && Number.isFinite(wifi.rssi) ? `${wifi.rssi} dBm` : '';

  return <section ref={anchor} className="notification-center" aria-label="Bağlantı ve bildirim merkezi">
    <button className={`connection-status ${esp.status}`} onClick={onRetry} disabled={disabled} title={[network, signal, 'ESP32’yi yeniden ara'].filter(Boolean).join(' · ')}>
      <span className="esp-status-dot" />
      <span className="connection-copy"><strong>{label}</strong>{network && <small>{network}</small>}{signal && <small>{signal}</small>}</span>
      <RefreshCw size={13} />
    </button>
    <details className="notification-details" ref={popup} open={open}>
      <summary title="Bildirim geçmişini aç" onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }}><Bell size={14} /><span>Bildirimler</span><small>{entries.length}</small></summary>
      {open && createPortal(<div ref={history} className="notification-history notification-history-floating" style={position} role="log" aria-label="Bildirim geçmişi">
        <h3>Bildirimler</h3>
        {entries.length ? entries.map((entry, index) => <p key={`${entry.time}-${index}`}><time>{entry.time}</time><span>{entry.message}</span></p>) : <p>Henüz bildirim yok.</p>}
      </div>, document.body)}
    </details>
    <p className="notification-latest" role="status" aria-live="polite">{notice}</p>
    {recoveryCount > 0 && <button className="notification-recover" onClick={onRecover}>Son taslağı geri aç ({recoveryCount})</button>}
  </section>;
}
