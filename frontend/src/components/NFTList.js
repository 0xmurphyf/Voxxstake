import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cube, Pause, Lightning, ArrowRight } from '@phosphor-icons/react';

const VOXX_PLACEHOLDER = 'https://images.pexels.com/photos/9203122/pexels-photo-9203122.jpeg?auto=compress&cs=tinysrgb&w=600';

function formatDuration(days) {
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
    return `${hours.toFixed(1)}h`;
  }
  return `${days.toFixed(2)}d`;
}

function getTierClass(tier) {
  return `tier-${(tier || 'bronze').toLowerCase()}`;
}

export function NFTList({ positions, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="nft-list-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-72 cp-corner-cuts" />
        ))}
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="cp-panel cp-corner-cuts p-10 sm:p-12 text-center" data-testid="no-nfts-message">
        <Cube size={56} weight="duotone" className="mx-auto mb-4 text-[#B026FF]" />
        <p className="hud-label mb-2">SCAN RESULT</p>
        <h3 className="text-xl sm:text-2xl hud-value mb-2">NO VOXX NFTS DETECTED</h3>
        <p className="text-sm text-[#8E78A8]">
          Your wallet currently holds no VOXX NFTs. Acquire one to begin auto-staking.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5" data-testid="nft-list">
      {positions.map((position) => {
        const isActive = position.status === 'active';
        const imgSrc = position.image_url || VOXX_PLACEHOLDER;

        return (
          <div
            key={position.object_id}
            className="nft-card p-4 sm:p-5 flex flex-col cursor-pointer"
            data-testid={`nft-card-${position.object_id}`}
            onClick={() => navigate(`/nft/${position.object_id}`)}
          >
            <div className="nft-image-wrap aspect-square mb-4">
              <img
                src={imgSrc}
                alt={position.name || 'VOXX'}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.src = VOXX_PLACEHOLDER; }}
              />
              <div className="absolute top-3 left-3 z-10">
                <span className={`status-badge ${isActive ? 'status-active' : 'status-paused'}`} data-testid={`status-${position.object_id}`}>
                  {isActive ? (
                    <span className="flex items-center gap-1">
                      <Lightning size={10} weight="fill" />
                      AUTO-STAKED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Pause size={10} weight="fill" />
                      PAUSED
                    </span>
                  )}
                </span>
              </div>
              <div className="absolute top-3 right-3 z-10">
                <span className={`status-badge ${getTierClass(position.tier)}`} data-testid={`tier-${position.object_id}`}>
                  {position.tier}
                </span>
              </div>
            </div>

            <h3 className="hud-value text-base sm:text-lg mb-1 truncate" data-testid={`nft-name-${position.object_id}`}>
              {position.name || `VOXX #${position.object_id.slice(-6)}`}
            </h3>
            <p className="mono text-xs text-[#8E78A8] mb-4 truncate">
              {position.object_id.slice(0, 14)}...{position.object_id.slice(-6)}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4 mt-auto">
              <div>
                <p className="hud-label">Duration</p>
                <p className="hud-value text-white text-sm" data-testid={`duration-${position.object_id}`}>
                  {formatDuration(position.duration_days)}
                </p>
              </div>
              <div>
                <p className="hud-label">Lore Points</p>
                <p className="hud-value text-[#00FFE5] text-sm" data-testid={`points-${position.object_id}`}>
                  {position.lore_points.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#B026FF]/20">
              <span className="hud-label">View Details</span>
              <ArrowRight size={16} weight="bold" className="text-[#00FFE5]" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
