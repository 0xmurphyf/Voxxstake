import React from 'react';
import { ConnectButton, useWallet } from '@suiet/wallet-kit';
import { Wallet, Power, Lightning, SignOut } from '@phosphor-icons/react';

export function WalletConnectPanel({ onLoginSuccess, onLogout, isAuthenticating, authToken }) {
  const wallet = useWallet();

  const handleDisconnect = () => {
    if (onLogout) onLogout();
    wallet.disconnect();
  };

  return (
    <div className="cp-panel cp-corner-cuts p-5 sm:p-6 mb-8 cp-glow-purple" data-testid="wallet-connect-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#B026FF] to-[#00FFE5] flex items-center justify-center cp-corner-cuts">
            <Wallet size={24} weight="bold" className="text-white" />
          </div>
          <div>
            <p className="hud-label mb-1">
              {wallet.connected ? '> NEURAL LINK ESTABLISHED' : '> AWAITING NEURAL LINK'}
            </p>
            <h2 className="text-lg sm:text-xl hud-value glitch" data-text={wallet.connected ? 'WALLET CONNECTED' : 'CONNECT WALLET'}>
              {wallet.connected ? 'WALLET CONNECTED' : 'CONNECT WALLET'}
            </h2>
            {!wallet.connected && (
              <p className="mono text-xs text-[#00FFE5] mt-1">
                Slush · Phantom · Binance · OKX
              </p>
            )}
            {wallet.connected && (
              <p className="text-xs mono text-[#00FFE5] mt-1">
                {wallet.account?.address?.slice(0, 8)}...{wallet.account?.address?.slice(-6)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          {wallet.connected ? (
            <>
              {!authToken && (
                <button
                  onClick={onLoginSuccess}
                  disabled={isAuthenticating}
                  className="cp-btn px-4 sm:px-6 py-3 text-xs sm:text-sm flex items-center gap-2"
                  data-testid="sign-in-button"
                >
                  {isAuthenticating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      SIGNING IN
                    </>
                  ) : (
                    <>
                      <Lightning size={16} weight="fill" />
                      SIGN IN
                    </>
                  )}
                </button>
              )}
              {authToken && (
                <button
                  onClick={handleDisconnect}
                  className="cp-btn-ghost px-3 sm:px-4 py-3 text-xs sm:text-sm flex items-center gap-2"
                  data-testid="logout-button"
                >
                  <SignOut size={16} weight="bold" />
                  LOGOUT
                </button>
              )}
              {!authToken && (
                <button
                  onClick={() => wallet.disconnect()}
                  className="cp-btn-ghost px-3 sm:px-4 py-3 text-xs sm:text-sm flex items-center gap-2"
                  data-testid="disconnect-button"
                >
                  <Power size={16} weight="bold" />
                </button>
              )}
            </>
          ) : (
            <div data-testid="connect-wallet-button">
              <ConnectButton className="!cp-btn">
                <span className="cp-btn px-6 py-3 text-sm flex items-center gap-2">
                  <Lightning size={16} weight="fill" />
                  CONNECT
                </span>
              </ConnectButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
