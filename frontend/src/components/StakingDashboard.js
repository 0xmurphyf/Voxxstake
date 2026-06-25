import React, { useState } from 'react';
import { useStaking } from '../hooks/useStaking';
import { Clock, Lightning, Trophy, ArrowCounterClockwise } from '@phosphor-icons/react';

export function StakingDashboard({ authToken }) {
  const { positions, unstakeNFT } = useStaking(authToken);
  const [unstakingId, setUnstakingId] = useState(null);

  const handleUnstake = async (objectId) => {
    setUnstakingId(objectId);
    try {
      const result = await unstakeNFT(objectId);
      alert(`Successfully unstaked! You earned ${result.points_earned.toFixed(2)} points.`);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to unstake NFT');
    } finally {
      setUnstakingId(null);
    }
  };

  const getTierClass = (tier) => {
    const tierLower = tier.toLowerCase();
    return `tier-${tierLower}`;
  };

  const formatDuration = (days) => {
    if (days < 1) return `${(days * 24).toFixed(1)}h`;
    return `${days.toFixed(1)}d`;
  };

  const activePositions = positions.filter(p => p.status === 'staked');
  const completedPositions = positions.filter(p => p.status === 'unstaked');

  return (
    <div className="space-y-6" data-testid="staking-dashboard">
      {/* Active Stakes */}
      <div>
        <h2 className="text-2xl font-black mb-4 tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
          ACTIVE STAKES ({activePositions.length})
        </h2>
        {activePositions.length === 0 ? (
          <div className="glass-effect rounded-sm p-8 text-center" data-testid="no-active-stakes">
            <Lightning size={48} weight="duotone" className="mx-auto mb-3 text-[#8E9BAE]" />
            <p className="text-[#8E9BAE]">No active stakes. Stake your VOXX NFTs to earn points!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activePositions.map((position) => (
              <div
                key={position.object_id}
                className="glass-effect glow-border rounded-sm p-6"
                data-testid={`active-stake-${position.object_id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-black mb-1" style={{ fontFamily: 'Unbounded, sans-serif' }}>
                      VOXX #{position.object_id.slice(-6)}
                    </h3>
                    <p className="text-xs text-[#8E9BAE] font-mono">
                      {position.object_id.slice(0, 16)}...{position.object_id.slice(-8)}
                    </p>
                  </div>
                  <span className={`tier-badge ${getTierClass(position.tier)}`} data-testid={`tier-badge-${position.object_id}`}>
                    {position.tier}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={14} className="text-[#8E9BAE]" />
                      <p className="text-xs text-[#8E9BAE] uppercase tracking-wider">Duration</p>
                    </div>
                    <p className="text-lg font-bold text-white" data-testid={`duration-${position.object_id}`}>
                      {formatDuration(position.duration_days)}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy size={14} className="text-[#00FF9D]" />
                      <p className="text-xs text-[#8E9BAE] uppercase tracking-wider">Projected</p>
                    </div>
                    <p className="text-lg font-bold text-[#00FF9D]" data-testid={`projected-points-${position.object_id}`}>
                      {(position.duration_days * 10 * (position.tier === 'Bronze' ? 1 : position.tier === 'Silver' ? 1.5 : position.tier === 'Gold' ? 2 : 3)).toFixed(1)} pts
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleUnstake(position.object_id)}
                  disabled={unstakingId === position.object_id}
                  className="w-full px-4 py-3 rounded-sm border border-[#FF3B30] text-[#FF3B30] font-bold uppercase text-sm flex items-center justify-center gap-2 hover:bg-[#FF3B30] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`unstake-button-${position.object_id}`}
                  style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
                >
                  {unstakingId === position.object_id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Unstaking...
                    </>
                  ) : (
                    <>
                      <ArrowCounterClockwise size={16} weight="bold" />
                      Unstake
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Stakes */}
      {completedPositions.length > 0 && (
        <div>
          <h2 className="text-2xl font-black mb-4 tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
            COMPLETED STAKES ({completedPositions.length})
          </h2>
          <div className="space-y-3">
            {completedPositions.slice(0, 5).map((position) => (
              <div
                key={position.object_id}
                className="glass-effect rounded-sm p-4 flex items-center justify-between"
                data-testid={`completed-stake-${position.object_id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-[#3898FF]/20 to-[#00F0FF]/20 flex items-center justify-center">
                    <Trophy size={20} weight="fill" className="text-[#00FF9D]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">VOXX #{position.object_id.slice(-6)}</p>
                    <p className="text-xs text-[#8E9BAE]">
                      Staked for {formatDuration(position.duration_days)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-[#00FF9D]" data-testid={`earned-points-${position.object_id}`}>
                    +{position.points_earned.toFixed(2)}
                  </p>
                  <p className="text-xs text-[#8E9BAE] uppercase tracking-wider">Points</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
