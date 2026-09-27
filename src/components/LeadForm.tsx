import React, { useEffect, useState } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import { ESTADO_LABELS, LeadEstado, LeadInput } from '../types';

interface Props {
  initial: LeadInput;
  activeOffers: string[];
  today: string;
  onSave: (lead: LeadInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#141210] border border-[#F5C9A8] dark:border-[#3D2E22] text-[#1a1a1a] dark:text-[#F5EBE1] font-ui focus:outline-none focus:ring-2 focus:ring-[#E8610A]/40';
const labelCls = 'block text-xs font-semibold text-[#666] dark:text-[#99897A] mb-1 font-ui';

export const LeadForm: React.FC<Props> = ({ initial, activeOffers, today, onSave, onDelete, onClose }) => {
  const [lead, setLead] = useState<LeadInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<LeadInput>) => setLead((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead.nombre.trim() && !lead.negocio.trim()) {
      setError('Poné al menos nombre o negocio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(lead);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!lead.id || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await onDelete(lead.id);
    } catch (err: any) {
      setError(err.message || 'No se pudo borrar.');
      setSaving(false);
    }
  };

  const check = (key: 'pidioPrecio' | 'pidioDemo' | 'intencionExplicita', label: string) => (
    <label className="flex items-center gap-2 text-sm text-[#1a1a1a] dark:text-[#F5EBE1] font-ui cursor-pointer">
      <input type="checkbox" checked={lead[key]} onChange={(e) => set({ [key]: e.target.checked })} className="w-4 h-4 accent-[#E8610A]" />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="w-full max-w-2xl bg-white dark:bg-[#1C1814] rounded-2xl border border-[#F5C9A8] dark:border-[#3D2E22] shadow-xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F5C9A8]/40 dark:border-[#2E2721]">
          <h2 className="text-base font-bold text-[#1a1a1a] dark:text-[#F5EBE1] font-heading">{lead.id ? 'Editar lead' : 'Nuevo lead'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[#666] hover:text-[#E8610A] cursor-pointer" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Nombre</label><input className={inputCls} value={lead.nombre} onChange={(e) => set({ nombre: e.target.value })} autoFocus /></div>
          <div><label className={labelCls}>Empresa / negocio</label><input className={inputCls} value={lead.negocio} onChange={(e) => set({ negocio: e.target.value })} /></div>
          <div><label className={labelCls}>Contacto (email, tel, @)</label><input className={inputCls} value={lead.contacto} onChange={(e) => set({ contacto: e.target.value })} /></div>
          <div>
            <label className={labelCls}>Oferta de interés</label>
            <input className={inputCls} list="ofertas" value={lead.oferta} onChange={(e) => set({ oferta: e.target.value })} />
            <datalist id="ofertas">{activeOffers.map((o) => <option key={o} value={o} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>Estado comercial</label>
            <select className={inputCls} value={lead.estado} onChange={(e) => set({ estado: e.target.value as LeadEstado })}>
              {(Object.keys(ESTADO_LABELS) as LeadEstado[]).map((k) => <option key={k} value={k}>{ESTADO_LABELS[k]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Última interacción</label>
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={lead.ultimaInteraccion} onChange={(e) => set({ ultimaInteraccion: e.target.value })} />
              <button type="button" onClick={() => set({ ultimaInteraccion: today })} className="px-2.5 rounded-lg text-xs font-semibold border border-[#F5C9A8] dark:border-[#3D2E22] hover:border-[#E8610A] cursor-pointer">Hoy</button>
            </div>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 py-1">
            {check('pidioPrecio', 'Pidió precio')}
            {check('pidioDemo', 'Pidió demo')}
            {check('intencionExplicita', 'Intención clara de compra')}
          </div>
          <div><label className={labelCls}>Próxima acción</label><input className={inputCls} value={lead.proximaAccion} onChange={(e) => set({ proximaAccion: e.target.value })} /></div>
          <div><label className={labelCls}>Fecha próxima acción</label><input type="date" className={inputCls} value={lead.fechaProximaAccion} onChange={(e) => set({ fechaProximaAccion: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Notas</label><textarea rows={3} className={inputCls} value={lead.notas} onChange={(e) => set({ notas: e.target.value })} /></div>
          {error && <p className="sm:col-span-2 text-sm text-rose-600 font-ui">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#F5C9A8]/40 dark:border-[#2E2721]">
          {lead.id && onDelete ? (
            <button type="button" disabled={saving} onClick={remove} className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? '¿Seguro? Tocá de nuevo' : 'Borrar'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold border border-[#F5C9A8] dark:border-[#3D2E22] cursor-pointer">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#E8610A] hover:bg-[#C4500A] text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
