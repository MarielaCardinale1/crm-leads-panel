import React from 'react';
import { Flame, TrendingUp, Snowflake, Users2 } from 'lucide-react';

export interface LeadStats {
  alta: number;
  media: number;
  baja: number;
  abiertos: number;
  cerrados: number;
}

export const StatCards: React.FC<{ stats: LeadStats }> = ({ stats }) => {
  const cards = [
    { id: 'card-alta', title: 'Prioridad alta', count: stats.alta, subtitle: 'Atender hoy', icon: Flame, badge: 'Alta' },
    { id: 'card-media', title: 'Prioridad media', count: stats.media, subtitle: 'Mover esta semana', icon: TrendingUp, badge: 'Media' },
    { id: 'card-baja', title: 'Prioridad baja', count: stats.baja, subtitle: 'Sin señales fuertes', icon: Snowflake, badge: 'Baja' },
    { id: 'card-total', title: 'Leads abiertos', count: stats.abiertos, subtitle: `${stats.cerrados} cerrados`, icon: Users2, badge: 'Total' },
  ];

  return (
    <div id="stat-cards-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            id={card.id}
            className="bg-[#FFF3EB] dark:bg-[#1C1814] border border-[#F5C9A8] dark:border-[#3D2E22] rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs sm:text-sm font-semibold text-[#1a1a1a] dark:text-[#F5EBE1] truncate font-heading">{card.title}</span>
              <div className="w-8 h-8 rounded-lg bg-white/80 dark:bg-[#2D1C10] border border-[#F5C9A8] dark:border-[#59361B] flex items-center justify-center text-[#E8610A] dark:text-[#FFA86B] shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#1a1a1a] dark:text-[#F5EBE1] tracking-tight font-heading">{card.count}</div>
            <div className="mt-2 pt-2 border-t border-[#F5C9A8]/40 dark:border-[#3D2E22] flex items-center justify-between text-[11px] sm:text-xs text-[#666] dark:text-[#99897A] font-ui">
              <span className="truncate pr-1">{card.subtitle}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/70 dark:bg-[#2D1C10] text-[#E8610A] dark:text-[#FFA86B] font-semibold shrink-0 text-[10px]">{card.badge}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
