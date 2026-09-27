import React from 'react';
import { Inbox, Pencil } from 'lucide-react';
import { ESTADO_LABELS, Lead } from '../types';
import { PriorityBadge } from './PriorityBadge';

interface Props {
  leads: Lead[];
  isLoading: boolean;
  today: string;
  onEdit: (lead: Lead) => void;
}

function fmt(date: string): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export const LeadsTable: React.FC<Props> = ({ leads, isLoading, today, onEdit }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#E8610A] border-t-transparent mb-3"></div>
        <p className="text-sm font-semibold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">Cargando leads…</p>
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl p-12 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FFF3EB] dark:bg-[#2D1C10] border border-[#F5C9A8] dark:border-[#59361B] flex items-center justify-center text-[#E8610A] mb-3">
          <Inbox className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">No hay leads para mostrar</h3>
        <p className="text-xs sm:text-sm text-[#666] dark:text-[#99897A] font-ui mt-1">Cargá uno con “Nuevo lead” o cambiá los filtros.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm font-ui">
          <thead className="bg-[#FFF8F0] dark:bg-[#231E19] text-[#666] dark:text-[#99897A] text-[11px] uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-semibold">Lead</th>
              <th className="px-4 py-3 font-semibold">Prioridad</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">Estado</th>
              <th className="px-4 py-3 font-semibold hidden lg:table-cell">Motivo</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Próxima acción</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">Últ. contacto</th>
              <th className="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0E4D8] dark:divide-[#2E2721]">
            {leads.map((l) => {
              const vencida = l.fechaProximaAccion && l.fechaProximaAccion < today;
              return (
                <tr key={l.id} onClick={() => onEdit(l)} className="hover:bg-[#FFF8F0] dark:hover:bg-[#231E19] cursor-pointer align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#1a1a1a] dark:text-[#F5EBE1]">{l.nombre || '—'}</div>
                    <div className="text-[#666] dark:text-[#99897A]">{l.negocio}{l.oferta ? ` · ${l.oferta}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <PriorityBadge prioridad={l.scoring.prioridad} />
                    {!l.scoring.cerrado && <span className="ml-1.5 text-[11px] text-[#999]">{l.scoring.score}</span>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">{ESTADO_LABELS[l.estado] || l.estado}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-[#555] dark:text-[#C8B9A9] max-w-xs">
                    {l.scoring.motivos.join(', ') || '—'}
                    {l.scoring.faltantes.length > 0 && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">Faltan: {l.scoring.faltantes.join(', ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div>{l.proximaAccion || '—'}</div>
                    {l.fechaProximaAccion && (
                      <div className={`text-[11px] ${vencida ? 'text-rose-600 font-semibold' : 'text-[#999]'}`}>
                        {vencida ? 'Vencida · ' : ''}{fmt(l.fechaProximaAccion)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">{fmt(l.ultimaInteraccion)}</td>
                  <td className="px-2 py-3 text-[#999]"><Pencil className="w-3.5 h-3.5" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
