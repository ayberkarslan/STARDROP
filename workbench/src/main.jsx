import React from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App.jsx';
import WindowChrome from './WindowChrome.jsx';
import { installDesktopInput } from './lib/desktopInput.js';
import '@stardrop/ui/styles.css';
import './styles.css';
import './esp-theme.css';
import './desktop-shell.css';
import './premium-black.css';
import './notification-center.css';
import './workspace-tabs.css';
import './popup.css';
import './workspace-interactions.css';
import './readable-type.css';
import './desktop-viewport.css';
import './library-refined.css';
import './devices.css';
import './flash-station.css';
import './welcome-stars.css';
import './live-monitor.css';
import './settings-hub.css';
import './global-watch.css';
import './board-profiles.css';
import './selection-markers.css';
import './test-home.css';
import './ui/primitives.css';

const removeDesktopInput = installDesktopInput(window);
if (import.meta.hot) import.meta.hot.dispose(removeDesktopInput);

createRoot(document.getElementById('root')).render(<React.StrictMode><WindowChrome /><App /></React.StrictMode>);

if (window.__TAURI_INTERNALS__) {
  const started = performance.now();
  void document.fonts.load('16px Michroma').catch(() => {}).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => { void invoke('finish_startup').catch(() => {}); }, Math.max(0, 1200 - (performance.now() - started)));
    }));
  });
}
