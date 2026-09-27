import React from 'react';
import { Prioridad } from '../types';

const STYLES: Record<Prioridad | 'Cerrado', string> = {
  Alta: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
  Media: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  Baja: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700',
  Cerrado: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
};

export const PriorityBadge: React.FC<{ prioridad: Prioridad | null }> = ({ prioridad }) => {
  const key = prioridad || 'Cerrado';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${STYLES[key]}`}>
      {key}
    </span>
  );
};
