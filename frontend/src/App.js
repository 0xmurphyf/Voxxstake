import React, { useState, useEffect } from 'react';
import './App.css';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useWallet } from '@suiet/wallet-kit';
import { ConnectButton } from '@suiet/wallet-kit';
import { useWalletAuth } from './hooks/useWalletAuth';
import { useStaking } from './hooks/useStaking';
import { useSuiBalance } from './hooks/useSuiBalance';
import { NFTList } from './components/NFTList';
import { NFTDetail } from './components/NFTDetail';
import { WaitingList } from './components/WaitingList';
import { IDCard } from './components/IDCard';
import axios from 'axios';
import {
  Cube, ListNumbers, Cpu,
  Wallet, ShieldCheck, Fingerprint, IdentificationBadge, Clock, Scales,
  Warning, SignOut, Lightning
} from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

/* ============================================================
   LANDING PAGE — Neoterra Citizenship Registry
   ============================================================ */
function HomePage({ authToken, login, isAuthenticating, authError, logout, loadToken, balance }) {
  const wallet = useWallet();
  const { positions, stats, sellAlerts, loading, syncing, syncStakes } = useStaking(authToken);
  const [activeTab, setActiveTab] = useState('nfts');
  const [profileVersion, setProfileVersion] = useState(0);
  const [tabsEnabled, setTabsEnabled] = useState(false);

  // Enable tab switching after 3 seconds
  useEffect(() => {
    if (!authToken) return;
    const timer = setTimeout(() => setTabsEnabled(true), 3000);
    return () => clearTimeout(timer);
  }, [authToken]);

  // New user name prompt
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    loadToken();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (wallet.connected) loadToken();
  }, [wallet.connected]); // eslint-disable-line

  // Check if user has a profile name; if not, show prompt
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    axios.get(`${API}/profile`, {
      headers: { Authorization: `Bearer ${authToken}` }
    }).then(r => {
      if (!cancelled && !r.data.name) {
        setShowNamePrompt(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authToken]);

  const saveName = async () => {
    const trimmed = nameInput.trim().slice(0, 32);
    if (!trimmed) return;
    setNameSaving(true);
    try {
      await axios.put(`${API}/profile`, { name: trimmed }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setShowNamePrompt(false);
      setProfileVersion(v => v + 1);
    } catch (err) {
      console.error('Failed to save name:', err);
    } finally {
      setNameSaving(false);
    }
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
                    <button
                      onClick={() => { logout(); wallet.disconnect(); }}
                      className="wallet-connect-btn"
                      data-testid="change-wallet-button"
                    >
                      <SignOut size={16} weight="bold" />
                      DISCONNECT
                    </button>
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
          {/* Name Prompt Modal for new users */}
          {showNamePrompt && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.85)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div className="term-panel" style={{
                width: '90%', maxWidth: 420, padding: '28px 24px',
                border: '1px solid #00FFCC',
                boxShadow: '0 0 30px rgba(0,255,204,0.15)',
              }}>
                <h2 className="term-header" style={{ marginBottom: 8 }}>IDENTITY REGISTRATION</h2>
                <p style={{ color: 'rgba(0,255,204,0.6)', fontSize: '0.75rem', marginBottom: 20 }}>
                  Your identity has been verified. Register a citizen alias to appear on the Waiting List.
                </p>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
                  placeholder="Enter your citizen name..."
                  maxLength={32}
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(0,255,204,0.05)',
                    border: '1px solid rgba(0,255,204,0.3)',
                    color: '#00FFCC', fontFamily: 'inherit',
                    fontSize: '0.9rem', outline: 'none',
                    marginBottom: 18,
                  }}
                  data-testid="name-prompt-input"
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={saveName}
                    disabled={nameSaving || !nameInput.trim()}
                    style={{
                      background: 'rgba(0,255,204,0.1)', border: '1px solid #00FFCC',
                      color: '#00FFCC', padding: '8px 24px',
                      fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer',
                      opacity: (!nameInput.trim() || nameSaving) ? 0.4 : 1,
                    }}
                    data-testid="name-prompt-save"
                  >
                    {nameSaving ? 'SAVING...' : 'REGISTER'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* IDENTITY CARD */}
          <IDCard
            positions={positions}
            stats={stats}
            walletAddress={wallet.account?.address}
            authToken={authToken}
            syncStakes={syncStakes}
            syncing={syncing}
            onProfileSaved={() => setProfileVersion(v => v + 1)}
          />

          {/* Tab Navigation */}
          <div className="tab-nav" data-testid="tab-navigation">
            <button
              onClick={() => tabsEnabled && setActiveTab('nfts')}
              className={`tab-btn ${activeTab === 'nfts' ? 'active' : ''}`}
              data-testid="tab-nfts"
              style={{ opacity: tabsEnabled ? 1 : 0.5, cursor: tabsEnabled ? 'pointer' : 'not-allowed' }}
            >
              <Cube size={12} weight="bold" className="inline mr-2" />CREDENTIALS
            </button>
            <button
              onClick={() => tabsEnabled && setActiveTab('waiting')}
              className={`tab-btn ${activeTab === 'waiting' ? 'active' : ''}`}
              data-testid="tab-waiting"
              style={{ opacity: tabsEnabled ? 1 : 0.5, cursor: tabsEnabled ? 'pointer' : 'not-allowed' }}
            >
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
              <WaitingList authToken={authToken} profileVersion={profileVersion} />
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
  const balance = useSuiBalance(wallet.account?.address, authToken);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
  };

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {authToken && (
            <button
              onClick={handleLogout}
              className="wallet-connect-btn"
              style={{ padding: '6px 14px', fontSize: '0.65rem', letterSpacing: '0.12em' }}
              data-testid="logout-button"
            >
              <SignOut size={12} weight="bold" />
              DISCONNECT
            </button>
          )}
        </div>
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
              balance={balance}
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
