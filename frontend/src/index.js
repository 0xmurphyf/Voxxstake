import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { WalletProvider } from '@suiet/wallet-kit';
import { registerSlushWallet } from '@mysten/slush-wallet';
import '@suiet/wallet-kit/style.css';

registerSlushWallet('GVOXX Lore Stake');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <WalletProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </WalletProvider>
  </React.StrictMode>
);
