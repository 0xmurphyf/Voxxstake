import React from 'react';
import { ConnectButton, useWallet } from '@suiet/wallet-kit';
import { Wallet, Power } from '@phosphor-icons/react';

export function WalletConnectPanel({ onLoginSuccess, isAuthenticating }) {
  const wallet = useWallet();

  return (
    <div className="glass-effect rounded-sm p-6 mb-8" data-testid="wallet-connect-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-sm bg-gradient-to-br from-[#3898FF] to-[#00F0FF] flex items-center justify-center">
            <Wallet size={24} weight="bold" className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
              {wallet.connected ? 'WALLET CONNECTED' : 'CONNECT YOUR WALLET'}
            </h2>
            <p className="text-sm text-[#8E9BAE] mt-1">
              {wallet.connected
                ? `${wallet.account?.address?.slice(0, 6)}...${wallet.account?.address?.slice(-4)}`
                : 'Use Sui Wallet, Suiet, or Slush to access your NFTs'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {wallet.connected ? (
            <>
              <button
                onClick={onLoginSuccess}
                disabled={isAuthenticating}
                className="px-6 py-3 rounded-sm bg-gradient-to-r from-[#3898FF] to-[#00F0FF] text-white font-bold tracking-wide uppercase text-sm hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="sign-in-button"
                style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
              >
                {isAuthenticating ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
              <button
                onClick={() => wallet.disconnect()}
                className="px-4 py-3 rounded-sm border border-[#FF3B30] text-[#FF3B30] font-bold uppercase text-sm hover:bg-[#FF3B30] hover:text-white transition-colors"
                data-testid="disconnect-button"
              >
                <Power size={18} weight="bold" />
              </button>
            </>
          ) : (
            <div data-testid="connect-wallet-button">
              <ConnectButton className="!px-6 !py-3 !rounded-sm !bg-gradient-to-r !from-[#3898FF] !to-[#00F0FF] !text-white !font-bold !tracking-wide !uppercase !text-sm hover:!scale-105 !transition-transform" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
