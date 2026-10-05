import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function WindowChrome() {
  if (!window.__TAURI_INTERNALS__) return null;

  const appWindow = getCurrentWindow();
  const drag = (event) => {
    if (event.button === 0 && event.detail === 1 && !event.target.closest('button')) appWindow.startDragging();
  };
  const maximize = () => appWindow.toggleMaximize();

  return <div className="window-chrome" onMouseDown={drag} onDoubleClick={(event) => { if (!event.target.closest('button')) maximize(); }}>
    <div className="window-chrome-grip" aria-hidden="true" />
    <div className="window-chrome-controls">
      <button type="button" aria-label="Pencereyi küçült" title="Küçült" onClick={() => appWindow.minimize()}><Minus size={14} /></button>
      <button type="button" aria-label="Pencereyi büyüt veya geri al" title="Büyüt / geri al" onClick={maximize}><Square size={11} /></button>
      <button type="button" className="window-close" aria-label="Pencereyi kapat" title="Kapat" onClick={() => appWindow.close()}><X size={14} /></button>
    </div>
  </div>;
}
