import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@stardrop/ui/styles.css';
import './page.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
