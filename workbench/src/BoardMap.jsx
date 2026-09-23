import { useEffect, useMemo, useState } from 'react';
import { Cpu, ImagePlus, Radio } from 'lucide-react';

function useImageUrl(image) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!image) { setUrl(null); return undefined; }
    const next = URL.createObjectURL(image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return url;
}

/** The graphic is deliberately schematic: a NET export has no physical coordinates. */
export default function BoardMap({ profile, components, target, image, selectedRef, onSelect, onImageChange }) {
  const imageUrl = useImageUrl(image);
  const nodes = useMemo(() => components.map((component, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(components.length, 1);
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 39 * Math.sin(angle);
    return { ...component, x, y, side: x < 50 ? 'left' : 'right' };
  }), [components]);
  return <div className="board-map" aria-label="Kart ve algılanan bileşenler">
    <svg className="board-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {nodes.map((node) => <line key={node.ref} x1="50" y1="50" x2={node.x} y2={node.y} />)}
    </svg>
    <div className="board-map-center">
      {imageUrl ? <img src={imageUrl} alt={`${profile?.name || 'Kart'} fotoğrafı`} /> : <div className="board-placeholder"><div className="board-chip"><Cpu size={42} strokeWidth={1.3} /><span>{profile?.mcu?.part || target?.model || 'STM32'}</span></div><span className="board-trace trace-a" /><span className="board-trace trace-b" /></div>}
      <div className="board-caption"><strong>{profile?.name || target?.label || target?.model || 'KART BEKLENİYOR'}</strong><small>{profile?.mcu?.part || target?.model || 'ESP32 üzerinden hedef ara'}</small></div>
    </div>
    {nodes.map((node) => <button key={node.ref} type="button" className={`sensor-node ${selectedRef === node.ref ? 'selected' : ''}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => onSelect(node.ref)} aria-label={`${node.part}, ${node.ref} ayrıntılarını aç`}>
      <span className="sensor-node-dot" /><span className="sensor-node-text"><strong>{node.part}</strong><small>{node.ref} · {node.protocol || 'PROTOKOL ?'}</small></span>
    </button>)}
    {!components.length && <div className="board-map-hint"><Radio size={15} /> .NET dosyası yüklenince algılanan sensörler burada görünür.</div>}
    {onImageChange && <label className="board-image-action"><ImagePlus size={14} />{image ? 'FOTOĞRAFI DEĞİŞTİR' : 'KART FOTOĞRAFI EKLE'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onImageChange(event.target.files?.[0] || null)} /></label>}
  </div>;
}
