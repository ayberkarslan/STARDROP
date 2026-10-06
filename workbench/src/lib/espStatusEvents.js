export async function watchEspStatus(base, onStatus, onError) {
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
  const watchId = crypto.randomUUID();
  let stopped = false;
  const unlisten = await listen('stardrop-device-status', ({ payload }) => {
    if (!stopped && payload.watchId === watchId) onStatus(payload.data);
  });
  invoke('esp_watch', { base, watchId }).catch(error => { if (!stopped) onError?.(error); });
  return () => {
    stopped = true; unlisten();
    invoke('esp_watch_stop', { watchId }).catch(() => {});
  };
}
