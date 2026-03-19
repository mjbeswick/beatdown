import React from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';
import App from './App';
import { Electroview } from 'electrobun/view';
import { rpc } from './rpc';

// Initialize Electroview to connect the RPC to bun
new Electroview({ rpc });

const root = document.getElementById('root')!;
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
