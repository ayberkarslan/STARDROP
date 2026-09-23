import JSZip from 'jszip';

export async function sha256Hex(value) {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function downloadDiagnosticArtifact({ token, repository, artifactId, expected }) {
  let bytes;
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core');
    bytes = await invoke('download_artifact', { repository, artifactId });
  } else {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Artefakt indirilemedi: HTTP ${response.status}`);
    bytes = await response.arrayBuffer();
  }
  return readDiagnosticArtifact(bytes, expected);
}

export async function readDiagnosticArtifact(bytes, expected) {
  const zip = await JSZip.loadAsync(bytes);
  const manifestEntry = zip.file('artifact.json');
  if (!manifestEntry) throw new Error('Firmware manifesti eksik.');
  const manifest = JSON.parse(await manifestEntry.async('string'));
  if (manifest.schemaVersion !== 1 || manifest.testId !== expected.testId || manifest.componentRef !== expected.componentRef
      || manifest.requestId !== expected.requestId || manifest.profileId !== expected.profileId || manifest.targetUid !== expected.targetUid
      || manifest.mcuPart !== expected.mcuPart || manifest.sourcePath !== expected.sourcePath
      || manifest.pins?.scl !== expected.scl || manifest.pins?.sda !== expected.sda) {
    throw new Error('Firmware manifesti seçilen kart, sensör veya pinlerle uyuşmuyor.');
  }
  const binEntries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.endsWith('.bin'));
  if (binEntries.length !== 1) throw new Error('Artefakt tam olarak bir BIN içermeli.');
  const bin = await binEntries[0].async('uint8array');
  const limit = expected.flashSizeKb ? expected.flashSizeKb * 1024 : 512 * 1024;
  if (!bin.length || bin.length !== manifest.size || bin.length > limit) throw new Error('Firmware boyutu hedef flash belleğine uymuyor.');
  const digest = await sha256Hex(new Blob([bin]));
  if (digest !== manifest.sha256) throw new Error('Firmware SHA-256 doğrulaması başarısız.');
  return { firmware: new File([bin], binEntries[0].name, { type: 'application/octet-stream' }), manifest };
}

export function hash32FromSha256(hex) { return parseInt(hex.slice(0, 8), 16) >>> 0; }
