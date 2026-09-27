import React from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { Lead } from '../types';
import { PriorityBadge } from './PriorityBadge';

interface Props {
  leads: Lead[];
  onOpen: (lead: Lead) => void;
}

const ORDER = { Alta: 0, Media: 1, Baja: 2 } as const;

/**
 * Vista "Oportunidades de hoy". Misma lógica que el microagente leadScoring:
 * el puntaje ya viene calculado por el servidor, acá solo se ordena y muestra.
 */
export const OpportunitiesPanel: React.FC<Props> = ({ leads, onOpen }) => {
  const abiertos = leads
    .filter((l) => !l.scoring.cerrado && l.scoring.prioridad)
    .sort((a, b) => ORDER[a.scoring.prioridad!] - ORDER[b.scoring.prioridad!] || b.scoring.score - a.scoring.score);
  const relevantes = abiertos.filter((l) => l.scoring.prioridad !== 'Baja');

  return (
    <div className="bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl shadow-xs overflow-hidden">
      <div className="px-4 py-3.5 sm:px-6 bg-[#FFF8F0]/80 dark:bg-[#231E19] border-b border-[#F5C9A8]/40 dark:border-[#2E2721] flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#E8610A]" />
        <h2 className="text-sm sm:text-base font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">Oportunidades de hoy</h2>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#E8610A] text-white">{relevantes.length}</span>
      </div>

      {!abiertos.length ? (
        <p className="px-6 py-6 text-sm text-[#666] dark:text-[#99897A] font-ui">No hay leads abiertos cargados.</p>
      ) : !relevantes.length ? (
        <p className="px-6 py-6 text-sm text-[#666] dark:text-[#99897A] font-ui">
          No hay oportunidades relevantes hoy ({abiertos.length} lead(s) en prioridad baja).
        </p>
      ) : (
        <ol className="divide-y divide-[#F5C9A8]/30 dark:divide-[#2E2721]">
          {relevantes.map((l, i) => (
            <li key={l.id}>
              <button type="button" onClick={() => onOpen(l)} className="w-full text-left px-4 sm:px-6 py-3 hover:bg-[#FFF8F0] dark:hover:bg-[#231E19] cursor-pointer">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#999] w-5">{i + 1}.</span>
                  <span className="text-sm font-semibold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">
                    {[l.nombre, l.negocio].filter(Boolean).join(' / ') || '(sin nombre)'}
                  </span>
                  <PriorityBadge prioridad={l.scoring.prioridad} />
                  <span className="text-[11px] text-[#999] font-ui">{l.scoring.score} pts</span>
                </div>
                <p className="text-xs text-[#555] dark:text-[#C8B9A9] font-ui mt-1 pl-7">
                  Motivo: {l.scoring.motivos.join(', ') || 'sin señales'}.
                </p>
                {l.scoring.faltantes.length > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 font-ui mt-0.5 pl-7 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Faltan datos: {l.scoring.faltantes.join(', ')}.
                  </p>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
