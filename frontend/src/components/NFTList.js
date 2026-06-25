import React, { useState } from 'react';
import { useVoxxNFTs } from '../hooks/useVoxxNFTs';
import { useStaking } from '../hooks/useStaking';
import { Cube, Lightning, CheckCircle } from '@phosphor-icons/react';

export function NFTList({ authToken }) {
  const { nfts, loading } = useVoxxNFTs(authToken);
  const { stakeNFT, positions } = useStaking(authToken);
  const [stakingId, setStakingId] = useState(null);

  const handleStake = async (objectId) => {
    setStakingId(objectId);
    try {
      await stakeNFT(objectId);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to stake NFT');
    } finally {
      setStakingId(null);
    }
  };

  const isStaked = (objectId) => {
    return positions.some(p => p.object_id === objectId && p.status === 'staked');
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="nft-list-loading">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-64 rounded-sm" />
        ))}
      </div>
    );
  }

  if (!nfts || nfts.length === 0) {
    return (
      <div className="glass-effect rounded-sm p-12 text-center" data-testid="no-nfts-message">
        <Cube size={64} weight="duotone" className="mx-auto mb-4 text-[#3898FF]" />
        <h3 className="text-2xl font-black mb-2" style={{ fontFamily: 'Unbounded, sans-serif' }}>
          NO VOXX NFTS FOUND
        </h3>
        <p className="text-[#8E9BAE]">
          You don't own any VOXX NFTs eligible for staking.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="nft-list">
      {nfts.map((nft) => {
        const objectId = nft.data?.objectId;
        const staked = isStaked(objectId);
        
        return (
          <div
            key={objectId}
            className="card-nft rounded-sm p-6 flex flex-col"
            data-testid={`nft-card-${objectId}`}
          >
            <div className="w-full aspect-square bg-gradient-to-br from-[#3898FF]/20 to-[#00F0FF]/20 rounded-sm mb-4 flex items-center justify-center relative overflow-hidden">
              <img
                src="https://images.pexels.com/photos/9203122/pexels-photo-9203122.jpeg?auto=compress&cs=tinysrgb&w=400"
                alt="VOXX NFT"
                className="w-full h-full object-cover opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0D111A] to-transparent" />
              {staked && (
                <div className="absolute top-3 right-3">
                  <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#00FF9D]/20 border border-[#00FF9D]/40">
                    <CheckCircle size={14} weight="fill" className="text-[#00FF9D]" />
                    <span className="text-xs font-bold text-[#00FF9D]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                      STAKED
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <h3 className="text-lg font-black mb-2 tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
              VOXX NFT #{objectId?.slice(-6)}
            </h3>
            <p className="text-xs text-[#8E9BAE] mb-4 font-mono break-all">
              {objectId?.slice(0, 20)}...{objectId?.slice(-10)}
            </p>
            
            <div className="mt-auto">
              <button
                onClick={() => handleStake(objectId)}
                disabled={stakingId === objectId || staked}
                className="w-full px-4 py-3 rounded-sm bg-gradient-to-r from-[#3898FF] to-[#00F0FF] text-white font-bold uppercase text-sm flex items-center justify-center gap-2 hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`stake-button-${objectId}`}
                style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
              >
                {stakingId === objectId ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Staking...
                  </>
                ) : staked ? (
                  <>Already Staked</>
                ) : (
                  <>
                    <Lightning size={16} weight="fill" />
                    Stake NFT
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
