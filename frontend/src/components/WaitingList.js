import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ListNumbers, Trophy, Cube, Lightning, Clock } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function WaitingList({ authToken, profileVersion }) {
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
    // Auto-refresh every 30s so the waiting list stays in sync with
    // background sync cycles and manual adjustments from File Z.
    const interval = setInterval(fetchRankings, 30_000);
    return () => clearInterval(interval);
  }, [fetchRankings, profileVersion]);

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
      <div className="term-panel p-3 mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-2">
          <ListNumbers size={16} weight="bold" style={{ color: '#00FFCC' }} />
          <span className="hud-value" style={{ fontSize: '0.78rem' }}>CITIZENSHIP WAITING LIST</span>
        </div>
        <span className="mono" style={{ color: 'rgba(0,255,204,0.6)', fontSize: '0.7rem' }}>
          {totalStakers} REGISTERED APPLICANTS
        </span>
      </div>

      {/* Table */}
      <div className="cp-panel cp-corner-cuts" style={{ overflow: 'hidden' }}>
        {/* Header — desktop: 5 cols, mobile: 4 cols (hide CREDITS) */}
        <div className="waiting-header">
          <span className="hud-label text-center">#</span>
          <span className="hud-label">APPLICANT</span>
          <span className="hud-label text-center">NFT</span>
          <span className="hud-label text-center waiting-col-accrual">ACCRUAL</span>
          <span className="hud-label text-right waiting-col-credits">CREDITS</span>
        </div>

        <div style={{ overflowY: 'auto' }}>
          {rankings.map((entry, idx) => {
            const rank = idx + 1;
            const isTop3 = rank <= 3;

            return (
              <div key={idx} className="waiting-row">
                {/* Rank */}
                <div className="flex items-center justify-center">
                  {isTop3 ? (
                    <Trophy
                      size={14}
                      weight="fill"
                      style={{
                        color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32',
                      }}
                    />
                  ) : (
                    <span className="mono" style={{
                      color: 'rgba(0,255,204,0.5)',
                      fontSize: '0.7rem',
                    }}>
                      {rank}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="flex items-center min-w-0">
                  <span className="mono truncate" style={{
                    color: isTop3 ? '#fff' : 'rgba(0,255,204,0.7)',
                    fontSize: '0.7rem',
                  }}>
                    {entry.display_name || entry.display_address}
                  </span>
                </div>

                {/* NFT count */}
                <div className="flex items-center justify-center gap-1">
                  <Cube size={9} weight="bold" style={{ color: 'rgba(0,255,204,0.5)' }} />
                  <span className="mono" style={{ color: '#fff', fontSize: '0.7rem' }}>{entry.credential_count}</span>
                </div>

                {/* Accrual rate */}
                <div className="flex items-center justify-center gap-1 waiting-col-accrual">
                  <Lightning size={9} weight="fill" style={{ color: '#00FF88' }} />
                  <span className="mono" style={{ color: '#00FF88', fontSize: '0.7rem' }}>
                    {(entry.credential_count * (entry.multiplier || 1)).toFixed(1)}
                  </span>
                </div>

                {/* Credits (desktop only) */}
                <div className="flex items-center justify-end gap-1 waiting-col-credits">
                  <Lightning size={9} weight="fill" style={{ color: '#00FF88' }} />
                  <span className="mono" style={{ color: '#00FF88', fontWeight: 600, fontSize: '0.7rem' }}>
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
        <button onClick={fetchRankings} className="btn-ghost" style={{ fontSize: '0.65rem' }}>
          <Clock size={11} weight="bold" />
          REFRESH
        </button>
      </div>
    </div>
  );
}
