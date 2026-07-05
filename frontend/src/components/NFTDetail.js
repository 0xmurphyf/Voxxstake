import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNFTDetail } from '../hooks/useNFTDetail';
import { ArrowLeft, Lightning, Pause, Trophy, Clock, Cube, Link } from '@phosphor-icons/react';

const VOXX_PLACEHOLDER = 'https://images.pexels.com/photos/9203122/pexels-photo-9203122.jpeg?auto=compress&cs=tinysrgb&w=800';

function formatDuration(days) {
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return `${(hours * 60).toFixed(1)} min`;
    return `${hours.toFixed(2)} hrs`;
  }
  return `${days.toFixed(3)} days`;
}

export function NFTDetail({ authToken }) {
  const { objectId } = useParams();
  const navigate = useNavigate();
  const { detail, loading, error } = useNFTDetail(objectId, authToken);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-12 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="skeleton aspect-square" />
          <div className="space-y-4">
            <div className="skeleton h-10" />
            <div className="skeleton h-32" />
            <div className="skeleton h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cp-alert cp-corner-cuts p-6" data-testid="nft-detail-error">
        <p className="hud-label mb-1">ERROR</p>
        <p className="text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="cp-btn-ghost px-4 py-2 mt-4 text-xs">
          BACK TO DASHBOARD
        </button>
      </div>
    );
  }

  if (!detail) return null;

  const { metadata, position } = detail;
  const isActive = position?.status === 'active';
  const imgSrc = metadata.image_url || VOXX_PLACEHOLDER;
  const mult = position?.holding_multiplier || 1.0;

  const attributes = metadata.attributes || {};
  const attrEntries = Object.entries(attributes).filter(([_, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div data-testid="nft-detail-page">
      <button
        onClick={() => navigate(-1)}
        className="cp-btn-ghost px-4 py-2 mb-6 text-xs flex items-center gap-2"
        data-testid="back-button"
      >
        <ArrowLeft size={14} weight="bold" />
        BACK
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* NFT Image */}
        <div className="cp-panel cp-corner-cuts cp-glow-purple p-2 sm:p-3">
          <div className="nft-image-wrap aspect-square">
            <img
              src={imgSrc}
              alt={metadata.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = VOXX_PLACEHOLDER; }}
              data-testid="nft-detail-image"
            />
          </div>
        </div>

        {/* NFT Info */}
        <div className="space-y-4">
          <div>
            <p className="hud-label mb-2">VOXX INC. // NFT</p>
            <h1 className="text-3xl sm:text-4xl hud-value glitch mb-2" data-testid="nft-detail-name">
              {metadata.name}
            </h1>
            <p className="mono text-xs text-[#8E78A8] break-all">
              {metadata.object_id}
            </p>
          </div>

          {position && (
            <div className="cp-panel cp-corner-cuts p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <span className={`status-badge ${isActive ? 'status-active' : 'status-paused'}`} data-testid="nft-detail-status">
                  {isActive ? (
                    <span className="flex items-center gap-1">
                      <Lightning size={11} weight="fill" /> AUTO-STAKED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Pause size={11} weight="fill" /> PAUSED
                    </span>
                  )}
                </span>
                <span className="status-badge badge-active" data-testid="nft-detail-multiplier">
                  {mult.toFixed(1)}x MULTIPLIER
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <Clock size={12} className="text-[#8E78A8]" />
                    <p className="hud-label">Total Staked</p>
                  </div>
                  <p className="hud-value text-white text-lg" data-testid="nft-detail-duration">
                    {formatDuration(position.duration_days)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <Trophy size={12} className="text-[#00FFE5]" />
                    <p className="hud-label">Lore Points</p>
                  </div>
                  <p className="hud-value text-[#00FFE5] text-lg" data-testid="nft-detail-points">
                    {position.lore_points.toFixed(0)}
                  </p>
                </div>
              </div>

              {!isActive && (
                <div className="mt-4 pt-4 border-t border-[#FF003C]/30">
                  <p className="text-xs text-[#FF5577] flex items-start gap-2">
                    <Pause size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
                    NFT not detected in wallet. Points preserved — staking will auto-resume when NFT returns.
                  </p>
                </div>
              )}
            </div>
          )}

          {metadata.description && (
            <div className="cp-panel cp-corner-cuts p-4 sm:p-5">
              <p className="hud-label mb-2">LORE FRAGMENT</p>
              <p className="text-sm text-[#E5D9F2] leading-relaxed" data-testid="nft-detail-description">
                {metadata.description}
              </p>
            </div>
          )}

          {metadata.project_url && (
            <a
              href={metadata.project_url}
              target="_blank"
              rel="noreferrer"
              className="cp-btn-ghost px-4 py-2 text-xs inline-flex items-center gap-2"
              data-testid="nft-detail-project-link"
            >
              <Link size={14} weight="bold" />
              PROJECT SITE
            </a>
          )}
        </div>
      </div>

      {/* Attributes Grid */}
      {attrEntries.length > 0 && (
        <div className="cp-panel cp-corner-cuts p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cube size={18} weight="duotone" className="text-[#B026FF]" />
            <h2 className="text-lg sm:text-xl hud-value">METADATA</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="nft-attributes">
            {attrEntries.map(([key, value]) => (
              <div key={key} className="cp-panel-cyan p-3 cp-corner-cuts">
                <p className="hud-label mb-1 truncate">{key}</p>
                <p className="mono text-sm text-[#E5D9F2] break-words">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
