import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Gear, Trophy, Lightning, ChartLine } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function AdminPanel({ authToken }) {
  const [tiers, setTiers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchTiers();
    fetchStats();
  }, [authToken]);

  const fetchTiers = async () => {
    try {
      const response = await axios.get(`${API}/admin/tiers`);
      setTiers(response.data.tiers);
    } catch (error) {
      console.error('Failed to fetch tiers:', error);
    }
  };

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

  const handleSaveTiers = async () => {
    setLoading(true);
    try {
      await axios.post(
        `${API}/admin/tiers`,
        { tiers },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      alert('Tiers updated successfully!');
      setEditMode(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update tiers');
    } finally {
      setLoading(false);
    }
  };

  const updateTier = (index, field, value) => {
    const newTiers = [...tiers];
    newTiers[index][field] = parseFloat(value) || 0;
    setTiers(newTiers);
  };

  return (
    <div className="space-y-6" data-testid="admin-panel">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-sm bg-gradient-to-br from-[#FFB800] to-[#FF8C00] flex items-center justify-center">
          <Gear size={24} weight="bold" className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
            ADMIN DASHBOARD
          </h1>
          <p className="text-[#8E9BAE] text-sm">Manage staking tiers and view platform statistics</p>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-stats">
          {[
            { title: 'Total Users', value: stats.total_users, icon: Trophy, color: 'from-[#3898FF] to-[#00F0FF]', testId: 'admin-total-users' },
            { title: 'Total Stakes', value: stats.total_stakes, icon: ChartLine, color: 'from-[#00FF9D] to-[#00D4AA]', testId: 'admin-total-stakes' },
            { title: 'Active Stakes', value: stats.total_active_stakes, icon: Lightning, color: 'from-[#FFB800] to-[#FF8C00]', testId: 'admin-active-stakes' },
            { title: 'Points Distributed', value: stats.total_points_distributed.toFixed(0), icon: Trophy, color: 'from-[#FF3B30] to-[#FF1744]', testId: 'admin-points-distributed' },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="glass-effect glow-border rounded-sm p-6" data-testid={stat.testId}>
                <div className={`w-10 h-10 rounded-sm bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                  <Icon size={20} weight="bold" className="text-white" />
                </div>
                <p className="text-xs text-[#8E9BAE] uppercase tracking-[0.2em] mb-1">{stat.title}</p>
                <p className="text-2xl font-black">{stat.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tier Management */}
      <div className="glass-effect rounded-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
            STAKING TIERS
          </h2>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 rounded-sm border border-[#8E9BAE] text-[#8E9BAE] font-bold text-sm hover:bg-[#8E9BAE] hover:text-white transition-colors"
                  data-testid="cancel-edit-button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTiers}
                  disabled={loading}
                  className="px-4 py-2 rounded-sm bg-gradient-to-r from-[#3898FF] to-[#00F0FF] text-white font-bold text-sm hover:scale-105 transition-transform disabled:opacity-50"
                  data-testid="save-tiers-button"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 rounded-sm bg-[#1E2638] text-white font-bold text-sm hover:bg-[#2A3548] transition-colors"
                data-testid="edit-tiers-button"
              >
                Edit Tiers
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4" data-testid="tiers-list">
          {tiers.map((tier, index) => (
            <div key={index} className="border border-[#8E9BAE]/20 rounded-sm p-4" data-testid={`tier-${tier.name.toLowerCase()}`}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[#8E9BAE] uppercase tracking-wider mb-2 block">
                    Tier Name
                  </label>
                  <input
                    type="text"
                    value={tier.name}
                    disabled
                    className="w-full px-3 py-2 bg-[#05050A] border border-[#8E9BAE]/30 rounded-sm text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8E9BAE] uppercase tracking-wider mb-2 block">
                    Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tier.multiplier}
                    onChange={(e) => updateTier(index, 'multiplier', e.target.value)}
                    disabled={!editMode}
                    className="w-full px-3 py-2 bg-[#05050A] border border-[#8E9BAE]/30 rounded-sm text-white disabled:opacity-50"
                    data-testid={`tier-multiplier-${tier.name.toLowerCase()}`}
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8E9BAE] uppercase tracking-wider mb-2 block">
                    Min Days
                  </label>
                  <input
                    type="number"
                    value={tier.min_days}
                    onChange={(e) => updateTier(index, 'min_days', e.target.value)}
                    disabled={!editMode}
                    className="w-full px-3 py-2 bg-[#05050A] border border-[#8E9BAE]/30 rounded-sm text-white disabled:opacity-50"
                    data-testid={`tier-min-days-${tier.name.toLowerCase()}`}
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8E9BAE] uppercase tracking-wider mb-2 block">
                    APY %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tier.apy}
                    onChange={(e) => updateTier(index, 'apy', e.target.value)}
                    disabled={!editMode}
                    className="w-full px-3 py-2 bg-[#05050A] border border-[#8E9BAE]/30 rounded-sm text-white disabled:opacity-50"
                    data-testid={`tier-apy-${tier.name.toLowerCase()}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
