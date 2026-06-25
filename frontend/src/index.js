import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { WalletProvider } from '@suiet/wallet-kit';
import { registerSlushWallet } from '@mysten/slush-wallet';
import '@suiet/wallet-kit/style.css';

// Register Slush web wallet for browser-based access
registerSlushWallet('VOXX Staking');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </React.StrictMode>
);
