import React, { useState, useEffect } from 'react';
import './App.css';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useWallet } from '@suiet/wallet-kit';
import { useWalletAuth } from './hooks/useWalletAuth';
import { useStaking } from './hooks/useStaking';
import { WalletConnectPanel } from './components/WalletConnectPanel';
import { StatsCards } from './components/StatsCards';
import { NFTList } from './components/NFTList';
import { StakingDashboard } from './components/StakingDashboard';
import { AdminPanel } from './components/AdminPanel';
import { NFTDetail } from './components/NFTDetail';
import { Cube, Stack, Gear, Cpu } from '@phosphor-icons/react';

function HomePage({ authToken, login, isAuthenticating, authError, logout, loadToken }) {
  const wallet = useWallet();
  const { positions, stats, sellAlerts, loading, syncing } = useStaking(authToken);
  const [activeTab, setActiveTab] = useState('nfts');

  useEffect(() => {
    if (wallet.connected) {
      loadToken();
    } else {
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected]);

  return (
    <>
      <WalletConnectPanel
        onLoginSuccess={login}
        isAuthenticating={isAuthenticating}
        authToken={authToken}
      />

      {authError && (
        <div className="cp-alert cp-corner-cuts p-4 mb-6" data-testid="auth-error">
          <p className="hud-label mb-1">AUTH ERROR</p>
          <p className="text-sm">{authError}</p>
        </div>
      )}

      {!authToken ? (
        <div className="cp-panel cp-corner-cuts p-8 sm:p-12 text-center" data-testid="connect-prompt">
          <div className="max-w-2xl mx-auto">
            <p className="hud-label mb-3 flicker">// SYSTEM AWAITING NEURAL HANDSHAKE</p>
            <h2 className="text-3xl sm:text-5xl hud-value glitch mb-4" data-text="GVOXX LORE STAKE">
              GVOXX LORE STAKE
            </h2>
            <p className="text-base text-[#8E78A8] mb-8 max-w-lg mx-auto">
              Hold VOXX NFTs to auto-stake and accumulate Lore Points. No claims, no gas, no transactions —
              your NFTs stay in your wallet at all times.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
              {[
                { title: 'AUTO-STAKE', desc: 'Hold to earn — zero actions required', color: 'text-[#B026FF]' },
                { title: 'TIER REWARDS', desc: '4 tiers • Up to 3× multiplier', color: 'text-[#00FFE5]' },
                { title: 'SELL DETECTION', desc: 'Sell-aware — points preserved', color: 'text-[#FF5577]' },
              ].map((f, i) => (
                <div key={i} className="cp-panel-cyan cp-corner-cuts p-4 text-left">
                  <p className={`hud-value text-xs mb-2 ${f.color}`}>{f.title}</p>
                  <p className="text-xs text-[#8E78A8]">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tab Navigation */}
          <div className="flex gap-1 sm:gap-2 mb-6 border-b border-[#B026FF]/20 overflow-x-auto" data-testid="tab-navigation">
            <button
              onClick={() => setActiveTab('nfts')}
              className={`cp-tab ${activeTab === 'nfts' ? 'cp-tab-active' : ''}`}
              data-testid="tab-nfts"
            >
              <Cube size={14} weight="bold" className="inline mr-2" />
              MY NFTS
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`cp-tab ${activeTab === 'dashboard' ? 'cp-tab-active' : ''}`}
              data-testid="tab-dashboard"
            >
              <Stack size={14} weight="bold" className="inline mr-2" />
              DASHBOARD
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`cp-tab ${activeTab === 'admin' ? 'cp-tab-active' : ''}`}
              data-testid="tab-admin"
            >
              <Gear size={14} weight="bold" className="inline mr-2" />
              ADMIN
            </button>
          </div>

          {/* Stats always visible */}
          <StatsCards stats={stats} />

          {syncing && (
            <div className="mono text-xs text-[#00FFE5] mb-3 flex items-center gap-2 flicker" data-testid="sync-indicator">
              <div className="w-2 h-2 bg-[#00FFE5] rounded-full animate-pulse" />
              SYNCING ON-CHAIN STATE...
            </div>
          )}

          {activeTab === 'nfts' && (
            <div data-testid="nfts-tab-content">
              <div className="mb-4">
                <p className="hud-label">// WALLET SCAN</p>
                <h2 className="text-2xl sm:text-3xl hud-value">YOUR VOXX NFTS</h2>
              </div>
              <NFTList positions={positions} loading={loading} />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div data-testid="dashboard-tab-content">
              <div className="mb-4">
                <p className="hud-label">// STAKING OVERVIEW</p>
                <h2 className="text-2xl sm:text-3xl hud-value">LORE TRACKER</h2>
              </div>
              <StakingDashboard positions={positions} sellAlerts={sellAlerts} />
            </div>
          )}

          {activeTab === 'admin' && (
            <div data-testid="admin-tab-content">
              <AdminPanel authToken={authToken} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function App() {
  const wallet = useWallet();
  const { authToken, login, logout, isAuthenticating, authError, loadToken } = useWalletAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isDetailPage = location.pathname.startsWith('/nft/');

  return (
    <div className="App min-h-screen">
      {/* Navigation Bar */}
      <nav className="nav-bar px-4 sm:px-6 py-4" data-testid="navigation-bar">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            data-testid="logo-home-button"
          >
            <div className="w-10 h-10 cp-corner-cuts bg-gradient-to-br from-[#B026FF] to-[#00FFE5] flex items-center justify-center">
              <Cpu size={22} weight="bold" className="text-white" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="hud-value text-base text-white tracking-wider">GVOXX</p>
              <p className="hud-label text-[10px]">// LORE STAKE</p>
            </div>
          </button>
          <div className="mono text-xs text-[#00FFE5] hidden md:block flicker">
            [ SUI MAINNET • ONLINE ]
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        <Routes>
          <Route path="/" element={
            <HomePage
              authToken={authToken}
              login={login}
              logout={logout}
              loadToken={loadToken}
              isAuthenticating={isAuthenticating}
              authError={authError}
            />
          } />
          <Route path="/nft/:objectId" element={
            authToken ? (
              <NFTDetail authToken={authToken} />
            ) : (
              <div className="cp-panel cp-corner-cuts p-8 text-center">
                <p className="hud-label mb-2">ACCESS DENIED</p>
                <p className="text-sm text-[#8E78A8] mb-4">Sign in to view NFT details.</p>
                <button onClick={() => navigate('/')} className="cp-btn px-4 py-2 text-xs">
                  RETURN TO HOME
                </button>
              </div>
            )
          } />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#B026FF]/20 mt-12 py-6 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="mono text-xs text-[#8E78A8]">
            // VOXX INC. // SOFT-STAKE PROTOCOL v1.0 // POWERED BY SUI //
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
