import { addAuditEvent } from './boardProfile.js';

function cleanEndpoint(endpoint) {
  return String(endpoint || '').replace(/\/$/, '');
}

function parseJson(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

export function validateAiReview(review, connectionCount) {
  if (!review || typeof review.summary !== 'string' || !Array.isArray(review.suggestions)) {
    throw new Error('AI yanıtı beklenen inceleme şemasında değil.');
  }
  const suggestions = review.suggestions.map((item, index) => {
    if (!Number.isInteger(item.connectionIndex) || item.connectionIndex < 0 || item.connectionIndex >= connectionCount) {
      throw new Error(`AI önerisi ${index + 1} geçersiz bağlantıya işaret ediyor.`);
    }
    if (!item.reason || (!item.mcuPin && !item.peripheral)) throw new Error(`AI önerisi ${index + 1} eksik.`);
    return {
      id: item.id || `ai-${index + 1}`,
      connectionIndex: item.connectionIndex,
      mcuPin: item.mcuPin?.toUpperCase(),
      peripheral: item.peripheral?.toUpperCase(),
      confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)),
      reason: String(item.reason),
      evidence: String(item.evidence || 'AI incelemesi'),
    };
  });
  return { summary: review.summary, overallConfidence: Number(review.overallConfidence) || null, suggestions };
}

export async function requestAiReview({ endpoint, apiKey, model, profile, netlist, schematicPdf }) {
  if (!endpoint || !apiKey || !model) throw new Error('AI endpoint, model ve API anahtarı zorunludur.');
  const instructions = [
    'Sen STARDROP kart inceleme denetçisisin.',
    'Sadece kanıtı olan bağlantı/pin/peripheral düzeltmelerini öner.',
    'Bir profile doğrudan müdahale etme; yalnız JSON döndür.',
    'Şema: {"summary":"...","overallConfidence":0-100,"suggestions":[{"connectionIndex":0,"mcuPin":"PB6","peripheral":"I2C1","confidence":0-100,"reason":"...","evidence":"NET/PDF kanıtı"}]}',
  ].join('\n');
  const content = [{ type: 'input_text', text: `${instructions}\n\nBoardProfile:\n${JSON.stringify(profile)}\n\nNET kaynak özeti:\n${String(netlist || '').slice(0, 120000)}` }];
  if (schematicPdf) {
    const bytes = await schematicPdf.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    content.push({ type: 'input_file', filename: 'schematic.pdf', file_data: `data:application/pdf;base64,${base64}` });
  }
  const response = await fetch(`${cleanEndpoint(endpoint)}/responses`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: [{ role: 'user', content }], text: { format: { type: 'json_object' } } }),
  });
  if (!response.ok) throw new Error(`AI isteği başarısız: HTTP ${response.status}`);
  const body = await response.json();
  const output = body.output_text || body.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  return validateAiReview(parseJson(output), profile.connections.length);
}

export function applyAiSuggestions(profile, review, acceptedIds, actor = 'local') {
  const accepted = new Set(acceptedIds);
  const connections = profile.connections.map((connection, index) => {
    const suggestion = review.suggestions.find((item) => item.connectionIndex === index && accepted.has(item.id));
    return suggestion ? { ...connection, mcuPin: suggestion.mcuPin || connection.mcuPin, peripheral: suggestion.peripheral || connection.peripheral, source: 'AI', approved: false, aiEvidence: suggestion.evidence } : connection;
  });
  const updated = { ...profile, connections, reviews: [...(profile.reviews || []), { at: new Date().toISOString(), summary: review.summary, acceptedIds: [...accepted] }] };
  return addAuditEvent(updated, 'AI_SUGGESTIONS_APPLIED', { acceptedIds: [...accepted] }, actor);
}
