import JSZip from 'jszip';
import { PROFILE_SCHEMA_VERSION, validateBoardProfile } from './boardProfile.js';

export const STARDROP_FORMAT_VERSION = 1;

async function sha256(value) {
  const bytes = value instanceof Blob
    ? await value.arrayBuffer()
    : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function addAttachment(zip, manifest, path, value) {
  if (!value) return;
  const content = value instanceof Blob ? value : String(value);
  zip.file(path, content);
  manifest.attachments.push({ path, sha256: await sha256(content) });
}

/** Creates a self-contained .stardrop ZIP. Secrets intentionally have no slot. */
export async function exportStardropProject({ profile, netlist, bom, schematicPdf, boardImage, artifacts = [], testHistory = [] }) {
  const validation = validateBoardProfile(profile);
  if (!validation.valid) throw new Error(`Proje export edilemedi: ${validation.errors.join(' ')}`);

  const zip = new JSZip();
  const manifest = {
    format: 'STARDROP_PROJECT',
    formatVersion: STARDROP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: profile.id,
    attachments: [],
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('profile.json', JSON.stringify(profile, null, 2));
  zip.file('history/test-runs.json', JSON.stringify(testHistory, null, 2));
  await addAttachment(zip, manifest, 'sources/board.NET', netlist);
  await addAttachment(zip, manifest, 'sources/bom.csv', bom);
  await addAttachment(zip, manifest, 'sources/schematic.pdf', schematicPdf);
  if (boardImage) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(boardImage.type)) throw new Error('Kart görseli PNG, JPEG veya WebP olmalı.');
    if (boardImage.size > 8 * 1024 * 1024) throw new Error('Kart görseli en fazla 8 MB olabilir.');
    await addAttachment(zip, manifest, `sources/board-image.${boardImage.type === 'image/png' ? 'png' : boardImage.type === 'image/webp' ? 'webp' : 'jpg'}`, boardImage);
  }
  for (const artifact of artifacts) {
    if (!artifact?.name || !artifact?.data) continue;
    await addAttachment(zip, manifest, `artifacts/${artifact.name}`, artifact.data);
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function importStardropProject(file) {
  const zip = await JSZip.loadAsync(file);
  const readJson = async (path) => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`${path} bulunamadı.`);
    return JSON.parse(await entry.async('string'));
  };
  const manifest = await readJson('manifest.json');
  if (manifest.format !== 'STARDROP_PROJECT' || manifest.formatVersion !== STARDROP_FORMAT_VERSION) {
    throw new Error('Desteklenmeyen STARDROP proje formatı.');
  }
  const profile = await readJson('profile.json');
  const validation = validateBoardProfile(profile);
  if (!validation.valid) throw new Error(`Proje profili geçersiz: ${validation.errors.join(' ')}`);

  const sources = {};
  const artifacts = [];
  for (const attachment of manifest.attachments || []) {
    const entry = zip.file(attachment.path);
    if (!entry) throw new Error(`Paket eki eksik: ${attachment.path}`);
    const blob = await entry.async('blob');
    if ((await sha256(blob)) !== attachment.sha256) throw new Error(`Paket bütünlüğü bozuk: ${attachment.path}`);
    if (attachment.path.startsWith('sources/')) sources[attachment.path] = blob;
    if (attachment.path.startsWith('artifacts/')) artifacts.push({ name: attachment.path.slice('artifacts/'.length), data: blob });
  }
  const historyEntry = zip.file('history/test-runs.json');
  const testHistory = historyEntry ? JSON.parse(await historyEntry.async('string')) : [];
  return { manifest, profile, sources, artifacts, testHistory, validation };
}
