import React, { useState, useEffect } from 'react';
import './App.css';
import { useWallet } from '@suiet/wallet-kit';
import { useWalletAuth } from './hooks/useWalletAuth';
import { WalletConnectPanel } from './components/WalletConnectPanel';
import { StatsCards } from './components/StatsCards';
import { NFTList } from './components/NFTList';
import { StakingDashboard } from './components/StakingDashboard';
import { AdminPanel } from './components/AdminPanel';
import { useStaking } from './hooks/useStaking';
import { Stack, Cube, Gear } from '@phosphor-icons/react';

function App() {
  const wallet = useWallet();
  const { authToken, login, logout, isAuthenticating, authError, loadToken } = useWalletAuth();
  const { stats, positions } = useStaking(authToken);
  const [activeTab, setActiveTab] = useState('stake');

  useEffect(() => {
    if (wallet.connected) {
      const token = loadToken();
      if (!token) {
        // Auto-prompt login when wallet connects
      }
    } else {
      logout();
    }
  }, [wallet.connected]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="App min-h-screen">
      {/* Navigation Bar */}
      <nav className="nav-bar px-6 py-4" data-testid="navigation-bar">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-[#3898FF] to-[#00F0FF] flex items-center justify-center">
              <Cube size={24} weight="bold" className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
                VOXX STAKING
              </h1>
              <p className="text-xs text-[#8E9BAE]">Sui Chain NFT Staking</p>
            </div>
          </div>
          {authToken && (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('stake')}
                className={`px-4 py-2 rounded-sm font-bold text-sm transition-colors ${
                  activeTab === 'stake'
                    ? 'bg-gradient-to-r from-[#3898FF] to-[#00F0FF] text-white'
                    : 'text-[#8E9BAE] hover:text-white'
                }`}
                data-testid="tab-stake"
              >
                <Stack size={16} weight="bold" className="inline mr-2" />
                Stake
              </button>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-sm font-bold text-sm transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-[#3898FF] to-[#00F0FF] text-white'
                    : 'text-[#8E9BAE] hover:text-white'
                }`}
                data-testid="tab-dashboard"
              >
                <Cube size={16} weight="bold" className="inline mr-2" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 rounded-sm font-bold text-sm transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-gradient-to-r from-[#3898FF] to-[#00F0FF] text-white'
                    : 'text-[#8E9BAE] hover:text-white'
                }`}
                data-testid="tab-admin"
              >
                <Gear size={16} weight="bold" className="inline mr-2" />
                Admin
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <WalletConnectPanel onLoginSuccess={handleLogin} isAuthenticating={isAuthenticating} />

        {authError && (
          <div className="glass-effect rounded-sm p-4 mb-6 border-l-4 border-[#FF3B30]" data-testid="auth-error">
            <p className="text-[#FF3B30] text-sm font-bold">Authentication Error: {authError}</p>
          </div>
        )}

        {!authToken ? (
          <div className="glass-effect rounded-sm p-12 text-center" data-testid="connect-prompt">
            <div className="max-w-2xl mx-auto">
              <div
                className="w-full h-64 mb-6 rounded-sm relative overflow-hidden"
                style={{
                  backgroundImage: 'url(https://images.unsplash.com/photo-1683064325134-3acfdef9c6d7?auto=compress&cs=tinysrgb&w=800)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[#05050A] to-transparent" />
              </div>
              <h2 className="text-4xl sm:text-5xl font-black mb-4 tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
                STAKE YOUR VOXX NFTS
              </h2>
              <p className="text-lg text-[#8E9BAE] mb-6">
                Connect your Sui wallet and sign in to start earning points through NFT staking.
              </p>
              <div className="flex flex-col gap-4 max-w-md mx-auto">
                <div className="glass-effect rounded-sm p-4 text-left">
                  <h3 className="font-bold text-[#3898FF] mb-2">📊 Multiple Reward Tiers</h3>
                  <p className="text-sm text-[#8E9BAE]">Earn more points based on staking duration</p>
                </div>
                <div className="glass-effect rounded-sm p-4 text-left">
                  <h3 className="font-bold text-[#00FF9D] mb-2">⚡ Instant Staking</h3>
                  <p className="text-sm text-[#8E9BAE]">Stake and unstake your NFTs anytime</p>
                </div>
                <div className="glass-effect rounded-sm p-4 text-left">
                  <h3 className="font-bold text-[#FFB800] mb-2">🏆 Points System</h3>
                  <p className="text-sm text-[#8E9BAE]">10 base points per day with tier multipliers</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'stake' && (
              <div data-testid="stake-tab-content">
                <div className="mb-6">
                  <h2 className="text-3xl font-black mb-2 tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
                    YOUR VOXX NFTS
                  </h2>
                  <p className="text-[#8E9BAE]">Select NFTs to stake and start earning points</p>
                </div>
                <NFTList authToken={authToken} />
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div data-testid="dashboard-tab-content">
                <div className="mb-6">
                  <h2 className="text-3xl font-black mb-2 tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
                    STAKING OVERVIEW
                  </h2>
                  <p className="text-[#8E9BAE]">Track your staked NFTs and earned points</p>
                </div>
                <StatsCards stats={stats} positions={positions} />
                <StakingDashboard authToken={authToken} />
              </div>
            )}

            {activeTab === 'admin' && (
              <div data-testid="admin-tab-content">
                <AdminPanel authToken={authToken} />
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#8E9BAE]/10 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-[#8E9BAE]">
            Powered by Sui Blockchain • Built with ❤️ for VOXX NFT Holders
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
