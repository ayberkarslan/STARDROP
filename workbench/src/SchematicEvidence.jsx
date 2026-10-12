import { useEffect, useState } from 'react';
import { compareSchematicPages, readSchematicPages } from './lib/schematicEvidence.js';

export default function SchematicEvidence({ file, profile, setProfile, onFile }) {
  const [status, setStatus] = useState('');
  const identity = profile?.components.map(component => `${component.ref}:${component.part}`).join('|');
  useEffect(() => {
    let cancelled = false;
    if (!file || !profile) {
      setStatus('');
      if (!file && profile?.source?.schematicEvidence) setProfile(current => ({ ...current,
        source: { ...current.source, schematicEvidence: null, schematicName: null } }));
      return;
    }
    const id = profile.id;
    setProfile(current => current?.id !== id ? current : { ...current, source: { ...current.source, schematicEvidence: null, schematicName: file.name } });
    setStatus('Şema yerelde inceleniyor…');
    readSchematicPages(file).then(pages => {
      if (cancelled) return;
      const review = compareSchematicPages(pages, profile);
      setProfile(current => current?.id !== id ? current : { ...current, source: { ...current.source,
        schematicName: file.name, schematicEvidence: review } });
      setStatus(!review.textAvailable ? 'PDF görüntü tabanlı; otomatik metin eşleştirmesi yapılamadı.'
        : !review.mcuPages.length ? 'Şemadaki MCU eşleştirilemedi; dosyaları kontrol et.'
        : `Şema: ${review.matched}/${review.components.length} bileşen eşleşti. Pinler NET’ten; fiziksel köprüler onay bekler.`);
    }).catch(error => { if (!cancelled) setStatus(`Şema okunamadı: ${error.message || String(error)}`); });
    return () => { cancelled = true; };
  }, [file, profile?.id, identity]);
  return <div className="wizard-schematic-evidence">
    <label className="wizard-attachment">{file ? `Şema: ${file.name}` : 'Şema PDF ekle (isteğe bağlı)'}
      <input aria-label="Kart şeması PDF" type="file" accept="application/pdf,.pdf" onChange={event => onFile(event.target.files?.[0] || null)}/>
    </label>
    {status && <p className="wizard-hint" role="status">{status}</p>}
  </div>;
}
