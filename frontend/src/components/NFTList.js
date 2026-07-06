import React from 'react';
import { Cube, Pause, Lightning } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const VOXX_PLACEHOLDER = 'https://images.pexels.com/photos/9203122/pexels-photo-9203122.jpeg?auto=compress&cs=tinysrgb&w=300';

/** Get cached image URL through backend proxy */
function getImageUrl(objectId) {
  return `${BACKEND_URL}/api/image/${objectId}`;
}

function formatDuration(days) {
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
    return `${hours.toFixed(1)}h`;
  }
  return `${days.toFixed(1)}d`;
}

export function NFTList({ positions, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="nft-list-loading">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-40" />
        ))}
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="term-panel p-10 text-center" data-testid="no-nfts-message">
        <Cube size={48} weight="duotone" style={{ color: 'rgba(0,255,204,0.2)', margin: '0 auto 12px', display: 'block' }} />
        <p className="hud-label mb-2">SCAN RESULT</p>
        <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: 8 }}>NO CREDENTIALS DETECTED</h3>
        <p style={{ fontSize: '0.78rem', color: 'rgba(0,255,204,0.5)' }}>
          Your wallet holds no Genesis NFT credentials. Acquire one to register for Neoterra citizenship.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="nft-list">
      {positions.map((position) => {
        const isActive = position.status === 'active';
        const imgSrc = getImageUrl(position.object_id);

        return (
          <div
            key={position.object_id}
            className="term-panel"
            style={{ padding: 0, overflow: 'hidden' }}
            data-testid={`nft-card-${position.object_id}`}
          >
            {/* Image */}
            <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: 'rgba(0,15,20,0.8)' }}>
              <img
                src={imgSrc}
                alt={position.name || 'VOXX'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => { e.target.src = VOXX_PLACEHOLDER; }}
              />
              {/* Status badge */}
              <div style={{ position: 'absolute', top: 6, left: 6 }}>
                <span className={`status-badge ${isActive ? 'badge-active' : 'badge-paused'}`} style={{ fontSize: '0.55rem', padding: '1px 6px' }}
                  data-testid={`status-${position.object_id}`}>
                  {isActive ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Lightning size={8} weight="fill" />
                      REGISTERED
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Pause size={8} weight="fill" />
                      REVOKED
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: '8px 10px' }}>
              <p className="mono truncate" style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 600, marginBottom: 2 }}
                data-testid={`nft-name-${position.object_id}`}>
                {position.name || `VOXX #${position.object_id.slice(-6)}`}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ color: 'rgba(0,255,204,0.5)', fontSize: '0.62rem' }}
                  data-testid={`duration-${position.object_id}`}>
                  {formatDuration(position.duration_days)}
                </span>
                <span className="mono" style={{ color: '#00FF88', fontSize: '0.65rem', fontWeight: 600 }}
                  data-testid={`points-${position.object_id}`}>
                  {position.lore_points.toFixed(0)} CR
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
