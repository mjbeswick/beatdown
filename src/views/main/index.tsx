import React from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';
import App from './App';
import { Electroview } from 'electrobun/view';
import { rpc } from './rpc';
import { streamPortReceived } from './stores/player';

// Initialize Electroview to connect the RPC to bun
new Electroview({ rpc });

// Fetch stream port via request (reliable) so it's ready before any user click.
// The one-shot setTimeout message in bun can be lost if the webview loads slowly.
rpc.proxy.request['stream:getPort'](undefined as any)
  .then((port) => streamPortReceived(port))
  .catch(() => {});

const root = document.getElementById('root')!;
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
