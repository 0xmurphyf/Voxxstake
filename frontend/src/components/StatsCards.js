import React from 'react';
import { Cube, ArrowUp, Clock, Trophy } from '@phosphor-icons/react';

export function StatsCards({ stats, positions }) {
  const activePositions = positions.filter(p => p.status === 'staked');
  const avgDuration = activePositions.length > 0
    ? activePositions.reduce((sum, p) => sum + p.duration_days, 0) / activePositions.length
    : 0;

  const cards = [
    {
      title: 'Total Staked',
      value: stats?.total_staked || 0,
      icon: Cube,
      color: 'from-[#3898FF] to-[#00F0FF]',
      testId: 'total-staked-stat'
    },
    {
      title: 'Total Points',
      value: (stats?.total_points || 0).toFixed(2),
      icon: Trophy,
      color: 'from-[#00FF9D] to-[#00D4AA]',
      testId: 'total-points-stat'
    },
    {
      title: 'Avg Duration',
      value: `${avgDuration.toFixed(1)}d`,
      icon: Clock,
      color: 'from-[#FFB800] to-[#FF8C00]',
      testId: 'avg-duration-stat'
    },
    {
      title: 'Rate',
      value: '10 pts/day',
      icon: ArrowUp,
      color: 'from-[#FF3B30] to-[#FF1744]',
      testId: 'rate-stat'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-testid="stats-cards">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="glass-effect rounded-sm p-6 glow-border"
            data-testid={card.testId}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-sm bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                <Icon size={20} weight="bold" className="text-white" />
              </div>
            </div>
            <div>
              <p className="text-xs text-[#8E9BAE] uppercase tracking-[0.2em] mb-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                {card.title}
              </p>
              <p className="text-3xl font-black tracking-tight" style={{ fontFamily: 'Unbounded, sans-serif' }}>
                {card.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
