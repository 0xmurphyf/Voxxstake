import React, { useState, useEffect } from 'react';
import './App.css';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useWallet } from '@suiet/wallet-kit';
import { ConnectButton } from '@suiet/wallet-kit';
import { useWalletAuth } from './hooks/useWalletAuth';
import { useStaking } from './hooks/useStaking';
import { useSuiBalance } from './hooks/useSuiBalance';
import { StatsCards } from './components/StatsCards';
import { NFTList } from './components/NFTList';
import { NFTDetail } from './components/NFTDetail';
import { WaitingList } from './components/WaitingList';
import { IDCard } from './components/IDCard';
import {
  Cube, ListNumbers, Cpu,
  Wallet, ShieldCheck, Fingerprint, IdentificationBadge, Clock, Scales,
  Warning, SignOut, Lightning, ArrowsClockwise
} from '@phosphor-icons/react';

/* ============================================================
   LANDING PAGE — Neoterra Citizenship Registry
   ============================================================ */
function HomePage({ authToken, login, isAuthenticating, authError, logout, loadToken }) {
  const wallet = useWallet();
  const { positions, stats, sellAlerts, loading, syncing } = useStaking(authToken);
  const balance = useSuiBalance(wallet.account?.address);
  const [activeTab, setActiveTab] = useState('nfts');

  useEffect(() => {
    loadToken();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (wallet.connected) loadToken();
  }, [wallet.connected]); // eslint-disable-line

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="app-container">
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

              <h3 className="term-title">APPLY FOR NEOTERRA CITIZENSHIP</h3>

              <div className="term-text space-y-4">
                <p>Welcome to the <strong>Neoterra Citizenship Registry</strong>. Genesis NFT holders are eligible to apply for citizenship in the Neoterra sovereign network.</p>
                <p><strong>Your NFT serves as your identity credential.</strong> It never leaves your wallet — the registry simply verifies on-chain ownership and tracks your citizenship standing.</p>
                <p>The longer you hold and the more NFTs you possess, the greater your standing in Neoterra society.</p>
              </div>

              <div className="wallet-inline" style={{ marginTop: 24 }}>
                {wallet.connected ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
                    <ConnectButton>
                      <button className="wallet-connect-btn" data-testid="change-wallet-button">
                        <ArrowsClockwise size={16} weight="bold" />
                        CHANGE WALLET
                      </button>
                    </ConnectButton>
                  </div>
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
          {/* Status bar */}
          <div className="term-panel p-3 px-4 mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Balance */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="hud-label" style={{ fontSize: '0.6rem' }}>BALANCE</span>
                <span className="mono text-sm" style={{ color: '#00FF88', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {balance !== null ? `${balance} SUI` : '...'}
                </span>
              </div>
              <div style={{ width: 1, height: 18, background: 'rgba(0,255,204,0.15)' }} />
              {/* Address */}
              <span className="mono text-xs" style={{ color: 'rgba(0,255,204,0.6)', letterSpacing: '0.06em' }}>
                {wallet.account?.address?.slice(0, 10)}...{wallet.account?.address?.slice(-6)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="wallet-connect-btn"
              style={{ padding: '8px 18px', fontSize: '0.7rem' }}
              data-testid="logout-button"
            >
              <SignOut size={14} weight="bold" />
              DISCONNECT
            </button>
          </div>

          {/* IDENTITY CARD */}
          <IDCard
            positions={positions}
            stats={stats}
            walletAddress={wallet.account?.address}
            authToken={authToken}
          />

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
