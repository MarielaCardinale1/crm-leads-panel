import React, { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { CorridaProspector, fetchProspector, runProspector } from '../services/leadService';

interface Props {
  onLoaded: () => void;
  onToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

/** Agente 8 — Prospector. Corre solo los lunes; este botón es para buscar a mano (1 vez por día). */
export const ProspectorCard: React.FC<Props> = ({ onLoaded, onToast }) => {
  const [ultima, setUltima] = useState<CorridaProspector | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProspector().then((r) => setUltima(r.ultimaCorrida)).catch(() => setUltima(null));
  }, []);

  const buscar = async () => {
    if (!window.confirm('¿Buscar negocios nuevos ahora? Tarda 1-3 minutos.')) return;
    setBusy(true);
    try {
      const r = await runProspector();
      setUltima(r);
      onToast(r.cargados ? `${r.cargados} leads nuevos cargados` : 'No encontró negocios nuevos esta vez', r.cargados ? 'success' : 'info');
      onLoaded();
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const prio = ultima ? Object.entries(ultima.porPrioridad || {}).sort().map(([k, v]) => `${v} ${k}`).join(' · ') : '';

  return (
    <div className="bg-white dark:bg-[#1C1814] border border-[#E0E0E0] dark:border-[#2E2721] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <Search className="w-5 h-5 text-[#E8610A] shrink-0" />
      <div className="flex-1 text-xs sm:text-sm text-[#1a1a1a] dark:text-[#F5EBE1]">
        <strong className="font-heading">Prospector</strong>{' '}
        <span className="text-[#666] dark:text-[#99897A]">· busca solo los lunes en Google Maps y carga hasta 20 negocios, 5 por día.</span>
        {ultima && (
          <p className="text-[11px] text-[#666] dark:text-[#99897A] mt-1">
            Última: {ultima.fecha} · {ultima.cargados} cargados{prio ? ` (${prio})` : ''} · {ultima.conInstagram} con Instagram · de {ultima.encontrados} vistos en Maps
          </p>
        )}
      </div>
      <button onClick={buscar} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#E8610A] text-white hover:bg-[#cf5608] disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {busy ? 'Buscando…' : 'Buscar leads ahora'}
      </button>
    </div>
  );
};
