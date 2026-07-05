import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Gear, Trophy, Lightning, ChartLine } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function AdminPanel({ authToken }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, [authToken]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/admin/stats`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const statCards = stats ? [
    { title: 'Total Holders', value: stats.total_users, icon: Trophy, testId: 'admin-total-users' },
    { title: 'Tracked Stakes', value: stats.total_stakes, icon: ChartLine, testId: 'admin-total-stakes' },
    { title: 'Active', value: stats.total_active_stakes, icon: Lightning, testId: 'admin-active-stakes' },
    { title: 'Lore Pts Issued', value: (stats.total_points_distributed || 0).toFixed(0), icon: Trophy, testId: 'admin-points-distributed' },
  ] : [];

  return (
    <div className="space-y-6" data-testid="admin-panel">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 cp-corner-cuts bg-gradient-to-br from-[#B026FF] to-[#00FFE5] flex items-center justify-center">
          <Gear size={24} weight="bold" className="text-white" />
        </div>
        <div>
          <p className="hud-label mb-1">// SYSTEM CONTROL</p>
          <h1 className="text-2xl sm:text-3xl hud-value glitch" data-text="ADMIN PANEL">ADMIN PANEL</h1>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="admin-stats">
          {statCards.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="stats-card cp-corner-cuts p-4 sm:p-5" data-testid={stat.testId}>
                <div className="w-9 h-9 cp-corner-cuts bg-gradient-to-br from-[#B026FF] to-[#7B00CC] flex items-center justify-center mb-3">
                  <Icon size={18} weight="bold" className="text-white" />
                </div>
                <p className="hud-label mb-1">{stat.title}</p>
                <p className="text-2xl sm:text-3xl hud-value text-white">{stat.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Reward Rules */}
      <div className="cp-panel cp-corner-cuts p-5 sm:p-6">
        <div className="mb-4">
          <p className="hud-label mb-1">// REWARD RULES</p>
          <h2 className="text-lg sm:text-xl hud-value">POINTS SYSTEM</h2>
        </div>
        <div className="space-y-3 text-sm text-[#E5D9F2]">
          <div className="cp-panel-cyan p-4">
            <p className="hud-label mb-1">Base Rate</p>
            <p className="text-[#00FFE5]">1 NFT = <strong>1 point per hour</strong> (24 points/day)</p>
          </div>
          <div className="cp-panel-cyan p-4">
            <p className="hud-label mb-1">Holding Bonus</p>
            <p className="text-[#00FFE5]">
              ≥10 NFTs → <strong>1.1x</strong> multiplier<br />
              ≥20 NFTs → <strong>1.2x</strong> multiplier<br />
              ≥30 NFTs → <strong>1.3x</strong> multiplier<br />
              <span className="text-[#8E78A8] text-xs">(+0.1x per 10 NFTs, no upper limit)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
