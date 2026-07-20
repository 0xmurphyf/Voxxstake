import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { WalletProvider, AllDefaultWallets } from '@suiet/wallet-kit';
import { registerSlushWallet } from '@mysten/slush-wallet';
import '@suiet/wallet-kit/style.css';

// Register the Slush web wallet (zkLogin enabled)
registerSlushWallet('VOXX Terminal');

// Whitelist: only show Slush, Phantom, Binance, and OKX
const ALLOWED_NAMES = ['Slush — A Sui wallet', 'Phantom', 'OKX Wallet', 'Binance Web3 Wallet'];

const presetWallets = AllDefaultWallets.filter((w) =>
  ALLOWED_NAMES.includes(w.name)
);

// Binance Web3 Wallet is not in the default preset list — add it manually so it appears in the picker
const binanceWallet = {
  name: 'Binance Web3 Wallet',
  iconUrl:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjI0IiBmaWxsPSIjRjBCOTBCIi8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTQ4LjUgNTYuNUw2NCA0MWwxNS41IDE1LjUgOS04Ljk5TDY0IDIzIDM5LjUgNDcuNXptLTE2IDcuNUw0MS41IDU1bDkgOS05IDl6bTE2IDE2TDY0IDk2bDE1LjUtMTUuNSA5IDkuMDFMNjQgMTE0bC0yNC41LTI0LjV6TTk1IDY0bDktOSA5IDktOSA5em0tMjMuMS0uMDFMNjQgNTYuMSA1NS4xIDY1bDguOSA4LjkgOC45LTguOXoiLz48L3N2Zz4=',
  downloadUrl: {
    browserExtension:
      'https://chromewebstore.google.com/detail/binance-web3-wallet/eolomadlcojnpebkfagjmhfnlncgcfcj',
  },
};

const wallets = [...presetWallets, binanceWallet];

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <WalletProvider defaultWallets={wallets} autoConnect={false}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </WalletProvider>
  </React.StrictMode>
);
