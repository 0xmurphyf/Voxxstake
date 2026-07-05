import React, { useState, useEffect } from 'react';
import './App.css';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useWallet } from '@suiet/wallet-kit';
import { ConnectButton } from '@suiet/wallet-kit';
import { useWalletAuth } from './hooks/useWalletAuth';
import { useStaking } from './hooks/useStaking';
import { StatsCards } from './components/StatsCards';
import { NFTList } from './components/NFTList';
import { StakingDashboard } from './components/StakingDashboard';
import { NFTDetail } from './components/NFTDetail';
import {
  Cube, Stack, Cpu,
  Wallet, ShieldCheck, Power, Database, Gift,
  Warning, SignOut, Lightning
} from '@phosphor-icons/react';

/* ============================================================
   LANDING PAGE — Terminal-style layout
   ============================================================ */
function HomePage({ authToken, login, isAuthenticating, authError, logout, loadToken }) {
  const wallet = useWallet();
  const { positions, stats, sellAlerts, loading, syncing } = useStaking(authToken);
  const [activeTab, setActiveTab] = useState('nfts');

  useEffect(() => {
    loadToken();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (wallet.connected) loadToken();
  }, [wallet.connected]); // eslint-disable-line

  /* ---- Derived data ---- */
  const totalNfts = stats?.nft_count || positions?.filter(p => p.status === 'active').length || 0;
  const totalPoints = (stats?.total_lore_points || 0).toFixed(0);
  const multiplier = stats?.holding_multiplier || 1.0;
  const pointsPerHour = (totalNfts * multiplier).toFixed(1);
  const maxDuration = positions?.reduce((max, p) => {
    if (p.status === 'active' && (p.duration_days || 0) > max) return p.duration_days;
    return max;
  }, 0) || 0;

  const handleLogout = () => {
    logout();
  };

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

      {/* ===== UNAUTHENTICATED: Landing page ===== */}
      {!authToken ? (
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

              <div className="wallet-inline" style={{ marginTop: 24 }}>
                {wallet.connected ? (
                  <button
                    onClick={login}
                    disabled={isAuthenticating}
                    className="wallet-connect-btn"
                    data-testid="sign-in-button"
                  >
                    {isAuthenticating ? (
                      <>SIGNING IN...</>
                    ) : (
                      <><Lightning size={16} weight="fill" className="inline mr-2" />SIGN IN</>
                    )}
                  </button>
                ) : (
                  <ConnectButton className="wallet-connect-btn">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Lightning size={16} weight="fill" />
                      CONNECT WALLET
                    </span>
                  </ConnectButton>
                )}
                {wallet.connected && (
                  <p className="mono text-xs mt-3" style={{ color: 'rgba(0,255,204,0.5)' }}>
                    {wallet.account?.address?.slice(0, 8)}...{wallet.account?.address?.slice(-6)}
                  </p>
                )}
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

          {/* NOTICE — always visible on landing page */}
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
        /* ===== AUTHENTICATED: Dashboard ===== */
        <>
          {/* Status bar with logout */}
          <div className="term-panel p-4 mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div className="mono text-xs" style={{ color: '#00FF88' }}>
              {syncing ? <>SYNCING<span className="ml-1" style={{ animation: 'pulse-dot 1s infinite', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#00FF88', verticalAlign: 'middle' }} /> </> : 'LIVE'} &nbsp;|&nbsp; SUI MAINNET
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="mono text-xs" style={{ color: 'rgba(0,255,204,0.7)' }}>
                {wallet.account?.address?.slice(0, 10)}...{wallet.account?.address?.slice(-6)}
              </span>
              <button
                onClick={handleLogout}
                className="btn-ghost"
                data-testid="logout-button"
              >
                <SignOut size={14} weight="bold" />
                LOGOUT
              </button>
            </div>
          </div>

          {/* LIVE STAKING STATUS — only when connected */}
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
                  <td><span className="status-value">{totalNfts}</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Multiplier</span></td>
                  <td><span className="status-value">{multiplier.toFixed(1)}x</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Reward Rate</span></td>
                  <td><span className="status-value">{pointsPerHour} PTS / HR</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Total Points</span></td>
                  <td><span className="status-value">{totalPoints} PTS</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Staking Duration</span></td>
                  <td><span className="status-value">{maxDuration > 0 ? `${maxDuration.toFixed(1)} days` : '—'}</span></td>
                </tr>
              </tbody>
            </table>
          </section>

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
        </>
      )}
    </div>
  );
}

/* ============================================================
   ROOT APP COMPONENT
   ============================================================ */
function App() {
  const { authToken, login, logout, isAuthenticating, authError, loadToken } = useWalletAuth();
  const navigate = useNavigate();

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
