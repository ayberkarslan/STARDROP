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

export async function espWatchRead(base, body, udpAvailable = false) {
  if (!native() || !udpAvailable) return espJson(base, '/api/watch/read', { method: 'POST', body, timeoutMs: 40000 });
  const { invoke } = await import('@tauri-apps/api/core');
  return JSON.parse(await invoke('esp_watch_udp_read', { base, body: JSON.stringify(body) }));
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

export async function espStream(base, path, onEvent, timeoutMs = 180000, { method = 'GET', body } = {}) {
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
      const lastFrame = await invoke('esp_stream', { base, path, streamId, method, body: body === undefined ? null : JSON.stringify(body) });
      if (eventError) throw eventError;
      if (!final?.done) final = receive(lastFrame);
      if (!final?.done) throw new Error('ESP32 akışı tamamlanmadı.');
      return final;
    } finally { unlisten(); }
  }
  if (method === 'POST') {
    const response = await fetch(`${base}${path}`, {
      method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
    });
    if (!response.ok) throw new Error(`ESP32 akışı HTTP ${response.status}`);
    if (!response.body) throw new Error('ESP32 ilerleme akışı yok.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) throw new Error('ESP32 akışı tamamlanmadan kapandı; son durum bilinmiyor.');
        pending += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        let end;
        while ((end = pending.indexOf('\n\n')) !== -1) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const event = receive(line.slice(5).trim());
            if (event.done) return event;
          }
        }
        if (pending.length > 16384) throw new Error('ESP32 olay çerçevesi fazla büyük.');
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
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
