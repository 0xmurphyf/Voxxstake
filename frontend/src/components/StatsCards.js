import React from 'react';
import { Cube, Lightning, Trophy, Clock } from '@phosphor-icons/react';

export function StatsCards({ stats }) {
  const nftCount = stats?.nft_count || 0;
  const multiplier = stats?.holding_multiplier || 1.0;
  const pointsPerHour = (nftCount * multiplier).toFixed(1);

  const cards = [
    {
      title: 'Active Stakes',
      value: stats?.total_active || 0,
      icon: Lightning,
      accent: 'cyan',
      testId: 'stat-active',
    },
    {
      title: 'Lore Points',
      value: (stats?.total_lore_points || 0).toFixed(0),
      icon: Trophy,
      accent: 'purple',
      testId: 'stat-lore-points',
    },
    {
      title: 'NFTs Held',
      value: nftCount,
      icon: Cube,
      accent: 'cyan',
      testId: 'stat-nft-count',
    },
    {
      title: `Rate (${multiplier.toFixed(1)}x)`,
      value: `${pointsPerHour}/h`,
      icon: Clock,
      accent: 'purple',
      testId: 'stat-rate',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8" data-testid="stats-cards">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const isAlt = card.accent === 'cyan';
        return (
          <div
            key={idx}
            className={`stats-card ${isAlt ? 'stats-card-cyan' : ''} cp-corner-cuts p-4 sm:p-5`}
            data-testid={card.testId}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 flex items-center justify-center cp-corner-cuts bg-gradient-to-br ${isAlt ? 'from-[#00FFE5] to-[#00CCB8]' : 'from-[#B026FF] to-[#7B00CC]'}`}>
                <Icon size={18} weight="bold" className={isAlt ? 'text-[#08020F]' : 'text-white'} />
              </div>
            </div>
            <p className="hud-label mb-1">{card.title}</p>
            <p className="text-2xl sm:text-3xl hud-value text-white">
              {card.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
