import { useState } from 'react';
import { Github } from 'lucide-react';

export default function DeviceLogin({ challenge, onOpen, onCancel }) {
  const [feedback, setFeedback] = useState('');
  if (!challenge) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(challenge.userCode);
      setFeedback('Kod kopyalandı.');
    } catch {
      setFeedback('Kopyalanamadı; kodu seçip elle kopyalayabilirsin.');
    }
  };

  const openGitHub = async () => {
    try { await onOpen(); }
    catch (error) { setFeedback(`GitHub açılamadı: ${String(error)}`); }
  };

  return <div className="device-login-overlay" role="presentation">
    <section className="device-login-card" role="dialog" aria-modal="true" aria-labelledby="device-login-title">
      <span className="eyebrow">GITHUB HESABI</span>
      <Github size={25} aria-hidden="true" />
      <h2 id="device-login-title">Girişi doğrula</h2>
      <p>GitHub’ın resmi doğrulama sayfasında bu kodu gir. STARDROP onayı burada otomatik algılayacak.</p>
      <code className="device-login-code">{challenge.userCode}</code>
      <div className="device-login-actions">
        <button className="welcome-primary" onClick={openGitHub}>GITHUB SAYFASINI AÇ <span aria-hidden="true">↗</span></button>
        <button className="welcome-guest" onClick={copyCode}>KODU KOPYALA</button>
      </div>
      <small>Adres: github.com/login/device · Kod yaklaşık {Math.ceil(challenge.expiresIn / 60)} dakika geçerli.</small>
      <span className="device-login-feedback" role="status">{feedback || 'GitHub onayı bekleniyor…'}</span>
      <button className="device-login-cancel" onClick={onCancel}>Vazgeç</button>
    </section>
  </div>;
}
