import { GripVertical } from 'lucide-react';

export default function DragPreview({ preview }) {
  if (!preview) return null;
  return <div className={'workspace-drag-preview' + (preview.allowed ? '' : ' unavailable')}
    style={{ left: Math.min(preview.x + 16, window.innerWidth - 240), top: Math.min(preview.y + 16, window.innerHeight - 70) }} aria-hidden="true">
    <GripVertical size={15}/><span>{preview.label}</span>{preview.overId && !preview.allowed && <small>İşlem sürüyor</small>}
  </div>;
}
