import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ListNumbers, Trophy, Cube, Clock, Lightning } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

function formatDuration(days) {
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
    return `${hours.toFixed(1)}h`;
  }
  return `${days.toFixed(1)}d`;
}

export function WaitingList({ authToken }) {
  const [rankings, setRankings] = useState([]);
  const [totalStakers, setTotalStakers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRankings = useCallback(async () => {
    try {
      setLoading(true);
      const r = await axios.get(`${API}/ranking`);
      setRankings(r.data.rankings || []);
      setTotalStakers(r.data.total_stakers || 0);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch rankings:', err);
      setError('Unable to load waiting list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-14 cp-corner-cuts" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="cp-alert cp-corner-cuts p-6 text-center" data-testid="waiting-list-error">
        <p className="text-sm">{error}</p>
        <button onClick={fetchRankings} className="cp-btn-ghost px-4 py-2 mt-3 text-xs">
          RETRY
        </button>
      </div>
    );
  }

  if (!rankings || rankings.length === 0) {
    return (
      <div className="cp-panel cp-corner-cuts p-10 text-center" data-testid="waiting-list-empty">
        <ListNumbers size={48} weight="duotone" className="mx-auto mb-4 text-[#8E78A8]" />
        <p className="hud-label mb-2">WAITING LIST</p>
        <p className="text-sm text-[#8E78A8]">
          No active citizens registered yet. Be the first to apply.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="waiting-list">
      {/* Summary bar */}
      <div className="term-panel p-4 mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-2">
          <ListNumbers size={18} weight="bold" className="text-[#00FFCC]" />
          <span className="hud-value text-sm">CITIZENSHIP WAITING LIST</span>
        </div>
        <span className="mono text-xs" style={{ color: 'rgba(0,255,204,0.6)' }}>
          {totalStakers} REGISTERED CITIZENS
        </span>
      </div>

      {/* Table header */}
      <div className="cp-panel cp-corner-cuts" style={{ overflow: 'hidden' }}>
        <div
          className="grid gap-2 p-3 px-4"
          style={{
            gridTemplateColumns: '40px 1fr 80px 80px 90px 100px',
            borderBottom: '1px solid rgba(0,255,204,0.12)',
            background: 'rgba(0,255,204,0.03)',
          }}
        >
          <span className="hud-label text-center">#</span>
          <span className="hud-label">CITIZEN</span>
          <span className="hud-label text-center">CREDENTIALS</span>
          <span className="hud-label text-center">RATE</span>
          <span className="hud-label text-center">REGISTERED</span>
          <span className="hud-label text-right">CREDITS</span>
        </div>

        {/* Rows */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {rankings.map((entry, idx) => {
            const rank = idx + 1;
            const isTop3 = rank <= 3;
            return (
              <div
                key={idx}
                className="grid gap-2 p-3 px-4"
                style={{
                  gridTemplateColumns: '40px 1fr 80px 80px 90px 100px',
                  borderBottom: '1px solid rgba(0,255,204,0.06)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(0,255,204,0.02)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,255,204,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,255,204,0.02)'; }}
              >
                {/* Rank */}
                <div className="flex items-center justify-center">
                  {isTop3 ? (
                    <Trophy
                      size={16}
                      weight="fill"
                      style={{
                        color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32',
                      }}
                    />
                  ) : (
                    <span className="mono text-xs" style={{ color: 'rgba(0,255,204,0.5)' }}>
                      {rank}
                    </span>
                  )}
                </div>

                {/* Address */}
                <div className="flex items-center min-w-0">
                  <span className="mono text-xs truncate" style={{ color: isTop3 ? '#fff' : 'rgba(0,255,204,0.7)' }}>
                    {entry.address}
                  </span>
                </div>

                {/* Credential count */}
                <div className="flex items-center justify-center gap-1">
                  <Cube size={10} weight="bold" style={{ color: 'rgba(0,255,204,0.5)' }} />
                  <span className="mono text-xs" style={{ color: '#fff' }}>{entry.credential_count}</span>
                </div>

                {/* Multiplier */}
                <div className="flex items-center justify-center">
                  <span className="status-badge badge-active" style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
                    {entry.multiplier.toFixed(1)}x
                  </span>
                </div>

                {/* Duration */}
                <div className="flex items-center justify-center gap-1">
                  <Clock size={10} style={{ color: 'rgba(0,255,204,0.4)' }} />
                  <span className="mono text-xs" style={{ color: 'rgba(0,255,204,0.65)' }}>
                    {formatDuration(entry.max_duration_days)}
                  </span>
                </div>

                {/* Credits */}
                <div className="flex items-center justify-end gap-1">
                  <Lightning size={10} weight="fill" style={{ color: '#00FF88' }} />
                  <span className="mono text-xs" style={{ color: '#00FF88', fontWeight: 600 }}>
                    {entry.total_credits.toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Refresh button */}
      <div className="text-center mt-4">
        <button onClick={fetchRankings} className="btn-ghost text-xs">
          <Clock size={12} weight="bold" />
          REFRESH
        </button>
      </div>
    </div>
  );
}
