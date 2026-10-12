// Text evidence corroborates part identities, NOT wire geometry or solder state.
export function compareSchematicPages(pages, profile) {
  const has = (text, value) => {
    const escaped = String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped && new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, 'i').test(text);
  };
  const mcuPages = pages.filter(page => has(page.text, profile.mcu.part)).map(page => page.number);
  const components = profile.components.map(component => ({ ref: component.ref, part: component.part,
    pages: pages.filter(page => has(page.text, component.ref) && has(page.text, component.originalPart || component.part)).map(page => page.number) }));
  return { mcuPages, components, scanned: pages.length,
    matched: components.filter(component => component.pages.length).length,
    textAvailable: pages.some(page => page.text.trim()), wiringConfirmed: false };
}

export async function readSchematicPages(file) {
  if (!file || file.size > 16 * 1024 * 1024) throw new Error('Şema PDF en fazla 16 MB olabilir.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: worker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new Error('Şema PDF en fazla 100 sayfa olabilir.');
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.filter(item => typeof item.str === 'string').map(item => item.str).join(' ');
      pages.push({ number: i, text });
      page.cleanup();
    }
    return pages;
  } finally { await task.destroy(); }
}
