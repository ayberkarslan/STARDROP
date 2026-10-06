import { useCallback, useEffect, useRef, useState } from 'react';
import { createTargetRegistry, targetRegistryStorage, targetUid } from './lib/targetRegistry.js';

export default function useTargetRegistry(rawTarget, setNotice) {
  const [records, setRecords] = useState({});
  const [ready, setReady] = useState(false);
  const registry = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const store = createTargetRegistry({ ...targetRegistryStorage(), onChange: next => { if (!cancelled) setRecords(next); } });
    registry.current = store;
    store.ready.then(() => { if (!cancelled) setReady(true); })
      .catch(error => { if (!cancelled) setNotice(`Yerel kart kayıtları okunamadı: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [setNotice]);

  useEffect(() => {
    const uid = targetUid(rawTarget?.uid);
    if (!ready || !rawTarget?.connected || !uid || records[uid]?.label || !rawTarget.label?.trim()) return;
    // Migrate existing ESP names without allowing firmware to overwrite a local rename.
    registry.current.save(uid, rawTarget.label, rawTarget.model || '', false)
      .catch(error => setNotice(`Kart adı yerel kayda aktarılamadı: ${String(error)}`));
  }, [ready, rawTarget, records, setNotice]);

  const saveTargetName = useCallback(async (target, label) => {
    if (!target?.connected || !registry.current) throw new Error('Önce UID okunmuş bir STM32 bağla.');
    return registry.current.save(target.uid, label, target.model || '');
  }, []);
  const saveTargetAnalysis = useCallback(async (target, analysis) => {
    if (!target?.connected || !registry.current) throw new Error('Önce UID okunmuş bir STM32 bağla.');
    return registry.current.saveAnalysis(target.uid, target.model || '', analysis);
  }, []);
  return { records, saveTargetName, saveTargetAnalysis };
}
