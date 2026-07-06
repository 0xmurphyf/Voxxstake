import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { ListNumbers, Trophy, Cube, Lightning, Clock } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function WaitingList({ authToken, walletAddress, profileVersion }) {
  const [rankings, setRankings] = useState([]);
  const [totalStakers, setTotalStakers] = useState(0);
  const [currentUserRank, setCurrentUserRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRankings = useCallback(async () => {
    try {
      setLoading(true);
      const params = walletAddress ? { address: walletAddress } : {};
      const r = await axios.get(`${API}/ranking`, { params });
      setRankings(r.data.rankings || []);
      setTotalStakers(r.data.total_stakers || 0);
      setCurrentUserRank(r.data.current_user_rank || null);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch rankings:', err);
      setError('Unable to load waiting list');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings, profileVersion]);

  // Defensive refetch: when walletAddress transitions from falsy → truthy,
  // force a refetch to get the current user's rank highlight.
  const prevAddressRef = useRef(walletAddress);
  useEffect(() => {
    if (walletAddress && !prevAddressRef.current) {
      fetchRankings();
    }
    prevAddressRef.current = walletAddress;
  }, [walletAddress, fetchRankings]);

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

  const cols = '36px 1fr 70px 80px 80px';

  return (
    <div data-testid="waiting-list">
      {/* Summary bar */}
      <div className="term-panel p-3 mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-2">
          <ListNumbers size={16} weight="bold" style={{ color: '#00FFCC' }} />
          <span className="hud-value" style={{ fontSize: '0.78rem' }}>CITIZENSHIP WAITING LIST</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentUserRank && (
            <span className="mono" style={{ color: '#FFD700', fontSize: '0.7rem' }}>
              YOUR RANK: #{currentUserRank}
            </span>
          )}
          <span className="mono" style={{ color: 'rgba(0,255,204,0.6)', fontSize: '0.7rem' }}>
            {totalStakers} REGISTERED APPLICANTS
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="cp-panel cp-corner-cuts" style={{ overflow: 'hidden' }}>
        <div
          className="grid gap-2 p-2 px-3"
          style={{
            gridTemplateColumns: cols,
            borderBottom: '1px solid rgba(0,255,204,0.12)',
            background: 'rgba(0,255,204,0.03)',
          }}
        >
          <span className="hud-label text-center" style={{ fontSize: '0.58rem' }}>#</span>
          <span className="hud-label" style={{ fontSize: '0.58rem' }}>APPLICANT</span>
          <span className="hud-label text-center" style={{ fontSize: '0.58rem' }}>CRED</span>
          <span className="hud-label text-center" style={{ fontSize: '0.58rem' }}>ACCRUAL</span>
          <span className="hud-label text-right" style={{ fontSize: '0.58rem' }}>CREDITS</span>
        </div>

        <div style={{ overflowY: 'auto' }}>
          {rankings.map((entry, idx) => {
            const rank = idx + 1;
            const isTop3 = rank <= 3;
            const isCurrentUser = currentUserRank === rank;

            return (
              <div
                key={idx}
                className="grid gap-2 p-2 px-3"
                style={{
                  gridTemplateColumns: cols,
                  borderBottom: '1px solid rgba(0,255,204,0.06)',
                  background: isCurrentUser
                    ? 'rgba(255,215,0,0.08)'
                    : idx % 2 === 0 ? 'transparent' : 'rgba(0,255,204,0.02)',
                  borderLeft: isCurrentUser ? '3px solid #FFD700' : '3px solid transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isCurrentUser) e.currentTarget.style.background = 'rgba(0,255,204,0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isCurrentUser) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,255,204,0.02)';
                }}
              >
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
                      color: isCurrentUser ? '#FFD700' : 'rgba(0,255,204,0.5)',
                      fontSize: '0.7rem',
                      fontWeight: isCurrentUser ? 700 : 400,
                    }}>
                      {rank}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="flex items-center min-w-0">
                  <span className="mono truncate" style={{
                    color: isCurrentUser ? '#FFD700' : isTop3 ? '#fff' : 'rgba(0,255,204,0.7)',
                    fontSize: '0.7rem',
                    fontWeight: isCurrentUser ? 600 : 400,
                  }}>
                    {entry.display_name || entry.display_address}
                    {isCurrentUser && <span style={{ marginLeft: 6, fontSize: '0.55rem', color: '#FFD700' }}>◀ YOU</span>}
                  </span>
                </div>

                {/* Credential count */}
                <div className="flex items-center justify-center gap-1">
                  <Cube size={9} weight="bold" style={{ color: 'rgba(0,255,204,0.5)' }} />
                  <span className="mono" style={{ color: '#fff', fontSize: '0.7rem' }}>{entry.credential_count}</span>
                </div>

                {/* Accrual rate */}
                <div className="flex items-center justify-center gap-1">
                  <Lightning size={9} weight="fill" style={{ color: '#00FF88' }} />
                  <span className="mono" style={{ color: '#00FF88', fontSize: '0.7rem' }}>
                    {(entry.credential_count * (entry.multiplier || 1)).toFixed(1)}
                  </span>
                </div>

                {/* Credits */}
                <div className="flex items-center justify-end gap-1">
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
