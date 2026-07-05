import React, { useState, useEffect } from 'react';
import './App.css';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useWallet } from '@suiet/wallet-kit';
import { ConnectButton } from '@suiet/wallet-kit';
import { useWalletAuth } from './hooks/useWalletAuth';
import { useStaking } from './hooks/useStaking';
import { StatsCards } from './components/StatsCards';
import { NFTList } from './components/NFTList';
import { NFTDetail } from './components/NFTDetail';
import { WaitingList } from './components/WaitingList';
import {
  Cube, ListNumbers, Cpu,
  Wallet, ShieldCheck, Fingerprint, IdentificationBadge, Clock, Scales,
  Warning, SignOut, Lightning
} from '@phosphor-icons/react';

/* ============================================================
   LANDING PAGE — Neoterra Citizenship Registry
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
          <p className="header-file-id">NEOTERRA_CITIZENSHIP_REGISTRY</p>
          <div className="header-title-group">
            <h1>CITIZENSHIP APPLICATION</h1>
            <p className="header-subtitle">
              Hold your Genesis NFT. Register for citizenship. Earn your place in Neoterra.
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
            {/* LEFT: Citizenship Overview */}
            <section className="term-panel p-6 sm:p-8">
              <h2 className="term-header">CITIZENSHIP OVERVIEW</h2>

              <span className="term-tag">NEOTERRA</span>

              <h3 className="term-title">APPLY FOR NEOTERRA CITIZENSHIP</h3>

              <div className="term-text space-y-4">
                <p>Welcome to the <strong>Neoterra Citizenship Registry</strong>. Genesis NFT holders are eligible to apply for citizenship in the Neoterra sovereign network.</p>
                <p><strong>Your NFT serves as your identity credential.</strong> It never leaves your wallet — the registry simply verifies on-chain ownership and tracks your citizenship standing.</p>
                <p>The longer you hold and the more NFTs you possess, the greater your standing in Neoterra society.</p>
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
                      <>VERIFYING...</>
                    ) : (
                      <><Fingerprint size={16} weight="fill" className="inline mr-2" />VERIFY IDENTITY</>
                    )}
                  </button>
                ) : (
                  <ConnectButton>
                    <button className="wallet-connect-btn" data-testid="connect-wallet-button">
                      <Lightning size={18} weight="fill" />
                      CONNECT WALLET
                    </button>
                  </ConnectButton>
                )}
                {wallet.connected && (
                  <p className="mono text-xs mt-3" style={{ color: 'rgba(0,255,204,0.5)' }}>
                    {wallet.account?.address?.slice(0, 8)}...{wallet.account?.address?.slice(-6)}
                  </p>
                )}
              </div>
            </section>

            {/* RIGHT: Application Process */}
            <section className="term-panel p-6 sm:p-8">
              <h2 className="term-header">APPLICATION PROCESS</h2>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Wallet size={22} weight="light" /></div>
                <div className="flow-content">
                  <div className="flow-title">Connect Wallet</div>
                  <div className="flow-desc">Link your SUI wallet to the Citizenship Registry.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Fingerprint size={22} /></div>
                <div className="flow-content">
                  <div className="flow-title">Verify Identity</div>
                  <div className="flow-desc">Sign a message to prove ownership of your wallet.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><ShieldCheck size={22} weight="fill" /></div>
                <div className="flow-content">
                  <div className="flow-title">Credential Scan</div>
                  <div className="flow-desc">Registry scans your wallet for Genesis NFT credentials.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><IdentificationBadge size={22} weight="fill" /></div>
                <div className="flow-content">
                  <div className="flow-title">Registration Active</div>
                  <div className="flow-desc">Citizenship registration begins. Your NFT stays in your wallet.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                  <div className="flow-connector" />
                </div>
                <div className="flow-icon"><Clock size={22} /></div>
                <div className="flow-content">
                  <div className="flow-title">Accrue Standing</div>
                  <div className="flow-desc">Citizenship credits accumulate automatically over time.</div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-line">
                  <div className="flow-dot" />
                </div>
                <div className="flow-icon"><Scales size={22} weight="fill" /></div>
                <div className="flow-content">
                  <div className="flow-title">Claim Benefits</div>
                  <div className="flow-desc">Access Neoterra citizen benefits based on your standing.</div>
                </div>
              </div>
            </section>
          </div>

          {/* NOTICE */}
          <section className="notice-box p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="notice-icon-wrap">
                <Warning size={36} weight="fill" className="notice-icon" />
                <span className="notice-label">NOTICE</span>
              </div>
              <ul className="notice-list">
                <li>Your NFT never leaves your wallet</li>
                <li>Citizenship credits update automatically</li>
                <li>Selling your NFT revokes citizenship standing</li>
                <li>No custody transfer — full self-sovereignty</li>
                <li>Previously earned credits are preserved</li>
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
              {syncing ? <>SYNCING<span className="ml-1" style={{ animation: 'pulse-dot 1s infinite', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#00FF88', verticalAlign: 'middle' }} /> </> : 'LIVE'} &nbsp;|&nbsp; NEOTERRA REGISTRY
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

          {/* CITIZENSHIP STATUS — only when connected */}
          <section className="term-panel p-6 sm:p-8" style={{ marginBottom: 20 }}>
            <h2 className="term-header">CITIZENSHIP STATUS</h2>
            <table className="status-table">
              <tbody>
                <tr>
                  <td style={{ width: '33%' }}><span className="status-label">Status</span></td>
                  <td><span className="status-value status-value-green"><span className="status-dot-active"><span className="status-dot" />REGISTERED</span></span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Credentials Held</span></td>
                  <td><span className="status-value">{totalNfts}</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Standing Bonus</span></td>
                  <td><span className="status-value">{multiplier.toFixed(1)}x</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Accrual Rate</span></td>
                  <td><span className="status-value">{pointsPerHour} CREDITS / HR</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Total Credits</span></td>
                  <td><span className="status-value">{totalPoints} CREDITS</span></td>
                </tr>
                <tr>
                  <td><span className="status-label">Registration Period</span></td>
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
              <Cube size={12} weight="bold" className="inline mr-2" />CREDENTIALS
            </button>
            <button onClick={() => setActiveTab('waiting')} className={`tab-btn ${activeTab === 'waiting' ? 'active' : ''}`} data-testid="tab-waiting">
              <ListNumbers size={12} weight="bold" className="inline mr-2" />WAITING LIST
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'nfts' && (
            <div data-testid="nfts-tab-content" className="mt-6">
              <NFTList positions={positions} loading={loading} />
            </div>
          )}

          {activeTab === 'waiting' && (
            <div data-testid="waiting-tab-content" className="mt-6">
              <WaitingList authToken={authToken} />
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
      {/* Nav Bar */}
      <nav className="nav-bar app-container" data-testid="navigation-bar">
        <button onClick={() => navigate('/')} className="nav-brand" data-testid="logo-home-button">
          <div className="nav-logo-box">
            <Cpu size={18} weight="bold" />
          </div>
          <div className="nav-text">
            <h3>NEOTERRA</h3>
            <p>// CITIZENSHIP REGISTRY</p>
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
                  <p className="text-sm text-dim mb-4">Verify your identity to view credential details.</p>
                  <button onClick={() => navigate('/')} className="btn-primary px-4 py-2">
                    RETURN TO REGISTRY
                  </button>
                </div>
              </div>
            )
          } />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="app-footer app-container">
        <p>// NEOTERRA SOVEREIGN NETWORK // CITIZENSHIP REGISTRY v1.0 // POWERED BY SUI //</p>
      </footer>
    </div>
  );
}

export default App;
