const native = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

export async function espJson(base, path, { method = 'GET', body, timeoutMs = 10000 } = {}) {
  let result;
  if (native()) {
    const { invoke } = await import('@tauri-apps/api/core');
    result = JSON.parse(await invoke('esp_http', { base, path, method, body: body === undefined ? null : JSON.stringify(body), timeoutMs }));
  } else {
    const response = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    result = await response.json();
    if (!response.ok) throw new Error(result.message || result.msg || `HTTP ${response.status}`);
  }
  if (result.status === 'error') throw new Error(result.message || result.msg || 'ESP32 isteği başarısız.');
  return result;
}

export async function espUpload(base, file) {
  if (native()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('esp_upload', { base, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
    return;
  }
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await fetch(`${base}/upload`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Firmware ESP32 belleğine alınamadı (HTTP ${response.status}).`);
  return;
}

export async function espStream(base, path, onEvent, timeoutMs = 180000) {
  let lastMessage = '';
  const receive = (data) => {
    const event = JSON.parse(data);
    if (event.msg) lastMessage = event.msg;
    onEvent?.(event);
    if (event.error) throw new Error(lastMessage || 'ESP32 akışı hata verdi.');
    return event;
  };
  if (native()) {
    const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
    const streamId = crypto.randomUUID();
    let eventError = null;
    let final = null;
    const unlisten = await listen('stardrop-esp-stream', ({ payload }) => {
      if (payload.streamId !== streamId) return;
      try { final = receive(payload.data); } catch (error) { eventError = error; }
    });
    try {
      await invoke('esp_stream', { base, path, streamId });
      if (eventError) throw eventError;
      if (!final?.done) throw new Error('ESP32 akışı tamamlanmadı.');
      return final;
    } finally { unlisten(); }
  }
  return new Promise((resolve, reject) => {
    const stream = new EventSource(`${base}${path}`);
    const timer = window.setTimeout(() => finish(new Error('ESP32 akışı zaman aşımına uğradı.')), timeoutMs);
    const finish = (error, event) => { window.clearTimeout(timer); stream.close(); error ? reject(error) : resolve(event); };
    stream.onmessage = ({ data }) => {
      try {
        const event = receive(data);
        if (event.done) finish(null, event);
      } catch (error) { finish(error); }
    };
    stream.onerror = () => finish(new Error('ESP32 akışı kesildi.'));
  });
}
