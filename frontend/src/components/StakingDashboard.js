import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause, Lightning, Warning, Trophy, Clock } from '@phosphor-icons/react';

function formatDuration(days) {
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return `${(hours * 60).toFixed(0)} min`;
    return `${hours.toFixed(1)} hrs`;
  }
  return `${days.toFixed(2)} days`;
}

export function StakingDashboard({ positions, sellAlerts }) {
  const navigate = useNavigate();
  const activePositions = positions.filter((p) => p.status === 'active');
  const revokedPositions = positions.filter((p) => p.status === 'paused');

  return (
    <div className="space-y-6" data-testid="staking-dashboard">
      {/* Credential Revocation Alerts */}
      {sellAlerts && sellAlerts.length > 0 && (
        <div className="cp-alert cp-corner-cuts p-4 sm:p-5" data-testid="sell-alerts">
          <div className="flex items-start gap-3">
            <Warning size={24} weight="fill" className="text-[#FF003C] flex-shrink-0 mt-1" />
            <div className="flex-1">
              <p className="hud-label text-[#FF5577] mb-1">CREDENTIAL REVOKED</p>
              <p className="text-sm text-[#FFB3C0]">
                {sellAlerts.length} credential{sellAlerts.length > 1 ? 's' : ''} no longer in your wallet. Citizenship standing paused — your credits are preserved. If the credential returns, registration will auto-resume.
              </p>
              <p className="mono text-xs text-[#FF5577] mt-2">
                {sellAlerts.slice(0, 3).join(' • ')}
                {sellAlerts.length > 3 && ` • +${sellAlerts.length - 3} more`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Registrations */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Lightning size={20} weight="fill" className="text-[#00FF9D]" />
            <h2 className="text-xl sm:text-2xl hud-value">ACTIVE REGISTRATIONS</h2>
            <span className="status-badge status-active">{activePositions.length}</span>
          </div>
        </div>
        {activePositions.length === 0 ? (
          <div className="cp-panel cp-corner-cuts p-6 sm:p-8 text-center" data-testid="no-active-stakes">
            <p className="hud-label mb-2">STATUS</p>
            <p className="text-sm text-[#8E78A8]">
              No active citizenship registrations. Holding Genesis NFTs auto-registers you — try refreshing or connect a wallet with credentials.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activePositions.map((position) => {
              const mult = position.holding_multiplier || 1.0;
              return (
                <div
                  key={position.object_id}
                  className="cp-panel cp-corner-cuts cp-glow-purple p-5 cursor-pointer hover:cp-glow-cyan transition-all"
                  onClick={() => navigate(`/nft/${position.object_id}`)}
                  data-testid={`active-stake-${position.object_id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="hud-value text-base sm:text-lg truncate" data-testid={`active-name-${position.object_id}`}>
                        {position.name || `VOXX #${position.object_id.slice(-6)}`}
                      </h3>
                      <p className="mono text-xs text-[#8E78A8] truncate">
                        {position.object_id.slice(0, 14)}...{position.object_id.slice(-6)}
                      </p>
                    </div>
                    <span className="status-badge badge-active">{mult.toFixed(1)}x</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#B026FF]/20">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Clock size={12} className="text-[#8E78A8]" />
                        <p className="hud-label">Registered</p>
                      </div>
                      <p className="hud-value text-white">{formatDuration(position.duration_days)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <Trophy size={12} className="text-[#00FFE5]" />
                        <p className="hud-label">Credits</p>
                      </div>
                      <p className="hud-value text-[#00FFE5]" data-testid={`active-points-${position.object_id}`}>
                        {position.lore_points.toFixed(0)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Revoked Registrations */}
      {revokedPositions.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Pause size={20} weight="fill" className="text-[#FF5577]" />
            <h2 className="text-xl sm:text-2xl hud-value">REVOKED</h2>
            <span className="status-badge status-paused">{revokedPositions.length}</span>
          </div>
          <div className="space-y-2">
            {revokedPositions.map((position) => (
              <div
                key={position.object_id}
                className="cp-panel-cyan p-4 flex items-center justify-between cursor-pointer hover:cp-glow-cyan transition-all"
                onClick={() => navigate(`/nft/${position.object_id}`)}
                data-testid={`paused-stake-${position.object_id}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Pause size={18} weight="fill" className="text-[#FF5577] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="hud-value text-white text-sm truncate">
                      {position.name || `VOXX #${position.object_id.slice(-6)}`}
                    </p>
                    <p className="mono text-xs text-[#8E78A8]">
                      Held: {formatDuration(position.duration_days)}
                    </p>
                  </div>
                </div>
                <div className="text-right ml-3">
                  <p className="hud-value text-[#00FFE5] text-lg" data-testid={`paused-points-${position.object_id}`}>
                    {position.lore_points.toFixed(0)}
                  </p>
                  <p className="hud-label">CREDITS</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
