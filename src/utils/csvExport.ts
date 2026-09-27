import { ESTADO_LABELS, Lead } from '../types';

/** Descarga los leads visibles como CSV (Excel en español lo abre bien por el BOM). */
export function exportLeadsToCSV(leads: Lead[]): boolean {
  if (!leads.length) return false;
  const headers = ['Nombre', 'Negocio', 'Contacto', 'Oferta', 'Estado', 'Prioridad', 'Puntaje', 'Motivo', 'Última interacción', 'Próxima acción', 'Fecha próxima acción', 'Notas'];
  const rows = leads.map((l) =>
    [
      l.nombre, l.negocio, l.contacto, l.oferta, ESTADO_LABELS[l.estado] || l.estado,
      l.scoring.prioridad || 'Cerrado', String(l.scoring.score), l.scoring.motivos.join('; '),
      l.ultimaInteraccion, l.proximaAccion, l.fechaProximaAccion, l.notas,
    ].map(escape).join(','),
  );
  const csv = '﻿' + [headers.map(escape).join(','), ...rows].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function escape(value: string): string {
  return `"${String(value ?? '').trim().replace(/"/g, '""')}"`;
}
