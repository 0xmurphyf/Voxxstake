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
import {
  Cube, Stack, Gear, Cpu,
  Wallet, ShieldCheck, Power, Database, Gift,
  Warning, CaretDown
} from '@phosphor-icons/react';

/* ============================================================
   LANDING PAGE — Terminal-style layout matching design reference
   ============================================================ */
function HomePage({ authToken, login, isAuthenticating, authError, logout, loadToken }) {
  const wallet = useWallet();
  const { positions, stats, sellAlerts, loading, syncing } = useStaking(authToken);
  const [activeTab, setActiveTab] = useState('nfts');

  // On mount: restore token immediately from localStorage.
  // When wallet connects later, loadToken ensures consistency.
  useEffect(() => {
    loadToken();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (wallet.connected) loadToken();
    // IMPORTANT: do NOT call logout() when wallet disconnects.
    // The token persists across page closes — only explicit logout clears it.
  }, [wallet.connected]); // eslint-disable-line

  /* ---- Derived data for status table ---- */
  const activeCount = stats?.total_active || positions?.filter(p => p.status === 'active').length || 0;
  const totalNfts = stats?.nft_count || positions?.filter(p => p.status === 'active').length || 0;
  const totalPoints = (stats?.total_lore_points || 0).toFixed(0);
  const multiplier = stats?.holding_multiplier || 1.0;
  const pointsPerHour = (totalNfts * multiplier).toFixed(1);
  // Find max duration among active stakes for "staking duration"
  const maxDuration = positions?.reduce((max, p) => {
    if (p.status === 'active' && (p.duration_days || 0) > max) return p.duration_days;
    return max;
  }, 0) || 0;

  return (
    <div className="app-container">
      {/* ===== HEADER ===== */}
      <header className="header-bar">
        <div className="flex-1">
          <p className="header-file-id">FILE_05_NFT_STAKING</p>
          <div className="header-title-group">
            <h1>NFT SOFT STAKING</h1>
            <p className="header-subtitle">
              Stake your Genesis NFT. Keep it in your wallet. Earn continuously.
            </p>
          </div>
        </div>
        {/* V Logo */}
        <div className="header-logo">
          <Cpu size={32} weight="bold" />
        </div>
      </header>

      {/* Auth Error */}
      {authError && (
        <div className="alert-banner mb-5" data-testid="auth-error">
          <strong>AUTH ERROR:</strong> {authError}
        </div>
      )}

      {/* ===== MAIN GRID: Left + Right ===== */}
      {!authToken ? (
        /* ---- Unauthenticated: Show landing page with connect ---- */
        <>
          <div className="main-grid" style={{ marginBottom: 20 }}>
            {/* LEFT: Protocol Overview */}
            <section className="term-panel p-6 sm:p-8">
              <h2 className="term-header">PROTOCOL OVERVIEW</h2>

              <span className="term-tag">PROTOCOL</span>

              <h3 className="term-title">VOXX PASSIVE YIELD ENGINE</h3>

              <div className="term-text space-y-4">
                <p>VOXX Soft Staking allows <strong>Genesis NFT</strong> holders to earn daily rewards without transferring custody.</p>
                <p><strong>NFTs remain safely inside your wallet</strong> while reward eligibility is tracked on-chain through staking snapshots.</p>
              </div>

              {/* Connect wallet inline */}
              <div className="wallet-inline">
                <WalletConnectPanel
                  onLoginSuccess={login}
                  onLogout={logout}
                  isAuthenticating={isAuthenticating}
                  authToken={authToken}
                />
              </div>
            </section>

            {/* RIGHT: Staking Flow */}
            <section className="term-panel p-6 sm:p-8">
              <h2 className="term-header">STAKING FLOW</h2>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Wallet size={22} weight="light" /></div>
                <div className="flow-content">
                  <div className="flow-title">Connect Wallet</div>
                  <div className="flow-desc">Connect your wallet to VOXX Terminal.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><ShieldCheck size={22} /></div>
                <div className="flow-content">
                  <div className="flow-title">Verify NFT</div>
                  <div className="flow-desc">System verifies your Genesis NFT ownership.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Power size={22} weight="fill" /></div>
                <div className="flow-content">
                  <div className="flow-title">Activate Staking</div>
                  <div className="flow-desc">Activate soft staking. No NFT transfer needed.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Wallet size={22} weight="duotone" /></div>
                <div className="flow-content">
                  <div className="flow-title">NFT Remains In Wallet</div>
                  <div className="flow-desc">Your NFT stays safely in your wallet.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Database size={22} /></div>
                <div className="flow-content">
                  <div className="flow-title">Accrue Daily Rewards</div>
                  <div className="flow-desc">Rewards accrue automatically every day.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                </div>
                <div className="flow-icon"><Gift size={22} weight="fill" /></div>
                <div className="flow-content">
                  <div className="flow-title">Claim Anytime</div>
                  <div className="flow-desc">Claim rewards anytime you choose.</div>
                </div>
              </div>
            </section>
          </div>

          {/* MIDDLE: Live Status (placeholder when not connected) */}
          <section className="term-panel p-6 sm:p-8" style={{ marginBottom: 20 }}>
            <h2 className="term-header">LIVE STAKING STATUS</h2>

            <table className="status-table">
              <tbody>
                <tr>
                  <td style={{ width: '33%' }}><span className="status-label">Status</span></td>
                  <td><span className="status-value status-value-green"><span className="status-dot-active"><span className="status-dot" />ACTIVE</span></span></td>
                </tr>
                <tr>
                  <td><span className="status-label">NFTs Held</span></td>
                  <td><span className="status-value text-dim">{totalNfts || '—'}</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Multiplier</span></td>
                  <td><span className="status-value text-dim">{multiplier.toFixed(1)}x</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Reward Rate</span></td>
                  <td><span className="status-value text-dim">{pointsPerHour} PTS / HR</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Total Points</span></td>
                  <td><span className="status-value text-dim">{totalPoints || '—'} PTS</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Staking Duration</span></td>
                  <td><span className="status-value text-dim">{maxDuration > 0 ? `${maxDuration.toFixed(1)} days` : '—'}</span></td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* BOTTOM: Important Notes */}
          <section className="notice-box p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="notice-icon-wrap">
                <Warning size={36} weight="fill" className="notice-icon" />
                <span className="notice-label">NOTICE</span>
              </div>
              <ul className="notice-list">
                <li>NFT stays in your wallet</li>
                <li>Rewards update automatically</li>
                <li>Selling NFT immediately stops future rewards</li>
                <li>No custody transfer required</li>
                <li>Previously earned rewards remain claimable</li>
              </ul>
            </div>
          </section>
        </>
      ) : (
        /* ---- Authenticated: Show staking data with terminal theme ---- */
        <>
          {/* Mini header showing connected state */}
          <div className="term-panel p-4 mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div className="flex items-center gap-3">
              <WalletConnectPanel
                onLoginSuccess={login}
                isAuthenticating={isAuthenticating}
                authToken={authToken}
              />
            </div>
            <div className="mono text-xs" style={{ color: '#00FF88' }}>
              {syncing ? <>SYNCING<span className="ml-1" style={{ animation: 'pulse-dot 1s infinite', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#00FF88', verticalAlign: 'middle' }} /> </> : 'LIVE'} &nbsp;|&nbsp; SUI MAINNET
            </div>
          </div>

          {/* Stats Cards */}
          <StatsCards stats={stats} />

          {/* Tab Navigation */}
          <div className="tab-nav" data-testid="tab-navigation">
            <button onClick={() => setActiveTab('nfts')} className={`tab-btn ${activeTab === 'nfts' ? 'active' : ''}`} data-testid="tab-nfts">
              <Cube size={12} weight="bold" className="inline mr-2" />MY NFTS
            </button>
            <button onClick={() => setActiveTab('dashboard')} className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} data-testid="tab-dashboard">
              <Stack size={12} weight="bold" className="inline mr-2" />DASHBOARD
            </button>
            <button onClick={() => setActiveTab('admin')} className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`} data-testid="tab-admin">
              <Gear size={12} weight="bold" className="inline mr-2" />ADMIN
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'nfts' && (
            <div data-testid="nfts-tab-content" className="mt-6">
              <NFTList positions={positions} loading={loading} />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div data-testid="dashboard-tab-content" className="mt-6">
              <StakingDashboard positions={positions} sellAlerts={sellAlerts} />
            </div>
          )}

          {activeTab === 'admin' && (
            <div data-testid="admin-tab-content" className="mt-6">
              <AdminPanel authToken={authToken} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   ROOT APP COMPONENT
   ============================================================ */
function App() {
  const wallet = useWallet();
  const { authToken, login, logout, isAuthenticating, authError, loadToken } = useWalletAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="App">
      {/* Minimal Nav Bar */}
      <nav className="nav-bar app-container" data-testid="navigation-bar">
        <button onClick={() => navigate('/')} className="nav-brand" data-testid="logo-home-button">
          <div className="nav-logo-box">
            <Cpu size={18} weight="bold" />
          </div>
          <div className="nav-text">
            <h3>VOXXSTAKE</h3>
            <p>// SOFT-STAKE PROTOCOL</p>
          </div>
        </button>
        <span className="nav-status hidden md:block flicker">[ ONLINE ]</span>
      </nav>

      {/* Main Content */}
      <main>
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
              <div className="app-container mt-4">
                <NFTDetail authToken={authToken} />
              </div>
            ) : (
              <div className="app-container mt-4">
                <div className="term-panel p-10 text-center">
                  <p className="hud-label mb-2">ACCESS DENIED</p>
                  <p className="text-sm text-dim mb-4">Sign in to view NFT details.</p>
                  <button onClick={() => navigate('/')} className="btn-primary px-4 py-2">
                    RETURN TO HOME
                  </button>
                </div>
              </div>
            )
          } />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="app-footer app-container">
        <p>// VOXX INC. // SOFT-STAKE PROTOCOL v1.0 // POWERED BY SUI //</p>
      </footer>
    </div>
  );
}

export default App;
