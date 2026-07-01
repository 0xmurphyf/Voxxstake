import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Gear, Trophy, Lightning, ChartLine, FloppyDisk, PencilSimple } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
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
      setEditMode(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update tiers');
    } finally {
      setLoading(false);
    }
  };

  const updateTier = (index, field, value) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: parseFloat(value) || 0 };
    setTiers(newTiers);
  };

  const statCards = stats ? [
    { title: 'Total Holders', value: stats.total_users, icon: Trophy, testId: 'admin-total-users' },
    { title: 'Tracked Stakes', value: stats.total_stakes, icon: ChartLine, testId: 'admin-total-stakes' },
    { title: 'Active', value: stats.total_active_stakes, icon: Lightning, testId: 'admin-active-stakes' },
    { title: 'Lore Pts Issued', value: stats.total_points_distributed.toFixed(0), icon: Trophy, testId: 'admin-points-distributed' },
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

      {/* Tier Management */}
      <div className="cp-panel cp-corner-cuts p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <p className="hud-label mb-1">// REWARD MATRIX</p>
            <h2 className="text-lg sm:text-xl hud-value">STAKING TIERS</h2>
          </div>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button
                  onClick={() => { setEditMode(false); fetchTiers(); }}
                  className="cp-btn-ghost px-4 py-2 text-xs"
                  data-testid="cancel-edit-button"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSaveTiers}
                  disabled={loading}
                  className="cp-btn-cyan px-4 py-2 text-xs flex items-center gap-2"
                  data-testid="save-tiers-button"
                >
                  <FloppyDisk size={14} weight="bold" />
                  {loading ? 'SAVING' : 'SAVE'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="cp-btn px-4 py-2 text-xs flex items-center gap-2"
                data-testid="edit-tiers-button"
              >
                <PencilSimple size={14} weight="bold" />
                EDIT
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3" data-testid="tiers-list">
          {tiers.map((tier, index) => (
            <div key={index} className="cp-panel-cyan p-4 cp-corner-cuts" data-testid={`tier-${tier.name.toLowerCase()}`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <p className="hud-label mb-2">Tier</p>
                  <p className={`status-badge ${`tier-${tier.name.toLowerCase()}`} inline-block`}>{tier.name}</p>
                </div>
                <div>
                  <p className="hud-label mb-2">Multiplier</p>
                  <input
                    type="number"
                    step="0.1"
                    value={tier.multiplier}
                    onChange={(e) => updateTier(index, 'multiplier', e.target.value)}
                    disabled={!editMode}
                    className="cp-input w-full text-sm"
                    data-testid={`tier-multiplier-${tier.name.toLowerCase()}`}
                  />
                </div>
                <div>
                  <p className="hud-label mb-2">Min Days</p>
                  <input
                    type="number"
                    value={tier.min_days}
                    onChange={(e) => updateTier(index, 'min_days', e.target.value)}
                    disabled={!editMode}
                    className="cp-input w-full text-sm"
                    data-testid={`tier-min-days-${tier.name.toLowerCase()}`}
                  />
                </div>
                <div>
                  <p className="hud-label mb-2">APY %</p>
                  <input
                    type="number"
                    step="0.1"
                    value={tier.apy}
                    onChange={(e) => updateTier(index, 'apy', e.target.value)}
                    disabled={!editMode}
                    className="cp-input w-full text-sm"
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
