import React from 'react';
import { Search, Download, Plus, X } from 'lucide-react';
import { ESTADO_LABELS, FilterState, LeadEstado } from '../types';

interface Props {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  onExport: () => void;
  onNewLead: () => void;
  filteredCount: number;
  totalCount: number;
}

const selectCls =
  'px-3 py-2 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#1C1814] border border-[#F5C9A8] dark:border-[#3D2E22] text-[#1a1a1a] dark:text-[#F5EBE1] font-ui focus:outline-none focus:ring-2 focus:ring-[#E8610A]/40';

export const FiltersBar: React.FC<Props> = ({ filters, onChange, onReset, onExport, onNewLead, filteredCount, totalCount }) => {
  const active = filters.searchQuery || filters.prioridad !== 'all' || filters.estado !== 'all';
  return (
    <div className="bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col lg:flex-row gap-3 lg:items-center">
      <div className="relative flex-1 min-w-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
        <input
          id="input-search"
          type="search"
          value={filters.searchQuery}
          onChange={(e) => onChange({ searchQuery: e.target.value })}
          placeholder="Buscar por nombre, negocio, oferta o notas…"
          className={`${selectCls} w-full pl-9`}
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Prioridad" value={filters.prioridad} onChange={(e) => onChange({ prioridad: e.target.value as FilterState['prioridad'] })} className={selectCls}>
          <option value="all">Todas las prioridades</option>
          <option value="Alta">Alta</option>
          <option value="Media">Media</option>
          <option value="Baja">Baja</option>
          <option value="cerrados">Cerrados</option>
        </select>
        <select aria-label="Estado" value={filters.estado} onChange={(e) => onChange({ estado: e.target.value as FilterState['estado'] })} className={selectCls}>
          <option value="all">Todos los estados</option>
          {(Object.keys(ESTADO_LABELS) as LeadEstado[]).map((k) => (
            <option key={k} value={k}>{ESTADO_LABELS[k]}</option>
          ))}
        </select>
        {active && (
          <button type="button" onClick={onReset} className="px-2.5 py-2 rounded-lg text-xs font-semibold text-[#666] dark:text-[#99897A] hover:text-[#E8610A] flex items-center gap-1 cursor-pointer">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
        <span className="text-xs text-[#666] dark:text-[#99897A] font-ui px-1">{filteredCount} de {totalCount}</span>
        <button type="button" onClick={onExport} className="px-3 py-2 rounded-lg text-xs font-semibold border border-[#F5C9A8] dark:border-[#3D2E22] text-[#1a1a1a] dark:text-[#F5EBE1] hover:border-[#E8610A] flex items-center gap-1.5 cursor-pointer">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button id="btn-new-lead" type="button" onClick={onNewLead} className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#E8610A] hover:bg-[#C4500A] text-white flex items-center gap-1.5 cursor-pointer shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Nuevo lead
        </button>
      </div>
    </div>
  );
};
