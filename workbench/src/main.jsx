import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import WindowChrome from './WindowChrome.jsx';
import './styles.css';
import './esp-theme.css';
import './desktop-shell.css';
import './premium-black.css';
import './notification-center.css';
import './workspace-tabs.css';
import './popup.css';
import './workspace-interactions.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><WindowChrome /><App /></React.StrictMode>);
